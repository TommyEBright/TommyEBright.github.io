/* SESD55 deck widgets. Each widget is attached with data-widget="name" and initialised the first time its slide is shown. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var C = { cyan: '#38c8f0', teal: '#00c8d8', blue: '#5898d8', green: '#70c084', pink: '#ec5878', yellow: '#f0c85a', purple: '#c06ad8', ink: '#ffffff', axis: '#8d979d', text: '#d7dee3', dim: '#6b7c9c', panel: '#232628' };
  var D = window.DeckData || {};

  /* ---------- helpers ---------- */
  function sv(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
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
    var s = sv('svg', { viewBox: '0 0 ' + w + ' ' + h, width: '100%', role: 'img', 'aria-label': label || '' }, parent);
    return s;
  }
  function clear(g) { while (g.firstChild) g.removeChild(g.firstChild); }
  var St = {
    mean: function (a) { return a.reduce(function (s, v) { return s + v; }, 0) / a.length; },
    median: function (a) { var b = a.slice().sort(function (x, y) { return x - y; }), n = b.length; return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2; },
    sd: function (a) { var m = St.mean(a); return Math.sqrt(a.reduce(function (s, v) { return s + (v - m) * (v - m); }, 0) / (a.length - 1)); },
    q: function (a, p) { var b = a.slice().sort(function (x, y) { return x - y; }), h = (b.length - 1) * p, lo = Math.floor(h), hi = Math.min(lo + 1, b.length - 1); return b[lo] + (h - lo) * (b[hi] - b[lo]); },
    min: function (a) { return Math.min.apply(null, a); },
    max: function (a) { return Math.max.apply(null, a); }
  };
  function fx(v, dp) { var s = (Math.round(v * Math.pow(10, dp)) / Math.pow(10, dp)).toFixed(dp); return s === '-0' || /^-0\.0+$/.test(s) ? s.slice(1) : s.replace('-', '−'); }
  function lin(d0, d1, r0, r1) { return function (v) { return r0 + (v - d0) * (r1 - r0) / (d1 - d0); }; }
  function pt(svg, e) { var p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); }
  function erf(x) { var s = x < 0 ? -1 : 1; x = Math.abs(x); var t = 1 / (1 + 0.3275911 * x); var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; }
  function Phi(x) { return 0.5 * (1 + erf(x / Math.SQRT2)); }
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function gauss(r) { var u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  function xAxis(g, x, lo, hi, step, y, label, dp) {
    sv('line', { x1: x(lo), x2: x(hi), y1: y, y2: y, stroke: C.axis, 'stroke-width': 2 }, g);
    for (var v = lo; v <= hi + 1e-9; v += step) {
      sv('line', { x1: x(v), x2: x(v), y1: y, y2: y + 8, stroke: C.axis, 'stroke-width': 2 }, g);
      var t = sv('text', { x: x(v), y: y + 32, 'text-anchor': 'middle', 'font-size': 20 }, g); t.textContent = fx(v, dp || 0);
    }
    if (label) { var tl = sv('text', { x: (x(lo) + x(hi)) / 2, y: y + 64, 'text-anchor': 'middle', 'font-size': 21, 'font-weight': 700, fill: C.text }, g); tl.textContent = label; }
  }
  // greedy stacking so dots never overlap: returns a level (0 = on the baseline) for each value
  function stackLevels(xs, r) {
    var order = xs.map(function (x, i) { return i; }).sort(function (a, b) { return xs[a] - xs[b]; });
    var last = [], lv = new Array(xs.length);
    order.forEach(function (i) { var L = 0; while (last[L] !== undefined && xs[i] - last[L] < 2 * r + 1) L++; lv[i] = L; last[L] = xs[i]; });
    return lv;
  }
  function vline(g, x, y1, y2, colour, label, dash, labelY, anchor) {
    sv('line', { x1: x, x2: x, y1: y1, y2: y2, stroke: colour, 'stroke-width': 4, 'stroke-dasharray': dash || null }, g);
    if (label) {
      var lx = anchor === 'end' ? x - 9 : anchor === 'start' ? x + 9 : x;
      var t = sv('text', { x: lx, y: labelY != null ? labelY : y1 - 10, 'text-anchor': anchor || 'middle', 'font-size': 20, 'font-weight': 700, fill: colour }, g); t.textContent = label;
    }
  }
  function readout(parent, k, colour) {
    var r = hx('div', 'readout', '<div class="k">' + k + '</div><div class="v">–</div>', parent);
    if (colour) r.querySelector('.v').style.color = colour;
    return r.querySelector('.v');
  }

  var W = {};

  /* ---------- vote tally (opening problem) ---------- */
  W.vote = function (el) {
    var opts = (el.dataset.options || 'A|B').split('|');
    var counts = opts.map(function () { return 0; });
    var box = hx('div', 'vote', null, el);
    hx('div', 'small', 'Tap a button for each hand that goes up.', box);
    var rows = opts.map(function (o, i) {
      var b = btn('', box, 'vbtn');
      b.innerHTML = '<span>' + o + '</span><span class="bar"></span><span class="count">0</span>';
      b.addEventListener('click', function () { counts[i]++; draw(); });
      return b;
    });
    var reset = btn('Reset votes', box, 'ghost sm'); reset.style.alignSelf = 'flex-start';
    reset.addEventListener('click', function () { counts = counts.map(function () { return 0; }); draw(); });
    function draw() {
      var mx = Math.max.apply(null, counts.concat([1]));
      rows.forEach(function (b, i) { b.querySelector('.bar').style.width = (counts[i] / mx * 100) + '%'; b.querySelector('.count').textContent = counts[i]; });
    }
  };

  /* ---------- knowledge check 1: sort the variables ---------- */
  W.sorter = function (el) {
    var bins = [
      { id: 'cont', name: 'Continuous', hint: 'numbers: any value in a range' },
      { id: 'disc', name: 'Discrete', hint: 'numbers: whole counts' },
      { id: 'nom', name: 'Nominal', hint: 'categories: no order' },
      { id: 'ord', name: 'Ordinal', hint: 'categories: ordered' }
    ];
    var items = [
      ['Jump height (cm)', 'cont', 'Can take any value (40.3 cm, 40.35 cm…), limited only by the precision of the jump mat or force plate.'],
      ['20 m sprint time (s)', 'cont', 'Time is continuous: 3.152 s is just as possible as 3.15 s.'],
      ['Peak force (N)', 'cont', 'Measured on a continuous scale by a force plate.'],
      ['Heart rate (bpm)', 'cont', 'Strictly a count of beats, but measured finely and treated as continuous in practice.'],
      ['Free throws scored (out of 10)', 'disc', 'A count: you can score 7 or 8, never 7.5.'],
      ['Repetitions completed', 'disc', 'Whole-number counts.'],
      ['Playing position', 'nom', 'Categories with no natural order (goalkeeper is not "more" than winger).'],
      ['Training group (plyometric / control)', 'nom', 'Group labels with no order. Often the independent variable.'],
      ['Competition level (club → international)', 'ord', 'Ordered categories, but the gaps between levels are not equal.'],
      ['RPE (Borg 6–20)', 'ord', 'Ordered ratings. Often analysed as numbers, but the steps are not guaranteed to be equal.']
    ];
    var place = {}, selected = null;
    hx('p', 'small', 'Click a variable, then click the box it belongs in. Click <b>Check</b> when you have placed them all.', el).style.margin = '0 0 10px';
    var pool = hx('div', 'chips', null, el);
    pool.style.marginBottom = '14px';
    var binWrap = hx('div', 'bins', null, el);
    var binEls = {};
    bins.forEach(function (b) {
      var d = hx('div', 'bin', '<h3>' + b.name + '</h3><div class="hint">' + b.hint + '</div>', binWrap);
      d.tabIndex = 0; d.setAttribute('role', 'button'); d.setAttribute('aria-label', 'Place selected variable in ' + b.name);
      d.addEventListener('click', function (e) { if (e.target.classList.contains('chip')) return; drop(b.id); });
      d.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); drop(b.id); } });
      binEls[b.id] = d;
    });
    var chips = items.map(function (it, i) {
      var c = hx('button', 'chip', it[0]); c.type = 'button';
      c.addEventListener('click', function (e) { e.stopPropagation(); select(i); });
      return c;
    });
    var bar = hx('div', 'row', null, el); bar.style.cssText = 'margin-top:12px;align-items:center;gap:10px';
    var check = btn('Check', bar), answers = btn('Show answers', bar, 'ghost'), reset = btn('Reset', bar, 'ghost');
    var fb = hx('div', 'small', '', bar); fb.style.marginLeft = '8px';
    function render() {
      chips.forEach(function (c, i) { c.classList.remove('ok', 'bad'); c.removeAttribute('title'); (place[i] ? binEls[place[i]] : pool).appendChild(c); c.classList.toggle('sel', selected === i); });
      fb.textContent = Object.keys(place).length + ' of ' + items.length + ' placed';
    }
    function select(i) { selected = selected === i ? null : i; render(); }
    function drop(bin) { if (selected === null) return; place[selected] = bin; selected = null; render(); }
    function mark(showAll) {
      var right = 0;
      chips.forEach(function (c, i) {
        if (showAll) { place[i] = items[i][1]; }
      });
      render();
      chips.forEach(function (c, i) {
        if (!place[i]) return;
        var ok = place[i] === items[i][1]; if (ok) right++;
        c.classList.add(ok ? 'ok' : 'bad'); c.title = items[i][2];
      });
      var placed = Object.keys(place).length;
      fb.innerHTML = showAll ? 'Hover over (or tap) a variable to see why.' : '<b>' + right + ' of ' + placed + '</b> placed correctly' + (placed < items.length ? ' (' + (items.length - placed) + ' still to place)' : '') + '. Hover over a variable for the reason.';
    }
    check.addEventListener('click', function () { mark(false); });
    answers.addEventListener('click', function () { mark(true); });
    reset.addEventListener('click', function () { place = {}; selected = null; render(); });
    render();
  };

  /* ---------- number line (mean as balance point; mean vs median) ---------- */
  W.numline = function (el) {
    var vals = el.dataset.values.split(',').map(Number);
    var lo = +el.dataset.min, hi = +el.dataset.max, step = +(el.dataset.step || 2), mode = el.dataset.mode || 'balance';
    var w = +(el.dataset.w || 620), h = 250;
    var svg = svgRoot(el, w, h, el.dataset.label || 'Number line of the values');
    var x = lin(lo, hi, 30, w - 30), base = 150, r = 15;
    var m = St.mean(vals), md = St.median(vals);
    if (mode === 'balance') {
      sv('rect', { x: x(lo) - 10, y: base, width: x(hi) - x(lo) + 20, height: 8, rx: 4, fill: '#c9d1d6' }, svg);
      sv('path', { d: 'M' + x(m) + ' ' + (base + 8) + ' l-26 46 h52 z', fill: C.cyan }, svg);
      var t = sv('text', { x: x(m), y: base + 82, 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 700, fill: C.cyan }, svg); t.textContent = 'mean = ' + fx(m, 0) + ' cm: the balance point';
    } else {
      xAxis(svg, x, lo, hi, step, base + 20, el.dataset.axis || '', 0);
    }
    var lv = stackLevels(vals.map(x), r);
    vals.forEach(function (v, i) {
      var cy = base - r - lv[i] * (2 * r + 2);
      sv('circle', { cx: x(v), cy: cy, r: r, fill: v === St.max(vals) && el.dataset.flag ? C.pink : C.yellow, stroke: '#191919', 'stroke-width': 2 }, svg);
      var tt = sv('text', { x: x(v), y: cy - r - 8, 'text-anchor': 'middle', 'font-size': 19, 'font-weight': 700 }, svg); tt.textContent = v;
    });
    if (mode === 'meanmedian') {
      vline(svg, x(md), 40, base + 20, C.green, 'median ' + fx(md, 0), null, 30, 'end');
      vline(svg, x(m), 40, base + 20, C.ink, 'mean ' + fx(m, 0), '8 6', 30, 'start');
    }
  };

  /* ---------- drag the outlier: mean vs median ---------- */
  W.outlier = function (el) {
    var base = (D.sprint || [3.02, 3.08, 3.1, 3.12, 3.15, 3.18, 3.2, 3.24, 3.3]).slice();
    var vals = base.slice(), lo = 2.9, hi = 4.4, w = 1300, h = 290;
    var drag = vals.indexOf(St.max(vals));
    var svg = svgRoot(el, w, h, '20 m sprint times for nine players on a number line; the slowest time can be dragged');
    var x = lin(lo, hi, 40, w - 40), y0 = 190, r = 16;
    var gAxis = sv('g', {}, svg), gLines = sv('g', {}, svg), gDots = sv('g', {}, svg);
    xAxis(gAxis, x, lo, hi, 0.1, y0 + 4, '20 m sprint time (s): faster ←   → slower', 1);
    var ro = hx('div', 'readouts', null, el); ro.style.marginTop = '6px';
    var vMean = readout(ro, 'Mean', C.ink), vMed = readout(ro, 'Median', C.green), vDiff = readout(ro, 'Mean − median', C.yellow), vMax = readout(ro, 'Dragged time', C.pink);
    var ctr = hx('div', 'btngroup', null, ro); ctr.style.alignSelf = 'center';
    var slip = btn('Slip at the start (4.10 s)', ctr), reset = btn('Reset', ctr, 'ghost');
    function draw() {
      clear(gLines); clear(gDots);
      var m = St.mean(vals), md = St.median(vals);
      vline(gLines, x(md), 40, y0, C.green, 'median ' + fx(md, 2) + ' s', null, 32, 'end');
      vline(gLines, x(m), 40, y0, C.ink, 'mean ' + fx(m, 2) + ' s', '10 7', 32, 'start');
      var lv = stackLevels(vals.map(x), r);
      vals.forEach(function (v, i) {
        var c = sv('circle', { cx: x(v), cy: y0 - r - lv[i] * (2 * r + 2), r: r, fill: i === drag ? C.pink : C.cyan, stroke: '#191919', 'stroke-width': 2 }, gDots);
        if (i === drag) { c.setAttribute('class', 'draggable'); c.setAttribute('tabindex', '0'); c.setAttribute('aria-label', 'Slowest time ' + fx(v, 2) + ' seconds; use arrow keys to change'); hook(c); }
      });
      vMean.textContent = fx(m, 2) + ' s'; vMed.textContent = fx(md, 2) + ' s'; vDiff.textContent = fx(m - md, 2) + ' s'; vMax.textContent = fx(vals[drag], 2) + ' s';
    }
    var dragging = false;
    function hook(c) {
      c.addEventListener('pointerdown', function (e) { dragging = true; svg.setPointerCapture && svg.setPointerCapture(e.pointerId); e.preventDefault(); });
      c.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); vals[drag] = Math.max(lo, Math.min(hi, +(vals[drag] + (e.key === 'ArrowRight' ? 0.05 : -0.05)).toFixed(2))); draw(); svg.querySelector('.draggable').focus(); }
      });
    }
    svg.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var p = pt(svg, e), v = lo + (p.x - 40) / (w - 80) * (hi - lo);
      vals[drag] = Math.max(lo, Math.min(hi, Math.round(v * 100) / 100)); draw();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) { svg.addEventListener(t, function () { dragging = false; }); });
    slip.addEventListener('click', function () { vals[drag] = 4.10; draw(); });
    reset.addEventListener('click', function () { vals = base.slice(); draw(); });
    draw();
  };

  /* ---------- build the spread: SD between vs within ---------- */
  W.sdbuilder = function (el) {
    var sets = {
      between: { vals: (D.between || []).slice(), label: '10 athletes, one jump each', note: 'Between-athlete spread: mostly real differences between people (training history, strength, technique) plus a little measurement noise.' },
      within: { vals: (D.within || []).slice(), label: 'One athlete, 10 jumps', note: 'Within-athlete spread: the same person varies from jump to jump (technique, fatigue, the measuring device). This is the idea behind reliability and typical error (Hopkins, 2000).' }
    };
    var mode = 'between', vals = sets.between.vals.slice(), lo = 28, hi = 52, w = 1300, h = 270;
    var top = hx('div', 'row', null, el); top.style.cssText = 'align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap';
    hx('span', 'ctrl-label', 'Data:', top);
    var bB = btn(sets.between.label, top), bW = btn(sets.within.label, top);
    hx('span', 'ctrl-label', '  Try:', top);
    var sq = btn('Squeeze', top, 'ghost'), sp = btn('Spread', top, 'ghost'), rs = btn('Reset', top, 'ghost');
    var svg = svgRoot(el, w, h, 'Dot plot of countermovement jump heights with the mean and a band of one standard deviation either side');
    var x = lin(lo, hi, 40, w - 40), y0 = 170, r = 16;
    var gBand = sv('g', {}, svg), gAxis = sv('g', {}, svg), gDots = sv('g', {}, svg);
    xAxis(gAxis, x, lo, hi, 2, y0 + 4, 'CMJ height (cm)', 0);
    var ro = hx('div', 'readouts', null, el);
    var vM = readout(ro, 'Mean', C.ink), vS = readout(ro, 'SD', C.cyan), vR = readout(ro, 'Range', C.yellow);
    var note = hx('div', 'small', '', ro); note.style.cssText = 'flex:1;min-width:380px;align-self:center';
    var dragI = -1;
    function draw() {
      clear(gBand); clear(gDots);
      var m = St.mean(vals), s = St.sd(vals);
      sv('rect', { x: x(Math.max(lo, m - s)), y: 30, width: x(Math.min(hi, m + s)) - x(Math.max(lo, m - s)), height: y0 - 30, fill: C.cyan, opacity: 0.16 }, gBand);
      vline(gBand, x(m), 30, y0, C.ink, null, '10 7');
      var t1 = sv('text', { x: x(m), y: 22, 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 700, fill: C.cyan }, gBand); t1.textContent = 'mean ± 1 SD';
      var lv = stackLevels(vals.map(x), r);
      vals.forEach(function (v, i) {
        var c = sv('circle', { cx: x(v), cy: y0 - r - lv[i] * (2 * r + 2), r: r, fill: C.yellow, stroke: '#191919', 'stroke-width': 2, class: 'draggable', tabindex: 0, 'aria-label': 'Jump ' + (i + 1) + ': ' + fx(v, 1) + ' cm' }, gDots);
        c.addEventListener('pointerdown', function (e) { dragI = i; e.preventDefault(); });
        c.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); vals[i] = Math.max(lo, Math.min(hi, vals[i] + (e.key === 'ArrowRight' ? 0.5 : -0.5))); draw(); } });
      });
      vM.textContent = fx(m, 1) + ' cm'; vS.textContent = fx(s, 1) + ' cm'; vR.textContent = fx(St.max(vals) - St.min(vals), 1) + ' cm';
      note.textContent = sets[mode].note;
      bB.setAttribute('aria-pressed', mode === 'between'); bW.setAttribute('aria-pressed', mode === 'within');
    }
    svg.addEventListener('pointermove', function (e) { if (dragI < 0) return; var p = pt(svg, e); vals[dragI] = Math.max(lo, Math.min(hi, Math.round((lo + (p.x - 40) / (w - 80) * (hi - lo)) * 10) / 10)); draw(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) { svg.addEventListener(t, function () { dragI = -1; }); });
    function scaleBy(k) { var m = St.mean(vals); vals = vals.map(function (v) { return Math.max(lo, Math.min(hi, Math.round((m + (v - m) * k) * 10) / 10)); }); draw(); }
    sq.addEventListener('click', function () { scaleBy(0.6); });
    sp.addEventListener('click', function () { scaleBy(1.5); });
    rs.addEventListener('click', function () { vals = sets[mode].vals.slice(); draw(); });
    bB.addEventListener('click', function () { mode = 'between'; vals = sets.between.vals.slice(); draw(); });
    bW.addEventListener('click', function () { mode = 'within'; vals = sets.within.vals.slice(); draw(); });
    draw();
  };

  /* ---------- shared plot drawers (dot plot, histogram, box plot) ---------- */
  var META = {
    cmj40: { data: function () { return D.cmj40; }, label: 'CMJ height (cm), 40 university athletes', unit: 'cm', lo: 26, hi: 50, step: 2, bin: 2, dp: 1, note: 'Roughly symmetrical: the mean and median are close together.' },
    hours: { data: function () { return D.hours; }, label: 'Weekly training (h), 40 recreational runners', unit: 'h', lo: 0, hi: 16, step: 1, bin: 1, dp: 1, note: 'Right-skewed: a few runners train a lot, pulling the mean above the median.' },
    rugby: { data: function () { return D.rugby; }, label: 'Body mass (kg), rugby squad of 40', unit: 'kg', lo: 70, hi: 126, step: 5, bin: 4, dp: 1, note: 'Two clusters (forwards and backs). The box plot cannot show this; the dot plot and histogram can.' }
  };
  function boxStats(a) {
    var q1 = St.q(a, 0.25), q3 = St.q(a, 0.75), iqr = q3 - q1, lf = q1 - 1.5 * iqr, uf = q3 + 1.5 * iqr;
    var inside = a.filter(function (v) { return v >= lf && v <= uf; });
    return { q1: q1, q3: q3, med: St.median(a), iqr: iqr, lw: St.min(inside), uw: St.max(inside), lf: lf, uf: uf, out: a.filter(function (v) { return v < lf || v > uf; }) };
  }
  function drawDot(g, a, x, y0, r, colour) {
    var lv = stackLevels(a.map(x), r);
    a.forEach(function (v, i) { sv('circle', { cx: x(v), cy: y0 - r - lv[i] * (2 * r + 1), r: r, fill: colour || C.yellow, stroke: '#191919', 'stroke-width': 1.5 }, g); });
  }
  function drawHist(g, a, x, lo, hi, bw, y0, hmax, axisX) {
    var start = Math.floor(lo / bw) * bw, bins = [];
    for (var b = start; b < hi; b += bw) bins.push({ a: b, b: b + bw, n: 0 });
    a.forEach(function (v) { var k = Math.min(bins.length - 1, Math.floor((v - start) / bw)); if (k >= 0) bins[k].n++; });
    var mx = Math.max.apply(null, bins.map(function (q) { return q.n; }).concat([1]));
    var yk = hmax / mx;
    var gy = sv('g', {}, g);
    var stepY = mx > 12 ? 4 : mx > 6 ? 2 : 1;
    for (var c = 0; c <= mx; c += stepY) {
      sv('line', { x1: axisX, x2: x(hi), y1: y0 - c * yk, y2: y0 - c * yk, stroke: '#2f3438', 'stroke-width': 1 }, gy);
      var t = sv('text', { x: axisX - 10, y: y0 - c * yk + 7, 'text-anchor': 'end', 'font-size': 18 }, gy); t.textContent = c;
    }
    var tl = sv('text', { x: axisX - 46, y: y0 - hmax / 2, 'text-anchor': 'middle', 'font-size': 18, transform: 'rotate(-90 ' + (axisX - 46) + ' ' + (y0 - hmax / 2) + ')' }, gy); tl.textContent = 'count';
    bins.forEach(function (q) { if (q.n) sv('rect', { x: x(q.a) + 1, y: y0 - q.n * yk, width: Math.max(1, x(q.b) - x(q.a) - 2), height: q.n * yk, fill: C.cyan, opacity: 0.85 }, g); });
  }
  function drawBox(g, a, x, cy, bh, showOut) {
    var b = boxStats(a);
    sv('line', { x1: x(b.lw), x2: x(b.q1), y1: cy, y2: cy, stroke: C.text, 'stroke-width': 3 }, g);
    sv('line', { x1: x(b.q3), x2: x(b.uw), y1: cy, y2: cy, stroke: C.text, 'stroke-width': 3 }, g);
    [b.lw, b.uw].forEach(function (v) { sv('line', { x1: x(v), x2: x(v), y1: cy - bh / 4, y2: cy + bh / 4, stroke: C.text, 'stroke-width': 3 }, g); });
    sv('rect', { x: x(b.q1), y: cy - bh / 2, width: x(b.q3) - x(b.q1), height: bh, fill: 'rgba(56,200,240,.22)', stroke: C.cyan, 'stroke-width': 3 }, g);
    sv('line', { x1: x(b.med), x2: x(b.med), y1: cy - bh / 2, y2: cy + bh / 2, stroke: C.green, 'stroke-width': 6 }, g);
    if (showOut !== false) b.out.forEach(function (v) { sv('circle', { cx: x(v), cy: cy, r: 9, fill: 'none', stroke: C.pink, 'stroke-width': 3 }, g); });
    return b;
  }

  /* ---------- same data, three graphs ---------- */
  W.plots = function (el) {
    var ds = 'cmj40', kind = 'dot', showMM = true, bw = null;
    var top = hx('div', 'row', null, el); top.style.cssText = 'align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px';
    hx('span', 'ctrl-label', 'Data:', top);
    var dsBtns = {};
    [['cmj40', 'CMJ height'], ['hours', 'Training hours'], ['rugby', 'Rugby body mass']].forEach(function (d) { dsBtns[d[0]] = btn(d[1], top, 'sm'); dsBtns[d[0]].addEventListener('click', function () { ds = d[0]; bw = null; draw(); }); });
    hx('span', 'ctrl-label', '  Graph:', top).style.marginLeft = '10px';
    var kBtns = {};
    [['dot', 'Dot plot'], ['hist', 'Histogram'], ['box', 'Box plot']].forEach(function (d) { kBtns[d[0]] = btn(d[1], top, 'sm'); kBtns[d[0]].addEventListener('click', function () { kind = d[0]; draw(); }); });
    var mmBtn = btn('Mean & median', top, 'sm'); mmBtn.style.marginLeft = '10px';
    mmBtn.addEventListener('click', function () { showMM = !showMM; draw(); });
    var binBox = hx('span', '', null, top); binBox.style.marginLeft = '10px';
    binBox.innerHTML = '<span class="ctrl-label">Bin width</span>';
    var slider = hx('input', '', null, binBox); slider.type = 'range'; slider.style.width = '170px'; slider.setAttribute('aria-label', 'Histogram bin width');
    var binVal = hx('span', 'small', '', binBox); binVal.style.marginLeft = '6px';
    slider.addEventListener('input', function () { bw = +slider.value; draw(); });
    var w = 1300, h = 296;
    var svg = svgRoot(el, w, h, 'Graph of the selected dataset');
    var bottom = hx('div', 'row', null, el); bottom.style.cssText = 'gap:14px;align-items:stretch;margin-top:2px';
    var ro = hx('div', 'readouts', null, bottom);
    var vN = readout(ro, 'n'), vM = readout(ro, 'Mean', C.ink), vMd = readout(ro, 'Median', C.green), vS = readout(ro, 'SD', C.cyan), vI = readout(ro, 'IQR', C.yellow);
    var cap = hx('div', 'card', '', bottom); cap.style.cssText = 'flex:1;padding:8px 16px;font-size:19px;line-height:1.3';
    var CAP = {
      dot: '<b class="hl">Shows:</b> every athlete, clusters, gaps and unusual values. <b class="hl-p">Hides:</b> very little, but it gets crowded with big samples.',
      hist: '<b class="hl">Shows:</b> the overall shape (peaks, skew). <b class="hl-p">Hides:</b> individual athletes, and the picture changes with the bin width (try the slider).',
      box: '<b class="hl">Shows:</b> median, middle 50% (the box), spread and flagged outliers. Great for comparing groups. <b class="hl-p">Hides:</b> the sample size and shapes such as two peaks.'
    };
    function draw() {
      var M = META[ds], a = M.data();
      if (bw === null) bw = M.bin;
      slider.min = M.step / 2; slider.max = M.bin * 3; slider.step = M.step / 2; slider.value = bw;
      binVal.textContent = fx(bw, bw % 1 ? 1 : 0) + ' ' + M.unit;
      binBox.style.display = kind === 'hist' ? '' : 'none';
      Object.keys(dsBtns).forEach(function (k) { dsBtns[k].setAttribute('aria-pressed', k === ds); });
      Object.keys(kBtns).forEach(function (k) { kBtns[k].setAttribute('aria-pressed', k === kind); });
      mmBtn.setAttribute('aria-pressed', showMM);
      clear(svg);
      var x = lin(M.lo, M.hi, 90, w - 40), y0 = 226;
      if (kind === 'dot') drawDot(svg, a, x, y0, a.length > 30 ? 9 : 13);
      else if (kind === 'hist') drawHist(svg, a, x, M.lo, M.hi, bw, y0, 180, 90);
      else drawBox(svg, a, x, 136, 84);
      xAxis(svg, x, M.lo, M.hi, M.step * (M.hi - M.lo > 30 ? 2 : 1), y0 + 2, M.label, 0);
      var m = St.mean(a), md = St.median(a);
      if (showMM) {
        vline(svg, x(md), 20, y0, C.green, 'median ' + fx(md, 1), null, 16, m >= md ? 'end' : 'start');
        vline(svg, x(m), 20, y0, C.ink, 'mean ' + fx(m, 1), '10 7', 16, m >= md ? 'start' : 'end');
      }
      vN.textContent = a.length; vM.textContent = fx(m, 1); vMd.textContent = fx(md, 1); vS.textContent = fx(St.sd(a), 1);
      var b = boxStats(a); vI.textContent = fx(b.q1, 1) + '–' + fx(b.q3, 1);
      cap.innerHTML = CAP[kind] + '<div class="small" style="margin-top:6px">' + M.note + '</div>';
    }
    draw();
  };

  /* ---------- box plot anatomy (training hours) ---------- */
  W.boxanatomy = function (el) {
    var a = D.hours, w = 860, h = 420, lo = 0, hi = 16;
    var svg = svgRoot(el, w, h, 'Annotated box plot of weekly training hours for 40 runners, with the raw data shown as dots underneath');
    var x = lin(lo, hi, 30, w - 30), cy = 175, bh = 90;
    var b = drawBox(svg, a, x, cy, bh);
    // raw data strip
    drawDot(svg, a, x, 330, 7, C.yellow);
    xAxis(svg, x, lo, hi, 2, 336, 'Weekly training (hours)', 0);
    function lab(xv, y, txt, colour, anchor) { var t = sv('text', { x: x(xv), y: y, 'text-anchor': anchor || 'middle', 'font-size': 18, 'font-weight': 700, fill: colour || C.text }, svg); t.textContent = txt; return t; }
    function tick(xv, y1, y2, colour) { sv('line', { x1: x(xv), x2: x(xv), y1: y1, y2: y2, stroke: colour || C.axis, 'stroke-width': 1.5, 'stroke-dasharray': '4 4' }, svg); }
    tick(b.lw, cy - 30, 58); lab(b.lw, 50, 'lowest ' + fx(b.lw, 1), C.text, 'start');
    tick(b.q1, cy - bh / 2, 92); lab(b.q1, 86, 'Q1 ' + fx(b.q1, 1), C.cyan, 'end');
    tick(b.med, cy - bh / 2, 28, C.green); lab(b.med, 20, 'median ' + fx(b.med, 2), C.green);
    tick(b.q3, cy - bh / 2, 92); lab(b.q3, 86, 'Q3 ' + fx(b.q3, 1), C.cyan, 'start');
    tick(b.uw, cy - 30, 58); lab(b.uw, 50, 'whisker ' + fx(b.uw, 1), C.text);
    var outs = b.out.slice().sort(function (p, q) { return p - q; });
    if (outs.length) { lab(outs[outs.length - 1], cy - 30, 'outliers', C.pink, 'end'); }
    // IQR bracket
    var yb = cy + bh / 2 + 18;
    sv('path', { d: 'M' + x(b.q1) + ' ' + (yb - 8) + ' V' + yb + ' H' + x(b.q3) + ' V' + (yb - 8), fill: 'none', stroke: C.yellow, 'stroke-width': 2.5 }, svg);
    lab((b.q1 + b.q3) / 2, yb + 24, 'IQR = ' + fx(b.iqr, 2) + ' h (middle 50%)', C.yellow);
    // mean marker
    var m = St.mean(a);
    sv('path', { d: 'M' + x(m) + ' ' + (cy - 12) + ' l12 12 l-12 12 l-12 -12 z', fill: C.ink }, svg);
    lab(m, cy + bh / 2 + 70, '◆ mean ' + fx(m, 2) + ' h', C.ink, 'start');
    lab(b.uf, 258, 'fence: Q3 + 1.5 × IQR = ' + fx(b.uf, 1), C.pink, 'middle');
    tick(b.uf, 230, 300, C.pink);
  };

  /* ---------- quiz (knowledge checks) ---------- */
  var FIGS = {
    'box-rugby': function (g) { var x = lin(70, 126, 20, 480); drawBox(g, D.rugby, x, 70, 60); xAxis(g, x, 70, 120, 10, 120, 'Body mass (kg)', 0); },
    'hist-hours': function (g) { var x = lin(0, 16, 50, 480); drawHist(g, D.hours, x, 0, 16, 1, 120, 100, 50); xAxis(g, x, 0, 16, 4, 122, 'Weekly training (h)', 0); },
    'box-hours': function (g) { var x = lin(0, 16, 20, 480); drawBox(g, D.hours, x, 70, 60); xAxis(g, x, 0, 16, 4, 120, 'Weekly training (h)', 0); }
  };
  W.quiz = function (el) {
    var spec = JSON.parse(el.querySelector('script[type="application/json"]').textContent);
    var grid = hx('div', 'quiz' + (el.dataset.cols === '3' ? ' three' : ''), null, el);
    spec.forEach(function (it, qi) {
      var card = hx('div', 'qcard', null, grid);
      hx('div', 'q', '<span class="qnum">' + (qi + 1) + '.</span>' + it.q, card);
      if (it.fig && FIGS[it.fig]) { var s = svgRoot(card, 500, 190, it.figAlt || 'Graph for question ' + (qi + 1)); s.style.maxHeight = '170px'; FIGS[it.fig](s); }
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

  /* ---------- same mean, same SD, different stories ---------- */
  W.stories = function (el) {
    var A = D.groupA, Bs = { 1: D.groupB1, 2: D.groupB2, 3: D.groupB3 };
    var notes = {
      0: 'Group B is hidden. Pick a version: all three have the same mean (42.0 cm) and SD (7.0 cm).',
      1: 'Version 1, evenly spread: several Group B athletes jump lower than most of Group A.',
      2: 'Version 2, two clusters: half of Group B jump about 47–50 cm and half about 32–38 cm. The "average" B athlete hardly exists.',
      3: 'Version 3, one outlier: a single 62 cm jumper pulls the mean up. The middle B athlete (median 41.1 cm) is close to Group A.'
    };
    var ver = 0;
    var top = hx('div', 'row', null, el); top.style.cssText = 'align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px';
    hx('span', 'ctrl-label', 'Group B data:', top);
    var vb = [1, 2, 3].map(function (k) { var b = btn('Version ' + k, top, 'sm'); b.addEventListener('click', function () { ver = k; draw(); }); return b; });
    var w = 1300, h = 330, lo = 28, hi = 66;
    var svg = svgRoot(el, w, h, 'Dot plots of Group A and Group B jump heights');
    var bottom = hx('div', 'row', null, el); bottom.style.cssText = 'gap:14px;align-items:stretch';
    var ro = hx('div', 'readouts', null, bottom);
    var vA = readout(ro, 'Group A: mean ± SD', C.cyan), vB = readout(ro, 'Group B: mean ± SD', C.yellow), vO = readout(ro, 'B athletes below A’s mean', C.pink);
    var cap = hx('div', 'card small', '', bottom); cap.style.cssText = 'flex:1;padding:10px 16px;font-size:20px';
    function row(a, y0, colour, name) {
      var x = lin(lo, hi, 150, w - 30), m = St.mean(a), s = St.sd(a);
      sv('rect', { x: x(m - s), y: y0 - 100, width: x(m + s) - x(m - s), height: 100, fill: colour, opacity: 0.12 }, svg);
      drawDot(svg, a, x, y0, 11, colour);
      vline(svg, x(m), y0 - 104, y0, C.ink, null, '8 6');
      var t = sv('text', { x: 20, y: y0 - 30, 'font-size': 24, 'font-weight': 800, fill: colour }, svg); t.textContent = name;
      return x;
    }
    function draw() {
      clear(svg);
      var x = row(A, 125, C.cyan, 'Group A');
      if (ver) row(Bs[ver], 260, C.yellow, 'Group B');
      else { var t = sv('text', { x: 150, y: 220, 'font-size': 24, fill: C.axis }, svg); t.textContent = 'Group B: choose a version above'; }
      xAxis(svg, x, lo, hi, 2, 262, 'CMJ height (cm)   · dashed line = mean · shaded band = mean ± 1 SD', 0);
      vb.forEach(function (b, i) { b.setAttribute('aria-pressed', ver === i + 1); });
      vA.textContent = fx(St.mean(A), 1) + ' ± ' + fx(St.sd(A), 1);
      if (ver) {
        var B = Bs[ver], mA = St.mean(A);
        vB.textContent = fx(St.mean(B), 1) + ' ± ' + fx(St.sd(B), 1);
        vO.textContent = B.filter(function (v) { return v < mA; }).length + ' of ' + B.length;
      } else { vB.textContent = '?'; vO.textContent = '?'; }
      cap.textContent = notes[ver];
    }
    draw();
  };

  /* ---------- Cohen's d explorer ---------- */
  W.cohend = function (el) {
    var d = 0.5, w = 1300, h = 300;
    var top = hx('div', 'row', null, el); top.style.cssText = 'align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:4px';
    hx('span', 'ctrl-label', "Cohen's d", top);
    var s = hx('input', '', null, top); s.type = 'range'; s.min = 0; s.max = 2; s.step = 0.01; s.value = d; s.style.width = '420px'; s.setAttribute('aria-label', "Cohen's d");
    var dv = hx('span', '', '', top); dv.style.cssText = 'font-size:34px;font-weight:800;min-width:80px;color:#38c8f0';
    hx('span', 'ctrl-label', '  Presets:', top);
    [['0.2 small', 0.2], ['0.5 medium', 0.5], ['0.8 large', 0.8], ['1.14 Shawshank', 1.14]].forEach(function (p) { var b = btn(p[0], top, 'sm'); b.addEventListener('click', function () { d = p[1]; s.value = d; draw(); }); });
    s.addEventListener('input', function () { d = +s.value; draw(); });
    var svg = svgRoot(el, w, h, 'Two normal distributions, control and treatment, separated by Cohen’s d');
    var ro = hx('div', 'readouts', null, el);
    var vU = readout(ro, 'Treatment above control mean (U3)', C.cyan), vO = readout(ro, 'Overlap', C.yellow), vP = readout(ro, 'Probability of superiority', C.green);
    var note = hx('div', 'small', '', ro); note.style.cssText = 'flex:1;min-width:300px;align-self:center';
    function curve(mu) {
      var x = lin(-3.5, 5.5, 40, w - 40), y0 = 250, k = 210 / 0.3989, p = 'M' + x(-3.5) + ' ' + y0;
      for (var z = -3.5; z <= 5.5001; z += 0.05) p += ' L' + x(z) + ' ' + (y0 - k * Math.exp(-0.5 * (z - mu) * (z - mu)) / Math.sqrt(2 * Math.PI));
      return p + ' L' + x(5.5) + ' ' + y0 + ' Z';
    }
    function draw() {
      clear(svg);
      var x = lin(-3.5, 5.5, 40, w - 40);
      sv('path', { d: curve(0), fill: C.dim, opacity: 0.75 }, svg);
      sv('path', { d: curve(d), fill: C.cyan, opacity: 0.5 }, svg);
      vline(svg, x(0), 30, 250, C.ink, 'Control', '8 6', 22, 'end');
      vline(svg, x(d), 30, 250, C.cyan, 'Treatment', null, 22, 'start');
      sv('line', { x1: x(-3.5), x2: x(5.5), y1: 250, y2: 250, stroke: C.axis, 'stroke-width': 2 }, svg);
      var t = sv('text', { x: (x(0) + x(d)) / 2, y: 284, 'text-anchor': 'middle', 'font-size': 20, fill: C.text }, svg); t.textContent = 'difference = d standard deviations';
      dv.textContent = fx(d, 2);
      vU.textContent = fx(Phi(d) * 100, 1) + '%'; vO.textContent = fx(2 * Phi(-d / 2) * 100, 1) + '%'; vP.textContent = fx(Phi(d / Math.SQRT2) * 100, 1) + '%';
      var lab = d < 0.2 ? 'smaller than "small"' : d < 0.5 ? 'around "small"' : d < 0.8 ? 'around "medium"' : 'around "large" or bigger';
      note.innerHTML = 'Cohen’s rough guide: ' + lab + '. Benchmarks are only a starting point: what matters is the size of the difference in context. Idea after K. Magnusson, <i>rpsychologist.com</i>.';
    }
    draw();
  };

  /* ---------- correlation explorer and guessing game ---------- */
  W.corr = function (el) {
    var n = 60, r = 0.5, seed = 11, guessMode = false, truth = 0, rounds = 0, errSum = 0;
    var wrap = hx('div', 'row', null, el); wrap.style.cssText = 'gap:22px;align-items:flex-start';
    var left = hx('div', '', null, wrap); left.style.cssText = 'flex:0 0 720px';
    var right = hx('div', '', null, wrap); right.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:12px';
    var w = 720, h = 470;
    var svg = svgRoot(left, w, h, 'Scatterplot of training hours against performance score');
    var lab = hx('div', 'ctrl-label', 'Correlation r', right);
    var s = hx('input', '', null, right); s.type = 'range'; s.min = -1; s.max = 1; s.step = 0.01; s.value = r; s.style.width = '100%'; s.setAttribute('aria-label', 'Correlation r');
    var ro = hx('div', 'readouts', null, right);
    var vR = readout(ro, 'r', C.cyan), vR2 = readout(ro, 'Shared variance r²', C.yellow);
    var g1 = hx('div', 'btngroup', null, right);
    var bGuess = btn('Guess the correlation', g1), bReveal = btn('Reveal', g1), bExplore = btn('Back to exploring', g1, 'ghost');
    var msg = hx('div', 'card small', 'Drag the slider: watch the cloud tighten as r moves towards −1 or +1. r near 0 means no straight-line relationship, not "no relationship at all".', right);
    msg.style.fontSize = '20px';
    function points(rr, sd) {
      var R = rng(sd), xs = [], es = [];
      for (var i = 0; i < n; i++) { xs.push(gauss(R)); es.push(gauss(R)); }
      var mx = St.mean(xs); xs = xs.map(function (v) { return v - mx; }); var sx = St.sd(xs); xs = xs.map(function (v) { return v / sx; });
      var me = St.mean(es); es = es.map(function (v) { return v - me; });
      var b = es.reduce(function (t, v, i) { return t + v * xs[i]; }, 0) / xs.reduce(function (t, v) { return t + v * v; }, 0);
      es = es.map(function (v, i) { return v - b * xs[i]; }); var se = St.sd(es); es = es.map(function (v) { return v / se; });
      return xs.map(function (v, i) { return [v, rr * v + Math.sqrt(1 - rr * rr) * es[i]]; });
    }
    function draw(rr, sd, hide) {
      clear(svg);
      var x = lin(0, 12, 80, w - 20), y = lin(20, 80, h - 70, 20);
      for (var gy = 20; gy <= 80; gy += 10) {
        sv('line', { x1: 80, x2: w - 20, y1: y(gy), y2: y(gy), stroke: '#2a2f33' }, svg);
        var t = sv('text', { x: 70, y: y(gy) + 7, 'text-anchor': 'end', 'font-size': 18 }, svg); t.textContent = gy;
      }
      xAxis(svg, x, 0, 12, 2, h - 70, 'Training (hours per week)', 0);
      var tl = sv('text', { x: 18, y: (h - 70) / 2, 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 700, transform: 'rotate(-90 18 ' + (h - 70) / 2 + ')' }, svg); tl.textContent = 'Performance score';
      points(rr, sd).forEach(function (p) {
        var px = Math.max(0.2, Math.min(11.8, 6 + 2 * p[0])), py = Math.max(21, Math.min(79, 50 + 10 * p[1]));
        sv('circle', { cx: x(px), cy: y(py), r: 7, fill: C.cyan, opacity: 0.85 }, svg);
      });
      if (!hide) { vR.textContent = fx(rr, 2); vR2.textContent = fx(rr * rr * 100, 0) + '%'; }
    }
    function explore() { guessMode = false; lab.textContent = 'Correlation r'; bReveal.disabled = true; draw(r, seed, false); }
    s.addEventListener('input', function () {
      if (guessMode) { vR.textContent = 'guess ' + fx(+s.value, 2); return; }
      r = +s.value; draw(r, seed, false);
    });
    bGuess.addEventListener('click', function () {
      guessMode = true; seed = Math.floor(Math.random() * 1e6);
      truth = Math.round((Math.random() * 1.9 - 0.95) * 100) / 100;
      lab.textContent = 'Your guess (drag, then Reveal)'; s.value = 0; bReveal.disabled = false;
      vR.textContent = 'guess 0.00'; vR2.textContent = '?';
      draw(truth, seed, true);
      msg.textContent = 'What is r for this cloud? Agree on a guess with your neighbour, set the slider, then press Reveal.';
    });
    bReveal.addEventListener('click', function () {
      if (!guessMode) return;
      var g = +s.value, e = Math.abs(g - truth); rounds++; errSum += e;
      vR.textContent = fx(truth, 2); vR2.textContent = fx(truth * truth * 100, 0) + '%';
      msg.innerHTML = 'True r = <b>' + fx(truth, 2) + '</b>, your guess ' + fx(g, 2) + ' (off by ' + fx(e, 2) + '). Average error over ' + rounds + ' round' + (rounds > 1 ? 's' : '') + ': <b>' + fx(errSum / rounds, 2) + '</b>. Press "Guess" for another.';
      bReveal.disabled = true;
    });
    bExplore.addEventListener('click', function () { s.value = r; explore(); msg.textContent = 'Drag the slider: watch the cloud tighten as r moves towards −1 or +1.'; });
    explore();
  };

  window.DeckWidgets = W;
  window.DeckStats = St;
})();
