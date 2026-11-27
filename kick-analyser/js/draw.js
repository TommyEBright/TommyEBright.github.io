// Drawing through a small set of shapes with two back ends (canvas and SVG), so the screen, the PNG and the SVG match.
export const FONTS = { Arial: 'Arial, Helvetica, sans-serif', Helvetica: 'Helvetica, Arial, sans-serif', Calibri: 'Calibri, Carlito, Arial, sans-serif', 'Times New Roman': '"Times New Roman", Times, serif', Georgia: 'Georgia, serif', 'System UI': 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif' };
let mctx = null;
export function textW(s, size, font, bold) { if (!mctx) mctx = document.createElement('canvas').getContext('2d'); mctx.font = (bold ? 'bold ' : '') + size + 'px ' + font; return mctx.measureText(s).width; }

export function canvasG(ctx, font) {
  return {
    font,
    rect(x, y, w, h, o) { ctx.save(); ctx.globalAlpha = o.alpha === undefined ? 1 : o.alpha; if (o.fill) { ctx.fillStyle = o.fill; ctx.fillRect(x, y, w, h); } if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 1; ctx.strokeRect(x, y, w, h); } ctx.restore(); },
    path(p, o) {
      if (p.length < 4) return;
      ctx.save(); ctx.globalAlpha = o.alpha === undefined ? 1 : o.alpha; ctx.lineJoin = 'round'; ctx.lineCap = o.dash ? 'butt' : 'round'; if (o.dash) ctx.setLineDash(o.dash);
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
      if (o.fill) { ctx.closePath(); ctx.fillStyle = o.fill; ctx.fill(); }
      if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 1; ctx.stroke(); }
      ctx.restore();
    },
    circle(x, y, r, o) { ctx.save(); ctx.globalAlpha = o.alpha === undefined ? 1 : o.alpha; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); } if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 1; ctx.stroke(); } ctx.restore(); },
    text(s, x, y, o) {
      ctx.save(); ctx.font = (o.bold ? 'bold ' : '') + o.size + 'px ' + font; ctx.fillStyle = o.fill || '#111827';
      ctx.textAlign = o.anchor === 'middle' ? 'center' : o.anchor === 'end' ? 'right' : 'left'; ctx.textBaseline = 'alphabetic';
      const dy = o.base === 'top' ? o.size * 0.8 : o.base === 'middle' ? o.size * 0.35 : 0;
      if (o.rot) { ctx.translate(x, y); ctx.rotate(o.rot * Math.PI / 180); ctx.fillText(s, 0, dy); } else ctx.fillText(s, x, y + dy);
      ctx.restore();
    },
    clip(x, y, w, h) { ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); },
    unclip() { ctx.restore(); }
  };
}
export function svgG(w, h, font, bg) {
  const out = [], n1 = (v) => (Math.round(v * 10) / 10).toString(), x = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let clips = 0;
  const paint = (o) => (o.fill ? ' fill="' + o.fill + '"' : ' fill="none"') + (o.stroke ? ' stroke="' + o.stroke + '" stroke-width="' + (o.lw || 1) + '"' : '') + (o.alpha !== undefined && o.alpha !== 1 ? ' opacity="' + o.alpha + '"' : '') + (o.dash ? ' stroke-dasharray="' + o.dash.join(' ') + '"' : '');
  return {
    font,
    rect(X, Y, Wd, Hd, o) { out.push('<rect x="' + n1(X) + '" y="' + n1(Y) + '" width="' + n1(Math.max(0, Wd)) + '" height="' + n1(Math.max(0, Hd)) + '"' + paint(o) + '/>'); },
    path(p, o) { if (p.length < 4) return; let d = 'M' + n1(p[0]) + ' ' + n1(p[1]); for (let i = 2; i < p.length; i += 2) d += 'L' + n1(p[i]) + ' ' + n1(p[i + 1]); out.push('<path d="' + d + (o.fill ? 'Z' : '') + '"' + paint(o) + ' stroke-linejoin="round"/>'); },
    circle(X, Y, r, o) { out.push('<circle cx="' + n1(X) + '" cy="' + n1(Y) + '" r="' + n1(r) + '"' + paint(o) + '/>'); },
    text(s, X, Y, o) {
      const dy = o.base === 'top' ? o.size * 0.8 : o.base === 'middle' ? o.size * 0.35 : 0;
      const anc = o.anchor === 'middle' ? 'middle' : o.anchor === 'end' ? 'end' : 'start';
      const tr = o.rot ? ' transform="translate(' + n1(X) + ' ' + n1(Y) + ') rotate(' + o.rot + ')"' : '';
      out.push('<text x="' + n1(o.rot ? 0 : X) + '" y="' + n1(o.rot ? dy : Y + dy) + '" font-size="' + o.size + '"' + (o.bold ? ' font-weight="bold"' : '') + ' fill="' + (o.fill || '#111827') + '" text-anchor="' + anc + '"' + tr + '>' + x(s) + '</text>');
    },
    clip(X, Y, Wd, Hd) { clips++; out.push('<clipPath id="c' + clips + '"><rect x="' + n1(X) + '" y="' + n1(Y) + '" width="' + n1(Wd) + '" height="' + n1(Hd) + '"/></clipPath><g clip-path="url(#c' + clips + ')">'); },
    unclip() { out.push('</g>'); },
    done() { return '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" font-family="' + x(font) + '">\n' + (bg ? '<rect width="100%" height="100%" fill="' + bg + '"/>\n' : '') + out.join('\n') + '\n</svg>'; }
  };
}

export function niceStep(range, target) {
  if (!(range > 0)) return 1;
  const raw = range / (target || 5), p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
  return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
}
export function numTxt(v, step) { const d = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step) - 1e-9)); const s = (+v).toFixed(d); return s === '-0' ? '0' : s; }
function ticks(a, b, n) { const st = niceStep(b - a, n), o = []; for (let v = Math.ceil(a / st - 1e-9) * st; v <= b + st * 1e-6; v += st) o.push(+v.toFixed(10)); return { t: o, st }; }
export function range(series, key, withBand) {
  let a = Infinity, b = -Infinity;
  for (const s of series) for (let i = 0; i < s[key].length; i++) {
    const v = s[key][i]; if (Number.isFinite(v)) { a = Math.min(a, v); b = Math.max(b, v); }
    if (withBand && s.lo) { if (Number.isFinite(s.lo[i])) a = Math.min(a, s.lo[i]); if (Number.isFinite(s.hi[i])) b = Math.max(b, s.hi[i]); }
  }
  if (!Number.isFinite(a)) { a = 0; b = 1; } if (a === b) { a -= 1; b += 1; }
  return [a, b];
}

// axes: o = {fs, lw, grid, zero, axis, text, xlab, ylab, xt:false to hide x ticks}
export function axes(g, X, Y, W, H, xr, yr, o) {
  const sx = (v) => X + (v - xr[0]) / (xr[1] - xr[0]) * W, sy = (v) => Y + H - (v - yr[0]) / (yr[1] - yr[0]) * H;
  const xt = o.xt === false ? null : ticks(xr[0], xr[1], Math.max(3, Math.round(W / 90))), yt = ticks(yr[0], yr[1], Math.max(3, Math.round(H / 55)));
  if (xt) xt.t = xt.t.filter((v) => v >= xr[0] - 1e-9 && v <= xr[1] + 1e-9);
  yt.t = yt.t.filter((v) => v >= yr[0] - 1e-9 && v <= yr[1] + 1e-9);
  const ax = o.axis || '#334155', tx = o.text || '#111827', f = o.fs || 12;
  if (o.grid) { if (xt) xt.t.forEach((v) => g.path([sx(v), Y, sx(v), Y + H], { stroke: '#e5e7eb', lw: 1 })); yt.t.forEach((v) => g.path([X, sy(v), X + W, sy(v)], { stroke: '#e5e7eb', lw: 1 })); }
  if (o.zero && yr[0] < 0 && yr[1] > 0) g.path([X, sy(0), X + W, sy(0)], { stroke: '#94a3b8', lw: 1 });
  g.path([X, Y, X, Y + H, X + W, Y + H], { stroke: ax, lw: 1 });
  if (xt) xt.t.forEach((v) => { g.path([sx(v), Y + H, sx(v), Y + H + 4], { stroke: ax, lw: 1 }); g.text(numTxt(v, xt.st), sx(v), Y + H + 7, { size: f * 0.85, anchor: 'middle', base: 'top', fill: ax }); });
  yt.t.forEach((v) => { g.path([X - 4, sy(v), X, sy(v)], { stroke: ax, lw: 1 }); g.text(numTxt(v, yt.st), X - 7, sy(v), { size: f * 0.85, anchor: 'end', base: 'middle', fill: ax }); });
  if (o.xlab) g.text(o.xlab, X + W / 2, Y + H + 10 + f * 1.9, { size: f, anchor: 'middle', bold: true, fill: tx });
  if (o.ylab) { const yw = Math.max(...yt.t.map((v) => textW(numTxt(v, yt.st), f * 0.85, g.font))); g.text(o.ylab, X - yw - 14 - f * 0.4, Y + H / 2, { size: f, anchor: 'middle', bold: true, fill: tx, rot: -90 }); }
  return { sx, sy, xr, yr };
}
export function padRange(r, frac, fix) {
  let a = r[0], b = r[1]; const p = (b - a) * (frac || 0); a -= p; b += p;
  if (fix) { if (fix[0] !== null && fix[0] !== undefined) a = fix[0]; if (fix[1] !== null && fix[1] !== undefined) b = fix[1]; }
  if (!(b > a)) b = a + 1; return [a, b];
}
export function line(g, x, y, sx, sy, o) {
  let p = [];
  const flush = () => { if (p.length >= 4) g.path(p, o); p = []; };
  for (let i = 0; i < x.length; i++) { if (Number.isFinite(x[i]) && Number.isFinite(y[i])) p.push(sx(x[i]), sy(y[i])); else flush(); }
  flush();
}
export function band(g, x, lo, hi, sx, sy, o) {
  let up = [], dn = [];
  const flush = () => { if (up.length >= 4) { const p = up.slice(); for (let i = dn.length - 2; i >= 0; i -= 2) p.push(dn[i], dn[i + 1]); g.path(p, { fill: o.fill, alpha: o.alpha }); } up = []; dn = []; };
  for (let i = 0; i < x.length; i++) { if (Number.isFinite(lo[i]) && Number.isFinite(hi[i])) { up.push(sx(x[i]), sy(hi[i])); dn.push(sx(x[i]), sy(lo[i])); } else flush(); }
  flush();
}
// legend: items [{l, c, dash, box, marker}]; pos 'top' (above, wraps) or 'inside' (top right box)
export function legendH(items, W, f, font) {
  if (!items.length) return 0; let x = 0, rows = 1;
  items.forEach((it) => { const w = 34 + textW(it.l, f * 0.9, font) + 18; if (x + w > W && x > 0) { rows++; x = 0; } x += w; });
  return rows * f * 1.5 + 4;
}
export function legend(g, items, X, Y, W, f, pos, lw) {
  if (!items.length) return;
  const sz = f * 0.9, rh = f * 1.5;
  const draw = (it, x, y) => {
    if (it.box) g.rect(x, y - sz * 0.45, 22, sz * 0.9, { fill: it.c });
    else if (it.marker) { g.circle(x + 5, y, 4, { fill: '#fff', stroke: '#111827', lw: 1.5 }); g.rect(x + 14, y - 4, 8, 8, { fill: '#111827' }); }
    else g.path([x, y, x + 24, y], { stroke: it.c, lw: lw, dash: it.dash });
    g.text(it.l, x + 30, y, { size: sz, base: 'middle', fill: '#111827' });
  };
  if (pos === 'inside') {
    const w = Math.max(...items.map((it) => textW(it.l, sz, g.font))) + 46, h = items.length * rh + 8, x = X + W - w - 8, y = Y + 8;
    g.rect(x, y, w, h, { fill: '#ffffff', stroke: '#cbd5e1', lw: 1, alpha: 0.95 });
    items.forEach((it, i) => draw(it, x + 8, y + 4 + rh * (i + 0.5)));
  } else {
    let x = 0, row = 0; const pos2 = [];
    items.forEach((it) => { const w = 34 + textW(it.l, sz, g.font) + 18; if (x + w > W && x > 0) { row++; x = 0; } pos2.push([x, row]); x += w; });
    const rows = []; pos2.forEach(([px, r], i) => { (rows[r] = rows[r] || []).push(i); });
    rows.forEach((idx, r) => { const last = idx[idx.length - 1]; const wTot = pos2[last][0] + 34 + textW(items[last].l, sz, g.font); const off = X + (W - wTot) / 2; idx.forEach((i) => draw(items[i], off + pos2[i][0], Y + rh * (r + 0.5))); });
  }
}
