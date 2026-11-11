/* Altitude Lab: seven missions. State is kept in localStorage so students can leave and come back. */
(function () {
  'use strict';
  var KEY = 'sesh54-altitude-lab-v1', NS = 'http://www.w3.org/2000/svg', N = 7;
  var S = { done: {}, m1: {}, m2: {}, m3: {}, m4: {}, m5: {}, m6: {}, m7: {} };
  try { var saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved) for (var k in saved) S[k] = saved[k]; } catch (e) { /* storage blocked */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage blocked */ } progress(); }
  function h(tag, attrs, html, parent) {
    var e = document.createElement(tag);
    for (var a in attrs || {}) { if (a === 'class') e.className = attrs[a]; else e.setAttribute(a, attrs[a]); }
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  function sv(tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var a in attrs) e.setAttribute(a, attrs[a]); if (parent) parent.appendChild(e); return e; }
  function st(parent, x, y, s, attrs) { var a = { x: x, y: y, 'font-size': 14, fill: '#1d2b33' }; for (var k in attrs || {}) a[k] = attrs[k]; var t = sv('text', a, parent); t.textContent = s; return t; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function fx(v, d) { return v.toFixed(d == null ? 1 : d); }
  function lerp(tbl, x) { for (var i = 1; i < tbl.length; i++) if (x <= tbl[i][0]) { var a = tbl[i - 1], b = tbl[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); } return tbl[tbl.length - 1][1]; }

  var MISSIONS = [
    { id: 'm1', t: '1 · Thin air', f: m1 }, { id: 'm2', t: '2 · Mexico 1968', f: m2 }, { id: 'm3', t: '3 · Oxygen delivery', f: m3 },
    { id: 'm4', t: '4 · Altitude illness', f: m4 }, { id: 'm5', t: '5 · Camp designer', f: m5 }, { id: 'm6', t: '6 · Fuel and fluid', f: m6 }, { id: 'm7', t: '7 · Your athlete', f: m7 }
  ];
  var tabs = document.getElementById('tabs'), main = document.getElementById('main'), cur = 0;
  MISSIONS.forEach(function (m, i) { m.b = h('button', { type: 'button', role: 'tab' }, m.t, tabs); m.b.addEventListener('click', function () { show(i); }); });
  function progress() {
    var n = 0; MISSIONS.forEach(function (m) { var d = !!S.done[m.id]; m.b.classList.toggle('done', d); if (d) n++; });
    document.getElementById('pbar').style.width = (n / N * 100) + '%';
    document.getElementById('ptext').textContent = n + ' of ' + N + ' missions complete' + (n === N ? '. Go to mission 7 to copy your summary.' : '');
  }
  function show(i) { cur = i; main.innerHTML = ''; MISSIONS.forEach(function (m, k) { m.b.setAttribute('aria-selected', k === i); }); MISSIONS[i].f(main); window.scrollTo(0, 0); }
  function finish(root, id, ok, msg) {
    var bar = h('div', { class: 'done-bar' }, null, root);
    var b = h('button', { class: 'btn', type: 'button' }, S.done[id] ? 'Mission complete ✓ · next mission' : 'Mark mission complete', bar);
    var note = h('span', { class: 'pill' }, '', bar);
    b.addEventListener('click', function () {
      if (!ok()) { note.textContent = msg; note.className = 'pill hot'; return; }
      S.done[id] = true; save(); show(Math.min(cur + 1, N - 1));
    });
  }
  function mcq(parent, q, options, answer, why, store, key) {
    var box = h('div', { class: 'q' }, '<p><b>' + q + '</b></p>', parent), o = h('div', { class: 'opts' }, null, box), w = h('div', { class: 'why' }, '', box);
    var bs = options.map(function (t, i) { var b = h('button', { type: 'button' }, t, o); b.addEventListener('click', function () { pick(i, true); }); return b; });
    function pick(i, user) {
      bs.forEach(function (b) { b.classList.remove('right', 'wrong'); });
      var ok = i === answer; bs[i].classList.add(ok ? 'right' : 'wrong');
      w.innerHTML = ok ? '<b>Yes.</b> ' + why : '<b>Not quite.</b> Try again.';
      if (user) { store[key] = store[key] || { tries: 0 }; if (!store[key].ok) store[key].tries++; if (ok) store[key].ok = true; save(); }
    }
    if (store[key] && store[key].ok) pick(answer, false);
    return function () { return !!(store[key] && store[key].ok); };
  }
  function slider(ctrl, p, label, key, min, max, step, unit, upd, fmt) {
    h('label', null, label, ctrl); var r = h('input', { type: 'range', min: min, max: max, step: step, value: p[key], 'aria-label': label }, null, ctrl), o = h('output', null, '', ctrl);
    r.addEventListener('input', function () { p[key] = +r.value; upd(); });
    return function () { o.textContent = (fmt ? fmt(p[key]) : p[key]) + unit; };
  }
  function select(ctrl, p, label, key, opts, upd) {
    h('label', null, label, ctrl); var s = h('select', { 'aria-label': label }, null, ctrl); h('span', null, '', ctrl);
    opts.forEach(function (o, i) { h('option', { value: i }, o, s); }); s.value = p[key];
    s.addEventListener('change', function () { p[key] = +s.value; upd(); });
  }

  /* ---------- altitude model (simplified teaching model) ---------- */
  function pbar(hm) { return 760 * Math.pow(1 - 2.2558e-5 * hm, 5.2559); }
  var VO2 = [[0, 100], [1000, 94], [2000, 88], [2500, 84], [3000, 80], [4000, 74], [5000, 64], [6000, 53], [7000, 42], [8000, 31], [8849, 24]];
  function atm(hm, acc) {
    var P = pbar(hm), pio2 = 0.2093 * (P - 47), f = clamp((760 - P) / (760 - 231), 0, 1.1);
    var paco2 = Math.max(8, 40 - 32 * f * (acc ? 1 : 0.6)), pao2a = pio2 - paco2 / 0.8, pao2 = Math.max(10, pao2a - 4);
    var p50 = 26.8 - 0.24 * (40 - paco2), sao2 = 100 / (1 + Math.pow(p50 / pao2, 2.7));
    var T = 288.15 - 0.0065 * hm, dens = (P / 760) * 288.15 / T;
    return { P: P, pio2: pio2, paco2: paco2, pao2: pao2, p50: p50, sao2: sao2, dens: dens, vo2: lerp(VO2, hm), ve: 36 * Math.pow(149.2 / pio2, 1.13) };
  }

  /* ================= Mission 1: thin air ================= */
  var PLACES = [['London', 14], ['Calgary', 1045], ['Mexico City', 2216], ['Quito', 2850], ['La Paz', 3812], ['Everest', 8849]];
  function m1(root) {
    h('h2', null, 'Mission 1 · Thin air', root);
    h('p', { class: 'lede' }, 'The air is still 20.93% oxygen at every altitude. What changes is the <b>pressure</b>, so each breath carries fewer oxygen molecules. Climb the mountain and watch what happens to the oxygen you breathe in and the oxygen in your blood. Complete at least four of the five goals.', root);
    var p = S.m1.p || { alt: 0, acc: 0 }; S.m1.seen = S.m1.seen || {};
    var g = h('div', { class: 'grid' }, null, root), L = h('div', null, null, g), Rt = h('div', null, null, g);
    var fig = sv('svg', { viewBox: '0 0 560 300', role: 'img', 'aria-label': 'Mountain with a climber at the chosen altitude' }, L);
    var plot = sv('svg', { viewBox: '0 0 560 230', role: 'img', 'aria-label': 'Arterial oxygen saturation against altitude' }, L);
    var stats = h('div', { class: 'stats' }, null, L);
    function stat(k) { var b = h('div', { class: 'stat' }, '<div class="k">' + k + '</div><div class="v">–</div>', stats); return b.querySelector('.v'); }
    var sP = stat('Air pressure'), sI = stat('Inspired PO₂'), sS = stat('Arterial SaO₂'), sV = stat('VO₂max (approx.)');
    var c = h('div', { class: 'card' }, null, Rt), ctrl = h('div', { class: 'ctrl' }, null, c);
    var u1 = slider(ctrl, p, 'Altitude', 'alt', 0, 8849, 50, ' m', upd, function (v) { return v.toLocaleString('en-GB'); });
    select(ctrl, p, 'Your status', 'acc', ['Just arrived (not acclimatised)', 'Acclimatised (weeks at this altitude)'], upd);
    h('h3', null, 'Goals', Rt);
    var gl = h('ul', { class: 'goals' }, null, Rt);
    var G = [
      ['Stand in Mexico City (about 2,200 m), site of the 1968 Olympics', function (a) { return p.alt >= 2150 && p.alt <= 2300; }],
      ['Find the altitude where air pressure is half of sea level (about 380 mmHg)', function (a) { return Math.abs(a.P - 380) <= 12; }],
      ['Find where a newly arrived person drops to about 90% saturation', function (a) { return !p.acc && Math.abs(a.sao2 - 90) <= 1; }],
      ['Compare newly arrived and acclimatised at 5,000 m or higher', function (a) { return S.m1.seen.n && S.m1.seen.a; }],
      ['Reach the summit of Everest (8,849 m)', function (a) { return p.alt >= 8800; }]
    ].map(function (x) { return { t: x[0], f: x[1], li: h('li', null, x[0], gl) }; });
    var note = h('div', { class: 'note' }, '', Rt);
    function curve(acc) { var pts = []; for (var a = 0; a <= 8849; a += 250) pts.push(atm(a, acc).sao2); pts.push(atm(8849, acc).sao2); return pts; }
    function upd() {
      var a = atm(p.alt, p.acc);
      if (p.alt >= 5000) S.m1.seen[p.acc ? 'a' : 'n'] = true;
      sP.textContent = Math.round(a.P) + ' mmHg'; sI.textContent = fx(a.pio2, 0) + ' mmHg'; sS.textContent = fx(a.sao2, 0) + '%'; sV.textContent = Math.round(a.vo2) + '% of sea level';
      u1();
      /* mountain */
      fig.innerHTML = '';
      sv('rect', { x: 0, y: 0, width: 560, height: 300, fill: 'url(#sky)' }, fig);
      var df = sv('defs', {}, fig), lg = sv('linearGradient', { id: 'sky', x1: 0, y1: 0, x2: 0, y2: 1 }, df);
      sv('stop', { offset: 0, 'stop-color': mix(p.alt) }, lg); sv('stop', { offset: 1, 'stop-color': '#e8f3f8' }, lg);
      sv('polygon', { points: '0,300 90,200 170,235 300,40 380,150 430,110 560,300', fill: '#5d7480' }, fig);
      sv('polygon', { points: '300,40 270,95 300,80 325,100 345,95', fill: '#fff' }, fig);
      var cy = 290 - p.alt / 8849 * 250;
      PLACES.forEach(function (pl) { var y = 290 - pl[1] / 8849 * 250; sv('line', { x1: 12, x2: 36, y1: y, y2: y, stroke: '#0b3a4c', 'stroke-width': 1.5 }, fig); st(fig, 40, y + 4, pl[0] + ' ' + pl[1].toLocaleString('en-GB') + ' m', { 'font-size': 12, fill: '#0b3a4c' }); });
      var cx = 120 + (cy > 0 ? (290 - cy) / 250 * 170 : 0);
      sv('circle', { cx: 440, cy: cy, r: 9, fill: '#e2542c', stroke: '#fff', 'stroke-width': 3 }, fig);
      st(fig, 455, cy + 5, Math.round(p.alt).toLocaleString('en-GB') + ' m', { 'font-size': 14, 'font-weight': 800, fill: '#a2371a' });
      /* oxygen molecules bar */
      var frac = a.pio2 / 149.2; st(fig, 330, 290, 'Oxygen per breath: ' + Math.round(frac * 100) + '% of sea level', { 'font-size': 12, fill: '#0b3a4c', 'font-weight': 700 });
      /* plot */
      plot.innerHTML = ''; var X = 52, Y = 14, W = 480, H = 170;
      sv('rect', { x: X, y: Y, width: W, height: H, fill: '#fff', stroke: '#d2dfe2' }, plot);
      [100, 90, 80, 70, 60, 50].forEach(function (v) { var y = Y + (100 - v) / 55 * H; sv('line', { x1: X, x2: X + W, y1: y, y2: y, stroke: '#e5eef0' }, plot); st(plot, X - 6, y + 4, v + '%', { 'font-size': 12, 'text-anchor': 'end' }); });
      [0, 2000, 4000, 6000, 8000].forEach(function (v) { st(plot, X + v / 8849 * W, Y + H + 18, v / 1000 + ' km', { 'font-size': 12, 'text-anchor': 'middle' }); });
      st(plot, X + W / 2, Y + H + 38, 'Altitude', { 'font-size': 12, 'text-anchor': 'middle', fill: '#4f626b' });
      [[0, '#e2542c', 'Just arrived'], [1, '#2f7fd1', 'Acclimatised']].forEach(function (s, i) {
        var d = ''; curve(s[0]).forEach(function (v, k) { var x = X + Math.min(k * 250, 8849) / 8849 * W; d += (k ? 'L' : 'M') + x + ',' + (Y + (100 - clamp(v, 45, 100)) / 55 * H); });
        sv('path', { d: d, fill: 'none', stroke: s[1], 'stroke-width': 3 }, plot); st(plot, X + 10 + i * 130, Y + H + 56, '● ' + s[2], { 'font-size': 12, fill: s[1], 'font-weight': 700 });
      });
      sv('circle', { cx: X + p.alt / 8849 * W, cy: Y + (100 - clamp(a.sao2, 45, 100)) / 55 * H, r: 6, fill: '#fff', stroke: '#1d2b33', 'stroke-width': 3 }, plot);
      var n = 0; G.forEach(function (x) { var ok = S.m1['g' + x.t] || x.f(a); if (ok) { S.m1['g' + x.t] = true; n++; } x.li.className = ok ? 'done' : ''; });
      S.m1.p = p; S.m1.n = n; save();
      note.className = 'note' + (a.sao2 < 75 ? ' bad' : a.sao2 < 90 ? ' warn' : '');
      note.innerHTML = p.alt < 1500 ? '<b>Below about 1,500 m</b> the effect on most people is small: the top of the oxygen dissociation curve is flat, so saturation barely falls.' :
        p.alt < 3000 ? '<b>Moderate altitude.</b> Saturation holds up at rest, but VO₂max has already fallen. Wehrlin and Hallén (2006) found about 6% per 1,000 m in endurance athletes, starting from as low as 300 m.' :
        p.alt < 5500 ? '<b>High altitude.</b> Ventilation rises (hyperventilation), blowing off CO₂. The resulting alkalosis shifts the curve left, which helps saturation. Acclimatised people do much better than new arrivals.' :
        '<b>Extreme altitude.</b> Oxygen delivery now limits even rest. Ventilation to take up 1.5 L/min of O₂ would have to reach about ' + Math.round(a.ve) + ' L/min (36 L/min at sea level).';
      note.innerHTML += '<br>Air density is ' + Math.round(a.dens * 100) + '% of sea level. Goals met: ' + n + ' of 5.';
    }
    function mix(alt) { return alt > 5000 ? '#2a5d8c' : alt > 2500 ? '#5b9bc7' : '#9fcbe0'; }
    upd();
    finish(root, 'm1', function () { return S.m1.n >= 4; }, 'Complete at least four of the five goals first');
  }

  /* ================= Mission 2: Mexico 1968 ================= */
  function m2(root) {
    h('h2', null, 'Mission 2 · Mexico City 1968: helped or hindered?', root);
    h('p', { class: 'lede' }, 'The 1968 Olympics were held at 2,240 m. Some events produced records that stood for decades; others got slower. Decide which events altitude <b>helped</b> and which it <b>hindered</b>, then work out why.', root);
    var EV = [
      ['Long jump: Bob Beamon, 8.90 m (world record by 55 cm)', 1], ['100 m: Jim Hines, first sub-10 s electronic time', 1], ['200 m: Tommie Smith, world record', 1],
      ['400 m: Lee Evans, 43.86 s world record', 1], ['Triple jump: record broken five times in one Games', 1], ['4×400 m relay: USA, record lasted 24 years', 1],
      ['10,000 m: slower than the previous Olympics', 0], ['Marathon: Mamo Wolde, 2:20:26, slower pace than 1964', 0], ['5,000 m: slower than the previous Olympics', 0], ['20 km and 50 km race walks: generally slower', 0]
    ];
    var card = h('div', { class: 'card white' }, null, root); S.m2.sort = S.m2.sort || {};
    var out = h('div', { class: 'pill' }, '', root);
    function tally() { var n = Object.keys(S.m2.sort).filter(function (k) { return S.m2.sort[k]; }).length; out.textContent = n + ' of ' + EV.length + ' sorted correctly'; out.className = 'pill' + (n === EV.length ? ' ok' : ''); }
    EV.forEach(function (e, i) {
      var r = h('div', { class: 'sortrow' }, '<span class="nm">' + e[0] + '</span>', card), bh = h('button', { type: 'button' }, 'Helped', r), bd = h('button', { type: 'button' }, 'Hindered', r);
      function paint(c) { [bh, bd].forEach(function (b) { b.classList.remove('right', 'wrong'); }); var ok = (c === 1) === (e[1] === 1); (c ? bh : bd).classList.add(ok ? 'right' : 'wrong'); }
      bh.addEventListener('click', function () { paint(1); S.m2.sort[i] = e[1] === 1; save(); tally(); });
      bd.addEventListener('click', function () { paint(0); S.m2.sort[i] = e[1] === 0; save(); tally(); });
      if (S.m2.sort[i]) paint(e[1]);
    });
    tally();
    h('h3', null, 'Predict: how thin is the air?', root);
    var c2 = h('div', { class: 'card' }, null, root);
    h('p', null, 'At 2,240 m, what percentage of the sea-level air <b>density</b> would you expect? This is what a sprinter or jumper has to push through.', c2);
    var ctl = h('div', { class: 'ctrl' }, null, c2), pg = S.m2.guess == null ? 100 : S.m2.guess, o;
    h('label', null, 'Your estimate', ctl); var r = h('input', { type: 'range', min: 50, max: 100, step: 1, value: pg, 'aria-label': 'Estimated air density percentage' }, null, ctl); o = h('output', null, pg + '%', ctl);
    r.addEventListener('input', function () { pg = +r.value; o.textContent = pg + '%'; });
    var res = h('div', { class: 'note' }, 'Press reveal to compare.', c2), rb = h('button', { class: 'btn', type: 'button' }, 'Reveal', c2);
    function reveal() { var a = atm(2240, 1); S.m2.guess = pg; S.m2.rev = true; save(); res.className = 'note good'; res.innerHTML = 'Air density at 2,240 m is about <b>' + Math.round(a.dens * 100) + '%</b> of sea level (you said ' + pg + '%). Air pressure is ' + Math.round(a.P) + ' mmHg and inspired PO₂ about ' + Math.round(a.pio2) + ' mmHg, compared with 149 mmHg at sea level.'; }
    rb.addEventListener('click', reveal); if (S.m2.rev) reveal();
    h('h3', null, 'Explain it', root);
    var q = [
      mcq(root, 'Why did sprints and jumps benefit from altitude?', ['Athletes were fitter in 1968', 'Thin air gives less drag, and short explosive events barely depend on oxygen delivery', 'Hypoxia increases muscle power', 'Gravity is weaker at altitude'], 1, 'Air density was about 80% of sea level, so drag was lower. These events are largely anaerobic, and Fulco et al. (1998) concluded that sprint and power performance is not impaired by altitude.', S.m2, 'q1'),
      mcq(root, 'Why did 10,000 m and marathon times get slower?', ['The track was slower', 'Lower oxygen delivery reduced VO₂max and sustainable aerobic pace', 'Dehydration only', 'Cold weather'], 1, 'VO₂max falls with altitude and sustained aerobic exercise depends on it. Reduced drag cannot compensate at slower speeds, where drag is a small part of the cost.', S.m2, 'q2'),
      mcq(root, 'A distance runner at 2,240 m (acute) wants to hold sea-level pace. What is the most accurate statement?', ['It is easy: only 1% effect', 'Relative effort is higher: VO₂max is lower, so the same pace needs a bigger fraction of it', 'Heart rate will fall', 'Ventilation will fall'], 1, 'The same speed costs the same oxygen but the ceiling is lower, so the fraction of VO₂max is higher and heart rate and ventilation are higher.', S.m2, 'q3')
    ];
    finish(root, 'm2', function () { return Object.keys(S.m2.sort).filter(function (k) { return S.m2.sort[k]; }).length === EV.length && S.m2.rev && q.every(function (f) { return f(); }); }, 'Sort all ten events, press reveal, and answer the three questions');
  }

  /* ================= Mission 3: oxygen delivery ================= */
  function m3(root) {
    h('h2', null, 'Mission 3 · Follow the oxygen', root);
    h('p', { class: 'lede' }, 'Oxygen falls down a pressure staircase from the air to the muscle. At altitude every step starts lower. Then the haemoglobin curve decides how much of that oxygen is carried. Move the sliders, then explain what you see.', root);
    var p = S.m3.p || { alt: 0, acc: 0, ph: 7.4, dpg: 0 };
    var g = h('div', { class: 'grid' }, null, root), L = h('div', null, null, g), Rt = h('div', null, null, g);
    var casc = sv('svg', { viewBox: '0 0 560 250', role: 'img', 'aria-label': 'Oxygen cascade from inspired air to muscle' }, L);
    var curve = sv('svg', { viewBox: '0 0 560 270', role: 'img', 'aria-label': 'Oxyhaemoglobin dissociation curve' }, L);
    var stats = h('div', { class: 'stats' }, null, L);
    function stat(k) { var b = h('div', { class: 'stat' }, '<div class="k">' + k + '</div><div class="v">–</div>', stats); return b.querySelector('.v'); }
    var sA = stat('Arterial SaO₂'), sV = stat('Venous SvO₂'), sU = stat('Unloaded in muscle'), sP = stat('P50');
    var c = h('div', { class: 'card' }, null, Rt), ctrl = h('div', { class: 'ctrl' }, null, c);
    var u1 = slider(ctrl, p, 'Altitude', 'alt', 0, 6000, 100, ' m', upd, function (v) { return v.toLocaleString('en-GB'); });
    select(ctrl, p, 'Your status', 'acc', ['Just arrived', 'Acclimatised'], upd);
    var u2 = slider(ctrl, p, 'Blood pH', 'ph', 7.2, 7.6, 0.01, '', upd, function (v) { return v.toFixed(2); });
    select(ctrl, p, '2,3-DPG', 'dpg', ['Normal', 'Raised (+3 mmHg shift)'], upd);
    var auto = h('button', { class: 'btn ghost', type: 'button', style: 'margin-top:10px' }, 'Set pH from breathing at this altitude', c);
    auto.addEventListener('click', function () { var a = atm(p.alt, p.acc); p.ph = clamp(7.4 + (p.acc ? 0.0045 : 0.0085) * (40 - a.paco2), 7.2, 7.6); upd(); });
    var note = h('div', { class: 'note' }, '', Rt);
    function sat(P, p50) { return 100 / (1 + Math.pow(p50 / P, 2.7)); }
    function upd() {
      var a = atm(p.alt, p.acc), p50 = 26.8 * Math.pow(10, -0.48 * (p.ph - 7.4)) + (p.dpg ? 3 : 0);
      var sa = sat(a.pao2, p50), pv = clamp(40 - (95.2 - a.pao2) * 0.3, 15, 40), sv2 = sat(pv, 26.8 + (p.dpg ? 3 : 0));
      sA.textContent = fx(sa, 0) + '%'; sV.textContent = fx(sv2, 0) + '%'; sU.textContent = fx(sa - sv2, 0) + ' points'; sP.textContent = fx(p50, 1) + ' mmHg'; u1(); u2();
      casc.innerHTML = '';
      var steps = [['Inspired (moist)', a.pio2], ['Alveolar', a.pio2 - a.paco2 / 0.8], ['Arterial', a.pao2], ['Muscle venous', pv]], bw = 90;
      sv('line', { x1: 40, x2: 40, y1: 10, y2: 200, stroke: '#9aa9af' }, casc);
      steps.forEach(function (s, i) {
        var x = 60 + i * 125, hh = s[1] / 160 * 180;
        sv('rect', { x: x, y: 200 - hh, width: bw, height: hh, fill: ['#2f7fd1', '#49b6c9', '#0f8b8d', '#e2542c'][i], rx: 4 }, casc);
        st(casc, x + bw / 2, 194 - hh, Math.round(s[1]) + '', { 'text-anchor': 'middle', 'font-weight': 800 });
        st(casc, x + bw / 2, 220, s[0], { 'text-anchor': 'middle', 'font-size': 12 });
      });
      st(casc, 40, 244, 'PO₂ (mmHg). Sea level: about 149, 99, 95, 40.', { 'font-size': 12, fill: '#4f626b' });
      curve.innerHTML = ''; var X = 52, Y = 12, W = 480, H = 200;
      sv('rect', { x: X, y: Y, width: W, height: H, fill: '#fff', stroke: '#d2dfe2' }, curve);
      [0, 20, 40, 60, 80, 100].forEach(function (v) { var y = Y + (100 - v) / 100 * H; sv('line', { x1: X, x2: X + W, y1: y, y2: y, stroke: '#e5eef0' }, curve); st(curve, X - 6, y + 4, v + '%', { 'font-size': 12, 'text-anchor': 'end' }); });
      [0, 20, 40, 60, 80, 100, 120].forEach(function (v) { st(curve, X + v / 120 * W, Y + H + 16, v, { 'font-size': 12, 'text-anchor': 'middle' }); });
      st(curve, X + W / 2, Y + H + 36, 'PO₂ (mmHg)', { 'font-size': 12, 'text-anchor': 'middle', fill: '#4f626b' });
      [[26.8, '#9aa9af', 'Normal'], [p50, '#2f7fd1', 'Your curve']].forEach(function (cv, k) {
        var d = ''; for (var P = 1; P <= 120; P += 2) d += (P === 1 ? 'M' : 'L') + (X + P / 120 * W) + ',' + (Y + (100 - sat(P, cv[0])) / 100 * H);
        sv('path', { d: d, fill: 'none', stroke: cv[1], 'stroke-width': k ? 3.5 : 2, 'stroke-dasharray': k ? '' : '5 4' }, curve);
        st(curve, X + 300 + k * 90, Y + H + 56, '● ' + cv[2], { 'font-size': 12, fill: cv[1], 'font-weight': 700 });
      });
      sv('circle', { cx: X + a.pao2 / 120 * W, cy: Y + (100 - sa) / 100 * H, r: 7, fill: '#0f8b8d', stroke: '#fff', 'stroke-width': 2 }, curve);
      sv('circle', { cx: X + pv / 120 * W, cy: Y + (100 - sv2) / 100 * H, r: 7, fill: '#e2542c', stroke: '#fff', 'stroke-width': 2 }, curve);
      st(curve, X + a.pao2 / 120 * W + 10, Y + (100 - sa) / 100 * H - 10, 'arterial', { 'font-size': 12, fill: '#0f8b8d', 'font-weight': 700 });
      st(curve, X + pv / 120 * W + 10, Y + (100 - sv2) / 100 * H + 18, 'venous', { 'font-size': 12, fill: '#e2542c', 'font-weight': 700 });
      note.innerHTML = a.pao2 > 60 ? 'Arterial PO₂ is still on the <b>flat top</b> of the curve: a big fall in pressure costs only a few points of saturation.' : 'Arterial PO₂ is now on the <b>steep part</b>: each further fall in pressure costs a lot of saturation.';
      S.m3.p = p; S.m3.moved = true; save();
    }
    upd();
    h('h3', null, 'Explain it', root);
    var q = [
      mcq(root, 'Why does saturation barely change between sea level and about 2,000 m?', ['Haemoglobin makes more oxygen', 'The upper part of the curve is flat, so a modest fall in PO₂ changes saturation little', 'Breathing stops increasing', 'Air pressure does not change until 3,000 m'], 1, 'Between roughly 100 and 60 mmHg the curve is nearly flat. Oxygen content is protected until PO₂ drops onto the steep part.', S.m3, 'q1'),
      mcq(root, 'Hyperventilation at altitude lowers PCO₂ and raises pH (respiratory alkalosis). What does that do to the curve, and why does it help?', ['Shifts it right, helping unloading', 'Shifts it left, raising saturation at a given PO₂ in the lungs', 'No effect', 'Flattens the top'], 1, 'The Bohr effect: alkalosis moves the curve left, so haemoglobin binds oxygen more tightly in the lung. Try raising pH in the simulator at 5,000 m.', S.m3, 'q2'),
      mcq(root, 'Raised 2,3-DPG shifts the curve right. What is the trade-off?', ['Better unloading in the muscle, but slightly lower loading in the lung', 'Better loading, worse unloading', 'No trade-off', 'It raises PO₂ in the air'], 0, 'A right shift releases oxygen more easily at the tissues, but costs some saturation in the lungs when PO₂ is low. This is why the left shift of alkalosis matters more at extreme altitude.', S.m3, 'q3'),
      mcq(root, 'What detects the fall in PaO₂ and drives ventilation up?', ['Baroreceptors in the heart', 'Aortic and carotid body chemoreceptors', 'Muscle spindles', 'Skin thermoreceptors'], 1, 'Peripheral chemoreceptors in the aortic and carotid bodies sense low PaO₂. Per 1% fall in SaO₂, ventilation rises by about 0.18 L/min (Schoene et al., 1990, in the lecture).', S.m3, 'q4')
    ];
    finish(root, 'm3', function () { return S.m3.moved && q.every(function (f) { return f(); }); }, 'Try the sliders, then answer all four questions');
  }

  /* ================= Mission 4: altitude illness triage ================= */
  function m4(root) {
    h('h2', null, 'Mission 4 · Altitude illness triage', root);
    h('p', { class: 'lede' }, 'You are the support scientist with a group at altitude and there is no doctor on site. Read each case, name the condition, then choose the first action. The principle for all severe altitude illness is the same: <b>stop going up, and go down</b>.', root);
    var CASES = [
      ['Case 1 · Day 1 at 3,600 m', 'A runner drove from 1,500 m to a 3,600 m camp. Eight hours later they have a headache, nausea and poor appetite, and slept badly. They can walk normally and think clearly.', ['Acute mountain sickness (AMS)', 'HAPE', 'HACE', 'Dehydration only'], 0, ['Continue to the next camp', 'Stop ascending and rest; treat symptoms; descend if worse', 'Give nifedipine and descend at once', 'Run a hard session to acclimatise'], 1, 'AMS is common and usually starts 6–12 h after arrival. Rest and symptomatic treatment are appropriate. Do not ascend further until symptoms resolve, and descend if they worsen.'],
      ['Case 2 · Day 3 at 4,000 m', 'A climber is breathless at rest, has a dry cough turning frothy, feels weak, has a fast pulse and bluish lips.', ['AMS', 'HAPE', 'HACE', 'Heat illness'], 1, ['Rest and fluids at the same altitude', 'Descend urgently, give oxygen, medical help', 'Take acetazolamide and continue', 'Gentle walk to clear the lungs'], 1, 'Fluid in the lungs (HAPE). Immediate descent and oxygen are the priorities; nifedipine is an adjunct (Luks et al., 2019).'],
      ['Case 3 · Day 2 at 4,500 m', 'A climber with a bad headache for two days now stumbles, cannot walk heel-to-toe in a straight line, is drowsy and irritable.', ['AMS', 'HAPE', 'HACE', 'Hypothermia'], 2, ['Descend immediately with oxygen and dexamethasone', 'Let them sleep it off', 'Give ibuprofen and observe', 'Continue to the summit while able'], 0, 'Ataxia and altered consciousness mean brain swelling (HACE). It is a medical emergency: descend, oxygen, dexamethasone.'],
      ['Case 4 · Camp at 2,300 m, day 2', 'An athlete has a mild headache and slept poorly. Their planned session is a hard interval workout. No vomiting, normal balance, no breathlessness at rest.', ['Mild AMS or altitude-related sleep disturbance', 'HAPE', 'HACE', 'Overtraining syndrome'], 0, ['Complete the hard session to avoid losing fitness', 'Reduce intensity, monitor symptoms, do not ascend further', 'Evacuate by helicopter', 'Stop all drinking'], 1, 'Training is disrupted at altitude and expected. Lower the load, monitor with a symptom score each day, and escalate if signs develop.']
    ];
    CASES.forEach(function (cs, i) {
      var card = h('div', { class: 'card', style: 'margin-bottom:14px' }, '<h3 style="margin-top:0">' + cs[0] + '</h3><p>' + cs[1] + '</p>', root);
      cs.q = [mcq(card, 'What is the likely condition?', cs[2], cs[3], 'Correct.', S.m4, 'c' + i + 'a'), mcq(card, 'What is the first action?', cs[4], cs[5], cs[6], S.m4, 'c' + i + 'b')];
    });
    h('h3', null, 'Prevention and speed of ascent', root);
    var q = [
      mcq(root, 'Which ascent pattern fits current guidance for going above about 3,000 m?', ['Sleeping altitude +1,500 m/day', 'Sleeping altitude +300–500 m/day, with a rest day every 3–4 days', 'No rest days', 'Fly to the top and train on day one'], 1, 'Gradual ascent is the best prevention. The Wilderness Medical Society guidelines (Luks et al., 2019) recommend limiting the increase in sleeping elevation, with periodic rest days, and "climb high, sleep low".', S.m4, 'p1'),
      mcq(root, 'Which pair of illnesses is correctly matched with its main sign?', ['HAPE: ataxia and confusion; HACE: breathlessness at rest', 'HAPE: breathlessness at rest and cough; HACE: ataxia and confusion', 'Both: sunburn', 'Both: hypothermia'], 1, 'HAPE is fluid on the lungs; HACE is swelling of the brain. Both are treated by descent, oxygen and drugs as adjuncts.', S.m4, 'p2'),
      mcq(root, 'Which statement about drugs is correct?', ['Drugs replace descent', 'Acetazolamide can help prevent AMS; dexamethasone treats AMS or HACE; neither replaces descent in severe illness', 'Dexamethasone prevents HAPE', 'Nifedipine treats AMS headache'], 1, 'Descent is the definitive treatment. Medication is a support, to be prescribed and supervised by a doctor.', S.m4, 'p3')
    ];
    finish(root, 'm4', function () { return CASES.every(function (cs) { return cs.q.every(function (f) { return f(); }); }) && q.every(function (f) { return f(); }); }, 'Answer all four cases and the three prevention questions first');
  }

  /* ================= Mission 5: camp designer ================= */
  var AF = [[1000, 0], [1500, 0.25], [1800, 0.7], [2000, 0.9], [2100, 1], [2500, 1], [2800, 0.9], [3500, 0.75], [4500, 0.6]];
  function camp(p) {
    var af = lerp(AF, p.live), gain = p.hrs * p.len / 100 * 1.4 * af * (p.iron ? 0.5 : 1);
    var eff = gain * (p.ret <= 14 ? 1 : Math.max(0, 1 - (p.ret - 14) / 42)), qual = clamp(100 - 6.3 * p.train / 1000, 40, 100), flags = [];
    if (p.live < 1800) flags.push('Living below about 1,800 m gives little haematological response.');
    if (p.live >= 2700) flags.push('At or above about 2,700 m, sleep, appetite and training quality are disrupted and illness risk rises (Chapman et al., 2014).');
    if (p.hrs < 12) flags.push('Under 12 h a day at altitude is a small dose; a hypoxic sleeping room or long stay is needed.');
    if (p.len < 21) flags.push('Camps shorter than about three weeks give a smaller dose.');
    if (p.ret < 3) flags.push('Racing within three days of returning risks travel fatigue and readjustment.');
    if (p.ret > 28) flags.push('The benefit is fading by the time you race.');
    if (p.iron) flags.push('Low iron blunts the response. Check ferritin before the camp and supplement only on medical advice.');
    var mode = p.live >= 1800 && p.train <= p.live - 800 ? 'Live high, train low' : p.live >= 1800 && p.train > p.live - 800 ? 'Live high, train high' : p.live < 1500 && p.train >= 1800 ? 'Live low, train high' : 'Sea-level style';
    return { gain: gain, eff: eff, qual: qual, flags: flags, mode: mode, win: eff >= 4 && qual >= 90 && flags.length === 0 };
  }
  function m5(root) {
    h('h2', null, 'Mission 5 · Design the altitude camp', root);
    h('p', { class: 'lede' }, 'Design a camp for a middle-distance runner who wants to race at sea level. Choose where to live, where to train, how long to stay and when to come home. <b>Goal:</b> at least 4% haemoglobin mass gain still in place on race day, at least 90% training quality, and no warning flags.', root);
    var p = S.m5.p || { live: 1000, train: 1000, hrs: 8, len: 14, ret: 3, iron: 0 };
    var g = h('div', { class: 'grid' }, null, root), L = h('div', null, null, g), Rt = h('div', null, null, g);
    var plot = sv('svg', { viewBox: '0 0 560 250', role: 'img', 'aria-label': 'Haemoglobin mass gain across the camp and the return to race day' }, L);
    var stats = h('div', { class: 'stats' }, null, L);
    function stat(k) { var b = h('div', { class: 'stat' }, '<div class="k">' + k + '</div><div class="v">–</div>', stats); return b.querySelector('.v'); }
    var sM = stat('Strategy'), sG = stat('Hbmass gain on race day'), sQ = stat('Training quality');
    var c = h('div', { class: 'card' }, null, Rt), ctrl = h('div', { class: 'ctrl' }, null, c);
    var us = [slider(ctrl, p, 'Live altitude', 'live', 0, 4000, 100, ' m', upd, function (v) { return v.toLocaleString('en-GB'); }),
      slider(ctrl, p, 'Train altitude', 'train', 0, 4000, 100, ' m', upd, function (v) { return v.toLocaleString('en-GB'); }),
      slider(ctrl, p, 'Hours a day at altitude', 'hrs', 0, 24, 1, ' h', upd),
      slider(ctrl, p, 'Camp length', 'len', 7, 42, 1, ' days', upd),
      slider(ctrl, p, 'Days home before race', 'ret', 0, 56, 1, ' days', upd)];
    select(ctrl, p, 'Iron status', 'iron', ['Adequate', 'Low'], upd);
    var out = h('div', { class: 'note' }, '', Rt);
    function upd() {
      var r = camp(p); us.forEach(function (u) { u(); });
      sM.textContent = r.mode; sM.style.fontSize = '17px'; sG.textContent = fx(r.eff) + '%'; sQ.textContent = fx(r.qual, 0) + '%';
      plot.innerHTML = ''; var X = 52, Y = 14, W = 480, H = 180, T = p.len + p.ret + 14, ymax = Math.max(8, r.gain + 1);
      sv('rect', { x: X, y: Y, width: W, height: H, fill: '#fff', stroke: '#d2dfe2' }, plot);
      for (var v = 0; v <= ymax; v += 2) { var y = Y + H - v / ymax * H; sv('line', { x1: X, x2: X + W, y1: y, y2: y, stroke: '#e5eef0' }, plot); st(plot, X - 6, y + 4, v + '%', { 'font-size': 12, 'text-anchor': 'end' }); }
      var d = '', tx = function (t) { return X + t / T * W; }, hy = function (t) {
        if (t <= p.len) return r.gain * t / p.len; var s = t - p.len; return s <= 14 ? r.gain : r.gain * Math.max(0, 1 - (s - 14) / 42);
      };
      for (var t = 0; t <= T; t++) d += (t ? 'L' : 'M') + tx(t) + ',' + (Y + H - hy(t) / ymax * H);
      sv('rect', { x: tx(0), y: Y, width: tx(p.len) - tx(0), height: H, fill: '#dcebfb', opacity: 0.6 }, plot);
      sv('path', { d: d, fill: 'none', stroke: '#2f7fd1', 'stroke-width': 3.5 }, plot);
      var rx = tx(p.len + p.ret); sv('line', { x1: rx, x2: rx, y1: Y, y2: Y + H, stroke: '#e2542c', 'stroke-width': 2, 'stroke-dasharray': '6 4' }, plot);
      st(plot, rx + 5, Y + 14, 'Race', { 'font-size': 12, fill: '#a2371a', 'font-weight': 800 });
      st(plot, tx(0) + 6, Y + H - 6, 'Camp', { 'font-size': 12, fill: '#1d5a9c', 'font-weight': 700 });
      st(plot, X + W / 2, Y + H + 22, 'Days from start of camp', { 'font-size': 12, 'text-anchor': 'middle', fill: '#4f626b' });
      out.className = 'note ' + (r.win ? 'good' : r.flags.length ? 'warn' : '');
      out.innerHTML = (r.win ? '<b>Camp approved.</b> ' : '') + (r.flags.length ? '<b>Check:</b><ul style="margin:6px 0 0 18px;padding:0">' + r.flags.map(function (f) { return '<li>' + f + '</li>'; }).join('') + '</ul>' : (r.win ? 'This design meets all three goals.' : 'No warnings, but the gain or training quality is not yet enough.'));
      if (r.win) { S.m5.ok = true; S.m5.best = { live: p.live, train: p.train, hrs: p.hrs, len: p.len, ret: p.ret, eff: fx(r.eff), qual: fx(r.qual, 0), mode: r.mode }; }
      S.m5.p = p; S.m5.touched = true; save();
    }
    upd();
    h('p', { class: 'why' }, 'The model is a teaching tool. It scales to results such as Levine and Stray-Gundersen (1997), where 4 weeks at 2,500 m improved red cell volume by 9%, and Chapman et al. (2014), where 2,000–2,500 m gave the best sea-level performance gains. Individual responses vary widely.', root);
    h('h3', null, 'Explain it', root);
    var q = [
      mcq(root, 'Why does "live high, train low" often beat "live high, train high" for sea-level performance?', ['It gives a bigger haematological response', 'You keep haematological adaptation but also keep training speed and quality', 'It is shorter', 'Altitude has no effect on training'], 1, 'Levine and Stray-Gundersen (1997) found only the high-low group improved 5 km time: the extra red cell mass came with maintained training velocity.', S.m5, 'q1'),
      mcq(root, 'What does the camp-length slider show?', ['More days only matter if you also live above ~1,800 m for enough hours per day', 'Longer is always worse', 'Length does not matter', 'Only training matters'], 0, 'The dose is hours at sufficient altitude. Short camps or low hours give a small dose.', S.m5, 'q2'),
      mcq(root, 'Why might 2,800 m be a worse choice than 2,300 m for a collegiate runner?', ['It is too cold', 'Training quality and tolerance suffer even though the haematological response is similar', 'Less EPO', 'It is below 1,500 m'], 1, 'Chapman et al. (2014): runners living at 2,085 and 2,454 m improved 3,000 m time trials, those at 1,780 and 2,800 m did not.', S.m5, 'q3')
    ];
    finish(root, 'm5', function () { return S.m5.ok && q.every(function (f) { return f(); }); }, 'Design a camp that wins (all three goals), then answer the three questions');
  }

  /* ================= Mission 6: fuel and fluid ================= */
  function m6(root) {
    h('h2', null, 'Mission 6 · Fuel and fluid at altitude', root);
    h('p', { class: 'lede' }, 'Altitude raises the energy cost of living, suppresses appetite and dries the air you breathe. Two calculators: first an energy budget, then a fluid budget.', root);
    var p = S.m6.p || { alt: 2300, mass: 70, train: 3000, intake: 12000 }; S.m6.g = S.m6.g || {};
    var card = h('div', { class: 'card' }, null, root), ctrl = h('div', { class: 'ctrl' }, null, card);
    var us = [slider(ctrl, p, 'Altitude', 'alt', 0, 6000, 100, ' m', upd, function (v) { return v.toLocaleString('en-GB'); }), slider(ctrl, p, 'Body mass', 'mass', 50, 100, 1, ' kg', upd),
      slider(ctrl, p, 'Training energy', 'train', 0, 6000, 100, ' kJ/day', upd, function (v) { return v.toLocaleString('en-GB'); }), slider(ctrl, p, 'Energy you actually eat', 'intake', 6000, 20000, 100, ' kJ/day', upd, function (v) { return v.toLocaleString('en-GB'); })];
    var stats = h('div', { class: 'stats' }, null, root);
    function stat(k) { var b = h('div', { class: 'stat' }, '<div class="k">' + k + '</div><div class="v">–</div>', stats); return b.querySelector('.v'); }
    var sB = stat('Basal metabolic rate'), sE = stat('Total expenditure'), sA = stat('Energy availability'), sW = stat('Weight change');
    var out = h('div', { class: 'note' }, '', root); h('h3', null, 'Goals', root);
    var gl = h('ul', { class: 'goals' }, null, root);
    var G = [['Camp at 2,000 m or higher with at least 3,000 kJ/day of training: set your intake so energy availability is at least 45 kcal per kg of fat-free mass per day', function (a) { return p.alt >= 2000 && p.train >= 3000 && a.ea >= 45; }], ['At 4,300 m or higher, find the intake that stops weight loss (no more than 0.1 kg/week lost)', function (a) { return p.alt >= 4300 && a.wk >= -0.1; }]].map(function (x) { return { f: x[1], li: h('li', null, x[0], gl) }; });
    function upd() {
      us.forEach(function (u) { u(); });
      var inc = clamp((p.alt - 2000) * 0.0059, 0, 17) / 100 + (p.alt >= 4300 ? 0 : 0), bmr = p.mass * 100 * (1 + inc), exp = bmr * 1.5 + p.train, ffm = p.mass * 0.88;
      var bal = p.intake - exp, ea = (p.intake - p.train) / 4.184 / ffm, wk = bal * 7 / 28000, a = { ea: ea, wk: wk };
      sB.textContent = Math.round(bmr).toLocaleString('en-GB') + ' kJ'; sE.textContent = Math.round(exp).toLocaleString('en-GB') + ' kJ'; sA.textContent = fx(ea, 0) + ' kcal/kg FFM'; sW.textContent = (wk >= 0 ? '+' : '') + fx(wk, 2) + ' kg/wk';
      out.className = 'note' + (ea < 30 ? ' bad' : ea < 45 ? ' warn' : ' good');
      out.innerHTML = ea < 30 ? '<b>Low energy availability.</b> Below about 30 kcal/kg FFM/day risks RED-S, and poor energy availability can interfere with altitude adaptation (Stellingwerff et al., 2019).' : ea < 45 ? '<b>Borderline.</b> Aim for at least 45 kcal/kg FFM/day for adaptation and health.' : '<b>Adequate.</b> Energy availability supports training and adaptation.';
      out.innerHTML += '<br>Basal metabolic rate rises about 10–17% at 4,300 m. Above 5,000 m, an imbalance of 4–8 MJ/day causes 1–2 kg of weight loss a week.';
      G.forEach(function (x, i) { if (x.f(a)) S.m6.g[i] = true; x.li.className = S.m6.g[i] ? 'done' : ''; });
      S.m6.p = p; save();
    }
    upd();
    h('h3', null, 'Fluid budget', root);
    var q2 = S.m6.f || { vent: 60, hrs: 3, g: 2.9 }, c2 = h('div', { class: 'card' }, null, root), cc = h('div', { class: 'ctrl' }, null, c2);
    var u2 = [slider(cc, q2, 'Ventilation', 'vent', 10, 160, 1, ' L/min', upd2), slider(cc, q2, 'Time', 'hrs', 0.5, 8, 0.5, ' h', upd2), slider(cc, q2, 'Water lost per 100 L of air', 'g', 1, 5, 0.1, ' g', upd2)];
    var o2 = h('div', { class: 'note' }, '', root);
    function upd2() {
      u2.forEach(function (u) { u(); });
      var ml = q2.vent * 60 * q2.hrs * q2.g / 100; S.m6.f = q2; S.m6.fl = ml;
      if (Math.abs(ml - 1720) <= 100) S.m6.fok = true;
      o2.className = 'note' + (S.m6.fok ? ' good' : '');
      o2.innerHTML = 'Respiratory water loss: <b>' + Math.round(ml) + ' mL</b> (this is before sweat and urine). ' + (S.m6.fok ? 'This matches the lecture example: about 1,720 mL over 7 h of exercise at 2.9 g per 100 L.' : 'Goal: reproduce the lecture example of about 1,720 mL over 7 h of exercise at 2.9 g per 100 L (what ventilation does that need?).');
      save();
    }
    upd2();
    h('p', { class: 'why' }, 'Typical total fluid loss on Everest is about 3.3 ± 0.6 L/day, and about 3.0 ± 0.5 L/day in sedentary people at 6,542 m, compared with about 1.9 L/day at sea level.', root);
    h('h3', null, 'Explain it', root);
    var q = [
      mcq(root, 'Brooks et al. (1991) found more reliance on blood glucose at 4,300 m in men; Braun et al. (2000) found less carbohydrate use in women. What is the best practical conclusion?', ['Everyone should eat only fat', 'Evidence is mixed, so at low-to-moderate altitude carbohydrate guidance stays in line with sea-level recommendations', 'Carbohydrate is not needed at altitude', 'Women should avoid carbohydrate'], 1, 'Stellingwerff et al. (2019) conclude that guidelines for ~1,600–2,400 m remain theoretical and should align with sea-level recommendations.', S.m6, 'q1'),
      mcq(root, 'At the altitudes typical of elite training camps (~1,600–2,400 m), which two nutrition issues deserve the most attention?', ['Vitamin C and zinc', 'Energy availability and iron', 'Salt and caffeine', 'Fibre and fat'], 1, 'Poor energy availability and increased iron requirements may interfere with hypoxic adaptation (Stellingwerff et al., 2019).', S.m6, 'q2'),
      mcq(root, 'Why are fluid needs higher at altitude?', ['Blood is thinner', 'Higher ventilation of cold, dry air increases respiratory water loss, and diuresis and sweat add to it', 'Lower sweat rate', 'Less thirst, so you drink more'], 1, 'Breathing more of dry air moistens it with body water. Thirst and appetite are often suppressed, so intake may fall at the same time.', S.m6, 'q3'),
      mcq(root, 'Absorption was 96.2% at 5,000 m (Kayser) but 85% at 6,542 m (Westerterp), against 93–96% typical. What does this suggest?', ['Malabsorption is a major issue at 2,000 m', 'Any malabsorption appears to matter only at extreme altitude', 'Absorption rises with altitude', 'Absorption is irrelevant to weight loss'], 1, 'The evidence is mixed. Reduced intake and raised expenditure explain most weight loss, with malabsorption possible only at the extremes.', S.m6, 'q4')
    ];
    finish(root, 'm6', function () { return S.m6.g && S.m6.g[0] && S.m6.g[1] && S.m6.fok && q.every(function (f) { return f(); }); }, 'Meet both energy goals, match the fluid example and answer the four questions');
  }

  /* ================= Mission 7: your athlete ================= */
  function m7(root) {
    h('h2', null, 'Mission 7 · Brief your own athlete', root);
    h('p', { class: 'lede' }, 'Choose a sport and an athlete profile. Plan the first days at 2,300 m, the camp, the health checks and the return. Then copy your summary into Canvas.', root);
    var F = [['sport', 'Your sport, event and athlete', 'For example: 1,500 m runner preparing for a sea-level championship'],
      ['arrive', 'Days 1–3 at altitude', 'What changes (ventilation, heart rate, sleep, appetite)? How will you adjust the training?'],
      ['camp', 'Camp design', 'Live and train altitudes, length, hours a day, timing of return and why (use Mission 5).'],
      ['health', 'Health, nutrition and monitoring', 'Symptom checks, energy availability, iron, fluid. When would you stop and descend?'],
      ['limits', 'Individual differences and limits', 'Who might respond poorly? What other options exist (sleeping tent, heat training)?']];
    var card = h('div', { class: 'card' }, null, root);
    F.forEach(function (f) {
      h('label', { for: 'f_' + f[0], style: 'font-weight:700;display:block;margin:10px 0 4px' }, f[1], card);
      var e = h(f[0] === 'sport' ? 'input' : 'textarea', { id: 'f_' + f[0], placeholder: f[2] }, null, card); if (f[0] === 'sport') { e.type = 'text'; e.style.cssText = 'font:600 15px Open Sans,Arial;padding:7px 9px;border:2px solid #b9cbd0;border-radius:8px;width:100%'; }
      e.value = S.m7[f[0]] || ''; e.addEventListener('input', function () { S.m7[f[0]] = e.value; save(); build(); });
    });
    h('h3', null, 'Your summary', root);
    var sum = h('div', { class: 'sum', tabindex: 0 }, '', root), row = h('div', { class: 'done-bar' }, null, root);
    var copy = h('button', { class: 'btn', type: 'button' }, 'Copy summary', row), msg = h('span', { class: 'pill' }, '', row);
    function build() {
      var n = MISSIONS.filter(function (m) { return S.done[m.id]; }).length, b = S.m5.best;
      sum.textContent = 'SESH54 Altitude Lab summary\nMissions complete: ' + n + ' of ' + N + '\n' +
        (b ? 'My camp design: ' + b.mode + '; live ' + b.live + ' m, train ' + b.train + ' m, ' + b.hrs + ' h/day for ' + b.len + ' days, home ' + b.ret + ' days before the race. Modelled Hbmass gain ' + b.eff + '%, training quality ' + b.qual + '%.\n' : '') +
        '\nAthlete: ' + (S.m7.sport || '') + '\n\nDays 1–3: ' + (S.m7.arrive || '') + '\n\nCamp design: ' + (S.m7.camp || '') + '\n\nHealth, nutrition and monitoring: ' + (S.m7.health || '') + '\n\nIndividual differences and limits: ' + (S.m7.limits || '');
    }
    build();
    copy.addEventListener('click', function () {
      var t = sum.textContent;
      function fallback() { var r = document.createRange(); r.selectNodeContents(sum); var s = getSelection(); s.removeAllRanges(); s.addRange(r); msg.textContent = 'Selected: press Ctrl/Cmd + C'; }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { msg.textContent = 'Copied'; msg.className = 'pill ok'; }, fallback); else fallback();
    });
    finish(root, 'm7', function () { return F.every(function (f) { return (S.m7[f[0]] || '').trim().length >= (f[0] === 'sport' ? 3 : 40); }); }, 'Write at least a sentence or two in each box first');
    var reset = h('button', { class: 'btn ghost', type: 'button', style: 'margin-top:26px' }, 'Reset all my progress', root);
    reset.addEventListener('click', function () { if (confirm('Clear all your answers and progress in this browser?')) { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } location.reload(); } });
  }

  progress();
  var first = MISSIONS.map(function (m) { return !!S.done[m.id]; }).indexOf(false);
  show(first < 0 ? N - 1 : first);
})();
