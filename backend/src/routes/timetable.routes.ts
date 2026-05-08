import { Router } from 'express';
import {
  getTimetableConfig,
  saveTimetableConfig,
  mergeSubjectLessonsInActiveConfig,
  generateTimetable,
  getTimetableVersions,
  getTimetableSlots,
  updateTimetableSlot,
  deleteTimetableSlot,
  activateTimetableVersion,
  deleteTimetableVersion,
  generateTeacherTimetablePDF,
  generateClassTimetablePDF,
  generateConsolidatedTimetablePDF,
  clearAllTeachingData
} from '../controllers/timetable.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// Configuration routes
router.post('/config/merge-subject-lessons', authenticate, mergeSubjectLessonsInActiveConfig);
router.get('/config', authenticate, getTimetableConfig);
router.post('/config', authenticate, saveTimetableConfig);

// Generation routes
router.post('/generate', authenticate, generateTimetable);

// Version routes
router.get('/versions', authenticate, getTimetableVersions);
router.post('/versions/:versionId/activate', authenticate, activateTimetableVersion);
router.delete('/versions/:versionId', authenticate, deleteTimetableVersion);

// Slot routes
router.get('/versions/:versionId/slots', authenticate, getTimetableSlots);
router.put('/slots/:slotId', authenticate, updateTimetableSlot);
router.delete('/slots/:slotId', authenticate, deleteTimetableSlot);

// Admin reset — must come after /slots/:slotId so it doesn't shadow it
router.delete('/teaching-data', authenticate, clearAllTeachingData);

// PDF generation routes
router.get('/versions/:versionId/teachers/:teacherId/pdf', authenticate, generateTeacherTimetablePDF);
router.get('/versions/:versionId/classes/:classId/pdf', authenticate, generateClassTimetablePDF);
router.get('/versions/:versionId/consolidated/pdf', authenticate, generateConsolidatedTimetablePDF);

export default router;

