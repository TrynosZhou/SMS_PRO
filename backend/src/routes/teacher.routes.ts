import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import {
  registerTeacher,
  getTeachers,
  getCurrentTeacher,
  getTeacherById,
  updateTeacher,
  deleteTeacher,
  getTeacherClasses,
  assignClassesToTeacher,
  getTeacherLoad,
  getSubjectAssignmentSummary,
  getTeacherSubjectAssignmentDetail,
  assignTeacherClassSubject,
  unassignTeacherClassSubject,
  createTeacherAccount,
  syncTeacherClasses,
  diagnoseTeacherClasses
} from '../controllers/teacher.controller';

const router = Router();

// IMPORTANT: /me must come BEFORE /:id to avoid matching 'me' as an id
router.post('/', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), registerTeacher);
router.get('/', authenticate, getTeachers);
router.get('/subject-assignment/summary', authenticate, getSubjectAssignmentSummary);
router.get('/me', authenticate, getCurrentTeacher); // Must be before /:id
router.post('/sync-classes', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN), syncTeacherClasses); // Sync endpoint
router.get('/:teacherId/diagnose', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN), diagnoseTeacherClasses); // Diagnostic endpoint
router.get('/:id/classes', authenticate, getTeacherClasses); // Specific routes before /:id
router.put('/:id/classes', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN), assignClassesToTeacher); // Assign classes
router.post(
  '/:id/class-subject',
  authenticate,
  authorize(UserRole.SUPERADMIN, UserRole.ADMIN),
  assignTeacherClassSubject
);
router.post(
  '/:id/class-subject/remove',
  authenticate,
  authorize(UserRole.SUPERADMIN, UserRole.ADMIN),
  unassignTeacherClassSubject
);
router.get('/:id/load', authenticate, getTeacherLoad); // Get teacher load
router.get('/:id/subject-assignment', authenticate, getTeacherSubjectAssignmentDetail);
router.get('/:id', authenticate, getTeacherById);
router.post('/:id/create-account', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), createTeacherAccount);
router.put('/:id', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), updateTeacher);
router.delete('/:id', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), deleteTeacher);

export default router;

