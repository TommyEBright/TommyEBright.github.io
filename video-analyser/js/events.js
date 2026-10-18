// Key events, the stopwatch (intervals between events), looping and event-based summary values.
import { A, $, esc, fx, status, persist, eventTypes, tReal, fpsReal, G, points, footMarker, hipMarker } from './state.js';
import { toWorld, butter, centralDiff, series, mean } from './maths.js';
import { seek, play, pause } from './video.js';
import { draw } from './overlay.js';

const uid = () => Math.random().toString(36).slice(2, 9);
export function ensureIds() { A.S.events.forEach((e) => { if (!e.id) e.id = uid(); }); }
const byId = (id) => A.S.events.find((e) => e.id === id);
const evLabel = (e) => e.name + ' @ ' + tReal(e.frame).toFixed(3) + ' s';
function sortEvents() { A.S.events.sort((x, y) => x.frame - y.frame); }

export function addEvent(name, frame) {
  A.S.events.push({ id: uid(), name, frame: frame === undefined ? A.cur : frame });
  sortEvents(); persist(); renderEvents(); draw();
}

export function renderEventBtns() {
  const types = eventTypes();
  $('eventBtns').innerHTML = types.map((n, i) => '<span class="evbtn"><button type="button" class="btn accent small" data-e="' + esc(n) + '">' + esc(n) + '</button><button type="button" class="x" title="Remove this event type" data-rm="' + i + '">&times;</button></span>').join('');
  $('eventBtns').querySelectorAll('[data-e]').forEach((b) => b.addEventListener('click', () => { const n = b.getAttribute('data-e'); addEvent(n); status(esc(n) + ' marked at frame ' + A.cur + ' (' + tReal(A.cur).toFixed(3) + ' s).'); }));
  $('eventBtns').querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { types.splice(+b.getAttribute('data-rm'), 1); persist(); renderEventBtns(); }));
}

export function renderMarkerPickers() {
  const opts = '<option value="">(choose)</option>' + points().map((m) => '<option>' + esc(m) + '</option>').join('');
  $('evFoot').innerHTML = opts; $('evHip').innerHTML = opts;
  $('evFoot').value = footMarker(); $('evHip').value = hipMarker();
}
export function renderEvents() {
  const S = A.S; ensureIds(); renderMarkerPickers();
  if (!S.events.length) { $('eventTab').innerHTML = '<tr><td class="muted">No events yet.</td></tr>'; }
  else {
    $('eventTab').innerHTML = '<tr><th>Event</th><th>Frame</th><th>Time (s)</th><th>Since previous (s)</th><th></th></tr>' + S.events.map((e, i) =>
      '<tr><td><a href="#" data-go="' + e.frame + '">' + esc(e.name) + '</a></td><td class="num">' + e.frame + '</td><td class="num">' + tReal(e.frame).toFixed(3) + '</td><td class="num">' + (i ? (tReal(e.frame) - tReal(S.events[i - 1].frame)).toFixed(3) : '') + '</td>' +
      '<td class="nowrap"><button type="button" class="btn ghost small" data-nudge="' + e.id + '" data-d="-1" title="One frame earlier">&minus;1</button> <button type="button" class="btn ghost small" data-nudge="' + e.id + '" data-d="1" title="One frame later">+1</button> <button type="button" class="btn ghost small" data-del="' + e.id + '">Delete</button></td></tr>').join('');
    $('eventTab').querySelectorAll('[data-go]').forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); seek(+a.getAttribute('data-go')); }));
    $('eventTab').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { const id = b.getAttribute('data-del'); S.events = S.events.filter((e) => e.id !== id); S.intervals = S.intervals.filter((iv) => iv.a !== id && iv.b !== id); persist(); renderEvents(); draw(); }));
    $('eventTab').querySelectorAll('[data-nudge]').forEach((b) => b.addEventListener('click', () => { const e = byId(b.getAttribute('data-nudge')); e.frame = Math.max(0, Math.min(A.nFrames - 1, e.frame + +b.getAttribute('data-d'))); sortEvents(); persist(); renderEvents(); seek(e.frame); }));
  }
  // pickers for the stopwatch and loop
  const opts = S.events.map((e) => '<option value="' + e.id + '">' + esc(evLabel(e)) + '</option>').join('');
  ['ivA', 'ivB', 'loopA', 'loopB'].forEach((id, k) => { const el = $(id), old = el.value; el.innerHTML = opts; if (old && byId(old)) el.value = old; else if (S.events.length) el.selectedIndex = (k % 2) ? Math.min(1, S.events.length - 1) : 0; });
  renderIntervals();
  $('eventSummary').innerHTML = statsHTML(eventStats());
  if (A.results && A.fn.drawResults) { A.fn.drawResults(); A.fn.renderNorm(); }
  if (A.fn.renderSession) A.fn.renderSession();
}

function renderIntervals() {
  const S = A.S; S.intervals = S.intervals.filter((iv) => byId(iv.a) && byId(iv.b));
  if (!S.intervals.length) { $('ivTab').innerHTML = '<tr><td class="muted">No intervals yet. Pick two events above and press <strong>Add</strong>.</td></tr>'; return; }
  $('ivTab').innerHTML = '<tr><th>Name</th><th>From</th><th>To</th><th>Time (s)</th><th>Time (ms)</th><th></th></tr>' + S.intervals.map((iv, i) => {
    const a = byId(iv.a), b = byId(iv.b), d = tReal(b.frame) - tReal(a.frame);
    return '<tr><td><input type="text" class="mini" data-ivn="' + i + '" value="' + esc(iv.label || '') + '" placeholder="e.g. Contact 1" aria-label="Interval name"></td><td>' + esc(evLabel(a)) + '</td><td>' + esc(evLabel(b)) + '</td><td class="num"><strong>' + d.toFixed(3) + '</strong></td><td class="num">' + Math.round(d * 1000) + '</td><td><button type="button" class="btn ghost small" data-ivd="' + i + '">Delete</button></td></tr>';
  }).join('');
  $('ivTab').querySelectorAll('[data-ivn]').forEach((inp) => inp.addEventListener('input', () => { S.intervals[+inp.getAttribute('data-ivn')].label = inp.value; persist(); }));
  $('ivTab').querySelectorAll('[data-ivd]').forEach((b) => b.addEventListener('click', () => { S.intervals.splice(+b.getAttribute('data-ivd'), 1); persist(); renderIntervals(); }));
}
export function intervalRows() {
  return A.S.intervals.filter((iv) => byId(iv.a) && byId(iv.b)).map((iv) => { const a = byId(iv.a), b = byId(iv.b); return { label: iv.label || (a.name + ' to ' + b.name), a, b, t: tReal(b.frame) - tReal(a.frame) }; });
}

export function statsHTML(s) {
  if (!s.length) return '';
  return '<div class="stats">' + s.map((r) => '<div class="stat"><span>' + esc(r[0]) + '</span><strong>' + esc(r[1]) + '</strong>' + (r[2] ? '<span>' + esc(r[2]) + '</span>' : '') + '</div>').join('') + '</div>';
}

// Summary values worked out from the events. Returns rows of [name, value, note].
export function eventStats() {
  const S = A.S, ev = S.events, out = [], dt = (a, b) => (b - a) / fpsReal();
  const is = (e, n) => e.name.toLowerCase().startsWith(n);
  if (S.activity === 'sprint') {
    const c = [], fl = [], st = [], sl = [], foot = footMarker();
    for (let i = 0; i < ev.length; i++) {
      if (is(ev[i], 'touchdown')) {
        for (let j = i + 1; j < ev.length; j++) { if (is(ev[j], 'toe-off')) { c.push(dt(ev[i].frame, ev[j].frame)); break; } if (is(ev[j], 'touchdown')) break; }
        for (let j = i + 1; j < ev.length; j++) {
          if (is(ev[j], 'touchdown')) {
            st.push(dt(ev[i].frame, ev[j].frame));
            const a = S.frames[ev[i].frame], b = S.frames[ev[j].frame];
            if (foot && a && b && a[foot] && b[foot]) sl.push(Math.abs(toWorld(b[foot])[0] - toWorld(a[foot])[0]));
            break;
          }
        }
      }
      if (is(ev[i], 'toe-off')) for (let j = i + 1; j < ev.length; j++) { if (is(ev[j], 'touchdown')) { fl.push(dt(ev[i].frame, ev[j].frame)); break; } if (is(ev[j], 'toe-off')) break; }
    }
    const n = (a, w) => a.length + ' ' + w + (a.length > 1 ? 's' : '');
    if (c.length) out.push(['Contact time', fx(mean(c), 3) + ' s', n(c, 'contact') + (c.length > 1 ? ', range ' + fx(Math.min(...c), 3) + '\u2013' + fx(Math.max(...c), 3) : ''), mean(c), 's']);
    if (fl.length) out.push(['Flight time', fx(mean(fl), 3) + ' s', n(fl, 'flight'), mean(fl), 's']);
    if (st.length) { out.push(['Step time', fx(mean(st), 3) + ' s', n(st, 'step'), mean(st), 's']); out.push(['Step frequency', fx(1 / mean(st), 2) + ' Hz', '1 \u00f7 step time', 1 / mean(st), 'Hz']); }
    if (st.length && mean(st) > 0.4 && c.length && mean(c) < 0.25) out.push(['Check your events', 'One foot only?', 'Step time looks like a whole stride. Mark both feet\u2019s touchdowns and toe-offs to get flight and step values.']);
    const u = S.calib ? 'm' : 'px';
    if (sl.length) { out.push(['Step length', fx(mean(sl), S.calib ? 2 : 0) + ' ' + u, foot + ' position at touchdowns', mean(sl), u]); if (st.length) out.push(['Speed (step length \u00d7 frequency)', fx(mean(sl) / mean(st), S.calib ? 2 : 0) + ' ' + u + '/s', '', mean(sl) / mean(st), u + '/s']); }
    else if (st.length) out.push(['Step length', '\u2013', foot ? 'Digitise the ' + foot + ' on touchdown frames (or use Measure)' : 'Choose a foot marker above, or use Measure']);
  } else if (S.activity === 'jump') {
    const f = (n) => { const e = ev.find((x) => is(x, n)); return e ? e.frame : null; };
    const s0 = f('start'), lo = f('lowest'), to = f('take-off'), ld = f('landing');
    if (to !== null && ld !== null && ld > to) { const T = dt(to, ld); out.push(['Flight time', fx(T, 3) + ' s', '', T, 's']); out.push(['Jump height (flight time)', fx(G * T * T / 8 * 100, 1) + ' cm', 'h = g t\u00b2 \u00f7 8', G * T * T / 8 * 100, 'cm']); out.push(['Take-off velocity (from flight)', fx(G * T / 2, 2) + ' m/s', 'v = g t \u00f7 2', G * T / 2, 'm/s']); }
    if (s0 !== null && lo !== null && lo > s0) out.push(['Downward phase', fx(dt(s0, lo), 3) + ' s', 'start \u2192 lowest point', dt(s0, lo), 's']);
    if (lo !== null && to !== null && to > lo) out.push(['Upward phase', fx(dt(lo, to), 3) + ' s', 'lowest point \u2192 take-off', dt(lo, to), 's']);
    if (s0 !== null && to !== null && to > s0) out.push(['Time to take-off', fx(dt(s0, to), 3) + ' s', '', dt(s0, to), 's']);
  }
  return out;
}

// ---------- suggest events from the foot marker's path ----------
export function suggestEvents() {
  const S = A.S, note = $('suggestNote');
  const mkr = footMarker(), hip = hipMarker();
  const s = mkr && series(mkr);
  if (!mkr) { note.textContent = 'Choose the foot marker above first.'; return; }
  if (!s || s.X.length < 8) { note.textContent = 'Digitise or track the ' + mkr + ' first, on at least 8 frames, then try again.'; return; }
  // the size of the athlete, so this works without calibration: hip-to-foot distance is roughly 0.9 m
  let unit = S.calib ? 1 : null;
  if (!unit && hip) {
    const L = []; Object.keys(S.frames).forEach((f) => { const a = S.frames[f][hip], b = S.frames[f][mkr]; if (a && b) { const A1 = toWorld(a), B1 = toWorld(b); L.push(Math.hypot(A1[0] - B1[0], A1[1] - B1[1])); } });
    if (L.length >= 3) { L.sort((a, b) => a - b); unit = L[Math.floor(L.length * 0.9)] / 0.9; }
  }
  if (!unit) { note.textContent = 'Calibrate, or choose a hip marker above, so the tool knows the size of the athlete.'; return; }
  const fs = s.fs, fc = Math.min(12, fs / 2 * 0.8), y = butter(s.Y, fc, fs), x = butter(s.X, fc, fs);
  const ground = y.slice().sort((a, b) => a - b)[Math.floor(y.length * 0.05)], added = [];
  const add = (n, f) => { if (!S.events.some((e) => e.name === n && Math.abs(e.frame - f) <= s.step)) { S.events.push({ id: uid(), name: n, frame: f }); added.push(n + ' (' + tReal(f).toFixed(3) + ' s)'); } };
  if (S.activity === 'jump') {
    const on = y.map((v) => v <= ground + 0.015 * unit);
    for (let i = 1; i < on.length; i++) if (on[i - 1] && !on[i]) { add('Take-off', s.F[i - 1]); for (let j = i + 1; j < on.length; j++) if (on[j]) { add('Landing', s.F[j]); break; } break; }
    const hs = hip && series(hip);
    if (hs) {
      const hy = butter(hs.Y, Math.min(8, hs.fs / 2 * 0.8), hs.fs), hv = centralDiff(hs.T, hy); let lo = 0;
      const toE = S.events.find((e) => e.name === 'Take-off'), toF = toE ? toE.frame : undefined;
      for (let k = 0; k < hy.length; k++) if ((toF === undefined || hs.F[k] < toF) && hy[k] < hy[lo]) lo = k;
      add('Lowest point', hs.F[lo]);
      for (let k = 1; k < lo; k++) if (hv[k] !== null && hv[k] < -0.1 * unit) { add('Start of movement', hs.F[k - 1]); break; }
    }
  } else if (S.activity === 'sprint') {
    // A foot is on the ground when it has (almost) stopped moving forwards and is near the lowest it gets
    // around that time. The ground can slope in the picture, so "lowest" is judged over the nearby 0.3 s.
    const vx = centralDiff(s.T, x), hs = hip && series(hip);
    const med = (a) => { const b = a.filter((v) => v !== null && !Number.isNaN(v)).map(Math.abs).sort((p, q) => p - q); return b[Math.floor(b.length / 2)]; };
    const ref = hs ? med(centralDiff(hs.T, butter(hs.X, Math.min(6, hs.fs / 2 * 0.8), hs.fs))) : med(vx); // typical running speed
    const win = Math.max(2, Math.round(0.15 * s.fs)), minLen = Math.max(2, Math.round(0.04 * s.fs));
    const c = y.map((v, i) => {
      if (vx[i] === null || Math.abs(vx[i]) > 0.4 * ref) return false;
      let lo = Infinity; for (let k = Math.max(0, i - win); k <= Math.min(y.length - 1, i + win); k++) lo = Math.min(lo, y[k]);
      return v <= lo + 0.05 * unit;
    });
    // close short gaps (a glitchy frame or two in the middle of a contact)
    const gap = Math.max(1, Math.round(0.03 * s.fs));
    for (let i = 1; i < c.length; i++) if (!c[i] && c[i - 1]) { let j = i; while (j < c.length && !c[j]) j++; if (j < c.length && j - i <= gap) for (let k = i; k < j; k++) c[k] = true; i = j; }
    for (let i = 0; i < c.length; i++) {
      if (c[i] && (i === 0 || !c[i - 1])) { let e = i; while (e + 1 < c.length && c[e + 1]) e++; if (e - i + 1 >= minLen && i > 0 && e < c.length - 1) { add('Touchdown', s.F[i]); add('Toe-off', s.F[e]); } i = e; }
    }
  } else { note.textContent = 'Suggestions work for sprints and jumps. Mark events for other movements by hand.'; return; }
  sortEvents(); persist(); renderEvents(); draw();
  note.innerHTML = added.length ? 'Added: ' + esc(added.join(', ')) + '. <strong>Check each one frame by frame</strong> and nudge it if needed.' + (S.activity === 'sprint' ? ' These are for the ' + esc(mkr) + ' only. Add the other foot&rsquo;s touchdowns and toe-offs yourself.' : '') : 'No new events found. Mark them by hand.';
}

export function initEvents() {
  $('evAddType').addEventListener('click', () => { const n = $('evNewType').value.trim(); if (!n) return; const t = eventTypes(); if (!t.includes(n)) t.push(n); $('evNewType').value = ''; persist(); renderEventBtns(); });
  $('evNewType').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('evAddType').click(); } });
  $('suggestEv').addEventListener('click', suggestEvents);
  $('evFoot').addEventListener('change', () => { A.S.footMarker = $('evFoot').value; persist(); renderEvents(); });
  $('evHip').addEventListener('change', () => { A.S.hipMarker = $('evHip').value; persist(); renderEvents(); });
  $('ivAdd').addEventListener('click', () => { const a = $('ivA').value, b = $('ivB').value; if (!a || !b || a === b) { status('Pick two different events.'); return; } let ea = byId(a), eb = byId(b); if (ea.frame > eb.frame) [ea, eb] = [eb, ea]; A.S.intervals.push({ a: ea.id, b: eb.id, label: '' }); persist(); renderIntervals(); });
  $('ivAuto').addEventListener('click', () => { const ev = A.S.events; for (let i = 1; i < ev.length; i++) if (!A.S.intervals.some((iv) => iv.a === ev[i - 1].id && iv.b === ev[i].id)) A.S.intervals.push({ a: ev[i - 1].id, b: ev[i].id, label: ev[i - 1].name + ' to ' + ev[i].name }); persist(); renderIntervals(); });
  $('loopGo').addEventListener('click', () => { let a = byId($('loopA').value), b = byId($('loopB').value); if (!a || !b || a === b) { status('Pick two different events to loop between.'); return; } if (a.frame > b.frame) [a, b] = [b, a]; play(+$('loopRate').value, a.frame, b.frame); status('Looping ' + esc(a.name) + ' to ' + esc(b.name) + '. Press <strong>Pause</strong> to stop.'); });
  $('loopStop').addEventListener('click', pause);
}
