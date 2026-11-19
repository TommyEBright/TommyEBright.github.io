// Analyse: a real flight, from video (calibrate and digitise here) or from position data (e.g. a marker exported
// from Kinematic Analysis), to release speed, angle and height, what they predict, and what-ifs.
// Coordinates: metres, y up, x in the direction of travel (the tool mirrors the data if the flight goes right to left).
import { G, rad, deg, fitFlight, polar, pos, tAtHeight, peakRise, fromPolar, range, optimumAngle, minSpeedToTarget, speedForTarget, DEMOS, VIDEO_DEMO, FORCE_DEMO } from './maths.js?v=1.5.0';
import { findBall, trackBall } from './ball.js?v=1.5.0';
import { parseForce, analyseSLJ } from './forceplate.js?v=1.5.0';
import { panel, line, dots, arrow, label, lim, rightMark, fmt, sgn, COL } from './plot.js?v=1.5.0';

// Targets: a basketball rim is 45.7 cm across (size 7 ball about 23.8 cm); a netball ring is 38 cm across inside
// (size 5 ball about 22.4 cm) with no backboard. A line-out has a catch point instead of a ring.
const RINGS = { freethrow: { R: 0.2286, r: 0.119, name: 'rim', board: true, what: 'hoop' }, netball: { R: 0.19, r: 0.112, name: 'ring', board: false, what: 'ring' } };
const isHoop = (t = A.task) => !!RINGS[t];
const hasTarget = (t = A.task) => isHoop(t) || t === 'lineout';
const ringOf = () => RINGS[A.task] || RINGS.freethrow;
const C = { hyp: '#1d4ed8', adj: '#d97706', opp: '#7c3aed', pts: '#0f172a', fit: '#1d4ed8', what: '#db2777', flight: '#dbeafe', out: '#94a3b8' };
const TASKS = { general: 'Any projectile', freethrow: 'Basketball shot', netball: 'Netball shot', lineout: 'Line-out throw', broadjump: 'Broad jump (centre of mass)', shot: 'Shot put' };
let app, $;
const A = fresh();
function fresh() {
  return { src: null, name: '', note: '', task: 'general', demo: null, truth: null,
    // video
    url: null, avi: null, bright: 1, vw: 0, vh: 0, fileFps: 60, realFps: 60, nF: 0, frame: 0, clicks: {}, cal: { a: null, b: null, len: 1, o: null }, mode: 'idle', stepBy: 1, hover: null, targetPx: null,
    // position data (raw, before mirroring)
    t: [], rx: [], ry: [], fr: [], flip: false, markers: null, csvParsed: null, marker: '', csv: null, units: 1, fpsData: 100,
    rel: 0, land: 0, suggested: false, fromEvents: false, event: null, hist: [], gf: 0, calBy: 'stick',
    ev: { rel: null, end: null, extra: [] }, trim: false, trackMode: 'manual', snap: true, ballR: null, ringR: null, busy: false, stopReq: false, trkMsg: '', trkDone: false,
    force: null, h0: 0.9, measured: null,
    // task inputs
    target: { x: 4.225, y: 3.05 }, landH: null, takeoffDist: 0, landingDist: 0, releaseAhead: 0,
    ex: null };
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const layer = (cls, title, html) => '<div class="layer ' + cls + '"><h3>' + title + '</h3>' + html + '</div>';
const eqn = (h) => '<p class="eqn">' + h + '</p>';
const v = (s) => '<var>' + s + '</var>';
const sub = (a, b) => v(a) + '<sub>' + b + '</sub>';

// ---------- data ----------
function X() { return A.rx.map((q) => (A.flip ? -q : q)); }
function N() { return A.t.length; }
function flight() {
  const x = X(), i0 = A.rel, i1 = A.land, t0 = A.t[i0], t = [], xs = [], ys = [];
  for (let i = i0; i <= i1; i++) { t.push(A.t[i] - t0); xs.push(x[i]); ys.push(A.ry[i]); }
  return { t, x: xs, y: ys, t0 };
}
let FIT = null, FITKEY = '';
function fit() {
  if (A.src === 'force') {
    if (!A.force) return null; const R = A.force;
    const F = { x0: A.takeoffDist, y0: A.h0, vx: R.vx, vy: R.vy, sevx: 0, sevy: 0, sey0: 0, n: Infinity, gFree: NaN, seg: NaN, rmsX: NaN, rmsY: NaN, force: true, f: { t: [0], x: [A.takeoffDist], y: [A.h0] }, dt: R.dt };
    F.pol = polar(F.vx, F.vy, 0, 0); return F;
  }
  const key = [A.rel, A.land, N(), A.flip, A.t[0], A.t[A.land], A.rx[A.rel], A.rx[A.land], A.ry[A.rel], A.ry[A.land]].join('|');
  if (key === FITKEY) return FIT;
  FITKEY = key; FIT = null;
  if (N() < 3 || A.land - A.rel < 2) return null;
  const f = flight(), F = fitFlight(f.t, f.x, f.y, minSigma()); if (!F) return null;
  F.pol = polar(F.vx, F.vy, F.sevx, F.sevy); F.f = f;
  F.dt = A.t.length > 1 ? (A.t[A.t.length - 1] - A.t[0]) / (A.t.length - 1) : 0;
  FIT = F; return F;
}
// smallest believable position error: about 1.5 pixels of clicking on video, 3 mm for imported data
function minSigma() { return A.src === 'video' && calibrated() ? 1.5 / scalePx() : 0.003; }
const P0 = (F) => ({ x0: F.x0, y0: F.y0, vx: F.vx, vy: F.vy });
function setWorld(t, x, y, fr) {
  A.t = t; A.rx = x; A.ry = y; A.fr = fr || t.map((q, i) => i);
  const n = t.length; A.flip = n > 1 && x[n - 1] < x[0];
  A.rel = 0; A.land = Math.max(0, n - 1); A.suggested = false; A.ex = null; FITKEY = '';
  if (n >= 8) suggest();
}
// Suggest the flight: the longest run of frames that is a clean projectile, i.e. a straight line horizontally and a
// parabola vertically, with gravity close to 9.81 m/s^2 and residuals no bigger than the clicking noise. The noise is
// estimated from second differences (robust to the smooth motion before release and after landing).
function suggest() {
  const n = N(), x = X(), y = A.ry; if (n < 8) return false;
  const d2 = []; for (let i = 1; i < n - 1; i++) d2.push(y[i + 1] - 2 * y[i] + y[i - 1]);
  const med = median(d2), mad = median(d2.map((q) => Math.abs(q - med)));
  const sig = Math.max(0.0015, 1.4826 * mad / Math.sqrt(6)), tol = Math.max(1.6 * sig, sig + 0.002);
  let best = null;
  for (let a = 0; a <= n - 6; a++) for (let b = n - 1; b >= a + 5; b--) {
    if (best && b - a <= best[1] - best[0]) break;
    const t = [], xs = [], ys = []; for (let i = a; i <= b; i++) { t.push(A.t[i] - A.t[a]); xs.push(x[i]); ys.push(y[i]); }
    const F = fitFlight(t, xs, ys); if (!F) continue;
    if (Math.abs(F.gFree - G) < 0.6 + 2 * F.seg && F.rmsYFree < tol && F.rmsX < tol * 1.3 && maxAbs(F.resY) < 3.5 * tol) { best = [a, b]; break; }
  }
  if (!best) return false;
  // Refine: fit the middle of the flight (g fixed), then walk out from it and keep frames that still sit on that
  // path. Near release the hand path blends smoothly into the flight, so stop one frame short at each end to be safe.
  let [a, b] = best; const k = Math.max(2, Math.round((b - a) * 0.15)), ia = a + k, ib = b - k;
  const t = [], xs = [], ys = []; for (let i = ia; i <= ib; i++) { t.push(A.t[i] - A.t[ia]); xs.push(x[i]); ys.push(y[i]); }
  const F = fitFlight(t, xs, ys);
  if (F) {
    const lim2 = 2.2 * Math.max(sig, F.rmsY, F.rmsX), off = (i) => { const tt = A.t[i] - A.t[ia]; return Math.max(Math.abs(x[i] - (F.x0 + F.vx * tt)), Math.abs(y[i] - (F.y0 + F.vy * tt - 0.5 * G * tt * tt))); };
    let s0 = ia; while (s0 - 1 >= 0 && off(s0 - 1) < lim2) s0--;
    let s1 = ib; while (s1 + 1 < n && off(s1 + 1) < lim2) s1++;
    const dtm = (A.t[n - 1] - A.t[0]) / (n - 1), m = Math.max(1, Math.round(0.015 / dtm)); // about 15 ms in from each end
    a = Math.min(s0 + m, ib - 4); b = Math.max(s1 - m, a + 4);
  }
  A.rel = a; A.land = b; A.suggested = true; A.ex = null; FITKEY = ''; return true;
}
const median = (a) => { const s = a.slice().sort((p, q) => p - q), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };
const maxAbs = (a) => a.reduce((m, q) => Math.max(m, Math.abs(q)), 0);

// ---------- loading ----------
function loadDemo(key) {
  reset(); const D = DEMOS[key]();
  A.src = 'data'; A.name = D.name; A.note = D.note; A.task = D.task; A.demo = key; A.truth = D.truth;
  if (D.target) A.target = { ...D.target }; if (D.takeoffDist !== undefined) { A.takeoffDist = D.takeoffDist; A.landingDist = D.landingDist; } if (D.releaseAhead !== undefined) A.releaseAhead = D.releaseAhead;
  A.landH = D.task === 'shot' ? 0 : null;
  A.csv = { name: key + '.csv', text: toCSV(D) };
  setWorld(D.t, D.x, D.y, D.t.map((q, i) => i));
  A.truth.tRel = D.t[D.iRel]; A.event = { rel: D.iRel, land: D.iLand, how: D.events };
  A.rel = D.iRel; A.land = D.iLand; A.suggested = false; A.fromEvents = true; FITKEY = '';
  app.render();
}
function loadForce(text, name, demo) {
  reset(); A.src = 'force'; A.name = name; A.task = 'broadjump'; A.demo = demo ? 'slj' : null;
  try { A.force = analyseSLJ(parseForce(text)); }
  catch (err) { A.src = null; A.force = null; A.note = 'Could not use this force file: ' + err.message; app.render(); return; }
  A.h0 = FORCE_DEMO.h0; A.takeoffDist = FORCE_DEMO.takeoffDist; A.landingDist = FORCE_DEMO.landingDist; A.landH = FORCE_DEMO.landH; A.measured = demo ? FORCE_DEMO.measured : null;
  A.note = (demo ? 'A real standing long jump from two force platforms at 1000 Hz. ' : '') + 'Take-off velocity comes from the forces. The platforms cannot see where the centre of mass is, so its take-off height and the take-off and landing distances are ' + (demo ? 'typical values standing in for what you would measure on video.' : 'set to typical values: change them to your own in Results.');
  FITKEY = ''; app.render();
}
function toCSV(D) { return '# ' + D.name + '\n# ' + D.note + '\ntime_s,x_m,y_m\n' + D.t.map((t, i) => t.toFixed(4) + ',' + D.x[i].toFixed(4) + ',' + D.y[i].toFixed(4)).join('\n') + '\n'; }
function reset() { const keep = A.url; Object.assign(A, fresh()); if (keep) { try { URL.revokeObjectURL(keep); } catch (e) { /* ignore */ } } FITKEY = ''; const vd = $('vid'); vd.removeAttribute('src'); vd.load(); }
function loadVideo(src, name, demo) {
  reset(); A.src = 'video'; A.name = name; A.demo = demo ? 'video' : null; A.task = demo ? 'freethrow' : 'general';
  if (demo) { A.fileFps = A.realFps = VIDEO_DEMO.fps; A.target = { ...VIDEO_DEMO.target }; A.truth = { ...fromPolar(6.982, 52, 2.10, 0.35), v: 6.982, th: 52, tRel: VIDEO_DEMO.releaseFrame / VIDEO_DEMO.fps }; A.note = 'The perfect set-up: filmed side-on from well back at 100 fps, level, with a 1 m stick (yellow and black) in the plane of the shot, and the release, the whole flight and the hoop all in shot. It went in.'; }
  else { A.url = src; A.note = 'Check the frame rates in the Scale step before you digitise.'; }
  const vd = $('vid'); vd.src = src;
  vd.onloadedmetadata = () => { A.vw = vd.videoWidth; A.vh = vd.videoHeight; A.nF = Math.max(1, Math.round(vd.duration * A.fileFps)); showFrame(0); app.render(); };
  vd.onseeked = () => { grab(); drawStage(); if (vd.requestVideoFrameCallback) vd.requestVideoFrameCallback(() => { grab(); drawStage(); }); };
  vd.onerror = () => { A.note = 'This video will not open in the browser. Convert it to MP4 (H.264) first, e.g. with Convert to MP4 in Kinematic Analysis, or HandBrake.'; app.render(); };
  app.render();
}
function parseCSV(text, name) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
  if (!lines.length) throw new Error('The file is empty.');
  const dl = [',', '\t', ';'].map((d) => [d, lines[0].split(d).length]).sort((p, q) => q[1] - p[1])[0][0];
  const rows = lines.map((l) => l.split(dl).map((c) => c.trim().replace(/^"|"$/g, '')));
  const hasHead = rows[0].some((c) => c && isNaN(+c));
  const head = hasHead ? rows[0].map((c) => c.toLowerCase()) : null, body = hasHead ? rows.slice(1) : rows;
  const col = (re, not) => (head ? head.findIndex((h) => re.test(h) && !(not && not.test(h))) : -1);
  const mi = col(/^marker$/);
  let ti = col(/^time|^t$|time_s|^t_s/), fi = col(/^frame/), xi = col(/^x_m$/), yi = col(/^y_m$/);
  if (xi < 0) xi = col(/^x/, /px|filt|pix/); if (yi < 0) yi = col(/^y/, /px|filt|pix/);
  if (!head) { ti = 0; xi = 1; yi = 2; }
  if (xi < 0 || yi < 0) throw new Error('Could not find x and y columns. Name them x and y (in metres), with a time column, or see the format below.');
  const out = { markers: null, rows: body, mi, ti, fi, xi, yi };
  if (mi >= 0) out.markers = [...new Set(body.map((r) => r[mi]).filter(Boolean))];
  out.name = name; return out;
}
function useCSV() {
  const P = A.csvParsed, rows = P.rows.filter((r) => P.mi < 0 || r[P.mi] === A.marker);
  const t = [], x = [], y = [], fr = [];
  rows.forEach((r, k) => {
    const xv = +r[P.xi], yv = +r[P.yi]; if (r[P.xi] === '' || r[P.yi] === '' || !Number.isFinite(xv) || !Number.isFinite(yv)) return;
    let tv = P.ti >= 0 ? +r[P.ti] : NaN; const fv = P.fi >= 0 ? +r[P.fi] : k;
    if (!Number.isFinite(tv)) tv = fv / A.fpsData;
    t.push(tv); x.push(xv * A.units); y.push(yv * A.units); fr.push(fv);
  });
  const o = t.map((q, i) => i).sort((p, q) => t[p] - t[q]);
  setWorld(o.map((i) => t[i]), o.map((i) => x[i]), o.map((i) => y[i]), o.map((i) => fr[i]));
}

// ---------- AVI (Motion JPEG) from lab cameras ----------
// Browsers will not play AVI, so these are read directly: each frame is a JPEG inside the file, and the frame rate
// comes from the file header, so it is exact. Some cameras leave out the JPEG Huffman tables (Motion JPEG allows it);
// the standard tables are put back in so every browser can decode the frame.
const STD_DHT = Uint8Array.from(atob('/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6'), (ch) => ch.charCodeAt(0));
async function readAVI(file) {
  const buf = await file.arrayBuffer(), u8 = new Uint8Array(buf), dv = new DataView(buf), n = buf.byteLength;
  const id = (o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  if (n < 12 || id(0) !== 'RIFF' || id(8) !== 'AVI ') return null;
  let us = 0, fps = 0; const frames = [];
  const walk = (o, end) => {
    while (o + 8 <= end) {
      const c = id(o), sz = dv.getUint32(o + 4, true);
      if (c === 'RIFF' || c === 'LIST') walk(o + 12, Math.min(end, o + 8 + sz));
      else if (c === 'avih') us = dv.getUint32(o + 8, true);
      else if (c === 'strh' && id(o + 8) === 'vids' && !fps) { const sc = dv.getUint32(o + 28, true), ra = dv.getUint32(o + 32, true); if (sc) fps = ra / sc; }
      else if (c[2] === 'd' && (c[3] === 'b' || c[3] === 'c') && sz > 4 && u8[o + 8] === 0xFF && u8[o + 9] === 0xD8) frames.push([o + 8, sz]);
      o += 8 + sz + (sz & 1);
    }
  };
  walk(0, n);
  if (!fps && us) fps = 1e6 / us;
  return { u8, frames, fps, tok: 0 };
}
function aviBlob(i) {
  const [o, sz] = A.avi.frames[i], j = A.avi.u8.subarray(o, o + sz);
  let k = 2, dht = false, sos = -1;
  while (k + 4 < j.length && j[k] === 0xFF) { const m = j[k + 1]; if (m === 0xC4) dht = true; if (m === 0xDA) { sos = k; break; } k += 2 + ((j[k + 2] << 8) | j[k + 3]); }
  return new Blob(dht || sos < 0 ? [j] : [j.subarray(0, sos), STD_DHT, j.subarray(sos)], { type: 'image/jpeg' });
}
async function aviFrame(i) { return createImageBitmap(aviBlob(i)); }
async function loadAVI(file) {
  reset(); A.src = 'video'; A.name = file.name; A.task = 'general'; app.render();
  try {
    const V = await readAVI(file);
    if (!V || !V.frames.length) { A.note = 'This AVI is not Motion JPEG, so the browser cannot read it. Convert it to MP4 (H.264) first.'; app.render(); return; }
    A.avi = V; A.nF = V.frames.length; A.fileFps = A.realFps = Math.round(V.fps * 1000) / 1000 || 100;
    const bm = await aviFrame(0); A.vw = bm.width; A.vh = bm.height;
    frameCv.width = A.vw; frameCv.height = A.vh; const fc = frameCv.getContext('2d'); fc.drawImage(bm, 0, 0);
    const d = fc.getImageData(0, 0, A.vw, A.vh).data; let sum = 0, cnt = 0; for (let q = 0; q < d.length; q += 4 * 97) { sum += d[q]; cnt++; }
    const mean = sum / cnt; A.bright = mean < 70 ? Math.min(4, Math.round(Math.max(1, 110 / Math.max(mean, 10)) * 4) / 4) : 1;
    A.note = 'Lab camera file: ' + A.nF + ' frames at ' + fmt(A.fileFps, 0) + ' fps, read straight from the file (no converting needed).' + (A.bright > 1 ? ' It is quite dark, so the picture has been brightened (you can change this under the video).' : '');
    A.frame = 0; drawStage(); app.render();
  } catch (err) { A.note = 'Could not read this AVI: ' + err.message; app.render(); }
}

// ---------- video stage ----------
const frameCv = document.createElement('canvas');
// the frames the video shows: all of it, or only from the first to the last marked event
function evFrames() { const E = A.ev; return [E.rel, E.end, ...E.extra.map((x) => x.f)].filter((f) => f !== null && f !== undefined); }
function span() { const f = evFrames(); return A.trim && f.length >= 2 ? [Math.min(...f), Math.max(...f)] : [0, A.nF - 1]; }
function showFrame(f) { const [lo, hi] = span(); A.frame = Math.max(lo, Math.min(hi, f));
  if (A.avi) { const tok = ++A.avi.tok, fr = A.frame; aviFrame(fr).then((bm) => { if (tok !== A.avi.tok) return; frameCv.width = bm.width; frameCv.height = bm.height; frameCv.getContext('2d').drawImage(bm, 0, 0); drawStage(); }); return; }
  const vd = $('vid'); const tt = (A.frame + 0.5) / A.fileFps; if (Math.abs(vd.currentTime - tt) < 1e-4) { grab(); drawStage(); } else vd.currentTime = tt; }
function grab() { const vd = $('vid'); if (!A.vw) return; frameCv.width = A.vw; frameCv.height = A.vh; frameCv.getContext('2d').drawImage(vd, 0, 0, A.vw, A.vh); }
function scalePx() { const c = A.cal; return c.a && c.b && c.len > 0 ? Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]) / c.len : NaN; }
function toWorld(p) { const s = scalePx(), o = A.cal.o; return [(p[0] - o[0]) / s, (o[1] - p[1]) / s]; }
function toPx(wx, wy) { const s = scalePx(), o = A.cal.o; return [o[0] + wx * s, o[1] - wy * s]; }
function calibrated() { return Number.isFinite(scalePx()) && !!A.cal.o; }
function buildFromClicks() {
  if (!calibrated()) return;
  const fs = Object.keys(A.clicks).map(Number).sort((p, q) => p - q);
  const t = [], x = [], y = []; fs.forEach((f) => { const w = toWorld(A.clicks[f]); t.push(f / A.realFps); x.push(w[0]); y.push(w[1]); });
  const keep = A.src === 'video' && A.t.length === t.length && A.t.length > 0 ? [A.rel, A.land, A.suggested] : null;
  setWorld(t, x, y, fs);
  if (keep && A.t.length >= 6 && !A.suggested) { A.rel = keep[0]; A.land = keep[1]; }
  applyEvents();
  if (A.targetPx && calibrated()) { const w = toWorld(A.targetPx); A.target = { x: A.flip ? -w[0] : w[0], y: w[1] }; }
}
// The marked release and end frames decide which points are the flight.
function applyEvents() {
  const E = A.ev; if (E.rel === null || !N()) return;
  let a = A.fr.findIndex((f) => f >= E.rel), b = -1; for (let i = N() - 1; i >= 0; i--) if (E.end === null || A.fr[i] <= E.end) { b = i; break; }
  if (a >= 0 && b - a >= 2) { A.rel = a; A.land = b; A.fromEvents = true; A.suggested = false; FITKEY = ''; }
}
function inWindow() { const E = A.ev; return Object.keys(A.clicks).map(Number).filter((f) => (E.rel === null || f >= E.rel) && (E.end === null || f <= E.end)).length; }
// ---------- frames for tracking ----------
const workCv = document.createElement('canvas');
function seekVideo(t) {
  return new Promise((res) => {
    const vd = $('vid'), same = Math.abs(vd.currentTime - t) < 1e-4; if (same && !vd.seeking) { res(); return; }
    let done = false; const fin = () => { if (!done) { done = true; res(); } };
    const on = () => { vd.removeEventListener('seeked', on); if (vd.requestVideoFrameCallback) { vd.requestVideoFrameCallback(fin); setTimeout(fin, 250); } else fin(); };
    // a seek to this frame may already be under way (e.g. from stepping): wait for it rather than grabbing the old frame
    vd.addEventListener('seeked', on); if (!same) vd.currentTime = t;
  });
}
async function frameImage(f) {
  let src;
  if (A.avi) src = await aviFrame(f);
  else { await seekVideo((f + 0.5) / A.fileFps); src = $('vid'); }
  workCv.width = A.vw; workCv.height = A.vh; const c = workCv.getContext('2d', { willReadFrequently: true }); c.drawImage(src, 0, 0, A.vw, A.vh);
  return c.getImageData(0, 0, A.vw, A.vh);
}
async function runTrack() {
  if (A.busy) return; const E = A.ev; if (E.rel === null) return;
  const end = E.end === null ? A.nF - 1 : E.end, have = Object.keys(A.clicks).map(Number).filter((f) => f >= E.rel && f <= end).sort((a, b) => a - b);
  if (!have.length) { A.trkMsg = 'Click the middle of the ball on the release frame first.'; app.render(); return; }
  // carry on from the last frame of the unbroken run of points that starts at the first point
  let start = have[0]; for (const f of have) { if (f === start + 1 || f === start) start = f; else break; }
  if (start >= end) { A.trkDone = true; A.trkMsg = 'Already tracked to the end frame.'; app.render(); return; }
  const p0 = A.clicks[start]; let r0 = A.ballR;
  if (!r0) { const b = findBall(await frameImage(start), p0, 14); r0 = b ? b.r : 12; A.ballR = r0; }
  A.busy = true; A.stopReq = false; A.trkMsg = 'Tracking from frame ' + start + '&hellip;'; app.render();
  let k = 0; const total = end - start;
  const res = await trackBall(frameImage, start, end, p0, r0, (f, c, r) => {
    A.clicks[f] = [Math.round(c[0] * 10) / 10, Math.round(c[1] * 10) / 10]; A.hist.push(f); A.ballR = r; A.frame = f; k++;
    if (k % 3 === 0) { grab2(); drawStage(); const m = $('trkMsg'); if (m) { m.classList.remove('hide'); m.innerHTML = 'Tracking&hellip; frame ' + f + ' (' + Math.round(100 * k / total) + '%)'; } }
  }, () => A.stopReq);
  A.busy = false; buildFromClicks();
  if (res.why === 'done') { A.trkDone = true; A.trkMsg = '&#10003; Tracked the ball from frame ' + start + ' to the end frame (' + end + '). Step through to check the dots sit on the ball.'; }
  else if (res.why === 'edge') { A.trkDone = true; A.trkMsg = 'The ball reached the edge of the picture at frame ' + res.f + ', so tracking stopped there. That is fine: the tool uses what it has.'; }
  else if (res.why === 'stopped') A.trkMsg = 'Stopped at frame ' + res.f + '. Press <b>Carry on tracking</b> to continue.';
  else { A.trkMsg = '&#9888; Lost the ball at frame ' + res.f + ' (it may be blurred or hidden). <b>Click the ball on this frame</b>, then press <b>Carry on tracking</b>. Or switch to <b>Manual</b>.'; A.frame = res.f; }
  showFrame(A.frame); app.render();
}
function grab2() { if (A.avi) return; grab(); }
function drawStage() {
  const cv = $('stage'); if (!A.vw) { cv.width = 640; cv.height = 360; const c = cv.getContext('2d'); c.fillStyle = '#111'; c.fillRect(0, 0, 640, 360); c.fillStyle = '#cbd5e1'; c.font = '16px system-ui'; c.textAlign = 'center'; c.fillText('Load a video in step 1', 320, 180); return; }
  if (cv.width !== A.vw) { cv.width = A.vw; cv.height = A.vh; }
  const c = cv.getContext('2d'), u = A.vw / 900;
  drawBright(c, () => c.drawImage(frameCv, 0, 0), A.vw, A.vh);
  const dot = (p, col, r = 5) => { c.fillStyle = col; c.strokeStyle = '#fff'; c.lineWidth = 2 * u; c.beginPath(); c.arc(p[0], p[1], r * u, 0, 2 * Math.PI); c.fill(); c.stroke(); };
  const cal = A.cal;
  if (cal.a) dot(cal.a, '#facc15', 6); if (cal.b) dot(cal.b, '#facc15', 6);
  if (cal.a && cal.b) { c.strokeStyle = '#facc15'; c.lineWidth = 3 * u; c.beginPath(); c.moveTo(...cal.a); c.lineTo(...cal.b); c.stroke(); txt(c, fmt(cal.len, 2) + ' m', (cal.a[0] + cal.b[0]) / 2 + 12 * u, (cal.a[1] + cal.b[1]) / 2, '#facc15', u, 'left'); }
  if (cal.o) { c.strokeStyle = '#22d3ee'; c.lineWidth = 2.5 * u; const o = cal.o, L = 18 * u; c.beginPath(); c.moveTo(o[0] - L, o[1]); c.lineTo(o[0] + L, o[1]); c.moveTo(o[0], o[1] - L); c.lineTo(o[0], o[1] + L); c.stroke(); txt(c, 'origin (0, 0)', o[0] + 8 * u, o[1] - 14 * u, '#22d3ee', u, 'left'); }
  if (A.targetPx) { c.strokeStyle = '#fb923c'; c.lineWidth = 3 * u; c.beginPath(); c.arc(A.targetPx[0], A.targetPx[1], 9 * u, 0, 2 * Math.PI); c.stroke(); txt(c, 'target', A.targetPx[0], A.targetPx[1] - 18 * u, '#fb923c', u); }
  const fs = Object.keys(A.clicks).map(Number).sort((p, q) => p - q);
  c.strokeStyle = 'rgba(29,78,216,.8)'; c.lineWidth = 2 * u; c.beginPath(); fs.forEach((f, i) => { const p = A.clicks[f]; i ? c.lineTo(...p) : c.moveTo(...p); }); c.stroke();
  const inE = (f) => (A.ev.rel === null || f >= A.ev.rel) && (A.ev.end === null || f <= A.ev.end);
  fs.forEach((f) => dot(A.clicks[f], f === A.frame ? '#ef4444' : inE(f) ? '#1d4ed8' : '#94a3b8', f === A.frame ? 6 : 4));
  if (A.clicks[A.frame] && A.ballR) { const p = A.clicks[A.frame]; c.strokeStyle = '#ef4444'; c.lineWidth = 2 * u; c.beginPath(); c.arc(p[0], p[1], A.ballR, 0, 2 * Math.PI); c.stroke(); }
  overlayPath(c, u);
  if (A.mode === 'dig' && !A.busy) {
    const gp = ghost(), r = ringR();
    if (gp && !A.clicks[A.frame]) { c.save(); c.setLineDash([8 * u, 6 * u]); c.strokeStyle = 'rgba(250,204,21,.95)'; c.lineWidth = 2.5 * u; c.beginPath(); c.arc(gp[0], gp[1], r * 1.6, 0, 2 * Math.PI); c.stroke(); c.restore(); txt(c, 'the ball should be about here', gp[0], gp[1] - r * 1.6 - 14 * u, '#fde047', u, 'center', true); }
    if (A.hover) { const h = A.hover; c.strokeStyle = '#fff'; c.lineWidth = 4 * u; c.beginPath(); c.arc(h[0], h[1], r, 0, 2 * Math.PI); c.stroke(); c.strokeStyle = '#ef4444'; c.lineWidth = 2 * u; c.beginPath(); c.arc(h[0], h[1], r, 0, 2 * Math.PI); c.stroke();
      c.beginPath(); c.moveTo(h[0] - 6 * u, h[1]); c.lineTo(h[0] + 6 * u, h[1]); c.moveTo(h[0], h[1] - 6 * u); c.lineTo(h[0], h[1] + 6 * u); c.stroke(); }
  }
  const tags = []; if (A.ev.rel === A.frame) tags.push('RELEASE'); if (A.ev.end === A.frame) tags.push('END'); A.ev.extra.forEach((x) => { if (x.f === A.frame) tags.push(x.name.toUpperCase()); });
  if (tags.length) txt(c, tags.join(' \u00b7 '), A.vw - 12 * u, 22 * u, '#4ade80', u * 1.2, 'right', true);
  txt(c, 'Frame ' + A.frame + ' of ' + (A.nF - 1) + (A.trim && evFrames().length >= 2 ? '  (showing ' + span()[0] + ' to ' + span()[1] + ')' : '') + '  ·  ' + fmt(A.frame / A.realFps, 3) + ' s', 12 * u, 22 * u, '#fff', u, 'left', true);
  const mt = { calBall: '1. Click the ball (on a sharp frame)', calA: A.calBy === 'ballEdges' ? '1. Click the left edge of the ball' : '1. Click one end of the known length', calB: A.calBy === 'ballEdges' ? '2. Now click its right edge' : '2. Now click the other end', o: '3. Click the floor where you want 0 m', dig: A.ev.rel === null ? 'Find the frame the ball leaves the hand' : A.ev.end === null ? 'Now find the last frame of the flight' : A.clicks[A.frame] ? '' : 'Put the ring over the ball and click', target: A.task === 'lineout' ? '4. Click the catcher\u2019s hands' : '4. Click the middle of the ' + ringOf().what }[A.mode];
  if (mt) txt(c, mt, A.vw / 2, 70 * u, '#fde047', u * 1.6, 'center', true);
  const s = document.getElementById('frameNo'); if (s) s.textContent = A.frame; const s2 = document.getElementById('frameNo2'); if (s2) s2.textContent = A.frame;
  const k = document.getElementById('clickCount'); if (k) k.textContent = fs.length;
}
// The path predicted from the release values, drawn on the video itself.
function overlayPath(c, u) {
  if (!calibrated() || A.src !== 'video') return; const F = fit(); if (!F) return; const Pp = P0(F);
  let T = A.task === 'lineout' ? (A.target.x + 0.3 - Pp.x0) / Pp.vx : tAtHeight(Pp, isHoop() ? A.target.y - 0.3 : landHeight()); if (!Number.isFinite(T)) T = 2 * Math.max(0.2, Pp.vy / G);
  c.save(); c.strokeStyle = 'rgba(34,211,238,.95)'; c.lineWidth = 2.5 * u; c.setLineDash([10 * u, 7 * u]); c.beginPath();
  for (let k = 0; k <= 80; k++) { const p = pos(Pp, T * k / 80), q = toPx(A.flip ? -p[0] : p[0], p[1]); k ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }
  c.stroke(); c.restore();
}
function txt(c, s, x, y, col, u, al = 'center', box) { c.save(); c.font = '600 ' + Math.round(15 * u) + 'px system-ui, sans-serif'; c.textAlign = al; c.textBaseline = 'middle'; if (box) { const w = c.measureText(s).width + 14 * u, bx = al === 'left' ? x - 7 * u : al === 'right' ? x - w + 7 * u : x - w / 2; c.fillStyle = 'rgba(15,23,42,.72)'; c.fillRect(bx, y - 13 * u, w, 26 * u); } c.fillStyle = col; c.fillText(s, x, y); c.restore(); }
// Brighten dark footage for display only (clicks are unaffected). Uses the canvas filter where the browser has it,
// otherwise scales the pixels directly.
function drawBright(c, draw, w, h) {
  if (A.bright === 1) { draw(); return; }
  if ('filter' in c) { c.filter = 'brightness(' + A.bright + ')'; draw(); c.filter = 'none'; return; }
  draw(); const im = c.getImageData(0, 0, w, h), d = im.data; for (let q = 0; q < d.length; q += 4) { d[q] = Math.min(255, d[q] * A.bright); d[q + 1] = Math.min(255, d[q + 1] * A.bright); d[q + 2] = Math.min(255, d[q + 2] * A.bright); } c.putImageData(im, 0, 0);
}
// The targeting ring: the size of the ball (measured, or worked out from the scale and the ball's real size).
const BALL_D = { freethrow: 0.239, netball: 0.22, lineout: 0.19, shot: 0.12, broadjump: 0.22, generic: 0.22 };
function ringR() { if (A.ringR) return A.ringR; if (A.ballR) return A.ballR; const s = scalePx(); return Number.isFinite(s) ? (BALL_D[A.task] || 0.22) / 2 * s : 14; }
// Where the ball should be in the current frame, from the points already clicked (a parabola in pixels: steady
// sideways, gravity downwards). Needs 2 points (straight line) or 3+ (curve). Only uses points inside the flight.
function ghost() {
  const E = A.ev; if (E.rel === null) return null;
  const fs = Object.keys(A.clicks).map(Number).filter((f) => f !== A.frame && f >= E.rel && (E.end === null || f <= E.end)).sort((a, b) => a - b);
  if (fs.length < 2) return null;
  const near = fs.slice().sort((a, b) => Math.abs(a - A.frame) - Math.abs(b - A.frame)).slice(0, 8).sort((a, b) => a - b);
  const t = near.map((f) => f - A.frame), x = near.map((f) => A.clicks[f][0]), y = near.map((f) => A.clicks[f][1]);
  const lin = (ts, vs) => { const n = ts.length, mt = ts.reduce((a, b) => a + b) / n, mv = vs.reduce((a, b) => a + b) / n; let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (ts[i] - mt) * (vs[i] - mv); sxx += (ts[i] - mt) ** 2; } const b = sxx ? sxy / sxx : 0; return mv - b * mt; };
  const s = scalePx(); const gpx = Number.isFinite(s) ? 0.5 * G * s / (A.realFps * A.realFps) : 0; // gravity in pixels per frame squared (halved)
  return [lin(t, x), lin(t, y.map((v, i) => v - gpx * t[i] * t[i]))];
}
function stagePt(e) { const cv = $('stage'), r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; }
function stageClick(e) {
  if (!A.vw) return; const p = stagePt(e).map((q) => Math.round(q * 10) / 10);
  if (A.mode === 'calBall') {
    const im = frameCv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, A.vw, A.vh), b = findBall(im, p, 14);
    if (b) { A.cal.a = [b.c[0] - b.r, b.c[1]]; A.cal.b = [b.c[0] + b.r, b.c[1]]; A.ballR = b.r; A.mode = 'x'; } else { A.calBy = 'ballEdges'; A.mode = 'calA'; app.render(); return; }
  } else if (A.mode === 'calA') { A.cal.a = p; A.mode = 'x'; }
  else if (A.mode === 'calB') { A.cal.b = p; A.mode = 'x'; }
  else if (A.mode === 'o') { A.cal.o = p; A.mode = 'x'; }
  else if (A.mode === 'target') { A.targetPx = p; A.mode = 'x'; }
  else if (A.mode === 'dig') {
    if (A.busy) return;
    let q = p;
    if (A.snap) { const im = frameCv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, A.vw, A.vh), b = findBall(im, p, A.ballR || 14); if (b && Math.hypot(b.c[0] - p[0], b.c[1] - p[1]) < 1.5 * (A.ballR || b.r)) { q = [Math.round(b.c[0] * 10) / 10, Math.round(b.c[1] * 10) / 10]; A.ballR = b.r; } }
    A.clicks[A.frame] = q; A.hist.push(A.frame); A.trkDone = A.trackMode === 'auto' ? false : A.trkDone;
    const lastF = A.ev.end === null ? A.nF - 1 : A.ev.end;
    if (A.trackMode === 'manual' && A.frame + A.stepBy <= lastF) { buildFromClicks(); showFrame(A.frame + A.stepBy); app.render(); return; }
  }
  else return;
  if (A.mode === 'x') A.mode = nextScaleMode();
  buildFromClicks(); app.render();
}
function loupe(e) {
  const lp = $('loupe'); if (!A.vw || A.mode === 'idle') { lp.style.display = 'none'; return; }
  const p = stagePt(e), z = A.mode === 'dig' ? Math.max(1.5, Math.min(4, 55 / ringR())) : 4, s = 160 / z, c = lp.getContext('2d');
  if (p[0] < 0 || p[1] < 0 || p[0] > A.vw || p[1] > A.vh) { lp.style.display = 'none'; return; }
  lp.style.display = 'block'; c.imageSmoothingEnabled = false; c.fillStyle = '#000'; c.fillRect(0, 0, 160, 160);
  drawBright(c, () => c.drawImage(frameCv, p[0] - s / 2, p[1] - s / 2, s, s, 0, 0, 160, 160), 160, 160);
  c.strokeStyle = '#ef4444'; c.lineWidth = 1; c.beginPath(); c.moveTo(80, 60); c.lineTo(80, 100); c.moveTo(60, 80); c.lineTo(100, 80); c.stroke();
  if (A.mode === 'dig') { c.lineWidth = 2; c.beginPath(); c.arc(80, 80, ringR() * z, 0, 2 * Math.PI); c.stroke(); }
}

// ---------- shared figure: the trajectory ----------
function trajFigure(ctx, rect, o = {}) {
  const F = fit(), x = X(), y = A.ry, n = N();
  const xs = x.slice(), ys = y.slice();
  let P = null;
  const ext = (px, py) => { xs.push(px); ys.push(py); };
  if (F && o.predict) { const Pp = o.Pp || P0(F), hl = landHeight(), tf = tAtHeight(Pp, hl); const T = Number.isFinite(tf) ? tf : F.f.t[F.f.t.length - 1] * 1.2; for (let k = 0; k <= 30; k++) { const p = pos(Pp, T * k / 30); ext(p[0], p[1]); } }
  if (hasTarget()) { ext(A.target.x + 0.4, A.target.y + 0.2); ext(A.target.x - 0.3, A.target.y); }
  ext(x[0], 0);
  const lx = lim([xs], 0.05), ly = lim([ys, [0]], 0.08);
  P = panel(ctx, { rect, x: lx, y: [Math.min(ly[0], -0.05), ly[1]], equal: true, xl: 'Horizontal position (m)', yl: 'Height (m)' });
  ctx.save(); ctx.fillStyle = '#efe7da'; const gy = P.Y(0); if (gy < P.r.B) ctx.fillRect(P.r.L, gy, P.r.R - P.r.L, P.r.B - gy); ctx.restore();
  if (isHoop()) { const tx = A.target.x, ty = A.target.y, K = ringOf(); line(ctx, P, [tx - K.R, tx + K.R + (K.board ? 0.15 : 0)], [ty, ty], '#ea580c', 4); if (K.board) line(ctx, P, [tx + K.R + 0.15, tx + K.R + 0.15], [ty - 0.15, ty + 1.05], '#64748b', 4); else line(ctx, P, [tx + K.R + 0.04, tx + K.R + 0.04], [0, ty], '#64748b', 3); }
  if (A.task === 'lineout') { const tx = A.target.x, ty = A.target.y; line(ctx, P, [tx, tx], [0, ty], '#94a3b8', 1.5, [4, 4]); ctx.save(); ctx.strokeStyle = '#ea580c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(P.X(tx), P.Y(ty), Math.max(6, P.X(0.25) - P.X(0)), 0, 2 * Math.PI); ctx.stroke(); ctx.restore(); label(ctx, 'catch point', P.X(tx), P.Y(ty) - Math.max(6, P.X(0.25) - P.X(0)) - 12, '#ea580c', { size: 11 }); }
  if (A.task === 'broadjump' && A.takeoffDist) { const tl = (F ? F.x0 : X()[A.rel]) - A.takeoffDist; line(ctx, P, [tl, tl], [0, 0.25], '#475569', 2); label(ctx, 'toes', P.X(tl), P.Y(0.25) - 10, '#475569', { size: 11, bold: false }); }
  if (A.task === 'shot') { const b = (F ? F.x0 : X()[A.rel]) - A.releaseAhead; line(ctx, P, [b, b], [0, 0.1], '#475569', 3); label(ctx, 'stop board', P.X(b), P.Y(0.1) - 10, '#475569', { size: 11, bold: false }); }
  const inF = (i) => i >= A.rel && i <= A.land;
  dots(ctx, P, x.map((q, i) => (inF(i) ? NaN : q)), y, C.out, 3);
  dots(ctx, P, x.map((q, i) => (inF(i) ? q : NaN)), y, C.pts, 3.2);
  return P;
}
function landHeight() {
  if (isHoop()) return A.target.y;
  if (A.task === 'lineout') return 0;
  if (A.landH !== null && Number.isFinite(A.landH)) return A.landH;
  if (A.task === 'shot') return 0;
  return A.ry[A.land];
}

// ---------- outcome maths per task ----------
function outcome(Pp) {
  const o = { Pp, rise: peakRise(Pp), tPeak: Math.max(0, Pp.vy / G) }; o.peak = Pp.y0 + o.rise;
  if (A.task === 'lineout') {
    const tx = A.target.x, ty = A.target.y, tc = (tx - Pp.x0) / Pp.vx;
    o.tCatch = tc; o.yCatch = Pp.y0 + Pp.vy * tc - 0.5 * G * tc * tc; o.dyCatch = o.yCatch - ty; o.vCatch = Math.hypot(Pp.vx, Pp.vy - G * tc);
    o.rising = Pp.vy - G * tc > 0; o.metric = o.dyCatch; return o;
  }
  if (isHoop()) {
    const K = ringOf(), tx = A.target.x, ty = A.target.y, th = tAtHeight(Pp, ty, true);
    o.tHoop = th; o.xHoop = Number.isFinite(th) ? Pp.x0 + Pp.vx * th : NaN; o.miss = o.xHoop - tx;
    const vyH = Pp.vy - G * th; o.entry = deg(Math.atan2(-vyH, Pp.vx)); o.margin = o.entry > 0 ? K.R - K.r / Math.sin(rad(o.entry)) : NaN;
    o.dx = tx - Pp.x0; o.dy = ty - Pp.y0; o.min = minSpeedToTarget(o.dx, o.dy);
    const th0 = deg(Math.atan2(Pp.vy, Pp.vx)); o.vNeed = speedForTarget(o.dx, o.dy, th0); o.vNow = Math.hypot(Pp.vx, Pp.vy);
    o.metric = o.miss; return o;
  }
  const hl = landHeight(); o.hl = hl; o.tf = tAtHeight(Pp, hl, true); o.R = Pp.vx * o.tf;
  if (A.task === 'broadjump') { o.total = A.takeoffDist + o.R + A.landingDist; o.metric = o.total; }
  else if (A.task === 'shot') { o.total = A.releaseAhead + o.R; o.metric = o.total; const v0 = Math.hypot(Pp.vx, Pp.vy); o.opt = optimumAngle(v0, Pp.y0 - hl); o.Ropt = range(fromPolar(v0, o.opt, Pp.y0), hl) + A.releaseAhead; }
  else o.metric = o.R;
  return o;
}
function metricName() { return isHoop() ? 'Miss at the ' + ringOf().name + ' (+ long, \u2212 short)' : A.task === 'lineout' ? 'Height at the catcher (+ above, \u2212 below the catch point)' : A.task === 'broadjump' ? 'Jump distance' : A.task === 'shot' ? 'Distance thrown' : 'Horizontal distance'; }

// ---------- steps ----------
const OLD = [
  {
    key: 'load', short: 'Load', title: 'Choose a flight to analyse', figTitle: () => (A.src ? A.name : 'Nothing loaded yet'),
    hint: () => (A.src && N() ? 'Each dot is one frame. Darker dots are the flight (set in step 4).' : ''),
    body: () => {
      let h = layer('words', 'Start with a demo', '<p>Pick a demo to see the whole analysis first, then use your own video or data.</p><div class="choices">'
        + '<button type="button" class="choice" data-demo="video"><b>Free throw: video (60 fps)</b><span>Calibrate and click the ball yourself, frame by frame. The full experience.</span></button>'
        + '<button type="button" class="choice" data-demo="freethrow"><b>Free throw: data</b><span>The same shot, already digitised. Ball centre, 60 Hz.</span></button>'
        + '<button type="button" class="choice" data-demo="broadjump"><b>Broad jump: centre of mass</b><span>Centre of mass at 100 Hz, from late push-off to the end of landing.</span></button>'
        + '<button type="button" class="choice" data-demo="shot"><b>Shot put</b><span>Filmed from far back at 50 fps, so the clicks are rougher.</span></button></div>')
        + layer('words', 'Or use your own', '<div class="row"><label class="btn filebtn">Open a video<input type="file" id="fVid" accept="video/*,.avi" aria-label="Open a video"></label><label class="btn accent filebtn">Open position data (CSV)<input type="file" id="fCsv" accept=".csv,.txt,.tsv,text/csv,text/plain" aria-label="Open position data"></label></div>'
        + '<details class="more"><summary>What the data file should look like</summary><p>A <strong>marker coordinates</strong> export from <a href="../video-analyser/">Kinematic Analysis</a> works as it is (you then pick the marker, e.g. the ball). Use the <em>unfiltered</em> positions: the fit here does the smoothing, and filtering blurs the moment of release.</p><p>Otherwise, a CSV with a header row and three columns: <code>time_s, x_m, y_m</code>. Time in seconds (or a <code>frame</code> column and the frame rate), x forwards and y <strong>up</strong>, in metres from an origin on the floor.</p></details>');
      if (A.src) h += layer('nums', 'Loaded', '<p><b>' + esc(A.name) + '</b>' + (A.src === 'data' ? ': ' + N() + ' frames, ' + fmt(A.t[N() - 1] - A.t[0], 3) + ' s.' : A.vw ? ': ' + A.vw + ' &times; ' + A.vh + ', ' + A.nF + ' frames.' : '') + '</p>' + (A.note ? '<p class="small">' + esc(A.note) + '</p>' : '')
        + (A.markers && A.markers.length > 1 ? '<div class="field"><label for="mkSel">Marker to analyse</label><select id="mkSel">' + A.markers.map((m) => '<option' + (m === A.marker ? ' selected' : '') + '>' + esc(m) + '</option>').join('') + '</select></div>' : '')
        + (A.csvParsed && A.csvParsed.ti < 0 ? '<div class="field"><label for="fpsData">Frame rate (no time column)</label><input type="number" id="fpsData" min="1" step="1" value="' + A.fpsData + '"></div>' : '')
        + (A.csvParsed ? '<div class="field"><label for="unitSel">Units in the file</label><select id="unitSel"><option value="1"' + (A.units === 1 ? ' selected' : '') + '>metres</option><option value="0.01"' + (A.units === 0.01 ? ' selected' : '') + '>centimetres</option><option value="0.001"' + (A.units === 0.001 ? ' selected' : '') + '>millimetres</option></select></div>' : '')
        + (A.src === 'data' && A.flip ? '<p class="small">This flight goes right to left, so the tool has mirrored it to go left to right. Nothing else changes.</p>' : '')
        + (A.csv ? '<p><button type="button" class="btn small ghost" id="dlDemo">Download this demo as a CSV</button> <span class="small muted">to see the format</span></p>' : '') + '<p><b>Next:</b> ' + (A.src === 'video' ? 'set the scale.' : 'check the release and landing.') + '</p>');
      return h;
    },
    wire() {
      document.querySelectorAll('[data-demo]').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.demo; if (k === 'slj') return; if (k === 'video') loadVideo(VIDEO_DEMO.file, 'Free throw video (demo)', true); else loadDemo(k); }));
      $('fVid').addEventListener('change', (e) => { const f = e.target.files[0]; if (!f) return; if (/\.avi$/i.test(f.name) || /msvideo|avi/i.test(f.type)) loadAVI(f); else loadVideo(URL.createObjectURL(f), f.name, false); });
      $('fCsv').addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try { const text = await f.text(), P = parseCSV(text, f.name); reset(); A.src = 'data'; A.name = f.name; A.csvParsed = P; A.markers = P.markers; A.marker = P.markers ? (P.markers.find((m) => /ball|shot|com|centre|center/i.test(m)) || P.markers[0]) : ''; A.note = P.markers ? 'Kinematic Analysis marker export: ' + P.markers.length + ' marker(s).' : 'Columns found: ' + (P.ti >= 0 ? 'time, ' : P.fi >= 0 ? 'frame, ' : '') + 'x and y.'; guessUnits(P); useCSV(); }
        catch (err) { A.note = 'Could not read that file: ' + err.message; }
        app.render();
      });
      const mk = $('mkSel'); if (mk) mk.addEventListener('change', () => { A.marker = mk.value; useCSV(); app.render(); });
      const fd = $('fpsData'); if (fd) fd.addEventListener('change', () => { A.fpsData = Math.max(1, +fd.value || 100); useCSV(); app.render(); });
      const us = $('unitSel'); if (us) us.addEventListener('change', () => { A.units = +us.value; useCSV(); app.render(); });
      const dd = $('dlDemo'); if (dd) dd.addEventListener('click', () => download(A.csv.name, A.csv.text, 'text/csv'));
    },
    draw(ctx, w, h) {
      if (!A.src || !N()) { welcome(ctx, w, h); return; }
      trajFigure(ctx, { x: 0, y: 0, w, h });
    },
  },
  {
    key: 'cal', short: 'Scale', title: 'Set the frame rate, scale and origin', view: 'stage', enabled: () => A.src === 'video',
    canNext: () => calibrated(),
    body: () => layer('words', 'Frame rate', '<p>Time comes from counting frames, so the frame rate must be right. For slow motion, use the rate it was <strong>filmed</strong> at (e.g. 240), not the rate the file plays at (often 30).</p><div class="field"><label for="fileFps">Frames per second in the file</label><input type="number" id="fileFps" min="1" step="1" value="' + A.fileFps + '"></div><div class="field"><label for="realFps">Filmed at (fps)</label><input type="number" id="realFps" min="1" step="1" value="' + A.realFps + '"></div>' + (A.demo ? '' : '<p class="small muted">Not sure? The gravity check in step 5 will tell you if this is wrong.</p>'))
      + layer('words', 'Scale', '<p>Click the two ends of something of known length that is <strong>in the same plane as the flight</strong> (e.g. the 1 m stick). That tells the tool how many pixels make a metre. The loupe (top right) helps you click exactly.</p><div class="row"><button type="button" class="btn small' + (A.mode === 'calA' || A.mode === 'calB' ? ' on' : '') + '" id="bCal">' + (A.cal.a ? 'Click the ends again' : 'Click the two ends') + '</button><label class="small" style="display:inline-flex;gap:.3rem;align-items:center">Length (m) <input type="number" id="calLen" min="0.01" step="0.01" value="' + A.cal.len + '" style="width:6rem"></label></div>' + (Number.isFinite(scalePx()) ? '<p class="small">Scale: <b>' + fmt(scalePx(), 1) + ' pixels per metre</b> (one pixel = ' + fmt(1000 / scalePx(), 1) + ' mm).</p>' : ''))
      + layer('words', 'Origin', '<p>Click a point <strong>on the floor</strong> (e.g. where the free-throw line meets the floor, or the take-off line). Heights are measured up from here, so release height is a real height above the ground.</p><button type="button" class="btn small' + (A.mode === 'o' ? ' on' : '') + '" id="bOrig">' + (A.cal.o ? 'Click the origin again' : 'Click the origin') + '</button>')
      + layer('words', 'Target (shots at a hoop only)', '<p>For a basketball shot, click the <strong>centre of the hoop</strong> (halfway between the front and back of the rim, at rim height). Optional otherwise.</p><button type="button" class="btn small ghost' + (A.mode === 'target' ? ' on' : '') + '" id="bTgt">' + (A.targetPx ? 'Click the hoop again' : 'Click the hoop centre') + '</button>')
      + (A.demo ? '<p><button type="button" class="btn small accent" id="bDemoCal">Use the demo values</button> <span class="small muted">if you just want to see the rest</span></p>' : '')
      + (calibrated() ? '<div class="light-good"><b>Calibrated.</b> Next, click the ball in each frame.</div>' : ''),
    tools: () => frameTools(),
    wire() {
      wireFrameTools();
      $('fileFps').addEventListener('change', (e) => { A.fileFps = Math.max(1, +e.target.value || 30); A.nF = Math.max(1, Math.round($('vid').duration * A.fileFps)); showFrame(A.frame); buildFromClicks(); app.render(); });
      $('realFps').addEventListener('change', (e) => { A.realFps = Math.max(1, +e.target.value || A.fileFps); buildFromClicks(); app.render(); });
      $('calLen').addEventListener('change', (e) => { A.cal.len = Math.max(0.001, +e.target.value || 1); buildFromClicks(); app.render(); });
      $('bCal').addEventListener('click', () => { A.mode = 'calA'; app.render(); });
      $('bOrig').addEventListener('click', () => { A.mode = 'o'; app.render(); });
      $('bTgt').addEventListener('click', () => { A.mode = 'target'; app.render(); });
      const d = $('bDemoCal'); if (d) d.addEventListener('click', () => { A.cal = { a: VIDEO_DEMO.stickPx[0].slice(), b: VIDEO_DEMO.stickPx[1].slice(), len: VIDEO_DEMO.stickLen, o: VIDEO_DEMO.originPx.slice() }; A.targetPx = [VIDEO_DEMO.originPx[0] + 4.225 * VIDEO_DEMO.pxPerM, VIDEO_DEMO.originPx[1] - 3.05 * VIDEO_DEMO.pxPerM]; A.mode = 'idle'; buildFromClicks(); app.render(); });
    },
    drawStage, leave: () => { A.mode = 'idle'; $('loupe').style.display = 'none'; },
  },
  {
    key: 'dig', short: 'Digitise', title: 'Click the ball in each frame', view: 'stage', enabled: () => A.src === 'video' && calibrated(),
    canNext: () => N() >= 3,
    body: () => layer('words', 'How to digitise', '<ol><li>Go to a few frames <strong>before</strong> the ball leaves the hand (use the buttons under the video, or the arrow keys).</li><li>Press <strong>Start clicking</strong>, then click the <strong>centre of the ball</strong>. The video moves on by itself after each click.</li><li>Keep going until it lands or reaches the hoop. Click again on any frame to move that point.</li></ol><p>Aim for the centre every time, not the edge nearest to you. Each click is only as good as your aim: a ball that is 18 pixels across, clicked to within 2 pixels, is about 1.5 cm at this scale.</p>')
      + '<div class="row"><button type="button" class="btn' + (A.mode === 'dig' ? ' on' : '') + '" id="bDig">' + (A.mode === 'dig' ? 'Clicking: on' : 'Start clicking') + '</button><label class="small" style="display:inline-flex;gap:.3rem;align-items:center">Move on by <select id="stepBy" style="width:4.5rem">' + [1, 2, 3, 4].map((k) => '<option' + (k === A.stepBy ? ' selected' : '') + '>' + k + '</option>').join('') + '</select> frame(s)</label></div>'
      + '<div class="row" style="margin-top:.4rem"><button type="button" class="btn small ghost" id="bDel">Remove this frame&rsquo;s point</button><button type="button" class="btn small ghost" id="bClr">Clear all</button></div>'
      + '<p class="status">Points so far: <b id="clickCount">' + Object.keys(A.clicks).length + '</b>. ' + (N() >= 6 ? 'That is enough to continue (more frames give a better fit).' : 'You need at least 6, ideally 10 or more in flight.') + '</p>'
      + (A.demo ? '<p class="small muted">Demo tip: the ball leaves the hand at about frame ' + VIDEO_DEMO.releaseFrame + '. Moving on by 2 frames is plenty here.</p><p><button type="button" class="btn small ghost" id="bAuto">Fill in the demo for me</button></p>' : ''),
    tools: () => frameTools(),
    wire() {
      wireFrameTools();
      $('bDig').addEventListener('click', () => { A.mode = A.mode === 'dig' ? 'idle' : 'dig'; app.render(); });
      $('stepBy').addEventListener('change', (e) => { A.stepBy = +e.target.value; });
      $('bDel').addEventListener('click', () => { delete A.clicks[A.frame]; buildFromClicks(); app.render(); });
      $('bClr').addEventListener('click', () => { if (confirm('Remove every digitised point?')) { A.clicks = {}; buildFromClicks(); app.render(); } });
      const au = $('bAuto'); if (au) au.addEventListener('click', autoDemo);
    },
    drawStage, leave: () => { A.mode = 'idle'; $('loupe').style.display = 'none'; },
  },
  {
    key: 'flight', short: 'Release and landing', title: 'Mark the release and the landing', enabled: () => N() >= 6,
    canNext: () => !!fit(),
    figTitle: () => 'Height and horizontal position over time',
    hint: () => 'Shaded: the flight. Only these frames are fitted.',
    body: () => {
      const F = fit(), n = N(), fr = A.fr, tt = (i) => fmt(A.t[i] - A.t[0], 3) + ' s';
      return layer('words', 'Why this matters', '<p>The projectile equations only hold while <strong>nothing but gravity</strong> acts. So the fit must use only the frames <strong>after</strong> the ball has left the hand (or the feet have left the ground) and <strong>before</strong> it lands or touches anything.</p><ul><li><b>Release</b>: the first frame where it is clearly free.</li><li><b>Last flight frame</b>: the last frame before contact (landing, the rim, a catch).</li></ul><p>Include a contact frame and the fit is pulled away from the true flight, which the gravity check below will show you.</p>')
        + (A.suggested ? '<div class="status">The tool has <b>suggested</b> these frames, from where the data stop looking like a clean projectile, then moved in by about 15 ms at each end to be safe. Check them against the video, and move them if needed.</div>' : A.fromEvents ? '<div class="status">' + (A.event && A.event.how ? esc(A.event.how) : 'Set from the frame where the ball can be seen leaving the hand.') + ' Try moving them to see what the gravity check does.</div>' : '')
        + '<div class="slider"><label for="rel">Release</label><input type="range" id="rel" min="0" max="' + (n - 1) + '" step="1" value="' + A.rel + '"><b>frame ' + fr[A.rel] + '</b></div><div class="row tight" style="justify-content:flex-end"><button type="button" class="btn small ghost" data-nud="rel,-1">&minus;1</button><button type="button" class="btn small ghost" data-nud="rel,1">+1</button></div>'
        + '<div class="slider"><label for="land">Last flight frame</label><input type="range" id="land" min="0" max="' + (n - 1) + '" step="1" value="' + A.land + '"><b>frame ' + fr[A.land] + '</b></div><div class="row tight" style="justify-content:flex-end"><button type="button" class="btn small ghost" data-nud="land,-1">&minus;1</button><button type="button" class="btn small ghost" data-nud="land,1">+1</button><button type="button" class="btn small" id="bSug">Suggest</button></div>'
        + layer('nums', 'Live check', F ? '<p>' + F.n + ' frames in flight (' + tt(A.rel) + ' to ' + tt(A.land) + ').</p><p>' + (Number.isFinite(F.gFree) ? 'Gravity from these frames: <b>' + fmt(F.gFree, 2) + ' m/s&sup2;</b> ' + gBadge(F) : 'Too few frames for a gravity check (it needs 5).') + '</p><p class="small">Move a slider into the hand or the landing and watch this number move away from 9.81.</p>' : '<p>Choose at least 3 frames of flight.</p>');
    },
    wire() {
      ['rel', 'land'].forEach((k) => { const el = $(k); el.addEventListener('input', () => { set(k, +el.value); }); el.addEventListener('change', () => app.render()); });
      document.querySelectorAll('[data-nud]').forEach((b) => b.addEventListener('click', () => { const [k, d] = b.dataset.nud.split(','); set(k, A[k] + +d); app.render(); }));
      $('bSug').addEventListener('click', () => { if (!suggest()) alert('No clean flight found. Check the frame rate and scale, or set the frames by hand.'); app.render(); });
      function set(k, val) { const n = N(); val = Math.max(0, Math.min(n - 1, val)); if (k === 'rel') A.rel = Math.min(val, A.land - 2 < 0 ? 0 : A.land - 2); else A.land = Math.max(val, Math.min(n - 1, A.rel + 2)); A.suggested = false; A.fromEvents = false; A.ex = null; FITKEY = ''; const b = $(k).nextElementSibling; if (b) b.textContent = 'frame ' + A.fr[A[k]]; app.redraw(); }
    },
    draw(ctx, w, h) {
      const t = A.t.map((q) => q - A.t[0]), x = X(), y = A.ry, F = fit();
      const top = { x: 0, y: 0, w, h: h * 0.55 }, bot = { x: 0, y: h * 0.55, w, h: h * 0.45 }, tx = lim([t], 0.03);
      const Py = panel(ctx, { rect: top, x: tx, y: lim([y]), xl: '', yl: 'Height (m)', title: 'Height' });
      const Px = panel(ctx, { rect: bot, x: tx, y: lim([x]), xl: 'Time (s)', yl: 'Horizontal (m)', title: 'Horizontal position' });
      [Py, Px].forEach((P) => { ctx.save(); ctx.fillStyle = 'rgba(29,78,216,.08)'; ctx.fillRect(P.X(t[A.rel]), P.r.T, P.X(t[A.land]) - P.X(t[A.rel]), P.r.B - P.r.T); ctx.restore(); line(ctx, P, [t[A.rel], t[A.rel]], P.y, '#16a34a', 2, [5, 4]); line(ctx, P, [t[A.land], t[A.land]], P.y, '#dc2626', 2, [5, 4]); });
      label(ctx, 'release', Py.X(t[A.rel]), Py.r.T + 10, '#16a34a', { size: 11 }); label(ctx, 'last flight frame', Py.X(t[A.land]), Py.r.T + 10, '#dc2626', { size: 11 });
      if (F) { const t0 = t[A.rel], fx = [], fyy = [], fxx = []; const T = t[A.land] - t0; for (let k = -10; k <= 110; k++) { const tt = T * k / 100; fx.push(t0 + tt); fyy.push(F.y0Free + F.vyFree * tt - 0.5 * (Number.isFinite(F.gFree) ? F.gFree : G) * tt * tt); fxx.push(F.x0 + F.vx * tt); } line(ctx, Py, fx, fyy, C.fit, 2); line(ctx, Px, fx, fxx, C.fit, 2); }
      const inF = (i) => i >= A.rel && i <= A.land;
      dots(ctx, Py, t, y.map((q, i) => (inF(i) ? NaN : q)), C.out, 3); dots(ctx, Py, t, y.map((q, i) => (inF(i) ? q : NaN)), C.pts, 3);
      dots(ctx, Px, t, x.map((q, i) => (inF(i) ? NaN : q)), C.out, 3); dots(ctx, Px, t, x.map((q, i) => (inF(i) ? q : NaN)), C.pts, 3);
    },
  },
  {
    key: 'fit', short: 'Fit and check', title: 'Fit the flight and check it', enabled: () => !!fit(), figTitle: () => 'The fit, its residuals, and differencing vs fitting',
    hint: () => 'Dots: your data. Lines: the fitted flight.',
    body: () => {
      const F = fit(); if (!F) return '';
      return layer('words', 'What the tool has done', '<p>It has fitted the flight equations to all ' + F.n + ' flight frames at once (least squares), with time measured from the release frame:</p>' + eqn(v('x') + ' = ' + sub('x', '0') + ' + ' + sub('v', 'x') + v('t')) + eqn(v('y') + ' = ' + sub('y', '0') + ' + ' + sub('v', 'y') + v('t') + ' &minus; &frac12;' + v('g') + v('t') + '<sup>2</sup>') + '<p>so ' + sub('v', 'x') + ' and ' + sub('v', 'y') + ' are the velocity components at release, and ' + sub('x', '0') + ' and ' + sub('y', '0') + ' are the release position.</p>')
        + '<div class="' + gClass(F) + '"><p><b>Gravity check:</b> ' + (Number.isFinite(F.gFree) ? 'letting the data choose <em>g</em> gives <b>' + fmt(F.gFree, 2) + ' &plusmn; ' + fmt(F.seg, 2) + ' m/s&sup2;</b> (should be 9.81). ' : '') + gText(F) + '</p></div>'
        + layer('nums', 'How well it fits', '<p>Residuals (data minus fit): <b>' + fmt(F.rmsX * 1000, 1) + ' mm</b> horizontally and <b>' + fmt(F.rmsY * 1000, 1) + ' mm</b> vertically (RMS). This is roughly your clicking (or marker) precision.</p><p class="small">Good residuals are small and scattered randomly either side of zero. A curve or a trend in the residuals means the model does not fit: usually a contact frame included, a moving camera, or (for light balls) air resistance.</p>')
        + layer('why', 'For the rest of the analysis', '<p>Now that the check has passed, the tool <strong>fixes g at 9.81 m/s&sup2;</strong> and fits again. We know gravity, so there is one less thing to estimate and the release velocity comes out more precise. The lower graph shows why we fit rather than difference.</p>');
    },
    draw(ctx, w, h) {
      const F = fit(); if (!F) return; const f = F.f, T = f.t[f.t.length - 1];
      const rows = 4, hh = h / rows, R = (k) => ({ x: 0, y: hh * k, w, h: hh }), tt = [], fx = [], fy = [];
      for (let k = 0; k <= 100; k++) { const q = T * k / 100; tt.push(q); fx.push(F.x0 + F.vx * q); fy.push(F.y0 + F.vy * q - 0.5 * G * q * q); }
      const tx = [-0.02 * T, T * 1.02];
      const a = panel(ctx, { rect: R(0), x: tx, y: lim([f.x]), yl: 'x (m)', title: 'Horizontal: a straight line' }); line(ctx, a, tt, fx, C.adj, 2.5); dots(ctx, a, f.t, f.x, C.pts, 2.8);
      const b = panel(ctx, { rect: R(1), x: tx, y: lim([f.y]), yl: 'y (m)', title: 'Vertical: a parabola (g = 9.81)' }); line(ctx, b, tt, fy, C.opp, 2.5); dots(ctx, b, f.t, f.y, C.pts, 2.8);
      const rx = Array.from(F.resX, (q) => q * 1000), ry = Array.from(F.resY, (q) => q * 1000), m = Math.max(5, maxAbs(rx), maxAbs(ry)) * 1.2;
      const c = panel(ctx, { rect: R(2), x: tx, y: [-m, m], yl: 'mm', title: 'Residuals: data minus fit' }); line(ctx, c, f.t, rx, C.adj, 1.5); line(ctx, c, f.t, ry, C.opp, 1.5); dots(ctx, c, f.t, rx, C.adj, 2.5); dots(ctx, c, f.t, ry, C.opp, 2.5);
      const vd = [], td = []; for (let i = 1; i < f.t.length - 1; i++) { vd.push((f.y[i + 1] - f.y[i - 1]) / (f.t[i + 1] - f.t[i - 1])); td.push(f.t[i]); }
      const vl = lim([vd, [F.vy, F.vy - G * T]], 0.1);
      const d = panel(ctx, { rect: R(3), x: tx, y: vl, xl: 'Time since release (s)', yl: 'v_y (m/s)', title: 'Vertical velocity: differencing (dots) vs the fit (line)' });
      line(ctx, d, [0, T], [F.vy, F.vy - G * T], C.fit, 2.5); dots(ctx, d, td, vd, C.opp, 2.8);
    },
  },
  {
    key: 'release', short: 'Release', title: 'Release speed, angle and height', enabled: () => !!fit(), figTitle: () => 'Release velocity on the measured flight',
    hint: () => 'The triangle is the release velocity, drawn to scale (1 m/s = ' + fmt(triScale() * 100, 0) + ' cm).',
    body: () => {
      const F = fit(); if (!F) return ''; const p = F.pol, dtv = F.dt;
      return '<table class="res"><tr><th>Release</th><th style="text-align:right">Value</th></tr>'
        + '<tr><td>Horizontal velocity, ' + sub('v', 'x') + '</td><td class="n">' + pm(F.vx, F.sevx) + ' m/s</td></tr>'
        + '<tr><td>Vertical velocity, ' + sub('v', 'y') + '</td><td class="n">' + pm(F.vy, F.sevy) + ' m/s</td></tr>'
        + '<tr><td><b>Release speed</b>, ' + v('v') + '</td><td class="n">' + pm(p.v, p.sv) + ' m/s</td></tr>'
        + '<tr><td><b>Release angle</b>, &theta;</td><td class="n">' + pm(p.th, p.sth, 1, 2) + '&deg;</td></tr>'
        + '<tr><td><b>Release height</b>, ' + sub('y', '0') + '</td><td class="n">' + fmt(F.y0, 3) + ' m</td></tr></table>'
        + '<p class="small muted">&plusmn; is the standard error from the fit: how much the value could shift with different clicks of the same frames.</p>'
        + layer('nums', 'Worked out', '<div class="calc">v = &radic;(' + fmt(F.vx, 2) + '<sup>2</sup> + ' + sgn(F.vy, 2) + '<sup>2</sup>) = &radic;' + fmt(F.vx ** 2 + F.vy ** 2, 2) + ' = <b>' + fmt(p.v, 2) + ' m/s</b></div><div class="calc">&theta; = tan<sup>&minus;1</sup>(' + sgn(F.vy, 2) + ' &divide; ' + fmt(F.vx, 2) + ') = tan<sup>&minus;1</sup>(' + fmt(F.vy / F.vx, 3) + ') = <b>' + sgn(p.th, 1) + '&deg;</b></div><p class="small">Exactly the triangle from Learn steps 4 to 6, with your own numbers.</p>')
        + (A.truth ? layer('why', 'Demo check', truthHTML(F)) : '')
        + layer('why', 'Limits to keep in mind', '<ul><li><b>Timing of release.</b> The values are for the moment of your release frame. The real release was somewhere between the last frame in the hand and the first free frame (' + fmt(dtv * 1000, 1) + ' ms apart). Moving release by one frame changes ' + sub('v', 'y') + ' by <em>g</em> &times; ' + fmt(dtv, 3) + ' s = ' + fmt(G * dtv, 2) + ' m/s (about ' + fmt(Math.abs(polar(F.vx, F.vy - G * dtv, 0, 0).th - F.pol.th), 1) + '&deg; of angle) and the height by about ' + fmt(Math.abs(F.vy) * dtv * 100, 1) + ' cm. ' + sub('v', 'x') + ' does not change. This is why a high frame rate and a careful release frame matter, and why you should use the same rule for every trial.</li><li><b>2D.</b> Any movement towards or away from the camera is missed and the scale is wrong away from the calibration plane.</li><li><b>Air resistance</b> is ignored. Fine for a shot, a basketball or a body; not for a shuttlecock or a football struck hard.</li>' + (A.task === 'broadjump' ? '<li><b>Centre of mass.</b> Only as good as the body model and the markers it came from.</li>' : '') + '</ul>');
    },
    draw(ctx, w, h) {
      const F = fit(); if (!F) return; const P = trajFigure(ctx, { x: 0, y: 0, w, h }, { predict: false });
      const f = F.f, T = f.t[f.t.length - 1], xs = [], ys = []; for (let k = 0; k <= 60; k++) { const p = pos(P0(F), T * k / 60); xs.push(p[0]); ys.push(p[1]); } line(ctx, P, xs, ys, C.fit, 2);
      const s = triScale(), O = [P.X(F.x0), P.Y(F.y0)], Hh = [P.X(F.x0 + F.vx * s), O[1]], Tt = [Hh[0], P.Y(F.y0 + F.vy * s)];
      arrow(ctx, O[0], O[1], Hh[0], Hh[1], C.adj, 3.5); arrow(ctx, Hh[0], Hh[1], Tt[0], Tt[1], C.opp, 3.5); arrow(ctx, O[0], O[1], Tt[0], Tt[1], C.hyp, 4, 14);
      rightMark(ctx, Hh[0], Hh[1], [-1, 0], [0, F.vy > 0 ? -1 : 1], 10);
      label(ctx, 'v_x = ' + fmt(F.vx, 2), (O[0] + Hh[0]) / 2, O[1] + 16, C.adj, { size: 12 });
      label(ctx, 'v_y = ' + sgn(F.vy, 2), Hh[0] + 8, (Hh[1] + Tt[1]) / 2, C.opp, { align: 'left', size: 12 });
      label(ctx, fmt(F.pol.v, 2) + ' m/s at ' + fmt(F.pol.th, 1) + '°', (O[0] + Tt[0]) / 2 - 10, (O[1] + Tt[1]) / 2 - 14, C.hyp, { align: 'right', size: 12 });
      line(ctx, P, [F.x0, F.x0], [0, F.y0], '#475569', 1.5, [4, 3]); label(ctx, 'release height ' + fmt(F.y0, 2) + ' m', P.X(F.x0) + 6, (P.Y(0) + O[1]) / 2, '#475569', { align: 'left', size: 12 });
    },
  },
  {
    key: 'outcome', short: 'What it predicts', title: 'What the release predicts', enabled: () => !!fit(), figTitle: () => 'Measured flight and the predicted path',
    hint: () => 'Blue: the path predicted from the release values alone.',
    body: () => {
      const F = fit(); if (!F) return ''; const o = outcome(P0(F));
      let h = '<div class="field"><label for="taskSel">What is it?</label><select id="taskSel">' + Object.entries(TASKS).map(([k, n]) => '<option value="' + k + '"' + (k === A.task ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div>';
      const num = (id, lab, val, step = 0.01) => '<div class="field"><label for="' + id + '">' + lab + '</label><input type="number" id="' + id + '" step="' + step + '" value="' + (Number.isFinite(val) ? +val.toFixed(3) : '') + '"></div>';
      const row = (a, b, bold) => '<tr><td>' + (bold ? '<b>' + a + '</b>' : a) + '</td><td class="n">' + b + '</td></tr>';
      if (A.task === 'lineout') {
        h += num('tgx', 'Catch point: distance from the thrower (m)', A.target.x) + num('tgy', 'Catch point: height of the hands (m)', A.target.y);
        const on = Math.abs(o.dyCatch) <= 0.25;
        h += '<table class="res">' + row('Peak height', fmt(o.peak, 2) + ' m') + row('Time to reach the catcher', fmt(o.tCatch, 2) + ' s', true) + row('Ball height at the catcher', fmt(o.yCatch, 2) + ' m (' + (o.dyCatch >= 0 ? fmt(o.dyCatch * 100, 0) + ' cm above' : fmt(-o.dyCatch * 100, 0) + ' cm below') + ' the catch point)', true) + row('Ball at the catcher is', o.rising ? 'still rising' : 'dropping') + row('Ball speed at the catcher', fmt(o.vCatch, 1) + ' m/s') + row('Verdict', on ? 'On target (within 25 cm of the hands).' : o.dyCatch > 0 ? 'Over the catcher\u2019s hands.' : 'Under the catch point.') + '</table>';
        h += layer('eq', 'How these are worked out', '<p>Forwards speed never changes, so the time to reach the catcher is ' + v('t') + ' = (' + sub('x', 'catch') + ' &minus; ' + sub('x', '0') + ') &divide; ' + sub('v', 'x') + '. The height then is ' + sub('y', '0') + ' + ' + sub('v', 'y') + v('t') + ' &minus; &frac12;' + v('g') + v('t') + '<sup>2</sup>.</p>')
          + layer('why', 'What matters in a line-out', '<p><b>Time to the catcher</b> is the big one: a flatter, faster throw gets there sooner, so the opposition jumper has less time to compete. A loopy throw is easier to catch but slower.</p><p>Two limits: a rugby ball is not round, so click its middle every frame; and over a long, spinning throw air resistance starts to matter, so treat long-throw predictions as approximate.</p>');
      } else if (isHoop()) {
        const K = ringOf(); h += num('tgx', 'Middle of the ' + K.name + ', horizontal (m)', A.target.x) + num('tgy', 'Middle of the ' + K.name + ', height (m)', A.target.y);
        const verdict = !Number.isFinite(o.miss) ? 'It never comes back down to ' + K.name + ' height.' : !(o.margin > 0) ? 'Too flat to fit through the ' + K.name + ' at all.' : Math.abs(o.miss) <= o.margin ? 'Goes in cleanly' + (K.board ? ' (ignoring the backboard).' : '.') : (o.miss > 0 ? 'Long: hits the back of the ' + K.name + ' or misses.' : 'Short: hits the front of the ' + K.name + ' or misses.');
        h += '<table class="res">' + row('Peak height', fmt(o.peak, 2) + ' m') + row('Ball centre at ' + K.name + ' height (coming down)', Number.isFinite(o.miss) ? Math.abs(o.miss * 100).toFixed(1) + ' cm ' + (o.miss >= 0 ? 'long' : 'short') : '&ndash;', true) + row('Entry angle', fmt(o.entry, 1) + '&deg;', true) + row('Room for error at that angle', Number.isFinite(o.margin) && o.margin > 0 ? '&plusmn;' + fmt(o.margin * 100, 1) + ' cm' : 'none') + row('Verdict', verdict) + '</table>';
        h += layer('eq', 'How these are worked out', '<p>Time to come down to ' + K.name + ' height ' + sub('y', 'h') + ': solve ' + sub('y', '0') + ' + ' + sub('v', 'y') + v('t') + ' &minus; &frac12;' + v('g') + v('t') + '<sup>2</sup> = ' + sub('y', 'h') + ' (later root). Then ' + v('x') + ' = ' + sub('x', '0') + ' + ' + sub('v', 'x') + v('t') + '.</p><p>Entry angle = tan<sup>&minus;1</sup>(|' + sub('v', 'y') + ' at the ' + K.name + '| &divide; ' + sub('v', 'x') + '). A ball coming in at angle &alpha; &ldquo;sees&rdquo; an opening of 2' + v('R') + ' sin &alpha;, so the room for error is ' + v('R') + ' &minus; ' + v('r') + '/sin &alpha;, with ' + K.name + ' radius ' + v('R') + ' = ' + fmt(K.R * 100, 1) + ' cm and ball radius ' + v('r') + ' = ' + fmt(K.r * 100, 1) + ' cm. Below about ' + fmt(deg(Math.asin(K.r / K.R)), 0) + '&deg; the ball cannot fit through at all.' + (K.board ? '' : ' Netball has no backboard, so a long shot cannot be rescued off the board.') + '</p>')
          + layer('why', 'Compared with the ideal', '<p>From this release point, the angle that needs the <b>least speed</b> is <b>' + fmt(o.min.th, 1) + '&deg;</b> (' + fmt(o.min.v, 2) + ' m/s). This shot was released at ' + fmt(F.pol.th, 1) + '&deg;.</p><p>At this release angle, a perfect shot (through the centre) needs <b>' + fmt(o.vNeed, 2) + ' m/s</b>. This shot had ' + fmt(o.vNow, 2) + ' m/s, so it was <b>' + fmt(Math.abs(o.vNow - o.vNeed), 2) + ' m/s ' + (o.vNow >= o.vNeed ? 'too fast' : 'too slow') + '</b>. Try the What if step to see how small that is.</p>');
      } else {
        h += num('landH', A.task === 'broadjump' ? 'Centre of mass height at landing (m)' : 'Landing height (m)', landHeight());
        if (A.task === 'broadjump') h += num('toD', 'Take-off distance: toes to CoM (m)', A.takeoffDist) + num('laD', 'Landing distance: CoM to heels (m)', A.landingDist);
        if (A.task === 'shot') h += num('relA', 'Release point ahead of the stop board (m)', A.releaseAhead);
        const tm = F.force ? NaN : A.t[A.land] - A.t[A.rel];
        h += '<table class="res">' + row('Peak height', fmt(o.peak, 2) + ' m (' + fmt(o.rise, 2) + ' m above release)') + row('Time to the peak', fmt(o.tPeak, 3) + ' s') + row('Flight time to landing height', fmt(o.tf, 3) + ' s') + row('Horizontal distance in flight', fmt(o.R, 2) + ' m', A.task === 'general')
          + (A.task === 'broadjump' ? row('Jump distance (toes to heels)', fmt(o.total, 2) + ' m', true) : '') + (A.task === 'shot' ? row('Distance thrown (from the stop board)', fmt(o.total, 2) + ' m', true) : '') + '</table>'
          + (F.force ? '<p class="small muted">Predicted from the take-off velocity (force platform) and the centre of mass height you entered.</p>' : '<p class="small muted">Frames in flight cover ' + fmt(tm, 3) + ' s. The prediction runs on to the landing height, which may be after the last digitised frame.</p>');
        if (A.task === 'broadjump') {
          const pc = (q) => fmt(100 * q / o.total, 0) + '%';
          h += layer('eq', 'Splitting the jump distance (Hay, 1986)', '<p>The measured distance is not just the flight of the centre of mass. It has three parts:</p>' + eqn(v('D') + ' = ' + sub('d', 'take-off') + ' + ' + sub('d', 'flight') + ' + ' + sub('d', 'landing')) + '<div class="calc">' + fmt(A.takeoffDist, 2) + ' + ' + fmt(o.R, 2) + ' + ' + fmt(A.landingDist, 2) + ' = <b>' + fmt(o.total, 2) + ' m</b></div><p>Here: take-off ' + pc(A.takeoffDist) + ', flight ' + pc(o.R) + ', landing ' + pc(A.landingDist) + '. Leaning further forward at take-off, or reaching the feet further forward on landing, adds distance without changing the flight at all.</p><p class="small">Take-off and landing distances come from the video (horizontal distance from the toes to the centre of mass at take-off, and from the centre of mass to the heels at landing).</p>');
        }
        if (A.task === 'shot') h += layer('why', 'Compared with the textbook best angle', '<p>For this speed and height, the angle that would go furthest is <b>' + fmt(o.opt, 1) + '&deg;</b> (' + fmt(o.Ropt, 2) + ' m), against ' + fmt(F.pol.th, 1) + '&deg; here. That assumes the athlete could produce the same speed at that angle. They cannot: release speed falls as the angle goes up, so the real best angle for a shot putter is lower, about 35 to 38&deg; (Linthorne, 2001).</p>');
      }
      if (!F.force) h += layer('words', 'Check the model', '<p>The blue line is predicted from <em>only</em> the three release values. If it runs through your dots, the release values describe the whole flight. Largest gap between them: <b>' + fmt(maxGap(F) * 1000, 0) + ' mm</b>.</p>');
      return h;
    },
    wire() {
      $('taskSel').addEventListener('change', (e) => { A.task = e.target.value; A.ex = null; app.render(); });
      const bind = (id, fn) => { const el = $(id); if (el) el.addEventListener('change', () => { const val = el.value === '' ? null : +el.value; fn(val); A.ex = null; app.render(); }); };
      bind('tgx', (q) => { A.target.x = q ?? A.target.x; A.targetPx = null; }); bind('tgy', (q) => { A.target.y = q ?? A.target.y; A.targetPx = null; });
      bind('landH', (q) => { A.landH = q; }); bind('toD', (q) => { A.takeoffDist = q || 0; }); bind('laD', (q) => { A.landingDist = q || 0; }); bind('relA', (q) => { A.releaseAhead = q || 0; });
    },
    draw(ctx, w, h) {
      const F = fit(); if (!F) return; const P = trajFigure(ctx, { x: 0, y: 0, w, h }, { predict: true }); predPath(ctx, P, P0(F), C.fit, 2.5);
    },
  },
  {
    key: 'explore', short: 'What if', title: 'What if the release were different?', enabled: () => !!fit(), figTitle: () => 'Measured (blue) and what-if (pink)',
    hint: () => 'Move the sliders. The blue path is what actually happened.',
    tools: () => { const e = ex(); return sl('ev', 'Speed', e.v0 * 0.7, e.v0 * 1.3, 0.01, 'm/s') + sl('eth', 'Angle', Math.max(0, e.th0 - 30), Math.min(89, e.th0 + 30), 0.1, '°') + sl('eh', 'Height', Math.max(0, e.h0 - 1), e.h0 + 1, 0.01, 'm') + '<button type="button" class="btn small ghost" id="exReset">Back to the measured release</button>'; },
    body: () => '<div id="exOut"></div>' + layer('words', 'Using this', '<p>This is where the analysis becomes coaching. Change one thing at a time and see what it is worth. The table shows how much the outcome moves for a small change in each release value, worked out at the slider settings.</p>'),
    wire() {
      ['ev', 'eth', 'eh'].forEach((k) => { const el = $('s_' + k); el.addEventListener('input', () => { ex()[k] = +el.value; $('o_' + k).textContent = (+el.value).toFixed(k === 'eth' ? 1 : 2) + ' ' + (k === 'ev' ? 'm/s' : k === 'eth' ? '°' : 'm'); app.redraw(); }); });
      $('exReset').addEventListener('click', () => { A.ex = null; app.render(); });
    },
    draw(ctx, w, h) {
      const F = fit(); if (!F) return; const e = ex(), Pw = fromPolar(e.ev, e.eth, e.eh, F.x0);
      const P = trajFigure(ctx, { x: 0, y: 0, w, h }, { predict: true, Pp: Pw }); predPath(ctx, P, P0(F), C.fit, 2); predPath(ctx, P, Pw, C.what, 3);
      exOut(F, e, Pw);
    },
  },
  {
    key: 'export', short: 'Save', title: 'Save your results', enabled: () => !!fit(), figTitle: () => 'The figure that will be saved',
    body: () => {
      const F = fit(); if (!F) return '';
      if (F.force) return layer('words', 'Downloads', '<div class="row"><button type="button" class="btn" id="dlCsv">Results and force data (CSV)</button><button type="button" class="btn accent" id="dlPng">Figure (PNG)</button><button type="button" class="btn ghost" id="cpTxt">Copy results</button></div>')
        + layer('words', 'For a lab report', '<details class="more" open><summary>A method sentence to adapt</summary><p class="small">Take-off velocity was calculated from the ground reaction forces (' + fmt(A.force.fs, 0) + ' Hz) by dividing net vertical force (vertical force minus bodyweight, from ' + fmt((A.force.we - A.force.ws) * A.force.dt, 1) + ' s of quiet standing) and horizontal force by body mass and integrating from rest to take-off (vertical force below 20 N) using the trapezium rule. The flight of the centre of mass was then predicted from the take-off velocity and a take-off centre of mass height of ' + fmt(A.h0, 2) + ' m, with jump distance taken as the sum of take-off, flight and landing distances (Hay, 1986).</p></details>');
      return layer('words', 'Downloads', '<div class="row"><button type="button" class="btn" id="dlCsv">Results and data (CSV)</button><button type="button" class="btn accent" id="dlPng">Figure (PNG)</button><button type="button" class="btn ghost" id="cpTxt">Copy results</button></div><p class="small">The CSV has the settings, the release values with their standard errors, the predicted outcome, and every frame: time, position, the fitted position and the residual. It opens in Excel.</p>')
        + layer('words', 'For a lab report', '<p>Report the method as well as the numbers: frame rate, how you calibrated, how many frames were fitted, the gravity check (' + fmt(F.gFree, 2) + ' m/s&sup2;) and the residuals (' + fmt(F.rmsY * 1000, 1) + ' mm). A marker would want to know how you know your numbers are trustworthy.</p><details class="more"><summary>A method sentence to adapt</summary><p class="small">Release speed, angle and height were estimated by fitting a linear model to horizontal position and a quadratic model with gravitational acceleration fixed at 9.81 m&middot;s<sup>&minus;2</sup> to vertical position across ' + F.n + ' flight frames (least squares), with time referenced to the first frame after release. ' + (Number.isFinite(F.gFree) ? 'When gravitational acceleration was freely estimated it was ' + fmt(F.gFree, 2) + ' m&middot;s<sup>&minus;2</sup>, and root' : 'Too few frames were available to estimate gravitational acceleration freely as a check, and root') + ' mean square residuals were ' + fmt(F.rmsX * 1000, 1) + ' mm (horizontal) and ' + fmt(F.rmsY * 1000, 1) + ' mm (vertical).</p></details>');
    },
    wire() { $('dlCsv').addEventListener('click', exportCSV); $('dlPng').addEventListener('click', exportPNG); $('cpTxt').addEventListener('click', () => { navigator.clipboard.writeText(resultRows().map((r) => r.join('\t')).join('\n')).then(() => { $('cpTxt').textContent = 'Copied'; }, () => {}); }); },
    draw(ctx, w, h) { const F = fit(); if (!F) return; const P = trajFigure(ctx, { x: 0, y: 0, w, h }, { predict: true }); predPath(ctx, P, P0(F), C.fit, 2.5); stamp(ctx, P, F); },
  },
];

// ---------- the simple path: Load, Scale, Click the ball, Results; everything else under Go further ----------
// The force-platform long jump: the force record and the velocities integrated from it.
const FORCE_TRACE = {
  figTitle: () => 'Force and velocity, from standing still to take-off', hint: () => 'Shaded: the push. Dashed: bodyweight.',
  body: () => {
    const R = A.force; if (!R) return '';
    return layer('words', 'How the take-off velocity is worked out', '<p>Newton&rsquo;s second law: the net force on the jumper, divided by their mass, is their acceleration. Add up (integrate) the acceleration from standing still to take-off and you get the take-off velocity, separately upwards and forwards.</p>'
      + eqn(sub('v', 'y') + ' = &int; (' + sub('F', 'z') + ' &minus; ' + v('W') + ') &divide; ' + v('m') + ' d' + v('t') + ' &nbsp;&nbsp; ' + sub('v', 'x') + ' = &int; ' + sub('F', 'h') + ' &divide; ' + v('m') + ' d' + v('t'))
      + '<p class="small">' + v('W') + ' is bodyweight (from standing still), ' + v('m') + ' = ' + v('W') + ' &divide; 9.81, ' + sub('F', 'z') + ' the vertical force and ' + sub('F', 'h') + ' the forwards force (for each platform, whichever of Fx or Fy pushed forwards, with its standing-still value taken off). This is the same method as Force Analysis.</p>')
      + '<table class="res"><tr><td>Bodyweight (standing still)</td><td class="n">' + fmt(R.BW, 0) + ' N (' + fmt(R.m, 1) + ' kg)</td></tr><tr><td>Push: start of movement to take-off</td><td class="n">' + fmt((R.TO - R.on) * R.dt, 2) + ' s</td></tr><tr><td>Forwards force from</td><td class="n">' + esc(R.axes) + '</td></tr>'
      + '<tr><td><b>Take-off velocity forwards</b>, ' + sub('v', 'x') + '</td><td class="n">' + fmt(R.vx, 2) + ' m/s</td></tr><tr><td><b>Take-off velocity upwards</b>, ' + sub('v', 'y') + '</td><td class="n">' + fmt(R.vy, 2) + ' m/s</td></tr>'
      + '<tr><td>Take-off speed</td><td class="n">' + fmt(Math.hypot(R.vx, R.vy), 2) + ' m/s</td></tr><tr><td>Take-off angle</td><td class="n">' + fmt(deg(Math.atan2(R.vy, R.vx)), 1) + '&deg;</td></tr></table>'
      + layer('nums', 'Worked out', '<div class="calc">v = &radic;(' + fmt(R.vx, 2) + '<sup>2</sup> + ' + fmt(R.vy, 2) + '<sup>2</sup>) = <b>' + fmt(Math.hypot(R.vx, R.vy), 2) + ' m/s</b></div><div class="calc">&theta; = tan<sup>&minus;1</sup>(' + fmt(R.vy, 2) + ' &divide; ' + fmt(R.vx, 2) + ') = <b>' + fmt(deg(Math.atan2(R.vy, R.vx)), 1) + '&deg;</b></div><p class="small">The same triangle as every other projectile in this tool: the force platform just gives you the two short sides.</p>');
  },
  draw(ctx, w, h) {
    const R = A.force; if (!R) return; const a = Math.max(0, R.on - Math.round(0.4 * R.fs)), b = Math.min(R.n - 1, R.TO + Math.round(0.25 * R.fs)), st = Math.max(1, Math.round((b - a) / 900));
    const t = [], fz = [], fh = [], vz = [], vh = []; for (let i = a; i <= b; i += st) { t.push((i - R.TO) * R.dt); fz.push(R.Fz[i]); fh.push(R.Fh[i]); vz.push(R.vz[i]); vh.push(R.vh[i]); }
    const top = { x: 0, y: 0, w, h: h * 0.55 }, bot = { x: 0, y: h * 0.55, w, h: h * 0.45 }, tx = [t[0], t[t.length - 1]];
    const P1 = panel(ctx, { rect: top, x: tx, y: lim([fz, fh, [0]]), yl: 'Force (N)', title: 'Vertical (purple) and forwards (orange) force' });
    ctx.save(); ctx.fillStyle = 'rgba(29,78,216,.07)'; ctx.fillRect(P1.X((R.on - R.TO) * R.dt), P1.r.T, P1.X(0) - P1.X((R.on - R.TO) * R.dt), P1.r.B - P1.r.T); ctx.restore();
    line(ctx, P1, tx, [R.BW, R.BW], '#64748b', 1.5, [5, 4]); line(ctx, P1, t, fz, C.opp, 2); line(ctx, P1, t, fh, C.adj, 2); line(ctx, P1, [0, 0], P1.y, '#16a34a', 1.5, [4, 3]);
    label(ctx, 'take-off', P1.X(0), P1.r.T + 10, '#16a34a', { size: 11 });
    const P2 = panel(ctx, { rect: bot, x: tx, y: lim([vz, vh, [0]]), xl: 'Time from take-off (s)', yl: 'Velocity (m/s)', title: 'Velocity upwards (purple) and forwards (orange)' });
    line(ctx, P2, t, vz, C.opp, 2.5); line(ctx, P2, t, vh, C.adj, 2.5); line(ctx, P2, [0, 0], P2.y, '#16a34a', 1.5, [4, 3]); dots(ctx, P2, [0, 0], [R.vy, R.vx], '#0f172a', 4);
  },
};
const SUBS_FLIGHT = [
  { s: OLD[3], name: 'Release and landing frames' }, { s: OLD[4], name: 'Fit and gravity check' }, { s: OLD[5], name: 'Release, in detail' },
  { s: OLD[6], name: 'What it predicts' }, { s: OLD[7], name: 'What if' }, { s: OLD[8], name: 'Save and report' },
];
const SUBS_FORCE = [{ s: FORCE_TRACE, name: 'Force and velocity' }, { s: OLD[6], name: 'What it predicts' }, { s: OLD[7], name: 'What if' }, { s: OLD[8], name: 'Save and report' }];
const subs = () => (A.src === 'force' ? SUBS_FORCE : SUBS_FLIGHT);
const gfi = () => Math.min(A.gf, subs().length - 1);
const FILM_HELP = '<details class="more"><summary>Before you film: how to get a flight you can analyse</summary><ul class="small"><li><b>Side-on and square</b> to the throw or jump, with the camera <b>level</b> on a tripod. Don&rsquo;t move it.</li><li><b>Far back, zoomed in a little</b> (e.g. 8 to 10 m away for a free throw).</li><li>A <b>1 m stick</b> (or anything of known length) held upright where the athlete is, in the plane of the movement.</li><li>The <b>whole flight</b> in shot, from just before release to landing or the hoop.</li><li><b>Highest frame rate</b> you have (slow motion is great: note the rate it was filmed at), and plenty of light.</li></ul></details>';
function nextScaleMode() { const c = A.cal; return !c.a ? (A.calBy === 'ball' ? 'calBall' : 'calA') : !c.b ? 'calB' : !c.o ? 'o' : hasTarget() && !A.targetPx ? 'target' : 'idle'; }
const tick = (done, cur, html) => '<li class="chk' + (done ? ' done' : cur ? ' cur' : '') + '"><span>' + (done ? '&#10003;' : cur ? '&#9654;' : '&bull;') + '</span><div>' + html + '</div></li>';
function drawTriangle(ctx, P, F, big = 1) {
  const s = triScale() * big, O = [P.X(F.x0), P.Y(F.y0)], Hh = [P.X(F.x0 + F.vx * s), O[1]], Tt = [Hh[0], P.Y(F.y0 + F.vy * s)];
  ctx.save(); ctx.fillStyle = 'rgba(29,78,216,.08)'; ctx.beginPath(); ctx.moveTo(...O); ctx.lineTo(...Hh); ctx.lineTo(...Tt); ctx.closePath(); ctx.fill(); ctx.restore();
  arrow(ctx, O[0], O[1], Hh[0], Hh[1], C.adj, 4, 13); arrow(ctx, Hh[0], Hh[1], Tt[0], Tt[1], C.opp, 4, 13); arrow(ctx, O[0], O[1], Tt[0], Tt[1], C.hyp, 5, 15);
  label(ctx, 'forwards ' + fmt(F.vx, 1), (O[0] + Hh[0]) / 2, O[1] + 18, C.adj, { size: 13 });
  label(ctx, (F.vy >= 0 ? 'upwards ' : 'downwards ') + fmt(Math.abs(F.vy), 1), Hh[0] + 8, (Hh[1] + Tt[1]) / 2, C.opp, { align: 'left', size: 13 });
}
function ring(ctx, P, x, y, col, txt) { ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(P.X(x), P.Y(y), 11, 0, 2 * Math.PI); ctx.stroke(); ctx.restore(); label(ctx, txt, P.X(x), P.Y(y) - 22, col, { size: 12 }); }
function oneLine(F) { const t = oneLine0(F); return F.n < 10 ? t + ' <span class="small muted">(Rough: predicted from only ' + F.n + ' frames, so it could be well out.)</span>' : t; }
function oneLine0(F) {
  const o = outcome(P0(F));
  if (A.task === 'lineout') return 'Reaches the catcher after <b>' + fmt(o.tCatch, 2) + ' s</b>, ' + (Math.abs(o.dyCatch) < 0.005 ? '<b>right at</b> the catch point' : '<b>' + fmt(Math.abs(o.dyCatch) * 100, 0) + ' cm ' + (o.dyCatch >= 0 ? 'above' : 'below') + '</b> the catch point') + (Math.abs(o.dyCatch) <= 0.25 ? ': <b>on target</b>.' : '.');
  if (isHoop()) { const K = ringOf(); if (!Number.isFinite(o.miss)) return 'It never comes back down to the ' + K.name + '.'; const ok = o.margin > 0 && Math.abs(o.miss) <= o.margin; return 'Reaches the ' + K.name + ' <b>' + Math.round(Math.abs(o.miss) * 100) + ' cm ' + (o.miss >= 0 ? 'long' : 'short') + '</b> of the middle, coming in at ' + fmt(o.entry, 0) + '&deg;: <b>' + (ok ? 'in' : 'out') + '</b>.'; }
  if (A.task === 'broadjump') return 'Jump distance <b>' + fmt(o.total, 2) + ' m</b> (centre of mass flight ' + fmt(o.R, 2) + ' m, plus take-off and landing distances).';
  if (A.task === 'shot') return 'Distance thrown <b>' + fmt(o.total, 2) + ' m</b> from the stop board.';
  return 'Lands <b>' + fmt(o.R, 2) + ' m</b> further on, after <b>' + fmt(o.tf, 2) + ' s</b> in the air, peaking at ' + fmt(o.peak, 2) + ' m.';
}
const STEPS = [
  {
    key: 'load', short: 'Load', title: 'Choose something to analyse', figTitle: OLD[0].figTitle, hint: OLD[0].hint,
    body: () => {
      const ch = (k, t, d) => '<button type="button" class="choice' + (A.demo === k ? ' sel' : '') + '" data-demo="' + k + '"><b>' + t + '</b><span>' + d + '</span></button>';
      let h = '<div class="lead"><p>Start with the <b>free throw video</b>: it shows the perfect filming set-up, and you do every step yourself in about 5 minutes.</p></div><div class="choices">'
        + ch('video', '&#9654; Free throw video', 'Recommended first. Set the scale, mark the flight and track the ball.') + '</div>'
        + '<p style="margin:.8rem 0 .3rem"><b>Already clicked</b> (skip straight to the results)</p><div class="choices">'
        + ch('freethrow', 'Basketball free throw', 'The same shot as the video.') + ch('netball', 'Netball shot', 'Higher and steeper, and no backboard.') + ch('lineout', 'Line-out throw', 'Flat and fast to a catcher 7 m away.')
        + ch('broadjump', 'Broad jump', 'The jumper&rsquo;s centre of mass.') + ch('shot', 'Shot put', 'Filmed from far back.') + '</div>'
        + '<p style="margin:.8rem 0 .3rem"><b>Force platform</b></p><div class="choices">' + ch('slj', 'Standing long jump on force platforms', 'Take-off velocity from the forces, then the flight. The same trial as the Force Analysis demo.') + '</div>'
        + '<p style="margin:.9rem 0 .3rem"><b>Or your own:</b></p><div class="row"><label class="btn filebtn">Open a video<input type="file" id="fVid" accept="video/*,.avi" aria-label="Open a video"></label><label class="btn ghost filebtn">Open data (CSV)<input type="file" id="fCsv" accept=".csv,.txt,.tsv,text/csv,text/plain" aria-label="Open position data"></label><label class="btn ghost filebtn">Open force platform file<input type="file" id="fFrc" accept=".txt,.csv,.tsv,text/plain" aria-label="Open a force platform file"></label></div>'
        + FILM_HELP + '<details class="more"><summary>What a data file should look like</summary><p class="small">A <b>marker coordinates</b> export from <a href="../video-analyser/">Kinematic Analysis</a> works as it is (use the unfiltered positions). Otherwise a CSV with a header row: <code>time_s, x_m, y_m</code>, with y measured <b>up</b> from the floor, in metres.</p></details>';
      if (A.src) h += '<div class="status"><b>Loaded:</b> ' + esc(A.name) + (A.src === 'data' ? ' (' + N() + ' frames)' : A.src === 'force' && A.force ? ' (' + fmt(A.force.n / A.force.fs, 1) + ' s at ' + fmt(A.force.fs, 0) + ' Hz)' : '') + '.' + (A.note ? ' <span class="small">' + esc(A.note) + '</span>' : '')
        + (A.markers && A.markers.length > 1 ? '<div class="field"><label for="mkSel">Marker</label><select id="mkSel">' + A.markers.map((m) => '<option' + (m === A.marker ? ' selected' : '') + '>' + esc(m) + '</option>').join('') + '</select></div>' : '')
        + (A.csvParsed && A.csvParsed.ti < 0 ? '<div class="field"><label for="fpsData">Frame rate</label><input type="number" id="fpsData" min="1" step="1" value="' + A.fpsData + '"></div>' : '')
        + (A.csvParsed ? '<div class="field"><label for="unitSel">Units</label><select id="unitSel"><option value="1"' + (A.units === 1 ? ' selected' : '') + '>metres</option><option value="0.01"' + (A.units === 0.01 ? ' selected' : '') + '>centimetres</option><option value="0.001"' + (A.units === 0.001 ? ' selected' : '') + '>millimetres</option></select></div>' : '')
        + '</div><p><b>Next &rarr;</b> ' + (A.src === 'video' ? 'set the scale.' : 'see the results.') + '</p>';
      return h;
    },
    wire() {
      OLD[0].wire();
      document.querySelectorAll('[data-demo=slj]').forEach((b) => b.addEventListener('click', async (e) => { e.stopImmediatePropagation(); try { const r = await fetch(FORCE_DEMO.file); loadForce(await r.text(), FORCE_DEMO.name, true); } catch (err) { A.note = 'Could not load the demo file.'; app.render(); } }, true));
      $('fFrc').addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) loadForce(await f.text(), f.name, false); });
    },
    draw: OLD[0].draw,
  },
  {
    key: 'scale', short: 'Scale', title: 'Tell the tool how big things are', view: 'stage', enabled: () => A.src === 'video', canNext: () => calibrated(),
    body: () => {
      const c = A.cal, m = nextScaleMode();
      return '<div class="lead"><p>Follow the instruction on the video. The magnifier (top right) helps you click exactly.</p></div><ol class="checklist">'
        + '<div class="subtabs" style="margin:.2rem 0 .5rem"><button type="button" data-calby="stick" class="' + (A.calBy === 'stick' ? 'on' : '') + '">Scale from a known length</button><button type="button" data-calby="ball" class="' + (A.calBy !== 'stick' ? 'on' : '') + '">Nothing measured? Use the ball</button></div>'
        + (A.calBy === 'ball'
          ? tick(!!c.a, m === 'calBall', 'Go to a frame where the ball is <b>sharp and fully in the picture</b>, then <b>click the ball</b>. The tool finds its edge and measures it.')
            + '<li class="chk' + (c.a ? ' done' : '') + '"><span>' + (c.a ? '&#10003;' : '&bull;') + '</span><div>Ball size: <select id="ballSz" style="width:auto;display:inline-block"><option value="0.239"' + (c.len === 0.239 ? ' selected' : '') + '>basketball size 7 (23.9 cm)</option><option value="0.232"' + (c.len === 0.232 ? ' selected' : '') + '>basketball size 6 (23.2 cm)</option><option value="0.224"' + (c.len === 0.224 ? ' selected' : '') + '>netball size 5 (22.4 cm)</option><option value="0.220"' + (c.len === 0.22 ? ' selected' : '') + '>size 5 ball (22.0 cm)</option></select>' + (c.a && c.b ? ' &middot; measured ' + fmt(Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]), 1) + ' pixels across' : '') + '</div></li>'
            + '<li class="small muted" style="list-style:none">A ball is only a few dozen pixels across, so this is less precise than a longer known length (e.g. a 1 m stick). If the tool cannot find the ball, it asks you to click its two edges instead.</li>'
          : A.calBy === 'ballEdges'
          ? tick(!!c.a, m === 'calA', 'The tool could not find the ball by itself. Click its <b>left edge</b>')
            + tick(!!c.b, m === 'calB', 'Click its <b>right edge</b>. Ball size: <select id="ballSz" style="width:auto;display:inline-block"><option value="0.239"' + (c.len === 0.239 ? ' selected' : '') + '>size 7 (23.9 cm)</option><option value="0.232"' + (c.len === 0.232 ? ' selected' : '') + '>size 6 (23.2 cm)</option><option value="0.220"' + (c.len === 0.22 ? ' selected' : '') + '>size 5 (22.0 cm)</option></select>')
            + '<li class="small muted" style="list-style:none">A ball is only a few dozen pixels across, so a one-pixel slip changes the scale by a few per cent. Zoom in with the magnifier and click the very edge. A longer known length (e.g. a 1 m stick) is more accurate.</li>'
          : tick(!!c.a, m === 'calA', 'Click <b>one end</b> of something of known length <b>in the plane of the shot</b> (e.g. the 1 m stick, a marked line on the floor, or floor to rim, 3.05 m)')
            + tick(!!c.b, m === 'calB', 'Click <b>the other end</b>. It is <input type="number" id="calLen" min="0.01" step="0.01" value="' + c.len + '" style="width:5rem;display:inline-block"> m long'))
        + tick(!!c.o, m === 'o', 'Click the <b>floor</b> where you want 0 m (e.g. the free-throw line or the take-off line)')
        + (hasTarget() ? tick(!!A.targetPx, m === 'target', A.task === 'lineout' ? 'Click the <b>catcher&rsquo;s hands</b> at the catch (optional: you can type it in later)' : 'Click the <b>middle of the ' + ringOf().what + '</b>') : '') + '</ol>'
        + (calibrated() && (m === 'idle' || (m === 'target' && A.task === 'lineout')) ? '<div class="light-good"><b>Done!</b> Press <b>Next</b> to mark the flight and track the ball.</div>' : '')
        + '<div class="row"><button type="button" class="btn small ghost" id="calReset">Start again</button>' + (!hasTarget() ? '<label class="small" style="display:inline-flex;gap:.3rem;align-items:center">Is it a shot or a throw to a target? <select id="bTgt" style="width:auto;display:inline-block"><option value="">no</option><option value="freethrow">basketball</option><option value="netball">netball</option><option value="lineout">line-out</option></select></label>' : '') + (A.demo ? '<button type="button" class="btn small ghost" id="bDemoCal">Do it for me</button>' : '') + '</div>'
        + '<details class="more"' + (A.demo || A.avi ? '' : ' open') + '><summary>Frame rate' + (A.demo ? ' (already set: ' + VIDEO_DEMO.fps + ' fps)' : A.avi ? ' (read from the file: ' + fmt(A.realFps, 0) + ' fps)' : ': check this for your video') + '</summary><p class="small">For slow motion, use the rate it was <b>filmed</b> at (e.g. 240), not the rate it plays at.</p><div class="field"><label for="fileFps">Frames per second in the file</label><input type="number" id="fileFps" min="1" step="1" value="' + A.fileFps + '"></div><div class="field"><label for="realFps">Filmed at (fps)</label><input type="number" id="realFps" min="1" step="1" value="' + A.realFps + '"></div></details>';
    },
    tools: () => frameTools(),
    wire() {
      wireFrameTools(); A.mode = nextScaleMode(); drawStage();
      $('fileFps').addEventListener('change', (e) => { A.fileFps = Math.max(1, +e.target.value || 30); A.nF = Math.max(1, Math.round($('vid').duration * A.fileFps)); showFrame(A.frame); buildFromClicks(); app.render(); });
      $('realFps').addEventListener('change', (e) => { A.realFps = Math.max(1, +e.target.value || A.fileFps); buildFromClicks(); app.render(); });
      const cl = $('calLen'); if (cl) cl.addEventListener('change', (e) => { A.cal.len = Math.max(0.001, +e.target.value || 1); buildFromClicks(); app.render(); });
      const bs = $('ballSz'); if (bs) bs.addEventListener('change', (e) => { A.cal.len = +e.target.value; buildFromClicks(); app.render(); });
      document.querySelectorAll('[data-calby]').forEach((b) => b.addEventListener('click', () => { A.calBy = b.dataset.calby; A.cal = { a: null, b: null, len: A.calBy === 'ball' ? (A.task === 'netball' ? 0.224 : 0.239) : 1, o: A.cal.o }; buildFromClicks(); app.render(); }));
      $('calReset').addEventListener('click', () => { A.cal = { a: null, b: null, len: A.cal.len, o: null }; A.targetPx = null; app.render(); });
      const t = $('bTgt'); if (t) t.addEventListener('change', () => { if (t.value) { A.task = t.value; A.targetPx = null; app.render(); } });
      const d = $('bDemoCal'); if (d) d.addEventListener('click', () => { A.cal = { a: VIDEO_DEMO.stickPx[0].slice(), b: VIDEO_DEMO.stickPx[1].slice(), len: VIDEO_DEMO.stickLen, o: VIDEO_DEMO.originPx.slice() }; A.targetPx = [VIDEO_DEMO.originPx[0] + 4.225 * VIDEO_DEMO.pxPerM, VIDEO_DEMO.originPx[1] - 3.05 * VIDEO_DEMO.pxPerM]; buildFromClicks(); app.render(); });
    },
    drawStage, leave: () => { A.mode = 'idle'; $('loupe').style.display = 'none'; },
  },
  {
    key: 'track', short: 'Track the ball', title: 'Mark the flight, then track the ball', view: 'stage', enabled: () => A.src === 'video' && calibrated(), canNext: () => inWindow() >= 3 && !A.busy,
    body: () => {
      const E = A.ev, nIn = inWindow(), auto = A.trackMode === 'auto', tgt = isHoop() ? 'the ' + ringOf().name : A.task === 'lineout' ? 'the catcher' : 'the ground';
      const go = (f) => (f === null || f === undefined ? '' : ' <a href="#" data-gof="' + f + '">frame ' + f + '</a>');
      const firstIn = E.rel === null ? null : Object.keys(A.clicks).map(Number).filter((f) => f >= E.rel && (E.end === null || f <= E.end)).sort((a, b) => a - b)[0];
      return '<div class="lead"><p>First tell the tool <b>when</b> the flight starts and ends. Then it follows the ball for you, or you click it yourself.</p></div><ol class="checklist">'
        + tick(E.rel !== null, E.rel === null, 'Find the <b>first frame where the ball is clear of the hand</b>, then <button type="button" class="btn small" id="evRel">Mark release here</button>' + go(E.rel))
        + tick(E.end !== null, E.rel !== null && E.end === null, 'Find the <b>last frame before it reaches ' + tgt + ' or leaves the picture</b>, then <button type="button" class="btn small" id="evEnd">Mark end here</button>' + go(E.end))
        + tick(nIn >= 3 && (!auto || A.trkDone), E.rel !== null && E.end !== null && !(nIn >= 3 && (!auto || A.trkDone)), auto
          ? (firstIn === undefined ? 'Go to the release frame and <b>click the middle of the ball</b> once. The tool finds its edge.' : 'Press <button type="button" class="btn small accent" id="bTrack"' + (A.busy ? ' disabled' : '') + '>' + (A.busy ? 'Tracking&hellip;' : nIn > 1 ? 'Carry on tracking' : 'Track the ball') + '</button>' + (A.busy ? ' <button type="button" class="btn small ghost" id="bStop">Stop</button>' : '') + ' and it follows the ball to the end frame.')
          : 'Put the <b>red ring over the ball</b> so it sits on the ball&rsquo;s outline, and click. The video moves on by itself. From the third point, a <b>yellow dashed circle</b> shows where the ball should be.') + '</ol>'
        + '<label class="small" style="display:flex;gap:.4rem;align-items:center;margin:.1rem 0 .5rem"><input type="checkbox" id="trimCb"' + (A.trim ? ' checked' : '') + (evFrames().length >= 2 ? '' : ' disabled') + '> Only show the marked part of the video' + (evFrames().length >= 2 ? ' (frames ' + Math.min(...evFrames()) + ' to ' + Math.max(...evFrames()) + ')' : ' (mark release and end first)') + '</label>'
        + '<div class="subtabs"><button type="button" data-tm="manual" class="' + (auto ? '' : 'on') + '">Click it myself</button><button type="button" data-tm="auto" class="' + (auto ? 'on' : '') + '">Automatic (clear video only)</button></div>'
        + (auto ? '' : '<div class="row tight" style="align-items:center;gap:.4rem;margin:.2rem 0"><span class="small">Ring size</span><button type="button" class="btn small ghost" id="ringDn">&minus;</button><b id="ringOut" class="small">' + Math.round(ringR() * 2) + ' px</b><button type="button" class="btn small ghost" id="ringUp">+</button><span class="small muted">(or scroll on the video)</span></div>')
        + (A.trkMsg ? '<div class="status" id="trkMsg">' + A.trkMsg + '</div>' : '<div class="status hide" id="trkMsg"></div>')
        + '<div class="tiles"><div class="tile"><span>Ball points in the flight</span><b id="clickCount">' + nIn + '</b></div><div class="tile"><span>Frame</span><b id="frameNo2">' + A.frame + '</b></div></div>'
        + (nIn >= 3 && !A.busy ? '<p>' + (nIn >= 10 ? '<b>Done.</b> ' : 'Enough for rough values, but more is better. ') + 'Check the dots sit on the ball (step through, or look at the line), then press <b>Next</b>.</p>' : '')
        + '<label class="small" style="display:flex;gap:.4rem;align-items:center;margin:.3rem 0"><input type="checkbox" id="snapCb"' + (A.snap ? ' checked' : '') + '> Auto-centre: nudge each click to the middle of the ball (untick if it jumps to the wrong thing)</label>'
        + '<div class="row"><button type="button" class="btn small ghost" id="bUndo"' + (A.hist.length && !A.busy ? '' : ' disabled') + '>Undo last point</button><button type="button" class="btn small ghost" id="bClr"' + (Object.keys(A.clicks).length && !A.busy ? '' : ' disabled') + '>Clear all points</button>' + (A.demo ? '<button type="button" class="btn small ghost" id="bAuto"' + (A.busy ? ' disabled' : '') + '>Do it for me</button>' : '') + '</div>'
        + '<details class="more"><summary>Other events (optional)</summary><p class="small">Mark anything else worth knowing (e.g. <i>start of the shot</i>, <i>rim contact</i>, <i>catch</i> or <i>landing</i>). They go in your saved results, and an event before release or after the end widens the part of the video shown.</p>'
        + (E.extra.length ? '<ul class="small">' + E.extra.map((x, i) => '<li>' + esc(x.name) + ': ' + go(x.f) + ' <button type="button" class="btn small ghost" data-evdel="' + i + '">remove</button></li>').join('') + '</ul>' : '')
        + '<div class="row"><input type="text" id="evName" placeholder="Event name" style="width:10rem"><button type="button" class="btn small ghost" id="evAdd">Add at this frame</button></div></details>'
        + '<details class="more"><summary>Options</summary><label class="small">In manual mode, after each click move on by <select id="stepBy" style="width:4.5rem;display:inline-block">' + [1, 2, 3, 4].map((k) => '<option' + (k === A.stepBy ? ' selected' : '') + '>' + k + '</option>').join('') + '</select> frame(s)</label><p class="small">A point in the wrong place? Go to that frame and click the ball again. Automatic or manual, you can always correct by hand.</p></details>';
    },
    tools: () => frameTools(),
    wire() {
      wireFrameTools(); A.mode = 'dig'; drawStage();
      $('evRel').addEventListener('click', () => { A.ev.rel = A.frame; if (A.ev.end !== null && A.ev.end <= A.frame) A.ev.end = null; if (evFrames().length < 2) A.trim = false; A.trkDone = false; buildFromClicks(); app.render(); });
      $('evEnd').addEventListener('click', () => { if (A.ev.rel !== null && A.frame <= A.ev.rel + 1) { A.trkMsg = 'The end has to be at least two frames after release.'; app.render(); return; } A.ev.end = A.frame; A.trkDone = false; buildFromClicks(); app.render(); });
      document.querySelectorAll('[data-gof]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); showFrame(+a.dataset.gof); syncSl(); }));
      document.querySelectorAll('[data-tm]').forEach((b) => b.addEventListener('click', () => { A.trackMode = b.dataset.tm; app.render(); }));
      document.querySelectorAll('[data-evdel]').forEach((b) => b.addEventListener('click', () => { A.ev.extra.splice(+b.dataset.evdel, 1); if (evFrames().length < 2) A.trim = false; showFrame(A.frame); app.render(); }));
      $('evAdd').addEventListener('click', () => { const n = $('evName').value.trim(); if (!n) return; A.ev.extra.push({ name: n, f: A.frame }); app.render(); });
      $('evName').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('evAdd').click(); });
      $('snapCb').addEventListener('change', (e) => { A.snap = e.target.checked; });
      const rd = $('ringDn'), ru = $('ringUp'); const ring = (k) => { A.ringR = Math.max(3, Math.min(200, ringR() * k)); $('ringOut').textContent = Math.round(ringR() * 2) + ' px'; drawStage(); };
      if (rd) { rd.addEventListener('click', () => ring(1 / 1.1)); ru.addEventListener('click', () => ring(1.1)); }
      $('trimCb').addEventListener('change', (e) => { A.trim = e.target.checked; showFrame(A.frame); app.render(); });
      $('stepBy').addEventListener('change', (e) => { A.stepBy = +e.target.value; });
      const tr = $('bTrack'); if (tr) tr.addEventListener('click', runTrack);
      const sp = $('bStop'); if (sp) sp.addEventListener('click', () => { A.stopReq = true; });
      $('bUndo').addEventListener('click', () => { const f = A.hist.pop(); if (f !== undefined) { delete A.clicks[f]; A.trkDone = false; buildFromClicks(); showFrame(f); app.render(); } });
      $('bClr').addEventListener('click', () => { if (confirm('Remove every point?')) { A.clicks = {}; A.hist = []; A.trkDone = false; A.trkMsg = ''; buildFromClicks(); app.render(); } });
      const au = $('bAuto'); if (au) au.addEventListener('click', autoDemo);
    },
    drawStage, leave: () => { A.mode = 'idle'; A.stopReq = true; $('loupe').style.display = 'none'; },
  },
  {
    key: 'results', short: 'Results', title: 'Your results', enabled: () => !!fit(), figTitle: () => (A.src === 'force' ? 'The jump predicted from the take-off velocity' : 'The flight, and the triangle at release'),
    hint: () => (A.src === 'force' ? 'The triangle is the take-off velocity worked out from the forces.' : 'Green ring: release. Red ring: last frame in the air.'),
    body: () => {
      const F = fit(); if (!F) return '';
      if (F.force) return forceResults(F);
      let gc = gClass(F); const few = F.n < 10; if (few && gc === 'light-good') gc = 'light-warn'; const how = A.fromEvents ? 'were set from the marked events' : 'were picked automatically';
      const pmx = (se, d, u) => (few ? '<small style="display:block;font-size:.8rem;color:var(--muted)">&plusmn; ' + fmt(2 * se, d) + u + ' (95%)</small>' : '');
      return '<div class="tiles big"><div class="tile" style="border-color:' + C.hyp + '"><span>Release speed</span><b>' + fmt(F.pol.v, 2) + ' m/s</b>' + pmx(F.pol.sv, 2, ' m/s') + '</div><div class="tile" style="border-color:#475569"><span>Release angle</span><b>' + fmt(F.pol.th, 1) + '&deg;</b>' + pmx(F.pol.sth, 1, '&deg;') + '</div><div class="tile" style="border-color:#16a34a"><span>Release height</span><b>' + fmt(F.y0, 2) + ' m</b>' + pmx(F.sey0, 2, ' m') + '</div></div>'
        + taskSel()
        + '<p class="lead-sm">' + oneLine(F) + '</p>'
        + '<div class="' + gc + '"><p style="margin:0"><b>' + (gc === 'light-good' ? '&#10003; You can trust these numbers.' : gc === 'light-warn' ? '&#9888; Nearly there: check before you trust these.' : '&#10007; Something is wrong: don&rsquo;t use these yet.') + '</b> ' + (!Number.isFinite(F.gFree) ? gText(F) + ' ' : few ? 'Only ' + F.n + ' frames in the air, so treat these as rough (10 or more is better). ' : '') + (!Number.isFinite(F.gFree) ? '' : gc === 'light-good' || (few && gClass(F) === 'light-good') ? 'The tool checked the flight against gravity and got ' + fmt(F.gFree, 2) + ' m/s&sup2; (it should be 9.81).' : 'Checking against gravity gave ' + fmt(F.gFree, 2) + ' m/s&sup2; instead of 9.81. The usual causes are the frame rate, the scale, or the release frame.') + '</p></div>'
        + '<p class="small">Release (<b style="color:#16a34a">green ring</b>) and the last frame in the air (<b style="color:#dc2626">red ring</b>) ' + how + '.' + (A.src === 'video' ? ' See the predicted path drawn on the video itself with <b>See it on the video</b>.' : '') + '</p>'
        + (A.truth ? '<p class="small muted">Demo: the true release was ' + fmt(A.truth.v, 2) + ' m/s at ' + fmt(A.truth.th, 1) + '&deg; from ' + fmt(A.truth.y0, 2) + ' m.</p>' : '')
        + resultButtons();
    },
    wire() { wireResults(); },
    draw(ctx, w, h) {
      const F = fit(); if (!F) return; const P = trajFigure(ctx, { x: 0, y: 0, w, h }, { predict: true }); predPath(ctx, P, P0(F), C.fit, 2.5);
      drawTriangle(ctx, P, F, F.force ? 0.8 : 1.3); if (F.force) { label(ctx, 'take-off', P.X(F.x0), P.Y(F.y0) - 22, '#16a34a', { size: 12 }); return; }
      const x = X(); ring(ctx, P, x[A.rel], A.ry[A.rel], '#16a34a', 'release'); ring(ctx, P, x[A.land], A.ry[A.land], '#dc2626', 'last in the air');
    },
  },
  {
    key: 'meaning', short: 'What it means', title: 'What your numbers mean', enabled: () => !!fit(), figTitle: () => 'Your flight, showing the number you picked', hint: () => 'Tap a card on the right to change what is shown.',
    body: () => meaningBody(), wire() { meaningWire(); }, draw(ctx, w, h) { meaningDraw(ctx, w, h); },
  },
  {
    key: 'further', short: 'Go further', title: 'Go further', enabled: () => !!fit(),
    figTitle: () => subs()[gfi()].s.figTitle(), hint: () => (subs()[gfi()].s.hint ? subs()[gfi()].s.hint() : ''), tools: () => (subs()[gfi()].s.tools ? subs()[gfi()].s.tools() : ''),
    body: () => '<div class="subtabs">' + subs().map((q, i) => '<button type="button" data-gf="' + i + '" class="' + (i === gfi() ? 'on' : '') + '">' + q.name + '</button>').join('') + '</div>' + subs()[gfi()].s.body(),
    wire() { document.querySelectorAll('[data-gf]').forEach((b) => b.addEventListener('click', () => { A.gf = +b.dataset.gf; app.render(); })); if (subs()[gfi()].s.wire) subs()[gfi()].s.wire(); },
    draw(ctx, w, h, ts) { subs()[gfi()].s.draw(ctx, w, h, ts); },
  },
  {
    key: 'compare', short: 'Compare', title: 'Compare your trials', enabled: () => TRIALS.length > 0, figTitle: () => 'Every trial, from its release point', hint: () => 'Paths start together so their shapes can be compared. Colour shows the group.',
    body: () => {
      if (!TRIALS.length) return '<p>Add trials from the Results step first.</p>';
      const gs = groupsOf(), f2 = (q, d) => (Number.isFinite(q) ? sgn(q, d) : '&ndash;');
      const units = [...new Set(TRIALS.map((t) => t.metricName))];
      let h = '<div class="lead"><p>Give each trial a <b>group</b> (e.g. <i>in</i> and <i>out</i>, or <i>cue A</i> and <i>cue B</i>) and the tool works out the mean and standard deviation for each group: a results table ready for your lab report.</p></div>'
        + '<div style="overflow-x:auto"><table class="res"><tr><th>Trial</th><th>Group</th><th style="text-align:right">Speed (m/s)</th><th style="text-align:right">Angle (&deg;)</th><th style="text-align:right">Height (m)</th><th style="text-align:right">Outcome</th><th></th></tr>'
        + TRIALS.map((t, i) => '<tr><td><input type="text" data-tl="' + i + '" value="' + esc(t.label) + '" style="min-width:8rem"></td><td><input type="text" data-tg="' + i + '" value="' + esc(t.group) + '" list="grpList" style="width:6rem"></td><td class="n">' + f2(t.v, 2) + '</td><td class="n">' + f2(t.th, 1) + '</td><td class="n">' + f2(t.h, 2) + '</td><td class="n">' + f2(t.metric, t.unit === 'cm' ? 0 : 2) + ' ' + t.unit + '</td><td><button type="button" class="btn small ghost" data-tdel="' + i + '" aria-label="Remove">&times;</button></td></tr>').join('')
        + '</table></div><datalist id="grpList">' + gs.filter((g) => g !== '(no group)').map((g) => '<option value="' + esc(g) + '">').join('') + '<option value="in"><option value="out"><option value="cue A"><option value="cue B"></datalist>'
        + (units.length > 1 ? '<p class="small muted">These trials are different kinds of task, so their outcomes are not directly comparable.</p>' : '<p class="small muted">Outcome: ' + esc(units[0]) + '.</p>');
      h += '<h3 style="margin:1rem 0 .3rem">Group summary (mean &plusmn; SD)</h3><div style="overflow-x:auto"><table class="res"><tr><th>Group</th><th style="text-align:right">n</th><th style="text-align:right">Speed (m/s)</th><th style="text-align:right">Angle (&deg;)</th><th style="text-align:right">Height (m)</th><th style="text-align:right">Outcome</th></tr>'
        + gs.map((g, k) => { const T = TRIALS.filter((t) => (t.group || '(no group)') === g), m = (key, d) => { const a = T.map((t) => t[key]).filter(Number.isFinite); return a.length ? sgn(mean(a), d) + (a.length > 1 ? ' &plusmn; ' + sd(a).toFixed(d) : '') : '&ndash;'; }; return '<tr><td><b style="color:' + GCOL[k % GCOL.length] + '">' + esc(g) + '</b></td><td class="n">' + T.length + '</td><td class="n">' + m('v', 2) + '</td><td class="n">' + m('th', 1) + '</td><td class="n">' + m('h', 2) + '</td><td class="n">' + m('metric', T[0] && T[0].unit === 'cm' ? 0 : 2) + ' ' + (T[0] ? T[0].unit : '') + '</td></tr>'; }).join('')
        + '</table></div><p class="small">SD is the standard deviation: how much the trials in a group vary. Low variability in release speed is often what separates good shooters from the rest.</p>'
        + '<div class="row"><button type="button" class="btn" id="cmpCsv">Download the table (CSV)</button><button type="button" class="btn ghost" id="cmpPng">Download the figure (PNG)</button><button type="button" class="btn ghost danger" id="cmpClr">Clear all trials</button></div>'
        + '<p class="small muted">Trials are kept in this browser, so they are still here next time you open the tool on this device.</p>';
      return h;
    },
    wire() {
      document.querySelectorAll('[data-tl]').forEach((el) => el.addEventListener('change', () => { TRIALS[+el.dataset.tl].label = el.value; saveTrials(); }));
      document.querySelectorAll('[data-tg]').forEach((el) => el.addEventListener('change', () => { TRIALS[+el.dataset.tg].group = el.value.trim(); saveTrials(); app.render(); }));
      document.querySelectorAll('[data-tdel]').forEach((b) => b.addEventListener('click', () => { TRIALS.splice(+b.dataset.tdel, 1); saveTrials(); if (!TRIALS.length) app.go(0); else app.render(); }));
      $('cmpClr').addEventListener('click', () => { if (confirm('Remove every trial from the comparison?')) { TRIALS = []; saveTrials(); A.cmpMsg = ''; app.go(0); } });
      $('cmpCsv').addEventListener('click', () => { const q = (x) => '"' + String(x).replace(/"/g, '""') + '"'; const L = ['trial,group,task,release_speed_m_s,release_angle_deg,release_height_m,outcome,outcome_unit,outcome_measure,frames_fitted'].concat(TRIALS.map((t) => [q(t.label), q(t.group), q(TASKS[t.task] || t.task), t.v.toFixed(3), t.th.toFixed(2), t.h.toFixed(3), Number.isFinite(t.metric) ? t.metric.toFixed(3) : '', t.unit, q(t.metricName), t.n === null ? '' : t.n].join(','))); download('projectile_trials.csv', L.join('\n') + '\n', 'text/csv'); });
      $('cmpPng').addEventListener('click', () => { const cv = document.createElement('canvas'); cv.width = 1600; cv.height = 1000; const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1600, 1000); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; drawCompare(ctx, 1600, 1000); cv.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'projectile_trials.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }); });
    },
    draw(ctx, w, h) { drawCompare(ctx, w, h); },
  },
];

// ---------- what the numbers mean ----------
// One card per number: what it is, what this trial shows (compared with projectile theory, not with norms), and a
// sentence for a lab report. Clicking a card highlights that quantity on the figure.
function meaningCards() {
  const F = fit(); if (!F) return [];
  const Pp = P0(F), o = outcome(Pp), few = F.n < 10, force = !!F.force, v = F.pol.v, th = F.pol.th, h = F.y0, vx = Math.abs(F.vx), vy = F.vy;
  const pm = (se, d, u) => (few && se > 0 ? ' (&plusmn;' + fmt(2 * se, d) + u + ', 95%)' : '');
  const what = force || A.task === 'broadjump' ? 'take-off' : 'release', who = force ? 'The jumper' : A.task === 'lineout' ? 'The thrower' : isHoop() ? 'The shooter' : 'The athlete';
  const thing = force || A.task === 'broadjump' ? 'the centre of mass' : 'the ball', Thing = thing[0].toUpperCase() + thing.slice(1);
  const at = (dv, dth) => outcome(fromPolar(v + dv, th + dth, h, Pp.x0));
  const cards = [];
  // speed
  let ys = '';
  if (isHoop() && o.min) ys = 'The least speed that could reach the ' + ringOf().what + ' from this ' + what + ' point is <b>' + fmt(o.min.v, 2) + ' m/s</b> (at ' + fmt(o.min.th, 0) + '&deg;), so this ' + what + ' used ' + fmt(v - o.min.v, 2) + ' m/s more than the minimum. Every extra 0.1 m/s moves the ball about <b>' + fmt(Math.abs(at(0.1, 0).miss - o.miss) * 100, 0) + ' cm</b> further at ' + ringOf().name + ' height, which is why consistent speed matters so much.';
  else if (A.task === 'lineout') ys = 'Faster means less time in the air for defenders to compete: here the ball takes ' + fmt(o.tCatch, 2) + ' s to reach the catcher. Each extra 0.1 m/s raises the ball by about <b>' + fmt(Math.abs(at(0.1, 0).dyCatch - o.dyCatch) * 100, 0) + ' cm</b> at the catcher.';
  else ys = 'Speed is the biggest single factor in how far it goes: range rises with speed <i>squared</i>, so 10% more speed gives roughly 20% more distance. Here, 0.1 m/s more would add about <b>' + fmt(Math.abs((at(0.1, 0).metric - o.metric)) * 100, 0) + ' cm</b>.';
  cards.push({ k: 'v', col: C.hyp, name: (what === 'take-off' ? 'Take-off' : 'Release') + ' speed', val: fmt(v, 2) + ' m/s' + pm(F.pol.sv, 2, ' m/s'),
    is: 'How fast ' + thing + ' is moving at the instant of ' + what + ' (the long side of the triangle). Together with the angle and the height, it decides the whole flight: once ' + thing + ' is in the air, nothing ' + (force ? 'the jumper' : 'the athlete') + ' does can change it.',
    yours: ys,
    rep: Thing + ' was ' + (what === 'take-off' ? 'travelling' : 'released') + ' at ' + fmt(v, 2) + ' m/s' + (few ? ' (95% CI &plusmn;' + fmt(2 * F.pol.sv, 2) + ' m/s)' : '') + '.' });
  // angle
  let ya = '';
  if (isHoop() && o.min) ya = (Math.abs(th - o.min.th) < 2 ? 'Very close to' : th > o.min.th ? 'Steeper than' : 'Flatter than') + ' the minimum-speed angle (' + fmt(o.min.th, 0) + '&deg;). Near that angle, small errors in angle hardly change where the ball goes, so it is the most forgiving angle. Here, 1&deg; more moves the ball about <b>' + fmt(Math.abs(at(0, 1).miss - o.miss) * 100, 0) + ' cm</b> at ' + ringOf().name + ' height.';
  else if (A.task === 'lineout') ya = 'A flatter throw gets there sooner but leaves less margin over the defenders; a steeper one is easier to catch but slower. Here, 1&deg; more changes the height at the catcher by about <b>' + fmt(Math.abs(at(0, 1).dyCatch - o.dyCatch) * 100, 0) + ' cm</b>.';
  else { const hl = landHeight(), opt = optimumAngle(v, h - hl), Ropt = range(fromPolar(v, opt, h), hl), R0 = range(Pp, hl);
    ya = 'For this speed and height, the angle that would carry furthest is <b>' + fmt(opt, 0) + '&deg;</b> (below 45&deg; because ' + what + ' is ' + (h > hl ? 'above' : 'below') + ' landing height), worth ' + ((Ropt - R0) < 0.01 ? 'less than 1 cm more, so the angle is already about as good as it gets for this speed.' : fmt((Ropt - R0) * 100, 0) + ' cm more.') + ' Real athletes ' + (A.task === 'broadjump' || force ? 'take off' : 'release') + ' lower than this because they cannot produce as much speed at steeper angles, so the best angle <i>for them</i> is lower again' + (A.task === 'shot' ? ' (Linthorne, 2001)' : A.task === 'broadjump' || force ? ' (Wakai &amp; Linthorne, 2005)' : '') + '.'; }
  cards.push({ k: 'th', col: '#475569', name: (what === 'take-off' ? 'Take-off' : 'Release') + ' angle', val: fmt(th, 1) + '&deg;' + pm(F.pol.sth, 1, '&deg;'),
    is: 'The direction ' + thing + ' sets off in, measured up from the horizontal. It splits the speed into a forwards part (v cos &theta;) and an upwards part (v sin &theta;).',
    yours: ya, rep: 'The ' + what + ' angle was ' + fmt(th, 1) + '&deg; above the horizontal.' });
  // height
  cards.push({ k: 'h', col: '#16a34a', name: (what === 'take-off' ? 'Take-off' : 'Release') + ' height', val: fmt(h, 2) + ' m' + (force ? '' : pm(F.sey0 || 0, 2, ' m')),
    is: 'How high ' + thing + ' is at ' + what + (force ? ' (entered by you: force platforms cannot see it)' : '') + '. A higher start means less height to gain, or more time to travel forwards.',
    yours: isHoop() ? 'The ' + ringOf().what + ' is ' + fmt(A.target.y - h, 2) + ' m above the ' + what + ' point. Releasing higher (e.g. a taller player, or a jump shot) shortens that, so less speed is needed.' : A.task === 'lineout' ? 'The catch point is ' + fmt(A.target.y - h, 2) + ' m above the ' + what + ' point.' : 'Starting ' + fmt(h - landHeight(), 2) + ' m above landing height adds flight time, and so distance.',
    rep: 'The ' + what + ' height was ' + fmt(h, 2) + ' m.' });
  // the two parts of the velocity
  cards.push({ k: 'vx', col: C.adj, name: 'Forwards velocity', val: fmt(vx, 2) + ' m/s',
    is: 'The forwards part of the speed (v cos &theta;). Nothing pushes ' + thing + ' forwards or backwards in the air (air resistance aside), so it <b>stays the same</b> for the whole flight.',
    yours: 'So ' + thing + ' covers ' + fmt(vx, 2) + ' m every second, and the dots on the figure are evenly spaced sideways.' + (Number.isFinite(F.rmsX) && !force ? ' Your points sit within ' + fmt(F.rmsX * 1000, 0) + ' mm (RMS) of a straight line, which is the check that it really is constant.' : ''),
    rep: 'Forwards velocity was ' + fmt(vx, 2) + ' m/s' });
  cards.push({ k: 'vy', col: C.opp, name: 'Upwards velocity', val: fmt(vy, 2) + ' m/s',
    is: 'The upwards part of the speed (v sin &theta;). Gravity takes away 9.81 m/s of it every second: it shrinks to zero at the top of the flight, then becomes downwards.',
    yours: 'From ' + fmt(vy, 2) + ' m/s, it takes ' + fmt(vy, 2) + ' &divide; 9.81 = <b>' + fmt(o.tPeak, 2) + ' s</b> to reach zero, which is the top of the flight.',
    rep: 'and the initial vertical velocity was ' + fmt(vy, 2) + ' m/s.' });
  cards.push({ k: 'peak', col: '#0891b2', name: 'Peak height', val: fmt(o.peak, 2) + ' m',
    is: 'The highest point, reached when the upwards velocity is zero. It rises v<sub>y</sub>&sup2; &divide; (2 &times; 9.81) above the ' + what + ' point.',
    yours: Thing + ' rises ' + fmt(o.rise, 2) + ' m above ' + what + ', ' + fmt(o.tPeak, 2) + ' s after ' + what + (isHoop() ? ', peaking ' + fmt(o.peak - A.target.y, 2) + ' m above the ' + ringOf().name + '. A higher arc comes down more steeply.' : '.'),
    rep: Thing + ' reached a peak height of ' + fmt(o.peak, 2) + ' m, ' + fmt(o.tPeak, 2) + ' s after ' + what + '.' });
  // outcome
  if (isHoop() && Number.isFinite(o.miss)) {
    const K = ringOf(), ok = o.margin > 0 && Math.abs(o.miss) <= o.margin;
    cards.push({ k: 'out', col: C.what, name: 'At the ' + K.name, val: Math.round(Math.abs(o.miss) * 100) + ' cm ' + (o.miss >= 0 ? 'long' : 'short'),
      is: 'Where the centre of the ball is when it comes down through ' + K.name + ' height, compared with the centre of the ' + K.what + ', and the angle it comes in at (the <b>entry angle</b>).',
      yours: 'Entry angle <b>' + fmt(o.entry, 0) + '&deg;</b>, ' + fmt(o.tHoop, 2) + ' s after release. Coming in at that angle, the ball can be up to <b>' + fmt(Math.max(0, o.margin) * 100, 1) + ' cm</b> long or short and still drop through cleanly' + (ok ? ', so this one goes in.' : ', so this one ' + (o.margin > 0 ? 'hits the ' + K.name + ' or misses.' : 'cannot drop in cleanly.')) + ' A steeper entry makes the ' + K.what + ' &ldquo;look&rdquo; bigger to the ball (room = R &minus; r &divide; sin &alpha;), but needs a higher, slower arc.',
      rep: 'The ball reached ' + K.name + ' height ' + fmt(o.tHoop, 2) + ' s after release, ' + Math.round(Math.abs(o.miss) * 100) + ' cm ' + (o.miss >= 0 ? 'long of' : 'short of') + ' the ' + K.what + ' centre, with an entry angle of ' + fmt(o.entry, 0) + '&deg;.' });
  } else if (A.task === 'lineout') {
    cards.push({ k: 'out', col: C.what, name: 'At the catcher', val: fmt(o.tCatch, 2) + ' s',
      is: 'The time the ball takes to reach the catcher, and how high it is when it gets there.',
      yours: (Math.abs(o.dyCatch) < 0.005 ? 'Right at the catch point' : fmt(Math.abs(o.dyCatch) * 100, 0) + ' cm ' + (o.dyCatch >= 0 ? 'above' : 'below') + ' the catch point') + ', and still ' + (o.rising ? '<b>rising</b>' : '<b>falling</b>') + ' at ' + fmt(o.vCatch, 1) + ' m/s. Whether it should still be rising at the catch depends on the call, so compare this with what the thrower was aiming for.',
      rep: 'The ball reached the catcher ' + fmt(o.tCatch, 2) + ' s after release, ' + (Math.abs(o.dyCatch) < 0.005 ? 'at' : fmt(Math.abs(o.dyCatch) * 100, 0) + ' cm ' + (o.dyCatch >= 0 ? 'above' : 'below')) + ' the catch point.' });
  } else if (Number.isFinite(o.R)) {
    const jump = A.task === 'broadjump' || force;
    cards.push({ k: 'out', col: C.what, name: jump ? 'Jump distance' : A.task === 'shot' ? 'Distance thrown' : 'Distance', val: fmt(o.metric, 2) + ' m',
      is: jump ? 'The jump split into three parts (Hay, 1986): take-off distance (toes to centre of mass), flight distance (the projectile part), and landing distance (centre of mass to heels).' : 'How far it travels forwards before coming back down to landing height, after ' + fmt(o.tf, 2) + ' s in the air.',
      yours: jump ? 'Take-off ' + fmt(A.takeoffDist, 2) + ' m + flight <b>' + fmt(o.R, 2) + ' m</b> + landing ' + fmt(A.landingDist, 2) + ' m. Only the flight part is decided by projectile motion; the other two depend on body position at take-off and landing.' : 'Time in the air (' + fmt(o.tf, 2) + ' s) &times; forwards velocity (' + fmt(vx, 2) + ' m/s) = ' + fmt(o.R, 2) + ' m' + (A.task === 'shot' ? ', plus ' + fmt(A.releaseAhead, 2) + ' m for releasing ahead of the stop board.' : '.'),
      rep: jump ? 'Predicted jump distance was ' + fmt(o.metric, 2) + ' m, of which ' + fmt(o.R, 2) + ' m was flight distance.' : 'The predicted horizontal distance was ' + fmt(o.metric, 2) + ' m.' });
  }
  // gravity check (video and data only)
  if (!force) {
    const gOK = Number.isFinite(F.gFree);
    cards.push({ k: 'g', col: '#dc2626', name: 'Gravity check', val: gOK ? fmt(F.gFree, 2) + ' m/s&sup2;' : 'not enough frames',
      is: 'The tool also fits the flight letting gravity be anything, then compares it with the real value (9.81 m/s&sup2;). It is a check on <i>your method</i>, not on the athlete.',
      yours: gOK ? (gClass(F) === 'light-good' ? 'Close to 9.81, so the scale, frame rate and clicks are all doing their job.' : 'Not close enough to 9.81. Check the frame rate, that the known length is in the plane of the flight, and the release and end frames.') + ' (&plusmn;' + fmt(2 * F.seg, 2) + ' m/s&sup2;, 95%.)' : 'This needs at least 5 frames of flight. With fewer, gravity was fixed at 9.81 m/s&sup2; and the results cannot be checked this way.',
      rep: gOK ? 'Acceleration estimated from the flight (' + fmt(F.gFree, 2) + ' m/s&sup2;) was ' + (gClass(F) === 'light-good' ? 'consistent with' : 'not consistent with') + ' gravity, ' + (gClass(F) === 'light-good' ? 'supporting' : 'questioning') + ' the calibration.' : '' });
  }
  return cards;
}
function methodLine() {
  const F = fit(); if (!F || F.force) return A.force ? 'Take-off velocity was calculated by integrating net ground reaction force divided by body mass from rest to take-off (force platforms, ' + fmt(A.force.fs, 0) + ' Hz); centre of mass height at take-off was ' + fmt(A.h0, 2) + ' m.' : '';
  return (A.src === 'video' ? 'The ' + (A.task === 'broadjump' ? 'centre of mass' : 'ball') + ' was digitised from side-on video (' + fmt(A.realFps, 0) + ' fps) calibrated with a ' + fmt(A.cal.len, 2) + ' m known length in the plane of motion, and ' : 'Position data were imported, and ') + 'release values were found by least-squares fitting of the projectile equations (constant horizontal velocity; vertical acceleration fixed at 9.81 m/s&sup2;) to ' + F.n + ' frames of flight.';
}
function meaningBody() {
  const cards = meaningCards(); if (!cards.length) return '';
  if (!A.mk || !cards.some((c) => c.k === A.mk)) A.mk = cards[0].k;
  const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/&plusmn;/g, '±').replace(/&deg;/g, '°').replace(/&sup2;/g, '²').replace(/&divide;/g, '÷').replace(/&times;/g, '×').replace(/&minus;/g, '−').replace(/&amp;/g, '&').replace(/&[lr]dquo;/g, '"').replace(/&theta;/g, 'θ');
  const sv = cards.find((c) => c.k === 'v'), sa = cards.find((c) => c.k === 'th'), sh = cards.find((c) => c.k === 'h');
  const para = [methodLine(), [sv, sa, sh].map((c) => c.rep).join(' '), cards.filter((c) => c.k === 'vx' || c.k === 'vy').map((c) => c.rep).join(' '), ...cards.filter((c) => ['peak', 'out', 'g'].includes(c.k)).map((c) => c.rep)].filter(Boolean).map(strip).join(' ');
  return '<div class="lead"><p>Each number below is one part of the projectile story. Tap a card to see it on the figure.</p></div>'
    + cards.map((c) => '<div class="mcard' + (c.k === A.mk ? ' on' : '') + '" data-mk="' + c.k + '" style="border-left-color:' + c.col + '"><div class="mhead"><span>' + c.name + '</span><b style="color:' + c.col + '">' + c.val + '</b></div>'
      + (c.k === A.mk ? '<p><b>What it is.</b> ' + c.is + '</p><p><b>What yours shows.</b> ' + c.yours + '</p>' + (c.rep ? '<p class="small muted"><b>In your report:</b> &ldquo;' + c.rep.replace(/^and the /, 'The ') + '&rdquo;</p>' : '') : '') + '</div>').join('')
    + '<h3 style="margin:1rem 0 .3rem">A results paragraph to start from</h3><p class="small">Put it in your own words, and add what it means for <i>your</i> question (e.g. how two conditions differ in Compare).</p>'
    + '<textarea id="repTxt" rows="7" style="width:100%;font:inherit;font-size:.9rem">' + esc(para) + '</textarea>'
    + '<div class="row"><button type="button" class="btn small" id="repCopy">Copy</button><button type="button" class="btn accent" id="mGoFur">Go further &rarr;</button></div>';
}
function meaningWire() {
  document.querySelectorAll('[data-mk]').forEach((el) => el.addEventListener('click', () => { if (A.mk !== el.dataset.mk) { A.mk = el.dataset.mk; app.render(); } }));
  $('repCopy').addEventListener('click', () => { const t = $('repTxt'); t.select(); try { navigator.clipboard.writeText(t.value).then(() => { $('repCopy').textContent = 'Copied'; }, () => document.execCommand('copy')); } catch (e) { document.execCommand('copy'); } });
  $('mGoFur').addEventListener('click', () => { const F = fit(); A.gf = F.force ? 0 : gClass(F) === 'light-good' ? 3 : 1; app.go(5); });
}
function meaningDraw(ctx, w, h) {
  const F = fit(); if (!F) return; const Pp = P0(F), o = outcome(Pp), k = A.mk || 'v';
  const P = trajFigure(ctx, { x: 0, y: 0, w, h }, { predict: true }); predPath(ctx, P, Pp, k === 'v' || k === 'th' ? C.fit : '#94a3b8', 2.5);
  const R = [P.X(F.x0), P.Y(F.y0)];
  const T = isHoop() ? o.tHoop : A.task === 'lineout' ? o.tCatch : o.tf, Tm = Number.isFinite(T) ? T : 1;
  if (k === 'v' || k === 'th') { drawTriangle(ctx, P, F, F.force ? 0.8 : 1.3); if (k === 'th') { ctx.save(); ctx.strokeStyle = '#475569'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(R[0], R[1], 44, -rad(F.pol.th), 0); ctx.stroke(); ctx.restore(); label(ctx, fmt(F.pol.th, 1) + '°', R[0] + 52, R[1] - 16, '#475569', { align: 'left', size: 15 }); } else label(ctx, fmt(F.pol.v, 2) + ' m/s', R[0] + 20, R[1] - 50, C.hyp, { align: 'left', size: 15 }); }
  if (k === 'h') { ctx.save(); ctx.setLineDash([6, 5]); ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(R[0], P.Y(0)); ctx.lineTo(R[0], R[1]); ctx.stroke(); ctx.restore(); label(ctx, fmt(F.y0, 2) + ' m', R[0] + 8, (P.Y(0) + R[1]) / 2, '#16a34a', { align: 'left', size: 15 }); }
  if (k === 'vx' || k === 'vy') {
    const sc = triScale() * 0.9;
    for (let i = 0; i <= 5; i++) { const t = Tm * i / 5, p = pos(Pp, t), X0 = P.X(p[0]), Y0 = P.Y(p[1]);
      if (k === 'vx') arrow(ctx, X0, Y0, P.X(p[0] + Pp.vx * sc), Y0, C.adj, 3.5, 11);
      else { const vyt = Pp.vy - G * t; arrow(ctx, X0, Y0, X0, P.Y(p[1] + vyt * sc), C.opp, 3.5, 11); label(ctx, sgn(vyt, 1), X0 - 8, Y0, C.opp, { align: 'right', size: 12 }); } }
    label(ctx, k === 'vx' ? 'same length all the way: ' + fmt(Math.abs(F.vx), 2) + ' m/s' : 'shrinks by 9.81 m/s every second', P.r.L + 10, P.r.T + 14, k === 'vx' ? C.adj : C.opp, { align: 'left', size: 13 });
  }
  if (k === 'peak') { const pk = pos(Pp, o.tPeak); ctx.save(); ctx.setLineDash([6, 5]); ctx.strokeStyle = '#0891b2'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(P.r.L, P.Y(o.peak)); ctx.lineTo(P.r.R, P.Y(o.peak)); ctx.stroke(); ctx.restore();
    dots(ctx, P, [pk[0]], [pk[1]], '#0891b2', 7); label(ctx, 'peak ' + fmt(o.peak, 2) + ' m at ' + fmt(o.tPeak, 2) + ' s (upwards velocity = 0)', P.X(pk[0]), P.Y(o.peak) - 18, '#0891b2', { size: 13 }); }
  if (k === 'out') {
    const ts = []; for (let t = 0; t <= Tm + 1e-9; t += 0.1) ts.push(t); const pp = ts.map((t) => pos(Pp, t)); dots(ctx, P, pp.map((q) => q[0]), pp.map((q) => q[1]), C.what, 4);
    const e = pos(Pp, Tm); dots(ctx, P, [e[0]], [e[1]], C.what, 7);
    label(ctx, 'dots every 0.1 s; ' + fmt(Tm, 2) + ' s to ' + (isHoop() ? 'the ' + ringOf().name : A.task === 'lineout' ? 'the catcher' : 'landing'), P.r.L + 10, P.r.T + 14, C.what, { align: 'left', size: 13 });
    if (isHoop() && Number.isFinite(o.entry)) label(ctx, 'entry ' + fmt(o.entry, 0) + '°', P.X(e[0]) - 14, P.Y(e[1]) - 22, C.what, { align: 'right', size: 14 });
  }
  if (k === 'g') { const x = X(); dots(ctx, P, x.slice(A.rel, A.land + 1), A.ry.slice(A.rel, A.land + 1), '#dc2626', 3.5); label(ctx, 'your points: do they follow the curve?', P.r.L + 10, P.r.T + 14, '#dc2626', { align: 'left', size: 13 }); }
}

// ---------- results helpers ----------
function taskSel() { return '<div class="field"><label for="taskSel2">What is it?</label><select id="taskSel2">' + Object.entries(TASKS).map(([k, n]) => '<option value="' + k + '"' + (k === A.task ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div>'; }
function resultButtons() {
  return '<div class="row" style="margin-top:.6rem"><button type="button" class="btn accent" id="goMean">What do my numbers mean? &rarr;</button><button type="button" class="btn" id="addCmp">+ Add to comparison</button>' + (A.src === 'video' ? '<button type="button" class="btn ghost" id="seeVid">See it on the video</button>' : '') + '<button type="button" class="btn ghost" id="goFur">Go further &rarr;</button></div>'
    + '<div class="row" style="margin-top:.4rem"><button type="button" class="btn small ghost" id="dlCsv2">Save results (CSV)</button><button type="button" class="btn small ghost" id="dlPng2">Save figure for a report (PNG)</button></div>'
    + (A.cmpMsg ? '<p class="small" style="color:var(--good)">' + A.cmpMsg + '</p>' : '');
}
function wireResults() {
  const ts = $('taskSel2'); if (ts) ts.addEventListener('change', (e) => { A.task = e.target.value; A.ex = null; app.render(); });
  $('goFur').addEventListener('click', () => { const F = fit(); A.gf = F.force ? 0 : gClass(F) === 'light-good' ? 3 : 1; app.go(5); });
  $('dlCsv2').addEventListener('click', exportCSV); $('dlPng2').addEventListener('click', exportPNG);
  const sv = $('seeVid'); if (sv) sv.addEventListener('click', () => { A.frame = A.ev.rel !== null ? A.ev.rel : A.frame; app.go(2); showFrame(A.frame); });
  $('addCmp').addEventListener('click', () => { addTrial(); app.render(); });
  $('goMean').addEventListener('click', () => app.go(4));
  const bind = (id, fn) => { const el = $(id); if (el) el.addEventListener('change', () => { const val = el.value === '' ? null : +el.value; fn(val); A.ex = null; app.render(); }); };
  bind('fh0', (q) => { if (q > 0) A.h0 = q; }); bind('ftoD', (q) => { A.takeoffDist = q || 0; }); bind('flaD', (q) => { A.landingDist = q || 0; }); bind('flH', (q) => { A.landH = q; }); bind('fmeas', (q) => { A.measured = q; });
}
function forceResults(F) {
  const R = A.force, o = outcome(P0(F)), bwOK = R.SD < 0.01 * R.BW, airOK = R.airN < 15, good = bwOK && airOK;
  const num = (id, lab, val) => '<div class="field"><label for="' + id + '">' + lab + '</label><input type="number" id="' + id + '" step="0.01" value="' + (Number.isFinite(val) ? +val.toFixed(3) : '') + '"></div>';
  return '<div class="tiles big"><div class="tile" style="border-color:' + C.hyp + '"><span>Take-off speed</span><b>' + fmt(F.pol.v, 2) + ' m/s</b></div><div class="tile" style="border-color:#475569"><span>Take-off angle</span><b>' + fmt(F.pol.th, 1) + '&deg;</b></div><div class="tile" style="border-color:#16a34a"><span>Predicted jump</span><b>' + fmt(o.total, 2) + ' m</b></div></div>'
    + '<p class="lead-sm">Forwards ' + fmt(F.vx, 2) + ' m/s and upwards ' + fmt(F.vy, 2) + ' m/s at take-off, from the forces. ' + oneLine(F) + '</p>'
    + (Number.isFinite(A.measured) && A.measured > 0 ? '<p class="lead-sm">Measured with a tape: <b>' + fmt(A.measured, 2) + ' m</b>, so the prediction is <b>' + fmt(Math.abs(o.total - A.measured) * 100, 0) + ' cm ' + (o.total >= A.measured ? 'long' : 'short') + '</b>. The gap comes mostly from the centre of mass height and the take-off and landing distances below.</p>' : '')
    + '<div class="' + (good ? 'light-good' : 'light-warn') + '"><p style="margin:0"><b>' + (good ? '&#10003; The force record looks clean.' : '&#9888; Check the force record.') + '</b> Standing still, the jumper weighed ' + fmt(R.BW, 0) + ' N (steady to &plusmn;' + fmt(R.SD, 1) + ' N' + (bwOK ? '' : ': too unsteady, so the take-off velocity may drift') + '). In the air the platforms read ' + fmt(R.airN, 1) + ' N (should be about 0' + (airOK ? '' : ': check the platforms were zeroed') + ').</p></div>'
    + '<p class="small"><b>Your inputs.</b> The force platform cannot see where the centre of mass is, so these come from video or a tape' + (A.demo ? ' (typical values in the demo)' : '') + ':</p>'
    + num('fh0', 'Centre of mass height at take-off (m)', A.h0) + num('ftoD', 'Take-off distance: toes to centre of mass (m)', A.takeoffDist) + num('flaD', 'Landing distance: centre of mass to heels (m)', A.landingDist) + num('flH', 'Centre of mass height at landing (m)', landHeight()) + num('fmeas', 'Measured jump distance, if you have it (m)', A.measured)
    + resultButtons();
}

// ---------- comparing trials ----------
const TKEY = 'pm-trials-v1';
let TRIALS = (() => { try { return JSON.parse(localStorage.getItem(TKEY) || '[]'); } catch (e) { return []; } })();
function saveTrials() { try { localStorage.setItem(TKEY, JSON.stringify(TRIALS)); } catch (e) { /* storage off: comparison lasts this visit */ } }
function addTrial() {
  const F = fit(); if (!F) return; const o = outcome(P0(F));
  const unit = isHoop() || A.task === 'lineout' ? 'cm' : 'm', mv = unit === 'cm' ? o.metric * 100 : o.metric;
  const n = TRIALS.length + 1, guess = isHoop() ? (o.margin > 0 && Math.abs(o.miss) <= o.margin ? 'in' : 'out') : '';
  TRIALS.push({ id: Date.now(), label: (A.name || 'Trial').replace(/\.[^.]+$/, '').slice(0, 40) + ' (' + n + ')', group: guess, task: A.task, src: A.src, v: F.pol.v, th: F.pol.th, h: F.y0, sv: F.pol.sv, sth: F.pol.sth, n: Number.isFinite(F.n) ? F.n : null,
    metric: mv, metricName: metricName(), unit, tCatch: o.tCatch ?? null, P: { x0: 0, y0: F.y0, vx: F.vx, vy: F.vy } });
  saveTrials(); A.cmpMsg = 'Added. ' + TRIALS.length + ' trial' + (TRIALS.length === 1 ? '' : 's') + ' in <b>Compare</b>.';
}
const mean = (a) => a.reduce((s2, q) => s2 + q, 0) / a.length;
const sd = (a) => { if (a.length < 2) return NaN; const m = mean(a); return Math.sqrt(a.reduce((s2, q) => s2 + (q - m) ** 2, 0) / (a.length - 1)); };
const GCOL = ['#1d4ed8', '#db2777', '#0f766e', '#d97706', '#7c3aed', '#475569'];
const groupsOf = () => [...new Set(TRIALS.map((t) => t.group || '(no group)'))];
// ---------- step helpers ----------
// value +/- standard error, with enough decimals that the error shows two significant figures
function pm(x, se, dmin = 2, dmax = 3) { const d = Math.min(dmax, Math.max(dmin, se > 0 ? 1 - Math.floor(Math.log10(se)) : dmin)); return sgn(x, d) + ' &plusmn; ' + fmt(se, d); }
function truthHTML(F) {
  const T = A.truth, tr = A.t[A.rel] - T.tRel, dt = F.dt;
  if (tr < -dt / 2) return '<p>Your release frame is <b>before</b> the real release (by ' + Math.round(-tr / dt) + ' frame' + (Math.round(-tr / dt) === 1 ? '' : 's') + '): ' + (A.task === 'broadjump' ? 'the feet were still on the ground.' : 'the ball was still in the hand.') + ' Move it later in step 4.</p>';
  const vy = T.vy - G * tr, y0 = T.y0 + T.vy * tr - 0.5 * G * tr * tr, pt = polar(T.vx, vy, 0, 0);
  const z = (a, b, se) => Math.abs(a - b) / Math.max(se, 1e-9);
  const ok = z(F.pol.v, pt.v, F.pol.sv) < 3 && z(F.pol.th, pt.th, F.pol.sth) < 3;
  return '<p>This demo was made with a release of ' + fmt(T.v, 2) + ' m/s at ' + fmt(T.th, 1) + '&deg;' + (Math.round(tr / dt) ? ', so at your release frame (' + Math.round(tr / dt) + ' frame' + (Math.round(tr / dt) === 1 ? '' : 's') + ' after the real release) the true values were' : '. True values at your release frame:') + ' <b>' + fmt(pt.v, 2) + ' m/s</b> at <b>' + fmt(pt.th, 1) + '&deg;</b> from <b>' + fmt(y0, 3) + ' m</b>.</p><p>' + (ok ? 'Yours are within the expected error: the method works.' : 'Yours are further off than the standard errors suggest. Check the release and landing frames.') + '</p>';
}
function drawCompare(ctx, w, h) {
  if (!TRIALS.length) return; const gs = groupsOf(), xs = [], ys = [], paths = [];
  TRIALS.forEach((t) => { const T = Math.max(0.1, Math.min(3, tAtHeight(t.P, Math.min(0, t.P.y0 - 0.5), true) || 1)), px = [], py = []; for (let k = 0; k <= 60; k++) { const p = pos(t.P, T * k / 60); if (p[1] < Math.min(0, t.P.y0 - 2.5)) break; px.push(p[0]); py.push(p[1]); } xs.push(...px); ys.push(...py); paths.push([px, py, GCOL[gs.indexOf(t.group || '(no group)') % GCOL.length]]); });
  const P = panel(ctx, { rect: { x: 0, y: 0, w, h }, x: lim([xs, [0]], 0.05), y: lim([ys, [0]], 0.08), equal: true, xl: 'Horizontal distance from release (m)', yl: 'Height (m)' });
  paths.forEach(([px, py, col]) => line(ctx, P, px, py, col, 2.5));
  gs.forEach((g, k) => label(ctx, g + ' (n = ' + TRIALS.filter((t) => (t.group || '(no group)') === g).length + ')', P.r.L + 10, P.r.T + 14 + k * 20, GCOL[k % GCOL.length], { align: 'left', size: 13 }));
}
function welcome(ctx, w, h) {
  const P = panel(ctx, { rect: { x: 0, y: 0, w, h }, x: [-0.3, 5.2], y: [-0.2, 4.2], equal: true, xl: 'Horizontal position (m)', yl: 'Height (m)' });
  const Pp = fromPolar(6.98, 52, 2.1, 0.35), T = tAtHeight(Pp, 2.6), xs = [], ys = []; for (let k = 0; k <= 60; k++) { const p = pos(Pp, T * k / 60); xs.push(p[0]); ys.push(p[1]); }
  line(ctx, P, xs, ys, '#cbd5e1', 2.5, [7, 5]); line(ctx, P, [4.0, 4.6], [3.05, 3.05], '#ea580c', 4);
  label(ctx, 'Choose a demo or open your own file on the right', (P.r.L + P.r.R) / 2, P.r.T + 24, COL.muted, { bold: false });
}
function gClass(F) { if (!Number.isFinite(F.gFree)) return 'light-warn'; const d = Math.abs(F.gFree - G); return d < Math.max(0.5, 2 * F.seg) ? 'light-good' : d < 1.2 ? 'light-warn' : 'light-bad'; }
function gBadge(F) { const c = gClass(F); return c === 'light-good' ? '<span style="color:var(--good)">&#10003; close to 9.81</span>' : c === 'light-warn' ? '<span style="color:var(--warn)">check</span>' : '<span style="color:var(--bad)">&#10007; wrong</span>'; }
function gText(F) {
  if (!Number.isFinite(F.gFree)) return 'Only ' + F.n + ' frames in the air, and the check needs at least 5, so nothing has checked these numbers. Treat them as rough and use the &plusmn; values.';
  const c = gClass(F);
  if (c === 'light-good') return 'Close enough: frame rate, scale and flight frames look right.';
  const lo = F.gFree < G, list = '<ul class="small"><li>The <b>frame rate</b> (slow-motion clips: use the rate it was filmed at). A factor of 2 out changes g by a factor of 4.</li><li>The <b>scale</b> (was the known length in the plane of the flight? the right length typed in?).</li><li><b>Release or landing frames</b> that include contact (step 4).</li><li>The camera not <b>side-on</b>, or the ball moving towards it.</li>' + (lo ? '<li>For a light or fast ball, <b>air resistance</b>.</li>' : '') + '</ul>';
  return (c === 'light-warn' ? 'A little off. ' : 'Too far from 9.81 to trust the results yet. ') + 'Things to check:' + list;
}
function maxGap(F) { const f = F.f; let m = 0; for (let i = 0; i < f.t.length; i++) { const p = pos(P0(F), f.t[i]); m = Math.max(m, Math.hypot(p[0] - f.x[i], p[1] - f.y[i])); } return m; }
function triScale() { const F = fit(); if (!F) return 0.1; if (F.force) return 0.14; const x = X(); const span = Math.max(...x) - Math.min(...x); return Math.max(0.02, Math.min(0.25, span * 0.18 / Math.max(F.pol.v, 0.5))); }
function predPath(ctx, P, Pp, col, wd) {
  const hl = landHeight(); let T = A.task === 'lineout' ? (A.target.x + 0.5 - Pp.x0) / Pp.vx : tAtHeight(Pp, isHoop() ? A.target.y - 0.35 : hl); if (!Number.isFinite(T)) T = Math.max(0.2, 2 * Pp.vy / G + 0.2);
  const xs = [], ys = []; for (let k = 0; k <= 100; k++) { const p = pos(Pp, T * k / 100); xs.push(p[0]); ys.push(p[1]); } line(ctx, P, xs, ys, col, wd);
  dots(ctx, P, [Pp.x0], [Pp.y0], col, 4.5);
}
function stamp(ctx, P, F) {
  const o = outcome(P0(F)), t = [fmt(F.pol.v, 2) + ' m/s at ' + fmt(F.pol.th, 1) + '° from ' + fmt(F.y0, 2) + ' m', (F.force ? 'Predicted jump: ' + fmt(o.total, 2) + ' m' : metricName() + ': ' + (isHoop() ? sgn(o.miss * 100, 1) + ' cm' : A.task === 'lineout' ? sgn(o.dyCatch * 100, 0) + ' cm, ' + fmt(o.tCatch, 2) + ' s to the catcher' : fmt(o.metric, 2) + ' m')), F.force ? 'Take-off velocity from force platforms; CoM height ' + fmt(A.h0, 2) + ' m (entered)' : 'g check ' + fmt(F.gFree, 2) + ' m/s², ' + F.n + ' frames, RMS ' + fmt(F.rmsY * 1000, 1) + ' mm'];
  t.forEach((s, i) => label(ctx, s, P.r.L + 10, P.r.T + 14 + i * 20, COL.ink, { align: 'left', size: 12.5 }));
}
function ex() { const F = fit(); if (!A.ex) A.ex = { v0: F.pol.v, th0: F.pol.th, h0: F.y0, ev: F.pol.v, eth: F.pol.th, eh: F.y0 }; return A.ex; }
function sl(k, lab, min, max, step, unit) { const e = ex(); return '<div class="slider" style="flex:1 1 100%"><label for="s_' + k + '">' + lab + '</label><input type="range" id="s_' + k + '" min="' + min.toFixed(3) + '" max="' + max.toFixed(3) + '" step="' + step + '" value="' + e[k] + '"><b id="o_' + k + '">' + e[k].toFixed(k === 'eth' ? 1 : 2) + ' ' + unit + '</b></div>'; }
function exOut(F, e, Pw) {
  const el = $('exOut'); if (!el) return;
  const m0 = outcome(P0(F)).metric, base = outcome(Pw), m1 = base.metric, ft = isHoop(), lo = A.task === 'lineout', u = (q) => (ft || lo ? sgn(q * 100, 1) + ' cm' : sgn(q, 2) + ' m');
  const d = (dv, dth, dh) => outcome(fromPolar(e.ev + dv, e.eth + dth, e.eh + dh, F.x0)).metric - m1;
  const sv = d(0.1, 0, 0), sa = d(0, 1, 0), sh = d(0, 0, 0.05);
  let h = '<table class="res"><tr><th></th><th style="text-align:right">Measured</th><th style="text-align:right">What if</th></tr><tr><td>' + metricName() + '</td><td class="n">' + u(m0) + '</td><td class="n" style="color:' + C.what + '">' + u(m1) + '</td></tr>';
  if (ft) h += '<tr><td>Entry angle</td><td class="n">' + fmt(outcome(P0(F)).entry, 1) + '&deg;</td><td class="n" style="color:' + C.what + '">' + fmt(base.entry, 1) + '&deg;</td></tr><tr><td>Room for error</td><td class="n">&plusmn;' + fmt(outcome(P0(F)).margin * 100, 1) + ' cm</td><td class="n" style="color:' + C.what + '">' + (base.margin > 0 ? '&plusmn;' + fmt(base.margin * 100, 1) + ' cm' : 'none') + '</td></tr>';
  if (lo) h += '<tr><td>Time to the catcher</td><td class="n">' + fmt(outcome(P0(F)).tCatch, 2) + ' s</td><td class="n" style="color:' + C.what + '">' + fmt(base.tCatch, 2) + ' s</td></tr>';
  h += '</table><table class="res"><tr><th>Change at release</th><th style="text-align:right">Effect on ' + (ft ? 'where it reaches the ' + ringOf().name : lo ? 'height at the catcher' : 'distance') + '</th></tr><tr><td>+0.1 m/s speed</td><td class="n">' + u(sv) + '</td></tr><tr><td>+1&deg; angle</td><td class="n">' + u(sa) + '</td></tr><tr><td>+5 cm height</td><td class="n">' + u(sh) + '</td></tr></table>';
  if (ft) { const mn = minSpeedToTarget(A.target.x - F.x0, A.target.y - e.eh); h += '<p>From this height the minimum-speed angle is <b>' + fmt(mn.th, 1) + '&deg;</b>. Here, 0.1 m/s of speed moves the ball as much as <b>' + fmt(Math.abs(sa) > 1e-6 ? Math.abs(sv / sa) : NaN, 1) + '&deg;</b> of angle. ' + (Math.abs(sa) < Math.abs(sv) / 3 ? 'Close to the minimum-speed angle, angle errors barely matter, so <b>consistent speed</b> is what makes the shot.' : 'Away from the minimum-speed angle, angle errors start to matter too.') + '</p>'; }
  else if (lo) h += '<p>Try a flatter, faster throw: it reaches the catcher sooner, but the height at the hands becomes more sensitive to small errors.</p>';
  else { const hh = e.eh - landHeight(), opt = optimumAngle(e.ev, hh); h += '<p>For this speed and height, the angle for the greatest distance is <b>' + fmt(opt, 1) + '&deg;</b> (if speed did not drop at higher angles, which in real athletes it does).</p>'; }
  el.innerHTML = h;
}
function frameTools() {
  return '<div class="ctrls"><button type="button" class="btn small ghost" data-fr="-10">&laquo; 10</button><button type="button" class="btn small ghost" data-fr="-1">&lsaquo; 1</button><span class="readout">Frame <span id="frameNo">' + A.frame + '</span></span><button type="button" class="btn small ghost" data-fr="1">1 &rsaquo;</button><button type="button" class="btn small ghost" data-fr="10">10 &raquo;</button></div><input type="range" id="frSl" min="' + span()[0] + '" max="' + Math.max(0, span()[1]) + '" value="' + A.frame + '" style="flex:1 1 200px" aria-label="Frame"><label class="small" style="display:inline-flex;gap:.35rem;align-items:center">Brightness <input type="range" id="brSl" min="1" max="4" step="0.25" value="' + A.bright + '" style="width:7rem"><b id="brOut">' + A.bright.toFixed(2) + '\u00d7</b></label>';
}
function wireFrameTools() {
  const br = $('brSl'); if (br) br.addEventListener('input', () => { A.bright = +br.value; $('brOut').textContent = A.bright.toFixed(2) + '\u00d7'; drawStage(); });
  document.querySelectorAll('[data-fr]').forEach((b) => b.addEventListener('click', () => { showFrame(A.frame + +b.dataset.fr); syncSl(); }));
  const s = $('frSl'); if (s) s.addEventListener('input', () => showFrame(+s.value));
}
function syncSl() { const s = $('frSl'); if (s) s.value = A.frame; }
function autoDemo() {
  // Mark the events where they really are in the demo, put one point on the ball at release (as a student would,
  // a few pixels off), then run the real tracker. Any calibration error of the student's own carries through.
  if (A.busy) return;
  A.ev.rel = VIDEO_DEMO.releaseFrame; A.ev.end = VIDEO_DEMO.endFrame; A.trackMode = 'auto'; A.clicks = {}; A.hist = [];
  const P = fromPolar(6.982, 52, 2.10, 0.35), px = [VIDEO_DEMO.originPx[0] + P.x0 * VIDEO_DEMO.pxPerM + 3, VIDEO_DEMO.originPx[1] - P.y0 * VIDEO_DEMO.pxPerM - 2];
  A.frame = VIDEO_DEMO.releaseFrame; showFrame(A.frame);
  frameImage(A.frame).then((im) => { const b = findBall(im, px, VIDEO_DEMO.ballR); const q = b ? b.c : px; A.ballR = b ? b.r : VIDEO_DEMO.ballR; A.clicks[A.frame] = [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10]; A.hist.push(A.frame); buildFromClicks(); runTrack(); });
}
function guessUnits(P) { const vals = P.rows.slice(0, 200).flatMap((r) => [+r[P.xi], +r[P.yi]]).filter(Number.isFinite); const m = Math.max(...vals.map(Math.abs)); A.units = m > 300 ? 0.001 : m > 40 ? 0.01 : 1; }

// ---------- export ----------
function resultRows() {
  const F = fit(), o = outcome(P0(F));
  if (F.force) { const R = A.force; return [['Source', A.name], ['Task', 'Standing long jump (force platforms)'], ['Sampling rate (Hz)', fmt(R.fs, 0)], ['Bodyweight (N)', fmt(R.BW, 1)], ['Body mass (kg)', fmt(R.m, 2)], ['Forwards force from', R.axes], ['Take-off vx (m/s)', fmt(R.vx, 3)], ['Take-off vy (m/s)', fmt(R.vy, 3)], ['Take-off speed (m/s)', fmt(F.pol.v, 3)], ['Take-off angle (deg)', fmt(F.pol.th, 2)], ['CoM height at take-off, entered (m)', fmt(A.h0, 3)], ['Take-off distance, entered (m)', fmt(A.takeoffDist, 3)], ['Landing distance, entered (m)', fmt(A.landingDist, 3)], ['CoM height at landing, entered (m)', fmt(landHeight(), 3)], ['Peak CoM height (m)', fmt(o.peak, 3)], ['Flight time (s)', fmt(o.tf, 3)], ['CoM flight distance (m)', fmt(o.R, 3)], ['Predicted jump distance (m)', fmt(o.total, 3)], ['Measured jump distance (m)', Number.isFinite(A.measured) ? fmt(A.measured, 3) : '']]; }
  const r = [['Source', A.name], ['Task', TASKS[A.task]], ['Frames fitted', F.n + ' (frame ' + A.fr[A.rel] + ' to ' + A.fr[A.land] + ')'], ['Frame rate (Hz)', fmt(1 / F.dt, 1)],
    ['Gravity check, g free (m/s^2)', fmt(F.gFree, 3) + ' +/- ' + fmt(F.seg, 3)], ['RMS residual x (mm)', fmt(F.rmsX * 1000, 2)], ['RMS residual y (mm)', fmt(F.rmsY * 1000, 2)],
    ['Release vx (m/s)', fmt(F.vx, 3) + ' +/- ' + fmt(F.sevx, 3)], ['Release vy (m/s)', fmt(F.vy, 3) + ' +/- ' + fmt(F.sevy, 3)], ['Release speed (m/s)', fmt(F.pol.v, 3) + ' +/- ' + fmt(F.pol.sv, 3)], ['Release angle (deg)', fmt(F.pol.th, 2) + ' +/- ' + fmt(F.pol.sth, 2)], ['Release height (m)', fmt(F.y0, 3)],
    ['Peak height (m)', fmt(o.peak, 3)], ['Time to peak (s)', fmt(o.tPeak, 3)]];
  if (A.task === 'lineout') r.push(['Catch point x, y (m)', fmt(A.target.x, 3) + ', ' + fmt(A.target.y, 3)], ['Time to the catcher (s)', fmt(o.tCatch, 3)], ['Ball height at the catcher (m)', fmt(o.yCatch, 3)], ['Above (+) or below (-) the catch point (cm)', fmt(o.dyCatch * 100, 1)], ['Ball speed at the catcher (m/s)', fmt(o.vCatch, 2)]);
  else if (isHoop()) r.push([ringOf().name[0].toUpperCase() + ringOf().name.slice(1) + ' centre x, y (m)', fmt(A.target.x, 3) + ', ' + fmt(A.target.y, 3)], ['Miss at ' + ringOf().name + ' height (cm, + long)', fmt(o.miss * 100, 1)], ['Entry angle (deg)', fmt(o.entry, 1)], ['Room for error (cm)', fmt(o.margin * 100, 1)], ['Minimum-speed angle (deg)', fmt(o.min.th, 1)], ['Speed for a perfect shot at this angle (m/s)', fmt(o.vNeed, 3)]);
  else { r.push(['Landing height (m)', fmt(o.hl, 3)], ['Flight time (s)', fmt(o.tf, 3)], ['Horizontal distance in flight (m)', fmt(o.R, 3)]); if (A.task === 'broadjump') r.push(['Take-off distance (m)', fmt(A.takeoffDist, 3)], ['Landing distance (m)', fmt(A.landingDist, 3)], ['Jump distance (m)', fmt(o.total, 3)]); if (A.task === 'shot') r.push(['Release ahead of stop board (m)', fmt(A.releaseAhead, 3)], ['Distance thrown (m)', fmt(o.total, 3)], ['Best angle for this speed and height (deg)', fmt(o.opt, 1)]); }
  return r;
}
function exportCSV() {
  const F = fit(), q = (s) => '"' + String(s).replace(/"/g, '""') + '"', x = X();
  if (F.force) { const R = A.force, L = ['Projectile Motion results', ''].concat(resultRows().map((r) => r.map(q).join(',')), ['', 'time_from_takeoff_s,Fz_N,Fforwards_N,vz_m_s,vforwards_m_s']); for (let i = Math.max(0, R.ws); i < Math.min(R.n, R.TO + Math.round(0.3 * R.fs)); i++) L.push([((i - R.TO) * R.dt).toFixed(4), R.Fz[i].toFixed(2), R.Fh[i].toFixed(2), R.vz[i].toFixed(4), R.vh[i].toFixed(4)].join(',')); download(base() + '_projectile.csv', L.join('\n') + '\n', 'text/csv'); return; }
  const lines = ['Projectile Motion results', ''].concat(resultRows().map((r) => r.map(q).join(',')), ['', 'frame,time_s,x_m,y_m,in_flight,t_from_release_s,x_fit_m,y_fit_m,x_residual_mm,y_residual_mm']);
  const t0 = A.t[A.rel];
  for (let i = 0; i < N(); i++) { const tt = A.t[i] - t0, p = pos(P0(F), tt), inF = i >= A.rel && i <= A.land; lines.push([A.fr[i], A.t[i].toFixed(4), x[i].toFixed(4), A.ry[i].toFixed(4), inF ? 1 : 0, tt.toFixed(4), inF ? p[0].toFixed(4) : '', inF ? p[1].toFixed(4) : '', inF ? ((x[i] - p[0]) * 1000).toFixed(2) : '', inF ? ((A.ry[i] - p[1]) * 1000).toFixed(2) : ''].join(',')); }
  download(base() + '_projectile.csv', lines.join('\n') + '\n', 'text/csv');
}
function exportPNG() {
  const cv = document.createElement('canvas'); cv.style.width = '1600px'; cv.style.height = '1000px'; cv.width = 1600; cv.height = 1000;
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1600, 1000); ctx.font = '13px system-ui'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const F = fit(), P = trajFigure(ctx, { x: 0, y: 0, w: 1600, h: 1000 }, { predict: true }); predPath(ctx, P, P0(F), C.fit, 2.5); drawTriangle(ctx, P, F, 1); stamp(ctx, P, F);
  cv.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = base() + '_projectile.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); });
}
const base = () => (A.name || 'projectile').replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_').slice(0, 60);
function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

export const ANALYSE = {
  init(a) {
    app = a; $ = a.$;
    const st = $('stage');
    st.addEventListener('click', stageClick);
    let raf = 0; const redraw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; drawStage(); }); };
    st.addEventListener('pointermove', (e) => { loupe(e); if (A.mode === 'dig' && e.pointerType !== 'touch') { A.hover = stagePt(e); redraw(); } });
    st.addEventListener('pointerleave', () => { $('loupe').style.display = 'none'; if (A.hover) { A.hover = null; redraw(); } });
    st.addEventListener('wheel', (e) => { if (A.mode !== 'dig') return; e.preventDefault(); A.ringR = Math.max(3, Math.min(200, ringR() * (e.deltaY < 0 ? 1.06 : 1 / 1.06))); const o = $('ringOut'); if (o) o.textContent = Math.round(ringR() * 2) + ' px'; redraw(); }, { passive: false });
    document.addEventListener('keydown', (e) => {
      if (app.S.mode !== 'analyse' || $('stageWrap').classList.contains('hide') || !A.vw || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && document.activeElement.type !== 'range') return;
      if (e.key === 'ArrowRight' || e.key === '.') { showFrame(A.frame + 1); syncSl(); e.preventDefault(); }
      else if (e.key === 'ArrowLeft' || e.key === ',') { showFrame(A.frame - 1); syncSl(); e.preventDefault(); }
    });
  },
  steps: () => STEPS,
};
