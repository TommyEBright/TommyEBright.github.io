// Tab 1: jump type, drop jump options, bodyweight, plates and columns, thresholds.
import { A, $, esc, persist, PLATE_COLS } from './state.js?v=1.0.0';

const JUMP_HELP = {
  cmj: 'Stand still, dip down and jump straight up. Phases: unweighting, braking, propulsion, flight and landing.',
  sj: 'Hold a still squat, then push up without dipping first. Phases: propulsion, flight and landing. Any dip before the push is flagged.',
  dj: 'Step off a box, land on the plate and jump straight back up as quickly as possible. Phases: braking, propulsion, flight and landing.'
};
const ROLES = [['on', 'Use'], ['left', 'Use: left foot'], ['right', 'Use: right foot'], ['off', 'Switch off']];

export function syncSetup() {
  const S = A.S; if (!S) return;
  const set = S.set;
  $('jump').value = set.jump; $('jumpHelp').textContent = JUMP_HELP[set.jump];
  $('djBox').classList.toggle('hide', set.jump !== 'dj');
  $('drop').value = set.drop > 0 ? set.drop : '';
  $('djDir').value = set.djDir;
  $('bwMode').value = set.bwMode; $('massWrap').classList.toggle('hide', set.bwMode !== 'mass'); $('mass').value = set.mass > 0 ? set.mass : '';
  $('fsIn').value = S.fs || '';
  $('fsInfo').innerHTML = S.P.fs ? 'From the file' + (S.P.format === 'bioware' ? ' (BioWare)' : '') : '<span class="bad">Not in the file: please enter it.</span>';
  ['thr', 'hold', 'onsetK', 'onsetBack', 'method'].forEach((k) => { $(k).value = set[k]; });
  $('advSetup').open = A.level >= 3 || $('advSetup').open;
  const R = A.R;
  let b = '';
  if (R && R.ok) {
    b = 'Bodyweight ' + R.BW.toFixed(1) + ' N, body mass ' + R.m.toFixed(1) + ' kg (from ' + R.bwSource + ').';
    if (R.headerBW > 0 && R.bwMode !== 'header') b += ' <span class="muted">The file also stores ' + R.headerBW.toFixed(1) + ' N.</span>';
  } else if (R && R.error) b = '<span class="bad">' + R.error + '</span>';
  $('bwInfo').innerHTML = b;
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
function changed(rebuild) { persist(); A.fn.refresh({ keepView: true, rebuild: !!rebuild }); }

export function initSetup() {
  $('jump').addEventListener('change', function () { A.S.set.jump = this.value; A.S.set.ev = {}; A.S.set.weigh = null; changed(); A.fn.zoomJump(); });
  $('drop').addEventListener('change', function () { const v = parseFloat(this.value); A.S.set.drop = v > 0 ? (v > 5 ? v / 100 : v) : 0; if (v > 5) this.value = A.S.set.drop; changed(); });
  $('djDir').addEventListener('change', function () { A.S.set.djDir = this.value; changed(); });
  $('bwMode').addEventListener('change', function () { A.S.set.bwMode = this.value; $('massWrap').classList.toggle('hide', this.value !== 'mass'); changed(); });
  $('mass').addEventListener('change', function () { const v = parseFloat(this.value); A.S.set.mass = v > 0 ? v : 0; changed(); });
  $('fsIn').addEventListener('change', function () { const v = parseFloat(this.value); if (v > 0) { A.S.fs = v; changed(true); } });
  [['thr', parseFloat], ['hold', parseFloat], ['onsetK', parseFloat], ['onsetBack', parseFloat]].forEach(([id, p]) => {
    $(id).addEventListener('change', function () { const v = p(this.value); if (!(v >= 0)) return; A.S.set[id] = v; changed(); });
  });
  $('method').addEventListener('change', function () { A.S.set.method = this.value; changed(); });
}
