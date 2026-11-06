/* AEL seminar widgets: load profile (slide 1), animated jump with force trace (slide 2), study design and predictions (slide 3). */
(function () {
  'use strict';
  var D = window.DV, C = D.C, sv = D.sv, txt = D.txt, hx = D.hx, btn = D.btn;
  var W = window.DeckWidgets;
  var COL = { NAS: '#0f8b8d', AS: '#1f8fc4', LOADED: '#9c7b4f', AEL: '#c43c6b' };
  function sstep(a, b, u) { u = D.clamp(u, 0, 1); u = u * u * (3 - 2 * u); return a + (b - a) * u; }

  /* ---------- slide 1: load on the body in each phase ---------- */
  W.loadprofile = function (el) {
    var mode = 'AEL', L = 0.3;
    var bg = hx('div', 'btngroup', null, el);
    var M = [['NORMAL', 'Normal jump'], ['LOADED', 'Dumbbells held (LOADED)'], ['AEL', 'Dumbbells released (AEL)']];
    var mb = M.map(function (m) { var b = btn(m[1], bg, 'sm'); b.addEventListener('click', function () { mode = m[0]; upd(); }); return b; });
    var lr = hx('div', 'btngroup', null, el); lr.style.margin = '8px 0 4px';
    hx('span', 'ctrl-label', 'Dumbbells', lr);
    var lb = [0.2, 0.3, 0.4].map(function (v) { var b = btn(Math.round(v * 100) + '% body weight', lr, 'sm'); b.addEventListener('click', function () { L = v; upd(); }); return b; });
    var s = D.svgRoot(el, 640, 268, 'Load on the body in each phase of the jump');
    var x0 = 70, w = 550, y0 = 8, h = 196, Y = D.lin(0, 1.6, y0 + h, y0);
    var PH = [['Standing', 0, 0.22], ['Lowering\n(eccentric)', 0.22, 0.5], ['Pushing up\n(concentric)', 0.5, 0.78], ['Flight', 0.78, 1]];
    PH.forEach(function (p, i) {
      var xa = x0 + p[1] * w, xb = x0 + p[2] * w;
      sv('rect', { x: xa, y: y0, width: xb - xa, height: h, fill: i % 2 ? '#f2f7f8' : '#ffffff' }, s);
      p[0].split('\n').forEach(function (line, k) { txt(s, (xa + xb) / 2, y0 + h + 24 + k * 19, line, { 'text-anchor': 'middle', 'font-size': 16, 'font-weight': k ? 400 : 700, fill: k ? C.muted : C.ink }); });
    });
    [0, 0.5, 1, 1.5].forEach(function (v) { sv('line', { x1: x0, x2: x0 + w, y1: Y(v), y2: Y(v), stroke: C.line }, s); txt(s, x0 - 8, Y(v) + 6, v.toFixed(1), { 'text-anchor': 'end', 'font-size': 15, fill: C.muted }); });
    txt(s, 20, y0 + h / 2, 'Load (× body weight)', { 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 700, transform: 'rotate(-90 20 ' + (y0 + h / 2) + ')' });
    var ghost = sv('path', { fill: 'none', stroke: C.faint, 'stroke-width': 3, 'stroke-dasharray': '6 5' }, s);
    var line = sv('path', { fill: 'none', 'stroke-width': 6, 'stroke-linejoin': 'round' }, s);
    var rel = sv('g', {}, s);
    var note = hx('div', 'note-box', '', el); note.style.marginTop = '4px';
    function prof(m) {
      var a = m === 'NORMAL' ? 1 : 1 + L, b = m === 'LOADED' ? 1 + L : 1;
      return [[0, a], [0.5, a], [0.5, b], [0.78, b], [0.78, 0], [1, 0]];
    }
    function path(p) { return p.map(function (q, i) { return (i ? 'L' : 'M') + (x0 + q[0] * w).toFixed(1) + ',' + Y(q[1]).toFixed(1); }).join(''); }
    function upd() {
      mb.forEach(function (b, i) { b.setAttribute('aria-pressed', M[i][0] === mode); });
      lb.forEach(function (b, i) { b.setAttribute('aria-pressed', [0.2, 0.3, 0.4][i] === L); b.disabled = mode === 'NORMAL'; });
      ghost.setAttribute('d', path(prof('NORMAL'))); ghost.style.display = mode === 'NORMAL' ? 'none' : '';
      line.setAttribute('d', path(prof(mode))); line.setAttribute('stroke', mode === 'AEL' ? COL.AEL : mode === 'LOADED' ? COL.LOADED : COL.NAS);
      D.clear(rel);
      if (mode === 'AEL') {
        sv('line', { x1: x0 + 0.5 * w, x2: x0 + 0.5 * w, y1: y0, y2: y0 + h, stroke: COL.AEL, 'stroke-width': 2, 'stroke-dasharray': '4 4' }, rel);
        txt(rel, x0 + 0.5 * w + 6, y0 + 20, 'release', { 'font-size': 15, 'font-weight': 800, fill: COL.AEL });
      }
      note.innerHTML = mode === 'NORMAL' ? '<b>Normal jump:</b> the same load (body weight) on the way down and the way up.'
        : mode === 'LOADED' ? '<b>LOADED:</b> ' + Math.round(L * 100) + '% extra on the way down <b>and</b> the way up. Heavier to lower, heavier to lift.'
        : '<b>AEL:</b> ' + Math.round(L * 100) + '% extra on the way down only. The dumbbells are dropped at the lowest point, so the push up is at body weight.';
    }
    upd();
  };

  /* ---------- slide 2: animated jump and force–time trace ---------- */
  var PHASES = [
    { k: 'stand', a: 0, b: 1.0, n: 'Weighing', col: '#e9eef0' },
    { k: 'unw', a: 1.0, b: 1.4, n: 'Unweighting', col: '#dce6fb' },
    { k: 'brake', a: 1.4, b: 1.62, n: 'Braking', col: '#f9e0e0' },
    { k: 'prop', a: 1.62, b: 1.9, n: 'Propulsion', col: '#e3f2df' },
    { k: 'flight', a: 1.9, b: 2.4, n: 'Flight', col: '#fff4d6' },
    { k: 'land', a: 2.4, b: 3.3, n: 'Landing', col: '#efe7f7' }
  ];
  var TEND = 3.3, REL = 1.62, TO = 1.9, TD = 2.4;
  function phaseAt(t) { for (var i = 0; i < PHASES.length; i++) if (t < PHASES[i].b) return i; return PHASES.length - 1; }
  // force in multiples of body weight, for condition c and dumbbell load L
  function force(t, c, L) {
    var held = c === 'LOADED' || c === 'AEL', sys = held ? 1 + L : 1, after = c === 'LOADED' ? 1 + L : 1;
    var peakB = c === 'AEL' ? sys * 2.05 : c === 'LOADED' ? sys * 1.85 : c === 'AS' ? 2.15 : 2.0;
    var prop = c === 'AEL' ? 2.05 : c === 'LOADED' ? sys * 1.75 : c === 'AS' ? 2.2 : 1.95;
    if (t < 1.0) return sys;
    if (t < 1.28) return sstep(sys, sys * 0.42, (t - 1.0) / 0.28);
    if (t < 1.4) return sstep(sys * 0.42, sys, (t - 1.28) / 0.12);
    if (t < 1.58) return sstep(sys, peakB, (t - 1.4) / 0.18);
    if (t < REL) return peakB;
    if (c === 'AEL' && t < REL + 0.03) return sstep(peakB, peakB - L - 0.1, (t - REL) / 0.03);
    var start = c === 'AEL' ? peakB - L - 0.1 : peakB;
    if (t < 1.74) return sstep(start, prop, (t - (c === 'AEL' ? REL + 0.03 : REL)) / 0.1);
    if (t < TO) return sstep(prop, 0, (t - 1.74) / 0.16);
    if (t < TD) return 0;
    var imp = c === 'LOADED' ? sys * 3.4 : 3.8;
    if (t < 2.47) return sstep(0, imp, (t - TD) / 0.07);
    if (t < 2.62) return sstep(imp, after * 1.25, (t - 2.47) / 0.15);
    if (t < 2.9) return sstep(after * 1.25, after * 0.9, (t - 2.62) / 0.28);
    return sstep(after * 0.9, after, (t - 2.9) / 0.3);
  }
  // joint angles (radians from vertical) through the jump: hips lead the extension, heels lift last
  function pose(t) {
    var aS, aT, aTr, pf = 0, lift = 0;
    function crouch(c) { aS = 0.05 + 0.7 * c; aT = -0.02 - 1.33 * c; aTr = 0.05 + 0.7 * c; }
    if (t < 1.0) crouch(0);
    else if (t < 1.4) crouch(sstep(0, 0.55, (t - 1.0) / 0.4));
    else if (t < REL) crouch(sstep(0.55, 1, (t - 1.4) / 0.22));
    else if (t < TO) {
      var u = (t - REL) / (TO - REL);
      aTr = sstep(0.75, 0.05, u / 0.75); aT = sstep(-1.35, -0.02, u / 0.85);
      aS = sstep(0.75, 0.0, (u - 0.1) / 0.9); pf = sstep(0, 0.6, (u - 0.55) / 0.45);
    } else if (t < TD) {
      var f = (t - TO) / (TD - TO); lift = 4 * 95 * f * (1 - f);
      crouch(f < 0.75 ? 0 : sstep(0, 0.08, (f - 0.75) / 0.25)); aS = Math.max(aS, 0.02);
      pf = f < 0.7 ? 0.6 : sstep(0.6, 0.25, (f - 0.7) / 0.3);
    } else if (t < 2.62) { crouch(sstep(0.08, 0.5, (t - TD) / 0.22)); pf = sstep(0.25, 0, (t - TD) / 0.05); }
    else crouch(sstep(0.5, 0, (t - 2.62) / 0.6));
    return { aS: aS, aT: aT, aTr: aTr, pf: pf, lift: lift };
  }
  W.aeljump = function (el) {
    var cond = 'AEL', L = 0.3, t = 0, playing = false, speed = 0.3, raf = null, last = 0;
    var row = hx('div', 'row', null, el); row.style.gap = '24px';
    var left = hx('div', null, null, row); left.style.flex = '0 0 470px';
    var right = hx('div', 'col', null, row);
    var s = D.svgRoot(left, 470, 600, 'Animated Santa performing the jump on a force plate');
    var PY = 520, FX = 215;
    sv('rect', { x: 0, y: PY + 22, width: 470, height: 26, fill: '#e3e8ea' }, s);
    var dbG = sv('g', {}, s);            // dumbbells, drawn behind the plate once dropped
    sv('rect', { x: 95, y: PY, width: 280, height: 26, rx: 4, fill: '#5a6b72', stroke: '#33444c', 'stroke-width': 2 }, s);
    txt(s, 235, PY + 18, 'FORCE PLATE', { 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 800, fill: '#ffffff', 'letter-spacing': 2 });
    var shadow = sv('g', {}, s);
    var fig = sv('g', {}, s);
    var plateDb = sv('g', {}, s);        // dumbbells while held, drawn in front of the body
    var tag = txt(s, 235, 594, '', { 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 800, fill: C.ink });
    var sub = txt(s, 235, 40, '', { 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700, fill: C.muted });
    var SUIT = '#c8102e', SUIT_D = '#8f0b20', FUR = '#ffffff', BOOT = '#1b1b1b', SKIN = '#f3c9a8';
    function at(p, len, ang) { return [p[0] + len * Math.sin(ang), p[1] - len * Math.cos(ang)]; }
    function lerpP(a, b, u) { return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; }
    function rot(v, a) { return [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)]; }
    function add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
    // a tapered body part from joint a (width wa) to joint b (width wb), with rounded ends
    function limb(g, a, b, wa, wb, fill) {
      var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
      var pts = [[a[0] + nx * wa / 2, a[1] + ny * wa / 2], [b[0] + nx * wb / 2, b[1] + ny * wb / 2], [b[0] - nx * wb / 2, b[1] - ny * wb / 2], [a[0] - nx * wa / 2, a[1] - ny * wa / 2]];
      sv('path', { d: 'M' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join('L') + 'Z', fill: fill }, g);
      sv('circle', { cx: a[0], cy: a[1], r: wa / 2, fill: fill }, g);
      sv('circle', { cx: b[0], cy: b[1], r: wb / 2, fill: fill }, g);
    }
    function dumbbell(g, p, scale) {
      var w = 30 + 22 * scale, hgt = 18 + 10 * scale;
      sv('rect', { x: p[0] - w / 2, y: p[1] - 4, width: w, height: 8, rx: 3, fill: '#8a979c' }, g);
      [-1, 1].forEach(function (sgn) {
        var cx = p[0] + sgn * (w / 2 - 6), r = hgt / 2 + 2;
        var hex = [0, 1, 2, 3, 4, 5].map(function (k) { var a = Math.PI / 3 * k + Math.PI / 6; return (cx + r * 0.62 * Math.cos(a)).toFixed(1) + ',' + (p[1] + r * Math.sin(a)).toFixed(1); });
        sv('polygon', { points: hex.join(' '), fill: '#1d2b33', stroke: '#0e1519', 'stroke-width': 1.5 }, g);
      });
    }
    function skel(tt) {
      var p = pose(tt), toeTip = [FX + 34, PY - p.lift];
      var ankle = add(toeTip, rot([-34, -12], p.pf)), heel = add(toeTip, rot([-50, 0], p.pf));
      var knee = at(ankle, 82, p.aS), hip = at(knee, 86, p.aT), sh = at(hip, 102, p.aTr);
      return { toe: toeTip, heel: heel, ankle: ankle, knee: knee, hip: hip, sh: sh, head: at(sh, 32, p.aTr * 0.5), aTr: p.aTr, pf: p.pf, lift: p.lift };
    }
    function armPose(k, mode, tt) {
      var sh = k.sh, hip = k.hip;
      if (mode === 'hips') {
        var mid = lerpP(sh, hip, 0.5);
        return { elbow: [mid[0] - 30, mid[1] + 4], hand: add(hip, [6, -14]) };
      }
      var th = 0;   // upper-arm angle from hanging straight down; positive = forward and up
      if (mode === 'swing') {
        if (tt < 1.0) th = 0;
        else if (tt < REL) th = sstep(0, -1.0, (tt - 1.0) / (REL - 1.0));
        else if (tt < TO) th = sstep(-1.0, 2.9, (tt - REL) / (TO - REL));
        else if (tt < TD) th = 2.9;
        else th = sstep(2.9, 0, (tt - TD) / 0.5);
      }
      var d = [Math.sin(th), Math.cos(th)], bend = mode === 'swing' ? 0.3 : 0.08;
      var elbow = add(sh, [56 * d[0], 56 * d[1]]), d2 = [Math.sin(th + bend), Math.cos(th + bend)];
      return { elbow: elbow, hand: add(elbow, [50 * d2[0], 50 * d2[1]]) };
    }
    function leg(g, k, off, near) {
      var o = function (p) { return add(p, off); };
      var col = near ? SUIT : SUIT_D;
      limb(g, o(k.hip), o(k.knee), 38, 28, col);                       // thigh
      limb(g, o(k.knee), o(lerpP(k.knee, k.ankle, 0.45)), 26, 22, col);  // upper shin (trouser)
      limb(g, o(lerpP(k.knee, k.ankle, 0.4)), o(k.ankle), 24, 20, BOOT); // boot
      var dir = [k.toe[0] - k.heel[0], k.toe[1] - k.heel[1]], n = Math.hypot(dir[0], dir[1]), up = [dir[1] / n * -12, -dir[0] / n * -12];
      var heel = o(k.heel), toe = o(k.toe);
      sv('path', { d: 'M' + heel[0] + ',' + heel[1] + 'L' + toe[0] + ',' + toe[1] + 'Q' + (toe[0] + up[0] * 0.2 + 4) + ',' + (toe[1] + up[1]) + ' ' + (toe[0] + up[0] - 10) + ',' + (toe[1] + up[1] - 2) + 'L' + o(k.ankle)[0] + ',' + (o(k.ankle)[1] - 4) + 'L' + (heel[0] + up[0]) + ',' + (heel[1] + up[1]) + 'Z', fill: BOOT }, g);
    }
    function arm(g, k, a, off, near, gloveOn) {
      var o = function (p) { return add(p, off); }, col = near ? SUIT : SUIT_D;
      limb(g, o(k.sh), o(a.elbow), 20, 17, col);
      limb(g, o(a.elbow), o(lerpP(a.elbow, a.hand, 0.82)), 17, 15, col);
      limb(g, o(lerpP(a.elbow, a.hand, 0.78)), o(lerpP(a.elbow, a.hand, 0.9)), 18, 18, FUR);    // cuff
      if (gloveOn) sv('circle', { cx: o(a.hand)[0], cy: o(a.hand)[1], r: 8.5, fill: near ? '#f4f4f4' : '#d9d9d9', stroke: '#b9b9b9', 'stroke-width': 1 }, g);
    }
    function torso(g, k) {
      var hip = k.hip, sh = k.sh, a = k.aTr, fwd = [Math.cos(a), Math.sin(a)];
      limb(g, hip, sh, 54, 50, SUIT);
      // Santa's belly sits forward of the trunk, a third of the way up
      var bc = add(lerpP(hip, sh, 0.4), [fwd[0] * 16, fwd[1] * 16]);
      sv('ellipse', { cx: bc[0], cy: bc[1], rx: 36, ry: 42, fill: SUIT, transform: 'rotate(' + (a * 180 / Math.PI) + ' ' + bc[0] + ' ' + bc[1] + ')' }, g);
      // fur hem, belt and buckle
      limb(g, add(lerpP(hip, sh, 0.02), [-fwd[0] * 4, -fwd[1] * 4]), add(lerpP(hip, sh, 0.02), [fwd[0] * 40, fwd[1] * 40]), 13, 13, FUR);
      var bl = lerpP(hip, sh, 0.2);
      limb(g, add(bl, [-fwd[0] * 26, -fwd[1] * 26]), add(bl, [fwd[0] * 50, fwd[1] * 50]), 11, 11, BOOT);
      var bk = add(bl, [fwd[0] * 44, fwd[1] * 44]);
      sv('rect', { x: bk[0] - 7, y: bk[1] - 7, width: 14, height: 14, rx: 2, fill: 'none', stroke: '#f2c230', 'stroke-width': 3, transform: 'rotate(' + (a * 180 / Math.PI) + ' ' + bk[0] + ' ' + bk[1] + ')' }, g);
      // fur strip down the front of the jacket
      limb(g, add(lerpP(hip, sh, 0.32), [fwd[0] * 50, fwd[1] * 50]), add(lerpP(hip, sh, 0.92), [fwd[0] * 24, fwd[1] * 24]), 7, 7, FUR);
    }
    function head(g, k) {
      var h = k.head, ang = k.aTr * 0.5, deg = ang * 180 / Math.PI, gg = sv('g', { transform: 'rotate(' + deg + ' ' + h[0] + ' ' + h[1] + ')' }, g);
      limb(gg, [h[0] - 2, h[1] + 30], [h[0], h[1] + 12], 14, 14, SKIN);          // neck
      sv('circle', { cx: h[0], cy: h[1], r: 20, fill: SKIN }, gg);
      sv('circle', { cx: h[0] - 15, cy: h[1] + 2, r: 6, fill: '#e3ad8c' }, gg);   // ear
      sv('path', { d: 'M' + (h[0] - 8) + ',' + (h[1] + 2) + 'Q' + (h[0] - 10) + ',' + (h[1] + 34) + ' ' + (h[0] + 10) + ',' + (h[1] + 40) + 'Q' + (h[0] + 30) + ',' + (h[1] + 30) + ' ' + (h[0] + 24) + ',' + (h[1] + 4) + 'Z', fill: FUR, stroke: '#e6e6e6', 'stroke-width': 1 }, gg);   // beard
      sv('ellipse', { cx: h[0] + 15, cy: h[1] + 6, rx: 11, ry: 5, fill: FUR, stroke: '#e6e6e6', 'stroke-width': 1 }, gg);   // moustache
      sv('circle', { cx: h[0] + 21, cy: h[1] + 1, r: 4, fill: '#e58a7c' }, gg);   // nose
      sv('circle', { cx: h[0] + 11, cy: h[1] - 6, r: 2.4, fill: '#1d2b33' }, gg);  // eye
      sv('path', { d: 'M' + (h[0] + 6) + ',' + (h[1] - 12) + 'Q' + (h[0] + 12) + ',' + (h[1] - 15) + ' ' + (h[0] + 17) + ',' + (h[1] - 11), fill: 'none', stroke: FUR, 'stroke-width': 3, 'stroke-linecap': 'round' }, gg);  // eyebrow
      // hat flopping backwards, with a fur brim and bobble
      sv('path', { d: 'M' + (h[0] - 20) + ',' + (h[1] - 10) + 'Q' + (h[0] - 2) + ',' + (h[1] - 52) + ' ' + (h[0] - 40) + ',' + (h[1] - 30) + 'Q' + (h[0] - 48) + ',' + (h[1] - 22) + ' ' + (h[0] - 46) + ',' + (h[1] - 10) + 'L' + (h[0] - 34) + ',' + (h[1] - 22) + 'Q' + (h[0] - 26) + ',' + (h[1] - 26) + ' ' + (h[0] - 22) + ',' + (h[1] - 12) + 'Z', fill: SUIT }, gg);
      sv('path', { d: 'M' + (h[0] - 20) + ',' + (h[1] - 10) + 'Q' + (h[0] - 4) + ',' + (h[1] - 40) + ' ' + (h[0] + 20) + ',' + (h[1] - 12) + 'Z', fill: SUIT }, gg);
      limb(gg, [h[0] - 22, h[1] - 9], [h[0] + 21, h[1] - 12], 11, 11, FUR);
      sv('circle', { cx: h[0] - 46, cy: h[1] - 8, r: 8, fill: FUR, stroke: '#e6e6e6', 'stroke-width': 1 }, gg);
    }
    function draw() {
      D.clear(fig); D.clear(plateDb); D.clear(dbG); D.clear(shadow);
      var k = skel(t);
      var held = cond === 'AEL' || cond === 'LOADED', released = cond === 'AEL' && t >= REL, a;
      if (cond === 'NAS') a = armPose(k, 'hips', t);
      else if (cond === 'AS') a = armPose(k, 'swing', t);
      else if (cond === 'LOADED') a = armPose(k, 'down', t);
      else {
        var down = armPose(k, 'down', t), hips = armPose(k, 'hips', t), u = released ? D.clamp((t - REL) / 0.14, 0, 1) : 0;
        a = { elbow: lerpP(down.elbow, hips.elbow, u), hand: lerpP(down.hand, hips.hand, u) };
      }
      var sc = Math.max(0.35, 1 - k.lift / 140);
      sv('ellipse', { cx: FX + 8, cy: PY + 2, rx: 48 * sc, ry: 6 * sc, fill: 'rgba(0,0,0,0.25)' }, shadow);
      var far = [-7, -2];
      arm(fig, k, a, far, false, true);
      leg(fig, k, far, false);
      torso(fig, k);
      leg(fig, k, [0, 0], true);
      head(fig, k);
      arm(fig, k, a, [0, 0], true, true);
      var scale = (L - 0.2) / 0.2;
      if (held && !released) { dumbbell(plateDb, [a.hand[0], a.hand[1] + 6], scale); }
      if (released) {
        // the dumbbells drop beside the plate (to Santa's sides), not onto it
        var k0 = skel(REL), from = armPose(k0, 'down', REL).hand, fall = t - REL;
        var hy = Math.min(PY + 36, from[1] + 6 + 0.5 * 2600 * fall * fall);
        dumbbell(dbG, [from[0], hy], scale);
        if (hy >= PY + 36) txt(dbG, 384, PY + 40, 'dropped to the side', { 'font-size': 14, 'font-weight': 700, fill: COL.AEL, 'text-anchor': 'middle' });
      }
      var i = phaseAt(t);
      tag.textContent = PHASES[i].n; sub.textContent = t >= TO && t < TD ? 'feet off the plate' : (cond === 'AEL' && t >= REL && t < REL + 0.25 ? 'dumbbells released!' : '');
    }
    // trace
    var tr = D.svgRoot(right, 820, 300, 'Force–time trace from the force plate');
    var x0 = 60, w = 745, y0 = 10, h = 240, X = D.lin(0, TEND, x0, x0 + w), Y = D.lin(0, 4.4, y0 + h, y0);
    var bands = PHASES.map(function (ph) {
      var r = sv('rect', { x: X(ph.a), y: y0, width: X(ph.b) - X(ph.a), height: h, fill: ph.col, opacity: 0.55 }, tr);
      // braking is a narrow band, so its label sits on a second row
      txt(tr, (X(ph.a) + X(ph.b)) / 2, y0 + h + (ph.k === 'brake' ? 38 : 20), ph.n, { 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 700, fill: C.muted });
      return r;
    });
    [0, 1, 2, 3, 4].forEach(function (v) { sv('line', { x1: x0, x2: x0 + w, y1: Y(v), y2: Y(v), stroke: C.line }, tr); txt(tr, x0 - 8, Y(v) + 5, v, { 'text-anchor': 'end', 'font-size': 14, fill: C.muted }); });
    txt(tr, 16, y0 + h / 2, 'Force (× body weight)', { 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 700, transform: 'rotate(-90 16 ' + (y0 + h / 2) + ')' });
    var bwLine = sv('line', { x1: x0, x2: x0 + w, stroke: C.ink, 'stroke-dasharray': '6 5', 'stroke-width': 1.5 }, tr);
    var bwT = txt(tr, x0 + w - 4, 0, 'body weight', { 'text-anchor': 'end', 'font-size': 13, 'font-weight': 700, fill: C.ink });
    var sysLine = sv('line', { x1: x0, x2: x0 + w, stroke: COL.LOADED, 'stroke-dasharray': '3 4', 'stroke-width': 1.5 }, tr);
    var relG = sv('g', {}, tr);
    var full = sv('path', { fill: 'none', stroke: '#c9d3d6', 'stroke-width': 2 }, tr);
    var done = sv('path', { fill: 'none', stroke: C.red, 'stroke-width': 3.5, 'stroke-linejoin': 'round' }, tr);
    var cur = sv('line', { y1: y0, y2: y0 + h, stroke: C.navy, 'stroke-width': 2 }, tr);
    var dot = sv('circle', { r: 6, fill: C.red, stroke: '#fff', 'stroke-width': 2 }, tr);
    var box = hx('div', 'note-box', '', right); box.style.cssText += ';min-height:118px;margin-top:4px';
    var c1 = hx('div', 'row', null, right); c1.style.cssText = 'gap:14px;align-items:center;margin-top:10px;flex-wrap:wrap';
    var cg = hx('div', 'btngroup', null, c1);
    var CB = [['NAS', 'No arm swing'], ['AS', 'Arm swing'], ['LOADED', 'LOADED'], ['AEL', 'AEL']].map(function (q) {
      var b = btn(q[1], cg, 'sm'); b.addEventListener('click', function () { cond = q[0]; t = 0; render(); }); b.dataset.k = q[0]; return b;
    });
    var lg = hx('div', 'btngroup', null, c1);
    var LB = [0.2, 0.3, 0.4].map(function (v) { var b = btn(Math.round(v * 100) + '%', lg, 'sm'); b.addEventListener('click', function () { L = v; render(); }); return b; });
    var c2 = hx('div', 'btngroup', null, right); c2.style.marginTop = '10px';
    var play = btn('▶ Play', c2), stepB = btn('Step ›', c2, 'sm'), rs = btn('↺ Restart', c2, 'ghost sm'), sp = btn('Slow motion: on', c2, 'ghost sm');
    var TXT = {
      stand: function () { return '<b>Weighing.</b> Standing still' + (cond === 'AEL' || cond === 'LOADED' ? ' holding the dumbbells, so the plate reads body weight <b>plus</b> the dumbbells.' : (cond === 'NAS' ? ' with hands on hips, so the plate reads body weight.' : ', so the plate reads body weight.')) + ' This value is used to work out everything else.'; },
      unw: function () { return '<b>Unweighting.</b> The participant starts to drop. The legs relax, so the force falls <b>below</b> body weight and the body accelerates downwards.'; },
      brake: function () { return '<b>Braking (eccentric).</b> The muscles lengthen under load to slow the drop, so the force rises <b>above</b> body weight.' + (cond === 'AEL' ? ' The dumbbells make this phase heavier: the accentuated eccentric load.' : ''); },
      prop: function () { return cond === 'AEL' ? '<b>Release, then propulsion.</b> At the lowest point the dumbbells are dropped beside the plate, so the force falls by their weight. Hands go to the hips and the participant pushes up at body weight only.' : '<b>Propulsion (concentric).</b> The muscles shorten to push the body up' + (cond === 'AS' ? ', helped by the arm swing.' : cond === 'LOADED' ? ', still carrying the dumbbells.' : '.') + ' The force stays above body weight until take-off.'; },
      flight: function () { return '<b>Flight.</b> Feet off the plate, so the force is <b>zero</b>. Jump height can be calculated from the <b>flight time</b>, or from the <b>take-off velocity</b> found from the force.'; },
      land: function () { return '<b>Landing.</b> A sharp impact peak, then the force settles back to ' + (cond === 'LOADED' ? 'body weight plus the dumbbells.' : 'body weight.') + (cond === 'AEL' || cond === 'NAS' ? ' Hands stay on the hips.' : ''); }
    };
    var lastKey = '';
    function render() {
      CB.forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.k === cond); });
      var held = cond === 'AEL' || cond === 'LOADED';
      LB.forEach(function (b, i) { b.disabled = !held; b.setAttribute('aria-pressed', held && [0.2, 0.3, 0.4][i] === L); });
      var dFull = '', dDone = '';
      for (var tt = 0; tt <= TEND + 1e-6; tt += 0.005) {
        var seg = X(tt).toFixed(1) + ',' + Y(force(tt, cond, L)).toFixed(1);
        dFull += (dFull ? 'L' : 'M') + seg; if (tt <= t) dDone += (dDone ? 'L' : 'M') + seg;
      }
      full.setAttribute('d', dFull); done.setAttribute('d', dDone || 'M0,0');
      cur.setAttribute('x1', X(t)); cur.setAttribute('x2', X(t));
      dot.setAttribute('cx', X(t)); dot.setAttribute('cy', Y(force(t, cond, L)));
      bwLine.setAttribute('y1', Y(1)); bwLine.setAttribute('y2', Y(1)); bwT.setAttribute('y', Y(1) - 6);
      sysLine.style.display = held ? '' : 'none'; sysLine.setAttribute('y1', Y(1 + L)); sysLine.setAttribute('y2', Y(1 + L));
      D.clear(relG);
      if (cond === 'AEL') {
        sv('line', { x1: X(REL), x2: X(REL), y1: y0, y2: y0 + h, stroke: COL.AEL, 'stroke-width': 2, 'stroke-dasharray': '4 3' }, relG);
        txt(relG, X(REL) + 5, y0 + 16, 'dumbbells released', { 'font-size': 13, 'font-weight': 800, fill: COL.AEL });
      }
      var i = phaseAt(t);
      bands.forEach(function (b, k) { b.setAttribute('opacity', k === i ? 0.95 : 0.4); });
      var key = PHASES[i].k + cond + L;
      if (key !== lastKey) { box.innerHTML = TXT[PHASES[i].k]() + '<br><span class="tiny">Illustrative trace and jump height, the same in every condition. The real results are what you will work out.</span>'; lastKey = key; }
      draw();
    }
    function tick(ts) {
      if (!playing) return;
      var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
      if (D.isCur(el)) { t += dt * speed; if (t >= TEND) { t = TEND; stop(); } render(); }
      if (playing) raf = requestAnimationFrame(tick);
    }
    function stop() { playing = false; cancelAnimationFrame(raf); play.textContent = '▶ Play'; }
    play.addEventListener('click', function () {
      if (playing) { stop(); return; }
      if (t >= TEND) t = 0;
      playing = true; last = 0; play.textContent = '❚❚ Pause'; raf = requestAnimationFrame(tick);
    });
    stepB.addEventListener('click', function () { stop(); var i = phaseAt(t); t = i + 1 < PHASES.length ? PHASES[i + 1].a + 0.001 : 0; if (cond === 'AEL' && PHASES[phaseAt(t)].k === 'prop') t = REL + 0.2; render(); });
    rs.addEventListener('click', function () { stop(); t = 0; render(); });
    sp.addEventListener('click', function () { speed = speed < 1 ? 1 : 0.3; sp.textContent = 'Slow motion: ' + (speed < 1 ? 'on' : 'off'); });
    render();
  };

  /* ---------- slide 3: the design, and predictions ---------- */
  W.design = function (el) {
    var CONDS = [
      ['NAS', 'No arm swing', 'Hands on hips throughout. The standard countermovement jump and the comparison for everything else.', 2],
      ['AS', 'Arm swing', 'Free arm swing. Arms are allowed to help, as in most sports.', 2],
      ['AEL_20', 'AEL 20%', 'Dumbbells of about 20% of body weight held on the way down, dropped at the lowest point, hands to hips for take-off.', 1],
      ['AEL_30', 'AEL 30%', 'As AEL 20%, with dumbbells of about 30% of body weight.', 1],
      ['AEL_40', 'AEL 40%', 'As AEL 20%, with dumbbells of about 40% of body weight.', 1],
      ['LOADED_20', 'LOADED 20%', 'The same 20% dumbbells, but <b>held throughout</b>: heavier on the way down and the way up.', 1],
      ['LOADED_30', 'LOADED 30%', 'Held throughout, about 30% of body weight.', 1],
      ['LOADED_40', 'LOADED 40%', 'Held throughout, about 40% of body weight.', 1]
    ];
    var KEY = 'ael-predictions-v1', pred = {};
    try { pred = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { pred = {}; }
    CONDS.forEach(function (c) { if (typeof pred[c[0]] !== 'number') pred[c[0]] = 30; });
    function save() { try { localStorage.setItem(KEY, JSON.stringify(pred)); } catch (e) { /* storage blocked: predictions just aren't kept */ } }
    var row = hx('div', 'row', null, el); row.style.gap = '26px';
    var left = hx('div', null, null, row); left.style.cssText = 'flex:0 0 600px;display:flex;flex-direction:column;gap:10px';
    var right = hx('div', 'col', null, row);
    var facts = hx('div', 'readouts', null, left);
    [['Participants', '39'], ['Conditions', '8'], ['Trials each', '3'], ['Force plates', '1000 Hz']].forEach(function (f) { var v = D.readout(facts, f[0], C.tealD); v.textContent = f[1]; v.style.fontSize = '26px'; v.parentNode.style.cssText += ';min-width:0;flex:1;padding:6px 12px'; });
    facts.style.flexWrap = 'nowrap';
    var grid = hx('div', null, null, left); grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:8px';
    var info = hx('div', 'note-box', '<b>Click a condition</b> to see what the participant did.', left); info.style.minHeight = '92px';
    var tiles = CONDS.map(function (c) {
      var col = c[0] === 'NAS' ? COL.NAS : c[0] === 'AS' ? COL.AS : c[0].indexOf('AEL') === 0 ? COL.AEL : COL.LOADED;
      var b = hx('button', 'chip', '<b style="color:' + col + '">' + c[1] + '</b><br><span style="font-size:14px;color:#4f626b">3 trials' + (c[3] > 1 ? ' × 2 sessions' : '') + '</span>', grid);
      b.type = 'button'; b.style.cssText += ';border-left:6px solid ' + col + ';min-height:62px';
      b.addEventListener('click', function () { tiles.forEach(function (x) { x.classList.remove('sel'); }); b.classList.add('sel'); info.innerHTML = '<b style="color:' + col + '">' + c[1] + ':</b> ' + c[2]; });
      return b;
    });
    var calc = hx('div', 'card t-teal', '<h3 style="font-size:20px">How many rows should your Excel file have?</h3><p style="font-size:18px;margin:0">39 participants × (2 conditions × 2 sessions + 6 conditions) × 3 trials = <b>1170 jumps</b>, one per row.</p>', left);
    calc.style.padding = '12px 16px';
    // predictions
    hx('div', 'ctrl-label', 'Your predictions: mean jump height (cm). Drag the bars.', right);
    var s = D.svgRoot(right, 660, 330, 'Bar chart of your predicted mean jump height for each condition; drag a bar to change it');
    var x0 = 50, w = 600, y0 = 14, h = 250, Y = D.lin(0, 50, y0 + h, y0), bw = w / CONDS.length;
    [0, 10, 20, 30, 40, 50].forEach(function (v) { sv('line', { x1: x0, x2: x0 + w, y1: Y(v), y2: Y(v), stroke: C.line }, s); txt(s, x0 - 8, Y(v) + 5, v, { 'text-anchor': 'end', 'font-size': 14, fill: C.muted }); });
    var bars = CONDS.map(function (c, i) {
      var col = c[0] === 'NAS' ? COL.NAS : c[0] === 'AS' ? COL.AS : c[0].indexOf('AEL') === 0 ? COL.AEL : COL.LOADED;
      var g = sv('g', { tabindex: 0, role: 'slider', 'aria-label': c[1] + ' predicted jump height', 'aria-valuemin': 5, 'aria-valuemax': 50, style: 'cursor:ns-resize' }, s);
      var r = sv('rect', { x: x0 + i * bw + 10, width: bw - 20, rx: 4, fill: col, opacity: 0.85 }, g);
      var hit = sv('rect', { x: x0 + i * bw + 4, y: y0, width: bw - 8, height: h, fill: 'transparent' }, g);
      var v = txt(g, x0 + i * bw + bw / 2, 0, '', { 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 800, fill: C.ink });
      c[1].split(' ').forEach(function (part, k) { txt(s, x0 + i * bw + bw / 2, y0 + h + 20 + k * 17, part, { 'text-anchor': 'middle', 'font-size': 14, 'font-weight': k ? 400 : 700, fill: col }); });
      function setFromY(cy) { pred[c[0]] = Math.round(D.clamp((y0 + h - cy) / h * 50, 5, 50)); upd(); save(); }
      var dragging = false;
      g.addEventListener('pointerdown', function (e) { dragging = true; g.setPointerCapture(e.pointerId); setFromY(D.pt(s, e).y); });
      g.addEventListener('pointermove', function (e) { if (dragging) setFromY(D.pt(s, e).y); });
      g.addEventListener('pointerup', function () { dragging = false; });
      g.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); pred[c[0]] = D.clamp(pred[c[0]] + (e.key === 'ArrowUp' ? 1 : -1), 5, 50); upd(); save(); }
      });
      return { r: r, v: v, g: g, k: c[0] };
    });
    var task = hx('div', 'card t-amber', '<h3 style="font-size:20px">Your task</h3><p style="font-size:18px;margin:0">Work out the real results in Excel: <b>clean</b> the data, find each participant\'s <b>means</b>, <b>describe</b> and <b>graph</b> each condition, then look for <b>relationships</b>. Come back here at the end: how close were you?</p>', right);
    task.style.cssText += ';padding:12px 16px;margin-top:6px';
    var rs = btn('Reset predictions', right, 'ghost sm'); rs.style.marginTop = '8px';
    rs.addEventListener('click', function () { CONDS.forEach(function (c) { pred[c[0]] = 30; }); upd(); save(); });
    function upd() {
      bars.forEach(function (b) {
        var v = pred[b.k]; b.r.setAttribute('y', Y(v)); b.r.setAttribute('height', Y(0) - Y(v));
        b.v.setAttribute('y', Y(v) - 8); b.v.textContent = v; b.g.setAttribute('aria-valuenow', v);
      });
    }
    upd();
  };
})();
