import { useCallback, useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddCommentIcon from '@mui/icons-material/AddComment';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EventNoteIcon from '@mui/icons-material/EventNote';
import api, { errorMessage } from '../api';
import { fmtDateTime } from '../utils/helpers';
import { useAuth } from '../context/AuthContext';

export default function OrderNotesPanel({ orderId }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [content, setContent] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/orders/${orderId}/notes`);
      setItems(data.items || []);
    } catch (err) {
      setError(errorMessage(err, '加载失败'));
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  const addNote = async () => {
    const text = content.trim();
    if (!text) {
      setError('请输入记录内容');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post(`/orders/${orderId}/notes`, { content: text });
      setContent('');
      await load();
    } catch (err) {
      setError(errorMessage(err, '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const removeNote = async (note) => {
    if (!window.confirm('确认删除该条 Project Log？')) return;
    setDeletingId(note.id);
    setError('');
    try {
      await api.delete(`/orders/${orderId}/notes/${note.id}`);
      await load();
    } catch (err) {
      setError(errorMessage(err, '删除失败'));
    } finally {
      setDeletingId(null);
    }
  };

  const canDelete = (note) => note.created_by === user?.id || user?.username === 'admin';

  return (
    <Card sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
      <Box sx={{ height: 4, bgcolor: 'primary.main' }} />
      <CardContent sx={{ p: { xs: 1.5, md: 2 } }}>
        <Stack direction="row" alignItems="center" spacing={1.25}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 1.5,
              bgcolor: 'rgba(25, 118, 210, 0.10)',
              color: 'primary.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <EventNoteIcon fontSize="small" />
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>Project Log</Typography>
          <Chip size="small" variant="outlined" label={`${items.length} 条`} sx={{ fontWeight: 700 }} />
        </Stack>
        {error && <Alert severity="error" onClose={() => setError('')} sx={{ mt: 1.5, borderRadius: 1.5 }}>{error}</Alert>}
        <Stack spacing={2} sx={{ mt: 1.5 }}>
            <Box sx={{ borderRadius: 2, border: '1px dashed', borderColor: 'divider', bgcolor: 'action.hover', p: 1.5 }}>
              <TextField
                multiline
                minRows={3}
                maxRows={6}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="记录当前项目临时情况..."
                inputProps={{ maxLength: 2000 }}
                size="small"
                fullWidth
                sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.paper' } }}
              />
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.secondary">{content.length}/2000</Typography>
                <Button variant="contained" startIcon={<AddCommentIcon />} disabled={saving || !content.trim()} onClick={addNote}>
                  {saving ? '保存中...' : '保存记录'}
                </Button>
              </Stack>
            </Box>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={28} />
              </Box>
            ) : items.length === 0 ? (
              <Box sx={{ py: 2, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">暂无 Project Log</Typography>
              </Box>
            ) : (
              <Stack spacing={1.25}>
                {items.map((note) => (
                  <Box
                    key={note.id}
                    sx={{ borderRadius: 1.5, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', px: 1.5, py: 1.25 }}
                  >
                    <Stack direction="row" alignItems="flex-start" spacing={1}>
                      <Box
                        sx={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          bgcolor: 'rgba(25, 118, 210, 0.10)',
                          color: 'primary.main',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          mt: 0.2
                        }}
                      >
                        <EventNoteIcon sx={{ fontSize: 15 }} />
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontWeight: 600 }}>
                          {note.content}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                          {note.creator_name || '未知用户'} · {fmtDateTime(note.created_at)}
                        </Typography>
                      </Box>
                      {canDelete(note) && (
                        <Tooltip title="删除记录">
                          <IconButton size="small" color="error" disabled={deletingId === note.id} onClick={() => removeNote(note)}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                  </Box>
                ))}
              </Stack>
            )}
          </Stack>
      </CardContent>
    </Card>
  );
}
