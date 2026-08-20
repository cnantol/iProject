import { useEffect, useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import ToggleButton from '@mui/material/ToggleButton';
import { fmtDateTime } from '../utils/helpers';
import Tooltip from '@mui/material/Tooltip';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import FormLabel from '@mui/material/FormLabel';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import SaveIcon from '@mui/icons-material/Save';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import Paper from '@mui/material/Paper';
import FolderSharedIcon from '@mui/icons-material/FolderShared';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import api, { errorMessage } from '../api';
import { useFieldLabels } from '../utils/fieldLabels';
import { useConfirm } from './ConfirmDialog';
import { MATERIAL_TYPE_LABELS, ORDER_TYPES, ATTACHMENT_ACCEPT } from '../utils/constants';
import { downloadFile } from '../utils/download';
import useFileUpload from '../hooks/useFileUpload';
import UploadStatus from './UploadStatus';
import StepWrapper from './StepWrapper';

const EMPTY_SELECTION = { material_no: '', description: '', material_type: 'standard', qty: '', unit: 'pcs', remark: '' };

export default function StepProposal({ order, readOnly, onChanged, onAdvance }) {
  const confirm = useConfirm();
  const { t } = useFieldLabels();
  const versions = useMemo(() => order.versions || [], [order.versions]);
  const [activeVersionId, setActiveVersionId] = useState(null);
  const [newVersion, setNewVersion] = useState({ version_label: '', remark: '' });
  const [rows, setRows] = useState([]);
  const [skipOpen, setSkipOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [metaForm, setMetaForm] = useState({ order_type: 'A', project_no: '' });
  const [metaError, setMetaError] = useState('');
  const uploadCtrl = useFileUpload();

  const activeVersion = useMemo(() => versions.find((version) => version.id === activeVersionId) || versions[versions.length - 1], [versions, activeVersionId]);

  useEffect(() => {
    if (activeVersion) {
      setActiveVersionId(activeVersion.id);
      setRows((activeVersion.selections || []).map((row) => ({ ...row })));
    } else {
      setRows([]);
    }
  }, [activeVersion]);

  useEffect(() => {
    setMetaForm({
      order_type: order.order_type || 'A',
      project_no: order.project_no || ''
    });
  }, [order.id, order.order_type, order.project_no]);

  const createVersion = async () => {
    if (!newVersion.version_label.trim()) {
      setError('版本标签必填');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const { data } = await api.post(`/orders/${order.id}/versions`, newVersion);
      setActiveVersionId(data.id);
      setNewVersion({ version_label: '', remark: '' });
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const deleteVersion = async (versionId) => {
    if (!(await confirm('确认删除该方案版本？关联的方案文件与选型明细将一并删除。'))) return;
    setError('');
    try {
      await api.delete(`/orders/${order.id}/versions/${versionId}`);
      setActiveVersionId(null);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const resolveMaterial = async (index, materialNo) => {
    if (!materialNo.trim()) return;
    try {
      const { data } = await api.get(`/orders/${order.id}/quotations/price-lookup`, {
        params: { material_no: materialNo, material_type: rows[index]?.material_type || 'standard' }
      });
      setRows((prev) => prev.map((row, i) => (i === index ? { ...row, description: data.description || row.description } : row)));
    } catch {
      setError(`未找到物料「${materialNo}」的描述，请手工填写`);
    }
  };

  const saveRow = async (index) => {
    const row = rows[index];
    const payload = {
      material_no: row.material_no,
      description: row.description,
      material_type: row.material_type,
      qty: Number(row.qty),
      unit: row.unit || 'pcs',
      remark: row.remark
    };
    if (!Number(payload.qty) || Number(payload.qty) <= 0) {
      setError('数量必须大于 0');
      return;
    }
    setError('');
    try {
      if (row.id) {
        await api.put(`/orders/versions/${activeVersion.id}/selections/${row.id}`, payload);
      } else {
        await api.post(`/orders/versions/${activeVersion.id}/selections`, payload);
      }
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const deleteRow = async (rowId) => {
    try {
      await api.delete(`/orders/versions/${activeVersion.id}/selections/${rowId}`);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const saveAllRows = async () => {
    setError('');
    setMetaError('');
    setSaving(true);
    try {
      await persistMeta();
    } catch {
      setSaving(false);
      return;
    }
    const validRows = rows.filter((row) => row.material_no || row.qty);
    const failures = [];
    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      const payload = {
        material_no: row.material_no,
        description: row.description,
        material_type: row.material_type,
        qty: Number(row.qty),
        unit: row.unit || 'pcs',
        remark: row.remark
      };
      if (!Number(payload.qty) || Number(payload.qty) <= 0) {
        failures.push(`第 ${i + 1} 行：数量必须大于 0`);
        continue;
      }
      try {
        if (row.id) {
          await api.put(`/orders/versions/${activeVersion.id}/selections/${row.id}`, payload);
        } else {
          await api.post(`/orders/versions/${activeVersion.id}/selections`, payload);
        }
      } catch (err) {
        failures.push(`第 ${i + 1} 行：${errorMessage(err)}`);
      }
    }
    setSaving(false);
    onChanged();
    if (failures.length > 0) {
      setError(`部分行保存失败：${failures.join('；')}`);
    } else {
      setNotice(`批量保存完成：${validRows.length} 条（含项目信息）`);
    }
  };

  const uploadFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !activeVersion) return;
    await uploadCtrl.upload(file, {
      url: `/orders/${order.id}/attachments`,
      fields: { stage: 'proposal', reference_type: 'proposal_version', reference_id: String(activeVersion.id) },
      onSuccess: () => onChanged()
    });
  };

  const deleteAttachment = async (attachmentId) => {
    try {
      await api.delete(`/orders/${order.id}/attachments/${attachmentId}`);
      onChanged();
    } catch (err) {
      setError(errorMessage(err, '删除失败'));
    }
  };

  const importSelections = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !activeVersion) return;
    const formData = new FormData();
    formData.append('file', file);
    setError('');
    setNotice('');
    try {
      const { data } = await api.post(`/orders/${order.id}/versions/${activeVersion.id}/selections/import`, formData);
      setNotice(`导入完成：成功 ${data.success_rows} 行，失败 ${data.fail_rows} 行`);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const skipProposal = async () => {
    setSaving(true);
    try {
      await api.patch(`/orders/${order.id}/status`, { action: 'advance', skip: 1 });
      setSkipOpen(false);
      onAdvance();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const saveAndAdvance = async () => {
    setError('');
    setMetaError('');
    setSaving(true);
    try {
      await persistMeta();
      await api.patch(`/orders/${order.id}/status`, { action: 'advance' });
      onAdvance();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const submitPaste = async () => {
    const nos = pasteText
      .split(/[\n\t,，;；\s]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (nos.length === 0) {
      setError('请粘贴至少一个物料号');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const { data } = await api.post(`/orders/${order.id}/versions/${activeVersion.id}/selections/bulk`, { material_nos: nos });
      setNotice(`粘贴录入完成：新增 ${data.created} 条明细`);
      setPasteOpen(false);
      setPasteText('');
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const openDownload = async (path) => {
    try {
      await downloadFile(path);
    } catch {
      setError('下载失败，请重试');
    }
  };

  const persistMeta = async () => {
    try {
      await api.patch(`/orders/${order.id}`, {
        order_type: metaForm.order_type,
        project_no: metaForm.project_no
      });
    } catch (err) {
      setMetaError(errorMessage(err, '项目信息保存失败'));
      throw err;
    }
  };

  return (
    <StepWrapper
      title="方案阶段"
      subtitle="可选阶段：方案版本、方案文件与选型明细"
      readOnly={readOnly || Number(order.proposal_skipped) === 1}
      badge={Number(order.proposal_skipped) === 1 ? <Chip size="small" label="方案已跳过（不可逆）" color="warning" /> : null}
    >
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
      <Paper variant="outlined" sx={{ p: 2.5, mb: 2.5, borderRadius: 2, borderColor: 'divider' }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <FolderSharedIcon fontSize="small" color="primary" />
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary' }}>
            项目信息
          </Typography>
        </Stack>
        <Grid container spacing={2} sx={{ alignItems: 'flex-end' }}>
          <Grid item xs={12} sm={4}>
            <TextField label={t('project_name')} value={order.project_name || ''} fullWidth disabled size="small" />
          </Grid>
          <Grid item xs={12} sm={4}>
            <FormLabel sx={{ display: 'block', mb: 0.5, fontSize: 13, fontWeight: 500, color: 'text.secondary' }}>{t('order_type')}</FormLabel>
            <ToggleButtonGroup
              value={metaForm.order_type}
              exclusive
              onChange={(_, value) => {
                if (value === null) return;
                setMetaForm((prev) => ({
                  order_type: value,
                  project_no: value === 'A' ? '' : prev.project_no
                }));
              }}
              size="small"
              fullWidth
              sx={{
                '& .MuiToggleButton-root': {
                  py: 0.75,
                  fontWeight: 700,
                  fontSize: 13,
                  letterSpacing: 0.5,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 0,
                  color: 'text.secondary',
                  flex: 1,
                  '&:first-of-type': { borderRadius: '8px 0 0 8px' },
                  '&:last-of-type': { borderRadius: '0 8px 8px 0' },
                  '&:not(:first-of-type)': { borderLeft: 'none' },
                  '&.Mui-selected': {
                    bgcolor: 'primary.main',
                    color: '#fff',
                    borderColor: 'primary.main',
                    '&:hover': { bgcolor: 'primary.dark' }
                  },
                  '&:hover:not(.Mui-selected)': { bgcolor: 'action.hover' }
                }
              }}
            >
              {ORDER_TYPES.map((type) => (
                <ToggleButton key={type} value={type}>
                  {type}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              label={t('project_no')}
              value={metaForm.order_type === 'A' ? '' : metaForm.project_no}
              onChange={(e) => setMetaForm((prev) => ({ ...prev, project_no: e.target.value }))}
              fullWidth
              disabled={readOnly || metaForm.order_type === 'A'}
              size="small"
              placeholder={metaForm.order_type === 'A' ? '项目类型 A 无需编号' : ''}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField label="版本标签" value={newVersion.version_label} onChange={(e) => setNewVersion((prev) => ({ ...prev, version_label: e.target.value }))} fullWidth disabled={readOnly} size="small" placeholder="如 V1.0" />
          </Grid>
          <Grid item xs={12} sm={5}>
            <TextField label="备注" value={newVersion.remark} onChange={(e) => setNewVersion((prev) => ({ ...prev, remark: e.target.value }))} fullWidth disabled={readOnly} size="small" />
          </Grid>
          <Grid item xs={12} sm={3} sx={{ display: 'flex', alignItems: 'center' }}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={createVersion} disabled={readOnly || saving} fullWidth>
              新增方案版本
            </Button>
          </Grid>
        </Grid>
      </Paper>
      {metaError && (
        <Box sx={{ mb: 2 }}>
          <Alert severity="error" onClose={() => setMetaError('')}>
            {metaError}
          </Alert>
        </Box>
      )}
      {versions.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          尚未创建方案版本，可直接进入报价阶段（明细需手工录入）
        </Typography>
      ) : (
        <>
          <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>选择版本</InputLabel>
              <Select
                value={activeVersion?.id || ''}
                label="选择版本"
                onChange={(e) => setActiveVersionId(Number(e.target.value))}
              >
                {versions.map((version) => (
                  <MenuItem key={version.id} value={version.id}>
                    {version.version_label || `版本 #${version.sort_order}`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {activeVersion && (
              <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, rowGap: 1, flex: 1, minWidth: 0 }}>
                <Button component="label" variant="outlined" size="small" startIcon={<UploadFileIcon />} disabled={readOnly || uploadCtrl.status === 'uploading'} sx={{ flexShrink: 0 }}>
                  上传方案文件
                  <input type="file" hidden accept={ATTACHMENT_ACCEPT} onChange={uploadFile} />
                </Button>
                <UploadStatus
                  status={uploadCtrl.status}
                  progress={uploadCtrl.progress}
                  fileName={uploadCtrl.fileName}
                  error={uploadCtrl.error}
                />
                {!readOnly && (
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => deleteVersion(activeVersion.id)}
                    title="删除方案版本"
                    sx={{ flexShrink: 0 }}
                  >
                    <DeleteIcon />
                  </IconButton>
                )}
              </Box>
            )}
          </Stack>

          {activeVersion && (activeVersion.attachments || []).length > 0 && (
            <Paper variant="outlined" sx={{ mb: 2, borderRadius: 2, borderColor: 'divider', overflow: 'hidden' }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'action.hover' }}>
                <UploadFileIcon fontSize="small" color="primary" />
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  方案文件（{(activeVersion.attachments || []).length}）
                </Typography>
              </Stack>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>文件名</TableCell>
                    <TableCell sx={{ width: 160 }}>上传时间</TableCell>
                    <TableCell sx={{ width: 120 }} align="right">操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(activeVersion.attachments || []).map((file) => (
                    <TableRow key={file.id} hover>
                      <TableCell sx={{ wordBreak: 'break-all' }}>{file.file_name}</TableCell>
                      <TableCell>{fmtDateTime(file.uploaded_at)}</TableCell>
                      <TableCell align="right">
                        <Tooltip title="下载">
                          <IconButton size="small" onClick={() => openDownload(`/api/orders/${order.id}/attachments/${file.id}/download`)}>
                            <DownloadIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {!readOnly && (
                          <Tooltip title="删除">
                            <IconButton size="small" color="error" onClick={() => deleteAttachment(file.id)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>物料号</TableCell>
                <TableCell>物料描述</TableCell>
                <TableCell>类型</TableCell>
                <TableCell sx={{ width: 90 }}>数量</TableCell>
                <TableCell sx={{ width: 90 }}>单位</TableCell>
                <TableCell>备注</TableCell>
                <TableCell sx={{ width: 120 }}>操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={row.id || `new-${index}`}>
                  <TableCell>
                    <TextField
                      size="small"
                      value={row.material_no}
                      disabled={readOnly}
                      onChange={(e) => setRows((prev) => prev.map((r, i) => (i === index ? { ...r, material_no: e.target.value } : r)))}
                      onBlur={(e) => resolveMaterial(index, e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField size="small" value={row.description || ''} disabled={readOnly} onChange={(e) => setRows((prev) => prev.map((r, i) => (i === index ? { ...r, description: e.target.value } : r)))} />
                  </TableCell>
                  <TableCell>
                    <Select
                      size="small"
                      value={row.material_type}
                      disabled={readOnly}
                      onChange={(e) => setRows((prev) => prev.map((r, i) => (i === index ? { ...r, material_type: e.target.value } : r)))}
                    >
                      <MenuItem value="standard">{MATERIAL_TYPE_LABELS.standard}</MenuItem>
                      <MenuItem value="non_standard">{MATERIAL_TYPE_LABELS.non_standard}</MenuItem>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      type="number"
                      value={row.qty}
                      disabled={readOnly}
                      onChange={(e) => setRows((prev) => prev.map((r, i) => (i === index ? { ...r, qty: e.target.value } : r)))}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField size="small" value={row.unit} disabled={readOnly} onChange={(e) => setRows((prev) => prev.map((r, i) => (i === index ? { ...r, unit: e.target.value } : r)))} />
                  </TableCell>
                  <TableCell>
                    <TextField size="small" value={row.remark || ''} disabled={readOnly} onChange={(e) => setRows((prev) => prev.map((r, i) => (i === index ? { ...r, remark: e.target.value } : r)))} />
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5}>
                      <IconButton size="small" color="primary" onClick={() => saveRow(index)} disabled={readOnly} title="保存">
                        <SaveIcon />
                      </IconButton>
                      {row.id && (
                        <IconButton size="small" color="error" onClick={() => deleteRow(row.id)} disabled={readOnly} title="删除">
                          <DeleteIcon />
                        </IconButton>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {!readOnly && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Stack direction="row" spacing={1}>
                      <Button size="small" variant="contained" startIcon={<SaveIcon />} onClick={saveAllRows} disabled={saving}>
                        批量保存
                      </Button>
                      <Button size="small" startIcon={<AddIcon />} onClick={() => setRows((prev) => [...prev, { ...EMPTY_SELECTION }])}>
                        新增明细
                      </Button>
                      <Button size="small" component="label" variant="outlined" startIcon={<UploadFileIcon />}>
                        批量导入
                        <input type="file" hidden accept=".xlsx,.xls" onChange={importSelections} />
                      </Button>
                      <Button size="small" variant="outlined" startIcon={<ContentPasteIcon />} onClick={() => setPasteOpen(true)}>
                        粘贴录入
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </>
      )}

      {!readOnly && Number(order.proposal_skipped) !== 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', mt: 3, gap: 1.5, flexWrap: 'wrap' }}>
          <Button variant="outlined" color="warning" startIcon={<SkipNextIcon />} onClick={() => setSkipOpen(true)} sx={{ whiteSpace: 'nowrap' }}>
            跳过此阶段，直接进入报价
          </Button>
          <Button variant="contained" onClick={saveAndAdvance} disabled={saving}>
            保存并进入下一步
          </Button>
        </Box>
      )}

      <Dialog open={skipOpen} onClose={() => setSkipOpen(false)}>
        <DialogTitle>跳过方案阶段</DialogTitle>
        <DialogContent>
          <DialogContentText>方案一旦跳过不可逆，后续报价明细需手工录入，且禁用「从方案同步」。确认跳过吗？</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSkipOpen(false)}>取消</Button>
          <Button color="warning" onClick={skipProposal} disabled={saving}>
            确认跳过
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={pasteOpen} onClose={() => setPasteOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>粘贴录入选型明细</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            每行一个物料号，支持 Tab / 逗号 / 空格 / 换行分隔；类型默认标准、数量默认 1、描述自动带出。
          </Typography>
          <TextField
            multiline
            minRows={6}
            fullWidth
            placeholder={'AC-1001\nAC-2002\nNON-STD-1'}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPasteOpen(false)}>取消</Button>
          <Button variant="contained" onClick={submitPaste} disabled={saving}>
            确认录入
          </Button>
        </DialogActions>
      </Dialog>
    </StepWrapper>
  );
}
