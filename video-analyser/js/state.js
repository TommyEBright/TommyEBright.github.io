// Shared state and small helpers.
// A.S is the trial being worked on. A.session holds every trial in the session.
export const G = 9.81;
export const VERSION = '2.0.2';
export const APP = 'Kinematic Analysis';

export const PALETTE = ['#2563eb', '#be185d', '#0f766e', '#d97706', '#7c3aed', '#0891b2', '#65a30d', '#dc2626', '#475569', '#c026d3', '#0d9488', '#ea580c'];

export const EVENT_DEFAULTS = {
  sprint: ['Touchdown', 'Toe-off'],
  jump: ['Start of movement', 'Lowest point', 'Take-off', 'Landing'],
  other: ['Event A', 'Event B']
};

// Settings that carry over from one trial to the next.
export const SHARED = ['template', 'angles', 'eventTypes', 'activity', 'dir', 'fps', 'slow', 'every', 'advance', 'snap',
  'cutoff', 'filt', 'graph', 'norm', 'footMarker', 'hipMarker', 'rot', 'flip'];

export function freshState() {
  return {
    v: 2, name: '', duration: 0, srcW: 0, srcH: 0, vw: 0, vh: 0,
    rot: 0, flip: false,
    fps: 30, slow: 1, fpsSet: false, activity: 'sprint', dir: 'right',
    template: { points: [], links: [] },
    every: 4, advance: 1, snap: false,
    calib: null, origin: null, tilt: false, grid: 0,
    frames: {}, conf: {}, flags: {},
    events: [], eventTypes: null, intervals: [], measures: [],
    angles: [], cutoff: 8, filt: true,
    footMarker: '', hipMarker: '',
    graph: { points: [], comp: 'auto', xaxis: 'time', xevent: '', units: 'ms', minmax: true },
    norm: { start: '', end: '', n: 101, v: '' },
    notes: ''
  };
}

export const A = {
  S: freshState(),
  session: { trials: [], cur: -1 },
  files: {}, // trial id -> File or Blob (videos are never saved)
  cur: 0, nFrames: 0, activeMarker: null, mode: 'digi', pending: [], lastAdded: [], drag: null,
  results: null, busy: false, stopReq: false, pauseAdvance: false, trackDir: 1, lastMaxFrame: -1, trackResume: null,
  fn: {} // cross-module functions registered at start-up
};

export const $ = (id) => document.getElementById(id);
export function clone(o) { return JSON.parse(JSON.stringify(o)); }
export function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
export function fx(x, n) { return (x === null || x === undefined || Number.isNaN(x)) ? '' : x.toFixed(n); }
export function status(msg) { const el = $('status'); if (el) el.innerHTML = msg; }

export function fpsReal() { return A.S.fps * A.S.slow; }
export function tReal(f) { return f / fpsReal(); }
export function points() { return A.S.template.points; }
export function colourOf(name) {
  const i = points().indexOf(name);
  return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
}
export function angleDefs() { if (!Array.isArray(A.S.angles)) A.S.angles = []; return A.S.angles; }
export function eventTypes() {
  if (!A.S.eventTypes) A.S.eventTypes = {};
  if (!A.S.eventTypes[A.S.activity]) A.S.eventTypes[A.S.activity] = EVENT_DEFAULTS[A.S.activity].slice();
  return A.S.eventTypes[A.S.activity];
}
// The word for +x in labels.
export function fwd() { return A.S.dir === 'none' ? 'to the right' : 'forwards'; }

// Which marker is the foot / the hip (chosen in Events; guessed from the names if not set).
function guess(list) { for (const re of list) { const m = points().find((p) => re.test(p)); if (m) return m; } return ''; }
export function footMarker() { const S = A.S; return points().includes(S.footMarker) ? S.footMarker : guess([/toe/i, /foot|mtp|shoe/i, /heel/i, /ankle/i]); }
export function hipMarker() { const S = A.S; return points().includes(S.hipMarker) ? S.hipMarker : guess([/hip/i, /pelvis|sacrum|trochanter/i, /com\b|centre|center/i]); }

// Run fn with another trial's state temporarily in place of A.S (used to compare trials).
export function withState(st, fn) { const keep = A.S; A.S = st; try { return fn(); } finally { A.S = keep; } }

// ---------- saving (in this browser) ----------
const KEY = 'kva-session-v2';
let saveTimer = null, warned = false;
export function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(A.session)); }
    catch (e) { if (!warned) { warned = true; status('<span class="bad">The browser is out of space for saving this session. Use <strong>Export &rarr; Save project file</strong> to keep your work.</span>'); } }
  }, 300);
}
export function restoreSession() {
  try { const j = JSON.parse(localStorage.getItem(KEY)); if (j && Array.isArray(j.trials) && j.trials.length) { j.trials.forEach((t) => { t.state = Object.assign(freshState(), t.state); }); return j; } } catch (e) { /* ignore */ }
  return null;
}
export function forgetSession() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }

export function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}
const safe = (s) => String(s || '').trim().replace(/[^\w\-]+/g, '_');
export function currentTrial() { return A.session.trials[A.session.cur] || null; }
export function baseName() {
  const t = currentTrial(), L = t ? t.labels : {};
  const lab = [L.athlete, L.condition, L.trial ? 'trial' + L.trial : ''].filter(Boolean).map(safe).join('_');
  return lab || safe((A.S.name || 'analysis').replace(/\.[^.]+$/, '')) || 'analysis';
}
