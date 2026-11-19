// Finding and following a ball in video frames (ImageData). Pure functions: no page state.
//
// findBall: from a rough point, find the ball's centre and radius. The ball is the blob that stands out from its
// surroundings; its edge is then traced along rays from the middle and a circle is fitted to the edge points,
// ignoring the ones that do not fit (a hand, the edge of the picture). That copes with a ball that is partly hidden.
// trackBall: follow the ball from one frame to the next by template matching (zero-mean normalised
// cross-correlation) around where the flight says it should be, then re-centre it with findBall.

const lumAt = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

export function findBall(img, p, rHint = 14) {
  const W = img.width, H = img.height, d = img.data;
  const R = Math.max(24, Math.round(rHint * 3)), cx0 = Math.round(p[0]), cy0 = Math.round(p[1]);
  const x0 = Math.max(0, cx0 - R), y0 = Math.max(0, cy0 - R), x1 = Math.min(W - 1, cx0 + R), y1 = Math.min(H - 1, cy0 + R);
  const nw = x1 - x0 + 1, nh = y1 - y0 + 1; if (nw < 8 || nh < 8) return null;
  // background: median colour of the window's border
  const bR = [], bG = [], bB = [];
  const push = (x, y) => { const i = (y * W + x) * 4; bR.push(d[i]); bG.push(d[i + 1]); bB.push(d[i + 2]); };
  for (let x = x0; x <= x1; x++) { push(x, y0); push(x, y1); } for (let y = y0; y <= y1; y++) { push(x0, y); push(x1, y); }
  const med = (a) => { a.sort((u, v) => u - v); return a[a.length >> 1]; };
  const mr = med(bR), mg = med(bG), mb = med(bB);
  const dist = new Float32Array(nw * nh);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) { const i = ((y0 + y) * W + x0 + x) * 4; dist[y * nw + x] = Math.hypot(d[i] - mr, d[i + 1] - mg, d[i + 2] - mb); }
  // the strongest contrast near the click sets the threshold
  let mx = 0; const near = Math.max(4, rHint * 0.8);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) { if (Math.hypot(x0 + x - p[0], y0 + y - p[1]) <= near && dist[y * nw + x] > mx) mx = dist[y * nw + x]; }
  if (mx < 18) return null;
  const thr = Math.max(14, mx * 0.45);
  // the blob that contains (or is nearest to) the click
  let seed = -1, sd = Infinity;
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) { const k = y * nw + x; if (dist[k] > thr) { const dd = Math.hypot(x0 + x - p[0], y0 + y - p[1]); if (dd < sd) { sd = dd; seed = k; } } }
  if (seed < 0 || sd > rHint * 1.5) return null;
  const lab = new Uint8Array(nw * nh), q = [seed]; lab[seed] = 1; let sx = 0, sy = 0, cnt = 0;
  while (q.length) {
    const k = q.pop(), x = k % nw, y = (k / nw) | 0; sx += x; sy += y; cnt++;
    if (cnt > nw * nh * 0.6) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= nw || yy >= nh) continue; const kk = yy * nw + xx; if (!lab[kk] && dist[kk] > thr) { lab[kk] = 1; q.push(kk); } }
  }
  if (cnt < 12) return null;
  let c = [x0 + sx / cnt, y0 + sy / cnt], r0 = Math.min(Math.sqrt(cnt / Math.PI), rHint * 2.5);
  // trace the edge along rays and fit a circle to it
  const sample = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y); if (xi < x0 || yi < y0 || xi + 1 > x1 || yi + 1 > y1) return NaN; const fx = x - xi, fy = y - yi, g = (a, b) => dist[(b - y0) * nw + (a - x0)]; return g(xi, yi) * (1 - fx) * (1 - fy) + g(xi + 1, yi) * fx * (1 - fy) + g(xi, yi + 1) * (1 - fx) * fy + g(xi + 1, yi + 1) * fx * fy; };
  for (let pass = 0; pass < 2; pass++) {
    const pts = [];
    for (let k = 0; k < 48; k++) {
      const a = 2 * Math.PI * k / 48, ca = Math.cos(a), sa = Math.sin(a); let best = 0, br = -1, prev = sample(c[0] + 0.4 * r0 * ca, c[1] + 0.4 * r0 * sa);
      for (let rr = 0.45 * r0; rr <= 1.7 * r0; rr += 0.5) { const v = sample(c[0] + rr * ca, c[1] + rr * sa); if (!Number.isFinite(v) || !Number.isFinite(prev)) { prev = v; continue; } const drop = prev - v; if (drop > best) { best = drop; br = rr; } prev = v; }
      if (br > 0 && best > thr * 0.15) pts.push([c[0] + br * ca, c[1] + br * sa]);
    }
    if (pts.length < 10) break;
    let fit = circleFit(pts); if (!fit) break;
    const res = pts.map((q2) => Math.abs(Math.hypot(q2[0] - fit.c[0], q2[1] - fit.c[1]) - fit.r)), mres = med(res.slice()) || 0.5;
    const keep = pts.filter((q2, i) => res[i] <= Math.max(1.5, 2.5 * mres));
    if (keep.length >= 8) { const f2 = circleFit(keep); if (f2) fit = f2; }
    if (!(fit.r > 0.4 * r0 && fit.r < 1.8 * r0) || Math.hypot(fit.c[0] - c[0], fit.c[1] - c[1]) > r0) break;
    c = fit.c; r0 = fit.r;
  }
  return { c, r: r0, contrast: mx };
}
// Least-squares circle through points (Kasa method).
function circleFit(P) {
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0; const n = P.length;
  for (const [x, y] of P) { const z = x * x + y * y; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z; }
  const A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]], b = [sxz, syz, sz];
  const det = (M) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  const D = det(A); if (Math.abs(D) < 1e-9) return null;
  const col = (k) => A.map((r, i) => r.map((v, j) => (j === k ? b[i] : v)));
  const a1 = det(col(0)) / D, a2 = det(col(1)) / D, a3 = det(col(2)) / D, cx = a1 / 2, cy = a2 / 2, r2 = a3 + cx * cx + cy * cy;
  return r2 > 0 ? { c: [cx, cy], r: Math.sqrt(r2) } : null;
}

// ---------- template matching ----------
function patch(img, cx, cy, h) {
  const W = img.width, H = img.height, d = img.data; cx = Math.round(cx); cy = Math.round(cy);
  if (cx - h < 0 || cy - h < 0 || cx + h >= W || cy + h >= H) return null;
  const n = 2 * h + 1, out = new Float32Array(n * n); let k = 0, m = 0;
  for (let y = cy - h; y <= cy + h; y++) for (let x = cx - h; x <= cx + h; x++) { const v = lumAt(d, (y * W + x) * 4); out[k++] = v; m += v; }
  m /= out.length; let ss = 0; for (let i = 0; i < out.length; i++) { out[i] -= m; ss += out[i] * out[i]; }
  return { z: out, norm: Math.sqrt(ss), h };
}
function zncc(img, cx, cy, T) {
  const W = img.width, d = img.data, h = T.h, z = T.z, n = z.length; let s = 0, s2 = 0, dot = 0, k = 0;
  for (let y = cy - h; y <= cy + h; y++) for (let x = cx - h; x <= cx + h; x++) { const v = lumAt(d, (y * W + x) * 4); s += v; s2 += v * v; dot += v * z[k++]; }
  const vr = s2 - s * s / n; return vr <= 1e-6 || T.norm < 1e-6 ? 0 : dot / (Math.sqrt(vr) * T.norm);
}
function search(img, pred, R, Ts) {
  const h = Ts[0].h, W = img.width, H = img.height;
  const xa = Math.max(h, Math.round(pred[0] - R)), xb = Math.min(W - h - 1, Math.round(pred[0] + R)), ya = Math.max(h, Math.round(pred[1] - R)), yb = Math.min(H - h - 1, Math.round(pred[1] + R));
  if (xb < xa || yb < ya) return { score: -1 };
  const sc = (x, y) => Math.max(...Ts.map((T) => zncc(img, x, y, T)));
  let best = -2, bx = xa, by = ya; const st = h >= 8 ? 2 : 1;
  for (let y = ya; y <= yb; y += st) for (let x = xa; x <= xb; x += st) { const v = sc(x, y); if (v > best) { best = v; bx = x; by = y; } }
  const cx = bx, cy = by;
  for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) { if (x < h || y < h || x >= W - h || y >= H - h) continue; const v = sc(x, y); if (v > best) { best = v; bx = x; by = y; } }
  return { p: [bx, by], score: best };
}
// Where the flight says the ball will be in frame f: a straight line across and a parabola up and down, through the
// frames tracked so far (constant velocity with only two).
function predict(P, f) {
  const k = P.slice(-10), n = k.length;
  if (n === 1) return [k[0][1], k[0][2]];
  if (n === 2) { const [a, b] = k, s = (f - b[0]) / (b[0] - a[0]); return [b[1] + (b[1] - a[1]) * s, b[2] + (b[2] - a[2]) * s]; }
  const fit = (col, deg) => { // tiny least squares in frame number
    const t0 = k[0][0], X = k.map((q) => q[0] - t0), Y = k.map((q) => q[col]), p = deg + 1, M = Array.from({ length: p }, () => new Array(p + 1).fill(0));
    X.forEach((x, i) => { const row = []; for (let j = 0; j < p; j++) row.push(Math.pow(x, j)); for (let r = 0; r < p; r++) { for (let c = 0; c < p; c++) M[r][c] += row[r] * row[c]; M[r][p] += row[r] * Y[i]; } });
    for (let c = 0; c < p; c++) { let pv = c; for (let r = c + 1; r < p; r++) if (Math.abs(M[r][c]) > Math.abs(M[pv][c])) pv = r; [M[c], M[pv]] = [M[pv], M[c]]; for (let r = 0; r < p; r++) if (r !== c) { const q = M[r][c] / M[c][c]; for (let j = c; j <= p; j++) M[r][j] -= q * M[c][j]; } }
    const cf = M.map((r, i) => r[p] / r[i]), x = f - t0; return cf.reduce((s, v, j) => s + v * Math.pow(x, j), 0);
  };
  return [fit(1, 1), fit(2, n >= 4 ? 2 : 1)];
}

// Follow the ball from frame f0 (where it is at p0 with radius r0) to frame f1 (inclusive), one frame at a time.
// getImg(f) returns a promise of that frame's ImageData. onStep(f, point, r, score) is called for each frame found.
// Stops when the match gets poor, the ball reaches the edge of the picture, or shouldStop() returns true.
export async function trackBall(getImg, f0, f1, p0, r0, onStep, shouldStop, minScore = 0.5) {
  const dir = f1 >= f0 ? 1 : -1, img0 = await getImg(f0), h = Math.max(5, Math.round(r0 * 1.15));
  const T0 = patch(img0, p0[0], p0[1], h); if (!T0) return { why: 'edge', f: f0 };
  let Tp = T0, r = r0; const P = [[f0, p0[0], p0[1]]];
  for (let f = f0 + dir; dir > 0 ? f <= f1 : f >= f1; f += dir) {
    if (shouldStop && shouldStop()) return { why: 'stopped', f: f - dir };
    const img = await getImg(f), pred = predict(P, f), last = P[P.length - 1], step = Math.hypot(pred[0] - last[1], pred[1] - last[2]);
    if (pred[0] < -r || pred[1] < -r || pred[0] > img.width + r || pred[1] > img.height + r) return { why: 'edge', f: f - dir };
    const R = Math.max(1.5 * r, Math.min(8 * r, r + 0.5 * step + (P.length < 3 ? 2 * r : 0)));
    let m = search(img, pred, R, [T0, Tp]);
    if (!(m.score >= minScore)) { const m2 = search(img, pred, R * 1.8, [T0, Tp]); if (m2.score > m.score) m = m2; }
    if (!(m.score >= minScore)) return { why: 'lost', f, score: m.score };
    let c = m.p; const b = findBall(img, c, r);
    if (b && Math.hypot(b.c[0] - c[0], b.c[1] - c[1]) < 0.7 * r && b.r > 0.6 * r && b.r < 1.5 * r) { c = b.c; r = 0.8 * r + 0.2 * b.r; }
    if (c[0] < r * 0.6 || c[1] < r * 0.6 || c[0] > img.width - r * 0.6 || c[1] > img.height - r * 0.6) return { why: 'edge', f: f - dir };
    P.push([f, c[0], c[1]]); onStep(f, c, r, m.score);
    const t = patch(img, c[0], c[1], h); if (t) Tp = t;
  }
  return { why: 'done', f: f1 };
}
