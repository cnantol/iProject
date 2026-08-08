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
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import SaveIcon from '@mui/icons-material/Save';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import api, { errorMessage } from '../api';
import { useConfirm } from './ConfirmDialog';
import { MATERIAL_TYPE_LABELS } from '../utils/constants';
import { downloadFile } from '../utils/download';
import StepWrapper from './StepWrapper';

const EMPTY_SELECTION = { material_no: '', description: '', material_type: 'standard', qty: '', unit: 'pcs', remark: '' };

export default function StepProposal({ order, readOnly, onChanged, onAdvance }) {
  const confirm = useConfirm();
  const versions = order.versions || [];
  const [activeVersionId, setActiveVersionId] = useState(null);
  const [newVersion, setNewVersion] = useState({ version_label: '', remark: '' });
  const [rows, setRows] = useState([]);
  const [_editing] = useState(null);
  const [skipOpen, setSkipOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const activeVersion = useMemo(() => versions.find((version) => version.id === activeVersionId) || versions[versions.length - 1], [versions, activeVersionId]);

  useEffect(() => {
    if (activeVersion) {
      setActiveVersionId(activeVersion.id);
      setRows((activeVersion.selections || []).map((row) => ({ ...row, _qty: String(row.qty) })));
    } else {
      setRows([]);
    }
  }, [activeVersion]);

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
    setNotice('');
    setSaving(true);
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
      setNotice(`批量保存完成：${validRows.length} 条`);
    }
  };

  const uploadFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !activeVersion) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('stage', 'proposal');
    formData.append('reference_type', 'proposal_version');
    formData.append('reference_id', String(activeVersion.id));
    try {
      await api.post(`/orders/${order.id}/attachments`, formData);
      onChanged();
    } catch (err) {
      setError(errorMessage(err, '上传失败'));
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
    setSaving(true);
    try {
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
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={6} md={3}>
          <TextField label="版本标签" value={newVersion.version_label} onChange={(e) => setNewVersion((prev) => ({ ...prev, version_label: e.target.value }))} fullWidth disabled={readOnly} placeholder="如 V1.0" />
        </Grid>
        <Grid item xs={12} sm={6} md={5}>
          <TextField label="备注" value={newVersion.remark} onChange={(e) => setNewVersion((prev) => ({ ...prev, remark: e.target.value }))} fullWidth disabled={readOnly} />
        </Grid>
        <Grid item xs={12} md={4} sx={{ display: 'flex', alignItems: 'center' }}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={createVersion} disabled={readOnly || saving}>
            新增方案版本
          </Button>
        </Grid>
      </Grid>

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
              <Box>
                <Button component="label" variant="outlined" size="small" startIcon={<UploadFileIcon />} disabled={readOnly}>
                  上传方案文件
                  <input type="file" hidden accept=".pdf,.doc,.docx" onChange={uploadFile} />
                </Button>
                {activeVersion.attachments?.map((file) => (
                  <Chip
                    key={file.id}
                    size="small"
                    icon={<DownloadIcon />}
                    label={file.file_name}
                    clickable
                    onClick={() => openDownload(`/api/orders/${order.id}/attachments/${file.id}/download`)}
                    sx={{ ml: 1 }}
                  />
                ))}
                {!readOnly && (
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => deleteVersion(activeVersion.id)}
                    title="删除方案版本"
                    sx={{ ml: 1 }}
                  >
                    <DeleteIcon />
                  </IconButton>
                )}
              </Box>
            )}
          </Stack>

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
