// Export: data for this trial (CSV), images (PNG) and the project file (the whole session).
import { A, $, esc, status, muscle, toCsv, download, baseName, persist } from './state.js?v=1.1.0';
import { canvasToBlob } from './plot.js?v=1.1.0';
import { snapshot } from './trace.js?v=1.1.0';
import { resultRows, compute, wfSnapshot } from './results.js?v=1.1.0';
import { barSnapshot } from './compare.js?v=1.1.0';
import { pointLabel, forget } from './emg.js?v=1.1.0';

function need() { if (!A.R || !A.R.ok) { status('Open a file first.'); return false; } return true; }
const csv = (name, rows) => download(baseName() + '_' + name + '.csv', new Blob([toCsv(rows)], { type: 'text/csv' }));

function continuous() {
  const R = A.R, chs = R.pr.ch;
  const head = ['time_s'];
  chs.forEach((c, k) => { const s = muscle(c.key).short; head.push(s + '_raw_V', s + '_bandpass_V', s + '_envelope_V'); if (R.N[k]) head.push(s + '_' + R.ni.unit.replace(/\W+/g, '')); });
  const rows = [head];
  for (let i = 0; i < R.n; i++) {
    const r = [(i / R.fs).toFixed(5)];
    chs.forEach((c, k) => { if (i < c.n) { r.push(c.raw[i].toExponential(5), c.bp[i].toExponential(5), c.env[i].toExponential(5)); if (R.N[k]) r.push(R.N[k][i].toFixed(3)); } else { r.push('', '', ''); if (R.N[k]) r.push(''); } });
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
    w.curves.forEach((c, j) => rows.push([s, 'Rep ' + (j + 1), R.ni.unit].concat(Array.from(c, (v) => v.toFixed(3)))));
    rows.push([s, 'mean', R.ni.unit].concat(Array.from(w.mean, (v) => v.toFixed(3))));
    rows.push([s, 'SD', R.ni.unit].concat(Array.from(w.sd, (v) => v.toFixed(3))));
  });
  csv('waveforms', rows);
}
async function png(c, name) { if (!c) { status('Nothing to save yet.'); return; } download(baseName() + '_' + name + '.png', await canvasToBlob(c)); }

// Project file: typed arrays saved as plain arrays.
function saveProject() {
  const plain = A.session.trials.map((t) => Object.assign({}, t, { _sum: undefined, P: Object.assign({}, t.P, { emg: t.P.emg.map((e) => Object.assign({}, e, { y: Array.from(e.y) })), acc: t.P.acc.map((a) => Object.assign({}, a, { y: Array.from(a.y) })) }) }));
  const j = JSON.stringify({ app: 'EMG Analysis', version: 1, trials: plain, cur: A.session.cur, muscles: A.session.muscles, set: A.session.set });
  download('emg_project.json', new Blob([j], { type: 'application/json' }));
}
export function loadProjectObj(j) {
  if (!j || !Array.isArray(j.trials)) throw new Error('not an EMG Analysis project file');
  j.trials.forEach((t) => { t.P.emg.forEach((e) => { e.y = Float32Array.from(e.y); }); t.P.acc.forEach((a) => { a.y = Float32Array.from(a.y); }); });
  forget();
  A.session = { trials: j.trials, cur: j.cur || 0, muscles: j.muscles || {}, set: Object.assign(A.session.set, j.set || {}) };
  persist(); A.fn.openTrial(Math.max(0, Math.min(j.trials.length - 1, j.cur || 0)));
}

export function initExport() {
  $('xCont').addEventListener('click', () => { if (need()) { status('Building the file&hellip;'); setTimeout(continuous, 30); } });
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
