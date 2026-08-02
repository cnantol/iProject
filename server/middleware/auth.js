import jwt from 'jsonwebtoken';
import { getDb, getJwtSecret } from '../db/init.js';

export function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token ? String(req.query.token) : null;
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
