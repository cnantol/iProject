import { useCallback, useEffect, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import FontDownloadIcon from '@mui/icons-material/FontDownload';
import ListAltIcon from '@mui/icons-material/ListAlt';
import PaletteIcon from '@mui/icons-material/Palette';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import RedoIcon from '@mui/icons-material/Redo';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SaveIcon from '@mui/icons-material/Save';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import TranslateIcon from '@mui/icons-material/Translate';
import UndoIcon from '@mui/icons-material/Undo';
import api, { errorMessage } from '../api';
import { SAMPLE_DATA, createDefaultTemplate, formatMoney, normalizeTemplate } from '../utils/quotationTemplate';

const DRAFT_KEY = 'quotation-template-draft';
const ALIGNS = ['left', 'center', 'right'];
const FONT_OPTIONS = [
  { value: 'sans', label: '无衬线' },
  { value: 'serif', label: '衬线' },
  { value: 'mono', label: '等宽' },
  { value: 'custom', label: '自定义字体' }
];
const FONT_FAMILY_CSS = {
  sans: '"PingFang SC","Microsoft YaHei",Arial,sans-serif',
  serif: 'Georgia,"Songti SC",serif',
  mono: '"SF Mono",Menlo,Consolas,monospace',
  custom: '"PingFang SC","Microsoft YaHei",Arial,sans-serif'
};
const PALETTE_KEYS = [
  ['primary', '主色'],
  ['secondary', '辅色'],
  ['accent', '强调色'],
  ['text', '正文'],
  ['muted', '次要文字'],
  ['border', '边框'],
  ['rowAlt', '隔行底色'],
  ['tableHeaderBg', '表头背景'],
  ['tableHeaderText', '表头文字'],
  ['totalBg', '合计背景']
];
const SECTIONS = [
  { key: 'fields', label: '字段', icon: <ListAltIcon fontSize="small" /> },
  { key: 'page', label: '品牌', icon: <PaletteIcon fontSize="small" /> },
  { key: 'text', label: '文本', icon: <TextFieldsIcon fontSize="small" /> },
  { key: 'font', label: '字体', icon: <FontDownloadIcon fontSize="small" /> },
  { key: 'labels', label: '标签', icon: <TranslateIcon fontSize="small" /> },
  { key: 'summary', label: '合计', icon: <ReceiptLongIcon fontSize="small" /> }
];
const LABEL_GROUPS = [
  {
    title: '单据信息',
    keys: ['quoteTitle', 'quoteDate', 'quoteNo', 'orderId', 'projectName', 'endCustomer', 'contractCustomer', 'contactInfo', 'salesOrder', 'paymentTerms']
  },
  {
    title: '表格列',
    keys: ['detailTitle', 'materialNo', 'description', 'type', 'priceSource', 'unitPrice', 'payPercent', 'finalPrice', 'qty', 'unit', 'lineAmount', 'remark']
  },
  { title: '其他', keys: ['total', 'terms', 'customerSign', 'supplierSign', 'page'] }
];

function SettingRow({ label, children, hint }) {
  return (
    <Box sx={{ mb: 0.75 }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 0.35 }}>
        {label}
      </Typography>
      {children}
      {hint && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.2 }}>{hint}</Typography>}
    </Box>
  );
}

function SettingsGrid({ cols = 2, children }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: `repeat(${cols}, minmax(0, 1fr))` }, gap: '0.5rem 0.9rem' }}>
      {children}
    </Box>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 30, height: 26, padding: 0, border: '1px solid rgba(0,0,0,0.12)', borderRadius: 6, background: 'transparent', cursor: 'pointer' }}
      />
      <TextField size="small" label={label} value={value} onChange={(e) => onChange(e.target.value)} sx={{ flex: 1 }} />
    </Box>
  );
}

function columnValue(col, item) {
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
      return item.payPercent == null ? '' : `${Number(item.payPercent).toFixed(0)}%`;
    case 'finalPrice':
      return formatMoney(item.finalPrice);
    case 'qty':
      return item.qty == null ? '' : String(item.qty);
    case 'unit':
      return item.unit;
    case 'lineAmount':
      return formatMoney(item.lineAmount);
    case 'remark':
      return item.remark;
    default:
      return '';
  }
}

function PreviewSheet({ template }) {
  const labels = template.language === 'en' ? template.labels.en : template.labels.zh;
  const page = template.page;
  const palette = template.palette;
  const layout = template.layout;
  const infoFields = template.infoFields.filter((field) => field.enabled);
  const columns = template.columnFields.filter((field) => field.enabled);
  const totalWidth = columns.reduce((sum, col) => sum + col.width, 0) || 1;
  const fontFamily = FONT_FAMILY_CSS[template.typography.fontFamily] || FONT_FAMILY_CSS.sans;
  const infoValue = (field) => {
    switch (field.key) {
      case 'quoteNo':
        return SAMPLE_DATA.quoteNo;
      case 'quoteDate':
        return layout.quoteDate || SAMPLE_DATA.date;
      case 'orderId':
        return SAMPLE_DATA.order.order_id;
      case 'projectName':
        return SAMPLE_DATA.order.project_name;
      case 'endCustomer':
        return SAMPLE_DATA.customers.end;
      case 'contractCustomer':
        return SAMPLE_DATA.customers.contract;
      case 'salesOrder':
        return SAMPLE_DATA.order.sales_order;
      case 'paymentTerms':
        return SAMPLE_DATA.order.payment_terms;
      case 'contactInfo':
        return [template.company.address, template.company.phone, template.company.email].filter(Boolean).join('    ');
      default:
        return '';
    }
  };

  return (
    <Box
      sx={{
        width: 794,
        height: 1123,
        bgcolor: '#FFFFFF',
        boxShadow: '0 10px 36px rgba(15,23,42,0.2)',
        border: 1,
        borderColor: 'rgba(15,23,42,0.08)',
        p: `${page.margin * 2.1167}px`,
        color: palette.text,
        fontFamily,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {layout.headerText && (
        <Typography sx={{ fontSize: 12, color: palette.muted, textAlign: layout.headerAlignment, mb: 1.5 }}>{layout.headerText}</Typography>
      )}
      {layout.logo.data && (
        <Box sx={{ textAlign: layout.logo.position, mb: 1 }}>
          <Box component="img" src={layout.logo.data} alt="logo" sx={{ maxWidth: Math.min(layout.logo.width, 300), maxHeight: 70, objectFit: 'contain' }} />
        </Box>
      )}
      <Typography sx={{ fontSize: template.typography.titleSize, fontWeight: 800, color: palette.primary, textAlign: layout.titleAlignment, lineHeight: 1.25 }}>
        {[template.company.name, layout.title].filter(Boolean).join(' ')}
      </Typography>
      <Box sx={{ mt: 1, mb: 1.5, fontSize: template.typography.bodySize, textAlign: layout.infoAlignment, color: palette.text }}>
        {infoFields.map((field) => (
          <Box key={field.key} sx={{ mb: 0.4 }}>
            {labels[field.key] || field.key}：{infoValue(field)}
          </Box>
        ))}
      </Box>
      <Typography sx={{ fontWeight: 800, color: palette.primary, borderBottom: `2px solid ${palette.secondary}`, pb: 0.5, mb: 0.75 }}>
        {labels.detailTitle}
      </Typography>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        {columns.length === 0 ? (
          <Typography sx={{ py: 3, textAlign: 'center', color: palette.muted, fontSize: 13 }}>未启用任何列</Typography>
        ) : (
          <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <Box component="thead">
              <Box component="tr" sx={{ bgcolor: palette.tableHeaderBg, color: palette.tableHeaderText }}>
                {columns.map((col) => (
                  <Box
                    component="th"
                    key={col.key}
                    sx={{
                      width: `${(col.width / totalWidth) * 100}%`,
                      py: 0.75,
                      px: 0.75,
                      fontSize: template.typography.tableHeaderSize,
                      fontWeight: 700,
                      textAlign: col.align,
                      border: `1px solid ${palette.tableHeaderBg}`
                    }}
                  >
                    {labels[col.key] || col.key}
                  </Box>
                ))}
              </Box>
            </Box>
            <Box component="tbody">
              {SAMPLE_DATA.items.map((item, index) => (
                <Box component="tr" key={item.materialNo} sx={{ bgcolor: index % 2 === 1 ? palette.rowAlt : '#FFFFFF' }}>
                  {columns.map((col) => (
                    <Box
                      component="td"
                      key={col.key}
                      sx={{
                        py: 0.65,
                        px: 0.75,
                        fontSize: template.typography.tableBodySize,
                        textAlign: col.align,
                        border: `1px solid ${palette.border}`,
                        wordBreak: 'break-word',
                        verticalAlign: 'top'
                      }}
                    >
                      {columnValue(col, item)}
                    </Box>
                  ))}
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </Box>
      {template.summary.showTotal && (
        <Box sx={{ alignSelf: 'flex-end', mt: 1.5, px: 1.5, py: 0.75, bgcolor: palette.totalBg, color: palette.primary, fontWeight: 800, fontSize: 12 }}>
          {template.summary.totalLabel || labels.total}：{formatMoney(SAMPLE_DATA.total)}
        </Box>
      )}
      {template.summary.showTerms && template.summary.terms && (
        <Box sx={{ mt: 1.5, fontSize: 11, color: palette.muted }}>
          <Box sx={{ fontWeight: 800, color: palette.text }}>{labels.terms}</Box>
          <Box sx={{ mt: 0.25 }}>{template.summary.terms}</Box>
        </Box>
      )}
      {template.summary.showSignature && (
        <Stack direction="row" spacing={8} sx={{ mt: 'auto', pt: 2, fontSize: 11, color: palette.text }}>
          <Box>{template.summary.customerSignLabel || labels.customerSign}：________</Box>
          <Box>{template.summary.supplierSignLabel || labels.supplierSign}：________</Box>
        </Stack>
      )}
      <Box sx={{ mt: 'auto', pt: 1.5 }}>
        {layout.footerText && (
          <Typography sx={{ fontSize: 10, color: palette.muted, textAlign: layout.footerAlignment, mb: 0.5 }}>
            {layout.footerText}
          </Typography>
        )}
        {layout.showPageNumbers && (
          <Typography sx={{ fontSize: 9, color: palette.muted, textAlign: 'right' }}>
            {(labels.page || '第 {page} 页').replace('{page}', '1').replace('{pages}', '1')}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

export default function QuoteStyleDesigner() {
  const [template, setTemplate] = useState(() => createDefaultTemplate());
  const [catalog, setCatalog] = useState({ infoFields: [], columnFields: [], customFields: [] });
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [zoom, setZoom] = useState(0.8);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [draftAvailable, setDraftAvailable] = useState(false);
  const [customFieldKey, setCustomFieldKey] = useState('');
  const [dragItem, setDragItem] = useState(null);
  const [activeSection, setActiveSection] = useState('fields');
  const [expandedGroups, setExpandedGroups] = useState({ info: true, columns: false });
  const [expandedLabelGroups, setExpandedLabelGroups] = useState([true, false, false]);
  const logoInputRef = useRef(null);
  const fontInputRef = useRef(null);
  const importInputRef = useRef(null);
  const draftTimerRef = useRef(null);

  const labels = template.language === 'en' ? template.labels.en : template.labels.zh;

  const scheduleDraft = useCallback((next) => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: Date.now(), template: next }));
      } catch {
        // 存储不可用时忽略草稿
      }
    }, 400);
  }, []);

  const commit = useCallback(
    (next, record = true) => {
      const normalized = normalizeTemplate(next);
      if (record) {
        setPast((prev) => [...prev.slice(-49), JSON.parse(JSON.stringify(template))]);
        setFuture([]);
      }
      setTemplate(normalized);
      setDirty(true);
      scheduleDraft(normalized);
    },
    [template, scheduleDraft]
  );

  const update = useCallback(
    (mutator) => {
      const next = JSON.parse(JSON.stringify(template));
      mutator(next);
      commit(next);
    },
    [template, commit]
  );

  const toggleLanguage = useCallback(() => {
    update((next) => {
      next.language = next.language === 'zh' ? 'en' : 'zh';
    });
  }, [update]);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    setFuture((prev) => [...prev, template]);
    const prevTemplate = past[past.length - 1];
    setPast((prev) => prev.slice(0, -1));
    setTemplate(prevTemplate);
    setDirty(true);
  }, [past, template]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    setPast((prev) => [...prev, template]);
    const nextTemplate = future[future.length - 1];
    setFuture((prev) => prev.slice(0, -1));
    setTemplate(nextTemplate);
    setDirty(true);
  }, [future, template]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [templateRes, catalogRes] = await Promise.all([
        api.get('/quotation-template'),
        api.get('/quotation-template/fields')
      ]);
      setTemplate(normalizeTemplate(templateRes.data));
      setCatalog(catalogRes.data);
      setPast([]);
      setFuture([]);
      setDirty(false);
      try {
        setDraftAvailable(Boolean(localStorage.getItem(DRAFT_KEY)));
      } catch {
        setDraftAvailable(false);
      }
    } catch (err) {
      setError(errorMessage(err, '加载模板失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [load]);

  useEffect(() => {
    const handler = (event) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const { data } = await api.put('/quotation-template', template);
      setTemplate(normalizeTemplate(data));
      setPast([]);
      setFuture([]);
      setDirty(false);
      setNotice('报价单模板已保存');
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // 忽略存储异常
      }
    } catch (err) {
      setError(errorMessage(err, '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!window.confirm('确认恢复默认报价单模板？当前未保存修改将丢失。')) return;
    setSaving(true);
    setError('');
    try {
      await api.post('/quotation-template/reset');
      await load();
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // 忽略存储异常
      }
      setNotice('已恢复默认模板');
    } catch (err) {
      setError(errorMessage(err, '恢复默认失败'));
    } finally {
      setSaving(false);
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'quotation-template.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      commit(JSON.parse(text));
      setNotice('模板已导入，请确认后保存');
    } catch {
      setError('导入失败：JSON 格式不正确');
    } finally {
      event.target.value = '';
    }
  };

  const previewPdf = async (download = false) => {
    setPdfLoading(true);
    setError('');
    try {
      const res = await api.post('/quotation-template/preview-pdf', { template }, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      if (download) {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'quotation-preview.pdf';
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } else {
        setPdfUrl(url);
        setPdfOpen(true);
      }
    } catch (err) {
      setError(errorMessage(err, 'PDF 生成失败'));
    } finally {
      setPdfLoading(false);
    }
  };

  const uploadLogo = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError('Logo 图片不能超过 2MB');
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      update((next) => {
        next.layout.logo.data = String(reader.result);
      });
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const uploadFont = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post('/quotation-template/font', form);
      update((next) => {
        next.typography.fontFamily = 'custom';
        next.typography.fontFile = data.filename;
      });
      setNotice('字体已上传');
    } catch (err) {
      setError(errorMessage(err, '字体上传失败'));
    } finally {
      setSaving(false);
      event.target.value = '';
    }
  };

  const restoreDraft = () => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const { template: draft } = JSON.parse(raw);
      commit(draft, false);
      setDirty(true);
      localStorage.removeItem(DRAFT_KEY);
      setDraftAvailable(false);
      setNotice('已恢复未保存草稿');
    } catch {
      setError('草稿恢复失败，内容可能已损坏');
    }
  };

  const discardDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // 忽略存储异常
    }
    setDraftAvailable(false);
  };

  const moveField = (section, index, direction) => {
    update((next) => {
      const list = next[section];
      const target = index + direction;
      if (target < 0 || target >= list.length) return;
      [list[index], list[target]] = [list[target], list[index]];
      list.forEach((field, i) => {
        field.order = i + 1;
      });
    });
  };

  const toggleField = (section, key) => {
    update((next) => {
      const field = next[section].find((item) => item.key === key);
      if (field) field.enabled = !field.enabled;
    });
  };

  const patchField = (section, key, patch) => {
    update((next) => {
      const field = next[section].find((item) => item.key === key);
      if (field) Object.assign(field, patch);
    });
  };

  const addCustomField = () => {
    const field = catalog.customFields.find((item) => item.key === customFieldKey);
    if (!field) return;
    update((next) => {
      if (next.infoFields.some((item) => item.key === field.key)) return;
      next.infoFields.push({ key: field.key, fieldId: field.fieldId, enabled: true, order: next.infoFields.length + 1 });
    });
    setCustomFieldKey('');
  };

  const removeCustomField = (key) => {
    update((next) => {
      next.infoFields = next.infoFields.filter((item) => item.key !== key);
    });
  };

  const onDropField = (section, targetIndex) => {
    if (!dragItem || dragItem.section !== section) return;
    const { index } = dragItem;
    if (index === targetIndex) return;
    update((next) => {
      const list = next[section];
      const [moved] = list.splice(index, 1);
      list.splice(targetIndex, 0, moved);
      list.forEach((field, i) => {
        field.order = i + 1;
      });
    });
    setDragItem(null);
  };

  const setLabel = (key, value) => {
    update((next) => {
      const lang = next.language;
      next.labels[lang][key] = value;
    });
  };

  const renderFieldTable = (section) => {
    const list = template[section];
    return (
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" sx={{ width: 40 }}>启用</TableCell>
              <TableCell>名称</TableCell>
              {section === 'columnFields' && <TableCell sx={{ width: 52 }}>宽</TableCell>}
              {section === 'columnFields' && <TableCell sx={{ width: 70 }}>对齐</TableCell>}
              <TableCell align="right" sx={{ width: 70 }}>排序</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {list.map((field, index) => {
              const label = labels[field.key] || field.key;
              const customField = field.key.startsWith('custom:') ? catalog.customFields.find((item) => item.key === field.key) : null;
              return (
                <TableRow
                  key={field.key}
                  draggable
                  onDragStart={() => setDragItem({ section, index })}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDropField(section, index)}
                  hover
                  sx={{ cursor: 'grab', '&:last-child td': { borderBottom: 0 } }}
                >
                  <TableCell padding="checkbox" sx={{ py: 0.25 }}>
                    <Switch size="small" checked={Boolean(field.enabled)} onChange={() => toggleField(section, field.key)} />
                  </TableCell>
                  <TableCell sx={{ py: 0.25, minWidth: 86 }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 700, fontSize: 12 }} title={customField ? customField.fieldName : label}>
                      {customField ? customField.fieldName : label}
                    </Typography>
                    <Typography variant="caption" noWrap color="text.secondary" sx={{ fontSize: 9, display: 'block' }}>
                      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }}>
                        <DragIndicatorIcon sx={{ fontSize: 11, mr: 0.25 }} />
                        {field.key}
                      </Box>
                    </Typography>
                  </TableCell>
                  {section === 'columnFields' && (
                    <>
                      <TableCell sx={{ py: 0.25 }}>
                        <TextField
                          size="small"
                          type="number"
                          value={field.width}
                          onChange={(e) => patchField(section, field.key, { width: Number(e.target.value) })}
                          inputProps={{ min: 40, max: 300 }}
                          sx={{ width: 50, '& .MuiInputBase-input': { py: 0.5, fontSize: 12 } }}
                        />
                      </TableCell>
                      <TableCell sx={{ py: 0.25 }}>
                        <FormControl size="small" fullWidth>
                          <Select
                            value={field.align}
                            onChange={(e) => patchField(section, field.key, { align: e.target.value })}
                            sx={{ '& .MuiSelect-select': { py: 0.6, fontSize: 12 } }}
                          >
                            {ALIGNS.map((align) => (
                              <MenuItem key={align} value={align}>{align === 'left' ? '左' : align === 'center' ? '中' : '右'}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </TableCell>
                    </>
                  )}
                  <TableCell align="right" sx={{ py: 0.25, whiteSpace: 'nowrap' }}>
                    <Tooltip title="上移">
                      <IconButton size="small" sx={{ p: 0.25 }} disabled={index === 0} onClick={() => moveField(section, index, -1)}>
                        <ArrowUpwardIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="下移">
                      <IconButton size="small" sx={{ p: 0.25 }} disabled={index === list.length - 1} onClick={() => moveField(section, index, 1)}>
                        <ArrowDownwardIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                    {customField && (
                      <Tooltip title="移除自定义字段">
                        <IconButton size="small" sx={{ p: 0.25 }} color="error" onClick={() => removeCustomField(field.key)}>
                          <DeleteIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    );
  };

  const toggleGroup = (key) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleLabelGroup = (index) => {
    setExpandedLabelGroups((prev) => prev.map((value, i) => (i === index ? !value : value)));
  };

  const renderGroupHeader = (title, key, count) => (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      onClick={() => toggleGroup(key)}
      sx={{ px: 1.25, py: 0.75, bgcolor: 'rgba(15,23,42,0.02)', cursor: 'pointer', '&:hover': { bgcolor: 'rgba(0,78,154,0.05)' } }}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 800, flex: 1, minWidth: 0 }}>{title}</Typography>
      <Chip size="small" label={`${count}`} variant="outlined" />
      <IconButton size="small">
        {expandedGroups[key] ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
      </IconButton>
    </Stack>
  );

  const renderFieldsPanel = () => (
    <Box sx={{ p: 1.25 }}>
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden', mb: 1 }}>
        {renderGroupHeader('单据信息字段', 'info', template.infoFields.filter((f) => f.enabled).length)}
        <Collapse in={expandedGroups.info}>
          {renderFieldTable('infoFields')}
          <Stack direction="row" spacing={0.75} sx={{ p: 1 }}>
            <FormControl size="small" fullWidth>
              <InputLabel>添加自定义字段</InputLabel>
              <Select value={customFieldKey} label="添加自定义字段" onChange={(e) => setCustomFieldKey(e.target.value)}>
                {catalog.customFields.map((field) => (
                  <MenuItem key={field.key} value={field.key}>{field.fieldName}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <IconButton color="primary" onClick={addCustomField} disabled={!customFieldKey} title="添加">
              <AddIcon />
            </IconButton>
          </Stack>
        </Collapse>
      </Box>
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden' }}>
        {renderGroupHeader('表格列字段', 'columns', template.columnFields.filter((f) => f.enabled).length)}
        <Collapse in={expandedGroups.columns}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 1.25, pt: 1 }}>
            拖动行或使用上下按钮调整顺序
          </Typography>
          <Box sx={{ p: 1.25, pt: 0.75 }}>{renderFieldTable('columnFields')}</Box>
        </Collapse>
      </Box>
    </Box>
  );

  const renderPagePanel = () => (
    <Box sx={{ p: 1.25 }}>
      <SettingsGrid cols={2}>
        <SettingRow label="纸张方向">
          <FormControl size="small" fullWidth>
            <Select value={template.page.orientation} onChange={(e) => update((next) => { next.page.orientation = e.target.value; })}>
              <MenuItem value="portrait">纵向</MenuItem>
              <MenuItem value="landscape">横向</MenuItem>
            </Select>
          </FormControl>
        </SettingRow>
        <SettingRow label="页边距" hint="24-72 pt">
          <TextField size="small" type="number" fullWidth value={template.page.margin} onChange={(e) => update((next) => { next.page.margin = Number(e.target.value); })} />
        </SettingRow>
        <SettingRow label="公司名称">
          <TextField size="small" fullWidth value={template.company.name} onChange={(e) => update((next) => { next.company.name = e.target.value; })} />
        </SettingRow>
        <SettingRow label="Logo">
          <Stack direction="row" spacing={0.75} alignItems="center">
            <Button size="small" variant="outlined" onClick={() => logoInputRef.current?.click()}>上传</Button>
            {template.layout.logo.data && (
              <Button size="small" color="error" onClick={() => update((next) => { next.layout.logo.data = null; })}>移除</Button>
            )}
          </Stack>
        </SettingRow>
        <SettingRow label="公司地址">
          <TextField size="small" fullWidth value={template.company.address} onChange={(e) => update((next) => { next.company.address = e.target.value; })} />
        </SettingRow>
        <SettingRow label="Logo 位置 / 宽度">
          <Stack direction="row" spacing={0.75}>
            <FormControl size="small" sx={{ flex: 1 }}>
              <Select value={template.layout.logo.position} onChange={(e) => update((next) => { next.layout.logo.position = e.target.value; })}>
                {['left', 'center', 'right'].map((pos) => (
                  <MenuItem key={pos} value={pos}>{pos === 'left' ? '左' : pos === 'center' ? '中' : '右'}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField size="small" type="number" value={template.layout.logo.width} onChange={(e) => update((next) => { next.layout.logo.width = Number(e.target.value); })} sx={{ width: 80 }} />
          </Stack>
        </SettingRow>
        <SettingRow label="联系电话">
          <TextField size="small" fullWidth value={template.company.phone} onChange={(e) => update((next) => { next.company.phone = e.target.value; })} />
        </SettingRow>
        <SettingRow label="电子邮箱">
          <TextField size="small" fullWidth value={template.company.email} onChange={(e) => update((next) => { next.company.email = e.target.value; })} />
        </SettingRow>
      </SettingsGrid>
      <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 1.25, mb: 0.5 }}>颜色</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: '0.25rem 0.9rem' }}>
        {PALETTE_KEYS.map(([key, label]) => (
          <ColorField key={key} label={label} value={template.palette[key]} onChange={(value) => update((next) => { next.palette[key] = value; })} />
        ))}
      </Box>
    </Box>
  );

  const renderTextPanel = () => (
    <Box sx={{ p: 1.25 }}>
      <SettingsGrid cols={2}>
        <SettingRow label="标题">
          <TextField size="small" fullWidth value={template.layout.title} onChange={(e) => update((next) => { next.layout.title = e.target.value; })} />
        </SettingRow>
        <SettingRow label="报价日期">
          <TextField size="small" type="date" fullWidth value={template.layout.quoteDate} InputLabelProps={{ shrink: true }} onChange={(e) => update((next) => { next.layout.quoteDate = e.target.value; })} />
        </SettingRow>
        <SettingRow label="页眉文本">
          <TextField size="small" fullWidth value={template.layout.headerText} onChange={(e) => update((next) => { next.layout.headerText = e.target.value; })} />
        </SettingRow>
        <SettingRow label="页脚文本">
          <TextField size="small" fullWidth value={template.layout.footerText} onChange={(e) => update((next) => { next.layout.footerText = e.target.value; })} />
        </SettingRow>
        <SettingRow label="报价编号模板" hint="支持 {customerShort} {contractShort} {date} {round} {orderId}">
          <TextField size="small" fullWidth value={template.quoteNoTemplate} onChange={(e) => update((next) => { next.quoteNoTemplate = e.target.value; })} />
        </SettingRow>
        <SettingRow label="页眉对齐">
          <FormControl size="small" fullWidth>
            <Select value={template.layout.headerAlignment} onChange={(e) => update((next) => { next.layout.headerAlignment = e.target.value; })}>
              {ALIGNS.map((align) => (
                <MenuItem key={align} value={align}>{align === 'left' ? '左对齐' : align === 'center' ? '居中' : '右对齐'}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </SettingRow>
        <SettingRow label="标题对齐">
          <FormControl size="small" fullWidth>
            <Select value={template.layout.titleAlignment} onChange={(e) => update((next) => { next.layout.titleAlignment = e.target.value; })}>
              {ALIGNS.map((align) => (
                <MenuItem key={align} value={align}>{align === 'left' ? '左对齐' : align === 'center' ? '居中' : '右对齐'}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </SettingRow>
        <SettingRow label="单据信息对齐">
          <FormControl size="small" fullWidth>
            <Select value={template.layout.infoAlignment} onChange={(e) => update((next) => { next.layout.infoAlignment = e.target.value; })}>
              {ALIGNS.map((align) => (
                <MenuItem key={align} value={align}>{align === 'left' ? '左对齐' : align === 'center' ? '居中' : '右对齐'}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </SettingRow>
        <SettingRow label="页脚对齐">
          <FormControl size="small" fullWidth>
            <Select value={template.layout.footerAlignment} onChange={(e) => update((next) => { next.layout.footerAlignment = e.target.value; })}>
              {ALIGNS.map((align) => (
                <MenuItem key={align} value={align}>{align === 'left' ? '左对齐' : align === 'center' ? '居中' : '右对齐'}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </SettingRow>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <FormControlLabel
            control={<Switch checked={Boolean(template.layout.showPageNumbers)} onChange={(e) => update((next) => { next.layout.showPageNumbers = e.target.checked; })} />}
            label="显示页码"
          />
        </Box>
      </SettingsGrid>
    </Box>
  );

  const renderFontPanel = () => (
    <Box sx={{ p: 1.25 }}>
      <SettingsGrid cols={1}>
        <SettingRow label="字体族">
          <FormControl size="small" fullWidth>
            <Select value={template.typography.fontFamily} onChange={(e) => update((next) => { next.typography.fontFamily = e.target.value; })}>
              {FONT_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </SettingRow>
        {template.typography.fontFamily === 'custom' && (
          <SettingRow label="自定义字体">
            <Stack direction="row" spacing={0.75} alignItems="center">
              <Button size="small" variant="outlined" onClick={() => fontInputRef.current?.click()}>上传 TTF/OTF</Button>
              {template.typography.fontFile && <Chip size="small" label={template.typography.fontFile} onDelete={() => update((next) => { next.typography.fontFile = ''; })} />}
            </Stack>
          </SettingRow>
        )}
        <SettingRow label="标题字号">
          <TextField size="small" type="number" fullWidth inputProps={{ min: 12, max: 40 }} value={template.typography.titleSize} onChange={(e) => update((next) => { next.typography.titleSize = Number(e.target.value); })} />
        </SettingRow>
        <SettingRow label="正文字号">
          <TextField size="small" type="number" fullWidth inputProps={{ min: 7, max: 16 }} value={template.typography.bodySize} onChange={(e) => update((next) => { next.typography.bodySize = Number(e.target.value); })} />
        </SettingRow>
        <SettingRow label="表头字号">
          <TextField size="small" type="number" fullWidth inputProps={{ min: 6, max: 14 }} value={template.typography.tableHeaderSize} onChange={(e) => update((next) => { next.typography.tableHeaderSize = Number(e.target.value); })} />
        </SettingRow>
        <SettingRow label="表格字号">
          <TextField size="small" type="number" fullWidth inputProps={{ min: 6, max: 14 }} value={template.typography.tableBodySize} onChange={(e) => update((next) => { next.typography.tableBodySize = Number(e.target.value); })} />
        </SettingRow>
      </SettingsGrid>
    </Box>
  );

  const renderLabelsPanel = () => (
    <Box sx={{ p: 1.25 }}>
      {LABEL_GROUPS.map((group, index) => (
        <Box key={group.title} sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden', mb: 1 }}>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            onClick={() => toggleLabelGroup(index)}
            sx={{ px: 1.25, py: 0.75, bgcolor: 'rgba(15,23,42,0.02)', cursor: 'pointer', '&:hover': { bgcolor: 'rgba(0,78,154,0.05)' } }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 800, flex: 1, minWidth: 0 }}>{group.title}</Typography>
            <Chip size="small" label={`${group.keys.length}`} variant="outlined" />
            <IconButton size="small">
              {expandedLabelGroups[index] ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
          </Stack>
          <Collapse in={expandedLabelGroups[index]}>
            <Box sx={{ p: 1.25 }}>
              {group.keys.map((key) => (
                <SettingRow key={key} label={key}>
                  <TextField size="small" fullWidth value={labels[key]} onChange={(e) => setLabel(key, e.target.value)} />
                </SettingRow>
              ))}
            </Box>
          </Collapse>
        </Box>
      ))}
    </Box>
  );

  const renderSummaryPanel = () => (
    <Box sx={{ p: 1.25 }}>
      <SettingRow label="显示项">
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <FormControlLabel
            control={<Switch size="small" checked={Boolean(template.summary.showTotal)} onChange={(e) => update((next) => { next.summary.showTotal = e.target.checked; })} />}
            label="合计"
          />
          <FormControlLabel
            control={<Switch size="small" checked={Boolean(template.summary.showTerms)} onChange={(e) => update((next) => { next.summary.showTerms = e.target.checked; })} />}
            label="说明条款"
          />
          <FormControlLabel
            control={<Switch size="small" checked={Boolean(template.summary.showSignature)} onChange={(e) => update((next) => { next.summary.showSignature = e.target.checked; })} />}
            label="签名区"
          />
        </Stack>
      </SettingRow>
      <SettingsGrid cols={1}>
        <SettingRow label="合计标签（留空用默认）">
          <TextField size="small" fullWidth value={template.summary.totalLabel} onChange={(e) => update((next) => { next.summary.totalLabel = e.target.value; })} />
        </SettingRow>
        {template.summary.showTerms && (
          <SettingRow label="条款内容">
            <TextField size="small" fullWidth multiline minRows={2} value={template.summary.terms} onChange={(e) => update((next) => { next.summary.terms = e.target.value; })} />
          </SettingRow>
        )}
        <SettingRow label="客户确认标签">
          <TextField size="small" fullWidth value={template.summary.customerSignLabel} onChange={(e) => update((next) => { next.summary.customerSignLabel = e.target.value; })} placeholder="客户确认" />
        </SettingRow>
        <SettingRow label="供应商盖章标签">
          <TextField size="small" fullWidth value={template.summary.supplierSignLabel} onChange={(e) => update((next) => { next.summary.supplierSignLabel = e.target.value; })} placeholder="供应商盖章" />
        </SettingRow>
      </SettingsGrid>
    </Box>
  );

  const renderActiveSection = () => {
    switch (activeSection) {
      case 'page':
        return renderPagePanel();
      case 'text':
        return renderTextPanel();
      case 'font':
        return renderFontPanel();
      case 'labels':
        return renderLabelsPanel();
      case 'summary':
        return renderSummaryPanel();
      default:
        return renderFieldsPanel();
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap" useFlexGap>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>报价模版</Typography>
            <Typography variant="body2" color="text.secondary">设计报价阶段 PDF 报价单的字段、版式与视觉</Typography>
          </Box>
          <Box sx={{ flex: 1 }} />
          <Tooltip title="切换中英文">
            <Button
              size="small"
              variant="outlined"
              startIcon={<TranslateIcon />}
              onClick={toggleLanguage}
              sx={{ fontWeight: 700, textTransform: 'none' }}
            >
              {template.language === 'zh' ? '中文' : 'English'}
            </Button>
          </Tooltip>
          <Tooltip title="撤销">
            <IconButton onClick={undo} disabled={past.length === 0}><UndoIcon /></IconButton>
          </Tooltip>
          <Tooltip title="重做">
            <IconButton onClick={redo} disabled={future.length === 0}><RedoIcon /></IconButton>
          </Tooltip>
          <Button size="small" startIcon={<RestartAltIcon />} onClick={reset} disabled={saving}>恢复默认</Button>
          <Button size="small" startIcon={<FileUploadIcon />} onClick={() => importInputRef.current?.click()}>导入</Button>
          <Button size="small" startIcon={<FileDownloadIcon />} onClick={exportJson}>导出</Button>
          <Button size="small" variant="outlined" startIcon={<PictureAsPdfIcon />} onClick={() => previewPdf(false)} disabled={pdfLoading}>
            {pdfLoading ? '生成中...' : 'PDF 预览'}
          </Button>
          <Button size="small" variant="outlined" startIcon={<FileDownloadIcon />} onClick={() => previewPdf(true)} disabled={pdfLoading}>
            下载测试 PDF
          </Button>
          <Button size="small" variant="contained" startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />} onClick={save} disabled={saving || !dirty}>
            {saving ? '保存中...' : dirty ? '保存模板' : '已保存'}
          </Button>
          <input ref={importInputRef} type="file" accept=".json" hidden onChange={importJson} />
          <input ref={logoInputRef} type="file" accept="image/png,image/jpeg" hidden onChange={uploadLogo} />
          <input ref={fontInputRef} type="file" accept=".ttf,.otf" hidden onChange={uploadFont} />
        </Stack>

        {draftAvailable && (
          <Alert severity="info" action={
            <Stack direction="row" spacing={1}>
              <Button size="small" color="inherit" onClick={restoreDraft}>恢复草稿</Button>
              <Button size="small" color="inherit" onClick={discardDraft}>丢弃</Button>
            </Stack>
          }>
            检测到未保存的编辑草稿
          </Alert>
        )}
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
        {notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: 'minmax(400px, 480px) minmax(0, 1fr)' },
            gap: 1.5,
            alignItems: 'start'
          }}
        >
          <Box sx={{ minWidth: 0, border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', overflow: 'hidden' }}>
            <Stack
              direction="row"
              spacing={0.5}
              alignItems="center"
              sx={{ px: 1, py: 0.75, borderBottom: 1, borderColor: 'divider', bgcolor: 'rgba(15,23,42,0.02)', flexWrap: 'wrap' }}
            >
              {SECTIONS.map((section) => {
                const active = activeSection === section.key;
                return (
                  <Button
                    key={section.key}
                    size="small"
                    onClick={() => setActiveSection(section.key)}
                    sx={{
                      gap: 0.5,
                      px: 1.25,
                      py: 0.5,
                      borderRadius: 1.5,
                      minHeight: 34,
                      color: active ? 'primary.main' : 'text.secondary',
                      bgcolor: active ? 'rgba(0,78,154,0.1)' : 'transparent',
                      fontWeight: active ? 800 : 600,
                      fontSize: 13,
                      textTransform: 'none',
                      border: 1,
                      borderColor: active ? 'primary.main' : 'transparent',
                      whiteSpace: 'nowrap',
                      '&:hover': { bgcolor: active ? 'rgba(0,78,154,0.14)' : 'rgba(15,23,42,0.05)' }
                    }}
                  >
                    {section.icon}
                    {section.label}
                  </Button>
                );
              })}
            </Stack>
            <Box>{renderActiveSection()}</Box>
          </Box>

          <Box sx={{ minWidth: 0, border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'rgba(15,23,42,0.03)', overflow: 'hidden' }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>实时预览</Typography>
              <Chip size="small" label="A4" variant="outlined" />
              <Box sx={{ flex: 1 }} />
              {[0.6, 0.8, 1].map((value) => (
                <Button
                  key={value}
                  size="small"
                  variant={zoom === value ? 'contained' : 'outlined'}
                  onClick={() => setZoom(value)}
                  sx={{ minWidth: 52, fontSize: 12 }}
                >
                  {Math.round(value * 100)}%
                </Button>
              ))}
            </Stack>
            <Box sx={{ p: 1.5, overflow: 'auto', maxHeight: 'calc(100vh - 220px)', minHeight: 540 }}>
              <Box sx={{ width: 794 * zoom, height: 1123 * zoom, mx: 'auto' }}>
                <Box sx={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: 794, height: 1123 }}>
                  <PreviewSheet template={template} />
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>
      </Stack>

      <Dialog open={pdfOpen} onClose={() => { setPdfOpen(false); setPdfUrl(''); }} maxWidth="md" fullWidth>
        <Box sx={{ height: 4, bgcolor: 'primary.main' }} />
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PictureAsPdfIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 800, flex: 1 }}>PDF 预览</Typography>
          <IconButton onClick={() => { setPdfOpen(false); setPdfUrl(''); }}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ height: '70vh', p: 0 }}>
          {pdfUrl ? <Box component="iframe" title="PDF 预览" src={pdfUrl} sx={{ width: '100%', height: '100%', border: 0 }} /> : <CircularProgress />}
        </DialogContent>
        <DialogActions>
          <Button startIcon={<FileDownloadIcon />} onClick={() => previewPdf(true)}>下载 PDF</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
