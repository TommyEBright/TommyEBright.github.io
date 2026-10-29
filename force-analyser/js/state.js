// Shared state and small helpers.
// A.S is the trial being worked on (its file data, plate mapping and settings). A.R is its analysis.
import { defaultSettings } from './analyse.js?v=1.0.0';

export const VERSION = '1.0.0';
export const APP = 'Force Analysis';
export const LEVELS = { 1: 'Foundation (Year 1)', 2: 'Intermediate (Year 2)', 3: 'Advanced (Year 3 and MSc)' };
export const PLATE_COLS = ['#0f766e', '#be185d', '#d97706'];
export const COL = { total: '#1d4ed8', raw: '#94a3b8', bw: '#475569', vel: '#7c3aed', disp: '#0891b2', acc: '#dc2626', net: '#1d4ed8', power: '#ea580c', pos: 'rgba(16,185,129,.28)', neg: 'rgba(59,130,246,.26)' };

// Settings that carry over from one trial to the next.
export const SHARED = ['jump', 'thr', 'hold', 'onsetK', 'onsetBack', 'method', 'djDir', 'drop', 'bwMode', 'filt', 'roles'];

export const A = {
  session: { trials: [], cur: -1 },
  S: null,        // current trial
  D: null,        // current trial's data (built from the file and the plate mapping)
  R: null,        // analysis
  V: [],          // variables
  level: 2, units: 'N',
  view: null,     // {x0, x1} seconds shown on the main graph
  cursor: -1, pinned: false,
  show: { total: true, plates: false, fx: false, fy: false, phases: true, impulse: true, figure: true, raw: true },
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
    set: defaultSettings(),
    notes: ''
  };
}
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
    try { localStorage.setItem('fa-prefs', JSON.stringify({ level: A.level, units: A.units, show: A.show })); } catch (e) { /* ignore */ }
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
export function loadPrefs() {
  try { const p = JSON.parse(localStorage.getItem('fa-prefs')); if (p) { if (p.level) A.level = p.level; if (p.units) A.units = p.units; if (p.show) Object.assign(A.show, p.show); } } catch (e) { /* ignore */ }
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
