import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import UploadFileIcon from '@mui/icons-material/UploadFile';

/**
 * 上传状态展示组件，配合 useFileUpload 使用：
 * - uploading：文件名 + 百分比 + 进度条；进度到达 99%（已传完、服务器处理中）时改为不定进度条
 * - success：绿色对勾成功提示（由 hook 定时自动消失）
 * - error：红色错误提示（由 hook 定时自动消失）
 * - idle：不渲染
 */
export default function UploadStatus({ status, progress, fileName, error, successText }) {
  if (!status || status === 'idle') return null;

  if (status === 'success') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'success.main' }}>
        <CheckCircleIcon fontSize="small" sx={{ flexShrink: 0 }} />
        <Typography variant="caption" sx={{ fontWeight: 500 }}>
          {successText || `${fileName || '文件'}上传成功`}
        </Typography>
      </Box>
    );
  }

  if (status === 'error') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'error.main', minWidth: 0 }}>
        <ErrorOutlineIcon fontSize="small" sx={{ flexShrink: 0 }} />
        <Typography variant="caption" sx={{ fontWeight: 500, wordBreak: 'break-all' }}>
          {error || '上传失败'}
        </Typography>
      </Box>
    );
  }

  // uploading
  const processing = progress >= 99;
  return (
    <Box sx={{ minWidth: 180, maxWidth: 340, flex: '1 1 200px' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
        <UploadFileIcon fontSize="small" color="primary" sx={{ flexShrink: 0 }} />
        <Typography variant="caption" noWrap sx={{ flex: 1, minWidth: 0 }}>
          {fileName}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, fontWeight: 500 }}>
          {processing ? '处理中…' : `${progress}%`}
        </Typography>
      </Box>
      {processing ? <LinearProgress /> : <LinearProgress variant="determinate" value={progress} />}
    </Box>
  );
}
