// Page shell: files, session, the main graph, Setup, Points, Results, Compare, Export, Centre of pressure, dialogs.
import { A, $, esc, fx, status, cur, trialLabel, download, safe, kickColour, VERSION, loadSettings, saveSettings, defaultSettings } from './state.js?v=1.1.0';
import { parseFile, guessLabels, process, results, VARS, unitOf, valOf, SIG, sigLabel, signal } from './analyse.js?v=1.1.0';
import { canvasG, axes, range, padRange, line, band, FONTS } from './draw.js?v=1.1.0';
import { renderFigure, openFigure } from './figure.js?v=1.1.0';

const UI = FONTS['System UI'];
A.set = loadSettings();
let uid = 0, tab = 'setup';

// ---------- canvas helper ----------
function canvasIn(el, h) {
  el.classList.add('cwrap');
  let cv = el.querySelector('canvas.cbase'), ov = el.querySelector('canvas.cover');
  if (!cv) { cv = document.createElement('canvas'); cv.className = 'cbase'; ov = document.createElement('canvas'); ov.className = 'cover'; el.appendChild(cv); el.appendChild(ov); }
  const w = Math.max(60, Math.floor(el.clientWidth)), dpr = Math.min(3, window.devicePixelRatio || 1);
  [cv, ov].forEach((c) => { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.width = w + 'px'; c.style.height = h + 'px'; });
  el.style.height = h + 'px';
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  const octx = ov.getContext('2d'); octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h, ctx, octx, ov };
}

// ---------- files ----------
function addText(text, name, labels) {
  try {
    const d = parseFile(text, name);
    const tr = { id: 'k' + (++uid) + Date.now().toString(36), name, raw: d.raw, fs: d.fs, bwHdr: d.bwHdr, cols: d.cols, text, labels: labels || guessLabels(d.base), set: { ball: null, start: null, end: null } };
    process(tr); A.trials.push(tr); return tr;
  } catch (e) { status('<span class="bad"><strong>' + esc(name) + ':</strong> ' + esc(e.message) + '.</span>'); return null; }
}
async function addFiles(list) {
  let last = null;
  for (const f of list) { const t = addText(await f.text(), f.name); if (t) last = t; }
  if (last) { A.cur = A.trials.indexOf(last); A.view = null; A.cursor = -1; A.pinned = false; refreshAll(); status('Loaded. Check the kick type in <strong>Session</strong>, then foot contact, toe-off and ball contact in <strong>2. Points</strong>.'); }
}
$('file').addEventListener('change', function () { addFiles(this.files); this.value = ''; });
$('file2').addEventListener('change', function () { addFiles(this.files); this.value = ''; });
const DEMOS = { instep: ['demo-instep.txt', 'Instep'], laces: ['demo-laces.txt', 'Laces'], curler: ['demo-curler.txt', 'Curler'], outside: ['demo-outside-boot.txt', 'Outside boot'] };
async function demo(k) {
  const keys = k === 'all' ? ['instep', 'laces', 'curler', 'outside'] : [k];
  status('Loading the demo&hellip;');
  try {
    let last = null;
    for (const kk of keys) { const [file, kick] = DEMOS[kk]; const r = await fetch('demo/' + file); if (!r.ok) throw new Error(r.status); last = addText(await r.text(), file, { athlete: 'Demo', kick, trial: '1' }) || last; }
    A.cur = A.trials.indexOf(last); A.view = null; A.cursor = -1; refreshAll();
    status('Demo loaded: one kick of each type by the same player, standing foot on one Kistler plate at 1000 Hz. Ball contact was not filmed, so the whole stance is analysed.');
  } catch (e) { status('<span class="bad">Could not load the demo (' + esc(e.message) + '). Demos need the tool to be opened from a web address, not straight from a file.</span>'); }
}
$('demoSel').addEventListener('change', function () { const k = this.value; this.value = ''; if (k) demo(k); });

// ---------- session ----------
function renderSession() {
  const T = A.trials;
  $('sesCount').textContent = T.length ? '(' + T.length + ' kick' + (T.length > 1 ? 's' : '') + ')' : '';
  $('sesNext').disabled = T.length < 2;
  if (!T.length) { $('sesTab').innerHTML = '<tr><td class="muted">No kicks yet.</td></tr>'; return; }
  $('sesTab').innerHTML = '<thead><tr><th>#</th><th>File</th><th>Participant</th><th>Kick type</th><th>Trial</th><th>Stance</th><th>Ball contact</th><th></th></tr></thead><tbody>' + T.map((t, i) => {
    const P = t.p, on = i === A.cur;
    return '<tr' + (on ? ' class="current"' : '') + '><td><span class="dot" style="background:' + kickColour(t.labels.kick) + '"></span>' + (i + 1) + '</td><td class="small">' + esc(t.name) + '</td>'
      + ['athlete', 'kick', 'trial'].map((k) => '<td><input type="text" class="mini" data-lab="' + k + '" data-i="' + i + '" value="' + esc(t.labels[k]) + '"' + (k === 'kick' ? ' list="kickList"' : '') + '></td>').join('')
      + '<td class="num">' + fx((P.e - P.s) / t.fs * 1000, 0) + ' ms</td><td class="num">' + (P.b != null ? fx((P.b - P.s) / t.fs * 1000, 0) + ' ms' : '<span class="muted">not marked</span>') + '</td>'
      + '<td class="nowrap">' + (on ? '<span class="muted">open</span>' : '<button class="btn small ghost" data-open="' + i + '" type="button">Open</button>') + ' <button class="btn small ghost" data-del="' + i + '" type="button" title="Remove" aria-label="Remove">&times;</button></td></tr>';
  }).join('') + '</tbody><datalist id="kickList">' + ['Instep', 'Laces', 'Curler', 'Outside boot', 'Side foot', 'Chip', 'Toe poke'].map((k) => '<option value="' + k + '">').join('') + '</datalist>';
}
$('sesTab').addEventListener('change', (e) => { const el = e.target; if (!el.dataset.lab) return; A.trials[+el.dataset.i].labels[el.dataset.lab] = el.value.trim(); refreshAll(); });
$('sesTab').addEventListener('click', (e) => {
  const o = e.target.closest('[data-open]'), d = e.target.closest('[data-del]');
  if (o) { A.cur = +o.dataset.open; A.view = null; A.cursor = -1; A.pinned = false; refreshAll(); }
  if (d) { const i = +d.dataset.del; A.trials.splice(i, 1); if (A.cur >= A.trials.length) A.cur = A.trials.length - 1; if (A.cur > i) A.cur--; A.view = null; refreshAll(); }
});
$('sesNext').addEventListener('click', () => { if (!A.trials.length) return; A.cur = (A.cur + 1) % A.trials.length; A.view = null; A.cursor = -1; A.pinned = false; refreshAll(); });
$('sesNew').addEventListener('click', () => { A.trials = []; A.cur = -1; A.kickCol = {}; A.fig = null; refreshAll(); status('New session. Add files to begin.'); });

// ---------- main graph ----------
// [key, chip label, signal, colour, panel]
const SHOW = [['fz', 'Vertical (Fz)', 'Fz', '#1d4ed8', 'F'], ['ap', 'Front–back', 'AP', '#dc2626', 'F'], ['ml', 'Side to side', 'ML', '#7c3aed', 'F'],
  ['cap', 'COP front–back', 'cAP', '#0f766e', 'C'], ['cml', 'COP side to side', 'cML', '#d97706', 'C'], ['cr', 'COP distance from start', 'cR', '#0891b2', 'C'],
  ['cv', 'COP speed', 'cV', '#be185d', 'V'], ['tz', 'Free moment', 'Tz', '#475569', 'T']];
const PANELS = { F: () => (A.units === 'BW' ? 'Force (BW)' : 'Force (N)'), C: () => 'COP (cm)', V: () => 'COP speed (cm/s)', T: () => 'Free moment (N·m)' };
function renderChips() {
  const t = cur();
  $('showChips').innerHTML = SHOW.filter(([k, , s]) => !t || t.p[s]).map(([k, l, , c]) => '<button type="button" class="chip' + (A.show[k] ? ' active' : '') + '" data-sh="' + k + '" aria-pressed="' + !!A.show[k] + '"><span class="key" style="border-color:' + c + '"></span>' + l + '</button>').join('');
}
$('showChips').addEventListener('click', (e) => { const b = e.target.closest('[data-sh]'); if (!b) return; A.show[b.dataset.sh] = !A.show[b.dataset.sh]; renderChips(); drawMain(); });
$('units').addEventListener('change', function () { A.units = this.value; refreshAll(); });
let frame = null;
function viewOf(t) {
  if (A.view) return A.view;
  const P = t.p, pad = Math.round(0.12 * t.fs);
  return { a: Math.max(0, P.s - pad), b: Math.min(t.raw.t.length - 1, P.e + pad) };
}
function drawMain() {
  const t = cur(), el = $('mainChart'); if (!t) return;
  const P = t.p, v = viewOf(t), fs = t.fs;
  const x = []; for (let i = v.a; i <= v.b; i++) x.push((i - P.s) / fs * 1000);
  const groups = []; ['F', 'C', 'V', 'T'].forEach((pid) => { const s = SHOW.filter((q) => q[4] === pid && A.show[q[0]] && P[q[2]]); if (s.length) groups.push({ pid, s }); });
  if (!groups.length) groups.push({ pid: 'F', s: [] });
  const each = groups.length <= 2 ? 0 : 150, base = Math.max(380, Math.min(560, Math.round(el.clientWidth * 0.48)));
  const H = groups.length <= 2 ? base : 40 + groups.length * each + (groups.length - 1) * 30;
  const c = canvasIn(el, H), g = canvasG(c.ctx, UI);
  const L = 64, R = 14, gap = 30, ph = (H - 50 - gap * (groups.length - 1)) / groups.length;
  const xr = [x[0], x[x.length - 1]];
  const shade = (ax, Y, Hh) => {
    g.rect(ax.sx(0), Y, ax.sx((P.e - P.s) / fs * 1000) - ax.sx(0), Hh, { fill: 'rgba(29,78,216,.06)' });
    if (P.cs >= 0) g.rect(ax.sx((P.cs - P.s) / fs * 1000), Y + Hh - 4, ax.sx((P.ce - P.s) / fs * 1000) - ax.sx((P.cs - P.s) / fs * 1000), 4, { fill: '#0f766e', alpha: 0.5 });
    if (P.b != null) { const bx = ax.sx((P.b - P.s) / fs * 1000); g.path([bx, Y, bx, Y + Hh], { stroke: '#111827', lw: 1.5, dash: [5, 4] }); }
  };
  const boxes = [];
  groups.forEach((gr, i) => {
    const Y = 10 + i * (ph + gap), last = i === groups.length - 1;
    const set = gr.s.map((q) => ({ x, y: signal(t, q[2], v.a, v.b), c: q[3] }));
    const ax = axes(g, L, Y, c.w - L - R, ph, xr, padRange(set.length ? range(set, 'y') : [0, 1], 0.07), { fs: 12, grid: true, zero: true, ylab: PANELS[gr.pid](), xlab: last ? 'Time from foot contact (ms)' : '' });
    g.clip(L, Y, c.w - L - R, ph); shade(ax, Y, ph); set.forEach((q) => line(g, q.x, q.y, ax.sx, ax.sy, { stroke: q.c, lw: 1.8 })); g.unclip();
    boxes.push({ Y, h: ph, ax });
  });
  if (P.b != null) g.text('Ball contact', boxes[0].ax.sx((P.b - P.s) / fs * 1000) + 4, 14, { size: 11, base: 'top', fill: '#111827', bold: true });
  frame = { c, ax1: boxes[0].ax, boxes, v, L, R };
  overlay();
  drawCopBox();
}
function overlay() {
  const t = cur(); if (!t || !frame) return;
  const { c, ax1, boxes } = frame, o = c.octx, P = t.p;
  o.clearRect(0, 0, c.w, c.h);
  const i = A.cursor;
  if (i >= frame.v.a && i <= frame.v.b) {
    const X = ax1.sx((i - P.s) / t.fs * 1000);
    o.strokeStyle = A.pinned ? '#1d4ed8' : '#64748b'; o.lineWidth = A.pinned ? 1.5 : 1; o.setLineDash(A.pinned ? [] : [3, 3]);
    o.beginPath(); boxes.forEach((b) => { o.moveTo(X, b.Y); o.lineTo(X, b.Y + b.h); }); o.stroke(); o.setLineDash([]);
  }
  readout();
  drawCopBox();
}
function idxFromX(px) { const t = cur(); if (!t || !frame) return -1; const P = t.p, ms = frame.ax1.xr[0] + (px - frame.L) / (frame.c.w - frame.L - frame.R) * (frame.ax1.xr[1] - frame.ax1.xr[0]); return Math.max(frame.v.a, Math.min(frame.v.b, P.s + Math.round(ms / 1000 * t.fs))); }
const mc = $('mainChart');
mc.addEventListener('pointermove', (e) => { if (A.pinned || !frame) return; const r = mc.getBoundingClientRect(); A.cursor = idxFromX(e.clientX - r.left); overlay(); });
mc.addEventListener('pointerleave', () => { if (!A.pinned) { A.cursor = -1; overlay(); } });
mc.addEventListener('click', (e) => { const r = mc.getBoundingClientRect(); A.cursor = idxFromX(e.clientX - r.left); A.pinned = true; overlay(); });
document.addEventListener('keydown', (e) => {
  if (!A.pinned || !cur() || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const st = e.shiftKey ? 10 : 1; A.cursor = Math.max(frame.v.a, Math.min(frame.v.b, A.cursor + (e.key === 'ArrowRight' ? st : -st))); overlay(); }
  if (e.key === 'Escape') { A.pinned = false; overlay(); }
});
$('zKick').addEventListener('click', () => { A.view = null; drawMain(); });
$('zAll').addEventListener('click', () => { const t = cur(); if (t) { A.view = { a: 0, b: t.raw.t.length - 1 }; drawMain(); } });
$('ballHere').addEventListener('click', () => setPoint('ball'));

function readout() {
  const t = cur(), el = $('readout'); if (!t) { el.className = 'readout'; el.innerHTML = ''; return; }
  const P = t.p, i = A.cursor;
  if (i < 0) { el.className = 'readout idle'; el.innerHTML = 'Hover over the graph to read the forces and centre of pressure. <strong>Click</strong> to fix the cursor, then step one sample at a time with <kbd>&larr;</kbd> <kbd>&rarr;</kbd>.'; return; }
  const u = A.units === 'BW' ? ' BW' : ' N', k = A.units === 'BW' ? 1 / P.bw : 1, d = A.units === 'BW' ? 2 : 0;
  const ms = (i - P.s) / t.fs * 1000;
  let ph = 'Before foot contact', col = '#64748b', words = 'The standing foot has not landed yet.';
  if (i > P.e) { ph = 'After toe-off'; words = 'The standing foot has left the plate.'; }
  else if (i >= P.s) {
    let pk = P.s; for (let j = P.s; j <= P.e; j++) if (P.Fz[j] > P.Fz[pk]) pk = j;
    if (P.b != null && i > P.b) { ph = 'Follow-through'; col = '#7c3aed'; words = 'After ball contact. The standing leg is now supporting the follow-through.'; }
    else if (i <= pk) { ph = 'Landing'; col = '#dc2626'; words = 'The foot plants and the force rises fast as the run-up is stopped. COP starts under the heel.'; }
    else if (P.AP && P.AP[i] < 0) { ph = 'Braking'; col = '#d97706'; words = 'The ground is pushing backwards on the foot: the standing leg is slowing the body down while the kicking leg swings.'; }
    else { ph = 'Late stance'; col = '#0f766e'; words = 'Braking has finished; COP is moving towards the forefoot.'; }
  }
  el.className = 'readout';
  el.innerHTML = '<div class="nums"><div><span>Time from contact</span><b>' + fx(ms, 0) + ' ms</b></div><div><span>Vertical (Fz)</span><b>' + fx(P.Fz[i] * k, d) + u + '</b></div>'
    + (P.AP ? '<div><span>Front–back</span><b>' + fx(P.AP[i] * k, d) + u + '</b></div>' : '') + (P.ML ? '<div><span>Side to side</span><b>' + fx(P.ML[i] * k, d) + u + '</b></div>' : '')
    + '<div><span>COP front–back</span><b>' + (Number.isFinite(P.cAP[i]) ? fx(P.cAP[i], 1) + ' cm' : '<span class="muted">not valid</span>') + '</b></div><div><span>COP side to side</span><b>' + (Number.isFinite(P.cML[i]) ? fx(P.cML[i], 1) + ' cm' : '<span class="muted">not valid</span>') + '</b></div>'
    + '<div><span>COP speed</span><b>' + (Number.isFinite(P.cV[i]) ? fx(P.cV[i], 0) + ' cm/s' : '<span class="muted">not valid</span>') + '</b></div>'
    + (P.Tz && Number.isFinite(P.Tz[i]) ? '<div><span>Free moment</span><b>' + fx(P.Tz[i], 1) + ' N\u00b7m</b></div>' : '') + '</div>'
    + '<div class="words"><span class="ph" style="background:' + col + '">' + ph + '</span>' + words + '</div>';
}
function drawCopBox() {
  const t = cur(), el = $('copBox'); if (!t || !el.clientWidth) return;
  const c = canvasIn(el, Math.max(200, frame ? frame.c.h - 26 : 300)), g = canvasG(c.ctx, UI), P = t.p;
  if (P.cs < 0) return;
  const x = [], y = []; for (let i = P.cs; i <= P.ce; i++) { x.push(P.cML[i]); y.push(P.cAP[i]); }
  const xr = range([{ x }], 'x'), yr = range([{ y }], 'y'), pad = 18, w = c.w - 2 * pad, h = c.h - 2 * pad;
  const sc = Math.min(w / Math.max(8, (xr[1] - xr[0]) * 1.3), h / Math.max(8, (yr[1] - yr[0]) * 1.15)), cx = (xr[0] + xr[1]) / 2, cy = (yr[0] + yr[1]) / 2;
  const sx = (v) => c.w / 2 + (v - cx) * sc, sy = (v) => c.h / 2 - (v - cy) * sc;
  line(g, x, y, sx, sy, { stroke: '#0f766e', lw: 2 });
  g.circle(sx(x[0]), sy(y[0]), 4, { fill: '#fff', stroke: '#0f766e', lw: 2 });
  const i = A.cursor;
  if (i >= P.cs && i <= P.ce) g.circle(sx(P.cML[i]), sy(P.cAP[i]), 6, { fill: '#dc2626', stroke: '#fff', lw: 2 });
  if (P.b != null && P.b >= P.cs && P.b <= P.ce) { const X = sx(P.cML[P.b]), Y = sy(P.cAP[P.b]); g.path([X - 5, Y - 5, X + 5, Y + 5], { stroke: '#111827', lw: 2 }); g.path([X - 5, Y + 5, X + 5, Y - 5], { stroke: '#111827', lw: 2 }); }
  g.text('toes ↑', c.w / 2, 4, { size: 10, anchor: 'middle', base: 'top', fill: '#64748b' });
  g.text(P.known ? 'lateral →' : '+ →', c.w - 4, c.h - 6, { size: 10, anchor: 'end', fill: '#64748b' });
}

function keyStats() {
  const t = cur(); if (!t) { $('keyStats').innerHTML = ''; $('warnBox').innerHTML = ''; return; }
  const r = results(t), show = ['stance', 'pkFz', 'pkBrk', 'apEx', 'mlEx', 'spd'];
  $('keyStats').innerHTML = show.map((k) => { const v = VARS.find((q) => q.k === k), val = valOf(v, r, t); return '<div class="stat' + (k === 'stance' ? ' hl' : '') + '"><span>' + v.l + '</span><strong>' + fx(val, v.u === 'F' && A.units === 'BW' ? 2 : v.u === 'ms' || v.u === 'F' ? 0 : 1) + '</strong> ' + unitOf(v) + '</div>'; }).join('');
  $('warnBox').innerHTML = t.p.notes.map((n) => '<div class="warn"><p>' + esc(n) + '</p></div>').join('');
  $('phaseKey').innerHTML = '<span><i style="background:rgba(29,78,216,.18)"></i>Stance</span><span><i style="background:#0f766e;opacity:.6"></i>COP valid</span>' + (t.p.b != null ? '<span><i style="background:#111827;height:2px"></i>Ball contact</span>' : '');
}

// ---------- setup ----------
function renderSetup() {
  const S = A.set, t = cur();
  $('foot').value = S.foot; $('side').value = S.side; $('bwMode').value = S.bwMode; $('mass').value = S.mass; $('apSel').value = S.ap; $('win').value = S.win;
  $('massWrap').classList.toggle('hide', S.bwMode !== 'mass');
  if (!t) { $('bwInfo').textContent = ''; $('axesInfo').textContent = ''; $('sideInfo').textContent = ''; return; }
  const P = t.p;
  $('bwInfo').textContent = 'Bodyweight ' + fx(P.bw, 1) + ' N, body mass ' + fx(P.bw / 9.81, 1) + ' kg (from ' + P.bwFrom + ').';
  $('axesInfo').textContent = P.apKey ? 'Front–back is ' + P.apKey + ' (COP ' + (P.apKey === 'Fx' ? 'Ax' : 'Ay') + '). Braking was ' + (P.sg < 0 ? 'positive in the file, so the sign was flipped' : 'already negative') + '; COP ' + (P.apS < 0 ? 'was flipped so the heel-to-toe roll is positive' : 'already rolls heel to toe in the + direction') + '.' : 'No horizontal force in the file, so only vertical force and COP are analysed.';
  $('sideInfo').innerHTML = P.known ? 'Side to side: + is <strong>lateral</strong> (towards the outside of the ' + (S.foot === 'L' ? 'left' : 'right') + ' foot), − is medial.' : 'Side to side: + is the plate&rsquo;s own + direction. Fill in both boxes to report it as medial or lateral.';
  $('colSum').textContent = '(' + fx(t.fs, 0) + ' Hz)';
  $('colInfo').textContent = 'Columns in the file: ' + t.cols.join(', ') + '. ' + (t.raw.Fx ? '' : 'Fx was not exported, so there is no side-to-side force (tick Fx in the BioWare export next time). ');
}
[['foot', 'foot'], ['side', 'side'], ['bwMode', 'bwMode'], ['apSel', 'ap'], ['win', 'win']].forEach(([id, k]) => $(id).addEventListener('change', function () { A.set[k] = this.value; saveSettings(); refreshAll(); }));
$('mass').addEventListener('change', function () { A.set.mass = this.value; saveSettings(); refreshAll(); });

// ---------- points ----------
function setPoint(k) {
  const t = cur(); if (!t) return;
  if (A.cursor < 0) { status('Put the cursor on the graph first: click the moment on the graph, then step with the arrow keys.'); return; }
  const tm = t.raw.t[A.cursor];
  if (k === 'ball') t.set.ball = tm; else if (k === 'start') t.set.start = tm; else t.set.end = tm;
  refreshAll(); status((k === 'ball' ? 'Ball contact' : k === 'start' ? 'Foot contact' : 'Toe-off') + ' set at ' + fx((A.cursor - t.p.s) / t.fs * 1000, 0) + ' ms from foot contact.');
}
function renderPoints() {
  const t = cur(); if (!t) { $('ptTab').innerHTML = ''; return; }
  const P = t.p, ms = (i) => fx((i - P.s) / t.fs * 1000, 0), tt = (i) => fx(t.raw.t[i], 3);
  const rows = [['start', 'Foot contact', P.s, t.set.start != null ? 'set by hand' : 'automatic (Fz > ' + A.set.thr + ' N)'], ['ball', 'Ball contact', P.b, t.set.ball != null ? 'from video' : ''], ['end', 'Toe-off', P.e, t.set.end != null ? 'set by hand' : 'automatic (Fz < ' + A.set.thr + ' N)']];
  $('ptTab').innerHTML = '<thead><tr><th>Point</th><th>Time in file (s)</th><th>From foot contact (ms)</th><th>How</th><th></th></tr></thead><tbody>' + rows.map(([k, l, i, how]) =>
    '<tr><td><strong>' + l + '</strong></td><td class="num">' + (i != null ? tt(i) : '–') + '</td><td>' + (k === 'ball' ? '<input type="number" class="mini" id="ballMs" step="1" style="width:7rem" value="' + (i != null ? ms(i) : '') + '" placeholder="type ms">' : '<span class="num">' + ms(i) + '</span>') + '</td><td class="muted">' + how + '</td>'
    + '<td class="nowrap"><button class="btn small" type="button" data-pt="' + k + '">Set to the cursor</button>' + (i != null ? ' <button class="btn small ghost" type="button" data-nud="' + k + '" data-d="-1" title="One sample earlier">&minus;1</button> <button class="btn small ghost" type="button" data-nud="' + k + '" data-d="1" title="One sample later">+1</button>' : '') + (k === 'ball' && i != null ? ' <button class="btn small ghost" type="button" data-clr="ball">Clear</button>' : '') + '</td></tr>').join('') + '</tbody>';
}
$('ptTab').addEventListener('click', (e) => {
  const t = cur(); if (!t) return;
  const p = e.target.closest('[data-pt]'), n = e.target.closest('[data-nud]'), c = e.target.closest('[data-clr]');
  if (p) setPoint(p.dataset.pt);
  if (n) { const k = n.dataset.nud, d = +n.dataset.d / t.fs, P = t.p; const base = k === 'ball' ? t.raw.t[P.b] : k === 'start' ? t.raw.t[P.s] : t.raw.t[P.e]; t.set[k] = base + d; refreshAll(); }
  if (c) { t.set.ball = null; refreshAll(); }
});
$('ptTab').addEventListener('change', (e) => { if (e.target.id !== 'ballMs') return; const t = cur(), v = e.target.value; t.set.ball = v === '' ? null : t.raw.t[t.p.s] + (+v) / 1000; refreshAll(); });
$('ptReset').addEventListener('click', () => { const t = cur(); if (t) { t.set.start = t.set.end = null; refreshAll(); } });

// ---------- results ----------
let openHow = null;
function renderResults() {
  const t = cur(); if (!t) { $('resTab').innerHTML = '<p class="muted">Add a kick first.</p>'; return; }
  const r = results(t); let h = '<table class="restab"><thead><tr><th>Result</th><th style="text-align:right">Value</th><th>Units</th></tr></thead><tbody>', lg = '';
  h += '<tr><td colspan="3" class="muted small">' + (r.win === 'ball' ? 'From foot contact to ball contact.' : 'Whole stance (foot contact to toe-off).' + (A.set.win === 'ball' ? ' <span class="bad">No ball contact marked for this kick, so the whole stance was used.</span>' : '')) + '</td></tr>';
  VARS.forEach((v) => {
    const val = valOf(v, r, t); if (!Number.isFinite(val)) return;
    if (v.g !== lg) { h += '<tr class="grp"><td colspan="3">' + esc(v.g) + '</td></tr>'; lg = v.g; }
    h += '<tr class="vrow" data-k="' + v.k + '"><td>' + esc(v.l) + '</td><td class="val">' + fx(val, dec(v)) + '</td><td class="unit">' + unitOf(v) + '</td></tr>';
    if (openHow === v.k && r.how[v.k]) h += '<tr class="how"><td colspan="3">' + esc(r.how[v.k]) + '</td></tr>';
  });
  $('resTab').innerHTML = h + '</tbody></table>';
}
const dec = (v) => (v.u === 'F' || v.u === 'I' ? (A.units === 'BW' ? 2 : v.u === 'F' ? 0 : 1) : v.u === 'ms' ? 0 : v.u === 'BW/s' ? 1 : 1);
$('resTab').addEventListener('click', (e) => { const r = e.target.closest('tr.vrow'); if (!r) return; openHow = openHow === r.dataset.k ? null : r.dataset.k; renderResults(); });
const csvq = (s) => { s = String(s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function resultRows(t) { const r = results(t); return VARS.map((v) => [v.g, v.l, valOf(v, r, t), unitOf(v)]).filter((x) => Number.isFinite(x[2])); }
$('resCsv').addEventListener('click', () => { const t = cur(); if (!t) return; download(fname(t) + '_results.csv', ['Group,Result,Value,Units', ...resultRows(t).map((x) => [x[0], x[1], x[2].toFixed(4), x[3]].map(csvq).join(','))].join('\n')); });
$('xRes').addEventListener('click', () => $('resCsv').click());
const fname = (t) => safe(trialLabel(t)) || 'kick';

// ---------- compare ----------
const cmpOn = {}; VARS.forEach((v) => { cmpOn[v.k] = !!v.on; });
function kicks() { const o = []; A.trials.forEach((t) => { if (!o.includes(t.labels.kick)) o.push(t.labels.kick); }); return o; }
function st(a) { a = a.filter(Number.isFinite); const n = a.length; if (!n) return { m: NaN, sd: NaN, n }; const m = a.reduce((x, y) => x + y) / n; return { m, sd: n > 1 ? Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (n - 1)) : NaN, n }; }
function cmpData() {
  const dp = +$('cmpDp').value, mode = $('cmpMode').value, on = VARS.filter((v) => cmpOn[v.k]), ks = kicks();
  const R = new Map(A.trials.map((t) => [t, results(t)]));
  let cols, rows = [];
  if (mode === 'sum') {
    cols = ks.map((k) => { const n = A.trials.filter((t) => t.labels.kick === k).length; return k + (n > 1 ? ' (n = ' + n + ')' : ''); });
    on.forEach((v) => rows.push({ g: v.g, l: v.l + ' (' + unitOf(v) + ')', c: ks.map((k) => { const s = st(A.trials.filter((t) => t.labels.kick === k).map((t) => valOf(v, R.get(t), t))); return s.n ? s.m.toFixed(dp) + (s.n > 1 ? ' ± ' + s.sd.toFixed(dp) : '') : '–'; }) }));
  } else {
    cols = A.trials.map((t) => trialLabel(t));
    on.forEach((v) => rows.push({ g: v.g, l: v.l + ' (' + unitOf(v) + ')', c: A.trials.map((t) => { const x = valOf(v, R.get(t), t); return Number.isFinite(x) ? x.toFixed(dp) : '–'; }) }));
  }
  return { cols, rows };
}
function cmpTable(word) {
  const { cols, rows } = cmpData();
  const S = word ? { t: ' style="border-collapse:collapse;font-family:Arial;font-size:10pt"', th: ' style="border-top:1px solid #000;border-bottom:1px solid #000;padding:3px 8px;text-align:right"', th0: ' style="border-top:1px solid #000;border-bottom:1px solid #000;padding:3px 8px;text-align:left"', g: ' style="font-weight:bold;padding:3px 8px"', l: ' style="padding:3px 8px 3px 16px"', v: ' style="padding:3px 8px;text-align:right"' } : { t: '', th: ' class="num" style="text-align:right"', th0: '', g: '', l: '', v: ' class="num" style="text-align:right"' };
  let h = '<table' + S.t + '><thead><tr><th' + S.th0 + '>Result</th>' + cols.map((c) => '<th' + S.th + '>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>', lg = '';
  rows.forEach((r) => { if (r.g !== lg) { h += '<tr class="grp"><td colspan="' + (cols.length + 1) + '"' + S.g + '>' + esc(r.g) + '</td></tr>'; lg = r.g; } h += '<tr><td' + S.l + '>' + esc(r.l) + '</td>' + r.c.map((c) => '<td' + S.v + '>' + esc(c) + '</td>').join('') + '</tr>'; });
  return h + (word ? '<tr><td colspan="' + (cols.length + 1) + '" style="border-top:1px solid #000"></td></tr>' : '') + '</tbody></table>';
}
function renderCompare() {
  const n = A.trials.length;
  $('cmpMsg').innerHTML = n ? (kicks().length < 2 ? 'Add kicks of another type (or give them different kick types in Session) to compare them.' : '') : 'Add some kicks first.';
  $('cmpBody').classList.toggle('hide', !n); if (!n) return;
  $('cmpMetrics').innerHTML = VARS.map((v) => '<button type="button" class="chip' + (cmpOn[v.k] ? ' active' : '') + '" data-m="' + v.k + '" aria-pressed="' + cmpOn[v.k] + '">' + esc(v.l) + '</button>').join('');
  $('cmpTab').innerHTML = cmpTable(false);
  const ks = kicks(), multi = A.trials.length > ks.length;
  $('cmpCap').value = 'Table X. Support leg forces and centre of pressure (COP) ' + (A.set.win === 'ball' ? 'from foot contact to ball contact' : 'during stance') + ' for each kick type' + (multi && $('cmpMode').value === 'sum' ? ' (mean ± SD)' : '') + '. Front–back COP is positive towards the toes; side-to-side COP ' + (A.trials[0].p.known ? 'is positive laterally' : 'is relative to the plate') + '. Loading rate is peak vertical force (body weights) divided by the time from foot contact to the peak.';
  const sel = $('cmpVar'), cv = sel.value || 'Fz';
  sel.innerHTML = Object.entries(SIG).filter(([k]) => A.trials.some((t) => t.p[k])).map(([k, s]) => '<option value="' + k + '"' + (k === cv ? ' selected' : '') + '>' + s.l + '</option>').join('');
  drawCmp();
}
function drawCmp() {
  const el = $('cCmp'); if (!el.clientWidth || !A.trials.length) return;
  const k = $('cmpVar').value || 'Fz', xm = $('cmpX').value, show = $('cmpShow').value;
  const c = canvasIn(el, 340), g = canvasG(c.ctx, UI), ser = [];
  kicks().forEach((kk) => {
    const ts = A.trials.filter((t) => t.labels.kick === kk), col = kickColour(kk);
    const X = (t) => { const P = t.p, n = P.e - P.s + 1, x = new Float64Array(n); for (let i = 0; i < n; i++) x[i] = xm === 'pct' ? i / (n - 1) * 100 : i / t.fs * 1000; return x; };
    if (show === 'each' || ts.length === 1) ts.forEach((t) => { const y = signal(t, k); if (y) ser.push({ x: X(t), y, c: col }); });
    else {
      const grid = []; const mx = xm === 'pct' ? 100 : Math.max(...ts.map((t) => (t.p.e - t.p.s) / t.fs * 1000)); for (let i = 0; i <= mx; i++) grid.push(i);
      const ys = ts.map((t) => { const y = signal(t, k), x = X(t); return y ? grid.map((v) => { if (v > x[x.length - 1]) return NaN; let j = 0; while (j < x.length - 2 && x[j + 1] < v) j++; const f = (v - x[j]) / ((x[j + 1] - x[j]) || 1); return y[j] + (y[j + 1] - y[j]) * f; }) : null; }).filter(Boolean);
      const m = [], lo = [], hi = []; grid.forEach((_, i) => { const s = st(ys.map((y) => y[i])); m.push(s.n ? s.m : NaN); lo.push(s.n > 1 ? s.m - s.sd : NaN); hi.push(s.n > 1 ? s.m + s.sd : NaN); });
      ser.push({ x: grid, y: m, lo, hi, c: col });
    }
  });
  const ax = axes(g, 64, 10, c.w - 78, c.h - 56, range(ser, 'x'), padRange(range(ser, 'y', true), 0.06), { fs: 12, grid: true, zero: true, ylab: sigLabel(k, A.trials[0]).replace(/ \(cm.*/, ' (cm)'), xlab: xm === 'pct' ? 'Stance (%)' : 'Time from foot contact (ms)' });
  g.clip(64, 10, c.w - 78, c.h - 56);
  ser.forEach((q) => { if (q.lo) band(g, q.x, q.lo, q.hi, ax.sx, ax.sy, { fill: q.c, alpha: 0.18 }); });
  ser.forEach((q) => line(g, q.x, q.y, ax.sx, ax.sy, { stroke: q.c, lw: 2 })); g.unclip();
  let lx = 74; kicks().forEach((kk) => { c.ctx.font = '12px ' + UI; g.path([lx, 22, lx + 20, 22], { stroke: kickColour(kk), lw: 3 }); g.text(kk, lx + 26, 22, { size: 12, base: 'middle' }); lx += 46 + c.ctx.measureText(kk).width; });
}
$('cmpMetrics').addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (!b) return; cmpOn[b.dataset.m] = !cmpOn[b.dataset.m]; renderCompare(); });
['cmpMode', 'cmpDp'].forEach((id) => $(id).addEventListener('change', renderCompare));
['cmpVar', 'cmpX', 'cmpShow'].forEach((id) => $(id).addEventListener('change', drawCmp));
$('cmpCopy').addEventListener('click', async () => {
  const { cols, rows } = cmpData(), txt = ['Result\t' + cols.join('\t'), ...rows.map((r) => r.l + '\t' + r.c.join('\t'))].join('\n');
  try { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([cmpTable(true)], { type: 'text/html' }), 'text/plain': new Blob([txt], { type: 'text/plain' }) })]); $('cmpCopyMsg').textContent = 'Copied. Paste it into Word.'; }
  catch (e) { try { await navigator.clipboard.writeText(txt); $('cmpCopyMsg').textContent = 'Copied as text.'; } catch (e2) { $('cmpCopyMsg').textContent = 'This browser would not copy. Use Table (CSV).'; } }
});
$('cmpCsv').addEventListener('click', () => { const { cols, rows } = cmpData(); download('kick_comparison.csv', [['Group', 'Result', ...cols].map(csvq).join(','), ...rows.map((r) => [r.g, r.l, ...r.c].map(csvq).join(','))].join('\n')); });
$('cmpLong').addEventListener('click', () => {
  const vs = VARS; const head = ['Participant', 'Kick type', 'Trial', 'File', 'Window', ...vs.map((v) => v.l + ' (' + unitOf(v) + ')')];
  download('kick_session_results.csv', [head.map(csvq).join(','), ...A.trials.map((t) => { const r = results(t); return [t.labels.athlete, t.labels.kick, t.labels.trial, t.name, r.win === 'ball' ? 'foot contact to ball contact' : 'stance', ...vs.map((v) => { const x = valOf(v, r, t); return Number.isFinite(x) ? x.toFixed(4) : ''; })].map(csvq).join(','); })].join('\n'));
});
$('cmpNorm').addEventListener('click', () => {
  const ks = ['Fz', 'AP', 'ML', 'cAP', 'cML'].filter((k) => A.trials.some((t) => t.p[k]));
  const lines = [['Participant', 'Kick type', 'Trial', 'Signal', 'Units', ...Array.from({ length: 101 }, (_, i) => i + '%')].map(csvq).join(',')];
  A.trials.forEach((t) => ks.forEach((k) => { const y = signal(t, k); if (!y) return; const n = y.length; const v = []; for (let i = 0; i <= 100; i++) { const p = i / 100 * (n - 1), j = Math.min(n - 2, Math.floor(p)), f = p - j; v.push(y[j] + (y[j + 1] - y[j]) * f); } lines.push([t.labels.athlete, t.labels.kick, t.labels.trial, SIG[k].l, sigLabel(k, t).match(/\(([^,)]*)/)[1], ...v.map((x) => (Number.isFinite(x) ? x.toFixed(4) : ''))].map(csvq).join(',')); }));
  download('kick_session_time_normalised.csv', lines.join('\n'));
});
$('cmpFig').addEventListener('click', () => { openFigure('curves', $('cmpVar').value); const f = A.fig; f.xm = $('cmpX').value; f.show = $('cmpShow').value; selectTab('figure'); });

// ---------- export ----------
$('xCont').addEventListener('click', () => {
  const t = cur(); if (!t) return; const P = t.p, k = A.units === 'BW' ? 1 / P.bw : 1, u = A.units === 'BW' ? 'BW' : 'N';
  const head = ['Time in file (s)', 'Time from foot contact (ms)', 'Vertical force (' + u + ')', 'Front-back force (' + u + ', braking negative)', 'Side-to-side force (' + u + ')', 'COP front-back (cm)', 'COP side to side (cm)', 'Free moment (N m)'];
  const out = [head.map(csvq).join(',')];
  for (let i = P.s; i <= P.e; i++) out.push([t.raw.t[i].toFixed(4), ((i - P.s) / t.fs * 1000).toFixed(1), (P.Fz[i] * k).toFixed(4), P.AP ? (P.AP[i] * k).toFixed(4) : '', P.ML ? (P.ML[i] * k).toFixed(4) : '', Number.isFinite(P.cAP[i]) ? P.cAP[i].toFixed(3) : '', Number.isFinite(P.cML[i]) ? P.cML[i].toFixed(3) : '', Number.isFinite(P.Tz[i]) ? P.Tz[i].toFixed(4) : ''].join(','));
  download(fname(t) + '_continuous.csv', out.join('\n'));
});
$('xProj').addEventListener('click', () => {
  const o = { app: 'Kick Analysis', version: VERSION, set: A.set, units: A.units, kickCol: A.kickCol, trials: A.trials.map((t) => ({ name: t.name, labels: t.labels, set: t.set, text: t.text })) };
  download('kick_analysis_project.json', new Blob([JSON.stringify(o)], { type: 'application/json' }));
});
$('projIn').addEventListener('change', async function () {
  const f = this.files[0]; this.value = ''; if (!f) return;
  try {
    const o = JSON.parse(await f.text()); if (!o.trials) throw new Error('not a Kick Analysis project file');
    A.trials = []; A.set = Object.assign(defaultSettings(), o.set || {}); A.units = o.units || 'N'; A.kickCol = o.kickCol || {}; saveSettings();
    o.trials.forEach((q) => { const t = addText(q.text, q.name, q.labels); if (t) { t.set = q.set; process(t); } });
    A.cur = A.trials.length ? 0 : -1; refreshAll(); status('Project opened: ' + A.trials.length + ' kicks.');
  } catch (e) { status('<span class="bad">Could not open the project file (' + esc(e.message) + ').</span>'); }
});

// ---------- centre of pressure (go deeper) ----------
function renderCop() {
  const t = cur(); if (!t) return; const P = t.p, raw = t.raw, fs = t.fs;
  const a = Math.max(0, P.s - Math.round(0.05 * fs)), b = Math.min(raw.t.length - 1, P.e + Math.round(0.05 * fs));
  const x = []; for (let i = a; i <= b; i++) x.push((i - P.s) / fs * 1000);
  $('cpThr').textContent = A.set.cthr + '% of body weight = ' + fx(P.cthr, 0) + ' N';
  $('cpRule').innerHTML = 'COP is only used while F<sub>z</sub> &gt; ' + A.set.cthr + '% of body weight (' + fx(P.cthr, 0) + ' N), then filtered at ' + A.set.cfc + ' Hz. For this kick that leaves ' + fx((P.ce - P.cs) / fs * 1000, 0) + ' ms of ' + fx((P.e - P.s) / fs * 1000, 0) + ' ms of stance.';
  const xr = [x[0], x[x.length - 1]], W = (el) => el.clientWidth;
  // 1. force with threshold
  let el = $('cCop1'); if (!W(el)) return;
  let c = canvasIn(el, 200), g = canvasG(c.ctx, UI);
  const fz = []; for (let i = a; i <= b; i++) fz.push(P.Fz[i]);
  let ax = axes(g, 60, 8, c.w - 70, 150, xr, padRange(range([{ y: fz }], 'y'), 0.05), { fs: 11, grid: true, zero: true, ylab: 'Fz (N)' });
  g.clip(60, 8, c.w - 70, 150);
  if (P.cs >= 0) g.rect(ax.sx((P.cs - P.s) / fs * 1000), 8, ax.sx((P.ce - P.s) / fs * 1000) - ax.sx((P.cs - P.s) / fs * 1000), 150, { fill: 'rgba(15,118,110,.1)' });
  g.path([60, ax.sy(P.cthr), c.w - 10, ax.sy(P.cthr)], { stroke: '#dc2626', lw: 1.5, dash: [6, 4] });
  line(g, x, fz, ax.sx, ax.sy, { stroke: '#1d4ed8', lw: 1.8 }); g.unclip();
  g.text('threshold', c.w - 14, ax.sy(P.cthr) - 4, { size: 11, anchor: 'end', fill: '#dc2626' });
  // 2. raw COP
  el = $('cCop2'); c = canvasIn(el, 200); g = canvasG(c.ctx, UI);
  const apC = P.apKey === 'Fx' ? raw.Ax : raw.Ay, mlC = P.apKey === 'Fx' ? raw.Ay : raw.Ax;
  const ra = [], rm = [], va = [], vm = [];
  for (let i = a; i <= b; i++) { const ok = i >= P.cs && i <= P.ce, s1 = raw.Fz[i] > 5; ra.push(s1 ? apC[i] * 100 : NaN); rm.push(s1 ? mlC[i] * 100 : NaN); va.push(ok ? apC[i] * 100 : NaN); vm.push(ok ? mlC[i] * 100 : NaN); }
  const yrv = padRange(range([{ y: va.concat(vm) }], 'y'), 0.6);
  ax = axes(g, 60, 8, c.w - 70, 150, xr, yrv, { fs: 11, grid: true, zero: true, ylab: 'cm (plate)' });
  g.clip(60, 8, c.w - 70, 150);
  line(g, x, ra, ax.sx, ax.sy, { stroke: '#cbd5e1', lw: 1 }); line(g, x, rm, ax.sx, ax.sy, { stroke: '#cbd5e1', lw: 1 });
  line(g, x, va, ax.sx, ax.sy, { stroke: '#0f766e', lw: 1.5 }); line(g, x, vm, ax.sx, ax.sy, { stroke: '#d97706', lw: 1.5 }); g.unclip();
  // 3. analysed
  el = $('cCop3'); c = canvasIn(el, 200); g = canvasG(c.ctx, UI);
  const ca = [], cm = []; for (let i = a; i <= b; i++) { ca.push(P.cAP[i]); cm.push(P.cML[i]); }
  ax = axes(g, 60, 8, c.w - 70, 150, xr, padRange(range([{ y: ca.concat(cm) }], 'y'), 0.08), { fs: 11, grid: true, zero: true, ylab: 'COP (cm)', xlab: 'Time from foot contact (ms)' });
  g.clip(60, 8, c.w - 70, 150); line(g, x, ca, ax.sx, ax.sy, { stroke: '#0f766e', lw: 2 }); line(g, x, cm, ax.sx, ax.sy, { stroke: '#d97706', lw: 2 }); g.unclip();
  g.text('front–back', 70, 14, { size: 11, base: 'top', fill: '#0f766e', bold: true }); g.text('side to side', 160, 14, { size: 11, base: 'top', fill: '#d97706', bold: true });
}

// ---------- tabs ----------
function selectTab(k) {
  tab = k;
  document.querySelectorAll('#panel .tab').forEach((b) => b.setAttribute('aria-selected', b.dataset.t === k ? 'true' : 'false'));
  document.querySelectorAll('#panel .pane').forEach((p) => p.classList.toggle('hide', p.dataset.p !== k));
  renderTab();
}
function renderTab() {
  if (tab === 'setup') renderSetup(); else if (tab === 'points') renderPoints(); else if (tab === 'results') renderResults();
  else if (tab === 'figure') renderFigure(); else if (tab === 'compare') renderCompare(); else if (tab === 'cop') renderCop();
}
document.querySelectorAll('#panel .tab').forEach((b) => b.addEventListener('click', () => selectTab(b.dataset.t)));

function refreshAll() {
  A.trials.forEach(process);
  const t = cur(), has = !!t;
  $('empty').classList.toggle('hide', has); $('traceWrap').classList.toggle('hide', !has);
  $('trialName').textContent = has ? '(' + trialLabel(t) + ')' : '';
  $('units').value = A.units;
  renderSession(); renderChips();
  if (has) { drawMain(); keyStats(); } else { $('readout').innerHTML = ''; $('keyStats').innerHTML = ''; $('warnBox').innerHTML = ''; }
  renderTab();
}
A.fn.refreshAll = refreshAll;
let rt = null; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (cur()) drawMain(); if (tab === 'compare') drawCmp(); if (tab === 'cop') renderCop(); }, 120); });

// ---------- settings dialog ----------
const dlg = $('setDlg'), SK = ['ffc', 'cfc', 'thr', 'cthr', 'orig'];
function syncSet() { SK.forEach((k) => { $('s_' + k).value = A.set[k]; }); }
$('setBtn').addEventListener('click', () => { syncSet(); dlg.showModal(); });
$('setOpen2').addEventListener('click', () => { syncSet(); dlg.showModal(); });
$('setClose').addEventListener('click', () => dlg.close());
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
SK.forEach((k) => $('s_' + k).addEventListener('change', function () { A.set[k] = k === 'orig' ? this.value : (+this.value || defaultSettings()[k]); saveSettings(); refreshAll(); }));
$('setReset').addEventListener('click', () => { const d = defaultSettings(); SK.forEach((k) => { A.set[k] = d[k]; }); saveSettings(); syncSet(); refreshAll(); status('Recommended settings restored.'); });

// ---------- citation ----------
(function () {
  const cd = $('citeDlg'), url = 'https://tommyebright.github.io/kick-analyser/', yr = '2026', v = VERSION.split('.').slice(0, 2).join('.');
  const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  $('citeBtn').addEventListener('click', () => {
    $('citeApa').textContent = 'Bright, T. E. (' + yr + '). Kick Analysis (Version ' + v + ') [Computer software]. Plymouth Marjon University. ' + url;
    $('citeHarvard').textContent = 'Bright, T.E. (' + yr + ') Kick Analysis (Version ' + v + ') [Computer program]. Plymouth Marjon University. Available at: ' + url + ' (Accessed: ' + today() + ').';
    $('citeBib').textContent = '@software{bright_kick_analysis_' + yr + ',\n  author = {Bright, Thomas E.},\n  title = {Kick Analysis},\n  version = {' + v + '},\n  year = {' + yr + '},\n  publisher = {Plymouth Marjon University},\n  url = {' + url + '}\n}';
    cd.showModal();
  });
  $('citeClose').addEventListener('click', () => cd.close());
  cd.addEventListener('click', (e) => { if (e.target === cd) cd.close(); });
  cd.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async function () {
    const txt = $(this.getAttribute('data-copy')).textContent; let ok = false;
    try { await navigator.clipboard.writeText(txt); ok = true; } catch (e) { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } ta.remove(); }
    const old = this.textContent; this.textContent = ok ? 'Copied' : 'Select and copy it by hand'; setTimeout(() => { this.textContent = old; }, 1600);
  }));
})();

// ---------- start ----------
$('ver').textContent = 'v' + VERSION; $('verFoot').textContent = VERSION;
let deferred = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; $('installBtn').classList.remove('hide'); });
$('installBtn').addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('installBtn').classList.add('hide'); });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
refreshAll();

// ---------- what the results mean ----------
(function () {
  const d = $('defDlg');
  const intro = '<p>Force and centre of pressure (COP) go together. The plate measures the force the ground puts on the foot (three directions, plus a twist) and <strong>where</strong> that force acts: the COP. Force tells you <em>how hard</em>; COP tells you <em>where under the foot</em> and how that changes. The same measures work for kicking, landing, cutting, single-leg balance or any task with one foot on the plate.</p>'
    + '<div class="tip"><p><strong>Which ones to report?</strong> Pick the few that answer your question, and use the same window for every trial.<br>'
    + '<strong>Balance or standing tasks:</strong> mean COP speed, path length, 95% ellipse area and the front–back and side-to-side SD (or excursion).<br>'
    + '<strong>Landings and plants:</strong> peak vertical force, time to peak, loading rate, peak braking force and braking impulse.<br>'
    + '<strong>Kicks, cuts and turns:</strong> front–back and side-to-side COP excursion, COP direction, COP at the moment that matters (e.g. ball contact), and peak free moment.</p></div>';
  let lg = '', h = intro;
  VARS.forEach((v) => {
    if (v.g !== lg) { h += '<h3>' + esc(v.g) + '</h3>'; lg = v.g; }
    h += '<div class="defrow"><p><strong>' + esc(v.l) + '</strong> <span class="muted">(' + esc(v.u === 'F' ? 'N or BW' : v.u === 'I' ? 'N·s or BW·s' : v.u) + ')</span><br>' + esc(v.def) + '</p>' + (v.ex ? '<p class="muted small"><em>Example:</em> ' + esc(v.ex) + '</p>' : '') + '</div>';
  });
  h += '<p class="muted small">Direction conventions: front–back force is negative when braking and positive when pushing forwards. Front–back COP is positive towards the toes. Side-to-side COP and force are positive laterally (towards the little toe) when the standing foot and plate direction are set in Setup, otherwise positive is the plate’s own + direction. COP values are relative to where the COP started at foot contact.</p>';
  $('defBody').innerHTML = h;
  document.querySelectorAll('[data-defs]').forEach((b) => b.addEventListener('click', () => d.showModal()));
  $('defClose').addEventListener('click', () => d.close());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
})();

// ---------- ball contact from video frames ----------
function videoMs() { const f = +$('vFps').value, a = +$('vF1').value, b = +$('vF2').value; return f > 0 && $('vF1').value !== '' && $('vF2').value !== '' ? (b - a) / f * 1000 : NaN; }
['vFps', 'vF1', 'vF2'].forEach((id) => $(id).addEventListener('input', () => { const m = videoMs(); $('vOut').textContent = Number.isFinite(m) ? (m >= 0 ? (fx(m, 0) + ' ms after foot contact (±' + fx(1000 / +$('vFps').value, 0) + ' ms)') : 'Ball contact must come after foot contact.') : ''; }));
$('vSet').addEventListener('click', () => {
  const t = cur(), m = videoMs(); if (!t) return;
  if (!(m > 0)) { $('vOut').textContent = 'Type the frame rate and both frame numbers first.'; return; }
  t.set.ball = t.raw.t[t.p.s] + m / 1000; refreshAll(); status('Ball contact set at ' + fx(m, 0) + ' ms from foot contact, from the video frames.');
});
