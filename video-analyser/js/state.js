// Shared state, templates and small helpers.
// Every module imports A (the app object). A.S is the saved project state.

export const G = 9.81;
export const VERSION = '1.0.0';

export const PALETTE = ['#2563eb', '#be185d', '#0f766e', '#d97706', '#7c3aed', '#0891b2', '#65a30d', '#dc2626', '#475569', '#c026d3', '#0d9488', '#ea580c'];

// Built-in point templates. Links are drawn as segments on the video.
export const TEMPLATES = {
  hip:   { name: 'Hip only (linear analysis)', points: ['Hip'], links: [] },
  side5: { name: 'Side view: shoulder, hip, knee, ankle, toe', points: ['Shoulder', 'Hip', 'Knee', 'Ankle', 'Toe'],
           links: [['Shoulder', 'Hip'], ['Hip', 'Knee'], ['Knee', 'Ankle'], ['Ankle', 'Toe']] },
  legs4: { name: 'Legs: hip, knee, ankle, toe', points: ['Hip', 'Knee', 'Ankle', 'Toe'],
           links: [['Hip', 'Knee'], ['Knee', 'Ankle'], ['Ankle', 'Toe']] },
  full9: { name: 'Full side view: head, shoulder, elbow, wrist, hip, knee, ankle, heel, toe',
           points: ['Head', 'Shoulder', 'Elbow', 'Wrist', 'Hip', 'Knee', 'Ankle', 'Heel', 'Toe'],
           links: [['Head', 'Shoulder'], ['Shoulder', 'Elbow'], ['Elbow', 'Wrist'], ['Shoulder', 'Hip'], ['Hip', 'Knee'], ['Knee', 'Ankle'], ['Ankle', 'Heel'], ['Heel', 'Toe'], ['Ankle', 'Toe']] }
};

// Angle definitions offered automatically when the points exist.
// joint: included angle at B between A and C (180 = straight)
// vertical: segment lower -> upper, from vertical, + = upper end forwards
// horizontal: segment from -> to, from horizontal, + = to-end above from-end
export const DEFAULT_ANGLES = [
  { name: 'Knee angle', type: 'joint', a: 'Hip', b: 'Knee', c: 'Ankle' },
  { name: 'Hip angle', type: 'joint', a: 'Shoulder', b: 'Hip', c: 'Knee' },
  { name: 'Ankle angle', type: 'joint', a: 'Knee', b: 'Ankle', c: 'Toe' },
  { name: 'Elbow angle', type: 'joint', a: 'Shoulder', b: 'Elbow', c: 'Wrist' },
  { name: 'Shoulder angle', type: 'joint', a: 'Hip', b: 'Shoulder', c: 'Elbow' },
  { name: 'Trunk lean', type: 'vertical', a: 'Hip', b: 'Shoulder' },
  { name: 'Shin angle', type: 'vertical', a: 'Ankle', b: 'Knee' }
];

export const EVENT_DEFAULTS = {
  sprint: ['Touchdown', 'Toe-off'],
  jump: ['Start of movement', 'Lowest point', 'Take-off', 'Landing'],
  other: ['Event A', 'Event B']
};

export function freshState() {
  return {
    v: 1, name: '', duration: 0, srcW: 0, srcH: 0, vw: 0, vh: 0,
    rot: 0, flip: false,
    fps: 30, slow: 1, activity: 'sprint', dir: 'right',
    templateKey: 'side5', template: clone(TEMPLATES.side5),
    every: 4, advance: 1, snap: false,
    calib: null, origin: null, tilt: false, grid: 0,
    frames: {}, conf: {}, flags: {}, alt: {},
    events: [], eventTypes: null, intervals: [], measures: [],
    angles: null, cutoff: 8, filt: true,
    graph: { points: ['Hip'], comp: 'auto', xaxis: 'time', xevent: '', units: 'ms', minmax: true },
    notes: ''
  };
}

export const A = {
  S: freshState(),
  cur: 0, nFrames: 0, activeMarker: null, mode: 'digi', pending: [], lastAdded: [], drag: null,
  results: null, busy: false, stopReq: false, pauseAdvance: false, trackDir: 1, lastMaxFrame: -1,
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
export function angleDefs() {
  if (!A.S.angles) {
    const p = points();
    A.S.angles = DEFAULT_ANGLES.filter((d) => [d.a, d.b, d.c].filter(Boolean).every((x) => p.includes(x))).map((d) => ({ ...d, flex: false, on: true }));
  }
  return A.S.angles;
}
export function eventTypes() {
  if (!A.S.eventTypes) A.S.eventTypes = {};
  if (!A.S.eventTypes[A.S.activity]) A.S.eventTypes[A.S.activity] = EVENT_DEFAULTS[A.S.activity].slice();
  return A.S.eventTypes[A.S.activity];
}

// ---------- persistence (per video, in this browser only) ----------
function key() { return 'kva:' + A.S.name + ':' + Math.round(A.S.duration * 1000); }
export function persist() { if (!A.S.name) return; try { localStorage.setItem(key(), JSON.stringify(A.S)); } catch (e) { /* storage full or blocked */ } }
export function restore() {
  try {
    const j = JSON.parse(localStorage.getItem(key()));
    if (j && j.frames) {
      const keep = { name: A.S.name, duration: A.S.duration, srcW: A.S.srcW, srcH: A.S.srcH };
      A.S = Object.assign(freshState(), j, keep);
      return true;
    }
  } catch (e) { /* ignore */ }
  return false;
}
export function forget() { try { localStorage.removeItem(key()); } catch (e) { /* ignore */ } }

export function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}
export function baseName() { return (A.S.name || 'analysis').replace(/\.[^.]+$/, '').replace(/[^\w\-]+/g, '_'); }
