import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArticleIcon from '@mui/icons-material/Article';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import DeleteIcon from '@mui/icons-material/Delete';
import DescriptionIcon from '@mui/icons-material/Description';
import DownloadIcon from '@mui/icons-material/Download';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOffIcon from '@mui/icons-material/FolderOff';
import ImageIcon from '@mui/icons-material/Image';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import MailIcon from '@mui/icons-material/Mail';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import PersonIcon from '@mui/icons-material/Person';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import RefreshIcon from '@mui/icons-material/Refresh';
import SlideshowIcon from '@mui/icons-material/Slideshow';
import TableChartIcon from '@mui/icons-material/TableChart';
import VisibilityIcon from '@mui/icons-material/Visibility';
import api, { errorMessage } from '../api';
import { useConfirm } from '../components/ConfirmDialog';
import { downloadFile, previewFileBlob } from '../utils/download';
import {
  ATTACHMENT_STAGE_COLORS,
  ATTACHMENT_STAGE_LABELS,
  ATTACHMENT_STAGE_ORDER
} from '../utils/constants';

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

// 每个阶段一个代表性图标
const STAGE_ICONS = {
  customer_info: PersonIcon,
  proposal: ArticleIcon,
  finance: AccountBalanceIcon,
  invoicing: ReceiptLongIcon
};

// 文件类型图标 + 配色，提升辨识度
const FILE_ICONS = {
  pdf: { Icon: PictureAsPdfIcon, color: '#D32F2F' },
  doc: { Icon: DescriptionIcon, color: '#1976D2' },
  docx: { Icon: DescriptionIcon, color: '#1976D2' },
  xls: { Icon: TableChartIcon, color: '#2E7D32' },
  xlsx: { Icon: TableChartIcon, color: '#2E7D32' },
  ppt: { Icon: SlideshowIcon, color: '#ED6C02' },
  pptx: { Icon: SlideshowIcon, color: '#ED6C02' },
  msg: { Icon: MailIcon, color: '#F57C00' },
  png: { Icon: ImageIcon, color: '#7B1FA2' },
  jpg: { Icon: ImageIcon, color: '#7B1FA2' },
  jpeg: { Icon: ImageIcon, color: '#7B1FA2' },
  gif: { Icon: ImageIcon, color: '#7B1FA2' },
  webp: { Icon: ImageIcon, color: '#7B1FA2' }
};

function getExt(fileName = '') {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function previewKind(fileName) {
  const ext = getExt(fileName);
  if (IMAGE_EXTS.includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  return 'other';
}

function bytesToSize(bytes = 0) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / Math.pow(1024, i);
  return `${v.toFixed(i ? 1 : 0)} ${units[i]}`;
}

function formatDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function FileTypeIcon({ fileName, size = 'small' }) {
  const ext = getExt(fileName);
  const meta = FILE_ICONS[ext] || { Icon: InsertDriveFileIcon, color: '#78909C' };
  const { Icon, color } = meta;
  return <Icon fontSize={size} sx={{ color }} />;
}

// 通用空状态：居中插图 + 友好文案
function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <Box sx={{ textAlign: 'center', py: 7, px: 3 }}>
      <Box
        sx={{
          width: 76,
          height: 76,
          mx: 'auto',
          mb: 2,
          borderRadius: '50%',
          bgcolor: 'action.hover',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Icon sx={{ fontSize: 38, color: 'text.disabled' }} />
      </Box>
      <Typography variant="h6" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, maxWidth: 460, mx: 'auto', lineHeight: 1.7 }}>
          {description}
        </Typography>
      )}
      {action && <Box sx={{ mt: 2.5 }}>{action}</Box>}
    </Box>
  );
}

function referenceText(item, versionMap, invoiceMap) {
  if (item.reference_type === 'proposal_version') {
    const label = versionMap.get(item.reference_id);
    return label ? `方案版本 ${label}` : `方案版本 #${item.reference_id}`;
  }
  if (item.reference_type === 'invoice_record') {
    const label = invoiceMap.get(item.reference_id);
    return label ? `发票 ${label}` : `发票 #${item.reference_id}`;
  }
  return '通用';
}

export default function AttachmentManager() {
  const { id } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const orderId = Number(id);

  const [items, setItems] = useState([]);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null); // { url, kind, fileName }
  const [previewLoading, setPreviewLoading] = useState(false);
  const [workingId, setWorkingId] = useState(null);
  const [orphans, setOrphans] = useState([]);
  const [orphanWorkingPath, setOrphanWorkingPath] = useState(null);

  const versionMap = useMemo(() => {
    const map = new Map();
    (order?.versions || []).forEach((v) => map.set(v.id, v.version_label || `#${v.id}`));
    return map;
  }, [order]);

  const invoiceMap = useMemo(() => {
    const map = new Map();
    (order?.invoices || []).forEach((inv) => map.set(inv.id, inv.invoice_no || `#${inv.id}`));
    return map;
  }, [order]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [orphanRes, attRes, orderRes] = await Promise.all([
        api.get(`/orders/${orderId}/orphans`),
        api.get(`/orders/${orderId}/attachments`),
        api.get(`/orders/${orderId}`)
      ]);
      setOrphans(orphanRes.data.items || []);
      setItems(attRes.data.items || []);
      setOrder(orderRes.data.order || orderRes.data);
    } catch (err) {
      setError(errorMessage(err, '加载失败'));
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  const downloadUrl = (item) => `/api/orders/${orderId}/attachments/${item.id}/download`;

  const handleView = async (item) => {
    const kind = previewKind(item.file_name);
    if (kind === 'other') {
      try {
        await downloadFile(downloadUrl(item), item.file_name);
      } catch {
        setError('打开失败，请尝试下载');
      }
      return;
    }
    setPreviewLoading(true);
    try {
      const blob = await previewFileBlob(downloadUrl(item));
      const url = URL.createObjectURL(blob);
      setPreview({ url, kind, fileName: item.file_name, id: item.id });
    } catch {
      setError('预览失败，请尝试下载');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownload = async (item) => {
    try {
      await downloadFile(downloadUrl(item), item.file_name);
    } catch {
      setError('下载失败，请重试');
    }
  };

  const handleDelete = async (item) => {
    if (item.reference_type === 'invoice_record') return;
    const ok = await confirm(`确认删除附件「${item.file_name}」？删除后不可恢复。`, { title: '删除附件' });
    if (!ok) return;
    setWorkingId(item.id);
    setError('');
    try {
      await api.delete(`/orders/${orderId}/attachments/${item.id}`);
      setItems((prev) => prev.filter((it) => it.id !== item.id));
    } catch (err) {
      setError(errorMessage(err, '删除失败'));
    } finally {
      setWorkingId(null);
    }
  };

  const closePreview = () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  const handleDeleteOrphan = async (orphan) => {
    const ok = await confirm(
      `确认删除未记录文件「${orphan.file_name}」？该文件不在附件记录中，删除后不可恢复。`,
      { title: '删除未记录文件' }
    );
    if (!ok) return;
    setOrphanWorkingPath(orphan.file_path);
    setError('');
    try {
      await api.delete(`/orders/${orderId}/orphans`, { data: { file_path: orphan.file_path } });
      setOrphans((prev) => prev.filter((o) => o.file_path !== orphan.file_path));
    } catch (err) {
      setError(errorMessage(err, '删除失败'));
    } finally {
      setOrphanWorkingPath(null);
    }
  };

  const grouped = useMemo(() => {
    const map = {};
    ATTACHMENT_STAGE_ORDER.forEach((stage) => {
      map[stage] = [];
    });
    items.forEach((item) => {
      const stage = ATTACHMENT_STAGE_ORDER.includes(item.stage) ? item.stage : 'other';
      if (!map[stage]) map[stage] = [];
      map[stage].push(item);
    });
    return map;
  }, [items]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Stack spacing={2}>
      {/* 头部 */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(`/orders/${orderId}`)}>
          返回
        </Button>
        <Typography variant="h5" sx={{ minWidth: 0 }}>
          附件管理
        </Typography>
        {order && (
          <Chip label={`商机 ${order.order_id}`} size="small" variant="outlined" />
        )}
        <Chip label={`共 ${items.length} 个`} size="small" color="primary" variant="outlined" />
        <Box sx={{ flex: 1 }} />
        <Button startIcon={<RefreshIcon />} onClick={load}>
          刷新
        </Button>
      </Stack>

      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

      {/* 未记录文件（孤儿）卡片 —— 仅在存在孤儿文件时显示 */}
      {orphans.length > 0 && (
      <Card
        sx={{
          borderRadius: 2,
          overflow: 'hidden',
          border: '1px solid',
          borderColor: 'warning.main'
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{
            px: 2,
            py: 1.25,
            borderBottom: orphans.length ? '1px solid' : 'none',
            borderColor: 'divider',
            bgcolor: 'warning.light'
          }}
        >
          <FolderOffIcon sx={{ color: 'warning.dark', fontSize: 'small' }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'warning.dark' }}>
            未记录文件
          </Typography>
          <Chip
            label={orphans.length}
            size="small"
            color={orphans.length ? 'warning' : 'default'}
            sx={{ height: 20, fontSize: 11, fontWeight: 700 }}
          />
            <Typography variant="caption" color="warning.dark" sx={{ opacity: 0.85 }}>
            磁盘存在，但数据库无对应记录
          </Typography>
        </Stack>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>文件名</TableCell>
              <TableCell sx={{ width: 140 }}>所在步骤</TableCell>
              <TableCell sx={{ width: 110 }}>大小</TableCell>
              <TableCell sx={{ width: 120 }} align="right">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {orphans.map((o) => (
              <TableRow key={o.file_path} hover>
                <TableCell>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <FileTypeIcon fileName={o.file_name} />
                    <Typography variant="body2" sx={{ wordBreak: 'break-all', fontWeight: 500 }}>
                      {o.file_name}
                    </Typography>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Chip
                    label={ATTACHMENT_STAGE_LABELS[o.stage] || o.stage}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: 11, height: 22 }}
                  />
                </TableCell>
                <TableCell sx={{ color: 'text.secondary' }}>{bytesToSize(o.size)}</TableCell>
                <TableCell align="right">
                  <Tooltip title="删除未记录文件">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDeleteOrphan(o)}
                      disabled={orphanWorkingPath === o.file_path}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      )}

      {/* 无附件：友好空状态 */}
      {items.length === 0 ? (
        <Card sx={{ borderRadius: 2 }}>
          <EmptyState
            icon={AttachFileIcon}
            title="暂无附件"
            description="该商机下尚未上传任何附件。你可以在各阶段的编辑页中上传相关文件（客户信息、方案、财务、开票），系统会自动归类并显示在这里。"
            action={
              <Button
                variant="contained"
                startIcon={<ArrowBackIcon />}
                onClick={() => navigate(`/orders/${orderId}`)}
              >
                返回商机详情
              </Button>
            }
          />
        </Card>
      ) : (
        ATTACHMENT_STAGE_ORDER.map((stage) => {
          const color = ATTACHMENT_STAGE_COLORS[stage];
          const StageIcon = STAGE_ICONS[stage] || FolderIcon;
          const stageItems = grouped[stage] || [];
          return (
            <Card key={stage} sx={{ borderRadius: 2, overflow: 'hidden' }}>
              <Stack
                direction="row"
                alignItems="center"
                spacing={1.5}
                sx={{
                  px: 2,
                  py: 1.25,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  background: `linear-gradient(90deg, ${alpha(color, 0.10)}, ${alpha(color, 0)})`
                }}
              >
                <Box
                  sx={{
                    width: 30,
                    height: 30,
                    borderRadius: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: alpha(color, 0.14),
                    color
                  }}
                >
                  <StageIcon sx={{ fontSize: 18 }} />
                </Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color }}>
                  {ATTACHMENT_STAGE_LABELS[stage]}
                </Typography>
                <Chip
                  label={stageItems.length}
                  size="small"
                  sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: alpha(color, 0.14), color }}
                />
              </Stack>
              {stageItems.length === 0 ? (
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  justifyContent="center"
                  sx={{ px: 2, py: 3, color: 'text.disabled' }}
                >
                  <NoteAddIcon fontSize="small" />
                  <Typography variant="body2">该步骤暂无附件</Typography>
                </Stack>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>文件名</TableCell>
                      <TableCell sx={{ width: 160 }}>关联对象</TableCell>
                      <TableCell sx={{ width: 180 }}>上传时间</TableCell>
                      <TableCell sx={{ width: 150 }} align="right">操作</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {stageItems.map((item) => {
                      const isInvoiceBound = item.reference_type === 'invoice_record';
                      const kind = previewKind(item.file_name);
                      return (
                        <TableRow key={item.id} hover>
                          <TableCell>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <FileTypeIcon fileName={item.file_name} />
                              <Typography
                                variant="body2"
                                sx={{ wordBreak: 'break-all', fontWeight: 500 }}
                              >
                                {item.file_name}
                              </Typography>
                            </Stack>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={referenceText(item, versionMap, invoiceMap)}
                              size="small"
                              variant="outlined"
                              sx={{ fontSize: 11, height: 22 }}
                            />
                          </TableCell>
                          <TableCell sx={{ color: 'text.secondary' }}>{formatDateTime(item.uploaded_at)}</TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                              <Tooltip title={kind === 'other' ? '下载查看' : '预览'}>
                                <IconButton
                                  size="small"
                                  onClick={() => handleView(item)}
                                  disabled={previewLoading}
                                  sx={{ color: 'primary.main' }}
                                >
                                  <VisibilityIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="下载">
                                <IconButton size="small" onClick={() => handleDownload(item)}>
                                  <DownloadIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              {isInvoiceBound ? (
                                <Tooltip title="已绑定发票，请通过发票记录删除">
                                  <span>
                                    <IconButton size="small" color="error" disabled>
                                      <DeleteIcon fontSize="small" />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                              ) : (
                                <Tooltip title="删除">
                                  <IconButton
                                    size="small"
                                    color="error"
                                    onClick={() => handleDelete(item)}
                                    disabled={workingId === item.id}
                                  >
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Stack>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </Card>
          );
        })
      )}

      <Dialog open={Boolean(preview)} onClose={closePreview} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <VisibilityIcon fontSize="small" color="primary" />
          <Typography variant="subtitle1" sx={{ fontWeight: 700, wordBreak: 'break-all' }}>
            {preview?.fileName}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          {previewLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : preview?.kind === 'image' ? (
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <img
                src={preview.url}
                alt={preview.fileName}
                style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
              />
            </Box>
          ) : (
            <iframe
              src={preview?.url}
              title={preview?.fileName}
              style={{ width: '100%', height: '70vh', border: 'none' }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closePreview}>关闭</Button>
          {preview && (
            <Button
              variant="contained"
              startIcon={<DownloadIcon />}
              onClick={() => handleDownload({ id: preview.id, file_name: preview.fileName })}
            >
              下载
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
