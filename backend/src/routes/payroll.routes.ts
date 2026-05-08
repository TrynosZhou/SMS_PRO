import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import {
  getPayrollEmployees,
  createPayrollEmployee,
  updatePayrollEmployee,
  deletePayrollEmployee,
  getSalaryStructures,
  upsertSalaryStructure,
  generatePayrollRun,
  getPayrollRuns,
  getPayrollRunDetails,
  adjustPayrollLine,
  approvePayrollRun,
  payPayrollRun,
  getPayrollPayslips,
  downloadPayrollPayslip,
  previewPayrollPayslipPdf,
  getPayrollMonthlySummary,
  getPayrollDepartmentReport,
  getLeaveDashboard,
  createLeaveRecord,
  getLeaveRecords,
  getLeaveDepartmentSummary,
  getLeaveLiabilityReport,
  getLeavePolicy,
  updateLeavePolicy,
  createLeaveLiabilityAudit,
  getLeaveLiabilityAudits,
} from '../controllers/payroll.controller';

const router = Router();

// Employee management
router.get('/employees', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), getPayrollEmployees);
router.post('/employees', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), createPayrollEmployee);
router.put('/employees/:id', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), updatePayrollEmployee);
router.delete('/employees/:id', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), deletePayrollEmployee);

// Salary structures
router.get('/salary-structures', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), getSalaryStructures);
router.post('/salary-structures', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), upsertSalaryStructure);
router.put('/salary-structures/:id', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), upsertSalaryStructure);

// Payroll runs — register /runs/generate before /runs/:id so paths like "generate" are not captured as ids
router.get('/runs', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), getPayrollRuns);
router.post('/runs/generate', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), generatePayrollRun);
router.get(
  '/runs/:runId/lines/:lineId/preview-payslip',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT),
  previewPayrollPayslipPdf
);
router.get('/runs/:id', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), getPayrollRunDetails);
router.post('/runs/:id/adjust', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), adjustPayrollLine);
router.post('/runs/:id/approve', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), approvePayrollRun);
router.post('/runs/:id/pay', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), payPayrollRun);

// Payslips
router.get('/payslips', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), getPayrollPayslips);
router.get('/payslips/:id/download', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), downloadPayrollPayslip);

// Payroll reports
router.get('/reports/monthly-summary', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), getPayrollMonthlySummary);
router.get('/reports/department', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), getPayrollDepartmentReport);
router.get('/leave/dashboard', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), getLeaveDashboard);
router.post('/leave/records', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), createLeaveRecord);
router.get('/leave/records', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), getLeaveRecords);
router.get('/leave/reports/department-summary', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), getLeaveDepartmentSummary);
router.get('/leave/reports/liability', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), getLeaveLiabilityReport);
router.get('/leave/policy', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), getLeavePolicy);
router.put('/leave/policy', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), updateLeavePolicy);
router.post('/leave/reports/liability/audit', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), createLeaveLiabilityAudit);
router.get('/leave/reports/liability/audits', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), getLeaveLiabilityAudits);

export default router;

