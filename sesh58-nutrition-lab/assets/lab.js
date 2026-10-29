/* SESH58 Nutrition Lab — shared helpers. Everything runs in the browser; nothing is sent anywhere. */
const Lab = (() => {
  const C = { navy: '#003d50', blue: '#0071bc', teal: '#00857e', plum: '#8b3556', amber: '#a85d00', line: '#d9e2e7', muted: '#4a5a62', ink: '#1d1d1b' };

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const num = v => { const n = parseFloat(String(v).replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };
  const fmt = (v, d = 0) => Number.isFinite(v) ? v.toFixed(d) : '–';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const store = {
    get(k, d) { try { const v = localStorage.getItem('sesh58:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('sesh58:' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
    del(k) { try { localStorage.removeItem('sesh58:' + k); } catch (e) { /* ignore */ } }
  };

  // Set up a crisp canvas at its CSS size; returns {ctx, w, h}
  function setup(canvas, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.parentElement.clientWidth || 600;
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr * 1.5); canvas.height = Math.round(h * dpr * 1.5);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr * 1.5, 0, 0, dpr * 1.5, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.font = '13px Arial, Helvetica, sans-serif';
    return { ctx, w, h };
  }

  // Horizontal or vertical bar chart with optional target bands / reference line
  // opts: {title, labels, values, colors, unit, max, bands:[[lo,hi]|null], ref:{value,label}, xLabel, yLabel}
  function bars(canvas, o) {
    const { ctx, w, h } = setup(canvas, o.height || 300);
    const pad = { l: 56, r: 16, t: o.title ? 34 : 14, b: 54 };
    const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
    const vals = o.values;
    let max = o.max || Math.max(1, ...vals, ...(o.bands || []).filter(Boolean).map(b => b[1]), o.ref ? o.ref.value : 0) * 1.15;
    const step = niceStep(max / 5); max = Math.ceil(max / step) * step;
    if (o.title) { ctx.fillStyle = C.navy; ctx.font = 'bold 14px Arial'; ctx.fillText(o.title, pad.l, 20); ctx.font = '13px Arial'; }
    ctx.strokeStyle = C.line; ctx.fillStyle = C.muted; ctx.textAlign = 'right';
    for (let v = 0; v <= max + 1e-9; v += step) {
      const y = pad.t + ph - v / max * ph;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + pw, y); ctx.stroke();
      ctx.fillText(+v.toFixed(2), pad.l - 6, y + 4);
    }
    const n = vals.length, slot = pw / n, bw = Math.min(70, slot * 0.6);
    vals.forEach((v, i) => {
      const x = pad.l + slot * i + (slot - bw) / 2;
      const band = o.bands && o.bands[i];
      if (band) {
        const y1 = pad.t + ph - band[1] / max * ph, y0 = pad.t + ph - band[0] / max * ph;
        ctx.fillStyle = 'rgba(0,133,126,0.14)'; ctx.fillRect(x - 10, y1, bw + 20, y0 - y1);
        ctx.strokeStyle = C.teal; ctx.setLineDash([4, 3]);
        ctx.strokeRect(x - 10, y1, bw + 20, y0 - y1); ctx.setLineDash([]);
      }
      const bh = v / max * ph;
      ctx.fillStyle = (o.colors && o.colors[i]) || C.blue;
      ctx.fillRect(x, pad.t + ph - bh, bw, bh);
      ctx.fillStyle = C.ink; ctx.textAlign = 'center';
      ctx.fillText(fmt(v, o.dp == null ? 1 : o.dp), x + bw / 2, pad.t + ph - bh - 5);
      ctx.fillStyle = C.muted;
      wrapText(ctx, o.labels[i], x + bw / 2, pad.t + ph + 16, slot - 4, 14);
    });
    if (o.ref) {
      const y = pad.t + ph - o.ref.value / max * ph;
      ctx.strokeStyle = C.plum; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + pw, y); ctx.stroke();
      ctx.setLineDash([]); ctx.lineWidth = 1;
      ctx.fillStyle = C.plum; ctx.textAlign = 'right'; ctx.font = 'bold 12px Arial'; ctx.fillText('- - ' + o.ref.label, pad.l + pw, o.title ? 20 : 12); ctx.font = '13px Arial';
    }
    ctx.save(); ctx.translate(14, pad.t + ph / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.fillStyle = C.navy; ctx.fillText(o.yLabel || '', 0, 0); ctx.restore();
    ctx.strokeStyle = C.ink; ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, pad.t + ph); ctx.lineTo(pad.l + pw, pad.t + ph); ctx.stroke();
    ctx.textAlign = 'left';
  }

  // Doughnut with legend: opts {title, labels, values, colors}
  function donut(canvas, o) {
    const { ctx, w, h } = setup(canvas, o.height || 280);
    const total = o.values.reduce((a, b) => a + b, 0) || 1;
    if (o.title) { ctx.fillStyle = C.navy; ctx.font = 'bold 14px Arial'; ctx.fillText(o.title, 14, 20); ctx.font = '13px Arial'; }
    const r = Math.min(h - 70, w * 0.45) / 2, cx = Math.min(w * 0.3, r + 30), cy = 40 + r;
    let a = -Math.PI / 2;
    o.values.forEach((v, i) => {
      const s = v / total * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a, a + s); ctx.closePath();
      ctx.fillStyle = o.colors[i]; ctx.fill(); a += s;
    });
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.fillStyle = C.navy; ctx.textAlign = 'center'; ctx.font = 'bold 15px Arial';
    ctx.fillText(o.centre || '', cx, cy + 5); ctx.font = '13px Arial'; ctx.textAlign = 'left';
    const lx = cx + r + 28;
    o.labels.forEach((l, i) => {
      const y = 50 + i * 24;
      ctx.fillStyle = o.colors[i]; ctx.fillRect(lx, y - 11, 14, 14);
      ctx.fillStyle = C.ink; ctx.fillText(`${l}: ${fmt(o.values[i] / total * 100, 0)}%`, lx + 20, y);
    });
  }

  function wrapText(ctx, text, x, y, maxW, lh) {
    const words = String(text).split(' '); let line = '', yy = y;
    words.forEach(wd => {
      const t = line ? line + ' ' + wd : wd;
      if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, yy); line = wd; yy += lh; } else line = t;
    });
    ctx.fillText(line, x, yy);
  }
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw || 1))), f = raw / p;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  }

  function download(canvas, name) {
    const a = document.createElement('a');
    a.download = name.replace(/[^a-z0-9-]+/gi, '-').toLowerCase() + '.png';
    a.href = canvas.toDataURL('image/png'); a.click();
  }
  function downloadText(text, name, type = 'text/plain') {
    const a = document.createElement('a');
    a.download = name; a.href = URL.createObjectURL(new Blob([text], { type }));
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function copy(text, btn) {
    try { await navigator.clipboard.writeText(text); } catch (e) {
      const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } catch (e2) { /* ignore */ } t.remove();
    }
    if (btn) { const o = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => btn.textContent = o, 1400); }
  }

  // Minimal CSV parser (handles quotes)
  function parseCSV(text) {
    const rows = []; let row = [], cell = '', q = false;
    const sep = (text.split('\n')[0].match(/\t/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? '\t' : ',';
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
      else if (c === '"') q = true;
      else if (c === sep) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(x => x.trim() !== ''));
  }

  return { C, $, $$, num, fmt, esc, store, bars, donut, download, downloadText, copy, parseCSV };
})();
