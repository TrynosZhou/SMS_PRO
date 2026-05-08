import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import {
  createExam,
  getExams,
  getExamById,
  deleteExam,
  deleteAllExams,
  publishExam,
  publishExamByType,
  unpublishExamByType,
  captureMarks,
  getMarks,
  getStudentRankings,
  getSubjectRankings,
  getClassRankingsByType,
  getSubjectRankingsByType,
  getFormRankings,
  getOverallPerformanceRankings,
  getReportCard,
  generateReportCardPDF,
  getResultsAnalysis,
  getResultsAnalysisForSubject,
  saveReportCardRemarks,
  generateMarkSheet,
  generateMarkSheetPDF,
  generateRankingsPDF,
  moderateMarksEndpoint,
  saveModeratedMarksEndpoint,
  getMarkInputProgress,
  getMarkInputProgressByClassSubjects,
  getMarkInputProgressAllClassesSubjects,
  generateAIRemark,
  generateAIReportRemark
} from '../controllers/exam.controller';

const router = Router();

router.post('/', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.DEMO_USER), createExam);
router.get('/', authenticate, getExams);
router.post('/publish', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), publishExam);
router.post('/publish-by-type', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), publishExamByType);
router.post(
  '/unpublish-by-type',
  authenticate,
  authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER),
  unpublishExamByType
);
router.post('/marks', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.DEMO_USER), captureMarks);
router.post('/generate-ai-remark', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.DEMO_USER), generateAIRemark);
router.post(
  '/generate-ai-report-remark',
  authenticate,
  authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.DEMO_USER),
  generateAIReportRemark
);
router.get('/marks', authenticate, getMarks);
router.get('/rankings/class', authenticate, getStudentRankings);
router.get('/rankings/class-by-type', authenticate, getClassRankingsByType);
router.get('/rankings/subject', authenticate, getSubjectRankings);
router.get('/rankings/subject-by-type', authenticate, getSubjectRankingsByType);
router.get('/rankings/form', authenticate, getFormRankings);
router.get('/rankings/overall-performance', authenticate, getOverallPerformanceRankings);
router.post('/rankings/pdf', authenticate, generateRankingsPDF);
router.get('/report-card', authenticate, getReportCard);
router.get('/report-card/pdf', authenticate, generateReportCardPDF);
router.get(
  '/results-analysis',
  authenticate,
  authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.DEMO_USER),
  getResultsAnalysis
);
router.get(
  '/results-analysis/subject',
  authenticate,
  authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.DEMO_USER),
  getResultsAnalysisForSubject
);
router.post('/report-card/remarks', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.DEMO_USER), saveReportCardRemarks);
router.get('/mark-sheet', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.DEMO_USER), generateMarkSheet);
router.get(
  '/mark-sheet/pdf',
  authenticate,
  authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.ACCOUNTANT, UserRole.DEMO_USER),
  generateMarkSheetPDF
);
router.post('/moderate-marks', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), moderateMarksEndpoint);
router.post('/save-moderated-marks', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), saveModeratedMarksEndpoint);
router.get('/mark-input-progress', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), getMarkInputProgress);
router.get(
  '/mark-input-progress/all-classes-subjects',
  authenticate,
  authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER),
  getMarkInputProgressAllClassesSubjects
);
router.get(
  '/mark-input-progress/class-subjects',
  authenticate,
  authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER),
  getMarkInputProgressByClassSubjects
);
router.delete('/all', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.DEMO_USER), deleteAllExams);
// This route must be last to avoid conflicts with specific routes above
router.get('/:id', authenticate, getExamById);
router.delete('/:id', authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.DEMO_USER), deleteExam);

export default router;

