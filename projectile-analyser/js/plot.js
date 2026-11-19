// Small canvas helpers shared by Learn and Analyse.
export const COL = { brand: '#1d4ed8', dark: '#1e3a8a', accent: '#0f766e', x: '#d97706', y: '#7c3aed', res: '#0891b2', g: '#dc2626', ink: '#1f2a33', muted: '#5b6770', grid: '#e5e9ee', axis: '#94a3b8', pts: '#0f172a', fit: '#1d4ed8', what: '#db2777', good: '#047857', warn: '#b45309', bad: '#b91c1c' };

// Size a canvas to its CSS box at the device pixel ratio and return a context in CSS pixels.
export function hidpi(cv) {
  const r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1;
  const w = Math.max(10, Math.round(r.width)), h = Math.max(10, Math.round(r.height));
  if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
  const ctx = cv.getContext('2d'); ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, w, h);
  ctx.font = '13px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  return { ctx, w, h };
}
export function niceStep(r, k) { if (!(r > 0)) return 1; const raw = r / k, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p; }
const decs = (s) => Math.max(0, -Math.floor(Math.log10(s) + 1e-9));
export function lim(arrs, pad = 0.06) {
  let a = Infinity, b = -Infinity; arrs.forEach((v) => { for (const q of v) if (Number.isFinite(q)) { if (q < a) a = q; if (q > b) b = q; } });
  if (!Number.isFinite(a)) return [0, 1]; if (a === b) { a -= 0.5; b += 0.5; } const p = (b - a) * pad; return [a - p, b + p];
}

// A plot panel. o: { x: [min,max], y: [min,max], equal: bool, xl, yl, title, rect: {x,y,w,h} }.
// Returns { X(v), Y(v), inv(px,py), r } so callers can draw on it.
export function panel(ctx, o) {
  const R = o.rect, L = R.x + 52, T = R.y + (o.title ? 22 : 8), Rt = R.x + R.w - 12, B = R.y + R.h - 34;
  let [x0, x1] = o.x, [y0, y1] = o.y;
  if (o.equal) { // same metres per pixel on both axes, so the path has its real shape
    const sx = (Rt - L) / (x1 - x0), sy = (B - T) / (y1 - y0), s = Math.min(sx, sy);
    const cx = (x0 + x1) / 2, hw = (Rt - L) / s / 2;
    if (sx > s) { x0 = cx - hw; x1 = cx + hw; } if (sy > s) y1 = y0 + (B - T) / s;
  }
  const X = (v) => L + (v - x0) / (x1 - x0) * (Rt - L), Y = (v) => B - (v - y0) / (y1 - y0) * (B - T);
  ctx.save(); ctx.fillStyle = '#fff'; ctx.fillRect(L, T, Rt - L, B - T);
  const sxs = niceStep(x1 - x0, Math.max(3, Math.round((Rt - L) / 90))), sys = niceStep(y1 - y0, Math.max(3, Math.round((B - T) / 50)));
  ctx.strokeStyle = COL.grid; ctx.lineWidth = 1; ctx.fillStyle = COL.muted; ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let v = Math.ceil(x0 / sxs) * sxs; v <= x1 + 1e-9; v += sxs) { const p = X(v); ctx.beginPath(); ctx.moveTo(p, T); ctx.lineTo(p, B); ctx.stroke(); ctx.fillText((Math.abs(v) < 1e-9 ? 0 : v).toFixed(decs(sxs)), p, B + 4); }
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let v = Math.ceil(y0 / sys) * sys; v <= y1 + 1e-9; v += sys) { const p = Y(v); ctx.beginPath(); ctx.moveTo(L, p); ctx.lineTo(Rt, p); ctx.stroke(); ctx.fillText((Math.abs(v) < 1e-9 ? 0 : v).toFixed(decs(sys)), L - 6, p); }
  ctx.strokeStyle = COL.axis; ctx.strokeRect(L, T, Rt - L, B - T);
  if (y0 < 0 && y1 > 0) { ctx.strokeStyle = '#94a3b8'; ctx.beginPath(); ctx.moveTo(L, Y(0)); ctx.lineTo(Rt, Y(0)); ctx.stroke(); }
  ctx.fillStyle = COL.ink; ctx.font = '600 12.5px system-ui, sans-serif';
  if (o.xl) { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(o.xl, (L + Rt) / 2, R.y + R.h); }
  if (o.yl) { ctx.save(); ctx.translate(R.x + 11, (T + B) / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle'; rich(ctx, o.yl, 0, 0, 12.5, '600 ', 'center'); ctx.restore(); }
  if (o.title) { ctx.textBaseline = 'top'; rich(ctx, o.title, L, R.y + 3, 13, '600 ', 'left'); }
  ctx.restore();
  return { X, Y, inv: (px, py) => [x0 + (px - L) / (Rt - L) * (x1 - x0), y0 + (B - py) / (B - T) * (y1 - y0)], r: { L, T, R: Rt, B }, x: [x0, x1], y: [y0, y1] };
}
export function clip(ctx, P) { ctx.save(); ctx.beginPath(); ctx.rect(P.r.L, P.r.T, P.r.R - P.r.L, P.r.B - P.r.T); ctx.clip(); }
export function line(ctx, P, xs, ys, col, w = 2, dash) {
  ctx.save(); clip(ctx, P); ctx.strokeStyle = col; ctx.lineWidth = w; if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); let on = false;
  for (let i = 0; i < xs.length; i++) { if (!Number.isFinite(xs[i]) || !Number.isFinite(ys[i])) { on = false; continue; } const a = P.X(xs[i]), b = P.Y(ys[i]); if (on) ctx.lineTo(a, b); else ctx.moveTo(a, b); on = true; }
  ctx.stroke(); ctx.restore(); ctx.restore();
}
export function dots(ctx, P, xs, ys, col, r = 3, fill = true) {
  ctx.save(); clip(ctx, P); ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 1.5;
  for (let i = 0; i < xs.length; i++) { if (!Number.isFinite(xs[i]) || !Number.isFinite(ys[i])) continue; ctx.beginPath(); ctx.arc(P.X(xs[i]), P.Y(ys[i]), r, 0, 2 * Math.PI); fill ? ctx.fill() : ctx.stroke(); }
  ctx.restore(); ctx.restore();
}
export function arrow(ctx, x1, y1, x2, y2, col, w = 3, head = 11) {
  const a = Math.atan2(y2 - y1, x2 - x1), L = Math.hypot(x2 - x1, y2 - y1); if (L < 1) return;
  const hd = Math.min(head, L * 0.45);
  ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - Math.cos(a) * hd * 0.7, y2 - Math.sin(a) * hd * 0.7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - hd * Math.cos(a - 0.42), y2 - hd * Math.sin(a - 0.42)); ctx.lineTo(x2 - hd * Math.cos(a + 0.42), y2 - hd * Math.sin(a + 0.42)); ctx.closePath(); ctx.fill();
  ctx.restore();
}
// Text with simple subscripts: "v_x = 4.3" draws the x as a subscript.
function parts(t) { return t.split(/_(\w)/).map((q, i) => [q, i % 2 === 1]).filter((q) => q[0]); }
export function rich(ctx, txt, x, y, size, weight, align) {
  const ps = parts(txt), big = weight + size + 'px system-ui, sans-serif', small = weight + Math.round(size * 0.72) + 'px system-ui, sans-serif';
  let w = 0; ps.forEach(([q, s]) => { ctx.font = s ? small : big; w += ctx.measureText(q).width; });
  let cx = align === 'left' ? x : align === 'right' ? x - w : x - w / 2; ctx.textAlign = 'left';
  ps.forEach(([q, s]) => { ctx.font = s ? small : big; ctx.fillText(q, cx, s ? y + size * 0.3 : y); cx += ctx.measureText(q).width; });
  return w;
}
export function label(ctx, txt, x, y, col = COL.ink, o = {}) {
  const size = o.size || 13, wt = o.bold === false ? '' : '600 ';
  ctx.save(); ctx.textBaseline = o.base || 'middle';
  if (o.bg !== false) { ctx.globalAlpha = 0; const w0 = rich(ctx, txt, x, y, size, wt, o.align) + 8; ctx.globalAlpha = 1; const h = size + 6; const bx = o.align === 'left' ? x - 4 : o.align === 'right' ? x - w0 + 4 : x - w0 / 2; const by = o.base === 'top' ? y - 3 : o.base === 'bottom' ? y - h + 3 : y - h / 2; ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.fillRect(bx, by, w0, h); }
  ctx.fillStyle = col; rich(ctx, txt, x, y, size, wt, o.align); ctx.restore();
}
// right-angle marker at corner (cx,cy) between unit directions d1 and d2
export function rightMark(ctx, cx, cy, d1, d2, s = 12, col = COL.muted) {
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath();
  ctx.moveTo(cx + d1[0] * s, cy + d1[1] * s); ctx.lineTo(cx + (d1[0] + d2[0]) * s, cy + (d1[1] + d2[1]) * s); ctx.lineTo(cx + d2[0] * s, cy + d2[1] * s); ctx.stroke(); ctx.restore();
}
// arc for an angle at (cx,cy) from a0 to a1 (canvas radians)
export function arc(ctx, cx, cy, r, a0, a1, col) { ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1, a1 < a0); ctx.stroke(); ctx.restore(); }
export const fmt = (x, d = 2) => (Number.isFinite(x) ? (Math.abs(x) < 0.5 * Math.pow(10, -d) ? (0).toFixed(d) : x.toFixed(d)) : '–');
export const sgn = (x, d = 2) => (Number.isFinite(x) ? (Number(x.toFixed(d)) === 0 ? (0).toFixed(d) : x < 0 ? '−' + Math.abs(x).toFixed(d) : x.toFixed(d)) : '–');
