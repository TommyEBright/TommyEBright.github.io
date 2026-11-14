// Start-up: wires the page together.
import { A, $, esc, status, persist, restoreSession, loadPrefs, savePrefs, VERSION, trialLabel, muscle, defaultSet, W, SET } from './state.js?v=1.4.0';
import { findSet, moveSignal } from './events.js?v=1.4.0';
import { renderFigure, figureViewChanged } from './figure.js?v=1.4.0';
import { analyse, references, forget } from './emg.js?v=1.4.0';
import { initTrace, redraw, wholeRange } from './trace.js?v=1.4.0';
import { renderPoints } from './points.js?v=1.4.0';
import { renderResults } from './results.js?v=1.4.0';
import { renderSetup } from './setup.js?v=1.4.0';
import { initSession, renderSession, addText } from './session.js?v=1.4.0';
import { renderCompare } from './compare.js?v=1.4.0';
import { initExport } from './export.js?v=1.4.0';
import { renderSteps, stepsView, renderFatigue, renderRor, renderOnOff } from './deeper.js?v=1.4.0';

const curTab = () => { const b = $('stepbar').querySelector('.tab[data-t][aria-selected=true]'); return b ? b.getAttribute('data-t') : 'setup'; };
const STEPS = ['setup', 'events', 'results', 'figure', 'files'];
const STEP_NAME = { setup: 'Set up', events: 'Reps and phases', results: 'Results', figure: 'Figure', files: 'Export' };

// ---------- analysis and redrawing ----------
function refresh(o) {
  o = o || {};
  const S = A.S;
  if (!S) { A.R = null; showEmpty(true); renderTab(); stepGuide(); return; }
  showEmpty(false);
  try { A.R = analyse(S); } catch (e) { A.R = { ok: false, error: 'Could not analyse this file: ' + esc(e.message || e) }; console.error(e); }
  const ok = A.R.ok;
  if (ok && (!o.keepView || !A.view)) A.view = wholeRange();
  if (ok && A.cursor >= A.R.n) A.cursor = -1;
  if (ok && A.lane >= A.R.pr.ch.length) A.lane = -1;
  $('traceWrap').classList.toggle('hide', !ok);
  if (ok) redraw();
  $('tabPts').innerHTML = 'Step 2 &middot; ' + (S.role === 'mvic' ? 'Reps and phases (optional)' : 'Reps and phases');
  if (o.quick) { if (curTab() === 'results') renderResults(); if (curTab() === 'events') renderPoints(); return; }
  showChips(); renderSession(); renderTab(); sessionSummaries(); badge(); stepGuide();
  if (!o.keepStatus) status(!ok ? '<span class="bad">' + A.R.error + '</span>' : nextStep());
}
// One clear next step for the student.
function nextStep() {
  const R = A.R, t = A.S, set = A.session.set;
  if (R.mvic) return (t.mvicFor && t.mvicFor.length) ? 'MVIC file for <strong>' + t.mvicFor.map((k) => esc(muscle(k).short)).join(', ') + '</strong>. Nothing to mark: open a task trial next.' : 'This is an MVIC file. Tick which muscle it is for in <strong>Step 1 (Set up)</strong>.';
  const w = W(), cyc = set.activity === 'gait' || set.activity === 'cycling';
  if (set.norm === 'mvic' && R.missing.length) return 'No MVIC yet for <strong>' + R.missing.map((k) => esc(muscle(k).short)).join(', ') + '</strong>: add the MVIC files (and set their Type to MVIC) so the EMG can be shown as %MVIC.';
  if (set.norm === 'ref' && R.missing.length) return 'No reference trial yet for <strong>' + R.missing.map((k) => esc(muscle(k).short)).join(', ') + '</strong>: set the reference trial&rsquo;s <strong>Type</strong> to Reference in Your files' + (cyc ? ' and find its ' + w.many : '') + '.';
  if (!R.reps.length) return 'Next: open <strong>Step 2 (Reps and phases)</strong> and press <strong>Find ' + w.many + '</strong> (or mark them by hand), then check them on the graph.';
  return R.reps.length + ' ' + (R.reps.length > 1 ? w.many : w.one) + (R.phases.length ? ', each split into phases' : '') + '. Check them on the graph, then look at <strong>Step 3 (Results)</strong>' + (R.autoOn ? ' (on/off is found automatically)' : '') + ' and make a figure in <strong>Step 4 (Figure)</strong>.';
}
function badge() { const R = A.R, w = W(); $('tabRes').innerHTML = 'Step 3 &middot; Results' + (R && R.ok && !R.mvic && R.reps.length ? ' (' + R.reps.length + ' ' + (R.reps.length > 1 ? w.many : w.one) + ')' : ''); }
function showEmpty(on) { $('empty').classList.toggle('hide', !on); if (on) { $('traceWrap').classList.add('hide'); $('readout').innerHTML = ''; $('trialName').textContent = ''; $('showChips').innerHTML = ''; } }

function openTrial(k) {
  A.session.cur = k;
  A.S = A.session.trials[k] || null;
  A.R = null; A.cursor = -1; A.pinned = false; A.view = null;
  refresh();
  renderSession();
  $('trialName').textContent = A.S ? '(' + trialLabel(A.S) + (A.S.role === 'mvic' ? ', MVIC' : '') + ')' : '';
  persist();
}
function sessionSummaries() {
  const refs = {}; // per participant
  A.session.trials.forEach((t, k) => {
    let s = '';
    try {
      if (t.role === 'mvic') {
        const who = (t.labels.athlete || '').trim().toLowerCase(); const r = refs[who] || (refs[who] = references(who));
        s = (t.mvicFor || []).map((m) => { const x = r[m]; const mine = x && x.all.find((q) => q.trial === t.id); return esc(muscle(m).short) + ' ' + (mine ? (mine.v * 1e6).toFixed(0) + ' µV' + (x.trial === t.id ? ' &#10003;' : '') : ''); }).join(', ');
      } else if (t === A.S && A.R && A.R.ok) s = (t.role === 'ref' ? '<strong>reference</strong>, ' : '') + (A.R.reps.length ? A.R.reps.length + ' ' + (A.R.reps.length > 1 ? W().many : W().one) : '<span class="muted">no ' + W().many + ' yet</span>');
      else { const n = (t.points || []).filter((p) => p.type === 'rep0').length; s = n ? n + ' ' + W().start.toLowerCase() + (n > 1 ? 's' : '') : '<span class="muted">no ' + W().many + ' yet</span>'; }
    } catch (e) { s = ''; }
    t._sum = s; const el = $('sesRes' + k); if (el) el.innerHTML = s;
  });
}

// ---------- chips ----------
function showChips() {
  const el = $('showChips'); const R = A.R;
  if (!R || !R.ok) { el.innerHTML = ''; return; }
  const items = [['raw', 'Raw EMG']];
  const sensors = Object.keys(R.pr.acc), sig = moveSignal(R.pr), fnd = findSet();
  if (sig) items.push(['acc', 'Movement signal']);
  if (!R.mvic) items.push(['reps', W().Many], ['guide', 'Onset guide']);
  el.innerHTML = items.map(([k, l]) => '<button type="button" class="chip' + (A.show[k] ? ' active' : '') + '" data-s="' + k + '" aria-pressed="' + !!A.show[k] + '">' + l + '</button>').join('')
    + (sensors.length > 1 && A.show.acc && sig && sig.sensor ? '<select id="accSel" class="mini" title="Which sensor&rsquo;s accelerometer the movement signal comes from">' + sensors.map((s) => '<option value="' + esc(s) + '"' + (sig.sensor === s ? ' selected' : '') + '>' + esc(muscle(s).short || s) + ' sensor</option>').join('') + '</select>' : '');
  el.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => {
    const k = b.getAttribute('data-s'); A.show[k] = !A.show[k]; savePrefs(); showChips(); redraw();
    if (k === 'guide' && A.show.guide && !R.rest) status('The onset guide needs a rest period: mark <strong>Rest start</strong> and <strong>Rest end</strong> in <strong>Step 2 (Reps and phases)</strong> (section 3).');
  }));
  if ($('accSel')) $('accSel').addEventListener('change', function () { fnd.sensor = this.value; persist(); redraw(); if (curTab() === 'events') renderPoints(); });
}

// ---------- tabs ----------
function renderTab() {
  const t = curTab();
  if (t === 'setup') renderSetup();
  if (t === 'events') renderPoints();
  if (t === 'results') renderResults();
  if (t === 'compare') renderCompare();
  if (t === 'figure') renderFigure();
  if (t === 'steps') renderSteps();
  if (t === 'fatigue') renderFatigue();
  if (t === 'ror') renderRor();
  if (t === 'onoff') renderOnOff();
}
function showTab(t) {
  document.querySelectorAll('#stepbar .tab[data-t]').forEach((b) => b.setAttribute('aria-selected', String(b.getAttribute('data-t') === t)));
  document.querySelectorAll('#panel .pane').forEach((p) => p.classList.toggle('hide', p.getAttribute('data-p') !== t));
  if (['steps', 'fatigue', 'onoff', 'ror'].includes(t)) $('stepbar').classList.add('showdeep');
  // once past setup, fold the file list away so the graph and the step sit together
  if (t !== 'setup' && A.session.trials.length) { const ses = document.querySelector('details.session'); if (ses) ses.open = false; }
  renderTab(); stepGuide();
  if (A.R && A.R.ok) {
    const R = A.R, w = W(), n = R.reps ? R.reps.length : 0, nn = n + ' ' + (n === 1 ? w.one : w.many);
    status(R.mvic || !n ? nextStep()
      : t === 'results' ? 'Results for <strong>' + nn + '</strong> in this file. The first three sections are the ones most lab reports need.'
      : t === 'figure' ? 'Making a figure from ' + nn + '. Press <strong>Show the graph</strong> if you want to zoom in on part of the trial first.'
      : t === 'files' ? 'Ready to save the data for ' + nn + '.'
      : nextStep());
  }
  const si = $('stepIntro'), bar = $('stepbar');
  if (si && bar) window.scrollTo({ top: Math.max(0, si.getBoundingClientRect().top + window.scrollY - bar.offsetHeight - 10), behavior: 'smooth' });
}
// The graph matters while setting up and finding reps; for results, figures and exports it folds away (one click brings it back).
const GRAPH_TABS = ['setup', 'events', 'steps', 'fatigue', 'onoff', 'ror'];
function graphFold() {
  const t = curTab(), card = $('traceCard'), btn = $('graphTgl');
  const open = A.graphOpen !== undefined && A.graphTab === t ? A.graphOpen : GRAPH_TABS.includes(t);
  const was = card.classList.contains('folded');
  card.classList.toggle('folded', !open);
  btn.textContent = open ? 'Hide the graph' : 'Show the graph';
  if (was && open && A.R && A.R.ok) redraw();
}
// Back and Next, the short "what's happening / what to do" box for each step, and the caption above the graph.
function stepGuide() {
  const t = curTab(), j = STEPS.indexOf(t), w = W(), back = $('stepBack'), next = $('stepNext');
  const prev = j > 0 ? STEPS[j - 1] : j < 0 ? 'results' : null, nxt = j >= 0 && j < STEPS.length - 1 ? STEPS[j + 1] : null;
  back.classList.toggle('hide', !prev); next.classList.toggle('hide', !nxt);
  if (prev) back.innerHTML = '&lsaquo; Back' + (j < 0 ? ' to Results' : '');
  if (nxt) next.innerHTML = 'Next: ' + STEP_NAME[nxt] + ' &rsaquo;';
  back.onclick = () => prev && showTab(prev); next.onclick = () => nxt && showTab(nxt);
  const I = intro(t, w);
  $('stepIntro').innerHTML = I ? '<div class="si"><p class="what">' + I[0] + '</p><p class="do">' + I[1] + '</p>' + (I[2] ? '<details><summary>Why?</summary><p>' + I[2] + '</p></details>' : '') + '</div>' : '';
  const cap = $('graphCap'); if (cap) cap.innerHTML = caption(t, w);
  if (A.graphTab !== t) { A.graphTab = t; A.graphOpen = undefined; }
  graphFold();
  const fb = $('introFind');
  if (fb) fb.onclick = () => { const b = [...document.querySelectorAll('#ptsBox button')].find((x) => /^Find /.test(x.textContent.trim())); if (b) b.click(); };
}
function intro(t, w) {
  const R = A.R, mv = R && R.ok && R.mvic, norm = SET().norm;
  const ref = norm === 'mvic' ? 'each muscle&rsquo;s MVIC' : norm === 'ref' ? 'each muscle in your reference trial' : norm === 'peak' ? 'each muscle&rsquo;s highest value in the session' : 'nothing (µV)';
  if (t === 'setup') return ['Tell the tool what you recorded and what counts as 100% for each muscle. At the moment 100% = ' + ref + '.',
    mv ? 'This is an MVIC file: tick which muscle it is for, then open a task trial.' : 'Check the muscle names and where 100% comes from. The defaults are usually right, so if it all looks sensible press Next.',
    'Raw EMG (in µV) depends on the skin, the fat underneath and exactly where the sensor sits, so it can&rsquo;t be compared between muscles, people or days. Dividing by a reference (an MVIC or a normal trial of the task) puts every muscle on the same scale.'];
  if (t === 'events') return ['Every result is worked out inside each ' + w.one + ', so the tool needs to know where each one starts and ends.',
    mv ? 'MVIC files don&rsquo;t need ' + w.many + '. Open a task trial instead.' : 'Press <button type="button" class="btn small accent" id="introFind">Find ' + w.many + '</button> then check each shaded box on the graph covers one whole ' + w.one + '. Drag any label that looks wrong, or mark them by hand underneath the graph.',
    'The tool looks at the accelerometer inside the sensor (e.g. the knock of each foot strike, or how far the thigh tilts) to find each ' + w.one + '. It&rsquo;s a good estimate, not a perfect one, which is why you check it by eye.'];
  if (t === 'results') return ['Your results, worked out inside each ' + w.one + ' and then averaged.',
    'Start with the first three: how hard each muscle worked, when it switched on and off, and its average ' + w.one + '. The methods paragraph underneath can go straight into your lab report.',
    'Everything comes from the smoothed envelope shown on the graph. The strip at the top shows what happened to the raw signal to get there.'];
  if (t === 'figure') return ['Build a figure for your lab report from this trial.', 'Pick a view (over time, an average ' + w.one + ' or bars), switch muscles and labels on or off, then save it as a PNG.', ''];
  if (t === 'files') return ['Save your numbers to use in Excel, SPSS or R.', '<strong>Discrete</strong> = one number per ' + w.one + ' (for your statistics). <strong>Continuous</strong> = the whole curve (for graphs).', ''];
  if (t === 'compare') return ['Line up every trial in the session (e.g. 9 vs 12 km/h, or RDL vs Nordic).', 'Name each trial&rsquo;s exercise or condition in your file list first, so trials with the same name are grouped.', ''];
  return null;
}
function caption(t, w) {
  if (t === 'setup') return '<strong>What you&rsquo;re looking at:</strong> each coloured lane is one muscle&rsquo;s activity (its smoothed envelope). The bottom lane is the movement signal from the sensor. Press <strong>Raw EMG</strong> above the graph to see the signal before processing.';
  if (t === 'events') return '<strong>What you&rsquo;re looking at:</strong> each shaded box is one ' + w.one + ' the tool found. Each box should cover one whole ' + w.one + '. Drag a label to move it.';
  return '<strong>What you&rsquo;re looking at:</strong> the whole trial. The results come from inside each shaded ' + w.one + '.';
}

// ---------- demo: a hamstring session (7 MVICs, a Romanian deadlift and a Nordic hamstring exercise) ----------
const MV = [['SM_Flex', 'R SEMIMEMBRANOSUS'], ['SM_Ext', 'R SEMIMEMBRANOSUS'], ['ST_Flex', 'R SEMITENDINOSUS'], ['ST_Ext', 'R SEMITENDINOSUS'], ['BF_Flex', 'R BICEPS FEMORIS'], ['BF_Ext_1', 'R BICEPS FEMORIS'], ['BF_Ext_2', 'R BICEPS FEMORIS']];
const SM = 'R SEMIMEMBRANOSUS', ST = 'R SEMITENDINOSUS', BF = 'R BICEPS FEMORIS';
const reps = (pairs) => [].concat(...pairs.map(([a, b]) => [{ type: 'rep0', t: a }, { type: 'rep1', t: b }]));
const MARKS = {
  RDL: reps([[2.39, 4.919], [4.92, 7.199], [7.2, 9.539], [9.54, 12.079], [12.08, 15.199], [15.2, 17.0]]),
  NHE: reps([[1.2, 5.88], [6.4, 11.4], [11.53, 15.85], [15.86, 20.0]]).concat(
    [4.563, 10.388, 14.729, 19.103].map((t) => ({ type: 'phase', t })),
    [{ type: 'rest0', t: 5.95 }, { type: 'rest1', t: 6.35 }],
    [[SM, 2.624, 5.313], [ST, 1.934, 5.493], [BF, 1.529, 5.325], [SM, 7.877, 10.948], [ST, 7.598, 10.98], [BF, 7.144, 10.984]].flatMap(([m, a, b]) => [{ type: 'on', m, t: a }, { type: 'off', m, t: b }]))
};
async function demo(marked) {
  try {
    if (A.session.trials.length && !confirm('Load the demo session? It replaces the files open now (save a project file first if you want to keep them).')) return;
    A.session = { trials: [], cur: -1, muscles: {}, set: defaultSet() }; forget();
    if (marked) A.session.set.phaseNames = ['Lowering', 'Catch and return', 'Phase 3', 'Phase 4'];
    const get = async (f) => { const r = await fetch('demo/' + f); if (!r.ok) throw new Error(f + ' not found'); return r.text(); };
    for (let j = 0; j < MV.length; j++) {
      status('Loading the demo: MVIC ' + (j + 1) + ' of ' + MV.length + '&hellip;');
      addText(await get('demo-mvic-' + MV[j][0] + '.txt'), 'MVIC_' + MV[j][0] + '.txt', { role: 'mvic', mvicFor: [MV[j][1]], labels: { athlete: 'Demo', trial: '' } });
    }
    for (const ex of ['RDL', 'NHE']) {
      status('Loading the demo: ' + ex + '&hellip;');
      addText(await get('demo-' + ex + '.txt'), ex + '.txt', { role: 'task', labels: { athlete: 'Demo', condition: ex === 'RDL' ? 'Romanian deadlift' : 'Nordic hamstring', trial: '1' }, points: marked ? MARKS[ex] : [] });
    }
    persist();
    openTrial(A.session.trials.length - (marked ? 1 : 2));
    status(marked ? 'Demo loaded with the reps already marked (and, in the Nordic, onsets and offsets for the first two reps). Look through <strong>Step 3 (Results)</strong>, then try marking the rest yourself.' : 'Demo loaded: 7 MVIC files and two exercises. Start with the <strong>Romanian deadlift</strong>: open <strong>Step 2 (Reps and phases)</strong> and press <strong>Find reps</strong>.');
  } catch (e) { status('<span class="bad">Could not load the demo (' + esc(e.message) + '). Demos need the tool to be opened from a web address, not straight from a file.</span>'); }
}

async function start() {
  $('ver').textContent = 'v' + VERSION;
  loadPrefs();
  Object.assign(A.fn, {
    refresh, openTrial, showTab, references,
    laneChanged: () => { redraw(); const t = curTab(); if (t === 'events') renderPoints(); if (t === 'fatigue') renderFatigue(); if (t === 'steps') renderSteps(); },
    viewChanged: () => { const t = curTab(); if (t === 'steps') stepsView(); if (t === 'fatigue') renderFatigue(); if (t === 'figure') figureViewChanged(); },
    cursorMoved: () => {}
  });
  initTrace(); initSession(); initExport();
  document.querySelectorAll('#stepbar .tab[data-t]').forEach((b) => b.addEventListener('click', () => showTab(b.getAttribute('data-t'))));
  $('graphTgl').addEventListener('click', () => { const card = $('traceCard'); A.graphTab = curTab(); A.graphOpen = card.classList.contains('folded'); graphFold(); });
  $('deepBtn').addEventListener('click', function () { const on = $('stepbar').classList.toggle('showdeep'); this.setAttribute('aria-expanded', String(on)); });
  $('demoSel').addEventListener('change', function () { const k = this.value; this.value = ''; if (k) demo(k === 'marked'); });
  const saved = await restoreSession();
  if (saved) {
    A.session = { trials: saved.trials, cur: saved.cur, muscles: saved.muscles || {}, set: Object.assign(defaultSet(), saved.set || {}) };
    openTrial(Math.max(0, Math.min(saved.trials.length - 1, saved.cur || 0)));
    status('Your last session was restored (' + saved.trials.length + ' file' + (saved.trials.length > 1 ? 's' : '') + ').');
  } else openTrial(-1);
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; $('installBtn').classList.remove('hide'); });
  $('installBtn').addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('installBtn').classList.add('hide'); });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.__EMG = A;
}
start();
