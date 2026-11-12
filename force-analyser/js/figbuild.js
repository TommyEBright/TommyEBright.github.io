// The figure builder (tab "Figure"): choose the kind of figure, switch lines, shading and labels on and off,
// set the size and save it as a picture (PNG) or an editable drawing (SVG). The figure is drawn through a small
// set of shapes with two back ends (canvas and SVG), so the preview, the PNG and the SVG always match.
import { A, $, esc, status, download, baseName, trialLabel, PLATE_COLS, COL } from './state.js?v=2.2.0';
import { niceStep, numTxt } from './plot.js?v=2.2.0';
import { analyseTrial } from './compare.js?v=2.2.0';

const OKABE = ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#E69F00', '#56B4E9', '#000000', '#999999']; // Okabe and Ito (2008)
const SIZES = { slide: ['Slide (16:9)', 960, 540], report: ['Report (4:3)', 800, 600], wide: ['Wide and short', 1000, 400], poster: ['Poster (3:2)', 1080, 720], tall: ['Tall', 720, 960] };
const FONT = 'Arial, Helvetica, sans-serif';
const PANELS = { F: 'Force', a: 'Acceleration', v: 'Velocity', s: 'Displacement', P: 'Power' };
const isJumpR = (R) => R && R.ok && !R.generic;
function defaults() {
  return { type: 'force', range: 'move', units: 'N', panels: { F: true, a: true, v: true, s: true, P: false }, trials: {}, align: 'to', what: 'F',
    on: { tot: true, plates: false, hor: true, bw: true, thr: false, phases: true, events: true, names: true, impulse: false, mean: true, sd: true, each: true },
    legend: true, grid: true, cb: false, title: '', xlab: '', ylab: '', size: 'slide', lw: 2, font: 14 };
}
function F() {
  if (!A.fig) { A.fig = defaults(); try { const j = JSON.parse(localStorage.getItem('fa-fig1')); if (j) Object.assign(A.fig, j, { on: Object.assign(A.fig.on, j.on || {}), panels: Object.assign(A.fig.panels, j.panels || {}), trials: {}, title: '', xlab: '', ylab: '' }); } catch (e) { /* ignore */ } }
  return A.fig;
}
function save() { try { localStorage.setItem('fa-fig1', JSON.stringify(Object.assign({}, A.fig, { trials: {} }))); } catch (e) { /* ignore */ } }
// ---------- the two back ends ----------
let mctx = null;
function textW(s, size, bold) { if (!mctx) mctx = document.createElement('canvas').getContext('2d'); mctx.font = (bold ? 'bold ' : '') + size + 'px ' + FONT; return mctx.measureText(s).width; }
function canvasG(ctx) {
  return {
    rect(x, y, w, h, o) { ctx.save(); ctx.globalAlpha = o.alpha === undefined ? 1 : o.alpha; if (o.fill) { ctx.fillStyle = o.fill; ctx.fillRect(x, y, w, h); } if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 1; ctx.strokeRect(x, y, w, h); } ctx.restore(); },
    path(p, o) {
      if (p.length < 4) return;
      ctx.save(); ctx.globalAlpha = o.alpha === undefined ? 1 : o.alpha; ctx.lineJoin = 'round'; ctx.lineCap = o.dash ? 'butt' : 'round'; if (o.dash) ctx.setLineDash(o.dash);
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
      if (o.fill) { ctx.closePath(); ctx.fillStyle = o.fill; ctx.fill(); }
      if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 1; ctx.stroke(); }
      ctx.restore();
    },
    circle(x, y, r, o) { ctx.save(); ctx.globalAlpha = o.alpha === undefined ? 1 : o.alpha; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); } if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 1; ctx.stroke(); } ctx.restore(); },
    text(s, x, y, o) {
      ctx.save(); ctx.font = (o.bold ? 'bold ' : '') + o.size + 'px ' + FONT; ctx.fillStyle = o.fill || '#111827'; ctx.textAlign = o.anchor === 'middle' ? 'center' : o.anchor === 'end' ? 'right' : 'left'; ctx.textBaseline = 'alphabetic';
      const dy = o.base === 'top' ? o.size * 0.8 : o.base === 'middle' ? o.size * 0.35 : o.base === 'bottom' ? -o.size * 0.2 : 0;
      if (o.rot) { ctx.translate(x, y); ctx.rotate(o.rot * Math.PI / 180); ctx.fillText(s, 0, dy); } else ctx.fillText(s, x, y + dy);
      ctx.restore();
    },
    clip(x, y, w, h) { ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); },
    unclip() { ctx.restore(); }
  };
}
function svgG(w, h) {
  const out = [], n1 = (v) => (Math.round(v * 10) / 10).toString(), x = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let clips = 0;
  const paint = (o) => (o.fill ? ' fill="' + o.fill + '"' : ' fill="none"') + (o.stroke ? ' stroke="' + o.stroke + '" stroke-width="' + (o.lw || 1) + '"' : '') + (o.alpha !== undefined && o.alpha !== 1 ? ' opacity="' + o.alpha + '"' : '') + (o.dash ? ' stroke-dasharray="' + o.dash.join(' ') + '"' : '');
  return {
    rect(X, Y, Wd, Hd, o) { out.push('<rect x="' + n1(X) + '" y="' + n1(Y) + '" width="' + n1(Math.max(0, Wd)) + '" height="' + n1(Math.max(0, Hd)) + '"' + paint(o) + '/>'); },
    path(p, o) { if (p.length < 4) return; let d = 'M' + n1(p[0]) + ' ' + n1(p[1]); for (let i = 2; i < p.length; i += 2) d += 'L' + n1(p[i]) + ' ' + n1(p[i + 1]); out.push('<path d="' + d + (o.fill ? 'Z' : '') + '"' + paint(o) + ' stroke-linejoin="round"' + (o.dash ? '' : ' stroke-linecap="round"') + '/>'); },
    circle(X, Y, r, o) { out.push('<circle cx="' + n1(X) + '" cy="' + n1(Y) + '" r="' + n1(r) + '"' + paint(o) + '/>'); },
    text(s, X, Y, o) {
      const dy = o.base === 'top' ? o.size * 0.8 : o.base === 'middle' ? o.size * 0.35 : o.base === 'bottom' ? -o.size * 0.2 : 0;
      out.push('<text x="' + n1(o.rot ? 0 : X) + '" y="' + n1(o.rot ? dy : Y + dy) + '" font-size="' + o.size + '"' + (o.bold ? ' font-weight="bold"' : '') + ' fill="' + (o.fill || '#111827') + '" text-anchor="' + (o.anchor || 'start') + '"' + (o.rot ? ' transform="translate(' + n1(X) + ' ' + n1(Y) + ') rotate(' + o.rot + ')"' : '') + '>' + x(s) + '</text>');
    },
    clip(X, Y, Wd, Hd) { clips++; out.push('<clipPath id="c' + clips + '"><rect x="' + n1(X) + '" y="' + n1(Y) + '" width="' + n1(Wd) + '" height="' + n1(Hd) + '"/></clipPath><g clip-path="url(#c' + clips + ')">'); },
    unclip() { out.push('</g>'); },
    done() { return '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" font-family="' + FONT + '">\n<rect width="' + w + '" height="' + h + '" fill="#ffffff"/>\n' + out.join('\n') + '\n</svg>'; }
  };
}

// ---------- shared drawing ----------
// y against t between samples i0 and i1 as screen points, keeping the lowest and highest value in each pixel.
function trace(X, Y, t, y, i0, i1, wPx, k) {
  const p = []; k = k || 1;
  if (i1 - i0 < wPx * 2) { for (let i = i0; i <= i1; i++) if (Number.isFinite(y[i])) p.push(X(t[i]), Y(y[i] * k)); return p; }
  let cur = Math.floor(X(t[i0]) * 2), mn = Infinity, mx = -Infinity, fv = NaN, lv = NaN;
  const flush = () => { if (mn <= mx) { const px = cur / 2; p.push(px, Y(fv * k), px, Y(mn * k), px, Y(mx * k), px, Y(lv * k)); } };
  for (let i = i0; i <= i1; i++) {
    const v = y[i]; if (!Number.isFinite(v)) continue;
    const px = Math.floor(X(t[i]) * 2);
    if (px !== cur) { flush(); cur = px; mn = Infinity; mx = -Infinity; fv = v; }
    if (!Number.isFinite(fv)) fv = v; lv = v; if (v < mn) mn = v; if (v > mx) mx = v;
  }
  flush(); return p;
}
// One panel: white box, grid, ticks and numbers. Returns its scales.
function panel(g, f, b, xr, yr, o) {
  const X = (v) => b.x + (v - xr[0]) / (xr[1] - xr[0]) * b.w, Y = (v) => b.y + b.h - (v - yr[0]) / (yr[1] - yr[0]) * b.h;
  const fs = f.font - 2, ys = niceStep(yr[1] - yr[0], Math.max(2, Math.round(b.h / 55))), ink = '#374151';
  for (let v = Math.ceil(yr[0] / ys - 1e-9) * ys; v <= yr[1] + 1e-9; v += ys) {
    const py = Y(v);
    if (f.grid) g.path([b.x, py, b.x + b.w, py], { stroke: '#e5e7eb', lw: 1 });
    g.path([b.x - 4, py, b.x, py], { stroke: ink, lw: 1 });
    g.text(o.yfmt ? o.yfmt(v) : numTxt(Math.abs(v) < 1e-9 ? 0 : v, ys), b.x - 7, py, { size: fs, anchor: 'end', base: 'middle', fill: ink });
  }
  if (!o.cats) {
    const xs = niceStep(xr[1] - xr[0], Math.max(3, Math.round(b.w / 110)));
    for (let v = Math.ceil(xr[0] / xs - 1e-9) * xs; v <= xr[1] + 1e-9; v += xs) {
      const px = X(v);
      g.path([px, b.y + b.h, px, b.y + b.h + 4], { stroke: ink, lw: 1 });
      if (!o.noX) g.text(numTxt(Math.abs(v) < 1e-9 ? 0 : v, xs), px, b.y + b.h + 7, { size: fs, anchor: 'middle', base: 'top', fill: ink });
    }
  }
  return { X, Y };
}
const frameOf = (g, b) => g.path([b.x, b.y, b.x, b.y + b.h, b.x + b.w, b.y + b.h], { stroke: '#374151', lw: 1.2 });
// A row of legend entries, wrapped; returns the height used.
function legend(g, f, items, x, y, w) {
  const fs = f.font - 1; let cx = x, cy = y;
  items.forEach((it) => {
    const tw = textW(it.label, fs) + 34;
    if (cx + tw > x + w && cx > x) { cx = x; cy += fs + 8; }
    if (it.box) g.rect(cx, cy + 1, 18, fs - 1, { fill: it.col, alpha: it.alpha || 1 });
    else g.path([cx, cy + fs / 2, cx + 18, cy + fs / 2], { stroke: it.col, lw: it.lw || f.lw, dash: it.dash });
    g.text(it.label, cx + 23, cy + fs / 2, { size: fs, base: 'middle', fill: '#111827' });
    cx += tw + 8;
  });
  return items.length ? cy - y + fs + 8 : 0;
}



// ---------- what to draw ----------
const UN = { N: ['N', () => 1], BW: ['× bodyweight', (R) => R.BW], Nkg: ['N/kg', (R) => R.m] };
function unitK(f, R) { const u = UN[f.units] && R.BW > 0 ? f.units : 'N'; return { u, k: UN[u][1](R), lab: UN[u][0] }; }
// the part of the trial to show
function xRange(f, R) {
  const end = (R.n - 1) / R.fs;
  if (f.range === 'view' && A.view) return [Math.max(0, A.view.x0), Math.min(end, A.view.x1)];
  if (f.range === 'move' && isJumpR(R)) {
    const a = R.jump === 'dj' ? (R.stepOff >= 0 ? R.stepOff : R.TD) : R.onset, b = R.LD > 0 ? (R.landEndI > 0 ? R.landEndI : R.LD) + Math.round(0.3 * R.fs) : R.TO + Math.round(0.3 * R.fs);
    return [Math.max(0, a / R.fs - 0.3), Math.min(end, b / R.fs)];
  }
  if (f.range === 'move' && R.generic && R.windows.length) { const a = Math.min(...R.windows.map((w) => w.i0)), b = Math.max(...R.windows.map((w) => w.i1)), p = 0.15 * (b - a); return [Math.max(0, (a - p) / R.fs), Math.min(end, (b + p) / R.fs)]; }
  return [0, end];
}
// force lines: { y, col, lw, dash, label, k (scale) }
function forceLines(f, R, uk) {
  const L = [], on = f.on, k = uk.k;
  if (isJumpR(R)) {
    const used = R.plates.filter((p) => p.role !== 'off'), multi = used.length > 1;
    if (on.plates && multi) R.plates.forEach((p, j) => { if (p.role !== 'off') L.push({ y: p.fz, col: f.cb ? OKABE[(j + 1) % 8] : PLATE_COLS[j], lw: f.lw * 0.75, label: p.name + ' vertical', k }); });
    if (on.hor && R.Fh) L.push({ y: R.Fh, col: f.cb ? OKABE[1] : '#ea580c', lw: f.lw * 0.85, dash: [8, 4], label: 'Horizontal (forwards +)', k });
    if (on.tot) L.push({ y: R.F, col: f.cb ? OKABE[0] : COL.total, lw: f.lw, label: multi ? 'Total vertical force' : 'Vertical force', k, main: true });
  } else {
    R.ch.forEach((c, j) => {
      const isTot = c.id === 'tot', isZ = c.kind === 'z' && !isTot, isH = c.kind !== 'z';
      if ((isTot && on.tot) || (isZ && on.plates) || (isH && on.hor)) L.push({ y: c.y, col: f.cb ? OKABE[j % 8] : c.col, lw: isTot ? f.lw : f.lw * 0.75, dash: c.dash, label: c.name, k, main: isTot });
    });
  }
  return L;
}
// shading: [{ i0, i1, col, name }]
function shades(R) {
  if (isJumpR(R)) return R.phases.filter((p) => p.key !== 'weigh').map((p) => ({ i0: p.s, i1: p.e, col: p.col, name: p.name }));
  return R.windows.map((w) => ({ i0: w.i0, i1: w.i1, col: w.col, name: w.name }));
}
function eventsOf(R) {
  if (isJumpR(R)) return R.events.filter((e) => !e.weigh).map((e) => ({ i: e.i, name: e.name.replace(/ \(.*\)$/, ''), col: '#334155' }));
  return R.points.map((p) => ({ i: p.i, name: p.name, col: '#334155' }));
}
function motion(R, key) {
  if (key === 'a') return { y: R.a, lab: 'Acceleration (m/s²)', col: COL.acc };
  if (key === 'v') return { y: R.v, lab: 'Velocity (m/s)', col: COL.vel, y2: R.vh, lab2: 'horizontal' };
  if (key === 's') return { y: R.s, lab: 'Displacement (m)', col: COL.disp, y2: R.sh, lab2: 'horizontal' };
  if (key === 'P') return { y: R.P, lab: 'Power (W)', col: COL.power, y2: R.Ph, lab2: 'horizontal' };
  return null;
}
const rangeOf = (ys, i0, i1, extra) => { let lo = Infinity, hi = -Infinity; ys.forEach(([y, k]) => { if (!y) return; for (let i = i0; i <= i1; i++) { const v = y[i] / (k || 1); if (v < lo) lo = v; if (v > hi) hi = v; } }); (extra || []).forEach((v) => { if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }); if (!Number.isFinite(lo)) { lo = 0; hi = 1; } const p = (hi - lo) * 0.07 || 1; return [lo - p, hi + p]; };

function build(g, w, h, f, R) {
  if (!R || !R.ok) return 'Open a trial that has been analysed first.';
  const on = f.on, uk = unitK(f, R), items = [];
  let top = 10;
  if (f.title) { g.text(f.title, w / 2, top, { size: f.font + 4, bold: true, anchor: 'middle', base: 'top' }); top += f.font + 14; }
  const L = 34 + Math.max(30, f.font * 2.8), Rm = 18, bot = f.font * 2 + 22;
  const xr = xRange(f, R), i0 = Math.max(0, Math.floor(xr[0] * R.fs)), i1 = Math.min(R.n - 1, Math.ceil(xr[1] * R.fs));
  const T = R.t || Float64Array.from({ length: R.n }, (_, i) => i / R.fs);
  const sh = on.phases ? shades(R) : [], ev = on.events ? eventsOf(R) : [];

  if (f.type === 'trials') return buildTrials(g, w, h, f, R, top, L, Rm, bot);

  // panels: force alone, or force + motion
  const keys = f.type === 'motion' && isJumpR(R) ? Object.keys(PANELS).filter((k) => f.panels[k]) : ['F'];
  if (!keys.length) return 'Switch on at least one panel.';
  const fl = forceLines(f, R, uk);
  if (keys.includes('F') && !fl.length) return 'Switch on at least one force.';
  if (f.legend) {
    fl.forEach((l) => items.push({ label: l.label, col: l.col, lw: l.lw, dash: l.dash }));
    if (on.bw && R.BW > 0 && keys.includes('F')) items.push({ label: 'Bodyweight', col: '#475569', dash: [6, 4], lw: 1.4 });
    if (on.impulse && R.BW > 0 && keys.includes('F')) { items.push({ label: 'Net impulse +', col: '#10b981', box: true, alpha: 0.35 }); items.push({ label: 'Net impulse −', col: '#3b82f6', box: true, alpha: 0.35 }); }
    if (keys.length > 1 && R.vh) items.push({ label: 'Horizontal (velocity, displacement, power)', col: '#374151', dash: [8, 4], lw: 1.5 });
    const seen = new Set(); sh.forEach((s) => { if (seen.has(s.name)) return; seen.add(s.name); items.push({ label: s.name, col: s.col, box: true, alpha: 0.3 }); });
    top += legend(g, f, items, L, top, w - L - Rm);
  }
  const namesH = on.names && sh.length ? f.font + 2 : 0; top += namesH;
  const np = keys.length, gap = 10, ph = (h - top - bot - gap * (np - 1)) / np;
  if (ph < 40) return 'Too many panels for this size: choose a taller size or fewer panels.';
  keys.forEach((key, pj) => {
    const b = { x: L, y: top + pj * (ph + gap), w: w - L - Rm, h: ph };
    let yr, lab, lines;
    if (key === 'F') {
      yr = rangeOf(fl.map((l) => [l.y, l.k]), i0, i1, [on.bw && R.BW > 0 ? R.BW / uk.k : NaN, 0]);
      lab = f.ylab && np === 1 ? f.ylab : 'Force (' + uk.lab + ')'; lines = fl;
    } else {
      const m = motion(R, key); const ys = [[m.y, 1]]; if (m.y2) ys.push([m.y2, 1]);
      yr = rangeOf(ys, i0, i1, [0]); lab = m.lab;
      lines = [{ y: m.y, col: f.cb ? OKABE[pj % 8] : m.col, lw: f.lw, k: 1 }]; if (m.y2) lines.push({ y: m.y2, col: f.cb ? OKABE[pj % 8] : m.col, lw: f.lw * 0.8, dash: [8, 4], k: 1 });
    }
    g.rect(b.x, b.y, b.w, b.h, { fill: '#ffffff' });
    const S = panel(g, f, b, xr, yr, { noX: pj < np - 1 });
    g.clip(b.x, b.y, b.w, b.h);
    sh.forEach((s) => g.rect(S.X(s.i0 / R.fs), b.y, S.X(s.i1 / R.fs) - S.X(s.i0 / R.fs), b.h, { fill: s.col, alpha: 0.16 }));
    if (key !== 'F' && yr[0] < 0 && yr[1] > 0) g.path([b.x, S.Y(0), b.x + b.w, S.Y(0)], { stroke: '#94a3b8', lw: 1 });
    if (key === 'F' && on.impulse && R.BW > 0) {
      // only while on the ground: from the start of movement (or touchdown) to take-off, or inside each window
      const main = fl.find((l) => l.main) || fl[0], bw = R.BW / uk.k;
      const spans = isJumpR(R) ? [[R.jump === 'dj' ? R.TD : R.onset, R.TO]] : R.windows.map((w) => [w.i0, w.i1]);
      spans.forEach(([s0, s1]) => { const a0 = Math.max(i0, s0), a1 = Math.min(i1, s1); if (a1 > a0) for (const sign of [1, -1]) { const p = []; for (let i = a0; i <= a1; i++) { const v = main.y[i] / uk.k; p.push(S.X(T[i]), S.Y(sign > 0 ? Math.max(v, bw) : Math.min(v, bw))); } for (let i = a1; i >= a0; i--) p.push(S.X(T[i]), S.Y(bw)); g.path(p, { fill: sign > 0 ? '#10b981' : '#3b82f6', alpha: 0.3 }); } });
      if (false) for (const sign of [1, -1]) { const p = []; for (let i = i0; i <= i1; i++) { const v = main.y[i] / uk.k; p.push(S.X(T[i]), S.Y(sign > 0 ? Math.max(v, bw) : Math.min(v, bw))); } for (let i = i1; i >= i0; i--) p.push(S.X(T[i]), S.Y(bw)); g.path(p, { fill: sign > 0 ? '#10b981' : '#3b82f6', alpha: 0.3 }); }
    }
    if (key === 'F' && on.bw && R.BW > 0) g.path([b.x, S.Y(R.BW / uk.k), b.x + b.w, S.Y(R.BW / uk.k)], { stroke: '#475569', lw: 1.4, dash: [6, 4] });
    if (key === 'F' && on.thr && R.thrUsed) g.path([b.x, S.Y(R.thrUsed / uk.k), b.x + b.w, S.Y(R.thrUsed / uk.k)], { stroke: '#94a3b8', lw: 1, dash: [2, 3] });
    ev.forEach((e) => { const x = S.X(e.i / R.fs); if (x >= b.x && x <= b.x + b.w) g.path([x, b.y, x, b.y + b.h], { stroke: e.col, lw: 1.1, dash: [4, 3] }); });
    lines.forEach((l) => g.path(trace(S.X, S.Y, T, l.y, i0, i1, b.w, 1 / (l.k || 1)), { stroke: l.col, lw: l.lw, dash: l.dash }));
    g.unclip(); frameOf(g, b);
    if (pj === 0 && namesH) sh.forEach((s) => { const a = Math.max(b.x, S.X(s.i0 / R.fs)), e = Math.min(b.x + b.w, S.X(s.i1 / R.fs)); if (e - a > textW(s.name, f.font - 2) + 6) g.text(s.name, (a + e) / 2, b.y - 3, { size: f.font - 2, anchor: 'middle', base: 'bottom', fill: '#374151' }); });
    if (pj === np - 1 && on.events && ev.length && f.type === 'force') ev.forEach((e) => { const x = S.X(e.i / R.fs); if (x >= b.x + 10 && x <= b.x + b.w - 10) g.text(e.name, x + 3, b.y + b.h - 4, { size: f.font - 4, fill: '#475569', rot: -90, base: 'bottom' }); });
    g.text(lab, b.x - L + 14, b.y + b.h / 2, { size: np > 2 ? f.font - 2 : f.font, bold: true, anchor: 'middle', base: 'middle', rot: -90 });
  });
  g.text(f.xlab || 'Time (s)', L + (w - L - Rm) / 2, h - 6, { size: f.font, bold: true, anchor: 'middle', base: 'bottom' });
  return '';
}

// several trials of the same jump, lined up at take-off (or at the start of movement)
function sameKind(t, R) { const s = t.set; return R.generic ? s.type === R.type : (!s.type || s.type === 'jump') && s.jump === R.jump; }
function buildTrials(g, w, h, f, R0, top, L, Rm, bot) {
  if (R0.generic) return 'Comparing trials on one figure works for jumps.';
  const T = A.session.trials.filter((t) => sameKind(t, R0) && f.trials[t.id] !== false), uk0 = f.units;
  const runs = [];
  T.forEach((t, j) => {
    const { R } = analyseTrial(t); if (!R || !R.ok) return;
    const a0 = f.align === 'onset' ? (R.jump === 'dj' ? R.TD : R.onset) : R.TO, y = f.what === 'v' ? R.v : R.F, k = f.what === 'v' ? 1 : unitK({ units: uk0 }, R).k;
    runs.push({ t, R, a0, y, k, col: OKABE[j % 8] });
  });
  if (!runs.length) return 'No trials of this kind to show.';
  const pre = f.align === 'onset' ? 0.3 : 1.2, post = 0.5, fs = runs[0].R.fs;
  const xr = [-pre, post], on = f.on, items = [];
  const grid = []; for (let x = -pre; x <= post + 1e-9; x += 1 / fs) grid.push(x);
  const curves = runs.map((r) => grid.map((x) => { const i = Math.round(r.a0 + x * r.R.fs); return i >= 0 && i < r.R.n ? r.y[i] / r.k : NaN; }));
  const mu = grid.map((_, q) => { const v = curves.map((c) => c[q]).filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN; });
  const sdv = grid.map((_, q) => { const v = curves.map((c) => c[q]).filter(Number.isFinite); if (v.length < 2) return NaN; const m = mu[q]; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)); });
  if (f.legend) {
    if (on.each) runs.forEach((r) => items.push({ label: trialLabel(r.t), col: r.col, lw: f.lw * 0.8 }));
    if (on.mean && runs.length > 1) items.push({ label: 'Mean (n = ' + runs.length + ')', col: '#111827', lw: f.lw + 0.5 });
    if (on.sd && runs.length > 1) items.push({ label: '± 1 SD', col: '#9ca3af', box: true, alpha: 0.45 });
    top += legend(g, f, items, L, top, w - L - Rm);
  }
  const b = { x: L, y: top, w: w - L - Rm, h: h - top - bot };
  let lo = Infinity, hi = -Infinity; curves.forEach((c) => c.forEach((v) => { if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } })); lo = Math.min(lo, 0); const p = (hi - lo) * 0.07;
  g.rect(b.x, b.y, b.w, b.h, { fill: '#fff' });
  const S = panel(g, f, b, xr, [lo - p, hi + p], {});
  const xs = Float64Array.from(grid);
  g.clip(b.x, b.y, b.w, b.h);
  g.path([S.X(0), b.y, S.X(0), b.y + b.h], { stroke: '#334155', lw: 1.2, dash: [4, 3] });
  if (on.sd && runs.length > 1) { const pp = []; grid.forEach((x, q) => { if (Number.isFinite(sdv[q])) pp.push(S.X(x), S.Y(mu[q] + sdv[q])); }); for (let q = grid.length - 1; q >= 0; q--) if (Number.isFinite(sdv[q])) pp.push(S.X(grid[q]), S.Y(mu[q] - sdv[q])); g.path(pp, { fill: '#9ca3af', alpha: 0.35 }); }
  if (on.each) runs.forEach((r, j) => g.path(trace(S.X, S.Y, xs, curves[j], 0, grid.length - 1, b.w), { stroke: r.col, lw: f.lw * 0.8, alpha: on.mean && runs.length > 1 ? 0.75 : 1 }));
  if (on.mean && runs.length > 1) g.path(trace(S.X, S.Y, xs, mu, 0, grid.length - 1, b.w), { stroke: '#111827', lw: f.lw + 0.5 });
  g.unclip(); frameOf(g, b);
  const ul = f.what === 'v' ? 'Velocity (m/s)' : 'Force (' + unitK({ units: uk0 }, runs[0].R).lab + ')';
  g.text(f.ylab || ul, 14, b.y + b.h / 2, { size: f.font, bold: true, anchor: 'middle', base: 'middle', rot: -90 });
  g.text(f.xlab || 'Time from ' + (f.align === 'onset' ? (R0.jump === 'dj' ? 'touchdown' : 'the start of movement') : 'take-off') + ' (s)', L + b.w / 2, h - 6, { size: f.font, bold: true, anchor: 'middle', base: 'bottom' });
  return '';
}

// ---------- drawing, saving and the controls ----------
function draw() {
  const cv = $('figCv'); if (!cv) return;
  const f = F(), [, w, h] = SIZES[f.size] || SIZES.slide, dpr = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
  cv.width = w * dpr; cv.height = h * dpr; cv.style.aspectRatio = w + ' / ' + h; cv.style.maxWidth = w + 'px';
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  let msg = ''; try { msg = build(canvasG(ctx), w, h, f, A.R); } catch (e) { msg = 'Could not draw this figure (' + (e.message || e) + ').'; console.error(e); }
  $('figMsg').innerHTML = msg ? '<span class="bad">' + esc(msg) + '</span>' : '';
  if (msg) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#6b7280'; ctx.font = '16px ' + FONT; ctx.textAlign = 'center'; ctx.fillText('Nothing to draw yet', w / 2, h / 2); }
}
function png(scale) {
  const f = F(), [, w, h] = SIZES[f.size] || SIZES.slide, c = document.createElement('canvas'); c.width = w * scale; c.height = h * scale;
  const ctx = c.getContext('2d'); ctx.setTransform(scale, 0, 0, scale, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  if (build(canvasG(ctx), w, h, f, A.R)) { status('Nothing to save yet.'); return; }
  c.toBlob((bl) => { download(baseName() + '_figure.png', bl); status('Figure saved as a PNG (' + c.width + ' × ' + c.height + ' pixels).'); }, 'image/png');
}
function svg() {
  const f = F(), [, w, h] = SIZES[f.size] || SIZES.slide, g = svgG(w, h);
  if (build(g, w, h, f, A.R)) { status('Nothing to save yet.'); return; }
  download(baseName() + '_figure.svg', new Blob([g.done()], { type: 'image/svg+xml' })); status('Figure saved as an SVG: it stays sharp at any size and can still be edited (PowerPoint, Inkscape, Illustrator).');
}
export function figureSvg(w, h) { const g = svgG(w, h); return build(g, w, h, F(), A.R) ? null : g.done(); } // for tests

export function renderFigBuilder() {
  const el = $('fbBox'); if (!el) return;
  const R = A.R; if (!R || !R.ok) { el.innerHTML = '<p class="muted">Open a trial that has been analysed first.</p>'; return; }
  const f = F(), jump = isJumpR(R);
  if (!jump && f.type !== 'force') f.type = 'force';
  const chip = (attr, k, lab, act, extra) => '<button type="button" class="chip' + (act ? ' active' : '') + '" ' + attr + '="' + esc(k) + '" aria-pressed="' + !!act + '"' + (extra || '') + '>' + lab + '</button>';
  const others = jump ? A.session.trials.filter((t) => sameKind(t, R)) : [];
  const TYPES = { force: 'Force over time', motion: 'Force, acceleration, velocity and displacement', trials: 'Several trials on top of each other' };
  const hasPlates = jump ? R.plates.filter((p) => p.role !== 'off').length > 1 : R.ch.some((c) => c.kind === 'z' && c.id !== 'tot');
  const hasHor = jump ? !!R.Fh : R.ch.some((c) => c.kind !== 'z');
  const lay = [['tot', jump ? 'Vertical force' : 'Total force']];
  if (hasPlates) lay.push(['plates', 'Each plate']); if (hasHor) lay.push(['hor', jump ? 'Horizontal force' : 'Horizontal forces']);
  if (R.BW > 0) lay.push(['bw', 'Bodyweight line']); if (jump) lay.push(['thr', 'Contact threshold']);
  lay.push(['phases', jump ? 'Phase shading' : 'Window shading'], ['events', jump ? 'Event lines' : 'Point lines'], ['names', jump ? 'Phase names' : 'Window names']);
  if (R.BW > 0) lay.push(['impulse', 'Net impulse shading']);
  let h = '<p class="lead">Build a figure for a report, poster or slides. Switch things on and off and watch it change, then save it as a picture.</p><div class="figgrid"><div class="figctl">';
  h += '<p class="fl">1. What kind of figure?</p><div class="chips">' + Object.entries(TYPES).filter(([k]) => jump || k === 'force').map(([k, l]) => chip('data-ft', k, l, f.type === k)).join('') + '</div>';
  if (f.type === 'motion') h += '<p class="fl">2. Which panels</p><div class="chips">' + Object.entries(PANELS).map(([k, l]) => chip('data-fp', k, l, f.panels[k])).join('') + '</div><p class="muted small">Dashed lines in the velocity, displacement and power panels are horizontal (standing long jump).</p>';
  if (f.type === 'trials') {
    h += '<p class="fl">2. Which trials (' + esc(R.jump.toUpperCase()) + ')</p><div class="chips">' + others.map((t, j) => chip('data-ftr', t.id, esc(trialLabel(t)), f.trials[t.id] !== false, f.trials[t.id] !== false ? ' style="background:' + OKABE[j % 8] + ';border-color:' + OKABE[j % 8] + '"' : '')).join('') + '</div>'
      + '<div class="row tight"><select id="fbWhat" class="mini" style="width:auto"><option value="F"' + (f.what === 'F' ? ' selected' : '') + '>Force</option><option value="v"' + (f.what === 'v' ? ' selected' : '') + '>Velocity</option></select><select id="fbAlign" class="mini" style="width:auto"><option value="to"' + (f.align === 'to' ? ' selected' : '') + '>Lined up at take-off</option><option value="onset"' + (f.align === 'onset' ? ' selected' : '') + '>Lined up at the start of movement</option></select></div>'
      + '<div class="chips" style="margin-top:.3rem">' + [['each', 'Each trial'], ['mean', 'Mean'], ['sd', '± SD band']].map(([k, l]) => chip('data-fl', k, l, f.on[k])).join('') + '</div>';
  } else h += '<p class="fl">' + (f.type === 'motion' ? '3' : '2') + '. What to show</p><div class="chips">' + lay.map(([k, l]) => chip('data-fl', k, l, f.on[k])).join('') + '</div>';
  h += '<p class="fl">Layout</p><div class="row tight">';
  if (f.type !== 'trials') h += '<select id="fbRange" class="mini" style="width:auto"><option value="move"' + (f.range === 'move' ? ' selected' : '') + '>' + (jump ? 'The jump' : 'The windows') + '</option><option value="view"' + (f.range === 'view' ? ' selected' : '') + '>The part the graph above shows</option><option value="all"' + (f.range === 'all' ? ' selected' : '') + '>The whole trial</option></select>';
  if (!(f.type === 'trials' && f.what === 'v')) h += '<select id="fbUnits" class="mini" style="width:auto"' + (R.BW > 0 ? '' : ' disabled title="Needs a bodyweight"') + '>' + Object.entries(UN).map(([k, v]) => '<option value="' + k + '"' + (f.units === k ? ' selected' : '') + '>Force in ' + v[0] + '</option>').join('') + '</select>';
  h += '<select id="fbSize" class="mini" style="width:auto">' + Object.entries(SIZES).map(([k, v]) => '<option value="' + k + '"' + (f.size === k ? ' selected' : '') + '>' + v[0] + '</option>').join('') + '</select></div>';
  h += '<div class="chks">' + [['legend', 'Legend'], ['grid', 'Grid lines'], ['cb', 'Colour-blind-safe colours']].map(([k, l]) => '<label class="inline"><input type="checkbox" data-fc="' + k + '"' + (f[k] ? ' checked' : '') + '> ' + l + '</label>').join('') + '</div>';
  h += '<p class="fl">Labels <span class="muted" style="font-weight:400">(leave empty for the usual ones)</span></p><div class="row">'
    + '<div><label for="fbTitle">Title</label><input type="text" id="fbTitle" value="' + esc(f.title) + '" placeholder="e.g. ' + esc(trialLabel(A.S)) + '"></div>'
    + '<div><label for="fbY">y axis</label><input type="text" id="fbY" value="' + esc(f.ylab) + '" placeholder="Force (N)"></div>'
    + '<div><label for="fbX">x axis</label><input type="text" id="fbX" value="' + esc(f.xlab) + '" placeholder="Time (s)"></div></div>'
    + '<div class="row"><div><label for="fbLw">Line thickness</label><input type="range" id="fbLw" min="1" max="4" step="0.5" value="' + f.lw + '"></div><div><label for="fbFont">Text size</label><input type="range" id="fbFont" min="11" max="20" step="1" value="' + f.font + '"></div></div>';
  h += '<p class="fl">Save it</p><div class="row tight"><button type="button" class="btn accent" id="fbPng">Picture (PNG)</button><button type="button" class="btn" id="fbSvg">Editable drawing (SVG)</button><button type="button" class="btn ghost small" id="fbReset">Start again</button></div>'
    + '<p class="muted small">The PNG is saved at three times the size shown, so it prints sharply in Word or PowerPoint. The SVG stays sharp at any size and can be edited. Write your own caption under it: say what the lines and shading show.</p>';
  h += '</div><div class="figprev"><canvas id="figCv" role="img" aria-label="Preview of the figure"></canvas><p class="muted small" id="figMsg" role="status"></p></div></div>';
  el.innerHTML = h;
  const re = (full) => { save(); if (full) renderFigBuilder(); else draw(); };
  el.querySelectorAll('[data-ft]').forEach((b) => b.addEventListener('click', () => { f.type = b.getAttribute('data-ft'); re(true); }));
  el.querySelectorAll('[data-fl]').forEach((b) => b.addEventListener('click', () => { const k = b.getAttribute('data-fl'); f.on[k] = !f.on[k]; re(true); }));
  el.querySelectorAll('[data-fp]').forEach((b) => b.addEventListener('click', () => { const k = b.getAttribute('data-fp'); f.panels[k] = !f.panels[k]; re(true); }));
  el.querySelectorAll('[data-ftr]').forEach((b) => b.addEventListener('click', () => { const k = b.getAttribute('data-ftr'); f.trials[k] = f.trials[k] === false; re(true); }));
  el.querySelectorAll('[data-fc]').forEach((c) => c.addEventListener('change', function () { f[this.getAttribute('data-fc')] = this.checked; re(); }));
  [['fbRange', 'range'], ['fbUnits', 'units'], ['fbSize', 'size'], ['fbWhat', 'what'], ['fbAlign', 'align']].forEach(([id, k]) => { if ($(id)) $(id).addEventListener('change', function () { f[k] = this.value; re(k === 'what'); }); });
  [['fbTitle', 'title'], ['fbY', 'ylab'], ['fbX', 'xlab']].forEach(([id, k]) => $(id).addEventListener('input', function () { f[k] = this.value; re(); }));
  [['fbLw', 'lw'], ['fbFont', 'font']].forEach(([id, k]) => $(id).addEventListener('input', function () { f[k] = +this.value; re(); }));
  $('fbPng').addEventListener('click', () => png(3));
  $('fbSvg').addEventListener('click', svg);
  $('fbReset').addEventListener('click', () => { A.fig = defaults(); re(true); });
  draw();
}
export function figViewChanged() { const f = F(); if (f.range === 'view' && $('figCv') && !$('fbBox').closest('.pane').classList.contains('hide')) draw(); }
