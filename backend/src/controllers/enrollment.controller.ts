import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Student } from '../entities/Student';
import { StudentEnrollment } from '../entities/StudentEnrollment';
import { Class } from '../entities/Class';
import { AuthRequest } from '../middleware/auth';
import { Settings } from '../entities/Settings';
import { AcademicTerm } from '../entities/AcademicTerm';
import { Invoice, InvoiceStatus } from '../entities/Invoice';
import { generateInvoiceNumber, parseAmount, roundMoney } from '../utils/numberUtils';
import { invoicesIncludeTerm } from '../utils/termMatch';
import { computeOpeningInvoiceBundle } from '../utils/openingInvoiceCompute';

/**
 * Enroll a student into a class
 */
export const enrollStudent = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { studentId, classId, enrollmentDate, notes } = req.body;

    if (!studentId || !classId) {
      return res.status(400).json({ message: 'Student ID and Class ID are required' });
    }

    const studentRepository = AppDataSource.getRepository(Student);
    const classRepository = AppDataSource.getRepository(Class);
    const enrollmentRepository = AppDataSource.getRepository(StudentEnrollment);
    const settingsRepository = AppDataSource.getRepository(Settings);
    const invoiceRepository = AppDataSource.getRepository(Invoice);

    // Find student
    const student = await studentRepository.findOne({
      where: { id: studentId }
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Check if student is already enrolled in this class
    const existingEnrollment = await enrollmentRepository.findOne({
      where: { studentId, classId, isActive: true }
    });

    if (existingEnrollment) {
      return res.status(400).json({ 
        message: 'Student is already actively enrolled in this class.' 
      });
    }

    // Verify class exists and is active
    const classEntity = await classRepository.findOne({ where: { id: classId } });
    if (!classEntity) {
      return res.status(404).json({ message: 'Class not found' });
    }

    if (!classEntity.isActive) {
      return res.status(400).json({ message: 'Cannot enroll student into an inactive class' });
    }

    // Parse enrollment date
    let parsedEnrollmentDate: Date;
    if (enrollmentDate) {
      parsedEnrollmentDate = new Date(enrollmentDate);
      if (isNaN(parsedEnrollmentDate.getTime())) {
        return res.status(400).json({ message: 'Invalid enrollment date format' });
      }
    } else {
      parsedEnrollmentDate = new Date();
    }

    // Deactivate any previous enrollments
    const previousEnrollments = await enrollmentRepository.find({
      where: { studentId, isActive: true }
    });

    for (const prevEnrollment of previousEnrollments) {
      prevEnrollment.isActive = false;
      prevEnrollment.withdrawalDate = new Date();
      prevEnrollment.withdrawnByUserId = req.user!.id;
      await enrollmentRepository.save(prevEnrollment);
    }

    // Create new enrollment record
    const enrollment = enrollmentRepository.create({
      studentId: student.id,
      classId: classEntity.id,
      enrollmentDate: parsedEnrollmentDate,
      enrolledByUserId: req.user!.id,
      notes: notes?.trim() || null,
      isActive: true
    });

    await enrollmentRepository.save(enrollment);

    // Update student's enrollment status and classId
    student.enrollmentStatus = 'Enrolled';
    student.classId = classEntity.id;
    await studentRepository.save(student);

    // Initial invoice for the current term if this student has none for that term yet.
    try {
      const existingInvoicesList = await invoiceRepository.find({ where: { studentId: student.id } });
      const settings = await settingsRepository.findOne({
        where: {},
        order: { createdAt: 'DESC' },
      });

      if (!settings) {
        // no settings — skip invoicing
      } else {
        const termForEnrollment =
          settings.currentTerm ||
          (settings as any).activeTerm ||
          `Term 1 ${new Date().getFullYear()}`;

        if (invoicesIncludeTerm(existingInvoicesList, termForEnrollment)) {
          console.log(
            'ℹ️ Skipping enrollment invoice — student already has an invoice for',
            termForEnrollment
          );
        } else {
          const stWithClassForFees = await studentRepository.findOne({
            where: { id: student.id },
            relations: ['classEntity'],
          });
          const studentForInvoice = (stWithClassForFees ?? student) as any;
          const bundle = await computeOpeningInvoiceBundle(AppDataSource, studentForInvoice);
          const { total, feeLineItems, lineDescriptions } = bundle;
          if (bundle.source !== 'none') {
            console.log('💰 Enrollment invoice bundle:', {
              source: bundle.source,
              total,
              items: lineDescriptions,
            });
          }

          if (total > 0.005) {
            const lineSum = feeLineItems.reduce(
              (s, row) => s + roundMoney(parseAmount((row as any).amount)),
              0
            );
            const amountValue = lineSum > 0.005 ? roundMoney(lineSum) : roundMoney(total);
            const balanceValue = amountValue;
            const term = termForEnrollment;
            const description =
              lineDescriptions.length > 0
                ? `Enrollment — new student fees: ${lineDescriptions.join(', ')}`
                : 'Enrollment — new student fees';

            const invoiceNumber = generateInvoiceNumber();

            const initialInvoice = invoiceRepository.create({
              invoiceNumber,
              studentId: student.id,
              amount: amountValue,
              balance: balanceValue,
              paidAmount: 0,
              previousBalance: 0,
              prepaidAmount: 0,
              uniformTotal: 0,
              dueDate: new Date(new Date().setMonth(new Date().getMonth() + 1)),
              term,
              description,
              status: InvoiceStatus.PENDING,
              feeLineItems,
              uniformItems: [],
            });

            await invoiceRepository.save(initialInvoice);
            console.log('✅ Invoice created for newly enrolled student:', invoiceNumber, 'term:', term);
          }
        }
      }
    } catch (invoiceError) {
      console.error('❌ Error creating invoice for enrolled student:', invoiceError);
      // Continue without failing enrollment
    }

    // Load enrollment with relations
    const savedEnrollment = await enrollmentRepository.findOne({
      where: { id: enrollment.id },
      relations: ['student', 'classEntity', 'enrolledBy', 'withdrawnBy']
    });

    res.status(201).json({
      message: 'Student enrolled successfully',
      enrollment: savedEnrollment
    });
  } catch (error: any) {
    console.error('[Enrollment] Error enrolling student:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message || 'Unknown error'
    });
  }
};

/**
 * Withdraw a student from their current class
 */
export const withdrawStudent = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { studentId, withdrawalDate, notes } = req.body;

    if (!studentId) {
      return res.status(400).json({ message: 'Student ID is required' });
    }

    const studentRepository = AppDataSource.getRepository(Student);
    const enrollmentRepository = AppDataSource.getRepository(StudentEnrollment);

    const student = await studentRepository.findOne({ where: { id: studentId } });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Find active enrollment
    const activeEnrollment = await enrollmentRepository.findOne({
      where: { studentId, isActive: true }
    });

    if (!activeEnrollment) {
      return res.status(404).json({ message: 'No active enrollment found for this student' });
    }

    // Parse withdrawal date
    let parsedWithdrawalDate: Date;
    if (withdrawalDate) {
      parsedWithdrawalDate = new Date(withdrawalDate);
      if (isNaN(parsedWithdrawalDate.getTime())) {
        return res.status(400).json({ message: 'Invalid withdrawal date format' });
      }
    } else {
      parsedWithdrawalDate = new Date();
    }

    // Deactivate enrollment
    activeEnrollment.isActive = false;
    activeEnrollment.withdrawalDate = parsedWithdrawalDate;
    activeEnrollment.withdrawnByUserId = req.user!.id;
    if (notes) {
      activeEnrollment.notes = (activeEnrollment.notes || '') + '\nWithdrawal: ' + notes.trim();
    }
    await enrollmentRepository.save(activeEnrollment);

    // Update student enrollment status and clear classId
    student.enrollmentStatus = 'Not Enrolled';
    student.classId = null;
    await studentRepository.save(student);

    res.json({
      message: 'Student withdrawn successfully',
      enrollment: activeEnrollment
    });
  } catch (error: any) {
    console.error('[Enrollment] Error withdrawing student:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message || 'Unknown error'
    });
  }
};

/**
 * Get enrollment history for a student
 */
export const getStudentEnrollmentHistory = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { studentId } = req.params;

    const enrollmentRepository = AppDataSource.getRepository(StudentEnrollment);

    const enrollments = await enrollmentRepository.find({
      where: { studentId },
      relations: ['classEntity', 'enrolledBy', 'withdrawnBy'],
      order: { enrollmentDate: 'DESC' }
    });

    res.json(enrollments);
  } catch (error: any) {
    console.error('[Enrollment] Error fetching enrollment history:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message || 'Unknown error'
    });
  }
};

/**
 * Get all unenrolled students
 */
export const getUnenrolledStudents = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const studentRepository = AppDataSource.getRepository(Student);

    // Get all active students with 'Not Enrolled' status
    const unenrolledStudents = await studentRepository.find({
      where: { 
        isActive: true,
        enrollmentStatus: 'Not Enrolled'
      },
      relations: ['parent'],
      order: { firstName: 'ASC', lastName: 'ASC' }
    });

    res.json(unenrolledStudents);
  } catch (error: any) {
    console.error('[Enrollment] Error fetching unenrolled students:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message || 'Unknown error'
    });
  }
};

/**
 * Get all enrollments with optional filters
 */
export const getAllEnrollments = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { classId, studentId, isActive, startDate, endDate } = req.query;

    const enrollmentRepository = AppDataSource.getRepository(StudentEnrollment);
    const queryBuilder = enrollmentRepository
      .createQueryBuilder('enrollment')
      .leftJoinAndSelect('enrollment.student', 'student')
      .leftJoinAndSelect('enrollment.classEntity', 'classEntity')
      .leftJoinAndSelect('enrollment.enrolledBy', 'enrolledBy')
      .leftJoinAndSelect('enrollment.withdrawnBy', 'withdrawnBy');

    if (classId) {
      queryBuilder.andWhere('enrollment.classId = :classId', { classId });
    }

    if (studentId) {
      queryBuilder.andWhere('enrollment.studentId = :studentId', { studentId });
    }

    if (isActive !== undefined) {
      const active = String(isActive) === 'true';
      queryBuilder.andWhere('enrollment.isActive = :isActive', { isActive: active });
    }

    if (startDate) {
      queryBuilder.andWhere('enrollment.enrollmentDate >= :startDate', { startDate });
    }

    if (endDate) {
      queryBuilder.andWhere('enrollment.enrollmentDate <= :endDate', { endDate });
    }

    queryBuilder.orderBy('enrollment.enrollmentDate', 'DESC');

    const enrollments = await queryBuilder.getMany();

    res.json(enrollments);
  } catch (error: any) {
    console.error('[Enrollment] Error fetching enrollments:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message || 'Unknown error'
    });
  }
};

const adminLikeRoles = new Set(['admin', 'superadmin', 'demo_user']);

function assertAdminMigrate(req: AuthRequest, res: Response): boolean {
  if (!adminLikeRoles.has(String(req.user?.role || ''))) {
    res.status(403).json({ message: 'Only school administrators can migrate a whole class.' });
    return false;
  }
  return true;
}

/**
 * GET /enrollments/migrate-class/preview?fromClassId=
 * Returns how many active students are currently assigned to the source class.
 */
export const getMigrateClassPreview = async (req: AuthRequest, res: Response) => {
  try {
    if (!assertAdminMigrate(req, res)) return;
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const fromClassId = String(req.query.fromClassId || '').trim();
    if (!fromClassId) {
      return res.status(400).json({ message: 'Query parameter fromClassId is required.' });
    }

    const classRepository = AppDataSource.getRepository(Class);
    const studentRepository = AppDataSource.getRepository(Student);

    const fromClass = await classRepository.findOne({ where: { id: fromClassId } });
    if (!fromClass) {
      return res.status(404).json({ message: 'Source class not found.' });
    }

    const count = await studentRepository.count({
      where: { classId: fromClassId, isActive: true },
    });

    res.json({
      count,
      fromClassId,
      fromClassName: fromClass.name,
    });
  } catch (error: any) {
    console.error('[Enrollment] migrate-class preview:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

/**
 * POST /enrollments/migrate-class
 * Moves every active student on `fromClassId` to `toClassId`, syncing student_enrollments
 * (withdraw active rows, add a new active enrollment). Terms are validated when provided
 * for reporting only; roster is determined by current student.classId.
 */
export const migrateClassEnrollments = async (req: AuthRequest, res: Response) => {
  try {
    if (!assertAdminMigrate(req, res)) return;
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { fromClassId, toClassId, fromTermId, toTermId } = req.body || {};
    const fromId = String(fromClassId || '').trim();
    const toId = String(toClassId || '').trim();
    const fromTerm = fromTermId ? String(fromTermId).trim() : '';
    const toTerm = toTermId ? String(toTermId).trim() : '';

    if (!fromId || !toId) {
      return res.status(400).json({ message: 'Source class and destination class are required.' });
    }
    if (fromId === toId) {
      return res.status(400).json({ message: 'Source and destination class must be different.' });
    }

    const termRepository = AppDataSource.getRepository(AcademicTerm);
    if (fromTerm) {
      const t = await termRepository.findOne({ where: { id: fromTerm } });
      if (!t) return res.status(400).json({ message: 'Source term not found.' });
    }
    if (toTerm) {
      const t = await termRepository.findOne({ where: { id: toTerm } });
      if (!t) return res.status(400).json({ message: 'Destination term not found.' });
    }

    const classRepository = AppDataSource.getRepository(Class);
    const studentRepository = AppDataSource.getRepository(Student);

    const fromClass = await classRepository.findOne({ where: { id: fromId } });
    const toClass = await classRepository.findOne({ where: { id: toId } });

    if (!fromClass) {
      return res.status(404).json({ message: 'Source class not found.' });
    }
    if (!toClass) {
      return res.status(404).json({ message: 'Destination class not found.' });
    }
    if (toClass.isActive === false) {
      return res.status(400).json({ message: 'Destination class is inactive.' });
    }

    const students = await studentRepository.find({
      where: { classId: fromId, isActive: true },
      order: { lastName: 'ASC', firstName: 'ASC' },
    });

    if (students.length === 0) {
      return res.status(400).json({ message: 'No active students found in the source class.' });
    }

    const termNote =
      fromTerm || toTerm
        ? ` Terms (context): source=${fromTerm || '—'}, destination=${toTerm || '—'}.`
        : '';
    const baseNote = `Bulk class migration from ${fromClass.name} → ${toClass.name}.${termNote}`;

    let moved = 0;
    const errors: string[] = [];

    await AppDataSource.transaction(async (em) => {
      const enrRepo = em.getRepository(StudentEnrollment);
      const stuRepo = em.getRepository(Student);

      for (const student of students) {
        try {
          const previous = await enrRepo.find({ where: { studentId: student.id, isActive: true } });
          const now = new Date();
          for (const prev of previous) {
            prev.isActive = false;
            prev.withdrawalDate = now;
            prev.withdrawnByUserId = req.user!.id;
            prev.notes = ((prev.notes || '') + '\n' + baseNote).trim();
            await enrRepo.save(prev);
          }

          const enrollment = enrRepo.create({
            studentId: student.id,
            classId: toId,
            enrollmentDate: now,
            enrolledByUserId: req.user!.id,
            notes: baseNote.trim(),
            isActive: true,
          });
          await enrRepo.save(enrollment);

          student.classId = toId;
          student.enrollmentStatus = 'Enrolled';
          await stuRepo.save(student);
          moved++;
        } catch (inner: any) {
          const name = `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.id;
          errors.push(`${name}: ${inner?.message || 'unknown error'}`);
        }
      }
    });

    res.json({
      message: `Migrated ${moved} student(s) from ${fromClass.name} to ${toClass.name}.`,
      moved,
      fromClass: fromClass.name,
      toClass: toClass.name,
      errors: errors.length ? errors : undefined,
    });
  } catch (error: any) {
    console.error('[Enrollment] migrate-class:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

