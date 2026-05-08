import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { RecordBook } from '../entities/RecordBook';
import { Student } from '../entities/Student';
import { Teacher } from '../entities/Teacher';
import { Class } from '../entities/Class';
import { Subject } from '../entities/Subject';
import { Settings } from '../entities/Settings';
import { AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/User';
import { createRecordBookPDF } from '../utils/recordBookPdfGenerator';

// Get record book data for a specific class and subject
export const getRecordBookByClass = async (req: AuthRequest, res: Response) => {
  try {
    const { classId } = req.params;
    const { subjectId } = req.query;
    const teacherId = req.user?.teacher?.id;

    if (!teacherId) {
      return res.status(403).json({ message: 'Only teachers can access record books' });
    }

    if (!subjectId) {
      return res.status(400).json({ message: 'Subject ID is required' });
    }

    // Verify teacher is assigned to this class
    const teacherRepository = AppDataSource.getRepository(Teacher);
    const teacher = await teacherRepository.findOne({
      where: { id: teacherId },
      relations: ['classes', 'subjects']
    });

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    const isAssigned = teacher.classes?.some(c => c.id === classId);
    if (!isAssigned) {
      return res.status(403).json({ message: 'You are not assigned to this class' });
    }

    // Verify teacher teaches this subject
    const teachesSubject = teacher.subjects?.some(s => s.id === subjectId);
    if (!teachesSubject) {
      return res.status(403).json({ message: 'You are not assigned to teach this subject' });
    }

    // Get current term and year from settings
    const settingsRepository = AppDataSource.getRepository(Settings);
    const settings = await settingsRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' }
    });

    const currentTerm = settings?.currentTerm || 'Term 1';
    const currentYear = settings?.academicYear || new Date().getFullYear().toString();

    // Get all students in the class
    const studentRepository = AppDataSource.getRepository(Student);
    const students = await studentRepository.find({
      where: { classId, isActive: true },
      order: { lastName: 'ASC', firstName: 'ASC' }
    });

    // Get existing record book entries for this subject
    const recordBookRepository = AppDataSource.getRepository(RecordBook);
    const records = await recordBookRepository.find({
      where: {
        classId,
        teacherId,
        subjectId: subjectId as string,
        term: currentTerm,
        year: currentYear
      }
    });

    // Map records to students
    const recordsMap = new Map(records.map(r => [r.studentId, r]));

    const studentsWithRecords = students.map(student => {
      const record = recordsMap.get(student.id);
      return {
        studentId: student.id,
        studentNumber: student.studentNumber,
        lastName: student.lastName,
        firstName: student.firstName,
        test1: record?.test1 || null,
        test1Topic: record?.test1Topic || '',
        test1Date: record?.test1Date || null,
        test2: record?.test2 || null,
        test2Topic: record?.test2Topic || '',
        test2Date: record?.test2Date || null,
        test3: record?.test3 || null,
        test3Topic: record?.test3Topic || '',
        test3Date: record?.test3Date || null,
        test4: record?.test4 || null,
        test4Topic: record?.test4Topic || '',
        test4Date: record?.test4Date || null,
        test5: record?.test5 || null,
        test5Topic: record?.test5Topic || '',
        test5Date: record?.test5Date || null,
        test6: record?.test6 || null,
        test6Topic: record?.test6Topic || '',
        test6Date: record?.test6Date || null,
        test7: record?.test7 || null,
        test7Topic: record?.test7Topic || '',
        test7Date: record?.test7Date || null,
        test8: record?.test8 || null,
        test8Topic: record?.test8Topic || '',
        test8Date: record?.test8Date || null,
        test9: record?.test9 || null,
        test9Topic: record?.test9Topic || '',
        test9Date: record?.test9Date || null,
        test10: record?.test10 || null,
        test10Topic: record?.test10Topic || '',
        test10Date: record?.test10Date || null,
        recordId: record?.id || null
      };
    });

    res.json({
      students: studentsWithRecords,
      term: currentTerm,
      year: currentYear
    });
  } catch (error: any) {
    console.error('Error fetching record book:', error);
    
    // Check if it's a database column error (migration not run)
    if (error.message?.includes('column') && error.message?.includes('subjectId')) {
      return res.status(500).json({ 
        message: 'Database migration required. Please run the migration to add subjectId column to record_books table.',
        error: 'Missing column: subjectId'
      });
    }
    
    // Check if it's a foreign key constraint error
    if (error.message?.includes('foreign key') || error.code === '23503') {
      return res.status(400).json({ 
        message: 'Invalid subject ID provided.',
        error: error.message 
      });
    }
    
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Save or update record book marks
export const saveRecordBookMarks = async (req: AuthRequest, res: Response) => {
  try {
    const { classId, studentId, subjectId, test1, test2, test3, test4, test5, test6, test7, test8, test9, test10, 
            test1Topic, test2Topic, test3Topic, test4Topic, test5Topic, test6Topic, test7Topic, test8Topic, test9Topic, test10Topic,
            test1Date, test2Date, test3Date, test4Date, test5Date, test6Date, test7Date, test8Date, test9Date, test10Date } = req.body;
    const teacherId = req.user?.teacher?.id;

    if (!teacherId) {
      return res.status(403).json({ message: 'Only teachers can save record book marks' });
    }

    if (!classId || !studentId || !subjectId) {
      return res.status(400).json({ message: 'Class ID, Student ID, and Subject ID are required' });
    }

    // Verify teacher is assigned to this class
    const teacherRepository = AppDataSource.getRepository(Teacher);
    const teacher = await teacherRepository.findOne({
      where: { id: teacherId },
      relations: ['classes', 'subjects']
    });

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    const isAssigned = teacher.classes?.some(c => c.id === classId);
    if (!isAssigned) {
      return res.status(403).json({ message: 'You are not assigned to this class' });
    }

    // Verify teacher teaches this subject
    const teachesSubject = teacher.subjects?.some(s => s.id === subjectId);
    if (!teachesSubject) {
      return res.status(403).json({ message: 'You are not assigned to teach this subject' });
    }

    // Get current term and year from settings
    const settingsRepository = AppDataSource.getRepository(Settings);
    const settings = await settingsRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' }
    });

    const currentTerm = settings?.currentTerm || 'Term 1';
    const currentYear = settings?.academicYear || new Date().getFullYear().toString();

    // Find or create record
    const recordBookRepository = AppDataSource.getRepository(RecordBook);
    let record = await recordBookRepository.findOne({
      where: {
        studentId,
        teacherId,
        classId,
        subjectId,
        term: currentTerm,
        year: currentYear
      }
    });

    if (record) {
      // Update existing record
      record.test1 = test1 !== undefined && test1 !== null && test1 !== '' ? parseInt(String(test1)) : null;
      record.test2 = test2 !== undefined && test2 !== null && test2 !== '' ? parseInt(String(test2)) : null;
      record.test3 = test3 !== undefined && test3 !== null && test3 !== '' ? parseInt(String(test3)) : null;
      record.test4 = test4 !== undefined && test4 !== null && test4 !== '' ? parseInt(String(test4)) : null;
      record.test5 = test5 !== undefined && test5 !== null && test5 !== '' ? parseInt(String(test5)) : null;
      record.test6 = test6 !== undefined && test6 !== null && test6 !== '' ? parseInt(String(test6)) : null;
      record.test7 = test7 !== undefined && test7 !== null && test7 !== '' ? parseInt(String(test7)) : null;
      record.test8 = test8 !== undefined && test8 !== null && test8 !== '' ? parseInt(String(test8)) : null;
      record.test9 = test9 !== undefined && test9 !== null && test9 !== '' ? parseInt(String(test9)) : null;
      record.test10 = test10 !== undefined && test10 !== null && test10 !== '' ? parseInt(String(test10)) : null;
      if (test1Topic !== undefined) record.test1Topic = test1Topic || null;
      if (test1Date !== undefined) record.test1Date = test1Date ? new Date(test1Date) : null;
      if (test2Topic !== undefined) record.test2Topic = test2Topic || null;
      if (test2Date !== undefined) record.test2Date = test2Date ? new Date(test2Date) : null;
      if (test3Topic !== undefined) record.test3Topic = test3Topic || null;
      if (test3Date !== undefined) record.test3Date = test3Date ? new Date(test3Date) : null;
      if (test4Topic !== undefined) record.test4Topic = test4Topic || null;
      if (test4Date !== undefined) record.test4Date = test4Date ? new Date(test4Date) : null;
      if (test5Topic !== undefined) record.test5Topic = test5Topic || null;
      if (test5Date !== undefined) record.test5Date = test5Date ? new Date(test5Date) : null;
      if (test6Topic !== undefined) record.test6Topic = test6Topic || null;
      if (test6Date !== undefined) record.test6Date = test6Date ? new Date(test6Date) : null;
      if (test7Topic !== undefined) record.test7Topic = test7Topic || null;
      if (test7Date !== undefined) record.test7Date = test7Date ? new Date(test7Date) : null;
      if (test8Topic !== undefined) record.test8Topic = test8Topic || null;
      if (test8Date !== undefined) record.test8Date = test8Date ? new Date(test8Date) : null;
      if (test9Topic !== undefined) record.test9Topic = test9Topic || null;
      if (test9Date !== undefined) record.test9Date = test9Date ? new Date(test9Date) : null;
      if (test10Topic !== undefined) record.test10Topic = test10Topic || null;
      if (test10Date !== undefined) record.test10Date = test10Date ? new Date(test10Date) : null;
    } else {
      // Create new record
      record = recordBookRepository.create({
        studentId,
        teacherId,
        classId,
        subjectId,
        term: currentTerm,
        year: currentYear,
        test1: test1 !== undefined && test1 !== null && test1 !== '' ? parseInt(String(test1)) : null,
        test2: test2 !== undefined && test2 !== null && test2 !== '' ? parseInt(String(test2)) : null,
        test3: test3 !== undefined && test3 !== null && test3 !== '' ? parseInt(String(test3)) : null,
        test4: test4 !== undefined && test4 !== null && test4 !== '' ? parseInt(String(test4)) : null,
        test5: test5 !== undefined && test5 !== null && test5 !== '' ? parseInt(String(test5)) : null,
        test6: test6 !== undefined && test6 !== null && test6 !== '' ? parseInt(String(test6)) : null,
        test7: test7 !== undefined && test7 !== null && test7 !== '' ? parseInt(String(test7)) : null,
        test8: test8 !== undefined && test8 !== null && test8 !== '' ? parseInt(String(test8)) : null,
        test9: test9 !== undefined && test9 !== null && test9 !== '' ? parseInt(String(test9)) : null,
        test10: test10 !== undefined && test10 !== null && test10 !== '' ? parseInt(String(test10)) : null,
        test1Topic: test1Topic || null,
        test1Date: test1Date ? new Date(test1Date) : null,
        test2Topic: test2Topic || null,
        test2Date: test2Date ? new Date(test2Date) : null,
        test3Topic: test3Topic || null,
        test3Date: test3Date ? new Date(test3Date) : null,
        test4Topic: test4Topic || null,
        test4Date: test4Date ? new Date(test4Date) : null,
        test5Topic: test5Topic || null,
        test5Date: test5Date ? new Date(test5Date) : null,
        test6Topic: test6Topic || null,
        test6Date: test6Date ? new Date(test6Date) : null,
        test7Topic: test7Topic || null,
        test7Date: test7Date ? new Date(test7Date) : null,
        test8Topic: test8Topic || null,
        test8Date: test8Date ? new Date(test8Date) : null,
        test9Topic: test9Topic || null,
        test9Date: test9Date ? new Date(test9Date) : null,
        test10Topic: test10Topic || null,
        test10Date: test10Date ? new Date(test10Date) : null
      });
    }

    await recordBookRepository.save(record);

    res.json({ message: 'Marks saved successfully', record });
  } catch (error: any) {
    console.error('Error saving record book marks:', error);
    
    // Check if it's a database column error (migration not run)
    if (error.message?.includes('column') && error.message?.includes('subjectId')) {
      return res.status(500).json({ 
        message: 'Database migration required. Please run the migration to add subjectId column to record_books table.',
        error: 'Missing column: subjectId'
      });
    }
    
    // Check if it's a unique constraint violation
    if (error.code === '23505' || error.message?.includes('unique constraint')) {
      return res.status(400).json({ 
        message: 'A record book entry already exists for this student, teacher, class, subject, term, and year.',
        error: error.message 
      });
    }
    
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Batch save marks for multiple students
export const batchSaveRecordBookMarks = async (req: AuthRequest, res: Response) => {
  try {
    const { classId, subjectId, records, topics, testDates } = req.body;
    const teacherId = req.user?.teacher?.id;

    if (!teacherId) {
      return res.status(403).json({ message: 'Only teachers can save record book marks' });
    }

    if (!classId || !subjectId || !records || !Array.isArray(records)) {
      return res.status(400).json({ message: 'Class ID, Subject ID, and records array are required' });
    }

    // Verify teacher is assigned to this class
    const teacherRepository = AppDataSource.getRepository(Teacher);
    const teacher = await teacherRepository.findOne({
      where: { id: teacherId },
      relations: ['classes', 'subjects']
    });

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    const isAssigned = teacher.classes?.some(c => c.id === classId);
    if (!isAssigned) {
      return res.status(403).json({ message: 'You are not assigned to this class' });
    }

    // Verify teacher teaches this subject
    const teachesSubject = teacher.subjects?.some(s => s.id === subjectId);
    if (!teachesSubject) {
      return res.status(403).json({ message: 'You are not assigned to teach this subject' });
    }

    // Get current term and year from settings
    const settingsRepository = AppDataSource.getRepository(Settings);
    const settings = await settingsRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' }
    });

    const currentTerm = settings?.currentTerm || 'Term 1';
    const currentYear = settings?.academicYear || new Date().getFullYear().toString();

    const recordBookRepository = AppDataSource.getRepository(RecordBook);
    const savedRecords = [];

    for (const studentRecord of records) {
      const { studentId, test1, test2, test3, test4, test5, test6, test7, test8, test9, test10 } = studentRecord;

      if (!studentId) continue;

      let record = await recordBookRepository.findOne({
        where: {
          studentId,
          teacherId,
          classId,
          subjectId,
          term: currentTerm,
          year: currentYear
        }
      });

      if (record) {
        // Update existing record
        if (test1 !== undefined) record.test1 = test1 !== null && test1 !== '' ? parseFloat(String(test1)) : null;
        if (test2 !== undefined) record.test2 = test2 !== null && test2 !== '' ? parseFloat(String(test2)) : null;
        if (test3 !== undefined) record.test3 = test3 !== null && test3 !== '' ? parseFloat(String(test3)) : null;
        if (test4 !== undefined) record.test4 = test4 !== null && test4 !== '' ? parseFloat(String(test4)) : null;
        if (test5 !== undefined) record.test5 = test5 !== null && test5 !== '' ? parseFloat(String(test5)) : null;
        if (test6 !== undefined) record.test6 = test6 !== null && test6 !== '' ? parseFloat(String(test6)) : null;
        if (test7 !== undefined) record.test7 = test7 !== null && test7 !== '' ? parseFloat(String(test7)) : null;
        if (test8 !== undefined) record.test8 = test8 !== null && test8 !== '' ? parseFloat(String(test8)) : null;
        if (test9 !== undefined) record.test9 = test9 !== null && test9 !== '' ? parseFloat(String(test9)) : null;
        if (test10 !== undefined) record.test10 = test10 !== null && test10 !== '' ? parseFloat(String(test10)) : null;
        
        if (topics) {
          if (topics.test1 !== undefined) record.test1Topic = topics.test1 || null;
          if (testDates?.test1 !== undefined) record.test1Date = testDates.test1 ? new Date(testDates.test1) : null;
          if (topics.test2 !== undefined) record.test2Topic = topics.test2 || null;
          if (testDates?.test2 !== undefined) record.test2Date = testDates.test2 ? new Date(testDates.test2) : null;
          if (topics.test3 !== undefined) record.test3Topic = topics.test3 || null;
          if (testDates?.test3 !== undefined) record.test3Date = testDates.test3 ? new Date(testDates.test3) : null;
          if (topics.test4 !== undefined) record.test4Topic = topics.test4 || null;
          if (testDates?.test4 !== undefined) record.test4Date = testDates.test4 ? new Date(testDates.test4) : null;
          if (topics.test5 !== undefined) record.test5Topic = topics.test5 || null;
          if (testDates?.test5 !== undefined) record.test5Date = testDates.test5 ? new Date(testDates.test5) : null;
          if (topics.test6 !== undefined) record.test6Topic = topics.test6 || null;
          if (testDates?.test6 !== undefined) record.test6Date = testDates.test6 ? new Date(testDates.test6) : null;
          if (topics.test7 !== undefined) record.test7Topic = topics.test7 || null;
          if (testDates?.test7 !== undefined) record.test7Date = testDates.test7 ? new Date(testDates.test7) : null;
          if (topics.test8 !== undefined) record.test8Topic = topics.test8 || null;
          if (testDates?.test8 !== undefined) record.test8Date = testDates.test8 ? new Date(testDates.test8) : null;
          if (topics.test9 !== undefined) record.test9Topic = topics.test9 || null;
          if (testDates?.test9 !== undefined) record.test9Date = testDates.test9 ? new Date(testDates.test9) : null;
          if (topics.test10 !== undefined) record.test10Topic = topics.test10 || null;
          if (testDates?.test10 !== undefined) record.test10Date = testDates.test10 ? new Date(testDates.test10) : null;
        }
      } else {
        // Create new record
        record = recordBookRepository.create({
          studentId,
          teacherId,
          classId,
          subjectId,
          term: currentTerm,
          year: currentYear,
          test1: test1 !== undefined && test1 !== null && test1 !== '' ? parseInt(String(test1)) : null,
          test2: test2 !== undefined && test2 !== null && test2 !== '' ? parseInt(String(test2)) : null,
          test3: test3 !== undefined && test3 !== null && test3 !== '' ? parseInt(String(test3)) : null,
          test4: test4 !== undefined && test4 !== null && test4 !== '' ? parseInt(String(test4)) : null,
          test5: test5 !== undefined && test5 !== null && test5 !== '' ? parseInt(String(test5)) : null,
          test6: test6 !== undefined && test6 !== null && test6 !== '' ? parseInt(String(test6)) : null,
          test7: test7 !== undefined && test7 !== null && test7 !== '' ? parseInt(String(test7)) : null,
          test8: test8 !== undefined && test8 !== null && test8 !== '' ? parseInt(String(test8)) : null,
          test9: test9 !== undefined && test9 !== null && test9 !== '' ? parseInt(String(test9)) : null,
          test10: test10 !== undefined && test10 !== null && test10 !== '' ? parseInt(String(test10)) : null,
          test1Topic: topics?.test1 || null,
          test1Date: testDates?.test1 ? new Date(testDates.test1) : null,
          test2Topic: topics?.test2 || null,
          test2Date: testDates?.test2 ? new Date(testDates.test2) : null,
          test3Topic: topics?.test3 || null,
          test3Date: testDates?.test3 ? new Date(testDates.test3) : null,
          test4Topic: topics?.test4 || null,
          test4Date: testDates?.test4 ? new Date(testDates.test4) : null,
          test5Topic: topics?.test5 || null,
          test5Date: testDates?.test5 ? new Date(testDates.test5) : null,
          test6Topic: topics?.test6 || null,
          test6Date: testDates?.test6 ? new Date(testDates.test6) : null,
          test7Topic: topics?.test7 || null,
          test7Date: testDates?.test7 ? new Date(testDates.test7) : null,
          test8Topic: topics?.test8 || null,
          test8Date: testDates?.test8 ? new Date(testDates.test8) : null,
          test9Topic: topics?.test9 || null,
          test9Date: testDates?.test9 ? new Date(testDates.test9) : null,
          test10Topic: topics?.test10 || null,
          test10Date: testDates?.test10 ? new Date(testDates.test10) : null
        });
      }

      const saved = await recordBookRepository.save(record);
      savedRecords.push(saved);
    }

    res.json({ message: 'All marks saved successfully', count: savedRecords.length });
  } catch (error: any) {
    console.error('Error batch saving record book marks:', error);
    
    // Check if it's a database column error (migration not run)
    if (error.message?.includes('column') && error.message?.includes('subjectId')) {
      return res.status(500).json({ 
        message: 'Database migration required. Please run the migration to add subjectId column to record_books table.',
        error: 'Missing column: subjectId'
      });
    }
    
    // Check if it's a unique constraint violation
    if (error.code === '23505' || error.message?.includes('unique constraint')) {
      return res.status(400).json({ 
        message: 'A record book entry already exists for one or more students.',
        error: error.message 
      });
    }
    
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get record book for admin/superAdmin (for any teacher's class)
export const getRecordBookByClassForAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const { classId } = req.params;
    const { teacherId, subjectId } = req.query;
    const userRole = req.user?.role;

    // Check if user is admin or superAdmin
    if (userRole !== UserRole.ADMIN && userRole !== UserRole.SUPERADMIN) {
      return res.status(403).json({ message: 'Only administrators can access this endpoint' });
    }

    if (!teacherId) {
      return res.status(400).json({ message: 'Teacher ID is required' });
    }

    if (!subjectId) {
      return res.status(400).json({ message: 'Subject ID is required' });
    }

    // Get current term and year from settings
    const settingsRepository = AppDataSource.getRepository(Settings);
    const settings = await settingsRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' }
    });

    const currentTerm = settings?.currentTerm || 'Term 1';
    const currentYear = settings?.academicYear || new Date().getFullYear().toString();

    // Get all students in the class
    const studentRepository = AppDataSource.getRepository(Student);
    const students = await studentRepository.find({
      where: { classId, isActive: true },
      order: { lastName: 'ASC', firstName: 'ASC' }
    });

    // Get existing record book entries for this teacher, class, and subject
    const recordBookRepository = AppDataSource.getRepository(RecordBook);
    const records = await recordBookRepository.find({
      where: {
        classId,
        teacherId: teacherId as string,
        subjectId: subjectId as string,
        term: currentTerm,
        year: currentYear
      }
    });

    // Map records to students
    const recordsMap = new Map(records.map(r => [r.studentId, r]));

    const studentsWithRecords = students.map(student => {
      const record = recordsMap.get(student.id);
      return {
        studentId: student.id,
        studentNumber: student.studentNumber,
        lastName: student.lastName,
        firstName: student.firstName,
        test1: record?.test1 || null,
        test1Topic: record?.test1Topic || '',
        test1Date: record?.test1Date || null,
        test2: record?.test2 || null,
        test2Topic: record?.test2Topic || '',
        test2Date: record?.test2Date || null,
        test3: record?.test3 || null,
        test3Topic: record?.test3Topic || '',
        test3Date: record?.test3Date || null,
        test4: record?.test4 || null,
        test4Topic: record?.test4Topic || '',
        test4Date: record?.test4Date || null,
        test5: record?.test5 || null,
        test5Topic: record?.test5Topic || '',
        test5Date: record?.test5Date || null,
        test6: record?.test6 || null,
        test6Topic: record?.test6Topic || '',
        test6Date: record?.test6Date || null,
        test7: record?.test7 || null,
        test7Topic: record?.test7Topic || '',
        test7Date: record?.test7Date || null,
        test8: record?.test8 || null,
        test8Topic: record?.test8Topic || '',
        test8Date: record?.test8Date || null,
        test9: record?.test9 || null,
        test9Topic: record?.test9Topic || '',
        test9Date: record?.test9Date || null,
        test10: record?.test10 || null,
        test10Topic: record?.test10Topic || '',
        test10Date: record?.test10Date || null,
        recordId: record?.id || null
      };
    });

    res.json({
      students: studentsWithRecords,
      term: currentTerm,
      year: currentYear
    });
  } catch (error: any) {
    console.error('Error fetching record book for admin:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Generate PDF for record book (admin access)
export const generateRecordBookPDF = async (req: AuthRequest, res: Response) => {
  try {
    const { classId } = req.params;
    const { teacherId, subjectId } = req.query;
    const userRole = req.user?.role;

    // Check if user is admin or superAdmin
    if (userRole !== UserRole.ADMIN && userRole !== UserRole.SUPERADMIN) {
      return res.status(403).json({ message: 'Only administrators can generate PDFs' });
    }

    if (!teacherId) {
      return res.status(400).json({ message: 'Teacher ID is required' });
    }

    if (!subjectId) {
      return res.status(400).json({ message: 'Subject ID is required' });
    }

    // Get teacher info
    const teacherRepository = AppDataSource.getRepository(Teacher);
    const teacher = await teacherRepository.findOne({
      where: { id: teacherId as string }
    });

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    // Get class info
    const classRepository = AppDataSource.getRepository(Class);
    const classEntity = await classRepository.findOne({
      where: { id: classId }
    });

    if (!classEntity) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // Get subject info
    const subjectRepository = AppDataSource.getRepository(Subject);
    const subject = await subjectRepository.findOne({
      where: { id: subjectId as string }
    });

    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    // Get settings
    const settingsRepository = AppDataSource.getRepository(Settings);
    const settings = await settingsRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' }
    });

    const currentTerm = settings?.currentTerm || 'Term 1';
    const currentYear = settings?.academicYear || new Date().getFullYear().toString();

    // Get students and records
    const studentRepository = AppDataSource.getRepository(Student);
    const students = await studentRepository.find({
      where: { classId, isActive: true },
      order: { lastName: 'ASC', firstName: 'ASC' }
    });

    const recordBookRepository = AppDataSource.getRepository(RecordBook);
    const records = await recordBookRepository.find({
      where: {
        classId,
        teacherId: teacherId as string,
        subjectId: subjectId as string,
        term: currentTerm,
        year: currentYear
      }
    });

    // Generate PDF using pdfkit
    const pdfBuffer = await createRecordBookPDF({
      teacher,
      classEntity,
      subject,
      students,
      records,
      term: currentTerm,
      year: currentYear,
      settings
    });

    // Create filename
    const teacherName = `${teacher.lastName}_${teacher.firstName}`.replace(/\s+/g, '_');
    const className = classEntity.name.replace(/\s+/g, '_');
    const subjectName = subject.name.replace(/\s+/g, '_');
    const filename = `RecordBook_${teacherName}_${className}_${subjectName}_${currentTerm}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Error generating record book PDF:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

