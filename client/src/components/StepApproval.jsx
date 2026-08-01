import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import api, { errorMessage } from '../api';
import { fmtDateTime } from '../utils/helpers';
import StepWrapper from './StepWrapper';

const LINES = [
  { key: 'sales_force', label: 'Sales Force 价格审批' },
  { key: 'oa_contract', label: 'OA 合同审核' }
];

const STATUS_LABELS = { pending: '待审批', approved: '已通过', rejected: '已驳回', superseded: '已取代' };
const STATUS_COLORS = { pending: 'warning', approved: 'success', rejected: 'error', superseded: 'default' };

export default function StepApproval({ order, readOnly, onChanged }) {
  const [rejectTarget, setRejectTarget] = useState(null);
  const [remark, setRemark] = useState('');
  const [error, setError] = useState('');
  const approvals = order.approvals || [];
  const selectedRound = (order.quotations || []).find((round) => round.id === order.selected_round_id);
  const editable = !readOnly && order.status === 'approval_pending';

  const submitLine = async (type) => {
    setError('');
    try {
      await api.post(`/orders/${order.id}/approvals`, { approval_type: type });
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const act = async (recordId, action) => {
    setError('');
    try {
      await api.put(`/orders/${order.id}/approvals/${recordId}`, { action, remark: action === 'reject' ? remark : undefined });
      setRejectTarget(null);
      setRemark('');
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const latest = (type) => approvals.filter((record) => record.approval_type === type).slice(-1)[0];
  const history = (type) => approvals.filter((record) => record.approval_type === type);

  return (
    <StepWrapper title="并行审批" subtitle="Sales Force 与 OA 合同双线审批（同一报价轮次）" readOnly={readOnly}>
      {error && (
        <Box sx={{ mb: 2 }}>
          <Alert severity="error">{error}</Alert>
        </Box>
      )}
      <Typography variant="body2" sx={{ mb: 2 }}>
        审批报价轮次：
        <Chip size="small" label={selectedRound ? `${selectedRound.round_label || `R${selectedRound.round_no}`}（¥ ${selectedRound.total_amount ?? 0}）` : '未选定'} sx={{ ml: 1 }} />
      </Typography>
      <Grid container spacing={2}>
        {LINES.map((line) => {
          const record = latest(line.key);
          return (
            <Grid item xs={12} md={6} key={line.key}>
              <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {line.label}
                  </Typography>
                  {record && (
                    <Chip size="small" color={STATUS_COLORS[record.status]} label={STATUS_LABELS[record.status] || record.status} />
                  )}
                </Stack>
                {!record && <Typography variant="body2" color="text.secondary">尚未提交申请</Typography>}
                {record && (
                  <Typography variant="body2" color="text.secondary">
                    提交时间：{fmtDateTime(record.applied_at)}
                    {record.responded_at ? `｜处理时间：${fmtDateTime(record.responded_at)}` : ''}
                    {record.remark ? `｜备注：${record.remark}` : ''}
                  </Typography>
                )}
                <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                  {!record && editable && (
                    <Button size="small" variant="contained" onClick={() => submitLine(line.key)}>
                      提交申请
                    </Button>
                  )}
                  {record && record.status === 'pending' && editable && (
                    <>
                      <Button size="small" variant="contained" color="success" onClick={() => act(record.id, 'approve')}>
                        通过
                      </Button>
                      <Button size="small" variant="outlined" color="error" onClick={() => setRejectTarget(record)}>
                        驳回
                      </Button>
                    </>
                  )}
                </Stack>
                {history(line.key).length > 1 && (
                  <>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="caption" color="text.secondary">
                      历史记录：
                    </Typography>
                    {history(line.key)
                      .slice(0, -1)
                      .reverse()
                      .map((item) => (
                        <Typography key={item.id} variant="caption" display="block" color="text.secondary">
                          {STATUS_LABELS[item.status]} · {fmtDateTime(item.responded_at || item.applied_at)}
                        </Typography>
                      ))}
                  </>
                )}
              </Box>
            </Grid>
          );
        })}
      </Grid>

      <Dialog open={Boolean(rejectTarget)} onClose={() => setRejectTarget(null)}>
        <DialogTitle>确认驳回审批</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            驳回后订单将回退至报价阶段，选中轮次回退草稿并可修改后重新提交。
          </Typography>
          <TextField
            label="审批备注"
            fullWidth
            multiline
            minRows={2}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectTarget(null)}>取消</Button>
          <Button color="error" onClick={() => act(rejectTarget.id, 'reject')}>
            确认驳回
          </Button>
        </DialogActions>
      </Dialog>
    </StepWrapper>
  );
}
