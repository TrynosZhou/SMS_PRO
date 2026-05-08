import { Router } from 'express';
import { getPaymentAuditLogs } from '../controllers/paymentAudit.controller';

const router = Router();

// GET /api/payments/audit-logs?startDate=...&endDate=...&search=...&paymentMethod=...&anomalyOnly=true&page=1&limit=20
router.get('/audit-logs', ...getPaymentAuditLogs);

export default router;

