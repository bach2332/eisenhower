(() => {
'use strict';

/* ---------- constants ---------- */
const Q = [
  { id: 'q1', name: 'Do',        sub: 'Urgent · Important' },
  { id: 'q2', name: 'Schedule',  sub: 'Not urgent · Important' },
  { id: 'q3', name: 'Delegate',  sub: 'Urgent · Not important' },
  { id: 'q4', name: 'Eliminate', sub: 'Not urgent · Not important' },
];
const QN = { inbox: 'Inbox', q1: 'Do', q2: 'Schedule', q3: 'Delegate', q4: 'Eliminate' };
const ORDER = ['inbox', 'q1', 'q2', 'q3', 'q4'];
const QORD = { q1: 0, q2: 1, q3: 2, q4: 3, inbox: 4 };
const K_DATA = 'eisen.data.v1', K_CFG = 'eisen.cfg.v1', FILE = 'tasks.json';

const HANDLE = '<svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><circle cx="6" cy="4" r="1.6"/><circle cx="12" cy="4" r="1.6"/><circle cx="6" cy="9" r="1.6"/><circle cx="12" cy="9" r="1.6"/><circle cx="6" cy="14" r="1.6"/><circle cx="12" cy="14" r="1.6"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const PLUS = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
function lsGet(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }

function clean(t) {
  if (!t || t.id == null) return null;
  return {
    id: String(t.id),
    title: String(t.title || '').slice(0, 200),
    q: QN[t.q] ? t.q : 'inbox',
    done: !!t.done,
    doneAt: +t.doneAt || null,
    due: /^\d{4}-\d{2}-\d{2}$/.test(t.due || '') ? t.due : null,
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
let drag = null, pendingRender = false;
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
function addTask(title, q, due) {
  const now = Date.now();
  mutate(() => D.tasks.push({ id: uid(), title, q, done: false, doneAt: null, due: due || null, created: now, updatedAt: now, deleted: false }));
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

/* ---------- views ---------- */
function dueBadge(t) {
  if (!t.due) return '';
  const today = ymd(new Date());
  const tom = ymd(new Date(Date.now() + 864e5));
  let txt, cls = '';
  if (t.due === today) { txt = 'Today'; cls = 'soon'; }
  else if (t.due === tom) { txt = 'Tomorrow'; cls = 'soon'; }
  else {
    const [y, m, d] = t.due.split('-');
    txt = `${d}/${m}` + (y !== String(new Date().getFullYear()) ? '/' + y : '');
  }
  if (t.due < today && !t.done) cls = 'late';
  return `<span class="due ${cls}">${txt}</span>`;
}
const cmpDue = (a, b) => {
  const x = a.due || '9999', y = b.due || '9999';
  return x < y ? -1 : x > y ? 1 : a.created - b.created;
};

function taskHTML(t) {
  return `<div class="task ${t.done ? 'done' : ''}" data-id="${t.id}">
    <button class="chk" data-act="toggle" aria-label="Toggle done">${CHECK}</button>
    <div class="tt" data-act="edit"><span class="tx">${esc(t.title)}</span>${t.due ? '<br>' + dueBadge(t) : ''}</div>
    ${t.done ? '' : `<span class="handle" data-drag aria-label="Drag to move">${HANDLE}</span>`}
  </div>`;
}

function matrixHTML() {
  const L = live();
  const act = L.filter(t => !t.done);
  const dn = L.filter(t => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const inbox = act.filter(t => t.q === 'inbox').sort((a, b) => a.created - b.created);
  let h = `<section class="inbox-sec inbox" data-drop="inbox">
    <div class="sec-h"><div class="nm"><b>Inbox</b><small>Unsorted — drag into a quadrant</small></div><span class="cnt">${inbox.length}</span></div>
    ${inbox.length ? inbox.map(taskHTML).join('') : '<p class="empty">Inbox is empty. Tap + to add a task.</p>'}
  </section><div class="matrix">`;
  for (const q of Q) {
    const items = act.filter(t => t.q === q.id).sort(cmpDue);
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
  if (search) { const s = search.toLowerCase(); L = L.filter(t => t.title.toLowerCase().includes(s)); }
  const sorters = {
    q: (a, b) => QORD[a.q] - QORD[b.q] || cmpDue(a, b),
    due: cmpDue,
    new: (a, b) => b.created - a.created,
    title: (a, b) => a.title.localeCompare(b.title),
  };
  L.sort(sorters[C.sort] || sorters.q);
  if (!L.length) return '<p class="empty big">No tasks here.</p>';
  const opts = cur => ORDER.map(k => `<option value="${k}" ${k === cur ? 'selected' : ''}>${QN[k]}</option>`).join('');
  return `<table><thead><tr><th></th><th>Task</th><th>Quadrant</th><th class="wide">Due</th></tr></thead><tbody>
    ${L.map(t => `<tr class="row ${t.q} ${t.done ? 'done' : ''}" data-id="${t.id}">
      <td><button class="chk" data-act="toggle" aria-label="Toggle done">${CHECK}</button></td>
      <td class="ttl" data-act="edit"><span class="tx">${esc(t.title)}</span><span class="nw">${t.due ? '<br>' + dueBadge(t) : ''}</span></td>
      <td><select class="qsel">${opts(t.q)}</select></td>
      <td class="wide">${dueBadge(t)}</td></tr>`).join('')}
  </tbody></table>`;
}

function tableHTML() {
  const sc = (v, l) => `<button class="chip ${C.status === v ? 'on' : ''}" data-act="status" data-v="${v}">${l}</button>`;
  const sorts = [['q', 'Sort: Quadrant'], ['due', 'Sort: Due date'], ['new', 'Sort: Newest'], ['title', 'Sort: A–Z']];
  return `<div class="bar">
    <div class="chips">${sc('active', 'Active')}${sc('done', 'Done')}${sc('all', 'All')}</div>
    <select id="t-q"><option value="all">All quadrants</option>${ORDER.map(k => `<option value="${k}" ${C.fq === k ? 'selected' : ''}>${QN[k]}</option>`).join('')}</select>
    <select id="t-sort">${sorts.map(([v, l]) => `<option value="${v}" ${C.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <input id="t-search" type="search" placeholder="Search…" value="${esc(search)}">
  </div><div id="tbl">${tableBodyHTML()}</div>`;
}

function render() {
  if (drag) { pendingRender = true; return; }
  pendingRender = false;
  const y = window.scrollY;
  $('#app').innerHTML = C.view === 'table' ? tableHTML() : matrixHTML();
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

function openAdd(preQ) {
  let q = preQ || 'inbox';
  openSheet(`<div class="sh"><b>New task</b><button class="x" data-act="close" aria-label="Close">✕</button></div>
    <input id="f-title" type="text" placeholder="What needs doing?" maxlength="200" autocomplete="off" enterkeyhint="done">
    <div class="lbl">Put in</div>${chips(q)}
    <div class="lbl">Due (optional)</div><input id="f-due" type="date">
    <div class="acts"><span id="f-msg" class="msg"></span><button class="btn primary" id="f-add">Add</button></div>`, () => {
    const ti = $('#f-title');
    bindChips(v => { q = v; });
    const go = () => {
      const v = ti.value.trim();
      if (!v) { ti.focus(); return; }
      addTask(v, q, $('#f-due').value || null);
      ti.value = ''; $('#f-due').value = '';
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
    <div class="lbl">Move to</div>${chips(q)}
    <div class="lbl">Due</div><input id="e-due" type="date" value="${t.due || ''}">
    <div class="acts"><button class="btn danger" id="e-del">Delete</button><button class="btn primary" id="e-save">Save</button></div>`, () => {
    bindChips(v => { q = v; });
    const save = () => {
      const title = $('#e-title').value.trim();
      if (!title) return;
      patch(id, { title, q, due: $('#e-due').value || null });
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
        const g = await gh('/gists', { method: 'POST', body: JSON.stringify({ description: 'Eisenhower Matrix data', public: false, files: { [FILE]: { content: serialize() } } }) });
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
  return JSON.stringify({ version: 1, updated: new Date().toISOString(), tasks: [...D.tasks].sort((a, b) => a.created - b.created) }, null, 1);
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
async function sync(force) {
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
  const was = t.done;
  patch(id, { done: !was, doneAt: was ? null : Date.now() });
  toast(was ? 'Task restored' : 'Task completed ✓', () => patch(id, { done: was, doneAt: was ? Date.now() : null }));
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
    case 'sync': configured() ? sync(true) : openSettings(); break;
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
  if (t.matches && t.matches('.qsel')) patch(t.closest('[data-id]').dataset.id, { q: t.value });
  else if (t.id === 't-q') { setC({ fq: t.value }); render(); }
  else if (t.id === 't-sort') { setC({ sort: t.value }); render(); }
});
document.addEventListener('input', e => {
  if (e.target.id === 't-search') { search = e.target.value; $('#tbl').innerHTML = tableBodyHTML(); }
});

/* ---------- drag & drop (pointer events: touch + mouse) ---------- */
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
  drag.raf = requestAnimationFrame(tick);
}
document.addEventListener('pointerdown', e => {
  const h = e.target.closest('[data-drag]');
  if (!h || drag) return;
  const row = h.closest('.task');
  if (!row) return;
  e.preventDefault();
  const r = row.getBoundingClientRect();
  const ghost = row.cloneNode(true);
  ghost.classList.add('ghost');
  ghost.removeAttribute('data-id');
  ghost.style.width = r.width + 'px';
  document.body.appendChild(ghost);
  drag = { id: row.dataset.id, ghost, row, dx: e.clientX - r.left, dy: e.clientY - r.top, pid: e.pointerId, x: e.clientX, y: e.clientY, over: null, raf: 0 };
  row.classList.add('lifting');
  document.body.classList.add('dragging');
  try { h.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  moveGhost();
  drag.raf = requestAnimationFrame(tick);
});
document.addEventListener('pointermove', e => {
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
  const target = !cancel && d.over ? d.over.dataset.drop : null;
  const t = find(d.id);
  if (target && t && target !== t.q) {
    const prev = t.q;
    patch(d.id, { q: target });
    toast('Moved to ' + QN[target], () => patch(d.id, { q: prev }));
  }
  if (pendingRender) render();
}
document.addEventListener('pointerup', e => endDrag(e, false));
document.addEventListener('pointercancel', e => endDrag(e, true));

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
