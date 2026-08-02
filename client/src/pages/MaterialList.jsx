import { useCallback, useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import SearchIcon from '@mui/icons-material/Search';
import api, { errorMessage } from '../api';
import { fmtMoney } from '../utils/helpers';

const TABS = [
  { key: 'end_customer', label: '最终客户', url: 'end-customers' },
  { key: 'contract_customer', label: '合同客户', url: 'contract-customers' },
  { key: 'material', label: '框架协议价', url: 'materials' },
  { key: 'guide_price', label: '系统指导价', url: 'guide-prices' }
];

export default function MaterialList() {
  const [tab, setTab] = useState('end_customer');
  const [items, setItems] = useState([]);
  const [endCustomers, setEndCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = search.trim() ? { q: search.trim() } : undefined;
      const [res, ec] = await Promise.all([api.get(`/${TABS.find((t) => t.key === tab).url}`, { params }), tab === 'material' ? api.get('/end-customers') : Promise.resolve({ data: { items: [] } })]);
      setItems(res.data.items || []);
      setEndCustomers(ec.data.items || []);
    } catch (err) {
      setError(errorMessage(err, '加载失败'));
    } finally {
      setLoading(false);
    }
  }, [tab, search]);

  useEffect(() => {
    load();
  }, [load]);

  const tabDef = {
    end_customer: { url: 'end-customers', fields: ['customer_name', 'contact_person', 'phone', 'email', 'remark'], labels: { customer_name: '客户名称', contact_person: '联系人', phone: '电话', email: '邮箱', remark: '备注' } },
    contract_customer: { url: 'contract-customers', fields: ['customer_name', 'contact_person', 'phone', 'email', 'remark'], labels: { customer_name: '客户名称', contact_person: '联系人', phone: '电话', email: '邮箱', remark: '备注' } },
    material: {
      url: 'materials',
      fields: ['end_customer_id', 'material_no', 'description', 'unit_price_ex_vat', 'unit', 'agreement_no', 'valid_from', 'valid_to', 'remark'],
      labels: { end_customer_id: '最终客户', material_no: '物料号', description: '描述', unit_price_ex_vat: '协议未税单价', unit: '单位', agreement_no: '协议编号', valid_from: '生效日期', valid_to: '失效日期', remark: '备注' }
    },
    guide_price: { url: 'guide-prices', fields: ['material_no', 'description', 'guide_unit_price_ex_vat', 'unit', 'remark'], labels: { material_no: '物料号', description: '描述', guide_unit_price_ex_vat: '指导价', unit: '单位', remark: '备注' } }
  };

  const openCreate = () => setEditor({});
  const openEdit = (row) => setEditor({ ...row });

  const saveEditor = async () => {
    setError('');
    try {
      const payload = { ...editor };
      delete payload.id;
      delete payload.created_at;
      delete payload.updated_at;
      delete payload.end_customer_name;
      if (editor.id) {
        await api.put(`/${tabDef[tab].url}/${editor.id}`, payload);
      } else {
        await api.post(`/${tabDef[tab].url}`, payload);
      }
      setEditor(null);
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`确认删除「${row.customer_name || row.material_no || row.id}」？`)) return;
    try {
      await api.delete(`/${tabDef[tab].url}/${row.id}`);
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const fieldValue = (row, field) => {
    if (field === 'end_customer_id') return row.end_customer_name || row.end_customer_id || '';
    if (['unit_price_ex_vat', 'guide_unit_price_ex_vat'].includes(field)) return fmtMoney(row[field]);
    return row[field] || '-';
  };

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" spacing={1.5} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
        <Box>
          <Typography variant="h5">基础数据</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>
            最终客户、合同客户、框架协议价与系统指导价
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          新增
        </Button>
      </Stack>
      <Card>
        <Box sx={{ height: 4, borderRadius: '10px 10px 0 0', bgcolor: 'primary.main' }} />
        <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ px: 1.5, pt: 0.5 }}>
          {TABS.map((item) => (
            <Tab key={item.key} value={item.key} label={item.label} />
          ))}
        </Tabs>
        <Box sx={{ p: 2 }}>
          <TextField
            size="small"
            label="搜索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
            sx={{ mb: 2, width: { xs: '100%', md: 320 } }}
          />
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  {tabDef[tab].fields.map((field) => (
                    <TableCell key={field}>{tabDef[tab].labels[field]}</TableCell>
                  ))}
                  <TableCell sx={{ width: 120 }}>操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={tabDef[tab].fields.length + 1} align="center" sx={{ py: 8, color: 'text.secondary' }}>
                      暂无数据
                    </TableCell>
                  </TableRow>
                )}
                {items.map((row) => (
                  <TableRow key={row.id} hover>
                    {tabDef[tab].fields.map((field) => {
                      const nowrapFields = {
                        end_customer: ['customer_name', 'phone', 'email'],
                        contract_customer: ['customer_name', 'phone', 'email'],
                        material: ['material_no', 'unit_price_ex_vat', 'valid_from', 'valid_to'],
                        guide_price: ['material_no', 'guide_unit_price_ex_vat']
                      };
                      return (
                        <TableCell key={field} sx={nowrapFields[tab]?.includes(field) ? { whiteSpace: 'nowrap' } : undefined}>
                          {fieldValue(row, field)}
                        </TableCell>
                      );
                    })}
                    <TableCell>
                      <IconButton size="small" onClick={() => openEdit(row)} title="编辑">
                        <EditIcon />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => remove(row)} title="删除">
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Box>
      </Card>

      <Dialog open={Boolean(editor)} onClose={() => setEditor(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{editor?.id ? '编辑' : '新增'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            {tabDef[tab].fields.map((field) => (
              <Grid item xs={12} sm={6} key={field}>
                {field === 'end_customer_id' ? (
                  <TextField
                    select
                    label={tabDef[tab].labels[field]}
                    fullWidth
                    value={editor?.end_customer_id || ''}
                    onChange={(e) => setEditor((prev) => ({ ...prev, end_customer_id: Number(e.target.value) }))}
                  >
                    {endCustomers.map((customer) => (
                      <MenuItem key={customer.id} value={customer.id}>
                        {customer.customer_name}
                      </MenuItem>
                    ))}
                  </TextField>
                ) : (
                  <TextField
                    label={tabDef[tab].labels[field]}
                    fullWidth
                    type={['unit_price_ex_vat', 'guide_unit_price_ex_vat'].includes(field) ? 'number' : ['valid_from', 'valid_to'].includes(field) ? 'date' : 'text'}
                    value={editor?.[field] || ''}
                    onChange={(e) => setEditor((prev) => ({ ...prev, [field]: e.target.value }))}
                    InputLabelProps={['valid_from', 'valid_to'].includes(field) ? { shrink: true } : undefined}
                  />
                )}
              </Grid>
            ))}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditor(null)}>取消</Button>
          <Button variant="contained" onClick={saveEditor}>
            保存
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
