import { Router } from 'express';
import { getDb } from '../db/init.js';
import { nowUtc, badRequest, notFound, pick } from '../utils.js';

const router = Router();
const FIELDS = ['customer_name', 'short_name', 'contact_person', 'phone', 'email', 'remark'];

function normalizeShortName(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const short = String(value).trim().toUpperCase();
  if (!/^[A-Z0-9]{2,8}$/.test(short)) return { error: '客户简称需为 2-8 位英文或数字' };
  return short;
}

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
  const short = normalizeShortName(data.short_name);
  if (short && short.error) return badRequest(res, short.error);
  const ts = nowUtc();
  try {
    const info = getDb()
      .prepare('INSERT INTO contract_customers (customer_name, short_name, contact_person, phone, email, remark, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(data.customer_name, short ?? null, data.contact_person ?? null, data.phone ?? null, data.email ?? null, data.remark ?? null, ts, ts);
    return res.status(201).json(getDb().prepare('SELECT * FROM contract_customers WHERE id = ?').get(info.lastInsertRowid));
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return badRequest(res, '客户名称或简称已存在');
    throw err;
  }
});

router.post('/copy-from-end', (req, res) => {
  const db = getDb();
  const rawIds = Array.isArray(req.body && req.body.ids) ? req.body.ids : [];
  const ids = rawIds.map(Number).filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return badRequest(res, '请选择要复制的最终客户');
  const ts = nowUtc();
  const tx = db.transaction(() => {
    let copied = 0;
    const skipped = [];
    const placeholders = ids.map(() => '?').join(',');
    const rows = db.prepare(`SELECT * FROM end_customers WHERE id IN (${placeholders})`).all(...ids);
    const exists = db.prepare('SELECT 1 FROM contract_customers WHERE customer_name = ? COLLATE NOCASE LIMIT 1');
    const insert = db.prepare(
      'INSERT INTO contract_customers (customer_name, short_name, contact_person, phone, email, remark, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)'
    );
    for (const row of rows) {
      if (exists.get(row.customer_name)) {
        skipped.push(row.customer_name);
        continue;
      }
      try {
        insert.run(row.customer_name, row.short_name, row.contact_person, row.phone, row.email, row.remark, ts, ts);
        copied += 1;
      } catch (err) {
        if (String(err.message).includes('UNIQUE')) {
          skipped.push(row.customer_name);
        } else {
          throw err;
        }
      }
    }
    return { copied, skipped };
  });
  const result = tx();
  return res.json({ copied: result.copied, skipped: result.skipped });
});

router.put('/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM contract_customers WHERE id = ?').get(req.params.id);
  if (!row) return notFound(res);
  const data = pick(req.body || {}, FIELDS);
  if (data.customer_name !== undefined && !String(data.customer_name).trim()) return badRequest(res, '客户名称必填');
  if (data.customer_name) data.customer_name = String(data.customer_name).trim();
  const short = data.short_name !== undefined ? normalizeShortName(data.short_name) : undefined;
  if (short && short.error) return badRequest(res, short.error);
  try {
    getDb()
      .prepare('UPDATE contract_customers SET customer_name=?, short_name=?, contact_person=?, phone=?, email=?, remark=?, updated_at=? WHERE id=?')
      .run(
        data.customer_name ?? row.customer_name,
        short !== undefined ? (short ?? null) : row.short_name,
        data.contact_person ?? row.contact_person,
        data.phone ?? row.phone,
        data.email ?? row.email,
        data.remark ?? row.remark,
        nowUtc(),
        row.id
      );
    return res.json(getDb().prepare('SELECT * FROM contract_customers WHERE id = ?').get(row.id));
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return badRequest(res, '客户名称或简称已存在');
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
