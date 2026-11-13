// Reusable interface pieces: panels, progress bars, checkboxes, list syncing.

import { h, icon, reduceMotion, svgFromString } from './util.js';

export function panel({ title, sub, actions, cls = '' } = {}, ...body) {
  return h('section', { class: `panel ${cls}`.trim() },
    (title || actions) && h('header', { class: 'panel-head' },
      h('div', {}, title && h('h2', {}, title), sub && h('p', { class: 'sub' }, sub)),
      actions && h('div', { class: 'panel-actions' }, actions)),
    ...body);
}

/** A thick, rounded progress bar that fills like a highlighter stroke. */
export function bar(color) {
  const fill = h('i');
  const el = h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100 }, fill);
  if (color) el.style.setProperty('--c', color);
  let first = true;
  return {
    el,
    set(pct, color2) {
      const v = Math.max(0, Math.min(100, Number(pct) || 0));
      if (color2) el.style.setProperty('--c', color2);
      el.setAttribute('aria-valuenow', Math.round(v));
      if (first) {
        first = false;
        requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = v + '%'; }));
      } else {
        fill.style.width = v + '%';
      }
    },
  };
}

const TICK = '<svg viewBox="0 0 18 18" aria-hidden="true"><path class="tick" d="M4 9.5l3.5 3.5L14 5.5"/></svg>';

/** Round-cornered checkbox with a tick that draws itself. */
export function checkbox(label, onChange) {
  const el = h('button', { type: 'button', class: 'check', role: 'checkbox', 'aria-checked': 'false', 'aria-label': label });
  el.append(svgFromString(TICK));
  el.set = on => {
    const was = el.classList.contains('on');
    el.classList.toggle('on', !!on);
    el.setAttribute('aria-checked', on ? 'true' : 'false');
    if (!was && on && !reduceMotion() && el.isConnected) {
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
    }
  };
  el.addEventListener('click', ev => {
    const next = !el.classList.contains('on');
    el.set(next);
    onChange(next, ev);
  });
  return el;
}

export function deleteButton(label, onClick) {
  return h('button', { type: 'button', class: 'icon-btn del', 'aria-label': label, title: label, onclick: onClick }, icon('x', 16));
}

/** First click arms the button, a second click within 3 seconds runs the action. */
export function armDelete(btn, run) {
  let timer;
  const original = btn.innerHTML;
  btn.addEventListener('click', ev => {
    ev.stopImmediatePropagation();
    if (btn.classList.contains('armed')) {
      clearTimeout(timer);
      run();
      return;
    }
    btn.classList.add('armed');
    btn.textContent = 'Delete?';
    timer = setTimeout(() => { btn.classList.remove('armed'); btn.innerHTML = original; }, 3000);
  }, true);
  return btn;
}

export function emptyState(title, text, action) {
  return h('div', { class: 'empty' }, h('strong', {}, title), text && h('p', {}, text), action);
}

export function chip(text, color) {
  const el = h('span', { class: 'chip' }, text);
  if (color) { el.style.setProperty('--c', color); el.classList.add('colored'); }
  return el;
}

export function field(label, input) {
  return h('label', { class: 'field' }, h('span', {}, label), input);
}

/** Rebuilds a <select>'s options only when they changed, keeping the user's choice. */
export function syncSelect(select, options, placeholder) {
  const sig = JSON.stringify([placeholder, options]);
  if (select._sig === sig) return;
  const keep = select.value;
  select._sig = sig;
  select.replaceChildren();
  if (placeholder != null) select.append(h('option', { value: '' }, placeholder));
  for (const o of options) select.append(h('option', { value: o.value }, o.label));
  if ([...select.options].some(o => o.value === keep)) select.value = keep;
}

export function segmented(options, value, onChange) {
  const el = h('div', { class: 'segmented', role: 'tablist' });
  const buttons = options.map(o => h('button', {
    type: 'button', role: 'tab', 'data-v': o.value, class: o.value === value ? 'on' : '',
    onclick: () => { el.set(o.value); onChange(o.value); },
  }, o.label));
  el.append(...buttons);
  el.set = v => buttons.forEach(b => {
    const on = b.dataset.v === v;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  el.set(value);
  return el;
}

/**
 * Keeps the children of `parent` in step with `items` (matched by key).
 * New rows slide in, removed rows collapse out, and nothing else is touched,
 * so animations and focus are never disturbed by a refresh.
 * `create(item)` must return an element with an `update(item)` method.
 */
export function reconcile(parent, items, keyOf, create) {
  const map = parent._map || (parent._map = new Map());
  const animate = parent._filled === true;
  const seen = new Set();
  let prev = null;
  for (const item of items) {
    const key = keyOf(item);
    seen.add(key);
    let el = map.get(key);
    if (!el) {
      el = create(item);
      map.set(key, el);
      if (animate && !reduceMotion()) {
        el.classList.add('enter');
        el.addEventListener('animationend', () => el.classList.remove('enter'), { once: true });
      }
    }
    el.update(item);
    const want = prev ? prev.nextSibling : parent.firstChild;
    if (el !== want) parent.insertBefore(el, want);
    prev = el;
  }
  for (const [key, el] of map) {
    if (seen.has(key)) continue;
    map.delete(key);
    if (reduceMotion()) { el.remove(); continue; }
    el.style.setProperty('--h', el.offsetHeight + 'px');
    el.classList.add('leave');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 500);
  }
  parent._filled = true;
}
