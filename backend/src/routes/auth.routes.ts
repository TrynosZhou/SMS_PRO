import { Router } from 'express';
import {
  login,
  register,
  requestPasswordReset,
  verifyStudentPasswordReset,
  verifyTeacherPasswordReset,
  confirmPasswordReset,
  logout,
  studentLogin,
} from '../controllers/auth.controller';

const router = Router();

router.post('/login', login);
router.post('/student/login', studentLogin);
router.post('/register', register);
router.post('/reset-password', requestPasswordReset);
router.post('/reset-password/student/verify', verifyStudentPasswordReset);
router.post('/reset-password/teacher/verify', verifyTeacherPasswordReset);
router.post('/reset-password/confirm', confirmPasswordReset);
router.post('/logout', logout);

export default router;

