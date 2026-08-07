import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getDb, getJwtSecret, rotateJwtSecret } from '../db/init.js';
import { authenticate } from '../middleware/auth.js';
import { nowUtc, badRequest, writeAudit } from '../utils.js';

const router = Router();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

function loginAttemptKey(req, username) {
  return `${req.ip || req.socket.remoteAddress || 'unknown'}:${String(username || '').trim().toLowerCase()}`;
}

function cleanupLoginAttempts(db, now) {
  db.prepare('DELETE FROM login_attempts WHERE lock_until IS NOT NULL AND lock_until < ?').run(now - LOGIN_LOCK_MS);
}

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return badRequest(res, '请输入用户名和密码');
  const db = getDb();
  const now = Date.now();
  cleanupLoginAttempts(db, now);
  const key = loginAttemptKey(req, username);
  const attempt = db.prepare('SELECT fail_count, lock_until FROM login_attempts WHERE lock_key = ?').get(key);
  if (attempt && Number(attempt.lock_until) > now) {
    return res.status(429).json({ error: '尝试次数过多，请 15 分钟后再试' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username).trim());
  if (!user || !bcrypt.compareSync(String(password), user.password)) {
    const count = Number(attempt ? attempt.fail_count : 0) + 1;
    const lockUntil = count >= MAX_LOGIN_ATTEMPTS ? now + LOGIN_LOCK_MS : null;
    db.prepare(
      `INSERT INTO login_attempts (lock_key, fail_count, lock_until, updated_at) VALUES (?,?,?,?)
       ON CONFLICT(lock_key) DO UPDATE SET fail_count = excluded.fail_count, lock_until = excluded.lock_until, updated_at = excluded.updated_at`
    ).run(key, count, lockUntil, nowUtc());
    if (lockUntil) return res.status(429).json({ error: '尝试次数过多，请 15 分钟后再试' });
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  db.prepare('DELETE FROM login_attempts WHERE lock_key = ?').run(key);
  const token = jwt.sign({ id: user.id, username: user.username }, getJwtSecret(), { expiresIn: '7d' });
  return res.json({ token, user: { id: user.id, username: user.username } });
});

router.get('/me', authenticate, (req, res) => {
  return res.json({ user: req.user });
});

router.post('/download-token', authenticate, (req, res) => {
  const token = jwt.sign({ id: req.user.id, purpose: 'download' }, getJwtSecret(), { expiresIn: '10m' });
  return res.json({ token });
});

router.post('/change-password', authenticate, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) return badRequest(res, '请输入原密码和新密码');
  if (String(newPassword).length < 6) return badRequest(res, '新密码长度不能少于 6 位');
  const user = getDb().prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(String(oldPassword), user.password)) {
    return badRequest(res, '原密码不正确');
  }
  const hash = bcrypt.hashSync(String(newPassword), 10);
  getDb().prepare('UPDATE users SET password = ?, updated_at = ? WHERE id = ?').run(hash, nowUtc(), req.user.id);
  writeAudit(getDb(), { userId: req.user.id, action: 'other', entityType: 'user', entityId: req.user.id, detail: { event: 'change_password' } });
  rotateJwtSecret();
  return res.json({ message: '密码修改成功，请重新登录' });
});

router.put('/profile', authenticate, (req, res) => {
  const { currentPassword, username: newUsername, newPassword } = req.body || {};
  if (!currentPassword) return badRequest(res, '请输入当前密码');
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return badRequest(res, '用户不存在');
  if (!bcrypt.compareSync(String(currentPassword), user.password)) {
    return badRequest(res, '当前密码不正确');
  }
  let nextUsername = user.username;
  if (newUsername !== undefined && String(newUsername).trim() !== '') {
    const trimmed = String(newUsername).trim();
    if (trimmed.length < 2 || trimmed.length > 50) return badRequest(res, '用户名长度需为 2-50 位');
    if (!/^[\w\u4e00-\u9fa5.-]+$/.test(trimmed)) return badRequest(res, '用户名包含非法字符');
    const exists = db.prepare('SELECT id FROM users WHERE username = ? AND id <> ?').get(trimmed, user.id);
    if (exists) return badRequest(res, '用户名已被使用');
    nextUsername = trimmed;
  }
  let nextPassword = user.password;
  if (newPassword !== undefined && String(newPassword) !== '') {
    if (String(newPassword).length < 6) return badRequest(res, '新密码长度不能少于 6 位');
    nextPassword = bcrypt.hashSync(String(newPassword), 10);
  }
  db.prepare('UPDATE users SET username = ?, password = ?, updated_at = ? WHERE id = ?').run(nextUsername, nextPassword, nowUtc(), user.id);
  writeAudit(db, { userId: user.id, action: 'other', entityType: 'user', entityId: user.id, detail: { event: 'update_profile' } });
  rotateJwtSecret();
  return res.json({ user: { id: user.id, username: nextUsername }, message: '账户信息已更新，请重新登录' });
});

export default router;
