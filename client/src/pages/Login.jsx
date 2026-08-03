import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import InputAdornment from '@mui/material/InputAdornment';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
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
  const [themeMenu, setThemeMenu] = useState(null);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
        background: (theme) =>
          theme.palette.mode === 'dark'
            ? 'linear-gradient(160deg, #0D141B 0%, #101A26 100%)'
            : 'linear-gradient(160deg, #F4F6FA 0%, #EAF0F6 100%)',
        p: 2
      }}
    >
      <IconButton
        onClick={(event) => setThemeMenu(event.currentTarget)}
        aria-label="主题模式"
        sx={{
          position: 'absolute',
          top: 16,
          right: 16,
          color: 'text.secondary'
        }}
      >
        {preference === 'dark' ? <DarkModeIcon /> : preference === 'light' ? <LightModeIcon /> : <BrightnessAutoIcon />}
      </IconButton>
      <Menu anchorEl={themeMenu} open={Boolean(themeMenu)} onClose={() => setThemeMenu(null)}>
        <MenuItem
          selected={preference === 'light'}
          onClick={() => {
            setPreference('light');
            setThemeMenu(null);
          }}
        >
          <ListItemIcon>
            <LightModeIcon fontSize="small" />
          </ListItemIcon>
          亮色模式
        </MenuItem>
        <MenuItem
          selected={preference === 'dark'}
          onClick={() => {
            setPreference('dark');
            setThemeMenu(null);
          }}
        >
          <ListItemIcon>
            <DarkModeIcon fontSize="small" />
          </ListItemIcon>
          暗色模式
        </MenuItem>
        <MenuItem
          selected={preference === 'system'}
          onClick={() => {
            setPreference('system');
            setThemeMenu(null);
          }}
        >
          <ListItemIcon>
            <BrightnessAutoIcon fontSize="small" />
          </ListItemIcon>
          跟随系统
        </MenuItem>
      </Menu>
      <Card sx={{ position: 'relative', overflow: 'hidden', width: '100%', maxWidth: 440, p: { xs: 3, md: 4 }, boxShadow: (theme) => (theme.palette.mode === 'dark' ? '0 18px 48px rgba(0,0,0,0.45)' : '0 18px 48px rgba(20,50,85,0.10)') }}>
        <Stack spacing={3}>
          <Box sx={{ textAlign: 'center' }}>
            <Box component="img" src="/logo.svg" alt="Atlas Copco" sx={{ height: 64, width: 'auto', mb: 1.5 }} />
            <Typography variant="h5" sx={{ fontWeight: 900, color: (theme) => (theme.palette.mode === 'dark' ? '#8FB6E3' : 'primary.main') }}>
              i-Project
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              项目全生命周期管理
            </Typography>
          </Box>
          {error && <Alert severity="error">{error}</Alert>}
          <form onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <TextField
                label="用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                fullWidth
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
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <KeyIcon fontSize="small" color="action" />
                    </InputAdornment>
                  )
                }}
              />
              <Button type="submit" variant="contained" size="large" startIcon={<LoginIcon />} disabled={loading} fullWidth>
                {loading ? <CircularProgress size={22} color="inherit" /> : '登录系统'}
              </Button>
            </Stack>
          </form>
        </Stack>
      </Card>
    </Box>
  );
}
