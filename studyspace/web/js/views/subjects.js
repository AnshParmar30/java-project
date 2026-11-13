// Subjects and their syllabus topics.

import { h, icon, marker } from '../util.js';
import { bar, checkbox, deleteButton, emptyState, reconcile, armDelete } from '../ui.js';
import { S, act, subjects } from '../state.js';
import { api } from '../api.js';

export function subjectsView() {
  const nameInput = h('input', { class: 'input', type: 'text', maxLength: 40, placeholder: 'Subject, e.g. Biology', required: true, autocomplete: 'off', 'aria-label': 'Subject name' });
  const topicsInput = h('input', { class: 'input grow', type: 'text', maxLength: 600, placeholder: 'Topics, separated by commas (optional)', autocomplete: 'off', 'aria-label': 'Topics' });
  const form = h('form', { class: 'add-row panel flat', onsubmit: async e => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    const topics = topicsInput.value.split(',').map(t => t.trim()).filter(Boolean).map(t => ({ name: t }));
    const ok = await act(() => api.post('subjects', { name, topics }), { success: `${name} added.` });
    if (ok) { nameInput.value = ''; topicsInput.value = ''; nameInput.focus(); }
  } }, nameInput, topicsInput, h('button', { class: 'btn dark', type: 'submit' }, icon('plus', 16), 'Add subject'));

  const grid = h('div', { class: 'cards-grid' });
  const empty = emptyState('No subjects yet', 'Add your first subject above, then list its chapters to track your syllabus.');

  function makeSubject() {
    let item;
    const name = h('h3', { class: 'subject-name' });
    const count = h('span', { class: 'subject-count' });
    const progress = bar();
    const topicList = h('div', { class: 'list tight' });
    const addInput = h('input', { class: 'input small', type: 'text', maxLength: 80, placeholder: 'Add a topic', autocomplete: 'off', 'aria-label': 'New topic' });
    const addForm = h('form', { class: 'add-row mini', onsubmit: async e => {
      e.preventDefault();
      const t = addInput.value.trim();
      if (!t) return;
      const ok = await act(() => api.put('subjects/' + item.id, { topics: [...item.topics, { name: t, done: false }] }));
      if (ok) addInput.value = '';
    } }, addInput, h('button', { class: 'btn ghost small', type: 'submit', 'aria-label': 'Add topic' }, icon('plus', 16)));
    const del = armDelete(h('button', { class: 'icon-btn del-text', type: 'button', 'aria-label': 'Delete subject', title: 'Delete subject and its attendance' }, icon('trash', 16)),
      () => act(() => api.del('subjects/' + item.id), { success: 'Subject deleted.' }));
    const el = h('article', { class: 'subject-card' },
      h('div', { class: 'subject-band' }),
      h('div', { class: 'subject-head' }, h('div', {}, name, count), del),
      progress.el, topicList, addForm);

    function makeTopic() {
      let t;
      const cb = checkbox('Mark topic done', async on => {
        const topics = item.topics.map(x => (x.id === t.id ? { ...x, done: on } : x));
        await act(() => api.put('subjects/' + item.id, { topics }));
      });
      const label = h('span', { class: 'row-title' });
      const row = h('div', { class: 'row topic' }, cb, label,
        deleteButton('Remove topic', () => act(() => api.put('subjects/' + item.id, { topics: item.topics.filter(x => x.id !== t.id) }))));
      row.update = topic => {
        t = topic;
        cb.set(topic.done);
        row.classList.toggle('done', !!topic.done);
        label.textContent = topic.name;
      };
      return row;
    }

    el.update = s => {
      item = s;
      el.style.setProperty('--c', marker(s.color));
      name.textContent = s.name;
      const done = s.topics.filter(t => t.done).length;
      count.textContent = s.topics.length ? `${done} of ${s.topics.length} topics` : 'No topics yet';
      progress.set(s.topics.length ? (done / s.topics.length) * 100 : 0, marker(s.color));
      reconcile(topicList, s.topics, t => t.id, makeTopic);
    };
    return el;
  }

  const el = h('div', { class: 'view-inner' },
    h('div', { class: 'page-head' }, h('h1', {}, 'Subjects'), h('p', {}, 'Break each subject into topics and tick them off as you go.')),
    form, grid, empty);

  function update() {
    reconcile(grid, subjects(), s => s.id, makeSubject);
    empty.hidden = subjects().length > 0;
  }
  return { id: 'subjects', title: 'Subjects', el, update };
}
