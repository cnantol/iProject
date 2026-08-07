import { useEffect, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
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
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import SearchIcon from '@mui/icons-material/Search';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import HandshakeIcon from '@mui/icons-material/Handshake';
import InventoryIcon from '@mui/icons-material/Inventory';
import PriceCheckIcon from '@mui/icons-material/PriceCheck';
import InboxIcon from '@mui/icons-material/Inbox';
import api, { errorMessage } from '../api';
import { useConfirm } from '../components/ConfirmDialog';
import { fmtMoney } from '../utils/helpers';

const TABS = [
  { key: 'end_customer', label: '最终客户', url: 'end-customers', icon: <PeopleAltIcon /> },
  { key: 'contract_customer', label: '合同客户', url: 'contract-customers', icon: <HandshakeIcon /> },
  { key: 'material', label: '框架协议价', url: 'materials', icon: <InventoryIcon /> },
  { key: 'guide_price', label: '系统指导价', url: 'guide-prices', icon: <PriceCheckIcon /> }
];
const PAGED_TABS = ['material', 'guide_price'];

export default function MaterialList() {
  const confirm = useConfirm();
  const [tab, setTab] = useState('end_customer');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [endCustomers, setEndCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [editor, setEditor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyLoading, setCopyLoading] = useState(false);
  const [copyCustomers, setCopyCustomers] = useState([]);
  const [copySelected, setCopySelected] = useState([]);
  const [copySearch, setCopySearch] = useState('');
  const requestIdRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadData = async (nextTab = tab, nextPage = page, nextPageSize = pageSize) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');
    try {
      const url = TABS.find((t) => t.key === nextTab).url;
      if (PAGED_TABS.includes(nextTab)) {
        const params = { page: nextPage + 1, pageSize: nextPageSize };
        if (debouncedSearch.trim()) params.q = debouncedSearch.trim();
        const [res, ec] =
          nextTab === 'material'
            ? await Promise.all([api.get('/materials', { params }), api.get('/end-customers')])
            : [await api.get(`/${url}`, { params }), { data: { items: [] } }];
        if (requestId !== requestIdRef.current) return;
        setItems(res.data.items || []);
        setTotal(res.data.total || 0);
        setEndCustomers(ec.data.items || []);
      } else {
        const params = debouncedSearch.trim() ? { q: debouncedSearch.trim() } : undefined;
        const res = await api.get(`/${url}`, { params });
        if (requestId !== requestIdRef.current) return;
        setItems(res.data.items || []);
        setTotal((res.data.items || []).length);
        if (nextTab === 'end_customer') {
          const ecRes = await api.get('/end-customers');
          if (requestId !== requestIdRef.current) return;
          setEndCustomers(ecRes.data.items || []);
        } else {
          setEndCustomers([]);
        }
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(errorMessage(err, '加载失败'));
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    setPage(0);
    loadData(tab, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, debouncedSearch]);

  const tabDef = {
    end_customer: { url: 'end-customers', fields: ['customer_name', 'short_name', 'parent_customer_id', 'contact_person', 'phone', 'email', 'remark'], labels: { customer_name: '客户名称', short_name: '客户简称', parent_customer_id: '所属集团', contact_person: '联系人', phone: '电话', email: '邮箱', remark: '备注' } },
    contract_customer: { url: 'contract-customers', fields: ['customer_name', 'short_name', 'contact_person', 'phone', 'email', 'remark'], labels: { customer_name: '客户名称', short_name: '客户简称', contact_person: '联系人', phone: '电话', email: '邮箱', remark: '备注' } },
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
      loadData(tab, page);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const remove = async (row) => {
    if (!(await confirm(`确认删除「${row.customer_name || row.material_no || row.id}」？`))) return;
    try {
      await api.delete(`/${tabDef[tab].url}/${row.id}`);
      loadData(tab, page);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const openCopy = async () => {
    setCopyOpen(true);
    setCopyLoading(true);
    setCopySearch('');
    setCopySelected([]);
    try {
      const { data } = await api.get('/end-customers');
      setCopyCustomers(data.items || []);
    } catch (err) {
      setError(errorMessage(err));
      setCopyOpen(false);
    } finally {
      setCopyLoading(false);
    }
  };

  const toggleCopy = (id) => {
    setCopySelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const copyFiltered = copyCustomers.filter((customer) => {
    const q = copySearch.trim().toLowerCase();
    if (!q) return true;
    return [customer.customer_name, customer.short_name, customer.contact_person, customer.phone].some((value) =>
      String(value || '').toLowerCase().includes(q)
    );
  });
  const copyAllSelected = copyFiltered.length > 0 && copyFiltered.every((customer) => copySelected.includes(customer.id));

  const toggleCopyAll = () => {
    setCopySelected(copyAllSelected ? [] : copyFiltered.map((customer) => customer.id));
  };

  const confirmCopy = async () => {
    setError('');
    setSuccess('');
    try {
      const { data } = await api.post('/contract-customers/copy-from-end', { ids: copySelected });
      setSuccess(`已复制 ${data.copied} 个客户${data.skipped && data.skipped.length > 0 ? `，跳过 ${data.skipped.length} 个已存在客户` : ''}`);
      setCopyOpen(false);
      setCopySelected([]);
      setCopySearch('');
      loadData(tab, page);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const displayItems = PAGED_TABS.includes(tab) ? items : items.slice(page * pageSize, page * pageSize + pageSize);

  const fieldValue = (row, field) => {
    if (field === 'end_customer_id') return row.end_customer_name || row.end_customer_id || '';
    if (field === 'parent_customer_id') {
      const parent = endCustomers.find((customer) => customer.id === Number(row.parent_customer_id));
      return parent ? parent.customer_name : row.parent_customer_id ? `#${row.parent_customer_id}` : '-';
    }
    if (['unit_price_ex_vat', 'guide_unit_price_ex_vat'].includes(field)) return fmtMoney(row[field]);
    return row[field] || '-';
  };
  const priceFields = ['unit_price_ex_vat', 'guide_unit_price_ex_vat'];

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
        <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ px: 1.5, pt: 0.5, '& .MuiTabs-indicator': { height: 3, borderRadius: 2 } }}>
          {TABS.map((item) => (
            <Tab
              key={item.key}
              value={item.key}
              label={item.label}
              icon={item.icon}
              iconPosition="start"
              sx={{ '&.Mui-selected': { fontWeight: 800, color: 'primary.main' } }}
            />
          ))}
        </Tabs>
        <Box sx={{ p: 2 }}>
          <Box sx={{ p: 1.5, mb: 2, borderRadius: 2.5, border: 1, borderColor: 'divider', bgcolor: 'action.hover', display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              label="搜索"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
              sx={{ width: { xs: '100%', md: 320 } }}
            />
            {!loading && <Chip size="small" label={`共 ${total} 条`} variant="outlined" sx={{ fontWeight: 700 }} />}
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
              支持按名称 / 物料号 / 协议号搜索
            </Typography>
            <Box sx={{ flex: 1 }} />
            {tab === 'contract_customer' && (
              <Button size="small" variant="outlined" startIcon={<ContentCopyIcon />} onClick={openCopy}>
                从最终客户复制
              </Button>
            )}
          </Box>
          {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 2, '& .MuiAlert-icon': { color: 'success.main' } }}>{success}</Alert>}
          {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2, '& .MuiAlert-icon': { color: 'error.main' } }}>{error}</Alert>}
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { bgcolor: 'action.hover', fontWeight: 700, whiteSpace: 'nowrap' } }}>
                  {tabDef[tab].fields.map((field) => (
                    <TableCell key={field} sx={{ textAlign: priceFields.includes(field) ? 'right' : 'left' }}>
                      {tabDef[tab].labels[field]}
                    </TableCell>
                  ))}
                  <TableCell sx={{ width: 120, textAlign: 'right' }}>操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {displayItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={tabDef[tab].fields.length + 1} align="center" sx={{ py: 8, color: 'text.secondary' }}>
                      <Stack spacing={1} alignItems="center">
                        <InboxIcon sx={{ fontSize: 56, color: 'text.disabled' }} />
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>暂无数据</Typography>
                        <Typography variant="caption" color="text.secondary">可点击右上角“新增”开始录入</Typography>
                      </Stack>
                    </TableCell>
                  </TableRow>
                )}
                {displayItems.map((row) => (
                  <TableRow key={row.id} hover sx={{ transition: 'background-color 0.15s ease' }}>
                    {tabDef[tab].fields.map((field, index) => {
                      const nowrapFields = {
                        end_customer: ['customer_name', 'parent_customer_id', 'phone', 'email'],
                        contract_customer: ['customer_name', 'phone', 'email'],
                        material: ['material_no', 'unit_price_ex_vat', 'valid_from', 'valid_to'],
                        guide_price: ['material_no', 'guide_unit_price_ex_vat']
                      };
                      return (
                        <TableCell
                          key={field}
                          sx={{
                            ...(index === 0 ? { fontWeight: 700, color: 'text.primary' } : {}),
                            ...(nowrapFields[tab]?.includes(field) ? { whiteSpace: 'nowrap' } : {}),
                            ...(priceFields.includes(field) ? { textAlign: 'right', whiteSpace: 'nowrap' } : {})
                          }}
                        >
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
          {!loading && (
            <TablePagination
              component="div"
              count={total}
              page={page}
              rowsPerPage={pageSize}
              onPageChange={(_, nextPage) => {
                setPage(nextPage);
                loadData(tab, nextPage);
              }}
              onRowsPerPageChange={(e) => {
                const nextSize = parseInt(e.target.value, 10) || 20;
                setPageSize(nextSize);
                setPage(0);
                loadData(tab, 0, nextSize);
              }}
              rowsPerPageOptions={[10, 20, 50, 100]}
              labelRowsPerPage="每页"
              labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${count}`}
              sx={{ borderTop: '1px solid', borderColor: 'divider' }}
            />
          )}
        </Box>
      </Card>

      <Dialog open={copyOpen} onClose={() => setCopyOpen(false)} maxWidth="md" fullWidth>
        <Box sx={{ height: 4, borderRadius: '10px 10px 0 0', bgcolor: 'primary.main' }} />
        <DialogTitle>从最终客户复制到合同客户</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5}>
            <TextField
              size="small"
              label="搜索最终客户"
              value={copySearch}
              onChange={(e) => setCopySearch(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
            />
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
              <Typography variant="caption" color="text.secondary">
                已选 {copySelected.length} / {copyFiltered.length} 个
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button size="small" onClick={toggleCopyAll}>
                  {copyAllSelected ? '清空选择' : '全选'}
                </Button>
              </Stack>
            </Stack>
            {copyLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
                <CircularProgress />
              </Box>
            ) : copyFiltered.length === 0 ? (
              <Box sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}>
                <InboxIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
                <Typography variant="body2" sx={{ mt: 1 }}>暂无最终客户可复制</Typography>
              </Box>
            ) : (
              <Box sx={{ maxHeight: 360, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 2 }}>
                {copyFiltered.map((customer) => (
                  <Box
                    key={customer.id}
                    onClick={() => toggleCopy(customer.id)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      p: 1,
                      cursor: 'pointer',
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      '&:last-of-type': { borderBottom: 0 },
                      '&:hover': { bgcolor: 'action.hover' }
                    }}
                  >
                    <Checkbox checked={copySelected.includes(customer.id)} />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {customer.customer_name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {[customer.short_name, customer.contact_person, customer.phone].filter(Boolean).join(' · ') || '-'}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCopyOpen(false)}>取消</Button>
          <Button variant="contained" startIcon={<ContentCopyIcon />} disabled={copyLoading || copySelected.length === 0} onClick={confirmCopy}>
            复制到合同客户
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(editor)} onClose={() => setEditor(null)} maxWidth="sm" fullWidth>
        <Box sx={{ height: 4, borderRadius: '10px 10px 0 0', bgcolor: 'primary.main' }} />
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
                ) : field === 'parent_customer_id' ? (
                  <TextField
                    select
                    label="所属集团（框架归属）"
                    fullWidth
                    value={editor?.parent_customer_id || ''}
                    onChange={(e) => setEditor((prev) => ({ ...prev, parent_customer_id: e.target.value === '' ? null : Number(e.target.value) }))}
                    helperText="选择集团后，子客户可自动继承集团框架协议价格"
                  >
                    <MenuItem value="">独立客户（不使用集团框架）</MenuItem>
                    {endCustomers
                      .filter((customer) => !editor?.id || customer.id !== editor.id)
                      .map((customer) => (
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
