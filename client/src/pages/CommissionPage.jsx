import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import Pagination from '@mui/material/Pagination';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TableSortLabel from '@mui/material/TableSortLabel';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import CheckIcon from '@mui/icons-material/Check';
import PaymentsIcon from '@mui/icons-material/Payments';
import PieChartIcon from '@mui/icons-material/PieChart';
import ScheduleIcon from '@mui/icons-material/Schedule';
import InboxIcon from '@mui/icons-material/Inbox';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DeleteIcon from '@mui/icons-material/Delete';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import api, { errorMessage } from '../api';
import { fmtDateTime, fmtMoney, fmtSignedMoney, fmtSignedPercent, niceAxisMax, smoothLinePath } from '../utils/helpers';
import { useFieldLabels } from '../utils/fieldLabels';
import { tableHeadTokens } from '../theme/md3Theme';

export default function CommissionPage() {
  const [waiting, setWaiting] = useState([]);
  const [waitingPage, setWaitingPage] = useState(1);
  const [waitingPageSize, setWaitingPageSize] = useState(20);
  const [waitingTotal, setWaitingTotal] = useState(0);
  const [imports, setImports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [soColumn, setSoColumn] = useState('');
  const [amountColumns, setAmountColumns] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [headerRowIdx, setHeaderRowIdx] = useState(0);
  const [sheetInfo, setSheetInfo] = useState({ sheetNames: [], sheetName: '' });
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [previewRows, setPreviewRows] = useState([]);
  const [manualTarget, setManualTarget] = useState(null);
  const [manualAmount, setManualAmount] = useState('');
  const [manualRemark, setManualRemark] = useState('');
  const [manualError, setManualError] = useState('');
  const [tab, setTab] = useState(0);
  const [manualSubmitting, setManualSubmitting] = useState(false);

  const [sheets, setSheets] = useState([]);

  function colLetter(idx) {
    if (idx < 26) return String.fromCharCode(65 + idx);
    return String.fromCharCode(65 + Math.floor(idx / 26) - 1) + String.fromCharCode(65 + idx % 26);
  }

  const [clearing, setClearing] = useState(false);

  // 请求序号守卫: 只采纳最后一次请求的结果, 防止快速翻页/切 tab 时旧响应覆盖新数据
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const [waitRes, importRes] = await Promise.all([
        api.get('/commission/waiting', { params: { page: waitingPage, limit: waitingPageSize } }),
        api.get('/commission/imports')
      ]);
      if (seq !== loadSeq.current) return;
      setWaiting(waitRes.data.items || []);
      setWaitingTotal(waitRes.data.total || 0);
      setImports(importRes.data.items || []);
      const maxPage = Math.max(1, Math.ceil((waitRes.data.total || 0) / waitingPageSize));
      if (waitingPage > maxPage) setWaitingPage(maxPage);
      setError('');
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(errorMessage(err, '加载失败'));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [waitingPage, waitingPageSize]);

  const clearImports = async () => {
    if (!window.confirm('确认清空全部匹配历史？此操作不可撤销。')) return;
    setClearing(true);
    try {
      await api.delete('/commission/imports');
      setImports([]);
    } catch (err) {
      setError(errorMessage(err, '清空失败'));
    } finally {
      setClearing(false);
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  const pickFile = async (event) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setResult(null);
    setSoColumn('');
    setAmountColumns([]);
    try {
      const XLSX = await import('xlsx');
      const data = await selected.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      
      const sheetConfigs = [];
      for (const sheetName of workbook.SheetNames) {
        const rowData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null });
        
        // 自动检测表头行（优先第3行，即 index 2）
        let hdrIdx = 2;
        let bestScore = -1;
        for (let i = 0; i < Math.min(10, rowData.length); i++) {
          const row = rowData[i] || [];
          const nonEmpty = row.filter((c) => c != null && String(c).trim() !== '');
          if (nonEmpty.length < 5) continue;
          const allStringish = nonEmpty.every((c) => {
            const s = String(c).trim();
            const num = Number(s);
            return !Number.isFinite(num) || (s.length < 12 && Math.abs(num) < 1000000);
          });
          if (allStringish && nonEmpty.length > bestScore) {
            bestScore = nonEmpty.length;
            hdrIdx = i;
          }
        }
        
        const headerRow = rowData[hdrIdx] || [];
        const cleanHeaders = headerRow.map((cell) => String(cell ?? '').trim());
        const dataRows = Math.max(0, rowData.length - hdrIdx - 1);
        
        sheetConfigs.push({
          sheetName,
          headerRowIdx: hdrIdx,
          headers: cleanHeaders,
          totalRows: dataRows,
          rowData,
          enabled: false,
        });
      }
      
      // 默认只启用第一个有数据的 sheet
      if (sheetConfigs.length > 0 && sheetConfigs[0].totalRows > 0) {
        sheetConfigs[0].enabled = true;
      }
      
      setSheets(sheetConfigs);
      const first = sheetConfigs[0] || {};
      setHeaders(first.headers || []);
      setHeaderRowIdx(first.headerRowIdx || 0);
      setPreviewRows((first.rowData || []).slice((first.headerRowIdx || 0) + 1, (first.headerRowIdx || 0) + 6).map((row) => (first.headers || []).map((_, idx) => row[idx] ?? '')));
      setSheetInfo({ sheetNames: workbook.SheetNames, sheetName: workbook.SheetNames[0], totalSheets: workbook.SheetNames.length });
      
      // 默认 SO 列：Sales Docu
      const soCandidates = ['SalesOrder', 'Sales Docu', 'sales_order', 'SO号', 'SO', 'SlsDoc'];
      const defaultSoIdx = (first.headers || []).findIndex((h) => soCandidates.some((c) => h.includes(c)));
      const defaultSoKey = defaultSoIdx >= 0 ? colLetter(defaultSoIdx) : '';
      setSoColumn(defaultSoKey);
      
      // 默认佣金列：Z (idx=25) 和 AC (idx=28)
      const defaultAmountKeys = [];
      if ((first.headers || []).length > 28) {
        // 如果存在 Z 和 AC 列（索引 25 和 28）
        defaultAmountKeys.push(colLetter(25)); // Z
        defaultAmountKeys.push(colLetter(28)); // AC
      } else {
        // 尝试匹配列名
        const amountCandidates = ['Commision', 'Commission', '佣金', 'Agent Fee', 'Current Commission'];
        (first.headers || []).forEach((h, idx) => {
          if (amountCandidates.some(c => h.includes(c))) {
            defaultAmountKeys.push(colLetter(idx));
          }
        });
      }
      setAmountColumns(defaultAmountKeys);
    } catch {
      setError('无法解析 Excel 表头');
    }
  };

  const upload = async () => {
    if (!file) {
      setError('请先选择佣金 Excel 文件');
      return;
    }
    if (!soColumn || amountColumns.length === 0) {
      setError('请选择 SO 号列与至少一个佣金金额列');
      return;
    }
    setError('');
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('soColumn', soColumn);
    amountColumns.forEach((col) => formData.append('amountColumns', col));
    const enabledSheets = sheets.filter(s => s.enabled && s.totalRows > 0);
    formData.append('sheets', JSON.stringify(enabledSheets.map(s => ({ sheetName: s.sheetName, headerRowIdx: s.headerRowIdx }))));
    formData.append('totalSheets', String(enabledSheets.length));
    try {
      const { data } = await api.post('/commission/upload', formData);
      setResult(data);
      setFile(null);
      setPreviewRows([]);
      setPickerOpen(false);
      await load();
      setUploading(false);
    } catch (err) {
      setError(errorMessage(err));
      setUploading(false);
    }
  };

  const manualSubmit = async () => {
    if (manualAmount.trim() === '' || !Number.isFinite(Number(manualAmount)) || Number(manualAmount) < 0) {
      setManualError('补录金额不能小于 0');
      return;
    }
    setManualError('');
    setManualSubmitting(true);
    try {
      await api.post('/commission/manual', { order_id: manualTarget.id, amount: Number(manualAmount), remark: manualRemark });
      setManualTarget(null);
      setManualAmount('');
      setManualRemark('');
      setManualError('');
      setManualSubmitting(false);
      load();
    } catch (err) {
      setManualError(errorMessage(err));
      setManualSubmitting(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h5">佣金结算</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>
          上传佣金 Excel 全局匹配，或对等待清单人工补录
        </Typography>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)}
        sx={(theme) => {
          const tk = tableHeadTokens[theme.palette.mode];
          return {
            minHeight: 48,
            bgcolor: tk.bg,
            borderRadius: 1.5,
            '& .MuiTabs-indicator': { height: 3, borderRadius: 2, bottom: 4 },
            '& .MuiTab-root': { minHeight: 48, fontWeight: 700, textTransform: 'none', fontSize: 14, px: 3,
              borderRadius: 1.5, mx: 0.5,
              '&.Mui-selected': { bgcolor: theme.palette.mode === 'dark' ? 'rgba(59,130,246,0.15)' : '#eff6ff' }
            }
          };
        }}>
        <Tab icon={<PieChartIcon />} iconPosition="start" label="佣金总览" />
        <Tab icon={<WarningAmberIcon />} iconPosition="start" label="佣金偏差" />
        <Tab icon={<PaymentsIcon />} iconPosition="start" label="佣金结算" />
      </Tabs>

      {tab === 2 && (
        <>
          {error && <Alert severity="error" onClose={() => setError('')} sx={{ borderRadius: 1.5 }}>{error}</Alert>}
          {result && (
            <>
              {/* 汇总卡片 */}
              <Card sx={{
                borderRadius: 2,
                background: result.matched > 0
                  ? 'linear-gradient(135deg, #059669, #10b981)'
                  : 'linear-gradient(135deg, #0284c7, #0ea5e9)',
                color: 'white',
                boxShadow: '0 4px 20px rgba(16,185,129,0.25)',
              }}>
                <CardContent sx={{ p: 2.5 }}>
                  <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#fff' }} />
                    <Typography variant="h6" fontWeight={800} color="inherit">Excel 匹配汇总</Typography>
                    <Chip size="small" label={`${result.total_sheets ?? 1} 个工作表`} sx={{ ml: 'auto', bgcolor: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 700 }} />
                  </Stack>
                  <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
                    <Stack>
                      <Typography variant="caption" color="rgba(255,255,255,0.8)">成功匹配</Typography>
                      <Typography variant="h6" fontWeight={800}>{result.matched ?? 0} 条订单</Typography>
                    </Stack>
                    <Box sx={{ width: 1, alignSelf: 'stretch', bgcolor: 'rgba(255,255,255,0.2)' }} />
                    <Stack>
                      <Typography variant="caption" color="rgba(255,255,255,0.8)">失败</Typography>
                      <Typography variant="h6" fontWeight={800}>{result.fail_rows ?? 0} 行</Typography>
                    </Stack>
                    <Box sx={{ width: 1, alignSelf: 'stretch', bgcolor: 'rgba(255,255,255,0.2)' }} />
                    <Stack>
                      <Typography variant="caption" color="rgba(255,255,255,0.8)">重复 SO 合并</Typography>
                      <Typography variant="h6" fontWeight={800}>{result.duplicate_so_count ?? 0} 条</Typography>
                    </Stack>
                    <Box sx={{ width: 1, alignSelf: 'stretch', bgcolor: 'rgba(255,255,255,0.2)' }} />
                    <Stack>
                      <Typography variant="caption" color="rgba(255,255,255,0.8)">已匹配跳过</Typography>
                      <Typography variant="h6" fontWeight={800}>{result.skipped_matched_count ?? 0} 条</Typography>
                    </Stack>
                  </Stack>
                  <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                    <Button size="small" variant="contained" color="inherit" sx={{ color: '#059669', bgcolor: '#fff', fontWeight: 700, '&:hover': { bgcolor: '#ecfdf5' } }} onClick={() => setResult(null)}>知道了</Button>
                  </Stack>
                </CardContent>
              </Card>
              
              {/* 分工作表结果 */}
              {result.sheet_results && result.sheet_results.length > 0 && (
                <Card sx={{ borderRadius: 2, overflow: 'hidden' }}>
                  <CardContent sx={{ p: 0 }}>
                    <Typography variant="body1" fontWeight={800} sx={(theme) => { const tk = tableHeadTokens[theme.palette.mode]; return { px: 2.5, py: 1.5, borderBottom: '1px solid', borderColor: tk.border, bgcolor: tk.bg }; }}>分工作表明细</Typography>
                    <Table size="small" sx={(theme) => { const tk = tableHeadTokens[theme.palette.mode]; return { '& .MuiTableCell-head': { fontWeight: 800, bgcolor: tk.bg, color: tk.color } }; }}>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>工作表</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>总行数</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800, whiteSpace: 'nowrap', color: 'success.main' }}>成功SO</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800, whiteSpace: 'nowrap', color: 'warning.main' }}>重复SO</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800, whiteSpace: 'nowrap', color: 'error.main' }}>失败</TableCell>
                          <TableCell sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>状态</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {result.sheet_results.map((sr, i) => (
                          <TableRow key={sr.sheetName || i} hover>
                            <TableCell sx={{ fontWeight: 700 }}>{sr.sheetName}</TableCell>
                            <TableCell align="right">{sr.totalRows}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700, color: sr.matchedSo > 0 ? 'success.main' : 'text.secondary' }}>{sr.matchedSo}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700, color: sr.duplicateSo > 0 ? 'warning.main' : 'text.secondary' }}>{sr.duplicateSo}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700, color: sr.failRows > 0 ? 'error.main' : 'text.secondary' }}>{sr.failRows}</TableCell>
                            <TableCell>
                              {sr.status === '已处理' ? (
                                <Chip size="small" label={sr.status} color="success" variant="outlined" sx={{ height: 22, fontWeight: 700 }} />
                              ) : sr.status === '列未匹配' ? (
                                <Chip size="small" label={sr.status} color="warning" variant="outlined" sx={{ height: 22, fontWeight: 700 }} />
                              ) : (
                                <Chip size="small" label={sr.status} variant="outlined" sx={{ height: 22, fontWeight: 700 }} />
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </>
          )}
          {uploading && (
            <Alert severity="info" icon={<CircularProgress size={18} />}>
              正在上传并解析佣金 Excel，请稍候...
            </Alert>
          )}

          <Card sx={{ borderRadius: 2, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <CardContent sx={{ p: 2.5 }}>
              <Typography variant="h6" fontWeight={800} sx={{ mb: 0.5 }}>佣金 Excel 全局匹配</Typography>
              <Typography variant="body2" color="text.secondary">支持 .xlsx / .xls · 多工作表 · 列自动识别</Typography>
              <Box component="label" sx={{
                display: 'block', mt: 2, p: 3,
                border: '2px dashed',
                borderColor: (theme) => (file ? 'success.main' : (theme.palette.mode === 'dark' ? 'grey.600' : 'grey.300')),
                borderRadius: 2.5, cursor: 'pointer', textAlign: 'center',
                transition: 'all 0.2s',
                bgcolor: (theme) => (file ? (theme.palette.mode === 'dark' ? 'rgba(16,185,129,0.08)' : '#f0fdf4') : 'transparent'),
                '&:hover': { bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#f8fafc'), borderColor: 'primary.main' }
              }}>
                {file ? (
                  <>
                    <CheckIcon sx={{ fontSize: 32, color: 'success.main', mb: 0.5 }} />
                    <Typography variant="body1" fontWeight={700} color="success.main">{file.name}</Typography>
                    <Typography variant="caption" color="text.secondary">点击重新选择文件</Typography>
                  </>
                ) : (
                  <>
                    <UploadFileIcon sx={{ fontSize: 32, color: 'grey.400', mb: 0.5 }} />
                    <Typography variant="body1" fontWeight={600}>点击或拖拽选择佣金 Excel</Typography>
                    <Typography variant="caption" color="text.secondary">支持 .xlsx / .xls 格式</Typography>
                  </>
                )}
                <input type="file" hidden accept=".xlsx,.xls" onChange={pickFile} />
              </Box>

              {file && headers.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                    <Chip size="small" label={file.name} variant="outlined" sx={{ fontWeight: 700, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }} />
                    <Chip size="small" label={`${sheetInfo.totalSheets || 1} 个工作表`} color="info" variant="outlined" sx={{ fontWeight: 700 }} />
                    <Chip size="small" label={`表头行: ${headerRowIdx + 1}`} variant="outlined" sx={{ fontWeight: 700 }} />
                  </Stack>
                  <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Button variant="outlined" color="secondary" onClick={() => setPickerOpen(true)}
                      startIcon={soColumn || amountColumns.length ? <CheckIcon color="success" /> : null}>
                      配置匹配列
                    </Button>
                    {soColumn && (
                      <Chip size="small" label={`SO: ${soColumn}`} color="primary" variant="outlined" sx={{ fontWeight: 700 }} />
                    )}
                    {amountColumns.length > 0 && (
                      <Chip size="small" label={`佣金: ${amountColumns.join(', ')}`} color="success" variant="outlined" sx={{ fontWeight: 700 }} />
                    )}
                    {!soColumn && amountColumns.length === 0 && (
                      <Typography variant="caption" color="text.secondary">请点击按钮选择列</Typography>
                    )}
                  </Stack>

                  <Dialog open={pickerOpen} onClose={() => setPickerOpen(false)} maxWidth="xl" fullWidth>
                    <DialogTitle sx={{ pb: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                      <Stack direction="row" alignItems="center" spacing={2}>
                        <Typography variant="h6" fontWeight={800}>配置匹配列</Typography>
                        <Chip size="small" label={file?.name || ''} variant="outlined" sx={{ fontSize: 12, height: 24, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }} />
                        <Chip size="small" label={`${sheets.length} 个工作表`} color="primary" variant="outlined" sx={{ fontSize: 12, height: 24 }} />
                        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                          已选 <b>{soColumn ? 1 : 0}</b> SO · <b>{amountColumns.length}</b> 佣金
                        </Typography>
                      </Stack>
                    </DialogTitle>
                    <DialogContent sx={{ pt: 2.5 }}>
                      <Stack spacing={2.5}>
                        {/* 工作表横向卡片 */}
                        {sheets.length > 1 && (
                          <Box>
                            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                              <Typography variant="body2" fontWeight={700} color="text.secondary">
                                工作表（{sheets.length} 个）
                              </Typography>
                              <Stack direction="row" spacing={0.5}>
                                <Button size="small" variant="text" onClick={() => {
                                  setSheets(sheets.map(s => ({ ...s, enabled: s.totalRows > 0 })));
                                }} sx={{ fontSize: 12, fontWeight: 700, minWidth: 50 }}>全选</Button>
                                <Button size="small" variant="text" onClick={() => {
                                  setSheets(sheets.map(s => ({ ...s, enabled: false })));
                                }} sx={{ fontSize: 12, fontWeight: 700, minWidth: 50 }}>清空</Button>
                              </Stack>
                            </Stack>
                            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                              {sheets.map((s, i) => (
                                <Card
                                  key={s.sheetName}
                                  variant="outlined"
                                  onClick={() => {
                                    if (s.totalRows === 0) return;
                                    const updated = { ...s, enabled: !s.enabled };
                                    setSheets(sheets.map((sc, idx) => idx === i ? updated : sc));
                                    setActiveSheetIdx(i);
                                    setHeaders(s.headers);
                                    setHeaderRowIdx(s.headerRowIdx);
                                    setPreviewRows(s.rowData.slice(s.headerRowIdx + 1, s.headerRowIdx + 6).map((row) => s.headers.map((_, idx) => row[idx] ?? '')));
                                    setSheetInfo(prev => ({ ...prev, sheetName: s.sheetName }));
                                  }}
                                  sx={{
                                    px: 1.5,
                                    py: 1,
                                    minWidth: 120,
                                    cursor: s.totalRows === 0 ? 'not-allowed' : 'pointer',
                                    opacity: s.totalRows === 0 ? 0.4 : 1,
                                    borderColor: (theme) => (s.enabled ? (theme.palette.mode === 'dark' ? '#60a5fa' : '#3b82f6') : 'divider'),
                                    borderWidth: s.enabled ? 2 : 1,
                                    bgcolor: (theme) => (s.enabled ? (theme.palette.mode === 'dark' ? 'rgba(59,130,246,0.12)' : '#eff6ff') : 'transparent'),
                                    transition: 'all 0.15s',
                                    '&:hover': s.totalRows > 0 ? {
                                      borderColor: (theme) => (theme.palette.mode === 'dark' ? '#60a5fa' : '#3b82f6'),
                                      bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(59,130,246,0.18)' : '#dbeafe'),
                                    } : {},
                                  }}
                                >
                                  <Stack direction="row" spacing={0.75} alignItems="center">
                                    {s.enabled && <CheckIcon sx={{ fontSize: 16, color: 'primary.main' }} />}
                                    <Stack spacing={0}>
                                      <Typography variant="body2" fontWeight={700} sx={{ lineHeight: 1.2 }}>{s.sheetName}</Typography>
                                      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>{s.totalRows} 行数据</Typography>
                                    </Stack>
                                  </Stack>
                                </Card>
                              ))}
                            </Stack>
                          </Box>
                        )}

                        {/* 列选择器 + 表头行 */}
                        <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ flexWrap: 'wrap', useFlexGap: true }}>
                          <Box sx={{ minWidth: 120 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                              当前工作表：<b>{sheetInfo.sheetName}</b>
                            </Typography>
                            <TextField select size="small" label="表头行" value={headerRowIdx}
                              onChange={(e) => {
                                const newIdx = Number(e.target.value);
                                const sheet = sheets[activeSheetIdx];
                                if (!sheet) return;
                                const headerRow = sheet.rowData[newIdx] || [];
                                const ch = headerRow.map((cell) => String(cell ?? '').trim());
                                const updated = { ...sheet, headerRowIdx: newIdx, headers: ch, totalRows: Math.max(0, sheet.rowData.length - newIdx - 1) };
                                setSheets(sheets.map((s, i) => i === activeSheetIdx ? updated : s));
                                setHeaders(ch);
                                setHeaderRowIdx(newIdx);
                                setPreviewRows(sheet.rowData.slice(newIdx + 1, newIdx + 6).map((row) => ch.map((_, i) => row[i] ?? '')));
                              }}
                              sx={{ minWidth: 100 }} SelectProps={{ native: true }}>
                              {Array.from({ length: Math.min(15, (sheets[activeSheetIdx]?.totalRows || 0) + (sheets[activeSheetIdx]?.headerRowIdx || 0) + 1) }, (_, i) => (
                                <option key={i} value={i}>第 {i + 1} 行</option>
                              ))}
                            </TextField>
                          </Box>
                          <Box flex={1} sx={{ minWidth: 400 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                              列选择说明
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              点击「设为SO」选择 SO 号列（单选） · 点击「设为佣金」选择金额列（多选，同 SO 累计） · 
                              空标题列以列字母标识（Z, AC...）
                            </Typography>
                          </Box>
                        </Stack>
                      </Stack>
                      <Box sx={{ maxHeight: 380, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead style={{ position: 'sticky', top: 0, background: '#f5f5f5', zIndex: 1 }}>
                            <tr>
                              <th style={{ padding: '8px 6px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>列</th>
                              <th style={{ padding: '8px 6px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>列名</th>
                              <th style={{ padding: '8px 6px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>示例</th>
                              <th style={{ padding: '8px 6px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>SO</th>
                              <th style={{ padding: '8px 6px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>佣金</th>
                            </tr>
                          </thead>
                          <tbody>
                            {headers.map((h, idx) => {
                              const sample = previewRows[0] && previewRows[0][idx] != null && previewRows[0][idx] !== '' ? previewRows[0][idx] : '—';
                              const key = colLetter(idx);
                              return (
                                <tr key={key} style={{ borderBottom: '1px solid #eee' }}>
                                  <td style={{ padding: '6px', fontWeight: 700, color: '#1976D2', whiteSpace: 'nowrap' }}>{key}</td>
                                  <td style={{ padding: '6px', color: h ? '#333' : '#999', fontStyle: h ? 'normal' : 'italic' }}>{h || '(空标题)'}</td>
                                  <td style={{ padding: '6px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#666' }}>{String(sample)}</td>
                                  <td style={{ padding: '6px', textAlign: 'center' }}>
                                    <button type="button" onClick={() => setSoColumn(key)}
                                      style={{ padding: '2px 10px', fontSize: 12, fontWeight: 700, border: '1px solid', borderRadius: 4, cursor: 'pointer',
                                        background: soColumn === key ? '#1976D2' : '#fff', color: soColumn === key ? '#fff' : '#1976D2', borderColor: '#1976D2' }}>
                                      {soColumn === key ? '✓ 已选' : '设为SO'}
                                    </button>
                                  </td>
                                  <td style={{ padding: '6px', textAlign: 'center' }}>
                                    <button type="button" onClick={() => setAmountColumns((prev) => prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key])}
                                      style={{ padding: '2px 10px', fontSize: 12, fontWeight: 700, border: '1px solid', borderRadius: 4, cursor: 'pointer',
                                        background: amountColumns.includes(key) ? '#2E7D32' : '#fff', color: amountColumns.includes(key) ? '#fff' : '#2E7D32', borderColor: '#2E7D32' }}>
                                      {amountColumns.includes(key) ? '✓ 已选' : '设为佣金'}
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </Box>
                    </DialogContent>
                    <DialogActions>
                      <Typography variant="caption" color="text.secondary" sx={{ flex: 1, ml: 1 }}>
                        {soColumn ? <>SO: <b>{soColumn}</b></> : 'SO: 未选'}
                        &nbsp;|&nbsp;
                        {amountColumns.length > 0 ? <>佣金: <b>{amountColumns.join(', ')}</b></> : '佣金: 未选'}
                      </Typography>
                      <Button onClick={() => setPickerOpen(false)} color="inherit">关闭</Button>
                      {soColumn && amountColumns.length > 0 && (
                        <Button variant="contained" onClick={upload} disabled={uploading}
                          startIcon={uploading ? <CircularProgress size={16} color="inherit" /> : <UploadFileIcon />}>
                          {uploading ? '正在解析匹配...' : '确认并上传匹配'}
                        </Button>
                      )}
                    </DialogActions>
                  </Dialog>
                </Box>
              )}            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1.5, flexWrap: 'nowrap' }}>
                <Box sx={{ width: 4, height: 22, borderRadius: 2, bgcolor: 'primary.main', flexShrink: 0 }} />
                <Typography variant="h6" fontWeight={800} sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>等待匹配清单</Typography>
                {!loading && waitingTotal > 0 && (
                  <Chip size="small" color="primary" label={`共 ${waitingTotal} 条`} sx={{ fontWeight: 800, fontSize: 13, height: 26, flexShrink: 0 }} />
                )}
                {loading && <CircularProgress size={18} sx={{ ml: 1 }} />}
              </Stack>
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress /></Box>
              ) : waiting.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <PaymentsIcon sx={{ fontSize: 40, color: 'grey.300', mb: 1 }} />
                  <Typography variant="body2" color="text.secondary">暂无等待匹配的商机</Typography>
                </Box>
              ) : (
                <>
                <Table size="small" sx={{ '& .MuiTableCell-head': { fontWeight: 800 } }}>
                  <TableHead>
                    <TableRow sx={(theme) => { const tk = tableHeadTokens[theme.palette.mode]; return { '& .MuiTableCell-head': { bgcolor: tk.bg, color: tk.color } }; }}>
                      <TableCell sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>商机号</TableCell>
                      <TableCell sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>最终客户</TableCell>
                      <TableCell sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>SO</TableCell>
                      <TableCell sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>PO</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>金额</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>预计佣金 (1%)</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>操作</TableCell>
                    </TableRow>
                    {/* 汇总行 - 直接在表头下方，对齐列 */}
                    <TableRow sx={(theme) => ({ '& .MuiTableCell-head': { bgcolor: theme.palette.mode === 'dark' ? '#1a3a1a' : '#f0fdf4', borderBottom: '2px solid ' + (theme.palette.mode === 'dark' ? '#4ade80' : '#22c55e') } })}>
                      <TableCell sx={(theme) => ({ fontWeight: 800, color: theme.palette.mode === 'dark' ? '#86efac' : '#15803d', py: 0.75 })} colSpan={4}>
                        合计：{waiting.length} 条
                      </TableCell>
                      <TableCell align="right" sx={(theme) => ({ fontWeight: 800, color: theme.palette.mode === 'dark' ? '#86efac' : '#15803d', py: 0.75, whiteSpace: 'nowrap' })}>
                        {fmtMoney(waiting.reduce((s, i) => s + (i.total_amount || 0), 0))}
                      </TableCell>
                      <TableCell align="right" sx={(theme) => ({ fontWeight: 800, color: theme.palette.mode === 'dark' ? '#86efac' : '#15803d', py: 0.75, whiteSpace: 'nowrap' })}>
                        {fmtMoney(waiting.reduce((s, i) => s + (i.expected_commission || 0), 0))}
                      </TableCell>
                      <TableCell sx={{ py: 0.75 }} />
                    </TableRow>
                  </TableHead>
                    <TableBody>
                      {waiting.map((item) => (
                        <TableRow key={item.id} hover sx={(theme) => ({ '&:hover': { bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : '#fafbfd' } })}>
                          <TableCell sx={{ fontWeight: 700, color: 'primary.main', whiteSpace: 'nowrap' }}>{item.order_id}</TableCell>
                          <TableCell sx={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.end_customer_name || '-'}
                          </TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>{item.sales_order || '-'}</TableCell>
                          <TableCell sx={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.po_numbers || '-'}
                          </TableCell>
                          <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{fmtMoney(item.total_amount)}</TableCell>
                          <TableCell align="right" sx={{ whiteSpace: 'nowrap', color: 'success.main', fontWeight: 700 }}>
                            {item.expected_commission != null ? fmtMoney(item.expected_commission) : '-'}
                          </TableCell>
                          <TableCell align="center">
                            <Button size="small" variant="outlined" color="secondary"
                              startIcon={<AddCircleIcon fontSize="small" />}
                              onClick={() => { setManualTarget(item); setManualAmount(''); setManualRemark(''); setManualError(''); }}
                              sx={{ fontWeight: 700, fontSize: 12 }}>
                              补录
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <TablePagination
                    component="div"
                    count={waitingTotal}
                    page={waitingPage - 1}
                    rowsPerPage={waitingPageSize}
                    onPageChange={(_, nextPage) => setWaitingPage(nextPage + 1)}
                    onRowsPerPageChange={(e) => {
                      setWaitingPageSize(parseInt(e.target.value, 10) || 20);
                      setWaitingPage(1);
                    }}
                    rowsPerPageOptions={[20, 50, 100]}
                    labelRowsPerPage="每页"
                    labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${count}`}
                  />
                </>
              )}
            </CardContent>
          </Card>

          <Card sx={{ borderRadius: 2, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", overflow: 'visible' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Box sx={{ width: 4, height: 22, borderRadius: 2, bgcolor: 'info.main' }} />
                  <Typography variant="h6" fontWeight={800}>匹配历史</Typography>
                  {!loading && <Chip size="small" color="info" label={`共 ${imports.length} 条`} sx={{ fontWeight: 800, height: 26 }} />}
                </Stack>
                {imports.length > 0 && (
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteIcon />}
                    disabled={clearing}
                    onClick={clearImports}
                    sx={{ fontWeight: 700, borderRadius: 2, fontSize: 13 }}
                  >
                    {clearing ? '清空中...' : '清空全部'}
                  </Button>
                )}
              </Stack>
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress /></Box>
              ) : imports.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <InboxIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                  <Typography variant="body2" color="text.secondary">暂无匹配历史</Typography>
                </Box>
              ) : (
                <Box sx={{ maxHeight: 420, overflow: 'auto', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                  <Table size="small" stickyHeader sx={(theme) => { const tk = tableHeadTokens[theme.palette.mode]; return { '& .MuiTableCell-head': { bgcolor: tk.bg, color: tk.color, fontWeight: 800 } }; }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>文件名</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>总计</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap', color: 'success.main' }}>成功</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap', color: 'error.main' }}>失败</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>时间</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {imports.map((item) => (
                        <TableRow key={item.id} hover>
                          <TableCell sx={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{item.file_name || '-'}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>{item.total_rows ?? '-'}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700, color: 'success.main' }}>{item.success_rows ?? 0}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700, color: item.fail_rows > 0 ? 'error.main' : 'text.secondary' }}>{item.fail_rows ?? 0}</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap', fontSize: 13, color: 'text.secondary' }}>{item.created_at ? fmtDateTime(item.created_at) : '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {tab === 0 && <CommissionOverview />}
      {tab === 1 && <CommissionDeviations />}

      <Dialog open={!!manualTarget} onClose={() => setManualTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <AddCircleIcon color="secondary" />
            <span>人工补录佣金</span>
          </Stack>
        </DialogTitle>
        <DialogContent>
          {manualTarget && (
            <Stack spacing={2.5} sx={{ mt: 0.5 }}>
              {/* 订单信息卡片 */}
              <Box sx={{
                p: 2,
                borderRadius: 2,
                background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
                border: '1px solid',
                borderColor: 'primary.light',
              }}>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1.5 }}>
                  <Box sx={{
                    width: 40, height: 40, borderRadius: 2,
                    background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontWeight: 900, fontSize: 16,
                  }}>
                    {manualTarget.order_type || '#'}
                  </Box>
                  <Box>
                    <Typography variant="body1" fontWeight={800}>{manualTarget.order_id}</Typography>
                    <Typography variant="caption" color="text.secondary">{manualTarget.end_customer_name || '未分配客户'}</Typography>
                  </Box>
                </Stack>

                <Stack spacing={0.75}>
                  <Stack direction="row" spacing={3}>
                    <Stack spacing={0.25}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>SO 号</Typography>
                      <Typography variant="body2" fontWeight={700}>{manualTarget.sales_order || '-'}</Typography>
                    </Stack>
                    <Stack spacing={0.25} flex={1}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>PO 号</Typography>
                      <Typography variant="body2" fontWeight={700} sx={{ wordBreak: 'break-all' }}>{manualTarget.po_numbers || '-'}</Typography>
                    </Stack>
                  </Stack>

                  <Stack direction="row" spacing={3} sx={{ pt: 0.5, borderTop: '1px dashed', borderColor: 'grey.300' }}>
                    <Stack spacing={0.25}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>订单金额</Typography>
                      <Typography variant="body2" fontWeight={800} color="text.primary">{fmtMoney(manualTarget.total_amount)}</Typography>
                    </Stack>
                    <Stack spacing={0.25}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>预计佣金 (1%)</Typography>
                      <Typography variant="body2" fontWeight={800} color="success.main">
                        {manualTarget.expected_commission != null ? fmtMoney(manualTarget.expected_commission) : '-'}
                      </Typography>
                    </Stack>
                  </Stack>
                </Stack>
              </Box>

              {/* 输入区 */}
              <TextField
                label="补录金额"
                type="number"
                fullWidth
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
                autoFocus
                placeholder="请输入实际佣金金额"
                InputProps={{
                  startAdornment: <Typography sx={{ mr: 0.75, color: 'text.secondary', fontWeight: 700, fontSize: 18 }}>¥</Typography>,
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 1.5,
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'secondary.main', borderWidth: 2 },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'secondary.main', borderWidth: 2 },
                  },
                  '& .MuiInputLabel-root.Mui-focused': { color: 'secondary.main' },
                }}
              />

              <TextField
                label="备注（可选）"
                fullWidth
                value={manualRemark}
                onChange={(e) => setManualRemark(e.target.value)}
                multiline
                rows={2}
                placeholder="如：佣金调整原因、特殊说明等"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 1.5,
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'secondary.main', borderWidth: 2 },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'secondary.main', borderWidth: 2 },
                  },
                }}
              />

              {manualError && (
                <Alert severity="error" sx={{ borderRadius: 1.5 }}>{manualError}</Alert>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, pt: 1 }}>
          <Button onClick={() => setManualTarget(null)} color="inherit" sx={{ fontWeight: 700 }}>取消</Button>
          <Button variant="contained" onClick={manualSubmit} disabled={manualSubmitting} color="secondary"
            startIcon={manualSubmitting ? <CircularProgress size={16} color="inherit" /> : <CheckIcon />}
            sx={{
              fontWeight: 700,
              px: 3,
              borderRadius: 1.5,
              background: 'linear-gradient(135deg, #ec4899, #be185d)',
              '&:hover': { background: 'linear-gradient(135deg, #f472b6, #db2777)' },
              '&.Mui-disabled': { background: '#e5e7eb', color: '#9ca3af' },
            }}>
            {manualSubmitting ? '提交中...' : '确认补录'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

// ---------- 佣金偏差子页面 (内联) ----------
const POS_COLOR = '#C62828';
const NEG_COLOR = '#2E7D32';

// 按显示精度（两位小数）判定正负，避免极小尾差被误判为非零
function round2num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

function signColor(n) {
  if (!Number.isFinite(n) || n === 0) return 'text.secondary';
  return n > 0 ? POS_COLOR : NEG_COLOR;
}

// 负数前置 -，货币符号统一放在数值前：-¥1,234.00 / ¥1,234.00
function signedMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  const body = fmtMoney(Math.abs(n));
  return n < 0 ? `-¥${body}` : `¥${body}`;
}

function CommissionDeviations() {
  const { t } = useFieldLabels();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortField, setSortField] = useState('diff_amount');
  const [sortDir, setSortDir] = useState('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const { data } = await api.get('/commission/deviations', { params: { page, limit: pageSize, sort: sortField, order: sortDir } });
      if (seq !== loadSeq.current) return;
      setItems(data.items || []);
      setTotal(data.total || 0);
      setError('');
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(errorMessage(err, '加载失败'));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [page, pageSize, sortField, sortDir]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setPage(1);
  };

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card>
      <Box sx={{ height: 4, borderRadius: '10px 10px 0 0', background: 'linear-gradient(90deg,#2E7D32,#C62828)' }} />
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <Box sx={{ width: 4, height: 22, borderRadius: 2, background: 'linear-gradient(180deg,#2E7D32,#C62828)' }} />
          <Typography variant="h6" sx={{ fontWeight: 800 }}>全部偏差明细</Typography>
          <Chip size="small" variant="outlined" label={`共 ${total} 条`} sx={{ fontWeight: 700 }} />
          {total > 0 && (
            <Chip size="small" color="warning" variant="outlined" icon={<WarningAmberIcon />} label="默认按偏差降序" sx={{ fontWeight: 700 }} />
          )}
        </Stack>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
          <Chip size="small" sx={{ bgcolor: 'rgba(198,40,40,0.12)', color: POS_COLOR, fontWeight: 700, border: '1px solid rgba(198,40,40,0.35)' }} label="正偏差 · 实际高于期望" />
          <Chip size="small" sx={{ bgcolor: 'rgba(46,125,50,0.12)', color: NEG_COLOR, fontWeight: 700, border: '1px solid rgba(46,125,50,0.35)' }} label="负偏差 · 实际低于期望" />
          <Chip size="small" variant="outlined" sx={{ fontWeight: 700, color: 'text.secondary' }} label="偏差为 0 · 无高亮" />
        </Stack>
        {error && <Box sx={{ color: 'error.main', typography: 'body2', mb: 1.5 }}>{error}</Box>}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : items.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            暂无佣金偏差记录
          </Typography>
        ) : (
          <>
            <Table size="small" sx={{ '& .MuiTableCell-head': { position: 'sticky', top: 0, zIndex: 1 } }}>
              <TableHead>
                <TableRow sx={{ '& th': { bgcolor: 'action.hover', fontWeight: 700, whiteSpace: 'nowrap', borderBottom: '2px solid', borderColor: 'divider' } }}>
                  <TableCell>商机号</TableCell>
                  <TableCell>{t('end_customer')}</TableCell>
                  <TableCell align="center" sx={{ width: 76 }}>项目类型</TableCell>
                  <TableCell>项目名称</TableCell>
                  <TableCell align="right">订单金额</TableCell>
                  <TableCell align="right">佣金（期望 / 实际）</TableCell>
                  <TableCell align="right">
                    <TableSortLabel
                      active={sortField === 'diff_amount'}
                      direction={sortField === 'diff_amount' ? sortDir : 'asc'}
                      onClick={() => handleSort('diff_amount')}
                    >
                      偏差金额
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="right">
                    <TableSortLabel
                      active={sortField === 'diff_ratio'}
                      direction={sortField === 'diff_ratio' ? sortDir : 'asc'}
                      onClick={() => handleSort('diff_ratio')}
                    >
                      偏差比例
                    </TableSortLabel>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
               {items.map((item) => {
                  const diffRound = round2num(item.diff_amount);
                  return (
                  <TableRow
                    key={item.id}
                    hover
                    onClick={() => navigate(`/orders/${item.id}`)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell sx={{ fontWeight: 700, color: 'primary.main', whiteSpace: 'nowrap' }}>{item.order_id}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.end_customer_name || '未分配客户'}
                    </TableCell>
                    <TableCell align="center">
                      {item.order_type ? (
                        <Chip
                          size="small"
                          label={item.order_type}
                          sx={{
                            height: 22,
                            minWidth: 32,
                            borderRadius: 1.5,
                            fontWeight: 800,
                            fontSize: 12,
                            color: { A: '#1976D2', B: '#2E7D32', C: '#C9A227' }[item.order_type] || 'text.secondary',
                            bgcolor: ({ A: '#1976D2', B: '#2E7D32', C: '#C9A227' }[item.order_type] || '#78909C') + '1F',
                            border: '1px solid ' + ({ A: '#1976D2', B: '#2E7D32', C: '#C9A227' }[item.order_type] || '#78909C') + '66'
                          }}
                        />
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.project_name || '-'}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{fmtMoney(item.total_amount)}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <Stack spacing={0.25} alignItems="flex-end">
                        <Typography variant="caption" sx={{ fontSize: 11, lineHeight: 1.2, color: signColor(diffRound), fontWeight: 700 }}>
                          期望 {signedMoney(item.expected_commission)}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 800, fontSize: 13, lineHeight: 1.3, color: signColor(diffRound) }}>
                          实际 {signedMoney(item.commission_amount)}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        whiteSpace: 'nowrap',
                        fontWeight: 900,
                        fontSize: 14,
                        color: signColor(diffRound),
                        letterSpacing: 0.3,
                      }}
                    >
                      {fmtSignedMoney(item.diff_amount)}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <Typography variant="body2" sx={{ fontWeight: 800, fontSize: 13, color: signColor(diffRound) }}>
                        {item.diff_ratio != null ? fmtSignedPercent(item.diff_ratio) : '-'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" spacing={1.5} sx={{ mt: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                共 {total} 条，第 {page} / {Math.max(1, Math.ceil(total / pageSize))} 页
              </Typography>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="caption" color="text.secondary">每页</Typography>
                <Select
                  size="small"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  sx={{ minWidth: 76, '& .MuiSelect-select': { py: 0.75, fontSize: 13 } }}
                >
                  {[10, 20, 50, 100].map((n) => (
                    <MenuItem key={n} value={n}>
                      {n} 条
                    </MenuItem>
                  ))}
                </Select>
                <Pagination
                  size="small"
                  count={Math.max(1, Math.ceil(total / pageSize))}
                  page={page}
                  onChange={(_, value) => setPage(value)}
                  color="primary"
                />
              </Stack>
            </Stack>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function OverviewStat({ label, value, accent, icon, sub, highlight = false }) {
  return (
      <Card
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 124,
          overflow: 'hidden',
          borderRadius: 2,
        border: '1px solid',
        borderColor: highlight ? 'rgba(0,105,92,0.35)' : 'divider',
        bgcolor: 'background.paper',
        boxShadow: 'none',
        transition: 'box-shadow 0.2s ease',
        '&:hover': { boxShadow: '0 5px 16px rgba(15,23,42,0.10)' }
      }}
    >
      <Box sx={{ height: 4, bgcolor: accent }} />
      <CardContent sx={{ flex: 1, p: 2.25, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.5}>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="overline"
              sx={{
                color: 'text.secondary',
                fontWeight: 700,
                lineHeight: 1.4
              }}
            >
              {label}
            </Typography>
            <Typography
              variant={highlight ? 'h5' : 'h6'}
              sx={{
                mt: 0.5,
                fontWeight: 800,
                color: accent,
                whiteSpace: 'nowrap',
                lineHeight: 1.25
              }}
            >
              {value}
            </Typography>
            {sub && (
              <Typography
                variant="caption"
                sx={{
                  mt: 0.75,
                  display: 'block',
                  fontWeight: 700,
                  color: 'text.secondary',
                  whiteSpace: 'nowrap',
                  lineHeight: 1.2
                }}
              >
                {sub}
              </Typography>
            )}
          </Box>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 1.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: `${accent}18`,
              color: accent,
              flexShrink: 0
            }}
          >
            {icon}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function YearCommissionChart({ data }) {
  const rows = (data || []).map((row) => ({
    year: String(row.year || ''),
    amount: Number(row.amount) || 0,
    count: Number(row.count) || 0
  }));
  if (rows.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 240, color: 'text.secondary' }}>
        暂无数据
      </Box>
    );
  }

  const W = 560;
  const H = 260;
  const PL = 84;
  const PR = 18;
  const PT = 30;
  const PB = 44;
  const innerW = W - PL - PR;
  const innerH = H - PT - PB;
  const axisMax = niceAxisMax(Math.max(...rows.map((row) => row.amount), 1));
  const xFor = (index) => (rows.length === 1 ? PL + innerW / 2 : PL + (innerW * index) / (rows.length - 1));
  const yFor = (amount) => PT + innerH * (1 - amount / axisMax);
  const pts = rows.map((row, index) => ({ ...row, x: xFor(index), y: yFor(row.amount) }));
  const baseline = PT + innerH;
  const line = smoothLinePath(pts);
  const area = `${line} L ${pts[pts.length - 1].x} ${baseline} L ${pts[0].x} ${baseline} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => axisMax * ratio);

  return (
    <Box sx={{ width: '100%', overflow: 'hidden' }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="按年份佣金曲线图" style={{ display: 'block', width: '100%', height: 'auto' }}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PL}
              x2={W - PR}
              y1={yFor(tick)}
              y2={yFor(tick)}
              stroke="rgba(120, 144, 156, 0.25)"
              strokeDasharray="4 4"
            />
            <text x={PL - 10} y={yFor(tick) + 4} textAnchor="end" fontSize={11} fill="#78909C">
              {fmtMoney(tick)}
            </text>
          </g>
        ))}
        <path d={area} fill="rgba(25, 118, 210, 0.08)" />
        <path d={line} fill="none" stroke="#1976D2" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((point) => (
          <g key={point.year}>
            <circle cx={point.x} cy={point.y} r={4.5} fill="#FFFFFF" stroke="#1976D2" strokeWidth={2.5}>
              <title>{`${point.year}年 · ${point.count}个商机 · 佣金 ${fmtMoney(point.amount)} 元`}</title>
            </circle>
            <text x={point.x} y={point.y - 12} textAnchor="middle" fontSize={11} fontWeight={700} fill="#37474F">
              {fmtMoney(point.amount)}
            </text>
          </g>
        ))}
        {pts.map((point) => (
          <text key={`${point.year}-axis`} x={point.x} y={H - PB + 24} textAnchor="middle" fontSize={13} fontWeight={700} fill="#546E7A">
            {point.year}年
          </text>
        ))}
      </svg>
    </Box>
  );
}

function CommissionOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: result } = await api.get('/commission/overview');
      setData(result);
      setError('');
    } catch (err) {
      setError(errorMessage(err, '加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summary = data?.summary || {};
  const cards = [
    { label: '已结算佣金总额', value: `¥ ${fmtMoney(summary.matchedAmount)}`, accent: '#00897B', icon: <PaymentsIcon />, highlight: true },
    { label: '已匹配商机', value: summary.matchedCount ?? 0, accent: '#2E7D32', icon: <CheckIcon /> },
    { label: '待结算商机', value: summary.waitingCount ?? 0, accent: '#F57C00', icon: <InboxIcon /> },
    { label: '待结算预计佣金', value: `¥ ${fmtMoney(summary.waitingExpected)}`, accent: '#C9A227', icon: <ScheduleIcon /> },
    { label: '佣金偏差商机', value: summary.deviationCount ?? 0, accent: '#C62828', icon: <WarningAmberIcon /> },
    {
      label: '正 / 负偏差金额',
      value: fmtSignedMoney(summary.positiveDeviationAmount),
      accent: '#D32F2F',
      icon: <WarningAmberIcon />,
      sub: `负偏差 ${fmtSignedMoney(summary.negativeDeviationAmount)}`
    }
  ];
  const tableHeadSx = (theme) => {
    const tk = tableHeadTokens[theme.palette.mode];
    return { bgcolor: tk.bg, color: tk.color, fontWeight: 800, borderBottom: '2px solid', borderColor: tk.border };
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (error) {
    return <Alert severity="error" onClose={() => setError('')} sx={{ borderRadius: 1.5 }}>{error}</Alert>;
  }
  if (!data) return null;

  return (
    <Stack spacing={2}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
          gap: 2
        }}
      >
        {cards.map((card) => (
          <OverviewStat key={card.label} {...card} />
        ))}
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gap: 2,
          alignItems: 'stretch'
        }}
      >
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                <Box sx={{ width: 4, height: 22, borderRadius: 2, bgcolor: 'primary.main' }} />
                <Typography variant="h6" sx={{ fontWeight: 800 }}>按年份佣金</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>单位：元</Typography>
              </Stack>
              <YearCommissionChart data={data.byYear || []} />
            </CardContent>
          </Card>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                <Box sx={{ width: 4, height: 22, borderRadius: 2, bgcolor: 'success.main' }} />
                <Typography variant="h6" sx={{ fontWeight: 800 }}>客户佣金 Top 8</Typography>
              </Stack>
              <Table size="small" sx={(theme) => ({ '& .MuiTableCell-head': tableHeadSx(theme) })}>
                <TableHead>
                  <TableRow>
                    <TableCell>客户</TableCell>
                    <TableCell align="right">商机数</TableCell>
                    <TableCell align="right">佣金金额</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(data.byCustomer || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} align="center" sx={{ py: 2.5, color: 'text.secondary' }}>暂无数据</TableCell>
                    </TableRow>
                  ) : (
                    (data.byCustomer || []).map((row) => (
                      <TableRow key={row.customer_name} hover>
                        <TableCell sx={{ fontWeight: 600 }}>{row.customer_name}</TableCell>
                        <TableCell align="right">{row.count}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>¥ {fmtMoney(row.amount)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
      </Box>

      <Card sx={{ borderRadius: 2 }}>
        <CardContent>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
            <Box sx={{ width: 4, height: 22, borderRadius: 2, bgcolor: '#C9A227' }} />
            <Typography variant="h6" sx={{ fontWeight: 800 }}>最近结算记录</Typography>
            <Chip size="small" label="最近 10 条" variant="outlined" sx={{ ml: 'auto', fontWeight: 700 }} />
          </Stack>
          <Box sx={{ overflow: 'auto' }}>
            <Table size="small" sx={(theme) => ({ minWidth: 760, '& .MuiTableCell-head': tableHeadSx(theme) })}>
              <TableHead>
                <TableRow>
                  <TableCell>商机编号</TableCell>
                  <TableCell>项目名称</TableCell>
                  <TableCell>最终客户</TableCell>
                  <TableCell align="right">订单金额</TableCell>
                  <TableCell align="right">佣金金额</TableCell>
                  <TableCell align="right">预期金额</TableCell>
                  <TableCell align="right">差异</TableCell>
                  <TableCell>结算时间</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.recent || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 3, color: 'text.secondary' }}>暂无结算记录</TableCell>
                  </TableRow>
                ) : (
                  (data.recent || []).map((row) => (
                    <TableRow key={row.id} hover>
                      <TableCell sx={{ fontWeight: 800, color: 'primary.main', whiteSpace: 'nowrap' }}>{row.order_id}</TableCell>
                      <TableCell sx={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.project_name || '-'}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.end_customer_name || '-'}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>¥ {fmtMoney(row.total_amount)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>¥ {fmtMoney(row.commission_amount)}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>¥ {fmtMoney(row.expected_commission)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800, whiteSpace: 'nowrap', color: signColor(round2num(row.diff_amount)) }}>
                        {fmtSignedMoney(row.diff_amount)}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDateTime(row.commission_date)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}

export { CommissionDeviations, CommissionOverview };
