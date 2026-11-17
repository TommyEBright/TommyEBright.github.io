// Projectile Motion: the page shell. Two parts, Learn and Analyse, each a list of steps. A step has a title, a body
// (HTML for the right-hand card), an optional quick check, and either a figure drawn on the canvas or the video stage.
import { hidpi } from './plot.js?v=1.1.0';
import { LEARN } from './learn.js?v=1.1.0';
import { ANALYSE } from './analyse.js?v=1.1.0';

const VERSION = '1.1.0';
const $ = (id) => document.getElementById(id);
const PARTS = { learn: LEARN, analyse: ANALYSE };
const S = { mode: 'learn', step: { learn: 0, analyse: 0 }, seen: {} };
const app = { $, redraw, render, go: (k) => go(k), setMode, S };
LEARN.init(app); ANALYSE.init(app);

function part() { return PARTS[S.mode]; }
function cur() { return part().steps()[S.step[S.mode]]; }

function render() {
  const P = part(), st = P.steps(), k = S.step[S.mode], s = st[k];
  document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === S.mode)));
  $('progress').innerHTML = st.map((x, i) => {
    const off = x.enabled && !x.enabled();
    return '<button type="button" data-s="' + i + '"' + (off ? ' disabled' : '') + ' class="' + (i === k ? 'cur' : S.seen[S.mode + i] ? 'done' : '') + '">' + (i + 1) + '. ' + (x.short || x.title) + '</button>';
  }).join('');
  $('stepTitle').textContent = (k + 1) + '. ' + s.title;
  $('stepCount').textContent = (S.mode === 'learn' ? 'Learn' : 'Analyse') + ', step ' + (k + 1) + ' of ' + st.length;
  $('viewTitle').textContent = s.view === 'stage' ? 'Video' : (s.figTitle ? s.figTitle() : s.title);
  $('viewHint').textContent = s.hint ? s.hint() : '';
  const stage = s.view === 'stage';
  $('plotWrap').classList.toggle('hide', stage); $('stageWrap').classList.toggle('hide', !stage);
  $('viewTools').innerHTML = s.tools ? s.tools() : '';
  $('stepBody').innerHTML = s.body() + (s.q ? quiz(s.q) : '');
  const nk = nextOn(k, 1), pk = nextOn(k, -1), nx = nk >= 0 ? st[nk] : null;
  $('back').disabled = pk < 0;
  $('next').disabled = !nx || (s.canNext && !s.canNext());
  $('next').innerHTML = k < st.length - 1 ? 'Next &rarr;' : (S.mode === 'learn' ? 'Now analyse &rarr;' : 'Done');
  if (!nx && S.mode === 'learn') $('next').disabled = false;
  S.seen[S.mode + k] = true;
  wireQuiz(s);
  if (s.wire) s.wire();
  redraw();
  try { history.replaceState(null, '', '#' + S.mode + '-' + (k + 1)); } catch (e) { /* ignore */ }
}
function quiz(q) { return '<div class="quiz" data-q><p class="q">Quick check: ' + q.q + '</p><div class="opts">' + q.o.map((o, j) => '<button type="button" data-o="' + j + '">' + o + '</button>').join('') + '</div><p class="fb" hidden></p></div>'; }
function wireQuiz(s) {
  document.querySelectorAll('[data-q] [data-o]').forEach((b) => b.addEventListener('click', () => {
    const k = +b.getAttribute('data-o'), box = b.closest('[data-q]'), fb = box.querySelector('.fb');
    box.querySelectorAll('[data-o]').forEach((x) => x.classList.remove('right', 'wrong'));
    b.classList.add(k === s.q.a ? 'right' : 'wrong'); fb.hidden = false;
    fb.innerHTML = (k === s.q.a ? '<strong style="color:var(--good)">Yes.</strong> ' : '<strong style="color:var(--bad)">Not quite.</strong> ') + s.q.why;
  }));
}
let raf = 0;
function redraw() {
  const s = cur(); if (s.view === 'stage') { if (s.drawStage) s.drawStage(); return; }
  cancelAnimationFrame(raf);
  const frame = (ts) => {
    const { ctx, w, h } = hidpi($('cv'));
    if (s.draw) s.draw(ctx, w, h, ts);
    if (s.animate && s.animate()) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
}
function nextOn(k, d) { const st = part().steps(); for (let i = k + d; i >= 0 && i < st.length; i += d) if (!st[i].enabled || st[i].enabled()) return i; return -1; }
function go(k) { const st = part().steps(); if (k < 0 || k >= st.length || (st[k].enabled && !st[k].enabled())) return; if (cur().leave) cur().leave(); S.step[S.mode] = k; if (cur().enter) cur().enter(); render(); window.scrollTo({ top: Math.min(window.scrollY, $('progress').offsetTop - 8), behavior: 'smooth' }); }
function setMode(m, k) { if (cur().leave) cur().leave(); S.mode = m; if (k !== undefined) S.step[m] = k; if (PARTS[m].enter) PARTS[m].enter(); if (cur().enter) cur().enter(); render(); }

document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
$('progress').addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (b && !b.disabled) go(+b.dataset.s); });
$('back').addEventListener('click', () => go(nextOn(S.step[S.mode], -1)));
$('next').addEventListener('click', () => { const st = part().steps(); if (S.step[S.mode] === st.length - 1 && S.mode === 'learn') { setMode('analyse'); return; } go(nextOn(S.step[S.mode], 1)); });

// pointer events on the figure canvas go to the current step (in CSS pixels)
const cv = $('cv');
const at = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
let dragging = false;
cv.addEventListener('pointerdown', (e) => { const s = cur(); if (s.down && s.down(...at(e))) { dragging = true; cv.setPointerCapture(e.pointerId); redraw(); } });
cv.addEventListener('pointermove', (e) => { const s = cur(); const p = at(e); if (dragging && s.drag) { s.drag(...p); redraw(); } else if (s.hover) { if (s.hover(...p)) redraw(); } cv.style.cursor = s.cursor ? s.cursor(...p, dragging) : 'default'; });
const stop = () => { if (dragging) { dragging = false; const s = cur(); if (s.up) s.up(); render(); } };
cv.addEventListener('pointerup', stop); cv.addEventListener('pointercancel', stop);
cv.addEventListener('pointerleave', () => { const s = cur(); if (!dragging && s.hover && s.hover(NaN, NaN)) redraw(); });
window.addEventListener('resize', () => redraw());

// deep links: #learn-4, #analyse-2
(function start() {
  $('ver').textContent = 'v' + VERSION;
  const m = /^#(learn|analyse)-(\d+)$/.exec(location.hash);
  if (m) { S.mode = m[1]; S.step[m[1]] = Math.max(0, Math.min(PARTS[m[1]].steps().length - 1, +m[2] - 1)); if (PARTS[m[1]].steps()[S.step[m[1]]].enabled && !PARTS[m[1]].steps()[S.step[m[1]]].enabled()) S.step[m[1]] = 0; }
  render();
})();

// install as an app, offline
let deferred = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; $('installBtn').classList.remove('hide'); });
$('installBtn').addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('installBtn').classList.add('hide'); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
