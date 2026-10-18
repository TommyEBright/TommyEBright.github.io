// Automatic digitising: marker tracking (template matching) and AI pose estimation (MediaPipe).
import { A, $, esc, status, persist, points, fpsReal } from './state.js';
import { seekAsync, grab, viewCanvas, seek } from './video.js';
import { draw, rad, markerHalf, renderChips, updateDigiCount } from './overlay.js';

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
  $('flagTab').innerHTML = '<tr><th>Frame</th><th>Point</th><th>Why</th></tr>' + rows.slice(0, 200).join('') + (rows.length > 200 ? '<tr><td colspan="3" class="muted">&hellip;and ' + (rows.length - 200) + ' more</td></tr>' : '');
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
  A.busy = on; ['trkFwd', 'trkBack', 'trkCont', 'poseRun', 'calc'].forEach((id) => { if ($(id)) $(id).disabled = on; });
  $('autoStop').disabled = !on; if (!on) $('autoProg').style.width = '0';
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

export async function runTrack(dir) {
  const S = A.S; if (A.busy || !S.vw) return;
  const mk = points(), full = (f) => S.frames[f] && mk.every((m) => S.frames[f][m]);
  if (!full(A.cur)) {
    // The usual case: all points were clicked on a frame, then the tool jumped forward to the next one.
    // Start from the nearest fully clicked frame instead of making the student go back.
    const done = Object.keys(S.frames).map(Number).filter(full);
    const before = done.filter((f) => (dir > 0 ? f <= A.cur : f >= A.cur));
    const pick = before.length ? (dir > 0 ? Math.max(...before) : Math.min(...before)) : null;
    if (pick === null) {
      const fr = S.frames[A.cur] || {}, miss = mk.filter((m) => !fr[m]);
      const msg = 'Marker tracking needs you to click every point once first (still to do on this frame: ' + miss.join(', ') + '). No markers on the athlete? Use B. AI pose below instead.';
      $('trkNote').innerHTML = '<span class="bad">' + esc(msg) + '</span>'; status(esc(msg)); return;
    }
    await seekAsync(pick); A.activeMarker = null; renderChips();
  }
  const fr0 = S.frames[A.cur];
  $('trkNote').textContent = fpsReal() < 90 && S.activity === 'sprint' ? 'Tip: at ' + fpsReal() + ' fps a sprinting foot moves a long way between frames, so tracking may stop often. Slow motion (120 or 240 fps) works much better.' : '';
  const end = endFrame(dir);
  A.trackDir = dir; A.pauseAdvance = false; $('trkCont').classList.add('hide');
  A.stopReq = false; setBusy(true, 'Tracking…');
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
  qualityFlags(); persist(); setBusy(false, ''); renderFlags(); updateDigiCount(); renderChips();
  if (lost) {
    A.pauseAdvance = true; A.activeMarker = lost.m[0];
    lost.m.forEach((m) => { delete S.frames[lost.f][m]; addFlag(lost.f, m, 'Tracking lost here: click it, then Continue', 'track'); });
    renderFlags(); renderChips(); draw();
    $('trkCont').classList.remove('hide');
    status('Lost the <strong>' + esc(lost.m.join(', ')) + '</strong> at frame ' + lost.f + '. Click where ' + (lost.m.length > 1 ? 'they are' : 'it is') + ' now, then press <strong>Continue tracking</strong>.');
  } else {
    status((A.stopReq ? 'Stopped after ' : 'Tracked ') + done + ' frames in ' + secs.toFixed(0) + ' s. Check anything listed under &ldquo;Check the tracking&rdquo;, then open Results.');
  }
}

// ---------- AI pose (MediaPipe Pose Landmarker, image mode with a crop that follows the athlete) ----------
const MP_VER = '0.10.14';
const MP_BASE = () => window.KVA_MP_BASE || window.VA_MP_BASE || ('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + MP_VER);
const MP_MODELS = () => window.KVA_MP_MODELS || window.VA_MP_MODELS || {
  lite: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  full: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
  heavy: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task'
};
// MediaPipe landmark numbers for each named point (BlazePose 33-point model).
export const LMK = {
  left: { Head: 7, Shoulder: 11, Elbow: 13, Wrist: 15, Hip: 23, Knee: 25, Ankle: 27, Heel: 29, Toe: 31 },
  right: { Head: 8, Shoulder: 12, Elbow: 14, Wrist: 16, Hip: 24, Knee: 26, Ankle: 28, Heel: 30, Toe: 32 }
};
const NOSE = 0, CROP = 512;
let visionMod = null;
async function makeLandmarker(kind) {
  if (!visionMod) visionMod = await import(/* @vite-ignore */ MP_BASE() + '/vision_bundle.mjs');
  const fs = await visionMod.FilesetResolver.forVisionTasks(MP_BASE() + '/wasm');
  const opts = (dl) => ({ baseOptions: { modelAssetPath: MP_MODELS()[kind], delegate: dl }, runningMode: 'IMAGE', numPoses: 1, minPoseDetectionConfidence: 0.4, minPosePresenceConfidence: 0.4, minTrackingConfidence: 0.4 });
  try { return await visionMod.PoseLandmarker.createFromOptions(fs, opts('GPU')); } catch (e) { return visionMod.PoseLandmarker.createFromOptions(fs, opts('CPU')); }
}
const cropCv = document.createElement('canvas'); cropCv.width = CROP; cropCv.height = CROP;
const cropCtx = cropCv.getContext('2d', { willReadFrequently: true });
// Run the model on a square [sx, sy, side] of the view (parts outside the picture are black). Returns landmarks in view pixels.
function detectSquare(lm, sx, sy, side) {
  const src = viewCanvas(), W = src.width, H = src.height, k = CROP / side;
  cropCtx.fillStyle = '#000'; cropCtx.fillRect(0, 0, CROP, CROP);
  const ix0 = Math.max(0, sx), iy0 = Math.max(0, sy), ix1 = Math.min(W, sx + side), iy1 = Math.min(H, sy + side);
  if (ix1 <= ix0 || iy1 <= iy0) return null;
  cropCtx.drawImage(src, ix0, iy0, ix1 - ix0, iy1 - iy0, (ix0 - sx) * k, (iy0 - sy) * k, (ix1 - ix0) * k, (iy1 - iy0) * k);
  let res; try { res = lm.detect(cropCv); } catch (e) { return null; }
  if (!res || !res.landmarks || !res.landmarks.length) return null;
  return res.landmarks[0].map((p) => ({ x: sx + p.x * side, y: sy + p.y * side, v: p.visibility === undefined ? 1 : p.visibility }));
}
function bbox(L) {
  // body box from the reliable landmarks (ignore points pushed outside the picture)
  const use = L.filter((p, i) => i >= 11 && p.v > 0.3); const src = use.length >= 6 ? use : L;
  const xs = src.map((p) => p.x), ys = src.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys, L[NOSE].y), y1 = Math.max(...ys);
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, size: Math.max(x1 - x0, y1 - y0) };
}
// How sure the model is that this is a whole, real body: mean visibility of shoulders, hips, knees and ankles.
const BODY = [11, 12, 23, 24, 25, 26, 27, 28];
const bodyScore = (L) => BODY.reduce((a, i) => a + L[i].v, 0) / BODY.length;
function findPerson(lm, last) {
  const W = A.S.vw, H = A.S.vh, m = Math.min(W, H);
  const refine = (L, side) => { // a small person is cut out again more tightly for a sharper fit
    const b = bbox(L); if (b.size >= side * 0.33) return { L, b, sc: bodyScore(L) };
    const s2 = Math.max(192, b.size * 1.7), L2 = detectSquare(lm, b.cx - s2 / 2, b.cy - s2 / 2, s2);
    return L2 && bodyScore(L2) >= bodyScore(L) ? { L: L2, b: bbox(L2), sc: bodyScore(L2) } : { L, b, sc: bodyScore(L) };
  };
  if (last) { // follow the athlete from the last frame
    const side = Math.max(192, last.size * 1.7), L = detectSquare(lm, last.cx - side / 2, last.cy - side / 2, side);
    if (L && bodyScore(L) >= 0.5) { const r = refine(L, side); if (Math.hypot(r.b.cx - last.cx, r.b.cy - last.cy) < last.size) return r; }
  }
  // otherwise search the whole picture at three zoom levels and keep the most convincing body
  const tries = [[(W - Math.max(W, H)) / 2, (H - Math.max(W, H)) / 2, Math.max(W, H)]];
  const scan = (side) => { const nx = Math.max(1, Math.ceil((W - side) / (side / 2)) + 1), ny = Math.max(1, Math.ceil((H - side) / (side / 2)) + 1); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) tries.push([nx === 1 ? (W - side) / 2 : i * (W - side) / (nx - 1), ny === 1 ? (H - side) / 2 : j * (H - side) / (ny - 1), side]); };
  scan(m); scan(m / 2);
  let best = null;
  for (const t of tries) {
    const L = detectSquare(lm, t[0], t[1], t[2]); if (!L || bodyScore(L) < 0.5) continue;
    const r = refine(L, t[2]); if (!best || r.sc > best.sc) best = r;
    if (best.sc > 0.9) break;
  }
  return best;
}

export async function runPose() {
  const S = A.S; if (A.busy || !S.vw) return;
  const target = $('poseTarget').value, step = parseInt($('poseEvery').value, 10) || 1;
  let end = Math.max(A.cur, Math.min(A.nFrames - 1, parseInt($('trkTo').value, 10) || A.nFrames - 1));
  if (end <= A.cur) end = A.nFrames - 1;
  const mk = points().filter((m) => LMK.left[m] !== undefined), skip = points().filter((m) => LMK.left[m] === undefined);
  if (!mk.length) { status('None of this template&rsquo;s points are ones the AI knows (it knows: ' + Object.keys(LMK.left).join(', ') + '). Use marker tracking or rename the points.'); return; }
  A.stopReq = false; setBusy(true, 'Loading the AI model (the first time can take up to a minute)…');
  status('Loading the AI pose model…');
  let lm;
  try { lm = await makeLandmarker($('poseModel').value); } catch (e) {
    setBusy(false, ''); status('<span class="bad"><strong>The AI model could not be loaded.</strong> Check your internet connection (the model is downloaded the first time, then kept). On a university network, try again off the VPN. Marker tracking works offline.</span>'); return;
  }
  $('autoInfo').textContent = 'Running AI pose…';
  const layer = target === 'alt' ? S.alt : S.frames;
  let side = $('poseSide').value, prev = null, prev2 = null, last = null, done = 0, none = 0, swaps = 0;
  const total = Math.ceil((end - A.cur + 1) / step), t0 = performance.now();
  for (let f = A.cur; f <= end && !A.stopReq; f += step) {
    await seekAsync(f);
    const hit = findPerson(lm, last);
    done++; progress(done, total);
    if (!hit) { none++; last = null; prev = null; prev2 = null; if (target === 'main') addFlag(f, '', 'AI: no person found', 'pose'); continue; }
    last = hit.b; const L = hit.L;
    if (side === 'auto') {
      const sl = [25, 27, 31, 23].reduce((a, i) => a + L[i].v, 0), sr = [26, 28, 32, 24].reduce((a, i) => a + L[i].v, 0);
      side = sl >= sr ? 'left' : 'right';
      $('autoInfo').textContent = 'Using the athlete’s ' + side + ' side (the one nearer the camera).';
    }
    const other = side === 'left' ? 'right' : 'left';
    const pt = (sd, m) => { const a = L[LMK[sd][m]]; return [a.x, a.y, a.v]; };
    // In side views the AI often swaps the athlete's left and right. Decide which set of points is the
    // near side by following the legs: each foot should be close to where its own movement predicts.
    const LEGS = ['Knee', 'Ankle', 'Heel', 'Toe'], legs = (sd) => LEGS.map((m) => pt(sd, m));
    let use = side;
    if (prev) {
      const pred = prev.legs.map((q, i) => (prev2 ? [2 * q[0] - prev2.legs[i][0], 2 * q[1] - prev2.legs[i][1]] : q));
      const cost = (arr) => arr.reduce((a, q, i) => a + Math.hypot(q[0] - pred[i][0], q[1] - pred[i][1]), 0);
      const keep = cost(legs(side)), swp = cost(legs(other));
      if (swp < keep) { use = other; swaps++; }
      if (target === 'main' && Math.min(keep, swp) / Math.max(keep, swp) > 0.75 && Math.max(keep, swp) > 8 * rad()) addFlag(f, 'Ankle', 'AI unsure which leg is which: check', 'pose');
    }
    // Head, shoulder and hip: the middle of the left and right points. In a side view the two sides almost
    // overlap, and the AI swaps them often, so the midpoint is steadier (and is the pelvis/trunk centre line).
    const MID = { Head: 1, Shoulder: 1, Hip: 1 };
    const P = {}; mk.forEach((m) => { if (MID[m]) { const a = pt('left', m), b = pt('right', m); P[m] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.min(a[2], b[2])]; } else P[m] = pt(use, m); });
    prev2 = prev; prev = { legs: legs(use) };
    if (!layer[f]) layer[f] = {};
    mk.forEach((m) => {
      layer[f][m] = [P[m][0], P[m][1]];
      if (target === 'main') { clearFlag(f, m); if (!S.conf[f]) S.conf[f] = {}; S.conf[f][m] = { s: +P[m][2].toFixed(3), src: 'pose' }; if (P[m][2] < 0.5) addFlag(f, m, 'AI is unsure (visibility ' + P[m][2].toFixed(2) + ')', 'pose'); }
    });
    draw();
  }
  try { lm.close(); } catch (e) { /* ignore */ }
  if (target === 'main') qualityFlags();
  persist(); setBusy(false, ''); renderFlags(); updateDigiCount(); renderChips(); draw();
  status('AI pose ' + (A.stopReq ? 'stopped' : 'finished') + ': ' + done + ' frames in ' + ((performance.now() - t0) / 1000).toFixed(0) + ' s' + (none ? ', no person found in ' + none : '') + (swaps ? ', left and right swapped back on ' + swaps + ' frame' + (swaps > 1 ? 's' : '') : '') + '.' + (skip.length ? ' The AI does not know <strong>' + esc(skip.join(', ')) + '</strong>, so click those yourself.' : '') + (target === 'alt' ? ' Saved for comparison: see &ldquo;Markers vs AI&rdquo; in Results.' : ' Check the flagged frames, then open Results.'));
}

export function initTracking() {
  $('trkFwd').addEventListener('click', () => runTrack(1));
  $('trkBack').addEventListener('click', () => runTrack(-1));
  $('trkCont').addEventListener('click', () => runTrack(A.trackDir));
  $('autoStop').addEventListener('click', () => { A.stopReq = true; });
  $('poseRun').addEventListener('click', runPose);
  $('altClear').addEventListener('click', () => { if (!confirm('Remove the comparison (AI) points?')) return; A.S.alt = {}; persist(); draw(); if (A.results) A.fn.compute(); });
  window.__KVA_track = runTrack; window.__KVA_pose = runPose; window.__KVA_busy = () => A.busy;
}
