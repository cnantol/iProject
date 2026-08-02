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
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import api, { errorMessage } from '../api';
import { PRICE_SOURCE_LABELS } from '../utils/constants';
import { fmtMoney, round2, round4, authUrl } from '../utils/helpers';
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
  const [notice, setNotice] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [syncVersionId, setSyncVersionId] = useState(null);
  const [syncState, setSyncState] = useState('idle');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const activeRound = useMemo(() => quotations.find((round) => round.id === activeRoundId) || quotations[quotations.length - 1], [quotations, activeRoundId]);
  const editable = !readOnly && order.status === 'quotation' && activeRound?.status === 'draft';
  const roundLocked = activeRound?.status === 'submitted';

  const load = async () => {
    try {
      const { data } = await api.get(`/orders/${order.id}/quotations`);
      setQuotations(data.items || []);
      setDirty(false);
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
      setDirty(false);
    }
  }, [activeRound]);

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
      setDirty(true);
    } catch {
      // 忽略查询失败
    }
  };

  const updateRow = (index, key, value) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
    setDirty(true);
  };

  const persistItemRow = async (row) => {
    const unitPrice = Number(row.unit_price_ex_vat);
    const qty = Number(row.qty);
    const payPercent = Number(row.pay_percent || 100);
    if (!Number.isFinite(qty) || qty <= 0) throw new Error('数量必须大于 0');
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw new Error('未税单价必须大于 0');
    if (row.price_source === 'guide_price' && (!Number.isFinite(payPercent) || payPercent <= 0 || payPercent > 100)) {
      throw new Error('实付比例必须大于 0 且不超过 100');
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
    if (row.id) {
      await api.put(`/orders/${order.id}/quotations/${activeRound.id}/items/${row.id}`, payload);
    } else {
      await api.post(`/orders/${order.id}/quotations/${activeRound.id}/items`, payload);
    }
  };

  const saveRow = async (index) => {
    setError('');
    try {
      await persistItemRow(rows[index]);
      await load();
    } catch (err) {
      setError(errorMessage(err, '保存失败'));
    }
  };

  const saveAllItems = async () => {
    setError('');
    setNotice('');
    setSaving(true);
    const validRows = rows.filter((row) => row.material_no || row.qty || row.unit_price_ex_vat);
    const failures = [];
    for (let i = 0; i < validRows.length; i++) {
      try {
        await persistItemRow(validRows[i]);
      } catch (err) {
        failures.push(`第 ${i + 1} 行：${errorMessage(err, err.message)}`);
      }
    }
    await load();
    setSaving(false);
    if (failures.length > 0) {
      setError(`部分行保存失败：${failures.join('；')}`);
    } else {
      setNotice(`批量保存完成：${validRows.length} 条`);
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
    setError('');
    try {
      const { data } = await api.post(`/orders/${order.id}/quotations`, { round_label: '' });
      setActiveRoundId(data.id);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const deleteRound = async () => {
    if (!window.confirm(`确认删除报价轮次「${activeRound.round_label || `R${activeRound.round_no}`}」？已提交或被审批引用的轮次不可删除。`)) return;
    setError('');
    try {
      await api.delete(`/orders/${order.id}/quotations/${activeRound.id}`);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const importItems = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    setError('');
    setNotice('');
    try {
      const { data } = await api.post(`/orders/${order.id}/quotations/${activeRound.id}/items/import`, formData);
      setNotice(`导入完成：成功 ${data.success_rows} 行，失败 ${data.fail_rows} 行`);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const submitPaste = async () => {
    const nos = pasteText
      .split(/[\n\t,，;；\s]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (nos.length === 0) {
      setError('请粘贴至少一个物料号');
      return;
    }
    setError('');
    setNotice('');
    try {
      const { data } = await api.post(`/orders/${order.id}/quotations/${activeRound.id}/items/bulk`, { material_nos: nos });
      setNotice(`粘贴录入完成：新增 ${data.created} 条明细`);
      setPasteOpen(false);
      setPasteText('');
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
    setSyncState('syncing');
    setError('');
    try {
      const { data } = await api.post(`/orders/${order.id}/quotations/${activeRound.id}/sync-from-proposal`, { version_id: syncVersionId || undefined });
      setRows(
        (data.items || []).map((item) => ({
          ...item,
          _qty: String(item.qty),
          _unit_price: item.unit_price_ex_vat == null ? '' : String(item.unit_price_ex_vat)
        }))
      );
      setNotice(`同步完成：明细 ${(data.items || []).length} 条，合计 ¥ ${fmtMoney(data.total_amount)}`);
      setSyncOpen(false);
      await load();
      setSyncState('idle');
    } catch (err) {
      setError(errorMessage(err));
      setSyncState('error');
    }
  };

  const exportPdf = async () => {
    try {
      const { data } = await api.post(`/orders/${order.id}/quotations/${activeRound.id}/pdf`, {});
      window.open(authUrl(data.url), '_blank');
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

  const approvableRounds = quotations.filter(
    (round) => round.status === 'submitted' || (order.approvals || []).some((approval) => approval.quotation_id === round.id)
  );

  useEffect(() => {
    if (!submitRoundId && approvableRounds.length === 1) {
      setSubmitRoundId(approvableRounds[0].id);
    }
  }, [approvableRounds, submitRoundId]);

  const invalidRows = rows.filter((row) => {
    const qty = Number(row.qty);
    if (!Number.isFinite(qty) || qty <= 0) return true;
    const price = Number(row.unit_price_ex_vat);
    if (!Number.isFinite(price) || price <= 0) return true;
    if (row.price_source === 'guide_price') {
      const pct = Number(row.pay_percent || 100);
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return true;
    }
    return false;
  });
  const unsavedCount = rows.filter((row) => !row.id).length;
  const allSavedAndValid = !dirty && unsavedCount === 0 && invalidRows.length === 0;
  const readyToSubmit = rows.length > 0 && allSavedAndValid;
  const saveStatus = roundLocked
    ? { label: '已提交（锁定）', color: '#1E7A46' }
    : rows.length === 0
      ? { label: '暂无明细', color: '#78909C' }
      : allSavedAndValid
        ? { label: '明细已保存，可提交报价', color: '#1E7A46' }
        : invalidRows.length > 0 && !dirty && unsavedCount === 0
          ? { label: `存在 ${invalidRows.length} 行无效明细`, color: '#C33D3D' }
          : { label: unsavedCount > 0 ? `有 ${unsavedCount} 行未保存` : '有未保存修改', color: '#B26A00' };
  const displayTotal = rows.reduce((sum, row) => {
    const value = lineAmount(row);
    return value == null ? sum : sum + value;
  }, 0);

  return (
    <StepWrapper title="报价阶段" subtitle="多轮报价、价格计算与提交审批" readOnly={readOnly}>
      {error && (
        <Box sx={{ mb: 2 }}>
          <Alert severity="error">{error}</Alert>
        </Box>
      )}
      {notice && (
        <Box sx={{ mb: 2 }}>
          <Alert severity="success" onClose={() => setNotice('')}>
            {notice}
          </Alert>
        </Box>
      )}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }} alignItems="center">
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
            label={`合计：¥ ${fmtMoney(rows.length > 0 ? displayTotal : activeRound.total_amount)}`}
            color={roundLocked ? 'success' : 'default'}
            variant={roundLocked ? 'filled' : 'outlined'}
          />
        )}
        {activeRound && (
          <Chip
            icon={<Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: saveStatus.color }} />}
            label={saveStatus.label}
            sx={{ color: saveStatus.color, bgcolor: `${saveStatus.color}1A`, border: `1px solid ${saveStatus.color}38`, fontWeight: 700 }}
          />
        )}
        <Box sx={{ flex: 1 }} />
          {!readOnly && order.status === 'quotation' && (
            <>
              <Button size="small" variant="contained" startIcon={<SaveIcon />} onClick={saveAllItems} disabled={saving}>
                批量保存
              </Button>
              <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={addRound}>
                新增轮次
              </Button>
              <Button size="small" variant="outlined" component="label" startIcon={<UploadFileIcon />}>
                批量导入
                <input type="file" hidden accept=".xlsx,.xls" onChange={importItems} />
              </Button>
              <Button size="small" variant="outlined" startIcon={<ContentPasteIcon />} onClick={() => setPasteOpen(true)}>
                粘贴录入
              </Button>
              <IconButton size="small" color="error" onClick={deleteRound} title="删除当前轮次">
                <DeleteIcon />
              </IconButton>
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
            <TableCell sx={{ width: 120 }}>操作</TableCell>
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
        <Stack direction="row" spacing={1.5} sx={{ mt: 2, justifyContent: 'flex-end', flexWrap: 'wrap', rowGap: 1 }}>
          {editable && (
            <>
              <Button
                variant="contained"
                onClick={submitRound}
                disabled={busy || !readyToSubmit}
                title={readyToSubmit ? undefined : '请先保存并完善全部明细后再提交'}
              >
                提交本轮报价
              </Button>
              {Number(order.proposal_skipped) !== 1 && (
                <Button
                  variant="outlined"
                  startIcon={<SyncIcon />}
                  onClick={() => {
                    const versions = order.versions || [];
                    setSyncVersionId(versions.length ? versions[versions.length - 1].id : null);
                    setSyncOpen(true);
                  }}
                >
                  从方案同步
                </Button>
              )}
            </>
          )}
        </Stack>
      )}

      {!readOnly && order.status === 'quotation' && (
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mt: 3, p: 2, bgcolor: 'action.hover', borderRadius: 2, alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            提交审批：
          </Typography>
          <FormControl size="small" sx={{ minWidth: 240 }}>
            <InputLabel>选择要审批的轮次</InputLabel>
            <Select value={submitRoundId} label="选择要审批的轮次" onChange={(e) => setSubmitRoundId(e.target.value)}>
              {approvableRounds.map((round) => (
                <MenuItem key={round.id} value={round.id}>
                  {round.round_label || `R${round.round_no}`}（{round.status === 'submitted' ? '已提交' : '驳回后重提'}）
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
          <Stack spacing={2} sx={{ mt: 1, minWidth: 360 }}>
            <FormControl fullWidth size="small">
              <InputLabel>选择方案版本</InputLabel>
              <Select value={syncVersionId || ''} label="选择方案版本" onChange={(e) => setSyncVersionId(Number(e.target.value))}>
                {(order.versions || []).map((version) => (
                  <MenuItem key={version.id} value={version.id}>
                    {version.version_label || `版本 #${version.sort_order}`}（选型 {(version.selections || []).length} 条）
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <DialogContentText>
              仅同步物料号与数量：标准物料描述与价格按当前价格逻辑自动生成，非标物料保留方案类型与描述，手工价保留原价。同步将覆盖当前轮次明细。
            </DialogContentText>
            {syncState === 'syncing' && (
              <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={18} />
                <Typography variant="body2" color="text.secondary">
                  正在同步，请稍候…
                </Typography>
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSyncOpen(false)} disabled={syncState === 'syncing'}>
            取消
          </Button>
          <Button color="primary" onClick={syncFromProposal} disabled={syncState === 'syncing'}>
            {syncState === 'syncing' ? '同步中…' : '确认同步'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={pasteOpen} onClose={() => setPasteOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>粘贴录入报价明细</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            每行一个物料号，支持 Tab / 逗号 / 空格 / 换行分隔；类型默认标准、数量默认 1、描述与价格按价格决策自动带出。
          </Typography>
          <TextField
            multiline
            minRows={6}
            fullWidth
            placeholder={'AC-1001\nAC-2002\nNON-STD-1'}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPasteOpen(false)}>取消</Button>
          <Button variant="contained" onClick={submitPaste}>
            确认录入
          </Button>
        </DialogActions>
      </Dialog>
    </StepWrapper>
  );
}
