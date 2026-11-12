// Start-up: wires the page together. Jumps use the automatic jump analysis (analyse.js); everything else
// (walking, running, landing, isometric, any force-time data) uses points marked by hand (generic.js).
import { A, $, esc, status, persist, restoreSession, loadPrefs, savePrefs, VERSION, trialLabel } from './state.js?v=2.2.0';
import { buildData } from './parse.js?v=2.2.0';
import { analyse, JUMPS } from './analyse.js?v=2.2.0';
import { computeVars, display } from './vars.js?v=2.2.0';
import { initTrace, redraw, setView, jumpRange, cursorChanged, togglePlay } from './trace.js?v=2.2.0';
import { initInteg, refreshInteg, integCursor, render as renderInteg } from './integ.js?v=2.2.0';
import { initFilter, renderFilter, syncFilterInputs } from './filterview.js?v=2.2.0';
import { keyStats, warnings, renderResults } from './results.js?v=2.2.0';
import { initEvents, renderEvents } from './events.js?v=2.2.0';
import { initSetup, syncSetup } from './setup.js?v=2.2.0';
import { initSession, renderSession, addText, splitTrial } from './session.js?v=2.2.0';
import { initCompare, renderCompare, analyseTrial } from './compare.js?v=2.2.0';
import { initExport } from './export.js?v=2.2.0';
import { analyseGeneric, TYPES } from './generic.js?v=2.2.0';
import { initGTrace, gRedraw, setGView, wholeRange, gCursorChanged } from './gtrace.js?v=2.2.0';
import { renderPoints } from './gpanel.js?v=2.2.0';
import { renderFigBuilder } from './figbuild.js?v=2.2.0';

const isJump = () => !A.S || !A.S.set.type || A.S.set.type === 'jump';

// ---------- analysis and redrawing ----------
function refresh(o) {
  o = o || {};
  const S = A.S;
  if (!S) { A.D = null; A.R = null; A.V = []; showEmpty(true); return; }
  showEmpty(false);
  const jump = isJump();
  try {
    if (o.rebuild || !A.D) A.D = buildData(S.P, S.map, S.fs);
    if (!(A.D.fs > 0)) A.R = { ok: false, error: 'The sample rate is not in the file. Enter it in Setup &rarr; Plates, columns and sample rate.' };
    else A.R = jump ? analyse(A.D, S.set) : analyseGeneric(A.D, S.set, S.set.axes || A.axes);
  } catch (e) { A.R = { ok: false, error: 'Could not analyse this file: ' + esc(e.message || e) }; }
  A.V = A.R.ok ? (A.R.generic ? A.R.V : computeVars(A.R, S.set)) : [];
  // units need a bodyweight
  const noBW = A.R.generic && !(A.R.BW > 0);
  $('units').disabled = noBW; if (noBW && A.units !== 'N') { A.unitsWas = A.units; A.units = 'N'; $('units').value = 'N'; }
  else if (!noBW && A.unitsWas) { A.units = A.unitsWas; A.unitsWas = null; $('units').value = A.units; }
  $('units').title = noBW ? 'Needs a bodyweight: mark a still period in 2. Points, or type a body mass in 1. Setup.' : '';
  if (A.R.ok && (!o.keepView || !A.view)) A.view = jump ? jumpRange() : wholeRange();
  if (!A.R.ok && A.D && A.D.fs > 0) A.view = A.view || { x0: 0, x1: (A.D.n - 1) / A.D.fs };
  if (A.D && A.cursor >= A.D.n) A.cursor = -1;
  layout(jump);
  if (A.R.ok) { if (jump) redraw(); else gRedraw(); }
  keyStats(); warnings();
  if (jump) renderEvents(); else renderPoints();
  if (!o.quick) {
    syncSetup(); if (jump) refreshInteg(); renderFilter(); renderResults(); showChips();
    const cur = $('panel').querySelector('.tab[aria-selected=true]'); if (cur && cur.getAttribute('data-t') === 'compare') renderCompare();
    if (cur && cur.getAttribute('data-t') === 'figure') renderFigBuilder();
    sessionSummaries();
    if (!o.keepStatus) status(!A.R.ok ? '<span class="bad">' + A.R.error + '</span>'
      : jump ? JUMPS[A.R.jump] + ' analysed. ' + (A.R.warnings.length ? '<span class="bad">Check the notes under the graph.</span>' : 'Hover over the graph to explore it, or press <strong>Play the jump</strong>.')
        : TYPES[A.R.type] + '. ' + (A.R.points.length ? A.R.windows.length + ' window' + (A.R.windows.length === 1 ? '' : 's') + ' so far; results are in <strong>3. Results</strong>.' : 'Now mark the points by hand in <strong>2. Points</strong>.'));
  } else if (jump) renderInteg(); else { renderResults(); }
}
function layout(jump) {
  const ok = A.R && A.R.ok;
  $('traceWrap').classList.toggle('hide', !(ok && jump));
  $('gWrap').classList.toggle('hide', !(ok && !jump));
  $('gPts').classList.toggle('hide', jump); $('jumpEv').classList.toggle('hide', !jump);
  $('tabPts').textContent = jump ? '2. Events' : '2. Points';
  $('tabInteg').classList.toggle('hide', !jump);
  $('xGen').classList.toggle('hide', jump); $('xGenHelp').classList.toggle('hide', jump);
  $('xJump').classList.toggle('hide', !jump); $('xJumpHelp').classList.toggle('hide', !jump); $('xPngI').classList.toggle('hide', !jump);
  if (!jump && document.querySelector('#panel .tab[data-t=integ]').getAttribute('aria-selected') === 'true') showTab('setup');
}
function showEmpty(on) { $('empty').classList.toggle('hide', !on); if (on) { $('traceWrap').classList.add('hide'); $('gWrap').classList.add('hide'); $('keyStats').innerHTML = ''; $('warnBox').innerHTML = ''; $('readout').innerHTML = ''; $('trialName').textContent = ''; } }

function openTrial(k) {
  if (A.play.on) togglePlay(false);
  A.session.cur = k;
  A.S = A.session.trials[k] || null;
  A.D = null; A.R = null; A.cursor = -1; A.pinned = false; A.view = null;
  if (A.S) syncFilterInputs();
  refresh();
  renderSession();
  $('trialName').textContent = A.S ? '(' + trialLabel(A.S) + ')' : '';
  persist();
}
function sessionSummaries() {
  A.session.trials.forEach((t, k) => {
    const { R, V } = analyseTrial(t);
    let s = '';
    if (!R.ok) s = '<span class="bad">check</span>';
    else if (R.generic) { const w = R.windows.length; s = w ? w + ' window' + (w === 1 ? '' : 's') : '<span class="muted">no points yet</span>'; const v = V.find((x) => x.key1 && /_pk$/.test(x.key)) || V.find((x) => x.key1); if (v) { const d = display(v.type, v.value, 'N', R); s += ', ' + (v.short || v.name) + ' ' + d.val + ' ' + d.unit; } }
    else if (R.jump === 'slj' && R.vh) s = R.jump === 'slj' && R.vh ? 'horizontal ' + R.vh[R.TO].toFixed(2) + ' m/s at ' + (Math.atan2(R.v[R.TO], R.vh[R.TO]) * 180 / Math.PI).toFixed(0) + '&deg;' : '';
    else { const tov = R.v[R.TO]; s = tov > 0 ? (tov * tov / 19.62 * 100).toFixed(1) + ' cm' : ''; if (R.jump === 'dj' && R.LD > 0) s += ', RSI ' + ((9.81 * ((R.LD - R.TO) / R.fs) ** 2 / 8) / ((R.TO - R.TD) / R.fs)).toFixed(2); }
    t._sum = s; const el = $('sesRes' + k); if (el) el.innerHTML = s;
  });
}

// ---------- show chips ----------
function showChips() {
  const el = $('showChips'); const R = A.R;
  if (!R || !R.ok) { el.innerHTML = ''; return; }
  let items, store;
  if (R.generic) {
    store = A.gshow;
    const multi = R.used.length > 1, has = (k) => R.ch.some((c) => c.kind === k);
    items = multi ? [[R.type === 'walk' || R.type === 'run' ? 'totG' : 'tot', 'Total Fz'], ['plates', 'Each plate Fz']] : [];
    if (has('ap')) items.push(['ap', 'Front–back']); if (has('ml')) items.push(['ml', 'Side to side']);
    if (has('fx')) items.push(['fx', 'Fx']); if (has('fy')) items.push(['fy', 'Fy']);
    items.push(['wins', 'Windows']);
  } else {
    store = A.show;
    const multi = R.plates.length > 1, hasX = R.plates.some((p) => p.fx), hasY = R.plates.some((p) => p.fy);
    items = [['total', multi ? 'Total Fz' : 'Fz']];
    if (multi) items.push(['plates', 'Each plate']);
    if (hasX) items.push(['fx', 'Fx']); if (hasY) items.push(['fy', 'Fy']);
    if (R.filtered) items.push(['raw', 'Raw']);
    items.push(['phases', 'Phases'], ['impulse', 'Net impulse'], ['figure', 'Jumper']);
  }
  el.innerHTML = items.map(([k, l]) => '<button type="button" class="chip' + (store[k] ? ' active' : '') + '" data-s="' + k + '" aria-pressed="' + !!store[k] + '">' + l + '</button>').join('');
  el.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => { const k = b.getAttribute('data-s'); store[k] = !store[k]; persist(); showChips(); if (R.generic) gRedraw(); else redraw(); }));
}

// ---------- tabs ----------
function showTab(t) {
  document.querySelectorAll('#panel .tab').forEach((b) => b.setAttribute('aria-selected', String(b.getAttribute('data-t') === t)));
  document.querySelectorAll('#panel .pane').forEach((p) => p.classList.toggle('hide', p.getAttribute('data-p') !== t));
  if (t === 'integ') refreshInteg();
  if (t === 'filter') renderFilter();
  if (t === 'compare') renderCompare();
  if (t === 'figure') renderFigBuilder();
  if (t === 'results') renderResults();
  if (t === 'events') { if (isJump()) renderEvents(); else renderPoints(); }
}

// ---------- demos ----------
const DEMOS = {
  cmj: { file: 'demo/demo-cmj.txt', labels: { athlete: 'Demo', condition: 'CMJ', trial: '1' }, set: { type: 'jump', jump: 'cmj' } },
  sj: { file: 'demo/demo-squat-jump.txt', labels: { athlete: 'Demo', condition: 'Squat jump', trial: '1' }, set: { type: 'jump', jump: 'sj' } },
  dj: { file: 'demo/demo-drop-jump.txt', labels: { athlete: 'Demo', condition: 'Drop jump', trial: '1' }, set: { type: 'jump', jump: 'dj' } },
  slj: { file: 'demo/demo-slj.txt', labels: { athlete: 'Demo', condition: 'Standing long jump', trial: '1' }, set: { type: 'jump', jump: 'slj' } },
  slj1: { file: 'demo/demo-slj-single-leg.txt', labels: { athlete: 'Demo', condition: 'Standing long jump, left leg', trial: '1' }, set: { type: 'jump', jump: 'slj' } },
  imtp: { file: 'demo/demo-imtp.txt', labels: { athlete: 'Demo', condition: 'IMTP', trial: '1' }, set: { type: 'iso' } },
  walk: { file: 'demo/demo-walk-two-plates.txt', labels: { athlete: 'Demo', condition: 'Walking', trial: '1' }, set: { type: 'walk' } },
  walk4: { file: 'demo/demo-walk-four-trials.txt', labels: { athlete: 'Demo', condition: 'Walking (right foot)', trial: '' }, set: { type: 'walk' } }
};
async function demo(k) {
  try {
    status('Loading the demo&hellip;');
    const r = await fetch(DEMOS[k].file); if (!r.ok) throw new Error('not found');
    const txt = await r.text();
    addText(txt, DEMOS[k].file.split('/').pop(), null, { labels: DEMOS[k].labels, set: DEMOS[k].set });
    openTrial(A.session.trials.length - 1);
  } catch (e) { status('<span class="bad">Could not load the demo (' + esc(e.message) + '). Demos need the tool to be opened from a web address, not straight from a file.</span>'); }
}

async function start() {
  $('ver').textContent = 'v' + VERSION;
  loadPrefs();
  $('units').value = A.units;
  Object.assign(A.fn, {
    refresh, openTrial, showTab, splitTrial,
    setView: (a, b) => (isJump() ? setView(a, b) : setGView(a, b)),
    cursorChanged: () => (isJump() ? cursorChanged() : gCursorChanged()),
    zoomJump: () => { if (A.R && A.R.ok && !A.R.generic) { const r = jumpRange(); setView(r.x0, r.x1); } },
    viewChanged: () => { renderFilter(); if (isJump()) renderInteg(); },
    cursorMoved: () => integCursor(),
    labelsChanged: () => { $('trialName').textContent = A.S ? '(' + trialLabel(A.S) + ')' : ''; },
    playStopped: () => {}
  });
  initTrace(); initGTrace(); initInteg(); initFilter(); initEvents(); initSetup(); initSession(); initCompare(); initExport();
  document.querySelectorAll('#panel .tab').forEach((b) => b.addEventListener('click', () => showTab(b.getAttribute('data-t'))));
  $('units').addEventListener('change', function () { A.units = this.value; A.unitsWas = null; savePrefs(); if (A.R && A.R.ok) { if (A.R.generic) gRedraw(); else { redraw(); cursorChanged(); } keyStats(); renderResults(); } });
  $('demoSel').addEventListener('change', function () { const k = this.value; this.value = ''; if (k) demo(k); });
  const saved = await restoreSession();
  if (saved) {
    saved.trials.forEach((t) => { if (!t.set.type) t.set.type = 'jump'; if (!t.set.g) t.set.g = { points: [], windows: [] }; });
    A.session = saved; openTrial(Math.max(0, Math.min(saved.trials.length - 1, saved.cur || 0))); status('Your last session was restored (' + saved.trials.length + ' trial' + (saved.trials.length > 1 ? 's' : '') + ').');
  } else openTrial(-1);
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; $('installBtn').classList.remove('hide'); });
  $('installBtn').addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('installBtn').classList.add('hide'); });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.__FA = A;
}
start();
