import fs from 'node:fs';
import path from 'node:path';
import xlsx from 'xlsx';
import ExcelJS from 'exceljs';
import { getDataDir, getDb } from '../db/init.js';
import { logger } from '../logger.js';

const OPPORTUNITY_BACKUP_HEADERS = [
  'ID',
  'Year',
  'Month',
  'End Customer',
  'Contract Customer',
  'Order Type',
  'Workshop',
  'Project Name',
  'Project Owner',
  'Remark',
  'Prn',
  'Payment Method',
  'SO',
  'Total Amount',
  'PO',
  'Delivered',
  'Delivered Date',
  'Invoiced',
  'Invoiced Date',
  'Order status',
  'Commission Status',
  'Commission Amount',
  'Commission Date',
  'Closed Time',
  'Created Time',
  'Updated Time'
];

const COLUMN_WIDTHS = [10, 8, 8, 30, 30, 10, 14, 22, 20, 30, 14, 12, 16, 16, 22, 10, 14, 10, 14, 18, 16, 16, 16, 16, 20, 20];
const CENTER_COLUMNS = new Set([0, 1, 2, 5, 15, 17, 19, 20, 22, 23, 24, 25]);
const NUMBER_COLUMNS = new Set([13, 21]);

function boolText(value) {
  if (Number(value) === 1) return 'Y';
  if (Number(value) === 0) return 'N';
  return '';
}

function toLocalDateTime(value) {
  if (!value) return '';
  const text = String(value);
  const date = new Date(text.includes('T') ? text : `${text.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return text;
  const local = new Date(date.getTime() + 8 * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}`;
}

function buildOpportunityRow(order, poNumbers) {
  const numbers = poNumbers == null
    ? (order.id == null
        ? []
        : getDb()
            .prepare('SELECT po_number FROM customer_pos WHERE order_id = ? ORDER BY id')
            .all(order.id)
            .map((row) => row.po_number)
            .filter(Boolean))
    : (Array.isArray(poNumbers) ? poNumbers : [poNumbers]);
  const poText = numbers.filter(Boolean).join('/') || null;
  return [
    order.order_id || '',
    order.year || '',
    order.month || '',
    order.end_customer_name || '',
    order.contract_customer_name || '',
    order.order_type || '',
    order.workshop || '',
    order.project_name || '',
    order.project_owner || '',
    order.project_remark || '',
    order.project_no || '',
    order.payment_terms || '',
    order.sales_order || '',
    order.total_amount == null ? '' : order.total_amount,
    poText,
    boolText(order.delivered),
    order.delivered_date || '',
    boolText(order.invoiced),
    order.invoiced_date || '',
    order.status || '',
    Number(order.commission_matched) === 1 ? 'Yes' : '',
    order.commission_amount == null ? '' : order.commission_amount,
    toLocalDateTime(order.commission_date),
    toLocalDateTime(order.closed_at),
    toLocalDateTime(order.created_at),
    toLocalDateTime(order.updated_at)
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
  worksheet.autoFilter = 'A1:Z1';

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

  const ids = orders.map((order) => order.id).filter((id) => id != null);
  const poMap = new Map();
  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    const poRows = getDb()
      .prepare(`SELECT order_id, po_number FROM customer_pos WHERE order_id IN (${placeholders}) ORDER BY order_id, id`)
      .all(...ids);
    for (const po of poRows) {
      const list = poMap.get(po.order_id) || [];
      list.push(po.po_number);
      poMap.set(po.order_id, list);
    }
  }
  orders.forEach((order, index) => {
    const row = worksheet.addRow(buildOpportunityRow(order, poMap.get(order.id) || []));
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
