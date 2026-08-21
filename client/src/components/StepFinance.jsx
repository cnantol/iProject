import { ATTACHMENT_ACCEPT } from '../utils/constants';
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
import PaymentsIcon from '@mui/icons-material/Payments';
import SaveIcon from '@mui/icons-material/Save';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import api, { errorMessage } from '../api';
import { PAYMENT_TERMS } from '../utils/constants';
import { fmtMoney } from '../utils/helpers';
import { downloadFile } from '../utils/download';
import { useFieldLabels } from '../utils/fieldLabels';
import useFileUpload from '../hooks/useFileUpload';
import UploadStatus from './UploadStatus';
import { useConfirm } from './ConfirmDialog';
import StepWrapper from './StepWrapper';

export default function StepFinance({ order, readOnly, onChanged, onAdvance }) {
  const confirm = useConfirm();
  const { t } = useFieldLabels();
  const [salesOrder, setSalesOrder] = useState(order.sales_order || '');
  const [paymentTerms, setPaymentTerms] = useState(order.payment_terms || 'COD');
  const [pos, setPos] = useState(order.pos || []);
  const [poForm, setPoForm] = useState({ po_number: '', po_amount: '', remark: '' });
  const [editingPoId, setEditingPoId] = useState(null);
  const [soDirty, setSoDirty] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const uploadCtrl = useFileUpload();
  const editable = !readOnly && order.status === 'finance';
  const isCustomPayment = !PAYMENT_TERMS.includes(paymentTerms);
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
    setPaymentTerms(order.payment_terms || 'COD');
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
      if (soDirty) {
        await api.patch(`/orders/${order.id}`, { sales_order: salesOrder, payment_terms: paymentTerms });
        setSoDirty(false);
      }
      if (editingPoId) {
        await api.put(`/orders/${order.id}/customer-pos/${editingPoId}`, poForm);
      } else {
        await api.post(`/orders/${order.id}/customer-pos`, poForm);
      }
      setPoForm({ po_number: '', po_amount: '', remark: '' });
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
    event.target.value = '';
    if (!file) return;
    await uploadCtrl.upload(file, {
      url: `/orders/${order.id}/attachments`,
      fields: { stage: 'finance' },
      onSuccess: () => onChanged()
    });
  };

  const deleteAttachment = async (attachmentId) => {
    if (!(await confirm('确认删除该合同附件？删除后需重新上传。'))) return;
    setError('');
    try {
      await api.delete(`/orders/${order.id}/attachments/${attachmentId}`);
      onChanged();
    } catch (err) {
      setError(errorMessage(err, '删除失败'));
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

  const openDownload = async (path) => {
    try {
      await downloadFile(path);
    } catch {
      setError('下载失败，请重试');
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
              if (editable && soDirty) saveOrder();
            }}
            fullWidth
            disabled={!editable}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            label={`${t('amount')}（自动带出，锁定）`}
            value={fmtMoney(order.total_amount)}
            fullWidth
            disabled
            helperText="由中标报价轮次自动写入，仅可通过数据修正调整"
          />
        </Grid>
        <Grid item xs={12}>
          <Box sx={{ p: 1.5, borderRadius: 2.5, border: 1, borderColor: 'rgba(0,78,154,0.22)', bgcolor: 'rgba(0,78,154,0.04)', boxShadow: 1 }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
              <Box sx={{ width: 34, height: 34, borderRadius: 2, bgcolor: 'rgba(0,78,154,0.10)', color: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <PaymentsIcon fontSize="small" />
              </Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>付款条款</Typography>
              <Chip size="small" label={isCustomPayment ? 'Other' : paymentTerms} variant="outlined" sx={{ fontWeight: 700 }} />
            </Stack>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
              默认 COD；选择 Other 后可在右侧输入自定义付款条款
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="flex-start">
              <TextField
                select
                label="选择付款方式"
                value={isCustomPayment ? 'Other' : paymentTerms}
                onChange={(e) => {
                  const value = e.target.value;
                  setPaymentTerms(value === 'Other' ? '' : value);
                }}
                disabled={!editable}
                sx={{ flex: 1, minWidth: 180 }}
              >
                {PAYMENT_TERMS.map((term) => (
                  <MenuItem key={term} value={term}>
                    {term}
                  </MenuItem>
                ))}
              </TextField>
              {isCustomPayment ? (
                <TextField
                  label="自定义付款条款"
                  placeholder="请输入付款方式"
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  disabled={!editable}
                  sx={{ flex: 1, minWidth: 220 }}
                />
              ) : null}
            </Stack>
          </Box>
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
                        setPoForm({ po_number: row.po_number, po_amount: String(row.po_amount), remark: row.remark || '' });
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
          <TextField
            size="small"
            label="备注"
            value={poForm.remark}
            onChange={(e) => setPoForm((prev) => ({ ...prev, remark: e.target.value }))}
            sx={{ minWidth: 220 }}
          />
          <Button size="small" variant="outlined" startIcon={<SaveIcon />} onClick={addPo} sx={{ borderRadius: 2 }}>
            {editingPoId ? '保存修改' : '添加 PO'}
          </Button>
          {editingPoId && (
            <Button
              size="small"
              onClick={() => {
                setEditingPoId(null);
                setPoForm({ po_number: '', po_amount: '', remark: '' });
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
      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
        {attachments.map((item) => (
          <Chip
            key={item.id}
            label={item.file_name}
            clickable
            title="点击下载"
            onClick={() => openDownload(`/api/orders/${order.id}/attachments/${item.id}/download`)}
            onDelete={!posLocked ? () => deleteAttachment(item.id) : undefined}
            deleteIcon={<DeleteIcon fontSize="small" />}
          />
        ))}
        <Button component="label" variant="outlined" size="small" startIcon={<UploadFileIcon />} sx={{ borderRadius: 2 }} disabled={uploadCtrl.status === 'uploading'}>
          上传合同
          <input type="file" hidden accept={ATTACHMENT_ACCEPT} onChange={uploadAttachment} />
        </Button>
        <UploadStatus
          status={uploadCtrl.status}
          progress={uploadCtrl.progress}
          fileName={uploadCtrl.fileName}
          error={uploadCtrl.error}
        />
      </Stack>

      {editable && (
        <Stack direction="row" spacing={1.5} sx={{ mt: 3, justifyContent: 'flex-end', flexWrap: 'wrap', rowGap: 1 }}>
          <Button
            variant="contained"
            size="large"
            startIcon={<SaveIcon />}
            onClick={advance}
            disabled={saving || !financeReady}
            title={financeReady ? undefined : '请先保存 Sales Order 与 Customer PO'}
            sx={{ minWidth: 180, borderRadius: 2 }}
          >
            {saving ? <CircularProgress size={18} color="inherit" /> : '保存并进入下一步'}
          </Button>
        </Stack>
      )}
    </StepWrapper>
  );
}
