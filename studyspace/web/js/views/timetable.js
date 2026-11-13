// Weekly timetable with reminders.

import { h, icon, toast } from '../util.js';
import { panel, deleteButton, reconcile } from '../ui.js';
import { S, act } from '../state.js';
import { api } from '../api.js';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function timetableView() {
  const title = h('input', { class: 'input grow', type: 'text', maxLength: 60, placeholder: 'Class or study block, e.g. Physics lecture', required: true, autocomplete: 'off', 'aria-label': 'Event title' });
  const day = h('select', { class: 'input', 'aria-label': 'Day' }, ...DAYS.map(d => h('option', { value: d }, d)));
  const time = h('input', { class: 'input', type: 'time', required: true, 'aria-label': 'Time' });
  const form = h('form', { class: 'add-row', onsubmit: async e => {
    e.preventDefault();
    if (!title.value.trim() || !time.value) return;
    const ok = await act(() => api.post('events', { title: title.value.trim(), day: day.value, time: time.value }), { success: 'Added to your timetable.' });
    if (ok) { title.value = ''; time.value = ''; title.focus(); }
  } }, title, day, time, h('button', { class: 'btn dark', type: 'submit' }, icon('plus', 16), 'Add'));

  const reminderBtn = h('button', { class: 'btn ghost small', type: 'button', onclick: async () => {
    if (!('Notification' in window)) { toast('This browser does not support notifications.', 'error'); return; }
    try { await Notification.requestPermission(); } catch { /* ignore */ }
    paintReminder();
  } });
  const reminderText = h('span', { class: 'row-sub' });
  function paintReminder() {
    if (!('Notification' in window)) { reminderBtn.hidden = true; reminderText.textContent = 'Reminders need a browser with notifications.'; return; }
    const p = Notification.permission;
    reminderBtn.hidden = p === 'granted';
    reminderBtn.replaceChildren(icon('bell', 16), 'Turn on reminders');
    reminderText.textContent = p === 'granted' ? 'Reminders are on. You get a heads-up 5 minutes before each event while this page is open.'
      : p === 'denied' ? 'Notifications are blocked in your browser settings.' : 'Get a heads-up 5 minutes before each event while this page is open.';
  }

  const week = h('div', { class: 'week' });
  const columns = new Map();
  for (const d of DAYS) {
    const list = h('div', { class: 'list tight' });
    const col = h('section', { class: 'day-col' }, h('h3', {}, d), list);
    columns.set(d, { col, list });
    week.append(col);
  }

  function makeEvent() {
    let item;
    const t = h('span', { class: 'ev-time' });
    const name = h('span', { class: 'row-title' });
    const el = h('div', { class: 'event' }, t, name, deleteButton('Delete event', () => act(() => api.del('events/' + item.id))));
    el.update = e => { item = e; t.textContent = e.time; name.textContent = e.title; };
    return el;
  }

  const el = h('div', { class: 'view-inner' },
    h('div', { class: 'page-head' }, h('h1', {}, 'Timetable'), h('p', {}, 'Your week at a glance.')),
    panel({}, form, h('div', { class: 'reminder-row' }, reminderText, reminderBtn)), week);

  function update() {
    paintReminder();
    const todayName = new Date(S.today + 'T00:00').toLocaleDateString('en-US', { weekday: 'long' });
    if (!day._set) { day.value = todayName; day._set = true; }
    for (const d of DAYS) {
      const { col, list } = columns.get(d);
      col.classList.toggle('today', d === todayName);
      const events = S.data.events.filter(e => e.day === d).sort((a, b) => a.time.localeCompare(b.time));
      reconcile(list, events, e => e.id, makeEvent);
      col.classList.toggle('quiet', events.length === 0);
    }
  }
  return { id: 'timetable', title: 'Timetable', el, update };
}
