import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import {
  createInvoice,
  getInvoices,
  updateInvoicePayment,
  calculateNextTermBalance,
  createBulkInvoices,
  generateInvoicePDF,
  generateReceiptPDF,
  getStudentBalance,
  getOutstandingBalances,
  getFinancialReports,
  correctPrepaidCarryForward,
  applyCreditNote,
  applyDebitNote,
  addUniformToInvoice,
  rebuildOpeningInvoice,
} from '../controllers/finance.controller';
import {
  listFeeExemptions,
  getFeeExemptionsByStudent,
  createFeeExemption,
  updateFeeExemption,
  deleteFeeExemption,
  recalculateFeeInvoicesForStudent,
} from '../controllers/exemption.controller';

const router = Router();

// --- POST: literal paths first (before any /:id routes) ---
router.post('/', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), createInvoice);
router.post('/bulk', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), createBulkInvoices);
router.post('/calculate-balance', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), calculateNextTermBalance);
router.post('/correct-prepaid', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), correctPrepaidCarryForward);
router.post('/credit-note', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), applyCreditNote);
router.post('/debit-note', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), applyDebitNote);
router.post('/add-uniform', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), addUniformToInvoice);
router.post(
  '/invoices/rebuild-opening',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER),
  rebuildOpeningInvoice
);
router.post(
  '/exemptions/recalculate-invoices',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER),
  recalculateFeeInvoicesForStudent
);
router.post(
  '/exemptions',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER),
  createFeeExemption
);

// --- GET / PUT: list + static paths, then parameterized ---
router.get('/exemptions/student/:studentId', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), getFeeExemptionsByStudent);
router.get(
  '/exemptions',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER),
  listFeeExemptions
);
router.get('/', authenticate, getInvoices);
router.get('/balance', authenticate, getStudentBalance);
router.get('/outstanding-balances', authenticate, getOutstandingBalances);
router.get(
  '/financial-reports',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER),
  getFinancialReports
);
router.get('/:id/pdf', authenticate, generateInvoicePDF);
router.get('/:id/receipt', authenticate, generateReceiptPDF);
router.put('/:id/payment', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), updateInvoicePayment);
router.put(
  '/exemptions/:id',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER),
  updateFeeExemption
);
router.delete(
  '/exemptions/:id',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER),
  deleteFeeExemption
);

export default router;
