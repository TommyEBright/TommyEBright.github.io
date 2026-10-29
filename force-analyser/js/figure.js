// The little jumper beside the force-time curve. Its centre of mass (hip) moves with the integrated displacement,
// so students can link each part of the curve to the movement. Arrows show velocity and net force.
import { A, COL } from './state.js?v=1.0.0';
import { phaseAt } from './analyse.js?v=1.0.0';

const SEG = { ankle: 0.08, shank: 0.43, thigh: 0.44, trunk: 0.5, neck: 0.05, head: 0.1, upper: 0.29, fore: 0.27 };
const H0 = SEG.ankle + SEG.shank + SEG.thigh; // standing hip height (m)

function arrow(ctx, x, y, dy, col, w) {
  if (Math.abs(dy) < 3) return;
  ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = w || 3; ctx.lineCap = 'round';
  const s = Math.sign(dy), len = Math.abs(dy);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + s * Math.max(0, len - 7)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y + dy); ctx.lineTo(x - 6, y + dy - s * 9); ctx.lineTo(x + 6, y + dy - s * 9); ctx.closePath(); ctx.fill();
  ctx.restore();
}

export function drawFigure(ctx, w, h, i) {
  const R = A.R; if (!R || !R.ok) return;
  if (i < 0) i = R.jump === 'dj' ? 0 : (R.w ? R.w.s : 0);
  // a squat jump starts from a squat: shift so that take-off is a little above standing height (on the toes)
  const off = R.jump === 'sj' ? R.s[R.TO] - 0.08 : 0;
  const s = R.s[i] - off, v = R.v[i], F = R.F[i];
  const p = phaseAt(R, i);
  const air = (p && (p.key === 'flight' || p.key === 'drop')) || (R.jump === 'dj' && i < R.TD) || F < A.S.set.thr;
  // scale: fit from -0.6 m (deep squat) to standing hip + highest point + head
  const top = Math.max(0.55, (R.jump === 'dj' ? Math.max(R.dropEff || 0, 0) : 0) + 0.5, (R.v[R.TO] > 0 ? R.v[R.TO] ** 2 / 19.62 : 0) + 0.2);
  const ground = h - 26;
  const k = Math.min((ground - 14) / (H0 + SEG.trunk + SEG.neck + 2 * SEG.head + top), w / 1.25);
  const plateX = w * 0.55;
  let x = plateX;
  // box for a drop jump
  const boxX = w * 0.2, boxH = R.jump === 'dj' && R.dropEff > 0 ? R.dropEff : 0;
  ctx.save();
  // floor and plate
  ctx.fillStyle = '#cbd5e1'; ctx.fillRect(0, ground, w, h - ground);
  ctx.fillStyle = '#334155'; ctx.fillRect(plateX - 34, ground - 6, 68, 6);
  ctx.fillStyle = '#64748b'; ctx.font = '10px system-ui, Arial'; ctx.textAlign = 'center'; ctx.fillText('force plate', plateX, ground + 15);
  if (boxH > 0) {
    ctx.fillStyle = '#94a3b8'; ctx.fillRect(boxX - 26, ground - boxH * k, 52, boxH * k);
    ctx.fillStyle = '#475569'; ctx.fillText('box', boxX, ground - boxH * k / 2 + 3);
    // where is the jumper horizontally? on the box before stepping off, moving across while falling
    if (i < R.TD) { const so = R.stepOff >= 0 ? R.stepOff : R.TD; const f = i <= so ? 0 : (i - so) / Math.max(1, R.TD - so); x = boxX + (plateX - boxX) * Math.min(1, f); }
  }
  // body positions (metres, y up)
  let feetY, hipY = H0 + s, ankleY, kneeFwd = 0, heel = 0;
  if (air) { feetY = Math.max(0, s); ankleY = feetY + SEG.ankle; hipY = H0 + s; if (R.jump === 'dj' && i < R.TD) { feetY = s; ankleY = s + SEG.ankle; } }
  else {
    feetY = 0;
    if (s >= 0) { heel = Math.min(s, 0.12); ankleY = SEG.ankle + heel; hipY = H0 + s; }
    else { ankleY = SEG.ankle; }
  }
  const legLen = SEG.shank + SEG.thigh;
  const d = Math.max(0.2, Math.min(legLen, hipY - ankleY));
  // knee from two-link inverse kinematics, knee forwards
  const cosA = (SEG.shank ** 2 + d ** 2 - SEG.thigh ** 2) / (2 * SEG.shank * d);
  const ang = Math.acos(Math.max(-1, Math.min(1, cosA)));
  kneeFwd = SEG.shank * Math.sin(ang);
  const kneeY = ankleY + SEG.shank * Math.cos(ang);
  const flex = Math.max(0, 1 - d / legLen); // 0 straight .. ~0.5 deep
  const hipX = -kneeFwd * 0.15 - flex * 0.25; // hips move back as you squat
  const lean = Math.min(0.75, flex * 2.4); // trunk lean (rad)
  const shY = hipY + SEG.trunk * Math.cos(lean), shX = hipX + SEG.trunk * Math.sin(lean);
    const X = (mx) => x + mx * k * 1.0, Y = (my) => ground - my * k;
  // arms: hang down and swing back during the dip, forwards/up in propulsion and flight
  let armA = 0.25; // rad from vertical down, + forwards
  if (p && p.key === 'unweight') armA = -0.9 * Math.min(1, flex * 3);
  else if (p && p.key === 'brake') armA = -1.1;
  else if (p && p.key === 'prop') armA = -1.1 + 3.4 * Math.max(0, Math.min(1, (i - p.s) / Math.max(1, p.e - p.s)));
  else if (p && p.key === 'flight') armA = 2.3 - 1.6 * Math.max(0, Math.min(1, (i - p.s) / Math.max(1, p.e - p.s)));
  if (R.jump === 'sj' || R.jump === 'dj') armA = 0.2 + (p && p.key === 'prop' ? 0.5 : 0);
  const elX = shX + SEG.upper * Math.sin(armA), elY = shY - SEG.upper * Math.cos(armA);
  const haX = elX + SEG.fore * Math.sin(armA + 0.4), haY = elY - SEG.fore * Math.cos(armA + 0.4);
  // draw
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const limb = (pts, col, wd) => { ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.beginPath(); pts.forEach(([a, b], j) => (j ? ctx.lineTo(X(a), Y(b)) : ctx.moveTo(X(a), Y(b)))); ctx.stroke(); };
  // foot
  const toeX = 0.13, toeY = feetY;
  const lw = Math.max(4, k * 0.075);
  // far arm first (lighter), then legs, trunk, near arm
  limb([[shX, shY], [elX - 0.03, elY], [haX - 0.03, haY]], '#64748b', lw * 0.75);
  limb([[-0.04, ankleY], [toeX, toeY]], '#1f2a33', lw * 0.7);
  limb([[0, ankleY], [kneeFwd, kneeY], [hipX, hipY]], '#1f2a33', lw * 1.15);
  limb([[hipX, hipY], [shX, shY]], '#1f2a33', lw * 1.6);
  limb([[shX, shY], [elX, elY], [haX, haY]], '#334155', lw * 0.75);
  ctx.fillStyle = '#1f2a33'; ctx.beginPath(); ctx.arc(X(shX + (SEG.neck + SEG.head) * Math.sin(lean * 0.8)), Y(shY + SEG.neck + SEG.head * 0.9), SEG.head * k, 0, Math.PI * 2); ctx.fill();
  // centre of mass marker
  const cx = X(hipX + 0.02), cy = Y(hipY + 0.06);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1f2a33'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#1f2a33'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 6, -Math.PI / 2, 0); ctx.lineTo(cx, cy); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 6, Math.PI / 2, Math.PI); ctx.lineTo(cx, cy); ctx.fill();
  // arrows: velocity (purple) and net force (red)
  arrow(ctx, cx + 24, cy, -v * 26, COL.vel, 3.5);
  const net = (F - R.BW) / R.BW; // in bodyweights
  arrow(ctx, cx - 24, cy, -net * 34, COL.acc, 3.5);
  // displacement read-out
  ctx.fillStyle = '#334155'; ctx.font = '600 11px system-ui, Arial'; ctx.textAlign = 'left';
  ctx.fillText('COM ' + (s >= 0 ? '+' : '') + (s * 100).toFixed(1) + ' cm', 6, 14);
  ctx.restore();
}
