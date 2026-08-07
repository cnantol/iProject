import { useCallback, useEffect, useState } from 'react';
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
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import Grid from '@mui/material/Grid';
import InputLabel from '@mui/material/InputLabel';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CheckIcon from '@mui/icons-material/Check';
import PaymentsIcon from '@mui/icons-material/Payments';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import api, { errorMessage } from '../api';
import { fmtDateTime, fmtMoney } from '../utils/helpers';
import { useFieldLabels } from '../utils/fieldLabels';

export default function CommissionPage() {
  const { t } = useFieldLabels();
  const [waiting, setWaiting] = useState([]);
  const [imports, setImports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [soColumn, setSoColumn] = useState('');
  const [amountColumn, setAmountColumn] = useState('');
  const [manualTarget, setManualTarget] = useState(null);
  const [manualAmount, setManualAmount] = useState('');
  const [manualRemark, setManualRemark] = useState('');
  const [manualError, setManualError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [waitRes, importRes] = await Promise.all([api.get('/commission/waiting'), api.get('/commission/imports')]);
      setWaiting(waitRes.data.items || []);
      setImports(importRes.data.items || []);
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

  const pickFile = async (event) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setResult(null);
    try {
      const XLSX = await import('xlsx');
      const data = await selected.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: null });
      const headerRow = rows[0] || [];
      setHeaders(headerRow.map((cell) => String(cell ?? '').trim()).filter(Boolean));
      setSoColumn(headerRow[0] != null ? String(headerRow[0]).trim() : '');
      setAmountColumn(headerRow[1] != null ? String(headerRow[1]).trim() : '');
    } catch {
      setError('无法解析 Excel 表头');
    }
  };

  const upload = async () => {
    if (!file) {
      setError('请先选择佣金 Excel 文件');
      return;
    }
    if (!soColumn || !amountColumn) {
      setError('请选择 SO 号列与佣金金额列');
      return;
    }
    setError('');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('soColumn', soColumn);
    formData.append('amountColumn', amountColumn);
    try {
      const { data } = await api.post('/commission/upload', formData);
      setResult(data);
      setFile(null);
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const manual = async () => {
    if (manualAmount.trim() === '' || !Number.isFinite(Number(manualAmount)) || Number(manualAmount) < 0) {
      setManualError('补录金额不能小于 0');
      return;
    }
    setManualError('');
    try {
      await api.post('/commission/manual', { order_id: manualTarget.id, amount: Number(manualAmount), remark: manualRemark });
      setManualTarget(null);
      setManualAmount('');
      setManualRemark('');
      setManualError('');
      load();
    } catch (err) {
      setManualError(errorMessage(err));
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
      {error && <Alert severity="error">{error}</Alert>}

      <Card>
        <Box sx={{ height: 4, borderRadius: '10px 10px 0 0', bgcolor: 'secondary.main' }} />
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
            <Box sx={{ width: 4, height: 22, borderRadius: 2, bgcolor: 'secondary.main' }} />
            <Typography variant="h6">佣金 Excel 全局匹配</Typography>
          </Stack>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={3}>
              <Box
                component="label"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  border: '1.5px dashed',
                  borderColor: file ? 'success.main' : 'secondary.main',
                  borderRadius: 2.5,
                  px: 2,
                  py: 1.75,
                  cursor: 'pointer',
                  bgcolor: file ? 'rgba(30,122,70,0.06)' : 'rgba(0,147,190,0.06)',
                  width: '100%',
                  minWidth: 0
                }}
              >
                <UploadFileIcon color={file ? 'success' : 'secondary'} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {file ? file.name : '选择佣金 Excel'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    支持 .xlsx / .xls
                  </Typography>
                </Box>
                <input type="file" hidden accept=".xlsx,.xls" onChange={pickFile} />
              </Box>
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>SO 号列</InputLabel>
                <Select value={soColumn} label="SO 号列" onChange={(e) => setSoColumn(e.target.value)}>
                  {headers.map((header) => (
                    <MenuItem key={header} value={header}>
                      {header}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>佣金金额列（必选）</InputLabel>
                <Select value={amountColumn} label="佣金金额列（必选）" onChange={(e) => setAmountColumn(e.target.value)}>
                  {headers.map((header) => (
                    <MenuItem key={header} value={header}>
                      {header}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <Button variant="contained" onClick={upload} sx={{ width: '100%' }}>
                上传并匹配
              </Button>
            </Grid>
          </Grid>
          {result && (
            <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
              <Chip label={`匹配成功 ${result.matched}`} color="success" variant="outlined" sx={{ fontWeight: 700 }} />
              <Chip label={`未匹配 ${result.unmatched}`} variant="outlined" sx={{ fontWeight: 700 }} />
              <Chip label={`失败行 ${result.fail_rows}`} color="error" variant="outlined" sx={{ fontWeight: 700 }} />
              <Chip label={`重复 SO ${result.duplicate_so_count}`} color="warning" variant="outlined" sx={{ fontWeight: 700 }} />
              <Chip label={`多余 SO ${result.extra_so_count}`} color="info" variant="outlined" sx={{ fontWeight: 700 }} />
              <Chip label={`已闭环跳过 ${result.skipped_matched_count}`} variant="outlined" sx={{ fontWeight: 700 }} />
            </Stack>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
            <Box sx={{ width: 4, height: 22, borderRadius: 2, bgcolor: 'primary.main' }} />
            <Typography variant="h6">等待下次匹配清单</Typography>
          </Stack>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('order_id')}</TableCell>
                  <TableCell>{t('project_name')}</TableCell>
                  <TableCell>{t('sales_order')}</TableCell>
                  <TableCell>{t('end_customer')}</TableCell>
                  <TableCell sx={{ width: 120 }}>操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {waiting.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary' }}>
                      暂无等待匹配的销售机会
                    </TableCell>
                  </TableRow>
                )}
                {waiting.map((order) => (
                  <TableRow key={order.id} hover>
                    <TableCell sx={{ fontWeight: 700, color: 'primary.main', whiteSpace: 'nowrap' }}>{order.order_id}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{order.project_name || '-'}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{order.sales_order || '-'}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{order.end_customer_name || '-'}</TableCell>
                    <TableCell>
                      <Button size="small" variant="outlined" color="warning" onClick={() => setManualTarget(order)}>
                        人工补录
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
            <Box sx={{ width: 4, height: 22, borderRadius: 2, bgcolor: 'primary.main' }} />
            <Typography variant="h6">匹配历史</Typography>
          </Stack>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>时间</TableCell>
                <TableCell>文件名</TableCell>
                <TableCell align="right">总行数</TableCell>
                <TableCell align="right">成功</TableCell>
                <TableCell align="right">失败</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {imports.map((row) => (
                <TableRow key={row.id}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDateTime(row.created_at)}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.file_name}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{row.total_rows}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{row.success_rows}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{row.fail_rows}</TableCell>
                </TableRow>
              ))}
              {imports.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary' }}>
                    暂无导入记录
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(manualTarget)} onClose={() => { setManualTarget(null); setManualError(''); }} maxWidth="sm" fullWidth>
        <Box sx={{ height: 4, bgcolor: 'warning.main' }} />
        <DialogTitle sx={{ pb: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1.2}>
            <Box sx={{ width: 38, height: 38, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(237,108,2,0.12)', color: 'warning.main' }}>
              <PaymentsIcon fontSize="small" />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.25 }}>人工补录佣金</Typography>
              <Typography variant="caption" color="text.secondary">仅用于特殊业务场景，提交后该机会将进入闭环</Typography>
            </Box>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            {manualError && <Alert severity="error">{manualError}</Alert>}
            <Box sx={{ p: 1.6, borderRadius: 2, bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider' }}>
              <Stack spacing={0.6}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{manualTarget?.order_id || '-'}</Typography>
                <Typography variant="body2" color="text.secondary">项目：{manualTarget?.project_name || '-'}</Typography>
                <Typography variant="body2" color="text.secondary">最终客户：{manualTarget?.end_customer_name || '-'}</Typography>
                {Number(manualTarget?.total_amount) > 0 && (
                  <Typography variant="body2" color="text.secondary">订单金额：¥ {fmtMoney(manualTarget.total_amount)}</Typography>
                )}
              </Stack>
            </Box>
            <TextField
              label="佣金金额（元）"
              type="number"
              value={manualAmount}
              onChange={(e) => setManualAmount(e.target.value)}
              fullWidth
              helperText="允许为 0，保存后该机会将关闭"
              InputProps={{ startAdornment: <InputAdornment position="start">¥</InputAdornment> }}
            />
            <TextField label="补录备注" multiline minRows={2} value={manualRemark} onChange={(e) => setManualRemark(e.target.value)} fullWidth helperText="选填，建议记录补录原因" />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="outlined" onClick={() => { setManualTarget(null); setManualError(''); }}>取消</Button>
          <Button variant="contained" color="warning" startIcon={<CheckIcon />} onClick={manual}>
            确认补录
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
