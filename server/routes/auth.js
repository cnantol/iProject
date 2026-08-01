import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getDb, getJwtSecret } from '../db/init.js';
import { authenticate } from '../middleware/auth.js';
import { nowUtc, badRequest, writeAudit } from '../utils.js';

const router = Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return badRequest(res, '请输入用户名和密码');
  const user = getDb().prepare('SELECT * FROM users WHERE username = ?').get(String(username).trim());
  if (!user || !bcrypt.compareSync(String(password), user.password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const token = jwt.sign({ id: user.id, username: user.username }, getJwtSecret(), { expiresIn: '7d' });
  return res.json({ token, user: { id: user.id, username: user.username } });
});

router.get('/me', authenticate, (req, res) => {
  return res.json({ user: req.user });
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
  return res.json({ message: '密码修改成功' });
});

export default router;
