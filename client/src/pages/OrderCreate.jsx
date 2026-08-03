import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import api, { errorMessage } from '../api';
import { ORDER_TYPES } from '../utils/constants';

const YEARS = Array.from({ length: 11 }, (_, i) => String(2020 + i));
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1));

export default function OrderCreate() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    year: String(new Date().getFullYear()),
    month: String(new Date().getMonth() + 1),
    end_customer_id: null,
    contract_customer_id: null,
    order_type: 'A',
    project_no: '',
    workshop: '',
    project_name: '',
    project_owner: '',
    project_remark: ''
  });
  const [customFields, setCustomFields] = useState([]);
  const [customValues, setCustomValues] = useState({});
  const [endCustomers, setEndCustomers] = useState([]);
  const [contractCustomers, setContractCustomers] = useState([]);
  const [hasFramework, setHasFramework] = useState(false);
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
      setError(errorMessage(err, '基础数据加载失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBase();
  }, []);

  const checkFramework = async (customerId) => {
    if (!customerId) {
      setHasFramework(false);
      return;
    }
    try {
      const { data } = await api.get('/materials/check-framework', { params: { end_customer_id: customerId } });
      setHasFramework(Boolean(data.hasFramework));
    } catch {
      setHasFramework(false);
    }
  };

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

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
      <Stack direction="row" alignItems="center" spacing={1}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/orders')}>
          返回
        </Button>
        <Typography variant="h5">新建销售机会</Typography>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      <form onSubmit={submit}>
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2 }}>
              客户信息
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <TextField select label="年份" value={form.year} onChange={(e) => set('year', e.target.value)} fullWidth>
                  {YEARS.map((year) => (
                    <MenuItem key={year} value={year}>
                      {year}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField select label="月份" value={form.month} onChange={(e) => set('month', e.target.value)} fullWidth>
                  {MONTHS.map((month) => (
                    <MenuItem key={month} value={month}>
                      {month} 月
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} md={6}>
                <Autocomplete
                  options={endCustomers}
                  getOptionLabel={(option) => option.customer_name || ''}
                  value={endCustomers.find((item) => item.id === form.end_customer_id) || null}
                  onChange={(_, option) => {
                    set('end_customer_id', option ? option.id : null);
                    checkFramework(option ? option.id : null);
                  }}
                  renderInput={(params) => <TextField {...params} label="最终客户（必填）" required />}
                  isOptionEqualToValue={(option, value) => option.id === value?.id}
                  renderOption={(props, option) => (
                    <li {...props} key={option.id}>
                      {option.customer_name}
                    </li>
                  )}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Autocomplete
                  options={contractCustomers}
                  getOptionLabel={(option) => option.customer_name || ''}
                  value={contractCustomers.find((item) => item.id === form.contract_customer_id) || null}
                  onChange={(_, option) => set('contract_customer_id', option ? option.id : null)}
                  renderInput={(params) => <TextField {...params} label="合同客户（必填）" required />}
                  isOptionEqualToValue={(option, value) => option.id === value?.id}
                  renderOption={(props, option) => (
                    <li {...props} key={option.id}>
                      {option.customer_name}
                    </li>
                  )}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl>
                  <FormLabel>销售机会类型</FormLabel>
                  <RadioGroup row value={form.order_type} onChange={(e) => set('order_type', e.target.value)}>
                    {ORDER_TYPES.map((type) => (
                      <FormControlLabel key={type} value={type} control={<Radio />} label={type} />
                    ))}
                  </RadioGroup>
                </FormControl>
                {hasFramework && <Chip size="small" color="success" label="有框架协议" sx={{ mt: 1 }} />}
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField label="项目编号" value={form.project_no} onChange={(e) => set('project_no', e.target.value)} fullWidth />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField label="车间" value={form.workshop} onChange={(e) => set('workshop', e.target.value)} fullWidth />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="项目名称（必填）" value={form.project_name} onChange={(e) => set('project_name', e.target.value)} fullWidth required />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="项目负责人（必填）" value={form.project_owner} onChange={(e) => set('project_owner', e.target.value)} fullWidth required />
              </Grid>
              <Grid item xs={12}>
                <TextField label="项目备注" value={form.project_remark} onChange={(e) => set('project_remark', e.target.value)} fullWidth multiline minRows={2} />
              </Grid>
              {customFields.map((field) => (
                <Grid item xs={12} sm={6} key={field.id}>
                  <TextField
                    label={field.field_name}
                    fullWidth
                    value={customValues[field.id] || ''}
                    onChange={(e) => setCustomValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                    type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'}
                    InputLabelProps={field.field_type === 'date' ? { shrink: true } : undefined}
                  />
                </Grid>
              ))}
            </Grid>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
              <Button type="submit" variant="contained" startIcon={<SaveIcon />} disabled={saving}>
                {saving ? <CircularProgress size={20} color="inherit" /> : '创建销售机会'}
              </Button>
            </Box>
          </CardContent>
        </Card>
      </form>
    </Stack>
  );
}
