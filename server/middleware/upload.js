import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { getUploadDir } from '../db/init.js';

const WHITELIST = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg', 'gif', 'webp'];

export const MAX_FILE_SIZE = 20 * 1024 * 1024;

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = getUploadDir();
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const safeName = file.originalname.replace(/[^\w.\u4e00-\u9fa5-]/g, '_');
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeName}`);
  }
});

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).slice(1).toLowerCase();
  if (!WHITELIST.includes(ext)) {
    return cb(new Error('仅支持 PDF/Word/Excel/图片文件'));
  }
  return cb(null, true);
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE }
});
