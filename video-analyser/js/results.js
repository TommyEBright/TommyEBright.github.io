// Results: filtering, derivatives, angles, graphs, the filter check, quality checks and the live data panel.
import { A, $, esc, fx, status, persist, points, colourOf, angleDefs, tReal, fpsReal, PALETTE, G } from './state.js';
import { toWorld, units, butter, residualCurve, centralDiff, secondDiff, series, angleValue, anglePoints, jointAngle, mean, sd } from './maths.js';
import { chart, legend } from './charts.js';
import { seek } from './video.js';
import { eventStats, statsHTML } from './events.js';

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

export function compute() {
  const S = A.S;
  S.cutoff = parseFloat($('cutoff').value) || 8; S.filt = $('filtOn').checked; persist();
  const sers = {}, msgs = [];
  points().forEach((m) => { const s = series(m); if (s) sers[m] = s; });
  if (!Object.keys(sers).length) { $('resMsg').innerHTML = 'You need at least 3 frames with the same point before results can be worked out.'; $('resBody').classList.add('hide'); A.results = null; return; }
  if (!S.calib) msgs.push('Not calibrated, so positions are in pixels, not metres. Times, angles and angular velocities are still fine.');
  let fs0 = null;
  Object.keys(sers).forEach((m) => { const s = filtSeries(sers[m], msgs, m); fs0 = s.fs; if (s.longGap) msgs.push(m + ': there is a long gap in the data, filled with a smooth curve. Check it, or digitise those frames.'); });
  const defs = angleDefs().filter((d) => d.on);
  const ang = angleSeries(defs, sers);
  // comparison layer (raw, for the validity check)
  A.results = { sers, ang, fs: fs0, msgs: [...new Set(msgs)] };
  $('resMsg').innerHTML = A.results.msgs.length ? '<div class="warn">' + A.results.msgs.map((m) => '<p>' + esc(m) + '</p>').join('') + '</div>' : '';
  $('resBody').classList.remove('hide');
  if (!S.graph.points.some((p) => sers[p])) S.graph.points = [sers.Hip ? 'Hip' : Object.keys(sers)[0]];
  renderGraphControls(); drawResults(); renderQuality(); renderCompare(); renderFilterCheck(); dataTable();
  if (A.fn.renderPhotoOpts) A.fn.renderPhotoOpts();
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
    if (cm !== 'y') { pos.push({ x: T, y: s.x, col }); leg.push({ name: m + (cm === 'speed' ? ' horizontal' : ' horizontal (forwards +)'), col }); }
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
  lg += '<p>Joint angles: 180&deg; = straight. Segment angles: from vertical (+ = top end forwards) or from horizontal (+ = front end higher). Angular velocity of a joint: + = opening (extending), &minus; = closing (flexing).</p>';
  $('legendBox').innerHTML = lg;
  keyStats();
}

// ---------- key numbers ----------
function nearestIdx(arr, f) { let b = -1, d = 1e9; arr.forEach((x, i) => { if (Math.abs(x - f) < d) { d = Math.abs(x - f); b = i; } }); return d <= 2 * Math.max(1, A.S.every) ? b : -1; }
export function summaryRows() {
  const R = A.results, S = A.S, out = []; if (!R) return eventStats();
  const m = S.graph.points.find((p) => R.sers[p]) || Object.keys(R.sers)[0], s = R.sers[m], u = units();
  const kmh = S.graph.units === 'kmh' && S.calib, vk = kmh ? 3.6 : 1, vu = kmh ? 'km/h' : u + '/s';
  const peak = (a) => { let v = null, i = -1; a.forEach((x, k) => { if (x !== null && (v === null || x > v)) { v = x; i = k; } }); return [v, i]; };
  if (S.activity !== 'jump') {
    const [v, i] = peak(s.vx); if (v !== null) out.push(['Peak forward velocity (' + m + ')', (v * vk).toFixed(2) + ' ' + vu, 'at ' + s.T[i].toFixed(3) + ' s']);
    if (s.x.length > 2) { const dx = s.x[s.x.length - 1] - s.x[0], dT = s.T[s.T.length - 1] - s.T[0]; out.push(['Average forward velocity (' + m + ')', (dx / dT * vk).toFixed(2) + ' ' + vu, 'displacement ÷ time over ' + dT.toFixed(2) + ' s']); }
  }
  if (S.activity === 'jump') {
    const [v, i] = peak(s.vy); if (v !== null) out.push(['Peak upward velocity (' + m + ')', (v * vk).toFixed(2) + ' ' + vu, 'at ' + s.T[i].toFixed(3) + ' s']);
    if (s.y.length > 3) {
      const n = Math.min(5, s.y.length), base = mean(s.y.slice(0, n)), k = u === 'm' ? 100 : 1, uu = u === 'm' ? ' cm' : ' px';
      out.push(['Lowest point (' + m + ')', ((base - Math.min(...s.y)) * k).toFixed(1) + uu + ' down', 'from the start position']);
      out.push(['Highest point (' + m + ')', ((Math.max(...s.y) - base) * k).toFixed(1) + uu + ' up', 'from the start position']);
    }
  }
  R.ang.forEach((a) => {
    const mn = Math.min(...a.V), mx = Math.max(...a.V), iw = peak(a.W.map((w) => (w === null ? null : Math.abs(w))))[1];
    out.push([a.key + ' range', mn.toFixed(0) + '° to ' + mx.toFixed(0) + '°', 'range of motion ' + (mx - mn).toFixed(0) + '°']);
    if (iw >= 0) out.push(['Peak ' + a.key.toLowerCase() + ' velocity', a.W[iw].toFixed(0) + '°/s', 'at ' + a.T[iw].toFixed(3) + ' s']);
  });
  S.events.forEach((e) => {
    const parts = [];
    R.ang.forEach((a) => { const i = nearestIdx(a.F, e.frame); if (i >= 0) parts.push(a.key + ' ' + a.V[i].toFixed(0) + '°'); });
    const i = nearestIdx(s.F, e.frame);
    if (i >= 0 && s.vx[i] !== null) parts.unshift(m + (S.activity === 'jump' ? ' v↑ ' + (s.vy[i] * vk).toFixed(2) : ' v ' + (s.vx[i] * vk).toFixed(2)) + ' ' + vu);
    if (parts.length) out.push(['At ' + e.name + ' (' + tReal(e.frame).toFixed(3) + ' s)', parts[0], parts.slice(1).join(', ')]);
  });
  eventStats().forEach((r) => out.push(r));
  return out;
}
function keyStats() {
  const R = A.results, S = A.S, rows = summaryRows();
  // cards: linear values and event timings; angles and event values go in tables below
  const cards = rows.filter((r) => !/ range$/.test(r[0]) && !/^Peak .* velocity$/.test(r[0]) && !/^At /.test(r[0]));
  $('keyStats').innerHTML = statsHTML(cards).replace(/^<div class="stats">|<\/div>$/g, '');
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

// ---------- quality checks and the markers-vs-AI comparison ----------
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
  if (S.activity === 'jump' && to && ld && sers.Hip && S.calib) {
    const s = sers.Hip, acc = [];
    s.F.forEach((f, i) => { if (f > to.frame + 2 * s.step && f < ld.frame - 2 * s.step && s.ay[i] !== null) acc.push(s.ay[i]); });
    if (acc.length >= 3) {
      const ma = mean(acc), err = (ma + G) / G * 100;
      h += '<p><strong>Gravity check:</strong> in the air the hip accelerated at <strong>' + ma.toFixed(2) + ' m/s&sup2;</strong> (should be about &minus;9.81). ' + (Math.abs(err) < 8 ? 'That is within ' + Math.abs(err).toFixed(0) + '%, so your calibration and frame rate look right.' : 'That is ' + Math.abs(err).toFixed(0) + '% out: check the calibration, the frame rate (and slow-down setting) and the tracking in the flight phase. (The hip can also move a little relative to the centre of mass in the air.)') + '</p>';
    }
  }
  const fl = Object.keys(S.flags).reduce((a, f) => a + S.flags[f].length, 0);
  h += '<p>' + (fl ? '<strong>' + fl + '</strong> point' + (fl > 1 ? 's are' : ' is') + ' flagged in Digitise &rarr; &ldquo;Check the tracking&rdquo;.' : 'No points are flagged.') + ' Sampling rate: ' + (R.fs ? R.fs.toFixed(0) : '?') + ' Hz' + (S.filt ? '; filter cut-off ' + S.cutoff + ' Hz.' : '; no filter.') + '</p>';
  $('qualBox').innerHTML = h;
}
export function renderCompare() {
  const S = A.S, altF = Object.keys(S.alt).map(Number).sort((a, b) => a - b);
  if (!altF.length) { $('cmpWrap').classList.add('hide'); return; }
  const mult = S.calib ? 100 : 1, u = S.calib ? 'cm' : 'px', rows = [];
  points().forEach((m) => {
    const d = [], dx = [], dy = [];
    altF.forEach((f) => { const a = S.frames[f] && S.frames[f][m], b = S.alt[f][m]; if (a && b) { const P = toWorld(a), Q = toWorld(b); d.push(Math.hypot(P[0] - Q[0], P[1] - Q[1])); dx.push(Q[0] - P[0]); dy.push(Q[1] - P[1]); } });
    if (d.length < 3) return;
    const rms = Math.sqrt(mean(d.map((q) => q * q))), sg = (v) => (v >= 0 ? '+' : '') + v.toFixed(1);
    rows.push('<tr><td>' + esc(m) + '</td><td class="num">' + d.length + '</td><td class="num">' + (rms * mult).toFixed(1) + ' ' + u + '</td><td class="num">' + (Math.max(...d) * mult).toFixed(1) + ' ' + u + '</td><td class="num">' + sg(mean(dx) * mult) + ' / ' + sg(mean(dy) * mult) + '</td></tr>');
  });
  if (!rows.length) { $('cmpWrap').classList.add('hide'); return; }
  $('cmpWrap').classList.remove('hide');
  let h = '<p>How far the AI points are from your marker points on the same frames (raw, unfiltered).</p><table><tr><th>Point</th><th>Frames</th><th>RMS difference</th><th>Largest</th><th>Average offset (forwards / up)</th></tr>' + rows.join('') + '</table>';
  const arow = [], chartDef = [];
  angleDefs().filter((d) => d.on).forEach((d, k) => {
    const ps = anglePoints(d), T = [], va = [], vb = [];
    altF.forEach((f) => { const a = S.frames[f], b = S.alt[f]; if (a && b && ps.every((p) => a[p] && b[p])) { const P = {}, Q = {}; ps.forEach((p) => { P[p] = toWorld(a[p]); Q[p] = toWorld(b[p]); }); T.push(tReal(f)); va.push(angleValue(d, P)); vb.push(angleValue(d, Q)); } });
    if (va.length < 3) return;
    const dd = vb.map((v, i) => v - va[i]), rmsA = Math.sqrt(mean(dd.map((q) => q * q))), bias = mean(dd);
    arow.push('<tr><td>' + esc(d.name) + '</td><td class="num">' + va.length + '</td><td class="num">' + rmsA.toFixed(1) + '&deg;</td><td class="num">' + (bias >= 0 ? '+' : '') + bias.toFixed(1) + '&deg;</td></tr>');
    if (!chartDef.length) chartDef.push({ name: d.name, T, va, vb, col: angCol(k) });
  });
  if (arow.length) h += '<table><tr><th>Angle</th><th>Frames</th><th>RMS difference</th><th>Average offset (AI &minus; markers)</th></tr>' + arow.join('') + '</table>';
  if (chartDef.length) h += '<span class="lab">' + esc(chartDef[0].name) + ': markers (solid) vs AI (dashed)</span><svg class="chart" id="cCmp" viewBox="0 0 640 300"></svg>';
  h += '<p class="muted">Which would you trust, and why? Think about where each method puts the joint centre, and what happens when a limb is hidden.</p>';
  $('cmpBox').innerHTML = h;
  if (chartDef.length) { const c = chartDef[0]; chart($('cCmp'), [{ x: c.T, y: c.va, col: c.col }, { x: c.T, y: c.vb, col: '#c0264d', dash: '7 5' }], { ylab: c.name + ' (°)', evs: S.events.map((e) => ({ t: tReal(e.frame), name: e.name })) }); }
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
    rows.push('<tr><td><span class="dot" style="background:' + colourOf(m) + '"></span>' + esc(m) + '</td><td class="num">' + fx(w[0], S.calib ? 3 : 0) + '</td><td class="num">' + fx(w[1], S.calib ? 3 : 0) + '</td><td class="num">' + v + '</td><td class="muted">' + (c ? (c.src === 'pose' ? 'AI ' : 'track ') + c.s : 'click') + '</td></tr>');
  });
  const angs = [];
  angleDefs().filter((d) => d.on).forEach((d) => { const ps = anglePoints(d); if (!ps.every((n) => fr[n])) return; const P = {}; ps.forEach((n) => { P[n] = toWorld(fr[n]); }); angs.push(esc(d.name) + ' <strong>' + angleValue(d, P).toFixed(1) + '&deg;</strong>'); });
  if (!rows.length) { el.innerHTML = '<p class="muted">No points on this frame.</p>'; return; }
  el.innerHTML = '<table><tr><th>Point</th><th>x (' + u + ')</th><th>y (' + u + ')</th><th>v<sub>x</sub> / v<sub>y</sub> (' + u + '/s, filtered)</th><th>Source</th></tr>' + rows.join('') + '</table>' + (angs.length ? '<p class="angs">' + angs.join(' &nbsp;&middot;&nbsp; ') + ' <span class="muted">(raw, this frame)</span></p>' : '');
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
  $('fcComp').addEventListener('change', renderFilterCheck);
}
