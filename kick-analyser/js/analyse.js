// Reading BioWare files, filtering, finding stance and working out every result.
import { A, fx } from './state.js?v=1.1.0';

// ---------- reading ----------
export function parseFile(text, name) {
  const L = text.split(/\r?\n/); const meta = {}; let hi = -1;
  for (let i = 0; i < Math.min(L.length, 80); i++) {
    const p = L[i].split(/\t|,/);
    if (/^(abs time|time)/i.test(p[0].trim())) { hi = i; break; }
    if (p.length > 1) meta[p[0].replace(/:\s*$/, '').trim()] = p[1].trim();
  }
  if (hi < 0) throw new Error('no data header (a row starting "abs time" or "time") was found');
  const sep = L[hi].includes('\t') ? '\t' : ',';
  const cols = L[hi].split(sep).map((s) => s.trim());
  let st = hi + 1; if (L[st] && isNaN(parseFloat(L[st].split(sep)[0]))) st++;
  const D = cols.map(() => []);
  for (let i = st; i < L.length; i++) { const p = L[i].split(sep); if (isNaN(parseFloat(p[0]))) continue; for (let j = 0; j < cols.length; j++) D[j].push(parseFloat(p[j])); }
  const find = (n) => { const j = cols.findIndex((c) => c.toLowerCase() === n.toLowerCase()); return j < 0 ? null : Float64Array.from(D[j]); };
  const t = Float64Array.from(D[0]);
  if (t.length < 50) throw new Error('too few samples');
  let fs = parseFloat(meta['Rate (Hz)']); if (!(fs > 0)) fs = 1 / (t[1] - t[0]);
  const raw = { t, Fx: find('Fx'), Fy: find('Fy'), Fz: find('Fz'), Mx: find('Mx'), My: find('My'), Tz: find('Tz'), Ax: find('Ax'), Ay: find('Ay') };
  if (!raw.Fz) throw new Error('no Fz column');
  if (!raw.Ax || !raw.Ay) throw new Error('no centre of pressure columns (Ax and Ay). Tick them in the BioWare export');
  const bw = parseFloat(meta['Normalized force (N)']);
  const base = name.replace(/\.[^.]+$/, '').replace(/^demo-/, '');
  return { raw, fs, bwHdr: bw > 1.5 ? bw : null, base, cols };
}
export function guessLabels(base) {
  const nice = base.replace(/[_-]+/g, ' ').trim();
  const m = nice.match(/^(.*?)[\s]*(?:trial|t)?\s*(\d+)$/i);
  let kick = m ? m[1].trim() : nice, trial = m ? m[2] : '';
  const k = kick.toLowerCase().replace(/\s/g, '');
  if (k === 'instep') kick = 'Instep'; else if (k === 'laces') kick = 'Laces'; else if (k === 'curler') kick = 'Curler';
  else if (k === 'carlos' || k === 'outsideboot' || k === 'outside') kick = 'Outside boot';
  else kick = kick.charAt(0).toUpperCase() + kick.slice(1);
  return { athlete: '', kick, trial };
}

// ---------- filtering (as in Force Analysis) ----------
export function lowpass(x, fc, fs) {
  const n = x.length; if (n < 4 || !(fc > 0)) return Float64Array.from(x);
  const wc = Math.tan(Math.PI * Math.min(fc / 0.802, fs * 0.45) / fs), k1 = Math.SQRT2 * wc, k2 = wc * wc;
  const a0 = k2 / (1 + k1 + k2), a1 = 2 * a0, a2 = a0, k3 = 2 * a0 / k2, b1 = -2 * a0 + k3, b2 = 1 - 2 * a0 - k3;
  const p = Math.min(n - 1, Math.round(fs * 0.1)); const y = new Float64Array(n + 2 * p);
  for (let i = 0; i < p; i++) { y[i] = 2 * x[0] - x[p - i]; y[n + p + i] = 2 * x[n - 1] - x[n - 2 - i]; }
  for (let i = 0; i < n; i++) y[p + i] = x[i];
  const pass = (v) => { const o = new Float64Array(v.length); o[0] = v[0]; o[1] = v[1]; for (let i = 2; i < v.length; i++) o[i] = a0 * v[i] + a1 * v[i - 1] + a2 * v[i - 2] + b1 * o[i - 1] + b2 * o[i - 2]; return o; };
  let f = pass(y).reverse(); f = pass(f).reverse(); return f.slice(p, p + n);
}

// ---------- processing ----------
export function bodyweight(tr) {
  const S = A.set;
  if (S.bwMode === 'mass' && +S.mass > 0) return { bw: +S.mass * 9.81, from: 'the body mass typed in (' + (+S.mass).toFixed(1) + ' kg)' };
  if (tr.bwHdr) return { bw: tr.bwHdr, from: 'the body weight stored in the file' + (Math.abs(tr.bwHdr - 800) < 0.5 ? ' (this is BioWare’s default of 800 N, so it may not be the participant’s; type a body mass in Setup)' : '') };
  return { bw: 700, from: 'a guess of 700 N (no body weight in the file; type a body mass in Setup)' };
}
export function process(tr) {
  const S = A.set, { raw, fs } = tr, t = raw.t, n = t.length;
  const B = bodyweight(tr), bw = B.bw;
  const Fz = lowpass(raw.Fz, S.ffc, fs);
  const ix = (tm) => Math.max(0, Math.min(n - 1, Math.round((tm - t[0]) * fs)));
  // contacts above the threshold; stance = the one with the biggest force
  const segs = []; let a = -1;
  for (let i = 0; i < n; i++) { if (Fz[i] > S.thr) { if (a < 0) a = i; } else if (a >= 0) { segs.push([a, i - 1]); a = -1; } }
  if (a >= 0) segs.push([a, n - 1]);
  let im = 0; for (let i = 1; i < n; i++) if (Fz[i] > Fz[im]) im = i;
  const seg = segs.find((q) => q[0] <= im && q[1] >= im) || [0, n - 1];
  const s = tr.set.start != null ? ix(tr.set.start) : seg[0], e = tr.set.end != null ? ix(tr.set.end) : seg[1];
  const notes = [];
  const others = segs.filter((q) => q !== seg && q[1] - q[0] > 5).length;
  if (others) notes.push(others + ' other brief contact' + (others > 1 ? 's' : '') + ' on the plate (e.g. the kicking foot or a stumble) ignored.');
  // which horizontal force is front-back
  let apKey = S.ap === 'Fx' && raw.Fx ? 'Fx' : S.ap === 'Fy' && raw.Fy ? 'Fy' : null;
  if (!apKey) {
    if (raw.Fx && raw.Fy) { const m = s + Math.round((e - s) * 0.3); let ix2 = 0, iy = 0; for (let i = s; i <= m; i++) { ix2 += Math.abs(raw.Fx[i]); iy += Math.abs(raw.Fy[i]); } apKey = ix2 > iy ? 'Fx' : 'Fy'; }
    else apKey = raw.Fy ? 'Fy' : raw.Fx ? 'Fx' : null;
  }
  const mlKey = apKey === 'Fx' ? 'Fy' : 'Fx';
  const copAP = apKey === 'Fx' ? raw.Ax : raw.Ay, copML = apKey === 'Fx' ? raw.Ay : raw.Ax;
  // front-back force: braking (first quarter of stance) made negative
  let AP = null, sg = 1;
  if (apKey) {
    AP = lowpass(raw[apKey], S.ffc, fs);
    const m = Math.round(s + (e - s) * 0.25); let sm = 0; for (let i = s; i <= m; i++) sm += AP[i];
    sg = sm > 0 ? -1 : 1; for (let i = 0; i < n; i++) AP[i] *= sg;
  }
  // side to side: + = lateral when the standing foot and the plate's side are known
  const known = S.foot !== 'unk' && S.side !== 'unk';
  const mlS = known ? (S.foot === S.side ? 1 : -1) : 1;
  const mlName = known ? 'lateral (outside of the foot)' : 'plate +' + (apKey === 'Fx' ? 'y' : 'x');
  let ML = null;
  if (raw[mlKey]) { ML = lowpass(raw[mlKey], S.ffc, fs); for (let i = 0; i < n; i++) ML[i] *= mlS; }
  // centre of pressure: only while Fz is above the threshold, longest stretch inside stance
  const cthr = S.cthr / 100 * bw; let cs = -1, ce = -1, bs = -1, best = 0;
  for (let i = s; i <= e + 1; i++) { if (i <= e && Fz[i] > cthr) { if (bs < 0) bs = i; } else if (bs >= 0) { if (i - bs > best) { best = i - bs; cs = bs; ce = i - 1; } bs = -1; } }
  const nan = () => new Float64Array(n).fill(NaN);
  const cAP = nan(), cML = nan(), Tz = nan(), cR = nan(), cV = nan(); let apS = 1, org = [0, 0];
  if (cs >= 0 && ce - cs > 10) {
    const fa = lowpass(copAP.slice(cs, ce + 1), S.cfc, fs), fm = lowpass(copML.slice(cs, ce + 1), S.cfc, fs);
    apS = fa[fa.length - 1] - fa[0] >= 0 ? 1 : -1;
    org = S.orig === 'plant' ? [fa[0], fm[0]] : [0, 0];
    for (let i = 0; i < fa.length; i++) { cAP[cs + i] = (fa[i] - org[0]) * apS * 100; cML[cs + i] = (fm[i] - org[1]) * mlS * 100; }
    if (raw.Tz) { const ft = lowpass(raw.Tz.slice(cs, ce + 1), S.ffc, fs); for (let i = 0; i < ft.length; i++) Tz[cs + i] = ft[i]; }
    for (let i = cs; i <= ce; i++) {
      cR[i] = Math.hypot(cAP[i] - cAP[cs], cML[i] - cML[cs]);
      const a2 = Math.max(cs, i - 1), b2 = Math.min(ce, i + 1);
      cV[i] = b2 > a2 ? Math.hypot(cAP[b2] - cAP[a2], cML[b2] - cML[a2]) / ((b2 - a2) / fs) : NaN;
    }
  } else notes.push('No usable centre of pressure: force never stayed above ' + S.cthr + '% of body weight.');
  let b = null;
  if (tr.set.ball != null) { b = ix(tr.set.ball); if (b <= s || b >= e) { notes.push('Ball contact is outside stance, so it was ignored.'); b = null; } }
  if (bw && Math.abs(bw - 800) < 0.5) notes.push('Body weight is 800 N, BioWare’s default. Check it in Setup.');
  tr.p = { Fz, AP, ML, cAP, cML, cR, cV, Tz, s, e, cs, ce, b, bw, bwFrom: B.from, notes, sg, apKey, mlKey, apS, mlS, mlName, known, cthr };
  return tr.p;
}

// ---------- results ----------
const F = (u) => u === 'F'; const I = (u) => u === 'I';
export const VARS = [
  { g: 'Timing', k: 'stance', l: 'Stance time', u: 'ms', on: 1,
    def: 'How long the foot is in contact with the plate, from foot contact to toe-off.',
    ex: 'A laces kick with 347 ms of stance means the standing foot was down for about a third of a second. In a single-leg landing it is the time to stick and leave; in balance it is the trial length.' },
  { g: 'Timing', k: 'tball', l: 'Foot contact to ball contact', u: 'ms', on: 0,
    def: 'Time from the standing foot landing to the kicking foot striking the ball (or any other event you mark from video).',
    ex: '64 ms means the ball was struck very early in stance, while the standing leg was still braking hard.' },
  { g: 'Vertical force (Fz)', k: 'pkFz', l: 'Peak vertical force', u: 'F', on: 1,
    def: 'The largest vertical ground reaction force. Usually the impact as the foot lands and the body’s downward momentum is stopped.',
    ex: '1660 N for a 600 N player is 2.8 times body weight. Bigger values mean a harder plant; in landings they are often linked with higher loading.' },
  { g: 'Vertical force (Fz)', k: 'tpk', l: 'Time to peak vertical force', u: 'ms', on: 1,
    def: 'Time from foot contact to the peak vertical force.',
    ex: '21 ms is a very quick, stiff plant; 37 ms is a softer one.' },
  { g: 'Vertical force (Fz)', k: 'lr', l: 'Average loading rate', u: 'BW/s', on: 1,
    def: 'How quickly the leg is loaded: peak vertical force (in body weights) divided by the time it took to reach it.',
    ex: '2.8 BW reached in 0.021 s = 132 BW/s. Higher loading rates mean a sharper impact (e.g. a short, stiff plant or a landing with little knee bend).' },
  { g: 'Vertical force (Fz)', k: 'vImp', l: 'Vertical impulse', u: 'I', on: 0,
    def: 'Area under the vertical force over time (force × time). It is the total vertical push, and with body weight it sets the change in vertical velocity.',
    ex: 'A longer stance with the same forces gives a bigger impulse.' },
  { g: 'Front–back force', k: 'pkBrk', l: 'Peak braking force', u: 'F', on: 1,
    def: 'The largest backward horizontal force from the ground on the foot. The plant leg uses it to slow the body down.',
    ex: '459 N on an instep kick compared with 256 N on a laces kick: the instep plant stopped the run-up much harder.' },
  { g: 'Front–back force', k: 'pkProp', l: 'Peak propulsive force', u: 'F', on: 1,
    def: 'The largest forward horizontal force from the ground on the foot, pushing the body forwards.',
    ex: 'Usually small in a kick, but large when the standing leg pushes into the follow-through or in a cut or sprint step.' },
  { g: 'Front–back force', k: 'bImp', l: 'Braking impulse', u: 'I', on: 1,
    def: 'Area of the front–back force below zero. Braking impulse divided by body mass is how much forward speed the leg took away.',
    ex: '74 N·s for a 61 kg player = 1.2 m/s of forward speed removed by the standing leg.' },
  { g: 'Front–back force', k: 'pImp', l: 'Propulsive impulse', u: 'I', on: 1,
    def: 'Area of the front–back force above zero: the forward speed added by the leg (divide by body mass).',
    ex: '5 N·s for a 61 kg player adds about 0.08 m/s.' },
  { g: 'Front–back force', k: 'nImp', l: 'Net front–back impulse', u: 'I', on: 0,
    def: 'Propulsive minus braking impulse. Negative means the body left the plate going slower forwards than it arrived.',
    ex: '−31 N·s: the plant leg slowed the player overall, as expected in a kick or a stopping action.' },
  { g: 'Side-to-side force', k: 'pkMLp', l: 'Peak side-to-side force (+)', u: 'F', on: 0,
    def: 'Largest horizontal force across the foot in the + direction (lateral when the foot and plate direction are set in Setup). Needs Fx in the export.',
    ex: 'High values show the leg pushing or being pushed sideways (e.g. a cut or a kick taken from an angled run-up).' },
  { g: 'Side-to-side force', k: 'pkMLn', l: 'Peak side-to-side force (−)', u: 'F', on: 0,
    def: 'Largest horizontal force across the foot in the − direction, as a positive number.', ex: '' },
  { g: 'Centre of pressure', k: 'apEx', l: 'COP front–back excursion', u: 'cm', on: 1,
    def: 'How far the centre of pressure travelled from its most backward to its most forward point. In a step or a kick this is mostly the roll from heel to forefoot.',
    ex: '27 cm on a boot about 28 cm long means the player rolled right through onto the toes. Under 10 cm means they stayed on the heel or midfoot.' },
  { g: 'Centre of pressure', k: 'mlEx', l: 'COP side-to-side excursion', u: 'cm', on: 1,
    def: 'How far the centre of pressure travelled from one side of the foot to the other (most − to most +).',
    ex: '3 cm on an instep kick (pressure stayed central) against 14 cm on an outside-of-the-boot kick (pressure swept across the foot).' },
  { g: 'Centre of pressure', k: 'path', l: 'COP path length', u: 'cm', on: 1,
    def: 'The total distance the centre of pressure travelled, adding up every small movement. Longer paths mean the pressure moved around more under the foot.',
    ex: 'In single-leg balance it is the classic measure of sway: a longer path in the same time means more correction.' },
  { g: 'Centre of pressure', k: 'spd', l: 'Mean COP speed', u: 'cm/s', on: 1,
    def: 'Path length divided by time: how fast, on average, the pressure moved under the foot. The most common COP measure in balance research.',
    ex: '88 cm/s on a short laces stance against 50 cm/s on the instep: the laces kick rolled through the foot quicker.' },
  { g: 'Centre of pressure', k: 'apSpd', l: 'Mean COP front–back speed', u: 'cm/s', on: 0,
    def: 'Distance the centre of pressure travelled front–back only, divided by time.', ex: 'Shows how quickly the foot rolls from heel to toe.' },
  { g: 'Centre of pressure', k: 'mlSpd', l: 'Mean COP side-to-side speed', u: 'cm/s', on: 0,
    def: 'Distance the centre of pressure travelled side to side only, divided by time.', ex: 'In balance, side-to-side speed is often what changes most with fatigue or injury.' },
  { g: 'Centre of pressure', k: 'pkSpd', l: 'Peak COP speed', u: 'cm/s', on: 0,
    def: 'The fastest the centre of pressure moved at any instant (after filtering).',
    ex: 'Usually just after foot contact as the load shifts quickly from heel to midfoot.' },
  { g: 'Centre of pressure', k: 'mAP', l: 'Mean COP front–back position', u: 'cm', on: 0,
    def: 'Average front–back position of the centre of pressure, from where it started (foot contact = 0, + = towards the toes).',
    ex: '8 cm means most of the contact was spent around the heel and midfoot; 18 cm means the player spent longer on the forefoot.' },
  { g: 'Centre of pressure', k: 'mML', l: 'Mean COP side-to-side position', u: 'cm', on: 0,
    def: 'Average side-to-side position of the centre of pressure from where it started (+ = lateral when set in Setup).',
    ex: '−5 cm: the pressure sat towards the inside of the foot for most of the contact.' },
  { g: 'Centre of pressure', k: 'sdAP', l: 'COP front–back variability (SD)', u: 'cm', on: 0,
    def: 'Standard deviation of the front–back COP position: how spread out the pressure was front to back.',
    ex: 'Common in balance testing; less meaningful in a kick, where the roll forward dominates.' },
  { g: 'Centre of pressure', k: 'sdML', l: 'COP side-to-side variability (SD)', u: 'cm', on: 0,
    def: 'Standard deviation of the side-to-side COP position.',
    ex: 'In single-leg balance, a bigger SD means more side-to-side wobble.' },
  { g: 'Centre of pressure', k: 'ell', l: 'COP 95% ellipse area', u: 'cm²', on: 0,
    def: 'Area of the ellipse that would contain 95% of the COP points. It sums up how much of the foot the pressure covered, in both directions at once.',
    ex: 'A standard balance measure: 5 cm² is very steady single-leg standing; much larger values mean more sway. In a kick it reflects how much the pressure wandered as well as rolled.' },
  { g: 'Centre of pressure', k: 'ang', l: 'COP direction', u: '°', on: 0,
    def: 'Angle of the straight line from the first to the last COP point, measured from straight ahead (0° = straight heel to toe, + = towards the + side).',
    ex: '+25° with + set to lateral: the pressure rolled out towards the little toe, as on an outside-of-the-boot kick.' },
  { g: 'Centre of pressure', k: 'apEnd', l: 'COP front–back at the end', u: 'cm', on: 0,
    def: 'Where the centre of pressure was, front–back, at the end of the analysis window (toe-off or ball contact), relative to where it started.', ex: '' },
  { g: 'Centre of pressure', k: 'mlEnd', l: 'COP side-to-side at the end', u: 'cm', on: 0,
    def: 'Where the centre of pressure was, side to side, at the end of the analysis window, relative to where it started.', ex: '' },
  { g: 'Centre of pressure', k: 'apBall', l: 'COP front–back at ball contact', u: 'cm', on: 0,
    def: 'Front–back COP at the marked event (ball contact), relative to where it started.', ex: '9 cm: still on the heel and midfoot when the ball was struck.' },
  { g: 'Centre of pressure', k: 'mlBall', l: 'COP side-to-side at ball contact', u: 'cm', on: 0,
    def: 'Side-to-side COP at the marked event (ball contact), relative to where it started.', ex: '' },
  { g: 'Free moment (Tz)', k: 'tz', l: 'Peak free moment', u: 'N·m', on: 0,
    def: 'The largest twisting torque between the foot and the ground about a vertical axis through the centre of pressure. It is the friction that stops the foot spinning on the spot, so it shows how much the body is turning (or trying to turn) over the planted foot.',
    ex: 'The demo kicks peak at around 8 to 10 N·m as the hips and trunk turn over the standing foot. Bigger values mean more twisting between foot and ground (e.g. in cutting and pivoting), which loads the ankle and knee in rotation.' }
];
export const unitOf = (v) => (F(v.u) ? (A.units === 'BW' ? 'BW' : 'N') : I(v.u) ? (A.units === 'BW' ? 'BW·s' : 'N·s') : v.u);
export function valOf(v, r, tr) { let x = r[v.k]; if (x === null || x === undefined) return NaN; if (A.units === 'BW' && (F(v.u) || I(v.u))) x /= tr.p.bw; return x; }

export function results(tr) {
  const P = tr.p, fs = tr.fs, dt = 1 / fs, bw = P.bw, s = P.s;
  const useBall = A.set.win === 'ball' && P.b != null;
  const e = useBall ? P.b : P.e;
  const r = { win: useBall ? 'ball' : 'stance', how: {} }, H = r.how, ms = (i) => (i - s) / fs * 1000;
  r.stance = (P.e - P.s) / fs * 1000;
  H.stance = 'Toe-off (' + tr.raw.t[P.e].toFixed(3) + ' s) − foot contact (' + tr.raw.t[P.s].toFixed(3) + ' s), where vertical force crosses ' + A.set.thr + ' N.';
  if (P.b != null) { r.tball = ms(P.b); H.tball = 'Ball contact (marked from video) − foot contact.'; }
  let pk = s; for (let i = s; i <= e; i++) if (P.Fz[i] > P.Fz[pk]) pk = i;
  r.pkFz = P.Fz[pk]; r.tpk = ms(pk); r.lr = r.tpk > 0 ? (P.Fz[pk] / bw) / (r.tpk / 1000) : NaN;
  H.pkFz = 'The largest vertical force in the window: ' + fx(P.Fz[pk], 0) + ' N = ' + fx(P.Fz[pk] / bw, 2) + ' × body weight (' + fx(bw, 0) + ' N).';
  H.tpk = 'Time from foot contact to peak vertical force.';
  H.lr = 'Peak force in body weights ÷ time to peak = ' + fx(P.Fz[pk] / bw, 2) + ' BW ÷ ' + fx(r.tpk / 1000, 3) + ' s. How quickly the standing leg is loaded as it plants.';
  let imp = 0; for (let i = s; i < e; i++) imp += (P.Fz[i] + P.Fz[i + 1]) / 2 * dt; r.vImp = imp;
  H.vImp = 'Area under the vertical force (trapezoid rule) from foot contact to ' + (useBall ? 'ball contact' : 'toe-off') + '.';
  if (P.AP) {
    let mn = 0, mx = 0, bi = 0, pi = 0;
    for (let i = s; i <= e; i++) { mn = Math.min(mn, P.AP[i]); mx = Math.max(mx, P.AP[i]); }
    for (let i = s; i < e; i++) { const v = (P.AP[i] + P.AP[i + 1]) / 2 * dt; if (v < 0) bi += v; else pi += v; }
    r.pkBrk = -mn; r.pkProp = mx; r.bImp = -bi; r.pImp = pi; r.nImp = bi + pi;
    H.pkBrk = 'The most negative front–back force (' + P.apKey + '), given as a positive number. Braking is the standing leg slowing the run-up.';
    H.pkProp = 'The most positive front–back force (' + P.apKey + '), pushing the body forwards.';
    H.bImp = 'Area of the front–back force below zero. The bigger it is, the more forward momentum the standing leg takes away.';
    H.pImp = 'Area of the front–back force above zero.';
    H.nImp = 'Propulsive impulse − braking impulse. Negative means the body was slowed overall.';
  }
  if (P.ML) {
    let mn = 0, mx = 0; for (let i = s; i <= e; i++) { mn = Math.min(mn, P.ML[i]); mx = Math.max(mx, P.ML[i]); }
    r.pkMLp = mx; r.pkMLn = -mn;
    H.pkMLp = 'Largest side-to-side force (' + P.mlKey + ') towards ' + P.mlName + '.'; H.pkMLn = 'Largest side-to-side force the other way, given as a positive number.';
  }
  const a = Math.max(s, P.cs), z = Math.min(e, P.ce);
  if (P.cs >= 0 && z - a > 5) {
    let amn = 1e9, amx = -1e9, mmn = 1e9, mmx = -1e9, pl = 0, pa = 0, pm = 0, tz = 0, sa = 0, sm = 0, pv = 0;
    for (let i = a; i <= z; i++) {
      const Ap = P.cAP[i], M = P.cML[i];
      amn = Math.min(amn, Ap); amx = Math.max(amx, Ap); mmn = Math.min(mmn, M); mmx = Math.max(mmx, M); sa += Ap; sm += M;
      if (i > a) { const dA = Ap - P.cAP[i - 1], dM = M - P.cML[i - 1]; pl += Math.hypot(dA, dM); pa += Math.abs(dA); pm += Math.abs(dM); }
      if (Math.abs(P.Tz[i]) > Math.abs(tz)) tz = P.Tz[i];
      if (P.cV[i] > pv) pv = P.cV[i];
    }
    const d = (z - a) / fs, n = z - a + 1, ma = sa / n, mm = sm / n;
    let vaa = 0, vmm = 0, vam = 0; for (let i = a; i <= z; i++) { const x = P.cAP[i] - ma, y = P.cML[i] - mm; vaa += x * x; vmm += y * y; vam += x * y; }
    vaa /= n - 1; vmm /= n - 1; vam /= n - 1;
    r.apEx = amx - amn; r.mlEx = mmx - mmn; r.path = pl; r.spd = pl / d; r.apSpd = pa / d; r.mlSpd = pm / d; r.tz = Math.abs(tz); r.pkSpd = pv;
    r.mAP = ma; r.mML = mm; r.sdAP = Math.sqrt(vaa); r.sdML = Math.sqrt(vmm);
    r.ell = Math.PI * 5.991 * Math.sqrt(Math.max(0, vaa * vmm - vam * vam));
    r.apEnd = P.cAP[z]; r.mlEnd = P.cML[z];
    r.ang = Math.atan2(P.cML[z] - P.cML[a], P.cAP[z] - P.cAP[a]) * 180 / Math.PI;
    const win = 'between ' + fx(ms(a), 0) + ' and ' + fx(ms(z), 0) + ' ms after foot contact (while vertical force is above ' + A.set.cthr + '% of body weight)';
    H.apEx = 'Furthest forward − furthest back COP ' + win + ': ' + fx(amx, 1) + ' − ' + fx(amn, 1) + ' cm.';
    H.mlEx = 'Furthest − least side-to-side COP ' + win + ': ' + fx(mmx, 1) + ' − (' + fx(mmn, 1) + ') cm.';
    H.path = 'The distance COP travels, adding up the straight line between every pair of samples: Σ√(ΔAP² + ΔML²), ' + win + '.';
    H.spd = 'Path length ÷ time = ' + fx(pl, 1) + ' cm ÷ ' + fx(d, 3) + ' s.';
    H.apSpd = 'Front–back distance travelled (Σ|ΔAP|) ÷ time = ' + fx(pa, 1) + ' cm ÷ ' + fx(d, 3) + ' s.';
    H.mlSpd = 'Side-to-side distance travelled (Σ|ΔML|) ÷ time = ' + fx(pm, 1) + ' cm ÷ ' + fx(d, 3) + ' s.';
    H.pkSpd = 'The largest instantaneous COP speed (central difference of the filtered COP, √(vAP² + vML²)).';
    H.mAP = 'Average of the ' + n + ' front–back COP samples ' + win + '.'; H.mML = 'Average of the ' + n + ' side-to-side COP samples ' + win + '.';
    H.sdAP = 'Standard deviation of the front–back COP samples (n − 1).'; H.sdML = 'Standard deviation of the side-to-side COP samples (n − 1).';
    H.ell = '95% prediction ellipse: π × 5.991 × √(var(AP) × var(ML) − cov(AP, ML)²) = π × 5.991 × √(' + fx(vaa, 2) + ' × ' + fx(vmm, 2) + ' − ' + fx(vam, 2) + '²). 5.991 is the 95% value of the chi-squared distribution with 2 degrees of freedom.';
    H.ang = 'atan2(side-to-side change, front–back change) from the first to the last valid point = atan2(' + fx(P.cML[z] - P.cML[a], 1) + ', ' + fx(P.cAP[z] - P.cAP[a], 1) + ').';
    H.apEnd = 'Front–back COP at ' + fx(ms(z), 0) + ' ms, the last valid point in the window.'; H.mlEnd = 'Side-to-side COP at ' + fx(ms(z), 0) + ' ms, the last valid point in the window.';
    H.tz = 'Largest twisting torque about the vertical axis under the foot (Tz), either direction, while COP is valid. Tz is calculated by BioWare about the centre of pressure.';
    if (P.b != null && P.b >= P.cs && P.b <= P.ce) { r.apBall = P.cAP[P.b]; r.mlBall = P.cML[P.b]; H.apBall = 'COP at the ball contact sample, relative to where it started.'; H.mlBall = H.apBall; }
  }
  return r;
}

// signals for plotting (stance only)
export const SIG = {
  Fz: { l: 'Vertical force', short: 'Fz', f: true }, AP: { l: 'Front–back force', short: 'Fy', f: true }, ML: { l: 'Side-to-side force', short: 'Fx', f: true },
  cAP: { l: 'COP front–back', short: 'COP AP', f: false }, cML: { l: 'COP side to side', short: 'COP ML', f: false },
  cR: { l: 'COP distance from start', short: 'COP distance', f: false }, cV: { l: 'COP speed', short: 'COP speed', f: false },
  Tz: { l: 'Free moment', short: 'Tz', f: false }
};
export function sigUnit(k) { return SIG[k].f ? (A.units === 'BW' ? 'BW' : 'N') : k === 'Tz' ? 'N·m' : k === 'cV' ? 'cm/s' : 'cm'; }
export function sigLabel(k, tr) {
  const P = tr ? tr.p : null;
  if (k === 'cAP') return 'COP front–back (cm, + = towards toes)';
  if (k === 'cML') return 'COP side to side (cm, + = ' + (P ? (P.known ? 'lateral' : P.mlName) : 'plate +x') + ')';
  if (k === 'AP') return 'Front–back force (' + sigUnit(k) + ', − = braking)';
  return SIG[k].l + ' (' + sigUnit(k) + ')';
}
export function signal(tr, k, from, to) {
  const P = tr.p, arr = P[k]; if (!arr) return null;
  const sc = SIG[k].f && A.units === 'BW' ? 1 / P.bw : 1;
  const a = from === undefined ? P.s : from, b = to === undefined ? P.e : to;
  const o = new Float64Array(b - a + 1); for (let i = a; i <= b; i++) o[i - a] = arr[i] * sc; return o;
}
