import { useCallback, useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import BackupIcon from '@mui/icons-material/Backup';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import HistoryIcon from '@mui/icons-material/History';
import ImageIcon from '@mui/icons-material/Image';
import InboxIcon from '@mui/icons-material/Inbox';
import PersonIcon from '@mui/icons-material/Person';
import RestoreIcon from '@mui/icons-material/Restore';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SaveIcon from '@mui/icons-material/Save';
import SettingsIcon from '@mui/icons-material/Settings';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import api, { errorMessage } from '../api';
import { useAuth } from '../context/AuthContext';
import { useAppLogo } from '../context/AppLogoContext';
import { fmtDateTime } from '../utils/helpers';
import { downloadFile } from '../utils/download';

const SCHEDULE_DEFAULTS = { enabled: false, hour: 2, minute: 0, keep: 0 };
const AUDIT_PAGE_SIZE = 10;

function SectionCard({ icon, title, subtitle, action, color = 'primary.main', children }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: 1.5,
            bgcolor: `${color}14`,
            color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{title}</Typography>
          {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
        </Box>
        {action && <Box sx={{ ml: 'auto' }}>{action}</Box>}
      </Stack>
      {children}
    </Paper>
  );
}

export default function Settings() {
  const { updateUser } = useAuth();
  const { setLogo, resetLogo } = useAppLogo();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmState, setConfirmState] = useState(null);
  const [backupInfo, setBackupInfo] = useState(null);
  const [backups, setBackups] = useState([]);
  const [schedule, setSchedule] = useState(SCHEDULE_DEFAULTS);
  const [resetType, setResetType] = useState(null);
  const [password, setPassword] = useState('');
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const [clearingAudit, setClearingAudit] = useState(false);
  const [account, setAccount] = useState({ current_password: '', username: '', new_password: '', confirm_password: '' });
  const [accountSaving, setAccountSaving] = useState(false);
  const [appLogo, setAppLogo] = useState(null);
  const [appLogoSaving, setAppLogoSaving] = useState(false);

  const askConfirm = useCallback((message) => new Promise((resolve) => setConfirmState({ message, resolve })), []);

  const handleConfirm = (ok) => {
    const { resolve } = confirmState || {};
    setConfirmState(null);
    if (resolve) resolve(ok);
  };

  const loadAudit = useCallback(async () => {
    try {
      const { data } = await api.get('/audit-logs', { params: { page: auditPage, limit: AUDIT_PAGE_SIZE } });
      setAuditLogs(data.items || []);
      setAuditTotal(data.total || 0);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [auditPage]);

  const loadBackups = useCallback(async () => {
    try {
      const { data } = await api.get('/settings/backups');
      setBackups(data.items || []);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  const loadSettingsData = useCallback(async () => {
    const [scheduleResult, backupsResult, logoResult] = await Promise.allSettled([
      api.get('/settings/backup-schedule'),
      api.get('/settings/backups'),
      api.get('/settings/app-logo')
    ]);
    if (scheduleResult.status === 'fulfilled') {
      setSchedule({ ...SCHEDULE_DEFAULTS, ...scheduleResult.value.data });
    } else {
      setError(errorMessage(scheduleResult.reason));
    }
    if (backupsResult.status === 'fulfilled') {
      setBackups(backupsResult.value.data.items || []);
    } else {
      setError(errorMessage(backupsResult.reason));
    }
    if (logoResult.status === 'fulfilled') {
      setAppLogo(logoResult.value.data.logo || null);
    } else {
      setError(errorMessage(logoResult.reason));
    }
  }, []);

  useEffect(() => {
    loadAudit();
  }, [loadAudit]);

  useEffect(() => {
    loadSettingsData();
  }, [loadSettingsData]);

  const backup = async () => {
    try {
      const { data } = await api.post('/settings/backup');
      setBackupInfo(data);
      loadBackups();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const openDownload = async (path) => {
    try {
      await downloadFile(path);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const saveSchedule = async () => {
    const payload = {
      enabled: Boolean(schedule.enabled),
      hour: Math.min(23, Math.max(0, Math.floor(Number(schedule.hour) || 0))),
      minute: Math.min(59, Math.max(0, Math.floor(Number(schedule.minute) || 0))),
      keep: Math.min(100, Math.max(0, Math.floor(Number(schedule.keep) || 0)))
    };
    try {
      const { data } = await api.put('/settings/backup-schedule', payload);
      setSchedule(data);
      setError('');
      setNotice('定时备份配置已保存');
      loadBackups();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const restore = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!await askConfirm('还原将覆盖当前数据库与附件，确认继续？')) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      await api.post('/settings/restore', formData);
      setNotice('还原成功');
      window.location.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const restoreFromList = async (filename) => {
    if (!await askConfirm(`还原将覆盖当前数据库与附件，确认从「${filename}」还原？`)) return;
    try {
      await api.post(`/settings/restore/${encodeURIComponent(filename)}`);
      setNotice('还原成功');
      window.location.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const deleteBackup = async (filename) => {
    if (!await askConfirm(`确认删除备份文件「${filename}」？删除后不可恢复。`)) return;
    try {
      await api.delete(`/settings/backup/${encodeURIComponent(filename)}`);
      setError('');
      loadBackups();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const doReset = async () => {
    if (!password) {
      setError('请输入管理员密码');
      return;
    }
    try {
      const url = resetType === 'business' ? '/settings/reset-business' : '/settings/reset-factory';
      await api.post(url, { password });
      setResetType(null);
      setPassword('');
      setNotice(resetType === 'business' ? '业务数据已重置' : '系统已恢复出厂设置，请重新登录');
      if (resetType === 'factory') window.location.href = '/login';
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const saveAccount = async () => {
    const trimmedUsername = account.username.trim();
    if (!account.current_password) {
      setError('请输入当前密码');
      return;
    }
    if (account.new_password && account.new_password.length < 6) {
      setError('新密码长度不能少于 6 位');
      return;
    }
    if (account.new_password && account.new_password !== account.confirm_password) {
      setError('两次输入的新密码不一致');
      return;
    }
    if (!trimmedUsername && !account.new_password) {
      setError('请填写新用户名或新密码');
      return;
    }
    setAccountSaving(true);
    setError('');
    try {
      const { data } = await api.put('/auth/profile', {
        currentPassword: account.current_password,
        username: trimmedUsername || undefined,
        newPassword: account.new_password || undefined
      });
      if (data.user) updateUser(data.user);
      setAccount({ current_password: '', username: '', new_password: '', confirm_password: '' });
      setNotice('账户信息已更新，请重新登录');
      window.location.href = '/login';
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAccountSaving(false);
    }
  };

  const handleLogoUpload = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setError('仅支持 PNG / JPG 图片');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Logo 图片不能超过 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAppLogo(String(reader.result));
    reader.onerror = () => setError('Logo 图片读取失败');
    reader.readAsDataURL(file);
  };

  const saveAppLogo = async () => {
    if (!appLogo) return;
    setAppLogoSaving(true);
    setError('');
    try {
      const { data } = await api.put('/settings/app-logo', { logo: appLogo });
      setAppLogo(data.logo || null);
      setLogo(data.logo || null);
      setNotice('Logo 已更新，登录页与首页将同步生效');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAppLogoSaving(false);
    }
  };

  const resetAppLogo = async () => {
    setAppLogoSaving(true);
    setError('');
    try {
      const { data } = await api.put('/settings/app-logo', { logo: null });
      setAppLogo(data.logo || null);
      resetLogo();
      setNotice('已恢复默认 Logo');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAppLogoSaving(false);
    }
  };

  const clearAudit = async () => {
    if (!await askConfirm('确认清空全部审计日志？此操作不可撤销。')) return;
    setClearingAudit(true);
    setError('');
    try {
      await api.delete('/audit-logs');
      setAuditLogs([]);
      setAuditTotal(0);
      setAuditPage(1);
      setNotice('审计日志已清空');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setClearingAudit(false);
    }
  };

  const auditTotalPages = Math.max(1, Math.ceil(auditTotal / AUDIT_PAGE_SIZE));

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box
          sx={{
            width: 42,
            height: 42,
            borderRadius: 1.5,
            bgcolor: 'primary.main',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <SettingsIcon fontSize="small" />
        </Box>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>系统配置</Typography>
          <Typography variant="body2" color="text.secondary">账户、备份、重置与 Logo</Typography>
        </Box>
      </Stack>

      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
      {notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}

      <Grid container spacing={2} style={{ marginLeft: -16, marginRight: -16 }}>
        <Grid item xs={12} md={6}>
          <SectionCard icon={<PersonIcon fontSize="small" />} title="账户设置" subtitle="修改用户名或密码前需验证当前密码">
            <Stack spacing={1.5}>
              <TextField
                label="当前密码"
                type="password"
                size="small"
                value={account.current_password}
                onChange={(e) => setAccount((prev) => ({ ...prev, current_password: e.target.value }))}
              />
              <TextField
                label="新用户名（留空不修改）"
                size="small"
                value={account.username}
                onChange={(e) => setAccount((prev) => ({ ...prev, username: e.target.value }))}
                helperText="保存后登录账号将同步更新"
              />
              <TextField
                label="新密码（留空不修改，不少于 6 位）"
                type="password"
                size="small"
                value={account.new_password}
                onChange={(e) => setAccount((prev) => ({ ...prev, new_password: e.target.value }))}
              />
              <TextField
                label="确认新密码"
                type="password"
                size="small"
                value={account.confirm_password}
                onChange={(e) => setAccount((prev) => ({ ...prev, confirm_password: e.target.value }))}
              />
              <Box>
                <Button
                  variant="contained"
                  startIcon={accountSaving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
                  onClick={saveAccount}
                  disabled={accountSaving}
                >
                  {accountSaving ? '保存中...' : '保存账户设置'}
                </Button>
              </Box>
            </Stack>
          </SectionCard>
        </Grid>

        <Grid item xs={12} md={6}>
          <SectionCard icon={<BackupIcon fontSize="small" />} title="备份与还原" subtitle="全站备份，可下载或还原">
            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
              <Button variant="contained" startIcon={<DownloadIcon />} onClick={backup}>全站备份</Button>
              <Button component="label" variant="outlined" startIcon={<RestoreIcon />}>
                从备份还原
                <input type="file" hidden accept=".zip" onChange={restore} />
              </Button>
            </Stack>
            {backupInfo && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                备份完成：
                <Chip label={backupInfo.filename} clickable onClick={() => openDownload(backupInfo.downloadUrl)} />
              </Typography>
            )}
            <Box
              sx={{
                mt: 1.5,
                maxHeight: 200,
                overflow: 'auto',
                borderRadius: 1.5,
                border: 1,
                borderColor: 'divider',
                bgcolor: 'action.hover'
              }}
            >
              <Stack spacing={1} sx={{ p: 1 }}>
                {backups.length === 0 ? (
                  <Typography variant="caption" color="text.secondary" sx={{ p: 1 }}>暂无备份记录</Typography>
                ) : (
                  backups.map((item) => (
                    <Box
                      key={item.filename}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        p: 0.75,
                        borderRadius: 1.5,
                        border: 1,
                        borderColor: 'divider',
                        bgcolor: 'background.paper'
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" noWrap sx={{ fontWeight: 700 }}>{item.filename}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {fmtDateTime(item.modified_at)} · {(item.size / 1024 / 1024).toFixed(1)} MB
                        </Typography>
                      </Box>
                      <IconButton size="small" title="下载" onClick={() => openDownload(item.downloadUrl)}>
                        <DownloadIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" title="删除" onClick={() => deleteBackup(item.filename)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        startIcon={<RestoreIcon />}
                        onClick={() => restoreFromList(item.filename)}
                      >
                        还原
                      </Button>
                    </Box>
                  ))
                )}
              </Stack>
            </Box>
            <Box
              sx={{
                mt: 1.5,
                p: 1.5,
                borderRadius: 1.5,
                border: 1,
                borderColor: 'divider',
                bgcolor: 'action.hover'
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>定时备份配置</Typography>
              <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                <FormControlLabel
                  control={
                    <Switch
                      checked={Boolean(schedule.enabled)}
                      onChange={(e) => setSchedule((prev) => ({ ...prev, enabled: e.target.checked }))}
                    />
                  }
                  label="启用"
                />
                <TextField
                  size="small"
                  label="小时"
                  type="number"
                  value={schedule.hour}
                  onChange={(e) => setSchedule((prev) => ({ ...prev, hour: Number(e.target.value) }))}
                  inputProps={{ min: 0, max: 23 }}
                  sx={{ width: 100 }}
                />
                <TextField
                  size="small"
                  label="分钟"
                  type="number"
                  value={schedule.minute}
                  onChange={(e) => setSchedule((prev) => ({ ...prev, minute: Number(e.target.value) }))}
                  inputProps={{ min: 0, max: 59 }}
                  sx={{ width: 100 }}
                />
                <TextField
                  size="small"
                  label="保留份数"
                  type="number"
                  value={schedule.keep}
                  onChange={(e) => setSchedule((prev) => ({ ...prev, keep: Number(e.target.value) }))}
                  inputProps={{ min: 0, max: 100 }}
                  sx={{ width: 130 }}
                />
                <Button size="small" variant="outlined" onClick={saveSchedule}>保存配置</Button>
              </Stack>
            </Box>
          </SectionCard>
        </Grid>

        <Grid item xs={12} md={6}>
          <SectionCard icon={<ImageIcon fontSize="small" />} title="Logo 设置" subtitle="上传后登录页与首页同步替换">
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
              {appLogo ? (
                <Box component="img" src={appLogo} alt="Logo" sx={{ maxWidth: 180, maxHeight: 64, objectFit: 'contain' }} />
              ) : (
                <Box
                  sx={{
                    width: 180,
                    height: 64,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px dashed',
                    borderColor: 'text.disabled',
                    borderRadius: 1.5,
                    overflow: 'hidden'
                  }}
                >
                  <Box component="img" src="/logo.svg" alt="默认 Logo" sx={{ maxWidth: 170, maxHeight: 56, objectFit: 'contain' }} />
                </Box>
              )}
              <Button component="label" variant="outlined" size="small" startIcon={<UploadFileIcon />}>
                上传 Logo
                <input type="file" hidden accept="image/png,image/jpeg" onChange={handleLogoUpload} />
              </Button>
              <Button
                size="small"
                color="error"
                variant="outlined"
                startIcon={<RestoreIcon />}
                onClick={resetAppLogo}
                disabled={!appLogo || appLogoSaving}
              >
                恢复默认
              </Button>
              <Button
                variant="contained"
                startIcon={appLogoSaving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
                onClick={saveAppLogo}
                disabled={!appLogo || appLogoSaving}
              >
                {appLogoSaving ? '保存中...' : '保存 Logo'}
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              支持 PNG / JPG，不超过 2MB
            </Typography>
          </SectionCard>
        </Grid>

        <Grid item xs={12} md={6}>
          <SectionCard icon={<RestartAltIcon fontSize="small" />} title="重置" subtitle="清空业务数据或恢复出厂设置" color="error.main">
            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
              <Button variant="outlined" color="warning" onClick={() => setResetType('business')}>重置业务数据（软重置）</Button>
              <Button variant="outlined" color="error" onClick={() => setResetType('factory')}>恢复出厂设置（硬重置）</Button>
            </Stack>
          </SectionCard>
        </Grid>

        <Grid item xs={12}>
          <SectionCard
            icon={<HistoryIcon fontSize="small" />}
            title="审计日志"
            subtitle="记录全站关键操作"
            action={
              auditLogs.length > 0 ? (
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteIcon />}
                  disabled={clearingAudit}
                  onClick={clearAudit}
                >
                  {clearingAudit ? '清空中...' : '清空全部'}
                </Button>
              ) : null
            }
          >
            <Box sx={{ borderRadius: 1.5, border: 1, borderColor: 'divider', overflow: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { bgcolor: 'rgba(15,23,42,0.03)', fontWeight: 800, whiteSpace: 'nowrap' } }}>
                    <TableCell>时间</TableCell>
                    <TableCell>操作人</TableCell>
                    <TableCell>动作</TableCell>
                    <TableCell>对象</TableCell>
                    <TableCell>详情</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {auditLogs.map((row) => (
                    <TableRow key={row.id} hover>
                      <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{fmtDateTime(row.created_at)}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{row.username || '系统'}</TableCell>
                      <TableCell><Chip size="small" label={row.action} variant="outlined" /></TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{row.entity_type || '-'}#{row.entity_id || '-'}</TableCell>
                      <TableCell sx={{ maxWidth: 420, wordBreak: 'break-all' }}>{row.detail || '-'}</TableCell>
                    </TableRow>
                  ))}
                  {auditLogs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} sx={{ border: 'none', p: 4 }}>
                        <Stack spacing={1} alignItems="center">
                          <InboxIcon sx={{ fontSize: 44, color: 'text.disabled' }} />
                          <Typography variant="body2" color="text.secondary">暂无审计记录</Typography>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Box>
            <Stack
              direction="row"
              spacing={1.5}
              alignItems="center"
              justifyContent="flex-end"
              flexWrap="wrap"
              useFlexGap
              sx={{ mt: 1.5 }}
            >
              <Typography variant="body2" color="text.secondary">共 {auditTotal} 条</Typography>
              <Button size="small" disabled={auditPage <= 1} onClick={() => setAuditPage((page) => page - 1)}>上一页</Button>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>第 {auditPage} / {auditTotalPages} 页</Typography>
              <Button size="small" disabled={auditPage >= auditTotalPages} onClick={() => setAuditPage((page) => page + 1)}>下一页</Button>
            </Stack>
          </SectionCard>
        </Grid>
      </Grid>

      <Dialog open={Boolean(resetType)} onClose={() => setResetType(null)}>
        <DialogTitle>{resetType === 'business' ? '重置业务数据' : '恢复出厂设置'}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1, minWidth: 340 }}>
            <Typography variant="body2">
              {resetType === 'business'
                ? '将清空全部业务数据，保留用户与工作流配置。'
                : '将清空全部数据（含用户、配置、审计日志与附件），仅保留 admin 账户，密码恢复默认，并轮换登录密钥。'}
            </Typography>
            <TextField label="管理员密码" type="password" value={password} onChange={(e) => setPassword(e.target.value)} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetType(null)}>取消</Button>
          <Button color="error" onClick={doReset}>确认重置</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(confirmState)} onClose={() => handleConfirm(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 16, fontWeight: 800 }}>请确认</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{confirmState?.message || ''}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => handleConfirm(false)}>取消</Button>
          <Button color="error" variant="contained" onClick={() => handleConfirm(true)}>确认</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
