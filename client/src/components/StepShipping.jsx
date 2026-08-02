import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import api, { errorMessage } from '../api';
import { fmtDate } from '../utils/helpers';
import StepWrapper from './StepWrapper';

export default function StepShipping({ order, readOnly, onChanged }) {
  const [batches, setBatches] = useState(order.shippingBatches || []);
  const [form, setForm] = useState({ batch_percent: '', shipped_date: '', remark: '' });
  const [delivered, setDelivered] = useState(Number(order.delivered) === 1);
  const [deliveredDate, setDeliveredDate] = useState(order.delivered_date || '');
  const [error, setError] = useState('');
  const editable = !readOnly && order.status === 'shipping_invoicing';
  const sum = batches.reduce((acc, row) => acc + Number(row.batch_percent || 0), 0);

  useEffect(() => {
    setBatches(order.shippingBatches || []);
    setDelivered(Number(order.delivered) === 1);
    setDeliveredDate(order.delivered_date || '');
  }, [order]);

  const addBatch = async () => {
    const pct = Number(form.batch_percent);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      setError('发货百分比必须大于 0 且不超过 100');
      return;
    }
    setError('');
    try {
      await api.post(`/orders/${order.id}/shipping`, form);
      setForm({ batch_percent: '', shipped_date: '', remark: '' });
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const deleteBatch = async (batchId) => {
    try {
      await api.delete(`/orders/${order.id}/shipping/${batchId}`);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const toggleDelivered = async (checked) => {
    setError('');
    try {
      await api.patch(`/orders/${order.id}/status`, {
        action: 'toggle-delivered',
        delivered: checked ? 1 : 0,
        deliveredDate: checked ? deliveredDate || undefined : undefined
      });
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <StepWrapper title="发货管理" subtitle="手动标记全部发货完成，可选按百分比分批发货" readOnly={readOnly}>
      {error && (
        <Box sx={{ mb: 2 }}>
          <Alert severity="error">{error}</Alert>
        </Box>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 1.5, mb: 2 }}>
        <Box
          sx={{
            p: 1.75,
            borderRadius: 2.5,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: delivered ? 'rgba(30,122,70,0.08)' : 'rgba(178,106,0,0.08)'
          }}
        >
          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
            发货状态
          </Typography>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="h6" sx={{ fontWeight: 800, color: delivered ? '#1E7A46' : '#B26A00' }}>
              {delivered ? '已全部发货' : '未完成发货'}
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={delivered}
                  disabled={!editable}
                  onChange={(e) => toggleDelivered(e.target.checked)}
                  color="success"
                />
              }
              label=""
              sx={{ m: 0 }}
            />
          </Stack>
        </Box>
        <Box sx={{ p: 1.75, borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: 'action.hover' }}>
          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
            发货日期
          </Typography>
          <TextField
            label=""
            type="date"
            value={deliveredDate}
            disabled={!editable}
            onChange={(e) => setDeliveredDate(e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
            size="small"
            sx={{ mt: 0.75 }}
          />
        </Box>
        <Box
          sx={{
            p: 1.75,
            borderRadius: 2.5,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: batches.length === 0 ? 'action.hover' : sum >= 100 ? 'rgba(30,122,70,0.08)' : 'rgba(178,106,0,0.08)'
          }}
        >
          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
            批次累计
          </Typography>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 0.75 }}>
            <Typography variant="h5" sx={{ fontWeight: 800, color: batches.length === 0 ? 'text.primary' : sum >= 100 ? '#1E7A46' : '#B26A00' }}>
              {sum}%
            </Typography>
            <Chip
              size="small"
              color={batches.length === 0 ? 'default' : sum >= 100 ? 'success' : 'warning'}
              label={batches.length === 0 ? '无批次（可直接标记）' : sum >= 100 ? '已累计完成' : '未全部发货'}
              sx={{ fontWeight: 700 }}
            />
          </Stack>
        </Box>
      </Box>

      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2.5, mb: 1 }}>
        <Box sx={{ width: 4, height: 20, borderRadius: 2, bgcolor: 'primary.main' }} />
        <Typography variant="h6" sx={{ fontWeight: 800 }}>
          发货批次
        </Typography>
      </Stack>
      <Table size="small" sx={{ '& .MuiTableCell-root': { fontSize: '0.9rem', py: 1.25 } }}>
        <TableHead>
          <TableRow>
            <TableCell>批次号</TableCell>
            <TableCell align="right">百分比</TableCell>
            <TableCell>发货日期</TableCell>
            <TableCell>备注</TableCell>
            <TableCell sx={{ width: 120 }}>操作</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {batches.map((row) => (
            <TableRow key={row.id}>
              <TableCell sx={{ fontWeight: 600 }}>{row.batch_no}</TableCell>
              <TableCell align="right">{Number(row.batch_percent).toFixed(0)}%</TableCell>
              <TableCell>{fmtDate(row.shipped_date)}</TableCell>
              <TableCell>{row.remark || '-'}</TableCell>
              <TableCell>
                {editable && !delivered && (
                  <IconButton size="small" color="error" onClick={() => deleteBatch(row.id)} title="删除">
                    <DeleteIcon />
                  </IconButton>
                )}
              </TableCell>
            </TableRow>
          ))}
          {batches.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary' }}>
                暂无批次
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {editable && (
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mt: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
          <TextField
            label="百分比（%）"
            type="number"
            value={form.batch_percent}
            onChange={(e) => setForm((prev) => ({ ...prev, batch_percent: e.target.value }))}
            inputProps={{ min: 0.01, max: 100 }}
          />
          <TextField
            label="发货日期"
            type="date"
            value={form.shipped_date}
            onChange={(e) => setForm((prev) => ({ ...prev, shipped_date: e.target.value }))}
            InputLabelProps={{ shrink: true }}
          />
          <TextField label="备注" value={form.remark} onChange={(e) => setForm((prev) => ({ ...prev, remark: e.target.value }))} />
          <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={addBatch}>
            登记批次
          </Button>
        </Stack>
      )}
      {batches.length > 0 && sum < 100 && editable && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          批次累计仅 {sum}%，未全部发货，不能标记完成
        </Alert>
      )}
    </StepWrapper>
  );
}
