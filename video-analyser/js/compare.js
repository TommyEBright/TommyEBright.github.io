// Compare trials: key numbers for every trial side by side, group means, overlaid time-normalised curves
// and combined exports for the whole session.
import { A, $, esc, fx, status, persist, withState, PALETTE, download, VERSION, APP, tReal } from './state.js?v=2.4.0';
import { computeData, summaryRows } from './results.js?v=2.4.0';
import { normalise, meanSd } from './normalise.js?v=2.4.0';
import { mean, sd } from './maths.js?v=2.4.0';
import { chart, legend, svgToPng } from './charts.js?v=2.4.0';
import { label } from './session.js?v=2.4.0';
import { sessionDiscreteCSV, selection } from './builder.js?v=2.4.0';
import { allVariables } from './vars.js?v=2.4.0';

let cache = null;
const groupOf = (t, g) => (g === 'athlete' ? t.labels.athlete || '(no participant)' : g === 'condition' ? t.labels.condition || '(no condition)' : g === 'both' ? (t.labels.athlete || '?') + ' / ' + (t.labels.condition || '?') : 'All trials');

// Work out every trial (uses the current trial's normalisation settings for all of them).
function gather() {
  const N = A.S.norm, out = [];
  A.session.trials.forEach((t) => {
    const r = withState(t.state, () => {
      const R = computeData();
      const rows = summaryRows(R).filter((x) => typeof x[3] === 'number' && Number.isFinite(x[3]));
      const norm = R && N.start && N.end ? normalise(R, t.state, N.start, N.end, N.n) : null;
      // every variable over real time (force at its own sample rate), and the time of the first of each event
      const vars = allVariables(R).map((v) => { const [T, , V] = v.get(); return v.force ? { key: v.key, label: v.label, unit: v.unit, T: R.force.Tfull, V: R.force.Vfull } : { key: v.key, label: v.label, unit: v.unit, T, V }; });
      const evT = {}; t.state.events.slice().sort((a, b) => a.frame - b.frame).forEach((e) => { if (!(e.name in evT)) evT[e.name] = tReal(e.frame); });
      return { R, rows, norm, vars, evT };
    });
    if (r.R || r.rows.length) out.push({ t, ...r });
  });
  return out;
}
function metricList(data) {
  const seen = new Map();
  data.forEach((d) => d.rows.forEach((r) => { if (!seen.has(r[0])) seen.set(r[0], { name: r[0], unit: r[4] || '', kind: r[5] }); }));
  return [...seen.values()];
}

export function renderCompare() {
  const box = $('compare'); if (!box) return;
  const data = gather(); cache = data;
  box.classList.toggle('hide', A.session.trials.length < 1);
  if (!data.length) { $('cmpMsg').innerHTML = 'Digitise markers or mark events in at least one trial to compare.'; $('cmpBody').classList.add('hide'); return; }
  $('cmpMsg').innerHTML = data.length < 2 ? 'Only one trial has data so far. Add and analyse more videos to compare them.' : '';
  $('cmpBody').classList.remove('hide');
  const ses = A.session, metrics = metricList(data);
  if (!ses.cmpMetrics || !ses.cmpMetrics.some((m) => metrics.find((x) => x.name === m))) ses.cmpMetrics = metrics.filter((m) => m.kind === 'card').slice(0, 6).map((m) => m.name);
  if (!ses.cmpMetrics.length) ses.cmpMetrics = metrics.slice(0, 6).map((m) => m.name);
  const g = ses.cmpGroup || 'athlete'; $('cmpGroup').value = g;
  // metric chips
  $('cmpMetrics').innerHTML = metrics.map((m) => '<button type="button" class="chip' + (ses.cmpMetrics.includes(m.name) ? ' active' : '') + '" data-mt="' + esc(m.name) + '">' + esc(m.name) + '</button>').join('');
  $('cmpMetrics').querySelectorAll('[data-mt]').forEach((b) => b.addEventListener('click', () => {
    const n = b.dataset.mt, i = ses.cmpMetrics.indexOf(n); if (i >= 0) ses.cmpMetrics.splice(i, 1); else ses.cmpMetrics.push(n); persist(); renderCompare();
  }));
  // table
  const chosen = metrics.filter((m) => ses.cmpMetrics.includes(m.name));
  const val = (d, name) => { const r = d.rows.find((x) => x[0] === name); return r ? r[3] : null; };
  const dec = (u) => (u === 's' ? 3 : u === '°' || u === 'cm' || u === 'px' || u === 'px/s' ? 1 : 2);
  let h = '<table><tr><th>Participant</th><th>Condition</th><th>Trial</th>' + chosen.map((m) => '<th>' + esc(m.name) + (m.unit ? ' (' + esc(m.unit) + ')' : '') + '</th>').join('') + '</tr>';
  h += data.map((d) => '<tr' + (A.session.trials.indexOf(d.t) === A.session.cur ? ' class="current"' : '') + '><td>' + esc(d.t.labels.athlete || '') + '</td><td>' + esc(d.t.labels.condition || '') + '</td><td>' + esc(d.t.labels.trial || '') + '</td>' + chosen.map((m) => '<td class="num">' + fx(val(d, m.name), dec(m.unit)) + '</td>').join('') + '</tr>').join('');
  if (data.length > 1) {
    const groups = [...new Set(data.map((d) => groupOf(d.t, g)))];
    const gl = g === 'none' ? ['All trials'] : groups.concat(groups.length > 1 ? ['All trials'] : []);
    h += gl.map((gn) => {
      const ds = gn === 'All trials' ? data : data.filter((d) => groupOf(d.t, g) === gn);
      return '<tr class="grp"><td colspan="3"><strong>' + esc(gn) + '</strong> <span class="muted">mean &plusmn; SD (n = ' + ds.length + ')</span></td>' + chosen.map((m) => { const v = ds.map((d) => val(d, m.name)).filter((x) => x !== null); return '<td class="num">' + (v.length ? fx(mean(v), dec(m.unit)) + (v.length > 1 ? ' &plusmn; ' + fx(sd(v), dec(m.unit)) : '') : '') + '</td>'; }).join('') + '</tr>';
    }).join('');
  }
  $('cmpTab').innerHTML = h + '</table>';
  renderOverlay(data, g);
  renderCmpNorm(data, g);
}

// ---------- every trial on one graph, over real time, lined up on an event ----------
function interp(T, V, t) {
  let lo = 0, hi = T.length - 1; if (!(t >= T[0] && t <= T[hi])) return null;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; }
  const a = V[lo], b = V[hi]; if (a === null || b === null || a === undefined || b === undefined) return null;
  return T[hi] === T[lo] ? a : a + (b - a) * (t - T[lo]) / (T[hi] - T[lo]);
}
function renderOverlay(data, g) {
  const ses = A.session, withV = data.filter((d) => d.vars.length);
  if (!withV.length) { $('ovWrap').classList.add('hide'); return; }
  $('ovWrap').classList.remove('hide');
  // variables and events found in any trial
  const keys = new Map(); withV.forEach((d) => d.vars.forEach((v) => { if (!keys.has(v.key)) keys.set(v.key, v); }));
  const sel = $('ovVar'), old = ses.ovVar || sel.value;
  sel.innerHTML = [...keys].map(([k, v]) => '<option value="' + esc(k) + '">' + esc(v.label) + '</option>').join('');
  sel.value = keys.has(old) ? old : [...keys.keys()][0];
  const evNames = [...new Set(withV.flatMap((d) => Object.keys(d.evT)))], al = $('ovAlign'), oldA = ses.ovAlign !== undefined ? ses.ovAlign : (evNames[0] || '');
  al.innerHTML = '<option value="">Start of each video (no lining up)</option>' + evNames.map((n) => '<option value="' + esc(n) + '">' + esc(n) + '</option>').join('');
  al.value = evNames.includes(oldA) ? oldA : (oldA === '' ? '' : (evNames[0] || ''));
  $('ovMean').checked = !!ses.ovMean;
  const key = sel.value, info = keys.get(key), align = al.value, hide = new Set(ses.ovHide || []);
  const groups = g === 'none' ? ['All trials'] : [...new Set(withV.map((d) => groupOf(d.t, g)))];
  const colOfGroup = (gn) => PALETTE[groups.indexOf(gn) % PALETTE.length];
  const lines = [], leg = [], left = [], curves = {};
  // trial chips to show or hide each trial
  $('ovTrials').innerHTML = withV.map((d, i) => { const c = g === 'none' ? PALETTE[i % PALETTE.length] : colOfGroup(groupOf(d.t, g)); return '<button type="button" class="chip' + (hide.has(d.t.id) ? '' : ' active') + '" data-ov="' + d.t.id + '"><span class="dot" style="background:' + c + '"></span>' + esc(label(d.t)) + '</button>'; }).join('');
  $('ovTrials').querySelectorAll('[data-ov]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.ov, h = new Set(ses.ovHide || []); if (h.has(id)) h.delete(id); else h.add(id); ses.ovHide = [...h]; persist(); renderOverlay(cache || gather(), ses.cmpGroup || 'athlete');
  }));
  withV.forEach((d, i) => {
    const v = d.vars.find((x) => x.key === key); if (!v || hide.has(d.t.id)) return;
    let off = 0; if (align) { if (!(align in d.evT)) { left.push(label(d.t)); return; } off = d.evT[align]; }
    const gn = g === 'none' ? 'All trials' : groupOf(d.t, g), c = g === 'none' ? PALETTE[i % PALETTE.length] : colOfGroup(gn);
    const T = v.T.map((t) => t - off), on = ses.ovMean && withV.length > 1;
    lines.push({ x: T, y: v.V, col: c, width: on ? 1.2 : 2, opacity: on ? 0.45 : 0.85, noMinMax: true });
    (curves[gn] = curves[gn] || []).push({ T, V: v.V });
    if (g === 'none' && !on) leg.push({ name: label(d.t), col: c });
  });
  if (ses.ovMean) {
    Object.entries(curves).forEach(([gn, cs]) => {
      if (cs.length < 2) return;
      const t0 = Math.max(...cs.map((c) => c.T[0])), t1 = Math.min(...cs.map((c) => c.T[c.T.length - 1]));
      if (!(t1 > t0)) return;
      const dt = Math.min(...cs.map((c) => (c.T[c.T.length - 1] - c.T[0]) / Math.max(1, c.T.length - 1))), x = [], m = [], s = [];
      for (let t = t0; t <= t1 + 1e-9; t += dt) {
        const vals = cs.map((c) => interp(c.T, c.V, t)).filter((z) => z !== null);
        if (vals.length < 2) continue; x.push(t); m.push(mean(vals)); s.push(sd(vals));
      }
      const c = g === 'none' ? '#1f2a33' : colOfGroup(gn);
      lines.push({ x, y: m, col: c, width: 3.2 });
      lines.push({ x, y: m.map((v, k) => v + s[k]), col: c, dash: '5 4', width: 1.2, noMinMax: true });
      lines.push({ x, y: m.map((v, k) => v - s[k]), col: c, dash: '5 4', width: 1.2, noMinMax: true });
    });
  }
  if (g !== 'none') groups.forEach((gn) => { if (curves[gn]) leg.push({ name: gn + ' (' + curves[gn].length + ' trial' + (curves[gn].length > 1 ? 's' : '') + ')', col: colOfGroup(gn) }); });
  else if (ses.ovMean) leg.push({ name: 'Mean of all trials (dashed: \u00b1 1 SD)', col: '#1f2a33' });
  chart($('cOverlay'), lines, { xlab: align ? 'Time from ' + align + ' (s)' : 'Time (s)', ylab: info.label + ' (' + info.unit + ')', zero: /velocity|acceleration|force/i.test(info.label), evs: align ? [{ t: 0, name: align }] : [] });
  $('ovLegend').innerHTML = legend(leg) + (ses.ovMean ? '<p class="muted">Thick lines are means and dashed lines &plusmn; 1 SD, worked out only where the trials overlap in time.</p>' : '');
  $('ovInfo').innerHTML = left.length ? '<span class="bad">Not shown because they have no <strong>' + esc(align) + '</strong> event: ' + left.map(esc).join(', ') + '.</span>' : '';
}

function renderCmpNorm(data, g) {
  const N = A.S.norm, withN = data.filter((d) => d.norm && d.norm.cycles.length);
  if (!N.start || !withN.length) { $('cmpNormInfo').innerHTML = 'Set up <strong>Time normalisation</strong> in Results (choose the start and end events) to overlay trials here.'; $('cmpNormWrap').classList.add('hide'); return; }
  const keys = new Map(); withN.forEach((d) => Object.keys(d.norm.vars).forEach((k) => { if (!keys.has(k)) keys.set(k, d.norm.vars[k]); }));
  const sel = $('cmpVar'); const old = sel.value || N.v;
  sel.innerHTML = [...keys].map(([k, v]) => '<option value="' + esc(k) + '">' + esc(v.label) + '</option>').join('');
  sel.value = keys.has(old) ? old : (keys.has(N.v) ? N.v : [...keys.keys()][0]);
  const key = sel.value, info = keys.get(key); if (!info) return;
  $('cmpNormWrap').classList.remove('hide');
  const groups = g === 'none' ? null : [...new Set(withN.map((d) => groupOf(d.t, g)))], lines = [], leg = [];
  const pct = withN[0].norm.pct;
  if (!groups) {
    withN.forEach((d, i) => { const v = d.norm.vars[key]; if (v && v.mean) { lines.push({ x: pct, y: v.mean, col: PALETTE[i % PALETTE.length], width: 1.8, opacity: 0.7, noMinMax: true }); leg.push({ name: label(d.t), col: PALETTE[i % PALETTE.length] }); } });
    const all = withN.flatMap((d) => (d.norm.vars[key] ? d.norm.vars[key].curves.filter(Boolean) : []));
    if (all.length) { const ms = meanSd(all); lines.push({ x: pct, y: ms.mean, col: '#1f2a33', width: 3.5 }); leg.push({ name: 'Mean of all phases', col: '#1f2a33' }); }
  } else {
    groups.forEach((gn, i) => {
      const curves = withN.filter((d) => groupOf(d.t, g) === gn).flatMap((d) => (d.norm.vars[key] ? d.norm.vars[key].curves.filter(Boolean) : []));
      if (!curves.length) return; const ms = meanSd(curves), c = PALETTE[i % PALETTE.length];
      lines.push({ x: pct, y: ms.mean, col: c, width: 3 });
      if (curves.length > 1) { lines.push({ x: pct, y: ms.mean.map((m, k) => m + ms.sd[k]), col: c, dash: '5 4', width: 1.2, noMinMax: true }); lines.push({ x: pct, y: ms.mean.map((m, k) => m - ms.sd[k]), col: c, dash: '5 4', width: 1.2, noMinMax: true }); }
      leg.push({ name: gn + ' (' + curves.length + ' phase' + (curves.length > 1 ? 's' : '') + ')', col: c });
    });
  }
  chart($('cCmpNorm'), lines, { xlab: '% of ' + N.start + ' to ' + N.end, ylab: info.label + ' (' + info.unit + ')', xMin: 0, xMax: 100 });
  $('cmpNormLegend').innerHTML = legend(leg) + (groups ? '<p class="muted">Solid lines are group means of every phase; dashed lines are &plusmn; 1 SD.</p>' : '<p class="muted">Thin lines are each trial&rsquo;s mean; the thick line is the mean of every phase from every trial.</p>');
  $('cmpNormInfo').innerHTML = withN.length + ' of ' + data.length + ' trials have at least one <strong>' + esc(N.start) + ' &rarr; ' + esc(N.end) + '</strong> phase.';
}

// ---------- combined exports ----------
const q = (s) => { s = String(s === null || s === undefined ? '' : s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const csv = (lines) => new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
const stamp = () => new Date().toISOString().slice(0, 10);
function summaryAll() {
  const data = cache || gather(); if (!data.length) { status('Nothing to export yet.'); return; }
  const metrics = metricList(data), long = $('cmpLayout').value === 'long', lines = ['# ' + APP + ' v' + VERSION + ' | session summary | ' + new Date().toISOString()];
  if (long) {
    lines.push('participant,condition,trial,video,measure,value,unit');
    data.forEach((d) => d.rows.forEach((r) => lines.push([d.t.labels.athlete, d.t.labels.condition, d.t.labels.trial, d.t.name, r[0], fx(r[3], 5), r[4]].map(q).join(','))));
  } else {
    lines.push(['participant', 'condition', 'trial', 'video'].concat(metrics.map((m) => m.name + (m.unit ? ' (' + m.unit + ')' : ''))).map(q).join(','));
    data.forEach((d) => lines.push([d.t.labels.athlete, d.t.labels.condition, d.t.labels.trial, d.t.name].concat(metrics.map((m) => { const r = d.rows.find((x) => x[0] === m.name); return r ? fx(r[3], 5) : ''; })).map(q).join(',')));
  }
  download('session_summary_' + stamp() + '.csv', csv(lines)); status('Downloaded the session summary (' + data.length + ' trials).');
}
function discreteAll() {
  const data = cache || gather(), r = sessionDiscreteCSV(data, $('cmpLayout').value === 'wide');
  if (!r) { status('No discrete values yet. Digitise some frames or mark events first.'); return; }
  download('session_discrete_' + stamp() + '.csv', r.blob); status('Downloaded the discrete values for ' + r.n + ' trial' + (r.n > 1 ? 's' : '') + '.');
}
function normAll() {
  const data = (cache || gather()).filter((d) => d.norm && d.norm.cycles.length), N = A.S.norm;
  if (!data.length) { status('No time-normalised phases yet. Set them up in Results first.'); return; }
  const which = $('cmpNormWhich').value, only = which === 'one' ? $('cmpVar').value : null;
  const sel = selection(), mine = which === 'mine' ? new Set(data.flatMap((d) => withState(d.t.state, () => allVariables(d.R, sel).map((v) => v.key)))) : null;
  const lines = ['# ' + APP + ' v' + VERSION + ' | time-normalised ' + N.start + ' to ' + N.end + ', ' + data[0].norm.pct.length + ' points | ' + new Date().toISOString(), 'participant,condition,trial,video,phase,phase_duration_s,variable,unit,percent,value'];
  data.forEach((d) => Object.entries(d.norm.vars).forEach(([k, v]) => {
    if ((only && k !== only) || (mine && !mine.has(k))) return;
    v.curves.forEach((c, i) => { if (!c) return; const base = [d.t.labels.athlete, d.t.labels.condition, d.t.labels.trial, d.t.name, i + 1, fx(d.norm.cycles[i].dur, 4), v.label, v.unit].map(q).join(','); d.norm.pct.forEach((p, k2) => lines.push(base + ',' + p.toFixed(2) + ',' + fx(c[k2], 5))); });
  }));
  download('session_time_normalised_' + stamp() + '.csv', csv(lines)); status('Downloaded the time-normalised data for ' + data.length + ' trials.');
}

export function initCompare() {
  $('ovVar').addEventListener('change', () => { A.session.ovVar = $('ovVar').value; persist(); renderOverlay(cache || gather(), A.session.cmpGroup || 'athlete'); });
  $('ovAlign').addEventListener('change', () => { A.session.ovAlign = $('ovAlign').value; persist(); renderOverlay(cache || gather(), A.session.cmpGroup || 'athlete'); });
  $('ovMean').addEventListener('change', () => { A.session.ovMean = $('ovMean').checked; persist(); renderOverlay(cache || gather(), A.session.cmpGroup || 'athlete'); });
  $('ovPng').addEventListener('click', async () => { const b = await svgToPng($('cOverlay'), 3); if (b) download('session_overlay_' + stamp() + '.png', b); });
  $('cmpGroup').addEventListener('change', () => { A.session.cmpGroup = $('cmpGroup').value; persist(); renderCompare(); });
  $('cmpVar').addEventListener('change', () => renderCmpNorm(cache || gather(), A.session.cmpGroup || 'athlete'));
  $('cmpCalc').addEventListener('click', renderCompare);
  $('cmpCsv').addEventListener('click', summaryAll);
  $('cmpNormCsv').addEventListener('click', normAll);
  $('cmpDiscCsv').addEventListener('click', discreteAll);
  A.fn.renderCompare = renderCompare;
}
