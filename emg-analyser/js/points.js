// Tab 2: marking points by hand. Reps (start and end), phase changes, each muscle's onset and offset,
// a rest period (for the onset guide line), markers, and your own windows between any two points.
import { A, $, esc, persist, status, uid, muscle, POINT_COL, POINT_NAME, SET } from './state.js?v=1.0.0';
import { setView, cursorChanged } from './trace.js?v=1.0.0';
import { pointLabel } from './emg.js?v=1.0.0';

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
  if (A.cursor < 0) { status('Click the graph first to put the cursor where the point is, then press <strong>' + esc(POINT_NAME[type]) + '</strong>.'); return; }
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

export function renderPoints() {
  const el = $('ptsBox'); if (!el) return;
  const R = A.R; if (!R || !R.ok) { el.innerHTML = '<p class="muted">Open a file first.</p>'; return; }
  const S = A.S, set = SET(), mv = R.mvic;
  let h = '<ol class="steps-how"><li><strong>Click the graph</strong> near the moment you want (click inside a muscle&rsquo;s lane to choose that muscle).</li><li>Press <strong>Zoom to the cursor</strong> above the graph, then step with <kbd>&larr;</kbd> <kbd>&rarr;</kbd> until the cursor is exactly on it.</li><li>Press the button below.</li></ol>';
  if (mv) {
    h += '<div class="tip"><p>This is an <strong>MVIC file</strong>. You don&rsquo;t need to mark anything: the tool uses the highest part of the whole recording. If part of it is not a real effort (e.g. a knock or a cough), mark <strong>MVIC start</strong> and <strong>MVIC end</strong> around the effort and only that part is used.</p></div>';
    h += '<div class="chips evchips"><button type="button" class="btn accent small" data-pt="hold0">MVIC start</button><button type="button" class="btn accent small" data-pt="hold1">MVIC end</button></div>';
  } else {
    h += '<h3>1. Reps <span class="muted">(or cycles)</span></h3>'
      + '<div class="chips evchips"><button type="button" class="btn accent small" data-pt="rep0" title="' + HELP.rep0 + '">Rep start</button><button type="button" class="btn small" data-pt="phase" style="background:#7c3aed" title="' + HELP.phase + '">Phase change</button><button type="button" class="btn small danger" data-pt="rep1" title="' + HELP.rep1 + '">Rep end</button></div>'
      + '<p class="muted" style="margin:.2rem 0"><strong>Rep start:</strong> ' + HELP.rep0 + '. <strong>Phase change:</strong> ' + HELP.phase + '. <strong>Rep end:</strong> ' + HELP.rep1 + '. Use the accelerometer lane (or video) to see the movement.</p>'
      + '<details class="more"><summary>Phase names <span class="muted">(' + esc(set.phaseNames.slice(0, 2).join(', ')) + ' &hellip;)</span></summary><div class="row">'
      + set.phaseNames.map((n, j) => '<div><label for="ph' + j + '">Phase ' + (j + 1) + '</label><input type="text" id="ph' + j + '" data-ph="' + j + '" value="' + esc(n) + '"></div>').join('') + '</div><p class="muted">E.g. <em>Lowering</em> and <em>Lifting</em>, or <em>Eccentric</em> and <em>Concentric</em>. Two phase changes make three phases.</p></details>';
    const opts = R.pr.ch.map((c, k) => '<option value="' + k + '"' + (k === A.lane ? ' selected' : '') + '>' + esc(muscle(c.key).short) + '</option>').join('');
    h += '<h3>2. Onset and offset of each muscle</h3>'
      + '<div class="row tight"><label class="inline" for="ptLane" style="margin:0">Muscle</label><select id="ptLane" class="mini" style="width:auto">' + (A.lane < 0 ? '<option value="-1">Choose&hellip;</option>' : '') + opts + '</select>'
      + '<button type="button" class="btn small" data-pt="on" style="background:' + POINT_COL.on + '">Onset</button><button type="button" class="btn small" data-pt="off" style="background:' + POINT_COL.off + '">Offset</button></div>'
      + '<p class="muted" style="margin:.3rem 0"><strong>Onset:</strong> ' + HELP.on + '; <strong>offset:</strong> ' + HELP.off + '. Mark one onset and offset per muscle in each rep. Judging it by eye is the most accurate method there is (Hodges and Bui, 1996), but be consistent: zoom in to the same level each time and look for the first clear, lasting rise. Need help? Mark a rest period below and switch on <strong>Onset guide</strong> above the graph.</p>';
    h += '<details class="more"' + (R.rest ? ' open' : '') + '><summary>3. Rest period <span class="muted">(optional: for the onset guide and the noise check)</span></summary>'
      + '<div class="row tight"><button type="button" class="btn ghost small" data-pt="rest0">Rest start</button><button type="button" class="btn ghost small" data-pt="rest1">Rest end</button></div>'
      + '<p class="muted">Mark 0.5 to 1 s where the participant is relaxed. The guide line is the rest mean + ' + set.guideK + ' SD of a ' + set.guideFc + ' Hz envelope (Hodges and Bui, 1996). It is a guide only: noise or a spike can cross it, and slow rises cross it late.</p>'
      + '<div class="row"><div><label for="guideK">Guide: rest mean + (SD)</label><input type="number" id="guideK" min="1" max="10" step="0.5" value="' + set.guideK + '"></div><div><label for="guideFc">Guide envelope cut-off (Hz)</label><input type="number" id="guideFc" min="5" max="200" step="5" value="' + set.guideFc + '"></div></div>'
      + (R.guide ? '<table><thead><tr><th>Muscle</th><th>Rest mean</th><th>Rest SD</th><th>Guide line</th><th>Rest noise (RMS)</th></tr></thead><tbody>' + R.guide.map((g, k) => g ? '<tr><td>' + esc(muscle(R.pr.ch[k].key).short) + '</td><td class="num">' + g.mean.toFixed(2) + '</td><td class="num">' + g.sd.toFixed(2) + '</td><td class="num">' + g.thr.toFixed(2) + ' ' + R.ni.unit + '</td><td class="num">' + g.restRms.toFixed(1) + ' µV' + (g.restRms > 10 ? ' <span class="bad">high</span>' : '') + '</td></tr>' : '').join('') + '</tbody></table>' : '')
      + '</details>';
    h += '<div class="row tight" style="margin:.3rem 0"><input type="text" id="mkName" class="mini" placeholder="Marker name (optional, e.g. Heel strike)" style="width:16rem"><button type="button" class="btn ghost small" data-pt="mark">Add marker</button></div>';
  }
  // points table
  const P = R.pts;
  if (!P.length) h += '<p class="muted">No points yet.</p>';
  else {
    h += '<details class="more" open><summary>Your points (' + P.length + ')</summary><div class="tablewrap" style="max-height:330px"><table><thead><tr><th>Point</th><th>Time (s)</th><th>Sample</th><th>Move</th><th></th></tr></thead><tbody>';
    P.forEach((p) => {
      h += '<tr><td><button class="btn small ghost" type="button" data-go="' + p.i + '" title="Show on the graph">&#8982;</button> <span class="swatch" style="background:' + (POINT_COL[p.type] || '#2563eb') + '"></span>' + esc(pointLabel(p)) + '</td>'
        + '<td class="num">' + (p.i / R.fs).toFixed(3) + '</td><td class="num">' + p.i + '</td><td class="nowrap">'
        + [-10, -1, 1, 10].map((d) => '<button class="btn small ghost" type="button" data-id="' + p.id + '" data-d="' + d + '" title="' + (d > 0 ? 'Later' : 'Earlier') + ' by ' + Math.abs(d) + ' sample' + (Math.abs(d) > 1 ? 's' : '') + '">' + (d === -10 ? '&laquo;' : d === -1 ? '&lsaquo;' : d === 1 ? '&rsaquo;' : '&raquo;') + '</button>').join('')
        + '</td><td><button class="btn small ghost" type="button" data-del="' + p.id + '">Delete</button></td></tr>';
    });
    h += '</tbody></table></div><div class="row tight"><button class="btn small ghost" type="button" id="ptClear">Delete every point</button></div></details>';
  }
  if (!mv) {
    h += '<h3>Windows</h3>';
    const W = R.reps.concat(R.phases, R.own);
    if (W.length) h += '<details class="more"><summary>' + R.reps.length + ' rep' + (R.reps.length === 1 ? '' : 's') + (R.phases.length ? ', ' + R.phases.length + ' phases' : '') + (R.own.length ? ', ' + R.own.length + ' of your own' : '') + '</summary><ul class="plain wins">' + W.map((w) => '<li><strong>' + esc(w.name) + '</strong> ' + (w.i0 / R.fs).toFixed(3) + ' to ' + (w.i1 / R.fs).toFixed(3) + ' s (' + ((w.i1 - w.i0) / R.fs).toFixed(3) + ' s)' + (w.kind === 'own' ? ' <button class="btn small ghost" type="button" data-wdel="' + w.id + '">Remove</button>' : '') + '</li>').join('') + '</ul></details>';
    else h += '<p class="muted">A rep is made from each <strong>Rep start</strong> to the next <strong>Rep end</strong>. Phase changes split it into phases.</p>';
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
    A.winType = 'own'; persist(); A.fn.refresh({ keepView: true }); status('Window added. Its results are in <strong>3. Results</strong> (choose <em>My windows</em>).');
  });
}
