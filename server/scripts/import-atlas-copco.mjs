import fs from 'node:fs';
import xlsx from 'xlsx';
import { initDb, closeDb, getDb } from '../db/init.js';
import { nowUtc, normalizeDate, normalizeSo } from '../utils.js';
import { hasFrameworkForCustomer } from '../routes/materials.js';

const DEFAULT_FILE = '/Users/lijian/Desktop/WorkBuddy/20260812Atlas Copco.xlsx';
const IMPORTED_CLOSED_DATE = '2026-08-18 00:00:00';
const MONTH_MAP = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
};
const CLEAN_PAYMENT_VALUES = new Set(['', '-', 'y', '0.01']);

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { file: DEFAULT_FILE, apply: false, limit: null };
  for (const arg of args) {
    if (arg === '--apply') opts.apply = true;
    else if (arg.startsWith('--file=')) opts.file = arg.slice('--file='.length);
    else if (arg.startsWith('--limit=')) opts.limit = Number(arg.slice('--limit='.length));
  }
  return opts;
}

function monthNumber(value) {
  if (value == null) return null;
  const text = String(value).trim().toLowerCase();
  if (/^\d{1,2}$/.test(text)) {
    const n = Number(text);
    return n >= 1 && n <= 12 ? n : null;
  }
  return MONTH_MAP[text] || null;
}

function parseYesNo(value) {
  if (value == null || value === '') return 0;
  const text = String(value).trim().toLowerCase();
  if (text === 'cancelled') return 'cancelled';
  if (text === 'service') return 'service';
  if (['y', 'yes', '1', 'true', '是'].includes(text)) return 1;
  if (['n', 'no', '0', 'false', '-'].includes(text)) return 0;
  return null;
}

function splitPoNumbers(raw) {
  if (!raw) return [];
  const cleaned = String(raw)
    .replace(/[，,;；]/g, ' ')
    .replace(/\.(?=\s|$)/g, ' ');
  const seen = new Set();
  const result = [];
  for (const token of cleaned.split(/\s+/).map((s) => s.trim()).filter(Boolean)) {
    const match = token.match(/^(.*?)[（(]\s*新PO\s*[)）]$/i);
    const number = match ? match[1] : token;
    if (!number || seen.has(number)) continue;
    seen.add(number);
    result.push({ number, remark: match ? '新PO' : null });
  }
  return result;
}

function normalizePayment(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (CLEAN_PAYMENT_VALUES.has(text.toLowerCase())) return null;
  return text;
}

function normalizeMonthText(month) {
  return month == null ? null : String(month).padStart(2, '0');
}

function buildRowParser(headers) {
  const index = new Map(headers.map((header, i) => [String(header), i]));
  return (row, name) => {
    const i = index.get(name);
    return i == null ? null : row[i];
  };
}

function parseRows(rows, limit) {
  const headers = rows[0] || [];
  const get = buildRowParser(headers);
  const result = [];
  const rawRows = limit == null ? rows.slice(1) : rows.slice(1, 1 + limit);
  rawRows.forEach((raw, offset) => {
    const rowNumber = offset + 2;
    if (!raw || raw.every((value) => value === null || value === undefined || String(value).trim() === '')) return;

    const contractName = get(raw, 'Contract Customer');
    const endName = get(raw, 'End Customer');
    const year = get(raw, 'Year');
    const monthValue = get(raw, 'Month');
    const month = monthNumber(monthValue);
    const salesOrder = normalizeSo(get(raw, 'SO'));
    const orderType = get(raw, 'Order Type') == null ? null : String(get(raw, 'Order Type')).trim();
    const projectNo = get(raw, 'Prn') == null ? null : String(get(raw, 'Prn')).trim();
    const totalAmountRaw = get(raw, 'Total Amount');
    const totalAmount = Number(totalAmountRaw);
    const poNumber = get(raw, 'PO') == null ? null : String(get(raw, 'PO')).trim();
    const workshop = get(raw, 'Workshop') == null ? null : String(get(raw, 'Workshop')).trim();
    const projectName = get(raw, 'Project Name') == null ? null : String(get(raw, 'Project Name')).trim();
    const projectOwner = get(raw, 'Project Owner') == null ? null : String(get(raw, 'Project Owner')).trim();
    const remarkParts = [get(raw, 'Remark')]
      .filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
      .map((value) => String(value).trim());
    const remark = remarkParts.length > 0 ? remarkParts.join('；') : null;
    const paymentTerms = normalizePayment(get(raw, 'Payment Method'));
    const deliveredRaw = get(raw, 'Delivered');
    const invoicedRaw = get(raw, 'Invoiced') != null ? get(raw, 'Invoiced') : get(raw, 'Invoiced\n(ex-VAT)');
    const commissionStatusRaw = get(raw, 'Commission Status') != null ? get(raw, 'Commission Status') : get(raw, '佣金状态');
    const commissionAmountRaw = get(raw, 'Commission Amount') != null ? get(raw, 'Commission Amount') : get(raw, '佣金金额');
    const orderStatusRaw = get(raw, 'Order status');
    const deliveredDateRaw = get(raw, 'Delivered Date');
    const invoicedDateRaw = get(raw, 'Invoiced Date');

    const errors = [];
    if (contractName == null || String(contractName).trim() === '') errors.push('合同客户缺失');
    if (endName == null || String(endName).trim() === '') errors.push('最终客户缺失');
    if (year == null || !/^\d{4}$/.test(String(year).trim())) errors.push('年份无效');
    if (month == null) errors.push('月份无法识别');
    if (!Number.isFinite(totalAmount) || totalAmount < 0) errors.push('总金额无效');
    if (orderType != null && !['A', 'B', 'C'].includes(orderType)) errors.push(`商机类型无效: ${orderType}`);
    if (errors.length > 0) {
      result.push({ rowNumber, errors, skip: true });
      return;
    }

    const deliveredFlag = parseYesNo(deliveredRaw);
    const invoicedFlag = parseYesNo(invoicedRaw);
    const warnings = [];
    if (deliveredFlag === null) warnings.push(`发货值无法识别: ${deliveredRaw}`);
    if (invoicedFlag === null) warnings.push(`开票值无法识别: ${invoicedRaw}`);
    const cancelled = deliveredFlag === 'cancelled'
      || invoicedFlag === 'cancelled'
      || (totalAmount === 0 && remark != null && /取消/.test(remark));
    const delivered = cancelled ? 0 : (deliveredFlag === 1 || deliveredFlag === 'service') ? 1 : 0;
    const invoiced = cancelled ? 0 : invoicedFlag === 1 ? 1 : 0;
    const explicitStatus = orderStatusRaw == null ? '' : String(orderStatusRaw).trim();
    const validStatuses = ['customer_info', 'proposal', 'quotation', 'approval_pending', 'bid_decision', 'finance', 'shipping_invoicing', 'commission', 'closed', 'lost_closed', 'cancelled'];

    const commissionStatus = commissionStatusRaw == null
      ? null
      : String(commissionStatusRaw).trim().toLowerCase() === 'yes'
        ? 'yes'
        : String(commissionStatusRaw).trim() === '0'
          ? 'zero'
          : null;
    let status;
    let commissionMatched = 0;
    let commissionAmount = null;
    let commissionDate = null;
    let finalDelivered = delivered;
    let finalInvoiced = invoiced;

    if (explicitStatus && validStatuses.includes(explicitStatus)) {
      status = explicitStatus;
      if (status === 'cancelled') {
        finalDelivered = 0;
        finalInvoiced = 0;
      } else if (status === 'closed') {
        finalDelivered = 1;
        finalInvoiced = 1;
        commissionMatched = 1;
        commissionAmount = commissionStatus === 'yes'
          ? (Number.isFinite(Number(commissionAmountRaw)) ? Math.max(0, Number(commissionAmountRaw)) : 0)
          : 0;
        commissionDate = IMPORTED_CLOSED_DATE;
      }
    } else if (cancelled) {
      status = 'cancelled';
      finalDelivered = 0;
      finalInvoiced = 0;
    } else if (commissionStatus === 'yes' || commissionStatus === 'zero') {
      status = 'closed';
      finalDelivered = 1;
      finalInvoiced = 1;
      commissionMatched = 1;
      commissionAmount = commissionStatus === 'yes'
        ? (Number.isFinite(Number(commissionAmountRaw)) ? Math.max(0, Number(commissionAmountRaw)) : 0)
        : 0;
      commissionDate = IMPORTED_CLOSED_DATE;
    } else if (finalDelivered === 1 && finalInvoiced === 1) {
      status = 'commission';
    } else if (finalDelivered === 1 || finalInvoiced === 1 || poNumber) {
      status = 'shipping_invoicing';
    } else {
      status = 'customer_info';
    }

    const monthText = normalizeMonthText(month);
    let deliveredDate = finalDelivered === 1 ? normalizeDate(deliveredDateRaw) : null;
    let invoicedDate = finalInvoiced === 1 ? normalizeDate(invoicedDateRaw) : null;
    if (status === 'shipping_invoicing') {
      if (finalDelivered === 1 && !deliveredDate) finalDelivered = 0;
      if (finalInvoiced === 1 && !invoicedDate) finalInvoiced = 0;
      deliveredDate = finalDelivered === 1 ? deliveredDate : null;
      invoicedDate = finalInvoiced === 1 ? invoicedDate : null;
    }
    const closedAt = status === 'closed' ? IMPORTED_CLOSED_DATE : null;

    result.push({
      rowNumber,
      contractName: String(contractName).trim(),
      endName: String(endName).trim(),
      year: String(year).trim(),
      month,
      monthText,
      salesOrder: salesOrder || null,
      orderType,
      projectNo,
      totalAmount,
      poNumber: cancelled ? null : (poNumber || null),
      workshop: workshop || null,
      projectName: projectName || null,
      projectOwner: projectOwner || null,
      remark,
      paymentTerms,
      delivered: finalDelivered,
      deliveredDate,
      invoiced: finalInvoiced,
      invoicedDate,
      commissionMatched,
      commissionAmount,
      commissionDate,
      status,
      bidResult: status === 'closed' ? 'won' : null,
      rawStatus: explicitStatus,
      closedAt,
      warnings,
      skip: false
    });
  });
  return result;
}

function ensureCustomer(db, table, name) {
  const existing = db.prepare(`SELECT id FROM ${table} WHERE customer_name = ? COLLATE NOCASE`).get(name);
  if (existing) return { id: existing.id, created: false };
  const ts = nowUtc();
  const info = db
    .prepare(`INSERT INTO ${table} (customer_name, created_at, updated_at) VALUES (?,?,?)`)
    .run(name, ts, ts);
  return { id: info.lastInsertRowid, created: true };
}

function runImport(db, rows) {
  const ts = nowUtc();
  const customerCache = { end: new Map(), contract: new Map() };
  const report = {
    customersCreated: 0,
    ordersCreated: 0,
    posCreated: 0,
    cancelledOrders: 0,
    failures: []
  };
  const insertOrder = db.prepare(`
    INSERT INTO orders (
      id, order_id, year, month, end_customer_id, contract_customer_id, order_type, project_no, workshop,
      project_name, project_owner, project_remark, sales_order, total_amount, payment_terms, delivered, delivered_date,
      invoiced, invoiced_date, commission_matched, commission_amount, commission_date, status, bid_result, has_framework, proposal_skipped,
      closed_at, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const insertPo = db.prepare('INSERT INTO customer_pos (order_id, po_number, po_amount, remark, created_at) VALUES (?,?,?,?,?)');
  const insertApproval = db.prepare(
    'INSERT INTO approval_records (order_id, quotation_id, approval_type, status, approver_id, applied_at, responded_at, remark) VALUES (?,?,?,?,?,?,?,?)'
  );

  for (const row of rows) {
    if (row.skip) {
      report.failures.push({ rowNumber: row.rowNumber, reason: row.errors.join('；') });
      continue;
    }

    const ensure = (kind, name) => {
      const cache = customerCache[kind];
      if (cache.has(name)) return cache.get(name);
      const table = kind === 'end' ? 'end_customers' : 'contract_customers';
      const result = ensureCustomer(db, table, name);
      cache.set(name, result.id);
      if (result.created) report.customersCreated += 1;
      return result.id;
    };

    const endCustomerId = ensure('end', row.endName);
    const contractCustomerId = ensure('contract', row.contractName);
    const nextId = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS n FROM orders').get().n;
    const orderId = String(nextId).padStart(4, '0');
    insertOrder.run(
      nextId,
      orderId,
      row.year,
      row.monthText,
      endCustomerId,
      contractCustomerId,
      row.orderType,
      row.projectNo,
      row.workshop,
      row.projectName,
      row.projectOwner,
      row.remark,
      row.salesOrder,
      row.totalAmount,
      row.paymentTerms,
      row.delivered,
      row.deliveredDate,
      row.invoiced,
      row.invoicedDate,
      row.commissionMatched,
      row.commissionAmount,
      row.commissionDate,
      row.status,
      row.bidResult,
      hasFrameworkForCustomer(endCustomerId) ? 1 : 0,
      0,
      row.closedAt,
      ts,
      ts
    );
    report.ordersCreated += 1;
    if (row.status === 'cancelled') report.cancelledOrders += 1;
    if (row.status === 'closed') {
      insertApproval.run(nextId, null, 'sales_force', 'approved', null, null, null, '历史导入自动完成');
      insertApproval.run(nextId, null, 'oa_contract', 'approved', null, null, null, '历史导入自动完成');
    }

    if (row.poNumber) {
      const poNumbers = splitPoNumbers(row.poNumber);
      const isMulti = poNumbers.length > 1;
      for (const poItem of poNumbers) {
        insertPo.run(nextId, poItem.number, isMulti ? null : (row.totalAmount > 0 ? row.totalAmount : null), poItem.remark || null, ts);
      }
      report.posCreated += poNumbers.length;
    }
  }
  return report;
}

function printReport(rows, report, apply) {
  const valid = rows.filter((row) => !row.skip);
  const statusCounts = {};
  for (const row of valid) {
    statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
  }
  console.log(`模式：${apply ? '正式导入' : 'Dry-run 预览'}`);
  console.log(`有效数据行：${valid.length}`);
  console.log(`预计导入：客户 ${report.customersCreated} 个，订单 ${report.ordersCreated} 张，PO ${report.posCreated} 条`);
  console.log(`取消订单：${report.cancelledOrders} 张`);
  console.log(`状态分布：${JSON.stringify(statusCounts)}`);
  const statusMismatches = valid.filter((row) => row.rawStatus && row.rawStatus !== row.status);
  if (statusMismatches.length > 0) {
    console.log(`状态不一致行：${statusMismatches.slice(0, 10).map((row) => `${row.rowNumber}(${row.rawStatus}->${row.status})`).join(', ')}`);
  }
  console.log(`失败行：${report.failures.length}`);
  for (const failure of report.failures.slice(0, 50)) {
    console.log(`  - 第 ${failure.rowNumber} 行：${failure.reason}`);
  }
  const warnings = valid.filter((row) => row.warnings.length > 0);
  if (warnings.length > 0) {
    console.log(`警告行：${warnings.length}`);
    for (const row of warnings.slice(0, 20)) {
      console.log(`  - 第 ${row.rowNumber} 行：${row.warnings.join('；')}`);
    }
  }
}

function main() {
  const opts = parseArgs();
  if (!fs.existsSync(opts.file)) {
    console.error(`文件不存在：${opts.file}`);
    process.exit(1);
  }
  initDb();
  try {
    const db = getDb();
    const workbook = xlsx.read(fs.readFileSync(opts.file), { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
    const parsed = parseRows(rows, opts.limit);

    if (!opts.apply) {
      const validRows = parsed.filter((row) => !row.skip);
      const existingEnd = new Set(
        db.prepare('SELECT customer_name FROM end_customers').all().map((row) => String(row.customer_name).toLowerCase())
      );
      const existingContract = new Set(
        db.prepare('SELECT customer_name FROM contract_customers').all().map((row) => String(row.customer_name).toLowerCase())
      );
      const endToCreate = new Set(
        validRows
          .map((row) => row.endName.toLowerCase())
          .filter((name) => !existingEnd.has(name))
      );
      const contractToCreate = new Set(
        validRows
          .map((row) => row.contractName.toLowerCase())
          .filter((name) => !existingContract.has(name))
      );
      const simulated = {
        customersCreated: endToCreate.size + contractToCreate.size,
        ordersCreated: validRows.length,
        posCreated: validRows.reduce((sum, row) => sum + (row.poNumber ? splitPoNumbers(row.poNumber).length : 0), 0),
        cancelledOrders: validRows.filter((row) => row.status === 'cancelled').length,
        failures: parsed.filter((row) => row.skip).map((row) => ({ rowNumber: row.rowNumber, reason: row.errors.join('；') }))
      };
      printReport(parsed, simulated, false);
      return;
    }

    const tx = db.transaction(() => runImport(db, parsed));
    const report = tx();
    printReport(parsed, report, true);
  } catch (err) {
    console.error('导入失败，已整体回滚：', err && err.stack ? err.stack : err);
    process.exitCode = 1;
  } finally {
    closeDb();
  }
}

main();
