import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { nowUtc } from '../utils.js';
import { logger } from '../logger.js';

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

  const quotationColumns = db.prepare('PRAGMA table_info(quotations)').all();
  if (!quotationColumns.some((col) => col.name === 'quote_no')) {
    db.exec('ALTER TABLE quotations ADD COLUMN quote_no TEXT');
  }

  const ensureShortName = (table) => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some((col) => col.name === 'short_name')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN short_name TEXT`);
    }
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${table}_short_name ON ${table}(short_name)`);
  };
  ensureShortName('end_customers');
  ensureShortName('contract_customers');

  const endCustomerColumns = db.prepare('PRAGMA table_info(end_customers)').all();
  if (!endCustomerColumns.some((col) => col.name === 'parent_customer_id')) {
    db.exec('ALTER TABLE end_customers ADD COLUMN parent_customer_id INTEGER REFERENCES end_customers(id)');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_end_customers_parent ON end_customers(parent_customer_id)');

  // 性能索引:覆盖全站高频查询路径
  // - login_attempts.lock_key: 登录失败计数查询(每次登录)
  // - users.username: 登录 / 唯一性检查
  // - materials.(end_customer_id, material_no): 报价价格匹配(联合索引,覆盖 WHERE 两字段)
  // - guide_prices.material_no: 通用价格查询
  // - orders.sales_order: 佣金匹配 + 销售机会唯一性
  // - orders.(status, commission_matched): 佣金待匹配批次扫描
  db.exec('CREATE INDEX IF NOT EXISTS idx_login_attempts_key ON login_attempts(lock_key)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_materials_customer_material ON materials(end_customer_id, material_no)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_guide_prices_material ON guide_prices(material_no)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_orders_sales_order ON orders(sales_order)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_orders_status_commission ON orders(status, commission_matched)');

  const ensureOrdersTotalNonNegative = () => {
    const ddlRow = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'orders'").get();
    const ddl = ddlRow && ddlRow.sql ? String(ddlRow.sql) : '';
    if (ddl.includes('total_amount >= 0') && ddl.includes('commission_amount >= 0')) return;
    const indexSqls = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'orders' AND sql IS NOT NULL")
      .all()
      .map((row) => row.sql);
    const triggerSqls = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'orders' AND sql IS NOT NULL")
      .all()
      .map((row) => row.sql);
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      const newDdl = ddl
        .replace('total_amount > 0', 'total_amount >= 0')
        .replace('commission_amount > 0', 'commission_amount >= 0')
        .replace(/CREATE TABLE "?orders"?/, 'CREATE TABLE orders_migrated');
      db.exec(newDdl);
      db.exec('INSERT INTO orders_migrated SELECT * FROM orders');
      db.exec('DROP TABLE orders');
      db.exec('ALTER TABLE orders_migrated RENAME TO orders');
      for (const sql of indexSqls) db.exec(sql);
      for (const sql of triggerSqls) db.exec(sql);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    } finally {
      db.exec('PRAGMA foreign_keys = ON');
    }
    const issues = db.pragma('foreign_key_check');
    if (issues.length > 0) {
      throw new Error('orders 表迁移后外键校验失败');
    }
  };
  ensureOrdersTotalNonNegative();

  const ensureCommissionManualNonNegative = () => {
    const ddlRow = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'commission_manual_records'").get();
    const ddl = ddlRow && ddlRow.sql ? String(ddlRow.sql) : '';
    if (!/CHECK\s*\(\s*amount\s*>\s*0\)/i.test(ddl)) return;
    const indexSqls = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'commission_manual_records' AND sql IS NOT NULL")
      .all()
      .map((row) => row.sql);
    const triggerSqls = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'commission_manual_records' AND sql IS NOT NULL")
      .all()
      .map((row) => row.sql);
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      db.exec(`CREATE TABLE commission_manual_records_migrated (
        id INTEGER PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id),
        amount REAL NOT NULL CHECK (amount >= 0),
        remark TEXT,
        operator_id INTEGER REFERENCES users(id),
        created_at TEXT
      )`);
      db.exec('INSERT INTO commission_manual_records_migrated SELECT id, order_id, amount, remark, operator_id, created_at FROM commission_manual_records');
      db.exec('DROP TABLE commission_manual_records');
      db.exec('ALTER TABLE commission_manual_records_migrated RENAME TO commission_manual_records');
      for (const sql of indexSqls) db.exec(sql);
      for (const sql of triggerSqls) db.exec(sql);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    } finally {
      db.exec('PRAGMA foreign_keys = ON');
    }
    const issues = db.pragma('foreign_key_check');
    if (issues.length > 0) {
      throw new Error('commission_manual_records 表迁移后外键校验失败');
    }
  };
  ensureCommissionManualNonNegative();

  const padOrderIds = () => {
    const rows = db.prepare("SELECT id, order_id FROM orders WHERE order_id LIKE 'OPP-%'").all();
    const updates = [];
    const seen = new Set();
    for (const row of rows) {
      const m = String(row.order_id).match(/^(OPP-.*?)(\d+)$/);
      if (!m) continue;
      const padded = `${m[1]}${m[2].padStart(4, '0')}`;
      if (padded === row.order_id) continue;
      if (seen.has(padded)) throw new Error(`订单编号补零冲突: ${padded}`);
      seen.add(padded);
      updates.push([row.id, padded]);
    }
    if (updates.length === 0) return;
    const update = db.prepare('UPDATE orders SET order_id = ? WHERE id = ?');
    const tx = db.transaction((pairs) => {
      for (const [id, orderId] of pairs) update.run(orderId, id);
    });
    tx(updates);
    logger.info('migrate', `订单编号补零迁移:已更新 ${updates.length} 条历史订单`);
  };
  padOrderIds();

  const importLogColumns = db.prepare('PRAGMA table_info(import_logs)').all();
  if (!importLogColumns.some((col) => col.name === 'detail')) {
    db.exec('ALTER TABLE import_logs ADD COLUMN detail TEXT');
  }
  if (!importLogColumns.some((col) => col.name === 'revoked')) {
    db.exec('ALTER TABLE import_logs ADD COLUMN revoked INTEGER DEFAULT 0');
  }
  if (!importLogColumns.some((col) => col.name === 'task_id')) {
    db.exec('ALTER TABLE import_logs ADD COLUMN task_id TEXT');
  }

  const restartTime = nowUtc();
  db.prepare("UPDATE import_tasks SET status = 'error', error = '服务重启，任务已终止', updated_at = ?, done_at = ? WHERE status = 'processing'").run(restartTime, restartTime);
  const doneTasks = db
    .prepare("SELECT id, target_type, file_name, total_rows, success_rows, fail_rows, success_detail FROM import_tasks WHERE status = 'done' AND success_detail IS NOT NULL AND success_detail != ''")
    .all();
  const hasImportLog = db.prepare('SELECT 1 FROM import_logs WHERE task_id = ? LIMIT 1');
  const insertImportLog = db.prepare('INSERT INTO import_logs (target_type, file_name, total_rows, success_rows, fail_rows, detail, revoked, task_id, created_at) VALUES (?,?,?,?,?,?,0,?,?)');
  for (const task of doneTasks) {
    if (!task.id || hasImportLog.get(task.id)) continue;
    let detail = null;
    try {
      detail = JSON.parse(task.success_detail);
    } catch {
      detail = null;
    }
    if (!detail || typeof detail !== 'object') continue;
    insertImportLog.run(task.target_type, task.file_name, task.total_rows, task.success_rows, task.fail_rows, JSON.stringify(detail), task.id, restartTime);
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
    ['lost_closed', '未中标关闭', 10],
    ['cancelled', '合同取消', 11]
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
      ['bid_decision', 'cancelled', 'user_action', 'bid_result=cancelled'],
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
  database
    .prepare("INSERT OR IGNORE INTO workflow_steps (step_key, step_name, sort_order, is_active) VALUES ('cancelled','合同取消',11,1)")
    .run();
  const hasCancelTransition = database
    .prepare("SELECT 1 FROM workflow_transitions WHERE from_step = 'bid_decision' AND to_step = 'cancelled' LIMIT 1")
    .get();
  if (!hasCancelTransition) {
    database
      .prepare("INSERT INTO workflow_transitions (from_step, to_step, condition_type, condition_field) VALUES ('bid_decision','cancelled','user_action','bid_result=cancelled')")
      .run();
  }
}
