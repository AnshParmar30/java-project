// Study plan: the Java planner's ranked list of what to study and how fast.

import { h, icon, go, marker, countTo } from '../util.js';
import { panel, bar, reconcile, emptyState } from '../ui.js';
import { S } from '../state.js';
import { startFocus } from '../timer.js';

const URGENCY = { high: 'Study first', medium: 'Keep moving', low: 'On track' };

export function planView() {
  const pct = h('span', { class: 'big-num' });
  const sumText = h('p', { class: 'sum-text' });
  const sumBar = bar('var(--mint)');
  const summary = h('section', { class: 'panel summary' },
    h('div', { class: 'summary-num' }, pct, h('span', { class: 'unit' }, '% of syllabus done')),
    sumBar.el, sumText);

  const list = h('div', { class: 'plan-list' });
  const empty = emptyState('Nothing to plan yet',
    'Add subjects with topics, then give your exams a date. The plan ranks what to study first.',
    h('button', { class: 'btn dark small', type: 'button', onclick: () => go('subjects') }, 'Add subjects'));

  function makeCard() {
    let item;
    const subject = h('h3', { class: 'plan-subject' });
    const tag = h('span', { class: 'tag' });
    const next = h('p', { class: 'plan-next' });
    const msg = h('p', { class: 'plan-msg' });
    const progress = bar();
    const count = h('span', { class: 'plan-count' });
    const go1 = h('button', { class: 'btn dark small', type: 'button', onclick: () => startFocus(item.subject) }, icon('play', 14), 'Study this');
    const el = h('article', { class: 'plan-card' },
      h('div', { class: 'plan-top' }, subject, tag),
      next, msg, h('div', { class: 'plan-bottom' }, h('div', { class: 'plan-progress' }, progress.el, count), go1));
    el.update = p => {
      item = p;
      el.style.setProperty('--c', marker(p.color));
      subject.textContent = p.subject;
      tag.textContent = URGENCY[p.urgency];
      tag.className = `tag ${p.urgency}`;
      next.textContent = `Next topic: ${p.nextTopic}`;
      msg.textContent = p.message;
      progress.set(((p.total - p.remaining) / p.total) * 100, marker(p.color));
      count.textContent = `${p.total - p.remaining}/${p.total} topics`;
    };
    return el;
  }

  const el = h('div', { class: 'view-inner' },
    h('div', { class: 'page-head' }, h('h1', {}, 'Study plan'), h('p', {}, 'Ranked by how soon the exam is and how much is left.')),
    summary, list, empty);

  function update() {
    const d = S.dash;
    countTo(pct, d.syllabus.pct);
    sumBar.set(d.syllabus.pct);
    const left = d.syllabus.total - d.syllabus.done;
    sumText.textContent = d.syllabus.total
      ? `${d.syllabus.done} of ${d.syllabus.total} topics finished. ${left} to go.`
      : 'Add topics to your subjects to see progress here.';
    reconcile(list, d.planner, p => p.subjectId, makeCard);
    empty.hidden = d.planner.length > 0;
    summary.hidden = d.syllabus.total === 0;
  }

  return { id: 'plan', title: 'Study plan', el, update };
}
