// Compare trials: a table of results for every trial with group means, overlaid curves and whole-session exports.
import { A, $, esc, download, trialLabel } from './state.js?v=1.0.0';
import { buildData } from './parse.js?v=1.0.0';
import { analyse, JUMP_SHORT } from './analyse.js?v=1.0.0';
import { computeVars, display } from './vars.js?v=1.0.0';
import { meanSD, resample } from './maths.js?v=1.0.0';
import { Chart, frame, axes, line, range } from './plot.js?v=1.0.0';
import { toCsv, plain } from './results.js?v=1.0.0';

const PAL = ['#2563eb', '#be185d', '#0f766e', '#d97706', '#7c3aed', '#0891b2', '#65a30d', '#dc2626', '#475569', '#c026d3'];
const DEFAULT = { cmj: ['jh_tov', 'jh_ft', 'ttt', 'rsimod', 'depth', 'prop_imp', 'pp'], sj: ['jh_tov', 'jh_ft', 'prop_mf', 'prop_imp', 'pp', 'rfd100'], dj: ['rsi', 'gct', 'jh_ft', 'jh_tov', 'vtd', 'pif'] };
const cache = new Map();
let chosen = null, chart = null, data = null;

function key(t) { return t.id + '|' + JSON.stringify(t.set) + '|' + JSON.stringify(t.map) + '|' + t.fs; }
export function analyseTrial(t) {
  const k = key(t); if (cache.has(k)) return cache.get(k);
  let out;
  try { const D = buildData(t.P, t.map, t.fs); const R = analyse(D, t.set); out = { D, R, V: R.ok ? computeVars(R, t.set) : [] }; }
  catch (e) { out = { R: { ok: false, error: e.message }, V: [] }; }
  cache.set(k, out); if (cache.size > 200) cache.delete(cache.keys().next().value);
  return out;
}
function groupOf(t) {
  const g = $('cmpGroup').value, L = t.labels;
  if (g === 'none') return 'All trials';
  if (g === 'athlete') return L.athlete || '(no participant)';
  if (g === 'condition') return L.condition || '(no condition)';
  return (L.athlete || '(no participant)') + ' · ' + (L.condition || '(no condition)');
}

export function renderCompare() {
  const T = A.session.trials;
  const msg = $('cmpMsg'), body = $('cmpBody');
  if (T.length < 2) { msg.innerHTML = 'Add two or more trials to compare them (e.g. several trials from one participant, or one from each). Label each trial with a participant and condition in the session table at the top.'; body.classList.add('hide'); return; }
  msg.innerHTML = ''; body.classList.remove('hide');
  data = T.map((t) => Object.assign({ t, g: groupOf(t) }, analyseTrial(t)));
  const jumps = [...new Set(T.map((t) => t.set.jump))];
  if (jumps.length > 1) msg.innerHTML = '<div class="warn"><p>This session mixes jump types (' + jumps.map((j) => JUMP_SHORT[j]).join(', ') + '). Only results that both have are compared.</p></div>';
  // metric chips
  const all = [];
  data.forEach((d) => d.V.forEach((v) => { if (v.level <= A.level && !all.find((x) => x.key === v.key)) all.push(v); }));
  if (!chosen) chosen = new Set(DEFAULT[jumps[0]] || DEFAULT.cmj);
  $('cmpMetrics').innerHTML = all.map((v) => '<button type="button" class="chip' + (chosen.has(v.key) ? ' active' : '') + '" data-m="' + v.key + '">' + (v.short || v.name) + '</button>').join('');
  $('cmpMetrics').querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { const k = b.getAttribute('data-m'); if (chosen.has(k)) chosen.delete(k); else chosen.add(k); renderCompare(); }));
  const cols = all.filter((v) => chosen.has(v.key));
  // table
  const groups = [...new Set(data.map((d) => d.g))];
  let h = '<table><thead><tr><th>Trial</th><th>Group</th>' + cols.map((c) => { const d = display(c.type, c.value, A.units, data[0].R.ok ? data[0].R : { m: 1, BW: 1 }); return '<th>' + (c.short || c.name) + ' <span class="muted">(' + d.unit + ')</span></th>'; }).join('') + '</tr></thead><tbody>';
  groups.forEach((g, gi) => {
    const rows = data.filter((d) => d.g === g);
    rows.forEach((d) => {
      h += '<tr><td>' + esc(trialLabel(d.t)) + (d.R.ok ? '' : ' <span class="bad">(' + esc(d.R.error || 'error') + ')</span>') + '</td><td><span class="swatch" style="background:' + PAL[gi % PAL.length] + '"></span>' + esc(g) + '</td>'
        + cols.map((c) => { const v = d.V.find((x) => x.key === c.key); return '<td class="num">' + (v ? display(v.type, v.value, A.units, d.R).val : '') + '</td>'; }).join('') + '</tr>';
    });
    if (rows.length > 1) {
      h += '<tr class="grp"><td colspan="2"><strong>' + esc(g) + ': mean &plusmn; SD</strong> (n = ' + rows.length + ')</td>' + cols.map((c) => {
        const vals = rows.map((d) => { const v = d.V.find((x) => x.key === c.key); return v ? display(v.type, v.value, A.units, d.R).num : NaN; });
        const s = meanSD(vals); const dp = (display(c.type, c.value, A.units, rows[0].R).val.split('.')[1] || '').length;
        return '<td class="num"><strong>' + (s.n ? s.m.toFixed(dp) + (s.n > 1 ? ' &plusmn; ' + s.s.toFixed(dp) : '') : '') + '</strong></td>';
      }).join('') + '</tr>';
    }
  });
  $('cmpTab').innerHTML = h + '</tbody></table>';
  if (chart) { chart.resize(); chart.render(); }
  legend(groups);
}

// ---------- curves ----------
function curveOf(d, v) {
  const R = d.R; if (!R.ok) return null;
  const k = v === 'F' ? (A.units === 'Nkg' ? R.m : A.units === 'BW' ? R.BW : 1) : v === 'P' ? (A.units === 'N' ? 1 : R.m) : v === 's' ? 0.01 : 1;
  const src = { F: R.F, v: R.v, s: R.s, P: R.P }[v];
  const a = R.jump === 'dj' ? R.TD : R.onset, b = R.TO;
  return { a, b, y: (i) => src[i] / k, fs: R.fs, R };
}
function curves() {
  const v = $('cmpVar').value, mode = $('cmpAlign').value;
  const out = [];
  data.forEach((d) => {
    const c = curveOf(d, v); if (!c) return;
    if (mode === 'norm') {
      const n = c.b - c.a; if (n < 3) return;
      const x = [], y = []; for (let i = c.a; i <= c.b; i++) { x.push((i - c.a) / n * 100); y.push(c.y(i)); }
      const xs = Array.from({ length: 101 }, (_, j) => j);
      out.push({ d, x: xs, y: resample(x, y, xs) });
    } else {
      const a = Math.max(0, c.a - Math.round(0.1 * c.fs)), b = Math.min(c.R.n - 1, c.b + Math.round(0.05 * c.fs));
      const x = [], y = []; for (let i = a; i <= b; i++) { x.push((i - c.b) / c.fs); y.push(c.y(i)); }
      out.push({ d, x, y });
    }
  });
  return out;
}
function groupMeans(cs) {
  const mode = $('cmpAlign').value, groups = [...new Set(data.map((d) => d.g))];
  return groups.map((g, gi) => {
    const mem = cs.filter((c) => c.d.g === g); if (!mem.length) return null;
    let xs;
    if (mode === 'norm') xs = Array.from({ length: 101 }, (_, j) => j);
    else { const lo = Math.max(...mem.map((c) => c.x[0])), hi = Math.min(...mem.map((c) => c.x[c.x.length - 1])); const n = Math.max(2, Math.round((hi - lo) * 1000)); xs = Array.from({ length: n + 1 }, (_, j) => lo + (hi - lo) * j / n); }
    const Y = mem.map((c) => (mode === 'norm' ? c.y : resample(c.x, c.y, xs)));
    const m = xs.map((_, j) => meanSD(Y.map((y) => y[j])));
    return { g, col: PAL[gi % PAL.length], x: xs, m: m.map((q) => q.m), lo: m.map((q) => (Number.isFinite(q.s) ? q.m - q.s : q.m)), hi: m.map((q) => (Number.isFinite(q.s) ? q.m + q.s : q.m)), n: mem.length };
  }).filter(Boolean);
}
function drawCmp(ctx, w, h) {
  if (!data) return null;
  const cs = curves(); if (!cs.length) return null;
  const gm = groupMeans(cs);
  const v = $('cmpVar').value, mode = $('cmpAlign').value;
  const xs = cs.flatMap((c) => [c.x[0], c.x[c.x.length - 1]]);
  const yr = range(cs.map((c) => c.y).concat(gm.map((g) => g.lo), gm.map((g) => g.hi)), 0, 1e7, [0], 0.06);
  const fr = frame(w, h, mode === 'norm' ? 0 : Math.min(...xs), mode === 'norm' ? 100 : Math.max(...xs), yr[0], yr[1]);
  const ylab = { F: A.units === 'Nkg' ? 'Force (N/kg)' : A.units === 'BW' ? 'Force (bodyweights)' : 'Force (N)', v: 'Velocity (m/s)', s: 'Displacement (cm)', P: A.units === 'N' ? 'Power (W)' : 'Power (W/kg)' }[v];
  axes(ctx, fr, { ylab, xlab: mode === 'norm' ? '% of ' + (data[0].R.jump === 'dj' ? 'contact (touchdown to take-off)' : 'start of movement to take-off') : 'Time from take-off (s)' });
  if ($('cmpTrials').checked) cs.forEach((c) => { const gi = gm.findIndex((g) => g.g === c.d.g); line(ctx, fr, c.x, c.y, { col: PAL[gi % PAL.length], width: 1.2, alpha: 0.45 }); });
  gm.forEach((g) => {
    if (g.n > 1) { ctx.save(); ctx.globalAlpha = 0.14; ctx.fillStyle = g.col; ctx.beginPath(); g.x.forEach((x, j) => (j ? ctx.lineTo(fr.X(x), fr.Y(g.hi[j])) : ctx.moveTo(fr.X(x), fr.Y(g.hi[j])))); for (let j = g.x.length - 1; j >= 0; j--) ctx.lineTo(fr.X(g.x[j]), fr.Y(g.lo[j])); ctx.closePath(); ctx.fill(); ctx.restore(); }
    line(ctx, fr, g.x, g.m, { col: g.col, width: 3 });
  });
  return fr;
}
function legend(groups) {
  $('cmpLegend').innerHTML = '<div class="legend">' + groups.map((g, gi) => '<span><span class="cmpkey" style="border-color:' + PAL[gi % PAL.length] + '"></span>' + esc(g) + ' (mean' + (data.filter((d) => d.g === g).length > 1 ? ' &plusmn; SD' : '') + ')</span>').join('') + '</div>';
  $('cmpNormInfo').textContent = $('cmpAlign').value === 'norm'
    ? 'Each trial from the start of movement (or touchdown) to take-off is stretched or squashed to 0–100% (101 points), so trials of different lengths can be averaged point by point.'
    : 'Each trial is lined up so that take-off is at 0 s. The thick line is the group mean (where every trial has data).';
}

// ---------- exports ----------
function sessionCsv() {
  const lay = $('cmpLayout').value;
  const keys = []; data.forEach((d) => d.V.forEach((v) => { if (!keys.find((k) => k.key === v.key)) keys.push(v); }));
  if (lay === 'wide') {
    const head = ['participant', 'condition', 'trial', 'file', 'jump'].concat(keys.map((k) => plain(k.short || k.name) + ' (' + plain(display(k.type, 1, A.units, { m: 1, BW: 1 }).unit) + ')'));
    const rows = [head];
    data.forEach((d) => rows.push([d.t.labels.athlete, d.t.labels.condition, d.t.labels.trial, d.t.name, JUMP_SHORT[d.t.set.jump]].concat(keys.map((k) => { const v = d.V.find((x) => x.key === k.key); return v ? display(v.type, v.value, A.units, d.R).val.replace('&ndash;', '') : ''; }))));
    return toCsv(rows);
  }
  const rows = [['participant', 'condition', 'trial', 'file', 'jump', 'phase', 'variable', 'value', 'units']];
  data.forEach((d) => d.V.forEach((v) => { const x = display(v.type, v.value, A.units, d.R); rows.push([d.t.labels.athlete, d.t.labels.condition, d.t.labels.trial, d.t.name, JUMP_SHORT[d.t.set.jump], v.group, plain(v.name), x.val.replace('&ndash;', ''), plain(x.unit)]); }));
  return toCsv(rows);
}
function normCsv() {
  const rows = [['participant', 'condition', 'trial', 'file', 'percent', 'force_' + A.units, 'velocity_m_s', 'displacement_cm', 'power_' + (A.units === 'N' ? 'W' : 'W_kg')]];
  data.forEach((d) => {
    if (!d.R.ok) return;
    const ys = ['F', 'v', 's', 'P'].map((v) => { const c = curveOf(d, v); const n = c.b - c.a, x = [], y = []; for (let i = c.a; i <= c.b; i++) { x.push((i - c.a) / n * 100); y.push(c.y(i)); } return resample(x, y, Array.from({ length: 101 }, (_, j) => j)); });
    for (let j = 0; j <= 100; j++) rows.push([d.t.labels.athlete, d.t.labels.condition, d.t.labels.trial, d.t.name, j, ys[0][j].toFixed(3), ys[1][j].toFixed(4), ys[2][j].toFixed(2), ys[3][j].toFixed(2)]);
  });
  return toCsv(rows);
}

export function initCompare() {
  chart = new Chart($('cCmp'), { height: 340, draw: drawCmp });
  ['cmpGroup', 'cmpVar', 'cmpAlign', 'cmpTrials'].forEach((id) => $(id).addEventListener('change', renderCompare));
  $('cmpCalc').addEventListener('click', renderCompare);
  $('cmpDiscCsv').addEventListener('click', () => { if (!data) renderCompare(); download('session_results.csv', new Blob([sessionCsv()], { type: 'text/csv' })); });
  $('cmpNormCsv').addEventListener('click', () => { if (!data) renderCompare(); download('session_time_normalised.csv', new Blob([normCsv()], { type: 'text/csv' })); });
}
