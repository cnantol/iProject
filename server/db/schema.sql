-- ============================================================
-- Atlas Copco 订单管理系统 · schema.sql（V3.4.10 最终版）
-- 与《AtlasCopco_完整最终方案_V3.4_大模型提示词版.md》逐条一致
--   · 23 张表（2.1–2.23）
--   · 18 处 CHECK（金额>0 ×9、qty>0 ×2、pay_percent、batch_percent、布尔0/1 ×5）
--   · 6 个触发器（orders 状态 ×2、approval 状态 ×2、materials 日期 ×2）
--   · 4 个唯一索引 + 1 个辅助索引
--   · 全部外键默认 RESTRICT（禁止级联删除）
-- 时间字段由后端统一写入 UTC（datetime('now')），本文件不设默认值
-- 仅支持 SQLite 3.x；禁止修改本文件（后端 db/init.js 原样执行）
-- ============================================================
PRAGMA foreign_keys = ON;

-- 1. users — 用户（单管理员：仅 admin/admin123）
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT
);

-- 2. end_customers — 最终客户
CREATE TABLE IF NOT EXISTS end_customers (
  id INTEGER PRIMARY KEY,
  customer_name TEXT NOT NULL UNIQUE,
  short_name TEXT,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  remark TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- 3. contract_customers — 合同客户
CREATE TABLE IF NOT EXISTS contract_customers (
  id INTEGER PRIMARY KEY,
  customer_name TEXT NOT NULL UNIQUE,
  short_name TEXT,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  remark TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- 4. materials — 框架协议物料价格
CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY,
  end_customer_id INTEGER NOT NULL REFERENCES end_customers(id),
  material_no TEXT NOT NULL,
  description TEXT,
  unit_price_ex_vat REAL NOT NULL CHECK (unit_price_ex_vat > 0),
  unit TEXT DEFAULT 'pcs',
  agreement_no TEXT,
  valid_from TEXT NOT NULL,
  valid_to TEXT,
  remark TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- 5. guide_prices — 系统指导价
CREATE TABLE IF NOT EXISTS guide_prices (
  id INTEGER PRIMARY KEY,
  material_no TEXT NOT NULL UNIQUE,
  description TEXT,
  guide_unit_price_ex_vat REAL NOT NULL CHECK (guide_unit_price_ex_vat > 0),
  unit TEXT DEFAULT 'pcs',
  remark TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- 6. orders — 订单主表（核心表，29 字段）
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  year TEXT,
  month TEXT,
  end_customer_id INTEGER REFERENCES end_customers(id),
  contract_customer_id INTEGER REFERENCES contract_customers(id),
  order_type TEXT,
  project_no TEXT,
  workshop TEXT,
  project_name TEXT,
  project_owner TEXT,
  project_remark TEXT,
  sales_order TEXT UNIQUE,
  total_amount REAL CHECK (total_amount IS NULL OR total_amount > 0),
  payment_terms TEXT,
  delivered INTEGER DEFAULT 0 CHECK (delivered IN (0,1)),
  delivered_date TEXT,
  invoiced INTEGER DEFAULT 0 CHECK (invoiced IN (0,1)),
  invoiced_date TEXT,
  commission_matched INTEGER DEFAULT 0 CHECK (commission_matched IN (0,1)),
  commission_amount REAL CHECK (commission_amount IS NULL OR commission_amount > 0),
  commission_date TEXT,
  status TEXT DEFAULT 'customer_info',
  selected_round_id INTEGER REFERENCES quotations(id),
  bid_result TEXT,
  has_framework INTEGER DEFAULT 0 CHECK (has_framework IN (0,1)),
  proposal_skipped INTEGER DEFAULT 0 CHECK (proposal_skipped IN (0,1)),
  closed_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- 7. proposal_versions — 方案版本
CREATE TABLE IF NOT EXISTS proposal_versions (
  id INTEGER PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  version_label TEXT,
  remark TEXT,
  sort_order INTEGER,
  created_at TEXT
);

-- 8. proposal_selections — 方案选型明细
CREATE TABLE IF NOT EXISTS proposal_selections (
  id INTEGER PRIMARY KEY,
  proposal_version_id INTEGER REFERENCES proposal_versions(id),
  material_no TEXT,
  description TEXT,
  material_type TEXT DEFAULT 'standard',
  qty REAL CHECK (qty > 0),
  unit TEXT DEFAULT 'pcs',
  sort_order INTEGER DEFAULT 0,
  remark TEXT
);

-- 9. quotations — 报价轮次
CREATE TABLE IF NOT EXISTS quotations (
  id INTEGER PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  round_no INTEGER,
  round_label TEXT,
  status TEXT DEFAULT 'draft',
  total_amount REAL,
  remark TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- 10. quotation_items — 报价明细
CREATE TABLE IF NOT EXISTS quotation_items (
  id INTEGER PRIMARY KEY,
  quotation_id INTEGER REFERENCES quotations(id),
  material_no TEXT,
  description TEXT,
  material_type TEXT DEFAULT 'standard',
  price_source TEXT,
  unit_price_ex_vat REAL,
  pay_percent REAL DEFAULT 100 CHECK (pay_percent > 0 AND pay_percent <= 100),
  final_unit_price REAL CHECK (final_unit_price > 0),
  qty REAL CHECK (qty > 0),
  line_amount REAL CHECK (line_amount > 0),
  unit TEXT DEFAULT 'pcs',
  remark TEXT
);

-- 11. customer_pos — 客户 PO 明细
CREATE TABLE IF NOT EXISTS customer_pos (
  id INTEGER PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  po_number TEXT,
  po_amount REAL CHECK (po_amount > 0),
  remark TEXT,
  created_at TEXT
);

-- 12. approval_records — 审批记录
CREATE TABLE IF NOT EXISTS approval_records (
  id INTEGER PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  quotation_id INTEGER REFERENCES quotations(id),
  approval_type TEXT,
  status TEXT,
  approver_id INTEGER REFERENCES users(id),
  applied_at TEXT,
  responded_at TEXT,
  remark TEXT
);

-- 13. order_attachments — 订单附件（统一文件存储）
CREATE TABLE IF NOT EXISTS order_attachments (
  id INTEGER PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  stage TEXT,
  file_name TEXT,
  file_path TEXT,
  file_type TEXT,
  reference_type TEXT,
  reference_id INTEGER,
  uploaded_at TEXT
);

-- 14. shipping_batches — 发货批次
CREATE TABLE IF NOT EXISTS shipping_batches (
  id INTEGER PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  batch_no TEXT,
  batch_percent REAL CHECK (batch_percent > 0 AND batch_percent <= 100),
  shipped_date TEXT,
  remark TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT
);

-- 15. invoice_records — 开票记录（超开由应用层确认放行 + 审计，数据库不拦截）
CREATE TABLE IF NOT EXISTS invoice_records (
  id INTEGER PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  po_id INTEGER REFERENCES customer_pos(id),
  invoice_no TEXT,
  amount REAL CHECK (amount > 0),
  invoice_date TEXT,
  remark TEXT,
  created_at TEXT
);

-- 16. import_logs — 导入日志
CREATE TABLE IF NOT EXISTS import_logs (
  id INTEGER PRIMARY KEY,
  target_type TEXT,
  file_name TEXT,
  total_rows INTEGER,
  success_rows INTEGER,
  fail_rows INTEGER,
  created_at TEXT
);

-- 17. commission_manual_records — 佣金人工补录记录
CREATE TABLE IF NOT EXISTS commission_manual_records (
  id INTEGER PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  amount REAL NOT NULL CHECK (amount > 0),
  remark TEXT,
  operator_id INTEGER REFERENCES users(id),
  created_at TEXT
);

-- 18. custom_fields — 自定义字段
CREATE TABLE IF NOT EXISTS custom_fields (
  id INTEGER PRIMARY KEY,
  entity_type TEXT,
  field_name TEXT,
  field_type TEXT,
  field_options TEXT,
  is_system INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT
);

-- 19. workflow_steps — 工作流步骤（展示层配置，非状态机定义）
CREATE TABLE IF NOT EXISTS workflow_steps (
  id INTEGER PRIMARY KEY,
  step_key TEXT NOT NULL UNIQUE,
  step_name TEXT NOT NULL,
  sort_order INTEGER,
  is_active INTEGER DEFAULT 1
);

-- 20. workflow_transitions — 工作流转规则（参考展示，非执行逻辑）
CREATE TABLE IF NOT EXISTS workflow_transitions (
  id INTEGER PRIMARY KEY,
  from_step TEXT,
  to_step TEXT,
  condition_type TEXT,
  condition_field TEXT
);

-- 21. order_custom_fields — 订单自定义字段值
CREATE TABLE IF NOT EXISTS order_custom_fields (
  id INTEGER PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  field_id INTEGER REFERENCES custom_fields(id),
  field_value TEXT
);

-- 22. todos — 待办事项
CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium',
  due_date TEXT,
  is_completed INTEGER DEFAULT 0,
  completed_at TEXT,
  order_ref INTEGER REFERENCES orders(id),
  created_at TEXT,
  updated_at TEXT
);

-- 23. audit_logs — 审计日志
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  detail TEXT,
  created_at TEXT
);

-- ============================================================
-- 唯一索引（4 个）
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_materials_uniq ON materials(end_customer_id, material_no, valid_from);
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotations_round ON quotations(order_id, round_no);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_po ON customer_pos(order_id, po_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_no ON invoice_records(order_id, invoice_no);

-- 辅助索引（1 个）：佣金人工补录按订单查询
CREATE INDEX IF NOT EXISTS idx_commission_manual_order ON commission_manual_records(order_id);

-- ============================================================
-- 触发器（6 个）：orders 状态 ×2、approval 状态 ×2、materials 日期 ×2
-- ============================================================
CREATE TRIGGER IF NOT EXISTS trg_orders_check BEFORE INSERT ON orders
BEGIN
  SELECT CASE WHEN NEW.status NOT IN ('customer_info','proposal','quotation','approval_pending','bid_decision','finance','shipping_invoicing','commission','closed','lost_closed') THEN RAISE(ABORT,'invalid status') END;
  SELECT CASE WHEN NEW.bid_result IS NOT NULL AND NEW.bid_result NOT IN ('won','lost') THEN RAISE(ABORT,'invalid bid_result') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_orders_check_upd BEFORE UPDATE OF status,bid_result ON orders
BEGIN
  SELECT CASE WHEN NEW.status NOT IN ('customer_info','proposal','quotation','approval_pending','bid_decision','finance','shipping_invoicing','commission','closed','lost_closed') THEN RAISE(ABORT,'invalid status') END;
  SELECT CASE WHEN NEW.bid_result IS NOT NULL AND NEW.bid_result NOT IN ('won','lost') THEN RAISE(ABORT,'invalid bid_result') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_approval_check BEFORE INSERT ON approval_records
BEGIN
  SELECT CASE WHEN NEW.status NOT IN ('pending','approved','rejected','superseded') THEN RAISE(ABORT,'invalid approval status') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_approval_check_upd BEFORE UPDATE OF status ON approval_records
BEGIN
  SELECT CASE WHEN NEW.status NOT IN ('pending','approved','rejected','superseded') THEN RAISE(ABORT,'invalid approval status') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_materials_valid BEFORE INSERT ON materials
BEGIN
  SELECT CASE WHEN NEW.valid_to IS NOT NULL AND NEW.valid_to < NEW.valid_from THEN RAISE(ABORT,'valid_to < valid_from') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_materials_valid_upd BEFORE UPDATE OF valid_from,valid_to ON materials
BEGIN
  SELECT CASE WHEN NEW.valid_to IS NOT NULL AND NEW.valid_to < NEW.valid_from THEN RAISE(ABORT,'valid_to < valid_from') END;
END;
