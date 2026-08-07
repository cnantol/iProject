-- iProject
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY,
  lock_key TEXT NOT NULL UNIQUE,
  fail_count INTEGER NOT NULL DEFAULT 0,
  lock_until INTEGER,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS end_customers (
  id INTEGER PRIMARY KEY,
  customer_name TEXT NOT NULL UNIQUE,
  short_name TEXT,
  parent_customer_id INTEGER REFERENCES end_customers(id),
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  remark TEXT,
  created_at TEXT,
  updated_at TEXT
);

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
  total_amount REAL CHECK (total_amount IS NULL OR total_amount >= 0),
  payment_terms TEXT,
  delivered INTEGER DEFAULT 0 CHECK (delivered IN (0,1)),
  delivered_date TEXT,
  invoiced INTEGER DEFAULT 0 CHECK (invoiced IN (0,1)),
  invoiced_date TEXT,
  commission_matched INTEGER DEFAULT 0 CHECK (commission_matched IN (0,1)),
  commission_amount REAL CHECK (commission_amount IS NULL OR commission_amount >= 0),
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

CREATE TABLE IF NOT EXISTS proposal_versions (
  id INTEGER PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  version_label TEXT,
  remark TEXT,
  sort_order INTEGER,
  created_at TEXT
);

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

CREATE TABLE IF NOT EXISTS quotations (
  id INTEGER PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  round_no INTEGER,
  round_label TEXT,
  quote_no TEXT,
  status TEXT DEFAULT 'draft',
  total_amount REAL,
  remark TEXT,
  created_at TEXT,
  updated_at TEXT
);

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

CREATE TABLE IF NOT EXISTS customer_pos (
  id INTEGER PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  po_number TEXT,
  po_amount REAL CHECK (po_amount > 0),
  remark TEXT,
  created_at TEXT
);

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

CREATE TABLE IF NOT EXISTS import_logs (
  id INTEGER PRIMARY KEY,
  target_type TEXT,
  file_name TEXT,
  total_rows INTEGER,
  success_rows INTEGER,
  fail_rows INTEGER,
  detail TEXT,
  revoked INTEGER DEFAULT 0,
  task_id TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS import_tasks (
  id TEXT PRIMARY KEY,
  user_id INTEGER,
  target_type TEXT,
  file_name TEXT,
  total_rows INTEGER DEFAULT 0,
  processed_rows INTEGER DEFAULT 0,
  success_rows INTEGER DEFAULT 0,
  fail_rows INTEGER DEFAULT 0,
  failures TEXT,
  success_detail TEXT,
  status TEXT,
  error TEXT,
  created_at TEXT,
  updated_at TEXT,
  done_at TEXT
);

CREATE TABLE IF NOT EXISTS commission_manual_records (
  id INTEGER PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  amount REAL NOT NULL CHECK (amount >= 0),
  remark TEXT,
  operator_id INTEGER REFERENCES users(id),
  created_at TEXT
);

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

CREATE TABLE IF NOT EXISTS workflow_steps (
  id INTEGER PRIMARY KEY,
  step_key TEXT NOT NULL UNIQUE,
  step_name TEXT NOT NULL,
  sort_order INTEGER,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS workflow_transitions (
  id INTEGER PRIMARY KEY,
  from_step TEXT,
  to_step TEXT,
  condition_type TEXT,
  condition_field TEXT
);

CREATE TABLE IF NOT EXISTS order_custom_fields (
  id INTEGER PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  field_id INTEGER REFERENCES custom_fields(id),
  field_value TEXT
);

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

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  detail TEXT,
  created_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_materials_uniq ON materials(end_customer_id, material_no, valid_from);
CREATE INDEX IF NOT EXISTS idx_materials_valid_from ON materials(valid_from);
CREATE INDEX IF NOT EXISTS idx_materials_end_customer_valid ON materials(end_customer_id, valid_from);
CREATE INDEX IF NOT EXISTS idx_guide_prices_material_no ON guide_prices(material_no);
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotations_round ON quotations(order_id, round_no);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_po ON customer_pos(order_id, po_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_no ON invoice_records(order_id, invoice_no);

CREATE INDEX IF NOT EXISTS idx_commission_manual_order ON commission_manual_records(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_year_month_id ON orders(year, month, order_id DESC);

CREATE TRIGGER IF NOT EXISTS trg_orders_check BEFORE INSERT ON orders
BEGIN
  SELECT CASE WHEN NEW.status NOT IN ('customer_info','proposal','quotation','approval_pending','bid_decision','finance','shipping_invoicing','commission','closed','lost_closed','cancelled') THEN RAISE(ABORT,'invalid status') END;
  SELECT CASE WHEN NEW.bid_result IS NOT NULL AND NEW.bid_result NOT IN ('won','lost') THEN RAISE(ABORT,'invalid bid_result') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_orders_check_upd BEFORE UPDATE OF status,bid_result ON orders
BEGIN
  SELECT CASE WHEN NEW.status NOT IN ('customer_info','proposal','quotation','approval_pending','bid_decision','finance','shipping_invoicing','commission','closed','lost_closed','cancelled') THEN RAISE(ABORT,'invalid status') END;
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

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_customer_pos_order ON customer_pos(order_id);
CREATE INDEX IF NOT EXISTS idx_proposal_versions_order ON proposal_versions(order_id);
CREATE INDEX IF NOT EXISTS idx_proposal_selections_version ON proposal_selections(proposal_version_id);
CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation ON quotation_items(quotation_id);
CREATE INDEX IF NOT EXISTS idx_approval_records_order ON approval_records(order_id);
CREATE INDEX IF NOT EXISTS idx_approval_records_quotation ON approval_records(quotation_id);
CREATE INDEX IF NOT EXISTS idx_invoice_records_order ON invoice_records(order_id);
CREATE INDEX IF NOT EXISTS idx_shipping_batches_order ON shipping_batches(order_id);
CREATE INDEX IF NOT EXISTS idx_order_attachments_order ON order_attachments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_custom_fields_order ON order_custom_fields(order_id);
CREATE INDEX IF NOT EXISTS idx_todos_due ON todos(due_date);
CREATE INDEX IF NOT EXISTS idx_todos_order_ref ON todos(order_ref);
CREATE INDEX IF NOT EXISTS idx_custom_fields_entity ON custom_fields(entity_type);
CREATE INDEX IF NOT EXISTS idx_import_logs_target ON import_logs(target_type);
