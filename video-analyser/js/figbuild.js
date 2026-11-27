// The figure builder (section "Figure"): publication-quality figures from the results.
// Four kinds: variables over time (one graph, or stacked panels with a shared time axis), time-normalised curves
// (this trial's cycles, or every trial in the session by group, with mean ± SD), an angle–angle or phase-plane
// plot (any variable against any other), and a stick-figure sequence. Every colour, line style, axis limit, font
// and size can be changed. Everything is drawn through a small set of shapes with two back ends (canvas and SVG),
// so the preview, the PNG and the SVG match.
import { A, $, esc, status, download, baseName, tReal, withState } from './state.js?v=2.5.0';
import { allVariables } from './vars.js?v=2.5.0';
import { computeData } from './results.js?v=2.5.0';
import { normalise, phases, meanSd, eventNames } from './normalise.js?v=2.5.0';
import { units } from './maths.js?v=2.5.0';

const OKABE = ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#E69F00', '#56B4E9', '#000000', '#999999']; // Okabe and Ito (2008)
const PAL = ['#1d4ed8', '#dc2626', '#059669', '#9333ea', '#d97706', '#0891b2', '#be185d', '#475569', '#65a30d', '#7c2d12'];
const SIZES = { slide: ['Slide (16:9)', 960, 540], report: ['Report (4:3)', 800, 600], wide: ['Wide and short', 1000, 400], poster: ['Poster (3:2)', 1080, 720], tall: ['Tall', 720, 960], square: ['Square', 800, 800], journal1: ['Journal, one column', 700, 520], journal2: ['Journal, two columns', 1400, 700], custom: ['Custom size', 0, 0] };
const FONTS = { Arial: 'Arial, Helvetica, sans-serif', Helvetica: 'Helvetica, Arial, sans-serif', Calibri: 'Calibri, Carlito, Arial, sans-serif', 'Times New Roman': '"Times New Roman", Times, serif', Georgia: 'Georgia, serif', Verdana: 'Verdana, sans-serif' };
const DASH = { solid: null, dash: [8, 4], dot: [2, 3], dashdot: [8, 3, 2, 3], long: [14, 5] };
const DASHN = { solid: 'Solid', dash: 'Dashed', dot: 'Dotted', dashdot: 'Dash-dot', long: 'Long dashes' };
const TYPES = { time: 'Variables over time', norm: 'Time-normalised (0–100%)', xy: 'Angle–angle or phase plane', stick: 'Stick-figure sequence' };
let FONT = FONTS.Arial, BG = '#ffffff';
const STYLE0 = { ev: '#334155', evDash: 'dash', evLw: 1.1, shadeA: 0.15, sdA: 0.25, eachA: 0.35, axis: '#374151', grid: '#e5e7eb', text: '#111827', xy: '#1d4ed8', stick: '#111827', trail: '#94a3b8', evFig: '#dc2626' };

function defaults() {
  return { type: 'time', series: [], layout: 'one', letters: true, xmode: 'time', xev: '', range: 'all', evA: '', evB: '', pad: 0,
    shades: [], on: { events: true, evNames: true, peaks: false, peakVals: false, each: true, mean: true, sd: true, normEv: true, start: true, arrows: true, evDots: true, axes: true, trails: false, dots: true, fade: true, zero: true },
    nStart: '', nEnd: '', nPts: 101, src: 'trial', colourBy: 'trial', xKey: '', yKey: '', equal: false, xySrc: 'raw',
    stWhich: 'every', stEvery: 5, spread: 0, stLw: 2,
    legend: true, legendPos: 'top', grid: true, cb: false, title: '', xlab: '', ylab: '', y2lab: '', size: 'slide', W: 960, H: 540, lw: 2, font: 14, fontFam: 'Arial', bg: 'white',
    lim: { x0: '', x1: '', y0: '', y1: '', z0: '', z1: '' }, st: Object.assign({}, STYLE0), gcol: {} };
}
function F() {
  if (!A.fig) {
    A.fig = defaults();
    try { const j = JSON.parse(localStorage.getItem('kva-fig')); if (j) { const d = A.fig; Object.assign(d, j, { on: Object.assign(d.on, j.on || {}), st: Object.assign(d.st, j.st || {}), lim: Object.assign(d.lim, j.lim || {}), gcol: j.gcol || {}, title: '', xlab: '', ylab: '', y2lab: '' }); } } catch (e) { /* ignore */ }
  }
  return A.fig;
}
function save() { try { localStorage.setItem('kva-fig', JSON.stringify(A.fig)); } catch (e) { /* ignore */ } }
const sizeOf = (f) => (f.size === 'custom' ? [Math.max(300, Math.min(4000, +f.W || 960)), Math.max(200, Math.min(4000, +f.H || 540))] : (SIZES[f.size] || SIZES.slide).slice(1));
const numOr = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(+v) ? null : +v);
const lim2 = (r, a, b) => { const lo = numOr(a), hi = numOr(b); const out = [lo === null ? r[0] : lo, hi === null ? r[1] : hi]; return out[1] > out[0] ? out : r; };
const fin = (v) => v !== null && v !== undefined && Number.isFinite(v);
function niceStep(range, n) { const raw = Math.abs(range) / Math.max(1, n || 5); if (!(raw > 0)) return 1; const p = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / p; return (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * p; }
function numTxt(v, step) { const d = Math.max(0, Math.min(6, -Math.floor(Math.log10(step) + 1e-9))); return (Math.abs(v) < step * 1e-6 ? 0 : v).toFixed(d).replace('-', '−'); }

// ---------- the two back ends ----------
let mctx = null;
function textW(s, size, bold) { if (!mctx) mctx = document.createElement('canvas').getContext('2d'); mctx.font = (bold ? 'bold ' : '') + size + 'px ' + FONT; return mctx.measureText(s).width; }
function canvasG(ctx) {
  const a = (o) => (o.alpha === undefined ? 1 : o.alpha);
  return {
    rect(x, y, w, h, o) { ctx.save(); ctx.globalAlpha = a(o); if (o.fill) { ctx.fillStyle = o.fill; ctx.fillRect(x, y, w, h); } if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 1; ctx.strokeRect(x, y, w, h); } ctx.restore(); },
    path(p, o) {
      if (p.length < 4) return;
      ctx.save(); ctx.globalAlpha = a(o); ctx.lineJoin = 'round'; ctx.lineCap = o.dash ? 'butt' : 'round'; if (o.dash) ctx.setLineDash(o.dash);
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
      if (o.fill) { ctx.closePath(); ctx.fillStyle = o.fill; ctx.fill(); }
      if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 1; ctx.stroke(); }
      ctx.restore();
    },
    circle(x, y, r, o) { ctx.save(); ctx.globalAlpha = a(o); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); } if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 1; ctx.stroke(); } ctx.restore(); },
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
    done() { return '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" font-family="' + FONT.replace(/"/g, "'") + '">\n' + (BG ? '<rect width="' + w + '" height="' + h + '" fill="' + BG + '"/>\n' : '') + out.join('\n') + '\n</svg>'; }
  };
}

// ---------- shared drawing ----------
function ticks(r, n) { const s = niceStep(r[1] - r[0], n), out = []; for (let v = Math.ceil(r[0] / s - 1e-9) * s; v <= r[1] + 1e-9 * s; v += s) out.push(v); return { s, v: out }; }
function tickW(f, r, n) { const t = ticks(r, n), fs = f.font - 2; return Math.max(...t.v.map((v) => textW(numTxt(v, t.s), fs)), 10); }
// One panel: grid, ticks and numbers. o: { noX, right: [range, label], xr, yr }.
function panel(g, f, b, xr, yr, o) {
  o = o || {};
  const X = (v) => b.x + (v - xr[0]) / (xr[1] - xr[0]) * b.w, Y = (v) => b.y + b.h - (v - yr[0]) / (yr[1] - yr[0]) * b.h;
  const fs = f.font - 2, ink = f.st.axis, ny = Math.max(2, Math.round(b.h / 55)), ty = ticks(yr, ny);
  ty.v.forEach((v) => {
    const py = Y(v);
    if (f.grid) g.path([b.x, py, b.x + b.w, py], { stroke: f.st.grid, lw: 1 });
    g.path([b.x - 4, py, b.x, py], { stroke: ink, lw: 1 });
    g.text(numTxt(v, ty.s), b.x - 7, py, { size: fs, anchor: 'end', base: 'middle', fill: ink });
  });
  const tx = ticks(xr, Math.max(3, Math.round(b.w / 110)));
  tx.v.forEach((v) => {
    const px = X(v);
    if (f.grid && o.gridX) g.path([px, b.y, px, b.y + b.h], { stroke: f.st.grid, lw: 1 });
    g.path([px, b.y + b.h, px, b.y + b.h + 4], { stroke: ink, lw: 1 });
    if (!o.noX) g.text(numTxt(v, tx.s), px, b.y + b.h + 7, { size: fs, anchor: 'middle', base: 'top', fill: ink });
  });
  if (o.zero && f.on.zero && yr[0] < 0 && yr[1] > 0) g.path([b.x, Y(0), b.x + b.w, Y(0)], { stroke: ink, lw: 0.8, alpha: 0.6 });
  return { X, Y };
}
function frameOf(g, f, b, right) { g.path([b.x, b.y, b.x, b.y + b.h, b.x + b.w, b.y + b.h].concat(right ? [b.x + b.w, b.y] : []), { stroke: f.st.axis, lw: 1.2 }); }
function rightAxis(g, f, b, zr) {
  const Z = (v) => b.y + b.h - (v - zr[0]) / (zr[1] - zr[0]) * b.h, fs = f.font - 2, t = ticks(zr, Math.max(2, Math.round(b.h / 55)));
  t.v.forEach((v) => { const py = Z(v); g.path([b.x + b.w, py, b.x + b.w + 4, py], { stroke: f.st.axis, lw: 1 }); g.text(numTxt(v, t.s), b.x + b.w + 7, py, { size: fs, base: 'middle', fill: f.st.axis }); });
  return Z;
}
function legendRow(g, f, items, x, y, w, measure) {
  const fs = f.font - 1; let cx = x, cy = y;
  items.forEach((it) => {
    const tw = textW(it.label, fs) + 30;
    if (cx + tw > x + w && cx > x) { cx = x; cy += fs + 8; }
    if (!measure) {
      if (it.box) g.rect(cx, cy + 1, 18, fs - 1, { fill: it.col, alpha: it.alpha || 1 });
      else if (it.dot) g.circle(cx + 9, cy + fs / 2, 4, { fill: it.col });
      else g.path([cx, cy + fs / 2, cx + 20, cy + fs / 2], { stroke: it.col, lw: it.lw || f.lw, dash: it.dash });
      g.text(it.label, cx + 25, cy + fs / 2, { size: fs, base: 'middle', fill: f.st.text });
    }
    cx += tw + 8;
  });
  return items.length ? cy - y + fs + 8 : 0;
}
function legendInside(g, f, items, xR, y) {
  if (!items.length) return;
  const fs = f.font - 1, w = Math.max(...items.map((it) => textW(it.label, fs))) + 40, h = items.length * (fs + 6) + 8;
  g.rect(xR - w - 6, y + 6, w, h, { fill: '#ffffff', stroke: '#d1d5db', alpha: 0.95 });
  items.forEach((it, i) => {
    const cy = y + 10 + i * (fs + 6) + fs / 2, cx = xR - w + 2;
    if (it.box) g.rect(cx, cy - fs / 2 + 1, 18, fs - 1, { fill: it.col, alpha: it.alpha || 1 });
    else if (it.dot) g.circle(cx + 9, cy, 4, { fill: it.col });
    else g.path([cx, cy, cx + 20, cy], { stroke: it.col, lw: it.lw || f.lw, dash: it.dash });
    g.text(it.label, cx + 25, cy, { size: fs, base: 'middle', fill: f.st.text });
  });
}
// title and legend above the plot; returns the y where the plot area starts
function header(g, f, w, items) {
  let top = 12;
  if (f.title) { g.text(f.title, w / 2, top, { size: f.font + 4, bold: true, anchor: 'middle', base: 'top', fill: f.st.text }); top += f.font + 16; }
  if (f.legend && f.legendPos === 'top' && items.length) top += legendRow(g, f, items, 70, top, w - 90) + 4;
  return top + 6;
}
function ylabel(g, f, s, x, yMid) { if (s) g.text(s, x, yMid, { size: f.font, anchor: 'middle', base: 'top', rot: -90, fill: f.st.text }); }
function xlabel(g, f, s, xMid, y) { if (s) g.text(s, xMid, y, { size: f.font, anchor: 'middle', base: 'bottom', fill: f.st.text }); }
const colOf = (f, i, own) => (own || (f.cb ? OKABE[i % 8] : PAL[i % PAL.length]));
function rangeOf(arrs, padF) { let lo = Infinity, hi = -Infinity; arrs.forEach((a) => a.forEach((v) => { if (fin(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } })); if (!Number.isFinite(lo)) return [0, 1]; const p = (hi - lo) * (padF === undefined ? 0.07 : padF) || Math.abs(hi) * 0.1 || 1; return [lo - p, hi + p]; }
// screen points for y against x, broken where there are gaps
function lines(X, Y, xs, ys) {
  const out = []; let cur = [];
  for (let i = 0; i < xs.length; i++) { if (fin(xs[i]) && fin(ys[i])) cur.push(X(xs[i]), Y(ys[i])); else if (cur.length) { out.push(cur); cur = []; } }
  if (cur.length) out.push(cur); return out;
}
const draw1 = (g, X, Y, xs, ys, o) => lines(X, Y, xs, ys).forEach((p) => { if (p.length >= 4) g.path(p, o); else if (p.length === 2) g.circle(p[0], p[1], (o.lw || 2) / 2, { fill: o.stroke, alpha: o.alpha }); });
function band(g, X, Y, xs, m, s, col, alpha) {
  const up = [], lo = [];
  for (let i = 0; i < xs.length; i++) if (fin(m[i]) && fin(s[i])) { up.push([X(xs[i]), Y(m[i] + s[i])]); lo.push([X(xs[i]), Y(m[i] - s[i])]); }
  const p = up.concat(lo.reverse()).flat();
  if (p.length >= 6) g.path(p, { fill: col, alpha });
}

// ---------- data ----------
function vars(R) { return R ? allVariables(R) : []; }
function varBy(R, key) { return vars(R).find((v) => v.key === key) || null; }
const evList = () => A.S.events.slice().sort((a, b) => a.frame - b.frame);
const evLabel = (e, i, all) => { const same = all.filter((x) => x.name === e.name); return e.name + (same.length > 1 ? ' ' + (same.indexOf(e) + 1) : '') + ' (' + tReal(e.frame).toFixed(3) + ' s)'; };
// the time window shown, in seconds
function tWindow(f, R) {
  const all = vars(R).flatMap((v) => v.get()[0]); let t0 = Math.min(...all), t1 = Math.max(...all);
  if (f.range === 'events') { const a = A.S.events.find((e) => e.id === f.evA), b = A.S.events.find((e) => e.id === f.evB); if (a && b && b.frame > a.frame) { t0 = tReal(a.frame) - (+f.pad || 0); t1 = tReal(b.frame) + (+f.pad || 0); } }
  return [t0, t1];
}
function xShift(f) { if (f.xmode !== 'event') return 0; const e = A.S.events.find((x) => x.id === f.xev); return e ? tReal(e.frame) : 0; }
function xLabelAuto(f) { if (f.xmode === 'frame') return 'Frame'; if (f.xmode === 'event') { const e = A.S.events.find((x) => x.id === f.xev); return 'Time from ' + (e ? e.name.toLowerCase() : 'event') + ' (s)'; } return 'Time (s)'; }
const xconv = (f, t) => (f.xmode === 'frame' ? t * A.S.fps * A.S.slow : t - xShift(f));
const short = (v) => v.label.replace(/ \(angular position\)$/, '');
const unitLab = (v) => short(v) + ' (' + v.unit + ')';
const LINK = { x: 'Horizontal position', y: 'Vertical position', vx: 'Horizontal velocity', vy: 'Vertical velocity', v: 'Resultant velocity', ax: 'Horizontal acceleration', ay: 'Vertical acceleration', a: 'Resultant acceleration' };
const ANGK = { th: 'Angle', w: 'Angular velocity', al: 'Angular acceleration' };
// one axis title for several lines (e.g. three joint angles share 'Angle (°)')
function axisName(vs) {
  if (!vs.length) return '';
  if (vs.length === 1 || vs.every((v) => v.key === vs[0].key)) return unitLab(vs[0]);
  const u = vs[0].unit; if (!vs.every((v) => v.unit === u)) return '';
  if (vs.every((v) => v.ang) && vs.every((v) => v.def.k === vs[0].def.k)) return ANGK[vs[0].def.k] + ' (' + u + ')';
  if (vs.every((v) => v.m && v.def.k === vs[0].def.k)) return LINK[vs[0].def.k] + ' (' + u + ')';
  if (vs.every((v) => v.m)) return (vs[0].def.kind === 'position' ? 'Position' : vs[0].def.kind === 'velocity' ? 'Velocity' : 'Acceleration') + ' (' + u + ')';
  return u;
}
// a rotated y label that fits the height of its panel
function ylabelFit(g, f, s, x, b) { if (!s) return; let fs = f.font; while (fs > 8 && textW(s, fs) > b.h - 4) fs -= 1; g.text(s, x, b.y + b.h / 2, { size: fs, anchor: 'middle', base: 'top', rot: -90, fill: f.st.text }); }
// equal scale in x and y: shrink the box to the data's shape and centre it
function equalBox(b, xr, yr) {
  const k = Math.min(b.w / (xr[1] - xr[0]), b.h / (yr[1] - yr[0])), w = (xr[1] - xr[0]) * k, h = (yr[1] - yr[0]) * k;
  return { x: b.x + (b.w - w) / 2, y: b.y + (b.h - h) / 2, w, h, k };
}

// ---------- 1. variables over time ----------
function buildTime(g, w, h, f, R) {
  const S = f.series.map((s, i) => ({ s, v: varBy(R, s.key), i })).filter((x) => x.v);
  if (!S.length) return 'Add a line in step 2.';
  const [t0, t1] = tWindow(f, R), x0 = xconv(f, t0), x1 = xconv(f, t1);
  const data = S.map(({ s, v, i }) => { const [T, , V] = v.get(), xs = [], ys = []; T.forEach((t, k) => { if (t >= t0 - 1e-9 && t <= t1 + 1e-9) { xs.push(xconv(f, t)); ys.push(V[k]); } }); return { s, v, xs, ys, col: colOf(f, i, s.col), dash: DASH[s.dash || 'solid'] }; });
  const stack = f.layout === 'stack' && data.length > 1;
  const items = f.legend && !stack ? data.map((d) => ({ label: short(d.v), col: d.col, dash: d.dash })) : [];
  if (f.legend && f.shades.length) f.shades.forEach((sh) => { if (sh.a && sh.b) items.push({ label: sh.label || sh.a + ' to ' + sh.b, col: sh.col || '#64748b', box: true, alpha: f.st.shadeA * 1.6 }); });
  if (f.on.peaks && f.legend && !stack) { /* shown as dots on the lines */ }
  const top = header(g, f, w, f.legendPos === 'top' ? items : []);
  const xr = lim2([x0, x1], f.lim.x0, f.lim.x1);
  const groups = stack ? data.map((d) => [d]) : [data.filter((d) => d.s.axis !== 'R'), data.filter((d) => d.s.axis === 'R')];
  const nP = stack ? groups.length : 1, hasR = !stack && groups[1].length > 0;
  const yrs = stack ? groups.map((gp) => lim2(rangeOf(gp.map((d) => d.ys)), f.lim.y0, f.lim.y1)) : [lim2(rangeOf(groups[0].map((d) => d.ys)), f.lim.y0, f.lim.y1)];
  const zr = hasR ? lim2(rangeOf(groups[1].map((d) => d.ys)), f.lim.z0, f.lim.z1) : null;
  const tw = Math.max(...yrs.map((r) => tickW(f, r, 5)));
  const left = 18 + f.font + 10 + tw + 0, right = hasR ? 18 + f.font + 10 + tickW(f, zr, 5) : 24;
  const bottom = h - (f.font + 2) - 14 - (f.font - 2) - 10;
  const gap = stack ? Math.max(10, f.font) : 0, ph = (bottom - top - gap * (nP - 1)) / nP;
  const evs = f.on.events ? evList().filter((e) => tReal(e.frame) >= t0 && tReal(e.frame) <= t1) : [];
  groups.slice(0, nP).forEach((gp, p) => {
    if (!gp.length && p > 0) return;
    const b = { x: left, y: top + p * (ph + gap), w: w - left - right, h: ph }, yr = yrs[p] || yrs[0];
    const { X, Y } = panel(g, f, b, xr, yr, { noX: stack && p < nP - 1, zero: true });
    const Z = hasR ? rightAxis(g, f, b, zr) : null;
    g.clip(b.x, b.y - 2, b.w, b.h + 4);
    // shading between events
    f.shades.forEach((sh) => { if (!sh.a || !sh.b) return; phases(A.S, sh.a, sh.b).forEach((q) => { const xa = X(xconv(f, tReal(q.a))), xb = X(xconv(f, tReal(q.b))); g.rect(Math.min(xa, xb), b.y, Math.abs(xb - xa), b.h, { fill: sh.col || '#64748b', alpha: f.st.shadeA }); if (sh.label && f.on.evNames && p === 0) g.text(sh.label, (xa + xb) / 2, b.y + 3, { size: f.font - 3, anchor: 'middle', base: 'top', fill: f.st.text }); }); });
    evs.forEach((e) => { const px = X(xconv(f, tReal(e.frame))); g.path([px, b.y, px, b.y + b.h], { stroke: f.st.ev, lw: f.st.evLw, dash: DASH[f.st.evDash] }); });
    gp.forEach((d) => {
      const YY = !stack && d.s.axis === 'R' ? Z : Y;
      draw1(g, X, YY, d.xs, d.ys, { stroke: d.col, lw: f.lw, dash: d.dash });
      if (f.on.peaks) {
        let iMx = -1, iMn = -1; d.ys.forEach((v, k) => { if (!fin(v)) return; if (iMx < 0 || v > d.ys[iMx]) iMx = k; if (iMn < 0 || v < d.ys[iMn]) iMn = k; });
        [iMx, iMn].forEach((k, j) => { if (k < 0) return; const px = X(d.xs[k]), py = YY(d.ys[k]); g.circle(px, py, f.lw + 2.5, { fill: '#ffffff', stroke: d.col, lw: 1.5 }); if (f.on.peakVals) g.text(numTxt(d.ys[k], Math.abs(d.ys[k]) >= 100 ? 1 : Math.abs(d.ys[k]) >= 1 ? 0.01 : 0.001), px, py + (j ? 8 : -8), { size: f.font - 3, anchor: 'middle', base: j ? 'top' : 'bottom', fill: d.col }); });
      }
    });
    g.unclip();
    if (f.on.evNames && p === 0) evs.forEach((e) => { const px = X(xconv(f, tReal(e.frame))); g.text(e.name, px + 3, b.y + (f.shades.some((sh) => sh.label) ? f.font + 3 : 2), { size: f.font - 3, base: 'top', fill: f.st.ev }); });
    frameOf(g, f, b, hasR);
    if (stack) {
      ylabelFit(g, f, (p === 0 && f.ylab) ? f.ylab : unitLab(gp[0].v), 14, b);
      if (f.letters) g.text(String.fromCharCode(65 + p), b.x + 6, b.y + 4, { size: f.font + 2, bold: true, base: 'top', fill: f.st.text });
    } else {
      ylabelFit(g, f, f.ylab || axisName(groups[0].map((d) => d.v)), 14, b);
      if (hasR) g.text(f.y2lab || axisName(groups[1].map((d) => d.v)), w - 14, b.y + b.h / 2, { size: f.font, anchor: 'middle', base: 'top', rot: 90, fill: f.st.text });
      if (f.legend && f.legendPos === 'inside') legendInside(g, f, items, b.x + b.w, b.y);
    }
  });
  xlabel(g, f, f.xlab || xLabelAuto(f), left + (w - left - right) / 2, h - 8);
  return '';
}

// ---------- 2. time-normalised ----------
let sessCache = null;
export function clearFigCache() { sessCache = null; }
const groupKey = (t, by) => { const L = t.labels || {}; return by === 'athlete' ? (L.athlete || '(no participant)') : by === 'condition' ? (L.condition || '(no condition)') : by === 'both' ? (L.athlete || '?') + ' · ' + (L.condition || '?') : by === 'all' ? 'All trials' : null; };
const trialName = (t) => { const L = t.labels || {}; return [L.athlete, L.condition, L.trial ? 'trial ' + L.trial : ''].filter(Boolean).join(' ') || t.name || 'Trial'; };
function normSets(f, R) {
  const keys = f.series.map((s) => s.key), n = Math.max(11, Math.min(1001, +f.nPts || 101));
  const evNames = (S, cyc) => { const out = {}; S.events.forEach((e) => { if (e.name === f.nStart || e.name === f.nEnd) return; cyc.forEach((c) => { if (e.frame > c.a && e.frame < c.b) (out[e.name] = out[e.name] || []).push(100 * (e.frame - c.a) / (c.b - c.a)); }); }); return out; };
  if (f.src === 'trial') {
    const N = normalise(R, A.S, f.nStart, f.nEnd, n);
    return { pct: N.pct, nCyc: N.cycles.length, ev: evNames(A.S, N.cycles), per: keys.map((k) => { const v = N.vars[k]; return v ? [{ name: null, curves: v.curves.filter(Boolean), label: v.label, unit: v.unit }] : null; }) };
  }
  const sig = JSON.stringify([f.nStart, f.nEnd, n, A.session.trials.map((t) => t.id + ':' + Object.keys(t.state.frames).length + ':' + t.state.events.length)]);
  if (!sessCache || sessCache.sig !== sig) {
    const list = [];
    A.session.trials.forEach((t) => { const r = withState(t.state, () => { const RR = computeData(); return RR ? { N: normalise(RR, t.state, f.nStart, f.nEnd, n), ev: null } : null; }); if (r) { r.ev = evNames(t.state, r.N.cycles); list.push({ t, ...r }); } });
    sessCache = { sig, list };
  }
  const by = f.colourBy, ev = {};
  sessCache.list.forEach((x) => Object.entries(x.ev).forEach(([k, a]) => { (ev[k] = ev[k] || []).push(...a); }));
  const per = keys.map((k) => {
    const grp = new Map(); let label = null, unit = null;
    sessCache.list.forEach((x) => { const v = x.N.vars[k]; if (!v) return; label = v.label; unit = v.unit; const gk = by === 'trial' ? x.t.id : groupKey(x.t, by), nm = by === 'trial' ? trialName(x.t) : gk; if (!grp.has(gk)) grp.set(gk, { name: nm, curves: [] }); grp.get(gk).curves.push(...v.curves.filter(Boolean)); });
    return grp.size ? [...grp.entries()].map(([gk, gv]) => ({ gk, name: gv.name, curves: gv.curves, label, unit })) : null;
  });
  const pct = []; for (let k = 0; k < n; k++) pct.push(100 * k / (n - 1));
  return { pct, nCyc: sessCache.list.reduce((a, x) => a + x.N.cycles.length, 0), ev, per };
}
function buildNorm(g, w, h, f, R) {
  if (!f.nStart || !f.nEnd) return 'Choose where each phase starts and ends (step 2). Add events in 5. Events first.';
  if (!f.series.length) return 'Add a line in step 2.';
  const D = normSets(f, R);
  if (!D.nCyc) return 'No complete ' + f.nStart.toLowerCase() + ' to ' + f.nEnd.toLowerCase() + ' phases found' + (f.src === 'session' ? ' in any trial.' : '. Mark both events in 5. Events.');
  const sets = []; // { panel, label, col, dash, curves, mean, sd }
  f.series.forEach((s, i) => {
    const P = D.per[i]; if (!P) return;
    P.forEach((p, j) => {
      const multiG = P.length > 1 || f.src === 'session';
      const col = multiG ? (f.gcol[p.gk] || colOf(f, j)) : colOf(f, i, s.col);
      const { mean, sd } = meanSd(p.curves);
      const vv = varBy(R, s.key) || { label: p.label, unit: p.unit, key: s.key, def: {} }, sl = short(vv);
      sets.push({ si: i, v: vv, label: multiG ? (f.series.length > 1 && f.layout !== 'stack' ? sl + ', ' : '') + p.name : sl, vlabel: p.label, unit: p.unit, col, dash: DASH[s.dash || 'solid'], curves: p.curves, mean, sd });
    });
  });
  if (!sets.length) return 'None of the chosen lines has data across these phases.';
  const stack = f.layout === 'stack' && f.series.length > 1;
  // legend: every line (one graph), or the groups of the first panel (stacked: each panel's y label names its variable)
  const legSets = stack ? sets.filter((x) => x.si === sets[0].si) : sets;
  const legendItems = !f.legend ? [] : (stack && f.src === 'trial' ? [] : legSets.map((x) => ({ label: stack ? x.label.replace(/^.*, /, '') : x.label, col: x.col, dash: x.dash })));
  if (f.legend && f.on.sd && f.on.mean) legendItems.push({ label: 'Mean \u00b1 1 SD', col: '#9ca3af', box: true, alpha: Math.max(0.3, f.st.sdA) });
  const top = header(g, f, w, f.legendPos === 'top' ? legendItems : []);
  const panels = stack ? f.series.map((s, i) => sets.filter((x) => x.si === i)).filter((a) => a.length) : [sets];
  const nP = panels.length, xr = lim2([0, 100], f.lim.x0, f.lim.x1);
  const arrsOf = (ps) => ps.flatMap((x) => (f.on.each ? x.curves : []).concat(f.on.mean && x.mean ? [x.mean.map((m, k) => m + (f.on.sd ? x.sd[k] : 0)), x.mean.map((m, k) => m - (f.on.sd ? x.sd[k] : 0))] : []));
  const yrs = panels.map((ps) => lim2(rangeOf(arrsOf(ps)), f.lim.y0, f.lim.y1));
  const left = 18 + f.font + 10 + Math.max(...yrs.map((r) => tickW(f, r, 5))) + 0, right = 24;
  const bottom = h - (f.font + 2) - 14 - (f.font - 2) - 10, gap = stack ? Math.max(10, f.font) : 0, ph = (bottom - top - gap * (nP - 1)) / nP;
  const evPct = f.on.normEv ? Object.entries(D.ev).map(([k, a]) => [k, a.reduce((s, v) => s + v, 0) / a.length]) : [];
  panels.forEach((ps, p) => {
    const b = { x: left, y: top + p * (ph + gap), w: w - left - right, h: ph }, yr = yrs[p];
    const { X, Y } = panel(g, f, b, xr, yr, { noX: stack && p < nP - 1, zero: true });
    g.clip(b.x, b.y - 2, b.w, b.h + 4);
    evPct.forEach(([k, v]) => { const px = X(v); g.path([px, b.y, px, b.y + b.h], { stroke: f.st.ev, lw: f.st.evLw, dash: DASH[f.st.evDash] }); });
    ps.forEach((x) => { if (f.on.mean && f.on.sd && x.mean) band(g, X, Y, D.pct, x.mean, x.sd, x.col, f.st.sdA); });
    ps.forEach((x) => { if (f.on.each) x.curves.forEach((c) => draw1(g, X, Y, D.pct, c, { stroke: x.col, lw: Math.max(0.6, f.lw * 0.45), alpha: f.on.mean ? f.st.eachA : 1, dash: x.dash })); });
    ps.forEach((x) => { if (f.on.mean && x.mean) draw1(g, X, Y, D.pct, x.mean, { stroke: x.col, lw: f.lw * 1.25, dash: x.dash }); });
    g.unclip();
    if (f.on.evNames && p === 0) evPct.forEach(([k, v]) => g.text(k, X(v) + 3, b.y + 2, { size: f.font - 3, base: 'top', fill: f.st.ev }));
    frameOf(g, f, b);
    ylabelFit(g, f, (!stack && f.ylab) || (stack && p === 0 && f.ylab) || (stack ? unitLab(ps[0].v) : axisName([...new Set(ps.map((x) => x.v))])), 14, b);
    if (stack && f.letters) g.text(String.fromCharCode(65 + p), b.x + 6, b.y + 4, { size: f.font + 2, bold: true, base: 'top', fill: f.st.text });
    if (!stack && f.legend && f.legendPos === 'inside') legendInside(g, f, legendItems, b.x + b.w, b.y);
  });
  xlabel(g, f, f.xlab || '% of ' + f.nStart.toLowerCase() + ' to ' + f.nEnd.toLowerCase(), left + (w - left - right) / 2, h - 8);
  return 'note:' + D.nCyc + ' phase' + (D.nCyc === 1 ? '' : 's') + (f.src === 'session' ? ' from ' + sessCache.list.length + ' trial' + (sessCache.list.length === 1 ? '' : 's') : '') + '. Event lines show where the other events fall on average.';
}

// ---------- 3. angle–angle / phase plane ----------
function buildXY(g, w, h, f, R) {
  const vx = varBy(R, f.xKey), vy = varBy(R, f.yKey);
  if (!vx || !vy) return 'Choose the two variables in step 2.';
  const tracks = []; // each: { xs, ys, frames (or null), main }
  let note = '';
  if (f.xySrc === 'norm') {
    if (!f.nStart || !f.nEnd) return 'Choose where each cycle starts and ends (step 3). Mark events in 5. Events first.';
    const N = normalise(R, A.S, f.nStart, f.nEnd, Math.max(11, Math.min(1001, +f.nPts || 101)));
    const nx = N.vars[vx.key], ny = N.vars[vy.key];
    if (!nx || !ny) return 'No complete ' + f.nStart.toLowerCase() + ' to ' + f.nEnd.toLowerCase() + ' cycles with both variables.';
    if (f.on.each) nx.curves.forEach((c, k) => { if (c && ny.curves[k]) tracks.push({ xs: c, ys: ny.curves[k], each: true }); });
    tracks.push({ xs: nx.mean, ys: ny.mean, main: true, pct: N.pct });
    note = 'note:Mean of ' + N.cycles.length + ' cycle' + (N.cycles.length === 1 ? '' : 's') + ' (time-normalised, then averaged point by point).';
  } else {
    const [t0, t1] = tWindow(f, R), [Tx, Fx, Vx] = vx.get(), [, Fy, Vy] = vy.get();
    const yAt = new Map(); Fy.forEach((fr, k) => yAt.set(fr, Vy[k]));
    const xs = [], ys = [], fr = []; Fx.forEach((q, k) => { const t = Tx[k]; if (t >= t0 - 1e-9 && t <= t1 + 1e-9 && yAt.has(q)) { xs.push(Vx[k]); ys.push(yAt.get(q)); fr.push(q); } });
    if (xs.length < 2) return 'These two variables do not overlap in time.';
    tracks.push({ xs, ys, frames: fr, main: true });
  }
  const main = tracks[tracks.length - 1];
  const items = [];
  if (f.legend && f.xySrc === 'norm' && f.on.each) items.push({ label: 'Each cycle', col: f.st.xy, lw: Math.max(0.6, f.lw * 0.45) }, { label: 'Mean', col: f.st.xy, lw: f.lw * 1.25 });
  if (f.legend && f.on.start) items.push({ label: f.xySrc === 'norm' ? 'Start of the cycle (0%)' : 'Start', col: f.st.xy, dot: true });
  const top = header(g, f, w, f.legendPos === 'top' ? items : []);
  let xr = lim2(rangeOf(tracks.map((t) => t.xs)), f.lim.x0, f.lim.x1), yr = lim2(rangeOf(tracks.map((t) => t.ys)), f.lim.y0, f.lim.y1);
  const left = 18 + f.font + 10 + tickW(f, yr, 5), right = 24, bottom = h - (f.font + 2) - 14 - (f.font - 2) - 10;
  let b = { x: left, y: top, w: w - left - right, h: bottom - top };
  if (f.equal) b = equalBox(b, xr, yr); // same scale on both axes (e.g. two joint angles in degrees)
  const { X, Y } = panel(g, f, b, xr, yr, { gridX: true, zero: true });
  if (f.on.zero && xr[0] < 0 && xr[1] > 0) g.path([X(0), b.y, X(0), b.y + b.h], { stroke: f.st.axis, lw: 0.8, alpha: 0.6 });
  g.clip(b.x, b.y, b.w, b.h);
  tracks.forEach((t) => draw1(g, X, Y, t.xs, t.ys, t.each ? { stroke: f.st.xy, lw: Math.max(0.6, f.lw * 0.45), alpha: f.st.eachA } : { stroke: f.st.xy, lw: f.xySrc === 'norm' ? f.lw * 1.25 : f.lw }));
  const pts = main.xs.map((x, k) => ({ x, y: main.ys[k], fr: main.frames ? main.frames[k] : null, pc: main.pct ? main.pct[k] : null })).filter((q) => fin(q.x) && fin(q.y));
  if (f.on.arrows && pts.length > 3) { // direction of travel
    const n = 5;
    for (let j = 1; j <= n; j++) {
      const k = Math.floor(j * (pts.length - 1) / (n + 1)), a = pts[k], c = pts[Math.min(pts.length - 1, k + 1)];
      const x1 = X(a.x), y1 = Y(a.y), x2 = X(c.x), y2 = Y(c.y), L = Math.hypot(x2 - x1, y2 - y1); if (L < 0.5) continue;
      const ux = (x2 - x1) / L, uy = (y2 - y1) / L, sz = 5 + f.lw * 1.5;
      g.path([x2 - ux * sz - uy * sz * 0.6, y2 - uy * sz + ux * sz * 0.6, x2, y2, x2 - ux * sz + uy * sz * 0.6, y2 - uy * sz - ux * sz * 0.6], { fill: f.st.xy, stroke: f.st.xy, lw: 1 });
    }
  }
  if (f.on.start && pts.length) g.circle(X(pts[0].x), Y(pts[0].y), f.lw + 3, { fill: f.st.xy });
  g.unclip();
  // events: on the real-time path at their frames; on the mean cycle at their average % position
  const marks = [];
  if (f.on.evDots && f.xySrc !== 'norm') evList().forEach((e) => { const p = pts.reduce((best, q) => (Math.abs(q.fr - e.frame) < Math.abs(best.fr - e.frame) ? q : best), pts[0]); if (Math.abs(p.fr - e.frame) <= 2) marks.push([e.name, p]); });
  if (f.on.evDots && f.xySrc === 'norm') {
    const N = normalise(R, A.S, f.nStart, f.nEnd, 101), ev = {};
    A.S.events.forEach((e) => { if (e.name === f.nStart || e.name === f.nEnd) return; N.cycles.forEach((c) => { if (e.frame > c.a && e.frame < c.b) (ev[e.name] = ev[e.name] || []).push(100 * (e.frame - c.a) / (c.b - c.a)); }); });
    Object.entries(ev).forEach(([k, a]) => { const pc = a.reduce((u, v) => u + v, 0) / a.length, p = pts.reduce((best, q) => (Math.abs(q.pc - pc) < Math.abs(best.pc - pc) ? q : best), pts[0]); marks.push([k + ' (' + Math.round(pc) + '%)', p]); });
  }
  marks.forEach(([name, p]) => { const px = X(p.x), py = Y(p.y); g.circle(px, py, f.lw + 2.5, { fill: '#ffffff', stroke: f.st.ev, lw: 1.6 }); if (f.on.evNames) g.text(name, px + 7, py - 4, { size: f.font - 3, base: 'bottom', fill: f.st.ev }); });
  frameOf(g, f, b);
  ylabelFit(g, f, f.ylab || unitLab(vy), Math.max(14, b.x - tickW(f, yr, 5) - 12 - f.font), b);
  xlabel(g, f, f.xlab || unitLab(vx), b.x + b.w / 2, h - 8);
  if (f.legend && f.legendPos === 'inside') legendInside(g, f, items, b.x + b.w, b.y);
  return note;
}

// ---------- 4. stick-figure sequence ----------
function buildStick(g, w, h, f, R) {
  const sers = R.sers, names = Object.keys(sers); if (!names.length) return 'No markers.';
  const links = (A.S.template.links || []).filter((l) => sers[l[0]] && sers[l[1]]);
  const [t0, t1] = tWindow(f, R);
  const allF = [...new Set(names.flatMap((m) => sers[m].F))].sort((a, b) => a - b).filter((fr) => tReal(fr) >= t0 - 1e-9 && tReal(fr) <= t1 + 1e-9);
  if (!allF.length) return 'No digitised frames in this range.';
  const at = (m, fr) => { const s = sers[m], k = s.F.indexOf(fr); return k >= 0 && fin(s.x[k]) && fin(s.y[k]) ? [s.x[k], s.y[k]] : null; };
  let frames;
  if (f.stWhich === 'events') { frames = evList().map((e) => allF.reduce((best, fr) => (Math.abs(fr - e.frame) < Math.abs(best - e.frame) ? fr : best), allF[0])).filter((fr, i, a) => a.indexOf(fr) === i && tReal(fr) >= t0 - 1e-9 && tReal(fr) <= t1 + 1e-9); }
  else { const every = Math.max(1, Math.round(+f.stEvery || 5)); frames = allF.filter((fr, i) => i % every === 0); }
  if (!frames.length) return f.stWhich === 'events' ? 'No events in this range.' : 'No frames.';
  const evF = new Set(evList().map((e) => allF.reduce((best, fr) => (Math.abs(fr - e.frame) < Math.abs(best - e.frame) ? fr : best), allF[0])));
  const sp = +f.spread || 0, shift = (j) => j * sp;
  const P = []; frames.forEach((fr, j) => names.forEach((m) => { const p = at(m, fr); if (p) P.push([p[0] + shift(j), p[1]]); }));
  if (f.on.trails) names.forEach((m) => sers[m].F.forEach((fr, k) => { if (tReal(fr) >= t0 && tReal(fr) <= t1 && fin(sers[m].x[k])) P.push([sers[m].x[k], sers[m].y[k]]); }));
  const items = [];
  if (f.legend && f.stWhich !== 'events' && f.on.evDots && frames.some((fr) => evF.has(fr))) items.push({ label: 'At an event', col: f.st.evFig });
  const top = header(g, f, w, f.legendPos === 'top' ? items : []);
  let xr = rangeOf([P.map((p) => p[0])], 0.05), yr = rangeOf([P.map((p) => p[1])], 0.05);
  xr = lim2(xr, f.lim.x0, f.lim.x1); yr = lim2(yr, f.lim.y0, f.lim.y1);
  const u = units();
  const left = f.on.axes ? 18 + f.font + 10 + tickW(f, yr, 5) : 20, right = 20, bottom = h - (f.on.axes ? (f.font + 2) + 14 + (f.font - 2) + 10 : 34);
  const b = equalBox({ x: left, y: top, w: w - left - right, h: bottom - top }, xr, yr), k = b.k; // equal scale: a metre is the same length both ways
  let X = (v) => b.x + (v - xr[0]) * k, Y = (v) => b.y + b.h - (v - yr[0]) * k;
  if (f.on.axes) { ({ X, Y } = panel(g, f, b, xr, yr, { gridX: true })); }
  if (f.on.zero && u === 'm' && yr[0] < 0.02 && yr[1] > 0) g.path([b.x, Y(0), b.x + b.w, Y(0)], { stroke: f.st.axis, lw: 1.4 });
  g.clip(b.x, b.y, b.w, b.h);
  if (f.on.trails) names.forEach((m) => { const s = sers[m], xs = [], ys = []; s.F.forEach((fr, kk) => { if (tReal(fr) >= t0 && tReal(fr) <= t1) { xs.push(s.x[kk]); ys.push(s.y[kk]); } }); draw1(g, X, Y, xs, ys, { stroke: f.st.trail, lw: Math.max(0.8, f.lw * 0.5), dash: [3, 3] }); });
  frames.forEach((fr, j) => {
    const isEv = f.on.evDots && evF.has(fr) && f.stWhich !== 'events';
    const alpha = f.on.fade && frames.length > 1 ? 0.25 + 0.75 * j / (frames.length - 1) : 1, col = isEv ? f.st.evFig : f.st.stick;
    const pos = {}; names.forEach((m) => { const p = at(m, fr); if (p) pos[m] = [p[0] + shift(j), p[1]]; });
    links.forEach(([a, c]) => { if (pos[a] && pos[c]) g.path([X(pos[a][0]), Y(pos[a][1]), X(pos[c][0]), Y(pos[c][1])], { stroke: col, lw: f.stLw, alpha: isEv ? 1 : alpha }); });
    if (f.on.dots || !links.length) Object.values(pos).forEach((p) => g.circle(X(p[0]), Y(p[1]), Math.max(1.5, f.stLw * 0.9), { fill: col, alpha: isEv ? 1 : alpha }));
  });
  g.unclip();
  if (f.on.evNames && f.stWhich === 'events') frames.forEach((fr, j) => { const e = evList().reduce((best, x) => (Math.abs(x.frame - fr) < Math.abs(best.frame - fr) ? x : best)); let mx = -Infinity, my = 0; names.forEach((m) => { const p = at(m, fr); if (p && p[1] > mx) { mx = p[1]; my = p[0] + shift(j); } }); if (Number.isFinite(mx)) g.text(e.name, X(my), Y(mx) - 10, { size: f.font - 3, anchor: 'middle', base: 'bottom', fill: f.st.text }); });
  if (f.on.axes) { frameOf(g, f, b); ylabelFit(g, f, f.ylab || 'Vertical position (' + u + ')', Math.max(14, b.x - tickW(f, yr, 5) - 12 - f.font), b); xlabel(g, f, f.xlab || 'Horizontal position (' + u + ')', b.x + b.w / 2, h - 8); }
  else { // scale bar instead of axes
    const len = niceStep((xr[1] - xr[0]) / 4, 1), px = len * k, x0 = b.x, y0 = h - 16;
    g.path([x0, y0 - 4, x0, y0, x0 + px, y0, x0 + px, y0 - 4], { stroke: f.st.text, lw: 1.5 });
    g.text(numTxt(len, len) + ' ' + u, x0 + px + 6, y0, { size: f.font - 2, base: 'middle', fill: f.st.text });
  }
  if (!links.length) return 'note:Set up segments in 3. Markers (e.g. hip to knee) to join the markers into stick figures.';
  if (f.legend && f.legendPos === 'inside') legendInside(g, f, items, b.x + b.w, b.y);
  return 'note:' + frames.length + ' figure' + (frames.length === 1 ? '' : 's') + (f.spread ? ', each moved ' + f.spread + ' ' + u + ' to the right of the one before' : '') + '. Positions are filtered and the scale is the same in both directions.';
}

// ---------- drawing, preview and saving ----------
function build(g, w, h, f, R) {
  if (!R) return 'Press Update results first.';
  return f.type === 'norm' ? buildNorm(g, w, h, f, R) : f.type === 'xy' ? buildXY(g, w, h, f, R) : f.type === 'stick' ? buildStick(g, w, h, f, R) : buildTime(g, w, h, f, R);
}
const isErr = (m) => m && !m.startsWith('note:');
function setLook(f, forExport) { FONT = FONTS[f.fontFam] || FONTS.Arial; BG = f.bg === 'none' && forExport ? '' : '#ffffff'; }
function draw() {
  const f = F(), cv = $('figCv'); if (!cv) return;
  const [w, h] = sizeOf(f), dpr = Math.max(1, window.devicePixelRatio || 1);
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); setLook(f, false);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  let m;
  try { m = build(canvasG(ctx), w, h, f, A.results); } catch (e) { m = 'Could not draw this figure: ' + e.message; }
  if (isErr(m)) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#64748b'; ctx.font = '16px system-ui, Arial'; ctx.textAlign = 'center'; ctx.fillText(m, w / 2, h / 2); }
  $('figMsg').innerHTML = m ? esc(m.replace(/^note:/, '')) : '';
}
function png(scale) {
  const f = F(), [w, h] = sizeOf(f), cv = document.createElement('canvas'); cv.width = w * scale; cv.height = h * scale;
  const ctx = cv.getContext('2d'); ctx.scale(scale, scale); setLook(f, true);
  if (BG) { ctx.fillStyle = BG; ctx.fillRect(0, 0, w, h); }
  const m = build(canvasG(ctx), w, h, f, A.results); setLook(f, false);
  if (isErr(m)) { status(esc(m)); return; }
  cv.toBlob((b) => { download(baseName() + '_figure.png', b); status('Figure saved as a PNG (' + w * scale + ' × ' + h * scale + ' pixels).'); }, 'image/png');
}
function svg() {
  const f = F(), [w, h] = sizeOf(f); setLook(f, true);
  const g = svgG(w, h), m = build(g, w, h, f, A.results); setLook(f, false);
  if (isErr(m)) { status(esc(m)); return; }
  download(baseName() + '_figure.svg', new Blob([g.done()], { type: 'image/svg+xml' })); status('Figure saved as an SVG (editable in PowerPoint, Inkscape or Illustrator).');
}
export function figureSvg() { const f = F(), [w, h] = sizeOf(f); setLook(f, true); const g = svgG(w, h), m = build(g, w, h, f, A.results); setLook(f, false); return isErr(m) ? null : g.done(); } // for tests
export function setFigure(o) { const f = F(); Object.assign(f, o); save(); renderFigBuilder(); }

// ---------- the controls ----------
const opt = (v, l, cur) => '<option value="' + esc(v) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + l + '</option>';
const sel = (id, list, cur, attrs) => '<select id="' + id + '" class="mini" style="width:auto"' + (attrs || '') + '>' + list.map(([v, l]) => opt(v, l, cur)).join('') + '</select>';
const chip = (attr, v, l, on) => '<button type="button" class="chip' + (on ? ' active' : '') + '" ' + attr + '="' + esc(v) + '">' + l + '</button>';
const colIn = (key, val, label) => '<label class="colpick"><input type="color" data-st="' + key + '" value="' + val + '"> ' + label + '</label>';
function defaultSeries(R) {
  const V = vars(R);
  const angs = V.filter((v) => v.ang && v.def.k === 'th').slice(0, 3);
  if (angs.length) return angs.map((v) => ({ key: v.key, axis: 'L', col: '', dash: 'solid' }));
  const m = A.S.graph.points.find((p) => R.sers[p]) || Object.keys(R.sers)[0];
  return [{ key: m + '|y', axis: 'L', col: '', dash: 'solid' }];
}
function varOptions(R, cur) {
  const V = vars(R), groups = new Map();
  V.forEach((v) => { const gname = v.force ? 'Force' : v.ang ? 'Angle: ' + v.ang.key : 'Marker: ' + v.m; if (!groups.has(gname)) groups.set(gname, []); groups.get(gname).push(v); });
  return [...groups.entries()].map(([gname, vs]) => '<optgroup label="' + esc(gname) + '">' + vs.map((v) => opt(v.key, esc(v.label) + ' (' + esc(v.unit) + ')', cur)).join('') + '</optgroup>').join('');
}
export function renderFigBuilder() {
  const el = $('fbBox'); if (!el) return;
  const R = A.results, f = F();
  $('figure').classList.toggle('hide', !R);
  if (!R) { el.innerHTML = ''; return; }
  const V = vars(R), keys = V.map((v) => v.key);
  f.series = f.series.filter((s) => keys.includes(s.key));
  if (!f.series.length) f.series = defaultSeries(R);
  if (!keys.includes(f.xKey) || !keys.includes(f.yKey)) { const angs = V.filter((v) => v.ang && v.def.k === 'th'); if (angs.length >= 2) { f.xKey = angs[0].key; f.yKey = angs[1].key; } else if (angs.length === 1) { f.xKey = angs[0].key; f.yKey = V.find((v) => v.ang && v.def.k === 'w').key; } else { f.xKey = V[0].key; f.yKey = (V[1] || V[0]).key; } }
  const EV = evList(), evIds = EV.map((e) => e.id), names = eventNames(A.S);
  if (!evIds.includes(f.evA)) f.evA = EV.length ? EV[0].id : ''; if (!evIds.includes(f.evB)) f.evB = EV.length ? EV[EV.length - 1].id : '';
  if (!evIds.includes(f.xev)) f.xev = EV.length ? EV[0].id : '';
  if (!names.includes(f.nStart)) f.nStart = A.S.norm.start && names.includes(A.S.norm.start) ? A.S.norm.start : names[0] || '';
  if (!names.includes(f.nEnd)) f.nEnd = A.S.norm.end && names.includes(A.S.norm.end) ? A.S.norm.end : (names[1] || names[0] || '');
  if (f.type === 'xy' && f.legendPos === 'top' && !f.on.start) f.legend = f.legend;
  const evOpts = EV.map((e) => [e.id, esc(evLabel(e, 0, EV))]);
  const multiTrials = A.session.trials.length > 1;
  let h = '<p class="lead">Build a figure for a report, poster, paper or slides. Everything you change shows straight away; save it as a PNG (for Word and PowerPoint) or an editable SVG.</p><div class="figgrid"><div class="figctl">';
  h += '<p class="fl">1. What kind of figure?</p><div class="chips">' + Object.entries(TYPES).map(([k, l]) => chip('data-ft', k, l, f.type === k)).join('') + '</div>';
  if (f.type === 'time' || f.type === 'norm') {
    h += '<p class="fl">2. Lines</p><div class="serlist">' + f.series.map((s, i) => '<div class="serrow"><select class="mini" data-sk="' + i + '">' + varOptions(R, s.key) + '</select>'
      + (f.type === 'time' && f.layout !== 'stack' ? '<select class="mini" data-sa="' + i + '">' + opt('L', 'Left axis', s.axis) + opt('R', 'Right axis', s.axis) + '</select>' : '')
      + '<input type="color" data-sc="' + i + '" value="' + colOf(f, i, s.col) + '" title="Colour"><select class="mini" data-sd="' + i + '">' + Object.entries(DASHN).map(([v, l]) => opt(v, l, s.dash || 'solid')).join('') + '</select>'
      + '<button type="button" class="btn small ghost" data-sx="' + i + '" title="Remove this line">&times;</button></div>').join('') + '</div>'
      + '<div class="row tight"><button type="button" class="btn small ghost" id="fbAdd">+ Add a line</button>' + sel('fbLayout', [['one', 'All on one graph'], ['stack', 'Stacked panels, one per line']], f.layout) + '</div>'
      + '<p class="muted small">e.g. hip, knee and ankle angles as stacked panels sharing one time axis, or a joint angle (left axis) with its angular velocity (right axis).</p>';
  }
  if (f.type === 'time') {
    h += '<p class="fl">3. Time axis and range</p><div class="row tight">' + sel('fbXmode', [['time', 'Time from the start (s)'], ['event', 'Time from an event (s)'], ['frame', 'Frame number']], f.xmode) + (f.xmode === 'event' ? sel('fbXev', evOpts.length ? evOpts : [['', '(no events)']], f.xev) : '') + '</div>';
  }
  if (f.type === 'time' || (f.type === 'xy' && f.xySrc !== 'norm') || f.type === 'stick') {
    h += (f.type === 'time' ? '' : '<p class="fl">' + (f.type === 'xy' ? '3b' : '2') + '. Which part of the trial</p>') + '<div class="row tight">' + sel('fbRange', [['all', 'The whole trial'], ['events', 'Between two events']], f.range) + '</div>';
    if (f.range === 'events') h += EV.length ? '<div class="row tight">' + sel('fbEvA', evOpts, f.evA) + '<span class="muted">to</span>' + sel('fbEvB', evOpts, f.evB) + '<label class="inline" style="margin:0">± <input type="number" id="fbPad" class="mini" style="width:4.5rem" min="0" max="2" step="0.01" value="' + f.pad + '"> s</label></div>' : '<p class="muted small">Mark events in <strong>5. Events</strong> first.</p>';
  }
  if (f.type === 'time') {
    h += '<p class="fl">4. What else to show</p><div class="chips">' + [['events', 'Event lines'], ['evNames', 'Event and shading names'], ['peaks', 'Mark max and min'], ['peakVals', 'Max and min values'], ['zero', 'Zero line']].map(([k, l]) => chip('data-fl', k, l, f.on[k])).join('') + (f.layout === 'stack' ? chip('data-fc2', 'letters', 'Panel letters (A, B, C)', f.letters) : '') + '</div>'
      + '<p class="small" style="margin:.4rem 0 .1rem"><strong>Shade phases</strong> (e.g. touchdown to toe-off labelled &ldquo;Stance&rdquo;)</p>'
      + f.shades.map((sh, i) => '<div class="serrow">' + sel('', names.map((n) => [n, esc(n)]), sh.a, ' data-sha="' + i + '"') + '<span class="muted">to</span>' + sel('', names.map((n) => [n, esc(n)]), sh.b, ' data-shb="' + i + '"') + '<input type="text" class="mini" data-shl="' + i + '" value="' + esc(sh.label || '') + '" placeholder="Label" style="width:7rem"><input type="color" data-shc="' + i + '" value="' + (sh.col || '#64748b') + '"><button type="button" class="btn small ghost" data-shx="' + i + '">&times;</button></div>').join('')
      + (names.length ? '<button type="button" class="btn small ghost" id="fbShAdd">+ Add shading</button>' : '<p class="muted small">Mark events in <strong>5. Events</strong> to shade phases.</p>');
  }
  if (f.type === 'norm') {
    h += '<p class="fl">3. Each phase runs from</p>' + (names.length ? '<div class="row tight">' + sel('fbNs', names.map((n) => [n, esc(n)]), f.nStart) + '<span class="muted">to the next</span>' + sel('fbNe', names.map((n) => [n, esc(n)]), f.nEnd) + '<label class="inline" style="margin:0">points <input type="number" id="fbNp" class="mini" style="width:5rem" min="11" max="1001" step="10" value="' + f.nPts + '"></label></div><p class="muted small">For a whole cycle (e.g. a stride), choose the same event for both.</p>' : '<p class="muted small">Mark events in <strong>5. Events</strong> first (e.g. touchdown and toe-off).</p>')
      + '<p class="fl">4. From</p><div class="row tight">' + sel('fbSrc', [['trial', 'This trial (each cycle)']].concat(multiTrials ? [['session', 'Every trial in the session']] : []), f.src) + (f.src === 'session' ? sel('fbColBy', [['trial', 'A line per trial'], ['athlete', 'Mean per participant'], ['condition', 'Mean per condition'], ['both', 'Mean per participant and condition'], ['all', 'One mean of everything']], f.colourBy) : '') + '</div>'
      + '<div class="chips">' + [['each', f.src === 'session' ? 'Each phase' : 'Each cycle'], ['mean', 'Mean'], ['sd', '± 1 SD band'], ['normEv', 'Lines at the other events'], ['evNames', 'Event names'], ['zero', 'Zero line']].map(([k, l]) => chip('data-fl', k, l, f.on[k])).join('') + (f.layout === 'stack' ? chip('data-fc2', 'letters', 'Panel letters', f.letters) : '') + '</div>';
    if (f.src === 'session' && sessCache) {
      const gks = []; sessCache.list.forEach((x) => { const gk = f.colourBy === 'trial' ? x.t.id : groupKey(x.t, f.colourBy), nm = f.colourBy === 'trial' ? trialName(x.t) : gk; if (!gks.some((q) => q[0] === gk)) gks.push([gk, nm]); });
      h += '<div class="colgrid">' + gks.map(([gk, nm], j) => '<label class="colpick"><input type="color" data-gc="' + esc(gk) + '" value="' + (f.gcol[gk] || colOf(f, j)) + '"> ' + esc(nm) + '</label>').join('') + '</div>';
    }
  }
  if (f.type === 'xy') {
    h += '<p class="fl">2. Plot</p><div class="row tight"><label class="inline" style="margin:0">y axis</label><select class="mini" id="fbYk">' + varOptions(R, f.yKey) + '</select></div><div class="row tight"><label class="inline" style="margin:0">against x axis</label><select class="mini" id="fbXk">' + varOptions(R, f.xKey) + '</select></div>'
      + '<p class="muted small">Angle&ndash;angle diagrams (e.g. knee against hip) show how two joints are coordinated. A phase plane (an angle against its own angular velocity) shows how a joint moves through its range.</p>'
      + '<p class="fl">3. Which data</p><div class="row tight">' + sel('fbXySrc', [['raw', 'Over real time'], ['norm', 'Mean cycle (time-normalised)']], f.xySrc) + '</div>'
      + (f.xySrc === 'norm' ? (names.length ? '<div class="row tight"><span class="muted">Each cycle runs from</span>' + sel('fbNs', names.map((n) => [n, esc(n)]), f.nStart) + '<span class="muted">to the next</span>' + sel('fbNe', names.map((n) => [n, esc(n)]), f.nEnd) + '</div><p class="muted small">For a whole cycle (e.g. touchdown to the next touchdown of the same foot), choose the same event for both.</p>' : '<p class="muted small">Mark events in <strong>5. Events</strong> first.</p>') : '')
      + '<p class="fl">4. What else to show</p><div class="chips">' + [['start', 'Dot at the start'], ['arrows', 'Direction arrows'], ['evDots', 'Events as dots'], ['evNames', 'Event names'], ['zero', 'Zero lines']].concat(f.xySrc === 'norm' ? [['each', 'Each cycle']] : []).map(([k, l]) => chip('data-fl', k, l, f.on[k])).join('') + chip('data-fc2', 'equal', 'Same scale on both axes', f.equal) + '</div>';
  }
  if (f.type === 'stick') {
    h += '<p class="fl">3. Which frames</p><div class="row tight">' + sel('fbStW', [['every', 'Every few frames'], ['events', 'At each event']], f.stWhich) + (f.stWhich === 'every' ? '<label class="inline" style="margin:0">every <input type="number" id="fbStE" class="mini" style="width:4.5rem" min="1" max="100" step="1" value="' + f.stEvery + '"> digitised frames</label>' : '') + '</div>'
      + '<div class="row tight"><label class="inline" style="margin:0">Spread each figure to the right by <input type="number" id="fbSpread" class="mini" style="width:5rem" min="0" max="5" step="0.05" value="' + f.spread + '"> ' + units() + '</label></div>'
      + '<p class="muted small">0 overlays the figures where they were (good for a sprint or a jump filmed from the side). A spread separates figures that move on the spot (e.g. treadmill running or a squat).</p>'
      + '<div class="chips">' + [['fade', 'Fade earlier figures'], ['evDots', 'Highlight figures at events'], ['evNames', 'Event names'], ['dots', 'Marker dots'], ['trails', 'Marker paths'], ['axes', 'Axes (or a scale bar)'], ['zero', 'Ground line (y = 0)']].map(([k, l]) => chip('data-fl', k, l, f.on[k])).join('') + '</div>'
      + '<div class="row"><div><label for="fbStLw">Stick thickness</label><input type="range" id="fbStLw" min="0.5" max="6" step="0.25" value="' + f.stLw + '"></div></div>';
  }
  const hasR = f.type === 'time' && f.layout !== 'stack' && f.series.some((s) => s.axis === 'R');
  h += '<p class="fl">Size and text</p><div class="row tight">' + sel('fbSize', Object.entries(SIZES).map(([k, v]) => [k, v[0] + (v[1] ? ' (' + v[1] + ' × ' + v[2] + ')' : '')]), f.size) + sel('fbFontFam', Object.keys(FONTS).map((k) => [k, k]), f.fontFam) + '</div>';
  if (f.size === 'custom') h += '<div class="row tight"><label class="inline" style="margin:0">Width <input type="number" id="fbW" class="mini" style="width:5.5rem" min="300" max="4000" step="10" value="' + f.W + '"></label><label class="inline" style="margin:0">Height <input type="number" id="fbH" class="mini" style="width:5.5rem" min="200" max="4000" step="10" value="' + f.H + '"> px</label></div>';
  h += '<div class="chks">' + [['legend', 'Legend'], ['grid', 'Grid lines'], ['cb', 'Colour-blind-safe colours (Okabe &amp; Ito)']].map(([k, l]) => '<label class="inline"><input type="checkbox" data-fc="' + k + '"' + (f[k] ? ' checked' : '') + '> ' + l + '</label>').join('') + '</div>';
  h += '<div class="row tight"><label class="inline" style="margin:0">Legend</label>' + sel('fbLegPos', [['top', 'Above the graph'], ['inside', 'Inside, top right']], f.legendPos) + '<label class="inline" style="margin:0">Background</label>' + sel('fbBg', [['white', 'White'], ['none', 'Transparent (when saved)']], f.bg) + '</div>';
  h += '<div class="row"><div><label for="fbTitle">Title</label><input type="text" id="fbTitle" value="' + esc(f.title) + '" placeholder="(none)"></div>'
    + '<div><label for="fbY">' + (hasR ? 'Left y' : 'y') + ' axis label</label><input type="text" id="fbY" value="' + esc(f.ylab) + '" placeholder="automatic"></div>'
    + (hasR ? '<div><label for="fbY2">Right y axis label</label><input type="text" id="fbY2" value="' + esc(f.y2lab) + '" placeholder="automatic"></div>' : '')
    + '<div><label for="fbX">x axis label</label><input type="text" id="fbX" value="' + esc(f.xlab) + '" placeholder="automatic"></div></div>'
    + '<div class="row"><div><label for="fbLw">Line thickness</label><input type="range" id="fbLw" min="0.5" max="5" step="0.25" value="' + f.lw + '"></div><div><label for="fbFont">Text size</label><input type="range" id="fbFont" min="9" max="24" step="1" value="' + f.font + '"></div></div>';
  h += '<details class="more"><summary>Axis limits</summary><p class="muted small">Leave empty for automatic. Use the same limits on figures you want to compare side by side.</p><div class="limgrid">'
    + [['x0', 'x from'], ['x1', 'x to'], ['y0', (hasR ? 'Left y' : 'y') + ' from'], ['y1', (hasR ? 'Left y' : 'y') + ' to']].concat(hasR ? [['z0', 'Right y from'], ['z1', 'Right y to']] : []).map(([k, l]) => '<label>' + l + '<input type="number" step="any" class="mini" data-lim="' + k + '" value="' + esc(f.lim[k]) + '"></label>').join('') + '</div></details>';
  const st = f.st;
  let sty = '<div class="colgrid">' + colIn('ev', st.ev, 'Event lines and names');
  if (f.type === 'xy') sty += colIn('xy', st.xy, 'Line');
  if (f.type === 'stick') sty += colIn('stick', st.stick, 'Stick figures') + colIn('evFig', st.evFig, 'Figures at events') + colIn('trail', st.trail, 'Marker paths');
  sty += colIn('axis', st.axis, 'Axes and numbers') + colIn('grid', st.grid, 'Grid lines') + colIn('text', st.text, 'Titles and labels') + '</div>';
  sty += '<div class="row">' + (f.type === 'time' ? '<div><label>Shading opacity</label><input type="range" data-sta="shadeA" min="0" max="0.6" step="0.02" value="' + st.shadeA + '"></div>' : '')
    + (f.type === 'xy' && f.xySrc === 'norm' ? '<div><label>Each-cycle opacity</label><input type="range" data-sta="eachA" min="0.05" max="1" step="0.05" value="' + st.eachA + '"></div>' : '')
    + (f.type === 'norm' ? '<div><label>SD band opacity</label><input type="range" data-sta="sdA" min="0" max="0.6" step="0.02" value="' + st.sdA + '"></div><div><label>Each-cycle opacity</label><input type="range" data-sta="eachA" min="0.05" max="1" step="0.05" value="' + st.eachA + '"></div>' : '')
    + '<div><label>Event line thickness</label><input type="range" data-sta="evLw" min="0.5" max="3" step="0.25" value="' + st.evLw + '"></div></div>'
    + '<div class="row tight"><label class="inline" style="margin:0">Event lines <select class="mini" style="width:auto" data-std="evDash">' + Object.entries(DASHN).map(([v, l]) => opt(v, l, st.evDash)).join('') + '</select></label></div>';
  h += '<details class="more"' + (A.figStyleOpen ? ' open' : '') + ' id="fbStyle"><summary>Colours and line styles</summary>' + sty + '<button type="button" class="btn small ghost" id="fbStyleReset">Default colours</button></details>';
  h += '<p class="fl">Save it</p><div class="row tight"><button type="button" class="btn accent" id="fbPng">Picture (PNG)</button><button type="button" class="btn" id="fbSvg">Editable drawing (SVG)</button><button type="button" class="btn ghost small" id="fbRefresh">Refresh data</button><button type="button" class="btn ghost small" id="fbReset">Start again</button></div>'
    + '<p class="muted small">The PNG is saved at three times the size shown (about 300 dpi for a one-column figure), so it prints sharply. The SVG stays sharp at any size and every line and label can still be edited. The figure uses the filtered data from Results, so press <strong>Update results</strong> after changing markers, events or the filter. Write your own caption: say what the lines, shading and axes show, the cut-off frequency, and how many cycles or trials a mean is from.</p>';
  h += '</div><div class="figprev"><canvas id="figCv" role="img" aria-label="Preview of the figure"></canvas><p class="muted small" id="figMsg" role="status"></p></div></div>';
  el.innerHTML = h;
  const re = (full) => { save(); if (full) renderFigBuilder(); else draw(); };
  el.querySelectorAll('[data-ft]').forEach((b) => b.addEventListener('click', () => { f.type = b.getAttribute('data-ft'); re(true); }));
  el.querySelectorAll('[data-fl]').forEach((b) => b.addEventListener('click', () => { const k = b.getAttribute('data-fl'); f.on[k] = !f.on[k]; re(true); }));
  el.querySelectorAll('[data-fc2]').forEach((b) => b.addEventListener('click', () => { const k = b.getAttribute('data-fc2'); f[k] = !f[k]; re(true); }));
  el.querySelectorAll('[data-fc]').forEach((c) => c.addEventListener('change', function () { f[this.getAttribute('data-fc')] = this.checked; re(true); }));
  el.querySelectorAll('[data-sk]').forEach((s) => s.addEventListener('change', function () { f.series[+this.getAttribute('data-sk')].key = this.value; re(true); }));
  el.querySelectorAll('[data-sa]').forEach((s) => s.addEventListener('change', function () { f.series[+this.getAttribute('data-sa')].axis = this.value; re(true); }));
  el.querySelectorAll('[data-sc]').forEach((s) => s.addEventListener('input', function () { f.series[+this.getAttribute('data-sc')].col = this.value; re(); }));
  el.querySelectorAll('[data-sd]').forEach((s) => s.addEventListener('change', function () { f.series[+this.getAttribute('data-sd')].dash = this.value; re(); }));
  el.querySelectorAll('[data-sx]').forEach((b) => b.addEventListener('click', () => { f.series.splice(+b.getAttribute('data-sx'), 1); if (!f.series.length) f.series = defaultSeries(R); re(true); }));
  if ($('fbAdd')) $('fbAdd').addEventListener('click', () => { const used = f.series.map((s) => s.key), nx = V.find((v) => !used.includes(v.key) && (v.ang ? v.def.k === 'th' : true)) || V[0]; f.series.push({ key: nx.key, axis: 'L', col: '', dash: 'solid' }); re(true); });
  el.querySelectorAll('[data-sha]').forEach((s) => s.addEventListener('change', function () { f.shades[+this.getAttribute('data-sha')].a = this.value; re(); }));
  el.querySelectorAll('[data-shb]').forEach((s) => s.addEventListener('change', function () { f.shades[+this.getAttribute('data-shb')].b = this.value; re(); }));
  el.querySelectorAll('[data-shl]').forEach((s) => s.addEventListener('input', function () { f.shades[+this.getAttribute('data-shl')].label = this.value; re(); }));
  el.querySelectorAll('[data-shc]').forEach((s) => s.addEventListener('input', function () { f.shades[+this.getAttribute('data-shc')].col = this.value; re(); }));
  el.querySelectorAll('[data-shx]').forEach((b) => b.addEventListener('click', () => { f.shades.splice(+b.getAttribute('data-shx'), 1); re(true); }));
  if ($('fbShAdd')) $('fbShAdd').addEventListener('click', () => { const tdn = names.find((n) => /touch|contact|strike/i.test(n)) || names[0], toff = names.find((n) => /toe|off/i.test(n)) || names[1] || names[0]; f.shades.push({ a: tdn, b: toff, label: /touch|contact|strike/i.test(tdn) && /toe|off/i.test(toff) ? 'Stance' : '', col: ['#64748b', '#0ea5e9', '#f59e0b'][f.shades.length % 3] }); re(true); });
  el.querySelectorAll('[data-gc]').forEach((i) => i.addEventListener('input', function () { f.gcol[this.getAttribute('data-gc')] = this.value; re(); }));
  const full = ['fbLayout', 'fbXmode', 'fbRange', 'fbSize', 'fbSrc', 'fbColBy', 'fbStW', 'fbNs', 'fbNe', 'fbXySrc'];
  [['fbLayout', 'layout'], ['fbXmode', 'xmode'], ['fbXev', 'xev'], ['fbRange', 'range'], ['fbEvA', 'evA'], ['fbEvB', 'evB'], ['fbNs', 'nStart'], ['fbNe', 'nEnd'], ['fbSrc', 'src'], ['fbColBy', 'colourBy'], ['fbXk', 'xKey'], ['fbYk', 'yKey'], ['fbStW', 'stWhich'], ['fbXySrc', 'xySrc'], ['fbSize', 'size'], ['fbFontFam', 'fontFam'], ['fbLegPos', 'legendPos'], ['fbBg', 'bg']]
    .forEach(([id, k]) => { if ($(id)) $(id).addEventListener('change', function () { f[k] = this.value; if (id === 'fbSrc' || id === 'fbColBy') { draw(); } re(full.includes(id)); }); });
  [['fbPad', 'pad'], ['fbNp', 'nPts'], ['fbStE', 'stEvery'], ['fbSpread', 'spread'], ['fbW', 'W'], ['fbH', 'H']].forEach(([id, k]) => { if ($(id)) $(id).addEventListener('change', function () { const v = parseFloat(this.value); if (v >= 0) { f[k] = v; re(); } }); });
  [['fbTitle', 'title'], ['fbY', 'ylab'], ['fbY2', 'y2lab'], ['fbX', 'xlab']].forEach(([id, k]) => { if ($(id)) $(id).addEventListener('input', function () { f[k] = this.value; re(); }); });
  [['fbLw', 'lw'], ['fbFont', 'font'], ['fbStLw', 'stLw']].forEach(([id, k]) => { if ($(id)) $(id).addEventListener('input', function () { f[k] = +this.value; re(); }); });
  el.querySelectorAll('[data-lim]').forEach((i) => i.addEventListener('change', function () { f.lim[this.getAttribute('data-lim')] = this.value; re(); }));
  el.querySelectorAll('[data-st]').forEach((i) => i.addEventListener('input', function () { f.st[this.getAttribute('data-st')] = this.value; re(); }));
  el.querySelectorAll('[data-sta]').forEach((i) => i.addEventListener('input', function () { f.st[this.getAttribute('data-sta')] = +this.value; re(); }));
  el.querySelectorAll('[data-std]').forEach((i) => i.addEventListener('change', function () { f.st[this.getAttribute('data-std')] = this.value; re(); }));
  $('fbStyle').addEventListener('toggle', function () { A.figStyleOpen = this.open; });
  $('fbStyleReset').addEventListener('click', () => { f.st = Object.assign({}, STYLE0); f.gcol = {}; f.series.forEach((s) => { s.col = ''; }); f.shades.forEach((s, i) => { s.col = ['#64748b', '#0ea5e9', '#f59e0b'][i % 3]; }); re(true); });
  $('fbPng').addEventListener('click', () => png(3));
  $('fbSvg').addEventListener('click', svg);
  $('fbRefresh').addEventListener('click', () => { sessCache = null; if (A.fn.compute) A.fn.compute(); else renderFigBuilder(); });
  $('fbReset').addEventListener('click', () => { A.fig = defaults(); sessCache = null; re(true); });
  draw();
  // the session list only exists after the first draw: show its colour pickers
  if (f.type === 'norm' && f.src === 'session' && !el.querySelector('[data-gc]') && sessCache && sessCache.list.length) renderFigBuilder();
}
