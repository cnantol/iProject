import { keyframes } from '@mui/material/styles';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';

const fadeSlide = keyframes({
  from: { opacity: 0, transform: 'translateY(8px)' },
  to: { opacity: 1, transform: 'translateY(0)' }
});

export default function StepWrapper({ title, subtitle, readOnly, badge, children }) {
  return (
    <Card sx={{ animation: `${fadeSlide} 0.28s ease` }}>
      <Box sx={{ height: 4, borderRadius: '10px 10px 0 0', bgcolor: 'primary.main' }} />
      <CardContent sx={{ p: { xs: 2.5, md: 3.25 } }}>
        <Box sx={{ p: 1.75, mb: 2.5, borderRadius: 2.5, bgcolor: 'action.hover' }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
            <Stack direction="row" spacing={1.4} alignItems="center" sx={{ minWidth: 0, flex: '1 1 220px' }}>
              <Box sx={{ width: 5, height: 34, borderRadius: 2, bgcolor: 'primary.main', flexShrink: 0 }} />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h6" sx={{ lineHeight: 1.4 }}>
                  {title}
                </Typography>
                {subtitle && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, lineHeight: 1.5 }}>
                    {subtitle}
                  </Typography>
                )}
              </Box>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
              {badge}
              {readOnly ? <Chip size="small" label="只读" variant="outlined" sx={{ bgcolor: 'background.paper' }} /> : null}
            </Stack>
          </Stack>
        </Box>
        {children}
      </CardContent>
    </Card>
  );
}
