// The session: adding files, saying which are MVICs, labelling trials and moving between them.
import { A, $, esc, persist, status, uid, muscle, muscleKeys, forgetSession, defaultSet, SET, W, isCyclic } from './state.js?v=1.3.0';
import { findSet, runFinder, activityChanged, presetPhaseNames } from './events.js?v=1.3.0';
import { parseText } from './parse.js?v=1.3.0';
import { registerMuscles, guessMvicFor } from './setup.js?v=1.3.0';
import { forget, proc, repWindows } from './emg.js?v=1.3.0';

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
    if (isCyclic()) findAll(A.session.trials.slice(firstNew));
    A.fn.openTrial(firstNew);
    const nm = A.session.trials.slice(firstNew).filter((t) => t.role === 'mvic').length;
    status('Added ' + added + ' file' + (added > 1 ? 's' : '') + (nm ? ' (' + nm + ' look like MVICs)' : '') + '. Check <strong>Type</strong> in the Session table: MVIC or Reference files set 100% for each muscle.');
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
  const m = base.match(/(?:^|[_\-\s])(?:t|trial|rep)?\s*(\d{1,2})$/i) || base.match(/trial[_\-\s]?(\d{1,2})/i); if (m) tr.labels.trial = m[1];
  tr.role = opts.role || (/mvi?c|max(imal)?[_\s-]?(vol|effort)/i.test(name) ? 'mvic' : 'task');
  if (tr.role === 'mvic') tr.mvicFor = opts.mvicFor || guessMvicFor(tr);
  if (opts.labels) Object.assign(tr.labels, opts.labels);
  if (opts.points) tr.points = opts.points.map((p) => Object.assign({ id: uid() }, p));
  A.session.trials.push(tr);
  persist();
  return tr;
}

// Finds the reps (strides, cycles...) in one file from its movement signal, with the session's finder settings
// (events.js). Points found before are replaced; points marked by hand are kept. `again` = a setting was changed.
export function findIn(t, again) {
  const pr = proc(t); if (!pr.ok) return { n: 0, why: 'This file could not be processed.' };
  const f = findSet(), r = runFinder(pr, f), pc = (t.points || []).find((p) => p.pct !== undefined);
  t.points = (t.points || []).filter((p) => !p.auto);
  t.found = Object.assign({}, r.info || {}, { n: (r.info && r.info.n) || 0 });
  if (!t.found.n) return { n: 0, why: r.why };
  t.points = t.points.concat(r.pts.map((p) => Object.assign({ id: uid(), auto: true }, p))).sort((a, b) => a.t - b.t);
  // phase changes that were placed at a % of every rep move with the new reps
  if (pc && !r.info.phases) t.points = t.points.concat(repWindows(t, pr.fs, pr.n).map((w) => ({ id: uid(), type: 'phase', t: (w.i0 + (w.i1 - w.i0) * pc.pct / 100) / pr.fs, auto: true, pct: pc.pct }))).sort((a, b) => a.t - b.t);
  if (!again && r.info.phases) presetPhaseNames(f.preset);
  return { n: r.info.n, T: r.info.T, phases: r.info.phases };
}
// The same in several files; files with reps marked by hand are left alone. Returns how many files had some found.
export function findAll(list) {
  let n = 0;
  list.forEach((t) => {
    if (t.role === 'mvic' || (t.points || []).some((p) => p.type === 'rep0' && !p.auto)) return;
    if (findIn(t).n) n++;
  });
  persist();
  return n;
}

// The step-by-step guide at the top of the session: one line per job, ticked when done.
function renderGuide() {
  const el = $('sesGuide'); if (!el) return;
  const T = A.session.trials, set = SET(), w = W(), act = set.activity, cyc = act === 'gait' || act === 'cycling';
  if (!T.length) { el.innerHTML = ''; return; }
  const work = T.filter((t) => t.role !== 'mvic');
  const trialNums = [...new Set(work.map((t) => t.labels.trial || '').filter(Boolean))].sort((a, b) => (+a || 0) - (+b || 0));
  const byNum = !!trialNums.length && work.every((t) => t.labels.trial);
  const keys = muscleKeys();
  const nCyc = (t) => { const P = t.points || [], n0 = P.filter((p) => p.type === 'rep0').length; return P.some((p) => p.type === 'rep1') ? Math.min(n0, P.filter((p) => p.type === 'rep1').length) + 1 : n0; };
  const steps = [];
  // 1 what
  steps.push({ ok: true, title: 'What are you analysing?', body: '<select id="gAct">' + [['reps', 'A gym exercise (reps)'], ['gait', 'Running or walking'], ['cycling', 'Cycling'], ['jump', 'Jumping'], ['iso', 'Isometric holds'], ['open', 'Something else']].map(([v, l]) => '<option value="' + v + '"' + (act === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' });
  // 2 normalise
  if (set.norm === 'ref' || cyc) {
    const refT = work.filter((t) => t.role === 'ref'), covered = keys.every((k) => refT.some((t) => t.P.emg.some((e) => e.key === k)));
    const cur = byNum ? (refT.length && refT.every((t) => t.labels.trial === refT[0].labels.trial) ? refT[0].labels.trial : '') : '';
    steps.push({ ok: set.norm === 'ref' && covered, title: 'Which trial sets 100%?',
      body: set.norm !== 'ref' ? '<span>Normalising to ' + (set.norm === 'mvic' ? 'MVICs' : set.norm === 'peak' ? 'the session peak' : 'nothing') + '.</span><button type="button" class="btn small" id="gUseRef">Use a reference trial instead</button>'
        : byNum ? '<label class="inline" for="gRef" style="margin:0">Reference</label><select id="gRef"><option value="">Choose&hellip;</option>' + trialNums.map((n) => '<option value="' + esc(n) + '"' + (cur === n ? ' selected' : '') + '>Trial ' + esc(n) + '</option>').join('') + '</select><span class="muted">Every muscle in it becomes 100%' + (covered ? '' : '; ' + (refT.length ? '<span class="bad">not every muscle has one yet</span>' : 'e.g. the preferred or slowest speed')) + '.</span>'
          : '<span class="muted">Set the <strong>Type</strong> of the reference file(s) to <strong>Reference</strong> in the table below (one for each muscle).</span>' + (covered ? '' : ' <span class="bad">Not every muscle has one yet.</span>') });
  } else {
    const has = keys.every((k) => T.some((t) => t.role === 'mvic' && (t.mvicFor || []).includes(k)));
    steps.push({ ok: set.norm !== 'mvic' || has, title: 'What sets 100%?', body: set.norm === 'mvic' ? '<span class="muted">Set each MVIC file&rsquo;s <strong>Type</strong> to MVIC in the table below' + (has ? '.' : '; <span class="bad">not every muscle has one yet</span>.') + '</span>' : '<span class="muted">Change this in <strong>1. Setup</strong> &rarr; Normalise to.</span>' });
  }
  // 3 conditions
  const condOk = work.every((t) => t.labels.condition);
  steps.push({ ok: condOk, title: 'Name each ' + (act === 'reps' ? 'exercise' : 'condition'),
    body: byNum ? trialNums.map((n) => { const v = work.find((t) => t.labels.trial === n && t.labels.condition); return '<label class="inline" style="margin:0">Trial ' + esc(n) + '</label><input type="text" class="mini cond" data-cond="' + esc(n) + '" value="' + esc(v ? v.labels.condition : '') + '" placeholder="' + (act === 'reps' ? 'e.g. RDL' : 'e.g. 9 km/h') + '">'; }).join('') + '<span class="muted small">Files with the same name are grouped together in Compare.</span>'
      : '<span class="muted">Type it in the <em>Exercise or condition</em> column below. Files with the same name are grouped together in Compare.</span>' });
  // 4 cycles
  const done = work.filter((t) => nCyc(t) >= 2).length;
  steps.push({ ok: work.length && done === work.length, title: 'Find the ' + w.many + ' in every file',
    body: '<span><strong>' + done + ' of ' + work.length + '</strong> files done.</span><button type="button" class="btn small accent" id="gFind">Find ' + w.many + ' in every file</button><span class="muted small">Then open each file and check them on the graph in <strong>2. Reps and phases</strong> (you can also mark them by hand there).</span>' });
  // 5 results
  const ready = steps.every((x) => x.ok);
  steps.push({ ok: false, title: 'Look at the results', body: '<button type="button" class="btn small' + (ready ? ' accent' : '') + '" id="gCmp">Compare every trial</button><span class="muted small">or open one file and use <strong>3. Results</strong>.</span>' });
  let first = steps.findIndex((x) => !x.ok);
  el.innerHTML = '<ol class="guide">' + steps.map((x, j) => '<li class="' + (x.ok ? 'ok' : j === first ? 'now' : '') + '"><span class="gn">' + (x.ok ? '&#10003;' : j + 1) + '</span><div><p class="gt">' + x.title + '</p><div class="gb">' + x.body + '</div></div></li>').join('') + '</ol>';
  const re = (msg) => { persist(); forget(); A.fn.refresh({ keepView: true, keepStatus: !!msg }); if (msg) status(msg); };
  $('gAct').addEventListener('change', function () {
    set.activity = this.value;
    const anyMvic = T.some((q) => q.role === 'mvic');
    if ((set.activity === 'gait' || set.activity === 'cycling') && set.norm === 'mvic' && !anyMvic) set.norm = 'ref';
    presetPhaseNames(activityChanged().preset);
    let msg = '';
    if (set.activity === 'gait' || set.activity === 'cycling') { const n = findAll(T); if (n) msg = 'Found the ' + W().many + ' in ' + n + ' file' + (n > 1 ? 's' : '') + '. Check them on the graph.'; }
    re(msg);
  });
  if ($('gUseRef')) $('gUseRef').addEventListener('click', () => { set.norm = 'ref'; re(); });
  if ($('gRef')) $('gRef').addEventListener('change', function () {
    const n = this.value;
    work.forEach((t) => { if (t.labels.trial === n && n) t.role = 'ref'; else if (t.role === 'ref') t.role = 'task'; });
    re(n ? 'Trial ' + esc(n) + ' is the reference: each muscle&rsquo;s average ' + W().one + ' in it is 100%.' : '');
  });
  el.querySelectorAll('[data-cond]').forEach((i) => i.addEventListener('change', function () {
    const n = this.getAttribute('data-cond'), v = this.value.trim();
    work.forEach((t) => { if (t.labels.trial === n) t.labels.condition = v; });
    re();
  }));
  if ($('gFind')) $('gFind').addEventListener('click', () => {
    const n = findAll(work);
    A.show.acc = true; A.show.reps = true;
    re(n ? 'Found the ' + W().many + ' in ' + n + ' file' + (n > 1 ? 's' : '') + '. Open each file and check them on the graph (files with ' + W().many + ' marked by hand were left alone).' : '<span class="bad">No ' + W().many + ' found. Open a file and look at <strong>2. Reps and phases</strong>: change how they are found, or mark them by hand.</span>');
  });
  $('gCmp').addEventListener('click', () => A.fn.showTab('compare'));
}

export function renderSession() {
  renderGuide();
  const T = A.session.trials, el = $('sesTab');
  const nM = T.filter((t) => t.role === 'mvic').length, nR = T.filter((t) => t.role === 'ref').length, nT = T.length - nM - nR;
  $('sesCount').textContent = T.length ? '(' + nT + ' task trial' + (nT === 1 ? '' : 's') + (nR ? ', ' + nR + ' reference' : '') + (nM ? ', ' + nM + ' MVIC' + (nM === 1 ? '' : 's') : '') + ')' : '';
  $('sesNext').disabled = !(A.session.cur >= 0 && A.session.cur < T.length - 1);
  if (!T.length) { el.innerHTML = '<tr><td class="muted">No files yet. Press <strong>Add files</strong> (add the MVIC files and the task trials together), or try the demo.</td></tr>'; return; }
  let h = '<thead><tr><th>#</th><th>File</th><th>Type</th><th>Participant</th><th>Exercise or condition</th><th>Trial</th><th>Summary</th><th></th></tr></thead><tbody>';
  T.forEach((t, k) => {
    const cur = k === A.session.cur, mv = t.role === 'mvic';
    h += '<tr class="' + (cur ? 'current' : '') + (mv ? ' mvrow' : '') + '"><td>' + (k + 1) + '</td><td class="small">' + esc(t.name) + '</td>'
      + '<td><select class="mini" data-role="' + k + '" style="width:auto">' + [['task', 'Task'], ['ref', 'Reference'], ['mvic', 'MVIC']].map(([v, l]) => '<option value="' + v + '"' + ((t.role || 'task') === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></td>'
      + '<td><input type="text" class="mini" data-k="' + k + '" data-f="athlete" value="' + esc(t.labels.athlete || '') + '" aria-label="participant"></td>'
      + (mv ? '<td colspan="2" class="small">for ' + ((t.mvicFor || []).map((m) => '<strong>' + esc(muscle(m).short) + '</strong>').join(', ') || '<span class="bad">choose in 1. Setup</span>') + '</td>'
        : ['condition', 'trial'].map((f) => '<td><input type="text" class="mini" data-k="' + k + '" data-f="' + f + '" value="' + esc(t.labels[f] || '') + '" aria-label="' + f + '"' + (f === 'condition' ? ' placeholder="e.g. RDL, 9 km/h"' : ' style="min-width:3rem;width:3.5rem"') + '></td>').join(''))
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
