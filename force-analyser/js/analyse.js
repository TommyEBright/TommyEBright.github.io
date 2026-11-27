// The analysis of one trial: bodyweight, events, integration (force -> acceleration -> velocity ->
// displacement), phases and power. No page code here, so it can be tested on its own.
import { G, butter, integrateForward, integrateBackward, mean, sd, argmax, argmin, quietestWindow } from './maths.js?v=2.7.0';

export const JUMPS = { cmj: 'Countermovement jump (CMJ)', sj: 'Squat jump (SJ)', dj: 'Drop jump (DJ)', slj: 'Standing long jump (SLJ)' };
export const JUMP_SHORT = { cmj: 'CMJ', sj: 'SJ', dj: 'Drop jump', slj: 'SLJ' };
// A standing long jump is analysed vertically exactly like a CMJ (it starts with a countermovement), plus the horizontal force.
export const cmLike = (j) => j === 'cmj' || j === 'slj';

export function defaultSettings() {
  return {
    type: 'jump',     // 'jump', or 'any', 'walk', 'run', 'land', 'iso' (see generic.js)
    jump: 'cmj',
    g: { points: [], windows: [] }, // points and windows marked by hand (any force-time data)
    axes: null,       // walking and running: which horizontal force is front-back, and which way is forwards
    thr: 20,          // contact threshold (N) when fixed
    thrMode: 'auto',  // 'auto': from this trial's empty plate (offset taken off, then mean + 5 SD); 'fixed': thr
    hold: 10,         // ms the force must stay above/below the threshold
    onsetK: 5,        // start of movement: bodyweight +/- k SD (Owen et al., 2014)
    onsetBack: 30,    // ... minus this many ms
    onsetMethod: 'sd', // 'sd' (bodyweight +/- k SD), 'pct' (% of bodyweight) or 'abs' (fixed N)
    onsetPct: 10,     // % of bodyweight when onsetMethod is 'pct'
    onsetN: 50,       // N when onsetMethod is 'abs'
    onsetSearch: 'back', // 'back': work back from the movement; 'first': first sample outside the band after weighing
    weighLen: 1,      // s of still standing used for bodyweight (just before the movement)
    sjTolPct: 0,      // squat jump countermovement check: dip allowed below bodyweight (% BW); 0 = same band as the start
    method: 'trap',   // trapezoid or rectangle (Riemann) integration
    djDir: 'auto',    // drop jump: 'backward' (from still standing after landing), 'forward' (from drop height) or 'auto'
    drop: 0,          // drop jump box height (m)
    bwMode: 'auto',   // 'auto' (still standing), 'header' (body weight stored in the file) or 'mass' (typed in)
    mass: 0,          // kg, if typed in
    filt: { on: false, fc: 50 },
    weigh: null,      // {s, e} in seconds if set by hand
    ev: {},           // events moved by hand (seconds): onset, takeoff, landing, touchdown
    roles: []         // per plate: 'on', 'left', 'right' or 'off'
  };
}

const PH = {
  weigh: { name: 'Weighing', col: '#94a3b8' },
  unweight: { name: 'Unweighting', col: '#3b82f6' },
  brake: { name: 'Braking', col: '#f59e0b' },
  prop: { name: 'Propulsion', col: '#10b981' },
  flight: { name: 'Flight', col: '#cbd5e1' },
  land: { name: 'Landing', col: '#a855f7' },
  drop: { name: 'Falling from the box', col: '#cbd5e1' }
};
export const PHASES = PH;

// Contact runs: where force is above the threshold, ignoring blips shorter than holdN samples.
// minPeak: a short 'contact' in the air that never gets near a real foot contact is the plate ringing after
// take-off (or after a hard landing), not a contact, so it is merged into the flight.
export function contactRuns(F, thr, holdN, minPeak = 0) {
  const n = F.length, runs = [];
  let i = 0;
  while (i < n) { const v = F[i] > thr ? 1 : 0; let j = i; while (j < n && (F[j] > thr ? 1 : 0) === v) j++; runs.push({ v, s: i, e: j }); i = j; }
  let changed = true;
  while (changed) {
    changed = false;
    for (let k = 1; k < runs.length - 1; k++) {
      if (runs[k].e - runs[k].s < holdN) { runs[k - 1].e = runs[k + 1].e; runs.splice(k, 2); changed = true; break; }
    }
  }
  if (minPeak > 0) {
    for (let k = runs.length - 2; k >= 1; k--) {
      const r = runs[k]; if (r.v !== 1) continue;
      let pk = -Infinity; for (let i = r.s; i < r.e; i++) if (F[i] > pk) pk = F[i];
      if (pk < minPeak) { runs[k - 1].e = runs[k + 1].e; runs.splice(k, 2); if (k > runs.length - 1) k = runs.length - 1; }
    }
  }
  return runs;
}

// Still standing: the longest window (1 s down to 0.2 s) whose SD is close to the quietest 0.2 s in the range.
// prefer 'latest' (just before the jump) or 'earliest' (just after landing).
function findQuiet(F, fs, i0, i1, prefer, maxL = 1, minL = 0.2) {
  const base = quietestWindow(F, i0, i1, Math.max(3, Math.round(0.2 * fs)));
  if (!base) return null;
  const lvl = mean(F, base.s, base.e);
  const lim = Math.max(2 * base.sd, 0.004 * Math.abs(lvl), 1);
  for (const L of [1.5, 1.2, 1.0, 0.8, 0.6, 0.5, 0.4, 0.3, 0.2].filter((x) => x <= maxL + 1e-9 && x >= minL - 1e-9)) {
    const n = Math.round(L * fs); if (i1 - i0 < n) continue;
    // prefix sums
    const m = i1 - i0; const PS = new Float64Array(m + 1), PQ = new Float64Array(m + 1);
    for (let i = 0; i < m; i++) { PS[i + 1] = PS[i] + F[i0 + i]; PQ[i + 1] = PQ[i] + F[i0 + i] * F[i0 + i]; }
    const sdAt = (k) => { const s = PS[k + n] - PS[k], q = PQ[k + n] - PQ[k]; return Math.sqrt(Math.max(0, (q - s * s / n) / (n - 1))); };
    if (prefer === 'earliest') { for (let k = 0; k + n <= m; k++) if (sdAt(k) <= lim) return { s: i0 + k, e: i0 + k + n }; }
    else { for (let k = m - n; k >= 0; k--) if (sdAt(k) <= lim) return { s: i0 + k, e: i0 + k + n }; }
  }
  return { s: base.s, e: base.e };
}

// Weighing before a CMJ or SJ: the steadiest window of L s (lowest SD) that ends within the 1 s before the start
// of movement, so bodyweight comes from still standing right before the jump. Shorter if the recording is.
function stillBefore(F, fs, c0, end, L) {
  let n = Math.round(L * fs);
  if (end - c0 < n) n = end - c0;
  if (n < Math.round(0.2 * fs)) return null;
  const lo = Math.max(c0, end - n - Math.round(1.0 * fs)), step = Math.max(1, Math.round(0.01 * fs));
  let best = null;
  for (let e = end; e - n >= lo; e -= step) { const v = sd(F, e - n, e); if (!best || v < best.sd - 1e-9) best = { s: e - n, e, sd: v }; }
  return best;
}

const first = (n, i0, i1, test) => { for (let i = Math.max(0, i0); i < Math.min(n, i1); i++) if (test(i)) return i; return -1; };

// Take-off and landing. With thrMode 'auto' the trial is first analysed with the fixed threshold to find a period
// with nobody on the plate (the flight, or after take-off in a standing long jump, or before touchdown in a drop jump).
// Its mean (the plate's offset: it should read 0 N) is taken off every sample, and the threshold becomes 5 SD of its
// noise (at least 3 N, at most 50 N). Then the trial is analysed again. If anything fails, the fixed threshold is kept.
// Lake et al. (2018a, 2018b): flight found with a 10 N threshold, the 'centre flight phase' is that flight without
// its first and last 30 ms, and take-off and landing are where force crosses the centre-flight mean + 5 SD.
export function analyse(D, set0) {
  if (set0.thrMode === 'fixed') return analyseCore(D, set0, 0);
  let R1 = analyseCore(D, Object.assign({}, set0, { thr: 10 }), 0);
  if (!R1.ok) R1 = analyseCore(D, set0, 0); // e.g. a noisy plate that never reads below 10 N in the air
  if (!R1.ok) return R1;
  const fs = D.fs, n = D.n, g = Math.round(0.03 * fs), segs = [];
  if (R1.LD > R1.TO) segs.push([R1.TO + g, R1.LD - g]);
  else if (R1.TO > 0) segs.push([R1.TO + Math.round(0.05 * fs), Math.min(n, R1.TO + Math.round(1.05 * fs))]);
  if (R1.TD > 0) segs.push([g, R1.TD - g]);
  const seg = segs.filter((s) => s[1] - s[0] >= Math.round(0.03 * fs)).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];
  if (!seg) { R1.notes.push('No clean period with nobody on the plate was found, so a fixed contact threshold (' + R1.thrUsed + ' N) was used.'); return R1; }
  const off = mean(R1.Fraw, seg[0], seg[1]), nsd = sd(R1.Fraw, seg[0], seg[1]);
  if (!(Math.abs(off) < 100)) { R1.notes.push('The empty plate read ' + off.toFixed(0) + ' N, which is too far from 0 N to trust, so the fixed contact threshold was used.'); return R1; }
  const thr = Math.min(50, Math.max(2, 5 * nsd));
  const R = analyseCore(D, Object.assign({}, set0, { thr }), off);
  if (!R.ok) { R1.notes.push('The threshold from the empty plate did not work for this trial, so the fixed contact threshold (' + set0.thr + ' N) was used.'); return R1; }
  R.thrInfo = { off, sd: nsd, thr, a: seg[0], b: seg[1], fixed: set0.thr };
  R.notes.push('Contact threshold ' + thr.toFixed(1) + ' N: mean + 5 SD (SD ' + nsd.toFixed(2) + ' N) of the centre of the flight (or empty plate) from ' + (seg[0] / fs).toFixed(3) + ' to ' + (seg[1] / fs).toFixed(3) + ' s (Lake et al., 2018).' + (Math.abs(off) >= 1 ? ' The empty plate read ' + off.toFixed(1) + ' N instead of 0 N, so ' + off.toFixed(1) + ' N was taken off every sample (the plate was not quite zeroed).' : ''));
  return R;
}

function analyseCore(D, set0, off) {
  const R = { ok: false, jump: set0.jump, warnings: [], notes: [], fs: D.fs, n: D.n, t: D.t, thrUsed: set0.thr, offset: off || 0 };
  const slj = set0.jump === 'slj', set = slj ? Object.assign({}, set0, { jump: 'cmj' }) : set0;
  const fs = D.fs, dt = 1 / fs, n = D.n, t = D.t;
  if (!(fs > 0)) { R.error = 'The sample rate is not known. Enter it in Setup.'; return R; }
  const roles = D.plates.map((p, k) => set.roles[k] || 'on');
  const used = D.plates.map((p, k) => k).filter((k) => roles[k] !== 'off');
  if (!used.length) { R.error = 'Every plate is switched off. Switch at least one on in Setup &rarr; Plates.'; return R; }
  const filt = set.filt && set.filt.on && set.filt.fc > 0;
  const prep = (y) => (y ? (filt ? butter(y, set.filt.fc, fs) : y) : null);
  R.plates = D.plates.map((p, k) => ({ name: p.name, role: roles[k], fz: prep(p.fz), fx: prep(p.fx), fy: prep(p.fy), rawFz: p.fz }));
  const Fraw = new Float64Array(n);
  used.forEach((k) => { const z = D.plates[k].fz; for (let i = 0; i < n; i++) Fraw[i] += z[i]; });
  if (off) for (let i = 0; i < n; i++) Fraw[i] -= off;
  const F = filt ? butter(Fraw, set.filt.fc, fs) : Fraw;
  R.Fraw = Fraw; R.F = F; R.filtered = filt; R.used = used;

  // ---------- contacts ----------
  const holdN = Math.max(1, Math.round((set.hold || 0) / 1000 * fs));
  const runs = contactRuns(F, set.thr, holdN, Math.max(3 * set.thr, 50));
  const C = runs.filter((r) => r.v === 1);
  R.runs = runs;
  const ovr = (key) => { const v = set.ev && set.ev[key]; return v === null || v === undefined || Number.isNaN(v) ? -1 : Math.max(0, Math.min(n - 1, Math.round(v * fs))); };

  let TO = -1, LD = -1, TD = -1;
  if (set.jump === 'dj') {
    const k = C.findIndex((r) => r.s > 0 && r.e - r.s >= 0.05 * fs);
    if (k < 0) {
      R.error = C.length && C[0].s === 0 ? 'The trace starts with force already on the plate, so there is no touchdown. For a drop jump, start recording before the participant steps off the box. If the box stands on a plate, switch that plate off in Setup.' : 'No contact with the plate was found. Is the threshold too high?';
      return R;
    }
    if (C[0].s === 0 && k > 0) R.warnings.push('There was force on the plate at the start of the recording. Has the box been left on a plate that is switched on?');
    TD = C[k].s; TO = C[k].e < n ? C[k].e : -1; LD = C[k + 1] ? C[k + 1].s : -1;
    if (ovr('touchdown') >= 0) TD = ovr('touchdown');
    if (ovr('takeoff') >= 0) TO = ovr('takeoff');
    if (ovr('landing') >= 0) LD = ovr('landing');
    if (TO < 0) { R.error = 'The participant never left the plate after touching down, so there is no take-off. Is the threshold right?'; return R; }
  } else {
    let k = -1;
    for (let j = 0; j < C.length; j++) {
      const gapEnd = C[j + 1] ? C[j + 1].s : n;
      if (C[j].e - C[j].s >= 0.25 * fs && gapEnd - C[j].e >= 0.08 * fs && C[j].e < n) { k = j; break; }
    }
    if (k < 0) { R.error = 'No flight phase was found (force never dropped below the threshold of ' + set.thr + ' N for long enough). Is this a jump? Is the threshold right?'; return R; }
    TO = C[k].e; LD = C[k + 1] ? C[k + 1].s : -1;
    if (ovr('takeoff') >= 0) TO = ovr('takeoff');
    if (ovr('landing') >= 0) LD = ovr('landing');
  }
  if (LD >= 0 && LD <= TO) LD = -1;
  if (LD < 0 && slj) R.notes.push('The participant landed off the plate, as usual in a standing long jump, so there are no flight or landing values.');
  else if (LD < 0) R.warnings.push('No landing was found, so flight time, jump height from flight time and the landing values are missing. Did the recording stop while the participant was in the air?');
  R.TO = TO; R.LD = LD; R.TD = TD;

  // ---------- weighing (bodyweight) ----------
  let w = null;
  if (set.weigh && set.weigh.e > set.weigh.s) {
    w = { s: Math.max(0, Math.round(set.weigh.s * fs)), e: Math.min(n, Math.round(set.weigh.e * fs)), manual: true };
    if (w.e - w.s < 3) w = null;
  }
  if (!w) {
    if (set.jump === 'dj') { if (LD >= 0) w = findQuiet(F, fs, Math.min(n - 1, LD + Math.round(0.3 * fs)), n, 'earliest'); }
    else { const i0 = C.length ? C[0].s : 0; w = findQuiet(F, fs, i0, Math.max(i0 + 3, TO - Math.round(0.1 * fs)), 'latest', set.weighLen || 1); }
    if (w) w.manual = false;
  }
  let BW = NaN, wsd = NaN, src = '';
  if (w && w.e - w.s >= 3) { BW = mean(F, w.s, w.e); wsd = sd(F, w.s, w.e); }
  R.w = w; R.wsd = wsd; R.bwWeigh = BW; R.headerBW = D.headerBW || 0;
  let mode = set.bwMode || 'auto';
  if (mode === 'header' && !(D.headerBW > 0)) mode = 'auto';
  if (mode === 'mass' && !(set.mass > 0)) mode = 'auto';
  if (mode === 'auto') {
    if (Number.isFinite(BW) && BW > 50) src = set.jump === 'dj' ? 'still standing after landing' : 'still standing before the jump';
    else if (D.headerBW > 0) { mode = 'header'; }
    else { R.error = set.jump === 'dj' ? 'No still standing after the landing was found, so bodyweight is not known. Type the body mass in Setup, or record for longer after landing.' : 'No still standing before the jump was found, so bodyweight is not known. Mark the weighing period by hand or type the body mass in Setup.'; return R; }
  }
  if (mode === 'header') { BW = D.headerBW; src = 'body weight stored in the file'; }
  if (mode === 'mass') { BW = set.mass * G; src = 'body mass typed in'; }
  R.BW = BW; R.m = BW / G; R.bwSource = src; R.bwMode = mode;
  const weighWarn = () => { if (w && Number.isFinite(wsd) && mode === 'auto') {
    if (w.e - w.s < 0.3 * fs) R.warnings.push('Only ' + ((w.e - w.s) / fs).toFixed(2) + ' s of still standing was found' + (set.jump === 'dj' ? ' after landing' : ' before the jump') + ', so bodyweight may be less accurate. About 1 s is better.');
    if (wsd > 0.01 * BW) R.warnings.push('Force varied quite a lot while weighing (SD ' + wsd.toFixed(1) + ' N). Was the participant standing completely still?');
  } };
  if (set.jump === 'dj') weighWarn();

  // ---------- start of movement ----------
  // The threshold band around bodyweight is (default) 5 SD of the weighing, as in Owen et al. (2014), or a % of
  // bodyweight or a fixed force. 'back' search (default): work back from the main movement (the lowest force of
  // the unweighting in a CMJ, the peak of the push in a SJ) to the last sample inside the band, so sway or a
  // fidget earlier in the recording is never taken as the start. 'first' search: the first sample outside the
  // band after the weighing. The start is then moved back by onsetBack ms (30 ms in Owen et al., 2014).
  // With automatic weighing, the weighing period is then moved to the weighLen seconds just before the start
  // and the start found again, so bodyweight always comes from the still standing right before the jump.
  let onset = -1;
  const k = set.onsetK || 5, back = Math.round((set.onsetBack || 0) / 1000 * fs);
  const omode = set.onsetMethod || 'sd';
  const band = (sdv) => omode === 'pct' ? (set.onsetPct || 10) / 100 * BW : omode === 'abs' ? (set.onsetN || 50) : k * Math.max(sdv, 0.5);
  R.onsetThr = null;
  if (set.jump !== 'dj') {
    const c0 = C.length ? C[0].s : 0;
    const pk = argmax(F, c0, TO);
    const findCross = (bnd) => {
      const from = w && set.onsetSearch === 'first' ? w.e : c0;
      if (set.jump === 'cmj') {
        const lo = BW - bnd, iMin = argmin(F, c0, Math.max(c0 + 1, pk));
        if (iMin < 0 || F[iMin] >= lo) return { cross: -1, lo };
        if (set.onsetSearch === 'first') { const c = first(n, from, iMin + 1, (i) => F[i] < lo); return { cross: c, lo, iMin }; }
        let j = iMin; while (j > c0 && F[j] < lo) j--;
        return { cross: j + 1, lo, iMin };
      }
      const hi = BW + bnd;
      if (pk < 0 || F[pk] <= hi) return { cross: -1, hi };
      if (set.onsetSearch === 'first') return { cross: first(n, from, pk + 1, (i) => F[i] > hi), hi };
      let j = pk; while (j > c0 && F[j] > hi) j--;
      return { cross: j + 1, hi };
    };
    let fc = null;
    for (let pass = 0; pass < 3; pass++) {
      const sdW = Number.isFinite(wsd) && wsd > 0 ? wsd : 0.005 * BW;
      const bnd = band(sdW);
      fc = findCross(bnd);
      R.onsetBand = bnd;
      if (fc.cross < 0 || !(w && !w.manual && mode === 'auto')) break;
      // move the weighing to the still standing just before the start (and before any dip in a squat jump)
      let end = Math.max(c0, fc.cross - back);
      if (set.jump === 'sj') {
        const lim = Math.max(c0, end - Math.round(1.0 * fs)), iD = argmin(F, lim, Math.max(lim + 1, end));
        if (iD >= 0 && F[iD] < BW - bnd) { let j = iD; while (j > lim && F[j] < BW - bnd) j--; end = Math.max(c0, j - back); }
      }
      // the steadiest weighLen s (down to 0.5 s if need be) of the still standing before the start, latest first
      const q = stillBefore(F, fs, c0, end, set.weighLen || 1);
      if (!q || q.e - q.s < Math.round(0.2 * fs)) break;
      if (w.s === q.s && w.e === q.e) break;
      w = { s: q.s, e: q.e, manual: false };
      BW = mean(F, w.s, w.e); wsd = sd(F, w.s, w.e);
      R.w = w; R.BW = BW; R.m = BW / G; R.wsd = wsd; R.bwWeigh = BW;
    }
    let cross = fc.cross;
    R.onsetThr = set.jump === 'cmj' ? fc.lo : fc.hi;
    if (cross < 0) {
      R.error = set.jump === 'cmj' ? (slj ? 'No countermovement was found: force never dropped clearly below bodyweight before take-off. Check the still standing before the jump (Events tab).' : 'No countermovement was found: force never dropped clearly below bodyweight before take-off. Is this a squat jump? If so, choose Squat jump in Setup.') : 'The start of the push was not found. Is the weighing period right?';
      return R;
    }
    if (set.jump === 'cmj') {
      // a rise above bodyweight just before the dip (e.g. rising onto the toes or a small arm movement) is flagged, not fatal
      const up = argmax(F, Math.max(c0, cross - Math.round(0.5 * fs)), cross);
      if (up >= 0 && F[up] > BW + Math.max(R.onsetBand, 0.05 * BW)) R.warnings.push('Force rose ' + (F[up] - BW).toFixed(0) + ' N above bodyweight just before the countermovement (at ' + t[up].toFixed(3) + ' s). The participant may have shifted or moved their arms before dipping. The start of movement was taken at the dip; check it in 2. Events.');
    }
    R.onsetCross = cross;
    onset = Math.max(0, cross - back);
    if (ovr('onset') >= 0) onset = ovr('onset');
    if (onset >= TO) { R.error = 'The start of movement is after take-off. Check the events.'; return R; }
    if (set.jump === 'sj') {
      // countermovement check: any dip below bodyweight in the second before the push
      const tol = set.sjTolPct > 0 ? set.sjTolPct / 100 * BW : R.onsetBand;
      const lim = Math.max(c0, cross - Math.round(1.0 * fs)), iMin = argmin(F, lim, Math.max(lim + 1, cross));
      if (iMin >= 0 && F[iMin] < BW - tol) {
        R.cmCheck = { i: iMin, drop: BW - F[iMin] };
        R.warnings.push(BW - F[iMin] > 0.1 * BW ? 'Force dropped ' + (BW - F[iMin]).toFixed(0) + ' N (' + ((BW - F[iMin]) / BW * 100).toFixed(0) + '% of bodyweight) below bodyweight before the push, so this squat jump includes a countermovement. Repeat the trial, or if it was meant to be a CMJ, choose CMJ in Setup.' : 'Possible countermovement: force dipped ' + (BW - F[iMin]).toFixed(0) + ' N (' + ((BW - F[iMin]) / BW * 100).toFixed(1) + '% of bodyweight) below bodyweight just before the push (at ' + t[iMin].toFixed(3) + ' s). In a squat jump the push should start from a still squat.');
      } else R.cmCheck = { i: -1, drop: 0 };
    }
  }
  R.onset = onset;
  if (set.jump !== 'dj') weighWarn();

  // ---------- integration ----------
  const m = R.m;
  const a = new Float64Array(n);
  for (let i = 0; i < n; i++) a[i] = (F[i] - BW) / m;
  const method = set.method === 'rect' ? 'rect' : 'trap';
  let v, s;
  R.integ = { method };
  if (set.jump !== 'dj') {
    v = integrateForward(a, dt, onset, 0, method);
    s = integrateForward(v, dt, onset, 0, method);
    for (let i = 0; i < onset; i++) { v[i] = 0; s[i] = 0; }
    R.integ.dir = 'forward'; R.integ.start = onset;
  } else {
    let dir = set.djDir || 'auto';
    const canBack = w && mode === 'auto' && w.s > TO;
    if (dir === 'auto') dir = canBack ? 'backward' : 'forward';
    if (dir === 'backward' && !(w && w.s > TO)) dir = 'forward';
    if (dir === 'forward' && !(set.drop > 0)) {
      R.error = canBack ? 'Enter the drop (box) height in Setup, or choose backward integration.' : 'Enter the drop (box) height in Setup. Backward integration needs about 1 s of still standing after the landing, and none was found.';
      return R;
    }
    R.integ.dir = dir;
    if (dir === 'forward') {
      const vTD = -Math.sqrt(2 * G * set.drop);
      v = integrateForward(a, dt, TD, vTD, method);
      s = integrateForward(v, dt, TD, 0, method);
      R.integ.start = TD; R.integ.v0 = vTD;
    } else {
      const anc = w.s;
      v = integrateBackward(a, dt, anc, 0, method); integrateForward(a, dt, anc, 0, method, v);
      s = integrateBackward(v, dt, anc, 0, method); integrateForward(v, dt, anc, 0, method, s);
      const s0 = s[TD]; for (let i = 0; i < n; i++) s[i] -= s0;
      R.integ.start = anc;
    }
    const vTD = v[TD];
    R.vTD = vTD; R.dropEff = vTD < 0 ? vTD * vTD / (2 * G) : NaN;
    if (set.drop > 0) R.vTDdrop = -Math.sqrt(2 * G * set.drop);
    // before touchdown: falling from the box (free fall from rest), shown for the picture and graphs
    if (vTD < 0) {
      const t0 = t[TD] + vTD / G, h = R.dropEff;
      for (let i = 0; i < TD; i++) {
        const tt = t[i];
        if (tt < t0) { v[i] = 0; s[i] = h; } else { v[i] = -G * (tt - t0); s[i] = h - 0.5 * G * (tt - t0) ** 2; }
      }
      R.stepOff = Math.max(0, Math.round(t0 * fs));
    } else R.warnings.push('The touchdown velocity came out upwards, which cannot be right. Check the bodyweight and the still standing after landing.');
  }
  const P = new Float64Array(n);
  for (let i = 0; i < n; i++) P[i] = F[i] * v[i];
  R.a = a; R.v = v; R.s = s; R.P = P;

  // ---------- derived events ----------
  const ph = [];
  const addPh = (key, i0, i1) => { if (i0 >= 0 && i1 > i0) ph.push({ key, name: PH[key].name, col: PH[key].col, s: i0, e: i1 }); };
  const ev = [];
  const addEv = (key, name, i, edit) => { if (i >= 0) ev.push({ key, name, i, edit: !!edit }); };
  if (w) addPh('weigh', w.s, w.e);
  if (set.jump === 'cmj') {
    const vMin = argmin(v, onset, TO);
    let zero = first(n, vMin + 1, TO + 1, (i) => v[i] >= 0);
    if (zero < 0) { R.warnings.push('The centre of mass velocity never got back to zero before take-off, so the braking and propulsion phases could not be split. This usually means the bodyweight is wrong.'); zero = -1; }
    const minF = argmin(F, onset, vMin + 1);
    R.vMinI = vMin; R.zeroI = zero; R.minFI = minF;
    addPh('unweight', onset, vMin);
    if (zero > 0) { addPh('brake', vMin, zero); addPh('prop', zero, TO); }
    addEv('onset', 'Start of movement', onset, true);
    addEv('vmin', 'Peak downward velocity (end of unweighting)', vMin, false);
    if (zero > 0) addEv('zero', 'Lowest point, velocity = 0 (end of braking)', zero, false);
  } else if (set.jump === 'sj') {
    addPh('prop', onset, TO);
    addEv('onset', 'Start of push', onset, true);
  } else {
    let low = first(n, TD + 1, TO + 1, (i) => v[i] >= 0);
    if (low < 0) { R.warnings.push('The centre of mass velocity never got back to zero during the contact, so braking and propulsion could not be split. Check the bodyweight and drop height.'); }
    R.lowI = low;
    if (R.stepOff >= 0 && R.stepOff < TD) addPh('drop', R.stepOff, TD);
    if (low > 0) { addPh('brake', TD, low); addPh('prop', low, TO); } else addPh('brake', TD, TO);
    addEv('touchdown', 'Touchdown', TD, true);
    if (low > 0) addEv('low', 'Lowest point, velocity = 0 (end of braking)', low, false);
  }
  addEv('takeoff', 'Take-off', TO, true);
  if (LD >= 0) {
    addPh('flight', TO, LD);
    addEv('landing', 'Landing', LD, true);
    let le = first(n, LD + 1, n, (i) => v[i] >= 0);
    const lim = le > 0 ? le + 1 : Math.min(n, LD + Math.round(0.5 * fs));
    R.landEndI = le; R.peakLandI = argmax(F, LD, lim);
    if (le > 0) { addPh('land', LD, le); addEv('landend', 'Lowest point after landing (velocity = 0)', le, false); }
    // force offset in the air (should be about zero)
    const f0 = TO + Math.round(0.02 * fs), f1 = LD - Math.round(0.02 * fs);
    if (f1 - f0 > 5) {
      R.flightOffset = mean(Fraw, f0, f1); R.flightSD = sd(Fraw, f0, f1);
      if (Math.abs(R.flightOffset) > 5 && !off) R.warnings.push('In the air the plate read ' + R.flightOffset.toFixed(1) + ' N instead of 0 N. The plate may not have been zeroed (reset) before the trial, which shifts every force value by about this much.');
    }
  } else { R.landEndI = -1; R.peakLandI = -1; }
  ph.sort((x, y) => x.s - y.s);
  ev.sort((x, y) => x.i - y.i);
  if (w) { ev.push({ key: 'weighS', name: 'Weighing starts', i: w.s, edit: true, weigh: true }); ev.push({ key: 'weighE', name: 'Weighing ends', i: w.e - 1, edit: true, weigh: true }); }
  R.phases = ph; R.events = ev;
  if (slj) horizontal(R, set0, w, onset, TO);
  R.ok = true;
  return R;
}

// ---------- standing long jump: the horizontal force ----------
// For each plate, the horizontal force that pushes the jump forwards is the one (Fx or Fy) with the biggest impulse
// from the start of movement to take-off, signed so that the impulse is forwards. Its value while standing still
// (should be zero) is taken off first. Horizontal acceleration = Fh / m, integrated from rest at the start of movement.
function horizontal(R, set, w, onset, TO) {
  const n = R.n, fs = R.fs, dt = 1 / fs, Fh = new Float64Array(n), info = [];
  const vimp = R.used.map((k) => { const z = R.plates[k].fz; let s = 0; for (let i = onset; i < TO; i++) s += z[i] * dt; return s; }), vt = vimp.reduce((a, b) => a + b, 0);
  R.loaded = R.used.filter((k, j) => vimp[j] > 0.1 * vt);
  R.single = R.loaded.length === 1 && R.used.length > 1;
  R.loaded.forEach((k) => {
    const p = R.plates[k], cand = [];
    ['fx', 'fy'].forEach((ax) => {
      const y = p[ax]; if (!y) return;
      const off = w && w.e > w.s ? mean(y, w.s, w.e) : 0;
      let imp = 0; for (let i = onset; i < TO; i++) imp += (y[i] - off) * dt;
      cand.push({ ax, y, off, imp });
    });
    if (!cand.length) return;
    const fixed = set.sljAxis && set.sljAxis[k];
    let c = fixed ? cand.find((q) => q.ax === fixed.ax) : null;
    if (!c) c = cand.reduce((a, b) => (Math.abs(b.imp) > Math.abs(a.imp) ? b : a));
    const sign = fixed && c.ax === fixed.ax ? (fixed.sign || 1) : (c.imp >= 0 ? 1 : -1);
    for (let i = 0; i < n; i++) Fh[i] += sign * (c.y[i] - c.off);
    info.push({ plate: k, name: p.name, ax: c.ax, sign, off: c.off, imp: sign * c.imp, auto: !fixed });
  });
  if (!info.length) { R.warnings.push('This file has no horizontal force (Fx or Fy), so only the vertical part of the jump can be analysed.'); return; }
  for (let i = TO; i < n; i++) Fh[i] = 0; // in the air there is no horizontal force from the plate
  const meth = R.integ.method, m = R.m;
  const ah = new Float64Array(n); for (let i = 0; i < n; i++) ah[i] = Fh[i] / m;
  // from rest: the end of the still standing if it comes before the start of movement (an arm swing can start
  // the horizontal push before the vertical countermovement), otherwise the start of movement
  const h0 = w && w.e > 0 && w.e < onset ? w.e : onset;
  const vh = integrateForward(ah, dt, h0, 0, meth), sh = integrateForward(vh, dt, h0, 0, meth);
  for (let i = 0; i < h0; i++) { vh[i] = 0; sh[i] = 0; }
  R.hStart = h0;
  for (let i = TO + 1; i < n; i++) { vh[i] = vh[TO]; sh[i] = sh[TO] + vh[TO] * (i - TO) * dt; }
  const Ph = new Float64Array(n); for (let i = 0; i < n; i++) Ph[i] = Fh[i] * vh[i];
  R.Fh = Fh; R.ah = ah; R.vh = vh; R.sh = sh; R.Ph = Ph; R.hInfo = info;
  R.notes.push('Horizontal force: ' + info.map((q) => q.name + ' ' + (q.sign < 0 ? '&minus;' : '') + q.ax.toUpperCase() + (Math.abs(q.off) > 2 ? ' (after taking off its standing-still value of ' + q.off.toFixed(1) + ' N)' : '')).join(' + ') + ', chosen as the force that pushes forwards.' + (R.single ? ' Only ' + R.plates[R.loaded[0]].name + ' was pushed on, so this is a single-leg jump.' : ''));
}

// Which phase is sample i in?
export function phaseAt(R, i) {
  if (!R || !R.phases) return null;
  for (const p of R.phases) if (i >= p.s && i < p.e && p.key !== 'weigh') return p;
  for (const p of R.phases) if (i >= p.s && i < p.e) return p;
  return null;
}

// Plain-English description of what is happening at sample i.
export function explain(R, i) {
  if (!R || !R.ok) return '';
  const F = R.F[i], BW = R.BW, v = R.v[i], p = phaseAt(R, i);
  const key = p ? p.key : '';
  const tol = Math.max(3, 0.01 * BW);
  const above = F > BW + tol, below = F < BW - tol;
  const up = v > 0.02, down = v < -0.02;
  if (key === 'flight') return 'In the air. The only force is gravity, so the centre of mass slows down on the way up and speeds up on the way down (acceleration = &minus;9.81 m/s&sup2;).';
  if (key === 'drop') return 'Falling from the box before touchdown. Nothing is on the plate yet; the velocity shown is worked out from the touchdown velocity and free fall.';
  if (key === 'weigh') return 'Standing still: force equals bodyweight, so the net force and acceleration are zero. This period is used to weigh the participant.';
  if (R.jump !== 'dj' && i < R.onset) return 'Before the start of movement: force is about equal to bodyweight, so the centre of mass is not accelerating.';
  if (R.LD >= 0 && i >= R.LD) {
    if (key === 'land' && above) return 'Landing: force is above bodyweight while the body is still moving down, so the downward velocity is being slowed (absorbed).';
    if (!up && !down) return 'After landing: the centre of mass has come to rest and force settles back to bodyweight.';
  }
  if (Math.abs(F) < 30 && R.jump === 'dj' && i < R.TD) return 'Nothing on the plate yet.';
  if (below && down) return 'Force is below bodyweight, so there is a net downward force: the centre of mass is speeding up downwards' + (key === 'unweight' ? ' (unweighting)' : '') + '.';
  if (above && down) return 'Force is above bodyweight while the centre of mass is still moving down, so the downward movement is being slowed (braking).';
  if (above && up) return 'Force is above bodyweight and the centre of mass is moving up, so it is being pushed upwards faster (propulsion).';
  if (below && up) return 'Force has dropped below bodyweight while moving up, so the upward velocity is now slowing slightly before take-off.';
  if (!above && !below && (down || up)) return 'Force is about equal to bodyweight, so the net force is about zero: velocity is at a peak (' + (down ? 'fastest downwards' : 'fastest upwards') + ') and is not changing for a moment.';
  if (below) return 'Force is below bodyweight: net force is downwards.';
  if (above) return 'Force is above bodyweight: net force is upwards.';
  return 'Force is about equal to bodyweight.';
}

// A first guess at the jump type from the shape of the trace (the user can change it).
// Jump type: from the file name if it says (e.g. CMJ, cm1, SJ, SQJ, drop jump), otherwise from the shape: a CMJ
// moves the centre of mass clearly downwards before the push (peak downward velocity beyond -0.4 m/s), a squat
// jump does not.
// Plain-language description of how the start of movement and the weighing were found (Events tab, Word export).
export function onsetText(set, jump) {
  const cm = jump !== 'sj', dir = cm ? 'below' : 'above';
  const m = set.onsetMethod || 'sd';
  const band = m === 'pct' ? (set.onsetPct || 10) + '% of bodyweight' : m === 'abs' ? (set.onsetN || 50) + ' N' : (set.onsetK || 5) + ' SD of the weighing';
  const how = set.onsetSearch === 'first'
    ? 'the first sample after the weighing more than ' + band + ' ' + dir + ' bodyweight'
    : 'more than ' + band + ' ' + dir + ' bodyweight, found by working back from the ' + (cm ? 'lowest force of the countermovement' : 'peak of the push') + ' to the last sample inside that band (so sway earlier in the recording is ignored)';
  return how + (set.onsetBack > 0 ? ', then moved back ' + set.onsetBack + ' ms' : '') + (m === 'sd' && (set.onsetK || 5) === 5 && set.onsetBack === 30 ? ' (Owen et al., 2014)' : '');
}
export function weighText(set) {
  return 'The steadiest ' + (set.weighLen || 1) + ' s (lowest SD) of still standing ending within the second before the start of movement' + (set.weighLen >= 1 ? '' : ' (at least 1 s is recommended)');
}

export function jumpFromName(name) {
  const s = ' ' + String(name || '').replace(/\.[^.]+$/, '').toLowerCase().replace(/[_\-.]+/g, ' ') + ' ';
  if (/[^a-z](dj|drop ?jump|depth ?jump)\d*[^a-z]/.test(s)) return 'dj';
  if (/[^a-z](cmj|cm|counter ?movement( ?jump)?)\d*[^a-z]/.test(s)) return 'cmj';
  if (/[^a-z](sj|sqj|squat ?jump)\d*[^a-z]/.test(s)) return 'sj';
  return '';
}
export function guessJump(D, name) {
  const n = D.n, fs = D.fs, F = new Float64Array(n);
  D.plates.forEach((p) => { for (let i = 0; i < n; i++) F[i] += p.fz[i]; });
  const k = Math.max(5, Math.round(0.1 * fs));
  if (mean(F, 0, k) < 50) return 'dj';
  const byName = jumpFromName(name);
  if (byName) return byName;
  const R = analyseCore(D, Object.assign(defaultSettings(), { jump: 'cmj' }), 0);
  if (!R.ok) return /squat jump/i.test(R.error || '') ? 'sj' : 'cmj';
  let vMin = 0; for (let i = R.onset; i < R.TO; i++) if (R.v[i] < vMin) vMin = R.v[i];
  return vMin < -0.4 ? 'cmj' : 'sj';
}

// ---------- events by name, for lining trials up and cutting out windows (Compare trials, Figure) ----------
const EV_LABELS = {
  onset: 'Start of movement', vmin: 'Peak downward velocity (start of braking)', zero: 'Lowest point (start of propulsion)',
  minF: 'Lowest force', pkF: 'Peak force (before take-off)', td: 'Touchdown', to: 'Take-off', ld: 'Landing', le: 'Lowest point after landing'
};
export function eventChoices(jump) {
  const k = jump === 'sj' ? ['onset', 'pkF', 'to', 'ld', 'le'] : jump === 'dj' ? ['td', 'zero', 'pkF', 'to', 'ld', 'le'] : ['onset', 'minF', 'vmin', 'zero', 'pkF', 'to', 'ld', 'le'];
  return k.map((x) => [x, x === 'onset' && jump === 'sj' ? 'Start of push' : EV_LABELS[x]]);
}
export function eventIndex(R, key) {
  if (!R || !R.ok || R.generic) return -1;
  const a = R.jump === 'dj' ? R.TD : R.onset;
  switch (key) {
    case 'onset': return R.jump === 'dj' ? -1 : R.onset;
    case 'td': return R.jump === 'dj' ? R.TD : -1;
    case 'vmin': return R.vMinI >= 0 && R.jump !== 'sj' && R.jump !== 'dj' ? R.vMinI : -1;
    case 'zero': return R.jump === 'dj' ? (R.lowI > 0 ? R.lowI : -1) : R.zeroI > 0 ? R.zeroI : -1;
    case 'minF': return R.minFI >= 0 ? R.minFI : -1;
    case 'pkF': return a >= 0 && R.TO > a ? argmax(R.F, a, R.TO) : -1;
    case 'to': return R.TO;
    case 'ld': return R.LD > 0 ? R.LD : -1;
    case 'le': return R.landEndI > 0 ? R.landEndI : -1;
    default: return -1;
  }
}
export const EVENT_LABELS = EV_LABELS;
