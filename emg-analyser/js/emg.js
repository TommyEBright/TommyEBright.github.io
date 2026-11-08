// Processing and analysis.
// Every EMG channel: raw -> band-pass (zero lag) -> full-wave rectify -> low-pass (zero lag) = linear envelope.
// The envelope is then normalised to the muscle's MVIC (or the session's highest task peak, or left in µV).
// Windows (reps, phases, your own) come from the points marked by hand, and every result is worked out in them.
import { A, SET, muscle, muscleKeys, POINT_NAME } from './state.js?v=1.0.0';
import { processEmg, butterSos, sosfiltfilt, movingMean, welch, specStats, powerBelow, humRatio, normalise } from './dsp.js?v=1.0.0';

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
export function normInfo() {
  const n = SET().norm;
  return n === 'mvic' ? { unit: '%MVIC', lab: 'EMG (% MVIC)', k: 100 } : n === 'peak' ? { unit: '% peak', lab: 'EMG (% of the session peak)', k: 100 } : { unit: 'µV', lab: 'EMG envelope (µV)', k: 1e6 };
}
// Divisor for each muscle (volts -> the display unit is value / div * k)
export function divisors(t) {
  const n = SET().norm, out = {}, ath = who(t || A.S);
  if (n === 'mvic') { const r = references(ath); Object.keys(r).forEach((k) => { out[k] = r[k].v; }); }
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

  // reps: each Rep start to the next Rep end; with no Rep ends, each Rep start to the next (cycles)
  const r0 = pts.filter((p) => p.type === 'rep0'), r1 = pts.filter((p) => p.type === 'rep1');
  const reps = [];
  if (r1.length) r0.forEach((a, j) => { const nx = r0[j + 1]; const b = r1.find((e) => e.i > a.i && (!nx || e.i <= nx.i)); if (b) reps.push({ a, b }); });
  else r0.forEach((a, j) => { const b = r0[j + 1]; if (b) reps.push({ a, b }); });
  R.cycles = !r1.length && reps.length > 0;
  R.reps = reps.map((r, j) => ({ id: 'rep' + (j + 1), name: 'Rep ' + (j + 1), i0: r.a.i, i1: r.b.i, rep: j, kind: 'rep' }));
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
  R.bursts = bursts(R);
  R.guide = guideLines(R);
  return R;
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

// Onset and offset (marked by hand on each muscle) inside each rep, or in the whole trial if there are no reps.
function bursts(R) {
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
  const div = set.norm === 'mvic' ? divisors(t) : {};
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
    if (set.norm === 'mvic' && t.role !== 'mvic') {
      if (!(div[c.key] > 0)) items.push({ lv: 'bad', txt: 'No MVIC file for this muscle, so it cannot be shown as %MVIC. Add its MVIC file and tick this muscle in <strong>1. Setup</strong>.' });
      else { let pk = 0; for (let i = 0; i < n; i++) if (c.env[i] > pk) pk = c.env[i]; const p = pk / div[c.key] * 100; if (p > 100) items.push({ lv: 'info', txt: 'Peaks at ' + p.toFixed(0) + '% MVIC. Above 100% is common in fast or eccentric work, but if it is well above, the MVIC may not have been a true maximum.' }); }
    }
    out.push({ key: c.key, name, items });
  });
  return out;
}

export function pointLabel(p) { return (POINT_NAME[p.type] || p.type) + (p.m ? ' ' + muscle(p.m).short : '') + (p.type === 'mark' && p.name ? ' ' + p.name : ''); }
export { muscleKeys, who };
