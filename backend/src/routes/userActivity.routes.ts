import { Router } from 'express';
import { getUserActivityLogs, logMenuAccess } from '../controllers/userActivity.controller';

const router = Router();

// POST /api/activity/access
router.post('/access', logMenuAccess);

// GET /api/activity/user-logs
router.get('/user-logs', getUserActivityLogs);

export default router;

