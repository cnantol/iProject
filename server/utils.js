const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

export function nowUtc() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export function todayLocal() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function isMoney(n) {
  return typeof n !== 'undefined' && n !== null && n !== '' && Number.isFinite(Number(n)) && Number(n) > 0;
}

export function isNonNegativeNumber(n) {
  return typeof n !== 'undefined' && n !== null && n !== '' && Number.isFinite(Number(n)) && Number(n) >= 0;
}

export function isBool(n) {
  return n === 0 || n === 1 || n === '0' || n === '1';
}

export function isQty(n) {
  return typeof n !== 'undefined' && n !== null && n !== '' && Number.isFinite(Number(n)) && Number(n) > 0;
}

export function isPct(n) {
  const num = Number(n);
  return Number.isFinite(num) && num > 0 && num <= 100;
}

export function normalizeSo(value) {
  return String(value == null ? '' : value).trim().toUpperCase();
}

export function writeAudit(db, { userId = null, action, entityType = null, entityId = null, detail = null }) {
  const stmt = db.prepare(
    'INSERT INTO audit_logs (user_id, action, entity_type, entity_id, detail, created_at) VALUES (?,?,?,?,?,?)'
  );
  const info = stmt.run(
    userId,
    action,
    entityType,
    entityId,
    detail == null ? null : JSON.stringify(detail),
    nowUtc()
  );
  return info.lastInsertRowid;
}

export function badRequest(res, message) {
  return res.status(400).json({ error: message });
}

export function notFound(res, message = '资源不存在') {
  return res.status(404).json({ error: message });
}

export function conflict(res, message = '订单状态已变更，请刷新') {
  return res.status(409).json({ error: message });
}

export function pick(obj, keys) {
  const out = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) out[key] = obj[key];
  }
  return out;
}
