import { Router } from 'express';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { getDb } from '../db/init.js';
import {
  nowUtc,
  todayLocal,
  badRequest,
  notFound,
  conflict,
  pick,
  isMoney,
  isNonNegativeNumber,
  isBool,
  isValidDate,
  writeAudit,
  resolveAttachmentFilePath
} from '../utils.js';
import { hasFrameworkForCustomer, frameworkSourceCustomer } from './materials.js';
import { appendOpportunityRow, buildOpportunitiesWorkbook } from '../lib/opportunityBackup.js';

const router = Router();

const STEP1_FIELDS = [
  'year',
  'month',
  'end_customer_id',
  'contract_customer_id',
  'order_type',
  'project_no',
  'workshop',
  'project_name',
  'project_owner',
  'project_remark'
];
const FINANCE_FIELDS = ['sales_order', 'payment_terms'];

function checkSalesOrderUnique(db, salesOrder, excludeId) {
  const row = excludeId == null
    ? db.prepare('SELECT id FROM orders WHERE sales_order = ?').get(salesOrder)
    : db.prepare('SELECT id FROM orders WHERE sales_order = ? AND id <> ?').get(salesOrder, excludeId);
  return !row;
}

function withCommissionCheck(order) {
  const amount = Number(order.commission_amount);
  const total = Number(order.total_amount);
  const result = { commission_expected: null, commission_status: 'none' };
  if (amount > 0 && total > 0) {
    const expected = total * 0.01;
    const ratio = Math.abs(amount - expected) / expected;
    result.commission_expected = expected;
    result.commission_status = ratio <= 0.02 ? 'ok' : 'warn';
  } else if (order.status === 'closed' && total > 0) {
    result.commission_expected = total * 0.01;
    result.commission_status = 'zero';
  }
  return { ...order, ...result };
}

function getQuotationTotal(db, roundId) {
  if (!roundId) return null;
  const row = db.prepare('SELECT total_amount FROM quotations WHERE id = ?').get(Number(roundId));
  return row ? row.total_amount : null;
}

function loadOrderDetail(db, orderId) {
  const order = db
    .prepare(
      `SELECT o.*, ec.customer_name AS end_customer_name, cc.customer_name AS contract_customer_name
       FROM orders o
       LEFT JOIN end_customers ec ON ec.id = o.end_customer_id
       LEFT JOIN contract_customers cc ON cc.id = o.contract_customer_id
       WHERE o.id = ?`
    )
    .get(Number(orderId));
  if (!order) return null;

  order.framework_source_customer_name = null;
  if (Number(order.has_framework) === 1) {
    const source = frameworkSourceCustomer(order.end_customer_id);
    order.framework_source_customer_name = source ? source.customer_name : null;
  }

  const versions = db.prepare('SELECT * FROM proposal_versions WHERE order_id = ? ORDER BY sort_order, id').all(order.id);
  const versionIds = versions.map((version) => version.id);
  const selectionRows = versionIds.length
    ? db
        .prepare(
          `SELECT * FROM proposal_selections WHERE proposal_version_id IN (${versionIds.map(() => '?').join(',')}) ORDER BY proposal_version_id, sort_order, id`
        )
        .all(...versionIds)
    : [];
  const versionAttachmentRows = versionIds.length
    ? db
        .prepare(
          `SELECT * FROM order_attachments WHERE order_id = ? AND reference_type = 'proposal_version' AND reference_id IN (${versionIds.map(() => '?').join(',')}) ORDER BY reference_id, uploaded_at`
        )
        .all(order.id, ...versionIds)
    : [];
  const selectionsByVersion = new Map();
  for (const row of selectionRows) {
    const list = selectionsByVersion.get(row.proposal_version_id) || [];
    list.push(row);
    selectionsByVersion.set(row.proposal_version_id, list);
  }
  const attachmentsByVersion = new Map();
  for (const row of versionAttachmentRows) {
    const list = attachmentsByVersion.get(row.reference_id) || [];
    list.push(row);
    attachmentsByVersion.set(row.reference_id, list);
  }
  const versionsWithDetails = versions.map((version) => ({
    ...version,
    selections: selectionsByVersion.get(version.id) || [],
    attachments: attachmentsByVersion.get(version.id) || []
  }));

  const quotations = db.prepare('SELECT * FROM quotations WHERE order_id = ? ORDER BY round_no').all(order.id);
  const quotationIds = quotations.map((quotation) => quotation.id);
  const itemRows = quotationIds.length
    ? db
        .prepare(`SELECT * FROM quotation_items WHERE quotation_id IN (${quotationIds.map(() => '?').join(',')}) ORDER BY quotation_id, id`)
        .all(...quotationIds)
    : [];
  const itemsByQuotation = new Map();
  for (const row of itemRows) {
    const list = itemsByQuotation.get(row.quotation_id) || [];
    list.push(row);
    itemsByQuotation.set(row.quotation_id, list);
  }
  const quotationsWithItems = quotations.map((quotation) => ({ ...quotation, items: itemsByQuotation.get(quotation.id) || [] }));

  const approvals = db
    .prepare(
      `SELECT ar.*, u.username AS approver_name FROM approval_records ar
       LEFT JOIN users u ON u.id = ar.approver_id
       WHERE ar.order_id = ? ORDER BY ar.id`
    )
    .all(order.id);

  const pos = db.prepare('SELECT * FROM customer_pos WHERE order_id = ? ORDER BY id').all(order.id);
  const shippingBatches = db
    .prepare('SELECT * FROM shipping_batches WHERE order_id = ? ORDER BY sort_order, id')
    .all(order.id);
  const invoices = db
    .prepare(
      `SELECT inv.*, cp.po_number FROM invoice_records inv
       LEFT JOIN customer_pos cp ON cp.id = inv.po_id
       WHERE inv.order_id = ? ORDER BY inv.id`
    )
    .all(order.id);
  const attachments = db
    .prepare('SELECT * FROM order_attachments WHERE order_id = ? ORDER BY uploaded_at')
    .all(order.id);
  const customFields = db
    .prepare(
      `SELECT ocf.*, cf.field_name, cf.field_type, cf.field_options
       FROM order_custom_fields ocf
       JOIN custom_fields cf ON cf.id = ocf.field_id
       WHERE ocf.order_id = ? ORDER BY cf.sort_order, ocf.id`
    )
    .all(order.id);

  const posTotal = pos.reduce((sum, row) => sum + Number(row.po_amount || 0), 0);
  const invoiceTotal = invoices.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const batchPercentSum = shippingBatches.reduce((sum, row) => sum + Number(row.batch_percent || 0), 0);

  return {
    order,
    versions: versionsWithDetails,
    quotations: quotationsWithItems,
    approvals,
    pos,
    shippingBatches,
    invoices,
    attachments,
    customFields,
    posTotal,
    invoiceTotal,
    batchPercentSum
  };
}

function upsertCustomValues(db, orderId, customValues) {
  if (!customValues || typeof customValues !== 'object') return;
  const deleteStmt = db.prepare('DELETE FROM order_custom_fields WHERE order_id = ? AND field_id = ?');
  const insertStmt = db.prepare('INSERT INTO order_custom_fields (order_id, field_id, field_value) VALUES (?,?,?)');
  const tx = db.transaction((values) => {
    for (const [fieldId, value] of Object.entries(values)) {
      const id = Number(fieldId);
      if (!Number.isFinite(id)) continue;
      deleteStmt.run(orderId, id);
      if (value !== null && value !== undefined && value !== '') {
        insertStmt.run(orderId, id, String(value));
      }
    }
  });
  tx(customValues);
}

router.get('/', (req, res) => {
  const db = getDb();
  const { search, status, end_customer_id, contract_customer_id, year, month, scope } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const base = [];
  const baseParams = [];
  if (search) {
    // 支持空格分词多条件搜索（AND 逻辑），每个条件在全字段中匹配
    const terms = String(search).trim().split(/\s+/).filter(Boolean);
    const termConditions = terms.map((term) => {
      const _like = `%${term}%`;
      return '(o.order_id LIKE ? OR o.project_name LIKE ? OR o.sales_order LIKE ? OR o.project_owner LIKE ? OR o.project_no LIKE ? OR o.year LIKE ? OR o.month LIKE ? OR EXISTS (SELECT 1 FROM customer_pos cp WHERE cp.order_id = o.id AND cp.po_number LIKE ?) OR EXISTS (SELECT 1 FROM end_customers ec WHERE ec.id = o.end_customer_id AND ec.customer_name LIKE ?) OR EXISTS (SELECT 1 FROM contract_customers cc WHERE cc.id = o.contract_customer_id AND cc.customer_name LIKE ?))';
    });
    if (termConditions.length > 0) {
      base.push(termConditions.join(' AND '));
      terms.forEach((term) => {
        const like = `%${term}%`;
        baseParams.push(like, like, like, like, like, like, like, like, like, like);
      });
    }
  }
  if (end_customer_id) {
    base.push('o.end_customer_id = ?');
    baseParams.push(Number(end_customer_id));
  }
  if (contract_customer_id) {
    base.push('o.contract_customer_id = ?');
    baseParams.push(Number(contract_customer_id));
  }
  if (year) {
    base.push('o.year = ?');
    baseParams.push(String(year));
  }
  if (month) {
    base.push('o.month = ?');
    baseParams.push(String(month));
  }
  const baseWhere = base.join(' AND ');
  const filter = [];
  const params = [...baseParams];
  if (status) {
    filter.push('o.status = ?');
    params.push(String(status));
  }
  if (scope === 'active') filter.push("o.status NOT IN ('closed','lost_closed','cancelled')");
  if (scope === 'archived') filter.push("o.status IN ('closed','lost_closed','cancelled')");
  const allWhere = [baseWhere, ...filter].filter(Boolean).join(' AND ');
  const whereSql = allWhere ? `WHERE ${allWhere}` : '';
  // 一次查询同时拿到 active/archived 计数，避免连发两次 COUNT(*)。
  // 仅基于 baseWhere（如客户/合同客户过滤），不受当前 scope/status 影响，
  // 因为前端 Tab 角标需要的是"全集下的两个分类数"。
  const countSql = `SELECT
       SUM(CASE WHEN o.status NOT IN ('closed','lost_closed','cancelled') THEN 1 ELSE 0 END) AS active_count,
       SUM(CASE WHEN o.status IN ('closed','lost_closed','cancelled') THEN 1 ELSE 0 END) AS archived_count
     FROM orders o ${baseWhere ? `WHERE ${baseWhere}` : ''}`;
  const counts = db.prepare(countSql).get(...baseParams);
  const activeCount = Number(counts ? counts.active_count : 0) || 0;
  const archivedCount = Number(counts ? counts.archived_count : 0) || 0;
  const total = db.prepare(`SELECT COUNT(*) AS c FROM orders o ${whereSql}`).get(...params).c;
  const items = db
    .prepare(
      `SELECT o.*, ec.customer_name AS end_customer_name, cc.customer_name AS contract_customer_name,
       (SELECT GROUP_CONCAT(cp.po_number, '、') FROM customer_pos cp WHERE cp.order_id = o.id) AS po_numbers
       FROM orders o
       LEFT JOIN end_customers ec ON ec.id = o.end_customer_id
       LEFT JOIN contract_customers cc ON cc.id = o.contract_customer_id
       ${whereSql} ORDER BY o.year DESC, o.month DESC, o.order_id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, (page - 1) * limit);
  return res.json({ items: items.map(withCommissionCheck), total, page, limit, activeCount, archivedCount });
});

router.get('/export', async (req, res) => {
  const db = getDb();
  const orders = db
    .prepare(
      `SELECT o.*, ec.customer_name AS end_customer_name, cc.customer_name AS contract_customer_name
       FROM orders o
       LEFT JOIN end_customers ec ON ec.id = o.end_customer_id
       LEFT JOIN contract_customers cc ON cc.id = o.contract_customer_id
       ORDER BY o.id`
    )
    .all();
  const buffer = await buildOpportunitiesWorkbook(orders);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="opportunities-backup.xlsx"');
  res.setHeader('Cache-Control', 'no-store');
  return res.send(buffer);
});

router.get('/:id', (req, res) => {
  const detail = loadOrderDetail(getDb(), req.params.id);
  if (!detail) return notFound(res);
  detail.order = withCommissionCheck(detail.order);
  return res.json(detail);
});

router.post('/', (req, res) => {
  const db = getDb();
  const body = req.body || {};
  const data = pick(body, STEP1_FIELDS);
  if (!data.end_customer_id) return badRequest(res, '最终客户必选');
  if (!data.contract_customer_id) return badRequest(res, '合同客户必选');
  if (!data.project_name || !String(data.project_name).trim()) return badRequest(res, '项目名称必填');
  if (!data.project_owner || !String(data.project_owner).trim()) return badRequest(res, '项目负责人必填');

  const hasFramework = hasFrameworkForCustomer(Number(data.end_customer_id)) ? 1 : 0;
  const ts = nowUtc();
  const insert = db.prepare(
    `INSERT INTO orders (order_id, year, month, end_customer_id, contract_customer_id, order_type, project_no, workshop,
      project_name, project_owner, project_remark, has_framework, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'customer_info', ?, ?)`
  );

  const createOrder = db.transaction(() => {
    const info = insert.run(
      `PENDING-${Date.now()}-${crypto.randomUUID()}`,
      data.year ? String(data.year) : null,
      data.month ? String(data.month) : null,
      Number(data.end_customer_id),
      Number(data.contract_customer_id),
      String(data.order_type || 'A'),
      data.project_no ? String(data.project_no) : null,
      data.workshop ? String(data.workshop) : null,
      String(data.project_name).trim(),
      String(data.project_owner).trim(),
      data.project_remark ? String(data.project_remark) : null,
      hasFramework,
      ts,
      ts
    );
    const rowId = info.lastInsertRowid;
    db.prepare('UPDATE orders SET order_id = ? WHERE id = ?').run(String(rowId).padStart(4, '0'), rowId);
    return rowId;
  });
  const orderId = createOrder();

  upsertCustomValues(db, orderId, body.customValues);
  const detail = loadOrderDetail(db, orderId);
  appendOpportunityRow(detail.order);
  return res.status(201).json(detail);
});

router.patch('/:id', (req, res) => {
  const db = getDb();
  const detail = loadOrderDetail(db, req.params.id);
  if (!detail) return notFound(res);
  const { order } = detail;
  const body = req.body || {};

  if (['customer_info', 'proposal'].includes(order.status)) {
    const data = pick(body, STEP1_FIELDS);
    if (data.end_customer_id !== undefined && Number(data.end_customer_id) !== Number(order.end_customer_id)) {
      data.has_framework = hasFrameworkForCustomer(Number(data.end_customer_id)) ? 1 : 0;
    }
    if (data.order_type !== undefined && !['A', 'B', 'C'].includes(String(data.order_type))) {
      return badRequest(res, '请选择有效的商机类型');
    }
    db.prepare(
      `UPDATE orders SET year=?, month=?, end_customer_id=?, contract_customer_id=?, order_type=?, project_no=?, workshop=?,
       project_name=?, project_owner=?, project_remark=?, has_framework=?, updated_at=? WHERE id=?`
    ).run(
      data.year !== undefined ? String(data.year) : order.year,
      data.month !== undefined ? String(data.month) : order.month,
      data.end_customer_id !== undefined ? Number(data.end_customer_id) : order.end_customer_id,
      data.contract_customer_id !== undefined ? Number(data.contract_customer_id) : order.contract_customer_id,
      data.order_type !== undefined ? String(data.order_type) : order.order_type,
      data.project_no !== undefined ? String(data.project_no) : order.project_no,
      data.workshop !== undefined ? String(data.workshop) : order.workshop,
      data.project_name !== undefined ? String(data.project_name) : order.project_name,
      data.project_owner !== undefined ? String(data.project_owner) : order.project_owner,
      data.project_remark !== undefined ? String(data.project_remark) : order.project_remark,
      data.has_framework !== undefined ? data.has_framework : order.has_framework,
      nowUtc(),
      order.id
    );
  } else if (order.status === 'finance') {
    const data = pick(body, FINANCE_FIELDS);
    if (data.sales_order !== undefined) {
      const so = String(data.sales_order).trim();
      if (!so) return badRequest(res, 'Sales Order 必填');
      if (!checkSalesOrderUnique(db, so, order.id)) return badRequest(res, '该 SO 号已被其他商机使用');
      data.sales_order = so;
    }
    db.prepare('UPDATE orders SET sales_order=?, payment_terms=?, updated_at=? WHERE id=?').run(
      data.sales_order !== undefined ? data.sales_order : order.sales_order,
      data.payment_terms !== undefined ? data.payment_terms : order.payment_terms,
      nowUtc(),
      order.id
    );
  } else {
    return badRequest(res, '当前商机状态不允许修改这些字段');
  }

  upsertCustomValues(db, order.id, body.customValues);
  return res.json(loadOrderDetail(db, order.id));
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const detail = loadOrderDetail(db, req.params.id);
  if (!detail) return notFound(res);
  const { order } = detail;
  if (!['customer_info', 'proposal', 'quotation'].includes(order.status)) {
    return badRequest(res, '仅客户信息/方案/报价阶段的商机允许删除');
  }
  if (detail.approvals.length > 0) return badRequest(res, '存在审批记录，禁止删除');
  if (detail.shippingBatches.length > 0) return badRequest(res, '存在发货批次记录，禁止删除');
  if (detail.invoices.length > 0) return badRequest(res, '存在开票记录，禁止删除');

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM order_custom_fields WHERE order_id = ?').run(order.id);
    const files = db.prepare('SELECT file_path FROM order_attachments WHERE order_id = ?').all(order.id);
    db.prepare('DELETE FROM order_attachments WHERE order_id = ?').run(order.id);
    for (const row of files) {
      const filePath = resolveAttachmentFilePath(row);
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    db.prepare('DELETE FROM customer_pos WHERE order_id = ?').run(order.id);
    db.prepare('DELETE FROM quotation_items WHERE quotation_id IN (SELECT id FROM quotations WHERE order_id = ?)').run(order.id);
    db.prepare('DELETE FROM quotations WHERE order_id = ?').run(order.id);
    db.prepare('DELETE FROM proposal_selections WHERE proposal_version_id IN (SELECT id FROM proposal_versions WHERE order_id = ?)').run(order.id);
    db.prepare('DELETE FROM proposal_versions WHERE order_id = ?').run(order.id);
    db.prepare('DELETE FROM todos WHERE order_ref = ?').run(order.id);
    db.prepare('DELETE FROM orders WHERE id = ?').run(order.id);
  });
  tx();
  writeAudit(db, {
    userId: req.user.id,
    action: 'delete_order',
    entityType: 'order',
    entityId: order.id,
    detail: { order_id: order.order_id }
  });
  return res.json({ message: '商机已删除' });
});

function maybeAutoAdvance(db, orderId) {
  const row = db
    .prepare("SELECT status, delivered, invoiced FROM orders WHERE id = ? AND status = 'shipping_invoicing'")
    .get(orderId);
  if (row && Number(row.delivered) === 1 && Number(row.invoiced) === 1) {
    const info = db
      .prepare("UPDATE orders SET status = 'commission', updated_at = ? WHERE id = ? AND status = 'shipping_invoicing'")
      .run(nowUtc(), orderId);
    return info.changes > 0;
  }
  return false;
}

router.patch('/:id/status', (req, res) => {
  const db = getDb();
  const detail = loadOrderDetail(db, req.params.id);
  if (!detail) return notFound(res);
  const { order } = detail;
  const { action } = req.body || {};
  const ts = nowUtc();

  if (action === 'advance') {
    if (order.status === 'customer_info') {
      if (!order.end_customer_id || !order.contract_customer_id || !order.project_name || !order.project_owner) {
        return badRequest(res, '请先完善合同客户、最终客户、项目名称与项目负责人');
      }
      const info = db
        .prepare("UPDATE orders SET status = 'proposal', updated_at = ? WHERE id = ? AND status = 'customer_info'")
        .run(ts, order.id);
      if (info.changes === 0) return conflict(res);
      return res.json(loadOrderDetail(db, order.id));
    }
    if (order.status === 'proposal') {
      const skip = Number(req.body.skip) === 1;
      const info = db
        .prepare("UPDATE orders SET status = 'quotation', proposal_skipped = ?, updated_at = ? WHERE id = ? AND status = 'proposal'")
        .run(skip ? 1 : order.proposal_skipped || 0, ts, order.id);
      if (info.changes === 0) return conflict(res);
      return res.json(loadOrderDetail(db, order.id));
    }
    if (order.status === 'finance') {
      const so = order.sales_order ? String(order.sales_order).trim() : '';
      if (!so) return badRequest(res, 'Sales Order 必填');
      if (!checkSalesOrderUnique(db, so, order.id)) return badRequest(res, '该 SO 号已被其他商机使用');
      if (order.total_amount === null || order.total_amount === undefined || !isNonNegativeNumber(order.total_amount)) {
        return badRequest(res, '商机总金额无效，无法进入下一步');
      }
      const pos = db.prepare('SELECT * FROM customer_pos WHERE order_id = ?').all(order.id);
      if (pos.length === 0) return badRequest(res, '至少录入一行 Customer PO');
      const invalid = pos.find((row) => !row.po_number || !isMoney(row.po_amount));
      if (invalid) return badRequest(res, 'PO 号与 PO 金额均为必填且金额必须大于 0');
      const info = db
        .prepare("UPDATE orders SET status = 'shipping_invoicing', updated_at = ? WHERE id = ? AND status = 'finance'")
        .run(ts, order.id);
      if (info.changes === 0) return conflict(res);
      return res.json(loadOrderDetail(db, order.id));
    }
    return badRequest(res, '当前状态不支持「保存并进入下一步」');
  }

  if (action === 'submit-approval') {
    if (order.status !== 'quotation') return badRequest(res, '仅报价阶段可提交审批');
    const roundId = Number(req.body.round_id);
    if (!roundId) return badRequest(res, '请选择要审批的报价轮次');
    const round = db
      .prepare('SELECT id, status FROM quotations WHERE id = ? AND order_id = ?')
      .get(roundId, order.id);
    if (!round) return badRequest(res, '所选报价轮次不存在');
    if (round.status !== 'submitted') return badRequest(res, '请先提交该轮报价，驳回后修改需重新提交');
    const info = db
      .prepare("UPDATE orders SET status = 'approval_pending', selected_round_id = ?, updated_at = ? WHERE id = ? AND status = 'quotation'")
      .run(roundId, ts, order.id);
    if (info.changes === 0) return conflict(res);
    return res.json(loadOrderDetail(db, order.id));
  }

  if (action === 'bid') {
    if (order.status !== 'bid_decision') return badRequest(res, '当前状态不可选择中标结果');
    const result = String(req.body.result || '');
    if (result === 'won') {
      const total = getQuotationTotal(db, order.selected_round_id);
      if (total === null || total === undefined || !isMoney(total)) {
        return badRequest(res, '所选报价轮次总金额无效，无法中标');
      }
      const info = db
        .prepare(
          "UPDATE orders SET bid_result = 'won', total_amount = ?, status = 'finance', updated_at = ? WHERE id = ? AND status = 'bid_decision'"
        )
        .run(total, ts, order.id);
      if (info.changes === 0) return conflict(res);
      return res.json(loadOrderDetail(db, order.id));
    }
    if (result === 'lost') {
      const info = db
        .prepare(
          "UPDATE orders SET bid_result = 'lost', status = 'lost_closed', closed_at = ?, updated_at = ? WHERE id = ? AND status = 'bid_decision'"
        )
        .run(ts, ts, order.id);
      if (info.changes === 0) return conflict(res);
      return res.json(loadOrderDetail(db, order.id));
    }
    if (result === 'cancelled') {
      const info = db
        .prepare("UPDATE orders SET status = 'cancelled', closed_at = ?, updated_at = ? WHERE id = ? AND status = 'bid_decision'")
        .run(ts, ts, order.id);
      if (info.changes === 0) return conflict(res);
      return res.json(loadOrderDetail(db, order.id));
    }
    return badRequest(res, '中标结果必须为 won、lost 或 cancelled');
  }

  if (action === 'toggle-delivered') {
    if (order.status !== 'shipping_invoicing') return badRequest(res, '仅发货+开票阶段可标记发货状态');
    const delivered = Number(req.body.delivered);
    if (!isBool(delivered)) return badRequest(res, '发货状态参数无效');
    const deliveredDate = delivered === 1 ? (req.body.deliveredDate ? String(req.body.deliveredDate) : todayLocal()) : null;
    if (deliveredDate && !isValidDate(deliveredDate)) return badRequest(res, '发货日期格式必须为 YYYY-MM-DD');
    if (delivered === 1 && detail.shippingBatches.length > 0) {
      const sum = detail.batchPercentSum;
      if (Math.abs(sum - 100) > 1e-9) {
        return badRequest(res, `发货批次累计仅 ${sum}%，未全部发货，不能标记完成`);
      }
    }
    const info = db
      .prepare('UPDATE orders SET delivered = ?, delivered_date = ?, updated_at = ? WHERE id = ? AND status = ?')
      .run(delivered, deliveredDate, ts, order.id, 'shipping_invoicing');
    if (info.changes === 0) return conflict(res);
    maybeAutoAdvance(db, order.id);
    return res.json(loadOrderDetail(db, order.id));
  }

  if (action === 'toggle-invoiced') {
    if (order.status !== 'shipping_invoicing') return badRequest(res, '仅发货+开票阶段可标记开票状态');
    const invoiced = Number(req.body.invoiced);
    if (!isBool(invoiced)) return badRequest(res, '开票状态参数无效');
    const invoicedDate = invoiced === 1 ? (req.body.invoicedDate ? String(req.body.invoicedDate) : todayLocal()) : null;
    if (invoicedDate && !isValidDate(invoicedDate)) return badRequest(res, '开票日期格式必须为 YYYY-MM-DD');
    if (invoiced === 1 && detail.invoiceTotal < detail.posTotal) {
      if (Number(req.body.confirm) !== 1) {
        return badRequest(
          res,
          `已开票 ${detail.invoiceTotal} / PO 总金额 ${detail.posTotal}，差额 ${(detail.posTotal - detail.invoiceTotal).toFixed(2)}，请确认后标记`
        );
      }
      writeAudit(db, {
        userId: req.user.id,
        action: 'invoice_override',
        entityType: 'order',
        entityId: order.id,
        detail: { event: 'manual_invoiced_confirm', invoiceTotal: detail.invoiceTotal, poTotal: detail.posTotal }
      });
    }
    const info = db
      .prepare('UPDATE orders SET invoiced = ?, invoiced_date = ?, updated_at = ? WHERE id = ? AND status = ?')
      .run(invoiced, invoicedDate, ts, order.id, 'shipping_invoicing');
    if (info.changes === 0) return conflict(res);
    maybeAutoAdvance(db, order.id);
    return res.json(loadOrderDetail(db, order.id));
  }

  return badRequest(res, '不支持的状态操作');
});

export default router;
export { loadOrderDetail, checkSalesOrderUnique, maybeAutoAdvance };
