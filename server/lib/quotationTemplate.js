import fs from 'node:fs';
import path from 'node:path';
import { getDb, getDataDir } from '../db/init.js';
import { todayLocal, nowUtc } from '../utils.js';

const TEMPLATE_FILE = 'quotation-template.json';
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const ALIGNS = ['left', 'center', 'right'];

export const INFO_FIELD_KEYS = [
  'quoteNo',
  'quoteDate',
  'orderId',
  'projectName',
  'endCustomer',
  'contractCustomer',
  'salesOrder',
  'paymentTerms',
  'contactInfo'
];

export const COLUMN_FIELD_KEYS = [
  'materialNo',
  'description',
  'type',
  'priceSource',
  'unitPrice',
  'payPercent',
  'finalPrice',
  'qty',
  'unit',
  'lineAmount',
  'remark'
];

export const DEFAULT_LABELS_ZH = {
  quoteTitle: '报价单',
  quoteDate: '报价日期',
  quoteNo: '报价单编号',
  orderId: 'ID',
  projectName: '项目名称',
  endCustomer: '最终客户',
  contractCustomer: '合同客户',
  contactInfo: '联系方式',
  salesOrder: 'Sales Order',
  paymentTerms: '付款条款',
  detailTitle: '报价明细',
  total: '合计（未税）',
  materialNo: '物料号',
  description: '描述',
  type: '类型',
  priceSource: '价格来源',
  unitPrice: '未税单价',
  payPercent: '实付比例',
  finalPrice: '最终单价',
  qty: '数量',
  unit: '单位',
  lineAmount: '行金额',
  remark: '备注',
  customerSign: '客户确认',
  supplierSign: '供应商盖章',
  terms: '说明条款',
  page: '第 {page} 页 / 共 {pages} 页'
};

export const DEFAULT_LABELS_EN = {
  quoteTitle: 'Quotation',
  quoteDate: 'Quotation Date',
  quoteNo: 'Quotation No.',
  orderId: 'Order ID',
  projectName: 'Project Name',
  endCustomer: 'End Customer',
  contractCustomer: 'Contract Customer',
  contactInfo: 'Contact',
  salesOrder: 'Sales Order',
  paymentTerms: 'Payment Terms',
  detailTitle: 'Quotation Details',
  total: 'Total (Excl. VAT)',
  materialNo: 'Material No.',
  description: 'Description',
  type: 'Type',
  priceSource: 'Price Source',
  unitPrice: 'Unit Price',
  payPercent: 'Pay %',
  finalPrice: 'Final Price',
  qty: 'Qty',
  unit: 'Unit',
  lineAmount: 'Line Amount',
  remark: 'Remark',
  customerSign: 'Customer Confirmation',
  supplierSign: 'Supplier Stamp',
  terms: 'Terms',
  page: 'Page {page} of {pages}'
};

export const DEFAULT_TEMPLATE = {
  version: 1,
  name: '默认报价单模板',
  page: { size: 'A4', orientation: 'portrait', margin: 48 },
  company: { name: 'iProject', address: '', phone: '', email: '' },
  palette: {
    primary: '#004E9A',
    secondary: '#DCE8F5',
    accent: '#ED6C02',
    text: '#1F2937',
    muted: '#6B7280',
    border: '#DDE7F3',
    rowAlt: '#F7FAFD',
    tableHeaderBg: '#004E9A',
    tableHeaderText: '#FFFFFF',
    totalBg: '#F0F7FF'
  },
  typography: {
    fontFamily: 'sans',
    fontFile: '',
    titleSize: 20,
    bodySize: 10,
    tableHeaderSize: 9,
    tableBodySize: 9
  },
  layout: {
    headerText: '',
    headerAlignment: 'center',
    logo: { data: null, position: 'center', width: 140 },
    title: '报价单',
    titleAlignment: 'center',
    infoAlignment: 'center',
    footerText: '',
    footerAlignment: 'center',
    showPageNumbers: true,
    quoteDate: '',
    showSignature: true
  },
  language: 'zh',
  quoteNoTemplate: 'Q-{customerShort}-{date}-R{round}',
  labels: { zh: DEFAULT_LABELS_ZH, en: DEFAULT_LABELS_EN },
  infoFields: INFO_FIELD_KEYS.map((key, index) => ({
    key,
    enabled: !['salesOrder', 'paymentTerms'].includes(key),
    order: index + 1
  })),
  columnFields: [
    { key: 'materialNo', enabled: true, order: 1, width: 90, align: 'left' },
    { key: 'description', enabled: true, order: 2, width: 200, align: 'left' },
    { key: 'type', enabled: false, order: 3, width: 60, align: 'center' },
    { key: 'priceSource', enabled: false, order: 4, width: 70, align: 'left' },
    { key: 'unitPrice', enabled: true, order: 5, width: 80, align: 'right' },
    { key: 'payPercent', enabled: false, order: 6, width: 60, align: 'right' },
    { key: 'finalPrice', enabled: false, order: 7, width: 80, align: 'right' },
    { key: 'qty', enabled: true, order: 8, width: 60, align: 'right' },
    { key: 'unit', enabled: true, order: 9, width: 50, align: 'center' },
    { key: 'lineAmount', enabled: true, order: 10, width: 90, align: 'right' },
    { key: 'remark', enabled: false, order: 11, width: 100, align: 'left' }
  ],
  summary: {
    showTotal: true,
    totalLabel: '',
    showTerms: true,
    terms: '',
    showSignature: true,
    customerSignLabel: '',
    supplierSignLabel: ''
  }
};

function asString(value, fallback, maxLength = 200) {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function asNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function asBool(value, fallback = false) {
  return value === true || value === 1 || value === '1' ? true : fallback;
}

function asColor(value, fallback) {
  return COLOR_RE.test(String(value || '')) ? String(value) : fallback;
}

function asAlign(value, fallback) {
  return ALIGNS.includes(value) ? value : fallback;
}

function asLogo(value) {
  if (!value || typeof value !== 'string' || !/^data:image\/(png|jpeg|jpg);base64,/i.test(value)) return null;
  if (Buffer.byteLength(value, 'utf8') > 2_400_000) return null;
  return value;
}

function normalizeLabels(raw, language, defaults) {
  const merged = { ...defaults };
  const source = raw && typeof raw === 'object' ? raw[language] || raw : {};
  for (const key of Object.keys(defaults)) {
    if (source[key] !== undefined && source[key] !== null && String(source[key]).trim() !== '') {
      merged[key] = String(source[key]).trim().slice(0, 80);
    }
  }
  return merged;
}

function normalizeFieldList(rawList, allowedKeys, isColumn) {
  if (!Array.isArray(rawList)) return [];
  const seen = new Set();
  const result = [];
  rawList.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const key = String(item.key || '');
    const isCustomInfo = !isColumn && /^custom:\d+$/.test(key);
    if (!isColumn && !allowedKeys.has(key) && !isCustomInfo) return;
    if (isColumn && !allowedKeys.has(key)) return;
    if (seen.has(key)) return;
    seen.add(key);
    const entry = {
      key,
      enabled: asBool(item.enabled, true),
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : index + 1
    };
    if (isColumn) {
      entry.width = asNumber(item.width, 40, 300, 80);
      entry.align = asAlign(item.align, 'left');
    }
    if (isCustomInfo) {
      entry.fieldId = Number(key.split(':')[1]);
    }
    result.push(entry);
  });
  return result.sort((a, b) => a.order - b.order);
}

function mergeTemplateList(defaults, rawList, allowedKeys, isColumn) {
  const merged = normalizeFieldList(rawList, allowedKeys, isColumn);
  const seen = new Set(merged.map((item) => item.key));
  for (const item of defaults) {
    if (!seen.has(item.key)) merged.push(item);
  }
  return merged.sort((a, b) => a.order - b.order);
}

export function normalizeTemplate(raw = {}) {
  const d = DEFAULT_TEMPLATE;
  const page = raw.page && typeof raw.page === 'object' ? raw.page : {};
  const palette = raw.palette && typeof raw.palette === 'object' ? raw.palette : {};
  const typography = raw.typography && typeof raw.typography === 'object' ? raw.typography : {};
  const layout = raw.layout && typeof raw.layout === 'object' ? raw.layout : {};
  const logo = layout.logo && typeof layout.logo === 'object' ? layout.logo : {};
  const summary = raw.summary && typeof raw.summary === 'object' ? raw.summary : {};
  const language = ['zh', 'en'].includes(String(raw.language)) ? String(raw.language) : d.language;

  return {
    version: 1,
    name: asString(raw.name, d.name, 80),
    page: {
      size: 'A4',
      orientation: ['portrait', 'landscape'].includes(page.orientation) ? page.orientation : d.page.orientation,
      margin: asNumber(page.margin, 24, 72, d.page.margin)
    },
    company: {
      name: asString(raw.company?.name, d.company.name, 80),
      address: asString(raw.company?.address, '', 200),
      phone: asString(raw.company?.phone, '', 60),
      email: asString(raw.company?.email, '', 120)
    },
    palette: {
      primary: asColor(palette.primary, d.palette.primary),
      secondary: asColor(palette.secondary, d.palette.secondary),
      accent: asColor(palette.accent, d.palette.accent),
      text: asColor(palette.text, d.palette.text),
      muted: asColor(palette.muted, d.palette.muted),
      border: asColor(palette.border, d.palette.border),
      rowAlt: asColor(palette.rowAlt, d.palette.rowAlt),
      tableHeaderBg: asColor(palette.tableHeaderBg, d.palette.tableHeaderBg),
      tableHeaderText: asColor(palette.tableHeaderText, d.palette.tableHeaderText),
      totalBg: asColor(palette.totalBg, d.palette.totalBg)
    },
    typography: {
      fontFamily: ['sans', 'serif', 'mono', 'custom'].includes(typography.fontFamily) ? typography.fontFamily : d.typography.fontFamily,
      fontFile: asString(typography.fontFile, '', 120),
      titleSize: asNumber(typography.titleSize, 12, 40, d.typography.titleSize),
      bodySize: asNumber(typography.bodySize, 7, 16, d.typography.bodySize),
      tableHeaderSize: asNumber(typography.tableHeaderSize, 6, 14, d.typography.tableHeaderSize),
      tableBodySize: asNumber(typography.tableBodySize, 6, 14, d.typography.tableBodySize)
    },
    layout: {
      headerText: asString(layout.headerText, '', 300),
      headerAlignment: asAlign(layout.headerAlignment, d.layout.headerAlignment),
      logo: {
        data: asLogo(logo.data ?? d.layout.logo.data),
        position: ['left', 'center', 'right'].includes(logo.position) ? logo.position : d.layout.logo.position,
        width: asNumber(logo.width, 60, 300, d.layout.logo.width)
      },
      title: asString(layout.title, d.layout.title, 80),
      titleAlignment: asAlign(layout.titleAlignment, d.layout.titleAlignment),
      infoAlignment: asAlign(layout.infoAlignment, d.layout.infoAlignment),
      footerText: asString(layout.footerText, '', 300),
      footerAlignment: asAlign(layout.footerAlignment, d.layout.footerAlignment),
      showPageNumbers: asBool(layout.showPageNumbers, d.layout.showPageNumbers),
      quoteDate: /^\d{4}-\d{2}-\d{2}$/.test(String(layout.quoteDate || '')) ? String(layout.quoteDate) : '',
      showSignature: asBool(layout.showSignature, d.layout.showSignature)
    },
    language,
    quoteNoTemplate: asString(raw.quoteNoTemplate, d.quoteNoTemplate, 200),
    labels: {
      zh: normalizeLabels(raw.labels, 'zh', DEFAULT_LABELS_ZH),
      en: normalizeLabels(raw.labels, 'en', DEFAULT_LABELS_EN)
    },
    infoFields: mergeTemplateList(d.infoFields, raw.infoFields, new Set(INFO_FIELD_KEYS), false),
    columnFields: mergeTemplateList(d.columnFields, raw.columnFields, new Set(COLUMN_FIELD_KEYS), true),
    summary: {
      showTotal: asBool(summary.showTotal, d.summary.showTotal),
      totalLabel: asString(summary.totalLabel, '', 80),
      showTerms: asBool(summary.showTerms, d.summary.showTerms),
      terms: asString(summary.terms, '', 1000),
      showSignature: asBool(summary.showSignature, d.summary.showSignature),
      customerSignLabel: asString(summary.customerSignLabel, '', 80),
      supplierSignLabel: asString(summary.supplierSignLabel, '', 80)
    }
  };
}

export function defaultTemplate() {
  return normalizeTemplate({});
}

export function templateFilePath() {
  return path.join(getDataDir(), TEMPLATE_FILE);
}

export function readTemplate() {
  try {
    return normalizeTemplate(JSON.parse(fs.readFileSync(templateFilePath(), 'utf8')));
  } catch {
    return defaultTemplate();
  }
}

export function writeTemplate(template) {
  const normalized = normalizeTemplate(template);
  fs.writeFileSync(templateFilePath(), JSON.stringify(normalized, null, 2));
  return normalized;
}

export function listFieldCatalog() {
  const db = getDb();
  const customFields = db
    .prepare("SELECT id, field_name FROM custom_fields WHERE entity_type = 'order' ORDER BY sort_order, id")
    .all();
  return {
    infoFields: INFO_FIELD_KEYS.map((key) => ({ key, custom: false })),
    columnFields: COLUMN_FIELD_KEYS.map((key) => ({ key, custom: false })),
    customFields: customFields.map((row) => ({ key: `custom:${row.id}`, fieldId: row.id, fieldName: row.field_name }))
  };
}

function resolveQuoteNo(db, order, round, template, customerNames) {
  const templateText = String(template.quoteNoTemplate || '').trim();
  const datePart = todayLocal().replace(/-/g, '');
  const customerShort = customerNames.endShort || customerNames.contractShort || '';
  const values = {
    customerShort,
    contractShort: customerNames.contractShort || '',
    date: datePart,
    round: `R${round.round_no}`,
    orderId: order.order_id || ''
  };
  const base = templateText
    ? templateText.replace(/\{(customerShort|contractShort|date|round|orderId)\}/g, (_, key) => values[key]).trim()
    : customerShort
      ? `Q-${customerShort}-${datePart}-R${round.round_no}`
      : `Q-${datePart}-R${round.round_no}`;
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

function customFieldValues(db, orderId) {
  const rows = db
    .prepare(
      `SELECT ocf.field_id, ocf.field_value FROM order_custom_fields ocf
       JOIN custom_fields cf ON cf.id = ocf.field_id
       WHERE ocf.order_id = ?`
    )
    .all(orderId);
  const map = {};
  for (const row of rows) map[row.field_id] = row.field_value;
  return map;
}

const PRICE_SOURCE_LABELS = { framework: '框架协议价', guide_price: '指导价', manual: '手工录入' };

export function buildRenderContext(db, order, round, items, customerNames, templateOverride = null) {
  const template = templateOverride ? normalizeTemplate(templateOverride) : readTemplate();
  const labels = template.language === 'en' ? template.labels.en : template.labels.zh;
  const customValues = customFieldValues(db, order.id);
  const infoFields = template.infoFields
    .filter((field) => field.enabled)
    .map((field) => {
      let value = '';
      switch (field.key) {
        case 'quoteNo':
          value = resolveQuoteNo(db, order, round, template, customerNames);
          break;
        case 'quoteDate':
          value = template.layout.quoteDate || todayLocal();
          break;
        case 'orderId':
          value = order.order_id || '';
          break;
        case 'projectName':
          value = order.project_name || '';
          break;
        case 'endCustomer':
          value = customerNames.end || '';
          break;
        case 'contractCustomer':
          value = customerNames.contract || '';
          break;
        case 'salesOrder':
          value = order.sales_order || '';
          break;
        case 'paymentTerms':
          value = order.payment_terms || '';
          break;
        case 'contactInfo':
          value = [template.company.address, template.company.phone, template.company.email].filter(Boolean).join('    ');
          break;
        default: {
          if (/^custom:\d+$/.test(field.key)) {
            value = customValues[field.fieldId] ?? '';
          }
        }
      }
      return { key: field.key, label: labels[field.key] || field.key, value: String(value) };
    });

  const columns = template.columnFields
    .filter((field) => field.enabled)
    .map((field) => ({ key: field.key, label: labels[field.key] || field.key, width: field.width, align: field.align }));

  return {
    template,
    labels,
    infoFields,
    columns,
    items: items.map((item) => ({
      materialNo: item.material_no || '',
      description: item.description || '',
      type: item.material_type === 'non_standard' ? (template.language === 'en' ? 'Non-std' : '非标') : template.language === 'en' ? 'Std' : '标准',
      priceSource: PRICE_SOURCE_LABELS[item.price_source] || item.price_source || '',
      unitPrice: item.unit_price_ex_vat,
      payPercent: item.pay_percent,
      finalPrice: item.final_unit_price,
      qty: item.qty,
      unit: item.unit || 'pcs',
      lineAmount: item.line_amount,
      remark: item.remark || ''
    })),
    total: round.total_amount,
    quoteNo: resolveQuoteNo(db, order, round, template, customerNames)
  };
}

export function buildSampleContext(templateOverride = null) {
  const template = templateOverride ? normalizeTemplate(templateOverride) : defaultTemplate();
  const sampleOrder = {
    id: 1,
    order_id: '0001',
    project_name: '示例项目（测试）',
    sales_order: 'SO-2026-0001',
    payment_terms: 'TT60'
  };
  const sampleRound = { id: 1, round_no: 1, total_amount: 128500.5 };
  const sampleItems = [
    {
      material_no: 'AC-1001',
      description: '压缩机组示例，用于项目主设备报价',
      material_type: 'standard',
      price_source: 'guide_price',
      unit_price_ex_vat: 128500.5,
      pay_percent: 100,
      final_unit_price: 128500.5,
      qty: 1,
      unit: 'pcs',
      line_amount: 128500.5,
      remark: ''
    },
    {
      material_no: 'AC-1002',
      description: '备件套件示例',
      material_type: 'non_standard',
      price_source: 'manual',
      unit_price_ex_vat: 8600,
      pay_percent: 100,
      final_unit_price: 8600,
      qty: 2,
      unit: 'set',
      line_amount: 17200,
      remark: '含安装指导'
    }
  ];
  const customerNames = { end: '示例最终客户', contract: '示例合同客户', endShort: 'AC', contractShort: null };
  const db = getDb();
  return buildRenderContext(db, sampleOrder, sampleRound, sampleItems, customerNames, template);
}
