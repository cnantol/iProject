import { Router } from 'express';
import { getDb } from '../db/init.js';

const router = Router();

router.get('/', (req, res) => {
  const db = getDb();
  const pageInput = Number(req.query.page);
  const limitInput = Number(req.query.limit);
  const page = Number.isFinite(pageInput) ? Math.max(1, pageInput) : 1;
  const limit = Number.isFinite(limitInput) ? Math.min(200, Math.max(1, limitInput)) : 50;
  const where = [];
  const params = [];
  const { action, entity_type: entityType, entity_id: entityId } = req.query;
  if (action) {
    where.push('a.action = ?');
    params.push(String(action));
  }
  if (entityType) {
    where.push('a.entity_type = ?');
    params.push(String(entityType));
  }
  const numericEntityId = Number(entityId);
  if (entityId && Number.isFinite(numericEntityId)) {
    where.push('a.entity_id = ?');
    params.push(numericEntityId);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS c FROM audit_logs a ${whereSql}`).get(...params).c;
  const items = db
    .prepare(
      `SELECT a.*, u.username FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id ${whereSql} ORDER BY a.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, (page - 1) * limit);
  return res.json({ items, total, page, limit });
});

router.delete('/', (req, res) => {
  const db = getDb();
  const total = db.prepare('SELECT COUNT(*) AS c FROM audit_logs').get().c;
  db.prepare('DELETE FROM audit_logs').run();
  return res.json({ deleted: total });
});

export default router;
