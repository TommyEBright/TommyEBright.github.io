// Signal processing for EMG, written to give the same numbers as MATLAB and SciPy.
// Butterworth filters are designed exactly as MATLAB's butter() does (analogue prototype -> frequency
// transform -> bilinear transform), kept as second-order sections for accuracy, and run forwards and
// backwards (zero lag) like filtfilt, with the ends padded by an odd (point) reflection.

// ---------- complex numbers ----------
const C = (re, im) => ({ re, im: im || 0 });
const add = (a, b) => C(a.re + b.re, a.im + b.im);
const sub = (a, b) => C(a.re - b.re, a.im - b.im);
const mul = (a, b) => C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const div = (a, b) => { const d = b.re * b.re + b.im * b.im; return C((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
const csqrt = (a) => { const r = Math.hypot(a.re, a.im); let re = Math.sqrt((r + a.re) / 2), im = Math.sqrt(Math.max(0, (r - a.re) / 2)); if (a.im < 0) im = -im; return C(re, im); };
const prod = (list) => list.reduce((p, z) => mul(p, z), C(1, 0));

// Analogue Butterworth prototype: poles on the unit circle in the left half-plane.
function buttap(N) {
  const p = [];
  for (let k = 1; k <= N; k++) { const th = Math.PI * (2 * k + N - 1) / (2 * N); p.push(C(Math.cos(th), Math.sin(th))); }
  return { z: [], p, k: 1 };
}

// Butterworth design in zeros, poles and gain. type: 'low' | 'high' | 'band'. f: cut-off(s) in Hz.
export function butterZpk(N, f, type, fs) {
  const warp = (fc) => 2 * fs * Math.tan(Math.PI * fc / fs);
  let { z, p, k } = buttap(N);
  if (type === 'low') {
    const wo = warp(f); p = p.map((q) => mul(q, C(wo))); k = k * Math.pow(wo, N);
  } else if (type === 'high') {
    const wo = warp(f);
    const kk = div(C(1), prod(p.map((q) => C(-q.re, -q.im))));
    p = p.map((q) => div(C(wo), q)); z = Array.from({ length: N }, () => C(0)); k = k * kk.re;
  } else {
    const wl = warp(f[0]), wh = warp(f[1]), bw = wh - wl, wo = Math.sqrt(wl * wh);
    const ps = p.map((q) => mul(q, C(bw / 2)));
    const np = [];
    ps.forEach((q) => { const r = csqrt(sub(mul(q, q), C(wo * wo))); np.push(add(q, r)); np.push(sub(q, r)); });
    p = np; z = Array.from({ length: N }, () => C(0)); k = k * Math.pow(bw, N);
  }
  // bilinear transform
  const fs2 = 2 * fs;
  const zd = z.map((q) => div(add(C(fs2), q), sub(C(fs2), q)));
  const pd = p.map((q) => div(add(C(fs2), q), sub(C(fs2), q)));
  while (zd.length < pd.length) zd.push(C(-1));
  const kd = k * div(prod(z.map((q) => sub(C(fs2), q))), prod(p.map((q) => sub(C(fs2), q)))).re;
  return { z: zd, p: pd, k: kd };
}

// Groups the poles into conjugate pairs and the zeros (all real here) into second-order sections.
export function zpk2sos(zpk) {
  const tol = 1e-10;
  const poles = zpk.p.slice(), zr = zpk.z.map((q) => q.re);
  const pairs = [];
  const used = new Array(poles.length).fill(false);
  const reals = [];
  poles.forEach((q, i) => {
    if (used[i]) return;
    if (Math.abs(q.im) < tol) { reals.push(q.re); used[i] = true; return; }
    let best = -1, bd = Infinity;
    poles.forEach((r, j) => { if (j === i || used[j]) return; const d = Math.hypot(r.re - q.re, r.im + q.im); if (d < bd) { bd = d; best = j; } });
    used[i] = true; used[best] = true;
    pairs.push([1, -2 * q.re, q.re * q.re + q.im * q.im]);
  });
  for (let i = 0; i < reals.length; i += 2) {
    if (i + 1 < reals.length) pairs.push([1, -(reals[i] + reals[i + 1]), reals[i] * reals[i + 1]]);
    else pairs.push([1, -reals[i], 0]);
  }
  // zeros: share +1 and -1 out so each section gets one of each where possible (band-pass), else two the same
  const pos = zr.filter((v) => v > 0), neg = zr.filter((v) => v <= 0);
  const sos = pairs.map((a) => {
    const order = a[2] === 0 ? 1 : 2, zs = [];
    for (let j = 0; j < order; j++) {
      if (pos.length && (neg.length === 0 || (j === 0))) zs.push(pos.shift());
      else if (neg.length) zs.push(neg.shift());
    }
    let b;
    if (zs.length === 2) b = [1, -(zs[0] + zs[1]), zs[0] * zs[1]];
    else if (zs.length === 1) b = [1, -zs[0], 0];
    else b = [1, 0, 0];
    return [b[0], b[1], b[2], a[0], a[1], a[2]];
  });
  sos[0][0] *= zpk.k; sos[0][1] *= zpk.k; sos[0][2] *= zpk.k;
  return sos;
}

export function butterSos(N, f, type, fs) { return zpk2sos(butterZpk(N, f, type, fs)); }

// Steady-state starting values for each section (as SciPy's sosfilt_zi).
function sosZi(sos) {
  let scale = 1;
  return sos.map((s) => {
    const [b0, b1, b2, , a1, a2] = s;
    // (I - A^T) zi = B for the transposed direct form II
    const m00 = 1 + a1, m01 = -1, m10 = a2, m11 = 1;
    const B0 = b1 - a1 * b0, B1 = b2 - a2 * b0;
    const det = m00 * m11 - m01 * m10;
    const z0 = (B0 * m11 - m01 * B1) / det, z1 = (m00 * B1 - m10 * B0) / det;
    const out = [scale * z0, scale * z1];
    const sa = 1 + a1 + a2; scale *= (b0 + b1 + b2) / sa;
    return out;
  });
}

// Zero-lag filtering (filtfilt). The ends are padded with an odd reflection of padlen samples.
export function sosfiltfilt(sos, data) {
  const n = data.length;
  let ntaps = 2 * sos.length + 1;
  ntaps -= Math.min(sos.filter((s) => s[2] === 0).length, sos.filter((s) => s[5] === 0).length);
  const pad = Math.min(3 * ntaps, n - 1);
  const m = n + 2 * pad, x = new Float64Array(m);
  for (let i = 0; i < pad; i++) x[i] = 2 * data[0] - data[pad - i];
  for (let i = 0; i < n; i++) x[pad + i] = data[i];
  for (let i = 0; i < pad; i++) x[pad + n + i] = 2 * data[n - 1] - data[n - 2 - i];
  const zi = sosZi(sos);
  // Each section's starting state is scaled by the value going into the whole cascade (as in SciPy).
  const run = (arr) => {
    const x0 = arr[0];
    for (let s = 0; s < sos.length; s++) {
      const [b0, b1, b2, , a1, a2] = sos[s];
      let z0 = zi[s][0] * x0, z1 = zi[s][1] * x0;
      for (let i = 0; i < arr.length; i++) {
        const xi = arr[i], y = b0 * xi + z0;
        z0 = b1 * xi - a1 * y + z1;
        z1 = b2 * xi - a2 * y;
        arr[i] = y;
      }
    }
  };
  run(x); x.reverse(); run(x); x.reverse();
  return x.slice(pad, pad + n);
}

// ---------- EMG steps ----------
// set: {bpLo, bpHi, bpOrder, envFc, envOrder, removeMean}
export function processEmg(raw, fs, set) {
  const n = raw.length;
  const hi = Math.min(set.bpHi, fs / 2 * 0.95);
  const bp = n > 30 ? sosfiltfilt(butterSos(set.bpOrder, [set.bpLo, hi], 'band', fs), raw) : Float64Array.from(raw);
  const rect = new Float64Array(n);
  for (let i = 0; i < n; i++) rect[i] = Math.abs(bp[i]);
  const env = n > 30 ? sosfiltfilt(butterSos(set.envOrder, set.envFc, 'low', fs), rect) : Float64Array.from(rect);
  for (let i = 0; i < n; i++) if (env[i] < 0) env[i] = 0;
  return { bp, rect, env };
}

// Moving mean over w samples (centred), used for the "best 500 ms" MVIC reference.
export function movingMean(y, w) {
  const n = y.length, out = new Float64Array(n), h = Math.floor(w / 2);
  const cs = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cs[i + 1] = cs[i] + y[i];
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - h), b = Math.min(n, i - h + w); out[i] = (cs[b] - cs[a]) / (b - a); }
  return out;
}

// ---------- spectra ----------
function fft(re, im) { // in place, radix 2
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

// Welch power spectrum of y[i0..i1): Hann windows of nseg samples, 50% overlap, each segment's mean removed.
export function welch(y, fs, i0, i1, nseg) {
  i0 = Math.max(0, i0 | 0); i1 = Math.min(y.length, i1 | 0);
  let len = i1 - i0;
  if (len < 16) return null;
  nseg = nseg || 512;
  while (nseg > len) nseg >>= 1;
  const step = nseg >> 1, win = new Float64Array(nseg);
  let wss = 0;
  for (let i = 0; i < nseg; i++) { win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / nseg); wss += win[i] * win[i]; }
  const P = new Float64Array(nseg / 2 + 1);
  let count = 0;
  for (let s = i0; s + nseg <= i1; s += step) {
    let mean = 0; for (let i = 0; i < nseg; i++) mean += y[s + i]; mean /= nseg;
    const re = new Float64Array(nseg), im = new Float64Array(nseg);
    for (let i = 0; i < nseg; i++) re[i] = (y[s + i] - mean) * win[i];
    fft(re, im);
    for (let k = 0; k <= nseg / 2; k++) P[k] += (re[k] * re[k] + im[k] * im[k]) / (fs * wss) * (k === 0 || k === nseg / 2 ? 1 : 2);
    count++;
  }
  for (let k = 0; k < P.length; k++) P[k] /= count;
  const f = Float64Array.from({ length: P.length }, (_, k) => k * fs / nseg);
  return { f, P, segs: count, df: fs / nseg };
}

// Median and mean frequency between lo and hi Hz.
export function specStats(sp, lo, hi) {
  if (!sp) return null;
  let tot = 0, fm = 0;
  for (let k = 0; k < sp.f.length; k++) if (sp.f[k] >= lo && sp.f[k] <= hi) { tot += sp.P[k]; fm += sp.f[k] * sp.P[k]; }
  if (!(tot > 0)) return null;
  let c = 0, mdf = NaN;
  for (let k = 0; k < sp.f.length; k++) {
    if (sp.f[k] < lo || sp.f[k] > hi) continue;
    const prev = c; c += sp.P[k];
    if (c >= tot / 2) { const frac = (tot / 2 - prev) / sp.P[k]; mdf = sp.f[k] - sp.df / 2 + frac * sp.df; break; }
  }
  return { mdf, mnf: fm / tot, power: tot };
}

// Share of power below a frequency and the size of the mains peak (for the quality checks).
export function powerBelow(sp, fc) {
  let lo = 0, tot = 0;
  for (let k = 1; k < sp.f.length; k++) { tot += sp.P[k]; if (sp.f[k] < fc) lo += sp.P[k]; }
  return tot > 0 ? lo / tot : 0;
}
export function humRatio(sp, mains) {
  // power in the mains bin against the median of the 30 Hz either side
  let pk = 0, around = [];
  for (let k = 1; k < sp.f.length; k++) {
    const d = Math.abs(sp.f[k] - mains);
    if (d <= sp.df) pk = Math.max(pk, sp.P[k]);
    else if (d <= 30) around.push(sp.P[k]);
  }
  around.sort((a, b) => a - b);
  const med = around.length ? around[Math.floor(around.length / 2)] : 0;
  return med > 0 ? pk / med : 0;
}

// Linear regression (slope, intercept, r).
export function linreg(x, y) {
  const n = x.length; if (n < 2) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) { sx += x[i]; sy += y[i]; sxx += x[i] * x[i]; sxy += x[i] * y[i]; syy += y[i] * y[i]; }
  const d = n * sxx - sx * sx; if (!d) return null;
  const m = (n * sxy - sx * sy) / d, c = (sy - m * sx) / n;
  const r = (n * sxy - sx * sy) / Math.sqrt(d * (n * syy - sy * sy));
  return { m, c, r };
}

// Resamples y[i0..i1] to npts points (0-100%) by linear interpolation.
export function normalise(y, i0, i1, npts) {
  npts = npts || 101;
  const out = new Float64Array(npts);
  for (let k = 0; k < npts; k++) {
    const x = i0 + (i1 - i0) * k / (npts - 1), a = Math.floor(x), f = x - a;
    out[k] = a + 1 <= i1 ? y[a] * (1 - f) + y[a + 1] * f : y[Math.min(a, y.length - 1)];
  }
  return out;
}
