// Tab 2: reps and phases. First, in plain words, how the reps and phases in this file are defined. Then the
// two ways to make them: found automatically from a movement signal (events.js), or marked by hand. Then each
// muscle's onset and offset, a rest period, markers, and your own windows between any two points.
import { A, $, esc, persist, status, uid, muscle, POINT_COL, SET, W, ptName, PHASE_COLS, isCyclic } from './state.js?v=1.4.0';
import { setView, cursorChanged } from './trace.js?v=1.4.0';
import { pointLabel } from './emg.js?v=1.4.0';
import { findSet, signalOptions, resolve, runFinder, finderLevel, describeFind, MODES, PRESETS } from './events.js?v=1.4.0';
import { findIn } from './session.js?v=1.4.0';

const HELP = {
  rep0: 'the moment the rep (or cycle) begins, e.g. the start of the lowering',
  rep1: 'the moment the rep ends, e.g. back upright. With no Rep ends, each Rep start runs to the next one (for cycles such as gait)',
  phase: 'where one phase of the rep becomes the next, e.g. the bottom of a squat (lowering → lifting)',
  on: 'where this muscle&rsquo;s EMG clearly rises above its resting level',
  off: 'where it clearly falls back to rest',
  rest0: 'the start of a quiet period (participant relaxed)', rest1: 'the end of the quiet period'
};

function add(type, extra) {
  const R = A.R; if (!R || !R.ok) return;
  if (A.cursor < 0) { status('Click the graph first to put the cursor where the point is, then press <strong>' + esc(ptName(type)) + '</strong>.'); return; }
  const p = Object.assign({ id: uid(), type, t: A.cursor / R.fs }, extra || {});
  if (type === 'on' || type === 'off') {
    if (!(A.lane >= 0 && R.pr.ch[A.lane])) { status('Choose the muscle first: click its lane on the graph (or pick it in the list).'); return; }
    p.m = R.pr.ch[A.lane].key;
  }
  const S = A.S; S.points = S.points || [];
  if (/^(rest|hold)/.test(type)) S.points = S.points.filter((q) => q.type !== type);
  S.points.push(p); S.points.sort((a, b) => a.t - b.t);
  persist(); A.fn.refresh({ keepView: true });
  status(esc(pointLabel(p)) + ' marked at ' + p.t.toFixed(3) + ' s (sample ' + A.cursor + '). Check it on the graph; drag its label or nudge it in the table to move it.');
}

const QUICK = [['Lowering', 'Lifting'], ['Lifting', 'Lowering'], ['Eccentric', 'Concentric'], ['Concentric', 'Eccentric'], ['Stance', 'Swing'], ['Downstroke', 'Upstroke'], ['Before take-off', 'Flight', 'After landing']];
const chipS = (txt, col) => '<span class="dchip" style="background:' + col + '">' + txt + '</span>';
const seg = (txt, col) => '<span class="dseg" style="border-color:' + col + ';background:' + col + '22">' + txt + '</span>';

// "How the reps and phases are defined": a picture of one rep, the rule in a sentence, and where it came from.
function defBox(R, S) {
  const set = SET(), w = W(), cyc = R.cycles, n = R.reps.length;
  let h = '<div class="defbox"><p class="dt">How ' + w.many + ' and phases are defined in this file</p>';
  if (!n) {
    const starts = R.pts.filter((p) => p.type === 'rep0').length;
    h += '<p>No ' + w.many + ' yet. A <strong>' + w.one + '</strong> is one complete go at the movement. Every result (peak, mean, timing) is worked out inside each ' + w.one + ', so the tool needs to know where each one starts and ends.</p>'
      + (starts ? '<p class="warnTxt">There ' + (starts > 1 ? 'are ' + starts + ' ' + esc(w.start.toLowerCase()) + 's' : 'is 1 ' + esc(w.start.toLowerCase())) + ' but no complete ' + w.one + ': each one needs ' + (R.pts.some((p) => p.type === 'rep1') ? 'a <strong>' + esc(w.end) + '</strong> after it.' : 'another ' + esc(w.start.toLowerCase()) + ' (or a ' + esc(w.end) + ') after it.') + '</p>' : '')
      + '<p class="muted">Use <strong>A</strong> below to find them from the movement signal, or <strong>B</strong> to mark them yourself.</p></div>';
    return h;
  }
  const byRep = {}; R.phases.forEach((p) => { (byRep[p.rep] = byRep[p.rep] || []).push(p); });
  const counts = R.reps.map((r) => (byRep[r.rep] ? byRep[r.rep].length : 1)), nPh = Math.max(...counts), names = Array.from({ length: nPh }, (_, j) => set.phaseNames[j] || 'Phase ' + (j + 1));
  // the picture
  h += '<div class="dstrip">' + chipS(esc(w.start), POINT_COL.rep0);
  if (nPh > 1) names.forEach((nm, j) => { h += (j ? chipS('&#9656; ' + esc(nm), POINT_COL.phase) : '') + seg(esc(nm), PHASE_COLS[j % PHASE_COLS.length]); });
  else h += seg('one ' + w.one, '#22c55e');
  h += chipS(cyc ? 'next ' + esc(w.start.toLowerCase()) : esc(w.end), cyc ? POINT_COL.rep0 : POINT_COL.rep1) + '</div>';
  // the rule
  h += '<p>Each <strong>' + w.one + '</strong> runs from ' + (cyc ? 'one <strong>' + esc(w.start.toLowerCase()) + '</strong> to the next.' : 'a <strong>' + esc(w.start) + '</strong> to the <strong>' + esc(w.end) + '</strong> after it.') + ' ';
  h += nPh > 1 ? 'Inside each ' + w.one + ', ' + (nPh === 2 ? 'the <strong>phase change</strong> splits it' : 'the ' + (nPh - 1) + ' <strong>phase changes</strong> split it') + ' into ' + names.map((x) => '<strong>' + esc(x) + '</strong>').join(nPh === 2 ? ' and ' : ', ') + '.' : 'It is not split into phases (that is optional: see B below).';
  h += '</p>';
  // where the points came from
  const auto = R.pts.filter((p) => p.auto && p.pct === undefined && /^(rep|phase)/.test(p.type)).length, hand = R.pts.filter((p) => !p.auto && /^(rep|phase)/.test(p.type)).length;
  if (auto && S.found) h += '<p><span class="tag auto">Found automatically</span> ' + describeFind(S.found, w) + (hand ? ' ' + hand + ' other point' + (hand > 1 ? 's were' : ' was') + ' marked by hand.' : '') + ' <strong>Check each one on the graph</strong>: drag any that look wrong.</p>';
  else if (auto) h += '<p><span class="tag auto">Found automatically</span> Check each one on the graph: drag any that look wrong.</p>';
  else h += '<p><span class="tag hand">Marked by hand</span> Every point was placed by you (or came with the demo).</p>';
  const pctPts = R.pts.filter((p) => p.pct !== undefined);
  if (pctPts.length) h += '<p class="muted">The phase changes were placed at ' + pctPts[0].pct + '% of each ' + w.one + '. That is an estimate, not something measured.</p>';
  // numbers
  const d = R.reps.map((r) => (r.i1 - r.i0) / R.fs), m = d.reduce((a, b) => a + b, 0) / n, sdv = n > 1 ? Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)) : 0;
  h += '<p class="muted"><strong>' + n + ' ' + (n > 1 ? w.many : w.one) + '</strong>, ' + m.toFixed(2) + ' s long on average' + (n > 1 ? ' (SD ' + sdv.toFixed(2) + ' s; shortest ' + Math.min(...d).toFixed(2) + ', longest ' + Math.max(...d).toFixed(2) + ')' : '') + '.'
    + (n > 2 && sdv / m > 0.25 ? ' <span class="warnTxt">They differ a lot in length: check none is missing or doubled.</span>' : '') + '</p>';
  if (nPh > 1 && counts.some((c) => c !== nPh)) h += '<p class="warnTxt">Not every ' + w.one + ' has the same number of phases (' + R.reps.filter((r, j) => counts[j] !== nPh).map((r) => esc(r.name)).join(', ') + ' ha' + (counts.filter((c) => c !== nPh).length > 1 ? 've' : 's') + ' fewer). Add or delete phase changes so they match.</p>';
  if (R.skipped) h += '<p class="warnTxt">' + R.skipped + ' gap' + (R.skipped > 1 ? 's' : '') + ' between ' + esc(w.start.toLowerCase()) + 's ' + (R.skipped > 1 ? 'were' : 'was') + ' much longer than usual (a missed one?), so ' + (R.skipped > 1 ? 'they are' : 'it is') + ' left out. Add the missing ' + esc(w.start.toLowerCase()) + ' to use ' + (R.skipped > 1 ? 'them' : 'it') + '.</p>';
  // phase names
  if (nPh > 1) h += '<div class="row tight dnames"><span class="lab inl">Phase names</span>' + names.map((nm, j) => '<input type="text" class="mini" data-ph="' + j + '" value="' + esc(nm) + '" aria-label="Name of phase ' + (j + 1) + '" style="border-left:5px solid ' + PHASE_COLS[j % PHASE_COLS.length] + '">').join('')
    + '<select id="phQuick" class="mini" style="width:auto" aria-label="Common phase names"><option value="">Common names&hellip;</option>' + QUICK.filter((q) => q.length === nPh).map((q) => '<option>' + q.join(' | ') + '</option>').join('') + '</select></div>';
  return h + '</div>';
}

// A: finding the reps from a movement signal.
function finderHtml(R, S) {
  const w = W(), f = findSet(), opts = signalOptions(R.pr), rs = resolve(R.pr, f), sensors = Object.keys(R.pr.acc);
  const nAuto = (S.points || []).filter((p) => p.auto).length;
  const pre = runFinder(R.pr, f), lvl = finderLevel(R.pr, f), unit = pre.sig ? pre.sig.unit : '';
  const sel = (id, list, cur) => '<select id="' + id + '" class="mini" style="width:auto;max-width:100%">' + list.map(([v, l]) => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>';
  let h = '<h3>A. Find the ' + w.many + ' automatically</h3>';
  if (!opts.length) return h + '<p class="muted">This file has no signal to look in. Mark the ' + w.many + ' by hand below.</p>';
  h += '<p style="margin:.2rem 0">Set up for <strong>' + PRESETS[f.preset].name.split(' (')[0] + '</strong> <span class="muted">(change this under &ldquo;What are you analysing?&rdquo; in Your files at the top).</span></p>'
    + '<div class="tip">' + (S.found && S.found.n ? '' : '<p>' + (pre.info && pre.info.n ? '<strong>What it will do:</strong> ' + describeFind(pre.info, w) : (pre.why || 'Nothing found yet.')) + '</p>')
    + (!rs.usesAcc && /^(impact|tilt|mag|move|ax)/.test(f.signal) ? '<p class="warnTxt">This file has no accelerometer, so the ' + esc(pre.sig ? pre.sig.name : 'EMG') + ' is used instead.</p>' : '')
    + (f.signal === 'tilt' && rs.usesAcc ? '<p class="muted">Tilt only works if the sensor is on a part of the body that <strong>moves</strong> (e.g. the thigh in a squat). If its line on the movement lane is flat, choose another sensor or mark by hand.</p>' : '') + '</div>';
  h += '<div class="row tight">' + (rs.usesAcc && sensors.length > 1 ? '<label class="inline" for="fnSensor" style="margin:0">Sensor</label>' + sel('fnSensor', sensors.map((k) => [k, esc(muscle(k).short || k)]), rs.sensor) : '')
    + '<button type="button" class="btn accent" id="fnGo">Find ' + w.many + '</button>'
    + '<span class="muted">' + (pre.info && pre.info.n ? 'would find <strong>' + pre.info.n + '</strong>' : 'would find none') + (nAuto ? '; ' + (S.points || []).filter((p) => p.auto && p.type === 'rep0').length + ' on the graph now' : '') + '</span>'
    + (nAuto ? '<button type="button" class="btn small ghost" id="fnClear">Remove the ones found</button>' : '') + '</div>';
  h += '<details class="more" id="fnMore"' + (A.fnOpen ? ' open' : '') + '><summary>Change how they are found</summary>'
    + '<div class="fgrid"><label for="fnSignal">1. Which signal?</label>' + sel('fnSignal', opts, rs.signal)
    + '<label for="fnMode">2. What to look for?</label>' + sel('fnMode', Object.entries(MODES), f.mode)
    + '<label for="fnDir">Direction</label>' + sel('fnDir', f.mode === 'cycle' || f.mode === 'peaks' ? [['above', 'peaks (the highest points)'], ['below', 'dips (the lowest points)']] : [['above', 'above the level'], ['below', 'below the level']], f.dir)
    + '<label>3. Limits</label><div class="row tight">'
    + (f.mode === 'cycle' ? '<label class="inline" for="fnT" style="margin:0">One cycle takes</label><input type="number" id="fnT" class="mini num4" min="0" max="10" step="0.01" value="' + (f.T > 0 ? f.T : '') + '" placeholder="auto"> s <span class="muted">' + (pre.info && pre.info.T ? '(now ' + pre.info.T.toFixed(2) + ' s' + (pre.info.autoT ? ', automatic' : '') + ')' : '') + '</span>'
      : '<label class="inline" for="fnLevel" style="margin:0">Level</label><input type="number" id="fnLevel" class="mini num4" step="any" value="' + (Number.isFinite(f.level) && f.level !== null ? f.level : '') + '" placeholder="auto"> ' + esc(unit) + ' <span class="muted">' + (lvl !== null ? '(now ' + (+lvl.toPrecision(3)) + (Number.isFinite(f.level) && f.level !== null ? '' : ', automatic') + ': the dashed line on the movement lane)' : '') + '</span>')
    + (f.mode === 'peaks' ? '<label class="inline" for="fnGap" style="margin:0 0 0 .6rem">at least</label><input type="number" id="fnGap" class="mini num4" min="0.05" max="20" step="0.05" value="' + f.gap + '"> s apart' : '')
    + (f.mode === 'thereback' || f.mode === 'level' ? '<label class="inline" for="fnMin" style="margin:0 0 0 .6rem">lasting at least</label><input type="number" id="fnMin" class="mini num4" min="0" max="60" step="0.05" value="' + f.minDur + '"> s' : '')
    + (f.mode === 'level' ? '<label class="inline" for="fnBefore" style="margin:0 0 0 .6rem">include</label><input type="number" id="fnBefore" class="mini num4" min="0" max="30" step="0.1" value="' + (f.before || 0) + '"> s before and <input type="number" id="fnAfter" class="mini num4" min="0" max="30" step="0.1" value="' + (f.after || 0) + '"> s after' : '')
    + '</div></div>'
    + '<p class="muted">The <strong>movement lane</strong> under the muscles shows the signal being used (switch on <strong>Movement signal</strong> above the graph). Change a setting and the ' + w.many + ' are found again straight away, so you can see what each one does. '
    + ({ cycle: 'A steady rhythm suits running, walking and cycling: the cycle time is worked out from the signal, then exactly one event is taken in each cycle, so the knock of the other foot is not counted.', peaks: 'Every clear peak suits movements without a steady rhythm. Raise the level or the gap if it finds too many.', thereback: 'Out and back suits any rep that leaves a start position and returns to it. Raise the level if small movements between reps are being counted.', level: 'Above or below a level suits holds (EMG above a level) and jumps (in flight, the accelerometer reads close to 0 g).' }[f.mode])
    + '</p><div class="row tight"><button type="button" class="btn small ghost" id="fnReset">Back to the settings for ' + PRESETS[f.preset].name.split(' (')[0].toLowerCase() + '</button></div></details>';
  return h;
}

export function renderPoints() {
  const el = $('ptsBox'); if (!el) return;
  const R = A.R; if (!R || !R.ok) { el.innerHTML = '<p class="muted">Open a file first.</p>'; return; }
  const S = A.S, set = SET(), mv = R.mvic;
  let h = '';
  if (mv) {
    h += '<div class="tip"><p>This is an <strong>MVIC file</strong>. You don&rsquo;t need to mark anything: the tool uses the highest part of the whole recording. If part of it is not a real effort (e.g. a knock or a cough), click the graph at the start of the real effort and press <strong>MVIC start</strong>, then do the same for <strong>MVIC end</strong>: only that part is used.</p></div>';
    h += '<div class="chips evchips"><button type="button" class="btn accent small" data-pt="hold0">MVIC start</button><button type="button" class="btn accent small" data-pt="hold1">MVIC end</button></div>';
  } else {
    const w = W(), cyc = isCyclic();
    h += defBox(R, S) + finderHtml(R, S);
    h += '<h3>B. Or mark them by hand</h3>'
      + '<ol class="steps-how"><li><strong>Click the graph</strong> near the moment you want.</li><li>Press <strong>Zoom to the cursor</strong> above the graph, then step with <kbd>&larr;</kbd> <kbd>&rarr;</kbd> until the cursor is exactly on it.</li><li>Press one of these buttons. To move a point afterwards, drag its label on the graph.</li></ol>'
      + '<div class="chips evchips"><button type="button" class="btn accent small" data-pt="rep0" title="' + HELP.rep0 + '">' + esc(w.start) + '</button><button type="button" class="btn small" data-pt="phase" style="background:#7c3aed" title="' + HELP.phase + '">Phase change</button>' + (cyc ? '' : '<button type="button" class="btn small danger" data-pt="rep1" title="' + HELP.rep1 + '">' + esc(w.end) + '</button>') + '</div>'
      + '<p class="muted" style="margin:.2rem 0">' + (cyc ? '<strong>' + esc(w.start) + ':</strong> the start of each ' + w.one + '; each one runs to the next. <strong>Phase change:</strong> optional, e.g. ' + (set.activity === 'gait' ? 'toe-off, to split each stride into stance and swing.' : 'bottom dead centre, to split the downstroke and upstroke.') : '<strong>' + esc(w.start) + ':</strong> ' + HELP.rep0 + '. <strong>Phase change:</strong> ' + HELP.phase + '. <strong>' + esc(w.end) + ':</strong> ' + HELP.rep1 + '.') + '</p>';
    if (R.reps.length) h += '<div class="row tight"><span class="muted">No clear moment to mark? Put a phase change at</span><input type="number" id="pcPct" class="mini num4" min="1" max="99" step="1" value="' + (set.activity === 'gait' ? 38 : 50) + '"><span class="muted">% of every ' + w.one + '</span><button type="button" class="btn small" id="pcGo">Add</button>'
      + (R.pts.some((p) => p.pct !== undefined) ? '<button type="button" class="btn small ghost" id="pcClear">Remove these</button>' : '') + '<span class="muted small">' + (set.activity === 'gait' ? 'Toe-off is at about 35&ndash;40% of the stride when running and about 60% when walking (an estimate: mark it from video if it matters).' : '') + '</span></div>';
    const opts = R.pr.ch.map((c, k) => '<option value="' + k + '"' + (k === A.lane ? ' selected' : '') + '>' + esc(muscle(c.key).short) + '</option>').join('');
    h += '<details class="more"' + (R.autoOn ? '' : ' open') + '><summary>C. When each muscle switches on and off <span class="muted">(' + (R.autoOn ? 'found automatically: open this only to mark them yourself' : 'you are marking them by hand') + ')</span></summary>'
      + '<p class="muted" style="margin:.2rem 0">This is separate from the phases: a <strong>phase</strong> is part of the movement, an <strong>onset</strong> is the moment a muscle&rsquo;s EMG rises. ' + (R.autoOn ? 'Onsets and offsets are found <strong>automatically</strong> at the moment (see <strong>Step 3 (Results)</strong>; settings in Go deeper &rarr; <strong>On/off</strong>). Once you mark one by hand, the tool uses only the ones you mark.' : 'Delete every Onset and Offset to go back to finding them automatically.') + '</p>'
      + '<div class="row tight"><label class="inline" for="ptLane" style="margin:0">Muscle</label><select id="ptLane" class="mini" style="width:auto">' + (A.lane < 0 ? '<option value="-1">Choose&hellip;</option>' : '') + opts + '</select>'
      + '<button type="button" class="btn small" data-pt="on" style="background:' + POINT_COL.on + '">Onset</button><button type="button" class="btn small" data-pt="off" style="background:' + POINT_COL.off + '">Offset</button></div>'
      + '<p class="muted" style="margin:.3rem 0"><strong>Onset:</strong> ' + HELP.on + '; <strong>offset:</strong> ' + HELP.off + '. Mark one onset and offset per muscle in each ' + w.one + '. Judging it by eye is the most accurate method there is (Hodges and Bui, 1996), but be consistent: zoom in to the same level each time and look for the first clear, lasting rise. Need help? Mark a rest period below and switch on <strong>Onset guide</strong> above the graph.</p></details>';
    h += '<details class="more"' + (R.rest ? ' open' : '') + '><summary>Rest period <span class="muted">(optional: for the onset guide and the noise check)</span></summary>'
      + '<div class="row tight"><button type="button" class="btn ghost small" data-pt="rest0">Rest start</button><button type="button" class="btn ghost small" data-pt="rest1">Rest end</button></div>'
      + '<p class="muted">Mark 0.5 to 1 s where the participant is relaxed. The guide line is the rest mean + ' + set.guideK + ' SD of a ' + set.guideFc + ' Hz envelope (Hodges and Bui, 1996). It is a guide only: noise or a spike can cross it, and slow rises cross it late.</p>'
      + '<div class="row"><div><label for="guideK">Guide: rest mean + (SD)</label><input type="number" id="guideK" min="1" max="10" step="0.5" value="' + set.guideK + '"></div><div><label for="guideFc">Guide envelope cut-off (Hz)</label><input type="number" id="guideFc" min="5" max="200" step="5" value="' + set.guideFc + '"></div></div>'
      + (R.guide ? '<table><thead><tr><th>Muscle</th><th>Rest mean</th><th>Rest SD</th><th>Guide line</th><th>Rest noise (RMS)</th></tr></thead><tbody>' + R.guide.map((g, k) => g ? '<tr><td>' + esc(muscle(R.pr.ch[k].key).short) + '</td><td class="num">' + g.mean.toFixed(2) + '</td><td class="num">' + g.sd.toFixed(2) + '</td><td class="num">' + g.thr.toFixed(2) + ' ' + R.ni.unit + '</td><td class="num">' + g.restRms.toFixed(1) + ' µV' + (g.restRms > 10 ? ' <span class="bad">high</span>' : '') + '</td></tr>' : '').join('') + '</tbody></table>' : '')
      + '</details>';
    h += '<div class="row tight" style="margin:.3rem 0"><input type="text" id="mkName" class="mini" placeholder="Marker name (optional, e.g. Heel strike)" style="width:16rem"><button type="button" class="btn ghost small" data-pt="mark">Add marker</button><span class="muted small">A marker is a label on the graph. It does not change any result.</span></div>';
  }
  // points table
  const P = R.pts;
  if (!P.length) h += '<p class="muted">No points yet.</p>';
  else {
    h += '<details class="more"' + (P.length <= 12 || mv ? ' open' : '') + '><summary>Every point in this file (' + P.length + ')</summary><div class="tablewrap" style="max-height:330px"><table><thead><tr><th>Point</th><th>Time (s)</th><th>Sample</th><th>Move</th><th></th></tr></thead><tbody>';
    P.forEach((p) => {
      h += '<tr><td><button class="btn small ghost" type="button" data-go="' + p.i + '" title="Show on the graph">&#8982;</button> <span class="swatch" style="background:' + (POINT_COL[p.type] || '#2563eb') + '"></span>' + esc(pointLabel(p)) + (p.phName ? ' <span class="muted small">&#9656; ' + esc(p.phName) + '</span>' : '') + (p.auto ? ' <span class="muted small">auto</span>' : '') + '</td>'
        + '<td class="num">' + (p.i / R.fs).toFixed(3) + '</td><td class="num">' + p.i + '</td><td class="nowrap">'
        + [-10, -1, 1, 10].map((d) => '<button class="btn small ghost" type="button" data-id="' + p.id + '" data-d="' + d + '" title="' + (d > 0 ? 'Later' : 'Earlier') + ' by ' + Math.abs(d) + ' sample' + (Math.abs(d) > 1 ? 's' : '') + '">' + (d === -10 ? '&laquo;' : d === -1 ? '&lsaquo;' : d === 1 ? '&rsaquo;' : '&raquo;') + '</button>').join('')
        + '</td><td><button class="btn small ghost" type="button" data-del="' + p.id + '">Delete</button></td></tr>';
    });
    h += '</tbody></table></div><div class="row tight"><button class="btn small ghost" type="button" id="ptClear">Delete every point</button></div></details>';
  }
  if (!mv) {
    h += '<h3>Windows</h3>';
    const WS = R.reps.concat(R.phases, R.own);
    if (WS.length) h += '<details class="more"><summary>' + R.reps.length + ' ' + (R.reps.length === 1 ? W().one : W().many) + (R.phases.length ? ', ' + R.phases.length + ' phases' : '') + (R.own.length ? ', ' + R.own.length + ' of your own' : '') + '</summary><ul class="plain wins">' + WS.map((w) => '<li><strong>' + esc(w.name) + '</strong> ' + (w.i0 / R.fs).toFixed(3) + ' to ' + (w.i1 / R.fs).toFixed(3) + ' s (' + ((w.i1 - w.i0) / R.fs).toFixed(3) + ' s)' + (w.kind === 'own' ? ' <button class="btn small ghost" type="button" data-wdel="' + w.id + '">Remove</button>' : '') + '</li>').join('') + '</ul></details>';
    if (P.length >= 2) {
      const opts = P.map((p) => '<option value="' + p.id + '">' + esc(pointLabel(p)) + ' @ ' + (p.i / R.fs).toFixed(3) + ' s</option>').join('');
      h += '<details class="more"><summary>Add your own window (between any two points)</summary><div class="row">'
        + '<div><label for="wName">Name</label><input type="text" id="wName" placeholder="e.g. First 200 ms"></div>'
        + '<div><label for="wA">From</label><select id="wA">' + opts + '</select></div><div><label for="wB">To</label><select id="wB">' + opts + '</select></div>'
        + '<div class="auto"><button class="btn small" type="button" id="wAdd">Add window</button></div></div></details>';
    }
  }
  el.innerHTML = h;
  if ($('wB')) $('wB').selectedIndex = Math.min(1, P.length - 1);

  // A: the finder
  const f = findSet(), again = (o) => { persist(); if (S.found) findIn(S, true); A.fn.refresh({ keepView: true, keepStatus: true }); };
  if ($('fnMore')) $('fnMore').addEventListener('toggle', function () { A.fnOpen = this.open; });
  if ($('fnGo')) $('fnGo').addEventListener('click', () => {
    const hand = (S.points || []).filter((p) => !p.auto && /^(rep|phase)/.test(p.type));
    if (hand.length && confirm('Replace the ' + hand.length + ' rep and phase points you marked by hand with the ones found? (Cancel keeps both.)')) S.points = S.points.filter((p) => !hand.includes(p));
    const r = findIn(S);
    A.show.acc = true; A.show.reps = true; persist(); A.fn.refresh({ keepView: true, keepStatus: true });
    if (!r.n) { status('<span class="bad">' + (r.why || 'Nothing found.') + ' Open <strong>Change how they are found</strong>, try another sensor, or mark them by hand.</span>'); return; }
    status('Found ' + r.n + ' ' + (r.n > 1 ? W().many : W().one) + (r.T ? ' (one about every ' + r.T.toFixed(2) + ' s, ' + (60 / r.T).toFixed(0) + ' a minute)' : '') + '. <strong>Check each one on the graph</strong> before you use the results: drag any that look wrong.' + (r.phases ? ' Then name the phases in the box at the top of this tab (e.g. Lowering and Lifting).' : ''));
  });
  if ($('fnClear')) $('fnClear').addEventListener('click', () => { S.points = S.points.filter((p) => !p.auto); S.found = null; persist(); A.fn.refresh({ keepView: true }); });
  if ($('fnSensor')) $('fnSensor').addEventListener('change', function () { f.sensor = this.value; again(); });
  if ($('fnSignal')) $('fnSignal').addEventListener('change', function () { f.signal = this.value; f.level = null; f.T = 0; A.show.acc = true; again(); });
  if ($('fnMode')) $('fnMode').addEventListener('change', function () { f.mode = this.value; f.level = null; again(); });
  if ($('fnDir')) $('fnDir').addEventListener('change', function () { f.dir = this.value; f.level = null; again(); });
  const numIn = (id, key, empty) => { if ($(id)) $(id).addEventListener('change', function () { const v = this.value.trim() === '' ? NaN : +this.value; f[key] = Number.isFinite(v) && (key === 'level' || v >= 0) ? v : empty; again(); }); };
  numIn('fnT', 'T', 0); numIn('fnLevel', 'level', null); numIn('fnGap', 'gap', 0.5); numIn('fnMin', 'minDur', 0.3); numIn('fnBefore', 'before', 0); numIn('fnAfter', 'after', 0);
  if ($('fnReset')) $('fnReset').addEventListener('click', () => { Object.assign(f, { level: null, T: 0, gap: 0.5, minDur: 0.3, before: 0, after: 0 }, PRESETS[f.preset].set); again(); });
  // phases at a fixed % of every rep
  if ($('pcGo')) $('pcGo').addEventListener('click', () => {
    const pc = Math.max(1, Math.min(99, +$('pcPct').value || 50));
    S.points = (S.points || []).filter((p) => p.pct === undefined).concat(R.reps.map((r) => ({ id: uid(), type: 'phase', t: (r.i0 + (r.i1 - r.i0) * pc / 100) / R.fs, auto: true, pct: pc }))).sort((a, b) => a.t - b.t);
    persist(); A.fn.refresh({ keepView: true, keepStatus: true });
    status('A phase change was added at ' + pc + '% of every ' + W().one + '. Name the two phases in the box at the top of this tab.');
  });
  if ($('pcClear')) $('pcClear').addEventListener('click', () => { S.points = S.points.filter((p) => p.pct === undefined); persist(); A.fn.refresh({ keepView: true }); });
  if ($('phQuick')) $('phQuick').addEventListener('change', function () { if (!this.value) return; this.value.split(' | ').forEach((nm, j) => { set.phaseNames[j] = nm; }); persist(); A.fn.refresh({ keepView: true }); });
  el.querySelectorAll('[data-pt]').forEach((b) => b.addEventListener('click', () => add(b.getAttribute('data-pt'), b.getAttribute('data-pt') === 'mark' ? { name: ($('mkName').value || '').trim() } : null)));
  el.querySelectorAll('[data-ph]').forEach((i) => i.addEventListener('change', function () { set.phaseNames[+this.getAttribute('data-ph')] = this.value.trim() || 'Phase ' + (+this.getAttribute('data-ph') + 1); persist(); A.fn.refresh({ keepView: true }); }));
  if ($('ptLane')) $('ptLane').addEventListener('change', function () { A.lane = +this.value; A.fn.laneChanged(); });
  ['guideK', 'guideFc'].forEach((id) => { if ($(id)) $(id).addEventListener('change', function () { const v = +this.value; if (v > 0) { set[id] = v; persist(); A.fn.refresh({ keepView: true }); } }); });
  el.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { const i = +b.getAttribute('data-go'); A.cursor = i; A.pinned = true; const c = i / R.fs, wv = Math.min(A.view.x1 - A.view.x0, 1); setView(c - wv / 2, c + wv / 2); cursorChanged(); }));
  el.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => {
    const p = S.points.find((q) => q.id === b.getAttribute('data-id')); if (!p) return;
    const i = Math.max(0, Math.min(R.n - 1, Math.round(p.t * R.fs) + +b.getAttribute('data-d'))); p.t = i / R.fs;
    A.cursor = i; A.pinned = true; persist(); A.fn.refresh({ keepView: true }); cursorChanged();
  }));
  el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { const id = b.getAttribute('data-del'); S.points = S.points.filter((q) => q.id !== id); S.wins = (S.wins || []).filter((w) => w.a !== id && w.b !== id); persist(); A.fn.refresh({ keepView: true }); }));
  el.querySelectorAll('[data-wdel]').forEach((b) => b.addEventListener('click', () => { S.wins = (S.wins || []).filter((w) => w.id !== b.getAttribute('data-wdel')); persist(); A.fn.refresh({ keepView: true }); }));
  if ($('ptClear')) $('ptClear').addEventListener('click', () => { if (!confirm('Delete every point in this trial?')) return; S.points = []; S.wins = []; persist(); A.fn.refresh({ keepView: true }); });
  if ($('wAdd')) $('wAdd').addEventListener('click', () => {
    const a = $('wA').value, b = $('wB').value; if (a === b) { status('Choose two different points.'); return; }
    S.wins = S.wins || []; S.wins.push({ id: uid(), a, b, name: $('wName').value.trim() || 'My window ' + (S.wins.length + 1) });
    A.winType = 'own'; persist(); A.fn.refresh({ keepView: true }); status('Window added. Its results are in <strong>Step 3 (Results)</strong> (choose <em>My windows</em>).');
  });
}
