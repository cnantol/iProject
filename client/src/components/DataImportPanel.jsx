import { useCallback, useEffect, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import InboxIcon from '@mui/icons-material/Inbox';
import RestoreIcon from '@mui/icons-material/Restore';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import api, { errorMessage } from '../api';
import { useConfirm } from './ConfirmDialog';
import { IMPORT_TARGET_LABELS } from '../utils/constants';
import { fmtDateTime } from '../utils/helpers';
import { downloadFile } from '../utils/download';

const IMPORT_TARGETS = ['end_customer', 'contract_customer', 'material', 'guide_price', 'history'];
const IMPORT_TARGET_META = {
  end_customer: { color: '#1976D2', desc: '导入最终客户基础档案' },
  contract_customer: { color: '#00ACC1', desc: '导入合同客户基础档案' },
  material: { color: '#2E7D32', desc: '导入框架协议价格与有效期' },
  guide_price: { color: '#F57C00', desc: '导入系统指导价格' },
  history: { color: '#7B1FA2', desc: '导入历史商机与闭环数据' }
};

export default function DataImportPanel() {
  const confirm = useConfirm();
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [logs, setLogs] = useState([]);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progress, setProgress] = useState(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [importMeta, setImportMeta] = useState(null);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [mappingParsing, setMappingParsing] = useState(false);
  const [mappingTarget, setMappingTarget] = useState('');
  const [mappingFile, setMappingFile] = useState(null);
  const [mappingColumns, setMappingColumns] = useState([]);
  const [mappingValues, setMappingValues] = useState({});
  const [undoSuccess, setUndoSuccess] = useState('');
  const [clearing, setClearing] = useState(false);
  const pollRef = useRef(null);

  const loadLogs = useCallback(async () => {
    try {
      const { data } = await api.get('/settings/import-logs');
      setLogs(data.items || []);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  const loadImportMeta = useCallback(async () => {
    try {
      const { data } = await api.get('/settings/import-meta');
      setImportMeta(data);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    loadLogs();
    loadImportMeta();
  }, [loadLogs, loadImportMeta]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const normalizeColumn = (value) => String(value == null ? '' : value).trim().toLowerCase().replace(/\s+/g, '');

  const buildAutoMapping = (standardFields, columns) => {
    const values = {};
    for (const field of standardFields) {
      const normalized = normalizeColumn(field);
      values[field] = columns.find((column) => normalizeColumn(column) === normalized) || null;
    }
    return values;
  };

  const openMapping = async (target, file) => {
    setMappingOpen(true);
    setMappingParsing(true);
    setMappingTarget(target);
    setMappingFile(file);
    setMappingColumns([]);
    setMappingValues({});
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const firstRow = sheet ? XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true })[0] : [];
      const columns = (Array.isArray(firstRow) ? firstRow : [])
        .filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
        .map((value) => String(value).trim());
      if (columns.length === 0) {
        setError('未识别到表头列名，请检查 Excel 文件首行');
        setMappingOpen(false);
        return;
      }
      const meta = importMeta?.items?.find((item) => item.key === target);
      const standardFields = meta?.headers || [];
      setMappingColumns(columns);
      setMappingValues(buildAutoMapping(standardFields, columns));
    } catch {
      setError('Excel 文件解析失败，请确认文件格式正确');
      setMappingOpen(false);
    } finally {
      setMappingParsing(false);
    }
  };

  const startImport = async () => {
    const meta = importMeta?.items?.find((item) => item.key === mappingTarget);
    const missing = (meta?.required || []).filter((field) => !mappingValues[field]);
    if (missing.length > 0) {
      setError(`以下必填字段尚未选择对应列：${missing.join('、')}`);
      return;
    }
    setMappingOpen(false);
    const formData = new FormData();
    formData.append('file', mappingFile);
    formData.append('mapping', JSON.stringify(mappingValues));
    setResult(null);
    setProgress({ target: mappingTarget, fileName: mappingFile?.name || '', total: 0, processed: 0, success: 0, fail: 0, status: 'processing', error: '' });
    setProgressOpen(true);
    try {
      const { data } = await api.post(`/settings/import/${mappingTarget}`, formData, { timeout: 0 });
      const poll = async () => {
        try {
          const { data: p } = await api.get(`/settings/import-progress/${data.task_id}`);
          setProgress({
            target: data.target || mappingTarget,
            fileName: data.file_name || mappingFile?.name || '',
            total: p.total_rows || 0,
            processed: p.processed_rows || 0,
            success: p.success_rows || 0,
            fail: p.fail_rows || 0,
            status: p.status,
            error: p.error || ''
          });
          if (p.status === 'done' || p.status === 'error') {
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            setProgressOpen(false);
            setResult({
              target: data.target || mappingTarget,
              file_name: data.file_name || mappingFile?.name || '',
              total_rows: p.total_rows || 0,
              success_rows: p.success_rows || 0,
              fail_rows: p.fail_rows || 0,
              failures: p.failures || [],
              error: p.error || ''
            });
            setResultOpen(true);
            loadLogs();
          }
        } catch (err) {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          setProgressOpen(false);
          setError(errorMessage(err));
        }
      };
      pollRef.current = setInterval(poll, 800);
      poll();
    } catch (err) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      setProgressOpen(false);
      setError(errorMessage(err));
    }
  };

  const upload = (target, event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    openMapping(target, file);
  };

  const openDownload = async (path) => {
    try {
      await downloadFile(path);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const undoImport = async (row) => {
    if (!await confirm(`确认撤回本次「${IMPORT_TARGET_LABELS[row.target_type] || row.target_type}」导入？撤回后将删除本次导入的 ${row.success_rows} 条数据。`)) return;
    setUndoSuccess('');
    try {
      const { data } = await api.post(`/settings/import/${row.id}/undo`);
      const skippedText = data.skipped && data.skipped.length > 0 ? `，跳过 ${data.skipped.length} 条被引用数据` : '';
      setUndoSuccess(`撤回成功：${Array.isArray(data.deleted) ? `${data.deleted.length} 条数据` : data.deleted}${skippedText}`);
      loadLogs();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const clearImports = async () => {
    if (!await confirm('确认清空全部导入历史？此操作不可撤销，仅清除记录，不影响已导入数据。')) return;
    setClearing(true);
    try {
      await api.delete('/settings/import-logs');
      setLogs([]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setClearing(false);
    }
  };

  return (
    <Box>
      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 1.5 }}>{error}</Alert>}
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 0.5 }}>
        <Box
          sx={{
            width: 38,
            height: 38,
            borderRadius: 1.5,
            background: 'linear-gradient(135deg, #1976D2 0%, #42A5F5 100%)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(25,118,210,0.28)'
          }}
        >
          <CloudUploadIcon fontSize="small" />
        </Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>数据导入</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        按标准模板批量导入基础档案与历史商机
      </Typography>
      <Stack spacing={1.5} sx={{ mb: 2.5 }}>
        {IMPORT_TARGETS.map((target) => (
          <Box
            key={target}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              p: 1.5,
              flexWrap: { xs: 'wrap', md: 'nowrap' },
              borderRadius: 2,
              border: 1,
              borderColor: 'divider',
              bgcolor: 'background.paper'
            }}
          >
            <Box
              sx={{
                width: 42,
                height: 42,
                borderRadius: 1.5,
                bgcolor: `${IMPORT_TARGET_META[target].color}18`,
                color: IMPORT_TARGET_META[target].color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <CloudUploadIcon fontSize="small" />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{IMPORT_TARGET_LABELS[target]}</Typography>
              <Typography variant="caption" color="text.secondary">{IMPORT_TARGET_META[target].desc}</Typography>
            </Box>
            <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
              <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={() => openDownload(`/api/settings/import/${target}/template`)}>
                下载模板
              </Button>
              <Button size="small" variant="contained" component="label" startIcon={<UploadFileIcon />}>
                上传导入
                <input type="file" hidden accept=".xlsx,.xls" onChange={(e) => upload(target, e)} />
              </Button>
            </Stack>
          </Box>
        ))}
      </Stack>

      <Dialog open={mappingOpen} maxWidth="md" fullWidth onClose={() => setMappingOpen(false)}>
        <DialogTitle sx={{ pb: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>列名映射</Typography>
          <Typography variant="caption" color="text.secondary">
            {mappingTarget ? IMPORT_TARGET_LABELS[mappingTarget] : ''} · {mappingFile?.name || ''}
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Alert severity="info" sx={{ borderRadius: 1.5 }}>
              请为每个字段选择 Excel 中对应的列名，带 <strong>*</strong> 的字段必须映射
            </Alert>
            {mappingParsing ? (
              <Stack spacing={1}>
                <LinearProgress />
                <Typography variant="body2" color="text.secondary">正在解析 Excel 表头...</Typography>
              </Stack>
            ) : (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                {(importMeta?.items?.find((item) => item.key === mappingTarget)?.headers || []).map((field) => {
                  const requiredFields = importMeta?.items?.find((item) => item.key === mappingTarget)?.required || [];
                  const isRequired = requiredFields.includes(field);
                  return (
                    <Box key={field} sx={{ p: 1.25, borderRadius: 1.5, border: 1, borderColor: isRequired && !mappingValues[field] ? 'warning.main' : 'divider' }}>
                      <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.75 }}>
                        {field}
                        {isRequired && <Box component="span" sx={{ color: 'error.main' }}> *</Box>}
                      </Typography>
                      <Select
                        size="small"
                        fullWidth
                        value={mappingValues[field] || ''}
                        onChange={(e) => setMappingValues((prev) => ({ ...prev, [field]: e.target.value || null }))}
                      >
                        <MenuItem value=""><em>不导入</em></MenuItem>
                        {mappingColumns.map((column, index) => (
                          <MenuItem key={`${column}-${index}`} value={column}>{column}</MenuItem>
                        ))}
                      </Select>
                    </Box>
                  );
                })}
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setMappingOpen(false)}>取消</Button>
          <Button variant="contained" startIcon={<UploadFileIcon />} disabled={mappingParsing} onClick={startImport}>开始导入</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={progressOpen} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            正在导入{progress?.target ? IMPORT_TARGET_LABELS[progress.target] : ''}
          </Typography>
          <Typography variant="caption" color="text.secondary">{progress?.fileName || ''}</Typography>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <LinearProgress
              variant={progress?.total ? 'determinate' : 'indeterminate'}
              value={progress?.total ? Math.min(100, Math.round((progress.processed / progress.total) * 100)) : 0}
              sx={{ height: 8, borderRadius: 4 }}
            />
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip size="small" variant="outlined" label={`已处理 ${progress?.processed || 0} / ${progress?.total || '...'} 行`} />
              <Chip size="small" variant="outlined" label={`成功 ${progress?.success || 0}`} color="success" />
              <Chip size="small" variant="outlined" label={`失败 ${progress?.fail || 0}`} color={progress?.fail ? 'error' : 'default'} />
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>

      <Dialog open={resultOpen} maxWidth="sm" fullWidth onClose={() => setResultOpen(false)}>
        <DialogTitle sx={{ pb: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            {result?.target ? IMPORT_TARGET_LABELS[result.target] : '数据导入'} 完成
          </Typography>
          <Typography variant="caption" color="text.secondary">{result?.file_name || ''}</Typography>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            {result?.error ? (
              <Alert severity="error" sx={{ borderRadius: 1.5 }}>导入过程中发生错误：{result.error}</Alert>
            ) : (
              <Alert severity={result?.fail_rows > 0 ? 'warning' : 'success'} sx={{ borderRadius: 1.5 }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>共 {result?.total_rows || 0} 行</Typography>
                  <Chip size="small" variant="outlined" label={`成功 ${result?.success_rows || 0} 行`} color="success" />
                  <Chip size="small" variant="outlined" label={`失败 ${result?.fail_rows || 0} 行`} color={result?.fail_rows > 0 ? 'error' : 'default'} />
                </Stack>
              </Alert>
            )}
            {result?.failures?.length > 0 && (
              <Box sx={{ maxHeight: 240, overflow: 'auto', borderRadius: 1.5, bgcolor: 'action.hover', p: 1 }}>
                {result.failures.map((failure, index) => (
                  <Typography key={index} variant="body2" sx={{ py: 0.5, px: 1, lineHeight: 1.6 }}>
                    <strong>第 {failure.row} 行：</strong>{failure.reason}
                  </Typography>
                ))}
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="contained" onClick={() => setResultOpen(false)}>我知道了</Button>
        </DialogActions>
      </Dialog>

      {undoSuccess && <Alert severity="success" sx={{ mt: 2, borderRadius: 1.5 }}>{undoSuccess}</Alert>}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 3, mb: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>导入历史</Typography>
          <Chip size="small" label={`${logs.length} 条`} />
        </Stack>
        {logs.length > 0 && (
          <Button size="small" variant="outlined" color="error" startIcon={<DeleteIcon />} disabled={clearing} onClick={clearImports}>
            {clearing ? '清空中...' : '清空全部'}
          </Button>
        )}
      </Stack>
      <Box sx={{ borderRadius: 1.5, border: 1, borderColor: 'divider', overflow: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ '& th': { bgcolor: 'action.hover', fontWeight: 800, whiteSpace: 'nowrap' } }}>
              <TableCell>时间</TableCell>
              <TableCell>目标</TableCell>
              <TableCell>文件名</TableCell>
              <TableCell align="right">成功</TableCell>
              <TableCell align="right">失败</TableCell>
              <TableCell align="right">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {logs.map((row) => (
              <TableRow key={row.id} hover>
                <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{fmtDateTime(row.created_at)}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{IMPORT_TARGET_LABELS[row.target_type] || row.target_type}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{row.file_name}</TableCell>
                <TableCell align="right">
                  <Chip size="small" variant="outlined" label={row.success_rows} color={Number(row.success_rows) > 0 ? 'success' : 'default'} />
                </TableCell>
                <TableCell align="right">
                  <Chip size="small" variant="outlined" label={row.fail_rows} color={Number(row.fail_rows) > 0 ? 'error' : 'default'} />
                </TableCell>
                <TableCell align="right">
                  {Number(row.revoked) === 1 ? (
                    <Chip size="small" variant="outlined" label="已撤回" color="default" />
                  ) : !row.detail ? (
                    <Chip size="small" variant="outlined" label="历史记录不可撤回" color="default" />
                  ) : (
                    <Button size="small" variant="outlined" color="error" startIcon={<RestoreIcon />} onClick={() => undoImport(row)}>撤回</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {logs.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} sx={{ border: 'none', p: 4 }}>
                  <Stack spacing={1} alignItems="center">
                    <InboxIcon sx={{ fontSize: 44, color: 'text.disabled' }} />
                    <Typography variant="body2" color="text.secondary">暂无导入记录</Typography>
                  </Stack>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}
