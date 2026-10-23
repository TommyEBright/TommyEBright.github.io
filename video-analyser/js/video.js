// Video loading, frame rendering (with rotate/flip), seeking and frame-rate detection.
import { A, $, status, esc, persist, freshState, fpsReal, tReal } from './state.js?v=2.0.2';

const vid = () => $('vid');
let vctx = null, playing = false;

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
  try { vctx.drawImage(v, 0, 0, S.srcW, S.srcH); } catch (e) { /* not ready */ }
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
  A.nFrames = Math.max(1, Math.floor(S.duration * S.fps + 1e-6));
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

// Load a video into the trial state opts.state (a new blank state if none is given).
export function loadVideoURL(url, name, opts) {
  opts = opts || {};
  const v = vid();
  if (A.fn.stopTrackPause) A.fn.stopTrackPause();
  v.src = url;
  v.onloadedmetadata = () => {
    if (!v.videoWidth) { if (A.fn.videoError) A.fn.videoError(); return; } // no picture the browser can decode
    const S = opts.state || freshState();
    A.S = S;
    S.name = name; S.duration = v.duration; S.srcW = v.videoWidth; S.srcH = v.videoHeight;
    [S.vw, S.vh] = viewDims(S.rot, S.srcW, S.srcH);
    $('ov').width = S.vw; $('ov').height = S.vh;
    $('empty').classList.add('hide'); $('stage').classList.remove('hide');
    A.cur = 0; A.results = null; A.lastAdded = []; A.activeMarker = null;
    A.fn.syncInputs(); recount();
    seek(0); persist();
    status(opts.msg || 'Video loaded (' + S.srcW + ' &times; ' + S.srcH + ' px).');
    if (!S.fpsSet) detectFps(true);
    if (A.fn.afterLoad) A.fn.afterLoad();
  };
}

export function seek(f) {
  const S = A.S, v = vid();
  if (!S.duration) return;
  f = Math.max(0, Math.min(A.nFrames - 1, Math.round(f)));
  A.cur = f;
  const t = Math.min((f + 0.5) / S.fps, Math.max(0, S.duration - 0.0005));
  if (Math.abs(v.currentTime - t) < 1e-6) { render(); A.fn.draw(); } else v.currentTime = t;
  $('slider').value = f;
  updateReadout();
}
export function updateReadout() {
  $('readout').innerHTML = 'Frame ' + A.cur + ' / ' + (A.nFrames - 1) + ' &nbsp;|&nbsp; Time ' + tReal(A.cur).toFixed(3) + ' s' + (A.S.slow > 1 ? ' (real time)' : '');
  if (A.fn.live) A.fn.live();
}
export function seekAsync(f) {
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
export function pause() {
  const v = vid(); playing = false; v.pause(); $('bPlay').textContent = 'Play';
  if (A.S.duration) seek(Math.floor(v.currentTime * A.S.fps));
}
export function isPlaying() { return playing; }

// ---------- frame-rate detection (requestVideoFrameCallback) ----------
export function detectFps(silent) {
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
