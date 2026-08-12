import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import AdmZip from 'adm-zip';
import bcrypt from 'bcryptjs';
import xlsx from 'xlsx';
import { getDb, getDataDir, getUploadDir, closeDb, initDb, seedWorkflow, rotateJwtSecret } from '../db/init.js';
import { logger } from '../logger.js';
import { upload, uploadRestore, RESTORE_MAX_FILE_SIZE } from '../middleware/upload.js';
import { authenticateDownload } from '../middleware/auth.js';
import { nowUtc, badRequest, notFound, isMoney, isNonNegativeNumber, normalizeDate, normalizeSo, writeAudit, headerIndex, cell } from '../utils.js';
import { checkSalesOrderUnique } from './orders.js';
import { hasFrameworkForCustomer } from './materials.js';
import { templateFilePath } from '../lib/quotationTemplate.js';

const router = Router();

// ---------- 机会 ID 一致性检测 ----------
router.get('/order-id-consistency', (req, res) => {
  const db = getDb();
  const total = db.prepare('SELECT COUNT(*) c FROM orders').get().c;
  const mismatched = db
    .prepare(
      `SELECT id, order_id FROM orders
       WHERE order_id != printf('%04d', id) OR order_id NOT GLOB '[0-9][0-9][0-9][0-9]'
       ORDER BY id`
    )
    .all();
  const duplicates = db
    .prepare('SELECT order_id, COUNT(*) c FROM orders GROUP BY order_id HAVING c > 1 ORDER BY order_id')
    .all();
  return res.json({ ok: mismatched.length === 0 && duplicates.length === 0, total, mismatched, duplicates });
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
    headers: ['客户名称', '客户简称', '联系人', '电话', '邮箱', '备注'],
    required: ['客户名称']
  },
  contract_customer: {
    label: '合同客户导入',
    headers: ['客户名称', '客户简称', '联系人', '电话', '邮箱', '备注'],
    required: ['客户名称']
  },
  material: {
    label: '框架协议导入',
    headers: ['最终客户', '物料号', '描述', '协议未税单价', '单位', '协议编号', '生效日期', '失效日期', '备注'],
    required: ['最终客户', '物料号', '协议未税单价', '生效日期']
  },
  guide_price: {
    label: '指导价格导入',
    headers: ['物料号', '描述', '指导价', '单位', '备注'],
    required: ['物料号', '指导价']
  },
  history: {
    label: '历史商机导入',
    headers: ['销售机会编号', '年份', '月份', '最终客户', '合同客户', '项目名称', '项目负责人', '销售机会类型', '状态', 'Sales Order', '总金额', '是否发货', '发货日期', '是否开票', '开票日期', '佣金是否匹配', '佣金金额', '付款条款', '项目编号', '车间', '项目备注'],
    required: ['年份', '月份']
  }
};

router.get('/import-meta', (req, res) => {
  const items = Object.entries(IMPORT_TARGETS).map(([key, value]) => ({
    key,
    label: value.label,
    headers: value.headers,
    required: value.required
  }));
  return res.json({ items });
});

router.get('/import/:target/template', authenticateDownload, (req, res) => {
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

const importTasks = new Map();
const IMPORT_TASK_TTL_MS = 30 * 60 * 1000;
const IMPORT_MAX_ROWS = 200000;

function taskTime(ms) {
  return ms ? new Date(ms).toISOString().replace('T', ' ').slice(0, 19) : null;
}

function persistImportTask(task) {
  try {
    const db = getDb();
    let successDetail = null;
    if (task.status === 'done') {
      const detailByTable = {};
      for (const item of task.successIds || []) {
        if (!detailByTable[item.table]) detailByTable[item.table] = [];
        detailByTable[item.table].push(item.id);
      }
      successDetail = JSON.stringify(detailByTable);
    }
    db.prepare(`
      INSERT INTO import_tasks (id, user_id, target_type, file_name, total_rows, processed_rows, success_rows, fail_rows, failures, success_detail, status, error, created_at, updated_at, done_at)
      VALUES (@id, @userId, @target, @fileName, @total, @processed, @success, @failRows, @failures, @successDetail, @status, @error, @createdAt, @updatedAt, @doneAt)
      ON CONFLICT(id) DO UPDATE SET
        processed_rows = excluded.processed_rows,
        success_rows = excluded.success_rows,
        fail_rows = excluded.fail_rows,
        failures = excluded.failures,
        success_detail = excluded.success_detail,
        status = excluded.status,
        error = excluded.error,
        updated_at = excluded.updated_at,
        done_at = excluded.done_at
    `).run({
      id: task.id,
      userId: task.userId,
      target: task.target,
      fileName: task.fileName,
      total: task.total,
      processed: task.processed,
      success: task.success,
      failRows: task.failures.length,
      failures: JSON.stringify(task.failures.slice(0, 500)),
      successDetail,
      status: task.status,
      error: task.error || null,
      createdAt: taskTime(task.createdAt),
      updatedAt: nowUtc(),
      doneAt: taskTime(task.doneAt)
    });
  } catch (err) {
    logger.error('import', '导入任务落盘失败', { err: err?.message });
  }
}

function loadImportTask(id) {
  const row = getDb().prepare('SELECT * FROM import_tasks WHERE id = ?').get(id);
  if (!row) return null;
  let failures = [];
  try {
    failures = row.failures ? JSON.parse(row.failures) : [];
  } catch {
    failures = [];
  }
  return {
    id: row.id,
    userId: row.user_id,
    target: row.target_type,
    fileName: row.file_name,
    total: row.total_rows,
    processed: row.processed_rows,
    success: row.success_rows,
    successIds: [],
    failures,
    status: row.status,
    error: row.error,
    createdAt: row.created_at ? new Date(`${row.created_at.replace(' ', 'T')}Z`).getTime() : Date.now(),
    doneAt: row.done_at ? new Date(`${row.done_at.replace(' ', 'T')}Z`).getTime() : null
  };
}

function pruneImportTasks() {
  const now = Date.now();
  for (const [taskId, task] of importTasks) {
    if (task.doneAt && now - task.doneAt > IMPORT_TASK_TTL_MS) importTasks.delete(taskId);
  }
  try {
    const cutoff = new Date(now - IMPORT_TASK_TTL_MS).toISOString().replace('T', ' ').slice(0, 19);
    getDb().prepare('DELETE FROM import_tasks WHERE done_at IS NOT NULL AND done_at < ?').run(cutoff);
  } catch {
    // 数据库未就绪时静默跳过，仅保留内存清理
  }
}

function yieldEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createSheetReader(sheet, rawHeaders, mapping, standardHeaders) {
  const ref = sheet && sheet['!ref'] ? sheet['!ref'] : 'A1';
  const range = xlsx.utils.decode_range(ref);
  const totalRows = Math.max(0, range.e.r);
  const useMapping = mapping && typeof mapping === 'object' && !Array.isArray(mapping) && Array.isArray(standardHeaders);
  const headers = useMapping ? standardHeaders : (rawHeaders || []);
  const mapRow = (row) => useMapping
    ? standardHeaders.map((field) => {
        const sourceName = mapping[field];
        const idx = headerIndex(rawHeaders, sourceName);
        return idx >= 0 ? cell(row, idx) : null;
      })
    : row;

  return {
    headers,
    totalRows,
    readBatch(startRow, count) {
      if (startRow > range.e.r) return [];
      const endRow = Math.min(range.e.r, startRow + count - 1);
      const batchRange = xlsx.utils.encode_range({
        s: { r: startRow, c: 0 },
        e: { r: endRow, c: range.e.c }
      });
      const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, range: batchRange, defval: null, raw: true });
      return rows.map((row, index) => ({ row: mapRow(row), rowNumber: startRow + index + 1 }));
    }
  };
}

async function runImportTask(task, reader, headers) {
  const db = getDb();
  const batchSize = 50;
  try {
    for (let startRow = 1; startRow <= reader.totalRows; startRow += batchSize) {
      const batchRows = reader.readBatch(startRow, batchSize);
      task.processed += batchRows.length;
      const rowsToProcess = batchRows.filter((item) =>
        item.row.some((value) => value !== null && value !== undefined && value !== '')
      );
      if (rowsToProcess.length > 0) {
        const snapshot = { processed: task.processed, success: task.success, failures: task.failures.length };
        const runBatch = db.transaction((items) => {
          for (const item of items) {
            const result = importRow(db, IMPORT_TARGETS[task.target], headers, item.row);
            if (typeof result === 'string') {
              task.failures.push({ row: item.rowNumber, reason: result });
            } else {
              task.success += 1;
              task.successIds.push(result);
            }
          }
        });
        try {
          runBatch(rowsToProcess);
        } catch (err) {
          task.processed = snapshot.processed;
          task.success = snapshot.success;
          task.failures = task.failures.slice(0, snapshot.failures);
          task.status = 'error';
          task.error = err.message || '数据写入失败';
          task.doneAt = Date.now();
          persistImportTask(task);
          return;
        }
        persistImportTask(task);
      }
      await yieldEventLoop();
    }
    const detailByTable = {};
    for (const item of task.successIds) {
      if (!detailByTable[item.table]) detailByTable[item.table] = [];
      detailByTable[item.table].push(item.id);
    }
    const info = db
      .prepare('INSERT INTO import_logs (target_type, file_name, total_rows, success_rows, fail_rows, detail, revoked, task_id, created_at) VALUES (?,?,?,?,?,?,0,?,?)')
      .run(task.target, task.fileName, task.total, task.success, task.failures.length, JSON.stringify(detailByTable), task.id, nowUtc());
    writeAudit(db, {
      userId: task.userId,
      action: 'other',
      entityType: 'settings',
      entityId: info.lastInsertRowid,
      detail: { event: 'import', target: task.target, total_rows: task.total, success_rows: task.success, fail_rows: task.failures.length }
    });
    task.status = 'done';
    task.doneAt = Date.now();
    persistImportTask(task);
  } catch (err) {
    task.status = 'error';
    task.error = err.message || '导入失败';
    task.doneAt = Date.now();
    persistImportTask(task);
  }
}

router.post('/import/:target', upload.single('file'), (req, res) => {
  if (!req.file) return badRequest(res, '请上传 Excel 文件');
  const target = IMPORT_TARGETS[req.params.target];
  if (!target) {
    fs.unlinkSync(req.file.path);
    return notFound(res);
  }
  let reader;
  try {
    const workbook = xlsx.read(fs.readFileSync(req.file.path), { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const ref = sheet && sheet['!ref'] ? sheet['!ref'] : 'A1';
    const range = xlsx.utils.decode_range(ref);
    if (range.e.r > IMPORT_MAX_ROWS) {
      fs.unlinkSync(req.file.path);
      return badRequest(res, `导入行数不能超过 ${IMPORT_MAX_ROWS} 行`);
    }
    const headerRange = xlsx.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: range.e.c } });
    const rawHeaders = (xlsx.utils.sheet_to_json(sheet, { header: 1, range: headerRange, defval: null, raw: true })[0] || []);
    let mapping = null;
    if (req.body && typeof req.body.mapping === 'string' && req.body.mapping.trim()) {
      try {
        mapping = JSON.parse(req.body.mapping);
      } catch {
        mapping = null;
      }
    }
    reader = createSheetReader(sheet, rawHeaders, mapping, target.headers || []);
  } catch {
    fs.unlinkSync(req.file.path);
    return badRequest(res, 'Excel 解析失败');
  }
  fs.unlinkSync(req.file.path);
  if (!reader || reader.totalRows < 1) return badRequest(res, 'Excel 无有效数据');

  const headers = reader.headers;
  pruneImportTasks();
  const taskId = `imp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const task = {
    id: taskId,
    userId: req.user.id,
    target: req.params.target,
    fileName: req.file.originalname,
    total: reader.totalRows,
    processed: 0,
    success: 0,
    successIds: [],
    failures: [],
    status: 'processing',
    error: null,
    createdAt: Date.now(),
    doneAt: null
  };
  importTasks.set(taskId, task);
  persistImportTask(task);
  runImportTask(task, reader, headers).catch((err) => {
    task.status = 'error';
    task.error = err.message || '导入失败';
    task.doneAt = Date.now();
    persistImportTask(task);
  });
  return res.json({ task_id: taskId, target: req.params.target, file_name: req.file.originalname, total_rows: task.total, status: 'processing' });
});

router.get('/import-progress/:taskId', (req, res) => {
  const task = importTasks.get(req.params.taskId) || loadImportTask(req.params.taskId);
  if (!task) return notFound(res);
  if (task.doneAt && Date.now() - task.doneAt > IMPORT_TASK_TTL_MS) {
    importTasks.delete(task.id);
    return notFound(res);
  }
  return res.json({
    task_id: task.id,
    status: task.status,
    total_rows: task.total,
    processed_rows: task.processed,
    success_rows: task.success,
    fail_rows: task.failures.length,
    failures: task.failures.slice(0, 100),
    error: task.error
  });
});

function importRow(db, target, headers, row) {
  const value = (name) => cell(row, headerIndex(headers, name));
  if (target === IMPORT_TARGETS.end_customer || target === IMPORT_TARGETS.contract_customer) {
    const name = value('客户名称');
    if (name === null || String(name).trim() === '') return '客户名称必填';
    const table = target === IMPORT_TARGETS.end_customer ? 'end_customers' : 'contract_customers';
    const shortRaw = value('客户简称');
    let shortName = null;
    if (shortRaw !== null && String(shortRaw).trim() !== '') {
      shortName = String(shortRaw).trim().toUpperCase();
      if (!/^[A-Z0-9]{2,8}$/.test(shortName)) return '客户简称需为 2-8 位英文或数字';
    }
    try {
      const info = db
        .prepare(`INSERT INTO ${table} (customer_name, short_name, contact_person, phone, email, remark, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`)
        .run(
          String(name).trim(),
          shortName,
          value('联系人') != null ? String(value('联系人')) : null,
          value('电话') != null ? String(value('电话')) : null,
          value('邮箱') != null ? String(value('邮箱')) : null,
          value('备注') != null ? String(value('备注')) : null,
          nowUtc(),
          nowUtc()
        );
      return { table: target === IMPORT_TARGETS.end_customer ? 'end_customer' : 'contract_customer', id: info.lastInsertRowid };
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) return '客户名称或简称已存在';
      throw err;
    }
  }
  if (target === IMPORT_TARGETS.guide_price) {
    const materialNo = value('物料号');
    const price = value('指导价');
    if (materialNo === null || String(materialNo).trim() === '') return '物料号必填';
    if (!isMoney(price)) return '指导价必须大于 0';
    try {
      const info = db
        .prepare('INSERT INTO guide_prices (material_no, description, guide_unit_price_ex_vat, unit, remark, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
        .run(
          String(materialNo).trim(),
          value('描述') != null ? String(value('描述')) : null,
          Number(price),
          value('单位') != null ? String(value('单位')) : 'pcs',
          value('备注') != null ? String(value('备注')) : null,
          nowUtc(),
          nowUtc()
        );
      return { table: 'guide_price', id: info.lastInsertRowid };
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) return '该物料号指导价已存在';
      throw err;
    }
  }
  if (target === IMPORT_TARGETS.material) {
    const customerName = value('最终客户');
    const materialNo = value('物料号');
    const price = value('协议未税单价');
    const validFromRaw = value('生效日期');
    const validFrom = normalizeDate(validFromRaw);
    if (customerName === null || String(customerName).trim() === '') return '最终客户必填';
    if (materialNo === null || String(materialNo).trim() === '') return '物料号必填';
    if (!isMoney(price)) return '协议未税单价必须大于 0';
    if (!validFrom) return '生效日期必填，支持 YYYY-MM-DD、YYYY/MM/DD、YYYY.MM.DD、YYYY年M月D日或 Excel 日期';
    const customer = db.prepare('SELECT id FROM end_customers WHERE customer_name = ?').get(String(customerName).trim());
    if (!customer) return '客户名称不存在';
    const validToRaw = value('失效日期');
    const validTo = validToRaw === null || validToRaw === undefined || validToRaw === '' ? null : normalizeDate(validToRaw);
    if (validToRaw !== null && validToRaw !== undefined && validToRaw !== '' && !validTo) {
      return '失效日期格式无效，支持 YYYY-MM-DD、YYYY/MM/DD、YYYY.MM.DD、YYYY年M月D日或 Excel 日期';
    }
    if (validTo && validTo < validFrom) return '失效日期不得早于生效日期';
    try {
      const info = db
        .prepare('INSERT INTO materials (end_customer_id, material_no, description, unit_price_ex_vat, unit, agreement_no, valid_from, valid_to, remark, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .run(
          customer.id,
          String(materialNo).trim(),
          value('描述') != null ? String(value('描述')) : null,
          Number(price),
          value('单位') != null ? String(value('单位')) : 'pcs',
          value('协议编号') != null ? String(value('协议编号')) : null,
          validFrom,
          validTo,
          value('备注') != null ? String(value('备注')) : null,
          nowUtc(),
          nowUtc()
        );
      return { table: 'material', id: info.lastInsertRowid };
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
  const year = value('年份');
  const month = value('月份');
  if (year === null || String(year).trim() === '') return '年份必填';
  if (month === null || String(month).trim() === '') return '月份必填';
  const status = value('状态') ? String(value('状态')) : 'customer_info';
  const statuses = ['customer_info', 'proposal', 'quotation', 'approval_pending', 'bid_decision', 'finance', 'shipping_invoicing', 'commission', 'closed', 'lost_closed', 'cancelled'];
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
  if (salesOrder && !checkSalesOrderUnique(db, salesOrder, null)) return '该 SO 号已被其他销售机会使用';
  const totalAmountRaw = value('总金额');
  let totalAmount = null;
  if (totalAmountRaw !== null && totalAmountRaw !== '') {
    if (!isNonNegativeNumber(totalAmountRaw)) return '总金额不能小于 0';
    totalAmount = Number(totalAmountRaw);
  }
  const delivered = parseBool(value('是否发货'));
  const invoiced = parseBool(value('是否开票'));
  let commissionMatched = parseBool(value('佣金是否匹配'));
  const commissionAmountRaw = value('佣金金额');
  let commissionAmount = null;
  if (commissionAmountRaw !== null && commissionAmountRaw !== '') {
    if (Number(commissionAmountRaw) === 0) {
      commissionAmount = 0;
    } else if (!isMoney(commissionAmountRaw)) {
      return '佣金金额必须大于 0';
    } else {
      commissionAmount = Number(commissionAmountRaw);
    }
  }
  const deliveredDateRaw = value('发货日期');
  const deliveredDate = deliveredDateRaw === null || deliveredDateRaw === undefined || deliveredDateRaw === '' ? null : normalizeDate(deliveredDateRaw);
  const invoicedDateRaw = value('开票日期');
  const invoicedDate = invoicedDateRaw === null || invoicedDateRaw === undefined || invoicedDateRaw === '' ? null : normalizeDate(invoicedDateRaw);
  if (delivered === 1 && !deliveredDate) return 'delivered=1 必须同时提供发货日期';
  if (commissionMatched === 1 && !isMoney(commissionAmount)) return '佣金匹配时必须提供大于 0 的佣金金额';
  if (status === 'closed' && (delivered !== 1 || invoiced !== 1)) {
    return 'closed 销售机会必须 delivered=1 且 invoiced=1';
  }
  if (deliveredDateRaw !== null && deliveredDateRaw !== undefined && deliveredDateRaw !== '' && !deliveredDate) {
    return '发货日期格式无效，支持 YYYY-MM-DD、YYYY/MM/DD、YYYY.MM.DD、YYYY年M月D日或 Excel 日期';
  }
  if (invoicedDateRaw !== null && invoicedDateRaw !== undefined && invoicedDateRaw !== '' && !invoicedDate) {
    return '开票日期格式无效，支持 YYYY-MM-DD、YYYY/MM/DD、YYYY.MM.DD、YYYY年M月D日或 Excel 日期';
  }
  const orderType = value('销售机会类型') ? String(value('销售机会类型')) : null;
  if (orderType && !['A', 'B', 'C'].includes(orderType)) return '销售机会类型无效';
  const ts = nowUtc();
  let commissionDate = commissionMatched === 1 ? ts : null;
  if (status === 'closed' && commissionMatched !== 1) {
    commissionMatched = 1;
    commissionAmount = commissionAmount === null ? 0 : commissionAmount;
    commissionDate = ts;
  }
  try {
    const placeholderOrderId = `PENDING-${crypto.randomUUID()}`;
    const info = db
      .prepare(
        `INSERT INTO orders (order_id, year, month, end_customer_id, contract_customer_id, order_type, project_no, workshop,
          project_name, project_owner, project_remark, sales_order, total_amount, payment_terms, delivered, delivered_date,
          invoiced, invoiced_date, commission_matched, commission_amount, commission_date, status, has_framework, proposal_skipped,
          closed_at, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        placeholderOrderId,
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
        commissionDate,
        status,
        hasFrameworkForCustomer(endCustomerId) ? 1 : 0,
        0,
        ['closed', 'lost_closed', 'cancelled'].includes(status) ? ts : null,
        ts,
        ts
      );
    const rowId = Number(info.lastInsertRowid);
    db.prepare('UPDATE orders SET order_id = ? WHERE id = ?').run(String(rowId).padStart(4, '0'), rowId);
    return { table: 'order', id: rowId };
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return 'SO 号已存在';
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

router.delete('/import-logs', (req, res) => {
  const db = getDb();
  const total = db.prepare('SELECT COUNT(*) AS c FROM import_logs').get().c;
  db.prepare('DELETE FROM import_logs').run();
  return res.json({ deleted: total });
});

const IMPORT_UNDO_CHILD_TABLES = [
  { table: 'proposal_versions', column: 'order_id' },
  { table: 'quotations', column: 'order_id' },
  { table: 'approval_records', column: 'order_id' },
  { table: 'customer_pos', column: 'order_id' },
  { table: 'order_attachments', column: 'order_id' },
  { table: 'shipping_batches', column: 'order_id' },
  { table: 'invoice_records', column: 'order_id' },
  { table: 'commission_manual_records', column: 'order_id' },
  { table: 'order_custom_fields', column: 'order_id' },
  { table: 'todos', column: 'order_ref' }
];

router.post('/import/:id/undo', (req, res) => {
  const db = getDb();
  const log = db.prepare('SELECT * FROM import_logs WHERE id = ?').get(req.params.id);
  if (!log) return notFound(res, '导入记录不存在');
  if (Number(log.revoked) === 1) return badRequest(res, '该导入已撤回');
  let detail = {};
  try {
    detail = log.detail ? JSON.parse(log.detail) : {};
  } catch {
    detail = {};
  }
  const hasIds = Object.values(detail).some((ids) => Array.isArray(ids) && ids.length > 0);
  if (!hasIds) return badRequest(res, '该导入记录没有可撤回的数据');

  const toIds = (key) => (Array.isArray(detail[key]) ? detail[key].map(Number).filter((id) => Number.isInteger(id) && id > 0) : []);
  const tx = db.transaction(() => {
    const deleted = [];
    const skipped = [];
    if (log.target_type === 'history') {
      const orderIds = toIds('order');
      if (orderIds.length === 0) return { deleted, skipped };
      for (const { table, column } of IMPORT_UNDO_CHILD_TABLES) {
        const placeholders = orderIds.map(() => '?').join(',');
        const count = db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE ${column} IN (${placeholders})`).get(...orderIds).c;
        if (count > 0) throw new Error(`导入的销售机会已存在关联数据（${table}），为安全起见已阻止撤回`);
      }
      const info = db.prepare(`DELETE FROM orders WHERE id IN (${orderIds.map(() => '?').join(',')})`).run(...orderIds);
      deleted.push(`${info.changes} 个销售机会`);
    } else if (log.target_type === 'end_customer' || log.target_type === 'contract_customer') {
      const table = log.target_type === 'end_customer' ? 'end_customers' : 'contract_customers';
      const ids = toIds(log.target_type);
      const stmt = db.prepare(`DELETE FROM ${table} WHERE id = ?`);
      for (const id of ids) {
        try {
          const info = stmt.run(id);
          if (info.changes > 0) deleted.push(id);
        } catch (err) {
          if (String(err.message).includes('FOREIGN KEY')) skipped.push(id);
          else throw err;
        }
      }
    } else if (log.target_type === 'material' || log.target_type === 'guide_price') {
      const table = log.target_type === 'material' ? 'materials' : 'guide_prices';
      const ids = toIds(log.target_type);
      if (ids.length === 0) return { deleted, skipped };
      const info = db.prepare(`DELETE FROM ${table} WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
      deleted.push(`${info.changes} 条`);
    } else {
      throw new Error('不支持的导入类型');
    }
    db.prepare('UPDATE import_logs SET revoked = 1 WHERE id = ?').run(log.id);
    writeAudit(db, {
      userId: req.user.id,
      action: 'other',
      entityType: 'settings',
      entityId: log.id,
      detail: { event: 'undo_import', target_type: log.target_type, deleted, skipped }
    });
    return { deleted, skipped };
  });
  let result;
  try {
    result = tx();
  } catch (err) {
    return badRequest(res, err.message || '撤回失败');
  }
  return res.json({ message: '撤回成功', deleted: result.deleted, skipped: result.skipped });
});

// ---------- 备份与还原 ----------
const BACKUP_NAME_RE = /^iproject-backup-[\d]{14}(?:-[a-f0-9]{6})?\.zip$/;

function createBackup() {
  const db = getDb();
  db.pragma('wal_checkpoint(FULL)');
  const dataDir = getDataDir();
  const dbPath = path.join(dataDir, 'database.sqlite');
  const backupDir = path.join(dataDir, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const ts = new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const filename = `iproject-backup-${ts}-${crypto.randomBytes(3).toString('hex')}.zip`;
  const zip = new AdmZip();
  if (fs.existsSync(dbPath)) zip.addFile('database.sqlite', fs.readFileSync(dbPath));
  if (fs.existsSync(templateFilePath())) zip.addFile('quotation-template.json', fs.readFileSync(templateFilePath()));
  if (fs.existsSync(fieldDisplayFile())) zip.addFile('field-display-names.json', fs.readFileSync(fieldDisplayFile()));
  if (fs.existsSync(appLogoFile())) zip.addFile('app-logo.json', fs.readFileSync(appLogoFile()));
  if (fs.existsSync(backupScheduleFile())) zip.addFile('backup-schedule.json', fs.readFileSync(backupScheduleFile()));
  addDirToZip(zip, getUploadDir(), 'uploads');
  addDirToZip(zip, path.join(dataDir, 'custom-fonts'), 'custom-fonts');
  const zipPath = path.join(backupDir, filename);
  fs.writeFileSync(zipPath, zip.toBuffer());
  // 异步触发清理,避免阻塞响应
  setImmediate(() => {
    try { enforceBackupRetention(); } catch (err) { logger.error('backup', '备份保留清理失败', { err: err?.message }); }
  });
  return { filename, size: fs.statSync(zipPath).size, downloadUrl: `/api/settings/backup/${filename}/download` };
}

function addDirToZip(zip, dir, prefix) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const zipPath = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      addDirToZip(zip, fullPath, zipPath);
    } else if (entry.isFile()) {
      zip.addFile(zipPath, fs.readFileSync(fullPath));
    }
  }
}

function listBackupFiles() {
  const backupDir = path.join(getDataDir(), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  return fs
    .readdirSync(backupDir)
    .filter((name) => BACKUP_NAME_RE.test(name))
    .map((name) => {
      const stat = fs.statSync(path.join(backupDir, name));
      return { name, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function enforceBackupRetention(userId = null) {
  const schedule = readBackupSchedule();
  const keep = Math.floor(Number(schedule.keep));
  if (!Number.isFinite(keep) || keep <= 0) return { keep, deleted: [] };
  const files = listBackupFiles();
  const deleted = [];
  for (const file of files.slice(keep)) {
    try {
      fs.unlinkSync(path.join(getDataDir(), 'backups', file.name));
      deleted.push(file.name);
    } catch (err) {
      logger.error('backup', '清理旧备份失败', { file: file.name, err: err?.message });
    }
  }
  if (deleted.length > 0) {
    logger.info('backup', `备份保留策略:保留最近 ${keep} 份,已清理 ${deleted.length} 份`);
    writeAudit(getDb(), { userId, action: 'other', entityType: 'settings', detail: { event: 'backup_retention', keep, deleted } });
  }
  return { keep, deleted };
}

router.post('/backup', (req, res) => {
  const result = createBackup();
  writeAudit(getDb(), { userId: req.user.id, action: 'other', entityType: 'settings', detail: { event: 'backup', filename: result.filename } });
  return res.json(result);
});

// ---------- 字段显示名称配置 ----------
const FIELD_DISPLAY_KEYS = [
  'order_id',
  'project_name',
  'project_no',
  'workshop',
  'project_owner',
  'project_remark',
  'end_customer',
  'contract_customer',
  'short_name',
  'order_type',
  'status',
  'amount',
  'sales_order',
  'payment_terms',
  'delivered_date',
  'invoiced_date',
  'commission_amount'
];

const FIELD_DISPLAY_DEFAULTS = {
  order_id: '销售机会编号',
  project_name: '项目名称',
  project_no: '项目编号',
  workshop: '车间',
  project_owner: '项目负责人',
  project_remark: '项目备注',
  end_customer: '最终客户',
  contract_customer: '合同客户',
  short_name: '客户简称',
  order_type: '销售机会类型',
  status: '状态',
  amount: '金额',
  sales_order: 'Sales Order',
  payment_terms: '付款条款',
  delivered_date: '发货日期',
  invoiced_date: '开票日期',
  commission_amount: '佣金金额'
};

function fieldDisplayFile() {
  return path.join(getDataDir(), 'field-display-names.json');
}

function readFieldDisplayNames() {
  try {
    return { ...FIELD_DISPLAY_DEFAULTS, ...JSON.parse(fs.readFileSync(fieldDisplayFile(), 'utf8')) };
  } catch {
    return { ...FIELD_DISPLAY_DEFAULTS };
  }
}

router.get('/field-display-names', (req, res) => {
  return res.json(readFieldDisplayNames());
});

router.put('/field-display-names', (req, res) => {
  const raw = req.body && typeof req.body === 'object' ? req.body : {};
  const labels = { ...FIELD_DISPLAY_DEFAULTS };
  for (const key of FIELD_DISPLAY_KEYS) {
    if (raw[key] !== undefined) {
      const value = String(raw[key]).trim().slice(0, 40);
      if (value) labels[key] = value;
    }
  }
  fs.writeFileSync(fieldDisplayFile(), JSON.stringify(labels, null, 2));
  return res.json(labels);
});

// ---------- 应用 Logo ----------
function appLogoFile() {
  return path.join(getDataDir(), 'app-logo.json');
}

function readAppLogo() {
  try {
    const data = JSON.parse(fs.readFileSync(appLogoFile(), 'utf8'));
    return { logo: data && typeof data.logo === 'string' ? data.logo : null };
  } catch {
    return { logo: null };
  }
}

router.get('/app-logo', (req, res) => {
  return res.json(readAppLogo());
});

router.put('/app-logo', (req, res) => {
  const { logo } = req.body || {};
  let next = null;
  if (logo && typeof logo === 'string' && /^data:image\/(png|jpeg|jpg);base64,/i.test(logo) && logo.length <= 2_400_000) {
    next = logo;
  }
  fs.writeFileSync(appLogoFile(), JSON.stringify({ logo: next }, null, 2));
  return res.json({ logo: next });
});

// ---------- 定时自动备份 ----------
function backupScheduleFile() {
  return path.join(getDataDir(), 'backup-schedule.json');
}

function readBackupSchedule() {
  try {
    return JSON.parse(fs.readFileSync(backupScheduleFile(), 'utf8'));
  } catch {
    return { enabled: false, hour: 2, minute: 0, keep: 0 };
  }
}

router.get('/backup-schedule', (req, res) => {
  return res.json(readBackupSchedule());
});

router.put('/backup-schedule', (req, res) => {
  const { enabled, hour, minute, keep } = req.body || {};
  let keepCount = Math.floor(Number(keep));
  if (!Number.isFinite(keepCount) || keepCount < 0) keepCount = 0;
  keepCount = Math.min(100, keepCount);
  const schedule = {
    enabled: Number(enabled) === 1,
    hour: Math.min(23, Math.max(0, Number(hour) || 0)),
    minute: Math.min(59, Math.max(0, Number(minute) || 0)),
    keep: keepCount
  };
  fs.writeFileSync(backupScheduleFile(), JSON.stringify(schedule, null, 2));
  const retention = enforceBackupRetention(req.user ? req.user.id : null);
  return res.json({ ...schedule, deleted: retention.deleted });
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
      const key = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const target = `${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')}`;
      if (key !== target || key === lastScheduledBackupKey) return;
      lastScheduledBackupKey = key;
      const result = createBackup();
      writeAudit(getDb(), { userId: null, action: 'other', entityType: 'settings', detail: { event: 'scheduled_backup', filename: result.filename } });
    } catch (err) {
      logger.error('schedule', '定时备份失败', { err: err?.message });
    }
  }, 60000);
}

router.get('/backup/:filename/download', authenticateDownload, (req, res) => {
  const filename = String(req.params.filename);
  if (!BACKUP_NAME_RE.test(filename)) return badRequest(res, '备份文件名无效');
  const filePath = path.join(getDataDir(), 'backups', filename);
  if (!fs.existsSync(filePath)) return notFound(res, '备份文件不存在');
  return res.download(filePath, filename);
});

router.delete('/backup/:filename', (req, res) => {
  const filename = String(req.params.filename);
  if (!BACKUP_NAME_RE.test(filename)) return badRequest(res, '备份文件名无效');
  const filePath = path.join(getDataDir(), 'backups', filename);
  if (!fs.existsSync(filePath)) return notFound(res, '备份文件不存在');
  fs.unlinkSync(filePath);
  writeAudit(getDb(), { userId: req.user.id, action: 'other', entityType: 'settings', detail: { event: 'delete_backup', filename } });
  return res.json({ message: '备份文件已删除', filename });
});

router.get('/backups', (req, res) => {
  const backupDir = path.join(getDataDir(), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const items = fs
    .readdirSync(backupDir)
    .filter((name) => BACKUP_NAME_RE.test(name))
    .map((name) => {
      const stat = fs.statSync(path.join(backupDir, name));
      return {
        filename: name,
        size: stat.size,
        modified_at: stat.mtime.toISOString().replace('T', ' ').slice(0, 19),
        downloadUrl: `/api/settings/backup/${name}/download`
      };
    })
    .sort((a, b) => b.modified_at.localeCompare(a.modified_at));
  return res.json({ items });
});

function performRestore(zipPath, displayName, userId) {
  const dataDir = getDataDir();
  const tmpDir = path.join(dataDir, 'restore-tmp');
  const stagedDb = path.join(dataDir, 'database.sqlite.restore');
  const targetDb = path.join(dataDir, 'database.sqlite');
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();
    let uncompressedSize = 0;
    const MAX_UNCOMPRESSED_SIZE = 500 * 1024 * 1024;
    for (const entry of entries) {
      const rawName = String(entry.entryName || '');
      if (!rawName) throw new Error('备份文件包含空路径');
      const resolved = path.resolve(tmpDir, rawName);
      if (resolved !== tmpDir && !resolved.startsWith(tmpDir + path.sep)) {
        throw new Error('备份文件包含非法路径');
      }
      uncompressedSize += Number(entry.header && entry.header.size) || 0;
      if (uncompressedSize > MAX_UNCOMPRESSED_SIZE) {
        throw new Error('备份文件解压后过大，已拒绝解压');
      }
    }
    zip.extractAllTo(tmpDir, true);
    const dbFile = path.join(tmpDir, 'database.sqlite');
    if (!fs.existsSync(dbFile)) throw new Error('备份文件缺少 database.sqlite');
    fs.copyFileSync(dbFile, stagedDb);
    if (!fs.existsSync(stagedDb)) throw new Error('备份数据库复制失败');

    let reinitialized = false;
    try {
      closeDb();
      fs.renameSync(stagedDb, targetDb);
      fs.rmSync(path.join(dataDir, 'database.sqlite-wal'), { force: true });
      fs.rmSync(path.join(dataDir, 'database.sqlite-shm'), { force: true });
      const uploadsDir = path.join(tmpDir, 'uploads');
      if (fs.existsSync(uploadsDir)) {
        fs.rmSync(getUploadDir(), { recursive: true, force: true });
        fs.cpSync(uploadsDir, getUploadDir(), { recursive: true });
      }
      const newTemplateFile = path.join(tmpDir, 'quotation-template.json');
      if (fs.existsSync(newTemplateFile)) fs.copyFileSync(newTemplateFile, templateFilePath());
      const fieldFile = path.join(tmpDir, 'field-display-names.json');
      if (fs.existsSync(fieldFile)) fs.copyFileSync(fieldFile, fieldDisplayFile());
      const logoFile = path.join(tmpDir, 'app-logo.json');
      if (fs.existsSync(logoFile)) fs.copyFileSync(logoFile, appLogoFile());
      const scheduleFile = path.join(tmpDir, 'backup-schedule.json');
      if (fs.existsSync(scheduleFile)) fs.copyFileSync(scheduleFile, backupScheduleFile());
      const fontDir = path.join(tmpDir, 'custom-fonts');
      if (fs.existsSync(fontDir)) {
        fs.rmSync(path.join(dataDir, 'custom-fonts'), { recursive: true, force: true });
        fs.cpSync(fontDir, path.join(dataDir, 'custom-fonts'), { recursive: true });
      }
      initDb(dataDir);
      reinitialized = true;
      writeAudit(getDb(), { userId, action: 'other', entityType: 'settings', detail: { event: 'restore', filename: displayName } });
      return { message: '还原成功' };
    } catch (err) {
      if (!reinitialized) {
        try {
          initDb(dataDir);
        } catch (reopenErr) {
          throw new Error(`还原失败且数据库无法重新打开: ${reopenErr.message}`);
        }
      }
      throw new Error(`还原失败: ${err.message}`);
    }
  } finally {
    fs.rmSync(stagedDb, { force: true });
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

router.post('/restore', (req, res, next) => {
  uploadRestore.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return badRequest(res, `备份文件大小不能超过 ${Math.round(RESTORE_MAX_FILE_SIZE / 1024 / 1024)}MB`);
      }
      return badRequest(res, err.message || '备份文件上传失败');
    }
    return next();
  });
}, (req, res) => {
  if (!req.file) return badRequest(res, '请上传备份文件');
  try {
    return res.json(performRestore(req.file.path, req.file.originalname, req.user.id));
  } catch (err) {
    return badRequest(res, err.message || '还原失败');
  } finally {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
  }
});

router.post('/restore/:filename', (req, res) => {
  const filename = String(req.params.filename);
  if (!BACKUP_NAME_RE.test(filename)) return badRequest(res, '备份文件名无效');
  const filePath = path.join(getDataDir(), 'backups', filename);
  if (!fs.existsSync(filePath)) return notFound(res, '备份文件不存在');
  try {
    return res.json(performRestore(filePath, filename, req.user.id));
  } catch (err) {
    return badRequest(res, err.message || '还原失败');
  }
});

// ---------- 重置 ----------
async function verifyPassword(db, password) {
  const admin = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
  if (!admin) return false;
  return await bcrypt.compare(String(password || ''), admin.password);
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
    'import_tasks',
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
    db.prepare('DELETE FROM workflow_step_fields WHERE field_id IN (SELECT id FROM custom_fields WHERE is_system = 0)').run();
    db.prepare('DELETE FROM custom_fields WHERE is_system = 0').run();
  });
  tx();
  fs.rmSync(getUploadDir(), { recursive: true, force: true });
  fs.mkdirSync(getUploadDir(), { recursive: true });
}

router.post('/reset-business', async (req, res) => {
  const db = getDb();
  const { password } = req.body || {};
  if (!(await verifyPassword(db, password))) return badRequest(res, '管理员密码不正确');
  writeAudit(db, { userId: req.user.id, action: 'reset_business', entityType: 'settings', detail: { scope: 'business' } });
  deleteBusinessData(db);
  seedWorkflow(db);
  return res.json({ message: '业务数据已重置' });
});

router.post('/reset-factory', async (req, res) => {
  const db = getDb();
  const { password } = req.body || {};
  if (!(await verifyPassword(db, password))) return badRequest(res, '管理员密码不正确');
  writeAudit(db, { userId: req.user.id, action: 'reset_factory', entityType: 'settings', detail: { scope: 'factory' } });
  deleteBusinessData(db);
  db.prepare('DELETE FROM login_attempts').run();
  db.prepare("DELETE FROM users WHERE username <> 'admin'").run();
  seedWorkflow(db);
  rotateJwtSecret();
  return res.json({ message: '系统已恢复出厂设置，请重新登录' });
});

export default router;
