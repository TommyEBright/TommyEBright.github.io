// The analysis of one trial: bodyweight, events, integration (force -> acceleration -> velocity ->
// displacement), phases and power. No page code here, so it can be tested on its own.
import { G, butter, integrateForward, integrateBackward, mean, sd, argmax, argmin, quietestWindow } from './maths.js?v=1.0.0';

export const JUMPS = { cmj: 'Countermovement jump (CMJ)', sj: 'Squat jump (SJ)', dj: 'Drop jump (DJ)' };
export const JUMP_SHORT = { cmj: 'CMJ', sj: 'SJ', dj: 'Drop jump' };

export function defaultSettings() {
  return {
    jump: 'cmj',
    thr: 20,          // contact threshold (N)
    hold: 10,         // ms the force must stay above/below the threshold
    onsetK: 5,        // start of movement: bodyweight +/- k SD (Owen et al., 2014)
    onsetBack: 30,    // ... minus this many ms
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
export function contactRuns(F, thr, holdN) {
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
  return runs;
}

// Still standing: the longest window (1 s down to 0.2 s) whose SD is close to the quietest 0.2 s in the range.
// prefer 'latest' (just before the jump) or 'earliest' (just after landing).
function findQuiet(F, fs, i0, i1, prefer) {
  const base = quietestWindow(F, i0, i1, Math.max(3, Math.round(0.2 * fs)));
  if (!base) return null;
  const lvl = mean(F, base.s, base.e);
  const lim = Math.max(2 * base.sd, 0.004 * Math.abs(lvl), 1);
  for (const L of [1.0, 0.8, 0.6, 0.5, 0.4, 0.3, 0.2]) {
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

const first = (n, i0, i1, test) => { for (let i = Math.max(0, i0); i < Math.min(n, i1); i++) if (test(i)) return i; return -1; };

export function analyse(D, set) {
  const R = { ok: false, jump: set.jump, warnings: [], notes: [], fs: D.fs, n: D.n, t: D.t };
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
  const F = filt ? butter(Fraw, set.filt.fc, fs) : Fraw;
  R.Fraw = Fraw; R.F = F; R.filtered = filt; R.used = used;

  // ---------- contacts ----------
  const holdN = Math.max(1, Math.round((set.hold || 0) / 1000 * fs));
  const runs = contactRuns(F, set.thr, holdN);
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
  if (LD < 0) R.warnings.push('No landing was found, so flight time, jump height from flight time and the landing values are missing. Did the recording stop while the participant was in the air?');
  R.TO = TO; R.LD = LD; R.TD = TD;

  // ---------- weighing (bodyweight) ----------
  let w = null;
  if (set.weigh && set.weigh.e > set.weigh.s) {
    w = { s: Math.max(0, Math.round(set.weigh.s * fs)), e: Math.min(n, Math.round(set.weigh.e * fs)), manual: true };
    if (w.e - w.s < 3) w = null;
  }
  if (!w) {
    if (set.jump === 'dj') { if (LD >= 0) w = findQuiet(F, fs, Math.min(n - 1, LD + Math.round(0.3 * fs)), n, 'earliest'); }
    else { const i0 = C.length ? C[0].s : 0; w = findQuiet(F, fs, i0, Math.max(i0 + 3, TO - Math.round(0.1 * fs)), 'latest'); }
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
  if (w && Number.isFinite(wsd) && mode === 'auto') {
    if (w.e - w.s < 0.3 * fs) R.warnings.push('Only ' + ((w.e - w.s) / fs).toFixed(2) + ' s of still standing was found' + (set.jump === 'dj' ? ' after landing' : ' before the jump') + ', so bodyweight may be less accurate. About 1 s is better.');
    if (wsd > 0.01 * BW) R.warnings.push('Force varied quite a lot while weighing (SD ' + wsd.toFixed(1) + ' N). Was the participant standing completely still?');
  }

  // ---------- start of movement ----------
  let onset = -1;
  const k = set.onsetK || 5, back = Math.round((set.onsetBack || 0) / 1000 * fs);
  const sdW = Number.isFinite(wsd) && wsd > 0 ? wsd : 0.005 * BW;
  R.onsetThr = null;
  if (set.jump !== 'dj') {
    const from = w ? w.e : 0;
    let cross;
    if (set.jump === 'cmj') {
      R.onsetThr = BW - k * sdW; cross = first(n, from, TO, (i) => F[i] < BW - k * sdW);
      const upFirst = first(n, from, TO, (i) => F[i] > BW + Math.max(k * sdW, 0.1 * BW));
      if (upFirst >= 0 && (cross < 0 || upFirst < cross)) { R.error = 'No countermovement was found: force rose above bodyweight before it ever dropped below it. This looks like a squat jump, so choose Squat jump in Setup.'; return R; }
    }
    else { R.onsetThr = BW + k * sdW; cross = first(n, from, TO, (i) => F[i] > BW + k * sdW); }
    if (cross < 0) {
      R.error = set.jump === 'cmj' ? 'No countermovement was found: force never dropped clearly below bodyweight before take-off. Is this a squat jump?' : 'The start of the push was not found. Is the weighing period right?';
      return R;
    }
    R.onsetCross = cross;
    onset = Math.max(0, cross - back);
    if (ovr('onset') >= 0) onset = ovr('onset');
    if (onset >= TO) { R.error = 'The start of movement is after take-off. Check the events.'; return R; }
    if (set.jump === 'sj') {
      const iMin = argmin(F, from, Math.max(from + 1, cross));
      if (iMin >= 0 && F[iMin] < BW - k * sdW) {
        R.cmCheck = { i: iMin, drop: BW - F[iMin] };
        R.warnings.push(BW - F[iMin] > 0.1 * BW ? 'Force dropped ' + (BW - F[iMin]).toFixed(0) + ' N (' + ((BW - F[iMin]) / BW * 100).toFixed(0) + '% of bodyweight) below bodyweight before the push. This looks like a countermovement jump: if it is, choose CMJ in Setup.' : 'Possible countermovement: force dipped ' + (BW - F[iMin]).toFixed(0) + ' N below bodyweight just before the push (at ' + t[iMin].toFixed(3) + ' s). In a squat jump the push should start from a still squat.');
      } else R.cmCheck = { i: -1, drop: 0 };
    }
  }
  R.onset = onset;
  // the automatic weighing period must finish before the movement starts
  if (w && !w.manual && set.jump !== 'dj' && w.e > onset && onset - w.s >= Math.round(0.2 * fs) && mode === 'auto') {
    w.e = onset; BW = mean(F, w.s, w.e); wsd = sd(F, w.s, w.e);
    R.BW = BW; R.m = BW / G; R.wsd = wsd; R.bwWeigh = BW;
  }

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
      if (Math.abs(R.flightOffset) > 5) R.warnings.push('In the air the plate read ' + R.flightOffset.toFixed(1) + ' N instead of 0 N. The plate may not have been zeroed (reset) before the trial, which shifts every force value by about this much.');
    }
  } else { R.landEndI = -1; R.peakLandI = -1; }
  ph.sort((x, y) => x.s - y.s);
  ev.sort((x, y) => x.i - y.i);
  if (w) { ev.push({ key: 'weighS', name: 'Weighing starts', i: w.s, edit: true, weigh: true }); ev.push({ key: 'weighE', name: 'Weighing ends', i: w.e - 1, edit: true, weigh: true }); }
  R.phases = ph; R.events = ev;
  R.ok = true;
  return R;
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
export function guessJump(D) {
  const n = D.n, fs = D.fs, F = new Float64Array(n);
  D.plates.forEach((p) => { for (let i = 0; i < n; i++) F[i] += p.fz[i]; });
  const k = Math.max(5, Math.round(0.1 * fs));
  if (mean(F, 0, k) < 50) return 'dj';
  const R = analyse(D, Object.assign(defaultSettings(), { jump: 'cmj' }));
  if (!R.ok && /squat jump/.test(R.error || '')) return 'sj';
  return 'cmj';
}
