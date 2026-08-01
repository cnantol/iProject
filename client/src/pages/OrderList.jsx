import { useCallback, useEffect, useState } from 'react';
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
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import api from '../api';
import { STATUS_LABELS, STATUS_COLORS } from '../utils/constants';
import { fmtMoney } from '../utils/helpers';

export default function OrderList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const limit = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit };
      if (search.trim()) params.search = search.trim();
      if (status) params.status = status;
      const { data: result } = await api.get('/orders', { params });
      setData(result);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h5">订单列表</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/orders/new')}>
          新建订单
        </Button>
      </Stack>
      <Card sx={{ p: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
          <TextField
            size="small"
            label="搜索订单号/项目/SO"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            sx={{ flex: 1 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
          />
          <TextField
            select
            size="small"
            label="状态"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            sx={{ width: 200 }}
          >
            <MenuItem value="">全部状态</MenuItem>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <MenuItem key={key} value={key}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          <IconButton onClick={() => load()} title="刷新">
            <RefreshIcon />
          </IconButton>
        </Stack>
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
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>订单号</TableCell>
                  <TableCell>项目名称</TableCell>
                  <TableCell>最终客户</TableCell>
                  <TableCell>合同客户</TableCell>
                  <TableCell>Sales Order</TableCell>
                  <TableCell>状态</TableCell>
                  <TableCell align="right">金额</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data?.items || []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                      暂无数据
                    </TableCell>
                  </TableRow>
                )}
                {(data?.items || []).map((order) => (
                  <TableRow key={order.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/orders/${order.id}`)}>
                    <TableCell sx={{ fontWeight: 600 }}>{order.order_id}</TableCell>
                    <TableCell>{order.project_name || '-'}</TableCell>
                    <TableCell>{order.end_customer_name || '-'}</TableCell>
                    <TableCell>{order.contract_customer_name || '-'}</TableCell>
                    <TableCell>{order.sales_order || '-'}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={STATUS_LABELS[order.status] || order.status}
                        sx={{ bgcolor: `${STATUS_COLORS[order.status] || '#78909C'}22`, color: STATUS_COLORS[order.status] || '#78909C' }}
                      />
                    </TableCell>
                    <TableCell align="right">{fmtMoney(order.total_amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {(data?.total || 0) > limit && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <Pagination
                  count={Math.ceil((data.total || 0) / limit)}
                  page={page}
                  onChange={(_, value) => setPage(value)}
                  color="primary"
                />
              </Box>
            )}
          </>
        )}
      </Card>
    </Stack>
  );
}
