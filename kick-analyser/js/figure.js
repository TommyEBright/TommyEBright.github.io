// The figure builder (tab "4. Figure"): one kick, kicks compared (one signal or four panels), the centre of pressure
// path under the foot, or a bar chart of any result. Every choice shows straight away; PNG, SVG or copy.
import { A, $, esc, status, download, trialLabel, kickColour, cur, safe } from './state.js?v=1.0.0';
import { VARS, results, valOf, unitOf, SIG, sigLabel, signal } from './analyse.js?v=1.0.0';
import { FONTS, canvasG, svgG, axes, range, padRange, line, band, legend, legendH, textW } from './draw.js?v=1.0.0';

const SIZES = { slide: ['Slide (16:9)', 960, 540], report: ['Report (4:3)', 800, 600], wide: ['Wide and short', 1000, 400], poster: ['Poster (3:2)', 1080, 720], tall: ['Tall', 720, 960], square: ['Square', 800, 800], journal1: ['Journal, one column', 700, 520], journal2: ['Journal, two columns', 1400, 700], custom: ['Custom size', 0, 0] };
const TYPES = { one: 'One kick', curves: 'Kicks compared', four: 'Four panels', path: 'COP path under the foot', bar: 'Bar chart of a result' };
const DASHES = [null, [8, 4], [2, 3], [8, 3, 2, 3], [14, 5], [4, 4]];
function defaults() {
  return { type: 'four', trial: '', panels: { Fz: true, AP: true, ML: false, cAP: true, cML: true }, sig: 'Fz', trials: {}, show: 'each', xm: 'ms', ball: true, stance: true,
    bar: 'pkFz', dots: true, legend: true, legendPos: 'top', grid: true, cb: false, dash: false, letters: true, title: '', xlab: '', ylab: '', size: 'slide', W: 960, H: 540, lw: 2, font: 14, fontFam: 'Arial', bg: 'white',
    lim: { x0: '', x1: '', y0: '', y1: '' } };
}
function F() {
  if (!A.fig) { A.fig = defaults(); try { const j = JSON.parse(localStorage.getItem('ka-fig')); if (j) Object.assign(A.fig, j, { trials: {}, trial: '', panels: Object.assign(A.fig.panels, j.panels || {}), lim: Object.assign(A.fig.lim, j.lim || {}) }); } catch (e) { /* ignore */ } }
  return A.fig;
}
function save() { try { localStorage.setItem('ka-fig', JSON.stringify(Object.assign({}, A.fig, { trials: {}, trial: '' }))); } catch (e) { /* ignore */ } }
const sizeOf = (f) => (f.size === 'custom' ? [Math.max(300, Math.min(4000, +f.W || 960)), Math.max(200, Math.min(4000, +f.H || 540))] : SIZES[f.size].slice(1));
const num = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(+v) ? null : +v);
const opt = (v, l, c) => '<option value="' + esc(v) + '"' + (String(v) === String(c) ? ' selected' : '') + '>' + l + '</option>';
const sel = (id, list, c) => '<select id="' + id + '" class="mini" style="width:auto">' + list.map(([v, l]) => opt(v, l, c)).join('') + '</select>';
const chip = (attr, k, lab, act) => '<button type="button" class="chip' + (act ? ' active' : '') + '" ' + attr + '="' + esc(k) + '" aria-pressed="' + !!act + '">' + lab + '</button>';
const AND = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);

function chosen() { const f = F(); return A.trials.filter((t) => t.p && f.trials[t.id] !== false); }
function kicksOf(ts) { const o = []; ts.forEach((t) => { if (!o.includes(t.labels.kick)) o.push(t.labels.kick); }); return o; }
function colOf(k) { return kickColour(k, F().cb); }
function stats(a) { a = a.filter(Number.isFinite); const n = a.length; if (!n) return { m: NaN, sd: NaN, n: 0 }; const m = a.reduce((x, y) => x + y) / n; return { m, sd: n > 1 ? Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (n - 1)) : NaN, n }; }
function xOf(tr, xm) { const P = tr.p, n = P.e - P.s + 1, x = new Float64Array(n); for (let i = 0; i < n; i++) x[i] = xm === 'pct' ? i / (n - 1) * 100 : i / tr.fs * 1000; return x; }
function ballX(tr, xm) { const P = tr.p; if (P.b == null) return NaN; return xm === 'pct' ? (P.b - P.s) / (P.e - P.s) * 100 : (P.b - P.s) / tr.fs * 1000; }
function interp(x, y, xi) { if (xi < x[0] || xi > x[x.length - 1]) return NaN; let lo = 0, hi = x.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (x[m] <= xi) lo = m; else hi = m; } const fr = (xi - x[lo]) / ((x[hi] - x[lo]) || 1); return y[lo] + (y[hi] - y[lo]) * fr; }

// lines for one signal across the chosen trials: each trial, or the mean (and SD) per kick type
function curves(k, f) {
  const ts = chosen(), ks = kicksOf(ts), out = [], marks = [];
  ks.forEach((kk, ki) => {
    const g = ts.filter((t) => t.labels.kick === kk), dash = f.dash ? DASHES[ki % DASHES.length] : null;
    if (f.show === 'each' || g.length === 1) {
      g.forEach((tr, j) => { const y = signal(tr, k); if (!y) return; out.push({ x: xOf(tr, f.xm), y, c: colOf(kk), dash, l: kk + (g.length > 1 ? ' (n = ' + g.length + ')' : ''), alpha: g.length > 1 ? 0.8 : 1 }); if (f.ball) marks.push({ x: ballX(tr, f.xm), c: colOf(kk) }); });
    } else {
      const grid = []; if (f.xm === 'pct') for (let i = 0; i <= 100; i++) grid.push(i); else { const mx = Math.max(...g.map((t) => (t.p.e - t.p.s) / t.fs * 1000)); for (let i = 0; i <= mx; i++) grid.push(i); }
      const ys = g.map((tr) => { const y = signal(tr, k); if (!y) return null; const x = xOf(tr, f.xm); return grid.map((xi) => interp(x, y, xi)); }).filter(Boolean);
      if (!ys.length) return;
      const m = [], lo = [], hi = []; grid.forEach((_, i) => { const st = stats(ys.map((y) => y[i])); m.push(st.n ? st.m : NaN); lo.push(st.n > 1 ? st.m - st.sd : NaN); hi.push(st.n > 1 ? st.m + st.sd : NaN); });
      out.push({ x: grid, y: m, lo, hi, c: colOf(kk), dash, l: kk + ' (mean ± SD, n = ' + ys.length + ')' });
      if (f.ball) { const bx = g.map((t) => ballX(t, f.xm)).filter(Number.isFinite); if (bx.length) marks.push({ x: bx.reduce((a, b) => a + b) / bx.length, c: colOf(kk) }); }
    }
  });
  return { out, marks };
}
function uniq(items) { const s = new Set(); return items.filter((it) => (s.has(it.l) ? false : (s.add(it.l), true))); }

function panel(g, X, Y, W, H, series, marks, f, o) {
  const xr = padRange(range(series, 'x'), 0, o.fixX ? [num(f.lim.x0), num(f.lim.x1)] : null);
  const yr = padRange(range(series, 'y', true), 0.06, o.fixY ? [num(f.lim.y0), num(f.lim.y1)] : null);
  const ax = axes(g, X, Y, W, H, xr, yr, { fs: f.font, grid: f.grid, zero: true, xlab: o.xlab, ylab: o.ylab });
  g.clip(X, Y, W, H);
  if (o.shade) o.shade(ax);
  series.forEach((q) => { if (q.lo) band(g, q.x, q.lo, q.hi, ax.sx, ax.sy, { fill: q.c, alpha: 0.18 }); });
  series.forEach((q) => line(g, q.x, q.y, ax.sx, ax.sy, { stroke: q.c, lw: f.lw, dash: q.dash, alpha: q.alpha }));
  (marks || []).forEach((m) => { if (Number.isFinite(m.x)) g.path([ax.sx(m.x), Y, ax.sx(m.x), Y + H], { stroke: m.c, lw: Math.max(1, f.lw * 0.6), dash: [5, 4] }); });
  g.unclip();
  if (o.letter) g.text(o.letter, X - o.left + 2, Y - 6, { size: f.font * 1.2, bold: true });
  return ax;
}
const xLab = (f) => f.xlab || (f.xm === 'pct' ? 'Stance (%)' : 'Time from foot contact (ms)');

export function drawFigure(g, W, H, f) {
  const fs = f.font, top0 = (f.title ? fs * 2.2 : 10);
  if (f.title) g.text(f.title, W / 2, fs * 0.4, { size: fs * 1.2, bold: true, anchor: 'middle', base: 'top' });
  const ts = chosen();
  if (!ts.length) { g.text('Add or choose some kicks to see the figure', W / 2, H / 2, { size: fs, anchor: 'middle', fill: '#64748b' }); return; }
  const L = fs * 5.2, B = fs * 3.6, R = 18;
  if (f.type === 'one') {
    const tr = A.trials.find((t) => t.id === f.trial) || ts[0], P = tr.p;
    const ks = Object.keys(SIG).filter((k) => f.panels[k] && P[k]);
    const cols = { Fz: '#1d4ed8', AP: '#dc2626', ML: '#7c3aed', cAP: '#0f766e', cML: '#d97706', Tz: '#475569' };
    const items = ks.map((k) => ({ l: SIG[k].l, c: cols[k] }));
    const lh = f.legend && f.legendPos === 'top' ? legendH(items, W - L - R, fs, g.font) : 0;
    if (f.legend && f.legendPos === 'top') legend(g, items, L, top0, W - L - R, fs, 'top', f.lw);
    const top = top0 + lh + 6, gap = fs * 1.2, ph = (H - top - B - gap * (ks.length - 1)) / Math.max(1, ks.length);
    const x = xOf(tr, f.xm), bx = ballX(tr, f.xm);
    ks.forEach((k, i) => {
      const Y = top + i * (ph + gap), last = i === ks.length - 1;
      panel(g, L, Y, W - L - R, ph, [{ x, y: signal(tr, k), c: cols[k] }], f.ball ? [{ x: bx, c: '#111827' }] : [], f, { xlab: last ? xLab(f) : '', ylab: SIG[k].short + ' (' + (SIG[k].f ? (A.units === 'BW' ? 'BW' : 'N') : k === 'Tz' ? 'N·m' : 'cm') + ')', fixX: true, fixY: ks.length === 1 });
    });
    if (f.legend && f.legendPos === 'inside') legend(g, items, L, top, W - L - R, fs, 'inside', f.lw);
    return;
  }
  if (f.type === 'curves' || f.type === 'four') {
    const ks4 = f.type === 'four' ? ['Fz', 'AP', 'cAP', 'cML'] : [f.sig];
    const first = curves(ks4[0], f), items = uniq(first.out.map((q) => ({ l: q.l, c: q.c, dash: q.dash })));
    if (f.ball && first.marks.some((m) => Number.isFinite(m.x))) items.push({ l: 'Ball contact', c: '#475569', dash: [5, 4] });
    const lh = f.legend && f.legendPos === 'top' ? legendH(items, W - L - R, fs, g.font) : 0;
    if (f.legend && f.legendPos === 'top') legend(g, items, L, top0, W - L - R, fs, 'top', f.lw);
    const top = top0 + lh + (f.type === 'four' && f.letters ? fs * 1.3 : 6);
    if (f.type === 'curves') {
      panel(g, L, top, W - L - R, H - top - B, first.out, first.marks, f, { xlab: xLab(f), ylab: f.ylab || sigLabel(f.sig, ts[0]), fixX: true, fixY: true });
      if (f.legend && f.legendPos === 'inside') legend(g, items, L, top, W - L - R, fs, 'inside', f.lw);
    } else {
      const gx = fs * 1.5, gy = fs * 1.6, pw = (W - 2 * L - R - gx) / 2, ph = (H - top - 2 * B - gy) / 2;
      const short = { Fz: 'Vertical force', AP: 'Front–back force', cAP: 'COP front–back', cML: 'COP side to side' };
      ks4.forEach((k, i) => {
        const c = i === 0 ? first : curves(k, f), X = L + (i % 2) * (pw + L + gx), Y = top + Math.floor(i / 2) * (ph + B + gy);
        const u = SIG[k].f ? (A.units === 'BW' ? 'BW' : 'N') : 'cm';
        panel(g, X, Y, pw, ph, c.out, c.marks, f, { xlab: xLab(f), ylab: short[k] + ' (' + u + ')', fixX: true, letter: f.letters ? 'ABCD'[i] : '', left: L });
      });
      if (f.legend && f.legendPos === 'inside') legend(g, items, L, top, pw, fs, 'inside', f.lw);
    }
    return;
  }
  if (f.type === 'path') {
    const ks = kicksOf(ts), series = [];
    ts.forEach((tr) => {
      const P = tr.p; if (P.cs < 0) return; let e = P.ce; if (A.set.win === 'ball' && P.b != null) e = Math.min(P.ce, P.b);
      const x = [], y = []; for (let i = P.cs; i <= e; i++) { x.push(P.cML[i]); y.push(P.cAP[i]); }
      const k = tr.labels.kick, n = ts.filter((t) => t.labels.kick === k).length;
      series.push({ x, y, c: colOf(k), dash: f.dash ? DASHES[ks.indexOf(k) % DASHES.length] : null, l: k + (n > 1 ? ' (n = ' + n + ')' : ''), bi: f.ball && P.b != null && P.b >= P.cs && P.b <= e ? P.b - P.cs : null });
    });
    const items = uniq(series.map((q) => ({ l: q.l, c: q.c, dash: q.dash })));
    items.push({ l: 'start and end' + (series.some((q) => q.bi !== null) ? ', × ball contact' : ''), marker: true });
    const lh = f.legend && f.legendPos === 'top' ? legendH(items, W - L - R, fs, g.font) : 0;
    if (f.legend && f.legendPos === 'top') legend(g, items, L, top0, W - L - R, fs, 'top', f.lw);
    const top = top0 + lh + 6, pw = W - L - R, ph = H - top - B;
    let xr = range(series, 'x'), yr = range(series, 'y');
    const sc = Math.min(pw / ((xr[1] - xr[0]) * 1.15 || 1), ph / ((yr[1] - yr[0]) * 1.12 || 1)), cx = (xr[0] + xr[1]) / 2, cy = (yr[0] + yr[1]) / 2;
    xr = [cx - pw / 2 / sc, cx + pw / 2 / sc]; yr = [cy - ph / 2 / sc, cy + ph / 2 / sc];
    if ([f.lim.x0, f.lim.x1, f.lim.y0, f.lim.y1].some((v) => num(v) !== null)) { xr = padRange(xr, 0, [num(f.lim.x0), num(f.lim.x1)]); yr = padRange(yr, 0, [num(f.lim.y0), num(f.lim.y1)]); }
    const P0 = ts[0].p;
    const ax = axes(g, L, top, pw, ph, xr, yr, { fs, grid: f.grid, zero: false, xlab: f.xlab || 'COP side to side (cm, + = ' + (P0.known ? 'lateral' : P0.mlName) + ')', ylab: f.ylab || 'COP front–back (cm, + = towards toes)' });
    g.clip(L, top, pw, ph);
    series.forEach((q) => {
      line(g, q.x, q.y, ax.sx, ax.sy, { stroke: q.c, lw: f.lw, dash: q.dash });
      const n = q.x.length - 1, r = 2.5 + f.lw;
      g.circle(ax.sx(q.x[0]), ax.sy(q.y[0]), r, { fill: '#fff', stroke: q.c, lw: f.lw });
      g.rect(ax.sx(q.x[n]) - r, ax.sy(q.y[n]) - r, 2 * r, 2 * r, { fill: q.c });
      if (q.bi !== null) { const X = ax.sx(q.x[q.bi]), Y = ax.sy(q.y[q.bi]); g.path([X - r, Y - r, X + r, Y + r], { stroke: '#111827', lw: f.lw }); g.path([X - r, Y + r, X + r, Y - r], { stroke: '#111827', lw: f.lw }); }
    });
    g.unclip();
    if (f.legend && f.legendPos === 'inside') legend(g, items, L, top, pw, fs, 'inside', f.lw);
    return;
  }
  // bar chart
  const v = VARS.find((q) => q.k === f.bar) || VARS[2], ks = kicksOf(ts);
  const grp = ks.map((k) => { const vals = ts.filter((t) => t.labels.kick === k).map((t) => valOf(v, results(t), t)); return { k, vals, st: stats(vals) }; });
  let lo = 0, hi = 0; grp.forEach((q) => { q.vals.forEach((x) => { if (Number.isFinite(x)) { lo = Math.min(lo, x); hi = Math.max(hi, x); } }); if (q.st.n) { const e = Number.isFinite(q.st.sd) ? q.st.sd : 0; hi = Math.max(hi, q.st.m + e); lo = Math.min(lo, q.st.m - e); } });
  const top = top0 + 6, pw = W - L - R, ph = H - top - B;
  const yr = padRange([lo, hi + (hi - lo) * 0.08], 0, [num(f.lim.y0), num(f.lim.y1)]);
  const ax = axes(g, L, top, pw, ph, [0, 1], yr, { fs, grid: f.grid, zero: true, xt: false, xlab: f.xlab || 'Kick type', ylab: f.ylab || v.l + ' (' + unitOf(v) + ')' });
  const bw = pw / ks.length;
  grp.forEach((q, i) => {
    const cx = L + bw * (i + 0.5), w = bw * 0.55, c = colOf(q.k);
    if (q.st.n) {
      const y0 = ax.sy(Math.max(0, yr[0])), y1 = ax.sy(q.st.m);
      g.rect(cx - w / 2, Math.min(y0, y1), w, Math.abs(y1 - y0), { fill: c, alpha: f.dots && q.st.n > 1 ? 0.8 : 1 });
      g.rect(cx - w / 2, Math.min(y0, y1), w, Math.abs(y1 - y0), { stroke: '#111827', lw: 0.8 });
      if (Number.isFinite(q.st.sd)) { const a = ax.sy(q.st.m - q.st.sd), b = ax.sy(q.st.m + q.st.sd); g.path([cx, a, cx, b], { stroke: '#111827', lw: Math.max(1, f.lw * 0.7) }); g.path([cx - w * 0.15, a, cx + w * 0.15, a], { stroke: '#111827', lw: Math.max(1, f.lw * 0.7) }); g.path([cx - w * 0.15, b, cx + w * 0.15, b], { stroke: '#111827', lw: Math.max(1, f.lw * 0.7) }); }
    }
    if (f.dots && q.st.n > 1) q.vals.forEach((x, j) => { if (Number.isFinite(x)) g.circle(cx + (j - (q.vals.length - 1) / 2) * Math.min(10, w / (q.vals.length + 1)), ax.sy(x), fs * 0.25, { fill: '#fff', stroke: '#111827', lw: 1.2 }); });
    g.text(q.k, cx, top + ph + 7, { size: fs * 0.9, anchor: 'middle', base: 'top' });
  });
}

function caption(f) {
  const ts = chosen(), ks = kicksOf(ts); if (!ks.length) return '';
  const win = A.set.win === 'ball' ? 'from foot contact to ball contact' : 'during stance';
  const multi = ts.length > ks.length, mean = f.show === 'mean' && multi ? ' Lines are the mean for each kick type and shaded bands ± 1 SD.' : '';
  const ball = f.ball && ts.some((t) => t.p.b != null) ? ' Dashed vertical lines mark ball contact.' : '';
  const xs = f.xm === 'pct' ? 'normalised to 100% of stance' : 'from foot contact';
  const P0 = ts[0].p, ml = P0.known ? 'lateral' : 'towards ' + P0.mlName;
  if (f.type === 'one') { const tr = A.trials.find((t) => t.id === f.trial) || ts[0]; return 'Figure X. Forces and centre of pressure (COP) under the support leg for one ' + tr.labels.kick.toLowerCase() + ' kick (' + trialLabel(tr) + '), ' + xs + '. Negative front–back force is braking; COP is shown relative to its position at foot contact.' + ball; }
  if (f.type === 'curves') return 'Figure X. ' + SIG[f.sig].l + ' under the support leg ' + win + ' for the ' + AND(ks) + ' kicks, ' + xs + '.' + mean + ball + (f.sig === 'AP' ? ' Negative values are braking and positive values propulsion.' : f.sig[0] === 'c' ? ' COP is relative to its position at foot contact.' : '');
  if (f.type === 'four') return 'Figure X. Support leg (A) vertical force, (B) front–back force (negative = braking), (C) front–back centre of pressure (COP; positive = towards the toes) and (D) side-to-side COP (positive = ' + ml + ') for the ' + AND(ks) + ' kicks, ' + xs + '. COP is relative to its position at foot contact.' + mean + ball;
  if (f.type === 'path') return 'Figure X. Centre of pressure path under the support foot ' + win + ' for the ' + AND(ks) + ' kicks, seen from above. Open circles mark the start (foot contact) and filled squares the end. Positive front–back is towards the toes and positive side to side is ' + ml + '.';
  const v = VARS.find((q) => q.k === f.bar); return 'Figure X. ' + v.l + ' (' + unitOf(v) + ') of the support leg for each kick type' + (multi ? ', mean ± SD with each trial as a dot.' : '.');
}

let lastSize = [960, 540];
function draw() {
  const f = F(), [W, H] = sizeOf(f), cv = $('figCv'); if (!cv) return;
  lastSize = [W, H];
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  drawFigure(canvasG(ctx, FONTS[f.fontFam]), W, H, f);
  $('figCap').value = caption(f);
}
function pngBlob(scale) {
  const f = F(), [W, H] = sizeOf(f), c = document.createElement('canvas'); c.width = W * scale; c.height = H * scale;
  const ctx = c.getContext('2d'); ctx.setTransform(scale, 0, 0, scale, 0, 0); if (f.bg === 'white') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); }
  drawFigure(canvasG(ctx, FONTS[f.fontFam]), W, H, f);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}
function fileName() { const f = F(); return 'kick_' + (f.type === 'bar' ? f.bar : f.type === 'curves' ? f.sig : f.type); }

export function renderFigure() {
  const el = $('fbBox'); if (!el) return;
  const f = F(), all = A.trials.filter((t) => t.p);
  if (!all.length) { el.innerHTML = '<p class="muted">Add some kicks first (Add files, or Try a demo).</p>'; return; }
  if (!all.find((t) => t.id === f.trial)) f.trial = (cur() || all[0]).id;
  let h = '<p class="lead">Build a figure for a lab report, poster or slides. Everything you change shows straight away on the right; save it as a PNG (for Word and PowerPoint) or an editable SVG.</p><div class="figgrid"><div class="figctl">';
  h += '<p class="fl">1. What kind of figure?</p><div class="chips">' + Object.entries(TYPES).map(([k, l]) => chip('data-ft', k, l, f.type === k)).join('') + '</div>';
  if (f.type === 'one') {
    h += '<p class="fl">2. Which kick</p><div class="row tight">' + sel('fbTrial', all.map((t) => [t.id, esc(trialLabel(t))]), f.trial) + '</div>';
    h += '<p class="fl">3. Which panels</p><div class="chips">' + Object.entries(SIG).filter(([k]) => all.some((t) => t.p[k])).map(([k, s]) => chip('data-fp', k, s.l, f.panels[k])).join('') + '</div>';
  } else {
    h += '<p class="fl">2. Which kicks</p><div class="chips">' + all.map((t) => chip('data-ftr', t.id, '<span class="dot" style="background:' + colOf(t.labels.kick) + '"></span>' + esc(trialLabel(t)), f.trials[t.id] !== false)).join('') + '</div>';
    if (f.type === 'curves') h += '<p class="fl">3. What to plot</p><div class="row tight">' + sel('fbSig', Object.entries(SIG).filter(([k]) => all.some((t) => t.p[k])).map(([k, s]) => [k, s.l]), f.sig) + '</div>';
    if (f.type === 'bar') h += '<p class="fl">3. Which result</p><div class="row tight">' + sel('fbBar', VARS.map((v) => [v.k, v.l]), f.bar) + '</div><div class="chks"><label class="inline"><input type="checkbox" data-fc="dots"' + (f.dots ? ' checked' : '') + '> Each trial as a dot</label></div>';
  }
  if (f.type === 'one' || f.type === 'curves' || f.type === 'four') {
    h += '<p class="fl">' + (f.type === 'four' ? '3' : '4') + '. Time axis</p><div class="row tight">' + sel('fbXm', [['ms', 'Milliseconds from foot contact'], ['pct', 'Percent of stance (0–100%)']], f.xm)
      + (f.type !== 'one' ? sel('fbShow', [['each', 'Each trial'], ['mean', 'Mean ± SD per kick type']], f.show) : '') + '</div>'
      + '<div class="chks"><label class="inline"><input type="checkbox" data-fc="ball"' + (f.ball ? ' checked' : '') + '> Ball contact line</label>' + (f.type === 'four' ? '<label class="inline"><input type="checkbox" data-fc="letters"' + (f.letters ? ' checked' : '') + '> Panel letters (A–D)</label>' : '') + '</div>';
  }
  if (f.type === 'path') h += '<div class="chks"><label class="inline"><input type="checkbox" data-fc="ball"' + (f.ball ? ' checked' : '') + '> Mark ball contact (×)</label></div>';
  h += '<p class="fl">Units, size and text</p><div class="row tight">' + sel('fbUnits', [['N', 'Force in N'], ['BW', 'Force in bodyweights']], A.units)
    + sel('fbSize', Object.entries(SIZES).map(([k, v]) => [k, v[0] + (v[1] ? ' (' + v[1] + ' × ' + v[2] + ')' : '')]), f.size) + sel('fbFontFam', Object.keys(FONTS).map((k) => [k, k]), f.fontFam) + '</div>';
  if (f.size === 'custom') h += '<div class="row tight"><label class="inline" style="margin:0">Width <input type="number" id="fbW" class="mini" style="width:5.5rem" min="300" max="4000" step="10" value="' + f.W + '"></label><label class="inline" style="margin:0">Height <input type="number" id="fbH" class="mini" style="width:5.5rem" min="200" max="4000" step="10" value="' + f.H + '"> px</label></div>';
  h += '<div class="chks">' + [['legend', 'Legend'], ['grid', 'Grid lines'], ['cb', 'Colour-blind-safe colours (Okabe &amp; Ito)'], ['dash', 'A different line style for each kick (prints in black and white)']].map(([k, l]) => '<label class="inline"><input type="checkbox" data-fc="' + k + '"' + (f[k] ? ' checked' : '') + '> ' + l + '</label>').join('') + '</div>';
  h += '<div class="row tight"><label class="inline" style="margin:0">Legend</label>' + sel('fbLegPos', [['top', 'Above the graph'], ['inside', 'Inside, top right']], f.legendPos) + '<label class="inline" style="margin:0">Background</label>' + sel('fbBg', [['white', 'White'], ['none', 'Transparent (when saved)']], f.bg) + '</div>';
  h += '<div class="row"><div><label for="fbTitle">Title</label><input type="text" id="fbTitle" value="' + esc(f.title) + '" placeholder="(none)"></div>'
    + (f.type === 'four' || f.type === 'one' ? '' : '<div><label for="fbY">y axis label</label><input type="text" id="fbY" value="' + esc(f.ylab) + '" placeholder="automatic"></div>')
    + '<div><label for="fbX">x axis label</label><input type="text" id="fbX" value="' + esc(f.xlab) + '" placeholder="automatic"></div></div>'
    + '<div class="row"><div><label for="fbLw">Line thickness</label><input type="range" id="fbLw" min="0.5" max="5" step="0.25" value="' + f.lw + '"></div><div><label for="fbFont">Text size</label><input type="range" id="fbFont" min="9" max="24" step="1" value="' + f.font + '"></div></div>';
  h += '<details class="more"><summary>Axis limits</summary><p class="muted small">Leave empty for automatic. Use the same limits on figures you want to compare side by side.</p><div class="limgrid">'
    + [['x0', 'x from'], ['x1', 'x to'], ['y0', 'y from'], ['y1', 'y to']].map(([k, l]) => '<label>' + l + '<input type="number" step="any" class="mini" data-lim="' + k + '" value="' + esc(f.lim[k]) + '"></label>').join('') + '</div></details>';
  const ks = kicksOf(all);
  h += '<details class="more"><summary>Colours</summary><div class="colgrid">' + ks.map((k) => '<label class="colpick"><input type="color" data-kc="' + esc(k) + '" value="' + colOf(k) + '"> ' + esc(k) + '</label>').join('') + '</div><button type="button" class="btn small ghost" id="fbColReset">Default colours</button></details>';
  h += '<p class="fl">Save it</p><div class="row tight"><button type="button" class="btn accent" id="fbPng">Picture (PNG)</button><button type="button" class="btn" id="fbSvg">Editable drawing (SVG)</button><button type="button" class="btn ghost" id="fbCopy">Copy picture</button><button type="button" class="btn ghost small" id="fbReset">Start again</button></div>'
    + '<p class="muted small">The PNG is saved at three times the size shown (about 300 dpi for a one-column figure), so it prints sharply. The SVG stays sharp at any size and every line and label can still be edited. <strong>Copy picture</strong> puts it straight into Word or PowerPoint.</p>';
  h += '<label for="figCap">Suggested caption (check it and make it your own)</label><textarea id="figCap" rows="4"></textarea>';
  h += '</div><div class="figprev"><canvas id="figCv" role="img" aria-label="Preview of the figure"></canvas><p class="muted small" id="figMsg" role="status"></p></div></div>';
  el.innerHTML = h;
  const re = (full) => { save(); if (full) renderFigure(); else draw(); };
  el.querySelectorAll('[data-ft]').forEach((b) => b.addEventListener('click', () => { f.type = b.getAttribute('data-ft'); f.lim = { x0: '', x1: '', y0: '', y1: '' }; re(true); }));
  el.querySelectorAll('[data-fp]').forEach((b) => b.addEventListener('click', () => { const k = b.getAttribute('data-fp'); f.panels[k] = !f.panels[k]; re(true); }));
  el.querySelectorAll('[data-ftr]').forEach((b) => b.addEventListener('click', () => { const k = b.getAttribute('data-ftr'); f.trials[k] = f.trials[k] === false; re(true); }));
  el.querySelectorAll('[data-fc]').forEach((c) => c.addEventListener('change', function () { f[this.getAttribute('data-fc')] = this.checked; re(this.getAttribute('data-fc') === 'cb'); }));
  [['fbTrial', 'trial'], ['fbSig', 'sig'], ['fbBar', 'bar'], ['fbXm', 'xm'], ['fbShow', 'show'], ['fbSize', 'size'], ['fbFontFam', 'fontFam'], ['fbLegPos', 'legendPos'], ['fbBg', 'bg']]
    .forEach(([id, k]) => { if ($(id)) $(id).addEventListener('change', function () { f[k] = this.value; re(id === 'fbSize'); }); });
  $('fbUnits').addEventListener('change', function () { A.units = this.value; A.fn.refreshAll(); });
  [['fbW', 'W'], ['fbH', 'H']].forEach(([id, k]) => { if ($(id)) $(id).addEventListener('change', function () { f[k] = +this.value; re(); }); });
  [['fbTitle', 'title'], ['fbY', 'ylab'], ['fbX', 'xlab']].forEach(([id, k]) => { if ($(id)) $(id).addEventListener('input', function () { f[k] = this.value; re(); }); });
  [['fbLw', 'lw'], ['fbFont', 'font']].forEach(([id, k]) => $(id).addEventListener('input', function () { f[k] = +this.value; re(); }));
  el.querySelectorAll('[data-lim]').forEach((i) => i.addEventListener('change', function () { f.lim[this.getAttribute('data-lim')] = this.value; re(); }));
  el.querySelectorAll('[data-kc]').forEach((i) => i.addEventListener('input', function () { A.kickCol[this.getAttribute('data-kc')] = this.value; draw(); }));
  $('fbColReset').addEventListener('click', () => { A.kickCol = {}; A.fn.refreshAll(); });
  $('fbReset').addEventListener('click', () => { A.fig = defaults(); A.kickCol = {}; save(); renderFigure(); });
  $('fbPng').addEventListener('click', async () => { download(fileName() + '.png', await pngBlob(3)); });
  $('fbSvg').addEventListener('click', () => { const [W, H] = sizeOf(f), g = svgG(W, H, FONTS[f.fontFam], f.bg === 'white' ? '#ffffff' : null); drawFigure(g, W, H, f); download(fileName() + '.svg', new Blob([g.done()], { type: 'image/svg+xml' })); });
  $('fbCopy').addEventListener('click', async () => {
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob(3) })]); $('figMsg').textContent = 'Copied. Paste it into Word or PowerPoint.'; }
    catch (e) { $('figMsg').textContent = 'This browser would not copy the picture. Use Picture (PNG) instead.'; }
  });
  draw();
}
export function openFigure(type, sig) { const f = F(); f.type = type; if (sig) f.sig = sig; save(); }
