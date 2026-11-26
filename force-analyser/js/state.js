// Shared state and small helpers.
// A.S is the trial being worked on (its file data, plate mapping and settings). A.R is its analysis.
import { defaultSettings } from './analyse.js?v=2.4.0';

export const VERSION = '2.4.0';
export const APP = 'Force Analysis';
export const PLATE_COLS = ['#0f766e', '#be185d', '#d97706'];
export const COL = { total: '#1d4ed8', raw: '#94a3b8', bw: '#475569', vel: '#7c3aed', disp: '#0891b2', acc: '#dc2626', net: '#1d4ed8', power: '#ea580c', pos: 'rgba(16,185,129,.28)', neg: 'rgba(59,130,246,.26)' };

// Settings that carry over from one trial to the next.
export const SHARED = ['type', 'axes', 'jump', 'thr', 'thrMode', 'hold', 'onsetK', 'onsetBack', 'onsetMethod', 'onsetPct', 'onsetN', 'onsetSearch', 'weighLen', 'sjTolPct', 'method', 'djDir', 'drop', 'bwMode', 'filt', 'roles'];

export const A = {
  session: { trials: [], cur: -1 },
  S: null,        // current trial
  D: null,        // current trial's data (built from the file and the plate mapping)
  R: null,        // analysis
  V: [],          // variables
  level: 3, units: 'N', // one version for everyone (the old Year 1/2/3 levels are gone)
  gshow: { tot: true, totG: false, plates: true, ap: false, ml: false, fx: false, fy: false, wins: true },
  axes: { ap: 'fy', fwd: 1 }, axesSet: false,
  view: null,     // {x0, x1} seconds shown on the main graph
  cursor: -1, pinned: false,
  show: { total: true, plates: false, fx: false, fy: false, phases: true, impulse: false, figure: false, raw: true },
  play: { on: false, speed: 0.25, build: false },
  step: 0,        // integration step being explained (0 = all)
  fn: {}          // cross-module functions registered at start-up
};

export const $ = (id) => document.getElementById(id);
export function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
export function fx(x, n) { return (x === null || x === undefined || !Number.isFinite(x)) ? '' : x.toFixed(n); }
export function status(msg) { const el = $('status'); if (el) el.innerHTML = msg; }
export function clone(o) { return JSON.parse(JSON.stringify(o)); }

export function newTrial(name, P, map) {
  return {
    id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: name || 'trial',
    labels: { athlete: '', condition: '', trial: '' },
    P, map, fs: P.fs || 0,
    set: Object.assign(defaultSettings(), loadMethodSettings()),
    notes: ''
  };
}
// Analysis settings chosen in Settings (start of movement, weighing, contacts, integration): the same for every
// trial in the session, and remembered in this browser for the next session.
export const METHOD_KEYS = ['onsetMethod', 'onsetK', 'onsetPct', 'onsetN', 'onsetBack', 'onsetSearch', 'weighLen', 'sjTolPct', 'thrMode', 'thr', 'hold', 'method'];
export function loadMethodSettings() { try { const o = JSON.parse(localStorage.getItem('fa-method')); if (o && typeof o === 'object') { const r = {}; METHOD_KEYS.forEach((k) => { if (o[k] !== undefined) r[k] = o[k]; }); return r; } } catch (e) { /* ignore */ } return {}; }
export function saveMethodSettings(set) { try { const o = {}; METHOD_KEYS.forEach((k) => { o[k] = set[k]; }); localStorage.setItem('fa-method', JSON.stringify(o)); } catch (e) { /* ignore */ } }
export function clearMethodSettings() { try { localStorage.removeItem('fa-method'); } catch (e) { /* ignore */ } }
export function currentTrial() { return A.session.trials[A.session.cur] || null; }

// ---------- saving (in this browser, with IndexedDB) ----------
const DB = 'force-analysis', STORE = 'kv', KEY = 'session-v1';
function idb() {
  return new Promise((res, rej) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
}
let saveTimer = null, warned = false;
export function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const db = await idb();
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ trials: A.session.trials, cur: A.session.cur }, KEY);
      tx.onerror = () => { if (!warned) { warned = true; status('<span class="bad">The browser could not save this session. Use <strong>Export &rarr; Save project file</strong> to keep your work.</span>'); } };
    } catch (e) { /* private mode etc.: carry on without saving */ }
    savePrefs();
  }, 400);
}
export async function restoreSession() {
  try {
    const db = await idb();
    return await new Promise((res) => {
      const rq = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      rq.onsuccess = () => { const j = rq.result; res(j && Array.isArray(j.trials) && j.trials.length ? j : null); };
      rq.onerror = () => res(null);
    });
  } catch (e) { return null; }
}
export async function forgetSession() {
  try { const db = await idb(); db.transaction(STORE, 'readwrite').objectStore(STORE).delete(KEY); } catch (e) { /* ignore */ }
}
export function savePrefs() { try { localStorage.setItem('fa-prefs2', JSON.stringify({ units: A.units, show: A.show, gshow: A.gshow, axes: A.axes, axesSet: A.axesSet })); } catch (e) { /* ignore */ } }
export function loadPrefs() {
  try { const p = JSON.parse(localStorage.getItem('fa-prefs2')); if (p) { ['units', 'axesSet'].forEach((k) => { if (p[k] !== undefined) A[k] = p[k]; }); ['show', 'gshow', 'axes'].forEach((k) => { if (p[k]) Object.assign(A[k], p[k]); }); return; } } catch (e) { /* ignore */ }
  try { const p = JSON.parse(localStorage.getItem('fa-prefs')); if (p && p.units) A.units = p.units; } catch (e) { /* ignore */ }
}

export function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}
const safe = (s) => String(s || '').trim().replace(/[^\w\-]+/g, '_');
export function baseName(t) {
  t = t || currentTrial(); if (!t) return 'force';
  const L = t.labels || {};
  const lab = [L.athlete, L.condition, L.trial ? 'trial' + L.trial : ''].filter(Boolean).map(safe).join('_');
  return lab || safe((t.name || 'force').replace(/\.[^.]+$/, '')) || 'force';
}
export function trialLabel(t) {
  const L = t.labels || {};
  const s = [L.athlete, L.condition, L.trial ? 'trial ' + L.trial : ''].filter(Boolean).join(', ');
  return s || t.name;
}
// Sample index <-> time
export function iOf(t) { return Math.max(0, Math.min(A.D.n - 1, Math.round(t * A.D.fs))); }
