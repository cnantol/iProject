const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidYmd(y, m, d) {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function normalizeDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  if (/^\d{8}$/.test(text)) {
    const y = Number(text.slice(0, 4));
    const m = Number(text.slice(4, 6));
    const d = Number(text.slice(6, 8));
    return isValidYmd(y, m, d) ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}` : null;
  }
  const flex = text.match(/^(\d{4})[年./-](\d{1,2})[月./-]?(\d{1,2})日?$/);
  if (flex) {
    const y = Number(flex[1]);
    const m = Number(flex[2]);
    const d = Number(flex[3]);
    return isValidYmd(y, m, d) ? `${flex[1]}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
  }
  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
      const ms = Math.round((serial - 25569) * 86400000);
      const date = new Date(ms);
      if (!Number.isNaN(date.getTime())) {
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
      }
    }
  }
  return null;
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

export function conflict(res, message = '销售机会状态已变更，请刷新') {
  return res.status(409).json({ error: message });
}

export function pick(obj, keys) {
  const out = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) out[key] = obj[key];
  }
  return out;
}

export function headerIndex(headers, ...names) {
  const map = new Map(headers.map((h, i) => [String(h == null ? '' : h).trim().toLowerCase(), i]));
  for (const name of names) {
    const idx = map.get(String(name).trim().toLowerCase());
    if (idx !== undefined) return idx;
  }
  return -1;
}

export function cell(row, idx) {
  if (idx < 0 || !row) return null;
  const value = row[idx];
  return value === undefined ? null : value;
}
