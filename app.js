(() => {
'use strict';

/* ---------- constants ---------- */
const Q = [
  { id: 'q1', name: 'Now',      sub: 'Urgent + important · do it now' },
  { id: 'q2', name: 'Next',     sub: 'Important, not urgent · schedule it' },
  { id: 'q3', name: 'Hand off', sub: 'Urgent, less important · delegate' },
  { id: 'q4', name: 'Maybe',    sub: 'Not urgent, less important · later or drop' },
];
const QN = { backlog: 'Backlog', q1: 'Now', q2: 'Next', q3: 'Hand off', q4: 'Maybe' };
const ORDER = ['backlog', 'q1', 'q2', 'q3', 'q4'];
const QORD = { q1: 0, q2: 1, q3: 2, q4: 3, backlog: 4 };
const K_DATA = 'eisen.data.v1', K_CFG = 'eisen.cfg.v1', FILE = 'tasks.json';

const HANDLE = '<svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><circle cx="6" cy="4" r="1.6"/><circle cx="12" cy="4" r="1.6"/><circle cx="6" cy="9" r="1.6"/><circle cx="12" cy="9" r="1.6"/><circle cx="6" cy="14" r="1.6"/><circle cx="12" cy="14" r="1.6"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const EXPAND = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg>';
const PLUS = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
const NOTE = '<svg class="dtl" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>';

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const dayDiff = (a, b) => Math.round((parseYmd(a) - parseYmd(b)) / 864e5); // a - b, in days
const offsetDay = n => ymd(new Date(Date.now() + n * 864e5));
const fmtShort = s => { const [y, m, d] = s.split('-'); return `${d}/${m}` + (y !== String(new Date().getFullYear()) ? '/' + y : ''); };
const REPEATS = { daily: 'Every day', weekly: 'Every week', monthly: 'Every month' };
function stepYmd(s, rep, k) { // the k-th occurrence after s
  const d = parseYmd(s);
  if (rep === 'monthly') { const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + k); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); }
  else d.setDate(d.getDate() + k * (rep === 'weekly' ? 7 : 1));
  return ymd(d);
}
const nextOccurrence = (due, rep) => { const tk = today(); let k = 1, c = stepYmd(due, rep, k); while (c <= tk && k < 800) c = stepYmd(due, rep, ++k); return c; };
const fmtTs = ts => fmtShort(ymd(new Date(ts)));
const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
function lsGet(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }

// Normalise a task from storage / Gist. Old data used "inbox" (now "backlog").
function clean(t) {
  if (!t || t.id == null) return null;
  const q = t.q === 'inbox' ? 'backlog' : (QN[t.q] ? t.q : 'backlog');
  const from = t.doneFrom === 'inbox' ? 'backlog' : t.doneFrom;
  return {
    id: String(t.id),
    title: String(t.title || '').slice(0, 200),
    detail: String(t.detail || '').slice(0, 2000),
    order: t.order != null && Number.isFinite(+t.order) ? +t.order : null,
    q,
    done: !!t.done,
    doneAt: +t.doneAt || null,
    doneFrom: QN[from] ? from : null,
    start: isDate(t.start) ? t.start : null,
    due: isDate(t.due) ? t.due : null,
    created: +t.created || 0,
    updatedAt: +t.updatedAt || 0,
    deleted: !!t.deleted,
    promotedFor: t.promotedFor ? String(t.promotedFor) : null,
    progress: Math.min(100, Math.max(0, Math.round(+t.progress) || 0)),
    repeat: ['daily', 'weekly', 'monthly'].includes(t.repeat) ? t.repeat : null,
    reopenOn: isDate(t.reopenOn) ? t.reopenOn : null,
    nextDue: isDate(t.nextDue) ? t.nextDue : null,
    homeQ: ['backlog', 'q1', 'q2', 'q3', 'q4'].includes(t.homeQ) ? t.homeQ : null,
    tags: Array.isArray(t.tags) ? [...new Set(t.tags.map(String))].slice(0, 20) : [],
  };
}
const TAG_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#6b7280'];
function cleanTag(g) {
  if (!g || g.id == null) return null;
  return {
    id: String(g.id),
    name: String(g.name || '').trim().slice(0, 30),
    color: /^#[0-9a-f]{6}$/i.test(g.color || '') ? g.color : TAG_COLORS[0],
    updatedAt: +g.updatedAt || 0,
    deleted: !!g.deleted,
  };
}

/* ---------- state ---------- */
let D = Object.assign({ tasks: [], dirty: false, rev: 0, lastSync: 0 }, lsGet(K_DATA, {}));
D.tasks = (D.tasks || []).map(clean).filter(Boolean);
D.tags = (D.tags || []).map(cleanTag).filter(g => g && g.name);
let C = Object.assign({ token: '', gist: '', view: 'matrix', showDone: false, status: 'active', fq: 'all', ftag: 'all', group: 'none', sort: 'q' }, lsGet(K_CFG, {}));
let search = '';
const clock = () => Date.now() + (+C.skew || 0); // local time corrected by GitHub's server clock (see gh())
let drag = null, hold = null, pendingRender = false;
let syncing = false, again = false, lastErr = '', pushTimer = null, installEvt = null;

const saveData = () => lsSet(K_DATA, { tasks: D.tasks, tags: D.tags, dirty: D.dirty, rev: D.rev, lastSync: D.lastSync });
const setC = o => { Object.assign(C, o); lsSet(K_CFG, C); };
const configured = () => !!(C.token && C.gist);
const live = () => D.tasks.filter(t => !t.deleted);
const liveTags = () => D.tags.filter(g => !g.deleted);
const tagById = id => liveTags().find(g => g.id === id);
const taskTags = t => (t.tags || []).map(tagById).filter(Boolean);
const find = id => D.tasks.find(t => t.id === id && !t.deleted);

function mutate(fn) {
  fn();
  const mv = promote();
  D.rev++; D.dirty = true;
  saveData(); render(); schedulePush();
  announcePromo(mv);
}
/* Auto-promote: an active task whose deadline is within N days (default 2, or overdue) moves up one urgency level:
   Next -> Now, Maybe -> Hand off. Backlog (unsorted) is left alone. Each task is promoted once per deadline,
   so putting it back by hand (or via Undo) sticks. */
const PROMO = { q2: 'q1', q4: 'q3' };
function reopenDue() { // repeating tasks that were completed come back to their home board when their next cycle starts
  const now = clock(), tk = today(), back = [];
  D.tasks.forEach(t => {
    if (t.deleted || !t.done || !t.repeat || !t.reopenOn || t.reopenOn > tk) return;
    let due = t.nextDue || nextOccurrence(t.due || tk, t.repeat), k = 0;
    while (due < tk && k++ < 800) due = stepYmd(due, t.repeat, 1);
    Object.assign(t, { done: false, doneAt: null, doneFrom: null, q: t.homeQ || t.doneFrom || t.q, due, start: null, order: null, promotedFor: null, homeQ: null, reopenOn: null, nextDue: null, updatedAt: now });
    back.push(t.id);
  });
  return back;
}
function promote() {
  const re = reopenDue();
  const days = C.autoPromote === undefined ? 2 : +C.autoPromote;
  const now = clock(), lim = today(), moved = [];
  moved.reopened = re;
  if (!days) return moved;
  D.tasks.forEach(t => {
    if (t.deleted || t.done || !t.due || !PROMO[t.q] || t.promotedFor === t.due) return;
    if (dayDiff(t.due, lim) > days) return;
    moved.push({ id: t.id, from: t.q });
    t.homeQ = t.homeQ || t.q; // remember the board it really belongs to (repeating tasks return there)
    t.q = PROMO[t.q]; t.order = null; t.promotedFor = t.due; t.updatedAt = now;
  });
  return moved;
}
function announcePromo(mv) {
  if (mv && mv.reopened && mv.reopened.length && !mv.length) { toast(`🔁 ${mv.reopened.length} repeating task${mv.reopened.length > 1 ? 's are' : ' is'} back on your board`); return; }
  if (!mv || !mv.length) return;
  const to = id => { const t = D.tasks.find(x => x.id === id); return t ? QN[t.q] : ''; };
  const txt = mv.length === 1
    ? `⚡ “${D.tasks.find(x => x.id === mv[0].id).title.slice(0, 28)}” is due soon → moved to ${to(mv[0].id)}`
    : `⚡ ${mv.length} tasks due soon moved up (${[...new Set(mv.map(m => QN[m.from] + ' → ' + to(m.id)))].join(', ')})`;
  toast(txt, () => mutate(() => { const now = clock(); mv.forEach(m => { const t = D.tasks.find(x => x.id === m.id); if (t) { t.q = m.from; t.order = null; t.homeQ = null; t.updatedAt = now; } }); }));
}
function runPromote() { // outside of a user edit: load, new day, after sync
  const mv = promote();
  if (mv.length || mv.reopened.length) { D.rev++; D.dirty = true; saveData(); schedulePush(); }
  return mv;
}
function patch(id, o) {
  const t = D.tasks.find(x => x.id === id);
  if (!t) return;
  mutate(() => Object.assign(t, o, { updatedAt: clock() }));
}
function addTask(f) {
  const now = clock();
  mutate(() => D.tasks.push({
    id: uid(), title: f.title, detail: f.detail || '', promotedFor: f.due || null, progress: f.progress || 0, repeat: f.repeat || null, reopenOn: null, nextDue: null, homeQ: null, q: f.q, done: false, doneAt: null, doneFrom: null,
    start: null, due: f.due || (f.repeat ? today() : null), created: now, updatedAt: now, deleted: false, tags: f.tags || [],
  }));
}
function addTag(name, color) {
  name = name.trim().slice(0, 30);
  if (!name || liveTags().some(g => g.name.toLowerCase() === name.toLowerCase())) return false;
  mutate(() => D.tags.push({ id: uid(), name, color, updatedAt: clock(), deleted: false }));
  return true;
}
function patchTag(id, o) {
  const g = D.tags.find(x => x.id === id);
  if (g) mutate(() => Object.assign(g, o, { updatedAt: clock() }));
}

/* ---------- toast ---------- */
let toastT;
function toast(msg, undo, ok) { // ok: green success notice shown at the top (stays visible above the keyboard)
  const el = $('#toast');
  el.className = ok ? 'top ok' : '';
  el.innerHTML = `<span>${esc(msg)}</span>` + (undo ? '<button id="t-undo">Undo</button>' : '');
  el.hidden = false;
  if (undo) $('#t-undo').onclick = () => { undo(); el.hidden = true; };
  clearTimeout(toastT);
  toastT = setTimeout(() => { el.hidden = true; }, undo ? 5000 : 2200);
}

/* ---------- deadline / timeline ---------- */
function dueInfo(t) {
  if (!t.due) return null;
  const n = dayDiff(t.due, today());
  let txt, cls = '';
  if (n < 0) { txt = `${-n} day${-n > 1 ? 's' : ''} overdue`; cls = 'late'; }
  else if (n === 0) { txt = 'Due today'; cls = 'soon'; }
  else if (n === 1) { txt = 'Due tomorrow'; cls = 'soon'; }
  else if (n <= 14) txt = `${n} days left`;
  else txt = 'Due ' + fmtShort(t.due);
  return { txt, cls, n };
}
// angry Santa shown on active tasks that are due today or overdue: shakes with rage, face flushes red
const SANTA = '<span class="santa" aria-hidden="true"><svg viewBox="0 0 32 32" aria-hidden="true"><ellipse class="face" cx="16" cy="21" rx="8.5" ry="7.5" fill="#ffb08a"/><path d="M7.5 22C8 32 24 32 24.5 22C21 25.5 11 25.5 7.5 22z" fill="#fff"/><circle cx="16" cy="23.3" r="1.5" fill="#ff7a59"/><circle cx="12.5" cy="21.2" r="1.2" fill="#222"/><circle cx="19.5" cy="21.2" r="1.2" fill="#222"/><path d="M9.3 18.6L14.6 20.3M22.7 18.6L17.4 20.3" stroke="#222" stroke-width="1.8" stroke-linecap="round"/><path d="M13 28Q16 25.8 19 28" fill="none" stroke="#222" stroke-width="1.5" stroke-linecap="round"/><path d="M5 15C5 7 11 3 19 4c3 .5 4 4 6 11z" fill="#d62828"/><rect x="3.5" y="12.5" width="25" height="5" rx="2.5" fill="#fff"/><circle cx="24.5" cy="5" r="3" fill="#fff"/></svg><span class="rage">💢</span></span>';
function timelineHTML(t) {
  if (!t.due || t.done) return '';
  const info = dueInfo(t);
  const startStr = t.start || ymd(new Date(t.created || Date.now()));
  const total = Math.max(1, dayDiff(t.due, startStr));
  const elapsed = dayDiff(today(), startStr);
  const pct = Math.max(0, Math.min(100, Math.round(elapsed / total * 100)));
  return `<div class="tl ${info.cls}"><div class="tl-t"><span>${fmtShort(startStr)} → ${fmtShort(t.due)}</span><b>${info.n <= 0 ? SANTA : ''}${info.txt}</b></div><div class="track"><i style="width:${pct}%"></i></div></div>`;
}
function doneText(t) {
  return (t.doneAt ? fmtTs(t.doneAt) : '') + (t.doneFrom ? ' · from ' + QN[t.doneFrom] : '') + (t.repeat && t.reopenOn ? ' · 🔁 back ' + fmtShort(t.reopenOn) : '');
}
const doneInfo = t => t.done ? `<div class="doneinfo">Done ${esc(doneText(t))}</div>` : '';
function dueCell(t) {
  if (!t.due) return '<span class="muted">—</span>';
  if (t.done) return `<span class="due">${fmtShort(t.due)}</span>`;
  const i = dueInfo(t);
  return `<span class="due ${i.cls}">${i.n <= 0 ? SANTA : ''}${i.txt}</span>`;
}
const cmpDue = (a, b) => {
  const x = a.due || '9999', y = b.due || '9999';
  return x < y ? -1 : x > y ? 1 : a.created - b.created;
};
// tasks that have a deadline always sit above those without one
const cmpTop = (a, b) => (b.due ? 1 : 0) - (a.due ? 1 : 0);
// list order: dated tasks by deadline (nearest first); undated tasks by manual order, then creation time
const cmpList = (a, b) => cmpTop(a, b) || (a.due ? cmpDue(a, b) : cmpOrder(a, b) || a.created - b.created);
// manual order: tasks with an order come first (ascending); the rest keep their default sort
const cmpOrder = (a, b) => {
  const x = a.order, y = b.order;
  if (x != null && y != null) return x - y;
  return x != null ? -1 : y != null ? 1 : 0;
};
// quick search: matches title, detail and tag names
const match = t => {
  if (!search) return true;
  const q = search.toLowerCase();
  if (q[0] === '#') { const n = q.slice(1); return !n || taskTags(t).some(g => g.name.toLowerCase().includes(n)); } // "#tag" = tags only
  return t.title.toLowerCase().includes(q) || t.detail.toLowerCase().includes(q) || taskTags(t).some(g => g.name.toLowerCase().includes(q));
};
function hl(text) { // escape + highlight the search text
  if (!search || search[0] === '#') return esc(text);
  const lo = text.toLowerCase(), q = search.toLowerCase();
  let out = '', i = 0, j;
  while ((j = lo.indexOf(q, i)) !== -1) { out += esc(text.slice(i, j)) + '<mark>' + esc(text.slice(j, j + q.length)) + '</mark>'; i = j + q.length; }
  return out + esc(text.slice(i));
}
const RPT = '<span class="rpt" title="Repeats"> 🔁</span>';
const tagsHTML = t => {
  const g = taskTags(t);
  return g.length ? `<div class="tgs">${g.map(x => `<span class="tg" data-name="${esc(x.name)}" title="Filter by this tag" style="--tc:${x.color}"><i></i><span class="n">${esc(x.name)}</span></span>`).join('')}</div>` : '';
};
const firstLine = d => (d.split('\n').find(l => l.trim()) || '').trim();

/* ---------- progress (0-100 %) ---------- */
const pgOf = t => (t.done || !(t.progress > 0)) ? 0 : t.progress;
const pgBar = t => pgOf(t) ? `<span class="pg" style="--p:${t.progress}%" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${t.progress}" aria-label="Progress ${t.progress}%"></span>` : '';
const pgNum = t => pgOf(t) ? `<span class="pgn">${t.progress}%</span>` : '';
function progressField(id, val) {
  return `<div class="pfield"><input id="${id}" type="range" min="0" max="100" step="5" value="${val}" aria-label="Progress">
    <label class="pnum"><input id="${id}-n" type="number" min="0" max="100" step="1" inputmode="numeric" value="${val}" aria-label="Progress percent">%</label>
    <div class="chips">${[0, 25, 50, 75, 100].map(n => `<button type="button" class="chip" data-pg="${n}">${n}%</button>`).join('')}</div></div>`;
}
function bindProgress(id) {
  const r = $('#' + id), n = $('#' + id + '-n'), f = r.closest('.pfield');
  const set = v => {
    v = Math.min(100, Math.max(0, Math.round(+v) || 0)); r.value = v; n.value = v;
    f.querySelectorAll('[data-pg]').forEach(b => b.classList.toggle('on', +b.dataset.pg === v));
  };
  r.oninput = () => set(r.value);
  n.oninput = () => { if (n.value !== '') set(n.value); };
  n.onblur = () => set(n.value);
  f.querySelectorAll('[data-pg]').forEach(b => { b.onclick = () => set(b.dataset.pg); });
  set(r.value);
  return () => Math.min(100, Math.max(0, Math.round(+n.value) || 0));
}

/* ---------- views ---------- */
function taskHTML(t) {
  const hasD = !!t.detail;
  const tg = taskTags(t);
  const di = !t.done && t.due ? dueInfo(t) : null;
  return `<div class="task ${t.done ? 'done' : ''}" data-id="${t.id}"${di && (di.cls) ? ` data-due="${di.cls}"` : ''}${tg.length ? ` data-tg style="--tg1:${tg[0].color}"` : ''}>
    <button class="chk" data-act="toggle" aria-label="Toggle done">${CHECK}</button>
    <div class="tt" data-act="edit" tabindex="0" role="button"><span class="tx">${di && di.n <= 0 ? '<span class="sn">' + SANTA + '</span>' : ''}${hl(t.title)}${t.repeat ? RPT : ''}</span>${hasD ? NOTE : ''}${tagsHTML(t)}${pgNum(t)}
      ${hasD ? `<div class="prev">${esc(firstLine(t.detail))}</div>` : ''}
      ${t.done ? doneInfo(t) : timelineHTML(t)}</div>
    ${pgBar(t)}
    ${t.done ? '' : `<span class="handle" data-drag aria-label="Drag to move">${HANDLE}</span>`}
  </div>`;
}

function matrixHTML() {
  const L = live().filter(match);
  const act = L.filter(t => !t.done);
  const dn = L.filter(t => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const backlog = act.filter(t => t.q === 'backlog').sort(cmpList);
  let h = `<section class="backlog-sec backlog" data-drop="backlog">
    <div class="sec-h"><div class="nm"><b>Backlog</b><span class="cnt">${backlog.length}</span><small>Unsorted — hold ⠿ for 0.5 s, then drag to a quadrant</small></div>
      <button class="addq expq" data-act="expand" data-q="backlog" aria-label="Open Backlog full screen" title="Open in a dialog (or double-tap the title)">${EXPAND}</button></div>
    ${backlog.length ? backlog.map(taskHTML).join('') : '<p class="empty">Backlog is empty. Tap + to add a task.</p>'}
  </section><div class="matrix">`;
  for (const q of Q) {
    const items = act.filter(t => t.q === q.id).sort(cmpList);
    h += `<section class="quad ${q.id}" data-drop="${q.id}">
      <div class="sec-h"><div class="nm"><b>${q.name}</b><span class="cnt">${items.length}</span><small>${q.sub}</small></div>
        <button class="addq expq" data-act="expand" data-q="${q.id}" aria-label="Open ${q.name} full screen" title="Open in a dialog (or double-tap the title)">${EXPAND}</button>
        <button class="addq" data-act="addq" data-q="${q.id}" aria-label="Add to ${q.name}">${PLUS}</button></div>
      <div class="list">${items.length ? items.map(taskHTML).join('') : '<p class="empty">Drop tasks here</p>'}</div>
    </section>`;
  }
  h += '</div>';
  if (dn.length) {
    h += `<section class="donesec"><button class="dh" data-act="toggledone"><b>Done</b><span class="cnt">${dn.length}</span><span>${C.showDone || search ? '▾' : '▸'}</span></button>
      ${C.showDone || search ? `<div class="list">${dn.map(taskHTML).join('')}<button class="btn small" data-act="cleardone">Clear done</button></div>` : ''}</section>`;
  }
  return h;
}

function tableBodyHTML() {
  let L = live();
  if (C.status === 'active') L = L.filter(t => !t.done);
  else if (C.status === 'done') L = L.filter(t => t.done);
  if (C.fq !== 'all') L = L.filter(t => t.q === C.fq);
  if (C.ftag === 'none') L = L.filter(t => !taskTags(t).length);
  else if (C.ftag !== 'all') L = L.filter(t => (t.tags || []).includes(C.ftag));
  L = L.filter(match);
  const sorters = {
    q: (a, b) => QORD[a.q] - QORD[b.q] || cmpList(a, b),
    due: cmpDue,
    new: (a, b) => b.created - a.created,
    title: (a, b) => a.title.localeCompare(b.title),
  };
  L.sort(sorters[C.sort] || sorters.q);
  if (!L.length) return '<p class="empty big">No tasks here.</p>';
  const opts = cur => ORDER.map(k => `<option value="${k}" ${k === cur ? 'selected' : ''}>${QN[k]}</option>`).join('');
  const row = t => `<tr class="row ${t.q} ${t.done ? 'done' : ''}" data-id="${t.id}">
      <td><button class="chk" data-act="toggle" aria-label="Toggle done">${CHECK}</button></td>
      <td class="ttl" data-act="edit" tabindex="0" role="button"><span class="tx">${hl(t.title)}${t.repeat ? RPT : ''}</span>${t.detail ? NOTE : ''}${pgNum(t)}<span class="nw">${t.done ? doneInfo(t) : (t.due ? '<br>' + dueCell(t) : '')}</span><div class="nw">${tagsHTML(t)}</div></td>
      <td class="wide">${tagsHTML(t) || '<span class="muted">—</span>'}</td>
      <td><select class="qsel">${opts(t.q)}</select></td>
      <td class="wide">${dueCell(t)}</td>
      <td class="wide">${t.done ? esc(doneText(t)) : '<span class="muted">—</span>'}</td></tr>`;
  let body;
  if (C.group === 'tag') {
    const groups = [...liveTags().map(g => ({ g, rows: L.filter(t => (t.tags || []).includes(g.id)) })), { g: null, rows: L.filter(t => !taskTags(t).length) }];
    body = groups.filter(x => x.rows.length).map(x => `<tr class="grp"><td colspan="6"><span class="tg" style="--tc:${x.g ? x.g.color : '#6b7280'}"><i></i><span class="n">${x.g ? esc(x.g.name) : 'No tag'}</span></span> <span class="cnt">${x.rows.length}</span></td></tr>${x.rows.map(row).join('')}`).join('');
  } else body = L.map(row).join('');
  return `<table><thead><tr><th></th><th>Task</th><th class="wide">Tags</th><th>Quadrant</th><th class="wide">Deadline</th><th class="wide">Done</th></tr></thead><tbody>${body}</tbody></table>`;
}

function tableHTML() {
  const sc = (v, l) => `<button class="chip ${C.status === v ? 'on' : ''}" data-act="status" data-v="${v}">${l}</button>`;
  const sorts = [['q', 'Sort: Quadrant'], ['due', 'Sort: Deadline'], ['new', 'Sort: Newest'], ['title', 'Sort: A–Z']];
  return `<div class="bar">
    <div class="chips">${sc('active', 'Active')}${sc('done', 'Done')}${sc('all', 'All')}</div>
    <select id="t-q"><option value="all">All quadrants</option>${ORDER.map(k => `<option value="${k}" ${C.fq === k ? 'selected' : ''}>${QN[k]}</option>`).join('')}</select>
    <select id="t-tag"><option value="all">All tags</option><option value="none" ${C.ftag === 'none' ? 'selected' : ''}>No tag</option>${liveTags().map(g => `<option value="${g.id}" ${C.ftag === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select>
    <select id="t-group"><option value="none">No grouping</option><option value="tag" ${C.group === 'tag' ? 'selected' : ''}>Group by tag</option></select>
    <select id="t-sort">${sorts.map(([v, l]) => `<option value="${v}" ${C.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
  </div><div id="tbl">${tableBodyHTML()}</div>`;
}

function render() {
  if (drag || hold) { pendingRender = true; return; }
  pendingRender = false;
  const y = window.scrollY;
  const inner = {};
  document.querySelectorAll('#app [data-drop]').forEach(el => { inner[el.dataset.drop] = el.scrollTop; });
  $('#app').innerHTML = C.view === 'table' ? tableHTML() : matrixHTML();
  $('#app').className = 'v-' + C.view + (C.compact === false ? '' : ' compact');
  document.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', b.dataset.v === C.view));
  updateSyncUI();
  document.querySelectorAll('#app [data-drop]').forEach(el => { if (inner[el.dataset.drop]) el.scrollTop = inner[el.dataset.drop]; });
  if (window.scrollY !== y) window.scrollTo(0, y);
}

/* ---------- quick search (replaces the header row while open) ---------- */
function openSearch() { $('#qs-in').focus(); }
function closeSearch() {
  $('#qs-in').value = '';
  if (search) { search = ''; render(); }
}
document.addEventListener('keydown', e => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || ''));
  if (e.key === '/' && !typing && !sheetOpen) { e.preventDefault(); openSearch(); }
  else if (e.key === 'Escape' && e.target.id === 'qs-in' && !sheetOpen) { closeSearch(); e.target.blur(); }
});

/* ---------- day-of-week mood (background theme + footer line) ---------- */
const MOODS = {
  1: '💪 Monday — power up!',
  2: '📅 Tuesday — meeting day',
  3: '😌 Wednesday — comfy',
  4: '😄 Thursday — no-mental day',
  5: '🏠 Friday — remote day',
  6: '🛋️ Saturday — chill at home',
  0: '🏡 Sunday — rest & recharge',
};
let shownDay = '';
function applyDay() {
  const now = new Date(), k = today(), d = now.getDay();
  document.documentElement.dataset.day = String(d);
  const m = $('#mood');
  if (m) m.textContent = MOODS[d] || '';
  const changed = shownDay && shownDay !== k;
  shownDay = k;
  if (changed) { const mv = runPromote(); render(); announcePromo(mv); } // a new day started while the app stayed open: refresh deadline labels
}

/* ---------- one quadrant, big and readable (double-tap its title, or the ⤢ button) ---------- */
function openQuad(q) {
  const items = live().filter(t => !t.done && t.q === q && match(t)).sort(cmpList);
  const rows = items.map(t => {
    const i = t.due ? dueInfo(t) : null, tg = taskTags(t), dl = firstLine(t.detail);
    return `<div class="brow qrow" data-id="${t.id}" style="--c:var(--${q === 'backlog' ? 'muted' : q})">
      <button class="bchk" data-bchk aria-label="Mark done">${CHECK}</button>
      <div class="bmain" data-bedit tabindex="0" role="button"><span class="tx">${i && i.n <= 0 ? '<span class="sn2">' + SANTA + '</span>' : ''}${hl(t.title)}${t.repeat ? RPT : ''}</span>
        ${dl ? `<span class="qd">${esc(dl)}</span>` : ''}
        ${pgBar(t)}
        <span class="bmeta">${i ? `<span class="${i.cls}">${i.txt}</span>` : '<span>No deadline</span>'}${pgNum(t)}${tg.map(g => `<span class="tg" style="--tc:${g.color}"><i></i><span class="n">${esc(g.name)}</span></span>`).join('')}</span></div></div>`;
  }).join('');
  openSheet(`<div class="sh"><b>${QN[q]} <span class="cnt">${items.length}</span></b><button class="x" data-act="close" aria-label="Close">✕</button></div>
    ${rows || '<p class="empty">Nothing here yet.</p>'}
    <div class="acts"><button class="btn" id="qd-add">+ Add to ${QN[q]}</button><button class="btn primary" data-act="close">Close</button></div>`, () => {
    document.querySelectorAll('#panel .qrow').forEach(r => {
      const id = r.dataset.id;
      r.querySelector('[data-bchk]').onclick = () => { toggle(id, r); setTimeout(() => openQuad(q), 60); };
      const ed = r.querySelector('[data-bedit]');
      ed.onclick = () => openEdit(id);
      ed.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEdit(id); } };
    });
    $('#qd-add').onclick = () => openAdd(q);
  });
}
// double-tap / double-click on a section title opens it as a dialog
let lastTap = null;
document.addEventListener('pointerup', e => {
  const h = e.target.closest && e.target.closest('#app.v-matrix .sec-h');
  if (!h || e.target.closest('button') || sheetOpen) { lastTap = null; return; }
  const sec = h.closest('[data-drop]'); if (!sec) return;
  const now = Date.now();
  if (lastTap && lastTap.q === sec.dataset.drop && now - lastTap.t < 400 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40) {
    lastTap = null; openQuad(sec.dataset.drop);
    // the click that follows this pointerup would land on whatever the new dialog put under the finger: swallow it
    const eat = ev => { ev.stopPropagation(); ev.preventDefault(); };
    document.addEventListener('click', eat, true);
    setTimeout(() => document.removeEventListener('click', eat, true), 350);
  }
  else lastTap = { q: sec.dataset.drop, t: now, x: e.clientX, y: e.clientY };
});

/* ---------- today's focus pop-up: overdue + due today ---------- */
function briefTasks() {
  return live().filter(t => !t.done && t.due && dayDiff(t.due, today()) <= 0)
    .sort((a, b) => a.due.localeCompare(b.due) || ORDER.indexOf(a.q) - ORDER.indexOf(b.q));
}
function openBrief() {
  const L = briefTasks();
  const late = L.filter(t => dayDiff(t.due, today()) < 0).length, now = L.length - late;
  const rows = L.map(t => { const i = dueInfo(t); return `<div class="brow" data-id="${t.id}" style="--c:var(--${t.q})">
    <button class="bchk" data-bchk aria-label="Mark done">${CHECK}</button>
    <div class="bmain" data-bedit tabindex="0" role="button"><span class="tx">${esc(t.title)}</span><span class="bmeta"><i></i>${QN[t.q]} · <span class="${i.cls}">${i.txt}</span></span></div></div>`; }).join('');
  openSheet(`<div class="sh"><b>🎯 Today’s focus</b><button class="x" data-act="close" aria-label="Close">✕</button></div>
    ${L.length ? `<p class="brief-sub">${[late ? late + ' overdue' : '', now ? now + ' due today' : ''].filter(Boolean).join(' · ')} — tap ○ when done, tap a task to edit.</p>${rows}
    <div class="acts"><span></span><button class="btn primary" data-act="close">Got it</button></div>`
      : '<p class="empty">Nothing overdue or due today 🎉</p><div class="acts"><span></span><button class="btn primary" data-act="close">Nice</button></div>'}`, () => {
    document.querySelectorAll('#panel .brow').forEach(r => {
      const id = r.dataset.id;
      r.querySelector('[data-bchk]').onclick = () => { toggle(id, r); setTimeout(openBrief, 60); };
      const ed = r.querySelector('[data-bedit]');
      ed.onclick = () => openEdit(id);
      ed.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEdit(id); } };
    });
  });
}
function maybeBrief() { // once per browser session and day, only when there is something to show
  if (C.brief === false || sheetOpen) return;
  const k = 'eisen.brief';
  try { if (sessionStorage.getItem(k) === today()) return; } catch (_) { /* ignore */ }
  if (!briefTasks().length) return;
  try { sessionStorage.setItem(k, today()); } catch (_) { /* ignore */ }
  openBrief();
}

/* ---------- sheets ---------- */
let sheetOpen = false, sheetGuard = null; // sheetGuard(): true while the open dialog holds unsaved input
function openSheet(html, bind) {
  $('#panel').innerHTML = html;
  $('#overlay').hidden = false;
  document.body.classList.add('noscroll');
  if (!sheetOpen) { try { history.pushState({ sheet: 1 }, ''); } catch (e) { /* ignore */ } }
  sheetOpen = true;
  sheetGuard = null;
  if (bind) bind();
}
function closeSheet(fromPop) {
  if (!sheetOpen) return;
  sheetOpen = false;
  sheetGuard = null;
  $('#overlay').hidden = true;
  document.body.classList.remove('noscroll');
  if (!fromPop) { try { history.back(); } catch (e) { /* ignore */ } }
}
// Outside tap / Esc / Back close the dialog, unless it holds typed input: then only the ✕ button closes it.
const blocked = () => {
  if (!(sheetOpen && sheetGuard && sheetGuard())) return false;
  toast('Tap ✕ to close — what you typed would be lost');
  return true;
};
window.addEventListener('popstate', () => {
  if (!sheetOpen) return;
  if (blocked()) { try { history.pushState({ sheet: 1 }, ''); } catch (e) { /* ignore */ } return; }
  closeSheet(true);
});
$('#overlay').addEventListener('click', e => { if (e.target.id === 'overlay' && !blocked()) closeSheet(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !blocked()) closeSheet(); });

const chips = cur => `<div class="chips">${ORDER.map(k => `<button type="button" class="chip ${k} ${k === cur ? 'on' : ''}" data-chip="${k}">${QN[k]}</button>`).join('')}</div>`;
function bindChips(cb) {
  const bs = document.querySelectorAll('#panel [data-chip]');
  bs.forEach(b => { b.onclick = () => { bs.forEach(x => x.classList.toggle('on', x === b)); cb(b.dataset.chip); }; });
}
// date input, optionally with quick buttons (Today / Tomorrow / +1 week / Clear)
function dateField(id, val, quick) {
  return `<div class="dfield"><input id="${id}" type="date" value="${val || ''}">${quick
    ? '<div class="chips qd"><button type="button" class="chip" data-qd="0">Today</button><button type="button" class="chip" data-qd="1">Tomorrow</button><button type="button" class="chip" data-qd="7">+1 week</button><button type="button" class="chip" data-qd="">Clear</button></div>'
    : ''}</div>`;
}
function bindQuickDates() {
  document.querySelectorAll('#panel .dfield').forEach(f => {
    const inp = f.querySelector('input'), bs = f.querySelectorAll('[data-qd]');
    // highlight the quick button whose date is currently selected (also when it was picked by hand)
    const sync = () => bs.forEach(b => b.classList.toggle('on', b.dataset.qd !== '' && inp.value === offsetDay(Number(b.dataset.qd))));
    bs.forEach(b => { b.onclick = () => { inp.value = b.dataset.qd === '' ? '' : offsetDay(Number(b.dataset.qd)); sync(); }; });
    inp.addEventListener('input', sync);
    inp.addEventListener('change', sync);
    sync();
  });
}

// multi-select tag chips for the add / edit dialogs
function tagPicker(sel) {
  const all = liveTags();
  if (!all.length) return '<p class="hint">No tags yet — create them with the tag button in the header.</p>';
  return `<div class="chips tpick">${all.map(g => `<button type="button" class="chip tgc ${sel.has(g.id) ? 'on' : ''}" data-tg="${g.id}" style="--tc:${g.color}">${esc(g.name)}</button>`).join('')}</div>`;
}
function bindTagPicker(sel) {
  document.querySelectorAll('#panel [data-tg]').forEach(b => { b.onclick = () => { const id = b.dataset.tg; sel.has(id) ? sel.delete(id) : sel.add(id); b.classList.toggle('on', sel.has(id)); }; });
}
const repeatSelect = (id, val) => `<select id="${id}"><option value="">Doesn’t repeat</option>${Object.entries(REPEATS).map(([k, l]) => `<option value="${k}" ${val === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
function openAdd(preQ) {
  const tsel = new Set();
  let q = preQ || 'backlog';
  openSheet(`<div class="sh"><b>New task</b><button class="x" data-act="close" aria-label="Close">✕</button></div>
    <input id="f-title" type="text" placeholder="What needs doing?" maxlength="200" autocomplete="off" enterkeyhint="done">
    <button type="button" class="linkbtn" id="f-more">+ Add detail</button>
    <textarea id="f-detail" rows="3" maxlength="2000" placeholder="Detail (optional)" hidden></textarea>
    <div class="lbl">Put in</div>${chips(q)}
    <div class="lbl">Deadline (optional)</div>${dateField('f-due', '', true)}
    <div class="lbl">Progress</div>${progressField('f-pg', 0)}
    <div class="lbl">Repeat</div>${repeatSelect('f-rep', null)}
    <div class="lbl">Tags (optional)</div>${tagPicker(tsel)}
    <div class="acts"><span id="f-msg" class="msg"></span><button class="btn primary" id="f-add">Add</button></div>`, () => {
    const ti = $('#f-title'), de = $('#f-detail');
    sheetGuard = () => !!(ti.value.trim() || de.value.trim() || $('#f-due').value || +$('#f-pg-n').value);
    bindChips(v => { q = v; });
    bindQuickDates();
    const getPg = bindProgress('f-pg');
    bindTagPicker(tsel);
    $('#f-more').onclick = () => { de.hidden = !de.hidden; $('#f-more').textContent = de.hidden ? '+ Add detail' : '− Hide detail'; if (!de.hidden) de.focus(); };
    const go = () => {
      const v = ti.value.trim();
      if (!v) { ti.focus(); return; }
      addTask({ title: v, detail: de.value.trim(), q, due: $('#f-due').value || null, progress: getPg(), repeat: $('#f-rep').value || null, tags: [...tsel] });
      ti.value = ''; de.value = ''; de.hidden = true; $('#f-more').textContent = '+ Add detail'; $('#f-due').value = '';
      $('#f-due').dispatchEvent(new Event('input', { bubbles: true }));
      $('#f-rep').value = ''; $('#f-pg').value = 0; $('#f-pg').dispatchEvent(new Event('input'));
      tsel.clear(); document.querySelectorAll('#panel [data-tg]').forEach(b => b.classList.remove('on'));
      $('#f-msg').textContent = 'Added ✓ → ' + QN[q];
      toast(`✓ Task added to ${QN[q]}: ${v.length > 28 ? v.slice(0, 28) + '…' : v}`, null, true);
      ti.focus();
    };
    $('#f-add').onclick = go;
    ti.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); go(); } };
    setTimeout(() => ti.focus(), 60);
  });
}

function openEdit(id) {
  const t = find(id);
  if (!t) return;
  let q = t.q;
  const tsel = new Set((t.tags || []).filter(id => tagById(id)));
  openSheet(`<div class="sh"><b>Edit task</b><button class="x" data-act="close" aria-label="Close">✕</button></div>
    <input id="e-title" type="text" value="${esc(t.title)}" maxlength="200" autocomplete="off">
    <div class="lbl">Detail</div>
    <textarea id="e-detail" rows="4" maxlength="2000" placeholder="Detail (optional)">${esc(t.detail)}</textarea>
    <div class="lbl">Move to</div>${chips(q)}
    <div class="lbl">Start date (optional — default: the day it was created)</div>${dateField('e-start', t.start, false)}
    <div class="lbl">Deadline</div>${dateField('e-due', t.due, true)}
    <div class="lbl">Progress</div>${progressField('e-pg', t.progress || 0)}
    <div class="lbl">Repeat</div>${repeatSelect('e-rep', t.repeat)}
    <div class="lbl">Tags</div>${tagPicker(tsel)}
    ${t.done ? `<p class="hint">Done ${esc(doneText(t))}</p>` : ''}
    <div class="acts"><button class="btn danger" id="e-del">Delete</button><button class="btn primary" id="e-save">Save</button></div>`, () => {
    bindChips(v => { q = v; });
    bindQuickDates();
    const getPg = bindProgress('e-pg');
    bindTagPicker(tsel);
    const save = () => {
      const title = $('#e-title').value.trim();
      if (!title) return;
      const rep = $('#e-rep').value || null;
      const dueV = $('#e-due').value || (rep ? today() : null);
      patch(id, { progress: getPg(), repeat: rep, reopenOn: rep ? t.reopenOn : null, nextDue: rep ? t.nextDue : null, homeQ: q === t.q ? t.homeQ : null, title, detail: $('#e-detail').value.trim(), q, order: q === t.q ? t.order : null, promotedFor: q === t.q ? t.promotedFor : ($('#e-due').value || null), start: $('#e-start').value || null, due: dueV, tags: [...tsel] });
      closeSheet();
    };
    $('#e-save').onclick = save;
    $('#e-title').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); save(); } };
    $('#e-del').onclick = () => {
      patch(id, { deleted: true });
      closeSheet();
      toast('Task deleted', () => patch(id, { deleted: false }));
    };
  });
}

// "Clear done" is destructive, so it needs a typed confirmation
function confirmClearDone() {
  const done = live().filter(t => t.done);
  const ids = done.filter(t => !t.repeat).map(t => t.id); // repeating tasks come back by themselves, so they are kept
  const kept = done.length - ids.length;
  if (!ids.length) { toast(kept ? 'Only repeating tasks are in Done — they come back by themselves' : 'Nothing to clear'); return; }
  openSheet(`<div class="sh"><b>Clear done tasks?</b><button class="x" data-act="close" aria-label="Close">✕</button></div>
    <p class="hint"><b>${ids.length}</b> completed task${ids.length > 1 ? 's' : ''} will be deleted${kept ? ` (${kept} repeating task${kept > 1 ? 's are' : ' is'} kept)` : ''}. You can undo right after, but not later.</p>
    <div class="lbl">Type <b>delete</b> to confirm</div>
    <input id="cd-in" type="text" placeholder="delete" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done">
    <div class="acts"><button class="btn" data-act="close">Cancel</button><button class="btn danger" id="cd-ok" disabled>Delete ${ids.length}</button></div>`, () => {
    const inp = $('#cd-in'), ok = $('#cd-ok');
    const valid = () => inp.value.trim().toLowerCase() === 'delete';
    inp.oninput = () => { ok.disabled = !valid(); };
    const go = () => {
      if (!valid()) return;
      closeSheet();
      mutate(() => { const now = clock(); D.tasks.forEach(t => { if (ids.includes(t.id)) { t.deleted = true; t.updatedAt = now; } }); });
      toast(ids.length + ' done task(s) cleared', () => mutate(() => { const now = clock(); D.tasks.forEach(t => { if (ids.includes(t.id)) { t.deleted = false; t.updatedAt = now; } }); }));
    };
    ok.onclick = go;
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); go(); } };
    setTimeout(() => inp.focus(), 50);
  });
}

function openTags() {
  const rows = liveTags().map(g => {
    const n = live().filter(t => !t.done && (t.tags || []).includes(g.id)).length;
    return `<div class="trow" data-tid="${g.id}"><input type="color" class="tcol" value="${g.color}" aria-label="Colour"><input type="text" class="tnm" value="${esc(g.name)}" maxlength="30"><span class="cnt" title="Active tasks">${n}</span><button class="x" data-del aria-label="Delete tag">✕</button></div>`;
  }).join('');
  openSheet(`<div class="sh"><b>Tags</b><button class="x" data-act="close" aria-label="Close">✕</button></div>
    <p class="hint">Create tags here, then pick them when adding or editing a task. The Table view can filter and group by tag.</p>
    ${rows || '<p class="empty">No tags yet.</p>'}
    <div class="lbl">New tag</div>
    <div class="trow"><input type="color" class="tcol" id="g-col" value="${TAG_COLORS[liveTags().length % TAG_COLORS.length]}" aria-label="Colour"><input type="text" class="tnm" id="g-name" maxlength="30" placeholder="e.g. WMS, Home, Study" autocomplete="off"><button class="btn primary" id="g-add">Add</button></div>
    <span id="g-msg" class="msg"></span>`, () => {
    const again = () => openTags();
    document.querySelectorAll('#panel .trow[data-tid]').forEach(r => {
      const id = r.dataset.tid;
      r.querySelector('.tcol').onchange = e => { patchTag(id, { color: e.target.value }); };
      r.querySelector('.tnm').onchange = e => {
        const v = e.target.value.trim();
        if (!v || liveTags().some(g => g.id !== id && g.name.toLowerCase() === v.toLowerCase())) { e.target.value = tagById(id).name; return; }
        patchTag(id, { name: v });
      };
      r.querySelector('[data-del]').onclick = () => {
        const g = tagById(id);
        patchTag(id, { deleted: true });
        again();
        toast(`Tag “${g.name}” deleted`, () => { patchTag(id, { deleted: false }); if (sheetOpen) again(); });
      };
    });
    const add = () => {
      const nm = $('#g-name').value.trim();
      if (!nm) { $('#g-name').focus(); return; }
      if (!addTag(nm, $('#g-col').value)) { $('#g-msg').textContent = 'A tag with this name already exists.'; return; }
      again();
      setTimeout(() => $('#g-name') && $('#g-name').focus(), 30);
    };
    $('#g-add').onclick = add;
    $('#g-name').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
  });
}

function openSettings() {
  const status = !configured() ? 'Not connected — data is stored on this device only.'
    : lastErr ? '✗ ' + lastErr
    : D.lastSync ? 'Last sync: ' + new Date(D.lastSync).toLocaleString() : 'Connected.';
  openSheet(`<div class="sh"><b>Sync (GitHub Gist)</b><button class="x" data-act="close" aria-label="Close">✕</button></div>
    <div class="lbl">Personal access token (classic, scope: gist)</div>
    <input id="s-token" type="password" value="${esc(C.token)}" autocomplete="off" placeholder="ghp_…">
    <div class="lbl">Gist ID (or paste the Gist URL)</div>
    <input id="s-gist" type="text" value="${esc(C.gist)}" autocomplete="off" placeholder="leave empty and tap “Create new Gist”">
    <p class="hint">The token is stored in plain text in this browser only — never give it more than the <b>gist</b> scope, and revoke it on GitHub if this device is lost.</p>
    <div class="acts" style="flex-wrap:wrap"><span id="s-msg" class="msg">${esc(status)}</span></div>
    <div class="acts" style="flex-wrap:wrap">
      <button class="btn" id="s-create">Create new Gist</button>
      <button class="btn primary" id="s-save">Save &amp; sync</button>
    </div>
    <div class="lbl">Display &amp; data</div>
    <label class="chk-row"><input type="checkbox" id="s-compact" ${C.compact === false ? '' : 'checked'}> Compact cards in Matrix (one line, status shown by colour)</label>
    <label class="chk-row"><input type="checkbox" id="s-fx" ${C.fx === false ? '' : 'checked'}> Celebration effect when a task is completed 🎉</label>
    <label class="chk-row"><input type="checkbox" id="s-brief" ${C.brief === false ? '' : 'checked'}> Show “Today’s focus” (overdue + due today) when the app opens</label>
    <div class="lbl">Auto-promote tasks due within (Next → Now, Maybe → Hand off)</div>
    <select id="s-promo">${[[0, 'Off'], [1, '1 day'], [2, '2 days'], [3, '3 days'], [5, '5 days']].map(([v, l]) => `<option value="${v}" ${(C.autoPromote === undefined ? 2 : +C.autoPromote) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <div class="lbl">Auto-clear done tasks after</div>
    <select id="s-auto">${[[0, 'Never'], [7, '7 days'], [14, '14 days'], [30, '30 days'], [60, '60 days']].map(([v, l]) => `<option value="${v}" ${(+C.autoClear || 0) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <div class="acts" style="flex-wrap:wrap">
      <button class="btn" id="s-export">Export backup (.json)</button>
      <button class="btn" id="s-import">Import backup…</button>
      <input type="file" id="s-file" accept="application/json,.json" hidden>
    </div>
    <div class="acts" style="justify-content:space-between">
      <button class="btn" id="s-install" ${installEvt ? '' : 'hidden'}>Install app</button>
      <button class="btn danger" id="s-off">Disconnect</button>
    </div>`, () => {
    const msg = $('#s-msg');
    $('#s-compact').onchange = e => { setC({ compact: e.target.checked }); render(); };
    $('#s-fx').onchange = e => { setC({ fx: e.target.checked }); };
    $('#s-brief').onchange = e => { setC({ brief: e.target.checked }); };
    $('#s-promo').onchange = e => { setC({ autoPromote: +e.target.value }); const mv = promote(); if (mv.length || mv.reopened.length) { D.rev++; D.dirty = true; saveData(); render(); schedulePush(); announcePromo(mv); } };
    $('#s-auto').onchange = e => { setC({ autoClear: +e.target.value }); const n = tidy(); if (n) { saveData(); render(); schedulePush(); toast(n + ' old done task(s) cleared'); } };
    $('#s-export').onclick = () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([serialize()], { type: 'application/json' }));
      a.download = 'priority-matrix-' + ymd(new Date()).replace(/-/g, '') + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      msg.textContent = '✓ Backup downloaded';
    };
    $('#s-import').onclick = () => $('#s-file').click();
    $('#s-file').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const obj = JSON.parse(await f.text());
        const ts = (Array.isArray(obj) ? obj : (obj.tasks || [])).map(clean).filter(Boolean);
        const gs = (Array.isArray(obj) ? [] : (obj.tags || [])).map(cleanTag).filter(g => g && g.name);
        if (!ts.length && !gs.length) throw new Error('No tasks found in this file');
        const before = live().length;
        mutate(() => { D.tasks = merge(D.tasks, ts); D.tags = merge(D.tags, gs); });
        msg.textContent = `✓ Imported — ${live().length - before} new task(s) added (newer local edits are kept)`;
      } catch (err) { msg.textContent = '✗ ' + (err.message || 'Invalid backup file'); }
      e.target.value = '';
    };
    $('#s-save').onclick = async () => {
      setC({ token: $('#s-token').value.trim(), gist: $('#s-gist').value.trim().split('/').filter(Boolean).pop() || '' });
      $('#s-gist').value = C.gist;
      if (!configured()) { msg.textContent = 'Enter both the token and the Gist ID, or tap “Create new Gist”.'; return; }
      msg.textContent = 'Syncing…';
      await sync(true);
      msg.textContent = lastErr ? '✗ ' + lastErr : '✓ Synced';
    };
    $('#s-create').onclick = async () => {
      const tok = $('#s-token').value.trim();
      if (!tok) { msg.textContent = 'Enter the token first.'; return; }
      setC({ token: tok });
      msg.textContent = 'Creating Gist…';
      try {
        const g = await gh('/gists', { method: 'POST', body: JSON.stringify({ description: 'Priority Matrix data', public: false, files: { [FILE]: { content: serialize() } } }) });
        setC({ gist: g.id });
        $('#s-gist').value = g.id;
        msg.textContent = 'Gist created. Syncing…';
        await sync(true);
        msg.textContent = lastErr ? '✗ ' + lastErr : '✓ Gist created and synced';
      } catch (e) { msg.textContent = '✗ ' + errMsg(e); }
    };
    $('#s-off').onclick = () => { setC({ token: '', gist: '' }); lastErr = ''; updateSyncUI(); closeSheet(); toast('Disconnected (local data kept)'); };
    $('#s-install').onclick = async () => { if (installEvt) { installEvt.prompt(); try { await installEvt.userChoice; } catch (e) { /* ignore */ } installEvt = null; closeSheet(); } };
  });
}

/* ---------- sync (GitHub Gist) ---------- */
function serialize() {
  return JSON.stringify({ version: 2, updated: new Date().toISOString(), tags: D.tags, tasks: [...D.tasks].sort((a, b) => a.created - b.created) }, null, 1);
}
async function gh(path, opts = {}) {
  const r = await fetch('https://api.github.com' + path, Object.assign({}, opts, {
    cache: 'no-store',
    headers: Object.assign({
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + C.token,
      'X-GitHub-Api-Version': '2022-11-28',
    }, opts.body ? { 'Content-Type': 'application/json' } : {}),
  }));
  if (!r.ok) { const e = new Error('GitHub ' + r.status); e.status = r.status; throw e; }
  return r.json();
}
function errMsg(e) {
  if (e.status === 401) return 'Token invalid or expired';
  if (e.status === 403) return 'Access denied or rate-limited';
  if (e.status === 404) return 'Gist not found — check the ID, and that the token has the "gist" scope';
  if (e.status) return 'GitHub error ' + e.status;
  return (e.message && e.message !== 'Failed to fetch') ? e.message : 'Offline — will retry';
}
function merge(a, b) {
  const m = new Map(a.map(t => [t.id, t]));
  for (const t of b) { const x = m.get(t.id); if (!x || t.updatedAt > x.updatedAt) m.set(t.id, t); }
  const cut = Date.now() - 30 * 864e5;
  return [...m.values()].filter(t => !(t.deleted && t.updatedAt < cut));
}
function same(a, b) {
  if (a.length !== b.length) return false;
  const m = new Map(b.map(t => [t.id, t.updatedAt]));
  return a.every(t => m.get(t.id) === t.updatedAt);
}
// housekeeping: auto-clear old done tasks, drop tag ids that no longer exist anywhere
function tidy() {
  const known = new Set(D.tags.map(g => g.id));
  let fixed = 0;
  D.tasks.forEach(t => { if (t.tags && t.tags.some(id => !known.has(id))) { t.tags = t.tags.filter(id => known.has(id)); fixed++; } });
  const days = +C.autoClear || 0;
  if (!days) return fixed;
  const cut = Date.now() - days * 864e5, now = clock();
  const old = D.tasks.filter(t => !t.deleted && t.done && !t.repeat && t.doneAt && t.doneAt < cut);
  old.forEach(t => { t.deleted = true; t.updatedAt = now; });
  if (old.length) { D.rev++; D.dirty = true; }
  return old.length + fixed;
}
function schedulePush() {
  if (!configured()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(sync, 2000);
  updateSyncUI();
}
async function pullGist(id) {
  const g = await gh('/gists/' + id);
  const f = g.files && g.files[FILE];
  let tasks = [], tags = [];
  if (f) {
    let text = f.content;
    if (f.truncated) text = await (await fetch(f.raw_url, { cache: 'no-store' })).text();
    let obj;
    try { obj = JSON.parse(text); } catch (_) { throw new Error('tasks.json in the Gist is not valid JSON'); }
    tasks = (Array.isArray(obj) ? obj : (obj.tasks || [])).map(clean).filter(Boolean);
    tags = (Array.isArray(obj) ? [] : (obj.tags || [])).map(cleanTag).filter(g => g && g.name);
  }
  return { tasks, tags };
}
// Gist has no compare-and-swap, so: pull, merge, re-pull right before writing (picks up another device's push made meanwhile),
// write, then read back once more to confirm nothing newer slipped in; if it did, merge it and push again.
async function sync() {
  if (!configured()) return;
  if (syncing) { again = true; return; }
  clearTimeout(pushTimer);
  syncing = true; lastErr = ''; updateSyncUI();
  const id = encodeURIComponent(C.gist);
  let promoted = [];
  const absorb = r => { D.tasks = merge(D.tasks, r.tasks); D.tags = merge(D.tags, r.tags); };
  try {
    let remote = await pullGist(id);
    absorb(remote);
    if (!same(D.tasks, remote.tasks) || !same(D.tags, remote.tags)) {
      const fresh = await pullGist(id); // re-read just before writing
      absorb(fresh);
      const revAtPush = D.rev;
      const t0 = Date.now();
      const put = await gh('/gists/' + id, { method: 'PATCH', body: JSON.stringify({ files: { [FILE]: { content: serialize() } } }) });
      // the Gist's updated_at is GitHub's own clock at the moment of the write → learn how far this device's clock is off
      const sd = Date.parse(put && put.updated_at);
      if (sd) { const sk = sd - (t0 + Date.now()) / 2; if (Math.abs(sk - (+C.skew || 0)) > 1500) setC({ skew: Math.abs(sk) < 1500 ? 0 : Math.round(sk) }); }
      const back = await pullGist(id); // read back: did another device write in between?
      const lost = !same(D.tasks, back.tasks) || !same(D.tags, back.tags);
      absorb(back);
      if (lost) again = true; else if (D.rev === revAtPush) D.dirty = false;
    } else {
      D.dirty = false;
    }
    D.lastSync = Date.now();
    tidy();
    promoted = runPromote();
  } catch (e) {
    lastErr = errMsg(e);
    again = false;
  } finally {
    syncing = false;
    saveData();
    updateSyncUI();
    render();
    announcePromo(promoted);
    maybeBrief();
    if (!lastErr && (again || D.dirty)) { again = false; schedulePush(); }
  }
}
function updateSyncUI() {
  const b = $('#btn-sync');
  if (!b) return;
  const s = !configured() ? 'off' : syncing ? 'busy' : lastErr ? 'err' : D.dirty ? 'pend' : 'ok';
  b.className = 'ico ' + s;
  b.title = { off: 'Not connected — open settings to set up Gist sync', busy: 'Syncing…', err: lastErr, pend: 'Changes pending', ok: 'Synced' }[s];
}

/* ---------- actions ---------- */
/* ---------- celebration: the card pops, confetti bursts, the ghost of the task flies down into Done ---------- */
function celebrate(src, q, title) {
  if (C.fx === false || !src || !src.getBoundingClientRect) return;
  const r = src.getBoundingClientRect();
  if (!r.width || !r.height) return;
  try { navigator.vibrate && navigator.vibrate(18); } catch (_) { /* ignore */ }
  let layer = $('#fx');
  if (!layer) { layer = document.createElement('div'); layer.id = 'fx'; document.body.appendChild(layer); }
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const dn = $('.donesec');
  const tr = dn && dn.getBoundingClientRect();
  const tx = tr && tr.height ? tr.left + tr.width / 2 : innerWidth / 2;
  const ty = tr && tr.height ? tr.top + Math.min(tr.height, 40) / 2 : innerHeight - 30;
  const dx = tx - cx, dy = ty - cy;
  const ghost = document.createElement('div');
  ghost.className = 'fx-card';
  ghost.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;--c:var(--${q})`;
  ghost.innerHTML = `<span class="fx-chk">✓</span><span class="fx-t">${esc(title)}</span>`;
  layer.appendChild(ghost);
  const fly = ghost.animate([
    { transform: 'translate(0,0) scale(1)', opacity: 1, offset: 0 },
    { transform: 'translate(0,-8px) scale(1.14)', opacity: 1, offset: .2, easing: 'ease-out' },
    { transform: `translate(${dx * .45}px,${dy * .3}px) scale(.62) rotate(-7deg)`, opacity: 1, offset: .58, easing: 'ease-in' },
    { transform: `translate(${dx}px,${dy}px) scale(.1) rotate(9deg)`, opacity: 0, offset: 1 },
  ], { duration: 1000, fill: 'forwards' });
  // shock ring + confetti at the moment of the pop
  const burstAt = 190;
  const ring = document.createElement('div');
  ring.className = 'fx-ring'; ring.style.cssText = `left:${cx}px;top:${cy}px;--c:var(--${q})`;
  layer.appendChild(ring);
  ring.animate([{ transform: 'translate(-50%,-50%) scale(.2)', opacity: .9 }, { transform: 'translate(-50%,-50%) scale(5)', opacity: 0 }], { duration: 650, delay: burstAt, fill: 'both' }).onfinish = () => ring.remove();
  const COL = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#facc15'];
  const EMO = ['🎉', '✨', '⭐', '🎊'];
  for (let i = 0; i < 34; i++) {
    const el = document.createElement('i');
    const emo = i % 9 === 0;
    el.className = 'fx-p' + (emo ? ' emo' : '');
    const sz = emo ? 18 + Math.random() * 8 : 6 + Math.random() * 6;
    if (emo) el.textContent = EMO[i % EMO.length];
    else { el.style.background = COL[i % COL.length]; el.style.borderRadius = Math.random() < .4 ? '50%' : '2px'; el.style.width = sz + 'px'; el.style.height = sz * (Math.random() < .5 ? 1 : .55) + 'px'; }
    el.style.left = cx + 'px'; el.style.top = cy + 'px';
    layer.appendChild(el);
    const ang = Math.random() * Math.PI * 2, sp = 70 + Math.random() * 150;
    const vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp - 40, rot = (Math.random() - .5) * 900;
    el.animate([
      { transform: 'translate(-50%,-50%) scale(.3)', opacity: 1, offset: 0 },
      { transform: `translate(calc(-50% + ${vx * .55}px),calc(-50% + ${vy * .55}px)) rotate(${rot / 2}deg) scale(1)`, opacity: 1, offset: .4, easing: 'ease-out' },
      { transform: `translate(calc(-50% + ${vx}px),calc(-50% + ${vy + 140}px)) rotate(${rot}deg) scale(.7)`, opacity: 0, offset: 1, easing: 'ease-in' },
    ], { duration: 750 + Math.random() * 450, delay: burstAt + Math.random() * 60, fill: 'both' }).onfinish = () => el.remove();
  }
  fly.onfinish = () => {
    ghost.remove();
    const d2 = $('.donesec');
    if (d2) d2.animate([{ transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(16,185,129,0)' }, { transform: 'scale(1.025)', boxShadow: '0 0 0 6px rgba(16,185,129,.35)', offset: .4 }, { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(16,185,129,0)' }], { duration: 520 });
  };
}
function toggle(id, src) {
  const t = find(id);
  if (!t) return;
  if (t.done) {
    const oldAt = t.doneAt, oldFrom = t.doneFrom;
    const oldRe = t.reopenOn, oldNd = t.nextDue;
    patch(id, { done: false, doneAt: null, doneFrom: null, reopenOn: null, nextDue: null });
    toast('Task restored', () => patch(id, { done: true, doneAt: oldAt, doneFrom: oldFrom, reopenOn: oldRe, nextDue: oldNd }));
  } else {
    if (!src) src = [...document.querySelectorAll(`[data-id="${id}"]`)].find(e => e.offsetParent && e.getBoundingClientRect().width);
    celebrate(src && (src.closest('.task,.brow') || src), t.q, t.title);
    if (t.repeat) {
      const tk = today(), base = t.due || tk;
      const nextDue = nextOccurrence(base, t.repeat);
      const dayAfter = d => { const x = parseYmd(d); x.setDate(x.getDate() + 1); return ymd(x); };
      const reopenOn = [dayAfter(base), dayAfter(tk)].sort().pop(); // the day after this cycle's deadline (or tomorrow if done late)
      const oldPg = t.progress;
      patch(id, { done: true, doneAt: Date.now(), doneFrom: t.q, homeQ: t.homeQ || t.q, reopenOn, nextDue, due: base, progress: 0 }); // a new cycle starts from 0 %
      toast(`Done ✓ — 🔁 comes back ${fmtShort(reopenOn)} (due ${fmtShort(nextDue)})`, () => patch(id, { done: false, doneAt: null, doneFrom: null, reopenOn: null, nextDue: null, progress: oldPg }));
    } else {
    patch(id, { done: true, doneAt: Date.now(), doneFrom: t.q });
    toast('Task completed ✓', () => patch(id, { done: false, doneAt: null, doneFrom: null }));
    }
  }
}

document.addEventListener('click', e => {
  const pill = e.target.closest('.tg[data-name]');
  if (pill) { const inp = $('#qs-in'); inp.value = '#' + pill.dataset.name; search = inp.value.toLowerCase(); render(); return; }
  const a = e.target.closest('[data-act]');
  if (!a) return;
  const row = a.closest('[data-id]');
  const id = row && row.dataset.id;
  switch (a.dataset.act) {
    case 'toggle': toggle(id, row); break;
    case 'edit': openEdit(id); break;
    case 'view': setC({ view: a.dataset.v }); render(); window.scrollTo(0, 0); break;
    case 'add': openAdd(); break;
    case 'addq': openAdd(a.dataset.q); break;
    case 'expand': openQuad(a.dataset.q); break;
    case 'tags': openTags(); break;
    case 'settings': openSettings(); break;
    case 'sync': configured() ? sync() : openSettings(); break;
    case 'close': closeSheet(); break;
    case 'toggledone': setC({ showDone: !C.showDone }); render(); break;
    case 'status': setC({ status: a.dataset.v }); render(); break;
    case 'cleardone': confirmClearDone(); break;
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.matches && t.matches('.qsel')) { const r = find(t.closest('[data-id]').dataset.id); patch(r.id, { q: t.value, order: null, promotedFor: r.due, homeQ: null }); }
  else if (t.id === 't-q') { setC({ fq: t.value }); render(); }
  else if (t.id === 't-tag') { setC({ ftag: t.value }); render(); }
  else if (t.id === 't-group') { setC({ group: t.value }); render(); }
  else if (t.id === 't-sort') { setC({ sort: t.value }); render(); }
});
document.addEventListener('keydown', e => {
  const el = e.target;
  if ((e.key === 'Enter' || e.key === ' ') && el.matches && el.matches('[data-act=edit][tabindex]')) { e.preventDefault(); el.click(); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'qs-in') { search = e.target.value.trim(); render(); }
});

/* ---------- drag & drop (pointer events: touch + mouse) ---------- */
// Where would the dragged card land inside `box`? Returns the other cards (display order), the slot index and the card's own index.
function dropSlot(box, y, id) {
  const all = [...box.querySelectorAll('.task[data-id]')];
  const els = all.filter(el => el.dataset.id !== id);
  const me = find(id);
  const dueOf = el => { const x = find(el.dataset.id); return x && x.due; };
  let i = 0;
  if (me && me.due) {
    // dated tasks are always sorted by deadline: the slot is fixed by the date, not by where the finger is
    for (const el of els) { const d = dueOf(el); if (d && d <= me.due) i++; else break; }
  } else {
    for (const el of els) { const r = el.getBoundingClientRect(); if (y > r.top + r.height / 2) i++; else break; }
    i = Math.max(i, els.filter(dueOf).length); // undated tasks always sit below the dated ones
  }
  return { els, i, orig: all.findIndex(el => el.dataset.id === id) };
}
function clearMarks() {
  document.querySelectorAll('.ins-before,.ins-after').forEach(el => el.classList.remove('ins-before', 'ins-after'));
}
// Put task `id` into `target` at slot `i` among `ids` (the other tasks there, in display order).
function placeTask(id, target, ids, i) {
  const t = find(id);
  const list = ids.map(find).filter(Boolean);
  const now = clock();
  mutate(() => {
    if (list.some(x => x.order == null)) list.forEach((x, k) => { x.order = (k + 1) * 1000; x.updatedAt = now; });
    const p = list[i - 1], n = list[i];
    t.order = p && n ? (p.order + n.order) / 2 : n ? n.order - 1000 : p ? p.order + 1000 : 1000;
    t.q = target; t.updatedAt = now; t.promotedFor = t.due; t.homeQ = null;
  });
}
function moveGhost() {
  drag.ghost.style.transform = `translate(${drag.x - drag.dx}px,${drag.y - drag.dy}px)`;
}
function tick() {
  if (!drag) return;
  if (drag.y < 90) window.scrollBy(0, -14);
  else if (drag.y > window.innerHeight - 110) window.scrollBy(0, 14);
  const el = document.elementFromPoint(drag.x, drag.y);
  const t = el ? el.closest('[data-drop]') : null;
  if (t !== drag.over) {
    if (drag.over) drag.over.classList.remove('over');
    if (t) t.classList.add('over');
    drag.over = t;
  }
  // insertion line + auto-scroll inside a quadrant that scrolls (landscape)
  clearMarks();
  if (t) {
    const { els, i } = dropSlot(t, drag.y, drag.id);
    if (els.length) (i < els.length ? els[i] : els[els.length - 1]).classList.add(i < els.length ? 'ins-before' : 'ins-after');
    if (t.scrollHeight > t.clientHeight + 2) {
      const r = t.getBoundingClientRect();
      if (drag.y < r.top + 36) t.scrollTop -= 8;
      else if (drag.y > r.bottom - 36) t.scrollTop += 8;
    }
  }
  drag.raf = requestAnimationFrame(tick);
}
// Dragging only starts after the handle is held for HOLD_MS without moving more than HOLD_SLOP px.
const HOLD_MS = 500, HOLD_SLOP = 12;
function cancelHold() {
  if (!hold) return;
  clearTimeout(hold.timer);
  hold.row.classList.remove('holding');
  hold = null;
  if (pendingRender) render();
}
function beginDrag() {
  const hd = hold;
  hold = null;
  if (!hd) return;
  hd.row.classList.remove('holding');
  if (!hd.row.isConnected) { if (pendingRender) render(); return; }
  const r = hd.row.getBoundingClientRect();
  const ghost = hd.row.cloneNode(true);
  ghost.classList.add('ghost');
  ghost.removeAttribute('data-id');
  ghost.style.width = r.width + 'px';
  document.body.appendChild(ghost);
  drag = { id: hd.row.dataset.id, ghost, row: hd.row, dx: hd.x - r.left, dy: hd.y - r.top, pid: hd.pid, x: hd.x, y: hd.y, over: null, raf: 0 };
  hd.row.classList.add('lifting');
  document.body.classList.add('dragging');
  try { if (navigator.vibrate) navigator.vibrate(30); } catch (_) { /* ignore */ }
  moveGhost();
  drag.raf = requestAnimationFrame(tick);
}
document.addEventListener('pointerdown', e => {
  const h = e.target.closest('[data-drag]');
  if (!h || drag || hold) return;
  const row = h.closest('.task');
  if (!row) return;
  e.preventDefault();
  hold = { pid: e.pointerId, row, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, timer: setTimeout(beginDrag, HOLD_MS) };
  row.classList.add('holding');
  try { h.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
});
document.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('[data-drag]')) e.preventDefault(); });
document.addEventListener('pointermove', e => {
  if (hold && e.pointerId === hold.pid) {
    hold.x = e.clientX; hold.y = e.clientY;
    if (Math.hypot(hold.x - hold.sx, hold.y - hold.sy) > HOLD_SLOP) cancelHold();
    return;
  }
  if (!drag || e.pointerId !== drag.pid) return;
  drag.x = e.clientX; drag.y = e.clientY;
  moveGhost();
});
function endDrag(e, cancel) {
  if (!drag || e.pointerId !== drag.pid) return;
  const d = drag;
  drag = null;
  cancelAnimationFrame(d.raf);
  d.ghost.remove();
  if (d.over) d.over.classList.remove('over');
  d.row.classList.remove('lifting');
  document.body.classList.remove('dragging');
  clearMarks();
  const target = !cancel && d.over ? d.over.dataset.drop : null;
  const t = find(d.id);
  if (target && t) {
    const { els, i, orig } = dropSlot(d.over, d.y, d.id);
    if (t.due) {
      // dated task: it can change quadrant, but its place in the list is set by its deadline
      if (target !== t.q) {
        const prevQ = t.q, prevOrder = t.order == null ? null : t.order;
        patch(d.id, { q: target, order: null });
        toast('Moved to ' + QN[target], () => patch(d.id, { q: prevQ, order: prevOrder }));
      } else {
        toast('Tasks with a deadline stay sorted by date');
      }
    } else if (target !== t.q || i !== orig) {
      const prevQ = t.q, prevOrder = t.order == null ? null : t.order;
      placeTask(d.id, target, els.map(el => el.dataset.id), i);
      toast(target === prevQ ? 'Order changed' : 'Moved to ' + QN[target], () => patch(d.id, { q: prevQ, order: prevOrder }));
    }
  }
  if (pendingRender) render();
}
document.addEventListener('pointerup', e => { if (hold && e.pointerId === hold.pid) cancelHold(); endDrag(e, false); });
document.addEventListener('pointercancel', e => { if (hold && e.pointerId === hold.pid) cancelHold(); endDrag(e, true); });

/* ---------- lifecycle ---------- */
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
document.addEventListener('visibilitychange', () => { if (!document.hidden) applyDay(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && configured() && Date.now() - D.lastSync > 15000) sync(); });
window.addEventListener('online', () => sync());

{ const n = tidy(); if (n) { saveData(); schedulePush(); } }
const startMv = runPromote();
applyDay();
render();
announcePromo(startMv);
if (configured()) sync();
if (/[?&]add\b/.test(location.search)) {
  try { history.replaceState(null, '', location.pathname); } catch (_) { /* ignore */ }
  openAdd();
} else maybeBrief();
$('#mood').addEventListener('click', () => { if (!sheetOpen) openBrief(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
