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
import api from '../api';
import { fmtMoney } from '../utils/helpers';

export default function SalesHistory() {
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
      <Typography variant="h5">历史销售数据</Typography>
      <Card sx={{ p: 2 }}>
        <TextField
          size="small"
          label="按最终客户/物料号/描述/订单号搜索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: 420 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
        />
      </Card>
      <Card>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 1100 }}>
              <TableHead>
                <TableRow>
                  <TableCell>订单号</TableCell>
                  <TableCell>最终客户</TableCell>
                  <TableCell>合同客户</TableCell>
                  <TableCell>Sales Order</TableCell>
                  <TableCell>PO</TableCell>
                  <TableCell>物料号</TableCell>
                  <TableCell>描述</TableCell>
                  <TableCell align="right">数量</TableCell>
                  <TableCell align="right">销售单价</TableCell>
                  <TableCell align="right">历史销售总价</TableCell>
                  <TableCell align="right">订单总金额（修正后）</TableCell>
                  <TableCell align="right">金额差异</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12} align="center" sx={{ color: 'text.secondary' }}>
                      暂无数据
                    </TableCell>
                  </TableRow>
                )}
                {items.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{row.order_id}</TableCell>
                    <TableCell>{row.end_customer_name || '-'}</TableCell>
                    <TableCell>{row.contract_customer_name || '-'}</TableCell>
                    <TableCell>{row.sales_order || '-'}</TableCell>
                    <TableCell>{row.po_numbers || '-'}</TableCell>
                    <TableCell>{row.material_no || '-'}</TableCell>
                    <TableCell>{row.description || '-'}</TableCell>
                    <TableCell align="right">{row.qty}</TableCell>
                    <TableCell align="right">{fmtMoney(row.final_unit_price, 4)}</TableCell>
                    <TableCell align="right">{fmtMoney(row.line_amount)}</TableCell>
                    <TableCell align="right">{fmtMoney(row.order_total)}</TableCell>
                    <TableCell align="right" sx={{ color: row.amount_difference ? 'warning.main' : 'text.secondary' }}>
                      {fmtMoney(row.amount_difference)}
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
