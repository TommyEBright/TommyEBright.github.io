// Saving and exporting: project files, three kinds of CSV, images, graphs and the photo sequence.
import { A, $, esc, status, persist, migrate, points, tReal, fpsReal, download, baseName, VERSION, APP, currentTrial } from './state.js?v=2.1.1';
import { toWorld, units, scale } from './maths.js?v=2.1.1';
import { seekAsync, seek, viewCanvas } from './video.js?v=2.1.1';
import { draw } from './overlay.js?v=2.1.1';
import { svgToPng } from './charts.js?v=2.1.1';
import { summaryRows, xOffset } from './results.js?v=2.1.1';
import { intervalRows } from './events.js?v=2.1.1';

const n = (v, d) => (v === null || v === undefined || Number.isNaN(v) ? '' : (+v).toFixed(d));
const q = (s) => { s = String(s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const col = (s) => String(s).trim().replace(/[^\w]+/g, '_');
function csvBlob(lines) { return new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }); }
export function meta() {
  const S = A.S, k = scale();
  return [
    [APP, 'v' + VERSION],
    ['Video', S.name],
    ...(currentTrial() ? [['Participant', currentTrial().labels.athlete || ''], ['Condition', currentTrial().labels.condition || ''], ['Trial', currentTrial().labels.trial || '']] : []),
    ['Frame rate of file (fps)', S.fps], ['Slowed down by', S.slow], ['Real capture rate (fps)', fpsReal()],
    ['Calibration', S.calib ? S.calib.len + ' m = ' + Math.hypot(S.calib.p2[0] - S.calib.p1[0], S.calib.p2[1] - S.calib.p1[1]).toFixed(1) + ' px (' + (k * 1000).toFixed(3) + ' mm per px)' : 'none (pixels)'],
    ['Tilt correction', S.tilt && S.calib ? 'yes' : 'no'],
    ['Activity', S.activity], ['Participant facing', S.dir === 'right' ? 'right of screen' : S.dir === 'left' ? 'left of screen' : 'no fixed direction'], ['Axes', S.dir === 'none' ? 'x + to the right of the screen, y up +' : 'x forwards +, y up +'],
    ['Filter', S.filt ? 'Butterworth low-pass, 2nd order run forwards and backwards (zero lag), cut-off ' + S.cutoff + ' Hz' : 'none'],
    ['Derivatives', 'central (finite) differences of the filtered data'],
    ['Exported', new Date().toISOString()]
  ];
}

// 1. The analysis: filtered positions, velocities, accelerations and angles for every frame.
function analysisCSV() {
  if (!A.results) A.fn.compute(); const R = A.results; if (!R) { status('Nothing to export yet. Digitise some frames first.'); return; }
  const u = units(), mk = Object.keys(R.sers), allF = new Set();
  mk.forEach((m) => R.sers[m].F.forEach((f) => allF.add(f)));
  const F = [...allF].sort((a, b) => a - b), off = xOffset(), useOff = A.S.graph.xaxis === 'event' && off;
  const head = ['frame', 'time_s']; if (useOff) head.push('time_from_event_s');
  mk.forEach((m) => { const c = col(m); head.push(c + '_x_position_' + u, c + '_y_position_' + u, c + '_x_velocity_' + u + '_s', c + '_y_velocity_' + u + '_s', c + '_resultant_velocity_' + u + '_s', c + '_x_acceleration_' + u + '_s2', c + '_y_acceleration_' + u + '_s2', c + '_resultant_acceleration_' + u + '_s2', c + '_gap_filled'); });
  R.ang.forEach((a) => { const c = col(a.key); head.push(c + '_angular_position_deg', c + '_angular_velocity_deg_s', c + '_angular_acceleration_deg_s2'); });
  const idx = mk.map((m) => new Map(R.sers[m].F.map((f, i) => [f, i]))), aidx = R.ang.map((a) => new Map(a.F.map((f, i) => [f, i])));
  const lines = meta().map((r) => '# ' + r.map(q).join(',')); lines.push(head.join(','));
  F.forEach((f) => {
    const r = [f, n(tReal(f), 4)]; if (useOff) r.push(n(tReal(f) - off, 4));
    mk.forEach((m, k) => { const s = R.sers[m], i = idx[k].get(f); if (i === undefined) { r.push('', '', '', '', '', '', '', '', ''); return; } r.push(n(s.x[i], 5), n(s.y[i], 5), n(s.vx[i], 4), n(s.vy[i], 4), n(s.speed[i], 4), n(s.ax[i], 3), n(s.ay[i], 3), n(s.accMag[i], 3), s.filled[i] ? 1 : 0); });
    R.ang.forEach((a, k) => { const i = aidx[k].get(f); r.push(i === undefined ? '' : n(a.V[i], 2), i === undefined ? '' : n(a.W[i], 1), i === undefined ? '' : n(a.AA[i], 0)); });
    lines.push(r.join(','));
  });
  lines.push('', 'event,frame,time_s'); A.S.events.forEach((e) => lines.push(q(e.name) + ',' + e.frame + ',' + n(tReal(e.frame), 4)));
  download(baseName() + '_analysis.csv', csvBlob(lines));
  status('Downloaded <strong>' + esc(baseName()) + '_analysis.csv</strong> (filtered data for ' + mk.length + ' marker' + (mk.length > 1 ? 's' : '') + ' and ' + R.ang.length + ' angle' + (R.ang.length === 1 ? '' : 's') + ').');
}

// 2. Coordinates of chosen markers: raw pixels, raw metres and filtered, with where each one came from.
function coordsCSV() {
  const S = A.S, chosen = [...document.querySelectorAll('#expPts input:checked')].map((c) => c.value);
  if (!chosen.length) { status('Tick at least one marker to export.'); return; }
  const long = $('expLayout').value === 'long', u = units();
  if (!A.results) A.fn.compute();
  const R = A.results, fil = {};
  chosen.forEach((m) => { const s = R && R.sers[m]; if (s) fil[m] = new Map(s.F.map((f, i) => [f, [s.x[i], s.y[i], s.filled[i]]])); });
  const src = (f, m) => (S.conf[f] && S.conf[f][m] ? 'tracked' : 'clicked');
  const confv = (f, m) => { const c = S.conf[f] && S.conf[f][m]; return c ? c.s : ''; };
  const F = Object.keys(S.frames).map(Number).filter((f) => chosen.some((m) => S.frames[f] && S.frames[f][m])).sort((a, b) => a - b);
  // filled-gap frames have filtered values but no raw position; include them too
  chosen.forEach((m) => { if (fil[m]) fil[m].forEach((v, f) => { if (!F.includes(f)) F.push(f); }); }); F.sort((a, b) => a - b);
  const lines = meta().map((r) => '# ' + r.map(q).join(','));
  lines.push('# Pixel coordinates are in the picture as shown (after any rotate/flip), from the top-left corner, y down. Metre/world coordinates are x forwards, y up, from the origin.');
  if (long) {
    lines.push(['frame', 'time_s', 'marker', 'x_px', 'y_px', 'x_' + u, 'y_' + u, 'x_filtered_' + u, 'y_filtered_' + u, 'source', 'confidence', 'flag'].join(','));
    F.forEach((f) => chosen.forEach((m) => {
      const p = S.frames[f] && S.frames[f][m], fv = fil[m] && fil[m].get(f);
      if (p || fv) { const w = p ? toWorld(p) : null; const fl = (S.flags[f] || []).filter((x) => x.m === m).map((x) => x.msg).join('; '); lines.push([f, n(tReal(f), 4), q(m), p ? n(p[0], 2) : '', p ? n(p[1], 2) : '', w ? n(w[0], 5) : '', w ? n(w[1], 5) : '', fv ? n(fv[0], 5) : '', fv ? n(fv[1], 5) : '', p ? src(f, m) : 'gap filled', p ? confv(f, m) : '', q(fl)].join(',')); }
    }));
  } else {
    const head = ['frame', 'time_s'];
    chosen.forEach((m) => { const c = col(m); head.push(c + '_x_px', c + '_y_px', c + '_x_' + u, c + '_y_' + u, c + '_x_filtered_' + u, c + '_y_filtered_' + u, c + '_source', c + '_confidence'); });
    lines.push(head.join(','));
    F.forEach((f) => {
      const r = [f, n(tReal(f), 4)];
      chosen.forEach((m) => {
        const p = S.frames[f] && S.frames[f][m], w = p ? toWorld(p) : null, fv = fil[m] && fil[m].get(f);
        r.push(p ? n(p[0], 2) : '', p ? n(p[1], 2) : '', w ? n(w[0], 5) : '', w ? n(w[1], 5) : '', fv ? n(fv[0], 5) : '', fv ? n(fv[1], 5) : '', p ? src(f, m) : (fv ? 'gap filled' : ''), p ? confv(f, m) : '');
      });
      lines.push(r.join(','));
    });
  }
  download(baseName() + '_coordinates.csv', csvBlob(lines));
  status('Downloaded <strong>' + esc(baseName()) + '_coordinates.csv</strong> (' + chosen.length + ' marker' + (chosen.length > 1 ? 's' : '') + ', ' + F.length + ' frames, ' + (long ? 'one row per marker per frame' : 'one row per frame') + ').');
}

// 3. Summary: settings, key numbers, events, intervals and measurements.
function summaryCSV() {
  if (!A.results && Object.keys(A.S.frames).length) A.fn.compute();
  const S = A.S, lines = [];
  lines.push('section,item,value,note');
  meta().forEach((r) => lines.push(['settings', q(r[0]), q(r[1]), ''].join(',')));
  lines.push(['settings', 'Activity', S.activity, ''].join(','), ['settings', 'Markers', q(points().join(' ')), ''].join(','));
  summaryRows().forEach((r) => lines.push(['result', q(r[0]), q(r[1]), q(r[2] || '')].join(',')));
  S.events.forEach((e) => lines.push(['event', q(e.name), n(tReal(e.frame), 4), 'frame ' + e.frame].join(',')));
  intervalRows().forEach((iv) => lines.push(['interval', q(iv.label), n(iv.t, 4), q(iv.a.name + ' (frame ' + iv.a.frame + ') to ' + iv.b.name + ' (frame ' + iv.b.frame + ')')].join(',')));
  S.measures.forEach((m, i) => lines.push(['measurement', q(m.label || ('Measurement ' + (i + 1))), q(m.text), q(m.type + ' at frame ' + m.frame + ', ' + n(tReal(m.frame), 4) + ' s')].join(',')));
  download(baseName() + '_summary.csv', csvBlob(lines));
  status('Downloaded <strong>' + esc(baseName()) + '_summary.csv</strong>.');
}

// ---------- images ----------
function snapshot() {
  const S = A.S; if (!S.vw) return;
  const c = document.createElement('canvas'); c.width = S.vw; c.height = S.vh;
  const g = c.getContext('2d'); g.drawImage(viewCanvas(), 0, 0); g.drawImage($('ov'), 0, 0);
  c.toBlob((b) => download(baseName() + '_frame' + A.cur + '.png', b));
}
async function chartsPNG() {
  const ids = ['cPos', 'cVel', 'cAcc', 'cAng', 'cAngVel', 'cFilt', 'cResid', 'cResT', 'cCmp'];
  let k = 0;
  for (const id of ids) {
    const svg = $(id); if (!svg || !svg.innerHTML || svg.closest('.hide')) continue;
    const b = await svgToPng(svg, 2); if (b) { download(baseName() + '_' + id.slice(1) + '.png', b); k++; await new Promise((r) => setTimeout(r, 250)); }
  }
  status(k ? 'Downloaded ' + k + ' graph' + (k > 1 ? 's' : '') + '.' : 'Open the results first.');
}

// ---------- photo sequence ----------
function psFrames() {
  const S = A.S, how = $('psFrom').value;
  if (how === 'events') return [...new Set(S.events.map((e) => e.frame))].sort((a, b) => a - b);
  if (how === 'manual') return $('psList').value.split(/[\s,;]+/).map((x) => parseInt(x, 10)).filter((x) => !Number.isNaN(x) && x >= 0 && x < A.nFrames);
  const a = Math.max(0, parseInt($('psA').value, 10) || 0), b = Math.min(A.nFrames - 1, parseInt($('psB').value, 10) || A.nFrames - 1), k = Math.max(2, parseInt($('psN').value, 10) || 6);
  const out = []; for (let i = 0; i < k; i++) out.push(Math.round(a + (b - a) * i / (k - 1))); return [...new Set(out)];
}
export function renderPhotoOpts() {
  const how = $('psFrom').value;
  $('psRange').classList.toggle('hide', how !== 'range'); $('psManual').classList.toggle('hide', how !== 'manual');
  if (!$('psB').value && A.nFrames) $('psB').value = A.nFrames - 1;
  const F = psFrames(); $('psInfo').textContent = F.length ? F.length + ' picture' + (F.length > 1 ? 's' : '') + ': frames ' + F.slice(0, 16).join(', ') + (F.length > 16 ? '…' : '') : (how === 'events' ? 'Mark some events first.' : 'No frames chosen.');
}
async function photoSequence() {
  const S = A.S; if (!S.vw || A.busy) return;
  const F = psFrames(); if (!F.length) { status('Choose some frames for the photo sequence first.'); return; }
  A.busy = true; const back = A.cur;
  try {
    const cols = Math.max(1, parseInt($('psCols').value, 10) || Math.min(F.length, 4)), rows = Math.ceil(F.length / cols);
    const overlay = $('psOverlay').checked, crop = $('psCrop').checked, lab = $('psLabel').checked;
    // crop box: the same size on every picture, centred on the markers
    let cw = S.vw, ch = S.vh; const centres = {};
    if (crop) {
      let bw = 0, bh = 0;
      F.forEach((f) => { const p = Object.values(S.frames[f] || {}); if (p.length >= 2) { const xs = p.map((v) => v[0]), ys = p.map((v) => v[1]); bw = Math.max(bw, Math.max(...xs) - Math.min(...xs)); bh = Math.max(bh, Math.max(...ys) - Math.min(...ys)); centres[f] = [(Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2]; } });
      if (bh > 0) { ch = Math.min(S.vh, bh * 1.5); cw = Math.min(S.vw, Math.max(bw * 1.4, ch * 0.75)); }
    }
    const tileW = Math.min(640, Math.round(cw * Math.min(1, 1800 / (cols * cw)))), tileH = Math.round(tileW * ch / cw), gap = 6, fsz = Math.max(14, Math.round(tileW / 22)), labH = lab ? Math.round(fsz * 1.8) : 0;
    const out = document.createElement('canvas'); out.width = cols * tileW + (cols + 1) * gap; out.height = rows * (tileH + labH) + (rows + 1) * gap;
    const g = out.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, out.width, out.height);
    const tmp = document.createElement('canvas'); tmp.width = S.vw; tmp.height = S.vh; const tg = tmp.getContext('2d');
    for (let i = 0; i < F.length; i++) {
      const f = F[i]; await seekAsync(f);
      tg.drawImage(viewCanvas(), 0, 0); if (overlay) draw(tg, f);
      let sx = 0, sy = 0;
      if (crop) { const c = centres[f] || [S.vw / 2, S.vh / 2]; sx = Math.max(0, Math.min(S.vw - cw, c[0] - cw / 2)); sy = Math.max(0, Math.min(S.vh - ch, c[1] - ch / 2)); }
      const r = Math.floor(i / cols), c = i % cols, x = gap + c * (tileW + gap), y = gap + r * (tileH + labH + gap);
      g.drawImage(tmp, sx, sy, cw, ch, x, y, tileW, tileH);
      if (lab) {
        const names = S.events.filter((e) => e.frame === f).map((e) => e.name).join(' + ');
        g.fillStyle = '#1f2a33'; g.font = 'bold ' + fsz + 'px system-ui, Arial'; g.textBaseline = 'middle';
        g.fillText((i + 1) + '.  ' + tReal(f).toFixed(3) + ' s' + (names ? '  ' + names : ''), x + 4, y + tileH + labH / 2);
      }
      $('autoProg').style.width = Math.round(100 * (i + 1) / F.length) + '%';
    }
    $('autoProg').style.width = '0';
    const url = out.toDataURL('image/png');
    $('psPreview').innerHTML = '<img src="' + url + '" alt="Photo sequence">';
    out.toBlob((b) => download(baseName() + '_sequence.png', b));
    status('Photo sequence saved (' + F.length + ' pictures, ' + cols + ' across).');
  } finally { A.busy = false; seek(back); }
}

// ---------- project files (the whole session; videos are not included) ----------
function saveProject() {
  const j = { app: APP, appVersion: VERSION, saved: new Date().toISOString(), session: A.session };
  download('session_' + new Date().toISOString().slice(0, 10) + '_project.json', new Blob([JSON.stringify(j)], { type: 'application/json' }));
  status('Project saved. To carry on later, open the project file, then choose the same videos again.');
}
function loadProject(file) {
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const j = JSON.parse(rd.result);
      let ses = j.session;
      if (!ses && j.frames) ses = { trials: [{ id: 'old1', name: j.name || 'video', labels: { athlete: '', condition: '', trial: '1' }, state: j }], cur: 0 }; // single-video project from version 1
      if (!ses || !Array.isArray(ses.trials)) throw new Error('not a project');
      if (A.session.trials.length && !confirm('Replace the current session with the one in this file?')) return;
      ses.trials.forEach((t) => { t.state = migrate(t.state); });
      A.session = ses; A.files = {}; A.results = null;
      $('vid').removeAttribute('src'); $('stage').classList.add('hide'); $('empty').classList.remove('hide');
      persist(); A.fn.openTrial(Math.max(0, Math.min(ses.cur, ses.trials.length - 1)));
      if (A.fn.renderCompare) A.fn.renderCompare();
      status('Project loaded (' + ses.trials.length + ' trial' + (ses.trials.length > 1 ? 's' : '') + '). Choose the videos again to carry on digitising; results and Compare work straight away.');
    } catch (e) { status('That file could not be read as a project.'); }
  };
  rd.readAsText(file);
}
export function renderExportPoints() {
  $('expPts').innerHTML = points().map((m) => '<label class="inline"><input type="checkbox" value="' + esc(m) + '" checked> ' + esc(m) + '</label>').join('');
}

export function initExport() {
  if ($('csvAnalysis')) $('csvAnalysis').addEventListener('click', analysisCSV);
  $('csvCoords').addEventListener('click', coordsCSV);
  $('csvSummary').addEventListener('click', summaryCSV);
  $('snapBtn').addEventListener('click', snapshot);
  $('pngCharts').addEventListener('click', chartsPNG);
  $('saveProj').addEventListener('click', saveProject);
  $('loadProj').addEventListener('change', function () { const f = this.files[0]; if (f) loadProject(f); this.value = ''; });
  $('resetAll').addEventListener('click', () => {
    if (!confirm('Clear all markers, events and measurements for this video? (Markers, angles and settings are kept.)')) return;
    const S = A.S; S.frames = {}; S.conf = {}; S.flags = {}; S.events = []; S.intervals = []; S.measures = []; A.results = null;
    persist(); A.fn.syncInputs(); draw(); $('resBody').classList.add('hide');
  });
  ['psFrom', 'psA', 'psB', 'psN', 'psList'].forEach((id) => $(id).addEventListener('input', renderPhotoOpts));
  $('psGo').addEventListener('click', photoSequence);
  window.__KVA_export = { analysisCSV, coordsCSV, summaryCSV, photoSequence };
}
