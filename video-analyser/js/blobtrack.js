// Reflective marker tracking (no DOM, so it can be tested on its own).
// Each frame: find the bright blobs near where each marker should be, then give each marker the blob
// that best fits its own path and its segment lengths. A blob can only belong to one marker, so a
// marker cannot jump onto another one. If no blob fits, the marker is left as a gap (hidden) and is
// picked up again only when a blob turns up where it should be.
// img: { width, height, data, ch } (ch = 4 for canvas ImageData, 1 for greyscale).

function lumFn(img) {
  const d = img.data, W = img.width, ch = img.ch || 4;
  if (ch === 1) return (x, y) => d[y * W + x];
  return (x, y) => { const i = (y * W + x) * 4; return (d[i] + d[i + 1] + d[i + 1] + d[i + 2]) >> 2; };
}
const med = (a) => { if (!a.length) return 0; const b = a.slice().sort((u, v) => u - v); return b[b.length >> 1]; };

// Bright blobs (pixels brighter than thr) in the box, with their brightness-weighted centres.
export function detect(img, x0, y0, x1, y1, thr) {
  const W = img.width, H = img.height, L = lumFn(img);
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(W - 1, Math.ceil(x1)); y1 = Math.min(H - 1, Math.ceil(y1));
  const w = x1 - x0 + 1, h = y1 - y0 + 1; if (w < 2 || h < 2) return [];
  const v = new Uint8Array(w * h), lab = new Int32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) v[y * w + x] = L(x0 + x, y0 + y);
  const out = [], q = [];
  for (let i = 0; i < w * h; i++) {
    if (v[i] <= thr || lab[i]) continue;
    const id = out.length + 1; lab[i] = id; q.length = 0; q.push(i);
    let sx = 0, sy = 0, sw = 0, n = 0, peak = 0, mnx = w, mxx = 0, mny = h, mxy = 0, edge = false;
    while (q.length) {
      const j = q.pop(), x = j % w, y = (j / w) | 0, wt = v[j] - thr;
      sx += x * wt; sy += y * wt; sw += wt; n++; if (v[j] > peak) peak = v[j];
      if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const k = yy * w + xx; if (v[k] > thr && !lab[k]) { lab[k] = id; q.push(k); }
      }
    }
    out.push({ x: x0 + sx / sw, y: y0 + sy / sw, area: n, peak, len: Math.max(mxx - mnx, mxy - mny) + 1, edge });
  }
  return out;
}

// Looks at a clicked marker: is it a bright marker on a darker background, and how big and bright is it?
// Returns null if it is not (then the template tracker is used for it).
export function describe(img, p, R) {
  const W = img.width, H = img.height, L = lumFn(img), cx = Math.round(p[0]), cy = Math.round(p[1]);
  if (cx - R < 0 || cy - R < 0 || cx + R >= W || cy + R >= H) return null;
  const ring = []; let peak = 0;
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
    const r2 = x * x + y * y, v = L(cx + x, cy + y);
    if (r2 >= (R - 1) * (R - 1)) ring.push(v); else if (r2 <= (R * 0.5) ** 2 && v > peak) peak = v;
  }
  const bg = med(ring);
  if (peak - bg < 40 || peak < 1.5 * bg) return null;
  const thr = bg + 0.4 * (peak - bg);
  const bl = detect(img, cx - R, cy - R, cx + R, cy + R, thr).filter((b) => !b.edge && b.area >= 2);
  if (!bl.length) return null;
  let best = null, bd = 1e9; bl.forEach((b) => { const d = Math.hypot(b.x - p[0], b.y - p[1]); if (d < bd) { bd = d; best = b; } });
  if (bd > R * 0.6 || best.area > Math.PI * R * R * 0.4) return null;
  return { x: best.x, y: best.y, area: best.area, peak: best.peak, bg, thr, r: Math.max(1.5, Math.sqrt(best.area / Math.PI)) };
}

// The tracker. markers: { name: [x, y] } on the start frame. opts: { dir: 1 or -1, links: [[a, b]],
// prev: { name: [x, y] } (the frame before, for a starting velocity), last: { name: { f, p } } (markers not on the start
// frame: where and when last seen), strict: 0..1 (how sure it must be to pick a hidden marker up again), maxHide (frames) }.
// The other bright markers near the tracked ones are followed as well ("helpers"), so a tracked marker cannot take one of them.
export class BlobTracker {
  constructor(img, f0, markers, opts) {
    opts = opts || {};
    this.f = f0; this.f0 = f0; this.dir = opts.dir || 1; this.M = {}; this.hist = {}; this.links = []; this.nh = 0;
    this.strict = opts.strict === undefined ? 0.5 : opts.strict; this.R0 = opts.R0 || 12; this.maxHide = opts.maxHide || 30;
    const names = Object.keys(markers).concat(Object.keys(opts.last || {}).filter((m) => !markers[m]));
    const infos = {};
    Object.keys(markers).forEach((m) => { infos[m] = describe(img, markers[m], this.R0); });
    names.forEach((m) => {
      const here = markers[m], lastSeen = !here && opts.last && opts.last[m];
      const p = here || lastSeen.p;
      let info = here ? infos[m] : null;
      if (!here) { // not on this frame: assume it looks like the nearest marker that is
        let bd = 1e9; Object.keys(infos).forEach((q) => { if (!infos[q]) return; const d = Math.hypot(markers[q][0] - p[0], markers[q][1] - p[1]); if (d < bd) { bd = d; info = Object.assign({}, infos[q]); } });
      }
      const s = this.add(m, here ? (info ? [info.x, info.y] : p.slice()) : null, info, f0);
      if (!here) { s.last = p.slice(); s.lastF = lastSeen.f; s.miss = Math.abs(f0 - lastSeen.f); this.hist[m].set(lastSeen.f, p.slice()); }
      if (here && opts.prev && opts.prev[m]) { s.v = [s.p[0] - opts.prev[m][0], s.p[1] - opts.prev[m][1]]; s.vKnown = true; }
    });
    (opts.links || []).forEach(([a, b]) => { if (this.M[a] && this.M[b] && a !== b) this.links.push({ a, b, Ls: [] }); });
    this.links.forEach((l) => { const pa = this.M[l.a].p, pb = this.M[l.b].p; if (pa && pb) l.Ls.push(Math.hypot(pa[0] - pb[0], pa[1] - pb[1])); });
    const blobs = [];
    this.users().forEach((m) => { const s = this.M[m]; if (s.p) { const R = this.helpR(s); detect(img, s.p[0] - R, s.p[1] - R, s.p[0] + R, s.p[1] + R, s.info.thr).forEach((b) => blobs.push(b)); } });
    this.spawn(blobs, f0);
  }
  add(m, p, info, f, helper) {
    const s = { name: m, helper: !!helper, blob: !!info, info, p, last: p ? p.slice() : null, lastF: f, v: [0, 0], vKnown: false, innov: [], miss: 0, areas: info ? [info.area] : [] };
    this.M[m] = s; this.hist[m] = new Map(); if (p) this.hist[m].set(f, p.slice());
    return s;
  }
  users() { return Object.keys(this.M).filter((m) => this.M[m].blob && !this.M[m].helper); }
  blobNames() { return this.users(); }
  active() { return Object.keys(this.M).filter((m) => this.M[m].blob); }
  info(m) { return this.M[m] && this.M[m].info; }
  Lref(l) { return l.Ls.length >= 3 ? med(l.Ls) : null; }
  r(s) { return s.info ? Math.max(2, s.info.r) : 3; }
  A0(s) { return med(s.areas) || s.info.area; }
  sigma(s) { return s.innov.length >= 3 ? Math.max(1, med(s.innov)) : 2; }
  helpR(s) { return Math.max(40, 12 * this.r(s)); }
  // start following blobs near the tracked markers that nothing is following yet
  spawn(blobs, f) {
    const us = this.users().map((m) => this.M[m]).filter((s) => s.p || s.last);
    // never near where a hidden tracked marker should be: that blob may be the marker coming back
    const hid = us.filter((s) => !s.p && s.miss <= this.maxHide).map((s) => { const P = this.predict(s.name, f + this.dir); return [P, this.gate(s.name) + 2 * this.r(s)]; });
    blobs.forEach((b) => {
      if (b.edge || b.claimed || b.pass) return;
      if (blobs.some((c) => c.claimed && Math.hypot(c.x - b.x, c.y - b.y) < Math.sqrt(c.area / Math.PI) + Math.sqrt(b.area / Math.PI) + 2)) return;
      let near = null, nd = 1e9; us.forEach((s) => { const q = s.p || s.last, d = Math.hypot(q[0] - b.x, q[1] - b.y); if (d < nd) { nd = d; near = s; } });
      if (!near || nd > this.helpR(near) || b.area > 1.6 * this.A0(near) + 4 || b.area < 0.3 * this.A0(near)) return; // marker-sized blobs only (not reflections)
      if (hid.some(([P, g]) => Math.hypot(P[0] - b.x, P[1] - b.y) < g)) return;
      if (this.active().some((m) => { const q = this.M[m].p; return q && Math.hypot(q[0] - b.x, q[1] - b.y) < 2; })) return;
      if (this.active().length > 80) return;
      const h = this.add('\u0000h' + (this.nh++), [b.x, b.y], { bg: near.info.bg, thr: near.info.thr, peak: near.info.peak, area: b.area, r: Math.max(1.5, Math.sqrt(b.area / Math.PI)) }, f, true);
      if (near.p && near.vKnown) { h.v = near.v.slice(); }
    });
  }

  // where marker m should be on frame f
  predict(m, f) {
    const s = this.M[m];
    if (s.p && s.lastF === f - this.dir) return [s.p[0] + s.v[0], s.p[1] + s.v[1]];
    const gap = Math.abs(f - s.lastF);
    if (s.vKnown && gap <= 4) return [s.last[0] + s.v[0] * gap, s.last[1] + s.v[1] * gap]; // a short gap: carry on along its own path
    // hidden for longer: move it with the tracked markers near it (they share the limb's motion)
    let sx = 0, sy = 0, sw = 0;
    this.users().forEach((q) => {
      if (q === m) return; const t = this.M[q]; if (!t.p || t.lastF !== f - this.dir) return;
      const then = this.hist[q].get(s.lastF); if (!then) return;
      const linked = this.links.some((l) => (l.a === m && l.b === q) || (l.b === m && l.a === q));
      const d = Math.hypot(then[0] - s.last[0], then[1] - s.last[1]), w = (linked ? 3 : 1) / (1 + d / (10 * this.r(s)));
      sx += w * (t.p[0] + t.v[0] - then[0]); sy += w * (t.p[1] + t.v[1] - then[1]); sw += w;
    });
    if (sw > 0) return [s.last[0] + sx / sw, s.last[1] + sy / sw];
    const k = Math.min(3, gap);
    return [s.last[0] + s.v[0] * k, s.last[1] + s.v[1] * k];
  }
  gate(m) {
    const s = this.M[m], r = this.r(s), sp = Math.hypot(s.v[0], s.v[1]);
    let G = Math.max(2.5 * r + 3, 4 * this.sigma(s) + 0.35 * sp);
    if (!s.vKnown) G = Math.max(G, 6 * r + 10); // no speed yet (first frame): look further
    if (s.miss) G += r * 1.5 * Math.sqrt(s.miss) + 0.5 * sp;
    return Math.min(G, Math.max(30, 14 * r));
  }

  // Track the next frame. Returns { pos: { m: [x, y] }, hidden: [m], notes: { m: text }, unsure: { m: text } }.
  step(img) {
    const f = this.f + this.dir, users = this.users(), names = this.active(), res = { pos: {}, hidden: [], notes: {}, unsure: {} };
    const pred = {}, G = {}, cand = {}, blobs = [];
    names.forEach((m) => { pred[m] = this.predict(m, f); G[m] = this.gate(m); });
    // bright blobs near every marker being followed (one list, so a blob is the same object for every marker)
    names.forEach((m) => {
      const s = this.M[m], r = this.r(s), P = pred[m], A0 = this.A0(s), R = (s.helper ? G[m] : Math.max(G[m], this.helpR(s))) + 3 * r + 2;
      let tooBig = false;
      [1, 0.6, 1.8].forEach((k, pass) => {
        if (pass === 1 && cand[m] && cand[m].length) return; // a dimmer look only if nothing was found (motion blur)
        if (pass === 2 && !tooBig) return; // a brighter look only if the marker may have merged with a reflection
        const thr = Math.min(s.info.peak - 10, s.info.bg + k * (s.info.thr - s.info.bg));
        detect(img, P[0] - R, P[1] - R, P[0] + R, P[1] + R, thr).forEach((b) => {
          if (Math.hypot(b.x - P[0], b.y - P[1]) < G[m] + 2 * r && b.area > 6 * A0 + 4) tooBig = true;
          if (b.edge) return;
          let o = blobs.find((c) => Math.hypot(c.x - b.x, c.y - b.y) < 1.2);
          if (!o) { o = b; o.id = blobs.length; o.pass = pass; blobs.push(o); }
          const d = Math.hypot(o.x - P[0], o.y - P[1]);
          if (d > G[m] || o.area < 0.2 * A0 || o.area > 6 * A0 + 4 || o.len > Math.max(8 * r, 0.5 * Math.hypot(s.v[0], s.v[1]) + 4 * r)) return;
          if (!(cand[m] || []).some((c) => c.b === o)) (cand[m] = cand[m] || []).push({ b: o, d });
        });
      });
    });
    // segment lengths only help choose between blobs (a marker with one candidate is not penalised by them,
    // because segments look shorter or longer as limbs turn towards or away from the camera)
    const linkRaw = (m, c, P2) => {
      let k = 0; const s = this.M[m];
      this.links.forEach((l) => {
        if (l.a !== m && l.b !== m) return; const q = l.a === m ? l.b : l.a, Lr = this.Lref(l), pq = P2[q];
        if (!Lr || !pq || Lr < 4 * this.r(s)) return;
        const e = (Math.hypot(c.b.x - pq[0], c.b.y - pq[1]) - Lr) / Math.max(0.1 * Lr, 2 * this.r(s));
        k += Math.min(4, 0.5 * e * e);
      });
      return k;
    };
    const cost = (m, c, P2) => {
      const s = this.M[m], dn = c.d / G[m];
      let k = 2 * dn * dn + 0.25 * Math.log((c.b.area + 1) / (this.A0(s) + 1)) ** 2;
      if (P2 && !s.helper) k += linkRaw(m, c, P2) - Math.min(...cand[m].map((x) => linkRaw(m, x, P2)));
      return k;
    };
    // 1: markers followed frame to frame; 2: hidden markers being picked up again and newly found ones,
    // which may only take what is left. Two markers share a blob only if it is big enough for both (they overlap).
    const assign = (P2) => {
      const useA = new Map(), got = {};
      [false, true].forEach((late) => {
        const all = [];
        names.forEach((m) => { const s = this.M[m]; const first = this.f === this.f0; // on the first step every marker (tracked or not) is on an equal footing
          if ((s.miss > 0 || (s.helper && !s.vKnown && !first)) === late) (cand[m] || []).forEach((c) => all.push({ m, c, k: cost(m, c, P2) + (s.helper && !late ? (first ? 0.2 : 0.5) : 0) })); });
        all.sort((a, b) => a.k - b.k);
        const mine = [];
        all.forEach((e) => {
          if (got[e.m]) return;
          const A = this.A0(this.M[e.m]), u = useA.get(e.c.b.id) || 0;
          if (u && (this.M[e.m].helper || u + A > 1.3 * e.c.b.area)) return;
          got[e.m] = e; useA.set(e.c.b.id, u + A); mine.push(e.m);
        });
        // then swap pairs if that fits better overall (e.g. two markers moving fast side by side)
        const ent = (m, b) => all.find((x) => x.m === m && x.c.b === b);
        for (let it = 0, changed = true; changed && it < 4; it++) {
          changed = false;
          for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) {
            const a1 = got[mine[i]], b1 = got[mine[j]]; if (!a1 || !b1 || a1.c.b === b1.c.b) continue;
            const x = ent(mine[i], b1.c.b), y = ent(mine[j], a1.c.b);
            if (x && y && x.k + y.k < a1.k + b1.k - 0.05) { got[mine[i]] = x; got[mine[j]] = y; changed = true; }
          }
        }
      });
      return got;
    };
    let got = assign(null);
    const P2 = {}; users.forEach((m) => { P2[m] = got[m] ? [got[m].c.b.x, got[m].c.b.y] : null; });
    got = assign(P2);
    const claimed = new Set(Object.values(got).map((e) => e.c.b.id));
    if (this.debug) res.dbg = names.map((m) => [m.replace('\u0000', ''), this.M[m].miss, pred[m].map(Math.round), Math.round(G[m]), (cand[m] || []).map((c) => [c.b.id, Math.round(c.b.x), Math.round(c.b.y), c.b.area, Math.round(c.d), +cost(m, c, P2).toFixed(2)]), got[m] ? got[m].c.b.id : null]);
    names.forEach((m) => {
      const s = this.M[m], e = got[m];
      if (s.helper) { // a helper that cannot be found is dropped (it is found again as a new one)
        if (!e) { delete this.M[m]; delete this.hist[m]; return; }
        const np = [e.c.b.x, e.c.b.y]; s.v = [np[0] - s.p[0], np[1] - s.p[1]]; s.vKnown = true; s.p = np; s.lastF = f;
        s.areas.push(e.c.b.area); if (s.areas.length > 8) s.areas.shift(); e.c.b.claimed = true;
        return;
      }
      if (e) {
        // another blob nobody has claimed that fits almost as well: which one is it?
        const alt = (cand[m] || []).filter((c) => c.b !== e.c.b && !claimed.has(c.b.id) && Math.hypot(c.b.x - e.c.b.x, c.b.y - e.c.b.y) > 1.5 * this.r(s)).map((c) => cost(m, c, P2)).sort((a, b) => a - b)[0];
        const margin = alt === undefined ? 9 : alt - e.k;
        const segOff = (tol) => this.links.some((l) => {
          if (l.a !== m && l.b !== m) return false; const q = l.a === m ? l.b : l.a, Lr = this.Lref(l), pq = P2[q];
          return Lr && pq && Math.abs(Math.hypot(e.c.b.x - pq[0], e.c.b.y - pq[1]) - Lr) > tol * Lr + 2 * this.r(s);
        });
        if (s.miss > this.maxHide) { got[m] = null; res.notes[m] = 'hidden too long to pick up again by itself'; }
        else if (s.miss) { // picking a hidden marker up again: be sure
          const hasL = this.links.some((l) => (l.a === m || l.b === m) && this.Lref(l) && P2[l.a === m ? l.b : l.a]);
          // and its segments must be about the length they were (this rejects reflections, e.g. in a treadmill belt)
          const badL = segOff(0.2);
          if (badL || margin < 0.15 + 0.6 * this.strict || (this.strict > 0.3 && !hasL && e.c.d > 0.6 * G[m] && s.miss > 3)) { got[m] = null; res.notes[m] = badL ? 'the only blob there would make a segment the wrong length, so left hidden' : 'could not tell which blob it was, so left hidden'; }
        } else if ((!s.vKnown || s.fresh > 0) && segOff(0.35)) { got[m] = null; res.notes[m] = 'the blob there would make a segment much longer or shorter, so left hidden'; }
        else if (margin < 0.12) res.unsure[m] = 'another blob was almost as close to where it should be';
        if (got[m] && e && e.c.b.area > 2.6 * this.A0(s) && names.some((q) => q !== m && got[q] && got[q].c.b === e.c.b)) res.unsure[m] = 'it overlaps another marker here';
      }
      if (!got[m]) {
        if (!s.miss) res.notes[m] = res.notes[m] || 'not visible (hidden, blurred or merged with something bright)';
        s.miss = (s.miss || 0) + 1; if (s.p) { s.last = s.p; s.lastF = f - this.dir; } s.p = null; res.hidden.push(m);
        return;
      }
      const b = e.c.b, np = [b.x, b.y]; b.claimed = true;
      if (!s.miss && s.p) { s.innov.push(Math.hypot(np[0] - pred[m][0], np[1] - pred[m][1])); if (s.innov.length > 12) s.innov.shift(); s.v = [np[0] - s.p[0], np[1] - s.p[1]]; s.vKnown = true; }
      else {
        const k = Math.max(1, Math.abs(f - s.lastF)); s.v = [(np[0] - s.last[0]) / k, (np[1] - s.last[1]) / k]; s.innov = []; s.vKnown = k <= 2;
        if (s.miss) res.notes[m] = 'picked up again after ' + s.miss + ' frame' + (s.miss > 1 ? 's' : '');
      }
      s.areas.push(b.area); if (s.areas.length > 15) s.areas.shift();
      s.fresh = s.miss ? 3 : Math.max(0, (s.fresh || 0) - 1);
      s.p = np; s.last = np; s.lastF = f; s.miss = 0; this.hist[m].set(f, np);
      res.pos[m] = np;
    });
    this.spawn(blobs, f);
    this.links.forEach((l) => { const a = res.pos[l.a], b = res.pos[l.b]; if (a && b) { l.Ls.push(Math.hypot(a[0] - b[0], a[1] - b[1])); if (l.Ls.length > 40) l.Ls.shift(); } });
    users.forEach((m) => { const h = this.hist[m]; if (h.size > 400) { const k = h.keys().next().value; h.delete(k); } });
    this.f = f;
    return res;
  }
}
