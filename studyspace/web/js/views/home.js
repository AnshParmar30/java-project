// Overview: what to study next, today's numbers, tasks and what's coming up.

import { h, icon, countTo, go, whenLabel, marker, toast, burst, shower, svgFromString } from '../util.js';
import { panel, bar, checkbox, deleteButton, emptyState, chip, reconcile, syncSelect, armDelete } from '../ui.js';
import { S, act, subjects, refresh } from '../state.js';
import { api } from '../api.js';
import { startFocus } from '../timer.js';
import { legacyCount, alreadyHandled, markHandled, importLegacy } from '../legacy.js';

const DECO = `<svg class="hero-deco" viewBox="0 0 520 320" aria-hidden="true" preserveAspectRatio="xMaxYMid slice">
  <path d="M30 270 C150 170 250 300 400 150 S500 120 520 60"/><path d="M10 200 C120 110 220 230 330 110"/></svg>`;

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

export function homeView() {
  // ------------------------------------------------------------ migration banner
  const banner = h('div', { class: 'banner', hidden: true },
    icon('upload', 22),
    h('div', { class: 'banner-text' },
      h('strong', {}, 'Found data from the old version'),
      h('p', {}, 'Your earlier tasks, subjects and attendance are still saved in this browser.')),
    h('button', { class: 'btn dark small', type: 'button', onclick: async () => { if (await importLegacy(S.user)) await refresh(); } }, 'Import it'),
    h('button', { class: 'btn ghost small', type: 'button', onclick: () => { markHandled(S.user); banner.hidden = true; } }, 'Not now'));

  // ------------------------------------------------------------ hero
  const heroGreet = h('p', { class: 'hero-greet' });
  const heroTitle = h('h1', { class: 'hero-title' });
  const heroLine = h('p', { class: 'hero-line' });
  const heroChips = h('div', { class: 'hero-chips' });
  const heroPrimary = h('button', { class: 'btn dark', type: 'button' });
  const heroSecondary = h('button', { class: 'btn ghost-dark', type: 'button' });
  const hero = h('section', { class: 'hero' }, svgFromString(DECO), heroGreet, heroTitle, heroLine, heroChips,
    h('div', { class: 'hero-actions' }, heroPrimary, heroSecondary));

  // ------------------------------------------------------------ level card
  const lvlNum = h('span', { class: 'lvl-num' });
  const lvlTitle = h('strong', { class: 'lvl-title' });
  const xpText = h('span', { class: 'lvl-xp' });
  const xpBar = bar('var(--yellow)');
  const weekText = h('p', { class: 'lvl-week' });
  const level = h('aside', { class: 'level-card' },
    h('div', { class: 'lvl-top' }, h('div', { class: 'lvl-badge' }, lvlNum), h('div', {}, lvlTitle, xpText)),
    xpBar.el, weekText);

  // ------------------------------------------------------------ stat tiles
  function tile(color, label) {
    const value = h('span', { class: 'tile-value' });
    const unit = h('span', { class: 'tile-unit' });
    const sub = h('p', { class: 'tile-sub' });
    const extra = h('div', { class: 'tile-extra' });
    const el = h('article', { class: 'tile', style: { '--tile': `var(--${color})` } },
      h('p', { class: 'tile-label' }, label), h('div', { class: 'tile-num' }, value, unit), extra, sub);
    return { el, value, unit, sub, extra };
  }
  const tTasks = tile('pink', 'Open tasks');
  const tFocus = tile('mint', 'Focused today');
  const tAtt = tile('sky', 'Attendance');
  const tStreak = tile('orange', 'Study streak');
  const goalBar = bar('var(--on-marker)');
  tFocus.extra.append(goalBar.el);
  const tiles = h('div', { class: 'tiles' }, tTasks.el, tFocus.el, tAtt.el, tStreak.el);
  [...tiles.children].forEach((t, i) => t.style.setProperty('--i', i));

  // ------------------------------------------------------------ tasks
  const taskInput = h('input', { class: 'input grow', type: 'text', maxLength: 100, placeholder: 'Add a task, e.g. Revise chapter 4', autocomplete: 'off', 'aria-label': 'Task title' });
  const taskSubject = h('select', { class: 'input', 'aria-label': 'Subject' });
  const taskMinutes = h('select', { class: 'input', 'aria-label': 'Time estimate' },
    ...[[15, '15 min'], [25, '25 min'], [45, '45 min'], [60, '1 hour'], [90, '1.5 hours']].map(([v, l]) => h('option', { value: v, selected: v === 25 }, l)));
  const taskPriority = h('select', { class: 'input', 'aria-label': 'Priority' },
    h('option', { value: 'high' }, 'High'), h('option', { value: 'medium', selected: true }, 'Medium'), h('option', { value: 'low' }, 'Low'));
  const taskForm = h('form', { class: 'add-row', onsubmit: async e => {
    e.preventDefault();
    const title = taskInput.value.trim();
    if (!title) { taskInput.focus(); return; }
    const ok = await act(() => api.post('tasks', { title, subject: taskSubject.value, minutes: +taskMinutes.value, priority: taskPriority.value }));
    if (ok) { taskInput.value = ''; taskInput.focus(); }
  } }, taskInput, taskSubject, taskMinutes, taskPriority, h('button', { class: 'btn dark', type: 'submit' }, icon('plus', 16), 'Add'));
  const taskList = h('div', { class: 'list' });
  const taskEmpty = emptyState('Nothing on your list yet', 'Add the first thing you want to finish today.');
  const taskFoot = h('div', { class: 'panel-foot' });
  const clearBtn = h('button', { class: 'btn ghost small', type: 'button' }, 'Clear completed');
  armDelete(clearBtn, async () => { await act(async () => {
    for (const t of S.data.tasks.filter(x => x.done)) await api.del('tasks/' + t.id);
  }, { success: 'Completed tasks cleared.' }); });
  const plannedText = h('span', {});
  taskFoot.append(plannedText, clearBtn);
  const tasksPanel = panel({ title: 'Today’s tasks' }, taskForm, taskList, taskEmpty, taskFoot);
  tasksPanel.classList.add('span-7');

  function makeTask() {
    let item;
    const cb = checkbox('Mark task done', async (on, ev) => {
      if (on) {
        const r = ev.currentTarget.getBoundingClientRect();
        burst(r.x + r.width / 2, r.y + r.height / 2, 26, 0.7);
      }
      await act(() => api.put('tasks/' + item.id, { done: on }));
      if (on && S.dash.tasks.total > 0 && S.dash.tasks.open === 0) {
        shower(100);
        toast('Everything on your list is done. Nice work.', 'ok');
      }
    });
    const title = h('span', { class: 'row-title' });
    const subject = h('span', {});
    const minutes = h('span', { class: 'chip' });
    const dot = h('span', { class: 'prio', title: '' });
    const el = h('div', { class: 'row task-row' }, cb, dot, h('div', { class: 'row-main' }, title, h('div', { class: 'row-meta' }, subject, minutes)),
      deleteButton('Delete task', () => act(() => api.del('tasks/' + item.id))));
    el.update = t => {
      item = t;
      cb.set(t.done);
      el.classList.toggle('done', !!t.done);
      title.textContent = t.title;
      dot.className = `prio ${t.priority}`;
      dot.title = `${t.priority} priority`;
      const sj = subjects().find(s => s.name === t.subject);
      subject.className = sj ? 'chip colored' : 'chip';
      subject.style.setProperty('--c', sj ? marker(sj.color) : '');
      subject.textContent = t.subject || 'No subject';
      subject.hidden = !t.subject;
      minutes.textContent = `${t.minutes} min`;
    };
    return el;
  }

  // ------------------------------------------------------------ coming up
  const upList = h('div', { class: 'list' });
  const upEmpty = emptyState('No deadlines yet', 'Add an exam or assignment to see it counting down here.',
    h('button', { class: 'btn ghost small', type: 'button', onclick: () => go('exams') }, 'Add a deadline'));
  const upPanel = panel({ title: 'Coming up', actions: h('button', { class: 'btn ghost small', type: 'button', onclick: () => go('exams') }, 'See all') }, upList, upEmpty);
  function makeUp() {
    const name = h('span', { class: 'row-title' });
    const meta = h('span', { class: 'row-sub' });
    const badge = h('span', { class: 'badge' });
    const ic = h('span', { class: 'row-icon' });
    const el = h('div', { class: 'row' }, ic, h('div', { class: 'row-main' }, name, meta), badge);
    el.update = u => {
      ic.replaceChildren(icon(u.type === 'exam' ? 'exams' : 'check', 18));
      name.textContent = u.name;
      meta.textContent = `${u.type === 'exam' ? 'Exam' : 'Assignment'} · ${new Date(u.date + 'T00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}`;
      badge.textContent = whenLabel(u.days);
      badge.className = `badge ${u.overdue || u.days <= 2 ? 'hot' : u.days <= 7 ? 'warm' : 'calm'}`;
    };
    return el;
  }
  const tip = h('div', { class: 'tip' }, icon('bulb', 20), h('div', {}, h('strong', {}, 'Study tip'), h('p', { id: 'tip-text' })));
  const side = h('div', { class: 'stack span-5' }, upPanel, tip);

  // ------------------------------------------------------------ assemble
  const el = h('div', { class: 'view-inner' },
    banner,
    h('div', { class: 'grid hero-row' }, h('div', { class: 'span-8' }, hero), h('div', { class: 'span-4' }, level)),
    tiles,
    h('div', { class: 'grid' }, tasksPanel, side));

  function renderHero(d) {
    const hr = new Date().getHours();
    heroGreet.textContent = `${hr < 5 ? 'Up late' : hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening'}, ${S.user}`;
    heroChips.replaceChildren();
    const top = d.planner[0];
    const hasSubjects = subjects().length > 0;
    heroSecondary.hidden = false;
    if (top) {
      hero.style.setProperty('--hero', marker(top.color));
      heroTitle.textContent = top.subject;
      heroLine.textContent = `Next up: ${top.nextTopic}. ${top.message}`;
      if (top.daysToExam !== null) heroChips.append(h('span', { class: 'hero-chip' }, `Exam ${top.daysToExam === 0 ? 'today' : top.daysToExam === 1 ? 'tomorrow' : `in ${top.daysToExam} days`}`));
      heroChips.append(h('span', { class: 'hero-chip' }, `${top.remaining} of ${top.total} topics left`));
      heroPrimary.replaceChildren(icon('play', 16), 'Start focus');
      heroPrimary.onclick = () => startFocus(top.subject);
      heroSecondary.textContent = 'See full plan';
      heroSecondary.onclick = () => go('plan');
    } else if (!hasSubjects) {
      hero.style.setProperty('--hero', 'var(--yellow)');
      heroTitle.textContent = 'Start with your subjects';
      heroLine.textContent = 'Add subjects, topics and exam dates. This space turns them into a daily plan.';
      heroPrimary.replaceChildren(icon('plus', 16), 'Add a subject');
      heroPrimary.onclick = () => go('subjects');
      heroSecondary.hidden = true;
    } else if (d.syllabus.total > 0) {
      hero.style.setProperty('--hero', 'var(--mint)');
      heroTitle.textContent = 'Syllabus complete';
      heroLine.textContent = 'Every topic is ticked off. Flashcards will keep it fresh.';
      heroPrimary.replaceChildren(icon('play', 16), 'Start focus');
      heroPrimary.onclick = () => startFocus('');
      heroSecondary.textContent = 'Review flashcards';
      heroSecondary.onclick = () => go('cards');
    } else {
      hero.style.setProperty('--hero', 'var(--sky)');
      heroTitle.textContent = 'Add topics to your subjects';
      heroLine.textContent = 'List the chapters you need to cover and the planner will tell you what to study first.';
      heroPrimary.replaceChildren(icon('plus', 16), 'Add topics');
      heroPrimary.onclick = () => go('subjects');
      heroSecondary.textContent = 'Start a focus session';
      heroSecondary.onclick = () => startFocus('');
    }
  }

  function update() {
    const d = S.dash;
    banner.hidden = !(S.user && !alreadyHandled(S.user) && legacyCount() > 0);
    renderHero(d);

    // level
    lvlNum.textContent = d.level.level;
    lvlTitle.textContent = d.level.title;
    xpText.textContent = `${d.level.xp - d.level.floor} / ${d.level.next - d.level.floor} XP to level ${d.level.level + 1}`;
    xpBar.set(d.level.pct);
    const { weekTotal, lastWeekTotal } = d.study;
    weekText.textContent = lastWeekTotal > 0
      ? `${weekTotal} min this week, ${weekTotal >= lastWeekTotal ? '+' : ''}${Math.round((weekTotal - lastWeekTotal) * 100 / lastWeekTotal)}% vs last week`
      : `${weekTotal} min focused this week`;

    // tiles
    countTo(tTasks.value, d.tasks.open);
    tTasks.sub.textContent = d.tasks.total ? `${d.tasks.done} of ${d.tasks.total} done` : 'Add your first task';
    countTo(tFocus.value, d.study.todayMinutes);
    tFocus.unit.textContent = ' min';
    goalBar.set(d.study.goalPct);
    tFocus.sub.textContent = `${d.study.goalPct}% of your ${d.study.goal} min goal`;
    const pct = d.attendance.overall.pct;
    if (pct === null) { tAtt.value.textContent = '—'; tAtt.value._val = 0; tAtt.unit.textContent = ''; tAtt.sub.textContent = 'Mark a class to start'; }
    else {
      countTo(tAtt.value, pct, { decimals: Number.isInteger(pct) ? 0 : 1 });
      tAtt.unit.textContent = '%';
      const below = d.attendance.subjects.filter(s => s.status === 'danger').length;
      tAtt.sub.textContent = below ? `${below} subject${below === 1 ? '' : 's'} below ${d.attendance.target}%` : `On track for ${d.attendance.target}%`;
    }
    countTo(tStreak.value, d.study.streak);
    tStreak.unit.textContent = d.study.streak === 1 ? ' day' : ' days';
    tStreak.sub.textContent = d.study.streakAtRisk ? 'Study today to keep it going'
      : d.study.longestStreak > 0 ? `Best: ${d.study.longestStreak} day${d.study.longestStreak === 1 ? '' : 's'}` : 'Finish a focus session to start';

    // tasks
    syncSelect(taskSubject, subjects().map(s => ({ value: s.name, label: s.name })), 'No subject');
    const tasks = [...S.data.tasks].sort((a, b) =>
      (a.done - b.done) || (PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]) || (a.created - b.created));
    reconcile(taskList, tasks, t => t.id, makeTask);
    taskEmpty.hidden = tasks.length > 0;
    taskFoot.hidden = tasks.length === 0;
    clearBtn.hidden = d.tasks.done === 0;
    plannedText.textContent = d.tasks.open ? `${d.tasks.openMinutes} min planned` : 'All clear';

    // upcoming
    reconcile(upList, d.upcoming, u => `${u.type}-${u.id}`, makeUp);
    upEmpty.hidden = d.upcoming.length > 0;
    document.getElementById('tip-text').textContent = d.tip;
  }

  return { id: 'home', title: 'Overview', el, update };
}
