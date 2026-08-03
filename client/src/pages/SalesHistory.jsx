import { useCallback, useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
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
import SearchIcon from '@mui/icons-material/Search';
import InboxIcon from '@mui/icons-material/Inbox';
import api from '../api';
import { fmtMoney } from '../utils/helpers';
import { useFieldLabels } from '../utils/fieldLabels';

export default function SalesHistory() {
  const { t } = useFieldLabels();
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/sales-history', { params: search.trim() ? { search: search.trim() } : {} });
      setItems(data.items || []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h5">历史销售数据</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>
          已中标闭环销售机会的报价明细与金额对账
        </Typography>
      </Box>
      <Card sx={{ px: 2.25, py: 2 }}>
        <TextField
          size="small"
          label={`按${t('end_customer')}/物料号/描述/${t('order_id')}搜索`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: { xs: '100%', md: 420 } }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
        />
      </Card>
      {!loading && !error && items.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5 }}>
          {(() => {
            const orderIds = new Set(items.map((row) => row.order_id));
            const uniqueOrderTotals = new Map();
            items.forEach((row) => {
              if (!uniqueOrderTotals.has(row.order_id) && row.order_total != null) uniqueOrderTotals.set(row.order_id, Number(row.order_total));
            });
            const totalSales = items.reduce((sum, row) => sum + Number(row.line_amount || 0), 0);
            const totalOrderAmount = [...uniqueOrderTotals.values()].reduce((sum, value) => sum + value, 0);
            const difference = totalOrderAmount - totalSales;
            return [
              { label: '历史销售机会数', value: String(orderIds.size), color: '#004E9A' },
              { label: '历史销售总价', value: `¥ ${fmtMoney(totalSales)}`, color: '#0093BE' },
              { label: `${t('amount')}（修正后）`, value: `¥ ${fmtMoney(totalOrderAmount)}`, diff: difference, color: difference === 0 ? '#1E7A46' : '#B26A00' }
            ].map((item) => (
              <Box key={item.label} sx={{ p: 1.75, borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: `${item.color}10` }}>
                <Typography variant="overline" sx={{ color: item.color, fontWeight: 700 }}>
                  {item.label}
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 800, color: item.color, mt: 0.5, whiteSpace: 'nowrap' }}>
                  {item.value}
                </Typography>
                {item.diff !== undefined && (
                  <Typography variant="caption" sx={{ fontWeight: 700, color: item.color, mt: 0.5, display: 'block', whiteSpace: 'nowrap' }}>
                    金额差异：¥ {fmtMoney(item.diff)}
                  </Typography>
                )}
              </Box>
            ));
          })()}
        </Box>
      )}
      <Card>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 1200 }}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('order_id')}</TableCell>
                  <TableCell>{t('end_customer')}</TableCell>
                  <TableCell>{t('contract_customer')}</TableCell>
                  <TableCell>{t('sales_order')}</TableCell>
                  <TableCell>PO</TableCell>
                  <TableCell>物料号</TableCell>
                  <TableCell>描述</TableCell>
                  <TableCell align="right">数量</TableCell>
                  <TableCell align="right">销售单价</TableCell>
                  <TableCell align="right">历史销售总价</TableCell>
                  <TableCell align="right">{t('amount')}（修正后）</TableCell>
                  <TableCell align="right">金额差异</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12} align="center" sx={{ py: 8, color: 'text.secondary' }}>
                      <Stack spacing={1} alignItems="center">
                        <InboxIcon sx={{ fontSize: 42, color: 'text.disabled' }} />
                        <Typography variant="body2">暂无历史销售数据</Typography>
                      </Stack>
                    </TableCell>
                  </TableRow>
                )}
                {items.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell sx={{ fontWeight: 700, color: 'primary.main', whiteSpace: 'nowrap' }}>{row.order_id}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', minWidth: 100 }}>{row.end_customer_name || '-'}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', minWidth: 100 }}>{row.contract_customer_name || '-'}</TableCell>
                    <TableCell>{row.sales_order || '-'}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.po_numbers || '-'}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.material_no || '-'}</TableCell>
                    <TableCell sx={{ minWidth: 140 }}>{row.description || '-'}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{row.qty}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtMoney(row.final_unit_price, 4)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtMoney(row.line_amount)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtMoney(row.order_total)}</TableCell>
                    <TableCell align="right" sx={{ color: row.amount_difference ? 'warning.main' : 'text.secondary', whiteSpace: 'nowrap' }}>
                      <Typography component="span" sx={{ fontWeight: 700 }}>{fmtMoney(row.amount_difference)}</Typography>
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
