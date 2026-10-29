// The main force-time graph: phases, net impulse shading, events you can drag, hover read-out, zoom and the
// overview strip underneath. Also the jumper figure and "play the jump".
import { A, $, esc, COL, PLATE_COLS, persist, iOf } from './state.js?v=1.0.0';
import { Chart, frame, axes, line, range, band, vline, hline, halo, dot, fillBetween } from './plot.js?v=1.0.0';
import { phaseAt, explain, PHASES } from './analyse.js?v=1.0.0';
import { drawFigure } from './figure.js?v=1.0.0';

let main = null, over = null, fig = null;
let drag = null, hoverEv = null;
const EV_COL = { onset: '#2563eb', touchdown: '#2563eb', takeoff: '#059669', landing: '#9333ea', weighS: '#64748b', weighE: '#64748b' };
const EV_SHORT = { onset: 'Start', touchdown: 'Touchdown', takeoff: 'Take-off', landing: 'Landing', weighS: '\u25B8 Weigh', weighE: 'Weigh \u25C2' };

// ---------- units ----------
export function unitK() { const R = A.R; if (!R || !R.ok) return 1; return A.units === 'Nkg' ? R.m : A.units === 'BW' ? R.BW : 1; }
export function unitLab() { return A.units === 'Nkg' ? 'Force (N/kg)' : A.units === 'BW' ? 'Force (bodyweights)' : 'Force (N)'; }
export function fmtF(v) { const k = unitK(); if (!Number.isFinite(v)) return '&ndash;'; return A.units === 'N' ? v.toFixed(0) + ' N' : (v / k).toFixed(2) + (A.units === 'BW' ? ' &times; BW' : ' N/kg'); }
const cache = new WeakMap();
export function scaled(y) {
  if (!y) return y; const k = unitK(); if (k === 1) return y;
  const c = cache.get(y); if (c && c.k === k) return c.out;
  const out = new Float64Array(y.length); for (let i = 0; i < y.length; i++) out[i] = y[i] / k;
  cache.set(y, { k, out }); return out;
}

// ---------- view ----------
export function jumpRange() {
  const R = A.R, fs = A.D.fs, n = A.D.n;
  if (!R || !R.ok) return { x0: 0, x1: (n - 1) / fs };
  const endI = R.landEndI > 0 ? R.landEndI : R.LD >= 0 ? R.LD + Math.round(0.3 * fs) : R.TO + Math.round(0.3 * fs);
  let a, b;
  if (R.jump === 'dj') { a = (R.stepOff >= 0 ? R.stepOff : R.TD) - 0.15 * fs; b = endI + 0.4 * fs; }
  else { a = R.onset - 0.3 * fs; b = endI + 0.35 * fs; }
  return { x0: Math.max(0, a / fs), x1: Math.min((n - 1) / fs, b / fs) };
}
export function setView(x0, x1) {
  const T = (A.D.n - 1) / A.D.fs, minW = Math.min(T, 20 / A.D.fs);
  if (x1 - x0 < minW) { const c = (x0 + x1) / 2; x0 = c - minW / 2; x1 = c + minW / 2; }
  if (x0 < 0) { x1 -= x0; x0 = 0; } if (x1 > T) { x0 -= x1 - T; x1 = T; } x0 = Math.max(0, x0);
  A.view = { x0, x1 };
  redraw();
  if (A.fn.viewChanged) A.fn.viewChanged();
}

// ---------- drawing ----------
function seriesList() {
  const R = A.R, out = [];
  const multi = R.plates.length > 1;
  if (A.show.plates && multi) R.plates.forEach((p, j) => { if (p.role !== 'off') out.push({ y: p.fz, col: PLATE_COLS[j], width: 1.6, name: p.name + ' Fz' }); });
  if (A.show.fx) R.plates.forEach((p, j) => { if (p.fx && p.role !== 'off') out.push({ y: p.fx, col: PLATE_COLS[j], width: 1.4, dash: [7, 4], name: p.name + ' Fx' }); });
  if (A.show.fy) R.plates.forEach((p, j) => { if (p.fy && p.role !== 'off') out.push({ y: p.fy, col: PLATE_COLS[j], width: 1.4, dash: [2, 3], name: p.name + ' Fy' }); });
  if (R.filtered && A.show.raw) out.push({ y: R.Fraw, col: COL.raw, width: 1.2, name: 'Raw (unfiltered)' });
  if (A.show.total || !out.length) out.push({ y: R.F, col: COL.total, width: 2.6, name: multi ? 'Total vertical force' : 'Vertical force (Fz)', main: true });
  return out;
}
export function legendItems() { return A.R && A.R.ok ? seriesList().map((s) => ({ col: s.col, name: s.name, dash: s.dash })) : []; }

function drawMain(ctx, w, h, exp) {
  const R = A.R, D = A.D; if (!R || !R.ok || !A.view) return null;
  const t = D.t, { x0, x1 } = A.view;
  const i0 = Math.max(0, Math.floor(x0 * D.fs) - 1), i1 = Math.min(D.n - 1, Math.ceil(x1 * D.fs) + 1);
  const k = unitK();
  const ser = seriesList();
  const yr = range(ser.map((s) => s.y), i0, i1, [0, R.BW], 0.06).map((v) => v / k);
  const fr = frame(w, h, x0, x1, yr[0], yr[1], { T: 30, L: 62, B: 36 });
  axes(ctx, fr, { ylab: unitLab(), xlab: 'Time (s)', xGrid: false });
  // phases
  if (A.show.phases) R.phases.forEach((p) => { band(ctx, fr, t[p.s], t[Math.min(D.n - 1, p.e)], p.col, p.key === 'flight' || p.key === 'drop' ? 0.18 : 0.13); });
  // net impulse shading
  if (A.show.impulse) {
    const s0 = R.jump === 'dj' ? R.TD : R.onset;
    fillBetween(ctx, fr, t, scaled(R.F), R.BW / k, Math.max(i0, s0), Math.min(i1, R.TO), COL.pos, COL.neg);
    if (R.LD >= 0 && R.landEndI > 0) fillBetween(ctx, fr, t, scaled(R.F), R.BW / k, Math.max(i0, R.LD), Math.min(i1, R.landEndI), 'rgba(168,85,247,.2)', 'rgba(168,85,247,.2)');
  }
  // reference lines
  hline(ctx, fr, R.BW / k, COL.bw, [7, 5], 'Bodyweight ' + (A.units === 'N' ? R.BW.toFixed(0) + ' N' : A.units === 'BW' ? '(1)' : (R.BW / R.m).toFixed(2) + ' N/kg'), 1.4);
  if (A.level >= 2) hline(ctx, fr, A.S.set.thr / k, '#94a3b8', [2, 3], 'Contact threshold ' + A.S.set.thr + ' N', 1);
  if (A.level >= 3 && R.onsetThr) hline(ctx, fr, R.onsetThr / k, '#64748b', [1, 4], (R.jump === 'cmj' ? 'Bodyweight − ' : 'Bodyweight + ') + A.S.set.onsetK + ' SD (start of movement)', 1, true);
  // lines
  ser.forEach((s) => line(ctx, fr, t, scaled(s.y), { col: s.col, width: s.width, dash: s.dash, i0, i1 }));
  // phase labels
  if (A.show.phases) {
    ctx.save(); ctx.font = '600 11px system-ui, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    R.phases.forEach((p) => {
      const a = Math.max(fr.L, fr.X(t[p.s])), b = Math.min(fr.L + fr.W, fr.X(t[Math.min(D.n - 1, p.e)]));
      const name = p.key === 'drop' ? 'Falling' : p.name;
      if (b - a > ctx.measureText(name).width + 6) { ctx.fillStyle = p.key === 'flight' || p.key === 'drop' ? '#475569' : p.col; ctx.globalAlpha = 1; halo(ctx, name, (a + b) / 2, fr.T + 4); }
    });
    ctx.restore();
  }
  // events
  ctx.save(); ctx.font = '600 10.5px system-ui, Arial, sans-serif';
  const placed = [];
  R.events.forEach((e) => {
    const x = fr.X(t[e.i]); if (x < fr.L - 2 || x > fr.L + fr.W + 2) return;
    if (!e.edit) { vline(ctx, fr, t[e.i], '#94a3b8', [2, 3], 1.2); return; }
    const col = EV_COL[e.key] || '#2563eb';
    vline(ctx, fr, t[e.i], col, [5, 4], 1.6);
    if (exp) return;
    const lab = EV_SHORT[e.key] || e.name;
    const tw = ctx.measureText(lab).width + 12;
    if (e.weigh) { // weighing edges: small handles at the bottom so they never hide the event handles
      const by = fr.T + fr.H - 19, bx = Math.round(e.key === 'weighS' ? x : x - tw);
      ctx.fillStyle = col; roundRect(ctx, bx, by, tw, 16, 4); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(lab, bx + tw / 2, by + 8.5);
      e._hx = [bx, bx + tw]; e._hy = [by, by + 16];
      return;
    }
    let bx = Math.round(x - tw / 2);
    // stagger overlapping handles
    let row = 0; while (placed.some((q) => q.row === row && !(bx + tw < q.a || bx > q.b))) row++;
    placed.push({ a: bx, b: bx + tw, row });
    const by = 3 + row * 0; // one row; overlap is rare (weighing handles sit apart)
    ctx.fillStyle = col; roundRect(ctx, bx, by, tw, 17, 4); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(lab, x, by + 9);
    ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x, by + 17); ctx.lineTo(x, fr.T); ctx.stroke();
    e._hx = [bx, bx + tw];
  });
  ctx.restore();
  if (exp) { // export: key for the lines
    ctx.save(); ctx.font = '11px system-ui, Arial, sans-serif'; ctx.textBaseline = 'middle';
    let lx = fr.L + 8; const ly = 12;
    ser.forEach((s) => { ctx.strokeStyle = s.col; ctx.lineWidth = 2.5; if (s.dash) ctx.setLineDash(s.dash); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 18, ly); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#1f2a33'; ctx.fillText(s.name, lx + 22, ly); lx += ctx.measureText(s.name).width + 40; });
    ctx.restore();
  }
  return fr;
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

function overlayMain(ctx, w, h, fr) {
  const R = A.R; if (!R || !R.ok) return;
  if (drag && drag.type === 'zoom' && Math.abs(drag.x1 - drag.x0) > 3) {
    ctx.save(); ctx.fillStyle = 'rgba(37,99,235,.12)'; ctx.strokeStyle = '#2563eb'; ctx.setLineDash([4, 3]);
    const a = Math.min(drag.x0, drag.x1), b = Math.max(drag.x0, drag.x1);
    ctx.fillRect(a, fr.T, b - a, fr.H); ctx.strokeRect(a + 0.5, fr.T + 0.5, b - a, fr.H); ctx.restore();
  }
  const i = A.cursor; if (i < 0) return;
  const x = fr.X(A.D.t[i]); if (x < fr.L || x > fr.L + fr.W) return;
  ctx.save(); ctx.strokeStyle = A.pinned ? '#c0264d' : '#334155'; ctx.lineWidth = A.pinned ? 2 : 1.2;
  ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, fr.T); ctx.lineTo(Math.round(x) + 0.5, fr.T + fr.H); ctx.stroke(); ctx.restore();
  seriesList().forEach((s) => { const v = s.y[i] / unitK(); const y = fr.Y(v); if (y >= fr.T && y <= fr.T + fr.H) dot(ctx, x, y, s.col, s.main ? 5 : 3.5); });
  // time tag
  ctx.save(); ctx.font = '600 11px system-ui, Arial'; const lab = A.D.t[i].toFixed(3) + ' s';
  const tw = ctx.measureText(lab).width + 10; const bx = Math.min(fr.L + fr.W - tw, Math.max(fr.L, x - tw / 2));
  ctx.fillStyle = A.pinned ? '#c0264d' : '#334155'; roundRect(ctx, bx, fr.T + fr.H - 18, tw, 16, 3); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(lab, bx + tw / 2, fr.T + fr.H - 10); ctx.restore();
}

// ---------- interaction ----------
function evNear(px, py, fr) {
  const R = A.R; if (!R || !R.ok || !fr) return null;
  let best = null, bd = 8;
  R.events.forEach((e) => {
    if (!e.edit) return;
    const x = fr.X(A.D.t[e.i]);
    const inHandle = e._hx && (e._hy ? py >= e._hy[0] && py <= e._hy[1] : py < fr.T) && px >= e._hx[0] - 2 && px <= e._hx[1] + 2;
    const d = inHandle ? 0 : Math.abs(px - x);
    if (d < bd && (inHandle || py >= fr.T)) { bd = d; best = e; }
  });
  return best;
}
function setCursorAt(px, fr) {
  const t = fr.tAt(px); A.cursor = iOf(t); cursorChanged();
}
export function cursorChanged() {
  if (main) main.overlay();
  if (fig) fig.render();
  readout();
  if (over) over.overlay();
  if (A.fn.cursorMoved) A.fn.cursorMoved();
}

function onMove(p, fr, ev) {
  if (!fr) return;
  if (drag) {
    if (drag.type === 'zoom') { drag.x1 = Math.max(fr.L, Math.min(fr.L + fr.W, p.x)); main.overlay(); return; }
    if (drag.type === 'event') {
      const t = Math.max(0, Math.min((A.D.n - 1) / A.D.fs, fr.tAt(p.x)));
      drag.t = Math.round(t * A.D.fs) / A.D.fs;
      if (!drag.raf) drag.raf = requestAnimationFrame(() => { drag.raf = 0; applyEvent(drag.key, drag.t, false); });
      return;
    }
  }
  const e = evNear(p.x, p.y, fr);
  hoverEv = e;
  main.ov.style.cursor = e ? 'ew-resize' : 'crosshair';
  if (!A.pinned && !A.play.on && p.x >= fr.L && p.x <= fr.L + fr.W) setCursorAt(p.x, fr);
}
function onDown(p, fr, ev) {
  if (!fr || ev.button > 0) return false;
  const e = evNear(p.x, p.y, fr);
  if (e) { drag = { type: 'event', key: e.key, t: A.D.t[e.i] }; return true; }
  if (p.x >= fr.L && p.x <= fr.L + fr.W && p.y >= fr.T - 30) { drag = { type: 'zoom', x0: p.x, x1: p.x }; return true; }
  return false;
}
function onUp(p, fr) {
  if (!drag) return;
  const d = drag; drag = null;
  if (d.type === 'event') { if (d.raf) cancelAnimationFrame(d.raf); applyEvent(d.key, d.t, true); return; }
  if (d.type === 'zoom') {
    if (Math.abs(d.x1 - d.x0) > 6) { const a = fr.tAt(Math.min(d.x0, d.x1)), b = fr.tAt(Math.max(d.x0, d.x1)); setView(a, b); }
    else { // a click: pin or unpin the cursor
      if (A.pinned) { A.pinned = false; } else { A.pinned = true; setCursorAt(p.x, fr); }
      cursorChanged();
    }
    main.overlay();
  }
}
// Moving an event by hand (drag on the graph or nudge in the Events tab).
export function applyEvent(key, t, commit) {
  const set = A.S.set;
  if (key === 'weighS' || key === 'weighE') {
    const w = A.R.w; const fs = A.D.fs;
    let s = w ? w.s / fs : 0, e = w ? w.e / fs : 0;
    if (key === 'weighS') s = Math.min(t, e - 3 / fs); else e = Math.max(t + 1 / fs, s + 3 / fs);
    set.weigh = { s, e };
  } else { set.ev = Object.assign({}, set.ev); set.ev[key] = t; }
  A.fn.refresh({ keepView: true, quick: !commit });
  if (commit) persist();
}

// ---------- overview strip ----------
function drawOver(ctx, w, h) {
  const R = A.R, D = A.D; if (!R || !R.ok) return null;
  const T = (D.n - 1) / D.fs;
  const yr = range([R.F], 0, D.n - 1, [0], 0.05);
  const fr = frame(w, h, 0, T, yr[0], yr[1], { L: 62, R: 14, T: 3, B: 3 });
  ctx.fillStyle = '#f8fafc'; ctx.fillRect(fr.L, fr.T, fr.W, fr.H);
  R.phases.forEach((p) => band(ctx, fr, D.t[p.s], D.t[Math.min(D.n - 1, p.e)], p.col, 0.18));
  line(ctx, fr, D.t, R.F, { col: '#64748b', width: 1.2 });
  ctx.strokeStyle = '#cbd5e1'; ctx.strokeRect(fr.L + 0.5, fr.T + 0.5, fr.W - 1, fr.H - 1);
  return fr;
}
function overlayOver(ctx, w, h, fr) {
  if (!A.view) return;
  const a = fr.X(A.view.x0), b = fr.X(A.view.x1);
  ctx.save(); ctx.fillStyle = 'rgba(15,23,42,.08)';
  ctx.fillRect(fr.L, fr.T, a - fr.L, fr.H); ctx.fillRect(b, fr.T, fr.L + fr.W - b, fr.H);
  ctx.strokeStyle = '#1d4ed8'; ctx.lineWidth = 2; ctx.strokeRect(a, fr.T + 1, Math.max(2, b - a), fr.H - 2);
  if (A.cursor >= 0) { const x = fr.X(A.D.t[A.cursor]); ctx.strokeStyle = '#c0264d'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, fr.T); ctx.lineTo(x, fr.T + fr.H); ctx.stroke(); }
  ctx.restore();
}
let odrag = null;
function overDown(p, fr) {
  if (!fr || !A.view) return false;
  const a = fr.X(A.view.x0), b = fr.X(A.view.x1);
  const mode = Math.abs(p.x - a) < 7 ? 'l' : Math.abs(p.x - b) < 7 ? 'r' : (p.x > a && p.x < b) ? 'm' : 'c';
  if (mode === 'c') { const wv = A.view.x1 - A.view.x0, c = fr.tAt(p.x); setView(c - wv / 2, c + wv / 2); odrag = { mode: 'm', t0: fr.tAt(p.x), v: Object.assign({}, A.view) }; return true; }
  odrag = { mode, t0: fr.tAt(p.x), v: Object.assign({}, A.view) }; return true;
}
function overMove(p, fr) {
  if (!fr) return;
  if (!odrag) { const a = fr.X(A.view.x0), b = fr.X(A.view.x1); over.ov.style.cursor = Math.abs(p.x - a) < 7 || Math.abs(p.x - b) < 7 ? 'ew-resize' : (p.x > a && p.x < b) ? 'grab' : 'pointer'; return; }
  const dt = fr.tAt(p.x) - odrag.t0, v = odrag.v;
  if (odrag.mode === 'm') setView(v.x0 + dt, v.x1 + dt);
  else if (odrag.mode === 'l') setView(Math.min(v.x0 + dt, v.x1 - 0.02), v.x1);
  else setView(v.x0, Math.max(v.x1 + dt, v.x0 + 0.02));
}

// ---------- read-out ----------
export function readout() {
  const el = $('readout'); if (!el) return;
  const R = A.R; if (!R || !R.ok) { el.innerHTML = ''; return; }
  const i = A.cursor;
  if (i < 0) { el.className = 'readout idle'; el.innerHTML = 'Hover over the graph to read the force, acceleration, velocity and displacement at any moment, with what is happening in plain English.'; return; }
  el.className = 'readout';
  const p = phaseAt(R, i);
  const F = R.F[i], net = F - R.BW;
  const c = (lab, v) => '<div><span>' + lab + '</span><b>' + v + '</b></div>';
  let h = '<div class="nums">' + c('Time', A.D.t[i].toFixed(3) + ' s') + c('Force', fmtF(F)) + c('Net force', (net >= 0 ? '+' : '') + net.toFixed(0) + ' N')
    + c('Acceleration', (R.a[i] >= 0 ? '+' : '') + R.a[i].toFixed(2) + ' m/s&sup2;') + c('Velocity', (R.v[i] >= 0 ? '+' : '') + R.v[i].toFixed(2) + ' m/s')
    + c('Displacement', (R.s[i] >= 0 ? '+' : '') + (R.s[i] * 100).toFixed(1) + ' cm');
  if (A.level >= 2) h += c('Power', R.P[i].toFixed(0) + ' W');
  if (R.plates.length > 1 && A.level >= 2) R.plates.forEach((pl, j) => { if (pl.role !== 'off') h += c(esc(pl.name) + ' Fz', fmtF(pl.fz[i])); });
  if (A.show.fx || A.show.fy) R.plates.forEach((pl) => { if (pl.role === 'off') return; if (A.show.fx && pl.fx) h += c(esc(pl.name) + ' Fx', pl.fx[i].toFixed(1) + ' N'); if (A.show.fy && pl.fy) h += c(esc(pl.name) + ' Fy', pl.fy[i].toFixed(1) + ' N'); });
  h += '</div><div class="words">' + (p ? '<span class="ph" style="background:' + (p.key === 'flight' || p.key === 'drop' ? '#64748b' : p.col) + '">' + esc(p.key === 'drop' ? 'Falling from the box' : p.name) + '</span>' : '') + '<span>' + explain(R, i) + '</span></div>';
  el.innerHTML = h;
}

export function phaseKey() {
  const el = $('phaseKey'); if (!el || !A.R || !A.R.ok) { if (el) el.innerHTML = ''; return; }
  const seen = new Set(); let h = '';
  A.R.phases.forEach((p) => { if (seen.has(p.key)) return; seen.add(p.key); h += '<span><i style="background:' + p.col + ';opacity:.6"></i>' + esc(p.key === 'drop' ? 'Falling' : p.name) + '</span>'; });
  if (A.show.impulse) h += '<span><i style="background:' + COL.pos + '"></i>net impulse +</span><span><i style="background:' + COL.neg + '"></i>net impulse &minus;</span>';
  el.innerHTML = h;
}

// ---------- play ----------
let raf = 0, last = 0;
export function playRange() {
  const R = A.R, fs = A.D.fs, n = A.D.n;
  const endI = R.landEndI > 0 ? R.landEndI + Math.round(0.3 * fs) : R.LD >= 0 ? R.LD + Math.round(0.5 * fs) : R.TO + Math.round(0.4 * fs);
  const a = R.jump === 'dj' ? (R.stepOff >= 0 ? R.stepOff : R.TD) - Math.round(0.2 * fs) : R.onset - Math.round(0.25 * fs);
  return [Math.max(0, a), Math.min(n - 1, endI)];
}
export function togglePlay(force) {
  if (!A.R || !A.R.ok) return;
  const on = force === undefined ? !A.play.on : force;
  A.play.on = on; $('bPlay').innerHTML = on ? '&#10073;&#10073; Pause' : '&#9654; Play the jump';
  if (!on) { cancelAnimationFrame(raf); if (A.fn.playStopped) A.fn.playStopped(); return; }
  const [a, b] = playRange();
  if (A.cursor < a || A.cursor >= b) A.cursor = a;
  A.pinned = true; last = performance.now();
  const stepF = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    A.cursor = Math.min(b, A.cursor + Math.max(1, Math.round(dt * A.play.speed * A.D.fs)));
    cursorChanged();
    if (A.cursor >= b) { togglePlay(false); return; }
    raf = requestAnimationFrame(stepF);
  };
  raf = requestAnimationFrame(stepF);
}

// ---------- set-up ----------
export function initTrace() {
  main = new Chart($('mainChart'), {
    height: (w) => Math.max(300, Math.min(460, w * 0.42)),
    draw: drawMain, overlay: overlayMain, label: 'Force–time curve',
    onMove, onDown, onUp,
    onLeave: () => { if (!A.pinned && !A.play.on && !drag) { A.cursor = -1; cursorChanged(); } },
    onDbl: () => { const r = jumpRange(); setView(r.x0, r.x1); }
  });
  fig = new Chart($('figChart'), {
    height: () => main.h - 24,
    draw: (ctx, w, h) => { drawFigure(ctx, w, h, A.cursor); return {}; }
  });
  over = new Chart($('overview'), {
    height: 46, draw: drawOver, overlay: overlayOver,
    onDown: overDown, onMove: overMove, onUp: () => { odrag = null; }
  });
  // keys: arrows move a pinned cursor; space plays
  document.addEventListener('keydown', (e) => {
    if (!A.R || !A.R.ok) return;
    const tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if (e.key === ' ') { e.preventDefault(); togglePlay(); return; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const st = (e.shiftKey ? 10 : 1) * (e.key === 'ArrowLeft' ? -1 : 1);
      if (A.cursor < 0) A.cursor = iOf((A.view.x0 + A.view.x1) / 2);
      A.pinned = true; A.cursor = Math.max(0, Math.min(A.D.n - 1, A.cursor + st));
      const tt = A.D.t[A.cursor]; if (tt < A.view.x0 || tt > A.view.x1) { const wv = A.view.x1 - A.view.x0; setView(tt - wv / 2, tt + wv / 2); }
      cursorChanged();
    }
    if (e.key === 'Escape') { A.pinned = false; cursorChanged(); }
  });
  $('zJump').addEventListener('click', () => { const r = jumpRange(); setView(r.x0, r.x1); });
  $('zAll').addEventListener('click', () => setView(0, (A.D.n - 1) / A.D.fs));
  const zoom = (f) => { const c = A.cursor >= 0 ? A.D.t[A.cursor] : (A.view.x0 + A.view.x1) / 2, wv = (A.view.x1 - A.view.x0) * f; setView(c - wv / 2, c + wv / 2); };
  $('zIn').addEventListener('click', () => zoom(0.5));
  $('zOut').addEventListener('click', () => zoom(2));
  $('bPlay').addEventListener('click', () => togglePlay());
  $('pSpeed').addEventListener('change', function () { A.play.speed = parseFloat(this.value); });
}
export function redraw() {
  if (!main) return;
  $('traceWrap').classList.toggle('hide', !A.R);
  $('figBox').parentElement.classList.toggle('nofig', !A.show.figure);
  main.resize(); main.render(); over.resize(); over.render(); fig.resize(); fig.render(); readout(); phaseKey();
}
export function snapshotMain(w, h) { return main.snapshot(w, h, 2); }
