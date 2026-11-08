// The session: adding files, saying which are MVICs, labelling trials and moving between them.
import { A, $, esc, persist, status, uid, muscle, forgetSession, defaultSet } from './state.js?v=1.0.0';
import { parseText } from './parse.js?v=1.0.0';
import { registerMuscles, guessMvicFor } from './setup.js?v=1.0.0';
import { forget } from './emg.js?v=1.0.0';

function readText(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsText(file); }); }

export async function addFiles(files) {
  const list = Array.from(files || []); if (!list.length) return;
  let added = 0, firstNew = -1;
  for (const f of list) {
    if (/\.(hpf|emg|c3d|mat)$/i.test(f.name)) { status('<span class="bad">' + esc(f.name) + ' is a binary file. In EMGworks, export the raw EMG as a text file (.txt or .csv) and add that.</span>'); continue; }
    try {
      status('Reading ' + esc(f.name) + '&hellip;');
      const txt = await readText(f);
      addText(txt, f.name);
      if (firstNew < 0) firstNew = A.session.trials.length - 1;
      added++;
    } catch (e) { status('<span class="bad">Could not read ' + esc(f.name) + ': ' + esc(e.message || e) + '</span>'); }
  }
  if (added) {
    A.fn.openTrial(firstNew);
    const nm = A.session.trials.slice(firstNew).filter((t) => t.role === 'mvic').length;
    status('Added ' + added + ' file' + (added > 1 ? 's' : '') + (nm ? ' (' + nm + ' look like MVICs)' : '') + '. Check <strong>Type</strong> in the Session table: MVIC files set 100% for each muscle.');
  }
}

export function addText(txt, name, opts) {
  opts = opts || {};
  const P = parseText(txt, name);
  if (!P.emg.length) throw new Error(P.warnings[0] || 'no EMG found');
  registerMuscles(P);
  const prev = A.session.trials[A.session.cur];
  const tr = {
    id: 't' + Date.now().toString(36) + uid(), name, P, points: [], wins: [], fsOverride: 0, scale: 1,
    labels: { athlete: prev ? prev.labels.athlete : '', condition: '', trial: '' }
  };
  const base = name.replace(/\.[^.]+$/, '');
  const m = base.match(/(?:^|[_\-\s])(?:t|trial|rep)?\s*(\d{1,2})$/i); if (m) tr.labels.trial = m[1];
  tr.role = opts.role || (/mvi?c|max(imal)?[_\s-]?(vol|effort)/i.test(name) ? 'mvic' : 'task');
  if (tr.role === 'mvic') tr.mvicFor = opts.mvicFor || guessMvicFor(tr);
  if (opts.labels) Object.assign(tr.labels, opts.labels);
  if (opts.points) tr.points = opts.points.map((p) => Object.assign({ id: uid() }, p));
  A.session.trials.push(tr);
  persist();
  return tr;
}

export function renderSession() {
  const T = A.session.trials, el = $('sesTab');
  const nM = T.filter((t) => t.role === 'mvic').length;
  $('sesCount').textContent = T.length ? '(' + (T.length - nM) + ' task trial' + (T.length - nM === 1 ? '' : 's') + ', ' + nM + ' MVIC' + (nM === 1 ? '' : 's') + ')' : '';
  $('sesNext').disabled = !(A.session.cur >= 0 && A.session.cur < T.length - 1);
  if (!T.length) { el.innerHTML = '<tr><td class="muted">No files yet. Press <strong>Add files</strong> (add the MVIC files and the task trials together), or try the demo.</td></tr>'; return; }
  let h = '<thead><tr><th>#</th><th>File</th><th>Type</th><th>Participant</th><th>Exercise</th><th>Trial</th><th>Summary</th><th></th></tr></thead><tbody>';
  T.forEach((t, k) => {
    const cur = k === A.session.cur, mv = t.role === 'mvic';
    h += '<tr class="' + (cur ? 'current' : '') + (mv ? ' mvrow' : '') + '"><td>' + (k + 1) + '</td><td class="small">' + esc(t.name) + '</td>'
      + '<td><select class="mini" data-role="' + k + '" style="width:auto"><option value="task"' + (mv ? '' : ' selected') + '>Task</option><option value="mvic"' + (mv ? ' selected' : '') + '>MVIC</option></select></td>'
      + '<td><input type="text" class="mini" data-k="' + k + '" data-f="athlete" value="' + esc(t.labels.athlete || '') + '" aria-label="participant"></td>'
      + (mv ? '<td colspan="2" class="small">for ' + ((t.mvicFor || []).map((m) => '<strong>' + esc(muscle(m).short) + '</strong>').join(', ') || '<span class="bad">choose in 1. Setup</span>') + '</td>'
        : ['condition', 'trial'].map((f) => '<td><input type="text" class="mini" data-k="' + k + '" data-f="' + f + '" value="' + esc(t.labels[f] || '') + '" aria-label="' + f + '"' + (f === 'condition' ? ' placeholder="e.g. RDL"' : ' style="min-width:3rem;width:3.5rem"') + '></td>').join(''))
      + '<td class="small" id="sesRes' + k + '">' + (t._sum || '') + '</td><td class="nowrap">'
      + (cur ? '<span class="muted small">open</span>' : '<button class="btn small" type="button" data-open="' + k + '">Open</button>')
      + ' <button class="btn small ghost" type="button" data-rm="' + k + '" title="Remove from the session">&times;</button></td></tr>';
  });
  el.innerHTML = h + '</tbody>';
  el.querySelectorAll('input[data-f]').forEach((i) => i.addEventListener('change', function () {
    const t = T[+this.getAttribute('data-k')]; t.labels[this.getAttribute('data-f')] = this.value.trim(); persist();
    A.fn.refresh({ keepView: true });
  }));
  el.querySelectorAll('[data-role]').forEach((s) => s.addEventListener('change', function () {
    const t = T[+this.getAttribute('data-role')]; t.role = this.value;
    if (t.role === 'mvic' && !(t.mvicFor && t.mvicFor.length)) t.mvicFor = guessMvicFor(t);
    persist(); A.fn.refresh({ keepView: true });
  }));
  el.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => A.fn.openTrial(+b.getAttribute('data-open'))));
  el.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
    const k = +b.getAttribute('data-rm');
    forget(T[k]); T.splice(k, 1);
    if (!T.length) { A.session.cur = -1; A.fn.openTrial(-1); }
    else A.fn.openTrial(Math.min(k <= A.session.cur ? Math.max(0, A.session.cur - 1) : A.session.cur, T.length - 1));
    persist();
  }));
}

export function initSession() {
  const onFiles = function () { addFiles(this.files); this.value = ''; };
  $('file').addEventListener('change', onFiles);
  $('file2').addEventListener('change', onFiles);
  $('sesNext').addEventListener('click', () => { if (A.session.cur < A.session.trials.length - 1) A.fn.openTrial(A.session.cur + 1); });
  $('sesNew').addEventListener('click', () => {
    if (A.session.trials.length && !confirm('Start a new session? The files in this session will be cleared from the browser (save a project file first if you want to keep them).')) return;
    A.session = { trials: [], cur: -1, muscles: {}, set: defaultSet() }; forget(); forgetSession(); A.fn.openTrial(-1);
  });
  document.addEventListener('dragover', (e) => { e.preventDefault(); });
  document.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });
}
