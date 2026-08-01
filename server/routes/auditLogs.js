import { Router } from 'express';
import { getDb } from '../db/init.js';

const router = Router();

router.get('/', (req, res) => {
  const db = getDb();
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const total = db.prepare('SELECT COUNT(*) AS c FROM audit_logs').get().c;
  const items = db
    .prepare(
      `SELECT a.*, u.username FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT ? OFFSET ?`
    )
    .all(limit, (page - 1) * limit);
  return res.json({ items, total, page, limit });
});

export default router;
