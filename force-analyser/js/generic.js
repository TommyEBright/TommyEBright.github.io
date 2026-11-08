// Any force-time data (walking, running, landing, isometric or anything else).
// The user finds the points by hand; the tool works out the results between them.
// The results come out in the same form as the jump results (see vars.js), so the same tables, exports and
// comparisons work for both.
import { G, area, mean, argmax, argmin, butter } from './maths.js?v=2.0.0';

export const TYPES = {
  any: 'Any force–time data',
  walk: 'Walking',
  run: 'Running',
  land: 'Landing',
  iso: 'Isometric (e.g. IMTP or isometric squat)'
};
export const TYPE_SHORT = { any: 'Force–time', walk: 'Walking', run: 'Running', land: 'Landing', iso: 'Isometric' };
export const TYPE_HELP = {
  any: 'Any force–time trace. Mark a Start and an End (as many pairs as you like) and get the peak, minimum, mean, impulse and duration between them, for any force.',
  walk: 'Foot contacts on one or more plates. Mark each foot contact and toe-off; the tool gives contact time, the two vertical peaks, the mid-stance dip, loading rate, and braking and propulsive forces and impulses.',
  run: 'Foot contacts while running. Mark each foot contact and toe-off; the tool gives contact time, impact and active peaks, loading rate, braking and propulsive forces and impulses, and flight time between contacts.',
  land: 'A landing (e.g. from a box or a jump). Mark touchdown and the moment the participant is stable; the tool gives peak landing force, time to peak, loading rate and time to stabilise.',
  iso: 'An isometric pull or push (e.g. isometric mid-thigh pull). Mark the onset of the pull (and its end); the tool gives peak force, net force and rate of force development at set times, and impulse.'
};
// The point buttons for each type. Gait points belong to a plate.
export const POINTS = {
  any: ['Start', 'End'],
  walk: ['Foot contact', 'Toe-off'],
  run: ['Foot contact', 'Toe-off'],
  land: ['Touchdown', 'Stable'],
  iso: ['Onset', 'End of pull']
};
export const POINT_HELP = {
  Start: 'the start of the part you want to analyse',
  End: 'the end of it',
  'Foot contact': 'the first sample where force rises above zero on that plate (zoom right in)',
  'Toe-off': 'the last sample before force drops back to zero',
  Touchdown: 'the first sample where force rises above zero',
  Stable: 'where force has settled at bodyweight and stays there',
  Onset: 'the last sample before force starts to rise (zoom right in)',
  'End of pull': 'where force starts to fall at the end of the pull',
  'Still start': 'the start of a period of standing completely still',
  'Still end': 'the end of it'
};
export const GAIT = { walk: 1, run: 1 };
export const POINT_COL = { Start: '#2563eb', End: '#7c3aed', 'Foot contact': '#2563eb', 'Toe-off': '#059669', Touchdown: '#2563eb', Stable: '#059669', Onset: '#2563eb', 'End of pull': '#7c3aed', 'Still start': '#64748b', 'Still end': '#64748b' };
export const CH_COL = { tot: '#1d4ed8', plates: ['#0f766e', '#be185d', '#d97706'] };
const WIN_COL = ['#2563eb', '#be185d', '#0f766e', '#d97706', '#7c3aed', '#0891b2'];

export function defaultG() { return { points: [], windows: [] }; }

// ---------- force channels ----------
// axes: { ap: 'fx' | 'fy', fwd: 1 | -1 }. For walking and running the horizontal forces are named front-back and side to side.
export function channels(D, set, axes) {
  const n = D.n, roles = set.roles || [], gait = !!GAIT[set.type], out = [];
  const f = set.filt && set.filt.on && set.filt.fc > 0 && set.filt.fc < D.fs / 2 ? (y) => butter(y, set.filt.fc, D.fs) : (y) => y;
  const used = [];
  D.plates.forEach((p, j) => { if ((roles[j] || 'on') !== 'off') used.push(j); });
  const tot = new Float64Array(n), totRaw = new Float64Array(n);
  used.forEach((j) => { const p = D.plates[j]; for (let i = 0; i < n; i++) totRaw[i] += p.fz[i]; });
  const totF = f(totRaw); for (let i = 0; i < n; i++) tot[i] = totF[i];
  const multi = used.length > 1;
  out.push({ id: 'tot', kind: 'z', plate: -1, name: multi ? 'Total vertical force' : 'Vertical force (Fz)', short: multi ? 'Total Fz' : 'Fz', y: tot, col: CH_COL.tot });
  used.forEach((j) => {
    const p = D.plates[j], col = CH_COL.plates[j % 3];
    if (multi) out.push({ id: 'z' + j, kind: 'z', plate: j, name: p.name + ' vertical (Fz)', short: p.name + ' Fz', y: f(p.fz), col });
    const hor = [['fx', p.fx], ['fy', p.fy]];
    hor.forEach(([k, y]) => {
      if (!y) return;
      if (gait) {
        const ap = axes.ap === k, yy = Float64Array.from(f(y)); // a copy: never change the file's own data
        if (ap && axes.fwd < 0) for (let i = 0; i < n; i++) yy[i] = -yy[i];
        out.push({ id: (ap ? 'ap' : 'ml') + j, kind: ap ? 'ap' : 'ml', plate: j, name: (multi ? p.name + ' ' : '') + (ap ? 'front–back (+ forwards)' : 'side to side') + ' (' + (k === 'fx' ? 'Fx' : 'Fy') + ')', short: (multi ? p.name + ' ' : '') + (ap ? 'Front–back' : 'Side to side'), y: yy, col, dash: ap ? [7, 4] : [2, 3] });
      } else out.push({ id: k + j, kind: k, plate: j, name: (multi ? p.name + ' ' : '') + (k === 'fx' ? 'Fx' : 'Fy'), short: (multi ? p.name + ' ' : '') + (k === 'fx' ? 'Fx' : 'Fy'), y: f(y), col, dash: k === 'fx' ? [7, 4] : [2, 3] });
    });
  });
  return { list: out, tot, totRaw, used };
}

// Which horizontal force is front-back, and which way is forwards, guessed from the data (the user can change it).
// In walking and running the front-back force is the bigger one, and it brakes (points backwards) early in contact.
export function guessAxes(D) {
  const p = D.plates[0]; if (!p || !p.fx || !p.fy) return { ap: p && p.fx ? 'fx' : 'fy', fwd: 1 };
  const rng = (y) => { let a = Infinity, b = -Infinity; for (let i = 0; i < y.length; i++) { if (y[i] < a) a = y[i]; if (y[i] > b) b = y[i]; } return b - a; };
  const ap = rng(p.fy) >= rng(p.fx) ? 'fy' : 'fx', y = p[ap];
  let a = -1, b = -1; for (let i = 0; i < D.n; i++) if (p.fz[i] > 50) { if (a < 0) a = i; b = i; }
  if (a < 0 || b - a < 10) return { ap, fwd: 1 };
  const k = Math.round((b - a) * 0.3), early = mean(y, a, a + k);
  return { ap, fwd: early > 0 ? -1 : 1 };
}

// ---------- bodyweight ----------
export function bodyweight(D, set, pts, tot) {
  const still = stillWindow(pts);
  const mode = set.bwMode;
  if (mode === 'mass' && set.mass > 0) return { BW: set.mass * G, m: set.mass, source: 'the body mass you typed in' };
  if (mode === 'header' && D.headerBW > 0) return { BW: D.headerBW, m: D.headerBW / G, source: 'the body weight stored in the file' };
  if (still) { const w = mean(tot, still[0], still[1] + 1); return { BW: w, m: w / G, source: 'standing still from ' + (still[0] / D.fs).toFixed(3) + ' to ' + (still[1] / D.fs).toFixed(3) + ' s', still }; }
  if (mode !== 'mass' && D.headerBW > 0) return { BW: D.headerBW, m: D.headerBW / G, source: 'the body weight stored in the file' };
  return { BW: NaN, m: NaN, source: '' };
}
function stillWindow(pts) {
  const a = pts.find((p) => p.name === 'Still start'), b = pts.find((p) => p.name === 'Still end');
  return a && b && b.i > a.i + 2 ? [a.i, b.i] : null;
}

// ---------- windows ----------
// The windows for each type, from the points, plus any the user has added (from one point to another).
export function windows(type, pts, set, D, chs) {
  const out = [], P = pts.slice().sort((a, b) => a.i - b.i), n = D.n, fs = D.fs;
  const chFor = (pl) => (pl >= 0 && chs.list.some((c) => c.id === 'z' + pl) ? 'z' + pl : 'tot');
  if (type === 'any') {
    let k = 0;
    P.forEach((p, j) => { if (p.name !== 'Start') return; const e = P.slice(j + 1).find((q) => q.name === 'End'); const nx = P.slice(j + 1).find((q) => q.name === 'Start'); if (e) { void nx; k++; out.push({ name: 'Window ' + k, a: p, b: e, ch: 'tot', auto: true }); } });
  } else if (GAIT[type]) {
    const byPlate = {};
    P.forEach((p) => { if (p.name !== 'Foot contact') return; const pl = p.plate || 0; const e = P.find((q) => q.name === 'Toe-off' && (q.plate || 0) === pl && q.i > p.i); if (!e) return; const nx = P.find((q) => q.name === 'Foot contact' && (q.plate || 0) === pl && q.i > p.i); if (nx && nx.i < e.i) return; byPlate[pl] = (byPlate[pl] || 0) + 1; out.push({ name: 'Contact ' + (out.length + 1), plate: pl, a: p, b: e, ch: chFor(pl), auto: true, gait: true }); });
  } else if (type === 'land') {
    P.forEach((p) => { if (p.name !== 'Touchdown') return; const e = P.find((q) => q.name === 'Stable' && q.i > p.i); out.push({ name: 'Landing' + (out.length ? ' ' + (out.length + 1) : ''), a: p, b: e || { i: Math.min(n - 1, p.i + Math.round(1.0 * fs)), name: '1 s after touchdown', virtual: true }, ch: 'tot', auto: true, land: true, stable: !!e }); });
  } else if (type === 'iso') {
    P.forEach((p) => { if (p.name !== 'Onset') return; const e = P.find((q) => q.name === 'End of pull' && q.i > p.i); out.push({ name: 'Pull' + (out.length ? ' ' + (out.length + 1) : ''), a: p, b: e || { i: n - 1, name: 'end of the recording', virtual: true }, ch: 'tot', auto: true, iso: true, ended: !!e }); });
  }
  (set.g.windows || []).forEach((w) => {
    const a = pts.find((p) => p.id === w.a), b = pts.find((p) => p.id === w.b);
    if (a && b && b.i !== a.i) out.push({ name: w.name || 'My window', a: a.i < b.i ? a : b, b: a.i < b.i ? b : a, ch: chs.list.some((c) => c.id === w.ch) ? w.ch : 'tot', custom: true, id: w.id });
  });
  out.forEach((w, k) => { w.i0 = w.a.i; w.i1 = w.b.i; w.col = WIN_COL[k % WIN_COL.length]; });
  return out;
}

// Peak, minimum, mean, impulse and so on for one force between samples i0 and i1.
export function stats(y, i0, i1, fs, method) {
  const iPk = argmax(y, i0, i1 + 1), iMn = argmin(y, i0, i1 + 1), dt = 1 / fs;
  const imp = area(y, dt, i0, i1, method || 'trap');
  const dur = (i1 - i0) / fs;
  return { i0, i1, dur, peak: y[iPk], iPk, min: y[iMn], iMn, mean: dur > 0 ? imp / dur : y[i0], imp, rfd: iPk > i0 ? (y[iPk] - y[i0]) / ((iPk - i0) / fs) : NaN };
}
// Positive and negative parts of the area under y (e.g. propulsive and braking impulse).
function signedArea(y, i0, i1, fs) {
  let pos = 0, neg = 0; const dt = 1 / fs;
  for (let i = i0; i < i1; i++) { const a = (y[i] + y[i + 1]) / 2 * dt; if (a >= 0) pos += a; else neg += a; }
  return { pos, neg };
}

// ---------- the analysis ----------
export function analyseGeneric(D, set, axes) {
  const fs = D.fs, n = D.n, type = set.type, g = set.g || defaultG();
  if (!(fs > 0)) return { ok: false, error: 'The sample rate is not in the file. Enter it in Setup &rarr; Plates, columns and sample rate.' };
  const chs = channels(D, set, axes);
  const pts = (g.points || []).map((p) => Object.assign({}, p, { i: Math.max(0, Math.min(n - 1, Math.round(p.t * fs))) }));
  const bw = bodyweight(D, set, pts, chs.totRaw);
  const wins = windows(type, pts, set, D, chs);
  const R = {
    ok: true, generic: true, type, fs, n, t: D.t, ch: chs.list, F: chs.tot, Fraw: chs.totRaw, used: chs.used, filtered: !!(set.filt && set.filt.on),
    BW: bw.BW, m: bw.m, bwSource: bw.source, headerBW: D.headerBW || 0, points: pts, windows: wins, warnings: [], groups: [], plates: D.plates
  };
  R.V = genericVars(R, set, axes);
  return R;
}

// The results, as rows like the jump results: { key, name, short, group, type, value, how, key1 }.
function genericVars(R, set, axes) {
  const out = [], fs = R.fs, t = (i) => i / fs, groups = [];
  const f0 = (x) => (Number.isFinite(x) ? x.toFixed(0) : '&ndash;'), f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '&ndash;'), f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '&ndash;'), f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '&ndash;');
  const add = (o) => { if (!groups.includes(o.group)) groups.push(o.group); out.push(o); return o; };
  const ch = (id) => R.ch.find((c) => c.id === id) || R.ch[0];
  const bw = R.BW > 0;
  if (bw) add({ key: 'bw', name: 'Body weight', group: 'Body', type: 'bw', value: R.BW, how: 'From ' + R.bwSource + ': ' + f1(R.BW) + ' N. Body mass = ' + f1(R.BW) + ' &divide; 9.81 = ' + f1(R.m) + ' kg.' });
  const tile = (o, on) => { if (on) o.key1 = true; return o; };
  let nTiles = 0;
  const T = R.type;

  R.windows.forEach((w, k) => {
    const grp = w.name + (w.plate >= 0 && R.used.length > 1 ? ' (' + R.plates[w.plate].name + ')' : '') + ': ' + t(w.i0).toFixed(3) + '–' + t(w.i1).toFixed(3) + ' s';
    const y = ch(w.ch).y, s = stats(y, w.i0, w.i1, fs, set.method), nm = ch(w.ch).short;
    const kk = 'w' + k + '_';
    const firstTiles = nTiles < 8;
    if (w.gait) {
      const key = (x) => kk + x;
      add(tile({ key: key('ct'), name: 'Contact time', short: 'Contact time' + (R.windows.length > 1 ? ' (' + w.name + ')' : ''), group: grp, type: 'time', value: s.dur, how: 'Toe-off &minus; foot contact = ' + f3(t(w.i1)) + ' &minus; ' + f3(t(w.i0)) + ' = ' + f3(s.dur) + ' s.' }, firstTiles));
      const mid = Math.round((w.i0 + w.i1) / 2);
      if (T === 'walk') {
        const i1 = argmax(y, w.i0, mid + 1), i2 = argmax(y, mid, w.i1 + 1), iv = i2 > i1 ? argmin(y, i1, i2 + 1) : mid;
        add(tile({ key: key('p1'), name: 'First peak (weight acceptance)', short: 'First peak' + (R.windows.length > 1 ? ' (' + w.name + ')' : ''), group: grp, type: 'force', value: y[i1], how: 'The largest vertical force in the first half of contact: ' + f0(y[i1]) + ' N at ' + f3(t(i1)) + ' s (' + f0((i1 - w.i0) / (w.i1 - w.i0) * 100) + '% of contact).' }, firstTiles));
        add({ key: key('min'), name: 'Mid-stance minimum', group: grp, type: 'force', value: y[iv], how: 'The smallest vertical force between the two peaks: ' + f0(y[iv]) + ' N at ' + f3(t(iv)) + ' s.' });
        add(tile({ key: key('p2'), name: 'Second peak (push-off)', short: 'Second peak' + (R.windows.length > 1 ? ' (' + w.name + ')' : ''), group: grp, type: 'force', value: y[i2], how: 'The largest vertical force in the second half of contact: ' + f0(y[i2]) + ' N at ' + f3(t(i2)) + ' s (' + f0((i2 - w.i0) / (w.i1 - w.i0) * 100) + '% of contact).' }, firstTiles));
        const lr = (y[i1] - y[w.i0]) / ((i1 - w.i0) / fs);
        add({ key: key('lr'), name: 'Loading rate (contact to first peak)', group: grp, type: 'rfd', value: lr, how: '(First peak &minus; force at contact) &divide; time between them = (' + f0(y[i1]) + ' &minus; ' + f0(y[w.i0]) + ') &divide; ' + f3((i1 - w.i0) / fs) + ' = ' + f0(lr) + ' N/s.' });
      } else {
        const ia = argmax(y, w.i0, w.i1 + 1), lim = w.i0 + Math.round((w.i1 - w.i0) * 0.4);
        let ii = -1;
        for (let i = w.i0 + 2; i < Math.min(lim, ia); i++) {
          if (y[i] >= y[i - 1] && y[i] > y[i + 1]) { const after = argmin(y, i, Math.min(ia, i + Math.round(0.05 * fs)) + 1); if (y[i] - y[after] > 0.03 * y[ia]) { ii = i; break; } }
        }
        add(tile({ key: key('act'), name: 'Active peak (peak vertical force)', short: 'Active peak' + (R.windows.length > 1 ? ' (' + w.name + ')' : ''), group: grp, type: 'force', value: y[ia], how: 'The largest vertical force during contact: ' + f0(y[ia]) + ' N at ' + f3(t(ia)) + ' s.' }, firstTiles));
        add(tile({ key: key('imp'), name: 'Impact peak', short: 'Impact peak' + (R.windows.length > 1 ? ' (' + w.name + ')' : ''), group: grp, type: 'force', value: ii >= 0 ? y[ii] : NaN, how: ii >= 0 ? 'The first clear peak in the first 40% of contact (force then drops by more than 3% of the active peak before rising again): ' + f0(y[ii]) + ' N at ' + f3(t(ii)) + ' s.' : 'No clear impact peak in the first 40% of contact. This is usual for a forefoot or midfoot strike.' }, firstTiles));
        const top = ii >= 0 ? y[ii] : y[ia], i20 = crossUp(y, w.i0, ii >= 0 ? ii : ia, 0.2 * top), i80 = crossUp(y, w.i0, ii >= 0 ? ii : ia, 0.8 * top);
        const lr = i80 > i20 ? (y[i80] - y[i20]) / ((i80 - i20) / fs) : NaN;
        add(tile({ key: key('lr'), name: 'Loading rate (20&ndash;80% of the ' + (ii >= 0 ? 'impact' : 'active') + ' peak)', short: 'Loading rate' + (R.windows.length > 1 ? ' (' + w.name + ')' : ''), group: grp, type: 'rfd', value: lr, how: 'The slope from 20% to 80% of the ' + (ii >= 0 ? 'impact' : 'active') + ' peak: (' + f0(y[i80]) + ' &minus; ' + f0(y[i20]) + ') N &divide; (' + f3(t(i80)) + ' &minus; ' + f3(t(i20)) + ') s = ' + f0(lr) + ' N/s.' }, firstTiles));
      }
      add({ key: key('vimp'), name: 'Vertical impulse', group: grp, type: 'imp', value: s.imp, how: 'The area under the vertical force from foot contact to toe-off = ' + f1(s.imp) + ' N&middot;s (mean force ' + f0(s.mean) + ' N &times; ' + f3(s.dur) + ' s).' });
      const apc = R.ch.find((c) => c.kind === 'ap' && c.plate === w.plate);
      if (apc) {
        const a = apc.y, ib = argmin(a, w.i0, w.i1 + 1), ip = argmax(a, w.i0, w.i1 + 1), sa = signedArea(a, w.i0, w.i1, fs);
        add({ key: key('brk'), name: 'Peak braking force', group: grp, type: 'force', value: -a[ib], how: 'The largest backwards (negative) front&ndash;back force: ' + f0(a[ib]) + ' N at ' + f3(t(ib)) + ' s, given as a size (' + f0(-a[ib]) + ' N).' });
        add({ key: key('prp'), name: 'Peak propulsive force', group: grp, type: 'force', value: a[ip], how: 'The largest forwards (positive) front&ndash;back force: ' + f0(a[ip]) + ' N at ' + f3(t(ip)) + ' s.' });
        add({ key: key('bimp'), name: 'Braking impulse', group: grp, type: 'imp', value: -sa.neg, how: 'The area of the negative (backwards) part of the front&ndash;back force = ' + f2(sa.neg) + ' N&middot;s, given as a size.' });
        add({ key: key('pimp'), name: 'Propulsive impulse', group: grp, type: 'imp', value: sa.pos, how: 'The area of the positive (forwards) part of the front&ndash;back force = ' + f2(sa.pos) + ' N&middot;s.' });
        add({ key: key('nimp'), name: 'Net front&ndash;back impulse', group: grp, type: 'imp', value: sa.pos + sa.neg, how: 'Propulsive + braking = ' + f2(sa.pos) + ' + (' + f2(sa.neg) + ') = ' + f2(sa.pos + sa.neg) + ' N&middot;s. Positive means the participant left the plate going slightly faster.' });
      }
      if (firstTiles) nTiles += T === 'walk' ? 3 : 4;
    } else if (w.land) {
      const pk = s.iPk, tp = (pk - w.i0) / fs, lr = tp > 0 ? (y[pk] - y[w.i0]) / tp : NaN;
      add(tile({ key: kk + 'pk', name: 'Peak landing force', short: 'Peak landing force', group: grp, type: 'force', value: y[pk], how: 'The largest vertical force after touchdown: ' + f0(y[pk]) + ' N at ' + f3(t(pk)) + ' s.' + (bw ? ' That is ' + f2(y[pk] / R.BW) + ' &times; bodyweight.' : '') }, k === 0));
      add(tile({ key: kk + 'tp', name: 'Time to peak landing force', short: 'Time to peak', group: grp, type: 'time', value: tp, how: f3(t(pk)) + ' &minus; ' + f3(t(w.i0)) + ' = ' + f3(tp) + ' s.' }, k === 0));
      add(tile({ key: kk + 'lr', name: 'Loading rate (touchdown to peak)', short: 'Loading rate', group: grp, type: 'rfd', value: lr, how: '(Peak &minus; force at touchdown) &divide; time to peak = (' + f0(y[pk]) + ' &minus; ' + f0(y[w.i0]) + ') &divide; ' + f3(tp) + ' = ' + f0(lr) + ' N/s.' }, k === 0));
      const i100 = Math.min(w.i1, w.i0 + Math.round(0.1 * fs));
      add({ key: kk + 'imp100', name: 'Impulse in the first 100 ms', group: grp, type: 'imp', value: area(y, 1 / fs, w.i0, i100, set.method), how: 'The area under the force from touchdown to 100 ms later = ' + f1(area(y, 1 / fs, w.i0, i100, set.method)) + ' N&middot;s.' });
      if (w.stable) {
        add(tile({ key: kk + 'tts', name: 'Time to stabilise', short: 'Time to stabilise', group: grp, type: 'time', value: s.dur, how: 'Stable &minus; touchdown = ' + f3(t(w.i1)) + ' &minus; ' + f3(t(w.i0)) + ' = ' + f3(s.dur) + ' s (the point you marked as stable).' }, k === 0));
        add({ key: kk + 'mean', name: 'Mean force (touchdown to stable)', group: grp, type: 'force', value: s.mean, how: 'Impulse &divide; time = ' + f1(s.imp) + ' &divide; ' + f3(s.dur) + ' = ' + f0(s.mean) + ' N.' });
        if (bw) { const net = s.imp - R.BW * s.dur; add({ key: kk + 'nimp', name: 'Net impulse (touchdown to stable)', group: grp, type: 'imp', value: net, how: 'Impulse &minus; bodyweight &times; time = ' + f1(s.imp) + ' &minus; ' + f0(R.BW) + ' &times; ' + f3(s.dur) + ' = ' + f1(net) + ' N&middot;s. It equals body mass &times; the downward velocity at touchdown that the landing took away.' }); }
      }
    } else if (w.iso) {
      const on = w.i0, end = w.i1;
      const pre0 = Math.max(0, on - Math.round(1.0 * fs)), still = R.points.some((p) => p.name === 'Still start') && R.points.some((p) => p.name === 'Still end');
      let base = still && bw ? R.BW : (on - pre0 >= Math.round(0.1 * fs) ? mean(y, pre0, on) : y[on]);
      const baseHow = still && bw ? 'the still period you marked' : (on - pre0 >= Math.round(0.1 * fs) ? 'the mean force in the ' + f3((on - pre0) / fs) + ' s before onset' : 'the force at onset');
      add({ key: kk + 'base', name: 'Baseline force (before the pull)', group: grp, type: 'force', value: base, how: 'From ' + baseHow + ': ' + f0(base) + ' N. For a pull on a bar this is the weight of the participant (and anything else on the plate).' });
      add(tile({ key: kk + 'pk', name: 'Peak force', short: 'Peak force', group: grp, type: 'force', value: s.peak, how: 'The largest force from onset to ' + (w.ended ? 'the end of the pull' : 'the end of the recording') + ': ' + f0(s.peak) + ' N at ' + f3(t(s.iPk)) + ' s.' }, k === 0));
      add(tile({ key: kk + 'npk', name: 'Net peak force', short: 'Net peak force', group: grp, type: 'force', value: s.peak - base, how: 'Peak force &minus; baseline = ' + f0(s.peak) + ' &minus; ' + f0(base) + ' = ' + f0(s.peak - base) + ' N.' }, k === 0));
      add(tile({ key: kk + 'tpk', name: 'Time to peak force', short: 'Time to peak', group: grp, type: 'time', value: (s.iPk - on) / fs, how: f3(t(s.iPk)) + ' &minus; ' + f3(t(on)) + ' = ' + f3((s.iPk - on) / fs) + ' s.' }, k === 0));
      if (w.ended) add({ key: kk + 'mean', name: 'Mean force (onset to end of pull)', group: grp, type: 'force', value: s.mean, how: 'Impulse &divide; time = ' + f1(s.imp) + ' &divide; ' + f3(s.dur) + ' = ' + f0(s.mean) + ' N.' });
      const g2 = w.name + ': force and rate of force development at set times', g3 = w.name + ': impulse';
      [50, 100, 150, 200, 250].forEach((ms) => {
        const j = on + Math.round(ms / 1000 * fs); if (j > end) return;
        add({ key: kk + 'f' + ms, name: 'Net force at ' + ms + ' ms', group: g2, type: 'force', value: y[j] - base, how: 'Force ' + ms + ' ms after onset &minus; baseline = ' + f0(y[j]) + ' &minus; ' + f0(base) + ' = ' + f0(y[j] - base) + ' N.' });
      });
      [50, 100, 150, 200, 250].forEach((ms) => {
        const j = on + Math.round(ms / 1000 * fs); if (j > end) return;
        const r = (y[j] - y[on]) / (ms / 1000);
        add(tile({ key: kk + 'rfd' + ms, name: 'RFD 0&ndash;' + ms + ' ms', short: 'RFD 0–' + ms + ' ms', group: g2, type: 'rfd', value: r, how: '(Force at ' + ms + ' ms &minus; force at onset) &divide; ' + (ms / 1000) + ' s = (' + f0(y[j]) + ' &minus; ' + f0(y[on]) + ') &divide; ' + (ms / 1000) + ' = ' + f0(r) + ' N/s.' }, k === 0 && (ms === 100 || ms === 200)));
      });
      const L = Math.max(1, Math.round(0.02 * fs)); let best = -Infinity, bi = on;
      for (let i = on; i + L <= Math.min(end, s.iPk + L); i++) { const r = (y[i + L] - y[i]) / (L / fs); if (r > best) { best = r; bi = i; } }
      add({ key: kk + 'prfd', name: 'Peak RFD (steepest 20 ms)', group: g2, type: 'rfd', value: best, how: 'The steepest rise over any 20 ms between onset and peak force: from ' + f3(t(bi)) + ' to ' + f3(t(bi + L)) + ' s, (' + f0(y[bi + L]) + ' &minus; ' + f0(y[bi]) + ') &divide; ' + (L / fs).toFixed(3) + ' = ' + f0(best) + ' N/s.' });
      [100, 200, 300].forEach((ms) => {
        const j = on + Math.round(ms / 1000 * fs); if (j > end) return;
        const imp = area(y, 1 / fs, on, j, set.method) - base * (j - on) / fs;
        add({ key: kk + 'imp' + ms, name: 'Net impulse 0&ndash;' + ms + ' ms', group: g3, type: 'imp', value: imp, how: 'The area between the force and the baseline from onset to ' + ms + ' ms = ' + f1(imp) + ' N&middot;s.' });
      });
    }
    if (!w.gait && !w.land && !w.iso) {
      // any window (and every window the user added)
      const lbl = (x) => x + ' (' + nm + ')';
      add(tile({ key: kk + 'dur', name: 'Duration', short: 'Duration' + (k ? ' (' + w.name + ')' : ''), group: grp, type: 'time', value: s.dur, how: f3(t(w.i1)) + ' &minus; ' + f3(t(w.i0)) + ' = ' + f3(s.dur) + ' s.' }, k === 0 && T === 'any'));
      add(tile({ key: kk + 'pk', name: lbl('Peak force'), short: 'Peak' + (k ? ' (' + w.name + ')' : ''), group: grp, type: 'force', value: s.peak, how: 'The largest value of ' + esc2(ch(w.ch).name) + ' in the window: ' + f1(s.peak) + ' N at ' + f3(t(s.iPk)) + ' s.' }, k === 0 && T === 'any'));
      add({ key: kk + 'tpk', name: 'Time of peak (from the start of the window)', group: grp, type: 'time', value: (s.iPk - w.i0) / fs, how: f3(t(s.iPk)) + ' &minus; ' + f3(t(w.i0)) + ' = ' + f3((s.iPk - w.i0) / fs) + ' s.' });
      add({ key: kk + 'min', name: lbl('Minimum force'), group: grp, type: 'force', value: s.min, how: 'The smallest value in the window: ' + f1(s.min) + ' N at ' + f3(t(s.iMn)) + ' s.' });
      add(tile({ key: kk + 'mean', name: lbl('Mean force'), short: 'Mean' + (k ? ' (' + w.name + ')' : ''), group: grp, type: 'force', value: s.mean, how: 'Impulse &divide; duration = ' + f2(s.imp) + ' &divide; ' + f3(s.dur) + ' = ' + f1(s.mean) + ' N (the average height of the curve).' }, k === 0 && T === 'any'));
      add(tile({ key: kk + 'imp', name: lbl('Impulse'), short: 'Impulse' + (k ? ' (' + w.name + ')' : ''), group: grp, type: 'imp', value: s.imp, how: 'The area under the force in the window (trapezoid rule) = ' + f2(s.imp) + ' N&middot;s.' }, k === 0 && T === 'any'));
      if (bw && ch(w.ch).kind === 'z') { const net = s.imp - R.BW * s.dur; add({ key: kk + 'nimp', name: 'Net impulse (above bodyweight)', group: grp, type: 'imp', value: net, how: 'Impulse &minus; bodyweight &times; duration = ' + f2(s.imp) + ' &minus; ' + f0(R.BW) + ' &times; ' + f3(s.dur) + ' = ' + f2(net) + ' N&middot;s.' }); }
      add({ key: kk + 'rfd', name: 'Mean rate of force development (start to peak)', group: grp, type: 'rfd', value: s.rfd, how: '(Peak &minus; force at the start) &divide; time to peak = (' + f1(s.peak) + ' &minus; ' + f1(y[w.i0]) + ') &divide; ' + f3((s.iPk - w.i0) / fs) + ' = ' + f0(s.rfd) + ' N/s.' });
    }
  });

  // running: flight time and step time
  if (T === 'run') {
    const C = R.windows.filter((w) => w.gait).sort((a, b) => a.i0 - b.i0);
    for (let k = 0; k + 1 < C.length; k++) {
      const ft = (C[k + 1].i0 - C[k].i1) / fs, st = (C[k + 1].i0 - C[k].i0) / fs, grp = 'Steps';
      add({ key: 'ft' + k, name: 'Flight time (' + C[k].name + ' to ' + C[k + 1].name + ')', group: grp, type: 'time', value: ft, how: 'Next foot contact &minus; toe-off = ' + f3(t(C[k + 1].i0)) + ' &minus; ' + f3(t(C[k].i1)) + ' = ' + f3(ft) + ' s.' + (ft < 0 ? ' It is negative because the two contacts overlap (both feet down), which happens in walking, not running.' : '') });
      add({ key: 'st' + k, name: 'Step time (' + C[k].name + ' to ' + C[k + 1].name + ')', group: grp, type: 'time', value: st, how: 'Foot contact to the next foot contact = ' + f3(st) + ' s. Step frequency = 1 &divide; ' + f3(st) + ' = ' + f2(1 / st) + ' steps/s.' });
    }
  }
  // walking with both feet down: double support
  if (T === 'walk') {
    const C = R.windows.filter((w) => w.gait).sort((a, b) => a.i0 - b.i0);
    for (let k = 0; k + 1 < C.length; k++) if (C[k + 1].plate !== C[k].plate && C[k + 1].i0 < C[k].i1) add({ key: 'ds' + k, name: 'Double support (' + C[k].name + ' and ' + C[k + 1].name + ')', group: 'Both feet', type: 'time', value: (C[k].i1 - C[k + 1].i0) / fs, how: 'Both feet are down from the second foot contact (' + f3(t(C[k + 1].i0)) + ' s) to the first toe-off (' + f3(t(C[k].i1)) + ' s) = ' + f3((C[k].i1 - C[k + 1].i0) / fs) + ' s.' });
  }
  R.groups = groups;
  return out;
}
function crossUp(y, i0, i1, v) { for (let i = i0; i <= i1; i++) if (y[i] >= v) return i; return -1; }
function esc2(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// A simple guess at what a file is, from its description and its shape.
export function guessType(P, D, jumpOk) {
  const d = ((P.meta && P.meta.description) || '') + ' ' + (P.fileName || '');
  if (/walk|gait/i.test(d)) return 'walk';
  if (/run|sprint/i.test(d)) return 'run';
  if (/imtp|isometric|mid.?thigh|iso/i.test(d)) return 'iso';
  if (/land/i.test(d)) return 'land';
  if (/cmj|counter|squat jump|\bsj\b|drop|\bdj\b|jump/i.test(d)) return 'jump';
  return jumpOk ? 'jump' : 'any';
}
