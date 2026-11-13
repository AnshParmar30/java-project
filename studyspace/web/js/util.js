// Small helpers shared by every part of the app: DOM building, icons, dates,
// toasts, animated numbers and confetti.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const go = id => { location.hash = '#/' + id; };
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ---------------------------------------------------------------- DOM building

/** h('div', {class: 'x', onclick: fn}, child, 'text', [more children]) */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  let value;
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sk.startsWith('--')) el.style.setProperty(sk, sv);
          else el.style[sk] = sv;
        }
      } else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') value = v; // set after children so <select> works
      else if (k in el) el[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  add(el, kids);
  if (value !== undefined) el.value = value;
  return el;
}

export function add(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false || k === true) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Builds an element from a trusted, hard-coded SVG string. Never pass user text here. */
export function svgFromString(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild;
}

const ICONS = {
  home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>',
  plan: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16v4M17 18h4"/>',
  focus: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9.5 3h5"/>',
  subjects: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
  exams: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
  attendance: '<rect x="5" y="4.5" width="14" height="16.5" rx="3"/><path d="M9 4V3h6v1M9 13l2.2 2.2L15.5 11"/>',
  timetable: '<rect x="3.5" y="4.5" width="17" height="16" rx="3"/><path d="M3.5 10h17M9.5 10v10.5M15.5 10v10.5"/>',
  cards: '<rect x="3" y="7" width="13" height="13" rx="3"/><path d="M8 4h10a3 3 0 0 1 3 3v9"/>',
  grades: '<path d="M2.5 9.5L12 5l9.5 4.5L12 14z"/><path d="M6 11.7V16c2.5 2.5 9.5 2.5 12 0v-4.3M21.5 9.5V15"/>',
  notes: '<path d="M6 3.5h8l4 4V20.5H6z"/><path d="M14 3.5V8h4M9 12.5h6M9 16h6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  flame: '<path d="M12 3c.5 3.5 5 5 5 10a5 5 0 0 1-10 0c0-2.2 1-3.5 2.2-4.5.2 1.8 1 2.8 2 3 .2-3-.8-5 .8-8.5z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M4.5 20h15"/>',
  upload: '<path d="M12 20V9M7 13l5-5 5 5M4.5 4h15"/>',
  logout: '<path d="M9 4H5.5v16H9M16 8l4 4-4 4M20 12H9.5"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  play: '<path d="M8 5l11 7-11 7z" fill="currentColor"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3.4"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.6-5.9M4 4.5V9h4.5"/>',
  skip: '<path d="M6 5l9 7-9 7z" fill="currentColor"/><path d="M19 5v14"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 21h4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.2v.1"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
};

export function icon(name, size = 20) {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '2');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('class', 'icon');
  s.innerHTML = ICONS[name] || '';
  return s;
}

// ---------------------------------------------------------------- dates

export const pad = n => String(n).padStart(2, '0');
export const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const fmtDate = s => parseDate(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
export const fmtLong = s => parseDate(s).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
export const daysFrom = (s, today) => Math.round((parseDate(s) - parseDate(today)) / 86400000);
export const fmtClock = secs => `${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`;
export function fmtMinutes(m) {
  if (m < 60) return `${m} min`;
  const hrs = Math.floor(m / 60), rest = m % 60;
  return rest ? `${hrs} h ${rest} min` : `${hrs} h`;
}
export function whenLabel(days) {
  if (days < 0) return days === -1 ? '1 day overdue' : `${-days} days overdue`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${days} days`;
}

// ---------------------------------------------------------------- subject colours

export const MARKERS = ['yellow', 'pink', 'mint', 'sky', 'orange', 'lilac'];
export const marker = i => `var(--${MARKERS[((Number(i) || 0) % 6 + 6) % 6]})`;

// ---------------------------------------------------------------- toast

export function toast(msg, kind = 'info') {
  const box = document.getElementById('toasts');
  if (!box) return;
  const el = h('div', { class: `toast ${kind}`, role: kind === 'error' ? 'alert' : 'status' }, msg);
  box.append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => {
    el.classList.remove('in');
    setTimeout(() => el.remove(), 260);
  }, kind === 'error' ? 4800 : 2800);
}

// ---------------------------------------------------------------- animated numbers

/** Counts a number up (or down) from whatever it showed before. */
export function countTo(el, to, { duration = 900, decimals = 0, suffix = '' } = {}) {
  to = Number(to) || 0;
  const from = el._val ?? 0;
  el._val = to;
  const fmt = v => v.toFixed(decimals) + suffix;
  cancelAnimationFrame(el._raf);
  if (reduceMotion() || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = now => {
    const p = Math.min(1, (now - t0) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(from + (to - from) * eased);
    if (p < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}

// ---------------------------------------------------------------- confetti

const CONFETTI = ['#FFE14D', '#FF8DB3', '#5FE3B4', '#7CC4FF', '#FFA85C', '#B9A6FF'];
let canvas, ctx, parts = [], raf = 0;

function ensureCanvas() {
  if (canvas) return;
  canvas = h('canvas', { class: 'confetti', 'aria-hidden': 'true' });
  document.body.append(canvas);
  ctx = canvas.getContext('2d');
  const size = () => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size();
  addEventListener('resize', size);
}

function piece(x, y, vx, vy) {
  return {
    x, y, vx, vy, w: 6 + Math.random() * 6, h: 4 + Math.random() * 5,
    r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4,
    c: CONFETTI[Math.floor(Math.random() * CONFETTI.length)], age: 0, max: 70 + Math.random() * 50,
  };
}

/** A small burst from a point, e.g. from a checkbox. */
export function burst(x, y, count = 34, power = 1) {
  if (reduceMotion()) return;
  ensureCanvas();
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, v = (2.5 + Math.random() * 5.5) * power;
    parts.push(piece(x, y, Math.cos(a) * v, Math.sin(a) * v - 4 * power));
  }
  if (!raf) raf = requestAnimationFrame(tick);
}

/** Confetti falling from the top of the screen, for bigger wins. */
export function shower(count = 110) {
  if (reduceMotion()) return;
  ensureCanvas();
  for (let i = 0; i < count; i++) {
    const p = piece(Math.random() * innerWidth, -20 - Math.random() * 200, (Math.random() - 0.5) * 2, 2 + Math.random() * 3);
    p.max = 140 + Math.random() * 60;
    parts.push(p);
  }
  if (!raf) raf = requestAnimationFrame(tick);
}

function tick() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  parts = parts.filter(p => p.age < p.max && p.y < innerHeight + 30);
  for (const p of parts) {
    p.age++;
    p.vy += 0.18;
    p.vx *= 0.99;
    p.x += p.vx;
    p.y += p.vy;
    p.r += p.vr;
    ctx.save();
    ctx.globalAlpha = Math.min(1, (p.max - p.age) / 25);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.r);
    ctx.fillStyle = p.c;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  }
  if (parts.length) raf = requestAnimationFrame(tick);
  else { raf = 0; ctx.clearRect(0, 0, innerWidth, innerHeight); }
}
