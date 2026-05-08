import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import {
  getRecordBookByClass,
  saveRecordBookMarks,
  batchSaveRecordBookMarks,
  getRecordBookByClassForAdmin,
  generateRecordBookPDF
} from '../controllers/recordBook.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Teacher routes
router.get('/class/:classId', authorize(UserRole.TEACHER, UserRole.DEMO_USER), getRecordBookByClass);
router.post('/marks', authorize(UserRole.TEACHER, UserRole.DEMO_USER), saveRecordBookMarks);
router.post('/marks/batch', authorize(UserRole.TEACHER, UserRole.DEMO_USER), batchSaveRecordBookMarks);

// Admin routes
router.get('/admin/class/:classId', authorize(UserRole.ADMIN, UserRole.SUPERADMIN), getRecordBookByClassForAdmin);
router.get('/admin/pdf/:classId', authorize(UserRole.ADMIN, UserRole.SUPERADMIN), generateRecordBookPDF);

export default router;

