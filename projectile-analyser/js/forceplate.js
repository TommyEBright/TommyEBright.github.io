// A standing long jump from force platforms: take-off velocity forwards and upwards from the force-time record.
// Same method as Force Analysis: weigh the jumper while standing still, then integrate acceleration (net force / mass)
// from rest to take-off, separately for the vertical force and for the horizontal force that pushes the jump forwards.
import { G } from './maths.js?v=1.4.1';

// BioWare text export (one or more platforms, each with Fx Fy Fz), or a CSV/TSV with time, Fx, Fz (and optionally Fy).
export function parseForce(text) {
  const L = text.split(/\r?\n/);
  let hi = L.findIndex((l) => /^\s*abs time/i.test(l)), fs = 0;
  const rate = L.find((l) => /^Rate \(Hz\)/i.test(l)); if (rate) fs = parseFloat(rate.split(/\t/)[1]);
  let head, body;
  if (hi >= 0) { head = L[hi].split(/\t/).map((s) => s.trim().toLowerCase()); body = L.slice(hi + 2); }
  else {
    hi = L.findIndex((l) => /f[xyz]/i.test(l)); if (hi < 0) throw new Error('No force columns (Fx, Fy, Fz) found.');
    const dl = L[hi].includes('\t') ? '\t' : L[hi].includes(';') ? ';' : ',';
    head = L[hi].split(dl).map((s) => s.trim().toLowerCase()); body = L.slice(hi + 1).map((l) => l.split(dl).join('\t'));
  }
  const rows = body.filter((l) => l.trim()).map((l) => l.split(/\t/).map(Number)).filter((r) => r.every((v) => Number.isFinite(v)));
  if (rows.length < 100) throw new Error('Too few rows of force data.');
  const plates = []; let cur = null;
  head.forEach((h, j) => { const m = /^f([xyz])/.exec(h); if (!m) return; if (!cur || cur[m[1]] !== undefined) { cur = {}; plates.push(cur); } cur[m[1]] = j; });
  if (!plates.length || plates.some((p) => p.z === undefined)) throw new Error('Every platform needs an Fz column.');
  const ti = head.findIndex((h) => /time/.test(h));
  if (!fs && ti >= 0) fs = 1 / (rows[1][ti] - rows[0][ti]);
  if (!(fs > 0)) throw new Error('Could not work out the sampling rate.');
  const col = (j) => (j === undefined ? null : Float64Array.from(rows, (r) => r[j]));
  return { fs, n: rows.length, plates: plates.map((p, k) => ({ name: 'Plate ' + (k + 1), fx: col(p.x), fy: col(p.y), fz: col(p.z) })) };
}

const mean = (a, s, e) => { let t = 0; for (let i = s; i < e; i++) t += a[i]; return t / (e - s); };
const sdev = (a, s, e) => { const m = mean(a, s, e); let t = 0; for (let i = s; i < e; i++) t += (a[i] - m) ** 2; return Math.sqrt(t / (e - s - 1)); };

export function analyseSLJ(D) {
  const { fs, n } = D, dt = 1 / fs, Fz = new Float64Array(n);
  D.plates.forEach((p) => { for (let i = 0; i < n; i++) Fz[i] += p.fz[i]; });
  // still standing: the steadiest 1 s in the first part of the record
  const win = Math.min(Math.round(fs), Math.floor(n / 4)); let ws = 0, best = Infinity;
  for (let s = 0; s + win < n * 0.6; s += Math.max(1, Math.round(win / 10))) { const v = sdev(Fz, s, s + win); if (mean(Fz, s, s + win) > 200 && v < best) { best = v; ws = s; } }
  const we = ws + win, BW = mean(Fz, ws, we), SD = sdev(Fz, ws, we), m = BW / G;
  if (!(BW > 200)) throw new Error('Could not find the jumper standing still on the platforms.');
  // take-off: force falls below 20 N; start of movement: last time before take-off within 5 SD of bodyweight
  let TO = -1; for (let i = we; i < n; i++) if (Fz[i] < 20) { TO = i; break; }
  if (TO < 0) throw new Error('No take-off found: the force never drops below 20 N.');
  let on = we; const lim = Math.max(5 * SD, 0.02 * BW);
  for (let i = we; i < TO; i++) if (Math.abs(Fz[i] - BW) > lim) { on = i; break; }
  while (on > we && Math.abs(Fz[on] - BW) > SD) on--;
  const start = Math.min(we, on);
  // horizontal: on each loaded platform, the axis (Fx or Fy) with the biggest impulse over the push, signed forwards
  const Fh = new Float64Array(n), info = [];
  D.plates.forEach((p) => {
    let imp = 0; for (let i = on; i < TO; i++) imp += p.fz[i] * dt; if (imp < 0.05 * BW * (TO - on) * dt) return;
    const cand = ['fx', 'fy'].filter((a) => p[a]).map((a) => { const off = mean(p[a], ws, we); let s = 0; for (let i = on; i < TO; i++) s += (p[a][i] - off) * dt; return { a, off, s }; });
    if (!cand.length) return; const c = cand.reduce((x, y) => (Math.abs(y.s) > Math.abs(x.s) ? y : x)), sg = c.s >= 0 ? 1 : -1;
    for (let i = 0; i < n; i++) Fh[i] += sg * (p[c.a][i] - c.off);
    info.push(p.name + ' ' + (sg < 0 ? '−' : '') + c.a.toUpperCase());
  });
  if (!info.length) throw new Error('No horizontal force (Fx or Fy) in this file, so the forwards velocity cannot be worked out.');
  // integrate from rest (trapezium rule)
  const vz = new Float64Array(n), vh = new Float64Array(n);
  for (let i = start + 1; i <= TO; i++) {
    vz[i] = vz[i - 1] + 0.5 * dt * ((Fz[i - 1] - BW) + (Fz[i] - BW)) / m;
    vh[i] = vh[i - 1] + 0.5 * dt * (Fh[i - 1] + Fh[i]) / m;
  }
  for (let i = TO + 1; i < n; i++) { vz[i] = vz[TO] - G * (i - TO) * dt; vh[i] = vh[TO]; }
  let air = 0, na = 0; for (let i = TO + Math.round(0.05 * fs); i < Math.min(n, TO + Math.round(0.25 * fs)); i++) { air += Math.abs(Fz[i]); na++; }
  return { fs, n, dt, Fz, Fh, vz, vh, BW, SD, m, ws, we, on, TO, vx: vh[TO], vy: vz[TO], tTO: TO * dt, airN: na ? air / na : NaN, axes: info.join(' + ') };
}
