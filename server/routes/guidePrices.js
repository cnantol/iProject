import { Router } from 'express';
import { getDb } from '../db/init.js';
import { nowUtc, badRequest, notFound, pick, isMoney, parsePage } from '../utils.js';

const router = Router();
const FIELDS = ['material_no', 'description', 'guide_unit_price_ex_vat', 'unit', 'remark'];

router.get('/', (req, res) => {
  const q = String(req.query.q || '').trim();
  const page = parsePage(req.query.page);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  let where = ' WHERE 1=1';
  const params = [];
  if (q) {
    const like = `%${q}%`;
    where += ' AND (material_no LIKE ? OR description LIKE ?)';
    params.push(like, like);
  }
  const total = getDb().prepare(`SELECT COUNT(*) AS c FROM guide_prices${where}`).get(...params).c;
  const rows = getDb()
    .prepare(`SELECT * FROM guide_prices${where} ORDER BY material_no LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize);
  return res.json({ items: rows, total });
});

router.get('/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM guide_prices WHERE id = ?').get(req.params.id);
  if (!row) return notFound(res);
  return res.json(row);
});

router.post('/', (req, res) => {
  const data = pick(req.body || {}, FIELDS);
  if (!data.material_no || !String(data.material_no).trim()) return badRequest(res, '物料号必填');
  if (!isMoney(data.guide_unit_price_ex_vat)) return badRequest(res, '指导价必须大于 0');
  data.material_no = String(data.material_no).trim();
  data.unit = data.unit || 'pcs';
  const ts = nowUtc();
  try {
    const info = getDb()
      .prepare('INSERT INTO guide_prices (material_no, description, guide_unit_price_ex_vat, unit, remark, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
      .run(data.material_no, data.description ?? null, Number(data.guide_unit_price_ex_vat), data.unit, data.remark ?? null, ts, ts);
    return res.status(201).json(getDb().prepare('SELECT * FROM guide_prices WHERE id = ?').get(info.lastInsertRowid));
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return badRequest(res, '该物料号指导价已存在');
    throw err;
  }
});

router.put('/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM guide_prices WHERE id = ?').get(req.params.id);
  if (!row) return notFound(res);
  const data = pick(req.body || {}, FIELDS);
  if (data.material_no !== undefined && !String(data.material_no).trim()) return badRequest(res, '物料号必填');
  if (data.guide_unit_price_ex_vat !== undefined && !isMoney(data.guide_unit_price_ex_vat)) {
    return badRequest(res, '指导价必须大于 0');
  }
  try {
    getDb()
      .prepare('UPDATE guide_prices SET material_no=?, description=?, guide_unit_price_ex_vat=?, unit=?, remark=?, updated_at=? WHERE id=?')
      .run(
        data.material_no == null ? row.material_no : String(data.material_no).trim() || row.material_no,
        data.description ?? row.description,
        data.guide_unit_price_ex_vat !== undefined ? Number(data.guide_unit_price_ex_vat) : row.guide_unit_price_ex_vat,
        data.unit ?? row.unit,
        data.remark ?? row.remark,
        nowUtc(),
        row.id
      );
    return res.json(getDb().prepare('SELECT * FROM guide_prices WHERE id = ?').get(row.id));
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return badRequest(res, '该物料号指导价已存在');
    throw err;
  }
});

router.delete('/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM guide_prices WHERE id = ?').get(req.params.id);
  if (!row) return notFound(res);
  getDb().prepare('DELETE FROM guide_prices WHERE id = ?').run(row.id);
  return res.json({ message: '删除成功' });
});

export default router;
