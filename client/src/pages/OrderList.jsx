import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Autocomplete from '@mui/material/Autocomplete';
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
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import { useTheme } from '@mui/material/styles';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
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
  const theme = useTheme();
  const confirm = useConfirm();
  const { t } = useFieldLabels();
  const saved = loadSaved();
  const [search, setSearch] = useState(saved.search || '');
  const [scope, setScope] = useState(saved.scope || 'active');
  const [page, setPage] = useState(saved.page && Number(saved.page) > 0 ? Number(saved.page) : 1);
  const [pageSize, setPageSize] = useState(saved.page_size && Number(saved.page_size) > 0 ? Number(saved.page_size) : 10);
  const [customer, setCustomer] = useState(saved.customer || '');
  const [year, setYear] = useState(saved.year || '');
  const [month, setMonth] = useState(saved.month || '');
  const [customerOptions, setCustomerOptions] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const isDark = theme.palette.mode === 'dark';
  const BLOCK = {
    closed: { bg: isDark ? 'rgba(129, 199, 132, 0.16)' : 'rgba(46, 125, 50, 0.12)', color: isDark ? '#81C784' : '#2E7D32' },
    cancelled: { bg: isDark ? 'rgba(176, 190, 197, 0.16)' : 'rgba(120, 144, 156, 0.14)', color: isDark ? '#B0BEC5' : '#607D8B' },
    amber: { bg: isDark ? 'rgba(255, 213, 79, 0.16)' : 'rgba(249, 168, 37, 0.14)', color: isDark ? '#FFD54F' : '#B26A00' },
    urgent: { bg: isDark ? 'rgba(255, 138, 128, 0.16)' : 'rgba(211, 47, 47, 0.12)', color: isDark ? '#FF8A80' : '#C62828' },
    none: { bg: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(120, 144, 156, 0.12)', color: isDark ? '#90A4AE' : '#78909C' }
  };
  const filterInputSx = {
    '& .MuiOutlinedInput-root': { borderRadius: 2.5, bgcolor: 'background.paper' },
    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
    '& .MuiInputBase-input': { fontSize: 14, fontWeight: 500, textOverflow: 'ellipsis' },
    '& .Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.main', borderWidth: 1.5 }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: pageSize };
      params.scope = scope;
      if (search.trim()) params.search = search.trim();
      if (customer.trim()) params.customer = customer.trim();
      if (year) params.year = year;
      if (month) params.month = month;
      const { data: result } = await api.get('/orders', { params });
      setData(result);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, scope, customer, year, month]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ page, page_size: pageSize, scope, search, customer, year, month })
    );
  }, [page, pageSize, scope, search, customer, year, month]);

  useEffect(() => {
    Promise.all([api.get('/end-customers'), api.get('/contract-customers')])
      .then(([endRes, contractRes]) => {
        const names = [
          ...(endRes.data.items || []).map((item) => item.customer_name),
          ...(contractRes.data.items || []).map((item) => item.customer_name)
        ].filter(Boolean);
        setCustomerOptions([...new Set(names)]);
      })
      .catch(() => {});
  }, []);

  const resetFilters = () => {
    setSearch('');
    setCustomer('');
    setYear('');
    setMonth('');
    setPage(1);
  };

  const removeOrder = async (order) => {
    if (!(await confirm(`确认删除销售机会「${order.order_id}」？删除后不可恢复。`))) return;
    setDeletingId(order.id);
    setError('');
    try {
      await api.delete(`/orders/${order.id}`);
      load();
    } catch (err) {
      setError(errorMessage(err, '删除销售机会失败'));
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
          <Typography variant="h5">销售机会</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>
            查看与管理全部销售机会，点击行进入详情
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/orders/new')}>
          新建销售机会
        </Button>
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
                display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'nowrap',
                overflow: 'hidden'
              }}>
                <TextField
                  select
                  size="small"
                  label="年份"
                  value={year}
                  onChange={(e) => {
                    setYear(e.target.value);
                    setPage(1);
                  }}
                  sx={{ width: 85, ...filterInputSx }}
                  SelectProps={{
                    MenuProps: {
                      PaperProps: {
                        sx: {
                          borderRadius: 2.5,
                          '& .MuiMenuItem-root': { fontSize: 14, minHeight: 40, fontWeight: 500 }
                        }
                      }
                    }
                  }}
                >
                  <MenuItem value="">全部</MenuItem>
{Array.from({ length: 7 }, (_, i) => String(new Date().getFullYear() - 3 + i)).map((y) => (
                    <MenuItem key={y} value={y}>
                      {y} 年
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  size="small"
                  label="月份"
                  value={month}
                  onChange={(e) => {
                    setMonth(e.target.value);
                    setPage(1);
                  }}
                  sx={{ width: 85, ...filterInputSx }}
                  SelectProps={{
                    MenuProps: {
                      PaperProps: {
                        sx: {
                          borderRadius: 2.5,
                          '& .MuiMenuItem-root': { fontSize: 14, minHeight: 40, fontWeight: 500 }
                        }
                      }
                    }
                  }}
                >
                  <MenuItem value="">全部</MenuItem>
                  {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((m) => (
                    <MenuItem key={m} value={m}>
                      {m} 月
                    </MenuItem>
                  ))}
                </TextField>
                <Autocomplete
                  size="small"
                  freeSolo
                  options={customerOptions}
                  value={customer}
                  onInputChange={(_, value) => {
                    setCustomer(value || '');
                    setPage(1);
                  }}
                  onChange={(_, value) => {
                    setCustomer(typeof value === 'string' ? value || '' : value?.customer_name || '');
                    setPage(1);
                  }}
                  sx={{ width: 180, flexShrink: 0 }}
                  ListboxProps={{
                    sx: {
                      '& .MuiAutocomplete-option': { fontSize: 14, minHeight: 36, fontWeight: 500 }
                    }
                  }}
                  renderInput={(params) => <TextField {...params} label="客户" sx={filterInputSx} />}
                />
                <TextField
                  size="small"
                  placeholder="项目号 / PO / SO"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  sx={{ flex: 1, minWidth: 140, ...filterInputSx }}
                  InputProps={{ startAdornment: <InputAdornment position="start" sx={{ mr: 0.2 }}><SearchIcon sx={{ fontSize: 18 }} /></InputAdornment> }}
                />
                <Button size="small" variant="text" onClick={resetFilters} sx={{ whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 600, color: 'text.secondary', fontSize: 13, minWidth: 48, '&:hover': { color: 'error.main' } }}>
                  清除
                </Button>
                <IconButton onClick={() => load()} title="刷新" size="small" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, flexShrink: 0 }}>
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
                  sx={{
                    '& th': {
                      bgcolor: isDark ? 'rgba(255,255,255,0.06)' : '#EEF3FA',
                      color: isDark ? '#E0E6EF' : '#1A2B4A',
                      fontWeight: 800,
                      fontSize: 13,
                      whiteSpace: 'nowrap',
                      borderBottom: '2px solid',
                      borderColor: isDark ? 'rgba(255,255,255,0.14)' : '#C7D6E8',
                      py: 1.25
                    }
                  }}
                >
                    <TableCell sx={{ width: 56 }} />
                  <TableCell>机会编号</TableCell>
                    <TableCell>客户信息</TableCell>
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
                    <TableCell>{t('status')}</TableCell>
                    <TableCell align="right">{t('amount')}</TableCell>
                    <TableCell align="right" sx={{ width: 80 }}>操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(data?.items || []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 8, color: 'text.secondary' }}>
                        <Stack spacing={1} alignItems="center">
                          <InboxIcon sx={{ fontSize: 56, color: 'text.disabled' }} />
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {scope === 'archived' ? '暂无存档销售机会' : '暂无进行中的销售机会'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">可调整搜索条件或点击右上角“新建销售机会”</Typography>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  )}
                  {(data?.items || []).map((order) => {
                    const isClosed = ['closed', 'lost_closed', 'cancelled'].includes(order.status);
                    const invoicedDays = Number(order.invoiced) === 1 ? daysSinceDate(order.invoiced_date) : null;
                    const urgent = invoicedDays !== null && invoicedDays >= 100 && !isClosed;
                    const block = order.status === 'cancelled'
                      ? { ...BLOCK.cancelled, icon: <CancelIcon sx={{ fontSize: 15 }} />, text: '', title: '合同取消' }
                      : isClosed && invoicedDays !== null
                        ? { ...BLOCK.closed, icon: <CheckCircleRoundedIcon sx={{ fontSize: 15 }} />, text: '', title: `开票日期：${String(order.invoiced_date).slice(0, 10)}` }
                        : urgent
                          ? { ...BLOCK.urgent, icon: <WarningAmberRoundedIcon sx={{ fontSize: 15 }} />, text: `${invoicedDays}`, title: `开票后 ${invoicedDays} 天` }
                          : invoicedDays !== null
                            ? { ...BLOCK.amber, icon: <ReceiptLongIcon sx={{ fontSize: 15 }} />, text: `${invoicedDays}`, title: `开票后 ${invoicedDays} 天` }
                            : { ...BLOCK.none, icon: <ReceiptLongIcon sx={{ fontSize: 15 }} />, text: '—', title: '未开票' };
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
                            title={block.title}
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px',
                              minWidth: 36,
                              height: 24,
                              px: block.text ? 0.75 : 0.4,
                              borderRadius: 1,
                              bgcolor: block.bg,
                              color: block.color,
                              fontSize: 11,
                              fontWeight: 700,
                              lineHeight: 1,
                              whiteSpace: 'nowrap',
                              userSelect: 'none'
                            }}
                          >
                            {block.icon}
                            {block.text ? <Box component="span">{block.text}</Box> : null}
                          </Box>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Stack spacing={0.25}>
                            <Typography variant="body2" sx={{ fontWeight: 800, color: 'primary.main', fontSize: 13, lineHeight: 1.3 }}>
                              {order.order_id || '-'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, lineHeight: 1.2 }}>
                              {order.year && order.month ? `${order.year}-${String(order.month).padStart(2, '0')}` : order.year || order.month || '-'}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap', minWidth: 180 }}>
                          <Stack spacing={0.25}>
                            <Typography variant="body2" sx={{ fontWeight: 800, fontSize: 13, lineHeight: 1.3, color: 'text.primary' }}>
                              {order.end_customer_name || '-'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, lineHeight: 1.2 }}>
                              {order.contract_customer_name || '-'}
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
                        <TableCell>
                          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                            <StatusTag
                              label={STATUS_LABELS[order.status] || order.status}
                              color={STATUS_COLORS[order.status] || '#78909C'}
                              icon={<FiberManualRecordRoundedIcon sx={{ fontSize: 15 }} />}
                            />
                            {order.commission_status === 'warn' && (
                              <StatusTag label="佣金偏差" color="#D32F2F" icon={<WarningAmberRoundedIcon sx={{ fontSize: 15 }} />} />
                            )}
                            {order.commission_status === 'zero' && (
                              <StatusTag label="无佣金" color="#1976D2" icon={<ReceiptLongIcon sx={{ fontSize: 15 }} />} />
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtMoney(order.total_amount)}</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                          <IconButton
                            size="small"
                            color="error"
                            title="删除销售机会"
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
