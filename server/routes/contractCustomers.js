import { Router } from 'express';
import { getDb } from '../db/init.js';
import { nowUtc, badRequest, notFound, pick } from '../utils.js';

const router = Router();
const FIELDS = ['customer_name', 'contact_person', 'phone', 'email', 'remark'];

router.get('/', (req, res) => {
  const q = String(req.query.q || '').trim();
  let rows;
  if (q) {
    const like = `%${q}%`;
    rows = getDb()
      .prepare('SELECT * FROM contract_customers WHERE customer_name LIKE ? OR contact_person LIKE ? OR phone LIKE ? ORDER BY id DESC')
      .all(like, like, like);
  } else {
    rows = getDb().prepare('SELECT * FROM contract_customers ORDER BY customer_name COLLATE NOCASE').all();
  }
  return res.json({ items: rows });
});

router.get('/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM contract_customers WHERE id = ?').get(req.params.id);
  if (!row) return notFound(res);
  return res.json(row);
});

router.post('/', (req, res) => {
  const data = pick(req.body || {}, FIELDS);
  if (!data.customer_name || !String(data.customer_name).trim()) return badRequest(res, '客户名称必填');
  data.customer_name = String(data.customer_name).trim();
  const ts = nowUtc();
  try {
    const info = getDb()
      .prepare('INSERT INTO contract_customers (customer_name, contact_person, phone, email, remark, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
      .run(data.customer_name, data.contact_person ?? null, data.phone ?? null, data.email ?? null, data.remark ?? null, ts, ts);
    return res.status(201).json(getDb().prepare('SELECT * FROM contract_customers WHERE id = ?').get(info.lastInsertRowid));
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return badRequest(res, '客户名称已存在');
    throw err;
  }
});

router.put('/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM contract_customers WHERE id = ?').get(req.params.id);
  if (!row) return notFound(res);
  const data = pick(req.body || {}, FIELDS);
  if (data.customer_name !== undefined && !String(data.customer_name).trim()) return badRequest(res, '客户名称必填');
  if (data.customer_name) data.customer_name = String(data.customer_name).trim();
  try {
    getDb()
      .prepare('UPDATE contract_customers SET customer_name=?, contact_person=?, phone=?, email=?, remark=?, updated_at=? WHERE id=?')
      .run(
        data.customer_name ?? row.customer_name,
        data.contact_person ?? row.contact_person,
        data.phone ?? row.phone,
        data.email ?? row.email,
        data.remark ?? row.remark,
        nowUtc(),
        row.id
      );
    return res.json(getDb().prepare('SELECT * FROM contract_customers WHERE id = ?').get(row.id));
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return badRequest(res, '客户名称已存在');
    throw err;
  }
});

router.delete('/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM contract_customers WHERE id = ?').get(req.params.id);
  if (!row) return notFound(res);
  try {
    getDb().prepare('DELETE FROM contract_customers WHERE id = ?').run(row.id);
    return res.json({ message: '删除成功' });
  } catch (err) {
    if (String(err.message).includes('FOREIGN KEY')) return badRequest(res, '该客户已被销售机会引用，无法删除');
    throw err;
  }
});

export default router;
