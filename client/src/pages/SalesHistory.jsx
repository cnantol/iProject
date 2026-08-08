import { useCallback, useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import SearchIcon from '@mui/icons-material/Search';
import InboxIcon from '@mui/icons-material/Inbox';
import InventoryIcon from '@mui/icons-material/Inventory';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import BalanceIcon from '@mui/icons-material/Balance';
import api from '../api';
import { fmtMoney } from '../utils/helpers';
import { useFieldLabels } from '../utils/fieldLabels';

export default function SalesHistory() {
  const { t } = useFieldLabels();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/sales-history', { params: debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {} });
      setItems(data.items || []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  const orderIds = new Set(items.map((row) => row.order_id));
  const uniqueOrderTotals = new Map();
  items.forEach((row) => {
    if (!uniqueOrderTotals.has(row.order_id) && row.order_total != null) uniqueOrderTotals.set(row.order_id, Number(row.order_total));
  });
  const totalSales = items.reduce((sum, row) => sum + Number(row.line_amount || 0), 0);
  const totalOrderAmount = [...uniqueOrderTotals.values()].reduce((sum, value) => sum + value, 0);
  const difference = totalOrderAmount - totalSales;

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h5">历史销售数据</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>
          已中标闭环销售机会的报价明细与金额对账
        </Typography>
      </Box>

      {/* 统计卡片 */}
      {!loading && !error && items.length > 0 && (
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
          <Card sx={{ flex: 1, minWidth: 180, borderRadius: 2, bgcolor: isDark ? 'grey.900' : '#fff', border: '1px solid', borderColor: 'divider' }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                <InventoryIcon sx={{ fontSize: 18, color: '#0ea5e9' }} />
                <Typography variant="caption" color="text.secondary" fontWeight={600}>历史销售机会数</Typography>
              </Stack>
              <Typography variant="h5" fontWeight={800} color="#0ea5e9">{orderIds.size}</Typography>
            </CardContent>
          </Card>
          <Card sx={{ flex: 1, minWidth: 180, borderRadius: 2, bgcolor: isDark ? 'grey.900' : '#fff', border: '1px solid', borderColor: 'divider' }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                <AttachMoneyIcon sx={{ fontSize: 18, color: '#0891b2' }} />
                <Typography variant="caption" color="text.secondary" fontWeight={600}>历史销售总价</Typography>
              </Stack>
              <Typography variant="h5" fontWeight={800} color="#0891b2">{fmtMoney(totalSales)}</Typography>
            </CardContent>
          </Card>
          <Card sx={{ flex: 1, minWidth: 180, borderRadius: 2, bgcolor: isDark ? 'grey.900' : '#fff', border: '1px solid', borderColor: 'divider' }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                <BalanceIcon sx={{ fontSize: 18, color: difference === 0 ? '#10b981' : '#f59e0b' }} />
                <Typography variant="caption" color="text.secondary" fontWeight={600}>金额（修正后）</Typography>
              </Stack>
              <Typography variant="h5" fontWeight={800} color={difference === 0 ? '#10b981' : '#f59e0b'}>{fmtMoney(totalOrderAmount)}</Typography>
              {difference !== 0 && (
                <Typography variant="caption" sx={{ fontWeight: 700, color: '#f59e0b', mt: 0.5, display: 'block' }}>
                  差异：{fmtMoney(difference)}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Stack>
      )}

      <Card sx={{ borderRadius: 2, overflow: 'hidden' }}>
        {/* 搜索栏 */}
        <Box sx={{ p: 2.5, borderBottom: '1px solid', borderColor: 'divider', bgcolor: isDark ? 'grey.900' : '#f8fafc' }}>
          <TextField
            size="small"
            placeholder={`搜索：${t('end_customer')} / 物料号 / 描述 / ${t('order_id')}`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{
              width: { xs: '100%', md: 420 },
              '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'background.paper' },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
              '& .MuiInputBase-input': { fontSize: 14 },
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start" sx={{ mr: 0.5 }}>
                  <SearchIcon fontSize="small" sx={{ color: search ? 'primary.main' : 'text.secondary' }} />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ m: 2, borderRadius: 1.5 }}>{error}</Alert>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 1100 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ bgcolor: isDark ? 'grey.900' : '#f8fafc', fontWeight: 800, borderBottom: '2px solid', borderColor: isDark ? 'grey.700' : '#e2e8f0' }}>{t('order_id')}</TableCell>
                  <TableCell sx={{ bgcolor: isDark ? 'grey.900' : '#f8fafc', fontWeight: 800, borderBottom: '2px solid', borderColor: isDark ? 'grey.700' : '#e2e8f0' }}>{t('end_customer')}</TableCell>
                  <TableCell sx={{ bgcolor: isDark ? 'grey.900' : '#f8fafc', fontWeight: 800, borderBottom: '2px solid', borderColor: isDark ? 'grey.700' : '#e2e8f0' }}>{t('contract_customer')}</TableCell>
                  <TableCell sx={{ bgcolor: isDark ? 'grey.900' : '#f8fafc', fontWeight: 800, borderBottom: '2px solid', borderColor: isDark ? 'grey.700' : '#e2e8f0' }}>
                    <Stack spacing={0.25}>
                      <Typography variant="body2" sx={{ fontWeight: 800, fontSize: 13, lineHeight: 1.3, color: 'primary.main' }}>PO</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 800, fontSize: 13, lineHeight: 1.3, color: 'text.primary' }}>SO</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ bgcolor: isDark ? 'grey.900' : '#f8fafc', fontWeight: 800, borderBottom: '2px solid', borderColor: isDark ? 'grey.700' : '#e2e8f0' }}>物料号</TableCell>
                  <TableCell sx={{ bgcolor: isDark ? 'grey.900' : '#f8fafc', fontWeight: 800, borderBottom: '2px solid', borderColor: isDark ? 'grey.700' : '#e2e8f0' }}>描述</TableCell>
                  <TableCell align="right" sx={{ bgcolor: isDark ? 'grey.900' : '#f8fafc', fontWeight: 800, borderBottom: '2px solid', borderColor: isDark ? 'grey.700' : '#e2e8f0' }}>数量</TableCell>
                  <TableCell align="right" sx={{ bgcolor: isDark ? 'grey.900' : '#f8fafc', fontWeight: 800, borderBottom: '2px solid', borderColor: isDark ? 'grey.700' : '#e2e8f0' }}>销售单价</TableCell>
                  <TableCell align="right" sx={{ bgcolor: isDark ? 'grey.900' : '#f8fafc', fontWeight: 800, borderBottom: '2px solid', borderColor: isDark ? 'grey.700' : '#e2e8f0' }}>历史销售总价</TableCell>
                  <TableCell align="right" sx={{ bgcolor: isDark ? 'grey.900' : '#f8fafc', fontWeight: 800, borderBottom: '2px solid', borderColor: isDark ? 'grey.700' : '#e2e8f0' }}>{t('amount')}（修正后）</TableCell>
                  <TableCell align="right" sx={{ bgcolor: isDark ? 'grey.900' : '#f8fafc', fontWeight: 800, borderBottom: '2px solid', borderColor: isDark ? 'grey.700' : '#e2e8f0' }}>金额差异</TableCell>
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
                  <TableRow key={row.id} hover sx={{ '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc' } }}>
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
        )}
      </Card>
    </Stack>
  );
}
