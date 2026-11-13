// Grades and CGPA (10-point scale). The maths happens in Java.

import { h, icon, countTo } from '../util.js';
import { panel, deleteButton, emptyState, reconcile } from '../ui.js';
import { S, act } from '../state.js';
import { api } from '../api.js';

const LETTERS = { 10: 'O', 9: 'A+', 8: 'A', 7: 'B+', 6: 'B', 5: 'C', 4: 'P', 0: 'F' };

export function gradesView() {
  const cgpa = h('span', { class: 'big-num' });
  const cgpaNote = h('p', { class: 'sum-text' });
  const hero = h('section', { class: 'panel cgpa' },
    h('div', {}, h('p', { class: 'cgpa-label' }, 'Your CGPA'), h('div', { class: 'summary-num' }, cgpa, h('span', { class: 'unit' }, '/ 10'))), cgpaNote);

  const name = h('input', { class: 'input grow', type: 'text', maxLength: 60, placeholder: 'Course, e.g. Engineering Physics', required: true, autocomplete: 'off', 'aria-label': 'Course name' });
  const credits = h('select', { class: 'input', 'aria-label': 'Credits' }, ...[1, 2, 3, 4, 5, 6].map(c => h('option', { value: c, selected: c === 3 }, `${c} credit${c === 1 ? '' : 's'}`)));
  const point = h('select', { class: 'input', 'aria-label': 'Grade point' },
    ...[10, 9, 8, 7, 6, 5, 4, 0].map(p => h('option', { value: p, selected: p === 9 }, `${p} (${LETTERS[p]})`)));
  const sem = h('select', { class: 'input', 'aria-label': 'Semester' }, ...[1, 2, 3, 4, 5, 6, 7, 8].map(s => h('option', { value: s }, `Semester ${s}`)));
  const form = h('form', { class: 'add-row', onsubmit: async e => {
    e.preventDefault();
    if (!name.value.trim()) return;
    const ok = await act(() => api.post('grades', { name: name.value.trim(), credits: +credits.value, gradePoint: +point.value, semester: +sem.value }), { success: 'Course added.' });
    if (ok) { name.value = ''; name.focus(); }
  } }, name, credits, point, sem, h('button', { class: 'btn dark', type: 'submit' }, icon('plus', 16), 'Add'));

  const groups = h('div', { class: 'stack' });
  const empty = emptyState('No courses yet', 'Add a course with its credits and grade point to see your CGPA.');
  const formPanel = panel({ title: 'Add a course', sub: 'Grade point is on a 10-point scale: O = 10, A+ = 9, A = 8, B+ = 7, B = 6, C = 5, P = 4.' }, form);

  function makeGroup() {
    let semester;
    const title = h('h3', {});
    const sgpa = h('span', { class: 'badge calm' });
    const list = h('div', { class: 'list' });
    const el = h('section', { class: 'panel' }, h('header', { class: 'panel-head' }, title, sgpa), list);
    el.update = g => {
      semester = g.semester;
      title.textContent = `Semester ${g.semester}`;
      sgpa.textContent = `SGPA ${g.sgpa.toFixed(2)} · ${g.credits} credits`;
      reconcile(list, S.data.grades.filter(c => (c.semester || 1) === semester).sort((a, b) => a.created - b.created), c => c.id, makeCourse);
    };
    return el;
  }

  function makeCourse() {
    let item;
    const n = h('span', { class: 'row-title' });
    const meta = h('span', { class: 'row-sub' });
    const badge = h('span', { class: 'badge' });
    const el = h('div', { class: 'row' }, h('div', { class: 'row-main' }, n, meta), badge,
      deleteButton('Delete course', () => act(() => api.del('grades/' + item.id))));
    el.update = c => {
      item = c;
      n.textContent = c.name;
      meta.textContent = `${c.credits} credit${c.credits === 1 ? '' : 's'}`;
      badge.textContent = `${c.gradePoint}${LETTERS[c.gradePoint] ? ' · ' + LETTERS[c.gradePoint] : ''}`;
      badge.className = `badge ${c.gradePoint >= 8 ? 'calm' : c.gradePoint >= 6 ? 'warm' : 'hot'}`;
    };
    return el;
  }

  const el = h('div', { class: 'view-inner' },
    h('div', { class: 'page-head' }, h('h1', {}, 'Grades'), h('p', {}, 'Add your courses and watch your CGPA update.')),
    hero, formPanel, groups, empty);

  function update() {
    const g = S.dash.grades;
    hero.hidden = g.cgpa === null;
    if (g.cgpa !== null) {
      countTo(cgpa, g.cgpa, { decimals: 2 });
      cgpaNote.textContent = `${g.credits} credits across ${g.semesters.length} semester${g.semesters.length === 1 ? '' : 's'}.`;
    } else {
      cgpa._val = 0;
    }
    reconcile(groups, g.semesters, s => 'sem-' + s.semester, makeGroup);
    empty.hidden = g.semesters.length > 0;
  }
  return { id: 'grades', title: 'Grades', el, update };
}
