// Canvas charts: a base layer (redrawn when the data or the view change) and an overlay layer for the cursor
// (redrawn on every mouse move). Canvases take their size from their container, so hovering never resizes them.

export function niceStep(range, target) {
  if (!(range > 0)) return 1;
  const raw = range / (target || 5), p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
  return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
}
export function numTxt(v, step) {
  const d = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)));
  return (+v).toFixed(d);
}

export class Chart {
  // opts: height (px or function), draw(ctx, w, h) -> frame, overlay(ctx, w, h, frame), onMove(ev, frame), onLeave(), onDown(ev, frame), onUp(ev, frame), onDbl(ev, frame)
  constructor(el, opts) {
    this.el = el; this.o = opts; this.w = 0; this.h = 0; this.frame = null;
    el.classList.add('cwrap');
    this.cv = document.createElement('canvas'); this.ov = document.createElement('canvas');
    this.cv.className = 'cbase'; this.ov.className = 'cover';
    this.cv.setAttribute('aria-hidden', 'true');
    el.appendChild(this.cv); el.appendChild(this.ov);
    if (opts.label) { this.ov.setAttribute('role', 'img'); this.ov.setAttribute('aria-label', opts.label); }
    const pos = (ev) => { const r = this.ov.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
    this.ov.addEventListener('pointermove', (ev) => { if (this.o.onMove) this.o.onMove(pos(ev), this.frame, ev); });
    this.ov.addEventListener('pointerleave', (ev) => { if (this.o.onLeave) this.o.onLeave(pos(ev), this.frame, ev); });
    this.ov.addEventListener('pointerdown', (ev) => { if (this.o.onDown) { if (this.o.onDown(pos(ev), this.frame, ev)) { this.ov.setPointerCapture(ev.pointerId); ev.preventDefault(); } } });
    this.ov.addEventListener('pointerup', (ev) => { if (this.o.onUp) this.o.onUp(pos(ev), this.frame, ev); });
    this.ov.addEventListener('dblclick', (ev) => { if (this.o.onDbl) this.o.onDbl(pos(ev), this.frame, ev); });
    if (typeof ResizeObserver !== 'undefined') { this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(el); }
    this.resize();
  }
  height() { const h = this.o.height; return typeof h === 'function' ? h(this.el.clientWidth) : (h || 300); }
  resize() {
    const w = Math.max(50, Math.floor(this.el.clientWidth)), h = Math.floor(this.height());
    if (!this.el.offsetParent && this.w) return; // hidden: keep the old size
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    [this.cv, this.ov].forEach((c) => { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.width = w + 'px'; c.style.height = h + 'px'; });
    this.el.style.height = h + 'px';
    this.render();
  }
  render() {
    if (!this.w) return;
    const dpr = this.cv.width / this.w;
    const ctx = this.cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    this.frame = this.o.draw ? this.o.draw(ctx, this.w, this.h) : null;
    this.overlay();
  }
  overlay() {
    if (!this.w) return;
    const dpr = this.ov.width / this.w;
    const ctx = this.ov.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    if (this.o.overlay && this.frame) this.o.overlay(ctx, this.w, this.h, this.frame);
  }
  // Renders the base layer into a fresh canvas (for PNG export).
  snapshot(w, h, scale) {
    const c = document.createElement('canvas'); scale = scale || 2;
    c.width = w * scale; c.height = h * scale;
    const ctx = c.getContext('2d'); ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    const fr = this.o.draw(ctx, w, h, true);
    if (this.o.overlayExport && fr) this.o.overlayExport(ctx, w, h, fr);
    return c;
  }
}

// Plot area and scales.
export function frame(w, h, x0, x1, y0, y1, m) {
  m = Object.assign({ L: 64, R: 14, T: 16, B: 36 }, m || {});
  const W = w - m.L - m.R, H = h - m.T - m.B;
  if (x1 - x0 < 1e-9) x1 = x0 + 1;
  if (y1 - y0 < 1e-9) { y0 -= 1; y1 += 1; }
  const X = (t) => m.L + (t - x0) / (x1 - x0) * W;
  const Y = (v) => m.T + H - (v - y0) / (y1 - y0) * H;
  const tAt = (px) => x0 + (px - m.L) / W * (x1 - x0);
  const vAt = (py) => y0 + (m.T + H - py) / H * (y1 - y0);
  return { L: m.L, R: m.R, T: m.T, B: m.B, W, H, w, h, x0, x1, y0, y1, X, Y, tAt, vAt };
}

export function axes(ctx, fr, o) {
  o = o || {};
  const { L, T, W, H, x0, x1, y0, y1, X, Y } = fr;
  ctx.save();
  ctx.font = '12px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  ctx.fillStyle = '#fff'; if (!o.noBg) ctx.fillRect(L, T, W, H);
  const ys = niceStep(y1 - y0, o.yTicks || 5), xs = niceStep(x1 - x0, o.xTicks || Math.max(3, Math.round(W / 110)));
  ctx.strokeStyle = '#e8edf1'; ctx.lineWidth = 1; ctx.fillStyle = '#5b6770'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let y = Math.ceil(y0 / ys) * ys; y <= y1 + 1e-9; y += ys) {
    const py = Math.round(Y(y)) + 0.5; ctx.beginPath(); ctx.moveTo(L, py); ctx.lineTo(L + W, py); ctx.stroke();
    ctx.fillText(o.yfmt ? o.yfmt(y) : numTxt(y, ys), L - 6, py);
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  if (!o.noX) for (let x = Math.ceil(x0 / xs) * xs; x <= x1 + 1e-9; x += xs) {
    const px = Math.round(X(x)) + 0.5;
    if (o.xGrid) { ctx.beginPath(); ctx.moveTo(px, T); ctx.lineTo(px, T + H); ctx.stroke(); }
    ctx.fillText(o.xfmt ? o.xfmt(x) : numTxt(x, xs), px, T + H + 5);
  }
  if (y0 < 0 && y1 > 0 && o.zero !== false) { ctx.strokeStyle = '#9aa5ad'; ctx.beginPath(); ctx.moveTo(L, Math.round(Y(0)) + 0.5); ctx.lineTo(L + W, Math.round(Y(0)) + 0.5); ctx.stroke(); }
  ctx.strokeStyle = '#334155'; ctx.beginPath(); ctx.moveTo(L + 0.5, T); ctx.lineTo(L + 0.5, T + H + 0.5); ctx.lineTo(L + W, T + H + 0.5); ctx.stroke();
  ctx.fillStyle = '#1f2a33'; ctx.font = 'bold 12.5px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  if (o.xlab && !o.noX) { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(o.xlab, L + W / 2, fr.h - 2); }
  if (o.ylab) { ctx.save(); ctx.translate(13, T + H / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(o.ylab, 0, 0); ctx.restore(); }
  ctx.restore();
}

// Draws y (sampled at times t) between samples i0 and i1, keeping peaks when there are many samples per pixel.
export function line(ctx, fr, t, y, o) {
  o = o || {};
  const n = y.length, i0 = Math.max(0, o.i0 || 0), i1 = Math.min(n - 1, o.i1 === undefined ? n - 1 : o.i1);
  if (i1 <= i0) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(fr.L, fr.T - 2, fr.W, fr.H + 4); ctx.clip();
  ctx.strokeStyle = o.col || '#1d4ed8'; ctx.lineWidth = o.width || 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (o.dash) ctx.setLineDash(o.dash);
  if (o.alpha) ctx.globalAlpha = o.alpha;
  ctx.beginPath();
  const spp = (i1 - i0) / fr.W; // samples per pixel
  let started = false;
  const mv = (x, v) => { if (!Number.isFinite(v)) { started = false; return; } const py = fr.Y(v); if (!started) { ctx.moveTo(x, py); started = true; } else ctx.lineTo(x, py); };
  if (spp < 2) { for (let i = i0; i <= i1; i++) mv(fr.X(t[i]), y[i]); }
  else {
    let cur = Math.floor(fr.X(t[i0])), mn = Infinity, mx = -Infinity, fv = NaN, lv = NaN;
    const flush = () => { if (mn <= mx) { mv(cur + 0.5, fv); mv(cur + 0.5, mn); mv(cur + 0.5, mx); mv(cur + 0.5, lv); } };
    for (let i = i0; i <= i1; i++) {
      const px = Math.floor(fr.X(t[i])), v = y[i];
      if (px !== cur) { flush(); cur = px; mn = Infinity; mx = -Infinity; fv = NaN; }
      if (!Number.isFinite(v)) { flush(); mn = Infinity; mx = -Infinity; started = false; continue; }
      if (!Number.isFinite(fv)) fv = v; lv = v; if (v < mn) mn = v; if (v > mx) mx = v;
    }
    flush();
  }
  ctx.stroke();
  ctx.restore();
}

// y range of several series over i0..i1 (NaN ignored), with padding.
export function range(list, i0, i1, extra, pad) {
  let lo = Infinity, hi = -Infinity;
  list.forEach((y) => { if (!y) return; for (let i = Math.max(0, i0); i <= Math.min(y.length - 1, i1); i++) { const v = y[i]; if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } } });
  (extra || []).forEach((v) => { if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } });
  if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const p = (hi - lo) * (pad === undefined ? 0.08 : pad);
  return [lo - p, hi + p];
}

// Vertical band (phase shading).
export function band(ctx, fr, t0, t1, col, alpha) {
  const a = Math.max(fr.L, fr.X(t0)), b = Math.min(fr.L + fr.W, fr.X(t1));
  if (b <= a) return;
  ctx.save(); ctx.globalAlpha = alpha === undefined ? 0.13 : alpha; ctx.fillStyle = col; ctx.fillRect(a, fr.T, b - a, fr.H); ctx.restore();
}
export function vline(ctx, fr, t, col, dash, width) {
  const x = fr.X(t); if (x < fr.L - 1 || x > fr.L + fr.W + 1) return;
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = width || 1.5; if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, fr.T); ctx.lineTo(Math.round(x) + 0.5, fr.T + fr.H); ctx.stroke(); ctx.restore();
}
export function hline(ctx, fr, v, col, dash, label, width, left) {
  const y = fr.Y(v); if (y < fr.T || y > fr.T + fr.H) return;
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = width || 1.2; if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(fr.L, Math.round(y) + 0.5); ctx.lineTo(fr.L + fr.W, Math.round(y) + 0.5); ctx.stroke();
  if (label) { ctx.setLineDash([]); ctx.font = '11.5px system-ui, Arial, sans-serif'; ctx.fillStyle = col; ctx.textAlign = left ? 'left' : 'right'; ctx.textBaseline = left ? 'top' : 'bottom'; halo(ctx, label, left ? fr.L + 6 : fr.L + fr.W - 4, left ? y + 3 : y - 2); }
  ctx.restore();
}
// Text with a white outline so it reads over lines.
export function halo(ctx, txt, x, y) {
  ctx.save(); ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.lineJoin = 'round'; ctx.strokeText(txt, x, y); ctx.restore(); ctx.fillText(txt, x, y);
}
export function dot(ctx, x, y, col, r) { ctx.save(); ctx.fillStyle = '#fff'; ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(x, y, r || 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore(); }

// Fills between y and a baseline (above: colA, below: colB) between samples i0 and i1.
export function fillBetween(ctx, fr, t, y, base, i0, i1, colA, colB) {
  if (i1 <= i0) return;
  const yb = fr.Y(base);
  ctx.save();
  ctx.beginPath(); ctx.rect(fr.L, fr.T, fr.W, fr.H); ctx.clip();
  const path = new Path2D();
  const step = Math.max(1, Math.floor((i1 - i0) / (fr.W * 2)));
  path.moveTo(fr.X(t[i0]), yb);
  for (let i = i0; i <= i1; i += step) path.lineTo(fr.X(t[i]), fr.Y(y[i]));
  path.lineTo(fr.X(t[i1]), fr.Y(y[i1])); path.lineTo(fr.X(t[i1]), yb); path.closePath();
  ctx.save(); ctx.beginPath(); ctx.rect(fr.L, fr.T, fr.W, yb - fr.T); ctx.clip(); ctx.fillStyle = colA; ctx.fill(path); ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(fr.L, yb, fr.W, fr.T + fr.H - yb); ctx.clip(); ctx.fillStyle = colB; ctx.fill(path); ctx.restore();
  ctx.restore();
}

export function canvasToBlob(c) { return new Promise((res) => c.toBlob(res, 'image/png')); }
