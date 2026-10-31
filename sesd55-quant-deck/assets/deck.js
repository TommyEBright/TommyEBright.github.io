/* SESD55 deck engine: 1440×810 stage, step reveals, presenter sync, overview, handout. */
(function () {
  'use strict';
  var W = 1440, H = 810;
  var params = new URLSearchParams(location.search);
  var HANDOUT = params.has('handout');
  var stage = document.querySelector('.stage');
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  var total = slides.length;
  var idx = -1;
  var inited = new WeakSet();
  var chan = ('BroadcastChannel' in window) ? new BroadcastChannel('sesd55-deck') : null;
  var announce = document.getElementById('announce');

  slides.forEach(function (s, i) { s.dataset.n = i + 1; if (!s.id) s.id = 'slide-' + (i + 1); });

  function title(s) { return s.dataset.title || ('Slide ' + s.dataset.n); }
  function steps(s) { return Array.prototype.slice.call(s.querySelectorAll('.step')); }

  function initWidgets(slide) {
    if (inited.has(slide)) return;
    inited.add(slide);
    slide.querySelectorAll('[data-widget]').forEach(function (el) {
      var fn = window.DeckWidgets && window.DeckWidgets[el.dataset.widget];
      if (fn) { try { fn(el); } catch (e) { console.error('Widget ' + el.dataset.widget + ' failed', e); } }
    });
  }

  function loadImages(from, to) {
    for (var k = from; k <= to; k++) {
      var s = slides[k]; if (!s) continue;
      s.querySelectorAll('img[data-src]').forEach(function (im) { im.src = im.dataset.src; im.removeAttribute('data-src'); });
    }
  }

  /* ---------------- presentation mode ---------------- */
  function fit() {
    var s = Math.min(window.innerWidth / W, window.innerHeight / H);
    var x = (window.innerWidth - W * s) / 2, y = (window.innerHeight - H * s) / 2;
    stage.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')';
  }

  function show(i, at) {
    i = Math.max(0, Math.min(total - 1, i));
    var changed = i !== idx;
    slides.forEach(function (s, k) {
      var cur = k === i;
      s.classList.toggle('current', cur);
      s.setAttribute('aria-hidden', cur ? 'false' : 'true');
      if ('inert' in s) s.inert = !cur;
    });
    var st = steps(slides[i]);
    st.forEach(function (e) { e.classList.toggle('shown', at === 'end'); });
    idx = i;
    loadImages(i - 1, i + 2);
    initWidgets(slides[i]);
    if (changed) {
      if (location.hash !== '#' + (i + 1)) history.replaceState(null, '', '#' + (i + 1));
      if (announce) announce.textContent = 'Slide ' + (i + 1) + ' of ' + total + ': ' + title(slides[i]);
      slides[i].dispatchEvent(new CustomEvent('slideshown', { bubbles: true }));
    }
    updateChrome();
    broadcast();
  }

  // steps that share a data-step value are revealed together (e.g. a whole table column)
  function group(list, el) {
    if (!el.dataset.step) return [el];
    return list.filter(function (e) { return e.dataset.step === el.dataset.step; });
  }
  function countGroups(list) {
    var seen = {}, n = 0;
    list.forEach(function (e) { var k = e.dataset.step; if (!k) n++; else if (!seen[k]) { seen[k] = 1; n++; } });
    return n;
  }
  function next() {
    var hidden = steps(slides[idx]).filter(function (e) { return !e.classList.contains('shown'); });
    if (hidden.length) {
      group(hidden, hidden[0]).forEach(function (e) { e.classList.add('shown'); });
      hidden[0].dispatchEvent(new CustomEvent('stepshown', { bubbles: true }));
      updateChrome(); broadcast(); return;
    }
    if (idx < total - 1) show(idx + 1, 'start');
  }
  function prev() {
    var shown = steps(slides[idx]).filter(function (e) { return e.classList.contains('shown'); });
    if (shown.length) { group(shown, shown[shown.length - 1]).forEach(function (e) { e.classList.remove('shown'); }); updateChrome(); broadcast(); return; }
    if (idx > 0) show(idx - 1, 'end');
  }

  /* ---------------- chrome ---------------- */
  var progress = document.querySelector('.progress');
  var hud = document.querySelector('.hud');
  var hudCount = hud && hud.querySelector('.count');
  function updateChrome() {
    if (progress) progress.style.width = ((idx + 1) / total * 100) + '%';
    if (hudCount) {
      var left = countGroups(steps(slides[idx]).filter(function (e) { return !e.classList.contains('shown'); }));
      hudCount.textContent = (idx + 1) + ' / ' + total + (left ? '  •' + left : '');
      hudCount.title = left ? left + ' reveal(s) left on this slide' : '';
    }
  }
  var idleTimer;
  function wake() {
    if (!hud) return;
    hud.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () { hud.classList.add('idle'); }, 2600);
  }

  function openOverlay(id) {
    document.querySelectorAll('.overlay').forEach(function (o) { o.classList.toggle('open', o.id === id && !o.classList.contains('open')); });
    var o = document.getElementById(id);
    if (o && o.classList.contains('open')) {
      if (id === 'overview') buildOverview();
      var f = o.querySelector('.cur, button, a'); if (f) f.focus();
    }
  }
  function closeOverlays() { document.querySelectorAll('.overlay.open').forEach(function (o) { o.classList.remove('open'); }); }

  var ovBuilt = false;
  function buildOverview() {
    var grid = document.querySelector('#overview .ov-grid');
    if (!ovBuilt) {
      slides.forEach(function (s, i) {
        var b = document.createElement('button');
        b.className = 'ov-item';
        var bg = s.querySelector('img.bg');
        var src = bg ? (bg.getAttribute('src') || bg.dataset.src) : null;
        b.innerHTML = '<div class="thumb">' + (src ? '<img loading="lazy" alt="" src="' + src + '">' : '<span>' + title(s) + '</span>') + '</div>' +
          '<div class="cap"><b>' + (i + 1) + '</b><span>' + title(s) + '</span>' + (s.classList.contains('added') ? ' <span class="new">new</span>' : '') + '</div>';
        b.addEventListener('click', function () { closeOverlays(); show(i, 'start'); });
        grid.appendChild(b);
      });
      ovBuilt = true;
    }
    grid.querySelectorAll('.ov-item').forEach(function (b, i) { b.classList.toggle('cur', i === idx); });
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) { (document.documentElement.requestFullscreen || function () {}).call(document.documentElement); }
    else if (document.exitFullscreen) document.exitFullscreen();
  }
  function openPresenter() {
    window.open('presenter.html#' + (idx + 1), 'sesd55-presenter', 'width=1280,height=800');
  }

  /* ---------------- presenter sync ---------------- */
  function broadcast() {
    if (!chan) return;
    var st = steps(slides[idx]);
    var hiddenSteps = st.filter(function (e) { return !e.classList.contains('shown'); });
    var all = countGroups(st);
    chan.postMessage({ t: 'state', i: idx, total: total, steps: all, shown: all - countGroups(hiddenSteps) });
  }
  if (chan) chan.onmessage = function (ev) {
    var m = ev.data || {};
    if (m.t === 'hello') broadcast();
    if (m.t === 'cmd') {
      if (m.cmd === 'next') next();
      else if (m.cmd === 'prev') prev();
      else if (m.cmd === 'goto' && typeof m.i === 'number') show(m.i, 'start');
      else if (m.cmd === 'black') document.querySelector('.blackout').classList.toggle('on');
    }
  };

  /* ---------------- input ---------------- */
  var typed = '';
  function onKey(e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    var t = e.target, tag = (t.tagName || '').toLowerCase();
    var inField = tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;
    var k = e.key;
    var openOv = document.querySelector('.overlay.open');
    if (k === 'Escape') { if (openOv) { closeOverlays(); e.preventDefault(); } return; }
    if (openOv) return;
    // clickers send PageUp / PageDown: always navigate, even from a slider
    if (k === 'PageDown') { e.preventDefault(); if (inField) t.blur(); next(); return; }
    if (k === 'PageUp') { e.preventDefault(); if (inField) t.blur(); prev(); return; }
    if (inField) return;
    var onButton = tag === 'button' || tag === 'a' || t.getAttribute('role') === 'button';
    if ((k === ' ' || k === 'Enter') && onButton) return;
    if (/^[0-9]$/.test(k)) { typed += k; return; }
    if (k === 'Enter' && typed) { show(parseInt(typed, 10) - 1, 'start'); typed = ''; e.preventDefault(); return; }
    typed = '';
    switch (k) {
      case 'ArrowRight': case 'ArrowDown': case ' ': case 'n': case 'N': e.preventDefault(); next(); break;
      case 'ArrowLeft': case 'ArrowUp': case 'Backspace': case 'p': case 'P': e.preventDefault(); prev(); break;
      case 'Home': e.preventDefault(); show(0, 'start'); break;
      case 'End': e.preventDefault(); show(total - 1, 'start'); break;
      case 'o': case 'O': e.preventDefault(); openOverlay('overview'); break;
      case 's': case 'S': e.preventDefault(); openPresenter(); break;
      case 'f': case 'F': case 'F5': e.preventDefault(); toggleFullscreen(); break;
      case 'b': case 'B': case '.': e.preventDefault(); document.querySelector('.blackout').classList.toggle('on'); break;
      case '?': case 'h': case 'H': e.preventDefault(); openOverlay('help'); break;
    }
  }

  var touchX = null, touchY = null;
  function onTouchStart(e) {
    if (e.target.closest('button, input, select, a, .draggable, .chip, .bin, svg')) { touchX = null; return; }
    touchX = e.touches[0].clientX; touchY = e.touches[0].clientY;
  }
  function onTouchEnd(e) {
    if (touchX === null) return;
    var dx = e.changedTouches[0].clientX - touchX, dy = e.changedTouches[0].clientY - touchY;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (dx < 0) next(); else prev(); }
    touchX = null;
  }

  /* ---------------- handout mode ---------------- */
  function buildHandout() {
    document.body.classList.add('handout');
    var bar = document.createElement('div');
    bar.className = 'handout-bar';
    bar.innerHTML = '<strong>SESD55 · Quantitative data analysis: slides and speaker notes</strong>' +
      '<button type="button" id="printBtn">Print or save as PDF</button><a href="./">Back to the slides</a>';
    document.body.insertBefore(bar, document.body.firstChild);
    function eager() { document.querySelectorAll('img[loading=lazy]').forEach(function (im) { im.loading = 'eager'; }); }
    window.addEventListener('beforeprint', eager);
    document.getElementById('printBtn').addEventListener('click', function () {
      eager();
      var imgs = [].slice.call(document.querySelectorAll('.hwrap img'));
      Promise.all(imgs.map(function (im) { return im.complete ? 0 : new Promise(function (r) { im.onload = im.onerror = r; }); })).then(function () { window.print(); });
    });
    slides.forEach(function (s, i) {
      var wrap = document.createElement('section');
      wrap.className = 'hwrap';
      wrap.setAttribute('aria-label', 'Slide ' + (i + 1) + ': ' + title(s));
      var frame = document.createElement('div');
      frame.className = 'hframe';
      s.parentNode.insertBefore(wrap, s);
      frame.appendChild(s);
      wrap.appendChild(frame);
      var notes = s.querySelector('aside.notes');
      var hn = document.createElement('div');
      hn.className = 'hnotes';
      hn.innerHTML = '<h4>Slide ' + (i + 1) + ' · ' + title(s) + (s.dataset.time ? ' · about ' + s.dataset.time + ' min' : '') + '</h4>' + (notes ? notes.innerHTML : '');
      wrap.appendChild(hn);
      s.classList.add('current');
      s.setAttribute('aria-hidden', 'false');
      steps(s).forEach(function (e) { e.classList.add('shown'); });
      s.querySelectorAll('img[data-src]').forEach(function (im) { im.loading = 'lazy'; im.src = im.dataset.src; im.removeAttribute('data-src'); });
      initWidgets(s);
    });
    function scaleAll() {
      document.querySelectorAll('.hframe').forEach(function (f) {
        var w = f.parentNode.clientWidth, sc = w / W;
        f.style.height = (H * sc) + 'px';
        f.firstChild.style.transform = 'scale(' + sc + ')';
      });
    }
    scaleAll();
    window.addEventListener('resize', scaleAll);
    window.addEventListener('beforeprint', scaleAll);
  }

  /* ---------------- boot ---------------- */
  function boot() {
    if (HANDOUT) { buildHandout(); return; }
    document.body.classList.add('no-anim');
    setTimeout(function () { document.body.classList.remove('no-anim'); }, 400);
    fit();
    window.addEventListener('resize', fit);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousemove', wake);
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('hashchange', function () {
      var n = parseInt(location.hash.slice(1), 10);
      if (n && n - 1 !== idx) show(n - 1, 'start');
    });
    if (hud) {
      hud.querySelector('[data-act=prev]').addEventListener('click', prev);
      hud.querySelector('[data-act=next]').addEventListener('click', next);
      hud.querySelector('[data-act=overview]').addEventListener('click', function () { openOverlay('overview'); });
      hud.querySelector('[data-act=presenter]').addEventListener('click', openPresenter);
      hud.querySelector('[data-act=full]').addEventListener('click', toggleFullscreen);
      hud.querySelector('[data-act=help]').addEventListener('click', function () { openOverlay('help'); });
    }
    document.querySelectorAll('.overlay [data-close]').forEach(function (b) { b.addEventListener('click', closeOverlays); });
    document.querySelector('.blackout').addEventListener('click', function () { this.classList.remove('on'); });
    var start = parseInt(location.hash.slice(1), 10);
    show(start ? start - 1 : 0, 'start');
    wake();
    window.Deck = { next: next, prev: prev, go: function (i) { show(i, 'start'); }, get index() { return idx; }, total: total };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
