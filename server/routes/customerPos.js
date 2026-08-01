import { Router } from 'express';
import { getDb } from '../db/init.js';
import { nowUtc, badRequest, notFound, pick, isMoney } from '../utils.js';

const router = Router();
const FIELDS = ['po_number', 'po_amount', 'remark'];

function loadOrder(db, orderId) {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(orderId));
}

function posLocked(order) {
  const locked = ['shipping_invoicing', 'commission', 'closed', 'lost_closed'];
  return locked.includes(order.status);
}

router.get('/:orderId/customer-pos', (req, res) => {
  const db = getDb();
  if (!loadOrder(db, req.params.orderId)) return notFound(res);
  const items = db.prepare('SELECT * FROM customer_pos WHERE order_id = ? ORDER BY id').all(Number(req.params.orderId));
  return res.json({ items });
});

router.post('/:orderId/customer-pos', (req, res) => {
  const db = getDb();
  const order = loadOrder(db, req.params.orderId);
  if (!order) return notFound(res);
  if (posLocked(order)) return badRequest(res, '订单已进入发货/开票阶段，PO 明细锁定只读');
  const data = pick(req.body || {}, FIELDS);
  if (!data.po_number || !String(data.po_number).trim()) return badRequest(res, 'PO 号必填');
  if (!isMoney(data.po_amount)) return badRequest(res, 'PO 金额必须大于 0');
  data.po_number = String(data.po_number).trim();
  try {
    const info = db
      .prepare('INSERT INTO customer_pos (order_id, po_number, po_amount, remark, created_at) VALUES (?,?,?,?,?)')
      .run(order.id, data.po_number, Number(data.po_amount), data.remark ?? null, nowUtc());
    return res.status(201).json(db.prepare('SELECT * FROM customer_pos WHERE id = ?').get(info.lastInsertRowid));
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return badRequest(res, '该订单下 PO 号已存在');
    throw err;
  }
});

router.put('/:orderId/customer-pos/:poId', (req, res) => {
  const db = getDb();
  const order = loadOrder(db, req.params.orderId);
  if (!order) return notFound(res);
  const row = db.prepare('SELECT * FROM customer_pos WHERE id = ? AND order_id = ?').get(Number(req.params.poId), order.id);
  if (!row) return notFound(res);
  if (posLocked(order)) return badRequest(res, '订单已进入发货/开票阶段，PO 明细锁定只读');
  const data = pick(req.body || {}, FIELDS);
  const merged = { ...row, ...data };
  if (!merged.po_number || !String(merged.po_number).trim()) return badRequest(res, 'PO 号必填');
  if (!isMoney(merged.po_amount)) return badRequest(res, 'PO 金额必须大于 0');
  try {
    db.prepare('UPDATE customer_pos SET po_number=?, po_amount=?, remark=? WHERE id=?').run(
      String(merged.po_number).trim(),
      Number(merged.po_amount),
      merged.remark ?? null,
      row.id
    );
    return res.json(db.prepare('SELECT * FROM customer_pos WHERE id = ?').get(row.id));
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return badRequest(res, '该订单下 PO 号已存在');
    throw err;
  }
});

router.delete('/:orderId/customer-pos/:poId', (req, res) => {
  const db = getDb();
  const order = loadOrder(db, req.params.orderId);
  if (!order) return notFound(res);
  const row = db.prepare('SELECT * FROM customer_pos WHERE id = ? AND order_id = ?').get(Number(req.params.poId), order.id);
  if (!row) return notFound(res);
  if (posLocked(order)) return badRequest(res, '订单已进入发货/开票阶段，PO 明细锁定只读');
  try {
    db.prepare('DELETE FROM customer_pos WHERE id = ?').run(row.id);
    return res.json({ message: 'PO 已删除' });
  } catch (err) {
    if (String(err.message).includes('FOREIGN KEY')) return badRequest(res, '该 PO 已被发票引用，无法删除');
    throw err;
  }
});

export default router;
