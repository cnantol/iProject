import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import FormControl from '@mui/material/FormControl';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import api, { errorMessage } from '../api';
import { PRIORITY_LABELS, PRIORITY_COLORS } from '../utils/constants';
import { todayStr, fmtDateTime, overdueDays } from '../utils/helpers';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };

export default function TodoList() {
  const navigate = useNavigate();
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [todos, setTodos] = useState([]);
  const [orders, setOrders] = useState([]);
  const [priorityFilter, setPriorityFilter] = useState('');
  const [sortMode, setSortMode] = useState('priority');
  const [showDone, setShowDone] = useState(false);
  const [quick, setQuick] = useState({ title: '', priority: 'medium', due_date: todayStr(), order_ref: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [todoRes, orderRes] = await Promise.all([api.get('/todos', { params: { limit: 500 } }), api.get('/orders', { params: { limit: 100 } })]);
      setTodos(todoRes.data.items || []);
      setOrders(orderRes.data.items || []);
      setError('');
    } catch (err) {
      setError(errorMessage(err, '加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const today = todayStr();
  const filtered = useMemo(() => todos.filter((todo) => !priorityFilter || todo.priority === priorityFilter), [todos, priorityFilter]);
  const openTodos = filtered.filter((todo) => Number(todo.is_completed) === 0);
  const doneTodos = filtered.filter((todo) => Number(todo.is_completed) === 1);

  const groupSort = (rows) =>
    [...rows].sort((a, b) => {
      if (sortMode === 'priority') {
        const pa = PRIORITY_ORDER[a.priority] ?? 9;
        const pb = PRIORITY_ORDER[b.priority] ?? 9;
        if (pa !== pb) return pa - pb;
      }
      if (a.due_date && b.due_date) return a.due_date < b.due_date ? -1 : 1;
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });

  const overdue = groupSort(openTodos.filter((todo) => todo.due_date && todo.due_date < today));
  const todayList = groupSort(openTodos.filter((todo) => todo.due_date === today));
  const future = groupSort(openTodos.filter((todo) => !todo.due_date || todo.due_date > today));

  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const firstWeekday = (new Date(cursor.year, cursor.month, 1).getDay() + 6) % 7;
  const dateKey = (day) => `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const todoDates = new Set(openTodos.map((todo) => todo.due_date).filter(Boolean));

  const toggle = async (todo) => {
    try {
      await api.patch(`/todos/${todo.id}/toggle`, { is_completed: Number(todo.is_completed) === 1 ? 0 : 1 });
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const remove = async (todo) => {
    if (!window.confirm('确认删除该待办？')) return;
    try {
      await api.delete(`/todos/${todo.id}`);
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const addQuick = async () => {
    if (!quick.title.trim()) {
      setError('待办标题必填');
      return;
    }
    setError('');
    try {
      await api.post('/todos', {
        title: quick.title.trim(),
        priority: quick.priority,
        due_date: quick.due_date || null,
        order_ref: quick.order_ref ? Number(quick.order_ref) : null
      });
      setQuick({ title: '', priority: 'medium', due_date: selectedDate || today, order_ref: '' });
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const renderList = (rows, emptyText) => (
    <Box>
      {rows.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1.5 }}>
          {emptyText}
        </Typography>
      )}
      {rows.map((todo) => (
        <ListItem
          key={todo.id}
          disableGutters
          secondaryAction={
            <IconButton edge="end" size="small" onClick={() => remove(todo)} title="删除">
              <DeleteIcon />
            </IconButton>
          }
        >
          <ListItemIcon>
            <Checkbox checked={Number(todo.is_completed) === 1} onChange={() => toggle(todo)} color="success" />
          </ListItemIcon>
          <ListItemButton sx={{ borderRadius: 1 }} onClick={() => todo.order_ref && navigate(`/orders/${todo.order_ref}`)}>
            <ListItemText
              primary={todo.title}
              secondary={
                <>
                  <Chip size="small" sx={{ bgcolor: `${PRIORITY_COLORS[todo.priority]}22`, color: PRIORITY_COLORS[todo.priority] }} label={PRIORITY_LABELS[todo.priority] || todo.priority} />
                  {todo.due_date ? ` 截止 ${todo.due_date}` : ' 无截止日期'}
                  {todo.due_date && todo.due_date < today && `（已逾期 ${overdueDays(todo.due_date)} 天）`}
                  {todo.order_number ? ` ｜ ${todo.order_number}` : ''}
                  {Number(todo.is_completed) === 1 && todo.completed_at ? ` ｜ 完成于 ${fmtDateTime(todo.completed_at)}` : ''}
                </>
              }
              secondaryTypographyProps={{ component: 'span' }}
              sx={{ textDecoration: Number(todo.is_completed) === 1 ? 'line-through' : 'none', color: Number(todo.is_completed) === 1 ? 'text.disabled' : 'inherit' }}
            />
          </ListItemButton>
        </ListItem>
      ))}
    </Box>
  );

  return (
    <Stack spacing={2}>
      <Typography variant="h5">待办事项</Typography>
      {error && <Alert severity="error">{error}</Alert>}

      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
            <TextField size="small" label="标题（必填）" value={quick.title} onChange={(e) => setQuick((prev) => ({ ...prev, title: e.target.value }))} sx={{ flex: 1 }} />
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel>优先级</InputLabel>
              <Select value={quick.priority} label="优先级" onChange={(e) => setQuick((prev) => ({ ...prev, priority: e.target.value }))}>
                {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
                  <MenuItem key={key} value={key}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField size="small" label="截止日期" type="date" value={quick.due_date} onChange={(e) => setQuick((prev) => ({ ...prev, due_date: e.target.value }))} InputLabelProps={{ shrink: true }} />
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>关联订单</InputLabel>
              <Select value={quick.order_ref} label="关联订单" onChange={(e) => setQuick((prev) => ({ ...prev, order_ref: e.target.value }))}>
                <MenuItem value="">不关联</MenuItem>
                {orders.map((order) => (
                  <MenuItem key={order.id} value={order.id}>
                    {order.order_id} · {order.project_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button variant="contained" startIcon={<AddIcon />} onClick={addQuick}>
              快速新增
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        <Grid item xs={12} md={4} lg={3.5}>
          <Card>
            <CardContent>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <IconButton onClick={() => setCursor((prev) => (prev.month === 0 ? { year: prev.year - 1, month: 11 } : { ...prev, month: prev.month - 1 }))}>
                  <ChevronLeftIcon />
                </IconButton>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {cursor.year} 年 {cursor.month + 1} 月
                </Typography>
                <IconButton onClick={() => setCursor((prev) => (prev.month === 11 ? { year: prev.year + 1, month: 0 } : { ...prev, month: prev.month + 1 }))}>
                  <ChevronRightIcon />
                </IconButton>
              </Stack>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5, mt: 1 }}>
                {WEEKDAYS.map((day) => (
                  <Typography key={day} variant="caption" align="center" color="text.secondary">
                    {day}
                  </Typography>
                ))}
                {Array.from({ length: firstWeekday }).map((_, index) => (
                  <Box key={`empty-${index}`} />
                ))}
                {Array.from({ length: daysInMonth }).map((_, index) => {
                  const day = index + 1;
                  const key = dateKey(day);
                  const hasTodo = todoDates.has(key);
                  const selected = key === selectedDate;
                  return (
                    <Box
                      key={key}
                      onClick={() => setSelectedDate(key)}
                      sx={{
                        aspectRatio: '1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 1.5,
                        cursor: 'pointer',
                        bgcolor: selected ? 'primary.main' : 'transparent',
                        color: selected ? 'primary.contrastText' : 'inherit',
                        position: 'relative',
                        '&:hover': { bgcolor: selected ? 'primary.main' : 'action.hover' }
                      }}
                    >
                      {day}
                      {hasTodo && (
                        <Box sx={{ position: 'absolute', bottom: 3, width: 5, height: 5, borderRadius: '50%', bgcolor: selected ? 'white' : 'error.main' }} />
                      )}
                    </Box>
                  );
                })}
              </Box>
            </CardContent>
          </Card>
          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <ToggleButtonGroup size="small" exclusive value={priorityFilter} onChange={(_, value) => setPriorityFilter(value || '')}>
                  <ToggleButton value="">全部</ToggleButton>
                  {Object.keys(PRIORITY_LABELS).map((key) => (
                    <ToggleButton key={key} value={key}>
                      {PRIORITY_LABELS[key]}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
                <ToggleButtonGroup size="small" exclusive value={sortMode} onChange={(_, value) => setSortMode(value || 'priority')}>
                  <ToggleButton value="priority">按优先级</ToggleButton>
                  <ToggleButton value="date">按日期</ToggleButton>
                </ToggleButtonGroup>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={8} lg={8.5}>
          <Card>
            <CardContent>
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                  <CircularProgress />
                </Box>
              ) : (
                <Stack spacing={2}>
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'error.main' }}>
                      已逾期（{overdue.length}）
                    </Typography>
                    {renderList(overdue, '无逾期待办')}
                  </Box>
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'primary.main' }}>
                      今天到期（{todayList.length}）
                    </Typography>
                    {renderList(todayList, '今天无到期待办')}
                  </Box>
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      未来（{future.length}）
                    </Typography>
                    {renderList(future, '暂无未来待办')}
                  </Box>
                  <Box>
                    <Button size="small" endIcon={showDone ? <ExpandLessIcon /> : <ExpandMoreIcon />} onClick={() => setShowDone((prev) => !prev)}>
                      已完成（{doneTodos.length}）
                    </Button>
                    <Collapse in={showDone}>
                      {renderList(groupSort(doneTodos), '暂无已完成待办')}
                    </Collapse>
                  </Box>
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
