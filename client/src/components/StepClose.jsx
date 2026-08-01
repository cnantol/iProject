import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { fmtMoney, fmtDateTime } from '../utils/helpers';
import StepWrapper from './StepWrapper';

export default function StepClose({ order }) {
  const closed = order.status === 'closed';
  return (
    <StepWrapper title="项目闭环" subtitle={closed ? '中标订单已闭环，全步骤只读' : '未中标订单已关闭，全步骤只读'}>
      <Alert severity={closed ? 'success' : 'warning'} sx={{ mb: 2 }}>
        {closed ? '该订单已完成佣金结算并闭环，数据仅供查阅。' : '该订单已标记未中标并关闭。'}
      </Alert>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <Typography variant="body2" color="text.secondary">中标结果</Typography>
          <Chip size="small" color={closed ? 'success' : 'error'} label={closed ? '中标（won）' : '未中标（lost）'} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Typography variant="body2" color="text.secondary">订单总金额</Typography>
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
      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        <Chip size="small" label={`发货：${Number(order.delivered) === 1 ? '已完成' : '未完成'}`} />
        <Chip size="small" label={`开票：${Number(order.invoiced) === 1 ? '已完成' : '未完成'}`} />
        <Chip size="small" label={`Sales Order：${order.sales_order || '-'}`} />
      </Stack>
    </StepWrapper>
  );
}
