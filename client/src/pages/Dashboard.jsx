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
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import InsightsIcon from '@mui/icons-material/Insights';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import api from '../api';
import { fmtMoney, fmtDate, daysSinceDate } from '../utils/helpers';

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

  return (
    <Stack spacing={3} useFlexGap>
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" spacing={1.5} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Box sx={{ width: 4, height: 28, borderRadius: 2, bgcolor: 'primary.main' }} />
          <Box>
            <Typography variant="h5">项目总览</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>
              {new Intl.DateTimeFormat('zh-CN', { dateStyle: 'full' }).format(new Date())}
            </Typography>
          </Box>
        </Stack>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/orders/new')}>
          新建商机
        </Button>
      </Stack>

      <Grid container spacing={2} sx={{ mx: -2 }}>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard label="总项目数" value={data.totalOrders ?? 0} accent="#1976D2" icon={<AssignmentIcon />} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard label="进行中" value={data.inProgress ?? 0} accent="#F57C00" badge={data.overdueCount} icon={<AutoGraphIcon />} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard label="已闭环" value={data.closedCount ?? 0} accent="#2E7D32" icon={<CheckCircleOutlineIcon />} />
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mx: -2 }}>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard label="订单总金额" value={`¥ ${fmtMoney(data.totalOrderAmount)}`} accent="#00897B" icon={<AccountBalanceIcon />} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard label="闭环总金额" value={`¥ ${fmtMoney(data.totalAmount)}`} accent="#004E9A" icon={<PaymentsOutlinedIcon />} />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard label="进行中金额" value={`¥ ${fmtMoney(data.inProgressAmount)}`} accent="#F57C00" icon={<InsightsIcon />} />
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mx: -2 }}>
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <Box sx={{ height: 4, borderRadius: '10px 10px 0 0', bgcolor: 'primary.main' }} />
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                <Box sx={{ width: 4, height: 22, borderRadius: 2, bgcolor: 'primary.main' }} />
                <Typography variant="h6">进行中汇总</Typography>
              </Stack>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.75 }}>
                按最终客户
              </Typography>
              {(data.inProgressByCustomer || []).length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 1, textAlign: 'center' }}>
                  暂无进行中商机
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {(data.inProgressByCustomer || []).map((row, index) => {
                    const maxCustomer = Math.max(1, ...(data.inProgressByCustomer || []).map((r) => Number(r.count)));
                    return (
                      <Box key={row.customer_name || `customer-${index}`}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.25, gap: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                            {row.customer_name || '未分配客户'}
                          </Typography>
                          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 800, color: '#00897B', whiteSpace: 'nowrap' }}>
                              ¥ {fmtMoney(row.total_amount)}
                            </Typography>
                            <Chip size="small" label={`${row.count} 个`} variant="outlined" color="primary" sx={{ fontWeight: 700 }} />
                          </Stack>
                        </Stack>
                        <LinearProgress
                          variant="determinate"
                          value={(Number(row.count) / maxCustomer) * 100}
                          sx={{ height: 7, borderRadius: 2, bgcolor: 'rgba(0,137,123,0.12)', '& .MuiLinearProgress-bar': { bgcolor: '#00897B' } }}
                        />
                      </Box>
                    );
                  })}
                </Stack>
              )}
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
                  <Typography variant="h6">待办任务</Typography>
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
      <Grid container spacing={2} sx={{ mx: -2 }}>
        <Grid item xs={12}>
          <Card>
            <Box sx={{ height: 4, borderRadius: '10px 10px 0 0', bgcolor: 'warning.main' }} />
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                <Box sx={{ width: 4, height: 22, borderRadius: 2, bgcolor: 'warning.main' }} />
                <Typography variant="h6">进行中的商机 · 开票时长 TOP5</Typography>
                <Typography variant="caption" color="text.secondary">按发票开具后天数从长到短排列，点击行查看详情</Typography>
              </Stack>
              {(data.invoiceAging || []).length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                  暂无进行中的已开票商机
                </Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ '& th': { bgcolor: 'action.hover', fontWeight: 700, whiteSpace: 'nowrap' } }}>
                      <TableCell sx={{ width: 64 }}>排名</TableCell>
                      <TableCell>商机号</TableCell>
                      <TableCell>最终客户</TableCell>
                      <TableCell align="center" sx={{ width: 76 }}>项目类型</TableCell>
                      <TableCell>项目名称</TableCell>
                      <TableCell align="right">订单金额</TableCell>
                      <TableCell align="right">开票日期</TableCell>
                      <TableCell align="right">开票后</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(data.invoiceAging || []).slice(0, 5).map((item, index) => {
                      const days = daysSinceDate(item.invoiced_date);
                      const urgent = days !== null && days >= 100;
                      return (
                        <TableRow key={item.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/orders/${item.id}`)}>
                          <TableCell sx={{ fontWeight: 800, color: index === 0 ? 'warning.main' : 'text.secondary' }}>
                            {index === 0 ? <EmojiEventsIcon sx={{ fontSize: 16, verticalAlign: 'middle' }} /> : index + 1}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700, color: 'primary.main', whiteSpace: 'nowrap' }}>{item.order_id}</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            <Stack direction="row" spacing={0.75} alignItems="center">
                              <Box
                                sx={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: '50%',
                                  bgcolor: index === 0 ? 'warning.main' : 'primary.light',
                                  flexShrink: 0
                                }}
                              />
                              <Typography variant="body2" sx={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3, color: 'text.primary' }}>
                                {item.end_customer_name || '未分配客户'}
                              </Typography>
                            </Stack>
                          </TableCell>
                          <TableCell align="center">
                            {item.order_type ? (
                              <Chip
                                size="small"
                                label={item.order_type}
                                sx={{
                                  height: 22,
                                  minWidth: 32,
                                  borderRadius: 1.5,
                                  fontWeight: 800,
                                  fontSize: 12,
                                  color: { A: '#1976D2', B: '#2E7D32', C: '#C9A227' }[item.order_type] || 'text.secondary',
                                  bgcolor: ({ A: '#1976D2', B: '#2E7D32', C: '#C9A227' }[item.order_type] || '#78909C') + '1F',
                                  border: '1px solid ' + ({ A: '#1976D2', B: '#2E7D32', C: '#C9A227' }[item.order_type] || '#78909C') + '66'
                                }}
                              />
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell sx={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.project_name || '-'}</TableCell>
                          <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{fmtMoney(item.total_amount)}</TableCell>
                          <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{fmtDate(item.invoiced_date)}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800, whiteSpace: 'nowrap', color: urgent ? 'error.main' : 'warning.main' }}>
                            {days} 天
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      <Grid container spacing={2} sx={{ mx: -2 }}>
        <Grid item xs={12}>
          <Card>
            <Box sx={{ height: 4, borderRadius: '10px 10px 0 0', bgcolor: '#C9A227' }} />
            <CardContent>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Box sx={{ width: 4, height: 22, borderRadius: 2, bgcolor: '#C9A227' }} />
                  <Typography variant="h6">最终客户金额排行</Typography>
                </Stack>
              </Stack>
              {(data.customerTotals || []).length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                  暂无数据
                </Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ '& th': { bgcolor: 'action.hover', fontWeight: 700, whiteSpace: 'nowrap' } }}>
                      <TableCell sx={{ width: 70 }}>排名</TableCell>
                      <TableCell>最终客户</TableCell>
                      <TableCell align="right">订单数</TableCell>
                      <TableCell align="right">总金额</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(data.customerTotals || []).map((item, index) => (
                      <TableRow key={item.customer_name || `customer-${index}`} hover>
                        <TableCell>
                          <Box
                            sx={{
                              width: 28,
                              height: 28,
                              borderRadius: 1.5,
                              bgcolor: index === 0 ? '#C9A227' : '#C9A22733',
                              color: index === 0 ? '#fff' : '#8A6D00',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 800,
                              fontSize: 13
                            }}
                          >
                            {index === 0 ? <EmojiEventsIcon sx={{ fontSize: 16 }} /> : index + 1}
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontWeight: index === 0 ? 800 : 600, color: index === 0 ? '#8A6D00' : 'text.primary' }}>
                          {item.customer_name || '未分配客户'}
                        </TableCell>
                        <TableCell align="right">{item.order_count} 个</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800, whiteSpace: 'nowrap', color: index === 0 ? '#8A6D00' : 'text.primary' }}>
                          ¥ {fmtMoney(item.total_amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
