// Exports for one trial: continuous, discrete and time-normalised CSV; PNG graphs; a Word report; project files.
import { A, $, download, baseName, currentTrial, trialLabel, status, persist, VERSION } from './state.js?v=1.0.0';
import { JUMPS, phaseAt } from './analyse.js?v=1.0.0';
import { display, groupsFor } from './vars.js?v=1.0.0';
import { resample } from './maths.js?v=1.0.0';
import { toCsv, plain, resultsCsv, shown } from './results.js?v=1.0.0';
import { snapshotMain } from './trace.js?v=1.0.0';
import { snapshotInteg } from './integ.js?v=1.0.0';
import { canvasToBlob } from './plot.js?v=1.0.0';
import { zip } from './zip.js?v=1.0.0';

const ok = () => { if (!A.R || !A.R.ok) { status('<span class="bad">Nothing to export yet: the trial has not been analysed.</span>'); return false; } return true; };

function contCsv() {
  const R = A.R, D = A.D, n = D.n;
  const head = ['time_s'];
  R.plates.forEach((p) => { const nm = p.name.replace(/\W+/g, '_'); if (p.fx) head.push(nm + '_Fx_N'); if (p.fy) head.push(nm + '_Fy_N'); head.push(nm + '_Fz_N'); });
  head.push('total_Fz_raw_N', 'total_Fz_analysed_N', 'net_force_N', 'acceleration_m_s2', 'velocity_m_s', 'displacement_m', 'power_W', 'phase');
  const rows = [head];
  for (let i = 0; i < n; i++) {
    const r = [D.t[i].toFixed(4)];
    R.plates.forEach((p) => { if (p.fx) r.push(p.fx[i].toFixed(2)); if (p.fy) r.push(p.fy[i].toFixed(2)); r.push(p.fz[i].toFixed(2)); });
    const ph = phaseAt(R, i);
    r.push(R.Fraw[i].toFixed(2), R.F[i].toFixed(2), (R.F[i] - R.BW).toFixed(2), R.a[i].toFixed(4), R.v[i].toFixed(5), R.s[i].toFixed(5), R.P[i].toFixed(1), ph ? ph.name : '');
    rows.push(r);
  }
  return toCsv(rows);
}
function normCsv() {
  const R = A.R, a = R.jump === 'dj' ? R.TD : R.onset, b = R.TO, n = b - a;
  const x = [], ys = { F: [], v: [], s: [], P: [] };
  for (let i = a; i <= b; i++) { x.push((i - a) / n * 100); ys.F.push(R.F[i]); ys.v.push(R.v[i]); ys.s.push(R.s[i]); ys.P.push(R.P[i]); }
  const xs = Array.from({ length: 101 }, (_, j) => j);
  const r = { F: resample(x, ys.F, xs), v: resample(x, ys.v, xs), s: resample(x, ys.s, xs), P: resample(x, ys.P, xs) };
  const rows = [['percent', 'force_N', 'force_N_kg', 'velocity_m_s', 'displacement_m', 'power_W']];
  xs.forEach((p, j) => rows.push([p, r.F[j].toFixed(2), (r.F[j] / R.m).toFixed(4), r.v[j].toFixed(5), r.s[j].toFixed(5), r.P[j].toFixed(1)]));
  return toCsv(rows);
}

// ---------- Word report ----------
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const run = (txt, o) => '<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>' + (o && o.b ? '<w:b/>' : '') + '<w:sz w:val="' + ((o && o.sz) || 22) + '"/>' + (o && o.col ? '<w:color w:val="' + o.col + '"/>' : '') + '</w:rPr><w:t xml:space="preserve">' + xmlEsc(txt) + '</w:t></w:r>';
const para = (runs, o) => '<w:p><w:pPr><w:spacing w:after="' + ((o && o.after) !== undefined ? o.after : 120) + '"/>' + (o && o.keep ? '<w:keepNext/>' : '') + '</w:pPr>' + runs + '</w:p>';
function cell(txt, o) { return '<w:tc><w:tcPr><w:tcW w:w="' + o.w + '" w:type="dxa"/>' + (o.shade ? '<w:shd w:val="clear" w:color="auto" w:fill="' + o.shade + '"/>' : '') + '</w:tcPr><w:p><w:pPr><w:spacing w:after="0"/>' + (o.right ? '<w:jc w:val="right"/>' : '') + '</w:pPr>' + run(txt, { b: o.b, sz: 20 }) + '</w:p></w:tc>'; }
function image(rid, wPx, hPx, id, name) {
  const cx = Math.round(6.3 * 914400), cy = Math.round(cx * hPx / wPx);
  return '<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:docPr id="' + id + '" name="' + name + '"/>'
    + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + '<pic:nvPicPr><pic:cNvPr id="' + id + '" name="' + name + '"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
    + '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
}
async function docx() {
  const R = A.R, t = currentTrial();
  const c1 = snapshotMain(1100, 470), c2 = snapshotInteg(1100);
  const [b1, b2] = await Promise.all([canvasToBlob(c1), canvasToBlob(c2)]);
  const img1 = new Uint8Array(await b1.arrayBuffer()), img2 = new Uint8Array(await b2.arrayBuffer());
  let body = '';
  body += para(run('Force–time analysis: ' + JUMPS[R.jump], { b: true, sz: 32 }), { after: 60 });
  body += para(run(trialLabel(t) + ' (' + t.name + ')', { sz: 22, col: '555555' }));
  const meth = 'Bodyweight ' + R.BW.toFixed(1) + ' N (' + R.bwSource + '); body mass ' + R.m.toFixed(1) + ' kg. Sample rate ' + R.fs + ' Hz. Contact threshold ' + A.S.set.thr + ' N. '
    + (R.jump === 'dj' ? 'Touchdown velocity from ' + (R.integ.dir === 'backward' ? 'backward integration from still standing after landing' : 'the drop height (' + A.S.set.drop + ' m)') + '. ' : 'Start of movement: bodyweight ' + (R.jump === 'cmj' ? '−' : '+') + ' ' + A.S.set.onsetK + ' SD, minus ' + A.S.set.onsetBack + ' ms. ')
    + 'Integration: ' + (R.integ.method === 'rect' ? 'rectangles (Riemann sum)' : 'trapezoid rule') + '. Force ' + (R.filtered ? 'filtered (low-pass Butterworth, ' + A.S.set.filt.fc + ' Hz)' : 'not filtered') + '.';
  body += para(run('Method. ', { b: true }) + run(meth));
  body += para(run('Force–time curve', { b: true, sz: 26 }), { keep: true });
  body += image('rIdImg1', c1.width, c1.height, 1, 'force');
  body += para(run('Shaded areas: phases (' + R.phases.map((p) => p.name.toLowerCase()).join(', ') + '); green/blue between the curve and bodyweight = net impulse.', { sz: 18, col: '555555' }));
  // results table
  body += para(run('Results', { b: true, sz: 26 }), { keep: true });
  const W = [5200, 2000, 1800];
  let tb = '<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => '<w:' + s + ' w:val="single" w:sz="4" w:color="BBBBBB"/>').join('') + '</w:tblBorders></w:tblPr><w:tblGrid>' + W.map((w) => '<w:gridCol w:w="' + w + '"/>').join('') + '</w:tblGrid>';
  tb += '<w:tr>' + cell('Result', { w: W[0], b: true, shade: 'E8EDF2' }) + cell('Value', { w: W[1], b: true, shade: 'E8EDF2', right: true }) + cell('Units', { w: W[2], b: true, shade: 'E8EDF2' }) + '</w:tr>';
  const list = shown();
  groupsFor(R.jump).forEach((g) => {
    const vs = list.filter((v) => v.group === g); if (!vs.length) return;
    tb += '<w:tr>' + cell(g, { w: W[0], b: true, shade: 'F4F6F8' }) + cell('', { w: W[1], shade: 'F4F6F8' }) + cell('', { w: W[2], shade: 'F4F6F8' }) + '</w:tr>';
    vs.forEach((v) => { const d = display(v.type, v.value, A.units, R); tb += '<w:tr>' + cell(plain(v.name), { w: W[0] }) + cell(plain(d.val), { w: W[1], right: true }) + cell(plain(d.unit), { w: W[2] }) + '</w:tr>'; });
  });
  tb += '</w:tbl>';
  body += tb + para('', { after: 120 });
  body += para(run('From force to displacement', { b: true, sz: 26 }), { keep: true });
  body += para(run('Net force = force − bodyweight; acceleration = net force ÷ mass; velocity and displacement by numerical integration (Robertson et al., 2014).', { sz: 20 }));
  body += image('rIdImg2', c2.width, c2.height, 2, 'integration');
  if (R.warnings.length) { body += para(run('Notes', { b: true, sz: 24 }), { keep: true }); R.warnings.forEach((w) => { body += para(run('• ' + plain(w), { sz: 20 })); }); }
  body += para(run('Made with Force Analysis ' + VERSION + ' (Dr Tommy Bright). ' + new Date().toLocaleDateString('en-GB'), { sz: 16, col: '888888' }));
  const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>' + body + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>';
  const files = [
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/><Relationship Id="rIdImg2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image2.png"/></Relationships>' },
    { name: 'word/document.xml', data: doc },
    { name: 'word/media/image1.png', data: img1 },
    { name: 'word/media/image2.png', data: img2 }
  ];
  const blob = zip(files);
  return new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

// ---------- project files ----------
function projectJson() {
  const trials = A.session.trials.map((t) => Object.assign({}, t, { P: Object.assign({}, t.P, { data: t.P.data.map((c) => Array.from(c, (v) => Math.round(v * 1000) / 1000)) }), _sum: undefined }));
  return JSON.stringify({ app: 'Force Analysis', version: VERSION, saved: new Date().toISOString(), cur: A.session.cur, trials });
}
function openProject(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const j = JSON.parse(r.result);
      if (!j || !Array.isArray(j.trials)) throw new Error('not a Force Analysis project file');
      j.trials.forEach((t) => { t.P.data = t.P.data.map((c) => Float32Array.from(c)); });
      A.session = { trials: j.trials, cur: Math.max(0, Math.min(j.trials.length - 1, j.cur || 0)) };
      persist(); A.fn.openTrial(A.session.cur); status('Opened the project file (' + j.trials.length + ' trials).');
    } catch (e) { status('<span class="bad">Could not open that project file: ' + e.message + '</span>'); }
  };
  r.readAsText(file);
}

export function initExport() {
  $('xCont').addEventListener('click', () => { if (ok()) download(baseName() + '_continuous.csv', new Blob([contCsv()], { type: 'text/csv' })); });
  $('xDisc').addEventListener('click', () => { if (ok()) resultsCsv(); });
  $('resCsv').addEventListener('click', () => { if (ok()) resultsCsv(); });
  $('xNorm').addEventListener('click', () => { if (ok()) download(baseName() + '_time_normalised.csv', new Blob([normCsv()], { type: 'text/csv' })); });
  $('xPng').addEventListener('click', async () => { if (!ok()) return; download(baseName() + '_force_time.png', await canvasToBlob(snapshotMain(1400, 600))); });
  $('xPngI').addEventListener('click', async () => {
    if (!ok()) return;
    const was = document.querySelector('.pane[data-p="integ"]').classList.contains('hide');
    if (was) A.fn.showTab('integ');
    setTimeout(async () => { download(baseName() + '_force_to_displacement.png', await canvasToBlob(snapshotInteg(1200))); }, 60);
  });
  $('xDocx').addEventListener('click', async () => {
    if (!ok()) return;
    status('Building the Word report…');
    const was = document.querySelector('.pane[data-p="integ"]').classList.contains('hide');
    if (was) A.fn.showTab('integ');
    setTimeout(async () => {
      try { download(baseName() + '_report.docx', await docx()); status('Word report downloaded.'); }
      catch (e) { status('<span class="bad">Could not build the report: ' + e.message + '</span>'); }
      if (was) A.fn.showTab('files');
    }, 80);
  });
  $('xProj').addEventListener('click', () => { if (!A.session.trials.length) return; download('force_analysis_project.json', new Blob([projectJson()], { type: 'application/json' })); });
  $('projIn').addEventListener('change', function () { if (this.files[0]) openProject(this.files[0]); this.value = ''; });
}
