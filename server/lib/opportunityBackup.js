import fs from 'node:fs';
import path from 'node:path';
import xlsx from 'xlsx';
import ExcelJS from 'exceljs';
import { getDataDir, getDb } from '../db/init.js';
import { logger } from '../logger.js';

export const OPPORTUNITY_BACKUP_HEADERS = [
  'ID',
  'Year',
  'Month',
  'Contract Customer',
  'End Customer',
  'SO',
  'Order Type',
  'Prn',
  'Total Amount',
  'PO',
  'Workshop',
  'Project Name',
  'Project Owner',
  'Payment Method',
  'Remark',
  'Pending Issue',
  'Payment Received',
  'Delivered',
  'Delivered Date',
  'Invoiced',
  'Invoiced Date',
  'Order status',
  'Commission Status',
  'Commission Amount'
];

const COLUMN_WIDTHS = [10, 8, 8, 30, 30, 16, 10, 14, 16, 16, 14, 22, 20, 12, 30, 12, 14, 10, 14, 10, 14, 18, 16, 16];
const CENTER_COLUMNS = new Set([0, 1, 2, 6, 17, 19, 21, 22]);
const NUMBER_COLUMNS = new Set([8, 23]);

function boolText(value) {
  if (Number(value) === 1) return 'Y';
  if (Number(value) === 0) return 'N';
  return '';
}

export function buildOpportunityRow(order) {
  const pos = order.id == null ? [] : getDb()
    .prepare('SELECT po_number FROM customer_pos WHERE order_id = ? ORDER BY id')
    .all(order.id);
  const poNumbers = pos.map((row) => row.po_number).filter(Boolean).join('、') || null;
  return [
    order.order_id || '',
    order.year || '',
    order.month || '',
    order.contract_customer_name || '',
    order.end_customer_name || '',
    order.sales_order || '',
    order.order_type || '',
    order.project_no || '',
    order.total_amount == null ? '' : order.total_amount,
    poNumbers,
    order.workshop || '',
    order.project_name || '',
    order.project_owner || '',
    order.payment_terms || '',
    order.project_remark || '',
    null,
    null,
    boolText(order.delivered),
    order.delivered_date || '',
    boolText(order.invoiced),
    order.invoiced_date || '',
    order.status || '',
    Number(order.commission_matched) === 1 ? 'Yes' : '',
    order.commission_amount == null ? '' : order.commission_amount
  ];
}

function backupFilePath() {
  return path.join(getDataDir(), 'opportunity-backup.xlsx');
}

function readRows() {
  const file = backupFilePath();
  if (!fs.existsSync(file)) return [OPPORTUNITY_BACKUP_HEADERS];
  try {
    const workbook = xlsx.read(fs.readFileSync(file), { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
    return rows.length > 0 ? rows : [OPPORTUNITY_BACKUP_HEADERS];
  } catch (err) {
    logger.warn('backup', '读取商机备份文件失败', { err: err?.message });
    return [OPPORTUNITY_BACKUP_HEADERS];
  }
}

function writeRows(rows) {
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(rows), 'Atlas Copco');
  fs.writeFileSync(backupFilePath(), xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

export function appendOpportunityRow(order) {
  try {
    const rows = readRows();
    rows.push(buildOpportunityRow(order));
    writeRows(rows);
  } catch (err) {
    logger.error('backup', '商机备份追加失败', { err: err?.message });
  }
}

export async function buildOpportunitiesWorkbook(orders) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'iProject';
  const worksheet = workbook.addWorksheet('Atlas Copco');
  worksheet.columns = COLUMN_WIDTHS.map((width) => ({ width }));
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.autoFilter = 'A1:X1';

  const headerRow = worksheet.addRow(OPPORTUNITY_BACKUP_HEADERS);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF004E9A' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF004E9A' } },
      left: { style: 'thin', color: { argb: 'FF004E9A' } },
      bottom: { style: 'thin', color: { argb: 'FF004E9A' } },
      right: { style: 'thin', color: { argb: 'FF004E9A' } }
    };
  });

  orders.forEach((order, index) => {
    const row = worksheet.addRow(buildOpportunityRow(order));
    row.height = 18;
    row.eachCell((cell, colNumber) => {
      const colIndex = colNumber - 1;
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFDDE7F3' } },
        left: { style: 'thin', color: { argb: 'FFDDE7F3' } },
        bottom: { style: 'thin', color: { argb: 'FFDDE7F3' } },
        right: { style: 'thin', color: { argb: 'FFDDE7F3' } }
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: NUMBER_COLUMNS.has(colIndex) ? 'right' : CENTER_COLUMNS.has(colIndex) ? 'center' : 'left',
        wrapText: colIndex === 11 || colIndex === 14
      };
      if (NUMBER_COLUMNS.has(colIndex) && cell.value !== '' && cell.value != null) {
        cell.numFmt = '#,##0.00';
      }
      if (index % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7FAFD' } };
      }
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
