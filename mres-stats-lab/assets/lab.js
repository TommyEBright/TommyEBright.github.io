/* MRes Stats Lab — shared helpers: random numbers, distributions, canvas plotting, UI. */
(function (global) {
  "use strict";

  /* ---------- random numbers ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let rng = mulberry32((Date.now() ^ 0x9e3779b9) >>> 0);
  let spare = null;
  const R = {
    seed(s) { rng = mulberry32(s >>> 0); spare = null; },
    unif() { return rng(); },
    norm(m = 0, s = 1) {
      if (spare !== null) { const z = spare; spare = null; return m + s * z; }
      let u, v, r;
      do { u = 2 * rng() - 1; v = 2 * rng() - 1; r = u * u + v * v; } while (r >= 1 || r === 0);
      const f = Math.sqrt(-2 * Math.log(r) / r);
      spare = v * f;
      return m + s * u * f;
    },
    gamma(k) { // Marsaglia & Tsang
      if (k < 1) return R.gamma(k + 1) * Math.pow(rng(), 1 / k);
      const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
      for (;;) {
        let x, v;
        do { x = R.norm(); v = 1 + c * x; } while (v <= 0);
        v = v * v * v;
        const u = rng();
        if (u < 1 - 0.0331 * x * x * x * x) return d * v;
        if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
      }
    },
    chisq(df) { return 2 * R.gamma(df / 2); },
    exp() { return -Math.log(1 - rng()); },
  };

  /* ---------- special functions & distributions ---------- */
  function lgamma(x) {
    const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
      -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    x -= 1;
    let a = c[0];
    const t = x + g + 0.5;
    for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  function betacf(a, b, x) {
    const MAXIT = 300, EPS = 3e-14, FPMIN = 1e-300;
    let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  function ibeta(x, a, b) { // regularised incomplete beta I_x(a, b)
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return bt * betacf(a, b, x) / a;
    return 1 - bt * betacf(b, a, 1 - x) / b;
  }
  function erf(x) { // high-accuracy erf via erfc continued fraction / series
    const t = 1 / (1 + 0.5 * Math.abs(x));
    const y = 1 - t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
      t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? y : -y;
  }
  const SQRT2PI = Math.sqrt(2 * Math.PI);
  const D = {
    dnorm(x, m = 0, s = 1) { const z = (x - m) / s; return Math.exp(-0.5 * z * z) / (s * SQRT2PI); },
    pnorm(x, m = 0, s = 1) { return 0.5 * (1 + erf((x - m) / (s * Math.SQRT2))); },
    qnorm(p) { // Acklam
      if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
      const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
      const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
      const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
      const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
      const pl = 0.02425;
      let q, r;
      if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
      if (p > 1 - pl) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
      q = p - 0.5; r = q * q;
      return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    },
    dt(x, df) { return Math.exp(lgamma((df + 1) / 2) - lgamma(df / 2) - 0.5 * Math.log(df * Math.PI) - (df + 1) / 2 * Math.log(1 + x * x / df)); },
    pt(x, df) { // lower-tail CDF
      const tail = 0.5 * ibeta(df / (df + x * x), df / 2, 0.5);
      return x > 0 ? 1 - tail : tail;
    },
    p2t(t, df) { return ibeta(df / (df + t * t), df / 2, 0.5); }, // two-sided p-value
    qt(p, df) {
      let lo = -200, hi = 200;
      for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (D.pt(mid, df) < p) lo = mid; else hi = mid; }
      return (lo + hi) / 2;
    },
    dcauchy(x, s = 1) { return 1 / (Math.PI * s * (1 + (x / s) * (x / s))); },
    lbeta(a, b) { return lgamma(a) + lgamma(b) - lgamma(a + b); },
    dbeta(x, a, b) {
      if (x < 0 || x > 1) return 0;
      if (x === 0) return a < 1 ? Infinity : a === 1 ? b : 0;
      if (x === 1) return b < 1 ? Infinity : b === 1 ? a : 0;
      return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - D.lbeta(a, b));
    },
    pbeta(x, a, b) { return ibeta(Math.min(1, Math.max(0, x)), a, b); },
    qbeta(p, a, b) {
      let lo = 0, hi = 1;
      for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (D.pbeta(mid, a, b) < p) lo = mid; else hi = mid; }
      return (lo + hi) / 2;
    },
    hdiBeta(a, b, mass = 0.95) { // shortest interval (golden-section search over the lower tail probability)
      const width = p => D.qbeta(p + mass, a, b) - D.qbeta(p, a, b);
      let lo = 0, hi = 1 - mass;
      const g = (Math.sqrt(5) - 1) / 2;
      for (let i = 0; i < 60; i++) {
        const m1 = hi - g * (hi - lo), m2 = lo + g * (hi - lo);
        if (width(m1) < width(m2)) hi = m2; else lo = m1;
      }
      const p = (lo + hi) / 2;
      return [D.qbeta(p, a, b), D.qbeta(p + mass, a, b)];
    },
    ldbinom(k, n, p) { return lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1) + k * Math.log(p) + (n - k) * Math.log(1 - p); },
    binomTest(k, n, p = 0.5) { // exact two-sided p-value, same rule as R's binom.test
      const ref = Math.exp(D.ldbinom(k, n, p)) * (1 + 1e-7);
      let s = 0;
      for (let i = 0; i <= n; i++) { const pi = Math.exp(D.ldbinom(i, n, p)); if (pi <= ref) s += pi; }
      return Math.min(1, s);
    },
    // density of S = sqrt(V/df), V ~ chi^2(df); used for exact noncentral-t calculations
    _sgrid(df) {
      const key = df;
      if (D._cache.has(key)) return D._cache.get(key);
      const sd = 1 / Math.sqrt(2 * df);
      const lo = Math.max(1e-9, 1 - 12 * sd), hi = 1 + 14 * sd + (df < 5 ? 6 : 0);
      const N = 600, h = (hi - lo) / N, s = new Float64Array(N + 1), w = new Float64Array(N + 1);
      const lc = (df / 2) * Math.log(df) - (df / 2 - 1) * Math.log(2) - lgamma(df / 2);
      for (let i = 0; i <= N; i++) {
        const x = lo + i * h;
        const simpson = (i === 0 || i === N) ? 1 : (i % 2 ? 4 : 2);
        s[i] = x;
        w[i] = simpson * h / 3 * Math.exp(lc + (df - 1) * Math.log(x) - df * x * x / 2);
      }
      const out = { s, w };
      D._cache.set(key, out);
      return out;
    },
    _cache: new Map(),
    dnct(t, df, ncp) { // noncentral t density
      const { s, w } = D._sgrid(df);
      let acc = 0;
      for (let i = 0; i < s.length; i++) acc += w[i] * s[i] * D.dnorm(t * s[i] - ncp);
      return acc;
    },
    powerT(tcrit, df, ncp) { // P(|T| > tcrit) for noncentral t
      const { s, w } = D._sgrid(df);
      let acc = 0;
      for (let i = 0; i < s.length; i++) acc += w[i] * (1 - D.pnorm(tcrit * s[i] - ncp) + D.pnorm(-tcrit * s[i] - ncp));
      return acc;
    },
    powerT1(tcrit, df, ncp) { // P(T > tcrit), one-sided
      const { s, w } = D._sgrid(df);
      let acc = 0;
      for (let i = 0; i < s.length; i++) acc += w[i] * (1 - D.pnorm(tcrit * s[i] - ncp));
      return acc;
    },
  };

  /* ---------- descriptive helpers ---------- */
  const S = {
    mean(a) { let s = 0; for (const x of a) s += x; return s / a.length; },
    variance(a) { const m = S.mean(a); let s = 0; for (const x of a) s += (x - m) * (x - m); return s / (a.length - 1); },
    sd(a) { return Math.sqrt(S.variance(a)); },
    quantile(a, p) {
      const b = Array.from(a).sort((x, y) => x - y);
      const h = (b.length - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
      return b[lo] + (h - lo) * (b[hi] - b[lo]);
    },
    logSumExp(a) { let m = -Infinity; for (const x of a) if (x > m) m = x; let s = 0; for (const x of a) s += Math.exp(x - m); return m + Math.log(s); },
    // effective sample size (Geyer initial monotone sequence), chains = array of arrays
    ess(chains) {
      const m = chains.length, n = Math.min(...chains.map(c => c.length));
      if (n < 8) return NaN;
      const cs = chains.map(c => c.slice(c.length - n));
      const means = cs.map(S.mean), vars = cs.map(S.variance);
      const W = S.mean(vars);
      const B = n * S.variance(m > 1 ? means : [means[0], means[0]]) || 0;
      const varPlus = (n - 1) / n * W + (m > 1 ? B / n : 0);
      if (!(varPlus > 0)) return NaN;
      const maxLag = Math.min(n - 1, 1000);
      const rho = new Float64Array(maxLag + 1);
      for (let lag = 0; lag <= maxLag; lag++) {
        let acc = 0;
        for (let c = 0; c < m; c++) {
          const x = cs[c], mu = means[c];
          let s = 0;
          for (let i = 0; i < n - lag; i++) s += (x[i] - mu) * (x[i + lag] - mu);
          acc += s / n;
        }
        rho[lag] = 1 - (W - acc / m) / varPlus;
        if (lag > 2 && lag % 2 === 1 && rho[lag - 1] + rho[lag] < 0) break;
      }
      let tau = -1, prev = Infinity;
      for (let k = 0; k + 1 <= maxLag; k += 2) {
        let pair = rho[k] + rho[k + 1];
        if (!(pair > 0)) break;
        if (pair > prev) pair = prev;
        prev = pair;
        tau += 2 * pair;
      }
      return (m * n) / Math.max(tau, 1 / Math.log10(m * n)); // Stan caps ESS at mn·log10(mn)
    },
    rhat(chains) { // split R-hat
      const n0 = Math.min(...chains.map(c => c.length));
      const half = Math.floor(n0 / 2);
      if (half < 4) return NaN;
      const parts = [];
      for (const c of chains) { const x = c.slice(c.length - 2 * half); parts.push(x.slice(0, half), x.slice(half)); }
      const means = parts.map(S.mean), W = S.mean(parts.map(S.variance));
      const B = half * S.variance(means);
      const v = (half - 1) / half * W + B / half;
      return Math.sqrt(v / W);
    },
  };

  /* ---------- canvas plotting ---------- */
  const COL = {
    navy: "#003d50", blue: "#0071bc", teal: "#00857e", plum: "#8b3556", amber: "#a85d00",
    ink: "#1d1d1b", muted: "#5b6b73", grid: "#e6edf0", axis: "#8a9aa2",
    chains: ["#0071bc", "#a85d00", "#00857e", "#8b3556"],
  };
  function niceTicks(lo, hi, n = 5) {
    const span = hi - lo;
    if (!(span > 0)) return [lo];
    const step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const err = step0 / mag;
    const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
    const out = [];
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return out;
  }
  function fmtTick(v) {
    const a = Math.abs(v);
    if (a === 0) return "0";
    if (a >= 1000) return v.toFixed(0);
    if (a >= 10) return (+v.toFixed(1)).toString();
    if (a >= 1) return (+v.toFixed(2)).toString();
    return (+v.toPrecision(2)).toString();
  }

  class Plot {
    constructor(el, opts = {}) {
      this.el = typeof el === "string" ? document.querySelector(el) : el;
      this.canvas = document.createElement("canvas");
      this.canvas.setAttribute("role", "img");
      if (opts.label) this.canvas.setAttribute("aria-label", opts.label);
      this.el.appendChild(this.canvas);
      this.ctx = this.canvas.getContext("2d");
      this.m = Object.assign({ l: 52, r: 14, t: 14, b: 42 }, opts.margin || {});
      this.xlim = opts.xlim || [0, 1];
      this.ylim = opts.ylim || [0, 1];
      this.xlab = opts.xlab || "";
      this.ylab = opts.ylab || "";
      this.xticks = opts.xticks; this.yticks = opts.yticks;
      this.xfmt = opts.xfmt || fmtTick; this.yfmt = opts.yfmt || fmtTick;
      this.onresize = null;
      this.resize();
      if ("ResizeObserver" in window) {
        let raf = 0;
        new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { this.resize(); if (this.onresize) this.onresize(); }); }).observe(this.el);
      }
    }
    resize() {
      const r = this.el.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = Math.max(10, r.width); this.h = Math.max(10, r.height);
      this.canvas.width = Math.round(this.w * dpr); this.canvas.height = Math.round(this.h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.pw = this.w - this.m.l - this.m.r; this.ph = this.h - this.m.t - this.m.b;
    }
    X(x) { return this.m.l + (x - this.xlim[0]) / (this.xlim[1] - this.xlim[0]) * this.pw; }
    Y(y) { return this.m.t + (1 - (y - this.ylim[0]) / (this.ylim[1] - this.ylim[0])) * this.ph; }
    invX(px) { return this.xlim[0] + (px - this.m.l) / this.pw * (this.xlim[1] - this.xlim[0]); }
    invY(py) { return this.ylim[0] + (1 - (py - this.m.t) / this.ph) * (this.ylim[1] - this.ylim[0]); }
    clear() { this.ctx.clearRect(0, 0, this.w, this.h); return this; }
    frame(opts = {}) {
      const c = this.ctx;
      c.save();
      c.fillStyle = opts.bg || "#ffffff";
      c.fillRect(this.m.l, this.m.t, this.pw, this.ph);
      const xt = this.xticks || niceTicks(this.xlim[0], this.xlim[1], Math.max(2, Math.round(this.pw / 80)));
      const yt = this.yticks || niceTicks(this.ylim[0], this.ylim[1], Math.max(2, Math.round(this.ph / 50)));
      c.strokeStyle = COL.grid; c.lineWidth = 1;
      if (opts.grid !== false) {
        for (const v of xt) { const x = Math.round(this.X(v)) + 0.5; c.beginPath(); c.moveTo(x, this.m.t); c.lineTo(x, this.m.t + this.ph); c.stroke(); }
        for (const v of yt) { const y = Math.round(this.Y(v)) + 0.5; c.beginPath(); c.moveTo(this.m.l, y); c.lineTo(this.m.l + this.pw, y); c.stroke(); }
      }
      c.strokeStyle = COL.axis;
      c.strokeRect(this.m.l + 0.5, this.m.t + 0.5, this.pw, this.ph);
      c.fillStyle = COL.muted; c.font = "12px Arial, sans-serif";
      c.textAlign = "center"; c.textBaseline = "top";
      if (opts.xaxis !== false) for (const v of xt) c.fillText(this.xfmt(v), this.X(v), this.m.t + this.ph + 5);
      c.textAlign = "right"; c.textBaseline = "middle";
      if (opts.yaxis !== false) for (const v of yt) c.fillText(this.yfmt(v), this.m.l - 6, this.Y(v));
      c.fillStyle = COL.ink; c.font = "bold 12px Arial, sans-serif";
      c.textAlign = "center"; c.textBaseline = "bottom";
      if (this.xlab) c.fillText(this.xlab, this.m.l + this.pw / 2, this.h - 4);
      if (this.ylab) { c.save(); c.translate(13, this.m.t + this.ph / 2); c.rotate(-Math.PI / 2); c.textBaseline = "middle"; c.fillText(this.ylab, 0, 0); c.restore(); }
      c.restore();
      return this;
    }
    clip(fn) { const c = this.ctx; c.save(); c.beginPath(); c.rect(this.m.l, this.m.t, this.pw, this.ph); c.clip(); fn(c); c.restore(); return this; }
    line(xs, ys, o = {}) {
      return this.clip(c => {
        c.strokeStyle = o.color || COL.blue; c.lineWidth = o.width || 2; c.globalAlpha = o.alpha ?? 1;
        c.setLineDash(o.dash || []);
        c.beginPath();
        let started = false;
        for (let i = 0; i < xs.length; i++) {
          if (!isFinite(ys[i])) { started = false; continue; }
          const x = this.X(xs[i]), y = this.Y(ys[i]);
          if (!started) { c.moveTo(x, y); started = true; } else c.lineTo(x, y);
        }
        c.stroke();
        if (o.fill) { c.lineTo(this.X(xs[xs.length - 1]), this.Y(o.base ?? 0)); c.lineTo(this.X(xs[0]), this.Y(o.base ?? 0)); c.closePath(); c.globalAlpha = o.fillAlpha ?? 0.15; c.fillStyle = o.fill; c.fill(); }
      });
    }
    fn(f, o = {}) {
      const n = o.n || 300, xs = [], ys = [];
      const a = o.from ?? this.xlim[0], b = o.to ?? this.xlim[1];
      for (let i = 0; i <= n; i++) { const x = a + (b - a) * i / n; xs.push(x); ys.push(f(x)); }
      return this.line(xs, ys, o);
    }
    vline(x, o = {}) { return this.line([x, x], [this.ylim[0], this.ylim[1]], Object.assign({ width: 1.5, color: COL.muted }, o)); }
    hline(y, o = {}) { return this.line([this.xlim[0], this.xlim[1]], [y, y], Object.assign({ width: 1.5, color: COL.muted }, o)); }
    points(xs, ys, o = {}) {
      return this.clip(c => {
        const r = o.r || 3;
        c.globalAlpha = o.alpha ?? 0.85;
        for (let i = 0; i < xs.length; i++) {
          c.fillStyle = Array.isArray(o.color) ? o.color[i] : (o.color || COL.blue);
          c.beginPath(); c.arc(this.X(xs[i]), this.Y(ys[i]), Array.isArray(r) ? r[i] : r, 0, 2 * Math.PI); c.fill();
          if (o.stroke) { c.strokeStyle = o.stroke; c.lineWidth = 1; c.stroke(); }
        }
      });
    }
    rect(x0, y0, x1, y1, o = {}) {
      return this.clip(c => {
        const X0 = this.X(x0), X1 = this.X(x1), Y0 = this.Y(y0), Y1 = this.Y(y1);
        c.globalAlpha = o.alpha ?? 1;
        if (o.fill) { c.fillStyle = o.fill; c.fillRect(Math.min(X0, X1), Math.min(Y0, Y1), Math.abs(X1 - X0), Math.abs(Y1 - Y0)); }
        if (o.stroke) { c.strokeStyle = o.stroke; c.lineWidth = o.width || 1; c.strokeRect(Math.min(X0, X1), Math.min(Y0, Y1), Math.abs(X1 - X0), Math.abs(Y1 - Y0)); }
      });
    }
    text(str, x, y, o = {}) {
      const c = this.ctx;
      c.save();
      c.fillStyle = o.color || COL.ink; c.font = (o.bold ? "bold " : "") + (o.size || 12) + "px Arial, sans-serif";
      c.textAlign = o.align || "left"; c.textBaseline = o.baseline || "middle";
      const px = o.px ? x : this.X(x), py = o.px ? y : this.Y(y);
      if (o.halo) { c.strokeStyle = "rgba(255,255,255,0.9)"; c.lineWidth = 4; c.strokeText(str, px, py); }
      c.fillText(str, px, py);
      c.restore();
      return this;
    }
    hist(values, breaks, o = {}) {
      const counts = new Array(breaks.length - 1).fill(0);
      for (const v of values) {
        if (v < breaks[0] || v > breaks[breaks.length - 1]) continue;
        let k = Math.min(breaks.length - 2, Math.floor((v - breaks[0]) / (breaks[1] - breaks[0])));
        counts[k]++;
      }
      return counts;
    }
  }

  /* ---------- UI helpers ---------- */
  function bindRange(id, fmt, onInput) {
    const el = document.getElementById(id), out = document.getElementById(id + "-out");
    const show = () => { if (out) out.textContent = fmt ? fmt(+el.value) : el.value; };
    el.addEventListener("input", () => { show(); onInput && onInput(+el.value); });
    show();
    return el;
  }
  function seg(id, onChange) {
    const box = document.getElementById(id);
    const btns = [...box.querySelectorAll("button")];
    btns.forEach(b => b.addEventListener("click", () => {
      btns.forEach(x => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
      onChange && onChange(b.dataset.value);
    }));
    return () => (btns.find(b => b.getAttribute("aria-pressed") === "true") || btns[0]).dataset.value;
  }
  function fmtP(p) {
    if (!isFinite(p)) return "–";
    if (p < 0.001) return "< .001";
    return "= " + p.toFixed(3).replace(/^0/, "");
  }
  function fmt(x, d = 2) { return isFinite(x) ? x.toFixed(d) : "–"; }

  global.Lab = { R, D, S, Plot, COL, niceTicks, fmtTick, bindRange, seg, fmtP, fmt, lgamma, ibeta };
})(window);
