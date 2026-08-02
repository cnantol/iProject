import { useCallback, useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
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
import BackupIcon from '@mui/icons-material/Backup';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import EditIcon from '@mui/icons-material/Edit';
import HistoryIcon from '@mui/icons-material/History';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import RestoreIcon from '@mui/icons-material/Restore';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SaveIcon from '@mui/icons-material/Save';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import api, { errorMessage } from '../api';
import { IMPORT_TARGET_LABELS } from '../utils/constants';
import { fmtDateTime, authUrl } from '../utils/helpers';

const ENTITY_CARDS = [
  { key: 'end_customer', label: '客户信息（最终/合同客户）' },
  { key: 'contract_customer', label: '客户信息（合同客户）' },
  { key: 'order', label: '订单信息' },
  { key: 'guide_price', label: '指导价' },
  { key: 'material', label: '框架协议价' }
];

const FIELD_TYPES = [
  { value: 'text', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'date', label: '日期' },
  { value: 'select', label: '下拉' }
];

const BUILTIN_STEP_FIELDS = {
  customer_info: ['年份', '月份', '合同客户', '最终客户', '订单类型', '项目编号', '车间', '项目名称', '项目负责人', '项目备注', '框架协议标记', '技术要求文件'],
  proposal: ['版本标签', '方案文件', '版本备注', '物料号', '物料描述', '物料类型', '数量', '单位', '排序号', '选型备注'],
  quotation: ['报价轮次', '轮次状态', '物料号', '物料描述', '物料类型', '价格来源', '协议/指导未税单价', '实付比例(%)', '最终未税单价', '数量', '行金额', '单位', '明细备注'],
  approval_pending: ['报价轮次', 'Sales Force 审批', 'OA 合同审批', '审批状态', '审批备注'],
  bid_decision: ['方案版本预览', '最新报价轮次', '选中报价轮次', '中标结果', '订单总金额'],
  finance: ['Sales Order', 'Customer PO', 'PO 号', 'PO 金额', '总金额', '付款条款', '客户盖章合同'],
  shipping_invoicing: ['发货状态', '发货日期', '发货批次', '批次百分比', '开票状态', '开票日期', '发票号', '发票金额', '发票附件'],
  commission: ['佣金 Excel', '佣金匹配', '佣金金额', '佣金日期', '人工补录记录'],
  closed: ['闭环时间', '订单只读状态'],
  lost_closed: ['闭环时间', '未中标关闭状态']
};

export default function Settings() {
  const [tab, setTab] = useState('flow');
  const [error, setError] = useState('');

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h5">系统设置</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>
          流程与字段、数据导入、报价单式样与系统管理
        </Typography>
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      <Card>
        <Box sx={{ height: 4, borderRadius: '10px 10px 0 0', bgcolor: 'primary.main' }} />
        <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto" sx={{ px: 1.5 }}>
          <Tab value="flow" label="流程与字段" />
          <Tab value="import" label="数据导入" />
          <Tab value="quote" label="报价单式样" />
          <Tab value="system" label="系统管理" />
        </Tabs>
      </Card>
      {tab === 'flow' && <FlowFieldManager onError={setError} />}
      {tab === 'import' && <ImportManager onError={setError} />}
      {tab === 'quote' && <QuoteStyle onError={setError} />}
      {tab === 'system' && <SystemManager onError={setError} />}
    </Stack>
  );
}

function FlowFieldManager({ onError }) {
  const [steps, setSteps] = useState([]);
  const [allFields, setAllFields] = useState([]);
  const [bindings, setBindings] = useState({});
  const [selectedStep, setSelectedStep] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [editor, setEditor] = useState(null);
  const [bindOpen, setBindOpen] = useState(false);
  const [pickIds, setPickIds] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [wf, fields, bindRes] = await Promise.all([
        api.get('/settings/workflow'),
        api.get('/settings/fields'),
        api.get('/settings/workflow/bindings')
      ]);
      const { data } = wf;
      setSteps(data.steps || []);
      setAllFields(fields.data.items || []);
      const map = {};
      (bindRes.data.items || []).forEach((item) => {
        if (!map[item.step_key]) map[item.step_key] = [];
        map[item.step_key].push(item.field_id);
      });
      setBindings(map);
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (steps.length && !selectedStep) setSelectedStep(steps[0].step_key);
  }, [steps, selectedStep]);

  const selected = steps.find((step) => step.step_key === selectedStep) || null;
  const selectedFieldIds = bindings[selectedStep] || [];
  const selectedFields = selectedFieldIds
    .map((id) => allFields.find((field) => field.id === id))
    .filter(Boolean);
  const boundIdSet = new Set(Object.values(bindings).flat());
  const unboundFields = allFields.filter((field) => !boundIdSet.has(field.id));
  const builtinFields = selected ? BUILTIN_STEP_FIELDS[selected.step_key] || [] : [];

  const save = async () => {
    setSavingConfig(true);
    try {
      await api.put('/settings/workflow', { steps });
      onError('');
      window.alert('流程展示配置已保存');
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setSavingConfig(false);
    }
  };

  const persistBindings = async (stepKey, fieldIds, message) => {
    try {
      await api.put('/settings/workflow/bindings', { bindings: [{ step_key: stepKey, field_ids: fieldIds }] });
      setBindings((prev) => ({ ...prev, [stepKey]: fieldIds }));
      onError('');
      if (message) window.alert(message);
      return true;
    } catch (err) {
      onError(errorMessage(err));
      return false;
    }
  };

  const updateStep = (key, value) => {
    setSteps((prev) => prev.map((step) => (step.step_key === selectedStep ? { ...step, [key]: value } : step)));
  };

  const saveField = async () => {
    const name = String(editor?.field_name || '').trim();
    if (!name) {
      onError('字段名称必填');
      return;
    }
    const payload = {
      field_name: name,
      field_type: editor.field_type,
      field_options: editor.field_type === 'select' ? (editor.field_options || '').split(',').map((item) => item.trim()).filter(Boolean) : null
    };
    try {
      if (editor.id) {
        await api.put(`/settings/fields/${editor.id}`, { ...payload, sort_order: editor.sort_order });
        setEditor(null);
        window.alert('自定义字段已更新');
        load();
        return;
      }
      const { data } = await api.post('/settings/fields', { entity_type: editor.entity_type || 'order', ...payload });
      const next = [...selectedFieldIds, data.id];
      await persistBindings(selectedStep, next, `字段「${data.field_name}」已创建并绑定到当前步骤`);
      setEditor(null);
      load();
    } catch (err) {
      onError(errorMessage(err));
    }
  };

  const removeFromStep = async (field) => {
    if (!window.confirm(`确认将「${field.field_name}」从当前步骤移除？字段本身不会删除。`)) return;
    const next = selectedFieldIds.filter((id) => id !== field.id);
    await persistBindings(selectedStep, next, `「${field.field_name}」已从当前步骤移除`);
  };

  const deleteField = async (field) => {
    if (!window.confirm(`确认删除自定义字段「${field.field_name}」？关联值、绑定关系将一并删除。`)) return;
    try {
      await api.delete(`/settings/fields/${field.id}`);
      window.alert('自定义字段已删除');
      load();
    } catch (err) {
      onError(errorMessage(err));
    }
  };

  const openBindDialog = () => {
    setPickIds([]);
    setBindOpen(true);
  };

  const saveBindSelection = async () => {
    const next = Array.from(new Set([...selectedFieldIds, ...pickIds]));
    const ok = await persistBindings(selectedStep, next, `已绑定 ${pickIds.length} 个字段到当前步骤`);
    if (!ok) return;
    setBindOpen(false);
    setPickIds([]);
  };

  const quickBind = async (field) => {
    const next = [...selectedFieldIds, field.id];
    await persistBindings(selectedStep, next, `「${field.field_name}」已绑定到当前步骤`);
  };

  const typeLabel = (type) => FIELD_TYPES.find((item) => item.value === type)?.label || type;
  const entityLabel = (key) => ENTITY_CARDS.find((item) => item.key === key)?.label || key;
  const bindableFields = allFields.filter((field) => !selectedFieldIds.includes(field.id));

  return (
    <Card>
      <Box sx={{ height: 4, borderRadius: '10px 10px 0 0', bgcolor: 'primary.main' }} />
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <Box sx={{ width: 4, height: 22, borderRadius: 2, bgcolor: 'primary.main' }} />
          <Typography variant="h6">流程与字段</Typography>
          <Typography variant="body2" color="text.secondary">按步骤配置字段归属与展示</Typography>
        </Stack>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2.5, overflow: 'hidden', bgcolor: 'background.paper' }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1.5, py: 1.25, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
                  <Box sx={{ width: 4, height: 22, borderRadius: 2, bgcolor: 'primary.main' }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>流程步骤</Typography>
                  <Chip size="small" label={`${steps.length} 步`} />
                </Stack>
                {steps.map((step, index) => {
                  const isSelected = step.step_key === selectedStep;
                  const count = (bindings[step.step_key] || []).length;
                  const builtinCount = (BUILTIN_STEP_FIELDS[step.step_key] || []).length;
                  return (
                    <Box
                      key={step.step_key}
                      onClick={() => setSelectedStep(step.step_key)}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        px: 1.5,
                        py: 1.25,
                        cursor: 'pointer',
                        borderBottom: index < steps.length - 1 ? '1px solid' : 'none',
                        borderColor: 'divider',
                        bgcolor: isSelected ? 'primary.main' : 'transparent',
                        color: isSelected ? 'primary.contrastText' : 'inherit',
                        '&:hover': { bgcolor: isSelected ? 'primary.main' : 'action.hover' }
                      }}
                    >
                      <Chip
                        size="small"
                        label={step.sort_order}
                        sx={{
                          height: 22,
                          minWidth: 26,
                          fontWeight: 800,
                          bgcolor: isSelected ? 'rgba(255,255,255,0.18)' : 'action.selected',
                          color: isSelected ? '#fff' : 'text.secondary'
                        }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: isSelected ? '#fff' : 'text.primary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {step.step_name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: isSelected ? 'rgba(255,255,255,0.82)' : 'text.secondary' }}>
                          {step.step_key}
                        </Typography>
                      </Box>
                      <Chip
                        size="small"
                        label={`${builtinCount + count} 字段`}
                        title={`内置 ${builtinCount} 个 · 自定义 ${count} 个`}
                        sx={{ height: 22, bgcolor: isSelected ? 'rgba(255,255,255,0.18)' : 'action.selected', color: isSelected ? '#fff' : 'primary.main', fontWeight: 700 }}
                      />
                    </Box>
                  );
                })}
              </Box>
            </Grid>
            <Grid item xs={12} md={8}>
              {selected && (
                <>
                  <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                    <Box sx={{ width: 4, height: 22, borderRadius: 2, bgcolor: 'primary.main' }} />
                    <Typography variant="h6">{selected.step_name}</Typography>
                    <Chip size="small" label={selected.step_key} variant="outlined" />
                    <Box sx={{ flex: 1 }} />
                    <Button variant="contained" startIcon={<SaveIcon />} onClick={save} disabled={savingConfig}>
                      {savingConfig ? <CircularProgress size={18} color="inherit" /> : '保存流程配置'}
                    </Button>
                  </Stack>
                  <Box sx={{ p: 1.5, borderRadius: 2.5, border: 1, borderColor: 'divider', bgcolor: 'action.hover', mb: 2 }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                      <Box sx={{ width: 4, height: 22, borderRadius: 2, bgcolor: 'primary.main' }} />
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>步骤配置</Typography>
                    </Stack>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }} sx={{ mb: 1.5 }}>
                      <TextField size="small" label="步骤显示名称" value={selected.step_name} onChange={(e) => updateStep('step_name', e.target.value)} sx={{ minWidth: 220 }} />
                      <TextField size="small" label="排序" type="number" value={selected.sort_order} onChange={(e) => updateStep('sort_order', Number(e.target.value))} sx={{ width: 110 }} />
                      <FormControlLabel control={<Switch checked={Number(selected.is_active) === 1} onChange={(e) => updateStep('is_active', e.target.checked ? 1 : 0)} />} label="进度条展示" />
                    </Stack>
                    <Stack direction="row" spacing={1.5}>
                      <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditor({ field_name: '', field_type: 'text', field_options: '', entity_type: 'order', sort_order: selectedFields.length + 1 })}>
                        新增字段
                      </Button>
                      <Button variant="outlined" startIcon={<LinkIcon />} onClick={openBindDialog}>
                        绑定已有字段
                      </Button>
                    </Stack>
                  </Box>
                  <Box sx={{ mb: 2, p: 1.5, borderRadius: 2.5, border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                      <Box sx={{ width: 4, height: 22, borderRadius: 2, bgcolor: 'primary.main' }} />
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>内置字段</Typography>
                      <Chip size="small" label={`${builtinFields.length} 个`} />
                    </Stack>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {builtinFields.map((label) => (
                        <Chip key={label} size="small" variant="outlined" label={label} sx={{ bgcolor: 'action.hover' }} />
                      ))}
                    </Box>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.75 }}>
                      系统内置字段，按方案书固定展示，不可删除
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <Box sx={{ width: 4, height: 22, borderRadius: 2, bgcolor: 'primary.main' }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>自定义字段</Typography>
                    <Chip size="small" label={`${selectedFields.length} 个`} />
                  </Stack>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ '& th': { bgcolor: 'action.hover', fontWeight: 700, whiteSpace: 'nowrap' } }}>
                        <TableCell sx={{ width: 70 }}>排序</TableCell>
                        <TableCell>字段名称</TableCell>
                        <TableCell>类型</TableCell>
                        <TableCell>所属实体</TableCell>
                        <TableCell sx={{ width: 170 }}>操作</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {selectedFields.map((field, index) => (
                        <TableRow key={field.id}>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>{field.field_name}</TableCell>
                          <TableCell>{typeLabel(field.field_type)}</TableCell>
                          <TableCell>{entityLabel(field.entity_type)}</TableCell>
                          <TableCell>
                            {Number(field.is_system) === 1 ? (
                              <Chip size="small" label="系统字段" color="default" />
                            ) : (
                              <>
                                <IconButton size="small" title="编辑字段" onClick={() => setEditor({ ...field, field_options: field.field_options ? JSON.parse(field.field_options).join(',') : '' })}>
                                  <EditIcon />
                                </IconButton>
                                <IconButton size="small" title="从步骤移除" onClick={() => removeFromStep(field)}>
                                  <LinkOffIcon />
                                </IconButton>
                                <IconButton size="small" color="error" title="删除字段" onClick={() => deleteField(field)}>
                                  <DeleteIcon />
                                </IconButton>
                              </>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {selectedFields.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary' }}>
                            当前步骤尚未绑定字段
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                  <Box sx={{ mt: 3, p: 1.5, borderRadius: 2.5, border: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                      <Box sx={{ width: 4, height: 22, borderRadius: 2, bgcolor: 'primary.main' }} />
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>未绑定字段（字段库）</Typography>
                      <Chip size="small" label={unboundFields.length} />
                    </Stack>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                      字段库中的字段可绑定到任意步骤
                    </Typography>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ '& th': { bgcolor: 'background.paper', fontWeight: 700, whiteSpace: 'nowrap' } }}>
                          <TableCell>字段名称</TableCell>
                          <TableCell>类型</TableCell>
                          <TableCell>所属实体</TableCell>
                          <TableCell sx={{ width: 250 }}>操作</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {unboundFields.map((field) => (
                          <TableRow key={field.id}>
                            <TableCell sx={{ fontWeight: 600 }}>{field.field_name}</TableCell>
                            <TableCell>{typeLabel(field.field_type)}</TableCell>
                            <TableCell>{entityLabel(field.entity_type)}</TableCell>
                            <TableCell>
                              {Number(field.is_system) === 1 ? (
                                <Chip size="small" label="系统字段" color="default" />
                              ) : (
                                <>
                                  <Button size="small" variant="outlined" startIcon={<LinkIcon />} onClick={() => quickBind(field)}>
                                    绑定到当前步骤
                                  </Button>
                                  <IconButton size="small" title="编辑字段" onClick={() => setEditor({ ...field, field_options: field.field_options ? JSON.parse(field.field_options).join(',') : '' })}>
                                    <EditIcon />
                                  </IconButton>
                                  <IconButton size="small" color="error" title="删除字段" onClick={() => deleteField(field)}>
                                    <DeleteIcon />
                                  </IconButton>
                                </>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        {unboundFields.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} align="center" sx={{ color: 'text.secondary' }}>
                              所有自定义字段均已绑定到步骤
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </Box>
                </>
              )}
            </Grid>
          </Grid>
        )}
        <Dialog open={Boolean(editor)} onClose={() => setEditor(null)}>
          <DialogTitle>{editor?.id ? '编辑字段' : '新增字段'}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1, minWidth: 360 }}>
              <TextField label="字段名称" value={editor?.field_name || ''} onChange={(e) => setEditor((prev) => ({ ...prev, field_name: e.target.value }))} />
              <FormControl fullWidth>
                <InputLabel>字段类型</InputLabel>
                <Select value={editor?.field_type || 'text'} label="字段类型" onChange={(e) => setEditor((prev) => ({ ...prev, field_type: e.target.value }))}>
                  {FIELD_TYPES.map((type) => (
                    <MenuItem key={type.value} value={type.value}>
                      {type.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {!editor?.id && (
                <FormControl fullWidth>
                  <InputLabel>所属实体</InputLabel>
                  <Select value={editor?.entity_type || 'order'} label="所属实体" onChange={(e) => setEditor((prev) => ({ ...prev, entity_type: e.target.value }))}>
                    {ENTITY_CARDS.map((card) => (
                      <MenuItem key={card.key} value={card.key}>
                        {card.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              {editor?.field_type === 'select' && (
                <TextField label="选项（逗号分隔）" value={editor?.field_options || ''} onChange={(e) => setEditor((prev) => ({ ...prev, field_options: e.target.value }))} />
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditor(null)}>取消</Button>
            <Button variant="contained" onClick={saveField}>
              保存
            </Button>
          </DialogActions>
        </Dialog>
        <Dialog open={bindOpen} onClose={() => setBindOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>绑定已有字段</DialogTitle>
          <DialogContent>
            {bindableFields.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                没有可绑定的字段，可先点击“新增字段”创建。
              </Typography>
            ) : (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 0.5, mt: 1 }}>
                {bindableFields.map((field) => (
                  <FormControlLabel
                    key={field.id}
                    control={<Checkbox checked={pickIds.includes(field.id)} onChange={(e) => setPickIds((prev) => (e.target.checked ? [...prev, field.id] : prev.filter((id) => id !== field.id)))} />}
                    label={`${field.field_name}（${entityLabel(field.entity_type)}）`}
                  />
                ))}
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setBindOpen(false)}>取消</Button>
            <Button variant="contained" startIcon={<LinkIcon />} onClick={saveBindSelection} disabled={pickIds.length === 0}>
              绑定到当前步骤
            </Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  );
}

const IMPORT_TARGETS = ['end_customer', 'contract_customer', 'material', 'guide_price', 'history'];
const IMPORT_TARGET_META = {
  end_customer: { color: '#1976D2', desc: '导入最终客户基础档案' },
  contract_customer: { color: '#009688', desc: '导入合同客户基础档案' },
  material: { color: '#2E7D32', desc: '导入框架协议价格与有效期' },
  guide_price: { color: '#F57C00', desc: '导入系统指导价格' },
  history: { color: '#7B1FA2', desc: '导入历史订单与闭环数据' }
};

function ImportManager({ onError }) {
  const [result, setResult] = useState(null);
  const [logs, setLogs] = useState([]);

  const loadLogs = useCallback(async () => {
    try {
      const { data } = await api.get('/settings/import-logs');
      setLogs(data.items || []);
    } catch (err) {
      onError(errorMessage(err));
    }
  }, [onError]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const upload = async (target, event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const { data } = await api.post(`/settings/import/${target}`, formData);
      setResult({ target, ...data });
      loadLogs();
    } catch (err) {
      onError(errorMessage(err));
    }
  };

  return (
    <Card>
      <Box sx={{ height: 4, borderRadius: '10px 10px 0 0', bgcolor: 'primary.main' }} />
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
          <Box sx={{ width: 4, height: 22, borderRadius: 2, bgcolor: 'primary.main' }} />
          <Typography variant="h6">数据导入</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, ml: 0.5 }}>
          按标准模板批量导入基础数据与历史订单
        </Typography>
        <Stack spacing={1.5} sx={{ mb: 2.5 }}>
          {IMPORT_TARGETS.map((target) => (
            <Box
              key={target}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                p: 1.5,
                flexWrap: { xs: 'wrap', md: 'nowrap' },
                borderRadius: 2.5,
                border: 1,
                borderColor: 'divider',
                bgcolor: 'background.paper',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
                '&:hover': { boxShadow: 3, transform: 'translateY(-2px)', borderColor: IMPORT_TARGET_META[target].color }
              }}
            >
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: 2,
                  bgcolor: `${IMPORT_TARGET_META[target].color}18`,
                  color: IMPORT_TARGET_META[target].color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <UploadFileIcon fontSize="small" />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                  {IMPORT_TARGET_LABELS[target]}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {IMPORT_TARGET_META[target].desc}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                <Button size="small" variant="outlined" component="a" href={authUrl(`/api/settings/import/${target}/template`)} startIcon={<DownloadIcon />}>
                  下载模板
                </Button>
                <Button size="small" variant="contained" component="label" startIcon={<UploadFileIcon />}>
                  上传导入
                  <input type="file" hidden accept=".xlsx,.xls" onChange={(e) => upload(target, e)} />
                </Button>
              </Stack>
            </Box>
          ))}
        </Stack>
        {result && (
          <Alert severity={result.fail_rows === 0 ? 'success' : 'warning'} sx={{ mb: 2, borderRadius: 2.5 }}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="body2" sx={{ fontWeight: 800 }}>
                {IMPORT_TARGET_LABELS[result.target]} 导入完成
              </Typography>
              <Chip size="small" variant="outlined" label={`成功 ${result.success_rows} 行`} color="success" />
              <Chip size="small" variant="outlined" label={`失败 ${result.fail_rows} 行`} color={result.fail_rows === 0 ? 'default' : 'error'} />
            </Stack>
            {result.failures?.length > 0 && (
              <Box component="ul" sx={{ mt: 1.5, mb: 0, pl: 0, listStyle: 'none', maxHeight: 190, overflow: 'auto', borderRadius: 1.5, bgcolor: 'action.hover', p: 1 }}>
                {result.failures.slice(0, 10).map((failure, index) => (
                  <li key={index} style={{ padding: '4px 8px', fontSize: 13, lineHeight: 1.5 }}>
                    <strong>第 {failure.row} 行：</strong>
                    {failure.reason}
                  </li>
                ))}
              </Box>
            )}
          </Alert>
        )}
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 3, mb: 1 }}>
          <Box sx={{ width: 4, height: 22, borderRadius: 2, bgcolor: 'primary.main' }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>导入历史</Typography>
          <Chip size="small" label={`${logs.length} 条`} />
        </Stack>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ '& th': { bgcolor: 'action.hover', fontWeight: 700, whiteSpace: 'nowrap' } }}>
              <TableCell>时间</TableCell>
              <TableCell>目标</TableCell>
              <TableCell>文件名</TableCell>
              <TableCell align="right">成功</TableCell>
              <TableCell align="right">失败</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {logs.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{fmtDateTime(row.created_at)}</TableCell>
                <TableCell>{IMPORT_TARGET_LABELS[row.target_type] || row.target_type}</TableCell>
                <TableCell>{row.file_name}</TableCell>
                <TableCell align="right">
                  <Chip size="small" variant="outlined" label={row.success_rows} color={Number(row.success_rows) > 0 ? 'success' : 'default'} />
                </TableCell>
                <TableCell align="right">
                  <Chip size="small" variant="outlined" label={row.fail_rows} color={Number(row.fail_rows) > 0 ? 'error' : 'default'} />
                </TableCell>
              </TableRow>
            ))}
            {logs.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary' }}>
                  暂无导入记录
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

const QUOTE_STYLE_DEFAULTS = {
  company_name: 'Atlas Copco',
  primary_color: '#004E9A',
  secondary_color: '#DCE8F5',
  company_address: '',
  company_phone: '',
  company_email: '',
  header_text: '',
  footer_text: '',
  font_family: 'sans',
  title_alignment: 'center',
  info_alignment: 'center',
  header_alignment: 'center',
  footer_alignment: 'center',
  logo: null,
  field_visibility: {
    quote_no: 1,
    order_no: 1,
    project_name: 1,
    customer: 1,
    contact_info: 1,
    material_no: 1,
    description: 1,
    type: 1,
    price_source: 1,
    unit_price: 1,
    qty: 1,
    line_amount: 1
  },
  labels: {
    quote_title: '报价单',
    quote_no: '报价单编号',
    order_no: '订单号',
    project_name: '项目名称',
    end_customer: '最终客户',
    contract_customer: '合同客户',
    detail_title: '报价明细',
    total: '合计（未税）',
    generated_at: '生成时间',
    material_no: '物料号',
    description: '描述',
    type: '类型',
    price_source: '价格来源',
    unit_price: '单价',
    qty: '数量',
    line_amount: '行金额'
  }
};

const QUOTE_META_FIELDS = [
  { key: 'quote_no', label: '报价单编号', switchKey: 'quote_no' },
  { key: 'order_no', label: '订单号', switchKey: 'order_no' },
  { key: 'project_name', label: '项目名称', switchKey: 'project_name' },
  { key: 'end_customer', label: '最终客户', switchKey: 'customer' },
  { key: 'contract_customer', label: '合同客户' },
  { key: 'detail_title', label: '明细标题' },
  { key: 'total', label: '合计文本' },
  { key: 'generated_at', label: '生成时间' }
];

const QUOTE_COLUMN_FIELDS = [
  { key: 'material_no', label: '物料号', switchKey: 'material_no' },
  { key: 'description', label: '描述', switchKey: 'description' },
  { key: 'type', label: '类型', switchKey: 'type' },
  { key: 'price_source', label: '价格来源', switchKey: 'price_source' },
  { key: 'unit_price', label: '单价', switchKey: 'unit_price' },
  { key: 'qty', label: '数量', switchKey: 'qty' },
  { key: 'line_amount', label: '行金额', switchKey: 'line_amount' }
];

const QUOTE_META_VISIBILITY_KEYS = ['quote_no', 'order_no', 'project_name', 'customer', 'contact_info'];

const QUOTE_ALIGN_OPTIONS = [
  { value: 'left', label: '靠左' },
  { value: 'center', label: '居中' },
  { value: 'right', label: '靠右' }
];

function normalizeQuoteStyleForClient(data = {}) {
  return {
    ...QUOTE_STYLE_DEFAULTS,
    ...data,
    labels: { ...QUOTE_STYLE_DEFAULTS.labels, ...(data.labels || {}) }
  };
}

function QuoteStyle({ onError }) {
  const [style, setStyle] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/settings/quote-style');
      setStyle(normalizeQuoteStyleForClient(data));
    } catch (err) {
      onError(errorMessage(err));
    }
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put('/settings/quote-style', style);
      setStyle(normalizeQuoteStyleForClient(data));
      onError('');
      window.alert('报价单式样已保存，PDF 导出将使用该样式');
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const testPdf = async () => {
    setTesting(true);
    try {
      const res = await api.post('/settings/quote-style/test-pdf', { style }, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = '报价单式样测试.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      window.alert('测试 PDF 已生成并开始下载');
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setTesting(false);
    }
  };

  const setLabel = (key, value) => {
    setStyle((prev) => ({ ...prev, labels: { ...prev.labels, [key]: value } }));
  };

  const toggleVisibility = (key) => {
    setStyle((prev) => ({
      ...prev,
      field_visibility: { ...prev.field_visibility, [key]: prev.field_visibility[key] ? 0 : 1 }
    }));
  };

  const handleLogo = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      onError('仅支持 PNG / JPG 图片');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      onError('Logo 图片不能超过 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setStyle((prev) => ({ ...prev, logo: String(reader.result) }));
    reader.onerror = () => onError('Logo 图片读取失败');
    reader.readAsDataURL(file);
  };

  if (!style) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  const fontFamilies = {
    sans: "'PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif",
    serif: "'Songti SC','SimSun',serif",
    mono: "'Courier New',monospace"
  };
  const previewFont = fontFamilies[style.font_family] || fontFamilies.sans;
  const sampleRows = [
    { no: 'AC-1001', desc: '压缩机组示例', type: '标准', source: '指导价', price: '128,500.5000', qty: 1, amount: '128,500.50' },
    { no: 'AC-1002', desc: '备件套件示例', type: '非标', source: '手工', price: '0.0000', qty: 1, amount: '0.00' }
  ];
  const enabledMetaCount = QUOTE_META_VISIBILITY_KEYS.filter((key) => style.field_visibility[key]).length;
  const enabledColumnCount = QUOTE_COLUMN_FIELDS.filter((item) => style.field_visibility[item.key]).length;
  const visibleColumns = QUOTE_COLUMN_FIELDS.filter((item) => style.field_visibility[item.key]);
  const numericPreviewKeys = new Set(['unit_price', 'qty', 'line_amount']);
  const rowRenderers = {
    material_no: (row) => row.no,
    description: (row) => row.desc,
    type: (row) => row.type,
    price_source: (row) => row.source,
    unit_price: (row) => row.price,
    qty: (row) => row.qty,
    line_amount: (row) => row.amount
  };
  const cell = { px: 1, py: 0.75, textAlign: 'left', verticalAlign: 'middle' };
  const headerCell = { ...cell, color: '#ffffff', fontWeight: 700, whiteSpace: 'nowrap' };
  const sectionTitle = {
    width: 4,
    height: 22,
    borderRadius: 2,
    bgcolor: 'secondary.main'
  };

  return (
    <Card>
      <Box sx={{ height: 4, borderRadius: '10px 10px 0 0', bgcolor: 'secondary.main' }} />
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
          <Box sx={{ width: 4, height: 22, borderRadius: 2, bgcolor: 'secondary.main' }} />
          <Typography variant="h6">报价单式样</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, ml: 0.5 }}>
          配置报价单 Logo、颜色、联系方式与字段名称，实时预览并测试 PDF
        </Typography>
        <Grid container spacing={3}>
          <Grid item xs={12} md={5}>
            <Stack spacing={2.5}>
              <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                  <Box sx={sectionTitle} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>公司信息</Typography>
                </Stack>
                <Grid container spacing={1.5}>
                  <Grid item xs={12}>
                    <TextField label="公司名称" size="small" fullWidth value={style.company_name} onChange={(e) => setStyle((prev) => ({ ...prev, company_name: e.target.value }))} />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField label="公司地址" size="small" fullWidth value={style.company_address} onChange={(e) => setStyle((prev) => ({ ...prev, company_address: e.target.value }))} />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField label="联系电话" size="small" fullWidth value={style.company_phone} onChange={(e) => setStyle((prev) => ({ ...prev, company_phone: e.target.value }))} />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField label="电子邮箱" size="small" fullWidth value={style.company_email} onChange={(e) => setStyle((prev) => ({ ...prev, company_email: e.target.value }))} />
                  </Grid>
                </Grid>
              </Box>

              <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                  <Box sx={sectionTitle} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>视觉与 Logo</Typography>
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }} sx={{ mb: 1.5 }}>
                  <TextField
                    label="主色"
                    type="color"
                    size="small"
                    value={style.primary_color}
                    onChange={(e) => setStyle((prev) => ({ ...prev, primary_color: e.target.value }))}
                    InputLabelProps={{ shrink: true }}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    label="辅助色"
                    type="color"
                    size="small"
                    value={style.secondary_color}
                    onChange={(e) => setStyle((prev) => ({ ...prev, secondary_color: e.target.value }))}
                    InputLabelProps={{ shrink: true }}
                    sx={{ flex: 1 }}
                  />
                  <FormControl size="small" sx={{ minWidth: 130 }}>
                    <InputLabel>字体风格</InputLabel>
                    <Select value={style.font_family} label="字体风格" onChange={(e) => setStyle((prev) => ({ ...prev, font_family: e.target.value }))}>
                      <MenuItem value="sans">无衬线</MenuItem>
                      <MenuItem value="serif">衬线</MenuItem>
                      <MenuItem value="mono">等宽</MenuItem>
                    </Select>
                  </FormControl>
                </Stack>
                <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'action.hover' }}>
                  <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                    {style.logo ? (
                      <img src={style.logo} alt="Logo" style={{ maxWidth: 130, maxHeight: 54, objectFit: 'contain' }} />
                    ) : (
                      <Box sx={{ width: 120, height: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed', borderColor: 'text.disabled', borderRadius: 1.5, color: 'text.secondary', fontSize: 12 }}>
                        暂无 Logo
                      </Box>
                    )}
                    <Button component="label" variant="outlined" size="small" startIcon={<UploadFileIcon />}>
                      上传 Logo
                      <input type="file" hidden accept="image/png,image/jpeg" onChange={handleLogo} />
                    </Button>
                    {style.logo && (
                      <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={() => setStyle((prev) => ({ ...prev, logo: null }))}>
                        移除
                      </Button>
                    )}
                  </Stack>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                    支持 PNG / JPG，不超过 2MB
                  </Typography>
                </Box>
              </Box>

              <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                  <Box sx={sectionTitle} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>版式设置</Typography>
                </Stack>
                <TextField size="small" label="页眉文本" fullWidth value={style.header_text} onChange={(e) => setStyle((prev) => ({ ...prev, header_text: e.target.value }))} sx={{ mb: 1.5 }} />
                <Grid container spacing={1.5}>
                  <Grid item xs={12} sm={6}>
                    <FormControl size="small" fullWidth>
                      <InputLabel>标题对齐</InputLabel>
                      <Select value={style.title_alignment} label="标题对齐" onChange={(e) => setStyle((prev) => ({ ...prev, title_alignment: e.target.value }))}>
                        {QUOTE_ALIGN_OPTIONS.map((item) => (
                          <MenuItem key={item.value} value={item.value}>
                            {item.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <FormControl size="small" fullWidth>
                      <InputLabel>单据信息对齐</InputLabel>
                      <Select value={style.info_alignment} label="单据信息对齐" onChange={(e) => setStyle((prev) => ({ ...prev, info_alignment: e.target.value }))}>
                        {QUOTE_ALIGN_OPTIONS.map((item) => (
                          <MenuItem key={item.value} value={item.value}>
                            {item.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <FormControl size="small" fullWidth>
                      <InputLabel>页眉对齐</InputLabel>
                      <Select value={style.header_alignment} label="页眉对齐" onChange={(e) => setStyle((prev) => ({ ...prev, header_alignment: e.target.value }))}>
                        {QUOTE_ALIGN_OPTIONS.map((item) => (
                          <MenuItem key={item.value} value={item.value}>
                            {item.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <FormControl size="small" fullWidth>
                      <InputLabel>页脚对齐</InputLabel>
                      <Select value={style.footer_alignment} label="页脚对齐" onChange={(e) => setStyle((prev) => ({ ...prev, footer_alignment: e.target.value }))}>
                        {QUOTE_ALIGN_OPTIONS.map((item) => (
                          <MenuItem key={item.value} value={item.value}>
                            {item.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>
              </Box>

              <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                  <Box sx={sectionTitle} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>单据字段名称</Typography>
                  <Chip size="small" label={`已启用 ${enabledMetaCount}/${QUOTE_META_VISIBILITY_KEYS.length}`} />
                </Stack>
                <Grid container spacing={1.5}>
                  {QUOTE_META_FIELDS.map((item) => (
                    <Grid item xs={12} sm={6} key={item.key}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <TextField
                          size="small"
                          label={item.label}
                          fullWidth
                          value={style.labels[item.key]}
                          onChange={(e) => setLabel(item.key, e.target.value)}
                          disabled={Boolean(item.switchKey) && !Boolean(style.field_visibility[item.switchKey])}
                          sx={{ opacity: Boolean(item.switchKey) && !Boolean(style.field_visibility[item.switchKey]) ? 0.55 : 1 }}
                        />
                        {item.switchKey && (
                          <FormControlLabel
                            control={<Switch size="small" checked={Boolean(style.field_visibility[item.switchKey])} onChange={() => toggleVisibility(item.switchKey)} />}
                            label={style.field_visibility[item.switchKey] ? '启用' : '不启用'}
                            sx={{ ml: 0, whiteSpace: 'nowrap' }}
                          />
                        )}
                      </Stack>
                    </Grid>
                  ))}
                </Grid>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 1.5 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                    联系方式（地址 / 电话 / 邮箱）
                  </Typography>
                  <FormControlLabel
                    control={<Switch size="small" checked={Boolean(style.field_visibility.contact_info)} onChange={() => toggleVisibility('contact_info')} />}
                    label={style.field_visibility.contact_info ? '启用' : '不启用'}
                  />
                </Stack>
              </Box>

              <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                  <Box sx={sectionTitle} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>表格列名</Typography>
                  <Chip size="small" label={`已启用 ${enabledColumnCount}/${QUOTE_COLUMN_FIELDS.length}`} />
                </Stack>
                <Grid container spacing={1.5}>
                  {QUOTE_COLUMN_FIELDS.map((item) => (
                    <Grid item xs={12} sm={6} key={item.key}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <TextField
                          size="small"
                          label={item.label}
                          fullWidth
                          value={style.labels[item.key]}
                          onChange={(e) => setLabel(item.key, e.target.value)}
                          disabled={!Boolean(style.field_visibility[item.key])}
                          sx={{ opacity: Boolean(style.field_visibility[item.key]) ? 1 : 0.55 }}
                        />
                        <FormControlLabel
                          control={<Switch size="small" checked={Boolean(style.field_visibility[item.key])} onChange={() => toggleVisibility(item.key)} />}
                          label={style.field_visibility[item.key] ? '启用' : '不启用'}
                          sx={{ ml: 0, whiteSpace: 'nowrap' }}
                        />
                      </Stack>
                    </Grid>
                  ))}
                </Grid>
              </Box>

              <TextField label="页脚文本" multiline minRows={2} fullWidth value={style.footer_text} onChange={(e) => setStyle((prev) => ({ ...prev, footer_text: e.target.value }))} />

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <Button variant="contained" startIcon={<SaveIcon />} onClick={save} disabled={saving || testing}>
                  {saving ? <CircularProgress size={18} color="inherit" /> : '保存式样'}
                </Button>
                <Button variant="outlined" startIcon={<DownloadIcon />} onClick={testPdf} disabled={saving || testing}>
                  {testing ? <CircularProgress size={18} color="inherit" /> : '生成测试 PDF'}
                </Button>
              </Stack>
            </Stack>
          </Grid>

          <Grid item xs={12} md={7}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
              <Box sx={sectionTitle} />
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>实时预览</Typography>
            </Stack>
            <Box sx={{ p: { xs: 1, sm: 2.5 }, borderRadius: 2.5, border: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
              <Box sx={{ maxWidth: 720, mx: 'auto', bgcolor: '#ffffff', borderRadius: 1.5, boxShadow: 6, p: { xs: 2, sm: 3 }, color: '#1f2937', fontFamily: previewFont }}>
                {style.header_text && (
                  <Box sx={{ textAlign: style.header_alignment, fontSize: 12, color: '#555555', mb: 0.75 }}>
                    {style.header_text}
                  </Box>
                )}
                <Box sx={{ textAlign: 'center', mb: 1 }}>
                  {style.logo ? (
                    <img src={style.logo} alt="Logo" style={{ maxWidth: 150, maxHeight: 64, objectFit: 'contain' }} />
                  ) : (
                    <Box sx={{ height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #cbd5e1', color: '#94a3b8', fontSize: 12 }}>
                      LOGO 预览
                    </Box>
                  )}
                </Box>
                <Typography sx={{ textAlign: style.title_alignment, fontSize: 22, fontWeight: 800, color: style.primary_color, mb: 0.5 }}>
                  {style.company_name} {style.labels.quote_title}
                </Typography>
                <Stack spacing={0.4} sx={{ fontSize: 12, color: '#475569', textAlign: style.info_alignment, mb: 1.5 }}>
                  {Boolean(style.field_visibility.quote_no) && <Box>{style.labels.quote_no}：Q-20260802-R1</Box>}
                  {Boolean(style.field_visibility.order_no) && <Box>{style.labels.order_no}：ORD-2026-TEST</Box>}
                  {Boolean(style.field_visibility.project_name) && <Box>{style.labels.project_name}：示例项目（测试）</Box>}
                  {Boolean(style.field_visibility.customer) && (
                    <Box>
                      {style.labels.end_customer}：示例最终客户&nbsp;&nbsp;&nbsp;{style.labels.contract_customer}：示例合同客户
                    </Box>
                  )}
                  {Boolean(style.field_visibility.contact_info) && (style.company_address || style.company_phone || style.company_email) && (
                    <Box>
                      {[style.company_address, style.company_phone, style.company_email].filter(Boolean).join('　|　')}
                    </Box>
                  )}
                </Stack>
                <Typography sx={{ fontWeight: 700, color: style.primary_color, borderBottom: `2px solid ${style.secondary_color}`, pb: 0.5, mb: 1 }}>
                  {style.labels.detail_title}
                </Typography>
                {visibleColumns.length === 0 ? (
                  <Box sx={{ py: 2, textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>未启用任何列</Box>
                ) : (
                  <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <Box component="thead">
                      <Box component="tr" sx={{ bgcolor: style.primary_color }}>
                        {visibleColumns.map((item) => (
                          <Box component="th" sx={{ ...headerCell, textAlign: numericPreviewKeys.has(item.key) ? 'right' : 'left' }} key={item.key}>{style.labels[item.key]}</Box>
                        ))}
                      </Box>
                    </Box>
                    <Box component="tbody">
                      {sampleRows.map((row) => (
                        <Box component="tr" key={row.no} sx={{ borderBottom: '1px solid #e2e8f0' }}>
                          {visibleColumns.map((item) => (
                            <Box component="td" sx={{ ...cell, textAlign: numericPreviewKeys.has(item.key) ? 'right' : 'left' }} key={item.key}>{rowRenderers[item.key](row)}</Box>
                          ))}
                        </Box>
                      ))}
                    </Box>
                  </Box>
                )}
                <Box sx={{ textAlign: 'right', mt: 1.5, fontWeight: 800, color: style.primary_color }}>
                  {style.labels.total}：128,500.50
                </Box>
                <Box sx={{ textAlign: style.footer_alignment, mt: 2, fontSize: 11, color: '#94a3b8' }}>
                  {style.labels.generated_at}：2026/08/02 10:00
                </Box>
                {style.footer_text && (
                  <Box sx={{ textAlign: style.footer_alignment, mt: 0.5, fontSize: 11, color: '#94a3b8' }}>{style.footer_text}</Box>
                )}
              </Box>
            </Box>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}

function SystemManager({ onError }) {
  const [orderOptions, setOrderOptions] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [correction, setCorrection] = useState({ delivered: '', invoiced: '', total_amount: '', target_status: '' });
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [backupInfo, setBackupInfo] = useState(null);
  const [schedule, setSchedule] = useState({ enabled: false, hour: 2, minute: 0 });
  const [resetType, setResetType] = useState(null);
  const [password, setPassword] = useState('');
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);

  const loadOrders = async () => {
    try {
      const { data } = await api.get('/orders', { params: { limit: 100 } });
      setOrderOptions(data.items || []);
    } catch (err) {
      onError(errorMessage(err));
    }
  };

  const loadAudit = async () => {
    try {
      const { data } = await api.get('/audit-logs', { params: { page: auditPage, limit: 10 } });
      setAuditLogs(data.items || []);
      setAuditTotal(data.total || 0);
    } catch (err) {
      onError(errorMessage(err));
    }
  };

  const loadSchedule = async () => {
    try {
      const { data } = await api.get('/settings/backup-schedule');
      setSchedule(data);
    } catch (err) {
      onError(errorMessage(err));
    }
  };

  useEffect(() => {
    loadOrders();
    loadAudit();
    loadSchedule();
  }, [auditPage]);

  const backup = async () => {
    try {
      const { data } = await api.post('/settings/backup');
      setBackupInfo(data);
    } catch (err) {
      onError(errorMessage(err));
    }
  };

  const saveSchedule = async () => {
    try {
      const { data } = await api.put('/settings/backup-schedule', schedule);
      setSchedule(data);
      onError('');
      window.alert('定时备份配置已保存');
    } catch (err) {
      onError(errorMessage(err));
    }
  };

  const restore = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!window.confirm('还原将覆盖当前数据库与附件，确认继续？')) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      await api.post('/settings/restore', formData);
      window.alert('还原成功');
    } catch (err) {
      onError(errorMessage(err));
    }
  };

  const doCorrection = async () => {
    const changes = {};
    if (correction.delivered !== '') changes.delivered = Number(correction.delivered);
    if (correction.invoiced !== '') changes.invoiced = Number(correction.invoiced);
    if (correction.total_amount !== '') changes.total_amount = Number(correction.total_amount);
    try {
      await api.put('/settings/correct-order-data', {
        order_id: selectedOrder.id,
        changes,
        target_status: correction.target_status || null,
        confirm: 1
      });
      setCorrectionOpen(false);
      setCorrection({ delivered: '', invoiced: '', total_amount: '', target_status: '' });
      window.alert('数据修正成功');
    } catch (err) {
      onError(errorMessage(err));
    }
  };

  const doReset = async () => {
    if (!password) {
      onError('请输入管理员密码');
      return;
    }
    try {
      const url = resetType === 'business' ? '/settings/reset-business' : '/settings/reset-factory';
      await api.post(url, { password });
      setResetType(null);
      setPassword('');
      window.alert(resetType === 'business' ? '业务数据已重置' : '系统已恢复出厂设置，请重新登录');
      if (resetType === 'factory') window.location.href = '/login';
    } catch (err) {
      onError(errorMessage(err));
    }
  };

  return (
    <Card>
      <Box sx={{ height: 4, borderRadius: '10px 10px 0 0', bgcolor: 'primary.main' }} />
      <CardContent>
        <Stack spacing={2}>
          <Box sx={{ p: 1.5, borderRadius: 2.5, border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
            <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.5 }}>
              <Box sx={{ width: 34, height: 34, borderRadius: 2, bgcolor: 'rgba(0,78,154,0.10)', color: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BackupIcon fontSize="small" />
              </Box>
              <Typography variant="h6">备份与还原</Typography>
            </Stack>
            <Stack direction="row" spacing={1.5}>
              <Button variant="contained" startIcon={<DownloadIcon />} onClick={backup}>
                全站备份
              </Button>
              <Button component="label" variant="outlined" startIcon={<RestoreIcon />}>
                从备份还原
                <input type="file" hidden accept=".zip" onChange={restore} />
              </Button>
            </Stack>
            {backupInfo && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                备份完成：<Chip label={backupInfo.filename} component="a" href={authUrl(backupInfo.downloadUrl)} clickable />
              </Typography>
            )}
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
              <FormControlLabel
                control={<Switch checked={schedule.enabled} onChange={(e) => setSchedule((prev) => ({ ...prev, enabled: e.target.checked }))} />}
                label="启用应用内定时备份"
              />
              <TextField
                size="small"
                label="小时 (0-23)"
                type="number"
                value={schedule.hour}
                onChange={(e) => setSchedule((prev) => ({ ...prev, hour: Number(e.target.value) }))}
                inputProps={{ min: 0, max: 23 }}
                sx={{ width: 110 }}
              />
              <TextField
                size="small"
                label="分钟 (0-59)"
                type="number"
                value={schedule.minute}
                onChange={(e) => setSchedule((prev) => ({ ...prev, minute: Number(e.target.value) }))}
                inputProps={{ min: 0, max: 59 }}
                sx={{ width: 110 }}
              />
              <Button size="small" variant="outlined" onClick={saveSchedule}>
                保存配置
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
              应用内定时任务每分钟检查一次；也可继续使用 deploy/scripts/backup.sh 的系统 cron 方式。
            </Typography>
          </Box>

          <Box sx={{ p: 1.5, borderRadius: 2.5, border: 1, borderColor: 'divider', bgcolor: 'rgba(237,108,2,0.04)' }}>
            <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.5 }}>
              <Box sx={{ width: 34, height: 34, borderRadius: 2, bgcolor: 'rgba(237,108,2,0.12)', color: 'warning.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <WarningAmberIcon fontSize="small" />
              </Box>
              <Typography variant="h6">数据修正（仅 admin）</Typography>
            </Stack>
            <Button variant="contained" color="warning" onClick={() => setCorrectionOpen(true)}>
              打开数据修正
            </Button>
          </Box>

          <Box sx={{ p: 1.5, borderRadius: 2.5, border: 1, borderColor: 'divider', bgcolor: 'rgba(195,61,61,0.04)' }}>
            <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.5 }}>
              <Box sx={{ width: 34, height: 34, borderRadius: 2, bgcolor: 'rgba(195,61,61,0.10)', color: 'error.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <RestartAltIcon fontSize="small" />
              </Box>
              <Typography variant="h6">重置</Typography>
            </Stack>
            <Stack direction="row" spacing={1.5}>
              <Button variant="outlined" color="warning" onClick={() => setResetType('business')}>
                重置业务数据（软重置）
              </Button>
              <Button variant="outlined" color="error" onClick={() => setResetType('factory')}>
                恢复出厂设置（硬重置）
              </Button>
            </Stack>
          </Box>

          <Box sx={{ p: 1.5, borderRadius: 2.5, border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
            <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.5 }}>
              <Box sx={{ width: 34, height: 34, borderRadius: 2, bgcolor: 'rgba(0,78,154,0.10)', color: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <HistoryIcon fontSize="small" />
              </Box>
              <Typography variant="h6">审计日志</Typography>
            </Stack>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { bgcolor: 'action.hover', fontWeight: 700, whiteSpace: 'nowrap' } }}>
                  <TableCell>时间</TableCell>
                  <TableCell>操作人</TableCell>
                  <TableCell>动作</TableCell>
                  <TableCell>对象</TableCell>
                  <TableCell>详情</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {auditLogs.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{fmtDateTime(row.created_at)}</TableCell>
                    <TableCell>{row.username || '系统'}</TableCell>
                    <TableCell>
                      <Chip size="small" label={row.action} variant="outlined" />
                    </TableCell>
                    <TableCell>{row.entity_type || '-'}#{row.entity_id || '-'}</TableCell>
                    <TableCell sx={{ maxWidth: 420, wordBreak: 'break-all' }}>{row.detail || '-'}</TableCell>
                  </TableRow>
                ))}
                {auditLogs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary' }}>
                      暂无审计记录
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="flex-end" flexWrap="wrap" useFlexGap sx={{ mt: 1.5, p: 1, borderRadius: 2, bgcolor: 'action.hover' }}>
              <Typography variant="body2" color="text.secondary">
                共 {auditTotal} 条
              </Typography>
              <Button size="small" disabled={auditPage <= 1} onClick={() => setAuditPage((page) => page - 1)}>
                上一页
              </Button>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                第 {auditPage} / {Math.max(1, Math.ceil(auditTotal / 10))} 页
              </Typography>
              <Button size="small" disabled={auditPage >= Math.max(1, Math.ceil(auditTotal / 10))} onClick={() => setAuditPage((page) => page + 1)}>
                下一页
              </Button>
            </Stack>
          </Box>
        </Stack>

        <Dialog open={correctionOpen} onClose={() => setCorrectionOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>数据修正</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Autocomplete
                options={orderOptions}
                getOptionLabel={(option) => `${option.order_id}（${option.project_name || ''}）`}
                value={selectedOrder}
                onChange={(_, value) => setSelectedOrder(value)}
                renderInput={(params) => <TextField {...params} label="选择订单" />}
              />
              <FormControl fullWidth>
                <InputLabel>发货状态</InputLabel>
                <Select value={correction.delivered} label="发货状态" onChange={(e) => setCorrection((prev) => ({ ...prev, delivered: e.target.value }))}>
                  <MenuItem value="">不修改</MenuItem>
                  <MenuItem value="0">改为未发货</MenuItem>
                  <MenuItem value="1">改为已发货</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>开票状态</InputLabel>
                <Select value={correction.invoiced} label="开票状态" onChange={(e) => setCorrection((prev) => ({ ...prev, invoiced: e.target.value }))}>
                  <MenuItem value="">不修改</MenuItem>
                  <MenuItem value="0">改为未开票</MenuItem>
                  <MenuItem value="1">改为已开票</MenuItem>
                </Select>
              </FormControl>
              <TextField label="总金额（留空不修改）" type="number" value={correction.total_amount} onChange={(e) => setCorrection((prev) => ({ ...prev, total_amount: e.target.value }))} />
              <FormControl fullWidth>
                <InputLabel>回退目标状态</InputLabel>
                <Select value={correction.target_status} label="回退目标状态" onChange={(e) => setCorrection((prev) => ({ ...prev, target_status: e.target.value }))}>
                  <MenuItem value="">不回退状态</MenuItem>
                  <MenuItem value="shipping_invoicing">shipping_invoicing</MenuItem>
                  <MenuItem value="finance">finance</MenuItem>
                  <MenuItem value="commission">commission</MenuItem>
                  <MenuItem value="bid_decision">bid_decision</MenuItem>
                  <MenuItem value="quotation">quotation</MenuItem>
                </Select>
              </FormControl>
              <Typography variant="caption" color="text.secondary">
                将 delivered/invoiced 改为 0 且订单已到 commission/closed 时必须指定回退目标状态；所有修正写入审计日志。
              </Typography>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCorrectionOpen(false)}>取消</Button>
            <Button variant="contained" color="warning" onClick={doCorrection} disabled={!selectedOrder}>
              确认修正
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={Boolean(resetType)} onClose={() => setResetType(null)}>
          <DialogTitle>{resetType === 'business' ? '重置业务数据' : '恢复出厂设置'}</DialogTitle>
          <DialogContent>
            <Stack spacing={1.5} sx={{ mt: 1, minWidth: 340 }}>
              <Typography variant="body2">
                {resetType === 'business' ? '将清空全部业务数据，保留用户与工作流配置。' : '将清空全部数据（含用户、配置），仅保留 admin 账户与审计日志，并轮换登录密钥。'}
              </Typography>
              <TextField label="管理员密码" type="password" value={password} onChange={(e) => setPassword(e.target.value)} fullWidth />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setResetType(null)}>取消</Button>
            <Button color="error" onClick={doReset}>
              确认重置
            </Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  );
}
