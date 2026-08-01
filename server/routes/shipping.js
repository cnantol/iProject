import { Router } from 'express';
import { getDb } from '../db/init.js';
import { nowUtc, todayLocal, badRequest, notFound, pick, isPct, isValidDate } from '../utils.js';

const router = Router();
const FIELDS = ['batch_percent', 'shipped_date', 'remark'];

function loadOrder(db, orderId) {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(orderId));
}

router.get('/:orderId/shipping', (req, res) => {
  const db = getDb();
  const order = loadOrder(db, req.params.orderId);
  if (!order) return notFound(res);
  const items = db.prepare('SELECT * FROM shipping_batches WHERE order_id = ? ORDER BY sort_order, id').all(order.id);
  const sum = items.reduce((acc, row) => acc + Number(row.batch_percent || 0), 0);
  return res.json({ items, delivered: order.delivered, delivered_date: order.delivered_date, batchPercentSum: sum });
});

router.post('/:orderId/shipping', (req, res) => {
  const db = getDb();
  const order = loadOrder(db, req.params.orderId);
  if (!order) return notFound(res);
  if (order.status !== 'shipping_invoicing') return badRequest(res, '仅发货+开票阶段可登记发货批次');
  const data = pick(req.body || {}, FIELDS);
  if (!isPct(data.batch_percent)) return badRequest(res, '发货百分比必须大于 0 且不超过 100');
  if (data.shipped_date !== undefined && data.shipped_date !== null && data.shipped_date !== '' && !isValidDate(data.shipped_date)) {
    return badRequest(res, '发货日期格式必须为 YYYY-MM-DD');
  }
  const currentSum = db.prepare('SELECT COALESCE(SUM(batch_percent), 0) AS s FROM shipping_batches WHERE order_id = ?').get(order.id).s;
  const nextSum = Number(currentSum) + Number(data.batch_percent);
  if (nextSum > 100.0000001) return badRequest(res, `发货批次累计百分比不能超过 100%（当前 ${currentSum}%）`);
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM shipping_batches WHERE order_id = ?').get(order.id).m;
  const batchNo = `SHIP-${order.id}-${max + 1}`;
  const info = db
    .prepare('INSERT INTO shipping_batches (order_id, batch_no, batch_percent, shipped_date, remark, sort_order, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(
      order.id,
      batchNo,
      Number(data.batch_percent),
      data.shipped_date || todayLocal(),
      data.remark ?? null,
      max + 1,
      nowUtc()
    );
  return res.status(201).json(db.prepare('SELECT * FROM shipping_batches WHERE id = ?').get(info.lastInsertRowid));
});

router.delete('/:orderId/shipping/:batchId', (req, res) => {
  const db = getDb();
  const order = loadOrder(db, req.params.orderId);
  if (!order) return notFound(res);
  if (order.status !== 'shipping_invoicing') return badRequest(res, '仅发货+开票阶段可删除发货批次');
  const row = db.prepare('SELECT * FROM shipping_batches WHERE id = ? AND order_id = ?').get(Number(req.params.batchId), order.id);
  if (!row) return notFound(res);
  if (Number(order.delivered) === 1) return badRequest(res, '已标记发货完成，请先回切发货状态再删除批次');
  db.prepare('DELETE FROM shipping_batches WHERE id = ?').run(row.id);
  return res.json({ message: '发货批次已删除' });
});

export default router;
