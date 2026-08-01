import { Router } from 'express';
import { getDb } from '../db/init.js';
import { nowUtc, todayLocal, badRequest, notFound, pick, isMoney, isValidDate, writeAudit } from '../utils.js';
import { maybeAutoAdvance } from './orders.js';

const router = Router();
const FIELDS = ['po_id', 'invoice_no', 'amount', 'invoice_date', 'remark'];

function loadOrder(db, orderId) {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(orderId));
}

function totals(db, orderId) {
  const pos = db.prepare('SELECT po_amount FROM customer_pos WHERE order_id = ?').all(orderId);
  const invoices = db.prepare('SELECT amount, po_id FROM invoice_records WHERE order_id = ?').all(orderId);
  const poTotal = pos.reduce((sum, row) => sum + Number(row.po_amount || 0), 0);
  const invoiceTotal = invoices.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return { poTotal, invoiceTotal };
}

function syncInvoicedFlag(db, orderId) {
  const order = loadOrder(db, orderId);
  if (!order || order.status !== 'shipping_invoicing') return;
  const { poTotal, invoiceTotal } = totals(db, orderId);
  if (poTotal > 0 && invoiceTotal >= poTotal && Number(order.invoiced) !== 1) {
    db.prepare('UPDATE orders SET invoiced = 1, invoiced_date = COALESCE(invoiced_date, ?), updated_at = ? WHERE id = ?').run(
      todayLocal(),
      nowUtc(),
      orderId
    );
  }
  if (Number(order.invoiced) === 1 && invoiceTotal < poTotal) {
    db.prepare('UPDATE orders SET invoiced = 0, invoiced_date = NULL, updated_at = ? WHERE id = ?').run(nowUtc(), orderId);
  }
}

router.get('/:orderId/invoices', (req, res) => {
  const db = getDb();
  if (!loadOrder(db, req.params.orderId)) return notFound(res);
  const items = db
    .prepare(
      `SELECT inv.*, cp.po_number FROM invoice_records inv
       LEFT JOIN customer_pos cp ON cp.id = inv.po_id
       WHERE inv.order_id = ? ORDER BY inv.id`
    )
    .all(Number(req.params.orderId));
  const { poTotal, invoiceTotal } = totals(db, Number(req.params.orderId));
  return res.json({ items, poTotal, invoiceTotal });
});

router.post('/:orderId/invoices', (req, res) => {
  const db = getDb();
  const order = loadOrder(db, req.params.orderId);
  if (!order) return notFound(res);
  if (order.status !== 'shipping_invoicing') return badRequest(res, '仅发货+开票阶段可登记发票');
  const data = pick(req.body || {}, FIELDS);
  if (!data.po_id) return badRequest(res, '请选择对应的 PO');
  const po = db.prepare('SELECT * FROM customer_pos WHERE id = ? AND order_id = ?').get(Number(data.po_id), order.id);
  if (!po) return badRequest(res, '所选 PO 不存在');
  if (!data.invoice_no || !String(data.invoice_no).trim()) return badRequest(res, '发票号必填');
  if (!isMoney(data.amount)) return badRequest(res, '开票金额必须大于 0');
  if (data.invoice_date !== undefined && data.invoice_date !== null && data.invoice_date !== '' && !isValidDate(data.invoice_date)) {
    return badRequest(res, '开票日期格式必须为 YYYY-MM-DD');
  }
  const poInvoiced = db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM invoice_records WHERE po_id = ?')
    .get(po.id).s;
  const wouldExceedPo = Number(poInvoiced) + Number(data.amount) > Number(po.po_amount) + 1e-9;
  if (wouldExceedPo && Number(req.body.confirm) !== 1) {
    return badRequest(res, `该 PO 累计开票将超过 PO 金额（PO ${po.po_amount}，已开 ${poInvoiced}），请确认后保存`);
  }
  const confirm = Boolean(wouldExceedPo && Number(req.body.confirm) === 1);
  let invoiceId;
  const tx = db.transaction(() => {
    const info = db
      .prepare('INSERT INTO invoice_records (order_id, po_id, invoice_no, amount, invoice_date, remark, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(
        order.id,
        po.id,
        String(data.invoice_no).trim(),
        Number(data.amount),
        data.invoice_date || todayLocal(),
        data.remark ?? null,
        nowUtc()
      );
    invoiceId = info.lastInsertRowid;
    if (confirm) {
      writeAudit(db, {
        userId: req.user.id,
        action: 'invoice_override',
        entityType: 'order',
        entityId: order.id,
        detail: { event: 'over_invoice_confirm', po_id: po.id, po_amount: po.po_amount, previous_invoiced: poInvoiced, amount: Number(data.amount) }
      });
    }
  });
  tx();
  syncInvoicedFlag(db, order.id);
  maybeAutoAdvance(db, order.id);
  const row = db
    .prepare('SELECT inv.*, cp.po_number FROM invoice_records inv LEFT JOIN customer_pos cp ON cp.id = inv.po_id WHERE inv.id = ?')
    .get(invoiceId);
  const current = totals(db, order.id);
  return res.status(201).json({ item: row, poTotal: current.poTotal, invoiceTotal: current.invoiceTotal });
});

router.delete('/:orderId/invoices/:invoiceId', (req, res) => {
  const db = getDb();
  const order = loadOrder(db, req.params.orderId);
  if (!order) return notFound(res);
  if (order.status !== 'shipping_invoicing') return badRequest(res, '仅发货+开票阶段可删除发票记录');
  const row = db.prepare('SELECT * FROM invoice_records WHERE id = ? AND order_id = ?').get(Number(req.params.invoiceId), order.id);
  if (!row) return notFound(res);
  db.prepare('DELETE FROM order_attachments WHERE reference_type = ? AND reference_id = ?').run('invoice_record', row.id);
  db.prepare('DELETE FROM invoice_records WHERE id = ?').run(row.id);
  syncInvoicedFlag(db, order.id);
  return res.json({ message: '发票记录已删除' });
});

export default router;
export { syncInvoicedFlag };
