// Start-up: wires the page together.
import { A, $, esc, status, persist, restoreSession, loadPrefs, savePrefs, VERSION, trialLabel, muscle, defaultSet } from './state.js?v=1.0.0';
import { analyse, references, forget } from './emg.js?v=1.0.0';
import { initTrace, redraw, wholeRange } from './trace.js?v=1.0.0';
import { renderPoints } from './points.js?v=1.0.0';
import { renderResults } from './results.js?v=1.0.0';
import { renderSetup } from './setup.js?v=1.0.0';
import { initSession, renderSession, addText } from './session.js?v=1.0.0';
import { renderCompare } from './compare.js?v=1.0.0';
import { initExport } from './export.js?v=1.0.0';
import { renderSteps, stepsView, renderFatigue, renderRor } from './deeper.js?v=1.0.0';

const curTab = () => { const b = $('panel').querySelector('.tab[aria-selected=true]'); return b ? b.getAttribute('data-t') : 'setup'; };

// ---------- analysis and redrawing ----------
function refresh(o) {
  o = o || {};
  const S = A.S;
  if (!S) { A.R = null; showEmpty(true); renderTab(); return; }
  showEmpty(false);
  try { A.R = analyse(S); } catch (e) { A.R = { ok: false, error: 'Could not analyse this file: ' + esc(e.message || e) }; console.error(e); }
  const ok = A.R.ok;
  if (ok && (!o.keepView || !A.view)) A.view = wholeRange();
  if (ok && A.cursor >= A.R.n) A.cursor = -1;
  if (ok && A.lane >= A.R.pr.ch.length) A.lane = -1;
  $('traceWrap').classList.toggle('hide', !ok);
  if (ok) redraw();
  $('tabPts').textContent = S.role === 'mvic' ? '2. Points (optional)' : '2. Points';
  if (o.quick) { if (curTab() === 'results') renderResults(); if (curTab() === 'events') renderPoints(); return; }
  showChips(); renderSession(); renderTab(); sessionSummaries(); badge();
  if (!o.keepStatus) status(!ok ? '<span class="bad">' + A.R.error + '</span>' : nextStep());
}
// One clear next step for the student.
function nextStep() {
  const R = A.R, t = A.S, set = A.session.set;
  if (R.mvic) return (t.mvicFor && t.mvicFor.length) ? 'MVIC file for <strong>' + t.mvicFor.map((k) => esc(muscle(k).short)).join(', ') + '</strong>. Nothing to mark: open a task trial next.' : 'This is an MVIC file. Tick which muscle it is for in <strong>1. Setup</strong>.';
  if (set.norm === 'mvic' && R.missing.length) return 'No MVIC yet for <strong>' + R.missing.map((k) => esc(muscle(k).short)).join(', ') + '</strong>: add the MVIC files (and set their Type to MVIC) so the EMG can be shown as %MVIC.';
  if (!R.reps.length) return 'Next: mark each rep in <strong>2. Points</strong> (click the graph, then <strong>Rep start</strong> and <strong>Rep end</strong>).';
  return R.reps.length + ' rep' + (R.reps.length > 1 ? 's' : '') + ' marked. Results are in <strong>3. Results</strong>; mark onsets and offsets for timing, order and co-contraction.';
}
function badge() { const R = A.R; $('tabRes').textContent = '3. Results' + (R && R.ok && !R.mvic && R.reps.length ? ' (' + R.reps.length + ' rep' + (R.reps.length > 1 ? 's' : '') + ')' : ''); }
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
      } else if (t === A.S && A.R && A.R.ok) s = A.R.reps.length ? A.R.reps.length + ' rep' + (A.R.reps.length > 1 ? 's' : '') : '<span class="muted">no reps yet</span>';
      else { const n = (t.points || []).filter((p) => p.type === 'rep0').length; s = n ? n + ' rep start' + (n > 1 ? 's' : '') : '<span class="muted">no reps yet</span>'; }
    } catch (e) { s = ''; }
    t._sum = s; const el = $('sesRes' + k); if (el) el.innerHTML = s;
  });
}

// ---------- chips ----------
function showChips() {
  const el = $('showChips'); const R = A.R;
  if (!R || !R.ok) { el.innerHTML = ''; return; }
  const items = [['raw', 'Raw EMG']];
  const sensors = Object.keys(R.pr.acc);
  if (sensors.length) items.push(['acc', 'Accelerometer']);
  if (!R.mvic) items.push(['reps', 'Reps'], ['guide', 'Onset guide']);
  el.innerHTML = items.map(([k, l]) => '<button type="button" class="chip' + (A.show[k] ? ' active' : '') + '" data-s="' + k + '" aria-pressed="' + !!A.show[k] + '">' + l + '</button>').join('')
    + (sensors.length > 1 && A.show.acc ? '<select id="accSel" class="mini" title="Which sensor&rsquo;s accelerometer">' + sensors.map((s) => '<option value="' + esc(s) + '"' + (A.show.accSensor === s ? ' selected' : '') + '>' + esc(muscle(s).short || s) + ' sensor</option>').join('') + '</select>' : '');
  el.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => {
    const k = b.getAttribute('data-s'); A.show[k] = !A.show[k]; savePrefs(); showChips(); redraw();
    if (k === 'guide' && A.show.guide && !R.rest) status('The onset guide needs a rest period: mark <strong>Rest start</strong> and <strong>Rest end</strong> in <strong>2. Points</strong> (section 3).');
  }));
  if ($('accSel')) $('accSel').addEventListener('change', function () { A.show.accSensor = this.value; savePrefs(); redraw(); });
}

// ---------- tabs ----------
function renderTab() {
  const t = curTab();
  if (t === 'setup') renderSetup();
  if (t === 'events') renderPoints();
  if (t === 'results') renderResults();
  if (t === 'compare') renderCompare();
  if (t === 'steps') renderSteps();
  if (t === 'fatigue') renderFatigue();
  if (t === 'ror') renderRor();
}
function showTab(t) {
  document.querySelectorAll('#panel .tab').forEach((b) => b.setAttribute('aria-selected', String(b.getAttribute('data-t') === t)));
  document.querySelectorAll('#panel .pane').forEach((p) => p.classList.toggle('hide', p.getAttribute('data-p') !== t));
  renderTab();
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
    status(marked ? 'Demo loaded with the reps already marked (and, in the Nordic, onsets and offsets for the first two reps). Look through <strong>3. Results</strong>, then try marking the rest yourself.' : 'Demo loaded: 7 MVIC files and two exercises. Start with the <strong>Romanian deadlift</strong>: mark each rep in <strong>2. Points</strong>.');
  } catch (e) { status('<span class="bad">Could not load the demo (' + esc(e.message) + '). Demos need the tool to be opened from a web address, not straight from a file.</span>'); }
}

async function start() {
  $('ver').textContent = 'v' + VERSION;
  loadPrefs();
  Object.assign(A.fn, {
    refresh, openTrial, showTab, references,
    laneChanged: () => { redraw(); const t = curTab(); if (t === 'events') renderPoints(); if (t === 'fatigue') renderFatigue(); if (t === 'steps') renderSteps(); },
    viewChanged: () => { const t = curTab(); if (t === 'steps') stepsView(); if (t === 'fatigue') renderFatigue(); },
    cursorMoved: () => {}
  });
  initTrace(); initSession(); initExport();
  document.querySelectorAll('#panel .tab').forEach((b) => b.addEventListener('click', () => showTab(b.getAttribute('data-t'))));
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
