// Start-up: wires the page together.
import { A, $, esc, status, persist, restoreSession, loadPrefs, VERSION, LEVELS, trialLabel } from './state.js?v=1.0.0';
import { buildData } from './parse.js?v=1.0.0';
import { analyse, JUMPS } from './analyse.js?v=1.0.0';
import { computeVars, display } from './vars.js?v=1.0.0';
import { initTrace, redraw, setView, jumpRange, cursorChanged, togglePlay } from './trace.js?v=1.0.0';
import { initInteg, refreshInteg, integCursor, render as renderInteg } from './integ.js?v=1.0.0';
import { initFilter, renderFilter, syncFilterInputs } from './filterview.js?v=1.0.0';
import { keyStats, warnings, renderResults } from './results.js?v=1.0.0';
import { initEvents, renderEvents } from './events.js?v=1.0.0';
import { initSetup, syncSetup } from './setup.js?v=1.0.0';
import { initSession, renderSession, addText } from './session.js?v=1.0.0';
import { initCompare, renderCompare, analyseTrial } from './compare.js?v=1.0.0';
import { initExport } from './export.js?v=1.0.0';

// ---------- analysis and redrawing ----------
function refresh(o) {
  o = o || {};
  const S = A.S;
  if (!S) { A.D = null; A.R = null; A.V = []; showEmpty(true); return; }
  showEmpty(false);
  try {
    if (o.rebuild || !A.D) A.D = buildData(S.P, S.map, S.fs);
    if (!(A.D.fs > 0)) { A.R = { ok: false, error: 'The sample rate is not in the file. Enter it in Setup &rarr; Sample rate.' }; }
    else A.R = analyse(A.D, S.set);
  } catch (e) { A.R = { ok: false, error: 'Could not analyse this file: ' + esc(e.message || e) }; }
  A.V = A.R.ok ? computeVars(A.R, S.set) : [];
  if (A.R.ok && (!o.keepView || !A.view)) { const r = jumpRange(); A.view = r; }
  if (!A.R.ok && A.D && A.D.fs > 0) A.view = A.view || { x0: 0, x1: (A.D.n - 1) / A.D.fs };
  if (A.D && A.cursor >= A.D.n) A.cursor = -1;
  $('traceWrap').classList.toggle('hide', !A.R.ok);
  if (A.R.ok) redraw();
  keyStats(); warnings(); renderEvents();
  if (!o.quick) {
    syncSetup(); refreshInteg(); renderFilter(); renderResults(); showChips();
    const cur = $('panel').querySelector('.tab[aria-selected=true]'); if (cur && cur.getAttribute('data-t') === 'compare') renderCompare();
    sessionSummaries();
    status(A.R.ok ? JUMPS[A.R.jump] + ' analysed. ' + (A.R.warnings.length ? '<span class="bad">Check the notes under the graph.</span>' : 'Hover over the graph to explore it, or press <strong>Play the jump</strong>.') : '<span class="bad">' + A.R.error + '</span>');
  } else renderInteg();
}
function showEmpty(on) { $('empty').classList.toggle('hide', !on); $('traceWrap').classList.toggle('hide', on); if (on) { $('keyStats').innerHTML = ''; $('warnBox').innerHTML = ''; $('trialName').textContent = ''; } }

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
    const { R } = analyseTrial(t);
    let s = '';
    if (!R.ok) s = '<span class="bad">check</span>';
    else { const tov = R.v[R.TO]; s = tov > 0 ? (tov * tov / 19.62 * 100).toFixed(1) + ' cm' : ''; if (R.jump === 'dj' && R.LD > 0) s += ', RSI ' + ((9.81 * ((R.LD - R.TO) / R.fs) ** 2 / 8) / ((R.TO - R.TD) / R.fs)).toFixed(2); }
    t._sum = s; const el = $('sesRes' + k); if (el) el.innerHTML = s;
  });
}

// ---------- show chips ----------
function showChips() {
  const el = $('showChips'); const R = A.R;
  if (!R || !R.ok) { el.innerHTML = ''; return; }
  const multi = R.plates.length > 1, hasX = R.plates.some((p) => p.fx), hasY = R.plates.some((p) => p.fy);
  const items = [['total', multi ? 'Total Fz' : 'Fz']];
  if (multi) items.push(['plates', 'Each plate']);
  if (hasX) items.push(['fx', 'Fx']);
  if (hasY) items.push(['fy', 'Fy']);
  if (R.filtered) items.push(['raw', 'Raw']);
  items.push(['phases', 'Phases'], ['impulse', 'Net impulse'], ['figure', 'Jumper']);
  el.innerHTML = items.map(([k, l]) => '<button type="button" class="chip' + (A.show[k] ? ' active' : '') + '" data-s="' + k + '" aria-pressed="' + !!A.show[k] + '">' + l + '</button>').join('');
  el.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => { const k = b.getAttribute('data-s'); A.show[k] = !A.show[k]; persist(); showChips(); redraw(); }));
}

// ---------- tabs ----------
function showTab(t) {
  document.querySelectorAll('#panel .tab').forEach((b) => b.setAttribute('aria-selected', String(b.getAttribute('data-t') === t)));
  document.querySelectorAll('#panel .pane').forEach((p) => p.classList.toggle('hide', p.getAttribute('data-p') !== t));
  if (t === 'integ') refreshInteg();
  if (t === 'filter') renderFilter();
  if (t === 'compare') renderCompare();
  if (t === 'results') renderResults();
  if (t === 'events') renderEvents();
}

// ---------- demos ----------
const DEMOS = {
  cmj: { file: 'demo/demo-cmj.txt', labels: { athlete: 'Demo', condition: 'CMJ', trial: '1' } },
  sj: { file: 'demo/demo-squat-jump.txt', labels: { athlete: 'Demo', condition: 'Squat jump', trial: '1' } },
  dj: { file: 'demo/demo-drop-jump.txt', labels: { athlete: 'Demo', condition: 'Drop jump', trial: '1' } }
};
async function demo(k) {
  try {
    status('Loading the demo…');
    const r = await fetch(DEMOS[k].file); if (!r.ok) throw new Error('not found');
    const txt = await r.text();
    addText(txt, DEMOS[k].file.split('/').pop(), null, { labels: DEMOS[k].labels, set: { jump: k } });
    openTrial(A.session.trials.length - 1);
  } catch (e) { status('<span class="bad">Could not load the demo (' + esc(e.message) + '). Demos need the tool to be opened from a web address, not straight from a file.</span>'); }
}

// ---------- level ----------
function setLevel(l) {
  A.level = l; $('level').value = String(l); persist();
  if (A.R && A.R.ok) { redraw(); keyStats(); renderResults(); syncSetup(); refreshInteg(); }
  if (document.querySelector('#panel .tab[aria-selected=true]').getAttribute('data-t') === 'compare') renderCompare();
}

async function start() {
  $('ver').textContent = 'v' + VERSION;
  loadPrefs();
  $('level').value = String(A.level); $('units').value = A.units;
  Object.assign(A.fn, { refresh, openTrial, setView, cursorChanged, showTab, zoomJump: () => { if (A.R && A.R.ok) { const r = jumpRange(); setView(r.x0, r.x1); } },
    viewChanged: () => { renderFilter(); renderInteg(); },
    cursorMoved: () => integCursor(),
    labelsChanged: () => { $('trialName').textContent = A.S ? '(' + trialLabel(A.S) + ')' : ''; },
    playStopped: () => {} });
  initTrace(); initInteg(); initFilter(); initEvents(); initSetup(); initSession(); initCompare(); initExport();
  document.querySelectorAll('#panel .tab').forEach((b) => b.addEventListener('click', () => showTab(b.getAttribute('data-t'))));
  $('level').addEventListener('change', function () { setLevel(+this.value); });
  $('units').addEventListener('change', function () { A.units = this.value; persist(); if (A.R && A.R.ok) { redraw(); keyStats(); renderResults(); cursorChanged(); } });
  $('demoCmj').addEventListener('click', () => demo('cmj'));
  $('demoSj').addEventListener('click', () => demo('sj'));
  $('demoDj').addEventListener('click', () => demo('dj'));
  $('level').title = 'Sets how many results are shown and how much of the maths is explained: ' + Object.values(LEVELS).join(', ');
  const saved = await restoreSession();
  if (saved) { A.session = saved; openTrial(Math.max(0, Math.min(saved.trials.length - 1, saved.cur || 0))); status('Your last session was restored (' + saved.trials.length + ' trial' + (saved.trials.length > 1 ? 's' : '') + ').'); }
  else openTrial(-1);
  // install as an app
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; $('installBtn').classList.remove('hide'); });
  $('installBtn').addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('installBtn').classList.add('hide'); });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  void display;
}
start();
