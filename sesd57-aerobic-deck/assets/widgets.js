/* SESD57 deck widgets. Attach with data-widget="name"; each is initialised the first time its slide is shown. */
(function () {
  'use strict';

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

  var W = {};

  /* ---------- countdown timer: data-seconds="600" ---------- */
  W.timer = function (el) {
    var secs = +(el.dataset.seconds || 300), left = secs, t = null;
    var box = hx('div', 'timer', null, el);
    var disp = hx('span', 't', '', box);
    disp.setAttribute('role', 'timer');
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

  /* ---------- multiple-choice knowledge check: JSON in a child script tag ---------- */
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
          why.className = 'why' + (ok ? '' : ' no');
          why.innerHTML = '<b>' + (ok ? 'Yes. ' : 'Not quite. ') + '</b>' + it.why;
          why.style.display = '';
        });
        return b;
      });
      card._reset = function () { bs.forEach(function (bb) { bb.disabled = false; bb.classList.remove('right', 'wrong'); }); why.style.display = 'none'; };
    });
    var r = btn('Reset answers', el, 'ghost sm'); r.style.marginTop = '10px';
    r.addEventListener('click', function () { grid.querySelectorAll('.qcard').forEach(function (c) { c._reset(); }); });
  };

  window.DeckWidgets = W;
})();
