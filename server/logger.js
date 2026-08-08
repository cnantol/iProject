// 轻量结构化日志器 — 不引入新依赖。
// 输出格式: ISO 时间 [LEVEL] [module] message { meta }
// 通过 LOG_LEVEL 环境变量控制 (debug|info|warn|error, 默认 info)。
// 异步上下文: 当前请求的 requestId 由 AsyncLocalStorage 注入(若已挂载),
// 自动附加到每条日志的 meta.requestId 字段。

import { AsyncLocalStorage } from 'node:async_hooks';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] || LEVELS.info;

const als = new AsyncLocalStorage();

function fmt(level, module, msg, meta) {
  const ts = new Date().toISOString();
  const ctx = als.getStore();
  const requestId = ctx?.requestId;
  const base = `${ts} [${level.toUpperCase()}] [${module}] ${msg}`;
  if (meta && requestId) return `${base} requestId=${requestId} ${JSON.stringify(meta)}`;
  if (meta) return `${base} ${JSON.stringify(meta)}`;
  if (requestId) return `${base} requestId=${requestId}`;
  return base;
}

function emit(level, module, msg, meta) {
  if (LEVELS[level] < threshold) return;
  const line = fmt(level, module, msg, meta);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (module, msg, meta) => emit('debug', module, msg, meta),
  info:  (module, msg, meta) => emit('info',  module, msg, meta),
  warn:  (module, msg, meta) => emit('warn',  module, msg, meta),
  error: (module, msg, meta) => emit('error', module, msg, meta)
};

// 在请求处理函数内调用 logger.runWithRequest({ requestId }, () => next())
// 这样后续所有 logger.* 输出都会带上 requestId。
export function runWithRequest(ctx, fn) {
  return als.run(ctx, fn);
}

export function currentRequestId() {
  return als.getStore()?.requestId;
}
