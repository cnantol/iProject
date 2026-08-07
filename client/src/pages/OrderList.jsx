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
import api, { errorMessage } from '../api';
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

export default function OrderList() {
  const navigate = useNavigate();
  const theme = useTheme();
  const { t } = useFieldLabels();
  const saved = loadSaved();
  const [search, setSearch] = useState(saved.search || '');
  const [scope, setScope] = useState(saved.scope || 'active');
  const [page, setPage] = useState(saved.page && Number(saved.page) > 0 ? Number(saved.page) : 1);
  const [pageSize, setPageSize] = useState(saved.page_size && Number(saved.page_size) > 0 ? Number(saved.page_size) : 10);
  const [endCustomerId, setEndCustomerId] = useState(saved.end_customer_id || '');
  const [contractCustomerId, setContractCustomerId] = useState(saved.contract_customer_id || '');
  const [year, setYear] = useState(saved.year || '');
  const [month, setMonth] = useState(saved.month || '');
  const [endCustomers, setEndCustomers] = useState([]);
  const [contractCustomers, setContractCustomers] = useState([]);
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
      if (endCustomerId) params.end_customer_id = endCustomerId;
      if (contractCustomerId) params.contract_customer_id = contractCustomerId;
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
  }, [page, pageSize, search, scope, endCustomerId, contractCustomerId, year, month]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ page, page_size: pageSize, scope, search, end_customer_id: endCustomerId, contract_customer_id: contractCustomerId, year, month })
    );
  }, [page, pageSize, scope, search, endCustomerId, contractCustomerId, year, month]);

  useEffect(() => {
    Promise.all([api.get('/end-customers'), api.get('/contract-customers')])
      .then(([endRes, contractRes]) => {
        setEndCustomers(endRes.data.items || []);
        setContractCustomers(contractRes.data.items || []);
      })
      .catch(() => {});
  }, []);

  const resetFilters = () => {
    setSearch('');
    setEndCustomerId('');
    setContractCustomerId('');
    setYear('');
    setMonth('');
    setPage(1);
  };

  const removeOrder = async (order) => {
    if (!window.confirm(`确认删除销售机会「${order.order_id}」？删除后不可恢复。`)) return;
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
      <Card sx={{ px: 1.75, py: 1.25, borderRadius: 2.5, border: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'nowrap', width: '100%' }}>
          <TextField
            select
            size="small"
            label="年份"
            value={year}
            onChange={(e) => {
              setYear(e.target.value);
              setPage(1);
            }}
            sx={{ width: 110, ...filterInputSx }}
            SelectProps={{
              MenuProps: {
                PaperProps: {
                  sx: {
                    borderRadius: 2.5,
                    '& .MuiMenuItem-root': { fontSize: 15, minHeight: 44, fontWeight: 500 }
                  }
                }
              }
            }}
          >
            <MenuItem value="">全部</MenuItem>
            {Array.from({ length: 16 }, (_, i) => String(2021 + i)).map((y) => (
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
            sx={{ width: 110, ...filterInputSx }}
            SelectProps={{
              MenuProps: {
                PaperProps: {
                  sx: {
                    borderRadius: 2.5,
                    '& .MuiMenuItem-root': { fontSize: 15, minHeight: 44, fontWeight: 500 }
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
            options={endCustomers}
            getOptionLabel={(opt) => opt.customer_name || ''}
            value={endCustomers.find((c) => String(c.id) === String(endCustomerId)) || null}
            onChange={(_, value) => {
              setEndCustomerId(value ? value.id : '');
              setPage(1);
            }}
            sx={{ width: 230 }}
            ListboxProps={{
              sx: {
                '& .MuiAutocomplete-option': { fontSize: 15, minHeight: 44, fontWeight: 500 }
              }
            }}
            renderInput={(params) => <TextField {...params} label="最终客户" sx={filterInputSx} />}
          />
          <Autocomplete
            size="small"
            options={contractCustomers}
            getOptionLabel={(opt) => opt.customer_name || ''}
            value={contractCustomers.find((c) => String(c.id) === String(contractCustomerId)) || null}
            onChange={(_, value) => {
              setContractCustomerId(value ? value.id : '');
              setPage(1);
            }}
            sx={{ width: 230 }}
            ListboxProps={{
              sx: {
                '& .MuiAutocomplete-option': { fontSize: 15, minHeight: 44, fontWeight: 500 }
              }
            }}
            renderInput={(params) => <TextField {...params} label="合同客户" sx={filterInputSx} />}
          />
          <TextField
            size="small"
            label="项目号 / PO / SO"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            sx={{ flex: 1, minWidth: 180, ...filterInputSx }}
            InputProps={{ startAdornment: <InputAdornment position="start" sx={{ mr: 0.4 }}><SearchIcon fontSize="small" /></InputAdornment> }}
          />
          <Button size="small" variant="outlined" onClick={resetFilters} sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
            清除筛选
          </Button>
          <IconButton onClick={() => load()} title="刷新" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, flexShrink: 0 }}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Card>
      <Card>
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
            <Tabs
              value={scope}
              onChange={(_, value) => {
                setScope(value);
                setPage(1);
              }}
              sx={{
                px: 2,
                minHeight: 46,
                borderBottom: 1,
                borderColor: 'divider',
                '& .MuiTab-root': { minHeight: 46, fontWeight: 700, textTransform: 'none' }
              }}
            >
              <Tab label={`进行中${data ? `（${data.activeCount ?? 0}）` : ''}`} value="active" />
              <Tab label={`存档${data ? `（${data.archivedCount ?? 0}）` : ''}`} value="archived" />
            </Tabs>
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
                  <TableCell>机会年月</TableCell>
                    <TableCell>{t('end_customer')}</TableCell>
                    <TableCell>{t('project_name')}</TableCell>
                    <TableCell>项目号</TableCell>
                    <TableCell>PO</TableCell>
                    <TableCell>{t('sales_order')}</TableCell>
                    <TableCell>{t('status')}</TableCell>
                    <TableCell align="right">{t('amount')}</TableCell>
                    <TableCell align="right" sx={{ width: 80 }}>操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(data?.items || []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} align="center" sx={{ py: 8, color: 'text.secondary' }}>
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
                        ? { ...BLOCK.closed, icon: <CheckCircleRoundedIcon sx={{ fontSize: 16 }} />, text: '', title: `开票日期：${String(order.invoiced_date).slice(0, 10)}` }
                        : urgent
                          ? { ...BLOCK.urgent, icon: <WarningAmberRoundedIcon sx={{ fontSize: 14 }} />, text: `${invoicedDays}`, title: `开票后 ${invoicedDays} 天` }
                          : invoicedDays !== null
                            ? { ...BLOCK.amber, icon: <ReceiptLongIcon sx={{ fontSize: 14 }} />, text: `${invoicedDays}`, title: `开票后 ${invoicedDays} 天` }
                            : { ...BLOCK.none, icon: <ReceiptLongIcon sx={{ fontSize: 14 }} />, text: '—', title: '未开票' };
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
                        <TableCell sx={{ fontWeight: 700, color: 'primary.main', whiteSpace: 'nowrap', fontSize: 14 }}>
                          {order.year && order.month ? `${order.year}-${String(order.month).padStart(2, '0')}` : order.year || order.month || '-'}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{order.end_customer_name || '-'}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{order.project_name || '-'}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{order.project_no || '-'}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{order.po_numbers || '-'}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{order.sales_order || '-'}</TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                            <Chip
                              size="small"
                              label={STATUS_LABELS[order.status] || order.status}
                              icon={<Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: STATUS_COLORS[order.status] || '#78909C' }} />}
                              sx={{ bgcolor: `${STATUS_COLORS[order.status] || '#78909C'}22`, color: STATUS_COLORS[order.status] || '#78909C' }}
                            />
                            {order.commission_status === 'warn' && (
                              <Chip
                                size="small"
                                color="error"
                                icon={<WarningAmberRoundedIcon sx={{ fontSize: 14 }} />}
                                label="佣金偏差"
                                sx={{ fontWeight: 700 }}
                              />
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
