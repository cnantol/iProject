import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import xlsx from 'xlsx';
import PDFDocument from 'pdfkit';
import { initDb, closeDb, getDb, getUploadDir } from '../db/init.js';
import { nowUtc } from '../utils.js';
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

function makeInvoicePdf() {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4' });
    const fontPath = '/System/Library/Fonts/Supplemental/Arial Unicode.ttf';
    if (fs.existsSync(fontPath)) {
      doc.registerFont('cjk', fontPath);
      doc.font('cjk');
    }
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.text('增值税电子普通发票');
    doc.text('发票号码：');
    doc.text('开票日期：');
    doc.text('123456789012345678');
    doc.text('2026年5月1日');
    doc.text('价税合计（大写） （小写）');
    doc.text('合 计 ¥ 100.00 ¥ 13.00');
    doc.text('价税合计（小写）：¥113.00');
    doc.end();
  });
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

  const importWorkbook = (headers, rows) => {
    const book = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(book, xlsx.utils.aoa_to_sheet([headers, ...rows]), 'Sheet1');
    return xlsx.write(book, { type: 'buffer', bookType: 'xlsx' });
  };
  const uploadImport = async (target, headers, rows, mapping) => {
    const form = new FormData();
    form.append('file', new Blob([importWorkbook(headers, rows)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'import.xlsx');
    if (mapping) form.append('mapping', JSON.stringify(mapping));
    const started = must(await call('POST', `/api/settings/import/${target}`, { token, form }), 200, '数据导入启动');
    for (let i = 0; i < 60; i += 1) {
      const progress = must(await call('GET', `/api/settings/import-progress/${started.task_id}`, { token }), 200, '数据导入进度');
      if (progress.status === 'done' || progress.status === 'error') return progress;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('数据导入超时');
  };
  const importDone = await uploadImport('guide_price', ['物料号', '描述', '指导价'], [
    ['M-IMP-1', '测试物料1', 10],
    ['M-IMP-2', '测试物料2', 20]
  ]);
  assert.strictEqual(importDone.status, 'done');
  assert.strictEqual(importDone.success_rows, 2);
  assert.strictEqual(importDone.fail_rows, 0);
  const mappingDone = await uploadImport('guide_price', ['Material', 'Desc', 'Price'], [
    ['M-MAP-1', '映射物料', 30]
  ], { 物料号: 'Material', 描述: 'Desc', 指导价: 'Price' });
  assert.strictEqual(mappingDone.status, 'done');
  assert.strictEqual(mappingDone.success_rows, 1);
  const emptyForm = new FormData();
  emptyForm.append('file', new Blob([importWorkbook(['物料号', '指导价'], [])], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'empty.xlsx');
  const emptyImport = await call('POST', '/api/settings/import/guide_price', { token, form: emptyForm });
  assert.strictEqual(emptyImport.status, 400);
  ok('数据导入批读与列映射边界');

  const historyHeaders = ['商机编号', '年份', '月份', '最终客户', '合同客户', '项目名称', '项目负责人', '商机类型', '状态', 'Sales Order', '总金额', '是否发货', '发货日期', '是否开票', '开票日期', '佣金是否匹配', '佣金金额', '付款条款', '项目编号', '车间', '项目备注'];
  const historyImport = await uploadImport('history', historyHeaders, [
    ['abc', '2026', '5', ec.customer_name, cc.customer_name, '自动编号导入测试', '李工', 'A', '', 'SO-HIST-AUTO', 100, 1, '2026-05-01', 1, '2026-05-01', 0, 0, 'TT60', '', '', '备注']
  ]);
  assert.strictEqual(historyImport.status, 'done');
  assert.strictEqual(historyImport.success_rows, 1);
  const autoOrder = getDb().prepare('SELECT id, order_id FROM orders WHERE sales_order = ?').get('SO-HIST-AUTO');
  assert.ok(autoOrder);
  assert.strictEqual(autoOrder.order_id, String(autoOrder.id).padStart(4, '0'));
  ok('历史商机导入自动生成编号');

  // 创建商机
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
    '创建商机'
  );
  const orderId = created.order.id;
  assert.match(created.order.order_id, /^\d{4}$/);
  const idConsistency = must(await call('GET', '/api/settings/order-id-consistency', { token }), 200, '商机 ID 一致性');
  assert.strictEqual(idConsistency.ok, true);
  assert.strictEqual(idConsistency.mismatched.length, 0);
  assert.strictEqual(created.order.status, 'customer_info');
  assert.strictEqual(created.order.month, '08');
  const note = must(
    await call('POST', `/api/orders/${orderId}/notes`, { token, body: { content: 'Project Log 测试' } }),
    201,
    '新增 Project Log'
  );
  assert.strictEqual(note.item.content, 'Project Log 测试');
  const noteList = must(await call('GET', `/api/orders/${orderId}/notes`, { token }), 200, 'Project Log 列表');
  assert.strictEqual(noteList.items.length, 1);
  assert.strictEqual(noteList.items[0].id, note.item.id);
  must(await call('DELETE', `/api/orders/${orderId}/notes/${note.item.id}`, { token }), 200, '删除 Project Log');
  ok('Project Log');
  const backupFile = path.join(dataDir, 'opportunity-backup.xlsx');
  assert.ok(fs.existsSync(backupFile), '新建商机应自动生成备份 Excel');
  const backupWorkbook = xlsx.read(fs.readFileSync(backupFile), { type: 'buffer' });
  const backupRows = xlsx.utils.sheet_to_json(backupWorkbook.Sheets[backupWorkbook.SheetNames[0]], { header: 1, defval: null, raw: true });
  assert.ok(backupRows.some((row) => String(row[0]) === created.order.order_id));
  const exportRes = await fetch(base + '/api/orders/export', { headers: { Authorization: `Bearer ${token}` } });
  assert.strictEqual(exportRes.status, 200);
  assert.match(String(exportRes.headers.get('content-type') || ''), /spreadsheet/);
  ok('商机自动备份与 Excel 导出');
  ok('商机创建与商机编号生成');

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

  // 全新报价单模板 API
  const templateRes = must(await call('GET', '/api/quotation-template', { token }), 200, '报价单模板读取');
  assert.strictEqual(templateRes.version, 1);
  assert.ok(Array.isArray(templateRes.columnFields));
  const templateFields = must(await call('GET', '/api/quotation-template/fields', { token }), 200, '报价单字段目录');
  assert.ok(templateFields.infoFields.length > 0);
  assert.ok(templateFields.columnFields.length > 0);
  const savedTemplate = must(
    await call('PUT', '/api/quotation-template', { token, body: { ...templateRes, name: 'smoke 模板', palette: { primary: '#B71C1C' } } }),
    200,
    '报价单模板保存'
  );
  assert.strictEqual(savedTemplate.name, 'smoke 模板');
  const pdfPreviewRes = await fetch(base + '/api/quotation-template/preview-pdf', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.strictEqual(pdfPreviewRes.status, 200);
  assert.match(String(pdfPreviewRes.headers.get('content-type') || ''), /application\/pdf/);
  const validateRes = must(await call('POST', '/api/quotation-template/validate', { token, body: templateRes }), 200, '报价单模板校验');
  assert.ok(Array.isArray(validateRes.warnings));
  must(await call('POST', '/api/quotation-template/reset', { token }), 200, '报价单模板重置');
  ok('全新报价单模板 API 与 PDF 预览');

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
  let detail = must(await call('GET', `/api/orders/${orderId}`, { token }), 200, '商机详情');
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
  const invoicePdf = await makeInvoicePdf();
  const invoiceFd = new FormData();
  invoiceFd.append('file', new Blob([invoicePdf], { type: 'application/pdf' }), 'invoice.pdf');
  invoiceFd.append('stage', 'invoicing');
  const invoiceAttachment = must(
    await call('POST', `/api/orders/${orderId}/attachments`, { token, form: invoiceFd }),
    201,
    '发票附件上传'
  );
  const recognized = must(
    await call('POST', `/api/orders/${orderId}/invoices/recognize`, { token, body: { attachment_id: invoiceAttachment.id } }),
    200,
    'PDF 发票识别'
  );
  assert.strictEqual(recognized.recognized, true);
  assert.strictEqual(recognized.invoice_no, '123456789012345678');
  assert.strictEqual(recognized.invoice_date, '2026-05-01');
  assert.strictEqual(Number(recognized.amount), 100);
  assert.strictEqual(Number(recognized.tax_amount), 13);
  assert.strictEqual(Number(recognized.tax_rate), 13);
  assert.strictEqual(Number(recognized.total_amount_incl_tax), 113);
  const over = must(
    await call('POST', `/api/orders/${orderId}/invoices`, {
      token,
      body: { po_id: pos.items[0].id, invoice_no: 'INV-001', amount: 800, confirm: 1, attachment_id: invoiceAttachment.id }
    }),
    201,
    '超开确认'
  );
  const dupInvoice = await call('POST', `/api/orders/${orderId}/invoices`, {
    token,
    body: { po_id: pos.items[0].id, invoice_no: 'INV-001', amount: 800, confirm: 1 }
  });
  assert.strictEqual(dupInvoice.status, 400, '重复发票号应返回 400');
  const boundAttachment = getDb().prepare('SELECT reference_type, reference_id FROM order_attachments WHERE id = ?').get(invoiceAttachment.id);
  assert.strictEqual(boundAttachment.reference_type, 'invoice_record');
  assert.ok(Number(boundAttachment.reference_id) > 0);
  ok('PDF 发票识别与附件绑定');
  assert.ok(over.item.id > 0);
  detail = must(await call('GET', `/api/orders/${orderId}`, { token }), 200, '商机详情2');
  assert.strictEqual(detail.order.status, 'commission');
  assert.strictEqual(Number(detail.order.invoiced), 1);
  ok('开票自动标记、超开审计与并行推进');

  const waiting = must(await call('GET', '/api/commission/waiting', { token }), 200, '佣金等待清单');
  assert.ok(waiting.items.some((item) => item.id === orderId));
  assert.ok(waiting.items.some((item) => Array.isArray(item.pos)));
  assert.ok(waiting.total >= 1);
  assert.ok(waiting.limit >= 1);
  ok('佣金等待清单批量加载 PO');

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
  assert.strictEqual(commission.skipped_matched_count, 0);
  detail = must(await call('GET', `/api/orders/${orderId}`, { token }), 200, '商机详情3');
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
    '创建商机2'
  ).order;
  await call('PATCH', `/api/orders/${order2.id}/status`, { token, body: { action: 'advance' } });
  await call('PATCH', `/api/orders/${order2.id}/status`, { token, body: { action: 'advance', skip: 1 } });
  const rounds2 = must(await call('GET', `/api/orders/${order2.id}/quotations`, { token }), 200, '商机2报价');
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
  const approvalsAfterReject = must(await call('GET', `/api/orders/${order2.id}/approvals`, { token }), 200, '驳回后审批记录');
  assert.strictEqual(approvalsAfterReject.items.find((item) => item.id === sf2.id)?.status, 'approved', '驳回不应清除另一线已通过记录');
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

  // 未中标 → lost_closed → 流程回退
  must(await call('PATCH', `/api/orders/${order2.id}/status`, { token, body: { action: 'bid', result: 'lost' } }), 200, '未中标');
  const corrected2 = must(
    await call('PUT', `/api/order-corrections/${order2.id}`, {
      token,
      body: { target: 'bid_decision', confirm: 1, expected_status: 'lost_closed' }
    }),
    200,
    'lost_closed 回退'
  );
  assert.strictEqual(corrected2.order.status, 'bid_decision');
  assert.strictEqual(corrected2.order.bid_result, null);
  must(await call('PATCH', `/api/orders/${order2.id}/status`, { token, body: { action: 'bid', result: 'won' } }), 200, '重新中标');
  await call('PATCH', `/api/orders/${order2.id}`, { token, body: { sales_order: 'SO-002' } });
  const pos2 = must(await call('GET', `/api/orders/${order2.id}/customer-pos`, { token }), 200, '商机2 PO');
  if (pos2.items.length === 0) {
    await call('POST', `/api/orders/${order2.id}/customer-pos`, { token, body: { po_number: 'PO-002', po_amount: 10 } });
  }
  must(await call('PATCH', `/api/orders/${order2.id}/status`, { token, body: { action: 'advance' } }), 200, '商机2 进入发货开票');
  must(await call('PATCH', `/api/orders/${order2.id}/status`, { token, body: { action: 'toggle-delivered', delivered: 1 } }), 200, '商机2 发货（无批次）');
  const pos2b = must(await call('GET', `/api/orders/${order2.id}/customer-pos`, { token }), 200, '商机2 PO 2');
  await call('POST', `/api/orders/${order2.id}/invoices`, { token, body: { po_id: pos2b.items[0].id, invoice_no: 'INV-003', amount: 10 } });
  detail = must(await call('GET', `/api/orders/${order2.id}`, { token }), 200, '商机2 自动开票');
  assert.strictEqual(detail.order.status, 'commission');
  must(await call('POST', '/api/commission/manual', { token, body: { order_id: order2.id, amount: 88, remark: 'Excel 遗漏' } }), 201, '人工补录');
  detail = must(await call('GET', `/api/orders/${order2.id}`, { token }), 200, '商机2 详情');
  assert.strictEqual(detail.order.status, 'closed');
  assert.strictEqual(Number(detail.order.commission_amount), 88);
  ok('人工补录佣金闭环');

  // 流程回退：closed → shipping_invoicing 清空佣金防死锁
  const fixed = must(
    await call('PUT', `/api/order-corrections/${orderId}`, {
      token,
      body: { target: 'shipping_invoicing', confirm: 1, expected_status: 'closed' }
    }),
    200,
    '流程回退清空佣金'
  );
  assert.strictEqual(fixed.order.status, 'shipping_invoicing');
  assert.strictEqual(fixed.order.commission_matched, 0);
  assert.strictEqual(fixed.order.commission_amount, null);
  await call('PATCH', `/api/orders/${orderId}/status`, { token, body: { action: 'toggle-delivered', delivered: 1 } });
  await call('PATCH', `/api/orders/${orderId}/status`, { token, body: { action: 'toggle-invoiced', invoiced: 1 } });
  detail = must(await call('GET', `/api/orders/${orderId}`, { token }), 200, '商机详情4');
  assert.strictEqual(detail.order.status, 'commission');
  ok('流程回退清空佣金');

  // 全新数据回退 API：选项、预览与执行
  const rcMeta = must(await call('GET', `/api/order-corrections/${orderId}`, { token }), 200, '回退选项');
  assert.ok(rcMeta.validTargets.includes('shipping_invoicing'));
  assert.ok(rcMeta.validTargets.includes('finance'));
  assert.ok(rcMeta.validTargets.includes('quotation'));
  assert.ok(!rcMeta.validTargets.includes('commission'));
  const allActiveSteps = ['customer_info', 'proposal', 'quotation', 'approval_pending', 'bid_decision', 'finance', 'shipping_invoicing', 'commission'];
  for (const step of allActiveSteps) {
    const expected = rcMeta.validTargets.includes(step) ? 200 : 400;
    const planRes = await call('GET', `/api/order-corrections/${orderId}/plan?target=${step}`, { token });
    assert.strictEqual(planRes.status, expected, `回退目标 ${step} 应与选项一致`);
  }
  const rcBadId = await call('GET', '/api/order-corrections/abc', { token });
  assert.strictEqual(rcBadId.status, 404);
  const rcBadAuditParams = await call('GET', '/api/audit-logs?page=abc&limit=abc', { token });
  assert.strictEqual(rcBadAuditParams.status, 200);
  const rcInvoice = getDb().prepare('SELECT id FROM invoice_records WHERE order_id = ? LIMIT 1').get(orderId);
  getDb().prepare(
    'INSERT INTO order_attachments (order_id, stage, file_name, file_path, file_type, reference_type, reference_id, uploaded_at) VALUES (?,?,?,?,?,?,?,?)'
  ).run(orderId, 'invoicing', 'smoke-invoice.pdf', `${orderId}/invoicing/smoke-invoice.pdf`, 'pdf', 'invoice_record', rcInvoice.id, nowUtc());
  const rcPlan = must(await call('GET', `/api/order-corrections/${orderId}/plan?target=finance`, { token }), 200, '回退预览');
  assert.strictEqual(rcPlan.plan.target, 'finance');
  assert.strictEqual(rcPlan.plan.deletions.invoices, 1);
  assert.strictEqual(rcPlan.plan.deletions.invoiceAttachments, 2);
  assert.strictEqual(rcPlan.plan.deletions.shippingBatches, 2);
  assert.strictEqual(rcPlan.plan.fieldChanges.closed_at, null);
  const rcNoConfirm = await call('PUT', `/api/order-corrections/${orderId}`, { token, body: { target: 'finance' } });
  assert.strictEqual(rcNoConfirm.status, 400);
  const rcWrongStatus = await call('PUT', `/api/order-corrections/${orderId}`, {
    token,
    body: { target: 'finance', confirm: 1, expected_status: 'closed' }
  });
  assert.strictEqual(rcWrongStatus.status, 400);
  const rcFinance = must(
    await call('PUT', `/api/order-corrections/${orderId}`, { token, body: { target: 'finance', confirm: 1, expected_status: 'commission' } }),
    200,
    '回退至财务'
  );
  assert.strictEqual(rcFinance.order.status, 'finance');
  assert.strictEqual(rcFinance.order.bid_result, 'won');
  assert.strictEqual(rcFinance.order.sales_order, 'SO-001');
  assert.strictEqual(rcFinance.invoices.length, 0);
  assert.strictEqual(rcFinance.shippingBatches.length, 0);
  assert.strictEqual(rcFinance.pos.length, 1);
  assert.strictEqual(
    getDb().prepare("SELECT COUNT(*) c FROM order_attachments WHERE order_id = ? AND reference_type = 'invoice_record'").get(orderId).c,
    0
  );
  const rcQuotation = must(
    await call('PUT', `/api/order-corrections/${orderId}`, { token, body: { target: 'quotation', confirm: 1 } }),
    200,
    '回退至报价'
  );
  assert.strictEqual(rcQuotation.order.status, 'quotation');
  assert.strictEqual(rcQuotation.order.sales_order, null);
  assert.strictEqual(rcQuotation.order.total_amount, null);
  assert.strictEqual(rcQuotation.order.bid_result, null);
  assert.strictEqual(rcQuotation.pos.length, 0);
  assert.ok(rcQuotation.approvals.length >= 2);
  assert.ok(rcQuotation.approvals.every((item) => item.status === 'superseded'));
  const rcAudits = must(
    await call('GET', `/api/audit-logs?action=order_rollback&entity_type=order&entity_id=${orderId}&limit=10`, { token }),
    200,
    '回退审计筛选'
  );
  assert.ok(rcAudits.items.length >= 2);
  const rcAuditDetail = JSON.parse(rcAudits.items[0].detail);
  assert.strictEqual(rcAuditDetail.target_status, 'quotation');
  assert.ok(Array.isArray(rcAuditDetail.deleted_ids.customerPos));
  assert.strictEqual(rcAuditDetail.before.status, 'finance');
  assert.strictEqual(rcAuditDetail.before.sales_order, 'SO-001');
  ok('数据回退 API 预览与全步骤清理');

  // 未中标终态订单仅允许回退至中标结果及更早步骤
  const order3 = must(
    await call('POST', '/api/orders', {
      token,
      body: { end_customer_id: ec.id, contract_customer_id: cc.id, order_type: 'B', project_name: '测试项目3', project_owner: '王工' }
    }),
    201,
    '创建商机3'
  ).order;
  await call('PATCH', `/api/orders/${order3.id}/status`, { token, body: { action: 'advance' } });
  await call('PATCH', `/api/orders/${order3.id}/status`, { token, body: { action: 'advance', skip: 1 } });
  const rounds3 = must(await call('GET', `/api/orders/${order3.id}/quotations`, { token }), 200, '商机3报价');
  const round3 = rounds3.items[0].id;
  await call('POST', `/api/orders/${order3.id}/quotations/${round3}/items`, {
    token,
    body: { material_no: 'NON-STD-3', material_type: 'non_standard', price_source: 'manual', unit_price_ex_vat: 10, qty: 1 }
  });
  await call('PATCH', `/api/orders/${order3.id}/quotations/${round3}`, { token, body: { action: 'submit' } });
  await call('PATCH', `/api/orders/${order3.id}/status`, { token, body: { action: 'submit-approval', round_id: round3 } });
  const sf3 = must(await call('POST', `/api/orders/${order3.id}/approvals`, { token, body: { approval_type: 'sales_force' } }), 201, 'SF3 提交').id;
  const oa3 = must(await call('POST', `/api/orders/${order3.id}/approvals`, { token, body: { approval_type: 'oa_contract' } }), 201, 'OA3 提交').id;
  await call('PUT', `/api/orders/${order3.id}/approvals/${sf3}`, { token, body: { action: 'approve' } });
  await call('PUT', `/api/orders/${order3.id}/approvals/${oa3}`, { token, body: { action: 'approve' } });
  must(await call('PATCH', `/api/orders/${order3.id}/status`, { token, body: { action: 'bid', result: 'lost' } }), 200, '商机3 未中标');
  const rcLostMeta = must(await call('GET', `/api/order-corrections/${order3.id}`, { token }), 200, '未中标回退选项');
  assert.ok(rcLostMeta.validTargets.includes('bid_decision'));
  assert.ok(!rcLostMeta.validTargets.includes('finance'));
  assert.ok(!rcLostMeta.validTargets.includes('shipping_invoicing'));
  assert.ok(!rcLostMeta.validTargets.includes('commission'));
  const rcLostBlocked = await call('PUT', `/api/order-corrections/${order3.id}`, {
    token,
    body: { target: 'finance', confirm: 1, expected_status: 'lost_closed' }
  });
  assert.strictEqual(rcLostBlocked.status, 400);
  ok('未中标订单回退范围限制');

  // 看板/历史销售/待办/审计
  await call('POST', '/api/todos', { token, body: { title: '跟进回款', priority: 'high', due_date: '2026-07-30' } });
  const overdue = must(await call('GET', '/api/todos/overdue-count', { token }), 200, '逾期待办');
  assert.ok(overdue.count >= 1);
  const dash = must(await call('GET', '/api/dashboard', { token }), 200, '看板');
  assert.ok(dash.totalOrders >= 2);
  assert.ok(Number.isFinite(Number(dash.inProgressAmount)));
  assert.ok(Array.isArray(dash.inProgressMonthly.months));
  assert.ok(Array.isArray(dash.inProgressMonthly.customers));
  assert.strictEqual(Object.prototype.hasOwnProperty.call(dash, 'inProgressByCustomer'), false, '看板接口不应返回旧进行中客户汇总');
  assert.ok(Array.isArray(dash.monthlySales.months));
  assert.strictEqual(dash.monthlySales.months.length, 12);
  assert.ok(Number.isFinite(Number(dash.monthlySales.totalAmount)));
  assert.strictEqual(Object.prototype.hasOwnProperty.call(dash.monthlySales, 'customers'), false, '看板接口不应返回客户月度分布');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(dash, 'customerTotals'), false, '看板接口不应返回旧客户排行');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(dash, 'totalCommission'), false, '看板接口不应返回佣金总额');
  const commissionOverview = must(await call('GET', '/api/commission/overview', { token }), 200, '佣金整体状况');
  assert.ok(Number.isFinite(Number(commissionOverview.summary.matchedAmount)));
  assert.ok(Number.isFinite(Number(commissionOverview.summary.waitingExpected)));
  assert.ok(Number.isFinite(Number(commissionOverview.summary.positiveDeviationAmount)));
  assert.ok(Number.isFinite(Number(commissionOverview.summary.negativeDeviationAmount)));
  assert.ok(Array.isArray(commissionOverview.byYear));
  assert.ok(Array.isArray(commissionOverview.recent));
  const history = must(await call('GET', '/api/sales-history', { token }), 200, '历史销售');
  assert.ok(history.items.length >= 1);
  assert.ok(history.total >= 1);
  assert.ok(history.summary.orderCount >= 1);
  assert.ok(Number.isFinite(history.summary.totalSales));
  const historyPaged = must(await call('GET', '/api/sales-history?page=1&limit=2', { token }), 200, '历史销售分页');
  assert.strictEqual(historyPaged.items.length <= 2, true);
  assert.strictEqual(historyPaged.total, history.total);
  const audits = must(await call('GET', '/api/audit-logs', { token }), 200, '审计日志');
  const actions = new Set(audits.items.map((row) => row.action));
  for (const action of ['approval_submit', 'approval_approve', 'approval_reject', 'invoice_override', 'order_rollback', 'commission_manual']) {
    assert.ok(actions.has(action), `缺少审计动作 ${action}`);
  }
  ok('看板/历史销售/待办/审计日志');

  // 软重置
  must(await call('POST', '/api/settings/reset-business', { token, body: { password: 'password' } }), 200, '软重置');
  assert.strictEqual(getDb().prepare('SELECT COUNT(*) AS c FROM orders').get().c, 0);
  assert.strictEqual(getDb().prepare("SELECT COUNT(*) AS c FROM users WHERE username='admin'").get().c, 1);
  ok('软重置保留用户与基础配置');

  // 硬重置：JWT 失效 + 全量清空 + audit 清空
  await call('POST', '/api/settings/reset-factory', { token, body: { password: 'password' } });
  const oldToken = await call('GET', '/api/dashboard', { token });
  assert.strictEqual(oldToken.status, 401);
  const relogin = must(await call('POST', '/api/auth/login', { body: { username: 'admin', password: 'password' } }), 200, '硬重置后登录');
  const auditAfter = must(await call('GET', '/api/audit-logs', { token: relogin.token }), 200, '硬重置后审计');
  assert.strictEqual(auditAfter.items.length, 0);
  assert.strictEqual(auditAfter.total, 0);
  const uploads = path.join(dataDir, 'uploads');
  assert.strictEqual(fs.readdirSync(uploads).length, 0);
  ok('硬重置轮换 JWT 并清空审计');

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
