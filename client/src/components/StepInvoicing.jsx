import { useEffect, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
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
import Paper from '@mui/material/Paper';
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
import UploadFileIcon from '@mui/icons-material/UploadFile';
import api, { errorMessage } from '../api';
import { useConfirm } from './ConfirmDialog';
import { fmtMoney, fmtDate } from '../utils/helpers';
import useFileUpload from '../hooks/useFileUpload';
import UploadStatus from './UploadStatus';
import StepWrapper from './StepWrapper';

export default function StepInvoicing({ order, readOnly, onChanged }) {
  const confirm = useConfirm();
  const [invoices, setInvoices] = useState(order.invoices || []);
  const [form, setForm] = useState({
    po_id: '',
    invoice_no: '',
    amount: '',
    invoice_date: '',
    remark: '',
    tax_amount: '',
    tax_rate: '',
    total_amount_incl_tax: ''
  });
  const [invoiced, setInvoiced] = useState(Number(order.invoiced) === 1);
  const [invoicedDate, setInvoicedDate] = useState(order.invoiced_date || '');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [recognitionInfo, setRecognitionInfo] = useState(null);
  const [pendingAttachmentId, setPendingAttachmentId] = useState(null);
  const invoiceFileRef = useRef(null);
  const [error, setError] = useState('');
  const uploadCtrl = useFileUpload();
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
    const poAmount = po && po.po_amount != null && Number(po.po_amount) > 0 ? Number(po.po_amount) : null;
    const wouldExceed = poAmount !== null && Number(poInvoiced) + Number(form.amount) > poAmount;
    if (wouldExceed && !(await confirm(`该 PO 累计开票将超过 PO 金额（PO ${fmtMoney(po.po_amount)}，已开 ${fmtMoney(poInvoiced)}），确认继续？`))) {
      return;
    }
    setError('');
    try {
      const payload = {
        ...form,
        po_id: Number(form.po_id),
        amount: Number(form.amount),
        confirm: wouldExceed ? 1 : 0,
        tax_amount: form.tax_amount === '' ? undefined : Number(form.tax_amount),
        tax_rate: form.tax_rate === '' ? undefined : Number(form.tax_rate),
        total_amount_incl_tax: form.total_amount_incl_tax === '' ? undefined : Number(form.total_amount_incl_tax)
      };
      if (pendingAttachmentId) payload.attachment_id = pendingAttachmentId;
      await api.post(`/orders/${order.id}/invoices`, payload);
      setForm({ po_id: '', invoice_no: '', amount: '', invoice_date: '', remark: '', tax_amount: '', tax_rate: '', total_amount_incl_tax: '' });
      setPendingAttachmentId(null);
      setRecognitionInfo(null);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const handleInvoiceUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
      setError('仅支持 PDF 发票识别');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('发票文件不能超过 20MB');
      return;
    }
    setError('');
    setRecognitionInfo(null);
    setRecognizing(true);
    await uploadCtrl.upload(file, {
      url: `/orders/${order.id}/attachments`,
      fields: { stage: 'invoicing' },
      onSuccess: async ({ data: attachment }) => {
        setPendingAttachmentId(attachment.id);
        try {
          const { data } = await api.post(`/orders/${order.id}/invoices/recognize`, { attachment_id: attachment.id });
          setRecognitionInfo(data);
          setForm((prev) => ({
            ...prev,
            invoice_no: data.invoice_no || prev.invoice_no,
            invoice_date: data.invoice_date || prev.invoice_date,
            amount: data.amount != null ? String(data.amount) : prev.amount,
            tax_amount: data.tax_amount != null ? String(data.tax_amount) : '',
            tax_rate: data.tax_rate != null ? String(data.tax_rate) : '',
            total_amount_incl_tax: data.total_amount_incl_tax != null ? String(data.total_amount_incl_tax) : ''
          }));
        } catch (err) {
          setError(errorMessage(err, '发票识别失败'));
        }
      }
    });
    setRecognizing(false);
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
      {recognitionInfo && (
        <Alert severity={recognitionInfo.recognized ? 'info' : 'warning'} sx={{ mb: 2 }} onClose={() => setRecognitionInfo(null)}>
          {recognitionInfo.message}
          {recognitionInfo.recognized && (
            <Box component="span" sx={{ display: 'block', mt: 0.5 }}>
              发票号：{recognitionInfo.invoice_no || '-'} ｜ 开票日期：{recognitionInfo.invoice_date || '-'} ｜
              未税金额：{recognitionInfo.amount != null ? `¥ ${fmtMoney(recognitionInfo.amount)}` : '-'} ｜
              税额：{recognitionInfo.tax_amount != null ? `¥ ${fmtMoney(recognitionInfo.tax_amount)}` : '-'} ｜
              税率：{recognitionInfo.tax_rate != null ? `${recognitionInfo.tax_rate}%` : '-'} ｜
              含税：{recognitionInfo.total_amount_incl_tax != null ? `¥ ${fmtMoney(recognitionInfo.total_amount_incl_tax)}` : '-'}
            </Box>
          )}
        </Alert>
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
            <TableCell align="right">金额（未税）</TableCell>
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
              <TableCell align="right">
                <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {fmtMoney(row.amount)}
                </Typography>
                {row.total_amount_incl_tax != null && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', whiteSpace: 'nowrap' }}>
                    含税 {fmtMoney(row.total_amount_incl_tax)}
                  </Typography>
                )}
              </TableCell>
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
        <Paper variant="outlined" sx={{ mt: 2.5, p: 2, borderRadius: 2, borderColor: 'divider' }}>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
            <Box sx={{ width: 4, height: 20, borderRadius: 2, bgcolor: 'secondary.main' }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>新增发票</Typography>
            <Box sx={{ flex: 1 }} />
            <Button
              component="label"
              variant="outlined"
              size="small"
              startIcon={recognizing || uploadCtrl.status === 'uploading' ? <CircularProgress size={16} /> : <UploadFileIcon />}
              disabled={recognizing || uploadCtrl.status === 'uploading'}
            >
              {recognizing ? '识别中...' : uploadCtrl.status === 'uploading' ? '上传中...' : '上传 PDF 自动识别'}
              <input ref={invoiceFileRef} type="file" hidden accept="application/pdf,.pdf" onChange={handleInvoiceUpload} />
            </Button>
            <UploadStatus
              status={uploadCtrl.status}
              progress={uploadCtrl.progress}
              fileName={uploadCtrl.fileName}
              error={uploadCtrl.error}
              successText="发票上传成功"
            />
          </Stack>
          <Grid container spacing={2} alignItems="flex-end">
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>对应 PO</InputLabel>
                <Select value={form.po_id} label="对应 PO" onChange={(e) => setForm((prev) => ({ ...prev, po_id: e.target.value }))}>
                  {pos.map((po) => (
                    <MenuItem key={po.id} value={po.id}>
                      {po.po_number}（¥ {fmtMoney(po.po_amount)}）
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField label="发票号" fullWidth size="small" value={form.invoice_no} onChange={(e) => setForm((prev) => ({ ...prev, invoice_no: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField label="金额（未税）" type="number" fullWidth size="small" value={form.amount} onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                label="开票日期"
                type="date"
                fullWidth
                size="small"
                value={form.invoice_date}
                onChange={(e) => setForm((prev) => ({ ...prev, invoice_date: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                required
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                label="税额"
                type="number"
                fullWidth
                size="small"
                value={form.tax_amount}
                onChange={(e) => setForm((prev) => ({ ...prev, tax_amount: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                label="税率（%）"
                type="number"
                fullWidth
                size="small"
                value={form.tax_rate}
                onChange={(e) => setForm((prev) => ({ ...prev, tax_rate: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                label="含税金额"
                type="number"
                fullWidth
                size="small"
                value={form.total_amount_incl_tax}
                onChange={(e) => setForm((prev) => ({ ...prev, total_amount_incl_tax: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField label="备注" fullWidth size="small" value={form.remark} onChange={(e) => setForm((prev) => ({ ...prev, remark: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={addInvoice}>
                添加发票
              </Button>
            </Grid>
          </Grid>
        </Paper>
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
