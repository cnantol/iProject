import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
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
import { fmtMoney, fmtDate } from '../utils/helpers';
import StepWrapper from './StepWrapper';

export default function StepInvoicing({ order, readOnly, onChanged }) {
  const [invoices, setInvoices] = useState(order.invoices || []);
  const [form, setForm] = useState({ po_id: '', invoice_no: '', amount: '', invoice_date: '', remark: '' });
  const [invoiced, setInvoiced] = useState(Number(order.invoiced) === 1);
  const [invoicedDate, setInvoicedDate] = useState(order.invoiced_date || '');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingToggle, setPendingToggle] = useState(false);
  const [error, setError] = useState('');
  const editable = !readOnly && order.status === 'shipping_invoicing';

  const pos = order.pos || [];
  const poTotal = order.posTotal || 0;
  const invoiceTotal = order.invoiceTotal || 0;
  const difference = poTotal - invoiceTotal;

  useEffect(() => {
    setInvoices(order.invoices || []);
    setInvoiced(Number(order.invoiced) === 1);
    setInvoicedDate(order.invoiced_date || '');
  }, [order]);

  const addInvoice = async () => {
    if (!form.po_id) {
      setError('请选择对应 PO');
      return;
    }
    if (!form.invoice_no.trim()) {
      setError('发票号必填');
      return;
    }
    if (!Number(form.amount) || Number(form.amount) <= 0) {
      setError('开票金额必须大于 0');
      return;
    }
    if (!form.invoice_date) {
      setError('请填写开票日期');
      return;
    }
    const po = pos.find((item) => item.id === Number(form.po_id));
    const poInvoiced = invoices.filter((item) => item.po_id === Number(form.po_id)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const wouldExceed = po && Number(poInvoiced) + Number(form.amount) > Number(po.po_amount);
    if (wouldExceed && !window.confirm(`该 PO 累计开票将超过 PO 金额（PO ${fmtMoney(po.po_amount)}，已开 ${fmtMoney(poInvoiced)}），确认继续？`)) {
      return;
    }
    setError('');
    try {
      await api.post(`/orders/${order.id}/invoices`, { ...form, po_id: Number(form.po_id), amount: Number(form.amount), confirm: wouldExceed ? 1 : 0 });
      setForm({ po_id: '', invoice_no: '', amount: '', invoice_date: '', remark: '' });
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const deleteInvoice = async (invoiceId) => {
    try {
      await api.delete(`/orders/${order.id}/invoices/${invoiceId}`);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const toggleInvoiced = async (checked) => {
    setError('');
    if (checked && !invoicedDate) {
      setError('请先填写开票日期');
      return;
    }
    if (checked && invoiceTotal < poTotal) {
      setPendingToggle(true);
      setConfirmOpen(true);
      return;
    }
    try {
      await api.patch(`/orders/${order.id}/status`, {
        action: 'toggle-invoiced',
        invoiced: checked ? 1 : 0,
        invoicedDate: checked ? invoicedDate || undefined : undefined
      });
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const confirmManual = async () => {
    setConfirmOpen(false);
    setPendingToggle(false);
    try {
      if (!invoicedDate) {
        setError('请先填写开票日期');
        return;
      }
      await api.patch(`/orders/${order.id}/status`, {
        action: 'toggle-invoiced',
        invoiced: 1,
        invoicedDate: invoicedDate || undefined,
        confirm: 1
      });
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <StepWrapper title="开票管理" subtitle="按 PO 关联发票，累计开票金额自动比对" readOnly={readOnly}>
      {error && (
        <Box sx={{ mb: 2 }}>
          <Alert severity="error">{error}</Alert>
        </Box>
      )}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {[
          { label: 'PO 总金额', value: `¥ ${fmtMoney(poTotal)}`, color: '#004E9A' },
          { label: '累计开票', value: `¥ ${fmtMoney(invoiceTotal)}`, color: difference < 0 ? '#C33D3D' : '#0093BE' },
          { label: '差额', value: `¥ ${fmtMoney(Math.abs(difference))}`, color: difference > 0 ? '#B26A00' : '#1E7A46' }
        ].map((item) => (
          <Grid item xs={12} sm={4} key={item.label}>
            <Box sx={{ p: 1.75, borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: `${item.color}10` }}>
              <Typography variant="overline" sx={{ color: item.color, fontWeight: 700 }}>
                {item.label}
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 800, color: item.color, mt: 0.5 }}>
                {item.value}
              </Typography>
            </Box>
          </Grid>
        ))}
      </Grid>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
        <FormControlLabel
          control={<Switch checked={invoiced} disabled={!editable} onChange={(e) => toggleInvoiced(e.target.checked)} color="success" />}
          label={invoiced ? '已整单开票' : '未完成开票'}
        />
        <TextField
          label="开票日期"
          type="date"
          value={invoicedDate}
          disabled={!editable}
          onChange={(e) => setInvoicedDate(e.target.value)}
          size="small"
          InputLabelProps={{ shrink: true }}
        />
        {invoiceTotal >= poTotal && <Chip size="small" color="success" label="累计开票已达 PO 总额" />}
      </Stack>

      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2.5, mb: 1 }}>
        <Box sx={{ width: 4, height: 20, borderRadius: 2, bgcolor: 'secondary.main' }} />
        <Typography variant="h6" sx={{ fontWeight: 800 }}>
          发票记录
        </Typography>
      </Stack>
      <Table size="small" sx={{ '& .MuiTableCell-root': { fontSize: '0.9rem', py: 1.25 } }}>
        <TableHead>
          <TableRow>
            <TableCell>发票号</TableCell>
            <TableCell>PO 号</TableCell>
            <TableCell align="right">金额</TableCell>
            <TableCell>开票日期</TableCell>
            <TableCell>备注</TableCell>
            <TableCell sx={{ width: 120 }}>操作</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {invoices.map((row) => (
            <TableRow key={row.id}>
              <TableCell sx={{ fontWeight: 600 }}>{row.invoice_no}</TableCell>
              <TableCell>{row.po_number}</TableCell>
              <TableCell align="right">{fmtMoney(row.amount)}</TableCell>
              <TableCell>{fmtDate(row.invoice_date)}</TableCell>
              <TableCell>{row.remark || '-'}</TableCell>
              <TableCell>
                {editable && (
                  <IconButton size="small" color="error" onClick={() => deleteInvoice(row.id)} title="删除">
                    <DeleteIcon />
                  </IconButton>
                )}
              </TableCell>
            </TableRow>
          ))}
          {invoices.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} align="center" sx={{ color: 'text.secondary' }}>
                暂无发票记录
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {editable && (
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mt: 2, flexWrap: 'wrap', rowGap: 1 }}>
          <FormControl sx={{ minWidth: 180 }}>
            <InputLabel>对应 PO</InputLabel>
            <Select value={form.po_id} label="对应 PO" onChange={(e) => setForm((prev) => ({ ...prev, po_id: e.target.value }))}>
              {pos.map((po) => (
                <MenuItem key={po.id} value={po.id}>
                  {po.po_number}（¥ {fmtMoney(po.po_amount)}）
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField label="发票号" value={form.invoice_no} onChange={(e) => setForm((prev) => ({ ...prev, invoice_no: e.target.value }))} />
          <TextField label="金额" type="number" value={form.amount} onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))} />
          <TextField
            label="开票日期"
            type="date"
            value={form.invoice_date}
            onChange={(e) => setForm((prev) => ({ ...prev, invoice_date: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            required
          />
          <TextField label="备注" value={form.remark} onChange={(e) => setForm((prev) => ({ ...prev, remark: e.target.value }))} />
          <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={addInvoice}>
            添加发票
          </Button>
        </Stack>
      )}

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>确认手动标记开票完成</DialogTitle>
        <DialogContent>
          <DialogContentText>
            已开票 ¥ {fmtMoney(invoiceTotal)}，PO 总金额 ¥ {fmtMoney(poTotal)}，差额 ¥ {fmtMoney(difference)}。确认手动标记整单开票完成？
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>取消</Button>
          <Button color="warning" onClick={confirmManual}>
            确认标记
          </Button>
        </DialogActions>
      </Dialog>
    </StepWrapper>
  );
}
