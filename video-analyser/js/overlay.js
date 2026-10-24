// Drawing on top of the video, the magnifier, mouse/touch input, digitising and quick measurements.
import { A, $, esc, status, persist, points, colourOf, angleDefs, tReal } from './state.js?v=2.1.0';
import { toWorld, toPixel, jointAngle, segFromVertical, segFromHorizontal, angleValue, anglePoints, units } from './maths.js?v=2.1.0';
import { seek, viewCanvas } from './video.js?v=2.1.0';

const ov = () => $('ov');
let ctx = null;
const c2d = () => (ctx || (ctx = ov().getContext('2d')));

export function rad() { return Math.max(4, Math.round(Math.min(A.S.vw, A.S.vh) / 110)); }
export function markerHalf() {
  const base = Math.round(Math.min(A.S.vw, A.S.vh) / 72), m = $('trkSize') ? $('trkSize').value : 'auto';
  const h = m === 'auto' ? base : Math.round(base * parseFloat(m));
  return Math.max(5, Math.min(18, h));
}

export function draw(target, frame) {
  const S = A.S; if (!S.vw) return;
  const g = target || c2d(), f = frame === undefined ? A.cur : frame;
  if (!target) g.clearRect(0, 0, ov().width, ov().height);
  const r = rad(), lw = Math.max(2, r / 2.5), fsz = Math.max(12, r * 2.6);
  g.lineCap = 'round';
  if (S.grid && S.calib) drawGrid(g, lw, fsz);
  if (S.calib && !target && S.showCal !== false) {
    const a = S.calib.p1, b = S.calib.p2;
    g.strokeStyle = '#facc15'; g.lineWidth = lw; g.setLineDash([r * 1.5, r]);
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.setLineDash([]);
    label(g, S.calib.len + ' m', (a[0] + b[0]) / 2 + r * 2, (a[1] + b[1]) / 2, '#facc15', fsz);
  }
  if (S.origin && !target && S.showCal !== false) cross(g, S.origin[0], S.origin[1], r * 2, '#facc15', lw);
  const pts = points(), fr = S.frames[f] || {};
  // trail of the selected marker
  if (!target) {
    const tm = A.activeMarker || (pts.includes('Hip') ? 'Hip' : pts[0]);
    g.fillStyle = colourOf(tm); g.globalAlpha = 0.35;
    const n = +($('trail') ? $('trail').value : 9999);
    Object.keys(S.frames).forEach((k) => { const kk = +k; const p = S.frames[k][tm]; if (p && kk !== f && kk < f && f - kk <= n * Math.max(1, S.every) * 4) { g.beginPath(); g.arc(p[0], p[1], r * 0.45, 0, 7); g.fill(); } });
    g.globalAlpha = 1;
  }
  // segments
  g.strokeStyle = 'rgba(255,255,255,.92)'; g.lineWidth = lw;
  S.template.links.forEach((l) => { if (fr[l[0]] && fr[l[1]]) { g.beginPath(); g.moveTo(fr[l[0]][0], fr[l[0]][1]); g.lineTo(fr[l[1]][0], fr[l[1]][1]); g.stroke(); } });
  pts.forEach((m) => {
    const p = fr[m]; if (!p) return;
    g.fillStyle = colourOf(m); g.strokeStyle = '#fff'; g.lineWidth = lw * 0.8;
    g.beginPath(); g.arc(p[0], p[1], r, 0, 7); g.fill(); g.stroke();
    if (m === A.activeMarker && !target) { g.strokeStyle = '#facc15'; g.lineWidth = lw; g.beginPath(); g.arc(p[0], p[1], r * 1.8, 0, 7); g.stroke(); }
  });
  // where tracking thought a marker was, when it paused because the jump looked wrong
  const P = A.trackResume;
  if (P && P.suspect && P.frame === f && !target) Object.keys(P.suspect).forEach((m) => {
    if (fr[m]) return; const p = P.suspect[m];
    g.strokeStyle = '#ef4444'; g.lineWidth = lw; g.setLineDash([r * 0.5, r * 0.4]); g.beginPath(); g.arc(p[0], p[1], r * 1.6, 0, 7); g.stroke(); g.setLineDash([]);
    label(g, m + '?', p[0] + r * 2, p[1] - r * 1.6, '#fca5a5', fsz * 0.85);
  });
  // flagged markers
  const fl = S.flags[f];
  if (fl && !target) fl.forEach((x) => { const p = x.m && fr[x.m]; if (p) { g.strokeStyle = '#ef4444'; g.lineWidth = lw; g.setLineDash([r * 0.6, r * 0.5]); g.beginPath(); g.arc(p[0], p[1], r * 2.4, 0, 7); g.stroke(); g.setLineDash([]); } });
  // live angles chosen to show on the video
  angleDefs().filter((d) => d.on && d.video).forEach((d) => {
    const ps = anglePoints(d); if (!ps.every((n) => fr[n])) return;
    const W = {}; ps.forEach((n) => { W[n] = toWorld(fr[n]); });
    const v = angleValue(d, W), at = fr[d.type === 'joint' ? d.b : d.a];
    label(g, Math.round(v) + '°', at[0] + r * 2.2, at[1] - r * 1.2, '#fff', fsz);
  });
  // measurements on this frame
  S.measures.forEach((m) => { if (m.frame === f) drawMeasure(g, m.pts, m.type, m.text, r, lw, fsz); });
  if (A.pending.length && !target) drawMeasure(g, A.pending, A.mode, '', r, lw, fsz);
  // event label
  const evs = S.events.filter((e) => e.frame === f).map((e) => e.name);
  if (evs.length) label(g, evs.join(' + '), r * 2, fsz * 1.6, '#facc15', fsz * 1.1, 'left');
  if (!target && A.fn.live) A.fn.live();
}
function drawGrid(g, lw, fsz) {
  const S = A.S, sp = S.grid;
  const cs = [[0, 0], [S.vw, 0], [0, S.vh], [S.vw, S.vh]].map(toWorld);
  const xs = cs.map((c) => c[0]), ys = cs.map((c) => c[1]);
  const x0 = Math.floor(Math.min(...xs) / sp) * sp, x1 = Math.ceil(Math.max(...xs) / sp) * sp;
  const y0 = Math.floor(Math.min(...ys) / sp) * sp, y1 = Math.ceil(Math.max(...ys) / sp) * sp;
  g.save(); g.lineWidth = Math.max(1, lw / 2);
  const line = (a, b, axis) => {
    g.lineWidth = Math.max(2, lw); g.strokeStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    g.lineWidth = Math.max(1, lw / 2); g.strokeStyle = axis ? 'rgba(250,204,21,.95)' : 'rgba(255,255,255,.75)'; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  };
  for (let x = x0; x <= x1 + 1e-9; x += sp) line(toPixel([x, y0]), toPixel([x, y1]), Math.abs(x) < 1e-9);
  for (let y = y0; y <= y1 + 1e-9; y += sp) line(toPixel([x0, y]), toPixel([x1, y]), Math.abs(y) < 1e-9);
  const o = toPixel([0, 0]); label(g, '(0, 0)', o[0] + 6, o[1] - fsz * 0.7, '#facc15', fsz * 0.8);
  const xa = toPixel([sp, 0]); label(g, sp + ' m → forwards', xa[0] + 6, xa[1] + fsz * 0.8, '#facc15', fsz * 0.8);
  g.restore();
}
function drawMeasure(g, pts, type, text, r, lw, fsz) {
  g.strokeStyle = '#facc15'; g.fillStyle = '#facc15'; g.lineWidth = lw;
  if (type === 'inter') {
    for (let i = 0; i + 1 < pts.length; i += 2) { g.beginPath(); g.moveTo(pts[i][0], pts[i][1]); g.lineTo(pts[i + 1][0], pts[i + 1][1]); g.stroke(); }
  } else { g.beginPath(); pts.forEach((p, i) => { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.stroke(); }
  pts.forEach((p) => { g.beginPath(); g.arc(p[0], p[1], r * 0.7, 0, 7); g.fill(); });
  if ((type === 'vert' || type === 'horiz') && pts.length === 2) {
    const L = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]); g.setLineDash([r, r]); g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    if (type === 'vert') g.lineTo(pts[0][0], pts[0][1] - L); else g.lineTo(pts[0][0] + (pts[1][0] >= pts[0][0] ? L : -L), pts[0][1]);
    g.stroke(); g.setLineDash([]);
  }
  if (text) { const q = pts[type === 'angle' ? 1 : pts.length - 1]; label(g, text, q[0] + r * 2, q[1] - r * 2, '#facc15', fsz); }
}
export function label(g, t, x, y, col, size, align) {
  g.font = 'bold ' + Math.round(size) + 'px system-ui, Arial'; g.textAlign = align || 'left'; g.textBaseline = 'middle';
  g.lineWidth = Math.max(3, size / 4); g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(t, x, y);
  g.fillStyle = col; g.fillText(t, x, y);
}
function cross(g, x, y, s, col, lw) { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(x - s, y); g.lineTo(x + s, y); g.moveTo(x, y - s); g.lineTo(x, y + s); g.stroke(); }

// ---------- auto-centre: snap a click to the centre of a marker ----------
// Looks in a small window around the point for blobs that stand out from the local background
// (bright reflective markers, coloured tape or dark dots), picks the strongest blob nearest the click
// and returns its contrast-weighted centre. Returns the point unchanged if no clear marker is there.
// img (optional) is a whole-frame ImageData; otherwise the frame on screen is used.
export function findCentre(p, img, opts) {
  opts = opts || {};
  const hm = markerHalf(), R = opts.R || Math.max(10, Math.round(hm * 2.2)), W = A.S.vw, H = A.S.vh;
  const x0 = Math.round(p[0]) - R, y0 = Math.round(p[1]) - R, n = 2 * R + 1;
  if (x0 < 0 || y0 < 0 || x0 + n > W || y0 + n > H) return null;
  let d;
  if (img) { d = new Uint8ClampedArray(n * n * 4); for (let y = 0; y < n; y++) { const src = ((y0 + y) * img.width + x0) * 4; d.set(img.data.subarray(src, src + n * 4), y * n * 4); } }
  else d = viewCanvas().getContext('2d', { willReadFrequently: true }).getImageData(x0, y0, n, n).data;
  // background = median colour of the window's border
  const br = [], bgc = [], bb = [];
  for (let i = 0; i < n; i++) for (const [x, y] of [[i, 0], [i, n - 1], [0, i], [n - 1, i]]) { const k = (y * n + x) * 4; br.push(d[k]); bgc.push(d[k + 1]); bb.push(d[k + 2]); }
  const med = (a) => { a.sort((u, v) => u - v); return a[a.length >> 1]; };
  const mr = med(br), mg = med(bgc), mb = med(bb);
  const dist = new Float32Array(n * n); let mx = 0;
  const inner = (R * 0.75) ** 2;
  for (let i = 0; i < n * n; i++) { const k = i * 4, v = Math.hypot(d[k] - mr, d[k + 1] - mg, d[k + 2] - mb); dist[i] = v; const x = i % n - R, y = ((i / n) | 0) - R; if (x * x + y * y <= inner && v > mx) mx = v; }
  if (mx < 35) return null;
  const thr = Math.max(28, mx * 0.45), lab = new Int32Array(n * n).fill(-1), blobs = [];
  for (let i = 0; i < n * n; i++) {
    if (dist[i] <= thr || lab[i] >= 0) continue;
    const id = blobs.length, q = [i]; lab[i] = id; let sx = 0, sy = 0, sw = 0, cnt = 0, peak = 0, edge = false, minx = n, maxx = 0, miny = n, maxy = 0;
    while (q.length) {
      const j = q.pop(), x = j % n, y = (j / n) | 0, w = dist[j] - thr * 0.8;
      sx += x * w; sy += y * w; sw += w; cnt++; if (dist[j] > peak) peak = dist[j];
      if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
      if (x === 0 || y === 0 || x === n - 1 || y === n - 1) edge = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue; const jj = yy * n + xx; if (dist[jj] > thr && lab[jj] < 0) { lab[jj] = id; q.push(jj); } }
    }
    const bw = maxx - minx + 1, bh = maxy - miny + 1;
    blobs.push({ cx: sx / sw, cy: sy / sw, cnt, peak, edge, round: Math.max(bw, bh) / Math.min(bw, bh) <= 2.5 && cnt / (bw * bh) >= 0.4 });
  }
  // a marker is a compact, roundish blob: not a speck, not most of the window, not an edge of clothing
  const ok = blobs.filter((b) => b.cnt >= 3 && b.cnt <= n * n * 0.35 && !b.edge && b.round);
  if (!ok.length) return null;
  const reach = opts.reach || R;
  let best = null, bs = -1;
  ok.forEach((b) => { const dd = Math.hypot(b.cx - R, b.cy - R); if (dd > reach) return; const sc = b.peak / (1 + dd / hm); if (sc > bs) { bs = sc; best = b; } });
  if (!best) return null;
  return [x0 + best.cx, y0 + best.cy];
}
export function snapPoint(p, img) { const c = findCentre(p, img); return c || p; }

// ---------- input ----------
function evPt(e) { const r = ov().getBoundingClientRect(); return [(e.clientX - r.left) / r.width * ov().width, (e.clientY - r.top) / r.height * ov().height]; }
export function nextMarker() { const fr = A.S.frames[A.cur] || {}; return points().find((m) => !fr[m]) || null; }
export function placePoint(p, m) {
  const S = A.S; m = m || A.activeMarker || nextMarker();
  if (!points().length) { status('Add your markers in the <strong>Markers</strong> tab first.'); return; }
  if (!m) { status('All markers are placed on this frame. Move to another frame, or drag a marker to adjust it.'); return; }
  let centred = false;
  if (S.snap) { const c = findCentre(p); if (c) { centred = Math.hypot(c[0] - p[0], c[1] - p[1]) > 0.5; p = c; } }
  if (!S.frames[A.cur]) S.frames[A.cur] = {};
  $('coords').textContent = S.snap ? (centred ? m + ' centred on the marker.' : m + ' placed where you clicked (no clear marker there to centre on).') : '';
  S.frames[A.cur][m] = [p[0], p[1]];
  A.fn.clearFlag(A.cur, m);
  A.lastAdded.push([A.cur, m]);
  A.activeMarker = nextMarker();
  persist(); renderChips(); updateDigiCount(); draw();
  if (A.fn.onTrackClick && A.fn.onTrackClick()) return;
  if (!A.activeMarker && S.advance) {
    const nf = A.cur + S.every;
    if (nf < A.nFrames) { seek(nf); A.activeMarker = nextMarker(); renderChips(); } else status('End of the video.');
  }
}
export function renderChips() {
  const fr = A.S.frames[A.cur] || {}, pts = points();
  if (A.activeMarker && !pts.includes(A.activeMarker)) A.activeMarker = null;
  if (!A.activeMarker) A.activeMarker = nextMarker();
  $('markerChips').innerHTML = pts.map((m) => '<button type="button" class="chip' + (m === A.activeMarker ? ' active' : '') + (fr[m] ? ' done' : '') + '" data-m="' + esc(m) + '"><span class="dot" style="background:' + colourOf(m) + '"></span>' + esc(m) + (fr[m] ? ' &#10003;' : '') + '</button>').join('');
  $('markerChips').querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => { A.activeMarker = b.getAttribute('data-m'); A.mode = 'digi'; renderChips(); draw(); }));
}
export function updateDigiCount() {
  const n = Object.keys(A.S.frames).filter((k) => Object.keys(A.S.frames[k]).length).length;
  $('digiCount').textContent = n + ' frame' + (n === 1 ? '' : 's') + ' with markers.';
}
export function undo() {
  const l = A.lastAdded.pop(); if (!l) return; const S = A.S;
  if (S.frames[l[0]]) { delete S.frames[l[0]][l[1]]; if (!Object.keys(S.frames[l[0]]).length) delete S.frames[l[0]]; }
  if (l[0] !== A.cur) seek(l[0]);
  A.activeMarker = l[1]; persist(); renderChips(); updateDigiCount(); draw();
}

const MEASURE = {
  dist: { n: 2, help: 'Click the two ends.', name: 'Distance' },
  angle: { n: 3, help: 'Click three points: end, joint, end (e.g. hip, knee, ankle).', name: 'Joint angle' },
  vert: { n: 2, help: 'Click the lower end, then the upper end (e.g. ankle, then knee).', name: 'Segment vs vertical' },
  horiz: { n: 2, help: 'Click the back end, then the front end (e.g. heel, then toe).', name: 'Segment vs horizontal' },
  inter: { n: 4, help: 'Click two points for the first line, then two points for the second line.', name: 'Angle between two lines' }
};
export function startMeasure(type) { if (!A.S.vw) return; A.mode = type; A.pending = []; $('mHelp').textContent = MEASURE[type].help; status(MEASURE[type].help); }
function finishMeasure() {
  const p = A.pending.slice(), type = A.mode, m = { frame: A.cur, type, pts: p };
  const W = p.map(toWorld); let txt;
  if (type === 'dist') { const d = Math.hypot(W[1][0] - W[0][0], W[1][1] - W[0][1]); txt = d.toFixed(A.S.calib ? 3 : 0) + ' ' + units(); m.value = d; }
  else if (type === 'angle') { m.value = jointAngle(W[0], W[1], W[2]); txt = m.value.toFixed(1) + '°'; }
  else if (type === 'vert') { m.value = segFromVertical(W[0], W[1]); txt = m.value.toFixed(1) + '°'; }
  else if (type === 'horiz') { m.value = segFromHorizontal(W[0], W[1]); txt = m.value.toFixed(1) + '°'; }
  else { const a1 = Math.atan2(W[1][1] - W[0][1], W[1][0] - W[0][0]), a2 = Math.atan2(W[3][1] - W[2][1], W[3][0] - W[2][0]); let d = Math.abs(a1 - a2) * 180 / Math.PI; if (d > 180) d = 360 - d; m.value = d; txt = d.toFixed(1) + '°'; }
  m.text = txt; A.S.measures.push(m); A.pending = []; A.mode = 'digi'; persist(); renderMeasures();
  status('Measured: <strong>' + txt + '</strong> at frame ' + A.cur + '.');
}
export function renderMeasures() {
  const S = A.S;
  if (!S.measures.length) { $('mTab').innerHTML = '<tr><td class="muted">No measurements yet.</td></tr>'; return; }
  $('mTab').innerHTML = '<tr><th>Name</th><th>Type</th><th>Frame</th><th>Time (s)</th><th>Value</th><th></th></tr>' + S.measures.map((m, i) =>
    '<tr><td><input type="text" class="mini" data-name="' + i + '" value="' + esc(m.label || '') + '" placeholder="e.g. Step 1" aria-label="Name"></td><td><a href="#" data-go="' + m.frame + '">' + MEASURE[m.type].name + '</a></td><td class="num">' + m.frame + '</td><td class="num">' + tReal(m.frame).toFixed(3) + '</td><td class="num"><strong>' + esc(m.text) + '</strong></td><td><button type="button" class="btn ghost small" data-del="' + i + '">Delete</button></td></tr>').join('');
  $('mTab').querySelectorAll('[data-go]').forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); seek(+a.getAttribute('data-go')); }));
  $('mTab').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { S.measures.splice(+b.getAttribute('data-del'), 1); persist(); renderMeasures(); draw(); }));
  $('mTab').querySelectorAll('[data-name]').forEach((inp) => inp.addEventListener('input', () => { S.measures[+inp.getAttribute('data-name')].label = inp.value; persist(); }));
}

function drawLoupe(p) {
  const lp = $('loupe'), lctx = lp.getContext('2d');
  if (!$('loupeOn').checked || !A.S.vw) { lp.style.display = 'none'; return; }
  lp.style.display = 'block';
  const z = 4, w = lp.width, disp = ov().getBoundingClientRect().width / ov().width, s = (w / z) / disp;
  lctx.save(); lctx.clearRect(0, 0, w, w); lctx.beginPath(); lctx.arc(w / 2, w / 2, w / 2, 0, 7); lctx.clip();
  try { lctx.drawImage(viewCanvas(), p[0] - s / 2, p[1] - s / 2, s, s, 0, 0, w, w); lctx.drawImage(ov(), p[0] - s / 2, p[1] - s / 2, s, s, 0, 0, w, w); } catch (e) { /* ignore */ }
  lctx.strokeStyle = '#facc15'; lctx.lineWidth = 1.5; lctx.beginPath(); lctx.moveTo(w / 2 - 12, w / 2); lctx.lineTo(w / 2 + 12, w / 2); lctx.moveTo(w / 2, w / 2 - 12); lctx.lineTo(w / 2, w / 2 + 12); lctx.stroke();
  lctx.restore();
  const wp = toWorld(p); $('coords').textContent = A.S.calib ? 'x ' + wp[0].toFixed(3) + ' m, y ' + wp[1].toFixed(3) + ' m' : 'x ' + Math.round(p[0]) + ' px, y ' + Math.round(p[1]) + ' px';
}

export function initOverlay() {
  const o = ov();
  o.addEventListener('pointerdown', (e) => {
    const S = A.S; if (!S.vw || A.busy) return;
    e.preventDefault();
    const p = evPt(e), r = rad();
    if (A.mode === 'digi') {
      const fr = S.frames[A.cur] || {}; let hit = null;
      points().forEach((m) => { if (fr[m] && Math.hypot(fr[m][0] - p[0], fr[m][1] - p[1]) < r * 2) hit = m; });
      if (hit) { A.drag = hit; A.activeMarker = hit; o.setPointerCapture(e.pointerId); renderChips(); draw(); return; }
      placePoint(p);
    } else if (A.mode === 'calib' || A.mode === 'origin') {
      if (A.mode === 'origin') { S.origin = p; A.pending = []; A.mode = 'digi'; persist(); status('Origin set.'); $('origStart').classList.remove('on'); A.fn.showCalib(); draw(); return; }
      A.pending.push(S.snap ? snapPoint(p) : p);
      if (A.pending.length === 2) {
        const len = parseFloat($('calLen').value);
        if (!(len > 0)) { status('Enter the real length first.'); A.pending = []; draw(); return; }
        S.calib = { p1: A.pending[0], p2: A.pending[1], len };
        A.pending = []; A.mode = 'digi'; $('calStart').classList.remove('on'); persist(); A.fn.showCalib();
        status('Calibrated. Turn on the grid to check it, then go to <strong>Digitise</strong>.');
        if (A.results) A.fn.compute();
      }
      draw();
    } else if (MEASURE[A.mode]) {
      A.pending.push(p);
      if (A.pending.length === MEASURE[A.mode].n) finishMeasure();
      draw();
    }
  });
  o.addEventListener('pointermove', (e) => { const p = evPt(e); if (A.drag) { A.S.frames[A.cur][A.drag] = p; draw(); } drawLoupe(p); });
  o.addEventListener('pointerup', () => { if (A.drag) { if (A.S.snap) A.S.frames[A.cur][A.drag] = snapPoint(A.S.frames[A.cur][A.drag]); A.fn.clearFlag(A.cur, A.drag); A.drag = null; persist(); A.fn.renderFlags(); draw(); } });
  o.addEventListener('pointerleave', () => { $('loupe').style.display = 'none'; });
  Object.keys(MEASURE).forEach((k) => { const b = $('m_' + k); if (b) b.addEventListener('click', () => startMeasure(k)); });
  $('undo').addEventListener('click', undo);
  $('clearFrame').addEventListener('click', () => { delete A.S.frames[A.cur]; A.activeMarker = null; persist(); renderChips(); updateDigiCount(); draw(); });
  $('clearAll').addEventListener('click', () => { if (!confirm('Remove all markers from every frame of this video?')) return; A.S.frames = {}; A.S.conf = {}; A.S.flags = {}; A.lastAdded = []; A.activeMarker = null; persist(); renderChips(); updateDigiCount(); A.fn.renderFlags(); draw(); });
}
