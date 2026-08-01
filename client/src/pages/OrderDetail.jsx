import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import api, { errorMessage } from '../api';
import { STATUS_LABELS, STATUS_COLORS } from '../utils/constants';
import { fmtDateTime, isStepReadOnly } from '../utils/helpers';
import OrderStepper from '../components/OrderStepper';
import StepCustomerInfo from '../components/StepCustomerInfo';
import StepProposal from '../components/StepProposal';
import StepQuotation from '../components/StepQuotation';
import StepApproval from '../components/StepApproval';
import StepBidResult from '../components/StepBidResult';
import StepFinance from '../components/StepFinance';
import StepShipping from '../components/StepShipping';
import StepInvoicing from '../components/StepInvoicing';
import StepCommission from '../components/StepCommission';
import StepClose from '../components/StepClose';

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeKey, setActiveKey] = useState('customer_info');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/orders/${id}`);
      setDetail(data);
      setError('');
    } catch (err) {
      setError(errorMessage(err, '加载失败'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (detail) {
      setActiveKey((prev) => {
        if (prev === 'shipping' || prev === 'invoicing') return prev;
        return detail.order.status === 'shipping_invoicing' ? 'shipping' : detail.order.status;
      });
    }
  }, [detail?.order.status]);

  const removeOrder = async () => {
    try {
      await api.delete(`/orders/${id}`);
      navigate('/orders');
    } catch (err) {
      setError(errorMessage(err));
      setDeleteOpen(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (error && !detail) {
    return <Alert severity="error" action={<Button onClick={load}>重试</Button>}>{error}</Alert>;
  }
  if (!detail) return null;

  const { order } = detail;
  const readOnly = isStepReadOnly(order, activeKey);
  const showShippingTabs = order.status === 'shipping_invoicing' && ['shipping', 'invoicing', 'shipping_invoicing'].includes(activeKey);
  const canDelete = ['customer_info', 'proposal', 'quotation'].includes(order.status);

  const renderStep = () => {
    const key = activeKey;
    const common = { order, readOnly: isStepReadOnly(order, key), onChanged: load, onAdvance: load };
    if (key === 'customer_info') return <StepCustomerInfo {...common} />;
    if (key === 'proposal') return <StepProposal {...common} />;
    if (key === 'quotation') return <StepQuotation {...common} />;
    if (key === 'approval_pending') return <StepApproval {...common} />;
    if (key === 'bid_decision') return <StepBidResult {...common} />;
    if (key === 'finance') return <StepFinance {...common} />;
    if (key === 'shipping') return <StepShipping {...common} />;
    if (key === 'invoicing') return <StepInvoicing {...common} />;
    if (key === 'commission') return <StepCommission {...common} />;
    if (key === 'closed' || key === 'lost_closed') return <StepClose order={order} />;
    if (order.status === 'shipping_invoicing') {
      return (
        <>
          <StepShipping {...common} readOnly={false} />
          <Box sx={{ mt: 2 }}>
            <StepInvoicing {...common} readOnly={false} />
          </Box>
        </>
      );
    }
    return <StepClose order={order} />;
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/orders')}>
          返回
        </Button>
        <Typography variant="h5" sx={{ flex: 1 }}>
          {order.order_id}
        </Typography>
        <Chip
          label={STATUS_LABELS[order.status] || order.status}
          sx={{ bgcolor: `${STATUS_COLORS[order.status] || '#78909C'}22`, color: STATUS_COLORS[order.status] || '#78909C', fontWeight: 700 }}
        />
        {canDelete && (
          <Button color="error" startIcon={<DeleteIcon />} onClick={() => setDeleteOpen(true)}>
            删除
          </Button>
        )}
        <Button startIcon={<RefreshIcon />} onClick={load}>
          刷新
        </Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      <Card>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ px: 2, pt: 2 }}>
          <Typography variant="body2" color="text.secondary">项目：{order.project_name || '-'}</Typography>
          <Typography variant="body2" color="text.secondary">最终客户：{order.end_customer_name || '-'}</Typography>
          <Typography variant="body2" color="text.secondary">合同客户：{order.contract_customer_name || '-'}</Typography>
          <Typography variant="body2" color="text.secondary">创建时间：{fmtDateTime(order.created_at)}</Typography>
        </Stack>
        <OrderStepper order={order} activeKey={activeKey} onSelect={setActiveKey} />
      </Card>

      {showShippingTabs && (
        <Card>
          <Tabs value={activeKey === 'invoicing' ? 'invoicing' : 'shipping'} onChange={(_, value) => setActiveKey(value)}>
            <Tab value="shipping" label="发货管理" />
            <Tab value="invoicing" label="开票管理" />
          </Tabs>
        </Card>
      )}

      {renderStep()}

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>删除订单</DialogTitle>
        <DialogContent>
          <DialogContentText>仅早期状态订单可删除，删除后不可恢复。确认删除 {order.order_id}？</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>取消</Button>
          <Button color="error" onClick={removeOrder}>
            确认删除
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
