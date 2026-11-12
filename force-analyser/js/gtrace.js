// The force-time graph for any force-time data: every force you choose to show, the points you have marked
// (drag their labels to move them), the windows between them, a cursor you can step one sample at a time,
// zoom and the overview strip underneath.
import { A, $, esc, persist, iOf } from './state.js?v=2.2.0';
import { Chart, frame, axes, line, range, band, vline, hline, dot, halo } from './plot.js?v=2.2.0';
import { POINT_COL, GAIT } from './generic.js?v=2.2.0';

let main = null, over = null, drag = null;

export function gUnitK() { const R = A.R; if (!R || !(R.BW > 0)) return 1; return A.units === 'Nkg' ? R.m : A.units === 'BW' ? R.BW : 1; }
export function gUnitLab() { return A.units === 'Nkg' ? 'Force (N/kg)' : A.units === 'BW' ? 'Force (bodyweights)' : 'Force (N)'; }
function fmt(v) { const k = gUnitK(); if (!Number.isFinite(v)) return '&ndash;'; return k === 1 ? v.toFixed(1) + ' N' : (v / k).toFixed(3) + (A.units === 'BW' ? ' &times; BW' : ' N/kg'); }

// The forces drawn on the graph, from the chips above it.
export function shownChannels() {
  const R = A.R; if (!R || !R.generic) return [];
  const sh = A.gshow, multi = R.used.length > 1;
  const out = R.ch.filter((c) => {
    if (c.id === 'tot') return (GAIT[R.type] && multi ? sh.totG : sh.tot) || !multi;
    if (c.kind === 'z') return sh.plates;
    if (c.kind === 'ap' || c.kind === 'fx') return c.kind === 'ap' ? sh.ap : sh.fx;
    if (c.kind === 'ml' || c.kind === 'fy') return c.kind === 'ml' ? sh.ml : sh.fy;
    return false;
  });
  return out.length ? out : [R.ch[0]];
}
export function wholeRange() { return { x0: 0, x1: (A.D.n - 1) / A.D.fs }; }

function scaledArr(c) { const k = gUnitK(); if (k === 1) return c.y; if (c._k === k && c._s) return c._s; const o = new Float64Array(c.y.length); for (let i = 0; i < o.length; i++) o[i] = c.y[i] / k; c._k = k; c._s = o; return o; }

function drawMain(ctx, w, h, exp) {
  const R = A.R, D = A.D; if (!R || !R.generic || !A.view) return null;
  const { x0, x1 } = A.view, t = D.t, k = gUnitK();
  const i0 = Math.max(0, Math.floor(x0 * D.fs) - 1), i1 = Math.min(D.n - 1, Math.ceil(x1 * D.fs) + 1);
  const ser = shownChannels();
  const yr = range(ser.map((c) => c.y), i0, i1, [0].concat(R.BW > 0 && ser.some((c) => c.kind === 'z') ? [R.BW] : []), 0.06).map((v) => v / k);
  const fr = frame(w, h, x0, x1, yr[0], yr[1], { T: 30, L: 62, B: 36 });
  axes(ctx, fr, { ylab: gUnitLab(), xlab: 'Time (s)' });
  // windows
  if (A.gshow.wins !== false) R.windows.forEach((wn) => {
    band(ctx, fr, t[wn.i0], t[wn.i1], wn.col, 0.1);
    const a = Math.max(fr.L, fr.X(t[wn.i0])), b = Math.min(fr.L + fr.W, fr.X(t[wn.i1]));
    ctx.save(); ctx.font = '600 11px system-ui, Arial, sans-serif'; ctx.fillStyle = wn.col; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    if (b - a > ctx.measureText(wn.name).width + 6) halo(ctx, wn.name, (a + b) / 2, fr.T + fr.H - 4);
    ctx.restore();
  });
  if (R.BW > 0 && ser.some((c) => c.kind === 'z')) hline(ctx, fr, R.BW / k, '#475569', [7, 5], 'Bodyweight ' + (A.units === 'N' ? R.BW.toFixed(0) + ' N' : A.units === 'BW' ? '(1)' : (R.BW / R.m).toFixed(2) + ' N/kg'), 1.3);
  ser.forEach((c) => line(ctx, fr, t, scaledArr(c), { col: c.col, width: c.id === 'tot' ? 2.4 : 1.7, dash: c.dash, i0, i1 }));
  // points
  ctx.save(); ctx.font = '600 10.5px system-ui, Arial, sans-serif';
  const placed = [];
  R.points.slice().sort((a, b) => a.i - b.i).forEach((p) => {
    const x = fr.X(t[p.i]); p._hx = null; if (x < fr.L - 2 || x > fr.L + fr.W + 2) return;
    const col = POINT_COL[p.name] || '#2563eb';
    vline(ctx, fr, t[p.i], col, [5, 4], 1.6);
    if (exp) return;
    const lab = p.name + (p.plate !== undefined && R.used.length > 1 ? ' ' + (p.plate + 1) : '');
    const tw = ctx.measureText(lab).width + 12; const bx = Math.round(x - tw / 2);
    let row = 0; while (placed.some((q) => q.row === row && !(bx + tw < q.a || bx > q.b))) row++;
    placed.push({ a: bx, b: bx + tw, row });
    const by = 3 + (row % 2) * 13 - (row % 2 ? 1 : 0);
    ctx.fillStyle = col; rr(ctx, bx, by, tw, 15, 4); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(lab, x, by + 8);
    p._hx = [bx, bx + tw]; p._hy = [by, by + 15];
  });
  ctx.restore();
  if (exp) {
    ctx.save(); ctx.font = '11px system-ui, Arial, sans-serif'; ctx.textBaseline = 'middle'; let lx = fr.L + 8;
    ser.forEach((c) => { ctx.strokeStyle = c.col; ctx.lineWidth = 2.5; if (c.dash) ctx.setLineDash(c.dash); ctx.beginPath(); ctx.moveTo(lx, 12); ctx.lineTo(lx + 18, 12); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#1f2a33'; ctx.fillText(c.short, lx + 22, 12); lx += ctx.measureText(c.short).width + 40; });
    ctx.restore();
  }
  return fr;
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

function overlayMain(ctx, w, h, fr) {
  const R = A.R; if (!R || !R.generic) return;
  if (drag && drag.type === 'zoom' && Math.abs(drag.x1 - drag.x0) > 3) {
    ctx.save(); ctx.fillStyle = 'rgba(37,99,235,.12)'; ctx.strokeStyle = '#2563eb'; ctx.setLineDash([4, 3]);
    const a = Math.min(drag.x0, drag.x1), b = Math.max(drag.x0, drag.x1); ctx.fillRect(a, fr.T, b - a, fr.H); ctx.strokeRect(a + 0.5, fr.T + 0.5, b - a, fr.H); ctx.restore();
  }
  const i = A.cursor; if (i < 0) return;
  const x = fr.X(A.D.t[i]); if (x < fr.L || x > fr.L + fr.W) return;
  ctx.save(); ctx.strokeStyle = A.pinned ? '#c0264d' : '#334155'; ctx.lineWidth = A.pinned ? 2 : 1.2;
  ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, fr.T); ctx.lineTo(Math.round(x) + 0.5, fr.T + fr.H); ctx.stroke(); ctx.restore();
  const k = gUnitK();
  shownChannels().forEach((c) => { const y = fr.Y(c.y[i] / k); if (y >= fr.T && y <= fr.T + fr.H) dot(ctx, x, y, c.col, c.id === 'tot' ? 5 : 3.8); });
  // every sample as a dot when zoomed right in, so students can pick the exact one
  const spp = (A.view.x1 - A.view.x0) * A.D.fs / fr.W;
  if (spp < 0.25) {
    const i0 = Math.max(0, Math.floor(A.view.x0 * A.D.fs)), i1 = Math.min(A.D.n - 1, Math.ceil(A.view.x1 * A.D.fs));
    ctx.save(); shownChannels().forEach((c) => { ctx.fillStyle = c.col; for (let j = i0; j <= i1; j++) { const yy = fr.Y(c.y[j] / k); if (yy < fr.T || yy > fr.T + fr.H) continue; ctx.beginPath(); ctx.arc(fr.X(A.D.t[j]), yy, 2.2, 0, 7); ctx.fill(); } }); ctx.restore();
  }
  ctx.save(); ctx.font = '600 11px system-ui, Arial'; const lab = A.D.t[i].toFixed(3) + ' s';
  const tw = ctx.measureText(lab).width + 10, bx = Math.min(fr.L + fr.W - tw, Math.max(fr.L, x - tw / 2));
  ctx.fillStyle = A.pinned ? '#c0264d' : '#334155'; rr(ctx, bx, fr.T + fr.H - 18, tw, 16, 3); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(lab, bx + tw / 2, fr.T + fr.H - 10); ctx.restore();
}

// ---------- interaction ----------
function ptNear(px, py, fr) {
  const R = A.R; if (!R || !fr) return null;
  let best = null, bd = 7;
  R.points.forEach((p) => {
    const x = fr.X(A.D.t[p.i]);
    const inH = p._hx && py >= p._hy[0] && py <= p._hy[1] && px >= p._hx[0] - 2 && px <= p._hx[1] + 2;
    const d = inH ? 0 : Math.abs(px - x);
    if (d < bd && (inH || py >= fr.T)) { bd = d; best = p; }
  });
  return best;
}
export function gCursorChanged() { if (main) main.overlay(); if (over) over.overlay(); readout(); if (A.fn.gCursorMoved) A.fn.gCursorMoved(); }
function onMove(p, fr) {
  if (!fr) return;
  if (drag && drag.type === 'zoom') { drag.x1 = Math.max(fr.L, Math.min(fr.L + fr.W, p.x)); main.overlay(); return; }
  if (drag && drag.type === 'point') {
    const t = Math.max(0, Math.min((A.D.n - 1) / A.D.fs, fr.tAt(p.x)));
    drag.t = Math.round(t * A.D.fs) / A.D.fs;
    if (!drag.raf) drag.raf = requestAnimationFrame(() => { drag.raf = 0; movePoint(drag.id, drag.t, false); });
    return;
  }
  const e = ptNear(p.x, p.y, fr);
  main.ov.style.cursor = e ? 'ew-resize' : 'crosshair';
  if (!A.pinned && p.x >= fr.L && p.x <= fr.L + fr.W) { A.cursor = iOf(fr.tAt(p.x)); gCursorChanged(); }
}
function onDown(p, fr, ev) {
  if (!fr || ev.button > 0) return false;
  const e = ptNear(p.x, p.y, fr);
  if (e) { drag = { type: 'point', id: e.id, t: A.D.t[e.i] }; return true; }
  if (p.x >= fr.L && p.x <= fr.L + fr.W && p.y >= fr.T - 30) { drag = { type: 'zoom', x0: p.x, x1: p.x }; return true; }
  return false;
}
function onUp(p, fr) {
  if (!drag) return;
  const d = drag; drag = null;
  if (d.type === 'point') { if (d.raf) cancelAnimationFrame(d.raf); movePoint(d.id, d.t, true); return; }
  if (Math.abs(d.x1 - d.x0) > 6) { setGView(fr.tAt(Math.min(d.x0, d.x1)), fr.tAt(Math.max(d.x0, d.x1))); }
  else { if (A.pinned) A.pinned = false; else { A.pinned = true; A.cursor = iOf(fr.tAt(p.x)); } gCursorChanged(); }
  main.overlay();
}
export function movePoint(id, t, commit) {
  const p = A.S.set.g.points.find((q) => q.id === id); if (!p) return;
  p.t = t; A.fn.refresh({ keepView: true, quick: !commit }); if (commit) persist();
}

export function setGView(x0, x1) {
  const T = (A.D.n - 1) / A.D.fs, minW = Math.min(T, 12 / A.D.fs);
  if (x1 - x0 < minW) { const c = (x0 + x1) / 2; x0 = c - minW / 2; x1 = c + minW / 2; }
  if (x0 < 0) { x1 -= x0; x0 = 0; } if (x1 > T) { x0 -= x1 - T; x1 = T; } x0 = Math.max(0, x0);
  A.view = { x0, x1 }; gRedraw(); if (A.fn.viewChanged) A.fn.viewChanged();
}

// ---------- overview ----------
function drawOver(ctx, w, h) {
  const R = A.R, D = A.D; if (!R || !R.generic) return null;
  const T = (D.n - 1) / D.fs, yr = range([R.F], 0, D.n - 1, [0], 0.05);
  const fr = frame(w, h, 0, T, yr[0], yr[1], { L: 62, R: 14, T: 3, B: 3 });
  ctx.fillStyle = '#f8fafc'; ctx.fillRect(fr.L, fr.T, fr.W, fr.H);
  R.windows.forEach((wn) => band(ctx, fr, D.t[wn.i0], D.t[wn.i1], wn.col, 0.18));
  line(ctx, fr, D.t, R.F, { col: '#64748b', width: 1.2 });
  ctx.strokeStyle = '#cbd5e1'; ctx.strokeRect(fr.L + 0.5, fr.T + 0.5, fr.W - 1, fr.H - 1);
  return fr;
}
function overlayOver(ctx, w, h, fr) {
  if (!A.view) return;
  const a = fr.X(A.view.x0), b = fr.X(A.view.x1);
  ctx.save(); ctx.fillStyle = 'rgba(15,23,42,.08)'; ctx.fillRect(fr.L, fr.T, a - fr.L, fr.H); ctx.fillRect(b, fr.T, fr.L + fr.W - b, fr.H);
  ctx.strokeStyle = '#1d4ed8'; ctx.lineWidth = 2; ctx.strokeRect(a, fr.T + 1, Math.max(2, b - a), fr.H - 2);
  if (A.cursor >= 0) { const x = fr.X(A.D.t[A.cursor]); ctx.strokeStyle = '#c0264d'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, fr.T); ctx.lineTo(x, fr.T + fr.H); ctx.stroke(); }
  ctx.restore();
}
let odrag = null;
function overDown(p, fr) {
  if (!fr || !A.view) return false;
  const a = fr.X(A.view.x0), b = fr.X(A.view.x1);
  const mode = Math.abs(p.x - a) < 7 ? 'l' : Math.abs(p.x - b) < 7 ? 'r' : (p.x > a && p.x < b) ? 'm' : 'c';
  if (mode === 'c') { const wv = A.view.x1 - A.view.x0, c = fr.tAt(p.x); setGView(c - wv / 2, c + wv / 2); odrag = { mode: 'm', t0: fr.tAt(p.x), v: Object.assign({}, A.view) }; return true; }
  odrag = { mode, t0: fr.tAt(p.x), v: Object.assign({}, A.view) }; return true;
}
function overMove(p, fr) {
  if (!fr || !odrag) return;
  const dt = fr.tAt(p.x) - odrag.t0, v = odrag.v;
  if (odrag.mode === 'm') setGView(v.x0 + dt, v.x1 + dt);
  else if (odrag.mode === 'l') setGView(Math.min(v.x0 + dt, v.x1 - 0.01), v.x1);
  else setGView(v.x0, Math.max(v.x1 + dt, v.x0 + 0.01));
}

// ---------- read-out ----------
export function readout() {
  const el = $('readout'); const R = A.R; if (!el || !R || !R.generic) return;
  const i = A.cursor;
  if (i < 0) { el.className = 'readout idle'; el.innerHTML = 'Hover over the graph to read the forces. <strong>Click</strong> to fix the cursor, then step one sample at a time with <kbd>&larr;</kbd> <kbd>&rarr;</kbd> (<kbd>Shift</kbd> for ten) and press a point button in <strong>2. Points</strong>.'; return; }
  el.className = 'readout';
  const c = (lab, v) => '<div><span>' + lab + '</span><b>' + v + '</b></div>';
  let h = '<div class="nums">' + c('Time', A.D.t[i].toFixed(3) + ' s') + c('Sample', String(i));
  shownChannels().forEach((ch) => { h += c(esc(ch.short), ch.kind === 'z' ? fmt(ch.y[i]) : ch.y[i].toFixed(1) + ' N'); });
  if (R.BW > 0 && A.units === 'N') h += c('Total &divide; bodyweight', (R.F[i] / R.BW).toFixed(2) + ' &times; BW');
  h += '</div>';
  const inW = R.windows.filter((w) => i >= w.i0 && i <= w.i1).map((w) => w.name);
  h += '<div class="words">' + (A.pinned ? '<span class="ph" style="background:#c0264d">Cursor fixed</span>' : '') + (inW.length ? '<span>Inside ' + esc(inW.join(', ')) + '.</span>' : '<span>Not inside a window.</span>') + '</div>';
  el.innerHTML = h;
}

// ---------- set-up ----------
export function initGTrace() {
  main = new Chart($('gChart'), {
    height: (w) => Math.max(300, Math.min(480, w * 0.42)), draw: drawMain, overlay: overlayMain, label: 'Force–time graph',
    onMove, onDown, onUp,
    onLeave: () => { if (!A.pinned && !drag) { A.cursor = -1; gCursorChanged(); } },
    onDbl: () => { const r = wholeRange(); setGView(r.x0, r.x1); }
  });
  over = new Chart($('gOver'), { height: 46, draw: drawOver, overlay: overlayOver, onDown: overDown, onMove: overMove, onUp: () => { odrag = null; } });
  document.addEventListener('keydown', (e) => {
    if (!A.R || !A.R.generic) return;
    const tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const st = (e.shiftKey ? 10 : 1) * (e.key === 'ArrowLeft' ? -1 : 1);
      if (A.cursor < 0) A.cursor = iOf((A.view.x0 + A.view.x1) / 2);
      A.pinned = true; A.cursor = Math.max(0, Math.min(A.D.n - 1, A.cursor + st));
      const tt = A.D.t[A.cursor]; if (tt < A.view.x0 || tt > A.view.x1) { const wv = A.view.x1 - A.view.x0; setGView(tt - wv / 2, tt + wv / 2); }
      gCursorChanged();
    }
    if (e.key === 'Escape') { A.pinned = false; gCursorChanged(); }
  });
  const zoom = (f) => { const c = A.cursor >= 0 ? A.D.t[A.cursor] : (A.view.x0 + A.view.x1) / 2, wv = (A.view.x1 - A.view.x0) * f; setGView(c - wv / 2, c + wv / 2); };
  $('gIn').addEventListener('click', () => zoom(0.5));
  $('gOut').addEventListener('click', () => zoom(2));
  $('gAll').addEventListener('click', () => { const r = wholeRange(); setGView(r.x0, r.x1); });
  $('gCur').addEventListener('click', () => { if (A.cursor < 0) return; const c = A.D.t[A.cursor], wv = 40 / A.D.fs; setGView(c - wv / 2, c + wv / 2); });
}
export function gRedraw() {
  if (!main) return;
  main.resize(); main.render(); over.resize(); over.render(); readout();
}
export function gSnapshot(w, h) { return main.snapshot(w, h, 2); }
