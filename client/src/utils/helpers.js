import { STEP_KEY_INDEX, isClosedStatus } from './orderStatus.js';

export function fmtMoney(value, digits = 2) {
  if (value === null || value === undefined || value === '') return '-';
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return num.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// 图表坐标轴取整: 1/2/5 × 10^n 阶梯
export function niceAxisMax(value) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

// 金额紧凑显示: ≥1万 显示为 x.x万
export function compactYuan(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  if (Math.abs(num) >= 10000) return `${(num / 10000).toFixed(1)}万`;
  return fmtMoney(num);
}

// 平滑曲线路径(三次贝塞尔插值)
export function smoothLinePath(points) {
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

export function fmtSignedMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  if (round2(num) === 0) return '¥0.00';
  return `${num > 0 ? '+' : '-'}¥${fmtMoney(Math.abs(num))}`;
}

export function fmtSignedPercent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  if (round2(num) === 0) return '0.00%';
  return `${num > 0 ? '+' : ''}${num.toFixed(2)}%`;
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
