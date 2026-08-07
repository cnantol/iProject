import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { getDb, getUploadDir } from '../db/init.js';
import { upload } from '../middleware/upload.js';
import { authenticateDownload } from '../middleware/auth.js';
import { nowUtc, badRequest, notFound } from '../utils.js';

const router = Router();
const STAGES = ['customer_info', 'proposal', 'finance', 'invoicing'];

router.post('/:orderId/attachments', upload.single('file'), (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT id FROM orders WHERE id = ?').get(Number(req.params.orderId));
  if (!order) return notFound(res);
  if (!req.file) return badRequest(res, '请选择要上传的文件');
  const stage = String(req.body.stage || 'customer_info');
  if (!STAGES.includes(stage)) return badRequest(res, '上传阶段无效');
  const referenceType = req.body.reference_type ? String(req.body.reference_type) : null;
  const referenceId = req.body.reference_id ? Number(req.body.reference_id) : null;
  const info = db
    .prepare(
      'INSERT INTO order_attachments (order_id, stage, file_name, file_path, file_type, reference_type, reference_id, uploaded_at) VALUES (?,?,?,?,?,?,?,?)'
    )
    .run(
      order.id,
      stage,
      req.file.originalname,
      req.file.filename,
      path.extname(req.file.originalname).slice(1).toLowerCase() || 'file',
      referenceType,
      referenceId,
      nowUtc()
    );
  return res.status(201).json(db.prepare('SELECT * FROM order_attachments WHERE id = ?').get(info.lastInsertRowid));
});

router.get('/:orderId/attachments', (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT id FROM orders WHERE id = ?').get(Number(req.params.orderId));
  if (!order) return notFound(res);
  const items = db.prepare('SELECT * FROM order_attachments WHERE order_id = ? ORDER BY uploaded_at').all(order.id);
  return res.json({ items });
});

router.get('/:orderId/attachments/:attachmentId/download', authenticateDownload, (req, res) => {
  const row = getDb()
    .prepare('SELECT * FROM order_attachments WHERE id = ? AND order_id = ?')
    .get(Number(req.params.attachmentId), Number(req.params.orderId));
  if (!row) return notFound(res);
  const filePath = path.join(getUploadDir(), row.file_path);
  if (!fs.existsSync(filePath)) return notFound(res, '附件文件不存在');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.download(filePath, row.file_name);
});

router.delete('/:orderId/attachments/:attachmentId', (req, res) => {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM order_attachments WHERE id = ? AND order_id = ?')
    .get(Number(req.params.attachmentId), Number(req.params.orderId));
  if (!row) return notFound(res);
  db.prepare('DELETE FROM order_attachments WHERE id = ?').run(row.id);
  const filePath = path.join(getUploadDir(), row.file_path);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  return res.json({ message: '附件已删除' });
});

export default router;
