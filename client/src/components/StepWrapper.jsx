import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';

export default function StepWrapper({ title, subtitle, readOnly, badge, children }) {
  return (
    <Card>
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Box>
            <Typography variant="h6">{title}</Typography>
            {subtitle && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                {subtitle}
              </Typography>
            )}
          </Box>
          {readOnly ? <Chip size="small" label="只读" color="default" variant="outlined" /> : null}
          {badge}
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}
