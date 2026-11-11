// Tab 4: the figure builder. Choose the kind of figure, switch layers and muscles on and off, set the labels
// and the size, then save it as a picture (PNG) or as a drawing you can still edit (SVG).
// The figure is drawn through a small set of shapes (rectangle, line, text) with two back ends, one for the
// canvas on screen and one that writes SVG, so the picture and the SVG always match.
import { A, $, esc, status, muscle, SET, W, PHASE_COLS, POINT_COL, download, baseName, trialLabel } from './state.js?v=1.3.0';
import { analyse, waveforms } from './emg.js?v=1.3.0';
import { compute, mean, sd } from './results.js?v=1.3.0';
import { moveSignal } from './events.js?v=1.3.0';
import { niceStep, numTxt } from './plot.js?v=1.3.0';

const OKABE = ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#E69F00', '#56B4E9', '#000000', '#999999']; // Okabe and Ito (2008)
const SIZES = { slide: ['Slide (16:9)', 960, 540], report: ['Report (4:3)', 800, 600], wide: ['Wide and short', 1000, 400], poster: ['Poster (3:2)', 1080, 720], tall: ['Tall', 720, 900] };
const TYPES = { time: 'Over time', pct: 'Average ', bars: 'Bars (mean ± SD)' };
const LAYERS = {
  time: [['env', 'Linear envelope'], ['raw', 'Raw EMG'], ['reps', 'Rep shading'], ['phases', 'Phase shading'], ['events', 'Event lines'], ['names', 'Rep and phase names'], ['onoff', 'Muscle on/off bars'], ['move', 'Movement signal']],
  pct: [['mean', 'Mean line'], ['sd', '± SD band'], ['each', 'Every rep'], ['phases', 'Phase shading'], ['onoff', 'Muscle on/off bars']],
  bars: [['each', 'Every rep (dots)'], ['err', '± SD bars'], ['byPhase', 'Split by phase']]
};
const FONT = 'Arial, Helvetica, sans-serif';
function defaults() { return { type: 'time', layout: 'stack', range: 'view', metric: 'mean', hide: {}, cmp: '', on: { env: true, raw: false, reps: true, phases: true, events: true, names: true, onoff: false, move: false, mean: true, sd: true, each: false, err: true, byPhase: true }, legend: true, grid: true, sharedY: true, cb: false, title: '', xlab: '', ylab: '', ymax: '', size: 'slide', lw: 2, font: 14 }; }
function F() {
  if (!A.fig) { A.fig = defaults(); try { const j = JSON.parse(localStorage.getItem('emg-fig1')); if (j) { Object.assign(A.fig, j, { on: Object.assign(A.fig.on, j.on || {}), hide: {}, cmp: '', title: '', xlab: '', ylab: '', ymax: '' }); } } catch (e) { /* ignore */ } }
  return A.fig;
}
function save() { try { localStorage.setItem('emg-fig1', JSON.stringify(A.fig)); } catch (e) { /* ignore */ } }

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
function colourOf(f, keys) { const m = {}; keys.forEach((k, j) => { m[k] = f.cb ? OKABE[j % OKABE.length] : muscle(k).col; }); return m; }
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

// ---------- the figure ----------
// Draws the figure with back end g at w x h. Returns a message if there is nothing to draw.
function build(g, w, h, f, R, R2) {
  const chs = R.pr.ch.map((c, k) => ({ c, k, key: c.key })).filter((m) => !f.hide[m.key]);
  if (!chs.length) return 'Switch on at least one muscle.';
  const col = colourOf(f, R.pr.ch.map((c) => c.key)), wd = W(), on = f.on, unit = R.ni.unit;
  const nm = (m) => muscle(m.key).short, y1 = (k) => R.N[k] || R.pr.ch[k].env, sc = (k) => (R.N[k] ? 1 : 1e6);
  let top = 10;
  if (f.title) { g.text(f.title, w / 2, top, { size: f.font + 4, bold: true, anchor: 'middle', base: 'top' }); top += f.font + 14; }
  const L = 34 + Math.max(30, f.font * 2.6), Rm = 16, bot = f.font * 2 + 22;
  const byRep = {}; R.phases.forEach((p) => { (byRep[p.rep] = byRep[p.rep] || []).push(p); });
  const nPh = Math.max(0, ...Object.values(byRep).map((p) => p.length)), phName = (j) => SET().phaseNames[j] || 'Phase ' + (j + 1);
  const items = [];
  const phaseItems = () => { for (let j = 0; j < nPh; j++) items.push({ label: phName(j), col: PHASE_COLS[j % PHASE_COLS.length], box: true, alpha: 0.3 }); };

  if (f.type === 'time') {
    const full = [0, (R.n - 1) / R.fs], xr = f.range === 'view' && A.view ? [A.view.x0, A.view.x1] : full, fsE = R.fs;
    const i0 = Math.max(0, Math.floor(xr[0] * fsE)), i1 = Math.min(R.n - 1, Math.ceil(xr[1] * fsE));
    const sig = on.move ? moveSignal(R.pr) : null, both = on.env && on.raw, rawOnly = on.raw && !on.env;
    if (!on.env && !on.raw && !sig) return 'Switch on the linear envelope, the raw EMG or the movement signal.';
    const stack = f.layout === 'stack', emgPanels = on.env || on.raw ? (stack ? chs.map((m) => [m]) : [chs]) : [];
    const mx = (m) => { let v = 0; const y = rawOnly ? m.c.bp : y1(m.k), s = rawOnly ? 1e6 : sc(m.k); for (let i = i0; i <= Math.min(i1, m.c.n - 1); i++) { const q = Math.abs(y[i] * s); if (q > v) v = q; } return v; };
    const all = Math.max(...chs.map(mx), 1e-9);
    if (f.legend) {
      if (!stack && emgPanels.length) chs.forEach((m) => items.push({ label: nm(m), col: col[m.key] }));
      if (both) items.push({ label: 'raw EMG (band-passed, own scale)', col: '#9ca3af', lw: 1 });
      if (on.phases && nPh) phaseItems(); else if (on.reps && R.reps.length) items.push({ label: wd.one, col: '#22c55e', box: true, alpha: 0.25 });
      if (on.events) { const ty = new Set(R.pts.map((p) => p.type)); if (ty.has('rep0')) items.push({ label: wd.start, col: POINT_COL.rep0, dash: [6, 4], lw: 1.5 }); if (ty.has('phase')) items.push({ label: 'Phase change', col: POINT_COL.phase, dash: [2, 3], lw: 1.5 }); if (ty.has('rep1')) items.push({ label: wd.end, col: POINT_COL.rep1, dash: [6, 4], lw: 1.5 }); }
      if (on.onoff) items.push({ label: 'muscle on', col: '#6b7280', lw: 5 });
      top += legend(g, f, items, L, top, w - L - Rm);
    }
    const namesH = on.names && R.reps.length ? f.font + 2 : 0; top += namesH;
    const np = emgPanels.length + (sig ? 1 : 0), gap = 10, ph = (h - top - bot - gap * (np - 1)) / np;
    if (ph < 30) return 'Too many panels for this size: choose a taller size, fewer muscles or all on one panel.';
    const shade = (b, X) => {
      g.clip(b.x, b.y, b.w, b.h);
      R.reps.forEach((r, j) => {
        const ps = byRep[r.rep];
        if (on.phases && ps) ps.forEach((p) => g.rect(X(p.i0 / fsE), b.y, X(p.i1 / fsE) - X(p.i0 / fsE), b.h, { fill: PHASE_COLS[p.phase % PHASE_COLS.length], alpha: 0.16 }));
        else if (on.reps) g.rect(X(r.i0 / fsE), b.y, X(r.i1 / fsE) - X(r.i0 / fsE), b.h, { fill: j % 2 ? '#0ea5e9' : '#22c55e', alpha: 0.1 });
      });
      if (on.events) R.pts.forEach((p) => { if (!/^(rep|phase|mark)/.test(p.type)) return; const x = X(p.i / fsE); if (x < b.x || x > b.x + b.w) return; g.path([x, b.y, x, b.y + b.h], { stroke: POINT_COL[p.type] || '#2563eb', lw: 1.4, dash: p.type === 'phase' ? [2, 3] : [6, 4] }); });
      g.unclip();
    };
    emgPanels.forEach((ms, pj) => {
      const b = { x: L, y: top + pj * (ph + gap), w: w - L - Rm, h: ph };
      const ymx = (+f.ymax > 0 ? +f.ymax : (f.sharedY || !stack ? all : Math.max(...ms.map(mx), 1e-9)) * 1.08), sym = on.raw;
      g.rect(b.x, b.y, b.w, b.h, { fill: '#ffffff' });
      const S = panel(g, f, b, xr, [sym ? -ymx : 0, ymx], { noX: pj < np - 1, yfmt: both ? (v) => (v < -1e-9 ? '' : numTxt(v, niceStep(2 * ymx, Math.max(2, Math.round(ph / 55))))) : undefined });
      shade(b, S.X);
      if (pj === 0 && namesH) R.reps.forEach((r) => {
        const a = Math.max(b.x, S.X(r.i0 / fsE)), e = Math.min(b.x + b.w, S.X(r.i1 / fsE)), ps = on.phases && byRep[r.rep];
        if (e - a > textW(r.name, f.font - 2) + 6) g.text(r.name, (a + e) / 2, b.y - 3, { size: f.font - 2, anchor: 'middle', base: 'bottom', fill: '#374151' });
        if (ps && !f.legend) ps.forEach((p) => { const pa = Math.max(b.x, S.X(p.i0 / fsE)), pe = Math.min(b.x + b.w, S.X(p.i1 / fsE)); if (pe - pa > textW(p.phaseName, f.font - 3) + 6) g.text(p.phaseName, (pa + pe) / 2, b.y + 4, { size: f.font - 3, anchor: 'middle', base: 'top', fill: '#4b5563' }); });
      });
      g.clip(b.x, b.y - 1, b.w, b.h + 2);
      ms.forEach((m, mj) => {
        const c = m.c, e1 = Math.min(i1, c.n - 1);
        if (on.raw) { let pk = 0; for (let i = i0; i <= e1; i++) { const q = Math.abs(c.bp[i]); if (q > pk) pk = q; } g.path(trace(S.X, S.Y, R.pr.t, c.bp, i0, e1, b.w, rawOnly ? 1e6 : (pk > 0 ? ymx / 1.08 / pk : 1)), { stroke: rawOnly ? col[m.key] : '#9ca3af', lw: rawOnly ? 1 : 0.8, alpha: rawOnly ? 1 : 0.8 }); }
        if (on.env) g.path(trace(S.X, S.Y, R.pr.t, y1(m.k), i0, e1, b.w, sc(m.k)), { stroke: col[m.key], lw: f.lw });
        if (on.onoff) R.bursts.forEach((bu) => { const p = bu.per[m.k]; if (!p || !Number.isFinite(p.onI) || !Number.isFinite(p.offI)) return; const yy = b.y + b.h - 4 - (stack ? 0 : mj * 6); g.path([S.X(p.onI / fsE), yy, S.X(p.offI / fsE), yy], { stroke: col[m.key], lw: 4, dash: [1000, 1] }); });
      });
      g.unclip();
      frameOf(g, b);
      if (stack) g.text(nm(ms[0]), b.x + 7, b.y + 5, { size: f.font - 1, bold: true, fill: col[ms[0].key], base: 'top' });
    });
    if (sig) {
      const b = { x: L, y: top + emgPanels.length * (ph + gap), w: w - L - Rm, h: ph }, a = Math.max(sig.a, Math.floor(xr[0] * sig.fs)), e = Math.min(sig.b, Math.ceil(xr[1] * sig.fs));
      let lo = Infinity, hi = -Infinity; for (let i = a; i <= e; i++) { if (sig.y[i] < lo) lo = sig.y[i]; if (sig.y[i] > hi) hi = sig.y[i]; }
      if (!Number.isFinite(lo)) { lo = 0; hi = 1; } const pad = (hi - lo) * 0.08 || 0.1;
      g.rect(b.x, b.y, b.w, b.h, { fill: '#ffffff' });
      const S = panel(g, f, b, xr, [lo - pad, hi + pad], {});
      shade(b, S.X);
      g.clip(b.x, b.y - 1, b.w, b.h + 2); g.path(trace(S.X, S.Y, sig.t, sig.y, a, e, b.w), { stroke: '#374151', lw: Math.max(1, f.lw - 0.6) }); g.unclip();
      frameOf(g, b);
      g.text(sig.name + (sig.unit ? ' (' + sig.unit + ')' : ''), b.x + 7, b.y + 5, { size: f.font - 1, bold: true, fill: '#374151', base: 'top' });
    }
    g.text(f.xlab || 'Time (s)', L + (w - L - Rm) / 2, h - 6, { size: f.font, bold: true, anchor: 'middle', base: 'bottom' });
    if (emgPanels.length) g.text(f.ylab || (rawOnly ? 'EMG (µV)' : R.ni.lab), 14, top + (emgPanels.length * (ph + gap) - gap) / 2, { size: f.font, bold: true, anchor: 'middle', base: 'middle', rot: -90 });
    return '';
  }

  if (!R.reps.length) return 'This figure is made from the ' + wd.many + ': find or mark them in 2. Reps and phases first.';

  if (f.type === 'pct') {
    const C = compute(R, 'reps'), wf = C.wf, wf2 = R2 && R2.reps.length ? waveforms(R2, R2.reps) : null;
    const ok = chs.filter((m) => wf[m.k] && !wf[m.k].none);
    if (!ok.length) return 'These muscles are not normalised yet (see 1. Setup), so there is no average to draw.';
    const cmp = (m) => { if (!wf2) return null; const k2 = R2.pr.ch.findIndex((c) => c.key === m.key); return k2 >= 0 && wf2[k2] && !wf2[k2].none ? wf2[k2] : null; };
    const stack = f.layout === 'stack', panels = stack ? ok.map((m) => [m]) : [ok];
    const mx = (m) => { const s = wf[m.k], c2 = cmp(m); let v = 0; for (let j = 0; j < 101; j++) { v = Math.max(v, s.mean[j] + (on.sd ? s.sd[j] : 0)); if (on.each) s.curves.forEach((cv) => { if (cv[j] > v) v = cv[j]; }); if (c2) v = Math.max(v, c2.mean[j]); } return v; };
    const all = Math.max(...ok.map(mx), 1e-9);
    // where the phases change, on average, as % of the rep
    const cuts = []; Object.values(byRep).forEach((ps) => { const r = R.reps[ps[0].rep]; ps.slice(1).forEach((p, j) => { (cuts[j] = cuts[j] || []).push((p.i0 - r.i0) / (r.i1 - r.i0) * 100); }); });
    const cm = cuts.map((c) => mean(c)), edges = [0].concat(cm, [100]);
    if (f.legend) {
      if (!stack) ok.forEach((m) => items.push({ label: nm(m) + ' (n = ' + wf[m.k].n + ')', col: col[m.key] }));
      if (on.sd) items.push({ label: '± 1 SD', col: '#9ca3af', box: true, alpha: 0.45 });
      if (on.each) items.push({ label: 'each ' + wd.one, col: '#6b7280', lw: 1 });
      if (wf2) { items.push({ label: trialLabel(R.t), col: '#111827' }); items.push({ label: trialLabel(R2.t), col: '#111827', dash: [6, 4] }); }
      if (on.phases && cm.length) phaseItems();
      if (on.onoff) items.push({ label: 'muscle on (above ' + SET().onPct + '% of its peak)', col: '#6b7280', lw: 5 });
      top += legend(g, f, items, L, top, w - L - Rm);
    }
    const np = panels.length, gap = 10, ph = (h - top - bot - gap * (np - 1)) / np;
    if (ph < 30) return 'Too many panels for this size: choose a taller size, fewer muscles or all on one panel.';
    const xs = Float64Array.from({ length: 101 }, (_, j) => j);
    panels.forEach((ms, pj) => {
      const b = { x: L, y: top + pj * (ph + gap), w: w - L - Rm, h: ph }, ymx = +f.ymax > 0 ? +f.ymax : (f.sharedY || !stack ? all : Math.max(...ms.map(mx), 1e-9)) * 1.08;
      g.rect(b.x, b.y, b.w, b.h, { fill: '#ffffff' });
      const S = panel(g, f, b, [0, 100], [0, ymx], { noX: pj < np - 1 });
      g.clip(b.x, b.y - 1, b.w, b.h + 2);
      if (on.phases && cm.length) for (let j = 0; j < edges.length - 1; j++) g.rect(S.X(edges[j]), b.y, S.X(edges[j + 1]) - S.X(edges[j]), b.h, { fill: PHASE_COLS[j % PHASE_COLS.length], alpha: 0.14 });
      cm.forEach((c) => g.path([S.X(c), b.y, S.X(c), b.y + b.h], { stroke: POINT_COL.phase, lw: 1.2, dash: [2, 3] }));
      ms.forEach((m, mj) => {
        const s = wf[m.k], cl = col[m.key], c2 = cmp(m);
        if (on.sd) { const p = []; for (let j = 0; j < 101; j++) p.push(S.X(j), S.Y(s.mean[j] + s.sd[j])); for (let j = 100; j >= 0; j--) p.push(S.X(j), S.Y(Math.max(0, s.mean[j] - s.sd[j]))); g.path(p, { fill: cl, alpha: 0.18 }); }
        if (on.each) s.curves.forEach((cv) => g.path(trace(S.X, S.Y, xs, cv, 0, 100, 1e9), { stroke: cl, lw: 0.9, alpha: 0.4 }));
        if (c2) g.path(trace(S.X, S.Y, xs, c2.mean, 0, 100, 1e9), { stroke: cl, lw: f.lw, dash: [6, 4] });
        if (on.mean) g.path(trace(S.X, S.Y, xs, s.mean, 0, 100, 1e9), { stroke: cl, lw: f.lw + 0.4 });
        const a = on.onoff && C.avgOn && C.avgOn[m.k];
        if (a) for (let j = 0; j < 101; j++) { if (!a.mask[j] || (j && a.mask[j - 1])) continue; let e = j; while (e < 100 && a.mask[e + 1]) e++; const yy = b.y + b.h - 4 - (stack ? 0 : mj * 6); g.path([S.X(Math.max(0, j - 0.5)), yy, S.X(Math.min(100, e + 0.5)), yy], { stroke: cl, lw: 4, dash: [1000, 1] }); }
      });
      g.unclip();
      frameOf(g, b);
      if (stack) g.text(nm(ms[0]) + ' (n = ' + wf[ms[0].k].n + ')', b.x + 7, b.y + 5, { size: f.font - 1, bold: true, fill: col[ms[0].key], base: 'top' });
    });
    g.text(f.xlab || '% of the ' + wd.one + (R.cycles ? ' (0 = ' + wd.start.toLowerCase() + ')' : ''), L + (w - L - Rm) / 2, h - 6, { size: f.font, bold: true, anchor: 'middle', base: 'bottom' });
    g.text(f.ylab || R.ni.lab, 14, top + (h - top - bot) / 2, { size: f.font, bold: true, anchor: 'middle', base: 'middle', rot: -90 });
    return '';
  }

  // bars: the mean (± SD) across the reps of each muscle's mean, peak or iEMG, for the whole rep or each phase
  const split = on.byPhase && nPh > 1, groups = split ? Array.from({ length: nPh }, (_, j) => ({ name: phName(j), wins: R.phases.filter((p) => p.phase === j) })) : [{ name: '', wins: R.reps }];
  const val = (wn, m) => { const s = R.stats(wn)[m.k]; return s[f.metric]; };
  const D = groups.map((gp) => chs.map((m) => { const v = gp.wins.map((wn) => val(wn, m)); return { m, v, mu: mean(v), s: sd(v) }; }));
  let hi = 0; D.forEach((gp) => gp.forEach((d) => { hi = Math.max(hi, (d.mu || 0) + (on.err && Number.isFinite(d.s) ? d.s : 0), on.each ? Math.max(0, ...d.v) : 0); }));
  if (f.legend && split) { chs.forEach((m) => items.push({ label: nm(m), col: col[m.key], box: true })); top += legend(g, f, items, L, top, w - L - Rm); }
  const b = { x: L, y: top, w: w - L - Rm, h: h - top - bot };
  g.rect(b.x, b.y, b.w, b.h, { fill: '#ffffff' });
  const S = panel(g, f, b, [0, 1], [0, +f.ymax > 0 ? +f.ymax : (hi || 1) * 1.1], { cats: true });
  const gw = b.w / groups.length, bw = Math.min(70, gw * 0.8 / chs.length);
  D.forEach((gp, gj) => {
    const x0 = b.x + gj * gw + (gw - bw * chs.length) / 2;
    gp.forEach((d, j) => {
      const cx = x0 + (j + 0.5) * bw, cl = col[d.m.key];
      if (Number.isFinite(d.mu)) g.rect(cx - bw * 0.4, S.Y(d.mu), bw * 0.8, S.Y(0) - S.Y(d.mu), { fill: cl, alpha: on.each ? 0.55 : 0.9 });
      if (on.err && Number.isFinite(d.s) && d.s > 0) { const a = S.Y(d.mu + d.s), e = S.Y(Math.max(0, d.mu - d.s)); g.path([cx, a, cx, e], { stroke: '#111827', lw: 1.3 }); g.path([cx - 5, a, cx + 5, a], { stroke: '#111827', lw: 1.3 }); g.path([cx - 5, e, cx + 5, e], { stroke: '#111827', lw: 1.3 }); }
      if (on.each) d.v.forEach((v, q) => { if (Number.isFinite(v)) g.circle(cx + ((q % 5) - 2) * bw * 0.07, S.Y(v), 2.6, { fill: '#ffffff', stroke: '#111827', lw: 1 }); });
      if (!split) g.text(nm(d.m), cx, b.y + b.h + 7, { size: f.font - 1, bold: true, anchor: 'middle', base: 'top', fill: cl });
    });
    if (split) g.text(groups[gj].name, b.x + (gj + 0.5) * gw, b.y + b.h + 7, { size: f.font - 1, bold: true, anchor: 'middle', base: 'top' });
  });
  frameOf(g, b);
  const u = D[0][0] && R.N[D[0][0].m.k] ? unit : 'µV', ml = { mean: 'Mean EMG', peak: 'Peak EMG', iemg: 'iEMG' }[f.metric];
  g.text(f.xlab || (split ? 'Phase of the ' + wd.one : 'Muscle') + ' (mean ' + (on.err ? '± SD ' : '') + 'of ' + R.reps.length + ' ' + (R.reps.length > 1 ? wd.many : wd.one) + ')', L + b.w / 2, h - 6, { size: f.font, bold: true, anchor: 'middle', base: 'bottom' });
  g.text(f.ylab || ml + ' (' + u + (f.metric === 'iemg' ? '·s' : '') + ')', 14, b.y + b.h / 2, { size: f.font, bold: true, anchor: 'middle', base: 'middle', rot: -90 });
  return '';
}

function other() { const f = F(); const t = f.cmp && A.session.trials.find((q) => q.id === f.cmp); if (!t || t === A.S) return null; try { const R2 = analyse(t); return R2.ok ? R2 : null; } catch (e) { return null; } }
function draw() {
  const cv = $('figCv'); if (!cv || !A.R || !A.R.ok) return;
  const f = F(), [, w, h] = SIZES[f.size] || SIZES.slide, dpr = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
  cv.width = w * dpr; cv.height = h * dpr; cv.style.aspectRatio = w + ' / ' + h; cv.style.maxWidth = w + 'px';
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  let msg = ''; try { msg = build(canvasG(ctx), w, h, f, A.R, other()); } catch (e) { msg = 'Could not draw this figure (' + (e.message || e) + ').'; console.error(e); }
  $('figMsg').innerHTML = msg ? '<span class="bad">' + esc(msg) + '</span>' : '';
  if (msg) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#6b7280'; ctx.font = '16px ' + FONT; ctx.textAlign = 'center'; ctx.fillText('Nothing to draw yet', w / 2, h / 2); }
}
function png(scale) {
  const f = F(), [, w, h] = SIZES[f.size] || SIZES.slide, c = document.createElement('canvas'); c.width = w * scale; c.height = h * scale;
  const ctx = c.getContext('2d'); ctx.setTransform(scale, 0, 0, scale, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  if (build(canvasG(ctx), w, h, f, A.R, other())) { status('Nothing to save yet.'); return; }
  c.toBlob((bl) => { download(baseName() + '_figure.png', bl); status('Figure saved as a PNG (' + c.width + ' × ' + c.height + ' pixels).'); }, 'image/png');
}
function svg() {
  const f = F(), [, w, h] = SIZES[f.size] || SIZES.slide, g = svgG(w, h);
  if (build(g, w, h, f, A.R, other())) { status('Nothing to save yet.'); return; }
  download(baseName() + '_figure.svg', new Blob([g.done()], { type: 'image/svg+xml' })); status('Figure saved as an SVG: it stays sharp at any size, and you can still edit it in PowerPoint, Inkscape or Illustrator.');
}
export function figureSvg(w, h) { const g = svgG(w, h), m = build(g, w, h, F(), A.R, other()); return m ? null : g.done(); } // for tests

export function renderFigure() {
  const el = $('figBox'); if (!el) return;
  const R = A.R; if (!R || !R.ok) { el.innerHTML = '<p class="muted">Open a file first.</p>'; return; }
  if (R.mvic) { el.innerHTML = '<p class="muted">This is an MVIC file. Open a task trial to make a figure.</p>'; return; }
  const f = F(), wd = W(), col = colourOf(f, R.pr.ch.map((c) => c.key));
  const chip = (attr, k, lab, act, extra) => '<button type="button" class="chip' + (act ? ' active' : '') + '" ' + attr + '="' + esc(k) + '" aria-pressed="' + !!act + '"' + (extra || '') + '>' + lab + '</button>';
  const others = A.session.trials.filter((t) => t.role !== 'mvic' && t !== A.S);
  let h = '<p class="lead">Build a figure for your report or slides. Switch things on and off and watch it change, then save it as a picture.</p><div class="figgrid"><div class="figctl">';
  h += '<p class="fl">1. What kind of figure?</p><div class="chips">' + Object.entries(TYPES).map(([k, l]) => chip('data-ft', k, k === 'pct' ? l + wd.one + ' (0&ndash;100%)' : l, f.type === k)).join('') + '</div>'
    + '<p class="muted small">' + { time: 'The EMG as it was recorded. It shows what the graph at the top shows: zoom there to choose the part you want.', pct: 'Every ' + wd.one + ' stretched to 0&ndash;100% and averaged: the usual way to show a repeated movement.', bars: 'One number for each muscle: the mean across the ' + wd.many + ', with the spread between them.' }[f.type] + '</p>';
  h += '<p class="fl">2. What to show</p><div class="chips">' + LAYERS[f.type].map(([k, l]) => chip('data-fl', k, l.replace(/\bRep\b/, wd.One).replace(/\brep\b/, wd.one), f.on[k])).join('') + '</div>';
  h += '<p class="fl">3. Which muscles</p><div class="chips">' + R.pr.ch.map((c) => chip('data-fm', c.key, esc(muscle(c.key).short), !f.hide[c.key], f.hide[c.key] ? '' : ' style="background:' + col[c.key] + ';border-color:' + col[c.key] + '"')).join('') + '</div>';
  h += '<p class="fl">4. Layout</p><div class="row tight">';
  if (f.type !== 'bars') h += '<select id="fgLayout" class="mini" style="width:auto"><option value="stack"' + (f.layout === 'stack' ? ' selected' : '') + '>One panel for each muscle</option><option value="overlay"' + (f.layout === 'overlay' ? ' selected' : '') + '>Every muscle on one panel</option></select>';
  if (f.type === 'time') h += '<select id="fgRange" class="mini" style="width:auto"><option value="view"' + (f.range === 'view' ? ' selected' : '') + '>The part the graph above shows</option><option value="all"' + (f.range === 'all' ? ' selected' : '') + '>The whole trial</option></select>';
  if (f.type === 'bars') h += '<select id="fgMetric" class="mini" style="width:auto">' + [['mean', 'Mean EMG'], ['peak', 'Peak EMG'], ['iemg', 'iEMG (area)']].map(([v, l]) => '<option value="' + v + '"' + (f.metric === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>';
  if (f.type === 'pct' && others.length) h += '<select id="fgCmp" class="mini" style="width:auto;max-width:16rem"><option value="">Compare with another trial&hellip;</option>' + others.map((t) => '<option value="' + esc(t.id) + '"' + (f.cmp === t.id ? ' selected' : '') + '>' + esc(trialLabel(t)) + ' (dashed)</option>').join('') + '</select>';
  h += '<select id="fgSize" class="mini" style="width:auto">' + Object.entries(SIZES).map(([k, v]) => '<option value="' + k + '"' + (f.size === k ? ' selected' : '') + '>' + v[0] + '</option>').join('') + '</select></div>';
  h += '<div class="chks">' + [['legend', 'Legend'], ['grid', 'Grid lines'], ['sharedY', 'Same y scale for every muscle'], ['cb', 'Colour-blind-safe colours']].map(([k, l]) => '<label class="inline"><input type="checkbox" data-fc="' + k + '"' + (f[k] ? ' checked' : '') + '> ' + l + '</label>').join('') + '</div>';
  h += '<p class="fl">5. Labels <span class="muted" style="font-weight:400">(leave empty for the usual ones)</span></p><div class="row">'
    + '<div><label for="fgTitle">Title</label><input type="text" id="fgTitle" value="' + esc(f.title) + '" placeholder="e.g. ' + esc(trialLabel(A.S)) + '"></div>'
    + '<div><label for="fgY">y axis</label><input type="text" id="fgY" value="' + esc(f.ylab) + '" placeholder="' + esc(R.ni.lab) + '"></div>'
    + '<div><label for="fgX">x axis</label><input type="text" id="fgX" value="' + esc(f.xlab) + '" placeholder="' + (f.type === 'time' ? 'Time (s)' : f.type === 'pct' ? '% of the ' + wd.one : 'Muscle') + '"></div></div>'
    + '<div class="row"><div><label for="fgLw">Line thickness</label><input type="range" id="fgLw" min="1" max="4" step="0.5" value="' + f.lw + '"></div><div><label for="fgFont">Text size</label><input type="range" id="fgFont" min="11" max="20" step="1" value="' + f.font + '"></div>'
    + '<div><label for="fgYmax">Top of the y axis</label><input type="number" id="fgYmax" min="0" step="any" value="' + esc(f.ymax) + '" placeholder="automatic"></div></div>';
  h += '<p class="fl">6. Save it</p><div class="row tight"><button type="button" class="btn accent" id="fgPng">Picture (PNG)</button><button type="button" class="btn" id="fgSvg">Editable drawing (SVG)</button><button type="button" class="btn ghost small" id="fgReset">Start again</button></div>'
    + '<p class="muted small">PNG goes straight into Word or PowerPoint and is saved at three times the size shown, so it prints sharply. SVG stays sharp at any size and can be edited afterwards. Write your own caption underneath it in your report: say what the lines and shading are, and how many ' + wd.many + ' it shows.</p>';
  h += '</div><div class="figprev"><canvas id="figCv" role="img" aria-label="Preview of the figure"></canvas><p class="muted small" id="figMsg" role="status"></p></div></div>';
  el.innerHTML = h;
  const re = (full) => { save(); if (full) renderFigure(); else draw(); };
  el.querySelectorAll('[data-ft]').forEach((b) => b.addEventListener('click', () => { f.type = b.getAttribute('data-ft'); re(true); }));
  el.querySelectorAll('[data-fl]').forEach((b) => b.addEventListener('click', () => { const k = b.getAttribute('data-fl'); f.on[k] = !f.on[k]; re(true); }));
  el.querySelectorAll('[data-fm]').forEach((b) => b.addEventListener('click', () => { const k = b.getAttribute('data-fm'); f.hide[k] = !f.hide[k]; re(true); }));
  el.querySelectorAll('[data-fc]').forEach((c) => c.addEventListener('change', function () { f[this.getAttribute('data-fc')] = this.checked; re(this.getAttribute('data-fc') === 'cb'); }));
  [['fgLayout', 'layout'], ['fgRange', 'range'], ['fgMetric', 'metric'], ['fgCmp', 'cmp'], ['fgSize', 'size']].forEach(([id, k]) => { if ($(id)) $(id).addEventListener('change', function () { f[k] = this.value; re(); }); });
  [['fgTitle', 'title'], ['fgY', 'ylab'], ['fgX', 'xlab'], ['fgYmax', 'ymax']].forEach(([id, k]) => $(id).addEventListener('input', function () { f[k] = this.value; re(); }));
  [['fgLw', 'lw'], ['fgFont', 'font']].forEach(([id, k]) => $(id).addEventListener('input', function () { f[k] = +this.value; re(); }));
  $('fgPng').addEventListener('click', () => png(3));
  $('fgSvg').addEventListener('click', svg);
  $('fgReset').addEventListener('click', () => { A.fig = defaults(); re(true); });
  draw();
}
export function figureViewChanged() { const f = F(); if (f.type === 'time' && f.range === 'view') draw(); }
