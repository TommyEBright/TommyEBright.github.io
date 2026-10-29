// Tab 4: force -> net force -> acceleration -> velocity -> displacement, step by step, with the trial's own numbers.
import { A, $, COL } from './state.js?v=1.0.0';
import { Chart, frame, axes, line, range, band, vline, halo, dot, fillBetween } from './plot.js?v=1.0.0';
import { integrateForward, integrateBackward, G } from './maths.js?v=1.0.0';

let P = [];
let alt = null; // what-if bodyweight error
const sgn = (x, d) => (x >= 0 ? '+' : '&minus;') + Math.abs(x).toFixed(d);
const f = (x, d) => (Number.isFinite(x) ? x.toFixed(d) : '&ndash;');

function viewIdx() { const D = A.D, v = A.view; return [Math.max(0, Math.floor(v.x0 * D.fs) - 1), Math.min(D.n - 1, Math.ceil(v.x1 * D.fs) + 1)]; }
function startIdx() { const R = A.R; return R.jump === 'dj' ? R.TD : R.onset; }

function series(k) {
  const R = A.R, n = A.D.n;
  if (k === 1) { if (!R._net || R._net.length !== n) { R._net = new Float64Array(n); for (let i = 0; i < n; i++) R._net[i] = R.F[i] - R.BW; } return R._net; }
  if (k === 2) return R.a;
  if (k === 3) return R.v;
  if (!R._scm || R._scm.length !== n) { R._scm = new Float64Array(n); for (let i = 0; i < n; i++) R._scm[i] = R.s[i] * 100; }
  return R._scm;
}
const META = {
  1: { lab: 'Net force (N)', col: COL.net },
  2: { lab: 'Acceleration (m/s²)', col: COL.acc },
  3: { lab: 'Velocity (m/s)', col: COL.vel },
  4: { lab: 'Displacement (cm)', col: COL.disp }
};

function drawPanel(k, ctx, w, h, exp) {
  const R = A.R, D = A.D; if (!R || !R.ok || !A.view) return null;
  const t = D.t, [i0, i1] = viewIdx();
  const y = series(k);
  const extra = [0];
  if (alt && (k === 3 || k === 4)) { const y2 = k === 3 ? alt.v : alt.scm; for (let i = i0; i <= i1; i += Math.max(1, Math.floor((i1 - i0) / 400))) extra.push(y2[i]); }
  const yr = range([y], i0, i1, extra, 0.1);
  const fr = frame(w, h, A.view.x0, A.view.x1, yr[0], yr[1], { L: 62, T: 10, B: exp || k === 4 ? 34 : 22 });
  axes(ctx, fr, { ylab: META[k].lab, xlab: k === 4 || exp ? 'Time (s)' : '', noX: false, yTicks: 4 });
  R.phases.forEach((p) => band(ctx, fr, t[p.s], t[Math.min(D.n - 1, p.e)], p.col, 0.09));
  R.events.forEach((e) => { if (!e.weigh) vline(ctx, fr, t[e.i], e.edit ? '#94a3b8' : '#cbd5e1', [3, 3], 1); });
  const s0 = startIdx(), cur = A.cursor;
  const build = A.play.build && cur >= 0;
  // areas: under net force/acceleration (= change in velocity) and under velocity (= change in displacement)
  const endA = cur >= 0 ? cur : R.TO;
  if (k === 1 || k === 2) {
    const a0 = R.jump === 'dj' && R.integ.dir === 'backward' && cur >= 0 && cur < R.integ.start ? cur : s0;
    const a1 = R.jump === 'dj' && R.integ.dir === 'backward' && cur >= 0 && cur < R.integ.start ? R.integ.start : endA;
    fillBetween(ctx, fr, t, y, 0, Math.max(i0, Math.min(a0, a1)), Math.min(i1, Math.max(a0, a1)), COL.pos, COL.neg);
    // thin strips when zoomed right in
    if (k === 2 && i1 - i0 < 160) {
      ctx.save(); ctx.strokeStyle = 'rgba(15,23,42,.35)'; ctx.lineWidth = 0.8;
      for (let i = Math.max(i0, s0 + 1); i <= Math.min(i1, endA); i++) {
        const xa = fr.X(t[i - 1]), xb = fr.X(t[i]);
        const ya = R.integ.method === 'rect' ? y[i] : y[i - 1], yb = y[i];
        ctx.beginPath(); ctx.moveTo(xa, fr.Y(0)); ctx.lineTo(xa, fr.Y(ya)); ctx.lineTo(xb, fr.Y(yb)); ctx.lineTo(xb, fr.Y(0)); ctx.stroke();
      }
      ctx.restore();
    }
  }
  if (k === 3) fillBetween(ctx, fr, t, y, 0, Math.max(i0, s0), Math.min(i1, endA), 'rgba(8,145,178,.22)', 'rgba(8,145,178,.22)');
  // the line
  const lim = (k >= 3 && build) ? Math.min(i1, cur) : i1;
  if (k >= 3 && build) line(ctx, fr, t, y, { col: META[k].col, width: 1.2, i0, i1, alpha: 0.18 });
  line(ctx, fr, t, y, { col: META[k].col, width: 2.4, i0, i1: lim });
  if (alt && (k === 3 || k === 4)) line(ctx, fr, t, k === 3 ? alt.v : alt.scm, { col: '#0f172a', width: 1.6, dash: [6, 4], i0, i1: lim });
  // landmarks
  ctx.save(); ctx.font = '600 11px system-ui, Arial'; ctx.fillStyle = '#1f2a33'; ctx.textBaseline = 'bottom';
  const mark = (i, txt, below) => {
    if (i < 0 || i < i0 || i > i1 || (build && i > cur)) return;
    const X = fr.X(t[i]), Y = fr.Y(y[i]); dot(ctx, X, Y, META[k].col, 4);
    ctx.textAlign = X > fr.L + fr.W - 80 ? 'right' : X < fr.L + 80 ? 'left' : 'center';
    halo(ctx, txt, X, below ? Y + 18 : Y - 6);
  };
  if (R.jump === 'cmj') {
    if (k === 2) mark(R.vMinI, 'a = 0');
    if (k === 3) { mark(R.vMinI, 'fastest down ' + f(R.v[R.vMinI], 2), true); if (R.zeroI > 0) mark(R.zeroI, 'v = 0'); }
    if (k === 4 && R.zeroI > 0) mark(R.zeroI, 'lowest point ' + f(R.s[R.zeroI] * 100, 1) + ' cm', true);
  }
  if (R.jump === 'dj') {
    if (k === 3) { mark(R.TD, 'touchdown ' + f(R.v[R.TD], 2), true); if (R.lowI > 0) mark(R.lowI, 'v = 0'); }
    if (k === 4 && R.lowI > 0) mark(R.lowI, 'lowest point ' + f(R.s[R.lowI] * 100, 1) + ' cm', true);
  }
  if (k === 3) mark(R.TO, 'take-off ' + f(R.v[R.TO], 2) + ' m/s');
  if (k === 4) { const hiI = R.LD > 0 ? R.TO + Math.round((R.LD - R.TO) / 2) : -1; if (hiI > 0) { let b = R.TO; for (let i = R.TO; i < R.LD; i++) if (R.s[i] > R.s[b]) b = i; mark(b, 'highest ' + f(R.s[b] * 100, 1) + ' cm'); } }
  ctx.restore();
  // cursor
  if (cur >= 0 && !exp) { const X = fr.X(t[cur]); if (X >= fr.L && X <= fr.L + fr.W) { vline(ctx, fr, t[cur], A.pinned ? '#c0264d' : '#334155', null, A.pinned ? 2 : 1.2); const Y = fr.Y(y[cur]); if (Y >= fr.T && Y <= fr.T + fr.H) dot(ctx, X, Y, META[k].col, 5); } }
  return fr;
}

function worked() {
  const el = $('worked'), R = A.R; if (!el) return;
  const i = A.cursor;
  const hd = (k) => ['ihF', 'ihA', 'ihV', 'ihS'][k - 1];
  if (!R || !R.ok || i < 0) {
    el.innerHTML = '<p class="muted">Hover over a graph (or press Play) to see each step worked out with the numbers at that moment.</p>';
    [1, 2, 3, 4].forEach((k) => { $(hd(k)).textContent = ''; });
    return;
  }
  const dt = 1 / A.D.fs, F = R.F[i], net = F - R.BW, a = R.a[i], m = R.m;
  const st = A.step;
  const box = (k, title, body) => '<div class="eq' + (st === k ? ' on' : '') + '"><span class="k">' + title + '</span>' + body + '</div>';
  let h = '<p class="muted" style="margin:.1rem 0 .3rem">t = ' + A.D.t[i].toFixed(3) + ' s (sample ' + i + '). &Delta;t = 1 &divide; ' + A.D.fs + ' Hz = ' + dt.toFixed(4) + ' s.</p>';
  h += box(1, '1. Net force', 'F<sub>net</sub> = F &minus; W = ' + F.toFixed(0) + ' &minus; ' + R.BW.toFixed(0) + ' = <span class="r">' + sgn(net, 0) + ' N</span>');
  h += box(2, '2. Acceleration', 'a = F<sub>net</sub> &divide; m = ' + sgn(net, 0) + ' &divide; ' + m.toFixed(1) + ' = <span class="r">' + sgn(a, 2) + ' m/s&sup2;</span>');
  const s0 = R.integ.start, back = R.jump === 'dj' && R.integ.dir === 'backward' && i < s0;
  const trap = R.integ.method !== 'rect';
  const before = R.jump !== 'dj' && i <= R.onset;
  const preTD = R.jump === 'dj' && i < R.TD;
  if (before) {
    h += box(3, '3. Velocity', 'Before the start of movement the participant is standing still, so v = <span class="r">0 m/s</span>. Integration starts at ' + A.D.t[R.onset].toFixed(3) + ' s with v = 0.');
    h += box(4, '4. Displacement', 's = <span class="r">0 cm</span> (the starting position).');
  } else if (preTD) {
    h += box(3, '3. Velocity', 'Falling from the box: nothing is on the plate, so a = &minus;g. v = &minus;g &times; time since stepping off = <span class="r">' + sgn(R.v[i], 2) + ' m/s</span>.');
    h += box(4, '4. Displacement', 'Height above the touchdown position = <span class="r">' + sgn(R.s[i] * 100, 1) + ' cm</span>.');
  } else {
    const j = back ? i + 1 : i - 1; // the neighbour the step came from
    const ap = R.a[j], vp = R.v[j], sp = R.s[j], v = R.v[i], s = R.s[i];
    const strip = trap ? (a + ap) / 2 * dt : (back ? R.a[j] : a) * dt;
    const sstrip = trap ? (v + vp) / 2 * dt : (back ? vp : v) * dt;
    if (!back) {
      h += box(3, '3. Velocity (add the strip of area under acceleration)', trap
        ? 'v<sub>i</sub> = v<sub>i&minus;1</sub> + &frac12;(a<sub>i&minus;1</sub> + a<sub>i</sub>) &Delta;t<br>= ' + vp.toFixed(3) + ' + &frac12;(' + ap.toFixed(2) + ' + ' + a.toFixed(2) + ') &times; ' + dt.toFixed(4) + '<br>= ' + vp.toFixed(3) + ' ' + (strip >= 0 ? '+ ' : '&minus; ') + Math.abs(strip).toFixed(4) + ' = <span class="r">' + sgn(v, 3) + ' m/s</span>'
        : 'v<sub>i</sub> = v<sub>i&minus;1</sub> + a<sub>i</sub> &Delta;t = ' + vp.toFixed(3) + ' + ' + a.toFixed(2) + ' &times; ' + dt.toFixed(4) + ' = <span class="r">' + sgn(v, 3) + ' m/s</span>');
      h += box(4, '4. Displacement (add the strip of area under velocity)', trap
        ? 's<sub>i</sub> = s<sub>i&minus;1</sub> + &frac12;(v<sub>i&minus;1</sub> + v<sub>i</sub>) &Delta;t<br>= ' + sp.toFixed(4) + ' + &frac12;(' + vp.toFixed(3) + ' + ' + v.toFixed(3) + ') &times; ' + dt.toFixed(4) + '<br>= <span class="r">' + sgn(s, 4) + ' m</span> (' + sgn(s * 100, 1) + ' cm)'
        : 's<sub>i</sub> = s<sub>i&minus;1</sub> + v<sub>i</sub> &Delta;t = ' + sp.toFixed(4) + ' + ' + v.toFixed(3) + ' &times; ' + dt.toFixed(4) + ' = <span class="r">' + sgn(s, 4) + ' m</span>');
    } else {
      h += box(3, '3. Velocity (backwards: take the strip away)', trap
        ? 'v<sub>i</sub> = v<sub>i+1</sub> &minus; &frac12;(a<sub>i</sub> + a<sub>i+1</sub>) &Delta;t<br>= ' + vp.toFixed(3) + ' &minus; &frac12;(' + a.toFixed(2) + ' + ' + ap.toFixed(2) + ') &times; ' + dt.toFixed(4) + ' = <span class="r">' + sgn(v, 3) + ' m/s</span>'
        : 'v<sub>i</sub> = v<sub>i+1</sub> &minus; a<sub>i+1</sub> &Delta;t = <span class="r">' + sgn(v, 3) + ' m/s</span>');
      h += box(4, '4. Displacement (backwards)', 's<sub>i</sub> = s<sub>i+1</sub> &minus; ' + (trap ? '&frac12;(v<sub>i</sub> + v<sub>i+1</sub>)' : 'v<sub>i+1</sub>') + ' &Delta;t = <span class="r">' + sgn(s * 100, 1) + ' cm</span> (relative to touchdown)');
    }
    void sstrip;
  }
  el.innerHTML = h;
  $('ihF').innerHTML = sgn(net, 0) + ' N';
  $('ihA').innerHTML = sgn(a, 2) + ' m/s&sup2;';
  $('ihV').innerHTML = sgn(R.v[i], 2) + ' m/s';
  $('ihS').innerHTML = sgn(R.s[i] * 100, 1) + ' cm';
}

function links() {
  const el = $('links'), R = A.R; if (!el) return;
  if (!R || !R.ok) { el.innerHTML = ''; return; }
  const t = (i) => A.D.t[i].toFixed(3);
  const L = [];
  const go = (i, txt) => '<div class="tip"><p>' + txt + '</p><button type="button" class="btn small ghost" data-go="' + i + '">Show me</button></div>';
  if (R.jump === 'cmj') {
    L.push(go(R.vMinI, 'At ' + t(R.vMinI) + ' s force comes back up to bodyweight, so net force and acceleration are zero. Velocity has stopped getting more negative: this is the fastest the centre of mass moves down (' + R.v[R.vMinI].toFixed(2) + ' m/s).'));
    if (R.zeroI > 0) L.push(go(R.zeroI, 'At ' + t(R.zeroI) + ' s velocity crosses zero: the centre of mass has stopped moving down, so displacement is at its lowest (' + (R.s[R.zeroI] * 100).toFixed(1) + ' cm). The blue area under acceleration has been cancelled out by the green area.'));
  }
  if (R.jump === 'sj') L.push(go(R.onset, 'The push starts at ' + t(R.onset) + ' s from a still squat, so velocity and displacement both start at zero.'));
  if (R.jump === 'dj') {
    L.push(go(R.TD, 'At touchdown (' + t(R.TD) + ' s) the centre of mass is already moving down at ' + R.v[R.TD].toFixed(2) + ' m/s' + (R.integ.dir === 'backward' ? ' (found by integrating backwards from the still standing after landing, where velocity is zero)' : ' (from the box height)') + '. That is the starting value for velocity.'));
    if (R.lowI > 0) L.push(go(R.lowI, 'At ' + t(R.lowI) + ' s velocity reaches zero: the lowest point of the contact (' + (R.s[R.lowI] * 100).toFixed(1) + ' cm below touchdown).'));
  }
  L.push(go(R.TO, 'At take-off (' + t(R.TO) + ' s) velocity is ' + R.v[R.TO].toFixed(2) + ' m/s. After that only gravity acts, so h = v&sup2; &divide; 2g = ' + (R.v[R.TO] > 0 ? (R.v[R.TO] ** 2 / (2 * G) * 100).toFixed(1) : '&ndash;') + ' cm.'));
  el.innerHTML = '<h3>Things to notice</h3>' + L.join('');
  el.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { A.cursor = +b.getAttribute('data-go'); A.pinned = true; A.fn.cursorChanged(); }));
}

// What if bodyweight were wrong by e%? (Street et al., 2001)
function computeAlt(pct) {
  const R = A.R, n = A.D.n, dt = 1 / A.D.fs;
  if (!pct) { alt = null; return; }
  const BW = R.BW * (1 + pct / 100), m = BW / G, a = new Float64Array(n);
  for (let i = 0; i < n; i++) a[i] = (R.F[i] - BW) / m;
  let v, s;
  const meth = R.integ.method;
  if (R.jump !== 'dj') { v = integrateForward(a, dt, R.onset, 0, meth); s = integrateForward(v, dt, R.onset, 0, meth); }
  else if (R.integ.dir === 'forward') { v = integrateForward(a, dt, R.TD, R.integ.v0, meth); s = integrateForward(v, dt, R.TD, 0, meth); }
  else { const an = R.integ.start; v = integrateBackward(a, dt, an, 0, meth); integrateForward(a, dt, an, 0, meth, v); s = integrateBackward(v, dt, an, 0, meth); integrateForward(v, dt, an, 0, meth, s); const s0 = s[R.TD]; for (let i = 0; i < n; i++) s[i] -= s0; for (let i = 0; i < R.TD; i++) { v[i] = NaN; s[i] = NaN; } }
  const scm = new Float64Array(n); for (let i = 0; i < n; i++) scm[i] = s[i] * 100;
  alt = { v, scm, pct, tov: v[R.TO] };
}
function advanced() {
  const el = $('advInteg'); if (!el) return;
  if (A.level < 3 || !A.R || !A.R.ok) { el.innerHTML = ''; alt = null; return; }
  const R = A.R;
  const pct = alt ? alt.pct : 0;
  let res = '';
  if (alt) {
    const h1 = R.v[R.TO] > 0 ? R.v[R.TO] ** 2 / (2 * G) : NaN, h2 = alt.tov > 0 ? alt.tov ** 2 / (2 * G) : NaN;
    res = '<p class="readout">Take-off velocity ' + f(alt.tov, 2) + ' m/s instead of ' + f(R.v[R.TO], 2) + ' m/s, so jump height ' + f(h2 * 100, 1) + ' cm instead of ' + f(h1 * 100, 1) + ' cm (' + sgn((h2 - h1) * 100, 1) + ' cm). The dashed lines show the result.</p>';
  }
  el.innerHTML = '<div class="bwerr"><h3>What if bodyweight is slightly wrong?</h3>'
    + '<label for="bwErr">Bodyweight error: <span id="bwErrV">' + (pct > 0 ? '+' : '') + pct.toFixed(1) + '%</span> (' + (pct >= 0 ? '+' : '&minus;') + Math.abs(R.BW * pct / 100).toFixed(1) + ' N)</label>'
    + '<input type="range" id="bwErr" min="-2" max="2" step="0.1" value="' + pct + '">' + res
    + '<p class="muted">Every sample has bodyweight subtracted before it is integrated, so a tiny error adds up over time (Street et al., 2001). The longer the integration runs, the bigger the drift, which is why weighing should be done just before the movement and the integration kept short (Robertson et al., 2014).</p>'
    + '<label for="iMethod">Integration rule</label><select id="iMethod"><option value="trap">Trapezoid rule</option><option value="rect">Rectangles (Riemann sum)</option></select></div>';
  $('iMethod').value = A.S.set.method;
  $('iMethod').addEventListener('change', function () { A.S.set.method = this.value; $('method').value = this.value; A.fn.refresh({ keepView: true }); });
  $('bwErr').addEventListener('input', function () { computeAlt(parseFloat(this.value)); render(); advanced(); });
}

export function initInteg() {
  [1, 2, 3, 4].forEach((k) => {
    P[k] = new Chart($('cI' + k), {
      height: k === 4 ? 170 : 150,
      draw: (ctx, w, h, exp) => drawPanel(k, ctx, w, h, exp),
      label: META[k].lab,
      onMove: (p, fr) => { if (!fr || A.pinned || A.play.on) return; if (p.x < fr.L || p.x > fr.L + fr.W) return; A.cursor = Math.max(0, Math.min(A.D.n - 1, Math.round(fr.tAt(p.x) * A.D.fs))); A.fn.cursorChanged(); },
      onDown: (p, fr) => { if (!fr) return false; A.pinned = !A.pinned; if (A.pinned) A.cursor = Math.max(0, Math.min(A.D.n - 1, Math.round(fr.tAt(p.x) * A.D.fs))); A.fn.cursorChanged(); return false; }
    });
  });
  document.querySelectorAll('#steps .stepbtn').forEach((b) => b.addEventListener('click', () => { const s = +b.getAttribute('data-s'); A.step = A.step === s ? 0 : s; stepUI(); worked(); }));
  $('buildUp').addEventListener('change', function () { A.play.build = this.checked; render(); });
}
function stepUI() {
  document.querySelectorAll('#steps .stepbtn').forEach((b) => b.classList.toggle('on', +b.getAttribute('data-s') === A.step));
  document.querySelectorAll('.pnl').forEach((p) => { const k = +p.getAttribute('data-k'); p.classList.toggle('on', A.step === k); p.classList.toggle('dim', A.step > 0 && A.step !== k && !(A.step === k + 1)); });
}
function visible() { const p = document.querySelector('.pane[data-p="integ"]'); return p && !p.classList.contains('hide'); }
export function render() {
  if (!visible()) return;
  [1, 2, 3, 4].forEach((k) => { P[k].resize(); P[k].render(); });
  worked();
}
export function refreshInteg() {
  if (alt && A.R && A.R.ok) computeAlt(alt.pct); else alt = null;
  if (!visible()) return;
  stepUI(); links(); advanced(); render();
}
export function integCursor() { if (visible()) render(); }
// One tall PNG with the four panels.
export function snapshotInteg(w) {
  const hs = [190, 190, 190, 210], c = document.createElement('canvas'), sc = 2;
  c.width = w * sc; c.height = hs.reduce((a, b) => a + b, 0) * sc;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  let y = 0;
  [1, 2, 3, 4].forEach((k, j) => { const sub = P[k].snapshot(w, hs[j], sc); ctx.drawImage(sub, 0, y * sc); y += hs[j]; });
  return c;
}
