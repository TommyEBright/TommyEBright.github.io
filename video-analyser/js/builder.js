// Export builder: the user picks the variables (markers, angles, linear and angular kinematics) and
// whether they want them as continuous data (over time and/or time-normalised) and/or discrete values
// (maximum, minimum, time of each, range, mean, values at events). Names follow Robertson et al. (2014).
import { A, $, esc, fx, status, persist, tReal, download, baseName, defaultExp, APP, VERSION, withState, points, angleDefs, eventTypes } from './state.js?v=2.1.0';
import { LIN, ANG, allVariables } from './vars.js?v=2.1.0';
import { normalise, eventNames } from './normalise.js?v=2.1.0';
import { eventStats, intervalRows } from './events.js?v=2.1.0';
import { meta } from './export.js?v=2.1.0';

export const STATS = [
  { k: 'max', name: 'maximum' }, { k: 'min', name: 'minimum' },
  { k: 'tmax', name: 'time of maximum' }, { k: 'tmin', name: 'time of minimum' },
  { k: 'range', name: 'range' }, { k: 'mean', name: 'mean' }, { k: 'events', name: 'value at each event' }
];
const LIN_LAB = { x: 'x position', y: 'y position', vx: 'x velocity', vy: 'y velocity', v: 'resultant velocity', ax: 'x acceleration', ay: 'y acceleration', a: 'resultant acceleration' };
const ANG_LAB = { th: 'angular position (the angle)', w: 'angular velocity', al: 'angular acceleration' };

const q = (s) => { s = String(s === null || s === undefined ? '' : s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const slug = (s) => String(s).trim().replace(/°/g, 'deg').replace(/²/g, '2').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '');
const csv = (lines) => new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
const dp = (unit) => (unit === 's' ? 4 : /rad/.test(unit) ? 4 : /°/.test(unit) ? 2 : unit === 'px' || unit === 'px/s' ? 2 : 5);

function E() { const S = A.S; S.exp = Object.assign(defaultExp(), S.exp || {}); return S.exp; }
// The selection as options for allVariables (null = every marker / angle).
export function selection(e) {
  e = e || E();
  return { markers: e.markers, angles: e.angles, lin: e.lin, ang: e.ang, rad: e.angUnit === 'rad' };
}
function t0Of(S, e) { if (!e.t0) return 0; const ev = S.events.find((x) => x.name === e.t0); return ev ? tReal(ev.frame) : 0; }
function nearest(F, f) { let b = -1, d = 1e9; F.forEach((x, i) => { if (Math.abs(x - f) < d) { d = Math.abs(x - f); b = i; } }); return d <= 2 * Math.max(1, A.S.every) ? b : -1; }
function eventLabels(S) {
  const ev = S.events.slice().sort((a, b) => a.frame - b.frame), cnt = {}, k = {};
  ev.forEach((e) => { cnt[e.name] = (cnt[e.name] || 0) + 1; });
  return ev.map((e) => { k[e.name] = (k[e.name] || 0) + 1; return { e, name: cnt[e.name] > 1 ? e.name + ' ' + k[e.name] : e.name }; });
}

// Discrete values for one trial (A.S must be that trial). Rows: { variable, stat, value, unit }.
export function discreteRows(R, e) {
  const S = A.S, out = [], t0 = t0Of(S, e), st = new Set(e.stats);
  if (R) allVariables(R, selection(e)).forEach((v) => {
    const [T, F, V] = v.get(); let iMax = -1, iMin = -1, sum = 0, n = 0;
    V.forEach((x, i) => { if (x === null || x === undefined || Number.isNaN(x)) return; if (iMax < 0 || x > V[iMax]) iMax = i; if (iMin < 0 || x < V[iMin]) iMin = i; sum += x; n++; });
    if (!n) return;
    if (st.has('max')) out.push({ variable: v.label, stat: 'maximum', value: V[iMax], unit: v.unit });
    if (st.has('tmax')) out.push({ variable: v.label, stat: 'time of maximum', value: T[iMax] - t0, unit: 's' });
    if (st.has('min')) out.push({ variable: v.label, stat: 'minimum', value: V[iMin], unit: v.unit });
    if (st.has('tmin')) out.push({ variable: v.label, stat: 'time of minimum', value: T[iMin] - t0, unit: 's' });
    if (st.has('range')) out.push({ variable: v.label, stat: 'range', value: V[iMax] - V[iMin], unit: v.unit });
    if (st.has('mean')) out.push({ variable: v.label, stat: 'mean', value: sum / n, unit: v.unit });
    if (st.has('events')) eventLabels(S).forEach(({ e: ev, name }) => { const i = nearest(F, ev.frame); if (i >= 0 && V[i] !== null && V[i] !== undefined) out.push({ variable: v.label, stat: 'at ' + name, value: V[i], unit: v.unit }); });
  });
  if (e.timing) {
    eventLabels(S).forEach(({ e: ev, name }) => out.push({ variable: name, stat: 'time of event', value: tReal(ev.frame) - t0, unit: 's' }));
    intervalRows().forEach((iv) => out.push({ variable: iv.label, stat: 'duration', value: iv.t, unit: 's' }));
  }
  if (e.key) eventStats().forEach((r) => { if (typeof r[3] === 'number' && Number.isFinite(r[3])) out.push({ variable: r[0], stat: 'result', value: r[3], unit: r[4] || '' }); });
  return out;
}

// ---------- per-trial downloads ----------
function header(extra) { return meta().map((r) => '# ' + r.map(q).join(',')).concat(extra.map((x) => '# ' + q(x))); }
function axesNote() { return 'x = horizontal (+ ' + (A.S.dir === 'none' ? 'to the right' : 'forwards') + '), y = vertical (+ up), resultant = magnitude of x and y. Angles: positive anticlockwise for segment (absolute) angles.'; }

function continuousCSV(R, e) {
  const vars = allVariables(R, selection(e)); if (!vars.length) return null;
  const S = A.S, t0 = t0Of(S, e), allF = new Set(); vars.forEach((v) => v.get()[1].forEach((f) => allF.add(f)));
  const F = [...allF].sort((a, b) => a - b), idx = vars.map((v) => new Map(v.get()[1].map((f, i) => [f, i])));
  const mk = [...new Set(vars.filter((v) => v.m).map((v) => v.m))], midx = mk.map((m) => new Map(R.sers[m].F.map((f, i) => [f, i])));
  const lines = header(['Continuous data (filtered) over time. ' + axesNote()]);
  if (e.layout === 'long') {
    lines.push(['frame', 'time_s'].concat(e.t0 ? ['time_from_' + slug(e.t0) + '_s'] : []).concat(['variable', 'unit', 'value', 'gap_filled']).join(','));
    vars.forEach((v, k) => { const [, , V] = v.get(); const mi = v.m ? mk.indexOf(v.m) : -1; idx[k].forEach((i, f) => { if (V[i] === null || V[i] === undefined) return; const fill = mi >= 0 ? (R.sers[v.m].filled[midx[mi].get(f)] ? 1 : 0) : ''; lines.push([f, fx(tReal(f), 4)].concat(e.t0 ? [fx(tReal(f) - t0, 4)] : []).concat([q(v.label), q(v.unit), fx(V[i], dp(v.unit)), fill]).join(',')); }); });
  } else {
    lines.push(['frame', 'time_s'].concat(e.t0 ? ['time_from_' + slug(e.t0) + '_s'] : []).concat(vars.map((v) => slug(v.label) + '_' + slug(v.unit))).concat(mk.map((m) => slug(m) + '_gap_filled')).join(','));
    F.forEach((f) => {
      const r = [f, fx(tReal(f), 4)]; if (e.t0) r.push(fx(tReal(f) - t0, 4));
      vars.forEach((v, k) => { const i = idx[k].get(f), V = v.get()[2]; r.push(i === undefined ? '' : fx(V[i], dp(v.unit))); });
      mk.forEach((m, k) => { const i = midx[k].get(f); r.push(i === undefined ? '' : (R.sers[m].filled[i] ? 1 : 0)); });
      lines.push(r.join(','));
    });
  }
  return { lines, n: vars.length };
}
function normCSV(R, e) {
  const S = A.S, N = S.norm; if (!N.start || !N.end) return { err: 'Choose the phase for time normalisation in Results first.' };
  const res = normalise(R, S, N.start, N.end, N.n, selection(e)), keys = Object.keys(res.vars);
  if (!res.cycles.length || !keys.length) return { err: 'No ' + N.start + ' → ' + N.end + ' phases with data were found for time normalisation.' };
  const lines = header(['Time-normalised from ' + N.start + ' to ' + N.end + ' (0-100%, ' + res.pct.length + ' points). Ensemble average = mean of the phases point by point. ' + axesNote(),
    'Phases (start frame, end frame, duration s): ' + res.cycles.map((c, i) => (i + 1) + ': ' + c.a + '-' + c.b + ' (' + c.dur.toFixed(4) + ')').join('; ')]);
  if (e.layout === 'long') {
    lines.push('variable,unit,phase,percent,value');
    keys.forEach((k) => { const v = res.vars[k]; v.curves.forEach((c, i) => { if (c) res.pct.forEach((p, j) => lines.push([q(v.label), q(v.unit), i + 1, p.toFixed(2), fx(c[j], dp(v.unit))].join(','))); }); if (v.mean) res.pct.forEach((p, j) => { lines.push([q(v.label), q(v.unit), 'mean', p.toFixed(2), fx(v.mean[j], dp(v.unit))].join(',')); lines.push([q(v.label), q(v.unit), 'sd', p.toFixed(2), fx(v.sd[j], dp(v.unit))].join(',')); }); });
  } else {
    const head = ['percent'];
    keys.forEach((k) => { const v = res.vars[k], c = slug(v.label) + '_' + slug(v.unit); v.curves.forEach((cv, i) => head.push(c + '_phase' + (i + 1))); head.push(c + '_mean', c + '_sd'); });
    lines.push(head.join(','));
    res.pct.forEach((p, j) => { const r = [p.toFixed(2)]; keys.forEach((k) => { const v = res.vars[k]; v.curves.forEach((cv) => r.push(cv ? fx(cv[j], dp(v.unit)) : '')); r.push(v.mean ? fx(v.mean[j], dp(v.unit)) : '', v.sd ? fx(v.sd[j], dp(v.unit)) : ''); }); lines.push(r.join(',')); });
  }
  return { lines, n: keys.length };
}
function discreteCSV(R, e) {
  const rows = discreteRows(R, e); if (!rows.length) return null;
  const lines = header(['Discrete values (from filtered data). Times are in seconds from ' + (e.t0 ? 'the first ' + e.t0 : 'the start of the video') + '. ' + axesNote()]);
  if (e.layout === 'long') { lines.push('variable,statistic,value,unit'); rows.forEach((r) => lines.push([q(r.variable), q(r.stat), fx(r.value, dp(r.unit)), q(r.unit)].join(','))); }
  else { lines.push(rows.map((r) => q(r.variable + ' ' + r.stat + (r.unit ? ' (' + r.unit + ')' : ''))).join(',')); lines.push(rows.map((r) => fx(r.value, dp(r.unit))).join(',')); }
  return { lines, n: rows.length };
}

export async function downloadSelected() {
  const e = E(); if (!A.results) A.fn.compute(); const R = A.results;
  const wantDisc = e.disc && (e.stats.length || e.timing || e.key), wantTime = e.cont === 'time' || e.cont === 'both', wantNorm = e.cont === 'norm' || e.cont === 'both';
  if (!wantDisc && e.cont === 'off') { status('Choose continuous data, discrete values, or both.'); return; }
  if (!R && (wantTime || wantNorm || e.stats.length)) { if (!wantDisc) { status('Nothing to export yet. Digitise some frames first.'); return; } }
  const files = [], notes = [];
  if (wantTime && R) { const c = continuousCSV(R, e); if (c) files.push([baseName() + '_continuous.csv', c.lines, c.n + ' continuous variables']); else notes.push('no continuous variables match your choices'); }
  if (wantNorm && R) { const c = normCSV(R, e); if (c.err) notes.push(c.err); else files.push([baseName() + '_time_normalised.csv', c.lines, c.n + ' time-normalised variables']); }
  if (wantDisc) { const c = discreteCSV(R, e); if (c) files.push([baseName() + '_discrete.csv', c.lines, c.n + ' discrete values']); else notes.push('no discrete values match your choices'); }
  for (let i = 0; i < files.length; i++) { download(files[i][0], csv(files[i][1])); if (i < files.length - 1) await new Promise((r) => setTimeout(r, 400)); }
  status(files.length ? 'Downloaded ' + files.map((f) => '<strong>' + esc(f[0]) + '</strong> (' + f[2] + ')').join(' and ') + '.' + (notes.length ? ' Note: ' + esc(notes.join('; ')) + '.' : '') : 'Nothing was exported: ' + esc(notes.join('; ')) + '.');
}

// ---------- the whole session, using these choices ----------
// data: [{ t, R }] for every trial.
export function sessionDiscreteCSV(data, wide) {
  const e = E(), per = data.map((d) => ({ t: d.t, rows: withState(d.t.state, () => discreteRows(d.R, e)) })).filter((d) => d.rows.length);
  if (!per.length) return null;
  const lines = ['# ' + APP + ' v' + VERSION + ' | session discrete values (your export choices) | ' + new Date().toISOString()];
  if (wide) {
    const cols = []; const seen = new Set();
    per.forEach((d) => d.rows.forEach((r) => { const k = r.variable + ' ' + r.stat + (r.unit ? ' (' + r.unit + ')' : ''); if (!seen.has(k)) { seen.add(k); cols.push(k); } }));
    lines.push(['participant', 'condition', 'trial', 'video'].concat(cols).map(q).join(','));
    per.forEach((d) => { const m = new Map(d.rows.map((r) => [r.variable + ' ' + r.stat + (r.unit ? ' (' + r.unit + ')' : ''), fx(r.value, dp(r.unit))])); lines.push([d.t.labels.athlete, d.t.labels.condition, d.t.labels.trial, d.t.name].map(q).concat(cols.map((c) => m.get(c) || '')).join(',')); });
  } else {
    lines.push('participant,condition,trial,video,variable,statistic,value,unit');
    per.forEach((d) => d.rows.forEach((r) => lines.push([d.t.labels.athlete, d.t.labels.condition, d.t.labels.trial, d.t.name, r.variable, r.stat].map(q).concat([fx(r.value, dp(r.unit)), q(r.unit)]).join(','))));
  }
  return { blob: csv(lines), n: per.length };
}

// ---------- the panel ----------
function chk(group, val, on, text) { return '<label class="inline"><input type="checkbox" data-g="' + group + '" value="' + esc(val) + '"' + (on ? ' checked' : '') + '> ' + text + '</label>'; }
export function renderBuilder() {
  const box = $('expBuilder'); if (!box) return;
  const e = E(), S = A.S, pts = points(), angs = angleDefs().filter((d) => d.on).map((d) => d.name), evs = [...new Set(eventNames().concat(eventTypes()))];
  const inM = (m) => !e.markers || e.markers.includes(m), inA = (a) => !e.angles || e.angles.includes(a);
  $('xbMarkers').innerHTML = pts.length ? pts.map((m) => chk('markers', m, inM(m), esc(m))).join('') : '<span class="muted">No markers yet.</span>';
  $('xbAngles').innerHTML = angs.length ? angs.map((a) => chk('angles', a, inA(a), esc(a))).join('') : '<span class="muted">No angles in use (build them in the Markers tab).</span>';
  $('xbLin').innerHTML = LIN.map((d) => chk('lin', d.k, e.lin.includes(d.k), LIN_LAB[d.k])).join('');
  $('xbAng').innerHTML = ANG.map((d) => chk('ang', d.k, e.ang.includes(d.k), ANG_LAB[d.k])).join('');
  $('xbStats').innerHTML = STATS.map((d) => chk('stats', d.k, e.stats.includes(d.k), d.name)).join('') + chk('timing', '1', e.timing, 'event times and stopwatch durations') + chk('key', '1', e.key, 'activity results (e.g. contact time, jump height, cycle time)');
  $('xbCont').value = e.cont; $('xbDisc').checked = !!e.disc; $('xbLayout').value = e.layout; $('xbAngUnit').value = e.angUnit;
  $('xbT0').innerHTML = '<option value="">the start of the video</option>' + evs.map((n) => '<option value="' + esc(n) + '"' + (n === e.t0 ? ' selected' : '') + '>the first ' + esc(n) + '</option>').join('');
  $('xbT0').value = evs.includes(e.t0) ? e.t0 : '';
  box.querySelectorAll('[data-g]').forEach((c) => c.addEventListener('change', () => { readBuilder(); }));
  countBuilder();
}
function readBuilder() {
  const e = E(), box = $('expBuilder'), vals = (g) => [...box.querySelectorAll('[data-g="' + g + '"]:checked')].map((c) => c.value), all = (g) => [...box.querySelectorAll('[data-g="' + g + '"]')].map((c) => c.value);
  const m = vals('markers'), a = vals('angles');
  e.markers = m.length === all('markers').length ? null : m; e.angles = a.length === all('angles').length ? null : a;
  e.lin = vals('lin'); e.ang = vals('ang'); e.stats = vals('stats'); e.timing = vals('timing').length > 0; e.key = vals('key').length > 0;
  e.cont = $('xbCont').value; e.disc = $('xbDisc').checked; e.layout = $('xbLayout').value; e.angUnit = $('xbAngUnit').value; e.t0 = $('xbT0').value;
  persist(); countBuilder();
}
function countBuilder() {
  const e = E(), nm = (e.markers ? e.markers.filter((m) => points().includes(m)).length : points().length), na = (e.angles ? e.angles.length : angleDefs().filter((d) => d.on).length);
  const nv = nm * e.lin.length + na * e.ang.length, bits = [];
  if (e.cont !== 'off') bits.push(nv + ' continuous variable' + (nv === 1 ? '' : 's') + (e.cont === 'both' ? ' (over time and time-normalised)' : e.cont === 'norm' ? ' (time-normalised)' : ' (over time)'));
  if (e.disc) bits.push('about ' + (nv * e.stats.filter((s) => s !== 'events').length) + ' discrete values' + (e.stats.includes('events') ? ' plus values at each event' : ''));
  $('xbCount').textContent = bits.length ? 'You will get ' + bits.join(', and ') + '.' : 'Nothing chosen yet.';
}
function setAll(on) {
  const e = E();
  if (on) { Object.assign(e, { markers: null, angles: null, lin: LIN.map((d) => d.k), ang: ANG.map((d) => d.k), stats: STATS.map((d) => d.k), timing: true, key: true, disc: true, cont: e.cont === 'off' ? 'time' : e.cont }); }
  else Object.assign(e, { lin: [], ang: [], stats: [], timing: false, key: false });
  persist(); renderBuilder();
}
export function initBuilder() {
  ['xbCont', 'xbDisc', 'xbLayout', 'xbAngUnit', 'xbT0'].forEach((id) => $(id).addEventListener('change', readBuilder));
  $('xbGo').addEventListener('click', downloadSelected);
  $('xbAll').addEventListener('click', () => setAll(true));
  $('xbNone').addEventListener('click', () => setAll(false));
  A.fn.renderBuilder = renderBuilder;
  window.__KVA_builder = { discreteRows, downloadSelected, selection };
}
