// Projectile Motion: the maths. Everything in SI units (m, s, m/s). y is up, x is the direction of travel.
export const G = 9.81;
export const rad = (d) => d * Math.PI / 180;
export const deg = (r) => r * 180 / Math.PI;

// ---------- least squares ----------
// Fit y = c0 + c1*t + c2*t^2 ... (degree k) by least squares. Returns the coefficients, their standard errors,
// the residuals and the RMS residual. Standard errors come from s^2 (X'X)^-1, with s^2 = SSR / (n - p).
export function polyfit(t, y, k) {
  const n = t.length, p = k + 1;
  if (n < p + 1) return null;
  const A = Array.from({ length: p }, () => new Float64Array(p)), b = new Float64Array(p);
  for (let i = 0; i < n; i++) {
    const row = []; for (let j = 0; j < p; j++) row.push(Math.pow(t[i], j));
    for (let r = 0; r < p; r++) { b[r] += row[r] * y[i]; for (let c = 0; c < p; c++) A[r][c] += row[r] * row[c]; }
  }
  const inv = invert(A); if (!inv) return null;
  const c = new Float64Array(p); for (let r = 0; r < p; r++) for (let j = 0; j < p; j++) c[r] += inv[r][j] * b[j];
  const res = new Float64Array(n); let ssr = 0;
  for (let i = 0; i < n; i++) { let f = 0; for (let j = 0; j < p; j++) f += c[j] * Math.pow(t[i], j); res[i] = y[i] - f; ssr += res[i] * res[i]; }
  const s2 = ssr / (n - p), se = new Float64Array(p); for (let j = 0; j < p; j++) se[j] = Math.sqrt(Math.max(0, s2 * inv[j][j]));
  return { c, se, res, rms: Math.sqrt(ssr / n), n, s: Math.sqrt(s2), ivd: inv.map((r, j) => r[j]) };
}
function invert(M) {
  const n = M.length, A = M.map((r, i) => { const o = new Float64Array(2 * n); o.set(r); o[n + i] = 1; return o; });
  for (let c = 0; c < n; c++) {
    let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-14) return null;
    [A[c], A[piv]] = [A[piv], A[c]];
    const d = A[c][c]; for (let j = 0; j < 2 * n; j++) A[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; if (f) for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j]; }
  }
  return A.map((r) => Array.from(r.slice(n)));
}

// The flight fit. t is measured from release (t = 0 at the release frame). Three frames are enough when g is fixed
// (two unknowns each way); the gravity check (g free) needs at least five. minS is the smallest believable position
// error (e.g. the clicking precision): with very few frames the residuals alone can make the error look tiny.
//   horizontal:      x = x0 + vx*t                      (straight line: no horizontal force)
//   vertical, free:  y = y0 + vy*t + c2*t^2, g = -2*c2   (lets the data say what gravity is: the check)
//   vertical, fixed: y + g*t^2/2 = y0 + vy*t            (g known, so only two unknowns: more precise)
export function fitFlight(t, x, y, minS = 0) {
  const fx = polyfit(t, x, 1), fy = t.length >= 5 ? polyfit(t, y, 2) : null;
  const yc = y.map((v, i) => v + 0.5 * G * t[i] * t[i]), fyg = polyfit(t, yc, 1);
  if (!fx || !fyg) return null;
  const sf = (f, j) => Math.sqrt(Math.max(f.s * f.s, minS * minS) * f.ivd[j]);
  const resY = fyg.res; // residuals of the fixed-g fit are the same in y
  return {
    x0: fx.c[0], vx: fx.c[1], sevx: sf(fx, 1), resX: fx.res, rmsX: fx.rms,
    y0: fyg.c[0], vy: fyg.c[1], sevy: sf(fyg, 1), sey0: sf(fyg, 0), resY, rmsY: fyg.rms,
    gFree: fy ? -2 * fy.c[2] : NaN, seg: fy ? 2 * fy.se[2] : NaN, vyFree: fy ? fy.c[1] : fyg.c[1], y0Free: fy ? fy.c[0] : fyg.c[0], rmsYFree: fy ? fy.rms : fyg.rms, n: t.length,
  };
}
// Release speed and angle with their standard errors (first-order error propagation).
export function polar(vx, vy, sx, sy) {
  const v = Math.hypot(vx, vy), th = Math.atan2(vy, vx);
  const sv = v ? Math.sqrt((vx * sx) ** 2 + (vy * sy) ** 2) / v : 0;
  const sth = v ? Math.sqrt((vx * sy) ** 2 + (vy * sx) ** 2) / (v * v) : 0;
  return { v, th: deg(th), sv, sth: deg(sth) };
}

// ---------- the projectile ----------
export const pos = (P, t) => [P.x0 + P.vx * t, P.y0 + P.vy * t - 0.5 * G * t * t];
// Time when the projectile is at height h. down = true: on the way down (the later root).
export function tAtHeight(P, h, down = true) {
  const d = P.vy * P.vy + 2 * G * (P.y0 - h); if (d < 0) return NaN;
  const r = Math.sqrt(d); return down ? (P.vy + r) / G : (P.vy - r) / G;
}
export const tPeak = (P) => P.vy / G;
export const peakRise = (P) => (P.vy > 0 ? P.vy * P.vy / (2 * G) : 0);
export function fromPolar(v, thDeg, h, x0 = 0) { const a = rad(thDeg); return { x0, y0: h, vx: v * Math.cos(a), vy: v * Math.sin(a) }; }
// Horizontal distance travelled before landing at height hl.
export function range(P, hl) { const t = tAtHeight(P, hl, true); return Number.isFinite(t) ? P.vx * t : NaN; }
// Angle that gives the greatest range for speed v, released h metres above the landing height
// (h > 0: lower than 45 degrees). sin(theta) = v / sqrt(2v^2 + 2gh).
export function optimumAngle(v, h) { const s = v / Math.sqrt(2 * v * v + 2 * G * h); return deg(Math.asin(Math.min(1, s))); }
// Lowest release speed that reaches a target dx ahead and dy above the release point, and the angle that needs it:
// tan(theta) = (dy + sqrt(dx^2 + dy^2)) / dx, v^2 = g (dy + sqrt(dx^2 + dy^2)).
export function minSpeedToTarget(dx, dy) { const L = Math.hypot(dx, dy); return { v: Math.sqrt(G * (dy + L)), th: deg(Math.atan((dy + L) / dx)) }; }
// Speed needed at a given angle to pass through a target dx ahead, dy above.
export function speedForTarget(dx, dy, thDeg) { const a = rad(thDeg), den = 2 * Math.cos(a) ** 2 * (dx * Math.tan(a) - dy); return den > 0 ? Math.sqrt(G * dx * dx / den) : NaN; }

// ---------- demo data ----------
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
// Cubic Hermite between two positions with given velocities over time T (used for the hand or body before release
// and after landing, where the motion is NOT a projectile).
function herm(p0, m0, p1, m1, T, s) {
  const h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2, h11 = s ** 3 - s ** 2;
  return [0, 1].map((i) => h00 * p0[i] + h10 * T * m0[i] + h01 * p1[i] + h11 * T * m1[i]);
}
function series(o) {
  const r = rng(o.seed), dt = 1 / o.fps, t = [], x = [], y = [];
  const P = fromPolar(o.v, o.th, o.h, o.x0);
  const add = (p) => { t.push(t.length * dt); x.push(p[0] + gauss(r) * o.noise); y.push(p[1] + gauss(r) * o.noise); };
  const Tp = o.pre * dt;
  for (let k = 0; k < o.pre; k++) add(herm(o.p0, o.m0, [P.x0, P.y0], [P.vx, P.vy], Tp, k / o.pre));
  const iRel = t.length; let k = 0, last;
  for (;;) { const tt = k * dt, p = pos(P, tt); if (k > 2 && ((o.endX !== undefined && p[0] > o.endX) || (p[1] < o.endY && P.vy - G * tt < 0))) break; add(p); last = [p, [P.vx, P.vy - G * tt]]; k++; }
  const iLand = t.length - 1;
  if (o.post) { const Tq = o.post * dt; for (let q = 1; q <= o.post; q++) add(herm(last[0], last[1], o.stop, [0, 0], Tq, q / o.post)); }
  return { t, x, y, truth: { ...P, v: o.v, th: o.th }, iRel, iLand };
}
export const DEMOS = {
  freethrow: () => ({
    name: 'Free throw (data, 100 Hz)', task: 'freethrow', fps: 100,
    note: 'Ball centre from the side-on demo video at 100 fps. Origin: the floor at the free-throw line.',
    target: { x: 4.225, y: 3.05 }, events: 'Release and the last frame above the rim were marked from the video.',
    ...series({ seed: 11, fps: 100, v: 6.982, th: 52, h: 2.10, x0: 0.35, noise: 0.004, pre: 40, p0: [0.10, 1.16], m0: [0.3, 0.6], endY: 3.07, post: 0 }),
  }),
  netball: () => {
    const v = speedForTarget(2.52 - 0.30, 3.05 - 2.40, 58);
    return {
      name: 'Netball shot (data, 100 Hz)', task: 'netball', fps: 100,
      note: 'Ball centre from side-on video at 100 fps, a shot from about 2.8 m out. Origin: the floor under the shooter\u2019s front foot.',
      target: { x: 2.80, y: 3.05 }, events: 'Release and the last frame above the ring were marked from the video.',
      ...series({ seed: 31, fps: 100, v, th: 58, h: 2.40, x0: 0.30, noise: 0.004, pre: 25, p0: [0.12, 1.95], m0: [0.3, 1.2], endY: 3.07, post: 0 }),
    };
  },
  lineout: () => {
    const v = speedForTarget(7.0 - 0.10, 3.40 - 2.05, 25);
    return {
      name: 'Line-out throw (data, 100 Hz)', task: 'lineout', fps: 100,
      note: 'Ball centre (the middle of the ball) from side-on video at 100 fps, from release to the catch. Origin: the ground at the thrower\u2019s front foot.',
      target: { x: 7.0, y: 3.40 }, events: 'Release and the catch were marked from the video.',
      ...series({ seed: 41, fps: 100, v, th: 25, h: 2.05, x0: 0.10, noise: 0.008, pre: 15, p0: [-0.45, 2.10], m0: [6.0, 2.0], endY: 3.39, post: 0, endX: 7.0 }),
    };
  },
  broadjump: () => ({
    name: 'Broad jump, centre of mass (100 Hz)', task: 'broadjump', fps: 100,
    note: 'Centre of mass from a side-on segmental model at 100 Hz, from the end of the propulsion phase to the end of landing. Origin: the floor at the toes on the take-off line.',
    takeoffDist: 0.42, landingDist: 0.48, events: 'Take-off and touchdown frames were set from the force platform (force below and above 20 N).',
    ...series({ seed: 5, fps: 100, v: 3.20, th: 36, h: 0.88, x0: 0.42, noise: 0.003, pre: 18, p0: [0.05, 0.66], m0: [1.4, 1.1], endY: 0.55, post: 22, stop: [2.18, 0.45] }),
  }),
  shot: () => ({
    name: 'Shot put (50 Hz)', task: 'shot', fps: 50,
    note: 'Shot centre from a camera far back and side-on at 50 fps, so each click is less precise (about 1.5 cm). Origin: the ground at the inner edge of the stop board.',
    releaseAhead: 0.20, events: 'Release and landing frames were set from the video.',
    ...series({ seed: 23, fps: 50, v: 12.5, th: 37, h: 2.15, x0: 0.20, noise: 0.015, pre: 6, p0: [-0.55, 1.55], m0: [6.0, 4.2], endY: 0.0, post: 0 }),
  }),
};
// What the demo video shows (made with the same release values), so it can be checked and filled in.
export const VIDEO_DEMO = { file: 'demo/demo-free-throw-100fps.mp4', fps: 100, task: 'freethrow', target: { x: 4.225, y: 3.05 }, stickPx: [[77, 530], [77, 680]], originPx: [220, 680], stickLen: 1, releaseFrame: 95, endFrame: 185, ballR: 18 };
// The standing long jump on two force platforms (a real trial, the same file as the Force Analysis demo). The platform
// cannot give the centre of mass height or position, so typical values stand in for what you would measure on video.
export const FORCE_DEMO = { file: 'demo/demo-slj-force.txt', name: 'Standing long jump on force platforms (1000 Hz)', h0: 0.90, takeoffDist: 0.40, landingDist: 0.45, landH: 0.55, measured: null };
