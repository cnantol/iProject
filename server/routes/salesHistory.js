import { Router } from 'express';
import { getDb } from '../db/init.js';
import { round2 } from '../utils.js';

const router = Router();

router.get('/', (req, res) => {
  const db = getDb();
  const q = String(req.query.search || '').trim();
  const where = ["o.status = 'closed'", "o.bid_result = 'won'", 'q.id = o.selected_round_id'];
  const params = [];
  if (q) {
    const terms = q.split(/\s+/).filter(Boolean);
    const termConditions = terms.map((term) => {
      const like = `%${term}%`;
      return '(o.order_id LIKE ? OR o.project_name LIKE ? OR o.sales_order LIKE ? OR o.project_owner LIKE ? OR o.year LIKE ? OR o.month LIKE ? OR ec.customer_name LIKE ? OR cc.customer_name LIKE ? OR qi.material_no LIKE ? OR qi.description LIKE ? OR EXISTS (SELECT 1 FROM customer_pos cp WHERE cp.order_id = o.id AND cp.po_number LIKE ?))';
    });
    if (termConditions.length > 0) {
      where.push(termConditions.join(' AND '));
      terms.forEach((term) => {
        const like = `%${term}%`;
        params.push(like, like, like, like, like, like, like, like, like, like, like);
      });
    }
  }
  const rows = db
    .prepare(
      `SELECT o.id AS order_db_id, o.order_id, o.total_amount AS order_total, ec.customer_name AS end_customer_name,
        cc.customer_name AS contract_customer_name, o.sales_order, qi.material_no, qi.description, qi.qty,
        qi.final_unit_price, qi.line_amount,
        (SELECT GROUP_CONCAT(cp.po_number, '、') FROM customer_pos cp WHERE cp.order_id = o.id) AS po_numbers
       FROM quotation_items qi
       JOIN quotations q ON q.id = qi.quotation_id
       JOIN orders o ON o.id = q.order_id
       LEFT JOIN end_customers ec ON ec.id = o.end_customer_id
       LEFT JOIN contract_customers cc ON cc.id = o.contract_customer_id
       WHERE ${where.join(' AND ')}
       ORDER BY o.id DESC, qi.id`
    )
    .all(...params);

  const byOrder = new Map();
  for (const row of rows) {
    if (!byOrder.has(row.order_db_id)) byOrder.set(row.order_db_id, { items: [], poSet: new Set() });
    const entry = byOrder.get(row.order_db_id);
    entry.items.push(row);
    if (row.po_numbers) entry.poSet.add(row.po_numbers);
  }
  const items = [];
  for (const [orderId, entry] of byOrder) {
    const itemSum = round2(entry.items.reduce((sum, row) => sum + Number(row.line_amount || 0), 0));
    const orderTotal = entry.items[0].order_total == null ? null : Number(entry.items[0].order_total);
    const diff = orderTotal === null ? null : round2(orderTotal - itemSum);
    for (const [index, row] of entry.items.entries()) {
      items.push({
        id: `${orderId}-${row.material_no}-${row.line_amount}-${index}`,
        order_id: row.order_id,
        end_customer_name: row.end_customer_name,
        contract_customer_name: row.contract_customer_name,
        sales_order: row.sales_order,
        po_numbers: [...entry.poSet].join('、'),
        material_no: row.material_no,
        description: row.description,
        qty: row.qty,
        final_unit_price: row.final_unit_price,
        line_amount: row.line_amount,
        order_total: orderTotal,
        amount_difference: diff
      });
    }
  }
  return res.json({ items });
});

export default router;
