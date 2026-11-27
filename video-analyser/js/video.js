// Video loading, frame rendering (with rotate/flip), seeking and frame-rate detection.
import { A, $, status, esc, persist, freshState, fpsReal, tReal } from './state.js?v=2.4.0';
import { parseAvi, decodeFrame } from './avi.js?v=2.4.0';

const vid = () => $('vid');
let vctx = null, playing = false;
let mj = null; // an MJPEG AVI read frame by frame: { avi, bmp, shown, want, busy }

export function hasVideo() { return !!mj || !!vid().getAttribute('src'); }
export function clearVideo() {
  playing = false;
  if (mj && mj.bmp) mj.bmp.close();
  mj = null; vid().removeAttribute('src');
}
// Decode frame f of an AVI and show it (if frames are asked for faster than they decode, the latest wins).
function mjShow(f) {
  const m = mj; if (!m) return Promise.resolve();
  m.want = f;
  if (!m.busy) m.busy = (async () => {
    while (mj === m && m.shown !== m.want) {
      const k = m.want, b = await decodeFrame(m.avi, k);
      if (mj !== m) { b.close(); return; }
      if (m.bmp) m.bmp.close();
      m.bmp = b; m.shown = k; render(); if (A.fn.draw) A.fn.draw();
    }
  })().finally(() => { m.busy = null; });
  return m.busy;
}

export function viewDims(rot, w, h) { return (rot === 90 || rot === 270) ? [h, w] : [w, h]; }

export function render() {
  const S = A.S, v = vid(), cv = $('view');
  if (!S.srcW) return;
  if (cv.width !== S.vw || cv.height !== S.vh) { cv.width = S.vw; cv.height = S.vh; vctx = null; }
  if (!vctx) vctx = cv.getContext('2d', { willReadFrequently: true });
  const W = S.vw, H = S.vh;
  vctx.setTransform(1, 0, 0, 1, 0, 0);
  if (S.flip) { vctx.translate(W, 0); vctx.scale(-1, 1); }
  if (S.rot === 90) { vctx.translate(W, 0); vctx.rotate(Math.PI / 2); }
  else if (S.rot === 180) { vctx.translate(W, H); vctx.rotate(Math.PI); }
  else if (S.rot === 270) { vctx.translate(0, H); vctx.rotate(-Math.PI / 2); }
  try { vctx.drawImage(mj ? mj.bmp : v, 0, 0, S.srcW, S.srcH); } catch (e) { /* not ready */ }
  vctx.setTransform(1, 0, 0, 1, 0, 0);
}
// Pixels of the frame currently shown (after rotate/flip).
export function grab() {
  render();
  try { return vctx.getImageData(0, 0, A.S.vw, A.S.vh); }
  catch (e) {
    A.stopReq = true;
    status('<span class="bad"><strong>The browser will not let the tool read this video&rsquo;s pixels.</strong> Open the video with the &ldquo;Open a video&rdquo; button rather than from another website.</span>');
    throw e;
  }
}
export function viewCanvas() { return $('view'); }

export function recount() {
  const S = A.S;
  A.nFrames = mj ? mj.avi.frames.length : Math.max(1, Math.floor(S.duration * S.fps + 1e-6));
  $('slider').max = A.nFrames - 1;
  const to = $('trkTo');
  if (to) {
    to.max = A.nFrames - 1;
    if (!to.value || +to.value > A.nFrames - 1 || +to.value === A.lastMaxFrame) to.value = A.nFrames - 1;
  }
  A.lastMaxFrame = A.nFrames - 1;
  const r = fpsReal();
  $('effRate').textContent = 'Real capture rate: ' + (+r.toFixed(2)) + ' fps (one frame = ' + (1000 / r).toFixed(2) + ' ms)';
  const fs = r / S.every;
  $('sampleInfo').textContent = 'Clicking every ' + S.every + ' frame' + (S.every > 1 ? 's' : '') + ' = ' + (+fs.toFixed(1)) + ' samples per second';
}

// Load a video file into the trial state opts.state (a new blank state if none is given).
// MJPEG AVI files (lab cameras, Quintic) are read frame by frame; everything else goes to the video element.
export async function loadVideoFile(file, name, opts) {
  if (/\.avi$/i.test(name || file.name)) {
    let avi = null;
    try { avi = parseAvi(await file.arrayBuffer()); } catch (e) { avi = null; }
    if (avi) { loadAvi(avi, name, opts || {}); return; }
  }
  loadVideoURL(URL.createObjectURL(file), name, opts);
}
function loadAvi(avi, name, opts) {
  if (A.fn.stopTrackPause) A.fn.stopTrackPause();
  clearVideo();
  mj = { avi, bmp: null, shown: -1, want: -1, busy: null };
  const S = opts.state || freshState();
  if (S.aviFps !== avi.fps) { S.fps = avi.fps; S.fpsSet = true; S.aviFps = avi.fps; S.slow = 1; } // the frame rate is in the file
  ready(S, name, avi.frames.length / avi.fps, avi.width, avi.height,
    (opts.msg ? opts.msg + ' ' : 'Video loaded. ') + 'AVI read directly: <strong>' + avi.frames.length + ' frames at ' + (+avi.fps.toFixed(3)) + ' fps</strong> (from the file).');
}
function ready(S, name, duration, w, h, msg) {
  A.S = S;
  S.name = name; S.duration = duration; S.srcW = w; S.srcH = h;
  [S.vw, S.vh] = viewDims(S.rot, S.srcW, S.srcH);
  $('ov').width = S.vw; $('ov').height = S.vh;
  $('empty').classList.add('hide'); $('stage').classList.remove('hide');
  A.cur = 0; A.results = null; A.lastAdded = []; A.activeMarker = null;
  A.fn.syncInputs(); recount();
  seek(0); persist();
  status(msg);
  if (!S.fpsSet) detectFps(true);
  if (A.fn.afterLoad) A.fn.afterLoad();
}
export function loadVideoURL(url, name, opts) {
  opts = opts || {};
  const v = vid();
  if (A.fn.stopTrackPause) A.fn.stopTrackPause();
  if (mj) clearVideo();
  v.src = url;
  v.onloadedmetadata = () => {
    if (!v.videoWidth) { if (A.fn.videoError) A.fn.videoError(); return; } // no picture the browser can decode
    ready(opts.state || freshState(), name, v.duration, v.videoWidth, v.videoHeight, opts.msg || 'Video loaded (' + v.videoWidth + ' &times; ' + v.videoHeight + ' px).');
  };
}

export function seek(f) {
  const S = A.S, v = vid();
  if (!S.duration) return;
  f = Math.max(0, Math.min(A.nFrames - 1, Math.round(f)));
  A.cur = f;
  if (mj) { mjShow(f); $('slider').value = f; updateReadout(); return; }
  const t = Math.min((f + 0.5) / S.fps, Math.max(0, S.duration - 0.0005));
  if (Math.abs(v.currentTime - t) < 1e-6) { render(); A.fn.draw(); } else v.currentTime = t;
  $('slider').value = f;
  updateReadout();
}
export function updateReadout() {
  $('readout').innerHTML = 'Frame ' + A.cur + ' / ' + (A.nFrames - 1) + ' &nbsp;|&nbsp; Time ' + tReal(A.cur).toFixed(3) + ' s' + (A.S.slow > 1 ? ' (real time)' : '');
  if (A.fn.live) A.fn.live();
}
export async function seekAsync(f) {
  if (mj) {
    const m = mj; f = Math.max(0, Math.min(A.nFrames - 1, Math.round(f)));
    seek(f);
    while (mj === m && m.shown !== f) { m.want = f; await mjShow(f); }
    return;
  }
  return new Promise((res) => {
    const v = vid(); let done = false;
    const fin = () => { if (done) return; done = true; v.removeEventListener('seeked', onS); render(); res(); };
    const onS = () => {
      if ('requestVideoFrameCallback' in v) { v.requestVideoFrameCallback(() => fin()); setTimeout(fin, 60); }
      else setTimeout(fin, 40);
    };
    v.addEventListener('seeked', onS);
    const target = (Math.max(0, Math.min(A.nFrames - 1, f)) + 0.5) / A.S.fps;
    if (Math.abs(v.currentTime - target) < 1e-6) { seek(f); setTimeout(fin, 20); } else seek(f);
    setTimeout(fin, 2000);
  });
}

// ---------- playback ----------
export function play(rate, from, to) {
  if (mj) { playAvi(rate, from, to); return; }
  const v = vid(); if (!v.src) return;
  v.playbackRate = rate; playing = true;
  if (from !== undefined) { v.currentTime = (from + 0.5) / A.S.fps; }
  v.play().catch(() => { playing = false; });
  $('bPlay').textContent = 'Pause';
  const loop = () => {
    if (!playing) return;
    if (to !== undefined && v.currentTime >= (to + 0.5) / A.S.fps) v.currentTime = (from + 0.5) / A.S.fps;
    A.cur = Math.min(A.nFrames - 1, Math.floor(v.currentTime * A.S.fps));
    $('slider').value = A.cur; render(); A.fn.draw(); updateReadout();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
function playAvi(rate, from, to) {
  playing = true; $('bPlay').textContent = 'Pause';
  let t0 = performance.now(), f0 = from !== undefined ? from : A.cur;
  if (f0 >= A.nFrames - 1) f0 = 0;
  const loop = (now) => {
    if (!playing || !mj) return;
    let f = f0 + Math.floor((now - t0) / 1000 * A.S.fps * rate);
    if (to !== undefined && f > to) { t0 = now; f0 = from; f = from; }
    if (f >= A.nFrames - 1) { f = A.nFrames - 1; A.cur = f; seek(f); pause(); return; }
    A.cur = f; $('slider').value = f; mjShow(f); updateReadout();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
export function pause() {
  if (mj) { playing = false; $('bPlay').textContent = 'Play'; seek(A.cur); return; }
  const v = vid(); playing = false; v.pause(); $('bPlay').textContent = 'Play';
  if (A.S.duration) seek(Math.floor(v.currentTime * A.S.fps));
}
export function isPlaying() { return playing; }

// ---------- frame-rate detection (requestVideoFrameCallback) ----------
export function detectFps(silent) {
  if (mj) { if (!silent) status('This AVI file says <strong>' + mj.avi.fps + ' fps</strong>, so there is nothing to detect.'); return; }
  const v = vid();
  if (!v.src || !('requestVideoFrameCallback' in HTMLVideoElement.prototype)) { if (!silent) status('Frame-rate detection is not supported in this browser. Check the video details on your phone and type it in.'); return; }
  const times = [], startF = A.cur, wasMuted = v.muted;
  v.muted = true; v.playbackRate = 0.25;
  let finished = false;
  const finish = () => {
    if (finished) return; finished = true;
    v.pause(); v.muted = wasMuted;
    const d = []; for (let i = 1; i < times.length; i++) { const x = times[i] - times[i - 1]; if (x > 1e-4) d.push(x); }
    if (d.length < 5) { if (!silent) status('Could not detect the frame rate. Please type it in.'); seek(startF); return; }
    d.sort((a, b) => a - b);
    const est = 1 / d[Math.floor(d.length * 0.25)];
    const common = [24, 25, 30, 50, 60, 100, 120, 240, 480]; let best = common[0];
    common.forEach((c) => { if (Math.abs(c - est) < Math.abs(best - est)) best = c; });
    const use = Math.abs(best - est) / best < 0.06 ? best : Math.round(est);
    A.S.fps = use; A.S.fpsSet = true; A.fn.syncInputs(); recount(); persist(); seek(Math.min(startF, A.nFrames - 1));
    status('The video file says <strong>' + use + ' fps</strong>. If the clip plays in slow motion everywhere, it may have been saved slowed down: see <strong>Slowed down by</strong> in Setup.');
  };
  const cb = (now, md) => { times.push(md.mediaTime); if (times.length < 40 && !v.paused) v.requestVideoFrameCallback(cb); else finish(); };
  v.requestVideoFrameCallback(cb);
  v.play().catch(() => { if (!silent) status('Press Play once, then try Detect again.'); });
  setTimeout(() => { if (!finished) finish(); }, 4000);
}

export function initVideo() {
  const v = vid();
  v.addEventListener('seeked', () => { render(); A.fn.draw(); });
  v.addEventListener('pause', () => { if (playing) { playing = false; $('bPlay').textContent = 'Play'; } });
  window.__KVA_load = loadVideoURL;
  v.addEventListener('error', () => { if (!v.getAttribute('src')) return; if (A.fn.videoError) A.fn.videoError(); else status('<span class="bad"><strong>This video will not play in this browser.</strong></span>'); });
}
