import Box from '@mui/material/Box';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepButton from '@mui/material/StepButton';
import StepLabel from '@mui/material/StepLabel';
import Chip from '@mui/material/Chip';
import { STEP_ORDER, STATUS_LABELS, STATUS_COLORS } from '../utils/constants';
import { STEP_KEY_INDEX } from '../utils/helpers';

export default function OrderStepper({ order, activeKey, onSelect }) {
  const currentIndex = STEP_KEY_INDEX[order?.status];
  const isClosed = ['closed', 'lost_closed'].includes(order?.status);
  const activeIndex = isClosed ? -1 : STEP_KEY_INDEX[activeKey];

  return (
    <Box sx={{ px: 2, pt: 2, pb: 1, overflowX: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Chip
          size="small"
          label={STATUS_LABELS[order?.status] || order?.status}
          sx={{ bgcolor: `${STATUS_COLORS[order?.status] || '#78909C'}22`, color: STATUS_COLORS[order?.status] || '#78909C', fontWeight: 700 }}
        />
        {isClosed && <Chip size="small" color={order?.status === 'closed' ? 'success' : 'error'} label={order?.status === 'closed' ? '已闭环' : '未中标关闭'} />}
      </Box>
      <Stepper nonLinear activeStep={activeIndex} alternativeLabel sx={{ minWidth: 880 }}>
        {STEP_ORDER.map((step, index) => {
          const disabled = isClosed ? false : index > currentIndex + 1;
          const done = isClosed || index < currentIndex || (index === 6 && Number(order?.delivered) === 1 && Number(order?.invoiced) === 1);
          return (
            <Step key={step.key} completed={done}>
              <StepButton onClick={() => onSelect(step.key)} disabled={disabled} sx={{ '& .MuiStepLabel-label': { fontSize: 13 } }}>
                <StepLabel>{step.label}</StepLabel>
              </StepButton>
            </Step>
          );
        })}
      </Stepper>
    </Box>
  );
}
