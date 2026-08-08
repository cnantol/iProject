import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Pagination from '@mui/material/Pagination';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import Typography from '@mui/material/Typography';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import api, { errorMessage } from '../api';
import { fmtMoney } from '../utils/helpers';
import { useFieldLabels } from '../utils/fieldLabels';

const POS_COLOR = '#C62828';
const NEG_COLOR = '#2E7D32';

// 按显示精度（两位小数）判定正负，避免极小尾差被误判为非零
function round2num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

function signColor(n) {
  if (!Number.isFinite(n) || n === 0) return 'text.secondary';
  return n > 0 ? POS_COLOR : NEG_COLOR;
}

// 负数前置 -，货币符号统一放在数值前：-¥1,234.00 / ¥1,234.00
function signedMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  const body = fmtMoney(Math.abs(n));
  return n < 0 ? `-¥${body}` : `¥${body}`;
}

function signedRatio(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return `${n.toFixed(2)}%`;
}

export default function CommissionDeviations() {
  const { t } = useFieldLabels();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortField, setSortField] = useState('diff_amount');
  const [sortDir, setSortDir] = useState('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/commission/deviations', { params: { page, limit: pageSize, sort: sortField, order: sortDir } });
      setItems(data.items || []);
      setTotal(data.total || 0);
      setError('');
    } catch (err) {
      setError(errorMessage(err, '加载失败'));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sortField, sortDir]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setPage(1);
  };

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card>
      <Box sx={{ height: 4, borderRadius: '10px 10px 0 0', background: 'linear-gradient(90deg,#2E7D32,#C62828)' }} />
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <Box sx={{ width: 4, height: 22, borderRadius: 2, background: 'linear-gradient(180deg,#2E7D32,#C62828)' }} />
          <Typography variant="h6" sx={{ fontWeight: 800 }}>全部偏差明细</Typography>
          <Chip size="small" variant="outlined" label={`共 ${total} 条`} sx={{ fontWeight: 700 }} />
          {total > 0 && (
            <Chip size="small" color="warning" variant="outlined" icon={<WarningAmberIcon />} label="默认按偏差降序" sx={{ fontWeight: 700 }} />
          )}
        </Stack>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
          <Chip size="small" sx={{ bgcolor: 'rgba(198,40,40,0.12)', color: POS_COLOR, fontWeight: 700, border: '1px solid rgba(198,40,40,0.35)' }} label="正偏差 · 实际高于期望" />
          <Chip size="small" sx={{ bgcolor: 'rgba(46,125,50,0.12)', color: NEG_COLOR, fontWeight: 700, border: '1px solid rgba(46,125,50,0.35)' }} label="负偏差 · 实际低于期望" />
          <Chip size="small" variant="outlined" sx={{ fontWeight: 700, color: 'text.secondary' }} label="偏差为 0 · 无高亮" />
        </Stack>
        {error && <Box sx={{ color: 'error.main', typography: 'body2', mb: 1.5 }}>{error}</Box>}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : items.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            暂无佣金偏差记录
          </Typography>
        ) : (
          <>
            <Table size="small" sx={{ '& .MuiTableCell-head': { position: 'sticky', top: 0, zIndex: 1 } }}>
              <TableHead>
                <TableRow sx={{ '& th': { bgcolor: 'action.hover', fontWeight: 700, whiteSpace: 'nowrap', borderBottom: '2px solid', borderColor: 'divider' } }}>
                  <TableCell>机会号</TableCell>
                  <TableCell>{t('end_customer')}</TableCell>
                  <TableCell align="center" sx={{ width: 76 }}>项目类型</TableCell>
                  <TableCell>项目名称</TableCell>
                  <TableCell align="right">订单金额</TableCell>
                  <TableCell align="right">佣金（期望 / 实际）</TableCell>
                  <TableCell align="right">
                    <TableSortLabel
                      active={sortField === 'diff_amount'}
                      direction={sortField === 'diff_amount' ? sortDir : 'asc'}
                      onClick={() => handleSort('diff_amount')}
                    >
                      偏差金额
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="right">
                    <TableSortLabel
                      active={sortField === 'diff_ratio'}
                      direction={sortField === 'diff_ratio' ? sortDir : 'asc'}
                      onClick={() => handleSort('diff_ratio')}
                    >
                      偏差比例
                    </TableSortLabel>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
               {items.map((item) => {
                  const diffRound = round2num(item.diff_amount);
                  return (
                  <TableRow
                    key={item.id}
                    hover
                    onClick={() => navigate(`/orders/${item.id}`)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell sx={{ fontWeight: 700, color: 'primary.main', whiteSpace: 'nowrap' }}>{item.order_id}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.end_customer_name || '未分配客户'}
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
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <Stack spacing={0.25} alignItems="flex-end">
                        <Typography variant="caption" sx={{ fontSize: 11, lineHeight: 1.2, color: signColor(diffRound), fontWeight: 700 }}>
                          期望 {signedMoney(item.expected_commission)}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 800, fontSize: 13, lineHeight: 1.3, color: signColor(diffRound) }}>
                          实际 {signedMoney(item.commission_amount)}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        whiteSpace: 'nowrap',
                        fontWeight: 900,
                        fontSize: 14,
                        color: signColor(diffRound),
                        letterSpacing: 0.3,
                      }}
                    >
                      {signedMoney(item.diff_amount)}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <Typography variant="body2" sx={{ fontWeight: 800, fontSize: 13, color: signColor(diffRound) }}>
                        {item.diff_ratio != null ? signedRatio(item.diff_ratio) : '-'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" spacing={1.5} sx={{ mt: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                共 {total} 条，第 {page} / {Math.max(1, Math.ceil(total / pageSize))} 页
              </Typography>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="caption" color="text.secondary">每页</Typography>
                <Select
                  size="small"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  sx={{ minWidth: 76, '& .MuiSelect-select': { py: 0.75, fontSize: 13 } }}
                >
                  {[10, 20, 50, 100].map((n) => (
                    <MenuItem key={n} value={n}>
                      {n} 条
                    </MenuItem>
                  ))}
                </Select>
                <Pagination
                  size="small"
                  count={Math.max(1, Math.ceil(total / pageSize))}
                  page={page}
                  onChange={(_, value) => setPage(value)}
                  color="primary"
                />
              </Stack>
            </Stack>
          </>
        )}
      </CardContent>
    </Card>
  );
}
