import { Fragment } from 'react';
import { keyframes } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import CheckIcon from '@mui/icons-material/Check';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CancelIcon from '@mui/icons-material/Cancel';
import DescriptionIcon from '@mui/icons-material/Description';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import LockIcon from '@mui/icons-material/Lock';
import PaidIcon from '@mui/icons-material/Paid';
import PersonIcon from '@mui/icons-material/Person';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import { STEP_ORDER, STATUS_LABELS, STATUS_COLORS } from '../utils/constants';
import { STEP_KEY_INDEX } from '../utils/helpers';

const pulse = keyframes({
  '0%': { boxShadow: '0 0 0 0 rgba(0,78,154,0.34)' },
  '70%': { boxShadow: '0 0 0 10px rgba(0,78,154,0)' },
  '100%': { boxShadow: '0 0 0 0 rgba(0,78,154,0)' }
});

const pop = keyframes({
  from: { transform: 'scale(0.72)', opacity: 0.4 },
  to: { transform: 'scale(1)', opacity: 1 }
});

const fillLine = keyframes({
  from: { width: '0%' },
  to: { width: '100%' }
});

const STEP_ICONS = {
  customer_info: <PersonIcon sx={{ fontSize: 18 }} />,
  proposal: <DescriptionIcon sx={{ fontSize: 18 }} />,
  quotation: <RequestQuoteIcon sx={{ fontSize: 18 }} />,
  approval_pending: <FactCheckIcon sx={{ fontSize: 18 }} />,
  bid_decision: <EmojiEventsIcon sx={{ fontSize: 18 }} />,
  finance: <AccountBalanceIcon sx={{ fontSize: 18 }} />,
  shipping_invoicing: <LocalShippingIcon sx={{ fontSize: 18 }} />,
  commission: <PaidIcon sx={{ fontSize: 18 }} />,
  closed: <LockIcon sx={{ fontSize: 18 }} />,
  cancelled: <CancelIcon sx={{ fontSize: 18 }} />
};

export default function OrderStepper({ order, activeKey, onSelect }) {
  const currentIndex = STEP_KEY_INDEX[order?.status];
  const isClosed = ['closed', 'lost_closed', 'cancelled'].includes(order?.status);
  const activeIndex = isClosed ? -1 : STEP_KEY_INDEX[activeKey];
  const statusColor = STATUS_COLORS[order?.status] || '#78909C';

  return (
    <Box sx={{ px: { xs: 1.5, md: 3 }, py: 2.75, overflowX: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.25 }}>
        <Chip
          size="small"
          label={STATUS_LABELS[order?.status] || order?.status}
          sx={{
            bgcolor: `${statusColor}1F`,
            color: statusColor,
            border: `1px solid ${statusColor}38`,
            fontWeight: 700
          }}
        />
        {isClosed && (
          <Chip
            size="small"
            color={order?.status === 'closed' ? 'success' : order?.status === 'lost_closed' ? 'error' : 'default'}
            label={order?.status === 'closed' ? '已闭环' : order?.status === 'lost_closed' ? '未中标关闭' : '合同取消'}
            sx={{ fontWeight: 700 }}
          />
        )}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'flex-start', minWidth: 880 }}>
        {STEP_ORDER.map((step, index) => {
          const disabled = isClosed ? false : index > currentIndex + 1;
          const done = isClosed || index < currentIndex || (index === 6 && Number(order?.delivered) === 1 && Number(order?.invoiced) === 1);
          const active = !isClosed && index === activeIndex;
          const nodeColor = done ? '#1E7A46' : active ? '#004E9A' : 'transparent';
          return (
            <Fragment key={step.key}>
              <Box sx={{ width: 96, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Box
                  onClick={() => !disabled && onSelect(step.key)}
                  sx={(theme) => ({
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    fontWeight: 800,
                    color: done || active ? '#FFFFFF' : theme.palette.text.disabled,
                    backgroundColor: nodeColor,
                    border: done || active ? 'none' : `2px solid ${theme.palette.divider}`,
                    cursor: disabled ? 'default' : 'pointer',
                    animation: done || active ? `${pop} 0.35s ease` : undefined,
                    boxShadow: active ? `${pulse} 2s ease-out infinite` : undefined,
                    transition: 'background-color 0.25s ease, color 0.25s ease, transform 0.2s ease',
                    '&:hover': disabled ? undefined : { transform: 'scale(1.06)' }
                  })}
                >
                  {done ? <CheckIcon sx={{ fontSize: 18 }} /> : STEP_ICONS[step.key] || index + 1}
                </Box>
                <Typography
                  variant="caption"
                  sx={{
                    mt: 0.9,
                    minHeight: 34,
                    display: 'block',
                    textAlign: 'center',
                    whiteSpace: 'normal',
                    lineHeight: 1.3,
                    fontSize: 12.5,
                    fontWeight: active ? 800 : done ? 600 : 400,
                    color: active ? 'primary.main' : done ? 'text.primary' : 'text.disabled'
                  }}
                >
                  {step.label}
                </Typography>
                {active && (
                  <Chip size="small" label="进行中" color="primary" sx={{ mt: 0.5, height: 20, fontSize: 11, fontWeight: 700 }} />
                )}
              </Box>
              {index < STEP_ORDER.length - 1 && (
                <Box
                  aria-hidden
                  sx={(theme) => ({
                    flex: 1,
                    minWidth: 10,
                    height: 4,
                    mt: '15px',
                    borderRadius: 4,
                    overflow: 'hidden',
                    position: 'relative',
                    backgroundColor: done ? 'rgba(30,122,70,0.16)' : theme.palette.divider,
                    '&::after': done
                      ? {
                          content: '""',
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          height: '100%',
                          width: '100%',
                          borderRadius: 4,
                          backgroundColor: '#1E7A46',
                          animation: `${fillLine} 0.6s ease`
                        }
                      : undefined
                  })}
                />
              )}
            </Fragment>
          );
        })}
      </Box>
    </Box>
  );
}
