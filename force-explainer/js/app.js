// Force to Motion: a step-by-step explanation of how force platform data become net force, acceleration,
// velocity and displacement, for a countermovement jump, a squat jump and a drop jump.
// The jumps are real (two force platforms, 1000 Hz). Take-off, landing and the start of movement were found with
// Force Analysis; bodyweight, acceleration, velocity and displacement are worked out here, live, so the
// bodyweight error slider and the filter can change them. CMJ: forward integration from standing still before the
// jump. SJ and DJ: backward integration from standing still after landing.
import { zip } from './zip.js?v=1.2.0';

const G = 9.81;
const $ = (id) => document.getElementById(id);
const f = (x, d) => (Number.isFinite(x) ? x.toFixed(d) : '&ndash;');
const sgn = (x, d) => (Number.isFinite(x) ? (x < 0 ? '&minus;' + Math.abs(x).toFixed(d) : x.toFixed(d)) : '&ndash;');
const PCOL = ['#e69f00', '#009e73'];
const COL = { F: '#1d4ed8', a: '#dc2626', v: '#7c3aed', s: '#0891b2', bw: '#475569', up: '#10b981', down: '#3b82f6' };
const PH = { unweight: ['Unweighting', '#3b82f6'], brake: ['Braking', '#f59e0b'], prop: ['Propulsion', '#10b981'], flight: ['Flight', '#94a3b8'], land: ['Landing', '#a855f7'], drop: ['Falling from the box', '#cbd5e1'] };

const S = { jump: 'cmj', step: 0, D: null, C: null, cur: -1, adj: 0, strip: -1, anim: -1, seen: {}, data: {}, plates: false, filt: false };

// ---------- the maths ----------
// Low-pass filter: 2nd-order Butterworth run forwards then backwards (zero lag, 4th order overall), cut-off
// corrected for the two passes (Winter, 2009). The same filter as Force Analysis.
function butter(x, fc, fs) {
  const n = x.length; if (n < 7 || !(fc > 0) || fc >= fs / 2) return Float64Array.from(x);
  const wc = Math.tan(Math.PI * fc / fs) / 0.802, K1 = Math.SQRT2 * wc, K2 = wc * wc;
  const a0 = K2 / (1 + K1 + K2), a1 = 2 * a0, a2 = a0, K3 = 2 * a0 / K2, b1 = -2 * a0 + K3, b2 = 1 - 2 * a0 - K3;
  const pad = Math.min(n - 1, Math.max(20, Math.round(3 * fs / fc))), m = n + 2 * pad, ext = new Float64Array(m);
  for (let i = 0; i < pad; i++) ext[i] = 2 * x[0] - x[pad - i];
  for (let i = 0; i < n; i++) ext[pad + i] = x[i];
  for (let i = 0; i < pad; i++) ext[pad + n + i] = 2 * x[n - 1] - x[n - 2 - i];
  const pass = (v) => { const o = Float64Array.from(v); for (let k = 2; k < v.length; k++) o[k] = a0 * v[k] + a1 * v[k - 1] + a2 * v[k - 2] + b1 * o[k - 1] + b2 * o[k - 2]; return o; };
  const f1 = pass(ext); f1.reverse(); const f2 = pass(f1); f2.reverse();
  return f2.slice(pad, pad + n);
}
// Residual analysis (Winter, 2009): the residual (RMS difference between raw and filtered) at each cut-off, a
// straight line fitted to the high-frequency part (where only noise is being removed), and the cut-off where the
// residual comes down to that line's intercept (the size of the noise).
function residual(x, fs) {
  const F = [], Rr = [];
  for (let fc = 1; fc <= 100; fc++) { const y = butter(x, fc, fs); let r = 0; for (let i = 0; i < x.length; i++) r += (x[i] - y[i]) ** 2; F.push(fc); Rr.push(Math.sqrt(r / x.length)); }
  const k0 = Math.floor(F.length * 0.55), n = F.length - k0;
  let mx = 0, my = 0; for (let i = k0; i < F.length; i++) { mx += F[i]; my += Rr[i]; } mx /= n; my /= n;
  let sxy = 0, sxx = 0; for (let i = k0; i < F.length; i++) { sxy += (F[i] - mx) * (Rr[i] - my); sxx += (F[i] - mx) ** 2; }
  const slope = sxy / sxx, a = my - slope * mx; let fc = 50;
  if (a > 0) for (let i = 0; i < F.length; i++) if (Rr[i] <= a) { fc = F[i]; break; }
  return { F, R: Rr, a, slope, fc };
}
// Done once per jump: residual analysis over the movement (start of movement, or touchdown, to just after take-off),
// not the still periods or the landing, then the filtered force and platforms at that cut-off.
function prepare(D) {
  const i0 = Math.max(0, (D.jump === 'dj' ? D.TD : D.onset) - 50), i1 = Math.min(D.F.length, D.TO + 50);
  D.res = residual(Float64Array.from(D.F.slice(i0, i1)), D.fs); D.res.i0 = i0; D.res.i1 = i1;
  D.Ff = butter(Float64Array.from(D.F), D.res.fc, D.fs);
  D.noise = D.LD > D.TO + 200 ? sdv(D.F, D.TO + 150, D.LD - 20) : NaN; // empty plate, once the ringing after take-off has died down
  D.Pf = (D.P || []).map((q) => butter(Float64Array.from(q), D.res.fc, D.fs));
}
const avg = (y, a, b) => { let t = 0; for (let i = a; i < b; i++) t += y[i]; return t / (b - a); };
const sdv = (y, a, b) => { const mu = avg(y, a, b); let t = 0; for (let i = a; i < b; i++) t += (y[i] - mu) ** 2; return Math.sqrt(t / (b - a - 1)); };
function compute(D, adj, filt) {
  if (filt === undefined) filt = S.filt;
  const F = filt ? D.Ff : D.F, Pl = filt ? D.Pf : D.P;
  const n = F.length, dt = 1 / D.fs, W0 = avg(F, D.weigh[0], D.weigh[1]), W = W0 * (1 + adj), m = W / G;
  const Fn = new Float64Array(n), a = new Float64Array(n), v = new Float64Array(n), s = new Float64Array(n);
  for (let i = 0; i < n; i++) { Fn[i] = F[i] - W; a[i] = Fn[i] / m; }
  let start, stepOff = -1;
  if (D.dir === 'forward') {
    start = D.onset; // still standing before the jump: velocity is zero here
    for (let i = start + 1; i < n; i++) { v[i] = v[i - 1] + (a[i - 1] + a[i]) / 2 * dt; s[i] = s[i - 1] + (v[i - 1] + v[i]) / 2 * dt; }
  } else {
    start = D.weigh[0]; // still standing after landing: velocity is zero here, so work backwards (and forwards) from it
    for (let i = start + 1; i < n; i++) v[i] = v[i - 1] + (a[i - 1] + a[i]) / 2 * dt;
    for (let i = start - 1; i >= 0; i--) v[i] = v[i + 1] - (a[i] + a[i + 1]) / 2 * dt;
    for (let i = start + 1; i < n; i++) s[i] = s[i - 1] + (v[i - 1] + v[i]) / 2 * dt;
    for (let i = start - 1; i >= 0; i--) s[i] = s[i + 1] - (v[i] + v[i + 1]) / 2 * dt;
    const s0 = s[D.jump === 'dj' ? D.TD : D.onset]; for (let i = 0; i < n; i++) s[i] -= s0; // zero: touchdown (DJ) or the starting squat (SJ)
    if (D.jump === 'dj') {
      for (let i = D.TD; i >= 0; i--) if (v[i] >= 0) { stepOff = i; break; }
      if (stepOff >= 0) for (let i = 0; i < stepOff; i++) { v[i] = 0; s[i] = s[stepOff]; } // still on the box
    }
  }
  const C = { F, P: Pl, W, W0, m, Fn, a, v, s, start, stepOff, n, dt, filt };
  const amin = (y, i0, i1) => { let b = i0; for (let i = i0; i < i1; i++) if (y[i] < y[b]) b = i; return b; };
  const firstUp = (i0, i1) => { for (let i = i0; i < i1; i++) if (v[i] >= 0) return i; return -1; };
  if (D.jump === 'cmj') { C.vMin = amin(v, D.onset, D.TO); C.zero = firstUp(C.vMin + 1, D.TO + 1); }
  if (D.jump === 'dj') C.low = firstUp(D.TD + 1, D.TO + 1);
  C.landEnd = D.LD > 0 ? firstUp(D.LD + 1, n) : -1;
  C.tov = v[D.TO]; C.jh = C.tov > 0 ? C.tov * C.tov / (2 * G) : NaN;
  C.ft = D.LD > 0 ? (D.LD - D.TO) / D.fs : NaN; C.jhF = G * C.ft * C.ft / 8;
  // phases
  const P = [], add = (k, i0, i1) => { if (i0 >= 0 && i1 > i0) P.push({ k, i0, i1, name: PH[k][0], col: PH[k][1] }); };
  if (D.jump === 'cmj') { add('unweight', D.onset, C.vMin); if (C.zero > 0) { add('brake', C.vMin, C.zero); add('prop', C.zero, D.TO); } }
  if (D.jump === 'sj') add('prop', D.onset, D.TO);
  if (D.jump === 'dj') { if (stepOff >= 0) add('drop', stepOff, D.TD); if (C.low > 0) { add('brake', D.TD, C.low); add('prop', C.low, D.TO); } }
  if (D.LD > 0) { add('flight', D.TO, D.LD); if (C.landEnd > 0) add('land', D.LD, C.landEnd); }
  C.phases = P;
  // the check: velocity where we know the person was still, at the other end from where we started
  if (D.dir === 'forward') { const e = D.F.length; C.chk = { i: e - 1, v: v[e - 1], where: 'once they are standing still again after landing' }; }
  else if (D.jump === 'sj') { C.chk = { i: D.onset, v: v[D.onset], where: 'in the still squat, just before the push' }; }
  else C.chk = { i: D.TD, v: v[D.TD], where: 'touchdown', drop: v[D.TD] * v[D.TD] / (2 * G) };
  return C;
}

// ---------- the graph ----------
const PANEL = { F: ['Force (N)', COL.F], a: ['Acceleration (m/s²)', COL.a], v: ['Velocity (m/s)', COL.v], s: ['Displacement (m)', COL.s] };
let G0 = null; // the frames drawn last, for hovering
function niceStep(r, k) { const raw = r / k, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p; }
function draw() {
  const cv = $('cv'), wrap = $('graphWrap'), st = STEPS()[S.step], D = S.D, C = S.C;
  const w = wrap.clientWidth, h = wrap.clientHeight, dpr = window.devicePixelRatio || 1;
  [cv, $('ov')].forEach((c) => { c.width = w * dpr; c.height = h * dpr; });
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  const keys = st.panels, n = C.F.length, T = (i) => i / D.fs, x1 = T(n - 1);
  const L = 74, R = 16, top = 10, bot = 38, gap = 12, ph = (h - top - bot - gap * (keys.length - 1)) / keys.length;
  const X = (t) => L + t / x1 * (w - L - R);
  const frames = [];
  keys.forEach((k, j) => {
    const y = k === 'F' ? C.F : C[k], ghost = st.ghost && k !== 'F' ? S.Cref[k] : null;
    let lo = Infinity, hi = -Infinity; const back = D.dir === 'backward', from = k === 'v' && S.anim >= 0 && back ? S.anim : 0, upto = k === 'v' && S.anim >= 0 && !back ? S.anim : n - 1;
    const pl = k === 'F' && S.plates && C.P && C.P.length > 1 ? C.P : [];
    [y, ghost, ...pl].forEach((q) => { if (q) for (let i = 0; i < n; i++) { if (q[i] < lo) lo = q[i]; if (q[i] > hi) hi = q[i]; } });
    if (k === 'F') { lo = Math.min(lo, 0); hi = Math.max(hi, C.W); } lo = Math.min(lo, 0); hi = Math.max(hi, 0);
    // a hard landing can be several times the take-off force: keep the jump readable and label the peak instead
    let clip = null;
    if ((k === 'F' || k === 'a') && D.jump !== 'dj' && D.LD > 0) {
      let pre = -Infinity, pk = D.LD; for (let i = 0; i < D.LD; i++) if (y[i] > pre) pre = y[i];
      for (let i = D.LD; i < n; i++) if (y[i] > y[pk]) pk = i;
      const cap = pre + 0.6 * (pre - lo);
      if (y[pk] > cap) { clip = { i: pk, v: y[pk] }; hi = cap; }
    }
    const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
    const b = { x: L, y: top + j * (ph + gap), w: w - L - R, h: ph }, Y = (v) => b.y + b.h - (v - lo) / (hi - lo) * b.h;
    frames.push({ k, b, Y, lo, hi, y });
    ctx.fillStyle = '#fff'; ctx.fillRect(b.x, b.y, b.w, b.h);
    // phases or weighing shading
    ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
    if (st.shade === 'phases') C.phases.forEach((p) => { ctx.globalAlpha = p.k === 'flight' || p.k === 'drop' ? 0.16 : 0.17; ctx.fillStyle = p.col; ctx.fillRect(X(T(p.i0)), b.y, X(T(p.i1)) - X(T(p.i0)), b.h); });
    if (st.shade === 'weigh') {
      ctx.globalAlpha = 0.25; ctx.fillStyle = '#94a3b8'; ctx.fillRect(X(T(D.weigh[0])), b.y, X(T(D.weigh[1])) - X(T(D.weigh[0])), b.h);
      if (D.alt) { ctx.globalAlpha = 0.16; ctx.fillStyle = '#e69f00'; ctx.fillRect(X(T(D.alt.weigh[0])), b.y, X(T(D.alt.weigh[1])) - X(T(D.alt.weigh[0])), b.h); }
    }
    ctx.globalAlpha = 1;
    // grid and zero
    ctx.font = '12px system-ui, Arial'; ctx.fillStyle = '#475569'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const ys = niceStep(hi - lo, Math.max(2, Math.round(b.h / 45)));
    for (let v = Math.ceil(lo / ys) * ys; v <= hi; v += ys) { const py = Y(v); ctx.strokeStyle = Math.abs(v) < ys / 1e6 ? '#94a3b8' : '#eef2f7'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(b.x, py); ctx.lineTo(b.x + b.w, py); ctx.stroke(); }
    // net force shading (above and below bodyweight)
    if (k === 'F' && st.net) {
      const bw = Y(C.W);
      for (const up of [true, false]) { ctx.beginPath(); ctx.moveTo(X(0), bw); for (let i = 0; i < n; i++) ctx.lineTo(X(T(i)), up ? Math.min(Y(C.F[i]), bw) : Math.max(Y(C.F[i]), bw)); ctx.lineTo(X(x1), bw); ctx.closePath(); ctx.globalAlpha = 0.3; ctx.fillStyle = up ? COL.up : COL.down; ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    if (k === 'F' && st.bw) { ctx.setLineDash([6, 4]); ctx.strokeStyle = COL.bw; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(b.x, Y(C.W)); ctx.lineTo(b.x + b.w, Y(C.W)); ctx.stroke(); ctx.setLineDash([]); }
    // velocity area under acceleration, up to the strip
    if (k === 'a' && st.area) {
      const cur = S.anim >= 0 ? S.anim : (S.strip >= 0 ? (back ? S.strip : S.strip + 1) : -1);
      const i0 = back ? cur : C.start, i1 = back ? C.start : cur;
      if (cur > 0 && i1 > i0) { ctx.beginPath(); ctx.moveTo(X(T(i0)), Y(0)); for (let i = i0; i <= i1; i++) ctx.lineTo(X(T(i)), Y(y[i])); ctx.lineTo(X(T(i1)), Y(0)); ctx.closePath(); ctx.globalAlpha = 0.25; ctx.fillStyle = COL.v; ctx.fill(); ctx.globalAlpha = 1; }
      if (S.strip >= 0) { ctx.fillStyle = '#f59e0b'; ctx.globalAlpha = 0.9; ctx.fillRect(X(T(S.strip)) - 1, b.y, Math.max(3, X(T(S.strip + 1)) - X(T(S.strip)) + 2), b.h); ctx.globalAlpha = 1; }
    }
    // the line(s)
    pl.forEach((q, pk) => { ctx.setLineDash([6, 3]); ctx.strokeStyle = PCOL[pk % 2]; ctx.lineWidth = 1.6; ctx.beginPath(); for (let i = 0; i < n; i++) { const px = X(T(i)), py = Y(q[i]); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.stroke(); ctx.setLineDash([]); });
    if (ghost) { ctx.setLineDash([5, 4]); ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.6; ctx.beginPath(); for (let i = 0; i < n; i++) { const px = X(T(i)), py = Y(ghost[i]); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.stroke(); ctx.setLineDash([]); }
    ctx.strokeStyle = PANEL[k][1]; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = from; i <= upto; i++) { const px = X(T(i)), py = Y(y[i]); if (i > from) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
    ctx.stroke();
    if (clip) { const px = X(T(clip.i)); ctx.fillStyle = PANEL[k][1]; ctx.font = '600 12px system-ui, Arial'; ctx.textBaseline = 'top'; const lab = '\u2191 landing peak ' + clip.v.toFixed(0) + (k === 'F' ? ' N' : ' m/s\u00b2') + ' (off the scale)', tw = ctx.measureText(lab).width; ctx.textAlign = px + 5 + tw > b.x + b.w ? 'right' : 'left'; ctx.fillText(lab, ctx.textAlign === 'right' ? px - 5 : px + 5, b.y + 22); }
    // events
    (st.events ? EVENTS() : []).forEach((e) => { const px = X(T(e.i)); ctx.strokeStyle = '#334155'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, b.y); ctx.lineTo(px, b.y + b.h); ctx.stroke(); ctx.setLineDash([]); });
    ctx.restore();
    // y axis labels
    ctx.fillStyle = '#475569'; ctx.textAlign = 'right'; ctx.font = '12px system-ui, Arial';
    for (let v = Math.ceil(lo / ys) * ys; v <= hi; v += ys) ctx.fillText(Math.abs(v) < ys / 1e6 ? '0' : (+v.toFixed(6)).toString(), b.x - 6, Y(v));
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x, b.y + b.h); ctx.lineTo(b.x + b.w, b.y + b.h); ctx.stroke();
    ctx.save(); ctx.translate(16, b.y + b.h / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.font = '600 12px system-ui, Arial'; ctx.fillStyle = PANEL[k][1]; ctx.fillText(PANEL[k][0], 0, 0); ctx.restore();
    // phase names on the first panel
    if (j === 0 && st.shade === 'phases') { ctx.font = '600 11px system-ui, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; C.phases.forEach((p) => { const a = X(T(p.i0)), e = X(T(p.i1)); if (e - a > ctx.measureText(p.name).width + 6) { ctx.fillStyle = 'rgba(255,255,255,.8)'; const tw = ctx.measureText(p.name).width; ctx.fillRect((a + e) / 2 - tw / 2 - 3, b.y + 3, tw + 6, 15); ctx.fillStyle = '#334155'; ctx.fillText(p.name, (a + e) / 2, b.y + 4); } }); }
    if (j === 0 && st.shade === 'weigh') {
      ctx.font = '600 11px system-ui, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      [[D.weigh, 'Weighed here', '#334155'], [D.alt ? D.alt.weigh : null, 'Squat (wobblier)', '#9a6700']].forEach(([wn, lab, col]) => { if (!wn) return; const cx = (X(T(wn[0])) + X(T(wn[1]))) / 2, tw = ctx.measureText(lab).width; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(cx - tw / 2 - 3, b.y + 3, tw + 6, 15); ctx.fillStyle = col; ctx.fillText(lab, cx, b.y + 5); });
    }
    if (k === 'F' && st.bw) { ctx.font = '11px system-ui, Arial'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillStyle = COL.bw; ctx.fillText('bodyweight ' + C.W.toFixed(0) + ' N', b.x + b.w - 4, Y(C.W) - 2); }
  });
  // time axis
  ctx.fillStyle = '#475569'; ctx.font = '12px system-ui, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const xs = niceStep(x1, Math.max(3, Math.round((w - L - R) / 90))), lb = frames[frames.length - 1].b;
  for (let t = 0; t <= x1 + 1e-9; t += xs) ctx.fillText(t.toFixed(xs < 1 ? 1 : 0), X(t), lb.y + lb.h + 5);
  ctx.font = '600 12px system-ui, Arial'; ctx.fillText('Time (s)', L + (w - L - R) / 2, lb.y + lb.h + 21);
  G0 = { frames, X, T, L, R, w, h, x1 };
  drawCursor();
}
function drawCursor() {
  const ov = $('ov'), ctx = ov.getContext('2d'), dpr = window.devicePixelRatio || 1; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, ov.width, ov.height);
  if (!G0 || S.cur < 0) return;
  const px = G0.X(G0.T(S.cur));
  ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, G0.frames[0].b.y); const lb = G0.frames[G0.frames.length - 1].b; ctx.lineTo(px, lb.y + lb.h); ctx.stroke();
  G0.frames.forEach((fr) => { const py = fr.Y(fr.y[S.cur]); ctx.fillStyle = '#fff'; ctx.strokeStyle = PANEL[fr.k][1]; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
}
function EVENTS() {
  const D = S.D, C = S.C, e = [];
  if (D.jump !== 'dj') e.push({ i: D.onset, name: D.jump === 'sj' ? 'Start of push' : 'Start of movement' });
  if (D.jump === 'dj') e.push({ i: D.TD, name: 'Touchdown' });
  if (C.vMin > 0) e.push({ i: C.vMin, name: 'Fastest downward velocity' });
  if (C.zero > 0) e.push({ i: C.zero, name: 'Lowest point (velocity = 0)' });
  if (C.low > 0) e.push({ i: C.low, name: 'Lowest point (velocity = 0)' });
  e.push({ i: D.TO, name: 'Take-off' }); if (D.LD > 0) e.push({ i: D.LD, name: 'Landing' });
  return e;
}

// ---------- the steps ----------
const eqn = (s) => '<p class="eqn">' + s + '</p>';
const keyList = (pairs) => '<dl class="key">' + pairs.map(([a, b]) => '<dt>' + a + '</dt><dd>' + b + '</dd>').join('') + '</dl>';
function layer(cls, title, html) { return '<div class="layer ' + cls + '"><h3>' + title + '</h3>' + html + '</div>'; }
function quiz(q) { return '<div class="quiz" data-q><p class="q">Quick check: ' + q.q + '</p><div class="opts">' + q.o.map((o, j) => '<button type="button" data-o="' + j + '">' + o + '</button>').join('') + '</div><p class="fb" hidden></p></div>'; }
function exampleI() { // a sample worth looking at when nothing is hovered
  const D = S.D, C = S.C;
  if (S.cur >= 0) return S.cur;
  if (D.jump === 'cmj') return Math.round((D.onset + C.vMin) / 2);
  if (D.jump === 'sj') return Math.round((D.onset + D.TO) / 2);
  return C.low > 0 ? Math.round((D.TD + C.low) / 2) : D.TD + 20;
}
const tIs = (i) => 't = ' + (i / S.D.fs).toFixed(3) + ' s';
const hov = () => (S.cur >= 0 ? 'At the cursor' : 'For example (hover over the graph to choose your own moment)');

function STEPS() {
  const D = S.D, C = S.C, j = D.jump, fs = D.fs, ms = (1000 / fs);
  const msT = ms % 1 ? ms.toFixed(1) : ms.toFixed(0);
  const stillWhere = j === 'cmj' ? 'standing still before the jump' : 'standing still after the landing';
  const back = D.dir === 'backward';
  return [
    { key: 'plate', title: 'What the plate measures', panels: ['F'], q: { q: 'The person is in the air. What does the plate read?', o: ['About 0 N', 'Their bodyweight', 'Twice their bodyweight'], a: 0, why: 'Nothing is pushing on the plate, so it reads (about) zero. That flat line at 0 N is the flight.' },
      body: () => layer('words', 'In plain words', '<p>A force platform measures how hard you push down on it, ' + fs + ' times a second (one reading every ' + msT + ' ms). Standing still, it reads your weight. Push harder and the line goes up; let your legs give and it drops below your weight. In the air it reads zero.</p>' + (D.P && D.P.length > 1 ? '<p>This jump was collected on <strong>' + D.P.length + ' platforms, one under each foot</strong>. Everything in this tool uses the <strong>total</strong> force (the platforms added together), because it is the total that moves the body. Tick <em>Show each platform</em> above the graph to see each foot on its own.</p>' : '') + (j === 'dj' ? '<p>In a drop jump you start on a box next to the plate, so the plate reads zero until you land on it.</p>' : ''))
        + layer('eq', 'The symbol', eqn('<var>F</var>') + keyList([['F', 'vertical ground reaction force, in newtons (N): the number the plate gives at every sample']]))
        + layer('nums', 'Your numbers', '<div id="nums"></div>'),
      nums: (i) => '<p>' + hov() + ': ' + tIs(i) + ', <b>F = ' + f(C.F[i], 1) + ' N</b>.</p>' + (C.P && C.P.length > 1 ? '<div class="calc">F = ' + C.P.map((q, pk) => f(q[i], 1) + ' (platform ' + (pk + 1) + ')').join(' + ') + ' = <b>' + f(C.F[i], 1) + ' N</b></div>' : '') },
    { key: 'check', title: 'Check the data', panels: ['F'], bw: false, resid: true, q: { q: 'Why not filter with a very low cut-off, such as 5 Hz, to make the line really smooth?', o: ['It would also flatten real, fast changes in force (e.g. the drop to zero at take-off)', 'It would make the file too big', 'Filters only work above 20 Hz'], a: 0, why: 'A low-pass filter cannot tell noise from real, fast changes. Too low a cut-off rounds off the take-off and the landing and changes the results. Residual analysis finds the cut-off that removes the noise but keeps the movement.' },
      body: () => {
        const R0 = compute(D, 0, false), R1 = compute(D, 0, true), ok = '<b style="color:var(--good)">&#10003;</b> ', chkF = D.flight && Math.abs(D.flight.mean) < 5;
        return layer('words', 'In plain words', '<p>Before calculating anything, check the trial is worth analysing. Bad data in means bad numbers out, however careful the maths.</p><ul>'
          + '<li><strong>Was the plate zeroed?</strong> In the air nothing touches it, so it should read 0 N. ' + (D.flight ? 'Here the flight reads <b>' + sgn(D.flight.mean, 1) + ' N</b> on average. ' + (chkF ? ok + 'Fine.' : 'Too far from 0 N: zero the plate before every trial.') : '') + '</li>'
          + '<li><strong>Was the person still when they needed to be?</strong> We need about 1 s of complete stillness to weigh them (next step). Here the force varies by only <b>' + f(D.wsd, 1) + ' N</b> (SD) in that second. ' + ok + '</li>'
          + '<li><strong>Did they stay on the plate?</strong> Both feet on, landing back on it, and no stepping. ' + ok + '</li></ul>')
          + layer('eq', 'Noise and filtering', '<p>Every measurement has a little random <strong>noise</strong> on top of the real signal. A <strong>low-pass filter</strong> smooths it out by removing the fast wiggles and keeping the slower changes. Everything faster than the <strong>cut-off frequency</strong> is removed.</p><p>The graph below the force shows how the cut-off was chosen with <strong>residual analysis</strong> (Winter, 2009). For each cut-off from 1 to 100 Hz, the force is filtered and the difference from the raw force is measured. At high cut-offs only noise is being removed, so the difference falls in a straight line. That line starts at the size of the noise, and where the curve comes down to it is the cut-off: <b>' + D.res.fc + ' Hz</b> here.</p><p>Tick <strong>Filter</strong> above the graph to use it from now on.</p>')
          + layer('nums', 'Your numbers', '<div class="calc">noise, nobody on the plate: <b>' + f(D.noise, 1) + ' N</b></div><div class="calc">biggest force in the jump: <b>' + f(Math.max(...D.F.slice(D.res.i0, D.res.i1)), 0) + ' N</b></div><div class="calc">where the straight line starts: <b>' + f(D.res.a, 1) + ' N</b></div><div class="calc">cut-off from residual analysis: <b>' + D.res.fc + ' Hz</b></div>' + (D.res.a <= 2 * D.noise + 1 ? '<p class="small">The two noise estimates agree, so the method has worked well.</p>' : '<p class="small">The line starts much higher than the real noise. The touchdown impact contains genuinely fast changes in force, which this method mistakes for noise. Treat the suggested cut-off as a guide, not a rule.</p>') + '<div class="calc">jump height, raw force: <b>' + f(R0.jh * 100, 1) + ' cm</b></div><div class="calc">jump height, filtered force: <b>' + f(R1.jh * 100, 1) + ' cm</b></div>')
          + layer('why', 'So should you filter?', '<p>With a good force platform the noise is tiny. Adding up the strips (integration, steps 6 and 7) smooths it out anyway, so filtering changes jump height by only ' + f(Math.abs(R1.jh - R0.jh) * 100, 1) + ' cm here. Its main effect is to trim sharp peaks, such as the landing impact. Many researchers analyse jumps unfiltered for this reason. Whichever you choose, say so in your method, and if you filter, give the cut-off and how you chose it.</p><p class="small">Take-off and landing are always found from the unfiltered force, because filtering rounds off the sharp drop to zero.</p>');
      } },
    { key: 'weigh', title: 'Weigh the person', panels: ['F'], shade: 'weigh', bw: true, q: { q: 'Someone has a mass of 72 kg. Roughly what does the plate read while they stand still?', o: ['72 N', '706 N', '7 N'], a: 1, why: 'Weight = mass &times; g = 72 &times; 9.81 = 706 N. Newtons measure force, kilograms measure mass.' },
      body: () => layer('words', 'In plain words', '<p>Before we can work anything out, we need the person&rsquo;s weight. While they are ' + stillWhere + ' (shaded grey), the plate reads just their weight, so we take the average over that time.</p>' + (j === 'dj' ? '<p>In a drop jump there is no still standing <em>before</em> the jump (they are on the box), so we weigh them once they have settled after landing.</p>' : j === 'sj' ? '<p>In a squat jump we could weigh them in the squat before the push (shaded orange), but holding a half squat perfectly still is hard: the force wobbles by ' + f(D.alt.sd, 1) + ' N (SD) there, against ' + f(D.wsd, 1) + ' N standing tall after landing. So we weigh them <strong>after landing</strong>, once they have stood up and settled.</p>' : '') + '<p>Then we turn weight into mass, because mass is what Newton&rsquo;s law needs.</p>')
        + layer('eq', 'The equations', eqn('<var>W</var> = average of <var>F</var> while still') + eqn('<var>m</var> = <var>W</var> &divide; <var>g</var>') + keyList([['W', 'bodyweight (N)'], ['m', 'body mass (kg)'], ['g', '9.81 m/s&sup2;, the acceleration due to gravity']]))
        + layer('nums', 'Your numbers', '<div class="calc">W = average of ' + (D.weigh[1] - D.weigh[0]) + ' samples (' + (D.weigh[0] / fs).toFixed(3) + ' to ' + (D.weigh[1] / fs).toFixed(3) + ' s) = <b>' + f(C.W, 1) + ' N</b></div><div class="calc">m = ' + f(C.W, 1) + ' &divide; 9.81 = <b>' + f(C.m, 2) + ' kg</b></div>')
        + layer('why', 'Why it matters', '<p>Bodyweight is taken off every single sample in the next step. If it is even slightly wrong, the error adds up over the whole jump (step 10 shows this).</p>') },
    { key: 'net', title: 'Net force', panels: ['F'], bw: true, net: true, q: { q: 'Force is 500 N and bodyweight is 700 N. What is the net force?', o: ['+200 N', '&minus;200 N', '1200 N'], a: 1, why: 'F &minus; W = 500 &minus; 700 = &minus;200 N. Negative means the net force is downwards: the person is speeding up downwards.' },
      body: () => layer('words', 'In plain words', '<p>The force from the plate is doing two jobs: holding up your weight, and moving you. Only what is <strong>left over</strong> after holding up your weight can change how you move. That left-over force is the <strong>net force</strong>.</p><p>Above the dashed bodyweight line (green), the net force is upwards. Below it (blue), the net force is downwards. On the line, net force is zero.</p>')
        + layer('eq', 'The equation', eqn('<var>F</var><sub>net</sub> = <var>F</var> &minus; <var>W</var>') + keyList([['F<sub>net</sub>', 'net force (N); positive = upwards, negative = downwards'], ['F', 'force from the plate (N)'], ['W', 'bodyweight (N)']]))
        + layer('nums', 'Your numbers', '<div id="nums"></div>'),
      nums: (i) => '<p>' + hov() + ' (' + tIs(i) + '):</p><div class="calc">F<sub>net</sub> = ' + f(C.F[i], 1) + ' &minus; ' + f(C.W, 1) + ' = <b>' + sgn(C.Fn[i], 1) + ' N</b></div><p>' + (C.Fn[i] > 2 ? 'Positive: the net force is upwards.' : C.Fn[i] < -2 ? 'Negative: the net force is downwards.' : 'About zero: the forces are balanced.') + '</p>' },
    { key: 'acc', title: 'Acceleration', panels: ['F', 'a'], bw: true, q: { q: 'Force is below bodyweight. Which way is the acceleration?', o: ['Upwards', 'Downwards', 'There is none'], a: 1, why: 'Below bodyweight the net force is negative (downwards), and acceleration is net force &divide; mass, so it points downwards too.' },
      body: () => layer('words', 'In plain words', '<p>Newton&rsquo;s second law says a net force makes a mass accelerate. Divide the net force by body mass and you get the acceleration of the person&rsquo;s centre of mass. The red line is exactly the same shape as the net force, just rescaled.</p><p>In the air the plate reads 0, so the acceleration is &minus;' + f(C.W, 0) + ' &divide; ' + f(C.m, 1) + ' = &minus;9.81 m/s&sup2;: just gravity.</p>')
        + layer('eq', 'The equation', eqn('<var>a</var> = <var>F</var><sub>net</sub> &divide; <var>m</var>') + '<p class="muted small" style="text-align:center">(from Newton&rsquo;s second law, <var>F</var> = <var>m</var> <var>a</var>)</p>' + keyList([['a', 'acceleration of the centre of mass (m/s&sup2;)'], ['F<sub>net</sub>', 'net force (N)'], ['m', 'body mass (kg)']]))
        + layer('nums', 'Your numbers', '<div id="nums"></div>'),
      nums: (i) => '<p>' + hov() + ' (' + tIs(i) + '):</p><div class="calc">a = ' + sgn(C.Fn[i], 1) + ' &divide; ' + f(C.m, 2) + ' = <b>' + sgn(C.a[i], 2) + ' m/s&sup2;</b></div>' },
    { key: 'vel', title: 'Velocity: add up the acceleration', panels: ['F', 'a', 'v'], bw: true, area: true, strip: true, q: { q: 'Acceleration is positive (upwards) but velocity is negative (downwards). What is happening?', o: ['Moving down, but slowing down', 'Moving up and speeding up', 'Standing still'], a: 0, why: 'Velocity says which way they are moving (down). Acceleration says which way velocity is changing (towards up), so the downward movement is being slowed. That is braking.' },
      body: () => layer('words', 'In plain words', '<p>Acceleration tells you how quickly velocity changes. Over one sample (' + msT + ' ms), velocity changes by <em>acceleration &times; time</em>. That is the area of one thin strip under the acceleration line (orange, under the graph).</p><p>Start from a moment where we <strong>know</strong> the velocity is zero, then add the strips up one by one: that gives the velocity at every moment. ' + (back ? 'Here that moment is the still standing <strong>after</strong> landing, so we work <strong>backwards in time</strong> from there: <strong>backward integration</strong>. Each step back, we take the strip&rsquo;s area away.' : 'Here that moment is the start of movement, from still standing, and we add the strips <strong>forwards in time</strong>: <strong>forward integration</strong>.') + '</p>' + (j === 'sj' ? '<p>Why backwards for a squat jump? We weighed them after landing (step 3), where they were stiller than in the squat, and that is also where we know the velocity is zero. Starting the integration in the same place keeps everything consistent.</p>' : j === 'dj' ? '<p>Why backwards for a drop jump? They arrive on the plate already moving fast, so there is no moment of zero velocity before touchdown to start from.</p>' : '') + '<p>Adding up strips like this is called <strong>integration</strong>, and the total is the area under the curve.</p>')
        + layer('eq', 'The equation (the trapezoid rule)', (back ? eqn('<var>v</var><sub>earlier</sub> = <var>v</var><sub>later</sub> &minus; &frac12;(<var>a</var><sub>earlier</sub> + <var>a</var><sub>later</sub>) &times; &Delta;<var>t</var>') + '<p class="muted small" style="text-align:center">backwards: take each strip away. (Forwards it would be <var>v</var><sub>new</sub> = <var>v</var><sub>old</sub> + &frac12;(<var>a</var><sub>old</sub> + <var>a</var><sub>new</sub>) &times; &Delta;<var>t</var>.)</p>' : eqn('<var>v</var><sub>new</sub> = <var>v</var><sub>old</sub> + &frac12;(<var>a</var><sub>old</sub> + <var>a</var><sub>new</sub>) &times; &Delta;<var>t</var>')) + keyList([['v', 'velocity of the centre of mass (m/s); positive = upwards'], ['a', 'acceleration at the two edges of the strip'], ['&Delta;t', 'time between samples = 1 &divide; ' + fs + ' = ' + (1 / fs).toFixed(4) + ' s']]) + '<p class="small">Each strip is a trapezoid: its area is the average of its two sides &times; its width. <details class="more"><summary>For the curious</summary><p class="small">Adding up infinitely thin strips is what calculus calls integration: <var>v</var> = &int; <var>a</var> d<var>t</var>. With ' + fs + ' samples a second, the strips are so thin that the trapezoid rule is almost exact.</p></details></p>')
        + layer('nums', 'Your numbers', '<div id="nums"></div>')
        + layer('why', 'Check it worked', '<p>' + (j === 'dj' ? 'There is no still moment before touchdown to check against, so check the velocity at <strong>touchdown</strong> instead. It is <b>' + sgn(C.chk.v, 2) + ' m/s</b>, which means a fall of v&sup2; &divide; 2g = <b>' + f(C.chk.drop * 100, 0) + ' cm</b>. That should be close to the box height you measured.' : 'We also know the velocity should be zero at the other end too, ' + C.chk.where + '. The integration gives <b>' + sgn(C.chk.v, 3) + ' m/s</b> there. ' + (Math.abs(C.chk.v) < 0.05 ? 'Close to zero, so bodyweight and the integration are good.' : 'Not close to zero: was bodyweight right, and was the person really still?')) + '</p>'),
      nums: (i) => { const k = Math.max(1, i); return '<p>' + hov() + ': the strip from ' + ((k - 1) / fs).toFixed(3) + ' to ' + (k / fs).toFixed(3) + ' s.</p>' + (back ? '<div class="calc">v = ' + sgn(C.v[k], 4) + ' &minus; &frac12;(' + sgn(C.a[k - 1], 2) + ' + ' + sgn(C.a[k], 2) + ') &times; ' + (1 / fs).toFixed(4) + ' = <b>' + sgn(C.v[k - 1], 4) + ' m/s</b></div><p class="small muted">Working backwards: the velocity at ' + ((k - 1) / fs).toFixed(3) + ' s comes from the one at ' + (k / fs).toFixed(3) + ' s.</p>' : '<div class="calc">v = ' + sgn(C.v[k - 1], 4) + ' + &frac12;(' + sgn(C.a[k - 1], 2) + ' + ' + sgn(C.a[k], 2) + ') &times; ' + (1 / fs).toFixed(4) + ' = <b>' + sgn(C.v[k], 4) + ' m/s</b></div>') + '<p>' + (C.v[k] < -0.02 ? 'Negative: moving downwards.' : C.v[k] > 0.02 ? 'Positive: moving upwards.' : 'About zero: not moving.') + '</p>'; } },
    { key: 'disp', title: 'Displacement: add up the velocity', panels: ['F', 'a', 'v', 's'], bw: true, q: j === 'sj' ? { q: 'At the very top of the jump, what is the velocity?', o: ['Its most negative', 'Zero', 'Its most positive'], a: 1, why: 'At the top the centre of mass stops going up and is about to come down, so for an instant its velocity is zero. That is where the displacement line reaches its maximum.' } : { q: 'At the lowest point of the ' + (j === 'dj' ? 'landing from the box' : 'dip') + ', what is the velocity?', o: ['Its most negative', 'Zero', 'Its most positive'], a: 1, why: 'At the lowest point the centre of mass stops going down and is about to go up, so for an instant its velocity is zero. That is where the displacement line reaches its minimum.' },
      body: () => layer('words', 'In plain words', '<p>Now do exactly the same again, one level up. Velocity tells you how quickly position changes, so adding up <em>velocity &times; time</em>, strip by strip, gives the <strong>displacement</strong>: how far the centre of mass has moved up or down from where it started.</p><p>Where velocity is negative, displacement goes down; where velocity crosses zero, displacement is at its lowest (or highest) point.</p>' + (j === 'sj' ? '<p>Zero is the starting squat. After landing the person stands up tall, so the line ends well above zero (roughly the distance from their squat to standing).</p><p>Before the push the line drifts slightly, by ' + f(Math.abs(C.s[0] - C.s[D.onset]) * 100, 0) + ' cm. That is the small velocity error from step 6 (' + sgn(C.chk.v, 3) + ' m/s instead of 0), added up over time: it shows how sensitive integration is.</p>' : j === 'cmj' ? '<p>Zero is standing tall before the jump, so after landing and standing back up the line returns to about zero.</p>' : '<p>Zero is the moment of touchdown, so the start, standing on the box, is above zero (roughly the drop height).</p>'))
        + layer('eq', 'The equation', eqn('<var>s</var><sub>new</sub> = <var>s</var><sub>old</sub> + &frac12;(<var>v</var><sub>old</sub> + <var>v</var><sub>new</sub>) &times; &Delta;<var>t</var>') + keyList([['s', 'displacement of the centre of mass (m) from its starting position; positive = higher'], ['v', 'velocity at the two edges of the strip'], ['&Delta;t', (1 / fs).toFixed(4) + ' s']]) + '<details class="more"><summary>For the curious</summary><p class="small"><var>s</var> = &int; <var>v</var> d<var>t</var>: displacement is the integral of velocity, so it is the integral of the integral of acceleration.</p></details>')
        + layer('nums', 'Your numbers', '<div id="nums"></div>'),
      nums: (i) => { const k = Math.max(1, i); return '<p>' + hov() + ' (' + tIs(k) + '):</p><div class="calc">s = ' + sgn(C.s[k - 1], 4) + ' + &frac12;(' + sgn(C.v[k - 1], 3) + ' + ' + sgn(C.v[k], 3) + ') &times; ' + (1 / fs).toFixed(4) + ' = <b>' + sgn(C.s[k], 4) + ' m</b></div><p>That is ' + sgn(C.s[k] * 100, 1) + ' cm from ' + (j === 'dj' ? 'the height at touchdown' : 'the starting position') + '.</p>'; } },
    { key: 'phases', title: 'Reading the phases', panels: ['F', 'v', 's'], shade: 'phases', events: true, bw: true, q: { q: j === 'sj' ? 'In a squat jump, why is there no braking phase?' : 'Where does the braking phase end?', o: j === 'sj' ? ['There is no downward movement to stop', 'The plate cannot measure it', 'It happens in the air'] : ['At peak force', 'Where velocity reaches zero (the lowest point)', 'At take-off'], a: j === 'sj' ? 0 : 1, why: j === 'sj' ? 'The squat jump starts from a still squat and only goes up, so nothing needs slowing down.' : 'Braking slows the downward movement. It is finished when the downward velocity has been brought to zero: the lowest point.' },
      body: () => layer('words', 'In plain words', (j === 'cmj' ? '<p>Now that we have velocity, the phases can be read straight off the graphs:</p><ul><li><strong>Unweighting:</strong> from the start of movement until the <strong>fastest downward velocity</strong>. Force is below bodyweight, so the person speeds up downwards.</li><li><strong>Braking:</strong> from the fastest downward velocity until <strong>velocity = 0</strong> (the lowest point). Force is above bodyweight, so the downward movement is being slowed.</li><li><strong>Propulsion:</strong> from the lowest point until <strong>take-off</strong> (force drops to about zero). They are pushed upwards.</li><li><strong>Flight</strong> and <strong>landing</strong> follow.</li></ul>'
        : j === 'sj' ? '<p>A squat jump starts from a still squat, so it is simpler:</p><ul><li><strong>Propulsion:</strong> from the start of the push until <strong>take-off</strong>. There is no unweighting or braking, because there is no dip.</li><li><strong>Flight</strong> and <strong>landing</strong> follow.</li></ul>'
          : '<p>In a drop jump the person lands from the box and goes straight back up:</p><ul><li><strong>Falling from the box</strong> (before touchdown).</li><li><strong>Braking:</strong> from <strong>touchdown</strong> until <strong>velocity = 0</strong> (the lowest point). The fall is being stopped.</li><li><strong>Propulsion:</strong> from the lowest point until <strong>take-off</strong>.</li><li><strong>Flight</strong> and <strong>landing</strong> follow.</li></ul>') + '<p>Notice where each phase changes: it is always at a clear point on the <em>velocity</em> line (fastest down, or zero), not on the force line.</p>')
        + layer('nums', 'Your numbers', '<table class="hand"><thead><tr><th style="text-align:left">Phase</th><th>From (s)</th><th>To (s)</th><th>Duration (s)</th></tr></thead><tbody>' + C.phases.map((p) => '<tr><td style="text-align:left"><span style="display:inline-block;width:.8rem;height:.8rem;background:' + p.col + ';border-radius:2px;vertical-align:-1px"></span> ' + p.name + '</td><td>' + (p.i0 / fs).toFixed(3) + '</td><td>' + (p.i1 / fs).toFixed(3) + '</td><td>' + ((p.i1 - p.i0) / fs).toFixed(3) + '</td></tr>').join('') + '</tbody></table>') },
    { key: 'height', title: 'Jump height', panels: ['F', 'v', 's'], shade: 'phases', events: true, bw: true, q: { q: 'Take-off velocity is 2.0 m/s. How high does the centre of mass rise?', o: ['About 10 cm', 'About 20 cm', 'About 40 cm'], a: 1, why: 'h = v&sup2; &divide; 2g = 4 &divide; 19.62 = 0.20 m = 20 cm.' },
      body: () => layer('words', 'In plain words', '<p>At take-off the person leaves the plate with some upward velocity. After that only gravity acts, slowing them down by 9.81 m/s every second until they stop at the top. The faster they leave, the higher they go.</p><p>There is a second way: time how long they are in the air. A longer flight means a higher jump.</p>')
        + layer('eq', 'The equations', eqn('<var>h</var> = <var>v</var><sub>TO</sub>&sup2; &divide; 2<var>g</var>') + '<p class="muted small" style="text-align:center">from take-off velocity (the impulse&ndash;momentum method)</p>' + eqn('<var>h</var> = <var>g</var> <var>t</var>&sup2; &divide; 8') + '<p class="muted small" style="text-align:center">from flight time</p>' + keyList([['h', 'jump height: how far the centre of mass rises after take-off (m)'], ['v<sub>TO</sub>', 'velocity at take-off (m/s)'], ['t', 'flight time (s)']]))
        + layer('nums', 'Your numbers', '<div class="calc">v<sub>TO</sub> = <b>' + f(C.tov, 3) + ' m/s</b> (at ' + (D.TO / fs).toFixed(3) + ' s)</div><div class="calc">h = ' + f(C.tov, 3) + '&sup2; &divide; 19.62 = <b>' + f(C.jh * 100, 1) + ' cm</b></div>' + (Number.isFinite(C.ft) ? '<div class="calc">t = ' + (D.LD / fs).toFixed(3) + ' &minus; ' + (D.TO / fs).toFixed(3) + ' = ' + f(C.ft, 3) + ' s; h = 9.81 &times; ' + f(C.ft, 3) + '&sup2; &divide; 8 = <b>' + f(C.jhF * 100, 1) + ' cm</b></div>' : ''))
        + layer('why', 'Why are they different?', '<p>The flight-time method assumes the body is in exactly the same position at landing as at take-off. People usually land with bent knees or flat feet, so they are in the air a little longer and the jump looks ' + (C.jhF > C.jh ? 'higher' : 'different') + ' (' + f(Math.abs(C.jhF - C.jh) * 100, 1) + ' cm here). Take-off velocity measures the rise of the centre of mass directly, so it is the more accurate method.</p>') },
    { key: 'error', title: 'What if bodyweight is wrong?', panels: ['F', 'v', 's'], bw: true, ghost: true, slider: true, q: { q: 'Bodyweight is measured slightly too high. With ' + (back ? 'backward' : 'forward') + ' integration, what happens to jump height?', o: ['It comes out too high', 'It comes out too low', 'Nothing changes'], a: back ? 0 : 1, why: back ? 'Too high a bodyweight makes every acceleration a little too negative. Working backwards, each strip is taken away, so velocity drifts <em>upwards</em> the further back we go, and take-off velocity, and jump height, come out too high. (Move the slider to see it.)' : 'Too high a bodyweight makes every acceleration a little too negative, so velocity drifts downwards as the strips are added and take-off velocity, and jump height, come out too low.' },
      body: () => layer('words', 'In plain words', '<p>Bodyweight is taken off <em>every</em> sample, and every strip is added up. So a tiny error in bodyweight is added in again and again, and grows the longer the integration runs. Move the slider and watch the velocity and displacement drift away from the grey dashed lines (the correct ones).</p><p>' + (back ? 'Here we integrate backwards from standing still after landing, so the error grows the further back in time we go, and it is still growing at take-off.' : 'Here we integrate forwards from standing still before the jump, so the error grows the further forward in time we go.') + ' The drift is the same size either way. Only its direction changes.</p>')
        + '<div class="layer nums"><h3>Try it</h3><div class="row"><label for="adj" style="font-weight:600">Bodyweight error: <span id="adjV">0.0%</span></label></div><input type="range" id="adj" min="-2" max="2" step="0.1" value="' + (S.adj * 100).toFixed(1) + '"><div id="nums"></div></div>'
        + layer('why', 'So', '<p>That is why participants must stand <strong>completely still</strong> for at least a second ' + (back ? 'after landing (and, in a squat jump, hold the squat still before the push)' : 'before the jump') + ', why the plate should be zeroed before each trial, and why step 6 checks that velocity comes back to zero.</p>'),
      nums: () => { const R0 = S.Cref; return '<div class="calc">Bodyweight used: ' + f(S.C.W, 1) + ' N (correct: ' + f(R0.W, 1) + ' N)</div><div class="calc">Take-off velocity: <b>' + f(S.C.tov, 3) + ' m/s</b> (correct: ' + f(R0.tov, 3) + ')</div><div class="calc">Jump height: <b>' + f(S.C.jh * 100, 1) + ' cm</b> (correct: ' + f(R0.jh * 100, 1) + ' cm, ' + (S.C.jh >= R0.jh ? '+' : '&minus;') + f(Math.abs(S.C.jh - R0.jh) * 100, 1) + ' cm)</div>'; } },
    { key: 'hand', title: 'Do it yourself', panels: ['F', 'a', 'v'], bw: true, q: null,
      body: () => layer('words', 'Your turn', '<p>Work through the first few samples ' + (j === 'dj' ? 'after touchdown' : 'from the ' + (j === 'sj' ? 'start of the push' : 'start of movement')) + ' yourself. Type your answers in the blank boxes and press <strong>Check</strong>. ' + (back ? 'The starting velocity is the one worked out backwards from standing still after landing, so it is given' + (j === 'sj' ? ' (it is almost zero, because they start from a still squat)' : '') + '. From there, work forwards with the usual equation.' : 'Velocity starts at 0, because the person starts from still.') + '</p>')
        + '<div id="handBox"></div><div class="row"><button type="button" class="btn" id="handCheck">Check</button><button type="button" class="btn ghost" id="handShow">Show the answers</button><button type="button" class="btn accent" id="handXlsx">Download as an Excel file</button></div><p class="muted small">The Excel file has a blank sheet for you to fill in with formulas, and an answers sheet.</p>' },
    { key: 'other', title: 'Other movements', panels: ['F'], bw: true, q: null,
      body: () => layer('words', 'The same idea, everywhere', '<p>Every force&ndash;time analysis starts the same way: <strong>force minus bodyweight</strong> gives the net force, and net force &divide; mass gives acceleration.</p><ul><li><strong>Isometric mid-thigh pull (IMTP):</strong> nothing moves, so there is no velocity or displacement. We look at the force itself: peak force, force at 100&ndash;250 ms after the pull starts, and how quickly force rises (rate of force development).</li><li><strong>Walking and running:</strong> one foot at a time on the plate, so we look at each foot contact: its peaks, how long it lasts, and the forwards and backwards forces.</li><li><strong>Landing:</strong> how big the peak force is and how quickly it arrives (loading rate).</li><li><strong>Standing long jump:</strong> the same steps as the countermovement jump, done twice: once with the vertical force and once with the horizontal force, giving the take-off velocity forwards as well as upwards.</li></ul><p><a class="btn accent" href="../force-analyser/" style="text-decoration:none;display:inline-block;margin-top:.4rem">Now try your own jump in Force Analysis &rarr;</a></p>') }
  ];
}

// ---------- page ----------
async function load(j) {
  if (!S.data[j]) { const r = await fetch('data/' + j + '.json'); S.data[j] = await r.json(); prepare(S.data[j]); }
  S.jump = j; S.D = S.data[j]; S.adj = 0; S.Cref = compute(S.D, 0); S.C = S.Cref; S.cur = -1; S.strip = -1; S.anim = -1;
  document.querySelectorAll('.jbtn').forEach((b) => b.setAttribute('aria-selected', String(b.getAttribute('data-j') === j)));
  try { history.replaceState(null, '', '#' + j + '-' + (S.step + 1)); } catch (e) { /* ignore */ }
  render();
}
function render() {
  const st = STEPS(), s = st[S.step];
  if (!s.ghost && S.adj) { S.adj = 0; S.C = S.Cref; }
  if (s.strip && S.strip < 0) S.strip = S.D.jump === 'dj' ? S.D.TD + 10 : S.D.onset + Math.round((S.D.TO - S.D.onset) * 0.35);
  if (!s.strip) { S.strip = -1; S.anim = -1; }
  $('progress').innerHTML = st.map((x, k) => '<button type="button" data-s="' + k + '" class="' + (k === S.step ? 'cur' : S.seen[S.jump + k] ? 'done' : '') + '">' + (k + 1) + '. ' + x.title.split(':')[0] + '</button>').join('');
  $('stepTitle').textContent = (S.step + 1) + '. ' + s.title;
  $('stepCount').textContent = S.D.name + ', step ' + (S.step + 1) + ' of ' + st.length;
  $('graphTitle').textContent = S.D.name + ': ' + s.panels.map((k) => PANEL[k][0].split(' (')[0].toLowerCase()).join(', ').replace(/^./, (c) => c.toUpperCase());
  $('stepBody').innerHTML = s.body() + (s.q ? quiz(s.q) : '');
  const hasP = S.D.P && S.D.P.length > 1 && s.panels.includes('F');
  $('plateBox').classList.toggle('hide', !hasP); $('filtFc').textContent = S.D.res.fc + ' Hz';
  if (hasP) $('plateKey').innerHTML = '<span class="sw" style="border-color:' + COL.F + '"></span>Total' + (S.plates ? S.D.P.map((q, pk) => '<span class="sw d" style="border-color:' + PCOL[pk % 2] + '"></span>Platform ' + (pk + 1)).join('') : '');
  $('back').disabled = S.step === 0; $('next').disabled = S.step === st.length - 1;
  $('next').innerHTML = S.step === st.length - 1 ? 'The end' : 'Next &rarr;';
  S.seen[S.jump + S.step] = true;
  extra(s); wire(s); nums(); draw();
  try { history.replaceState(null, '', '#' + S.jump + '-' + (S.step + 1)); } catch (e) { /* ignore */ }
}
function nums() { const s = STEPS()[S.step], el = $('nums'); if (el && s.nums) el.innerHTML = s.nums(exampleI()); }
function wire(s) {
  document.querySelectorAll('[data-q] [data-o]').forEach((b) => b.addEventListener('click', () => {
    const k = +b.getAttribute('data-o'), box = b.closest('[data-q]'), fb = box.querySelector('.fb');
    box.querySelectorAll('[data-o]').forEach((x) => x.classList.remove('right', 'wrong'));
    b.classList.add(k === s.q.a ? 'right' : 'wrong'); fb.hidden = false;
    fb.innerHTML = (k === s.q.a ? '<strong style="color:var(--good)">Yes.</strong> ' : '<strong style="color:var(--bad)">Not quite.</strong> ') + s.q.why;
  }));
  if ($('adj')) $('adj').addEventListener('input', function () { S.adj = +this.value / 100; $('adjV').textContent = (+this.value > 0 ? '+' : '') + (+this.value).toFixed(1) + '%'; S.C = compute(S.D, S.adj); nums(); draw(); });
  if (s.key === 'hand') hand();
}
// the strip under the acceleration curve, drawn large
function extra(s) {
  const el = $('extra');
  if (s.resid) { el.innerHTML = '<div class="residbox"><canvas id="resCv" aria-label="Residual analysis: residual against cut-off frequency"></canvas></div>'; residDraw(); return; }
  if (!s.strip) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="stripbox"><canvas id="stripCv" aria-label="One strip of the area under the acceleration curve"></canvas><div><p style="margin:.1rem 0 .4rem"><strong>One strip, zoomed in.</strong> Its area is the change in velocity over one sample. Move it along the jump:</p><div class="row"><button type="button" class="btn ghost small" data-st="-10">&laquo; 10</button><button type="button" class="btn ghost small" data-st="-1">&lsaquo; 1</button><button type="button" class="btn ghost small" data-st="1">1 &rsaquo;</button><button type="button" class="btn ghost small" data-st="10">10 &raquo;</button><button type="button" class="btn accent small" id="anim">' + (S.D.dir === 'backward' ? 'Watch the strips, working backwards' : 'Watch the strips add up') + '</button></div><div id="stripNums"></div></div></div>';
  el.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', () => { S.strip = Math.max(1, Math.min(S.D.F.length - 2, S.strip + +b.getAttribute('data-st'))); S.anim = -1; S.cur = S.strip + 1; stripDraw(); nums(); draw(); }));
  $('anim').addEventListener('click', animate);
  stripDraw();
}
function residDraw() {
  const cv = $('resCv'); if (!cv) return;
  const Rz = S.D.res, w = cv.clientWidth, h = cv.clientHeight, dpr = window.devicePixelRatio || 1;
  cv.width = w * dpr; cv.height = h * dpr; const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const kc = Rz.F.indexOf(Rz.fc), L = 74, Rm = 16, T0 = 26, B = 36, hi = Math.max(5 * Rz.R[kc], 3 * Rz.a), /* zoomed in on the part that matters; the curve carries on up at low cut-offs */ X = (fc) => L + (fc - 0) / 100 * (w - L - Rm), Y = (r) => T0 + (1 - r / hi) * (h - T0 - B);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.font = '600 13px system-ui, Arial'; ctx.fillStyle = '#0f172a'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('Residual analysis (zoomed in): how much each cut-off takes away', L, 4);
  ctx.font = '12px system-ui, Arial'; ctx.fillStyle = '#475569'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  const ys = niceStep(hi, 4); for (let v = 0; v <= hi; v += ys) { ctx.strokeStyle = '#eef2f7'; ctx.beginPath(); ctx.moveTo(L, Y(v)); ctx.lineTo(w - Rm, Y(v)); ctx.stroke(); ctx.fillText((+v.toFixed(3)).toString(), L - 6, Y(v)); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; for (let fc = 0; fc <= 100; fc += 10) ctx.fillText(String(fc), X(fc), h - B + 5);
  ctx.font = '600 12px system-ui, Arial'; ctx.fillText('Cut-off frequency (Hz)', L + (w - L - Rm) / 2, h - B + 20);
  ctx.save(); ctx.translate(16, T0 + (h - T0 - B) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('Residual (N)', 0, 0); ctx.restore();
  // the straight line through the noise part, back to its intercept
  ctx.setLineDash([6, 4]); ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(X(0), Y(Rz.a)); ctx.lineTo(X(100), Y(Rz.a + Rz.slope * 100)); ctx.stroke(); ctx.setLineDash([]);
  ctx.save(); ctx.beginPath(); ctx.rect(L, T0, w - L - Rm, h - T0 - B); ctx.clip();
  ctx.strokeStyle = COL.F; ctx.lineWidth = 2; ctx.beginPath(); Rz.F.forEach((fc, k) => { if (k) ctx.lineTo(X(fc), Y(Rz.R[k])); else ctx.moveTo(X(fc), Y(Rz.R[k])); }); ctx.stroke(); ctx.restore();
  // the chosen cut-off
  const k = kc; ctx.strokeStyle = '#d55e00'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(X(Rz.fc), T0); ctx.lineTo(X(Rz.fc), h - B); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#d55e00'; ctx.beginPath(); ctx.arc(X(Rz.fc), Y(Rz.R[k]), 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.font = '600 12px system-ui, Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText('cut-off ' + Rz.fc + ' Hz', X(Rz.fc) + 7, Y(Rz.R[k]) - 6);
  ctx.font = '12px system-ui, Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; const lx = w - Rm - 300;
  ctx.strokeStyle = COL.F; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lx, T0 + 8); ctx.lineTo(lx + 22, T0 + 8); ctx.stroke(); ctx.fillStyle = '#334155'; ctx.fillText('residual at each cut-off', lx + 28, T0 + 8);
  ctx.strokeStyle = '#94a3b8'; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(lx, T0 + 26); ctx.lineTo(lx + 22, T0 + 26); ctx.stroke(); ctx.setLineDash([]); ctx.fillText('straight line through the noise', lx + 28, T0 + 26);
  ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(L, T0); ctx.lineTo(L, h - B); ctx.lineTo(w - Rm, h - B); ctx.stroke();
}
function stripDraw() {
  const cv = $('stripCv'); if (!cv) return;
  const C = S.C, D = S.D, i = S.strip, dt = 1 / D.fs, w = cv.clientWidth, h = cv.clientHeight, dpr = window.devicePixelRatio || 1;
  cv.width = w * dpr; cv.height = h * dpr; const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const a0 = C.a[i], a1 = C.a[i + 1], lo = Math.min(0, a0, a1), hi = Math.max(0, a0, a1), pad = (hi - lo) * 0.25 || 1;
  const Y = (v) => 14 + (hi + pad - v) / (hi - lo + 2 * pad) * (h - 40), x0 = w * 0.25, x1 = w * 0.75;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#94a3b8'; ctx.beginPath(); ctx.moveTo(10, Y(0)); ctx.lineTo(w - 10, Y(0)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x0, Y(0)); ctx.lineTo(x0, Y(a0)); ctx.lineTo(x1, Y(a1)); ctx.lineTo(x1, Y(0)); ctx.closePath(); ctx.fillStyle = 'rgba(245,158,11,.45)'; ctx.fill(); ctx.strokeStyle = '#b45309'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.strokeStyle = COL.a; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x0 - (x1 - x0) * 0.4, Y(a0 - (a1 - a0) * 0.4)); ctx.lineTo(x1 + (x1 - x0) * 0.4, Y(a1 + (a1 - a0) * 0.4)); ctx.stroke();
  ctx.fillStyle = '#334155'; ctx.font = '12px system-ui, Arial'; ctx.textAlign = 'center';
  ctx.fillText('a = ' + a0.toFixed(2), x0, Y(a0) + (a0 >= 0 ? -6 : 16)); ctx.fillText('a = ' + a1.toFixed(2), x1, Y(a1) + (a1 >= 0 ? -6 : 16));
  ctx.fillText('Δt = ' + (dt * 1000).toFixed(dt * 1000 % 1 ? 1 : 0) + ' ms', (x0 + x1) / 2, h - 8); ctx.fillText('0', 18, Y(0) - 4);
  const area = (a0 + a1) / 2 * dt;
  $('stripNums').innerHTML = '<div class="calc">area = &frac12;(' + sgn(a0, 2) + ' + ' + sgn(a1, 2) + ') &times; ' + dt.toFixed(4) + ' = <b>' + sgn(area, 5) + ' m/s</b></div>' + (D.dir === 'backward'
    ? '<div class="calc">v<sub>before</sub> = ' + sgn(C.v[i + 1], 4) + ' &minus; (' + sgn(area, 5) + ') = <b>' + sgn(C.v[i], 4) + ' m/s</b></div>'
    : '<div class="calc">v<sub>after</sub> = ' + sgn(C.v[i], 4) + ' + (' + sgn(area, 5) + ') = <b>' + sgn(C.v[i + 1], 4) + ' m/s</b></div>');
}
function animate() {
  const D = S.D, C = S.C, t0 = performance.now(), dur = 4000;
  const i0 = C.start, i1 = D.dir === 'backward' ? Math.max(0, C.stepOff) : (D.LD > 0 ? D.LD : D.TO); // backwards: from standing after landing back to the start
  const stepA = (now) => { const p = Math.min(1, (now - t0) / dur); S.anim = Math.round(i0 + (i1 - i0) * p); S.strip = Math.max(1, Math.min(S.D.F.length - 2, S.anim - 1)); S.cur = S.anim; draw(); stripDraw(); nums(); if (p < 1 && STEPS()[S.step].strip) requestAnimationFrame(stepA); else { S.anim = -1; draw(); } };
  requestAnimationFrame(stepA);
}

// ---------- do it yourself ----------
function handRows() {
  const D = S.D, C = S.Cref, start = D.jump === 'dj' ? D.TD : D.onset, rows = [];
  for (let k = 0; k < 8; k++) { const i = start + k; rows.push({ i, t: i / D.fs, F: C.F[i], Fn: C.Fn[i], a: C.a[i], v: C.v[i] }); }
  return rows;
}
function hand() {
  const C = S.Cref, R = handRows();
  let h = '<div class="calc">W = <b>' + f(C.W, 1) + ' N</b> &nbsp; m = <b>' + f(C.m, 2) + ' kg</b> &nbsp; &Delta;t = <b>' + (1 / S.D.fs).toFixed(4) + ' s</b></div>';
  h += '<div style="overflow-x:auto"><table class="hand"><thead><tr><th>t (s)</th><th>F (N)</th><th>F<sub>net</sub> (N)</th><th>a (m/s&sup2;)</th><th>v (m/s)</th></tr></thead><tbody>';
  R.forEach((r, k) => { h += '<tr><td>' + r.t.toFixed(3) + '</td><td>' + r.F.toFixed(1) + '</td><td><input data-c="Fn" data-k="' + k + '" inputmode="decimal" aria-label="Net force, row ' + (k + 1) + '"></td><td><input data-c="a" data-k="' + k + '" inputmode="decimal" aria-label="Acceleration, row ' + (k + 1) + '"></td><td>' + (k === 0 ? r.v.toFixed(4) : '<input data-c="v" data-k="' + k + '" inputmode="decimal" aria-label="Velocity, row ' + (k + 1) + '">') + '</td></tr>'; });
  $('handBox').innerHTML = h + '</tbody></table></div><p id="handFb" class="small"></p>';
  const tol = { Fn: (x) => Math.max(0.6, Math.abs(x) * 0.01), a: (x) => Math.max(0.01, Math.abs(x) * 0.01), v: (x) => Math.max(0.0005, Math.abs(x) * 0.02) };
  $('handCheck').addEventListener('click', () => {
    let ok = 0, all = 0;
    document.querySelectorAll('#handBox input').forEach((inp) => { const r = R[+inp.dataset.k], c = inp.dataset.c, want = r[c], got = parseFloat(inp.value.replace('−', '-')); inp.classList.remove('ok', 'no'); if (inp.value.trim() === '') return; all++; if (Math.abs(got - want) <= tol[c](want)) { ok++; inp.classList.add('ok'); } else inp.classList.add('no'); });
    $('handFb').innerHTML = all ? ok + ' of ' + all + ' right.' + (ok < all ? ' Red ones are out: check the sign (negative means down) and the order: net force, then acceleration, then velocity.' : ' Well done.') : 'Type some answers first.';
  });
  $('handShow').addEventListener('click', () => { document.querySelectorAll('#handBox input').forEach((inp) => { const r = R[+inp.dataset.k], c = inp.dataset.c; inp.value = r[c].toFixed(c === 'Fn' ? 1 : c === 'a' ? 3 : 4); inp.classList.remove('ok', 'no'); }); });
  $('handXlsx').addEventListener('click', xlsx);
}
function xlsx() {
  const D = S.D, C = S.Cref, R = handRows(), esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cell = (ref, v) => (typeof v === 'number' ? '<c r="' + ref + '"><v>' + v + '</v></c>' : v && v[0] === '=' ? '<c r="' + ref + '"><f>' + esc(v.slice(1)) + '</f></c>' : '<c r="' + ref + '" t="inlineStr"><is><t>' + esc(v) + '</t></is></c>');
  const sheet = (rows) => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="30" customWidth="1"/><col min="2" max="6" width="14" customWidth="1"/></cols><sheetData>' + rows.map((r, k) => '<row r="' + (k + 1) + '">' + r.map((v, c) => (v === null || v === undefined ? '' : cell(String.fromCharCode(65 + c) + (k + 1), v))).join('') + '</row>').join('') + '</sheetData></worksheet>';
  const head = (ans) => [['Force to Motion: ' + D.name + (ans ? ' (answers)' : ' (your turn)')], [], ['Bodyweight W (N)', +C.W.toFixed(2)], ['Body mass m (kg)', '=B3/9.81'], ['Time between samples dt (s)', +(1 / D.fs).toFixed(6)], [], ['', 't (s)', 'F (N)', 'Fnet = F - W (N)', 'a = Fnet / m (m/s²)', 'v = v_prev + ½(a_prev + a) × dt (m/s)']];
  const body = (ans) => R.map((r, k) => { const n = 8 + k; return ['Sample ' + (k + 1), +r.t.toFixed(4), +r.F.toFixed(1), ans ? '=C' + n + '-$B$3' : null, ans ? '=D' + n + '/$B$4' : null, k === 0 ? +r.v.toFixed(6) : ans ? '=F' + (n - 1) + '+0.5*(E' + (n - 1) + '+E' + n + ')*$B$5' : null]; });
  const s1 = head(false).concat(body(false), [[], ['Fill in the blank cells with formulas (e.g. in D8 type =C8-$B$3), then copy them down.']]), s2 = head(true).concat(body(true));
  const files = [
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Your turn" sheetId="1" r:id="rId1"/><sheet name="Answers" sheetId="2" r:id="rId2"/></sheets><calcPr fullCalcOnLoad="1"/></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>' },
    { name: 'xl/worksheets/sheet1.xml', data: sheet(s1) },
    { name: 'xl/worksheets/sheet2.xml', data: sheet(s2) }
  ];
  const b = zip(files), url = URL.createObjectURL(new Blob([b], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })), a = document.createElement('a');
  a.href = url; a.download = 'force_to_motion_' + D.jump + '.xlsx'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 800);
}

// ---------- start ----------
function hover(e) {
  if (!G0) return; const r = $('ov').getBoundingClientRect(), x = e.clientX - r.left;
  if (x < G0.L || x > G0.w - G0.R) { S.cur = -1; } else { const t = (x - G0.L) / (G0.w - G0.L - G0.R) * G0.x1; S.cur = Math.max(1, Math.min(S.D.F.length - 1, Math.round(t * S.D.fs))); }
  drawCursor(); nums();
}
document.querySelectorAll('.jbtn').forEach((b) => b.addEventListener('click', () => load(b.getAttribute('data-j'))));
$('progress').addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (b) { S.step = +b.getAttribute('data-s'); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
$('back').addEventListener('click', () => { if (S.step > 0) { S.step--; render(); } });
$('next').addEventListener('click', () => { if (S.step < STEPS().length - 1) { S.step++; render(); } });
$('ov').addEventListener('mousemove', hover);
$('showPlates').addEventListener('change', function () { S.plates = this.checked; render(); });
$('filtOn').addEventListener('change', function () { S.filt = this.checked; S.Cref = compute(S.D, 0); S.C = S.adj ? compute(S.D, S.adj) : S.Cref; render(); });
$('ov').addEventListener('mouseleave', () => { S.cur = -1; drawCursor(); nums(); });
$('ov').addEventListener('touchmove', (e) => { if (e.touches[0]) hover(e.touches[0]); }, { passive: true });
document.addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT') return; if (e.key === 'ArrowRight' && S.step < STEPS().length - 1) { S.step++; render(); } if (e.key === 'ArrowLeft' && S.step > 0) { S.step--; render(); } });
window.addEventListener('resize', () => { if (S.D) { draw(); stripDraw(); } });
const m = (location.hash || '').match(/^#(cmj|sj|dj)-(\d+)/);
if (m) S.step = Math.max(0, +m[2] - 1);
load(m ? m[1] : 'cmj');
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
