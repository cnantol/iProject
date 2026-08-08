import { STEP_KEY_INDEX, isClosedStatus } from './orderStatus.js';
export { ORDER_STATUS, CLOSED_STATUSES, isClosedStatus } from './orderStatus.js';

export function fmtMoney(value, digits = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return num.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function round2(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function round4(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 10000) / 10000;
}

export function fmtDateTime(value) {
  if (!value) return '-';
  const date = new Date(String(value).includes('T') ? value : `${String(value).replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

export function fmtDate(value) {
  if (!value) return '-';
  return String(value).slice(0, 10);
}

export function todayStr() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export function daysSinceDate(dateStr) {
  if (!dateStr) return null;
  const target = String(dateStr).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) return null;
  const diff = new Date(`${todayStr()}T00:00:00+08:00`) - new Date(`${target}T00:00:00+08:00`);
  return Math.max(0, Math.floor(diff / 86400000));
}

export function isStepReadOnly(order, stepKey) {
  if (!order) return true;
  if (isClosedStatus(order.status)) return true;
  if (order.status === 'shipping_invoicing') {
    if (stepKey === 'shipping' || stepKey === 'invoicing') return false;
    const doneSteps = ['customer_info', 'proposal', 'quotation', 'approval_pending', 'bid_decision', 'finance'];
    if (doneSteps.includes(stepKey)) return true;
    if (stepKey === 'commission' || stepKey === 'closed') return true;
    return false;
  }
  const currentIdx = STEP_KEY_INDEX[order.status];
  if (currentIdx == null) return true;
  const stepIdx = STEP_KEY_INDEX[stepKey];
  if (stepIdx == null) return true;
  if (stepIdx < currentIdx) return true;
  if (stepIdx > currentIdx + 1) return true;
  return false;
}

export function overdueDays(dueDate) {
  if (!dueDate) return 0;
  const today = todayStr();
  if (dueDate >= today) return 0;
  const diff = new Date(`${today}T00:00:00+08:00`) - new Date(`${dueDate}T00:00:00+08:00`);
  return Math.floor(diff / 86400000);
}

export function canAdvance(order) {
  if (!order) return false;
  return ['customer_info', 'proposal', 'finance'].includes(order.status);
}
