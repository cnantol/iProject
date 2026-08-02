import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import api, { errorMessage } from '../api';
import { PAYMENT_TERMS } from '../utils/constants';
import { fmtMoney, authUrl } from '../utils/helpers';
import StepWrapper from './StepWrapper';

export default function StepFinance({ order, readOnly, onChanged, onAdvance }) {
  const [salesOrder, setSalesOrder] = useState(order.sales_order || '');
  const [paymentTerms, setPaymentTerms] = useState(order.payment_terms || '');
  const [pos, setPos] = useState(order.pos || []);
  const [poForm, setPoForm] = useState({ po_number: '', po_amount: '' });
  const [editingPoId, setEditingPoId] = useState(null);
  const [soDirty, setSoDirty] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const editable = !readOnly && order.status === 'finance';
  const posLocked = !editable;
  const soSaved = Boolean(order.sales_order) && !soDirty;
  const poSaved = (pos || []).length > 0;
  const financeReady = soSaved && poSaved;
  const soStatus = soDirty ? { label: 'SO 待保存', color: '#B26A00' } : order.sales_order ? { label: 'SO 已保存', color: '#1E7A46' } : { label: 'SO 未保存', color: '#C33D3D' };
  const poStatus = poSaved ? { label: `PO 已保存 ${pos.length} 行`, color: '#1E7A46' } : { label: 'PO 未录入', color: '#C33D3D' };
  const overallStatus = financeReady
    ? { label: 'SO 与 PO 均已保存，可进入下一步', color: '#1E7A46' }
    : { label: '请先保存 SO 与 PO', color: '#B26A00' };

  useEffect(() => {
    if (!soDirty) setSalesOrder(order.sales_order || '');
    setPaymentTerms(order.payment_terms || '');
    setPos(order.pos || []);
    setAttachments((order.attachments || []).filter((item) => item.stage === 'finance'));
  }, [order, soDirty]);

  const saveOrder = async () => {
    setError('');
    setSaving(true);
    try {
      await api.patch(`/orders/${order.id}`, { sales_order: salesOrder, payment_terms: paymentTerms });
      setSoDirty(false);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const addPo = async () => {
    if (!poForm.po_number.trim()) {
      setError('PO 号必填');
      return;
    }
    if (!Number(poForm.po_amount) || Number(poForm.po_amount) <= 0) {
      setError('PO 金额必须大于 0');
      return;
    }
    setError('');
    try {
      if (soDirty && salesOrder.trim()) {
        await api.patch(`/orders/${order.id}`, { sales_order: salesOrder, payment_terms: paymentTerms });
        setSoDirty(false);
      }
      if (editingPoId) {
        await api.put(`/orders/${order.id}/customer-pos/${editingPoId}`, poForm);
      } else {
        await api.post(`/orders/${order.id}/customer-pos`, poForm);
      }
      setPoForm({ po_number: '', po_amount: '' });
      setEditingPoId(null);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const deletePo = async (poId) => {
    try {
      await api.delete(`/orders/${order.id}/customer-pos/${poId}`);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const uploadAttachment = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('stage', 'finance');
    try {
      await api.post(`/orders/${order.id}/attachments`, formData);
      onChanged();
    } catch (err) {
      setError(errorMessage(err, '上传失败'));
    }
  };

  const advance = async () => {
    if (!financeReady) {
      setError('请先保存 Sales Order 与 Customer PO 后再进入下一步');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await api.patch(`/orders/${order.id}`, { sales_order: salesOrder, payment_terms: paymentTerms });
      await api.patch(`/orders/${order.id}/status`, { action: 'advance' });
      onAdvance();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <StepWrapper title="财务信息" subtitle="Sales Order、客户 PO、付款条款与盖章合同" readOnly={readOnly}>
      {error && (
        <Box sx={{ mb: 2 }}>
          <Alert severity="error">{error}</Alert>
        </Box>
      )}
      <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        {[soStatus, poStatus, overallStatus].map((status) => (
          <Chip
            key={status.label}
            size="small"
            icon={<Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: status.color }} />}
            label={status.label}
            sx={{ color: status.color, bgcolor: `${status.color}1A`, border: `1px solid ${status.color}38`, fontWeight: 700 }}
          />
        ))}
      </Stack>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}>
          <TextField
            label="Sales Order（必填，全局唯一）"
            value={salesOrder}
            onChange={(e) => {
              setSalesOrder(e.target.value);
              setSoDirty(true);
            }}
            onBlur={() => {
              if (editable && soDirty && salesOrder.trim()) saveOrder();
            }}
            fullWidth
            disabled={!editable}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField select label="付款条款" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} fullWidth disabled={!editable}>
            {PAYMENT_TERMS.map((term) => (
              <MenuItem key={term} value={term}>
                {term}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            label="订单总金额（自动带出，锁定）"
            value={fmtMoney(order.total_amount)}
            fullWidth
            disabled
            helperText="由中标报价轮次自动写入，仅可通过数据修正调整"
          />
        </Grid>
      </Grid>

      <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
        Customer PO 明细
      </Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>PO 号</TableCell>
            <TableCell align="right">PO 金额</TableCell>
            <TableCell>备注</TableCell>
            <TableCell sx={{ width: 120 }}>操作</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {pos.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.po_number}</TableCell>
              <TableCell align="right">{fmtMoney(row.po_amount)}</TableCell>
              <TableCell>{row.remark || '-'}</TableCell>
              <TableCell>
                {!posLocked && (
                  <>
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={() => {
                        setEditingPoId(row.id);
                        setPoForm({ po_number: row.po_number, po_amount: String(row.po_amount) });
                      }}
                      title="编辑"
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => deletePo(row.id)} title="删除">
                      <DeleteIcon />
                    </IconButton>
                  </>
                )}
              </TableCell>
            </TableRow>
          ))}
          {pos.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} align="center" sx={{ color: 'text.secondary' }}>
                暂无 PO
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {!posLocked && (
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mt: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
          <TextField size="small" label="PO 号" value={poForm.po_number} onChange={(e) => setPoForm((prev) => ({ ...prev, po_number: e.target.value }))} />
          <TextField
            size="small"
            label="PO 金额"
            type="number"
            value={poForm.po_amount}
            onChange={(e) => setPoForm((prev) => ({ ...prev, po_amount: e.target.value }))}
          />
          <Button size="small" variant="outlined" startIcon={<SaveIcon />} onClick={addPo}>
            {editingPoId ? '保存修改' : '添加 PO'}
          </Button>
          {editingPoId && (
            <Button
              size="small"
              onClick={() => {
                setEditingPoId(null);
                setPoForm({ po_number: '', po_amount: '' });
              }}
            >
              取消
            </Button>
          )}
        </Stack>
      )}

      <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
        客户盖章合同
      </Typography>
      <Stack direction="row" spacing={1} alignItems="center">
        {attachments.map((item) => (
          <Chip key={item.id} label={item.file_name} component="a" href={authUrl(`/api/orders/${order.id}/attachments/${item.id}/download`)} clickable />
        ))}
        {!posLocked && (
          <Button component="label" variant="outlined" size="small" startIcon={<UploadFileIcon />}>
            上传合同
            <input type="file" hidden accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={uploadAttachment} />
          </Button>
        )}
      </Stack>

      {editable && (
        <Stack direction="row" spacing={1.5} sx={{ mt: 3, justifyContent: 'flex-end', flexWrap: 'wrap', rowGap: 1 }}>
          <Button
            variant="contained"
            onClick={advance}
            disabled={saving || !financeReady}
            title={financeReady ? undefined : '请先保存 Sales Order 与 Customer PO'}
          >
            {saving ? <CircularProgress size={18} color="inherit" /> : '保存并进入下一步'}
          </Button>
        </Stack>
      )}
    </StepWrapper>
  );
}
