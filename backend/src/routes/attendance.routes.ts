import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import {
  markAttendance,
  getAttendance,
  getAttendanceReport,
  getStudentTotalAttendance,
  getAttendanceAnalytics
} from '../controllers/attendance.controller';

const router = Router();

// Mark attendance (bulk for a class on a date)
router.post('/', authenticate, authorize(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.DEMO_USER), markAttendance);

// Get attendance records
router.get('/', authenticate, authorize(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.DEMO_USER), getAttendance);

// Get attendance report for a class
router.get('/report', authenticate, authorize(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.DEMO_USER), getAttendanceReport);

// Get total attendance for a student (for report cards)
router.get('/student/total', authenticate, getStudentTotalAttendance);

// Get advanced attendance analytics
router.get('/analytics', authenticate, getAttendanceAnalytics);

export default router;

