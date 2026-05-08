import * as fs from 'fs';
import * as path from 'path';
import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/User';
import { ETask } from '../entities/ETask';
import { Teacher } from '../entities/Teacher';
import { Student } from '../entities/Student';
import { ETaskSubmission } from '../entities/ETaskSubmission';

async function getTeacherForUser(userId: string): Promise<Teacher | null> {
  const repo = AppDataSource.getRepository(Teacher);
  return repo.findOne({
    where: { userId },
    relations: ['classes']
  });
}

/** Match student row to login (JWT studentRecordId, then username + userId). */
async function getStudentForLoggedInStudentUser(req: AuthRequest): Promise<Student | null> {
  if (!req.user) {
    return null;
  }
  const repo = AppDataSource.getRepository(Student);
  const rid = req.authStudentRecordId;
  if (rid) {
    const byJwt = await repo.findOne({
      where: { id: rid, userId: req.user.id }
    });
    if (byJwt) {
      return byJwt;
    }
  }
  let row = await repo.findOne({
    where: { userId: req.user.id, studentNumber: req.user.username }
  });
  if (!row) {
    row = await repo.findOne({ where: { userId: req.user.id } });
  }
  return row;
}

function teacherHasClass(teacher: Teacher, classId: string): boolean {
  return !!(teacher.classes && teacher.classes.some((c) => c.id === classId));
}

export const createETask = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== UserRole.TEACHER) {
      return res.status(403).json({ message: 'Only teachers can create tasks' });
    }

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const teacher = await getTeacherForUser(req.user.id);
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher profile not found' });
    }

    const title = (req.body?.title || '').trim();
    const taskType = req.body?.taskType as string;
    const classId = (req.body?.classId || '').trim();
    const description = (req.body?.description || '').trim() || null;
    const dueDateRaw = (req.body?.dueDate || '').trim();

    if (!title) {
      return res.status(400).json({ message: 'Title is required' });
    }
    if (taskType !== 'assignment' && taskType !== 'test' && taskType !== 'notes') {
      return res.status(400).json({ message: 'Task type must be assignment, test, or notes' });
    }
    if (!classId) {
      return res.status(400).json({ message: 'Class is required' });
    }

    const reloaded = await AppDataSource.getRepository(Teacher).findOne({
      where: { id: teacher.id },
      relations: ['classes']
    });
    if (!reloaded || !teacherHasClass(reloaded, classId)) {
      return res.status(403).json({ message: 'You are not assigned to this class' });
    }

    let attachmentUrl: string | null = null;
    if (req.file) {
      attachmentUrl = `/uploads/etasks/${req.file.filename}`;
    }

    let dueDate: Date | null = null;
    if (dueDateRaw) {
      const d = new Date(dueDateRaw);
      if (!isNaN(d.getTime())) {
        dueDate = d;
      }
    }

    const taskRepo = AppDataSource.getRepository(ETask);
    const task = taskRepo.create({
      title,
      description,
      taskType: taskType as 'assignment' | 'test' | 'notes',
      teacherId: teacher.id,
      classId,
      attachmentUrl,
      dueDate
    });
    await taskRepo.save(task);

    const full = await taskRepo.findOne({
      where: { id: task.id },
      relations: ['teacher', 'classEntity']
    });

    res.status(201).json({
      message: 'Task created and sent to students in this class',
      task: full
    });
  } catch (error: any) {
    console.error('[createETask]', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const listTeacherETasks = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== UserRole.TEACHER) {
      return res.status(403).json({ message: 'Only teachers can view this list' });
    }

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const teacher = await getTeacherForUser(req.user.id);
    if (!teacher) {
      return res.json([]);
    }

    const tasks = await AppDataSource.getRepository(ETask).find({
      where: { teacherId: teacher.id },
      relations: ['classEntity'],
      order: { sentAt: 'DESC' }
    });

    res.json(tasks);
  } catch (error: any) {
    console.error('[listTeacherETasks]', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const listStudentETasks = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== UserRole.STUDENT) {
      return res.status(403).json({ message: 'Only students can view this list' });
    }

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const student = await getStudentForLoggedInStudentUser(req);

    if (!student?.classId) {
      return res.json([]);
    }

    const tasks = await AppDataSource.getRepository(ETask).find({
      where: { classId: student.classId },
      relations: ['teacher', 'classEntity'],
      order: { sentAt: 'DESC' }
    });

    res.json(tasks);
  } catch (error: any) {
    console.error('[listStudentETasks]', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getStudentETaskById = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== UserRole.STUDENT) {
      return res.status(403).json({ message: 'Only students can view this' });
    }

    const { id } = req.params;
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const student = await getStudentForLoggedInStudentUser(req);

    if (!student?.classId) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const task = await AppDataSource.getRepository(ETask).findOne({
      where: { id },
      relations: ['teacher', 'classEntity']
    });

    if (!task || task.classId !== student.classId) {
      return res.status(404).json({ message: 'Task not found' });
    }

    res.json(task);
  } catch (error: any) {
    console.error('[getStudentETaskById]', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

function unlinkSubmissionFileIfLocal(fileUrl: string | null | undefined): void {
  if (!fileUrl || !fileUrl.startsWith('/uploads/etasks/submissions/')) {
    return;
  }
  const name = fileUrl.split('/').pop();
  if (!name) {
    return;
  }
  const abs = path.join(__dirname, '../../../uploads/etasks/submissions', name);
  try {
    if (fs.existsSync(abs)) {
      fs.unlinkSync(abs);
    }
  } catch (e) {
    console.warn('[submitStudentETask] Could not remove old file:', e);
  }
}

/** Student: upload or replace submission for a task in their class. */
export const submitStudentETask = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== UserRole.STUDENT) {
      return res.status(403).json({ message: 'Only students can submit work' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'Please attach a file (PDF, Word, image, etc.)' });
    }

    const { taskId } = req.params;
    if (!taskId) {
      return res.status(400).json({ message: 'Task id is required' });
    }

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const student = await getStudentForLoggedInStudentUser(req);
    if (!student?.classId) {
      return res.status(403).json({ message: 'Student class not set' });
    }

    const task = await AppDataSource.getRepository(ETask).findOne({
      where: { id: taskId }
    });
    if (!task || task.classId !== student.classId) {
      return res.status(404).json({ message: 'Task not found' });
    }
    if (task.taskType === 'notes') {
      return res.status(400).json({ message: 'Notes are view-only; submissions apply to assignments and tests only.' });
    }

    const noteRaw = (req.body?.note ?? req.body?.submissionNote ?? '') as string;
    const note = String(noteRaw).trim() || null;
    const fileUrl = `/uploads/etasks/submissions/${req.file.filename}`;

    const subRepo = AppDataSource.getRepository(ETaskSubmission);
    let existing = await subRepo.findOne({
      where: { eTaskId: taskId, studentId: student.id }
    });

    if (existing) {
      unlinkSubmissionFileIfLocal(existing.fileUrl);
      existing.fileUrl = fileUrl;
      existing.note = note;
      await subRepo.save(existing);
      return res.json({
        message: 'Submission updated',
        submission: existing
      });
    }

    const created = subRepo.create({
      eTaskId: taskId,
      studentId: student.id,
      fileUrl,
      note
    });
    await subRepo.save(created);
    res.status(201).json({
      message: 'Submission uploaded',
      submission: created
    });
  } catch (error: any) {
    console.error('[submitStudentETask]', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

/** Student: all own submissions (with task), for the e-learning UI. */
export const listStudentMySubmissions = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== UserRole.STUDENT) {
      return res.status(403).json({ message: 'Only students can view this' });
    }

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const student = await getStudentForLoggedInStudentUser(req);
    if (!student?.classId) {
      return res.json([]);
    }

    const subs = await AppDataSource.getRepository(ETaskSubmission).find({
      where: { studentId: student.id },
      relations: ['eTask'],
      order: { submittedAt: 'DESC' }
    });

    const filtered = subs.filter((s) => s.eTask && s.eTask.classId === student.classId);
    res.json(filtered);
  } catch (error: any) {
    console.error('[listStudentMySubmissions]', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

/** Student: current submission for a task (if any). */
export const getStudentSubmissionForTask = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== UserRole.STUDENT) {
      return res.status(403).json({ message: 'Only students can view this' });
    }

    const { taskId } = req.params;
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const student = await getStudentForLoggedInStudentUser(req);
    if (!student?.classId) {
      return res.json({ submission: null });
    }

    const task = await AppDataSource.getRepository(ETask).findOne({ where: { id: taskId } });
    if (!task || task.classId !== student.classId) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const sub = await AppDataSource.getRepository(ETaskSubmission).findOne({
      where: { eTaskId: taskId, studentId: student.id }
    });

    res.json({ submission: sub });
  } catch (error: any) {
    console.error('[getStudentSubmissionForTask]', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

/** Teacher: all submissions for tasks they created. */
export const listTeacherSubmissions = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== UserRole.TEACHER) {
      return res.status(403).json({ message: 'Only teachers can view submissions' });
    }

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const teacher = await getTeacherForUser(req.user.id);
    if (!teacher) {
      return res.json([]);
    }

    const rows = await AppDataSource.getRepository(ETaskSubmission)
      .createQueryBuilder('sub')
      .innerJoinAndSelect('sub.eTask', 'task')
      .innerJoinAndSelect('sub.student', 'student')
      .where('task.teacherId = :tid', { tid: teacher.id })
      .orderBy('sub.submittedAt', 'DESC')
      .getMany();

    res.json(rows);
  } catch (error: any) {
    console.error('[listTeacherSubmissions]', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

function unlinkEtaskAttachmentIfLocal(attachmentUrl: string | null | undefined): void {
  if (!attachmentUrl || !attachmentUrl.startsWith('/uploads/etasks/')) {
    return;
  }

  const name = path.basename(attachmentUrl);
  if (!name || name === '.' || name === '..') {
    return;
  }

  const abs = path.join(__dirname, '../../../uploads/etasks', name);
  try {
    if (fs.existsSync(abs)) {
      fs.unlinkSync(abs);
    }
  } catch (e) {
    // Deleting tasks should not fail if the file is missing.
    console.warn('[deleteTeacherETask] Could not remove attachment file:', e);
  }
}

/** Teacher: delete a task (assignment/test) they created. */
export const deleteTeacherETask = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== UserRole.TEACHER) {
      return res.status(403).json({ message: 'Only teachers can delete tasks' });
    }
    if (!req.params?.taskId) {
      return res.status(400).json({ message: 'taskId is required' });
    }

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { taskId } = req.params;
    const teacher = await getTeacherForUser(req.user.id);
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher profile not found' });
    }

    const taskRepo = AppDataSource.getRepository(ETask);
    const task = await taskRepo.findOne({ where: { id: taskId, teacherId: teacher.id } });

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Best-effort cleanup for local files.
    unlinkEtaskAttachmentIfLocal(task.attachmentUrl);

    const subRepo = AppDataSource.getRepository(ETaskSubmission);
    const subs = await subRepo.find({ where: { eTaskId: task.id } });
    for (const sub of subs) {
      unlinkSubmissionFileIfLocal(sub.fileUrl);
    }

    await taskRepo.delete({ id: task.id });

    res.json({ message: 'Task deleted' });
  } catch (error: any) {
    console.error('[deleteTeacherETask]', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};
