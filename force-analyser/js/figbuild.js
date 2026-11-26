// The figure builder (tab "Figure"): one trial (force, with a second quantity on a right-hand axis if wanted, or
// stacked panels), or several trials overlaid between any two events, in seconds or time-normalised, with means,
// SD bands and a second y axis. Every colour, line style, axis limit, font and size can be changed. The figure is
// drawn through a small set of shapes with two back ends (canvas and SVG), so the preview, PNG and SVG match.
import { A, $, esc, status, download, baseName, trialLabel, PLATE_COLS, COL } from './state.js?v=2.3.0';
import { niceStep, numTxt } from './plot.js?v=2.3.0';
import { analyseTrial } from './compare.js?v=2.3.0';
import { eventChoices, eventIndex } from './analyse.js?v=2.3.0';

const OKABE = ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#E69F00', '#56B4E9', '#000000', '#999999']; // Okabe and Ito (2008)
const PAL = ['#1d4ed8', '#dc2626', '#059669', '#9333ea', '#d97706', '#0891b2', '#be185d', '#475569', '#65a30d', '#7c2d12'];
const SIZES = { slide: ['Slide (16:9)', 960, 540], report: ['Report (4:3)', 800, 600], wide: ['Wide and short', 1000, 400], poster: ['Poster (3:2)', 1080, 720], tall: ['Tall', 720, 960], square: ['Square', 800, 800], journal1: ['Journal, one column', 700, 520], journal2: ['Journal, two columns', 1400, 700], custom: ['Custom size', 0, 0] };
const FONTS = { Arial: 'Arial, Helvetica, sans-serif', Helvetica: 'Helvetica, Arial, sans-serif', Calibri: 'Calibri, Carlito, Arial, sans-serif', 'Times New Roman': '"Times New Roman", Times, serif', Georgia: 'Georgia, serif', Verdana: 'Verdana, sans-serif' };
let FONT = FONTS.Arial, BG = '#ffffff';
const PANELS = { F: 'Force', a: 'Acceleration', v: 'Velocity', s: 'Displacement', P: 'Power' };
const DASH = { solid: null, dash: [8, 4], dot: [2, 3], dashdot: [8, 3, 2, 3], long: [14, 5] };
const DASHN = { solid: 'Solid', dash: 'Dashed', dot: 'Dotted', dashdot: 'Dash-dot', long: 'Long dashes' };
const isJumpR = (R) => R && R.ok && !R.generic;
const STYLE0 = { F: COL.total, a: COL.acc, v: COL.vel, s: COL.disp, P: COL.power, bw: '#475569', thr: '#94a3b8', ev: '#334155', impP: '#10b981', impN: '#3b82f6', impA: 0.3, mean: '#111827', sd: '#9ca3af', sdA: 0.3, phA: 0.16, dash2: 'dash', bwDash: 'dash', evDash: 'dash', evLw: 1.1, axis: '#374151', gridCol: '#e5e7eb', text: '#111827' };
function defaults() {
  return { type: 'force', range: 'move', evA: 'onset', evB: 'le', pad: 0.2, units: 'N', panels: { F: true, a: true, v: true, s: true, P: false }, right: 'none',
    trials: {}, sig: 'F', sig2: 'none', from: 'onset', to: 'to', tmode: 'norm', anchor: 'to', pre: 0.2, post: 0.1, colourBy: 'trial',
    on: { tot: true, plates: false, hor: true, bw: true, thr: false, phases: true, events: true, names: true, impulse: false, mean: true, sd: true, each: true, evNames: true },
    legend: true, legendPos: 'top', grid: true, cb: false, title: '', xlab: '', ylab: '', y2lab: '', size: 'slide', W: 960, H: 540, lw: 2, font: 14, fontFam: 'Arial', bg: 'white',
    lim: { x0: '', x1: '', y0: '', y1: '', z0: '', z1: '' }, st: Object.assign({}, STYLE0), ph: {}, tcol: {} };
}
function F() {
  if (!A.fig) {
    A.fig = defaults();
    try { const j = JSON.parse(localStorage.getItem('fa-fig2')); if (j) { const d = A.fig; Object.assign(d, j, { on: Object.assign(d.on, j.on || {}), panels: Object.assign(d.panels, j.panels || {}), st: Object.assign(d.st, j.st || {}), lim: Object.assign(d.lim, j.lim || {}), ph: j.ph || {}, tcol: j.tcol || {}, trials: {}, title: '', xlab: '', ylab: '', y2lab: '' }); } } catch (e) { /* ignore */ }
  }
  return A.fig;
}
function save() { try { localStorage.setItem('fa-fig2', JSON.stringify(Object.assign({}, A.fig, { trials: {} }))); } catch (e) { /* ignore */ } }
const sizeOf = (f) => (f.size === 'custom' ? [Math.max(300, Math.min(4000, +f.W || 960)), Math.max(200, Math.min(4000, +f.H || 540))] : (SIZES[f.size] || SIZES.slide).slice(1));
const numOr = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(+v) ? null : +v);
const lim2 = (r, a, b) => { const lo = numOr(a), hi = numOr(b); const out = [lo === null ? r[0] : lo, hi === null ? r[1] : hi]; return out[1] > out[0] ? out : r; };
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
    done() { return '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" font-family="' + FONT + '">\n' + (BG ? '<rect width="' + w + '" height="' + h + '" fill="' + BG + '"/>\n' : '') + out.join('\n') + '\n</svg>'; }
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
// a quantity of a jump trial: its array, the divisor that puts it in display units, and its axis label
function sig(f, R, key) {
  if (key === 'F') { const uk = unitK(f, R); return { y: R.F, k: uk.k, lab: 'Force (' + uk.lab + ')', name: 'Force' }; }
  if (key === 'a') return { y: R.a, k: 1, lab: 'Acceleration (m/s²)', name: 'Acceleration' };
  if (key === 'v') return { y: R.v, k: 1, lab: 'Velocity (m/s)', name: 'Velocity', y2: R.vh };
  if (key === 's') return { y: R.s, k: 0.01, lab: 'Displacement (cm)', name: 'Displacement', y2: R.sh };
  if (key === 'P') { const perKg = f.units !== 'N' && R.m > 0; return { y: R.P, k: perKg ? R.m : 1, lab: perKg ? 'Power (W/kg)' : 'Power (W)', name: 'Power', y2: R.Ph }; }
  return null;
}
const colOf = (f, key, j) => (f.cb ? OKABE[j % 8] : f.st[key] || STYLE0[key]);
function xRange(f, R) {
  const end = (R.n - 1) / R.fs;
  if (f.range === 'view' && A.view) return [Math.max(0, A.view.x0), Math.min(end, A.view.x1)];
  if (f.range === 'events' && isJumpR(R)) {
    const a = eventIndex(R, f.evA), b = eventIndex(R, f.evB);
    if (a >= 0 && b > a) return [Math.max(0, a / R.fs - (+f.pad || 0)), Math.min(end, b / R.fs + (+f.pad || 0))];
  }
  if ((f.range === 'move' || f.range === 'events') && isJumpR(R)) {
    const a = R.jump === 'dj' ? (R.stepOff >= 0 ? R.stepOff : R.TD) : R.onset, b = R.LD > 0 ? (R.landEndI > 0 ? R.landEndI : R.LD) + Math.round(0.3 * R.fs) : R.TO + Math.round(0.3 * R.fs);
    return [Math.max(0, a / R.fs - 0.3), Math.min(end, b / R.fs)];
  }
  if ((f.range === 'move' || f.range === 'events') && R.generic && R.windows.length) { const a = Math.min(...R.windows.map((w) => w.i0)), b = Math.max(...R.windows.map((w) => w.i1)), p = 0.15 * (b - a); return [Math.max(0, (a - p) / R.fs), Math.min(end, (b + p) / R.fs)]; }
  return [0, end];
}
// force lines: { y, col, lw, dash, label, k (scale) }
function forceLines(f, R, uk) {
  const L = [], on = f.on, k = uk.k;
  if (isJumpR(R)) {
    const used = R.plates.filter((p) => p.role !== 'off'), multi = used.length > 1;
    if (on.plates && multi) R.plates.forEach((p, j) => { if (p.role !== 'off') L.push({ y: p.fz, col: f.cb ? OKABE[(j + 1) % 8] : (f.st['pl' + j] || PLATE_COLS[j]), lw: f.lw * 0.75, label: p.name + ' vertical', k, key: 'pl' + j }); });
    if (on.hor && R.Fh) L.push({ y: R.Fh, col: f.cb ? OKABE[1] : (f.st.hor || '#ea580c'), lw: f.lw * 0.85, dash: [8, 4], label: 'Horizontal (forwards +)', k, key: 'hor' });
    if (on.tot) L.push({ y: R.F, col: colOf(f, 'F', 0), lw: f.lw, label: multi ? 'Total vertical force' : 'Vertical force', k, main: true, key: 'F' });
  } else {
    R.ch.forEach((c, j) => {
      const isTot = c.id === 'tot', isZ = c.kind === 'z' && !isTot, isH = c.kind !== 'z';
      if ((isTot && on.tot) || (isZ && on.plates) || (isH && on.hor)) L.push({ y: c.y, col: f.cb ? OKABE[j % 8] : (f.st['ch_' + c.id] || c.col), lw: isTot ? f.lw : f.lw * 0.75, dash: c.dash, label: c.name, k, main: isTot, key: 'ch_' + c.id });
    });
  }
  return L;
}
function shades(f, R) {
  if (isJumpR(R)) return R.phases.filter((p) => p.key !== 'weigh').map((p) => ({ i0: p.s, i1: p.e, col: f.ph[p.key] || p.col, name: p.name, key: p.key }));
  return R.windows.map((w) => ({ i0: w.i0, i1: w.i1, col: f.ph['w_' + w.name] || w.col, name: w.name, key: 'w_' + w.name }));
}
function eventsOf(R) {
  if (isJumpR(R)) return R.events.filter((e) => !e.weigh).map((e) => ({ i: e.i, name: e.name.replace(/ \(.*\)$/, '') }));
  return R.points.map((p) => ({ i: p.i, name: p.name }));
}
const rangeOf = (ys, i0, i1, extra) => { let lo = Infinity, hi = -Infinity; ys.forEach(([y, k]) => { if (!y) return; for (let i = i0; i <= i1; i++) { const v = y[i] / (k || 1); if (v < lo) lo = v; if (v > hi) hi = v; } }); (extra || []).forEach((v) => { if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }); if (!Number.isFinite(lo)) { lo = 0; hi = 1; } const p = (hi - lo) * 0.07 || 1; return [lo - p, hi + p]; };
const rangeArr = (arrs, extra) => { let lo = Infinity, hi = -Infinity; arrs.forEach((a) => a.forEach((v) => { if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } })); (extra || []).forEach((v) => { if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }); if (!Number.isFinite(lo)) { lo = 0; hi = 1; } const p = (hi - lo) * 0.07 || 1; return [lo - p, hi + p]; };

// right-hand y axis: ticks and numbers
function rightAxis(g, f, b, yr) {
  const Y = (v) => b.y + b.h - (v - yr[0]) / (yr[1] - yr[0]) * b.h, ys = niceStep(yr[1] - yr[0], Math.max(2, Math.round(b.h / 55))), ink = f.st.axis;
  for (let v = Math.ceil(yr[0] / ys - 1e-9) * ys; v <= yr[1] + 1e-9; v += ys) { const py = Y(v); g.path([b.x + b.w, py, b.x + b.w + 4, py], { stroke: ink, lw: 1 }); g.text(numTxt(Math.abs(v) < 1e-9 ? 0 : v, ys), b.x + b.w + 7, py, { size: f.font - 2, anchor: 'start', base: 'middle', fill: ink }); }
  g.path([b.x + b.w, b.y, b.x + b.w, b.y + b.h], { stroke: ink, lw: 1.2 });
  return Y;
}
// legend: above the plot (wrapped row) or a box inside the plot's top right
function legendInside(g, f, items, xR, y) {
  if (!items.length) return;
  const fs = f.font - 1, wMax = Math.max(...items.map((it) => textW(it.label, fs))) + 34, hTot = items.length * (fs + 6) + 8;
  g.rect(xR - wMax - 12, y + 6, wMax + 6, hTot, { fill: '#ffffff', alpha: 0.88, stroke: '#cbd5e1', lw: 1 });
  items.forEach((it, j) => {
    const cx = xR - wMax - 6, cy = y + 11 + j * (fs + 6);
    if (it.box) g.rect(cx, cy + 1, 18, fs - 1, { fill: it.col, alpha: it.alpha || 1 });
    else g.path([cx, cy + fs / 2, cx + 18, cy + fs / 2], { stroke: it.col, lw: it.lw || f.lw, dash: it.dash });
    g.text(it.label, cx + 23, cy + fs / 2, { size: fs, base: 'middle', fill: f.st.text });
  });
}
function title(g, f, w, top) { if (f.title) { g.text(f.title, w / 2, top, { size: f.font + 4, bold: true, anchor: 'middle', base: 'top', fill: f.st.text }); return top + f.font + 14; } return top; }

function build(g, w, h, f, R) {
  if (!R || !R.ok) return 'Open a trial that has been analysed first.';
  if (f.type === 'trials') return buildTrials(g, w, h, f, R);
  const on = f.on, uk = unitK(f, R), items = [], jump = isJumpR(R);
  let top = title(g, f, w, 10);
  const hasR = f.type === 'force' && jump && f.right !== 'none';
  const L = 34 + Math.max(30, f.font * 2.8), Rm = hasR ? 34 + Math.max(30, f.font * 2.8) : 18, bot = f.font * 2 + 22;
  const xr = lim2(xRange(f, R), f.lim.x0, f.lim.x1), i0 = Math.max(0, Math.floor(xr[0] * R.fs)), i1 = Math.min(R.n - 1, Math.ceil(xr[1] * R.fs));
  const T = R.t || Float64Array.from({ length: R.n }, (_, i) => i / R.fs);
  const sh = on.phases ? shades(f, R) : [], ev = on.events ? eventsOf(R) : [];
  const keys = f.type === 'motion' && jump ? Object.keys(PANELS).filter((k) => f.panels[k]) : ['F'];
  if (!keys.length) return 'Switch on at least one panel.';
  const fl = forceLines(f, R, uk);
  if (keys.includes('F') && !fl.length) return 'Switch on at least one force.';
  const s2 = hasR ? sig(f, R, f.right) : null, col2 = hasR ? colOf(f, f.right, 1) : null, dash2 = DASH[f.st.dash2];
  if (f.legend) {
    if (keys.includes('F')) fl.forEach((l) => items.push({ label: l.label + (hasR ? ' (left axis)' : ''), col: l.col, lw: l.lw, dash: l.dash }));
    if (hasR) items.push({ label: s2.name + ' (right axis)', col: col2, lw: f.lw, dash: dash2 });
    if (on.bw && R.BW > 0 && keys.includes('F')) items.push({ label: 'Bodyweight', col: f.st.bw, dash: DASH[f.st.bwDash], lw: 1.4 });
    if (on.impulse && R.BW > 0 && keys.includes('F')) { items.push({ label: 'Net impulse +', col: f.st.impP, box: true, alpha: f.st.impA }); items.push({ label: 'Net impulse −', col: f.st.impN, box: true, alpha: f.st.impA }); }
    if (keys.length > 1 && R.vh) items.push({ label: 'Horizontal (velocity, displacement, power)', col: '#374151', dash: [8, 4], lw: 1.5 });
    const seen = new Set(); sh.forEach((s) => { if (seen.has(s.name)) return; seen.add(s.name); items.push({ label: s.name, col: s.col, box: true, alpha: Math.min(1, f.st.phA * 2) }); });
    if (f.legendPos === 'top' || keys.length > 1) top += legend(g, f, items, L, top, w - L - Rm);
  }
  const namesH = on.names && sh.length ? f.font + 2 : 0; top += namesH;
  const np = keys.length, gap = 10, ph = (h - top - bot - gap * (np - 1)) / np;
  if (ph < 40) return 'Too many panels for this size: choose a taller size or fewer panels.';
  keys.forEach((key, pj) => {
    const b = { x: L, y: top + pj * (ph + gap), w: w - L - Rm, h: ph };
    let yr, lab, lines;
    if (key === 'F') {
      yr = rangeOf(fl.map((l) => [l.y, l.k]), i0, i1, [on.bw && R.BW > 0 ? R.BW / uk.k : NaN, 0]);
      yr = lim2(yr, f.lim.y0, f.lim.y1);
      lab = f.ylab && (np === 1 || pj === 0) ? f.ylab : 'Force (' + uk.lab + ')'; lines = fl;
    } else {
      const m = sig(f, R, key); const ys = [[m.y, m.k]]; if (m.y2) ys.push([m.y2, m.k]);
      yr = rangeOf(ys, i0, i1, [0]); lab = m.lab;
      const c = colOf(f, key, pj);
      lines = [{ y: m.y, col: c, lw: f.lw, k: m.k }]; if (m.y2) lines.push({ y: m.y2, col: c, lw: f.lw * 0.8, dash: [8, 4], k: m.k });
    }
    if (BG) g.rect(b.x, b.y, b.w, b.h, { fill: BG });
    const S = panel(g, f, b, xr, yr, { noX: pj < np - 1 });
    let Y2 = null, yr2 = null;
    if (hasR && pj === 0) { yr2 = lim2(rangeOf([[s2.y, s2.k]], i0, i1, [0]), f.lim.z0, f.lim.z1); Y2 = rightAxis(g, f, b, yr2); }
    g.clip(b.x, b.y, b.w, b.h);
    sh.forEach((s) => g.rect(S.X(s.i0 / R.fs), b.y, S.X(s.i1 / R.fs) - S.X(s.i0 / R.fs), b.h, { fill: s.col, alpha: f.st.phA }));
    if (key !== 'F' && yr[0] < 0 && yr[1] > 0) g.path([b.x, S.Y(0), b.x + b.w, S.Y(0)], { stroke: '#94a3b8', lw: 1 });
    if (key === 'F' && on.impulse && R.BW > 0) {
      const main = fl.find((l) => l.main) || fl[0], bw = R.BW / uk.k;
      const spans = jump ? [[R.jump === 'dj' ? R.TD : R.onset, R.TO]] : R.windows.map((ww) => [ww.i0, ww.i1]);
      spans.forEach(([s0, s1]) => { const a0 = Math.max(i0, s0), a1 = Math.min(i1, s1); if (a1 > a0) for (const sign of [1, -1]) { const p = []; for (let i = a0; i <= a1; i++) { const v = main.y[i] / uk.k; p.push(S.X(T[i]), S.Y(sign > 0 ? Math.max(v, bw) : Math.min(v, bw))); } for (let i = a1; i >= a0; i--) p.push(S.X(T[i]), S.Y(bw)); g.path(p, { fill: sign > 0 ? f.st.impP : f.st.impN, alpha: f.st.impA }); } });
    }
    if (key === 'F' && on.bw && R.BW > 0) g.path([b.x, S.Y(R.BW / uk.k), b.x + b.w, S.Y(R.BW / uk.k)], { stroke: f.st.bw, lw: 1.4, dash: DASH[f.st.bwDash] });
    if (key === 'F' && on.thr && R.thrUsed) g.path([b.x, S.Y(R.thrUsed / uk.k), b.x + b.w, S.Y(R.thrUsed / uk.k)], { stroke: f.st.thr, lw: 1, dash: [2, 3] });
    ev.forEach((e) => { const x = S.X(e.i / R.fs); if (x >= b.x && x <= b.x + b.w) g.path([x, b.y, x, b.y + b.h], { stroke: f.st.ev, lw: f.st.evLw, dash: DASH[f.st.evDash] }); });
    if (Y2) { if (yr2[0] < 0 && yr2[1] > 0) g.path([b.x, Y2(0), b.x + b.w, Y2(0)], { stroke: col2, lw: 0.8, alpha: 0.5, dash: [2, 3] }); g.path(trace(S.X, Y2, T, s2.y, i0, i1, b.w, 1 / s2.k), { stroke: col2, lw: f.lw, dash: dash2 }); }
    lines.forEach((l) => g.path(trace(S.X, S.Y, T, l.y, i0, i1, b.w, 1 / (l.k || 1)), { stroke: l.col, lw: l.lw, dash: l.dash }));
    g.unclip(); frameOf(g, b);
    if (Y2) g.text(f.y2lab || s2.lab, b.x + b.w + Rm - 14, b.y + b.h / 2, { size: f.font, bold: true, anchor: 'middle', base: 'middle', rot: 90, fill: col2 });
    if (pj === 0 && namesH) sh.forEach((s) => { const a = Math.max(b.x, S.X(s.i0 / R.fs)), e = Math.min(b.x + b.w, S.X(s.i1 / R.fs)); if (e - a > textW(s.name, f.font - 2) + 6) g.text(s.name, (a + e) / 2, b.y - 3, { size: f.font - 2, anchor: 'middle', base: 'bottom', fill: f.st.axis }); });
    if (pj === np - 1 && on.events && on.evNames && ev.length && f.type === 'force') ev.forEach((e) => { const x = S.X(e.i / R.fs); if (x >= b.x + 10 && x <= b.x + b.w - 10) g.text(e.name, x + 3, b.y + b.h - 4, { size: f.font - 4, fill: f.st.ev, rot: -90, base: 'bottom' }); });
    g.text(lab, b.x - L + 14, b.y + b.h / 2, { size: np > 2 ? f.font - 2 : f.font, bold: true, anchor: 'middle', base: 'middle', rot: -90, fill: hasR ? fl[0].col : f.st.text });
    if (pj === 0 && f.legend && f.legendPos === 'inside' && np === 1) legendInside(g, f, items, b.x + b.w, b.y);
  });
  g.text(f.xlab || 'Time (s)', L + (w - L - Rm) / 2, h - 6, { size: f.font, bold: true, anchor: 'middle', base: 'bottom', fill: f.st.text });
  return '';
}

// ---------- several trials: any two events, in seconds or time-normalised ----------
function sameKind(t, R) { const s = t.set; return R.generic ? s.type === R.type : (!s.type || s.type === 'jump') && s.jump === R.jump; }
export function groupKey(f, t) { const L = t.labels || {}; return f.colourBy === 'athlete' ? (L.athlete || '(no participant)') : f.colourBy === 'condition' ? (L.condition || '(no condition)') : f.colourBy === 'both' ? (L.athlete || '?') + ' · ' + (L.condition || '?') : null; }
// one trial cut between two events: x (s from the anchor, or 0-100 %) and y for the chosen quantity
function cut(f, R, key, iA, iB) {
  const s = sig(f, R, key); if (!s) return null;
  if (f.tmode === 'norm') {
    const n = iB - iA, x = [], y = [];
    for (let j = 0; j <= 100; j++) { const p = iA + n * j / 100, i = Math.floor(p), q = p - i, i2 = Math.min(R.n - 1, i + 1); x.push(j); y.push((s.y[i] + (s.y[i2] - s.y[i]) * q) / s.k); }
    return { x, y };
  }
  const anc = f.anchor === 'from' ? iA : iB, a = Math.max(0, iA - Math.round((+f.pre || 0) * R.fs)), b = Math.min(R.n - 1, iB + Math.round((+f.post || 0) * R.fs));
  const x = [], y = []; for (let i = a; i <= b; i++) { x.push((i - anc) / R.fs); y.push(s.y[i] / s.k); }
  return { x, y };
}
// mean and SD across curves on a common x grid, only where every curve has data
function meanSD(cs, norm) {
  if (!cs.length) return null;
  let xs;
  if (norm) xs = cs[0].x.slice();
  else { const lo = Math.max(...cs.map((c) => c.x[0])), hi = Math.min(...cs.map((c) => c.x[c.x.length - 1])); if (!(hi > lo)) return null; const dx = cs[0].x[1] - cs[0].x[0] || 0.001, n = Math.round((hi - lo) / dx); xs = Array.from({ length: n + 1 }, (_, j) => lo + j * dx); }
  const at = (c, x) => { if (norm) return c.y[Math.round(x)]; const dx = c.x[1] - c.x[0], p = (x - c.x[0]) / dx, i = Math.floor(p), q = p - i; if (i < 0 || i >= c.x.length - 1) return i === c.x.length - 1 ? c.y[i] : NaN; return c.y[i] + (c.y[i + 1] - c.y[i]) * q; };
  const m = [], sd = [];
  xs.forEach((x) => { const v = cs.map((c) => at(c, x)).filter(Number.isFinite); const mu = v.reduce((a, b) => a + b, 0) / v.length; m.push(mu); sd.push(v.length > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / (v.length - 1)) : NaN); });
  return { x: xs, m, sd };
}
function buildTrials(g, w, h, f, R0) {
  if (R0.generic) return 'Overlaying trials between events works for jumps.';
  const T = A.session.trials.filter((t) => sameKind(t, R0) && f.trials[t.id] !== false), on = f.on, norm = f.tmode === 'norm';
  const has2 = f.sig2 !== 'none' && f.sig2 !== f.sig;
  const runs = [], groups = [];
  const skipped = [];
  T.forEach((t, j) => {
    const { R } = analyseTrial(t); if (!R || !R.ok) { skipped.push(trialLabel(t)); return; }
    const iA = eventIndex(R, f.from), iB = eventIndex(R, f.to);
    if (iA < 0 || iB <= iA) { skipped.push(trialLabel(t)); return; }
    const c1 = cut(f, R, f.sig, iA, iB), c2 = has2 ? cut(f, R, f.sig2, iA, iB) : null;
    const gk = groupKey(f, t); let gi = -1; if (gk !== null) { gi = groups.indexOf(gk); if (gi < 0) { groups.push(gk); gi = groups.length - 1; } }
    const col = gk === null ? (f.tcol[t.id] || (f.cb ? OKABE[j % 8] : PAL[j % PAL.length])) : (f.tcol['g:' + gk] || (f.cb ? OKABE[gi % 8] : PAL[gi % PAL.length]));
    // where the other events fall (for the event lines)
    const evx = {}; eventChoices(R.jump).forEach(([k]) => { const i = eventIndex(R, k); if (i >= 0) evx[k] = norm ? (i - iA) / (iB - iA) * 100 : (i - (f.anchor === 'from' ? iA : iB)) / R.fs; });
    runs.push({ t, R, c1, c2, col, gk, evx });
  });
  if (!runs.length) return 'No ' + R0.jump.toUpperCase() + ' trials have both of these events. Choose other events, or add trials in the session.';
  // means: one per colour group (or one overall when colouring by trial)
  const sets = groups.length ? groups.map((gk) => ({ gk, col: runs.find((r) => r.gk === gk).col, rs: runs.filter((r) => r.gk === gk) })) : [{ gk: null, col: f.st.mean, rs: runs }];
  sets.forEach((s) => { s.m1 = meanSD(s.rs.map((r) => r.c1), norm); s.m2 = has2 ? meanSD(s.rs.map((r) => r.c2), norm) : null; });
  const s1 = sig(f, runs[0].R, f.sig), s2 = has2 ? sig(f, runs[0].R, f.sig2) : null;
  let top = title(g, f, w, 10);
  const L = 34 + Math.max(30, f.font * 2.8), Rm = has2 ? 34 + Math.max(30, f.font * 2.8) : 18, bot = f.font * 2 + 22, items = [];
  const many = runs.length > 1;
  if (f.legend) {
    if (groups.length) sets.forEach((s) => items.push({ label: s.gk + ' (n = ' + s.rs.length + ')', col: s.col, lw: f.lw + 0.5 }));
    else if (on.each) runs.forEach((r) => items.push({ label: trialLabel(r.t), col: r.col, lw: f.lw * 0.8 }));
    if (!groups.length && on.mean && many) items.push({ label: 'Mean (n = ' + runs.length + ')', col: f.st.mean, lw: f.lw + 0.5 });
    if (on.sd && many) items.push({ label: '± 1 SD', col: groups.length ? '#9ca3af' : f.st.sd, box: true, alpha: f.st.sdA });
    if (has2) { items.push({ label: s1.name + ' (left axis)', col: '#374151', lw: f.lw }); items.push({ label: s2.name + ' (right axis)', col: '#374151', lw: f.lw, dash: DASH[f.st.dash2] }); }
    if (f.legendPos === 'top') top += legend(g, f, items, L, top, w - L - Rm);
  }
  const b = { x: L, y: top, w: w - L - Rm, h: h - top - bot };
  if (b.h < 60) return 'Not enough room: choose a bigger size or a smaller legend.';
  const all1 = runs.map((r) => r.c1.y).concat(sets.filter((s) => s.m1).flatMap((s) => [s.m1.m.map((m, j) => m + (s.m1.sd[j] || 0)), s.m1.m.map((m, j) => m - (s.m1.sd[j] || 0))]));
  const yr = lim2(rangeArr(all1, [f.sig === 'F' ? 0 : NaN]), f.lim.y0, f.lim.y1);
  const xs0 = runs.flatMap((r) => [r.c1.x[0], r.c1.x[r.c1.x.length - 1]]);
  const xr = lim2(norm ? [0, 100] : [Math.min(...xs0), Math.max(...xs0)], f.lim.x0, f.lim.x1);
  if (BG) g.rect(b.x, b.y, b.w, b.h, { fill: BG });
  const S = panel(g, f, b, xr, yr, {});
  let Y2 = null;
  if (has2) { const all2 = runs.map((r) => r.c2.y); const yr2 = lim2(rangeArr(all2, [0]), f.lim.z0, f.lim.z1); Y2 = rightAxis(g, f, b, yr2); }
  const pts = (x, y, Y) => { const p = []; for (let j = 0; j < x.length; j++) if (Number.isFinite(y[j]) && x[j] >= xr[0] - 1e-9 && x[j] <= xr[1] + 1e-9) p.push(S.X(x[j]), Y(y[j])); return p; };
  g.clip(b.x, b.y, b.w, b.h);
  // event lines at the mean position of each event across the trials
  const evNames = [];
  if (on.events) eventChoices(R0.jump).forEach(([k, lab]) => {
    const xs = runs.map((r) => r.evx[k]).filter(Number.isFinite); if (!xs.length) return;
    const xm = xs.reduce((a, c) => a + c, 0) / xs.length; if (xm < xr[0] || xm > xr[1]) return;
    g.path([S.X(xm), b.y, S.X(xm), b.y + b.h], { stroke: f.st.ev, lw: f.st.evLw, dash: DASH[f.st.evDash] }); evNames.push([xm, lab.replace(/ \(.*\)$/, '')]);
  });
  if (f.sig !== 'F' && yr[0] < 0 && yr[1] > 0) g.path([b.x, S.Y(0), b.x + b.w, S.Y(0)], { stroke: '#94a3b8', lw: 1 });
  if (f.sig === 'F' && on.bw && runs.every((r) => r.R.BW > 0) && f.units !== 'N') g.path([b.x, S.Y(f.units === 'BW' ? 1 : 9.81), b.x + b.w, S.Y(f.units === 'BW' ? 1 : 9.81)], { stroke: f.st.bw, lw: 1.2, dash: DASH[f.st.bwDash] });
  if (on.sd && many) sets.forEach((s) => { if (!s.m1 || s.rs.length < 2) return; const up = [], dn = []; s.m1.x.forEach((x, j) => { if (Number.isFinite(s.m1.sd[j]) && x >= xr[0] && x <= xr[1]) { up.push(S.X(x), S.Y(s.m1.m[j] + s.m1.sd[j])); dn.unshift(S.X(x), S.Y(s.m1.m[j] - s.m1.sd[j])); } }); const p = up.slice(); for (let j = 0; j < dn.length; j += 2) p.push(dn[j], dn[j + 1]); g.path(p, { fill: groups.length ? s.col : f.st.sd, alpha: f.st.sdA }); });
  const faded = on.mean && many;
  if (on.each) runs.forEach((r) => { g.path(pts(r.c1.x, r.c1.y, S.Y), { stroke: r.col, lw: f.lw * 0.8, alpha: faded ? 0.55 : 1 }); if (Y2) g.path(pts(r.c2.x, r.c2.y, Y2), { stroke: r.col, lw: f.lw * 0.8, alpha: faded ? 0.55 : 1, dash: DASH[f.st.dash2] }); });
  if (on.mean && many) sets.forEach((s) => { if (s.m1) g.path(pts(s.m1.x, s.m1.m, S.Y), { stroke: s.col, lw: f.lw + 0.8 }); if (Y2 && s.m2) g.path(pts(s.m2.x, s.m2.m, Y2), { stroke: s.col, lw: f.lw + 0.8, dash: DASH[f.st.dash2] }); });
  g.unclip(); frameOf(g, b);
  if (on.evNames !== false) evNames.forEach(([x, lab]) => { const px = S.X(x); if (px >= b.x + 10 && px <= b.x + b.w - 4) g.text(lab, px + 3, b.y + b.h - 4, { size: f.font - 4, fill: f.st.ev, rot: -90, base: 'bottom' }); });
  if (f.legend && f.legendPos === 'inside') legendInside(g, f, items, b.x + b.w, b.y);
  g.text(f.ylab || s1.lab, 14, b.y + b.h / 2, { size: f.font, bold: true, anchor: 'middle', base: 'middle', rot: -90, fill: f.st.text });
  if (has2) g.text(f.y2lab || s2.lab, w - 14, b.y + b.h / 2, { size: f.font, bold: true, anchor: 'middle', base: 'middle', rot: 90, fill: f.st.text });
  const ch = Object.fromEntries(eventChoices(R0.jump)), nmA = (ch[f.from] || '').replace(/ \(.*\)$/, '').toLowerCase(), nmB = (ch[f.to] || '').replace(/ \(.*\)$/, '').toLowerCase();
  g.text(f.xlab || (norm ? 'Time (% of ' + nmA + ' to ' + nmB + ')' : 'Time relative to ' + (f.anchor === 'from' ? nmA : nmB) + ' (s)'), L + b.w / 2, h - 6, { size: f.font, bold: true, anchor: 'middle', base: 'bottom', fill: f.st.text });
  return skipped.length ? 'note:' + skipped.length + ' trial' + (skipped.length > 1 ? 's' : '') + ' left out (missing one of the events): ' + skipped.join(', ') : '';
}

// ---------- drawing, saving and the controls ----------
const isErr = (m) => m && !m.startsWith('note:');
function setLook(f, forExport) { FONT = FONTS[f.fontFam] || FONTS.Arial; BG = f.bg === 'none' && forExport ? '' : '#ffffff'; }
function draw() {
  const cv = $('figCv'); if (!cv) return;
  const f = F(), [w, h] = sizeOf(f), dpr = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
  setLook(f, false);
  cv.width = w * dpr; cv.height = h * dpr; cv.style.aspectRatio = w + ' / ' + h; cv.style.maxWidth = w + 'px';
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  let msg = ''; try { msg = build(canvasG(ctx), w, h, f, A.R); } catch (e) { msg = 'Could not draw this figure (' + (e.message || e) + ').'; console.error(e); }
  $('figMsg').innerHTML = !msg ? '' : isErr(msg) ? '<span class="bad">' + esc(msg) + '</span>' : esc(msg.slice(5));
  if (isErr(msg)) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#6b7280'; ctx.font = '16px ' + FONT; ctx.textAlign = 'center'; ctx.fillText('Nothing to draw yet', w / 2, h / 2); }
}
function png(scale) {
  const f = F(), [w, h] = sizeOf(f), c = document.createElement('canvas'); c.width = w * scale; c.height = h * scale;
  setLook(f, true);
  const ctx = c.getContext('2d'); ctx.setTransform(scale, 0, 0, scale, 0, 0); if (BG) { ctx.fillStyle = BG; ctx.fillRect(0, 0, w, h); }
  const m = build(canvasG(ctx), w, h, f, A.R); setLook(f, false);
  if (isErr(m)) { status('Nothing to save yet.'); return; }
  c.toBlob((bl) => { download(baseName() + '_figure.png', bl); status('Figure saved as a PNG (' + c.width + ' × ' + c.height + ' pixels' + (f.bg === 'none' ? ', transparent background' : '') + ').'); }, 'image/png');
}
function svg() {
  const f = F(), [w, h] = sizeOf(f); setLook(f, true); const g = svgG(w, h);
  const m = build(g, w, h, f, A.R); setLook(f, false);
  if (isErr(m)) { status('Nothing to save yet.'); return; }
  download(baseName() + '_figure.svg', new Blob([g.done()], { type: 'image/svg+xml' })); status('Figure saved as an SVG: it stays sharp at any size and can still be edited (PowerPoint, Inkscape, Illustrator).');
}
export function figureSvg(w, h) { const f = F(); setLook(f, true); const g = svgG(w, h); const m = build(g, w, h, f, A.R); setLook(f, false); return isErr(m) ? null : g.done(); } // for tests

export function setFigure(o) { const f = F(); Object.assign(f, o); save(); }
const opt = (v, l, cur) => '<option value="' + esc(v) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + l + '</option>';
const sel = (id, list, cur, attrs) => '<select id="' + id + '" class="mini" style="width:auto"' + (attrs || '') + '>' + list.map(([v, l]) => opt(v, l, cur)).join('') + '</select>';
const colIn = (key, val, label) => '<label class="colpick"><input type="color" data-st="' + key + '" value="' + val + '"> ' + label + '</label>';

export function renderFigBuilder() {
  const el = $('fbBox'); if (!el) return;
  const R = A.R; if (!R || !R.ok) { el.innerHTML = '<p class="muted">Open a trial that has been analysed first.</p>'; return; }
  const f = F(), jump = isJumpR(R);
  if (!jump && f.type !== 'force') f.type = 'force';
  const chip = (attr, k, lab, act, extra) => '<button type="button" class="chip' + (act ? ' active' : '') + '" ' + attr + '="' + esc(k) + '" aria-pressed="' + !!act + '"' + (extra || '') + '>' + lab + '</button>';
  const others = jump ? A.session.trials.filter((t) => sameKind(t, R)) : [];
  const TYPES = { force: 'One trial', motion: 'One trial, stacked panels', trials: 'Several trials overlaid' };
  const SIGS = [['F', 'Force'], ['a', 'Acceleration'], ['v', 'Velocity'], ['s', 'Displacement'], ['P', 'Power']];
  const EVS = jump ? eventChoices(R.jump) : [];
  const hasPlates = jump ? R.plates.filter((p) => p.role !== 'off').length > 1 : R.ch.some((c) => c.kind === 'z' && c.id !== 'tot');
  const hasHor = jump ? !!R.Fh : R.ch.some((c) => c.kind !== 'z');
  const lay = [['tot', jump ? 'Vertical force' : 'Total force']];
  if (hasPlates) lay.push(['plates', 'Each plate']); if (hasHor) lay.push(['hor', jump ? 'Horizontal force' : 'Horizontal forces']);
  if (R.BW > 0) lay.push(['bw', 'Bodyweight line']); if (jump) lay.push(['thr', 'Contact threshold']);
  lay.push(['phases', jump ? 'Phase shading' : 'Window shading'], ['names', jump ? 'Phase names' : 'Window names'], ['events', jump ? 'Event lines' : 'Point lines'], ['evNames', 'Event names']);
  if (R.BW > 0) lay.push(['impulse', 'Net impulse shading']);
  let h = '<p class="lead">Build a figure for a report, poster, paper or slides. Everything you change shows straight away on the right; save it as a PNG (for Word and PowerPoint) or an editable SVG.</p><div class="figgrid"><div class="figctl">';
  h += '<p class="fl">1. What kind of figure?</p><div class="chips">' + Object.entries(TYPES).filter(([k]) => jump || k === 'force').map(([k, l]) => chip('data-ft', k, l, f.type === k)).join('') + '</div>';
  if (f.type === 'force') {
    h += '<p class="fl">2. What to show</p><div class="chips">' + lay.map(([k, l]) => chip('data-fl', k, l, f.on[k])).join('') + '</div>';
    if (jump) h += '<div class="row tight"><label class="inline" for="fbRight" style="margin:0">Right-hand axis</label>' + sel('fbRight', [['none', 'Nothing'], ['v', 'Velocity'], ['s', 'Displacement'], ['a', 'Acceleration'], ['P', 'Power']], f.right) + '</div>';
  }
  if (f.type === 'motion') h += '<p class="fl">2. Which panels</p><div class="chips">' + Object.entries(PANELS).map(([k, l]) => chip('data-fp', k, l, f.panels[k])).join('') + '</div><p class="fl">What to show</p><div class="chips">' + lay.filter(([k]) => ['tot', 'plates', 'hor', 'bw', 'phases', 'names', 'events', 'impulse'].includes(k)).map(([k, l]) => chip('data-fl', k, l, f.on[k])).join('') + '</div>';
  if (f.type === 'force' || f.type === 'motion') {
    h += '<p class="fl">3. Which part of the trial</p><div class="row tight">' + sel('fbRange', [['move', jump ? 'The jump' : 'The windows'], ['events', 'Between two events'], ['view', 'The part the graph above shows'], ['all', 'The whole trial']], f.range) + '</div>';
    if (f.range === 'events' && jump) h += '<div class="row tight">' + sel('fbEvA', EVS, f.evA) + '<span class="muted">to</span>' + sel('fbEvB', EVS, f.evB) + '<label class="inline" style="margin:0">± <input type="number" id="fbPad" class="mini" style="width:4.5rem" min="0" max="2" step="0.05" value="' + f.pad + '"> s</label></div>';
  }
  if (f.type === 'trials') {
    h += '<p class="fl">2. Which trials (' + esc(R.jump.toUpperCase()) + ')</p><div class="chips">' + others.map((t, j) => chip('data-ftr', t.id, esc(trialLabel(t)), f.trials[t.id] !== false)).join('') + '</div>'
      + '<p class="fl">3. What to plot</p><div class="row tight"><label class="inline" style="margin:0">Left axis</label>' + sel('fbSig', SIGS, f.sig) + '<label class="inline" style="margin:0">Right axis</label>' + sel('fbSig2', [['none', 'Nothing']].concat(SIGS), f.sig2) + '</div>'
      + '<p class="fl">4. From which event to which</p><div class="row tight">' + sel('fbFrom', EVS, f.from) + '<span class="muted">to</span>' + sel('fbTo', EVS, f.to) + '</div>'
      + '<div class="row tight">' + sel('fbTmode', [['norm', 'Time-normalised (0–100%, 101 points)'], ['raw', 'Real time (s)']], f.tmode) + '</div>';
    if (f.tmode === 'raw') h += '<div class="row tight"><label class="inline" style="margin:0">Line up at</label>' + sel('fbAnchor', [['from', 'the first event (0 s)'], ['to', 'the second event (0 s)']], f.anchor) + '<label class="inline" style="margin:0">extra before <input type="number" id="fbPre" class="mini" style="width:4.5rem" min="0" max="2" step="0.05" value="' + f.pre + '"> s</label><label class="inline" style="margin:0">after <input type="number" id="fbPost" class="mini" style="width:4.5rem" min="0" max="2" step="0.05" value="' + f.post + '"> s</label></div>';
    h += '<p class="muted small">' + (f.tmode === 'norm' ? 'Each trial between the two events is stretched or squashed to 0–100% so trials of different lengths can be averaged point by point. The event lines show where the other events fall on average.' : 'Each trial is shown in seconds, lined up at the chosen event. Means and SDs are drawn only where every trial has data.') + '</p>'
      + '<p class="fl">5. Colours, means and spread</p><div class="row tight"><label class="inline" style="margin:0">Colour by</label>' + sel('fbColBy', [['trial', 'Trial'], ['athlete', 'Participant (mean per participant)'], ['condition', 'Condition (mean per condition)'], ['both', 'Participant and condition']], f.colourBy) + '</div>'
      + '<div class="chips" style="margin-top:.3rem">' + [['each', 'Each trial'], ['mean', 'Mean'], ['sd', '± SD band'], ['events', 'Event lines'], ['evNames', 'Event names'], ['bw', 'Bodyweight line']].map(([k, l]) => chip('data-fl', k, l, f.on[k])).join('') + '</div>';
    // colour per trial or per group
    const keys = f.colourBy === 'trial' ? others.filter((t) => f.trials[t.id] !== false).map((t, j) => [t.id, trialLabel(t), j]) : [...new Set(others.filter((t) => f.trials[t.id] !== false).map((t) => groupKey(f, t)))].map((g, j) => ['g:' + g, g, j]);
    h += '<div class="colgrid">' + keys.map(([k, lab, j]) => '<label class="colpick"><input type="color" data-tc="' + esc(k) + '" value="' + (f.tcol[k] || (f.cb ? OKABE[j % 8] : PAL[j % PAL.length])) + '"> ' + esc(lab) + '</label>').join('') + '</div>';
  }
  // axes and labels
  const hasR = (f.type === 'force' && jump && f.right !== 'none') || (f.type === 'trials' && f.sig2 !== 'none');
  h += '<p class="fl">Units, size and text</p><div class="row tight">'
    + sel('fbUnits', Object.entries(UN).map(([k, v]) => [k, 'Force in ' + v[0]]), f.units, R.BW > 0 ? '' : ' disabled title="Needs a bodyweight"')
    + sel('fbSize', Object.entries(SIZES).map(([k, v]) => [k, v[0] + (v[1] ? ' (' + v[1] + ' × ' + v[2] + ')' : '')]), f.size)
    + sel('fbFontFam', Object.keys(FONTS).map((k) => [k, k]), f.fontFam) + '</div>';
  if (f.size === 'custom') h += '<div class="row tight"><label class="inline" style="margin:0">Width <input type="number" id="fbW" class="mini" style="width:5.5rem" min="300" max="4000" step="10" value="' + f.W + '"></label><label class="inline" style="margin:0">Height <input type="number" id="fbH" class="mini" style="width:5.5rem" min="200" max="4000" step="10" value="' + f.H + '"> px</label></div>';
  h += '<div class="chks">' + [['legend', 'Legend'], ['grid', 'Grid lines'], ['cb', 'Colour-blind-safe colours (Okabe &amp; Ito)']].map(([k, l]) => '<label class="inline"><input type="checkbox" data-fc="' + k + '"' + (f[k] ? ' checked' : '') + '> ' + l + '</label>').join('') + '</div>';
  h += '<div class="row tight"><label class="inline" style="margin:0">Legend</label>' + sel('fbLegPos', [['top', 'Above the graph'], ['inside', 'Inside, top right']], f.legendPos) + '<label class="inline" style="margin:0">Background</label>' + sel('fbBg', [['white', 'White'], ['none', 'Transparent (when saved)']], f.bg) + '</div>';
  h += '<div class="row"><div><label for="fbTitle">Title</label><input type="text" id="fbTitle" value="' + esc(f.title) + '" placeholder="(none)"></div>'
    + '<div><label for="fbY">Left y axis label</label><input type="text" id="fbY" value="' + esc(f.ylab) + '" placeholder="automatic"></div>'
    + (hasR ? '<div><label for="fbY2">Right y axis label</label><input type="text" id="fbY2" value="' + esc(f.y2lab) + '" placeholder="automatic"></div>' : '')
    + '<div><label for="fbX">x axis label</label><input type="text" id="fbX" value="' + esc(f.xlab) + '" placeholder="automatic"></div></div>'
    + '<div class="row"><div><label for="fbLw">Line thickness</label><input type="range" id="fbLw" min="0.5" max="5" step="0.25" value="' + f.lw + '"></div><div><label for="fbFont">Text size</label><input type="range" id="fbFont" min="9" max="24" step="1" value="' + f.font + '"></div></div>';
  h += '<details class="more"><summary>Axis limits</summary><p class="muted small">Leave empty for automatic. Use the same limits on figures you want to compare side by side.</p><div class="limgrid">'
    + [['x0', 'x from'], ['x1', 'x to'], ['y0', 'Left y from'], ['y1', 'Left y to']].concat(hasR ? [['z0', 'Right y from'], ['z1', 'Right y to']] : []).map(([k, l]) => '<label>' + l + '<input type="number" step="any" class="mini" data-lim="' + k + '" value="' + esc(f.lim[k]) + '"></label>').join('') + '</div></details>';
  // style
  const st = f.st;
  let sty = '<div class="colgrid">';
  if (f.type !== 'trials') sty += colIn('F', st.F, 'Force') + (f.type === 'motion' || hasR ? colIn('v', st.v, 'Velocity') + colIn('s', st.s, 'Displacement') + colIn('a', st.a, 'Acceleration') + colIn('P', st.P, 'Power') : '');
  if (f.type !== 'trials' && jump && hasPlates) R.plates.forEach((p, j) => { if (p.role !== 'off') sty += colIn('pl' + j, st['pl' + j] || PLATE_COLS[j], esc(p.name)); });
  if (f.type !== 'trials' && jump && R.Fh) sty += colIn('hor', st.hor || '#ea580c', 'Horizontal force');
  sty += colIn('bw', st.bw, 'Bodyweight line') + colIn('ev', st.ev, 'Event lines and names');
  if (f.type !== 'trials') sty += colIn('impP', st.impP, 'Net impulse +') + colIn('impN', st.impN, 'Net impulse −') + colIn('thr', st.thr, 'Contact threshold');
  else sty += colIn('mean', st.mean, 'Mean (colour by trial)') + colIn('sd', st.sd, 'SD band (colour by trial)');
  sty += colIn('axis', st.axis, 'Axes and numbers') + colIn('text', st.text, 'Titles and labels') + '</div>';
  if (f.type !== 'trials') {
    const seen = new Set(), phs = shades(f, R).filter((s) => { if (seen.has(s.key)) return false; seen.add(s.key); return true; });
    if (phs.length) sty += '<p class="small" style="margin:.4rem 0 .1rem"><strong>' + (jump ? 'Phase' : 'Window') + ' shading</strong></p><div class="colgrid">' + phs.map((s) => '<label class="colpick"><input type="color" data-ph="' + esc(s.key) + '" value="' + s.col + '"> ' + esc(s.name) + '</label>').join('') + '</div>';
  }
  sty += '<div class="row"><div><label>' + (f.type === 'trials' ? 'SD band opacity' : 'Shading opacity') + '</label><input type="range" data-sta="' + (f.type === 'trials' ? 'sdA' : 'phA') + '" min="0" max="0.6" step="0.02" value="' + (f.type === 'trials' ? st.sdA : st.phA) + '"></div>'
    + (f.type !== 'trials' ? '<div><label>Impulse opacity</label><input type="range" data-sta="impA" min="0" max="0.8" step="0.02" value="' + st.impA + '"></div>' : '') + '<div><label>Event line thickness</label><input type="range" data-sta="evLw" min="0.5" max="3" step="0.25" value="' + st.evLw + '"></div></div>';
  const dsel = (k, lab) => '<label class="inline" style="margin:0">' + lab + ' <select class="mini" style="width:auto" data-std="' + k + '">' + Object.entries(DASHN).map(([v, l]) => opt(v, l, st[k])).join('') + '</select></label>';
  sty += '<div class="row tight">' + (hasR ? dsel('dash2', 'Right-axis lines') : '') + dsel('bwDash', 'Bodyweight') + dsel('evDash', 'Events') + '</div>';
  h += '<details class="more"' + (A.figStyleOpen ? ' open' : '') + ' id="fbStyle"><summary>Colours and line styles</summary>' + sty + '<button type="button" class="btn small ghost" id="fbStyleReset">Default colours</button></details>';
  h += '<p class="fl">Save it</p><div class="row tight"><button type="button" class="btn accent" id="fbPng">Picture (PNG)</button><button type="button" class="btn" id="fbSvg">Editable drawing (SVG)</button><button type="button" class="btn ghost small" id="fbReset">Start again</button></div>'
    + '<p class="muted small">The PNG is saved at three times the size shown (about 300 dpi for a one-column figure), so it prints sharply. The SVG stays sharp at any size and every line and label can still be edited. Write your own caption: say what the lines, shading and axes show, and how many trials the mean is from.</p>';
  h += '</div><div class="figprev"><canvas id="figCv" role="img" aria-label="Preview of the figure"></canvas><p class="muted small" id="figMsg" role="status"></p></div></div>';
  el.innerHTML = h;
  const re = (full) => { save(); if (full) renderFigBuilder(); else draw(); };
  el.querySelectorAll('[data-ft]').forEach((b) => b.addEventListener('click', () => { f.type = b.getAttribute('data-ft'); re(true); }));
  el.querySelectorAll('[data-fl]').forEach((b) => b.addEventListener('click', () => { const k = b.getAttribute('data-fl'); f.on[k] = !f.on[k]; re(true); }));
  el.querySelectorAll('[data-fp]').forEach((b) => b.addEventListener('click', () => { const k = b.getAttribute('data-fp'); f.panels[k] = !f.panels[k]; re(true); }));
  el.querySelectorAll('[data-ftr]').forEach((b) => b.addEventListener('click', () => { const k = b.getAttribute('data-ftr'); f.trials[k] = f.trials[k] === false; re(true); }));
  el.querySelectorAll('[data-fc]').forEach((c) => c.addEventListener('change', function () { f[this.getAttribute('data-fc')] = this.checked; re(true); }));
  const full = ['fbRange', 'fbTmode', 'fbColBy', 'fbSize', 'fbRight', 'fbSig2', 'fbSig', 'fbFrom', 'fbTo'];
  [['fbRange', 'range'], ['fbEvA', 'evA'], ['fbEvB', 'evB'], ['fbUnits', 'units'], ['fbSize', 'size'], ['fbFontFam', 'fontFam'], ['fbRight', 'right'], ['fbSig', 'sig'], ['fbSig2', 'sig2'], ['fbFrom', 'from'], ['fbTo', 'to'], ['fbTmode', 'tmode'], ['fbAnchor', 'anchor'], ['fbColBy', 'colourBy'], ['fbLegPos', 'legendPos'], ['fbBg', 'bg']]
    .forEach(([id, k]) => { if ($(id)) $(id).addEventListener('change', function () { f[k] = this.value; re(full.includes(id)); }); });
  [['fbPad', 'pad'], ['fbPre', 'pre'], ['fbPost', 'post'], ['fbW', 'W'], ['fbH', 'H']].forEach(([id, k]) => { if ($(id)) $(id).addEventListener('change', function () { const v = parseFloat(this.value); if (v >= 0) { f[k] = v; re(); } }); });
  [['fbTitle', 'title'], ['fbY', 'ylab'], ['fbY2', 'y2lab'], ['fbX', 'xlab']].forEach(([id, k]) => { if ($(id)) $(id).addEventListener('input', function () { f[k] = this.value; re(); }); });
  [['fbLw', 'lw'], ['fbFont', 'font']].forEach(([id, k]) => $(id).addEventListener('input', function () { f[k] = +this.value; re(); }));
  el.querySelectorAll('[data-lim]').forEach((i) => i.addEventListener('change', function () { f.lim[this.getAttribute('data-lim')] = this.value; re(); }));
  el.querySelectorAll('[data-st]').forEach((i) => i.addEventListener('input', function () { f.st[this.getAttribute('data-st')] = this.value; re(); }));
  el.querySelectorAll('[data-sta]').forEach((i) => i.addEventListener('input', function () { f.st[this.getAttribute('data-sta')] = +this.value; re(); }));
  el.querySelectorAll('[data-std]').forEach((i) => i.addEventListener('change', function () { f.st[this.getAttribute('data-std')] = this.value; re(); }));
  el.querySelectorAll('[data-ph]').forEach((i) => i.addEventListener('input', function () { f.ph[this.getAttribute('data-ph')] = this.value; re(); }));
  el.querySelectorAll('[data-tc]').forEach((i) => i.addEventListener('input', function () { f.tcol[this.getAttribute('data-tc')] = this.value; re(); }));
  $('fbStyle').addEventListener('toggle', function () { A.figStyleOpen = this.open; });
  $('fbStyleReset').addEventListener('click', () => { f.st = Object.assign({}, STYLE0); f.ph = {}; f.tcol = {}; re(true); });
  $('fbPng').addEventListener('click', () => png(3));
  $('fbSvg').addEventListener('click', svg);
  $('fbReset').addEventListener('click', () => { A.fig = defaults(); re(true); });
  draw();
}
export function figViewChanged() { const f = F(); if (f.range === 'view' && $('figCv') && !$('fbBox').closest('.pane').classList.contains('hide')) draw(); }
