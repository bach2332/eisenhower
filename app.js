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
  };
}

/* ---------- state ---------- */
let D = Object.assign({ tasks: [], dirty: false, rev: 0, lastSync: 0 }, lsGet(K_DATA, {}));
D.tasks = (D.tasks || []).map(clean).filter(Boolean);
let C = Object.assign({ token: '', gist: '', view: 'matrix', showDone: false, status: 'active', fq: 'all', sort: 'q' }, lsGet(K_CFG, {}));
let search = '';
let drag = null, hold = null, pendingRender = false;
let syncing = false, again = false, lastErr = '', pushTimer = null, installEvt = null;

const saveData = () => lsSet(K_DATA, { tasks: D.tasks, dirty: D.dirty, rev: D.rev, lastSync: D.lastSync });
const setC = o => { Object.assign(C, o); lsSet(K_CFG, C); };
const configured = () => !!(C.token && C.gist);
const live = () => D.tasks.filter(t => !t.deleted);
const find = id => D.tasks.find(t => t.id === id && !t.deleted);

function mutate(fn) {
  fn();
  D.rev++; D.dirty = true;
  saveData(); render(); schedulePush();
}
function patch(id, o) {
  const t = D.tasks.find(x => x.id === id);
  if (!t) return;
  mutate(() => Object.assign(t, o, { updatedAt: Date.now() }));
}
function addTask(f) {
  const now = Date.now();
  mutate(() => D.tasks.push({
    id: uid(), title: f.title, detail: f.detail || '', q: f.q, done: false, doneAt: null, doneFrom: null,
    start: null, due: f.due || null, created: now, updatedAt: now, deleted: false,
  }));
}

/* ---------- toast ---------- */
let toastT;
function toast(msg, undo) {
  const el = $('#toast');
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
function timelineHTML(t) {
  if (!t.due || t.done) return '';
  const info = dueInfo(t);
  const startStr = t.start || ymd(new Date(t.created || Date.now()));
  const total = Math.max(1, dayDiff(t.due, startStr));
  const elapsed = dayDiff(today(), startStr);
  const pct = Math.max(0, Math.min(100, Math.round(elapsed / total * 100)));
  return `<div class="tl ${info.cls}"><div class="tl-t"><span>${fmtShort(startStr)} → ${fmtShort(t.due)}</span><b>${info.txt}</b></div><div class="track"><i style="width:${pct}%"></i></div></div>`;
}
function doneText(t) {
  return (t.doneAt ? fmtTs(t.doneAt) : '') + (t.doneFrom ? ' · from ' + QN[t.doneFrom] : '');
}
const doneInfo = t => t.done ? `<div class="doneinfo">Done ${esc(doneText(t))}</div>` : '';
function dueCell(t) {
  if (!t.due) return '<span class="muted">—</span>';
  if (t.done) return `<span class="due">${fmtShort(t.due)}</span>`;
  const i = dueInfo(t);
  return `<span class="due ${i.cls}">${i.txt}</span>`;
}
const cmpDue = (a, b) => {
  const x = a.due || '9999', y = b.due || '9999';
  return x < y ? -1 : x > y ? 1 : a.created - b.created;
};
// manual order: tasks with an order come first (ascending); the rest keep their default sort
const cmpOrder = (a, b) => {
  const x = a.order, y = b.order;
  if (x != null && y != null) return x - y;
  return x != null ? -1 : y != null ? 1 : 0;
};
const firstLine = d => (d.split('\n').find(l => l.trim()) || '').trim();

/* ---------- views ---------- */
function taskHTML(t) {
  const hasD = !!t.detail;
  return `<div class="task ${t.done ? 'done' : ''}" data-id="${t.id}">
    <button class="chk" data-act="toggle" aria-label="Toggle done">${CHECK}</button>
    <div class="tt" data-act="edit"><span class="tx">${esc(t.title)}</span>${hasD ? NOTE : ''}
      ${hasD ? `<div class="prev">${esc(firstLine(t.detail))}</div>` : ''}
      ${t.done ? doneInfo(t) : timelineHTML(t)}</div>
    ${t.done ? '' : `<span class="handle" data-drag aria-label="Drag to move">${HANDLE}</span>`}
  </div>`;
}

function matrixHTML() {
  const L = live();
  const act = L.filter(t => !t.done);
  const dn = L.filter(t => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const backlog = act.filter(t => t.q === 'backlog').sort((a, b) => cmpOrder(a, b) || a.created - b.created);
  let h = `<section class="backlog-sec backlog" data-drop="backlog">
    <div class="sec-h"><div class="nm"><b>Backlog</b><small>Unsorted — hold ⠿ for 1 s, then drag to a quadrant</small></div><span class="cnt">${backlog.length}</span></div>
    ${backlog.length ? backlog.map(taskHTML).join('') : '<p class="empty">Backlog is empty. Tap + to add a task.</p>'}
  </section><div class="matrix">`;
  for (const q of Q) {
    const items = act.filter(t => t.q === q.id).sort((a, b) => cmpOrder(a, b) || cmpDue(a, b));
    h += `<section class="quad ${q.id}" data-drop="${q.id}">
      <div class="sec-h"><div class="nm"><b>${q.name}</b><small>${q.sub}</small></div><span class="cnt">${items.length}</span>
        <button class="addq" data-act="addq" data-q="${q.id}" aria-label="Add to ${q.name}">${PLUS}</button></div>
      <div class="list">${items.length ? items.map(taskHTML).join('') : '<p class="empty">Drop tasks here</p>'}</div>
    </section>`;
  }
  h += '</div>';
  if (dn.length) {
    h += `<section class="donesec"><button class="dh" data-act="toggledone"><b>Done</b><span class="cnt">${dn.length}</span><span>${C.showDone ? '▾' : '▸'}</span></button>
      ${C.showDone ? `<div class="list">${dn.map(taskHTML).join('')}<button class="btn small" data-act="cleardone">Clear done</button></div>` : ''}</section>`;
  }
  return h;
}

function tableBodyHTML() {
  let L = live();
  if (C.status === 'active') L = L.filter(t => !t.done);
  else if (C.status === 'done') L = L.filter(t => t.done);
  if (C.fq !== 'all') L = L.filter(t => t.q === C.fq);
  if (search) { const s = search.toLowerCase(); L = L.filter(t => t.title.toLowerCase().includes(s) || t.detail.toLowerCase().includes(s)); }
  const sorters = {
    q: (a, b) => QORD[a.q] - QORD[b.q] || cmpOrder(a, b) || cmpDue(a, b),
    due: cmpDue,
    new: (a, b) => b.created - a.created,
    title: (a, b) => a.title.localeCompare(b.title),
  };
  L.sort(sorters[C.sort] || sorters.q);
  if (!L.length) return '<p class="empty big">No tasks here.</p>';
  const opts = cur => ORDER.map(k => `<option value="${k}" ${k === cur ? 'selected' : ''}>${QN[k]}</option>`).join('');
  return `<table><thead><tr><th></th><th>Task</th><th>Quadrant</th><th class="wide">Deadline</th><th class="wide">Done</th></tr></thead><tbody>
    ${L.map(t => `<tr class="row ${t.q} ${t.done ? 'done' : ''}" data-id="${t.id}">
      <td><button class="chk" data-act="toggle" aria-label="Toggle done">${CHECK}</button></td>
      <td class="ttl" data-act="edit"><span class="tx">${esc(t.title)}</span>${t.detail ? NOTE : ''}<span class="nw">${t.done ? doneInfo(t) : (t.due ? '<br>' + dueCell(t) : '')}</span></td>
      <td><select class="qsel">${opts(t.q)}</select></td>
      <td class="wide">${dueCell(t)}</td>
      <td class="wide">${t.done ? esc(doneText(t)) : '<span class="muted">—</span>'}</td></tr>`).join('')}
  </tbody></table>`;
}

function tableHTML() {
  const sc = (v, l) => `<button class="chip ${C.status === v ? 'on' : ''}" data-act="status" data-v="${v}">${l}</button>`;
  const sorts = [['q', 'Sort: Quadrant'], ['due', 'Sort: Deadline'], ['new', 'Sort: Newest'], ['title', 'Sort: A–Z']];
  return `<div class="bar">
    <div class="chips">${sc('active', 'Active')}${sc('done', 'Done')}${sc('all', 'All')}</div>
    <select id="t-q"><option value="all">All quadrants</option>${ORDER.map(k => `<option value="${k}" ${C.fq === k ? 'selected' : ''}>${QN[k]}</option>`).join('')}</select>
    <select id="t-sort">${sorts.map(([v, l]) => `<option value="${v}" ${C.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <input id="t-search" type="search" placeholder="Search…" value="${esc(search)}">
  </div><div id="tbl">${tableBodyHTML()}</div>`;
}

function render() {
  if (drag || hold) { pendingRender = true; return; }
  pendingRender = false;
  const y = window.scrollY;
  $('#app').innerHTML = C.view === 'table' ? tableHTML() : matrixHTML();
  $('#app').className = 'v-' + C.view;
  document.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', b.dataset.v === C.view));
  updateSyncUI();
  if (window.scrollY !== y) window.scrollTo(0, y);
}

/* ---------- sheets ---------- */
let sheetOpen = false;
function openSheet(html, bind) {
  $('#panel').innerHTML = html;
  $('#overlay').hidden = false;
  document.body.classList.add('noscroll');
  if (!sheetOpen) { try { history.pushState({ sheet: 1 }, ''); } catch (e) { /* ignore */ } }
  sheetOpen = true;
  if (bind) bind();
}
function closeSheet(fromPop) {
  if (!sheetOpen) return;
  sheetOpen = false;
  $('#overlay').hidden = true;
  document.body.classList.remove('noscroll');
  if (!fromPop) { try { history.back(); } catch (e) { /* ignore */ } }
}
window.addEventListener('popstate', () => { if (sheetOpen) closeSheet(true); });
$('#overlay').addEventListener('click', e => { if (e.target.id === 'overlay') closeSheet(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

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
  document.querySelectorAll('#panel [data-qd]').forEach(b => {
    b.onclick = () => { b.closest('.dfield').querySelector('input').value = b.dataset.qd === '' ? '' : offsetDay(Number(b.dataset.qd)); };
  });
}

function openAdd(preQ) {
  let q = preQ || 'backlog';
  openSheet(`<div class="sh"><b>New task</b><button class="x" data-act="close" aria-label="Close">✕</button></div>
    <input id="f-title" type="text" placeholder="What needs doing?" maxlength="200" autocomplete="off" enterkeyhint="done">
    <button type="button" class="linkbtn" id="f-more">+ Add detail</button>
    <textarea id="f-detail" rows="3" maxlength="2000" placeholder="Detail (optional)" hidden></textarea>
    <div class="lbl">Put in</div>${chips(q)}
    <div class="lbl">Deadline (optional)</div>${dateField('f-due', '', true)}
    <div class="acts"><span id="f-msg" class="msg"></span><button class="btn primary" id="f-add">Add</button></div>`, () => {
    const ti = $('#f-title'), de = $('#f-detail');
    bindChips(v => { q = v; });
    bindQuickDates();
    $('#f-more').onclick = () => { de.hidden = !de.hidden; $('#f-more').textContent = de.hidden ? '+ Add detail' : '− Hide detail'; if (!de.hidden) de.focus(); };
    const go = () => {
      const v = ti.value.trim();
      if (!v) { ti.focus(); return; }
      addTask({ title: v, detail: de.value.trim(), q, due: $('#f-due').value || null });
      ti.value = ''; de.value = ''; de.hidden = true; $('#f-more').textContent = '+ Add detail'; $('#f-due').value = '';
      $('#f-msg').textContent = 'Added ✓ → ' + QN[q];
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
  openSheet(`<div class="sh"><b>Edit task</b><button class="x" data-act="close" aria-label="Close">✕</button></div>
    <input id="e-title" type="text" value="${esc(t.title)}" maxlength="200" autocomplete="off">
    <div class="lbl">Detail</div>
    <textarea id="e-detail" rows="4" maxlength="2000" placeholder="Detail (optional)">${esc(t.detail)}</textarea>
    <div class="lbl">Move to</div>${chips(q)}
    <div class="lbl">Start date (optional — default: the day it was created)</div>${dateField('e-start', t.start, false)}
    <div class="lbl">Deadline</div>${dateField('e-due', t.due, true)}
    ${t.done ? `<p class="hint">Done ${esc(doneText(t))}</p>` : ''}
    <div class="acts"><button class="btn danger" id="e-del">Delete</button><button class="btn primary" id="e-save">Save</button></div>`, () => {
    bindChips(v => { q = v; });
    bindQuickDates();
    const save = () => {
      const title = $('#e-title').value.trim();
      if (!title) return;
      patch(id, { title, detail: $('#e-detail').value.trim(), q, order: q === t.q ? t.order : null, start: $('#e-start').value || null, due: $('#e-due').value || null });
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

function openSettings() {
  const status = !configured() ? 'Not connected — data is stored on this device only.'
    : lastErr ? '✗ ' + lastErr
    : D.lastSync ? 'Last sync: ' + new Date(D.lastSync).toLocaleString() : 'Connected.';
  openSheet(`<div class="sh"><b>Sync (GitHub Gist)</b><button class="x" data-act="close" aria-label="Close">✕</button></div>
    <div class="lbl">Personal access token (classic, scope: gist)</div>
    <input id="s-token" type="password" value="${esc(C.token)}" autocomplete="off" placeholder="ghp_…">
    <div class="lbl">Gist ID (or paste the Gist URL)</div>
    <input id="s-gist" type="text" value="${esc(C.gist)}" autocomplete="off" placeholder="leave empty and tap “Create new Gist”">
    <p class="hint">The token is stored only in this browser. Use a classic token with just the <b>gist</b> scope.</p>
    <div class="acts" style="flex-wrap:wrap"><span id="s-msg" class="msg">${esc(status)}</span></div>
    <div class="acts" style="flex-wrap:wrap">
      <button class="btn" id="s-create">Create new Gist</button>
      <button class="btn primary" id="s-save">Save &amp; sync</button>
    </div>
    <div class="acts" style="justify-content:space-between">
      <button class="btn" id="s-install" ${installEvt ? '' : 'hidden'}>Install app</button>
      <button class="btn danger" id="s-off">Disconnect</button>
    </div>`, () => {
    const msg = $('#s-msg');
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
  return JSON.stringify({ version: 2, updated: new Date().toISOString(), tasks: [...D.tasks].sort((a, b) => a.created - b.created) }, null, 1);
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
function schedulePush() {
  if (!configured()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(sync, 2000);
  updateSyncUI();
}
async function sync() {
  if (!configured()) return;
  if (syncing) { again = true; return; }
  clearTimeout(pushTimer);
  syncing = true; lastErr = ''; updateSyncUI();
  const id = encodeURIComponent(C.gist);
  try {
    const g = await gh('/gists/' + id);
    const f = g.files && g.files[FILE];
    let remote = [];
    if (f) {
      let text = f.content;
      if (f.truncated) text = await (await fetch(f.raw_url, { cache: 'no-store' })).text();
      let obj;
      try { obj = JSON.parse(text); } catch (_) { throw new Error('tasks.json in the Gist is not valid JSON'); }
      remote = (Array.isArray(obj) ? obj : (obj.tasks || [])).map(clean).filter(Boolean);
    }
    const merged = merge(D.tasks, remote);
    const needPush = !same(merged, remote);
    D.tasks = merged;
    if (needPush) {
      const body = JSON.stringify({ files: { [FILE]: { content: serialize() } } });
      const revAtPush = D.rev;
      await gh('/gists/' + id, { method: 'PATCH', body });
      if (D.rev === revAtPush) D.dirty = false;
    } else {
      D.dirty = false;
    }
    D.lastSync = Date.now();
  } catch (e) {
    lastErr = errMsg(e);
    again = false;
  } finally {
    syncing = false;
    saveData();
    updateSyncUI();
    render();
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
function toggle(id) {
  const t = find(id);
  if (!t) return;
  if (t.done) {
    const oldAt = t.doneAt, oldFrom = t.doneFrom;
    patch(id, { done: false, doneAt: null, doneFrom: null });
    toast('Task restored', () => patch(id, { done: true, doneAt: oldAt, doneFrom: oldFrom }));
  } else {
    patch(id, { done: true, doneAt: Date.now(), doneFrom: t.q });
    toast('Task completed ✓', () => patch(id, { done: false, doneAt: null, doneFrom: null }));
  }
}

document.addEventListener('click', e => {
  const a = e.target.closest('[data-act]');
  if (!a) return;
  const row = a.closest('[data-id]');
  const id = row && row.dataset.id;
  switch (a.dataset.act) {
    case 'toggle': toggle(id); break;
    case 'edit': openEdit(id); break;
    case 'view': setC({ view: a.dataset.v }); render(); window.scrollTo(0, 0); break;
    case 'add': openAdd(); break;
    case 'addq': openAdd(a.dataset.q); break;
    case 'settings': openSettings(); break;
    case 'sync': configured() ? sync() : openSettings(); break;
    case 'close': closeSheet(); break;
    case 'toggledone': setC({ showDone: !C.showDone }); render(); break;
    case 'status': setC({ status: a.dataset.v }); render(); break;
    case 'cleardone': {
      const ids = live().filter(t => t.done).map(t => t.id);
      if (!ids.length) break;
      mutate(() => { const now = Date.now(); D.tasks.forEach(t => { if (ids.includes(t.id)) { t.deleted = true; t.updatedAt = now; } }); });
      toast(ids.length + ' done task(s) cleared', () => mutate(() => { const now = Date.now(); D.tasks.forEach(t => { if (ids.includes(t.id)) { t.deleted = false; t.updatedAt = now; } }); }));
      break;
    }
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.matches && t.matches('.qsel')) patch(t.closest('[data-id]').dataset.id, { q: t.value, order: null });
  else if (t.id === 't-q') { setC({ fq: t.value }); render(); }
  else if (t.id === 't-sort') { setC({ sort: t.value }); render(); }
});
document.addEventListener('input', e => {
  if (e.target.id === 't-search') { search = e.target.value; $('#tbl').innerHTML = tableBodyHTML(); }
});

/* ---------- drag & drop (pointer events: touch + mouse) ---------- */
// Where would the dragged card land inside `box`? Returns the other cards (display order), the slot index and the card's own index.
function dropSlot(box, y, id) {
  const all = [...box.querySelectorAll('.task[data-id]')];
  const els = all.filter(el => el.dataset.id !== id);
  let i = 0;
  for (const el of els) { const r = el.getBoundingClientRect(); if (y > r.top + r.height / 2) i++; else break; }
  return { els, i, orig: all.findIndex(el => el.dataset.id === id) };
}
function clearMarks() {
  document.querySelectorAll('.ins-before,.ins-after').forEach(el => el.classList.remove('ins-before', 'ins-after'));
}
// Put task `id` into `target` at slot `i` among `ids` (the other tasks there, in display order).
function placeTask(id, target, ids, i) {
  const t = find(id);
  const list = ids.map(find).filter(Boolean);
  const now = Date.now();
  mutate(() => {
    if (list.some(x => x.order == null)) list.forEach((x, k) => { x.order = (k + 1) * 1000; x.updatedAt = now; });
    const p = list[i - 1], n = list[i];
    t.order = p && n ? (p.order + n.order) / 2 : n ? n.order - 1000 : p ? p.order + 1000 : 1000;
    t.q = target; t.updatedAt = now;
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
const HOLD_MS = 1000, HOLD_SLOP = 12;
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
    if (target !== t.q || i !== orig) {
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
document.addEventListener('visibilitychange', () => { if (!document.hidden && configured() && Date.now() - D.lastSync > 15000) sync(); });
window.addEventListener('online', () => sync());

render();
if (configured()) sync();
if (/[?&]add\b/.test(location.search)) {
  try { history.replaceState(null, '', location.pathname); } catch (_) { /* ignore */ }
  openAdd();
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
