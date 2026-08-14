import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import CancelIcon from '@mui/icons-material/Cancel';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import api, { errorMessage } from '../api';
import { fmtMoney } from '../utils/helpers';
import StepWrapper from './StepWrapper';

export default function StepBidResult({ order, readOnly, onChanged }) {
  const [lostOpen, setLostOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [error, setError] = useState('');
  const editable = !readOnly && order.status === 'bid_decision';
  const selectedRound = (order.quotations || []).find((round) => round.id === order.selected_round_id);

  const bid = async (result) => {
    setError('');
    try {
      await api.patch(`/orders/${order.id}/status`, { action: 'bid', result });
      setLostOpen(false);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <StepWrapper
      title="中标结果"
      subtitle="项目中标结果确认"
      readOnly={readOnly}
      badge={
        order.bid_result === 'won' ? (
          <Chip size="small" color="success" label="中标（won）" sx={{ fontWeight: 700 }} />
        ) : order.bid_result === 'lost' ? (
          <Chip size="small" color="error" label="未中标（lost）" sx={{ fontWeight: 700 }} />
        ) : null
      }
    >
      {error && (
        <Box sx={{ mb: 2 }}>
          <Alert severity="error">{error}</Alert>
        </Box>
      )}
      <Stack spacing={2}>
        <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            审批选中报价轮次
          </Typography>
          <Typography variant="body2">
            {selectedRound ? `${selectedRound.round_label || `R${selectedRound.round_no}`} · 合计 ¥ ${fmtMoney(selectedRound.total_amount)}` : '未选定'}
          </Typography>
        </Box>
        {selectedRound && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>物料号</TableCell>
                <TableCell>描述</TableCell>
                <TableCell>价格来源</TableCell>
                <TableCell align="right">最终单价</TableCell>
                <TableCell align="right">数量</TableCell>
                <TableCell align="right">行金额</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(selectedRound.items || []).map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.material_no || '-'}</TableCell>
                  <TableCell>{item.description || '-'}</TableCell>
                  <TableCell>{item.price_source || '-'}</TableCell>
                  <TableCell align="right">{fmtMoney(item.final_unit_price, 4)}</TableCell>
                  <TableCell align="right">{item.qty}</TableCell>
                  <TableCell align="right">{fmtMoney(item.line_amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {editable && (
          <Stack direction="row" spacing={2} sx={{ justifyContent: 'flex-end', flexWrap: 'wrap', rowGap: 1 }}>
            <Button variant="contained" color="success" startIcon={<EmojiEventsIcon />} onClick={() => bid('won')}>
              中标（won）
            </Button>
            <Button variant="outlined" color="error" onClick={() => setLostOpen(true)}>
              未中标（lost）
            </Button>
            <Button variant="outlined" color="inherit" startIcon={<CancelIcon />} onClick={() => setCancelOpen(true)}>
              合同取消
            </Button>
          </Stack>
        )}
        {order.status === 'cancelled' && (
          <Alert severity="warning">
            该商机因合同取消而关闭。如需恢复，请在「流程撤回」中回退至中标结果。
          </Alert>
        )}
        {order.status === 'lost_closed' && (
          <Alert severity="warning">
            该商机已标记未中标并关闭。如需恢复，请在「流程撤回」中回退至中标结果。
          </Alert>
        )}
        {order.status === 'finance' && order.bid_result === 'won' && <Chip size="small" color="success" label="已确认中标" />}
      </Stack>

      <Dialog open={lostOpen} onClose={() => setLostOpen(false)}>
        <DialogTitle>确认未中标</DialogTitle>
        <DialogContent>
          <DialogContentText>未中标后商机将进入 lost_closed 只读终点，不可在流程中恢复。是否确认？</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLostOpen(false)}>取消</Button>
          <Button color="error" onClick={() => bid('lost')}>
            确认未中标
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)}>
        <DialogTitle>确认合同取消</DialogTitle>
        <DialogContent>
          <DialogContentText>合同取消后商机将进入取消关闭终点，不可在流程中恢复。是否确认？</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelOpen(false)}>取消</Button>
          <Button color="error" onClick={() => bid('cancelled')}>
            确认合同取消
          </Button>
        </DialogActions>
      </Dialog>
    </StepWrapper>
  );
}
