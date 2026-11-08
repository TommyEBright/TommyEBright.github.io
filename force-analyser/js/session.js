// Sessions: adding files, labelling trials, moving between them, carrying settings over.
import { A, $, esc, persist, status, newTrial, currentTrial, SHARED, clone, forgetSession } from './state.js?v=2.0.0';
import { parseText, buildData } from './parse.js?v=2.0.0';
import { guessJump, JUMP_SHORT, analyse, defaultSettings } from './analyse.js?v=2.0.0';
import { guessType, guessAxes, GAIT, TYPE_SHORT, defaultG } from './generic.js?v=2.0.0';

function readText(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsText(file); }); }

// Guess participant / condition / trial from a file name like "Sam_CMJ_arms_3.txt".
function labelsFrom(name) {
  const base = name.replace(/\.[^.]+$/, '');
  const m = base.match(/(?:^|[_\-\s])(?:t|trial)?\s*(\d{1,2})$/i);
  return { athlete: '', condition: '', trial: m ? m[1] : '' };
}

export async function addFiles(files) {
  const list = Array.from(files || []); if (!list.length) return;
  const prev = currentTrial();
  let added = 0, firstNew = -1;
  for (const f of list) {
    try {
      const txt = await readText(f);
      addText(txt, f.name, prev);
      if (firstNew < 0) firstNew = A.session.trials.length - 1;
      added++;
    } catch (e) { status('<span class="bad">Could not read ' + esc(f.name) + ': ' + esc(e.message || e) + '</span>'); }
  }
  if (added) { A.fn.openTrial(firstNew); status('Added ' + added + ' file' + (added > 1 ? 's' : '') + '.'); }
}

export function addText(txt, name, prev, opts) {
  const P = parseText(txt, name);
  // store the columns compactly
  P.data = P.data.map((c) => Float32Array.from(c));
  const map = P.plates.map((p) => ({ name: p.name, fz: p.fz, fx: p.fx, fy: p.fy }));
  const tr = newTrial(name, P, map);
  tr.labels = Object.assign(labelsFrom(name), (opts && opts.labels) || {});
  if (prev) { SHARED.forEach((k) => { if (prev.set[k] !== undefined) tr.set[k] = clone(prev.set[k]); }); if (tr.set.roles.length !== map.length) tr.set.roles = map.map(() => 'on'); if (prev.labels.athlete && !tr.labels.athlete) tr.labels.athlete = prev.labels.athlete; }
  else tr.set.roles = map.map(() => 'on');
  if (tr.fs > 0) {
    try {
      const D = buildData(P, map), g = guessJump(D);
      if (!prev || (opts && opts.guess) || g !== prev.set.jump) tr.set.jump = g;
      const R = analyse(D, Object.assign(defaultSettings(), { jump: g }));
      const jumpOk = R.ok && R.LD >= 0 && (R.LD - R.TO) / R.fs > 0.1 && (R.LD - R.TO) / R.fs < 1.2;
      const gt = guessType(P, D, jumpOk), shapeOnly = gt === (jumpOk ? 'jump' : 'any');
      tr.set.type = prev && shapeOnly ? prev.set.type || 'jump' : gt;
      if (GAIT[tr.set.type] && !(prev && prev.set.axes)) { if (A.axesSet) tr.set.axes = Object.assign({}, A.axes); else { tr.set.axes = guessAxes(D); tr.set.axesGuessed = true; } }
    } catch (e) { /* leave as is */ }
  }
  tr.set.g = defaultG();
  if (opts && opts.set) Object.assign(tr.set, opts.set);
  tr.warnings = P.warnings;
  A.session.trials.push(tr);
  persist();
  return tr;
}

export function renderSession() {
  const T = A.session.trials, el = $('sesTab');
  $('sesCount').textContent = T.length ? '(' + T.length + ' trial' + (T.length > 1 ? 's' : '') + ')' : '';
  $('sesNext').disabled = !(A.session.cur >= 0 && A.session.cur < T.length - 1);
  if (!T.length) { el.innerHTML = '<tr><td class="muted">No files yet. Press <strong>Add files</strong>, or try a demo trial.</td></tr>'; return; }
  let h = '<thead><tr><th>#</th><th>File</th><th>Participant</th><th>Condition</th><th>Trial</th><th>Type</th><th>Result</th><th></th></tr></thead><tbody>';
  T.forEach((t, k) => {
    const cur = k === A.session.cur;
    h += '<tr class="' + (cur ? 'current' : '') + '"><td>' + (k + 1) + '</td><td class="small">' + esc(t.name) + '</td>'
      + ['athlete', 'condition', 'trial'].map((f) => '<td><input type="text" class="mini" data-k="' + k + '" data-f="' + f + '" value="' + esc(t.labels[f] || '') + '" aria-label="' + f + '"></td>').join('')
      + '<td>' + (t.set.type && t.set.type !== 'jump' ? TYPE_SHORT[t.set.type] : JUMP_SHORT[t.set.jump]) + '</td><td class="small" id="sesRes' + k + '">' + (t._sum || '') + '</td><td class="nowrap">'
      + (cur ? '<span class="muted small">open</span>' : '<button class="btn small" type="button" data-open="' + k + '">Open</button>')
      + ' <button class="btn small ghost" type="button" data-rm="' + k + '" title="Remove from the session">&times;</button></td></tr>';
  });
  el.innerHTML = h + '</tbody>';
  el.querySelectorAll('input[data-f]').forEach((i) => i.addEventListener('change', function () {
    const t = T[+this.getAttribute('data-k')]; t.labels[this.getAttribute('data-f')] = this.value.trim(); persist();
    if (A.fn.labelsChanged) A.fn.labelsChanged();
  }));
  el.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => A.fn.openTrial(+b.getAttribute('data-open'))));
  el.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
    const k = +b.getAttribute('data-rm');
    if (!confirmRemove(T[k])) return;
    T.splice(k, 1);
    if (!T.length) { A.session.cur = -1; A.fn.openTrial(-1); }
    else A.fn.openTrial(Math.min(k <= A.session.cur ? Math.max(0, A.session.cur - 1) : A.session.cur, T.length - 1));
    persist();
  }));
}
function confirmRemove() { return true; } // nothing is lost: the file can be added again

// A one-line summary for the session table.
export function summarise(t) {
  try {
    const R = analyse(buildData(t.P, t.map, t.fs), t.set);
    if (!R.ok) return '<span class="bad">check</span>';
    const tov = R.v[R.TO]; const h = tov > 0 ? tov * tov / 19.62 * 100 : NaN;
    return (Number.isFinite(h) ? h.toFixed(1) + ' cm' : '') + (R.jump === 'dj' ? ', RSI ' + (R.LD > 0 ? ((9.81 * ((R.LD - R.TO) / R.fs) ** 2 / 8) / ((R.TO - R.TD) / R.fs)).toFixed(2) : '&ndash;') : '');
  } catch (e) { return ''; }
}

// One file holding several trials (columns from the same plate repeated): one session trial for each.
export function splitTrial() {
  const k = A.session.cur, t = A.session.trials[k]; if (!t) return;
  const all = t.P.allPlates || t.P.plates;
  const parts = all.map((pl, j) => {
    const tr = newTrial(t.name, t.P, [{ name: pl.name, fz: pl.fz, fx: pl.fx, fy: pl.fy }]);
    tr.set = clone(t.set); tr.set.roles = ['on']; tr.set.g = defaultG(); tr.fs = t.fs;
    tr.labels = Object.assign({}, t.labels, { trial: String(j + 1) }); tr.splitFrom = t.name;
    return tr;
  });
  A.session.trials.splice(k, 1, ...parts);
  persist(); A.fn.openTrial(k);
  status('Split into ' + parts.length + ' trials (trial 1 to ' + parts.length + '). Mark the points in each one, then use <strong>Compare trials</strong> to average them.');
}

export function initSession() {
  const onFiles = function () { addFiles(this.files); this.value = ''; };
  $('file').addEventListener('change', onFiles);
  $('file2').addEventListener('change', onFiles);
  $('sesNext').addEventListener('click', () => { if (A.session.cur < A.session.trials.length - 1) A.fn.openTrial(A.session.cur + 1); });
  $('sesNew').addEventListener('click', () => {
    if (A.session.trials.length && !confirm('Start a new session? The trials in this session will be cleared from the browser (save a project file first if you want to keep them).')) return;
    A.session = { trials: [], cur: -1 }; forgetSession(); A.fn.openTrial(-1);
  });
  // drag and drop anywhere on the page
  document.addEventListener('dragover', (e) => { e.preventDefault(); });
  document.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });
}
