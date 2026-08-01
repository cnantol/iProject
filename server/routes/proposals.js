import { Router } from 'express';
import { getDb } from '../db/init.js';
import { nowUtc, badRequest, notFound, pick, isQty } from '../utils.js';

const router = Router();
const VERSION_FIELDS = ['version_label', 'remark'];
const SELECTION_FIELDS = ['material_no', 'description', 'material_type', 'qty', 'unit', 'remark'];

function loadOrder(db, orderId) {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(orderId));
}

function loadVersion(db, versionId) {
  return db.prepare('SELECT * FROM proposal_versions WHERE id = ?').get(Number(versionId));
}

function canEditProposal(order) {
  return order && order.status === 'proposal';
}

router.get('/:orderId/versions', (req, res) => {
  const db = getDb();
  if (!loadOrder(db, req.params.orderId)) return notFound(res);
  const versions = db
    .prepare('SELECT * FROM proposal_versions WHERE order_id = ? ORDER BY sort_order, id')
    .all(Number(req.params.orderId))
    .map((version) => {
      const selections = db
        .prepare('SELECT * FROM proposal_selections WHERE proposal_version_id = ? ORDER BY sort_order, id')
        .all(version.id);
      const attachments = db
        .prepare("SELECT * FROM order_attachments WHERE order_id = ? AND reference_type = 'proposal_version' AND reference_id = ? ORDER BY uploaded_at")
        .all(version.order_id, version.id);
      return { ...version, selections, attachments };
    });
  return res.json({ items: versions });
});

router.post('/:orderId/versions', (req, res) => {
  const db = getDb();
  const order = loadOrder(db, req.params.orderId);
  if (!order) return notFound(res);
  if (!canEditProposal(order)) return badRequest(res, '仅方案阶段可新增方案版本');
  const data = pick(req.body || {}, VERSION_FIELDS);
  if (!data.version_label || !String(data.version_label).trim()) return badRequest(res, '版本标签必填');
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM proposal_versions WHERE order_id = ?').get(order.id).m;
  const info = db
    .prepare('INSERT INTO proposal_versions (order_id, version_label, remark, sort_order, created_at) VALUES (?,?,?,?,?)')
    .run(order.id, String(data.version_label).trim(), data.remark ?? null, max + 1, nowUtc());
  return res.status(201).json(loadVersion(db, info.lastInsertRowid));
});

router.delete('/:orderId/versions/:versionId', (req, res) => {
  const db = getDb();
  const order = loadOrder(db, req.params.orderId);
  if (!order) return notFound(res);
  const version = loadVersion(db, req.params.versionId);
  if (!version || Number(version.order_id) !== Number(order.id)) return notFound(res);
  if (!canEditProposal(order)) return badRequest(res, '仅方案阶段可删除方案版本');
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM proposal_selections WHERE proposal_version_id = ?').run(version.id);
    db.prepare("DELETE FROM order_attachments WHERE order_id = ? AND reference_type = 'proposal_version' AND reference_id = ?").run(
      order.id,
      version.id
    );
    db.prepare('DELETE FROM proposal_versions WHERE id = ?').run(version.id);
  });
  tx();
  return res.json({ message: '方案版本已删除' });
});

router.get('/versions/:versionId/selections', (req, res) => {
  const db = getDb();
  const version = loadVersion(db, req.params.versionId);
  if (!version) return notFound(res);
  const items = db.prepare('SELECT * FROM proposal_selections WHERE proposal_version_id = ? ORDER BY sort_order, id').all(version.id);
  return res.json({ items });
});

function validateSelection(data) {
  if (!isQty(data.qty)) return '数量必须大于 0';
  if (data.material_type && !['standard', 'non_standard'].includes(String(data.material_type))) return '物料类型无效';
  return null;
}

router.post('/versions/:versionId/selections', (req, res) => {
  const db = getDb();
  const version = loadVersion(db, req.params.versionId);
  if (!version) return notFound(res);
  const order = loadOrder(db, version.order_id);
  if (!canEditProposal(order)) return badRequest(res, '仅方案阶段可维护选型明细');
  const data = pick(req.body || {}, SELECTION_FIELDS);
  const error = validateSelection(data);
  if (error) return badRequest(res, error);
  const materialNo = data.material_no ? String(data.material_no).trim() : null;
  const materialType = data.material_type || 'standard';
  let description = data.description;
  if (materialType === 'standard' && materialNo && (description === undefined || description === null || description === '')) {
    const guide = db.prepare('SELECT description FROM guide_prices WHERE material_no = ?').get(materialNo);
    description = guide ? guide.description : null;
  }
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM proposal_selections WHERE proposal_version_id = ?').get(version.id).m;
  const info = db
    .prepare(
      `INSERT INTO proposal_selections (proposal_version_id, material_no, description, material_type, qty, unit, sort_order, remark)
       VALUES (?,?,?,?,?,?,?,?)`
    )
    .run(version.id, materialNo, description ?? null, materialType, Number(data.qty), data.unit || 'pcs', max + 1, data.remark ?? null);
  return res.status(201).json(db.prepare('SELECT * FROM proposal_selections WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/versions/:versionId/selections/:selectionId', (req, res) => {
  const db = getDb();
  const version = loadVersion(db, req.params.versionId);
  if (!version) return notFound(res);
  const order = loadOrder(db, version.order_id);
  if (!canEditProposal(order)) return badRequest(res, '仅方案阶段可维护选型明细');
  const row = db.prepare('SELECT * FROM proposal_selections WHERE id = ? AND proposal_version_id = ?').get(Number(req.params.selectionId), version.id);
  if (!row) return notFound(res);
  const data = pick(req.body || {}, SELECTION_FIELDS);
  const merged = { ...row, ...data };
  const error = validateSelection(merged);
  if (error) return badRequest(res, error);
  const materialType = merged.material_type || 'standard';
  let description = merged.description;
  if (materialType === 'standard' && merged.material_no && (description === undefined || description === null || description === '')) {
    const guide = db.prepare('SELECT description FROM guide_prices WHERE material_no = ?').get(merged.material_no);
    description = guide ? guide.description : null;
  }
  db.prepare(
    `UPDATE proposal_selections SET material_no=?, description=?, material_type=?, qty=?, unit=?, remark=? WHERE id=?`
  ).run(
    merged.material_no ? String(merged.material_no).trim() : null,
    description ?? null,
    materialType,
    Number(merged.qty),
    merged.unit || 'pcs',
    merged.remark ?? null,
    row.id
  );
  return res.json(db.prepare('SELECT * FROM proposal_selections WHERE id = ?').get(row.id));
});

router.delete('/versions/:versionId/selections/:selectionId', (req, res) => {
  const db = getDb();
  const version = loadVersion(db, req.params.versionId);
  if (!version) return notFound(res);
  const order = loadOrder(db, version.order_id);
  if (!canEditProposal(order)) return badRequest(res, '仅方案阶段可维护选型明细');
  const info = db.prepare('DELETE FROM proposal_selections WHERE id = ? AND proposal_version_id = ?').run(Number(req.params.selectionId), version.id);
  if (info.changes === 0) return notFound(res);
  return res.json({ message: '选型明细已删除' });
});

export default router;
