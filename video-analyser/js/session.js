// Sessions: several videos (trials) worked through one after another, then compared.
import { A, $, esc, status, persist, freshState, clone, SHARED, restoreSession, forgetSession, currentTrial } from './state.js?v=2.0.2';
import { loadVideoURL, viewDims } from './video.js?v=2.0.2';

const uid = () => Math.random().toString(36).slice(2, 10);

// A new trial copies the shared settings (markers, angles, frame rate, filter...) from the trial before it.
export function newTrial(name, prev) {
  const st = freshState();
  if (prev) { SHARED.forEach((k) => { if (prev.state[k] !== undefined) st[k] = clone(prev.state[k]); }); st.fpsSet = !!prev.state.fpsSet; st.graph.xevent = ''; }
  const L = prev ? prev.labels : {};
  const num = prev ? (parseInt(L.trial, 10) || A.session.trials.length) + 1 : 1;
  return { id: uid(), name, labels: { athlete: L.athlete || '', condition: L.condition || '', trial: String(num) }, state: st };
}
function lastSetUp() {
  const T = A.session.trials;
  for (let i = T.length - 1; i >= 0; i--) if (T[i].state.template.points.length) return T[i];
  return T[T.length - 1] || null;
}

export function addFiles(list, preset) {
  const files = [...list].filter((f) => /^video\//.test(f.type) || /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(f.name));
  if (!files.length) return;
  const first = A.session.trials.length;
  files.forEach((f) => {
    const t = newTrial(f.name, lastSetUp());
    if (preset) { Object.assign(t.state, clone(preset.state || {})); Object.assign(t.labels, preset.labels || {}); t.demoMsg = preset.msg; t.preset = true; }
    A.files[t.id] = f; A.session.trials.push(t);
  });
  persist(); renderSession();
  if (A.session.cur < 0 || !A.S.duration || files.length === 1) openTrial(first);
  else status(files.length + ' videos added to the session. Finish this one, then press <strong>Next trial</strong>.');
}

// Open a trial. Asks for the video file if it is not loaded (e.g. after the page was reopened).
export function openTrial(i) {
  const T = A.session.trials, t = T[i]; if (!t) return;
  if (A.busy) { status('Wait for tracking to finish first.'); return; }
  A.session.cur = i; persist();
  const file = A.files[t.id];
  if (!file) {
    A.S = t.state; A.results = null; renderSession(); if (A.fn.syncInputs) A.fn.syncInputs();
    A.relinkFor = t.id; $('stage').classList.add('hide'); $('empty').classList.remove('hide');
    $('empty').innerHTML = 'Choose the video file for <strong>' + esc(t.name) + '</strong> to carry on.<br><label class="btn small" style="margin-top:.6rem">Choose video<input type="file" accept="video/*" class="hide" id="relinkOne"></label>';
    $('relinkOne').addEventListener('change', function () { const f = this.files[0]; if (f) { A.files[t.id] = f; openTrial(i); } });
    status('This trial&rsquo;s video needs opening again (the browser cannot keep videos). Choose <strong>' + esc(t.name) + '</strong>.');
    return;
  }
  // a trial that has never been opened picks up the markers, angles and settings of the trial before it
  const fresh = !t.state.duration && !Object.keys(t.state.frames).length && !t.preset;
  if (fresh) {
    let prev = null; for (let k = i - 1; k >= 0; k--) if (T[k].state.template.points.length || T[k].state.duration) { prev = T[k]; break; }
    if (prev) { SHARED.forEach((k) => { if (prev.state[k] !== undefined) t.state[k] = clone(prev.state[k]); }); t.state.fpsSet = !!prev.state.fpsSet; t.state.graph.xevent = ''; }
  }
  // ...and can reuse the last calibration if the camera did not move
  A.pendingCalib = null;
  if (!t.state.duration && !t.state.calib) {
    let prev = null; for (let k = i - 1; k >= 0; k--) if (T[k].state.calib) { prev = T[k]; break; }
    if (prev && confirm('Use the same calibration as ' + label(prev) + '?\n\nOnly choose OK if the camera did not move or zoom between the two videos.')) A.pendingCalib = prev;
  }
  loadVideoURL(URL.createObjectURL(file), t.name, { state: t.state, msg: t.demoMsg || ('Trial ' + (i + 1) + ' of ' + T.length + ' loaded: <strong>' + esc(label(t)) + '</strong>.') });
}
// After the video loads: apply a carried-over calibration if the picture is the same size.
export function afterLoad() {
  const p = A.pendingCalib; A.pendingCalib = null;
  if (p) {
    const S = A.S, [w, h] = viewDims(S.rot, S.srcW, S.srcH);
    if (p.state.vw === w && p.state.vh === h) { ['calib', 'origin', 'tilt', 'grid'].forEach((k) => { S[k] = clone(p.state[k]); }); persist(); A.fn.syncInputs(); A.fn.draw(); status('Calibration copied from ' + esc(label(p)) + '. Check it lines up (Calibrate &rarr; grid).'); }
    else status('<span class="bad">This video is a different size from ' + esc(label(p)) + ', so its calibration was not copied. Please calibrate again.</span>');
  }
  renderSession();
}
export function label(t) {
  const L = t.labels, bits = [L.athlete, L.condition, L.trial ? 'trial ' + L.trial : ''].filter(Boolean);
  return bits.length ? bits.join(', ') : t.name;
}
function nextTrial() {
  const i = A.session.cur + 1;
  if (i >= A.session.trials.length) { status('That was the last trial. Add more videos, or open the <strong>Compare trials</strong> section below.'); return; }
  openTrial(i);
}
function removeTrial(i) {
  const T = A.session.trials, t = T[i];
  if (!confirm('Remove ' + label(t) + ' and all its work from the session?')) return;
  T.splice(i, 1); delete A.files[t.id];
  if (A.session.cur === i) { A.session.cur = -1; A.S = freshState(); A.results = null; $('vid').removeAttribute('src'); $('stage').classList.add('hide'); $('empty').classList.remove('hide'); $('empty').innerHTML = 'Add a video to start.'; if (T.length) openTrial(Math.min(i, T.length - 1)); else if (A.fn.syncInputs) A.fn.syncInputs(); }
  else if (A.session.cur > i) A.session.cur--;
  persist(); renderSession(); if (A.fn.renderCompare) A.fn.renderCompare();
}

export function renderSession() {
  const T = A.session.trials, box = $('sesTab');
  $('sesCount').textContent = T.length ? '(' + T.length + ' trial' + (T.length > 1 ? 's' : '') + ')' : '';
  if (!T.length) { box.innerHTML = '<tr><td class="muted">No videos yet. Press <strong>Add videos</strong> (you can choose several at once).</td></tr>'; $('sesNext').disabled = true; return; }
  box.innerHTML = '<tr><th>#</th><th>Athlete</th><th>Condition</th><th>Trial</th><th>Video</th><th>Progress</th><th></th></tr>' + T.map((t, i) => {
    const S = t.state, nf = Object.keys(S.frames).filter((f) => Object.keys(S.frames[f]).length).length, cur = i === A.session.cur;
    const prog = (S.calib ? 'calibrated, ' : '') + nf + ' frame' + (nf === 1 ? '' : 's') + ', ' + S.events.length + ' event' + (S.events.length === 1 ? '' : 's');
    return '<tr' + (cur ? ' class="current"' : '') + '><td class="num">' + (i + 1) + '</td>' +
      ['athlete', 'condition', 'trial'].map((k) => '<td><input type="text" class="mini" data-lab="' + k + '" data-i="' + i + '" value="' + esc(t.labels[k] || '') + '" placeholder="' + (k === 'athlete' ? 'e.g. Athlete 1' : k === 'condition' ? 'e.g. Pre' : 'e.g. 1') + '" aria-label="' + k + '"></td>').join('') +
      '<td class="small">' + esc(t.name) + (A.files[t.id] ? '' : ' <span class="muted">(needs re-opening)</span>') + '</td><td class="muted small">' + prog + '</td>' +
      '<td class="nowrap">' + (cur ? '<strong class="small">Open now</strong>' : '<button type="button" class="btn small ghost" data-open="' + i + '">Open</button>') + ' <button type="button" class="btn small ghost" data-del="' + i + '" title="Remove from session">&times;</button></td></tr>';
  }).join('');
  box.querySelectorAll('[data-lab]').forEach((inp) => inp.addEventListener('input', () => { T[+inp.dataset.i].labels[inp.dataset.lab] = inp.value; persist(); if (A.fn.renderCompare) A.fn.renderCompare(); }));
  box.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openTrial(+b.dataset.open)));
  box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => removeTrial(+b.dataset.del)));
  $('sesNext').disabled = A.session.cur >= T.length - 1;
}

// Match re-chosen video files to trials by file name.
function relink(list) {
  let n = 0;
  const T = A.session.trials, cur = T[A.session.cur];
  [...list].forEach((f) => {
    const t = (cur && cur.name === f.name && !A.files[cur.id] ? cur : null) || T.find((x) => x.name === f.name && !A.files[x.id]) || T.find((x) => x.name === f.name);
    if (t) { A.files[t.id] = f; n++; }
  });
  renderSession();
  status(n ? n + ' video' + (n > 1 ? 's' : '') + ' matched to trials.' : 'None of those files match the trials in this session (the file names must be the same).');
  if (n && !$('vid').getAttribute('src') && A.session.cur >= 0) openTrial(A.session.cur);
}

export function initSession() {
  $('file').addEventListener('change', function () { addFiles(this.files); this.value = ''; });
  $('sesNext').addEventListener('click', nextTrial);
  $('sesRelink').addEventListener('change', function () { relink(this.files); this.value = ''; });
  $('sesNew').addEventListener('click', () => {
    if (A.session.trials.length && !confirm('Start a new, empty session? Everything in this one will be cleared from this browser. (Save a project file first if you want to keep it.)')) return;
    A.session = { trials: [], cur: -1 }; A.files = {}; A.S = freshState(); A.results = null; forgetSession();
    $('vid').removeAttribute('src'); $('stage').classList.add('hide'); $('empty').classList.remove('hide'); $('empty').innerHTML = 'Add a video to start.';
    A.fn.syncInputs(); renderSession(); if (A.fn.renderCompare) A.fn.renderCompare(); status('New session started.');
  });
  A.fn.renderSession = renderSession; A.fn.afterLoad = afterLoad; A.fn.openTrial = openTrial;
  // carry on where the last visit left off
  const saved = restoreSession();
  if (saved) {
    A.session = saved; const t = currentTrial() || saved.trials[saved.trials.length - 1];
    A.session.cur = saved.trials.indexOf(t); A.S = t.state;
    $('empty').innerHTML = 'Your last session is still here (' + saved.trials.length + ' trial' + (saved.trials.length > 1 ? 's' : '') + '). The browser cannot keep videos, so choose them again to carry on digitising:<br><label class="btn small" style="margin-top:.6rem">Choose the videos<input type="file" accept="video/*" multiple class="hide" id="relinkAll"></label><br><span class="muted">Results and Compare work without the videos.</span>';
    $('relinkAll').addEventListener('change', function () { relink(this.files); });
  }
  renderSession();
  window.__KVA_addFiles = addFiles; window.__KVA_open = openTrial;
}
