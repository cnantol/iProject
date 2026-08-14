import { Router } from 'express';
import { getDb } from '../db/init.js';
import { nowUtc, todayLocal, badRequest, notFound, pick, isValidDate, isBool } from '../utils.js';

const router = Router();
const FIELDS = ['title', 'description', 'priority', 'due_date', 'order_ref'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

function loadTodo(db, id) {
  return db.prepare('SELECT * FROM todos WHERE id = ?').get(Number(id));
}

router.get('/', (req, res) => {
  const db = getDb();
  const where = [];
  const params = [];
  if (req.query.priority) {
    where.push('t.priority = ?');
    params.push(String(req.query.priority));
  }
  if (req.query.status === 'open') {
    where.push('t.is_completed = 0');
  } else if (req.query.status === 'done') {
    where.push('t.is_completed = 1');
  }
  if (req.query.date) {
    where.push('t.due_date = ?');
    params.push(String(req.query.date));
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  let sql = `SELECT t.*, o.order_id AS order_number, o.project_name AS order_project_name
    FROM todos t LEFT JOIN orders o ON o.id = t.order_ref ${whereSql}`;
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  sql += ' ORDER BY t.is_completed ASC, (t.due_date < ?) DESC, t.due_date IS NULL ASC, t.due_date ASC, t.id DESC LIMIT ?';
  const items = db.prepare(sql).all(...params, todayLocal(), limit);
  return res.json({ items });
});

router.get('/overdue-count', (req, res) => {
  const count = getDb()
    .prepare('SELECT COUNT(*) AS c FROM todos WHERE is_completed = 0 AND due_date IS NOT NULL AND due_date < ?')
    .get(todayLocal()).c;
  return res.json({ count });
});

router.post('/', (req, res) => {
  const db = getDb();
  const data = pick(req.body || {}, FIELDS);
  if (!data.title || !String(data.title).trim()) return badRequest(res, '待办标题必填');
  if (data.priority && !PRIORITIES.includes(String(data.priority))) return badRequest(res, '优先级无效');
  if (data.due_date && !isValidDate(data.due_date)) return badRequest(res, '截止日期格式必须为 YYYY-MM-DD');
  if (data.order_ref) {
    const order = db.prepare('SELECT id FROM orders WHERE id = ?').get(Number(data.order_ref));
    if (!order) return badRequest(res, '关联商机不存在');
  }
  const ts = nowUtc();
  const info = db
    .prepare('INSERT INTO todos (title, description, priority, due_date, order_ref, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
    .run(
      String(data.title).trim(),
      data.description ? String(data.description) : null,
      data.priority || 'medium',
      data.due_date || null,
      data.order_ref ? Number(data.order_ref) : null,
      ts,
      ts
    );
  return res.status(201).json(loadTodo(db, info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const db = getDb();
  const row = loadTodo(db, req.params.id);
  if (!row) return notFound(res);
  const data = pick(req.body || {}, FIELDS);
  const merged = { ...row, ...data };
  if (!merged.title || !String(merged.title).trim()) return badRequest(res, '待办标题必填');
  if (merged.priority && !PRIORITIES.includes(String(merged.priority))) return badRequest(res, '优先级无效');
  if (merged.due_date && !isValidDate(merged.due_date)) return badRequest(res, '截止日期格式必须为 YYYY-MM-DD');
  if (merged.order_ref) {
    const order = db.prepare('SELECT id FROM orders WHERE id = ?').get(Number(merged.order_ref));
    if (!order) return badRequest(res, '关联商机不存在');
  }
  db.prepare('UPDATE todos SET title=?, description=?, priority=?, due_date=?, order_ref=?, updated_at=? WHERE id=?').run(
    String(merged.title).trim(),
    merged.description ?? null,
    merged.priority || 'medium',
    merged.due_date || null,
    merged.order_ref ? Number(merged.order_ref) : null,
    nowUtc(),
    row.id
  );
  return res.json(loadTodo(db, row.id));
});

router.patch('/:id/toggle', (req, res) => {
  const db = getDb();
  const row = loadTodo(db, req.params.id);
  if (!row) return notFound(res);
  const isCompleted = Number(req.body.is_completed);
  if (!isBool(isCompleted)) return badRequest(res, '完成状态参数无效');
  db.prepare('UPDATE todos SET is_completed = ?, completed_at = ?, updated_at = ? WHERE id = ?').run(
    isCompleted,
    isCompleted === 1 ? nowUtc() : null,
    nowUtc(),
    row.id
  );
  return res.json(loadTodo(db, row.id));
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const row = loadTodo(db, req.params.id);
  if (!row) return notFound(res);
  db.prepare('DELETE FROM todos WHERE id = ?').run(row.id);
  return res.json({ message: '待办已删除' });
});

export default router;
