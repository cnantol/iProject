import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ListAltIcon from '@mui/icons-material/ListAlt';
import HistoryIcon from '@mui/icons-material/History';
import PaymentsIcon from '@mui/icons-material/Payments';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import StorageIcon from '@mui/icons-material/Storage';
import SettingsIcon from '@mui/icons-material/Settings';
import BrightnessAutoIcon from '@mui/icons-material/BrightnessAuto';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import { useAuth } from '../context/AuthContext';
import { useThemeMode } from '../context/ThemeContext';
import { useAppLogo } from '../context/AppLogoContext';

const NAV_ITEMS = [
  { path: '/', label: '首页看板', icon: <DashboardIcon /> },
  { path: '/todos', label: '待办事项', icon: <CheckCircleIcon /> },
  { path: '/orders', label: '销售机会', icon: <ListAltIcon /> },
  { path: '/sales-history', label: '历史销售', icon: <HistoryIcon /> },
  { path: '/commission', label: '佣金结算', icon: <PaymentsIcon /> },
  { path: '/materials', label: '基础数据', icon: <StorageIcon /> },
  { path: '/settings', label: '系统设置', icon: <SettingsIcon /> }
];

const DRAWER_WIDTH = 232;

export default function AppLayout() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const navigate = useNavigate();
  const location = useLocation();
  const { src } = useAppLogo();
  const [logoFailed, setLogoFailed] = useState(false);
  const logo = logoFailed ? '/logo.svg' : src;
  const { user, logout } = useAuth();
  const { mode, preference, setPreference } = useThemeMode();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(null);
  const [themeMenu, setThemeMenu] = useState(null);

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2.25, py: 2 }}>
        <Box component="img" src={logo} alt="Atlas Copco" onError={() => setLogoFailed(true)} sx={{ height: 42, maxWidth: 150, width: 'auto', objectFit: 'contain' }} />
        <Box sx={{ lineHeight: 1.15 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 900, color: 'primary.main', fontSize: 17, letterSpacing: 0 }}>
            i-Project
          </Typography>
        </Box>
      </Box>
      <Divider />
      <List sx={{ flex: 1, px: 1, pt: 1 }}>
        {NAV_ITEMS.map((item) => {
          const active = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path);
          return (
            <ListItemButton
              key={item.path}
              selected={active}
              onClick={() => {
                navigate(item.path);
                setMobileOpen(false);
              }}
              sx={{ borderRadius: 1.5, mb: 0.5 }}
            >
              <ListItemIcon sx={{ minWidth: 40, color: active ? 'primary.main' : 'inherit' }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: 14, fontWeight: active ? 700 : 500 }} />
            </ListItemButton>
          );
        })}
      </List>
      <Divider />
      <Box sx={{ px: 2.5, py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <AccountCircleIcon color="primary" />
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {user?.username || 'admin'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            管理员
          </Typography>
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {isDesktop ? (
        <Drawer
          variant="permanent"
          sx={{ width: DRAWER_WIDTH, flexShrink: 0, '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' } }}
        >
          {drawerContent}
        </Drawer>
      ) : (
        <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)} sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH } }}>
          {drawerContent}
        </Drawer>
      )}
      <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <AppBar position="sticky" elevation={0} color="inherit" sx={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
          <Toolbar sx={{ gap: 1, minHeight: 60 }}>
            {!isDesktop && (
              <IconButton edge="start" onClick={() => setMobileOpen(true)}>
                <MenuOpenIcon />
              </IconButton>
            )}
            <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>
              项目全生命周期管理
            </Typography>
            <IconButton onClick={(event) => setThemeMenu(event.currentTarget)} color="inherit" title="主题模式">
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
            <IconButton onClick={(event) => setUserMenu(event.currentTarget)} color="inherit">
              <AccountCircleIcon />
            </IconButton>
            <Menu anchorEl={userMenu} open={Boolean(userMenu)} onClose={() => setUserMenu(null)}>
              <MenuItem disabled>
                <Typography variant="body2">{user?.username || 'admin'}</Typography>
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setUserMenu(null);
                  logout();
                  navigate('/login');
                }}
              >
                <ListItemIcon>
                  <LogoutIcon fontSize="small" />
                </ListItemIcon>
                退出登录
              </MenuItem>
            </Menu>
          </Toolbar>
        </AppBar>
        <Box component="main" sx={{ p: { xs: 2, md: 3 }, flexGrow: 1 }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
