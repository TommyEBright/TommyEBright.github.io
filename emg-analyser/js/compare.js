// Compare trials: every task trial in the session, grouped by exercise (or participant), as a table,
// a bar chart (like the lab MATLAB figure) and the average waveforms on top of each other.
import { A, $, esc, muscle, muscleKeys, toCsv, download, trialLabel, SET, W } from './state.js?v=1.1.0';
import { Chart, frame, axes, line } from './plot.js?v=1.1.0';
import { analyse, curveBursts, burstTxt } from './emg.js?v=1.1.0';
import { compute, resultRows, mean, sd, bothOn } from './results.js?v=1.1.0';

let barChart = null, wfChart = null;
const f = (v, n) => (Number.isFinite(v) ? v.toFixed(n) : '&ndash;');
const GCOL = ['#1d4ed8', '#be185d', '#0f766e', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#65a30d', '#475569', '#ea580c'];
const METRICS = { mean: 'Mean', peak: 'Peak', iemg: 'iEMG' };

function groupKey(t) {
  const g = A.cmpGroup || 'condition', L = t.labels || {};
  return g === 'condition' ? (L.condition || 'No exercise label') : g === 'athlete' ? (L.athlete || 'No participant label') : g === 'both' ? [L.athlete || '?', L.condition || '?'].join(' · ') : 'All trials';
}

// Every task trial's analysis: per muscle, the values of each rep (or the whole trial if no reps).
export function sessionData() {
  const out = [];
  A.session.trials.forEach((t) => {
    if (t.role === 'mvic') return;
    const R = analyse(t); if (!R.ok) return;
    const type = R.reps.length ? 'reps' : 'whole', C = compute(R, type);
    const per = {};
    R.pr.ch.forEach((c, k) => {
      per[c.key] = { normed: !!R.N[k], mean: C.st.map((s) => s[k].mean), peak: C.st.map((s) => s[k].peak), iemg: C.st.map((s) => s[k].iemg), wf: C.wf && !C.wf[k].none ? C.wf[k] : null };
    });
    out.push({ t, R, type, n: C.W.length, per, unit: R.ni.unit, group: groupKey(t), len: R.reps.length ? mean(R.reps.map((r) => (r.i1 - r.i0) / R.fs)) : NaN, cyclic: R.cycles });
  });
  return out;
}

export function renderCompare() {
  const el = $('cmpBox');
  const D = sessionData();
  if (!D.length) { el.innerHTML = '<p class="muted">Add task trials (and their MVICs) to compare them. Label each trial&rsquo;s <strong>Exercise</strong> in the Session table so they can be grouped.</p>'; return; }
  const keys = muscleKeys().filter((k) => D.some((d) => d.per[k])), unit = D[0].unit, metric = A.cmpMetric || 'mean';
  const groups = []; D.forEach((d) => { if (!groups.includes(d.group)) groups.push(d.group); });
  let h = '<div class="row"><div><label for="cmpGroup">Group by</label><select id="cmpGroup">' + [['condition', 'Exercise or condition'], ['athlete', 'Participant'], ['both', 'Participant and condition'], ['none', 'No groups']].map(([v, l]) => '<option value="' + v + '"' + ((A.cmpGroup || 'condition') === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div>'
    + '<div><label for="cmpMetric">Show</label><select id="cmpMetric">' + Object.entries(METRICS).map(([v, l]) => '<option value="' + v + '"' + (metric === v ? ' selected' : '') + '>' + l + ' ' + (v === 'iemg' ? '(' + unit + '·s)' : unit) + '</option>').join('') + '</select></div></div>';
  if (D.some((d) => d.type === 'whole')) h += '<p class="muted">' + D.filter((d) => d.type === 'whole').map((d) => esc(trialLabel(d.t))).join(', ') + ': no reps marked, so the whole trial is used (it includes any rest, which lowers the mean).</p>';
  // table
  h += '<div class="tablewrap" style="max-height:440px"><table class="restab"><thead><tr><th>Trial</th><th>Group</th><th>' + W().Many + '</th>' + keys.map((k) => '<th style="color:' + muscle(k).col + '">' + esc(muscle(k).short) + '</th>').join('') + '</tr></thead><tbody>';
  groups.forEach((g) => {
    const rows = D.filter((d) => d.group === g);
    rows.forEach((d) => { h += '<tr><td>' + esc(trialLabel(d.t)) + '</td><td class="small">' + esc(g) + '</td><td class="num">' + (d.type === 'reps' ? d.n : 'whole') + '</td>' + keys.map((k) => { const p = d.per[k]; if (!p) return '<td></td>'; const v = p[metric]; return '<td class="num">' + f(mean(v), 1) + (v.length > 1 ? ' <span class="muted small">&plusmn; ' + f(sd(v), 1) + '</span>' : '') + (p.normed ? '' : ' <span class="muted small">µV</span>') + '</td>'; }).join('') + '</tr>'; });
    if (rows.length > 1 || groups.length > 1) h += '<tr class="grp"><td colspan="3">' + esc(g) + ': all ' + W().many + '</td>' + keys.map((k) => { const v = [].concat(...rows.map((d) => (d.per[k] ? d.per[k][metric] : []))); return '<td class="num">' + f(mean(v), 1) + ' &plusmn; ' + f(sd(v), 1) + '</td>'; }).join('') + '</tr>';
  });
  h += '</tbody></table></div><p class="muted small">Mean &plusmn; SD of the ' + W().many + '. ' + METRICS[metric] + ' in ' + (metric === 'iemg' ? unit + '·s' : unit) + '.</p>';
  h += '<h3>' + METRICS[metric] + ' for each ' + ((A.cmpGroup || 'condition') === 'athlete' ? 'participant' : 'exercise or condition') + '</h3><div id="cBar" class="chartbox"></div>';
  h += '<h3>Average waveforms</h3><div class="row tight"><label class="inline" for="cmpWfM" style="margin:0">Muscle</label><select id="cmpWfM" class="mini" style="width:auto">' + keys.map((k) => '<option value="' + esc(k) + '"' + (A.cmpWfM === k ? ' selected' : '') + '>' + esc(muscle(k).short) + '</option>').join('') + '</select><span class="muted small">Every ' + W().one + ' in each group, stretched to 0&ndash;100%, mean &plusmn; SD.</span></div><div id="cCmpWf" class="chartbox"></div><div class="legend" id="cmpLeg"></div>';
  if (keys.length >= 2) {
    const set = SET(), w1 = W().one;
    if (!keys.includes(set.pairA)) set.pairA = keys[0];
    if (!keys.includes(set.pairB) || set.pairB === set.pairA) set.pairB = keys.find((k) => k !== set.pairA);
    const T = timing(D, groups, set.pairA, set.pairB);
    h += '<h3>Timing and co-contraction for each group</h3><p class="muted" style="margin:.2rem 0">From each group&rsquo;s average ' + w1 + ' (every ' + w1 + ' in the group, 0&ndash;100%), so it works when each muscle is in its own file. On = above ' + set.onPct + '% of the muscle&rsquo;s average peak, for at least ' + set.onMinMs + ' ms. CI = co-contraction index of the two average curves (Falconer and Winter, 1985).</p>'
      + '<div class="row tight"><label class="inline" for="cpA" style="margin:0">Agonist</label><select id="cpA" class="mini" style="width:auto">' + keys.map((k) => '<option value="' + esc(k) + '"' + (k === set.pairA ? ' selected' : '') + '>' + esc(muscle(k).short) + '</option>').join('') + '</select><label class="inline" for="cpB" style="margin:0">Antagonist</label><select id="cpB" class="mini" style="width:auto">' + keys.map((k) => '<option value="' + esc(k) + '"' + (k === set.pairB ? ' selected' : '') + '>' + esc(muscle(k).short) + '</option>').join('') + '</select></div>'
      + '<div class="tablewrap" style="max-height:none"><table class="restab"><thead><tr><th>Group</th><th style="color:' + muscle(set.pairA).col + '">' + esc(muscle(set.pairA).short) + ' on (% of the ' + w1 + ')</th><th>active</th><th style="color:' + muscle(set.pairB).col + '">' + esc(muscle(set.pairB).short) + ' on</th><th>active</th><th>Both on</th><th>CI (%)</th></tr></thead><tbody>'
      + T.map((r) => '<tr><td>' + esc(r.g) + '</td>' + [r.a, r.b].map((x) => (x ? '<td class="small">' + (x.B.length ? x.B.map(burstTxt).join('; ') : '&ndash;') + '</td><td class="num">' + f(x.active, 0) + '%</td>' : '<td class="muted small" colspan="2">no ' + W().many + '</td>')).join('') + '<td class="num"><strong>' + f(r.both, 0) + (Number.isFinite(r.both) ? '%' : '') + '</strong></td><td class="num"><strong>' + f(r.ci, 1) + '</strong></td></tr>').join('')
      + '</tbody></table></div>';
  }
  h += '<h3>Download the whole session</h3><div class="row tight"><button class="btn small accent" id="cmpWide" type="button">Summary: one row per trial (CSV)</button><button class="btn small" id="cmpLong" type="button">Every result: one row per value (CSV)</button><button class="btn small" id="cmpWfCsv" type="button">Average waveforms (CSV)</button>' + (keys.length >= 2 ? '<button class="btn small" id="cmpTimCsv" type="button">Timing and co-contraction (CSV)</button>' : '') + '</div>'
    + '<p class="muted">Every file has participant, exercise and trial columns, so you can filter and group them in Excel, R or SPSS.</p>';
  el.innerHTML = h;
  if (!A.cmpWfM || !keys.includes(A.cmpWfM)) A.cmpWfM = keys[0];
  $('cmpGroup').addEventListener('change', function () { A.cmpGroup = this.value; renderCompare(); });
  $('cmpMetric').addEventListener('change', function () { A.cmpMetric = this.value; renderCompare(); });
  $('cmpWfM').addEventListener('change', function () { A.cmpWfM = this.value; wfChart.render(); });
  barChart = new Chart($('cBar'), { height: (w) => Math.max(260, Math.min(360, w * 0.38)), draw: (ctx, w, hh) => drawBars(ctx, w, hh, D, groups, keys, metric, unit) });
  wfChart = new Chart($('cCmpWf'), { height: (w) => Math.max(240, Math.min(340, w * 0.36)), draw: (ctx, w, hh) => drawGroupWf(ctx, w, hh, D, groups, unit) });
  $('cmpLeg').innerHTML = groups.map((g, j) => '<span><i class="key" style="border-color:' + GCOL[j % GCOL.length] + '"></i>' + esc(g) + '</span>').join('');
  $('cmpWide').addEventListener('click', () => download('emg_session_summary.csv', new Blob([toCsv(wideRows(D, keys))], { type: 'text/csv' })));
  $('cmpLong').addEventListener('click', () => { const rows = []; D.forEach((d, j) => { const r = resultRows(d.R, d.type, d.t.labels); rows.push(...(j ? r.slice(1) : r)); }); download('emg_session_results.csv', new Blob([toCsv(rows)], { type: 'text/csv' })); });
  if ($('cpA')) [['cpA', 'pairA'], ['cpB', 'pairB']].forEach(([id, k]) => $(id).addEventListener('change', function () { SET()[k] = this.value; renderCompare(); }));
  if ($('cmpTimCsv')) $('cmpTimCsv').addEventListener('click', () => download('emg_session_timing.csv', new Blob([toCsv(timingRows(D, groups))], { type: 'text/csv' })));
  $('cmpWfCsv').addEventListener('click', () => download('emg_session_waveforms.csv', new Blob([toCsv(wfRows(D, keys))], { type: 'text/csv' })));
}

// Each group's average cycle for a muscle (all its cycles pooled), with on/off from it.
function groupCurve(D, g, k) {
  const rows = D.filter((d) => d.group === g && d.per[k] && d.per[k].wf);
  const curves = [].concat(...rows.map((d) => d.per[k].wf.curves)); if (!curves.length) return null;
  const m = new Float64Array(101); for (let j = 0; j < 101; j++) m[j] = mean(curves.map((c) => c[j]));
  let pk = 0; for (let j = 0; j < 101; j++) pk = Math.max(pk, m[j]);
  const set = SET(), len = mean(rows.map((d) => d.len)), thr = pk * set.onPct / 100;
  return Object.assign(curveBursts(m, thr, set.onMinMs / 1000 / len * 100, rows.every((d) => d.cyclic)), { m, n: curves.length });
}
function timing(D, groups, kA, kB) {
  return groups.map((g) => {
    const a = groupCurve(D, g, kA), b = groupCurve(D, g, kB);
    let ci = NaN;
    if (a && b) { let c = 0, s2 = 0; for (let j = 0; j < 101; j++) { c += Math.min(a.m[j], b.m[j]); s2 += a.m[j] + b.m[j]; } ci = s2 > 0 ? 2 * c / s2 * 100 : NaN; }
    return { g, a, b, both: bothOn(a, b), ci };
  });
}
function timingRows(D, groups) {
  const set = SET(), keys = muscleKeys().filter((k) => D.some((d) => d.per[k]));
  const rows = [['group', 'muscle', 'cycles', 'active_pct', 'bursts_pct_of_cycle', 'paired_with', 'both_on_pct', 'co-contraction_index']];
  groups.forEach((g) => keys.forEach((k) => {
    const a = groupCurve(D, g, k); if (!a) return;
    const o = k === set.pairA ? set.pairB : k === set.pairB ? set.pairA : '', T = o ? timing(D, [g], set.pairA, set.pairB)[0] : null;
    rows.push([g, muscle(k).short, a.n, a.active.toFixed(1), a.B.map((b) => b.on + '-' + b.off).join('; '), o ? muscle(o).short : '', T && Number.isFinite(T.both) ? T.both.toFixed(1) : '', T && Number.isFinite(T.ci) ? T.ci.toFixed(2) : '']);
  }));
  return rows;
}

function drawBars(ctx, w, h, D, groups, keys, metric, unit) {
  const vals = groups.map((g) => keys.map((k) => { const v = [].concat(...D.filter((d) => d.group === g).map((d) => (d.per[k] ? d.per[k][metric] : []))); return { m: mean(v), s: sd(v), n: v.length }; }));
  let mx = 0; vals.forEach((r) => r.forEach((v) => { if (Number.isFinite(v.m)) mx = Math.max(mx, v.m + (Number.isFinite(v.s) ? v.s : 0)); }));
  const fr = frame(w, h, 0, groups.length, 0, (mx || 1) * 1.12, { L: 60, B: 46, T: 26 });
  axes(ctx, fr, { ylab: metric === 'iemg' ? unit + '·s' : unit, noX: true });
  if ((unit === '%MVIC' || unit === '% ref') && metric !== 'iemg') { const y = fr.Y(100); if (y > fr.T) { ctx.save(); ctx.strokeStyle = '#94a3b8'; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(fr.L, y); ctx.lineTo(fr.L + fr.W, y); ctx.stroke(); ctx.restore(); } }
  const gw = fr.W / groups.length, bw = Math.min(40, gw * 0.8 / keys.length);
  ctx.save(); ctx.font = '600 12px system-ui'; ctx.textAlign = 'center';
  groups.forEach((g, gi) => {
    const cx = fr.L + gw * (gi + 0.5);
    keys.forEach((k, j) => {
      const v = vals[gi][j]; if (!Number.isFinite(v.m)) return;
      const x = cx + (j - (keys.length - 1) / 2) * bw;
      ctx.fillStyle = muscle(k).col; ctx.fillRect(x - bw / 2 + 2, fr.Y(v.m), bw - 4, fr.Y(0) - fr.Y(v.m));
      if (Number.isFinite(v.s)) { ctx.strokeStyle = '#1f2a33'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, fr.Y(v.m)); ctx.lineTo(x, fr.Y(v.m + v.s)); ctx.moveTo(x - 4, fr.Y(v.m + v.s)); ctx.lineTo(x + 4, fr.Y(v.m + v.s)); ctx.stroke(); }
    });
    ctx.fillStyle = '#1f2a33'; const lab = g.length > 22 ? g.slice(0, 21) + '…' : g; ctx.fillText(lab, cx, fr.T + fr.H + 16);
  });
  let lx = fr.L + 6; ctx.textAlign = 'left'; ctx.font = '600 11.5px system-ui';
  keys.forEach((k) => { ctx.fillStyle = muscle(k).col; ctx.fillRect(lx, 8, 12, 10); ctx.fillStyle = '#1f2a33'; ctx.fillText(muscle(k).short, lx + 16, 17); lx += ctx.measureText(muscle(k).short).width + 34; });
  ctx.fillStyle = '#5b6770'; ctx.font = '11px system-ui'; ctx.textAlign = 'right'; ctx.fillText('mean ± SD of all ' + W().many + (metric !== 'iemg' ? (unit === '%MVIC' ? '; dashed = 100% MVIC' : unit === '% ref' ? '; dashed = the reference' : '') : ''), fr.L + fr.W, 17);
  ctx.restore();
  return fr;
}
function drawGroupWf(ctx, w, h, D, groups, unit) {
  const k = A.cmpWfM, x = Float64Array.from({ length: 101 }, (_, j) => j);
  const G = groups.map((g) => {
    const curves = [].concat(...D.filter((d) => d.group === g && d.per[k] && d.per[k].wf).map((d) => d.per[k].wf.curves));
    if (!curves.length) return null;
    const m = new Float64Array(101), s = new Float64Array(101);
    for (let j = 0; j < 101; j++) { const v = curves.map((c) => c[j]); m[j] = mean(v); s[j] = curves.length > 1 ? sd(v) : 0; }
    return { m, s, n: curves.length };
  });
  let mx = 0; G.forEach((g) => { if (g) for (let j = 0; j < 101; j++) mx = Math.max(mx, g.m[j] + g.s[j]); });
  const fr = frame(w, h, 0, 100, 0, (mx || 1) * 1.08, { L: 60 });
  axes(ctx, fr, { ylab: muscle(k).short + ' (' + unit + ')', xlab: '% of the ' + W().one, xGrid: true });
  if (unit === '% ref') { const y = fr.Y(100); if (y > fr.T) { ctx.save(); ctx.strokeStyle = '#94a3b8'; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(fr.L, y); ctx.lineTo(fr.L + fr.W, y); ctx.stroke(); ctx.restore(); } }
  G.forEach((g, j) => {
    if (!g) return; const col = GCOL[j % GCOL.length];
    ctx.save(); ctx.globalAlpha = 0.12; ctx.fillStyle = col; ctx.beginPath();
    for (let i = 0; i < 101; i++) ctx.lineTo(fr.X(i), fr.Y(g.m[i] + g.s[i]));
    for (let i = 100; i >= 0; i--) ctx.lineTo(fr.X(i), fr.Y(Math.max(0, g.m[i] - g.s[i])));
    ctx.closePath(); ctx.fill(); ctx.restore();
    line(ctx, fr, x, g.m, { col, width: 2.2 });
  });
  if (G.every((g) => !g)) { ctx.fillStyle = '#5b6770'; ctx.font = '13px system-ui'; ctx.fillText('Needs reps marked in the trials.', fr.L + 12, fr.T + 24); }
  return fr;
}

function wideRows(D, keys) {
  const head = ['participant', 'exercise', 'trial', 'file', 'windows', 'n'];
  keys.forEach((k) => { const s = muscle(k).short; head.push(s + '_peak', s + '_peak_SD', s + '_mean', s + '_mean_SD', s + '_iEMG', s + '_unit'); });
  const rows = [head];
  D.forEach((d) => {
    const L = d.t.labels, r = [L.athlete || '', L.condition || '', L.trial || '', d.t.name, d.type === 'reps' ? 'reps' : 'whole trial', d.n];
    keys.forEach((k) => { const p = d.per[k]; if (!p) { r.push('', '', '', '', '', ''); return; } r.push(fx(mean(p.peak)), fx(sd(p.peak)), fx(mean(p.mean)), fx(sd(p.mean)), fx(mean(p.iemg)), p.normed ? d.unit : 'µV'); });
    rows.push(r);
  });
  return rows;
}
function wfRows(D, keys) {
  const head = ['participant', 'exercise', 'trial', 'muscle', 'reps', 'statistic'].concat(Array.from({ length: 101 }, (_, j) => j + '%'));
  const rows = [head];
  D.forEach((d) => keys.forEach((k) => {
    const p = d.per[k]; if (!p || !p.wf) return; const L = d.t.labels;
    rows.push([L.athlete || '', L.condition || '', L.trial || '', muscle(k).short, p.wf.n, 'mean'].concat(Array.from(p.wf.mean, (v) => v.toFixed(3))));
    rows.push([L.athlete || '', L.condition || '', L.trial || '', muscle(k).short, p.wf.n, 'SD'].concat(Array.from(p.wf.sd, (v) => v.toFixed(3))));
  }));
  return rows;
}
const fx = (v) => (Number.isFinite(v) ? v.toFixed(3) : '');
export function barSnapshot() { return barChart ? barChart.snapshot(900, 420, 2) : null; }
