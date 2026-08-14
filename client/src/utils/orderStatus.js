// 全站共享的商机状态枚举。
// 与 server 端 orders.status 枚举严格保持一致；改一处要同步另一处。
// 已结束状态（closed/lost_closed/cancelled）共享同一个 STEP_KEY_INDEX 槽位 8。

export const ORDER_STATUS = Object.freeze({
  CUSTOMER_INFO: 'customer_info',
  PROPOSAL: 'proposal',
  QUOTATION: 'quotation',
  APPROVAL_PENDING: 'approval_pending',
  BID_DECISION: 'bid_decision',
  FINANCE: 'finance',
  SHIPPING_INVOICING: 'shipping_invoicing',
  COMMISSION: 'commission',
  CLOSED: 'closed',
  LOST_CLOSED: 'lost_closed',
  CANCELLED: 'cancelled'
});

// UI 步骤栏用的顺序索引：cancelled 与 closed/lost_closed 共享 8（已结束）
export const STEP_KEY_INDEX = {
  [ORDER_STATUS.CUSTOMER_INFO]: 0,
  [ORDER_STATUS.PROPOSAL]: 1,
  [ORDER_STATUS.QUOTATION]: 2,
  [ORDER_STATUS.APPROVAL_PENDING]: 3,
  [ORDER_STATUS.BID_DECISION]: 4,
  [ORDER_STATUS.FINANCE]: 5,
  [ORDER_STATUS.SHIPPING_INVOICING]: 6,
  [ORDER_STATUS.COMMISSION]: 7,
  [ORDER_STATUS.CLOSED]: 8,
  [ORDER_STATUS.LOST_CLOSED]: 8,
  [ORDER_STATUS.CANCELLED]: 8
};

export const CLOSED_STATUSES = [ORDER_STATUS.CLOSED, ORDER_STATUS.LOST_CLOSED, ORDER_STATUS.CANCELLED];

export const isClosedStatus = (status) => CLOSED_STATUSES.includes(status);
