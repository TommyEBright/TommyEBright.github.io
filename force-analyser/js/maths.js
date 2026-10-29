// Filtering, integration and small statistics.
// References: Robertson et al. (2014) Research Methods in Biomechanics, 2nd ed., ch. 4 and 12;
// Winter (2009) Biomechanics and Motor Control of Human Movement, 4th ed., ch. 2-3.

export const G = 9.81;

// ---------- filtering ----------
// The same filter as Kinematic Analysis: a 2nd-order Butterworth low-pass run forwards then backwards
// (zero lag, 4th order overall), with the cut-off corrected for the two passes (C = 0.802; Winter, 2009).
// Force data are sampled much faster than video, so the ends are padded for longer (about three
// cut-off periods) to stop start-up transients reaching the data.
export function butter(x, fc, fs) {
  const n = x.length; if (n < 7 || !(fc > 0) || fc >= fs / 2) return Float64Array.from(x);
  const wc = Math.tan(Math.PI * fc / fs) / 0.802;
  const K1 = Math.SQRT2 * wc, K2 = wc * wc;
  const a0 = K2 / (1 + K1 + K2), a1 = 2 * a0, a2 = a0, K3 = 2 * a0 / K2;
  const b1 = -2 * a0 + K3, b2 = 1 - 2 * a0 - K3;
  const pad = Math.min(n - 1, Math.max(20, Math.round(3 * fs / fc)));
  const m = n + 2 * pad, ext = new Float64Array(m);
  // odd reflection at both ends keeps the slope and limits start/end transients
  for (let i = 0; i < pad; i++) ext[i] = 2 * x[0] - x[pad - i];
  for (let i = 0; i < n; i++) ext[pad + i] = x[i];
  for (let i = 0; i < pad; i++) ext[pad + n + i] = 2 * x[n - 1] - x[n - 2 - i];
  const pass = (v) => { const o = Float64Array.from(v); for (let k = 2; k < v.length; k++) o[k] = a0 * v[k] + a1 * v[k - 1] + a2 * v[k - 2] + b1 * o[k - 1] + b2 * o[k - 2]; return o; };
  const f1 = pass(ext); f1.reverse(); const f2 = pass(f1); f2.reverse();
  return f2.slice(pad, pad + n);
}

// Residual analysis (Winter, 2009): residual vs cut-off, a straight line fitted to the high-frequency
// (noise) part, and the cut-off where the residual meets that line's intercept.
export function residualCurve(x, fs) {
  const fmax = Math.min(fs * 0.4, 100);
  if (fmax < 4 || x.length < 15) return null;
  const F = [], R = [];
  const step = fmax > 40 ? 1 : 0.5;
  for (let fc = 1; fc <= fmax + 1e-9; fc += step) {
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

// ---------- integration ----------
// Robertson et al. (2014, ch. 4): v_i = v_(i-1) + a_i dt (rectangle / Riemann sum), or the more accurate
// trapezoid rule v_i = v_(i-1) + (a_(i-1) + a_i) / 2 x dt. Displacement comes from velocity the same way.
// Forward: from a known start (i0, v0, s0) onwards. Earlier samples are left as NaN.
export function integrateForward(y, dt, i0, y0, method, out) {
  const n = y.length; out = out || new Float64Array(n).fill(NaN);
  out[i0] = y0;
  for (let i = i0 + 1; i < n; i++) out[i] = out[i - 1] + (method === 'rect' ? y[i] : (y[i] + y[i - 1]) / 2) * dt;
  return out;
}
// Backward: from a known end (iEnd, yEnd) back to the start, i.e. y_(i-1) = y_i - area of the strip.
export function integrateBackward(y, dt, iEnd, yEnd, method, out) {
  const n = y.length; out = out || new Float64Array(n).fill(NaN);
  out[iEnd] = yEnd;
  for (let i = iEnd; i > 0; i--) out[i - 1] = out[i] - (method === 'rect' ? y[i] : (y[i] + y[i - 1]) / 2) * dt;
  return out;
}

// Area under y between samples i0 and i1 (inclusive) by the trapezoid rule (or rectangles).
export function area(y, dt, i0, i1, method, sub) {
  sub = sub || 0; let s = 0;
  if (i1 <= i0) return 0;
  if (method === 'rect') { for (let i = i0 + 1; i <= i1; i++) s += (y[i] - sub) * dt; return s; }
  for (let i = i0 + 1; i <= i1; i++) s += ((y[i] + y[i - 1]) / 2 - sub) * dt;
  return s;
}

// ---------- statistics ----------
export function mean(y, i0, i1) { let s = 0, k = 0; for (let i = i0; i < i1; i++) { s += y[i]; k++; } return k ? s / k : NaN; }
export function sd(y, i0, i1) { const m = mean(y, i0, i1); let s = 0, k = 0; for (let i = i0; i < i1; i++) { s += (y[i] - m) ** 2; k++; } return k > 1 ? Math.sqrt(s / (k - 1)) : NaN; }
export function argmax(y, i0, i1) { let b = -1; for (let i = i0; i < i1; i++) if (b < 0 || y[i] > y[b]) b = i; return b; }
export function argmin(y, i0, i1) { let b = -1; for (let i = i0; i < i1; i++) if (b < 0 || y[i] < y[b]) b = i; return b; }
export function meanSD(arr) {
  const v = arr.filter((x) => x !== null && x !== undefined && Number.isFinite(x));
  if (!v.length) return { m: NaN, s: NaN, n: 0 };
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  const s = v.length > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)) : NaN;
  return { m, s, n: v.length };
}

// Window of length L samples between i0 and i1 with the smallest standard deviation (prefix sums, so fast).
export function quietestWindow(y, i0, i1, L) {
  if (i1 - i0 < L || L < 2) return null;
  const n = i1 - i0, S = new Float64Array(n + 1), Q = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { S[i + 1] = S[i] + y[i0 + i]; Q[i + 1] = Q[i] + y[i0 + i] * y[i0 + i]; }
  let best = -1, bsd = Infinity;
  for (let k = 0; k + L <= n; k++) {
    const s = S[k + L] - S[k], q = Q[k + L] - Q[k];
    const v = Math.max(0, (q - s * s / L) / (L - 1));
    if (v < bsd - 1e-12) { bsd = v; best = k; }
  }
  return best < 0 ? null : { s: i0 + best, e: i0 + best + L, sd: Math.sqrt(bsd) };
}

// Linear interpolation for time normalisation. Force data are sampled so densely (hundreds to thousands of
// samples a second) that a straight line between neighbouring samples is as good as a spline.
export function resample(x, y, xs) {
  let j = 0; const n = x.length;
  return xs.map((xv) => {
    while (j < n - 2 && x[j + 1] < xv) j++;
    const f = (xv - x[j]) / (x[j + 1] - x[j]);
    return y[j] + (y[j + 1] - y[j]) * Math.max(0, Math.min(1, f));
  });
}
