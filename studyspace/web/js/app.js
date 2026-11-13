// Studyspace: app shell, sign-in screen, navigation, search and settings.

import { api } from './api.js';
import { S, act, refresh, subscribe, settings } from './state.js';
import { h, icon, go, debounce, fmtClock, toast, localDate, svgFromString } from './util.js';
import { timer, onTimer, syncSettings, restore } from './timer.js';
import { legacyCount, alreadyHandled, importLegacy } from './legacy.js';
import { homeView } from './views/home.js';
import { planView } from './views/plan.js';
import { focusView } from './views/focus.js';
import { subjectsView } from './views/subjects.js';
import { examsView } from './views/exams.js';
import { attendanceView } from './views/attendance.js';
import { timetableView } from './views/timetable.js';
import { gradesView } from './views/grades.js';
import { cardsView } from './views/cards.js';
import { notesView } from './views/notes.js';

const appRoot = document.getElementById('app');
const authRoot = document.getElementById('auth');

const NAV = [
  { group: 'Today', items: [['home', 'Overview', 'home'], ['plan', 'Study plan', 'plan'], ['focus', 'Focus', 'focus']] },
  { group: 'Courses', items: [['subjects', 'Subjects', 'subjects'], ['exams', 'Exams & deadlines', 'exams'], ['attendance', 'Attendance', 'attendance'], ['timetable', 'Timetable', 'timetable'], ['grades', 'Grades', 'grades']] },
  { group: 'Recall', items: [['cards', 'Flashcards', 'cards'], ['notes', 'Notes & links', 'notes']] },
];
const SEARCH_VIEW = { tasks: 'home' };

let built = false;
let views = [];
let navLinks = new Map();
let navMarker, cardsBadge, streakText, avatar, menuImport;
let currentView = null;

// =====================================================================
// Sign in / create account
// =====================================================================

function showAuth() {
  appRoot.hidden = true;
  authRoot.hidden = false;
  authRoot.replaceChildren();
  let mode = 'login';

  const user = h('input', { class: 'input', id: 'auth-user', type: 'text', autocomplete: 'username', maxLength: 20, required: true, placeholder: 'e.g. ansh_01' });
  const pass = h('input', { class: 'input', id: 'auth-pass', type: 'password', autocomplete: 'current-password', maxLength: 100, required: true, placeholder: 'At least 6 characters' });
  const show = h('button', { class: 'link-btn', type: 'button', onclick: () => {
    pass.type = pass.type === 'password' ? 'text' : 'password';
    show.textContent = pass.type === 'password' ? 'Show' : 'Hide';
  } }, 'Show');
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const submit = h('button', { class: 'btn dark wide', type: 'submit' }, 'Log in');
  const heading = h('h2', {}, 'Welcome back');
  const lead = h('p', { class: 'auth-lead' }, 'Log in to pick up where you left off.');
  const swap = h('button', { class: 'link-btn', type: 'button' });
  const card = h('form', { class: 'auth-card', novalidate: true },
    heading, lead,
    h('label', { class: 'field', for: 'auth-user' }, h('span', {}, 'Username'), user),
    h('label', { class: 'field', for: 'auth-pass' }, h('span', {}, 'Password', ' ', show), pass),
    error, submit,
    h('p', { class: 'auth-swap' }, swap),
    h('p', { class: 'auth-note' }, 'Your data is saved in the data folder on this computer.'));

  function paint() {
    const login = mode === 'login';
    heading.textContent = login ? 'Welcome back' : 'Create your account';
    lead.textContent = login ? 'Log in to pick up where you left off.' : 'It takes ten seconds. No email needed.';
    submit.textContent = login ? 'Log in' : 'Create account';
    pass.autocomplete = login ? 'current-password' : 'new-password';
    swap.textContent = login ? 'New here? Create an account' : 'Already have an account? Log in';
    error.hidden = true;
  }
  swap.onclick = () => { mode = mode === 'login' ? 'register' : 'login'; paint(); user.focus(); };

  card.onsubmit = async e => {
    e.preventDefault();
    error.hidden = true;
    if (!user.value.trim() || !pass.value) {
      error.textContent = 'Enter a username and password.';
      error.hidden = false;
      return;
    }
    submit.disabled = true;
    try {
      await api.post(mode === 'login' ? 'login' : 'register', { username: user.value.trim(), password: pass.value });
      await boot();
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
      card.classList.remove('shake');
      void card.offsetWidth;
      card.classList.add('shake');
    } finally {
      submit.disabled = false;
    }
  };

  const art = h('section', { class: 'auth-art' },
    h('div', { class: 'brand light' }, logoMark(), h('span', {}, 'studyspace')),
    h('div', { class: 'auth-pitch' },
      h('h1', {}, 'Know what to study next.'),
      h('p', {}, 'Subjects, exams, attendance and flashcards in one place, with a plan that updates itself.')),
    svgFromString(`<svg class="auth-strokes" viewBox="0 0 600 400" aria-hidden="true" preserveAspectRatio="xMidYMax slice">
      <path class="s1" d="M-20 330 C120 220 230 380 380 240 S560 150 640 90"/>
      <path class="s2" d="M-20 250 C100 160 200 290 330 170 S520 90 640 20"/>
      <path class="s3" d="M-20 390 C140 320 260 400 420 320 S580 270 640 230"/></svg>`));
  authRoot.append(art, h('section', { class: 'auth-side' }, card));
  paint();
  user.focus();
}

function logoMark() {
  return svgFromString(`<svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><rect x="2" y="2" width="28" height="28" rx="9" fill="#FFE14D"/>
    <path d="M9 21c3-8 6-8 7-3s4 3 7-6" fill="none" stroke="#12153B" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
}

// =====================================================================
// App shell
// =====================================================================

function buildShell() {
  const settingsDialog = buildSettings();
  const openSettings = () => settingsDialog.open();

  views = [homeView(), planView(), focusView(openSettings), subjectsView(), examsView(), attendanceView(), timetableView(), gradesView(), cardsView(), notesView()];
  const main = h('main', { class: 'views', id: 'main' });
  for (const v of views) {
    v.section = h('section', { class: 'view', id: `view-${v.id}`, 'aria-label': v.title, hidden: true }, v.el);
    main.append(v.section);
  }

  // ---- sidebar
  navMarker = h('span', { class: 'nav-marker', 'aria-hidden': 'true' });
  const nav = h('nav', { class: 'nav', 'aria-label': 'Main' }, navMarker);
  for (const g of NAV) {
    nav.append(h('p', { class: 'nav-group' }, g.group));
    for (const [id, label, ic] of g.items) {
      const badge = h('span', { class: 'nav-badge', hidden: true });
      const link = h('a', { class: 'nav-link', href: `#/${id}` }, icon(ic, 20), h('span', {}, label), badge);
      link.badge = badge;
      navLinks.set(id, link);
      nav.append(link);
    }
  }
  cardsBadge = navLinks.get('cards').badge;
  streakText = h('span', {});
  const sidebar = h('aside', { class: 'sidebar', id: 'sidebar' },
    h('a', { class: 'brand', href: '#/home' }, logoMark(), h('span', {}, 'studyspace')),
    nav,
    h('div', { class: 'sidebar-foot' }, icon('flame', 20), streakText));

  // ---- top bar
  const menuBtn = h('button', { class: 'icon-btn menu-btn', type: 'button', 'aria-label': 'Open menu', onclick: () => document.body.classList.toggle('drawer-open') }, icon('menu', 22));
  const pillText = h('span', {});
  const pill = h('button', { class: 'timer-pill', type: 'button', hidden: true, title: 'Open the focus timer', onclick: () => go('focus') }, icon('focus', 16), pillText);

  const themeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Switch between light and dark', onclick: toggleTheme });
  function paintTheme() {
    themeBtn.replaceChildren(icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon', 20));
  }
  function toggleTheme() {
    const html = document.documentElement;
    html.classList.add('theme-anim');
    html.dataset.theme = html.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('studyspace.theme', html.dataset.theme); } catch { /* ignore */ }
    paintTheme();
    setTimeout(() => html.classList.remove('theme-anim'), 500);
  }
  paintTheme();

  const top = h('header', { class: 'topbar' }, menuBtn, buildSearch(), pill, themeBtn, buildUserMenu(openSettings));
  const scrim = h('div', { class: 'scrim', onclick: () => document.body.classList.remove('drawer-open') });

  appRoot.replaceChildren(sidebar, scrim, h('div', { class: 'main' }, top, main));

  // ---- timer pill + page title
  onTimer(t => {
    pill.hidden = !t.running;
    pillText.textContent = `${fmtClock(t.left)} ${t.mode === 'focus' ? 'focus' : 'break'}`;
    paintTitle();
  });

  addEventListener('hashchange', route);
  addEventListener('resize', () => moveMarker(navLinks.get(currentView && currentView.id)));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.body.classList.remove('drawer-open');
  });

  subscribe(updateAll);
  built = true;
}

function paintTitle() {
  const base = `${currentView ? currentView.title : 'Overview'} · Studyspace`;
  document.title = timer.running ? `${fmtClock(timer.left)} · ${base}` : base;
}

function moveMarker(link) {
  if (!link || !navMarker) return;
  navMarker.style.height = link.offsetHeight + 'px';
  navMarker.style.transform = `translateY(${link.offsetTop}px)`;
  navMarker.classList.add('ready');
}

function route() {
  const id = (location.hash.match(/^#\/(\w+)/) || [])[1];
  const view = views.find(v => v.id === id) || views[0];
  for (const v of views) {
    const on = v === view;
    v.section.hidden = !on;
    v.section.classList.toggle('active', on);
    v.el.classList.toggle('active', on);
  }
  for (const [vid, link] of navLinks) {
    link.classList.toggle('active', vid === view.id);
    if (vid === view.id) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  }
  currentView = view;
  moveMarker(navLinks.get(view.id));
  paintTitle();
  document.body.classList.remove('drawer-open');
  window.scrollTo({ top: 0 });
}

function updateAll() {
  for (const v of views) {
    try { v.update(); } catch (e) { console.error(`Could not draw "${v.id}"`, e); }
  }
  const due = S.dash.cards.due;
  cardsBadge.hidden = due === 0;
  cardsBadge.textContent = due;
  const s = S.dash.study.streak;
  streakText.textContent = s ? `${s} day streak` : 'No streak yet';
  avatar.textContent = (S.user || '?').charAt(0).toUpperCase();
  menuImport.hidden = !(legacyCount() > 0 && alreadyHandled(S.user));
}

// =====================================================================
// Search
// =====================================================================

function buildSearch() {
  const input = h('input', { class: 'search-input', type: 'search', placeholder: 'Search everything', autocomplete: 'off', 'aria-label': 'Search', role: 'combobox', 'aria-expanded': 'false', 'aria-controls': 'search-results' });
  const results = h('div', { class: 'search-results', id: 'search-results', role: 'listbox', hidden: true });
  const box = h('div', { class: 'search' }, icon('search', 18), input, h('kbd', {}, '/'), results);

  const close = () => { results.hidden = true; input.setAttribute('aria-expanded', 'false'); };
  const open = () => { results.hidden = false; input.setAttribute('aria-expanded', 'true'); };

  function render(list) {
    results.replaceChildren();
    if (!list.length) {
      results.append(h('p', { class: 'search-empty' }, 'Nothing found. Try another word.'));
      return;
    }
    for (const r of list) {
      results.append(h('button', { class: 'result', type: 'button', role: 'option', onclick: () => {
        go(SEARCH_VIEW[r.view] || r.view);
        input.value = '';
        close();
      } }, h('span', { class: 'chip' }, r.type), h('span', { class: 'result-text' }, h('strong', {}, r.title), r.detail && h('small', {}, r.detail))));
    }
  }

  const run = debounce(async () => {
    const q = input.value.trim();
    if (!q) { close(); return; }
    try {
      const list = await api.get('search?q=' + encodeURIComponent(q));
      if (input.value.trim() !== q) return; // a newer search is already on its way
      render(list);
      open();
    } catch { /* ignore search errors */ }
  }, 180);

  input.addEventListener('input', run);
  input.addEventListener('keydown', e => {
    const items = [...results.querySelectorAll('.result')];
    const at = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); (items[at + 1] || items[0])?.focus(); }
    else if (e.key === 'Escape') { input.value = ''; close(); input.blur(); }
    else if (e.key === 'Enter' && items[0]) { e.preventDefault(); items[0].click(); }
  });
  results.addEventListener('keydown', e => {
    const items = [...results.querySelectorAll('.result')];
    const at = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); (items[at + 1] || items[0]).focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (at > 0 ? items[at - 1] : input).focus(); }
    else if (e.key === 'Escape') { close(); input.focus(); }
  });
  document.addEventListener('click', e => { if (!box.contains(e.target)) close(); });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      e.preventDefault();
      input.focus();
    }
  });
  return box;
}

// =====================================================================
// User menu and settings
// =====================================================================

function buildUserMenu(openSettings) {
  avatar = h('span', { class: 'avatar' });
  const btn = h('button', { class: 'avatar-btn', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Account menu' }, avatar);
  const name = h('p', { class: 'menu-name' });
  menuImport = h('button', { class: 'menu-item', type: 'button', role: 'menuitem', hidden: true, onclick: async () => { close(); if (await importLegacy(S.user)) await refresh(); } }, icon('upload', 18), 'Import from the old version');
  const menu = h('div', { class: 'menu', role: 'menu', hidden: true },
    name,
    h('button', { class: 'menu-item', type: 'button', role: 'menuitem', onclick: () => { close(); openSettings(); } }, icon('settings', 18), 'Settings'),
    h('a', { class: 'menu-item', role: 'menuitem', href: '/api/export', download: 'studyspace-backup.json' }, icon('download', 18), 'Download a backup'),
    h('a', { class: 'menu-item', role: 'menuitem', href: '/api/export?format=csv', download: 'attendance.csv' }, icon('download', 18), 'Download attendance (CSV)'),
    menuImport,
    h('button', { class: 'menu-item', type: 'button', role: 'menuitem', onclick: async () => { try { await api.post('logout'); } catch { /* ignore */ } location.reload(); } }, icon('logout', 18), 'Log out'));
  const box = h('div', { class: 'user' }, btn, menu);
  function close() { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
  btn.onclick = () => {
    name.textContent = `Signed in as ${S.user}`;
    menu.hidden = !menu.hidden;
    btn.setAttribute('aria-expanded', String(!menu.hidden));
  };
  document.addEventListener('click', e => { if (!box.contains(e.target)) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  return box;
}

function buildSettings() {
  const num = (id, label, min, max, step = 1) => {
    const input = h('input', { class: 'input', id, type: 'number', min, max, step, required: true });
    return { input, el: h('label', { class: 'field', for: id }, h('span', {}, label), input) };
  };
  const focus = num('set-focus', 'Focus session (minutes)', 1, 180);
  const pause = num('set-pause', 'Break (minutes)', 1, 60);
  const goal = num('set-goal', 'Daily focus goal (minutes)', 15, 600, 5);
  const target = num('set-target', 'Attendance target (%)', 50, 95);
  const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const dialog = h('dialog', { class: 'dialog', 'aria-labelledby': 'settings-title' });
  const form = h('form', { method: 'dialog', onsubmit: async e => {
    e.preventDefault();
    const ok = await act(() => api.put('settings', {
      focus: +focus.input.value, pause: +pause.input.value, goal: +goal.input.value, target: +target.input.value,
    }), { success: 'Settings saved.' });
    if (ok) { syncSettings(); dialog.close(); }
  } },
  h('div', { class: 'dialog-head' }, h('h2', { id: 'settings-title' }, 'Settings'),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => dialog.close() }, icon('x', 20))),
  h('div', { class: 'dialog-grid' }, focus.el, pause.el, goal.el, target.el), err,
  h('div', { class: 'dialog-actions' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => dialog.close() }, 'Cancel'), h('button', { class: 'btn dark', type: 'submit' }, 'Save settings')));
  dialog.append(form);
  document.body.append(dialog);
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  return {
    open() {
      const s = settings();
      focus.input.value = s.focus; pause.input.value = s.pause; goal.input.value = s.goal; target.input.value = s.target;
      dialog.showModal();
    },
  };
}

// =====================================================================
// Boot
// =====================================================================

function reminders() {
  const sent = new Set();
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  setInterval(() => {
    if (!S.data) return;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    for (const ev of S.data.events) {
      if (ev.day !== names[now.getDay()]) continue;
      const [hh, mm] = ev.time.split(':').map(Number);
      if (hh * 60 + mm - 5 !== nowMin) continue;
      const key = `${ev.id}-${localDate(now)}`;
      if (sent.has(key)) continue;
      sent.add(key);
      toast(`${ev.title} starts in 5 minutes.`);
      try {
        if ('Notification' in window && Notification.permission === 'granted') new Notification(`${ev.title} starts in 5 minutes`, { body: `${ev.day} at ${ev.time}` });
      } catch { /* ignore */ }
    }
  }, 20000);
}

let lastSync = Date.now();
function keepFresh() {
  // A new day starts, or you come back to the tab: reload so everything is current.
  setInterval(() => { if (S.data && localDate() !== S.today) refresh().catch(() => {}); }, 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && S.data && Date.now() - lastSync > 5000) {
      lastSync = Date.now();
      refresh().catch(() => {});
    }
  });
}

async function boot() {
  try {
    await refresh();
  } catch (e) {
    if (e.status === 401) { showAuth(); return; }
    authRoot.hidden = true;
    appRoot.hidden = false;
    appRoot.replaceChildren(h('div', { class: 'fatal' }, h('h1', {}, 'Studyspace can’t load'), h('p', {}, e.message),
      h('button', { class: 'btn dark', type: 'button', onclick: () => location.reload() }, 'Try again')));
    return;
  }
  authRoot.hidden = true;
  appRoot.hidden = false;
  if (!built) {
    buildShell();
    reminders();
    keepFresh();
  }
  restore();
  updateAll();
  route();
  document.body.classList.add('booting');
  setTimeout(() => document.body.classList.remove('booting'), 2200);
  requestAnimationFrame(() => moveMarker(navLinks.get(currentView.id)));
}

boot();
