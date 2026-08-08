import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import xlsx from 'xlsx';
import { initDb, closeDb, getDb, getUploadDir } from '../db/init.js';
import { createApp } from '../index.js';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iproject-smoke-'));
initDb(dataDir);
const manualRecordsDdl = getDb().prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'commission_manual_records'").get().sql;
assert.match(manualRecordsDdl, /CHECK\s*\(\s*amount\s*>=\s*0\)/i, '人工补录金额约束应为 >= 0');
const app = createApp();
const server = await new Promise((resolve) => {
  const s = app.listen(0, () => resolve(s));
});
const base = `http://127.0.0.1:${server.address().port}`;

async function call(method, url, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(base + url, { method, headers, body: payload });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

function must(res, status, message) {
  assert.strictEqual(res.status, status, `${message} -> ${JSON.stringify(res.json)}`);
  return res.json;
}

function makeCommissionWorkbook() {
  const sheet = xlsx.utils.aoa_to_sheet([
    ['SO号', '金额'],
    ['SO-001', 500],
    ['SO-001', 999]
  ]);
  const book = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(book, sheet, 'Sheet1');
  return xlsx.write(book, { type: 'buffer', bookType: 'xlsx' });
}

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`PASS ${name}`);
}

try {
  // 认证
  const badLogin = await call('POST', '/api/auth/login', { body: { username: 'admin', password: 'wrong' } });
  assert.strictEqual(badLogin.status, 401);
  const login = must(await call('POST', '/api/auth/login', { body: { username: 'admin', password: 'password' } }), 200, '登录');
  const token = login.token;
  ok('登录成功');

  for (let i = 0; i < 5; i += 1) {
    await call('POST', '/api/auth/login', { body: { username: 'admin', password: 'wrong-password' } });
  }
  const locked = await call('POST', '/api/auth/login', { body: { username: 'admin', password: 'password' } });
  assert.strictEqual(locked.status, 429);
  getDb().prepare('DELETE FROM login_attempts').run();
  ok('登录失败锁定持久化');

  // 基础数据
  const ec = must(await call('POST', '/api/end-customers', { token, body: { customer_name: '客户A', contact_person: '张三' } }), 201, '创建最终客户');
  const cc = must(await call('POST', '/api/contract-customers', { token, body: { customer_name: '合同客户A' } }), 201, '创建合同客户');
  await call('POST', '/api/guide-prices', { token, body: { material_no: 'M-001', description: '电机', guide_unit_price_ex_vat: 120 } });
  await call('POST', '/api/guide-prices', { token, body: { material_no: 'M-002', description: '泵', guide_unit_price_ex_vat: 85 } });
  await call('POST', '/api/materials', { token, body: { end_customer_id: ec.id, material_no: 'M-001', unit_price_ex_vat: 100, valid_from: '2026-01-01' } });
  await call('POST', '/api/materials', { token, body: { end_customer_id: ec.id, material_no: 'M-003', unit_price_ex_vat: 150, valid_from: '2024-01-01', valid_to: '2026-12-31' } });
  await call('POST', '/api/materials', { token, body: { end_customer_id: ec.id, material_no: 'M-003', unit_price_ex_vat: 140, valid_from: '2026-06-01', valid_to: '2026-12-31' } });
  const framework = must(await call('GET', `/api/materials/check-framework?end_customer_id=${ec.id}`, { token }), 200, '框架协议检查');
  assert.strictEqual(framework.hasFramework, 1);
  const lookup = must(await call('GET', `/api/materials/lookup?end_customer_id=${ec.id}&material_no=M-003`, { token }), 200, '价格查询');
  assert.strictEqual(lookup.price_source, 'framework');
  assert.strictEqual(Number(lookup.unit_price_ex_vat), 140);
  ok('基础数据与价格决策表');

  // 创建销售机会
  const created = must(
    await call('POST', '/api/orders', {
      token,
      body: {
        end_customer_id: ec.id,
        contract_customer_id: cc.id,
        order_type: 'A',
        project_name: '测试项目1',
        project_owner: '李工',
        year: '2026',
        month: '8'
      }
    }),
    201,
    '创建销售机会'
  );
  const orderId = created.order.id;
  assert.match(created.order.order_id, /^OPP-\d{8}-\d{4}$/);
  assert.strictEqual(created.order.status, 'customer_info');
  ok('销售机会创建与销售机会编号生成');

  must(await call('PATCH', `/api/orders/${orderId}/status`, { token, body: { action: 'advance' } }), 200, '客户信息→方案');
  const version = must(
    await call('POST', `/api/orders/${orderId}/versions`, { token, body: { version_label: 'V1' } }),
    201,
    '创建方案版本'
  );
  const fd = new FormData();
  fd.append('stage', 'proposal');
  fd.append('reference_type', 'proposal_version');
  fd.append('reference_id', String(version.id));
  fd.append('file', new Blob(['smoke-attachment'], { type: 'application/pdf' }), 'attachment.pdf');
  const attachment = must(
    await call('POST', `/api/orders/${orderId}/attachments`, { token, form: fd }),
    201,
    '方案版本附件上传'
  );
  must(await call('DELETE', `/api/orders/${orderId}/versions/${version.id}`, { token }), 200, '删除方案版本');
  assert.strictEqual(
    fs.existsSync(path.join(getUploadDir(), attachment.file_path)),
    false,
    '删除方案版本应同步清理附件文件'
  );
  ok('方案版本删除同步清理附件');
  must(await call('PATCH', `/api/orders/${orderId}/status`, { token, body: { action: 'advance', skip: 1 } }), 200, '方案跳过→报价');

  // 报价：框架价 + 指导价 + 手工价
  const rounds = must(await call('GET', `/api/orders/${orderId}/quotations`, { token }), 200, '报价轮次');
  const roundId = rounds.items[0].id;
  assert.strictEqual(rounds.items[0].status, 'draft');
  await call('POST', `/api/orders/${orderId}/quotations/${roundId}/items`, {
    token,
    body: { material_no: 'M-001', material_type: 'standard', price_source: 'framework', unit_price_ex_vat: 100, qty: 2 }
  });
  const guideItem = must(
    await call('POST', `/api/orders/${orderId}/quotations/${roundId}/items`, {
      token,
      body: { material_no: 'M-002', material_type: 'standard', price_source: 'guide_price', unit_price_ex_vat: 85, pay_percent: 90, qty: 3 }
    }),
    201,
    '指导价行'
  );
  assert.strictEqual(Number(guideItem.item.final_unit_price), 76.5);
  await call('POST', `/api/orders/${orderId}/quotations/${roundId}/items`, {
    token,
    body: { material_no: 'NON-STD-1', material_type: 'non_standard', price_source: 'manual', unit_price_ex_vat: 300, qty: 1 }
  });
  const emptyRound = must(await call('POST', `/api/orders/${orderId}/quotations`, { token, body: {} }), 201, '新增报价轮次');
  assert.strictEqual(emptyRound.items.length, 0, '新轮次不得自动复制上一轮明细');
  const importBook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(
    importBook,
    xlsx.utils.aoa_to_sheet([['物料号'], ['M-001'], ['M-002'], ['UNKNOWN-9']]),
    'Sheet1'
  );
  const importFd = new FormData();
  importFd.append(
    'file',
    new Blob([xlsx.write(importBook, { type: 'buffer', bookType: 'xlsx' })], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }),
    'items.xlsx'
  );
  const importResult = must(
    await call('POST', `/api/orders/${orderId}/quotations/${emptyRound.id}/items/import`, { token, form: importFd }),
    200,
    '报价 Excel 只导物料号'
  );
  assert.strictEqual(importResult.success_rows, 3);
  const afterImport = must(await call('GET', `/api/orders/${orderId}/quotations`, { token }), 200, '报价轮次查询');
  const importedItems = afterImport.items.find((round) => round.id === emptyRound.id).items;
  assert.strictEqual(importedItems.length, 3);
  const unknown = importedItems.find((item) => item.material_no === 'UNKNOWN-9');
  assert.strictEqual(unknown.price_source, 'manual');
  assert.strictEqual(unknown.unit_price_ex_vat, null);
  ok('报价 Excel 自动带价、未知物料留空人工处理');
  await call('DELETE', `/api/orders/${orderId}/quotations/${emptyRound.id}`, { token });
  const submitted = must(
    await call('PATCH', `/api/orders/${orderId}/quotations/${roundId}`, { token, body: { action: 'submit' } }),
    200,
    '提交报价'
  );
  assert.strictEqual(Number(submitted.total_amount), 729.5);
  ok('报价三来源价格计算与提交');

  const pdfPost = must(await call('POST', `/api/orders/${orderId}/quotations/${roundId}/pdf`, { token, body: {} }), 200, '报价 PDF 生成');
  assert.ok(pdfPost.url);
  const dlToken = must(await call('POST', '/api/auth/download-token', { token, body: {} }), 200, '下载令牌');
  const pdfGet = await fetch(base + pdfPost.url, { headers: { Authorization: `Bearer ${dlToken.token}` } });
  assert.strictEqual(pdfGet.status, 200);
  assert.match(String(pdfGet.headers.get('content-type') || ''), /application\/pdf/);
  ok('报价单 PDF 导出');

  must(await call('PATCH', `/api/orders/${orderId}/status`, { token, body: { action: 'submit-approval', round_id: roundId } }), 200, '提交审批');
  const sf = must(await call('POST', `/api/orders/${orderId}/approvals`, { token, body: { approval_type: 'sales_force' } }), 201, 'Sales Force 审批提交');
  const dup = await call('POST', `/api/orders/${orderId}/approvals`, { token, body: { approval_type: 'sales_force' } });
  assert.strictEqual(dup.status, 400);
  const oa = must(await call('POST', `/api/orders/${orderId}/approvals`, { token, body: { approval_type: 'oa_contract' } }), 201, 'OA 审批提交');
  await call('PUT', `/api/orders/${orderId}/approvals/${sf.id}`, { token, body: { action: 'approve' } });
  const afterOa = must(await call('PUT', `/api/orders/${orderId}/approvals/${oa.id}`, { token, body: { action: 'approve' } }), 200, '双线通过');
  assert.strictEqual(afterOa.status, 'bid_decision');
  ok('双线审批通过自动推进');

  must(await call('PATCH', `/api/orders/${orderId}/status`, { token, body: { action: 'bid', result: 'won' } }), 200, '中标');
  let detail = must(await call('GET', `/api/orders/${orderId}`, { token }), 200, '销售机会详情');
  assert.strictEqual(Number(detail.order.total_amount), 729.5);
  ok('中标自动写入总金额');

  must(await call('PATCH', `/api/orders/${orderId}`, { token, body: { sales_order: 'SO-001' } }), 200, '录入 SO');
  await call('POST', `/api/orders/${orderId}/customer-pos`, { token, body: { po_number: 'PO-001', po_amount: 729.5 } });
  must(await call('PATCH', `/api/orders/${orderId}/status`, { token, body: { action: 'advance' } }), 200, '财务→发货开票');

  // 发货批次 <100% 阻止
  await call('POST', `/api/orders/${orderId}/shipping`, { token, body: { batch_percent: 40 } });
  const blocked = await call('PATCH', `/api/orders/${orderId}/status`, { token, body: { action: 'toggle-delivered', delivered: 1 } });
  assert.strictEqual(blocked.status, 400);
  await call('POST', `/api/orders/${orderId}/shipping`, { token, body: { batch_percent: 60 } });
  must(await call('PATCH', `/api/orders/${orderId}/status`, { token, body: { action: 'toggle-delivered', delivered: 1 } }), 200, '批次100%发货');
  ok('发货批次累计校验');

  const pos = must(await call('GET', `/api/orders/${orderId}/customer-pos`, { token }), 200, 'PO 列表');
  const over = must(
    await call('POST', `/api/orders/${orderId}/invoices`, {
      token,
      body: { po_id: pos.items[0].id, invoice_no: 'INV-001', amount: 800, confirm: 1 }
    }),
    201,
    '超开确认'
  );
  assert.ok(over.item.id > 0);
  detail = must(await call('GET', `/api/orders/${orderId}`, { token }), 200, '销售机会详情2');
  assert.strictEqual(detail.order.status, 'commission');
  assert.strictEqual(Number(detail.order.invoiced), 1);
  ok('开票自动标记、超开审计与并行推进');

  // 佣金 Excel 匹配
  const buildCommissionForm = () => {
    const form = new FormData();
    form.append('file', new Blob([makeCommissionWorkbook()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'commission.xlsx');
    form.append('soColumn', 'SO号');
    form.append('amountColumns', '金额');
    form.append('sheets', JSON.stringify([{ sheetName: 'Sheet1', headerRowIdx: 0 }]));
    return form;
  };
  const commission = must(await call('POST', '/api/commission/upload', { token, form: buildCommissionForm() }), 200, '佣金匹配');
  assert.strictEqual(commission.matched, 1);
  assert.strictEqual(commission.duplicate_so_count, 1);
  detail = must(await call('GET', `/api/orders/${orderId}`, { token }), 200, '销售机会详情3');
  assert.strictEqual(detail.order.status, 'closed');
  assert.strictEqual(Number(detail.order.commission_amount), 1499);
  ok('佣金匹配闭环（含重复 SO 计数）');

  const secondUpload = must(await call('POST', '/api/commission/upload', { token, form: buildCommissionForm() }), 200, '重复上传');
  assert.strictEqual(secondUpload.matched, 0);
  assert.strictEqual(secondUpload.skipped_matched_count, 1);
  const logs = must(await call('GET', '/api/commission/imports', { token }), 200, '佣金导入日志');
  assert.strictEqual(logs.items.length, 2);
  ok('佣金重复上传幂等');

  // 审批驳回重提
  const order2 = must(
    await call('POST', '/api/orders', {
      token,
      body: { end_customer_id: ec.id, contract_customer_id: cc.id, order_type: 'B', project_name: '测试项目2', project_owner: '王工' }
    }),
    201,
    '创建销售机会2'
  ).order;
  await call('PATCH', `/api/orders/${order2.id}/status`, { token, body: { action: 'advance' } });
  await call('PATCH', `/api/orders/${order2.id}/status`, { token, body: { action: 'advance', skip: 1 } });
  const rounds2 = must(await call('GET', `/api/orders/${order2.id}/quotations`, { token }), 200, '销售机会2报价');
  const round2 = rounds2.items[0].id;
  await call('POST', `/api/orders/${order2.id}/quotations/${round2}/items`, {
    token,
    body: { material_no: 'NON-STD-2', material_type: 'non_standard', price_source: 'manual', unit_price_ex_vat: 10, qty: 1 }
  });
  await call('PATCH', `/api/orders/${order2.id}/quotations/${round2}`, { token, body: { action: 'submit' } });
  await call('PATCH', `/api/orders/${order2.id}/status`, { token, body: { action: 'submit-approval', round_id: round2 } });
  const sf2 = must(await call('POST', `/api/orders/${order2.id}/approvals`, { token, body: { approval_type: 'sales_force' } }), 201, 'SF 提交');
  const oa2 = must(await call('POST', `/api/orders/${order2.id}/approvals`, { token, body: { approval_type: 'oa_contract' } }), 201, 'OA 提交');
  await call('PUT', `/api/orders/${order2.id}/approvals/${sf2.id}`, { token, body: { action: 'approve' } });
  const rejected = must(
    await call('PUT', `/api/orders/${order2.id}/approvals/${oa2.id}`, { token, body: { action: 'reject', remark: '价格偏高' } }),
    200,
    'OA 驳回'
  );
  assert.strictEqual(rejected.status, 'quotation');
  const roundAfterReject = must(await call('GET', `/api/orders/${order2.id}/quotations`, { token }), 200, '驳回后轮次');
  assert.strictEqual(roundAfterReject.items[0].status, 'draft');
  const blockedResubmit = await call('PATCH', `/api/orders/${order2.id}/status`, { token, body: { action: 'submit-approval', round_id: round2 } });
  assert.strictEqual(blockedResubmit.status, 400, '草稿轮次禁止直接送审');
  must(await call('PATCH', `/api/orders/${order2.id}/quotations/${round2}`, { token, body: { action: 'submit' } }), 200, '驳回后重新提交报价');
  await call('PATCH', `/api/orders/${order2.id}/status`, { token, body: { action: 'submit-approval', round_id: round2 } });
  const sf2b = must(await call('POST', `/api/orders/${order2.id}/approvals`, { token, body: { approval_type: 'sales_force' } }), 201, 'SF 重提');
  const oa2b = must(await call('POST', `/api/orders/${order2.id}/approvals`, { token, body: { approval_type: 'oa_contract' } }), 201, 'OA 重提');
  await call('PUT', `/api/orders/${order2.id}/approvals/${sf2b.id}`, { token, body: { action: 'approve' } });
  const oa2bRes = must(await call('PUT', `/api/orders/${order2.id}/approvals/${oa2b.id}`, { token, body: { action: 'approve' } }), 200, '双线重提通过');
  assert.strictEqual(oa2bRes.status, 'bid_decision');
  ok('审批驳回重提与 superseded');

  // 未中标 → lost_closed → 数据修正回退
  must(await call('PATCH', `/api/orders/${order2.id}/status`, { token, body: { action: 'bid', result: 'lost' } }), 200, '未中标');
  const corrected2 = must(
    await call('PUT', '/api/settings/correct-order-data', {
      token,
      body: { order_id: order2.id, target_status: 'bid_decision', confirm: 1, changes: {} }
    }),
    200,
    'lost_closed 回退'
  );
  assert.strictEqual(corrected2.order.status, 'bid_decision');
  assert.strictEqual(corrected2.order.bid_result, null);
  must(await call('PATCH', `/api/orders/${order2.id}/status`, { token, body: { action: 'bid', result: 'won' } }), 200, '重新中标');
  await call('PATCH', `/api/orders/${order2.id}`, { token, body: { sales_order: 'SO-002' } });
  const pos2 = must(await call('GET', `/api/orders/${order2.id}/customer-pos`, { token }), 200, '销售机会2 PO');
  if (pos2.items.length === 0) {
    await call('POST', `/api/orders/${order2.id}/customer-pos`, { token, body: { po_number: 'PO-002', po_amount: 10 } });
  }
  must(await call('PATCH', `/api/orders/${order2.id}/status`, { token, body: { action: 'advance' } }), 200, '销售机会2 进入发货开票');
  must(await call('PATCH', `/api/orders/${order2.id}/status`, { token, body: { action: 'toggle-delivered', delivered: 1 } }), 200, '销售机会2 发货（无批次）');
  const pos2b = must(await call('GET', `/api/orders/${order2.id}/customer-pos`, { token }), 200, '销售机会2 PO 2');
  await call('POST', `/api/orders/${order2.id}/invoices`, { token, body: { po_id: pos2b.items[0].id, invoice_no: 'INV-003', amount: 10 } });
  detail = must(await call('GET', `/api/orders/${order2.id}`, { token }), 200, '销售机会2 自动开票');
  assert.strictEqual(detail.order.status, 'commission');
  must(await call('POST', '/api/commission/manual', { token, body: { order_id: order2.id, amount: 88, remark: 'Excel 遗漏' } }), 201, '人工补录');
  detail = must(await call('GET', `/api/orders/${order2.id}`, { token }), 200, '销售机会2 详情');
  assert.strictEqual(detail.order.status, 'closed');
  assert.strictEqual(Number(detail.order.commission_amount), 88);
  ok('人工补录佣金闭环');

  // 数据修正：closed → shipping_invoicing 清空佣金防死锁
  const fixed = must(
    await call('PUT', '/api/settings/correct-order-data', {
      token,
      body: { order_id: orderId, target_status: 'shipping_invoicing', confirm: 1, changes: { delivered: 0, invoiced: 0 } }
    }),
    200,
    '数据修正回退'
  );
  assert.strictEqual(fixed.order.status, 'shipping_invoicing');
  assert.strictEqual(fixed.order.commission_matched, 0);
  assert.strictEqual(fixed.order.commission_amount, null);
  await call('PATCH', `/api/orders/${orderId}/status`, { token, body: { action: 'toggle-delivered', delivered: 1 } });
  await call('PATCH', `/api/orders/${orderId}/status`, { token, body: { action: 'toggle-invoiced', invoiced: 1 } });
  detail = must(await call('GET', `/api/orders/${orderId}`, { token }), 200, '销售机会详情4');
  assert.strictEqual(detail.order.status, 'commission');
  ok('数据修正回退清空佣金');

  // 看板/历史销售/待办/审计
  await call('POST', '/api/todos', { token, body: { title: '跟进回款', priority: 'high', due_date: '2026-07-30' } });
  const overdue = must(await call('GET', '/api/todos/overdue-count', { token }), 200, '逾期待办');
  assert.ok(overdue.count >= 1);
  const dash = must(await call('GET', '/api/dashboard', { token }), 200, '看板');
  assert.ok(dash.totalOrders >= 2);
  const history = must(await call('GET', '/api/sales-history', { token }), 200, '历史销售');
  assert.ok(history.items.length >= 1);
  const audits = must(await call('GET', '/api/audit-logs', { token }), 200, '审计日志');
  const actions = new Set(audits.items.map((row) => row.action));
  for (const action of ['approval_submit', 'approval_approve', 'approval_reject', 'invoice_override', 'data_correct', 'commission_manual']) {
    assert.ok(actions.has(action), `缺少审计动作 ${action}`);
  }
  ok('看板/历史销售/待办/审计日志');

  // 软重置
  must(await call('POST', '/api/settings/reset-business', { token, body: { password: 'password' } }), 200, '软重置');
  assert.strictEqual(getDb().prepare('SELECT COUNT(*) AS c FROM orders').get().c, 0);
  assert.strictEqual(getDb().prepare("SELECT COUNT(*) AS c FROM users WHERE username='admin'").get().c, 1);
  ok('软重置保留用户与工作流');

  // 硬重置：JWT 失效 + uploads 清空 + audit 保留
  await call('POST', '/api/settings/reset-factory', { token, body: { password: 'password' } });
  const oldToken = await call('GET', '/api/dashboard', { token });
  assert.strictEqual(oldToken.status, 401);
  const relogin = must(await call('POST', '/api/auth/login', { body: { username: 'admin', password: 'password' } }), 200, '硬重置后登录');
  const auditAfter = must(await call('GET', '/api/audit-logs', { token: relogin.token }), 200, '硬重置后审计');
  assert.ok(auditAfter.items.some((row) => row.action === 'reset_factory'));
  const uploads = path.join(dataDir, 'uploads');
  assert.strictEqual(fs.readdirSync(uploads).length, 0);
  ok('硬重置轮换 JWT 并保留审计');

  console.log(`\n全部通过：${passed} 项`);
  process.exitCode = 0;
} catch (err) {
  console.error('\nSMOKE FAIL:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
} finally {
  closeDb();
  server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
