import { Router } from 'express';
import { getDb } from '../db/init.js';
import { round2 } from '../utils.js';

const router = Router();

router.get('/', (req, res) => {
  const db = getDb();
  const q = String(req.query.search || '').trim();
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const where = ["o.status = 'closed'", "o.bid_result = 'won'", 'q.id = o.selected_round_id'];
  const params = [];
  if (q) {
    const terms = q.split(/\s+/).filter(Boolean);
    const termConditions = terms.map((term) => {
      const _like = `%${term}%`;
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
  const baseFrom = `
    FROM quotation_items qi
    JOIN quotations q ON q.id = qi.quotation_id
    JOIN orders o ON o.id = q.order_id
    LEFT JOIN end_customers ec ON ec.id = o.end_customer_id
    LEFT JOIN contract_customers cc ON cc.id = o.contract_customer_id
    WHERE ${where.join(' AND ')}
  `;
  const total = db.prepare(`SELECT COUNT(*) AS c ${baseFrom}`).get(...params).c;
  const summaryRow = db.prepare(
    `WITH matched AS (
       SELECT o.id AS order_db_id, o.total_amount AS order_total, qi.line_amount
       ${baseFrom}
     )
     SELECT COUNT(DISTINCT order_db_id) AS order_count,
            COALESCE(SUM(line_amount), 0) AS total_sales,
            COALESCE((SELECT SUM(order_total) FROM (SELECT DISTINCT order_db_id, order_total FROM matched)), 0) AS total_order_amount
     FROM matched`
  ).get(...params);
  const totalSales = Number(summaryRow ? summaryRow.total_sales : 0);
  const totalOrderAmount = Number(summaryRow ? summaryRow.total_order_amount : 0);
  const summary = {
    orderCount: Number(summaryRow ? summaryRow.order_count : 0),
    totalSales,
    totalOrderAmount,
    difference: round2(totalOrderAmount - totalSales)
  };
  const rows = db
    .prepare(
      `SELECT o.id AS order_db_id, o.order_id, o.total_amount AS order_total, ec.customer_name AS end_customer_name,
        cc.customer_name AS contract_customer_name, o.sales_order, qi.material_no, qi.description, qi.qty,
        qi.final_unit_price, qi.line_amount,
        (SELECT COALESCE(SUM(qi2.line_amount), 0)
         FROM quotation_items qi2
         JOIN quotations q2 ON q2.id = qi2.quotation_id
         WHERE q2.order_id = o.id AND q2.id = o.selected_round_id) AS order_items_sum,
        (SELECT GROUP_CONCAT(cp.po_number, '、') FROM customer_pos cp WHERE cp.order_id = o.id) AS po_numbers
       ${baseFrom}
       ORDER BY o.id DESC, qi.id
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, (page - 1) * limit);

  const items = rows.map((row, index) => {
    const orderTotal = row.order_total == null ? null : Number(row.order_total);
    const itemSum = Number(row.order_items_sum || 0);
    return {
      id: `${row.order_db_id}-${row.material_no}-${row.line_amount}-${index}`,
      order_id: row.order_id,
      end_customer_name: row.end_customer_name,
      contract_customer_name: row.contract_customer_name,
      sales_order: row.sales_order,
      po_numbers: row.po_numbers || null,
      material_no: row.material_no,
      description: row.description,
      qty: row.qty,
      final_unit_price: row.final_unit_price,
      line_amount: row.line_amount,
      order_total: orderTotal,
      amount_difference: orderTotal === null ? null : round2(orderTotal - itemSum)
    };
  });
  return res.json({ items, total, page, limit, summary });
});

export default router;
