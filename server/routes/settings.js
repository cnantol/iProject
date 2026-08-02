import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import bcrypt from 'bcryptjs';
import xlsx from 'xlsx';
import { getDb, getDataDir, getUploadDir, closeDb, initDb, seedWorkflow, rotateJwtSecret } from '../db/init.js';
import { upload } from '../middleware/upload.js';
import { nowUtc, todayLocal, badRequest, notFound, conflict, isMoney, isBool, isValidDate, normalizeSo, writeAudit } from '../utils.js';
import { loadOrderDetail, checkSalesOrderUnique } from './orders.js';
import { buildQuotationPdf } from './quotations.js';

const router = Router();

// ---------- 工作流配置（展示层） ----------
router.get('/workflow', (req, res) => {
  const db = getDb();
  const steps = db.prepare('SELECT * FROM workflow_steps ORDER BY sort_order').all();
  const transitions = db.prepare('SELECT * FROM workflow_transitions ORDER BY id').all();
  return res.json({ steps, transitions });
});

router.put('/workflow', (req, res) => {
  const db = getDb();
  const { steps } = req.body || {};
  if (!Array.isArray(steps)) return badRequest(res, 'steps 必须为数组');
  const tx = db.transaction((rows) => {
    const update = db.prepare('UPDATE workflow_steps SET step_name = ?, sort_order = ?, is_active = ? WHERE step_key = ?');
    for (const step of rows) {
      if (!step.step_key) continue;
      update.run(
        step.step_name != null ? String(step.step_name) : step.step_key,
        Number.isFinite(Number(step.sort_order)) ? Number(step.sort_order) : 0,
        Number(step.is_active) === 1 ? 1 : 0,
        step.step_key
      );
    }
  });
  tx(steps);
  const result = db.prepare('SELECT * FROM workflow_steps ORDER BY sort_order').all();
  return res.json({ steps: result });
});

// ---------- 步骤字段绑定（展示层配置） ----------
router.get('/workflow/bindings', (req, res) => {
  const items = getDb()
    .prepare(
      `SELECT wf.step_key, wf.field_id, wf.sort_order, cf.field_name, cf.entity_type
       FROM workflow_step_fields wf
       JOIN custom_fields cf ON cf.id = wf.field_id
       ORDER BY wf.step_key, wf.sort_order`
    )
    .all();
  return res.json({ items });
});

router.put('/workflow/bindings', (req, res) => {
  const db = getDb();
  const { bindings } = req.body || {};
  if (!Array.isArray(bindings)) return badRequest(res, 'bindings 必须为数组');
  const stepKeys = new Set(db.prepare('SELECT step_key FROM workflow_steps').all().map((row) => row.step_key));
  const tx = db.transaction((rows) => {
    const del = db.prepare('DELETE FROM workflow_step_fields WHERE step_key = ?');
    const ins = db.prepare('INSERT INTO workflow_step_fields (step_key, field_id, sort_order) VALUES (?,?,?)');
    for (const item of rows) {
      if (!stepKeys.has(item.step_key) || !Array.isArray(item.field_ids)) continue;
      del.run(item.step_key);
      item.field_ids.forEach((fieldId, index) => {
        const id = Number(fieldId);
        if (Number.isFinite(id)) ins.run(item.step_key, id, index);
      });
    }
  });
  tx(bindings);
  return res.json({ message: '字段绑定已保存' });
});

// ---------- 自定义字段 ----------
router.get('/fields', (req, res) => {
  const db = getDb();
  const entityType = req.query.entity_type ? String(req.query.entity_type) : null;
  const rows = entityType
    ? db.prepare('SELECT * FROM custom_fields WHERE entity_type = ? ORDER BY sort_order, id').all(entityType)
    : db.prepare('SELECT * FROM custom_fields ORDER BY entity_type, sort_order, id').all();
  return res.json({ items: rows });
});

router.post('/fields', (req, res) => {
  const db = getDb();
  const { entity_type: entityType, field_name: fieldName, field_type: fieldType, field_options: fieldOptions } = req.body || {};
  if (!entityType || !['end_customer', 'contract_customer', 'material', 'guide_price', 'order'].includes(String(entityType))) {
    return badRequest(res, '所属实体无效');
  }
  if (!fieldName || !String(fieldName).trim()) return badRequest(res, '字段名称必填');
  if (!fieldType || !['text', 'number', 'date', 'select'].includes(String(fieldType))) return badRequest(res, '字段类型无效');
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM custom_fields WHERE entity_type = ?').get(entityType).m;
  const info = db
    .prepare('INSERT INTO custom_fields (entity_type, field_name, field_type, field_options, is_system, sort_order, created_at) VALUES (?,?,?,?,0,?,?)')
    .run(entityType, String(fieldName).trim(), fieldType, fieldOptions ? JSON.stringify(fieldOptions) : null, max + 1, nowUtc());
  return res.status(201).json(db.prepare('SELECT * FROM custom_fields WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/fields/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM custom_fields WHERE id = ?').get(req.params.id);
  if (!row) return notFound(res);
  if (Number(row.is_system) === 1) return badRequest(res, '系统内置字段不可修改');
  const { field_name: fieldName, field_type: fieldType, field_options: fieldOptions, sort_order: sortOrder } = req.body || {};
  if (fieldName !== undefined && !String(fieldName).trim()) return badRequest(res, '字段名称必填');
  if (fieldType !== undefined && !['text', 'number', 'date', 'select'].includes(String(fieldType))) return badRequest(res, '字段类型无效');
  db.prepare('UPDATE custom_fields SET field_name=?, field_type=?, field_options=?, sort_order=? WHERE id=?').run(
    fieldName !== undefined ? String(fieldName).trim() : row.field_name,
    fieldType !== undefined ? String(fieldType) : row.field_type,
    fieldOptions !== undefined ? JSON.stringify(fieldOptions) : row.field_options,
    sortOrder !== undefined ? Number(sortOrder) : row.sort_order,
    row.id
  );
  return res.json(db.prepare('SELECT * FROM custom_fields WHERE id = ?').get(row.id));
});

router.delete('/fields/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM custom_fields WHERE id = ?').get(req.params.id);
  if (!row) return notFound(res);
  if (Number(row.is_system) === 1) return badRequest(res, '系统内置字段不可删除');
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM order_custom_fields WHERE field_id = ?').run(row.id);
    db.prepare('DELETE FROM workflow_step_fields WHERE field_id = ?').run(row.id);
    db.prepare('DELETE FROM custom_fields WHERE id = ?').run(row.id);
  });
  tx();
  writeAudit(db, {
    userId: req.user.id,
    action: 'other',
    entityType: 'settings',
    entityId: row.id,
    detail: { event: 'delete_custom_field', entity_type: row.entity_type, field_name: row.field_name }
  });
  return res.json({ message: '自定义字段已删除' });
});

// ---------- 数据导入 ----------
const IMPORT_TARGETS = {
  end_customer: {
    label: '最终客户导入',
    headers: ['客户名称', '联系人', '电话', '邮箱', '备注'],
    required: ['客户名称']
  },
  contract_customer: {
    label: '合同客户导入',
    headers: ['客户名称', '联系人', '电话', '邮箱', '备注'],
    required: ['客户名称']
  },
  material: {
    label: '框架协议价格导入',
    headers: ['最终客户', '物料号', '描述', '协议未税单价', '单位', '协议编号', '生效日期', '失效日期', '备注'],
    required: ['最终客户', '物料号', '协议未税单价', '生效日期']
  },
  guide_price: {
    label: '指导价导入',
    headers: ['物料号', '描述', '指导价', '单位', '备注'],
    required: ['物料号', '指导价']
  },
  history: {
    label: '历史订单导入',
    headers: ['订单号', '年份', '月份', '最终客户', '合同客户', '项目名称', '项目负责人', '订单类型', '状态', 'Sales Order', '总金额', '是否发货', '发货日期', '是否开票', '开票日期', '佣金是否匹配', '佣金金额', '付款条款', '项目编号', '车间', '项目备注'],
    required: ['订单号', '年份', '月份']
  }
};

function headerIndex(headers, ...names) {
  const map = new Map(headers.map((h, i) => [String(h == null ? '' : h).trim().toLowerCase(), i]));
  for (const name of names) {
    const idx = map.get(String(name).trim().toLowerCase());
    if (idx !== undefined) return idx;
  }
  return -1;
}

function cell(row, idx) {
  if (idx < 0 || !row) return null;
  const value = row[idx];
  return value === undefined ? null : value;
}

router.get('/import/:target/template', (req, res) => {
  const target = IMPORT_TARGETS[req.params.target];
  if (!target) return notFound(res);
  const sheet = xlsx.utils.aoa_to_sheet([target.headers, target.headers.map(() => '')]);
  const book = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(book, sheet, 'Sheet1');
  const buffer = xlsx.write(book, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.target}-template.xlsx"`);
  return res.send(buffer);
});

router.post('/import/:target', upload.single('file'), (req, res) => {
  if (!req.file) return badRequest(res, '请上传 Excel 文件');
  const target = IMPORT_TARGETS[req.params.target];
  if (!target) {
    fs.unlinkSync(req.file.path);
    return notFound(res);
  }
  const workbook = xlsx.readFile(req.file.path);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  fs.unlinkSync(req.file.path);
  if (!rows || rows.length < 2) return badRequest(res, 'Excel 无有效数据');

  const headers = rows[0] || [];
  const db = getDb();
  let success = 0;
  const failures = [];
  const total = rows.length - 1;

  const tx = db.transaction(() => {
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 1;
      if (row.every((value) => value === null || value === undefined || value === '')) continue;
      const error = importRow(db, target, headers, row);
      if (error) failures.push({ row: rowNumber, reason: error });
      else success += 1;
    }
    const info = db
      .prepare('INSERT INTO import_logs (target_type, file_name, total_rows, success_rows, fail_rows, created_at) VALUES (?,?,?,?,?,?)')
      .run(req.params.target, req.file.originalname, total, success, failures.length, nowUtc());
    writeAudit(db, {
      userId: req.user.id,
      action: 'other',
      entityType: 'settings',
      entityId: info.lastInsertRowid,
      detail: { event: 'import', target: req.params.target, total_rows: total, success_rows: success, fail_rows: failures.length }
    });
    return info.lastInsertRowid;
  });
  const logId = tx();
  return res.json({ import_log_id: logId, success_rows: success, fail_rows: failures.length, failures: failures.slice(0, 100) });
});

function importRow(db, target, headers, row) {
  const value = (name) => cell(row, headerIndex(headers, name));
  if (target === IMPORT_TARGETS.end_customer || target === IMPORT_TARGETS.contract_customer) {
    const name = value('客户名称');
    if (name === null || String(name).trim() === '') return '客户名称必填';
    const table = target === IMPORT_TARGETS.end_customer ? 'end_customers' : 'contract_customers';
    try {
      db.prepare(`INSERT INTO ${table} (customer_name, contact_person, phone, email, remark, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`).run(
        String(name).trim(),
        value('联系人') != null ? String(value('联系人')) : null,
        value('电话') != null ? String(value('电话')) : null,
        value('邮箱') != null ? String(value('邮箱')) : null,
        value('备注') != null ? String(value('备注')) : null,
        nowUtc(),
        nowUtc()
      );
      return null;
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) return '客户名称已存在';
      throw err;
    }
  }
  if (target === IMPORT_TARGETS.guide_price) {
    const materialNo = value('物料号');
    const price = value('指导价');
    if (materialNo === null || String(materialNo).trim() === '') return '物料号必填';
    if (!isMoney(price)) return '指导价必须大于 0';
    try {
      db.prepare('INSERT INTO guide_prices (material_no, description, guide_unit_price_ex_vat, unit, remark, created_at, updated_at) VALUES (?,?,?,?,?,?,?)').run(
        String(materialNo).trim(),
        value('描述') != null ? String(value('描述')) : null,
        Number(price),
        value('单位') != null ? String(value('单位')) : 'pcs',
        value('备注') != null ? String(value('备注')) : null,
        nowUtc(),
        nowUtc()
      );
      return null;
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) return '该物料号指导价已存在';
      throw err;
    }
  }
  if (target === IMPORT_TARGETS.material) {
    const customerName = value('最终客户');
    const materialNo = value('物料号');
    const price = value('协议未税单价');
    const validFrom = value('生效日期');
    if (customerName === null || String(customerName).trim() === '') return '最终客户必填';
    if (materialNo === null || String(materialNo).trim() === '') return '物料号必填';
    if (!isMoney(price)) return '协议未税单价必须大于 0';
    if (!isValidDate(String(validFrom))) return '生效日期必填且格式为 YYYY-MM-DD';
    const customer = db.prepare('SELECT id FROM end_customers WHERE customer_name = ?').get(String(customerName).trim());
    if (!customer) return '客户名称不存在';
    const validTo = value('失效日期');
    if (validTo !== null && validTo !== '' && !isValidDate(String(validTo))) return '失效日期格式必须为 YYYY-MM-DD';
    if (validTo && String(validTo) < String(validFrom)) return '失效日期不得早于生效日期';
    try {
      db.prepare('INSERT INTO materials (end_customer_id, material_no, description, unit_price_ex_vat, unit, agreement_no, valid_from, valid_to, remark, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
        customer.id,
        String(materialNo).trim(),
        value('描述') != null ? String(value('描述')) : null,
        Number(price),
        value('单位') != null ? String(value('单位')) : 'pcs',
        value('协议编号') != null ? String(value('协议编号')) : null,
        String(validFrom),
        validTo ? String(validTo) : null,
        value('备注') != null ? String(value('备注')) : null,
        nowUtc(),
        nowUtc()
      );
      return null;
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) return '该客户+物料号+生效日期已存在';
      throw err;
    }
  }
  if (target === IMPORT_TARGETS.history) {
    return importHistoryRow(db, headers, row);
  }
  return '未知导入目标';
}

function importHistoryRow(db, headers, row) {
  const value = (name) => cell(row, headerIndex(headers, name));
  const orderId = value('订单号');
  const year = value('年份');
  const month = value('月份');
  if (orderId === null || String(orderId).trim() === '') return '订单号必填';
  if (year === null || String(year).trim() === '') return '年份必填';
  if (month === null || String(month).trim() === '') return '月份必填';
  const status = value('状态') ? String(value('状态')) : 'customer_info';
  const statuses = ['customer_info', 'proposal', 'quotation', 'approval_pending', 'bid_decision', 'finance', 'shipping_invoicing', 'commission', 'closed', 'lost_closed'];
  if (!statuses.includes(status)) return '状态值非法';
  const endName = value('最终客户');
  const contractName = value('合同客户');
  let endCustomerId = null;
  let contractCustomerId = null;
  if (endName !== null && String(endName).trim() !== '') {
    const ec = db.prepare('SELECT id FROM end_customers WHERE customer_name = ?').get(String(endName).trim());
    if (!ec) return '最终客户名称不存在';
    endCustomerId = ec.id;
  }
  if (contractName !== null && String(contractName).trim() !== '') {
    const cc = db.prepare('SELECT id FROM contract_customers WHERE customer_name = ?').get(String(contractName).trim());
    if (!cc) return '合同客户名称不存在';
    contractCustomerId = cc.id;
  }
  const salesOrder = value('Sales Order') != null ? normalizeSo(value('Sales Order')) : null;
  if (salesOrder && !checkSalesOrderUnique(db, salesOrder, null)) return '该 SO 号已被其他订单使用';
  const totalAmountRaw = value('总金额');
  let totalAmount = null;
  if (totalAmountRaw !== null && totalAmountRaw !== '') {
    if (!isMoney(totalAmountRaw)) return '总金额必须大于 0';
    totalAmount = Number(totalAmountRaw);
  }
  const delivered = parseBool(value('是否发货'));
  const invoiced = parseBool(value('是否开票'));
  const commissionMatched = parseBool(value('佣金是否匹配'));
  const commissionAmountRaw = value('佣金金额');
  let commissionAmount = null;
  if (commissionAmountRaw !== null && commissionAmountRaw !== '') {
    if (!isMoney(commissionAmountRaw)) return '佣金金额必须大于 0';
    commissionAmount = Number(commissionAmountRaw);
  }
  const deliveredDate = value('发货日期') != null && value('发货日期') !== '' ? String(value('发货日期')) : null;
  const invoicedDate = value('开票日期') != null && value('开票日期') !== '' ? String(value('开票日期')) : null;
  if (delivered === 1 && !deliveredDate) return 'delivered=1 必须同时提供发货日期';
  if (commissionMatched === 1 && !isMoney(commissionAmount)) return '已闭环订单缺少佣金金额';
  if (status === 'closed' && (delivered !== 1 || invoiced !== 1 || !isMoney(commissionAmount))) {
    return 'closed 订单必须 delivered=1 且 invoiced=1 且有佣金金额';
  }
  if (deliveredDate && !isValidDate(deliveredDate)) return '发货日期格式必须为 YYYY-MM-DD';
  if (invoicedDate && !isValidDate(invoicedDate)) return '开票日期格式必须为 YYYY-MM-DD';
  const orderType = value('订单类型') ? String(value('订单类型')) : null;
  if (orderType && !['A', 'B', 'C'].includes(orderType)) return '订单类型无效';
  const ts = nowUtc();
  try {
    db.prepare(
      `INSERT INTO orders (order_id, year, month, end_customer_id, contract_customer_id, order_type, project_no, workshop,
        project_name, project_owner, project_remark, sales_order, total_amount, payment_terms, delivered, delivered_date,
        invoiced, invoiced_date, commission_matched, commission_amount, commission_date, status, has_framework, proposal_skipped,
        closed_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      String(orderId).trim(),
      String(year).trim(),
      String(month).trim(),
      endCustomerId,
      contractCustomerId,
      orderType,
      value('项目编号') != null ? String(value('项目编号')) : null,
      value('车间') != null ? String(value('车间')) : null,
      value('项目名称') != null ? String(value('项目名称')) : null,
      value('项目负责人') != null ? String(value('项目负责人')) : null,
      value('项目备注') != null ? String(value('项目备注')) : null,
      salesOrder,
      totalAmount,
      value('付款条款') != null ? String(value('付款条款')) : null,
      delivered,
      deliveredDate,
      invoiced,
      invoicedDate,
      commissionMatched,
      commissionAmount,
      commissionMatched === 1 ? ts : null,
      status,
      0,
      0,
      ['closed', 'lost_closed'].includes(status) ? ts : null,
      ts,
      ts
    );
    return null;
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return '订单号或 SO 号已存在';
    throw err;
  }
}

function parseBool(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (Number(value) === 1 || String(value).trim().toLowerCase() === 'true') return 1;
  return 0;
}

router.get('/import-logs', (req, res) => {
  const items = getDb().prepare('SELECT * FROM import_logs ORDER BY id DESC LIMIT 100').all();
  return res.json({ items });
});

// ---------- 备份与还原 ----------
function createBackup() {
  const db = getDb();
  db.pragma('wal_checkpoint(FULL)');
  const dataDir = getDataDir();
  const dbPath = path.join(dataDir, 'database.sqlite');
  const backupDir = path.join(dataDir, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const filename = `atlas-backup-${ts}.zip`;
  const zip = new AdmZip();
  if (fs.existsSync(dbPath)) zip.addFile('database.sqlite', fs.readFileSync(dbPath));
  if (fs.existsSync(quoteStyleFile())) zip.addFile('quote-style.json', fs.readFileSync(quoteStyleFile()));
  const uploads = getUploadDir();
  if (fs.existsSync(uploads)) {
    for (const file of fs.readdirSync(uploads)) {
      const filePath = path.join(uploads, file);
      if (fs.statSync(filePath).isFile()) zip.addFile(`uploads/${file}`, fs.readFileSync(filePath));
    }
  }
  const zipPath = path.join(backupDir, filename);
  fs.writeFileSync(zipPath, zip.toBuffer());
  return { filename, size: fs.statSync(zipPath).size, downloadUrl: `/api/settings/backup/${filename}/download` };
}

router.post('/backup', (req, res) => {
  const result = createBackup();
  writeAudit(getDb(), { userId: req.user.id, action: 'other', entityType: 'settings', detail: { event: 'backup', filename: result.filename } });
  return res.json(result);
});

// ---------- 报价单式样 ----------
const QUOTE_STYLE_LABEL_KEYS = [
  'quote_title',
  'quote_no',
  'order_no',
  'project_name',
  'end_customer',
  'contract_customer',
  'detail_title',
  'total',
  'generated_at',
  'material_no',
  'description',
  'type',
  'price_source',
  'unit_price',
  'qty',
  'line_amount'
];

const QUOTE_STYLE_VISIBILITY_KEYS = [
  'quote_no',
  'order_no',
  'project_name',
  'customer',
  'contact_info',
  'material_no',
  'description',
  'type',
  'price_source',
  'unit_price',
  'qty',
  'line_amount'
];

function defaultQuoteStyle() {
  return {
    company_name: 'Atlas Copco',
    primary_color: '#004E9A',
    secondary_color: '#DCE8F5',
    company_address: '',
    company_phone: '',
    company_email: '',
    header_text: '',
    footer_text: '',
    font_family: 'sans',
    title_alignment: 'center',
    info_alignment: 'center',
    header_alignment: 'center',
    footer_alignment: 'center',
    logo: null,
    field_visibility: {
      quote_no: 1,
      order_no: 1,
      project_name: 1,
      customer: 1,
      contact_info: 1,
      material_no: 1,
      description: 1,
      type: 1,
      price_source: 1,
      unit_price: 1,
      qty: 1,
      line_amount: 1
    },
    labels: {
      quote_title: '报价单',
      quote_no: '报价单编号',
      order_no: '订单号',
      project_name: '项目名称',
      end_customer: '最终客户',
      contract_customer: '合同客户',
      detail_title: '报价明细',
      total: '合计（未税）',
      generated_at: '生成时间',
      material_no: '物料号',
      description: '描述',
      type: '类型',
      price_source: '价格来源',
      unit_price: '单价',
      qty: '数量',
      line_amount: '行金额'
    }
  };
}

function normalizeQuoteStyle(raw = {}) {
  const defaults = defaultQuoteStyle();
  const text = (value, fallback, max = 200) => (value === undefined || value === null ? fallback : String(value).trim().slice(0, max));
  const color = (value, fallback) => (/^#[0-9A-Fa-f]{6}$/.test(String(value || '')) ? String(value) : fallback);
  const labels = { ...defaults.labels };
  const rawLabels = raw.labels && typeof raw.labels === 'object' ? raw.labels : {};
  for (const key of QUOTE_STYLE_LABEL_KEYS) {
    if (rawLabels[key] !== undefined) labels[key] = text(rawLabels[key], labels[key], 40);
  }
  const align = (value, fallback) => (['left', 'center', 'right'].includes(value) ? value : fallback);
  const visibility = { ...defaults.field_visibility };
  const rawVisibility = raw.field_visibility && typeof raw.field_visibility === 'object' ? raw.field_visibility : {};
  for (const key of QUOTE_STYLE_VISIBILITY_KEYS) {
    if (rawVisibility[key] !== undefined) visibility[key] = Number(rawVisibility[key]) === 1 || rawVisibility[key] === true ? 1 : 0;
  }
  const logo = raw.logo && /^data:image\/(png|jpeg|jpg);base64,/i.test(String(raw.logo)) && String(raw.logo).length <= 2_400_000 ? String(raw.logo) : null;
  return {
    company_name: text(raw.company_name, defaults.company_name, 80),
    primary_color: color(raw.primary_color, defaults.primary_color),
    secondary_color: color(raw.secondary_color, defaults.secondary_color),
    company_address: text(raw.company_address, '', 200),
    company_phone: text(raw.company_phone, '', 60),
    company_email: text(raw.company_email, '', 120),
    header_text: text(raw.header_text, '', 200),
    footer_text: text(raw.footer_text, '', 200),
    font_family: ['sans', 'serif', 'mono'].includes(raw.font_family) ? raw.font_family : defaults.font_family,
    title_alignment: align(raw.title_alignment, defaults.title_alignment),
    info_alignment: align(raw.info_alignment, defaults.info_alignment),
    header_alignment: align(raw.header_alignment, defaults.header_alignment),
    footer_alignment: align(raw.footer_alignment, defaults.footer_alignment),
    logo,
    field_visibility: visibility,
    labels
  };
}

function quoteStyleFile() {
  return path.join(getDataDir(), 'quote-style.json');
}

function readQuoteStyle() {
  try {
    return normalizeQuoteStyle(JSON.parse(fs.readFileSync(quoteStyleFile(), 'utf8')));
  } catch {
    return defaultQuoteStyle();
  }
}

router.get('/quote-style', (req, res) => {
  return res.json(readQuoteStyle());
});

router.put('/quote-style', (req, res) => {
  const style = normalizeQuoteStyle(req.body || {});
  fs.writeFileSync(quoteStyleFile(), JSON.stringify(style, null, 2));
  return res.json(style);
});

router.post('/quote-style/test-pdf', (req, res) => {
  const style = normalizeQuoteStyle(req.body?.style || readQuoteStyle());
  const sampleOrder = { order_id: 'ORD-2026-TEST', project_name: '示例项目（测试）' };
  const sampleRound = { round_no: 1, total_amount: 128500.5 };
  const sampleItems = [
    {
      material_no: 'AC-1001',
      description: '压缩机组示例',
      material_type: 'standard',
      price_source: 'guide_price',
      unit_price_ex_vat: 128500.5,
      qty: 1,
      line_amount: 128500.5
    },
    {
      material_no: 'AC-1002',
      description: '备件套件示例',
      material_type: 'non_standard',
      price_source: 'manual',
      unit_price_ex_vat: 0,
      qty: 1,
      line_amount: 0
    }
  ];
  const customerNames = { end: '示例最终客户', contract: '示例合同客户' };
  const doc = buildQuotationPdf(sampleOrder, sampleRound, sampleItems, customerNames, style);
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  doc.on('end', () => {
    const buffer = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="quote-style-test.pdf"');
    res.send(buffer);
  });
});

// ---------- 定时自动备份 ----------
function backupScheduleFile() {
  return path.join(getDataDir(), 'backup-schedule.json');
}

function readBackupSchedule() {
  try {
    return JSON.parse(fs.readFileSync(backupScheduleFile(), 'utf8'));
  } catch {
    return { enabled: false, hour: 2, minute: 0 };
  }
}

router.get('/backup-schedule', (req, res) => {
  return res.json(readBackupSchedule());
});

router.put('/backup-schedule', (req, res) => {
  const { enabled, hour, minute } = req.body || {};
  const schedule = {
    enabled: Number(enabled) === 1,
    hour: Math.min(23, Math.max(0, Number(hour) || 0)),
    minute: Math.min(59, Math.max(0, Number(minute) || 0))
  };
  fs.writeFileSync(backupScheduleFile(), JSON.stringify(schedule, null, 2));
  return res.json(schedule);
});

let backupTimer = null;
let lastScheduledBackupKey = '';

export function startBackupScheduler() {
  if (backupTimer) return;
  backupTimer = setInterval(() => {
    try {
      const schedule = readBackupSchedule();
      if (!schedule.enabled) return;
      const now = new Date();
      const key = `${now.getHours()}:${now.getMinutes()}`;
      const target = `${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')}`;
      if (key !== target || key === lastScheduledBackupKey) return;
      lastScheduledBackupKey = key;
      const result = createBackup();
      writeAudit(getDb(), { userId: null, action: 'other', entityType: 'settings', detail: { event: 'scheduled_backup', filename: result.filename } });
    } catch (err) {
      console.error('定时备份失败:', err);
    }
  }, 60000);
}

router.get('/backup/:filename/download', (req, res) => {
  const filename = String(req.params.filename);
  if (!/^atlas-backup-[\d]{14}\.zip$/.test(filename)) return badRequest(res, '备份文件名无效');
  const filePath = path.join(getDataDir(), 'backups', filename);
  if (!fs.existsSync(filePath)) return notFound(res, '备份文件不存在');
  return res.download(filePath, filename);
});

router.post('/restore', upload.single('file'), (req, res) => {
  if (!req.file) return badRequest(res, '请上传备份文件');
  const dataDir = getDataDir();
  const tmpDir = path.join(dataDir, 'restore-tmp');
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    const zip = new AdmZip(req.file.path);
    zip.extractAllTo(tmpDir, true);
    const dbFile = path.join(tmpDir, 'database.sqlite');
    if (!fs.existsSync(dbFile)) return badRequest(res, '备份文件缺少 database.sqlite');
    const uploadsZip = path.join(tmpDir, 'uploads');
    closeDb();
    fs.copyFileSync(dbFile, path.join(dataDir, 'database.sqlite'));
    fs.rmSync(path.join(dataDir, 'database.sqlite-wal'), { force: true });
    fs.rmSync(path.join(dataDir, 'database.sqlite-shm'), { force: true });
    if (fs.existsSync(uploadsZip)) {
      fs.rmSync(getUploadDir(), { recursive: true, force: true });
      fs.cpSync(uploadsZip, getUploadDir(), { recursive: true });
    }
    const styleZip = path.join(tmpDir, 'quote-style.json');
    if (fs.existsSync(styleZip)) fs.copyFileSync(styleZip, quoteStyleFile());
    initDb(dataDir);
    writeAudit(getDb(), { userId: req.user.id, action: 'other', entityType: 'settings', detail: { event: 'restore', filename: req.file.originalname } });
    return res.json({ message: '还原成功' });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.unlinkSync(req.file.path);
  }
});

// ---------- 数据修正 ----------
router.put('/correct-order-data', (req, res) => {
  const db = getDb();
  const { order_id: orderId, changes = {}, target_status: targetStatus = null, confirm = false } = req.body || {};
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(orderId));
  if (!order) return notFound(res);
  if (Number(confirm) !== 1) return badRequest(res, '数据修正需二次确认');

  const before = {
    status: order.status,
    sales_order: order.sales_order,
    total_amount: order.total_amount,
    delivered: order.delivered,
    delivered_date: order.delivered_date,
    invoiced: order.invoiced,
    invoiced_date: order.invoiced_date,
    commission_matched: order.commission_matched,
    commission_amount: order.commission_amount,
    commission_date: order.commission_date,
    bid_result: order.bid_result,
    closed_at: order.closed_at,
    selected_round_id: order.selected_round_id
  };

  const next = { ...before };
  const target = targetStatus ? String(targetStatus) : null;
  const validTargets = ['shipping_invoicing', 'finance', 'commission', 'bid_decision', 'quotation'];
  if (target && !validTargets.includes(target)) return badRequest(res, '回退目标状态无效');
  if (target && target === 'commission' && !['closed'].includes(order.status)) return badRequest(res, '仅 closed 订单可回退至 commission');
  if (target && target !== 'commission' && !['closed', 'lost_closed', 'commission'].includes(order.status)) {
    return badRequest(res, '当前状态不支持回退');
  }

  if (changes.delivered !== undefined) {
    if (!isBool(Number(changes.delivered))) return badRequest(res, '发货状态参数无效');
    next.delivered = Number(changes.delivered);
    if (next.delivered === 0 && ['commission', 'closed'].includes(order.status) && !target) {
      return badRequest(res, '将 delivered 改为 0 必须指定回退目标状态');
    }
  }
  if (changes.delivered_date !== undefined) {
    const date = changes.delivered_date ? String(changes.delivered_date) : null;
    if (date && !isValidDate(date)) return badRequest(res, '发货日期格式必须为 YYYY-MM-DD');
    next.delivered_date = date;
  }
  if (changes.invoiced !== undefined) {
    if (!isBool(Number(changes.invoiced))) return badRequest(res, '开票状态参数无效');
    next.invoiced = Number(changes.invoiced);
    if (next.invoiced === 0 && ['commission', 'closed'].includes(order.status) && !target) {
      return badRequest(res, '将 invoiced 改为 0 必须指定回退目标状态');
    }
  }
  if (changes.invoiced_date !== undefined) {
    const date = changes.invoiced_date ? String(changes.invoiced_date) : null;
    if (date && !isValidDate(date)) return badRequest(res, '开票日期格式必须为 YYYY-MM-DD');
    next.invoiced_date = date;
  }
  if (changes.total_amount !== undefined && changes.total_amount !== null && changes.total_amount !== '') {
    if (!isMoney(changes.total_amount)) return badRequest(res, '总金额必须大于 0');
    next.total_amount = Number(changes.total_amount);
  } else if (changes.total_amount !== undefined) {
    next.total_amount = null;
  }
  if (changes.sales_order !== undefined) {
    const so = changes.sales_order ? normalizeSo(changes.sales_order) : null;
    if (so && !checkSalesOrderUnique(db, so, order.id)) return badRequest(res, '该 SO 号已被其他订单使用');
    next.sales_order = so;
  }
  if (changes.payment_terms !== undefined) next.payment_terms = changes.payment_terms || null;

  const tx = db.transaction(() => {
    if (target === 'shipping_invoicing') {
      next.delivered = next.delivered === 1 && !changes.delivered ? 0 : next.delivered;
      next.invoiced = next.invoiced === 1 && !changes.invoiced ? 0 : next.invoiced;
      next.commission_matched = 0;
      next.commission_amount = null;
      next.commission_date = null;
    } else if (target === 'finance') {
      next.commission_matched = 0;
      next.commission_amount = null;
      next.commission_date = null;
      next.delivered = 0;
      next.delivered_date = null;
      next.invoiced = 0;
      next.invoiced_date = null;
    } else if (target === 'bid_decision') {
      next.commission_matched = 0;
      next.commission_amount = null;
      next.commission_date = null;
      next.delivered = 0;
      next.delivered_date = null;
      next.invoiced = 0;
      next.invoiced_date = null;
      next.sales_order = null;
      next.total_amount = null;
      db.prepare('DELETE FROM customer_pos WHERE order_id = ?').run(order.id);
      if (order.status === 'lost_closed') {
        next.bid_result = null;
        next.closed_at = null;
      }
    } else if (target === 'quotation') {
      next.commission_matched = 0;
      next.commission_amount = null;
      next.commission_date = null;
      next.delivered = 0;
      next.delivered_date = null;
      next.invoiced = 0;
      next.invoiced_date = null;
      next.sales_order = null;
      next.total_amount = null;
      next.selected_round_id = null;
      next.bid_result = null;
      next.closed_at = null;
      db.prepare('DELETE FROM customer_pos WHERE order_id = ?').run(order.id);
      db.prepare("UPDATE approval_records SET status = 'superseded' WHERE order_id = ? AND status IN ('pending','approved')").run(order.id);
    } else if (target === 'commission') {
      next.commission_matched = 0;
      next.commission_amount = null;
      next.commission_date = null;
    }

    db.prepare(
      `UPDATE orders SET status=?, sales_order=?, total_amount=?, delivered=?, delivered_date=?, invoiced=?, invoiced_date=?,
        commission_matched=?, commission_amount=?, commission_date=?, bid_result=?, closed_at=?, selected_round_id=?, payment_terms=?, updated_at=?
       WHERE id=?`
    ).run(
      target || order.status,
      next.sales_order,
      next.total_amount,
      next.delivered,
      next.delivered_date,
      next.invoiced,
      next.invoiced_date,
      next.commission_matched,
      next.commission_amount,
      next.commission_date,
      next.bid_result,
      next.closed_at,
      next.selected_round_id,
      next.payment_terms,
      nowUtc(),
      order.id
    );
    writeAudit(db, {
      userId: req.user.id,
      action: 'data_correct',
      entityType: 'order',
      entityId: order.id,
      detail: { before, after: next, target_status: target }
    });
  });
  tx();
  return res.json(loadOrderDetail(db, order.id));
});

// ---------- 重置 ----------
function verifyPassword(db, password) {
  const admin = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
  return Boolean(admin && bcrypt.compareSync(String(password || ''), admin.password));
}

function deleteBusinessData(db) {
  const tables = [
    'order_custom_fields',
    'order_attachments',
    'quotation_items',
    'approval_records',
    'quotations',
    'shipping_batches',
    'invoice_records',
    'customer_pos',
    'commission_manual_records',
    'proposal_selections',
    'proposal_versions',
    'todos',
    'orders',
    'import_logs',
    'workflow_step_fields',
    'custom_fields',
    'guide_prices',
    'materials',
    'end_customers',
    'contract_customers',
    'workflow_transitions',
    'workflow_steps'
  ];
  const tx = db.transaction(() => {
    db.prepare('UPDATE orders SET selected_round_id = NULL').run();
    for (const table of tables) {
      db.prepare(`DELETE FROM ${table}`).run();
    }
  });
  tx();
  fs.rmSync(getUploadDir(), { recursive: true, force: true });
  fs.mkdirSync(getUploadDir(), { recursive: true });
}

router.post('/reset-business', (req, res) => {
  const db = getDb();
  const { password } = req.body || {};
  if (!verifyPassword(db, password)) return badRequest(res, '管理员密码不正确');
  writeAudit(db, { userId: req.user.id, action: 'reset_business', entityType: 'settings', detail: { scope: 'business' } });
  deleteBusinessData(db);
  seedWorkflow(db);
  return res.json({ message: '业务数据已重置' });
});

router.post('/reset-factory', (req, res) => {
  const db = getDb();
  const { password } = req.body || {};
  if (!verifyPassword(db, password)) return badRequest(res, '管理员密码不正确');
  writeAudit(db, { userId: req.user.id, action: 'reset_factory', entityType: 'settings', detail: { scope: 'factory' } });
  deleteBusinessData(db);
  db.prepare("DELETE FROM users WHERE username <> 'admin'").run();
  seedWorkflow(db);
  rotateJwtSecret();
  return res.json({ message: '系统已恢复出厂设置，请重新登录' });
});

export default router;
