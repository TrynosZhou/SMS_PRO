import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import {
  listPermissions,
  createPermission,
  updatePermission,
  deletePermission,
  listRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
} from '../controllers/rolesPermissions.controller';

const router = Router();

router.get('/permissions', authenticate, listPermissions);
router.post('/permissions', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), createPermission);
router.put('/permissions/:id', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), updatePermission);
router.delete('/permissions/:id', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), deletePermission);
router.get('/', authenticate, listRoles);
router.get('/:id', authenticate, getRoleById);
router.post('/', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), createRole);
router.put('/:id', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), updateRole);
router.delete('/:id', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), deleteRole);

export default router;
