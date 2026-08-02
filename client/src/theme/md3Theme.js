import { createTheme } from '@mui/material/styles';

export function buildTheme(mode) {
  return createTheme({
    palette: {
      mode,
      primary: { main: '#004E9A' },
      secondary: { main: '#0093BE' },
      success: { main: '#2E7D32' },
      warning: { main: '#ED6C02' },
      error: { main: '#D32F2F' },
      background: mode === 'dark' ? { default: '#101418', paper: '#161C22' } : { default: '#F5F7FA', paper: '#FFFFFF' }
    },
    shape: { borderRadius: 8 },
    typography: {
      fontFamily: [
        '-apple-system',
        'BlinkMacSystemFont',
        '"Segoe UI"',
        'Roboto',
        '"Helvetica Neue"',
        'Arial',
        '"PingFang SC"',
        '"Microsoft YaHei"',
        'sans-serif'
      ].join(','),
      button: { textTransform: 'none', fontWeight: 600 },
      h5: { fontWeight: 700 },
      h6: { fontWeight: 700 }
    },
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { minHeight: 36 } }
      },
      MuiCard: {
        styleOverrides: { root: { borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)' } }
      },
      MuiTableCell: {
        styleOverrides: {
          root: { padding: '10px 12px', verticalAlign: 'middle' },
          head: {
            whiteSpace: 'nowrap',
            fontWeight: 700,
            fontSize: '0.8rem',
            color: mode === 'dark' ? '#A7B6C6' : '#5E6F80',
            backgroundColor: mode === 'dark' ? 'rgba(168,190,214,0.05)' : 'rgba(22,48,78,0.03)'
          }
        }
      },
      MuiChip: {
        styleOverrides: { root: { fontWeight: 600 } }
      }
    }
  });
}
