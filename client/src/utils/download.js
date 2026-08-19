import axios from 'axios';
import api from '../api';

let cachedToken = '';
let cachedAt = 0;
const downloadApi = axios.create({ timeout: 0 });

async function getDownloadToken() {
  if (cachedToken && Date.now() - cachedAt < 8 * 60 * 1000) return cachedToken;
  const { data } = await api.post('/auth/download-token');
  cachedToken = data.token || '';
  cachedAt = Date.now();
  return cachedToken;
}

function filenameFromDisposition(disposition) {
  if (!disposition) return '';
  const utf8 = String(disposition).match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      return utf8[1];
    }
  }
  const plain = String(disposition).match(/filename="?([^";]+)"?/i);
  return plain ? plain[1] : '';
}

export async function downloadFile(path, filename) {
  const token = await getDownloadToken();
  const { data, headers } = await downloadApi.get(path, {
    responseType: 'blob',
    headers: { Authorization: `Bearer ${token}` }
  });
  const name = filename || filenameFromDisposition(headers?.['content-disposition']) || 'download';
  const url = URL.createObjectURL(data);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 以 blob 方式拉取附件，供内联预览（图片 <img> / PDF <iframe>）使用。
 * 下载接口使用 Bearer 下载令牌鉴权，<iframe src> 直接内联无法携带令牌，
 * 因此改为前端取 blob 再用 object URL 渲染，避免任何后端改动。
 * @returns {Promise<Blob>}
 */
export async function previewFileBlob(path) {
  const token = await getDownloadToken();
  const { data } = await downloadApi.get(path, {
    responseType: 'blob',
    headers: { Authorization: `Bearer ${token}` }
  });
  return data;
}
