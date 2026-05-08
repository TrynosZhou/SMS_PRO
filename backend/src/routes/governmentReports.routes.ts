import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import {
  generateEnrollmentReport,
  generateAcademicPerformanceReport,
  generateAttendanceReport,
  generateComprehensiveReport
} from '../controllers/governmentReports.controller';

const router = Router();

// All routes require admin access
router.get('/enrollment', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), generateEnrollmentReport);
router.get('/academic-performance', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), generateAcademicPerformanceReport);
router.get('/attendance', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), generateAttendanceReport);
router.get('/comprehensive', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), generateComprehensiveReport);

export default router;

