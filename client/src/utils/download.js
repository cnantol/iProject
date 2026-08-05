import api from '../api';

let cachedToken = '';
let cachedAt = 0;

export async function getDownloadToken() {
  if (cachedToken && Date.now() - cachedAt < 8 * 60 * 1000) return cachedToken;
  const { data } = await api.post('/auth/download-token');
  cachedToken = data.token || '';
  cachedAt = Date.now();
  return cachedToken;
}

export async function downloadUrl(path) {
  const token = await getDownloadToken();
  const sep = String(path).includes('?') ? '&' : '?';
  return `${path}${sep}token=${encodeURIComponent(token)}`;
}
