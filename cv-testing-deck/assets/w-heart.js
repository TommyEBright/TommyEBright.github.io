/* Heart widgets: blood flow route, conduction and cardiac cycle, ECG quiz, autonomic control of heart rate. */
(function () {
  'use strict';
  var D = window.DV, C = D.C, sv = D.sv, txt = D.txt, hx = D.hx, btn = D.btn;
  var W = window.DeckWidgets;
  var RA = '#dce6fb', RB = '#fbe0e0';   // light fills for the right (oxygen-poor) and left (oxygen-rich) sides

  // one beat of an idealised ECG, t in seconds from the start of the P wave (beat drawn at 75 bpm)
  function g(t, m, s) { return Math.exp(-0.5 * (t - m) * (t - m) / (s * s)); }
  function ecg(t) {
    return 0.15 * g(t, 0.08, 0.022) - 0.12 * g(t, 0.165, 0.008) + 1.0 * g(t, 0.185, 0.009) - 0.26 * g(t, 0.205, 0.009) + 0.3 * g(t, 0.40, 0.04);
  }

  /* ---------- blood flow route ---------- */
  W.flow = function (el) {
    var ORDER = ['vc', 'ra', 'tri', 'rv', 'pv', 'pa', 'lungs', 'pvein', 'la', 'mit', 'lv', 'av', 'ao', 'body'];
    var NAMES = { vc: 'Vena cavae', ra: 'Right atrium', tri: 'Tricuspid valve', rv: 'Right ventricle', pv: 'Pulmonary valve', pa: 'Pulmonary artery',
      lungs: 'Lungs', pvein: 'Pulmonary veins', la: 'Left atrium', mit: 'Mitral (bicuspid) valve', lv: 'Left ventricle', av: 'Aortic valve', ao: 'Aorta', body: 'Body' };
    var HINT = { vc: 'Blood returns from the body in the two largest veins.', ra: 'Which chamber collects blood from the body?', tri: 'There is a valve between the right atrium and right ventricle.',
      rv: 'Which chamber pumps blood to the lungs?', pv: 'Blood leaves the right ventricle through a valve into an artery.', pa: 'This is the only artery that carries oxygen-poor blood.',
      lungs: 'Where does blood pick up oxygen?', pvein: 'Oxygen-rich blood comes back from the lungs in veins.', la: 'Which chamber collects blood from the lungs?',
      mit: 'There is a valve between the left atrium and left ventricle.', lv: 'Which chamber pumps blood to the whole body?', av: 'Blood leaves the left ventricle through a valve.',
      ao: 'The largest artery in the body.', body: 'Where does the oxygen-rich blood go?' };
    var next = 0, playing = false, raf = null, last = 0, phase = 0;
    var row = hx('div', 'row', null, el); row.style.gap = '28px';
    var left = hx('div', null, null, row); left.style.flex = '0 0 860px';
    var right = hx('div', 'col', null, row);
    var s = D.svgRoot(left, 860, 600, 'Diagram of the heart, lungs and body. Click the structures in the order blood flows through them.');
    var parts = {};
    function part(k, draw, lx, ly, opts) {
      var gg = sv('g', { tabindex: 0, role: 'button', 'aria-label': NAMES[k], style: 'cursor:pointer' }, s);
      draw(gg);
      var lab = txt(gg, lx, ly, (opts && opts.label) || NAMES[k], { 'text-anchor': 'middle', 'font-size': (opts && opts.fs) || 19, 'font-weight': 700, fill: C.ink });
      parts[k] = { g: gg, lab: lab, shapes: gg.querySelectorAll('rect,path,line') };
      gg.addEventListener('click', function () { pick(k); });
      gg.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); pick(k); } });
    }
    function tube(gg, d, col, w) {
      sv('path', { d: d, fill: 'none', stroke: col, 'stroke-width': w || 34, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: .35 }, gg);
      return sv('path', { d: d, fill: 'none', stroke: col, 'stroke-width': 4, 'stroke-dasharray': '2 8', 'stroke-linecap': 'round' }, gg);
    }
    // lungs and body boxes
    part('lungs', function (gg) { sv('rect', { x: 250, y: 14, width: 360, height: 74, rx: 30, fill: '#f6e6ef', stroke: '#b65b86', 'stroke-width': 3 }, gg); }, 430, 58, { fs: 22 });
    part('body', function (gg) { sv('rect', { x: 50, y: 530, width: 770, height: 60, rx: 26, fill: '#eef2f4', stroke: C.muted, 'stroke-width': 3 }, gg); }, 430, 567, { label: 'Body (tissues)', fs: 22 });
    // great vessels
    part('vc', function (gg) { tube(gg, 'M75,150 V235 Q75,250 130,250', C.deoxy); tube(gg, 'M75,520 V305 Q75,285 130,285', C.deoxy); }, 66, 130, { label: 'Vena cavae' });
    part('pa', function (gg) { tube(gg, 'M370,318 V140 Q370,104 340,96', C.deoxy, 40); }, 278, 150, { label: 'Pulmonary artery', fs: 17 });
    // the aorta is drawn before the pulmonary veins so the veins sit on top where they cross
    part('ao', function (gg) { tube(gg, 'M490,318 V120 Q490,100 560,100 H760 Q790,100 790,140 V520', C.oxy, 40); }, 790, 92, { label: 'Aorta' });
    part('pvein', function (gg) { tube(gg, 'M600,92 Q660,100 660,140 V188', C.oxy); }, 568, 160, { label: 'Pulmonary veins', fs: 17 });
    // chambers (drawn as seen from the front, so the right side of the heart is on the left of the screen)
    part('ra', function (gg) { sv('rect', { x: 130, y: 190, width: 190, height: 118, rx: 26, fill: RA, stroke: C.deoxy, 'stroke-width': 4 }, gg); }, 225, 255);
    part('la', function (gg) { sv('rect', { x: 545, y: 190, width: 190, height: 118, rx: 26, fill: RB, stroke: C.oxy, 'stroke-width': 4 }, gg); }, 640, 255);
    part('rv', function (gg) { sv('path', { d: 'M130,336 H410 V430 Q410,500 330,500 H210 Q130,500 130,430 Z', fill: RA, stroke: C.deoxy, 'stroke-width': 5 }, gg); }, 260, 450);
    part('lv', function (gg) { sv('path', { d: 'M450,336 H735 V440 Q735,512 640,512 H530 Q450,512 450,440 Z', fill: RB, stroke: C.oxy, 'stroke-width': 13 }, gg); }, 610, 460);
    // valves (short bars that open when blood passes)
    part('tri', function (gg) { sv('rect', { x: 180, y: 312, width: 100, height: 20, rx: 6, fill: '#fff', stroke: C.deoxy, 'stroke-width': 3 }, gg); }, 230, 362, { label: 'Tricuspid', fs: 16 });
    part('pv', function (gg) { sv('rect', { x: 345, y: 312, width: 50, height: 20, rx: 6, fill: '#fff', stroke: C.deoxy, 'stroke-width': 3 }, gg); }, 362, 362, { label: 'Pulm. valve', fs: 15 });
    part('av', function (gg) { sv('rect', { x: 465, y: 312, width: 50, height: 20, rx: 6, fill: '#fff', stroke: C.oxy, 'stroke-width': 3 }, gg); }, 512, 362, { label: 'Aortic valve', fs: 15 });
    part('mit', function (gg) { sv('rect', { x: 585, y: 312, width: 100, height: 20, rx: 6, fill: '#fff', stroke: C.oxy, 'stroke-width': 3 }, gg); }, 635, 362, { label: 'Mitral', fs: 16 });
    txt(s, 430, 430, 'septum', { 'text-anchor': 'middle', 'font-size': 14, fill: C.faint, transform: 'rotate(-90 430 430)' });
    // circulation path for the animation: body → right heart → lungs → left heart → body
    var route = sv('path', { d: 'M430,560 H75 V250 H225 V410 H370 V96 H430 H600 Q660,100 660,250 V420 H490 V100 H790 V560 H430', fill: 'none', stroke: 'none' }, s);
    var dotsG = sv('g', { 'pointer-events': 'none' }, s);
    var L = route.getTotalLength(), dots = [];
    // where along the path blood is oxygenated (between the lungs and the body)
    var oxyFrom = 0, oxyTo = 0;
    (function () { var acc = 0, prev = route.getPointAtLength(0);
      for (var l = 4; l <= L; l += 4) { var p = route.getPointAtLength(l); acc = l;
        if (!oxyFrom && p.y < 100 && p.x >= 430) oxyFrom = l;
        if (oxyFrom && !oxyTo && p.x >= 785 && p.y > 540) oxyTo = l; prev = p; } })();
    for (var i = 0; i < 26; i++) dots.push(sv('circle', { r: 8, stroke: '#fff', 'stroke-width': 2, opacity: 0 }, dotsG));

    // right panel
    hx('div', 'ctrl-label', 'Your route so far', right);
    var list = hx('ol', null, null, right); list.style.cssText = 'margin:6px 0 10px;padding-left:28px;font-size:19px;line-height:1.38;columns:2;column-gap:18px;min-height:280px';
    var note = hx('div', 'note-box', 'Start where oxygen-poor blood returns from the <b>body</b>.', right);
    var bg = hx('div', 'btngroup', null, right); bg.style.marginTop = '12px';
    var play = btn('▶ Play circulation', bg), show = btn('Show the route', bg, 'ghost sm'), rs = btn('Reset', bg, 'ghost sm');
    play.disabled = true;

    function mark(k, ok) {
      var p = parts[k];
      p.g.querySelectorAll('rect,path').forEach(function (x) { if (x.getAttribute('stroke-dasharray')) return; x.style.filter = ok ? 'drop-shadow(0 0 6px rgba(242,169,0,.9))' : ''; });
      p.lab.style.fill = ok ? C.tealD : C.ink;
    }
    function pick(k) {
      if (next >= ORDER.length) return;
      var want = ORDER[next];
      if (k === want || (next === 0 && k === 'body')) {
        if (next === 0 && k === 'body') { note.innerHTML = 'Good start: blood leaves the <b>body</b> tissues oxygen-poor. Now, which vessels bring it back to the heart?'; return; }
        mark(k, true); next++;
        hx('li', null, NAMES[k], list).style.color = next <= 6 ? C.deoxy : (next <= 13 ? C.oxy : C.ink);
        note.innerHTML = next < ORDER.length ? '<b>✓ ' + NAMES[k] + '.</b> ' + (next === 7 ? 'Blood now picks up oxygen and gets rid of CO₂.' : 'What comes next?')
          : '<b>Complete!</b> Body → right heart → lungs → left heart → body. Press <b>Play</b> to watch it circulate.';
        if (next === ORDER.length) play.disabled = false;
      } else {
        var p = parts[k];
        p.g.querySelectorAll('rect,path').forEach(function (x) { x.style.transition = 'opacity .15s'; x.style.opacity = .3; setTimeout(function () { x.style.opacity = ''; }, 250); });
        note.innerHTML = '<b>Not ' + NAMES[k] + ' yet.</b> Hint: ' + HINT[want];
      }
    }
    function showAll() { while (next < ORDER.length) pick(ORDER[next]); }
    function reset() {
      stop(); next = 0; list.innerHTML = ''; play.disabled = true;
      ORDER.forEach(function (k) { mark(k, false); });
      dots.forEach(function (d) { d.setAttribute('opacity', 0); });
      note.innerHTML = 'Start where oxygen-poor blood returns from the <b>body</b>.';
    }
    function draw() {
      dots.forEach(function (d, i) {
        var l = ((i / dots.length) * L + phase) % L, p = route.getPointAtLength(l);
        d.setAttribute('cx', p.x); d.setAttribute('cy', p.y); d.setAttribute('opacity', 1);
        d.setAttribute('fill', l >= oxyFrom && l < oxyTo ? C.oxy : C.deoxy);
      });
    }
    function tick(ts) {
      if (!playing) return;
      var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
      if (D.isCur(el)) { phase = (phase + dt * 120) % L; draw(); }
      raf = requestAnimationFrame(tick);
    }
    function stop() { playing = false; cancelAnimationFrame(raf); play.textContent = '▶ Play circulation'; }
    play.addEventListener('click', function () {
      if (playing) { stop(); return; }
      playing = true; last = 0; play.textContent = '❚❚ Pause'; raf = requestAnimationFrame(tick);
    });
    show.addEventListener('click', showAll);
    rs.addEventListener('click', reset);
  };

  /* ---------- conduction system and cardiac cycle ---------- */
  W.cycle = function (el) {
    // stages within one beat at 75 bpm (0.8 s); ends in seconds
    var ST = [
      { end: 0.04, t: 'SA node fires', d: 'The <b>sinoatrial (SA) node</b>, the pacemaker in the right atrium, sends out an impulse.', ecg: 'Start of P wave', on: ['sa'], mech: 'Atria and ventricles relaxed, filling' },
      { end: 0.12, t: 'Atria depolarise and contract', d: 'The impulse spreads across both atria, which contract (<b>atrial systole</b>) and top up the ventricles.', ecg: 'P wave', on: ['sa', 'atria'], mech: 'Atrial systole · AV valves open' },
      { end: 0.165, t: 'Delay at the AV node', d: 'The <b>atrioventricular (AV) node</b> holds the impulse for about 0.1 s, so the atria finish emptying before the ventricles contract.', ecg: 'PR segment', on: ['av'], mech: 'Ventricles finish filling' },
      { end: 0.22, t: 'Bundle of His and Purkinje fibres', d: 'The impulse runs down the <b>AV bundle (bundle of His)</b> in the septum, then through the fast <b>Purkinje fibres</b> so the ventricles contract together from the apex upwards.', ecg: 'QRS complex', on: ['his', 'pk', 'vents'], mech: 'AV valves close: "lub"' },
      { end: 0.34, t: 'Ventricles contract', d: '<b>Ventricular systole</b>: pressure rises, the pulmonary and aortic valves open and blood is ejected to the lungs and body.', ecg: 'ST segment', on: ['vents'], mech: 'Ventricular systole · semilunar valves open' },
      { end: 0.48, t: 'Ventricles repolarise', d: 'The ventricles reset electrically and begin to relax.', ecg: 'T wave', on: [], mech: 'Semilunar valves close: "dub"' },
      { end: 0.8, t: 'Diastole: the heart relaxes and fills', d: '<b>Diastole</b>: all four chambers are relaxed and blood flows in from the veins. Most ventricular filling happens now, before the atria contract.', ecg: 'Flat line (TP segment)', on: [], mech: 'Diastole · AV valves open' }
    ];
    var hr = 75, t = 0, playing = false, slow = 0.25, raf = null, last = 0;
    var row = hx('div', 'row', null, el); row.style.gap = '26px';
    var left = hx('div', null, null, row); left.style.flex = '0 0 520px';
    var right = hx('div', 'col', null, row);
    var s = D.svgRoot(left, 520, 560, 'Heart conduction system: SA node, AV node, bundle of His and Purkinje fibres, with the chambers lighting up during one beat');
    var atriaG = sv('g', {}, s), ventG = sv('g', {}, s);
    var ra = sv('rect', { x: 40, y: 40, width: 200, height: 160, rx: 30, fill: RA, stroke: C.deoxy, 'stroke-width': 4 }, atriaG);
    var la = sv('rect', { x: 280, y: 40, width: 200, height: 160, rx: 30, fill: RB, stroke: C.oxy, 'stroke-width': 4 }, atriaG);
    var rv = sv('path', { d: 'M40,230 H250 V400 Q250,520 160,520 Q40,520 40,400 Z', fill: RA, stroke: C.deoxy, 'stroke-width': 5 }, ventG);
    var lv = sv('path', { d: 'M270,230 H480 V400 Q480,520 360,520 Q270,520 270,400 Z', fill: RB, stroke: C.oxy, 'stroke-width': 11 }, ventG);
    [['Right atrium', 140, 140], ['Left atrium', 380, 130], ['Right ventricle', 140, 360], ['Left ventricle', 380, 360]].forEach(function (a) {
      txt(s, a[1], a[2], a[0], { 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700, fill: C.muted });
    });
    // valves: AV valves between atria and ventricles
    var valves = [sv('rect', { x: 90, y: 206, width: 100, height: 16, rx: 5, fill: '#fff', stroke: C.deoxy, 'stroke-width': 3 }, s),
      sv('rect', { x: 330, y: 206, width: 100, height: 16, rx: 5, fill: '#fff', stroke: C.oxy, 'stroke-width': 3 }, s)];
    var cond = '#f2a900';
    var sa = sv('circle', { cx: 80, cy: 76, r: 16, fill: '#fff', stroke: cond, 'stroke-width': 4 }, s);
    txt(s, 104, 82, 'SA node', { 'font-size': 18, 'font-weight': 800, fill: '#8a6200' });
    var av = sv('circle', { cx: 228, cy: 182, r: 14, fill: '#fff', stroke: cond, 'stroke-width': 4 }, s);
    txt(s, 208, 188, 'AV node', { 'text-anchor': 'end', 'font-size': 18, 'font-weight': 800, fill: '#8a6200' });
    var his = sv('path', { d: 'M240,190 V240 L260,250 V420', fill: 'none', stroke: cond, 'stroke-width': 6, 'stroke-linecap': 'round' }, s);
    var pk = sv('path', { d: 'M260,420 Q250,505 160,505 Q60,500 58,400 V300 M260,420 Q270,505 360,505 Q462,500 464,400 V300', fill: 'none', stroke: cond, 'stroke-width': 4, 'stroke-dasharray': '10 5' }, s);
    txt(s, 270, 470, 'Purkinje fibres', { 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 800, fill: '#8a6200' });
    txt(s, 234, 290, 'Bundle of His', { 'text-anchor': 'end', 'font-size': 15, 'font-weight': 800, fill: '#8a6200' });
    // impulse spot running along the conduction path
    var spot = sv('circle', { r: 10, fill: '#fff6cc', stroke: '#e08a00', 'stroke-width': 3, opacity: 0 }, s);
    var pathAtria = sv('path', { d: 'M80,76 Q160,90 228,182', fill: 'none', stroke: 'none' }, s);

    // ECG strip (three beats) with a sweeping cursor
    var E = D.svgRoot(right, 820, 210, 'ECG trace for three beats with a cursor showing the current moment');
    sv('rect', { x: 0, y: 0, width: 820, height: 210, rx: 10, fill: '#fff7f7', stroke: '#f0c9c9' }, E);
    for (var gx = 0; gx <= 820; gx += 20) sv('line', { x1: gx, y1: 0, x2: gx, y2: 210, stroke: gx % 100 ? '#f6dada' : '#efbcbc', 'stroke-width': 1 }, E);
    for (var gy = 10; gy <= 210; gy += 20) sv('line', { x1: 0, y1: gy, x2: 820, y2: gy, stroke: (gy - 10) % 100 ? '#f6dada' : '#efbcbc', 'stroke-width': 1 }, E);
    var trace = sv('path', { fill: 'none', stroke: '#b3262b', 'stroke-width': 3, 'stroke-linejoin': 'round' }, E);
    var hiRect = sv('rect', { y: 6, height: 198, rx: 6, fill: 'rgba(242,169,0,.22)' }, E);
    var cursor = sv('line', { y1: 0, y2: 210, stroke: C.navy, 'stroke-width': 2 }, E);
    var ecgLab = txt(E, 810, 26, '', { 'text-anchor': 'end', 'font-size': 18, 'font-weight': 800, fill: '#8a1f22' });
    var PXS = 0; // pixels per second, set from heart rate

    var box = hx('div', 'note-box', '', right); box.style.cssText += ';margin-top:12px;min-height:150px';
    var mech = hx('div', 'tag', '', right); mech.style.cssText = 'margin-top:10px;font-size:16px';
    var ctr = hx('div', 'row', null, right); ctr.style.cssText = 'margin-top:14px;gap:14px;align-items:center;flex-wrap:wrap';
    var bg = hx('div', 'btngroup', null, ctr);
    var prev = btn('‹ Step', bg, 'sm'), stepB = btn('Step ›', bg, 'sm'), play = btn('▶ Play', bg, 'sm'), sl = btn('Slow motion', bg, 'sm');
    sl.setAttribute('aria-pressed', 'true');
    var hrS = D.slider(ctr, 'Heart rate', 40, 180, 1, hr, 170);
    var hrV = hx('span', null, hr + ' bpm', ctr); hrV.style.cssText = 'font-size:20px;font-weight:800;min-width:90px';

    // stage timings stretch with heart rate: systole shortens a little, diastole a lot
    function beatLen() { return 60 / hr; }
    function sysScale() { return Math.pow(Math.min(1, beatLen() / 0.8), 0.45); }
    function ends() { var k = sysScale(), e = ST.map(function (x) { return x.end * k; }); e[e.length - 1] = beatLen(); return e; }
    function stageAt(tt) { var e = ends(); for (var i = 0; i < e.length; i++) if (tt < e[i]) return i; return e.length - 1; }
    function drawTrace() {
      var T = beatLen(), k = sysScale(); PXS = 820 / (3 * T);
      var d = '';
      for (var x = 0; x <= 820; x += 2) {
        var tt = (x / PXS) % T, v = tt < 0.6 * k ? ecg(tt / k) : 0;
        d += (x ? 'L' : 'M') + x + ',' + (140 - v * 110).toFixed(1);
      }
      trace.setAttribute('d', d);
    }
    function glow(elm, on) { elm.style.filter = on ? 'drop-shadow(0 0 8px rgba(242,169,0,1))' : ''; }
    function render() {
      var T = beatLen(), i = stageAt(t), e = ends(), st = ST[i], k = sysScale();
      var on = {}; st.on.forEach(function (x) { on[x] = 1; });
      sa.setAttribute('fill', on.sa ? cond : '#fff'); av.setAttribute('fill', on.av ? cond : '#fff');
      his.setAttribute('stroke-width', on.his ? 10 : 6); pk.setAttribute('stroke-width', on.pk ? 7 : 4);
      glow(his, on.his); glow(pk, on.pk);
      glow(ra, on.atria); glow(la, on.atria); glow(rv, on.vents); glow(lv, on.vents);
      // contraction: atria squeeze in stage 1, ventricles in stages 3–4
      var aSq = i === 1 ? 0.94 : 1, vSq = (i === 3 || i === 4) ? 0.9 : 1;
      atriaG.setAttribute('transform', 'translate(260 120) scale(' + aSq + ') translate(-260 -120)');
      ventG.setAttribute('transform', 'translate(260 375) scale(' + vSq + ') translate(-260 -375)');
      valves.forEach(function (v) { v.setAttribute('fill', (i >= 3 && i <= 5) ? C.ink : '#fff'); });
      // impulse spot
      if (i <= 1) { var f = Math.min(1, t / e[1]), p = pathAtria.getPointAtLength(f * pathAtria.getTotalLength()); spot.setAttribute('cx', p.x); spot.setAttribute('cy', p.y); spot.setAttribute('opacity', 1); }
      else if (i === 2) { spot.setAttribute('cx', 228); spot.setAttribute('cy', 182); spot.setAttribute('opacity', 1); }
      else if (i === 3) { var f2 = (t - e[2]) / (e[3] - e[2]), pl = pk.getTotalLength(); var p2 = f2 < 0.4 ? { x: 240 + 20 * (f2 / 0.4), y: 190 + 230 * (f2 / 0.4) } : pk.getPointAtLength(((f2 - 0.4) / 0.6) * pl * 0.5); spot.setAttribute('cx', p2.x); spot.setAttribute('cy', p2.y); spot.setAttribute('opacity', 1); }
      else spot.setAttribute('opacity', 0);
      // ECG cursor on the middle beat
      var x0 = T * PXS, cx = x0 + t * PXS;
      cursor.setAttribute('x1', cx); cursor.setAttribute('x2', cx);
      var s0 = i ? e[i - 1] : 0;
      hiRect.setAttribute('x', x0 + s0 * PXS); hiRect.setAttribute('width', Math.max(2, (e[i] - s0) * PXS));
      ecgLab.textContent = st.ecg;
      box.innerHTML = '<b style="color:#0a6a6c;font-size:22px">' + (i + 1) + '. ' + st.t + '</b><br>' + st.d;
      mech.textContent = 'Mechanical: ' + st.mech;
    }
    function tick(ts) {
      if (!playing) return;
      var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
      if (D.isCur(el)) { t = (t + dt * slow) % beatLen(); render(); }
      raf = requestAnimationFrame(tick);
    }
    function stop() { playing = false; cancelAnimationFrame(raf); play.textContent = '▶ Play'; }
    play.addEventListener('click', function () { if (playing) { stop(); return; } playing = true; last = 0; play.textContent = '❚❚ Pause'; raf = requestAnimationFrame(tick); });
    stepB.addEventListener('click', function () { stop(); var e = ends(), i = stageAt(t); t = i + 1 < e.length ? e[i] + 0.0001 : 0; render(); });
    prev.addEventListener('click', function () { stop(); var e = ends(), i = stageAt(t); i = (i - 1 + e.length) % e.length; t = i ? e[i - 1] + 0.0001 : 0; render(); });
    sl.addEventListener('click', function () { slow = slow === 1 ? 0.25 : 1; sl.setAttribute('aria-pressed', slow < 1); });
    hrS.addEventListener('input', function () { var i = stageAt(t); hr = +hrS.value; hrV.textContent = hr + ' bpm'; drawTrace(); var e = ends(); t = Math.min(t, e[e.length - 1] - 0.001); render(); });
    drawTrace(); render();
  };

  /* ---------- ECG quiz: click the part of the trace ---------- */
  W.ecgquiz = function (el) {
    var Z = [
      { k: 'p', a: 0.03, b: 0.13, name: 'P wave', col: '#7b55b8', what: 'Atrial depolarisation: the impulse from the SA node spreads across the atria, which then contract.' },
      { k: 'pr', a: 0.13, b: 0.155, name: 'PR segment', col: '#9c7b4f', what: 'The delay at the AV node, giving the ventricles time to fill. (The PR <i>interval</i> runs from the start of P to the start of QRS: normally 0.12 to 0.20 s.)' },
      { k: 'qrs', a: 0.155, b: 0.225, name: 'QRS complex', col: '#c43c6b', what: 'Ventricular depolarisation through the bundle of His and Purkinje fibres. Normally under 0.12 s. The ventricles contract straight after.' },
      { k: 'st', a: 0.225, b: 0.33, name: 'ST segment', col: '#e08a2a', what: 'The ventricles are fully depolarised and contracting, ejecting blood.' },
      { k: 't', a: 0.33, b: 0.5, name: 'T wave', col: '#1f8fc4', what: 'Ventricular repolarisation: the ventricles reset and begin to relax.' },
      { k: 'tp', a: 0.5, b: 0.8, name: 'TP segment', col: '#5e9e2f', what: 'Diastole: the whole heart is relaxed and filling. This part shortens most when heart rate rises.' }
    ];
    var Q = [['Click where the <b>atria depolarise</b>.', 'p'], ['Click the <b>delay at the AV node</b>.', 'pr'], ['Click where the <b>ventricles depolarise</b>.', 'qrs'],
      ['Click where the ventricles are <b>fully depolarised and ejecting blood</b>.', 'st'], ['Click where the <b>ventricles repolarise</b>.', 't'], ['Click where the heart is <b>relaxed and filling</b> (diastole).', 'tp']];
    var qi = 0, score = 0, tries = 0, done = {};
    var X0 = 30, PX = 1300 / 0.8;   // 0.8 s across 1300 px
    var prompt = hx('div', null, '', el); prompt.style.cssText = 'font-size:28px;font-weight:700;margin-bottom:10px;min-height:40px';
    var s = D.svgRoot(el, 1320, 330, 'One ECG beat on grid paper. Click a part of the trace to answer.');
    sv('rect', { x: X0, y: 0, width: 1300, height: 330, fill: '#fff7f7', stroke: '#f0c9c9' }, s);
    var sq = PX * 0.04;   // one small square = 0.04 s
    for (var i = 0; i <= 20; i++) sv('line', { x1: X0 + i * sq, y1: 0, x2: X0 + i * sq, y2: 330, stroke: i % 5 ? '#f6dada' : '#eaaeae', 'stroke-width': i % 5 ? 1 : 2 }, s);
    for (var j = 0; j * sq <= 330; j++) sv('line', { x1: X0, y1: 330 - j * sq, x2: X0 + 1300, y2: 330 - j * sq, stroke: j % 5 ? '#f6dada' : '#eaaeae', 'stroke-width': j % 5 ? 1 : 2 }, s);
    var zones = {};
    Z.forEach(function (z) {
      var r = sv('rect', { x: X0 + z.a * PX, y: 0, width: (z.b - z.a) * PX, height: 330, fill: z.col, opacity: 0, style: 'cursor:pointer' }, s);
      var lab = txt(s, X0 + (z.a + z.b) / 2 * PX, 30, z.name, { 'text-anchor': 'middle', 'font-size': z.k === 'pr' ? 16 : 22, 'font-weight': 800, fill: z.col, opacity: 0 });
      if (z.k === 'pr') lab.setAttribute('y', 56);
      zones[z.k] = { r: r, lab: lab, z: z };
      r.addEventListener('click', function () { answer(z.k); });
    });
    var d = ''; for (var x = 0; x <= 1300; x += 2) { var v = ecg(x / PX); d += (x ? 'L' : 'M') + (X0 + x) + ',' + (230 - v * 170).toFixed(1); }
    sv('path', { d: d, fill: 'none', stroke: '#b3262b', 'stroke-width': 4, 'stroke-linejoin': 'round', 'pointer-events': 'none' }, s);
    txt(s, X0 + 1296, 322, '1 small square = 0.04 s · 1 large square = 0.2 s', { 'text-anchor': 'end', 'font-size': 15, fill: '#9a5a5a' });
    var foot = hx('div', 'row', null, el); foot.style.cssText = 'margin-top:12px;gap:18px;align-items:flex-start';
    var note = hx('div', 'note-box col', 'Six prompts. Click anywhere in the right section of the trace.', foot);
    var side = hx('div', null, null, foot); side.style.cssText = 'flex:0 0 300px;display:flex;flex-direction:column;gap:10px';
    var sc = D.readout(side, 'Score', C.teal);
    var bg = hx('div', 'btngroup', null, side);
    var all = btn('Show all labels', bg, 'sm'), rs = btn('Reset', bg, 'ghost sm');
    function reveal(k) { var o = zones[k]; o.r.setAttribute('opacity', .16); o.lab.setAttribute('opacity', 1); done[k] = 1; }
    function ask() { prompt.innerHTML = qi < Q.length ? (qi + 1) + ' of ' + Q.length + ': ' + Q[qi][0] : 'All done. Click any part of the trace to read about it again.'; sc.textContent = score + ' / ' + Q.length; }
    function answer(k) {
      var z = zones[k].z;
      if (qi >= Q.length) { note.innerHTML = '<b style="color:' + z.col + '">' + z.name + ':</b> ' + z.what; return; }
      if (k === Q[qi][1]) {
        if (!tries) score++;
        reveal(k); note.innerHTML = '<b style="color:' + z.col + '">✓ ' + z.name + ':</b> ' + z.what; qi++; tries = 0; ask();
      } else {
        tries++;
        var r = zones[k].r; r.setAttribute('opacity', .35); r.setAttribute('fill', C.red);
        setTimeout(function () { r.setAttribute('fill', z.col); r.setAttribute('opacity', done[k] ? .16 : 0); }, 350);
        note.innerHTML = '<b>Not that one.</b> That is the ' + z.name + '. Try again.';
      }
    }
    all.addEventListener('click', function () { Z.forEach(function (z) { reveal(z.k); }); qi = Q.length; ask(); note.innerHTML = 'All labels shown. Click any part of the trace to read what it means.'; });
    rs.addEventListener('click', function () { qi = 0; score = 0; tries = 0; done = {}; Z.forEach(function (z) { zones[z.k].r.setAttribute('opacity', 0); zones[z.k].lab.setAttribute('opacity', 0); }); note.innerHTML = 'Six prompts. Click anywhere in the right section of the trace.'; ask(); });
    ask();
  };

  /* ---------- autonomic control of heart rate, plus max HR calculator ---------- */
  W.hrcontrol = function (el) {
    var para = 0.65, sym = 0.1, raf = null, last = 0, ph = 0, running = false;
    var row = hx('div', 'row', null, el); row.style.gap = '30px';
    var left = hx('div', null, null, row); left.style.flex = '0 0 560px';
    var mid = hx('div', 'col', null, row);
    var right = hx('div', null, null, row); right.style.flex = '0 0 330px';
    var s = D.svgRoot(left, 560, 540, 'A beating heart with the vagus nerve (parasympathetic) and sympathetic nerves feeding into the SA node');
    var vag = sv('path', { d: 'M60,20 C80,140 150,170 240,205', fill: 'none', stroke: C.green, 'stroke-linecap': 'round' }, s);
    var symp = sv('path', { d: 'M520,20 C500,140 400,170 300,205', fill: 'none', stroke: C.fat, 'stroke-linecap': 'round' }, s);
    txt(s, 20, 20, 'Parasympathetic', { 'font-size': 20, 'font-weight': 800, fill: C.green });
    txt(s, 20, 44, '(vagus nerve, acetylcholine)', { 'font-size': 16, fill: C.green });
    txt(s, 540, 20, 'Sympathetic', { 'text-anchor': 'end', 'font-size': 20, 'font-weight': 800, fill: C.fat });
    txt(s, 540, 44, '(noradrenaline, adrenaline)', { 'text-anchor': 'end', 'font-size': 16, fill: C.fat });
    var heartG = sv('g', {}, s);
    sv('path', { d: 'M270,500 C120,400 70,320 90,260 C110,200 200,185 270,250 C340,185 430,200 450,260 C470,320 420,400 270,500 Z', fill: '#e05959', stroke: '#a62b2b', 'stroke-width': 5 }, heartG);
    sv('circle', { cx: 270, cy: 222, r: 14, fill: C.amber, stroke: '#8a6200', 'stroke-width': 3 }, s);
    txt(s, 292, 228, 'SA node', { 'font-size': 17, 'font-weight': 800, fill: '#8a6200' });
    var bpmT = txt(s, 270, 370, '', { 'text-anchor': 'middle', 'font-size': 52, 'font-weight': 800, fill: '#fff' });
    txt(s, 270, 404, 'beats per minute', { 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700, fill: '#fff' });

    var pS = D.slider(mid, 'Parasympathetic', 0, 100, 1, para * 100, 260);
    var sS = D.slider(mid, 'Sympathetic', 0, 100, 1, sym * 100, 260); sS.parentNode.style.marginTop = '10px';
    var bg = hx('div', 'btngroup', null, mid); bg.style.margin = '14px 0';
    var PRE = [['Rest', 65, 10], ['Before a race', 40, 35], ['Hard exercise', 0, 100], ['Trained athlete at rest', 90, 5]];
    PRE.forEach(function (p) { btn(p[0], bg, 'sm').addEventListener('click', function () { pS.value = p[1]; sS.value = p[2]; upd(); }); });
    var ro = hx('div', 'readouts', null, mid);
    var rH = D.readout(ro, 'Heart rate', C.red), rSV = D.readout(ro, 'Stroke volume', C.teal), rQ = D.readout(ro, 'Cardiac output', C.navy);
    var note = hx('div', 'note-box', '', mid); note.style.marginTop = '12px';

    var card = hx('div', 'card t-amber', '<h3>Maximum heart rate</h3>', right);
    var ageL = hx('label', null, '<span class="ctrl-label">Age</span>', card); ageL.style.cssText = 'display:flex;align-items:center;gap:8px;margin:6px 0 10px';
    var age = hx('input', null, null, ageL); age.type = 'number'; age.min = 15; age.max = 90; age.value = 20; age.style.width = '100px';
    var out = hx('div', null, '', card); out.style.cssText = 'font-size:19px;line-height:1.5';

    var hr = 70, sv0 = 70;
    function upd() {
      para = pS.value / 100; sym = sS.value / 100;
      hr = Math.round(D.clamp(100 * (1 + sym) * (1 - 0.55 * para), 35, 205));
      sv0 = Math.round(70 * (1 + 0.45 * sym));
      if (para >= 0.85) sv0 = Math.max(sv0, 95);   // athlete preset: bigger heart, larger stroke volume
      vag.setAttribute('stroke-width', 2 + para * 16); symp.setAttribute('stroke-width', 2 + sym * 16);
      bpmT.textContent = hr; rH.textContent = hr + ' bpm'; rSV.textContent = sv0 + ' mL'; rQ.textContent = D.fx(hr * sv0 / 1000, 1) + ' L/min';
      note.innerHTML = hr < 60 ? '<b>Below 60 bpm.</b> High vagal tone slows the SA node. Common and healthy in endurance-trained people; a concern only with symptoms such as dizziness or fainting.'
        : hr > 100 ? '<b>Above 100 bpm.</b> Sympathetic drive and adrenaline speed up the SA node and make each beat more forceful, so stroke volume rises too.'
        : '<b>Rest.</b> Parasympathetic (vagal) tone holds heart rate well below the SA node\'s own rate of about 100 bpm.';
      if (!running) { running = true; last = 0; raf = requestAnimationFrame(tick); }
    }
    function calc() {
      var a = D.clamp(+age.value || 20, 15, 90), m1 = 220 - a, m2 = Math.round(208 - 0.7 * a);
      out.innerHTML = '<b>220 − age</b> = ' + m1 + ' bpm<br><b>Tanaka</b> (208 − 0.7 × age) = ' + m2 + ' bpm<br><b>80 % of 220 − age</b> = ' + Math.round(m1 * 0.8) + ' bpm' +
        '<p class="small" style="margin:8px 0 0;font-size:16px">Predictions can be out by ±10–12 bpm for an individual. Only a maximal test measures true max HR.</p>';
    }
    function tick(ts) {
      var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
      if (D.isCur(el)) {
        ph = (ph + dt * hr / 60) % 1;
        var sc = 1 + (ph < 0.15 ? 0.08 * Math.sin(Math.PI * ph / 0.15) : 0);
        heartG.setAttribute('transform', 'translate(270 340) scale(' + sc + ') translate(-270 -340)');
      }
      raf = requestAnimationFrame(tick);
    }
    pS.addEventListener('input', upd); sS.addEventListener('input', upd); age.addEventListener('input', calc);
    upd(); calc();
  };
})();
