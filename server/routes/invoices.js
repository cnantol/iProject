import { Router } from 'express';
import fs from 'node:fs';
import { PDFParse } from 'pdf-parse';
import { getDb } from '../db/init.js';
import { round2, nowUtc, todayLocal, badRequest, notFound, pick, isMoney, isValidDate, writeAudit, cleanupUploadedFiles, resolveAttachmentFilePath } from '../utils.js';
import { maybeAutoAdvance } from './orders.js';

const router = Router();
const FIELDS = ['po_id', 'invoice_no', 'amount', 'invoice_date', 'remark', 'tax_amount', 'tax_rate', 'total_amount_incl_tax'];

function extractInvoiceFields(text) {
  const result = {
    invoice_no: null,
    invoice_date: null,
    amount: null,
    tax_amount: null,
    tax_rate: null,
    total_amount_incl_tax: null,
    confidence: { invoice_no: 0, invoice_date: 0, amount: 0, tax_amount: 0, total_amount_incl_tax: 0 }
  };
  const findAfterLabel = (labelPattern, valuePattern) => {
    const label = text.match(labelPattern);
    if (!label) return null;
    return text.slice(label.index + label[0].length).match(valuePattern);
  };
  const noMatch = findAfterLabel(/发票号码?\s*[:：]?\s*/, /([0-9]{20})/)
    || findAfterLabel(/发票号码?\s*[:：]?\s*/, /([0-9]{8,20})/)
    || text.match(/No\.?\s*[:：]?\s*([0-9]{8,20})/);
  if (noMatch) {
    result.invoice_no = noMatch[1];
    result.confidence.invoice_no = 1;
  }
  const dateMatch = findAfterLabel(/开票日期\s*[:：]?\s*/, /(\d{4})[年/\-.](\d{1,2})[月/\-.](\d{1,2})日?/);
  if (dateMatch) {
    const y = Number(dateMatch[1]);
    const m = Number(dateMatch[2]);
    const d = Number(dateMatch[3]);
    const dateStr = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (y >= 2000 && isValidDate(dateStr)) {
      result.invoice_date = dateStr;
      result.confidence.invoice_date = 1;
    }
  }
  const sumMatch = text.match(/合\s*计\s*[¥￥]?\s*([0-9][0-9,]*\.\d{2})\s*[¥￥]\s*([0-9][0-9,]*\.\d{2})/);
  if (sumMatch) {
    const exTax = Number(sumMatch[1].replace(/,/g, ''));
    const taxAmount = Number(sumMatch[2].replace(/,/g, ''));
    if (Number.isFinite(exTax) && exTax > 0 && Number.isFinite(taxAmount) && taxAmount >= 0) {
      result.amount = exTax;
      result.tax_amount = taxAmount;
      result.confidence.amount = 1;
      result.confidence.tax_amount = 1;
    }
  }
  const inclPatterns = [
    /价税合计\s*[（(]\s*小写\s*[)）]\s*[:：]?\s*[¥￥]?\s*([0-9][0-9,]*\.\d{2})/,
    /价税合计\s*[:：]?\s*[¥￥]?\s*([0-9][0-9,]*\.\d{2})/
  ];
  for (const pattern of inclPatterns) {
    const inclMatch = text.match(pattern);
    if (inclMatch) {
      const incl = Number(inclMatch[1].replace(/,/g, ''));
      if (Number.isFinite(incl) && incl > 0) {
        result.total_amount_incl_tax = incl;
        result.confidence.total_amount_incl_tax = 1;
        break;
      }
    }
  }
  let taxRate = null;
  if (result.amount !== null && result.tax_amount !== null) {
    taxRate = round2((result.tax_amount / result.amount) * 100);
  } else if (result.total_amount_incl_tax !== null && result.amount !== null) {
    taxRate = round2((result.total_amount_incl_tax / result.amount - 1) * 100);
  }
  if (taxRate === null) {
    const rateMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
    if (rateMatch) taxRate = Number(rateMatch[1]);
  }
  if (taxRate !== null) {
    const rates = [...text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((match) => Number(match[1]).toFixed(2));
    if (new Set(rates).size > 1) taxRate = null;
  }
  result.tax_rate = taxRate;
  if (result.amount === null && result.total_amount_incl_tax !== null && taxRate !== null && taxRate > 0) {
    result.amount = round2(result.total_amount_incl_tax / (1 + taxRate / 100));
    result.tax_amount = round2(result.total_amount_incl_tax - result.amount);
    result.confidence.amount = 0.5;
  }
  if (result.amount === null) {
    const candidates = [...text.matchAll(/([0-9][0-9,]*\.\d{2})/g)]
      .map((m) => Number(m[1].replace(/,/g, '')))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (candidates.length > 0) {
      const max = Math.max(...candidates);
      if (taxRate !== null && taxRate > 0) {
        result.amount = round2(max / (1 + taxRate / 100));
        result.tax_amount = round2(max - result.amount);
        result.total_amount_incl_tax = max;
        result.confidence.amount = 0.5;
      } else {
        result.amount = max;
        result.total_amount_incl_tax = max;
        result.confidence.amount = 0.5;
      }
    }
  }
  if (result.amount !== null && result.total_amount_incl_tax === null && result.tax_amount !== null) {
    result.total_amount_incl_tax = round2(result.amount + result.tax_amount);
  }
  return result;
}

router.post('/:orderId/invoices/recognize', async (req, res, next) => {
  try {
    const db = getDb();
    const order = loadOrder(db, req.params.orderId);
    if (!order) return notFound(res);
    const attachmentId = Number((req.body || {}).attachment_id);
    if (!Number.isInteger(attachmentId) || attachmentId <= 0) return badRequest(res, '请选择要识别的发票附件');
    const attachment = db
      .prepare("SELECT * FROM order_attachments WHERE id = ? AND order_id = ? AND stage = 'invoicing'")
      .get(attachmentId, order.id);
    if (!attachment) return badRequest(res, '发票附件不存在');
    if (attachment.file_type !== 'pdf') return badRequest(res, '仅支持 PDF 发票识别');
    const filePath = resolveAttachmentFilePath(attachment);
    if (!filePath || !fs.existsSync(filePath)) return notFound(res, '附件文件不存在');
    const parser = new PDFParse({ data: fs.readFileSync(filePath) });
    try {
      const result = await parser.getText();
      const text = String(result.text || '');
      if (!text.trim()) {
        return res.json({
          recognized: false,
          invoice_no: null,
          invoice_date: null,
          amount: null,
          confidence: { invoice_no: 0, invoice_date: 0, amount: 0 },
          message: '未识别到文字，请手动填写'
        });
      }
      const fields = extractInvoiceFields(text);
      if (!fields.invoice_no && !fields.invoice_date && fields.amount == null) {
        return res.json({ recognized: false, ...fields, message: '未识别到发票关键字段，请手动填写' });
      }
      return res.json({ recognized: true, ...fields, message: '识别完成，请核对后保存' });
    } finally {
      await parser.destroy().catch(() => {});
    }
  } catch (err) {
    next(err);
  }
});

function loadOrder(db, orderId) {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(orderId));
}

function totals(db, orderId) {
  const pos = db.prepare('SELECT po_amount FROM customer_pos WHERE order_id = ?').all(orderId);
  const invoices = db.prepare('SELECT amount, po_id FROM invoice_records WHERE order_id = ?').all(orderId);
  const poTotal = pos.reduce((sum, row) => sum + Number(row.po_amount || 0), 0);
  const invoiceTotal = invoices.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return { poTotal, invoiceTotal };
}

function syncInvoicedFlag(db, orderId) {
  const order = loadOrder(db, orderId);
  if (!order || order.status !== 'shipping_invoicing') return;
  const { poTotal, invoiceTotal } = totals(db, orderId);
  if (poTotal > 0 && invoiceTotal >= poTotal && Number(order.invoiced) !== 1) {
    db.prepare(
      `UPDATE orders SET invoiced = 1,
       invoiced_date = COALESCE(invoiced_date, (SELECT MAX(invoice_date) FROM invoice_records WHERE order_id = ?), ?),
       updated_at = ? WHERE id = ?`
    ).run(
      orderId,
      todayLocal(),
      nowUtc(),
      orderId
    );
  }
  if (Number(order.invoiced) === 1 && invoiceTotal < poTotal) {
    db.prepare('UPDATE orders SET invoiced = 0, invoiced_date = NULL, updated_at = ? WHERE id = ?').run(nowUtc(), orderId);
  }
}

router.get('/:orderId/invoices', (req, res) => {
  const db = getDb();
  if (!loadOrder(db, req.params.orderId)) return notFound(res);
  const items = db
    .prepare(
      `SELECT inv.*, cp.po_number FROM invoice_records inv
       LEFT JOIN customer_pos cp ON cp.id = inv.po_id
       WHERE inv.order_id = ? ORDER BY inv.id`
    )
    .all(Number(req.params.orderId));
  const { poTotal, invoiceTotal } = totals(db, Number(req.params.orderId));
  return res.json({ items, poTotal, invoiceTotal });
});

router.post('/:orderId/invoices', (req, res) => {
  const db = getDb();
  const order = loadOrder(db, req.params.orderId);
  if (!order) return notFound(res);
  if (order.status !== 'shipping_invoicing') return badRequest(res, '仅发货+开票阶段可登记发票');
  const data = pick(req.body || {}, FIELDS);
  const attachmentId = Number((req.body || {}).attachment_id);
  let attachment = null;
  if (attachmentId) {
    attachment = db
      .prepare("SELECT id FROM order_attachments WHERE id = ? AND order_id = ? AND stage = 'invoicing' AND (reference_type IS NULL OR reference_type = 'invoice_pending')")
      .get(attachmentId, order.id);
    if (!attachment) return badRequest(res, '发票附件无效或已绑定其他发票');
  }
  if (!data.po_id) return badRequest(res, '请选择对应的 PO');
  const po = db.prepare('SELECT * FROM customer_pos WHERE id = ? AND order_id = ?').get(Number(data.po_id), order.id);
  if (!po) return badRequest(res, '所选 PO 不存在');
  if (!data.invoice_no || !String(data.invoice_no).trim()) return badRequest(res, '发票号必填');
  if (!isMoney(data.amount)) return badRequest(res, '开票金额必须大于 0');
  const taxAmount = data.tax_amount === undefined || data.tax_amount === null || data.tax_amount === '' ? null : Number(data.tax_amount);
  const taxRate = data.tax_rate === undefined || data.tax_rate === null || data.tax_rate === '' ? null : Number(data.tax_rate);
  const inclTotal = data.total_amount_incl_tax === undefined || data.total_amount_incl_tax === null || data.total_amount_incl_tax === '' ? null : Number(data.total_amount_incl_tax);
  if (taxAmount !== null && (!Number.isFinite(taxAmount) || taxAmount < 0)) return badRequest(res, '税额格式无效');
  if (taxRate !== null && (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100)) return badRequest(res, '税率格式无效');
  if (inclTotal !== null && (!Number.isFinite(inclTotal) || inclTotal <= 0)) return badRequest(res, '含税金额格式无效');
  if (data.invoice_date !== undefined && data.invoice_date !== null && data.invoice_date !== '' && !isValidDate(data.invoice_date)) {
    return badRequest(res, '开票日期格式必须为 YYYY-MM-DD');
  }
  const poInvoiced = db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM invoice_records WHERE po_id = ?')
    .get(po.id).s;
  const poAmount = po.po_amount == null || po.po_amount === '' || Number(po.po_amount) <= 0 ? null : Number(po.po_amount);
  const wouldExceedPo = poAmount !== null && Number(poInvoiced) + Number(data.amount) > poAmount + 1e-9;
  if (wouldExceedPo && Number(req.body.confirm) !== 1) {
    return badRequest(res, `该 PO 累计开票将超过 PO 金额（PO ${po.po_amount}，已开 ${poInvoiced}），请确认后保存`);
  }
  const confirm = Boolean(wouldExceedPo && Number(req.body.confirm) === 1);
  let invoiceId;
  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO invoice_records (order_id, po_id, invoice_no, amount, tax_amount, tax_rate, total_amount_incl_tax,
          invoice_date, remark, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        order.id,
        po.id,
        String(data.invoice_no).trim(),
        Number(data.amount),
        taxAmount,
        taxRate,
        inclTotal,
        data.invoice_date || todayLocal(),
        data.remark ?? null,
        nowUtc()
      );
    invoiceId = info.lastInsertRowid;
    if (attachment) {
      db.prepare("UPDATE order_attachments SET reference_type = 'invoice_record', reference_id = ? WHERE id = ?")
        .run(invoiceId, attachment.id);
    }
    if (confirm) {
      writeAudit(db, {
        userId: req.user.id,
        action: 'invoice_override',
        entityType: 'order',
        entityId: order.id,
        detail: { event: 'over_invoice_confirm', po_id: po.id, po_amount: po.po_amount, previous_invoiced: poInvoiced, amount: Number(data.amount) }
      });
    }
  });
  try {
    tx();
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return badRequest(res, '该发票号在本商机下已存在');
    throw err;
  }
  syncInvoicedFlag(db, order.id);
  maybeAutoAdvance(db, order.id);
  const row = db
    .prepare('SELECT inv.*, cp.po_number FROM invoice_records inv LEFT JOIN customer_pos cp ON cp.id = inv.po_id WHERE inv.id = ?')
    .get(invoiceId);
  const current = totals(db, order.id);
  return res.status(201).json({ item: row, poTotal: current.poTotal, invoiceTotal: current.invoiceTotal });
});

router.delete('/:orderId/invoices/:invoiceId', (req, res) => {
  const db = getDb();
  const order = loadOrder(db, req.params.orderId);
  if (!order) return notFound(res);
  if (order.status !== 'shipping_invoicing') return badRequest(res, '仅发货+开票阶段可删除发票记录');
  const row = db.prepare('SELECT * FROM invoice_records WHERE id = ? AND order_id = ?').get(Number(req.params.invoiceId), order.id);
  if (!row) return notFound(res);
  const attachmentRows = db.prepare('SELECT file_path FROM order_attachments WHERE reference_type = ? AND reference_id = ?').all('invoice_record', row.id);
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM order_attachments WHERE reference_type = ? AND reference_id = ?').run('invoice_record', row.id);
    db.prepare('DELETE FROM invoice_records WHERE id = ?').run(row.id);
    syncInvoicedFlag(db, order.id);
  });
  tx();
  cleanupUploadedFiles(attachmentRows.map((r) => ({ path: resolveAttachmentFilePath(r) })));
  writeAudit(db, {
    userId: req.user.id,
    action: 'other',
    entityType: 'order',
    entityId: order.id,
    detail: { event: 'delete_invoice', invoice_id: row.id, invoice_no: row.invoice_no }
  });
  return res.json({ message: '发票记录已删除' });
});

export default router;
