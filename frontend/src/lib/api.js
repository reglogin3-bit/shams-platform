const KIOSK_STORAGE = 'shams.kioskKey';

export function getKioskKey() {
  try {
    return localStorage.getItem(KIOSK_STORAGE) || '';
  } catch (error) {
    return '';
  }
}

export function setKioskKey(key) {
  try {
    if (key) localStorage.setItem(KIOSK_STORAGE, key);
    else localStorage.removeItem(KIOSK_STORAGE);
  } catch (error) {
    /* e'tiborsiz */
  }
}

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.status = status;
    this.payload = payload || {};
  }
}

export async function api(path, { method = 'GET', body, kiosk = false, form } = {}) {
  const headers = { 'X-Requested-With': 'shams' };
  if (kiosk) headers['X-Kiosk-Key'] = getKioskKey();
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await fetch(path, { method, headers, body: payload, credentials: 'same-origin' });
  const type = response.headers.get('content-type') || '';
  if (!response.ok) {
    let detail = {};
    if (type.includes('application/json')) {
      try {
        detail = await response.json();
      } catch (error) {
        detail = {};
      }
    }
    throw new ApiError(detail.error || `Xatolik (${response.status})`, response.status, detail);
  }
  if (type.includes('application/json')) return response.json();
  return response;
}

export const kioskApi = (path, options = {}) => api(path, { ...options, kiosk: true });

export function todayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
}
