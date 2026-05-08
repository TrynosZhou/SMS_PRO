import { Router } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/User';
import * as enrollmentController from '../controllers/enrollment.controller';

const router = Router();

// All enrollment routes require authentication and admin access
router.use(authenticate);
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

