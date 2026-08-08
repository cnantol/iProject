import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
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
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useAuth } from '../context/AuthContext';
import { useThemeMode } from '../context/ThemeContext';
import { useAppLogo } from '../context/AppLogoContext';

const NAV_ITEMS = [
  { path: '/', label: '首页看板', icon: <DashboardIcon /> },
  { path: '/todos', label: '待办事项', icon: <CheckCircleIcon /> },
  { path: '/orders', label: '销售机会', icon: <ListAltIcon /> },
  { path: '/sales-history', label: '历史销售', icon: <HistoryIcon /> },
  { path: '/commission', label: '佣金相关', icon: <PaymentsIcon /> },
  { path: '/materials', label: '基础数据', icon: <StorageIcon /> },
  { path: '/settings', label: '系统设置', icon: <SettingsIcon /> }
];

const DRAWER_WIDTH = 232;
const DRAWER_COLLAPSED = 64;
const SIDEBAR_KEY = 'iproject_sidebar_collapsed_v1';

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return sessionStorage.getItem(SIDEBAR_KEY) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
    } catch {}
  }, [collapsed]);
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const navigate = useNavigate();
  const location = useLocation();
  const { mode, preference, setPreference } = useThemeMode();
  const { src } = useAppLogo();
  const [logoFailed, setLogoFailed] = useState(false);
  const themeLogo = mode === 'dark' ? '/logo-dark.svg' : '/logo.svg';
  const logo = logoFailed || src === '/logo.svg' ? themeLogo : src;
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(null);

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: collapsed ? 0 : 1.25,
          px: collapsed ? 1 : 2.25,
          py: 2,
          minHeight: 72,
          cursor: 'pointer',
          borderBottom: 1,
          borderColor: 'divider',
          transition: 'background-color 0.2s ease',
          '&:hover': { bgcolor: 'rgba(25,118,210,0.06)' }
        }}
        onClick={() => {
          navigate('/');
          setMobileOpen(false);
        }}
        title="返回首页看板"
      >
        {collapsed ? (
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 2.5,
              overflow: 'hidden',
              flexShrink: 0,
              boxShadow: '0 4px 12px rgba(0, 78, 154, 0.22)',
              background: '#004E9A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Box component="img" src="/favicon.svg" alt="iProject" sx={{ width: 44, height: 44 }} />
          </Box>
        ) : (
          <Box
            component="img"
            src={logo}
            alt="iProject"
            onError={() => setLogoFailed(true)}
            sx={{ height: 56, maxWidth: 180, width: 'auto', objectFit: 'contain', flexShrink: 0 }}
          />
        )}
      </Box>
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
              sx={{
                borderRadius: 1.5,
                mb: 0.5,
                px: collapsed ? 1 : 2,
                justifyContent: collapsed ? 'center' : 'flex-start',
                '& .MuiListItemIcon-root': { mr: collapsed ? 0 : 2 },
                '& .MuiListItemText-root': collapsed ? { display: 'none' } : { display: 'block' }
              }}
              title={collapsed ? item.label : undefined}
            >
              <ListItemIcon sx={{ minWidth: 0, color: active ? 'primary.main' : 'inherit' }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: 14, fontWeight: active ? 700 : 500 }} />
            </ListItemButton>
          );
        })}
      </List>
      <Divider />
      <Box
        sx={{
          borderTop: 1,
          borderColor: 'divider',
          background: 'linear-gradient(180deg, transparent 0%, rgba(25,118,210,0.06) 100%)',
          p: 1.25,
          display: 'flex',
          flexDirection: 'column',
          gap: 1
        }}
      >
        <Tooltip title={collapsed ? '展开侧边栏' : '收起侧边栏'} placement="right">
          <IconButton
            onClick={() => setCollapsed((v) => !v)}
            sx={{
              alignSelf: collapsed ? 'center' : 'flex-end',
              border: 1.5,
              borderColor: 'divider',
              borderRadius: 2,
              bgcolor: 'background.paper',
              width: 44,
              height: 36,
              boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
              transition: 'all 0.2s ease',
              '&:hover': {
                bgcolor: 'primary.main',
                color: '#fff',
                borderColor: 'primary.main',
                transform: 'translateY(-1px)',
                boxShadow: '0 4px 10px rgba(25,118,210,0.3)'
              }
            }}
          >
            {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </IconButton>
        </Tooltip>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            p: collapsed ? 0.5 : 1,
            borderRadius: 2,
            bgcolor: collapsed ? 'transparent' : (theme) => (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.5)'),
            border: '1px solid',
            borderColor: collapsed ? 'transparent' : (theme) => (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'divider'),
            justifyContent: collapsed ? 'center' : 'flex-start',
            transition: 'all 0.2s ease',
            '&:hover': {
              bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(25,118,210,0.18)' : 'rgba(25,118,210,0.06)'),
              borderColor: 'primary.main'
            }
          }}
        >
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'linear-gradient(135deg,#1976D2,#0D47A1)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              fontWeight: 800,
              fontSize: 14,
              boxShadow: '0 2px 6px rgba(25,118,210,0.3)'
            }}
          >
            {(user?.username || 'A').charAt(0).toUpperCase()}
          </Box>
          {!collapsed && (
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.2 }} noWrap>
                {user?.username || 'admin'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, lineHeight: 1.2 }} noWrap>
                管理员
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {isDesktop ? (
        <Drawer
          variant="permanent"
          sx={{
            width: collapsed ? DRAWER_COLLAPSED : DRAWER_WIDTH,
            flexShrink: 0,
            transition: 'width 0.25s ease',
            '& .MuiDrawer-paper': {
              width: collapsed ? DRAWER_COLLAPSED : DRAWER_WIDTH,
              boxSizing: 'border-box',
              transition: 'width 0.25s ease',
              overflowX: 'hidden'
            }
          }}
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
              全链路项目管理专家
            </Typography>
            <IconButton
              onClick={() => setPreference(preference === 'system' ? 'light' : preference === 'light' ? 'dark' : 'system')}
              color="inherit"
              title="切换主题模式"
            >
              {preference === 'system' ? <BrightnessAutoIcon /> : preference === 'dark' ? <DarkModeIcon /> : <LightModeIcon />}
            </IconButton>
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
