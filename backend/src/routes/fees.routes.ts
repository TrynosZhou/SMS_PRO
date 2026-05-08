import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  createItem,
  updateItem,
  deleteItem,
} from '../controllers/fees.controller';

const router = Router();
const adminRoles = [UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT];

router.get('/categories', authenticate, getCategories);
router.post('/categories', authenticate, authorize(...adminRoles), createCategory);
router.put('/categories/:id', authenticate, authorize(...adminRoles), updateCategory);
router.delete('/categories/:id', authenticate, authorize(...adminRoles), deleteCategory);

router.post('/items', authenticate, authorize(...adminRoles), createItem);
router.put('/items/:id', authenticate, authorize(...adminRoles), updateItem);
router.delete('/items/:id', authenticate, authorize(...adminRoles), deleteItem);

export default router;
