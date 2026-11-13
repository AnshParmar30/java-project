// Thin wrapper around fetch for the Java backend.

async function request(method, path, body) {
  let res;
  try {
    res = await fetch('/api/' + path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    const err = new Error("Can't reach the server. Check that it is still running.");
    err.status = 0;
    throw err;
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || 'Something went wrong. Try again.');
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get: path => request('GET', path),
  post: (path, body) => request('POST', path, body ?? {}),
  put: (path, body) => request('PUT', path, body ?? {}),
  del: path => request('DELETE', path),
};
