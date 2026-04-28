import path from 'path';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';

const router = Router();

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const storage = multer.diskStorage({
  destination: path.resolve('uploads'),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(new AppError(422, 'Only JPEG, PNG, WebP images and PDFs are allowed') as unknown as null, false);
  },
});

router.post(
  '/',
  authenticate,
  upload.single('receipt'),
  (req: Request, res: Response): void => {
    if (!req.file) throw new AppError(400, 'No file received — send a multipart/form-data request with a "receipt" field');
    res.status(201).json({ url: `/uploads/${req.file.filename}` });
  }
);

export default router;
