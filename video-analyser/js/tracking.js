// Automatic digitising: marker tracking by template matching.
import { A, $, esc, status, persist, points, fpsReal } from './state.js?v=2.0.2';
import { seekAsync, grab, seek } from './video.js?v=2.0.2';
import { draw, rad, markerHalf, renderChips, updateDigiCount } from './overlay.js?v=2.0.2';

// ---------- flags (points the student should check) ----------
export function clearFlag(f, m) {
  const S = A.S;
  if (S.conf[f]) delete S.conf[f][m];
  if (S.flags[f]) { S.flags[f] = S.flags[f].filter((x) => x.m !== m); if (!S.flags[f].length) delete S.flags[f]; }
}
export function addFlag(f, m, msg, kind) {
  const S = A.S; if (!S.flags[f]) S.flags[f] = [];
  if (S.flags[f].some((x) => x.m === m && x.msg === msg)) return;
  S.flags[f].push({ m, msg, k: kind || 'track' });
}
export function renderFlags() {
  const S = A.S, F = Object.keys(S.flags).map(Number).sort((a, b) => a - b);
  const n = F.reduce((a, f) => a + S.flags[f].length, 0);
  $('flagCount').textContent = n ? '(' + n + ' to check)' : '(nothing flagged)';
  if (!F.length) { $('flagTab').innerHTML = '<tr><td class="muted">Nothing flagged yet.</td></tr>'; return; }
  const rows = [];
  F.forEach((f) => S.flags[f].forEach((x) => rows.push('<tr><td class="num"><a href="#" data-go="' + f + '">Frame ' + f + '</a></td><td>' + esc(x.m || '') + '</td><td>' + esc(x.msg) + '</td></tr>')));
  $('flagTab').innerHTML = '<tr><th>Frame</th><th>Marker</th><th>Why</th></tr>' + rows.slice(0, 200).join('') + (rows.length > 200 ? '<tr><td colspan="3" class="muted">&hellip;and ' + (rows.length - 200) + ' more</td></tr>' : '');
  $('flagTab').querySelectorAll('[data-go]').forEach((a) => a.addEventListener('click', (ev) => {
    ev.preventDefault(); const f = +a.getAttribute('data-go'); seek(f);
    const x = S.flags[f] && S.flags[f][0]; if (x && x.m) { A.activeMarker = x.m; renderChips(); }
  }));
}

// After tracking: flag frames where a rigid 2D body does not hold.
export function qualityFlags() {
  const S = A.S;
  Object.keys(S.flags).forEach((f) => { S.flags[f] = S.flags[f].filter((x) => x.k !== 'qc'); if (!S.flags[f].length) delete S.flags[f]; });
  S.template.links.forEach((sg) => {
    const L = [];
    Object.keys(S.frames).forEach((f) => { const a = S.frames[f][sg[0]], b = S.frames[f][sg[1]]; if (a && b) L.push([+f, Math.hypot(a[0] - b[0], a[1] - b[1])]); });
    if (L.length < 8) return;
    const v = L.map((x) => x[1]).sort((a, b) => a - b), med = v[Math.floor(v.length / 2)];
    if (med < 3 * rad()) return; // too short to judge (e.g. heel to ankle)
    L.forEach((x) => { const d = x[1] / med - 1; if (Math.abs(d) > 0.12 && Math.abs(x[1] - med) > 1.5 * rad()) addFlag(x[0], sg[1], sg[0] + '–' + sg[1] + ' looks ' + (d > 0 ? 'longer' : 'shorter') + ' by ' + Math.round(Math.abs(d) * 100) + '%', 'qc'); });
  });
  points().forEach((m) => {
    const F = Object.keys(S.frames).map(Number).filter((f) => S.frames[f][m]).sort((a, b) => a - b);
    for (let i = 1; i < F.length - 1; i++) {
      if (F[i] - F[i - 1] !== F[i + 1] - F[i]) continue;
      const a = S.frames[F[i - 1]][m], b = S.frames[F[i]][m], c = S.frames[F[i + 1]][m];
      const mid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2], dev = Math.hypot(b[0] - mid[0], b[1] - mid[1]), span = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (dev > Math.max(2.5 * rad(), 0.6 * span)) addFlag(F[i], m, 'Jumps out of line with the frames either side', 'qc');
    }
  });
}

// ---------- template matching ----------
function patchAt(img, cx, cy, h) {
  const W = img.width, H = img.height, d = img.data; cx = Math.round(cx); cy = Math.round(cy);
  if (cx - h < 0 || cy - h < 0 || cx + h >= W || cy + h >= H) return null;
  const n = 2 * h + 1, out = new Float32Array(n * n * 3); let k = 0;
  for (let y = cy - h; y <= cy + h; y++) { const row = y * W * 4; for (let x = cx - h; x <= cx + h; x++) { const i = row + x * 4; out[k++] = d[i]; out[k++] = d[i + 1]; out[k++] = d[i + 2]; } }
  return out;
}
function prepT(t) {
  if (!t) return null;
  const n = t.length; let m = 0; for (let i = 0; i < n; i++) m += t[i]; m /= n;
  const z = new Float32Array(n); let ss = 0; for (let i = 0; i < n; i++) { z[i] = t[i] - m; ss += z[i] * z[i]; }
  return { z, norm: Math.sqrt(ss) };
}
// Zero-mean normalised cross-correlation (colour) of template T with the patch centred on (cx, cy).
function zncc(img, cx, cy, h, T) {
  const W = img.width, d = img.data, z = T.z, n = z.length; let sum = 0, sum2 = 0, dot = 0, k = 0;
  for (let y = cy - h; y <= cy + h; y++) { const row = y * W * 4; for (let x = cx - h; x <= cx + h; x++) { const i = row + x * 4; const r = d[i], g = d[i + 1], b = d[i + 2]; sum += r + g + b; sum2 += r * r + g * g + b * b; dot += r * z[k] + g * z[k + 1] + b * z[k + 2]; k += 3; } }
  const v = sum2 - sum * sum / n; if (v <= 1e-6 || T.norm < 1e-6) return 0;
  return dot / (Math.sqrt(v) * T.norm);
}
function subpix(a, b, c) { const den = a - 2 * b + c; if (den >= 0) return 0; return Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / den)); }
function matchSearch(img, pred, h, R, Ts) {
  const W = img.width, H = img.height;
  const x0 = Math.max(h, Math.round(pred[0] - R)), x1 = Math.min(W - h - 1, Math.round(pred[0] + R));
  const y0 = Math.max(h, Math.round(pred[1] - R)), y1 = Math.min(H - h - 1, Math.round(pred[1] + R));
  if (x1 < x0 || y1 < y0) return { p: pred, score: -1 };
  const cache = new Map();
  const sc = (x, y) => { const key = y * W + x; if (cache.has(key)) return cache.get(key); let best = -2; for (const T of Ts) { if (!T) continue; const v = zncc(img, x, y, h, T); if (v > best) best = v; } cache.set(key, best); return best; };
  let best = -2, bx = Math.round(pred[0]), by = Math.round(pred[1]);
  const stp = h >= 8 ? 2 : 1;
  for (let y = y0; y <= y1; y += stp) for (let x = x0; x <= x1; x += stp) { const v = sc(x, y); if (v > best) { best = v; bx = x; by = y; } }
  const cx = bx, cy = by;
  for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) { if (x < h || y < h || x >= W - h || y >= H - h) continue; const v = sc(x, y); if (v > best) { best = v; bx = x; by = y; } }
  const dx = (bx - 1 >= h && bx + 1 < W - h) ? subpix(sc(bx - 1, by), best, sc(bx + 1, by)) : 0;
  const dy = (by - 1 >= h && by + 1 < H - h) ? subpix(sc(bx, by - 1), best, sc(bx, by + 1)) : 0;
  return { p: [bx + dx, by + dy], score: best, edge: (bx <= x0 + 1 || bx >= x1 - 1 || by <= y0 + 1 || by >= y1 - 1) && (x1 - x0 > 4) };
}

function setBusy(on, label) {
  A.busy = on; ['trkFwd', 'trkBack', 'calc'].forEach((id) => { if ($(id)) $(id).disabled = on; });
  $('autoStop').disabled = !on && !A.trackResume; if (!on) $('autoProg').style.width = '0';
  if (label !== undefined) $('autoInfo').textContent = label;
}
function progress(i, n) { $('autoProg').style.width = Math.min(100, Math.round(100 * i / Math.max(1, n))) + '%'; }
function endFrame(dir) {
  let end = Math.max(0, Math.min(A.nFrames - 1, parseInt($('trkTo').value, 10)));
  if (Number.isNaN(end)) end = dir > 0 ? A.nFrames - 1 : 0;
  if (dir > 0 && end <= A.cur) end = A.nFrames - 1;
  if (dir < 0 && end >= A.cur) end = 0;
  return end;
}

// ---------- pausing when a marker is lost ----------
function showPause() {
  const P = A.trackResume, b = $('trkBanner');
  if (!P) { b.classList.add('hide'); $('stage').classList.remove('paused'); return; }
  const left = P.lost.filter((m) => !(A.S.frames[A.cur] && A.S.frames[A.cur][m]));
  b.classList.remove('hide'); $('stage').classList.add('paused');
  $('trkBannerText').innerHTML = '<strong>Tracking paused at frame ' + A.cur + '.</strong> Click the <strong>' + esc(left.join(', then the ')) + '</strong> where ' + (left.length > 1 ? 'they are' : 'it is') + ' now. Tracking carries on by itself as soon as you have.';
  A.activeMarker = left[0] || null; renderChips(); draw();
  status($('trkBannerText').innerHTML);
}
export function stopTrackPause() { A.trackResume = null; A.pauseAdvance = false; if ($('trkBanner')) showPause(); setBusy(false); }
// Called by the overlay after every click. Returns true if the click was part of a paused track.
export function onTrackClick() {
  const P = A.trackResume; if (!P) return false;
  if (A.cur !== P.frame) { stopTrackPause(); return false; } // the student moved away: drop the pause
  const fr = A.S.frames[A.cur] || {}, left = P.lost.filter((m) => !fr[m]);
  if (left.length) { showPause(); return true; }
  const dir = P.dir; A.trackResume = null; showPause();
  setTimeout(() => runTrack(dir, { here: true }), 50);
  return true;
}
// "Marker hidden": leave a gap for the lost marker(s) and carry on tracking the others.
async function markerHidden() {
  const P = A.trackResume; if (!P) return;
  const fr = A.S.frames[A.cur] || {}, hid = P.lost.filter((m) => !fr[m]);
  hid.forEach((m) => addFlag(A.cur, m, 'Hidden from here: click it where it reappears, then track again', 'track'));
  const dir = P.dir; A.trackResume = null; showPause(); renderFlags();
  if (!Object.keys(fr).length) { status('No markers left to track on this frame.'); setBusy(false); return; }
  await runTrack(dir, { here: true, note: hid });
}

// ---------- tracking ----------
// Tracks every marker that is on the start frame. The start frame is the current frame if it has
// markers; otherwise the nearest frame behind it with the most markers (the usual case after the
// tool has jumped forward to the next frame to click).
export async function runTrack(dir, opts) {
  opts = opts || {};
  const S = A.S; if (A.busy || !S.vw) return;
  if (!points().length) { $('trkNote').innerHTML = '<span class="bad">Add your markers in the Markers tab first.</span>'; return; }
  const count = (f) => (S.frames[f] ? points().filter((m) => S.frames[f][m]).length : 0);
  if (!opts.here) {
    const all = points().length;
    if (count(A.cur) < all) {
      const cand = Object.keys(S.frames).map(Number).filter((f) => count(f) > 0 && (dir > 0 ? f <= A.cur : f >= A.cur));
      const best = cand.length ? Math.max(...cand.map(count)) : 0;
      const pickFrom = cand.filter((f) => count(f) === best);
      const pick = pickFrom.length ? (dir > 0 ? Math.max(...pickFrom) : Math.min(...pickFrom)) : null;
      if (pick === null || (count(A.cur) > 0 && count(A.cur) >= best)) {
        if (!count(A.cur)) { const msg = 'Click each marker once on a clear frame first, then press Track.'; $('trkNote').innerHTML = '<span class="bad">' + esc(msg) + '</span>'; status(esc(msg)); return; }
      } else { await seekAsync(pick); }
    }
  }
  const fr0 = S.frames[A.cur], mk = points().filter((m) => fr0 && fr0[m]);
  const missing = points().filter((m) => !mk.includes(m));
  $('trkNote').innerHTML = missing.length ? 'Tracking ' + esc(mk.join(', ')) + '. Not on this frame, so not tracked: ' + esc(missing.join(', ')) + '.' : '';
  const end = endFrame(dir);
  A.trackDir = dir; A.pauseAdvance = false;
  A.stopReq = false; setBusy(true, 'Tracking\u2026');
  const h = markerHalf(), thr = parseFloat($('trkThr').value);
  await seekAsync(A.cur); let img = grab(); const st = {}, bad = [];
  mk.forEach((m) => { const p = fr0[m], t = prepT(patchAt(img, p[0], p[1], h)); if (!t) bad.push(m); st[m] = { p: p.slice(), prev: p.slice(), T0: t, Tp: t }; });
  if (bad.length) { setBusy(false, ''); status(esc(bad.join(', ')) + ' is too close to the edge of the picture to track.'); return; }
  let f = A.cur, done = 0, lost = null; const total = Math.abs(end - A.cur), t0 = performance.now();
  while (!A.stopReq) {
    const nf = f + dir; if ((dir > 0 && nf > end) || (dir < 0 && nf < end)) break;
    await seekAsync(nf); img = grab();
    if (!S.frames[nf]) S.frames[nf] = {};
    const lostHere = [];
    mk.forEach((m) => {
      const s = st[m], vx = s.p[0] - s.prev[0], vy = s.p[1] - s.prev[1];
      const pred = [s.p[0] + vx, s.p[1] + vy], spd = Math.hypot(vx, vy);
      const R = Math.max(3 * h, Math.min(10 * h, 2.5 * h + spd));
      let r = matchSearch(img, pred, h, R, [s.T0, s.Tp]);
      if (r.score < thr || r.edge) { // one wider look before giving up (sudden change of speed, e.g. foot contact)
        const r2 = matchSearch(img, pred, h, Math.min(14 * h, R * 1.8), [s.T0, s.Tp]);
        if (r2.score >= thr && !r2.edge) r = r2;
      }
      if (r.score < thr || r.edge) { lostHere.push(m); return; }
      s.prev = s.p; s.p = r.p;
      const t = prepT(patchAt(img, r.p[0], r.p[1], h)); if (t) s.Tp = t;
      S.frames[nf][m] = [r.p[0], r.p[1]];
      clearFlag(nf, m);
      if (!S.conf[nf]) S.conf[nf] = {};
      S.conf[nf][m] = { s: +r.score.toFixed(3), src: 'track' };
      if (r.score < thr + 0.1) addFlag(nf, m, 'Low match (' + r.score.toFixed(2) + ')', 'track');
    });
    f = nf; done++; progress(done, total); draw();
    if (lostHere.length) { lost = { f: nf, m: lostHere }; break; }
  }
  const secs = (performance.now() - t0) / 1000;
  qualityFlags(); persist(); setBusy(false, ''); renderFlags(); updateDigiCount();
  if (lost) {
    lost.m.forEach((m) => { delete S.frames[lost.f][m]; addFlag(lost.f, m, 'Tracking lost here and clicked by hand', 'track'); });
    A.trackResume = { dir, lost: lost.m, frame: lost.f }; A.pauseAdvance = true;
    setBusy(false); showPause();
  } else {
    renderChips();
    const hid = opts.note && opts.note.length ? ' ' + esc(opts.note.join(', ')) + (opts.note.length > 1 ? ' were' : ' was') + ' left out from the hidden frame on. Go to where ' + (opts.note.length > 1 ? 'they reappear' : 'it reappears') + ', click ' + (opts.note.length > 1 ? 'them' : 'it') + ', and track again.' : '';
    status((A.stopReq ? 'Stopped after ' : 'Tracked ') + done + ' frames in ' + secs.toFixed(0) + ' s.' + hid + ' Check anything listed under &ldquo;Check the tracking&rdquo;, then press <strong>Update results</strong>.');
  }
}

export function initTracking() {
  $('trkFwd').addEventListener('click', () => runTrack(1));
  $('trkBack').addEventListener('click', () => runTrack(-1));
  $('trkHidden').addEventListener('click', markerHidden);
  $('trkCancel').addEventListener('click', () => { stopTrackPause(); status('Tracking stopped.'); });
  $('autoStop').addEventListener('click', () => { A.stopReq = true; if (A.trackResume) { stopTrackPause(); status('Tracking stopped.'); } });
  A.fn.onTrackClick = onTrackClick; A.fn.stopTrackPause = stopTrackPause;
  window.__KVA_track = runTrack; window.__KVA_busy = () => A.busy; window.__KVA_hidden = markerHidden;
}
