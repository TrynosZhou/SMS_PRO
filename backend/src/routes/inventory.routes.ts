import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import {
  getInventorySettings,
  updateInventorySettings,
  listTextbookCatalog,
  createTextbookCatalog,
  updateTextbookCatalog,
  deleteTextbookCatalog,
  addTextbookCopies,
  listTextbookCopies,
  deleteTextbookCopy,
  listFurniture,
  createFurniture,
  updateFurniture,
  permanentIssueTextbook,
  permanentReturnTextbook,
  borrowTextbook,
  returnLibraryLoan,
  issueFurniture,
  revokeFurnitureAssignment,
  transferFurnitureAdminToClassTeacher,
  listClassTeachersForFurniture,
  listMyFurniturePool,
  markTextbookLost,
  markFurnitureLost,
  recordDamageFine,
  recordLostItemFine,
  markFinePaid,
  waiveFine,
  getStudentInventorySummary,
  getMyInventorySummary,
  reportLostItems,
  reportTextbookIssuance,
  reportFurnitureIssuance,
  reportFurnitureWithClassTeachers,
  reportTextbooksAllocatedToHods,
  clearInvalidHodTextbookHoldings,
  reportTeacherTextbooksIssued,
  reportTeacherClassFurniture,
  reportLoanHistory,
  reportFines,
  listInventoryAudit,
  applyAutoLossForOverdueLoans,
  stockOverview,
  transferTextbooksAdminToHod,
  transferTextbooksHodToTeacher,
  transferTextbooksTeacherToStudent,
  returnTextbooksStudentToTeacher,
  listHodUsers,
  listDepartmentTeachersForHod,
  listMyHeldTextbooks,
  countHodIssuedToTeachers,
  listBlockedStudentsForTextbookIssue,
} from '../controllers/inventory.controller';

const router = Router();

router.use(authenticate);

router.get('/settings', getInventorySettings);
router.put('/settings', updateInventorySettings);

router.get('/stock/overview', stockOverview);

router.get('/textbook-catalog', listTextbookCatalog);
router.post('/textbook-catalog', createTextbookCatalog);
router.put('/textbook-catalog/:id', updateTextbookCatalog);
router.delete('/textbook-catalog/:id', deleteTextbookCatalog);
router.post('/textbook-catalog/:id/copies', addTextbookCopies);
router.get('/textbook-copies', listTextbookCopies);
router.delete('/textbook-copies/:id', deleteTextbookCopy);

router.get('/furniture', listFurniture);
router.post('/furniture', createFurniture);
router.put('/furniture/:id', updateFurniture);

router.post('/transactions/permanent-issue', permanentIssueTextbook);
router.post('/transactions/permanent-return', permanentReturnTextbook);
router.post('/transactions/borrow', borrowTextbook);
router.post('/transactions/return-loan', returnLibraryLoan);
router.post('/transactions/furniture-issue', issueFurniture);
router.post('/transactions/furniture-revoke', revokeFurnitureAssignment);
router.post('/furniture/transfer/admin-to-class-teacher', transferFurnitureAdminToClassTeacher);
router.get('/users/class-teachers-furniture', listClassTeachersForFurniture);
router.get('/furniture/me/pool', listMyFurniturePool);

// Chain-of-custody textbook transfers (Admin → HOD → Teacher → Student)
router.post(
  '/textbooks/admin/clear-invalid-hod-holdings',
  authorize(UserRole.SUPERADMIN, UserRole.ADMIN),
  clearInvalidHodTextbookHoldings
);
router.post('/textbooks/transfer/admin-to-hod', transferTextbooksAdminToHod);
router.post('/textbooks/transfer/hod-to-teacher', transferTextbooksHodToTeacher);
router.post('/textbooks/transfer/teacher-to-student', transferTextbooksTeacherToStudent);
router.post('/textbooks/return/student-to-teacher', returnTextbooksStudentToTeacher);

// Admin helpers
router.get('/users/hods', listHodUsers);
router.get('/users/department-teachers', listDepartmentTeachersForHod);
router.get('/textbooks/me/held', listMyHeldTextbooks);
router.get('/textbooks/hod/issued-to-teachers-count', countHodIssuedToTeachers);
router.get('/textbooks/issue/blocked-students-in-class', listBlockedStudentsForTextbookIssue);

router.post('/items/textbook/:id/mark-lost', markTextbookLost);
router.post('/items/furniture/:id/mark-lost', markFurnitureLost);

router.post('/fines/damage-furniture', recordDamageFine);
router.post('/fines/lost-item', recordLostItemFine);
router.post('/fines/:id/mark-paid', markFinePaid);
router.post('/fines/:id/waive', waiveFine);

router.get('/students/:studentId/summary', getStudentInventorySummary);
router.get('/me/summary', getMyInventorySummary);

router.get('/reports/lost', reportLostItems);
router.get('/reports/textbook-issuance', reportTextbookIssuance);
router.get('/reports/furniture-issuance', reportFurnitureIssuance);
router.get('/reports/furniture-with-class-teachers', reportFurnitureWithClassTeachers);
router.get('/reports/textbooks-allocated-to-hods', reportTextbooksAllocatedToHods);
router.get('/reports/teacher-textbooks-issued', reportTeacherTextbooksIssued);
router.get('/reports/teacher-class-furniture', reportTeacherClassFurniture);
router.get('/reports/loan-history', reportLoanHistory);
router.get('/reports/fines', reportFines);

router.get('/audit', listInventoryAudit);
router.post('/jobs/apply-auto-loss', applyAutoLossForOverdueLoans);

export default router;
