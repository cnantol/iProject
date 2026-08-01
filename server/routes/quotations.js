import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { getDb, getUploadDir } from '../db/init.js';
import {
  nowUtc,
  todayLocal,
  badRequest,
  notFound,
  conflict,
  round2,
  round4,
  pick,
  isMoney,
  isQty,
  isPct
} from '../utils.js';

const router = Router();
const ITEM_FIELDS = ['material_no', 'description', 'material_type', 'price_source', 'unit_price_ex_vat', 'pay_percent', 'qty', 'unit', 'remark'];

function loadOrder(db, orderId) {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(orderId));
}

function resolvePrice(order, materialNo, materialType) {
  const db = getDb();
  if (materialType === 'non_standard') {
    return { price_source: 'manual', unit_price_ex_vat: null, description: null };
  }
  const hasFramework = Number(order.has_framework) === 1;
  if (hasFramework) {
    const framework = db
      .prepare(
        `SELECT * FROM materials WHERE end_customer_id = ? AND material_no = ?
         AND valid_from <= ? AND (valid_to IS NULL OR valid_to >= ?)
         ORDER BY valid_from DESC, id DESC LIMIT 1`
      )
      .get(order.end_customer_id, String(materialNo).trim(), todayLocal(), todayLocal());
    if (framework) {
      return { price_source: 'framework', unit_price_ex_vat: framework.unit_price_ex_vat, description: framework.description };
    }
    const guide = db.prepare('SELECT * FROM guide_prices WHERE material_no = ?').get(String(materialNo).trim());
    if (guide) {
      return { price_source: 'guide_price', unit_price_ex_vat: guide.guide_unit_price_ex_vat, description: guide.description };
    }
    return { price_source: 'manual', unit_price_ex_vat: null, description: null };
  }
  const guide = db.prepare('SELECT * FROM guide_prices WHERE material_no = ?').get(String(materialNo).trim());
  if (guide) {
    return { price_source: 'guide_price', unit_price_ex_vat: guide.guide_unit_price_ex_vat, description: guide.description };
  }
  return { price_source: 'manual', unit_price_ex_vat: null, description: null };
}

function recomputeTotal(db, roundId) {
  const row = db.prepare('SELECT COALESCE(SUM(line_amount), 0) AS total FROM quotation_items WHERE quotation_id = ?').get(roundId);
  const total = round2(row.total);
  db.prepare('UPDATE quotations SET total_amount = ? WHERE id = ?').run(total, roundId);
  return total;
}

function copySelectionsToRound(db, order, roundId) {
  const version = db
    .prepare('SELECT * FROM proposal_versions WHERE order_id = ? ORDER BY sort_order DESC, id DESC LIMIT 1')
    .get(order.id);
  if (!version) return;
  const selections = db.prepare('SELECT * FROM proposal_selections WHERE proposal_version_id = ? ORDER BY sort_order, id').all(version.id);
  const insert = db.prepare(
    `INSERT INTO quotation_items (quotation_id, material_no, description, material_type, price_source, unit_price_ex_vat,
      pay_percent, final_unit_price, qty, line_amount, unit, remark) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  const tx = db.transaction((rows) => {
    for (const selection of rows) {
      const materialType = selection.material_type || 'standard';
      const price = resolvePrice(order, selection.material_no || '', materialType);
      const unitPrice = price.unit_price_ex_vat;
      const payPercent = 100;
      const finalPrice = price.price_source === 'guide_price' ? round4((Number(unitPrice) * payPercent) / 100) : unitPrice;
      const lineAmount = finalPrice !== null && finalPrice !== undefined && selection.qty ? round2(finalPrice * Number(selection.qty)) : null;
      insert.run(
        roundId,
        selection.material_no,
        price.description ?? selection.description ?? null,
        materialType,
        price.price_source,
        unitPrice,
        payPercent,
        finalPrice,
        Number(selection.qty),
        lineAmount,
        selection.unit || 'pcs',
        selection.remark ?? null
      );
    }
  });
  tx(selections);
}

function copyPreviousRound(db, orderId, roundId) {
  const previous = db
    .prepare('SELECT * FROM quotations WHERE order_id = ? ORDER BY round_no DESC LIMIT 1')
    .get(orderId);
  if (!previous) return;
  const items = db.prepare('SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY id').all(previous.id);
  const insert = db.prepare(
    `INSERT INTO quotation_items (quotation_id, material_no, description, material_type, price_source, unit_price_ex_vat,
      pay_percent, final_unit_price, qty, line_amount, unit, remark) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  const tx = db.transaction((rows) => {
    for (const item of rows) {
      insert.run(
        roundId,
        item.material_no,
        item.description,
        item.material_type,
        item.price_source,
        item.unit_price_ex_vat,
        item.pay_percent,
        item.final_unit_price,
        item.qty,
        item.line_amount,
        item.unit,
        item.remark
      );
    }
  });
  tx(items);
}

function createRound(db, order, body) {
  const max = db.prepare('SELECT COALESCE(MAX(round_no), 0) AS m FROM quotations WHERE order_id = ?').get(order.id).m;
  const roundNo = max + 1;
  const info = db
    .prepare('INSERT INTO quotations (order_id, round_no, round_label, status, total_amount, remark, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(
      order.id,
      roundNo,
      body && body.round_label ? String(body.round_label) : `R${roundNo}`,
      'draft',
      0,
      body && body.remark ? String(body.remark) : null,
      nowUtc(),
      nowUtc()
    );
  const roundId = info.lastInsertRowid;
  const count = db.prepare('SELECT COUNT(*) AS c FROM quotations WHERE order_id = ?').get(order.id).c;
  if (count === 1) {
    if (Number(order.proposal_skipped) !== 1) copySelectionsToRound(db, order, roundId);
  } else {
    copyPreviousRound(db, order.id, roundId);
  }
  recomputeTotal(db, roundId);
  return roundId;
}

function findCjkFont() {
  const candidates = [
    path.join(process.cwd(), 'assets', 'fonts', 'NotoSansSC-Regular.ttf'),
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
    '/System/Library/Fonts/PingFang.ttc',
    '/System/Library/Fonts/Hiragino Sans GB.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function buildQuotationPdf(order, round, items, customerNames) {
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  const fontFile = findCjkFont();
  if (fontFile) doc.registerFont('cjk', fontFile);
  const font = (bold = false) => (fontFile ? (bold ? 'cjk' : 'cjk') : 'Helvetica');
  doc.font(font()).fontSize(16).fillColor('#004E9A').text('Atlas Copco 报价单', { align: 'center' });
  doc.moveDown(0.4);
  doc.fontSize(10).fillColor('#444444');
  doc.text(`报价单编号：Q-${todayLocal().replace(/-/g, '')}-R${round.round_no}`, { align: 'center' });
  doc.text(`订单号：${order.order_id || ''}`, { align: 'center' });
  doc.text(`项目名称：${order.project_name || ''}`, { align: 'center' });
  doc.text(`最终客户：${customerNames.end || ''}    合同客户：${customerNames.contract || ''}`, { align: 'center' });
  doc.moveDown(1);
  doc.fontSize(11).fillColor('#000000').text('报价明细', { underline: true });
  doc.moveDown(0.4);

  const tableTop = doc.y;
  const columns = [
    { label: '物料号', width: 88 },
    { label: '描述', width: 170 },
    { label: '类型', width: 62 },
    { label: '价格来源', width: 62 },
    { label: '单价', width: 72 },
    { label: '数量', width: 58 },
    { label: '行金额', width: 82 }
  ];
  let x = 48;
  doc.font(font(true)).fontSize(9).fillColor('#ffffff');
  doc.rect(48, tableTop, 499, 20).fill('#004E9A');
  doc.fillColor('#ffffff');
  for (const col of columns) {
    doc.text(col.label, x + 4, tableTop + 6, { width: col.width - 8 });
    x += col.width;
  }
  doc.font(font()).fillColor('#000000');
  let y = tableTop + 24;
  for (const item of items) {
    if (y > 760) {
      doc.addPage();
      y = 48;
    }
    x = 48;
    const values = [
      item.material_no || '',
      (item.description || '').slice(0, 34),
      item.material_type === 'non_standard' ? '非标' : '标准',
      { framework: '协议价', guide_price: '指导价', manual: '手工' }[item.price_source] || item.price_source || '',
      item.unit_price_ex_vat == null ? '' : Number(item.unit_price_ex_vat).toFixed(4),
      item.qty == null ? '' : String(item.qty),
      item.line_amount == null ? '' : Number(item.line_amount).toFixed(2)
    ];
    doc.font(font()).fontSize(9);
    values.forEach((value, idx) => {
      doc.text(String(value), x + 4, y + 2, { width: columns[idx].width - 8 });
      x += columns[idx].width;
    });
    y += 22;
  }
  doc.moveDown(1);
  doc.font(font(true)).fontSize(11).fillColor('#004E9A').text(`合计（未税）：${round.total_amount == null ? '0.00' : Number(round.total_amount).toFixed(2)}`, { align: 'right' });
  doc.moveDown(2);
  doc.font(font()).fontSize(9).fillColor('#666666').text(`生成时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`, { align: 'center' });
  doc.end();
  return doc;
}

router.get('/:orderId/quotations/price-lookup', (req, res) => {
  const db = getDb();
  const order = loadOrder(db, req.params.orderId);
  if (!order) return notFound(res);
  const materialNo = String(req.query.material_no || '').trim();
  const materialType = String(req.query.material_type || 'standard');
  if (!materialNo) return badRequest(res, '请输入物料号');
  const price = resolvePrice(order, materialNo, materialType);
  return res.json({ ...price, material_type: materialType });
});

router.get('/:orderId/quotations', (req, res) => {
  const db = getDb();
  const order = loadOrder(db, req.params.orderId);
  if (!order) return notFound(res);
  let rows = db.prepare('SELECT * FROM quotations WHERE order_id = ? ORDER BY round_no').all(order.id);
  if (rows.length === 0 && order.status === 'quotation') {
    const roundId = createRound(db, order, null);
    rows = db.prepare('SELECT * FROM quotations WHERE order_id = ? ORDER BY round_no').all(order.id);
    void roundId;
  }
  const result = rows.map((round) => {
    const items = db.prepare('SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY id').all(round.id);
    return { ...round, items };
  });
  return res.json({ items: result });
});

router.post('/:orderId/quotations', (req, res) => {
  const db = getDb();
  const order = loadOrder(db, req.params.orderId);
  if (!order) return notFound(res);
  if (order.status !== 'quotation') return badRequest(res, '仅报价阶段可新增报价轮次');
  const roundId = createRound(db, order, req.body || {});
  const round = db.prepare('SELECT * FROM quotations WHERE id = ?').get(roundId);
  const items = db.prepare('SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY id').all(roundId);
  return res.status(201).json({ ...round, items });
});

router.get('/:orderId/quotations/:roundId/pdf', (req, res) => {
  const db = getDb();
  const order = loadOrder(db, req.params.orderId);
  if (!order) return notFound(res);
  const round = db.prepare('SELECT * FROM quotations WHERE id = ? AND order_id = ?').get(Number(req.params.roundId), order.id);
  if (!round) return notFound(res);
  const items = db.prepare('SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY id').all(round.id);
  const ec = db.prepare('SELECT customer_name FROM end_customers WHERE id = ?').get(order.end_customer_id);
  const cc = db.prepare('SELECT customer_name FROM contract_customers WHERE id = ?').get(order.contract_customer_id);
  const doc = buildQuotationPdf(order, round, items, { end: ec ? ec.customer_name : '', contract: cc ? cc.customer_name : '' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="quotation-${order.order_id}-R${round.round_no}.pdf"`);
  doc.pipe(res);
});

router.post('/:orderId/quotations/:roundId/pdf', (req, res) => {
  const db = getDb();
  const order = loadOrder(db, req.params.orderId);
  if (!order) return notFound(res);
  const round = db.prepare('SELECT * FROM quotations WHERE id = ? AND order_id = ?').get(Number(req.params.roundId), order.id);
  if (!round) return notFound(res);
  const items = db.prepare('SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY id').all(round.id);
  const ec = db.prepare('SELECT customer_name FROM end_customers WHERE id = ?').get(order.end_customer_id);
  const cc = db.prepare('SELECT customer_name FROM contract_customers WHERE id = ?').get(order.contract_customer_id);
  const doc = buildQuotationPdf(order, round, items, { end: ec ? ec.customer_name : '', contract: cc ? cc.customer_name : '' });
  const uploads = getUploadDir();
  fs.mkdirSync(uploads, { recursive: true });
  const filename = `quotation-${order.order_id}-R${round.round_no}.pdf`;
  const filePath = path.join(uploads, filename);
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);
  stream.on('finish', () => {
    return res.json({ url: `/api/orders/${order.id}/quotations/${round.id}/pdf`, filename });
  });
});

function validateItemData(data) {
  if (!isQty(data.qty)) return '数量必须大于 0';
  if (!['framework', 'guide_price', 'manual'].includes(String(data.price_source))) return '价格来源无效';
  if (!isMoney(data.unit_price_ex_vat)) return '未税单价必须大于 0';
  if (data.material_type && !['standard', 'non_standard'].includes(String(data.material_type))) return '物料类型无效';
  if (String(data.price_source) === 'guide_price' && !isPct(data.pay_percent)) return '实付比例必须大于 0 且不超过 100';
  return null;
}

function computeItem(db, data) {
  const priceSource = String(data.price_source);
  const unitPrice = Number(data.unit_price_ex_vat);
  const payPercent = priceSource === 'guide_price' ? Number(data.pay_percent ?? 100) : 100;
  const finalPrice = priceSource === 'guide_price' ? round4((unitPrice * payPercent) / 100) : round4(unitPrice);
  const lineAmount = round2(finalPrice * Number(data.qty));
  return { priceSource, payPercent, finalPrice, lineAmount };
}

function canEditItems(order, round) {
  return order.status === 'quotation' && round.status === 'draft';
}

router.post('/:orderId/quotations/:roundId/items', (req, res) => {
  const db = getDb();
  const order = loadOrder(db, req.params.orderId);
  if (!order) return notFound(res);
  const round = db.prepare('SELECT * FROM quotations WHERE id = ? AND order_id = ?').get(Number(req.params.roundId), order.id);
  if (!round) return notFound(res);
  if (!canEditItems(order, round)) return badRequest(res, '当前报价轮次已锁定，不可修改');
  const data = pick(req.body || {}, ITEM_FIELDS);
  const error = validateItemData(data);
  if (error) return badRequest(res, error);
  const { priceSource, payPercent, finalPrice, lineAmount } = computeItem(db, data);
  const unitPrice = Number(data.unit_price_ex_vat);
  const materialType = data.material_type || 'standard';
  let description = data.description;
  if (materialType === 'standard' && data.material_no && (description === undefined || description === null || description === '')) {
    const resolved = resolvePrice(order, data.material_no, materialType);
    description = resolved.description;
  }
  const info = db
    .prepare(
      `INSERT INTO quotation_items (quotation_id, material_no, description, material_type, price_source, unit_price_ex_vat,
        pay_percent, final_unit_price, qty, line_amount, unit, remark) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      round.id,
      data.material_no ? String(data.material_no).trim() : null,
      description ?? null,
      materialType,
      priceSource,
      unitPrice,
      payPercent,
      finalPrice,
      Number(data.qty),
      lineAmount,
      data.unit || 'pcs',
      data.remark ?? null
    );
  const total = recomputeTotal(db, round.id);
  return res.status(201).json({ item: db.prepare('SELECT * FROM quotation_items WHERE id = ?').get(info.lastInsertRowid), total_amount: total });
});

router.put('/:orderId/quotations/:roundId/items/:itemId', (req, res) => {
  const db = getDb();
  const order = loadOrder(db, req.params.orderId);
  if (!order) return notFound(res);
  const round = db.prepare('SELECT * FROM quotations WHERE id = ? AND order_id = ?').get(Number(req.params.roundId), order.id);
  if (!round) return notFound(res);
  const item = db.prepare('SELECT * FROM quotation_items WHERE id = ? AND quotation_id = ?').get(Number(req.params.itemId), round.id);
  if (!item) return notFound(res);
  if (!canEditItems(order, round)) return badRequest(res, '当前报价轮次已锁定，不可修改');
  const data = pick(req.body || {}, ITEM_FIELDS);
  const merged = { ...item, ...data };
  const error = validateItemData(merged);
  if (error) return badRequest(res, error);
  const { priceSource, payPercent, finalPrice, lineAmount } = computeItem(db, merged);
  const materialType = merged.material_type || 'standard';
  let description = merged.description;
  if (materialType === 'standard' && merged.material_no && (description === undefined || description === null || description === '')) {
    const resolved = resolvePrice(order, merged.material_no, materialType);
    description = resolved.description;
  }
  db.prepare(
    `UPDATE quotation_items SET material_no=?, description=?, material_type=?, price_source=?, unit_price_ex_vat=?,
      pay_percent=?, final_unit_price=?, qty=?, line_amount=?, unit=?, remark=? WHERE id=?`
  ).run(
    merged.material_no ? String(merged.material_no).trim() : null,
    description ?? null,
    materialType,
    priceSource,
    Number(merged.unit_price_ex_vat),
    payPercent,
    finalPrice,
    Number(merged.qty),
    lineAmount,
    merged.unit || 'pcs',
    merged.remark ?? null,
    item.id
  );
  const total = recomputeTotal(db, round.id);
  return res.json({ item: db.prepare('SELECT * FROM quotation_items WHERE id = ?').get(item.id), total_amount: total });
});

router.delete('/:orderId/quotations/:roundId/items/:itemId', (req, res) => {
  const db = getDb();
  const order = loadOrder(db, req.params.orderId);
  if (!order) return notFound(res);
  const round = db.prepare('SELECT * FROM quotations WHERE id = ? AND order_id = ?').get(Number(req.params.roundId), order.id);
  if (!round) return notFound(res);
  if (!canEditItems(order, round)) return badRequest(res, '当前报价轮次已锁定，不可修改');
  const info = db.prepare('DELETE FROM quotation_items WHERE id = ? AND quotation_id = ?').run(Number(req.params.itemId), round.id);
  if (info.changes === 0) return notFound(res);
  const total = recomputeTotal(db, round.id);
  return res.json({ message: '报价明细已删除', total_amount: total });
});

router.patch('/:orderId/quotations/:roundId', (req, res) => {
  const db = getDb();
  const order = loadOrder(db, req.params.orderId);
  if (!order) return notFound(res);
  const round = db.prepare('SELECT * FROM quotations WHERE id = ? AND order_id = ?').get(Number(req.params.roundId), order.id);
  if (!round) return notFound(res);
  const { action } = req.body || {};
  if (action === 'submit') {
    if (order.status !== 'quotation') return badRequest(res, '仅报价阶段可提交报价');
    if (round.status !== 'draft') return badRequest(res, '该轮次已提交');
    const items = db.prepare('SELECT * FROM quotation_items WHERE quotation_id = ?').all(round.id);
    if (items.length === 0) return badRequest(res, '空轮次不允许提交');
    const invalid = items.find((item) => item.final_unit_price === null || item.final_unit_price === undefined || !isMoney(item.final_unit_price));
    if (invalid) return badRequest(res, '存在未填写最终单价的报价行，无法提交');
    const invalidLine = items.find((item) => item.line_amount === null || item.line_amount === undefined || !isMoney(item.line_amount));
    if (invalidLine) return badRequest(res, '存在未计算行金额的报价行，无法提交');
    const total = recomputeTotal(db, round.id);
    const info = db
      .prepare("UPDATE quotations SET status = 'submitted', total_amount = ?, updated_at = ? WHERE id = ? AND status = 'draft'")
      .run(total, nowUtc(), round.id);
    if (info.changes === 0) return conflict(res, '报价轮次状态已变更，请刷新');
    return res.json(db.prepare('SELECT * FROM quotations WHERE id = ?').get(round.id));
  }
  if (round.status !== 'draft') return badRequest(res, '已提交轮次锁定，不可修改');
  const data = pick(req.body || {}, ['round_label', 'remark']);
  db.prepare('UPDATE quotations SET round_label=?, remark=?, updated_at=? WHERE id=?').run(
    data.round_label !== undefined ? String(data.round_label) : round.round_label,
    data.remark !== undefined ? String(data.remark) : round.remark,
    nowUtc(),
    round.id
  );
  return res.json(db.prepare('SELECT * FROM quotations WHERE id = ?').get(round.id));
});

router.post('/:orderId/quotations/:roundId/sync-from-proposal', (req, res) => {
  const db = getDb();
  const order = loadOrder(db, req.params.orderId);
  if (!order) return notFound(res);
  const round = db.prepare('SELECT * FROM quotations WHERE id = ? AND order_id = ?').get(Number(req.params.roundId), order.id);
  if (!round) return notFound(res);
  if (!canEditItems(order, round)) return badRequest(res, '当前报价轮次已锁定，不可同步');
  if (Number(order.proposal_skipped) === 1) return badRequest(res, '方案已跳过，禁用「从方案同步」');
  const version = db
    .prepare('SELECT * FROM proposal_versions WHERE order_id = ? ORDER BY sort_order DESC, id DESC LIMIT 1')
    .get(order.id);
  if (!version) return badRequest(res, '未创建方案版本，报价明细需手工录入');
  const selections = db.prepare('SELECT * FROM proposal_selections WHERE proposal_version_id = ? ORDER BY sort_order, id').all(version.id);
  const existing = db.prepare('SELECT * FROM quotation_items WHERE quotation_id = ?').all(round.id);
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM quotation_items WHERE quotation_id = ?').run(round.id);
    const insert = db.prepare(
      `INSERT INTO quotation_items (quotation_id, material_no, description, material_type, price_source, unit_price_ex_vat,
        pay_percent, final_unit_price, qty, line_amount, unit, remark) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    );
    for (const selection of selections) {
      const materialType = selection.material_type || 'standard';
      const price = resolvePrice(order, selection.material_no || '', materialType);
      const previous = existing.find((item) => item.material_no === selection.material_no && item.material_type === materialType);
      const unitPrice = price.price_source === 'manual' && previous ? previous.unit_price_ex_vat : price.unit_price_ex_vat;
      const payPercent = price.price_source === 'guide_price' ? (previous ? Number(previous.pay_percent ?? 100) : 100) : 100;
      const finalPrice =
        unitPrice === null || unitPrice === undefined
          ? null
          : price.price_source === 'guide_price'
            ? round4((Number(unitPrice) * payPercent) / 100)
            : round4(Number(unitPrice));
      const lineAmount = finalPrice === null || finalPrice === undefined ? null : round2(finalPrice * Number(selection.qty));
      insert.run(
        round.id,
        selection.material_no,
        price.description ?? selection.description ?? null,
        materialType,
        price.price_source,
        unitPrice,
        payPercent,
        finalPrice,
        Number(selection.qty),
        lineAmount,
        selection.unit || 'pcs',
        selection.remark ?? null
      );
    }
  });
  tx();
  const total = recomputeTotal(db, round.id);
  const items = db.prepare('SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY id').all(round.id);
  return res.json({ items, total_amount: total, message: '已从最新方案版本同步明细' });
});

export default router;
export { resolvePrice, createRound, recomputeTotal };
