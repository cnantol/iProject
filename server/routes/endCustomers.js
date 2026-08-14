import { Router } from 'express';
import { getDb } from '../db/init.js';
import { recomputeOrderFrameworkFlags } from './materials.js';
import { nowUtc, badRequest, notFound, pick } from '../utils.js';

const router = Router();
const FIELDS = ['customer_name', 'short_name', 'parent_customer_id', 'contact_person', 'phone', 'email', 'remark'];

function wouldCreateCycle(db, customerId, parentId) {
  const seen = new Set();
  let current = Number(parentId);
  while (current) {
    if (current === Number(customerId)) return true;
    if (seen.has(current)) return true;
    seen.add(current);
    const row = db.prepare('SELECT parent_customer_id FROM end_customers WHERE id = ?').get(current);
    current = row && row.parent_customer_id ? Number(row.parent_customer_id) : null;
  }
  return false;
}

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
      .prepare('SELECT * FROM end_customers WHERE customer_name LIKE ? OR contact_person LIKE ? OR phone LIKE ? ORDER BY id DESC')
      .all(like, like, like);
  } else {
    rows = getDb().prepare('SELECT * FROM end_customers ORDER BY customer_name COLLATE NOCASE').all();
  }
  return res.json({ items: rows });
});

router.get('/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM end_customers WHERE id = ?').get(req.params.id);
  if (!row) return notFound(res);
  return res.json(row);
});

router.post('/', (req, res) => {
  const data = pick(req.body || {}, FIELDS);
  if (!data.customer_name || !String(data.customer_name).trim()) return badRequest(res, '客户名称必填');
  data.customer_name = String(data.customer_name).trim();
  const short = normalizeShortName(data.short_name);
  if (short && short.error) return badRequest(res, short.error);
  const parentId = data.parent_customer_id === undefined || data.parent_customer_id === null || data.parent_customer_id === '' ? null : Number(data.parent_customer_id);
  if (parentId !== null && (!Number.isInteger(parentId) || parentId <= 0)) return badRequest(res, '所属集团客户无效');
  if (parentId !== null && !getDb().prepare('SELECT 1 FROM end_customers WHERE id = ?').get(parentId)) return badRequest(res, '所属集团客户不存在');
  const ts = nowUtc();
  try {
    const info = getDb()
      .prepare('INSERT INTO end_customers (customer_name, short_name, parent_customer_id, contact_person, phone, email, remark, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(data.customer_name, short ?? null, parentId, data.contact_person ?? null, data.phone ?? null, data.email ?? null, data.remark ?? null, ts, ts);
    return res.status(201).json(getDb().prepare('SELECT * FROM end_customers WHERE id = ?').get(info.lastInsertRowid));
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return badRequest(res, '客户名称或简称已存在');
    throw err;
  }
});

router.put('/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM end_customers WHERE id = ?').get(req.params.id);
  if (!row) return notFound(res);
  const data = pick(req.body || {}, FIELDS);
  if (data.customer_name !== undefined && !String(data.customer_name).trim()) return badRequest(res, '客户名称必填');
  if (data.customer_name) data.customer_name = String(data.customer_name).trim();
  const short = data.short_name !== undefined ? normalizeShortName(data.short_name) : undefined;
  if (short && short.error) return badRequest(res, short.error);
  let parentId = row.parent_customer_id;
  if (data.parent_customer_id !== undefined) {
    parentId = data.parent_customer_id === null || data.parent_customer_id === '' ? null : Number(data.parent_customer_id);
    if (parentId !== null && (!Number.isInteger(parentId) || parentId <= 0)) return badRequest(res, '所属集团客户无效');
    if (parentId === row.id) return badRequest(res, '客户不能将自身设为所属集团');
    if (parentId !== null && wouldCreateCycle(getDb(), row.id, parentId)) return badRequest(res, '所属集团配置不能形成循环');
    if (parentId !== null && !getDb().prepare('SELECT 1 FROM end_customers WHERE id = ?').get(parentId)) return badRequest(res, '所属集团客户不存在');
  }
  try {
    getDb()
      .prepare('UPDATE end_customers SET customer_name=?, short_name=?, parent_customer_id=?, contact_person=?, phone=?, email=?, remark=?, updated_at=? WHERE id=?')
      .run(
        data.customer_name ?? row.customer_name,
        short !== undefined ? (short ?? null) : row.short_name,
        parentId,
        data.contact_person ?? row.contact_person,
        data.phone ?? row.phone,
        data.email ?? row.email,
        data.remark ?? row.remark,
        nowUtc(),
        row.id
      );
    recomputeOrderFrameworkFlags(getDb());
    return res.json(getDb().prepare('SELECT * FROM end_customers WHERE id = ?').get(row.id));
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return badRequest(res, '客户名称或简称已存在');
    throw err;
  }
});

router.delete('/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM end_customers WHERE id = ?').get(req.params.id);
  if (!row) return notFound(res);
  try {
    getDb().prepare('DELETE FROM end_customers WHERE id = ?').run(row.id);
    return res.json({ message: '删除成功' });
  } catch (err) {
    if (String(err.message).includes('FOREIGN KEY')) return badRequest(res, '该客户已被商机、框架协议或作为其他客户的所属集团引用，无法删除');
    throw err;
  }
});

export default router;
