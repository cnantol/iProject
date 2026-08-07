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
