// The focus timer. One instance shared by the Focus page, the top bar pill and
// the Overview button. It counts against the clock (not a 1-second counter), so
// it stays accurate even if the tab is in the background.

import { api } from './api.js';
import { S, act, settings } from './state.js';
import { burst, go, localDate, toast } from './util.js';

export const timer = { mode: 'focus', running: false, endsAt: 0, left: 0, total: 0, label: '' };

const subs = new Set();
let interval = null;

export function onTimer(fn) {
  subs.add(fn);
  fn(timer);
  return () => subs.delete(fn);
}

const minutesFor = mode => (mode === 'focus' ? settings().focus : settings().pause);
const storageKey = () => `studyspace.timer.${S.user}`;

function emit() {
  subs.forEach(fn => fn(timer));
  try {
    localStorage.setItem(storageKey(), JSON.stringify(timer));
  } catch { /* storage blocked */ }
}

function stopTick() {
  clearInterval(interval);
  interval = null;
}

export function resetTo(mode) {
  stopTick();
  timer.mode = mode;
  timer.total = minutesFor(mode) * 60;
  timer.left = timer.total;
  timer.running = false;
  emit();
}

export function start() {
  if (timer.running) return;
  if (timer.left <= 0) timer.left = timer.total;
  timer.running = true;
  timer.endsAt = Date.now() + timer.left * 1000;
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
  interval = setInterval(step, 250);
  emit();
}

export function pause() {
  if (!timer.running) return;
  step();
  if (!timer.running) return;
  timer.running = false;
  stopTick();
  emit();
}

export function reset() { resetTo(timer.mode); }
export function skip() { resetTo(timer.mode === 'focus' ? 'break' : 'focus'); }
export function setLabel(label) { timer.label = label; emit(); }

/** Starts a focus session for a subject and opens the Focus page. */
export function startFocus(label = '') {
  if (timer.mode !== 'focus') resetTo('focus');
  if (!timer.running) {
    timer.label = label || timer.label;
    start();
  }
  go('focus');
}

/** Call after settings change or on first load: idle timers follow the new lengths. */
export function syncSettings() {
  if (!timer.running) resetTo(timer.mode);
}

/** Brings back a timer that was running when the page was reloaded. */
export function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey()) || 'null');
    if (saved && saved.running && saved.endsAt > Date.now()) {
      Object.assign(timer, saved);
      interval = setInterval(step, 250);
      step();
      emit();
      return;
    }
  } catch { /* ignore broken saved state */ }
  resetTo('focus');
}

function step() {
  const left = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000));
  if (left !== timer.left) {
    timer.left = left;
    emit();
  }
  if (left <= 0) finish();
}

function notify(title, body) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body });
  } catch { /* some browsers block the constructor */ }
}

async function finish() {
  stopTick();
  timer.running = false;
  if (timer.mode === 'focus') {
    const minutes = Math.max(1, Math.round(timer.total / 60));
    const saved = await act(() => api.post('sessions', { date: localDate(), minutes, label: timer.label || '' }));
    burst(innerWidth / 2, innerHeight / 3, 90, 1.5);
    toast(saved ? `Session saved: ${minutes} min of focus. Take a break.` : 'Session finished, but it could not be saved.', saved ? 'ok' : 'error');
    notify('Focus session complete', 'Nice work. Take a short break.');
    resetTo('break');
  } else {
    toast('Break over. Ready for another round?');
    notify('Break over', 'Ready for another focus session?');
    resetTo('focus');
  }
}
