import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import xlsx from 'xlsx';
import { getDb, getDataDir } from '../db/init.js';
import { upload } from '../middleware/upload.js';
import { authenticateDownload } from '../middleware/auth.js';
import { frameworkCustomerIds } from './materials.js';
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
  isPct,
  writeAudit,
  headerIndex,
  cell
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
  const frameworkQuery = db.prepare(
    `SELECT * FROM materials WHERE end_customer_id = ? AND material_no = ?
     AND valid_from <= ? AND (valid_to IS NULL OR valid_to >= ?)
     ORDER BY valid_from DESC, id DESC LIMIT 1`
  );
  for (const customerId of frameworkCustomerIds(order.end_customer_id)) {
    const framework = frameworkQuery.get(customerId, String(materialNo).trim(), todayLocal(), todayLocal());
    if (framework) {
      const guideDescription = framework.description
        ? framework.description
        : (db.prepare('SELECT description FROM guide_prices WHERE material_no = ?').get(String(materialNo).trim()) || {}).description || null;
      return { price_source: 'framework', unit_price_ex_vat: framework.unit_price_ex_vat, description: guideDescription };
    }
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
  recomputeTotal(db, roundId);
  return roundId;
}

function findCjkFont(family = 'sans') {
  const sans = [
    process.env.CJK_FONT_PATH,
    path.join(process.cwd(), 'assets', 'fonts', 'NotoSansCJK-Regular.ttc'),
    '/app/assets/fonts/NotoSansCJK-Regular.ttc',
    '/app/assets/fonts/NotoSansSC-Regular.ttf',
    path.join(process.cwd(), 'assets', 'fonts', 'NotoSansSC-Regular.ttf'),
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
    '/System/Library/Fonts/PingFang.ttc',
    '/System/Library/Fonts/Hiragino Sans GB.ttc',
    '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
    '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
    '/usr/share/fonts/wqy-zenhei/wqy-zenhei.ttc'
  ].filter(Boolean);
  const serif = [
    process.env.CJK_SERIF_FONT_PATH,
    path.join(process.cwd(), 'assets', 'fonts', 'NotoSerifCJK-Regular.ttc'),
    path.join(process.cwd(), 'assets', 'fonts', 'NotoSerifSC-Regular.otf'),
    path.join(process.cwd(), 'assets', 'fonts', 'NotoSerifSC-Regular.ttf'),
    '/app/assets/fonts/NotoSerifCJK-Regular.ttc',
    '/app/assets/fonts/NotoSerifSC-Regular.otf',
    '/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc',
    '/usr/share/fonts/noto-cjk/NotoSerifCJK-Regular.ttc',
    '/usr/share/fonts/noto-cjk/NotoSerifSC-Regular.otf'
  ].filter(Boolean);
  const mono = [
    process.env.CJK_MONO_FONT_PATH,
    path.join(process.cwd(), 'assets', 'fonts', 'NotoSansMonoCJK-Regular.ttc'),
    '/app/assets/fonts/NotoSansMonoCJK-Regular.ttc'
  ].filter(Boolean);
  const candidates = family === 'serif' ? serif : family === 'mono' ? mono : sans;
  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function buildQuoteNo(style, quoteShort, datePart, round, order) {
  const template = String(style.quote_no_template || '').trim();
  const auto = quoteShort ? `Q-${quoteShort}-${datePart}-R${round.round_no}` : `Q-${datePart}-R${round.round_no}`;
  if (!template) return auto;
  const values = {
    customer: quoteShort || '',
    date: datePart,
    round: `R${round.round_no}`,
    order: order.order_id || ''
  };
  return template.replace(/\{(customer|date|round|order)\}/g, (_, key) => values[key]).trim();
}

function resolveQuoteNo(db, order, round, style, quoteShort, datePart) {
  const base = buildQuoteNo(style, quoteShort, datePart, round, order);
  if (!round || !round.id) return base;
  let quoteNo = base;
  let seq = 0;
  while (db.prepare('SELECT id FROM quotations WHERE quote_no = ? AND id <> ? LIMIT 1').get(quoteNo, round.id)) {
    seq += 1;
    quoteNo = `${base}-${seq}`;
  }
  const row = db.prepare('SELECT quote_no FROM quotations WHERE id = ?').get(round.id);
  if (!row || row.quote_no !== quoteNo) {
    db.prepare('UPDATE quotations SET quote_no = ?, updated_at = ? WHERE id = ?').run(quoteNo, nowUtc(), round.id);
  }
  return quoteNo;
}

function buildQuotationPdf(order, round, items, customerNames, styleOverride = null) {
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  let style = { company_name: 'iProject', primary_color: '#004E9A' };
  try {
    style = JSON.parse(fs.readFileSync(path.join(getDataDir(), 'quote-style.json'), 'utf8'));
  } catch {
    // 使用默认品牌样式
  }
  if (styleOverride) style = styleOverride;
  const language = style.language === 'en' ? 'en' : 'zh';
  const labels = language === 'en' ? style.labels_en || {} : style.labels || {};
  const titleAlign = style.title_alignment || 'center';
  const infoAlign = style.info_alignment || 'center';
  const headerAlign = style.header_alignment || 'center';
  const footerAlign = style.footer_alignment || 'center';
  const visibility = style.field_visibility || {};
  const show = (key) => visibility[key] !== 0 && visibility[key] !== false;
  const quoteShort = customerNames.endShort || customerNames.contractShort || null;
  const quoteDatePart = todayLocal().replace(/-/g, '');
  const quoteNo = resolveQuoteNo(getDb(), order, round, style, quoteShort, quoteDatePart);
  let fontFile = findCjkFont(style.font_family) || findCjkFont('sans');
  let fontReady = false;
  if (fontFile) {
    try {
      doc.registerFont('cjk', fontFile);
      fontReady = true;
    } catch {
      // .ttc (TrueType Collection) 在 pdfkit 0.15.x 上不支持，
      // 字体加载失败时降级到 latin 字体，不影响英文/数字渲染。
      fontFile = null;
    }
  }
  const latinFallback = style.font_family === 'serif' ? 'Times-Roman' : style.font_family === 'mono' ? 'Courier' : 'Helvetica';
  const font = (bold = false) => (fontReady ? 'cjk' : bold ? 'Helvetica-Bold' : latinFallback);
  const fitFontSize = (text, maxWidth, maxSize = 9, minSize = 6.5) => {
    // doc.widthOfString(text) 不传 size 时走 doc._fontSize,因此每次迭代需同步设置 fontSize,
    // 才能正确测宽。size 减半步后再调用 widthOfString 测一次;返回的 size 由调用方 doc.fontSize() 应用。
    let size = maxSize;
    doc.fontSize(size);
    while (size > minSize && doc.widthOfString(String(text)) > maxWidth) {
      size = Math.max(minSize, size - 0.5);
      doc.fontSize(size);
    }
    return size;
  };
  if (style.header_text) {
    doc.font(font()).fontSize(10).fillColor('#555555').text(String(style.header_text), { align: headerAlign });
    doc.moveDown(0.4);
  }
  if (style.logo && /^data:image\/(png|jpeg|jpg);base64,/i.test(String(style.logo))) {
    try {
      const logoBuffer = Buffer.from(String(style.logo).split(',')[1], 'base64');
      const logoWidth = Math.min(120, (48 + 499 + 48) / 3);
      const logoX = style.logo_position === 'left' ? 48 : style.logo_position === 'right' ? 48 + 499 - logoWidth : (48 + 499 + 48 - logoWidth) / 2;
      doc.image(logoBuffer, logoX, doc.y, { width: logoWidth });
      doc.moveDown(0.6);
    } catch {
      // Logo 数据损坏时跳过，不影响 PDF 生成
    }
  }
  doc.font(font()).fontSize(16).fillColor(style.primary_color).text(`${style.company_name || 'iProject'} ${labels.quote_title || '报价单'}`, { align: titleAlign });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor('#444444');
  if (show('quote_no')) doc.text(`${labels.quote_no || '报价单编号'}：${quoteNo}`, { align: infoAlign });
  if (show('order_no')) doc.text(`${labels.order_no || '销售机会编号'}：${order.order_id || ''}`, { align: infoAlign });
  if (show('project_name')) doc.text(`${labels.project_name || '项目名称'}：${order.project_name || ''}`, { align: infoAlign });
  if (show('end_customer')) doc.text(`${labels.end_customer || '最终客户'}：${customerNames.end || ''}`, { align: infoAlign });
  if (show('contract_customer')) doc.text(`${labels.contract_customer || '合同客户'}：${customerNames.contract || ''}`, { align: infoAlign });
  if (show('contact_info')) {
    const contactParts = [style.company_address, style.company_phone, style.company_email].filter(Boolean);
    if (contactParts.length > 0) doc.text(contactParts.join('    '), { align: infoAlign });
  }
  if (show('quote_date')) doc.text(`${labels.quote_date || '报价日期'}：${style.quote_date || todayLocal()}`, { align: infoAlign });
  doc.moveDown(1);
  doc.fontSize(11).fillColor(style.primary_color).text(labels.detail_title || '报价明细', { underline: true });
  doc.moveDown(0.4);

  const tableTop = doc.y;
  const baseColumns = [
    { key: 'material_no', label: labels.material_no || '物料号', width: 88 },
    { key: 'description', label: labels.description || '描述', width: 158 },
    { key: 'type', label: labels.type || '类型', width: 62 },
    { key: 'price_source', label: labels.price_source || '价格来源', width: 62 },
    { key: 'unit_price', label: labels.unit_price || '单价', width: 84 },
    { key: 'qty', label: labels.qty || '数量', width: 58 },
    { key: 'line_amount', label: labels.line_amount || '行金额', width: 82 }
  ];
  const columns = baseColumns.filter((col) => show(col.key));
  const baseTotal = baseColumns.reduce((sum, col) => sum + col.width, 0);
  let usedWidth = 0;
  columns.forEach((col, index) => {
    if (index === columns.length - 1) {
      col.width = 499 - usedWidth;
    } else {
      col.width = Math.round((col.width / baseTotal) * 499);
      usedWidth += col.width;
    }
  });
  const numericKeys = new Set(['unit_price', 'qty', 'line_amount']);
  let x = 48;
  const drawTableHeader = (topY) => {
    doc.font(font(true)).fontSize(9).fillColor('#ffffff');
    doc.rect(48, topY, 499, 20).fill(style.primary_color);
    doc.fillColor('#ffffff');
    let hx = 48;
    for (const col of columns) {
      const headerSize = fitFontSize(col.label, col.width - 8, 9, 6.5);
      doc.fontSize(headerSize);
      doc.text(col.label, hx + 4, topY + 6, { width: col.width - 8, align: numericKeys.has(col.key) ? 'right' : 'left', lineBreak: false });
      hx += col.width;
    }
    doc.font(font()).fillColor('#000000');
    return topY + 24;
  };
  if (columns.length === 0) {
    doc.font(font()).fontSize(10).fillColor('#888888').text('未启用任何列', { align: infoAlign });
  } else {
    drawTableHeader(tableTop);
  }
  doc.font(font()).fillColor('#000000');
  let y = columns.length > 0 ? tableTop + 24 : tableTop;
  for (const item of items) {
    if (columns.length === 0) break;
    const valueMap = {
      material_no: item.material_no || '',
      description: item.description || '',
      type: item.material_type === 'non_standard' ? '非标' : '标准',
      price_source: { framework: '协议价', guide_price: '指导价', manual: '手工' }[item.price_source] || item.price_source || '',
      unit_price: item.unit_price_ex_vat == null ? '' : Number(item.unit_price_ex_vat).toFixed(2),
      qty: item.qty == null ? '' : String(item.qty),
      line_amount: item.line_amount == null ? '' : Number(item.line_amount).toFixed(2)
    };
    const values = columns.map((col) => valueMap[col.key]);
    const descIndex = columns.findIndex((col) => col.key === 'description');
    let rowHeight = 22;
    if (descIndex >= 0 && String(values[descIndex] || '').trim()) {
      doc.font(font()).fontSize(9);
      rowHeight = Math.max(22, Math.ceil(doc.heightOfString(String(values[descIndex]), { width: columns[descIndex].width - 8 }) / 12) * 12 + 6);
    }
    if (y + rowHeight > 760) {
      doc.addPage();
      y = drawTableHeader(48);
    }
    x = 48;
    doc.font(font()).fontSize(9).fillColor('#000000');
    values.forEach((value, idx) => {
      if (idx !== descIndex) {
        const cellSize = fitFontSize(value, columns[idx].width - 8, 9, 6.5);
        doc.fontSize(cellSize);
      } else {
        doc.fontSize(9);
      }
      doc.text(String(value), x + 4, y + 2, { width: columns[idx].width - 8, align: numericKeys.has(columns[idx].key) ? 'right' : 'left', lineBreak: true });
      x += columns[idx].width;
    });
    doc.y = y + rowHeight;
    y = doc.y;
  }
  doc.moveDown(1);
  doc.font(font(true)).fontSize(11).fillColor(style.primary_color).text(`${labels.total || '合计（未税）'}：${round.total_amount == null ? '0.00' : Number(round.total_amount).toFixed(2)}`, { align: 'right' });
  doc.moveDown(1.4);
  if (style.footer_text) {
    doc.moveDown(0.6);
    doc.font(font()).fontSize(9).fillColor('#888888').text(String(style.footer_text), { align: footerAlign });
  }
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
    createRound(db, order, null);
    rows = db.prepare('SELECT * FROM quotations WHERE order_id = ? ORDER BY round_no').all(order.id);
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

router.get('/:orderId/quotations/:roundId/pdf', authenticateDownload, (req, res, next) => {
  const db = getDb();
  const order = loadOrder(db, req.params.orderId);
  if (!order) return notFound(res);
  const round = db.prepare('SELECT * FROM quotations WHERE id = ? AND order_id = ?').get(Number(req.params.roundId), order.id);
  if (!round) return notFound(res);
  const items = db.prepare('SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY id').all(round.id);
  const ec = db.prepare('SELECT customer_name, short_name FROM end_customers WHERE id = ?').get(order.end_customer_id);
  const cc = db.prepare('SELECT customer_name, short_name FROM contract_customers WHERE id = ?').get(order.contract_customer_id);
  try {
    const doc = buildQuotationPdf(order, round, items, { end: ec ? ec.customer_name : '', contract: cc ? cc.customer_name : '', endShort: ec?.short_name || null, contractShort: cc?.short_name || null });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="quotation-${order.order_id}-R${round.round_no}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    doc.on('error', next);
    doc.pipe(res);
  } catch (err) {
    next(err);
  }
});

router.post('/:orderId/quotations/:roundId/pdf', (req, res) => {
  const db = getDb();
  const order = loadOrder(db, req.params.orderId);
  if (!order) return notFound(res);
  const round = db.prepare('SELECT * FROM quotations WHERE id = ? AND order_id = ?').get(Number(req.params.roundId), order.id);
  if (!round) return notFound(res);
  const filename = `quotation-${order.order_id}-R${round.round_no}.pdf`;
  return res.json({ url: `/api/orders/${order.id}/quotations/${round.id}/pdf`, filename });
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
  writeAudit(db, {
    userId: req.user.id,
    action: 'other',
    entityType: 'order',
    entityId: order.id,
    detail: { event: 'delete_quotation_item', quotation_id: round.id, item_id: Number(req.params.itemId) }
  });
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

router.delete('/:orderId/quotations/:roundId', (req, res) => {
  const db = getDb();
  const order = loadOrder(db, req.params.orderId);
  if (!order) return notFound(res);
  const round = db.prepare('SELECT * FROM quotations WHERE id = ? AND order_id = ?').get(Number(req.params.roundId), order.id);
  if (!round) return notFound(res);
  if (order.status !== 'quotation') return badRequest(res, '仅报价阶段可删除报价轮次');
  if (round.status !== 'draft') return badRequest(res, '已提交轮次不可删除');
  if (Number(order.selected_round_id) === round.id) return badRequest(res, '该轮次为审批选中轮次，不可删除');
  const referenced = db.prepare('SELECT id FROM approval_records WHERE quotation_id = ? LIMIT 1').get(round.id);
  if (referenced) return badRequest(res, '该轮次已有审批记录，不可删除');
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM quotation_items WHERE quotation_id = ?').run(round.id);
    db.prepare('DELETE FROM quotations WHERE id = ?').run(round.id);
  });
  tx();
  writeAudit(getDb(), {
    userId: req.user.id,
    action: 'other',
    entityType: 'order',
    entityId: order.id,
    detail: { event: 'delete_quotation_round', round_id: round.id, round_no: round.round_no }
  });
  return res.json({ message: '报价轮次已删除' });
});

function insertBulkItems(db, order, roundId, materialNos) {
  const insert = db.prepare(
    `INSERT INTO quotation_items (quotation_id, material_no, description, material_type, price_source, unit_price_ex_vat,
      pay_percent, final_unit_price, qty, line_amount, unit, remark) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  const created = [];
  const tx = db.transaction((nos) => {
    for (const materialNo of nos) {
      const price = resolvePrice(order, materialNo, 'standard');
      const finalPrice = price.unit_price_ex_vat == null ? null : round4(Number(price.unit_price_ex_vat));
      const lineAmount = finalPrice == null ? null : round2(finalPrice * 1);
      const info = insert.run(
        roundId,
        materialNo,
        price.description,
        'standard',
        price.price_source,
        price.unit_price_ex_vat,
        100,
        finalPrice,
        1,
        lineAmount,
        'pcs',
        null
      );
      created.push({ id: info.lastInsertRowid, material_no: materialNo, price_source: price.price_source, unit_price_ex_vat: price.unit_price_ex_vat, description: price.description });
    }
  });
  tx(materialNos);
  return created;
}

router.post('/:orderId/quotations/:roundId/items/import', upload.single('file'), (req, res) => {
  if (!req.file) return badRequest(res, '请上传 Excel 文件');
  const db = getDb();
  const order = loadOrder(db, req.params.orderId);
  if (!order) {
    fs.unlinkSync(req.file.path);
    return notFound(res);
  }
  const round = db.prepare('SELECT * FROM quotations WHERE id = ? AND order_id = ?').get(Number(req.params.roundId), order.id);
  if (!round) {
    fs.unlinkSync(req.file.path);
    return notFound(res);
  }
  if (!canEditItems(order, round)) {
    fs.unlinkSync(req.file.path);
    return badRequest(res, '当前报价轮次已锁定，不可导入');
  }
  let rows;
  try {
    const workbook = xlsx.read(fs.readFileSync(req.file.path), { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  } catch {
    fs.unlinkSync(req.file.path);
    return badRequest(res, 'Excel 解析失败');
  }
  fs.unlinkSync(req.file.path);
  if (!rows || rows.length < 2) return badRequest(res, 'Excel 无有效数据');

  const headers = rows[0] || [];
  const materialIdx = headerIndex(headers, '物料号', 'material_no', 'material no');
  const dataStart = materialIdx >= 0 ? 1 : 0;
  const materialCol = materialIdx >= 0 ? materialIdx : 0;
  const materialNos = [];
  const failures = [];
  let success = 0;
  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i] || [];
    if (row.every((value) => value === null || value === undefined || value === '')) continue;
    const materialNo = cell(row, materialCol);
    if (materialNo === null || String(materialNo).trim() === '') {
      failures.push({ row: i + 1, reason: '物料号无效' });
      continue;
    }
    materialNos.push(String(materialNo).trim());
  }
  const created = insertBulkItems(db, order, round.id, materialNos);
  success = created.length;
  recomputeTotal(db, round.id);
  const log = db
    .prepare('INSERT INTO import_logs (target_type, file_name, total_rows, success_rows, fail_rows, created_at) VALUES (?,?,?,?,?,?)')
    .run('quotation_item', req.file.originalname, rows.length - 1, success, failures.length, nowUtc());
  writeAudit(db, {
    userId: req.user.id,
    action: 'other',
    entityType: 'order',
    entityId: order.id,
    detail: { event: 'quotation_items_import', import_log_id: log.lastInsertRowid, success, fail: failures.length }
  });
  return res.json({ import_log_id: log.lastInsertRowid, success_rows: success, fail_rows: failures.length, failures: failures.slice(0, 50) });
});

router.post('/:orderId/quotations/:roundId/items/bulk', (req, res) => {
  const db = getDb();
  const order = loadOrder(db, req.params.orderId);
  if (!order) return notFound(res);
  const round = db.prepare('SELECT * FROM quotations WHERE id = ? AND order_id = ?').get(Number(req.params.roundId), order.id);
  if (!round) return notFound(res);
  if (!canEditItems(order, round)) return badRequest(res, '当前报价轮次已锁定，不可粘贴录入');
  const materialNos = Array.isArray((req.body || {}).material_nos)
    ? (req.body || {}).material_nos.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  if (materialNos.length === 0) return badRequest(res, '请至少提供一个物料号');
  const created = insertBulkItems(db, order, round.id, materialNos);
  const total = recomputeTotal(db, round.id);
  return res.status(201).json({ created: created.length, total_amount: total, items: created });
});

router.post('/:orderId/quotations/:roundId/sync-from-proposal', (req, res) => {
  const db = getDb();
  const order = loadOrder(db, req.params.orderId);
  if (!order) return notFound(res);
  const round = db.prepare('SELECT * FROM quotations WHERE id = ? AND order_id = ?').get(Number(req.params.roundId), order.id);
  if (!round) return notFound(res);
  if (!canEditItems(order, round)) return badRequest(res, '当前报价轮次已锁定，不可同步');
  if (Number(order.proposal_skipped) === 1) return badRequest(res, '方案已跳过，禁用「从方案同步」');
  const version = (req.body || {}).version_id
    ? db.prepare('SELECT * FROM proposal_versions WHERE id = ? AND order_id = ?').get(Number((req.body || {}).version_id), order.id)
    : db.prepare('SELECT * FROM proposal_versions WHERE order_id = ? ORDER BY sort_order DESC, id DESC LIMIT 1').get(order.id);
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
      const materialType = selection.material_type === 'non_standard' ? 'non_standard' : 'standard';
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
      const description = materialType === 'non_standard' ? selection.description || null : price.description || null;
      insert.run(
        round.id,
        selection.material_no,
        description,
        materialType,
        price.price_source,
        unitPrice,
        payPercent,
        finalPrice,
        Number(selection.qty),
        lineAmount,
        'pcs',
        null
      );
    }
  });
  tx();
  const total = recomputeTotal(db, round.id);
  const items = db.prepare('SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY id').all(round.id);
  return res.json({ items, total_amount: total, message: '已从最新方案版本同步明细' });
});

export default router;
export { resolvePrice, createRound, recomputeTotal, buildQuotationPdf };
