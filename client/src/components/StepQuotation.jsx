import { useEffect, useMemo, useState } from 'react';
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
import IconButton from '@mui/material/IconButton';
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
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import SaveIcon from '@mui/icons-material/Save';
import SyncIcon from '@mui/icons-material/Sync';
import api, { errorMessage } from '../api';
import { PRICE_SOURCE_LABELS } from '../utils/constants';
import { fmtMoney, round2, round4 } from '../utils/helpers';
import StepWrapper from './StepWrapper';

const EMPTY_ITEM = {
  material_no: '',
  description: '',
  material_type: 'standard',
  price_source: 'manual',
  unit_price_ex_vat: '',
  pay_percent: 100,
  qty: '',
  unit: 'pcs',
  remark: ''
};

export default function StepQuotation({ order, readOnly, onChanged }) {
  const [quotations, setQuotations] = useState([]);
  const [activeRoundId, setActiveRoundId] = useState(null);
  const [rows, setRows] = useState([]);
  const [submitRoundId, setSubmitRoundId] = useState('');
  const [syncOpen, setSyncOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const activeRound = useMemo(() => quotations.find((round) => round.id === activeRoundId) || quotations[quotations.length - 1], [quotations, activeRoundId]);
  const editable = !readOnly && order.status === 'quotation' && activeRound?.status === 'draft';
  const roundLocked = activeRound?.status === 'submitted';

  const load = async () => {
    try {
      const { data } = await api.get(`/orders/${order.id}/quotations`);
      setQuotations(data.items || []);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  useEffect(() => {
    load();
  }, [order.id]);

  useEffect(() => {
    if (activeRound) {
      setActiveRoundId(activeRound.id);
      setRows((activeRound.items || []).map((item) => ({ ...item, _qty: String(item.qty), _unit_price: item.unit_price_ex_vat == null ? '' : String(item.unit_price_ex_vat) })));
    }
  }, [activeRound?.id]);

  const resolvePrice = async (index, materialNo) => {
    if (!materialNo.trim()) return;
    try {
      const { data } = await api.get(`/orders/${order.id}/quotations/price-lookup`, {
        params: { material_no: materialNo, material_type: rows[index]?.material_type || 'standard' }
      });
      setRows((prev) =>
        prev.map((row, i) =>
          i === index
            ? {
                ...row,
                price_source: data.price_source,
                unit_price_ex_vat: data.unit_price_ex_vat == null ? row.unit_price_ex_vat : String(data.unit_price_ex_vat),
                description: data.description || row.description
              }
            : row
        )
      );
    } catch {
      // 忽略查询失败
    }
  };

  const updateRow = (index, key, value) => setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));

  const saveRow = async (index) => {
    const row = rows[index];
    const unitPrice = Number(row.unit_price_ex_vat);
    const qty = Number(row.qty);
    const payPercent = Number(row.pay_percent || 100);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('数量必须大于 0');
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      setError('未税单价必须大于 0');
      return;
    }
    if (row.price_source === 'guide_price' && (!Number.isFinite(payPercent) || payPercent <= 0 || payPercent > 100)) {
      setError('实付比例必须大于 0 且不超过 100');
      return;
    }
    const payload = {
      material_no: row.material_no,
      description: row.description,
      material_type: row.material_type,
      price_source: row.price_source,
      unit_price_ex_vat: unitPrice,
      pay_percent: row.price_source === 'guide_price' ? payPercent : 100,
      qty,
      unit: row.unit || 'pcs',
      remark: row.remark
    };
    setError('');
    try {
      if (row.id) {
        await api.put(`/orders/${order.id}/quotations/${activeRound.id}/items/${row.id}`, payload);
      } else {
        await api.post(`/orders/${order.id}/quotations/${activeRound.id}/items`, payload);
      }
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const deleteRow = async (itemId) => {
    try {
      await api.delete(`/orders/${order.id}/quotations/${activeRound.id}/items/${itemId}`);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const addRound = async () => {
    try {
      await api.post(`/orders/${order.id}/quotations`, { round_label: '' });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const submitRound = async () => {
    setError('');
    try {
      await api.patch(`/orders/${order.id}/quotations/${activeRound.id}`, { action: 'submit' });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const syncFromProposal = async () => {
    setSyncOpen(false);
    setError('');
    try {
      await api.post(`/orders/${order.id}/quotations/${activeRound.id}/sync-from-proposal`);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const exportPdf = async () => {
    try {
      const { data } = await api.post(`/orders/${order.id}/quotations/${activeRound.id}/pdf`, {});
      window.open(data.url, '_blank');
    } catch (err) {
      setError(errorMessage(err, 'PDF 生成失败'));
    }
  };

  const submitApproval = async () => {
    if (!submitRoundId) {
      setError('请选择要审批的报价轮次');
      return;
    }
    setError('');
    try {
      await api.patch(`/orders/${order.id}/status`, { action: 'submit-approval', round_id: Number(submitRoundId) });
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const lineAmount = (row) => {
    const unit = Number(row.unit_price_ex_vat);
    const qty = Number(row.qty);
    const pct = Number(row.pay_percent || 100);
    if (!Number.isFinite(unit) || !Number.isFinite(qty) || qty <= 0) return null;
    const final = row.price_source === 'guide_price' ? round4((unit * pct) / 100) : unit;
    return round2(final * qty);
  };

  const submittedRounds = quotations.filter((round) => round.status === 'submitted');

  return (
    <StepWrapper title="报价阶段" subtitle="多轮报价、价格计算与提交审批" readOnly={readOnly}>
      {error && (
        <Box sx={{ mb: 2 }}>
          <Alert severity="error">{error}</Alert>
        </Box>
      )}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }} alignItems="center">
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>报价轮次</InputLabel>
          <Select value={activeRound?.id || ''} label="报价轮次" onChange={(e) => setActiveRoundId(Number(e.target.value))}>
            {quotations.map((round) => (
              <MenuItem key={round.id} value={round.id}>
                {round.round_label || `R${round.round_no}`}（{round.status === 'submitted' ? '已提交' : '草稿'}）
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {activeRound && (
          <Chip
            label={`合计：¥ ${fmtMoney(activeRound.total_amount)}`}
            color={roundLocked ? 'success' : 'default'}
            variant={roundLocked ? 'filled' : 'outlined'}
          />
        )}
        <Box sx={{ flex: 1 }} />
        {!readOnly && order.status === 'quotation' && (
          <>
            <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={addRound}>
              新增轮次
            </Button>
            <Button size="small" variant="outlined" startIcon={<PictureAsPdfIcon />} onClick={exportPdf}>
              导出 PDF
            </Button>
          </>
        )}
      </Stack>

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>物料号</TableCell>
            <TableCell>描述</TableCell>
            <TableCell sx={{ width: 90 }}>类型</TableCell>
            <TableCell sx={{ width: 100 }}>价格来源</TableCell>
            <TableCell sx={{ width: 110 }}>未税单价</TableCell>
            {activeRound && quotations.some((round) => round.items?.some((item) => item.price_source === 'guide_price')) && (
              <TableCell sx={{ width: 100 }}>实付比例%</TableCell>
            )}
            <TableCell sx={{ width: 90 }}>数量</TableCell>
            <TableCell sx={{ width: 100 }}>行金额</TableCell>
            <TableCell>备注</TableCell>
            <TableCell sx={{ width: 110 }}>操作</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={row.id || `new-${index}`}>
              <TableCell>
                <TextField
                  size="small"
                  value={row.material_no || ''}
                  disabled={!editable}
                  onChange={(e) => updateRow(index, 'material_no', e.target.value)}
                  onBlur={(e) => resolvePrice(index, e.target.value)}
                />
              </TableCell>
              <TableCell>
                <TextField size="small" value={row.description || ''} disabled={!editable} onChange={(e) => updateRow(index, 'description', e.target.value)} />
              </TableCell>
              <TableCell>
                <Select
                  size="small"
                  value={row.material_type || 'standard'}
                  disabled={!editable}
                  onChange={(e) => updateRow(index, 'material_type', e.target.value)}
                >
                  <MenuItem value="standard">标准</MenuItem>
                  <MenuItem value="non_standard">非标</MenuItem>
                </Select>
              </TableCell>
              <TableCell>
                <Chip
                  size="small"
                  label={PRICE_SOURCE_LABELS[row.price_source] || row.price_source || '手工'}
                  color={row.price_source === 'framework' ? 'primary' : row.price_source === 'guide_price' ? 'success' : 'default'}
                  variant="outlined"
                />
              </TableCell>
              <TableCell>
                <TextField
                  size="small"
                  type="number"
                  value={row.unit_price_ex_vat ?? ''}
                  disabled={!editable}
                  onChange={(e) => updateRow(index, 'unit_price_ex_vat', e.target.value)}
                />
              </TableCell>
              {quotations.some((round) => round.items?.some((item) => item.price_source === 'guide_price')) && (
                <TableCell>
                  <TextField
                    size="small"
                    type="number"
                    value={row.pay_percent ?? 100}
                    disabled={!editable || row.price_source !== 'guide_price'}
                    onChange={(e) => updateRow(index, 'pay_percent', e.target.value)}
                    inputProps={{ min: 0.01, max: 100 }}
                  />
                </TableCell>
              )}
              <TableCell>
                <TextField size="small" type="number" value={row.qty ?? ''} disabled={!editable} onChange={(e) => updateRow(index, 'qty', e.target.value)} />
              </TableCell>
              <TableCell align="right">{fmtMoney(lineAmount(row))}</TableCell>
              <TableCell>
                <TextField size="small" value={row.remark || ''} disabled={!editable} onChange={(e) => updateRow(index, 'remark', e.target.value)} />
              </TableCell>
              <TableCell>
                {editable ? (
                  <Stack direction="row" spacing={0.5}>
                    <IconButton size="small" color="primary" onClick={() => saveRow(index)} title="保存">
                      <SaveIcon />
                    </IconButton>
                    {row.id && (
                      <IconButton size="small" color="error" onClick={() => deleteRow(row.id)} title="删除">
                        <DeleteIcon />
                      </IconButton>
                    )}
                  </Stack>
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    {roundLocked ? '已锁定' : '只读'}
                  </Typography>
                )}
              </TableCell>
            </TableRow>
          ))}
          {editable && (
            <TableRow>
              <TableCell colSpan={10}>
                <Button size="small" startIcon={<AddIcon />} onClick={() => setRows((prev) => [...prev, { ...EMPTY_ITEM }])}>
                  新增明细
                </Button>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {!readOnly && order.status === 'quotation' && activeRound && (
        <Stack direction="row" spacing={1.5} sx={{ mt: 2, justifyContent: 'flex-end' }}>
          {editable && (
            <>
              <Button variant="contained" onClick={submitRound} disabled={busy}>
                提交本轮报价
              </Button>
              {Number(order.proposal_skipped) !== 1 && (
                <Button variant="outlined" startIcon={<SyncIcon />} onClick={() => setSyncOpen(true)}>
                  从方案同步
                </Button>
              )}
            </>
          )}
        </Stack>
      )}

      {!readOnly && order.status === 'quotation' && (
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mt: 3, p: 2, bgcolor: 'action.hover', borderRadius: 2, alignItems: 'center' }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            提交审批：
          </Typography>
          <FormControl size="small" sx={{ minWidth: 240 }}>
            <InputLabel>选择已提交轮次</InputLabel>
            <Select value={submitRoundId} label="选择已提交轮次" onChange={(e) => setSubmitRoundId(e.target.value)}>
              {submittedRounds.map((round) => (
                <MenuItem key={round.id} value={round.id}>
                  {round.round_label || `R${round.round_no}`}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button variant="contained" color="secondary" onClick={submitApproval}>
            提交审批
          </Button>
        </Stack>
      )}

      <Dialog open={syncOpen} onClose={() => setSyncOpen(false)}>
        <DialogTitle>从方案同步</DialogTitle>
        <DialogContent>
          <DialogContentText>同步将覆盖当前轮次明细，框架协议价/指导价按最新价格重算，手工价保留原价。是否继续？</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSyncOpen(false)}>取消</Button>
          <Button color="primary" onClick={syncFromProposal}>
            确认同步
          </Button>
        </DialogActions>
      </Dialog>
    </StepWrapper>
  );
}
