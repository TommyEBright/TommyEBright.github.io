// Go deeper: (1) the processing steps, one at a time; (2) median frequency over time (fatigue);
// (3) the rate of rise of the EMG after onset.
import { A, $, esc, persist, muscle, SET, W } from './state.js?v=1.4.0';
import { Chart, frame, axes, line, band, range } from './plot.js?v=1.4.0';
import { butterSos, sosfiltfilt, welch, specStats, linreg } from './dsp.js?v=1.4.0';
import { fatigue, rateOfRise } from './emg.js?v=1.4.0';
import { mean, sd, compute } from './results.js?v=1.4.0';
import { burstTxt } from './emg.js?v=1.4.0';

const f = (v, n) => (Number.isFinite(v) ? v.toFixed(n) : '&ndash;');
function chSel(id, k) { const R = A.R; return '<select id="' + id + '" class="mini" style="width:auto">' + R.pr.ch.map((c, j) => '<option value="' + j + '"' + (j === k ? ' selected' : '') + '>' + esc(muscle(c.key).short) + '</option>').join('') + '</select>'; }
const curK = () => { const R = A.R; return A.lane >= 0 && A.lane < R.pr.ch.length ? A.lane : 0; };

// ---------- 1. processing steps ----------
let stepCharts = [];
export function renderSteps() {
  const el = $('stepsBox'), R = A.R; if (!R || !R.ok) { el.innerHTML = '<p class="muted">Open a file first.</p>'; return; }
  const set = SET(), k = curK();
  el.innerHTML = '<p class="lead">How the raw EMG becomes the linear envelope that every result is worked out from. The graphs show the part of the trial on the main graph (zoom it to see more detail).</p>'
    + '<div class="row tight"><label class="inline" for="stCh" style="margin:0">Muscle</label>' + chSel('stCh', k)
    + '<label class="inline" for="stTry" style="margin:0 0 0 1rem">Compare the envelope with a cut-off of</label><input type="number" id="stTry" class="mini" min="1" max="100" step="1" value="' + (A.tryFc || 20) + '" style="width:5rem;min-width:0"> Hz</div>'
    + '<div class="stepsgrid">'
    + step(1, 'Raw EMG', 'What the sensor recorded: the sum of the electrical activity of many motor units under it, plus any noise and movement artefact. It goes above and below zero, so its average is about zero however hard the muscle works.')
    + step(2, 'Band-pass filtered (' + set.bpLo + '&ndash;' + set.bpHi + ' Hz)', 'Removes slow drifts and movement artefact (below ' + set.bpLo + ' Hz) and high-frequency noise (above ' + set.bpHi + ' Hz). Run forwards and backwards so nothing is shifted in time. A notch filter at 50 Hz is <em>not</em> used: it would also remove real EMG.')
    + step(3, 'Full-wave rectified', 'Every value made positive (its absolute value), so the size of the signal can be averaged. Now a bigger signal means more muscle activity.')
    + step(4, 'Linear envelope (low-pass ' + set.envFc + ' Hz)', 'A smooth line through the rectified signal: the &ldquo;amount&rdquo; of muscle activity over time. The dashed line is the same with your comparison cut-off: higher cut-offs follow fast changes (and noise) more closely; lower ones are smoother, have lower peaks and start rising earlier.')
    + '</div>';
  stepCharts = [1, 2, 3, 4].map((s) => new Chart($('cSt' + s), { height: 150, draw: (ctx, w, h) => drawStep(ctx, w, h, s) }));
  $('stCh').addEventListener('change', function () { A.lane = +this.value; A.fn.laneChanged(); });
  $('stTry').addEventListener('change', function () { const v = +this.value; if (v > 0) { A.tryFc = v; stepCharts[3].render(); } });
}
function step(n, title, txt) { return '<div class="stepbox"><div class="stephead"><b>' + n + '</b> ' + title + '</div><div id="cSt' + n + '" class="chartbox"></div><p class="muted small">' + txt + '</p></div>'; }
function drawStep(ctx, w, h, s) {
  const R = A.R; if (!R || !R.ok || !A.view) return null;
  const k = curK(), c = R.pr.ch[k], fs = R.fs, t = R.pr.t, col = muscle(c.key).col;
  const i0 = Math.max(0, Math.floor(A.view.x0 * fs)), i1 = Math.min(c.n - 1, Math.ceil(A.view.x1 * fs));
  const uv = (y) => { if (y._uv) return y._uv; const o = Float64Array.from(y, (v) => v * 1e6); try { y._uv = o; } catch (e) { /* typed array: fine */ } return o; };
  const ys = s === 1 ? uv(c.raw) : s === 2 ? uv(c.bp) : s === 3 ? uv(c.rect) : uv(c.env);
  let extra = null;
  if (s === 4) {
    const fc = Math.min(A.tryFc || 20, fs / 2 * 0.9), key = 'try' + fc;
    c._try = c._try || {};
    if (!c._try[key]) { const e = sosfiltfilt(butterSos(SET().envOrder, fc, 'low', fs), c.rect); for (let i = 0; i < e.length; i++) e[i] = Math.max(0, e[i]) * 1e6; c._try[key] = e; }
    extra = c._try[key];
  }
  const yr = range(s === 4 ? [ys, extra, uv(c.rect)] : [ys], i0, i1, s >= 3 ? [0] : [], 0.05);
  if (s === 4) yr[1] = Math.max(...[ys, extra].map((y) => { let m = 0; for (let i = i0; i <= i1; i++) m = Math.max(m, y[i]); return m; })) * 1.15;
  const fr = frame(w, h, A.view.x0, A.view.x1, yr[0], yr[1], { L: 62, B: 30, T: 10 });
  axes(ctx, fr, { ylab: 'µV', xlab: 'Time (s)', yTicks: 3 });
  if (s === 4) { line(ctx, fr, t, uv(c.rect), { col: '#cbd5e1', width: 1, i0, i1 }); line(ctx, fr, t, extra, { col: '#1f2a33', width: 1.4, dash: [5, 4], i0, i1 }); }
  line(ctx, fr, t, ys, { col: s === 4 ? col : '#475569', width: s === 4 ? 2.2 : 1, i0, i1 });
  return fr;
}
export function stepsView() { stepCharts.forEach((c) => c.render()); }

// ---------- 2. median frequency (fatigue) ----------
let fatChart = null, specChart = null;
export function renderFatigue() {
  const el = $('fatBox'), R = A.R; if (!R || !R.ok) { el.innerHTML = '<p class="muted">Open a file first.</p>'; return; }
  const set = SET(), k = curK(), mode = A.fatMode || (R.reps.length >= 3 ? 'reps' : 'slide');
  const wins = mode === 'reps' ? R.reps : null;
  const P = fatigue(R, k, set.fatigueWin, wins);
  const reg = P.length >= 3 ? linreg(P.map((p) => p.t), P.map((p) => p.mdf)) : null;
  const first = P.length ? P[0].mdf : NaN, last = P.length ? P[P.length - 1].mdf : NaN;
  let h = '<p class="lead">As a muscle fatigues, its action potentials travel more slowly, so the EMG shifts to lower frequencies: the <strong>median frequency</strong> (MDF) falls (Kamen and Gabriel, 2010).</p>'
    + '<div class="warn"><p><strong>Use with care.</strong> This works best in a <strong>steady isometric</strong> contraction at the same force. In dynamic exercise the frequency also changes with force, muscle length, speed and the sensor moving over the muscle, so a change is not proof of fatigue (Robertson et al., 2014).</p></div>'
    + '<div class="row tight"><label class="inline" for="ftCh" style="margin:0">Muscle</label>' + chSel('ftCh', k)
    + '<label class="inline" for="ftMode" style="margin:0 0 0 1rem">Work it out</label><select id="ftMode" class="mini" style="width:auto"><option value="reps"' + (mode === 'reps' ? ' selected' : '') + '>for each rep</option><option value="slide"' + (mode === 'slide' ? ' selected' : '') + '>in windows along the trial</option></select>'
    + (mode === 'slide' ? '<label class="inline" for="ftWin" style="margin:0 0 0 .6rem">of</label><input type="number" id="ftWin" class="mini" min="128" max="5000" step="50" value="' + set.fatigueWin + '" style="width:5.5rem;min-width:0"> ms' : '') + '</div>';
  if (mode === 'reps' && !R.reps.length) h += '<p class="muted">No reps marked: switch to windows along the trial, or mark reps in Step 2 (Reps and phases).</p>';
  h += '<div class="gridc"><div><span class="lab">Median frequency over time</span><div id="cFat" class="chartbox"></div></div><div><span class="lab">Power spectrum <span class="muted" id="specLab"></span></span><div id="cSpec" class="chartbox"></div></div></div>';
  if (P.length) h += '<div class="stats"><div class="stat"><span>Start</span><strong>' + f(first, 1) + ' Hz</strong></div><div class="stat"><span>End</span><strong>' + f(last, 1) + ' Hz</strong></div><div class="stat"><span>Change</span><strong>' + f((last - first) / first * 100, 1) + '%</strong></div>'
    + (reg ? '<div class="stat hl"><span>Slope (line of best fit)</span><strong>' + f(reg.m, 2) + ' Hz/s</strong><small>r = ' + f(reg.r, 2) + '</small></div>' : '') + '</div>';
  h += '<details class="more"><summary>How it is worked out</summary><p>The band-passed EMG in each window is split into half-overlapping pieces of 256 samples, each with a Hann window, and their power spectra are averaged (Welch&rsquo;s method). The median frequency splits the power between ' + set.bpLo + ' and ' + set.bpHi + ' Hz into two equal halves; the mean frequency (MNF) is the power-weighted average. The slope is a straight line fitted to MDF against time. A fall of more than about 10% over a sustained effort is a typical sign of fatigue.</p></details>';
  if (P.length) h += '<div class="tablewrap"><table><thead><tr><th>' + (mode === 'reps' ? 'Rep' : 'Time (s)') + '</th><th>MDF (Hz)</th><th>MNF (Hz)</th><th>RMS (µV)</th></tr></thead><tbody>' + P.map((p) => '<tr><td>' + (p.name ? esc(p.name) : p.t.toFixed(2)) + '</td><td class="num">' + f(p.mdf, 1) + '</td><td class="num">' + f(p.mnf, 1) + '</td><td class="num">' + f(p.rms, 1) + '</td></tr>').join('') + '</tbody></table></div>';
  el.innerHTML = h;
  $('ftCh').addEventListener('change', function () { A.lane = +this.value; A.fn.laneChanged(); });
  $('ftMode').addEventListener('change', function () { A.fatMode = this.value; renderFatigue(); });
  if ($('ftWin')) $('ftWin').addEventListener('change', function () { const v = +this.value; if (v >= 100) { set.fatigueWin = v; persist(); renderFatigue(); } });
  fatChart = new Chart($('cFat'), { height: 240, draw: (ctx, w, hh) => {
    if (!P.length) return null;
    const ys = P.map((p) => p.mdf), lo = Math.min(...ys), hi = Math.max(...ys), pad = (hi - lo) * 0.2 || 5;
    const fr = frame(w, hh, 0, Math.max(...P.map((p) => p.t)) * 1.05 || 1, Math.max(0, lo - pad), hi + pad, { L: 56 });
    axes(ctx, fr, { ylab: 'Median frequency (Hz)', xlab: 'Time (s)' });
    if (reg) { ctx.save(); ctx.strokeStyle = '#475569'; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(fr.X(fr.x0), fr.Y(reg.c + reg.m * fr.x0)); ctx.lineTo(fr.X(fr.x1), fr.Y(reg.c + reg.m * fr.x1)); ctx.stroke(); ctx.restore(); }
    ctx.save(); ctx.fillStyle = muscle(R.pr.ch[k].key).col; P.forEach((p) => { ctx.beginPath(); ctx.arc(fr.X(p.t), fr.Y(p.mdf), 4, 0, 7); ctx.fill(); }); ctx.restore();
    return fr;
  } });
  // spectrum of the part of the trial on the main graph
  const i0 = Math.max(0, Math.floor(A.view.x0 * R.fs)), i1 = Math.min(R.n - 1, Math.ceil(A.view.x1 * R.fs));
  const sp = welch(R.pr.ch[k].bp, R.fs, i0, i1 + 1, 512), ss = specStats(sp, set.bpLo, set.bpHi);
  $('specLab').innerHTML = '(' + (A.view.x0).toFixed(2) + ' to ' + (A.view.x1).toFixed(2) + ' s, the part on the main graph' + (ss ? '; MDF ' + ss.mdf.toFixed(1) + ' Hz, MNF ' + ss.mnf.toFixed(1) + ' Hz' : '') + ')';
  specChart = new Chart($('cSpec'), { height: 240, draw: (ctx, w, hh) => {
    if (!sp) return null;
    const P2 = Float64Array.from(sp.P, (v) => v * 1e12); // V²/Hz -> µV²/Hz
    let mx = 0; for (let j = 0; j < sp.f.length; j++) if (sp.f[j] <= 500) mx = Math.max(mx, P2[j]);
    const fr = frame(w, hh, 0, Math.min(500, R.fs / 2), 0, mx * 1.1 || 1, { L: 56 });
    axes(ctx, fr, { ylab: 'Power (µV²/Hz)', xlab: 'Frequency (Hz)' });
    band(ctx, fr, set.bpLo, set.bpHi, '#22c55e', 0.06);
    line(ctx, fr, sp.f, P2, { col: muscle(R.pr.ch[k].key).col, width: 1.6 });
    if (ss) [[ss.mdf, 'MDF', '#1f2a33'], [ss.mnf, 'MNF', '#94a3b8']].forEach(([v, l, c]) => { ctx.save(); ctx.strokeStyle = c; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(fr.X(v), fr.T); ctx.lineTo(fr.X(v), fr.T + fr.H); ctx.stroke(); ctx.fillStyle = c; ctx.font = '600 11px system-ui'; ctx.fillText(l, fr.X(v) + 3, fr.T + (l === 'MDF' ? 12 : 26)); ctx.restore(); });
    return fr;
  } });
}

// ---------- 3. rate of rise ----------
export function renderRor() {
  const el = $('rorBox'), R = A.R; if (!R || !R.ok) { el.innerHTML = '<p class="muted">Open a file first.</p>'; return; }
  const set = SET(), fc = A.rorFc === undefined ? 50 : A.rorFc;
  const RR = rateOfRise(R, set.rorMs, fc || 0), unit = R.ni.unit;
  const any = RR.some((b) => b.per.some((p) => Number.isFinite(p.rate)));
  let h = '<p class="lead">How quickly each muscle switches on: the rise in EMG over the first ' + set.rorMs + ' ms after its onset. A faster rise means motor units were recruited faster, which goes with a faster rise in force (rapid force production).</p>'
    + '<div class="row tight"><label class="inline" for="rorMs" style="margin:0">Over the first</label><select id="rorMs" class="mini" style="width:auto">' + [25, 50, 75, 100, 150, 200].map((v) => '<option' + (v === set.rorMs ? ' selected' : '') + '>' + v + '</option>').join('') + '</select> ms'
    + '<label class="inline" for="rorFc" style="margin:0 0 0 1rem">using</label><select id="rorFc" class="mini" style="width:auto"><option value="50"' + (fc === 50 ? ' selected' : '') + '>a fast envelope (50 Hz)</option><option value="20"' + (fc === 20 ? ' selected' : '') + '>a 20 Hz envelope</option><option value="0"' + (!fc ? ' selected' : '') + '>the main envelope (' + set.envFc + ' Hz)</option></select></div>'
    + '<div class="tip"><p>The main ' + set.envFc + '-Hz envelope is too smooth for this: it rounds off a fast rise. A faster envelope (50 Hz) follows it, scaled to the same MVIC.</p></div>';
  if (!any) h += '<p class="muted">Needs onsets: mark each muscle&rsquo;s <strong>Onset</strong> in <strong>Step 2 (Reps and phases)</strong>.</p>';
  else {
    h += '<table class="restab"><thead><tr><th></th>' + R.pr.ch.map((c) => '<th style="color:' + muscle(c.key).col + '">' + esc(muscle(c.key).short) + '</th>').join('') + '</tr></thead><tbody>'
      + RR.map((b) => '<tr><td>' + esc(b.w.name) + '</td>' + b.per.map((p) => '<td class="num">' + (Number.isFinite(p.rate) ? '<strong>' + f(p.rate, 0) + '</strong> <span class="muted small">' + f(p.v0, 1) + '&rarr;' + f(p.v1, 1) + '</span>' : '&ndash;') + '</td>').join('') + '</tr>').join('')
      + (RR.length > 1 ? '<tr class="grp"><td>Mean &plusmn; SD</td>' + R.pr.ch.map((c, k) => { const v = RR.map((b) => b.per[k].rate); return '<td class="num">' + f(mean(v), 0) + ' &plusmn; ' + f(sd(v), 0) + '</td>'; }).join('') + '</tr>' : '')
      + '</tbody></table><p class="muted small">' + unit + ' per second. The small numbers are the envelope at onset and ' + set.rorMs + ' ms later.</p>';
  }
  h += '<details class="more"><summary>How it is worked out</summary><p>Rate of rise = (envelope ' + set.rorMs + ' ms after onset &minus; envelope at onset) &divide; ' + (set.rorMs / 1000) + ' s. It depends heavily on where onset is marked, so mark onsets carefully and in the same way every time. It is also called the rate of EMG rise (e.g. Aagaard et al., 2002, used 0&ndash;30, 0&ndash;50, 0&ndash;100 and 0&ndash;200 ms).</p></details>';
  el.innerHTML = h;
  $('rorMs').addEventListener('change', function () { set.rorMs = +this.value; persist(); renderRor(); });
  $('rorFc').addEventListener('change', function () { A.rorFc = +this.value; renderRor(); });
}

// ---------- 4. automatic on/off settings ----------
let onChart = null;
export function renderOnOff() {
  const el = $('onBox'), R = A.R; if (!R || !R.ok) { el.innerHTML = '<p class="muted">Open a file first.</p>'; return; }
  const set = SET(), k = curK(), w1 = W().one, C = R.reps.length ? compute(R, 'reps') : null, a = C && C.avgOn ? C.avgOn[k] : null;
  let h = '<p class="lead">How the tool decides when each muscle is <strong>on</strong>. It is used whenever no onsets are marked by hand.</p>'
    + '<div class="row"><div><label for="onMethod">Threshold</label><select id="onMethod"><option value="pct"' + (set.onMethod !== 'rest' ? ' selected' : '') + '>A % of the peak of the average ' + w1 + ' (no rest needed)</option><option value="rest"' + (set.onMethod === 'rest' ? ' selected' : '') + '>Rest mean + SD (needs a rest period)</option></select></div>'
    + (set.onMethod === 'rest' ? '<div><label for="onK">Rest mean + (SD)</label><input type="number" id="onK" min="1" max="10" step="0.5" value="' + set.guideK + '"></div>' : '<div><label for="onPct">On above (% of the peak)</label><input type="number" id="onPct" min="5" max="80" step="1" value="' + set.onPct + '"></div>')
    + '<div><label for="onMin">Shortest burst or gap (ms)</label><input type="number" id="onMin" min="0" max="500" step="5" value="' + set.onMinMs + '"></div></div>';
  if (set.onMethod === 'rest' && !R.rest) h += '<div class="warn"><p>No rest period is marked in this file, so the % of the peak is used. Mark <strong>Rest start</strong> and <strong>Rest end</strong> in Step 2 (Reps and phases) (section 3).</p></div>';
  if (!R.autoOn) h += '<div class="tip"><p>This file has onsets marked by hand, so these settings are not used for its table. Delete its Onsets and Offsets to use them. The average ' + w1 + ' (and Compare) always uses them.</p></div>';
  h += '<div class="row tight"><label class="inline" for="onCh" style="margin:0">Muscle</label>' + chSel('onCh', k) + '</div>';
  h += C && C.wf ? '<div id="cOn" class="chartbox"></div>' + (a ? '<p>On: <strong>' + (a.B.length ? a.B.map(burstTxt).join('; ') : 'never') + '</strong> of the average ' + w1 + ', active for <strong>' + f(a.active, 0) + '%</strong> of it.</p>' : '') : '<p class="muted">Needs ' + W().many + ' marked (Step 2 (Reps and phases)) to show the average ' + w1 + '.</p>';
  h += '<details class="more" open><summary>Which to use</summary><p><strong>% of the peak</strong> (the default, 25%) is the usual method for running, walking and cycling: there is no rest to measure a baseline from, and the threshold scales with each muscle, so it is repeatable between trials and people. 20&ndash;25% is common; lower picks up more low-level activity, higher keeps only the main bursts. <strong>Rest mean + SD</strong> (Hodges and Bui, 1996) suits tasks that start from rest (e.g. a lift): it uses a fast ' + set.guideFc + ' Hz envelope and the rest period you mark. Either way, the shortest burst rule (about 30 ms) stops brief blips and dips from counting. Check the result against the graph: no automatic method is perfect, and crosstalk or artefact can switch a muscle on.</p></details>';
  el.innerHTML = h;
  const re = () => { persist(); A.fn.refresh({ keepView: true, keepStatus: true }); };
  $('onMethod').addEventListener('change', function () { set.onMethod = this.value; re(); });
  if ($('onPct')) $('onPct').addEventListener('change', function () { const v = +this.value; if (v > 0 && v < 100) { set.onPct = v; re(); } });
  if ($('onK')) $('onK').addEventListener('change', function () { const v = +this.value; if (v > 0) { set.guideK = v; re(); } });
  $('onMin').addEventListener('change', function () { const v = +this.value; if (v >= 0) { set.onMinMs = v; re(); } });
  $('onCh').addEventListener('change', function () { A.lane = +this.value; A.fn.laneChanged(); renderOnOff(); });
  onChart = $('cOn') ? new Chart($('cOn'), { height: 240, draw: (ctx, w, hh) => {
    const wf = C.wf[k]; if (!wf || wf.none || !a) return null;
    const x = Float64Array.from({ length: 101 }, (_, j) => j), col = muscle(wf.key).col;
    let mx = 0; for (let j = 0; j < 101; j++) mx = Math.max(mx, wf.mean[j] + wf.sd[j]);
    const fr = frame(w, hh, 0, 100, 0, mx * 1.08 || 1, { L: 60 });
    axes(ctx, fr, { ylab: R.ni.lab, xlab: '% of the ' + w1, xGrid: true });
    a.B.forEach((b) => (b.wrap ? [[b.on, 100], [0, b.off]] : [[b.on, b.off]]).forEach(([p, q]) => band(ctx, fr, p, q, col, 0.12)));
    line(ctx, fr, x, wf.mean, { col, width: 2.4 });
    ctx.save(); ctx.strokeStyle = '#1f2a33'; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(fr.L, fr.Y(a.thr)); ctx.lineTo(fr.L + fr.W, fr.Y(a.thr)); ctx.stroke();
    ctx.fillStyle = '#1f2a33'; ctx.font = '600 11px system-ui'; ctx.fillText('threshold (' + set.onPct + '% of the peak)', fr.L + 6, fr.Y(a.thr) - 4); ctx.restore();
    return fr;
  } }) : null;
}
