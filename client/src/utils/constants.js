export const STATUS_LABELS = {
  customer_info: '客户信息',
  proposal: '方案阶段',
  quotation: '报价阶段',
  approval_pending: '并行审批',
  bid_decision: '中标结果',
  finance: '财务信息',
  shipping_invoicing: '发货+开票',
  commission: '佣金结算',
  closed: '已闭环',
  lost_closed: '未中标关闭',
  cancelled: '合同取消'
};

export const STATUS_COLORS = {
  customer_info: '#1976D2',
  proposal: '#7B1FA2',
  quotation: '#00897B',
  approval_pending: '#F57C00',
  bid_decision: '#5D4037',
  finance: '#455A64',
  shipping_invoicing: '#0288D1',
  commission: '#6D4C41',
  closed: '#2E7D32',
  lost_closed: '#B71C1C',
  cancelled: '#78909C'
};

export const STEP_ORDER = [
  { key: 'customer_info', label: '客户信息' },
  { key: 'proposal', label: '方案阶段' },
  { key: 'quotation', label: '报价阶段' },
  { key: 'approval_pending', label: '并行审批' },
  { key: 'bid_decision', label: '中标结果' },
  { key: 'finance', label: '财务信息' },
  { key: 'shipping_invoicing', label: '发货+开票' },
  { key: 'commission', label: '佣金结算' },
  { key: 'closed', label: '项目闭环' }
];

export const PAYMENT_TERMS = ['COD', 'TT60', 'TT90', '3-6-1', 'Other'];

export const PRIORITY_LABELS = { low: '低', medium: '中', high: '高', urgent: '紧急' };
export const PRIORITY_COLORS = { low: '#78909C', medium: '#1976D2', high: '#F57C00', urgent: '#D32F2F' };

export const PRICE_SOURCE_LABELS = { framework: '框架协议价', guide_price: '指导价', manual: '手工录入' };
export const MATERIAL_TYPE_LABELS = { standard: '标准', non_standard: '非标' };

export const IMPORT_TARGET_LABELS = {
  end_customer: '最终客户导入',
  contract_customer: '合同客户导入',
  material: '框架协议价格导入',
  guide_price: '指导价导入',
  history: '历史销售机会导入'
};

export const ORDER_TYPES = ['A', 'B', 'C'];
