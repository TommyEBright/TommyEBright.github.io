/* Shared helpers for the AEL deck widgets. Each widget is attached with data-widget="name"
   and initialised by deck.js the first time its slide is shown. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var C = {
    pcr: '#7b55b8', gly: '#c43c6b', aer: '#1f8fc4', cho: '#5e9e2f', fat: '#e08a2a', pro: '#9c7b4f',
    teal: '#0f8b8d', tealD: '#0a6a6c', navy: '#0b3a4c', amber: '#f2a900', red: '#d64545', green: '#2e9e5b',
    ink: '#1d2b33', muted: '#4f626b', faint: '#7a8a91', line: '#d2dfe2', panel: '#f2f7f8', panel2: '#e5eef0', white: '#ffffff',
    oxy: '#d23c3c', deoxy: '#3d6fd1', h: '#e0457b', e: '#f2a900'
  };

  function sv(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, x, y, s, attrs) {
    var a = { x: x, y: y, 'font-size': 20 };
    for (var k in attrs || {}) a[k] = attrs[k];
    var t = sv('text', a, parent);
    t.textContent = s;
    return t;
  }
  function hx(tag, cls, html, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  function btn(label, parent, cls) {
    var b = hx('button', 'btn' + (cls ? ' ' + cls : ''), label, parent);
    b.type = 'button';
    return b;
  }
  function svgRoot(parent, w, h, label) {
    return sv('svg', { viewBox: '0 0 ' + w + ' ' + h, width: w, height: h, role: 'img', 'aria-label': label || '' }, parent);
  }
  function clear(g) { while (g.firstChild) g.removeChild(g.firstChild); }
  function lin(d0, d1, r0, r1) { return function (v) { return r0 + (v - d0) * (r1 - r0) / (d1 - d0); }; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function fx(v, dp) { return (Math.round(v * Math.pow(10, dp)) / Math.pow(10, dp)).toFixed(dp); }
  function pt(svg, e) { var p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); }
  function readout(parent, k, colour) {
    var r = hx('div', 'readout', '<div class="k">' + k + '</div><div class="v">–</div>', parent);
    if (colour) r.querySelector('.v').style.color = colour;
    return r.querySelector('.v');
  }
  function slider(parent, label, min, max, step, value, width) {
    var wrap = hx('label', null, '<span class="ctrl-label">' + label + '</span>', parent);
    wrap.style.cssText = 'display:flex;align-items:center;gap:10px';
    var r = hx('input', null, null, wrap);
    r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = value;
    if (width) r.style.width = width + 'px';
    return r;
  }
  function isCur(el) { var s = el.closest('.slide'); return !!s && (s.classList.contains('current') || document.body.classList.contains('handout')); }
  // pill-shaped label in SVG
  function pill(g, x, y, label, fill, opts) {
    opts = opts || {};
    var fs = opts.fs || 20, w = opts.w || (label.length * fs * 0.56 + 26), h = opts.h || fs + 16;
    var gg = sv('g', { transform: 'translate(' + x + ',' + y + ')' }, g);
    sv('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: opts.rx != null ? opts.rx : h / 2, fill: fill, stroke: opts.stroke || 'none', 'stroke-width': opts.sw || 2 }, gg);
    txt(gg, 0, fs * 0.36, label, { 'text-anchor': 'middle', 'font-size': fs, 'font-weight': opts.fw || 700, fill: opts.color || '#fff' });
    return gg;
  }
  // size (optional) fixes the head size in user units, so thick lines don't get huge heads
  function arrowHead(svg, id, colour, size) {
    var defs = svg.querySelector('defs') || sv('defs', {}, svg);
    var m = sv('marker', size ? { id: id, viewBox: '0 0 10 10', refX: 6, refY: 5, markerWidth: size, markerHeight: size, markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse' }
      : { id: id, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, defs);
    sv('path', { d: 'M0,0 L10,5 L0,10 z', fill: colour }, m);
    return 'url(#' + id + ')';
  }
  var uid = 0;
  function id(p) { return (p || 'w') + (++uid); }

  window.DV = { C: C, sv: sv, txt: txt, hx: hx, btn: btn, svgRoot: svgRoot, clear: clear, lin: lin, clamp: clamp, fx: fx, pt: pt, readout: readout, slider: slider, isCur: isCur, pill: pill, arrowHead: arrowHead, id: id };
  window.DeckWidgets = window.DeckWidgets || {};
  var W = window.DeckWidgets;

  /* ---------- countdown timer ---------- */
  W.timer = function (el) {
    var secs = +(el.dataset.seconds || 240), left = secs, t = null;
    var box = hx('div', 'timer', null, el);
    var disp = hx('span', 't', '', box);
    var go = btn('Start', box, 'sm'), rs = btn('Reset', box, 'ghost sm');
    function show() { disp.textContent = Math.floor(left / 60) + ':' + ('0' + left % 60).slice(-2); box.classList.toggle('done', left === 0); }
    function stop() { clearInterval(t); t = null; go.textContent = 'Start'; }
    go.addEventListener('click', function () {
      if (t) { stop(); return; }
      if (left === 0) left = secs;
      go.textContent = 'Pause';
      t = setInterval(function () { left = Math.max(0, left - 1); show(); if (left === 0) stop(); }, 1000);
    });
    rs.addEventListener('click', function () { stop(); left = secs; show(); });
    show();
  };

  /* ---------- multiple-choice knowledge check ---------- */
  W.quiz = function (el) {
    var spec = JSON.parse(el.querySelector('script[type="application/json"]').textContent);
    var grid = hx('div', 'quiz' + (el.dataset.cols === '3' ? ' three' : ''), null, el);
    spec.forEach(function (it, qi) {
      var card = hx('div', 'qcard', null, grid);
      hx('div', 'q', '<span class="qnum">' + (qi + 1) + '.</span>' + it.q, card);
      var opts = hx('div', 'opts', null, card);
      var why = hx('div', 'why', '', card); why.style.display = 'none';
      var bs = it.options.map(function (o, oi) {
        var b = btn(o, opts);
        b.addEventListener('click', function () {
          bs.forEach(function (bb, k) { bb.disabled = true; if (k === it.answer) bb.classList.add('right'); });
          var ok = oi === it.answer; if (!ok) b.classList.add('wrong');
          why.className = 'why' + (ok ? '' : ' no'); why.innerHTML = '<b>' + (ok ? 'Yes. ' : 'Not quite. ') + '</b>' + it.why; why.style.display = '';
        });
        return b;
      });
      card._reset = function () { bs.forEach(function (bb) { bb.disabled = false; bb.classList.remove('right', 'wrong'); }); why.style.display = 'none'; };
    });
    var r = btn('Reset answers', el, 'ghost sm'); r.style.marginTop = '10px';
    r.addEventListener('click', function () { grid.querySelectorAll('.qcard').forEach(function (c) { c._reset(); }); });
  };
})();
