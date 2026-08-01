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
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import EditIcon from '@mui/icons-material/Edit';
import RestoreIcon from '@mui/icons-material/Restore';
import SaveIcon from '@mui/icons-material/Save';
import api, { errorMessage } from '../api';
import { IMPORT_TARGET_LABELS } from '../utils/constants';
import { fmtDateTime } from '../utils/helpers';

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

export default function Settings() {
  const [tab, setTab] = useState('fields');
  const [error, setError] = useState('');

  return (
    <Stack spacing={2}>
      <Typography variant="h5">系统设置</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <Card>
        <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto">
          <Tab value="fields" label="字段管理" />
          <Tab value="workflow" label="流程管理" />
          <Tab value="import" label="数据导入" />
          <Tab value="quote" label="报价单式样" />
          <Tab value="system" label="系统管理" />
        </Tabs>
      </Card>
      {tab === 'fields' && <FieldManager onError={setError} />}
      {tab === 'workflow' && <WorkflowManager onError={setError} />}
      {tab === 'import' && <ImportManager onError={setError} />}
      {tab === 'quote' && <QuoteStyle onError={setError} />}
      {tab === 'system' && <SystemManager onError={setError} />}
    </Stack>
  );
}

function FieldManager({ onError }) {
  const [entity, setEntity] = useState('order');
  const [items, setItems] = useState([]);
  const [editor, setEditor] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/settings/fields', { params: { entity_type: entity } });
      setItems(data.items || []);
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [entity, onError]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    try {
      const payload = {
        field_name: editor.field_name,
        field_type: editor.field_type,
        field_options: editor.field_type === 'select' ? (editor.field_options || '').split(',').map((item) => item.trim()).filter(Boolean) : null
      };
      if (editor.id) {
        await api.put(`/settings/fields/${editor.id}`, { ...payload, sort_order: editor.sort_order });
      } else {
        await api.post('/settings/fields', { entity_type: entity, ...payload });
      }
      setEditor(null);
      load();
    } catch (err) {
      onError(errorMessage(err));
    }
  };

  const remove = async (field) => {
    if (!window.confirm(`确认删除自定义字段「${field.field_name}」？关联值将一并删除。`)) return;
    try {
      await api.delete(`/settings/fields/${field.id}`);
      load();
    } catch (err) {
      onError(errorMessage(err));
    }
  };

  return (
    <Card>
      <CardContent>
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          {ENTITY_CARDS.map((card) => (
            <Grid item key={card.key}>
              <Button
                variant={entity === card.key ? 'contained' : 'outlined'}
                size="small"
                onClick={() => setEntity(card.key)}
              >
                {card.label}
              </Button>
            </Grid>
          ))}
          <Box sx={{ flex: 1 }} />
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditor({ field_name: '', field_type: 'text', field_options: '', sort_order: items.length + 1 })}>
            新增字段
          </Button>
        </Grid>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>字段名称</TableCell>
                <TableCell>类型</TableCell>
                <TableCell>排序</TableCell>
                <TableCell>系统字段</TableCell>
                <TableCell sx={{ width: 100 }}>操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((field) => (
                <TableRow key={field.id}>
                  <TableCell sx={{ fontWeight: 600 }}>{field.field_name}</TableCell>
                  <TableCell>{FIELD_TYPES.find((item) => item.value === field.field_type)?.label || field.field_type}</TableCell>
                  <TableCell>{field.sort_order}</TableCell>
                  <TableCell>{Number(field.is_system) === 1 ? '是' : '否'}</TableCell>
                  <TableCell>
                    {Number(field.is_system) !== 1 && (
                      <>
                        <IconButton size="small" onClick={() => setEditor({ ...field, field_options: field.field_options ? JSON.parse(field.field_options).join(',') : '' })} title="编辑">
                          <EditIcon />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => remove(field)} title="删除">
                          <DeleteIcon />
                        </IconButton>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary' }}>
                    暂无自定义字段
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
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
              {editor?.field_type === 'select' && (
                <TextField label="选项（逗号分隔）" value={editor?.field_options || ''} onChange={(e) => setEditor((prev) => ({ ...prev, field_options: e.target.value }))} />
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditor(null)}>取消</Button>
            <Button variant="contained" onClick={save}>
              保存
            </Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function WorkflowManager({ onError }) {
  const [steps, setSteps] = useState([]);
  const [transitions, setTransitions] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/settings/workflow');
      setSteps(data.steps || []);
      setTransitions(data.transitions || []);
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    try {
      await api.put('/settings/workflow', { steps });
      onError('');
      window.alert('流程展示配置已保存');
    } catch (err) {
      onError(errorMessage(err));
    }
  };

  return (
    <Card>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography variant="h6">流程管理（展示层配置）</Typography>
          <Button variant="contained" startIcon={<SaveIcon />} onClick={save}>
            保存流程配置
          </Button>
        </Stack>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>排序</TableCell>
                  <TableCell>步骤标识</TableCell>
                  <TableCell>显示名称</TableCell>
                  <TableCell>展示</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {steps.map((step) => (
                  <TableRow key={step.step_key}>
                    <TableCell>
                      <TextField
                        size="small"
                        type="number"
                        value={step.sort_order}
                        onChange={(e) => setSteps((prev) => prev.map((item) => (item.step_key === step.step_key ? { ...item, sort_order: Number(e.target.value) } : item)))}
                      />
                    </TableCell>
                    <TableCell>{step.step_key}</TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={step.step_name}
                        onChange={(e) => setSteps((prev) => prev.map((item) => (item.step_key === step.step_key ? { ...item, step_name: e.target.value } : item)))}
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={Number(step.is_active) === 1}
                        onChange={(e) => setSteps((prev) => prev.map((item) => (item.step_key === step.step_key ? { ...item, is_active: e.target.checked ? 1 : 0 } : item)))}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
              流转规则参考（只读，状态机由系统固化）
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>起始步骤</TableCell>
                  <TableCell>目标步骤</TableCell>
                  <TableCell>触发类型</TableCell>
                  <TableCell>条件字段</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {transitions.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.from_step}</TableCell>
                    <TableCell>{row.to_step}</TableCell>
                    <TableCell>{row.condition_type}</TableCell>
                    <TableCell>{row.condition_field || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}

const IMPORT_TARGETS = ['end_customer', 'contract_customer', 'material', 'guide_price', 'history'];

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
      <CardContent>
        <Typography variant="h6" sx={{ mb: 2 }}>
          数据导入
        </Typography>
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          {IMPORT_TARGETS.map((target) => (
            <Grid item xs={12} sm={6} md={4} key={target}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle2">{IMPORT_TARGET_LABELS[target]}</Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                    <Button size="small" component="a" href={`/api/settings/import/${target}/template`} startIcon={<DownloadIcon />}>
                      下载模板
                    </Button>
                    <Button size="small" component="label" variant="outlined">
                      上传导入
                      <input type="file" hidden accept=".xlsx,.xls" onChange={(e) => upload(target, e)} />
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
        {result && (
          <Alert severity={result.fail_rows === 0 ? 'success' : 'warning'} sx={{ mb: 2 }}>
            {IMPORT_TARGET_LABELS[result.target]}：成功 {result.success_rows} 行，失败 {result.fail_rows} 行
            {result.failures?.length > 0 && (
              <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2 }}>
                {result.failures.slice(0, 10).map((failure, index) => (
                  <li key={index}>
                    第 {failure.row} 行：{failure.reason}
                  </li>
                ))}
              </Box>
            )}
          </Alert>
        )}
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          导入历史
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
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
                <TableCell align="right">{row.success_rows}</TableCell>
                <TableCell align="right">{row.fail_rows}</TableCell>
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

function QuoteStyle({ onError }) {
  const [style, setStyle] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('atlas_quote_style') || '{"company_name":"Atlas Copco","primary_color":"#004E9A"}');
    } catch {
      return { company_name: 'Atlas Copco', primary_color: '#004E9A' };
    }
  });

  const save = () => {
    localStorage.setItem('atlas_quote_style', JSON.stringify(style));
    onError('');
    window.alert('报价单式样已保存到本地');
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 2 }}>
          报价单式样
        </Typography>
        <Stack spacing={2} sx={{ maxWidth: 480 }}>
          <TextField label="公司名称" value={style.company_name} onChange={(e) => setStyle((prev) => ({ ...prev, company_name: e.target.value }))} />
          <TextField
            label="主色"
            type="color"
            value={style.primary_color}
            onChange={(e) => setStyle((prev) => ({ ...prev, primary_color: e.target.value }))}
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
          <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'action.hover' }}>
            <Typography sx={{ color: style.primary_color, fontWeight: 800, fontSize: 20 }}>{style.company_name} 报价单</Typography>
            <Typography variant="caption" color="text.secondary">
              实时预览
            </Typography>
          </Box>
          <Button variant="contained" startIcon={<SaveIcon />} onClick={save}>
            保存式样
          </Button>
          <Typography variant="caption" color="text.secondary">
            说明：PDF 导出默认使用 Atlas Copco 品牌样式；式样保存在本机浏览器中。
          </Typography>
        </Stack>
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
  const [resetType, setResetType] = useState(null);
  const [password, setPassword] = useState('');
  const [auditLogs, setAuditLogs] = useState([]);

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
      const { data } = await api.get('/audit-logs', { params: { limit: 50 } });
      setAuditLogs(data.items || []);
    } catch (err) {
      onError(errorMessage(err));
    }
  };

  useEffect(() => {
    loadOrders();
    loadAudit();
  }, []);

  const backup = async () => {
    try {
      const { data } = await api.post('/settings/backup');
      setBackupInfo(data);
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
      <CardContent>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h6" sx={{ mb: 1 }}>
              备份与还原
            </Typography>
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
                备份完成：<Chip label={backupInfo.filename} component="a" href={backupInfo.downloadUrl} clickable />
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
              定时自动备份：每日 02:00 通过 deploy/scripts/backup.sh 执行，保留最近 30 天。
            </Typography>
          </Box>

          <Box>
            <Typography variant="h6" sx={{ mb: 1 }}>
              数据修正（仅 admin）
            </Typography>
            <Button variant="contained" color="warning" onClick={() => setCorrectionOpen(true)}>
              打开数据修正
            </Button>
          </Box>

          <Box>
            <Typography variant="h6" sx={{ mb: 1 }}>
              重置
            </Typography>
            <Stack direction="row" spacing={1.5}>
              <Button variant="outlined" color="warning" onClick={() => setResetType('business')}>
                重置业务数据（软重置）
              </Button>
              <Button variant="outlined" color="error" onClick={() => setResetType('factory')}>
                恢复出厂设置（硬重置）
              </Button>
            </Stack>
          </Box>

          <Box>
            <Typography variant="h6" sx={{ mb: 1 }}>
              审计日志
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
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
                    <TableCell>{row.action}</TableCell>
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
