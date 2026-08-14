import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CheckIcon from '@mui/icons-material/Check';
import PaymentsIcon from '@mui/icons-material/Payments';
import api, { errorMessage } from '../api';
import { fmtMoney, fmtDateTime } from '../utils/helpers';
import StepWrapper from './StepWrapper';

export default function StepCommission({ order, readOnly, onChanged }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [remark, setRemark] = useState('');
  const [error, setError] = useState('');
  const matched = Number(order.commission_matched) === 1;
  const canManual = !readOnly && order.status === 'commission' && !matched;

  const manual = async () => {
    if (amount.trim() === '' || !Number.isFinite(Number(amount)) || Number(amount) < 0) {
      setError('补录金额不能小于 0');
      return;
    }
    setError('');
    try {
      await api.post('/commission/manual', { order_id: order.id, amount: Number(amount), remark });
      setOpen(false);
      setAmount('');
      setRemark('');
      setError('');
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <StepWrapper title="佣金结算" subtitle="佣金 Excel 自动匹配或特殊情况人工补录" readOnly={readOnly}>
      {error && (
        <Box sx={{ mb: 2 }}>
          <Alert severity="error">{error}</Alert>
        </Box>
      )}
      {matched ? (
        <Stack spacing={1}>
          <Chip size="small" color="success" label="佣金已匹配" sx={{ alignSelf: 'flex-start' }} />
          <Typography variant="body2">佣金金额：¥ {fmtMoney(order.commission_amount)}</Typography>
          <Typography variant="body2">结算时间：{fmtDateTime(order.commission_date)}</Typography>
        </Stack>
      ) : (
        <Alert severity="info" sx={{ mb: 2 }}>
          该商机尚未匹配佣金，保持等待下次佣金 Excel 匹配；特殊情况可由管理员人工补录。
        </Alert>
      )}
      {canManual && (
        <Button variant="contained" color="warning" onClick={() => setOpen(true)}>
          人工补录佣金
        </Button>
      )}

      <Dialog open={open} onClose={() => { setOpen(false); setError(''); }} maxWidth="sm" fullWidth>
        <Box sx={{ height: 4, bgcolor: 'warning.main' }} />
        <DialogTitle sx={{ pb: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1.2}>
            <Box sx={{ width: 38, height: 38, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(237,108,2,0.12)', color: 'warning.main' }}>
              <PaymentsIcon fontSize="small" />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.25 }}>人工补录佣金</Typography>
              <Typography variant="caption" color="text.secondary">仅用于特殊业务场景，提交后该商机将进入闭环</Typography>
            </Box>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <Box sx={{ p: 1.6, borderRadius: 2, bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider' }}>
              <Stack spacing={0.6}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{order.order_id}</Typography>
                <Typography variant="body2" color="text.secondary">项目：{order.project_name || '-'}</Typography>
                <Typography variant="body2" color="text.secondary">最终客户：{order.end_customer_name || '-'}</Typography>
                {Number(order.total_amount) > 0 && (
                  <Typography variant="body2" color="text.secondary">订单金额：¥ {fmtMoney(order.total_amount)}</Typography>
                )}
              </Stack>
            </Box>
            <TextField
              label="佣金金额（元）"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              fullWidth
              helperText="允许为 0，保存后该商机将关闭"
              InputProps={{ startAdornment: <InputAdornment position="start">¥</InputAdornment> }}
            />
            <TextField label="补录备注" multiline minRows={2} value={remark} onChange={(e) => setRemark(e.target.value)} fullWidth helperText="选填，建议记录补录原因" />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="outlined" onClick={() => { setOpen(false); setError(''); }}>取消</Button>
          <Button variant="contained" color="warning" startIcon={<CheckIcon />} onClick={manual}>
            确认补录
          </Button>
        </DialogActions>
      </Dialog>
    </StepWrapper>
  );
}
