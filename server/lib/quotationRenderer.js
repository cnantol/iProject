import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { getDataDir } from '../db/init.js';

const A4 = { width: 595.28, height: 841.89 };
const FONT_CANDIDATES = {
  sans: [
    process.env.CJK_FONT_PATH,
    path.join(process.cwd(), 'assets', 'fonts', 'NotoSansCJK-Regular.ttc'),
    path.join(process.cwd(), 'assets', 'fonts', 'NotoSansSC-Regular.ttf'),
    '/app/assets/fonts/NotoSansCJK-Regular.ttc',
    '/app/assets/fonts/NotoSansSC-Regular.ttf',
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
    '/System/Library/Fonts/PingFang.ttc',
    '/System/Library/Fonts/Hiragino Sans GB.ttc',
    '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'
  ].filter(Boolean),
  serif: [
    process.env.CJK_SERIF_FONT_PATH,
    path.join(process.cwd(), 'assets', 'fonts', 'NotoSerifCJK-Regular.ttc'),
    path.join(process.cwd(), 'assets', 'fonts', 'NotoSerifSC-Regular.otf'),
    path.join(process.cwd(), 'assets', 'fonts', 'NotoSerifSC-Regular.ttf'),
    '/app/assets/fonts/NotoSerifCJK-Regular.ttc',
    '/app/assets/fonts/NotoSerifSC-Regular.otf',
    '/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc',
    '/usr/share/fonts/noto-cjk/NotoSerifCJK-Regular.ttc'
  ].filter(Boolean),
  mono: [
    process.env.CJK_MONO_FONT_PATH,
    path.join(process.cwd(), 'assets', 'fonts', 'NotoSansMonoCJK-Regular.ttc'),
    '/app/assets/fonts/NotoSansMonoCJK-Regular.ttc'
  ].filter(Boolean)
};

function resolveCjkFont(family) {
  const candidates = FONT_CANDIDATES[family] || FONT_CANDIDATES.sans;
  for (const file of candidates) {
    if (file && fs.existsSync(file)) return file;
  }
  return null;
}

function latinFontName(family, bold) {
  if (family === 'serif') return bold ? 'Times-Bold' : 'Times-Roman';
  if (family === 'mono') return bold ? 'Courier-Bold' : 'Courier';
  return bold ? 'Helvetica-Bold' : 'Helvetica';
}

function formatMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatNumber(value, digits = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  return num.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function registerFonts(doc, template) {
  const family = template.typography.fontFamily;
  let fontFile = null;
  if (family === 'custom' && template.typography.fontFile) {
    const customPath = path.join(getDataDir(), 'custom-fonts', path.basename(template.typography.fontFile));
    if (fs.existsSync(customPath)) fontFile = customPath;
  }
  if (!fontFile) fontFile = resolveCjkFont(family) || resolveCjkFont('sans');
  if (!fontFile) return { cjk: false, family };
  try {
    doc.registerFont('cjk', fontFile);
    return { cjk: true, family };
  } catch {
    return { cjk: false, family };
  }
}

function fitFontSize(doc, text, maxWidth, maxSize, minSize = 6) {
  let size = maxSize;
  doc.fontSize(size);
  while (size > minSize && doc.widthOfString(String(text)) > maxWidth) {
    size = Math.max(minSize, size - 0.5);
    doc.fontSize(size);
  }
  return size;
}

export function createQuotationPdf(context) {
  const template = context.template;
  const labels = context.labels;
  const page = template.page;
  const palette = template.palette;
  const layout = template.layout;
  const pageWidth = page.orientation === 'landscape' ? A4.height : A4.width;
  const pageHeight = page.orientation === 'landscape' ? A4.width : A4.height;
  const margin = page.margin;
  const contentWidth = pageWidth - margin * 2;
  const doc = new PDFDocument({ size: 'A4', layout: page.orientation, margin });
  const fonts = registerFonts(doc, template);
  const font = (bold = false) => (fonts.cjk ? 'cjk' : latinFontName(fonts.family, bold));
  const bottomLimit = pageHeight - margin - 46;

  let y = margin;

  const ensureSpace = (needed) => {
    if (y + needed > bottomLimit) {
      doc.addPage();
      y = margin;
    }
  };

  if (layout.headerText) {
    doc.font(font()).fontSize(10).fillColor(palette.muted).text(layout.headerText, margin, y, {
      width: contentWidth,
      align: layout.headerAlignment
    });
    y = doc.y + 8;
  }

  if (layout.logo.data) {
    try {
      const buffer = Buffer.from(String(layout.logo.data).split(',')[1] || '', 'base64');
      const logoWidth = Math.min(layout.logo.width, contentWidth * 0.45);
      const logoX =
        layout.logo.position === 'left'
          ? margin
          : layout.logo.position === 'right'
            ? pageWidth - margin - logoWidth
            : (pageWidth - logoWidth) / 2;
      doc.image(buffer, logoX, y, { width: logoWidth });
      y += Math.min(90, logoWidth * 0.42 + 8);
    } catch {
      // Logo 数据损坏时跳过
    }
  }

  const titleText = [template.company.name, layout.title].filter(Boolean).join(' ');
  doc.font(font(true)).fontSize(template.typography.titleSize).fillColor(palette.primary).text(titleText, margin, y, {
    width: contentWidth,
    align: layout.titleAlignment
  });
  y = doc.y + 8;

  doc.font(font()).fontSize(template.typography.bodySize).fillColor(palette.text);
  for (const field of context.infoFields) {
    if (!field.value) continue;
    ensureSpace(16);
    doc.text(`${field.label}：${field.value}`, margin, y, { width: contentWidth, align: layout.infoAlignment });
    y = doc.y;
  }
  y += 12;

  doc.font(font(true)).fontSize(11).fillColor(palette.primary).text(labels.detailTitle, margin, y, { width: contentWidth });
  y = doc.y + 6;

  const columns = context.columns;
  if (columns.length === 0) {
    doc.font(font()).fontSize(10).fillColor(palette.muted).text('未启用任何列', margin, y, { width: contentWidth, align: 'center' });
    y = doc.y + 12;
  } else {
    const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);
    const scale = totalWidth > 0 ? contentWidth / totalWidth : 1;
    const cols = columns.map((col) => ({ ...col, width: col.width * scale }));
    const headerHeight = 22;
    const drawTableHeader = (topY) => {
      doc.rect(margin, topY, contentWidth, headerHeight).fill(palette.tableHeaderBg);
      let x = margin;
      doc.fillColor(palette.tableHeaderText);
      for (const col of cols) {
        const size = fitFontSize(doc, col.label, col.width - 8, template.typography.tableHeaderSize);
        doc.font(font(true)).fontSize(size);
        doc.text(col.label, x + 4, topY + 7, { width: col.width - 8, align: col.align, lineBreak: false });
        x += col.width;
      }
      return topY + headerHeight;
    };

    const rowValues = (item) =>
      cols.map((col) => {
        switch (col.key) {
          case 'materialNo':
            return item.materialNo;
          case 'description':
            return item.description;
          case 'type':
            return item.type;
          case 'priceSource':
            return item.priceSource;
          case 'unitPrice':
            return formatMoney(item.unitPrice);
          case 'payPercent':
            return item.payPercent == null ? '' : `${formatNumber(item.payPercent, 0)}%`;
          case 'finalPrice':
            return formatMoney(item.finalPrice);
          case 'qty':
            return formatNumber(item.qty, 2);
          case 'unit':
            return item.unit;
          case 'lineAmount':
            return formatMoney(item.lineAmount);
          case 'remark':
            return item.remark;
          default:
            return '';
        }
      });

    const rowHeight = (item) => {
      const values = rowValues(item);
      let maxLines = 1;
      cols.forEach((col, index) => {
        const text = String(values[index] || '');
        if (!text) return;
        doc.font(font()).fontSize(template.typography.tableBodySize);
        const lines = Math.ceil(doc.heightOfString(text, { width: col.width - 8 }) / template.typography.tableBodySize / 1.2);
        maxLines = Math.max(maxLines, lines);
      });
      return Math.max(20, Math.min(72, maxLines * 12 + 8));
    };

    y = drawTableHeader(y);
    context.items.forEach((item, index) => {
      const rh = rowHeight(item);
      ensureSpace(rh + 2);
      if (index % 2 === 1) {
        doc.rect(margin, y, contentWidth, rh).fill(palette.rowAlt);
      }
      const values = rowValues(item);
      let x = margin;
      doc.fillColor(palette.text);
      cols.forEach((col, colIndex) => {
        doc.font(font()).fontSize(template.typography.tableBodySize);
        doc.text(String(values[colIndex] || ''), x + 4, y + 4, {
          width: col.width - 8,
          align: col.align,
          lineBreak: true,
          height: rh - 6,
          ellipsis: true
        });
        x += col.width;
      });
      y += rh;
      if (y > bottomLimit) {
        doc.addPage();
        y = drawTableHeader(margin);
      }
    });
    y += 10;
  }

  if (template.summary.showTotal) {
    const totalText = `${template.summary.totalLabel || labels.total}：${formatMoney(context.total)}`;
    const totalBox = { width: Math.min(220, contentWidth * 0.55), height: 26 };
    const totalX = pageWidth - margin - totalBox.width;
    doc.rect(totalX, y, totalBox.width, totalBox.height).fill(palette.totalBg);
    doc.fillColor(palette.primary).font(font(true)).fontSize(11);
    doc.text(totalText, totalX + 8, y + 7, { width: totalBox.width - 16, align: 'right' });
    y += totalBox.height + 8;
  }

  if (template.summary.showTerms && template.summary.terms) {
    ensureSpace(30);
    doc.font(font(true)).fontSize(10).fillColor(palette.text).text(labels.terms, margin, y, { width: contentWidth });
    y = doc.y + 3;
    doc.font(font()).fontSize(9).fillColor(palette.muted).text(template.summary.terms, margin, y, { width: contentWidth });
    y = doc.y + 12;
  }

  if (template.summary.showSignature) {
    ensureSpace(64);
    const signWidth = Math.max(140, contentWidth * 0.35);
    const signY = Math.max(y + 24, pageHeight - margin - 96);
    const leftX = margin;
    const rightX = pageWidth - margin - signWidth;
    doc.font(font()).fontSize(10).fillColor(palette.text);
    doc.text(template.summary.customerSignLabel || labels.customerSign, leftX, signY, { width: signWidth, align: 'left' });
    doc.text(template.summary.supplierSignLabel || labels.supplierSign, rightX, signY, { width: signWidth, align: 'right' });
    y = signY + 40;
  }

  const firstPage = doc.bufferedPageRange().start;
  const totalPages = doc.bufferedPageRange().count;
  for (let pageIndex = firstPage; pageIndex < totalPages; pageIndex += 1) {
    doc.switchToPage(pageIndex);
    if (layout.footerText) {
      doc.font(font()).fontSize(9).fillColor(palette.muted);
      doc.text(layout.footerText, margin, pageHeight - margin - 24, { width: contentWidth, align: layout.footerAlignment });
    }
    if (layout.showPageNumbers) {
      const pageNo = pageIndex - firstPage + 1;
      const text = (labels.page || '第 {page} 页').replace('{page}', String(pageNo)).replace('{pages}', String(totalPages));
      doc.font(font()).fontSize(8).fillColor(palette.muted);
      doc.text(text, margin, pageHeight - margin - 10, { width: contentWidth, align: 'right' });
    }
  }

  doc.end();
  return doc;
}

export async function renderPdfBuffer(context) {
  const doc = createQuotationPdf(context);
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  await new Promise((resolve, reject) => {
    doc.on('end', resolve);
    doc.on('error', reject);
  });
  return Buffer.concat(chunks);
}
