import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import * as enrollmentController from '../controllers/enrollment.controller';

const router = Router();

// All enrollment routes require authentication
router.use(authenticate);

// Bulk class migration — administrators only (before the broader role gate below)
router.get(
  '/migrate-class/preview',
  authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER),
  enrollmentController.getMigrateClassPreview
);
router.post(
  '/migrate-class',
  authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER),
  enrollmentController.migrateClassEnrollments
);

router.use(
  authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.TEACHER)
);

// Enroll a student
router.post('/', enrollmentController.enrollStudent);

// Withdraw a student
router.post('/withdraw', enrollmentController.withdrawStudent);

// Get all enrollments with filters
router.get('/', enrollmentController.getAllEnrollments);

// Get unenrolled students
router.get('/unenrolled', enrollmentController.getUnenrolledStudents);

// Get enrollment history for a specific student
router.get('/student/:studentId', enrollmentController.getStudentEnrollmentHistory);

export default router;

