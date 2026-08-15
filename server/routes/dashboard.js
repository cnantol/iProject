import { Router } from 'express';
import { getDb } from '../db/init.js';
import { round2, todayLocal } from '../utils.js';

const router = Router();

router.get('/', (req, res) => {
  const db = getDb();
  const total = db.prepare('SELECT COUNT(*) AS c FROM orders').get().c;
  const inProgress = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status NOT IN ('closed','lost_closed','cancelled')").get().c;
  const closed = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status IN ('closed','lost_closed','cancelled')").get().c;
  const totalAmount = db
    .prepare("SELECT COALESCE(SUM(total_amount), 0) AS s FROM orders WHERE status = 'closed' AND bid_result = 'won' AND total_amount IS NOT NULL")
    .get().s;
  const totalOrderAmount = db
    .prepare("SELECT COALESCE(SUM(total_amount), 0) AS s FROM orders WHERE total_amount IS NOT NULL AND status <> 'cancelled'")
    .get().s;
  const inProgressAmount = db
    .prepare(
      `SELECT COALESCE(SUM(total_amount), 0) AS s FROM orders
       WHERE status NOT IN ('closed','lost_closed','cancelled') AND total_amount IS NOT NULL`
    )
    .get().s;
  const nowText = todayLocal();
  const currentYear = Number(nowText.slice(0, 4));
  const currentMonth = Number(nowText.slice(5, 7));
  const months = [];
  for (let i = 11; i >= 0; i -= 1) {
    const date = new Date(currentYear, currentMonth - 1 - i, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    months.push({ key });
  }
  const startKey = months[0].key;
  const endKey = months[months.length - 1].key;
  const monthlyRows = db
    .prepare(
      `SELECT o.year || '-' || printf('%02d', CAST(o.month AS INTEGER)) AS month_key,
              COALESCE(SUM(o.total_amount), 0) AS amount,
              COUNT(o.id) AS order_count
       FROM orders o
       WHERE o.total_amount IS NOT NULL AND o.year IS NOT NULL AND o.month IS NOT NULL
         AND o.status <> 'cancelled'
         AND o.year || '-' || printf('%02d', CAST(o.month AS INTEGER)) BETWEEN ? AND ?
       GROUP BY month_key`
    )
    .all(startKey, endKey);
  const monthMap = new Map(months.map((month) => [month.key, { key: month.key, label: month.key, total: 0, orderCount: 0 }]));
  for (const row of monthlyRows) {
    const month = monthMap.get(row.month_key);
    if (!month) continue;
    const amount = Number(row.amount) || 0;
    month.total += amount;
    month.orderCount += Number(row.order_count) || 0;
  }
  const monthlySales = {
    totalAmount: round2(months.reduce((sum, month) => sum + (monthMap.get(month.key)?.total || 0), 0)),
    months: months.map((month) => {
      const item = monthMap.get(month.key);
      return { key: month.key, label: month.key, total: round2(item?.total || 0), orderCount: item?.orderCount || 0 };
    })
  };
  const inProgressRows = db
    .prepare(
      `SELECT o.year || '-' || printf('%02d', CAST(o.month AS INTEGER)) AS month_key,
              COALESCE(ec.customer_name, '未分配客户') AS customer_name,
              COALESCE(SUM(o.total_amount), 0) AS amount,
              COUNT(o.id) AS order_count
       FROM orders o
       LEFT JOIN end_customers ec ON ec.id = o.end_customer_id
       WHERE o.status NOT IN ('closed','lost_closed','cancelled')
         AND o.total_amount IS NOT NULL AND o.year IS NOT NULL AND o.month IS NOT NULL
       GROUP BY month_key, o.end_customer_id
       ORDER BY month_key`
    )
    .all();
  const inProgressMonthMap = new Map();
  const inProgressCustomerSeries = new Map();
  for (const row of inProgressRows) {
    let month = inProgressMonthMap.get(row.month_key);
    if (!month) {
      month = { key: row.month_key, label: row.month_key, total: 0, orderCount: 0 };
      inProgressMonthMap.set(row.month_key, month);
    }
    const amount = Number(row.amount) || 0;
    month.total += amount;
    month.orderCount += Number(row.order_count) || 0;
    let series = inProgressCustomerSeries.get(row.customer_name);
    if (!series) {
      series = new Map();
      inProgressCustomerSeries.set(row.customer_name, series);
    }
    series.set(row.month_key, (series.get(row.month_key) || 0) + amount);
  }
  const inProgressMonths = [...inProgressMonthMap.values()].sort((a, b) => a.key.localeCompare(b.key));
  const inProgressCustomerTotals = [...inProgressCustomerSeries.entries()]
    .map(([name, series]) => ({ name, total: [...series.values()].reduce((sum, value) => sum + value, 0), series }))
    .sort((a, b) => b.total - a.total);
  const inProgressRestSeries = new Map();
  for (const item of inProgressCustomerTotals.slice(5)) {
    for (const [key, amount] of item.series) {
      inProgressRestSeries.set(key, (inProgressRestSeries.get(key) || 0) + amount);
    }
  }
  const inProgressCustomers = inProgressCustomerTotals.slice(0, 5).map((item) => ({
    customer_name: item.name,
    series: inProgressMonths.map((month) => ({ key: month.key, amount: round2(item.series.get(month.key) || 0) }))
  }));
  if (inProgressRestSeries.size > 0) {
    inProgressCustomers.push({
      customer_name: '其他',
      series: inProgressMonths.map((month) => ({ key: month.key, amount: round2(inProgressRestSeries.get(month.key) || 0) }))
    });
  }
  const inProgressMonthly = {
    totalAmount: round2(inProgressMonths.reduce((sum, month) => sum + month.total, 0)),
    months: inProgressMonths.map((month) => ({
      key: month.key,
      label: month.key,
      total: round2(month.total),
      orderCount: month.orderCount
    })),
    customers: inProgressCustomers
  };
  const invoiceAging = db
    .prepare(
      `SELECT o.id, o.order_id, o.order_type, o.project_name, o.total_amount, o.invoiced_date,
              ec.customer_name AS end_customer_name
       FROM orders o
       LEFT JOIN end_customers ec ON ec.id = o.end_customer_id
       WHERE o.status NOT IN ('closed','lost_closed','cancelled')
         AND o.invoiced = 1 AND o.invoiced_date IS NOT NULL
       ORDER BY julianday(o.invoiced_date) ASC
       LIMIT 10`
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
    totalOrderAmount,
    inProgressAmount,
    monthlySales,
    inProgressMonthly,
    invoiceAging,
    recentTodos,
    overdueCount
  });
});

export default router;
