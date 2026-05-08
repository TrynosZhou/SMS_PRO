import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import {
  getParentStudents,
  linkStudent,
  linkStudentByIdAndDob,
  unlinkStudent,
  searchStudents
} from '../controllers/parent.controller';

const router = Router();

// All routes require authentication and parent role (or demo user for testing)
router.use(authenticate);
router.use(authorize(UserRole.PARENT, UserRole.DEMO_USER, UserRole.ADMIN, UserRole.SUPERADMIN));

router.get('/students', getParentStudents);
router.post('/link-student', linkStudent);
router.post('/link-student-by-id-dob', linkStudentByIdAndDob);
router.delete('/unlink-student/:studentId', unlinkStudent);
router.get('/search-students', searchStudents);

export default router;

