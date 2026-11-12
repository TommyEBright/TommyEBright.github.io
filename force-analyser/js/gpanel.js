// Tab 2 for any force-time data: the point buttons, the points table (nudge one sample at a time), the
// windows (made from the points, plus your own), and the exports for these trials.
import { A, $, esc, persist, status, download, baseName, currentTrial } from './state.js?v=2.2.1';
import { POINTS, POINT_HELP, GAIT, TYPES, defaultG } from './generic.js?v=2.2.1';
import { setGView, gCursorChanged } from './gtrace.js?v=2.2.1';
import { toCsv } from './results.js?v=2.2.1';

const uid = () => Math.random().toString(36).slice(2, 9);
function G() { const set = A.S.set; if (!set.g) set.g = defaultG(); return set.g; }

// For a foot contact, the plate whose force rises most just after the cursor; for a toe-off, the one that falls most just before.
function guessPlate(name, i) {
  const R = A.R, fs = R.fs, L = Math.max(2, Math.round(0.02 * fs)), z = R.ch.filter((c) => c.kind === 'z' && c.plate >= 0);
  if (z.length < 2) return R.used[0] || 0;
  let best = z[0].plate, bv = -Infinity;
  z.forEach((c) => {
    const a = Math.max(0, i - L), b = Math.min(R.n - 1, i + L);
    const v = /contact|Touchdown|Onset/.test(name) ? c.y[b] - c.y[i] : c.y[a] - c.y[i];
    if (v > bv) { bv = v; best = c.plate; }
  });
  return best;
}

function addPoint(name) {
  if (!A.R || !A.R.generic) return;
  if (A.cursor < 0) { status('Click the graph first to put the cursor where the point is, then press <strong>' + esc(name) + '</strong>.'); return; }
  const set = A.S.set, g = G(), t = A.cursor / A.R.fs;
  const p = { id: uid(), name, t };
  if (GAIT[set.type] && !/Still/.test(name)) { const ch = $('gPlate') ? $('gPlate').value : 'auto'; p.plate = ch === 'auto' ? guessPlate(name, A.cursor) : +ch; }
  if (/Still/.test(name)) g.points = g.points.filter((q) => q.name !== name);
  g.points.push(p); g.points.sort((a, b) => a.t - b.t);
  persist(); A.fn.refresh({ keepView: true });
  status(esc(name) + ' marked at ' + t.toFixed(3) + ' s (sample ' + A.cursor + ')' + (p.plate !== undefined && A.R.used.length > 1 ? ' on ' + esc(A.R.plates[p.plate].name) : '') + '. Check it on the graph; nudge it in the table if needed.');
}

export function renderPoints() {
  const el = $('gPts'); if (!el) return;
  const R = A.R; if (!R || !R.generic) { el.innerHTML = ''; return; }
  const set = A.S.set, g = G(), type = set.type, names = POINTS[type], gait = !!GAIT[type], multi = R.used.length > 1;
  let h = '<ol class="steps-how"><li><strong>Click the graph</strong> near the moment you want.</li><li>Press <strong>Zoom to the cursor</strong> (above the graph) to see every sample.</li><li>Step with <kbd>&larr;</kbd> <kbd>&rarr;</kbd> until the cursor is exactly on it.</li><li>Press the button below.</li></ol>';
  h += '<div class="chips evchips">' + names.map((n) => '<button type="button" class="btn accent small" data-pt="' + esc(n) + '" title="' + esc(POINT_HELP[n] || '') + '">' + esc(n) + '</button>').join('');
  h += (type === 'any' ? '<span class="row tight" style="gap:.3rem"><input type="text" id="gOwn" class="mini" placeholder="Your own point (e.g. Peak)" style="width:12rem"><button type="button" class="btn ghost small" id="gOwnAdd">Mark it</button></span>' : '') + '</div>';
  if (gait && multi) h += '<div class="row tight" style="margin:.3rem 0"><label class="inline" for="gPlate" style="margin:0">Plate</label><select id="gPlate" class="mini" style="width:auto"><option value="auto">Work it out from the forces</option>' + R.used.map((j) => '<option value="' + j + '">' + esc(R.plates[j].name) + '</option>').join('') + '</select></div>';
  if (type === 'iso') h += '<div class="tip"><p><strong>Found automatically:</strong> the baseline is the steadiest 1 s of pre-tension before the pull; <strong>onset</strong> is the first sample above the baseline mean + ' + (set.onsetK || 5) + ' SD; the <strong>end of the pull</strong> is where force falls back below that level. Check each on the graph and move any that look wrong.</p><button type="button" class="btn small ghost" id="gIsoAgain">Find them automatically again</button></div>';
  h += '<p class="muted" style="margin:.3rem 0">' + names.map((n) => '<strong>' + esc(n) + ':</strong> ' + esc(POINT_HELP[n] || '')).join('. ') + '.</p>';
  // the points table
  const P = R.points.slice().sort((a, b) => a.i - b.i);
  if (!P.length) h += '<p class="muted">No points yet.</p>';
  else {
    h += '<div class="tablewrap" style="max-height:none"><table><thead><tr><th>Point</th>' + (gait && multi ? '<th>Plate</th>' : '') + '<th>Time (s)</th><th>Sample</th><th>Force here</th><th>Move</th><th></th></tr></thead><tbody>';
    P.forEach((p) => {
      const y = (p.plate >= 0 && multi ? (R.ch.find((c) => c.id === 'z' + p.plate) || R.ch[0]) : R.ch[0]).y[p.i];
      h += '<tr><td><button class="btn small ghost" type="button" data-go="' + p.i + '" title="Show on the graph">&#8982;</button> ' + esc(p.name) + '</td>'
        + (gait && multi ? '<td>' + (p.plate === undefined ? '&ndash;' : '<select class="mini" data-pl="' + p.id + '" style="width:auto">' + R.used.map((j) => '<option value="' + j + '"' + (j === p.plate ? ' selected' : '') + '>' + esc(R.plates[j].name) + '</option>').join('') + '</select>') + '</td>' : '')
        + '<td class="num">' + R.t[p.i].toFixed(3) + '</td><td class="num">' + p.i + '</td><td class="num">' + y.toFixed(1) + ' N</td><td class="nowrap">'
        + [-10, -1, 1, 10].map((d) => '<button class="btn small ghost" type="button" data-id="' + p.id + '" data-d="' + d + '" title="' + (d > 0 ? 'Later' : 'Earlier') + ' by ' + Math.abs(d) + ' sample' + (Math.abs(d) > 1 ? 's' : '') + '">' + (d === -10 ? '&laquo;' : d === -1 ? '&lsaquo;' : d === 1 ? '&rsaquo;' : '&raquo;') + '</button>').join('')
        + '</td><td><button class="btn small ghost" type="button" data-del="' + p.id + '">Delete</button></td></tr>';
    });
    h += '</tbody></table></div>';
  }
  // windows
  h += '<h3>Windows</h3>';
  if (R.windows.length) h += '<ul class="plain wins">' + R.windows.map((w) => '<li><span class="swatch" style="background:' + w.col + '"></span><strong>' + esc(w.name) + '</strong> ' + esc(w.a.name) + ' (' + R.t[w.i0].toFixed(3) + ' s) to ' + esc(w.b.name) + ' (' + R.t[w.i1].toFixed(3) + ' s), ' + ((w.i1 - w.i0) / R.fs).toFixed(3) + ' s' + (w.custom ? ', ' + esc((R.ch.find((c) => c.id === w.ch) || R.ch[0]).short) + ' <button class="btn small ghost" type="button" data-wdel="' + w.id + '">Remove</button>' : '') + '</li>').join('') + '</ul>';
  else h += '<p class="muted">' + { any: 'A window is made from each <strong>Start</strong> to the next <strong>End</strong>.', walk: 'A window (one contact) is made from each <strong>Foot contact</strong> to the next <strong>Toe-off</strong> on the same plate.', run: 'A window (one contact) is made from each <strong>Foot contact</strong> to the next <strong>Toe-off</strong> on the same plate.', land: 'The landing window runs from <strong>Touchdown</strong> to <strong>Stable</strong>.', iso: 'The pull runs from <strong>Onset</strong> to <strong>End of pull</strong> (or the end of the recording).' }[type] + '</p>';
  if (P.length >= 2) {
    const opts = P.map((p) => '<option value="' + p.id + '">' + esc(p.name) + ' @ ' + R.t[p.i].toFixed(3) + ' s</option>').join('');
    h += '<details class="more"><summary>Add your own window (between any two points)</summary><div class="row">'
      + '<div><label for="gwName">Name</label><input type="text" id="gwName" placeholder="e.g. First half of contact"></div>'
      + '<div><label for="gwA">From</label><select id="gwA">' + opts + '</select></div>'
      + '<div><label for="gwB">To</label><select id="gwB">' + opts + '</select></div>'
      + '<div><label for="gwCh">Force</label><select id="gwCh">' + R.ch.map((c) => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('') + '</select></div>'
      + '<div class="auto"><button class="btn small" type="button" id="gwAdd">Add window</button></div></div>'
      + '<p class="muted">You get its duration, peak, time of peak, minimum, mean, impulse and mean rate of force development in <strong>3. Results</strong>.</p></details>';
  }
  // bodyweight from standing still
  h += '<h3>Bodyweight <span class="muted">(optional)</span></h3><p class="muted" style="margin:.1rem 0 .3rem">To give results in N/kg or bodyweights, mark a period of standing completely still (or type the mass in <strong>1. Setup</strong>). Now: ' + (R.BW > 0 ? '<strong>' + R.BW.toFixed(1) + ' N</strong> from ' + esc(R.bwSource) : '<strong>none</strong>') + '.</p>'
    + '<div class="row tight"><button type="button" class="btn ghost small" data-pt="Still start">Still start</button><button type="button" class="btn ghost small" data-pt="Still end">Still end</button></div>';
  el.innerHTML = h;
  if (P.length >= 2) { $('gwB').selectedIndex = Math.min(1, P.length - 1); }

  el.querySelectorAll('[data-pt]').forEach((b) => b.addEventListener('click', () => addPoint(b.getAttribute('data-pt'))));
  if ($('gIsoAgain')) $('gIsoAgain').addEventListener('click', () => { const g2 = G(); g2.points = g2.points.filter((p) => !/^(Baseline start|Baseline end|Onset|End of pull)$/.test(p.name)); g2.isoAuto = false; persist(); A.fn.refresh({ keepView: true }); status('Baseline, onset and end of pull found again.'); });
  if ($('gOwnAdd')) $('gOwnAdd').addEventListener('click', () => { const v = $('gOwn').value.trim(); if (v) addPoint(v); });
  el.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => {
    const p = g.points.find((q) => q.id === b.getAttribute('data-id')); if (!p) return;
    p.t = Math.max(0, Math.min((R.n - 1) / R.fs, Math.round(p.t * R.fs + +b.getAttribute('data-d')) / R.fs));
    A.cursor = Math.round(p.t * R.fs); A.pinned = true;
    persist(); A.fn.refresh({ keepView: true }); gCursorChanged();
  }));
  el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { const id = b.getAttribute('data-del'); g.points = g.points.filter((q) => q.id !== id); g.windows = (g.windows || []).filter((w) => w.a !== id && w.b !== id); persist(); A.fn.refresh({ keepView: true }); }));
  el.querySelectorAll('[data-pl]').forEach((s) => s.addEventListener('change', () => { const p = g.points.find((q) => q.id === s.getAttribute('data-pl')); if (p) { p.plate = +s.value; persist(); A.fn.refresh({ keepView: true }); } }));
  el.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
    const i = +b.getAttribute('data-go'); A.cursor = i; A.pinned = true;
    const t = A.D.t[i], wv = Math.min(A.view.x1 - A.view.x0, 60 / A.D.fs); setGView(t - wv / 2, t + wv / 2); gCursorChanged();
    $('traceCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  el.querySelectorAll('[data-wdel]').forEach((b) => b.addEventListener('click', () => { g.windows = g.windows.filter((w) => w.id !== b.getAttribute('data-wdel')); persist(); A.fn.refresh({ keepView: true }); }));
  if ($('gwAdd')) $('gwAdd').addEventListener('click', () => {
    const a = $('gwA').value, b = $('gwB').value; if (a === b) { status('Choose two different points for the window.'); return; }
    if (!g.windows) g.windows = [];
    g.windows.push({ id: uid(), name: $('gwName').value.trim() || 'My window ' + (g.windows.length + 1), a, b, ch: $('gwCh').value });
    persist(); A.fn.refresh({ keepView: true }); status('Window added. Its results are in <strong>3. Results</strong>.');
  });
}

// ---------- exports ----------
export function gContCsv() {
  const R = A.R, D = A.D, head = ['time_s'].concat(R.ch.map((c) => c.short.replace(/\W+/g, '_') + '_N'));
  const rows = [head];
  for (let i = 0; i < D.n; i++) rows.push([D.t[i].toFixed(4)].concat(R.ch.map((c) => c.y[i].toFixed(2))));
  return toCsv(rows);
}
export function gPointsCsv() {
  const R = A.R, t = currentTrial();
  const rows = [['participant', 'condition', 'trial', 'file', 'type', 'point', 'plate', 'time_s', 'sample']];
  R.points.slice().sort((a, b) => a.i - b.i).forEach((p) => rows.push([t.labels.athlete, t.labels.condition, t.labels.trial, t.name, TYPES[R.type], p.name, p.plate >= 0 ? R.plates[p.plate].name : '', R.t[p.i].toFixed(4), p.i]));
  return toCsv(rows);
}
// Each window stretched to 0-100% (101 points), for every force.
export function gNormCsv() {
  const R = A.R, rows = [['window', 'percent'].concat(R.ch.map((c) => c.short.replace(/\W+/g, '_') + '_N'))];
  R.windows.forEach((w) => {
    const n = w.i1 - w.i0; if (n < 2) return;
    for (let j = 0; j <= 100; j++) {
      const x = w.i0 + n * j / 100, i = Math.floor(x), f = x - i;
      rows.push([w.name, j].concat(R.ch.map((c) => (c.y[i] + (c.y[Math.min(R.n - 1, i + 1)] - c.y[i]) * f).toFixed(2))));
    }
  });
  return toCsv(rows);
}
export function gDownload(kind) {
  if (!A.R || !A.R.generic) return;
  const m = { cont: [gContCsv, '_continuous.csv'], pts: [gPointsCsv, '_points.csv'], norm: [gNormCsv, '_windows_time_normalised.csv'] }[kind];
  if (kind === 'norm' && !A.R.windows.length) { status('Mark some points first: there are no windows to time-normalise.'); return; }
  download(baseName() + m[1], new Blob([m[0]()], { type: 'text/csv' }));
}
