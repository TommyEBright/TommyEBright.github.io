// Time normalisation: each phase between a start event and an end event is resampled to 0-100 %.
// The filtered data are interpolated with a natural cubic spline at n evenly spaced points.
import { A, tReal } from './state.js?v=2.1.1';
import { allVariables } from './vars.js?v=2.1.1';
import { units, spline, mean, sd } from './maths.js?v=2.1.1';

// Start/end frames of every phase: each start event paired with the next end event after it.
export function phases(S, start, end) {
  const ev = S.events.slice().sort((a, b) => a.frame - b.frame), out = [];
  ev.forEach((e, i) => {
    if (e.name !== start) return;
    for (let j = i + 1; j < ev.length; j++) {
      if (ev[j].name === end && ev[j].frame > e.frame) { out.push({ a: e.frame, b: ev[j].frame }); break; }
      if (ev[j].name === start && start !== end) break;
    }
  });
  return out;
}

// Resample values V (at times T) between ta and tb to n points. Null if the data do not cover the phase.
function resample(T, V, ta, tb, n) {
  const xs = [], ys = [];
  T.forEach((t, i) => { const v = V[i]; if (v !== null && v !== undefined && !Number.isNaN(v) && t >= ta - 0.02 && t <= tb + 0.02) { xs.push(t); ys.push(v); } });
  if (xs.length < 4) return null;
  const dt = (xs[xs.length - 1] - xs[0]) / (xs.length - 1);
  if (xs[0] > ta + 1.5 * dt || xs[xs.length - 1] < tb - 1.5 * dt) return null;
  const f = spline(xs, ys), out = [];
  for (let k = 0; k < n; k++) out.push(f(ta + (tb - ta) * k / (n - 1)));
  return out;
}

// The variables that can be normalised, in a stable order (see vars.js).
export function variableList(R, opts) { return allVariables(R, opts); }

// Normalise one trial's results (each phase, then the ensemble average: mean and SD point by point). Returns { cycles, vars: { key: { label, unit, curves, mean, sd } }, pct }.
export function normalise(R, S, start, end, n, opts) {
  n = Math.max(11, Math.min(1001, n || 101));
  const ph = phases(S, start, end), pct = [];
  for (let k = 0; k < n; k++) pct.push(100 * k / (n - 1));
  const out = { cycles: ph.map((p) => ({ a: p.a, b: p.b, dur: tReal(p.b) - tReal(p.a) })), vars: {}, pct };
  if (!R || !ph.length) return out;
  variableList(R, opts).forEach((v) => {
    const curves = [], [T, , V] = v.get();
    ph.forEach((p) => { curves.push(resample(T, V, tReal(p.a), tReal(p.b), n)); });
    if (!curves.some(Boolean)) return;
    out.vars[v.key] = { label: v.label, unit: v.unit, curves, ...meanSd(curves.filter(Boolean)) };
  });
  return out;
}
export function meanSd(curves) {
  if (!curves.length) return { mean: null, sd: null };
  const n = curves[0].length, m = [], s = [];
  for (let k = 0; k < n; k++) { const col = curves.map((c) => c[k]); m.push(mean(col)); s.push(col.length > 1 ? sd(col) : 0); }
  return { mean: m, sd: s };
}
export function eventNames(S) { return [...new Set((S || A.S).events.map((e) => e.name))]; }
