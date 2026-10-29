// Key numbers under the graph, the full results table (tab 5), warnings and quality checks.
import { A, $, esc, download, baseName, trialLabel, currentTrial } from './state.js?v=1.0.0';
import { display, groupsFor } from './vars.js?v=1.0.0';
import { JUMPS, PHASES } from './analyse.js?v=1.0.0';

const GCOL = { Unweighting: PHASES.unweight.col, Braking: PHASES.brake.col, Propulsion: PHASES.prop.col, Landing: PHASES.land.col, Touchdown: '#2563eb', Outcome: '#1d4ed8', Body: '#64748b', 'Left vs right': '#0f766e' };
const open = new Set();

export function shown() { return A.V.filter((v) => v.level <= A.level); }

export function keyStats() {
  const el = $('keyStats'); if (!el) return;
  if (!A.R || !A.R.ok) { el.innerHTML = ''; return; }
  const list = A.V.filter((v) => v.key1 && v.level <= A.level);
  // a few more at higher levels
  const extra = { cmj: ['depth', 'ttt', 'rsimod', 'prop_imp', 'pp'], sj: ['pp', 'prop_imp', 'rfd100'], dj: ['vtd', 'depth', 'brk_imp', 'pp'] }[A.R.jump] || [];
  if (A.level >= 2) extra.forEach((k) => { const v = A.V.find((x) => x.key === k); if (v && v.level <= A.level && !list.includes(v)) list.push(v); });
  el.innerHTML = list.map((v) => {
    const d = display(v.type, v.value, A.units, A.R);
    return '<div class="stat' + (/jh_tov|rsi$|gct/.test(v.key) ? ' hl' : '') + '"><span>' + (v.short || v.name) + '</span><strong>' + d.val + '</strong> <small style="display:inline">' + d.unit + '</small></div>';
  }).join('');
}

export function warnings() {
  const el = $('warnBox'); if (!el) return;
  const R = A.R;
  if (!R) { el.innerHTML = ''; return; }
  if (!R.ok) { el.innerHTML = '<div class="warn"><p><strong>The trial could not be analysed.</strong> ' + R.error + '</p></div>'; return; }
  el.innerHTML = R.warnings.length ? '<div class="warn">' + R.warnings.map((w) => '<p>' + w + '</p>').join('') + '</div>' : '';
}

export function renderResults() {
  const el = $('resTab'); if (!el) return;
  const R = A.R;
  if (!R || !R.ok) { el.innerHTML = '<p class="muted">No results yet.</p>'; $('qualBox').innerHTML = ''; return; }
  const list = shown();
  let h = '<table class="restab"><thead><tr><th>Result</th><th style="text-align:right">Value</th><th>Units</th><th class="lv">Level</th></tr></thead><tbody>';
  groupsFor(R.jump).forEach((g) => {
    const vs = list.filter((v) => v.group === g); if (!vs.length) return;
    h += '<tr class="grp"><td colspan="4"><span class="swatch" style="background:' + (GCOL[g] || '#64748b') + '"></span>' + esc(g) + '</td></tr>';
    vs.forEach((v) => {
      const d = display(v.type, v.value, A.units, R);
      const on = open.has(v.key);
      h += '<tr class="vrow" data-k="' + v.key + '" tabindex="0" aria-expanded="' + on + '"><td>' + v.name + '</td><td class="val">' + d.val + '</td><td class="unit">' + d.unit + '</td><td class="lv"><span class="pill l' + v.level + '">' + ['', 'Year 1', 'Year 2', 'Year 3'][v.level] + '</span></td></tr>';
      if (on) h += '<tr class="how"><td colspan="4">' + v.how + '</td></tr>';
    });
  });
  h += '</tbody></table>';
  if (A.level < 3) h += '<p class="muted">More results are available at a higher level (top right).</p>';
  el.innerHTML = h;
  el.querySelectorAll('tr.vrow').forEach((tr) => {
    const tog = () => { const k = tr.getAttribute('data-k'); if (open.has(k)) open.delete(k); else open.add(k); renderResults(); };
    tr.addEventListener('click', tog);
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tog(); } });
  });
  quality();
}

function quality() {
  const R = A.R, el = $('qualBox'); const q = [];
  const ok = (good, txt) => q.push('<li>' + (good ? '&#10004; ' : '<span class="bad">&#9888;</span> ') + txt + '</li>');
  if (R.w && R.bwMode === 'auto') ok(R.wsd < 0.01 * R.BW && (R.w.e - R.w.s) >= 0.3 * R.fs, 'Weighing: ' + ((R.w.e - R.w.s) / R.fs).toFixed(2) + ' s of still standing, SD ' + R.wsd.toFixed(1) + ' N (' + (R.wsd / R.BW * 100).toFixed(2) + '% of bodyweight). Aim for about 1 s with an SD under 1% of bodyweight.');
  if (R.headerBW > 0 && R.bwMode === 'auto') ok(Math.abs(R.headerBW - R.BW) < 0.01 * R.BW, 'The body weight stored in the file is ' + R.headerBW.toFixed(1) + ' N, ' + Math.abs(R.headerBW - R.BW).toFixed(1) + ' N from the weighing (' + (Math.abs(R.headerBW - R.BW) / R.BW * 100).toFixed(2) + '%).');
  if (Number.isFinite(R.flightOffset)) ok(Math.abs(R.flightOffset) <= 5, 'In the air the plate read ' + R.flightOffset.toFixed(1) + ' N (should be about 0 N; SD ' + R.flightSD.toFixed(1) + ' N).');
  const jhT = A.V.find((v) => v.key === 'jh_tov'), jhF = A.V.find((v) => v.key === 'jh_ft');
  if (jhT && jhF && Number.isFinite(jhF.value)) {
    const d = (jhF.value - jhT.value) * 100;
    ok(Math.abs(d) < 3, 'Jump height from flight time is ' + (d >= 0 ? d.toFixed(1) + ' cm higher' : (-d).toFixed(1) + ' cm lower') + ' than from take-off velocity. A small difference is normal. Flight time comes out higher when the participant lands with bent knees or flat feet, because the centre of mass is lower at landing than at take-off.');
  }
  if (R.LD >= 0) {
    const tov = R.v[R.TO], vl = R.v[R.LD];
    ok(Math.abs(Math.abs(vl) - tov) < 0.25, 'Velocity at landing ' + vl.toFixed(2) + ' m/s vs take-off ' + tov.toFixed(2) + ' m/s. They are equal and opposite only if the body is in the same position at take-off and landing.');
  }
  if (R.jump !== 'dj') {
    const end = R.n - 1, vEnd = R.v[end];
    if (R.landEndI > 0 && end - R.landEndI > 0.5 * R.fs) ok(Math.abs(vEnd) < 0.2, 'Velocity at the end of the recording: ' + vEnd.toFixed(2) + ' m/s. After landing and standing still it should be about 0; drift here shows small errors in bodyweight adding up over a long integration.');
  }
  if (R.jump === 'dj' && R.integ.dir === 'backward' && R.vTDdrop) ok(Math.abs(R.vTD - R.vTDdrop) < 0.3, 'Touchdown velocity from backward integration (' + R.vTD.toFixed(2) + ' m/s) vs from the box height (' + R.vTDdrop.toFixed(2) + ' m/s).');
  ok(R.fs >= 500, 'Sample rate ' + R.fs + ' Hz.' + (R.fs < 500 ? ' 1000 Hz is better for timing events and peaks.' : ''));
  el.innerHTML = '<ul class="plain" style="display:block">' + q.join('') + '</ul>';
}

export function resultsCsv() {
  const R = A.R; if (!R || !R.ok) return;
  const t = currentTrial();
  const rows = [['participant', 'condition', 'trial', 'file', 'jump', 'phase', 'variable', 'value', 'units']];
  A.V.forEach((v) => { const d = display(v.type, v.value, A.units, R); rows.push([t.labels.athlete, t.labels.condition, t.labels.trial, t.name, JUMPS[R.jump], v.group, plain(v.name), d.val, plain(d.unit)]); });
  download(baseName() + '_results.csv', new Blob([toCsv(rows)], { type: 'text/csv' }));
}
export function plain(s) { const d = document.createElement('div'); d.innerHTML = s; return d.textContent; }
export function toCsv(rows) { return '﻿' + rows.map((r) => r.map((c) => { const s = String(c === undefined || c === null ? '' : c); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n'); }
export { trialLabel };
