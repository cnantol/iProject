import fs from 'node:fs';
import { getUploadDir } from './db/init.js';
import path from 'node:path';

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

/**
 * 安全清理已上传到磁盘的文件(multer 临时文件或持久化文件均可)。
 * 在每个路由的「早返回」(res.json/res.send 之前)调用,防止孤儿文件堆积。
 * 清理失败(文件已删除/不存在)静默忽略,不阻塞主流程。
 * @param {Array<{ path: string }>} files
 * @returns {number} 成功删除的文件数
 */
export function cleanupUploadedFiles(files) {
  let removed = 0;
  for (const f of files) {
    if (!f?.path) continue;
    try {
      fs.unlinkSync(f.path);
      removed += 1;
    } catch {
      /* 已删除或不存在则忽略 */
    }
  }
  return removed;
}

/**
 * 附件的最终存储根目录。
 * 结构: <uploads>/<order_id>/<stage>/<filename>
 *   - order_id: 附件所属的销售机会 id
 *   - stage:    上传时标记的阶段 (customer_info/proposal/finance/invoicing)
 * 临时文件(multer 落地)仍落在 getUploadDir() 下,由 moveUploadedFile 搬到最终目录。
 */
export function getOrderAttachmentDir(orderId, stage) {
  return path.join(getUploadDir(), String(orderId), String(stage || 'common'));
}

/**
 * 生成最终存储路径(不写磁盘)。
 * 文件名保持原始名,避免重复(同名追加 -{n})。
 */
export function buildAttachmentPath(orderId, stage, originalName) {
  const dir = getOrderAttachmentDir(orderId, stage);
  const safeName = String(originalName || 'file').replace(/[^\w.\u4e00-\u9fa5-]/g, '_');
  const ext = path.extname(safeName);
  const base = path.basename(safeName, ext);
  let candidate = safeName;
  let n = 1;
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${base}-${n}${ext}`;
    n += 1;
  }
  return { dir, fileName: candidate, filePath: path.join(dir, candidate) };
}

/**
 * 将 multer 临时文件搬到最终目录。
 * 自动创建不存在的目录,清理临时源文件,返回最终路径。
 * @returns {{ dir: string, fileName: string, filePath: string, fileType: string }}
 */
export function moveUploadedFile(tempFile, orderId, stage) {
  const { dir, fileName, filePath } = buildAttachmentPath(orderId, stage, tempFile.originalname);
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.renameSync(tempFile.path, filePath);
  } catch (err) {
    // rename 跨设备可能失败,降级为 copy + unlink
    if (err?.code === 'EXDEV') {
      fs.copyFileSync(tempFile.path, filePath);
      cleanupUploadedFiles([{ path: tempFile.path }]);
    } else {
      cleanupUploadedFiles([{ path: tempFile.path }]);
      throw err;
    }
  }
  const ext = path.extname(fileName).slice(1).toLowerCase() || 'file';
  return { dir, fileName, filePath, fileType: ext };
}

/**
 * 根据附件 DB 记录定位物理文件路径。
 * 兼容旧版扁平存储(<uploads>/<file_path>)和新版分层存储(<uploads>/<order_id>/<stage>/<file_name>)。
 */
export function resolveAttachmentFilePath(row) {
  if (!row?.file_path) return null;
  if (path.isAbsolute(row.file_path)) return row.file_path;
  // 新版: file_path = "<order_id>/<stage>/<name>"
  const parts = row.file_path.split('/');
  if (parts.length >= 3) {
    return path.join(getUploadDir(), parts[0], parts[1], parts[2]);
  }
  // 旧版兼容: file_path 直接是文件名
  return path.join(getUploadDir(), row.file_path);
}
