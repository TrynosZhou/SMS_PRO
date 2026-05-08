import { Router } from 'express';
import authRoutes from './auth.routes';
import studentRoutes from './student.routes';
import examRoutes from './exam.routes';
import financeRoutes from './finance.routes';
import teacherRoutes from './teacher.routes';
import classRoutes from './class.routes';
import subjectRoutes from './subject.routes';
import settingsRoutes from './settings.routes';
import parentRoutes from './parent.routes';
import accountRoutes from './account.routes';
import messageRoutes from './message.routes';
import attendanceRoutes from './attendance.routes';
import promotionRuleRoutes from './promotion-rule.routes';
import recordBookRoutes from './recordBook.routes';
import transferRoutes from './transfer.routes';
import enrollmentRoutes from './enrollment.routes';
import timetableRoutes from './timetable.routes';
import paymentRoutes from './payment.routes';
import paymentAuditRoutes from './paymentAudit.routes';
import aiCommentRoutes from './aiComment.routes';
import governmentReportsRoutes from './governmentReports.routes';
import userActivityRoutes from './userActivity.routes';
import payrollRoutes from './payroll.routes';
import adminRoutes from './admin.routes';
import etaskRoutes from './etask.routes';
import inventoryRoutes from './inventory.routes';
import reportReleaseRoutes from './reportRelease.routes';
import rolesPermissionsRoutes from './rolesPermissions.routes';
import feesRoutes from './fees.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/students', studentRoutes);
router.use('/exams', examRoutes);
router.use('/finance', financeRoutes);
// Order matters: audit-logs must be mounted before the generic /:id endpoint.
router.use('/payments', paymentAuditRoutes);
router.use('/payments', paymentRoutes);
router.use('/teachers', teacherRoutes);
router.use('/classes', classRoutes);
router.use('/subjects', subjectRoutes);
router.use('/settings', settingsRoutes);
router.use('/parent', parentRoutes);
router.use('/account', accountRoutes);
router.use('/messages', messageRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/promotion-rules', promotionRuleRoutes);
router.use('/record-book', recordBookRoutes);
router.use('/transfers', transferRoutes);
router.use('/student-transfers', transferRoutes); // Alias for /api/student-transfers
router.use('/enrollments', enrollmentRoutes);
router.use('/timetable', timetableRoutes);
router.use('/ai-comments', aiCommentRoutes);
router.use('/government-reports', governmentReportsRoutes);
router.use('/activity', userActivityRoutes);
router.use('/payroll', payrollRoutes);
router.use('/admin', adminRoutes);
router.use('/etasks', etaskRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/report-releases', reportReleaseRoutes);
router.use('/roles', rolesPermissionsRoutes);
router.use('/fees', feesRoutes);

export default router;

