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
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CancelIcon from '@mui/icons-material/Cancel';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import api, { errorMessage } from '../api';
import { STATUS_LABELS, STATUS_COLORS } from '../utils/constants';
import { fmtDateTime, fmtMoney, isStepReadOnly } from '../utils/helpers';
import { useFieldLabels } from '../utils/fieldLabels';
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
import OrderNotesPanel from '../components/OrderNotesPanel';

function InfoTile({ label, value, color, darkColor, children }) {
  return (
    <Box
      sx={(theme) => {
        const c = theme.palette.mode === 'dark' ? darkColor : color;
        return {
          borderRadius: 2.5,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: `${c}1A`,
          px: 1.75,
          py: 1.4,
          height: '100%'
        };
      }}
    >
      <Typography variant="overline" sx={{ fontWeight: 700, color: (theme) => (theme.palette.mode === 'dark' ? darkColor : color) }}>
        {label}
      </Typography>
      {children !== undefined ? (
        children
      ) : (
        <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.3, wordBreak: 'break-word' }}>
          {value}
        </Typography>
      )}
    </Box>
  );
}

export default function OrderDetail() {
  const { t } = useFieldLabels();
  const { id } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeKey, setActiveKey] = useState('customer_info');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [localFramework, setLocalFramework] = useState(null);

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

  const checkFramework = useCallback(async (customerId) => {
    if (!customerId) {
      setLocalFramework(false);
      return;
    }
    try {
      const { data } = await api.get('/materials/check-framework', { params: { end_customer_id: customerId } });
      setLocalFramework(Number(data.hasFramework) === 1);
    } catch {
      setLocalFramework(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!detail) return;
    const { order: dOrder } = detail;
    if (['customer_info', 'proposal'].includes(dOrder.status)) {
      setLocalFramework(null);
      checkFramework(dOrder.end_customer_id);
    }
  }, [detail, checkFramework]);

  useEffect(() => {
    if (!detail) return;
    setActiveKey((prev) => {
      const status = detail.order.status;
      if (status === 'shipping_invoicing' && (prev === 'shipping' || prev === 'invoicing')) return prev;
      return status === 'shipping_invoicing' ? 'shipping' : status;
    });
  }, [detail]);

  const removeOrder = async () => {
    try {
      await api.delete(`/orders/${id}`);
      navigate('/orders');
    } catch (err) {
      setError(errorMessage(err));
      setDeleteOpen(false);
    }
  };

  if (loading && !detail) {
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
  const stepOrder = {
    ...order,
    versions: detail.versions,
    quotations: detail.quotations,
    approvals: detail.approvals,
    pos: detail.pos,
    shippingBatches: detail.shippingBatches,
    invoices: detail.invoices,
    attachments: detail.attachments,
    customFields: detail.customFields,
    posTotal: detail.posTotal,
    invoiceTotal: detail.invoiceTotal,
    batchPercentSum: detail.batchPercentSum
  };
  const showShippingTabs = order.status === 'shipping_invoicing' && ['shipping', 'invoicing', 'shipping_invoicing'].includes(activeKey);
  const canDelete = ['customer_info', 'proposal', 'quotation'].includes(order.status);
  const handleStepSelect = (key) => {
    if (key === 'shipping_invoicing' && order.status === 'shipping_invoicing') {
      setActiveKey('shipping');
    } else {
      setActiveKey(key);
    }
  };

  const renderStep = () => {
    const key = activeKey;
    const common = { order: stepOrder, readOnly: isStepReadOnly(order, key), onChanged: load, onAdvance: load };
    if (key === 'notes') return <OrderNotesPanel orderId={order.id} />;
    if (key === 'customer_info') return <StepCustomerInfo {...common} onFrameworkChange={setLocalFramework} />;
    if (key === 'proposal') return <StepProposal {...common} />;
    if (key === 'quotation') return <StepQuotation {...common} />;
    if (key === 'approval_pending') return <StepApproval {...common} />;
    if (key === 'bid_decision') return <StepBidResult {...common} />;
    if (key === 'finance') return <StepFinance {...common} />;
    if (key === 'shipping') return <StepShipping {...common} />;
    if (key === 'invoicing') return <StepInvoicing {...common} />;
    if (key === 'commission') return <StepCommission {...common} />;
    if (key === 'closed' || key === 'lost_closed' || key === 'cancelled') return <StepClose order={order} />;
    if (key === 'shipping_invoicing') {
      return (
        <>
          <StepShipping {...common} readOnly={isStepReadOnly(order, 'shipping')} />
          <Box sx={{ mt: 2 }}>
            <StepInvoicing {...common} readOnly={isStepReadOnly(order, 'invoicing')} />
          </Box>
        </>
      );
    }
    return null;
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/orders')}>
          返回
        </Button>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1, minWidth: 220 }}>
          <Typography variant="h5" sx={{ minWidth: 0 }}>{order.order_id}</Typography>
          <Tooltip
            title={
              (localFramework !== null ? localFramework : Number(order.has_framework) === 1)
                ? order.framework_source_customer_name
                  ? `适用${order.framework_source_customer_name}框架协议`
                  : '该客户存在框架协议价格，可自动带价'
                : '该客户暂无框架协议价格，报价需人工处理'
            }
            arrow
            placement="top"
          >
            <Chip
              icon={(localFramework !== null ? localFramework : Number(order.has_framework) === 1) ? <WorkspacePremiumIcon /> : <CancelIcon />}
              label={(localFramework !== null ? localFramework : Number(order.has_framework) === 1) ? '框架客户' : '非框架客户'}
              sx={() => {
                const isFramework = localFramework !== null ? localFramework : Number(order.has_framework) === 1;
                return {
                  height: 34,
                  minWidth: 116,
                  pl: 1,
                  pr: 1.4,
                  borderRadius: '999px',
                  fontWeight: 700,
                  fontSize: 13,
                  lineHeight: 1,
                  letterSpacing: 0,
                  whiteSpace: 'nowrap',
                  color: '#fff',
                  background: isFramework
                    ? 'linear-gradient(135deg, #43A047 0%, #2E7D32 100%)'
                    : 'linear-gradient(135deg, #E53935 0%, #C62828 100%)',
                  boxShadow: isFramework
                    ? '0 2px 8px rgba(46, 125, 50, 0.25)'
                    : '0 2px 8px rgba(211, 47, 47, 0.25)',
                  '& .MuiChip-icon': {
                    fontSize: 18,
                    ml: 0.4,
                    mr: 0.15,
                    color: '#fff'
                  },
                  '& .MuiChip-label': { px: 0.2, overflow: 'visible', textOverflow: 'clip' }
                };
              }}
            />
          </Tooltip>
        </Stack>
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
        <Box sx={{ height: 4, borderRadius: '10px 10px 0 0', bgcolor: 'primary.main' }} />
        <Grid container spacing={1.5} sx={{ px: { xs: 2, md: 3 }, pt: 2.25, pb: 0.5 }}>
          <Grid item xs={12} sm={6} lg={3}>
            <InfoTile label={t('project_name')} value={order.project_name || '-'} color="#004E9A" darkColor="#8FB6E3" />
          </Grid>
          <Grid item xs={12} sm={6} lg={3}>
            <InfoTile
              label={`${t('end_customer')}/${t('contract_customer')}`}
              color="#0093BE"
              darkColor="#56C4E4"
            >
              <Box sx={{ mt: 0.4, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, wordBreak: 'break-word' }}>
                  {order.end_customer_name || '-'}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, wordBreak: 'break-word' }}>
                  {order.contract_customer_name || '-'}
                </Typography>
              </Box>
            </InfoTile>
          </Grid>
          <Grid item xs={12} sm={6} lg={3}>
            <InfoTile
              label={t('amount')}
              value={order.total_amount == null ? '-' : `¥ ${fmtMoney(order.total_amount)}`}
              color="#B8860B"
              darkColor="#E5BE63"
            />
          </Grid>
          <Grid item xs={12} sm={6} lg={3}>
            <InfoTile label="创建时间" value={fmtDateTime(order.created_at)} color="#5E6F80" darkColor="#A7B6C6" />
          </Grid>
        </Grid>
        <OrderStepper order={order} activeKey={activeKey} onSelect={handleStepSelect} />
      </Card>

      {showShippingTabs && (
        <Card sx={{ p: 1.25 }}>
          <Box sx={{ display: 'flex', gap: 0.75, bgcolor: 'action.hover', borderRadius: 2, p: 0.5 }}>
            <Button
              size="small"
              variant={activeKey === 'invoicing' ? 'outlined' : 'contained'}
              onClick={() => setActiveKey('shipping')}
              sx={{ flex: 1, minHeight: 38, fontWeight: 700 }}
            >
              发货管理
            </Button>
            <Button
              size="small"
              variant={activeKey === 'invoicing' ? 'contained' : 'outlined'}
              onClick={() => setActiveKey('invoicing')}
              sx={{ flex: 1, minHeight: 38, fontWeight: 700 }}
            >
              开票管理
            </Button>
          </Box>
        </Card>
      )}

      {renderStep()}

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>删除商机</DialogTitle>
        <DialogContent>
          <DialogContentText>仅早期状态商机可删除，删除后不可恢复。确认删除 {order.order_id}？</DialogContentText>
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
