import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import {
  generateComment,
  generateAndSaveComment,
  generateBatchCommentsForClass
} from '../controllers/aiComment.controller';

const router = Router();

// Generate AI comment (doesn't save)
router.post('/generate', authenticate, generateComment);

// Generate and save AI comment
router.post('/generate-save', authenticate, generateAndSaveComment);

// Batch generate comments for a class
router.post('/generate-batch', authenticate, authorize(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPERADMIN), generateBatchCommentsForClass);

export default router;

