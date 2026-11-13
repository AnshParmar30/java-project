// Quick notes (saved to the server as you type) and saved study links.

import { h, icon, debounce } from '../util.js';
import { panel, deleteButton, emptyState, reconcile } from '../ui.js';
import { S, act } from '../state.js';
import { api } from '../api.js';

export function notesView() {
  // ------------------------------------------------------------ notes
  const status = h('span', { class: 'saved' }, 'Saved');
  const area = h('textarea', { class: 'notes-area', maxLength: 20000, placeholder: 'Ideas, reminders, things to look up. Everything you type is saved automatically.', 'aria-label': 'Quick notes' });
  const save = debounce(async () => {
    try {
      await api.put('notes', { text: area.value });
      status.textContent = 'Saved';
      status.classList.remove('error');
    } catch (e) {
      status.textContent = 'Not saved';
      status.classList.add('error');
    }
  }, 600);
  area.addEventListener('input', () => { status.textContent = 'Saving…'; status.classList.remove('error'); save(); });
  const notesPanel = panel({ title: 'Quick notes', actions: status, cls: 'span-7' }, area);

  // ------------------------------------------------------------ links
  const title = h('input', { class: 'input', type: 'text', maxLength: 60, placeholder: 'Title', required: true, autocomplete: 'off', 'aria-label': 'Link title' });
  const url = h('input', { class: 'input grow', type: 'url', maxLength: 500, placeholder: 'https://…', required: true, autocomplete: 'off', 'aria-label': 'Link address' });
  const form = h('form', { class: 'add-row', onsubmit: async e => {
    e.preventDefault();
    const ok = await act(() => api.post('resources', { title: title.value.trim(), url: url.value.trim() }), { success: 'Link saved.' });
    if (ok) { title.value = ''; url.value = ''; }
  } }, title, url, h('button', { class: 'btn dark', type: 'submit' }, icon('plus', 16), 'Save'));
  const list = h('div', { class: 'list' });
  const empty = emptyState('No saved links', 'Keep useful videos, articles and class material here.');
  const linksPanel = panel({ title: 'Study links', cls: 'span-5' }, form, list, empty);

  function makeLink() {
    let item;
    const a = h('a', { class: 'link', target: '_blank', rel: 'noopener noreferrer' });
    const host = h('span', { class: 'row-sub' });
    const el = h('div', { class: 'row' }, h('span', { class: 'row-icon' }, icon('link', 18)), h('div', { class: 'row-main' }, a, host),
      deleteButton('Delete link', () => act(() => api.del('resources/' + item.id))));
    el.update = r => {
      item = r;
      a.textContent = r.title;
      a.href = r.url;
      try { host.textContent = new URL(r.url).hostname.replace(/^www\./, ''); } catch { host.textContent = ''; }
    };
    return el;
  }

  const el = h('div', { class: 'view-inner' },
    h('div', { class: 'page-head' }, h('h1', {}, 'Notes & links'), h('p', {}, 'A scratchpad and a shelf for the links you keep coming back to.')),
    h('div', { class: 'grid' }, notesPanel, linksPanel));

  function update() {
    if (document.activeElement !== area && area.value !== S.data.notes) area.value = S.data.notes;
    reconcile(list, S.data.resources, r => r.id, makeLink);
    empty.hidden = S.data.resources.length > 0;
  }
  return { id: 'notes', title: 'Notes & links', el, update };
}
