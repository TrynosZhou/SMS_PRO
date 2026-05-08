import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import {
  listReleases,
  createRelease,
  generateFromTerms,
  processScheduled,
  bulkUpdate,
  updateRelease,
  deleteRelease,
} from '../controllers/reportRelease.controller';

const router = Router();

router.get('/', authenticate, listReleases);
router.post('/', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), createRelease);
router.post('/generate-from-terms', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), generateFromTerms);
router.post('/process-scheduled', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), processScheduled);
router.post('/bulk-update', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), bulkUpdate);
router.put('/:id', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), updateRelease);
router.delete('/:id', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), deleteRelease);

export default router;
