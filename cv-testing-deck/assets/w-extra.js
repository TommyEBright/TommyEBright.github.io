/* Extra widgets: label the heart, vessels and the muscle pump, acute exercise response, standing up (baroreflex, orthostatic hypotension, vasovagal faint). */
(function () {
  'use strict';
  var D = window.DV, C = D.C, sv = D.sv, txt = D.txt, hx = D.hx, btn = D.btn;
  var W = window.DeckWidgets;
  var RA = '#dce6fb', RB = '#fbe0e0';

  /* ---------- name the areas of the heart ---------- */
  W.label = function (el) {
    var P = [
      ['Right atrium', 225, 250], ['Left atrium', 640, 250], ['Right ventricle', 260, 430], ['Left ventricle', 600, 440],
      ['Septum', 430, 420], ['Myocardium (heart muscle)', 735, 470], ['Aorta', 790, 300], ['Pulmonary artery', 370, 200],
      ['Vena cavae', 75, 400], ['Pulmonary veins', 660, 150], ['Tricuspid valve', 230, 322], ['Mitral (bicuspid) valve', 635, 322]
    ];
    var sel = null, done = 0, wrong = 0;
    var row = hx('div', 'row', null, el); row.style.gap = '26px';
    var left = hx('div', null, null, row); left.style.flex = '0 0 860px';
    var right = hx('div', 'col', null, row);
    var s = D.svgRoot(left, 860, 600, 'Schematic heart with twelve numbered pins to label');
    function tube(d, col, w) { sv('path', { d: d, fill: 'none', stroke: col, 'stroke-width': w || 34, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: .35 }, s); }
    sv('rect', { x: 250, y: 14, width: 360, height: 74, rx: 30, fill: '#f6e6ef', stroke: '#b65b86', 'stroke-width': 3 }, s);
    txt(s, 430, 58, 'Lungs', { 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 700, fill: C.muted });
    sv('rect', { x: 50, y: 530, width: 770, height: 60, rx: 26, fill: '#eef2f4', stroke: C.muted, 'stroke-width': 3 }, s);
    txt(s, 430, 567, 'Body', { 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 700, fill: C.muted });
    tube('M75,150 V235 Q75,250 130,250', C.deoxy); tube('M75,520 V305 Q75,285 130,285', C.deoxy);
    tube('M370,318 V140 Q370,104 340,96', C.deoxy, 40);
    tube('M490,318 V120 Q490,100 560,100 H760 Q790,100 790,140 V520', C.oxy, 40);
    tube('M600,92 Q660,100 660,140 V188', C.oxy);
    sv('rect', { x: 130, y: 190, width: 190, height: 118, rx: 26, fill: RA, stroke: C.deoxy, 'stroke-width': 4 }, s);
    sv('rect', { x: 545, y: 190, width: 190, height: 118, rx: 26, fill: RB, stroke: C.oxy, 'stroke-width': 4 }, s);
    sv('path', { d: 'M130,336 H410 V430 Q410,500 330,500 H210 Q130,500 130,430 Z', fill: RA, stroke: C.deoxy, 'stroke-width': 5 }, s);
    sv('path', { d: 'M450,336 H735 V440 Q735,512 640,512 H530 Q450,512 450,440 Z', fill: RB, stroke: C.oxy, 'stroke-width': 13 }, s);
    sv('rect', { x: 412, y: 336, width: 36, height: 170, rx: 8, fill: '#e9d7d7', stroke: '#b98d8d', 'stroke-width': 2 }, s);
    [[180, 100, C.deoxy], [345, 50, C.deoxy], [465, 50, C.oxy], [585, 100, C.oxy]].forEach(function (v) {
      sv('rect', { x: v[0], y: 312, width: v[1], height: 20, rx: 6, fill: '#fff', stroke: v[2], 'stroke-width': 3 }, s);
    });
    var pins = P.map(function (p, i) {
      var g = sv('g', { style: 'cursor:pointer', tabindex: 0, role: 'button', 'aria-label': 'Pin ' + (i + 1) }, s);
      var c = sv('circle', { cx: p[1], cy: p[2], r: 19, fill: C.navy, stroke: '#fff', 'stroke-width': 3 }, g);
      var t = txt(g, p[1], p[2] + 7, i + 1, { 'text-anchor': 'middle', 'font-size': 19, 'font-weight': 800, fill: '#fff' });
      var lab = txt(s, p[1], p[2] - 26, '', { 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 800, fill: C.tealD, 'pointer-events': 'none' });
      lab.style.paintOrder = 'stroke'; lab.setAttribute('stroke', '#fff'); lab.setAttribute('stroke-width', 5);
      function pick() { if (g.dataset.done) return; sel = i; pins.forEach(function (o) { o.c.setAttribute('stroke', o.g.dataset.done ? C.green : '#fff'); }); c.setAttribute('stroke', C.amber); c.setAttribute('stroke-width', 5); note.innerHTML = 'Pin <b>' + (i + 1) + '</b> selected. Now click its name.'; }
      g.addEventListener('click', pick);
      g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); pick(); } });
      return { g: g, c: c, lab: lab };
    });
    hx('div', 'ctrl-label', 'Names', right);
    var chips = hx('div', null, null, right); chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 14px';
    var order = P.map(function (_, i) { return i; }).sort(function (a, b) { return P[a][0] < P[b][0] ? -1 : 1; });
    var cb = {};
    order.forEach(function (i) {
      var b = hx('button', 'chip', P[i][0], chips); b.type = 'button'; cb[i] = b;
      b.addEventListener('click', function () {
        if (sel == null) { note.innerHTML = 'Click a numbered pin first.'; return; }
        if (sel === i) {
          var o = pins[i]; o.g.dataset.done = 1; o.c.setAttribute('fill', C.green); o.c.setAttribute('stroke', '#fff'); o.c.setAttribute('stroke-width', 3);
          o.lab.textContent = P[i][0].replace(' (heart muscle)', '').replace(' (bicuspid)', ''); b.disabled = true; b.classList.add('ok'); done++; sel = null;
          note.innerHTML = done === P.length ? '<b>All 12 named' + (wrong ? '' : ', with no mistakes') + '!</b> Next: the order blood flows through them.' : '<b>✓ Correct.</b> Pick another pin.';
        } else {
          wrong++; b.classList.add('bad'); setTimeout(function () { b.classList.remove('bad'); }, 400);
          note.innerHTML = '<b>Not pin ' + (sel + 1) + '.</b> Try another name.';
        }
        sc.textContent = done + ' / ' + P.length;
      });
    });
    var ro = hx('div', 'readouts', null, right); var sc = D.readout(ro, 'Named', C.teal); sc.textContent = '0 / 12';
    var note = hx('div', 'note-box', 'Click a numbered pin, then click its name.', right); note.style.marginTop = '12px';
    var bg = hx('div', 'btngroup', null, right); bg.style.marginTop = '12px';
    btn('Show all', bg, 'ghost sm').addEventListener('click', function () { P.forEach(function (_, i) { if (!pins[i].g.dataset.done) { sel = i; cb[i].click(); } }); });
    btn('Reset', bg, 'ghost sm').addEventListener('click', function () {
      sel = null; done = 0; wrong = 0; sc.textContent = '0 / 12'; note.innerHTML = 'Click a numbered pin, then click its name.';
      pins.forEach(function (o) { delete o.g.dataset.done; o.c.setAttribute('fill', C.navy); o.c.setAttribute('stroke', '#fff'); o.c.setAttribute('stroke-width', 3); o.lab.textContent = ''; });
      Object.keys(cb).forEach(function (k) { cb[k].disabled = false; cb[k].classList.remove('ok'); });
    });
  };

  /* ---------- blood vessels and the skeletal muscle pump ---------- */
  W.vessels = function (el) {
    var row = hx('div', 'row', null, el); row.style.gap = '26px';
    var left = hx('div', null, null, row); left.style.flex = '0 0 640px';
    var right = hx('div', 'col', null, row);
    // three vessel cross-sections
    var vs = D.svgRoot(left, 640, 190, 'Cross-sections of an artery, a capillary and a vein');
    [[100, 'Artery', 70, 28, C.oxy], [320, 'Capillary', 16, 3, '#b65b86'], [530, 'Vein', 72, 9, C.deoxy]].forEach(function (v) {
      sv('circle', { cx: v[0], cy: 90, r: v[2], fill: '#f3d9c8', stroke: '#b86b45', 'stroke-width': 2 }, vs);
      sv('circle', { cx: v[0], cy: 90, r: v[2] - v[3], fill: v[4], opacity: .85 }, vs);
      txt(vs, v[0], 186, v[1], { 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 800, fill: v[4] });
    });
    var tab = hx('table', 'data', '<thead><tr><th></th><th>Artery</th><th>Capillary</th><th>Vein</th></tr></thead><tbody>' +
      '<tr><td>Carries blood</td><td>away from heart</td><td>to and from cells</td><td>back to heart</td></tr>' +
      '<tr><td>Wall</td><td>thick, elastic, muscle</td><td>one cell thick</td><td>thin</td></tr>' +
      '<tr><td>Pressure</td><td>high</td><td>low</td><td>very low</td></tr>' +
      '<tr><td>Valves</td><td>no</td><td>no</td><td><b>yes</b></td></tr></tbody>', left);
    tab.style.cssText = 'font-size:18px;margin-top:8px;width:640px';
    tab.querySelectorAll('td,th').forEach(function (c) { c.style.textAlign = 'left'; c.style.padding = '5px 10px'; });
    // muscle pump
    var s = D.svgRoot(right, 420, 470, 'A vein in the calf with one-way valves; contracting muscles squeeze blood upwards towards the heart');
    s.setAttribute('width', 300); s.setAttribute('height', 336);   // drawn at 420 × 470, shown smaller to leave room for the controls
    var X = 210, TOP = 40, BOT = 440, VALVES = [140, 250, 360];
    var muscL = sv('ellipse', { cx: X - 92, cy: 300, rx: 60, ry: 120, fill: '#d9826b', stroke: '#9c4b37', 'stroke-width': 3 }, s);
    var muscR = sv('ellipse', { cx: X + 92, cy: 300, rx: 60, ry: 120, fill: '#d9826b', stroke: '#9c4b37', 'stroke-width': 3 }, s);
    var vein = sv('rect', { x: X - 26, y: TOP, width: 52, height: BOT - TOP, rx: 12, fill: '#e6edfb', stroke: C.deoxy, 'stroke-width': 3 }, s);
    txt(s, X, 26, '↑ to the heart', { 'text-anchor': 'middle', 'font-size': 19, 'font-weight': 800, fill: C.deoxy });
    txt(s, X, 466, 'from capillaries', { 'text-anchor': 'middle', 'font-size': 16, fill: C.muted });
    var vg = VALVES.map(function (y) {
      return [sv('line', { x1: X - 24, y1: y + 12, x2: X, y2: y - 4, stroke: C.navy, 'stroke-width': 4, 'stroke-linecap': 'round' }, s),
              sv('line', { x1: X + 24, y1: y + 12, x2: X, y2: y - 4, stroke: C.navy, 'stroke-width': 4, 'stroke-linecap': 'round' }, s)];
    });
    var dotG = sv('g', {}, s), dots = [];
    for (var i = 0; i < 26; i++) dots.push({ y: TOP + 20 + i * 15, e: sv('circle', { cx: X + ((i % 3) - 1) * 10, r: 6, fill: C.deoxy }, dotG) });
    var bg = hx('div', 'btngroup', null, right); bg.style.marginTop = '6px';
    var walk = btn('▶ Walk', bg, 'sm'), stand = btn('Stand still', bg, 'sm'), brk = btn('Valves: working', bg, 'ghost sm');
    var ro = hx('div', 'readouts', null, right); ro.style.marginTop = '10px';
    var rR = D.readout(ro, 'Venous return', C.deoxy);
    var walking = false, broken = false, t = 0, raf = null, last = 0, returned = 0, hist = [];
    function draw() {
      var sq = walking ? Math.max(0, Math.sin(t * Math.PI * 2 * 0.9)) : 0;
      muscL.setAttribute('rx', 60 + sq * 16); muscR.setAttribute('rx', 60 + sq * 16);
      vein.setAttribute('x', X - 26 + sq * 10); vein.setAttribute('width', 52 - sq * 20);
      dots.forEach(function (d) { d.e.setAttribute('cy', d.y); });
      vg.forEach(function (v, k) {
        var open = !broken && sq > 0.2;
        v[0].setAttribute('x2', X - (open ? 18 : 0)); v[1].setAttribute('x2', X + (open ? 18 : 0));
        v[0].setAttribute('opacity', broken ? .35 : 1); v[1].setAttribute('opacity', broken ? .35 : 1);
      });
    }
    function step(dt) {
      t += dt;
      var sq = walking ? Math.max(0, Math.sin(t * Math.PI * 2 * 0.9)) : 0;
      dots.forEach(function (d) {
        // squeezed upward, otherwise sinks under gravity; without valves a squeeze pushes blood both ways, so little goes up
        var v = walking && sq > 0.05 ? (broken ? -60 : -180) * sq : (broken ? 90 : 30);
        var ny = d.y + v * dt;
        if (v > 0 && !broken) VALVES.forEach(function (vy) { if (d.y <= vy - 6 && ny > vy - 6) ny = vy - 6; });   // valves stop backflow
        d.y = ny;
        if (d.y < TOP + 8) { d.y = BOT - 10; returned++; }
        if (d.y > BOT - 8) d.y = BOT - 8;
      });
      hist.push([t, returned]); while (hist.length && hist[0][0] < t - 4) hist.shift();
      var rate = hist.length > 1 ? (hist[hist.length - 1][1] - hist[0][1]) / (hist[hist.length - 1][0] - hist[0][0]) : 0;
      rR.textContent = rate > 2 ? 'high' : rate > 0.3 ? 'some' : 'very low';
      rR.style.color = rate > 2 ? C.green : rate > 0.3 ? C.amber : C.red;
    }
    function tick(ts) { var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts; if (D.isCur(el)) { step(dt); draw(); } raf = requestAnimationFrame(tick); }
    var note = hx('div', 'note-box', '', right); note.style.marginTop = '10px';
    function msg() {
      note.innerHTML = broken ? '<b>Valves not working:</b> blood falls back between squeezes and pools in the legs (as in varicose veins).'
        : walking ? '<b>Muscle pump:</b> each contraction squeezes the vein; the valves only let blood go up, towards the heart.'
        : '<b>Standing still:</b> no squeezing, so blood pools in the leg veins. Venous return, EDV and stroke volume fall.';
      walk.setAttribute('aria-pressed', walking); stand.setAttribute('aria-pressed', !walking); brk.textContent = 'Valves: ' + (broken ? 'broken' : 'working');
    }
    walk.addEventListener('click', function () { walking = true; msg(); });
    stand.addEventListener('click', function () { walking = false; msg(); });
    brk.addEventListener('click', function () { broken = !broken; msg(); });
    msg(); draw(); raf = requestAnimationFrame(tick);
  };

  /* ---------- acute response to dynamic and isometric exercise ---------- */
  W.exercise = function (el) {
    var REG = [['Muscle', '#c43c6b', 0.20, 0.84], ['Gut, liver & kidneys', '#e08a2a', 0.46, 0.03], ['Brain', '#7b55b8', 0.15, 0.04], ['Heart', '#d23c3c', 0.04, 0.04], ['Skin', '#e2c341', 0.06, 0.02], ['Other', '#9aa7ad', 0.09, 0.03]];
    var iso = false;
    var row = hx('div', 'row', null, el); row.style.gap = '26px';
    var left = hx('div', null, null, row); left.style.flex = '0 0 700px';
    var right = hx('div', 'col', null, row);
    var top = hx('div', 'row', null, left); top.style.cssText = 'gap:16px;align-items:center;margin-bottom:8px';
    var iS = D.slider(top, 'Intensity', 0, 100, 1, 0, 300);
    var iV = hx('span', null, '', top); iV.style.cssText = 'font-size:20px;font-weight:800;min-width:150px';
    var s = D.svgRoot(left, 700, 400, 'Heart rate, stroke volume, cardiac output and blood pressure against exercise intensity');
    var x0 = 70, w = 600, y0 = 10, h = 330, X = D.lin(0, 100, x0, x0 + w), Y = D.lin(0, 230, y0 + h, y0);
    [0, 50, 100, 150, 200].forEach(function (v) { sv('line', { x1: x0, x2: x0 + w, y1: Y(v), y2: Y(v), stroke: C.line }, s); txt(s, x0 - 10, Y(v) + 6, v, { 'text-anchor': 'end', 'font-size': 16, fill: C.muted }); });
    [0, 25, 50, 75, 100].forEach(function (v) { txt(s, X(v), y0 + h + 24, v + (v === 100 ? ' % (max)' : ''), { 'text-anchor': 'middle', 'font-size': 16, fill: C.muted }); });
    txt(s, x0 + w / 2, y0 + h + 52, 'Exercise intensity (% of maximum)', { 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700 });
    sv('line', { x1: x0, x2: x0 + w, y1: y0 + h, y2: y0 + h, stroke: C.ink, 'stroke-width': 2 }, s);
    function model(i) {   // i from 0 to 1
      if (iso) return { hr: 70 + 50 * i, sv: 70 - 5 * i, sbp: 120 + 80 * i, dbp: 78 + 45 * i };
      return { hr: 70 + 120 * i, sv: 70 + 40 * Math.min(1, i / 0.5), sbp: 120 + 70 * i, dbp: 78 - 6 * i };
    }
    var L = [['hr', 'HR (bpm)', C.red], ['sv', 'SV (mL)', C.teal], ['sbp', 'Systolic (mmHg)', '#8b3556'], ['dbp', 'Diastolic (mmHg)', C.deoxy]];
    // legend rather than end labels: HR and systolic finish at about the same value
    L.forEach(function (l, k) { sv('rect', { x: x0 + 14 + k * 150, y: y0 + 4, width: 18, height: 6, rx: 3, fill: l[2] }, s); txt(s, x0 + 38 + k * 150, y0 + 12, l[1], { 'font-size': 15, 'font-weight': 800, fill: l[2] }); });
    var lines = L.map(function (l) { return { k: l[0], p: sv('path', { fill: 'none', stroke: l[2], 'stroke-width': 4 }, s), dot: sv('circle', { r: 8, fill: l[2], stroke: '#fff', 'stroke-width': 2 }, s) }; });
    var cur = sv('line', { y1: y0, y2: y0 + h, stroke: C.ink, 'stroke-dasharray': '5 5' }, s);
    var bg = hx('div', 'btngroup', null, right);
    var bD = btn('Dynamic (running, cycling)', bg, 'sm'), bI = btn('Isometric (heavy hold)', bg, 'sm');
    var ro = hx('div', 'readouts', null, right); ro.style.marginTop = '10px';
    var rQ = D.readout(ro, 'Cardiac output', C.navy), rB = D.readout(ro, 'Blood pressure', '#8b3556');
    hx('div', 'ctrl-label', 'Where the cardiac output goes (L/min)', right).style.cssText += ';display:block;margin-top:12px';
    var bars = hx('div', null, null, right); bars.style.cssText = 'display:grid;grid-template-columns:170px 1fr 60px;gap:5px 10px;align-items:center;font-size:16px;margin-top:6px';
    var B = REG.map(function (r) {
      hx('div', null, r[0], bars);
      var tr = hx('div', null, null, bars); tr.style.cssText = 'height:18px;background:#eef3f4;border-radius:5px;position:relative';
      var f = hx('div', null, null, tr); f.style.cssText = 'position:absolute;left:0;top:0;bottom:0;border-radius:5px;background:' + r[1];
      var v = hx('div', null, '', bars); v.style.fontWeight = '800';
      return { f: f, v: v, r: r };
    });
    var note = hx('div', 'note-box', '', right); note.style.cssText += ';margin-top:10px;font-size:18px';
    function upd() {
      var i = +iS.value / 100, m = model(i), q = m.hr * m.sv / 1000;
      lines.forEach(function (o) {
        var d = ''; for (var k = 0; k <= 100; k += 2) d += (d ? 'L' : 'M') + X(k).toFixed(1) + ',' + Y(model(k / 100)[o.k]).toFixed(1);
        o.p.setAttribute('d', d); o.dot.setAttribute('cx', X(i * 100)); o.dot.setAttribute('cy', Y(m[o.k]));
      });
      cur.setAttribute('x1', X(i * 100)); cur.setAttribute('x2', X(i * 100));
      iV.textContent = i === 0 ? 'Rest' : Math.round(i * 100) + ' %';
      rQ.textContent = D.fx(q, 1) + ' L/min'; rB.textContent = Math.round(m.sbp) + '/' + Math.round(m.dbp);
      var share = iso ? 0 : i;
      B.forEach(function (b) { var fr = b.r[2] + (b.r[3] - b.r[2]) * share, lv = fr * q; b.f.style.width = Math.min(100, lv / 24 * 100) + '%'; b.v.textContent = D.fx(lv, 1); });
      note.innerHTML = iso ? '<b>Isometric:</b> contracted muscle squeezes its own arteries, so resistance rises and <b>both</b> systolic and diastolic climb sharply. Avoid breath-holding (Valsalva) during heavy lifts.'
        : i < 0.05 ? '<b>Rest:</b> about 5 L/min, with most going to the gut, liver and kidneys.'
        : i < 0.55 ? '<b>Rising:</b> HR and SV both rise. Systolic climbs; diastolic stays about the same as muscle arterioles dilate.'
        : '<b>Near maximum:</b> SV has plateaued, so extra output comes from HR. Over 80 % of the blood goes to working muscle. After stopping, BP can stay below resting for hours (post-exercise hypotension).';
      bD.setAttribute('aria-pressed', !iso); bI.setAttribute('aria-pressed', iso);
    }
    iS.addEventListener('input', upd);
    bD.addEventListener('click', function () { iso = false; upd(); });
    bI.addEventListener('click', function () { iso = true; upd(); });
    upd();
  };

  /* ---------- standing up: baroreflex, orthostatic hypotension, vasovagal faint ---------- */
  W.standup = function (el) {
    var CASES = {
      healthy: { n: 'Healthy', f: function (t) { var d = t - 10; if (d < 0) return [118, 76, 64]; var dip = 22 * Math.exp(-d / 4) * Math.min(1, d / 1.5); return [118 - dip + 2 * (1 - Math.exp(-d / 6)), 76 - dip * 0.5 + 4 * (1 - Math.exp(-d / 6)), 64 + 14 * (1 - Math.exp(-d / 3)) - 4 * (1 - Math.exp(-d / 20))]; },
        msg: '<b>Healthy:</b> standing pools about 500 mL of blood in the legs, so BP dips for a few seconds. Baroreceptors detect the drop and the reflex raises heart rate and constricts vessels, so BP recovers within about 10–20 s.' },
      ortho: { n: 'Orthostatic hypotension', f: function (t) { var d = t - 10; if (d < 0) return [124, 78, 68]; var drop = 30 * (1 - Math.exp(-d / 5)); return [124 - drop, 78 - drop * 0.45, 68 + 10 * (1 - Math.exp(-d / 4))]; },
        msg: '<b>Orthostatic hypotension:</b> a sustained drop of <b>≥20 mmHg systolic</b> (or ≥10 diastolic) within 3 minutes of standing. The reflex cannot compensate: common with dehydration, some BP medicines, older age and after bed rest. Symptoms: dizziness, blurred vision, fainting.' },
      vaso: { n: 'Vasovagal faint', f: function (t) { var d = t - 10; if (d < 0) return [116, 74, 66]; var base = [116 - 6 * Math.exp(-d / 4), 74 - 3 * Math.exp(-d / 4), 66 + 12 * (1 - Math.exp(-d / 3))]; var f = d > 28 ? 1 - Math.exp(-(d - 28) / 2.5) : 0; return [base[0] - 48 * f, base[1] - 30 * f, base[2] - 36 * f]; },
        msg: '<b>Vasovagal syncope:</b> a sudden surge of vagal (parasympathetic) activity and loss of sympathetic tone: heart rate <b>and</b> blood pressure both fall, so the brain gets too little blood and the person faints. Triggers: pain, needles, the sight of blood, heat, standing a long time. Lie them down and raise their legs.' }
    };
    var cur = 'healthy';
    var row = hx('div', 'row', null, el); row.style.gap = '26px';
    var left = hx('div', null, null, row); left.style.flex = '0 0 760px';
    var right = hx('div', 'col', null, row);
    var bg = hx('div', 'btngroup', null, left); bg.style.marginBottom = '8px';
    var bs = Object.keys(CASES).map(function (k) { var b = btn(CASES[k].n, bg, 'sm'); b.addEventListener('click', function () { cur = k; play(); }); b.dataset.k = k; return b; });
    var s = D.svgRoot(left, 760, 400, 'Systolic, diastolic and heart rate over 60 seconds, lying down then standing up at 10 seconds');
    var x0 = 70, w = 660, y0 = 10, h = 320, X = D.lin(0, 60, x0, x0 + w), Y = D.lin(30, 150, y0 + h, y0);
    sv('rect', { x: X(0), y: y0, width: X(10) - X(0), height: h, fill: '#eef3f4' }, s);
    txt(s, X(5), y0 + 24, 'lying', { 'text-anchor': 'middle', 'font-size': 17, 'font-weight': 700, fill: C.muted });
    txt(s, X(10) + 6, y0 + h - 10, 'stands up →', { 'font-size': 17, 'font-weight': 700, fill: C.ink });
    [40, 60, 80, 100, 120, 140].forEach(function (v) { sv('line', { x1: x0, x2: x0 + w, y1: Y(v), y2: Y(v), stroke: C.line }, s); txt(s, x0 - 10, Y(v) + 6, v, { 'text-anchor': 'end', 'font-size': 16, fill: C.muted }); });
    [0, 10, 20, 30, 40, 50, 60].forEach(function (v) { txt(s, X(v), y0 + h + 24, v, { 'text-anchor': 'middle', 'font-size': 16, fill: C.muted }); });
    txt(s, x0 + w / 2, y0 + h + 52, 'Time (s)', { 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700 });
    sv('line', { x1: x0, x2: x0 + w, y1: y0 + h, y2: y0 + h, stroke: C.ink, 'stroke-width': 2 }, s);
    var P = [['Systolic (mmHg)', '#8b3556'], ['Diastolic (mmHg)', C.deoxy], ['Heart rate (bpm)', C.red]].map(function (l, k) {
      sv('rect', { x: X(13) + k * 165, y: y0 + 14, width: 18, height: 6, rx: 3, fill: l[1] }, s);
      txt(s, X(13) + 24 + k * 165, y0 + 22, l[0], { 'font-size': 15, 'font-weight': 800, fill: l[1] });
      return { p: sv('path', { fill: 'none', stroke: l[1], 'stroke-width': 4 }, s) };
    });
    var note = hx('div', 'note-box', '', right);
    hx('div', 'card t-amber', '<h3 style="font-size:21px">Blood pressure medicines</h3><ul style="font-size:17px;line-height:1.4"><li><b>ACE inhibitors, calcium channel blockers:</b> relax and widen vessels</li><li><b>Diuretics:</b> remove fluid, so blood volume falls</li><li><b>Beta blockers:</b> lower HR and force of contraction. HR stays low in exercise, so HR zones and 220 − age don\'t apply</li></ul>', right).style.marginTop = '12px';
    var raf = null, T = 0, last = 0;
    function draw(upto) {
      var d = ['', '', ''];
      for (var t = 0; t <= upto; t += 0.25) { var v = CASES[cur].f(t); for (var k = 0; k < 3; k++) d[k] += (d[k] ? 'L' : 'M') + X(t).toFixed(1) + ',' + Y(v[k]).toFixed(1); }
      P.forEach(function (o, k) { o.p.setAttribute('d', d[k]); });
    }
    function tick(ts) {
      var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
      if (D.isCur(el)) { T = Math.min(60, T + dt * 15); draw(T); }
      if (T < 60) raf = requestAnimationFrame(tick); else raf = null;
    }
    function play() {
      bs.forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.k === cur); });
      note.innerHTML = CASES[cur].msg;
      cancelAnimationFrame(raf); T = 0; last = 0; raf = requestAnimationFrame(tick);
    }
    play();
  };
})();
