import { Router } from 'express';
import { getDb } from '../db/init.js';
import { todayLocal } from '../utils.js';

const router = Router();

router.get('/', (req, res) => {
  const db = getDb();
  const total = db.prepare('SELECT COUNT(*) AS c FROM orders').get().c;
  const inProgress = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status NOT IN ('closed','lost_closed')").get().c;
  const closed = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status = 'closed'").get().c;
  const totalAmount = db
    .prepare("SELECT COALESCE(SUM(total_amount), 0) AS s FROM orders WHERE status = 'closed' AND bid_result = 'won' AND total_amount IS NOT NULL")
    .get().s;
  const statusDistribution = db.prepare('SELECT status, COUNT(*) AS count FROM orders GROUP BY status ORDER BY count DESC').all();
  const recentOrders = db
    .prepare(
      `SELECT o.id, o.order_id, o.project_name, o.status, o.total_amount, ec.customer_name AS end_customer_name
       FROM orders o LEFT JOIN end_customers ec ON ec.id = o.end_customer_id
       ORDER BY o.id DESC LIMIT 10`
    )
    .all();
  const recentTodos = db
    .prepare(
      `SELECT t.*, o.order_id AS order_number, o.project_name AS order_project_name FROM todos t
       LEFT JOIN orders o ON o.id = t.order_ref
       WHERE t.is_completed = 0
       ORDER BY (t.due_date < ?) DESC, t.due_date IS NULL ASC, t.due_date ASC, t.id DESC LIMIT 5`
    )
    .all(todayLocal());
  const overdueCount = db
    .prepare('SELECT COUNT(*) AS c FROM todos WHERE is_completed = 0 AND due_date IS NOT NULL AND due_date < ?')
    .get(todayLocal()).c;
  return res.json({
    totalOrders: total,
    inProgress,
    closedCount: closed,
    totalAmount,
    statusDistribution,
    recentOrders,
    recentTodos,
    overdueCount
  });
});

export default router;
