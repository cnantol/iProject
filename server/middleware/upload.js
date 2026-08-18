import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { getUploadDir } from '../db/init.js';

const WHITELIST = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'msg'];

export const MAX_FILE_SIZE = 20 * 1024 * 1024;
export const RESTORE_MAX_FILE_SIZE = 200 * 1024 * 1024;

/**
 * 修复 multer/busboy 对 multipart 文件名的 latin1 解码乱码。
 * busboy 默认按 latin1 解析文件名头，中文文件名（UTF-8 字节）会显示为乱码（如 æµè¯.pdf）。
 * 按 latin1→utf8 还原；若还原结果含 U+FFFD（非法 UTF-8 序列），说明原名并非 latin1 乱码，保持原样。
 * 纯 ASCII 文件名 latin1→utf8 无损，可安全通过。
 */
export function fixUploadName(name) {
  if (!name) return name;
  try {
    const fixed = Buffer.from(name, 'latin1').toString('utf8');
    if (fixed.includes('\uFFFD')) return name;
    return fixed;
  } catch {
    return name;
  }
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = getUploadDir();
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    // 在生成磁盘文件名前统一修复中文乱码，使 req.file.originalname 后续（入库/展示）均为正确值
    file.originalname = fixUploadName(file.originalname);
    const safeName = file.originalname.replace(/[^\w.\u4e00-\u9fa5-]/g, '_');
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeName}`);
  }
});

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).slice(1).toLowerCase();
  if (!WHITELIST.includes(ext)) {
    return cb(new Error('仅支持 PDF/Word/PPT/Excel/图片文件'));
  }
  return cb(null, true);
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE }
});

function restoreFileFilter(req, file, cb) {
  if (path.extname(file.originalname).slice(1).toLowerCase() !== 'zip') {
    return cb(new Error('仅支持 ZIP 备份文件'));
  }
  return cb(null, true);
}

export const uploadRestore = multer({
  storage,
  fileFilter: restoreFileFilter,
  limits: { fileSize: RESTORE_MAX_FILE_SIZE }
});
