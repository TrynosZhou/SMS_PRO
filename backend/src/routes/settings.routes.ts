import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import { 
  getSettings, 
  updateSettings, 
  getActiveTerm, 
  processOpeningDay, 
  processClosingDay, 
  getYearEndReminders,
  getUniformItems,
  createUniformItem,
  updateUniformItem,
  deleteUniformItem,
  getPublicSplashSettings,
  resetCoreData
} from '../controllers/settings.controller';
import {
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  updateDepartmentSubjects,
} from '../controllers/department.controller';
import {
  listTerms,
  createTerm,
  updateTerm,
  deleteTerm,
} from '../controllers/term.controller';

const router = Router();

router.get('/public/splash', getPublicSplashSettings);
router.get('/', authenticate, getSettings);
router.put('/', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), updateSettings);
router.get('/active-term', authenticate, getActiveTerm);
router.get('/reminders', authenticate, getYearEndReminders);
router.get('/uniform-items', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), getUniformItems);
router.post('/uniform-items', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), createUniformItem);
router.put('/uniform-items/:id', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), updateUniformItem);
router.delete('/uniform-items/:id', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), deleteUniformItem);

// Departments (school structure)
router.get('/departments', authenticate, listDepartments);
router.post('/departments', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), createDepartment);
router.put(
  '/departments/:id/subjects',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN),
  updateDepartmentSubjects
);
router.put('/departments/:id', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), updateDepartment);
router.delete('/departments/:id', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), deleteDepartment);
router.post('/opening-day', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), processOpeningDay);
router.post('/closing-day', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), processClosingDay);
router.post('/reset-data', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), resetCoreData);

// Academic Terms
router.get('/terms', authenticate, listTerms);
router.post('/terms', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), createTerm);
router.put('/terms/:id', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), updateTerm);
router.delete('/terms/:id', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), deleteTerm);

export default router;

