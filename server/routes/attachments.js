import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
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
  resolveAttachmentFilePath,
  getOrderAttachmentDir
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
  const referenceType = req.body.reference_type ? String(req.body.reference_type) : null;
  const referenceId = req.body.reference_id ? Number(req.body.reference_id) : null;
  if (referenceType) {
    const validTypes = ['proposal_version', 'invoice_record'];
    if (!validTypes.includes(referenceType) || !Number.isInteger(referenceId) || referenceId <= 0) {
      cleanupUploadedFiles([req.file]);
      return badRequest(res, '附件引用类型无效');
    }
    const referenced = referenceType === 'proposal_version'
      ? db.prepare('SELECT id FROM proposal_versions WHERE id = ? AND order_id = ?').get(referenceId, orderRow.id)
      : db.prepare('SELECT id FROM invoice_records WHERE id = ? AND order_id = ?').get(referenceId, orderRow.id);
    if (!referenced) {
      cleanupUploadedFiles([req.file]);
      return badRequest(res, '附件引用对象不存在或不属于该商机');
    }
  }
  // 搬到分层目录: <uploads>/<order_id>/<stage>/<file_name>
  const moved = moveUploadedFile(req.file, orderRow.id, stage);
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
  if (row.reference_type === 'invoice_record') {
    return badRequest(res, '该附件已绑定发票，请通过发票记录删除');
  }
  const filePath = resolveAttachmentFilePath(row);
  if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.prepare('DELETE FROM order_attachments WHERE id = ?').run(row.id);
  return res.json({ message: '附件已删除' });
});

// 孤儿文件扫描: 列出磁盘上存在、但数据库 order_attachments 无对应记录的附件。
// 仅扫描 uploads/<orderId>/<stage>/ 目录, 不会泄露其它订单或系统文件。
router.get('/:orderId/orphans', (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT id FROM orders WHERE id = ?').get(Number(req.params.orderId));
  if (!order) return notFound(res);
  const orderId = order.id;
  const recorded = new Set(
    db.prepare('SELECT file_path FROM order_attachments WHERE order_id = ?').all(orderId).map((r) => r.file_path)
  );
  const orphans = [];
  for (const stage of STAGES) {
    const dir = getOrderAttachmentDir(orderId, stage);
    if (!fs.existsSync(dir)) continue;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (!ent.isFile() || ent.name === '.DS_Store') continue;
      const rel = `${orderId}/${stage}/${ent.name}`;
      if (recorded.has(rel)) continue; // 已在数据库中, 属正常附件
      let size = 0;
      try {
        size = fs.statSync(path.join(dir, ent.name)).size;
      } catch {
        /* 忽略 */
      }
      orphans.push({
        stage,
        file_name: ent.name,
        file_path: rel,
        file_type: (path.extname(ent.name).slice(1) || 'file').toLowerCase(),
        size
      });
    }
  }
  return res.json({ items: orphans });
});

// 删除孤儿文件。严格的路径校验: file_path 必须为 <orderId>/<stage>/<name> 形式,
// 解析后的绝对路径必须落在 uploads/<orderId>/ 之下, 且确为孤儿(数据库无记录)才允许删除, 杜绝越权/穿越。
router.delete('/:orderId/orphans', (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT id FROM orders WHERE id = ?').get(Number(req.params.orderId));
  if (!order) return notFound(res);
  const orderId = order.id;
  const rel = req.body?.file_path;
  if (typeof rel !== 'string') return badRequest(res, '缺少 file_path');
  const parts = rel.split('/');
  if (parts.length !== 3 || String(orderId) !== parts[0] || !STAGES.includes(parts[1])) {
    return badRequest(res, 'file_path 格式无效');
  }
  const fileName = parts[2];
  if (fileName !== path.basename(fileName) || fileName.includes('..')) {
    return badRequest(res, '文件名无效');
  }
  const dir = getOrderAttachmentDir(orderId, parts[1]);
  const abs = path.join(dir, fileName);
  // 防穿越: 解析后必须仍在 stage 目录内
  if (path.relative(dir, abs) !== fileName) {
    return badRequest(res, '非法路径');
  }
  // 确为孤儿: 数据库中无该记录, 避免误删正常附件
  const recorded = db.prepare('SELECT id FROM order_attachments WHERE order_id = ? AND file_path = ?').get(orderId, rel);
  if (recorded) return badRequest(res, '该文件已在附件记录中，无法作为孤儿删除');
  if (!fs.existsSync(abs)) return notFound(res, '文件不存在');
  try {
    fs.unlinkSync(abs);
  } catch {
    return badRequest(res, '删除失败');
  }
  writeAudit(db, {
    userId: req.user?.id ?? null,
    action: 'orphan_attachment_delete',
    entityType: 'order_attachment',
    entityId: null,
    detail: { order_id: orderId, file_path: rel }
  });
  return res.json({ message: '孤儿文件已删除' });
});

export default router;
