// Shared state and small helpers.
// The session holds every file: MVIC files (to normalise each muscle) and task trials (the movements).
export const VERSION = '1.0.0';
export const APP = 'EMG Analysis';
export const MUSCLE_COLS = ['#1d4ed8', '#be185d', '#0f766e', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#65a30d'];
export const POINT_COL = { rep0: '#15803d', rep1: '#b91c1c', phase: '#7c3aed', on: '#0f766e', off: '#c2410c', rest0: '#64748b', rest1: '#64748b', mark: '#2563eb', hold0: '#15803d', hold1: '#b91c1c' };
export const POINT_NAME = { rep0: 'Rep start', rep1: 'Rep end', phase: 'Phase change', on: 'Onset', off: 'Offset', rest0: 'Rest start', rest1: 'Rest end', mark: 'Marker', hold0: 'MVIC start', hold1: 'MVIC end' };

export function defaultSet() {
  return {
    bpLo: 20, bpHi: 450, bpOrder: 4, envFc: 6, envOrder: 4, // the linear envelope (as the MATLAB script)
    norm: 'mvic',          // 'mvic' | 'peak' (the trial's own peak) | 'none' (volts)
    refMethod: 'peak',     // MVIC reference: 'peak' of the envelope, or 'win' (highest mean over refWin ms)
    refWin: 500,
    phaseNames: ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'],
    guide: false, guideK: 3, guideFc: 50, // onset guide line: rest mean + k SD of a 50 Hz envelope
    mains: 50,
    pairA: '', pairB: '',  // co-contraction and ratio pair (muscle keys)
    rorMs: 50,             // rate of rise window
    fatigueWin: 500        // ms, for the sliding median frequency
  };
}

export const A = {
  session: { trials: [], cur: -1, muscles: {}, set: defaultSet() },
  S: null,        // the open trial
  R: null,        // its processed signals and results
  view: null,     // {x0, x1} seconds on the main graph
  cursor: -1, pinned: false, lane: -1,
  show: { raw: false, acc: true, reps: true, guide: false },
  winType: 'reps', // which windows Results shows: reps | phases | own | whole
  fn: {}
};

export const $ = (id) => document.getElementById(id);
export function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
export function fx(x, n) { return (x === null || x === undefined || !Number.isFinite(x)) ? '' : x.toFixed(n); }
export function status(msg) { const el = $('status'); if (el) el.innerHTML = msg; }
export function clone(o) { return JSON.parse(JSON.stringify(o)); }
export const uid = () => Math.random().toString(36).slice(2, 9);
export function currentTrial() { return A.session.trials[A.session.cur] || null; }
export const SET = () => A.session.set;

// Muscles: one entry per muscle name in the files, shared by every trial (short name and colour).
export function muscle(key) { return A.session.muscles[key] || { short: key, col: '#334155' }; }
export function muscleKeys() { return Object.keys(A.session.muscles).sort((a, b) => A.session.muscles[a].order - A.session.muscles[b].order); }

// ---------- saving (in this browser, with IndexedDB) ----------
const DB = 'emg-analysis', STORE = 'kv', KEY = 'session-v1';
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
      tx.objectStore(STORE).put({ trials: A.session.trials, cur: A.session.cur, muscles: A.session.muscles, set: A.session.set }, KEY);
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
export function savePrefs() { try { localStorage.setItem('emg-prefs1', JSON.stringify({ show: A.show, winType: A.winType })); } catch (e) { /* ignore */ } }
export function loadPrefs() { try { const p = JSON.parse(localStorage.getItem('emg-prefs1')); if (p) { if (p.show) Object.assign(A.show, p.show); if (p.winType) A.winType = p.winType; } } catch (e) { /* ignore */ } }

export function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}
const safe = (s) => String(s || '').trim().replace(/[^\w\-]+/g, '_');
export function baseName(t) {
  t = t || currentTrial(); if (!t) return 'emg';
  const L = t.labels || {};
  const lab = [L.athlete, L.condition, L.trial ? 'trial' + L.trial : ''].filter(Boolean).map(safe).join('_');
  return lab || safe((t.name || 'emg').replace(/\.[^.]+$/, '')) || 'emg';
}
export function trialLabel(t) {
  const L = t.labels || {};
  const s = [L.athlete, L.condition, L.trial ? 'trial ' + L.trial : ''].filter(Boolean).join(', ');
  return s || t.name;
}
export function csvCell(v) { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
export function toCsv(rows) { return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n'); }
