import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Student } from '../entities/Student';
import { StudentTransfer, TransferType } from '../entities/StudentTransfer';
import { Class } from '../entities/Class';
import { AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/User';
import { Settings } from '../entities/Settings';
import { parsePaginationParams, buildPaginationResponse } from '../utils/pagination';

/**
 * Initiate a student transfer (internal or external)
 */
export const initiateTransfer = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { studentId, transferType, newClassId, destinationSchool, reason, effectiveDate, notes } = req.body;

    // Validate required fields
    if (!studentId) {
      return res.status(400).json({ message: 'Student ID is required' });
    }

    if (!transferType || !['internal', 'external'].includes(transferType)) {
      return res.status(400).json({ message: 'Valid transfer type (internal or external) is required' });
    }

    const studentRepository = AppDataSource.getRepository(Student);
    const transferRepository = AppDataSource.getRepository(StudentTransfer);
    const classRepository = AppDataSource.getRepository(Class);

    // Find student with current class
    const student = await studentRepository.findOne({
      where: { id: studentId },
      relations: ['classEntity']
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Validate transfer type specific requirements
    if (transferType === TransferType.INTERNAL) {
      if (!newClassId) {
        return res.status(400).json({ message: 'New class ID is required for internal transfer' });
      }

      if (student.classId === newClassId) {
        return res.status(400).json({ message: 'Student is already in the selected class' });
      }

      // Verify new class exists
      const newClass = await classRepository.findOne({ where: { id: newClassId } });
      if (!newClass) {
        return res.status(404).json({ message: 'New class not found' });
      }

      if (!newClass.isActive) {
        return res.status(400).json({ message: 'Cannot transfer student to an inactive class' });
      }
    } else if (transferType === TransferType.EXTERNAL) {
      if (!destinationSchool || !destinationSchool.trim()) {
        return res.status(400).json({ message: 'Destination school name is required for external transfer' });
      }
    }

    // Parse effective date
    let parsedEffectiveDate: Date | null = null;
    if (effectiveDate) {
      parsedEffectiveDate = new Date(effectiveDate);
      if (isNaN(parsedEffectiveDate.getTime())) {
        return res.status(400).json({ message: 'Invalid effective date format' });
      }
    } else {
      // Default to today if not provided
      parsedEffectiveDate = new Date();
    }

    // Get current class before transfer
    const previousClassId = student.classId;

    // Get current school name from settings for external transfers
    let fromSchoolName: string | null = null;
    let toSchoolName: string | null = null;
    if (transferType === TransferType.EXTERNAL) {
      const settingsRepository = AppDataSource.getRepository(Settings);
      const settings = await settingsRepository.findOne({
        where: {},
        order: { createdAt: 'DESC' }
      });
      fromSchoolName = settings?.schoolName || 'Current School';
      toSchoolName = destinationSchool?.trim() || null;
    }

    // Create transfer record
    const transfer = transferRepository.create({
      studentId: student.id,
      transferType: transferType as TransferType,
      previousClassId,
      newClassId: transferType === TransferType.INTERNAL ? newClassId : null,
      destinationSchool: transferType === TransferType.EXTERNAL ? destinationSchool.trim() : null,
      fromSchoolName,
      toSchoolName,
      reason: reason?.trim() || null,
      effectiveDate: parsedEffectiveDate,
      processedByUserId: req.user!.id,
      notes: notes?.trim() || null,
      transferDate: new Date()
    });

    await transferRepository.save(transfer);

    // Update student based on transfer type
    if (transferType === TransferType.INTERNAL) {
      // Update student's class
      student.classId = newClassId;
      await studentRepository.save(student);
      console.log(`[Transfer] Student ${student.studentNumber} transferred from class ${previousClassId} to ${newClassId}`);
    } else if (transferType === TransferType.EXTERNAL) {
      // Mark student as inactive (transferred out)
      student.isActive = false;
      student.classId = null; // Remove from current class
      await studentRepository.save(student);
      console.log(`[Transfer] Student ${student.studentNumber} transferred out to ${destinationSchool}`);
    }

    // Load transfer with relations for response
    const savedTransfer = await transferRepository.findOne({
      where: { id: transfer.id },
      relations: ['student', 'previousClass', 'newClass', 'processedBy']
    });

    res.status(201).json({
      message: transferType === TransferType.INTERNAL 
        ? 'Student transferred successfully' 
        : 'Student transfer out recorded successfully',
      transfer: savedTransfer
    });
  } catch (error: any) {
    console.error('[Transfer] Error initiating transfer:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message || 'Unknown error'
    });
  }
};

/**
 * Get transfer history for a specific student
 */
export const getStudentTransferHistory = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { studentId } = req.params;

    const transferRepository = AppDataSource.getRepository(StudentTransfer);

    const transfers = await transferRepository.find({
      where: { studentId },
      relations: ['previousClass', 'newClass', 'processedBy', 'student'],
      order: { transferDate: 'DESC' }
    });

    res.json(transfers);
  } catch (error: any) {
    console.error('[Transfer] Error fetching student transfer history:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message || 'Unknown error'
    });
  }
};

/**
 * Get all transfers with optional filters and pagination
 */
export const getAllTransfers = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { transferType, classId, startDate, endDate, studentId, studentName } = req.query;
    const pagination = parsePaginationParams(req.query, 20);

    const transferRepository = AppDataSource.getRepository(StudentTransfer);
    const queryBuilder = transferRepository
      .createQueryBuilder('transfer')
      .leftJoinAndSelect('transfer.student', 'student')
      .leftJoinAndSelect('transfer.previousClass', 'previousClass')
      .leftJoinAndSelect('transfer.newClass', 'newClass')
      .leftJoinAndSelect('transfer.processedBy', 'processedBy');

    // Apply filters
    if (transferType && (transferType === 'internal' || transferType === 'external')) {
      queryBuilder.andWhere('transfer.transferType = :transferType', { transferType });
    }

    if (classId) {
      queryBuilder.andWhere(
        '(transfer.previousClassId = :classId OR transfer.newClassId = :classId)',
        { classId }
      );
    }

    if (studentId) {
      queryBuilder.andWhere('transfer.studentId = :studentId', { studentId });
    }

    if (studentName) {
      queryBuilder.andWhere(
        '(LOWER(student.firstName) LIKE LOWER(:studentName) OR LOWER(student.lastName) LIKE LOWER(:studentName) OR LOWER(CONCAT(student.firstName, \' \', student.lastName)) LIKE LOWER(:studentName))',
        { studentName: `%${studentName}%` }
      );
    }

    if (startDate) {
      queryBuilder.andWhere('transfer.transferDate >= :startDate', { startDate });
    }

    if (endDate) {
      queryBuilder.andWhere('transfer.transferDate <= :endDate', { endDate });
    }

    queryBuilder.orderBy('transfer.transferDate', 'DESC');

    if (pagination.isPaginated) {
      const [transfers, total] = await queryBuilder
        .skip(pagination.skip)
        .take(pagination.limit)
        .getManyAndCount();

      return res.json(buildPaginationResponse(transfers, pagination.page, pagination.limit, total));
    }

    const transfers = await queryBuilder.getMany();
    res.json(transfers);
  } catch (error: any) {
    console.error('[Transfer] Error fetching all transfers:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message || 'Unknown error'
    });
  }
};

/**
 * Get transfer details by ID
 */
export const getTransferById = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;

    const transferRepository = AppDataSource.getRepository(StudentTransfer);
    const transfer = await transferRepository.findOne({
      where: { id },
      relations: ['student', 'previousClass', 'newClass', 'processedBy']
    });

    if (!transfer) {
      return res.status(404).json({ message: 'Transfer record not found' });
    }

    res.json(transfer);
  } catch (error: any) {
    console.error('[Transfer] Error fetching transfer:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message || 'Unknown error'
    });
  }
};

