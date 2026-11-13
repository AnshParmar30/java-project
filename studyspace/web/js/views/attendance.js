// Attendance tracker with the "how many classes can I skip" calculator (computed in Java).

import { h, icon, marker, fmtLong, countTo, go } from '../util.js';
import { panel, bar, deleteButton, emptyState, chip, reconcile, syncSelect } from '../ui.js';
import { S, act, subjects, subjectById } from '../state.js';
import { api } from '../api.js';

const RING = 2 * Math.PI * 52;
const STATUS_COLOR = { safe: 'var(--mint)', edge: 'var(--yellow)', danger: 'var(--danger)', none: 'var(--line)' };

export function attendanceView() {
  // ------------------------------------------------------------ summary ring
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.setAttribute('class', 'ring-svg');
  svg.setAttribute('aria-hidden', 'true');
  const track = document.createElementNS(ns, 'circle');
  const fill = document.createElementNS(ns, 'circle');
  for (const [c, cls] of [[track, 'ring-track'], [fill, 'ring-fill']]) {
    c.setAttribute('cx', 60); c.setAttribute('cy', 60); c.setAttribute('r', 52); c.setAttribute('class', cls);
    svg.append(c);
  }
  fill.style.strokeDasharray = RING;
  fill.style.strokeDashoffset = RING;
  const ringNum = h('span', { class: 'ring-num' });
  const ringWrap = h('div', { class: 'ring' }, svg, h('div', { class: 'ring-center' }, ringNum, h('span', { class: 'ring-unit' }, '%')));
  const summaryText = h('p', { class: 'sum-text' });
  const summary = h('section', { class: 'panel summary-row' }, ringWrap,
    h('div', { class: 'summary-body' },
      h('h2', {}, 'Overall attendance'), summaryText,
      h('a', { class: 'btn ghost small', href: '/api/export?format=csv', download: 'attendance.csv' }, icon('download', 16), 'Export CSV')));

  // ------------------------------------------------------------ mark form
  const subjectSel = h('select', { class: 'input', required: true, 'aria-label': 'Subject' });
  const dateInput = h('input', { class: 'input', type: 'date', required: true, 'aria-label': 'Date' });
  const markForm = h('form', { class: 'add-row', onsubmit: async e => {
    e.preventDefault();
    const status = e.submitter && e.submitter.value;
    if (!subjectSel.value) { subjectSel.focus(); return; }
    if (!status) return;
    await act(() => api.post('attendance', { subjectId: subjectSel.value, date: dateInput.value, status }), { success: `Marked ${status}.` });
  } }, subjectSel, dateInput,
  h('button', { class: 'btn mint', type: 'submit', value: 'present' }, icon('check', 16), 'Present'),
  h('button', { class: 'btn ghost', type: 'submit', value: 'absent' }, 'Absent'));
  const markPanel = panel({ title: 'Mark a class', sub: 'One record per subject per day. Marking again just changes it.' }, markForm);

  // ------------------------------------------------------------ subject cards
  const cards = h('div', { class: 'cards-grid' });
  function makeCard() {
    let item;
    const name = h('strong', { class: 'subject-name' });
    const pct = h('span', { class: 'att-pct' });
    const counts = h('span', { class: 'row-sub' });
    const msg = h('p', { class: 'att-msg' });
    const progress = bar();
    const present = h('button', { class: 'btn small mark', type: 'button', onclick: () => quick('present') }, icon('check', 14), 'Present today');
    const absent = h('button', { class: 'btn small mark ghost', type: 'button', onclick: () => quick('absent') }, 'Absent today');
    async function quick(status) {
      await act(() => api.post('attendance', { subjectId: item.subjectId, date: S.today, status }), { success: `${item.name}: marked ${status} for today.` });
    }
    const el = h('article', { class: 'att-card' },
      h('div', { class: 'att-head' }, h('div', {}, name, counts), pct), progress.el, msg, h('div', { class: 'att-actions' }, present, absent));
    el.update = row => {
      item = row;
      el.style.setProperty('--c', marker(row.color));
      name.textContent = row.name;
      pct.textContent = row.pct === null ? '—' : `${row.pct}%`;
      counts.textContent = row.total ? `${row.present} of ${row.total} classes` : 'No classes yet';
      msg.textContent = row.message;
      el.dataset.status = row.status;
      progress.el.style.setProperty('--target', `${S.dash.attendance.target}%`);
      progress.el.classList.add('has-target');
      progress.set(row.pct || 0, STATUS_COLOR[row.status]);
      const today = S.data.attendance.find(a => a.subjectId === row.subjectId && a.date === S.today);
      present.classList.toggle('on', !!today && today.status === 'present');
      absent.classList.toggle('on', !!today && today.status === 'absent');
    };
    return el;
  }

  // ------------------------------------------------------------ recent records
  const recentList = h('div', { class: 'list' });
  const recentPanel = panel({ title: 'Recent records' }, recentList);
  function makeRecord() {
    let item;
    const name = h('span', { class: 'row-title' });
    const date = h('span', { class: 'row-sub' });
    const badge = h('span', { class: 'badge' });
    const el = h('div', { class: 'row' }, h('div', { class: 'row-main' }, name, date), badge,
      deleteButton('Delete record', () => act(() => api.del('attendance/' + item.id))));
    el.update = a => {
      item = a;
      const sj = subjectById(a.subjectId);
      name.textContent = sj ? sj.name : 'Deleted subject';
      date.textContent = fmtLong(a.date);
      badge.textContent = a.status === 'present' ? 'Present' : 'Absent';
      badge.className = `badge ${a.status === 'present' ? 'calm' : 'hot'}`;
    };
    return el;
  }

  const empty = emptyState('Add a subject first', 'Attendance is tracked per subject.',
    h('button', { class: 'btn dark small', type: 'button', onclick: () => go('subjects') }, 'Add subjects'));

  const content = h('div', { class: 'stack' }, summary, markPanel, cards, recentPanel);
  const el = h('div', { class: 'view-inner' },
    h('div', { class: 'page-head' }, h('h1', {}, 'Attendance'), h('p', {}, 'Track every class and see how many you can afford to skip.')),
    content, empty);

  function update() {
    const att = S.dash.attendance;
    const has = subjects().length > 0;
    content.hidden = !has;
    empty.hidden = has;

    const pct = att.overall.pct;
    if (pct === null) {
      ringNum.textContent = '—'; ringNum._val = 0;
      fill.style.strokeDashoffset = RING;
      summaryText.textContent = `Target is ${att.target}%. Mark your first class to begin. Change the target in Settings.`;
    } else {
      countTo(ringNum, pct, { decimals: Number.isInteger(pct) ? 0 : 1 });
      requestAnimationFrame(() => { fill.style.strokeDashoffset = RING * (1 - pct / 100); });
      fill.style.stroke = pct >= att.target ? 'var(--mint)' : 'var(--danger)';
      summaryText.textContent = `${att.overall.present} present out of ${att.overall.total} classes. Target is ${att.target}%.`;
    }

    syncSelect(subjectSel, subjects().map(s => ({ value: s.id, label: s.name })), 'Choose subject');
    if (dateInput.dataset.auto !== S.today) { dateInput.value = S.today; dateInput.dataset.auto = S.today; }

    reconcile(cards, att.subjects, r => r.subjectId, makeCard);
    const recent = [...S.data.attendance].sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created).slice(0, 8);
    reconcile(recentList, recent, a => a.id, makeRecord);
    recentPanel.hidden = recent.length === 0;
  }
  return { id: 'attendance', title: 'Attendance', el, update };
}
