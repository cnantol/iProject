import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { nowUtc } from '../utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db = null;
let dataDir = path.join(__dirname, 'data');
let jwtSecretFile = null;

export function getDataDir() {
  return dataDir;
}

export function getUploadDir() {
  return path.join(dataDir, 'uploads');
}

export function setDataDir(dir) {
  dataDir = dir;
}

export function getDb() {
  if (!db) throw new Error('数据库尚未初始化');
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

export function getJwtSecret() {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv) return fromEnv;
  if (!jwtSecretFile) jwtSecretFile = path.join(dataDir, '.jwt-secret');
  if (!fs.existsSync(jwtSecretFile)) {
    const secret = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(jwtSecretFile, secret, { mode: 0o600 });
    return secret;
  }
  return fs.readFileSync(jwtSecretFile, 'utf8').trim();
}

export function rotateJwtSecret() {
  if (!jwtSecretFile) jwtSecretFile = path.join(dataDir, '.jwt-secret');
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(jwtSecretFile, secret, { mode: 0o600 });
  return secret;
}

export function initDb(dir) {
  if (dir) setDataDir(dir);
  fs.mkdirSync(dataDir, { recursive: true });
  const uploadsDir = path.join(dataDir, 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });

  const dbPath = path.join(dataDir, 'database.sqlite');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_step_fields (
      id INTEGER PRIMARY KEY,
      step_key TEXT NOT NULL,
      field_id INTEGER NOT NULL REFERENCES custom_fields(id),
      sort_order INTEGER DEFAULT 0,
      UNIQUE(step_key, field_id)
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_workflow_step_fields_step ON workflow_step_fields(step_key)');

  const ensureShortName = (table) => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some((col) => col.name === 'short_name')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN short_name TEXT`);
    }
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${table}_short_name ON ${table}(short_name)`);
  };
  ensureShortName('end_customers');
  ensureShortName('contract_customers');

  const importLogColumns = db.prepare('PRAGMA table_info(import_logs)').all();
  if (!importLogColumns.some((col) => col.name === 'detail')) {
    db.exec('ALTER TABLE import_logs ADD COLUMN detail TEXT');
  }
  if (!importLogColumns.some((col) => col.name === 'revoked')) {
    db.exec('ALTER TABLE import_logs ADD COLUMN revoked INTEGER DEFAULT 0');
  }

  const admin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!admin) {
    const hash = bcrypt.hashSync('password', 10);
    const ts = nowUtc();
    db.prepare('INSERT INTO users (username, password, created_at, updated_at) VALUES (?,?,?,?)').run(
      'admin',
      hash,
      ts,
      ts
    );
  }

  seedWorkflow(db);
  return db;
}

export function seedWorkflow(database) {
  const steps = [
    ['customer_info', '客户信息', 1],
    ['proposal', '方案阶段', 2],
    ['quotation', '报价阶段', 3],
    ['approval_pending', '并行审批', 4],
    ['bid_decision', '中标结果', 5],
    ['finance', '财务信息', 6],
    ['shipping_invoicing', '发货+开票', 7],
    ['commission', '佣金结算', 8],
    ['closed', '项目闭环', 9],
    ['lost_closed', '未中标关闭', 10]
  ];
  const count = database.prepare('SELECT COUNT(*) AS c FROM workflow_steps').get().c;
  if (count === 0) {
    const insert = database.prepare('INSERT INTO workflow_steps (step_key, step_name, sort_order, is_active) VALUES (?,?,?,1)');
    const tx = database.transaction((rows) => {
      for (const row of rows) insert.run(...row);
    });
    tx(steps);
  }

  const transitionCount = database.prepare('SELECT COUNT(*) AS c FROM workflow_transitions').get().c;
  if (transitionCount === 0) {
    const rows = [
      ['customer_info', 'proposal', 'user_action', 'end_customer_id,contract_customer_id,project_name,project_owner'],
      ['proposal', 'quotation', 'user_action', 'proposal_skipped'],
      ['quotation', 'approval_pending', 'user_action', 'selected_round_id'],
      ['approval_pending', 'bid_decision', 'system_auto', 'sales_force,oa_contract'],
      ['approval_pending', 'quotation', 'system_auto', 'approval rejected'],
      ['bid_decision', 'finance', 'user_action', 'bid_result=won'],
      ['bid_decision', 'lost_closed', 'user_action', 'bid_result=lost'],
      ['finance', 'shipping_invoicing', 'user_action', 'sales_order,total_amount,customer_pos'],
      ['shipping_invoicing', 'commission', 'condition_met', 'delivered=1,invoiced=1'],
      ['commission', 'closed', 'system_auto', 'commission_matched=1']
    ];
    const insert = database.prepare('INSERT INTO workflow_transitions (from_step, to_step, condition_type, condition_field) VALUES (?,?,?,?)');
    const tx = database.transaction((list) => {
      for (const row of list) insert.run(...row);
    });
    tx(rows);
  }
}
