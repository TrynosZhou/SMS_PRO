import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import {
  getPromotionRules,
  getPromotionRule,
  createPromotionRule,
  updatePromotionRule,
  deletePromotionRule,
  getActivePromotionRules
} from '../controllers/promotion-rule.controller';

const router = Router();

// Get all promotion rules
router.get('/', authenticate, getPromotionRules);

// Get active promotion rules (for promotion process)
router.get('/active', authenticate, getActivePromotionRules);

// Get a single promotion rule
router.get('/:id', authenticate, getPromotionRule);

// Create a new promotion rule
router.post('/', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.DEMO_USER), createPromotionRule);

// Update a promotion rule
router.put('/:id', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.DEMO_USER), updatePromotionRule);

// Delete a promotion rule
router.delete('/:id', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.DEMO_USER), deletePromotionRule);

export default router;

