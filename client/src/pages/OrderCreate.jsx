import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Autocomplete from '@mui/material/Autocomplete';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Grid from '@mui/material/Grid';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BusinessIcon from '@mui/icons-material/Business';
import CancelIcon from '@mui/icons-material/Cancel';
import EventNoteIcon from '@mui/icons-material/EventNote';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import SaveIcon from '@mui/icons-material/Save';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import AddBusinessIcon from '@mui/icons-material/AddBusiness';
import api, { errorMessage } from '../api';
import { useFieldLabels } from '../utils/fieldLabels';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 15 }, (_, i) => String(CURRENT_YEAR - 5 + i));
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

const frameworkChipSx = (isFramework) => ({
  height: 34,
  width: '100%',
  maxWidth: '100%',
  borderRadius: '999px',
  fontWeight: 700,
  fontSize: 13,
  lineHeight: 1,
  letterSpacing: 0,
  whiteSpace: 'nowrap',
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

function selectOptions(field) {
  if (Array.isArray(field.field_options)) return field.field_options;
  try {
    const parsed = JSON.parse(field.field_options || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function SectionTitle({ icon, title }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 2 }}>
      <Box
        sx={{
          width: 30,
          height: 30,
          borderRadius: 1.5,
          bgcolor: 'rgba(0,78,154,0.08)',
          color: 'primary.main',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}
      >
        {icon}
      </Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'text.primary' }}>
        {title}
      </Typography>
      <Box sx={{ flex: 1, height: 1, bgcolor: 'divider' }} />
    </Stack>
  );
}

export default function OrderCreate() {
  const navigate = useNavigate();
  const { t } = useFieldLabels();
  const [form, setForm] = useState({
    year: String(new Date().getFullYear()),
    month: String(new Date().getMonth() + 1).padStart(2, '0'),
    end_customer_id: null,
    contract_customer_id: null,
    workshop: '',
    project_name: '',
    project_owner: '',
    project_remark: ''
  });
  const [customFields, setCustomFields] = useState([]);
  const [customValues, setCustomValues] = useState({});
  const [endCustomers, setEndCustomers] = useState([]);
  const [contractCustomers, setContractCustomers] = useState([]);
  const [frameworkStatus, setFrameworkStatus] = useState(null);
  const [frameworkChecking, setFrameworkChecking] = useState(false);
  const frameworkTokenRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadBase = async () => {
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
      setError(errorMessage(err, '基础档案加载失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBase();
  }, []);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const checkFramework = async (customerId) => {
    const token = ++frameworkTokenRef.current;
    if (!customerId) {
      setFrameworkStatus(null);
      setFrameworkChecking(false);
      return;
    }
    setFrameworkChecking(true);
    setFrameworkStatus(null);
    try {
      const { data } = await api.get('/materials/check-framework', { params: { end_customer_id: customerId } });
      if (token === frameworkTokenRef.current) {
        setFrameworkStatus(Number(data.hasFramework) === 1);
      }
    } catch {
      if (token === frameworkTokenRef.current) setFrameworkStatus(null);
    } finally {
      if (token === frameworkTokenRef.current) setFrameworkChecking(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const { data } = await api.post('/orders', { ...form, customValues });
      navigate(`/orders/${data.order.id}`);
    } catch (err) {
      setError(errorMessage(err, '创建失败'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/orders')}>
          返回
        </Button>
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
          <AddBusinessIcon fontSize="small" />
        </Box>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>新建商机</Typography>
          <Typography variant="body2" color="text.secondary">录入客户与项目基础信息</Typography>
        </Box>
      </Stack>

      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

      <form onSubmit={submit}>
        <Stack spacing={2}>
          <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, borderColor: 'divider', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
            <SectionTitle icon={<EventNoteIcon fontSize="small" color="primary" />} title="基础信息" />
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField select label="年份" value={form.year} onChange={(e) => set('year', e.target.value)} fullWidth size="small">
                  {YEARS.map((year) => (
                    <MenuItem key={year} value={year}>{year}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField select label="月份" value={form.month} onChange={(e) => set('month', e.target.value)} fullWidth size="small">
                  {MONTHS.map((month) => (
                    <MenuItem key={month} value={month}>{month} 月</MenuItem>
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
                  renderInput={(params) => <TextField {...params} label={`${t('end_customer')}（必填）`} required />}
                  isOptionEqualToValue={(option, value) => option.id === value?.id}
                />
              </Grid>
              <Grid item xs={12} sm={6} sx={{ display: 'flex', alignItems: 'center' }}>
                {frameworkChecking ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                    <CircularProgress size={18} />
                    <Typography variant="caption">正在检查框架协议...</Typography>
                  </Box>
                ) : frameworkStatus === null ? (
                  <Typography variant="caption" color="text.secondary">选择最终客户后显示框架协议状态</Typography>
                ) : (
                  <Tooltip
                    title={frameworkStatus
                      ? '该客户存在框架协议价格，可自动带价'
                      : '该客户暂无框架协议价格，报价需人工处理'}
                    arrow
                    placement="top"
                  >
                    <Chip
                      icon={frameworkStatus ? <WorkspacePremiumIcon /> : <CancelIcon />}
                      label={frameworkStatus ? '框架协议客户' : '无框架协议客户'}
                      sx={frameworkChipSx(frameworkStatus)}
                    />
                  </Tooltip>
                )}
              </Grid>
              <Grid item xs={12} sm={6}>
                <Autocomplete
                  size="small"
                  options={contractCustomers}
                  getOptionLabel={(option) => option.customer_name || ''}
                  value={contractCustomers.find((item) => item.id === form.contract_customer_id) || null}
                  onChange={(_, option) => set('contract_customer_id', option ? option.id : null)}
                  renderInput={(params) => <TextField {...params} label={`${t('contract_customer')}（必填）`} required />}
                  isOptionEqualToValue={(option, value) => option.id === value?.id}
                />
              </Grid>
            </Grid>
          </Paper>

          <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, borderColor: 'divider', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
            <SectionTitle icon={<BusinessIcon fontSize="small" color="primary" />} title="项目详情" />
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label={t('workshop')}
                  value={form.workshop}
                  onChange={(e) => set('workshop', e.target.value)}
                  fullWidth
                  size="small"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <LocationOnIcon fontSize="small" />
                      </InputAdornment>
                    )
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label={`${t('project_name')}（必填）`} value={form.project_name} onChange={(e) => set('project_name', e.target.value)} fullWidth size="small" required />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label={`${t('project_owner')}（必填）`} value={form.project_owner} onChange={(e) => set('project_owner', e.target.value)} fullWidth size="small" required />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label={t('project_remark')} value={form.project_remark} onChange={(e) => set('project_remark', e.target.value)} fullWidth size="small" />
              </Grid>
              {customFields.map((field) => (
                <Grid item xs={12} sm={6} key={field.id}>
                  {field.field_type === 'select' ? (
                    <TextField
                      select
                      label={field.field_name}
                      fullWidth
                      size="small"
                      value={customValues[field.id] || ''}
                      onChange={(e) => setCustomValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                    >
                      <MenuItem value="">不选择</MenuItem>
                      {selectOptions(field).map((option) => (
                        <MenuItem key={option} value={option}>{option}</MenuItem>
                      ))}
                    </TextField>
                  ) : (
                    <TextField
                      label={field.field_name}
                      fullWidth
                      size="small"
                      value={customValues[field.id] || ''}
                      onChange={(e) => setCustomValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                      type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'}
                      InputLabelProps={field.field_type === 'date' ? { shrink: true } : undefined}
                    />
                  )}
                </Grid>
              ))}
            </Grid>
          </Paper>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5 }}>
            <Button variant="outlined" onClick={() => navigate('/orders')} disabled={saving}>
              取消
            </Button>
            <Button type="submit" variant="contained" startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />} disabled={saving}>
              {saving ? '创建中...' : '创建商机'}
            </Button>
          </Box>
        </Stack>
      </form>
    </Stack>
  );
}
