// Tab 1: jump type, drop jump options, bodyweight, plates and columns, thresholds.
import { A, $, esc, persist, PLATE_COLS, savePrefs } from './state.js?v=2.2.1';
import { TYPE_HELP, GAIT, defaultG } from './generic.js?v=2.2.1';

const JUMP_HELP = {
  cmj: 'Stand still, dip down and jump straight up. Phases: unweighting, braking, propulsion, flight and landing.',
  sj: 'Hold a still squat, then push up without dipping first. Phases: propulsion, flight and landing. Any dip before the push is flagged.',
  slj: 'Stand still with both feet (or one foot) on the plate, then jump as far forwards as possible, landing off the plate. Vertical phases as in a CMJ, plus horizontal take-off velocity, take-off angle, horizontal impulse and power, and the direction of the force.',
  dj: 'Step off a box, land on the plate and jump straight back up as quickly as possible. Phases: braking, propulsion, flight and landing.'
};
const ROLES = [['on', 'Use'], ['left', 'Use: left foot'], ['right', 'Use: right foot'], ['off', 'Switch off']];

export function syncSetup() {
  const S = A.S; if (!S) return;
  const set = S.set;
  const jump = set.type === 'jump' || !set.type;
  $('type').value = jump ? set.jump : set.type;
  $('jumpHelp').textContent = jump ? JUMP_HELP[set.jump] : TYPE_HELP[set.type];
  $('typeNext').innerHTML = jump ? 'Events are found automatically: check them in <strong>2. Events</strong>, then read <strong>3. Results</strong>.' : set.type === 'iso' ? 'The baseline, onset and end of the pull are found automatically: check them in <strong>2. Points</strong>, then read <strong>3. Results</strong>.' : 'Next: mark the points by hand in <strong>2. Points</strong>, then read <strong>3. Results</strong>.';
  $('djBox').classList.toggle('hide', !(jump && set.jump === 'dj'));
  $('advSetup').classList.toggle('hide', !jump);
  $('axesBox').classList.toggle('hide', !GAIT[set.type]);
  if (GAIT[set.type]) {
    const ax = set.axes || A.axes;
    $('apAxis').value = ax.ap; $('apFwd').value = String(ax.fwd);
    const hasX = S.map.some((m) => m.fx >= 0), hasY = S.map.some((m) => m.fy >= 0);
    $('axesInfo').innerHTML = !(hasX || hasY) ? '<span class="bad">This file has no horizontal forces, so braking and propulsion cannot be worked out.</span>' : (set.axesGuessed ? 'Guessed from the data (the bigger horizontal force, which points backwards early in contact). Check it: braking should come first in each contact.' : 'Front&ndash;back force: ' + ax.ap.toUpperCase() + ', with forwards ' + (ax.fwd > 0 ? 'positive' : 'negative') + '. This is remembered for your next files.');
  }
  $('bwAutoOpt').textContent = jump ? 'Still standing in the trial (automatic)' : 'Still standing (points you mark), or the file';
  $('drop').value = set.drop > 0 ? set.drop : '';
  $('djDir').value = set.djDir;
  $('bwMode').value = set.bwMode; $('massWrap').classList.toggle('hide', set.bwMode !== 'mass'); $('mass').value = set.mass > 0 ? set.mass : '';
  $('fsIn').value = S.fs || '';
  $('fsInfo').innerHTML = S.P.fs ? 'From the file' + (S.P.format === 'bioware' ? ' (BioWare)' : '') : '<span class="bad">Not in the file: please enter it.</span>';
  ['thr', 'hold', 'onsetK', 'onsetBack', 'method'].forEach((k) => { $(k).value = set[k]; });
  $('thrMode').value = set.thrMode || 'auto';
  const R = A.R;
  let b = '';
  if (R && R.ok && !R.generic) {
    b = 'Bodyweight ' + R.BW.toFixed(1) + ' N, body mass ' + R.m.toFixed(1) + ' kg (from ' + R.bwSource + ').';
    if (R.headerBW > 0 && R.bwMode !== 'header') b += ' <span class="muted">The file also stores ' + R.headerBW.toFixed(1) + ' N.</span>';
  } else if (R && R.error) b = '<span class="bad">' + R.error + '</span>';
  else if (R && R.generic) b = R.BW > 0 ? 'Bodyweight ' + R.BW.toFixed(1) + ' N, body mass ' + R.m.toFixed(1) + ' kg (from ' + R.bwSource + ').' : 'No bodyweight yet, so results are in newtons only. Mark <strong>Still start</strong> and <strong>Still end</strong> in <strong>2. Points</strong>, or type a body mass.';
  $('bwInfo').innerHTML = b;
  const used = S.map.filter((m, k) => (set.roles[k] || 'on') !== 'off').length;
  $('plateSum').textContent = '(' + used + ' plate' + (used === 1 ? '' : 's') + ', ' + (S.fs || '?') + ' Hz)';
  if (!S.fs) $('plateDet').open = true;
  split();
  plates();
}

function colOptions(sel, allowNone) {
  const P = A.S.P;
  let h = allowNone ? '<option value="-1">(none)</option>' : '';
  P.columns.forEach((c, j) => { if (c.isTime) return; h += '<option value="' + j + '"' + (j === sel ? ' selected' : '') + '>' + esc(c.label) + '</option>'; });
  return h;
}
function plates() {
  const S = A.S, el = $('plateBox');
  const roles = S.set.roles;
  let h = '';
  S.map.forEach((m, k) => {
    h += '<div class="plateRow"><div><div class="pn"><span class="swatch" style="background:' + PLATE_COLS[k] + '"></span><input type="text" class="mini" data-pn="' + k + '" value="' + esc(m.name) + '" aria-label="Plate name"></div>'
      + '<select data-role="' + k + '" aria-label="Use this plate">' + ROLES.map(([v, l]) => '<option value="' + v + '"' + ((roles[k] || 'on') === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div>'
      + '<div><label>Vertical (Fz)</label><select data-col="fz" data-k="' + k + '">' + colOptions(m.fz, false) + '</select></div>'
      + '<div><label>Fx</label><select data-col="fx" data-k="' + k + '">' + colOptions(m.fx, true) + '</select></div>'
      + '<div><label>Fy</label><select data-col="fy" data-k="' + k + '">' + colOptions(m.fy, true) + '</select></div>'
      + '<div>' + (S.map.length > 1 ? '<button class="btn small ghost" type="button" data-rm="' + k + '">Remove</button>' : '') + '</div></div>';
  });
  if (S.map.length < 3) h += '<button class="btn small ghost" type="button" id="addPlate">Add a plate (another set of columns)</button>';
  el.innerHTML = h;
  el.querySelectorAll('[data-role]').forEach((s) => s.addEventListener('change', function () { const k = +this.getAttribute('data-role'); while (S.set.roles.length < S.map.length) S.set.roles.push('on'); S.set.roles[k] = this.value; changed(); }));
  el.querySelectorAll('[data-col]').forEach((s) => s.addEventListener('change', function () { const k = +this.getAttribute('data-k'); S.map[k][this.getAttribute('data-col')] = +this.value; changed(true); }));
  el.querySelectorAll('[data-pn]').forEach((s) => s.addEventListener('change', function () { S.map[+this.getAttribute('data-pn')].name = this.value || 'Plate'; changed(true); }));
  el.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', function () { const k = +this.getAttribute('data-rm'); S.map.splice(k, 1); S.set.roles.splice(k, 1); changed(true); }));
  const ap = $('addPlate');
  if (ap) ap.addEventListener('click', () => {
    const used = new Set(S.map.flatMap((m) => [m.fz, m.fx, m.fy]));
    const free = S.P.columns.map((c, j) => j).find((j) => !S.P.columns[j].isTime && !used.has(j));
    S.map.push({ name: 'Plate ' + (S.map.length + 1), fz: free === undefined ? 1 : free, fx: -1, fy: -1 }); S.set.roles.push('on'); changed(true);
  });
}
// A file with several sets of columns from the same plate is usually several trials merged into one file.
function split() {
  const S = A.S, el = $('splitBox'), all = S.P.allPlates || S.P.plates;
  const names = all.map((p) => p.name), dup = all.length > 1 && new Set(names).size < names.length;
  if (!dup || S.splitFrom) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="tip"><p><strong>' + all.length + ' sets of force columns, all from ' + esc(names[0]) + '.</strong> They are probably separate trials merged into one file' + (S.P.meta && S.P.meta.description ? ' (&ldquo;' + esc(S.P.meta.description) + '&rdquo;)' : '') + ', not different plates.</p><button class="btn small accent" type="button" id="splitGo">Split into ' + all.length + ' trials</button></div>';
  $('splitGo').addEventListener('click', () => A.fn.splitTrial());
}
function changed(rebuild) { persist(); A.fn.refresh({ keepView: true, rebuild: !!rebuild }); }

export function initSetup() {
  $('type').addEventListener('change', function () {
    const v = this.value, set = A.S.set, jump = ['cmj', 'sj', 'dj', 'slj'].includes(v);
    set.type = jump ? 'jump' : v; if (jump) { set.jump = v; set.ev = {}; set.weigh = null; }
    if (!set.g) set.g = defaultG();
    if (GAIT[set.type] && !set.axes) { set.axes = Object.assign({}, A.axes); }
    A.view = null; changed(true);
  });
  const ax = () => { const set = A.S.set; set.axes = { ap: $('apAxis').value, fwd: +$('apFwd').value }; set.axesGuessed = false; A.axes = Object.assign({}, set.axes); A.axesSet = true; savePrefs(); changed(); };
  $('apAxis').addEventListener('change', ax); $('apFwd').addEventListener('change', ax);
  $('drop').addEventListener('change', function () { const v = parseFloat(this.value); A.S.set.drop = v > 0 ? (v > 5 ? v / 100 : v) : 0; if (v > 5) this.value = A.S.set.drop; changed(); });
  $('djDir').addEventListener('change', function () { A.S.set.djDir = this.value; changed(); });
  $('bwMode').addEventListener('change', function () { A.S.set.bwMode = this.value; $('massWrap').classList.toggle('hide', this.value !== 'mass'); changed(); });
  $('mass').addEventListener('change', function () { const v = parseFloat(this.value); A.S.set.mass = v > 0 ? v : 0; changed(); });
  $('fsIn').addEventListener('change', function () { const v = parseFloat(this.value); if (v > 0) { A.S.fs = v; changed(true); } });
  $('thrMode').addEventListener('change', function () { A.S.set.thrMode = this.value; changed(); });
  [['thr', parseFloat], ['hold', parseFloat], ['onsetK', parseFloat], ['onsetBack', parseFloat]].forEach(([id, p]) => {
    $(id).addEventListener('change', function () { const v = p(this.value); if (!(v >= 0)) return; A.S.set[id] = v; changed(); });
  });
  $('method').addEventListener('change', function () { A.S.set.method = this.value; changed(); });
}
