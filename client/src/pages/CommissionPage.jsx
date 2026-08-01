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
import UploadFileIcon from '@mui/icons-material/UploadFile';
import api, { errorMessage } from '../api';
import { fmtDateTime } from '../utils/helpers';

export default function CommissionPage() {
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
    if (!manualAmount || Number(manualAmount) <= 0) {
      setError('补录金额必须大于 0');
      return;
    }
    setError('');
    try {
      await api.post('/commission/manual', { order_id: manualTarget.id, amount: Number(manualAmount), remark: manualRemark });
      setManualTarget(null);
      setManualAmount('');
      setManualRemark('');
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h5">佣金结算</Typography>
      {error && <Alert severity="error">{error}</Alert>}

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1.5 }}>
            佣金 Excel 全局匹配
          </Typography>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={3}>
              <Button component="label" variant="outlined" startIcon={<UploadFileIcon />} sx={{ width: '100%' }}>
                选择 Excel
                <input type="file" hidden accept=".xlsx,.xls" onChange={pickFile} />
              </Button>
              {file && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  {file.name}
                </Typography>
              )}
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
              <Chip label={`匹配成功 ${result.matched}`} color="success" />
              <Chip label={`未匹配 ${result.unmatched}`} color="default" />
              <Chip label={`失败行 ${result.fail_rows}`} color="error" />
              <Chip label={`重复 SO ${result.duplicate_so_count}`} color="warning" />
              <Chip label={`多余 SO ${result.extra_so_count}`} color="info" />
              <Chip label={`已闭环跳过 ${result.skipped_matched_count}`} color="default" />
            </Stack>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1.5 }}>
            等待下次匹配清单
          </Typography>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>订单号</TableCell>
                  <TableCell>项目名称</TableCell>
                  <TableCell>Sales Order</TableCell>
                  <TableCell>最终客户</TableCell>
                  <TableCell>操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {waiting.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary' }}>
                      暂无等待匹配的订单
                    </TableCell>
                  </TableRow>
                )}
                {waiting.map((order) => (
                  <TableRow key={order.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{order.order_id}</TableCell>
                    <TableCell>{order.project_name || '-'}</TableCell>
                    <TableCell>{order.sales_order || '-'}</TableCell>
                    <TableCell>{order.end_customer_name || '-'}</TableCell>
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
          <Typography variant="h6" sx={{ mb: 1.5 }}>
            匹配历史
          </Typography>
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
                  <TableCell>{fmtDateTime(row.created_at)}</TableCell>
                  <TableCell>{row.file_name}</TableCell>
                  <TableCell align="right">{row.total_rows}</TableCell>
                  <TableCell align="right">{row.success_rows}</TableCell>
                  <TableCell align="right">{row.fail_rows}</TableCell>
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

      <Dialog open={Boolean(manualTarget)} onClose={() => setManualTarget(null)}>
        <DialogTitle>人工补录佣金</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1, minWidth: 360 }}>
            <TextField label="订单号" value={manualTarget?.order_id || ''} disabled />
            <TextField label="佣金金额（必填，>0）" type="number" value={manualAmount} onChange={(e) => setManualAmount(e.target.value)} fullWidth />
            <TextField label="补录备注" multiline minRows={2} value={manualRemark} onChange={(e) => setManualRemark(e.target.value)} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setManualTarget(null)}>取消</Button>
          <Button color="warning" onClick={manual}>
            确认补录
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
