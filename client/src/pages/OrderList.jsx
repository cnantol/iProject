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
import InboxIcon from '@mui/icons-material/Inbox';
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
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        justifyContent="space-between"
        spacing={1.5}
        sx={{ flexWrap: 'wrap', rowGap: 1 }}
      >
        <Box>
          <Typography variant="h5">订单列表</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>
            查看与管理全部销售订单，点击行进入详情
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/orders/new')}>
          新建订单
        </Button>
      </Stack>
      <Card sx={{ px: 2.25, py: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
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
          <IconButton onClick={() => load()} title="刷新" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
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
                    <TableCell colSpan={7} align="center" sx={{ py: 8, color: 'text.secondary' }}>
                      <Stack spacing={1} alignItems="center">
                        <InboxIcon sx={{ fontSize: 42, color: 'text.disabled' }} />
                        <Typography variant="body2">暂无符合条件的订单</Typography>
                      </Stack>
                    </TableCell>
                  </TableRow>
                )}
                {(data?.items || []).map((order) => (
                  <TableRow key={order.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/orders/${order.id}`)}>
                    <TableCell sx={{ fontWeight: 700, color: 'primary.main' }}>{order.order_id}</TableCell>
                    <TableCell>{order.project_name || '-'}</TableCell>
                    <TableCell>{order.end_customer_name || '-'}</TableCell>
                    <TableCell>{order.contract_customer_name || '-'}</TableCell>
                    <TableCell>{order.sales_order || '-'}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={STATUS_LABELS[order.status] || order.status}
                        icon={<Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: STATUS_COLORS[order.status] || '#78909C' }} />}
                        sx={{ bgcolor: `${STATUS_COLORS[order.status] || '#78909C'}22`, color: STATUS_COLORS[order.status] || '#78909C' }}
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>{fmtMoney(order.total_amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {(data?.total || 0) > limit && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2.5 }}>
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
