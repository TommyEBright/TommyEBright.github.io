// Small SVG line charts. Click a chart to move the video to that moment.
import { esc } from './state.js?v=2.1.1';

export function niceStep(range) {
  if (!(range > 0)) return 1;
  const raw = range / 5, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
  return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
}
const num = (v) => +(+v).toFixed(Math.abs(v) < 1 ? 3 : Math.abs(v) < 100 ? 2 : 0);

// series: [{x:[], y:[], col, dash, name, width, dots}]
// o: {ylab, xlab, zero, evs:[{t,name}], now, minmax, onPick(t), W, H, xMin, xMax, refLine:{a,b} (y = a + b x), equal}
export function chart(svg, series, o) {
  o = o || {};
  const W = o.W || 640, H = o.H || 300, L = 66, R = 14, T = 16, B = 46, w = W - L - R, h = H - T - B;
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  const xs = [], ys = [];
  series.forEach((se) => se.x.forEach((x, i) => { const y = se.y[i]; if (y !== null && y !== undefined && !Number.isNaN(y)) { xs.push(x); ys.push(y); } }));
  if (!xs.length) { svg.innerHTML = '<rect width="' + W + '" height="' + H + '" fill="#fff"/><text x="' + W / 2 + '" y="' + H / 2 + '" text-anchor="middle" font-size="14" fill="#5b6770">Not enough data</text>'; svg.onclick = null; return; }
  let x0 = o.xMin !== undefined ? o.xMin : Math.min(...xs), x1 = o.xMax !== undefined ? o.xMax : Math.max(...xs);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (o.zero) { y0 = Math.min(y0, 0); y1 = Math.max(y1, 0); }
  if (y1 - y0 < 1e-9) { y0 -= 1; y1 += 1; }
  const pad = (y1 - y0) * 0.07; y0 -= pad; y1 += pad;
  if (x1 - x0 < 1e-9) x1 = x0 + 1;
  if (o.equal) { // same scale on both axes (e.g. a trajectory), so the path is not stretched
    const k = Math.max((x1 - x0) / w, (y1 - y0) / h), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    x0 = cx - k * w / 2; x1 = cx + k * w / 2; y0 = cy - k * h / 2; y1 = cy + k * h / 2;
  }
  const X = (x) => L + (x - x0) / (x1 - x0) * w, Y = (y) => T + h - (y - y0) / (y1 - y0) * h;
  const F = 'font-family="system-ui, Arial"';
  let s = '<rect width="' + W + '" height="' + H + '" fill="#fff"/>';
  const ysp = niceStep(y1 - y0), xsp = niceStep(x1 - x0);
  for (let y = Math.ceil(y0 / ysp) * ysp; y <= y1 + 1e-9; y += ysp) {
    s += '<line x1="' + L + '" x2="' + (L + w) + '" y1="' + Y(y) + '" y2="' + Y(y) + '" stroke="#e5e9ec"/>';
    s += '<text x="' + (L - 6) + '" y="' + (Y(y) + 4) + '" text-anchor="end" font-size="12" fill="#5b6770" ' + F + '>' + num(y) + '</text>';
  }
  for (let x = Math.ceil(x0 / xsp) * xsp; x <= x1 + 1e-9; x += xsp) s += '<text x="' + X(x) + '" y="' + (T + h + 17) + '" text-anchor="middle" font-size="12" fill="#5b6770" ' + F + '>' + num(x) + '</text>';
  if (y0 < 0 && y1 > 0) s += '<line x1="' + L + '" x2="' + (L + w) + '" y1="' + Y(0) + '" y2="' + Y(0) + '" stroke="#9aa5ad"/>';
  let lastX = -1e9, row = 0;
  (o.evs || []).forEach((e) => {
    if (e.t < x0 || e.t > x1) return; const ex = X(e.t); row = (ex - lastX < 95) ? (row + 1) % 3 : 0; lastX = ex;
    s += '<line x1="' + ex + '" x2="' + ex + '" y1="' + T + '" y2="' + (T + h) + '" stroke="#e0a100" stroke-width="2" stroke-dasharray="4 3"/><text x="' + (ex + 3) + '" y="' + (T + 11 + row * 13) + '" font-size="11" fill="#8a5d00" ' + F + ' paint-order="stroke" stroke="#fff" stroke-width="3">' + esc(e.name) + '</text>';
  });
  if (o.refLine) { const a = o.refLine.a, b = o.refLine.b; s += '<line x1="' + X(x0) + '" y1="' + Y(a + b * x0) + '" x2="' + X(x1) + '" y2="' + Y(a + b * x1) + '" stroke="#9aa5ad" stroke-width="1.5" stroke-dasharray="6 4"/>'; }
  s += '<line x1="' + L + '" x2="' + L + '" y1="' + T + '" y2="' + (T + h) + '" stroke="#222"/><line x1="' + L + '" x2="' + (L + w) + '" y1="' + (T + h) + '" y2="' + (T + h) + '" stroke="#222"/>';
  s += '<text x="' + (L + w / 2) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="13" font-weight="bold" fill="#1f2a33" ' + F + '>' + esc(o.xlab || 'Time (s)') + '</text>';
  s += '<text transform="translate(15,' + (T + h / 2) + ') rotate(-90)" text-anchor="middle" font-size="13" font-weight="bold" fill="#1f2a33" ' + F + '>' + esc(o.ylab || '') + '</text>';
  series.forEach((se) => {
    let d = '', pen = false;
    se.x.forEach((xx, i) => { const yy = se.y[i]; if (yy === null || yy === undefined || Number.isNaN(yy) || xx < x0 - 1e-9 || xx > x1 + 1e-9) { pen = false; return; } d += (pen ? 'L' : 'M') + X(xx).toFixed(1) + ',' + Y(yy).toFixed(1); pen = true; });
    if (!se.dots) s += '<path d="' + d + '" fill="none" stroke="' + se.col + '" stroke-width="' + (se.width || 2.5) + '" stroke-linejoin="round"' + (se.dash ? ' stroke-dasharray="' + se.dash + '"' : '') + (se.opacity ? ' opacity="' + se.opacity + '"' : '') + '/>';
    if (se.dots) se.x.forEach((xx, i) => { const yy = se.y[i]; if (yy !== null && !Number.isNaN(yy)) s += '<circle cx="' + X(xx).toFixed(1) + '" cy="' + Y(yy).toFixed(1) + '" r="2.6" fill="' + se.col + '"' + (se.opacity ? ' opacity="' + se.opacity + '"' : '') + '/>'; });
    if (o.minmax && !se.noMinMax && (() => { const v = se.y.filter((z) => z !== null && !Number.isNaN(z)); return v.length && Math.max(...v) - Math.min(...v) > 0.03 * (y1 - y0); })()) {
      let iMin = -1, iMax = -1;
      se.y.forEach((v, i) => { if (v === null || Number.isNaN(v) || se.x[i] < x0 || se.x[i] > x1) return; if (iMin < 0 || v < se.y[iMin]) iMin = i; if (iMax < 0 || v > se.y[iMax]) iMax = i; });
      [[iMax, 'max', -8], [iMin, 'min', 16]].forEach(([i, k, dy]) => {
        if (i < 0) return; const cx = X(se.x[i]), cy = Y(se.y[i]);
        s += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="4.5" fill="#fff" stroke="' + se.col + '" stroke-width="2"/>';
        if (series.length <= 3) s += '<text x="' + Math.min(L + w - 4, Math.max(L + 4, cx)).toFixed(1) + '" y="' + Math.min(T + h - 3, Math.max(T + 10, cy + dy)).toFixed(1) + '" text-anchor="middle" font-size="11" fill="' + se.col + '" ' + F + ' paint-order="stroke" stroke="#fff" stroke-width="3">' + k + ' ' + num(se.y[i]) + '</text>';
      });
    }
  });
  if (o.now !== undefined && o.now >= x0 && o.now <= x1) s += '<line x1="' + X(o.now) + '" x2="' + X(o.now) + '" y1="' + T + '" y2="' + (T + h) + '" stroke="#c0264d" stroke-width="1.5"/>';
  svg.innerHTML = s;
  svg.onclick = o.onPick ? (ev) => { const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) / r.width * W; o.onPick(x0 + (px - L) / w * (x1 - x0)); } : null;
}

export function legend(items) {
  return '<div class="legend">' + items.map((it) => '<span><span class="key" style="border-color:' + it.col + (it.dash ? ';border-top-style:dashed' : '') + '"></span>' + esc(it.name) + '</span>').join('') + '</div>';
}

// SVG -> PNG download (used by the export module)
export function svgToPng(svg, scale) {
  return new Promise((res) => {
    const vb = svg.getAttribute('viewBox').split(' ').map(Number), W = vb[2] * (scale || 2), H = vb[3] * (scale || 2);
    const xml = new XMLSerializer().serializeToString(svg).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" ');
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').drawImage(img, 0, 0, W, H); c.toBlob(res); };
    img.onerror = () => res(null);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  });
}
