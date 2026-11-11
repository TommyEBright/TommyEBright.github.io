/* Thermal Lab: six missions. State is kept in localStorage so students can leave and come back. */
(function () {
  'use strict';
  var KEY = 'sesh54-thermal-lab-v1', NS = 'http://www.w3.org/2000/svg';
  var S = { done: {}, m1: {}, m2: {}, m3: {}, m4: {}, m5: {}, m6: {} };
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

  var MISSIONS = [
    { id: 'm1', t: '1 · Heat balance', f: m1 }, { id: 'm2', t: '2 · Performance', f: m2 }, { id: 'm3', t: '3 · Heat illness', f: m3 },
    { id: 'm4', t: '4 · Measuring', f: m4 }, { id: 'm5', t: '5 · Acclimation', f: m5 }, { id: 'm6', t: '6 · Your sport', f: m6 }
  ];
  var tabs = document.getElementById('tabs'), main = document.getElementById('main'), cur = 0;
  MISSIONS.forEach(function (m, i) {
    m.b = h('button', { type: 'button', role: 'tab' }, m.t, tabs);
    m.b.addEventListener('click', function () { show(i); });
  });
  function progress() {
    var n = 0; MISSIONS.forEach(function (m) { var d = !!S.done[m.id]; m.b.classList.toggle('done', d); if (d) n++; });
    document.getElementById('pbar').style.width = (n / 6 * 100) + '%';
    document.getElementById('ptext').textContent = n + ' of 6 missions complete' + (n === 6 ? '. Go to mission 6 to copy your summary.' : '');
  }
  function show(i) {
    cur = i; main.innerHTML = '';
    MISSIONS.forEach(function (m, k) { m.b.setAttribute('aria-selected', k === i); });
    MISSIONS[i].f(main); window.scrollTo(0, 0);
  }
  function finish(root, id, ok, msg) {
    var bar = h('div', { class: 'done-bar' }, null, root);
    var b = h('button', { class: 'btn', type: 'button' }, S.done[id] ? 'Mission complete ✓ · next mission' : 'Mark mission complete', bar);
    var note = h('span', { class: 'pill' }, '', bar);
    b.addEventListener('click', function () {
      if (!ok()) { note.textContent = msg; note.className = 'pill hot'; return; }
      S.done[id] = true; save(); if (cur < 5) show(cur + 1); else show(5);
    });
    return bar;
  }
  /* multiple-choice helper: returns a function that reports whether it has been answered correctly */
  function mcq(parent, q, options, answer, why, store, key) {
    var box = h('div', { class: 'q' }, '<p><b>' + q + '</b></p>', parent), o = h('div', { class: 'opts' }, null, box), w = h('div', { class: 'why' }, '', box);
    var bs = options.map(function (t, i) {
      var b = h('button', { type: 'button' }, t, o);
      b.addEventListener('click', function () { pick(i, true); });
      return b;
    });
    function pick(i, user) {
      bs.forEach(function (b) { b.classList.remove('right', 'wrong'); });
      var ok = i === answer; bs[i].classList.add(ok ? 'right' : 'wrong');
      w.innerHTML = (ok ? '<b>Yes.</b> ' + why : '<b>Not quite.</b> Try again.');
      if (user) { store[key] = store[key] || { tries: 0 }; if (!store[key].ok) store[key].tries++; if (ok) store[key].ok = true; save(); }
    }
    if (store[key] && store[key].ok) pick(answer, false);
    return function () { return !!(store[key] && store[key].ok); };
  }

  /* ================= Mission 1: heat balance simulator ================= */
  function psat(T) { return 0.6105 * Math.exp(17.27 * T / (T + 237.3)); }
  var INT = [['Rest', 100], ['Easy', 310], ['Moderate', 550], ['Hard', 790]];
  var KIT = [['Minimal race kit', 1], ['T-shirt and shorts', 0.75], ['Layers', 0.45], ['Winter kit', 0.3]];
  function balance(p) {
    var A = 1.8, H = INT[p.int][1], fcl = KIT[p.kit][1];
    var Tsk = clamp(33 + 0.15 * (p.ta - 25), 25, 36.5);
    var v = Math.max(0.2, p.wind) + (p.int > 0 ? 1 : 0), hc = 8.3 * Math.pow(v, 0.6), hr = 4.7;
    var dry = (hc + hr) * (Tsk - p.ta) * A * fcl;          // + = loss
    var R = dry * hr / (hc + hr) - p.sun / 100 * 200, C = dry * hc / (hc + hr), K = 3;
    var req = H - R - C - K, E = 0, shiver = 0, sweat = 0;
    if (req > 0) {
      var emax = Math.max(0, 16.5 * hc * (psat(Tsk) - p.rh / 100 * psat(p.ta)) * A * (p.acc ? 1 : 0.85) * (0.4 + 0.6 * fcl));
      var cap = p.acc ? 1200 : 800;
      E = Math.min(req, emax, cap); sweat = Math.min(cap, req) / 667;
    } else shiver = Math.min(-req, 250);
    var store = req - E + shiver;
    var pts = [], t39 = null, t35 = null, T0 = p.acc ? 36.8 : 37;
    for (var t = 0; t <= 90; t++) {
      var Tc = T0 + 0.0016 * H * (1 - Math.exp(-t / 12)) + 0.6 * store * 60 * t / (70 * 3470);
      Tc = clamp(Tc, 33, 41.5); pts.push(Tc);
      if (t39 == null && Tc >= 39.5) t39 = t; if (t35 == null && Tc <= 35) t35 = t;
    }
    return { H: H, R: R, C: C, K: K, E: E, shiver: shiver, store: store, Tsk: Tsk, pts: pts, t39: t39, t35: t35, sweat: sweat, emaxLimited: req > 0 && E < req - 1 };
  }
  function m1(root) {
    h('h2', null, 'Mission 1 · Balance the heat', root);
    h('p', { class: 'lede' }, 'Heat storage <b>S = M ± R ± C ± K − E</b>. Change the environment and the athlete, and watch each avenue of heat exchange and the core temperature respond. Complete at least four of the five goals.', root);
    var p = S.m1.p || { ta: 20, rh: 50, wind: 0, sun: 0, int: 0, kit: 1, acc: 0 };
    var g = h('div', { class: 'grid' }, null, root), L = h('div', null, null, g), Rt = h('div', null, null, g);
    var fig = sv('svg', { viewBox: '0 0 560 330', role: 'img', 'aria-label': 'Athlete with arrows showing each avenue of heat exchange' }, L);
    var plot = sv('svg', { viewBox: '0 0 560 230', role: 'img', 'aria-label': 'Core temperature over 90 minutes' }, L);
    var stats = h('div', { class: 'stats' }, null, L);
    function stat(k) { var b = h('div', { class: 'stat' }, '<div class="k">' + k + '</div><div class="v">–</div>', stats); return b.querySelector('.v'); }
    var sS = stat('Heat storage'), sT = stat('Core temp at 60 min'), sW = stat('Sweat rate'), sX = stat('Status');
    var c = h('div', { class: 'card' }, null, Rt), ctrl = h('div', { class: 'ctrl' }, null, c);
    function slider(label, key, min, max, step, unit) {
      h('label', null, label, ctrl); var r = h('input', { type: 'range', min: min, max: max, step: step, value: p[key], 'aria-label': label }, null, ctrl); var o = h('output', null, '', ctrl);
      r.addEventListener('input', function () { p[key] = +r.value; upd(); }); return function () { o.textContent = p[key] + unit; };
    }
    function select(label, key, opts) {
      h('label', null, label, ctrl); var s = h('select', { 'aria-label': label }, null, ctrl); h('span', null, '', ctrl);
      opts.forEach(function (o, i) { h('option', { value: i }, o, s); }); s.value = p[key];
      s.addEventListener('change', function () { p[key] = +s.value; upd(); });
    }
    var outs = [slider('Air temperature', 'ta', -10, 45, 1, ' °C'), slider('Humidity', 'rh', 10, 100, 5, ' %'), slider('Wind or fan', 'wind', 0, 8, 0.5, ' m/s'), slider('Sun', 'sun', 0, 100, 10, ' %')];
    select('Exercise', 'int', INT.map(function (x) { return x[0]; })); select('Clothing', 'kit', KIT.map(function (x) { return x[0]; })); select('Heat acclimated?', 'acc', ['No', 'Yes']);
    h('h3', null, 'Goals', Rt);
    var goals = h('ul', { class: 'goals' }, null, Rt);
    var G = [
      ['g1', '<b>At rest in a 20 °C room</b> (no sun, no wind): which avenue loses the most heat? Set it up and look.', function (b) { return p.int === 0 && p.ta === 20 && p.sun === 0 && p.wind === 0; }, 'Radiation: about half of heat loss at rest.'],
      ['g2', '<b>Turn the arrows round.</b> Raise the air temperature until radiation and convection <em>add</em> heat instead of removing it.', function (b) { return b.R < 0 && b.C < 0; }, 'Once air is hotter than skin (about 35 °C), evaporation is the only way left to lose heat.'],
      ['g3', '<b>Break evaporation.</b> During moderate exercise at 30 °C or hotter, raise humidity until sweat can no longer evaporate fast enough.', function (b) { return p.int >= 2 && p.ta >= 30 && b.emaxLimited && p.rh >= 70; }, 'Humid air already holds water vapour, so sweat drips off instead of evaporating. This is uncompensable heat stress.'],
      ['g4', '<b>Rescue the runner.</b> Hard exercise at 32 °C or hotter: keep core temperature under 39.5 °C for 60 minutes. You can change anything else.', function (b) { return p.int === 3 && p.ta >= 32 && b.pts[60] < 39.5; }, 'Airflow, shade, less clothing, drier air and acclimation all help.'],
      ['g5', '<b>Now go cold.</b> At rest in minimal kit, make core temperature fall below 35 °C within 90 minutes.', function (b) { return b.t35 != null; }, 'Wind strips the warm air layer from the skin (wind chill). Shivering adds heat, but not enough.']
    ];
    S.m1.g = S.m1.g || {};
    var gl = G.map(function (x) { return h('li', null, x[1], goals); });
    var explain = h('div', { class: 'note' }, '', Rt);
    function arrow(x1, y1, x2, y2, W, col, label, sub) {
      var w = clamp(Math.abs(W) / 18, 0, 34); if (w < 1.2) w = 1.2;
      var a = W >= 0 ? [x1, y1, x2, y2] : [x2, y2, x1, y1], id = 'ah' + Math.random().toString(36).slice(2);
      var d = sv('defs', {}, fig), mk = sv('marker', { id: id, viewBox: '0 0 10 10', refX: 5, refY: 5, markerWidth: 3.2, markerHeight: 3.2, orient: 'auto' }, d); sv('path', { d: 'M0,0 L10,5 L0,10 z', fill: col }, mk);
      sv('line', { x1: a[0], y1: a[1], x2: a[2], y2: a[3], stroke: col, 'stroke-width': w, 'marker-end': 'url(#' + id + ')', opacity: Math.abs(W) < 1 ? .25 : .9 }, fig);
      st(fig, x2 + (x2 > 280 ? 8 : -8), y2 - 6, label, { 'text-anchor': x2 > 280 ? 'start' : 'end', 'font-weight': 800, fill: col, 'font-size': 15 });
      st(fig, x2 + (x2 > 280 ? 8 : -8), y2 + 12, sub, { 'text-anchor': x2 > 280 ? 'start' : 'end', 'font-size': 13, fill: '#4f626b' });
    }
    function upd() {
      S.m1.p = p; outs.forEach(function (f) { f(); });
      var b = balance(p); fig.innerHTML = '';
      // background: sun and ground
      sv('rect', { x: 0, y: 0, width: 560, height: 330, rx: 14, fill: p.ta >= 28 ? '#fff4e6' : p.ta <= 8 ? '#eaf3fc' : '#f4f8f9' }, fig);
      if (p.sun > 0) sv('circle', { cx: 500, cy: 48, r: 14 + p.sun / 5, fill: '#f2a900', opacity: .35 + p.sun / 160 }, fig);
      sv('rect', { x: 0, y: 296, width: 560, height: 34, fill: '#dfe7ea' }, fig);
      var Tc60 = b.pts[60], heat = clamp((Tc60 - 36.5) / 3, 0, 1), cold = clamp((36.5 - Tc60) / 2, 0, 1);
      var body = cold > 0 ? 'rgb(' + Math.round(240 - 120 * cold) + ',' + Math.round(200 - 40 * cold) + ',' + Math.round(190 + 50 * cold) + ')' : 'rgb(' + Math.round(240 - 10 * heat) + ',' + Math.round(200 - 110 * heat) + ',' + Math.round(170 - 110 * heat) + ')';
      sv('circle', { cx: 280, cy: 70, r: 26, fill: body, stroke: '#24343b', 'stroke-width': 3 }, fig);
      sv('path', { d: 'M250,104 Q280,94 310,104 L318,200 L296,200 L292,292 L268,292 L264,200 L242,200 Z', fill: body, stroke: '#24343b', 'stroke-width': 3, 'stroke-linejoin': 'round' }, fig);
      sv('path', { d: 'M250,108 L218,180 M310,108 L342,180', stroke: '#24343b', 'stroke-width': 13, 'stroke-linecap': 'round' }, fig);
      sv('path', { d: 'M250,108 L218,180 M310,108 L342,180', stroke: body, 'stroke-width': 8, 'stroke-linecap': 'round' }, fig);
      st(fig, 280, 160, fx(b.H, 0) + ' W', { 'text-anchor': 'middle', 'font-weight': 800, 'font-size': 17 });
      st(fig, 280, 178, 'M: heat made', { 'text-anchor': 'middle', 'font-size': 12, fill: '#4f626b' });
      if (b.shiver > 50) st(fig, 280, 196, '+' + fx(b.shiver, 0) + ' W shivering', { 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: '#2f7fd1' });
      arrow(330, 96, 440, 60, b.R, '#d8452a', 'R  ' + (b.R >= 0 ? '−' : '+') + fx(Math.abs(b.R), 0) + ' W', 'radiation' + (b.R < 0 ? ' (gain)' : ''));
      arrow(332, 190, 450, 190, b.C, '#1f8fa6', 'C  ' + (b.C >= 0 ? '−' : '+') + fx(Math.abs(b.C), 0) + ' W', 'convection' + (b.C < 0 ? ' (gain)' : ''));
      arrow(228, 96, 120, 60, b.E, '#2f7fd1', 'E  −' + fx(b.E, 0) + ' W', 'evaporation');
      arrow(266, 290, 150, 270, b.K, '#9c7b4f', 'K  −' + fx(b.K, 0) + ' W', 'conduction');
      st(fig, 16, 318, 'Skin ' + fx(b.Tsk) + ' °C · air ' + p.ta + ' °C · arrow width shows watts', { 'font-size': 13, fill: '#4f626b' });
      // core temperature plot
      plot.innerHTML = '';
      var x0 = 52, w = 490, y0 = 12, hh = 170, X = function (t) { return x0 + t / 90 * w; }, Y = function (T) { return y0 + (41.5 - T) / 8.5 * hh; };
      sv('rect', { x: x0, y: Y(41.5), width: w, height: Y(39.5) - Y(41.5), fill: '#fde3da' }, plot); sv('rect', { x: x0, y: Y(35), width: w, height: Y(33) - Y(35), fill: '#dcebfb' }, plot);
      [33, 35, 37, 39.5, 41].forEach(function (T) { sv('line', { x1: x0, x2: x0 + w, y1: Y(T), y2: Y(T), stroke: '#d2dfe2' }, plot); st(plot, x0 - 6, Y(T) + 5, T, { 'text-anchor': 'end', 'font-size': 12, fill: '#4f626b' }); });
      [0, 30, 60, 90].forEach(function (t) { st(plot, X(t), y0 + hh + 18, t, { 'text-anchor': 'middle', 'font-size': 12, fill: '#4f626b' }); });
      st(plot, x0 + w / 2, 222, 'Time (min)', { 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700 });
      st(plot, x0 + 6, Y(39.5) - 5, 'hyperthermia > 39.5 °C', { 'font-size': 12, 'font-weight': 700, fill: '#a2371a' }); st(plot, x0 + 6, Y(35) + 14, 'hypothermia < 35 °C', { 'font-size': 12, 'font-weight': 700, fill: '#1d5a9c' });
      sv('path', { d: b.pts.map(function (T, t) { return (t ? 'L' : 'M') + X(t).toFixed(1) + ',' + Y(T).toFixed(1); }).join(''), fill: 'none', stroke: '#0b3a4c', 'stroke-width': 3.5 }, plot);
      sv('line', { x1: X(60), x2: X(60), y1: y0, y2: y0 + hh, stroke: '#7a8a91', 'stroke-dasharray': '4 4' }, plot);
      sS.textContent = (b.store >= 0 ? '+' : '') + fx(b.store, 0) + ' W'; sS.style.color = b.store > 20 ? '#d8452a' : b.store < -20 ? '#2f7fd1' : '#2e9e5b';
      sT.textContent = fx(Tc60) + ' °C'; sW.textContent = fx(b.sweat) + ' L/h';
      sX.textContent = b.t39 != null ? '39.5 °C at ' + b.t39 + ' min' : b.t35 != null ? '35 °C at ' + b.t35 + ' min' : 'Balanced'; sX.style.fontSize = '17px';
      explain.className = 'note' + (b.t39 != null ? ' bad' : b.emaxLimited ? ' warn' : '');
      explain.innerHTML = b.store < -20 ? '<b>Losing heat faster than it is made.</b> Skin blood vessels constrict and shivering starts, but core temperature still drifts down.'
        : b.emaxLimited ? '<b>Uncompensable heat stress.</b> The athlete needs to evaporate more sweat than the air will take, so the extra heat is stored and core temperature keeps climbing.'
        : (b.R < 0 && b.C < 0) ? '<b>Air is hotter than skin.</b> Radiation and convection now add heat. Evaporation is doing all the cooling.'
        : '<b>Compensable.</b> Heat loss matches heat production, so core temperature settles at a new steady level.';
      G.forEach(function (x, i) { if (x[2](b)) { if (!S.m1.g[x[0]]) { S.m1.g[x[0]] = true; } } gl[i].className = S.m1.g[x[0]] ? 'done' : ''; gl[i].innerHTML = x[1] + (S.m1.g[x[0]] ? '<br><span class="why">' + x[3] + '</span>' : ''); });
      save();
    }
    upd();
    h('p', { class: 'why' }, 'Model: a 70 kg athlete with 1.8 m² of skin. It is deliberately simple, so use it to see patterns, not to predict a real person.', root);
    finish(root, 'm1', function () { return G.filter(function (x) { return S.m1.g[x[0]]; }).length >= 4; }, 'Complete at least 4 of the 5 goals first');
  }

  /* ================= Mission 2: performance in heat and cold ================= */
  function m2(root) {
    h('h2', null, 'Mission 2 · Predict the performance', root);
    h('p', { class: 'lede' }, 'Galloway and Maughan (1997) asked cyclists to ride to exhaustion at about 70% of VO₂max in four air temperatures. <b>Predict how long they lasted</b>, then reveal the data.', root);
    var g = h('div', { class: 'grid' }, null, root), L = h('div', null, null, g), Rt = h('div', { class: 'card' }, null, g);
    var T = [4, 11, 21, 31], REAL = [81, 94, 81, 52], pr = S.m2.pred || [60, 60, 60, 60];
    var s = sv('svg', { viewBox: '0 0 560 320', role: 'img', 'aria-label': 'Bar chart of time to exhaustion at four air temperatures' }, L);
    var ctrl = h('div', { class: 'ctrl' }, null, Rt), outs = [];
    T.forEach(function (t, i) {
      h('label', null, t + ' °C', ctrl); var r = h('input', { type: 'range', min: 20, max: 120, step: 1, value: pr[i], 'aria-label': 'Predicted minutes at ' + t + ' degrees' }, null, ctrl), o = h('output', null, '', ctrl);
      r.addEventListener('input', function () { pr[i] = +r.value; S.m2.pred = pr; draw(); save(); }); outs.push(o);
      if (S.m2.revealed) r.disabled = true;
    });
    var rev = h('button', { class: 'btn', type: 'button', style: 'margin-top:12px' }, 'Lock in and reveal', Rt), fb = h('div', { class: 'note', style: 'display:none' }, '', Rt);
    function draw() {
      s.innerHTML = ''; var x0 = 50, y0 = 14, hh = 250, Y = function (v) { return y0 + hh - v / 120 * hh; };
      [0, 30, 60, 90, 120].forEach(function (v) { sv('line', { x1: x0, x2: 550, y1: Y(v), y2: Y(v), stroke: '#d2dfe2' }, s); st(s, x0 - 6, Y(v) + 5, v, { 'text-anchor': 'end', 'font-size': 12, fill: '#4f626b' }); });
      st(s, 14, y0 + hh / 2, 'Time to exhaustion (min)', { 'font-size': 13, 'font-weight': 700, transform: 'rotate(-90 14 ' + (y0 + hh / 2) + ')', 'text-anchor': 'middle' });
      T.forEach(function (t, i) {
        var x = x0 + 30 + i * 125; outs[i].textContent = pr[i] + ' min';
        sv('rect', { x: x, y: Y(pr[i]), width: 40, height: Y(0) - Y(pr[i]), rx: 4, fill: '#9fb4bb' }, s); st(s, x + 20, Y(pr[i]) - 5, pr[i], { 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, fill: '#4f626b' });
        if (S.m2.revealed) { sv('rect', { x: x + 46, y: Y(REAL[i]), width: 40, height: Y(0) - Y(REAL[i]), rx: 4, fill: ['#2f7fd1', '#49b6c9', '#f2a900', '#d8452a'][i] }, s); st(s, x + 66, Y(REAL[i]) - 5, REAL[i], { 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 800 }); }
        st(s, x + 43, y0 + hh + 20, t + ' °C', { 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 700 });
      });
      st(s, 300, 308, S.m2.revealed ? 'Grey = your prediction · colour = measured' : 'Grey = your prediction', { 'text-anchor': 'middle', 'font-size': 13, fill: '#4f626b' });
    }
    function reveal() {
      rev.disabled = true; fb.style.display = '';
      var err = Math.round(pr.reduce(function (a, v, i) { return a + Math.abs(v - REAL[i]); }, 0) / 4), best = pr.indexOf(Math.max.apply(null, pr));
      fb.innerHTML = '<b>Measured: 81, 94, 81 and 52 minutes.</b> You were out by ' + err + ' min on average, and ' + (best === 1 ? 'you correctly picked 11 °C as the best temperature.' : 'the best temperature was 11 °C, not ' + T[best] + ' °C.') + ' Endurance is best in cool air, falls sharply in the heat, and also falls in the cold.';
    }
    rev.addEventListener('click', function () { S.m2.revealed = true; save(); show(1); });
    draw(); if (S.m2.revealed) reveal();
    h('h3', null, 'Why? Sort the mechanisms', root);
    h('p', null, 'Does each mechanism mainly limit performance in the <b>heat</b> or in the <b>cold</b>?', root);
    var ITEMS = [['More blood sent to the skin, so less returns to the heart: heart rate drifts up and stroke volume falls', 0, 'Cardiovascular drift.'], ['Muscle enzymes work more slowly and contraction speed falls', 1, 'A cooler muscle produces less power (Blomstrand et al., 1984).'], ['The brain reduces the drive to the muscles as core temperature approaches about 40 °C', 0, 'Central fatigue.'], ['Muscle glycogen is used faster', 0, 'Heat increases glycogenolysis (Hargreaves, 2008).'], ['Energy is spent on shivering', 1, 'Shivering raises the oxygen cost of any given pace.'], ['Fluid is lost as sweat, lowering plasma volume', 0, 'Dehydration makes cardiovascular drift worse.']];
    S.m2.sort = S.m2.sort || {};
    var checks = ITEMS.map(function (it, i) { return mcq(root, it[0], ['Heat', 'Cold'], it[1], it[2], S.m2.sort, 's' + i); });
    h('div', { class: 'note' }, '<b>Marathon data agree.</b> Ely et al. (2007) found finishing times slow progressively as wet-bulb globe temperature (WBGT) rises from 5 to 25 °C, and slower runners lose the most time.', root);
    finish(root, 'm2', function () { return S.m2.revealed && checks.every(function (f) { return f(); }); }, 'Reveal the data and sort all six mechanisms first');
  }

  /* ================= Mission 3: heat illness triage ================= */
  function m3(root) {
    h('h2', null, 'Mission 3 · Heat illness triage', root);
    h('p', { class: 'lede' }, 'You are the sport scientist at a summer event. First put the heat illnesses in order, then deal with four casualties.', root);
    var ORDER = ['Heat rash', 'Heat cramps', 'Heat syncope', 'Heat exhaustion', 'Heat stroke'], sh = ['Heat exhaustion', 'Heat rash', 'Heat stroke', 'Heat syncope', 'Heat cramps'];
    S.m3.order = S.m3.order || [];
    h('h3', null, 'A. Click the conditions from mildest to most dangerous', root);
    var o = h('div', { class: 'opts' }, null, root), of = h('div', { class: 'why' }, '', root);
    function drawOrder() {
      o.innerHTML = '';
      sh.forEach(function (n) {
        var idx = S.m3.order.indexOf(n), b = h('button', { type: 'button' }, (idx > -1 ? '<b>' + (idx + 1) + '.</b> ' : '') + n, o);
        if (idx > -1) b.classList.add('right');
        b.addEventListener('click', function () {
          if (idx > -1 || S.m3.orderOk) return;
          if (ORDER[S.m3.order.length] === n) { S.m3.order.push(n); if (S.m3.order.length === 5) S.m3.orderOk = true; of.innerHTML = S.m3.orderOk ? '<b>Correct.</b> Rash, cramps and syncope are mild; heat exhaustion is dangerous; heat stroke is a medical emergency.' : ''; save(); drawOrder(); }
          else { b.classList.add('wrong'); of.innerHTML = '<b>Not next.</b> Think about which is least serious of those left.'; }
        });
      });
    }
    drawOrder(); if (S.m3.orderOk) of.innerHTML = '<b>Correct.</b> Rash, cramps and syncope are mild; heat exhaustion is dangerous; heat stroke is a medical emergency.';
    h('h3', null, 'B. Four casualties', root);
    S.m3.c = S.m3.c || {};
    var CASES = [
      ['A club runner finishes a 10 km, stops and stands still in the sun, then faints. They come round within a minute, are fully alert, and their rectal temperature is 38.1 °C.', ['Heat cramps', 'Heat syncope', 'Heat stroke'], 1, 'Blood pools in the legs and dilated skin vessels once the muscle pump stops.', ['Lie them down in the shade with legs raised', 'Ice bath immediately', 'Salt tablets and keep running'], 0, 'Restoring blood flow to the brain is the priority. Monitor them and give fluids.'],
      ['A footballer in the 80th minute of a hot match has painful, involuntary calf contractions. They are alert and talking normally.', ['Heat cramps', 'Heat exhaustion', 'Heat rash'], 0, 'Painful muscle spasms after prolonged sweating, with normal mental state.', ['Rest, stretch and replace fluid and sodium', 'Call 999', 'Wrap them in a blanket'], 0, 'Usually settles with rest, stretching and electrolyte drinks.'],
      ['A triathlete slows to a walk, is pale, dizzy, nauseous and sweating heavily. They answer questions sensibly. Rectal temperature is 39.2 °C.', ['Heat syncope', 'Heat exhaustion', 'Heat stroke'], 1, 'Unable to continue, core temperature raised but under 40 °C, and no confusion.', ['Stop exercise, move to shade, cool and rehydrate, and monitor closely', 'Let them finish the race slowly', 'Send them home alone to rest'], 0, 'If they get worse or become confused, treat as heat stroke.'],
      ['A runner collapses near the finish. They are confused, aggressive and cannot say where they are. Their skin is hot. Rectal temperature is 41.3 °C.', ['Heat exhaustion', 'Heat syncope', 'Exertional heat stroke'], 2, 'Core temperature above 40 °C <b>with</b> central nervous system dysfunction.', ['Give them a sports drink and wait', 'Cool first, transport second: cold-water immersion now and call 999', 'Drive them to hospital straight away'], 1, 'Survival depends on how fast core temperature is brought below about 39 °C. Whole-body cold-water immersion is the fastest method.']
    ];
    var checks = [];
    CASES.forEach(function (c, i) {
      var box = h('div', { class: 'card white', style: 'margin-bottom:14px' }, '<p style="margin-top:0"><span class="pill hot">Casualty ' + (i + 1) + '</span> ' + c[0] + '</p>', root);
      checks.push(mcq(box, 'What is it?', c[1], c[2], c[3], S.m3.c, 'd' + i)); checks.push(mcq(box, 'What do you do first?', c[4], c[5], c[6], S.m3.c, 'a' + i));
    });
    h('h3', null, 'C. Why is heat stroke so dangerous?', root);
    checks.push(mcq(root, 'The "dual pathway model" (Bouchama &amp; Knochel, 2002) says heat stroke damages the body in two ways. Which pair is correct?', ['Dehydration and low blood sugar', 'Direct heat damage to cells, plus a whole-body inflammatory response after gut bacteria leak into the blood', 'Muscle cramps and loss of sodium'], 1, 'Heat and reduced gut blood flow make the gut wall leaky. Endotoxin enters the blood and triggers systemic inflammation (SIRS), which can lead to organ failure.', S.m3.c, 'dual'));
    finish(root, 'm3', function () { return S.m3.orderOk && checks.every(function (f) { return f(); }); }, 'Finish the ordering and every question first');
  }

  /* ================= Mission 4: measuring body temperature ================= */
  function m4(root) {
    h('h2', null, 'Mission 4 · Measure it properly', root);
    h('p', { class: 'lede' }, 'You can only manage heat stress if you can measure it. Choose the right method for each situation, then calculate mean body temperature.', root);
    S.m4.q = S.m4.q || {};
    var c = [
      mcq(root, 'A lab study needs the most accepted measure of core temperature during 60 minutes of cycling in the heat.', ['Tympanic (ear)', 'Rectal', 'Forehead strip'], 1, 'Rectal temperature is the usual criterion measure in exercise studies, though it is invasive.', S.m4.q, 'a'),
      mcq(root, 'You want continuous core temperature from a footballer during a real match.', ['Oesophageal probe', 'Ingestible telemetry pill', 'Rectal probe'], 1, 'The pill transmits from the gut. It must be swallowed hours beforehand, and cold drinks can affect the reading early on.', S.m4.q, 'b'),
      mcq(root, 'A researcher needs the fastest response to rapid changes in core temperature and the participant accepts an invasive method.', ['Oesophageal', 'Tympanic', 'Skin thermistors'], 0, 'The oesophagus lies beside the heart and aorta, so it tracks blood temperature quickly.', S.m4.q, 'c'),
      mcq(root, 'A pitch-side volunteer takes an ear (tympanic) reading of 37.4 °C from a collapsed, confused runner on a hot day. What should you conclude?', ['They are fine', 'The reading may be falsely low: do not rule out heat stroke', 'They have hypothermia'], 1, 'Ear and skin methods are affected by air temperature, sweat and airflow, and can under-read badly after exercise in the heat. Use rectal temperature for suspected heat stroke.', S.m4.q, 'd')
    ];
    h('h3', null, 'Mean body temperature', root);
    h('div', { class: 'note' }, 'The body is a warm <b>core</b> inside a cooler <b>shell</b>. Mean body temperature weights the two:<br><b>Hot conditions:</b> 0.8 × T<sub>core</sub> + 0.2 × T<sub>skin</sub> &nbsp;·&nbsp; <b>Cold conditions:</b> 0.65 × T<sub>core</sub> + 0.35 × T<sub>skin</sub>', root);
    var CALC = [['Cycling in 35 °C: core 38.6 °C, mean skin 35.2 °C.', 0.8 * 38.6 + 0.2 * 35.2, 'x'], ['Hill walking in 2 °C wind and rain: core 36.4 °C, mean skin 24.0 °C.', 0.65 * 36.4 + 0.35 * 24, 'y']];
    var calcOk = CALC.map(function (q) {
      var box = h('div', { class: 'q' }, '<p><b>' + q[0] + '</b> Mean body temperature?</p>', root), row = h('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, null, box);
      var inp = h('input', { type: 'number', step: '0.1', style: 'width:130px', 'aria-label': 'Mean body temperature in degrees Celsius' }, null, row), b = h('button', { class: 'btn ghost', type: 'button' }, 'Check', row), w = h('div', { class: 'why' }, '', box);
      if (S.m4.q[q[2]]) { inp.value = fx(q[1]); w.innerHTML = '<b>Correct:</b> ' + fx(q[1], 2) + ' °C.'; }
      b.addEventListener('click', function () {
        var v = parseFloat(inp.value);
        if (Math.abs(v - q[1]) <= 0.15) { S.m4.q[q[2]] = true; w.innerHTML = '<b>Correct:</b> ' + fx(q[1], 2) + ' °C.'; save(); }
        else w.innerHTML = '<b>Not yet.</b> Multiply each temperature by its weighting, then add them. Check you used the right pair of weightings.';
      });
      return function () { return !!S.m4.q[q[2]]; };
    });
    h('div', { class: 'note warn' }, '<b>Think:</b> why does skin temperature get a bigger weighting in the cold? In the cold, blood is withdrawn from the skin and limbs, so more of the body\'s mass sits at "shell" temperature.', root);
    finish(root, 'm4', function () { return c.concat(calcOk).every(function (f) { return f(); }); }, 'Answer all four questions and both calculations first');
  }

  /* ================= Mission 5: heat acclimation planner ================= */
  var VARS = [['Heart rate and plasma volume', 2.5, '#d8452a'], ['Core temperature', 4, '#c98a00'], ['Sweating', 6, '#2f7fd1']];
  function plan(p) {
    var heat = {}, d;
    for (d = 0; d < p.len; d++) heat[-p.start + d] = 1;
    for (d = 1; d <= p.top; d++) heat[-2 - (d - 1) * 2] = 1;   // top-up sessions on alternate days before the race
    var out = VARS.map(function (v) { var A = 0, arr = [], seen = false; for (var day = -35; day <= 0; day++) { if (heat[day]) { var tau = seen && !heat[day - 1] ? v[1] / 2 : v[1]; A += (1 - A) * (1 - Math.exp(-1 / tau)); seen = true; } else A *= 0.965; arr.push(A); } return arr; });
    var blockEnd = -p.start + p.len - 1;
    return { curves: out, heat: heat, ready: out.reduce(function (a, c) { return a + c[35]; }, 0) / 3, blockEnd: blockEnd };
  }
  function m5(root) {
    h('h2', null, 'Mission 5 · Plan the acclimation camp', root);
    h('p', { class: 'lede' }, 'Your athlete races in 33 °C heat on <b>day 0</b>. Plan their heat acclimation so they arrive at least <b>80% adapted</b>, without a heavy heat block in the final three days.', root);
    var p = S.m5.p || { start: 30, len: 5, top: 0 };
    var g = h('div', { class: 'grid' }, null, root), L = h('div', null, null, g), Rt = h('div', null, null, g);
    var s = sv('svg', { viewBox: '0 0 560 330', role: 'img', 'aria-label': 'Adaptation over the 35 days before the race' }, L);
    var c = h('div', { class: 'card' }, null, Rt), ctrl = h('div', { class: 'ctrl' }, null, c);
    h('label', null, 'Block starts', ctrl); var r1 = h('input', { type: 'range', min: 4, max: 35, step: 1, value: p.start, 'aria-label': 'Days before the race that the heat block starts' }, null, ctrl), o1 = h('output', null, '', ctrl);
    h('label', null, 'Block length', ctrl); var s2 = h('select', { 'aria-label': 'Block length' }, null, ctrl); h('span', null, '', ctrl);
    [[5, '5 days (short-term)'], [7, '7 days'], [10, '10 days'], [14, '14 days (long-term)']].forEach(function (x) { h('option', { value: x[0] }, x[1], s2); }); s2.value = p.len;
    h('label', null, 'Top-up sessions', ctrl); var s3 = h('select', { 'aria-label': 'Top-up sessions in the final week' }, null, ctrl); h('span', null, '', ctrl);
    [[0, 'None'], [2, '2 in the final week'], [3, '3 in the final week']].forEach(function (x) { h('option', { value: x[0] }, x[1], s3); }); s3.value = p.top;
    var stats = h('div', { class: 'stats' }, null, Rt), v1 = h('div', { class: 'stat' }, '<div class="k">Race-day adaptation</div><div class="v">–</div>', stats).querySelector('.v'), v2 = h('div', { class: 'stat' }, '<div class="k">Heat sessions</div><div class="v">–</div>', stats).querySelector('.v');
    var fb = h('div', { class: 'note' }, '', Rt);
    h('div', { class: 'note warn' }, '<b>How the model works.</b> Heart rate and plasma volume adapt in days; sweating takes longer. Without heat, adaptation fades by about 2.5–3.5% a day, so a 5-day block lasts about a week but not two (Garrett et al., 2009). Re-acclimation is faster than first-time acclimation. A session can be exercise in the heat or a post-exercise hot bath (Zurawlew et al., 2016).', Rt);
    function upd() {
      p.start = +r1.value; p.len = +s2.value; p.top = +s3.value; if (p.len > p.start - 1) { p.len = [14, 10, 7, 5].filter(function (x) { return x <= p.start - 1; })[0] || 5; s2.value = p.len; }
      S.m5.p = p; o1.textContent = p.start + ' d out';
      var r = plan(p); s.innerHTML = '';
      var x0 = 46, w = 500, y0 = 14, hh = 230, X = function (d) { return x0 + (d + 35) / 35 * w; }, Y = function (a) { return y0 + hh - a * hh; };
      for (var d = -35; d <= 0; d++) if (r.heat[d]) sv('rect', { x: X(d) - w / 70, y: y0, width: w / 35, height: hh, fill: '#fde3da' }, s);
      [0, .2, .4, .6, .8, 1].forEach(function (a) { sv('line', { x1: x0, x2: x0 + w, y1: Y(a), y2: Y(a), stroke: a === .8 ? '#2e9e5b' : '#d2dfe2', 'stroke-dasharray': a === .8 ? '6 4' : null, 'stroke-width': a === .8 ? 2 : 1 }, s); st(s, x0 - 6, Y(a) + 4, Math.round(a * 100) + '%', { 'text-anchor': 'end', 'font-size': 12, fill: '#4f626b' }); });
      [-35, -28, -21, -14, -7, 0].forEach(function (dd) { st(s, X(dd), y0 + hh + 18, dd === 0 ? 'Race' : dd, { 'text-anchor': 'middle', 'font-size': 12, 'font-weight': dd === 0 ? 800 : 400, fill: '#4f626b' }); });
      st(s, x0 + w / 2, y0 + hh + 38, 'Days before the race · shaded = heat session', { 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700 });
      r.curves.forEach(function (cv, i) { sv('path', { d: cv.map(function (a, k) { return (k ? 'L' : 'M') + X(k - 35).toFixed(1) + ',' + Y(a).toFixed(1); }).join(''), fill: 'none', stroke: VARS[i][2], 'stroke-width': 3 }, s); });
      var lx = [46, 290, 440]; VARS.forEach(function (v, i) { sv('rect', { x: lx[i], y: 302, width: 16, height: 6, rx: 3, fill: v[2] }, s); st(s, lx[i] + 22, 310, v[0], { 'font-size': 13, 'font-weight': 700, fill: v[2] }); });
      var pct = Math.round(r.ready * 100), late = r.blockEnd >= -3, n = Object.keys(r.heat).length;
      v1.textContent = pct + '%'; v1.style.color = pct >= 80 ? '#2e9e5b' : '#d8452a'; v2.textContent = n;
      var ok = pct >= 80 && !late; if (ok) S.m5.ok = true; S.m5.best = { pct: pct, start: p.start, len: p.len, top: p.top };
      fb.className = 'note ' + (ok ? 'good' : late ? 'bad' : 'warn');
      fb.innerHTML = late ? '<b>Too close to the race.</b> Your main block finishes ' + (-r.blockEnd) + ' day(s) out. Daily heat sessions add fatigue: finish the block earlier and use top-ups instead.'
        : ok ? '<b>Race ready: ' + pct + '%.</b> ' + (p.top ? 'Top-ups rebuilt what had decayed. ' : '') + 'Can you reach 80% with fewer heat sessions? Fewer sessions means less fatigue and cost.'
        : '<b>Only ' + pct + '% on race day.</b> ' + (p.start - p.len > 10 ? 'The block ended too early and the adaptations decayed.' : p.len <= 5 ? 'A short block only gives partial adaptation, especially for sweating.' : 'Try top-up sessions or a longer block.');
      save();
    }
    [r1, s2, s3].forEach(function (e) { e.addEventListener('input', upd); }); upd();
    S.m5.q = S.m5.q || {};
    var q = [
      mcq(root, 'Which adaptations appear first during heat acclimation?', ['A higher sweat rate', 'Expanded plasma volume and a lower heart rate', 'Less sodium in sweat'], 1, 'Cardiovascular changes come within about 3–6 days. Sweating changes take longer.', S.m5.q, 'a'),
      mcq(root, 'An athlete finishes a 5-day heat block 16 days before racing and does nothing else. What do you expect?', ['Fully adapted on race day', 'Most of the benefit has gone', 'Better adapted than straight after the block'], 1, 'Short-term adaptations persist for about a week but not two (Garrett et al., 2009).', S.m5.q, 'b'),
      mcq(root, 'Zurawlew et al. (2016): six days of hot baths after normal training improved 5 km time-trial performance in 33 °C by about…', ['0.5%', '5%', '25%'], 1, '4.9%. A cheap, practical method when a heat chamber or a hot-weather camp is not possible.', S.m5.q, 'c')
    ];
    finish(root, 'm5', function () { return S.m5.ok && q.every(function (f) { return f(); }); }, 'Reach 80% without a late block, and answer the three questions');
  }

  /* ================= Mission 6: your sport ================= */
  function m6(root) {
    h('h2', null, 'Mission 6 · Brief your own sport', root);
    h('p', { class: 'lede' }, 'Apply everything to a sport you know. How would performance change at 5 °C, 20 °C and 35 °C, and why? Name the mechanisms. Then copy your summary into the Canvas discussion.', root);
    var F = [['sport', 'Your sport and event', 'For example: 10 km road race, 90-minute football match'], ['c5', 'At 5 °C', 'What changes? Think muscle temperature, power, energy cost, clothing.'], ['c20', 'At 20 °C', 'What changes? Is this ideal for your event? Why or why not?'], ['c35', 'At 35 °C', 'What changes? Think heat balance, cardiovascular drift, central fatigue, fuel use, illness risk.'], ['plan', 'Your two best strategies for the 35 °C event', 'For example: acclimation plan, cooling, pacing, hydration, monitoring.']];
    var card = h('div', { class: 'card' }, null, root);
    F.forEach(function (f) {
      h('label', { for: 'f_' + f[0], style: 'font-weight:700;display:block;margin:10px 0 4px' }, f[1], card);
      var e = h(f[0] === 'sport' ? 'input' : 'textarea', { id: 'f_' + f[0], placeholder: f[2] }, null, card); if (f[0] === 'sport') { e.type = 'text'; e.style.cssText = 'font:600 15px Open Sans,Arial;padding:7px 9px;border:2px solid #b9cbd0;border-radius:8px;width:100%'; }
      e.value = S.m6[f[0]] || ''; e.addEventListener('input', function () { S.m6[f[0]] = e.value; save(); build(); });
    });
    h('h3', null, 'Your summary', root);
    var sum = h('div', { class: 'sum', tabindex: 0 }, '', root), row = h('div', { class: 'done-bar' }, null, root);
    var copy = h('button', { class: 'btn', type: 'button' }, 'Copy summary', row), msg = h('span', { class: 'pill' }, '', row);
    function build() {
      var n = MISSIONS.filter(function (m) { return S.done[m.id]; }).length, b = S.m5.best, pr = S.m2.pred;
      sum.textContent = 'SESH54 Thermal Lab summary\nMissions complete: ' + n + ' of 6\n' +
        (pr && S.m2.revealed ? 'My time-to-exhaustion predictions (4, 11, 21, 31 °C): ' + pr.join(', ') + ' min. Measured: 81, 94, 81, 52 min.\n' : '') +
        (b ? 'My acclimation plan: ' + b.len + '-day block starting ' + b.start + ' days out, ' + b.top + ' top-up sessions. Race-day adaptation: ' + b.pct + '%.\n' : '') +
        '\nSport: ' + (S.m6.sport || '') + '\n\nAt 5 °C: ' + (S.m6.c5 || '') + '\n\nAt 20 °C: ' + (S.m6.c20 || '') + '\n\nAt 35 °C: ' + (S.m6.c35 || '') + '\n\nMy strategies for 35 °C: ' + (S.m6.plan || '');
    }
    build();
    copy.addEventListener('click', function () {
      var t = sum.textContent;
      function fallback() { var r = document.createRange(); r.selectNodeContents(sum); var s = getSelection(); s.removeAllRanges(); s.addRange(r); msg.textContent = 'Selected: press Ctrl/Cmd + C'; }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { msg.textContent = 'Copied'; msg.className = 'pill ok'; }, fallback); else fallback();
    });
    finish(root, 'm6', function () { return ['sport', 'c5', 'c20', 'c35', 'plan'].every(function (k) { return (S.m6[k] || '').trim().length >= (k === 'sport' ? 3 : 40); }); }, 'Write at least a sentence or two in each box first');
    var reset = h('button', { class: 'btn ghost', type: 'button', style: 'margin-top:26px' }, 'Reset all my progress', root);
    reset.addEventListener('click', function () { if (confirm('Clear all your answers and progress in this browser?')) { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } location.reload(); } });
  }

  progress();
  var first = MISSIONS.map(function (m) { return !!S.done[m.id]; }).indexOf(false);
  show(first < 0 ? 5 : first);
})();
