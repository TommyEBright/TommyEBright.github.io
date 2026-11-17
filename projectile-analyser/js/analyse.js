// Analyse: a real flight, from video (calibrate and digitise here) or from position data (e.g. a marker exported
// from Kinematic Analysis), to release speed, angle and height, what they predict, and what-ifs.
// Coordinates: metres, y up, x in the direction of travel (the tool mirrors the data if the flight goes right to left).
import { G, rad, deg, fitFlight, polar, pos, tAtHeight, peakRise, fromPolar, range, optimumAngle, minSpeedToTarget, speedForTarget, DEMOS, VIDEO_DEMO } from './maths.js?v=1.3.0';
import { panel, line, dots, arrow, label, lim, rightMark, fmt, sgn, COL } from './plot.js?v=1.3.0';

const RIM_R = 0.2286, BALL_R = 0.119; // basketball: 18 in (45.7 cm) rim, size 7 ball (about 23.8 cm across)
const C = { hyp: '#1d4ed8', adj: '#d97706', opp: '#7c3aed', pts: '#0f172a', fit: '#1d4ed8', what: '#db2777', flight: '#dbeafe', out: '#94a3b8' };
const TASKS = { general: 'Any projectile', freethrow: 'Basketball shot', broadjump: 'Broad jump (centre of mass)', shot: 'Shot put' };
let app, $;
const A = fresh();
function fresh() {
  return { src: null, name: '', note: '', task: 'general', demo: null, truth: null,
    // video
    url: null, avi: null, bright: 1, vw: 0, vh: 0, fileFps: 60, realFps: 60, nF: 0, frame: 0, clicks: {}, cal: { a: null, b: null, len: 1, o: null }, mode: 'idle', stepBy: 1, hover: null, targetPx: null,
    // position data (raw, before mirroring)
    t: [], rx: [], ry: [], fr: [], flip: false, markers: null, csvParsed: null, marker: '', csv: null, units: 1, fpsData: 100,
    rel: 0, land: 0, suggested: false, fromEvents: false, event: null, hist: [], gf: 0, calBy: 'stick',
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
function toCSV(D) { return '# ' + D.name + '\n# ' + D.note + '\ntime_s,x_m,y_m\n' + D.t.map((t, i) => t.toFixed(4) + ',' + D.x[i].toFixed(4) + ',' + D.y[i].toFixed(4)).join('\n') + '\n'; }
function reset() { const keep = A.url; Object.assign(A, fresh()); if (keep) { try { URL.revokeObjectURL(keep); } catch (e) { /* ignore */ } } FITKEY = ''; const vd = $('vid'); vd.removeAttribute('src'); vd.load(); }
function loadVideo(src, name, demo) {
  reset(); A.src = 'video'; A.name = name; A.demo = demo ? 'video' : null; A.task = demo ? 'freethrow' : 'general';
  if (demo) { A.fileFps = A.realFps = VIDEO_DEMO.fps; A.target = { ...VIDEO_DEMO.target }; A.truth = { ...fromPolar(6.982, 52, 2.10, 0.35), v: 6.982, th: 52, tRel: VIDEO_DEMO.releaseFrame / VIDEO_DEMO.fps }; A.note = 'A side-on free throw filmed at 60 fps, with a 1 m stick (yellow and black) next to the shooter. It went in.'; }
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
function showFrame(f) { A.frame = Math.max(0, Math.min(A.nF - 1, f));
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
  if (A.targetPx && calibrated()) { const w = toWorld(A.targetPx); A.target = { x: A.flip ? -w[0] : w[0], y: w[1] }; }
}
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
  fs.forEach((f) => dot(A.clicks[f], f === A.frame ? '#ef4444' : '#1d4ed8', f === A.frame ? 6 : 4));
  txt(c, 'Frame ' + A.frame + ' of ' + (A.nF - 1) + '  ·  ' + fmt(A.frame / A.realFps, 3) + ' s', 12 * u, 22 * u, '#fff', u, 'left', true);
  const mt = { calA: A.calBy === 'ball' ? '1. Click the left edge of the ball' : '1. Click one end of the stick', calB: A.calBy === 'ball' ? '2. Now click its right edge' : '2. Now click the other end', o: '3. Click the floor where you want 0 m', dig: 'Click the middle of the ball', target: '4. Click the middle of the hoop' }[A.mode];
  if (mt) txt(c, mt, A.vw / 2, 70 * u, '#fde047', u * 1.6, 'center', true);
  const s = document.getElementById('frameNo'); if (s) s.textContent = A.frame; const s2 = document.getElementById('frameNo2'); if (s2) s2.textContent = A.frame;
  const k = document.getElementById('clickCount'); if (k) k.textContent = fs.length;
}
function txt(c, s, x, y, col, u, al = 'center', box) { c.save(); c.font = '600 ' + Math.round(15 * u) + 'px system-ui, sans-serif'; c.textAlign = al; c.textBaseline = 'middle'; if (box) { const w = c.measureText(s).width + 14 * u, bx = al === 'left' ? x - 7 * u : al === 'right' ? x - w + 7 * u : x - w / 2; c.fillStyle = 'rgba(15,23,42,.72)'; c.fillRect(bx, y - 13 * u, w, 26 * u); } c.fillStyle = col; c.fillText(s, x, y); c.restore(); }
// Brighten dark footage for display only (clicks are unaffected). Uses the canvas filter where the browser has it,
// otherwise scales the pixels directly.
function drawBright(c, draw, w, h) {
  if (A.bright === 1) { draw(); return; }
  if ('filter' in c) { c.filter = 'brightness(' + A.bright + ')'; draw(); c.filter = 'none'; return; }
  draw(); const im = c.getImageData(0, 0, w, h), d = im.data; for (let q = 0; q < d.length; q += 4) { d[q] = Math.min(255, d[q] * A.bright); d[q + 1] = Math.min(255, d[q + 1] * A.bright); d[q + 2] = Math.min(255, d[q + 2] * A.bright); } c.putImageData(im, 0, 0);
}
function stagePt(e) { const cv = $('stage'), r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; }
function stageClick(e) {
  if (!A.vw) return; const p = stagePt(e).map((q) => Math.round(q * 10) / 10);
  if (A.mode === 'calA') { A.cal.a = p; A.mode = 'x'; }
  else if (A.mode === 'calB') { A.cal.b = p; A.mode = 'x'; }
  else if (A.mode === 'o') { A.cal.o = p; A.mode = 'x'; }
  else if (A.mode === 'target') { A.targetPx = p; A.mode = 'x'; }
  else if (A.mode === 'dig') { A.clicks[A.frame] = p; A.hist.push(A.frame); if (A.frame + A.stepBy < A.nF) { buildFromClicks(); showFrame(A.frame + A.stepBy); app.render(); return; } }
  else return;
  if (A.mode === 'x') A.mode = nextScaleMode();
  buildFromClicks(); app.render();
}
function loupe(e) {
  const lp = $('loupe'); if (!A.vw || A.mode === 'idle') { lp.style.display = 'none'; return; }
  const p = stagePt(e), z = 4, s = 160 / z, c = lp.getContext('2d');
  if (p[0] < 0 || p[1] < 0 || p[0] > A.vw || p[1] > A.vh) { lp.style.display = 'none'; return; }
  lp.style.display = 'block'; c.imageSmoothingEnabled = false; c.fillStyle = '#000'; c.fillRect(0, 0, 160, 160);
  drawBright(c, () => c.drawImage(frameCv, p[0] - s / 2, p[1] - s / 2, s, s, 0, 0, 160, 160), 160, 160);
  c.strokeStyle = '#ef4444'; c.lineWidth = 1; c.beginPath(); c.moveTo(80, 60); c.lineTo(80, 100); c.moveTo(60, 80); c.lineTo(100, 80); c.stroke();
}

// ---------- shared figure: the trajectory ----------
function trajFigure(ctx, rect, o = {}) {
  const F = fit(), x = X(), y = A.ry, n = N();
  const xs = x.slice(), ys = y.slice();
  let P = null;
  const ext = (px, py) => { xs.push(px); ys.push(py); };
  if (F && o.predict) { const Pp = o.Pp || P0(F), hl = landHeight(), tf = tAtHeight(Pp, hl); const T = Number.isFinite(tf) ? tf : F.f.t[F.f.t.length - 1] * 1.2; for (let k = 0; k <= 30; k++) { const p = pos(Pp, T * k / 30); ext(p[0], p[1]); } }
  if (A.task === 'freethrow') { ext(A.target.x + 0.4, A.target.y + 0.2); ext(A.target.x - 0.3, A.target.y); }
  ext(x[0], 0);
  const lx = lim([xs], 0.05), ly = lim([ys, [0]], 0.08);
  P = panel(ctx, { rect, x: lx, y: [Math.min(ly[0], -0.05), ly[1]], equal: true, xl: 'Horizontal position (m)', yl: 'Height (m)' });
  ctx.save(); ctx.fillStyle = '#efe7da'; const gy = P.Y(0); if (gy < P.r.B) ctx.fillRect(P.r.L, gy, P.r.R - P.r.L, P.r.B - gy); ctx.restore();
  if (A.task === 'freethrow') { const tx = A.target.x, ty = A.target.y; line(ctx, P, [tx - RIM_R, tx + RIM_R + 0.15], [ty, ty], '#ea580c', 4); line(ctx, P, [tx + RIM_R + 0.15, tx + RIM_R + 0.15], [ty - 0.15, ty + 1.05], '#64748b', 4); }
  if (A.task === 'broadjump' && A.takeoffDist) { const tl = X()[A.rel] - A.takeoffDist; line(ctx, P, [tl, tl], [0, 0.25], '#475569', 2); label(ctx, 'toes', P.X(tl), P.Y(0.25) - 10, '#475569', { size: 11, bold: false }); }
  if (A.task === 'shot') { const b = (F ? F.x0 : X()[A.rel]) - A.releaseAhead; line(ctx, P, [b, b], [0, 0.1], '#475569', 3); label(ctx, 'stop board', P.X(b), P.Y(0.1) - 10, '#475569', { size: 11, bold: false }); }
  const inF = (i) => i >= A.rel && i <= A.land;
  dots(ctx, P, x.map((q, i) => (inF(i) ? NaN : q)), y, C.out, 3);
  dots(ctx, P, x.map((q, i) => (inF(i) ? q : NaN)), y, C.pts, 3.2);
  return P;
}
function landHeight() {
  if (A.task === 'freethrow') return A.target.y;
  if (A.landH !== null && Number.isFinite(A.landH)) return A.landH;
  if (A.task === 'shot') return 0;
  return A.ry[A.land];
}

// ---------- outcome maths per task ----------
function outcome(Pp) {
  const o = { Pp, rise: peakRise(Pp), tPeak: Math.max(0, Pp.vy / G) }; o.peak = Pp.y0 + o.rise;
  if (A.task === 'freethrow') {
    const tx = A.target.x, ty = A.target.y, th = tAtHeight(Pp, ty, true);
    o.tHoop = th; o.xHoop = Number.isFinite(th) ? Pp.x0 + Pp.vx * th : NaN; o.miss = o.xHoop - tx;
    const vyH = Pp.vy - G * th; o.entry = deg(Math.atan2(-vyH, Pp.vx)); o.margin = o.entry > 0 ? RIM_R - BALL_R / Math.sin(rad(o.entry)) : NaN;
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
function metricName() { return A.task === 'freethrow' ? 'Miss at the hoop (+ long, − short)' : A.task === 'broadjump' ? 'Jump distance' : A.task === 'shot' ? 'Distance thrown' : 'Horizontal distance'; }

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
      document.querySelectorAll('[data-demo]').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.demo; if (k === 'video') loadVideo(VIDEO_DEMO.file, 'Free throw video (demo)', true); else loadDemo(k); }));
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
      const d = $('bDemoCal'); if (d) d.addEventListener('click', () => { A.cal = { a: VIDEO_DEMO.stickPx[0].slice(), b: VIDEO_DEMO.stickPx[1].slice(), len: VIDEO_DEMO.stickLen, o: VIDEO_DEMO.originPx.slice() }; A.targetPx = [VIDEO_DEMO.originPx[0] + 4.225 * 150, VIDEO_DEMO.originPx[1] - 3.05 * 150]; A.mode = 'idle'; buildFromClicks(); app.render(); });
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
      if (A.task === 'freethrow') {
        h += num('tgx', 'Hoop centre, horizontal (m)', A.target.x) + num('tgy', 'Hoop centre, height (m)', A.target.y);
        const verdict = !Number.isFinite(o.miss) ? 'It never comes back down to rim height.' : !(o.margin > 0) ? 'Too flat to fit through the rim at all.' : Math.abs(o.miss) <= o.margin ? 'Goes in cleanly (ignoring the backboard).' : (o.miss > 0 ? 'Long: hits the back of the rim or misses.' : 'Short: hits the front of the rim or misses.');
        h += '<table class="res">' + row('Peak height', fmt(o.peak, 2) + ' m') + row('Ball centre at rim height (coming down)', Number.isFinite(o.miss) ? Math.abs(o.miss * 100).toFixed(1) + ' cm ' + (o.miss >= 0 ? 'long' : 'short') : '&ndash;', true) + row('Entry angle', fmt(o.entry, 1) + '&deg;', true) + row('Room for error at that angle', Number.isFinite(o.margin) && o.margin > 0 ? '&plusmn;' + fmt(o.margin * 100, 1) + ' cm' : 'none') + row('Verdict', verdict) + '</table>';
        h += layer('eq', 'How these are worked out', '<p>Time to come down to rim height ' + sub('y', 'h') + ': solve ' + sub('y', '0') + ' + ' + sub('v', 'y') + v('t') + ' &minus; &frac12;' + v('g') + v('t') + '<sup>2</sup> = ' + sub('y', 'h') + ' (later root). Then ' + v('x') + ' = ' + sub('x', '0') + ' + ' + sub('v', 'x') + v('t') + '.</p><p>Entry angle = tan<sup>&minus;1</sup>(|' + sub('v', 'y') + ' at the hoop| &divide; ' + sub('v', 'x') + '). A ball coming in at angle &alpha; &ldquo;sees&rdquo; a rim opening of 2' + v('R') + ' sin &alpha;, so the room for error is ' + v('R') + ' &minus; ' + v('r') + '/sin &alpha;, with rim radius ' + v('R') + ' = 22.9 cm and ball radius ' + v('r') + ' = 11.9 cm. Below about 31&deg; the ball cannot fit through at all.</p>')
          + layer('why', 'Compared with the ideal', '<p>From this release point, the angle that needs the <b>least speed</b> is <b>' + fmt(o.min.th, 1) + '&deg;</b> (' + fmt(o.min.v, 2) + ' m/s). This shot was released at ' + fmt(F.pol.th, 1) + '&deg;.</p><p>At this release angle, a perfect shot (through the centre) needs <b>' + fmt(o.vNeed, 2) + ' m/s</b>. This shot had ' + fmt(o.vNow, 2) + ' m/s, so it was <b>' + fmt(Math.abs(o.vNow - o.vNeed), 2) + ' m/s ' + (o.vNow >= o.vNeed ? 'too fast' : 'too slow') + '</b>. Try the What if step to see how small that is.</p>');
      } else {
        h += num('landH', A.task === 'broadjump' ? 'Centre of mass height at landing (m)' : 'Landing height (m)', landHeight());
        if (A.task === 'broadjump') h += num('toD', 'Take-off distance: toes to CoM (m)', A.takeoffDist) + num('laD', 'Landing distance: CoM to heels (m)', A.landingDist);
        if (A.task === 'shot') h += num('relA', 'Release point ahead of the stop board (m)', A.releaseAhead);
        const tm = A.t[A.land] - A.t[A.rel];
        h += '<table class="res">' + row('Peak height', fmt(o.peak, 2) + ' m (' + fmt(o.rise, 2) + ' m above release)') + row('Time to the peak', fmt(o.tPeak, 3) + ' s') + row('Flight time to landing height', fmt(o.tf, 3) + ' s') + row('Horizontal distance in flight', fmt(o.R, 2) + ' m', A.task === 'general')
          + (A.task === 'broadjump' ? row('Jump distance (toes to heels)', fmt(o.total, 2) + ' m', true) : '') + (A.task === 'shot' ? row('Distance thrown (from the stop board)', fmt(o.total, 2) + ' m', true) : '') + '</table>'
          + '<p class="small muted">Frames in flight cover ' + fmt(tm, 3) + ' s. The prediction runs on to the landing height, which may be after the last digitised frame.</p>';
        if (A.task === 'broadjump') {
          const pc = (q) => fmt(100 * q / o.total, 0) + '%';
          h += layer('eq', 'Splitting the jump distance (Hay, 1986)', '<p>The measured distance is not just the flight of the centre of mass. It has three parts:</p>' + eqn(v('D') + ' = ' + sub('d', 'take-off') + ' + ' + sub('d', 'flight') + ' + ' + sub('d', 'landing')) + '<div class="calc">' + fmt(A.takeoffDist, 2) + ' + ' + fmt(o.R, 2) + ' + ' + fmt(A.landingDist, 2) + ' = <b>' + fmt(o.total, 2) + ' m</b></div><p>Here: take-off ' + pc(A.takeoffDist) + ', flight ' + pc(o.R) + ', landing ' + pc(A.landingDist) + '. Leaning further forward at take-off, or reaching the feet further forward on landing, adds distance without changing the flight at all.</p><p class="small">Take-off and landing distances come from the video (horizontal distance from the toes to the centre of mass at take-off, and from the centre of mass to the heels at landing).</p>');
        }
        if (A.task === 'shot') h += layer('why', 'Compared with the textbook best angle', '<p>For this speed and height, the angle that would go furthest is <b>' + fmt(o.opt, 1) + '&deg;</b> (' + fmt(o.Ropt, 2) + ' m), against ' + fmt(F.pol.th, 1) + '&deg; here. That assumes the athlete could produce the same speed at that angle. They cannot: release speed falls as the angle goes up, so the real best angle for a shot putter is lower, about 35 to 38&deg; (Linthorne, 2001).</p>');
      }
      h += layer('words', 'Check the model', '<p>The blue line is predicted from <em>only</em> the three release values. If it runs through your dots, the release values describe the whole flight. Largest gap between them: <b>' + fmt(maxGap(F) * 1000, 0) + ' mm</b>.</p>');
      return h;
    },
    wire() {
      $('taskSel').addEventListener('change', (e) => { A.task = e.target.value; A.ex = null; app.render(); });
      const bind = (id, fn) => { const el = $(id); if (el) el.addEventListener('change', () => { const val = el.value === '' ? null : +el.value; fn(val); A.ex = null; app.render(); }); };
      bind('tgx', (q) => { A.target.x = q ?? A.target.x; }); bind('tgy', (q) => { A.target.y = q ?? A.target.y; });
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
      return layer('words', 'Downloads', '<div class="row"><button type="button" class="btn" id="dlCsv">Results and data (CSV)</button><button type="button" class="btn accent" id="dlPng">Figure (PNG)</button><button type="button" class="btn ghost" id="cpTxt">Copy results</button></div><p class="small">The CSV has the settings, the release values with their standard errors, the predicted outcome, and every frame: time, position, the fitted position and the residual. It opens in Excel.</p>')
        + layer('words', 'For a lab report', '<p>Report the method as well as the numbers: frame rate, how you calibrated, how many frames were fitted, the gravity check (' + fmt(F.gFree, 2) + ' m/s&sup2;) and the residuals (' + fmt(F.rmsY * 1000, 1) + ' mm). A marker would want to know how you know your numbers are trustworthy.</p><details class="more"><summary>A method sentence to adapt</summary><p class="small">Release speed, angle and height were estimated by fitting a linear model to horizontal position and a quadratic model with gravitational acceleration fixed at 9.81 m&middot;s<sup>&minus;2</sup> to vertical position across ' + F.n + ' flight frames (least squares), with time referenced to the first frame after release. ' + (Number.isFinite(F.gFree) ? 'When gravitational acceleration was freely estimated it was ' + fmt(F.gFree, 2) + ' m&middot;s<sup>&minus;2</sup>, and root' : 'Too few frames were available to estimate gravitational acceleration freely as a check, and root') + ' mean square residuals were ' + fmt(F.rmsX * 1000, 1) + ' mm (horizontal) and ' + fmt(F.rmsY * 1000, 1) + ' mm (vertical).</p></details>');
    },
    wire() { $('dlCsv').addEventListener('click', exportCSV); $('dlPng').addEventListener('click', exportPNG); $('cpTxt').addEventListener('click', () => { navigator.clipboard.writeText(resultRows().map((r) => r.join('\t')).join('\n')).then(() => { $('cpTxt').textContent = 'Copied'; }, () => {}); }); },
    draw(ctx, w, h) { const F = fit(); if (!F) return; const P = trajFigure(ctx, { x: 0, y: 0, w, h }, { predict: true }); predPath(ctx, P, P0(F), C.fit, 2.5); stamp(ctx, P, F); },
  },
];

// ---------- the simple path: Load, Scale, Click the ball, Results; everything else under Go further ----------
const SUBS = [
  { s: OLD[3], name: 'Release and landing frames' }, { s: OLD[4], name: 'Fit and gravity check' }, { s: OLD[5], name: 'Release, in detail' },
  { s: OLD[6], name: 'What it predicts' }, { s: OLD[7], name: 'What if' }, { s: OLD[8], name: 'Save and report' },
];
const FILM_HELP = '<details class="more"><summary>Before you film: how to get a flight you can analyse</summary><ul class="small"><li><b>Side-on and square</b> to the throw or jump, with the camera <b>level</b> on a tripod. Don&rsquo;t move it.</li><li><b>Far back, zoomed in a little</b> (e.g. 8 to 10 m away for a free throw).</li><li>A <b>1 m stick</b> (or anything of known length) held upright where the athlete is, in the plane of the movement.</li><li>The <b>whole flight</b> in shot, from just before release to landing or the hoop.</li><li><b>Highest frame rate</b> you have (slow motion is great: note the rate it was filmed at), and plenty of light.</li></ul></details>';
function nextScaleMode() { const c = A.cal; return !c.a ? 'calA' : !c.b ? 'calB' : !c.o ? 'o' : A.task === 'freethrow' && !A.targetPx ? 'target' : 'idle'; }
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
  if (A.task === 'freethrow') { if (!Number.isFinite(o.miss)) return 'It never comes back down to the hoop.'; const ok = o.margin > 0 && Math.abs(o.miss) <= o.margin; return 'Reaches the rim <b>' + Math.round(Math.abs(o.miss) * 100) + ' cm ' + (o.miss >= 0 ? 'long' : 'short') + '</b> of the middle, coming in at ' + fmt(o.entry, 0) + '&deg;: <b>' + (ok ? 'in' : 'out') + '</b>.'; }
  if (A.task === 'broadjump') return 'Jump distance <b>' + fmt(o.total, 2) + ' m</b> (centre of mass flight ' + fmt(o.R, 2) + ' m, plus take-off and landing distances).';
  if (A.task === 'shot') return 'Distance thrown <b>' + fmt(o.total, 2) + ' m</b> from the stop board.';
  return 'Lands <b>' + fmt(o.R, 2) + ' m</b> further on, after <b>' + fmt(o.tf, 2) + ' s</b> in the air, peaking at ' + fmt(o.peak, 2) + ' m.';
}
const STEPS = [
  {
    key: 'load', short: 'Load', title: 'Choose something to analyse', figTitle: OLD[0].figTitle, hint: OLD[0].hint,
    body: () => {
      let h = '<div class="lead"><p>Start with the <b>free throw video</b>: you&rsquo;ll do every step yourself, and it takes about 5 minutes.</p></div><div class="choices">'
        + '<button type="button" class="choice' + (A.demo === 'video' ? ' sel' : '') + '" data-demo="video"><b>&#9654; Free throw video</b><span>Recommended first. You set the scale and click the ball.</span></button>'
        + '<button type="button" class="choice' + (A.demo === 'freethrow' ? ' sel' : '') + '" data-demo="freethrow"><b>Free throw, already clicked</b><span>Skip straight to the results.</span></button>'
        + '<button type="button" class="choice' + (A.demo === 'broadjump' ? ' sel' : '') + '" data-demo="broadjump"><b>Broad jump</b><span>The jumper&rsquo;s centre of mass.</span></button>'
        + '<button type="button" class="choice' + (A.demo === 'shot' ? ' sel' : '') + '" data-demo="shot"><b>Shot put</b><span>Filmed from far back.</span></button></div>'
        + '<p style="margin:.9rem 0 .3rem"><b>Or your own:</b></p><div class="row"><label class="btn filebtn">Open a video<input type="file" id="fVid" accept="video/*,.avi" aria-label="Open a video"></label><label class="btn ghost filebtn">Open data (CSV)<input type="file" id="fCsv" accept=".csv,.txt,.tsv,text/csv,text/plain" aria-label="Open position data"></label></div>'
        + FILM_HELP + '<details class="more"><summary>What a data file should look like</summary><p class="small">A <b>marker coordinates</b> export from <a href="../video-analyser/">Kinematic Analysis</a> works as it is (use the unfiltered positions). Otherwise a CSV with a header row: <code>time_s, x_m, y_m</code>, with y measured <b>up</b> from the floor, in metres.</p></details>';
      if (A.src) h += '<div class="status"><b>Loaded:</b> ' + esc(A.name) + (A.src === 'data' ? ' (' + N() + ' frames)' : '') + '.' + (A.note ? ' <span class="small">' + esc(A.note) + '</span>' : '')
        + (A.markers && A.markers.length > 1 ? '<div class="field"><label for="mkSel">Marker</label><select id="mkSel">' + A.markers.map((m) => '<option' + (m === A.marker ? ' selected' : '') + '>' + esc(m) + '</option>').join('') + '</select></div>' : '')
        + (A.csvParsed && A.csvParsed.ti < 0 ? '<div class="field"><label for="fpsData">Frame rate</label><input type="number" id="fpsData" min="1" step="1" value="' + A.fpsData + '"></div>' : '')
        + (A.csvParsed ? '<div class="field"><label for="unitSel">Units</label><select id="unitSel"><option value="1"' + (A.units === 1 ? ' selected' : '') + '>metres</option><option value="0.01"' + (A.units === 0.01 ? ' selected' : '') + '>centimetres</option><option value="0.001"' + (A.units === 0.001 ? ' selected' : '') + '>millimetres</option></select></div>' : '')
        + '</div><p><b>Next &rarr;</b> ' + (A.src === 'video' ? 'set the scale.' : 'see the results.') + '</p>';
      return h;
    },
    wire: OLD[0].wire, draw: OLD[0].draw,
  },
  {
    key: 'scale', short: 'Scale', title: 'Tell the tool how big things are', view: 'stage', enabled: () => A.src === 'video', canNext: () => calibrated(),
    body: () => {
      const c = A.cal, m = nextScaleMode();
      return '<div class="lead"><p>Follow the instruction on the video. The magnifier (top right) helps you click exactly.</p></div><ol class="checklist">'
        + '<div class="subtabs" style="margin:.2rem 0 .5rem"><button type="button" data-calby="stick" class="' + (A.calBy === 'ball' ? '' : 'on') + '">Scale from a stick</button><button type="button" data-calby="ball" class="' + (A.calBy === 'ball' ? 'on' : '') + '">No stick? Use the ball</button></div>'
        + (A.calBy === 'ball'
          ? tick(!!c.a, m === 'calA', 'Go to a frame where the ball is <b>sharp and fully in the picture</b>, then click its <b>left edge</b>')
            + tick(!!c.b, m === 'calB', 'Click its <b>right edge</b>. Ball size: <select id="ballSz" style="width:auto;display:inline-block"><option value="0.239"' + (c.len === 0.239 ? ' selected' : '') + '>size 7 (23.9 cm)</option><option value="0.232"' + (c.len === 0.232 ? ' selected' : '') + '>size 6 (23.2 cm)</option><option value="0.220"' + (c.len === 0.22 ? ' selected' : '') + '>size 5 (22.0 cm)</option></select>')
            + '<li class="small muted" style="list-style:none">A ball is only a few dozen pixels across, so a one-pixel slip changes the scale by a few per cent. Zoom in with the magnifier and click the very edge. A stick is more accurate.</li>'
          : tick(!!c.a, m === 'calA', 'Click <b>one end</b> of the stick')
            + tick(!!c.b, m === 'calB', 'Click <b>the other end</b>. It is <input type="number" id="calLen" min="0.01" step="0.01" value="' + c.len + '" style="width:5rem;display:inline-block"> m long'))
        + tick(!!c.o, m === 'o', 'Click the <b>floor</b> where you want 0 m (e.g. the free-throw line or the take-off line)')
        + (A.task === 'freethrow' ? tick(!!A.targetPx, m === 'target', 'Click the <b>middle of the hoop</b>') : '') + '</ol>'
        + (calibrated() && m === 'idle' ? '<div class="light-good"><b>Done!</b> Press <b>Next</b> and click the ball.</div>' : '')
        + '<div class="row"><button type="button" class="btn small ghost" id="calReset">Start again</button>' + (A.task !== 'freethrow' ? '<button type="button" class="btn small ghost" id="bTgt">Shooting at a hoop? Click it</button>' : '') + (A.demo ? '<button type="button" class="btn small ghost" id="bDemoCal">Do it for me</button>' : '') + '</div>'
        + '<details class="more"' + (A.demo || A.avi ? '' : ' open') + '><summary>Frame rate' + (A.demo ? ' (already set: 60 fps)' : A.avi ? ' (read from the file: ' + fmt(A.realFps, 0) + ' fps)' : ': check this for your video') + '</summary><p class="small">For slow motion, use the rate it was <b>filmed</b> at (e.g. 240), not the rate it plays at.</p><div class="field"><label for="fileFps">Frames per second in the file</label><input type="number" id="fileFps" min="1" step="1" value="' + A.fileFps + '"></div><div class="field"><label for="realFps">Filmed at (fps)</label><input type="number" id="realFps" min="1" step="1" value="' + A.realFps + '"></div></details>';
    },
    tools: () => frameTools(),
    wire() {
      wireFrameTools(); A.mode = nextScaleMode(); drawStage();
      $('fileFps').addEventListener('change', (e) => { A.fileFps = Math.max(1, +e.target.value || 30); A.nF = Math.max(1, Math.round($('vid').duration * A.fileFps)); showFrame(A.frame); buildFromClicks(); app.render(); });
      $('realFps').addEventListener('change', (e) => { A.realFps = Math.max(1, +e.target.value || A.fileFps); buildFromClicks(); app.render(); });
      const cl = $('calLen'); if (cl) cl.addEventListener('change', (e) => { A.cal.len = Math.max(0.001, +e.target.value || 1); buildFromClicks(); app.render(); });
      const bs = $('ballSz'); if (bs) bs.addEventListener('change', (e) => { A.cal.len = +e.target.value; buildFromClicks(); app.render(); });
      document.querySelectorAll('[data-calby]').forEach((b) => b.addEventListener('click', () => { A.calBy = b.dataset.calby; A.cal = { a: null, b: null, len: A.calBy === 'ball' ? 0.239 : 1, o: A.cal.o }; buildFromClicks(); app.render(); }));
      $('calReset').addEventListener('click', () => { A.cal = { a: null, b: null, len: A.cal.len, o: null }; A.targetPx = null; app.render(); });
      const t = $('bTgt'); if (t) t.addEventListener('click', () => { A.task = 'freethrow'; A.targetPx = null; app.render(); });
      const d = $('bDemoCal'); if (d) d.addEventListener('click', () => { A.cal = { a: VIDEO_DEMO.stickPx[0].slice(), b: VIDEO_DEMO.stickPx[1].slice(), len: VIDEO_DEMO.stickLen, o: VIDEO_DEMO.originPx.slice() }; A.targetPx = [VIDEO_DEMO.originPx[0] + 4.225 * 150, VIDEO_DEMO.originPx[1] - 3.05 * 150]; buildFromClicks(); app.render(); });
    },
    drawStage, leave: () => { A.mode = 'idle'; $('loupe').style.display = 'none'; },
  },
  {
    key: 'click', short: 'Click the ball', title: 'Click the middle of the ball', view: 'stage', enabled: () => A.src === 'video' && calibrated(), canNext: () => N() >= 6,
    body: () => {
      const n = Object.keys(A.clicks).length;
      return '<div class="lead"><p>Click the <b>middle of the ball</b>. The video moves on by itself.</p></div><ol class="checklist">'
        + tick(n > 0, n === 0, 'Go back to <b>just before the ball leaves the hand</b> (&lsaquo; 1 and &laquo; 10 under the video, or the arrow keys)')
        + tick(n >= 3, n > 0 && n < 3, 'Click the ball in <b>every frame</b> after that, starting with the first frame where it is clear of the hand')
        + tick(n >= 15, n >= 3, 'Keep going until it <b>lands, reaches the hoop or leaves the picture</b>') + '</ol>'
        + '<p class="small muted">Ball leaves the picture after only a few frames? Click every one you can (at least 3). You will still get release values, but rough ones, and no gravity check. 10 or more frames is much better.</p>'
        + '<div class="tiles"><div class="tile"><span>Clicks</span><b id="clickCount">' + n + '</b></div><div class="tile"><span>Frame</span><b id="frameNo2">' + A.frame + '</b></div></div>'
        + (n >= 3 ? '<p>' + (n >= 15 ? '<b>Plenty.</b> ' : n >= 10 ? 'Enough. ' : 'Enough for rough values, but more is better. ') + 'Press <b>Next</b> to see your results.</p>' : '')
        + '<div class="row"><button type="button" class="btn small ghost" id="bUndo"' + (A.hist.length ? '' : ' disabled') + '>Undo last click</button><button type="button" class="btn small ghost" id="bClr"' + (n ? '' : ' disabled') + '>Clear all</button>' + (A.demo ? '<button type="button" class="btn small ghost" id="bAuto">Do it for me</button>' : '') + '</div>'
        + '<details class="more"><summary>Options</summary><label class="small">After each click, move on by <select id="stepBy" style="width:4.5rem;display:inline-block">' + [1, 2, 3, 4].map((k) => '<option' + (k === A.stepBy ? ' selected' : '') + '>' + k + '</option>').join('') + '</select> frame(s)</label><p class="small">Missed one? Go to that frame and click again to move its point.</p></details>'
        + (A.demo ? '<p class="small muted">Tip: in the demo the ball leaves the hand at frame ' + VIDEO_DEMO.releaseFrame + '.</p>' : '');
    },
    tools: () => frameTools(),
    wire() {
      wireFrameTools(); A.mode = 'dig'; drawStage();
      $('stepBy').addEventListener('change', (e) => { A.stepBy = +e.target.value; });
      $('bUndo').addEventListener('click', () => { const f = A.hist.pop(); if (f !== undefined) { delete A.clicks[f]; buildFromClicks(); showFrame(f); app.render(); } });
      $('bClr').addEventListener('click', () => { if (confirm('Remove every click?')) { A.clicks = {}; A.hist = []; buildFromClicks(); app.render(); } });
      const au = $('bAuto'); if (au) au.addEventListener('click', autoDemo);
    },
    drawStage, leave: () => { A.mode = 'idle'; $('loupe').style.display = 'none'; },
  },
  {
    key: 'results', short: 'Results', title: 'Your results', enabled: () => !!fit(), figTitle: () => 'The flight, and the triangle at release',
    hint: () => 'Green ring: release. Red ring: last frame in the air.',
    body: () => {
      const F = fit(); if (!F) return ''; let gc = gClass(F); const few = F.n < 10; if (few && gc === 'light-good') gc = 'light-warn'; const how = A.fromEvents ? 'were set from the video' : 'were picked automatically';
      const pmx = (se, d, u) => (few ? '<small style="display:block;font-size:.8rem;color:var(--muted)">&plusmn; ' + fmt(2 * se, d) + u + ' (95%)</small>' : '');
      return '<div class="tiles big"><div class="tile" style="border-color:' + C.hyp + '"><span>Release speed</span><b>' + fmt(F.pol.v, 2) + ' m/s</b>' + pmx(F.pol.sv, 2, ' m/s') + '</div><div class="tile" style="border-color:#475569"><span>Release angle</span><b>' + fmt(F.pol.th, 1) + '&deg;</b>' + pmx(F.pol.sth, 1, '&deg;') + '</div><div class="tile" style="border-color:#16a34a"><span>Release height</span><b>' + fmt(F.y0, 2) + ' m</b>' + pmx(F.sey0, 2, ' m') + '</div></div>'
        + '<div class="field"><label for="taskSel2">What is it?</label><select id="taskSel2">' + Object.entries(TASKS).map(([k, n]) => '<option value="' + k + '"' + (k === A.task ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div>'
        + '<p class="lead-sm">' + oneLine(F) + '</p>'
        + '<div class="' + gc + '"><p style="margin:0"><b>' + (gc === 'light-good' ? '&#10003; You can trust these numbers.' : gc === 'light-warn' ? '&#9888; Nearly there: check before you trust these.' : '&#10007; Something is wrong: don&rsquo;t use these yet.') + '</b> ' + (!Number.isFinite(F.gFree) ? gText(F) + ' ' : few ? 'Only ' + F.n + ' frames in the air, so treat these as rough (10 or more is better). ' : '') + (!Number.isFinite(F.gFree) ? '' : gc === 'light-good' || (few && gClass(F) === 'light-good') ? 'The tool checked the flight against gravity and got ' + fmt(F.gFree, 2) + ' m/s&sup2; (it should be 9.81).' : 'Checking against gravity gave ' + fmt(F.gFree, 2) + ' m/s&sup2; instead of 9.81. The usual causes are the frame rate, the scale, or the release frame.') + '</p></div>'
        + '<p class="small">Release (<b style="color:#16a34a">green ring</b>) and the last frame in the air (<b style="color:#dc2626">red ring</b>) ' + how + '. Does the green ring sit where the ball leaves the hand? If not, fix it in <b>Go further</b>.</p>'
        + (A.truth ? '<p class="small muted">Demo: the true release was ' + fmt(A.truth.v, 2) + ' m/s at ' + fmt(A.truth.th, 1) + '&deg; from ' + fmt(A.truth.y0, 2) + ' m.</p>' : '')
        + '<div class="row"><button type="button" class="btn" id="goFur">Go further &rarr;</button><button type="button" class="btn ghost" id="dlCsv2">Save results (CSV)</button><button type="button" class="btn ghost" id="dlPng2">Save picture</button></div>';
    },
    wire() {
      $('taskSel2').addEventListener('change', (e) => { A.task = e.target.value; A.ex = null; app.render(); });
      $('goFur').addEventListener('click', () => { A.gf = gClass(fit()) === 'light-good' ? 3 : 1; app.go(4); });
      $('dlCsv2').addEventListener('click', exportCSV); $('dlPng2').addEventListener('click', exportPNG);
    },
    draw(ctx, w, h) {
      const F = fit(); if (!F) return; const P = trajFigure(ctx, { x: 0, y: 0, w, h }, { predict: true }); predPath(ctx, P, P0(F), C.fit, 2.5);
      drawTriangle(ctx, P, F, 1.3); const x = X();
      ring(ctx, P, x[A.rel], A.ry[A.rel], '#16a34a', 'release'); ring(ctx, P, x[A.land], A.ry[A.land], '#dc2626', 'last in the air');
    },
  },
  {
    key: 'further', short: 'Go further', title: 'Go further', enabled: () => !!fit(),
    figTitle: () => SUBS[A.gf].s.figTitle(), hint: () => (SUBS[A.gf].s.hint ? SUBS[A.gf].s.hint() : ''), tools: () => (SUBS[A.gf].s.tools ? SUBS[A.gf].s.tools() : ''),
    body: () => '<div class="subtabs">' + SUBS.map((q, i) => '<button type="button" data-gf="' + i + '" class="' + (i === A.gf ? 'on' : '') + '">' + q.name + '</button>').join('') + '</div>' + SUBS[A.gf].s.body(),
    wire() { document.querySelectorAll('[data-gf]').forEach((b) => b.addEventListener('click', () => { A.gf = +b.dataset.gf; app.render(); })); if (SUBS[A.gf].s.wire) SUBS[A.gf].s.wire(); },
    draw(ctx, w, h, ts) { SUBS[A.gf].s.draw(ctx, w, h, ts); },
  },
];

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
function triScale() { const F = fit(); if (!F) return 0.1; const x = X(); const span = Math.max(...x) - Math.min(...x); return Math.max(0.02, Math.min(0.25, span * 0.18 / Math.max(F.pol.v, 0.5))); }
function predPath(ctx, P, Pp, col, wd) {
  const hl = landHeight(); let T = tAtHeight(Pp, A.task === 'freethrow' ? A.target.y - 0.35 : hl); if (!Number.isFinite(T)) T = Math.max(0.2, 2 * Pp.vy / G + 0.2);
  const xs = [], ys = []; for (let k = 0; k <= 100; k++) { const p = pos(Pp, T * k / 100); xs.push(p[0]); ys.push(p[1]); } line(ctx, P, xs, ys, col, wd);
  dots(ctx, P, [Pp.x0], [Pp.y0], col, 4.5);
}
function stamp(ctx, P, F) {
  const o = outcome(P0(F)), t = [fmt(F.pol.v, 2) + ' m/s at ' + fmt(F.pol.th, 1) + '° from ' + fmt(F.y0, 2) + ' m', metricName() + ': ' + (A.task === 'freethrow' ? sgn(o.miss * 100, 1) + ' cm' : fmt(o.metric, 2) + ' m'), 'g check ' + fmt(F.gFree, 2) + ' m/s², ' + F.n + ' frames, RMS ' + fmt(F.rmsY * 1000, 1) + ' mm'];
  t.forEach((s, i) => label(ctx, s, P.r.L + 10, P.r.T + 14 + i * 20, COL.ink, { align: 'left', size: 12.5 }));
}
function ex() { const F = fit(); if (!A.ex) A.ex = { v0: F.pol.v, th0: F.pol.th, h0: F.y0, ev: F.pol.v, eth: F.pol.th, eh: F.y0 }; return A.ex; }
function sl(k, lab, min, max, step, unit) { const e = ex(); return '<div class="slider" style="flex:1 1 100%"><label for="s_' + k + '">' + lab + '</label><input type="range" id="s_' + k + '" min="' + min.toFixed(3) + '" max="' + max.toFixed(3) + '" step="' + step + '" value="' + e[k] + '"><b id="o_' + k + '">' + e[k].toFixed(k === 'eth' ? 1 : 2) + ' ' + unit + '</b></div>'; }
function exOut(F, e, Pw) {
  const el = $('exOut'); if (!el) return;
  const m0 = outcome(P0(F)).metric, base = outcome(Pw), m1 = base.metric, ft = A.task === 'freethrow', u = (q) => (ft ? sgn(q * 100, 1) + ' cm' : sgn(q, 2) + ' m');
  const d = (dv, dth, dh) => outcome(fromPolar(e.ev + dv, e.eth + dth, e.eh + dh, F.x0)).metric - m1;
  const sv = d(0.1, 0, 0), sa = d(0, 1, 0), sh = d(0, 0, 0.05);
  let h = '<table class="res"><tr><th></th><th style="text-align:right">Measured</th><th style="text-align:right">What if</th></tr><tr><td>' + metricName() + '</td><td class="n">' + u(m0) + '</td><td class="n" style="color:' + C.what + '">' + u(m1) + '</td></tr>';
  if (ft) h += '<tr><td>Entry angle</td><td class="n">' + fmt(outcome(P0(F)).entry, 1) + '&deg;</td><td class="n" style="color:' + C.what + '">' + fmt(base.entry, 1) + '&deg;</td></tr><tr><td>Room for error</td><td class="n">&plusmn;' + fmt(outcome(P0(F)).margin * 100, 1) + ' cm</td><td class="n" style="color:' + C.what + '">' + (base.margin > 0 ? '&plusmn;' + fmt(base.margin * 100, 1) + ' cm' : 'none') + '</td></tr>';
  h += '</table><table class="res"><tr><th>Change at release</th><th style="text-align:right">Effect on ' + (ft ? 'where it reaches the hoop' : 'distance') + '</th></tr><tr><td>+0.1 m/s speed</td><td class="n">' + u(sv) + '</td></tr><tr><td>+1&deg; angle</td><td class="n">' + u(sa) + '</td></tr><tr><td>+5 cm height</td><td class="n">' + u(sh) + '</td></tr></table>';
  if (ft) { const mn = minSpeedToTarget(A.target.x - F.x0, A.target.y - e.eh); h += '<p>From this height the minimum-speed angle is <b>' + fmt(mn.th, 1) + '&deg;</b>. Here, 0.1 m/s of speed moves the ball as much as <b>' + fmt(Math.abs(sa) > 1e-6 ? Math.abs(sv / sa) : NaN, 1) + '&deg;</b> of angle. ' + (Math.abs(sa) < Math.abs(sv) / 3 ? 'Close to the minimum-speed angle, angle errors barely matter, so <b>consistent speed</b> is what makes the shot.' : 'Away from the minimum-speed angle, angle errors start to matter too.') + '</p>'; }
  else { const hh = e.eh - landHeight(), opt = optimumAngle(e.ev, hh); h += '<p>For this speed and height, the angle for the greatest distance is <b>' + fmt(opt, 1) + '&deg;</b> (if speed did not drop at higher angles, which in real athletes it does).</p>'; }
  el.innerHTML = h;
}
function frameTools() {
  return '<div class="ctrls"><button type="button" class="btn small ghost" data-fr="-10">&laquo; 10</button><button type="button" class="btn small ghost" data-fr="-1">&lsaquo; 1</button><span class="readout">Frame <span id="frameNo">' + A.frame + '</span></span><button type="button" class="btn small ghost" data-fr="1">1 &rsaquo;</button><button type="button" class="btn small ghost" data-fr="10">10 &raquo;</button></div><input type="range" id="frSl" min="0" max="' + Math.max(0, A.nF - 1) + '" value="' + A.frame + '" style="flex:1 1 200px" aria-label="Frame"><label class="small" style="display:inline-flex;gap:.35rem;align-items:center">Brightness <input type="range" id="brSl" min="1" max="4" step="0.25" value="' + A.bright + '" style="width:7rem"><b id="brOut">' + A.bright.toFixed(2) + '\u00d7</b></label>';
}
function wireFrameTools() {
  const br = $('brSl'); if (br) br.addEventListener('input', () => { A.bright = +br.value; $('brOut').textContent = A.bright.toFixed(2) + '\u00d7'; drawStage(); });
  document.querySelectorAll('[data-fr]').forEach((b) => b.addEventListener('click', () => { showFrame(A.frame + +b.dataset.fr); syncSl(); }));
  const s = $('frSl'); if (s) s.addEventListener('input', () => showFrame(+s.value));
}
function syncSl() { const s = $('frSl'); if (s) s.value = A.frame; }
function autoDemo() {
  // the demo shot's true path (60 fps, release at frame 29) with a realistic 2-pixel clicking error, every 2nd frame
  const r = (seed => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; })(7), g2 = () => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
  const D = DEMOS.freethrow(); A.clicks = {};
  // clicks go where the ball really is in the video, so the user's own calibration errors carry through as they would
  for (let i = 0; i < D.t.length; i += 2) { const f = i + (VIDEO_DEMO.releaseFrame - D.iRel); const p = [VIDEO_DEMO.originPx[0] + D.x[i] * 150, VIDEO_DEMO.originPx[1] - D.y[i] * 150]; A.clicks[f] = [Math.round((p[0] + g2() * 1.5) * 10) / 10, Math.round((p[1] + g2() * 1.5) * 10) / 10]; }
  buildFromClicks(); A.hist = Object.keys(A.clicks).map(Number); const ri = A.fr.indexOf(VIDEO_DEMO.releaseFrame); if (ri >= 0) { A.rel = ri; A.land = N() - 1; A.suggested = false; A.fromEvents = true; FITKEY = ''; }
  app.render(); showFrame(VIDEO_DEMO.releaseFrame);
}
function guessUnits(P) { const vals = P.rows.slice(0, 200).flatMap((r) => [+r[P.xi], +r[P.yi]]).filter(Number.isFinite); const m = Math.max(...vals.map(Math.abs)); A.units = m > 300 ? 0.001 : m > 40 ? 0.01 : 1; }

// ---------- export ----------
function resultRows() {
  const F = fit(), o = outcome(P0(F)), r = [['Source', A.name], ['Task', TASKS[A.task]], ['Frames fitted', F.n + ' (frame ' + A.fr[A.rel] + ' to ' + A.fr[A.land] + ')'], ['Frame rate (Hz)', fmt(1 / F.dt, 1)],
    ['Gravity check, g free (m/s^2)', fmt(F.gFree, 3) + ' +/- ' + fmt(F.seg, 3)], ['RMS residual x (mm)', fmt(F.rmsX * 1000, 2)], ['RMS residual y (mm)', fmt(F.rmsY * 1000, 2)],
    ['Release vx (m/s)', fmt(F.vx, 3) + ' +/- ' + fmt(F.sevx, 3)], ['Release vy (m/s)', fmt(F.vy, 3) + ' +/- ' + fmt(F.sevy, 3)], ['Release speed (m/s)', fmt(F.pol.v, 3) + ' +/- ' + fmt(F.pol.sv, 3)], ['Release angle (deg)', fmt(F.pol.th, 2) + ' +/- ' + fmt(F.pol.sth, 2)], ['Release height (m)', fmt(F.y0, 3)],
    ['Peak height (m)', fmt(o.peak, 3)], ['Time to peak (s)', fmt(o.tPeak, 3)]];
  if (A.task === 'freethrow') r.push(['Hoop centre x, y (m)', fmt(A.target.x, 3) + ', ' + fmt(A.target.y, 3)], ['Miss at rim height (cm, + long)', fmt(o.miss * 100, 1)], ['Entry angle (deg)', fmt(o.entry, 1)], ['Room for error (cm)', fmt(o.margin * 100, 1)], ['Minimum-speed angle (deg)', fmt(o.min.th, 1)], ['Speed for a perfect shot at this angle (m/s)', fmt(o.vNeed, 3)]);
  else { r.push(['Landing height (m)', fmt(o.hl, 3)], ['Flight time (s)', fmt(o.tf, 3)], ['Horizontal distance in flight (m)', fmt(o.R, 3)]); if (A.task === 'broadjump') r.push(['Take-off distance (m)', fmt(A.takeoffDist, 3)], ['Landing distance (m)', fmt(A.landingDist, 3)], ['Jump distance (m)', fmt(o.total, 3)]); if (A.task === 'shot') r.push(['Release ahead of stop board (m)', fmt(A.releaseAhead, 3)], ['Distance thrown (m)', fmt(o.total, 3)], ['Best angle for this speed and height (deg)', fmt(o.opt, 1)]); }
  return r;
}
function exportCSV() {
  const F = fit(), q = (s) => '"' + String(s).replace(/"/g, '""') + '"', x = X();
  const lines = ['Projectile Motion results', ''].concat(resultRows().map((r) => r.map(q).join(',')), ['', 'frame,time_s,x_m,y_m,in_flight,t_from_release_s,x_fit_m,y_fit_m,x_residual_mm,y_residual_mm']);
  const t0 = A.t[A.rel];
  for (let i = 0; i < N(); i++) { const tt = A.t[i] - t0, p = pos(P0(F), tt), inF = i >= A.rel && i <= A.land; lines.push([A.fr[i], A.t[i].toFixed(4), x[i].toFixed(4), A.ry[i].toFixed(4), inF ? 1 : 0, tt.toFixed(4), inF ? p[0].toFixed(4) : '', inF ? p[1].toFixed(4) : '', inF ? ((x[i] - p[0]) * 1000).toFixed(2) : '', inF ? ((A.ry[i] - p[1]) * 1000).toFixed(2) : ''].join(',')); }
  download(base() + '_projectile.csv', lines.join('\n') + '\n', 'text/csv');
}
function exportPNG() {
  const cv = document.createElement('canvas'); cv.style.width = '1600px'; cv.style.height = '1000px'; cv.width = 1600; cv.height = 1000;
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1600, 1000); ctx.font = '13px system-ui'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const F = fit(), P = trajFigure(ctx, { x: 0, y: 0, w: 1600, h: 1000 }, { predict: true }); predPath(ctx, P, P0(F), C.fit, 2.5); stamp(ctx, P, F);
  cv.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = base() + '_projectile.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); });
}
const base = () => (A.name || 'projectile').replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_').slice(0, 60);
function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

export const ANALYSE = {
  init(a) {
    app = a; $ = a.$;
    const st = $('stage');
    st.addEventListener('click', stageClick); st.addEventListener('pointermove', loupe); st.addEventListener('pointerleave', () => { $('loupe').style.display = 'none'; });
    document.addEventListener('keydown', (e) => {
      if (app.S.mode !== 'analyse' || $('stageWrap').classList.contains('hide') || !A.vw || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && document.activeElement.type !== 'range') return;
      if (e.key === 'ArrowRight' || e.key === '.') { showFrame(A.frame + 1); syncSl(); e.preventDefault(); }
      else if (e.key === 'ArrowLeft' || e.key === ',') { showFrame(A.frame - 1); syncSl(); e.preventDefault(); }
    });
  },
  steps: () => STEPS,
};
