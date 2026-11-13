// The app's single source of truth. Every change goes to the Java server first,
// then we reload the data and tell every view to redraw.

import { api } from './api.js';
import { localDate, toast } from './util.js';

export const S = { user: null, data: null, dash: null, today: localDate() };

const subscribers = new Set();
export const subscribe = fn => { subscribers.add(fn); return () => subscribers.delete(fn); };

export async function refresh() {
  S.today = localDate();
  const [data, dash] = await Promise.all([api.get('data'), api.get('dashboard?today=' + S.today)]);
  S.data = data;
  S.dash = dash;
  S.user = data.username;
  subscribers.forEach(fn => fn(S));
}

/**
 * Runs a server change, reloads, and reports problems as a toast.
 * Returns whatever the server returned, or undefined if it failed.
 */
export async function act(fn, { success } = {}) {
  try {
    const result = await fn();
    await refresh();
    if (success) toast(success, 'ok');
    return result ?? true;
  } catch (e) {
    if (e.status === 401) { location.reload(); return undefined; }
    toast(e.message, 'error');
    try { await refresh(); } catch { /* keep showing what we have */ }
    return undefined;
  }
}

export const subjects = () => (S.data ? S.data.subjects : []);
export const subjectById = id => subjects().find(s => s.id === id);
export const settings = () => (S.data ? S.data.settings : { focus: 25, pause: 5, goal: 100, target: 75 });
