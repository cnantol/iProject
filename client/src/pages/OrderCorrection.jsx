import { useCallback, useEffect, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CancelIcon from '@mui/icons-material/Cancel';
import CancelPresentationIcon from '@mui/icons-material/CancelPresentation';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteIcon from '@mui/icons-material/Delete';
import DescriptionIcon from '@mui/icons-material/Description';
import EditIcon from '@mui/icons-material/Edit';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import HistoryIcon from '@mui/icons-material/History';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import LockIcon from '@mui/icons-material/Lock';
import PaidIcon from '@mui/icons-material/Paid';
import PersonIcon from '@mui/icons-material/Person';
import RefreshIcon from '@mui/icons-material/Refresh';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import UndoIcon from '@mui/icons-material/Undo';
import api, { errorMessage } from '../api';
import { STATUS_LABELS, STATUS_COLORS } from '../utils/constants';
import { fmtDateTime, fmtMoney } from '../utils/helpers';

const MAIN_STEPS = [
  { key: 'customer_info', label: '客户信息', icon: <PersonIcon fontSize="small" /> },
  { key: 'proposal', label: '方案阶段', icon: <DescriptionIcon fontSize="small" /> },
  { key: 'quotation', label: '报价阶段', icon: <RequestQuoteIcon fontSize="small" /> },
  { key: 'approval_pending', label: '并行审批', icon: <FactCheckIcon fontSize="small" /> },
  { key: 'bid_decision', label: '中标结果', icon: <EmojiEventsIcon fontSize="small" /> },
  { key: 'finance', label: '财务信息', icon: <AccountBalanceIcon fontSize="small" /> },
  { key: 'shipping_invoicing', label: '发货+开票', icon: <LocalShippingIcon fontSize="small" /> },
  { key: 'commission', label: '佣金结算', icon: <PaidIcon fontSize="small" /> },
  { key: 'closed', label: '项目闭环', icon: <LockIcon fontSize="small" /> }
];

const BRANCH_STEPS = [
  { key: 'lost_closed', label: '未中标关闭', icon: <CancelIcon fontSize="small" /> },
  { key: 'cancelled', label: '合同取消', icon: <CancelPresentationIcon fontSize="small" /> }
];

const ARTIFACT_LABELS = [
  ['customerPos', 'PO'],
  ['shippingBatches', '批次'],
  ['invoices', '发票'],
  ['approvals', '审批'],
  ['proposalVersions', '方案'],
  ['quotations', '报价'],
  ['attachments', '附件']
];

function parseDetail(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function StatusChip({ status }) {
  const color = STATUS_COLORS[status] || '#78909C';
  return (
    <Chip
      size="small"
      label={STATUS_LABELS[status] || status}
      sx={{ fontWeight: 700, height: 24, bgcolor: `${color}1F`, color, border: `1px solid ${color}40` }}
    />
  );
}

function Panel({ title, icon, action, children }) {
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper', overflow: 'hidden' }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'rgba(15,23,42,0.02)' }}>
        <Box sx={{ color: 'primary.main', display: 'flex', alignItems: 'center' }}>{icon}</Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 800, flex: 1, minWidth: 0 }}>{title}</Typography>
        {action}
      </Stack>
      <Box sx={{ p: 1.5 }}>{children}</Box>
    </Box>
  );
}

export default function OrderCorrection() {
  const [options, setOptions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [meta, setMeta] = useState(null);
  const [history, setHistory] = useState([]);
  const [target, setTarget] = useState('');
  const [plan, setPlan] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const selectTokenRef = useRef(0);
  const planTokenRef = useRef(0);
  const searchTimerRef = useRef(null);

  const searchOrders = useCallback(async (keyword) => {
    setSearching(true);
    try {
      const params = { scope: 'active', limit: 20 };
      if (keyword.trim()) params.search = keyword.trim();
      const { data } = await api.get('/orders', { params });
      setOptions(data.items || []);
    } catch (err) {
      setError(errorMessage(err, '查询商机失败'));
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    searchOrders('');
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchOrders]);

  const handleInputChange = (_, value) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => searchOrders(value || ''), 350);
  };

  const selectOrder = useCallback(async (order) => {
    const token = ++selectTokenRef.current;
    setSelected(order);
    setMeta(null);
    setHistory([]);
    setTarget('');
    setPlan(null);
    setConfirmed(false);
    setResult(null);
    setError('');
    if (!order) return;
    try {
      const [metaRes, historyRes] = await Promise.all([
        api.get(`/order-corrections/${order.id}`),
        api.get('/audit-logs', {
          params: { action: 'order_rollback', entity_type: 'order', entity_id: order.id, limit: 50 }
        })
      ]);
      if (token !== selectTokenRef.current) return;
      setMeta(metaRes.data);
      setHistory(historyRes.data.items || []);
    } catch (err) {
      if (token === selectTokenRef.current) setError(errorMessage(err, '加载回退选项失败'));
    }
  }, []);

  const chooseTarget = useCallback(async (status) => {
    if (!selected) return;
    const token = ++planTokenRef.current;
    setTarget(status);
    setPlan(null);
    setConfirmed(false);
    setResult(null);
    setError('');
    setPlanLoading(true);
    try {
      const { data } = await api.get(`/order-corrections/${selected.id}/plan`, { params: { target: status } });
      if (token !== planTokenRef.current) return;
      setPlan(data.plan);
    } catch (err) {
      if (token === planTokenRef.current) setError(errorMessage(err, '生成回退方案失败'));
    } finally {
      if (token === planTokenRef.current) setPlanLoading(false);
    }
  }, [selected]);

  const execute = useCallback(async () => {
    if (!selected || !target || !plan) return;
    setExecuting(true);
    setError('');
    setResult(null);
    try {
      await api.put(`/order-corrections/${selected.id}`, {
        target,
        confirm: 1,
        expected_status: plan.currentStatus
      });
      await selectOrder({ id: selected.id, order_id: selected.order_id, project_name: selected.project_name });
      await searchOrders('');
      setResult({ type: 'success', message: `已回退至「${STATUS_LABELS[target] || target}」` });
    } catch (err) {
      setResult({ type: 'error', message: errorMessage(err, '回退失败') });
    } finally {
      setExecuting(false);
    }
  }, [selected, target, plan, selectOrder, searchOrders]);

  const fieldChanges = plan && meta
    ? [
        plan.fieldChanges.sales_order === null && meta.order.sales_order ? { label: 'Sales Order', value: `清除 ${meta.order.sales_order}` } : null,
        plan.fieldChanges.total_amount === null && meta.order.total_amount != null ? { label: '总金额', value: `清除 ${fmtMoney(meta.order.total_amount)}` } : null,
        Number(plan.fieldChanges.delivered) === 0 && Number(meta.order.delivered) === 1 ? { label: '发货状态', value: '重置为未发货' } : null,
        Number(plan.fieldChanges.invoiced) === 0 && Number(meta.order.invoiced) === 1 ? { label: '开票状态', value: '重置为未开票' } : null,
        Number(plan.fieldChanges.commission_matched) === 0 && Number(meta.order.commission_matched) === 1 ? { label: '佣金结算', value: '清除佣金' } : null,
        plan.fieldChanges.bid_result === null && meta.order.bid_result ? { label: '中标结果', value: '清除' } : null,
        plan.fieldChanges.closed_at === null && meta.order.closed_at ? { label: '闭环时间', value: '清除' } : null,
        plan.fieldChanges.selected_round_id === null && meta.order.selected_round_id ? { label: '选中报价轮次', value: '清除' } : null,
        plan.fieldChanges.proposal_skipped === 0 && Number(meta.order.proposal_skipped) === 1 ? { label: '方案跳过', value: '恢复' } : null
      ].filter(Boolean)
    : [];

  const impact = plan
    ? [
        { label: 'Customer PO', count: plan.deletions.customerPos },
        { label: '发货批次', count: plan.deletions.shippingBatches },
        { label: '发票记录', count: plan.deletions.invoices },
        { label: '发票附件', count: plan.deletions.invoiceAttachments || 0 },
        { label: '审批置 superseded', count: plan.supersededApprovals }
      ].filter((item) => item.count > 0)
    : [];

  const hints = [];
  if (plan) {
    if (plan.deletions.customerPos > 0 || plan.deletions.invoices > 0) hints.push('回退后相关 PO/发票/批次将被删除，重新推进前可能需要补录。');
    if (target === 'quotation' && meta && meta.artifacts.quotations > 0) hints.push('已提交报价轮次保留且锁定，可新增轮次后重新送审。');
    if (meta && meta.artifacts.approvals > 0) hints.push('审批历史保留用于追溯，回退后该订单不提供物理删除。');
  }

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box sx={{ width: 40, height: 40, borderRadius: 1.5, bgcolor: 'warning.main', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <UndoIcon fontSize="small" />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>流程撤回</Typography>
          <Typography variant="body2" color="text.secondary">选择商机，在流程图上点击更早步骤执行撤回</Typography>
        </Box>
        <Button size="small" startIcon={<RefreshIcon />} onClick={() => searchOrders('')}>刷新</Button>
      </Stack>

      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, bgcolor: 'background.paper', p: 1.5 }}>
        <Autocomplete
          options={options}
          getOptionLabel={(option) => `${option.order_id} · ${option.end_customer_name || '-'} · ${option.project_name || '-'}`}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          value={selected}
          onChange={(_, value) => selectOrder(value)}
          onInputChange={handleInputChange}
          loading={searching}
          renderInput={(params) => (
            <TextField {...params} label="选择进行中的商机（ID · 最终客户 · 项目名称）" size="small" />
          )}
        />
        {selected && meta && (
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 1.25 }}>
            <StatusChip status={meta.order.status} />
            <Chip size="small" label={`ID ${meta.order.order_id}`} color="primary" sx={{ fontWeight: 700 }} />
            <Chip size="small" label={`客户 ${meta.order.end_customer_name || '-'} / ${meta.order.contract_customer_name || '-'}`} variant="outlined" />
            <Chip size="small" label={`项目 ${meta.order.project_name || '-'}`} variant="outlined" />
            <Chip size="small" label={`PO ${meta.order.po_numbers || '-'}`} variant="outlined" />
            <Chip size="small" label={`金额 ${meta.order.total_amount == null ? '-' : fmtMoney(meta.order.total_amount)}`} variant="outlined" />
            <Chip size="small" label={`SO ${meta.order.sales_order || '-'}`} variant="outlined" />
            <Chip size="small" label={`已回退 ${history.length} 次`} color={history.length > 0 ? 'warning' : 'default'} variant={history.length > 0 ? 'filled' : 'outlined'} sx={{ fontWeight: 700 }} />
          </Stack>
        )}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(440px, 500px) minmax(0, 1fr)' }, gap: 1.5, alignItems: 'start' }}>
        <Panel title="完整流程" icon={<HistoryIcon fontSize="small" />} action={
          <Stack direction="row" spacing={1}>
            <Stack direction="row" spacing={0.5} alignItems="center"><Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main' }} /><Typography variant="caption" color="text.secondary">当前</Typography></Stack>
            <Stack direction="row" spacing={0.5} alignItems="center"><Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'warning.main' }} /><Typography variant="caption" color="text.secondary">可撤回</Typography></Stack>
          </Stack>
        }>
          {!selected || !meta ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>请先选择商机</Typography>
          ) : (
            <Box sx={{ maxWidth: 400, mx: 'auto' }}>
              {MAIN_STEPS.map((step, index) => {
                const isCurrent = step.key === meta.order.status;
                const isTarget = meta.validTargets.includes(step.key);
                const isLast = index === MAIN_STEPS.length - 1;
                return (
                  <Box key={step.key} sx={{ display: 'flex', gap: 1.25 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 44, flexShrink: 0 }}>
                      <Tooltip title={isTarget ? `撤回至${step.label}` : isCurrent ? '当前位置' : '不可撤回'}>
                        <Box
                          component="button"
                          type="button"
                          onClick={() => isTarget && chooseTarget(step.key)}
                          disabled={!isCurrent && !isTarget}
                          sx={{
                            width: 44,
                            height: 44,
                            borderRadius: '50%',
                            border: '2px solid',
                            borderColor: isCurrent ? 'primary.main' : isTarget ? 'warning.main' : 'divider',
                            bgcolor: isCurrent ? 'primary.main' : isTarget ? 'warning.main' : 'transparent',
                            color: isCurrent || isTarget ? '#fff' : 'text.disabled',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: isTarget ? 'pointer' : 'default',
                            boxShadow: isCurrent || isTarget ? '0 2px 8px rgba(15,23,42,0.12)' : 'none',
                            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                            '&:hover': isTarget ? { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(237,108,2,0.28)' } : {}
                          }}
                        >
                          {step.icon}
                        </Box>
                      </Tooltip>
                      {!isLast && <Box sx={{ width: 2, flex: 1, minHeight: 18, bgcolor: isTarget || isCurrent ? 'warning.light' : 'divider' }} />}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0, pb: isLast ? 0 : 1 }}>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ minHeight: 44, flexWrap: 'wrap', rowGap: 0.5 }}>
                        <Typography
                          variant="body1"
                          sx={{ fontWeight: isCurrent || isTarget ? 800 : 600, color: isCurrent ? 'primary.main' : isTarget ? 'warning.main' : 'text.secondary' }}
                        >
                          {step.label}
                        </Typography>
                        {isCurrent && <Chip size="small" label="当前" color="primary" sx={{ height: 22, fontWeight: 800 }} />}
                        {isTarget && (
                          <Button size="small" variant="outlined" color="warning" startIcon={<UndoIcon />} onClick={() => chooseTarget(step.key)} sx={{ minHeight: 30, fontWeight: 700, textTransform: 'none' }}>
                            撤回
                          </Button>
                        )}
                      </Stack>
                      {step.key === 'bid_decision' && (
                        <Box sx={{ mt: 0.75, ml: 0.5, pl: 1.5, borderLeft: '2px dashed', borderColor: 'divider' }}>
                          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>中标结果分支</Typography>
                          <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap', rowGap: 0.5 }}>
                            {BRANCH_STEPS.map((branch) => {
                              const branchCurrent = branch.key === meta.order.status;
                              return (
                                <Chip
                                  key={branch.key}
                                  size="small"
                                  icon={branch.icon}
                                  label={branchCurrent ? `${branch.label}（当前）` : branch.label}
                                  variant={branchCurrent ? 'filled' : 'outlined'}
                                  color={branchCurrent ? 'error' : 'default'}
                                  sx={{ height: 26, fontWeight: 700 }}
                                />
                              );
                            })}
                          </Stack>
                        </Box>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}
        </Panel>

        <Stack spacing={1.5}>
          {result && (
            <Alert severity={result.type} onClose={() => setResult(null)} sx={{ borderRadius: 1.5 }}>
              {result.message}
            </Alert>
          )}
          <Panel title="流程配置" icon={<CheckCircleIcon fontSize="small" />}>
            {!selected || !meta ? (
              <Typography variant="body2" color="text.secondary">请先选择商机</Typography>
            ) : planLoading ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <CircularProgress size={20} />
                <Typography variant="body2" color="text.secondary">正在生成方案</Typography>
              </Stack>
            ) : !plan ? (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>点击左侧流程图的“撤回”步骤查看影响配置</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 1 }}>
                  {ARTIFACT_LABELS.map(([key, label]) => (
                    <Box key={key} sx={{ p: 1.25, borderRadius: 1.5, bgcolor: 'action.hover', border: 1, borderColor: 'divider', textAlign: 'center' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>{label}</Typography>
                      <Typography variant="h6" sx={{ fontWeight: 800, color: 'primary.main' }}>{meta.artifacts[key] || 0}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            ) : (
              <Box>
                <Box sx={{ p: 1.5, borderRadius: 1.5, border: 1, borderColor: 'warning.main', bgcolor: 'rgba(237,108,2,0.06)', mb: 1.5 }}>
                  <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Box sx={{ width: 40, height: 40, borderRadius: 1.5, bgcolor: 'warning.main', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <UndoIcon fontSize="small" />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 160 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>回退目标</Typography>
                      <Typography variant="h6" sx={{ fontWeight: 800, color: 'warning.main' }}>
                        {STATUS_LABELS[plan.currentStatus] || plan.currentStatus} → {STATUS_LABELS[plan.target] || plan.target}
                      </Typography>
                    </Box>
                    <Chip size="small" label={`商机 ${meta.order.order_id}`} variant="outlined" />
                  </Stack>
                </Box>
                <Grid container spacing={1.5}>
                  <Grid item xs={12} md={6}>
                    <Box sx={{ p: 1.25, borderRadius: 1.5, border: 1, borderColor: 'divider', height: '100%' }}>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                        <EditIcon fontSize="small" color="primary" />
                        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>字段变化</Typography>
                      </Stack>
                      {fieldChanges.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">无字段清理</Typography>
                      ) : (
                        <Stack spacing={0.5}>
                          {fieldChanges.map((row) => (
                            <Stack key={row.label} direction="row" spacing={1} justifyContent="space-between">
                              <Typography variant="body2" color="text.secondary">{row.label}</Typography>
                              <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>{row.value}</Typography>
                            </Stack>
                          ))}
                        </Stack>
                      )}
                    </Box>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Box sx={{ p: 1.25, borderRadius: 1.5, border: 1, borderColor: 'divider', height: '100%' }}>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                        <DeleteIcon fontSize="small" color="error" />
                        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>数据影响</Typography>
                      </Stack>
                      {impact.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">无需删除数据</Typography>
                      ) : (
                        <Stack spacing={0.5}>
                          {impact.map((item) => (
                            <Stack key={item.label} direction="row" spacing={1} justifyContent="space-between">
                              <Typography variant="body2" color="text.secondary">{item.label}</Typography>
                              <Typography variant="body2" sx={{ fontWeight: 800, color: 'error.main' }}>{item.count} 条</Typography>
                            </Stack>
                          ))}
                        </Stack>
                      )}
                    </Box>
                  </Grid>
                </Grid>
                {hints.map((hint) => (
                  <Typography key={hint} variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>· {hint}</Typography>
                ))}
              </Box>
            )}
          </Panel>

          <Panel title="回退操作" icon={<UndoIcon fontSize="small" />}>
            {!selected || !meta ? (
              <Typography variant="body2" color="text.secondary">请先选择商机</Typography>
            ) : (
              <Stack spacing={1.5}>
                <FormControlLabel
                  control={<Checkbox checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} color="warning" />}
                  label={<Typography variant="body2">我已知悉回退影响，确认执行</Typography>}
                />
                <Button
                  variant="contained"
                  color="warning"
                  startIcon={executing ? <CircularProgress size={16} color="inherit" /> : <UndoIcon />}
                  disabled={!confirmed || !target || !plan || executing}
                  onClick={execute}
                  sx={{ alignSelf: 'flex-start', minHeight: 40 }}
                >
                  {executing ? '执行中...' : target ? `执行回退至${STATUS_LABELS[target] || target}` : '请先选择回退目标'}
                </Button>
              </Stack>
            )}
          </Panel>

          <Panel title="回退历史" icon={<HistoryIcon fontSize="small" />} action={<Chip size="small" label={`${history.length} 条`} variant="outlined" />}>
            {history.length === 0 ? (
              <Typography variant="body2" color="text.secondary">尚未执行过回退</Typography>
            ) : (
              <TableContainer sx={{ maxHeight: 220 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>时间</TableCell>
                      <TableCell>操作人</TableCell>
                      <TableCell>路径</TableCell>
                      <TableCell>影响</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {history.map((item) => {
                      const detail = parseDetail(item.detail);
                      return (
                        <TableRow key={item.id} hover>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDateTime(item.created_at)}</TableCell>
                          <TableCell>{item.username || '-'}</TableCell>
                          <TableCell>
                            {detail
                              ? `${STATUS_LABELS[detail.from_status] || detail.from_status} → ${STATUS_LABELS[detail.target_status] || detail.target_status}`
                              : '-'}
                          </TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>
                            {detail
                              ? `PO ${detail.deletions?.customerPos || 0} · 发票 ${detail.deletions?.invoices || 0} · 审批 ${detail.superseded_approvals || 0}`
                              : '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Panel>
        </Stack>
      </Box>
    </Stack>
  );
}
