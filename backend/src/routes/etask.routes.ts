import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import {
  createETask,
  listTeacherETasks,
  listStudentETasks,
  getStudentETaskById,
  submitStudentETask,
  getStudentSubmissionForTask,
  listStudentMySubmissions,
  listTeacherSubmissions,
  deleteTeacherETask
} from '../controllers/etask.controller';
import { uploadEtask } from '../utils/uploadEtask';
import { uploadEtaskSubmission } from '../utils/uploadEtaskSubmission';

const router = Router();

router.use(authenticate);

// Multer errors (file type / size) must be caught or Express returns 500 with no body
router.post(
  '/',
  authorize(UserRole.TEACHER),
  (req, res, next) => {
    uploadEtask.single('attachment')(req, res, (err: unknown) => {
      if (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        return res.status(400).json({ message: msg });
      }
      next();
    });
  },
  createETask
);

router.get('/teacher/mine', authorize(UserRole.TEACHER), listTeacherETasks);

router.get('/teacher/submissions', authorize(UserRole.TEACHER), listTeacherSubmissions);

// Teacher: delete their task (assignment/test)
router.delete('/teacher/:taskId', authorize(UserRole.TEACHER), deleteTeacherETask);

router.get('/student/mine', authorize(UserRole.STUDENT), listStudentETasks);

router.get('/student/submissions/mine', authorize(UserRole.STUDENT), listStudentMySubmissions);

router.get(
  '/student/:taskId/submission',
  authorize(UserRole.STUDENT),
  getStudentSubmissionForTask
);

router.post(
  '/student/submit/:taskId',
  authorize(UserRole.STUDENT),
  (req, res, next) => {
    uploadEtaskSubmission.single('file')(req, res, (err: unknown) => {
      if (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        return res.status(400).json({ message: msg });
      }
      next();
    });
  },
  submitStudentETask
);

router.get('/student/:id', authorize(UserRole.STUDENT), getStudentETaskById);

export default router;
