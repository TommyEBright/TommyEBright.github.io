// Tab 3: the seven results, each with what it tells you and how it was worked out.
//  1 amplitude (peak and mean), 2 onset, offset and burst duration, 3 order of activation,
//  4 co-contraction, 5 ratios between muscles, 6 average waveform, 7 integrated EMG.
import { A, $, esc, persist, muscle, SET, toCsv, download, baseName, trialLabel, W } from './state.js?v=1.2.0';
import { Chart, frame, axes, line, band } from './plot.js?v=1.2.0';
import { orderOf, coContraction, overlap, waveforms, quality, curveBursts, burstTxt } from './emg.js?v=1.2.0';

let wfChart = null, ampChart = null;
const f = (v, n) => (Number.isFinite(v) ? v.toFixed(n) : '&ndash;');
const ms = (s) => (Number.isFinite(s) ? (s * 1000).toFixed(0) : '&ndash;');
export const WIN_TYPES = { reps: 'Reps', phases: 'Phases', own: 'My windows', whole: 'Whole trial' };
const WT = () => Object.assign({}, WIN_TYPES, { reps: W().Many });
const mean = (a) => { const b = a.filter(Number.isFinite); return b.length ? b.reduce((s, v) => s + v, 0) / b.length : NaN; };
const sd = (a) => { const b = a.filter(Number.isFinite); if (b.length < 2) return NaN; const m = mean(b); return Math.sqrt(b.reduce((s, v) => s + (v - m) ** 2, 0) / (b.length - 1)); };
export { mean, sd };

function pairOpts(sel, R) { return R.pr.ch.map((c) => '<option value="' + esc(c.key) + '"' + (c.key === sel ? ' selected' : '') + '>' + esc(muscle(c.key).short) + '</option>').join(''); }
export function pairs(R) {
  const set = SET(), keys = R.pr.ch.map((c) => c.key), ok = (k) => keys.includes(k);
  if (!ok(set.pairA)) set.pairA = keys[0] || ''; if (!ok(set.pairB) || set.pairB === set.pairA) set.pairB = keys.find((k) => k !== set.pairA) || '';
  if (!ok(set.ratA)) set.ratA = keys[0] || ''; if (!ok(set.ratB) || set.ratB === set.ratA) set.ratB = keys[keys.length - 1] !== set.ratA ? keys[keys.length - 1] : keys.find((k) => k !== set.ratA) || '';
  return { cA: keys.indexOf(set.pairA), cB: keys.indexOf(set.pairB), rA: keys.indexOf(set.ratA), rB: keys.indexOf(set.ratB) };
}

// Everything worked out once, for the table, the CSV and Compare.
export function compute(R, type) {
  const W = R.windowsFor(type), st = W.map((w) => R.stats(w)), pr = pairs(R), set = SET();
  const cc = pr.cA >= 0 && pr.cB >= 0 && pr.cA !== pr.cB ? W.map((w) => coContraction(R, pr.cA, pr.cB, w)) : [];
  const wf = R.reps.length >= 1 ? waveforms(R, R.reps) : null;
  return { W, st, pr, set, cc, wf, avgOn: avgOnOff(R, wf) };
}
// On/off of each muscle's average cycle: on above onPct % of its peak, for at least onMinMs.
export function avgOnOff(R, wf) {
  if (!wf) return null;
  const set = SET(), len = mean(R.reps.map((r) => (r.i1 - r.i0) / R.fs)), minPct = set.onMinMs / 1000 / len * 100;
  return wf.map((w) => (w.none ? null : Object.assign(curveBursts(w.mean, w.peak * set.onPct / 100, minPct, R.cycles), { thr: w.peak * set.onPct / 100 })));
}
export function bothOn(a, b) { if (!a || !b) return NaN; let n = 0; for (let j = 0; j < 101; j++) if (a.mask[j] && b.mask[j]) n++; return n / 101 * 100; }

export function renderResults() {
  const el = $('resBox'); const R = A.R;
  if (!R || !R.ok) { el.innerHTML = '<p class="muted">Open a file first.</p>'; return; }
  if (R.mvic) { renderMvicResults(el, R); return; }
  const type = A.winType, C = compute(R, type), { W, st, pr } = C, unit = R.ni.unit, chs = R.pr.ch, w1 = SET().activity === 'reps' || SET().activity === 'open' ? 'rep' : WW().one, WIN = WT();
  const norm = R.ni.unit !== 'µV';
  const name = (k) => esc(muscle(chs[k].key).short);
  const col = (k) => muscle(chs[k].key).col;
  let h = '<div class="row tight" style="justify-content:space-between;align-items:center"><div class="row tight"><span class="lab inl">Results for</span>'
    + Object.entries(WIN).map(([k, l]) => '<button type="button" class="chip' + (type === k ? ' active' : '') + '" data-wt="' + k + '">' + l + ' <span class="muted" style="color:inherit;opacity:.75">' + R.windowsFor(k).length + '</span></button>').join('')
    + '</div><button class="btn small ghost" id="resCsv" type="button">Download results (CSV)</button></div>';
  if (R.missing.length && norm) h += '<div class="warn"><p><strong>Not normalised:</strong> ' + R.missing.map((k) => esc(muscle(k).short)).join(', ') + ' (no MVIC file for ' + (R.missing.length > 1 ? 'these muscles' : 'this muscle') + '). Add the MVIC file and tick the muscle in <strong>1. Setup</strong>. Until then these are in µV and are left out of ratios and co-contraction.</p></div>';
  if (!W.length) {
    h += '<div class="tip"><p>' + (type === 'reps' ? 'No reps yet. Mark each <strong>Rep start</strong> and <strong>Rep end</strong> in <strong>2. Points</strong>.' : type === 'phases' ? 'No phases yet. Mark a <strong>Phase change</strong> inside each rep in <strong>2. Points</strong>.' : 'No windows of your own yet. Add one in <strong>2. Points</strong>.') + ' Meanwhile, choose <strong>Whole trial</strong> above.</p></div>';
  }
  const many = W.length > 1;
  // 1 amplitude
  h += sec(1, 'Amplitude: peak and mean ' + unit, 'How hard each muscle worked in each ' + (type === 'reps' ? w1 : 'window') + '. <strong>Mean</strong> is the better measure of overall effort (it uses every sample); <strong>peak</strong> is one moment and is more variable.',
    'Peak = the highest value of the linear envelope in the window; mean = the average of every sample in it. ' + normHow(R) + ' Windows of at least 250 to 500 ms give stable means (Kamen and Gabriel, 2010).');
  if (W.length) {
    h += '<div class="tablewrap" style="max-height:none"><table class="restab"><thead><tr><th rowspan="2">' + WIN[type].replace(/s$/, '') + '</th><th rowspan="2">Duration (s)</th>' + chs.map((c, k) => '<th colspan="3" style="color:' + col(k) + '">' + name(k) + '</th>').join('') + '</tr><tr>' + chs.map(() => '<th>Peak</th><th>Mean</th><th>Peak at</th>').join('') + '</tr></thead><tbody>';
    W.forEach((w, j) => { h += '<tr><td>' + esc(w.name) + '</td><td class="num">' + f(st[j][0].dur, 2) + '</td>' + st[j].map((s) => '<td class="num">' + f(s.peak, 1) + '</td><td class="num"><strong>' + f(s.mean, 1) + '</strong></td><td class="num small">' + f(s.pPeak, 0) + '%</td>').join('') + '</tr>'; });
    if (many) h += avgRows(W, st, chs, (s) => [s.peak, s.mean, s.pPeak], [1, 1, 0], ['', '', '%']);
    h += '</tbody></table></div><p class="muted small">Values in ' + unit + '. <em>Peak at</em> = when the peak happens, as % of the window.' + (R.ni.unit === '%MVIC' ? ' Above 100% is possible (see the note in the quality checks).' : '') + '</p>';
    h += '<div id="cAmp" class="chartbox"></div>';
  }
  // 2 timing
  const BB = R.bursts, anyOn = BB.some((b) => b.per.some((p) => Number.isFinite(p.on)));
  h += sec(2, 'Onset, offset and burst duration', 'When each muscle switches on and off, and for how long it is active. Times are from the start of each ' + (R.reps.length ? w1 : 'trial') + ' (and as % of the ' + w1 + ', so ' + w1 + 's of different speeds can be compared).' + (R.cycles ? ' A negative onset means the muscle switched on before the ' + w1 + ' started (e.g. &minus;12% = in the last 12% of the one before).' : ''),
    (R.autoOn ? '<strong>Found automatically:</strong> a muscle is on while its envelope is above ' + (R.onThr && R.onThr[0] && R.onThr[0].how === 'rest' ? 'the rest mean + ' + SET().guideK + ' SD of a ' + SET().guideFc + ' Hz envelope (Hodges and Bui, 1996)' : SET().onPct + '% of the peak of its average ' + w1) + ', for at least ' + SET().onMinMs + ' ms (shorter dips are bridged and shorter blips ignored). A percentage of the peak is the usual method for running, walking and cycling, because there is no rest to set a baseline from. If a muscle has more than one burst in a ' + w1 + ', the table shows the biggest; the average ' + w1 + ' below lists them all. Change the settings in Go deeper &rarr; <strong>On/off</strong>, or mark onsets by hand in 2. Points. ' : 'You mark onset and offset by eye on each muscle (2. Points); the tool only does the arithmetic. ') + 'Burst duration = offset &minus; onset. Visual inspection by a trained eye is the reference method for onset (Hodges and Bui, 1996; Kamen and Gabriel, 2010), but note that a heavily smoothed (low cut-off) zero-lag envelope starts rising a little <em>before</em> the real onset, so judge onset on the raw EMG too (switch on <strong>Raw EMG</strong> above the graph).');
  if (C.avgOn) {
    h += '<p style="margin:.4rem 0 .2rem"><strong>Average ' + w1 + '</strong> <span class="muted small">(on above ' + SET().onPct + '% of each muscle&rsquo;s average peak; shown as bars under the average waveform in 6)</span></p><table class="restab"><thead><tr><th>Muscle</th><th>On (% of the ' + w1 + ')</th><th>Active for</th></tr></thead><tbody>'
      + C.avgOn.map((a, k) => (a ? '<tr><td style="color:' + col(k) + ';font-weight:700">' + name(k) + '</td><td>' + (a.B.length ? a.B.map(burstTxt).join('; ') : '<span class="muted">never above the threshold</span>') + '</td><td class="num"><strong>' + f(a.active, 0) + '%</strong> of the ' + w1 + '</td></tr>' : '')).join('') + '</tbody></table>';
  }
  if (!anyOn) h += '<p class="muted">' + (R.autoOn ? 'No bursts found. Check the ' + w1 + 's are marked, or lower the threshold in Go deeper &rarr; <strong>On/off</strong>.' : 'No onsets yet: mark them in <strong>2. Points</strong> (click a muscle&rsquo;s lane, then <strong>Onset</strong> and <strong>Offset</strong>).') + '</p>';
  else {
    if (C.avgOn) h += '<p style="margin:.6rem 0 .2rem"><strong>Each ' + w1 + '</strong> <span class="muted small">(' + (R.autoOn ? 'the biggest burst' : 'marked by hand') + ')</span></p>';
    h += '<div class="tablewrap" style="max-height:none"><table class="restab"><thead><tr><th rowspan="2">' + (R.reps.length ? WW().One : '') + '</th>' + chs.map((c, k) => '<th colspan="3" style="color:' + col(k) + '">' + name(k) + '</th>').join('') + '</tr><tr>' + chs.map(() => '<th>Onset</th><th>Offset</th><th>Duration</th>').join('') + '</tr></thead><tbody>';
    BB.forEach((b) => { h += '<tr><td>' + esc(b.w.name) + '</td>' + b.per.map((p) => '<td class="num">' + (Number.isFinite(p.on) ? f(p.on, 3) + ' s <span class="muted small">' + f(p.onP, 0) + '%</span>' : '&ndash;') + '</td><td class="num">' + (Number.isFinite(p.off) ? f(p.off, 3) + ' s <span class="muted small">' + f(p.offP, 0) + '%</span>' : '&ndash;') + '</td><td class="num">' + f(p.dur, 3) + (Number.isFinite(p.dur) ? ' s' : '') + '</td>').join('') + '</tr>'; });
    if (BB.length > 1) {
      const agg = (fn) => chs.map((c, k) => BB.map((b) => fn(b.per[k])));
      const on = agg((p) => p.on), off = agg((p) => p.off), du = agg((p) => p.dur), onP = agg((p) => p.onP), offP = agg((p) => p.offP);
      h += '<tr class="grp"><td>Mean</td>' + chs.map((c, k) => '<td class="num">' + f(mean(on[k]), 3) + ' <span class="small">' + f(mean(onP[k]), 0) + '%</span></td><td class="num">' + f(mean(off[k]), 3) + ' <span class="small">' + f(mean(offP[k]), 0) + '%</span></td><td class="num">' + f(mean(du[k]), 3) + '</td>').join('') + '</tr>';
      h += '<tr class="grp"><td>SD</td>' + chs.map((c, k) => '<td class="num">' + f(sd(on[k]), 3) + '</td><td class="num">' + f(sd(off[k]), 3) + '</td><td class="num">' + f(sd(du[k]), 3) + '</td>').join('') + '</tr>';
    }
    h += '</tbody></table></div>';
  }
  // 3 order
  h += sec(3, 'Order of activation', 'Which muscle switches on first, and how long after it the others follow. Useful for coordination (e.g. does the gluteus maximus fire before the hamstrings?).',
    'Muscles are sorted by their onset in each rep. The delay is each onset minus the first one. Differences of a few ms are within the error of marking onset, so only read something into gaps of about 20 ms or more, and only if the order is the same in most reps.');
  if (chs.length < 2) h += '<p class="muted">Needs two or more muscles in the same file.</p>';
  else if (!anyOn) h += '<p class="muted">Needs onsets (see 2).</p>';
  else {
    const counts = {};
    h += '<ul class="plain">' + BB.map((b) => { const o = orderOf(b); if (!o.length) return ''; const s = o.map((x) => x.key).join('>'); counts[s] = (counts[s] || 0) + 1; return '<li><strong>' + esc(b.w.name) + ':</strong> ' + o.map((x, j) => '<span style="color:' + muscle(x.key).col + ';font-weight:700">' + esc(muscle(x.key).short) + '</span>' + (j ? ' <span class="muted small">+' + x.after.toFixed(0) + ' ms</span>' : '')).join(' &rarr; ') + '</li>'; }).join('') + '</ul>';
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (best && BB.length > 1) h += '<p>Most common order: <strong>' + best[0].split('>').map((k) => esc(muscle(k).short)).join(' &rarr; ') + '</strong> (' + best[1] + ' of ' + BB.filter((b) => orderOf(b).length).length + ' ' + WW().many + ').</p>';
  }
  // 4 co-contraction
  h += sec(4, 'Co-contraction', 'How much two muscles that pull in opposite directions (an <strong>agonist</strong> and its <strong>antagonist</strong>, e.g. vastus lateralis and biceps femoris) are active at the same time. More co-contraction stiffens the joint (e.g. to protect it) but costs energy and works against the movement.',
    'Co-contraction index (CI) = 2 &times; the area under <em>both</em> curves (the smaller of the two at each sample) &divide; (area A + area B) &times; 100 (Falconer and Winter, 1985), from the normalised envelopes. 0% = never active together, 100% = identical. Overlap = the time both bursts (onset to offset) are on together. <strong>Crosstalk:</strong> muscles next to each other pick up each other&rsquo;s signal, which looks like co-contraction. Be careful with neighbouring muscles.');
  if (chs.length > 1) h += '<div class="row tight"><label class="inline" for="ccA" style="margin:0">Agonist</label><select id="ccA" class="mini" style="width:auto">' + pairOpts(SET().pairA, R) + '</select><label class="inline" for="ccB" style="margin:0">Antagonist</label><select id="ccB" class="mini" style="width:auto">' + pairOpts(SET().pairB, R) + '</select></div>';
  if (chs.length < 2) h += '<p class="muted">Needs two muscles. If each muscle is in its own file, use <strong>Compare trials</strong>: it pairs them by exercise or condition.</p>';
  else if (!norm || !R.N[pr.cA] || !R.N[pr.cB]) h += '<p class="muted">Needs both muscles normalised (MVIC, reference trial or session peak), so their sizes can be compared.</p>';
  else if (W.length) {
    const neighbours = sameGroup(chs[pr.cA].key, chs[pr.cB].key);
    if (neighbours) h += '<div class="warn"><p>' + name(pr.cA) + ' and ' + name(pr.cB) + ' are <strong>synergists</strong> (they do the same job) and sit close together, so this is not co-contraction in the usual sense, and crosstalk will inflate it. Choose an agonist and antagonist pair if you have one.</p></div>';
    h += '<table class="restab"><thead><tr><th></th><th>CI (%)</th><th>Common area (' + unit + '&middot;s)</th>' + (type === 'reps' && anyOn ? '<th>Burst overlap</th>' : '') + '</tr></thead><tbody>';
    W.forEach((w, j) => { const c = C.cc[j]; const ov = type === 'reps' && anyOn ? overlap(R.bursts[j], chs[pr.cA].key, chs[pr.cB].key, (w.i1 - w.i0) / R.fs) : null; h += '<tr><td>' + esc(w.name) + '</td><td class="num"><strong>' + f(c && c.ci, 1) + '</strong></td><td class="num">' + f(c && c.common, 2) + '</td>' + (type === 'reps' && anyOn ? '<td class="num">' + (ov ? ms(ov.s) + ' ms (' + f(ov.p, 0) + '% of the rep)' : '<span class="muted">needs both onsets and offsets</span>') + '</td>' : '') + '</tr>'; });
    if (many) h += '<tr class="grp"><td>Mean &plusmn; SD</td><td class="num">' + f(mean(C.cc.map((c) => c && c.ci)), 1) + ' &plusmn; ' + f(sd(C.cc.map((c) => c && c.ci)), 1) + '</td><td></td>' + (type === 'reps' && anyOn ? '<td></td>' : '') + '</tr>';
    h += '</tbody></table>';
    if (C.avgOn && C.avgOn[pr.cA] && C.avgOn[pr.cB]) h += '<p>Both on together: <strong>' + f(bothOn(C.avgOn[pr.cA], C.avgOn[pr.cB]), 0) + '% of the average ' + w1 + '</strong> <span class="muted small">(from the on/off of the average ' + w1 + ' in 2)</span></p>';
  }
  // 5 ratios
  h += sec(5, 'Ratios between muscles', 'How the work is shared between two muscles, e.g. medial (SM, ST) against lateral (BF) hamstrings, or VMO against VL. 1.0 = equal (relative to each one&rsquo;s own MVIC); above 1 = the first muscle is working harder.',
    'Ratio = mean ' + unit + ' of muscle A &divide; mean ' + unit + ' of muscle B in the same window (and the same for peaks). Only normalised EMG can be compared like this: raw µV depend on the electrode, the skin and the fat under it, so a ratio of µV means nothing (Kamen and Gabriel, 2010).');
  if (chs.length > 1) h += '<div class="row tight"><label class="inline" for="rtA" style="margin:0">Muscle A</label><select id="rtA" class="mini" style="width:auto">' + pairOpts(SET().ratA, R) + '</select><span>:</span><label class="inline" for="rtB" style="margin:0">Muscle B</label><select id="rtB" class="mini" style="width:auto">' + pairOpts(SET().ratB, R) + '</select></div>';
  if (chs.length < 2) h += '<p class="muted">Needs two muscles.</p>';
  else if (!norm || !R.N[pr.rA] || !R.N[pr.rB]) h += '<p class="muted">Needs both muscles normalised.</p>';
  else if (W.length) {
    const rm = W.map((w, j) => st[j][pr.rA].mean / st[j][pr.rB].mean), rp = W.map((w, j) => st[j][pr.rA].peak / st[j][pr.rB].peak);
    h += '<table class="restab"><thead><tr><th></th><th>' + name(pr.rA) + ' : ' + name(pr.rB) + ' (mean)</th><th>(peak)</th></tr></thead><tbody>'
      + W.map((w, j) => '<tr><td>' + esc(w.name) + '</td><td class="num"><strong>' + f(rm[j], 2) + '</strong></td><td class="num">' + f(rp[j], 2) + '</td></tr>').join('')
      + (many ? '<tr class="grp"><td>Mean &plusmn; SD</td><td class="num">' + f(mean(rm), 2) + ' &plusmn; ' + f(sd(rm), 2) + '</td><td class="num">' + f(mean(rp), 2) + ' &plusmn; ' + f(sd(rp), 2) + '</td></tr>' : '') + '</tbody></table>';
  }
  // 6 waveform
  h += sec(6, 'Average waveform', 'The typical pattern of each muscle through a rep: every rep is stretched to 0&ndash;100% so reps of different lengths line up, then averaged. The shaded band is &plusmn;1 SD (how much the reps differ).',
    'Each rep is resampled to 101 points (0 to 100%) by linear interpolation, then the mean and SD are worked out at each point. VR (variance ratio) measures how alike the reps are: 0 = identical, 1 = no shared pattern (Hershler and Milner, 1978); below about 0.3 is consistent. Use at least 3 reps (5 to 10 is better).');
  if (!C.wf) h += '<p class="muted">Needs ' + WW().many + ' (mark or find them in <strong>2. Points</strong>).</p>';
  else {
    h += '<div class="chips" id="wfChips">' + chs.map((c, k) => (R.N[k] ? '<button type="button" class="chip' + (A.wfHide && A.wfHide[c.key] ? '' : ' active') + '" data-wf="' + esc(c.key) + '"><span class="dot" style="background:' + col(k) + '"></span>' + name(k) + '</button>' : '')).join('') + '<label class="inline small"><input type="checkbox" id="wfEach"' + (A.wfEach ? ' checked' : '') + '> each rep</label></div>';
    h += '<div id="cWf" class="chartbox"></div>';
    h += '<table class="restab"><thead><tr><th>Muscle</th><th>' + WIN.reps + '</th><th>Peak of the average</th><th>at</th><th>VR</th></tr></thead><tbody>' + C.wf.map((w, k) => w.none ? '' : '<tr><td style="color:' + col(k) + ';font-weight:700">' + name(k) + '</td><td class="num">' + w.n + '</td><td class="num">' + f(w.peak, 1) + ' ' + unit + '</td><td class="num">' + w.peakAt + '%</td><td class="num">' + f(w.vr, 2) + (w.n < 3 ? ' <span class="muted small">(needs 3+ reps)</span>' : '') + '</td></tr>').join('') + '</tbody></table>';
  }
  // 7 iEMG
  h += sec(7, 'Integrated EMG (iEMG)', 'The total amount of muscle activity in the window: the area under the envelope. It grows with both <em>how hard</em> and <em>how long</em> the muscle works, so a slow rep scores more than a fast one at the same effort. Compare it only between windows of similar length, or use the mean (1) instead.',
    'iEMG = the area under the normalised envelope, by the trapezoid rule: the sum of &frac12;(y<sub>i&minus;1</sub> + y<sub>i</sub>) &Delta;t. Units: ' + unit + '&middot;s. iEMG &divide; duration = the mean.');
  if (W.length) {
    h += '<table class="restab"><thead><tr><th></th>' + chs.map((c, k) => '<th style="color:' + col(k) + '">' + name(k) + '</th>').join('') + '</tr></thead><tbody>'
      + W.map((w, j) => '<tr><td>' + esc(w.name) + '</td>' + st[j].map((s) => '<td class="num">' + f(s.iemg, 2) + '</td>').join('') + '</tr>').join('')
      + (many ? avgRows(W, st, chs, (s) => [s.iemg], [2], ['']) : '') + '</tbody></table><p class="muted small">' + unit + '&middot;s</p>';
  }
  // quality
  const Q = quality(A.S);
  const nBad = Q.reduce((s, q) => s + q.items.filter((i) => i.lv !== 'info').length, 0);
  h += '<details class="help" style="margin-top:.8rem"' + (nBad ? ' open' : '') + '><summary>Quality checks ' + (nBad ? '<span class="bad">(' + nBad + ' to look at)</span>' : '<span class="muted">(nothing serious)</span>') + '</summary><div class="hb">' + qualHtml(Q) + '</div></details>';
  el.innerHTML = h;
  wire(el, R, C, type);
}
function sec(n, title, what, how) {
  return '<section class="ressec"><h3><span class="num1">' + n + '</span> ' + title + '</h3><p class="what">' + what + '</p><details class="more"><summary>How it is worked out</summary><p>' + how + '</p></details>';
}
function normHow(R) {
  const u = R.ni.unit, set = SET();
  if (u === '%MVIC') return '%MVIC = envelope &divide; the muscle&rsquo;s MVIC reference &times; 100, where the reference is ' + (set.refMethod === 'win' ? 'the highest mean over ' + set.refWin + ' ms' : 'the highest value of the envelope') + ' across that muscle&rsquo;s MVIC files (see 1. Setup).';
  if (u === '% ref') return '% ref = envelope &divide; the peak of the muscle&rsquo;s average ' + WW().one + ' in the reference trial(s) &times; 100 (Burden, 2010). Above 100% = more active than in the reference.';
  if (u === '% peak') return 'Each muscle is divided by its highest envelope across all task trials in this session &times; 100.';
  return 'Not normalised (µV). These cannot be compared between muscles or between people.';
}
function avgRows(W, st, chs, get, dp, suf) {
  const rows = [['Mean', mean], ['SD', sd]];
  return rows.map(([lab, fn]) => '<tr class="grp"><td>' + lab + '</td>' + (get(st[0][0]).length === 3 ? '<td class="num">' + f(fn(st.map((s) => s[0].dur)), 2) + '</td>' : '') + chs.map((c, k) => get(st[0][k]).map((_, q) => '<td class="num">' + f(fn(st.map((s) => get(s[k])[q])), dp[q]) + suf[q] + '</td>').join('')).join('') + '</tr>').join('');
}
// Muscles in the same group (e.g. hamstrings) are synergists, not an agonist-antagonist pair.
const GROUPS = [['SM', 'ST', 'BF'], ['VL', 'VM', 'RF'], ['MG', 'LG', 'GAS', 'SOL'], ['GMax', 'GMed'], ['AD', 'MD', 'PD', 'DEL']];
function sameGroup(a, b) { const s = (k) => muscle(k).short.replace(/^[LR]\s+/, ''); return GROUPS.some((g) => g.includes(s(a)) && g.includes(s(b))); }
export function qualHtml(Q) {
  return Q.map((q) => '<p><strong style="color:' + muscle(q.key).col + '">' + esc(q.name) + ':</strong> ' + (q.items.length ? q.items.map((i) => '<span class="' + (i.lv === 'bad' ? 'bad' : i.lv === 'warn' ? 'warnTxt' : 'muted') + '">' + i.txt + '</span>').join(' ') : '<span class="muted">no problems found.</span>') + '</p>').join('')
    + '<p class="muted small">Checks: exact zeros at the start or end, DC offset, clipping and very large spikes, power below 20 Hz (movement artefact), a mains peak, a baseline that never goes quiet, and values above 100% MVIC (Kamen and Gabriel, 2010; Robertson et al., 2014).</p>';
}

function renderMvicResults(el, R) {
  const refs = A.fn.references(), t = A.S;
  let h = '<p class="lead">This is an <strong>MVIC file</strong>: it sets 100% for ' + ((t.mvicFor || []).map((k) => esc(muscle(k).short)).join(', ') || '<span class="bad">no muscle yet (tick one in 1. Setup)</span>') + '.</p><table class="restab"><thead><tr><th>Muscle</th><th>Highest envelope here</th><th>Used as 100%?</th></tr></thead><tbody>';
  R.pr.ch.forEach((c) => {
    if (!(t.mvicFor || []).includes(c.key)) return;
    const r = refs[c.key], mine = r && r.all.find((x) => x.trial === t.id);
    h += '<tr><td>' + esc(muscle(c.key).short) + '</td><td class="num">' + (mine ? (mine.v * 1e6).toFixed(1) + ' µV' : '&ndash;') + '</td><td>' + (r && r.trial === t.id ? '<strong>Yes</strong> (the highest of ' + r.all.length + ' MVIC file' + (r.all.length > 1 ? 's' : '') + ')' : r ? 'No: ' + esc(r.name) + ' is higher (' + (r.v * 1e6).toFixed(1) + ' µV)' : '') + '</td></tr>';
  });
  h += '</tbody></table>';
  const Q = quality(A.S);
  h += '<details class="help" style="margin-top:.8rem" open><summary>Quality checks</summary><div class="hb">' + qualHtml(Q) + '</div></details>';
  el.innerHTML = h;
}

function wire(el, R, C, type) {
  el.querySelectorAll('[data-wt]').forEach((b) => b.addEventListener('click', () => { A.winType = b.getAttribute('data-wt'); persist(); renderResults(); }));
  [['ccA', 'pairA'], ['ccB', 'pairB'], ['rtA', 'ratA'], ['rtB', 'ratB']].forEach(([id, k]) => { if ($(id)) $(id).addEventListener('change', function () { SET()[k] = this.value; persist(); renderResults(); }); });
  if ($('resCsv')) $('resCsv').addEventListener('click', () => download(baseName() + '_results.csv', new Blob([toCsv(resultRows(R, type))], { type: 'text/csv' })));
  el.querySelectorAll('[data-wf]').forEach((b) => b.addEventListener('click', () => { A.wfHide = A.wfHide || {}; const k = b.getAttribute('data-wf'); A.wfHide[k] = !A.wfHide[k]; b.classList.toggle('active'); if (wfChart) wfChart.render(); }));
  if ($('wfEach')) $('wfEach').addEventListener('change', function () { A.wfEach = this.checked; if (wfChart) wfChart.render(); });
  if ($('cWf')) wfChart = new Chart($('cWf'), { height: (w) => Math.max(240, Math.min(340, w * 0.4)), draw: (ctx, w, h) => drawWf(ctx, w, h, R, C.wf, { onoff: C.avgOn }) });
  else wfChart = null;
  if ($('cAmp')) ampChart = new Chart($('cAmp'), { height: 200, draw: (ctx, w, h) => drawAmp(ctx, w, h, R, C) });
}
export function wfSnapshot() { return wfChart ? wfChart.snapshot(900, 420, 2) : null; }

export function drawWf(ctx, w, h, R, wf, opts) {
  opts = opts || {};
  const show = wf.map((x, k) => !x.none && !(A.wfHide && A.wfHide[x.key]));
  let mx = 0; wf.forEach((x, k) => { if (!show[k]) return; for (let j = 0; j < 101; j++) mx = Math.max(mx, x.mean[j] + x.sd[j], A.wfEach ? Math.max(...x.curves.map((c) => c[j])) : 0); });
  const nOn = opts.onoff ? show.filter((v, k) => v && opts.onoff[k]).length : 0;
  const fr = frame(w, h, 0, 100, 0, (mx || 1) * 1.08, { L: 60, B: nOn ? 40 + nOn * 8 : 34 });
  axes(ctx, fr, { ylab: R.ni.lab, xlab: opts.xlab || '% of the ' + W().one, xGrid: true });
  // phase boundaries (average position)
  if (R.phases.length) {
    const byRep = {}; R.phases.forEach((p) => { (byRep[p.rep] = byRep[p.rep] || []).push(p); });
    const cuts = []; Object.values(byRep).forEach((ps) => { const r = R.reps[ps[0].rep]; ps.slice(1).forEach((p, j) => { (cuts[j] = cuts[j] || []).push((p.i0 - r.i0) / (r.i1 - r.i0) * 100); }); });
    cuts.forEach((c, j) => { const m = mean(c); ctx.save(); ctx.strokeStyle = '#7c3aed'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(fr.X(m), fr.T); ctx.lineTo(fr.X(m), fr.T + fr.H); ctx.stroke(); ctx.fillStyle = '#7c3aed'; ctx.font = '600 11px system-ui'; ctx.textAlign = 'left'; ctx.fillText(SET().phaseNames[j + 1] || '', fr.X(m) + 4, fr.T + 12); ctx.restore(); });
  }
  const x = Float64Array.from({ length: 101 }, (_, j) => j);
  wf.forEach((s, k) => {
    if (!show[k]) return;
    const col = muscle(s.key).col;
    if (A.wfEach) s.curves.forEach((c) => line(ctx, fr, x, c, { col, width: 1, alpha: 0.35 }));
    ctx.save(); ctx.globalAlpha = 0.16; ctx.fillStyle = col; ctx.beginPath();
    for (let j = 0; j < 101; j++) ctx.lineTo(fr.X(j), fr.Y(s.mean[j] + s.sd[j]));
    for (let j = 100; j >= 0; j--) ctx.lineTo(fr.X(j), fr.Y(Math.max(0, s.mean[j] - s.sd[j])));
    ctx.closePath(); ctx.fill(); ctx.restore();
    line(ctx, fr, x, s.mean, { col, width: 2.4 });
  });
  // on/off bars under the plot (one row per muscle)
  if (nOn) {
    let row = 0; ctx.save();
    wf.forEach((s, k) => {
      const a = opts.onoff[k]; if (!show[k] || !a) return;
      const y = fr.T + fr.H + 21 + row * 8; row++;
      ctx.fillStyle = '#e2e8f0'; ctx.fillRect(fr.X(0), y, fr.W, 5);
      ctx.fillStyle = muscle(s.key).col;
      for (let j = 0; j < 101; j++) {
        if (!a.mask[j] || (j && a.mask[j - 1])) continue;
        let e = j; while (e < 100 && a.mask[e + 1]) e++;
        const x0 = fr.X(Math.max(0, j - 0.5)), x1 = fr.X(Math.min(100, e + 0.5)); ctx.fillRect(x0, y, x1 - x0, 5);
      }
      ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = muscle(s.key).col; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(fr.L, fr.Y(a.thr)); ctx.lineTo(fr.L + fr.W, fr.Y(a.thr)); ctx.stroke(); ctx.restore();
    });
    ctx.restore();
  }
  // legend
  ctx.save(); ctx.font = '600 11.5px system-ui'; let lx = fr.L + 8;
  wf.forEach((s, k) => { if (!show[k]) return; ctx.fillStyle = muscle(s.key).col; ctx.fillRect(lx, fr.T + 4, 14, 3); ctx.fillText(muscle(s.key).short + ' (n = ' + s.n + ')', lx + 18, fr.T + 9); lx += ctx.measureText(muscle(s.key).short + ' (n = ' + s.n + ')').width + 32; });
  ctx.restore();
  return fr;
}
function drawAmp(ctx, w, h, R, C) {
  // mean ± SD of the window means and peaks, one pair of bars per muscle
  const chs = R.pr.ch, n = chs.length;
  const vals = chs.map((c, k) => ({ m: mean(C.st.map((s) => s[k].mean)), ms: sd(C.st.map((s) => s[k].mean)), p: mean(C.st.map((s) => s[k].peak)), ps: sd(C.st.map((s) => s[k].peak)) }));
  const mx = Math.max(...vals.map((v) => (v.p || 0) + (v.ps || 0)), 1) * 1.1;
  const fr = frame(w, h, 0, n, 0, mx, { L: 60, B: 30 });
  axes(ctx, fr, { ylab: R.ni.unit, noX: true });
  if (R.ni.unit === '%MVIC' || R.ni.unit === '% ref') { ctx.save(); ctx.strokeStyle = '#94a3b8'; ctx.setLineDash([5, 4]); const y = fr.Y(100); if (y > fr.T) { ctx.beginPath(); ctx.moveTo(fr.L, y); ctx.lineTo(fr.L + fr.W, y); ctx.stroke(); } ctx.restore(); }
  const bw = Math.min(46, fr.W / n / 3);
  ctx.save(); ctx.font = '600 12px system-ui'; ctx.textAlign = 'center';
  vals.forEach((v, k) => {
    const cx = fr.X(k + 0.5), col = muscle(chs[k].key).col;
    [[v.m, v.ms, -bw / 2 - 2, 1], [v.p, v.ps, bw / 2 + 2, 0.45]].forEach(([m, s, dx, a]) => {
      if (!Number.isFinite(m)) return;
      ctx.globalAlpha = a; ctx.fillStyle = col; ctx.fillRect(cx + dx - bw / 2, fr.Y(m), bw, fr.Y(0) - fr.Y(m)); ctx.globalAlpha = 1;
      if (Number.isFinite(s)) { ctx.strokeStyle = '#1f2a33'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(cx + dx, fr.Y(m - s)); ctx.lineTo(cx + dx, fr.Y(m + s)); ctx.moveTo(cx + dx - 5, fr.Y(m + s)); ctx.lineTo(cx + dx + 5, fr.Y(m + s)); ctx.moveTo(cx + dx - 5, fr.Y(m - s)); ctx.lineTo(cx + dx + 5, fr.Y(m - s)); ctx.stroke(); }
    });
    ctx.fillStyle = col; ctx.fillText(muscle(chs[k].key).short, cx, fr.T + fr.H + 16);
  });
  ctx.fillStyle = '#5b6770'; ctx.textAlign = 'right'; ctx.font = '11px system-ui'; ctx.fillText('solid = mean, pale = peak (mean ± SD of the ' + C.W.length + ' ' + (A.winType === 'reps' ? W().many : 'windows') + ')' + (R.ni.unit === '%MVIC' ? '; dashed line = 100% MVIC' : R.ni.unit === '% ref' ? '; dashed line = the reference (100%)' : ''), fr.L + fr.W, fr.T + 10);
  ctx.restore();
  return fr;
}

// Long-format CSV: one row per result.
export function resultRows(R, type, labels) {
  const C = compute(R, type), unit = R.ni.unit, chs = R.pr.ch, L = labels || A.S.labels || {};
  const head = ['participant', 'exercise', 'trial', 'file', 'window_type', 'window', 'muscle', 'measure', 'value', 'unit'];
  const rows = [head];
  const base = [L.athlete || '', L.condition || '', L.trial || '', R.t.name, WT()[type]];
  C.W.forEach((w, j) => {
    rows.push(base.concat([w.name, '', 'duration', ((w.i1 - w.i0) / R.fs).toFixed(4), 's']));
    C.st[j].forEach((s, k) => {
      const m = muscle(chs[k].key).short, u = s.normed ? unit : 'µV';
      rows.push(base.concat([w.name, m, 'peak', s.peak.toFixed(3), u]), base.concat([w.name, m, 'mean', s.mean.toFixed(3), u]), base.concat([w.name, m, 'time_of_peak', s.tPeak.toFixed(4), 's']), base.concat([w.name, m, 'time_of_peak_pct', s.pPeak.toFixed(1), '%']), base.concat([w.name, m, 'iEMG', s.iemg.toFixed(4), u + '·s']));
    });
    if (C.cc[j]) rows.push(base.concat([w.name, muscle(chs[C.pr.cA].key).short + ' & ' + muscle(chs[C.pr.cB].key).short, 'co-contraction_index', C.cc[j].ci.toFixed(2), '%']));
    if (C.pr.rA >= 0 && C.pr.rB >= 0 && C.pr.rA !== C.pr.rB && C.st[j][C.pr.rA].normed && C.st[j][C.pr.rB].normed) rows.push(base.concat([w.name, muscle(chs[C.pr.rA].key).short + ':' + muscle(chs[C.pr.rB].key).short, 'ratio_of_means', (C.st[j][C.pr.rA].mean / C.st[j][C.pr.rB].mean).toFixed(3), '']));
  });
  R.bursts.forEach((b) => b.per.forEach((p, k) => {
    if (!Number.isFinite(p.on)) return;
    const m = muscle(chs[k].key).short, bb = [L.athlete || '', L.condition || '', L.trial || '', R.t.name, R.reps.length ? WT().reps : 'Whole trial', b.w.name, m];
    rows.push(bb.concat(['onset' + (p.auto ? '_auto' : ''), p.on.toFixed(4), 's']), bb.concat(['onset_pct', p.onP.toFixed(1), '%']));
    if (Number.isFinite(p.active)) rows.push(bb.concat(['active_pct', p.active.toFixed(1), '%']));
    if (Number.isFinite(p.off)) rows.push(bb.concat(['offset', p.off.toFixed(4), 's']), bb.concat(['offset_pct', p.offP.toFixed(1), '%']), bb.concat(['burst_duration', p.dur.toFixed(4), 's']));
  }));
  if (C.avgOn) C.avgOn.forEach((a, k) => {
    if (!a) return; const bb = base.slice(0, 4).concat([WT().reps, 'Average ' + WW().one, muscle(chs[k].key).short]);
    rows.push(bb.concat(['active_pct', a.active.toFixed(1), '%']));
    a.B.forEach((b, j) => rows.push(bb.concat(['burst' + (j + 1) + '_on_pct', String(b.on), '%']), bb.concat(['burst' + (j + 1) + '_off_pct', String(b.off), '%'])));
  });
  if (C.avgOn && C.pr.cA >= 0 && C.pr.cB >= 0 && C.avgOn[C.pr.cA] && C.avgOn[C.pr.cB]) rows.push(base.slice(0, 4).concat([WT().reps, 'Average ' + WW().one, muscle(chs[C.pr.cA].key).short + ' & ' + muscle(chs[C.pr.cB].key).short, 'both_on_pct', bothOn(C.avgOn[C.pr.cA], C.avgOn[C.pr.cB]).toFixed(1), '%']));
  if (C.wf) C.wf.forEach((w) => { if (!w.none) rows.push(base.slice(0, 4).concat([WT().reps, 'Average waveform', muscle(w.key).short, 'variance_ratio', Number.isFinite(w.vr) ? w.vr.toFixed(3) : '', ''])); });
  return rows;
}
export { trialLabel };
const WW = W;
