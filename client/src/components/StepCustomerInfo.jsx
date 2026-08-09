import { useEffect, useState } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Grid from '@mui/material/Grid';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CancelIcon from '@mui/icons-material/Cancel';
import Paper from '@mui/material/Paper';
import EventNoteIcon from '@mui/icons-material/EventNote';
import BusinessIcon from '@mui/icons-material/Business';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import api, { errorMessage } from '../api';
import { downloadFile } from '../utils/download';
import { ATTACHMENT_ACCEPT } from '../utils/constants';
import { useFieldLabels } from '../utils/fieldLabels';
import StepWrapper from './StepWrapper';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 15 }, (_, i) => String(CURRENT_YEAR - 5 + i));
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1));

export default function StepCustomerInfo({ order, readOnly, onChanged, onFrameworkChange }) {
  const { t } = useFieldLabels();
  const [form, setForm] = useState(null);
  const [customValues, setCustomValues] = useState({});
  const [customFields, setCustomFields] = useState([]);
  const [endCustomers, setEndCustomers] = useState([]);
  const [contractCustomers, setContractCustomers] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [localFramework, setLocalFramework] = useState(null);

  useEffect(() => {
    setForm({
      year: order.year || '',
      month: order.month || '',
      end_customer_id: order.end_customer_id || null,
      contract_customer_id: order.contract_customer_id || null,
      workshop: order.workshop || '',
      project_name: order.project_name || '',
      project_owner: order.project_owner || '',
      project_remark: order.project_remark || ''
    });
    const values = {};
    (order.customFields || []).forEach((field) => {
      values[field.field_id] = field.field_value;
    });
    setCustomValues(values);
    setAttachments((order.attachments || []).filter((item) => item.stage === 'customer_info'));
    setLocalFramework(null);
    onFrameworkChange(null);
  }, [order.id, onFrameworkChange]);

  const loadOptions = async () => {
    try {
      const [ec, cc, fields] = await Promise.all([
        api.get('/end-customers'),
        api.get('/contract-customers'),
        api.get('/settings/fields', { params: { entity_type: 'order' } })
      ]);
      setEndCustomers(ec.data.items || []);
      setContractCustomers(cc.data.items || []);
      setCustomFields(fields.data.items || []);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  useEffect(() => {
    loadOptions();
  }, []);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const checkFramework = async (customerId) => {
    if (!customerId) {
      setLocalFramework(false);
      onFrameworkChange(false);
      return;
    }
    try {
      const { data } = await api.get('/materials/check-framework', { params: { end_customer_id: customerId } });
      const result = Number(data.hasFramework) === 1;
      setLocalFramework(result);
      onFrameworkChange(result);
    } catch {
      setLocalFramework(null);
      onFrameworkChange(null);
    }
  };

  const save = async (advance = false) => {
    setError('');
    setNotice('');
    setSaving(true);
    try {
      const payload = { ...form, customValues };
      await api.patch(`/orders/${order.id}`, payload);
      if (advance) await api.patch(`/orders/${order.id}/status`, { action: 'advance' });
      onChanged();
      setNotice(advance ? '已保存并进入下一步' : '客户信息已保存');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const uploadAttachment = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('stage', 'customer_info');
    try {
      await api.post(`/orders/${order.id}/attachments`, formData);
      const { data } = await api.get(`/orders/${order.id}/attachments`);
      setAttachments(data.items.filter((item) => item.stage === 'customer_info'));
      onChanged();
    } catch (err) {
      setError(errorMessage(err, '上传失败'));
    }
  };

  const deleteAttachment = async (attachmentId) => {
    try {
      await api.delete(`/orders/${order.id}/attachments/${attachmentId}`);
      setAttachments((prev) => prev.filter((item) => item.id !== attachmentId));
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const openDownload = async (path) => {
    try {
      await downloadFile(path);
    } catch {
      setError('下载失败，请重试');
    }
  };

  if (!form) return null;

  const frameworkChipSx = (isFramework) => ({
    height: 34,
    width: '100%',
    maxWidth: '100%',
    borderRadius: '999px',
    fontWeight: 700,
    fontSize: 13,
    lineHeight: 1,
    letterSpacing: 0.5,
    whiteSpace: 'nowrap',
    transition: 'all 0.2s ease',
    color: '#fff',
    background: isFramework
      ? 'linear-gradient(135deg, #43A047 0%, #2E7D32 100%)'
      : 'linear-gradient(135deg, #E53935 0%, #C62828 100%)',
    boxShadow: isFramework
      ? '0 2px 8px rgba(46, 125, 50, 0.25)'
      : '0 2px 8px rgba(211, 47, 47, 0.25)',
    '& .MuiChip-icon': {
      fontSize: 18,
      ml: 0.75,
      mr: 0.25,
      color: '#fff'
    },
    '& .MuiChip-label': { px: 0.75, textAlign: 'center' }
  });

  return (
    <StepWrapper title="客户信息" subtitle="项目基础信息与技术要求文件" readOnly={readOnly}>
      {error && (
        <Box sx={{ mb: 2 }}>
          <Alert severity="error">{error}</Alert>
        </Box>
      )}
      {notice && (
        <Box sx={{ mb: 2 }}>
          <Alert severity="success" onClose={() => setNotice('')}>
            {notice}
          </Alert>
        </Box>
      )}
      {/* 基本信息区 */}
      <Paper variant="outlined" sx={{ p: 2.5, mb: 2.5, borderRadius: 2, borderColor: 'divider' }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <EventNoteIcon fontSize="small" color="primary" />
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary' }}>
            基础信息
          </Typography>
        </Stack>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField select label="年份" value={form.year} onChange={(e) => set('year', e.target.value)} fullWidth disabled={readOnly} size="small">
              {YEARS.map((year) => (
                <MenuItem key={year} value={year}>
                  {year}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField select label="月份" value={form.month} onChange={(e) => set('month', e.target.value)} fullWidth disabled={readOnly} size="small">
              {MONTHS.map((month) => (
                <MenuItem key={month} value={month}>
                  {month} 月
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Autocomplete
              size="small"
              options={endCustomers}
              getOptionLabel={(option) => option.customer_name || ''}
              value={endCustomers.find((item) => item.id === form.end_customer_id) || null}
              onChange={(_, option) => {
                const id = option ? option.id : null;
                set('end_customer_id', id);
                checkFramework(id);
              }}
              renderInput={(params) => <TextField {...params} label={t('end_customer')} />}
              isOptionEqualToValue={(option, value) => option.id === value?.id}
              disabled={readOnly}
            />
          </Grid>
          <Grid item xs={12} sm={6} sx={{ display: 'flex', alignItems: 'center' }}>
            {(() => {
              const hasFramework = localFramework !== null ? localFramework : (form.end_customer_id ? Number(order.has_framework) === 1 : null);
              if (hasFramework === null) return null;
              const tooltipTitle = hasFramework
                ? order.framework_source_customer_name
                  ? `适用${order.framework_source_customer_name}框架协议`
                  : '该客户存在框架协议价格，可自动带价'
                : '该客户暂无框架协议价格，报价需人工处理';
              return (
                <Tooltip title={tooltipTitle} arrow placement="top">
                  <Chip
                    icon={hasFramework ? <WorkspacePremiumIcon /> : <CancelIcon />}
                    label={hasFramework ? '框架协议客户' : '无框架协议客户'}
                    sx={frameworkChipSx(hasFramework)}
                  />
                </Tooltip>
              );
            })()}
          </Grid>
          <Grid item xs={12} sm={6}>
            <Autocomplete
              size="small"
              options={contractCustomers}
              getOptionLabel={(option) => option.customer_name || ''}
              value={contractCustomers.find((item) => item.id === form.contract_customer_id) || null}
              onChange={(_, option) => set('contract_customer_id', option ? option.id : null)}
              renderInput={(params) => <TextField {...params} label={t('contract_customer')} />}
              isOptionEqualToValue={(option, value) => option.id === value?.id}
              disabled={readOnly}
            />
          </Grid>
        </Grid>
      </Paper>

      {/* 项目详情区 */}
      <Paper variant="outlined" sx={{ p: 2.5, mb: 2.5, borderRadius: 2, borderColor: 'divider' }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <BusinessIcon fontSize="small" color="primary" />
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary' }}>
            项目详情
          </Typography>
        </Stack>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField label={t('workshop')} value={form.workshop} onChange={(e) => set('workshop', e.target.value)} fullWidth disabled={readOnly} size="small" InputProps={{ startAdornment: <InputAdornment position="start"><LocationOnIcon fontSize="small" /></InputAdornment> }} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField label={t('project_name')} value={form.project_name} onChange={(e) => set('project_name', e.target.value)} fullWidth disabled={readOnly} size="small" />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField label={t('project_owner')} value={form.project_owner} onChange={(e) => set('project_owner', e.target.value)} fullWidth disabled={readOnly} size="small" />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField label={t('project_remark')} value={form.project_remark} onChange={(e) => set('project_remark', e.target.value)} fullWidth disabled={readOnly} size="small" />
          </Grid>
          {customFields.map((field) => (
            <Grid item xs={12} sm={6} key={field.id}>
              <TextField
                label={field.field_name}
                fullWidth
                size="small"
                value={customValues[field.id] || ''}
                onChange={(e) => setCustomValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'}
                InputLabelProps={field.field_type === 'date' ? { shrink: true } : undefined}
                disabled={readOnly}
              />
            </Grid>
          ))}
        </Grid>
      </Paper>

      {/* 技术要求文件区 */}
      <Paper variant="outlined" sx={{ p: 2.5, mb: 2.5, borderRadius: 2, borderColor: 'divider' }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
          <UploadFileIcon fontSize="small" color="primary" />
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary' }}>
            技术要求文件
          </Typography>
        </Stack>
        <List dense disablePadding>
          {attachments.map((item) => (
            <ListItem key={item.id} sx={{ px: 0, py: 1, borderBottom: '1px solid', borderColor: 'divider', '&:last-child': { borderBottom: 'none' }, display: 'flex', alignItems: 'center', gap: 1 }}>
              <UploadFileIcon fontSize="small" color="action" sx={{ flexShrink: 0 }} />
              <ListItemText primary={item.file_name} secondary={item.uploaded_at} primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }} sx={{ flex: 1, minWidth: 0 }} />
              <IconButton onClick={() => openDownload(`/api/orders/${order.id}/attachments/${item.id}/download`)} title="下载" size="small" sx={{ flexShrink: 0 }}>
                <DownloadIcon fontSize="small" />
              </IconButton>
              {!readOnly && (
                <IconButton onClick={() => deleteAttachment(item.id)} title="删除" size="small" color="error" sx={{ flexShrink: 0 }}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              )}
            </ListItem>
          ))}
        </List>
        {!readOnly && (
          <Button component="label" variant="outlined" startIcon={<UploadFileIcon />} size="small" sx={{ mt: 1.5 }}>
            上传技术要求文件
            <input type="file" hidden accept={ATTACHMENT_ACCEPT} onChange={uploadAttachment} />
          </Button>
        )}
      </Paper>
      {!readOnly && (
        <Stack direction="row" spacing={1.5} sx={{ mt: 3, justifyContent: 'flex-end', flexWrap: 'wrap', rowGap: 1 }}>
          <Button variant="outlined" onClick={() => save(false)} disabled={saving}>
            保存
          </Button>
          <Button variant="contained" onClick={() => save(true)} disabled={saving} startIcon={saving ? <CircularProgress size={18} color="inherit" /> : null}>
            保存并进入下一步
          </Button>
        </Stack>
      )}
    </StepWrapper>
  );
}
