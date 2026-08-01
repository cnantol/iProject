import { Router } from 'express';
import { getDb } from '../db/init.js';
import { nowUtc, todayLocal, badRequest, notFound, pick, isMoney, isValidDate } from '../utils.js';

const router = Router();
const FIELDS = ['end_customer_id', 'material_no', 'description', 'unit_price_ex_vat', 'unit', 'agreement_no', 'valid_from', 'valid_to', 'remark'];

function hasFrameworkForCustomer(customerId) {
  if (!customerId) return false;
  const today = todayLocal();
  const row = getDb()
    .prepare(
      `SELECT 1 AS hit FROM materials
       WHERE end_customer_id = ? AND valid_from <= ? AND (valid_to IS NULL OR valid_to >= ?)
       LIMIT 1`
    )
    .get(Number(customerId), today, today);
  return Boolean(row);
}

function latestFramework(customerId, materialNo) {
  const today = todayLocal();
  return getDb()
    .prepare(
      `SELECT * FROM materials
       WHERE end_customer_id = ? AND material_no = ?
         AND valid_from <= ? AND (valid_to IS NULL OR valid_to >= ?)
       ORDER BY valid_from DESC, id DESC LIMIT 1`
    )
    .get(Number(customerId), String(materialNo).trim(), today, today);
}

router.get('/', (req, res) => {
  const q = String(req.query.q || '').trim();
  const customerId = req.query.end_customer_id ? Number(req.query.end_customer_id) : null;
  let sql = `SELECT m.*, ec.customer_name AS end_customer_name FROM materials m
             LEFT JOIN end_customers ec ON ec.id = m.end_customer_id WHERE 1=1`;
  const params = [];
  if (q) {
    sql += ' AND (m.material_no LIKE ? OR m.description LIKE ? OR m.agreement_no LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (customerId) {
    sql += ' AND m.end_customer_id = ?';
    params.push(customerId);
  }
  sql += ' ORDER BY m.valid_from DESC, m.id DESC';
  return res.json({ items: getDb().prepare(sql).all(...params) });
});

router.get('/check-framework', (req, res) => {
  const customerId = Number(req.query.end_customer_id);
  if (!customerId) return badRequest(res, '请选择最终客户');
  return res.json({ hasFramework: hasFrameworkForCustomer(customerId) ? 1 : 0 });
});

router.get('/lookup', (req, res) => {
  const customerId = Number(req.query.end_customer_id);
  const materialNo = String(req.query.material_no || '').trim();
  const materialType = String(req.query.material_type || 'standard');
  if (!materialNo) return badRequest(res, '请输入物料号');
  if (materialType === 'non_standard') {
    return res.json({ price_source: 'manual', unit_price_ex_vat: null, description: null, material_type: 'non_standard' });
  }
  const hasFramework = hasFrameworkForCustomer(customerId);
  if (hasFramework) {
    const framework = latestFramework(customerId, materialNo);
    if (framework) {
      return res.json({
        price_source: 'framework',
        unit_price_ex_vat: framework.unit_price_ex_vat,
        description: framework.description,
        material_type: 'standard'
      });
    }
    const guide = getDb().prepare('SELECT * FROM guide_prices WHERE material_no = ?').get(materialNo);
    if (guide) {
      return res.json({
        price_source: 'guide_price',
        unit_price_ex_vat: guide.guide_unit_price_ex_vat,
        description: guide.description,
        material_type: 'standard'
      });
    }
    return res.json({ price_source: 'manual', unit_price_ex_vat: null, description: null, material_type: 'standard' });
  }
  const guide = getDb().prepare('SELECT * FROM guide_prices WHERE material_no = ?').get(materialNo);
  if (guide) {
    return res.json({
      price_source: 'guide_price',
      unit_price_ex_vat: guide.guide_unit_price_ex_vat,
      description: guide.description,
      material_type: 'standard'
    });
  }
  return res.json({ price_source: 'manual', unit_price_ex_vat: null, description: null, material_type: 'standard' });
});

router.get('/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id);
  if (!row) return notFound(res);
  return res.json(row);
});

function validateMaterialData(data) {
  if (!data.end_customer_id) return '最终客户必选';
  if (!data.material_no || !String(data.material_no).trim()) return '物料号必填';
  if (!isMoney(data.unit_price_ex_vat)) return '协议未税单价必须大于 0';
  if (!isValidDate(data.valid_from)) return '生效日期必填且格式为 YYYY-MM-DD';
  if (data.valid_to !== undefined && data.valid_to !== null && data.valid_to !== '') {
    if (!isValidDate(data.valid_to)) return '失效日期格式必须为 YYYY-MM-DD';
    if (data.valid_to < data.valid_from) return '失效日期不得早于生效日期';
  }
  return null;
}

router.post('/', (req, res) => {
  const data = pick(req.body || {}, FIELDS);
  const error = validateMaterialData(data);
  if (error) return badRequest(res, error);
  data.material_no = String(data.material_no).trim();
  data.unit = data.unit || 'pcs';
  const ts = nowUtc();
  try {
    const info = getDb()
      .prepare(
        `INSERT INTO materials (end_customer_id, material_no, description, unit_price_ex_vat, unit, agreement_no, valid_from, valid_to, remark, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        Number(data.end_customer_id),
        data.material_no,
        data.description ?? null,
        Number(data.unit_price_ex_vat),
        data.unit,
        data.agreement_no ?? null,
        data.valid_from,
        data.valid_to || null,
        data.remark ?? null,
        ts,
        ts
      );
    return res.status(201).json(getDb().prepare('SELECT * FROM materials WHERE id = ?').get(info.lastInsertRowid));
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return badRequest(res, '该客户+物料号+生效日期已存在');
    throw err;
  }
});

router.put('/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id);
  if (!row) return notFound(res);
  const data = pick(req.body || {}, FIELDS);
  const merged = { ...row, ...data };
  const error = validateMaterialData(merged);
  if (error) return badRequest(res, error);
  merged.material_no = String(merged.material_no).trim();
  try {
    getDb()
      .prepare(
        `UPDATE materials SET end_customer_id=?, material_no=?, description=?, unit_price_ex_vat=?, unit=?, agreement_no=?, valid_from=?, valid_to=?, remark=?, updated_at=? WHERE id=?`
      )
      .run(
        Number(merged.end_customer_id),
        merged.material_no,
        merged.description,
        Number(merged.unit_price_ex_vat),
        merged.unit,
        merged.agreement_no,
        merged.valid_from,
        merged.valid_to || null,
        merged.remark,
        nowUtc(),
        row.id
      );
    return res.json(getDb().prepare('SELECT * FROM materials WHERE id = ?').get(row.id));
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return badRequest(res, '该客户+物料号+生效日期已存在');
    throw err;
  }
});

router.delete('/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id);
  if (!row) return notFound(res);
  getDb().prepare('DELETE FROM materials WHERE id = ?').run(row.id);
  return res.json({ message: '删除成功' });
});

export default router;
export { hasFrameworkForCustomer, latestFramework };
