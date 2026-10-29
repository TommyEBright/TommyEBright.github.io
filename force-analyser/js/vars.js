// Every variable the tool reports: name, phase, level, units, how it is worked out (with the trial's own numbers).
// Levels: 1 Foundation (Level 4), 2 Intermediate (Level 5), 3 Advanced (Level 6 and MSc).
import { G, area, mean, argmax, argmin } from './maths.js?v=1.0.0';

const f = (x, d) => (x === null || x === undefined || !Number.isFinite(x) ? '&ndash;' : x.toFixed(d));
const fs3 = (x) => f(x, 3);

// Unit types. SI value -> display value for each force unit choice ('N', 'Nkg' or 'BW').
export const UNITS = {
  force: { N: ['N', 1, 0], Nkg: ['N/kg', 'm', 2], BW: ['&times; BW', 'BW', 2] },
  imp: { N: ['N&middot;s', 1, 1], Nkg: ['N&middot;s/kg', 'm', 3], BW: ['N&middot;s/kg', 'm', 3] },
  power: { N: ['W', 1, 0], Nkg: ['W/kg', 'm', 2], BW: ['W/kg', 'm', 2] },
  rfd: { N: ['N/s', 1, 0], Nkg: ['N/s/kg', 'm', 1], BW: ['BW/s', 'BW', 2] },
  time: { all: ['s', 1, 3] },
  vel: { all: ['m/s', 1, 2] },
  height: { all: ['cm', 0.01, 1] },
  disp: { all: ['cm', 0.01, 1] },
  mass: { all: ['kg', 1, 1] },
  bw: { all: ['N', 1, 0] },
  rsi: { all: ['m/s', 1, 2] },
  pct: { all: ['%', 1, 1] }
};
export function display(type, v, u, R) {
  const U = UNITS[type]; if (!U) return { val: f(v, 2), unit: '' };
  const def = U.all || U[u] || U.N;
  let k = def[1];
  if (k === 'm') k = R.m; else if (k === 'BW') k = R.BW;
  const x = Number.isFinite(v) ? v / k : NaN;
  return { val: f(x, def[2]), unit: def[0], num: x };
}

const GROUPS = {
  cmj: ['Outcome', 'Body', 'Unweighting', 'Braking', 'Propulsion', 'Landing', 'Left vs right'],
  sj: ['Outcome', 'Body', 'Propulsion', 'Landing', 'Left vs right'],
  dj: ['Outcome', 'Body', 'Touchdown', 'Braking', 'Propulsion', 'Landing', 'Left vs right']
};
export function groupsFor(jump) { return GROUPS[jump]; }

// Asymmetry between two plates marked left and right: (L - R) / bigger x 100.
function asym(L, Rv) { const b = Math.max(Math.abs(L), Math.abs(Rv)); return b ? (L - Rv) / b * 100 : NaN; }

export function computeVars(R, set) {
  if (!R || !R.ok) return [];
  const out = [];
  const { F, v, s, P, fs, BW, m, TO, LD, TD, onset } = R;
  const dt = 1 / fs, meth = R.integ.method;
  const jump = R.jump;
  const T = (i) => i / fs;
  const add = (o) => { out.push(o); return o; };
  const N0 = (x) => f(x, 0), N1 = (x) => f(x, 1), N2 = (x) => f(x, 2);

  // ---------- body ----------
  add({ key: 'bw', name: 'Body weight', group: 'Body', level: 1, type: 'bw', value: BW,
    how: 'From ' + R.bwSource + (R.w && R.bwMode === 'auto' ? ' (' + fs3(T(R.w.s)) + ' to ' + fs3(T(R.w.e)) + ' s): the mean force over that period = ' + N1(BW) + ' N (SD ' + N1(R.wsd) + ' N)' : ': ' + N1(BW) + ' N') + '. Bodyweight has to be very accurate because it is subtracted from every force sample before integrating (Robertson et al., 2014).' });
  add({ key: 'mass', name: 'Body mass', group: 'Body', level: 1, type: 'mass', value: m,
    how: 'm = W &divide; g = ' + N1(BW) + ' &divide; 9.81 = ' + N2(m) + ' kg.' });

  const tov = v[TO];
  const ft = LD >= 0 ? (LD - TO) / fs : NaN;
  const jhT = tov > 0 ? tov * tov / (2 * G) : NaN;
  const jhF = Number.isFinite(ft) ? G * ft * ft / 8 : NaN;

  // ---------- outcome ----------
  add({ key: 'jh_tov', name: 'Jump height (from take-off velocity)', short: 'Jump height (TOV)', group: 'Outcome', level: 1, type: 'height', value: jhT, key1: true,
    how: 'Take-off velocity v = ' + N2(tov) + ' m/s. h = v&sup2; &divide; 2g = ' + N2(tov) + '&sup2; &divide; (2 &times; 9.81) = ' + fs3(jhT) + ' m = ' + N1(jhT * 100) + ' cm. This is how far the centre of mass rises after take-off (the impulse&ndash;momentum method; Linthorne, 2001).' });
  add({ key: 'jh_ft', name: 'Jump height (from flight time)', short: 'Jump height (FT)', group: 'Outcome', level: 1, type: 'height', value: jhF, key1: true,
    how: 'Flight time t = ' + fs3(ft) + ' s. h = g t&sup2; &divide; 8 = 9.81 &times; ' + fs3(ft) + '&sup2; &divide; 8 = ' + fs3(jhF) + ' m = ' + N1(jhF * 100) + ' cm. This assumes the body is in exactly the same position at landing as at take-off. Landing with bent knees or flat feet makes the flight longer, so this method usually gives a slightly higher jump than take-off velocity (Moir, 2008).' });
  add({ key: 'tov', name: 'Take-off velocity', group: 'Outcome', level: 1, type: 'vel', value: tov, key1: true,
    how: 'The centre of mass velocity at the first sample below the threshold (' + fs3(T(TO)) + ' s), from integrating acceleration (see the Integration tab).' });
  add({ key: 'ft', name: 'Flight time', group: 'Outcome', level: 1, type: 'time', value: ft,
    how: 'Landing &minus; take-off = ' + fs3(LD >= 0 ? T(LD) : NaN) + ' &minus; ' + fs3(T(TO)) + ' = ' + fs3(ft) + ' s. Both are where the force crosses the ' + set.thr + ' N threshold.' });

  if (jump !== 'dj') {
    const ttt = (TO - onset) / fs;
    add({ key: 'ttt', name: jump === 'cmj' ? 'Time to take-off' : 'Propulsion time', group: 'Outcome', level: jump === 'cmj' ? 2 : 1, type: 'time', value: ttt,
      how: 'Take-off &minus; start of movement = ' + fs3(T(TO)) + ' &minus; ' + fs3(T(onset)) + ' = ' + fs3(ttt) + ' s.' + (jump === 'cmj' ? ' Also called contraction time.' : '') });
    add({ key: 'rsimod', name: 'RSImod (reactive strength index modified)', short: 'RSImod', group: 'Outcome', level: 2, type: 'rsi', value: jhT / ttt,
      how: 'Jump height (take-off velocity) &divide; time to take-off = ' + fs3(jhT) + ' m &divide; ' + fs3(ttt) + ' s = ' + N2(jhT / ttt) + ' (Ebben &amp; Petushek, 2010). Higher means the jump was both high and quick.' });
  }

  // Peak force before take-off
  const i0 = jump === 'dj' ? TD : onset;
  const pkI = argmax(F, i0, TO);
  add({ key: 'pf', name: jump === 'dj' ? 'Peak force (contact)' : 'Peak force', group: 'Outcome', level: 1, type: 'force', value: F[pkI], key1: true,
    how: 'The biggest force between ' + (jump === 'dj' ? 'touchdown' : 'the start of movement') + ' and take-off: ' + N0(F[pkI]) + ' N at ' + fs3(T(pkI)) + ' s (' + N2(F[pkI] / BW) + ' &times; bodyweight).' });

  // Peak power
  const ppI = argmax(P, i0, TO);
  add({ key: 'pp', name: 'Peak power', group: jump === 'dj' ? 'Propulsion' : 'Outcome', level: 2, type: 'power', value: P[ppI],
    how: 'Power = force &times; centre of mass velocity, at every sample. The biggest value before take-off is ' + N0(F[ppI]) + ' N &times; ' + N2(v[ppI]) + ' m/s = ' + N0(P[ppI]) + ' W at ' + fs3(T(ppI)) + ' s.' });

  if (jump === 'cmj') {
    const vMin = R.vMinI, zero = R.zeroI, minF = R.minFI;
    const hasZ = zero > 0;
    // Unweighting
    add({ key: 'unw_t', name: 'Unweighting duration', group: 'Unweighting', level: 2, type: 'time', value: (vMin - onset) / fs,
      how: 'From the start of movement to peak downward velocity (where force comes back up to bodyweight; McMahon et al., 2018): ' + fs3(T(vMin)) + ' &minus; ' + fs3(T(onset)) + ' = ' + fs3((vMin - onset) / fs) + ' s.' });
    add({ key: 'minf', name: 'Minimum force', group: 'Unweighting', level: 2, type: 'force', value: F[minF],
      how: 'The lowest force during unweighting: ' + N0(F[minF]) + ' N at ' + fs3(T(minF)) + ' s (' + N0(BW - F[minF]) + ' N below bodyweight). The lower it goes, the faster the participant drops.' });
    add({ key: 'vmin', name: 'Peak downward velocity', group: 'Unweighting', level: 2, type: 'vel', value: v[vMin],
      how: 'The most negative centre of mass velocity: ' + N2(v[vMin]) + ' m/s at ' + fs3(T(vMin)) + ' s. It happens where force crosses back above bodyweight, because from then on the net force is upwards and starts slowing the drop.' });
    const unwImp = area(F, dt, onset, vMin, meth, BW);
    add({ key: 'unw_imp', name: 'Unweighting impulse (net)', group: 'Unweighting', level: 3, type: 'imp', value: unwImp,
      how: 'Area between the force curve and bodyweight during unweighting (the shaded area below the bodyweight line) = ' + N1(unwImp) + ' N&middot;s. Impulse = change in momentum, so it equals m &times; peak downward velocity = ' + N2(m) + ' &times; ' + N2(v[vMin]) + ' = ' + N1(m * v[vMin]) + ' N&middot;s.' });
    // Braking
    if (hasZ) {
      const bt = (zero - vMin) / fs;
      add({ key: 'brk_t', name: 'Braking duration', group: 'Braking', level: 2, type: 'time', value: bt,
        how: 'From peak downward velocity to zero velocity (the lowest point): ' + fs3(T(zero)) + ' &minus; ' + fs3(T(vMin)) + ' = ' + fs3(bt) + ' s.' });
      const bI = argmax(F, vMin, zero + 1);
      add({ key: 'brk_pf', name: 'Peak braking force', group: 'Braking', level: 2, type: 'force', value: F[bI],
        how: 'The biggest force during braking: ' + N0(F[bI]) + ' N at ' + fs3(T(bI)) + ' s.' });
      const mbf = mean(F, vMin, zero + 1);
      add({ key: 'brk_mf', name: 'Mean braking force', group: 'Braking', level: 3, type: 'force', value: mbf,
        how: 'The average of every force sample during braking = ' + N0(mbf) + ' N.' });
      const bImp = area(F, dt, vMin, zero, meth, BW);
      add({ key: 'brk_imp', name: 'Braking impulse (net)', group: 'Braking', level: 2, type: 'imp', value: bImp,
        how: 'Area between the force curve and bodyweight during braking = ' + N1(bImp) + ' N&middot;s. It brings the downward momentum (' + N1(m * v[vMin]) + ' N&middot;s) back to zero, so it is the same size as the unweighting impulse.' });
      const rfd = (F[zero] - F[vMin]) / bt;
      add({ key: 'brk_rfd', name: 'Braking RFD (rate of force development)', short: 'Braking RFD', group: 'Braking', level: 3, type: 'rfd', value: rfd,
        how: 'Change in force across the braking phase &divide; its duration = (' + N0(F[zero]) + ' &minus; ' + N0(F[vMin]) + ') &divide; ' + fs3(bt) + ' = ' + N0(rfd) + ' N/s.' });
      add({ key: 'f0v', name: 'Force at zero velocity', group: 'Braking', level: 3, type: 'force', value: F[zero],
        how: 'Force at the lowest point, where velocity = 0: ' + N0(F[zero]) + ' N at ' + fs3(T(zero)) + ' s.' });
      add({ key: 'depth', name: 'Countermovement depth', group: 'Braking', level: 2, type: 'disp', value: -s[zero],
        how: 'How far the centre of mass dropped: displacement at the lowest point = ' + fs3(s[zero]) + ' m, so the depth is ' + N1(-s[zero] * 100) + ' cm. It comes from integrating velocity (the area under the velocity curve).' });
      const pbI = argmin(P, vMin, zero + 1);
      add({ key: 'brk_pp', name: 'Peak braking power', group: 'Braking', level: 3, type: 'power', value: P[pbI],
        how: 'The most negative power during braking (force &times; a downward velocity): ' + N0(P[pbI]) + ' W at ' + fs3(T(pbI)) + ' s. Negative power means energy is being absorbed.' });
      // Propulsion
      const pt = (TO - zero) / fs;
      add({ key: 'prop_t', name: 'Propulsion duration', group: 'Propulsion', level: 2, type: 'time', value: pt,
        how: 'From zero velocity (the lowest point) to take-off: ' + fs3(T(TO)) + ' &minus; ' + fs3(T(zero)) + ' = ' + fs3(pt) + ' s.' });
      const pI = argmax(F, zero, TO);
      add({ key: 'prop_pf', name: 'Peak propulsive force', group: 'Propulsion', level: 2, type: 'force', value: F[pI],
        how: 'The biggest force during propulsion: ' + N0(F[pI]) + ' N at ' + fs3(T(pI)) + ' s.' });
      const mpf = mean(F, zero, TO);
      add({ key: 'prop_mf', name: 'Mean propulsive force', group: 'Propulsion', level: 2, type: 'force', value: mpf,
        how: 'The average of every force sample during propulsion = ' + N0(mpf) + ' N (' + N2(mpf / BW) + ' &times; bodyweight).' });
      const pImp = area(F, dt, zero, TO, meth, BW);
      add({ key: 'prop_imp', name: 'Propulsive impulse (net)', group: 'Propulsion', level: 2, type: 'imp', value: pImp,
        how: 'Area between the force curve and bodyweight from the lowest point to take-off = ' + N1(pImp) + ' N&middot;s. Starting from zero velocity, it equals m &times; take-off velocity = ' + N2(m) + ' &times; ' + N2(tov) + ' = ' + N1(m * tov) + ' N&middot;s, which is why net impulse decides jump height.' });
      const mpp = mean(P, zero, TO);
      add({ key: 'prop_mp', name: 'Mean propulsive power', group: 'Propulsion', level: 3, type: 'power', value: mpp,
        how: 'The average of force &times; velocity over propulsion = ' + N0(mpp) + ' W.' });
      const vMax = argmax(v, zero, TO + 1);
      add({ key: 'vpk', name: 'Peak velocity', group: 'Propulsion', level: 3, type: 'vel', value: v[vMax],
        how: 'The fastest upward centre of mass velocity: ' + N2(v[vMax]) + ' m/s at ' + fs3(T(vMax)) + ' s. It comes just before take-off, where force drops back below bodyweight.' });
      add({ key: 'push', name: 'Push-off distance', group: 'Propulsion', level: 3, type: 'disp', value: s[TO] - s[zero],
        how: 'How far the centre of mass rose while still on the ground: ' + fs3(s[TO]) + ' &minus; (' + fs3(s[zero]) + ') = ' + fs3(s[TO] - s[zero]) + ' m.' });
    }
  }

  if (jump === 'sj') {
    const pt = (TO - onset) / fs;
    const pI = argmax(F, onset, TO);
    const mpf = mean(F, onset, TO);
    add({ key: 'prop_mf', name: 'Mean propulsive force', group: 'Propulsion', level: 2, type: 'force', value: mpf,
      how: 'The average of every force sample from the start of the push to take-off = ' + N0(mpf) + ' N.' });
    const pImp = area(F, dt, onset, TO, meth, BW);
    add({ key: 'prop_imp', name: 'Propulsive impulse (net)', group: 'Propulsion', level: 2, type: 'imp', value: pImp,
      how: 'Area between the force curve and bodyweight from the start of the push to take-off = ' + N1(pImp) + ' N&middot;s = m &times; take-off velocity (' + N2(m) + ' &times; ' + N2(tov) + ' = ' + N1(m * tov) + ' N&middot;s).' });
    const mpp = mean(P, onset, TO);
    add({ key: 'prop_mp', name: 'Mean propulsive power', group: 'Propulsion', level: 3, type: 'power', value: mpp, how: 'The average of force &times; velocity over the push = ' + N0(mpp) + ' W.' });
    const vMax = argmax(v, onset, TO + 1);
    add({ key: 'vpk', name: 'Peak velocity', group: 'Propulsion', level: 3, type: 'vel', value: v[vMax], how: 'The fastest upward centre of mass velocity: ' + N2(v[vMax]) + ' m/s at ' + fs3(T(vMax)) + ' s.' });
    add({ key: 'push', name: 'Push-off distance', group: 'Propulsion', level: 3, type: 'disp', value: s[TO] - s[onset], how: 'How far the centre of mass rose from the squat to take-off = ' + fs3(s[TO]) + ' m.' });
    add({ key: 'tpf', name: 'Time to peak force', group: 'Propulsion', level: 2, type: 'time', value: (pI - onset) / fs, how: fs3(T(pI)) + ' &minus; ' + fs3(T(onset)) + ' = ' + fs3((pI - onset) / fs) + ' s from the start of the push.' });
    [50, 100, 200].forEach((ms) => {
      const j = onset + Math.round(ms / 1000 * fs);
      if (j < TO) add({ key: 'rfd' + ms, name: 'RFD 0&ndash;' + ms + ' ms', group: 'Propulsion', level: ms === 100 ? 2 : 3, type: 'rfd', value: (F[j] - F[onset]) / (ms / 1000),
        how: '(Force ' + ms + ' ms after the start &minus; force at the start) &divide; ' + (ms / 1000) + ' s = (' + N0(F[j]) + ' &minus; ' + N0(F[onset]) + ') &divide; ' + (ms / 1000) + ' = ' + N0((F[j] - F[onset]) / (ms / 1000)) + ' N/s.' });
    });
    add({ key: 'cm', name: 'Countermovement check (largest dip below bodyweight)', short: 'Dip below bodyweight', group: 'Propulsion', level: 2, type: 'force', value: R.cmCheck && R.cmCheck.drop > 0 ? R.cmCheck.drop : 0,
      how: R.cmCheck && R.cmCheck.drop > 0 ? 'Force dipped ' + N0(R.cmCheck.drop) + ' N below bodyweight just before the push, more than ' + set.onsetK + ' SD of the weighing. A true squat jump starts from a still squat, so this trial may include a small countermovement.' : 'Force did not dip clearly below bodyweight before the push, so there was no countermovement.' });
    void pt;
  }

  if (jump === 'dj') {
    const gct = (TO - TD) / fs;
    add({ key: 'gct', name: 'Ground contact time', group: 'Outcome', level: 1, type: 'time', value: gct, key1: true,
      how: 'Take-off &minus; touchdown = ' + fs3(T(TO)) + ' &minus; ' + fs3(T(TD)) + ' = ' + fs3(gct) + ' s.' });
    add({ key: 'rsi', name: 'RSI (reactive strength index)', short: 'RSI', group: 'Outcome', level: 1, type: 'rsi', value: jhF / gct, key1: true,
      how: 'Jump height from flight time &divide; contact time = ' + fs3(jhF) + ' m &divide; ' + fs3(gct) + ' s = ' + N2(jhF / gct) + ' (Flanagan &amp; Comyns, 2008).' });
    add({ key: 'rsi_tov', name: 'RSI (from take-off velocity)', group: 'Outcome', level: 3, type: 'rsi', value: jhT / gct,
      how: 'Jump height from take-off velocity &divide; contact time = ' + fs3(jhT) + ' &divide; ' + fs3(gct) + ' = ' + N2(jhT / gct) + '.' });
    add({ key: 'vtd', name: 'Touchdown velocity', group: 'Touchdown', level: 2, type: 'vel', value: R.vTD,
      how: R.integ.dir === 'backward' ? 'From backward integration: starting from the still standing after landing (velocity = 0) and working back through the landing, the flight and the contact to touchdown = ' + N2(R.vTD) + ' m/s.' + (R.vTDdrop ? ' From the box height it would be &minus;&radic;(2gh) = ' + N2(R.vTDdrop) + ' m/s.' : '') : 'From the box height: v = &minus;&radic;(2 g h) = &minus;&radic;(2 &times; 9.81 &times; ' + f(set.drop, 2) + ') = ' + N2(R.vTD) + ' m/s. This assumes the participant stepped off without jumping up or lowering themselves.' });
    add({ key: 'drop_eff', name: 'Effective drop height', group: 'Touchdown', level: 2, type: 'height', value: R.dropEff,
      how: 'The height the centre of mass actually fell: h = v&sup2; &divide; 2g = ' + N2(R.vTD) + '&sup2; &divide; 19.62 = ' + fs3(R.dropEff) + ' m.' + (set.drop > 0 ? ' The box was ' + f(set.drop, 2) + ' m. People often step down or hop off, so the real drop is rarely exactly the box height.' : '') });
    const low = R.lowI, hasL = low > 0;
    const impI = argmax(F, TD, hasL ? low + 1 : TO);
    add({ key: 'pif', name: 'Peak impact force', group: 'Braking', level: 2, type: 'force', value: F[impI],
      how: 'The biggest force during braking (touchdown to the lowest point): ' + N0(F[impI]) + ' N at ' + fs3(T(impI)) + ' s, ' + fs3((impI - TD) / fs) + ' s after touchdown.' });
    if (hasL) {
      const bt = (low - TD) / fs, pt = (TO - low) / fs;
      add({ key: 'brk_t', name: 'Braking duration', group: 'Braking', level: 2, type: 'time', value: bt, how: 'Touchdown to the lowest point (velocity = 0): ' + fs3(T(low)) + ' &minus; ' + fs3(T(TD)) + ' = ' + fs3(bt) + ' s.' });
      const bImp = area(F, dt, TD, low, meth, BW);
      add({ key: 'brk_imp', name: 'Braking impulse (net)', group: 'Braking', level: 2, type: 'imp', value: bImp,
        how: 'Area between force and bodyweight from touchdown to the lowest point = ' + N1(bImp) + ' N&middot;s = m &times; (0 &minus; touchdown velocity) = ' + N2(m) + ' &times; ' + N2(-R.vTD) + ' = ' + N1(-m * R.vTD) + ' N&middot;s.' });
      const mbf = mean(F, TD, low + 1);
      add({ key: 'brk_mf', name: 'Mean braking force', group: 'Braking', level: 3, type: 'force', value: mbf, how: 'The average force from touchdown to the lowest point = ' + N0(mbf) + ' N.' });
      const dep = -s[low];
      add({ key: 'depth', name: 'Centre of mass displacement (contact)', short: 'COM displacement', group: 'Braking', level: 2, type: 'disp', value: dep,
        how: 'How far the centre of mass dropped after touchdown: ' + N1(dep * 100) + ' cm (from integrating velocity).' });
      add({ key: 'kvert', name: 'Vertical stiffness', group: 'Braking', level: 3, type: 'stiff', value: F[impI] / dep,
        how: 'Peak force &divide; centre of mass displacement = ' + N0(F[impI]) + ' N &divide; ' + fs3(dep) + ' m = ' + f(F[impI] / dep / 1000, 1) + ' kN/m. Stiffer means less give for the same force.' });
      add({ key: 'prop_t', name: 'Propulsion duration', group: 'Propulsion', level: 2, type: 'time', value: pt, how: 'The lowest point to take-off: ' + fs3(T(TO)) + ' &minus; ' + fs3(T(low)) + ' = ' + fs3(pt) + ' s.' });
      const pI = argmax(F, low, TO);
      add({ key: 'prop_pf', name: 'Peak propulsive force', group: 'Propulsion', level: 2, type: 'force', value: F[pI], how: 'The biggest force from the lowest point to take-off: ' + N0(F[pI]) + ' N.' });
      const pImp = area(F, dt, low, TO, meth, BW);
      add({ key: 'prop_imp', name: 'Propulsive impulse (net)', group: 'Propulsion', level: 2, type: 'imp', value: pImp,
        how: 'Area between force and bodyweight from the lowest point to take-off = ' + N1(pImp) + ' N&middot;s = m &times; take-off velocity = ' + N1(m * tov) + ' N&middot;s.' });
      const mpf = mean(F, low, TO);
      add({ key: 'prop_mf', name: 'Mean propulsive force', group: 'Propulsion', level: 3, type: 'force', value: mpf, how: 'The average force from the lowest point to take-off = ' + N0(mpf) + ' N.' });
    }
  }

  // ---------- landing ----------
  if (LD >= 0) {
    const pl = R.peakLandI, le = R.landEndI;
    add({ key: 'plf', name: 'Peak landing force', group: 'Landing', level: 1, type: 'force', value: F[pl], key1: jump !== 'dj',
      how: 'The biggest force after landing' + (le > 0 ? ' (before the lowest point)' : '') + ': ' + N0(F[pl]) + ' N at ' + fs3(T(pl)) + ' s (' + N1(F[pl] / BW) + ' &times; bodyweight).' });
    add({ key: 'tplf', name: 'Time to peak landing force', group: 'Landing', level: 3, type: 'time', value: (pl - LD) / fs, how: fs3(T(pl)) + ' &minus; ' + fs3(T(LD)) + ' = ' + fs3((pl - LD) / fs) + ' s after landing. Shorter means a more sudden impact.' });
    add({ key: 'lrate', name: 'Average loading rate', group: 'Landing', level: 3, type: 'rfd', value: (F[pl] - F[LD]) / ((pl - LD) / fs),
      how: '(Peak landing force &minus; force at landing) &divide; time to peak = (' + N0(F[pl]) + ' &minus; ' + N0(F[LD]) + ') &divide; ' + fs3((pl - LD) / fs) + ' = ' + N0((F[pl] - F[LD]) / ((pl - LD) / fs)) + ' N/s.' });
    if (le > 0) {
      add({ key: 'land_t', name: 'Landing duration (to the lowest point)', short: 'Landing duration', group: 'Landing', level: 3, type: 'time', value: (le - LD) / fs, how: 'Landing to where the centre of mass stops moving down (velocity = 0): ' + fs3((le - LD) / fs) + ' s. Longer means a softer landing.' });
      add({ key: 'land_d', name: 'Landing depth', group: 'Landing', level: 3, type: 'disp', value: s[LD] - s[le], how: 'How far the centre of mass dropped after landing: ' + fs3(s[LD]) + ' &minus; (' + fs3(s[le]) + ') = ' + fs3(s[LD] - s[le]) + ' m.' });
    }
    add({ key: 'vland', name: 'Landing velocity', group: 'Landing', level: 3, type: 'vel', value: v[LD], how: 'Centre of mass velocity at landing = ' + N2(v[LD]) + ' m/s (compare with take-off velocity, ' + N2(tov) + ' m/s).' });
  }

  // ---------- left vs right ----------
  const L = R.plates.findIndex((p) => p.role === 'left'), Rt = R.plates.findIndex((p) => p.role === 'right');
  if (L >= 0 && Rt >= 0) {
    const fl = R.plates[L].fz, fr = R.plates[Rt].fz;
    const pairs = [];
    if (jump === 'cmj' && R.zeroI > 0) { pairs.push(['Braking impulse', R.vMinI, R.zeroI, 'imp']); pairs.push(['Propulsive impulse', R.zeroI, TO, 'imp']); pairs.push(['Peak force', onset, TO, 'pk']); }
    if (jump === 'sj') { pairs.push(['Propulsive impulse', onset, TO, 'imp']); pairs.push(['Peak force', onset, TO, 'pk']); }
    if (jump === 'dj' && R.lowI > 0) { pairs.push(['Braking impulse', TD, R.lowI, 'imp']); pairs.push(['Propulsive impulse', R.lowI, TO, 'imp']); pairs.push(['Peak force', TD, TO, 'pk']); }
    if (LD >= 0) pairs.push(['Peak landing force', LD, R.landEndI > 0 ? R.landEndI : Math.min(R.n, LD + Math.round(0.5 * fs)), 'pk']);
    pairs.forEach(([nm, a0, a1, kind]) => {
      let vl, vr;
      if (kind === 'imp') { vl = area(fl, dt, a0, a1, meth, BW / 2); vr = area(fr, dt, a0, a1, meth, BW / 2); }
      else { vl = fl[argmax(fl, a0, a1)]; vr = fr[argmax(fr, a0, a1)]; }
      const ai = asym(vl, vr);
      add({ key: 'asym_' + nm.replace(/\W+/g, '_').toLowerCase(), name: nm + ': left vs right', short: nm + ' asymmetry', group: 'Left vs right', level: 2, type: 'pct', value: ai, lr: [vl, vr, kind],
        how: 'Left ' + (kind === 'imp' ? N1(vl) + ' N&middot;s' : N0(vl) + ' N') + ', right ' + (kind === 'imp' ? N1(vr) + ' N&middot;s' : N0(vr) + ' N') + '. Asymmetry = (left &minus; right) &divide; the bigger &times; 100 = ' + N1(ai) + '% (' + (ai > 0 ? 'left' : 'right') + ' higher).' + (kind === 'imp' ? ' Each side&rsquo;s impulse is taken above half of bodyweight.' : '') });
    });
  }
  return out;
}

// Stiffness is shown in kN/m.
UNITS.stiff = { all: ['kN/m', 1000, 1] };
