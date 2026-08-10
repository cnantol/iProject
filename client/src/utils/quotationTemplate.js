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

export function createDefaultTemplate() {
  return {
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
    labels: { zh: { ...DEFAULT_LABELS_ZH }, en: { ...DEFAULT_LABELS_EN } },
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
}

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const ALIGNS = ['left', 'center', 'right'];

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function colorValue(value, fallback) {
  return COLOR_RE.test(String(value || '')) ? String(value) : fallback;
}

export function normalizeTemplate(raw) {
  const d = createDefaultTemplate();
  const source = raw && typeof raw === 'object' ? raw : {};
  const template = {
    ...d,
    ...source,
    page: { ...d.page, ...(source.page || {}) },
    company: { ...d.company, ...(source.company || {}) },
    palette: { ...d.palette, ...(source.palette || {}) },
    typography: { ...d.typography, ...(source.typography || {}) },
    layout: {
      ...d.layout,
      ...(source.layout || {}),
      logo: { ...d.layout.logo, ...((source.layout && source.layout.logo) || {}) }
    },
    labels: {
      zh: { ...d.labels.zh, ...((source.labels && source.labels.zh) || {}) },
      en: { ...d.labels.en, ...((source.labels && source.labels.en) || {}) }
    },
    summary: { ...d.summary, ...(source.summary || {}) }
  };
  template.page.margin = clampNumber(template.page.margin, 24, 72, d.page.margin);
  template.page.orientation = ['portrait', 'landscape'].includes(template.page.orientation) ? template.page.orientation : d.page.orientation;
  template.typography.fontFamily = ['sans', 'serif', 'mono', 'custom'].includes(template.typography.fontFamily)
    ? template.typography.fontFamily
    : d.typography.fontFamily;
  template.typography.titleSize = clampNumber(template.typography.titleSize, 12, 40, d.typography.titleSize);
  template.typography.bodySize = clampNumber(template.typography.bodySize, 7, 16, d.typography.bodySize);
  template.typography.tableHeaderSize = clampNumber(template.typography.tableHeaderSize, 6, 14, d.typography.tableHeaderSize);
  template.typography.tableBodySize = clampNumber(template.typography.tableBodySize, 6, 14, d.typography.tableBodySize);
  template.layout.logo.position = ['left', 'center', 'right'].includes(template.layout.logo.position)
    ? template.layout.logo.position
    : d.layout.logo.position;
  template.layout.logo.width = clampNumber(template.layout.logo.width, 60, 300, d.layout.logo.width);
  for (const key of Object.keys(template.palette)) {
    template.palette[key] = colorValue(template.palette[key], d.palette[key]);
  }
  template.language = ['zh', 'en'].includes(template.language) ? template.language : 'zh';

  const infoKeys = new Set(INFO_FIELD_KEYS);
  template.infoFields = mergeFields(d.infoFields, template.infoFields, infoKeys, false);
  template.columnFields = mergeFields(d.columnFields, template.columnFields, new Set(COLUMN_FIELD_KEYS), true);
  return template;
}

function mergeFields(defaults, rawList, allowedKeys, isColumn) {
  const list = Array.isArray(rawList) ? rawList : [];
  const seen = new Set();
  const merged = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const key = String(item.key || '');
    const isCustom = !isColumn && /^custom:\d+$/.test(key);
    if (!allowedKeys.has(key) && !isCustom) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = {
      key,
      enabled: item.enabled === true || item.enabled === 1 || item.enabled === '1' || item.enabled === undefined,
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : merged.length + 1
    };
    if (isColumn) {
      entry.width = clampNumber(item.width, 40, 300, 80);
      entry.align = ALIGNS.includes(item.align) ? item.align : 'left';
    }
    if (isCustom) entry.fieldId = Number(key.split(':')[1]);
    merged.push(entry);
  }
  for (const item of defaults) {
    if (!seen.has(item.key)) merged.push({ ...item });
  }
  return merged.sort((a, b) => a.order - b.order);
}

export const SAMPLE_DATA = {
  order: {
    order_id: '0001',
    project_name: '示例项目（测试）',
    sales_order: 'SO-2026-0001',
    payment_terms: 'TT60'
  },
  quoteNo: 'Q-AC-20260810-R1',
  date: '2026-08-10',
  customers: { end: '示例最终客户', contract: '示例合同客户' },
  items: [
    {
      materialNo: 'AC-1001',
      description: '压缩机组示例，用于项目主设备报价',
      type: '标准',
      priceSource: '指导价',
      unitPrice: 128500.5,
      payPercent: 100,
      finalPrice: 128500.5,
      qty: 1,
      unit: 'pcs',
      lineAmount: 128500.5,
      remark: ''
    },
    {
      materialNo: 'AC-1002',
      description: '备件套件示例',
      type: '非标',
      priceSource: '手工录入',
      unitPrice: 8600,
      payPercent: 100,
      finalPrice: 8600,
      qty: 2,
      unit: 'set',
      lineAmount: 17200,
      remark: '含安装指导'
    }
  ],
  total: 145700.5
};

export function formatMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
