import { Router } from 'express';
import fs from 'node:fs';
import xlsx from 'xlsx';
import { getDb } from '../db/init.js';
import { upload } from '../middleware/upload.js';
import { nowUtc, badRequest, notFound, conflict, normalizeSo, isNonNegativeNumber, writeAudit } from '../utils.js';

const router = Router();

function readWorkbook(filePath) {
  const workbook = xlsx.read(fs.readFileSync(filePath), { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return null;
  const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null, raw: true });
  return rows;
}

function findColumn(headers, label) {
  const target = String(label || '').trim().toLowerCase();
  if (!target) return -1;
  return headers.findIndex((header) => String(header == null ? '' : header).trim().toLowerCase() === target);
}

router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return badRequest(res, '请上传佣金 Excel 文件');
  const soColumn = String(req.body.soColumn || '');
  const amountColumn = String(req.body.amountColumn || '');
  if (!amountColumn) return badRequest(res, '请选择佣金金额列');
  if (!soColumn) return badRequest(res, '请选择 SO 号列');

  let rows;
  try {
    rows = readWorkbook(req.file.path);
  } catch {
    fs.unlinkSync(req.file.path);
    return badRequest(res, 'Excel 解析失败');
  }
  fs.unlinkSync(req.file.path);
  if (!rows || rows.length < 2) return badRequest(res, 'Excel 无有效数据');

  const headers = rows[0] || [];
  const soIndex = findColumn(headers, soColumn);
  const amountIndex = findColumn(headers, amountColumn);
  if (soIndex < 0 || amountIndex < 0) return badRequest(res, '无法匹配所选列名，请确认表头');

  const db = getDb();
  const amountMap = new Map();
  const seen = new Set();
  let failRows = 0;
  let duplicateSoCount = 0;
  const totalRows = rows.length - 1;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const amountCell = row[amountIndex];
    const numeric = Number(amountCell);
    if (amountCell === null || amountCell === undefined || amountCell === '' || !Number.isFinite(numeric) || numeric <= 0) {
      failRows += 1;
      continue;
    }
    const so = normalizeSo(row[soIndex]);
    if (!so) {
      failRows += 1;
      continue;
    }
    if (seen.has(so)) {
      duplicateSoCount += 1;
      failRows += 1;
      continue;
    }
    seen.add(so);
    amountMap.set(so, numeric);
  }

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
    const orders = db
      .prepare("SELECT * FROM orders WHERE status = 'commission' AND commission_matched = 0 AND sales_order IS NOT NULL AND sales_order <> ''")
      .all();
    for (const order of orders) {
      const key = normalizeSo(order.sales_order);
      if (amountMap.has(key)) {
        const amount = amountMap.get(key);
        const info = updateOrder.run(amount, ts, ts, ts, order.id);
        if (info.changes === 0) throw new Error('销售机会状态已变更');
        matchedCount += 1;
        matchedSoSet.add(key);
      } else {
        unmatchedCount += 1;
      }
    }

    for (const so of amountMap.keys()) {
      const already = db.prepare('SELECT id FROM orders WHERE sales_order = ? AND commission_matched = 1 LIMIT 1').get(so);
      if (already) skippedMatchedCount += 1;
    }

    const extraSoCount = [...amountMap.keys()].filter((so) => !matchedSoSet.has(so)).length;
    const logInfo = db
      .prepare(
        'INSERT INTO import_logs (target_type, file_name, total_rows, success_rows, fail_rows, created_at) VALUES (?,?,?,?,?,?)'
      )
      .run(
        'commission',
        req.file.originalname,
        totalRows,
        matchedCount,
        failRows,
        ts
      );
    writeAudit(db, {
      userId: req.user.id,
      action: 'other',
      entityType: 'settings',
      entityId: logInfo.lastInsertRowid,
      detail: {
        event: 'commission_import',
        total_rows: totalRows,
        matched: matchedCount,
        unmatched: unmatchedCount,
        fail_rows: failRows,
        extra_so_count: extraSoCount,
        duplicate_so_count: duplicateSoCount,
        skipped_matched_count: skippedMatchedCount
      }
    });
    return logInfo.lastInsertRowid;
  });

  const logId = process();
  return res.json({
    import_log_id: logId,
    total_excel_rows: totalRows,
    matched: matchedCount,
    unmatched: unmatchedCount,
    fail_rows: failRows,
    duplicate_so_count: duplicateSoCount,
    extra_so_count: [...amountMap.keys()].filter((so) => !matchedSoSet.has(so)).length,
    skipped_matched_count: skippedMatchedCount
  });
});

router.get('/waiting', (req, res) => {
  const db = getDb();
  const items = db
    .prepare(
      `SELECT o.*, ec.customer_name AS end_customer_name, cc.customer_name AS contract_customer_name
       FROM orders o
       LEFT JOIN end_customers ec ON ec.id = o.end_customer_id
       LEFT JOIN contract_customers cc ON cc.id = o.contract_customer_id
       WHERE o.status = 'commission' AND o.commission_matched = 0
       ORDER BY o.id DESC`
    )
    .all();
  return res.json({ items });
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
    return badRequest(res, '仅佣金阶段且未匹配的销售机会可人工补录');
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
    if (info.changes === 0) throw new Error('销售机会状态已变更');
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

export default router;
