import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { generateAIComment, generateBatchComments } from '../utils/aiCommentGenerator';
import { ReportCardRemarks } from '../entities/ReportCardRemarks';
import { UserRole } from '../entities/User';

/**
 * Generate AI comment for a student's report card
 */
export const generateComment = async (req: AuthRequest, res: Response) => {
  try {
    const { studentId, term, commentType } = req.body;

    if (!studentId || !term) {
      return res.status(400).json({ message: 'Student ID and term are required' });
    }

    const type = commentType === 'headmaster' ? 'headmaster' : 'classTeacher';
    const comment = await generateAIComment(studentId, term, type);

    res.json({
      success: true,
      comment,
      studentId,
      term,
      commentType: type
    });
  } catch (error: any) {
    console.error('Error generating AI comment:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

/**
 * Generate and save AI comment to report card remarks
 */
export const generateAndSaveComment = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    const { studentId, term, examType, commentType } = req.body;

    if (!studentId || !term || !examType) {
      return res.status(400).json({ message: 'Student ID, term, and exam type are required' });
    }

    // Check permissions
    const type = commentType === 'headmaster' ? 'headmaster' : 'classTeacher';
    
    if (type === 'headmaster' && user?.role !== UserRole.ADMIN && user?.role !== UserRole.SUPERADMIN) {
      return res.status(403).json({ message: 'Only administrators can generate headmaster comments' });
    }

    // Generate comment
    const comment = await generateAIComment(studentId, term, type);

    // Save to report card remarks
    const remarksRepository = AppDataSource.getRepository(ReportCardRemarks);
    
    // Get student's class
    const { Student } = await import('../entities/Student');
    const studentRepository = AppDataSource.getRepository(Student);
    const student = await studentRepository.findOne({
      where: { id: studentId },
      relations: ['classEntity']
    });

    if (!student || !student.classId) {
      return res.status(404).json({ message: 'Student or class not found' });
    }

    // Find or create remarks record
    let remarks = await remarksRepository.findOne({
      where: {
        studentId,
        classId: student.classId,
        examType
      }
    });

    if (!remarks) {
      remarks = remarksRepository.create({
        studentId,
        classId: student.classId,
        examType
      });
    }

    // Update the appropriate comment field
    if (type === 'headmaster') {
      remarks.headmasterRemarks = comment;
      remarks.headmasterId = user?.id || null;
    } else {
      remarks.classTeacherRemarks = comment;
      remarks.classTeacherId = user?.id || null;
    }

    await remarksRepository.save(remarks);

    res.json({
      success: true,
      comment,
      remarks,
      studentId,
      term,
      commentType: type
    });
  } catch (error: any) {
    console.error('Error generating and saving AI comment:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

/**
 * Batch generate comments for multiple students
 */
export const generateBatchCommentsForClass = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    const { classId, term, examType, commentType } = req.body;

    if (!classId || !term || !examType) {
      return res.status(400).json({ message: 'Class ID, term, and exam type are required' });
    }

    // Check permissions
    const type = commentType === 'headmaster' ? 'headmaster' : 'classTeacher';
    
    if (type === 'headmaster' && user?.role !== UserRole.ADMIN && user?.role !== UserRole.SUPERADMIN) {
      return res.status(403).json({ message: 'Only administrators can generate headmaster comments' });
    }

    // Get all students in the class
    const { Student } = await import('../entities/Student');
    const studentRepository = AppDataSource.getRepository(Student);
    const students = await studentRepository.find({
      where: { classId, isActive: true }
    });

    if (students.length === 0) {
      return res.status(404).json({ message: 'No students found in the class' });
    }

    const studentIds = students.map(s => s.id);
    const comments = await generateBatchComments(studentIds, term, type);

    // Save comments to report card remarks
    const remarksRepository = AppDataSource.getRepository(ReportCardRemarks);
    const savedRemarks = [];

    for (const student of students) {
      const comment = comments[student.id];
      if (!comment) continue;

      let remarks = await remarksRepository.findOne({
        where: {
          studentId: student.id,
          classId,
          examType
        }
      });

      if (!remarks) {
        remarks = remarksRepository.create({
          studentId: student.id,
          classId,
          examType
        });
      }

      if (type === 'headmaster') {
        remarks.headmasterRemarks = comment;
        remarks.headmasterId = user?.id || null;
      } else {
        remarks.classTeacherRemarks = comment;
        remarks.classTeacherId = user?.id || null;
      }

      await remarksRepository.save(remarks);
      savedRemarks.push({
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        comment
      });
    }

    res.json({
      success: true,
      message: `Generated ${savedRemarks.length} comments successfully`,
      total: students.length,
      generated: savedRemarks.length,
      remarks: savedRemarks
    });
  } catch (error: any) {
    console.error('Error generating batch comments:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

