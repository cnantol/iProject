import { Router } from 'express';
import { getDb } from '../db/init.js';
import { nowUtc, badRequest, notFound, writeAudit, cleanupUploadedFiles, resolveAttachmentFilePath } from '../utils.js';
import { loadOrderDetail } from './orders.js';

const router = Router();

router.use((req, res, next) => {
  if (!req.user || req.user.username !== 'admin') {
    return res.status(403).json({ error: '仅管理员可执行流程回退' });
  }
  next();
});

const STEP_ORDER = [
  'customer_info',
  'proposal',
  'quotation',
  'approval_pending',
  'bid_decision',
  'finance',
  'shipping_invoicing',
  'commission',
  'closed',
  'lost_closed',
  'cancelled'
];
const ACTIVE_STEPS = STEP_ORDER.slice(0, 8);

function stepIndex(status) {
  return STEP_ORDER.indexOf(status);
}

function rollbackTargetError(db, order, target) {
  const orderIdx = stepIndex(order.status);
  const targetIdx = stepIndex(target);
  if (!ACTIVE_STEPS.includes(target)) return '回退目标必须为进行中的步骤';
  if (orderIdx === -1 || targetIdx >= orderIdx) return '回退目标必须早于当前状态';
  if (target === 'commission' && order.status !== 'closed') return '仅项目闭环订单可回退至佣金结算';
  if (['lost_closed', 'cancelled'].includes(order.status) && targetIdx > stepIndex('bid_decision')) {
    return '未中标/取消订单仅支持回退至中标结果及更早步骤';
  }
  if (target === 'approval_pending') {
    const round = order.selected_round_id
      ? db.prepare('SELECT status FROM quotations WHERE id = ? AND order_id = ?').get(order.selected_round_id, order.id)
      : null;
    if (!round || round.status !== 'submitted') return '回退至并行审批需要已提交的选中报价轮次';
  }
  return null;
}

function artifactCounts(db, orderId) {
  const count = (sql) => db.prepare(sql).get(orderId)?.c || 0;
  return {
    customerPos: count('SELECT COUNT(*) c FROM customer_pos WHERE order_id = ?'),
    shippingBatches: count('SELECT COUNT(*) c FROM shipping_batches WHERE order_id = ?'),
    invoices: count('SELECT COUNT(*) c FROM invoice_records WHERE order_id = ?'),
    approvals: count('SELECT COUNT(*) c FROM approval_records WHERE order_id = ?'),
    proposalVersions: count('SELECT COUNT(*) c FROM proposal_versions WHERE order_id = ?'),
    quotations: count('SELECT COUNT(*) c FROM quotations WHERE order_id = ?'),
    attachments: count('SELECT COUNT(*) c FROM order_attachments WHERE order_id = ?')
  };
}

function validRollbackTargets(db, order) {
  const orderIdx = stepIndex(order.status);
  if (orderIdx === -1) return [];
  return ACTIVE_STEPS.filter((step) => !rollbackTargetError(db, order, step));
}

export function buildRollbackPlan(db, order, target) {
  const targetError = rollbackTargetError(db, order, target);
  if (targetError) throw new Error(targetError);
  const targetIdx = stepIndex(target);

  const fieldChanges = {
    status: target,
    sales_order: order.sales_order,
    total_amount: order.total_amount,
    payment_terms: order.payment_terms,
    delivered: order.delivered,
    delivered_date: order.delivered_date,
    invoiced: order.invoiced,
    invoiced_date: order.invoiced_date,
    commission_matched: 0,
    commission_amount: null,
    commission_date: null,
    bid_result: order.bid_result,
    closed_at: null,
    selected_round_id: order.selected_round_id,
    proposal_skipped: order.proposal_skipped || 0
  };

  if (targetIdx <= stepIndex('finance') || target === 'shipping_invoicing') {
    fieldChanges.delivered = 0;
    fieldChanges.delivered_date = null;
    fieldChanges.invoiced = 0;
    fieldChanges.invoiced_date = null;
  }

  if (targetIdx <= stepIndex('bid_decision')) {
    fieldChanges.sales_order = null;
    fieldChanges.total_amount = null;
    fieldChanges.payment_terms = null;
    fieldChanges.bid_result = null;
  }

  if (targetIdx <= stepIndex('quotation')) {
    fieldChanges.selected_round_id = null;
  }

  if (target === 'proposal' || target === 'customer_info') {
    fieldChanges.proposal_skipped = 0;
  }

  const deletions = { customerPos: 0, shippingBatches: 0, invoices: 0 };
  const deletedIds = {
    customerPos: [],
    shippingBatches: [],
    invoices: [],
    supersededApprovals: []
  };
  let supersededApprovals = 0;
  if (targetIdx <= stepIndex('finance')) {
    deletions.shippingBatches = db.prepare('SELECT COUNT(*) c FROM shipping_batches WHERE order_id = ?').get(order.id).c;
    deletions.invoices = db.prepare('SELECT COUNT(*) c FROM invoice_records WHERE order_id = ?').get(order.id).c;
    deletedIds.shippingBatches = db.prepare('SELECT id FROM shipping_batches WHERE order_id = ? ORDER BY id').all(order.id).map((row) => row.id);
    deletedIds.invoices = db.prepare('SELECT id FROM invoice_records WHERE order_id = ? ORDER BY id').all(order.id).map((row) => row.id);
  }
  if (targetIdx <= stepIndex('bid_decision')) {
    deletions.customerPos = db.prepare('SELECT COUNT(*) c FROM customer_pos WHERE order_id = ?').get(order.id).c;
    deletedIds.customerPos = db.prepare('SELECT id FROM customer_pos WHERE order_id = ? ORDER BY id').all(order.id).map((row) => row.id);
  }
  if (targetIdx <= stepIndex('quotation') || target === 'approval_pending') {
    supersededApprovals = db
      .prepare("SELECT COUNT(*) c FROM approval_records WHERE order_id = ? AND status IN ('pending','approved')")
      .get(order.id).c;
    deletedIds.supersededApprovals = db
      .prepare("SELECT id FROM approval_records WHERE order_id = ? AND status IN ('pending','approved') ORDER BY id")
      .all(order.id)
      .map((row) => row.id);
  }
  const deletedInvoiceAttachmentIds = deletedIds.invoices.length
    ? db
        .prepare(
          `SELECT id FROM order_attachments WHERE order_id = ? AND reference_type = 'invoice_record'
           AND reference_id IN (${deletedIds.invoices.map(() => '?').join(',')})`
        )
        .all(order.id, ...deletedIds.invoices)
        .map((row) => row.id)
    : [];

  return {
    orderId: order.id,
    orderNo: order.order_id,
    currentStatus: order.status,
    target,
    fieldChanges,
    deletions: { ...deletions, invoiceAttachments: deletedInvoiceAttachmentIds.length },
    supersededApprovals,
    deletedIds: { ...deletedIds, invoiceAttachments: deletedInvoiceAttachmentIds },
    artifacts: artifactCounts(db, order.id)
  };
}

export function executeRollback(db, plan, userId, expectedStatus = null) {
  let attachmentFiles = [];
  const tx = db.transaction(() => {
    const currentOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(plan.orderId);
    if (!currentOrder) throw new Error('订单不存在');
    if (expectedStatus != null) {
      if (currentOrder.status !== expectedStatus) throw new Error('订单状态已变更，请刷新后重试');
    }
    const before = {
      status: currentOrder.status,
      sales_order: currentOrder.sales_order,
      total_amount: currentOrder.total_amount,
      payment_terms: currentOrder.payment_terms,
      delivered: currentOrder.delivered,
      delivered_date: currentOrder.delivered_date,
      invoiced: currentOrder.invoiced,
      invoiced_date: currentOrder.invoiced_date,
      commission_matched: currentOrder.commission_matched,
      commission_amount: currentOrder.commission_amount,
      commission_date: currentOrder.commission_date,
      bid_result: currentOrder.bid_result,
      closed_at: currentOrder.closed_at,
      selected_round_id: currentOrder.selected_round_id,
      proposal_skipped: currentOrder.proposal_skipped
    };
    if (plan.deletedIds.invoices.length > 0) {
      const placeholders = plan.deletedIds.invoices.map(() => '?').join(',');
      const attachmentRows = db
        .prepare(
          `SELECT file_path FROM order_attachments WHERE order_id = ? AND reference_type = 'invoice_record'
           AND reference_id IN (${placeholders})`
        )
        .all(plan.orderId, ...plan.deletedIds.invoices);
      db.prepare(
        `DELETE FROM order_attachments WHERE order_id = ? AND reference_type = 'invoice_record'
         AND reference_id IN (${placeholders})`
      ).run(plan.orderId, ...plan.deletedIds.invoices);
      attachmentFiles = attachmentRows.map((row) => ({ path: resolveAttachmentFilePath(row) }));
    }
    if (plan.deletedIds.invoices.length > 0) {
      db.prepare(`DELETE FROM invoice_records WHERE order_id = ? AND id IN (${plan.deletedIds.invoices.map(() => '?').join(',')})`).run(
        plan.orderId,
        ...plan.deletedIds.invoices
      );
    }
    if (plan.deletedIds.shippingBatches.length > 0) {
      db.prepare(`DELETE FROM shipping_batches WHERE order_id = ? AND id IN (${plan.deletedIds.shippingBatches.map(() => '?').join(',')})`).run(
        plan.orderId,
        ...plan.deletedIds.shippingBatches
      );
    }
    if (plan.deletedIds.customerPos.length > 0) {
      db.prepare(`DELETE FROM customer_pos WHERE order_id = ? AND id IN (${plan.deletedIds.customerPos.map(() => '?').join(',')})`).run(
        plan.orderId,
        ...plan.deletedIds.customerPos
      );
    }
    if (plan.deletedIds.supersededApprovals.length > 0) {
      db.prepare(`UPDATE approval_records SET status = 'superseded' WHERE id IN (${plan.deletedIds.supersededApprovals.map(() => '?').join(',')})`).run(
        ...plan.deletedIds.supersededApprovals
      );
    }
    const f = plan.fieldChanges;
    db.prepare(
      `UPDATE orders SET status=?, sales_order=?, total_amount=?, payment_terms=?, delivered=?, delivered_date=?,
        invoiced=?, invoiced_date=?, commission_matched=?, commission_amount=?, commission_date=?, bid_result=?,
        closed_at=?, selected_round_id=?, proposal_skipped=?, updated_at=? WHERE id=?`
    ).run(
      f.status,
      f.sales_order,
      f.total_amount,
      f.payment_terms,
      f.delivered,
      f.delivered_date,
      f.invoiced,
      f.invoiced_date,
      f.commission_matched,
      f.commission_amount,
      f.commission_date,
      f.bid_result,
      f.closed_at,
      f.selected_round_id,
      f.proposal_skipped,
      nowUtc(),
      plan.orderId
    );
    writeAudit(db, {
      userId,
      action: 'order_rollback',
      entityType: 'order',
      entityId: plan.orderId,
      detail: {
        order_no: plan.orderNo,
        from_status: plan.currentStatus,
        target_status: plan.target,
        before,
        field_changes: plan.fieldChanges,
        deletions: plan.deletions,
        superseded_approvals: plan.supersededApprovals,
        deleted_ids: plan.deletedIds
      }
    });
  });
  tx();
  cleanupUploadedFiles(attachmentFiles);
}

router.get('/:orderId', (req, res) => {
  const db = getDb();
  const orderId = Number(req.params.orderId);
  if (!Number.isFinite(orderId)) return notFound(res);
  const order = db
    .prepare(
      `SELECT o.*, ec.customer_name AS end_customer_name, cc.customer_name AS contract_customer_name
       FROM orders o
       LEFT JOIN end_customers ec ON ec.id = o.end_customer_id
       LEFT JOIN contract_customers cc ON cc.id = o.contract_customer_id
       WHERE o.id = ?`
    )
    .get(orderId);
  if (!order) return notFound(res);
  const poNumbers = db.prepare("SELECT GROUP_CONCAT(po_number, '、') AS v FROM customer_pos WHERE order_id = ?").get(order.id)?.v || null;
  return res.json({
    order: { ...order, po_numbers: poNumbers },
    validTargets: validRollbackTargets(db, order),
    artifacts: artifactCounts(db, order.id)
  });
});

router.get('/:orderId/plan', (req, res) => {
  const db = getDb();
  const orderId = Number(req.params.orderId);
  if (!Number.isFinite(orderId)) return notFound(res);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return notFound(res);
  try {
    return res.json({ plan: buildRollbackPlan(db, order, String(req.query.target || '')) });
  } catch (err) {
    return badRequest(res, err.message);
  }
});

router.put('/:orderId', (req, res) => {
  const db = getDb();
  const orderId = Number(req.params.orderId);
  if (!Number.isFinite(orderId)) return notFound(res);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return notFound(res);
  if (Number((req.body || {}).confirm) !== 1) return badRequest(res, '回退操作需二次确认');
  try {
    const plan = buildRollbackPlan(db, order, String((req.body || {}).target || ''));
    const expectedStatus = (req.body || {}).expected_status ? String((req.body || {}).expected_status) : null;
    executeRollback(db, plan, req.user?.id ?? null, expectedStatus);
    return res.json(loadOrderDetail(db, order.id));
  } catch (err) {
    if (String(err.message) === '订单不存在') return notFound(res);
    return badRequest(res, err.message);
  }
});

export default router;
