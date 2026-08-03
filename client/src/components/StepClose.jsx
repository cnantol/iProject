import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { fmtMoney, fmtDateTime } from '../utils/helpers';
import { STATUS_LABELS } from '../utils/constants';
import StepWrapper from './StepWrapper';

export default function StepClose({ order }) {
  const closed = order.status === 'closed';
  const lostClosed = order.status === 'lost_closed';
  const notClosed = !closed && !lostClosed;
  const subtitle = closed
    ? '中标销售机会已闭环，全步骤只读'
    : lostClosed
      ? '未中标销售机会已关闭，全步骤只读'
      : `销售机会尚未闭环（当前阶段：${STATUS_LABELS[order.status] || order.status}）`;
  return (
    <StepWrapper title="项目闭环" subtitle={subtitle}>
      <Alert severity={closed ? 'success' : lostClosed ? 'warning' : 'info'} sx={{ mb: 2 }}>
        {closed
          ? '该销售机会已完成佣金结算并闭环，数据仅供查阅。'
          : lostClosed
            ? '该销售机会已标记未中标并关闭。'
            : '该销售机会尚未闭环，佣金匹配完成后将自动进入闭环。'}
      </Alert>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <Typography variant="body2" color="text.secondary">中标结果</Typography>
          <Chip
            size="small"
            color={order.bid_result === 'won' ? 'success' : order.bid_result === 'lost' ? 'error' : 'default'}
            label={order.bid_result === 'won' ? '中标（won）' : order.bid_result === 'lost' ? '未中标（lost）' : '待确认'}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Typography variant="body2" color="text.secondary">销售机会总金额</Typography>
          <Typography variant="h6">¥ {fmtMoney(order.total_amount)}</Typography>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Typography variant="body2" color="text.secondary">佣金金额</Typography>
          <Typography variant="h6">¥ {fmtMoney(order.commission_amount)}</Typography>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Typography variant="body2" color="text.secondary">闭环时间</Typography>
          <Typography variant="h6" sx={{ fontSize: 16 }}>{fmtDateTime(order.closed_at)}</Typography>
        </Grid>
      </Grid>
      <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap', rowGap: 1 }} useFlexGap>
        <Chip size="small" label={`发货：${Number(order.delivered) === 1 ? '已完成' : '未完成'}`} />
        <Chip size="small" label={`开票：${Number(order.invoiced) === 1 ? '已完成' : '未完成'}`} />
        <Chip size="small" label={`Sales Order：${order.sales_order || '-'}`} />
      </Stack>
    </StepWrapper>
  );
}
