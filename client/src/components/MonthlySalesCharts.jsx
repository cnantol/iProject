import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { fmtMoney, niceAxisMax, compactYuan, smoothLinePath } from '../utils/helpers';

function ChartFrame({ children, title }) {
  return (
    <Stack spacing={1}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Box sx={{ width: 4, height: 18, borderRadius: 2, bgcolor: '#C9A227' }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{title}</Typography>
      </Stack>
      {children}
    </Stack>
  );
}

function MonthlySalesLineChart({ months }) {
  const rows = (months || []).map((month) => ({
    key: month.key,
    label: month.label || month.key,
    value: Number(month.total) || 0
  }));
  if (rows.length === 0) {
    return <Box sx={{ py: 3, textAlign: 'center', color: 'text.secondary' }}>暂无数据</Box>;
  }

  const W = 760;
  const H = 260;
  const PL = 70;
  const PR = 20;
  const PT = 30;
  const PB = 44;
  const innerW = W - PL - PR;
  const innerH = H - PT - PB;
  const axisMax = niceAxisMax(Math.max(...rows.map((row) => row.value), 1));
  const xFor = (index) => (rows.length === 1 ? PL + innerW / 2 : PL + (innerW * index) / (rows.length - 1));
  const yFor = (value) => PT + innerH * (1 - value / axisMax);
  const pts = rows.map((row, index) => ({ ...row, x: xFor(index), y: yFor(row.value) }));
  const baseline = PT + innerH;
  const line = smoothLinePath(pts);
  const area = `${line} L ${pts[pts.length - 1].x} ${baseline} L ${pts[0].x} ${baseline} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => axisMax * ratio);

  return (
    <Box sx={{ width: '100%', overflow: 'hidden' }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="最近一年月度销售额曲线图" style={{ display: 'block', width: '100%', height: 'auto' }}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PL} x2={W - PR} y1={yFor(tick)} y2={yFor(tick)} stroke="rgba(120,144,156,0.25)" strokeDasharray="4 4" />
            <text x={PL - 10} y={yFor(tick) + 4} textAnchor="end" fontSize={11} fill="#78909C">
              {compactYuan(tick)}
            </text>
          </g>
        ))}
        <path d={area} fill="rgba(201,162,39,0.10)" />
        <path d={line} fill="none" stroke="#C9A227" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((point) => (
          <g key={point.key}>
            <circle cx={point.x} cy={point.y} r={4} fill="#FFFFFF" stroke="#C9A227" strokeWidth={2.5}>
              <title>{`${point.label} · 销售额 ¥${fmtMoney(point.value)}`}</title>
            </circle>
            <text x={point.x} y={point.y - 10} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#8A6D00">
              {compactYuan(point.value)}
            </text>
          </g>
        ))}
        {pts.map((point) => (
          <text key={`${point.key}-axis`} x={point.x} y={H - PB + 24} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="#546E7A">
            {point.label}
          </text>
        ))}
      </svg>
    </Box>
  );
}

export default function MonthlySalesCharts({ data }) {
  const months = data?.months || [];
  return (
    <ChartFrame title="月度销售总额">
      <MonthlySalesLineChart months={months} />
    </ChartFrame>
  );
}
