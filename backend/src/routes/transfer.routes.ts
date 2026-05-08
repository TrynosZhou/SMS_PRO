import { Router } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/User';
import * as transferController from '../controllers/transfer.controller';

const router = Router();

// All transfer routes require authentication and admin/superadmin access
router.use(authenticate);
router.use(authorize(UserRole.SUPERADMIN, UserRole.ADMIN));

// Initiate a transfer
router.post('/', transferController.initiateTransfer);

// Get all transfers with optional filters
router.get('/', transferController.getAllTransfers);

// Get transfer by ID
router.get('/:id', transferController.getTransferById);

// Get transfer history for a specific student
router.get('/student/:studentId', transferController.getStudentTransferHistory);

export default router;

