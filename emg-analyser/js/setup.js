// Tab 1: what the file is (an MVIC or a task trial), the muscles, normalisation and the processing settings.
import { A, $, esc, persist, status, muscle, muscleKeys, SET, defaultSet, MUSCLE_COLS, W } from './state.js?v=1.2.0';
import { references, refPeaks, forget, trialFs } from './emg.js?v=1.2.0';
import { findAll } from './session.js?v=1.2.0';

export function renderSetup() {
  const el = $('setupBox'); const t = A.S;
  if (!t) { el.innerHTML = '<p class="muted">Open a file first.</p>'; return; }
  const set = SET(), keys = t.P.emg.map((e) => e.key), refs = set.norm === 'ref' ? refPeaks() : references();
  let h = '<div class="gridc"><div>';
  h += '<label for="activity">What are you analysing?</label><select id="activity">' + ACTS.map(([v, l]) => '<option value="' + v + '"' + (set.activity === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>'
    + '<p class="muted" style="margin:.25rem 0 0">' + ACT_HELP[set.activity] + '</p>';
  h += '<label for="role">What is this file?</label><select id="role">' + [['task', 'A task trial (a movement to analyse)'], ['ref', 'A reference trial (sets 100% for each muscle, e.g. preferred speed)'], ['mvic', 'An MVIC (maximal effort, to set 100% for a muscle)']].map(([v, l]) => '<option value="' + v + '"' + ((t.role || 'task') === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>';
  if (t.role === 'mvic') {
    h += '<label>This MVIC is for</label><div class="chks">' + keys.map((k) => '<label class="inline"><input type="checkbox" data-mv="' + esc(k) + '"' + ((t.mvicFor || []).includes(k) ? ' checked' : '') + '> ' + esc(muscle(k).short) + '</label>').join('') + '</div>'
      + '<p class="muted" style="margin:.2rem 0">Tick only the muscle(s) this test was <em>for</em>. Other sensors record during the test too, but they are not at their maximum.</p>';
  } else {
    h += '<p class="muted" style="margin:.25rem 0 0">Label it in the Session table above (participant, exercise or condition, and trial number) so Compare can group it.' + (t.role === 'ref' ? ' A reference trial is analysed like any other trial, and sits at 100% in Compare.' : '') + '</p>';
  }
  h += '<h3>Normalise to</h3><select id="norm">' + [['mvic', 'MVIC (% of a maximal voluntary isometric contraction)'], ['ref', 'A reference trial (% of its average ' + W().one + '; Burden, 2010)'], ['peak', 'The highest value in this session&rsquo;s task trials (%)'], ['none', 'Nothing: leave it in µV']].map(([v, l]) => '<option value="' + v + '"' + (set.norm === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>';
  h += '<p class="muted" style="margin:.25rem 0 0">' + (set.norm === 'mvic' ? 'The usual choice for gym exercises. Raw EMG (µV) depends on the skin, the fat under it and exactly where the sensor is, so it cannot be compared between muscles, people or days. Dividing by each muscle&rsquo;s MVIC fixes that (Kamen and Gabriel, 2010).' : set.norm === 'ref' ? 'For running, walking and cycling, where MVICs are hard to get. Set one trial&rsquo;s Type to <strong>Reference</strong> (e.g. 9 km/h, or preferred speed). 100% = the peak of each muscle&rsquo;s average ' + W().one + ' in that trial, so another trial above 100% means the muscle worked harder than in the reference. Dynamic references like this are more reliable than MVICs for gait (Burden, 2010), but they cannot be compared between people on how hard they worked.' : set.norm === 'peak' ? 'Use when there are no MVICs (e.g. people who cannot give a true maximum). Muscles and trials in this session can be compared with each other, but not with other studies, and not between people on how hard they worked.' : 'Only for looking at one muscle in one session (e.g. timing). Do not compare µV between muscles or people.') + '</p>';
  if (set.norm === 'mvic') {
    h += '<label for="refMethod">MVIC reference (100%)</label><select id="refMethod"><option value="peak"' + (set.refMethod === 'peak' ? ' selected' : '') + '>The highest point of the envelope (as the lab MATLAB script)</option><option value="win"' + (set.refMethod === 'win' ? ' selected' : '') + '>The highest mean over a window</option></select>';
    if (set.refMethod === 'win') h += '<div class="row"><div><label for="refWin">Window (ms)</label><input type="number" id="refWin" min="100" max="3000" step="50" value="' + set.refWin + '"></div></div>';
    h += '<p class="muted" style="margin:.25rem 0 0">' + (set.refMethod === 'win' ? 'The steadiest part of the effort (Kamen and Gabriel, 2010, suggest 500 ms or more). It is lower than the peak, so %MVIC values come out higher.' : 'Simple and common. One spike can set it, so check the MVIC files&rsquo; quality checks.') + ' If a muscle has more than one MVIC file, the highest is used.</p>';
  }
  h += '</div><div>';
  // muscles and references
  const hasRef = set.norm === 'mvic' || set.norm === 'ref';
  h += '<h3>Muscles</h3><table><thead><tr><th>Name in the file</th><th>Short name</th>' + (hasRef ? '<th>' + (set.norm === 'ref' ? 'Reference' : 'MVIC') + ' (100%)</th>' : '') + '</tr></thead><tbody>';
  muscleKeys().forEach((k) => {
    const m = muscle(k), r = refs[k];
    const txt = !r ? '<span class="bad">none yet</span>' : set.norm === 'ref' ? '<strong>' + (r.v * 1e6).toFixed(1) + ' µV</strong> ' + (r.n ? 'peak of the average of ' + r.n + ' ' + W().many : '<span class="warnTxt">highest point (mark its ' + W().many + ' to use the average)</span>') + ' in ' + esc(r.names.join(', ')) : '<strong>' + (r.v * 1e6).toFixed(1) + ' µV</strong> from ' + esc(r.name);
    h += '<tr><td class="small"><span class="swatch" style="background:' + m.col + '"></span>' + esc(m.name || k) + '</td><td><input type="text" class="mini" data-mn="' + esc(k) + '" value="' + esc(m.short) + '" style="min-width:4rem;width:6rem"></td>'
      + (hasRef ? '<td class="small">' + txt + '</td>' : '') + '</tr>';
  });
  h += '</tbody></table>';
  if (set.norm === 'mvic' && muscleKeys().some((k) => !refs[k])) h += '<p class="muted">Add each muscle&rsquo;s MVIC file (<strong>Add files</strong>), open it and set <em>What is this file?</em> to MVIC.</p>';
  if (set.norm === 'ref' && muscleKeys().some((k) => !refs[k])) h += '<p class="muted">Set the Type of the reference trial(s) to <strong>Reference</strong> in the Session table. Every muscle needs one.</p>';
  h += '</div></div>';
  // processing
  h += '<details class="more"><summary>Processing: band-pass ' + set.bpLo + '&ndash;' + set.bpHi + ' Hz, rectify, low-pass ' + set.envFc + ' Hz <span class="muted">(change only if you know why)</span></summary>'
    + '<div class="row"><div><label for="bpLo">Band-pass from (Hz)</label><input type="number" id="bpLo" min="1" max="100" step="1" value="' + set.bpLo + '"></div><div><label for="bpHi">to (Hz)</label><input type="number" id="bpHi" min="100" max="1000" step="10" value="' + set.bpHi + '"></div><div><label for="bpOrder">Order</label><input type="number" id="bpOrder" min="1" max="8" step="1" value="' + set.bpOrder + '"></div>'
    + '<div><label for="envFc">Envelope low-pass (Hz)</label><input type="number" id="envFc" min="1" max="100" step="1" value="' + set.envFc + '"></div><div><label for="envOrder">Order</label><input type="number" id="envOrder" min="1" max="8" step="1" value="' + set.envOrder + '"></div></div>'
    + '<div class="row tight"><button type="button" class="btn small ghost" id="procReset">Back to the lab defaults</button></div>'
    + '<p class="muted">Butterworth filters run forwards then backwards (no time lag), as MATLAB&rsquo;s <code>butter</code> and <code>filtfilt</code>. The band-pass keeps the EMG (most of its power is 20&ndash;450 Hz) and removes movement artefact below and noise above it (ISEK; Kamen and Gabriel, 2010). The envelope cut-off sets how smooth the result is: about 6 Hz for slow tasks like these, about 10 Hz for gait, higher if you need timing. Lower cut-offs smooth more, lower the peaks and make onsets look earlier. See <strong>Processing steps</strong> under Go deeper.</p></details>';
  // file details
  const fs = trialFs(t);
  h += '<details class="more"><summary>This file: ' + t.P.emg.length + ' EMG channel' + (t.P.emg.length > 1 ? 's' : '') + ', ' + (fs ? fs.toFixed(fs % 1 ? 3 : 0) + ' Hz' : '<span class="bad">sample rate unknown</span>') + ', ' + (t.P.acc.length ? Object.keys(Object.fromEntries(t.P.acc.map((a) => [a.sensor, 1]))).length + ' accelerometer' + (t.P.acc.length > 3 ? 's' : '') : 'no accelerometers') + '</summary>'
    + '<div class="row"><div><label for="fsIn">Sample rate (Hz)</label><input type="number" id="fsIn" min="1" step="any" value="' + (fs || '') + '"></div>'
    + '<div><label for="scale">The numbers in the file are in</label><select id="scale"><option value="1"' + ((t.scale || 1) === 1 ? ' selected' : '') + '>volts (V)</option><option value="0.001"' + (t.scale === 0.001 ? ' selected' : '') + '>millivolts (mV)</option><option value="0.000001"' + (t.scale === 1e-6 ? ' selected' : '') + '>microvolts (µV)</option></select></div></div>'
    + '<p class="muted">' + (t.P.kind === 'delsys' ? 'Read as a Delsys EMGworks export: the sample rate, units and muscle names come from the file, and processed channels (e.g. RMS) are ignored because the tool starts from the raw EMG.' : 'Read as a general text file. Check the sample rate and units.') + '</p>'
    + (t.P.warnings.length ? '<div class="warn">' + t.P.warnings.map((w) => '<p>' + esc(w) + '</p>').join('') + '</div>' : '') + '</details>';
  el.innerHTML = h;

  $('activity').addEventListener('change', function () {
    set.activity = this.value;
    set.cycleGap = set.activity === 'cycling' ? 0.4 : 0.5;
    const anyMvic = A.session.trials.some((q) => q.role === 'mvic');
    if ((set.activity === 'gait' || set.activity === 'cycling') && set.norm === 'mvic' && !anyMvic) set.norm = 'ref';
    const PH = { gait: ['Stance', 'Swing'], cycling: ['Downstroke', 'Upstroke'] }, dflt = defaultSet().phaseNames;
    if (set.phaseNames.slice(0, 2).every((n, j) => n === dflt[j] || Object.values(PH).some((p) => p[j] === n))) set.phaseNames = (PH[set.activity] || dflt.slice(0, 2)).concat(dflt.slice(2));
    let n = 0; if (set.activity === 'gait' || set.activity === 'cycling') n = findAll(A.session.trials);
    forget(); after('Set up for ' + ACTS.find((a) => a[0] === set.activity)[1].split(' (')[0].toLowerCase() + '.' + (n ? ' Found the ' + W().many + ' in ' + n + ' file' + (n > 1 ? 's' : '') + ': check them on the graph.' : ''));
  });
  $('role').addEventListener('change', function () {
    t.role = this.value;
    if (t.role === 'mvic' && !(t.mvicFor && t.mvicFor.length)) t.mvicFor = guessMvicFor(t);
    after('This file is now ' + (t.role === 'mvic' ? 'an MVIC.' : 'a task trial.'));
  });
  el.querySelectorAll('[data-mv]').forEach((c) => c.addEventListener('change', function () {
    const k = this.getAttribute('data-mv'); t.mvicFor = (t.mvicFor || []).filter((x) => x !== k); if (this.checked) t.mvicFor.push(k); after();
  }));
  $('norm').addEventListener('change', function () { set.norm = this.value; after(); });
  if ($('refMethod')) $('refMethod').addEventListener('change', function () { set.refMethod = this.value; after(); });
  if ($('refWin')) $('refWin').addEventListener('change', function () { const v = +this.value; if (v >= 50) { set.refWin = v; after(); } });
  el.querySelectorAll('[data-mn]').forEach((i) => i.addEventListener('change', function () { const m = A.session.muscles[this.getAttribute('data-mn')]; if (m) { m.short = this.value.trim() || m.short; after(); } }));
  ['bpLo', 'bpHi', 'bpOrder', 'envFc', 'envOrder'].forEach((id) => $(id).addEventListener('change', function () {
    const v = +this.value; if (!(v > 0)) return;
    set[id] = /Order/.test(id) ? Math.max(1, Math.min(8, Math.round(v))) : v;
    if (set.bpLo >= set.bpHi) { status('<span class="bad">The band-pass must go from a lower to a higher frequency.</span>'); return; }
    forget(); after('Reprocessed with the new settings.');
  }));
  $('procReset').addEventListener('click', () => { const d = defaultSet(); ['bpLo', 'bpHi', 'bpOrder', 'envFc', 'envOrder'].forEach((k) => { set[k] = d[k]; }); forget(); after('Back to the lab defaults (20&ndash;450 Hz band-pass, 6 Hz envelope, 4th order).'); });
  $('fsIn').addEventListener('change', function () { const v = +this.value; t.fsOverride = v > 0 && Math.abs(v - (t.P.emg[0] && t.P.emg[0].fs)) > 1e-9 ? v : 0; forget(t); after(); });
  $('scale').addEventListener('change', function () { t.scale = +this.value; forget(t); after(); });
}
const ACTS = [['reps', 'A gym exercise (you mark each rep)'], ['gait', 'Running or walking (strides found from the accelerometer)'], ['cycling', 'Cycling (pedal cycles found from the accelerometer)'], ['open', 'Something else (you choose the windows)']];
const ACT_HELP = {
  reps: 'Mark each rep by hand in <strong>2. Points</strong>. Normalise to MVICs if you have them.',
  gait: 'Each stride runs from one foot strike to the next on the same leg. <strong>2. Points</strong> finds the foot strikes from the sensor&rsquo;s accelerometer for you to check. No MVIC needed: normalise to a reference trial.',
  cycling: 'Each cycle runs from one peak of the thigh sensor&rsquo;s movement to the next. <strong>2. Points</strong> finds them from the accelerometer for you to check, or mark them by hand (e.g. top dead centre from video).',
  open: 'Any other data. Mark reps or cycles by hand, find cycles from the accelerometer, add your own windows between any two points, or use the whole trial.'
};
function after(msg) { persist(); A.fn.refresh({ keepView: true, keepStatus: !!msg }); if (msg) status(msg); }

// An MVIC file with one muscle is for that muscle. With several, guess from the file's name, or the loudest.
export function guessMvicFor(t) {
  const keys = t.P.emg.map((e) => e.key);
  if (keys.length === 1) return keys.slice();
  const nm = t.name.toUpperCase();
  const hit = keys.filter((k) => { const s = muscle(k).short.replace(/^[LR]\s+/, '').toUpperCase(); return new RegExp('(^|[^A-Z])' + s + '([^A-Z]|$)').test(nm); });
  return hit.length ? hit : [];
}
export function registerMuscles(P) {
  P.emg.forEach((e) => {
    if (A.session.muscles[e.key]) return;
    const n = Object.keys(A.session.muscles).length;
    A.session.muscles[e.key] = { short: e.short, name: e.name, col: MUSCLE_COLS[n % MUSCLE_COLS.length], order: n };
  });
}
