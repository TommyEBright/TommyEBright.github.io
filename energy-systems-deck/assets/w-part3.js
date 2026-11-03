/* Part 3 and 4 widgets: fuel map, Krebs cycle, electron transport chain, ATP tally, fuel stores,
   lipolysis, beta oxidation, Romijn fuel use, RER calculator. */
(function () {
  'use strict';
  var D = window.DV, C = D.C, sv = D.sv, txt = D.txt, hx = D.hx, btn = D.btn;
  var W = window.DeckWidgets;

  /* ---------- every fuel ends up as ATP ---------- */
  W.fuelmap = function (el) {
    var s = D.svgRoot(el, 1320, 500, 'Map of energy pathways from creatine, carbohydrate, protein and fat to ATP');
    var ah = D.arrowHead(s, D.id('fm'), '#9aa9af', 22);
    sv('rect', { x: 600, y: 262, width: 710, height: 200, rx: 30, fill: '#eaf5fb', stroke: C.aer, 'stroke-width': 3 }, s);
    txt(s, 1300, 492, 'Mitochondria: needs oxygen (aerobic)', { 'text-anchor': 'end', 'font-size': 18, 'font-weight': 800, fill: C.aer });
    txt(s, 20, 300, 'No oxygen needed', { 'font-size': 18, 'font-weight': 800, fill: C.gly });
    txt(s, 20, 322, '(anaerobic)', { 'font-size': 18, 'font-weight': 800, fill: C.gly });
    var N = {
      cr: [110, 34, 'Creatine (PCr)', C.pcr], cho: [430, 34, 'Carbohydrate', C.cho], pro: [790, 34, 'Protein', C.pro], fat: [1150, 34, 'Fat', C.fat],
      glu: [430, 122, 'Glucose / glycogen', C.cho], aa: [790, 122, 'Amino acids', C.pro], ffa: [1150, 122, 'Fatty acids + glycerol', C.fat],
      gly: [430, 212, 'Glycolysis', C.gly], lac: [215, 212, 'Lactate', C.gly],
      acoa: [790, 312, 'Acetyl-CoA', C.aer], beta: [1150, 312, 'Beta oxidation', C.fat],
      krebs: [790, 412, 'Krebs cycle', C.aer], etc: [1110, 412, 'Electron transport chain', C.aer],
      atp: [130, 440, 'ATP', C.amber]
    };
    var E = [
      ['cr', 'atp', 'cr', 'M110,60 V412'],
      ['cho', 'glu', 'cho'], ['glu', 'gly', 'cho'], ['gly', 'lac', 'cho', 'M355,212 H292'],
      ['gly', 'atp', 'cho', 'M400,238 L190,420'], ['gly', 'acoa', 'cho', 'M480,238 L720,300'],
      ['pro', 'aa', 'pro'], ['aa', 'acoa', 'pro'], ['aa', 'gly', 'pro', 'M715,130 L507,204'], ['aa', 'krebs', 'pro', 'M865,132 Q930,270 866,396'],
      ['fat', 'ffa', 'fat'], ['ffa', 'beta', 'fat'], ['beta', 'acoa', 'fat', 'M1070,312 H868'], ['ffa', 'gly', 'fat', 'M1020,140 Q760,178 507,218'],
      ['acoa', 'krebs', 'cho pro fat'], ['krebs', 'etc', 'cho pro fat', 'M866,412 H950'], ['krebs', 'atp', 'cho pro fat', 'M712,420 L202,440'],
      ['etc', 'atp', 'cho pro fat', 'M1110,438 Q1110,470 1000,470 L202,452']
    ];
    var eg = sv('g', {}, s), ng = sv('g', {}, s);
    var edges = E.map(function (e) {
      var a = N[e[0]], b = N[e[1]];
      var d = e[3] || ('M' + a[0] + ',' + (a[1] + 26) + ' L' + b[0] + ',' + (b[1] - 28));
      var p = sv('path', { d: d, fill: 'none', stroke: '#b7c4c9', 'stroke-width': 4, 'marker-end': ah }, eg);
      p.dataset.f = e[2]; return p;
    });
    var nodes = {};
    Object.keys(N).forEach(function (k) {
      var n = N[k], w = k === 'atp' ? 140 : Math.max(150, n[2].length * 11.5 + 30), top = ['cr', 'cho', 'pro', 'fat'].indexOf(k) > -1, solid = top || k === 'atp';
      var g = sv('g', { transform: 'translate(' + n[0] + ',' + n[1] + ')' }, ng);
      sv('rect', { x: -w / 2, y: -26, width: w, height: 52, rx: 14, fill: solid ? n[3] : '#fff', stroke: n[3], 'stroke-width': 3 }, g);
      txt(g, 0, k === 'atp' ? 10 : 8, n[2], { 'text-anchor': 'middle', 'font-size': k === 'atp' ? 28 : 20, 'font-weight': 800, fill: solid ? '#fff' : n[3] });
      if (top) { g.style.cursor = 'pointer'; g.setAttribute('tabindex', 0); g.setAttribute('role', 'button'); g.setAttribute('aria-label', 'Show the route for ' + n[2]); }
      nodes[k] = g;
    });
    var bar = hx('div', 'row', null, el); bar.style.cssText = 'gap:14px;align-items:center;margin-top:8px';
    var all = btn('Show all routes', bar, 'sm');
    var note = hx('div', 'note-box', '', bar); note.style.cssText = 'flex:1;min-height:0;padding:8px 14px';
    var info = {
      cr: '<b>ATP–PC:</b> PCr gives its phosphate straight to ADP. One step, no oxygen.',
      cho: '<b>Carbohydrate:</b> glycolysis makes a little ATP fast (and lactate if pyruvate builds up), then acetyl-CoA feeds the Krebs cycle.',
      pro: '<b>Protein:</b> amino acids can enter at several points. Usually under 5–10% of the energy in exercise.',
      fat: '<b>Fat:</b> fatty acids go through beta oxidation to acetyl-CoA; glycerol can enter glycolysis.'
    };
    function pick(f) {
      edges.forEach(function (p) { var on = !f || p.dataset.f.split(' ').indexOf(f) > -1; p.setAttribute('stroke', on && f ? N[f][3] : '#b7c4c9'); p.setAttribute('stroke-width', on && f ? 7 : 4); p.style.opacity = on ? 1 : 0.15; });
      note.innerHTML = f ? info[f] : 'Click a fuel at the top. Every route meets at <b>acetyl-CoA</b> and the <b>Krebs cycle</b>, the hub of metabolism.';
    }
    ['cr', 'cho', 'pro', 'fat'].forEach(function (k) {
      nodes[k].addEventListener('click', function () { pick(k); });
      nodes[k].addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); pick(k); } });
    });
    all.addEventListener('click', function () { pick(null); });
    pick(null);
  };

  /* ---------- Krebs cycle, one step at a time ---------- */
  W.krebs = function (el) {
    var M = [
      ['Oxaloacetate', 4], ['Citrate', 6], ['Isocitrate', 6], ['α-Ketoglutarate', 5], ['Succinyl-CoA', 4], ['Succinate', 4], ['Fumarate', 4], ['Malate', 4]
    ];
    var S = [
      [[], 'Acetyl-CoA (2 carbons) joins oxaloacetate (4 carbons) to make <b>citrate</b> (6 carbons). Enzyme: citrate synthase.'],
      [[], 'Citrate is rearranged into <b>isocitrate</b>. Same 6 carbons.'],
      [['NADH', 'CO₂'], 'Isocitrate → <b>α-ketoglutarate</b>. One carbon leaves as CO₂ and NAD⁺ picks up hydrogen.'],
      [['NADH', 'CO₂'], 'α-Ketoglutarate → <b>succinyl-CoA</b>. A second CO₂ and another NADH.'],
      [['ATP'], 'Succinyl-CoA → <b>succinate</b>. One ATP is made directly (as GTP).'],
      [['FADH₂'], 'Succinate → <b>fumarate</b>. FAD picks up hydrogen to become FADH₂.'],
      [[], 'Fumarate + water → <b>malate</b>.'],
      [['NADH'], 'Malate → <b>oxaloacetate</b>. A third NADH, and the cycle is ready to turn again.']
    ];
    var col = { NADH: C.green, 'CO₂': C.faint, ATP: C.amber, 'FADH₂': C.teal };
    var row = hx('div', 'row', null, el); row.style.cssText = 'gap:30px';
    var left = hx('div', null, null, row); left.style.flex = '0 0 720px';
    var right = hx('div', 'col', null, row);
    var s = D.svgRoot(left, 720, 580, 'Krebs cycle with eight molecules arranged in a circle');
    var cx = 380, cy = 290, R = 190;
    var ah = D.arrowHead(s, D.id('kc'), C.aer), ahBig = D.arrowHead(s, D.id('kb'), C.aer, 30);
    sv('circle', { cx: cx, cy: cy, r: R, fill: 'none', stroke: '#cfe3ee', 'stroke-width': 18 }, s);
    var hot = sv('path', { fill: 'none', stroke: C.aer, 'stroke-width': 10, 'stroke-linecap': 'round', 'marker-end': ahBig }, s);
    function ang(i) { return -Math.PI / 2 + i / 8 * Math.PI * 2; }
    var mg = M.map(function (m, i) {
      var a = ang(i), x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
      var g = sv('g', { transform: 'translate(' + x + ',' + y + ')' }, s);
      var w = m[0].length * 11 + 34;
      g._r = sv('rect', { x: -w / 2, y: -24, width: w, height: 48, rx: 12, fill: '#fff', stroke: C.aer, 'stroke-width': 3 }, g);
      g._t = txt(g, 0, 7, m[0], { 'text-anchor': 'middle', 'font-size': 19, 'font-weight': 800, fill: C.aer });
      txt(g, 0, 44, m[1] + 'C', { 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 700, fill: C.muted });
      return g;
    });
    var acoa = D.pill(s, 120, 46, 'Acetyl-CoA (2C)', C.aer, { fs: 19 });
    sv('path', { d: 'M196,58 Q300,70 318,88', fill: 'none', stroke: C.aer, 'stroke-width': 4, 'marker-end': ah }, s);
    var outs = sv('g', {}, s);
    var centre = txt(s, cx, cy - 4, 'Krebs cycle', { 'text-anchor': 'middle', 'font-size': 30, 'font-weight': 800, fill: C.aer });
    var centre2 = txt(s, cx, cy + 26, 'in the mitochondrial matrix', { 'text-anchor': 'middle', 'font-size': 17, fill: C.muted });
    var g1 = hx('div', 'btngroup', null, right);
    var nx = btn('Next step ›', g1), rs = btn('Reset', g1, 'ghost');
    var ro = hx('div', 'readouts', null, right); ro.style.marginTop = '14px';
    var rr = { NADH: D.readout(ro, 'NADH', C.green), 'FADH₂': D.readout(ro, 'FADH₂', C.teal), ATP: D.readout(ro, 'ATP', '#a27100'), 'CO₂': D.readout(ro, 'CO₂', C.faint) };
    var note = hx('div', 'note-box', '', right); note.style.cssText = 'margin-top:14px;min-height:120px';
    var tot = hx('div', 'key', '', right); tot.style.cssText = 'margin-top:14px;display:none';
    var stepI = -1, cnt;
    function reset() { stepI = -1; cnt = { NADH: 0, 'FADH₂': 0, ATP: 0, 'CO₂': 0 }; D.clear(outs); render(); }
    function render() {
      mg.forEach(function (g, i) { var on = stepI >= 0 && (i === (stepI + 1) % 8); g._r.setAttribute('fill', on ? C.aer : '#fff'); g._t.setAttribute('fill', on ? '#fff' : C.aer); });
      if (stepI >= 0) {
        var a0 = ang(stepI) + 0.2, a1 = ang(stepI + 1) - 0.24;
        hot.setAttribute('d', 'M' + (cx + Math.cos(a0) * R) + ',' + (cy + Math.sin(a0) * R) + ' A' + R + ',' + R + ' 0 0 1 ' + (cx + Math.cos(a1) * R) + ',' + (cy + Math.sin(a1) * R));
        hot.style.opacity = 1;
      } else hot.style.opacity = 0;
      acoa.style.opacity = stepI <= 0 ? 1 : 0.35;
      Object.keys(rr).forEach(function (k) { rr[k].textContent = cnt[k]; });
      note.innerHTML = stepI < 0 ? 'Press <b>Next step</b> to start a turn of the cycle.' : '<b>Step ' + (stepI + 1) + ' of 8.</b> ' + S[stepI][1];
      tot.style.display = stepI === 7 ? '' : 'none';
      tot.innerHTML = '<div class="lbl">One turn</div>3 NADH, 1 FADH₂, 1 ATP, 2 CO₂. <b>One glucose gives 2 acetyl-CoA</b>, so per glucose: 6 NADH, 2 FADH₂, 2 ATP, 4 CO₂.';
      nx.textContent = stepI === 7 ? 'Go round again ↻' : 'Next step ›';
    }
    nx.addEventListener('click', function () {
      if (stepI === 7) { reset(); }
      stepI++;
      var mid = ang(stepI + 0.5);
      S[stepI][0].forEach(function (p, k) {
        cnt[p]++;
        var nb = S[stepI][0].length, off = (k - (nb - 1) / 2) * 42;
        var rx = cx + Math.cos(mid) * (R + 64) - Math.sin(mid) * off, ry = cy + Math.sin(mid) * (R + 58) + Math.cos(mid) * off;
        D.pill(outs, rx, ry, p, col[p], { fs: 17, color: p === 'ATP' ? C.ink : '#fff' });
      });
      render();
    });
    rs.addEventListener('click', reset);
    reset();
  };

  /* ---------- electron transport chain animation ---------- */
  W.etc = function (el) {
    var row = hx('div', 'row', null, el); row.style.cssText = 'gap:24px';
    var left = hx('div', null, null, row); left.style.flex = '0 0 900px';
    var right = hx('div', 'col', null, row);
    var s = D.svgRoot(left, 900, 560, 'Electron transport chain on the inner mitochondrial membrane, pumping hydrogen ions into the intermembrane space; they flow back through ATP synthase to make ATP');
    var MY = 250, MH = 70; // membrane
    sv('rect', { x: 0, y: 0, width: 900, height: MY, fill: '#fdf0f4' }, s);
    sv('rect', { x: 0, y: MY + MH, width: 900, height: 560 - MY - MH, fill: '#eaf5fb' }, s);
    sv('rect', { x: 0, y: MY, width: 900, height: MH, fill: '#f6e3c8' }, s);
    txt(s, 14, 30, 'Intermembrane space', { 'font-size': 19, 'font-weight': 800, fill: C.gly });
    txt(s, 600, MY + 40, 'Inner membrane', { 'font-size': 14, 'font-weight': 800, fill: '#8a6a3a' });
    txt(s, 14, 548, 'Matrix', { 'font-size': 19, 'font-weight': 800, fill: C.aer });
    var cx = { I: 150, II: 270, III: 400, IV: 560, syn: 760 };
    function complex(x, label, w, col) {
      sv('rect', { x: x - w / 2, y: MY - 40, width: w, height: MH + 80, rx: 22, fill: col, opacity: 0.9 }, s);
      txt(s, x, MY + MH / 2 + 10, label, { 'text-anchor': 'middle', 'font-size': 26, 'font-weight': 800, fill: '#fff' });
    }
    complex(cx.I, 'I', 70, '#b34040'); complex(cx.II, 'II', 54, '#c96f3c'); complex(cx.III, 'III', 70, '#b34040'); complex(cx.IV, 'IV', 70, '#b34040');
    // ATP synthase: stalk, rotor and head
    sv('rect', { x: cx.syn - 34, y: MY - 30, width: 68, height: MH + 60, rx: 18, fill: '#3e86b8' }, s);
    sv('rect', { x: cx.syn - 9, y: MY + MH + 20, width: 18, height: 50, fill: '#3e86b8' }, s);
    var rotor = sv('g', { transform: 'translate(' + cx.syn + ',' + (MY + MH + 100) + ')' }, s);
    sv('circle', { r: 46, fill: '#5aa3d6' }, rotor);
    for (var k = 0; k < 3; k++) sv('line', { x1: 0, y1: 0, x2: Math.cos(k * 2.094) * 40, y2: Math.sin(k * 2.094) * 40, stroke: '#fff', 'stroke-width': 6 }, rotor);
    txt(s, cx.syn, MY - 44, 'ATP synthase', { 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 800, fill: '#2a6a96' });
    var q = sv('circle', { cx: 335, cy: MY + MH / 2, r: 15, fill: C.amber }, s); txt(s, 335, MY + MH / 2 + 6, 'Q', { 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 800 });
    sv('circle', { cx: 480, cy: MY - 30, r: 15, fill: C.amber }, s); txt(s, 480, MY - 24, 'c', { 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 800 });
    txt(s, cx.I, MY + MH + 92, 'NADH → NAD⁺', { 'text-anchor': 'middle', 'font-size': 17, 'font-weight': 800, fill: C.green });
    txt(s, cx.II, MY + MH + 130, 'FADH₂ → FAD', { 'text-anchor': 'middle', 'font-size': 17, 'font-weight': 800, fill: C.teal });
    var o2t = txt(s, cx.IV, MY + MH + 112, '½ O₂ + 2H⁺ → H₂O', { 'text-anchor': 'middle', 'font-size': 17, 'font-weight': 800, fill: C.aer });
    var o2x = txt(s, cx.IV, MY + MH + 142, '', { 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 800, fill: C.red });
    var layer = sv('g', {}, s);
    var css = document.createElement('style'); el.appendChild(css);
    // controls
    var g1 = hx('div', 'btngroup', null, right);
    var go = btn('▶ Play', g1), rs = btn('Reset', g1, 'ghost');
    var g2 = hx('div', 'btngroup', null, right); g2.style.marginTop = '10px';
    var bN = btn('+ NADH', g2, 'sm'), bF = btn('+ FADH₂', g2, 'sm'), bO = btn('Remove oxygen', g2, 'sm');
    var ro = hx('div', 'readouts', null, right); ro.style.marginTop = '14px';
    var rH = D.readout(ro, 'H⁺ pumped out', C.h), rA = D.readout(ro, 'ATP made', '#a27100'), rW = D.readout(ro, 'Water made', C.aer);
    var note = hx('div', 'note-box', '', right); note.style.cssText = 'margin-top:14px;min-height:150px';
    var parts = [], hPool = [], stats, playing = false, raf, last, spawnT, oxygen = true, synAcc = 0, rotA = 0, queue = 0;
    function reset() {
      parts.forEach(function (p) { p.el.remove(); }); hPool.forEach(function (p) { p.el.remove(); });
      parts = []; hPool = []; stats = { h: 0, atp: 0, w: 0 }; spawnT = 0; synAcc = 0; queue = 0;
      for (var i = 0; i < 6; i++) addPoolH();
      paintStats();
    }
    function dot(x, y, r, fill, label) {
      var g = sv('g', { transform: 'translate(' + x + ',' + y + ')' }, layer);
      sv('circle', { r: r, fill: fill }, g);
      if (label) txt(g, 0, 5, label, { 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 800, fill: '#fff' });
      return g;
    }
    function addPoolH() { var x = 60 + Math.random() * 640, y = 50 + Math.random() * (MY - 110); hPool.push({ x: x, y: y, el: dot(x, y, 12, C.h, 'H⁺'), vx: (Math.random() - .5) * 30, vy: (Math.random() - .5) * 30 }); }
    // a particle follows a list of way-points; onArrive callbacks fire at named points
    function path(pts, colour, label, speed, hooks, r) {
      var p = { pts: pts, i: 0, x: pts[0][0], y: pts[0][1], sp: speed, hooks: hooks || {}, el: dot(pts[0][0], pts[0][1], r || 12, colour, label) };
      parts.push(p); return p;
    }
    function pumpH(x, wait) { var p = path([[x, MY + MH + 40], [x, MY - 60]], C.h, 'H⁺', 160, { end: function () { stats.h++; addPoolH(); paintStats(); } }); p.wait = wait || 0; }
    function electron(fromFAD) {
      var y0 = MY + MH + 60, ym = MY + MH / 2;
      var pts = fromFAD ? [[cx.II, y0 + 40], [cx.II, ym], [335, ym], [cx.III, ym], [480, MY - 30], [cx.IV, ym], [cx.IV, y0 + 30]]
        : [[cx.I, y0 + 10], [cx.I, ym], [335, ym], [cx.III, ym], [480, MY - 30], [cx.IV, ym], [cx.IV, y0 + 30]];
      var hooks = {};
      if (!fromFAD) hooks[1] = function () { for (var k = 0; k < 4; k++) pumpH(cx.I - 18 + k * 12, k * 0.09); };
      hooks[3] = function () { for (var k = 0; k < 4; k++) pumpH(cx.III - 18 + k * 12, k * 0.09); };
      hooks[5] = function () { for (var k = 0; k < 2; k++) pumpH(cx.IV - 6 + k * 12, k * 0.09); };
      hooks.end = function () { stats.w++; paintStats(); };
      hooks.gate = 5; // wait here if there is no oxygen
      path(pts, C.e, 'e⁻', 140, hooks, 11);
    }
    function paintStats() { rH.textContent = stats.h; rA.textContent = stats.atp; rW.textContent = stats.w; }
    function tick(now) {
      if (!playing) return;
      if (!D.isCur(el)) { pause(); return; }
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (oxygen) spawnT -= dt;
      if (spawnT <= 0) { electron(Math.random() < 0.25); spawnT = 2.6; }
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        if (p.wait > 0) { p.wait -= dt; continue; }
        if (p.hooks.gate === p.i && !oxygen) { continue; }
        var tg = p.pts[p.i + 1];
        if (!tg) { if (p.hooks.end) p.hooks.end(); p.el.remove(); parts.splice(i, 1); continue; }
        var dx = tg[0] - p.x, dy = tg[1] - p.y, dist = Math.hypot(dx, dy), step = p.sp * dt;
        if (dist <= step) { p.x = tg[0]; p.y = tg[1]; p.i++; if (p.hooks[p.i]) p.hooks[p.i](); }
        else { p.x += dx / dist * step; p.y += dy / dist * step; }
        p.el.setAttribute('transform', 'translate(' + p.x + ',' + p.y + ')');
      }
      // the H+ in the intermembrane space jiggle about; when there are enough, four flow through ATP synthase
      hPool.forEach(function (h) {
        h.x = D.clamp(h.x + h.vx * dt, 30, 860); h.y = D.clamp(h.y + h.vy * dt, 46, MY - 54);
        if (h.x <= 30 || h.x >= 860) h.vx *= -1; if (h.y <= 46 || h.y >= MY - 54) h.vy *= -1;
        h.el.setAttribute('transform', 'translate(' + h.x + ',' + h.y + ')');
      });
      synAcc += dt;
      if (hPool.length > 5 && synAcc > 0.25) {
        synAcc = 0;
        var h = hPool.shift(); h.el.remove();
        path([[h.x, h.y], [cx.syn, MY - 40], [cx.syn, MY + MH + 100]], C.h, 'H⁺', 260, { end: function () { queue++; if (queue >= 4) { queue = 0; stats.atp++; paintStats(); popATP(); } } });
        rotA += 30;
      }
      rotA += dt * (hPool.length > 5 ? 120 : 10);
      rotor.setAttribute('transform', 'translate(' + cx.syn + ',' + (MY + MH + 100) + ') rotate(' + rotA + ')');
      raf = requestAnimationFrame(tick);
    }
    function popATP() { path([[cx.syn + 50, MY + MH + 130], [cx.syn + 110, 540]], C.amber, 'ATP', 120, {}, 22); }
    function pause() { playing = false; go.textContent = '▶ Play'; cancelAnimationFrame(raf); }
    go.addEventListener('click', function () { if (playing) { pause(); return; } playing = true; go.textContent = '❚❚ Pause'; last = performance.now(); raf = requestAnimationFrame(tick); });
    rs.addEventListener('click', function () { pause(); reset(); });
    bN.addEventListener('click', function () { electron(false); if (!playing) go.click(); });
    bF.addEventListener('click', function () { electron(true); if (!playing) go.click(); });
    bO.addEventListener('click', function () {
      oxygen = !oxygen; bO.textContent = oxygen ? 'Remove oxygen' : 'Add oxygen back'; bO.setAttribute('aria-pressed', !oxygen);
      o2t.style.opacity = oxygen ? 1 : 0.25; o2x.textContent = oxygen ? '' : 'No oxygen: electrons back up';
      setNote();
    });
    function setNote() {
      note.innerHTML = oxygen ? '<b>Electrons</b> (yellow) from NADH and FADH₂ pass along complexes I → III → IV. The energy pumps <b>H⁺</b> (pink) into the intermembrane space. H⁺ flows back through <b>ATP synthase</b>, turning it to make ATP. Oxygen takes the electrons at the end and forms water.'
        : '<b>Without oxygen</b> there is nowhere for the electrons to go, so the chain backs up, pumping stops and ATP synthase slows. The cell has to rely on anaerobic glycolysis. (This is also how cyanide kills.)';
    }
    setNote(); reset();
  };

  /* ---------- counting the ATP from one glucose ---------- */
  W.tally = function (el) {
    var st = [
      ['Glycolysis', 'Cytoplasm', 2, 2, 0, C.gly],
      ['Link reaction (2 pyruvate → 2 acetyl-CoA)', 'Mitochondria', 0, 2, 0, C.aer],
      ['Krebs cycle (2 turns)', 'Mitochondria', 2, 6, 2, C.aer]
    ];
    var row = hx('div', 'row', null, el); row.style.cssText = 'gap:30px';
    var left = hx('div', null, null, row); left.style.flex = '0 0 820px';
    var right = hx('div', 'col', null, row);
    var tb = hx('table', 'data', '<thead><tr><th>Stage</th><th>ATP made directly</th><th>NADH</th><th>FADH₂</th><th>ATP total*</th></tr></thead><tbody></tbody><tfoot><tr><td>Total</td><td></td><td></td><td></td><td></td></tr></tfoot>', left);
    tb.style.width = '100%';
    var body = tb.querySelector('tbody'), foot = tb.querySelectorAll('tfoot td');
    hx('p', 'tiny', '*NADH ≈ 2.5 ATP and FADH₂ ≈ 1.5 ATP once they reach the electron transport chain.', left).style.marginTop = '8px';
    var g1 = hx('div', 'btngroup', null, left); g1.style.marginTop = '10px';
    var nx = btn('Add next stage ›', g1), rs = btn('Reset', g1, 'ghost');
    var s = D.svgRoot(right, 440, 470, 'Bar comparing ATP from anaerobic glycolysis with complete aerobic breakdown of glucose');
    var bars = sv('g', {}, s);
    var n = 0;
    function render() {
      body.innerHTML = '';
      var T = [0, 0, 0, 0];
      st.slice(0, n).forEach(function (r) {
        var tot = r[2] + r[3] * 2.5 + r[4] * 1.5;
        T[0] += r[2]; T[1] += r[3]; T[2] += r[4]; T[3] += tot;
        var tr = hx('tr', null, '<td><b style="color:' + r[5] + '">' + r[0] + '</b><div class="tiny">' + r[1] + '</div></td><td>' + r[2] + '</td><td>' + r[3] + '</td><td>' + r[4] + '</td><td><b>' + tot + '</b></td>', body);
      });
      foot[1].textContent = T[0]; foot[2].textContent = T[1]; foot[3].textContent = T[2]; foot[4].textContent = T[3] || '';
      D.clear(bars);
      var y = D.lin(0, 34, 400, 20);
      [[60, 'Anaerobic glycolysis', 2, C.gly], [260, 'Glucose, fully aerobic', T[3], C.aer]].forEach(function (b) {
        sv('rect', { x: b[0], y: y(b[2]), width: 120, height: 400 - y(b[2]), rx: 8, fill: b[3] }, bars);
        txt(bars, b[0] + 60, y(b[2]) - 12, b[2] + ' ATP', { 'text-anchor': 'middle', 'font-size': 26, 'font-weight': 800, fill: b[3] });
        txt(bars, b[0] + 60, 430, b[1], { 'text-anchor': 'middle', 'font-size': 17, 'font-weight': 700, fill: C.ink });
      });
      sv('line', { x1: 30, x2: 420, y1: 400, y2: 400, stroke: C.ink, 'stroke-width': 2 }, bars);
      if (n === 3) txt(bars, 220, 466, '16 times as much ATP per glucose', { 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 800, fill: C.teal });
      nx.disabled = n === 3;
    }
    nx.addEventListener('click', function () { n = Math.min(3, n + 1); render(); });
    rs.addEventListener('click', function () { n = 0; render(); });
    render();
  };

  /* ---------- fuel stores ---------- */
  W.stores = function (el) {
    var S = [['Muscle glycogen', 400, 4, C.cho], ['Liver glycogen', 100, 4, C.cho], ['Blood glucose', 5, 4, C.cho], ['Muscle triglyceride', 300, 9, C.fat], ['Adipose (body) fat', 10800, 9, C.fat]];
    var wrap = hx('div', null, null, el);
    var ctr = hx('div', 'row', null, wrap); ctr.style.cssText = 'gap:24px;align-items:center;margin-bottom:8px';
    var r = D.slider(ctr, 'Body mass', 50, 100, 1, 70, 260);
    var mv = hx('span', null, '', ctr); mv.style.cssText = 'font-size:22px;font-weight:800';
    var zoom = btn('Zoom in on carbohydrate', ctr, 'sm');
    var s = D.svgRoot(wrap, 1320, 340, 'Bar chart comparing carbohydrate and fat stores in kilocalories');
    var g = sv('g', {}, s);
    var ro = hx('div', 'readouts', null, wrap); ro.style.marginTop = '4px';
    var rc = D.readout(ro, 'Carbohydrate', C.cho), rf = D.readout(ro, 'Fat', C.fat), kc = D.readout(ro, 'Carbohydrate gets you', C.cho), kf = D.readout(ro, 'Fat gets you', C.fat);
    var z = false;
    function render() {
      var bm = +r.value; mv.textContent = bm + ' kg';
      var kcal = S.map(function (x) { return x[1] * x[2]; });
      var cho = kcal[0] + kcal[1] + kcal[2], fat = kcal[3] + kcal[4];
      D.clear(g);
      var max = z ? 3000 : 100000, sc = 900 / max;
      S.forEach(function (x, i) {
        var y = 20 + i * 62;
        txt(g, 260, y + 30, x[0], { 'text-anchor': 'end', 'font-size': 21, 'font-weight': 700, fill: x[3] });
        var w = Math.min(980, kcal[i] * sc);
        sv('rect', { x: 280, y: y, width: Math.max(2, w), height: 44, rx: 6, fill: x[3], opacity: i < 3 ? 1 : 0.85 }, g);
        txt(g, 290 + Math.max(2, w), y + 30, kcal[i].toLocaleString('en-GB') + ' kcal' + (w >= 980 ? ' (off the scale)' : ''), { 'font-size': 19, 'font-weight': 700, fill: C.ink });
      });
      rc.textContent = cho.toLocaleString('en-GB') + ' kcal'; rf.textContent = Math.round(fat / 1000) + ',000 kcal';
      kc.textContent = Math.round(cho / bm) + ' km'; kf.textContent = Math.round(fat / bm).toLocaleString('en-GB') + ' km';
      zoom.textContent = z ? 'Show full scale' : 'Zoom in on carbohydrate';
    }
    r.addEventListener('input', render);
    zoom.addEventListener('click', function () { z = !z; render(); });
    hx('p', 'tiny', 'Typical values for a lean 70 kg adult (about 15% body fat). Stores vary with diet, training and body composition; body mass here only changes the running cost.', wrap).style.marginTop = '8px';
    render();
  };

  /* ---------- lipolysis: three enzymes remove three fatty acids ---------- */
  W.lipo = function (el) {
    var EN = [['ATGL', 'adipose triglyceride lipase', 'Diacylglycerol'], ['HSL', 'hormone-sensitive lipase', 'Monoacylglycerol'], ['MGL', 'monoacylglycerol lipase', 'Glycerol']];
    var row = hx('div', 'row', null, el); row.style.cssText = 'gap:30px';
    var left = hx('div', null, null, row); left.style.flex = '0 0 820px';
    var right = hx('div', 'col', null, row);
    var s = D.svgRoot(left, 820, 480, 'A triglyceride: a glycerol backbone with three fatty acid chains');
    sv('rect', { x: 60, y: 90, width: 120, height: 300, rx: 16, fill: C.pro }, s);
    txt(s, 120, 250, 'Glycerol', { 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 800, fill: '#fff', transform: 'rotate(-90 120 250)' });
    var tails = [140, 240, 340].map(function (y, i) {
      var g = sv('g', {}, s);
      var d = 'M180,' + y; for (var k = 0; k < 16; k++) d += ' L' + (200 + k * 26) + ',' + (y + (k % 2 ? 14 : -14));
      sv('path', { d: d, fill: 'none', stroke: C.fat, 'stroke-width': 8, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, g);
      g._l = txt(g, 600, y + 8, 'Fatty acid', { 'font-size': 20, 'font-weight': 800, fill: C.fat });
      g.style.transition = 'transform .8s ease, opacity .8s';
      return g;
    });
    var name = txt(s, 60, 50, 'Triglyceride', { 'font-size': 32, 'font-weight': 800, fill: C.ink });
    var enz = txt(s, 60, 440, '', { 'font-size': 22, 'font-weight': 800, fill: C.teal });
    var ffa = txt(s, 60, 472, '', { 'font-size': 22, 'font-weight': 800, fill: C.fat });
    hx('div', 'ctrl-label', 'Hormones', right);
    var hg = hx('div', 'btngroup', null, right); hg.style.margin = '6px 0 14px';
    var bA = btn('Adrenaline (exercise)', hg, 'sm'), bI = btn('Insulin (after a meal)', hg, 'sm');
    var g1 = hx('div', 'btngroup', null, right);
    var nx = btn('Next enzyme ›', g1), rs = btn('Reset', g1, 'ghost');
    var note = hx('div', 'note-box', '', right); note.style.cssText = 'margin-top:14px;min-height:170px';
    var n = 0, hormone = 'adr';
    function render() {
      tails.forEach(function (t, i) { var gone = i < n; t.style.transform = gone ? 'translateX(60px)' : 'none'; t.style.opacity = gone ? 0.45 : 1; t._l.textContent = gone ? 'Free fatty acid' : 'Fatty acid'; });
      name.textContent = n === 0 ? 'Triglyceride' : EN[n - 1][2];
      enz.textContent = n ? EN[n - 1][0] + ': ' + EN[n - 1][1] : '';
      ffa.textContent = n ? n + ' free fatty acid' + (n > 1 ? 's' : '') + ' released' : '';
      bA.setAttribute('aria-pressed', hormone === 'adr'); bI.setAttribute('aria-pressed', hormone === 'ins');
      nx.disabled = n === 3 || hormone === 'ins';
      if (hormone === 'ins') note.innerHTML = '<b>Insulin switches lipolysis off.</b> After a carbohydrate-rich meal, insulin is high, so fat is stored rather than released. This is one reason eating a lot of carbohydrate just before exercise reduces fat use.';
      else if (n === 0) note.innerHTML = '<b>Adrenaline and noradrenaline</b> (catecholamines) rise in exercise and switch lipolysis on. Press <b>Next enzyme</b>.';
      else if (n < 3) note.innerHTML = '<b>' + EN[n - 1][0] + '</b> removes one fatty acid, leaving <b>' + EN[n - 1][2].toLowerCase() + '</b>.';
      else note.innerHTML = 'Done: <b>glycerol + 3 free fatty acids</b>. The FFA travel in the blood bound to <b>albumin</b> to the muscles. Glycerol goes to the liver, where it can enter glycolysis or be made into glucose.';
    }
    nx.addEventListener('click', function () { n = Math.min(3, n + 1); render(); });
    rs.addEventListener('click', function () { n = 0; render(); });
    bA.addEventListener('click', function () { hormone = 'adr'; render(); });
    bI.addEventListener('click', function () { hormone = 'ins'; render(); });
    render();
  };

  /* ---------- beta oxidation of palmitate ---------- */
  W.betaox = function (el) {
    var s = D.svgRoot(el, 1320, 250, 'Palmitate: a chain of 16 carbons');
    var cs = [], chain = sv('g', {}, s), out = sv('g', {}, s);
    for (var i = 0; i < 16; i++) {
      var g = sv('g', { transform: 'translate(' + (100 + i * 64) + ',' + (i % 2 ? 110 : 70) + ')' }, chain);
      sv('circle', { r: 24, fill: C.fat }, g); txt(g, 0, 7, 'C', { 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 800, fill: '#fff' });
      g.style.transition = 'opacity .4s';
      cs.push(g);
    }
    var bonds = sv('path', { d: cs.map(function (c, i) { return (i ? 'L' : 'M') + (100 + i * 64) + ',' + (i % 2 ? 110 : 70); }).join(' '), stroke: '#c78a4a', 'stroke-width': 6, fill: 'none' }, s);
    s.insertBefore(bonds, chain);
    var lbl = txt(s, 100, 26, 'Palmitate (16 carbons)', { 'font-size': 22, 'font-weight': 800, fill: C.fat });
    var row = hx('div', 'row', null, el); row.style.cssText = 'gap:30px;margin-top:4px';
    var left = hx('div', 'col', null, row), right = hx('div', 'col', null, row);
    var g1 = hx('div', 'btngroup', null, left);
    var ch = btn('✂ Chop 2 carbons', g1), ct = btn('Count the ATP', g1), rs = btn('Reset', g1, 'ghost');
    var ro = hx('div', 'readouts', null, left); ro.style.marginTop = '12px';
    var rp = D.readout(ro, 'Passes', C.ink), ra = D.readout(ro, 'Acetyl-CoA', C.aer), rn = D.readout(ro, 'NADH', C.green), rf = D.readout(ro, 'FADH₂', C.teal);
    var note = hx('div', 'note-box', '', left); note.style.marginTop = '12px';
    var tb = hx('div', null, '', right);
    var n;
    function reset() { n = 0; D.clear(out); tb.innerHTML = ''; ct.disabled = true; render(); }
    function render() {
      cs.forEach(function (c, i) { c.style.opacity = i >= 16 - (n === 7 ? 16 : 2 * n) ? 0.12 : 1; });
      var acoa = n === 7 ? 8 : n;
      rp.textContent = n; ra.textContent = acoa; rn.textContent = n; rf.textContent = n;
      lbl.textContent = n === 7 ? 'Palmitate fully broken down' : 'Fatty acid chain: ' + (16 - 2 * n) + ' carbons left';
      ch.disabled = n === 7; ct.disabled = n < 7;
      note.innerHTML = n === 0 ? 'Each pass removes <b>2 carbons</b> as acetyl-CoA and makes <b>1 NADH and 1 FADH₂</b>.'
        : n < 7 ? 'Pass ' + n + ': ' + (16 - 2 * n) + ' carbons left.'
        : 'After <b>7 passes</b> the last 4 carbons have split into the final two acetyl-CoA: <b>8 acetyl-CoA</b> in total.';
    }
    ch.addEventListener('click', function () {
      if (n >= 7) return;
      n++;
      var k = n === 7 ? 2 : 1;
      for (var j = 0; j < k; j++) { var idx = (n - 1) + j; D.pill(out, 160 + idx * 140, 200, 'Acetyl-CoA', C.aer, { fs: 18 }); }
      render();
    });
    ct.addEventListener('click', function () {
      tb.innerHTML = '<table class="data" style="width:100%;font-size:22px"><thead><tr><th>From</th><th>Worth</th><th>ATP</th></tr></thead><tbody>' +
        '<tr><td>8 acetyl-CoA through the Krebs cycle</td><td>10 each</td><td>80</td></tr>' +
        '<tr><td>7 NADH</td><td>2.5 each</td><td>17.5</td></tr>' +
        '<tr><td>7 FADH₂</td><td>1.5 each</td><td>10.5</td></tr>' +
        '<tr><td>Activating the fatty acid</td><td></td><td>−2</td></tr></tbody>' +
        '<tfoot><tr><td>Net from one palmitate</td><td></td><td>≈ 106</td></tr></tfoot></table><p class="tiny" style="margin-top:6px">Each acetyl-CoA gives 3 NADH, 1 FADH₂ and 1 ATP in the Krebs cycle: 7.5 + 1.5 + 1 = 10 ATP.</p>';
    });
    rs.addEventListener('click', reset);
    reset();
  };

  /* ---------- Romijn et al. (1993): fuel use after 30 min at 25, 65 and 85% VO2max ---------- */
  W.romijn = function (el) {
    var F = [['Plasma glucose', C.glucose], ['Plasma FFA', '#f0b060'], ['Muscle triglyceride', C.fat], ['Muscle glycogen', C.cho]];
    var V = { 25: [10, 70, 7, 0], 65: [15, 60, 50, 80], 85: [40, 45, 35, 177] };
    var shown = {};
    var row = hx('div', 'row', null, el); row.style.cssText = 'gap:30px';
    var left = hx('div', null, null, row); left.style.flex = '0 0 760px';
    var right = hx('div', 'col', null, row);
    var s = D.svgRoot(left, 760, 520, 'Stacked bar chart of energy from plasma glucose, plasma FFA, muscle triglyceride and muscle glycogen at 25, 65 and 85% of VO2max');
    var y = D.lin(0, 300, 440, 30);
    for (var v = 0; v <= 300; v += 100) { sv('line', { x1: 90, x2: 740, y1: y(v), y2: y(v), stroke: C.line }, s); txt(s, 80, y(v) + 7, v, { 'text-anchor': 'end', 'font-size': 18, fill: C.muted }); }
    txt(s, 26, 235, 'Energy (cal/kg/min)', { 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700, transform: 'rotate(-90 26 235)' });
    txt(s, 415, 510, '% of VO₂max', { 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 700 });
    var bars = sv('g', {}, s);
    var leg = hx('div', 'row', null, right); leg.style.cssText = 'flex-wrap:wrap;gap:6px 16px;margin-bottom:12px';
    F.slice().reverse().forEach(function (f) { hx('span', 'small', '<span style="display:inline-block;width:18px;height:18px;border-radius:4px;vertical-align:-3px;margin-right:6px;background:' + f[1] + '"></span>' + f[0], leg); });
    hx('div', 'ctrl-label', 'Predict, then reveal', right);
    var g1 = hx('div', 'btngroup', null, right); g1.style.margin = '6px 0 12px';
    var bs = [25, 65, 85].map(function (k) { var b = btn(k + '% VO₂max', g1, 'sm'); b.addEventListener('click', function () { shown[k] = 1; sel = k; render(); }); return b; });
    var ro = hx('div', 'readouts', null, right);
    var rt = D.readout(ro, 'Total energy', C.ink), rf = D.readout(ro, 'From fat', C.fat), rc = D.readout(ro, 'From carbohydrate', C.cho);
    var note = hx('div', 'note-box', '', right); note.style.marginTop = '12px';
    var sel = null;
    var msgs = { 25: 'Easy exercise: almost all the energy comes from <b>fat in the blood</b> (plasma FFA).', 65: 'Moderate: the most <b>fat</b> burned in absolute terms. Muscle triglyceride and glycogen both join in.', 85: 'Hard: <b>muscle glycogen</b> dominates and total fat use actually <b>falls</b>.' };
    function render() {
      D.clear(bars);
      [25, 65, 85].forEach(function (k, i) {
        var x0 = 150 + i * 200, acc = 0;
        txt(bars, x0 + 50, 470, k + '%', { 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 800 });
        if (!shown[k]) { sv('rect', { x: x0, y: y(120), width: 100, height: 440 - y(120), rx: 6, fill: '#fff', stroke: C.faint, 'stroke-dasharray': '6 6', 'stroke-width': 2 }, bars); txt(bars, x0 + 50, y(60), '?', { 'text-anchor': 'middle', 'font-size': 44, 'font-weight': 800, fill: C.faint }); return; }
        V[k].forEach(function (val, j) { if (!val) return; sv('rect', { x: x0, y: y(acc + val), width: 100, height: y(acc) - y(acc + val), fill: F[j][1], stroke: '#fff', 'stroke-width': 1.5 }, bars); acc += val; });
        txt(bars, x0 + 50, y(acc) - 10, acc, { 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 800 });
        if (k === sel) sv('rect', { x: x0 - 6, y: y(acc) - 34, width: 112, height: 440 - y(acc) + 40, rx: 8, fill: 'none', stroke: C.teal, 'stroke-width': 3 }, bars);
      });
      sv('line', { x1: 90, x2: 740, y1: 440, y2: 440, stroke: C.ink, 'stroke-width': 2 }, bars);
      bs.forEach(function (b, i) { b.setAttribute('aria-pressed', [25, 65, 85][i] === sel); });
      if (sel) {
        var v = V[sel], tot = v[0] + v[1] + v[2] + v[3], fat = v[1] + v[2];
        rt.textContent = tot; rf.textContent = Math.round(fat / tot * 100) + '%'; rc.textContent = Math.round((tot - fat) / tot * 100) + '%';
        note.innerHTML = msgs[sel];
      } else { rt.textContent = rf.textContent = rc.textContent = '–'; note.innerHTML = 'Before revealing: at which intensity do you think the <b>most fat</b> is burned?'; }
    }
    hx('p', 'tiny', 'Redrawn from Romijn et al. (1993), Figure 1; values are approximate readings from the published figure.', right).style.marginTop = '8px';
    render();
  };

  /* ---------- respiratory exchange ratio calculator ---------- */
  W.rer = function (el) {
    var row = hx('div', 'row', null, el); row.style.cssText = 'gap:30px';
    var left = hx('div', null, null, row); left.style.flex = '0 0 560px';
    var right = hx('div', 'col', null, row);
    hx('div', 'card t-cho', '<h3 class="c-cho">Glucose: RER = 1.0</h3><p style="font-family:Cambria Math,Georgia,serif;font-size:22px">C₆H₁₂O₆ + <b>6 O₂</b> → <b>6 CO₂</b> + 6 H₂O + ≈ 32 ATP</p><p>RER = 6 CO₂ ÷ 6 O₂ = <b>1.00</b></p>', left).style.marginBottom = '14px';
    hx('div', 'card t-fat', '<h3 class="c-fat">Fat (palmitate): RER = 0.7</h3><p style="font-family:Cambria Math,Georgia,serif;font-size:22px">C₁₆H₃₂O₂ + <b>23 O₂</b> → <b>16 CO₂</b> + 16 H₂O + ≈ 106 ATP</p><p>RER = 16 CO₂ ÷ 23 O₂ = <b>0.70</b></p>', left);
    var inp = hx('div', 'row', null, right); inp.style.cssText = 'gap:18px;align-items:center;flex-wrap:wrap';
    function num(label, v) {
      var l = hx('label', null, '<span class="ctrl-label">' + label + '</span>', inp); l.style.cssText = 'display:flex;align-items:center;gap:6px';
      var i = hx('input', null, null, l); i.type = 'number'; i.step = '0.05'; i.min = '0.1'; i.max = '7'; i.value = v;
      hx('span', 'small', 'L/min', l);
      return i;
    }
    var iO = num('VO₂', 2.0), iC = num('VCO₂', 1.7);
    var pg = hx('div', 'btngroup', '<span class="ctrl-label" style="align-self:center">Try</span>', right); pg.style.margin = '10px 0';
    [['Rest', 0.30, 0.25], ['Easy jog', 2.0, 1.7], ['Hard run', 3.5, 3.4], ['End of a VO₂max test', 4.2, 4.8]].forEach(function (p) {
      btn(p[0], pg, 'sm').addEventListener('click', function () { iO.value = p[1]; iC.value = p[2]; render(); });
    });
    var s = D.svgRoot(right, 700, 120, 'Scale of RER from 0.70 (all fat) to 1.00 (all carbohydrate)');
    var x = D.lin(0.7, 1.0, 40, 660);
    var grad = sv('linearGradient', { id: D.id('rg') }, sv('defs', {}, s));
    sv('stop', { offset: '0%', 'stop-color': C.fat }, grad); sv('stop', { offset: '100%', 'stop-color': C.cho }, grad);
    sv('rect', { x: 40, y: 40, width: 620, height: 30, rx: 15, fill: 'url(#' + grad.id + ')' }, s);
    [0.7, 0.8, 0.9, 1.0].forEach(function (v) { txt(s, x(v), 98, D.fx(v, 2), { 'text-anchor': 'middle', 'font-size': 18, fill: C.muted }); });
    txt(s, 40, 26, '100% fat', { 'font-size': 17, 'font-weight': 800, fill: C.fat });
    txt(s, 660, 26, '100% carbohydrate', { 'text-anchor': 'end', 'font-size': 17, 'font-weight': 800, fill: C.cho });
    var mk = sv('path', { d: 'M0,0 l-12,-20 h24 z', fill: C.ink }, s);
    var ro = hx('div', 'readouts', null, right); ro.style.marginTop = '12px';
    var rR = D.readout(ro, 'RER', C.ink), rC = D.readout(ro, 'Carbohydrate', C.cho), rF = D.readout(ro, 'Fat', C.fat), rE = D.readout(ro, 'Energy use', C.teal);
    var note = hx('div', 'note-box', '', right); note.style.marginTop = '12px';
    function render() {
      var o = +iO.value, c = +iC.value;
      if (!(o > 0) || !(c > 0)) { rR.textContent = '–'; return; }
      var r = c / o, rc = D.clamp(r, 0.7, 1.0);
      var cho = D.clamp((rc - 0.7) * 340 - 2, 0, 100), kcal = 4.686 + (rc - 0.7) * 1.2033;
      mk.setAttribute('transform', 'translate(' + x(rc) + ',40)');
      rR.textContent = D.fx(r, 2); rC.textContent = Math.round(cho) + '%'; rF.textContent = Math.round(100 - cho) + '%';
      rE.textContent = D.fx(o * kcal, 1) + ' kcal/min';
      note.innerHTML = r > 1.0 ? '<b>RER above 1.0:</b> extra CO₂ is being breathed out as the body buffers acid (H⁺) in very hard exercise. It no longer tells us about fuel. An RER of 1.10 or more is one sign that a VO₂max test was maximal.'
        : r < 0.7 ? '<b>RER below 0.70</b> is outside the normal range for fuel use: check the gas analyser or the numbers.'
        : 'Each litre of O₂ gives about <b>' + D.fx(kcal, 2) + ' kcal</b> at this RER, so energy use = VO₂ × ' + D.fx(kcal, 2) + '. Valid only in steady-state exercise.';
    }
    [iO, iC].forEach(function (i) { i.addEventListener('input', render); });
    hx('p', 'tiny', 'Non-protein RER table values (Zuntz), as reproduced in McArdle et al. (2015).', right).style.marginTop = '8px';
    render();
  };
})();
