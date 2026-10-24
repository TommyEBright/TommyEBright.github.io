// Videos the browser cannot play (e.g. AVI from Quintic or lab cameras) are converted to MP4 (H.264)
// on the user's own computer with ffmpeg.wasm. Nothing is uploaded. Every frame is kept and the
// original frame rate is read from the file.
import { A, $, esc, status, persist, currentTrial, download } from './state.js?v=2.1.1';

const CORE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/';
let ff = null, loading = null;

// Download a file with progress, then hand it to the converter as a local blob URL.
async function blobURL(url, type, onPct) {
  const r = await fetch(url); if (!r.ok) throw new Error('download ' + r.status);
  const total = +r.headers.get('content-length') || 0, reader = r.body.getReader(), parts = []; let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; if (total && onPct) onPct(got / total); }
  return URL.createObjectURL(new Blob(parts, { type }));
}
function getFF(onPct) {
  if (ff) return Promise.resolve(ff);
  if (!loading) loading = (async () => {
    const { FFmpeg } = await import('./ffmpeg/index.js?v=2.1.1');
    const f = new FFmpeg(), base = window.KVA_FFMPEG_BASE || CORE;
    const coreURL = await blobURL(base + 'ffmpeg-core.js', 'text/javascript');
    const wasmURL = await blobURL(base + 'ffmpeg-core.wasm', 'application/wasm', onPct);
    await f.load({ coreURL, wasmURL });
    ff = f; return f;
  })().catch((e) => { loading = null; throw e; });
  return loading;
}

const ext = (n) => ((n || '').match(/\.([a-z0-9]+)$/i) || [])[1] || '';
function reason(name) {
  const e = ext(name).toLowerCase();
  if (e === 'avi') return 'AVI files (e.g. from Quintic or lab high-speed cameras) cannot be played in a web browser.';
  if (['wmv', 'mpg', 'mpeg', 'flv', '3gp', 'mts', 'm2ts', 'mxf'].includes(e)) return '.' + e.toUpperCase() + ' files cannot be played in a web browser.';
  if (['mov', 'mp4', 'm4v'].includes(e)) return 'This video uses a format your browser cannot play (often iPhone &ldquo;High Efficiency&rdquo; HEVC video on Windows).';
  return 'This video&rsquo;s format cannot be played in this browser.';
}
function bar(pct, label) { $('cvBar').style.width = Math.round(pct * 100) + '%'; if (label) $('cvInfo').innerHTML = label; }

// Shown in place of the video when it will not play.
export function videoError() {
  const t = currentTrial(); if (!t) return;
  const file = A.files[t.id];
  $('stage').classList.add('hide'); $('empty').classList.remove('hide');
  if (t.converted || !file) {
    $('empty').innerHTML = '<strong>This video still will not play.</strong><br>Try Chrome or Edge on a laptop, or convert it with HandBrake (see &ldquo;Before you film&rdquo; at the top of the page).';
    status('<span class="bad">This video will not play in this browser.</span>'); return;
  }
  $('empty').innerHTML = '<div class="convert"><p><strong>' + reason(t.name) + '</strong></p>' +
    '<p>The tool can convert it to MP4 here, on your computer (nothing is uploaded). Every frame is kept and the frame rate is read from the file.</p>' +
    '<button type="button" class="btn accent" id="cvGo">Convert to MP4</button>' +
    '<div class="progress" style="max-width:420px;margin:.8rem auto 0"><div id="cvBar"></div></div><p class="small" id="cvInfo"></p>' +
    '<p class="small muted" style="color:#94a3b8">The first conversion downloads the converter (about 31 MB), so it needs the internet once. Short clips then take a few seconds to a minute.</p></div>';
  $('cvGo').addEventListener('click', () => convert(t));
  status('<span class="bad">' + reason(t.name) + '</span> Press <strong>Convert to MP4</strong> to fix it here.');
}

async function convert(t) {
  const file = A.files[t.id]; if (!file || A.busy) return;
  A.busy = true; $('cvGo').disabled = true;
  try {
    bar(0, 'Getting the converter ready&hellip;');
    const f = await getFF((p) => bar(p * 0.3, 'Downloading the converter (first time only): ' + Math.round(p * 100) + '%'));
    let fps = null; const log = [];
    const onLog = ({ message }) => { log.push(message); const m = /Stream #0:\d+.*Video:.*?,\s*([\d.]+)\s*fps/.exec(message) || /Stream #0:\d+.*Video:.*?,\s*([\d.]+)\s*tbr/.exec(message); if (m && !fps) fps = parseFloat(m[1]); };
    const onProg = ({ progress }) => { if (progress >= 0 && progress <= 1) bar(0.3 + 0.7 * progress, 'Converting: ' + Math.round(progress * 100) + '%'); };
    f.on('log', onLog); f.on('progress', onProg);
    bar(0.3, 'Reading the video&hellip;');
    const inName = 'in.' + (ext(t.name) || 'avi');
    await f.writeFile(inName, new Uint8Array(await file.arrayBuffer()));
    const args = (sync) => ['-i', inName, '-map', '0:v:0', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-pix_fmt', 'yuv420p',
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', ...sync, '-an', '-movflags', '+faststart', 'out.mp4'];
    let code = await f.exec(args(['-fps_mode', 'passthrough']));
    if (code !== 0) code = await f.exec(args(['-vsync', '0']));
    f.off('log', onLog); f.off('progress', onProg);
    if (code !== 0) throw new Error(log.slice(-3).join(' '));
    const data = await f.readFile('out.mp4');
    try { await f.deleteFile(inName); await f.deleteFile('out.mp4'); } catch (e) { /* ignore */ }
    const name = t.name.replace(/\.[^.]+$/, '') + '.mp4';
    const out = new File([data.buffer], name, { type: 'video/mp4' });
    A.files[t.id] = out; t.original = t.name; t.name = name; t.converted = true;
    if (fps && fps > 0) { t.state.fps = Math.round(fps * 1000) / 1000; t.state.fpsSet = true; }
    persist(); A.busy = false;
    A.fn.openTrial(A.session.trials.indexOf(t));
    setTimeout(() => {
      status('Converted to <strong>' + esc(name) + '</strong>' + (fps ? ' at <strong>' + (+fps.toFixed(3)) + ' fps</strong> (read from the original file)' : '') + '. <a href="#" id="cvSave">Save the MP4</a> so you can open it straight away next time.');
      const a = $('cvSave'); if (a) a.addEventListener('click', (e) => { e.preventDefault(); download(name, out); });
    }, 400);
  } catch (e) {
    A.busy = false;
    bar(0, '<span class="bad">The conversion did not work' + (/download|fetch|Failed to fetch/i.test(String(e)) ? ': the converter could not be downloaded. Check your internet connection (or try off the university VPN).' : '.') + '</span> You can convert it with HandBrake instead (free): choose the &ldquo;Fast 1080p30&rdquo; preset, then in the Video tab set Framerate to &ldquo;Same as source&rdquo; and tick &ldquo;Constant Framerate&rdquo;.');
    const b = $('cvGo'); if (b) b.disabled = false;
    console.error(e);
  }
}

export function initConvert() { A.fn.videoError = videoError; }
