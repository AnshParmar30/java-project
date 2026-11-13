// Brings over data saved by the earlier, browser-only version of the app
// (it kept everything in localStorage under "studyspace.*").

import { api } from './api.js';
import { toast } from './util.js';

const read = key => {
  try { return JSON.parse(localStorage.getItem('studyspace.' + key)); } catch { return null; }
};
const list = key => (Array.isArray(read(key)) ? read(key) : []);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(n) || lo)));
const safeId = (v, fallback) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : fallback);

export function legacyPayload() {
  const subjects = list('subjects').filter(s => s && s.name).map((s, i) => ({
    id: safeId(s.id, `old-sub-${i}`),
    name: String(s.name),
    topics: (Array.isArray(s.topics) ? s.topics : []).map(t => ({ name: String(t.name || ''), done: !!t.done })),
  }));
  const byName = new Map(subjects.map(s => [s.name.toLowerCase(), s.id]));
  const history = (read('stats') || {}).history;

  const payload = {
    subjects,
    tasks: list('tasks').filter(t => t && t.title).map((t, i) => ({
      id: safeId(t.id, `old-task-${i}`), title: String(t.title), subject: String(t.subject || ''),
      minutes: clamp(t.minutes || 25, 1, 600), done: !!t.done,
    })),
    exams: list('exams').filter(x => x && x.name && x.date).map((x, i) => ({
      id: `old-exam-${i}`, name: String(x.name), date: x.date, subjectId: byName.get(String(x.name).toLowerCase()) || '',
    })),
    assignments: list('assignments').filter(a => a && a.name && a.due).map((a, i) => ({
      id: `old-asg-${i}`, name: String(a.name), due: a.due, done: !!a.done,
    })),
    attendance: list('attendance').filter(a => a && byName.has(String(a.subject).toLowerCase())).map((a, i) => ({
      id: `old-att-${i}`, subjectId: byName.get(String(a.subject).toLowerCase()), date: a.date, status: a.status,
    })),
    cards: list('cards').filter(c => c && c.question && c.answer).map((c, i) => ({
      id: `old-card-${i}`, question: String(c.question), answer: String(c.answer),
    })),
    events: list('events').filter(e => e && e.title).map((e, i) => ({
      id: `old-ev-${i}`, title: String(e.title), day: e.day, time: e.time,
    })),
    resources: list('resources').filter(r => r && r.title && r.url).map((r, i) => ({
      id: `old-res-${i}`, title: String(r.title), url: r.url,
    })),
    sessions: (Array.isArray(history) ? history : []).filter(x => x && x.date).map((x, i) => ({
      id: `old-ses-${i}`, date: x.date, minutes: clamp(x.minutes || 1, 1, 600), label: '',
    })),
    notes: '',
  };
  try { payload.notes = localStorage.getItem('studyspace.notes') || ''; } catch { /* ignore */ }
  return payload;
}

export function legacyCount() {
  const p = legacyPayload();
  return Object.entries(p).reduce((n, [k, v]) => n + (k === 'notes' ? (v ? 1 : 0) : v.length), 0);
}

const flagKey = user => `studyspace.imported.${user}`;
export const alreadyHandled = user => { try { return !!localStorage.getItem(flagKey(user)); } catch { return true; } };
export const markHandled = user => { try { localStorage.setItem(flagKey(user), '1'); } catch { /* ignore */ } };

export async function importLegacy(user) {
  try {
    const result = await api.post('import', legacyPayload());
    markHandled(user);
    toast(`Imported ${result.added} items from the old version.`, 'ok');
    return true;
  } catch (e) {
    toast(e.message, 'error');
    return false;
  }
}
