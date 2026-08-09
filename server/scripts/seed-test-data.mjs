import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { initDb, closeDb, getDb, getUploadDir } from '../db/init.js';
import { nowUtc, todayLocal } from '../utils.js';

const TEST_ORDER_PREFIX = 'OPP-TEST-';
const TEST_CUSTOMER_MARK = '[测试]';
const ATTACHMENT_COUNT_PER_STEP = 2;

const STAGES = [
  ['customer_info', '客户信息'],
  ['proposal', '方案阶段'],
  ['quotation', '报价阶段'],
  ['approval_pending', '并行审批'],
  ['bid_decision', '中标结果'],
  ['finance', '财务信息'],
  ['shipping_invoicing', '发货+开票'],
  ['commission', '佣金结算'],
  ['closed', '项目闭环'],
  ['lost_closed', '未中标关闭'],
  ['cancelled', '合同取消']
];

// 每个状态可达的历史上传步骤。customer_info 在方案之前上传，方案附件挂在方案版本上，
// 财务附件在财务阶段上传，开票附件在发货+开票阶段上传。
const ATTACHMENT_STAGES_BY_STATUS = {
  customer_info: ['customer_info'],
  proposal: ['customer_info', 'proposal'],
  quotation: ['customer_info', 'proposal'],
  approval_pending: ['customer_info', 'proposal'],
  bid_decision: ['customer_info', 'proposal'],
  finance: ['customer_info', 'proposal', 'finance'],
  shipping_invoicing: ['customer_info', 'proposal', 'finance', 'invoicing'],
  commission: ['customer_info', 'proposal', 'finance', 'invoicing'],
  closed: ['customer_info', 'proposal', 'finance', 'invoicing'],
  lost_closed: ['customer_info', 'proposal'],
  cancelled: ['customer_info', 'proposal']
};

const ATTACHMENT_LABELS = {
  customer_info: '技术要求',
  proposal: '方案文件',
  finance: '销售合同',
  invoicing: '发票附件'
};

const GUIDE_PRICES = [
  ['TEST-G-001', '测试指导价-干燥机', 6600],
  ['TEST-G-002', '测试指导价-储气罐', 12500],
  ['TEST-G-003', '测试指导价-冷干机', 6500],
  ['TEST-G-004', '测试指导价-过滤器', 2800],
  ['TEST-G-005', '测试指导价-压缩机', 9800],
  ['TEST-G-006', '测试指导价-吸附干燥机', 15800],
  ['TEST-G-007', '测试指导价-控制柜', 12000],
  ['TEST-G-008', '测试指导价-管道', 3200],
  ['TEST-G-009', '测试指导价-储罐附件', 1800],
  ['TEST-G-010', '测试指导价-备件包', 7500]
];

const FRAMEWORK_MATERIALS = [
  ['TEST-F-001', '测试框架-空压机', 12800, 'AG-2026-001'],
  ['TEST-F-002', '测试框架-干燥机', 6800, 'AG-2026-002'],
  ['TEST-F-003', '测试框架-储气罐', 12600, 'AG-2026-003'],
  ['TEST-F-004', '测试框架-冷干机', 6600, 'AG-2026-004'],
  ['TEST-F-005', '测试框架-过滤器', 2900, 'AG-2026-005'],
  ['TEST-F-006', '测试框架-压缩机', 9900, 'AG-2026-006'],
  ['TEST-F-007', '测试框架-吸附干燥机', 15900, 'AG-2026-007'],
  ['TEST-F-008', '测试框架-控制柜', 12100, 'AG-2026-008'],
  ['TEST-F-009', '测试框架-管道', 3300, 'AG-2026-009'],
  ['TEST-F-010', '测试框架-备件包', 7600, 'AG-2026-010']
];

const ROUND_ITEMS = {
  1: [
    { material_no: 'TEST-F-001', description: '测试框架-空压机', material_type: 'standard', price_source: 'framework', unit_price_ex_vat: 12800, pay_percent: 100, qty: 2 },
    { material_no: 'TEST-G-001', description: '测试指导价-干燥机', material_type: 'standard', price_source: 'guide_price', unit_price_ex_vat: 6600, pay_percent: 90, qty: 1 }
  ],
  2: [
    { material_no: 'TEST-G-002', description: '测试指导价-储气罐', material_type: 'standard', price_source: 'guide_price', unit_price_ex_vat: 12500, pay_percent: 100, qty: 2 },
    { material_no: 'TEST-M-005', description: '测试手工价-冷干机', material_type: 'standard', price_source: 'manual', unit_price_ex_vat: 6500, pay_percent: 100, qty: 1 }
  ]
};

function roundTotal(items) {
  return items.reduce((sum, item) => {
    const finalPrice = item.price_source === 'guide_price'
      ? (item.unit_price_ex_vat * item.pay_percent) / 100
      : item.unit_price_ex_vat;
    return sum + Math.round(finalPrice * item.qty * 100) / 100;
  }, 0);
}

function buildPdfBuffer(title) {
  const safeTitle = String(title).replace(/[()\\]/g, '');
  const stream = `BT /F1 12 Tf 50 800 Td (${safeTitle}) Tj ET\n`;
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj',
    `4 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream\nendobj`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${object}\n`;
  }
  const startxref = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

function cleanupTestOrders(db) {
  const rows = db.prepare('SELECT id, order_id FROM orders WHERE order_id LIKE ?').all(`${TEST_ORDER_PREFIX}%`);
  if (rows.length === 0) return 0;
  const tx = db.transaction(() => {
    for (const row of rows) {
      db.prepare('DELETE FROM order_custom_fields WHERE order_id = ?').run(row.id);
      db.prepare('DELETE FROM approval_records WHERE order_id = ?').run(row.id);
      db.prepare('DELETE FROM shipping_batches WHERE order_id = ?').run(row.id);
      db.prepare('DELETE FROM invoice_records WHERE order_id = ?').run(row.id);
      db.prepare('DELETE FROM customer_pos WHERE order_id = ?').run(row.id);
      db.prepare('DELETE FROM commission_manual_records WHERE order_id = ?').run(row.id);
      db.prepare('DELETE FROM proposal_selections WHERE proposal_version_id IN (SELECT id FROM proposal_versions WHERE order_id = ?)').run(row.id);
      db.prepare('DELETE FROM proposal_versions WHERE order_id = ?').run(row.id);
      db.prepare('DELETE FROM quotation_items WHERE quotation_id IN (SELECT id FROM quotations WHERE order_id = ?)').run(row.id);
      db.prepare('UPDATE orders SET selected_round_id = NULL WHERE id = ?').run(row.id);
      db.prepare('DELETE FROM quotations WHERE order_id = ?').run(row.id);
      db.prepare('DELETE FROM order_attachments WHERE order_id = ?').run(row.id);
      db.prepare('DELETE FROM todos WHERE order_ref = ?').run(row.id);
      db.prepare('DELETE FROM orders WHERE id = ?').run(row.id);
      fs.rmSync(path.join(getUploadDir(), String(row.id)), { recursive: true, force: true });
    }
  });
  tx();
  return rows.length;
}

function cleanupTestCustomers(db) {
  let removed = 0;
  for (const table of ['end_customers', 'contract_customers']) {
    const rows = db.prepare(`SELECT id FROM ${table} WHERE customer_name LIKE ?`).all(`${TEST_CUSTOMER_MARK}%`);
    const del = db.prepare(`DELETE FROM ${table} WHERE id = ?`);
    for (const row of rows) {
      del.run(row.id);
      removed += 1;
    }
  }
  return removed;
}

function cleanupTestPrices(db) {
  let removed = 0;
  for (const table of ['guide_prices', 'materials']) {
    const rows = db.prepare(`SELECT id FROM ${table} WHERE material_no LIKE 'TEST-%'`).all();
    const del = db.prepare(`DELETE FROM ${table} WHERE id = ?`);
    for (const row of rows) {
      del.run(row.id);
      removed += 1;
    }
  }
  return removed;
}

function insertGuidePrices(db) {
  const now = nowUtc();
  const insert = db.prepare(
    'INSERT INTO guide_prices (material_no, description, guide_unit_price_ex_vat, unit, remark, created_at, updated_at) VALUES (?,?,?,?,?,?,?)'
  );
  for (const [materialNo, description, price] of GUIDE_PRICES) {
    insert.run(materialNo, description, price, 'pcs', '测试指导价', now, now);
  }
  return GUIDE_PRICES.length;
}

function insertFrameworkMaterials(db, endCustomerId) {
  const now = nowUtc();
  const insert = db.prepare(
    `INSERT INTO materials (end_customer_id, material_no, description, unit_price_ex_vat, unit, agreement_no, valid_from, valid_to, remark, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  );
  for (const [materialNo, description, price, agreementNo] of FRAMEWORK_MATERIALS) {
    insert.run(endCustomerId, materialNo, description, price, 'pcs', agreementNo, '2026-01-01', '2026-12-31', '测试框架协议价', now, now);
  }
  return FRAMEWORK_MATERIALS.length;
}

function ensureCustomer(db, table, customerName, shortName, contactPerson) {
  const now = nowUtc();
  db.prepare(
    `INSERT OR IGNORE INTO ${table} (customer_name, short_name, contact_person, phone, email, remark, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(customerName, shortName, contactPerson, '13800000000', null, TEST_CUSTOMER_MARK, now, now);
  const row = db.prepare(`SELECT id FROM ${table} WHERE customer_name = ?`).get(customerName);
  if (!row) throw new Error(`无法创建或复用测试客户：${customerName}`);
  return row.id;
}

function insertOrder(db, status, statusLabel, index, endCustomerId, contractCustomerId) {
  const seq = String(index).padStart(4, '0');
  const orderId = `${TEST_ORDER_PREFIX}${status}-${seq}`;
  const now = nowUtc();
  const info = db.prepare(
    `INSERT INTO orders (order_id, year, month, end_customer_id, contract_customer_id, order_type, project_no, workshop,
      project_name, project_owner, project_remark, has_framework, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    orderId,
    '2026',
    '08',
    endCustomerId,
    contractCustomerId,
    index === 1 ? 'A' : 'B',
    index === 1 ? null : `TEST-PROJ-${seq}`,
    '测试车间',
    `[测试] ${statusLabel} ${seq}`,
    '测试负责人',
    '由 seed-test-data 生成的测试数据',
    index === 1 ? 1 : 0,
    status,
    now,
    now
  );
  return { id: info.lastInsertRowid, orderId };
}

function insertProposal(db, orderId, index) {
  const now = nowUtc();
  const info = db.prepare(
    'INSERT INTO proposal_versions (order_id, version_label, remark, sort_order, created_at) VALUES (?,?,?,?,?)'
  ).run(orderId, 'V1', '测试方案版本', 1, now);
  const versionId = info.lastInsertRowid;
  const insert = db.prepare(
    'INSERT INTO proposal_selections (proposal_version_id, material_no, description, material_type, qty, unit, sort_order, remark) VALUES (?,?,?,?,?,?,?,?)'
  );
  ROUND_ITEMS[index].forEach((item, i) => {
    insert.run(versionId, item.material_no, item.description, item.material_type, item.qty, 'pcs', i + 1, '测试选型');
  });
  return versionId;
}

function insertQuotation(db, orderId, index, status) {
  const now = nowUtc();
  const items = ROUND_ITEMS[index];
  const total = roundTotal(items);
  const roundStatus = status === 'quotation' ? 'draft' : 'submitted';
  const info = db.prepare(
    "INSERT INTO quotations (order_id, round_no, round_label, quote_no, status, total_amount, remark, created_at, updated_at) VALUES (?,1,'R1',?,?,?,?,?,?)"
  ).run(orderId, `Q-TEST-${orderId}`, roundStatus, total, '测试报价轮次', now, now);
  const roundId = info.lastInsertRowid;
  const insert = db.prepare(
    `INSERT INTO quotation_items (quotation_id, material_no, description, material_type, price_source, unit_price_ex_vat,
      pay_percent, final_unit_price, qty, line_amount, unit, remark)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  for (const item of items) {
    const finalPrice = item.price_source === 'guide_price'
      ? Math.round(item.unit_price_ex_vat * item.pay_percent) / 100
      : item.unit_price_ex_vat;
    insert.run(
      roundId,
      item.material_no,
      item.description,
      item.material_type,
      item.price_source,
      item.unit_price_ex_vat,
      item.price_source === 'guide_price' ? item.pay_percent : 100,
      finalPrice,
      item.qty,
      Math.round(finalPrice * item.qty * 100) / 100,
      'pcs',
      '测试明细'
    );
  }
  if (status !== 'quotation') {
    db.prepare('UPDATE orders SET selected_round_id = ? WHERE id = ?').run(roundId, orderId);
  }
  return { roundId, total };
}

function insertApprovals(db, orderId, roundId, mode, adminId) {
  const now = nowUtc();
  const insert = db.prepare(
    'INSERT INTO approval_records (order_id, quotation_id, approval_type, status, approver_id, applied_at, responded_at, remark) VALUES (?,?,?,?,?,?,?,?)'
  );
  for (const type of ['sales_force', 'oa_contract']) {
    insert.run(
      orderId,
      roundId,
      type,
      mode === 'pending' ? 'pending' : 'approved',
      mode === 'pending' ? null : adminId,
      now,
      mode === 'pending' ? null : now,
      '测试审批'
    );
  }
}

function insertFinance(db, orderId, orderNo, total) {
  const now = nowUtc();
  db.prepare('UPDATE orders SET sales_order = ?, total_amount = ?, payment_terms = ? WHERE id = ?').run(
    `SO-TEST-${orderNo}`,
    total,
    'TT60',
    orderId
  );
  db.prepare(
    'INSERT INTO customer_pos (order_id, po_number, po_amount, remark, created_at) VALUES (?,?,?,?,?)'
  ).run(orderId, `PO-${orderNo}`, total, '测试 PO', now);
}

function insertShipping(db, orderId, index, total) {
  const now = nowUtc();
  const today = todayLocal();
  const po = db.prepare('SELECT id FROM customer_pos WHERE order_id = ?').get(orderId);
  const insertBatch = db.prepare(
    'INSERT INTO shipping_batches (order_id, batch_no, batch_percent, shipped_date, remark, sort_order, created_at) VALUES (?,?,?,?,?,?,?)'
  );
  if (index === 1) {
    insertBatch.run(orderId, `SHIP-${orderId}-1`, 100, today, '一次性发货', 1, now);
  } else {
    insertBatch.run(orderId, `SHIP-${orderId}-1`, 50, today, '第一批', 1, now);
    insertBatch.run(orderId, `SHIP-${orderId}-2`, 50, today, '第二批', 2, now);
  }
  const info = db.prepare(
    'INSERT INTO invoice_records (order_id, po_id, invoice_no, amount, invoice_date, remark, created_at) VALUES (?,?,?,?,?,?,?)'
  ).run(orderId, po.id, `INV-${orderId}`, total, today, '测试发票', now);
  return info.lastInsertRowid;
}

function finalizeOrder(db, orderId, status, index, total) {
  const now = nowUtc();
  const today = todayLocal();
  if (['finance', 'shipping_invoicing', 'commission', 'closed'].includes(status)) {
    db.prepare("UPDATE orders SET bid_result = 'won' WHERE id = ?").run(orderId);
  }
  if (status === 'shipping_invoicing') {
    if (index === 1) {
      db.prepare('UPDATE orders SET delivered = 1, delivered_date = ? WHERE id = ?').run(today, orderId);
    } else {
      db.prepare('UPDATE orders SET invoiced = 1, invoiced_date = ? WHERE id = ?').run(today, orderId);
    }
    return;
  }
  if (status === 'commission') {
    db.prepare(
      'UPDATE orders SET delivered = 1, delivered_date = ?, invoiced = 1, invoiced_date = ?, commission_matched = 0 WHERE id = ?'
    ).run(today, today, orderId);
    return;
  }
  if (status === 'closed') {
    const commissionAmount = Math.round(total * 0.01 * 100) / 100;
    db.prepare(
      `UPDATE orders SET delivered = 1, delivered_date = ?, invoiced = 1, invoiced_date = ?,
       commission_matched = 1, commission_amount = ?, commission_date = ?, closed_at = ? WHERE id = ?`
    ).run(today, today, commissionAmount, now, now, orderId);
    return;
  }
  if (status === 'lost_closed') {
    db.prepare("UPDATE orders SET bid_result = 'lost', closed_at = ? WHERE id = ?").run(now, orderId);
    return;
  }
  if (status === 'cancelled') {
    db.prepare('UPDATE orders SET closed_at = ? WHERE id = ?').run(now, orderId);
  }
}

function insertAttachments(db, orderId, index, stages, refs) {
  let count = 0;
  const now = nowUtc();
  const insert = db.prepare(
    `INSERT INTO order_attachments (order_id, stage, file_name, file_path, file_type, reference_type, reference_id, uploaded_at)
     VALUES (?,?,?,?,?,?,?,?)`
  );
  for (const stage of stages) {
    for (let n = 1; n <= ATTACHMENT_COUNT_PER_STEP; n += 1) {
      const dir = path.join(getUploadDir(), String(orderId), stage);
      fs.mkdirSync(dir, { recursive: true });
      const fileName = `${ATTACHMENT_LABELS[stage]}-${String(index).padStart(2, '0')}-${n}.pdf`;
      const relPath = `${orderId}/${stage}/${fileName}`;
      fs.writeFileSync(path.join(dir, fileName), buildPdfBuffer(`TEST ${stage} ${index} ${n}`));
      let referenceType = null;
      let referenceId = null;
      if (stage === 'proposal' && refs.versionId) {
        referenceType = 'proposal_version';
        referenceId = refs.versionId;
      } else if (stage === 'invoicing' && refs.invoiceId) {
        referenceType = 'invoice_record';
        referenceId = refs.invoiceId;
      }
      insert.run(orderId, stage, fileName, relPath, 'pdf', referenceType, referenceId, now);
      count += 1;
    }
  }
  return count;
}

function printSummary(summary, totals) {
  console.log(
    `测试数据生成完成：${totals.orderTotal} 条订单 / ${totals.attachmentTotal} 条附件记录 / ` +
    `${totals.guidePriceTotal} 条指导价 / ${totals.frameworkTotal} 条框架协议价`
  );
  if (totals.removedOrders > 0) console.log(`已替换旧测试订单 ${totals.removedOrders} 条`);
  if (totals.removedPrices > 0) console.log(`已替换旧测试价格 ${totals.removedPrices} 条`);
  if (totals.removedCustomers > 0) console.log(`已清理旧测试客户 ${totals.removedCustomers} 条`);
  console.log('');
  for (const row of summary) {
    console.log(`${row.label}  ${row.orders.join(', ')}  附件 ${row.attachments}`);
  }
}

export function seedTestData(options = {}) {
  const clean = Boolean(options.clean ?? process.argv.includes('--clean'));
  if (options.dataDir) initDb(options.dataDir);
  else initDb();
  const db = getDb();
  try {
    const removedOrders = cleanupTestOrders(db);
    const removedPrices = cleanupTestPrices(db);
    const removedCustomers = clean ? cleanupTestCustomers(db) : 0;

    const endA = ensureCustomer(db, 'end_customers', `${TEST_CUSTOMER_MARK}最终客户甲`, 'TEST-EA', '张三');
    const endB = ensureCustomer(db, 'end_customers', `${TEST_CUSTOMER_MARK}最终客户乙`, 'TEST-EB', '李四');
    const contractA = ensureCustomer(db, 'contract_customers', `${TEST_CUSTOMER_MARK}合同客户甲`, 'TEST-CA', '王五');
    const contractB = ensureCustomer(db, 'contract_customers', `${TEST_CUSTOMER_MARK}合同客户乙`, 'TEST-CB', '赵六');
    const guidePriceTotal = insertGuidePrices(db);
    const frameworkTotal = insertFrameworkMaterials(db, endA);

    const adminRow = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
    if (!adminRow) throw new Error('admin 用户不存在，请先启动服务初始化数据库');

    const summary = [];
    let attachmentTotal = 0;
    let orderTotal = 0;

    const seed = db.transaction(() => {
      for (const [status, statusLabel] of STAGES) {
        const orderRows = [];
        let attachments = 0;
        for (let index = 1; index <= 2; index += 1) {
          const endCustomerId = index === 1 ? endA : endB;
          const contractCustomerId = index === 1 ? contractA : contractB;
          const { id: orderId, orderId: orderNo } = insertOrder(db, status, statusLabel, index, endCustomerId, contractCustomerId);

          const hasProposal = ['proposal', 'quotation', 'approval_pending', 'bid_decision', 'finance', 'shipping_invoicing', 'commission', 'closed', 'lost_closed', 'cancelled'].includes(status);
          const hasRound = ['quotation', 'approval_pending', 'bid_decision', 'finance', 'shipping_invoicing', 'commission', 'closed', 'lost_closed', 'cancelled'].includes(status);
          const hasApprovals = ['approval_pending', 'bid_decision', 'finance', 'shipping_invoicing', 'commission', 'closed', 'lost_closed', 'cancelled'].includes(status);
          const hasFinance = ['finance', 'shipping_invoicing', 'commission', 'closed'].includes(status);
          const hasShipping = ['shipping_invoicing', 'commission', 'closed'].includes(status);

          let versionId = null;
          let roundTotal = null;
          let invoiceId = null;
          if (hasProposal) versionId = insertProposal(db, orderId, index);
          if (hasRound) roundTotal = insertQuotation(db, orderId, index, status).total;
          if (hasApprovals) {
            const roundId = db.prepare('SELECT selected_round_id FROM orders WHERE id = ?').get(orderId).selected_round_id;
            insertApprovals(db, orderId, roundId, status === 'approval_pending' ? 'pending' : 'approved', adminRow.id);
          }
          if (hasFinance) insertFinance(db, orderId, orderNo, roundTotal);
          if (hasShipping) invoiceId = insertShipping(db, orderId, index, roundTotal);

          finalizeOrder(db, orderId, status, index, roundTotal);
          attachments += insertAttachments(db, orderId, index, ATTACHMENT_STAGES_BY_STATUS[status], { versionId, invoiceId });
          orderRows.push(orderNo);
          orderTotal += 1;
        }
        summary.push({ label: statusLabel, orders: orderRows, attachments });
        attachmentTotal += attachments;
      }
    });
    seed();

    printSummary(summary, { removedOrders, removedPrices, removedCustomers, orderTotal, attachmentTotal, guidePriceTotal, frameworkTotal });
    return { orders: orderTotal, attachments: attachmentTotal, guidePrices: guidePriceTotal, frameworkPrices: frameworkTotal };
  } finally {
    closeDb();
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  seedTestData({ dataDir: process.env.DATA_DIR });
}
