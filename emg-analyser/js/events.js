// Finding reps, strides and cycles from a "movement signal".
// The movement signal is one line that follows the movement: the knocks of each foot contact, how far the
// sensor has tilted from where it started, a dynamometer's angle, or the EMG itself. Three choices find the
// events in it: which signal, what to look for (a steady rhythm, out and back, or above or below a level),
// and the limits. Each activity has a preset, and every event found can be checked and moved by hand.
import { SET, muscle } from './state.js?v=1.4.0';
import { butterSos, sosfiltfilt } from './dsp.js?v=1.4.0';

export const PRESETS = {
  run: { name: 'Running or walking', set: { signal: 'impact', mode: 'cycle', dir: 'above' } },
  cycle: { name: 'Cycling', set: { signal: 'move', mode: 'cycle', dir: 'above' } },
  lift: { name: 'Lifting and lowering (squat, deadlift, curl, Nordic&hellip;)', set: { signal: 'tilt', mode: 'thereback', dir: 'above' } },
  jump: { name: 'Jumping', set: { signal: 'mag', mode: 'level', dir: 'below', minDur: 0.1, before: 1, after: 0.5 } },
  hold: { name: 'Isometric holds, or any burst of effort', set: { signal: 'emg', mode: 'level', dir: 'above', minDur: 0.5 } },
  custom: { name: 'Something else (choose the settings yourself)', set: { signal: 'mag', mode: 'peaks', dir: 'above' } }
};
export const MODES = {
  cycle: 'A steady rhythm: one event in every cycle',
  peaks: 'Every clear peak (an uneven rhythm)',
  thereback: 'Out and back: each rep leaves the start position and returns',
  level: 'Above or below a level (holds, flight)'
};
const ACT_PRESET = { reps: 'lift', gait: 'run', cycling: 'cycle', jump: 'jump', iso: 'hold', open: 'custom' };
const BASE = { level: null, T: 0, gap: 0.5, minDur: 0.3, before: 0, after: 0 };
export function newFind(preset, keep) { return Object.assign({ preset, sensor: (keep && keep.sensor) || '' }, BASE, PRESETS[preset].set); }
export function findSet() { const s = SET(); if (!s.find || !PRESETS[s.find.preset]) s.find = newFind(ACT_PRESET[s.activity] || 'custom', s.find); return s.find; }
export function activityChanged() { const s = SET(); s.find = newFind(ACT_PRESET[s.activity] || 'custom', s.find); return s.find; }
// The names of the phases a preset makes, used when the phase names are still the defaults.
// "Out" and "Back" for lifts, because the tool cannot know whether the rep starts by lowering (a squat) or by lifting (a curl).
export const PRESET_PHASES = { run: ['Stance', 'Swing'], cycle: ['Downstroke', 'Upstroke'], lift: ['Out', 'Back'], jump: ['Before take-off', 'Flight', 'After landing'] };
export function presetPhaseNames(preset) {
  const set = SET(), want = PRESET_PHASES[preset], known = Object.values(PRESET_PHASES);
  if (!want || !set.phaseNames.every((n, j) => n === 'Phase ' + (j + 1) || known.some((k) => k[j] === n))) return;
  set.phaseNames = Array.from({ length: 4 }, (_, j) => want[j] || 'Phase ' + (j + 1));
}

// ---------- the signals ----------
const lp = (y, fc, fs, ord) => (y.length > 30 && fc < fs * 0.45 ? sosfiltfilt(butterSos(ord || 2, fc, 'low', fs), y) : Float64Array.from(y));
// The part of the recording with data in it (Trigno files start and end with exact zeros), in seconds.
export function validSpan(pr) {
  if (pr._span) return pr._span;
  let t0 = Infinity, t1 = 0;
  pr.ch.forEach((c) => { let i = 0; while (i < c.n && c.raw[i] === 0) i++; let j = c.n - 1; while (j > i && c.raw[j] === 0) j--; t0 = Math.min(t0, i / pr.fs); t1 = Math.max(t1, j / pr.fs); });
  if (!(t1 > t0)) { t0 = 0; t1 = (pr.n - 1) / pr.fs; }
  return (pr._span = [t0, t1]);
}
// Every signal this file can offer: [id, label].
export function signalOptions(pr) {
  const out = [];
  if (Object.keys(pr.acc).length) {
    const s0 = Object.values(pr.acc)[0];
    out.push(['impact', 'Impacts: sharp knocks such as foot contacts'], ['tilt', 'Tilt angle: how far the sensor has turned from its starting position'], ['mag', 'Size of the acceleration (all three axes together)'], ['move', 'The axis that moves most (smoothed)']);
    Object.keys(s0.ax).sort().forEach((ax) => out.push(['ax:' + ax, 'Accelerometer ' + ax + ' axis']));
  }
  (pr.aux || []).forEach((a) => out.push(['aux:' + a.name, a.name + (a.unit ? ' (' + a.unit + ')' : '')]));
  if (pr.ch.length > 1) out.push(['emg', 'EMG: every muscle together']);
  pr.ch.forEach((c) => out.push(['emg:' + c.key, 'EMG: ' + muscle(c.key).short]));
  return out;
}
// The signal and sensor actually used for this file (the ones asked for, or the nearest it has).
export function resolve(pr, f) {
  const opts = signalOptions(pr).map((o) => o[0]), sensors = Object.keys(pr.acc);
  let signal = f.signal;
  if (signal === 'emg' && pr.ch.length === 1) signal = 'emg:' + pr.ch[0].key;
  if (!opts.includes(signal)) signal = /^(emg|aux)/.test(signal) ? (opts.find((o) => o.startsWith(signal.slice(0, 3))) || opts[0]) : (opts.find((o) => o.startsWith('aux:')) || opts.find((o) => o.startsWith('emg')));
  return { signal, sensor: sensors.includes(f.sensor) ? f.sensor : sensors[0] || '', usesAcc: !/^(emg|aux)/.test(signal) };
}
const UNIT = { impact: 'g', tilt: '°', mag: 'g', move: 'g' };
// Builds the movement signal: { y, t, fs, a, b (first and last sample with data), unit, name, id, sensor }.
export function moveSignal(pr, f) {
  f = f || findSet();
  const r = resolve(pr, f); if (!r.signal) return null;
  const key = r.signal + '|' + (r.usesAcc ? r.sensor : '');
  pr._sig = pr._sig || {}; if (key in pr._sig) return pr._sig[key];
  const [t0, t1] = validSpan(pr);
  let fs, n, a, b, y, unit = '', name = '';
  const span = (FS, N) => { fs = FS; n = N; a = Math.max(0, Math.min(n - 1, Math.ceil(t0 * fs))); b = Math.max(a, Math.min(n - 1, Math.floor(t1 * fs))); y = new Float64Array(n).fill(NaN); };
  const put = (seg) => { for (let i = 0; i < seg.length; i++) y[a + i] = seg[i]; };
  if (r.usesAcc) {
    const s0 = pr.acc[r.sensor], axs = Object.values(s0.ax), keys = Object.keys(s0.ax);
    span(s0.fs, Math.min(...axs.map((q) => q.length)));
    if (b - a < 30) return (pr._sig[key] = null);
    const segs = axs.map((q) => Float64Array.from(q.subarray(a, b + 1))), m = b - a + 1, o = new Float64Array(m);
    const norm = (S) => { for (let i = 0; i < m; i++) { let q = 0; S.forEach((s) => { q += s[i] * s[i]; }); o[i] = Math.sqrt(q); } return o; };
    const kind = r.signal;
    if (kind === 'impact' && fs > 40) {
      // gravity and the swing of the limb are slow; a foot contact is a fast shock. Keep only what is above 15 Hz.
      const hp = butterSos(2, 15, 'high', fs);
      put(lp(norm(segs.map((s) => sosfiltfilt(hp, s))), 20, fs)); name = 'Impacts';
    } else if (kind === 'tilt') {
      // below 1.5 Hz the accelerometer mostly reads gravity, so its direction shows which way up the sensor is
      const g = segs.map((s) => lp(s, 1.5, fs)), k = Math.max(3, Math.round(0.3 * fs)), g0 = g.map((s) => { let q = 0; for (let i = 0; i < k; i++) q += s[i]; return q / k; });
      const n0 = Math.hypot(...g0) || 1;
      for (let i = 0; i < m; i++) { let d = 0, q = 0; g.forEach((s, j) => { d += s[i] * g0[j]; q += s[i] * s[i]; }); o[i] = Math.acos(Math.max(-1, Math.min(1, d / (Math.sqrt(q) || 1) / n0))) * 180 / Math.PI; }
      put(o); name = 'Tilt angle';
    } else if (kind === 'move') {
      let best = 0, bv = -1;
      segs.forEach((s, j) => { let mu = 0, q = 0; for (let i = 0; i < m; i++) { mu += s[i]; q += s[i] * s[i]; } const v = q / m - (mu / m) ** 2; if (v > bv) { bv = v; best = j; } });
      let mu = 0; for (let i = 0; i < m; i++) mu += segs[best][i]; mu /= m;
      put(lp(segs[best].map((v) => v - mu), 3, fs)); name = 'Movement (' + keys[best] + ' axis)';
    } else if (kind.startsWith('ax:') && s0.ax[kind.slice(3)]) { put(lp(segs[keys.indexOf(kind.slice(3))], 6, fs)); name = 'Accelerometer ' + kind.slice(3); }
    else { put(lp(norm(segs), 15, fs)); name = 'Acceleration'; }
    unit = UNIT[kind] || 'g'; name += ', ' + (muscle(r.sensor).short || r.sensor) + ' sensor';
  } else {
    // an extra channel or the EMG envelope, brought down to about 200 Hz
    let src, sfs;
    if (r.signal.startsWith('aux:')) { const x = (pr.aux || []).find((q) => 'aux:' + q.name === r.signal); src = lp(Float64Array.from(x.y), 10, x.fs); sfs = x.fs; unit = x.unit; name = x.name; }
    else if (r.signal === 'emg') {
      sfs = pr.fs; const m = Math.min(...pr.ch.map((c) => c.n)); src = new Float64Array(m);
      pr.ch.forEach((c) => { let mx = 0; for (let i = 0; i < m; i++) if (c.env[i] > mx) mx = c.env[i]; if (mx > 0) for (let i = 0; i < m; i++) src[i] += c.env[i] / mx * 100 / pr.ch.length; });
      unit = '% of each peak'; name = 'EMG, every muscle together';
    } else { const c = pr.ch.find((q) => 'emg:' + q.key === r.signal); sfs = pr.fs; src = c.env.map((v) => v * 1e6); unit = 'µV'; name = 'EMG envelope, ' + muscle(c.key).short; }
    const d = Math.max(1, Math.round(sfs / 200));
    span(sfs / d, Math.floor(src.length / d));
    for (let i = a; i <= b; i++) y[i] = src[i * d];
  }
  const t = new Float64Array(n); for (let i = 0; i < n; i++) t[i] = i / fs;
  return (pr._sig[key] = { y, t, fs, n, a, b, unit, name, id: r.signal, sensor: r.usesAcc ? r.sensor : '' });
}

// ---------- finding the events ----------
const pct = (sorted, p) => sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * p)))];
function levels(v, a, b) { const s = []; for (let i = a; i <= b; i++) if (Number.isFinite(v[i])) s.push(v[i]); s.sort((p, q) => p - q); return { base: pct(s, 0.1), top: pct(s, 0.98), med: pct(s, 0.5), p99: pct(s, 0.99) }; }
// The time of one cycle: the lag at which the signal best matches itself (the highest peak of its autocorrelation).
export function cycleTime(v, fs, a, b) {
  const m = b - a + 1, lo = Math.max(2, Math.round(0.3 * fs)), hi = Math.min(Math.round(3 * fs), Math.floor(m / 2.5));
  if (hi - lo < 3) return 0;
  let mu = 0; for (let i = a; i <= b; i++) mu += v[i]; mu /= m;
  const ac = new Float64Array(hi + 2);
  for (let L = lo - 1; L <= hi + 1; L++) { let q = 0; for (let i = a; i + L <= b; i++) q += (v[i] - mu) * (v[i + L] - mu); ac[L] = q; }
  let best = 0, bv = 0;
  for (let L = lo; L <= hi; L++) if (ac[L] > ac[L - 1] && ac[L] >= ac[L + 1] && ac[L] > bv) { bv = ac[L]; best = L; }
  return best / fs;
}
// One event in every cycle: start at the biggest peak, then step one cycle at a time in both directions,
// taking the highest point within 20% of a cycle of where the next one is expected.
function findCycle(v, fs, a, b, T) {
  const s = Math.round(T * fs), w = Math.max(1, Math.round(0.2 * T * fs));
  if (s < 3) return [];
  let i0 = a; for (let i = a; i <= b; i++) if (v[i] > v[i0]) i0 = i;
  const ev = [i0];
  [1, -1].forEach((d) => {
    let i = i0;
    for (;;) {
      const c = i + d * s, lo = c - w, hi = c + w;
      if (lo < a || hi > b) break;
      let k = lo; for (let j = lo; j <= hi; j++) if (v[j] > v[k]) k = j;
      ev.push(k); i = k;
    }
  });
  ev.sort((p, q) => p - q);
  const h = ev.map((i) => v[i]).sort((p, q) => p - q), med = h[Math.floor(h.length / 2)], lv = levels(v, a, b);
  return ev.filter((i) => v[i] - lv.med > 0.5 * (med - lv.med)); // a "peak" less than half the usual height is not one
}
// Every peak above the level, the tallest first, none closer together than gap seconds.
function findPeaks(v, fs, a, b, level, gap) {
  const cand = [];
  for (let i = Math.max(a, 1); i <= Math.min(b, v.length - 2); i++) if (v[i] >= level && v[i] >= v[i - 1] && v[i] > v[i + 1]) cand.push(i);
  cand.sort((p, q) => v[q] - v[p]);
  const g = Math.round(gap * fs), keep = [];
  cand.forEach((i) => { if (keep.every((k) => Math.abs(k - i) >= g)) keep.push(i); });
  return keep.sort((p, q) => p - q);
}
// Stretches of the signal above the level: gaps shorter than joinS are bridged, stretches shorter than minS dropped,
// and any that touch the start or end of the recording are left out (they are not whole).
function above(v, fs, a, b, level, joinS, minS) {
  const r = []; let s = -1;
  for (let i = a; i <= b; i++) { const on = v[i] >= level; if (on && s < 0) s = i; if (s >= 0 && (!on || i === b)) { r.push([s, on ? i : i - 1]); s = -1; } }
  const m = []; r.forEach((x) => { const p = m[m.length - 1]; if (p && (x[0] - p[1]) / fs < joinS) p[1] = x[1]; else m.push(x.slice()); });
  return m.filter((x) => (x[1] - x[0]) / fs >= minS && x[0] > a && x[1] < b);
}

// Runs the finder on a processed trial. Returns the points ({type, t}) and how they were found.
export function runFinder(pr, f) {
  f = f || findSet();
  const sig = moveSignal(pr, f); if (!sig) return { pts: [], sig: null, why: 'This file has no signal to look in.' };
  const { fs, a, b } = sig, flip = f.dir === 'below', v = flip ? sig.y.map((q) => -q) : sig.y;
  const lv = levels(v, a, b), range = lv.top - lv.base, tm = (i) => i / fs, pts = [];
  const info = { preset: f.preset, mode: f.mode, signal: sig.id, signalName: sig.name, unit: sig.unit, sensor: sig.sensor, dir: f.dir };
  if (!(range > 0)) return { pts, sig, info, why: 'The signal is flat.' };
  const userLevel = Number.isFinite(f.level) && f.level !== null ? (flip ? -f.level : f.level) : null;
  if (f.mode === 'cycle') {
    const T = f.T > 0 ? f.T : cycleTime(v, fs, a, b);
    if (!(T > 0)) return { pts, sig, info, why: 'No steady rhythm was found in this signal. Try &ldquo;Every clear peak&rdquo; instead.' };
    findCycle(v, fs, a, b, T).forEach((i) => pts.push({ type: 'rep0', t: tm(i) }));
    info.T = T; info.autoT = !(f.T > 0);
  } else if (f.mode === 'peaks') {
    const level = userLevel !== null ? userLevel : lv.med + 0.5 * (lv.p99 - lv.med);
    findPeaks(v, fs, a, b, level, f.gap).forEach((i) => pts.push({ type: 'rep0', t: tm(i) }));
    info.level = flip ? -level : level; info.gap = f.gap;
  } else if (f.mode === 'thereback') {
    const level = userLevel !== null ? userLevel : lv.base + 0.3 * range, edge = 0.05 * range;
    const R = above(v, fs, a, b, level, 0.15, f.minDur);
    R.forEach((x, j) => {
      const lo = j ? R[j - 1][1] : a, hi = j < R.length - 1 ? R[j + 1][0] : b;
      let mn = Infinity; for (let i = lo; i <= x[0]; i++) if (v[i] < mn) mn = v[i];
      let s = x[0]; while (s > lo && v[s] > mn + edge) s--;
      mn = Infinity; for (let i = x[1]; i <= hi; i++) if (v[i] < mn) mn = v[i];
      let e = x[1]; while (e < hi && v[e] > mn + edge) e++;
      let k = x[0]; for (let i = x[0]; i <= x[1]; i++) if (v[i] > v[k]) k = i;
      if (s < k && k < e) pts.push({ type: 'rep0', t: tm(s) }, { type: 'phase', t: tm(k) }, { type: 'rep1', t: tm(e) });
    });
    info.level = flip ? -level : level; info.phases = true;
  } else {
    const level = userLevel !== null ? userLevel : flip ? -0.4 * Math.abs(lv.med) : lv.base + 0.3 * range;
    let last = a;
    above(v, fs, a, b, level, 0.05, f.minDur).forEach((x) => {
      const s = Math.max(last, x[0] - Math.round((f.before || 0) * fs)), e = Math.min(b, x[1] + Math.round((f.after || 0) * fs));
      pts.push({ type: 'rep0', t: tm(s) });
      if (s < x[0]) pts.push({ type: 'phase', t: tm(x[0]) });
      if (e > x[1]) pts.push({ type: 'phase', t: tm(x[1]) });
      pts.push({ type: 'rep1', t: tm(e) }); last = e + 1;
    });
    info.level = flip ? -level : level; info.before = f.before; info.after = f.after; info.phases = pts.some((p) => p.type === 'phase');
  }
  info.n = pts.filter((p) => p.type === 'rep0').length;
  return { pts, sig, info, why: info.n ? '' : 'Nothing was found with these settings.' };
}
// The level the finder is using (for the dashed line on the movement lane), or null.
export function finderLevel(pr, f) {
  f = f || findSet(); if (f.mode === 'cycle') return null;
  const key = JSON.stringify(f); if (pr._lvl && pr._lvl.key === key) return pr._lvl.v;
  const r = runFinder(pr, f), v = r.info && Number.isFinite(r.info.level) ? r.info.level : null;
  pr._lvl = { key, v }; return v;
}

// In plain words: what a rep is and where its phases change, for the finder's settings.
export function describeFind(info, w) {
  const sig = '<strong>' + info.signalName.replace(/^(?!EMG)./, (c) => c.toLowerCase()).replace(/, (.*) sensor$/, ' of the $1 sensor') + '</strong>', lvl = Number.isFinite(info.level) ? ' (' + (+info.level.toPrecision(3)) + ' ' + info.unit + ')' : '';
  if (info.mode === 'cycle') return 'Each ' + w.one + ' starts at the ' + (info.dir === 'below' ? 'lowest' : 'highest') + ' point of the ' + sig + ' in every cycle' + (info.signal === 'impact' ? ' (the knock when the foot of that leg lands)' : '') + ', and runs to the next one. One cycle takes about ' + info.T.toFixed(2) + ' s' + (info.autoT ? ', worked out from the rhythm of the signal' : ' (set by you)') + '.';
  if (info.mode === 'peaks') return 'Each ' + w.one + ' starts at a ' + (info.dir === 'below' ? 'dip' : 'peak') + ' of the ' + sig + ' beyond the dashed level' + lvl + ', at least ' + info.gap + ' s apart, and runs to the next one.';
  if (info.mode === 'thereback') return 'A ' + w.one + ' is counted each time the ' + sig + ' goes ' + (info.dir === 'below' ? 'below' : 'above') + ' the dashed level' + lvl + '. It <strong>starts</strong> where the signal first leaves its resting value, <strong>changes phase</strong> at the furthest point (the turnaround), and <strong>ends</strong> where the signal is back at rest.';
  return 'A ' + w.one + ' is each stretch where the ' + sig + ' is ' + (info.dir === 'below' ? 'below' : 'above') + ' the dashed level' + lvl + (info.before || info.after ? ', plus ' + (info.before || 0) + ' s before and ' + (info.after || 0) + ' s after it (the phase changes are where it crosses the level)' : '') + '.';
}
