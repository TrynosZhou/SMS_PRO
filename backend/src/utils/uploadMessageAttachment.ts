import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { Request } from 'express';

const uploadsDir = path.join(__dirname, '../../../uploads/messages');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req: Request, file: Express.Multer.File, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname) || '';
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    cb(null, `msg-${unique}-${safe}${ext}`);
  },
});

const allowed = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/gif',
  'application/zip',
  'text/plain',
]);

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (allowed.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed. Use PDF, Word, Excel, images, ZIP, or TXT.'));
  }
};

export const uploadMessageAttachment = multer({
  storage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024 },
});
