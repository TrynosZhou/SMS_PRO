import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { Parent } from '../entities/Parent';
import { Student } from '../entities/Student';
import { Invoice } from '../entities/Invoice';
import { Settings } from '../entities/Settings';
import { parseAmount } from '../utils/numberUtils';
import { resolveTuitionFees, isBoarderStudent } from '../utils/feesSettingsResolve';
import { getTermBalanceForStudent } from '../utils/termBalance';

// Get parent's linked students
export const getParentStudents = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const parentRepository = AppDataSource.getRepository(Parent);
    const parent = await parentRepository.findOne({
      where: { userId },
      relations: ['students', 'students.classEntity']
    });

    if (!parent) {
      return res.status(404).json({ message: 'Parent profile not found' });
    }

    // Get invoice balances for each student
    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const studentsWithBalances = await Promise.all(
      (parent.students || []).map(async (student) => {
        // Latest invoice: term balance = invoice.balance only (current term); excludes next-term tuition projections
        const latestInvoice = await invoiceRepository.findOne({
          where: { studentId: student.id },
          order: { createdAt: 'DESC' }
        });

        const termBalance = await getTermBalanceForStudent(student.id);
        let currentBalance = 0;

        if (latestInvoice) {
          
          // Get settings to determine next term fees
          const settingsRepository = AppDataSource.getRepository(Settings);
          const settings = await settingsRepository.findOne({
            where: {},
            order: { createdAt: 'DESC' }
          });

          // Get next term fees based on student type
          const feesSettings = settings?.feesSettings || {};
          const { dayScholar: dayScholarTuitionFee, boarder: boarderTuitionFee } =
            resolveTuitionFees(feesSettings);
          const transportCost = parseAmount(feesSettings.transportCost);
          const diningHallCost = parseAmount(feesSettings.diningHallCost);
          
          // Calculate fees based on staff child status
          let nextTermFees = 0;
          
          // Staff children don't pay tuition fees
          if (!student.isStaffChild) {
            nextTermFees = isBoarderStudent(student.studentType)
              ? boarderTuitionFee
              : dayScholarTuitionFee;
          }
          
          // Transport cost: only for day scholars who use transport AND are not staff children
          if (!isBoarderStudent(student.studentType) && student.usesTransport && !student.isStaffChild) {
            nextTermFees += transportCost;
          }
          
          // Dining hall cost: full price for regular students, 50% for staff children
          if (student.usesDiningHall) {
            if (student.isStaffChild) {
              nextTermFees += diningHallCost * 0.5; // 50% for staff children
            } else {
              nextTermFees += diningHallCost; // Full price for regular students
            }
          }

          // Current invoice balance calculation:
          // - If term balance is zero: only fees for next term
          // - If term balance > 0: term balance + fees for next term
          if (termBalance === 0) {
            currentBalance = nextTermFees;
          } else {
            currentBalance = termBalance + nextTermFees;
          }
        }

        return {
          ...student,
          termBalance: termBalance,
          currentInvoiceBalance: currentBalance
        };
      })
    );

    res.json({ students: studentsWithBalances });
  } catch (error: any) {
    console.error('Error getting parent students:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

// Link a student to parent
export const linkStudent = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { studentId } = req.body;

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!studentId) {
      return res.status(400).json({ message: 'Student ID is required' });
    }

    const parentRepository = AppDataSource.getRepository(Parent);
    const studentRepository = AppDataSource.getRepository(Student);

    const parent = await parentRepository.findOne({ where: { userId } });
    if (!parent) {
      return res.status(404).json({ message: 'Parent profile not found' });
    }

    const normalizedStudentId = String(studentId).trim();
    const student = await studentRepository.findOne({ where: { studentNumber: normalizedStudentId } });
    if (!student) {
      return res.status(404).json({ message: 'Student not found. Please check the Student ID.' });
    }

    // Check if student is already linked to this parent
    if (student.parentId === parent.id) {
      return res.status(400).json({ message: 'Student is already linked to this parent' });
    }

    // Link student to parent
    student.parentId = parent.id;
    await studentRepository.save(student);

    res.json({ message: 'Student linked successfully', student });
  } catch (error: any) {
    console.error('Error linking student:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

// Unlink a student from parent
export const unlinkStudent = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { studentId } = req.params;

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const parentRepository = AppDataSource.getRepository(Parent);
    const studentRepository = AppDataSource.getRepository(Student);

    const parent = await parentRepository.findOne({ where: { userId } });
    if (!parent) {
      return res.status(404).json({ message: 'Parent profile not found' });
    }

    const student = await studentRepository.findOne({ where: { id: studentId } });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Check if student is linked to this parent
    if (student.parentId !== parent.id) {
      return res.status(403).json({ message: 'Student is not linked to this parent' });
    }

    // Unlink student
    student.parentId = null;
    await studentRepository.save(student);

    res.json({ message: 'Student unlinked successfully' });
  } catch (error: any) {
    console.error('Error unlinking student:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

// Link a student to parent by Student ID (studentNumber) only
export const linkStudentByIdAndDob = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { studentId } = req.body;

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!studentId) {
      return res.status(400).json({ message: 'Student ID is required' });
    }

    const parentRepository = AppDataSource.getRepository(Parent);
    const studentRepository = AppDataSource.getRepository(Student);

    const parent = await parentRepository.findOne({ where: { userId } });
    if (!parent) {
      return res.status(404).json({ message: 'Parent profile not found' });
    }

    // Find student by studentNumber (Student ID)
    const normalizedStudentId = String(studentId).trim();
    const student = await studentRepository.findOne({
      where: { studentNumber: normalizedStudentId },
      relations: ['classEntity']
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found. Please check the Student ID.' });
    }

    // Check if student is already linked to this parent
    if (student.parentId === parent.id) {
      return res.status(400).json({ message: 'Student is already linked to your account' });
    }

    // Check if student is already linked to another parent
    if (student.parentId && student.parentId !== parent.id) {
      return res.status(400).json({ message: 'This student is already linked to another parent account' });
    }

    // Link student to parent
    student.parentId = parent.id;
    await studentRepository.save(student);

    res.json({ 
      message: 'Student linked successfully', 
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        studentNumber: student.studentNumber,
        class: student.classEntity
      }
    });
  } catch (error: any) {
    console.error('Error linking student by ID and DOB:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

// Search students for linking (by student number or name)
export const searchStudents = async (req: AuthRequest, res: Response) => {
  try {
    const { query } = req.query;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ message: 'Search query is required' });
    }

    const studentRepository = AppDataSource.getRepository(Student);
    
    // Search by student number, first name, or last name (case-insensitive)
    const term = `%${query.trim()}%`;
    const students = await studentRepository
      .createQueryBuilder('student')
      .leftJoinAndSelect('student.classEntity', 'classEntity')
      .where(
        '(student.studentNumber ILIKE :term OR student.firstName ILIKE :term OR student.lastName ILIKE :term OR CONCAT(student.firstName, \' \', student.lastName) ILIKE :term)',
        { term }
      )
      .orderBy('student.lastName', 'ASC')
      .addOrderBy('student.firstName', 'ASC')
      .limit(50)
      .getMany();

    res.json({ students });
  } catch (error: any) {
    console.error('Error searching students:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

