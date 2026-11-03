/* Part 1 widgets: ATP, food energy, bomb calorimeter, intensity and demand, pathway matching. */
(function () {
  'use strict';
  var D = window.DV, C = D.C, sv = D.sv, txt = D.txt, hx = D.hx, btn = D.btn;
  var W = window.DeckWidgets;

  /* ---------- ATP: spend the third phosphate, then remake it ---------- */
  W.atp = function (el) {
    var row = hx('div', 'row', null, el); row.style.cssText = 'gap:30px;align-items:flex-start';
    var left = hx('div', null, null, row); left.style.flex = '0 0 780px';
    var right = hx('div', 'col', null, row);
    var s = D.svgRoot(left, 780, 400, 'Diagram of an ATP molecule: adenosine joined to three phosphate groups');
    // adenosine
    sv('rect', { x: 20, y: 130, width: 190, height: 110, rx: 22, fill: C.teal }, s);
    txt(s, 115, 194, 'Adenosine', { 'text-anchor': 'middle', 'font-size': 28, 'font-weight': 800, fill: '#fff' });
    sv('line', { x1: 210, y1: 185, x2: 262, y2: 185, stroke: C.ink, 'stroke-width': 6 }, s);
    function phos(cx) {
      var g = sv('g', {}, s);
      sv('circle', { cx: cx, cy: 185, r: 46, fill: C.amber, stroke: '#a27100', 'stroke-width': 3 }, g);
      txt(g, cx, 197, 'P', { 'text-anchor': 'middle', 'font-size': 36, 'font-weight': 800, fill: C.ink });
      return g;
    }
    phos(308);
    sv('line', { x1: 354, y1: 185, x2: 398, y2: 185, stroke: C.ink, 'stroke-width': 6 }, s);
    phos(444);
    // the high-energy bond to the third phosphate
    var bond = sv('path', { d: 'M490,185 q11,-16 22,0 t22,0', fill: 'none', stroke: C.red, 'stroke-width': 6, 'stroke-linecap': 'round' }, s);
    var p3 = phos(580);
    p3.style.transition = 'transform .7s cubic-bezier(.3,1.4,.5,1)';
    var bondLbl = txt(s, 512, 150, 'high-energy bond', { 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700, fill: C.red });
    var name = txt(s, 300, 60, 'ATP', { 'text-anchor': 'middle', 'font-size': 46, 'font-weight': 800, fill: C.ink });
    var sub = txt(s, 300, 95, 'adenosine triphosphate: three phosphates', { 'text-anchor': 'middle', 'font-size': 21, fill: C.muted });
    var burst = sv('g', { opacity: 0 }, s);
    burst.style.transition = 'opacity .3s';
    for (var k = 0; k < 10; k++) {
      var a = k / 10 * Math.PI * 2;
      sv('line', { x1: 540 + Math.cos(a) * 30, y1: 185 + Math.sin(a) * 30, x2: 540 + Math.cos(a) * 62, y2: 185 + Math.sin(a) * 62, stroke: C.red, 'stroke-width': 5, 'stroke-linecap': 'round' }, burst);
    }
    var bLbl = txt(burst, 540, 300, 'ENERGY → work', { 'text-anchor': 'middle', 'font-size': 26, 'font-weight': 800, fill: C.red });
    var inLbl = txt(s, 540, 300, '', { 'text-anchor': 'middle', 'font-size': 24, 'font-weight': 800, fill: C.green });

    var b1 = btn('⚡ Use ATP (muscle contracts)', right); b1.style.cssText = 'display:block;width:100%;margin-bottom:12px';
    hx('p', 'small', '<b>Remake ATP using energy from:</b>', right).style.margin = '8px 0 8px';
    var srcs = [['PCr (ATP–PC system)', C.pcr, 'Phosphocreatine hands over its phosphate.'], ['Glucose (glycolysis)', C.gly, 'Splitting glucose releases energy to rebuild the bond.'], ['Carbohydrate or fat + oxygen (aerobic)', C.aer, 'Aerobic metabolism in the mitochondria supplies the energy.']];
    var rb = srcs.map(function (sr) {
      var b = btn(sr[0], right); b.style.cssText = 'display:block;width:100%;margin-bottom:8px;border-left:8px solid ' + sr[1];
      b.addEventListener('click', function () { remake(sr); });
      return b;
    });
    var ro = hx('div', 'readouts', null, right); ro.style.marginTop = '10px';
    var used = D.readout(ro, 'ATP used', C.red), made = D.readout(ro, 'ATP remade', C.green);
    var note = hx('div', 'note-box', 'Click <b>Use ATP</b> to break off the third phosphate.', right); note.style.marginTop = '12px';
    var state = 'atp', nU = 0, nM = 0;
    function render() {
      var adp = state === 'adp';
      p3.style.transform = adp ? 'translate(130px,70px)' : 'none';
      bond.style.opacity = adp ? 0 : 1; bondLbl.style.opacity = adp ? 0 : 1;
      name.textContent = adp ? 'ADP + Pi' : 'ATP';
      sub.textContent = adp ? 'adenosine diphosphate + a free phosphate' : 'adenosine triphosphate: three phosphates';
      b1.disabled = adp; rb.forEach(function (b) { b.disabled = !adp; });
      used.textContent = nU; made.textContent = nM;
    }
    b1.addEventListener('click', function () {
      state = 'adp'; nU++; inLbl.textContent = '';
      burst.setAttribute('opacity', 1); setTimeout(function () { burst.setAttribute('opacity', 0); }, 900);
      note.innerHTML = '<b>ATP → ADP + Pi + energy.</b> The energy released powers a cross-bridge cycle. Now remake the ATP.';
      render();
    });
    function remake(sr) {
      state = 'atp'; nM++;
      inLbl.textContent = 'energy in'; inLbl.setAttribute('fill', sr[1]);
      setTimeout(function () { inLbl.textContent = ''; }, 900);
      note.innerHTML = '<b>ADP + Pi + energy → ATP</b> (phosphorylation). ' + sr[2];
      render();
    }
    render();
  };

  /* ---------- energy in food ---------- */
  W.kcal = function (el) {
    var per = [['Carbohydrate', 4, C.cho, 250], ['Fat', 9, C.fat, 120], ['Protein', 4, C.pro, 120]];
    var g = [90, 15, 25];
    var row = hx('div', 'row', null, el); row.style.cssText = 'gap:36px';
    var left = hx('div', null, null, row); left.style.flex = '0 0 560px';
    var right = hx('div', 'col', null, row);
    var cards = hx('div', 'row', null, left); cards.style.cssText = 'gap:12px;margin-bottom:18px';
    per.forEach(function (p) {
      hx('div', 'card', '<div style="font-size:19px;font-weight:700;color:' + p[2] + '">' + p[0] + '</div><div style="font-size:46px;font-weight:800;line-height:1.1">' + p[1] + '</div><div class="tiny">kcal per gram</div>', cards).style.cssText = 'flex:1;text-align:center;border-top:6px solid ' + p[2];
    });
    var inputs = per.map(function (p, i) {
      var wrap = hx('div', null, null, left); wrap.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:10px';
      hx('span', 'ctrl-label', p[0], wrap).style.cssText = 'width:150px;color:' + p[2];
      var r = hx('input', null, null, wrap); r.type = 'range'; r.min = 0; r.max = p[3]; r.step = 1; r.value = g[i]; r.style.width = '260px';
      r.setAttribute('aria-label', p[0] + ' in grams');
      var v = hx('span', null, '', wrap); v.style.cssText = 'font-size:24px;font-weight:800;min-width:80px';
      r.addEventListener('input', function () { g[i] = +r.value; render(); });
      return v;
    });
    var pre = hx('div', 'btngroup', '<span class="ctrl-label" style="align-self:center">Try</span>', left); pre.style.marginTop = '6px';
    [['Pasta meal', [95, 18, 30]], ['Cooked breakfast', [45, 40, 35]], ['Sports drink (500 ml)', [30, 0, 0]], ['Handful of nuts (30 g)', [4, 15, 6]]].forEach(function (p) {
      btn(p[0], pre, 'sm').addEventListener('click', function () { g = p[1].slice(); left.querySelectorAll('input').forEach(function (r, i) { r.value = g[i]; }); render(); });
    });
    var s = D.svgRoot(right, 640, 150, 'Bar showing the energy from each macronutrient');
    var bars = sv('g', {}, s);
    var ro = hx('div', 'readouts', null, right); ro.style.marginTop = '8px';
    var tot = D.readout(ro, 'Total energy', C.ink), kj = D.readout(ro, 'In kilojoules', C.muted), km = D.readout(ro, 'Running distance*', C.teal);
    var note = hx('div', 'note-box', '', right); note.style.marginTop = '12px';
    hx('p', 'tiny', '*For a 70 kg runner, using about 1 kcal per kg of body mass per km. Values for the meals are approximate.', right).style.marginTop = '8px';
    function render() {
      var e = per.map(function (p, i) { return g[i] * p[1]; });
      var total = e[0] + e[1] + e[2];
      D.clear(bars);
      var x = 0, sc = 620 / Math.max(800, total);
      e.forEach(function (v, i) {
        var w = v * sc;
        sv('rect', { x: x, y: 30, width: Math.max(0, w), height: 70, fill: per[i][2] }, bars);
        if (w > 70) txt(bars, x + w / 2, 74, Math.round(v) + '', { 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 800, fill: '#fff' });
        x += w;
      });
      txt(bars, 0, 132, '0', { 'font-size': 16, fill: C.faint });
      txt(bars, 620, 132, Math.round(Math.max(800, total)) + ' kcal', { 'text-anchor': 'end', 'font-size': 16, fill: C.faint });
      inputs.forEach(function (v, i) { v.textContent = g[i] + ' g'; });
      tot.textContent = Math.round(total) + ' kcal';
      kj.textContent = Math.round(total * 4.184) + ' kJ';
      km.textContent = D.fx(total / 70, 1) + ' km';
      var fatShare = total ? e[1] / total * 100 : 0;
      note.innerHTML = total ? 'Fat gives <b>' + Math.round(fatShare) + '%</b> of the energy from only <b>' + Math.round(g[1] / Math.max(1, g[0] + g[1] + g[2]) * 100) + '%</b> of the grams. Fat is the most <b>energy-dense</b> fuel.' : 'Move a slider to add some food.';
    }
    render();
  };

  /* ---------- bomb calorimeter diagram ---------- */
  W.bomb = function (el) {
    var s = D.svgRoot(el, 520, 470, 'Diagram of a bomb calorimeter: an insulated container of water holding a sealed steel bomb with a food sample, electrodes, an oxygen inlet, a stirrer and a thermometer');
    sv('rect', { x: 40, y: 90, width: 440, height: 340, rx: 18, fill: '#e9eef0', stroke: C.muted, 'stroke-width': 4 }, s);
    txt(s, 260, 456, 'Insulated container', { 'text-anchor': 'middle', 'font-size': 18, fill: C.muted, 'font-weight': 700 });
    var water = sv('rect', { x: 56, y: 140, width: 408, height: 274, rx: 10, fill: '#cfe8f4' }, s);
    txt(s, 80, 400, 'Water', { 'font-size': 20, 'font-weight': 700, fill: C.aer });
    sv('rect', { x: 170, y: 220, width: 180, height: 160, rx: 26, fill: '#9aa8ae', stroke: C.ink, 'stroke-width': 3 }, s);
    txt(s, 260, 248, 'Steel "bomb"', { 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700, fill: '#fff' });
    txt(s, 260, 270, 'filled with O₂', { 'text-anchor': 'middle', 'font-size': 16, fill: '#fff' });
    sv('rect', { x: 225, y: 335, width: 70, height: 20, rx: 4, fill: '#5d4a2e' }, s);
    txt(s, 260, 372, 'food sample', { 'text-anchor': 'middle', 'font-size': 15, fill: '#fff' });
    var flame = sv('path', { d: 'M260,335 c-18,-20 -6,-40 0,-52 c6,12 18,32 0,52 z', fill: C.fat, opacity: 0 }, s);
    flame.style.transition = 'opacity .3s';
    // electrodes and oxygen
    sv('path', { d: 'M215,220 V60 H150', fill: 'none', stroke: C.red, 'stroke-width': 4 }, s);
    sv('path', { d: 'M305,220 V60 H350', fill: 'none', stroke: C.ink, 'stroke-width': 4 }, s);
    txt(s, 145, 54, 'Electrodes', { 'text-anchor': 'end', 'font-size': 18, 'font-weight': 700, fill: C.red });
    sv('path', { d: 'M260,220 V30', fill: 'none', stroke: C.aer, 'stroke-width': 8 }, s);
    txt(s, 270, 28, 'O₂ in', { 'font-size': 18, 'font-weight': 700, fill: C.aer });
    // thermometer
    sv('rect', { x: 412, y: 40, width: 22, height: 300, rx: 11, fill: '#fff', stroke: C.ink, 'stroke-width': 3 }, s);
    sv('circle', { cx: 423, cy: 348, r: 18, fill: C.red }, s);
    var merc = sv('rect', { x: 417, y: 260, width: 10, height: 90, fill: C.red }, s);
    merc.style.transition = 'all 2.5s ease-out';
    txt(s, 445, 52, 'Thermometer', { 'font-size': 18, 'font-weight': 700, fill: C.ink });
    var temp = txt(s, 445, 78, '20.0 °C', { 'font-size': 20, 'font-weight': 800, fill: C.red });
    // stirrer
    sv('path', { d: 'M100,100 V300 M80,300 H120', fill: 'none', stroke: C.muted, 'stroke-width': 4 }, s);
    txt(s, 110, 124, 'Stirrer', { 'font-size': 18, 'font-weight': 700, fill: C.muted });
    var bar = hx('div', 'row', null, el); bar.style.cssText = 'gap:10px;align-items:center;margin-top:6px';
    var go = btn('🔥 Ignite', bar, 'sm'), rs = btn('Reset', bar, 'ghost sm');
    var msg = hx('span', 'small', '1 g of fat into 1 kg of water', bar);
    var tm = null;
    go.addEventListener('click', function () {
      flame.setAttribute('opacity', 1); go.disabled = true;
      setTimeout(function () { flame.setAttribute('opacity', 0); }, 1200);
      merc.setAttribute('y', 170); merc.setAttribute('height', 180);
      var t0 = performance.now();
      tm = setInterval(function () {
        var f = Math.min(1, (performance.now() - t0) / 2500);
        temp.textContent = D.fx(20 + 9 * (1 - Math.pow(1 - f, 3)), 1) + ' °C';
        if (f >= 1) { clearInterval(tm); msg.innerHTML = 'Rise of <b>9 °C</b> in 1 kg of water = <b>9 kcal</b>.'; }
      }, 50);
    });
    rs.addEventListener('click', function () { clearInterval(tm); go.disabled = false; merc.setAttribute('y', 260); merc.setAttribute('height', 90); temp.textContent = '20.0 °C'; msg.textContent = '1 g of fat into 1 kg of water'; });
  };

  /* ---------- intensity drives ATP demand ---------- */
  W.demand = function (el) {
    var acts = [
      [0, 'Resting', 'Very low ATP use: the oxidative system meets it easily, mostly from fat.'],
      [20, 'Walking', 'ATP demand rises. Still fully aerobic.'],
      [40, 'Jogging', 'Faster contractions. The aerobic system keeps up, using more carbohydrate.'],
      [60, 'Running at threshold', 'The aerobic system is near its limit; glycolysis contributes more and lactate starts to rise.'],
      [80, 'Running at VO₂max', 'Aerobic supply is maxed out. Anything faster must be topped up anaerobically.'],
      [100, 'All-out sprint', 'Demand can be several hundred times resting muscle. Only PCr and glycolysis are fast enough.']
    ];
    var row = hx('div', 'row', null, el); row.style.cssText = 'gap:34px';
    var left = hx('div', null, null, row); left.style.flex = '0 0 470px';
    var chain = hx('div', null, null, left);
    var steps = [['Activity intensity', C.teal], ['Rate of muscle contraction', C.amber], ['ATP demand', C.red]];
    var fills = steps.map(function (st, i) {
      var box = hx('div', 'card', '<div style="font-size:22px;font-weight:800;margin-bottom:8px">' + st[0] + '</div>', chain);
      box.style.cssText = 'padding:12px 18px;margin-bottom:' + (i < 2 ? '6px' : '0');
      var track = hx('div', null, null, box); track.style.cssText = 'height:22px;background:#dbe6e9;border-radius:11px;overflow:hidden';
      var f = hx('div', null, null, track); f.style.cssText = 'height:100%;width:10%;background:' + st[1] + ';transition:width .2s';
      if (i < 2) hx('div', null, '↓', chain).style.cssText = 'text-align:center;font-size:30px;font-weight:800;color:' + C.muted + ';line-height:1';
      return f;
    });
    var right = hx('div', 'col', null, row);
    var s = D.svgRoot(right, 760, 360, 'Graph: ATP demand rises with activity intensity');
    var x = D.lin(0, 100, 80, 740), y = D.lin(0, 100, 320, 20);
    sv('line', { x1: 80, y1: 320, x2: 740, y2: 320, stroke: C.ink, 'stroke-width': 3 }, s);
    sv('line', { x1: 80, y1: 320, x2: 80, y2: 10, stroke: C.ink, 'stroke-width': 3 }, s);
    txt(s, 410, 356, 'Activity intensity →', { 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 700 });
    txt(s, 30, 170, 'ATP demand →', { 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 700, transform: 'rotate(-90 30 170)' });
    function dem(i) { return 4 + 60 * i / 100 + 36 * Math.pow(i / 100, 6); }
    var d = '';
    for (var i = 0; i <= 100; i += 2) d += (i ? 'L' : 'M') + x(i) + ',' + y(dem(i));
    sv('path', { d: d, fill: 'none', stroke: C.red, 'stroke-width': 5 }, s);
    sv('line', { x1: x(0), x2: x(100), y1: y(dem(80)), y2: y(dem(80)), stroke: C.aer, 'stroke-width': 3, 'stroke-dasharray': '8 6' }, s);
    txt(s, x(2), y(dem(80)) - 10, 'Maximum aerobic ATP supply (VO₂max)', { 'font-size': 17, 'font-weight': 700, fill: C.aer });
    var dot = sv('circle', { r: 12, fill: C.red, stroke: '#fff', 'stroke-width': 3 }, s);
    var ctr = hx('div', null, null, right); ctr.style.cssText = 'display:flex;align-items:center;gap:14px;margin-top:6px';
    var r = D.slider(ctr, 'Intensity', 0, 100, 1, 0, 420);
    var lbl = hx('span', null, '', ctr); lbl.style.cssText = 'font-size:24px;font-weight:800';
    var note = hx('div', 'note-box', '', right); note.style.marginTop = '8px';
    function render() {
      var v = +r.value, a = acts[Math.min(5, Math.round(v / 20))];
      dot.setAttribute('cx', x(v)); dot.setAttribute('cy', y(dem(v)));
      fills[0].style.width = (4 + v * 0.96) + '%';
      fills[1].style.width = (6 + v * 0.94) + '%';
      fills[2].style.width = dem(v) + '%';
      lbl.textContent = a[1];
      note.innerHTML = a[2] + (v > 80 ? ' <b>Demand is above the aerobic line</b>, so the anaerobic systems must cover the gap.' : '');
    }
    r.addEventListener('input', render);
    render();
  };

  /* ---------- pathway matching: name → process → outcome ---------- */
  W.pathways = function (el) {
    var P = [
      ['Lipolysis', 'Breakdown of triglycerides', 'Free fatty acids + glycerol'],
      ['Glycogenesis', 'Storage of glucose', 'Glycogen'],
      ['Lipogenesis', 'Fat synthesis', 'Triglycerides'],
      ['Glycogenolysis', 'Breakdown of glycogen', 'Glucose-1-phosphate'],
      ['Glycolysis', 'Breakdown of glucose', 'Pyruvate'],
      ['Gluconeogenesis', 'Making glucose from non-carbohydrate sources', 'Glucose'],
      ['Beta oxidation', 'Breakdown of fatty acids', 'Acetyl-CoA']
    ];
    function shuffle(a, seed) { var b = a.slice(); for (var i = b.length - 1; i > 0; i--) { seed = (seed * 9301 + 49297) % 233280; var j = Math.floor(seed / 233280 * (i + 1)); var t = b[i]; b[i] = b[j]; b[j] = t; } return b; }
    var procOrder = shuffle(P.map(function (p, i) { return i; }), 7), outOrder = shuffle(P.map(function (p, i) { return i; }), 19);
    var place = { p: {}, o: {} }, sel = null; // place.p[row] = chip index
    var grid = hx('div', null, null, el);
    grid.style.cssText = 'display:grid;grid-template-columns:230px 1fr 1fr;gap:6px 14px;align-items:center';
    ['Name', 'Process', 'Outcome'].forEach(function (h) { hx('div', 'ctrl-label', h, grid); });
    var slots = { p: [], o: [] };
    P.forEach(function (p, i) {
      hx('div', null, p[0], grid).style.cssText = 'font-size:22px;font-weight:800;color:' + C.teal;
      ['p', 'o'].forEach(function (k) {
        var sl = hx('button', 'chip', '', grid); sl.type = 'button';
        sl.style.cssText = 'min-height:40px;border-style:dashed;width:100%';
        sl.addEventListener('click', function () { drop(k, i); });
        slots[k].push(sl);
      });
    });
    var pools = hx('div', 'row', null, el); pools.style.cssText = 'gap:14px;margin-top:12px';
    var poolEl = { p: hx('div', null, null, pools), o: hx('div', null, null, pools) };
    poolEl.p.style.cssText = poolEl.o.style.cssText = 'flex:1;display:flex;flex-wrap:wrap;gap:6px;min-height:44px';
    var chips = { p: [], o: [] };
    ['p', 'o'].forEach(function (k) {
      (k === 'p' ? procOrder : outOrder).forEach(function (pi) {
        var c = hx('button', 'chip', P[pi][k === 'p' ? 1 : 2]); c.type = 'button'; c.dataset.i = pi;
        c.style.fontSize = '16px';
        c.addEventListener('click', function () { sel = sel && sel.k === k && sel.i === pi ? null : { k: k, i: pi }; render(); });
        chips[k][pi] = c;
      });
    });
    var bar = hx('div', 'row', null, el); bar.style.cssText = 'gap:10px;margin-top:10px;align-items:center';
    var ck = btn('Check', bar, 'sm'), sh = btn('Show answers', bar, 'ghost sm'), rs = btn('Reset', bar, 'ghost sm');
    var fb = hx('span', 'small', 'Click a process or outcome, then click the row it belongs to.', bar);
    function drop(k, row) {
      if (sel && sel.k === k) {
        for (var r in place[k]) if (place[k][r] === sel.i) delete place[k][r];
        place[k][row] = sel.i; sel = null;
      } else if (place[k][row] != null) { delete place[k][row]; }
      render();
    }
    function render(marks) {
      ['p', 'o'].forEach(function (k) {
        var used = {};
        slots[k].forEach(function (sl, row) {
          var ci = place[k][row];
          sl.classList.remove('ok', 'bad');
          if (ci != null) { used[ci] = 1; sl.textContent = P[ci][k === 'p' ? 1 : 2]; sl.style.borderStyle = 'solid'; if (marks) sl.classList.add(ci === row ? 'ok' : 'bad'); }
          else { sl.textContent = sel && sel.k === k ? 'place here' : ''; sl.style.borderStyle = 'dashed'; }
          sl.style.color = ci == null ? C.faint : '';
        });
        chips[k].forEach(function (c, pi) {
          if (used[pi]) { if (c.parentNode) c.parentNode.removeChild(c); }
          else { poolEl[k].appendChild(c); c.classList.toggle('sel', !!(sel && sel.k === k && sel.i === pi)); }
        });
      });
    }
    ck.addEventListener('click', function () {
      var n = 0, right = 0;
      ['p', 'o'].forEach(function (k) { for (var r in place[k]) { n++; if (place[k][r] === +r) right++; } });
      render(true);
      fb.innerHTML = '<b>' + right + ' of ' + n + '</b> correct' + (n < 14 ? ' (' + (14 - n) + ' still to place)' : '') + '.';
    });
    sh.addEventListener('click', function () { P.forEach(function (p, i) { place.p[i] = i; place.o[i] = i; }); sel = null; render(true); fb.textContent = 'All answers shown.'; });
    rs.addEventListener('click', function () { place = { p: {}, o: {} }; sel = null; render(); fb.textContent = 'Click a process or outcome, then click the row it belongs to.'; });
    render();
  };
})();
