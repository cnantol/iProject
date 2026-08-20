import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Pagination from '@mui/material/Pagination';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Tooltip from '@mui/material/Tooltip';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import InboxIcon from '@mui/icons-material/Inbox';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CancelIcon from '@mui/icons-material/Cancel';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import FiberManualRecordRoundedIcon from '@mui/icons-material/FiberManualRecordRounded';
import api, { errorMessage } from '../api';
import { useConfirm } from '../components/ConfirmDialog';
import { STATUS_LABELS, STATUS_COLORS } from '../utils/constants';
import { daysSinceDate, fmtMoney } from '../utils/helpers';
import { useFieldLabels } from '../utils/fieldLabels';
import { downloadFile } from '../utils/download';
import { tableHeadTokens } from '../theme/md3Theme';

const STORAGE_KEY = 'iproject_order_list_v1';

function loadSaved() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function StatusTag({ label, color, icon }) {
  return (
    <Chip
      size="small"
      label={label}
      icon={icon}
      sx={{
        height: 24,
        borderRadius: 1.5,
        px: 0.5,
        fontWeight: 800,
        fontSize: 12,
        lineHeight: 1,
        color,
        bgcolor: `${color}1F`,
        border: `1px solid ${color}66`,
        '& .MuiChip-icon': { fontSize: 15, color: 'inherit' }
      }}
    />
  );
}

export default function OrderList() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { t } = useFieldLabels();
  const saved = loadSaved();
  const [search, setSearch] = useState(saved.search || '');
  const [debouncedSearch, setDebouncedSearch] = useState(saved.search || '');
  // 输入防抖: 停止输入 300ms 后才触发查询, 避免每按键一次请求
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const [scope, setScope] = useState(saved.scope || 'active');
  const [page, setPage] = useState(saved.page && Number(saved.page) > 0 ? Number(saved.page) : 1);
  const [pageSize, setPageSize] = useState(saved.page_size && Number(saved.page_size) > 0 ? Number(saved.page_size) : 10);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  // 请求序号守卫: 只采纳最后一次请求的结果, 防止慢响应覆盖新数据
  const loadSeq = useRef(0);
  // 状态调色板:通过 theme 回调按 mode 返回对应色值,避免顶层 isDark 取值时机不当导致白屏
  const BLOCK = {
    closed:    { darkBg: 'rgba(129, 199, 132, 0.16)', lightBg: 'rgba(46, 125, 50, 0.12)',  darkColor: '#81C784', lightColor: '#2E7D32' },
    cancelled: { darkBg: 'rgba(176, 190, 197, 0.16)', lightBg: 'rgba(120, 144, 156, 0.14)', darkColor: '#B0BEC5', lightColor: '#607D8B' },
    amber:     { darkBg: 'rgba(255, 213, 79, 0.16)',  lightBg: 'rgba(249, 168, 37, 0.14)',  darkColor: '#FFD54F', lightColor: '#B26A00' },
    urgent:    { darkBg: 'rgba(255, 138, 128, 0.16)', lightBg: 'rgba(211, 47, 47, 0.12)',   darkColor: '#FF8A80', lightColor: '#C62828' },
    none:      { darkBg: 'rgba(255, 255, 255, 0.08)', lightBg: 'rgba(120, 144, 156, 0.12)', darkColor: '#90A4AE', lightColor: '#78909C' }
  };
  const blockFor = (key, theme) => {
    const p = BLOCK[key];
    const dark = theme.palette.mode === 'dark';
    return { bg: dark ? p.darkBg : p.lightBg, color: dark ? p.darkColor : p.lightColor };
  };
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const params = { page, limit: pageSize };
      params.scope = scope;
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      const { data: result } = await api.get('/orders', { params });
      if (seq !== loadSeq.current) return; // 已有更新的请求, 丢弃本次结果
      setData(result);
      setError('');
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(err.response?.data?.error || '加载失败');
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, scope]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ page, page_size: pageSize, scope, search })
    );
  }, [page, pageSize, scope, search]);

  const resetFilters = () => {
    setSearch('');
    setPage(1);
  };

  const removeOrder = async (order) => {
    if (!(await confirm(`确认删除商机「${order.order_id}」？删除后不可恢复。`))) return;
    setDeletingId(order.id);
    setError('');
    try {
      await api.delete(`/orders/${order.id}`);
      load();
    } catch (err) {
      setError(errorMessage(err, '删除商机失败'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        justifyContent="space-between"
        spacing={1.5}
        sx={{ flexWrap: 'wrap', rowGap: 1 }}
      >
        <Box>
          <Typography variant="h5">商机管理</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>
            查看与管理全部商机，点击行进入详情
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => downloadFile('/api/orders/export', '商机备份.xlsx')}>
            导出 Excel
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/orders/new')}>
            新建商机
          </Button>
        </Stack>
      </Stack>
      <Card>
            <Box sx={{ 
              display: 'flex', alignItems: 'center', 
              borderBottom: 1, borderColor: 'divider',
              minHeight: 46
            }}>
              <Tabs
                value={scope}
                onChange={(_, value) => {
                  setScope(value);
                  setPage(1);
                }}
                sx={{
                  px: 1.5,
                  minHeight: 46,
                  '& .MuiTabs-indicator': { height: 3, borderRadius: 2 },
                  '& .MuiTab-root': { minHeight: 46, fontWeight: 700, textTransform: 'none', py: 0 }
                }}
              >
                <Tab label={`进行中${data ? `（${data.activeCount ?? 0}）` : ''}`} value="active" />
                <Tab label={`存档${data ? `（${data.archivedCount ?? 0}）` : ''}`} value="archived" />
              </Tabs>
              <Box sx={{ 
                flex: 1, px: 1.5, py: 0.75,
                display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'nowrap',
                overflow: 'hidden'
              }}>
                <TextField
                  size="small"
                  placeholder="搜索商机 ID、客户、项目、PO、SO、年份、月份，多条件用空格"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  sx={{
                    flex: 1,
                    minWidth: 260,
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 3,
                      bgcolor: 'background.paper',
                      transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
                      '&:hover': { boxShadow: '0 2px 10px rgba(25,118,210,0.15)' },
                      '&.Mui-focused': { boxShadow: '0 0 0 3px rgba(25,118,210,0.18)' }
                    },
                    '& .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'rgba(25,118,210,0.35)',
                      borderWidth: 1.5
                    },
                    '& .Mui-focused .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'primary.main',
                      borderWidth: 2
                    },
                    '& .MuiInputBase-input': { fontSize: 14, fontWeight: 500, py: 1 },
                    '& .MuiInputBase-input::placeholder': {
                      color: 'primary.main',
                      opacity: 0.8,
                      fontWeight: 600,
                      fontSize: 13.5
                    }
                  }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start" sx={{ mr: 0.5 }}>
                        <SearchIcon sx={{ fontSize: 22, color: 'primary.main' }} />
                      </InputAdornment>
                    )
                  }}
                />
                <Button
                  size="small"
                  variant="outlined"
                  onClick={resetFilters}
                  sx={{
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    fontWeight: 700,
                    fontSize: 13,
                    borderRadius: 2.5,
                    borderColor: 'divider',
                    color: 'text.secondary',
                    minWidth: 60,
                    '&:hover': { borderColor: 'error.main', color: 'error.main', bgcolor: 'rgba(211,47,47,0.04)' }
                  }}
                >
                  清除
                </Button>
                <IconButton
                  onClick={() => load()}
                  title="刷新"
                  size="small"
                  sx={{ border: '1.5px solid', borderColor: 'divider', borderRadius: 2, flexShrink: 0, transition: 'all 0.2s ease', '&:hover': { bgcolor: 'primary.main', color: '#fff', borderColor: 'primary.main' } }}
                >
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </Box>
            </Box>


        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ m: 2 }}>
            {error}
          </Alert>
        ) : (

          <>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 1080 }}>
                <TableHead>
                <TableRow
                  sx={(theme) => {
                    const tk = tableHeadTokens[theme.palette.mode];
                    return {
                      '& th': {
                        bgcolor: tk.bg,
                        color: tk.color,
                        fontWeight: 800,
                        fontSize: 13,
                        whiteSpace: 'nowrap',
                        borderBottom: '2px solid',
                        borderColor: tk.border,
                        py: 1.25
                      }
                    };
                  }}
                >
                    <TableCell sx={{ width: 56 }} />
                  <TableCell align="center">ID</TableCell>
                    <TableCell align="center">客户信息</TableCell>
                    <TableCell align="center">车间/负责人</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <Typography variant="body2" sx={{ fontWeight: 800, fontSize: 13 }}>项目信息</Typography>
                        <Typography variant="caption" sx={{ fontSize: 11, color: 'text.secondary' }}>类型/编号/名称</Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Stack spacing={0.25}>
                        <Typography variant="body2" sx={{ fontWeight: 800, fontSize: 13, lineHeight: 1.3, color: 'primary.main' }}>PO</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 800, fontSize: 13, lineHeight: 1.3, color: 'text.primary' }}>SO</Typography>
                      </Stack>
                    </TableCell>
                    <TableCell align="center">
                      <Stack spacing={0.25} alignItems="center">
                        <Typography variant="body2" sx={{ fontWeight: 800, fontSize: 13, lineHeight: 1.3 }}>
                          {scope === 'archived' ? '佣金状态' : '流程状态'}
                        </Typography>
                        <Typography variant="caption" sx={{ fontSize: 11, color: 'text.secondary', lineHeight: 1.2 }}>
                          {t('amount')}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell align="center" sx={{ width: 80 }}>操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(data?.items || []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 8, color: 'text.secondary' }}>
                        <Stack spacing={1} alignItems="center">
                          <InboxIcon sx={{ fontSize: 56, color: 'text.disabled' }} />
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {scope === 'archived' ? '暂无归档商机' : '暂无进行中的商机'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">可调整搜索条件或点击右上角“新建商机”</Typography>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  )}
                  {(data?.items || []).map((order) => {
                    const isClosed = ['closed', 'lost_closed', 'cancelled'].includes(order.status);
                    const invoicedDays = Number(order.invoiced) === 1 ? daysSinceDate(order.invoiced_date) : null;
                    const urgent = invoicedDays !== null && invoicedDays >= 100 && !isClosed;
                    // 先确定状态 key,具体色值由 blockFor(key, theme) 在 sx 回调里按 mode 取值
                    const blockKey = order.status === 'cancelled'
                      ? 'cancelled'
                      : isClosed && invoicedDays !== null
                        ? 'closed'
                        : urgent
                          ? 'urgent'
                          : invoicedDays !== null
                            ? 'amber'
                            : 'none';
                    const blockMeta = {
                      cancelled: { icon: <CancelIcon sx={{ fontSize: 15 }} />, text: '', title: '合同取消' },
                      closed:    { icon: <CheckCircleRoundedIcon sx={{ fontSize: 15 }} />, text: '', title: `开票日期：${String(order.invoiced_date).slice(0, 10)}` },
                      urgent:    { icon: <WarningAmberRoundedIcon sx={{ fontSize: 15 }} />, text: `${invoicedDays}`, title: `开票后 ${invoicedDays} 天` },
                      amber:     { icon: <ReceiptLongIcon sx={{ fontSize: 15 }} />, text: `${invoicedDays}`, title: `开票后 ${invoicedDays} 天` },
                      none:      { icon: <ReceiptLongIcon sx={{ fontSize: 15 }} />, text: '—', title: '未开票' }
                    };
                    return (
                      <TableRow
                        key={order.id}
                        hover
                        sx={{ cursor: 'pointer', transition: 'background-color 0.15s ease' }}
                        onClick={() => navigate(`/orders/${order.id}`)}
                      >
                        <TableCell sx={{ width: 56, p: 0.5, textAlign: 'center', verticalAlign: 'middle' }}>
                          <Box
                            component="span"
                            title={blockMeta[blockKey].title}
                            sx={(theme) => {
                              const c = blockFor(blockKey, theme);
                              return {
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px',
                                minWidth: 36,
                                height: 24,
                                px: blockMeta[blockKey].text ? 0.75 : 0.4,
                                borderRadius: 1,
                                bgcolor: c.bg,
                                color: c.color,
                                fontSize: 11,
                                fontWeight: 700,
                                lineHeight: 1,
                                whiteSpace: 'nowrap',
                                userSelect: 'none'
                              };
                            }}
                          >
                            {blockMeta[blockKey].icon}
                            {blockMeta[blockKey].text ? <Box component="span">{blockMeta[blockKey].text}</Box> : null}
                          </Box>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap', textAlign: 'center', verticalAlign: 'middle' }}>
                          <Stack spacing={0.25} alignItems="center">
                            <Tooltip title={order.order_id || '-'} arrow placement="top">
                              <Typography variant="body2" sx={{ fontWeight: 800, color: 'primary.main', fontSize: 13, lineHeight: 1.3 }}>
                                {order.order_id || '-'}
                              </Typography>
                            </Tooltip>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, lineHeight: 1.2 }}>
                              {order.year && order.month ? `${order.year}-${String(order.month).padStart(2, '0')}` : order.year || order.month || '-'}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap', minWidth: 180, textAlign: 'center', verticalAlign: 'middle' }}>
                          <Stack spacing={0.25} alignItems="center">
                            <Typography variant="body2" sx={{ fontWeight: 800, fontSize: 13, lineHeight: 1.3, color: 'text.primary' }}>
                              {order.end_customer_name || '-'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, lineHeight: 1.2 }}>
                              {order.contract_customer_name || '-'}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap', textAlign: 'center', verticalAlign: 'middle' }}>
                          <Stack spacing={0.25} alignItems="center">
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, lineHeight: 1.2 }}>
                              {order.workshop || '-'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, lineHeight: 1.2 }}>
                              {order.project_owner || '-'}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Stack direction="row" spacing={0.75} alignItems="center">
                            {order.order_type && (
                              <Box sx={{
                                width: 24, height: 24, borderRadius: 1,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: 800, fontSize: 12,
                                color: { A: '#1976D2', B: '#2E7D32', C: '#C9A227' }[order.order_type] || '#78909C',
                                bgcolor: ({ A: '#1976D2', B: '#2E7D32', C: '#C9A227' }[order.order_type] || '#78909C') + '1F',
                                border: '1px solid ' + ({ A: '#1976D2', B: '#2E7D32', C: '#C9A227' }[order.order_type] || '#78909C') + '66',
                                flexShrink: 0,
                              }}>
                                {order.order_type}
                              </Box>
                            )}
                            <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                              <Typography variant="body2" sx={{ fontWeight: 800, fontSize: 13, lineHeight: 1.3, color: 'text.primary' }}>
                                {order.project_no || '-'}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
                                {order.project_name || '-'}
                              </Typography>
                            </Stack>
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Stack spacing={0.25}>
                            <Typography variant="body2" sx={{ fontWeight: 800, fontSize: 13, lineHeight: 1.3, color: 'primary.main' }}>
                              {order.po_numbers || '-'}
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 800, fontSize: 13, lineHeight: 1.3, color: 'text.primary' }}>
                              {order.sales_order || '-'}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ textAlign: 'center', verticalAlign: 'middle' }}>
                          <Stack spacing={0.5} alignItems="center">
                            <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                              {scope === 'archived' ? (
                                <>
                                  {order.commission_status === 'warn' && (
                                    <StatusTag label="佣金偏差" color="#D32F2F" icon={<WarningAmberRoundedIcon sx={{ fontSize: 15 }} />} />
                                  )}
                                  {order.commission_status === 'zero' && (
                                    <StatusTag label="无佣金" color="#1976D2" icon={<ReceiptLongIcon sx={{ fontSize: 15 }} />} />
                                  )}
                                </>
                              ) : (
                                <StatusTag
                                  label={STATUS_LABELS[order.status] || order.status}
                                  color={STATUS_COLORS[order.status] || '#78909C'}
                                  icon={<FiberManualRecordRoundedIcon sx={{ fontSize: 15 }} />}
                                />
                              )}
                            </Stack>
                            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3, color: 'text.primary' }}>
                              {fmtMoney(order.total_amount)}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                          <IconButton
                            size="small"
                            color="error"
                            title="删除商机"
                            disabled={deletingId === order.id}
                            onClick={() => removeOrder(order)}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
            {(data?.total || 0) > 0 && (
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                spacing={1.5}
                flexWrap="wrap"
                useFlexGap
                sx={{ py: 1.5, px: 2, borderTop: 1, borderColor: 'divider', bgcolor: 'action.hover' }}
              >
                <Typography variant="body2" color="text.secondary">共 {data?.total || 0} 条</Typography>
                <Pagination
                  count={Math.max(1, Math.ceil((data?.total || 0) / pageSize))}
                  page={page}
                  onChange={(_, value) => setPage(value)}
                  color="primary"
                />
                <TextField
                  select
                  size="small"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  sx={{
                    width: 116,
                    '& .MuiOutlinedInput-root': { borderRadius: 2.5, bgcolor: 'background.paper' },
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
                    '& .MuiInputBase-input': { fontSize: 13, fontWeight: 600 }
                  }}
                >
                  {[10, 20, 50, 100].map((size) => (
                    <MenuItem key={size} value={size}>
                      {size} 条/页
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
            )}
          </>
        )}
      </Card>
    </Stack>
  );
}
