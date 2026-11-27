// Shared state and small helpers.
export const VERSION = '1.2.0';
export const APP = 'COP Analysis';
export const COL = { fz: '#1d4ed8', ap: '#dc2626', ml: '#7c3aed', cap: '#0f766e', cml: '#d97706', tz: '#475569', stance: 'rgba(29,78,216,.06)', ball: '#111827', ev: '#334155' };
export const OKABE = ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#E69F00', '#56B4E9', '#000000', '#999999'];
export const PAL = ['#1d4ed8', '#dc2626', '#059669', '#9333ea', '#d97706', '#0891b2', '#be185d', '#475569', '#65a30d', '#7c2d12'];

export const A = {
  trials: [], cur: -1,
  set: null,          // analysis settings (the same for every trial)
  units: 'N',
  show: { fz: true, ap: true, ml: false, cap: true, cml: true },
  view: null, cursor: -1, pinned: false,
  kickCol: {},
  fn: {}
};

export const $ = (id) => document.getElementById(id);
export function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
export function fx(x, n) { return (x === null || x === undefined || !Number.isFinite(x)) ? '–' : x.toFixed(n); }
export function status(msg) { const el = $('status'); if (el) el.innerHTML = msg; }
export function cur() { return A.trials[A.cur] || null; }
export function trialLabel(t) {
  const L = t.labels;
  return [L.athlete, L.kick, L.trial ? 'trial ' + L.trial : ''].filter(Boolean).join(', ') || t.name;
}
export function download(name, blob) {
  if (!(blob instanceof Blob)) blob = new Blob([blob], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}
export const safe = (s) => String(s || '').trim().replace(/[^\w\-]+/g, '_');
export function kickColour(k, cb) {
  const ks = []; A.trials.forEach((t) => { if (!ks.includes(t.labels.kick)) ks.push(t.labels.kick); });
  if (A.kickCol[k]) return A.kickCol[k];
  const i = Math.max(0, ks.indexOf(k));
  return cb ? OKABE[i % 8] : PAL[i % PAL.length];
}

export function defaultSettings() {
  return { ffc: 50, cfc: 15, thr: 20, cthr: 20, orig: 'plant', win: 'stance', ap: 'auto', bwMode: 'header', mass: '', foot: 'unk', side: 'unk' };
}
export function loadSettings() {
  const d = defaultSettings();
  try { const o = JSON.parse(localStorage.getItem('ka-set')); if (o && typeof o === 'object') Object.keys(d).forEach((k) => { if (o[k] !== undefined) d[k] = o[k]; }); } catch (e) { /* ignore */ }
  return d;
}
export function saveSettings() { try { localStorage.setItem('ka-set', JSON.stringify(A.set)); } catch (e) { /* ignore */ } }
