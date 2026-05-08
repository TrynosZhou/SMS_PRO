import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import {
  listParents,
  createParentAccount,
  resetParentPassword,
  getParentById,
  updateParent,
  deleteParent,
  adminLinkStudent,
  adminBulkLinkStudents,
  adminUnlinkStudent,
} from '../controllers/adminParent.controller';

const router = Router();

router.use(authenticate);
router.use(authorize(UserRole.ADMIN, UserRole.SUPERADMIN));

router.get('/parents', listParents);
router.post('/parents', createParentAccount);
router.get('/parents/:id', getParentById);
router.put('/parents/:id', updateParent);
router.delete('/parents/:id', deleteParent);
router.post('/parents/:id/reset-password', resetParentPassword);
router.post('/parents/:id/link-student', adminLinkStudent);
router.post('/parents/:id/link-students', adminBulkLinkStudents);
router.delete('/parents/:id/students/:studentId', adminUnlinkStudent);

export default router;
