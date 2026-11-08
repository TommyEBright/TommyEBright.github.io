// Force platform data: loading a force file, the side-by-side sync view, the sync itself and the check.
// The sync is one number, the offset: video time = force file time + offset.
import { A, $, esc, status, persist, tReal, fpsReal, download, baseName } from './state.js?v=2.2.0';
import { parseText, buildData } from './forceparse.js?v=2.2.0';
import { seek, viewCanvas } from './video.js?v=2.2.0';

const F = () => A.S.force;
const V = { z: 1, cx: 0.5, cy: 0.5 }; // video view in the sync panel: zoom and centre (0-1)
const W = { t0: 0, t1: 0, cur: 0 }; // force view: time window (force file time) and cursor sample
let open = false, active = 'vid', checking = false, lastFo = null;

// ---------- the force signal ----------
export function forceSignal(fo) {
  fo = fo || F(); if (!fo || !fo.plates.length) return null;
  if (fo.use === 'sum' && fo.plates.length > 1) { const n = fo.plates[0].fz.length, a = new Array(n).fill(0); fo.plates.forEach((p) => p.fz.forEach((v, i) => { a[i] += v; })); return a; }
  const k = fo.use === 'sum' ? 0 : Math.min(+fo.use || 0, fo.plates.length - 1);
  return fo.plates[k].fz;
}
const tF = (i) => i / F().fs;
// Force (N) at a moment of video time, or null outside the recording or before syncing.
export function forceAtVideo(fo, tv, sig) {
  if (!fo || fo.offset === null || fo.offset === undefined) return null;
  sig = sig || forceSignal(fo); const x = (tv - fo.offset) * fo.fs, i = Math.floor(x);
  if (i < 0 || i >= sig.length - 1) return null;
  return sig[i] + (sig[i + 1] - sig[i]) * (x - i);
}
export function isSynced(fo) { fo = fo === undefined ? F() : fo; return !!(fo && fo.offset !== null && fo.offset !== undefined); }

// ---------- loading ----------
function loadText(text, name) {
  let P;
  try { P = parseText(text, name); } catch (e) { status('<span class="bad">' + esc(e.message || 'That file could not be read.') + '</span>'); return; }
  if (!(P.fs > 0)) { status('<span class="bad">The sample rate of this file could not be found. It needs a time column (in seconds) or a BioWare header.</span>'); return; }
  const D = buildData(P, P.plates, P.fs);
  if (!D.plates.length) { status('<span class="bad">No force columns were found in this file.</span>'); return; }
  if (F() && isSynced() && !confirm('Replace the force data (and its sync) for this trial?')) return;
  A.S.force = {
    name, fs: D.fs, n: D.n, bw: D.headerBW || 0, use: D.plates.length > 1 ? 'sum' : '0', offset: null, sync: null, check: null,
    plates: D.plates.map((p) => ({ name: p.name, fz: Array.from(p.fz, (v) => Math.round(v * 100) / 100) }))
  };
  W.t0 = 0; W.t1 = (D.n - 1) / D.fs; W.cur = 0; checking = false;
  persist(); renderForce();
  status('Force data loaded: <strong>' + esc(name) + '</strong> (' + D.n + ' samples at ' + (+D.fs.toFixed(2)) + ' Hz, ' + ((D.n - 1) / D.fs).toFixed(2) + ' s). ' + (P.warnings.length ? P.warnings.join(' ') + ' ' : '') + 'Now open the sync view.');
  if (A.S.duration) openView();
}
async function loadDemo() {
  try { const r = await fetch('demo/demo-cmj-force.txt'); if (!r.ok) throw new Error(r.status); loadText(await r.text(), 'demo-cmj-force.txt'); }
  catch (e) { status('The demo force file could not be loaded. It needs to sit in the <code>demo</code> folder next to this page.'); }
}

// ---------- the Force tab ----------
export function renderForce() {
  const fo = F();
  $('fOpts').classList.toggle('hide', !fo);
  if (!fo) { $('fInfo').textContent = 'No force data for this trial yet.'; closeView(); lastFo = null; return; }
  if (fo !== lastFo) { lastFo = fo; fitForce(); W.cur = 0; checking = false; }
  $('fInfo').innerHTML = '<strong>' + esc(fo.name) + '</strong>: ' + fo.n + ' samples at ' + (+fo.fs.toFixed(2)) + ' Hz (' + ((fo.n - 1) / fo.fs).toFixed(2) + ' s), ' + fo.plates.length + ' plate' + (fo.plates.length > 1 ? 's' : '') + (fo.bw ? ', body weight in the file ' + fo.bw.toFixed(0) + ' N' : '') + '.';
  $('fUse').innerHTML = (fo.plates.length > 1 ? '<option value="sum">All plates added together (Fz)</option>' : '') + fo.plates.map((p, i) => '<option value="' + i + '">' + esc(p.name) + ' Fz</option>').join('');
  $('fUse').value = fo.use;
  let t = '';
  if (isSynced(fo)) {
    const s = fo.sync;
    t = '<strong class="good">Synced</strong> at ' + esc(s.name) + ': video frame ' + s.frame + ' (' + tReal(s.frame).toFixed(3) + ' s) = force ' + (s.sample / fo.fs).toFixed(3) + ' s. ' + leadText(fo.offset) + ' ';
    t += fo.check ? checkText(fo.check) : 'Not checked at a second moment yet.';
    t += ' <button type="button" class="btn ghost small" id="fCsv">Download synced force (CSV)</button>';
  } else t = 'Not synced yet. Press <strong>Open the sync view</strong>.';
  $('fSyncInfo').innerHTML = t;
  if ($('fCsv')) $('fCsv').addEventListener('click', forceCSV);
  if (open) { drawForce(); renderSyncBar(); }
}
function leadText(off) {
  const a = Math.abs(off).toFixed(3);
  return off >= 0 ? 'The force recording started ' + a + ' s after the video.' : 'The force recording started ' + a + ' s before the video.';
}
function checkText(c) {
  const ms = c.diff * 1000, fr = c.diff * c.fps, a = Math.abs(fr);
  const head = 'Checked at ' + esc(c.name) + ': video and force differ by ' + Math.abs(ms).toFixed(1) + ' ms (' + a.toFixed(1) + ' frame' + (a.toFixed(1) === '1.0' ? '' : 's') + '). ';
  const gap = 'Between the two moments the video says ' + c.dv.toFixed(3) + ' s and the force says ' + c.df.toFixed(3) + ' s.';
  if (a <= 1) return head + '<strong class="good">Good: they agree to within one frame.</strong> ' + gap;
  if (a <= 2) return head + '<strong>Close: within two frames.</strong> Check both moments again frame by frame and sample by sample. ' + gap;
  const fit = c.df > 0 ? (c.frames / c.df) : 0;
  return head + '<strong class="bad">Too far apart.</strong> ' + gap + ' Check that both moments are the same in the video and the force. If they are, the frame rate in <strong>Setup</strong> may be wrong' + (fit ? ' (these moments fit a real capture rate of about ' + fit.toFixed(1) + ' fps, not ' + (+fpsReal().toFixed(2)) + ')' : '') + ', the clip may be slowed down, or the camera may have recorded at a varying frame rate (common on phones).';
}

// ---------- the sync view ----------
function openView() {
  if (!F()) return;
  if (!A.S.duration) { status('Load the video for this trial first.'); return; }
  open = true; $('fsCard').classList.remove('hide');
  if (!(W.t1 > W.t0)) fitForce();
  if (isSynced()) W.cur = Math.max(0, Math.min(F().n - 1, Math.round((tReal(A.cur) - F().offset) * F().fs)));
  setActive('vid'); renderSyncBar(); resize();
  $('fsCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function closeView() {
  open = false; checking = false; $('fsCard').classList.add('hide');
  if (document.fullscreenElement === $('fsCard')) document.exitFullscreen().catch(() => {});
  $('fsCard').classList.remove('fsmax');
}
function setActive(k) { active = k; $('fsVidPanel').classList.toggle('active', k === 'vid'); $('fsForPanel').classList.toggle('active', k === 'for'); }
function fitForce() { const fo = F(); if (!fo) return; W.t0 = 0; W.t1 = (fo.n - 1) / fo.fs; }

function sizeCanvas(cv) {
  const r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1, w = Math.max(10, Math.round(r.width * d)), h = Math.max(10, Math.round(r.height * d));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  return d;
}
function resize() { if (!open) return; mirror(); drawForce(); }

// The video side copies the main picture (with markers and lines) so everything stays in one place.
function vidRect(cv) {
  const S = A.S, s = Math.min(cv.width / S.vw, cv.height / S.vh) * V.z, w = S.vw * s, h = S.vh * s;
  return { s, x: cv.width / 2 - V.cx * w, y: cv.height / 2 - V.cy * h, w, h };
}
export function mirror() {
  if (!open || !A.S.vw) return;
  const cv = $('fsVid'); sizeCanvas(cv);
  const g = cv.getContext('2d'), R = vidRect(cv);
  g.fillStyle = '#111'; g.fillRect(0, 0, cv.width, cv.height);
  try { g.drawImage(viewCanvas(), R.x, R.y, R.w, R.h); g.drawImage($('ov'), R.x, R.y, R.w, R.h); } catch (e) { /* not ready */ }
  const fo = F(), fv = forceAtVideo(fo, tReal(A.cur));
  $('fsVidRead').innerHTML = 'Video: frame <strong>' + A.cur + '</strong> of ' + (A.nFrames - 1) + ', ' + tReal(A.cur).toFixed(3) + ' s' + (fv !== null ? ' &nbsp;|&nbsp; force here ' + fv.toFixed(1) + ' N' : '');
  if (isSynced() && $('fsLink').checked && !checking) { const k = Math.round((tReal(A.cur) - fo.offset) * fo.fs); if (k >= 0 && k < fo.n && k !== W.cur) { W.cur = k; keepInView(); } }
  drawForce();
}

// The force side: a zoomable force-time graph with a cursor that steps one sample at a time.
function plotBox(cv, d) { const L = 58 * d, R = 12 * d, T = 12 * d, B = 34 * d; return { L, T, w: cv.width - L - R, h: cv.height - T - B, d }; }
function niceStep(range, n) { const raw = range / (n || 6), p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p; }
function drawForce() {
  const fo = F(); if (!open || !fo) return;
  const cv = $('fsFor'), d = sizeCanvas(cv), g = cv.getContext('2d'), P = plotBox(cv, d), sig = forceSignal(fo);
  const i0 = Math.max(0, Math.floor(W.t0 * fo.fs)), i1 = Math.min(fo.n - 1, Math.ceil(W.t1 * fo.fs));
  let y0 = Infinity, y1 = -Infinity; for (let i = i0; i <= i1; i++) { if (sig[i] < y0) y0 = sig[i]; if (sig[i] > y1) y1 = sig[i]; }
  y0 = Math.min(y0, 0); if (!(y1 > y0)) y1 = y0 + 1; const pad = (y1 - y0) * 0.06; y0 -= pad; y1 += pad;
  const X = (t) => P.L + (t - W.t0) / (W.t1 - W.t0) * P.w, Y = (v) => P.T + P.h - (v - y0) / (y1 - y0) * P.h;
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
  g.font = (11 * d) + 'px system-ui, Arial'; g.fillStyle = '#5b6770'; g.strokeStyle = '#e5e9ec'; g.lineWidth = d;
  const ys = niceStep(y1 - y0, 5); g.textAlign = 'right'; g.textBaseline = 'middle';
  for (let v = Math.ceil(y0 / ys) * ys; v <= y1; v += ys) { g.beginPath(); g.moveTo(P.L, Y(v)); g.lineTo(P.L + P.w, Y(v)); g.stroke(); g.fillText(String(+v.toFixed(0)), P.L - 5 * d, Y(v)); }
  const xs = niceStep(W.t1 - W.t0, 7); g.textAlign = 'center'; g.textBaseline = 'top';
  for (let t = Math.ceil(W.t0 / xs) * xs; t <= W.t1 + 1e-9; t += xs) g.fillText(String(+t.toFixed(4)), X(t), P.T + P.h + 5 * d);
  g.fillStyle = '#1f2a33'; g.font = 'bold ' + (12 * d) + 'px system-ui, Arial'; g.fillText('Time in the force file (s)', P.L + P.w / 2, P.T + P.h + 18 * d);
  g.save(); g.translate(13 * d, P.T + P.h / 2); g.rotate(-Math.PI / 2); g.textBaseline = 'middle'; g.fillText('Vertical force (N)', 0, 0); g.restore();
  g.save(); g.beginPath(); g.rect(P.L, P.T, P.w, P.h); g.clip();
  g.strokeStyle = '#9aa5ad'; g.beginPath(); g.moveTo(P.L, Y(0)); g.lineTo(P.L + P.w, Y(0)); g.stroke();
  if (fo.bw) { g.setLineDash([6 * d, 4 * d]); g.beginPath(); g.moveTo(P.L, Y(fo.bw)); g.lineTo(P.L + P.w, Y(fo.bw)); g.stroke(); g.setLineDash([]); g.fillStyle = '#5b6770'; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.font = (11 * d) + 'px system-ui, Arial'; g.fillText('body weight', P.L + 4 * d, Y(fo.bw) - 2 * d); }
  // video events, once synced
  if (isSynced()) A.S.events.forEach((e) => { const t = tReal(e.frame) - fo.offset; if (t < W.t0 || t > W.t1) return; g.strokeStyle = '#e0a100'; g.setLineDash([4 * d, 3 * d]); g.beginPath(); g.moveTo(X(t), P.T); g.lineTo(X(t), P.T + P.h); g.stroke(); g.setLineDash([]); g.fillStyle = '#8a5d00'; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(e.name, X(t) + 3 * d, P.T + 3 * d); });
  g.strokeStyle = '#2563eb'; g.lineWidth = 2 * d; g.beginPath();
  const step = Math.max(1, Math.floor((i1 - i0) / (P.w * 2)));
  for (let i = i0; i <= i1; i += step) { const x = X(tF(i)), y = Y(sig[i]); if (i === i0) g.moveTo(x, y); else g.lineTo(x, y); }
  g.stroke();
  const px = P.w / Math.max(1, (W.t1 - W.t0) * fo.fs);
  if (px > 5) { g.fillStyle = '#2563eb'; for (let i = i0; i <= i1; i++) { g.beginPath(); g.arc(X(tF(i)), Y(sig[i]), Math.min(3.5, px / 4) * d, 0, 7); g.fill(); } }
  // where the current video frame falls, once synced
  if (isSynced()) { const t = tReal(A.cur) - fo.offset; if (t >= W.t0 && t <= W.t1) { g.strokeStyle = '#7c3aed'; g.lineWidth = 1.5 * d; g.setLineDash([3 * d, 3 * d]); g.beginPath(); g.moveTo(X(t), P.T); g.lineTo(X(t), P.T + P.h); g.stroke(); g.setLineDash([]); } }
  // the cursor
  const tc = tF(W.cur); g.strokeStyle = '#c0264d'; g.lineWidth = 2 * d; g.beginPath(); g.moveTo(X(tc), P.T); g.lineTo(X(tc), P.T + P.h); g.stroke();
  g.fillStyle = '#c0264d'; g.beginPath(); g.arc(X(tc), Y(sig[W.cur]), 4.5 * d, 0, 7); g.fill();
  g.restore();
  g.strokeStyle = '#222'; g.lineWidth = d; g.beginPath(); g.moveTo(P.L, P.T); g.lineTo(P.L, P.T + P.h); g.lineTo(P.L + P.w, P.T + P.h); g.stroke();
  $('fsForRead').innerHTML = 'Force: sample <strong>' + W.cur + '</strong> of ' + (fo.n - 1) + ', ' + tc.toFixed(4) + ' s, <strong>' + sig[W.cur].toFixed(1) + ' N</strong>' + (isSynced() ? ' &nbsp;|&nbsp; ' + (tc + fo.offset).toFixed(3) + ' s video time' : '') + (isSynced() ? ' &nbsp;<span class="muted">(purple dashes = the video frame)</span>' : '');
}
function keepInView() { const t = tF(W.cur), span = W.t1 - W.t0; if (t < W.t0 || t > W.t1) { W.t0 = t - span / 2; W.t1 = t + span / 2; clampWin(); } }
function clampWin() {
  const fo = F(), T = (fo.n - 1) / fo.fs; let span = Math.min(T, Math.max(10 / fo.fs, W.t1 - W.t0));
  if (W.t0 < 0) W.t0 = 0; W.t1 = W.t0 + span; if (W.t1 > T) { W.t1 = T; W.t0 = T - span; }
}
function zoomForce(k, about) {
  const t = about === undefined ? tF(W.cur) : about, a = (t - W.t0) * k, b = (W.t1 - t) * k;
  W.t0 = t - a; W.t1 = t + b; clampWin(); drawForce();
}
function stepForce(n) {
  const fo = F(); if (!fo) return;
  W.cur = Math.max(0, Math.min(fo.n - 1, W.cur + n)); keepInView();
  if (isSynced() && $('fsLink').checked && !checking) { const f = Math.round((tF(W.cur) + fo.offset) * fpsReal()); if (f !== A.cur) seek(f); }
  drawForce();
}
function stepVideo(n) { seek(A.cur + n); }

// ---------- sync and check ----------
function renderSyncBar() {
  const s = isSynced();
  $('fsLink').disabled = !s; $('fsCheck').disabled = !s; $('fsUnsync').disabled = !s;
  $('fsSync').textContent = s ? 'Sync again at these two points' : 'Sync at these two points';
  $('fsCheck').textContent = checking ? 'Done: compare here' : 'Check a second moment';
  $('fsCheck').classList.toggle('accent', checking);
  const fo = F(); let m;
  if (checking) m = 'Now move the video to a <strong>second moment</strong> you can see in both (e.g. landing, or the next foot contact), and the force cursor to the same moment. Then press <strong>Done: compare here</strong>.';
  else if (s) m = 'Synced at ' + esc(fo.sync.name) + '. ' + leadText(fo.offset) + ' ' + (fo.check ? checkText(fo.check) : 'Now press <strong>Check a second moment</strong> to make sure it holds.');
  else m = 'Move the video to a moment you can see in both (e.g. the last frame the feet are on the platform at take-off), and the force cursor to the same moment (e.g. where force drops to zero). Then press <strong>Sync at these two points</strong>.';
  $('fsMsg').innerHTML = m;
}
function doSync() {
  const fo = F(); if (!fo || !A.S.duration) return;
  fo.offset = tReal(A.cur) - tF(W.cur);
  fo.sync = { name: $('fsName').value, frame: A.cur, sample: W.cur }; fo.check = null; checking = false;
  $('fsLink').checked = true; persist(); renderForce(); renderSyncBar();
  if (A.fn.compute && Object.keys(A.S.frames).length) A.fn.compute();
  status('Synced. Force now appears in Results and in the exports.');
}
function doCheck() {
  const fo = F(); if (!isSynced(fo)) return;
  if (!checking) { checking = true; $('fsLink').checked = false; renderSyncBar(); return; }
  const fps = fpsReal(), dv = tReal(A.cur) - tReal(fo.sync.frame), df = tF(W.cur) - tF(fo.sync.sample);
  if (A.cur === fo.sync.frame) { status('Move the video to a different moment from the one you synced at.'); return; }
  fo.check = { name: $('fsName').value, frame: A.cur, sample: W.cur, diff: dv - df, dv: Math.abs(dv), df: Math.abs(df), fps, frames: Math.abs(A.cur - fo.sync.frame) };
  checking = false; $('fsLink').checked = true; persist(); renderForce(); renderSyncBar();
}
function unsync() { const fo = F(); if (!fo) return; fo.offset = null; fo.sync = null; fo.check = null; checking = false; persist(); renderForce(); renderSyncBar(); if (A.results) A.fn.compute(); }

// Arrow keys go to whichever side was clicked last.
export function forceKey(e) {
  if (!open || active !== 'for' || !F()) return false;
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); stepForce((e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 10 : 1)); return true; }
  return false;
}

// Synced force at its own sample rate, with video time and the nearest video frame.
function forceCSV() {
  const fo = F(); if (!isSynced(fo)) return;
  const sig = forceSignal(fo), fps = fpsReal(), q = (s) => (/[",\n]/.test(String(s)) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s));
  const lines = ['# Synced force: ' + q(fo.name) + ', ' + fo.fs + ' Hz. Video time = force time ' + (fo.offset < 0 ? '- ' : '+ ') + Math.abs(fo.offset).toFixed(5) + ' s (synced at ' + q(fo.sync.name) + ').', 'force_time_s,video_time_s,nearest_video_frame,vertical_force_N'];
  sig.forEach((v, i) => { const tv = tF(i) + fo.offset, f = Math.round(tv * fps); lines.push([tF(i).toFixed(5), tv.toFixed(5), f >= 0 && f < A.nFrames ? f : '', v.toFixed(2)].join(',')); });
  const n = baseName() + '_force_synced.csv'; download(n, new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })); status('Downloaded <strong>' + esc(n) + '</strong>.');
}

// ---------- full screen ----------
function toggleFull() {
  const c = $('fsCard');
  if (document.fullscreenElement === c || c.classList.contains('fsmax')) {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); c.classList.remove('fsmax'); afterFull(); return;
  }
  if (c.requestFullscreen) c.requestFullscreen().then(afterFull).catch(() => { c.classList.add('fsmax'); afterFull(); });
  else { c.classList.add('fsmax'); afterFull(); }
}
function afterFull() {
  const c = $('fsCard'), on = document.fullscreenElement === c || c.classList.contains('fsmax');
  c.classList.toggle('isfull', on); $('fsFull').textContent = on ? 'Exit full screen' : 'Full screen';
  setTimeout(resize, 60);
}

// ---------- pointer handling for both panels ----------
function initPanels() {
  const vc = $('fsVid'), fc = $('fsFor');
  let vd = null, fd = null;
  vc.addEventListener('wheel', (e) => {
    e.preventDefault(); const r = vc.getBoundingClientRect(), d = window.devicePixelRatio || 1, R = vidRect(vc);
    const px = (e.clientX - r.left) * d, py = (e.clientY - r.top) * d, ux = (px - R.x) / R.w, uy = (py - R.y) / R.h;
    const z0 = V.z; V.z = Math.max(1, Math.min(12, V.z * (e.deltaY < 0 ? 1.25 : 0.8)));
    const R2 = vidRect(vc); V.cx = ux + (vc.width / 2 - px) / R2.w; V.cy = uy + (vc.height / 2 - py) / R2.h; // keep the point under the mouse still
    if (V.z === 1) { V.cx = 0.5; V.cy = 0.5; } if (z0 !== V.z) mirror();
  }, { passive: false });
  vc.addEventListener('pointerdown', (e) => { setActive('vid'); vd = { x: e.clientX, y: e.clientY, cx: V.cx, cy: V.cy }; vc.setPointerCapture(e.pointerId); });
  vc.addEventListener('pointermove', (e) => { if (!vd) return; const R = vidRect(vc), d = window.devicePixelRatio || 1; V.cx = vd.cx - (e.clientX - vd.x) * d / R.w; V.cy = vd.cy - (e.clientY - vd.y) * d / R.h; mirror(); });
  vc.addEventListener('pointerup', () => { vd = null; });
  $('fsVidFit').addEventListener('click', () => { V.z = 1; V.cx = 0.5; V.cy = 0.5; mirror(); });
  $('fsVidIn').addEventListener('click', () => { V.z = Math.min(12, V.z * 1.5); mirror(); });
  $('fsVidOut').addEventListener('click', () => { V.z = Math.max(1, V.z / 1.5); if (V.z === 1) { V.cx = 0.5; V.cy = 0.5; } mirror(); });
  const tAt = (e) => { const r = fc.getBoundingClientRect(), d = window.devicePixelRatio || 1, P = plotBox(fc, d); return W.t0 + ((e.clientX - r.left) * d - P.L) / P.w * (W.t1 - W.t0); };
  fc.addEventListener('wheel', (e) => { e.preventDefault(); if (!F()) return; zoomForce(e.deltaY < 0 ? 0.7 : 1 / 0.7, tAt(e)); }, { passive: false });
  fc.addEventListener('pointerdown', (e) => { setActive('for'); if (!F()) return; fd = { x: e.clientX, t0: W.t0, t1: W.t1, moved: false }; fc.setPointerCapture(e.pointerId); });
  fc.addEventListener('pointermove', (e) => {
    if (!fd) return; const d = window.devicePixelRatio || 1, P = plotBox(fc, d), dx = (e.clientX - fd.x);
    if (Math.abs(dx) > 4) fd.moved = true; if (!fd.moved) return;
    const dt = -dx * d / P.w * (fd.t1 - fd.t0); W.t0 = fd.t0 + dt; W.t1 = fd.t1 + dt; clampWin(); drawForce();
  });
  fc.addEventListener('pointerup', (e) => { if (!fd) return; const was = fd.moved; fd = null; if (was) return; const fo = F(); W.cur = Math.max(0, Math.min(fo.n - 1, Math.round(tAt(e) * fo.fs))); stepForce(0); });
  $('fsVidPanel').addEventListener('focus', () => setActive('vid')); $('fsForPanel').addEventListener('focus', () => setActive('for'));
  document.querySelectorAll('[data-fv]').forEach((b) => b.addEventListener('click', () => { setActive('vid'); stepVideo(+b.getAttribute('data-fv')); }));
  document.querySelectorAll('[data-ff]').forEach((b) => b.addEventListener('click', () => { setActive('for'); stepForce(+b.getAttribute('data-ff')); }));
  $('fsZin').addEventListener('click', () => zoomForce(0.5)); $('fsZout').addEventListener('click', () => zoomForce(2)); $('fsFit').addEventListener('click', () => { fitForce(); drawForce(); });
}

export function initForce() {
  $('fFile').addEventListener('change', function () { const f = this.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => loadText(String(rd.result), f.name); rd.readAsText(f); this.value = ''; });
  $('fDemo').addEventListener('click', loadDemo);
  $('fUse').addEventListener('change', function () { if (!F()) return; F().use = this.value; persist(); drawForce(); if (A.results) A.fn.compute(); });
  $('fOpen').addEventListener('click', openView);
  $('fRemove').addEventListener('click', () => { if (!confirm('Remove the force data (and its sync) from this trial?')) return; A.S.force = null; persist(); renderForce(); if (A.results) A.fn.compute(); });
  $('fsClose').addEventListener('click', closeView);
  $('fsFull').addEventListener('click', toggleFull);
  document.addEventListener('fullscreenchange', afterFull);
  $('fsSync').addEventListener('click', doSync); $('fsCheck').addEventListener('click', doCheck); $('fsUnsync').addEventListener('click', unsync);
  $('fsLink').addEventListener('change', () => { if ($('fsLink').checked) mirror(); });
  initPanels();
  window.addEventListener('resize', resize);
  A.fn.fsMirror = mirror; A.fn.renderForce = renderForce;
}
