import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Student } from '../entities/Student';
import { User, UserRole } from '../entities/User';
import { Class } from '../entities/Class';
import { Teacher } from '../entities/Teacher';
import { StudentEnrollment } from '../entities/StudentEnrollment';
import { Marks } from '../entities/Marks';
import { Invoice, InvoiceStatus } from '../entities/Invoice';
import { ReportCardRemarks } from '../entities/ReportCardRemarks';
import { Parent } from '../entities/Parent';
import { AuthRequest } from '../middleware/auth';
import { persistStudentUserLink } from './auth.controller';
import { generateStudentId } from '../utils/studentIdGenerator';
import { Settings } from '../entities/Settings';
import { PromotionRule } from '../entities/PromotionRule';
import QRCode from 'qrcode';
import { createStudentIdCardPDF, createClassStudentIdCardsPDF } from '../utils/studentIdCardPdf';
import { isDemoUser } from '../utils/demoDataFilter';
import { parseAmount, generateInvoiceNumber, roundMoney } from '../utils/numberUtils';
import { invoicesIncludeTerm } from '../utils/termMatch';
import { computeOpeningInvoiceBundle } from '../utils/openingInvoiceCompute';
import { calculateAge } from '../utils/ageUtils';
import { In } from 'typeorm';
import { buildPaginationResponse, parsePaginationParams } from '../utils/pagination';
import { getTermBalanceForStudent } from '../utils/termBalance';
import {
  buildSubjectPositionLookup,
  subjectPositionLookupKey,
} from '../utils/reportCardSubjectRankings';
import { computeStudentOverallPercentForTerm } from '../utils/promotionEligibility';
import { ExamType } from '../entities/Exam';
import { getGradeInfoFromSettings, getGradeLabelOnly } from '../utils/gradeBandsResolve';
import { createClassListPDF } from '../utils/classListPdfGenerator';

/** Current logged-in student's profile (for dashboard display name). */
export const getCurrentStudent = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Not authenticated' });
    }
    const role = req.user.role as string;
    if (role !== UserRole.STUDENT && role !== 'student') {
      return res.status(403).json({ message: 'Only students can access this endpoint' });
    }
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    const studentRepo = AppDataSource.getRepository(Student);
    const userRepo = AppDataSource.getRepository(User);
    const user = req.user;
    const recordId = req.authStudentRecordId;

    let student: Student | null = null;

    if (recordId) {
      student = await studentRepo.findOne({
        where: { id: recordId, userId: user.id },
        relations: ['classEntity', 'parent']
      });
    }

    const uname = (user.username || '').trim();
    if (!student && uname) {
      student = await studentRepo.findOne({
        where: { userId: user.id, studentNumber: uname },
        relations: ['classEntity', 'parent']
      });
    }

    if (!student && uname) {
      const byNum = await studentRepo.findOne({
        where: { studentNumber: uname },
        relations: ['classEntity', 'parent']
      });
      if (byNum) {
        if (byNum.userId !== user.id) {
          await persistStudentUserLink(studentRepo, userRepo, user as User, byNum);
          student = await studentRepo.findOne({
            where: { id: byNum.id },
            relations: ['classEntity', 'parent']
          });
        } else {
          student = byNum;
        }
      }
    }

    if (!student) {
      student = await studentRepo.findOne({
        where: { userId: user.id },
        relations: ['classEntity', 'parent']
      });
    }
    if (!student) {
      return res.status(404).json({ message: 'Student profile not found' });
    }
    const fullName = `${student.firstName} ${student.lastName}`.trim();
    res.json({
      ...student,
      fullName
    });
  } catch (error: any) {
    console.error('[getCurrentStudent]', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const registerStudent = async (req: AuthRequest, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const parseBoolean = (value: any): boolean => {
      if (typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'y'].includes(normalized)) {
          return true;
        }
        if (['false', '0', 'no', 'n', ''].includes(normalized)) {
          return false;
        }
      }
      return Boolean(value);
    };

    const {
      firstName,
      lastName,
      nationalId,
      dateOfBirth,
      gender,
      address,
      phoneNumber,
      contactNumber,
      email,
      dateOfJoining,
      previousSchool,
      studentType,
      usesTransport,
      usesDiningHall,
      isStaffChild,
      classId,
      parentId,
    } = req.body;
    
    // Validate required fields
    if (!firstName || !lastName) {
      return res.status(400).json({ message: 'First name and last name are required' });
    }

    if (!dateOfBirth) {
      return res.status(400).json({ message: 'Date of birth is required' });
    }

    if (!gender) {
      return res.status(400).json({ message: 'Gender is required' });
    }

    if (!contactNumber && !phoneNumber) {
      return res.status(400).json({ message: 'Contact number is required' });
    }

    const studentRepository = AppDataSource.getRepository(Student);
    const classRepository = AppDataSource.getRepository(Class);
    const settingsRepository = AppDataSource.getRepository(Settings);
    const invoiceRepository = AppDataSource.getRepository(Invoice);

    // Verify class exists if provided (optional for registration)
    let classEntity = null;
    if (classId) {
      classEntity = await classRepository.findOne({ where: { id: classId } });
      if (!classEntity) {
        return res.status(404).json({ message: 'Class not found' });
      }
    }

    if (parentId) {
      const parent = await AppDataSource.getRepository(Parent).findOne({ where: { id: parentId } });
      if (!parent) {
        return res.status(404).json({ message: 'Parent not found' });
      }
    }

    // Generate unique student ID with prefix from settings
    const studentNumber = await generateStudentId();

    // Parse dateOfBirth if it's a string
    let parsedDateOfBirth: Date;
    if (typeof dateOfBirth === 'string') {
      parsedDateOfBirth = new Date(dateOfBirth);
      if (isNaN(parsedDateOfBirth.getTime())) {
        return res.status(400).json({ message: 'Invalid date of birth format' });
      }
    } else {
      parsedDateOfBirth = dateOfBirth;
    }

    let parsedDateOfJoining: Date | null = null;
    if (dateOfJoining !== undefined && dateOfJoining !== null && String(dateOfJoining).trim() !== '') {
      if (typeof dateOfJoining === 'string') {
        const dj = new Date(dateOfJoining);
        if (isNaN(dj.getTime())) {
          return res.status(400).json({ message: 'Invalid date of joining format' });
        }
        parsedDateOfJoining = dj;
      } else {
        parsedDateOfJoining = dateOfJoining as Date;
      }
    }

    const studentAge = calculateAge(parsedDateOfBirth);
    if (studentAge < 11 || studentAge > 20) {
      return res.status(400).json({ message: 'Student age must be between 11 and 20 years' });
    }

    // Use contactNumber if provided, otherwise fall back to phoneNumber
    const finalContactNumber = contactNumber?.trim() || phoneNumber?.trim() || null;
    
    // Validate studentType
    const normalizedStudentType = typeof studentType === 'string' ? studentType.trim().toLowerCase() : '';
    const validStudentType = normalizedStudentType === 'boarder' ? 'Boarder' : 'Day Scholar';

    // Handle photo upload
    let photoPath: string | null = null;
    if (req.file) {
      photoPath = `/uploads/students/${req.file.filename}`;
    }

    const usesTransportFlag = parseBoolean(usesTransport);
    const usesDiningHallFlag = parseBoolean(usesDiningHall);
    const isStaffChildFlag = parseBoolean(isStaffChild);

    // Create student - classId is optional (can be enrolled later)
    const student = studentRepository.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      nationalId: nationalId ? String(nationalId).trim() || null : null,
      studentNumber,
      dateOfBirth: parsedDateOfBirth,
      gender,
      address: address?.trim() || null,
      phoneNumber: finalContactNumber,
      contactNumber: finalContactNumber,
      email: email ? String(email).trim() || null : null,
      dateOfJoining: parsedDateOfJoining,
      previousSchool: previousSchool ? String(previousSchool).trim() || null : null,
      studentType: validStudentType,
      usesTransport: usesTransportFlag,
      usesDiningHall: usesDiningHallFlag,
      isStaffChild: isStaffChildFlag,
      photo: photoPath,
      classId: classId || null, // Optional - can be enrolled later
      parentId: parentId || null,
      enrollmentStatus: classId ? 'Enrolled' : 'Not Enrolled' // Set status based on enrollment
    });

    await studentRepository.save(student);

    // Load the student with class relation
    const savedStudent = await studentRepository.findOne({
      where: { id: student.id },
      relations: ['classEntity', 'parent']
    });

    // Initial invoice for every new registration: tuition + desk + registration (staff exempt).
    // All catalog → settings → managed-fallback logic lives in computeOpeningInvoiceBundle so
    // the same numbers are produced by registration, enrollment, and the rebuild endpoint.
    try {
      const settings = await settingsRepository.findOne({
        where: {},
        order: { createdAt: 'DESC' },
      });

      if (!settings) {
        console.warn('⚠️ No school settings — registration invoice not created');
      } else {
        const studentForInvoice = (savedStudent ?? student) as any;
        const bundle = await computeOpeningInvoiceBundle(AppDataSource, studentForInvoice);
        console.log('💰 Registration invoice bundle:', {
          source: bundle.source,
          total: bundle.total,
          items: bundle.lineDescriptions,
        });

        if (bundle.total > 0.005) {
          const registrationTerm =
            settings.currentTerm || (settings as any).activeTerm || `Term 1 ${new Date().getFullYear()}`;
          const existingForStudent = await invoiceRepository.find({
            where: { studentId: savedStudent?.id || student.id },
          });
          if (invoicesIncludeTerm(existingForStudent, registrationTerm)) {
            console.warn(
              '⚠️ Registration invoice skipped — an invoice for this term already exists:',
              registrationTerm
            );
          } else {
            const lineSum = bundle.feeLineItems.reduce(
              (s, row) => s + roundMoney(parseAmount((row as any).amount)),
              0
            );
            const amountValue = lineSum > 0.005 ? roundMoney(lineSum) : roundMoney(bundle.total);

            const invoiceNumber = generateInvoiceNumber();
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 30);

            const description =
              bundle.lineDescriptions.length > 0
                ? `New student registration: ${bundle.lineDescriptions.join(', ')}`
                : 'New student registration';

            const studentIdForInvoice = savedStudent?.id || student.id;

            const initialInvoice = invoiceRepository.create({
              invoiceNumber,
              studentId: studentIdForInvoice,
              amount: amountValue,
              previousBalance: 0,
              paidAmount: 0,
              balance: amountValue,
              prepaidAmount: 0,
              uniformTotal: 0,
              dueDate,
              term: registrationTerm,
              description,
              status: InvoiceStatus.PENDING,
              feeLineItems: bundle.feeLineItems,
              uniformItems: [],
            });

            await invoiceRepository.save(initialInvoice);
            console.log('✅ Registration invoice created:', invoiceNumber, 'Amount:', amountValue);
          }
        } else if (!isStaffChildFlag) {
          console.warn(
            '⚠️ Registration invoice total is 0 — set Tuition / Desk Fee / Registration Fee on the Finance page (or as a fallback in Settings → School Fees)'
          );
        } else {
          console.log('ℹ️ Staff child — no tuition/desk/registration; invoice only if DH applies');
        }
      }
    } catch (invoiceError) {
      console.error('❌ Error creating registration invoice:', invoiceError);
    }

    const message = classId 
      ? 'Student registered and enrolled successfully' 
      : 'Student registered successfully. Please enroll them into a class.';
    
    res.status(201).json({ 
      message,
      student: savedStudent 
    });
  } catch (error: any) {
    console.error('Error registering student:', error);
    
    // Handle specific database errors
    if (error.code === '23505') {
      return res.status(400).json({ message: 'Student number already exists' });
    }
    
    if (error.code === '23503') {
      return res.status(400).json({ message: 'Invalid class or parent reference' });
    }

    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const getStudents = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const studentRepository = AppDataSource.getRepository(Student);
    const { classId, enrollmentStatus } = req.query;
    const searchQuery = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const genderFilter = typeof req.query.gender === 'string' ? req.query.gender.trim().toLowerCase() : '';
    const studentTypeFilter = typeof req.query.studentType === 'string' ? req.query.studentType.trim().toLowerCase() : '';
    const pagination = parsePaginationParams(req.query);

    const queryBuilder = studentRepository
      .createQueryBuilder('student')
      .leftJoinAndSelect('student.parent', 'parent')
      .leftJoinAndSelect('student.user', 'user')
      .leftJoinAndSelect('student.enrollments', 'enrollments')
      .leftJoinAndSelect('student.classEntity', 'classEntity')
      .orderBy('student.firstName', 'ASC')
      .addOrderBy('student.lastName', 'ASC');
    /* NOTE: .distinct(true) was removed — TypeORM 0.3.x has a bug where
     * distinct(true) + getManyAndCount() generates broken COUNT SQL.
     * leftJoinAndSelect already deduplicates entities by primary key on hydration. */

    if (classId) {
      const trimmedClassId = String(classId).trim();
      queryBuilder.andWhere(
        '(student.classId = :classId OR classEntity.id = :classId OR enrollments.classId = :classId)',
        { classId: trimmedClassId }
      );
    }

    const transferredOutStatus = 'Transferred Out';
    if (enrollmentStatus) {
      const status = String(enrollmentStatus).trim();
      queryBuilder.andWhere('student.enrollmentStatus = :status', { status });
    } else {
      queryBuilder.andWhere(
        '(student.enrollmentStatus IS NULL OR student.enrollmentStatus != :transferredOut)',
        { transferredOut: transferredOutStatus }
      );
    }

    queryBuilder.andWhere('student.isActive IS DISTINCT FROM false');

    if (genderFilter) {
      queryBuilder.andWhere('LOWER(student.gender) = :gender', { gender: genderFilter });
    }

    if (studentTypeFilter) {
      queryBuilder.andWhere('LOWER(student.studentType) = :studentType', { studentType: studentTypeFilter });
    }

    if (searchQuery) {
      queryBuilder.andWhere(
        `(
          LOWER(student.firstName) LIKE :search OR
          LOWER(student.lastName) LIKE :search OR
          LOWER(CONCAT(student.firstName, ' ', student.lastName)) LIKE :search OR
          LOWER(student.studentNumber) LIKE :search OR
          LOWER(student.contactNumber) LIKE :search OR
          LOWER(student.phoneNumber) LIKE :search
        )`,
        { search: `%${searchQuery}%` }
      );
    }

    if (pagination.isPaginated) {
      /* Use separate count + fetch to sidestep TypeORM 0.3.x getManyAndCount bugs
       * with complex LEFT JOINs. getCount() does not apply TAKE/SKIP so it counts all. */
      const total = await queryBuilder.getCount();
      const students = await queryBuilder
        .skip(pagination.skip)
        .take(pagination.limit)
        .getMany();

      return res.json(
        buildPaginationResponse(students, pagination.page, pagination.limit, total)
      );
    }

    const students = await queryBuilder.getMany();
    res.json(students);
  } catch (error: any) {
    console.error('Error fetching students:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message || 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const getStudentById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const studentRepository = AppDataSource.getRepository(Student);

    const student = await studentRepository.findOne({
      where: { id },
      relations: ['classEntity', 'parent', 'user', 'marks', 'invoices']
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.json(student);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

// Enrollment is now handled by the enrollment controller at /api/enrollments
// This function is kept for backward compatibility but should use the enrollment controller
export const enrollStudent = async (req: AuthRequest, res: Response) => {
  try {
    // Redirect to enrollment controller logic
    const enrollmentController = await import('./enrollment.controller');
    return enrollmentController.enrollStudent(req, res);
  } catch (error: any) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const updateStudent = async (req: AuthRequest, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    const {
      firstName,
      lastName,
      nationalId,
      dateOfBirth,
      gender,
      address,
      phoneNumber,
      contactNumber,
      email,
      dateOfJoining,
      previousSchool,
      studentType,
      usesTransport,
      usesDiningHall,
      isStaffChild,
      classId,
      parentId,
      photo
    } = req.body;

    console.log('Updating student with ID:', id);
    console.log('Received update data:', req.body);

    const studentRepository = AppDataSource.getRepository(Student);
    const classRepository = AppDataSource.getRepository(Class);
    const parentRepository = AppDataSource.getRepository(Parent);

    const student = await studentRepository.findOne({ 
      where: { id },
      relations: ['classEntity']
    });

    if (!student) {
      console.log('Student not found with ID:', id);
      return res.status(404).json({ message: 'Student not found' });
    }

    console.log('Found student:', student.firstName, student.lastName);

    // Update firstName
    if (firstName !== undefined && firstName !== null) {
      student.firstName = String(firstName).trim();
    }

    // Update lastName
    if (lastName !== undefined && lastName !== null) {
      student.lastName = String(lastName).trim();
    }

    // Update dateOfBirth
    if (dateOfBirth !== undefined && dateOfBirth !== null) {
      let parsedDate: Date;
      if (typeof dateOfBirth === 'string') {
        // Handle HTML date input format (YYYY-MM-DD)
        if (dateOfBirth.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const [year, month, day] = dateOfBirth.split('-').map(Number);
          parsedDate = new Date(year, month - 1, day);
        } else {
          parsedDate = new Date(dateOfBirth);
        }
        
        if (!isNaN(parsedDate.getTime())) {
          student.dateOfBirth = parsedDate;
        } else {
          console.error('Invalid date format:', dateOfBirth);
          return res.status(400).json({ message: 'Invalid date of birth format' });
        }
      } else if (dateOfBirth instanceof Date) {
        student.dateOfBirth = dateOfBirth;
      }
    }

    // Update gender
    if (gender !== undefined && gender !== null) {
      student.gender = String(gender).trim();
    }

    if (nationalId !== undefined) {
      student.nationalId = nationalId ? String(nationalId).trim() || null : null;
    }

    if (email !== undefined) {
      student.email = email ? String(email).trim() || null : null;
    }

    if (dateOfJoining !== undefined) {
      if (dateOfJoining === null || dateOfJoining === '') {
        student.dateOfJoining = null;
      } else if (typeof dateOfJoining === 'string' && dateOfJoining.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [y, m, d] = dateOfJoining.split('-').map(Number);
        student.dateOfJoining = new Date(y, m - 1, d);
      } else {
        const dj = new Date(dateOfJoining);
        student.dateOfJoining = isNaN(dj.getTime()) ? student.dateOfJoining : dj;
      }
    }

    if (previousSchool !== undefined) {
      student.previousSchool = previousSchool ? String(previousSchool).trim() || null : null;
    }

    // Update address
    if (address !== undefined) {
      student.address = address ? String(address).trim() : null;
    }

    // Handle contact number - use contactNumber if provided, otherwise phoneNumber
    if (contactNumber !== undefined || phoneNumber !== undefined) {
      const finalContactNumber = contactNumber?.trim() || phoneNumber?.trim() || null;
      student.contactNumber = finalContactNumber;
      student.phoneNumber = finalContactNumber;
    }

    // Handle student type validation
    if (studentType !== undefined && studentType !== null) {
      const normalizedStudentType = typeof studentType === 'string' ? studentType.trim().toLowerCase() : '';
      const validStudentType = normalizedStudentType === 'boarder' ? 'Boarder' : 'Day Scholar';
      student.studentType = validStudentType;
    }

    // Update transport usage (only for day scholars)
    if (usesTransport !== undefined) {
      student.usesTransport = Boolean(usesTransport);
    }

    // Update dining hall usage (only for day scholars)
    if (usesDiningHall !== undefined) {
      student.usesDiningHall = Boolean(usesDiningHall);
    }

    // Update staff child status
    if (isStaffChild !== undefined) {
      student.isStaffChild = Boolean(isStaffChild);
    }

    // Handle photo upload or update
    if (req.file) {
      // New photo uploaded - delete old photo if exists
      if (student.photo) {
        const fs = require('fs');
        const path = require('path');
        const oldPhotoPath = path.join(__dirname, '../../../', student.photo.replace(/^\//, ''));
        try {
          if (fs.existsSync(oldPhotoPath)) {
            fs.unlinkSync(oldPhotoPath);
          }
        } catch (err) {
          console.error('Error deleting old photo:', err);
        }
      }
      // Set new photo path
      student.photo = `/uploads/students/${req.file.filename}`;
    } else if (photo !== undefined) {
      // Photo path provided (preserve existing or set to null)
      student.photo = photo || null;
    }

    // Update classId if provided (always update if classId is in the request, even if it's the same)
    if (classId !== undefined) {
      if (classId === null || classId === '') {
        // Allow setting classId to null/empty if explicitly provided
        student.classId = null;
        // Don't set student.classEntity = null as it's not nullable in TypeScript
        // TypeORM will handle the relation based on classId
        console.log('Removing student from class');
      } else {
        // Verify class exists
        const trimmedClassId = String(classId).trim();
        const classEntity = await classRepository.findOne({ where: { id: trimmedClassId } });
        if (!classEntity) {
          console.error('Class not found with ID:', trimmedClassId);
          return res.status(404).json({ message: 'Class not found' });
        }
        const oldClassId = student.classId;
        const oldClassName = student.classEntity?.name || 'N/A';
        
        // Update both classId and the classEntity relation to ensure consistency
        student.classId = trimmedClassId;
        student.classEntity = classEntity; // Explicitly set the relation
        
        console.log('Updating student class from', oldClassName, '(ID: ' + oldClassId + ') to:', classEntity.name, '(ID: ' + trimmedClassId + ')');
        console.log('Setting student.classEntity relation to:', classEntity.name);
      }
    }

    // Update parentId if provided
    if (parentId !== undefined) {
      if (parentId) {
        const parent = await parentRepository.findOne({ where: { id: parentId } });
        if (!parent) {
          return res.status(404).json({ message: 'Parent not found' });
        }
      }
      student.parentId = parentId || null;
    }

    console.log('Saving updated student...');
    console.log('Student classId before save:', student.classId);
    console.log('Student classEntity relation before save:', student.classEntity?.name || 'null');
    
    // Save the student - this should update both classId and the relation
    const savedStudent = await studentRepository.save(student);
    console.log('Student classId after save:', savedStudent.classId);
    console.log('Student classEntity relation after save:', savedStudent.classEntity?.name || 'null');

    // Use update query to ensure classId is definitely updated in the database
    if (classId !== undefined && classId !== null && classId !== '') {
      const trimmedClassId = String(classId).trim();
       await studentRepository.update({ id }, { classId: trimmedClassId });
      console.log('Explicitly updated classId via update query:', trimmedClassId);
    }

    // Reload student with relations to get fresh data from database
    const updatedStudent = await studentRepository.findOne({
      where: { id },
      relations: ['classEntity', 'parent']
    });

    if (!updatedStudent) {
      console.error('Failed to reload student after update');
      return res.status(500).json({ message: 'Failed to reload student after update' });
    }

    console.log('Student updated successfully');
    console.log('Updated student classId:', updatedStudent.classId);
    console.log('Updated student classEntity name:', updatedStudent.classEntity?.name || 'N/A');
    console.log('Updated student classEntity id:', updatedStudent.classEntity?.id || 'N/A');
    
    res.json({ message: 'Student updated successfully', student: updatedStudent });
  } catch (error: any) {
    console.error('Error updating student:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

export const promoteStudents = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { fromClassId, toClassId } = req.body;

    if (!fromClassId || !toClassId) {
      return res.status(400).json({ message: 'From class ID and to class ID are required' });
    }

    if (fromClassId === toClassId) {
      return res.status(400).json({ message: 'Cannot promote students to the same class' });
    }

    const studentRepository = AppDataSource.getRepository(Student);
    const classRepository = AppDataSource.getRepository(Class);

    // Verify both classes exist
    const fromClass = await classRepository.findOne({ where: { id: fromClassId } });
    const toClass = await classRepository.findOne({ where: { id: toClassId } });

    if (!fromClass) {
      return res.status(404).json({ message: 'Source class not found' });
    }

    if (!toClass) {
      return res.status(404).json({ message: 'Destination class not found' });
    }

    // Get all students in the source class
    const students = await studentRepository.find({
      where: { classId: fromClassId },
      relations: ['classEntity']
    });

    if (students.length === 0) {
      return res.status(400).json({ message: 'No students found in the source class' });
    }

    // Update all students to the new class
    let promotedCount = 0;
    for (const student of students) {
      student.classId = toClassId;
       await studentRepository.save(student);
      promotedCount++;
    }

    res.json({
      message: `Successfully promoted ${promotedCount} student(s) from ${fromClass.name} to ${toClass.name}`,
      promotedCount,
      fromClass: fromClass.name,
      toClass: toClass.name
    });
  } catch (error: any) {
    console.error('Error promoting students:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

/**
 * GET /students/promote/preview
 * Returns a dry-run of all active promotion rules showing student counts.
 */
export const getPromotePreview = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const promotionRuleRepo = AppDataSource.getRepository(PromotionRule);
    const studentRepo = AppDataSource.getRepository(Student);

    const rules = await promotionRuleRepo.find({
      where: { isActive: true },
      relations: ['fromClass', 'toClass'],
      order: { createdAt: 'ASC' },
    });

    const preview = await Promise.all(
      rules.map(async rule => {
        const count = await studentRepo.count({ where: { classId: rule.fromClassId } });
        return {
          ruleId: rule.id,
          fromClassId: rule.fromClassId,
          fromClassName: rule.fromClass?.name || '—',
          toClassId: rule.toClassId,
          toClassName: rule.toClass?.name || null,
          isFinalClass: rule.isFinalClass,
          studentCount: count,
        };
      })
    );

    res.json(preview);
  } catch (error: any) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * GET /students/promote/eligibility-overview
 * Year-end promotion: classes missing rules + per-student checks (optional min end-of-term % on rule).
 */
export const getPromotionEligibilityOverview = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const settingsRepo = AppDataSource.getRepository(Settings);
    const settingsList = await settingsRepo.find({ order: { createdAt: 'DESC' }, take: 1 });
    const settingsRow = settingsList[0] || null;
    const termFromSettings = String(settingsRow?.activeTerm || settingsRow?.currentTerm || '').trim();

    const classRepo = AppDataSource.getRepository(Class);
    const studentRepo = AppDataSource.getRepository(Student);
    const ruleRepo = AppDataSource.getRepository(PromotionRule);

    const rules = await ruleRepo.find({
      where: { isActive: true },
      relations: ['fromClass', 'toClass'],
    });

    const anyRuleNeedsMarksTerm = rules.some((r) => {
      if (r.isFinalClass || !r.toClassId) {
        return false;
      }
      if (r.minimumAveragePercent == null) {
        return false;
      }
      const n = Number(r.minimumAveragePercent);
      return Number.isFinite(n);
    });

    if (anyRuleNeedsMarksTerm && !termFromSettings) {
      return res.status(400).json({
        message:
          'Set an active term in Academic / System settings before running year-end promotion checks.',
        code: 'ACTIVE_TERM_REQUIRED_FOR_MIN_AVERAGE',
      });
    }

    const activeTerm = termFromSettings;

    const ruleByFromId = new Map(rules.map((r) => [r.fromClassId, r]));

    const allClasses = await classRepo.find();

    const students = await studentRepo.find({ relations: ['classEntity'] });
    const activeStudents = students.filter((s) => s.isActive !== false && s.classId);

    const classIdsWithStudents = new Set(activeStudents.map((s) => s.classId!));
    const classesMissingRules: { classId: string; className: string; studentCount: number }[] = [];

    for (const cid of classIdsWithStudents) {
      if (!ruleByFromId.has(cid)) {
        const c = allClasses.find((x) => x.id === cid);
        classesMissingRules.push({
          classId: cid,
          className: c?.name || 'Class',
          studentCount: activeStudents.filter((s) => s.classId === cid).length,
        });
      }
    }
    classesMissingRules.sort((a, b) => a.className.localeCompare(b.className));

    const studentRows: any[] = [];

    for (const s of activeStudents) {
      const rule = ruleByFromId.get(s.classId!);
      const hasPath = !!(rule && !rule.isFinalClass && rule.toClassId);

      let overallPercent: number | null = null;
      let eligible = true;
      const reasons: string[] = [];

      if (hasPath && rule) {
        const minPct =
          rule.minimumAveragePercent != null && Number.isFinite(Number(rule.minimumAveragePercent))
            ? Number(rule.minimumAveragePercent)
            : null;

        if (minPct != null) {
          overallPercent = await computeStudentOverallPercentForTerm(
            s.id,
            s.classId!,
            activeTerm,
            ExamType.END_TERM
          );
          if (overallPercent === null) {
            eligible = false;
            reasons.push(
              `Requires ≥${minPct}% end-of-term average for ${activeTerm} — no marks found`
            );
          } else if (overallPercent + 1e-6 < minPct) {
            eligible = false;
            reasons.push(
              `Requires ≥${minPct}% end-of-term average — got ${overallPercent.toFixed(1)}%`
            );
          }
        }
      }

      studentRows.push({
        studentId: s.id,
        classId: s.classId,
        studentNumber: s.studentNumber,
        firstName: s.firstName,
        lastName: s.lastName,
        className: s.classEntity?.name || '',
        hasPromotionPath: hasPath,
        overallPercent: overallPercent != null ? Math.round(overallPercent * 10) / 10 : null,
        eligible,
        reasons,
        minimumRequired:
          hasPath && rule && rule.minimumAveragePercent != null
            ? Number(rule.minimumAveragePercent)
            : null,
      });
    }

    res.json({
      activeTerm: activeTerm || null,
      examType: 'end_term',
      classesMissingRules,
      students: studentRows,
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * POST /students/promote-all
 * Runs all active promotion rules in one pass.
 */
export const promoteAllStudents = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();

    const promotionRuleRepo = AppDataSource.getRepository(PromotionRule);
    const studentRepo = AppDataSource.getRepository(Student);

    const rules = await promotionRuleRepo.find({
      where: { isActive: true },
      relations: ['fromClass', 'toClass'],
      order: { createdAt: 'ASC' },
    });

    const results: { fromClass: string; toClass: string | null; promoted: number; skipped: boolean }[] = [];

    for (const rule of rules) {
      if (rule.isFinalClass || !rule.toClassId) {
        results.push({
          fromClass: rule.fromClass?.name || rule.fromClassId,
          toClass: null,
          promoted: 0,
          skipped: true,
        });
        continue;
      }

      const students = await studentRepo.find({ where: { classId: rule.fromClassId } });
      for (const s of students) {
        s.classId = rule.toClassId;
        await studentRepo.save(s);
      }

      results.push({
        fromClass: rule.fromClass?.name || rule.fromClassId,
        toClass: rule.toClass?.name || rule.toClassId,
        promoted: students.length,
        skipped: false,
      });
    }

    const totalPromoted = results.reduce((n, r) => n + r.promoted, 0);
    res.json({
      message: `Promotion complete. ${totalPromoted} student(s) promoted across ${results.filter(r => !r.skipped).length} class(es).`,
      totalPromoted,
      results,
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const deleteStudent = async (req: AuthRequest, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    console.log('Attempting to delete student with ID:', id);

    const studentRepository = AppDataSource.getRepository(Student);
    const marksRepository = AppDataSource.getRepository(Marks);
    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const remarksRepository = AppDataSource.getRepository(ReportCardRemarks);
    const userRepository = AppDataSource.getRepository(User);

    const student = await studentRepository.findOne({
      where: { id },
      relations: ['marks', 'invoices', 'user', 'classEntity', 'parent']
    });

    if (!student) {
      console.log('Student not found with ID:', id);
      return res.status(404).json({ message: 'Student not found' });
    }

    console.log('Found student:', student.firstName, student.lastName, `(${student.studentNumber})`);

    // Delete all report card remarks associated with this student
    const remarks = await remarksRepository.find({
      where: { studentId: id }
    });
    
    if (remarks.length > 0) {
      console.log(`Deleting ${remarks.length} report card remarks associated with student`);
      await remarksRepository.remove(remarks);
    }

    // Delete all marks associated with this student
    const marks = await marksRepository.find({
      where: { studentId: id }
    });
    
    if (marks.length > 0) {
      console.log(`Deleting ${marks.length} marks associated with student`);
      await marksRepository.remove(marks);
    }

    // Delete all invoices associated with this student
    const invoices = await invoiceRepository.find({
      where: { studentId: id }
    });
    
    if (invoices.length > 0) {
      console.log(`Deleting ${invoices.length} invoices associated with student`);
      await invoiceRepository.remove(invoices);
    }

    // Delete associated user account if it exists
    if (student.userId) {
      const user = await userRepository.findOne({ where: { id: student.userId } });
      if (user) {
        console.log('Deleting associated user account');
        await userRepository.remove(user);
      }
    }

    // Delete the student
    console.log('Deleting student:', student.firstName, student.lastName);
    await studentRepository.remove(student);
    console.log('Student deleted successfully');

    res.json({ message: 'Student deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting student:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const generateStudentIdCard = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: 'Student ID is required' });
    }

    const studentRepository = AppDataSource.getRepository(Student);
    const settingsRepository = AppDataSource.getRepository(Settings);
    const parentRepository = AppDataSource.getRepository(Parent);

    const student = await studentRepository.findOne({
      where: { id },
      relations: ['classEntity', 'parent']
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Check permissions: SUPERADMIN, ADMIN, ACCOUNTANT, and TEACHER can view any student's ID card
    // PARENT can only view their own linked students' ID cards
    const allowedRoles = [UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.TEACHER];
    if (!allowedRoles.includes(user.role)) {
      if (user.role === UserRole.PARENT) {
        // Check if the student is linked to this parent
        const parent = await parentRepository.findOne({
          where: { userId: user.id }
        });

        if (!parent || student.parentId !== parent.id) {
          console.log(`Parent ${user.id} attempted to access student ${id} ID card but student is not linked`);
          return res.status(403).json({ message: 'You do not have permission to view this student\'s ID card' });
        }
      } else {
        console.log(`User ${user.id} with role ${user.role} attempted to access student ID card but lacks permission. Allowed roles: ${allowedRoles.join(', ')}`);
        return res.status(403).json({ 
          message: 'Insufficient permissions to view student ID cards. Required role: Admin, Super Admin, Accountant, or Teacher.',
          userRole: user.role,
          allowedRoles: allowedRoles
        });
      }
    }

    const settings = await settingsRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' }
    });

    const qrPayload = {
      studentId: student.id,
      studentNumber: student.studentNumber,
      name: `${student.firstName} ${student.lastName}`.trim(),
      class: student.classEntity?.name || null,
      studentType: student.studentType,
      issuedAt: new Date().toISOString()
    };

    const qrImageBuffer = await QRCode.toBuffer(JSON.stringify(qrPayload), {
      type: 'png',
      margin: 1,
      width: 256,
      errorCorrectionLevel: 'M'
    });

    const pdfBuffer = await createStudentIdCardPDF({
      student,
      settings: settings || null,
      qrImageBuffer,
      photoPath: student.photo
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${student.studentNumber || 'student'}-id-card.pdf"`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating student ID card:', error);
    return res.status(500).json({ message: 'Failed to generate student ID card' });
  }
};

/**
 * PDF bundle: one ID card per active student in a class (same layout as single /:id/id-card).
 * Query: download=1 → Content-Disposition attachment; omit/false → inline (browser viewer / print preview).
 */
export const generateClassStudentIdCardsPDF = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { classId } = req.params;
    const download =
      req.query.download === '1' ||
      req.query.download === 'true' ||
      String(req.query.download || '').toLowerCase() === 'yes';

    if (!classId) {
      return res.status(400).json({ message: 'Class ID is required' });
    }

    const allowedRoles = [
      UserRole.SUPERADMIN,
      UserRole.ADMIN,
      UserRole.ACCOUNTANT,
      UserRole.TEACHER,
      UserRole.DEMO_USER
    ];
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({
        message: 'Insufficient permissions to generate class ID cards.'
      });
    }

    const studentRepository = AppDataSource.getRepository(Student);
    const classRepository = AppDataSource.getRepository(Class);
    const settingsRepository = AppDataSource.getRepository(Settings);
    const teacherRepository = AppDataSource.getRepository(Teacher);

    const classEntity = await classRepository.findOne({ where: { id: classId } });
    if (!classEntity) {
      return res.status(404).json({ message: 'Class not found' });
    }

    if (user.role === UserRole.TEACHER) {
      if (!user.teacher?.id) {
        return res.status(403).json({ message: 'Teacher account is not linked to a staff profile.' });
      }
      const teacher = await teacherRepository.findOne({
        where: { id: user.teacher.id },
        relations: ['classes']
      });
      if (!teacher || !teacher.classes?.some((c) => c.id === classId)) {
        return res.status(403).json({ message: 'You are not assigned to this class' });
      }
    }

    const students = await studentRepository.find({
      where: {
        classId,
        isActive: true
      },
      relations: ['classEntity', 'parent'],
      order: { lastName: 'ASC', firstName: 'ASC' }
    });

    if (!students.length) {
      return res.status(404).json({ message: 'No active students in this class' });
    }

    const settings = await settingsRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' }
    });

    const items: {
      student: Student;
      settings: Settings | null;
      qrImageBuffer: Buffer;
      photoPath?: string | null;
    }[] = [];

    for (const student of students) {
      const qrPayload = {
        studentId: student.id,
        studentNumber: student.studentNumber,
        name: `${student.firstName} ${student.lastName}`.trim(),
        class: student.classEntity?.name || null,
        studentType: student.studentType,
        issuedAt: new Date().toISOString()
      };
      const qrImageBuffer = await QRCode.toBuffer(JSON.stringify(qrPayload), {
        type: 'png',
        margin: 1,
        width: 256,
        errorCorrectionLevel: 'M'
      });
      items.push({
        student,
        settings: settings || null,
        qrImageBuffer,
        photoPath: student.photo
      });
    }

    const pdfBuffer = await createClassStudentIdCardsPDF(items);

    const safeName = (classEntity.name || classEntity.form || 'class').replace(/[^a-zA-Z0-9-_]/g, '_');
    const fileName = `${safeName}-student-id-cards.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${fileName}"`);
    return res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Error generating class student ID cards PDF:', error);
    return res.status(500).json({ message: 'Failed to generate class ID cards PDF' });
  }
};

// Get DH Services Report - Students using dining hall
export const getDHServicesReport = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const studentRepository = AppDataSource.getRepository(Student);
    
    // Get only day scholar students who use dining hall (exclude boarders)
    const students = await studentRepository.find({
      where: {
        studentType: 'Day Scholar',
        usesDiningHall: true,
        isActive: true
      },
      relations: ['classEntity'],
      order: { lastName: 'ASC', firstName: 'ASC' }
    });

    // Format the report data
    const reportData = students.map(student => ({
      studentNumber: student.studentNumber,
      firstName: student.firstName,
      lastName: student.lastName,
      gender: student.gender,
      class: student.classEntity?.name || 'N/A',
      studentType: student.studentType,
      contactNumber: student.contactNumber || student.phoneNumber || 'N/A',
      isStaffChild: student.isStaffChild || false
    }));

    res.json({
      success: true,
      count: reportData.length,
      students: reportData
    });
  } catch (error) {
    console.error('Error fetching DH Services report:', error);
    res.status(500).json({ message: 'Failed to fetch DH Services report', error: error instanceof Error ? error.message : 'Unknown error' });
  }
};

// Get Transport Services Report - Students using school transport
export const getTransportServicesReport = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const studentRepository = AppDataSource.getRepository(Student);
    
    // Get only day scholar students who use transport (usesTransport = true)
    const students = await studentRepository.find({
      where: {
        studentType: 'Day Scholar',
        usesTransport: true,
        isActive: true
      },
      relations: ['classEntity'],
      order: { lastName: 'ASC', firstName: 'ASC' }
    });

    // Format the report data
    const reportData = students.map(student => ({
      studentNumber: student.studentNumber,
      firstName: student.firstName,
      lastName: student.lastName,
      gender: student.gender,
      class: student.classEntity?.name || 'N/A',
      studentType: student.studentType,
      contactNumber: student.contactNumber || student.phoneNumber || 'N/A',
      isStaffChild: student.isStaffChild || false
    }));

    res.json({
      success: true,
      count: reportData.length,
      students: reportData
    });
  } catch (error) {
    console.error('Error fetching Transport Services report:', error);
    res.status(500).json({ message: 'Failed to fetch Transport Services report', error: error instanceof Error ? error.message : 'Unknown error' });
  }
};

// Generate Class List PDF
export const generateClassListPDF = async (req: AuthRequest, res: Response) => {
  try {
    console.log('[generateClassListPDF] Route handler called');
    console.log('[generateClassListPDF] Query params:', req.query);
    
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { classId, term } = req.query;

    if (!classId || !term) {
      return res.status(400).json({ message: 'Class ID and term are required' });
    }

    const studentRepository = AppDataSource.getRepository(Student);
    const classRepository = AppDataSource.getRepository(Class);
    const settingsRepository = AppDataSource.getRepository(Settings);

    // Get class information
    const classEntity = await classRepository.findOne({
      where: { id: classId as string }
    });

    if (!classEntity) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // For teachers, verify they are assigned to this class
    const user = req.user;
    if (user?.role === 'teacher' && user?.teacher?.id) {
      const teacherRepository = AppDataSource.getRepository(Teacher);
      const teacher = await teacherRepository.findOne({
        where: { id: user.teacher.id },
        relations: ['classes']
      });

      if (!teacher || !teacher.classes?.some(c => c.id === classId)) {
        return res.status(403).json({ message: 'You are not assigned to this class' });
      }
    }

    // Get all enrolled students in the class
    const students = await studentRepository.find({
      where: {
        classId: classId as string,
        enrollmentStatus: 'Enrolled',
        isActive: true
      },
      order: { lastName: 'ASC', firstName: 'ASC' }
    });

    // Get settings for PDF header
    const settings = await settingsRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' }
    });

    // Format student data for PDF
    const studentData = students.map(student => ({
      studentNumber: student.studentNumber || '',
      firstName: student.firstName || '',
      lastName: student.lastName || '',
      gender: student.gender || '',
      dateOfBirth: student.dateOfBirth || '',
      studentType: student.studentType || '',
      contactNumber: student.contactNumber || student.phoneNumber || ''
    }));

    // Generate PDF
    const pdfBuffer = await createClassListPDF({
      class: {
        id: classEntity.id,
        name: classEntity.name,
        form: classEntity.form || ''
      },
      term: term as string,
      students: studentData,
      generatedAt: new Date()
    }, settings);

    res.setHeader('Content-Type', 'application/pdf');
    const fileName = `${classEntity.name.replace(/[^a-zA-Z0-9]/g, '_')}_${term}_ClassList.pdf`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Error generating class list PDF:', error);
    res.status(500).json({
      message: 'Failed to generate class list PDF',
      error: error.message || 'Unknown error'
    });
  }
};

// Get student's report card for active term
export const getStudentReportCard = async (req: AuthRequest, res: Response) => {
  try {
    console.log('[getStudentReportCard] Endpoint called');
    
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const user = req.user;
    if (!user) {
      console.error('[getStudentReportCard] No user in request');
      return res.status(401).json({ message: 'Authentication required' });
    }

    console.log('[getStudentReportCard] User authenticated:', { userId: user.id, role: user.role });

    // Check if user is a student
    if (user.role !== UserRole.STUDENT) {
      console.log('[getStudentReportCard] User role mismatch:', { userId: user.id, role: user.role });
      return res.status(403).json({ message: 'Access denied. Student access required.' });
    }

    // If user.student is not loaded, try to load it
    let studentId: string;
    const studentRepository = AppDataSource.getRepository(Student);
    
    if (!user.student) {
      console.log('[getStudentReportCard] Student relation not loaded, fetching from userId:', user.id);
      const student = await studentRepository.findOne({
        where: { userId: user.id }
      });
      if (!student) {
        return res.status(404).json({ message: 'Student record not found for this user' });
      }
      studentId = student.id;
    } else {
      studentId = user.student.id;
    }

    const student = await studentRepository.findOne({
      where: { id: studentId },
      relations: ['classEntity']
    });

    if (!student || !student.classId) {
      return res.status(404).json({ message: 'Student not found or not enrolled in a class' });
    }

    // Lock report card when term invoice balance > 0 (same rule as parents; excludes next-term fees)
    const termBalanceRc = await getTermBalanceForStudent(studentId);
    if (termBalanceRc > 0) {
      const settingsRepositoryEarly = AppDataSource.getRepository(Settings);
      const settingsListEarly = await settingsRepositoryEarly.find({
        order: { createdAt: 'DESC' },
        take: 1
      });
      const settingsEarly = settingsListEarly.length > 0 ? settingsListEarly[0] : null;
      const currencySymbolEarly = settingsEarly?.currencySymbol || '$';
      return res.status(403).json({
        message: `Report card access is restricted. Please clear the outstanding term balance of ${currencySymbolEarly} ${termBalanceRc.toFixed(2)} to view the report card.`,
        balance: termBalanceRc,
        code: 'TERM_BALANCE_LOCKED'
      });
    }

    // Get settings (for grades, school info, etc.)
    const settingsRepository = AppDataSource.getRepository(Settings);
    const settingsList = await settingsRepository.find({
      order: { createdAt: 'DESC' },
      take: 1
    });
    const settings = settingsList.length > 0 ? settingsList[0] : null;
    const activeTerm = settings?.activeTerm || settings?.currentTerm;
    
    if (!activeTerm) {
      console.error('[getStudentReportCard] Active term not set in settings');
      return res.status(400).json({ 
        message: 'Active term not set in settings. Please contact the administrator.' 
      });
    }
    
    console.log('[getStudentReportCard] Active term:', activeTerm);
    
    // Grade bands / thresholds resolved via getGradeInfoFromSettings(settings)

    // Get report card using exam controller logic
    // We'll use the existing getReportCard endpoint logic
    const { getReportCard } = await import('./exam.controller');
    
    // Create a mock request object for getReportCard
    const mockReq: any = {
      ...req,
      query: {
        classId: student.classId,
        examType: 'End of Term', // Default to End of Term
        term: activeTerm,
        studentId: studentId
      },
      user: user
    };

    // Call getReportCard and return the first report card (for this student)
    const { getReportCard: getReportCardFunc } = await import('./exam.controller');
    
    // Instead of calling directly, we'll fetch the data ourselves
    const { Exam } = await import('../entities/Exam');
    const { Marks } = await import('../entities/Marks');
    const { Subject } = await import('../entities/Subject');
    const { Class } = await import('../entities/Class');
    
    const examRepository = AppDataSource.getRepository(Exam);
    const marksRepository = AppDataSource.getRepository(Marks);
    const classRepository = AppDataSource.getRepository(Class);
    
    const classEntity = await classRepository.findOne({
      where: { id: student.classId },
      relations: ['subjects']
    });

    if (!classEntity) {
      return res.status(404).json({ message: 'Class not found' });
    }

    console.log('[getStudentReportCard] Class entity loaded:', {
      className: classEntity.name,
      subjectsCount: classEntity.subjects?.length || 0,
      subjects: classEntity.subjects?.map((s: any) => ({ name: s.name, code: s.code })) || []
    });

    // Get all End of Term exams for this class and term
    const { ExamType } = await import('../entities/Exam');
    const exams = await examRepository.find({
      where: { 
        classId: student.classId, 
        type: ExamType.END_TERM, 
        term: activeTerm 
      },
      relations: ['subjects']
    });

    if (exams.length === 0) {
      console.warn('[getStudentReportCard] No End of Term exams found:', {
        classId: student.classId,
        className: classEntity.name,
        term: activeTerm
      });
      // Return empty report card structure instead of 404
      return res.json({
        reportCard: {
          student: {
            id: student.id,
            studentNumber: student.studentNumber,
            firstName: student.firstName,
            lastName: student.lastName,
            class: classEntity.name,
            form: classEntity.form,
            classId: student.classId
          },
          term: activeTerm,
          examType: 'End of Term',
          subjects: [],
          totalScore: 0,
          totalMaxScore: 0,
          overallPercentage: null,
          remarks: {
            classTeacherRemarks: null,
            headmasterRemarks: null
          },
          settings: {
            schoolName: settings?.schoolName || null,
            schoolAddress: settings?.schoolAddress || null,
            schoolPhone: settings?.schoolPhone || null,
            academicYear: settings?.academicYear || null,
            schoolLogo: settings?.schoolLogo || null,
            schoolLogo2: settings?.schoolLogo2 || null
          }
        },
        class: classEntity.name,
        examType: 'End of Term',
        term: activeTerm
      });
    }

    // Get all marks for this student
    const allMarks = await marksRepository.find({
      where: { studentId: studentId },
      relations: ['subject', 'exam']
    }).catch(err => {
      console.error('[getStudentReportCard] Error fetching marks:', err);
      return [];
    });

    // Filter marks for this term's exams
    const examIds = exams.map(e => e.id);
    const studentMarks = allMarks.filter(m => examIds.includes(m.examId));

    // Calculate class averages for each subject
    // Get all marks for all students in the class for these exams
    const allClassMarks = await marksRepository.find({
      where: { examId: In(examIds) },
      relations: ['subject', 'student']
    });

    // Filter to only students in the same class
    const classMarks = allClassMarks.filter(m => m.student?.classId === student.classId);

    // Calculate class averages by subject
    const classAverages: { [key: string]: number } = {};
    const marksBySubject: { [key: string]: any[] } = {};

    // Group marks by subject
    classMarks.forEach(mark => {
      if (!mark.subject) return;
      const subjectName = mark.subject.name;
      if (!marksBySubject[subjectName]) {
        marksBySubject[subjectName] = [];
      }
      marksBySubject[subjectName].push(mark);
    });

    // Calculate average for each subject
    Object.keys(marksBySubject).forEach(subjectName => {
      const subjectMarks = marksBySubject[subjectName];
      const studentPercentages: number[] = [];
      const studentMarksMap: { [key: string]: { scores: number[]; maxScores: number[]; percentages: number[] } } = {};

      // Group by student
      subjectMarks.forEach(mark => {
        const sid = mark.studentId;
        if (!studentMarksMap[sid]) {
          studentMarksMap[sid] = { scores: [], maxScores: [], percentages: [] };
        }

        const hasScore = mark.score !== null && mark.score !== undefined;
        const hasUniformMark = mark.uniformMark !== null && mark.uniformMark !== undefined;

        if (hasScore || hasUniformMark) {
          const maxScore = mark.maxScore && mark.maxScore > 0 ? parseFloat(String(mark.maxScore)) : 100;
          if (!Number.isFinite(maxScore) || maxScore <= 0) return;

          if (hasUniformMark) {
            const uniformPct = parseFloat(String(mark.uniformMark));
            if (!Number.isFinite(uniformPct) || uniformPct < 0 || uniformPct > 100) return;
            const scoreFromUniform = (uniformPct / 100) * maxScore;
            studentMarksMap[sid].scores.push(scoreFromUniform);
            studentMarksMap[sid].maxScores.push(maxScore);
            studentMarksMap[sid].percentages.push(uniformPct);
          } else {
            const score = parseFloat(String(mark.score));
            if (!Number.isFinite(score) || score < 0 || score > maxScore) return;
            studentMarksMap[sid].scores.push(score);
            studentMarksMap[sid].maxScores.push(maxScore);
            const percentage = (score / maxScore) * 100;
            studentMarksMap[sid].percentages.push(percentage);
          }
        }
      });

      // Calculate average percentage for each student, then average across all students
      Object.keys(studentMarksMap).forEach(sid => {
        const studentData = studentMarksMap[sid];
        if (studentData.percentages.length > 0) {
          const avgPercentage = studentData.percentages.reduce((a, b) => a + b, 0) / studentData.percentages.length;
          studentPercentages.push(avgPercentage);
        } else if (studentData.scores.length > 0 && studentData.maxScores.length > 0) {
          const totalScore = studentData.scores.reduce((a, b) => a + b, 0);
          const totalMaxScore = studentData.maxScores.reduce((a, b) => a + b, 0);
          if (totalMaxScore > 0) {
            const percentage = (totalScore / totalMaxScore) * 100;
            studentPercentages.push(percentage);
          }
        }
      });

      // Calculate class average
      if (studentPercentages.length > 0) {
        const sumPercentages = studentPercentages.reduce((sum, p) => sum + p, 0);
        classAverages[subjectName] = Math.round(sumPercentages / studentPercentages.length);
      } else {
        classAverages[subjectName] = 0;
      }
    });

    // Group marks by subject
    const subjectMarksMap: { [key: string]: { scores: number[]; maxScores: number[]; percentages: number[]; comments: string[] } } = {};

    studentMarks.forEach(mark => {
      if (!mark || !mark.subject) {
        console.warn('[getStudentReportCard] Skipping mark with missing subject:', mark?.id);
        return;
      }
      
      const hasScore = mark.score !== null && mark.score !== undefined;
      const hasUniformMark = mark.uniformMark !== null && mark.uniformMark !== undefined;
      
      if (!hasScore && !hasUniformMark) {
        console.warn('[getStudentReportCard] Skipping mark with no score:', mark?.id);
        return;
      }
      
      const subjectName = mark.subject?.name;
      if (!subjectName) {
        console.warn('[getStudentReportCard] Skipping mark with invalid subject name:', mark?.id);
        return;
      }
      
      if (!subjectMarksMap[subjectName]) {
        subjectMarksMap[subjectName] = { scores: [], maxScores: [], percentages: [], comments: [] };
      }
      
      try {
        const maxScore = mark.maxScore && mark.maxScore > 0 ? parseFloat(String(mark.maxScore)) : 100;
        if (!Number.isFinite(maxScore) || maxScore <= 0) {
          console.warn('[getStudentReportCard] Invalid maxScore:', { maxScore, markId: mark.id });
          return;
        }

        if (hasUniformMark) {
          const uniformPct = parseFloat(String(mark.uniformMark));
          if (!Number.isFinite(uniformPct) || uniformPct < 0 || uniformPct > 100) {
            console.warn('[getStudentReportCard] Invalid uniformMark percentage:', { uniformPct, markId: mark.id });
            return;
          }
          const scoreFromUniform = (uniformPct / 100) * maxScore;
          subjectMarksMap[subjectName].scores.push(scoreFromUniform);
          subjectMarksMap[subjectName].maxScores.push(maxScore);
          subjectMarksMap[subjectName].percentages.push(uniformPct);
        } else {
          const score = parseFloat(String(mark.score));
          if (!Number.isFinite(score) || score < 0 || score > maxScore) {
            console.warn('[getStudentReportCard] Invalid score range:', { score, maxScore, markId: mark.id });
            return;
          }
          const percentage = (score / maxScore) * 100;
          subjectMarksMap[subjectName].scores.push(score);
          subjectMarksMap[subjectName].maxScores.push(maxScore);
          subjectMarksMap[subjectName].percentages.push(percentage);
        }

        if (mark.comments) {
          subjectMarksMap[subjectName].comments.push(mark.comments);
        }
      } catch (err) {
        console.error('[getStudentReportCard] Error processing mark:', mark?.id, err);
      }
    });

    // Grade calculation — supports dynamic gradeBands on settings
    type GradeKey = 'veryGood' | 'good' | 'satisfactory' | 'needsImprovement' | 'basic' | 'fail' | string;
    const getGradeInfo = (percentage: number | null): { key: GradeKey; label: string } => {
      const r = getGradeInfoFromSettings(percentage, settings);
      return { key: r.key as GradeKey, label: r.label };
    };

    // Build report card data - include ALL subjects from the class OR from marks if class has no subjects
    console.log('[getStudentReportCard] Building subjects array. Class subjects count:', classEntity.subjects?.length || 0);
    console.log('[getStudentReportCard] Subject marks map keys:', Object.keys(subjectMarksMap));
    console.log('[getStudentReportCard] Class subjects details:', classEntity.subjects?.map((s: any) => ({ 
      id: s.id, 
      name: s.name, 
      code: s.code 
    })) || []);
    
    // If class has no subjects but we have marks, extract subject info from marks
    let subjectsToProcess: any[] = [];
    
    if (classEntity.subjects && classEntity.subjects.length > 0) {
      // Use subjects from class
      subjectsToProcess = classEntity.subjects;
      console.log('[getStudentReportCard] Using subjects from class entity');
    } else {
      // Class has no subjects assigned, but we have marks - build subjects from marks
      console.warn('[getStudentReportCard] Class has no subjects assigned, building from marks:', {
        classId: classEntity.id,
        className: classEntity.name,
        marksSubjects: Object.keys(subjectMarksMap)
      });
      
      // Extract unique subjects from student marks (marks already have subject relations loaded)
      const subjectMap = new Map<string, any>();
      
      studentMarks.forEach(mark => {
        if (mark.subject && mark.subject.name) {
          const subjectName = mark.subject.name;
          if (!subjectMap.has(subjectName)) {
            subjectMap.set(subjectName, {
              id: mark.subject.id,
              name: mark.subject.name,
              code: mark.subject.code || ''
            });
          }
        }
      });
      
      // Convert map to array
      subjectsToProcess = Array.from(subjectMap.values());
      
      console.log('[getStudentReportCard] Built subjects from marks:', subjectsToProcess.map(s => ({ name: s.name, code: s.code })));
      
      // If still no subjects, try fetching from Subject repository by name
      if (subjectsToProcess.length === 0 && Object.keys(subjectMarksMap).length > 0) {
        const subjectRepository = AppDataSource.getRepository(Subject);
        const subjectNames = Object.keys(subjectMarksMap);
        const subjectsFromDb = await subjectRepository.find({
          where: subjectNames.map(name => ({ name }))
        });
        
        subjectsToProcess = subjectsFromDb.map(s => ({
          id: s.id,
          name: s.name,
          code: s.code || ''
        }));
        
        console.log('[getStudentReportCard] Fetched subjects from repository:', subjectsToProcess.map(s => ({ name: s.name, code: s.code })));
      }
    }
    
    const subjects = subjectsToProcess.map(subject => {
      const marks = subjectMarksMap[subject.name] || { scores: [], maxScores: [], percentages: [], comments: [] };
      const avgScore = marks.scores.length > 0 
        ? marks.scores.reduce((a, b) => a + b, 0) / marks.scores.length 
        : null;
      const avgPercentage = marks.percentages.length > 0
        ? marks.percentages.reduce((a, b) => a + b, 0) / marks.percentages.length
        : null;
      // For possible mark, use the average max score (typically 100)
      const avgMaxScore = marks.maxScores.length > 0 
        ? marks.maxScores.reduce((a, b) => a + b, 0) / marks.maxScores.length 
        : 100;
      const classAverage = classAverages[subject.name] || 0;
      
      const gradeInfo = getGradeInfo(avgPercentage);
      
      const subjectData = {
        id: subject.id,
        name: subject.name || 'Unknown Subject',
        code: subject.code || '',
        score: avgScore ? Math.round(avgScore) : null,
        maxScore: Math.round(avgMaxScore),
        percentage: avgPercentage,
        classAverage: classAverage,
        grade: gradeInfo.label,
        comment: marks.comments.length > 0 ? marks.comments.join(', ') : null
      };
      
      console.log('[getStudentReportCard] Subject data:', {
        name: subjectData.name,
        code: subjectData.code,
        score: subjectData.score,
        grade: subjectData.grade,
        hasComment: !!subjectData.comment
      });
      
      return subjectData;
    });
    
    console.log('[getStudentReportCard] Total subjects in report card:', subjects.length);
    console.log('[getStudentReportCard] Sample subject data:', subjects.length > 0 ? subjects[0] : 'No subjects');

    const totalScore = subjects.reduce((sum, s) => sum + (s.score || 0), 0);
    const totalMaxScore = subjects.reduce((sum, s) => sum + (s.maxScore || 0), 0);
    const overallPercentage = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : null;

    // Fetch remarks from ReportCardRemarks entity
    const remarksRepository = AppDataSource.getRepository(ReportCardRemarks);
    const remarks = await remarksRepository.findOne({
      where: {
        studentId: studentId,
        classId: student.classId,
        examType: 'end_term' // Match the ExamType.END_TERM value
      }
    });

    // Log if no subjects found, but still return the report card structure
    if (!subjects || subjects.length === 0) {
      console.warn('[getStudentReportCard] No subjects found for class:', {
        className: classEntity.name,
        classId: student.classId,
        classSubjectsCount: classEntity.subjects?.length || 0
      });
      // Still return the report card structure with empty subjects array
      // The frontend will handle displaying a message
    }

    const reportCard = {
      student: {
        id: student.id,
        studentNumber: student.studentNumber,
        firstName: student.firstName,
        lastName: student.lastName,
        class: classEntity.name,
        form: classEntity.form,
        classId: student.classId
      },
      term: activeTerm,
      examType: 'End of Term', // Display name for END_TERM
      subjects: subjects,
      totalScore: totalScore,
      totalMaxScore: totalMaxScore,
      overallPercentage: overallPercentage,
      remarks: {
        classTeacherRemarks: remarks?.classTeacherRemarks || null,
        headmasterRemarks: remarks?.headmasterRemarks || null
      },
      settings: {
        schoolName: settings?.schoolName || null,
        schoolAddress: settings?.schoolAddress || null,
        schoolPhone: settings?.schoolPhone || null,
        academicYear: settings?.academicYear || null,
        schoolLogo: settings?.schoolLogo || null,
        schoolLogo2: settings?.schoolLogo2 || null
      }
    };

    console.log('[getStudentReportCard] Sending report card response:', {
      studentId: student.id,
      studentNumber: student.studentNumber,
      subjectsCount: subjects.length,
      hasSettings: !!settings
    });

    res.json({ reportCard, class: classEntity.name, examType: 'End of Term', term: activeTerm });
  } catch (error: any) {
    console.error('[getStudentReportCard] Error fetching student report card:', error);
    console.error('[getStudentReportCard] Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error while fetching report card', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred'
    });
  }
};

// Download student's report card as PDF
export const downloadStudentReportCardPDF = async (req: AuthRequest, res: Response) => {
  try {
    console.log('[downloadStudentReportCardPDF] Endpoint called');
    
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const user = req.user;
    if (!user) {
      console.error('[downloadStudentReportCardPDF] No user in request');
      return res.status(401).json({ message: 'Authentication required' });
    }

    console.log('[downloadStudentReportCardPDF] User authenticated:', { userId: user.id, role: user.role });

    // Check if user is a student
    if (user.role !== UserRole.STUDENT) {
      console.log('[downloadStudentReportCardPDF] User role mismatch:', { userId: user.id, role: user.role });
      return res.status(403).json({ message: 'Access denied. Student access required.' });
    }

    // Get student ID
    let studentId: string;
    const studentRepository = AppDataSource.getRepository(Student);
    
    if (!user.student) {
      console.log('[downloadStudentReportCardPDF] Student relation not loaded, fetching from userId:', user.id);
      const student = await studentRepository.findOne({
        where: { userId: user.id }
      });
      if (!student) {
        return res.status(404).json({ message: 'Student record not found for this user' });
      }
      studentId = student.id;
    } else {
      studentId = user.student.id;
    }

    const student = await studentRepository.findOne({
      where: { id: studentId },
      relations: ['classEntity']
    });

    if (!student || !student.classId) {
      return res.status(404).json({ message: 'Student not found or not enrolled in a class' });
    }

    const termBalancePdf = await getTermBalanceForStudent(studentId);
    if (termBalancePdf > 0) {
      const settingsRepositoryPdf = AppDataSource.getRepository(Settings);
      const settingsListPdf = await settingsRepositoryPdf.find({
        order: { createdAt: 'DESC' },
        take: 1
      });
      const settingsPdf = settingsListPdf.length > 0 ? settingsListPdf[0] : null;
      const currencySymbolPdf = settingsPdf?.currencySymbol || '$';
      return res.status(403).json({
        message: `Report card access is restricted. Please clear the outstanding term balance of ${currencySymbolPdf} ${termBalancePdf.toFixed(2)} to view the report card.`,
        balance: termBalancePdf,
        code: 'TERM_BALANCE_LOCKED'
      });
    }

    // Get settings
    const settingsRepository = AppDataSource.getRepository(Settings);
    const settingsList = await settingsRepository.find({
      order: { createdAt: 'DESC' },
      take: 1
    });
    const settings = settingsList.length > 0 ? settingsList[0] : null;
    const activeTerm = settings?.activeTerm || settings?.currentTerm;

    if (!activeTerm) {
      return res.status(400).json({ message: 'Active term not set in settings' });
    }

    // Get the report card data (reuse the logic from getStudentReportCard)
    // We'll call the same logic but format it for PDF generation
    const { Exam } = await import('../entities/Exam');
    const { Marks } = await import('../entities/Marks');
    const { Subject } = await import('../entities/Subject');
    const { Class } = await import('../entities/Class');
    const { ExamType } = await import('../entities/Exam');
    const { ReportCardRemarks } = await import('../entities/ReportCardRemarks');
    
    const examRepository = AppDataSource.getRepository(Exam);
    const marksRepository = AppDataSource.getRepository(Marks);
    const classRepository = AppDataSource.getRepository(Class);

    const classEntity = await classRepository.findOne({
      where: { id: student.classId },
      relations: ['subjects']
    });

    if (!classEntity) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // Get End of Term exams for the active term
    const exams = await examRepository.find({
      where: {
        classId: student.classId,
        type: ExamType.END_TERM,
        term: activeTerm
      },
      relations: ['subjects']
    });

    if (exams.length === 0) {
      return res.status(404).json({ message: `No End of Term exams found for ${activeTerm}` });
    }

    // Get all marks for this student
    const allMarks = await marksRepository.find({
      where: { studentId: studentId },
      relations: ['subject', 'exam']
    }).catch(err => {
      console.error('[downloadStudentReportCardPDF] Error fetching marks:', err);
      return [];
    });

    const examIds = exams.map(e => e.id);
    const studentMarks = allMarks.filter(m => examIds.includes(m.examId));

    // Group marks by subject and calculate averages
    const subjectMarksMap: { [key: string]: { scores: number[]; maxScores: number[]; percentages: number[]; comments: string[] } } = {};

    studentMarks.forEach(mark => {
      if (!mark || !mark.subject) return;
      
      const hasScore = mark.score !== null && mark.score !== undefined;
      const hasUniformMark = mark.uniformMark !== null && mark.uniformMark !== undefined;
      
      if (!hasScore && !hasUniformMark) return;
      
      const subjectName = mark.subject?.name;
      if (!subjectName) return;
      
      if (!subjectMarksMap[subjectName]) {
        subjectMarksMap[subjectName] = { scores: [], maxScores: [], percentages: [], comments: [] };
      }
      
      try {
        const maxScore = mark.maxScore && mark.maxScore > 0 ? parseFloat(String(mark.maxScore)) : 100;
        if (!Number.isFinite(maxScore) || maxScore <= 0) return;

        if (hasUniformMark) {
          const uniformPct = parseFloat(String(mark.uniformMark));
          if (!Number.isFinite(uniformPct) || uniformPct < 0 || uniformPct > 100) return;
          const scoreFromUniform = (uniformPct / 100) * maxScore;
          subjectMarksMap[subjectName].scores.push(scoreFromUniform);
          subjectMarksMap[subjectName].maxScores.push(maxScore);
          subjectMarksMap[subjectName].percentages.push(uniformPct);
        } else {
          const score = parseFloat(String(mark.score));
          if (!Number.isFinite(score) || score < 0 || score > maxScore) return;
          const percentage = (score / maxScore) * 100;
          subjectMarksMap[subjectName].scores.push(score);
          subjectMarksMap[subjectName].maxScores.push(maxScore);
          subjectMarksMap[subjectName].percentages.push(percentage);
        }
        if (mark.comments) {
          subjectMarksMap[subjectName].comments.push(mark.comments);
        }
      } catch (err) {
        console.error('[downloadStudentReportCardPDF] Error processing mark:', err);
      }
    });

    // Build subjects array
    let subjectsToProcess: any[] = [];
    
    if (classEntity.subjects && classEntity.subjects.length > 0) {
      subjectsToProcess = classEntity.subjects;
    } else {
      // Extract subjects from marks
      const subjectMap = new Map<string, any>();
      studentMarks.forEach(mark => {
        if (mark.subject && mark.subject.name) {
          const subjectName = mark.subject.name;
          if (!subjectMap.has(subjectName)) {
            subjectMap.set(subjectName, {
              id: mark.subject.id,
              name: mark.subject.name,
              code: mark.subject.code || ''
            });
          }
        }
      });
      subjectsToProcess = Array.from(subjectMap.values());
    }

    const classMarksForPositions = await marksRepository.find({
      where: { examId: In(examIds) },
      relations: ['subject', 'student'],
    });
    const classMarksForSubjectRank = classMarksForPositions.filter(
      (m) => m.student && m.student.classId === student.classId
    );
    const subjectPositionLookup = buildSubjectPositionLookup(
      classMarksForSubjectRank,
      subjectsToProcess.map((s) => s.name)
    );

    const getGradeInfo = (percentage: number | null): string =>
      getGradeLabelOnly(percentage, settings);

    const subjects = subjectsToProcess.map(subject => {
      const marks = subjectMarksMap[subject.name] || { scores: [], maxScores: [], percentages: [], comments: [] };
      const avgScore = marks.scores.length > 0 
        ? marks.scores.reduce((a, b) => a + b, 0) / marks.scores.length 
        : null;
      const avgPercentage = marks.percentages.length > 0
        ? marks.percentages.reduce((a, b) => a + b, 0) / marks.percentages.length
        : null;
      const avgMaxScore = marks.maxScores.length > 0 
        ? marks.maxScores.reduce((a, b) => a + b, 0) / marks.maxScores.length 
        : 100;
      
      const gradeInfo = getGradeInfo(avgPercentage);
      const spInfo = subjectPositionLookup.get(
        subjectPositionLookupKey(studentId, subject.name)
      );

      return {
        subject: subject.name || 'Unknown Subject',
        subjectCode: subject.code || '',
        score: avgScore ? Math.round(avgScore) : 0,
        maxScore: Math.round(avgMaxScore),
        percentage: avgPercentage ? Math.round(avgPercentage).toString() : '0',
        grade: gradeInfo,
        comments: marks.comments.length > 0 ? marks.comments.join('; ') : undefined,
        subjectPosition: spInfo ? `${spInfo.position}/${spInfo.total}` : undefined
      };
    });

    const totalScore = subjects.reduce((sum, s) => sum + (s.score || 0), 0);
    const totalMaxScore = subjects.reduce((sum, s) => sum + (s.maxScore || 0), 0);
    const overallPercentage = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0;

    // Get remarks
    const remarksRepository = AppDataSource.getRepository(ReportCardRemarks);
    const remarks = await remarksRepository.findOne({
      where: {
        studentId: studentId,
        classId: student.classId,
        examType: 'end_term'
      }
    });

    // Format data for PDF generator
    const reportCardData = {
      student: {
        id: student.id,
        name: `${student.firstName} ${student.lastName}`,
        studentNumber: student.studentNumber,
        class: classEntity.name
      },
      examType: 'End of Term',
      subjects: subjects,
      overallAverage: Math.round(overallPercentage).toString(),
      overallGrade: getGradeInfo(overallPercentage),
      classPosition: 0, // Not calculated for student view
      formPosition: 0,
      totalStudents: 0,
      remarks: {
        classTeacherRemarks: remarks?.classTeacherRemarks || null,
        headmasterRemarks: remarks?.headmasterRemarks || null
      },
      generatedAt: new Date(),
      term: activeTerm || undefined
    };

    // Generate PDF
    const { createReportCardPDF } = await import('../utils/pdfGenerator');
    const pdfBuffer = await createReportCardPDF(reportCardData, settings);

    // Set response headers
    const studentName = `${student.firstName}-${student.lastName}`.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-');
    const filename = `${studentName}-ReportCard-${activeTerm.replace(/\s+/g, '-')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(pdfBuffer);

    console.log('[downloadStudentReportCardPDF] PDF sent successfully');
  } catch (error: any) {
    console.error('[downloadStudentReportCardPDF] Error generating PDF:', error);
    console.error('[downloadStudentReportCardPDF] Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error while generating PDF', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred'
    });
  }
};

// Get student's invoice balance
export const getStudentInvoiceBalance = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Check if user is a student
    if (user.role !== UserRole.STUDENT) {
      console.log('[getStudentInvoiceBalance] User role mismatch:', { userId: user.id, role: user.role });
      return res.status(403).json({ message: 'Access denied. Student access required.' });
    }

    // If user.student is not loaded, try to load it
    let studentId: string;
    if (!user.student) {
      console.log('[getStudentInvoiceBalance] Student relation not loaded, fetching from userId:', user.id);
      const studentRepository = AppDataSource.getRepository(Student);
      const student = await studentRepository.findOne({
        where: { userId: user.id }
      });
      if (!student) {
        return res.status(404).json({ message: 'Student record not found for this user' });
      }
      studentId = student.id;
    } else {
      studentId = user.student.id;
    }
    
    // Use existing finance controller logic
    const { getStudentBalance } = await import('./finance.controller');
    
    // Create a mock request
    const mockReq: any = {
      ...req,
      query: { studentId: studentId },
      user: user
    };

    // Call getStudentBalance
    const { getStudentBalance: getStudentBalanceFunc } = await import('./finance.controller');
    
    // Instead, fetch directly
    const { Invoice } = await import('../entities/Invoice');
    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const studentRepository = AppDataSource.getRepository(Student);
    
    const student = await studentRepository.findOne({
      where: { id: studentId },
      relations: ['classEntity']
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Get the latest invoice
    const lastInvoice = await invoiceRepository.findOne({
      where: { studentId: studentId },
      order: { createdAt: 'DESC' },
      relations: ['uniformItems'],
    });

    const { parseAmount } = await import('../utils/numberUtils');
    const { resolveInvoiceRemainingBalance } = await import('../utils/invoiceBalanceResolve');

    const balance = resolveInvoiceRemainingBalance(lastInvoice);
    const lastInvoiceAmount = parseAmount(lastInvoice?.amount);
    const previousBalance = parseAmount(lastInvoice?.previousBalance);
    const paidAmount = parseAmount(lastInvoice?.paidAmount);
    const prepaidAmount = parseAmount(lastInvoice?.prepaidAmount);

    res.json({
      studentId: student.id,
      studentNumber: student.studentNumber,
      firstName: student.firstName,
      lastName: student.lastName,
      fullName: `${student.lastName} ${student.firstName}`,
      balance: balance,
      prepaidAmount: prepaidAmount,
      lastInvoiceId: lastInvoice?.id || null,
      lastInvoiceNumber: lastInvoice?.invoiceNumber || null,
      lastInvoiceTerm: lastInvoice?.term || null,
      lastInvoiceDate: lastInvoice?.createdAt || null,
      lastInvoiceAmount: lastInvoiceAmount,
      lastInvoicePreviousBalance: previousBalance,
      lastInvoicePaidAmount: paidAmount,
      lastInvoiceBalance: balance
    });
  } catch (error: any) {
    console.error('Error fetching student invoice balance:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

