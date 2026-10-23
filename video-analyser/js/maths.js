// Calibration, filtering, differentiation and angle maths.
// References: Winter (2009) Biomechanics and Motor Control of Human Movement, 4th ed., ch. 2-3;
// Hamill, Knutzen & Derrick (2015) Biomechanical Basis of Human Movement, 4th ed., ch. 8-9.
import { A, tReal, fpsReal } from './state.js?v=2.0.2';

// ---------- calibration ----------
export function scale() {
  const c = A.S.calib; if (!c) return null;
  return c.len / Math.hypot(c.p2[0] - c.p1[0], c.p2[1] - c.p1[1]);
}
// Angle (radians) between the calibration line and the nearest image axis.
export function tiltAngle() {
  const c = A.S.calib; if (!c) return 0;
  const ang = Math.atan2(c.p2[1] - c.p1[1], c.p2[0] - c.p1[0]);
  return ang - Math.round(ang / (Math.PI / 2)) * (Math.PI / 2);
}
export function origin() { return A.S.origin || (A.S.calib ? A.S.calib.p1 : [0, A.S.vh]); }
// Pixels (image, y down) -> world (metres if calibrated), x forwards, y up.
export function toWorld(p) {
  const S = A.S, k = scale() || 1, o = origin();
  let dx = p[0] - o[0], dy = p[1] - o[1];
  if (S.tilt && S.calib) { const t = -tiltAngle(), c = Math.cos(t), s = Math.sin(t); const rx = dx * c - dy * s, ry = dx * s + dy * c; dx = rx; dy = ry; }
  const x = dx * k, y = -dy * k;
  return [S.dir === 'right' ? x : -x, y];
}
// World -> pixels (used to draw the calibrated grid).
export function toPixel(w) {
  const S = A.S, k = scale() || 1, o = origin();
  let dx = (S.dir === 'right' ? w[0] : -w[0]) / k, dy = -w[1] / k;
  if (S.tilt && S.calib) { const t = tiltAngle(), c = Math.cos(t), s = Math.sin(t); const rx = dx * c - dy * s, ry = dx * s + dy * c; dx = rx; dy = ry; }
  return [o[0] + dx, o[1] + dy];
}
export function units() { return A.S.calib ? 'm' : 'px'; }

// ---------- angles ----------
export function jointAngle(a, b, c) { // included angle at b (degrees); 180 = straight
  const v1x = a[0] - b[0], v1y = a[1] - b[1], v2x = c[0] - b[0], v2y = c[1] - b[1];
  const d = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y); if (!d) return NaN;
  return Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / d))) * 180 / Math.PI;
}
// World coordinates (x forwards, y up).
export function segFromVertical(lower, upper) { return Math.atan2(upper[0] - lower[0], upper[1] - lower[1]) * 180 / Math.PI; }
export function segFromHorizontal(from, to) { return Math.atan2(to[1] - from[1], to[0] - from[0]) * 180 / Math.PI; }
export function angleValue(def, P) { // P: name -> world coords
  if (def.type === 'joint') { const v = jointAngle(P[def.a], P[def.b], P[def.c]); return def.flex ? 180 - v : v; }
  if (def.type === 'vertical') return segFromVertical(P[def.a], P[def.b]);
  return segFromHorizontal(P[def.a], P[def.b]);
}
export function anglePoints(def) { return def.type === 'joint' ? [def.a, def.b, def.c] : [def.a, def.b]; }

// ---------- filtering ----------
// 2nd-order Butterworth low-pass run forwards then backwards (zero lag, 4th order overall).
// The cut-off is corrected for the two passes with C = 0.802 (Winter, 2009).
export function butter(x, fc, fs) {
  const n = x.length; if (n < 7) return x.slice();
  const wc = Math.tan(Math.PI * fc / fs) / 0.802;
  const K1 = Math.SQRT2 * wc, K2 = wc * wc;
  const a0 = K2 / (1 + K1 + K2), a1 = 2 * a0, a2 = a0, K3 = 2 * a0 / K2;
  const b1 = -2 * a0 + K3, b2 = 1 - 2 * a0 - K3;
  const pad = Math.min(n - 1, 20), ext = [];
  // odd reflection at both ends keeps the slope and limits start/end transients
  for (let i = pad; i >= 1; i--) ext.push(2 * x[0] - x[i]);
  for (let i = 0; i < n; i++) ext.push(x[i]);
  for (let i = n - 2; i >= n - 1 - pad; i--) ext.push(2 * x[n - 1] - x[i]);
  const pass = (v) => { const o = v.slice(); for (let k = 2; k < v.length; k++) o[k] = a0 * v[k] + a1 * v[k - 1] + a2 * v[k - 2] + b1 * o[k - 1] + b2 * o[k - 2]; return o; };
  const f1 = pass(ext); f1.reverse(); const f2 = pass(f1); f2.reverse();
  return f2.slice(pad, pad + n);
}

// Residual analysis (Winter, 2009): residual vs cut-off, a straight line fitted to the
// high-frequency (noise) part, and the cut-off where the residual meets that line's intercept.
export function residualCurve(x, fs) {
  const fmax = Math.min(fs / 2 * 0.85, 30);
  if (fmax < 4 || x.length < 15) return null;
  const F = [], R = [];
  for (let fc = 1; fc <= fmax + 1e-9; fc += 0.5) {
    const y = butter(x, fc, fs); let r = 0;
    for (let i = 0; i < x.length; i++) r += (x[i] - y[i]) ** 2;
    F.push(fc); R.push(Math.sqrt(r / x.length));
  }
  const k0 = Math.floor(F.length * 0.55), n = F.length - k0; if (n < 4) return null;
  let mx = 0, my = 0; for (let i = k0; i < F.length; i++) { mx += F[i]; my += R[i]; } mx /= n; my /= n;
  let sxy = 0, sxx = 0; for (let i = k0; i < F.length; i++) { sxy += (F[i] - mx) * (R[i] - my); sxx += (F[i] - mx) ** 2; }
  const slope = sxy / sxx, a = my - slope * mx;
  let fc = null; if (a > 0) for (let i = 0; i < F.length; i++) if (R[i] <= a) { fc = F[i]; break; }
  return { F, R, a, slope, fc };
}

// ---------- differentiation ----------
// First central difference: v_i = (x_{i+1} - x_{i-1}) / (t_{i+1} - t_{i-1}).
export function centralDiff(t, x) {
  const v = new Array(x.length).fill(null);
  for (let i = 1; i < x.length - 1; i++) if (x[i + 1] !== null && x[i - 1] !== null) v[i] = (x[i + 1] - x[i - 1]) / (t[i + 1] - t[i - 1]);
  return v;
}
// Second central difference (works for unequal spacing).
export function secondDiff(t, x) {
  const a = new Array(x.length).fill(null);
  for (let i = 1; i < x.length - 1; i++) {
    if (x[i + 1] === null || x[i - 1] === null) continue;
    const h1 = t[i] - t[i - 1], h2 = t[i + 1] - t[i];
    a[i] = 2 * (h1 * x[i + 1] - (h1 + h2) * x[i] + h2 * x[i - 1]) / (h1 * h2 * (h1 + h2));
  }
  return a;
}

// ---------- building a regular time series for one point ----------
// Uses the most common frame spacing; short gaps are filled with a natural cubic spline
// through the neighbouring samples (linear if there are too few). Gaps longer than 6 steps are flagged.
export function series(marker, layer) {
  const L = layer || A.S.frames;
  const fr = Object.keys(L).map(Number).filter((f) => L[f] && L[f][marker]).sort((a, b) => a - b);
  if (fr.length < 3) return null;
  const cnt = {}; for (let i = 1; i < fr.length; i++) { const d = fr[i] - fr[i - 1]; cnt[d] = (cnt[d] || 0) + 1; }
  const step = +Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a] || a - b)[0];
  const W = fr.map((f) => toWorld(L[f][marker]));
  const sx = spline(fr, W.map((w) => w[0])), sy = spline(fr, W.map((w) => w[1]));
  const F = [], X = [], Y = [], filled = [];
  let longGap = false;
  for (let f = fr[0]; f <= fr[fr.length - 1]; f += step) {
    const p = L[f] && L[f][marker];
    if (p) { const w = toWorld(p); F.push(f); X.push(w[0]); Y.push(w[1]); filled.push(false); continue; }
    let lo = null, hi = null;
    for (let j = fr.length - 1; j >= 0; j--) if (fr[j] < f) { lo = fr[j]; break; }
    for (let j = 0; j < fr.length; j++) if (fr[j] > f) { hi = fr[j]; break; }
    if (lo === null || hi === null) continue;
    if (hi - lo > 6 * step) longGap = true;
    F.push(f); X.push(sx(f)); Y.push(sy(f)); filled.push(true);
  }
  return { F, T: F.map(tReal), X, Y, step, filled, longGap, fs: fpsReal() / step };
}
// Natural cubic spline interpolant.
export function spline(xs, ys) {
  const n = xs.length;
  if (n < 3) return (x) => { const i = Math.max(0, Math.min(n - 2, xs.findIndex((v) => v > x) - 1)); const r = (x - xs[i]) / (xs[i + 1] - xs[i]); return ys[i] + r * (ys[i + 1] - ys[i]); };
  const h = [], al = new Array(n).fill(0), l = new Array(n).fill(1), mu = new Array(n).fill(0), z = new Array(n).fill(0);
  const c = new Array(n).fill(0), b = new Array(n - 1), d = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) h.push(xs[i + 1] - xs[i]);
  for (let i = 1; i < n - 1; i++) al[i] = 3 / h[i] * (ys[i + 1] - ys[i]) - 3 / h[i - 1] * (ys[i] - ys[i - 1]);
  for (let i = 1; i < n - 1; i++) { l[i] = 2 * (xs[i + 1] - xs[i - 1]) - h[i - 1] * mu[i - 1]; mu[i] = h[i] / l[i]; z[i] = (al[i] - h[i - 1] * z[i - 1]) / l[i]; }
  for (let j = n - 2; j >= 0; j--) { c[j] = z[j] - mu[j] * c[j + 1]; b[j] = (ys[j + 1] - ys[j]) / h[j] - h[j] * (c[j + 1] + 2 * c[j]) / 3; d[j] = (c[j + 1] - c[j]) / (3 * h[j]); }
  return (x) => {
    let i = 0; while (i < n - 2 && x > xs[i + 1]) i++;
    const dx = x - xs[i]; return ys[i] + b[i] * dx + c[i] * dx * dx + d[i] * dx * dx * dx;
  };
}

export function mean(a) { return a.reduce((s, x) => s + x, 0) / a.length; }
export function sd(a) { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); }
