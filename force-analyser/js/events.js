// Tab 2: the events table, with nudging one sample at a time and resetting to automatic.
import { A, $, esc, persist } from './state.js?v=1.0.0';
import { applyEvent } from './trace.js?v=1.0.0';

const HOW = {
  cmj: [
    ['Weighing', 'The last still period before the jump (up to 1 s) whose force varies about as little as the quietest part of the trial.'],
    ['Start of movement', 'The first sample after weighing more than 5 SD below bodyweight, moved back 30 ms (Owen et al., 2014).'],
    ['Peak downward velocity', 'The most negative velocity before take-off. It is where force comes back up to bodyweight (net force = 0).'],
    ['Lowest point', 'Where velocity crosses zero after peak downward velocity: the end of braking and the start of propulsion.'],
    ['Take-off', 'The first sample below the contact threshold.'],
    ['Landing', 'The first sample back above the contact threshold.'],
    ['Lowest point after landing', 'Where velocity is back to zero after landing.']
  ],
  sj: [
    ['Weighing', 'The last still period before the push (in the squat), up to 1 s.'],
    ['Start of push', 'The first sample after weighing more than 5 SD above bodyweight, moved back 30 ms. Any dip below bodyweight before this is flagged as a possible countermovement.'],
    ['Take-off', 'The first sample below the contact threshold.'],
    ['Landing', 'The first sample back above the contact threshold.'],
    ['Lowest point after landing', 'Where velocity is back to zero after landing.']
  ],
  dj: [
    ['Touchdown', 'The first sample above the contact threshold after the plate was empty.'],
    ['Lowest point', 'Where velocity crosses zero during the contact: the end of braking and the start of propulsion.'],
    ['Take-off', 'The first sample below the contact threshold after touchdown.'],
    ['Landing', 'The first sample back above the contact threshold.'],
    ['Weighing', 'The first still period after landing (up to 1 s). It gives bodyweight and, for backward integration, the moment velocity is zero.']
  ]
};
const KEYMAP = { onset: 'onset', takeoff: 'takeoff', landing: 'landing', touchdown: 'touchdown' };

export function renderEvents() {
  const el = $('evTab'); if (!el) return;
  const R = A.R;
  if (!R || !R.ok) { el.innerHTML = '<tr><td class="muted">No events yet.</td></tr>'; return; }
  const fs = A.D.fs, set = A.S.set;
  const rows = R.events.slice().sort((a, b) => a.i - b.i);
  let h = '<thead><tr><th>Event</th><th>Time (s)</th><th>Sample</th><th>Move</th><th>Set by</th></tr></thead><tbody>';
  rows.forEach((e) => {
    const manual = e.weigh ? !!set.weigh : (set.ev && set.ev[KEYMAP[e.key]] !== undefined && set.ev[KEYMAP[e.key]] !== null);
    h += '<tr class="' + (e.edit ? '' : 'derived') + '"><td><button class="btn small ghost" type="button" data-show="' + e.i + '" title="Show on the graph">&#8982;</button> ' + esc(e.name) + '</td><td class="num">' + A.D.t[e.i].toFixed(3) + '</td><td class="num">' + e.i + '</td><td class="nowrap">';
    if (e.edit) h += [-10, -1, 1, 10].map((d) => '<button class="btn small ghost" type="button" data-k="' + e.key + '" data-d="' + d + '">' + (d < 0 ? (d === -10 ? '&laquo;' : '&lsaquo;') : (d === 10 ? '&raquo;' : '&rsaquo;')) + '</button>').join('');
    else h += '<span class="muted small">from velocity</span>';
    h += '</td><td>' + (e.edit ? (manual ? 'You <button class="btn small ghost" type="button" data-auto="' + e.key + '">Automatic</button>' : 'Automatic') : 'Worked out') + '</td></tr>';
  });
  el.innerHTML = h + '</tbody>';
  el.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => {
    const k = b.getAttribute('data-k'), d = +b.getAttribute('data-d');
    const e = A.R.events.find((x) => x.key === k); if (!e) return;
    applyEvent(k, (e.i + (k === 'weighE' ? 1 : 0) + d) / fs - (k === 'weighE' ? 1 / fs : 0), true);
  }));
  el.querySelectorAll('[data-auto]').forEach((b) => b.addEventListener('click', () => {
    const k = b.getAttribute('data-auto');
    if (k === 'weighS' || k === 'weighE') set.weigh = null; else { set.ev = Object.assign({}, set.ev); delete set.ev[k]; }
    persist(); A.fn.refresh({ keepView: true });
  }));
  el.querySelectorAll('[data-show]').forEach((b) => b.addEventListener('click', () => {
    const i = +b.getAttribute('data-show'); A.cursor = i; A.pinned = true;
    const t = A.D.t[i]; if (t < A.view.x0 || t > A.view.x1) { const w = A.view.x1 - A.view.x0; A.fn.setView(t - w / 2, t + w / 2); }
    A.fn.cursorChanged(); document.getElementById('traceCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  $('evHow').innerHTML = HOW[R.jump].map(([a, b]) => '<li><strong>' + a + ':</strong> ' + b + '</li>').join('');
}

export function initEvents() {
  $('evReset').addEventListener('click', () => { if (!A.S) return; A.S.set.ev = {}; A.S.set.weigh = null; persist(); A.fn.refresh({ keepView: true }); });
}
