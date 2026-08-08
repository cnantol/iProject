import { useEffect, useState } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import api, { errorMessage } from '../api';
import { ORDER_TYPES } from '../utils/constants';
import { downloadFile } from '../utils/download';
import { useFieldLabels } from '../utils/fieldLabels';
import StepWrapper from './StepWrapper';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 15 }, (_, i) => String(CURRENT_YEAR - 5 + i));
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1));

export default function StepCustomerInfo({ order, readOnly, onChanged }) {
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

  useEffect(() => {
    setForm({
      year: order.year || '',
      month: order.month || '',
      end_customer_id: order.end_customer_id || null,
      contract_customer_id: order.contract_customer_id || null,
      order_type: order.order_type || 'A',
      project_no: order.project_no || '',
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
  }, [order]);

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
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <TextField select label="年份" value={form.year} onChange={(e) => set('year', e.target.value)} fullWidth disabled={readOnly}>
            {YEARS.map((year) => (
              <MenuItem key={year} value={year}>
                {year}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <TextField select label="月份" value={form.month} onChange={(e) => set('month', e.target.value)} fullWidth disabled={readOnly}>
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
            onChange={(_, option) => set('end_customer_id', option ? option.id : null)}
            renderInput={(params) => <TextField {...params} label={t('end_customer')} />}
            isOptionEqualToValue={(option, value) => option.id === value?.id}
            disabled={readOnly}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <Autocomplete
            options={contractCustomers}
            getOptionLabel={(option) => option.customer_name || ''}
            value={contractCustomers.find((item) => item.id === form.contract_customer_id) || null}
            onChange={(_, option) => set('contract_customer_id', option ? option.id : null)}
            renderInput={(params) => <TextField {...params} label={t('contract_customer')} />}
            isOptionEqualToValue={(option, value) => option.id === value?.id}
            disabled={readOnly}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <FormControl disabled={readOnly}>
            <FormLabel>{t('order_type')}</FormLabel>
            <RadioGroup row value={form.order_type} onChange={(e) => set('order_type', e.target.value)}>
              {ORDER_TYPES.map((type) => (
                <FormControlLabel key={type} value={type} control={<Radio />} label={type} />
              ))}
            </RadioGroup>
          </FormControl>
          {Number(order.has_framework) === 1 && <Chip size="small" color="success" label="有框架协议" sx={{ ml: 1 }} />}
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <TextField label={t('project_no')} value={form.project_no} onChange={(e) => set('project_no', e.target.value)} fullWidth disabled={readOnly} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <TextField label={t('workshop')} value={form.workshop} onChange={(e) => set('workshop', e.target.value)} fullWidth disabled={readOnly} />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField label={t('project_name')} value={form.project_name} onChange={(e) => set('project_name', e.target.value)} fullWidth disabled={readOnly} />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField label={t('project_owner')} value={form.project_owner} onChange={(e) => set('project_owner', e.target.value)} fullWidth disabled={readOnly} />
        </Grid>
        <Grid item xs={12}>
          <TextField label={t('project_remark')} value={form.project_remark} onChange={(e) => set('project_remark', e.target.value)} fullWidth multiline minRows={2} disabled={readOnly} />
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
              disabled={readOnly}
            />
          </Grid>
        ))}
        <Grid item xs={12}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            技术要求文件
          </Typography>
          <List dense disablePadding>
            {attachments.map((item) => (
              <ListItem key={item.id} secondaryAction={!readOnly && (
                <IconButton edge="end" onClick={() => deleteAttachment(item.id)} title="删除">
                  <DeleteIcon />
                </IconButton>
              )}>
                <ListItemText primary={item.file_name} secondary={item.uploaded_at} />
                <IconButton onClick={() => openDownload(`/api/orders/${order.id}/attachments/${item.id}/download`)} title="下载">
                  <DownloadIcon />
                </IconButton>
              </ListItem>
            ))}
          </List>
          {!readOnly && (
            <Button component="label" variant="outlined" startIcon={<UploadFileIcon />} sx={{ mt: 1 }}>
              上传技术要求文件
              <input type="file" hidden accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={uploadAttachment} />
            </Button>
          )}
        </Grid>
      </Grid>
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
