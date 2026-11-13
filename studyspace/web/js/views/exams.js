// Exam countdowns and assignment deadlines.

import { h, icon, marker, fmtLong, daysFrom } from '../util.js';
import { panel, checkbox, deleteButton, emptyState, reconcile, syncSelect, chip } from '../ui.js';
import { S, act, subjects, subjectById } from '../state.js';
import { api } from '../api.js';

export function examsView() {
  // ---------------------------------------------------------------- exams
  const examName = h('input', { class: 'input grow', type: 'text', maxLength: 50, placeholder: 'Exam, e.g. Biology midterm', required: true, autocomplete: 'off', 'aria-label': 'Exam name' });
  const examDate = h('input', { class: 'input', type: 'date', required: true, 'aria-label': 'Exam date' });
  const examSubject = h('select', { class: 'input', 'aria-label': 'Subject for this exam' });
  const examForm = h('form', { class: 'add-row', onsubmit: async e => {
    e.preventDefault();
    if (!examName.value.trim() || !examDate.value) return;
    const ok = await act(() => api.post('exams', { name: examName.value.trim(), date: examDate.value, subjectId: examSubject.value }), { success: 'Exam added.' });
    if (ok) { examName.value = ''; examDate.value = ''; }
  } }, examName, examSubject, examDate, h('button', { class: 'btn dark', type: 'submit' }, icon('plus', 16), 'Add'));
  const examList = h('div', { class: 'list' });
  const examEmpty = emptyState('No exams yet', 'Add one and watch the days count down. Link it to a subject to sharpen your study plan.');

  function makeExam() {
    let item;
    const num = h('span', { class: 'count-num' });
    const unit = h('span', { class: 'count-unit' });
    const name = h('span', { class: 'row-title' });
    const meta = h('div', { class: 'row-meta' });
    const el = h('div', { class: 'row exam-row' }, h('div', { class: 'countdown' }, num, unit),
      h('div', { class: 'row-main' }, name, meta), deleteButton('Delete exam', () => act(() => api.del('exams/' + item.id))));
    el.update = x => {
      item = x;
      const d = daysFrom(x.date, S.today);
      el.classList.toggle('past', d < 0);
      el.classList.toggle('hot', d >= 0 && d <= 3);
      num.textContent = d < 0 ? '✓' : d;
      unit.textContent = d < 0 ? 'done' : d === 1 ? 'day' : 'days';
      name.textContent = x.name;
      meta.replaceChildren(h('span', { class: 'row-sub' }, fmtLong(x.date)));
      const sj = subjectById(x.subjectId);
      if (sj) meta.append(chip(sj.name, marker(sj.color)));
    };
    return el;
  }

  // ---------------------------------------------------------------- assignments
  const asgName = h('input', { class: 'input grow', type: 'text', maxLength: 70, placeholder: 'Assignment title', required: true, autocomplete: 'off', 'aria-label': 'Assignment title' });
  const asgDue = h('input', { class: 'input', type: 'date', required: true, 'aria-label': 'Due date' });
  const asgForm = h('form', { class: 'add-row', onsubmit: async e => {
    e.preventDefault();
    if (!asgName.value.trim() || !asgDue.value) return;
    const ok = await act(() => api.post('assignments', { name: asgName.value.trim(), due: asgDue.value }), { success: 'Assignment added.' });
    if (ok) { asgName.value = ''; asgDue.value = ''; }
  } }, asgName, asgDue, h('button', { class: 'btn dark', type: 'submit' }, icon('plus', 16), 'Add'));
  const asgList = h('div', { class: 'list' });
  const asgEmpty = emptyState('No assignments yet', 'Add a due date and tick it off when you submit.');

  function makeAssignment() {
    let item;
    const cb = checkbox('Mark assignment submitted', on => act(() => api.put('assignments/' + item.id, { done: on })));
    const name = h('span', { class: 'row-title' });
    const sub = h('span', { class: 'row-sub' });
    const badge = h('span', { class: 'badge' });
    const el = h('div', { class: 'row' }, cb, h('div', { class: 'row-main' }, name, sub), badge,
      deleteButton('Delete assignment', () => act(() => api.del('assignments/' + item.id))));
    el.update = a => {
      item = a;
      cb.set(a.done);
      el.classList.toggle('done', !!a.done);
      name.textContent = a.name;
      const d = daysFrom(a.due, S.today);
      sub.textContent = `Due ${fmtLong(a.due)}`;
      badge.hidden = !!a.done;
      badge.textContent = d < 0 ? `${-d} day${d === -1 ? '' : 's'} overdue` : d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `${d} days`;
      badge.className = `badge ${d < 0 || d <= 2 ? 'hot' : d <= 7 ? 'warm' : 'calm'}`;
    };
    return el;
  }

  const examPanel = panel({ title: 'Exam countdown', cls: 'span-6' }, examForm, examList, examEmpty);
  const asgPanel = panel({ title: 'Assignments', cls: 'span-6' }, asgForm, asgList, asgEmpty);
  const el = h('div', { class: 'view-inner' },
    h('div', { class: 'page-head' }, h('h1', {}, 'Exams & deadlines'), h('p', {}, 'Dates you can’t miss, all in one place.')),
    h('div', { class: 'grid' }, examPanel, asgPanel));

  function update() {
    syncSelect(examSubject, subjects().map(s => ({ value: s.id, label: s.name })), 'No subject');
    const exams = [...S.data.exams].sort((a, b) => {
      const pa = a.date < S.today, pb = b.date < S.today;
      return (pa - pb) || a.date.localeCompare(b.date);
    });
    reconcile(examList, exams, x => x.id, makeExam);
    examEmpty.hidden = exams.length > 0;

    const asg = [...S.data.assignments].sort((a, b) => (a.done - b.done) || a.due.localeCompare(b.due));
    reconcile(asgList, asg, a => a.id, makeAssignment);
    asgEmpty.hidden = asg.length > 0;
  }
  return { id: 'exams', title: 'Exams & deadlines', el, update };
}
