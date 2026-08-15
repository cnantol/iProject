import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { fmtMoney } from '../utils/helpers';

const CUSTOMER_COLORS = ['#1976D2', '#2E7D32', '#F57C00', '#C9A227', '#7B1FA2', '#00897B', '#78909C'];

function niceAxisMax(value) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function compactYuan(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  if (Math.abs(num) >= 10000) return `${(num / 10000).toFixed(1)}万`;
  return fmtMoney(num);
}

export default function StackedMonthlyBarChart({ months, customers, ariaLabel, emptyText = '暂无数据' }) {
  const monthRows = (months || []).map((month) => ({ key: month.key, label: month.label || month.key, total: Number(month.total) || 0 }));
  if (monthRows.length === 0) {
    return <Box sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>{emptyText}</Box>;
  }

  const W = 720;
  const H = 300;
  const PL = 64;
  const PR = 16;
  const PT = 24;
  const PB = 44;
  const innerW = W - PL - PR;
  const innerH = H - PT - PB;
  const axisMax = niceAxisMax(Math.max(...monthRows.map((month) => month.total), 1));
  const groupWidth = innerW / monthRows.length;
  const barWidth = Math.max(10, groupWidth * 0.62);
  const yFor = (value) => PT + innerH * (1 - value / axisMax);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => axisMax * ratio);
  const seriesByCustomer = (customers || []).map((customer, index) => ({
    ...customer,
    color: CUSTOMER_COLORS[index % CUSTOMER_COLORS.length],
    values: new Map((customer.series || []).map((item) => [item.key, Number(item.amount) || 0]))
  }));

  return (
    <Box sx={{ width: '100%', overflow: 'hidden' }}>
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
        {seriesByCustomer.map((customer) => (
          <Stack key={customer.customer_name} direction="row" alignItems="center" spacing={0.6}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: customer.color }} />
            <Typography variant="caption" sx={{ fontWeight: 700 }}>{customer.customer_name}</Typography>
          </Stack>
        ))}
      </Stack>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} style={{ display: 'block', width: '100%', height: 'auto' }}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PL} x2={W - PR} y1={yFor(tick)} y2={yFor(tick)} stroke="rgba(120,144,156,0.25)" strokeDasharray="4 4" />
            <text x={PL - 10} y={yFor(tick) + 4} textAnchor="end" fontSize={11} fill="#78909C">
              {compactYuan(tick)}
            </text>
          </g>
        ))}
        {monthRows.map((month, monthIndex) => {
          const centerX = PL + groupWidth * (monthIndex + 0.5);
          let cumulative = 0;
          return (
            <g key={month.key}>
              {seriesByCustomer.map((customer) => {
                const amount = customer.values.get(month.key) || 0;
                const y = yFor(cumulative + amount);
                const height = yFor(cumulative) - y;
                cumulative += amount;
                if (height <= 0) return null;
                return (
                  <rect
                    key={customer.customer_name}
                    x={centerX - barWidth / 2}
                    y={y}
                    width={barWidth}
                    height={height}
                    rx={1.5}
                    fill={customer.color}
                  >
                    <title>{`${month.label} · ${customer.customer_name} ¥${fmtMoney(amount)}`}</title>
                  </rect>
                );
              })}
              <text x={centerX} y={H - PB + 24} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="#546E7A">
                {month.label}
              </text>
            </g>
          );
        })}
      </svg>
    </Box>
  );
}
