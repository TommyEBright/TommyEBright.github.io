// Start-up: wires the page together. Setup, calibration, the marker and angle builders, demos and the app install.
import { A, $, esc, clone, status, persist, points, colourOf, angleDefs, eventTypes, VERSION, APP, download, fwd } from './state.js?v=2.1.1';
import { tiltAngle } from './maths.js?v=2.1.1';
import { initVideo, seek, recount, render, viewDims, play, pause, isPlaying, detectFps } from './video.js?v=2.1.1';
import { initOverlay, draw, renderChips, updateDigiCount, renderMeasures, undo } from './overlay.js?v=2.1.1';
import { initTracking, clearFlag, renderFlags } from './tracking.js?v=2.1.1';
import { initEvents, renderEventBtns, renderEvents } from './events.js?v=2.1.1';
import { initResults, compute, drawResults, live, renderNorm } from './results.js?v=2.1.1';
import { initExport, renderExportPoints, renderPhotoOpts } from './export.js?v=2.1.1';
import { initSession, addFiles, renderSession } from './session.js?v=2.1.1';
import { initCompare, renderCompare } from './compare.js?v=2.1.1';
import { initBuilder, renderBuilder } from './builder.js?v=2.1.1';
import { initConvert } from './convert.js?v=2.1.1';

Object.assign(A.fn, { draw, syncInputs, showCalib, compute, drawResults, clearFlag, renderFlags, live, renderPhotoOpts, renderNorm });

// ---------- setup ----------
function syncInputs() {
  const S = A.S;
  $('fps').value = S.fps; $('slow').value = S.slow; $('activity').value = S.activity; $('dir').value = S.dir;
  $('rot').value = String(S.rot); $('flip').checked = !!S.flip;
  $('every').value = String(S.every); $('advance').value = String(S.advance); $('snap').checked = !!S.snap; $('trkChecks').checked = S.checks !== false;
  $('calShow').checked = S.showCal !== false; activityHelp();
  $('cutoff').value = S.cutoff; $('filtOn').checked = S.filt;
  if (S.calib) $('calLen').value = S.calib.len;
  $('vertCheck').checked = !!S.tilt; $('grid').value = String(S.grid || 0);
  if (A.nFrames) $('trkTo').value = Math.max(0, A.nFrames - 1);
  showCalib(); renderChips(); renderEventBtns(); renderEvents(); renderMeasures(); updateDigiCount(); renderFlags();
  renderTemplateEditor(); renderAngles(); renderExportPoints(); renderBuilder(); renderPhotoOpts(); live();
  if (A.results) compute(); else { $('resBody').classList.add('hide'); $('resMsg').innerHTML = 'Digitise some frames, then press <strong>Update results</strong>.'; }
}
function initSetup() {
  $('fpsChips').innerHTML = [25, 30, 50, 60, 120, 240].map((v) => '<button type="button" class="chip" data-f="' + v + '">' + v + '</button>').join('');
  $('fpsChips').querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => { $('fps').value = b.getAttribute('data-f'); $('fps').dispatchEvent(new Event('change')); }));
  [['fps', parseFloat], ['slow', parseFloat], ['every', (v) => parseInt(v, 10)], ['advance', (v) => parseInt(v, 10)], ['cutoff', parseFloat]].forEach(([id, p]) => {
    $(id).addEventListener('change', function () {
      const v = p(this.value); if (!(v > 0 || (id === 'advance' && v === 0))) return;
      A.S[id] = v; if (A.S.duration) recount(); persist();
      if ((id === 'fps' || id === 'slow') && A.S.duration) { seek(Math.min(A.cur, A.nFrames - 1)); renderEvents(); if (A.results) compute(); }
    });
  });
  $('detect').addEventListener('click', () => detectFps(false));
  $('activity').addEventListener('change', function () { A.S.activity = this.value; eventTypes(); persist(); activityHelp(); renderEventBtns(); renderEvents(); renderBuilder(); if (A.results) compute(); });
  $('dir').addEventListener('change', function () { A.S.dir = this.value; persist(); draw(); if (A.results) compute(); });
  $('snap').addEventListener('change', function () { A.S.snap = this.checked; persist(); });
  $('rot').addEventListener('change', function () { reorient(parseInt(this.value, 10), A.S.flip); });
  $('flip').addEventListener('change', function () { reorient(A.S.rot, this.checked); });
}

const ACT_HELP = {
  general: 'Works for any movement filmed side-on (e.g. a squat, throw, kick, lift or gait). You get linear and angular kinematics for every marker and angle, and you add your own events.',
  cycle: 'For movements that repeat (e.g. cycling, rowing, swimming strokes, walking). Mark the same event at the start of each cycle (or let the tool suggest the highest and lowest point of a marker) to get cycle time, cycle rate (e.g. cadence) and time-normalised cycles.',
  sprint: 'Adds contact, flight and step times, step length and step frequency from touchdown and toe-off events, and can suggest those events from a foot marker.',
  jump: 'Adds flight time, jump height and the phases of a vertical jump from its events, and can suggest take-off and landing from a foot marker.'
};
function activityHelp() { $('actHelp').textContent = ACT_HELP[A.S.activity] || ''; }

// Rotating or flipping the picture moves every stored coordinate with it.
function toSrc(p, rot, flip, W, H) {
  let [x, y] = p; if (flip) x = W - x;
  if (rot === 90) return [y, W - x]; if (rot === 180) return [W - x, H - y]; if (rot === 270) return [H - y, x]; return [x, y];
}
function fromSrc(s, rot, flip, W, H) {
  let v; const [x, y] = s;
  if (rot === 90) v = [W - y, x]; else if (rot === 180) v = [W - x, H - y]; else if (rot === 270) v = [y, H - x]; else v = [x, y];
  if (flip) v[0] = W - v[0]; return v;
}
function reorient(rot, flip) {
  const S = A.S; if (!S.srcW) { S.rot = rot; S.flip = flip; return; }
  const [W0, H0] = [S.vw, S.vh], [W1, H1] = viewDims(rot, S.srcW, S.srcH);
  const map = (p) => fromSrc(toSrc(p, S.rot, S.flip, W0, H0), rot, flip, W1, H1);
  [S.frames].forEach((L) => Object.values(L).forEach((fr) => Object.keys(fr).forEach((m) => { fr[m] = map(fr[m]); })));
  if (S.calib) { S.calib.p1 = map(S.calib.p1); S.calib.p2 = map(S.calib.p2); }
  if (S.origin) S.origin = map(S.origin);
  S.measures.forEach((m) => { m.pts = m.pts.map(map); });
  S.rot = rot; S.flip = flip; S.vw = W1; S.vh = H1;
  $('ov').width = W1; $('ov').height = H1;
  persist(); render(); draw(); showCalib(); if (A.results) compute();
  status('Picture ' + (rot ? 'rotated ' + rot + '°' : 'not rotated') + (flip ? ' and mirrored' : '') + '. Any points you had moved with it.' + (flip ? ' Remember to check <strong>Which way is the participant facing?</strong>' : ''));
}

// ---------- calibration ----------
function showCalib() {
  const S = A.S;
  if (!S.calib) { $('calInfo').textContent = 'Not calibrated yet. Results will be in pixels.'; $('tiltInfo').textContent = ''; return; }
  const a = S.calib.p1, b = S.calib.p2, px = Math.hypot(b[0] - a[0], b[1] - a[1]);
  $('calInfo').textContent = 'Calibrated: ' + S.calib.len + ' m = ' + px.toFixed(1) + ' px (1 px = ' + (S.calib.len / px * 1000).toFixed(2) + ' mm)' + (S.tilt ? '. Corrected for ' + Math.abs(tiltAngle() * 180 / Math.PI).toFixed(1) + '° of camera tilt.' : '');
  const ang = Math.abs(Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI) % 90, off = Math.min(ang, 90 - ang);
  $('tiltInfo').textContent = 'Your calibration line is ' + off.toFixed(1) + '° off vertical/horizontal' + (off > 3 ? '. If the object really is upright (or level), your camera may be tilted: tick the box above to correct for it.' : ', which is fine.');
}
function initCalib() {
  $('calStart').addEventListener('click', function () { if (!A.S.vw) return; A.mode = 'calib'; A.pending = []; this.classList.add('on'); status('Click one end of your known length, then the other end. Use the magnifier.'); });
  $('origStart').addEventListener('click', function () { if (!A.S.vw) return; A.mode = 'origin'; A.pending = []; this.classList.add('on'); status('Click where you want (0, 0) to be (e.g. on the floor at the start line).'); });
  $('calClear').addEventListener('click', () => { A.S.calib = null; A.S.origin = null; persist(); showCalib(); draw(); if (A.results) compute(); });
  $('vertCheck').addEventListener('change', function () { A.S.tilt = this.checked; persist(); showCalib(); draw(); if (A.results) compute(); });
  $('calShow').addEventListener('change', function () { A.S.showCal = this.checked; persist(); draw(); });
  $('grid').addEventListener('change', function () { A.S.grid = parseFloat(this.value) || 0; if (A.S.grid && !A.S.calib) status('Calibrate first to see the grid.'); persist(); draw(); });
}

// ---------- points (templates) ----------
function renameEverywhere(oldN, newN) {
  const S = A.S;
  [S.frames, S.conf].forEach((L) => Object.values(L).forEach((fr) => { if (fr && fr[oldN] !== undefined) { fr[newN] = fr[oldN]; delete fr[oldN]; } }));
  if (S.footMarker === oldN) S.footMarker = newN; if (S.hipMarker === oldN) S.hipMarker = newN;
  Object.values(S.flags).forEach((arr) => arr.forEach((x) => { if (x.m === oldN) x.m = newN; }));
  S.template.links.forEach((l) => { if (l[0] === oldN) l[0] = newN; if (l[1] === oldN) l[1] = newN; });
  (S.angles || []).forEach((d) => ['a', 'b', 'c'].forEach((k) => { if (d[k] === oldN) d[k] = newN; }));
  S.graph.points = S.graph.points.map((p) => (p === oldN ? newN : p));
  if (S.exp && S.exp.markers) S.exp.markers = S.exp.markers.map((p) => (p === oldN ? newN : p));
}
function removeEverywhere(n) {
  const S = A.S;
  [S.frames, S.conf].forEach((L) => Object.keys(L).forEach((f) => { if (L[f]) { delete L[f][n]; if (!Object.keys(L[f]).length) delete L[f]; } }));
  S.template.links = S.template.links.filter((l) => l[0] !== n && l[1] !== n);
  if (S.angles) S.angles = S.angles.filter((d) => ![d.a, d.b, d.c].includes(n));
}
function afterTemplateChange() { A.activeMarker = null; A.results = null; persist(); syncInputs(); draw(); }
function renderTemplateEditor() {
  const S = A.S, pts = points();
  if (!pts.length) $('ptList').innerHTML = '<li class="muted">No markers yet. Type a name below (e.g. Hip) and press Add, in the order you will click them.</li>';
  else $('ptList').innerHTML = pts.map((m, i) => '<li><span class="dot" style="background:' + colourOf(m) + '"></span><input type="text" class="mini" value="' + esc(m) + '" data-ren="' + i + '" aria-label="Marker name"><button type="button" class="btn ghost small" data-up="' + i + '" title="Move up"' + (i ? '' : ' disabled') + '>&uarr;</button><button type="button" class="btn ghost small" data-rm="' + i + '">Remove</button></li>').join('');
  $('ptList').querySelectorAll('[data-ren]').forEach((inp) => inp.addEventListener('change', () => {
    const i = +inp.getAttribute('data-ren'), oldN = pts[i], newN = inp.value.trim();
    if (!newN || newN === oldN) { inp.value = oldN; return; }
    if (pts.includes(newN)) { status('There is already a marker called ' + esc(newN) + '.'); inp.value = oldN; return; }
    renameEverywhere(oldN, newN); pts[i] = newN; afterTemplateChange();
  }));
  $('ptList').querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => { const i = +b.getAttribute('data-up'); [pts[i - 1], pts[i]] = [pts[i], pts[i - 1]]; afterTemplateChange(); }));
  $('ptList').querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
    const i = +b.getAttribute('data-rm'), n = pts[i];
    const has = Object.values(S.frames).some((fr) => fr[n]);
    if (has && !confirm('Remove ' + n + ' and all its digitised positions?')) return;
    removeEverywhere(n); pts.splice(i, 1); afterTemplateChange();
  }));
  $('linkList').innerHTML = S.template.links.length ? S.template.links.map((l, i) => '<li>' + esc(l[0]) + ' &ndash; ' + esc(l[1]) + ' <button type="button" class="btn ghost small" data-lrm="' + i + '">Remove</button></li>').join('') : '<li class="muted">No segments (optional: lines drawn between two markers, also used for the quality checks).</li>';
  $('linkList').querySelectorAll('[data-lrm]').forEach((b) => b.addEventListener('click', () => { S.template.links.splice(+b.getAttribute('data-lrm'), 1); afterTemplateChange(); }));
  const opts = pts.map((m) => '<option>' + esc(m) + '</option>').join('');
  $('linkA').innerHTML = opts; $('linkB').innerHTML = opts; if (pts.length > 1) $('linkB').selectedIndex = 1;
}
// ---------- marker sets (save and reuse) ----------
function saveSet() {
  const S = A.S; if (!points().length) { status('Add some markers first.'); return; }
  const j = { kind: 'kinematic-analysis-marker-set', markers: S.template.points, segments: S.template.links, angles: S.angles, foot: S.footMarker, hip: S.hipMarker };
  const nm = ($('setName').value.trim() || 'marker_set').replace(/[^\w\-]+/g, '_');
  download(nm + '.json', new Blob([JSON.stringify(j, null, 1)], { type: 'application/json' }));
  status('Marker set saved. Load it at the start of any analysis to skip setting the markers up again.');
}
function loadSet(file) {
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const j = JSON.parse(rd.result); if (!Array.isArray(j.markers)) throw new Error('bad');
      const S = A.S, had = Object.keys(S.frames).length;
      if (had && !confirm('Replace this video\u2019s markers with the saved set? Markers that are not in the set will be removed with their positions.')) return;
      points().filter((m) => !j.markers.includes(m)).forEach(removeEverywhere);
      S.template = { points: j.markers.slice(), links: (j.segments || []).filter((l) => j.markers.includes(l[0]) && j.markers.includes(l[1])) };
      S.angles = (j.angles || []).filter((d) => [d.a, d.b, d.c].filter(Boolean).every((m) => j.markers.includes(m)));
      if (j.foot) S.footMarker = j.foot; if (j.hip) S.hipMarker = j.hip;
      afterTemplateChange(); status('Marker set loaded: ' + esc(j.markers.join(', ')) + '.');
    } catch (e) { status('That file is not a marker set.'); }
  };
  rd.readAsText(file);
}
function initTemplates() {
  $('setSave').addEventListener('click', saveSet);
  $('setLoad').addEventListener('change', function () { const f = this.files[0]; if (f) loadSet(f); this.value = ''; });
  $('ptAdd').addEventListener('click', () => {
    const n = $('ptNew').value.trim(); if (!n) return;
    if (points().includes(n)) { status('There is already a marker called ' + esc(n) + '.'); return; }
    points().push(n); $('ptNew').value = ''; afterTemplateChange();
  });
  $('ptNew').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('ptAdd').click(); } });
  $('linkAdd').addEventListener('click', () => {
    const a = $('linkA').value, b = $('linkB').value; if (!a || !b || a === b) return;
    if (!A.S.template.links.some((l) => (l[0] === a && l[1] === b) || (l[0] === b && l[1] === a))) A.S.template.links.push([a, b]);
    afterTemplateChange();
  });
}

// ---------- angle builder ----------
const TYPE_TXT = { joint: 'Joint (relative) angle at the middle marker', vertical: 'Segment (absolute) angle from vertical', horizontal: 'Segment (absolute) angle from horizontal' };
function describe(d) {
  if (d.type === 'joint') return esc(d.a) + ' &ndash; <strong>' + esc(d.b) + '</strong> &ndash; ' + esc(d.c) + ' <span class="muted">(joint, relative)</span>';
  if (d.type === 'vertical') return esc(d.a) + ' &rarr; ' + esc(d.b) + ' from vertical <span class="muted">(segment, absolute; + = ' + esc(d.b) + ' ' + fwd() + ')</span>';
  return esc(d.a) + ' &rarr; ' + esc(d.b) + ' from horizontal <span class="muted">(segment, absolute; anticlockwise +)</span>';
}
function optSelect(d, i) {
  if (d.type === 'joint') {
    const v = d.mode === 'ccw' ? 'ccw' : d.flex ? 'flex' : 'inc';
    return '<br><select class="mini" data-opt="' + i + '" aria-label="How the angle is measured"><option value="inc"' + (v === 'inc' ? ' selected' : '') + '>0&ndash;180&deg;, 180&deg; = straight</option><option value="flex"' + (v === 'flex' ? ' selected' : '') + '>Flexion, 0&deg; = straight</option><option value="ccw"' + (v === 'ccw' ? ' selected' : '') + '>0&ndash;360&deg; anticlockwise (shows hyperextension)</option></select>';
  }
  if (d.type === 'horizontal') return '<br><select class="mini" data-opt="' + i + '" aria-label="Range"><option value="180"' + (d.range !== '360' ? ' selected' : '') + '>&minus;180&deg; to +180&deg;</option><option value="360"' + (d.range === '360' ? ' selected' : '') + '>0&deg; to 360&deg;</option></select>';
  return '';
}
function renderAngles() {
  const defs = angleDefs(), pts = points();
  $('angList').innerHTML = defs.length ? '<tr><th>Use</th><th>Name</th><th>Markers</th><th>On video</th><th></th></tr>' + defs.map((d, i) =>
    '<tr><td><input type="checkbox" data-on="' + i + '"' + (d.on ? ' checked' : '') + ' aria-label="Use this angle"></td><td><input type="text" class="mini" data-an="' + i + '" value="' + esc(d.name) + '" aria-label="Angle name"></td><td>' + describe(d) + optSelect(d, i) + '</td><td><input type="checkbox" data-vid="' + i + '"' + (d.video ? ' checked' : '') + ' aria-label="Show on video"></td><td><button type="button" class="btn ghost small" data-adel="' + i + '">Delete</button></td></tr>').join('') : '<tr><td class="muted">' + (pts.length >= 2 ? 'No angles yet. Build one below.' : 'Add at least two markers first, then build angles here.') + '</td></tr>';
  const after = () => { persist(); renderAngles(); draw(); live(); if (A.results) compute(); };
  $('angList').querySelectorAll('[data-on]').forEach((c) => c.addEventListener('change', () => { defs[+c.getAttribute('data-on')].on = c.checked; after(); }));
  $('angList').querySelectorAll('[data-vid]').forEach((c) => c.addEventListener('change', () => { defs[+c.getAttribute('data-vid')].video = c.checked; after(); }));
  $('angList').querySelectorAll('[data-opt]').forEach((c) => c.addEventListener('change', () => {
    const d = defs[+c.getAttribute('data-opt')];
    if (d.type === 'joint') { d.flex = c.value === 'flex'; d.mode = c.value === 'ccw' ? 'ccw' : ''; } else d.range = c.value;
    after();
  }));
  $('angList').querySelectorAll('[data-an]').forEach((inp) => inp.addEventListener('change', () => { defs[+inp.getAttribute('data-an')].name = inp.value.trim() || 'Angle'; after(); }));
  $('angList').querySelectorAll('[data-adel]').forEach((b) => b.addEventListener('click', () => { defs.splice(+b.getAttribute('data-adel'), 1); after(); }));
  const opts = pts.map((m) => '<option>' + esc(m) + '</option>').join('');
  ['angA', 'angB', 'angC'].forEach((id, k) => { const el = $(id), old = el.value; el.innerHTML = opts; if (pts.includes(old)) el.value = old; else el.selectedIndex = Math.min(k, pts.length - 1); });
  angTypeUI();
}
function angTypeUI() {
  const t = $('angType').value;
  $('angCWrap').classList.toggle('hide', t !== 'joint');
  $('angLabA').textContent = t === 'joint' ? 'End marker (proximal)' : t === 'vertical' ? 'Lower end' : 'Proximal end';
  $('angLabB').textContent = t === 'joint' ? 'Joint (middle)' : t === 'vertical' ? 'Upper end' : 'Distal end';
  $('angTypeHelp').textContent = TYPE_TXT[t] + (t === 'joint' ? ': the angle between the two segments that meet at the middle marker (e.g. hip, knee, ankle for the knee). Robertson et al. (2014) call this a relative angle.' : t === 'vertical' ? ': how far the segment leans from upright (e.g. ankle to knee for the shank, or hip to shoulder for the trunk).' : ': the segment\u2019s orientation measured anticlockwise from the horizontal, at its proximal end (e.g. knee to ankle for the shank, or heel to toe for the foot). This is the absolute angle in Robertson et al. (2014).');
}
function initAngles() {
  $('angType').addEventListener('change', angTypeUI);
  $('angAdd').addEventListener('click', () => {
    const t = $('angType').value, a = $('angA').value, b = $('angB').value, c = $('angC').value;
    if (!a || !b || a === b || (t === 'joint' && (!c || c === a || c === b))) { status('Pick a different marker for each end.'); return; }
    const name = $('angName').value.trim() || (t === 'joint' ? b + ' angle' : a + '–' + b + (t === 'vertical' ? ' from vertical' : ' from horizontal'));
    const d = { name, type: t, a, b, on: true, flex: false, video: false }; if (t === 'joint') d.c = c;
    angleDefs().push(d); $('angName').value = ''; persist(); renderAngles(); draw(); if (A.results) compute();
  });
}

// ---------- video controls, tabs, keys ----------
function togglePlay() { if (!$('vid').src) return; if (isPlaying()) pause(); else play(+$('rate').value); }
function initControls() {
  $('slider').addEventListener('input', function () { if (isPlaying()) pause(); seek(+this.value); });
  [['bBack1', -1], ['bFwd1', 1], ['bBack10', -10], ['bFwd10', 10]].forEach(([id, d]) => $(id).addEventListener('click', () => { if (isPlaying()) pause(); seek(A.cur + d); }));
  $('bPlay').addEventListener('click', togglePlay);
  document.addEventListener('keydown', (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); if (isPlaying()) pause(); seek(A.cur + (e.shiftKey ? 10 : 1)); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); if (isPlaying()) pause(); seek(A.cur - (e.shiftKey ? 10 : 1)); }
    else if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'z' || e.key === 'Z') undo();
    else if (e.key === 'Escape') { A.mode = 'digi'; A.pending = []; document.querySelectorAll('.btn.on').forEach((b) => b.classList.remove('on')); draw(); status('Cancelled.'); }
  });
  $('zoom').addEventListener('change', function () { $('stage').style.width = (+this.value * 100) + '%'; });
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.setAttribute('aria-selected', String(x === t)));
    document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('hide', p.getAttribute('data-p') !== t.getAttribute('data-t')));
    if (t.getAttribute('data-t') === 'digi') { A.mode = 'digi'; A.pending = []; }
    if (t.getAttribute('data-t') === 'files') { renderExportPoints(); renderBuilder(); renderPhotoOpts(); }
  }));
  $('trail').addEventListener('change', draw);
}

// ---------- demo clips ----------
const DEMOS = {
  cmj: {
    file: 'demo/demo-cmj-2026-120fps', name: 'demo-cmj-120fps',
    preset: { state: { fps: 120, fpsSet: true, slow: 1, activity: 'jump', dir: 'right', every: 1 }, labels: { athlete: 'Demo', condition: 'CMJ', trial: '1' },
      msg: 'Demo loaded: a computer-made countermovement jump (hands on hips) filmed at <strong>120 fps</strong>, with a 1 m pole on the left for calibration and five markers on the body (shoulder, hip, knee, ankle, toe). Add those markers in the <strong>Markers</strong> tab, calibrate on the pole, click the markers on one frame, then <strong>Track forwards</strong>.' }
  },
  sprint: {
    file: 'demo/demo-sprint-240fps-slowed8x', name: 'demo-sprint-240fps-slowed8x',
    preset: { state: { fps: 30, fpsSet: true, slow: 8, activity: 'sprint', dir: 'left', every: 1, snap: false }, labels: { athlete: 'Demo', condition: 'Sprint', trial: '1' },
      msg: 'Demo loaded: a real sprint, filmed in slow motion at <strong>240 fps</strong> but saved as a <strong>30 fps</strong> file that plays 8&times; slower. That is why <strong>Slowed down by</strong> is set to 8 in Setup: without it every time would be 8&times; too long. There are no markers on the runner and nothing of known length in the picture, so use it for timing events (contact, flight, step) and for clicking joints by hand (auto-centre is off for this clip because there are no markers to centre on).' }
  }
};
async function loadDemo(k) {
  const d = DEMOS[k], v = $('vid');
  const ext = v.canPlayType('video/mp4; codecs="avc1.640028"') ? '.mp4' : '.webm';
  status('Loading the demo clip\u2026');
  try {
    const r = await fetch(d.file + ext); if (!r.ok) throw new Error(r.status);
    const b = await r.blob();
    addFiles([new File([b], d.name + ext, { type: b.type || (ext === '.mp4' ? 'video/mp4' : 'video/webm') })], d.preset);
  } catch (e) { status('The demo clip could not be loaded. It needs to sit in the <code>demo</code> folder next to this page.'); }
}

// ---------- install as an app ----------
let installEvt = null;
function initPWA() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('installBtn').classList.remove('hide'); });
  $('installBtn').addEventListener('click', async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('installBtn').classList.add('hide'); });
  window.addEventListener('appinstalled', () => $('installBtn').classList.add('hide'));
}

function start() {
  initVideo(); initOverlay(); initTracking(); initEvents(); initResults(); initExport(); initBuilder(); initCompare();
  initSetup(); initCalib(); initTemplates(); initAngles(); initControls(); initPWA(); initSession(); initConvert();
  $('demoCmj').addEventListener('click', () => loadDemo('cmj'));
  $('demoSprint').addEventListener('click', () => loadDemo('sprint'));
  $('ver').textContent = 'v' + VERSION; document.title = APP;
  syncInputs(); if (A.S.duration) recount(); renderSession(); renderCompare();
  window.__KVA = A; window.__KVA_compute = compute; window.__KVA_demo = loadDemo; window.__KVA_seek = seek;
  window.__KVA_place = (f, m, x, y) => { if (!A.S.frames[f]) A.S.frames[f] = {}; A.S.frames[f][m] = [x, y]; persist(); draw(); };
}
start();
