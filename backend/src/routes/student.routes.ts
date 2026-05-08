import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import {
  registerStudent,
  getStudents,
  getStudentById,
  enrollStudent,
  updateStudent,
  deleteStudent,
  promoteStudents,
  promoteAllStudents,
  getPromotePreview,
  generateStudentIdCard,
  generateClassStudentIdCardsPDF,
  getDHServicesReport,
  getTransportServicesReport,
  generateClassListPDF,
  getStudentReportCard,
  getStudentInvoiceBalance,
  downloadStudentReportCardPDF,
  getCurrentStudent
} from '../controllers/student.controller';
import { upload } from '../utils/upload';

const router = Router();

router.post('/', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), upload.single('photo'), registerStudent);
router.get('/', authenticate, getStudents);
// Enrollment is now handled by /api/enrollments endpoint
// router.post('/enroll', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), enrollStudent);
router.get('/promote/preview', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), getPromotePreview);
router.post('/promote', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), promoteStudents);
router.post('/promote-all', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), promoteAllStudents);
router.get('/reports/dh-services', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN), getDHServicesReport);
router.get('/reports/transport-services', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN), getTransportServicesReport);
// Student dashboard routes - must be before /:id routes to avoid route conflicts
router.get('/dashboard/report-card', authenticate, getStudentReportCard);
router.get('/dashboard/report-card/pdf', authenticate, downloadStudentReportCardPDF);
router.get('/dashboard/invoice-balance', authenticate, getStudentInvoiceBalance);
// Current student profile — must be before /:id
router.get('/me', authenticate, getCurrentStudent);
// Class list PDF route - must be before /:id routes to avoid route conflicts
router.get('/class-list/pdf', authenticate, generateClassListPDF);
router.get('/class/:classId/id-cards-pdf', authenticate, generateClassStudentIdCardsPDF);
router.get('/:id/id-card', authenticate, generateStudentIdCard);
router.get('/:id', authenticate, getStudentById);
router.put('/:id', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), upload.single('photo'), updateStudent);
router.delete('/:id', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.DEMO_USER), deleteStudent);

export default router;

