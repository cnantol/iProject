import { Router } from 'express';
import { getDb } from '../db/init.js';
import { nowUtc, badRequest, notFound, writeAudit } from '../utils.js';

const router = Router();
const MAX_NOTE_LENGTH = 2000;

const NOTE_SELECT = `
  SELECT n.id, n.content, n.created_by, u.username AS creator_name, n.created_at, n.updated_at
  FROM order_notes n
  LEFT JOIN users u ON u.id = n.created_by
`;

function loadOrder(db, rawId) {
  return db.prepare('SELECT id, order_id FROM orders WHERE id = ?').get(Number(rawId));
}

function loadNote(db, orderId, rawNoteId) {
  return db.prepare(`${NOTE_SELECT} WHERE n.id = ? AND n.order_id = ?`).get(Number(rawNoteId), orderId);
}

router.get('/:id/notes', (req, res) => {
  const db = getDb();
  const order = loadOrder(db, req.params.id);
  if (!order) return notFound(res);
  const items = db.prepare(`${NOTE_SELECT} WHERE n.order_id = ? ORDER BY n.id DESC`).all(order.id);
  return res.json({ items });
});

router.post('/:id/notes', (req, res) => {
  const db = getDb();
  const order = loadOrder(db, req.params.id);
  if (!order) return notFound(res);
  const content = String((req.body || {}).content || '').trim();
  if (!content) return badRequest(res, '记录内容必填');
  if (content.length > MAX_NOTE_LENGTH) return badRequest(res, `记录内容不能超过 ${MAX_NOTE_LENGTH} 字`);
  const ts = nowUtc();
  const info = db
    .prepare('INSERT INTO order_notes (order_id, content, created_by, created_at, updated_at) VALUES (?,?,?,?,?)')
    .run(order.id, content, req.user.id, ts, ts);
  writeAudit(db, {
    userId: req.user.id,
    action: 'order_note_add',
    entityType: 'order',
    entityId: order.id,
    detail: { note_id: info.lastInsertRowid, order_id: order.order_id }
  });
  const item = loadNote(db, order.id, info.lastInsertRowid);
  return res.status(201).json({ item });
});

router.delete('/:id/notes/:noteId', (req, res) => {
  const db = getDb();
  const order = loadOrder(db, req.params.id);
  if (!order) return notFound(res);
  const note = loadNote(db, order.id, req.params.noteId);
  if (!note) return notFound(res, '记录不存在');
  if (note.created_by !== req.user.id && req.user.username !== 'admin') {
    return res.status(403).json({ error: '仅创建人或管理员可删除' });
  }
  db.prepare('DELETE FROM order_notes WHERE id = ?').run(note.id);
  writeAudit(db, {
    userId: req.user.id,
    action: 'order_note_delete',
    entityType: 'order',
    entityId: order.id,
    detail: { note_id: note.id, order_id: order.order_id }
  });
  return res.json({ message: '记录已删除' });
});

export default router;
