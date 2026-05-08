import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import {
  updateAccount,
  getAccountInfo,
  createUserAccount,
  adminResetTeacherPassword,
  listUsers,
  adminUpdateUser,
  adminDeleteUser,
  adminResetUserPassword,
} from '../controllers/account.controller';
import { UserRole } from '../entities/User';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get account info (all authenticated users)
router.get('/', getAccountInfo);

// Update account (all authenticated users - teachers, parents, students)
router.put('/', updateAccount);

// ── User management (admin/superadmin) ─────────────────────────────────────
router.get(
  '/users',
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN),
  listUsers
);

router.post(
  '/users',
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN),
  createUserAccount
);

router.put(
  '/users/:userId',
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN),
  adminUpdateUser
);

router.delete(
  '/users/:userId',
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN),
  adminDeleteUser
);

router.post(
  '/users/:userId/reset-password',
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.DEMO_USER, UserRole.PARENT),
  adminResetUserPassword
);

// Legacy: reset teacher password (kept for backward compat)
router.post(
  '/users/:userId/reset-teacher-password',
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.DEMO_USER, UserRole.PARENT),
  adminResetTeacherPassword
);

export default router;

