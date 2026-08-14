import { Router } from 'express';
import fs from 'node:fs';
import xlsx from 'xlsx';
import { getDb } from '../db/init.js';
import { upload } from '../middleware/upload.js';
import { nowUtc, badRequest, notFound, normalizeSo, isNonNegativeNumber, writeAudit, cleanupUploadedFiles } from '../utils.js';

const router = Router();

function findColumn(headers, label) {
  const target = String(label || '').trim().toLowerCase();
  if (!target) return -1;
  let idx = headers.findIndex((header) => String(header == null ? '' : header).trim().toLowerCase() === target);
  if (idx >= 0) return idx;
  // 尝试将 label 解析为列字母（A=0, B=1, ..., Z=25, AA=26, ...）
  if (/^[a-z]+$/i.test(target)) {
    const s = target.toUpperCase();
    if (s.length === 1) idx = s.charCodeAt(0) - 65;
    else idx = (s.charCodeAt(0) - 64) * 26 + (s.charCodeAt(1) - 65);
    if (idx >= 0 && idx < headers.length) return idx;
  }
  return -1;
}

router.post('/upload', upload.fields([{ name: 'file', maxCount: 1 }]), (req, res) => {
  const file = req.files?.file?.[0];
  if (!file) return badRequest(res, '请上传佣金 Excel 文件');
  const soColumn = String(req.body.soColumn || '').trim();
  let amountColumns = [];
  if (Array.isArray(req.body.amountColumns)) {
    amountColumns = req.body.amountColumns.map((item) => String(item || '').trim()).filter(Boolean);
  } else if (req.body.amountColumns != null) {
    const value = String(req.body.amountColumns).trim();
    if (value) amountColumns = value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  if (amountColumns.length === 0) { cleanupUploadedFiles([file]); return badRequest(res, '请选择佣金金额列'); }
  if (!soColumn) { cleanupUploadedFiles([file]); return badRequest(res, '请选择 SO 号列'); }

  let sheets;
  try {
    sheets = JSON.parse(req.body.sheets || '[]');
  } catch {
    sheets = [];
  }
  if (!Array.isArray(sheets) || sheets.length === 0) {
    cleanupUploadedFiles([file]);
    return badRequest(res, '至少需要一个工作表');
  }

  // 读取所有需要的 sheet 数据，然后删除文件
  let workbook;
  try {
    workbook = xlsx.read(fs.readFileSync(file.path), { type: 'buffer' });
  } catch {
    cleanupUploadedFiles([file]);
    return badRequest(res, 'Excel 解析失败');
  }
  cleanupUploadedFiles([file]);

  const sheetDataMap = {};
  for (const s of sheets) {
    if (workbook.SheetNames.includes(s.sheetName)) {
      sheetDataMap[s.sheetName] = xlsx.utils.sheet_to_json(workbook.Sheets[s.sheetName], { header: 1, defval: null, raw: true });
    }
  }

  // 对每个 sheet 计算列索引，聚合 SO→金额
  const amountMap = new Map();
  let totalExcelRows = 0;
  let totalFailRows = 0;
  let totalDuplicateSo = 0;
  const sheetResults = [];

  for (const sheet of sheets) {
    const sheetRows = sheetDataMap[sheet.sheetName];
    if (!sheetRows || sheetRows.length < 2) {
      sheetResults.push({ sheetName: sheet.sheetName, totalRows: 0, matchedSo: 0, failRows: 0, duplicateSo: 0, status: '无数据' });
      continue;
    }

    const headerRowIdx = Math.max(0, Math.min(sheet.headerRowIdx || 0, sheetRows.length - 2));
    const headers = (sheetRows[headerRowIdx] || []).map((cell) => String(cell ?? '').trim());
    const dataStartIdx = headerRowIdx + 1;
    const totalRows = sheetRows.length - dataStartIdx;
    totalExcelRows += totalRows;

    const soIndex = findColumn(headers, soColumn);
    const amountIndices = amountColumns.map((column) => findColumn(headers, column)).filter((idx) => idx >= 0);

    if (soIndex < 0 || amountIndices.length === 0) {
      sheetResults.push({ sheetName: sheet.sheetName, totalRows, matchedSo: 0, failRows: totalRows, duplicateSo: 0, status: '列未匹配' });
      totalFailRows += totalRows;
      continue;
    }

    let failRows = 0;
    let duplicateSo = 0;
    let matchedSo = 0;

    for (let i = dataStartIdx; i < sheetRows.length; i++) {
      const row = sheetRows[i];
      const so = normalizeSo(row[soIndex]);
      if (!so) {
        failRows += 1;
        continue;
      }
      let rowSum = 0;
      let rowHasNumber = false;
      for (const amountIndex of amountIndices) {
        const amountCell = row[amountIndex];
        if (amountCell === null || amountCell === undefined || amountCell === '') continue;
        if (typeof amountCell === 'string' && amountCell.trim() === '') continue;
        const numeric = Number(amountCell);
        if (!Number.isFinite(numeric)) continue;
        rowSum += numeric;
        rowHasNumber = true;
      }
      if (!rowHasNumber || !Number.isFinite(rowSum)) {
        failRows += 1;
        continue;
      }
      const previous = amountMap.get(so);
      if (previous !== undefined) {
        duplicateSo += 1;
        amountMap.set(so, previous + rowSum);
        continue;
      }
      amountMap.set(so, rowSum);
      matchedSo += 1;
    }

    totalFailRows += failRows;
    totalDuplicateSo += duplicateSo;
    sheetResults.push({ sheetName: sheet.sheetName, totalRows, matchedSo, failRows, duplicateSo, status: '已处理' });
  }

  // 匹配订单
  const db = getDb();
  let matchedCount = 0;
  let unmatchedCount = 0;
  let skippedMatchedCount = 0;
  const matchedSoSet = new Set();
  const ts = nowUtc();
  const updateOrder = db.prepare(
    `UPDATE orders SET commission_matched = 1, commission_amount = ?, commission_date = ?, status = 'closed', closed_at = ?, updated_at = ?
     WHERE id = ? AND status = 'commission' AND commission_matched = 0`
  );

  const process = db.transaction(() => {
    for (const so of amountMap.keys()) {
      const already = db.prepare('SELECT id FROM orders WHERE sales_order = ? AND commission_matched = 1 LIMIT 1').get(so);
      if (already) skippedMatchedCount += 1;
    }
    const orders = db
      .prepare("SELECT * FROM orders WHERE status = 'commission' AND commission_matched = 0 AND sales_order IS NOT NULL AND sales_order <> ''")
      .all();
    for (const order of orders) {
      const key = normalizeSo(order.sales_order);
      if (amountMap.has(key)) {
        const amount = amountMap.get(key);
        const info = updateOrder.run(amount, ts, ts, ts, order.id);
        if (info.changes === 0) throw new Error('商机状态已变更');
        matchedCount += 1;
        matchedSoSet.add(key);
      } else {
        unmatchedCount += 1;
      }
    }

    const logInfo = db.prepare(
      'INSERT INTO import_logs (target_type, file_name, total_rows, success_rows, fail_rows, created_at) VALUES (?,?,?,?,?,?)'
    ).run('commission', file.originalname, totalExcelRows, matchedCount, totalFailRows, ts);

    writeAudit(db, {
      userId: req.user.id,
      action: 'other',
      entityType: 'settings',
      entityId: logInfo.lastInsertRowid,
      detail: { event: 'commission_import', total_sheets: sheets.length, sheets: sheetResults }
    });
    return logInfo.lastInsertRowid;
  });

  const logId = process();
  return res.json({
    import_log_id: logId,
    total_excel_rows: totalExcelRows,
    total_sheets: sheets.length,
    sheet_results: sheetResults,
    matched: matchedCount,
    unmatched: unmatchedCount,
    fail_rows: totalFailRows,
    duplicate_so_count: totalDuplicateSo,
    extra_so_count: [...amountMap.keys()].filter((so) => !matchedSoSet.has(so)).length,
    skipped_matched_count: skippedMatchedCount
  });
});

router.get('/waiting', (req, res) => {
  const db = getDb();
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const total = db
    .prepare("SELECT COUNT(*) AS c FROM orders WHERE status = 'commission' AND commission_matched = 0")
    .get().c;
  const orders = db
    .prepare(
      `SELECT o.*, ec.customer_name AS end_customer_name, cc.customer_name AS contract_customer_name
       FROM orders o
       LEFT JOIN end_customers ec ON ec.id = o.end_customer_id
       LEFT JOIN contract_customers cc ON cc.id = o.contract_customer_id
       WHERE o.status = 'commission' AND o.commission_matched = 0
       ORDER BY o.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(limit, (page - 1) * limit);

  const posByOrder = new Map();
  if (orders.length > 0) {
    const placeholders = orders.map(() => '?').join(',');
    const posRows = db
      .prepare(`SELECT order_id, po_number, po_amount FROM customer_pos WHERE order_id IN (${placeholders}) ORDER BY order_id, id`)
      .all(...orders.map((order) => order.id));
    for (const pos of posRows) {
      const list = posByOrder.get(pos.order_id) || [];
      list.push(pos);
      posByOrder.set(pos.order_id, list);
    }
  }

  const items = orders.map((order) => {
    const pos = posByOrder.get(order.id) || [];
    return {
      ...order,
      pos,
      po_numbers: pos.map(p => p.po_number).filter(Boolean).join(', '),
      expected_commission: order.total_amount != null ? Math.round(order.total_amount * 0.01 * 100) / 100 : null
    };
  });
  return res.json({ items, total, page, limit });
});

router.get('/deviations', (req, res) => {
  const db = getDb();
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const sortField = req.query.sort === 'diff_ratio' ? 'diff_ratio' : 'diff_amount';
  const sortDir = req.query.order === 'asc' ? 'ASC' : 'DESC';
  const where = "o.status = 'closed' AND o.commission_amount > 0 AND o.total_amount > 0";
  const total = db.prepare(`SELECT COUNT(*) AS c FROM orders o WHERE ${where}`).get().c;
  const items = db
    .prepare(
      `SELECT o.id, o.order_id, o.order_type, o.project_name, o.total_amount, o.commission_amount,
             ec.customer_name AS end_customer_name,
             ROUND(o.total_amount * 0.01, 4) AS expected_commission,
             ROUND(o.commission_amount - o.total_amount * 0.01, 4) AS diff_amount,
             ROUND((o.commission_amount - o.total_amount * 0.01) / (o.total_amount * 0.01) * 100, 2) AS diff_ratio
      FROM orders o
       LEFT JOIN end_customers ec ON ec.id = o.end_customer_id
       WHERE ${where}
       ORDER BY ${sortField} ${sortDir}, o.id ${sortDir}
       LIMIT ? OFFSET ?`
    )
    .all(limit, (page - 1) * limit);
  return res.json({ items, total, page, limit });
});

router.get('/imports', (req, res) => {
  const items = getDb()
    .prepare("SELECT * FROM import_logs WHERE target_type = 'commission' ORDER BY id DESC LIMIT 50")
    .all();
  return res.json({ items });
});

router.post('/manual', (req, res) => {
  const db = getDb();
  const { order_id: orderId, amount, remark } = req.body || {};
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(orderId));
  if (!order) return notFound(res);
  if (order.status !== 'commission' || Number(order.commission_matched) === 1) {
    return badRequest(res, '仅佣金阶段且未匹配的商机可人工补录');
  }
  if (!isNonNegativeNumber(amount)) return badRequest(res, '补录金额不能小于 0');
  const ts = nowUtc();
  const tx = db.transaction(() => {
    const record = db
      .prepare('INSERT INTO commission_manual_records (order_id, amount, remark, operator_id, created_at) VALUES (?,?,?,?,?)')
      .run(order.id, Number(amount), remark ? String(remark) : null, req.user.id, ts);
    const info = db
      .prepare(
        `UPDATE orders SET commission_matched = 1, commission_amount = ?, commission_date = ?, status = 'closed', closed_at = ?, updated_at = ?
         WHERE id = ? AND status = 'commission' AND commission_matched = 0`
      )
      .run(Number(amount), ts, ts, ts, order.id);
    if (info.changes === 0) throw new Error('商机状态已变更');
    writeAudit(db, {
      userId: req.user.id,
      action: 'commission_manual',
      entityType: 'order',
      entityId: order.id,
      detail: { amount: Number(amount), record_id: record.lastInsertRowid, remark: remark ? String(remark) : null }
    });
    return record.lastInsertRowid;
  });
  const recordId = tx();
  return res.status(201).json({ record_id: recordId, order: db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id) });
});

router.delete('/imports', (req, res) => {
  const db = getDb();
  const total = db.prepare("SELECT COUNT(*) AS c FROM import_logs WHERE target_type = 'commission'").get().c;
  db.prepare("DELETE FROM import_logs WHERE target_type = 'commission'").run();
  return res.json({ deleted: total });
});

export default router;
