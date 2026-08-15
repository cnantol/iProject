import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import InputAdornment from '@mui/material/InputAdornment';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import KeyIcon from '@mui/icons-material/Key';
import LoginIcon from '@mui/icons-material/Login';
import BrightnessAutoIcon from '@mui/icons-material/BrightnessAuto';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import { useAuth } from '../context/AuthContext';
import { useThemeMode } from '../context/ThemeContext';
import { errorMessage } from '../api';

export default function Login() {
  const { login } = useAuth();
  const { preference, setPreference } = useThemeMode();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const modeLabel = preference === 'dark' ? '深色' : preference === 'light' ? '浅色' : '自动';
  const ModeIcon = preference === 'dark' ? DarkModeIcon : preference === 'light' ? LightModeIcon : BrightnessAutoIcon;

  const cyclePreference = () => {
    setPreference(preference === 'system' ? 'light' : preference === 'light' ? 'dark' : 'system');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setError(errorMessage(err, '登录失败'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2,
        bgcolor: (theme) => (theme.palette.mode === 'dark' ? '#000000' : '#F5F5F7')
      }}
    >
      <Button
        size="small"
        startIcon={<ModeIcon fontSize="small" />}
        onClick={cyclePreference}
        sx={{
          position: 'absolute',
          top: 18,
          right: 20,
          color: 'text.secondary',
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 1.5,
          '&:hover': { bgcolor: 'action.hover' }
        }}
      >
        外观：{modeLabel}
      </Button>

      <Stack spacing={2.5} sx={{ width: '100%', maxWidth: 520 }}>
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: 0 }}>
            iProject
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75 }}>
            全链路项目管理专家
          </Typography>
        </Box>

        <Card
          elevation={0}
          sx={(theme) => ({
            width: '100%',
            p: { xs: 3.5, sm: 5 },
            borderRadius: '14px',
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: theme.palette.mode === 'dark' ? '#1C1C1E' : '#FFFFFF',
            boxShadow: theme.palette.mode === 'dark'
              ? '0 18px 48px rgba(0,0,0,0.45)'
              : '0 12px 40px rgba(0,0,0,0.07)'
          })}
        >
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>
            登录
          </Typography>
          {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 1.5 }}>{error}</Alert>}
          <form onSubmit={handleSubmit}>
            <Stack spacing={2.5}>
              <TextField
                label="用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                fullWidth
                sx={(theme) => ({
                  '& .MuiInputBase-root': { minHeight: 52 },
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 1.5,
                    bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : '#FFFFFF',
                    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                    '& fieldset': {
                      borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)'
                    },
                    '&:hover fieldset': { borderColor: '#0071E3' },
                    '&.Mui-focused fieldset': { borderColor: '#0071E3', borderWidth: 1.5 }
                  },
                  '& .MuiInputLabel-root.Mui-focused': { color: '#0071E3' }
                })}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonOutlineIcon fontSize="small" color="action" />
                    </InputAdornment>
                  )
                }}
              />
              <TextField
                label="密码"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                fullWidth
                sx={(theme) => ({
                  '& .MuiInputBase-root': { minHeight: 52 },
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 1.5,
                    bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : '#FFFFFF',
                    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                    '& fieldset': {
                      borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)'
                    },
                    '&:hover fieldset': { borderColor: '#0071E3' },
                    '&.Mui-focused fieldset': { borderColor: '#0071E3', borderWidth: 1.5 }
                  },
                  '& .MuiInputLabel-root.Mui-focused': { color: '#0071E3' }
                })}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <KeyIcon fontSize="small" color="action" />
                    </InputAdornment>
                  )
                }}
              />
              <Button
                type="submit"
                variant="contained"
                size="large"
                startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <LoginIcon />}
                disabled={loading}
                fullWidth
                sx={{
                  height: 48,
                  borderRadius: 1.5,
                  bgcolor: '#0071E3',
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: 16,
                  boxShadow: '0 4px 12px rgba(0,113,227,0.25)',
                  '&:hover': { bgcolor: '#0077ED', boxShadow: '0 6px 16px rgba(0,113,227,0.32)' }
                }}
              >
                {loading ? '登录中...' : '登录'}
              </Button>
            </Stack>
          </form>
        </Card>
      </Stack>
    </Box>
  );
}
