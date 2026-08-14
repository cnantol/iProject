import { useCallback, useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import ClearIcon from '@mui/icons-material/Clear';
import InboxIcon from '@mui/icons-material/Inbox';
import InventoryIcon from '@mui/icons-material/Inventory';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import BalanceIcon from '@mui/icons-material/Balance';
import api from '../api';
import { fmtMoney } from '../utils/helpers';
import { useFieldLabels } from '../utils/fieldLabels';
import { tableHeadTokens } from '../theme/md3Theme';

export default function SalesHistory() {
  const { t } = useFieldLabels();
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({ orderCount: 0, totalSales: 0, totalOrderAmount: 0, difference: 0 });

  // sx 回调按 theme.mode 取值,避免顶层读取 theme.palette.mode 抛错导致白屏
  const cardSx = (theme) => ({
    flex: 1, minWidth: 180, borderRadius: 2,
    bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : '#fff',
    border: '1px solid', borderColor: 'divider'
  });
  const tableHeadSx = (theme) => {
    const tk = tableHeadTokens[theme.palette.mode];
    return {
      bgcolor: tk.bg,
      color: tk.color,
      fontWeight: 800,
      borderBottom: '2px solid',
      borderColor: tk.border
    };
  };
  const rowHoverSx = (theme) => ({
    '&:hover': { bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#f8fafc' }
  });

  useEffect(() => {
    setPage(1);
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: pageSize };
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      const { data } = await api.get('/sales-history', { params });
      setItems(data.items || []);
      setTotal(data.total || 0);
      setSummary(data.summary || { orderCount: 0, totalSales: 0, totalOrderAmount: 0, difference: 0 });
      setError('');
      const maxPage = Math.max(1, Math.ceil((data.total || 0) / pageSize));
      if (page > maxPage) {
        setPage(maxPage);
        return;
      }
    } catch (err) {
      setError(err.response?.data?.error || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  const difference = summary.difference;

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h5">归档记录</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>
          已中标闭环商机的报价明细与金额对账
        </Typography>
      </Box>

      {/* 统计卡片 */}
      {!loading && !error && summary.orderCount > 0 && (
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
          <Card sx={cardSx}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                <InventoryIcon sx={{ fontSize: 18, color: '#0ea5e9' }} />
                <Typography variant="caption" color="text.secondary" fontWeight={600}>历史商机数</Typography>
              </Stack>
              <Typography variant="h5" fontWeight={800} color="#0ea5e9">{summary.orderCount}</Typography>
            </CardContent>
          </Card>
          <Card sx={cardSx}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                <AttachMoneyIcon sx={{ fontSize: 18, color: '#0891b2' }} />
                <Typography variant="caption" color="text.secondary" fontWeight={600}>历史销售总价</Typography>
              </Stack>
              <Typography variant="h5" fontWeight={800} color="#0891b2">{fmtMoney(summary.totalSales)}</Typography>
            </CardContent>
          </Card>
          <Card sx={cardSx}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                <BalanceIcon sx={{ fontSize: 18, color: difference === 0 ? '#10b981' : '#f59e0b' }} />
                <Typography variant="caption" color="text.secondary" fontWeight={600}>金额（修正后）</Typography>
              </Stack>
              <Typography variant="h5" fontWeight={800} color={difference === 0 ? '#10b981' : '#f59e0b'}>{fmtMoney(summary.totalOrderAmount)}</Typography>
              {difference !== 0 && (
                <Typography variant="caption" sx={{ fontWeight: 700, color: '#f59e0b', mt: 0.5, display: 'block' }}>
                  差异：{fmtMoney(difference)}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Stack>
      )}

      <Card sx={{ borderRadius: 2, overflow: 'hidden', bgcolor: 'transparent', border: '1px solid', borderColor: 'divider' }}>
        {/* 搜索栏 */}
        <Box sx={(theme) => { const tk = tableHeadTokens[theme.palette.mode]; return { p: 2, borderBottom: '1px solid', borderColor: tk.border, bgcolor: tk.bg }; }}>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ width: '100%' }}>
            <TextField
              size="small"
              placeholder="搜索商机 ID、最终客户、合同客户、PO、SO、物料号、描述、年份、月份，多条件用空格"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{
                flex: 1,
                minWidth: 0,
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
                ),
              }}
            />
            {search && (
              <Button
                size="medium"
                variant="outlined"
                color="primary"
                startIcon={<ClearIcon />}
                onClick={() => setSearch('')}
                sx={{ fontWeight: 700, borderRadius: 2.5, whiteSpace: 'nowrap', flexShrink: 0, height: 40 }}
              >
                清空
              </Button>
            )}
            <Button
              size="medium"
              variant="outlined"
              color="primary"
              startIcon={<RefreshIcon />}
              onClick={load}
              disabled={loading}
              sx={{ fontWeight: 700, borderRadius: 2.5, whiteSpace: 'nowrap', flexShrink: 0, height: 40 }}
            >
              {loading ? '加载中...' : '刷新'}
            </Button>
          </Stack>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ m: 2, borderRadius: 1.5 }}>{error}</Alert>
        ) : (
          <>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 1100 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={tableHeadSx}>{t('order_id')}</TableCell>
                  <TableCell sx={tableHeadSx}>{t('end_customer')}</TableCell>
                  <TableCell sx={tableHeadSx}>{t('contract_customer')}</TableCell>
                  <TableCell sx={tableHeadSx}>
                    <Stack spacing={0.25}>
                      <Typography variant="body2" sx={{ fontWeight: 800, fontSize: 13, lineHeight: 1.3, color: 'primary.main' }}>PO</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 800, fontSize: 13, lineHeight: 1.3, color: 'text.primary' }}>SO</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell sx={tableHeadSx}>物料号</TableCell>
                  <TableCell sx={tableHeadSx}>描述</TableCell>
                  <TableCell align="right" sx={tableHeadSx}>数量</TableCell>
                  <TableCell align="right" sx={tableHeadSx}>销售单价</TableCell>
                  <TableCell align="right" sx={tableHeadSx}>历史销售总价</TableCell>
                  <TableCell align="right" sx={tableHeadSx}>{t('amount')}（修正后）</TableCell>
                  <TableCell align="right" sx={tableHeadSx}>金额差异</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} align="center" sx={{ py: 8, color: 'text.secondary' }}>
                      <Stack spacing={1} alignItems="center">
                        <InboxIcon sx={{ fontSize: 56, color: 'text.disabled' }} />
                        <Typography variant="body2" fontWeight={700}>暂无历史销售数据</Typography>
                        <Typography variant="caption" color="text.secondary">调整搜索条件或查看其他页面</Typography>
                      </Stack>
                    </TableCell>
                  </TableRow>
                )}
                {items.map((row) => (
                  <TableRow key={row.id} hover sx={rowHoverSx}>
                    <TableCell sx={{ fontWeight: 800, color: 'primary.main', whiteSpace: 'nowrap' }}>{row.order_id}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', minWidth: 100 }}>{row.end_customer_name || '-'}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', minWidth: 100 }}>{row.contract_customer_name || '-'}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Stack spacing={0.25}>
                        <Typography variant="body2" sx={{ fontWeight: 800, fontSize: 13, lineHeight: 1.3, color: 'primary.main' }}>
                          {row.po_numbers || '-'}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 800, fontSize: 13, lineHeight: 1.3, color: 'text.primary' }}>
                          {row.sales_order || '-'}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.material_no || '-'}</TableCell>
                    <TableCell sx={{ minWidth: 140 }}>{row.description || '-'}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{row.qty}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtMoney(row.final_unit_price, 4)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtMoney(row.line_amount)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtMoney(row.order_total)}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <Typography component="span" sx={{ fontWeight: 800, color: row.amount_difference ? '#f59e0b' : 'text.secondary' }}>
                        {fmtMoney(row.amount_difference)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          {total > 0 && (
            <TablePagination
              component="div"
              count={total}
              page={page - 1}
              rowsPerPage={pageSize}
              onPageChange={(_, nextPage) => setPage(nextPage + 1)}
              onRowsPerPageChange={(e) => {
                setPageSize(parseInt(e.target.value, 10) || 20);
                setPage(1);
              }}
              rowsPerPageOptions={[20, 50, 100]}
              labelRowsPerPage="每页"
              labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${count}`}
              sx={{ borderTop: '1px solid', borderColor: 'divider' }}
            />
          )}
          </>
        )}
      </Card>
    </Stack>
  );
}
