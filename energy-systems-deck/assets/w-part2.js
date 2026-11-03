/* Part 2 widgets: tanks model, ATP/PCr in a sprint, PCr recovery, glycolysis, overlapping systems, Gastin contribution. */
(function () {
  'use strict';
  var D = window.DV, C = D.C, sv = D.sv, txt = D.txt, hx = D.hx, btn = D.btn;
  var W = window.DeckWidgets;

  /* ---------- tanks model (after Margaria and Morton): three tanks refilling one ATP pool ---------- */
  W.tanks = function (el) {
    var LEVELS = [['Rest', 2], ['Steady run', 12], ['Hard run', 22], ['Sprint', 60]];
    var AMAX = 16, GMAX = 26, PMAX = 70;      // maximum rates (ATP units per s)
    var PCAP = 420, GCAP = 1400;              // tank capacities
    var st, playing = false, raf = null, last = 0, demand = 2;
    function reset() { st = { t: 0, pcr: PCAP, gly: GCAP, atp: 100, a: 2, g: 0, p: 0, short: 0 }; }
    reset();
    var row = hx('div', 'row', null, el); row.style.cssText = 'gap:30px';
    var left = hx('div', null, null, row); left.style.flex = '0 0 820px';
    var right = hx('div', 'col', null, row);
    var s = D.svgRoot(left, 820, 520, 'Tanks model: three tanks for PCr, glycolysis and aerobic metabolism flow into an ATP pool that drains into muscle work');
    var tanks = [
      { k: 'pcr', name: 'PCr', x: 40, w: 150, h: 150, col: C.pcr, cap: PCAP },
      { k: 'gly', name: 'Glycolysis', x: 250, w: 190, h: 200, col: C.gly, cap: GCAP },
      { k: 'aer', name: 'Oxidative (CHO + fat)', x: 500, w: 290, h: 250, col: C.aer, cap: 1 }
    ];
    var base = 270;
    tanks.forEach(function (t) {
      t.y = base - t.h;
      sv('rect', { x: t.x, y: t.y, width: t.w, height: t.h, rx: 8, fill: '#fff', stroke: C.ink, 'stroke-width': 3 }, s);
      t.fill = sv('rect', { x: t.x + 3, width: t.w - 6, fill: t.col, opacity: .85 }, s);
      txt(s, t.x + t.w / 2, t.y - 12, t.name, { 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 800, fill: t.col });
      t.pipe = sv('path', { d: 'M' + (t.x + t.w / 2) + ',' + base + ' V330 Q' + (t.x + t.w / 2) + ',350 ' + (t.x + t.w / 2 + (410 - t.x - t.w / 2) * .25) + ',360 L410,372', fill: 'none', stroke: t.col, 'stroke-linecap': 'round', 'stroke-width': 4 }, s);
      t.pipe.style.transition = 'stroke-width .15s';
      t.rate = txt(s, t.x + t.w / 2 + 12, 320, '', { 'font-size': 16, 'font-weight': 700, fill: t.col });
    });
    // ATP pool and the drain into work
    sv('rect', { x: 330, y: 372, width: 160, height: 100, rx: 10, fill: '#fff', stroke: C.ink, 'stroke-width': 3 }, s);
    var atpFill = sv('rect', { x: 333, width: 154, fill: C.amber }, s);
    txt(s, 410, 430, 'ATP', { 'text-anchor': 'middle', 'font-size': 28, 'font-weight': 800 });
    var drain = sv('path', { d: 'M490,440 H620', stroke: C.red, 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round' }, s);
    txt(s, 632, 436, 'Muscle work', { 'font-size': 20, 'font-weight': 800, fill: C.red });
    var dTxt = txt(s, 632, 462, '', { 'font-size': 17, fill: C.red });
    var warn = txt(s, 410, 505, '', { 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 800, fill: C.red });
    var clock = txt(s, 800, 505, '0 s', { 'text-anchor': 'end', 'font-size': 26, 'font-weight': 800, fill: C.ink });
    // controls
    hx('div', 'ctrl-label', 'Exercise intensity', right);
    var g1 = hx('div', 'btngroup', null, right); g1.style.margin = '6px 0 14px';
    var lb = LEVELS.map(function (L, i) {
      var b = btn(L[0], g1, 'sm'); b.setAttribute('aria-pressed', i === 0);
      b.addEventListener('click', function () { demand = L[1]; lb.forEach(function (x, j) { x.setAttribute('aria-pressed', j === i); }); paint(); });
      return b;
    });
    var g2 = hx('div', 'btngroup', null, right);
    var go = btn('▶ Run', g2), rs = btn('Reset', g2, 'ghost');
    var ro = hx('div', 'readouts', null, right); ro.style.marginTop = '14px';
    var rP = D.readout(ro, 'PCr left', C.pcr), rG = D.readout(ro, 'Glycolytic capacity', C.gly);
    var note = hx('div', 'note-box', '', right); note.style.marginTop = '12px';
    function stepSim(dt) {
      var D0 = demand;
      // aerobic supply rises slowly towards demand (oxygen uptake kinetics), and also pays back PCr after hard work
      var debt = (PCAP - st.pcr) / PCAP;
      var aTarget = Math.min(AMAX, D0 + debt * 6);
      st.a += (aTarget - st.a) * (1 - Math.exp(-dt / 20));
      var need = Math.max(0, D0 - st.a);
      // glycolysis responds within a few seconds; PCr covers the rest instantly
      var gTarget = st.gly > 0 ? Math.min(GMAX, need) : 0;
      st.g += (gTarget - st.g) * (1 - Math.exp(-dt / 3));
      need = Math.max(0, need - st.g);
      st.p = st.pcr > 0 ? Math.min(PMAX, need) : 0;
      var supplied = st.a + st.g + st.p;
      st.short = Math.max(0, D0 - supplied);
      st.pcr = Math.max(0, st.pcr - st.p * dt);
      st.gly = Math.max(0, st.gly - st.g * dt * 1.0);
      // spare aerobic supply refills PCr; glycolytic capacity recovers as H+ is cleared
      var spare = Math.max(0, st.a - D0);
      if (st.p <= 0.01) st.pcr = Math.min(PCAP, st.pcr + spare * dt * 7);
      if (st.g < 1) st.gly = Math.min(GCAP, st.gly + (GCAP - st.gly) * (1 - Math.exp(-dt / 90)));
      st.atp = D.clamp(st.atp + (st.short > 0 ? -st.short * dt * 0.6 : (100 - st.atp) * dt * 0.5), 60, 100);
      st.t += dt;
    }
    function paint() {
      tanks.forEach(function (t) {
        var f = t.k === 'pcr' ? st.pcr / PCAP : t.k === 'gly' ? st.gly / GCAP : 0.96;
        var hh = (t.h - 6) * f;
        t.fill.setAttribute('y', base - 3 - hh); t.fill.setAttribute('height', hh);
        var r = t.k === 'pcr' ? st.p : t.k === 'gly' ? st.g : st.a;
        t.pipe.style.strokeWidth = (3 + r * 0.45) + 'px';
        t.pipe.setAttribute('stroke-opacity', r > 0.3 ? 1 : 0.25);
        t.rate.textContent = r > 0.3 ? Math.round(r / (st.a + st.g + st.p) * 100) + '%' : '';
      });
      var ah = 94 * (st.atp / 100);
      atpFill.setAttribute('y', 469 - ah); atpFill.setAttribute('height', ah);
      drain.style.strokeWidth = (3 + demand * 0.4) + 'px';
      dTxt.textContent = 'demand: ' + LEVELS.filter(function (L) { return L[1] === demand; })[0][0].toLowerCase();
      clock.textContent = Math.floor(st.t) + ' s';
      warn.textContent = st.short > 0.5 ? 'Supply can\'t keep up: the athlete must slow down' : '';
      rP.textContent = Math.round(st.pcr / PCAP * 100) + '%';
      rG.textContent = Math.round(st.gly / GCAP * 100) + '%';
      var msg;
      if (demand >= 60) msg = st.pcr > 0 ? '<b>Sprint:</b> the PCr tap is wide open, glycolysis is opening up, aerobic is still slow to respond.' : '<b>PCr is empty.</b> Glycolysis and aerobic supply can\'t match sprint demand, so power drops.';
      else if (demand >= 22) msg = '<b>Hard run:</b> above the aerobic maximum, so glycolysis fills the gap and its capacity runs down as H⁺ builds up.';
      else if (demand >= 12) msg = '<b>Steady run:</b> after a short lag the aerobic tap meets demand on its own.';
      else msg = st.pcr < PCAP * 0.99 ? '<b>Recovery:</b> spare aerobic supply refills the PCr tank. This needs oxygen.' : '<b>Rest:</b> the aerobic system easily meets the small demand.';
      note.innerHTML = msg;
    }
    function loop(now) {
      if (!playing) return;
      if (!D.isCur(el)) { pause(); return; }
      var dt = Math.min(0.1, (now - last) / 1000) * 2; last = now; // runs at double speed
      for (var k = 0; k < 4; k++) stepSim(dt / 4);
      paint();
      raf = requestAnimationFrame(loop);
    }
    function pause() { playing = false; go.textContent = '▶ Run'; cancelAnimationFrame(raf); }
    go.addEventListener('click', function () { if (playing) { pause(); return; } playing = true; go.textContent = '❚❚ Pause'; last = performance.now(); raf = requestAnimationFrame(loop); });
    rs.addEventListener('click', function () { pause(); reset(); paint(); });
    hx('p', 'tiny', 'Time runs at double speed. A teaching model: real energy systems are more tightly linked than taps and tanks.', right).style.marginTop = '8px';
    paint();
  };

  /* ---------- ATP and PCr during a 30 s sprint ---------- */
  W.sprint = function (el) {
    function pcr(t) { return 100 * (0.15 + 0.85 * Math.exp(-t / 12)); }
    function atp(t) { return 100 - 30 * (1 - Math.exp(-t / 15)); }
    function alone(t) { return Math.max(0, 100 - 40 * t); }
    var row = hx('div', 'row', null, el); row.style.cssText = 'gap:30px';
    var left = hx('div', null, null, row); left.style.flex = '0 0 840px';
    var right = hx('div', 'col', null, row);
    var s = D.svgRoot(left, 840, 470, 'Graph of muscle ATP and PCr, as a percentage of resting levels, over a 30 second sprint');
    var x = D.lin(0, 30, 90, 810), y = D.lin(0, 100, 400, 20);
    for (var v = 0; v <= 100; v += 25) { sv('line', { x1: 90, x2: 810, y1: y(v), y2: y(v), stroke: C.line }, s); txt(s, 78, y(v) + 7, v + '%', { 'text-anchor': 'end', 'font-size': 18, fill: C.muted }); }
    for (var t = 0; t <= 30; t += 5) txt(s, x(t), 428, t + ' s', { 'text-anchor': 'middle', 'font-size': 18, fill: C.muted });
    txt(s, 450, 462, 'Time into an all-out sprint', { 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 700 });
    function path(f, a) { var d = ''; for (var t = 0; t <= 30; t += 0.25) d += (t ? 'L' : 'M') + x(t) + ',' + y(f(t)); return sv('path', Object.assign({ d: d, fill: 'none', 'stroke-width': 5 }, a), s); }
    path(alone, { stroke: C.faint, 'stroke-dasharray': '8 7', 'stroke-width': 3 });
    txt(s, x(2.6) + 8, y(8), 'stored ATP alone, if nothing remade it (≈ 2–3 s)', { 'font-size': 17, fill: C.muted, 'font-weight': 700 });
    path(atp, { stroke: C.amber });
    path(pcr, { stroke: C.pcr });
    txt(s, x(30) - 4, y(atp(30)) - 12, 'ATP', { 'text-anchor': 'end', 'font-size': 22, 'font-weight': 800, fill: '#a27100' });
    txt(s, x(30) - 4, y(pcr(30)) - 12, 'PCr', { 'text-anchor': 'end', 'font-size': 22, 'font-weight': 800, fill: C.pcr });
    var cur = sv('line', { y1: 20, y2: 400, stroke: C.ink, 'stroke-width': 2, 'stroke-dasharray': '4 4' }, s);
    var dA = sv('circle', { r: 9, fill: C.amber, stroke: '#fff', 'stroke-width': 3 }, s), dP = sv('circle', { r: 9, fill: C.pcr, stroke: '#fff', 'stroke-width': 3 }, s);
    var r = D.slider(right, 'Time', 0, 30, 0.5, 0, 380);
    var ro = hx('div', 'readouts', null, right); ro.style.marginTop = '14px';
    var rt = D.readout(ro, 'Time', C.ink), ra = D.readout(ro, 'ATP', '#a27100'), rp = D.readout(ro, 'PCr', C.pcr);
    var note = hx('div', 'note-box', '', right); note.style.marginTop = '12px';
    hx('p', 'tiny', 'Approximate values for illustration, based on muscle biopsy studies. They vary between people and with training.', right).style.marginTop = '8px';
    function render() {
      var t = +r.value;
      cur.setAttribute('x1', x(t)); cur.setAttribute('x2', x(t));
      dA.setAttribute('cx', x(t)); dA.setAttribute('cy', y(atp(t)));
      dP.setAttribute('cx', x(t)); dP.setAttribute('cy', y(pcr(t)));
      rt.textContent = D.fx(t, 1) + ' s'; ra.textContent = Math.round(atp(t)) + '%'; rp.textContent = Math.round(pcr(t)) + '%';
      note.innerHTML = t < 3 ? 'Without help, the ATP in muscle would be gone in about <b>2–3 seconds</b>. But it isn\'t.'
        : t < 12 ? 'PCr is being used <b>to keep ATP high</b>. By about 10 s, roughly half the PCr is gone.'
        : 'PCr is now low, so ATP starts to fall and power drops. <b>Glycolysis and the aerobic system</b> now supply most of the ATP.';
    }
    r.addEventListener('input', render);
    render();
  };

  /* ---------- PCr recovery and repeated sprints ---------- */
  W.pcr = function (el) {
    var HALF = 30;
    function rec(t) { return 100 * (1 - Math.pow(0.5, t / HALF)); }
    var row = hx('div', 'row', null, el); row.style.cssText = 'gap:34px';
    var left = hx('div', null, null, row); left.style.flex = '0 0 640px';
    var right = hx('div', 'col', null, row);
    hx('div', 'ctrl-label', 'PCr restored after a sprint that used it all', left);
    var s = D.svgRoot(left, 640, 330, 'Graph of PCr restored against rest time');
    var x = D.lin(0, 300, 70, 620), y = D.lin(0, 100, 280, 20);
    for (var v = 0; v <= 100; v += 25) { sv('line', { x1: 70, x2: 620, y1: y(v), y2: y(v), stroke: C.line }, s); txt(s, 60, y(v) + 6, v + '%', { 'text-anchor': 'end', 'font-size': 17, fill: C.muted }); }
    for (var t = 0; t <= 300; t += 60) txt(s, x(t), 306, (t / 60) + ' min', { 'text-anchor': 'middle', 'font-size': 17, fill: C.muted });
    var d = ''; for (t = 0; t <= 300; t += 3) d += (t ? 'L' : 'M') + x(t) + ',' + y(rec(t));
    sv('path', { d: d, fill: 'none', stroke: C.pcr, 'stroke-width': 5 }, s);
    var dot = sv('circle', { r: 10, fill: C.pcr, stroke: '#fff', 'stroke-width': 3 }, s);
    var lbl = txt(s, 0, 0, '', { 'font-size': 20, 'font-weight': 800, fill: C.pcr });
    var r = D.slider(left, 'Rest between sprints', 10, 240, 5, 30, 300);
    var rv = hx('span', null, '', r.parentNode); rv.style.cssText = 'font-size:22px;font-weight:800';
    // repeated sprints: 6 × 6 s, each sprint uses half the PCr that is there
    hx('div', 'ctrl-label', '6 × 6 s sprints: PCr at the start of each sprint', right);
    var s2 = D.svgRoot(right, 600, 300, 'Bar chart of PCr at the start of each of six sprints');
    var bars = sv('g', {}, s2);
    var note = hx('div', 'note-box', '', right); note.style.marginTop = '6px';
    function render() {
      var rest = +r.value;
      rv.textContent = rest + ' s';
      dot.setAttribute('cx', x(rest)); dot.setAttribute('cy', y(rec(rest)));
      lbl.setAttribute('x', x(rest) + 14); lbl.setAttribute('y', y(rec(rest)) + 26); lbl.textContent = Math.round(rec(rest)) + '%';
      D.clear(bars);
      var level = 100, yb = D.lin(0, 100, 250, 20);
      for (var i = 0; i < 6; i++) {
        var bx = 30 + i * 95;
        sv('rect', { x: bx, y: yb(level), width: 64, height: 250 - yb(level), rx: 6, fill: C.pcr, opacity: 0.35 + 0.65 * level / 100 }, bars);
        txt(bars, bx + 32, yb(level) - 8, Math.round(level) + '%', { 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 800, fill: C.pcr });
        txt(bars, bx + 32, 278, 'Sprint ' + (i + 1), { 'text-anchor': 'middle', 'font-size': 16, fill: C.muted });
        var after = level * 0.45; // a 6 s sprint uses roughly half the PCr available
        level = after + (100 - after) * (1 - Math.pow(0.5, rest / HALF));
      }
      sv('line', { x1: 20, x2: 590, y1: 250, y2: 250, stroke: C.ink, 'stroke-width': 2 }, bars);
      note.innerHTML = rest <= 30 ? '<b>Short rest:</b> PCr can\'t recover, so each sprint starts lower. Good for training repeated-sprint ability, poor for pure speed.'
        : rest < 120 ? '<b>Medium rest:</b> most PCr comes back, but not all. Sprint quality slowly drops.'
        : '<b>Long rest (2–4 min):</b> PCr is almost fully restored, so every sprint can be maximal. Use this for speed and power work.';
    }
    r.addEventListener('input', render);
    hx('p', 'tiny', 'Simplified model with a half-time of about 30 s. Harris et al. (1976) found a fast phase with a half-time of about 21–22 s, then a slower phase lasting several minutes.', right).style.marginTop = '6px';
    render();
  };

  /* ---------- glycolysis: glucose or glycogen, low or high intensity ---------- */
  W.glyco = function (el) {
    var src = 'glucose', hi = true;
    var row = hx('div', 'row', null, el); row.style.cssText = 'gap:24px';
    var left = hx('div', null, null, row); left.style.flex = '0 0 900px';
    var right = hx('div', 'col', null, row);
    var s = D.svgRoot(left, 900, 530, 'Flow diagram of glycolysis from glucose or glycogen to pyruvate, then to lactate or into the mitochondria');
    var ah = D.arrowHead(s, D.id('ga'), C.ink), ahG = D.arrowHead(s, D.id('gg'), C.gly), ahA = D.arrowHead(s, D.id('gb'), C.aer);
    var css = document.createElement('style');
    css.textContent = '@keyframes flowdash{to{stroke-dashoffset:-28}} .flow{stroke-dasharray:14 14;animation:flowdash .6s linear infinite} @media (prefers-reduced-motion: reduce){.flow{animation:none}}';
    el.appendChild(css);
    function box(x, y, w, label, col, sub) {
      var g = sv('g', {}, s);
      sv('rect', { x: x - w / 2, y: y - 26, width: w, height: 52, rx: 12, fill: '#fff', stroke: col, 'stroke-width': 3 }, g);
      txt(g, x, y + 8, label, { 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 800, fill: col });
      if (sub) txt(g, x, y + 46, sub, { 'text-anchor': 'middle', 'font-size': 16, fill: C.muted });
      return g;
    }
    function arrow(d, col, mk, extra) { return sv('path', Object.assign({ d: d, fill: 'none', stroke: col, 'stroke-width': 4, 'marker-end': mk }, extra || {}), s); }
    // cytoplasm label
    sv('rect', { x: 10, y: 10, width: 560, height: 510, rx: 18, fill: '#fbf1f5', stroke: '#efd2de' }, s);
    txt(s, 26, 40, 'Cytoplasm (no oxygen needed)', { 'font-size': 18, 'font-weight': 800, fill: C.gly });
    var bGlu = box(170, 80, 170, 'Glucose', C.cho), bGly = box(400, 80, 170, 'Glycogen', C.cho);
    var aGlu = arrow('M170,108 V172', C.ink, ah), aGly = arrow('M400,108 Q400,150 330,172', C.ink, ah);
    var tGlu = txt(s, 182, 148, '−1 ATP (hexokinase)', { 'font-size': 16, 'font-weight': 700, fill: C.red });
    var tGly = txt(s, 410, 150, 'glycogen phosphorylase', { 'font-size': 16, 'font-weight': 700, fill: C.muted });
    box(250, 200, 250, 'Glucose-6-phosphate', C.ink);
    arrow('M250,228 V282', C.ink, ah);
    txt(s, 264, 252, 'PFK: the key control enzyme   −1 ATP', { 'font-size': 16, 'font-weight': 700, fill: C.red });
    box(250, 310, 300, 'Fructose-1,6-bisphosphate', C.ink);
    arrow('M250,338 V392', C.ink, ah);
    txt(s, 264, 362, '+4 ATP    2 NAD⁺ → 2 NADH', { 'font-size': 16, 'font-weight': 700, fill: C.green });
    box(250, 420, 220, '2 × Pyruvate', C.gly);
    // branch: lactate (high intensity) or mitochondria (low intensity)
    var toLac = arrow('M140,446 Q120,480 92,480', C.gly, ahG, { 'stroke-width': 6 });
    var lac = box(60, 480, 0.1, '', C.gly);
    var lacBox = sv('g', {}, s);
    sv('rect', { x: 330, y: 456, width: 220, height: 52, rx: 12, fill: C.gly }, lacBox);
    txt(lacBox, 440, 489, '2 × Lactate', { 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 800, fill: '#fff' });
    s.removeChild(lac); s.removeChild(toLac);
    toLac = arrow('M330,438 Q360,455 362,456', C.gly, ahG, { 'stroke-width': 6 });
    var lacLbl = txt(s, 380, 445, 'LDH', { 'font-size': 17, 'font-weight': 800, fill: C.gly });
    var nad = sv('path', { d: 'M500,456 Q560,380 380,410', fill: 'none', stroke: C.green, 'stroke-width': 3, 'stroke-dasharray': '6 5', 'marker-end': ah }, s);
    var nadT = txt(s, 455, 392, 'NAD⁺ recycled', { 'font-size': 16, 'font-weight': 800, fill: C.green });
    // mitochondrion
    var mito = sv('g', {}, s);
    sv('rect', { x: 610, y: 260, width: 280, height: 240, rx: 120, fill: '#e8f4fa', stroke: C.aer, 'stroke-width': 4 }, mito);
    txt(mito, 750, 300, 'Mitochondrion', { 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 800, fill: C.aer });
    sv('rect', { x: 660, y: 330, width: 180, height: 52, rx: 12, fill: C.aer }, mito);
    txt(mito, 750, 364, 'Acetyl-CoA', { 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 800, fill: '#fff' });
    txt(mito, 750, 420, '→ Krebs cycle + ETC', { 'text-anchor': 'middle', 'font-size': 19, 'font-weight': 700, fill: C.aer });
    txt(mito, 750, 448, '≈ 30 more ATP', { 'text-anchor': 'middle', 'font-size': 19, 'font-weight': 800, fill: C.aer });
    var toMito = arrow('M360,414 Q520,360 656,356', C.aer, ahA, { 'stroke-width': 6 });
    var net = txt(s, 450, 220, '', { 'font-size': 26, 'font-weight': 800, fill: C.ink });
    // controls
    hx('div', 'ctrl-label', 'Start from', right);
    var g1 = hx('div', 'btngroup', null, right); g1.style.margin = '6px 0 14px';
    var bS = [btn('Blood glucose', g1, 'sm'), btn('Muscle glycogen', g1, 'sm')];
    hx('div', 'ctrl-label', 'Exercise intensity', right);
    var g2 = hx('div', 'btngroup', null, right); g2.style.margin = '6px 0 14px';
    var bI = [btn('Low: oxygen keeps up', g2, 'sm'), btn('High: pyruvate made too fast', g2, 'sm')];
    var ro = hx('div', 'readouts', null, right);
    var rN = D.readout(ro, 'Net ATP', C.gly), rR = D.readout(ro, 'Pyruvate goes to', C.ink);
    var note = hx('div', 'note-box', '', right); note.style.marginTop = '12px';
    function render() {
      var glu = src === 'glucose';
      bS[0].setAttribute('aria-pressed', glu); bS[1].setAttribute('aria-pressed', !glu);
      bI[0].setAttribute('aria-pressed', !hi); bI[1].setAttribute('aria-pressed', hi);
      bGlu.style.opacity = aGlu.style.opacity = tGlu.style.opacity = glu ? 1 : 0.2;
      bGly.style.opacity = aGly.style.opacity = tGly.style.opacity = glu ? 0.2 : 1;
      aGlu.classList.toggle('flow', glu); aGly.classList.toggle('flow', !glu);
      [toLac, lacBox, lacLbl, nad, nadT].forEach(function (e) { e.style.opacity = hi ? 1 : 0.15; });
      toLac.classList.toggle('flow', hi); toMito.classList.toggle('flow', !hi);
      toMito.style.opacity = hi ? 0.25 : 1; mito.style.opacity = hi ? 0.45 : 1;
      var n = glu ? 2 : 3;
      net.textContent = 'Net: ' + n + ' ATP';
      net.setAttribute('x', 560 - 150);
      rN.textContent = n; rR.textContent = hi ? 'Lactate' : 'Mitochondria';
      note.innerHTML = (glu ? 'From glucose: 4 ATP made − 2 ATP invested = <b>2 ATP</b>.' : 'From glycogen: the hexokinase step is skipped, so only 1 ATP is invested: <b>3 ATP</b>.') + ' ' +
        (hi ? 'Pyruvate is made faster than the mitochondria can take it, so <b>LDH turns it into lactate</b>. This recycles NAD⁺ so glycolysis can keep running fast.' : 'Pyruvate enters the mitochondria and becomes <b>acetyl-CoA</b>, feeding the Krebs cycle. Very little lactate is made.');
    }
    bS[0].addEventListener('click', function () { src = 'glucose'; render(); });
    bS[1].addEventListener('click', function () { src = 'glycogen'; render(); });
    bI[0].addEventListener('click', function () { hi = false; render(); });
    bI[1].addEventListener('click', function () { hi = true; render(); });
    render();
  };

  /* ---------- illustrative ATP supply from each system during an all-out effort ---------- */
  function sysRates(t) {
    return {
      pcr: 60 * Math.exp(-t / 7) * (1 - Math.exp(-t / 0.5)),
      gly: 45 * (1 - Math.exp(-t / 3)) * Math.exp(-t / 35),
      aer: 30 * (1 - Math.exp(-t / 22))
    };
  }
  W.overlap = function (el) {
    var T = 120, row = hx('div', 'row', null, el); row.style.cssText = 'gap:26px';
    var left = hx('div', null, null, row); left.style.flex = '0 0 880px';
    var right = hx('div', 'col', null, row);
    var s = D.svgRoot(left, 880, 500, 'Illustrative graph of the rate of ATP supply from the ATP–PC, glycolytic and oxidative systems over two minutes of all-out exercise');
    var x = D.lin(0, T, 80, 860), y = D.lin(0, 50, 430, 20);
    sv('line', { x1: 80, x2: 860, y1: 430, y2: 430, stroke: C.ink, 'stroke-width': 3 }, s);
    sv('line', { x1: 80, x2: 80, y1: 430, y2: 14, stroke: C.ink, 'stroke-width': 3 }, s);
    for (var t = 0; t <= T; t += 20) txt(s, x(t), 458, t + ' s', { 'text-anchor': 'middle', 'font-size': 18, fill: C.muted });
    txt(s, 470, 490, 'Time into an all-out effort', { 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 700 });
    txt(s, 34, 225, 'Rate of ATP supply →', { 'text-anchor': 'middle', 'font-size': 19, 'font-weight': 700, transform: 'rotate(-90 34 225)' });
    var keys = [['pcr', 'ATP–PC', C.pcr], ['gly', 'Glycolytic', C.gly], ['aer', 'Oxidative', C.aer]];
    keys.forEach(function (k) {
      var d = ''; for (var t = 0; t <= T; t += 0.5) d += (t ? 'L' : 'M') + x(t) + ',' + y(sysRates(t)[k[0]]);
      sv('path', { d: d, fill: 'none', stroke: k[2], 'stroke-width': 5 }, s);
    });
    txt(s, x(5.5), y(44), 'ATP–PC', { 'font-size': 20, 'font-weight': 800, fill: C.pcr });
    txt(s, x(22), y(34), 'Glycolytic', { 'font-size': 20, 'font-weight': 800, fill: C.gly });
    txt(s, x(95), y(31.5), 'Oxidative', { 'font-size': 20, 'font-weight': 800, fill: C.aer });
    var cur = sv('line', { y1: 14, y2: 430, stroke: C.ink, 'stroke-width': 2, 'stroke-dasharray': '4 4' }, s);
    var hit = sv('rect', { x: 80, y: 14, width: 780, height: 416, fill: 'transparent', style: 'cursor:ew-resize' }, s);
    var ro = hx('div', 'readouts', null, right);
    var rt = D.readout(ro, 'Time', C.ink);
    hx('div', 'ctrl-label', 'Share of ATP right now', right).style.marginTop = '14px';
    var bNow = hx('div', null, null, right);
    hx('div', 'ctrl-label', 'Share of ATP so far (total)', right).style.marginTop = '14px';
    var bTot = hx('div', null, null, right);
    var note = hx('div', 'note-box', '', right); note.style.marginTop = '14px';
    hx('p', 'tiny', 'Illustrative curves for teaching, shaped to match Gastin (2001).', right).style.marginTop = '8px';
    function shareBar(parent, v) {
      var sum = v.pcr + v.gly + v.aer || 1;
      parent.innerHTML = '';
      var b = hx('div', null, null, parent); b.style.cssText = 'display:flex;height:40px;border-radius:8px;overflow:hidden;margin-top:6px';
      keys.forEach(function (k) {
        var p = v[k[0]] / sum * 100;
        var seg = hx('div', null, p > 9 ? Math.round(p) + '%' : '', b);
        seg.style.cssText = 'width:' + p + '%;background:' + k[2] + ';color:#fff;font-weight:800;font-size:18px;display:flex;align-items:center;justify-content:center';
      });
    }
    function cum(t) { var o = { pcr: 0, gly: 0, aer: 0 }; for (var u = 0; u < t; u += 0.25) { var r = sysRates(u + 0.125); o.pcr += r.pcr; o.gly += r.gly; o.aer += r.aer; } return o; }
    function set(t) {
      t = D.clamp(t, 0.5, T);
      cur.setAttribute('x1', x(t)); cur.setAttribute('x2', x(t));
      rt.textContent = Math.round(t) + ' s';
      shareBar(bNow, sysRates(t)); var c = cum(t); shareBar(bTot, c);
      var aer = c.aer / (c.pcr + c.gly + c.aer) * 100;
      note.innerHTML = t < 4 ? 'Even in the first seconds, <b>all three systems</b> are supplying ATP. PCr is fastest to respond.'
        : aer < 50 ? 'So far, anaerobic supply is bigger, but the oxidative share grows every second.'
        : 'The oxidative system has now supplied <b>more than half</b> of all the ATP. On these curves that happens at about 75 s.';
    }
    var drag = false;
    function mv(e) { if (!drag) return; set(D.lin(80, 860, 0, T)(D.pt(s, e).x)); }
    hit.addEventListener('pointerdown', function (e) { drag = true; hit.setPointerCapture(e.pointerId); mv(e); });
    hit.addEventListener('pointermove', mv);
    hit.addEventListener('pointerup', function () { drag = false; });
    var r = D.slider(right, 'or slide', 1, T, 1, 10, 240); r.parentNode.style.marginTop = '10px';
    r.addEventListener('input', function () { set(+r.value); });
    set(10);
  };

  /* ---------- Gastin (2001) contribution by duration, plus Spencer and Gastin (2001) track events ---------- */
  W.gastin = function (el) {
    var tab = [[10, 94], [15, 88], [20, 82], [30, 73], [45, 63], [60, 55], [75, 49], [90, 44], [120, 37], [180, 27], [240, 21]];
    var events = [['100 m', 10, 6, 'Table value for 0–10 s'], ['200 m', 22, 29, 'Spencer & Gastin (2001)'], ['400 m', 49, 43, 'Spencer & Gastin (2001)'], ['800 m', 113, 66, 'Spencer & Gastin (2001)'], ['1500 m', 240, 84, 'Spencer & Gastin (2001)']];
    var row = hx('div', 'row', null, el); row.style.cssText = 'gap:30px';
    var left = hx('div', null, null, row); left.style.flex = '0 0 800px';
    var right = hx('div', 'col', null, row);
    var s = D.svgRoot(left, 800, 500, 'Line graph of the aerobic contribution to maximal exercise rising from 6% at 10 seconds to 79% at 240 seconds');
    var x = D.lin(0, 240, 80, 780), y = D.lin(0, 100, 430, 20);
    for (var v = 0; v <= 100; v += 25) { sv('line', { x1: 80, x2: 780, y1: y(v), y2: y(v), stroke: C.line }, s); txt(s, 70, y(v) + 7, v + '%', { 'text-anchor': 'end', 'font-size': 18, fill: C.muted }); }
    for (var t = 0; t <= 240; t += 30) txt(s, x(t), 458, t + ' s', { 'text-anchor': 'middle', 'font-size': 18, fill: C.muted });
    txt(s, 430, 492, 'Duration of an all-out effort', { 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 700 });
    sv('line', { x1: 80, x2: 780, y1: y(50), y2: y(50), stroke: C.ink, 'stroke-width': 2, 'stroke-dasharray': '6 6' }, s);
    txt(s, x(240), y(50) - 10, 'equal contribution', { 'text-anchor': 'end', 'font-size': 17, fill: C.muted, 'font-weight': 700 });
    var dA = '', dN = '';
    tab.forEach(function (p, i) { dA += (i ? 'L' : 'M') + x(p[0]) + ',' + y(100 - p[1]); dN += (i ? 'L' : 'M') + x(p[0]) + ',' + y(p[1]); });
    sv('path', { d: dN, fill: 'none', stroke: C.gly, 'stroke-width': 5 }, s);
    sv('path', { d: dA, fill: 'none', stroke: C.aer, 'stroke-width': 5 }, s);
    tab.forEach(function (p) { sv('circle', { cx: x(p[0]), cy: y(100 - p[1]), r: 5, fill: C.aer }, s); sv('circle', { cx: x(p[0]), cy: y(p[1]), r: 5, fill: C.gly }, s); });
    txt(s, x(200), y(30), 'Anaerobic', { 'font-size': 20, 'font-weight': 800, fill: C.gly, 'text-anchor': 'middle' });
    txt(s, x(200), y(84), 'Aerobic', { 'font-size': 20, 'font-weight': 800, fill: C.aer, 'text-anchor': 'middle' });
    var cur = sv('line', { y1: 20, y2: 430, stroke: C.ink, 'stroke-width': 2 }, s);
    var evDot = sv('circle', { r: 11, fill: C.amber, stroke: C.ink, 'stroke-width': 2, opacity: 0 }, s);
    hx('div', 'ctrl-label', 'Duration (Gastin, 2001)', right);
    var r = D.slider(right, '', 0, tab.length - 1, 1, 0, 360);
    hx('div', 'ctrl-label', 'Or pick a race (highly trained runners)', right).style.marginTop = '12px';
    var eg = hx('div', 'btngroup', null, right); eg.style.margin = '6px 0 12px';
    var eb = events.map(function (ev) { var b = btn(ev[0], eg, 'sm'); b.addEventListener('click', function () { showEvent(ev, b); }); return b; });
    var big = hx('div', null, null, right);
    big.style.cssText = 'display:flex;height:74px;border-radius:12px;overflow:hidden';
    var sA = hx('div', null, '', big), sN = hx('div', null, '', big);
    [sN, sA].forEach(function (e, i) { e.style.cssText = 'display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:24px;transition:width .3s;background:' + (i ? C.aer : C.gly); });
    big.insertBefore(sN, sA);
    var cap = hx('div', 'small', '', right); cap.style.marginTop = '8px';
    var note = hx('div', 'note-box', '', right); note.style.marginTop = '10px';
    function paint(dur, aer, label, src) {
      sN.style.width = (100 - aer) + '%'; sA.style.width = aer + '%';
      sN.textContent = (100 - aer) + '% anaerobic'; sA.textContent = aer >= 15 ? aer + '% aerobic' : aer + '%';
      cap.innerHTML = '<b>' + label + '</b> · ' + src;
      cur.setAttribute('x1', x(dur)); cur.setAttribute('x2', x(dur));
      note.innerHTML = aer < 30 ? 'Mostly anaerobic, but the aerobic system is <b>already contributing</b>.'
        : aer < 50 ? 'Close to half and half. Both systems need training.'
        : 'Most of the energy is now <b>aerobic</b>, even though the effort is all-out.';
    }
    function showEvent(ev, b) {
      eb.forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
      evDot.setAttribute('opacity', 1); evDot.setAttribute('cx', x(ev[1])); evDot.setAttribute('cy', y(ev[2]));
      paint(ev[1], ev[2], ev[0] + ' (about ' + ev[1] + ' s)', ev[3]);
    }
    r.addEventListener('input', function () {
      eb.forEach(function (x) { x.setAttribute('aria-pressed', false); }); evDot.setAttribute('opacity', 0);
      var p = tab[+r.value]; paint(p[0], 100 - p[1], '0–' + p[0] + ' s of maximal exercise', 'Gastin (2001), Table II');
    });
    r.dispatchEvent(new Event('input'));
  };
})();
