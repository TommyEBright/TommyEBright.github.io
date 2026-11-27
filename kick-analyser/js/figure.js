// The figure builder (tab "4. Figure"): one kick, kicks compared (one signal or four panels), the centre of pressure
// path under the foot, or a bar chart of any result. Every choice shows straight away; PNG, SVG or copy.
import { A, $, esc, fx, download, trialLabel, kickColour, cur } from './state.js?v=1.1.0';
import { VARS, results, valOf, unitOf, SIG, sigLabel, sigUnit, signal } from './analyse.js?v=1.1.0';
import { FONTS, canvasG, svgG, axes, range, padRange, line, band, legend, legendH, textW } from './draw.js?v=1.1.0';

const SIZES = { slide: ['Slide (16:9)', 960, 540], report: ['Report (4:3)', 800, 600], wide: ['Wide and short', 1000, 400], poster: ['Poster (3:2)', 1080, 720], tall: ['Tall', 720, 960], square: ['Square', 800, 800], journal1: ['Journal, one column', 700, 520], journal2: ['Journal, two columns', 1400, 700], custom: ['Custom size', 0, 0] };
const TYPES = { foot: 'Coach footprint', one: 'One kick', curves: 'Kicks compared', four: 'Four panels', path: 'COP path under the foot', bar: 'Bar chart of a result' };
const DASHES = [null, [8, 4], [2, 3], [8, 3, 2, 3], [14, 5], [4, 4]];
function defaults() {
  return { type: 'four', trial: '', panels: { Fz: true, AP: true, ML: false, cAP: true, cML: true }, sig: 'Fz', trials: {}, show: 'each', xm: 'ms', ball: true, stance: true,
    bar: 'pkFz', dots: true, footCol: 'time', footAng: 'plate', footLen: '', footStats: true, legend: true, legendPos: 'top', grid: true, cb: false, dash: false, letters: true, title: '', xlab: '', ylab: '', size: 'slide', W: 960, H: 540, lw: 2, font: 14, fontFam: 'Arial', bg: 'white',
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


// ---------- coach footprint ----------
const FOOT = [[0, 0], [0.08, 0.015], [0.125, 0.07], [0.14, 0.17], [0.15, 0.3], [0.17, 0.45], [0.19, 0.58], [0.2, 0.68], [0.19, 0.76], [0.165, 0.815], [0.12, 0.86], [0.065, 0.895], [0.01, 0.93], [-0.05, 0.97], [-0.1, 0.997], [-0.15, 0.985], [-0.185, 0.93], [-0.19, 0.83], [-0.175, 0.7], [-0.14, 0.58], [-0.105, 0.46], [-0.1, 0.33], [-0.12, 0.19], [-0.115, 0.08], [-0.075, 0.017]];
function smooth(pts, k) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let j = 0; j < k; j++) { const t = j / k, t2 = t * t, t3 = t2 * t; out.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3), 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]); }
  }
  return out;
}
const FOOTS = smooth(FOOT, 6);
const VIR = ['#3b0f70', '#3b528b', '#21918c', '#5ec962', '#e3c31b'];
function ramp(t) { t = Math.max(0, Math.min(1, t)) * (VIR.length - 1); const i = Math.min(VIR.length - 2, Math.floor(t)), f = t - i; const h = (s) => [1, 3, 5].map((j) => parseInt(s.substr(j, 2), 16)); const a = h(VIR[i]), b = h(VIR[i + 1]); return 'rgb(' + a.map((v, j) => Math.round(v + (b[j] - v) * f)).join(',') + ')'; }
function footWords(r, P, FL) {
  const roll = r.apEx > 0.6 * FL ? 'Rolled right through onto the toes' : r.apEx < 0.35 * FL ? 'Stayed on the heel and midfoot' : 'Rolled onto the midfoot and ball of the foot';
  const m = r.mlEnd;
  const side = !Number.isFinite(m) || Math.abs(m) < 3 ? 'kept the pressure central' : P.known ? 'finished on the ' + (m > 0 ? 'outside' : 'inside') + ' of the foot' : 'drifted to one side';
  return roll + ' and ' + side + '.';
}
function wrap(g, txt, maxW, size) { const words = txt.split(' '), lines = []; let cur = ''; words.forEach((w) => { const t = cur ? cur + ' ' + w : w; if (textW(t, size, g.font) > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }); if (cur) lines.push(cur); return lines; }
function footLength(f, ts) {
  if (+f.footLen > 0) return Math.max(15, +f.footLen);
  let ex = 0; ts.forEach((t) => { const P = t.p; if (P.cs < 0) return; let a = 1e9, b = -1e9; for (let i = P.cs; i <= P.ce; i++) { a = Math.min(a, P.cAP[i]); b = Math.max(b, P.cAP[i]); } ex = Math.max(ex, b - a); });
  return Math.max(24, Math.min(32, Math.round(ex / 0.85)));
}
function drawFoot(g, W, H, f, ts) {
  const fs = f.font, top0 = f.title ? fs * 2.6 : fs * 0.8, n = ts.length, FL = footLength(f, ts);
  const statH = f.footStats ? fs * 8.4 : fs * 0.8, barH = fs * 2.8;
  const cw = W / n, ftop = top0 + fs * 1.8, fh = H - ftop - statH - barH;
  const startY = 0.08 * FL;
  // one scale for every foot, so they can be compared
  const geo = ts.map((tr) => {
    const P = tr.p, r = results(tr); let ang = 0;
    if (f.footAng === 'auto' && Number.isFinite(r.ang)) ang = Math.max(-45, Math.min(45, r.ang)) * Math.PI / 180;
    const ca = Math.cos(ang), sa = Math.sin(ang), rot = (x, y) => [x * ca + y * sa, -x * sa + y * ca];
    const outline = f.footAng === 'none' ? [] : FOOTS.map(([x, y]) => { const q = rot(x * FL, y * FL - startY); return [q[0], q[1] + startY]; });
    const path = []; if (P.cs >= 0) for (let i = P.cs; i <= P.ce; i++) path.push([P.cML[i], P.cAP[i] + startY]);
    const all = outline.concat(path.length ? path : [[0, 0]]);
    return { tr, P, r, outline, path, x0: Math.min(...all.map((q) => q[0])), x1: Math.max(...all.map((q) => q[0])), y0: Math.min(0, ...all.map((q) => q[1])), y1: Math.max(...all.map((q) => q[1])) };
  });
  const sc = Math.min(...geo.map((q) => Math.min(cw * 0.86 / Math.max(1, q.x1 - q.x0), fh / Math.max(1, q.y1 - q.y0))));
  geo.forEach((q, k) => {
    const { tr, P, r } = q, cx = cw * (k + 0.5);
    const lab = tr.labels.kick + (n > kicksOf(ts).length ? ' (' + (tr.labels.trial ? 'trial ' + tr.labels.trial : tr.name) + ')' : '');
    g.text(lab, cx, top0, { size: fs * 1.05, bold: true, anchor: 'middle', base: 'top' });
    if (P.cs < 0) return;
    const ox = cx - ((q.x0 + q.x1) / 2) * sc, base = ftop + fh - (fh - (q.y1 - q.y0) * sc) / 2 + q.y0 * sc;
    const toPx = (ml, y) => [ox + ml * sc, base - y * sc];
    g.clip(cw * k + 2, ftop - fs * 0.4, cw - 4, fh + fs * 0.8);
    if (q.outline.length) { const pts = []; q.outline.forEach(([x, y]) => { const p = toPx(x, y); pts.push(p[0], p[1]); }); g.path(pts.concat(pts.slice(0, 2)), { fill: '#f1f5f9', stroke: '#94a3b8', lw: 1.5 }); }
    const step = Math.max(1, Math.round(tr.fs / 250)); let peak = 0; for (let i = P.cs; i <= P.ce; i++) peak = Math.max(peak, P.Fz[i]);
    for (let i = P.cs; i + step <= P.ce; i += step) {
      const t = (i - P.cs) / (P.ce - P.cs), a1 = toPx(P.cML[i], P.cAP[i] + startY), a2 = toPx(P.cML[i + step], P.cAP[i + step] + startY);
      g.path([a1[0], a1[1], a2[0], a2[1]], { stroke: f.footCol === 'force' ? ramp(P.Fz[i] / peak) : ramp(t), lw: f.lw * (0.8 + 3.2 * Math.max(0, P.Fz[i]) / peak) });
    }
    let pk = P.cs; for (let i = P.cs; i <= P.ce; i++) if (P.Fz[i] > P.Fz[pk]) pk = i;
    const mk = (i) => toPx(P.cML[i], P.cAP[i] + startY), R = 3 + f.lw * 1.4;
    let p = mk(P.cs); g.circle(p[0], p[1], R, { fill: '#fff', stroke: '#111827', lw: 2 });
    p = mk(pk); g.path([p[0], p[1] - R * 1.3, p[0] + R * 1.3, p[1], p[0], p[1] + R * 1.3, p[0] - R * 1.3, p[1], p[0], p[1] - R * 1.3], { fill: '#dc2626', stroke: '#fff', lw: 1.5 });
    if (P.b != null && P.b >= P.cs && P.b <= P.ce) { p = mk(P.b); g.circle(p[0], p[1], R * 1.25, { fill: '#fff', stroke: '#111827', lw: 2 }); g.circle(p[0], p[1], R * 0.45, { fill: '#111827' }); }
    p = mk(P.ce); g.rect(p[0] - R, p[1] - R, 2 * R, 2 * R, { fill: '#111827' });
    g.unclip();
    if (f.footStats) {
      const y0 = H - statH - barH + fs * 0.5, colW = Math.min(cw * 0.88, fs * 16), x0 = cx - colW / 2;
      const ml = r.mlEnd, side = Number.isFinite(ml) ? fx(Math.abs(ml), 0) + ' cm' + (Math.abs(ml) >= 1 && P.known ? (ml > 0 ? ' outside' : ' inside') : '') : '\u2013';
      const rows = [['Heel-to-toe roll', fx(r.apEx, 0) + ' cm'], ['Side shift', side], ['Peak force', fx(r.pkFz / P.bw, 1) + ' \u00d7 BW'], ['Time on the ground', fx(r.stance, 0) + ' ms']];
      rows.forEach(([l, v], j) => { const y = y0 + j * fs * 1.35; g.text(l, x0, y, { size: fs * 0.85, fill: '#475569', base: 'top' }); g.text(v, x0 + colW, y, { size: fs * 0.95, bold: true, anchor: 'end', base: 'top' }); });
      wrap(g, footWords(r, P, FL), colW, fs * 0.8).slice(0, 3).forEach((ln, j) => g.text(ln, cx, y0 + 4 * fs * 1.35 + fs * 0.15 + j * fs, { size: fs * 0.8, anchor: 'middle', base: 'top', fill: '#334155' }));
    }
  });
  // colour bar and key
  const by = H - barH + fs * 0.5, bw = Math.min(W * 0.36, 360), bx = W / 2 - bw - fs;
  for (let i = 0; i < 60; i++) g.rect(bx + bw * i / 60, by, bw / 60 + 0.6, fs * 0.6, { fill: ramp(i / 59) });
  g.text(f.footCol === 'force' ? 'Low force' : 'Foot contact', bx, by + fs * 0.75, { size: fs * 0.75, base: 'top', fill: '#475569' });
  g.text(f.footCol === 'force' ? 'Peak force' : 'Toe-off', bx + bw, by + fs * 0.75, { size: fs * 0.75, base: 'top', anchor: 'end', fill: '#475569' });
  let kx = W / 2 + fs; const ky = by + fs * 0.3, R = 3 + f.lw * 1.2;
  const key = (draw, l) => { draw(kx + R, ky); g.text(l, kx + 2 * R + 5, ky, { size: fs * 0.78, base: 'middle' }); kx += 2 * R + 14 + textW(l, fs * 0.78, g.font); };
  key((x, y) => g.circle(x, y, R, { fill: '#fff', stroke: '#111827', lw: 2 }), 'Lands');
  key((x, y) => g.path([x, y - R * 1.3, x + R * 1.3, y, x, y + R * 1.3, x - R * 1.3, y, x, y - R * 1.3], { fill: '#dc2626' }), 'Peak force');
  if (ts.some((t) => t.p.b != null)) key((x, y) => { g.circle(x, y, R * 1.2, { fill: '#fff', stroke: '#111827', lw: 2 }); g.circle(x, y, R * 0.45, { fill: '#111827' }); }, 'Ball contact');
  key((x, y) => g.rect(x - R, y - R, 2 * R, 2 * R, { fill: '#111827' }), 'Toe-off');
  g.text('Line thickness = how hard the foot is pressing. Foot outline is a guide only.', W / 2, by + fs * 1.45, { size: fs * 0.68, anchor: 'middle', base: 'top', fill: '#64748b' });
}

export function drawFigure(g, W, H, f) {
  const fs = f.font, top0 = (f.title ? fs * 2.2 : 10);
  if (f.title) g.text(f.title, W / 2, fs * 0.4, { size: fs * 1.2, bold: true, anchor: 'middle', base: 'top' });
  const ts = chosen();
  if (!ts.length) { g.text('Add or choose some kicks to see the figure', W / 2, H / 2, { size: fs, anchor: 'middle', fill: '#64748b' }); return; }
  if (f.type === 'foot') { drawFoot(g, W, H, f, ts); return; }
  const L = fs * 5.2, B = fs * 3.6, R = 18;
  if (f.type === 'one') {
    const tr = A.trials.find((t) => t.id === f.trial) || ts[0], P = tr.p;
    const ks = Object.keys(SIG).filter((k) => f.panels[k] && P[k]);
    const cols = { Fz: '#1d4ed8', AP: '#dc2626', ML: '#7c3aed', cAP: '#0f766e', cML: '#d97706', cR: '#0891b2', cV: '#be185d', Tz: '#475569' };
    const items = ks.map((k) => ({ l: SIG[k].l, c: cols[k] }));
    const lh = f.legend && f.legendPos === 'top' ? legendH(items, W - L - R, fs, g.font) : 0;
    if (f.legend && f.legendPos === 'top') legend(g, items, L, top0, W - L - R, fs, 'top', f.lw);
    const top = top0 + lh + 6, gap = fs * 1.2, ph = (H - top - B - gap * (ks.length - 1)) / Math.max(1, ks.length);
    const x = xOf(tr, f.xm), bx = ballX(tr, f.xm);
    ks.forEach((k, i) => {
      const Y = top + i * (ph + gap), last = i === ks.length - 1;
      panel(g, L, Y, W - L - R, ph, [{ x, y: signal(tr, k), c: cols[k] }], f.ball ? [{ x: bx, c: '#111827' }] : [], f, { xlab: last ? xLab(f) : '', ylab: SIG[k].short + ' (' + sigUnit(k) + ')', fixX: true, fixY: ks.length === 1 });
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
  if (f.type === 'foot') return 'Figure X. Centre of pressure (COP) under the support foot for the ' + AND(ks) + ' kicks, seen from above with the toes at the top. The trail runs from foot contact (open circle) to toe-off (filled square), coloured by ' + (f.footCol === 'force' ? 'vertical force' : 'time') + ' and thicker where the foot pressed harder; the red diamond marks peak vertical force. The foot outline is illustrative.';
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
  const dpr = Math.max(1, window.devicePixelRatio || 1), box = cv.parentElement.clientWidth || W;
  const dw = Math.min(W, box), k = dw / W, dh = Math.round(H * k);
  cv.style.width = dw + 'px'; cv.style.height = dh + 'px';
  cv.width = Math.round(dw * dpr); cv.height = Math.round(dh * dpr);
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  drawFigure(canvasG(ctx, FONTS[f.fontFam]), W, H, f);
  $('figCap').value = caption(f);
}
let figRO = null;
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
    if (f.type === 'foot') h += '<p class="fl">3. The footprint</p><div class="row tight"><label class="inline" style="margin:0">Colour the trail by</label>' + sel('fbFootCol', [['time', 'Time (contact to toe-off)'], ['force', 'Force (how hard the foot presses)']], f.footCol) + '</div><div class="row tight"><label class="inline" style="margin:0">Foot outline</label>' + sel('fbFootAng', [['plate', 'Straight along the plate'], ['auto', 'Turned to match the COP direction'], ['none', 'No outline']], f.footAng) + '<label class="inline" style="margin:0">Foot (boot) length <input type="number" id="fbFootLen" class="mini" style="width:4.5rem" min="15" max="35" step="0.5" placeholder="auto" value="' + esc(f.footLen) + '"> cm</label></div><div class="chks"><label class="inline"><input type="checkbox" data-fc="footStats"' + (f.footStats ? ' checked' : '') + '> Key numbers and a plain-English summary under each foot</label></div><p class="muted small">Made to show a coach or player. One footprint per kick; choose up to four or five so they stay readable. The COP path is drawn to scale from where it started under the heel; the foot outline is only a guide, because the plate does not know exactly where the foot was or which way it pointed.</p>';
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
  [['fbFootCol', 'footCol'], ['fbFootAng', 'footAng']].forEach(([id, k]) => { if ($(id)) $(id).addEventListener('change', function () { f[k] = this.value; re(); }); });
  if ($('fbFootLen')) $('fbFootLen').addEventListener('change', function () { f.footLen = this.value; re(); });
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
  if (!figRO) { figRO = new ResizeObserver(() => { if ($('figCv')) draw(); }); } figRO.disconnect(); figRO.observe($('figCv').parentElement);
  draw();
}
export function openFigure(type, sig) { const f = F(); f.type = type; if (sig) f.sig = sig; save(); }
