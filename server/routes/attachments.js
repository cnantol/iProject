import { Router } from 'express';
import fs from 'node:fs';
import { getDb } from '../db/init.js';
import { upload } from '../middleware/upload.js';
import { authenticateDownload } from '../middleware/auth.js';
import {
  nowUtc,
  badRequest,
  notFound,
  writeAudit,
  cleanupUploadedFiles,
  moveUploadedFile,
  resolveAttachmentFilePath
} from '../utils.js';

const router = Router();
const STAGES = ['customer_info', 'proposal', 'finance', 'invoicing'];

// 允许上传附件的 status → stage 映射。任何 stage 上传都必须落在对应状态区间,
// 否则拒绝并返回 400。该约束比前端 readOnly 更严,避免任何绕过 UI 的请求污染附件桶。
const STAGE_ALLOWED_STATUSES = {
  customer_info: ['customer_info', 'proposal'],
  proposal: ['customer_info', 'proposal', 'quotation', 'approval_pending', 'bid_decision', 'finance'],
  finance: ['finance', 'shipping_invoicing'],
  invoicing: ['shipping_invoicing']
};

router.post('/:orderId/attachments', upload.single('file'), (req, res) => {
  const db = getDb();
  const orderRow = db.prepare('SELECT id, status FROM orders WHERE id = ?').get(Number(req.params.orderId));
  if (!orderRow) { cleanupUploadedFiles(req.file ? [req.file] : []); return notFound(res); }
  if (!req.file) return badRequest(res, '请选择要上传的文件');
  const stage = req.body.stage == null ? '' : String(req.body.stage);
  if (!stage) { cleanupUploadedFiles([req.file]); return badRequest(res, '请指定上传阶段'); }
  if (!STAGES.includes(stage)) { cleanupUploadedFiles([req.file]); return badRequest(res, '上传阶段无效'); }
  const allowedStatuses = STAGE_ALLOWED_STATUSES[stage];
  if (!allowedStatuses || !allowedStatuses.includes(orderRow.status)) {
    cleanupUploadedFiles([req.file]);
    return badRequest(res, `当前状态 ${orderRow.status} 不允许上传 ${stage} 阶段附件`);
  }
  // 搬到分层目录: <uploads>/<order_id>/<stage>/<file_name>
  const moved = moveUploadedFile(req.file, orderRow.id, stage);
  const referenceType = req.body.reference_type ? String(req.body.reference_type) : null;
  const referenceId = req.body.reference_id ? Number(req.body.reference_id) : null;
  const relPath = `${orderRow.id}/${stage}/${moved.fileName}`;
  const info = db
    .prepare(
      'INSERT INTO order_attachments (order_id, stage, file_name, file_path, file_type, reference_type, reference_id, uploaded_at) VALUES (?,?,?,?,?,?,?,?)'
    )
    .run(orderRow.id, stage, req.file.originalname, relPath, moved.fileType, referenceType, referenceId, nowUtc());
  writeAudit(db, {
    userId: req.user?.id ?? null,
    action: 'attachment_upload',
    entityType: 'order_attachment',
    entityId: info.lastInsertRowid,
    detail: { order_id: orderRow.id, stage, file_name: req.file.originalname, file_type: moved.fileType, file_path: relPath, reference_type: referenceType, reference_id: referenceId }
  });
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
  const row = getDb().prepare('SELECT * FROM order_attachments WHERE id = ? AND order_id = ?').get(Number(req.params.attachmentId), Number(req.params.orderId));
  if (!row) return notFound(res);
  const filePath = resolveAttachmentFilePath(row);
  if (!filePath || !fs.existsSync(filePath)) return notFound(res, '附件文件不存在');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.download(filePath, row.file_name);
});

router.delete('/:orderId/attachments/:attachmentId', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM order_attachments WHERE id = ? AND order_id = ?').get(Number(req.params.attachmentId), Number(req.params.orderId));
  if (!row) return notFound(res);
  const filePath = resolveAttachmentFilePath(row);
  if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.prepare('DELETE FROM order_attachments WHERE id = ?').run(row.id);
  return res.json({ message: '附件已删除' });
});

export default router;


// ---------- 附件统一管理(全局) ----------
export const attachmentAdminRouter = Router();

attachmentAdminRouter.get('/', (req, res) => {
  const db = getDb();
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const search = String(req.query.search || '').trim();
  const stage = String(req.query.stage || '');
  const fileType = String(req.query.file_type || '');
  const status = String(req.query.status || '');
  const orderId = Number(req.query.order_id);
  const where = [];
  const params = [];
  if (search) {
    const like = `%${search}%`;
    where.push('(a.file_name LIKE ? OR o.order_id LIKE ? OR o.project_name LIKE ?)');
    params.push(like, like, like);
  }
  if (stage && STAGES.includes(stage)) { where.push('a.stage = ?'); params.push(stage); }
  if (fileType) { where.push('a.file_type = ?'); params.push(fileType); }
  if (status === 'active') where.push("o.status NOT IN ('closed','lost_closed','cancelled')");
  if (status === 'archived') where.push("o.status IN ('closed','lost_closed','cancelled')");
  if (Number.isFinite(orderId) && orderId > 0) { where.push('a.order_id = ?'); params.push(orderId); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS c FROM order_attachments a LEFT JOIN orders o ON o.id = a.order_id ${whereSql}`).get(...params).c;
  const items = db.prepare(
    `SELECT a.*, o.order_id AS order_number, o.project_name AS order_project_name, o.status AS order_status
     FROM order_attachments a LEFT JOIN orders o ON o.id = a.order_id ${whereSql}
     ORDER BY a.uploaded_at DESC, a.id DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, (page - 1) * limit);
  const itemsWithSize = items.map((item) => {
    let size = 0;
    try { size = fs.statSync(resolveAttachmentFilePath(item)).size; } catch { size = 0; }
    return { ...item, size };
  });
  return res.json({ items: itemsWithSize, total, page, limit });
});

attachmentAdminRouter.get('/stats', (req, res) => {
  const db = getDb();
  const all = db.prepare('SELECT file_type, file_path FROM order_attachments').all();
  const byType = [];
  let totalSize = 0;
  for (const row of all) {
    let size = 0;
    try { size = fs.statSync(resolveAttachmentFilePath(row)).size; } catch { size = 0; }
    totalSize += size;
    const found = byType.find((t) => t.file_type === row.file_type);
    if (found) { found.count += 1; found.size += size; }
    else { byType.push({ file_type: row.file_type, count: 1, size }); }
  }
  byType.sort((a, b) => b.count - a.count);
  return res.json({ total: all.length, totalSize, byType });
});

attachmentAdminRouter.get('/:id/download', authenticateDownload, (req, res) => {
  const row = getDb().prepare('SELECT * FROM order_attachments WHERE id = ?').get(Number(req.params.id));
  if (!row) return notFound(res);
  const filePath = resolveAttachmentFilePath(row);
  if (!filePath || !fs.existsSync(filePath)) return notFound(res, '附件文件不存在');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.download(filePath, row.file_name);
});

attachmentAdminRouter.delete('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM order_attachments WHERE id = ?').get(Number(req.params.id));
  if (!row) return notFound(res);
  const filePath = resolveAttachmentFilePath(row);
  if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.prepare('DELETE FROM order_attachments WHERE id = ?').run(row.id);
  return res.json({ message: '附件已删除' });
});
