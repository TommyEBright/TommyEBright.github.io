// Processing and analysis.
// Every EMG channel: raw -> band-pass (zero lag) -> full-wave rectify -> low-pass (zero lag) = linear envelope.
// The envelope is then normalised to the muscle's MVIC (or the session's highest task peak, or left in µV).
// Windows (reps, phases, your own) come from the points marked by hand, and every result is worked out in them.
import { A, SET, muscle, muscleKeys, W, ptName } from './state.js?v=1.2.0';
import { processEmg, butterSos, sosfiltfilt, movingMean, welch, specStats, powerBelow, humRatio, normalise } from './dsp.js?v=1.2.0';

// ---------- processing (cached) ----------
const cache = new Map();
const sig = (t) => { const s = SET(); return [s.bpLo, s.bpHi, s.bpOrder, s.envFc, s.envOrder, t.fsOverride || 0, t.scale || 1].join('|'); };

export function trialFs(t) { return t.fsOverride > 0 ? t.fsOverride : (t.P.emg[0] && t.P.emg[0].fs) || 0; }

export function proc(t) {
  const key = t.id, s = sig(t), hit = cache.get(key);
  if (hit && hit.sig === s) return hit;
  const set = SET(), fs = trialFs(t);
  if (!(fs > 0)) return { ok: false, error: 'The sample rate is unknown. Type it in <strong>1. Setup</strong>.' };
  const sc = t.scale || 1;
  const ch = t.P.emg.map((e) => {
    const raw = sc === 1 ? e.y : Float32Array.from(e.y, (v) => v * sc);
    const p = processEmg(raw, fs, set);
    return { key: e.key, raw, bp: p.bp, rect: p.rect, env: p.env, n: raw.length };
  });
  const n = Math.max(...ch.map((c) => c.n));
  const tt = new Float64Array(n); for (let i = 0; i < n; i++) tt[i] = i / fs;
  // accelerometers: one resultant per sensor (and each axis)
  const acc = {};
  (t.P.acc || []).forEach((a) => {
    const s0 = acc[a.sensor] || (acc[a.sensor] = { sensor: a.sensor, fs: a.fs, ax: {} });
    s0.ax[a.axis || 'A'] = a.y;
  });
  Object.values(acc).forEach((s0) => {
    const axs = Object.values(s0.ax), m = Math.min(...axs.map((y) => y.length));
    const mag = new Float64Array(m); for (let i = 0; i < m; i++) { let q = 0; axs.forEach((y) => { q += y[i] * y[i]; }); mag[i] = Math.sqrt(q); }
    s0.mag = mag; s0.t = Float64Array.from({ length: m }, (_, i) => i / s0.fs);
  });
  const out = { ok: true, sig: s, fs, n, t: tt, ch, acc };
  cache.set(key, out);
  return out;
}
export function forget(t) { if (t) cache.delete(t.id); else cache.clear(); }

// A faster envelope (e.g. 50 Hz), for the onset guide and the rate of rise.
export function fastEnv(pr, k, fc) {
  const c = pr.ch[k]; c._fast = c._fast || {};
  if (c._fast[fc]) return c._fast[fc];
  const e = sosfiltfilt(butterSos(4, Math.min(fc, pr.fs / 2 * 0.9), 'low', pr.fs), c.rect);
  for (let i = 0; i < e.length; i++) if (e[i] < 0) e[i] = 0;
  c._fast[fc] = e; return e;
}

// ---------- normalisation ----------
// MVIC reference for each muscle: the highest envelope across that muscle's MVIC files (or the highest
// mean over refWin ms). If MVIC start/end are marked in an MVIC file, only that part is searched.
// MVICs belong to a participant: a task uses the MVICs with the same participant label (and, for any
// muscle that participant has none for, MVICs with no participant label).
const who = (t) => ((t && t.labels && t.labels.athlete) || '').trim().toLowerCase();
export function references(ath) {
  if (ath === undefined) ath = who(A.S);
  const own = refsFor((t) => who(t) === ath), anon = ath ? refsFor((t) => who(t) === '') : {};
  Object.keys(anon).forEach((k) => { if (!own[k]) own[k] = Object.assign(anon[k], { shared: true }); });
  return own;
}
function refsFor(keep) {
  const set = SET(), out = {};
  A.session.trials.forEach((t) => {
    if (t.role !== 'mvic' || !keep(t)) return;
    const pr = proc(t); if (!pr.ok) return;
    const h0 = (t.points || []).find((p) => p.type === 'hold0'), h1 = (t.points || []).find((p) => p.type === 'hold1');
    pr.ch.forEach((c) => {
      if (!(t.mvicFor || []).includes(c.key)) return;
      let i0 = 0, i1 = c.n - 1;
      if (h0 && h1 && h1.t > h0.t) { i0 = Math.max(0, Math.round(h0.t * pr.fs)); i1 = Math.min(c.n - 1, Math.round(h1.t * pr.fs)); }
      let y = c.env;
      if (set.refMethod === 'win') { const w = Math.max(3, Math.round(set.refWin / 1000 * pr.fs)); y = movingMean(c.env.subarray(i0, i1 + 1), w); i1 = i1 - i0; i0 = 0; }
      let v = -Infinity, at = i0;
      for (let i = i0; i <= i1; i++) if (y[i] > v) { v = y[i]; at = i; }
      const offs = set.refMethod === 'win' && h0 && h1 && h1.t > h0.t ? Math.round(h0.t * pr.fs) : 0;
      const prev = out[c.key];
      const rec = { v, trial: t.id, name: t.name, t: (at + offs) / pr.fs, method: set.refMethod, all: (prev ? prev.all : []).concat([{ trial: t.id, name: t.name, v }]) };
      if (!prev || v > prev.v) out[c.key] = rec; else prev.all = rec.all;
    });
  });
  return out;
}
// Highest task envelope for each muscle (for "% of the session's peak").
export function taskPeaks(ath) {
  const out = {};
  A.session.trials.forEach((t) => {
    if (t.role === 'mvic' || who(t) !== ath) return;
    const pr = proc(t); if (!pr.ok) return;
    pr.ch.forEach((c) => { let m = 0; for (let i = 0; i < c.n; i++) if (c.env[i] > m) m = c.env[i]; if (!out[c.key] || m > out[c.key]) out[c.key] = m; });
  });
  return out;
}
// Reference trial (Burden, 2010): 100% = the peak of the muscle's average cycle (or rep) in the reference
// trial(s) of the same participant. Every cycle in every reference file for that muscle is pooled.
export function refPeaks(ath) {
  if (ath === undefined) ath = who(A.S);
  const pick = (keep) => {
    const pool = {};
    A.session.trials.forEach((t) => {
      if (t.role !== 'ref' || !keep(t)) return;
      const pr = proc(t); if (!pr.ok) return;
      const wins = repWindows(t, pr.fs, pr.n);
      pr.ch.forEach((c) => {
        const p = pool[c.key] || (pool[c.key] = { curves: [], whole: 0, names: [] });
        if (!p.names.includes(t.name)) p.names.push(t.name);
        wins.forEach((w) => p.curves.push(normalise(c.env, w.i0, Math.min(w.i1, c.n - 1), 101)));
        for (let i = 0; i < c.n; i++) if (c.env[i] > p.whole) p.whole = c.env[i];
      });
    });
    const out = {};
    Object.keys(pool).forEach((k) => {
      const p = pool[k];
      if (p.curves.length) { let pk = 0; for (let j = 0; j < 101; j++) { let m = 0; p.curves.forEach((c) => { m += c[j]; }); pk = Math.max(pk, m / p.curves.length); } out[k] = { v: pk, n: p.curves.length, names: p.names }; }
      else out[k] = { v: p.whole, n: 0, names: p.names };
    });
    return out;
  };
  const own = pick((t) => who(t) === ath), anon = ath ? pick((t) => who(t) === '') : {};
  Object.keys(anon).forEach((k) => { if (!own[k]) own[k] = anon[k]; });
  return own;
}
export function normInfo() {
  const n = SET().norm;
  return n === 'mvic' ? { unit: '%MVIC', lab: 'EMG (% MVIC)', k: 100 } : n === 'ref' ? { unit: '% ref', lab: 'EMG (% of the reference trial)', k: 100 } : n === 'peak' ? { unit: '% peak', lab: 'EMG (% of the session peak)', k: 100 } : { unit: 'µV', lab: 'EMG envelope (µV)', k: 1e6 };
}
// Divisor for each muscle (volts -> the display unit is value / div * k)
export function divisors(t) {
  const n = SET().norm, out = {}, ath = who(t || A.S);
  if (n === 'mvic') { const r = references(ath); Object.keys(r).forEach((k) => { out[k] = r[k].v; }); }
  else if (n === 'ref') { const r = refPeaks(ath); Object.keys(r).forEach((k) => { out[k] = r[k].v; }); }
  else if (n === 'peak') Object.assign(out, taskPeaks(ath));
  return out;
}

// ---------- the open trial's analysis ----------
export function analyse(t) {
  const pr = proc(t); if (!pr.ok) return pr;
  const set = SET(), ni = normInfo(), div = divisors(t);
  const N = pr.ch.map((c) => {
    const d = ni.unit === 'µV' ? 1 : div[c.key];
    if (!(d > 0)) return null;
    const k = ni.k / d, o = new Float64Array(c.n);
    for (let i = 0; i < c.n; i++) o[i] = c.env[i] * k;
    return o;
  });
  const missing = pr.ch.filter((c, k) => !N[k]).map((c) => c.key);
  const scaleOf = (k) => (ni.unit === 'µV' ? ni.k : ni.k / div[pr.ch[k].key]);
  const iOf = (tm) => Math.max(0, Math.min(pr.n - 1, Math.round(tm * pr.fs)));
  const pts = (t.points || []).map((p) => Object.assign({}, p, { i: iOf(p.t) })).sort((a, b) => a.i - b.i);
  const R = { ok: true, t, pr, fs: pr.fs, n: pr.n, N, ni, missing, pts, scaleOf, mvic: t.role === 'mvic' };

  const reps = repWindows(t, pr.fs, pr.n, pts);
  R.cycles = !pts.some((p) => p.type === 'rep1') && reps.length > 0;
  R.skipped = reps.skipped || 0;
  R.reps = reps.map((r, j) => ({ id: 'rep' + (j + 1), name: W().One + ' ' + (j + 1), i0: r.i0, i1: r.i1, rep: j, kind: 'rep' }));
  R.phases = [];
  R.reps.forEach((r) => {
    const cuts = pts.filter((p) => p.type === 'phase' && p.i > r.i0 && p.i < r.i1).map((p) => p.i);
    if (!cuts.length) return;
    const b = [r.i0].concat(cuts, [r.i1]);
    for (let j = 0; j < b.length - 1; j++) R.phases.push({ id: r.id + 'p' + j, name: r.name + ' · ' + (set.phaseNames[j] || 'Phase ' + (j + 1)), phase: j, phaseName: set.phaseNames[j] || 'Phase ' + (j + 1), i0: b[j], i1: b[j + 1], rep: r.rep, kind: 'phase' });
  });
  R.own = (t.wins || []).map((w) => {
    const a = pts.find((p) => p.id === w.a), b = pts.find((p) => p.id === w.b);
    if (!a || !b || a.i === b.i) return null;
    return { id: w.id, name: w.name || 'My window', i0: Math.min(a.i, b.i), i1: Math.max(a.i, b.i), kind: 'own', from: a, to: b };
  }).filter(Boolean);
  R.whole = [{ id: 'whole', name: 'Whole trial', i0: 0, i1: pr.n - 1, kind: 'whole' }];
  const rest0 = pts.find((p) => p.type === 'rest0'), rest1 = pts.find((p) => p.type === 'rest1');
  R.rest = rest0 && rest1 && rest1.i > rest0.i ? { i0: rest0.i, i1: rest1.i } : null;

  R.stats = (w) => winStats(R, w);
  R.windowsFor = (type) => ({ reps: R.reps, phases: R.phases, own: R.own, whole: R.whole }[type] || []);
  R.guide = guideLines(R);
  R.bursts = bursts(R);
  return R;
}

// Reps: each Rep start to the next Rep end; with no Rep ends, each Rep start to the next (cycles). A gap between
// two cycle starts much longer than usual (a missed foot strike) is not a cycle, so it is left out.
export function repWindows(t, fs, n, pts) {
  pts = pts || (t.points || []).map((p) => ({ type: p.type, i: Math.max(0, Math.min(n - 1, Math.round(p.t * fs))) })).sort((a, b) => a.i - b.i);
  const r0 = pts.filter((p) => p.type === 'rep0'), r1 = pts.filter((p) => p.type === 'rep1'), out = [];
  if (r1.length) r0.forEach((a, j) => { const nx = r0[j + 1]; const b = r1.find((e) => e.i > a.i && (!nx || e.i <= nx.i)); if (b) out.push({ i0: a.i, i1: b.i }); });
  else {
    const d = r0.slice(1).map((p, j) => p.i - r0[j].i).sort((a, b) => a - b), med = d.length ? d[Math.floor(d.length / 2)] : 0;
    out.skipped = 0;
    r0.forEach((a, j) => { const b = r0[j + 1]; if (!b) return; if (d.length >= 3 && b.i - a.i > 1.6 * med) { out.skipped++; return; } out.push({ i0: a.i, i1: b.i }); });
  }
  return out;
}

// Peak, mean, time of peak and integrated EMG of every muscle in a window.
export function winStats(R, w) {
  return R.pr.ch.map((c, k) => {
    const y = R.N[k] || c.env, sc = R.N[k] ? 1 : 1e6;
    const i1 = Math.min(w.i1, c.n - 1);
    let pk = -Infinity, at = w.i0, sum = 0, area = 0;
    for (let i = w.i0; i <= i1; i++) { const v = y[i] * sc; sum += v; if (v > pk) { pk = v; at = i; } if (i > w.i0) area += (v + y[i - 1] * sc) / 2 / R.fs; }
    const np = i1 - w.i0 + 1, dur = (i1 - w.i0) / R.fs;
    return { key: c.key, peak: pk, mean: sum / np, tPeak: (at - w.i0) / R.fs, pPeak: dur > 0 ? (at - w.i0) / (i1 - w.i0) * 100 : 0, iemg: area, dur, normed: !!R.N[k] };
  });
}

// Onset and offset inside each rep (or the whole trial if there are no reps). Marked by hand if any onsets
// are marked; otherwise found automatically (see autoBursts).
function bursts(R) {
  if (!R.pts.some((p) => p.type === 'on')) { const b = autoBursts(R); R.autoOn = true; return b; }
  R.autoOn = false;
  const wins = R.reps.length ? R.reps : R.whole;
  return wins.map((w) => {
    const per = R.pr.ch.map((c) => {
      const on = R.pts.find((p) => p.type === 'on' && p.m === c.key && p.i >= w.i0 && p.i <= w.i1);
      if (!on) return { key: c.key };
      const off = R.pts.find((p) => p.type === 'off' && p.m === c.key && p.i > on.i && p.i <= w.i1);
      const len = (w.i1 - w.i0) / R.fs;
      const r = { key: c.key, on: (on.i - w.i0) / R.fs, onP: len > 0 ? (on.i - w.i0) / (w.i1 - w.i0) * 100 : NaN, onI: on.i };
      if (off) Object.assign(r, { off: (off.i - w.i0) / R.fs, offP: len > 0 ? (off.i - w.i0) / (w.i1 - w.i0) * 100 : NaN, offI: off.i, dur: (off.i - on.i) / R.fs });
      return r;
    });
    return { w, per };
  });
}

// ---------- finding cycles from an accelerometer ----------
// Running and walking: each foot strike is a sharp spike in the resultant acceleration of a leg sensor, so a
// stride runs from one spike to the next (same leg). Cycling and anything else rhythmic: the peaks of the
// smoothed axis that moves most. Peaks closer than minGap s are not counted; the tallest wins.
export function findCycles(pr, sensor, kind, minGap) {
  const s0 = pr.acc[sensor]; if (!s0) return [];
  const fs = s0.fs, n = s0.mag.length;
  // skip the zero padding at the start and end of the recording
  let a = n, b = 0;
  pr.ch.forEach((c) => { let i = 0; while (i < c.n && c.raw[i] === 0) i++; let j = c.n - 1; while (j > i && c.raw[j] === 0) j--; a = Math.min(a, Math.ceil(i / pr.fs * fs)); b = Math.max(b, Math.floor(j / pr.fs * fs)); });
  a = Math.max(a, Math.round(0.05 * fs)); b = Math.min(b, n - 1 - Math.round(0.05 * fs));
  let y;
  if (kind === 'impact') y = s0.mag;
  else {
    let best = null, bv = -1;
    Object.values(s0.ax).forEach((ax) => { let m = 0, q = 0, c = 0; for (let i = a; i <= b; i++) { m += ax[i]; q += ax[i] * ax[i]; c++; } const v = q / c - (m / c) ** 2; if (v > bv) { bv = v; best = ax; } });
    const z = Float64Array.from(best.subarray(0, n)); let m = 0; for (let i = a; i <= b; i++) m += z[i]; m /= (b - a + 1); for (let i = 0; i < n; i++) z[i] -= m;
    y = sosfiltfilt(butterSos(2, Math.min(3, fs / 4), 'low', fs), z);
  }
  const vals = []; for (let i = a; i <= b; i++) vals.push(y[i]); vals.sort((p, q) => p - q);
  const thr = 0.5 * vals[Math.floor(vals.length * 0.99)];
  const cand = [];
  for (let i = Math.max(a, 1); i <= Math.min(b, n - 2); i++) if (y[i] >= thr && y[i] >= y[i - 1] && y[i] > y[i + 1]) cand.push(i);
  cand.sort((p, q) => y[q] - y[p]);
  const gap = Math.round(minGap * fs), keep = [];
  cand.forEach((i) => { if (keep.every((k) => Math.abs(k - i) >= gap)) keep.push(i); });
  return keep.sort((p, q) => p - q).map((i) => i / fs);
}

// ---------- automatic on/off ----------
// A muscle is on while its envelope is above a threshold for at least onMinMs (shorter gaps are bridged,
// shorter bursts dropped). Threshold: onPct % of the peak of the muscle's average cycle (no rest needed, so it
// suits running and cycling), or the rest mean + k SD of a fast envelope (Hodges and Bui, 1996) if a rest
// period is marked. In cycles, a burst still on at the end belongs to the next cycle; one already on at the
// start is followed back, so it can start before the cycle (a negative onset, e.g. -12% = late swing).
export function onThresholds(R) {
  const set = SET(), useRest = set.onMethod === 'rest' && R.rest && R.guide;
  const wins = R.reps.length ? R.reps : R.whole;
  return R.pr.ch.map((c, k) => {
    if (useRest && R.guide[k]) return { thr: R.guide[k].thr, y: scaled(fastEnv(R.pr, k, set.guideFc), R.scaleOf(k)), how: 'rest' };
    const y = R.N[k] || scaled(c.env, 1e6);
    let pk = 0;
    if (R.reps.length) { const cv = wins.map((w) => normalise(y, w.i0, Math.min(w.i1, c.n - 1), 101)); for (let j = 0; j < 101; j++) { let m = 0; cv.forEach((q) => { m += q[j]; }); pk = Math.max(pk, m / cv.length); } }
    else for (let i = 0; i < c.n; i++) pk = Math.max(pk, y[i]);
    return { thr: pk * set.onPct / 100, y, how: 'pct' };
  });
}
function scaled(e, k) { const o = new Float64Array(e.length); for (let i = 0; i < e.length; i++) o[i] = e[i] * k; return o; }
// Runs of mask (true = on) between a and b, with gaps and bursts shorter than minN samples dealt with.
export function runs(on, a, b, minN) {
  let r = [], s = -1;
  for (let i = a; i <= b; i++) { if (on(i) && s < 0) s = i; if ((!on(i) || i === b) && s >= 0) { r.push([s, on(i) ? i : i - 1]); s = -1; } }
  const m = []; r.forEach((x) => { const p = m[m.length - 1]; if (p && x[0] - p[1] - 1 < minN) p[1] = x[1]; else m.push(x.slice()); });
  return m.filter((x) => x[1] - x[0] + 1 >= minN);
}
function autoBursts(R) {
  const set = SET(), minN = Math.max(1, Math.round(set.onMinMs / 1000 * R.fs)), T = onThresholds(R);
  R.onThr = T;
  const wins = R.reps.length ? R.reps : R.whole;
  return wins.map((w) => {
    const len = (w.i1 - w.i0) / R.fs;
    const per = R.pr.ch.map((c, k) => {
      const { y, thr } = T[k]; if (!(thr > 0)) return { key: c.key };
      const on = (i) => y[i] >= thr, i1 = Math.min(w.i1, c.n - 1);
      let B = runs(on, w.i0, i1, minN);
      let active = 0; B.forEach((x) => { active += x[1] - x[0] + 1; });
      if (R.cycles) {
        if (B.length > 1 || (B.length && B[0][0] > w.i0)) B = B.filter((x) => x[1] < i1); // still on at the end: the next cycle's
        B.forEach((x) => { if (x[0] === w.i0) { let i = w.i0; const lim = Math.max(0, w.i0 - Math.round((w.i1 - w.i0) / 2)); while (i > lim && on(i - 1)) i--; x[0] = i; } });
      }
      if (!B.length) return { key: c.key, active: active / (i1 - w.i0 + 1) * 100, nB: 0 };
      let best = B[0], ba = -1;
      B.forEach((x) => { let a = 0; for (let i = x[0]; i <= x[1]; i++) a += y[i]; if (a > ba) { ba = a; best = x; } });
      const P = (i) => (len > 0 ? (i - w.i0) / (w.i1 - w.i0) * 100 : NaN);
      return { key: c.key, on: (best[0] - w.i0) / R.fs, onP: P(best[0]), onI: best[0], off: (best[1] - w.i0) / R.fs, offP: P(best[1]), offI: best[1], dur: (best[1] - best[0]) / R.fs, nB: B.length, active: active / (i1 - w.i0 + 1) * 100, auto: true };
    });
    return { w, per };
  });
}
// On/off on a 0-100% average curve: the bursts (as % of the cycle) and the % of the cycle the muscle is on.
// In cycles, a burst running off the end joins one at the start (e.g. on 88%, off 12%: across the cycle start).
export function curveBursts(y, thr, minPct, cyclic) {
  const n = y.length, minN = Math.max(2, Math.round(minPct)), on = (i) => y[i] >= thr;
  const r = runs(on, 0, n - 1, minN), mask = new Array(n).fill(false);
  r.forEach((x) => { for (let i = x[0]; i <= x[1]; i++) mask[i] = true; });
  let B = r.map((x) => ({ on: x[0], off: x[1] }));
  if (cyclic && B.length > 1 && B[0].on === 0 && B[B.length - 1].off === n - 1) { const last = B.pop(); B[0] = { on: last.on, off: B[0].off, wrap: true }; }
  return { B, active: mask.filter(Boolean).length / n * 100, mask };
}
export function burstTxt(b) { return b.wrap ? b.on + '% to ' + b.off + '% (across the start)' : b.on + '% to ' + b.off + '%'; }

// Order of activation in each rep (earliest onset first).
export function orderOf(b) {
  const got = b.per.filter((p) => Number.isFinite(p.on)).sort((a, c) => a.on - c.on);
  return got.map((p, j) => ({ key: p.key, on: p.on, after: j ? (p.on - got[0].on) * 1000 : 0 }));
}

// Co-contraction of two normalised envelopes in a window: CI = 2 × common area ÷ (area A + area B) × 100
// (Falconer and Winter, 1985), with the area under both curves (the smaller of the two at every sample).
export function coContraction(R, kA, kB, w) {
  const a = R.N[kA], b = R.N[kB]; if (!a || !b) return null;
  let common = 0, sa = 0, sb = 0;
  for (let i = w.i0; i <= w.i1; i++) { common += Math.min(a[i], b[i]); sa += a[i]; sb += b[i]; }
  return { ci: sa + sb > 0 ? 2 * common / (sa + sb) * 100 : NaN, common: common / R.fs, areaA: sa / R.fs, areaB: sb / R.fs };
}
// Overlap of two bursts (onset to offset) in a rep, in seconds and % of the rep.
export function overlap(b, kA, kB, len) {
  const A_ = b.per.find((p) => p.key === kA), B_ = b.per.find((p) => p.key === kB);
  if (!A_ || !B_ || !Number.isFinite(A_.dur) || !Number.isFinite(B_.dur)) return null;
  const s = Math.max(A_.on, B_.on), e = Math.min(A_.off, B_.off), o = Math.max(0, e - s);
  return { s: o, p: len > 0 ? o / len * 100 : NaN, from: o > 0 ? s : NaN, to: o > 0 ? e : NaN };
}

// Average waveform: each rep stretched to 0-100% (101 points), mean ± SD for each muscle, and the
// variance ratio (VR: 0 = every rep identical, 1 = no consistent pattern; Hershler and Milner, 1978).
export function waveforms(R, wins) {
  wins = wins || R.reps;
  if (wins.length < 1) return null;
  return R.pr.ch.map((c, k) => {
    const y = R.N[k]; if (!y) return { key: c.key, none: true };
    const curves = wins.map((w) => normalise(y, w.i0, Math.min(w.i1, c.n - 1), 101));
    const n = curves.length, mean = new Float64Array(101), sd = new Float64Array(101);
    for (let j = 0; j < 101; j++) { let s = 0; curves.forEach((cv) => { s += cv[j]; }); mean[j] = s / n; }
    let within = 0, grand = 0, tot = 0;
    for (let j = 0; j < 101; j++) { let q = 0; curves.forEach((cv) => { q += (cv[j] - mean[j]) ** 2; }); sd[j] = n > 1 ? Math.sqrt(q / (n - 1)) : 0; within += q; grand += mean[j]; }
    grand /= 101;
    for (let j = 0; j < 101; j++) curves.forEach((cv) => { tot += (cv[j] - grand) ** 2; });
    const vr = n > 1 && tot > 0 ? (within / (101 * (n - 1))) / (tot / (101 * n - 1)) : NaN;
    let pk = -Infinity, at = 0; for (let j = 0; j < 101; j++) if (mean[j] > pk) { pk = mean[j]; at = j; }
    return { key: c.key, curves, mean, sd, vr, n, peak: pk, peakAt: at };
  });
}

// The onset guide: mean + k SD of a fast (50 Hz) envelope in the marked rest period (Hodges and Bui, 1996).
function guideLines(R) {
  const set = SET(); if (!R.rest) return null;
  return R.pr.ch.map((c, k) => {
    if (!R.N[k] && R.ni.unit !== 'µV') return null;
    const e = fastEnv(R.pr, k, set.guideFc), sc = R.scaleOf(k);
    let s = 0, q = 0, n = 0;
    for (let i = R.rest.i0; i <= R.rest.i1; i++) { const v = e[i] * sc; s += v; q += v * v; n++; }
    const m = s / n, sd = Math.sqrt(Math.max(0, q / n - m * m));
    return { mean: m, sd, thr: m + set.guideK * sd, restRms: rms(c.bp, R.rest.i0, R.rest.i1) * 1e6 };
  });
}
const rms = (y, a, b) => { let q = 0; for (let i = a; i <= b; i++) q += y[i] * y[i]; return Math.sqrt(q / (b - a + 1)); };

// Rate of rise of the EMG: the change in the (fast) normalised envelope over the first X ms after onset.
export function rateOfRise(R, ms, fc) {
  const n = Math.round(ms / 1000 * R.fs);
  return R.bursts.map((b) => ({
    w: b.w,
    per: b.per.map((p, k) => {
      if (!Number.isFinite(p.on) || !R.N[k]) return { key: p.key };
      const e = fc ? fastEnv(R.pr, k, fc) : R.pr.ch[k].env, sc = R.scaleOf(k), i0 = p.onI, i1 = Math.min(R.pr.ch[k].n - 1, i0 + n);
      const d = (e[i1] - e[i0]) * sc;
      return { key: p.key, v0: e[i0] * sc, v1: e[i1] * sc, rate: d / (ms / 1000) };
    })
  }));
}

// Median frequency over time: band-passed signal in windows of winMs, half overlapping, or per window given.
export function fatigue(R, k, winMs, wins) {
  const c = R.pr.ch[k], pts = [];
  if (wins && wins.length) wins.forEach((w) => { const sp = welch(c.bp, R.fs, w.i0, w.i1 + 1, 256); const s = specStats(sp, SET().bpLo, SET().bpHi); if (s) pts.push({ t: (w.i0 + w.i1) / 2 / R.fs, name: w.name, mdf: s.mdf, mnf: s.mnf, rms: rms(c.bp, w.i0, w.i1) * 1e6 }); });
  else {
    const L = Math.max(64, Math.round(winMs / 1000 * R.fs)), step = Math.round(L / 2);
    for (let i = 0; i + L <= c.n; i += step) {
      const sp = welch(c.bp, R.fs, i, i + L, 256), s = specStats(sp, SET().bpLo, SET().bpHi);
      if (s) pts.push({ t: (i + L / 2) / R.fs, mdf: s.mdf, mnf: s.mnf, rms: rms(c.bp, i, i + L - 1) * 1e6 });
    }
  }
  return pts;
}

// ---------- quality checks ----------
export function quality(t) {
  const pr = proc(t); if (!pr.ok) return [];
  const set = SET(), out = [];
  const div = set.norm === 'mvic' || set.norm === 'ref' ? divisors(t) : {};
  pr.ch.forEach((c) => {
    const m = muscle(c.key), name = m.short, raw = c.raw, n = raw.length;
    const items = [];
    let lead = 0; while (lead < n && raw[lead] === 0) lead++;
    let trail = 0; while (trail < n - lead && raw[n - 1 - trail] === 0) trail++;
    if (lead > 2) items.push({ lv: 'info', txt: 'Starts with ' + (lead / pr.fs).toFixed(2) + ' s of exact zeros (the sensor was not sending yet). Leave it out of your windows.' });
    if (trail > 2) items.push({ lv: 'info', txt: 'Ends with ' + (trail / pr.fs).toFixed(2) + ' s of exact zeros (the sensor stopped first).' });
    let mean = 0; for (let i = lead; i < n - trail; i++) mean += raw[i]; mean /= Math.max(1, n - lead - trail);
    if (Math.abs(mean) > 5e-6) items.push({ lv: 'info', txt: 'DC offset of ' + (mean * 1e6).toFixed(1) + ' µV. Harmless: the band-pass filter removes it.' });
    let mx = 0; for (let i = 0; i < n; i++) { const a = Math.abs(raw[i]); if (a > mx) mx = a; }
    let flat = 0; for (let i = 2; i < n; i++) if (Math.abs(raw[i]) > 0.9 * mx && raw[i] === raw[i - 1] && raw[i] === raw[i - 2]) flat++;
    if (flat > 3 || mx >= 0.0109) items.push({ lv: 'bad', txt: 'Possible clipping: the signal hits the same largest value ' + flat + ' times (largest ' + (mx * 1000).toFixed(2) + ' mV). Clipped EMG under-reads amplitude and distorts the spectrum.' });
    else if (mx > 0.005) items.push({ lv: 'warn', txt: 'Very large spike (' + (mx * 1000).toFixed(1) + ' mV). Surface EMG is rarely this big: check for the sensor being knocked or coming loose.' });
    const sp = welch(raw, pr.fs, lead, n - trail, 1024);
    if (sp) {
      const low = powerBelow(sp, 20);
      if (low > 0.2) items.push({ lv: 'warn', txt: Math.round(low * 100) + '% of the raw signal&rsquo;s power is below 20 Hz: movement artefact (cable or sensor movement, or the skin moving under the sensor). The band-pass filter removes most of it, but big artefacts leak through. Check the raw signal.' });
      const hum = humRatio(sp, set.mains);
      if (hum > 8) items.push({ lv: 'warn', txt: 'A sharp peak at ' + set.mains + ' Hz (' + hum.toFixed(0) + '&times; the power either side): mains interference. Check the reference electrode and keep away from mains cables. A notch filter is not used because it also removes real EMG at that frequency.' });
    }
    // quiet level: 5th percentile of the envelope
    const sorted = Float64Array.from(c.env.subarray(lead, n - trail)).sort();
    const floor = sorted.length ? sorted[Math.floor(sorted.length * 0.05)] * 1e6 : 0;
    if (t.role !== 'mvic' && floor > 15) items.push({ lv: 'warn', txt: 'The envelope never goes quiet (lowest 5% is above ' + floor.toFixed(0) + ' µV). There may be no rest in this recording, or the baseline is noisy. A resting baseline should be only a few µV.' });
    if (set.norm === 'ref' && !(div[c.key] > 0) && t.role !== 'mvic') items.push({ lv: 'bad', txt: 'No reference trial for this muscle. Set a trial&rsquo;s Type to <strong>Reference</strong> in the Session table.' });
    if (set.norm === 'mvic' && t.role !== 'mvic') {
      if (!(div[c.key] > 0)) items.push({ lv: 'bad', txt: 'No MVIC file for this muscle, so it cannot be shown as %MVIC. Add its MVIC file and tick this muscle in <strong>1. Setup</strong>.' });
      else { let pk = 0; for (let i = 0; i < n; i++) if (c.env[i] > pk) pk = c.env[i]; const p = pk / div[c.key] * 100; if (p > 100) items.push({ lv: 'info', txt: 'Peaks at ' + p.toFixed(0) + '% MVIC. Above 100% is common in fast or eccentric work, but if it is well above, the MVIC may not have been a true maximum.' }); }
    }
    out.push({ key: c.key, name, items });
  });
  return out;
}

export function pointLabel(p) { return ptName(p.type) + (p.m ? ' ' + muscle(p.m).short : '') + (p.type === 'mark' && p.name ? ' ' + p.name : ''); }
export { muscleKeys, who };
