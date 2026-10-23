// Results: filtering, derivatives, angles, graphs, time normalisation, the filter check, quality checks and live data.
import { A, $, esc, fx, status, persist, points, colourOf, angleDefs, tReal, fpsReal, PALETTE, G, fwd, hipMarker, download, baseName } from './state.js?v=2.0.2';
import { toWorld, units, butter, residualCurve, centralDiff, secondDiff, series, angleValue, anglePoints, mean, sd } from './maths.js?v=2.0.2';
import { chart, legend } from './charts.js?v=2.0.2';
import { seek } from './video.js?v=2.0.2';
import { eventStats, statsHTML } from './events.js?v=2.0.2';
import { normalise, variableList, eventNames } from './normalise.js?v=2.0.2';

const angCol = (i) => PALETTE[(i + 3) % PALETTE.length];

function filtSeries(s, msgs, name) {
  const S = A.S, fs = s.fs; let fc = S.cutoff;
  const use = S.filt && s.X.length >= 7;
  if (use && fc >= fs / 2 * 0.9) { fc = +(fs / 2 * 0.8).toFixed(1); msgs.push('Cut-off lowered to ' + fc + ' Hz for ' + name + ' because it was sampled at ' + fs.toFixed(1) + ' Hz (the cut-off must be well below half the sampling rate).'); }
  s.fc = use ? fc : null;
  s.x = use ? butter(s.X, fc, fs) : s.X.slice();
  s.y = use ? butter(s.Y, fc, fs) : s.Y.slice();
  s.vx = centralDiff(s.T, s.x); s.vy = centralDiff(s.T, s.y);
  s.ax = secondDiff(s.T, s.x); s.ay = secondDiff(s.T, s.y);
  s.speed = s.vx.map((v, i) => (v === null || s.vy[i] === null ? null : Math.hypot(v, s.vy[i])));
  s.accMag = s.ax.map((v, i) => (v === null || s.ay[i] === null ? null : Math.hypot(v, s.ay[i])));
  return s;
}
function angleSeries(defs, sers) {
  const out = [];
  defs.forEach((d, k) => {
    const ps = anglePoints(d); if (!ps.every((p) => sers[p])) return;
    const idx = ps.map((p) => new Map(sers[p].F.map((f, i) => [f, i])));
    const F = sers[ps[0]].F.filter((f) => idx.every((m) => m.has(f)));
    if (F.length < 3) return;
    const T = F.map(tReal), V = F.map((f) => { const P = {}; ps.forEach((p, j) => { const s = sers[p], i = idx[j].get(f); P[p] = [s.x[i], s.y[i]]; }); return angleValue(d, P); });
    out.push({ key: d.name, def: d, col: angCol(k), F, T, V, W: centralDiff(T, V), AA: secondDiff(T, V) });
  });
  return out;
}

// Works out everything for the trial in A.S. No drawing, so it can run for any trial in the session.
export function computeData() {
  const S = A.S, sers = {}, msgs = [];
  points().forEach((m) => { const s = series(m); if (s) sers[m] = s; });
  if (!Object.keys(sers).length) return null;
  if (!S.calib) msgs.push('Not calibrated, so positions are in pixels, not metres. Times, angles and angular velocities are still fine.');
  let fs0 = null;
  Object.keys(sers).forEach((m) => { const s = filtSeries(sers[m], msgs, m); fs0 = s.fs; if (s.longGap) msgs.push(m + ': there is a long gap in the data, filled with a smooth curve. Check it, or digitise those frames.'); });
  const ang = angleSeries(angleDefs().filter((d) => d.on), sers);
  return { sers, ang, fs: fs0, msgs: [...new Set(msgs)] };
}
export function compute() {
  const S = A.S;
  S.cutoff = parseFloat($('cutoff').value) || 8; S.filt = $('filtOn').checked; persist();
  const R = computeData();
  if (!R) { $('resMsg').innerHTML = points().length ? 'You need at least 3 frames with the same marker before results can be worked out.' : 'Add your markers in the <strong>Markers</strong> tab, then digitise some frames.'; $('resBody').classList.add('hide'); A.results = null; return; }
  A.results = R;
  $('resMsg').innerHTML = R.msgs.length ? '<div class="warn">' + R.msgs.map((m) => '<p>' + esc(m) + '</p>').join('') + '</div>' : '';
  $('resBody').classList.remove('hide');
  S.graph.points = S.graph.points.filter((p) => R.sers[p]);
  if (!S.graph.points.length) { const h = hipMarker(); S.graph.points = [R.sers[h] ? h : Object.keys(R.sers)[0]]; }
  renderGraphControls(); drawResults(); renderQuality(); renderNorm(); renderFilterCheck(); dataTable();
  if (A.fn.renderPhotoOpts) A.fn.renderPhotoOpts();
  if (A.fn.renderSession) A.fn.renderSession();
}

// ---------- graph controls ----------
function renderGraphControls() {
  const S = A.S, g = S.graph, sers = A.results.sers;
  $('gPoints').innerHTML = Object.keys(sers).map((m) => '<button type="button" class="chip' + (g.points.includes(m) ? ' active' : '') + '" data-gp="' + esc(m) + '"><span class="dot" style="background:' + colourOf(m) + '"></span>' + esc(m) + '</button>').join('');
  $('gPoints').querySelectorAll('[data-gp]').forEach((b) => b.addEventListener('click', () => {
    const m = b.getAttribute('data-gp'), i = g.points.indexOf(m);
    if (i >= 0) { if (g.points.length > 1) g.points.splice(i, 1); } else g.points.push(m);
    persist(); renderGraphControls(); drawResults(); dataTable();
  }));
  $('gComp').value = g.comp; $('gUnits').value = g.units; $('gMinMax').checked = !!g.minmax; $('gX').value = g.xaxis;
  $('gUnits').disabled = !S.calib;
  const ev = S.events; $('gXev').innerHTML = ev.map((e) => '<option value="' + e.id + '">' + esc(e.name) + ' @ ' + tReal(e.frame).toFixed(3) + ' s</option>').join('');
  if (g.xevent && ev.some((e) => e.id === g.xevent)) $('gXev').value = g.xevent; else if (ev.length) g.xevent = ev[0].id;
  $('gXevWrap').classList.toggle('hide', g.xaxis !== 'event' || !ev.length);
}
export function compMode() { const c = A.S.graph.comp; if (c !== 'auto') return c; return A.S.activity === 'sprint' ? 'x' : A.S.activity === 'jump' ? 'y' : 'both'; }
export function xOffset() {
  const g = A.S.graph; if (g.xaxis !== 'event') return 0;
  const e = A.S.events.find((x) => x.id === g.xevent); return e ? tReal(e.frame) : 0;
}
function xLabel() { const g = A.S.graph; if (g.xaxis !== 'event') return 'Time (s)'; const e = A.S.events.find((x) => x.id === g.xevent); return e ? 'Time from ' + e.name + ' (s)' : 'Time (s)'; }

export function drawResults() {
  const R = A.results; if (!R) return;
  const S = A.S, g = S.graph, u = units(), off = xOffset();
  const kmh = g.units === 'kmh' && S.calib, vk = kmh ? 3.6 : 1, vu = kmh ? 'km/h' : u + '/s';
  const cm = compMode(), evs = S.events.map((e) => ({ t: tReal(e.frame) - off, name: e.name }));
  const o = (ylab, zero) => ({ ylab, zero, evs, xlab: xLabel(), now: tReal(A.cur) - off, minmax: g.minmax, onPick: (t) => { seek(Math.round((t + off) * fpsReal())); setTimeout(drawResults, 30); } });
  const sc = (arr, k) => arr.map((v) => (v === null ? null : v * k));
  const pos = [], vel = [], acc = [], leg = [];
  g.points.filter((m) => R.sers[m]).forEach((m) => {
    const s = R.sers[m], T = s.T.map((t) => t - off), col = colourOf(m), many = g.points.length > 1;
    if (cm !== 'y') { pos.push({ x: T, y: s.x, col }); leg.push({ name: m + ' horizontal (+ ' + fwd() + ')', col }); }
    if (cm !== 'x') { pos.push({ x: T, y: s.y, col, dash: '7 5' }); leg.push({ name: m + ' vertical (up +)', col, dash: true }); }
    if (cm === 'speed') { vel.push({ x: T, y: sc(s.speed, vk), col, width: 3 }); acc.push({ x: T, y: s.accMag, col, width: 3 }); }
    else {
      if (cm !== 'y') { vel.push({ x: T, y: sc(s.vx, vk), col }); acc.push({ x: T, y: s.ax, col }); }
      if (cm !== 'x') { vel.push({ x: T, y: sc(s.vy, vk), col, dash: '7 5' }); acc.push({ x: T, y: s.ay, col, dash: '7 5' }); }
    }
    if (!many && cm === 'speed') leg.push({ name: m + ' resultant (speed / size of acceleration)', col });
  });
  chart($('cPos'), pos, o('Position (' + u + ')'));
  chart($('cVel'), vel, o((cm === 'speed' ? 'Speed' : 'Velocity') + ' (' + vu + ')', true));
  chart($('cAcc'), acc, o('Acceleration (' + u + '/s²)', true));
  const hasAng = R.ang.length > 0;
  $('angWrap').classList.toggle('hide', !hasAng); $('angVelWrap').classList.toggle('hide', !hasAng);
  if (hasAng) {
    chart($('cAng'), R.ang.map((a) => ({ x: a.T.map((t) => t - off), y: a.V, col: a.col })), o('Angle (°)'));
    chart($('cAngVel'), R.ang.map((a) => ({ x: a.T.map((t) => t - off), y: a.W, col: a.col })), o('Angular velocity (°/s)', true));
  }
  let lg = legend(leg);
  if (hasAng) lg += legend(R.ang.map((a) => ({ name: a.key, col: a.col })));
  const fcs = g.points.map((m) => R.sers[m] && R.sers[m].fc).filter(Boolean);
  lg += '<p>' + (fcs.length ? 'Filtered at ' + [...new Set(fcs)].join(', ') + ' Hz' : 'Not filtered') + ', sampled at ' + (R.fs ? R.fs.toFixed(1) : '?') + ' Hz. Circles mark the largest and smallest value of each line.</p>';
  lg += '<p>Joint angles: 180&deg; = straight. Segment angles: from vertical (+ = top end ' + fwd() + ') or from horizontal (+ = second marker higher). Angular velocity of a joint: + = opening (extending), &minus; = closing (flexing).</p>';
  $('legendBox').innerHTML = lg;
  keyStats();
}

// ---------- key numbers ----------
function nearestIdx(arr, f) { let b = -1, d = 1e9; arr.forEach((x, i) => { if (Math.abs(x - f) < d) { d = Math.abs(x - f); b = i; } }); return d <= 2 * Math.max(1, A.S.every) ? b : -1; }
// Key numbers for a trial: [name, text, note, number, unit, kind]. kind: card | angle | event.
export function summaryRows(R) {
  if (R === undefined) R = A.results; // compare passes null for a trial with no marker data
  const S = A.S, out = [];
  const ev = eventStats().map((r) => r.concat(r.length > 3 ? ['card'] : [null, null, 'card']));
  if (!R) return ev;
  const m = S.graph.points.find((p) => R.sers[p]) || (R.sers[hipMarker()] ? hipMarker() : Object.keys(R.sers)[0]), s = R.sers[m], u = units();
  const kmh = S.graph.units === 'kmh' && S.calib, vk = kmh ? 3.6 : 1, vu = kmh ? 'km/h' : u + '/s';
  const peak = (a) => { let v = null, i = -1; a.forEach((x, k) => { if (x !== null && (v === null || x > v)) { v = x; i = k; } }); return [v, i]; };
  if (S.activity !== 'jump') {
    const [v, i] = peak(s.vx); if (v !== null) out.push(['Peak horizontal velocity (' + m + ')', (v * vk).toFixed(2) + ' ' + vu, 'at ' + s.T[i].toFixed(3) + ' s', v * vk, vu, 'card']);
    if (s.x.length > 2) { const dx = s.x[s.x.length - 1] - s.x[0], dT = s.T[s.T.length - 1] - s.T[0]; out.push(['Average horizontal velocity (' + m + ')', (dx / dT * vk).toFixed(2) + ' ' + vu, 'displacement \u00f7 time over ' + dT.toFixed(2) + ' s', dx / dT * vk, vu, 'card']); }
  }
  if (S.activity === 'jump') {
    const [v, i] = peak(s.vy); if (v !== null) out.push(['Peak upward velocity (' + m + ')', (v * vk).toFixed(2) + ' ' + vu, 'at ' + s.T[i].toFixed(3) + ' s', v * vk, vu, 'card']);
    if (s.y.length > 3) {
      const n = Math.min(5, s.y.length), base = mean(s.y.slice(0, n)), k = u === 'm' ? 100 : 1, uu = u === 'm' ? 'cm' : 'px';
      const lo = (base - Math.min(...s.y)) * k, hi = (Math.max(...s.y) - base) * k;
      out.push(['Lowest point (' + m + ')', lo.toFixed(1) + ' ' + uu + ' down', 'from the start position', lo, uu, 'card']);
      out.push(['Highest point (' + m + ')', hi.toFixed(1) + ' ' + uu + ' up', 'from the start position', hi, uu, 'card']);
    }
  }
  R.ang.forEach((a) => {
    const mn = Math.min(...a.V), mx = Math.max(...a.V), iw = peak(a.W.map((w) => (w === null ? null : Math.abs(w))))[1];
    out.push(['Smallest ' + a.key, mn.toFixed(1) + '\u00b0', '', mn, '\u00b0', 'angle']);
    out.push(['Largest ' + a.key, mx.toFixed(1) + '\u00b0', '', mx, '\u00b0', 'angle']);
    out.push([a.key + ' range of motion', (mx - mn).toFixed(1) + '\u00b0', '', mx - mn, '\u00b0', 'angle']);
    if (iw >= 0) out.push(['Peak ' + a.key + ' angular velocity', a.W[iw].toFixed(0) + '\u00b0/s', 'at ' + a.T[iw].toFixed(3) + ' s', a.W[iw], '\u00b0/s', 'angle']);
  });
  // values at events (averaged over repeats, e.g. several touchdowns)
  [...new Set(S.events.map((e) => e.name))].forEach((name) => {
    const fr = S.events.filter((e) => e.name === name).map((e) => e.frame), rep = fr.length > 1 ? ' (mean of ' + fr.length + ')' : '';
    const vals = (F, V) => fr.map((f) => { const i = nearestIdx(F, f); return i >= 0 ? V[i] : null; }).filter((v) => v !== null);
    const vx = vals(s.F, s.vx), vy = vals(s.F, s.vy);
    if (vx.length) out.push([m + ' horizontal velocity at ' + name, (mean(vx) * vk).toFixed(2) + ' ' + vu, rep, mean(vx) * vk, vu, 'event']);
    if (vy.length) out.push([m + ' vertical velocity at ' + name, (mean(vy) * vk).toFixed(2) + ' ' + vu, rep, mean(vy) * vk, vu, 'event']);
    R.ang.forEach((a) => { const v = vals(a.F, a.V); if (v.length) out.push([a.key + ' at ' + name, mean(v).toFixed(1) + '\u00b0', rep, mean(v), '\u00b0', 'event']); });
  });
  return out.concat(ev);
}
function keyStats() {
  const R = A.results, S = A.S, rows = summaryRows();
  $('keyStats').innerHTML = statsHTML(rows.filter((r) => r[5] === 'card')).replace(/^<div class="stats">|<\/div>$/g, '');
  let h = '';
  if (R.ang.length) {
    h += '<span class="lab">Angles</span><div class="tablewrap"><table><tr><th>Angle</th><th>Smallest</th><th>Largest</th><th>Range</th><th>Peak angular velocity</th></tr>' + R.ang.map((a) => {
      let iw = -1; a.W.forEach((w, i) => { if (w !== null && (iw < 0 || Math.abs(w) > Math.abs(a.W[iw]))) iw = i; });
      const mn = Math.min(...a.V), mx = Math.max(...a.V), imn = a.V.indexOf(mn), imx = a.V.indexOf(mx);
      return '<tr><td><span class="dot" style="background:' + a.col + '"></span>' + esc(a.key) + '</td><td class="num">' + mn.toFixed(1) + '&deg; <span class="muted">at ' + a.T[imn].toFixed(3) + ' s</span></td><td class="num">' + mx.toFixed(1) + '&deg; <span class="muted">at ' + a.T[imx].toFixed(3) + ' s</span></td><td class="num">' + (mx - mn).toFixed(1) + '&deg;</td><td class="num">' + (iw >= 0 ? a.W[iw].toFixed(0) + '&deg;/s <span class="muted">at ' + a.T[iw].toFixed(3) + ' s</span>' : '') + '</td></tr>';
    }).join('') + '</table></div>';
  }
  if (S.events.length) {
    const m = S.graph.points.find((p) => R.sers[p]) || Object.keys(R.sers)[0], s = R.sers[m], u = units();
    const kmh = S.graph.units === 'kmh' && S.calib, vk = kmh ? 3.6 : 1, vu = kmh ? 'km/h' : u + '/s';
    h += '<span class="lab">At each event</span><div class="tablewrap"><table><tr><th>Event</th><th>Time (s)</th><th>' + esc(m) + ' v<sub>x</sub> (' + vu + ')</th><th>' + esc(m) + ' v<sub>y</sub> (' + vu + ')</th>' + R.ang.map((a) => '<th>' + esc(a.key) + ' (&deg;)</th>').join('') + '</tr>' + S.events.map((e) => {
      const i = nearestIdx(s.F, e.frame);
      return '<tr><td>' + esc(e.name) + '</td><td class="num">' + tReal(e.frame).toFixed(3) + '</td><td class="num">' + (i >= 0 && s.vx[i] !== null ? (s.vx[i] * vk).toFixed(2) : '') + '</td><td class="num">' + (i >= 0 && s.vy[i] !== null ? (s.vy[i] * vk).toFixed(2) : '') + '</td>' + R.ang.map((a) => { const j = nearestIdx(a.F, e.frame); return '<td class="num">' + (j >= 0 ? a.V[j].toFixed(1) : '') + '</td>'; }).join('') + '</tr>';
    }).join('') + '</table></div><p class="muted">Values come from the digitised frame nearest each event.</p>';
  }
  $('keyTables').innerHTML = h;
}

// ---------- filter check ----------
export function renderFilterCheck() {
  const R = A.results; if (!R) return;
  const sel = $('fcPoint'), old = sel.value || A.S.graph.points[0];
  sel.innerHTML = Object.keys(R.sers).map((m) => '<option>' + esc(m) + '</option>').join('');
  if (R.sers[old]) sel.value = old;
  const m = sel.value, comp = $('fcComp').value, s = R.sers[m]; if (!s) return;
  const raw = comp === 'x' ? s.X : s.Y, fil = comp === 'x' ? s.x : s.y, u = units(), k = A.S.calib ? 1000 : 1, uu = A.S.calib ? 'mm' : 'px';
  const res = raw.map((v, i) => (v - fil[i]) * k), rms = Math.sqrt(mean(res.map((r) => r * r)));
  chart($('cFilt'), [{ x: s.T, y: raw, col: '#8a96a0', dots: true, noMinMax: true }, { x: s.T, y: fil, col: colourOf(m), noMinMax: true }], { ylab: m + ' ' + (comp === 'x' ? 'horizontal' : 'vertical') + ' (' + u + ')', evs: A.S.events.map((e) => ({ t: tReal(e.frame), name: e.name })) });
  chart($('cResT'), [{ x: s.T, y: res, col: '#c0264d', noMinMax: true }], { ylab: 'Raw − filtered (' + uu + ')', zero: true });
  const rc = residualCurve(raw, s.fs);
  if (rc) chart($('cResid'), [{ x: rc.F, y: rc.R.map((r) => r * k), col: '#1f2a33', noMinMax: true }], { xlab: 'Cut-off frequency (Hz)', ylab: 'Residual (' + uu + ')', refLine: { a: rc.a * k, b: rc.slope * k }, evs: [...(rc.fc ? [{ t: rc.fc, name: 'suggested ' + rc.fc + ' Hz' }] : []), ...(s.fc ? [{ t: s.fc, name: 'yours ' + s.fc + ' Hz' }] : [])] });
  else $('cResid').innerHTML = '<text x="320" y="150" text-anchor="middle" font-size="14" fill="#5b6770">Needs at least 15 evenly spaced frames</text>';
  $('fcInfo').innerHTML = (s.fc ? 'Filtered at <strong>' + s.fc + ' Hz</strong>. ' : 'Filter is off. ') + 'The filter removed an average of <strong>' + rms.toFixed(A.S.calib ? 1 : 1) + ' ' + uu + '</strong> (RMS) from the raw ' + esc(m) + ' data. ' +
    (rc && rc.fc ? 'Residual analysis for this signal suggests about <strong>' + rc.fc + ' Hz</strong>.' : '') +
    ' The residuals over time should look like random noise around zero. If they show a clear wave or a spike at an event (e.g. foot contact), the filter is removing real movement: try a higher cut-off.';
}
export function suggestCutoff() {
  const out = []; let fs = null;
  points().forEach((m) => { const s = series(m); if (!s) return; fs = s.fs; [s.X, s.Y].forEach((v) => { const r = residualCurve(v, s.fs); if (r && r.fc) out.push(r.fc); }); });
  if (!out.length) { status('Not enough data for a residual analysis yet. It needs at least 15 evenly spaced frames (ideally every frame).'); return; }
  out.sort((a, b) => a - b); const med = out[Math.floor(out.length / 2)];
  $('cutoff').value = med; A.S.cutoff = med; persist();
  status('Residual analysis suggests a cut-off of about <strong>' + med + ' Hz</strong> (range ' + out[0] + '–' + out[out.length - 1] + ' Hz across your points, sampled at ' + fs.toFixed(0) + ' Hz). Results updated.');
  compute();
}

// ---------- quality checks ----------
export function renderQuality() {
  const R = A.results, S = A.S, out = [], sers = R.sers;
  S.template.links.forEach(([p, q]) => {
    const a = sers[p], b = sers[q]; if (!a || !b) return;
    const bi = new Map(b.F.map((f, i) => [f, i])), L = [];
    a.F.forEach((f, i) => { const j = bi.get(f); if (j !== undefined && !a.filled[i] && !b.filled[j]) L.push(Math.hypot(a.X[i] - b.X[j], a.Y[i] - b.Y[j])); });
    if (L.length < 3) return;
    const m = mean(L), cv = sd(L) / m * 100;
    const verdict = cv < 3 ? 'good' : cv < 6 ? 'OK, check flagged frames' : 'poor: out-of-plane movement or tracking errors';
    out.push('<tr><td>' + esc(p) + '–' + esc(q) + ' length</td><td class="num">' + (S.calib ? (m * 100).toFixed(1) + ' cm' : m.toFixed(0) + ' px') + '</td><td class="num">' + cv.toFixed(1) + '%</td><td>' + verdict + '</td></tr>');
  });
  let h = '';
  if (out.length) h += '<p>Segment lengths should stay the same in a side-on view. Variation (CV) under about 3% is good.</p><table><tr><th>Check</th><th>Average</th><th>Variation (CV)</th><th>Verdict</th></tr>' + out.join('') + '</table>';
  const to = S.events.find((e) => e.name === 'Take-off'), ld = S.events.find((e) => e.name === 'Landing');
  const hm = hipMarker();
  if (S.activity === 'jump' && to && ld && sers[hm] && S.calib) {
    const s = sers[hm], acc = [];
    s.F.forEach((f, i) => { if (f > to.frame + 2 * s.step && f < ld.frame - 2 * s.step && s.ay[i] !== null) acc.push(s.ay[i]); });
    if (acc.length >= 3) {
      const ma = mean(acc), err = (ma + G) / G * 100;
      h += '<p><strong>Gravity check:</strong> in the air the ' + esc(hm) + ' accelerated at <strong>' + ma.toFixed(2) + ' m/s&sup2;</strong> (should be about &minus;9.81). ' + (Math.abs(err) < 8 ? 'That is within ' + Math.abs(err).toFixed(0) + '%, so your calibration and frame rate look right.' : 'That is ' + Math.abs(err).toFixed(0) + '% out: check the calibration, the frame rate (and slow-down setting) and the tracking in the flight phase. (The hip can also move a little relative to the centre of mass in the air.)') + '</p>';
    }
  }
  const fl = Object.keys(S.flags).reduce((a, f) => a + S.flags[f].length, 0);
  h += '<p>' + (fl ? '<strong>' + fl + '</strong> marker position' + (fl > 1 ? 's are' : ' is') + ' flagged in Digitise &rarr; &ldquo;Check the tracking&rdquo;.' : 'Nothing is flagged.') + ' Sampling rate: ' + (R.fs ? R.fs.toFixed(0) : '?') + ' Hz' + (S.filt ? '; filter cut-off ' + S.cutoff + ' Hz.' : '; no filter.') + '</p>';
  $('qualBox').innerHTML = h;
}
// ---------- data table ----------
export function dataTable() {
  const R = A.results; if (!R) return;
  const m = A.S.graph.points.find((p) => R.sers[p]), s = R.sers[m], u = units();
  const head = '<tr><th>Frame</th><th>Time (s)</th><th>' + esc(m) + ' x (' + u + ')</th><th>y (' + u + ')</th><th>v<sub>x</sub></th><th>v<sub>y</sub></th><th>speed</th><th>a<sub>x</sub></th><th>a<sub>y</sub></th>' + R.ang.map((a) => '<th>' + esc(a.key) + ' (&deg;)</th><th>&omega; (&deg;/s)</th>').join('') + '</tr>';
  const amap = R.ang.map((a) => new Map(a.F.map((f, i) => [f, i])));
  const rows = s.F.map((f, i) => {
    let r = '<tr' + (s.filled[i] ? ' class="filled" title="Filled gap"' : '') + '><td class="num">' + f + '</td><td class="num">' + s.T[i].toFixed(3) + '</td><td class="num">' + fx(s.x[i], 3) + '</td><td class="num">' + fx(s.y[i], 3) + '</td><td class="num">' + fx(s.vx[i], 2) + '</td><td class="num">' + fx(s.vy[i], 2) + '</td><td class="num">' + fx(s.speed[i], 2) + '</td><td class="num">' + fx(s.ax[i], 1) + '</td><td class="num">' + fx(s.ay[i], 1) + '</td>';
    R.ang.forEach((a, k) => { const j = amap[k].get(f); r += '<td class="num">' + (j !== undefined ? fx(a.V[j], 1) : '') + '</td><td class="num">' + (j !== undefined ? fx(a.W[j], 0) : '') + '</td>'; });
    return r + '</tr>';
  }).join('');
  $('dataTab').innerHTML = head + rows;
}

// ---------- live data under the video ----------
export function live() {
  const el = $('live'); if (!el || !A.S.vw) return;
  const S = A.S, fr = S.frames[A.cur] || {}, R = A.results, u = units(), rows = [];
  points().forEach((m) => {
    const p = fr[m]; if (!p) return;
    const w = toWorld(p); let v = '';
    if (R && R.sers[m]) { const s = R.sers[m], i = s.F.indexOf(A.cur); if (i >= 0 && s.speed[i] !== null) v = fx(s.vx[i], 2) + ' / ' + fx(s.vy[i], 2); }
    const c = S.conf[A.cur] && S.conf[A.cur][m];
    rows.push('<tr><td><span class="dot" style="background:' + colourOf(m) + '"></span>' + esc(m) + '</td><td class="num">' + fx(w[0], S.calib ? 3 : 0) + '</td><td class="num">' + fx(w[1], S.calib ? 3 : 0) + '</td><td class="num">' + v + '</td><td class="muted">' + (c ? 'tracked (' + c.s + ')' : 'clicked') + '</td></tr>');
  });
  const angs = [];
  angleDefs().filter((d) => d.on).forEach((d) => { const ps = anglePoints(d); if (!ps.every((n) => fr[n])) return; const P = {}; ps.forEach((n) => { P[n] = toWorld(fr[n]); }); angs.push(esc(d.name) + ' <strong>' + angleValue(d, P).toFixed(1) + '&deg;</strong>'); });
  if (!rows.length) { el.innerHTML = '<p class="muted">' + (points().length ? 'No markers on this frame.' : 'No markers yet. Add them in the Markers tab.') + '</p>'; return; }
  el.innerHTML = '<table><tr><th>Marker</th><th>x (' + u + ')</th><th>y (' + u + ')</th><th>v<sub>x</sub> / v<sub>y</sub> (' + u + '/s, filtered)</th><th>Source</th></tr>' + rows.join('') + '</table>' + (angs.length ? '<p class="angs">' + angs.join(' &nbsp;&middot;&nbsp; ') + ' <span class="muted">(raw, this frame)</span></p>' : '');
}


// ---------- time normalisation ----------
const col = (s) => String(s).trim().replace(/[^\w]+/g, '_').replace(/^_|_$/g, '');
export function renderNorm() {
  const R = A.results, S = A.S, N = S.norm, names = eventNames();
  const opts = names.map((n) => '<option>' + esc(n) + '</option>').join('');
  $('nStart').innerHTML = opts; $('nEnd').innerHTML = opts; $('nPts').value = N.n || 101;
  if (!names.length) { $('nInfo').innerHTML = 'Mark events first (e.g. Touchdown and Toe-off, or Start of movement and Take-off). The phase between two events is stretched or squashed to 0&ndash;100%.'; $('nWrap').classList.add('hide'); A.norm = null; return; }
  if (!names.includes(N.start)) N.start = names[0];
  if (!names.includes(N.end)) N.end = names[Math.min(1, names.length - 1)];
  $('nStart').value = N.start; $('nEnd').value = N.end;
  const res = normalise(R, S, N.start, N.end, N.n); A.norm = res;
  const vars = variableList(R).filter((v) => res.vars[v.key]);
  $('nVar').innerHTML = vars.map((v) => '<option value="' + esc(v.key) + '">' + esc(v.label) + '</option>').join('');
  if (!res.vars[N.v]) N.v = (vars.find((v) => v.key.startsWith('ang|')) || vars[0] || {}).key || '';
  $('nVar').value = N.v;
  if (!res.cycles.length || !vars.length) { $('nInfo').innerHTML = 'No phases found. Each <strong>' + esc(N.start) + '</strong> needs a later <strong>' + esc(N.end) + '</strong>, and the markers need digitising across the whole phase.'; $('nWrap').classList.add('hide'); return; }
  $('nWrap').classList.remove('hide');
  const V = res.vars[N.v], used = V.curves.filter(Boolean).length, d = res.cycles.map((c) => c.dur);
  const lines = V.curves.map((c, i) => (c ? { x: res.pct, y: c, col: PALETTE[i % PALETTE.length], width: 1.5, opacity: 0.55, noMinMax: true } : null)).filter(Boolean);
  if (used > 1) {
    lines.push({ x: res.pct, y: V.mean.map((m, k) => m + V.sd[k]), col: '#1f2a33', dash: '5 4', width: 1.5, noMinMax: true });
    lines.push({ x: res.pct, y: V.mean.map((m, k) => m - V.sd[k]), col: '#1f2a33', dash: '5 4', width: 1.5, noMinMax: true });
  }
  lines.push({ x: res.pct, y: V.mean, col: '#1f2a33', width: 3.5 });
  chart($('cNorm'), lines, { xlab: '% of ' + N.start + ' to ' + N.end, ylab: V.label + ' (' + V.unit + ')', minmax: S.graph.minmax, xMin: 0, xMax: 100 });
  $('nInfo').innerHTML = '<strong>' + res.cycles.length + '</strong> phase' + (res.cycles.length > 1 ? 's' : '') + ' found (' + esc(N.start) + ' &rarr; ' + esc(N.end) + '), lasting ' + (d.length > 1 ? mean(d).toFixed(3) + ' &plusmn; ' + sd(d).toFixed(3) + ' s' : d[0].toFixed(3) + ' s') + '. ' + (used < res.cycles.length ? (res.cycles.length - used) + ' could not be used for this variable because the data do not cover the whole phase. ' : '') + 'Thin lines are each phase, the thick line is the mean' + (used > 1 ? ' and the dashed lines are &plusmn; 1 SD.' : '.');
}
export function normCSV() {
  const res = A.norm, S = A.S; if (!res || !res.cycles.length) { status('Set up the time normalisation in Results first.'); return; }
  const keys = Object.keys(res.vars), head = ['percent'];
  keys.forEach((k) => { const v = res.vars[k], c = col(v.label) + '_' + col(v.unit.replace('\u00b0', 'deg').replace('/', '_per_')); v.curves.forEach((cv, i) => head.push(c + '_phase' + (i + 1))); head.push(c + '_mean', c + '_sd'); });
  const lines = ['# ' + [A.S.name, 'time-normalised from ' + S.norm.start + ' to ' + S.norm.end, res.pct.length + ' points', 'filtered at ' + (S.filt ? S.cutoff + ' Hz' : 'no filter')].join(' | '),
    '# phases (start frame, end frame, duration s): ' + res.cycles.map((c, i) => (i + 1) + ': ' + c.a + '-' + c.b + ' (' + c.dur.toFixed(4) + ')').join('; '), head.join(',')];
  res.pct.forEach((p, k) => {
    const r = [p.toFixed(2)];
    keys.forEach((key) => { const v = res.vars[key]; v.curves.forEach((cv) => r.push(cv ? fx(cv[k], 5) : '')); r.push(v.mean ? fx(v.mean[k], 5) : '', v.sd ? fx(v.sd[k], 5) : ''); });
    lines.push(r.join(','));
  });
  download(baseName() + '_time_normalised.csv', new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  status('Downloaded <strong>' + esc(baseName()) + '_time_normalised.csv</strong>.');
}

export function initResults() {
  $('calc').addEventListener('click', compute);
  $('suggestFc').addEventListener('click', suggestCutoff);
  $('filtOn').addEventListener('change', () => { A.S.filt = $('filtOn').checked; persist(); if (A.results) compute(); });
  $('cutoff').addEventListener('change', () => { if (A.results) compute(); });
  const g = () => A.S.graph;
  $('gComp').addEventListener('change', () => { g().comp = $('gComp').value; persist(); drawResults(); });
  $('gUnits').addEventListener('change', () => { g().units = $('gUnits').value; persist(); drawResults(); });
  $('gMinMax').addEventListener('change', () => { g().minmax = $('gMinMax').checked; persist(); drawResults(); });
  $('gX').addEventListener('change', () => { g().xaxis = $('gX').value; persist(); renderGraphControls(); drawResults(); });
  $('gXev').addEventListener('change', () => { g().xevent = $('gXev').value; persist(); drawResults(); });
  $('fcPoint').addEventListener('change', renderFilterCheck);
  const N = () => A.S.norm, rn = () => { persist(); renderNorm(); if (A.fn.renderCompare) A.fn.renderCompare(); };
  $('nStart').addEventListener('change', () => { N().start = $('nStart').value; rn(); });
  $('nEnd').addEventListener('change', () => { N().end = $('nEnd').value; rn(); });
  $('nPts').addEventListener('change', () => { const v = parseInt($('nPts').value, 10); if (v >= 11 && v <= 1001) { N().n = v; rn(); } });
  $('nVar').addEventListener('change', () => { N().v = $('nVar').value; rn(); });
  $('nCsv').addEventListener('click', normCSV); $('nCsv2').addEventListener('click', normCSV);
  $('fcComp').addEventListener('change', renderFilterCheck);
}
