// The kinematic variables, named as in Robertson et al. (2014) Research Methods in Biomechanics, ch. 1.
// Linear kinematics of a marker: position, velocity and acceleration (x, y and resultant).
// Angular kinematics of an angle: angular position, angular velocity and angular acceleration.
// x is horizontal (+ forwards, or + to the right with no fixed direction) and y is vertical (+ up).
import { DEG } from './state.js?v=2.1.0';
import { units } from './maths.js?v=2.1.0';

export const LIN = [
  { k: 'x', key: 'x', name: 'x position', short: 'x', kind: 'position', get: (s) => s.x },
  { k: 'y', key: 'y', name: 'y position', short: 'y', kind: 'position', get: (s) => s.y },
  { k: 'vx', key: 'vx', name: 'x velocity', short: 'vx', kind: 'velocity', get: (s) => s.vx },
  { k: 'vy', key: 'vy', name: 'y velocity', short: 'vy', kind: 'velocity', get: (s) => s.vy },
  { k: 'v', key: 'speed', name: 'resultant velocity', short: 'v', kind: 'velocity', get: (s) => s.speed },
  { k: 'ax', key: 'ax', name: 'x acceleration', short: 'ax', kind: 'acceleration', get: (s) => s.ax },
  { k: 'ay', key: 'ay', name: 'y acceleration', short: 'ay', kind: 'acceleration', get: (s) => s.ay },
  { k: 'a', key: 'acc', name: 'resultant acceleration', short: 'a', kind: 'acceleration', get: (s) => s.accMag }
];
export const ANG = [
  { k: 'th', key: 'ang', name: 'angular position', short: 'theta', kind: 'position', get: (a) => a.V },
  { k: 'w', key: 'angvel', name: 'angular velocity', short: 'omega', kind: 'velocity', get: (a) => a.W },
  { k: 'al', key: 'angacc', name: 'angular acceleration', short: 'alpha', kind: 'acceleration', get: (a) => a.AA }
];

export function linUnit(kind, u) { u = u || units(); return kind === 'position' ? u : kind === 'velocity' ? u + '/s' : u + '/s²'; }
export function angUnit(kind, rad) { const b = rad ? 'rad' : '°'; return kind === 'position' ? b : kind === 'velocity' ? b + '/s' : b + '/s²'; }
const conv = (arr, k) => (k === 1 ? arr : arr.map((v) => (v === null || v === undefined ? null : v * k)));

// Every variable in a set of results, in a stable order. opts: { markers, angles, lin, ang, rad }.
// Each item: { key, label, unit, m or ang, get: () => [T, F, V] }.
export function allVariables(R, opts) {
  opts = opts || {};
  const out = []; if (!R) return out;
  const u = units(), rad = !!opts.rad, ak = rad ? 1 / DEG : 1;
  Object.keys(R.sers).forEach((m) => {
    if (opts.markers && !opts.markers.includes(m)) return;
    const s = R.sers[m];
    LIN.forEach((d) => {
      if (opts.lin && !opts.lin.includes(d.k)) return;
      out.push({ key: m + '|' + d.key, label: m + ' ' + d.name, unit: linUnit(d.kind, u), m, def: d, get: () => [s.T, s.F, d.get(s)] });
    });
  });
  R.ang.forEach((a) => {
    if (opts.angles && !opts.angles.includes(a.key)) return;
    ANG.forEach((d) => {
      if (opts.ang && !opts.ang.includes(d.k)) return;
      out.push({ key: d.key + '|' + a.key, label: d.k === 'th' ? a.key + ' (angular position)' : a.key + ' ' + d.name, unit: angUnit(d.kind, rad), ang: a, def: d, get: () => [a.T, a.F, conv(d.get(a), ak)] });
    });
  });
  return out;
}
