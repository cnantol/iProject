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
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import InboxIcon from '@mui/icons-material/Inbox';
import api, { errorMessage } from '../api';
import { STATUS_LABELS, STATUS_COLORS } from '../utils/constants';
import { fmtMoney } from '../utils/helpers';
import { useFieldLabels } from '../utils/fieldLabels';

export default function OrderList() {
  const navigate = useNavigate();
  const { t } = useFieldLabels();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const limit = 10;

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
      <Card sx={{ px: 2.25, py: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
          <TextField
            size="small"
            label={`搜索${t('order_id')}/项目/SO`}
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
                <TableRow sx={{ '& th': { bgcolor: 'action.hover', fontWeight: 700, whiteSpace: 'nowrap' } }}>
                  <TableCell>{t('order_id')}</TableCell>
                  <TableCell>{t('project_name')}</TableCell>
                  <TableCell>{t('end_customer')}</TableCell>
                  <TableCell>{t('contract_customer')}</TableCell>
                  <TableCell>{t('sales_order')}</TableCell>
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
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>暂无符合条件的销售机会</Typography>
                        <Typography variant="caption" color="text.secondary">可调整搜索条件或点击右上角“新建销售机会”</Typography>
                      </Stack>
                    </TableCell>
                  </TableRow>
                )}
                {(data?.items || []).map((order) => (
                  <TableRow key={order.id} hover sx={{ cursor: 'pointer', transition: 'background-color 0.15s ease' }} onClick={() => navigate(`/orders/${order.id}`)}>
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
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
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
                ))}
              </TableBody>
            </Table>
            {(data?.total || 0) > 0 && (
              <Stack direction="row" alignItems="center" justifyContent="center" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ py: 1.5, px: 2, borderTop: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
                <Typography variant="body2" color="text.secondary">共 {data?.total || 0} 条</Typography>
                <Pagination
                  count={Math.max(1, Math.ceil((data?.total || 0) / limit))}
                  page={page}
                  onChange={(_, value) => setPage(value)}
                  color="primary"
                />
              </Stack>
            )}
          </>
        )}
      </Card>
    </Stack>
  );
}
