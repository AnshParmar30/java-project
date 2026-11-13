// Focus timer, weekly chart and the study heatmap.

import { h, icon, fmtClock, fmtMinutes, countTo, fmtLong } from '../util.js';
import { panel, segmented, syncSelect } from '../ui.js';
import { S, subjects, settings } from '../state.js';
import { timer, onTimer, start, pause, reset, skip, resetTo, setLabel } from '../timer.js';

const RING = 2 * Math.PI * 120;
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const NS = 'http://www.w3.org/2000/svg';

export function focusView(openSettings) {
  // ------------------------------------------------------------ timer ring
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 260 260');
  svg.setAttribute('class', 'timer-svg');
  svg.setAttribute('aria-hidden', 'true');
  const track = document.createElementNS(NS, 'circle');
  const fill = document.createElementNS(NS, 'circle');
  for (const [c, cls] of [[track, 'timer-track'], [fill, 'timer-fill']]) {
    c.setAttribute('cx', 130); c.setAttribute('cy', 130); c.setAttribute('r', 120); c.setAttribute('class', cls);
    svg.append(c);
  }
  fill.style.strokeDasharray = RING;

  const digits = h('div', { class: 'digits', role: 'timer', 'aria-live': 'off' });
  const modeText = h('span', { class: 'timer-mode' });
  const lengthText = h('span', { class: 'timer-length' });
  const ring = h('div', { class: 'timer-ring' }, svg, h('div', { class: 'timer-center' }, modeText, digits, lengthText));

  const startBtn = h('button', { class: 'btn marker big', type: 'button', onclick: () => (timer.running ? pause() : start()) });
  const resetBtn = h('button', { class: 'round-btn', type: 'button', 'aria-label': 'Reset timer', title: 'Reset', onclick: reset }, icon('reset', 20));
  const skipBtn = h('button', { class: 'round-btn', type: 'button', 'aria-label': 'Skip to the next phase', title: 'Skip', onclick: skip }, icon('skip', 20));
  const controls = h('div', { class: 'timer-controls' }, resetBtn, startBtn, skipBtn);

  const modeSwitch = segmented([{ value: 'focus', label: 'Focus' }, { value: 'break', label: 'Break' }], timer.mode, v => resetTo(v));
  modeSwitch.classList.add('on-dark');
  const labelSel = h('select', { class: 'input on-dark', 'aria-label': 'What are you studying?', onchange: () => setLabel(labelSel.value) });
  const settingsBtn = h('button', { class: 'btn ghost-light small', type: 'button', onclick: openSettings }, icon('settings', 16), 'Timer settings');

  const timerCard = h('section', { class: 'timer-card' },
    modeSwitch, ring, controls,
    h('div', { class: 'timer-foot' }, h('label', { class: 'field inline' }, h('span', {}, 'Studying'), labelSel), settingsBtn));

  // ------------------------------------------------------------ side stats
  const mini = (label) => {
    const num = h('span', { class: 'stat-num' });
    return { num, el: h('div', { class: 'mini-stat' }, num, h('span', {}, label)) };
  };
  const mToday = mini('min today'), mTotal = mini('min in total'), mSessions = mini('sessions'), mBest = mini('day best streak');
  const miniStats = h('div', { class: 'mini-stats two' }, mToday.el, mSessions.el, mTotal.el, mBest.el);

  // ------------------------------------------------------------ weekly chart
  const weekCols = DAY_NAMES.map(d => {
    const value = h('span', { class: 'bar-val' });
    const fillBar = h('i');
    const el = h('div', { class: 'col' }, value, h('div', { class: 'col-track' }, fillBar), h('span', { class: 'col-day' }, d));
    return { el, value, fillBar };
  });
  const weekChart = h('div', { class: 'week-chart' }, ...weekCols.map(c => c.el));
  const weekNote = h('p', { class: 'hint' });
  const weekPanel = panel({ title: 'This week' }, weekChart, weekNote);

  // ------------------------------------------------------------ heatmap
  const heat = h('div', { class: 'heat', role: 'img', 'aria-label': 'Study minutes for each of the last 16 weeks' });
  const legend = h('div', { class: 'heat-legend' }, h('span', {}, 'Less'), ...[0, 1, 2, 3, 4].map(l => h('i', { class: `h${l}` })), h('span', {}, 'More'));
  const heatPanel = panel({ title: 'Last 16 weeks', sub: 'Darker means more focus. The top level is your daily goal.' }, heat, legend);
  let heatSig = '', heatFirst = true;

  const right = h('div', { class: 'stack' }, miniStats, weekPanel, heatPanel);
  const el = h('div', { class: 'view-inner' },
    h('div', { class: 'page-head' }, h('h1', {}, 'Focus'), h('p', {}, 'One thing at a time. Your sessions are saved when the timer reaches zero.')),
    h('div', { class: 'grid' }, h('div', { class: 'span-7' }, timerCard), h('div', { class: 'span-5' }, right)));

  // ------------------------------------------------------------ live timer
  function setDigits(text) {
    if (digits.children.length !== text.length) {
      digits.replaceChildren(...[...text].map(() => h('span', { class: 'digit' })));
    }
    [...text].forEach((ch, i) => {
      const s = digits.children[i];
      s.classList.toggle('colon', ch === ':');
      if (s.textContent !== ch) {
        s.textContent = ch;
        if (timer.running && ch !== ':') { s.classList.remove('roll'); void s.offsetWidth; s.classList.add('roll'); }
      }
    });
  }

  onTimer(t => {
    setDigits(fmtClock(t.left));
    const progress = t.total > 0 ? t.left / t.total : 1;
    fill.style.strokeDashoffset = RING * (1 - progress);
    timerCard.classList.toggle('running', t.running);
    timerCard.classList.toggle('is-break', t.mode === 'break');
    modeText.textContent = t.mode === 'focus' ? 'Focus' : 'Break';
    lengthText.textContent = t.mode === 'focus' ? `${Math.round(t.total / 60)} min session` : `${Math.round(t.total / 60)} min break`;
    startBtn.replaceChildren(icon(t.running ? 'pause' : 'play', 20), t.running ? 'Pause' : t.left < t.total ? 'Resume' : t.mode === 'focus' ? 'Start focus' : 'Start break');
    modeSwitch.set(t.mode);
    if (labelSel.value !== t.label && [...labelSel.options].some(o => o.value === t.label)) labelSel.value = t.label;
  });

  function heatLevel(m, goal) {
    if (m <= 0) return 0;
    const r = m / Math.max(1, goal);
    return r < 0.25 ? 1 : r < 0.5 ? 2 : r < 1 ? 3 : 4;
  }

  function update() {
    const d = S.dash.study;
    syncSelect(labelSel, subjects().map(s => ({ value: s.name, label: s.name })), 'Anything');
    if (labelSel.value !== timer.label && [...labelSel.options].some(o => o.value === timer.label)) labelSel.value = timer.label;

    countTo(mToday.num, d.todayMinutes);
    countTo(mTotal.num, d.totalMinutes);
    countTo(mSessions.num, d.sessions);
    countTo(mBest.num, d.longestStreak);

    const max = Math.max(1, ...d.week);
    const todayIdx = (new Date(S.today + 'T00:00').getDay() + 6) % 7;
    weekCols.forEach((c, i) => {
      c.value.textContent = d.week[i] ? d.week[i] : '';
      c.el.classList.toggle('today', i === todayIdx);
      requestAnimationFrame(() => requestAnimationFrame(() => { c.fillBar.style.height = d.week[i] ? Math.max(6, (d.week[i] / max) * 100) + '%' : '0%'; }));
    });
    weekNote.textContent = d.lastWeekTotal > 0
      ? `${fmtMinutes(d.weekTotal)} so far. Last week you did ${fmtMinutes(d.lastWeekTotal)}.`
      : d.weekTotal ? `${fmtMinutes(d.weekTotal)} focused so far this week.` : 'No sessions yet this week. Start one above.';

    const sig = JSON.stringify([d.heatmap.map(x => x.m), d.goal]);
    if (sig !== heatSig) {
      heatSig = sig;
      heat.replaceChildren();
      const first = new Date(d.heatmap[0].d + 'T00:00');
      const pad = (first.getDay() + 6) % 7; // Monday-first rows
      for (let i = 0; i < pad; i++) heat.append(h('i', { class: 'cell blank' }));
      d.heatmap.forEach((x, i) => {
        const cell = h('i', { class: `cell h${heatLevel(x.m, d.goal)}`, title: `${fmtLong(x.d)}: ${x.m} min` });
        if (heatFirst) cell.style.animationDelay = `${i * 6}ms`;
        if (heatFirst) cell.classList.add('in');
        heat.append(cell);
      });
      heatFirst = false;
    }
  }

  return { id: 'focus', title: 'Focus', el, update };
}
