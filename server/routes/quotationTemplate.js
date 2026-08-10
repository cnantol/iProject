import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { getDataDir } from '../db/init.js';
import { badRequest } from '../utils.js';
import {
  defaultTemplate,
  normalizeTemplate,
  readTemplate,
  writeTemplate,
  listFieldCatalog,
  buildSampleContext
} from '../lib/quotationTemplate.js';
import { renderPdfBuffer } from '../lib/quotationRenderer.js';

const router = Router();
const fontUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, ext === '.ttf' || ext === '.otf');
  }
});

router.get('/', (req, res) => {
  return res.json(readTemplate());
});

router.put('/', (req, res) => {
  const template = writeTemplate(req.body || {});
  return res.json(template);
});

router.get('/fields', (req, res) => {
  return res.json(listFieldCatalog());
});

router.post('/validate', (req, res) => {
  const template = normalizeTemplate(req.body || {});
  const catalog = listFieldCatalog();
  const customKeys = new Set(catalog.customFields.map((field) => field.key));
  const warnings = [];
  for (const field of template.infoFields) {
    if (/^custom:\d+$/.test(field.key) && !customKeys.has(field.key)) {
      warnings.push(`自定义字段 ${field.key} 已不存在，请移除`);
    }
  }
  if (template.typography.fontFamily === 'custom' && template.typography.fontFile) {
    const filePath = path.join(getDataDir(), 'custom-fonts', path.basename(template.typography.fontFile));
    if (!fs.existsSync(filePath)) warnings.push('自定义字体文件不存在');
  }
  return res.json({ template, warnings });
});

router.post('/reset', (req, res) => {
  const template = writeTemplate(defaultTemplate());
  return res.json(template);
});

router.post('/font', (req, res) => {
  fontUpload.single('file')(req, res, (err) => {
    if (err) return badRequest(res, '字体上传失败：' + (err.message || '仅支持 TTF/OTF，大小不超过 5MB'));
    if (!req.file) return badRequest(res, '请选择字体文件');
    const dir = path.join(getDataDir(), 'custom-fonts');
    fs.mkdirSync(dir, { recursive: true });
    const ext = path.extname(req.file.originalname || '').toLowerCase();
    const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    fs.writeFileSync(path.join(dir, filename), req.file.buffer);
    return res.status(201).json({ filename });
  });
});

router.post('/preview-pdf', async (req, res, next) => {
  try {
    const template = req.body && req.body.template ? normalizeTemplate(req.body.template) : null;
    const context = buildSampleContext(template);
    const buffer = await renderPdfBuffer(context);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="quotation-preview.pdf"');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(buffer);
  } catch (err) {
    return next(err);
  }
});

export default router;
