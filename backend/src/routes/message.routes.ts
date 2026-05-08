import { Router, Request, Response, NextFunction } from 'express';
import {
  sendBulkMessage,
  getParentMessages,
  markParentMessageRead,
  sendParentMessageToSchool,
  getParentOutboxMessages,
  sendAdminToParents,
  getAdminMessagesFromParents
} from '../controllers/message.controller';
import { authenticate } from '../middleware/auth';
import { uploadMessageAttachment } from '../utils/uploadMessageAttachment';

const router = Router();

const optionalMessageUpload = (req: Request, res: Response, next: NextFunction) => {
  uploadMessageAttachment.single('attachment')(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : 'Upload error';
      return res.status(400).json({ message: msg });
    }
    next();
  });
};

router.post('/bulk', authenticate, sendBulkMessage);
router.post('/admin/to-parents', authenticate, optionalMessageUpload, sendAdminToParents);
router.get('/admin/from-parents', authenticate, getAdminMessagesFromParents);
router.get('/parent', authenticate, getParentMessages);
router.get('/parent/outbox', authenticate, getParentOutboxMessages);
router.post('/parent/send', authenticate, sendParentMessageToSchool);
router.patch('/parent/:id/read', authenticate, markParentMessageRead);

export default router;

