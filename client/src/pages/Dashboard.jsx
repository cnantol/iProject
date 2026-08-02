import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Grid from '@mui/material/Grid';
import LinearProgress from '@mui/material/LinearProgress';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import AddIcon from '@mui/icons-material/Add';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import AssignmentIcon from '@mui/icons-material/Assignment';
import AutoGraphIcon from '@mui/icons-material/AutoGraph';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DescriptionIcon from '@mui/icons-material/Description';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import LockIcon from '@mui/icons-material/Lock';
import PaidIcon from '@mui/icons-material/Paid';
import PersonIcon from '@mui/icons-material/Person';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import api from '../api';
import { STATUS_LABELS, STATUS_COLORS } from '../utils/constants';
import { fmtMoney, fmtDate } from '../utils/helpers';

function StatCard({ label, value, accent, badge, icon }) {
  return (
    <Card sx={{ position: 'relative', overflow: 'hidden', height: '100%', transition: 'transform 0.2s ease, box-shadow 0.2s ease', '&:hover': { transform: 'translateY(-2px)', boxShadow: 3 } }}>
      <Box sx={{ height: 4, bgcolor: accent || 'primary.main' }} />
      <CardContent sx={{ p: 2.25 }}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
          <Box>
            <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700 }}>
              {label}
            </Typography>
            <Typography variant="h5" sx={{ mt: 0.75, fontWeight: 800, color: accent || 'text.primary', whiteSpace: 'nowrap' }}>
              {value}
            </Typography>
            {badge != null && badge > 0 && (
              <Chip size="small" color="error" icon={<WarningAmberIcon />} label={`逾期 ${badge} 条`} sx={{ mt: 1, fontWeight: 700 }} />
            )}
          </Box>
          {icon && (
            <Box sx={{ width: 44, height: 44, borderRadius: 2.5, bgcolor: `${accent}18`, color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {icon}
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

const STATUS_ICONS = {
  customer_info: <PersonIcon sx={{ fontSize: 16 }} />,
  proposal: <DescriptionIcon sx={{ fontSize: 16 }} />,
  quotation: <RequestQuoteIcon sx={{ fontSize: 16 }} />,
  approval_pending: <FactCheckIcon sx={{ fontSize: 16 }} />,
  bid_decision: <EmojiEventsIcon sx={{ fontSize: 16 }} />,
  finance: <AccountBalanceIcon sx={{ fontSize: 16 }} />,
  shipping_invoicing: <LocalShippingIcon sx={{ fontSize: 16 }} />,
  commission: <PaidIcon sx={{ fontSize: 16 }} />,
  closed: <LockIcon sx={{ fontSize: 16 }} />,
  lost_closed: <CancelIcon sx={{ fontSize: 16 }} />
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [completingId, setCompletingId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data: result } = await api.get('/dashboard');
      setData(result);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggleTodo = async (todo) => {
    setCompletingId(todo.id);
    try {
      await api.patch(`/todos/${todo.id}/toggle`, { is_completed: Number(todo.is_completed) === 1 ? 0 : 1 });
      setData((prev) => ({
        ...prev,
        recentTodos: (prev.recentTodos || []).map((item) =>
          item.id === todo.id ? { ...item, is_completed: Number(item.is_completed) === 1 ? 0 : 1 } : item
        )
      }));
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || '操作失败');
    } finally {
      setCompletingId(null);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (error) {
    return <Alert severity="error" action={<Button onClick={load}>重试</Button>}>{error}</Alert>;
  }
  if (!data) return null;

  const maxStatus = Math.max(1, ...(data.statusDistribution || []).map((row) => row.count));
  const statusMap = new Map((data.statusDistribution || []).map((row) => [row.status, row.count]));

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" spacing={1.5} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
        <Box>
          <Typography variant="h5">首页看板</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>
            {new Intl.DateTimeFormat('zh-CN', { dateStyle: 'full' }).format(new Date())}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/orders/new')}>
          新建订单
        </Button>
      </Stack>

      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="总项目数" value={data.totalOrders ?? 0} accent="#1976D2" icon={<AssignmentIcon />} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="进行中" value={data.inProgress ?? 0} accent="#F57C00" badge={data.overdueCount} icon={<AutoGraphIcon />} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="已闭环" value={data.closedCount ?? 0} accent="#2E7D32" icon={<CheckCircleOutlineIcon />} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="闭环总金额" value={`¥ ${fmtMoney(data.totalAmount)}`} accent="#004E9A" icon={<PaymentsOutlinedIcon />} />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <Box sx={{ height: 4, borderRadius: '10px 10px 0 0', bgcolor: 'primary.main' }} />
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                <Box sx={{ width: 4, height: 22, borderRadius: 2, bgcolor: 'primary.main' }} />
                <Typography variant="h6">状态汇总</Typography>
              </Stack>
              <Stack spacing={1.25}>
                {[...statusMap.entries()].length === 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                    暂无数据
                  </Typography>
                )}
                {[...statusMap.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([status, count]) => (
                    <Box key={status}>
                      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.25 }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Box sx={{ width: 26, height: 26, borderRadius: 1.5, bgcolor: `${STATUS_COLORS[status] || '#78909C'}22`, color: STATUS_COLORS[status] || '#78909C', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {STATUS_ICONS[status] || <AutoGraphIcon sx={{ fontSize: 16 }} />}
                          </Box>
                          <Typography variant="body2">{STATUS_LABELS[status] || status}</Typography>
                        </Stack>
                        <Typography variant="body2" fontWeight={700}>
                          {count}
                        </Typography>
                      </Stack>
                      <LinearProgress
                        variant="determinate"
                        value={(count / maxStatus) * 100}
                        sx={{ height: 8, borderRadius: 2, bgcolor: `${STATUS_COLORS[status] || '#78909C'}22`, '& .MuiLinearProgress-bar': { bgcolor: STATUS_COLORS[status] || '#78909C' } }}
                      />
                    </Box>
                  ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <Box sx={{ height: 4, borderRadius: '10px 10px 0 0', bgcolor: 'primary.main' }} />
            <CardContent>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Box sx={{ width: 4, height: 22, borderRadius: 2, bgcolor: 'primary.main' }} />
                  <Typography variant="h6">待办事项</Typography>
                </Stack>
                <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => navigate('/todos')}>
                  查看全部
                </Button>
              </Stack>
              {(data.recentTodos || []).length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                  暂无待办
                </Typography>
              ) : (
                <Grid container spacing={1.5}>
                  {(data.recentTodos || []).map((todo) => (
                    <Grid item xs={12} sm={6} key={todo.id}>
                      <ListItemButton
                        sx={{
                          height: '100%',
                          px: 1.5,
                          py: 1.25,
                          border: 1,
                          borderColor: 'divider',
                          borderRadius: 2,
                          transition: 'transform 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease',
                          '&:hover': { bgcolor: 'action.hover', transform: 'translateY(-2px)', boxShadow: 2 }
                        }}
                        onClick={() => (todo.order_ref ? navigate(`/orders/${todo.order_ref}`) : navigate('/todos'))}
                      >
                        <Checkbox
                          size="small"
                          color="success"
                          checked={Number(todo.is_completed) === 1}
                          disabled={completingId === todo.id}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggleTodo(todo)}
                        />
                        <ListItemText
                          primary={todo.title}
                          secondary={todo.due_date ? `截止：${fmtDate(todo.due_date)}` : '无截止日期'}
                          primaryTypographyProps={{ fontSize: 14, fontWeight: 700 }}
                          sx={{ textDecoration: Number(todo.is_completed) === 1 ? 'line-through' : 'none', color: Number(todo.is_completed) === 1 ? 'text.disabled' : 'inherit' }}
                        />
                        {Number(todo.is_completed) === 1 && <Chip size="small" color="success" label="已完成" />}
                        {Number(todo.is_completed) !== 1 && todo.due_date && todo.due_date < new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10) && (
                          <Chip size="small" color="error" label="逾期" />
                        )}
                      </ListItemButton>
                    </Grid>
                  ))}
                </Grid>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      <Card>
        <Box sx={{ height: 4, borderRadius: '10px 10px 0 0', bgcolor: 'primary.main' }} />
        <CardContent>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Box sx={{ width: 4, height: 22, borderRadius: 2, bgcolor: 'primary.main' }} />
              <Typography variant="h6">最近项目</Typography>
            </Stack>
            <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => navigate('/orders')}>
              全部订单
            </Button>
          </Stack>
          {(data.recentOrders || []).length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              暂无数据
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { bgcolor: 'action.hover', fontWeight: 700, whiteSpace: 'nowrap' } }}>
                  <TableCell>订单号</TableCell>
                  <TableCell>项目名称</TableCell>
                  <TableCell>最终客户</TableCell>
                  <TableCell>状态</TableCell>
                  <TableCell align="right">金额</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.recentOrders || []).slice(0, 10).map((order) => (
                  <TableRow
                    key={order.id}
                    hover
                    sx={{ cursor: 'pointer', transition: 'background-color 0.15s ease', '&:hover': { bgcolor: 'action.hover' } }}
                    onClick={() => navigate(`/orders/${order.id}`)}
                  >
                    <TableCell sx={{ fontWeight: 700, color: 'primary.main', whiteSpace: 'nowrap' }}>{order.order_id}</TableCell>
                    <TableCell>{order.project_name || '-'}</TableCell>
                    <TableCell>{order.end_customer_name || '-'}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={STATUS_LABELS[order.status] || order.status}
                        icon={<Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: STATUS_COLORS[order.status] || '#78909C' }} />}
                        sx={{ bgcolor: `${STATUS_COLORS[order.status] || '#78909C'}22`, color: STATUS_COLORS[order.status] || '#78909C' }}
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtMoney(order.total_amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
