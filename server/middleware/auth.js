import jwt from 'jsonwebtoken';
import { getDb, getJwtSecret } from '../db/init.js';

export function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
  try {
    const payload = jwt.verify(token, getJwtSecret());
    if (payload.purpose) {
      // 用途隔离: 下载令牌(10 分钟)仅可用于下载类接口, 不得访问业务接口。
      // 下载路径放行后由路由内的 authenticateDownload 再校验用途。
      const isDownloadPath = /\/download$|\/pdf$|\/template$/.test(req.path);
      if (!isDownloadPath) {
        return res.status(403).json({ error: '下载令牌不能访问业务接口，请重新登录' });
      }
    }
    const user = getDb().prepare('SELECT id, username FROM users WHERE id = ?').get(payload.id);
    if (!user) {
      return res.status(401).json({ error: '登录已过期，请重新登录' });
    }
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

export function authenticateDownload(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: '下载令牌无效或已过期' });
  }
  try {
    const payload = jwt.verify(token, getJwtSecret());
    if (payload.purpose !== 'download') {
      return res.status(403).json({ error: '下载令牌用途无效' });
    }
    const user = getDb().prepare('SELECT id, username FROM users WHERE id = ?').get(payload.id);
    if (!user) {
      return res.status(401).json({ error: '下载令牌无效或已过期' });
    }
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: '下载令牌无效或已过期' });
  }
}
