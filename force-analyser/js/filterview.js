// Tab 3: what a low-pass filter does to the force signal, with residual analysis to suggest a cut-off.
import { A, $, persist } from './state.js?v=1.0.0';
import { Chart, frame, axes, line, range, hline } from './plot.js?v=1.0.0';
import { butter, residualCurve } from './maths.js?v=1.0.0';

let cF, cR, cT, resid = null, filt = null, filtKey = '';

function totalRaw() { return A.R.Fraw; }
function filtered() {
  const fc = A.S.set.filt.fc, key = A.S.id + '|' + fc + '|' + A.R.Fraw.length + '|' + A.R.used.join(',');
  if (filt && filtKey === key) return filt;
  filtKey = key; filt = butter(totalRaw(), fc, A.D.fs); return filt;
}
function idx() { const v = A.view, D = A.D; return [Math.max(0, Math.floor(v.x0 * D.fs)), Math.min(D.n - 1, Math.ceil(v.x1 * D.fs))]; }

function drawFilt(ctx, w, h) {
  if (!A.R || !A.R.ok) return null;
  const [i0, i1] = idx(), raw = totalRaw(), fl = filtered(), t = A.D.t;
  const yr = range([raw, fl], i0, i1, [], 0.06);
  const fr = frame(w, h, A.view.x0, A.view.x1, yr[0], yr[1], { L: 62 });
  axes(ctx, fr, { ylab: 'Force (N)', xlab: 'Time (s)' });
  line(ctx, fr, t, raw, { col: '#94a3b8', width: 1.3, i0, i1 });
  line(ctx, fr, t, fl, { col: '#1d4ed8', width: 2.2, i0, i1 });
  return fr;
}
function drawResid(ctx, w, h) {
  if (!resid) {
    const fr = frame(w, h, 0, 1, 0, 1); axes(ctx, fr, { ylab: 'Residual (N)', xlab: 'Cut-off (Hz)' });
    ctx.fillStyle = '#5b6770'; ctx.font = '13px system-ui, Arial'; ctx.textAlign = 'center'; ctx.fillText('Press "Suggest a cut-off" to run residual analysis', fr.L + fr.W / 2, fr.T + fr.H / 2);
    return fr;
  }
  const { F, R, a, slope, fc } = resid;
  const fr = frame(w, h, 0, F[F.length - 1], 0, Math.max(...R) * 1.08);
  axes(ctx, fr, { ylab: 'Residual (N)', xlab: 'Cut-off (Hz)' });
  ctx.save(); ctx.setLineDash([6, 4]); ctx.strokeStyle = '#9aa5ad'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(fr.X(0), fr.Y(a)); ctx.lineTo(fr.X(F[F.length - 1]), fr.Y(a + slope * F[F.length - 1])); ctx.stroke(); ctx.restore();
  line(ctx, fr, F, R, { col: '#1d4ed8', width: 2.2 });
  if (fc) { hline(ctx, fr, a, '#c0264d', [3, 3], 'suggested ' + fc + ' Hz'); ctx.save(); ctx.strokeStyle = '#c0264d'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(fr.X(fc), fr.T); ctx.lineTo(fr.X(fc), fr.T + fr.H); ctx.stroke(); ctx.restore(); }
  const cur = A.S.set.filt.fc; if (cur > 0 && cur <= F[F.length - 1]) { ctx.save(); ctx.strokeStyle = '#0f766e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(fr.X(cur), fr.T); ctx.lineTo(fr.X(cur), fr.T + fr.H); ctx.stroke(); ctx.restore(); }
  return fr;
}
function drawResT(ctx, w, h) {
  if (!A.R || !A.R.ok) return null;
  const [i0, i1] = idx(), raw = totalRaw(), fl = filtered(), t = A.D.t;
  const d = new Float64Array(raw.length); for (let i = i0; i <= i1; i++) d[i] = raw[i] - fl[i];
  const yr = range([d], i0, i1, [0], 0.08);
  const fr = frame(w, h, A.view.x0, A.view.x1, yr[0], yr[1], { L: 62 });
  axes(ctx, fr, { ylab: 'Raw − filtered (N)', xlab: 'Time (s)' });
  line(ctx, fr, t, d, { col: '#be185d', width: 1.3, i0, i1 });
  return fr;
}
function info() {
  const set = A.S.set, el = $('fcInfo');
  let rms = 0; const raw = totalRaw(), fl = filtered(); for (let i = 0; i < raw.length; i++) rms += (raw[i] - fl[i]) ** 2; rms = Math.sqrt(rms / raw.length);
  el.innerHTML = 'At ' + set.filt.fc + ' Hz the filter removes ' + rms.toFixed(1) + ' N (root mean square) from the whole trial. '
    + (set.filt.on ? '<strong>The analysis is using the filtered force.</strong>' : 'The analysis is using the raw (unfiltered) force.')
    + (resid && resid.fc ? ' Residual analysis suggests ' + resid.fc + ' Hz.' : '')
    + (set.filt.fc > A.D.fs / 2 * 0.95 ? ' <span class="bad">The cut-off must be below half the sample rate (' + (A.D.fs / 2) + ' Hz).</span>' : '');
}
function visible() { const p = document.querySelector('.pane[data-p="filter"]'); return p && !p.classList.contains('hide'); }
export function renderFilter() {
  if (!visible() || !A.R || !A.R.ok) return;
  [cF, cR, cT].forEach((c) => { c.resize(); c.render(); });
  info();
}
export function syncFilterInputs() { if (!A.S) return; $('filtOn').checked = !!A.S.set.filt.on; $('cutoff').value = A.S.set.filt.fc; resid = null; }
export function initFilter() {
  cF = new Chart($('cFilt'), { height: 260, draw: drawFilt });
  cR = new Chart($('cResid'), { height: 260, draw: drawResid });
  cT = new Chart($('cResT'), { height: 180, draw: drawResT });
  $('filtOn').addEventListener('change', function () { A.S.set.filt.on = this.checked; persist(); A.fn.refresh({ keepView: true }); });
  $('cutoff').addEventListener('change', function () { const v = parseFloat(this.value); if (!(v > 0)) return; A.S.set.filt.fc = v; persist(); if (A.S.set.filt.on) A.fn.refresh({ keepView: true }); else renderFilter(); });
  $('suggestFc').addEventListener('click', () => {
    if (!A.R || !A.R.ok) return;
    $('fcInfo').textContent = 'Working out the residual at each cut-off…';
    setTimeout(() => {
      // residual analysis over the jump itself (not the long still periods, which are mostly noise)
      const R = A.R, a = R.jump === 'dj' ? R.TD : R.onset, b = R.landEndI > 0 ? R.landEndI : Math.min(A.D.n - 1, R.TO + Math.round(0.3 * A.D.fs));
      resid = residualCurve(R.Fraw.slice(Math.max(0, a - 50), Math.min(A.D.n, b + 50)), A.D.fs);
      if (resid && resid.fc) { A.S.set.filt.fc = resid.fc; $('cutoff').value = resid.fc; persist(); if (A.S.set.filt.on) A.fn.refresh({ keepView: true }); }
      renderFilter();
    }, 30);
  });
}
