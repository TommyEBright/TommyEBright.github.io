// Export: data for this trial (CSV), images (PNG) and the project file (the whole session).
import { A, $, esc, status, muscle, toCsv, download, baseName, persist, SET } from './state.js?v=1.3.0';
import { analyse } from './emg.js?v=1.3.0';
import { moveSignal } from './events.js?v=1.3.0';
import { canvasToBlob } from './plot.js?v=1.3.0';
import { snapshot } from './trace.js?v=1.3.0';
import { resultRows, compute, wfSnapshot } from './results.js?v=1.3.0';
import { barSnapshot } from './compare.js?v=1.3.0';
import { pointLabel, forget } from './emg.js?v=1.3.0';

function need() { if (!A.R || !A.R.ok) { status('Open a file first.'); return false; } return true; }
const csv = (name, rows) => download(baseName() + '_' + name + '.csv', new Blob([toCsv(rows)], { type: 'text/csv' }));

// Discrete data: one row for each rep (and each phase of it, and each window of your own) and muscle, with every
// number worked out in that window side by side. Onset, offset and burst duration belong to the whole rep.
const RMS = (y, a, b) => { let q = 0; for (let i = a; i <= b; i++) q += y[i] * y[i]; return Math.sqrt(q / Math.max(1, b - a + 1)); };
export function discreteRows(R, labels) {
  const L = labels || R.t.labels || {}, chs = R.pr.ch, f = (v, n) => (Number.isFinite(v) ? v.toFixed(n) : '');
  const rows = [['participant', 'exercise', 'trial', 'file', 'rep', 'phase', 'muscle', 'start_s', 'end_s', 'duration_s', 'peak', 'mean', 'unit', 'rms_uV', 'iEMG', 'time_to_peak_s', 'time_to_peak_pct', 'onset_s', 'onset_pct', 'offset_s', 'offset_pct', 'burst_duration_s', 'onset_method']];
  const wins = R.reps.length ? [].concat(...R.reps.map((r) => [r].concat(R.phases.filter((p) => p.rep === r.rep))), R.own) : R.whole.concat(R.own);
  wins.forEach((w) => {
    const st = R.stats(w), bu = w.kind === 'rep' || w.kind === 'whole' ? R.bursts.find((b) => b.w === w) : null;
    st.forEach((s, k) => {
      const c = chs[k], p = bu ? bu.per[k] : null, u = s.normed ? R.ni.unit : 'µV';
      rows.push([L.athlete || '', L.condition || '', L.trial || '', R.t.name, w.kind === 'rep' ? w.rep + 1 : w.kind === 'phase' ? w.rep + 1 : w.name, w.kind === 'phase' ? w.phaseName : w.kind === 'rep' ? 'whole' : '', muscle(c.key).short,
        f(w.i0 / R.fs, 4), f(w.i1 / R.fs, 4), f(s.dur, 4), f(s.peak, 3), f(s.mean, 3), u, f(RMS(c.bp, w.i0, Math.min(w.i1, c.n - 1)) * 1e6, 2), f(s.iemg, 4), f(s.tPeak, 4), f(s.pPeak, 1),
        p ? f(p.on, 4) : '', p ? f(p.onP, 1) : '', p ? f(p.off, 4) : '', p ? f(p.offP, 1) : '', p ? f(p.dur, 4) : '', p && Number.isFinite(p.on) ? (p.auto ? 'automatic' : 'by hand') : '']);
    });
  });
  return rows;
}
function sessionDiscrete() {
  const rows = [];
  A.session.trials.forEach((t) => { if (t.role === 'mvic') return; let R; try { R = analyse(t); } catch (e) { return; } if (!R.ok) return; const r = discreteRows(R, t.labels); rows.push(...(rows.length ? r.slice(1) : r)); });
  if (rows.length < 2) { status('No task trials to export yet.'); return; }
  download('emg_session_discrete.csv', new Blob([toCsv(rows)], { type: 'text/csv' }));
}

function continuous() {
  const R = A.R, chs = R.pr.ch;
  // which rep and phase every sample is in, and the movement signal (held at its last value between its samples)
  const repOf = new Int32Array(R.n), phOf = new Int32Array(R.n).fill(-1), sig = moveSignal(R.pr);
  R.reps.forEach((r) => { for (let i = r.i0; i <= Math.min(r.i1, R.n - 1); i++) repOf[i] = r.rep + 1; });
  R.phases.forEach((p) => { for (let i = p.i0; i <= Math.min(p.i1, R.n - 1); i++) phOf[i] = p.phase; });
  const head = ['time_s', 'rep', 'phase'];
  chs.forEach((c, k) => { const s = muscle(c.key).short; head.push(s + '_raw_V', s + '_bandpass_V', s + '_envelope_V'); if (R.N[k]) head.push(s + '_' + R.ni.unit.replace(/\W+/g, '')); });
  if (sig) head.push((sig.name + (sig.unit ? ' ' + sig.unit : '')).replace(/[^\w%°µ]+/g, '_'));
  const rows = [head];
  for (let i = 0; i < R.n; i++) {
    const r = [(i / R.fs).toFixed(5), repOf[i] || '', phOf[i] >= 0 ? SET().phaseNames[phOf[i]] || 'Phase ' + (phOf[i] + 1) : ''];
    chs.forEach((c, k) => { if (i < c.n) { r.push(c.raw[i].toExponential(5), c.bp[i].toExponential(5), c.env[i].toExponential(5)); if (R.N[k]) r.push(R.N[k][i].toFixed(3)); } else { r.push('', '', ''); if (R.N[k]) r.push(''); } });
    if (sig) { const j = Math.min(sig.n - 1, Math.round(i / R.fs * sig.fs)); r.push(Number.isFinite(sig.y[j]) ? sig.y[j].toFixed(4) : ''); }
    rows.push(r);
  }
  csv('continuous', rows);
}
function points() {
  const R = A.R, rows = [['point', 'muscle', 'time_s', 'sample']];
  R.pts.forEach((p) => rows.push([pointLabel(p), p.m ? muscle(p.m).short : '', (p.i / R.fs).toFixed(4), p.i]));
  csv('points', rows);
}
function waves() {
  const R = A.R, C = compute(R, 'reps');
  if (!C.wf) { status('Mark reps first: the waveforms are made from them.'); return; }
  const rows = [['muscle', 'rep', 'unit'].concat(Array.from({ length: 101 }, (_, j) => j + '%'))];
  C.wf.forEach((w) => {
    if (w.none) return; const s = muscle(w.key).short;
    w.curves.forEach((c, j) => rows.push([s, C.W[j] ? C.W[j].name : 'Rep ' + (j + 1), R.ni.unit].concat(Array.from(c, (v) => v.toFixed(3)))));
    rows.push([s, 'mean', R.ni.unit].concat(Array.from(w.mean, (v) => v.toFixed(3))));
    rows.push([s, 'SD', R.ni.unit].concat(Array.from(w.sd, (v) => v.toFixed(3))));
  });
  csv('waveforms', rows);
}
async function png(c, name) { if (!c) { status('Nothing to save yet.'); return; } download(baseName() + '_' + name + '.png', await canvasToBlob(c)); }

// Project file: typed arrays saved as plain arrays.
function saveProject() {
  const plain = A.session.trials.map((t) => Object.assign({}, t, { _sum: undefined, P: Object.assign({}, t.P, { emg: t.P.emg.map((e) => Object.assign({}, e, { y: Array.from(e.y) })), acc: t.P.acc.map((a) => Object.assign({}, a, { y: Array.from(a.y) })), aux: (t.P.aux || []).map((a) => Object.assign({}, a, { y: Array.from(a.y) })) }) }));
  const j = JSON.stringify({ app: 'EMG Analysis', version: 1, trials: plain, cur: A.session.cur, muscles: A.session.muscles, set: A.session.set });
  download('emg_project.json', new Blob([j], { type: 'application/json' }));
}
export function loadProjectObj(j) {
  if (!j || !Array.isArray(j.trials)) throw new Error('not an EMG Analysis project file');
  j.trials.forEach((t) => { t.P.emg.forEach((e) => { e.y = Float32Array.from(e.y); }); t.P.acc.forEach((a) => { a.y = Float32Array.from(a.y); }); (t.P.aux || []).forEach((a) => { a.y = Float32Array.from(a.y); }); });
  forget();
  A.session = { trials: j.trials, cur: j.cur || 0, muscles: j.muscles || {}, set: Object.assign(A.session.set, j.set || {}) };
  persist(); A.fn.openTrial(Math.max(0, Math.min(j.trials.length - 1, j.cur || 0)));
}

export function initExport() {
  $('xCont').addEventListener('click', () => { if (need()) { status('Building the file&hellip;'); setTimeout(continuous, 30); } });
  $('xDisc').addEventListener('click', () => { if (need()) csv('discrete', discreteRows(A.R)); });
  $('xDiscAll').addEventListener('click', sessionDiscrete);
  $('xRes').addEventListener('click', () => { if (need()) csv('results', resultRows(A.R, A.winType)); });
  $('xPts').addEventListener('click', () => { if (need()) points(); });
  $('xWf').addEventListener('click', () => { if (need()) waves(); });
  $('xPng').addEventListener('click', () => { if (need()) png(snapshot(1400), 'emg_graph'); });
  $('xPngWf').addEventListener('click', () => { if (need()) png(wfSnapshot(), 'average_waveform'); });
  $('xPngBar').addEventListener('click', () => png(barSnapshot(), 'session_bar_chart'));
  $('xProj').addEventListener('click', saveProject);
  $('projIn').addEventListener('change', function () {
    const f = this.files[0]; this.value = ''; if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { loadProjectObj(JSON.parse(r.result)); status('Project opened: ' + esc(f.name) + '.'); } catch (e) { status('<span class="bad">Could not open ' + esc(f.name) + ': ' + esc(e.message) + '</span>'); } };
    r.readAsText(f);
  });
}
