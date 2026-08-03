import { Router } from 'express';
import { getDb } from '../db/init.js';
import { nowUtc, badRequest, notFound, conflict, writeAudit } from '../utils.js';

const router = Router();
const TYPES = ['sales_force', 'oa_contract'];

function loadOrder(db, orderId) {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(orderId));
}

router.get('/:orderId/approvals', (req, res) => {
  const db = getDb();
  const order = loadOrder(db, req.params.orderId);
  if (!order) return notFound(res);
  const items = db
    .prepare(
      `SELECT ar.*, u.username AS approver_name FROM approval_records ar
       LEFT JOIN users u ON u.id = ar.approver_id
       WHERE ar.order_id = ? ORDER BY ar.id`
    )
    .all(order.id);
  return res.json({ items });
});

router.post('/:orderId/approvals', (req, res) => {
  const db = getDb();
  const order = loadOrder(db, req.params.orderId);
  if (!order) return notFound(res);
  if (order.status !== 'approval_pending') return badRequest(res, '仅并行审批阶段可提交审批申请');
  if (!order.selected_round_id) return badRequest(res, '尚未选定审批报价轮次');
  const approvalType = String((req.body || {}).approval_type || '');
  if (!TYPES.includes(approvalType)) return badRequest(res, '审批类型无效');

  const duplicate = db
    .prepare('SELECT id FROM approval_records WHERE order_id = ? AND quotation_id = ? AND approval_type = ? AND status = ? LIMIT 1')
    .get(order.id, order.selected_round_id, approvalType, 'pending');
  if (duplicate) return badRequest(res, '该审批已提交，请等待审批结果');

  const tx = db.transaction(() => {
    // 换轮次时：旧轮次（quotation_id != selected_round_id）的 pending 记录全部 superseded
    db.prepare(
      "UPDATE approval_records SET status = 'superseded' WHERE order_id = ? AND quotation_id <> ? AND status = 'pending'"
    ).run(order.id, order.selected_round_id);
    db.prepare(
      "UPDATE approval_records SET status = 'superseded' WHERE order_id = ? AND approval_type = ? AND quotation_id <> ? AND status = 'approved'"
    ).run(order.id, approvalType, order.selected_round_id);
    // 同一审批线下旧 pending/rejected 记录 superseded
    db.prepare(
      "UPDATE approval_records SET status = 'superseded' WHERE order_id = ? AND approval_type = ? AND status IN ('pending','rejected')"
    ).run(order.id, approvalType);
    const info = db
      .prepare(
        'INSERT INTO approval_records (order_id, quotation_id, approval_type, status, approver_id, applied_at, responded_at, remark) VALUES (?,?,?,?,?,?,?,?)'
      )
      .run(order.id, order.selected_round_id, approvalType, 'pending', null, nowUtc(), null, (req.body || {}).remark ?? null);
    writeAudit(db, {
      userId: req.user.id,
      action: 'approval_submit',
      entityType: 'order',
      entityId: order.id,
      detail: { approval_type: approvalType, quotation_id: order.selected_round_id }
    });
    return info.lastInsertRowid;
  });
  const recordId = tx();
  return res.status(201).json(db.prepare('SELECT * FROM approval_records WHERE id = ?').get(recordId));
});

router.put('/:orderId/approvals/:recordId', (req, res) => {
  const db = getDb();
  const order = loadOrder(db, req.params.orderId);
  if (!order) return notFound(res);
  const record = db
    .prepare('SELECT * FROM approval_records WHERE id = ? AND order_id = ?')
    .get(Number(req.params.recordId), order.id);
  if (!record) return notFound(res);
  if (record.status !== 'pending') return badRequest(res, '该审批记录已处理，请刷新');
  const action = String((req.body || {}).action || '');
  const remark = (req.body || {}).remark != null ? String((req.body || {}).remark) : record.remark;

  if (action === 'approve') {
    if (order.status !== 'approval_pending') return badRequest(res, '销售机会当前不在审批阶段');
    const info = db
      .prepare('UPDATE approval_records SET status = ?, approver_id = ?, responded_at = ?, remark = ? WHERE id = ? AND status = ?')
      .run('approved', req.user.id, nowUtc(), remark, record.id, 'pending');
    if (info.changes === 0) return conflict(res, '审批记录状态已变更，请刷新');
    writeAudit(db, {
      userId: req.user.id,
      action: 'approval_approve',
      entityType: 'order',
      entityId: order.id,
      detail: { approval_type: record.approval_type, quotation_id: record.quotation_id }
    });

    const bothApproved = TYPES.every((type) => {
      const latest = db
        .prepare(
          `SELECT id FROM approval_records WHERE order_id = ? AND approval_type = ? AND quotation_id = ? AND status = 'approved'
           ORDER BY id DESC LIMIT 1`
        )
        .get(order.id, type, order.selected_round_id);
      return Boolean(latest);
    });
    if (bothApproved) {
      const advance = db
        .prepare("UPDATE orders SET status = 'bid_decision', updated_at = ? WHERE id = ? AND status = 'approval_pending'")
        .run(nowUtc(), order.id);
      if (advance.changes === 0) return conflict(res);
    }
    const updated = db.prepare('SELECT * FROM approval_records WHERE id = ?').get(record.id);
    return res.json({ item: updated, status: loadOrder(db, order.id).status });
  }

  if (action === 'reject') {
    if (order.status !== 'approval_pending') return badRequest(res, '销售机会当前不在审批阶段');
    let changed = false;
    const tx = db.transaction(() => {
      // 先 supersede 同线下其他 pending/rejected 与另一线 pending（保留 approved 追溯）
    db.prepare(
      "UPDATE approval_records SET status = 'superseded' WHERE order_id = ? AND id <> ? AND status IN ('pending','approved','rejected')"
    ).run(order.id, record.id);
      db.prepare('UPDATE approval_records SET status = ?, approver_id = ?, responded_at = ?, remark = ? WHERE id = ?')
        .run('rejected', req.user.id, nowUtc(), remark, record.id);
      if (order.selected_round_id) {
        db.prepare("UPDATE quotations SET status = 'draft' WHERE id = ? AND status = 'submitted'").run(order.selected_round_id);
      }
      const info = db
        .prepare("UPDATE orders SET status = 'quotation', selected_round_id = NULL, updated_at = ? WHERE id = ? AND status = 'approval_pending'")
        .run(nowUtc(), order.id);
      changed = info.changes > 0;
      if (!changed) throw new Error('status conflict');
      writeAudit(db, {
        userId: req.user.id,
        action: 'approval_reject',
        entityType: 'order',
        entityId: order.id,
        detail: { approval_type: record.approval_type, quotation_id: record.quotation_id, remark }
      });
    });
    try {
      tx();
    } catch (err) {
      if (String(err.message) === 'status conflict') return conflict(res);
      throw err;
    }
    const updated = db.prepare('SELECT * FROM approval_records WHERE id = ?').get(record.id);
    return res.json({ item: updated, status: loadOrder(db, order.id).status });
  }

  return badRequest(res, '审批操作必须为 approve 或 reject');
});

export default router;
