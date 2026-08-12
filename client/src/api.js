const TOKEN_KEY = 'br_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body && !(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api${path}`, { ...opts, headers });
  if (res.status === 401) {
    setToken(null);
    window.location.href = '/login';
    throw new Error('Session expired');
  }
  const ct = res.headers.get('content-type') || '';
  let data;
  if (ct.includes('json')) {
    data = await res.json();
  } else {
    const text = await res.text();
    if (text.trimStart().startsWith('<!')) {
      throw new Error('Server returned HTML instead of data. Restart the API (port 4040) and try again.');
    }
    throw new Error(text.slice(0, 300) || `Request failed (${res.status})`);
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function downloadFile(path, filename) {
  const token = getToken();
  let res;
  try {
    res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new Error('Cannot reach API server. Run START.bat and wait for port 4040.');
  }
  if (!res.ok) {
    const ct = res.headers.get('content-type') || '';
    let message = `Download failed (${res.status})`;
    try {
      if (ct.includes('json')) {
        const data = await res.json();
        message = data.error || message;
      } else {
        const text = await res.text();
        if (text.includes('Cannot GET')) {
          message = 'Export route missing — close all portal windows and re-run START.bat.';
        } else if (res.status === 502 || res.status === 503) {
          message = 'API server not running. Run START.bat and wait for the API window.';
        } else if (text.trim()) {
          message = text.slice(0, 240);
        }
      }
    } catch { /* keep default */ }
    throw new Error(message);
  }
  const blob = await res.blob();
  if (!blob.size) throw new Error('Downloaded file is empty. Try again or restart the API.');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function money(n) {
  if (n === null || n === undefined) return '—';
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function niceDate(d) {
  if (!d) return '—';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day ?? ''} ${MON[Number(m) - 1]} ${y}`;
}

export function monthLabel(m) {
  const [y, mo] = m.split('-');
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${MON[Number(mo) - 1]} ${y}`;
}
