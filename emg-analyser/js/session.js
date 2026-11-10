// The session: adding files, saying which are MVICs, labelling trials and moving between them.
import { A, $, esc, persist, status, uid, muscle, muscleKeys, forgetSession, defaultSet, SET, W } from './state.js?v=1.2.0';
import { parseText } from './parse.js?v=1.2.0';
import { registerMuscles, guessMvicFor } from './setup.js?v=1.2.0';
import { forget, proc, findCycles } from './emg.js?v=1.2.0';

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
    const cyc = SET().activity === 'gait' || SET().activity === 'cycling';
    if (cyc) findAll(A.session.trials.slice(firstNew));
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

// Find the strides (or cycles) in files from their own accelerometer; files with any marked by hand are left alone.
export function findAll(list) {
  const set = SET(), kind = set.activity === 'cycling' ? 'smooth' : 'impact';
  let n = 0;
  list.forEach((t) => {
    if (t.role === 'mvic' || (t.points || []).some((p) => p.type === 'rep0' && !p.auto)) return;
    const pr = proc(t); if (!pr.ok) return;
    const s0 = Object.keys(pr.acc)[0]; if (!s0) return;
    const ts = findCycles(pr, s0, kind, set.cycleGap); if (ts.length < 2) return;
    t.points = (t.points || []).filter((p) => !p.auto).concat(ts.map((tm) => ({ id: uid(), type: 'rep0', t: tm, auto: true }))).sort((a, b) => a.t - b.t);
    forget(t); n++;
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
  const nCyc = (t) => (t.points || []).filter((p) => p.type === 'rep0').length;
  const steps = [];
  // 1 what
  steps.push({ ok: true, title: 'What are you analysing?', body: '<select id="gAct">' + [['reps', 'A gym exercise'], ['gait', 'Running or walking'], ['cycling', 'Cycling'], ['open', 'Something else']].map(([v, l]) => '<option value="' + v + '"' + (act === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' });
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
  steps.push({ ok: work.length && done === work.length, title: (cyc ? 'Find the ' : 'Mark the ') + w.many + ' in every file',
    body: '<span><strong>' + done + ' of ' + work.length + '</strong> files done.</span>' + (cyc || act === 'open' ? '<button type="button" class="btn small accent" id="gFind">Find ' + w.many + ' in every file</button><span class="muted small">Then open each file and check them on the graph.</span>' : '<span class="muted">Open each file and mark its reps in <strong>2. Points</strong>.</span>') });
  // 5 results
  const ready = steps.every((x) => x.ok);
  steps.push({ ok: false, title: 'Look at the results', body: '<button type="button" class="btn small' + (ready ? ' accent' : '') + '" id="gCmp">Compare every trial</button><span class="muted small">or open one file and use <strong>3. Results</strong>.</span>' });
  let first = steps.findIndex((x) => !x.ok);
  el.innerHTML = '<ol class="guide">' + steps.map((x, j) => '<li class="' + (x.ok ? 'ok' : j === first ? 'now' : '') + '"><span class="gn">' + (x.ok ? '&#10003;' : j + 1) + '</span><div><p class="gt">' + x.title + '</p><div class="gb">' + x.body + '</div></div></li>').join('') + '</ol>';
  const re = (msg) => { persist(); forget(); A.fn.refresh({ keepView: true, keepStatus: !!msg }); if (msg) status(msg); };
  $('gAct').addEventListener('change', function () {
    set.activity = this.value; set.cycleGap = set.activity === 'cycling' ? 0.4 : 0.5;
    const anyMvic = T.some((q) => q.role === 'mvic');
    if ((set.activity === 'gait' || set.activity === 'cycling') && set.norm === 'mvic' && !anyMvic) set.norm = 'ref';
    const PH = { gait: ['Stance', 'Swing'], cycling: ['Downstroke', 'Upstroke'] }, dflt = defaultSet().phaseNames;
    if (set.phaseNames.slice(0, 2).every((n, j) => n === dflt[j] || Object.values(PH).some((p) => p[j] === n))) set.phaseNames = (PH[set.activity] || dflt.slice(0, 2)).concat(dflt.slice(2));
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
    re(n ? 'Found the ' + W().many + ' in ' + n + ' file' + (n > 1 ? 's' : '') + '. Open each file and check them on the graph (files with ' + W().many + ' marked by hand were left alone).' : '<span class="bad">No ' + W().many + ' found. Check the files have accelerometer data, or mark them by hand in 2. Points.</span>');
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
