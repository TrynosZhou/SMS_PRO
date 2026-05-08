import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  processOnlinePayment,
  getInvoicePayments,
  getPayment,
  verifyPaymentStatus,
  generatePaymentReceipt
} from '../controllers/payment.controller';
import { getPaymentAuditLogs } from '../controllers/paymentAudit.controller';

const router = Router();

// Process online payment (available to all authenticated users - parents, students, etc.)
router.post('/process', authenticate, processOnlinePayment);

// Get payments for an invoice
router.get('/invoice/:invoiceId', authenticate, getInvoicePayments);

// Payment audit logs (define before generic /:id route)
router.get('/audit-logs', authenticate, getPaymentAuditLogs);

// Get payment by ID
router.get('/:id', authenticate, getPayment);

// Verify payment status
router.post('/:id/verify', authenticate, verifyPaymentStatus);

// Generate payment receipt
router.get('/:id/receipt', authenticate, generatePaymentReceipt);

export default router;

