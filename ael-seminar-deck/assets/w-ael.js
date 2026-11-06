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
  // crouch (0 standing, 1 lowest) and lift (flight height, px)
  function pose(t) {
    var c = 0, lift = 0, toe = 0;
    if (t < 1.0) c = 0;
    else if (t < 1.4) c = sstep(0, 0.55, (t - 1.0) / 0.4);
    else if (t < REL) c = sstep(0.55, 1, (t - 1.4) / 0.22);
    else if (t < TO) { c = sstep(1, 0, (t - REL) / 0.26); toe = sstep(0, 1, (t - 1.8) / 0.1); }
    else if (t < TD) { var u = (t - TO) / (TD - TO); lift = 4 * 95 * u * (1 - u); toe = u < 0.8 ? 1 : sstep(1, 0, (u - 0.8) / 0.2); }
    else if (t < 2.62) c = sstep(0, 0.5, (t - TD) / 0.22);
    else c = sstep(0.5, 0, (t - 2.62) / 0.6);
    return { c: c, lift: lift, toe: toe };
  }
  W.aeljump = function (el) {
    var cond = 'AEL', L = 0.3, t = 0, playing = false, speed = 0.3, raf = null, last = 0;
    var row = hx('div', 'row', null, el); row.style.gap = '24px';
    var left = hx('div', null, null, row); left.style.flex = '0 0 470px';
    var right = hx('div', 'col', null, row);
    var s = D.svgRoot(left, 470, 600, 'Animated participant performing the jump on a force plate');
    var PY = 520, FX = 215;
    sv('rect', { x: 0, y: PY + 22, width: 470, height: 26, fill: '#e3e8ea' }, s);
    var dbG = sv('g', {}, s);            // dumbbells, drawn behind the plate once dropped
    sv('rect', { x: 95, y: PY, width: 280, height: 26, rx: 4, fill: '#5a6b72', stroke: '#33444c', 'stroke-width': 2 }, s);
    txt(s, 235, PY + 18, 'FORCE PLATE', { 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 800, fill: '#ffffff', 'letter-spacing': 2 });
    var fig = sv('g', {}, s);
    var plateDb = sv('g', {}, s);        // dumbbells while held, drawn in front of the body
    var tag = txt(s, 235, 594, '', { 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 800, fill: C.ink });
    var sub = txt(s, 235, 40, '', { 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700, fill: C.muted });
    function seg(a, b, w, col) { return sv('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: col || '#24343b', 'stroke-width': w, 'stroke-linecap': 'round' }, fig); }
    function at(p, len, ang) { return [p[0] + len * Math.sin(ang), p[1] - len * Math.cos(ang)]; }
    function lerpP(a, b, u) { return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; }
    function dumbbell(g, p, scale) {
      var w = 30 + 22 * scale, hgt = 18 + 10 * scale;
      sv('rect', { x: p[0] - w / 2, y: p[1] - hgt / 2, width: w, height: hgt, rx: 5, fill: '#3b4a52', stroke: '#1d2b33', 'stroke-width': 2 }, g);
      sv('rect', { x: p[0] - w / 2 - 4, y: p[1] - hgt / 2 - 4, width: 8, height: hgt + 8, rx: 3, fill: '#1d2b33' }, g);
      sv('rect', { x: p[0] + w / 2 - 4, y: p[1] - hgt / 2 - 4, width: 8, height: hgt + 8, rx: 3, fill: '#1d2b33' }, g);
    }
    function armPose(sh, hip, lean, mode, tt) {
      if (mode === 'hips') {
        var hand = [hip[0] + 4, hip[1] - 6];
        var elbow = [(sh[0] + hip[0]) / 2 - 30, (sh[1] + hip[1]) / 2];
        return { elbow: elbow, hand: hand };
      }
      var th = 0;   // arm angle from hanging straight down; positive = forward and up
      if (mode === 'swing') {
        if (tt < 1.0) th = 0;
        else if (tt < REL) th = sstep(0, -1.0, (tt - 1.0) / (REL - 1.0));
        else if (tt < TO) th = sstep(-1.0, 2.9, (tt - REL) / (TO - REL));
        else if (tt < TD) th = 2.9;
        else th = sstep(2.9, 0, (tt - TD) / 0.5);
      }
      var d = [Math.sin(th), Math.cos(th)];
      return { elbow: [sh[0] + 58 * d[0], sh[1] + 58 * d[1]], hand: [sh[0] + 110 * d[0], sh[1] + 110 * d[1]] };
    }
    function skel(tt) {
      var p = pose(tt), c = p.c, ankle = [FX, PY - 10 - p.lift];
      var aS = 0.62 * c, aT = -1.45 * c, aTr = 0.72 * c;
      var knee = at(ankle, 82, aS), hip = at(knee, 86, aT), sh = at(hip, 102, aTr);
      return { ankle: ankle, toe: p.toe, knee: knee, hip: hip, sh: sh, head: at(sh, 30, aTr), aTr: aTr };
    }
    function draw() {
      D.clear(fig); D.clear(plateDb); D.clear(dbG);
      var k = skel(t), ankle = k.ankle, knee = k.knee, hip = k.hip, sh = k.sh, head = k.head, aTr = k.aTr;
      var heel = [ankle[0] - 14, ankle[1] + 8], toeP = [ankle[0] + 34, ankle[1] + 8 + k.toe * 14];
      // arms: which pose
      var held = cond === 'AEL' || cond === 'LOADED';
      var released = cond === 'AEL' && t >= REL;
      var arm;
      if (cond === 'NAS') arm = armPose(sh, hip, aTr, 'hips', t);
      else if (cond === 'AS') arm = armPose(sh, hip, aTr, 'swing', t);
      else if (cond === 'LOADED') arm = armPose(sh, hip, aTr, 'down', t);
      else {
        var down = armPose(sh, hip, aTr, 'down', t), hips = armPose(sh, hip, aTr, 'hips', t);
        var u = released ? D.clamp((t - REL) / 0.14, 0, 1) : 0;
        arm = { elbow: lerpP(down.elbow, hips.elbow, u), hand: lerpP(down.hand, hips.hand, u) };
      }
      seg(heel, toeP, 9); seg(ankle, knee, 14); seg(knee, hip, 16);
      seg(hip, sh, 20, '#2f5d74');
      seg(sh, arm.elbow, 10); seg(arm.elbow, arm.hand, 9);
      sv('circle', { cx: head[0], cy: head[1], r: 21, fill: '#f2d2b6', stroke: '#24343b', 'stroke-width': 4 }, fig);
      var scale = (L - 0.2) / 0.2;
      if (held && !released) dumbbell(plateDb, [arm.hand[0], arm.hand[1] + 8], scale);
      if (released) {
        // the dumbbells drop beside the plate (to the participant's sides), not onto it
        var k0 = skel(REL), from = armPose(k0.sh, k0.hip, k0.aTr, 'down', REL).hand, fall = t - REL;
        var hy = Math.min(PY + 36, from[1] + 8 + 0.5 * 2600 * fall * fall);
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
