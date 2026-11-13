// Flashcards with spaced repetition (the Leitner schedule is handled by Java).

import { h, icon, burst, toast, fmtLong, countTo } from '../util.js';
import { panel, deleteButton, emptyState, reconcile, segmented } from '../ui.js';
import { S, act } from '../state.js';
import { api } from '../api.js';

const isDue = c => !c.due || c.due <= S.today;

export function cardsView() {
  let mode = 'due';
  let queue = [];
  let seen = new Set();
  let started = false;
  let flipped = false;
  let busy = false;
  let shownId = null;

  // ------------------------------------------------------------ stats
  const stat = (label) => {
    const num = h('span', { class: 'stat-num' });
    return { num, el: h('div', { class: 'mini-stat' }, num, h('span', {}, label)) };
  };
  const sTotal = stat('cards'), sDue = stat('due now'), sMastered = stat('mastered');
  const stats = h('div', { class: 'mini-stats' }, sTotal.el, sDue.el, sMastered.el);

  // ------------------------------------------------------------ study area
  const frontText = h('p', {});
  const backText = h('p', {});
  const flip = h('div', { class: 'flip', tabindex: 0, role: 'button', 'aria-label': 'Flip the card' },
    h('div', { class: 'flip-inner' },
      h('div', { class: 'face front' }, h('small', {}, 'Question'), frontText),
      h('div', { class: 'face back' }, h('small', {}, 'Answer'), backText)));
  const progress = h('p', { class: 'flip-progress' });
  const missBtn = h('button', { class: 'btn ghost', type: 'button', onclick: () => answer(false) }, 'Missed it');
  const gotBtn = h('button', { class: 'btn mint', type: 'button', onclick: () => answer(true) }, icon('check', 16), 'Got it');
  const flipBtn = h('button', { class: 'btn dark', type: 'button', onclick: () => toggleFlip() }, 'Show answer');
  const controls = h('div', { class: 'flip-controls' }, missBtn, flipBtn, gotBtn);
  const hint = h('p', { class: 'hint' }, 'Space flips the card. Left arrow means missed, right arrow means got it.');
  const stage = h('div', { class: 'stage' }, progress, flip, controls, hint);

  const doneBox = emptyState('', '');
  const doneTitle = doneBox.querySelector('strong');
  const doneText = doneBox.querySelector('p');
  doneBox.append(h('button', { class: 'btn dark small', type: 'button', onclick: () => restart('all') }, 'Practice all cards anyway'));
  const noCards = emptyState('No flashcards yet', 'Add a question and its answer below. Cards you miss come back sooner.');

  const modeSwitch = segmented([{ value: 'due', label: 'Due now' }, { value: 'all', label: 'All cards' }], mode, v => restart(v));
  const studyPanel = panel({ title: 'Practice', actions: modeSwitch }, stage, doneBox, noCards);

  function restart(newMode) {
    mode = newMode || mode;
    modeSwitch.set(mode);
    const cards = S.data.cards;
    let pick = mode === 'due' ? cards.filter(isDue).sort((a, b) => (a.box - b.box) || (a.created - b.created)) : shuffle([...cards]);
    queue = pick.map(c => c.id);
    seen = new Set(cards.map(c => c.id));
    started = true;
    flipped = false;
    shownId = null;
    render();
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const byId = id => S.data.cards.find(c => c.id === id);

  function toggleFlip() {
    if (!queue.length) return;
    flipped = !flipped;
    flip.classList.toggle('flipped', flipped);
    flipBtn.textContent = flipped ? 'Show question' : 'Show answer';
    missBtn.disabled = gotBtn.disabled = !flipped;
  }

  async function answer(known) {
    if (busy || !flipped || !queue.length) return;
    busy = true;
    const id = queue[0];
    if (known) queue.shift(); else queue.push(queue.shift());
    flipped = false;
    flip.classList.remove('flipped');
    const ok = await act(() => api.post(`cards/${id}/review`, { known, today: S.today }));
    busy = false;
    if (ok && known && queue.length === 0) {
      const r = flip.getBoundingClientRect();
      burst(r.x + r.width / 2, r.y + r.height / 2, 70, 1.2);
      toast('Deck finished. Your cards are scheduled for later.', 'ok');
    }
    render();
  }

  function render() {
    const cards = S.data.cards;
    queue = queue.filter(id => byId(id));
    const has = cards.length > 0;
    noCards.hidden = has;
    stage.hidden = !(has && queue.length > 0);
    doneBox.hidden = !(has && queue.length === 0);
    modeSwitch.hidden = !has;
    if (has && queue.length === 0) {
      const next = cards.map(c => c.due).filter(d => d && d > S.today).sort()[0];
      doneTitle.textContent = mode === 'due' ? 'All caught up' : 'Round complete';
      doneText.textContent = next ? `Next review: ${fmtLong(next)}.` : 'Come back after you add more cards.';
    }
    if (queue.length) {
      const card = byId(queue[0]);
      progress.textContent = `${queue.length} card${queue.length === 1 ? '' : 's'} left in this round`;
      if (shownId !== card.id) {
        const wasFlipped = flip.classList.contains('flipped');
        frontText.textContent = card.question;
        // Wait for the flip-back to finish so the next answer is never visible mid-turn.
        if (wasFlipped) setTimeout(() => { if (queue[0] === card.id) backText.textContent = card.answer; }, 320);
        else backText.textContent = card.answer;
        if (shownId !== null) { flip.classList.remove('swap'); void flip.offsetWidth; flip.classList.add('swap'); }
        shownId = card.id;
      }
      flipBtn.textContent = flipped ? 'Show question' : 'Show answer';
      missBtn.disabled = gotBtn.disabled = !flipped;
    } else {
      shownId = null;
    }
  }

  // ------------------------------------------------------------ add + list
  const qInput = h('input', { class: 'input grow', type: 'text', maxLength: 200, placeholder: 'Question or front of the card', required: true, autocomplete: 'off', 'aria-label': 'Question' });
  const aInput = h('input', { class: 'input grow', type: 'text', maxLength: 300, placeholder: 'Answer', required: true, autocomplete: 'off', 'aria-label': 'Answer' });
  const addForm = h('form', { class: 'add-row', onsubmit: async e => {
    e.preventDefault();
    if (!qInput.value.trim() || !aInput.value.trim()) return;
    const ok = await act(() => api.post('cards', { question: qInput.value.trim(), answer: aInput.value.trim() }), { success: 'Card added.' });
    if (ok) { qInput.value = ''; aInput.value = ''; qInput.focus(); }
  } }, qInput, aInput, h('button', { class: 'btn dark', type: 'submit' }, icon('plus', 16), 'Add card'));
  const list = h('div', { class: 'list' });
  const listPanel = panel({ title: 'Your deck', sub: 'The dots show the box a card is in. Higher boxes come back less often.' }, addForm, list);

  function makeRow() {
    let item;
    const q = h('span', { class: 'row-title' });
    const a = h('span', { class: 'row-sub' });
    const dots = h('span', { class: 'dots', 'aria-hidden': 'true' }, ...[1, 2, 3, 4, 5].map(() => h('i')));
    const el = h('div', { class: 'row' }, h('div', { class: 'row-main' }, q, a), dots,
      deleteButton('Delete card', () => act(() => api.del('cards/' + item.id))));
    el.update = c => {
      item = c;
      q.textContent = c.question;
      a.textContent = c.answer;
      [...dots.children].forEach((d, i) => d.classList.toggle('on', i < c.box));
      dots.title = `Box ${c.box} of 5`;
    };
    return el;
  }

  flip.addEventListener('click', toggleFlip);
  flip.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); toggleFlip(); } });

  document.addEventListener('keydown', e => {
    if (!el.classList.contains('active')) return;
    if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(e.target.tagName) && e.key === ' ') return;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === ' ') { e.preventDefault(); toggleFlip(); }
    else if (e.key === 'ArrowRight') answer(true);
    else if (e.key === 'ArrowLeft') answer(false);
  });

  const el = h('div', { class: 'view-inner' },
    h('div', { class: 'page-head' }, h('h1', {}, 'Flashcards'), h('p', {}, 'Test yourself. Cards you miss come back sooner.')),
    stats, studyPanel, listPanel);

  function update() {
    const d = S.dash.cards;
    countTo(sTotal.num, d.total);
    countTo(sDue.num, d.due);
    countTo(sMastered.num, d.mastered);

    if (!started) {
      restart('due');
    } else {
      // Pull newly added cards into the current round.
      for (const c of S.data.cards) {
        if (!seen.has(c.id)) { seen.add(c.id); if (mode === 'all' || isDue(c)) queue.push(c.id); }
      }
      render();
    }
    reconcile(list, [...S.data.cards].sort((a, b) => b.created - a.created), c => c.id, makeRow);
  }
  return { id: 'cards', title: 'Flashcards', el, update };
}
