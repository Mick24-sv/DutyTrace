// Thin fetch wrapper. All backend calls go through here so error handling and
// the base URL live in one place. The backend always replies with
// { success, data } or { success: false, error: { code, message, details? } }.
// The session lives in an httpOnly cookie, so the browser sends it for us
// (credentials: 'include'); JavaScript never sees the token.

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

export class ApiError extends Error {
  constructor(message, code, status, details) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details; // field-level validation messages, if any
  }
}

async function request(method, path, { body, rawBody, signal } = {}) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      signal,
      credentials: 'include',
      headers: rawBody ? { 'Content-Type': 'application/octet-stream' } : body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: rawBody ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Cannot reach the server.', 'NETWORK_ERROR', 0);
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response */
  }

  if (!res.ok || !json?.success) {
    throw new ApiError(
      json?.error?.message ?? 'Unexpected server response.',
      json?.error?.code ?? 'UNKNOWN',
      res.status,
      json?.error?.details,
    );
  }
  return json.data;
}

export const apiGet = (path, opts) => request('GET', path, opts);
export const apiPost = (path, body, opts) => request('POST', path, { ...opts, body });
export const apiPut = (path, body, opts) => request('PUT', path, { ...opts, body });
export const apiPatch = (path, body, opts) => request('PATCH', path, { ...opts, body });
export const apiDelete = (path, opts) => request('DELETE', path, opts);

// Upload one file: the request body IS the file, its name travels in ?filename=. The server decides
// whether the type and size are acceptable; this only reports its answer.
export async function apiUpload(path, file, query = '') {
  const sep = path.includes('?') ? '&' : '?';
  return request('POST', `${path}${sep}filename=${encodeURIComponent(file.name)}${query}`, { rawBody: file });
}

// Absolute-from-root URL for a plain link (e.g. a PDF download). The browser sends the session cookie itself.
export const apiUrl = (path) => `${BASE_URL}${path}`;

export const getHealth = (opts) => apiGet('/health', opts);
