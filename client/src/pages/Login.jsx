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
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
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
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: (theme) => (theme.palette.mode === 'dark' ? 'linear-gradient(160deg,#0B1F33 0%,#101418 55%,#14232E 100%)' : 'linear-gradient(160deg,#EAF3FB 0%,#F5F7FA 55%,#E8F1F8 100%)'),
        p: 2
      }}
    >
      <Card sx={{ width: '100%', maxWidth: 420, p: { xs: 3, md: 4 } }}>
        <Stack spacing={3}>
          <Box sx={{ textAlign: 'center' }}>
            <Box component="img" src="/logo.svg" alt="Atlas Copco" sx={{ height: 72, width: 'auto', mb: 1.5 }} />
            <Typography variant="h6" sx={{ fontWeight: 800, color: 'primary.main' }}>
              Atlas Copco 订单管理系统
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              销售项目全生命周期管理
            </Typography>
          </Box>
          {error && <Alert severity="error">{error}</Alert>}
          <form onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <TextField label="用户名" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
              <TextField
                label="密码"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <Button type="submit" variant="contained" size="large" startIcon={<LockOutlinedIcon />} disabled={loading}>
                {loading ? <CircularProgress size={22} color="inherit" /> : '登录'}
              </Button>
            </Stack>
          </form>
        </Stack>
      </Card>
    </Box>
  );
}
