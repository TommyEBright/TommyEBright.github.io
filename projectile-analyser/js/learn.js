// Learn: five picture-first steps, all on the same free throw. The picture does the teaching; the caption is a
// few plain sentences; the equations and worked numbers sit behind "Show me the maths".
// Colours never change: forwards (horizontal) orange, upwards (vertical) purple, the ball's actual direction blue,
// gravity red.
import { G, rad, deg, fromPolar, pos, tAtHeight, minSpeedToTarget, fitFlight } from './maths.js?v=1.2.0';
import { panel, line, dots, arrow, label, rightMark, arc, fmt, COL } from './plot.js?v=1.2.0';

const C = { v: '#1d4ed8', fwd: '#d97706', up: '#7c3aed', g: '#dc2626', ghost: '#cbd5e1', ball: '#e2701e' };
const REL = { x: 0.35, y: 2.10 }, HOOP = { x: 4.225, y: 3.05 }, RIM_R = 0.2286, BALL_R = 0.119;
const L = { play: true, t0: performance.now(), tt: 0, sv: 7.0, sth: 52, gv: 6.6, gth: 45, gh: 2.10, tries: [], noise: 6, seed: 1, P: null };
let app;

// ---------- HTML helpers ----------
const big = (html) => '<div class="lead">' + html + '</div>';
const maths = (html) => '<details class="maths"><summary>Show me the maths</summary><div class="mb">' + html + '</div></details>';
const eqn = (h) => '<p class="eqn">' + h + '</p>';
const v = (s) => '<var>' + s + '</var>';
const sub = (a, b) => v(a) + '<sub>' + b + '</sub>';
const key = (rows) => '<dl class="key">' + rows.map(([a, b]) => '<dt>' + a + '</dt><dd>' + b + '</dd>').join('') + '</dl>';
function setNums(id, html) { const el = document.getElementById(id); if (el && el._h !== html) { el.innerHTML = html; el._h = html; } }
function slider(k, lab, min, max, step, unit) { const d = String(step).includes('.') ? String(step).split('.')[1].length : 0; return '<div class="slider"><label for="s_' + k + '">' + lab + '</label><input type="range" id="s_' + k + '" data-k="' + k + '" data-u="' + unit + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + L[k] + '"><b id="o_' + k + '">' + (+L[k]).toFixed(d) + ' ' + unit + '</b></div>'; }
function wireCommon() {
  document.querySelectorAll('input[data-k]').forEach((el) => {
    el.addEventListener('input', () => { const k = el.dataset.k, d = el.step.includes('.') ? el.step.split('.')[1].length : 0; L[k] = +el.value; document.getElementById('o_' + k).textContent = (+el.value).toFixed(d) + ' ' + el.dataset.u; app.redraw(); });
  });
  document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => { ACT[b.dataset.act](); if (b.dataset.act !== 'analyse') app.render(); }));
}
const ACT = {
  play: () => { L.play = !L.play; if (L.play) L.t0 = performance.now() - L.tt * 1000; },
  replay: () => { L.play = true; L.t0 = performance.now(); L.tt = 0; },
  reseed: () => { L.seed++; L.play = true; L.t0 = performance.now(); L.tt = 0; },
  clearTries: () => { L.tries = []; },
  analyse: () => { app.setMode('analyse'); },
};

// ---------- the court ----------
function court(ctx, w, h, view) {
  const P = L.P = panel(ctx, { rect: { x: 0, y: 0, w, h }, x: view ? view.x : [-0.9, 5.3], y: view ? view.y : [-0.15, 4.3], equal: true, xl: 'Distance from the free-throw line (m)', yl: 'Height (m)' });
  ctx.save(); ctx.beginPath(); ctx.rect(P.r.L, P.r.T, P.r.R - P.r.L, P.r.B - P.r.T); ctx.clip();
  ctx.fillStyle = '#eef2f6'; ctx.fillRect(P.r.L, P.r.T, P.r.R - P.r.L, P.Y(0) - P.r.T);
  ctx.fillStyle = '#d9b48a'; ctx.fillRect(P.r.L, P.Y(0), P.r.R - P.r.L, P.r.B - P.Y(0));
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(P.X(0), P.Y(0)); ctx.lineTo(P.X(0), P.Y(0) + 8); ctx.stroke();
  // backboard, post and rim
  ctx.fillStyle = '#64748b'; ctx.fillRect(P.X(4.6), P.Y(3.95), Math.max(3, P.X(4.64) - P.X(4.6)), P.Y(2.9) - P.Y(3.95));
  ctx.fillRect(P.X(4.64), P.Y(3.45), P.X(5.0) - P.X(4.64), Math.max(3, P.Y(3.4) - P.Y(3.45))); ctx.fillRect(P.X(4.95), P.Y(3.45), Math.max(4, P.X(5.03) - P.X(4.95)), P.Y(0) - P.Y(3.45));
  ctx.strokeStyle = '#ea580c'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(P.X(HOOP.x - RIM_R), P.Y(HOOP.y)); ctx.lineTo(P.X(4.6), P.Y(HOOP.y)); ctx.stroke();
  ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1.5; for (let k = 0; k <= 4; k++) { const a = HOOP.x - RIM_R + k * RIM_R / 2; ctx.beginPath(); ctx.moveTo(P.X(a), P.Y(HOOP.y)); ctx.lineTo(P.X(HOOP.x - 0.1 + k * 0.05), P.Y(HOOP.y - 0.4)); ctx.stroke(); }
  // the shooter
  const px = (x, y) => [P.X(x), P.Y(y)], ft = px(-0.15, 0), kn = px(-0.1, 0.5), hip = px(-0.15, 0.98), sh = px(-0.1, 1.48), hd = px(-0.08, 1.7);
  ctx.strokeStyle = '#334155'; ctx.lineWidth = Math.max(4, P.X(0.09) - P.X(0)); ctx.beginPath(); ctx.moveTo(...ft); ctx.lineTo(...kn); ctx.lineTo(...hip); ctx.lineTo(...sh); ctx.stroke();
  ctx.lineWidth = Math.max(3, P.X(0.06) - P.X(0)); ctx.beginPath(); ctx.moveTo(...sh); ctx.lineTo(...px(0.12, 1.62)); ctx.lineTo(...px(REL.x - 0.03, REL.y - 0.1)); ctx.stroke();
  ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.arc(hd[0], hd[1], P.X(0.11) - P.X(0), 0, 2 * Math.PI); ctx.fill();
  ctx.restore();
  return P;
}
function ball(ctx, P, x, y, a = 1) {
  const r = Math.max(5, P.X(BALL_R) - P.X(0)); ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = C.ball; ctx.strokeStyle = '#7c2d12'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(P.X(x), P.Y(y), r, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(P.X(x) - r, P.Y(y)); ctx.lineTo(P.X(x) + r, P.Y(y)); ctx.moveTo(P.X(x), P.Y(y) - r); ctx.lineTo(P.X(x), P.Y(y) + r); ctx.stroke(); ctx.restore();
}
function path(Pp, t1, n = 100) { const xs = [], ys = []; for (let i = 0; i <= n; i++) { const p = pos(Pp, t1 * i / n); xs.push(p[0]); ys.push(p[1]); } return [xs, ys]; }
// stop the ball before it reaches the backboard or drops far below the rim
function shotEnd(Pp) { let t = tAtHeight(Pp, HOOP.y - 0.45); if (!Number.isFinite(t)) t = tAtHeight(Pp, 0); const tb = Pp.vx > 0 ? (4.5 - Pp.x0) / Pp.vx : Infinity; return Math.min(t, tb); }
function clock(ts, loop) { if (L.play) L.tt = ((ts - L.t0) / 1000) % loop; return L.tt; }
function verdict(Pp) {
  const t = tAtHeight(Pp, HOOP.y, true); if (!Number.isFinite(t)) return { txt: 'Never reaches the hoop', cls: 'bad', miss: NaN };
  const x = Pp.x0 + Pp.vx * t, miss = x - HOOP.x, entry = deg(Math.atan2(G * t - Pp.vy, Pp.vx)), room = entry > 0 ? RIM_R - BALL_R / Math.sin(rad(entry)) : -1;
  if (room <= 0) return { txt: 'Too flat to drop in', cls: 'bad', miss, entry, room };
  if (Math.abs(miss) <= room) return { txt: 'In!', cls: 'good', miss, entry, room };
  return { txt: (miss > 0 ? 'Long' : 'Short') + ' by ' + Math.round(Math.abs(miss) * 100) + ' cm', cls: 'bad', miss, entry, room };
}

// ---------- the steps ----------
const STEPS = [
  {
    key: 'gravity', short: 'Only gravity', title: 'Once it is thrown, only gravity acts', figTitle: () => 'Watch the arrows on the ball', hint: () => '',
    tools: () => '<button type="button" class="btn small" data-act="play">' + (L.play ? 'Pause' : 'Play') + '</button><span class="legend"><span><i style="border-color:' + C.v + '"></i>Where the ball is heading</span><span><i style="border-color:' + C.g + '"></i>Gravity</span></span>',
    body: () => big('<p>Once the ball leaves the hand, <b>nothing pushes it forwards</b>. The only thing acting on it is <b style="color:' + C.g + '">gravity</b>, pulling it down.</p><p>Watch the <b style="color:' + C.v + '">blue arrow</b>: gravity keeps bending it downwards, which is why the path curves.</p><p>So the whole flight is decided at the moment of release by just three things: <b>speed</b>, <b>angle</b> and <b>height</b>.</p>')
      + maths('<p>This works for anything in the air with only gravity acting: a ball or implement once released, or an athlete&rsquo;s <b>centre of mass</b> once their feet leave the ground (e.g. a broad jump).</p><p>We ignore air resistance. That is fine for heavy, fairly slow things (a basketball, a shot, a jumping body) but not for light or fast ones (e.g. a shuttlecock or a golf ball).</p>'),
    q: { q: 'Halfway up, which forces act on the ball?', o: ['Gravity only', 'Gravity and the throw', 'The throw only'], a: 0, why: 'The hand stopped pushing at release. After that only gravity acts, so the blue arrow keeps turning down while the red arrow never changes.' },
    animate: () => L.play,
    draw(ctx, w, h, ts) {
      const Pp = fromPolar(6.98, 52, REL.y, REL.x), T = shotEnd(Pp), t = Math.min(clock(ts, T + 1.0), T), P = court(ctx, w, h);
      const [xs, ys] = path(Pp, t); line(ctx, P, xs, ys, C.ghost, 2, [6, 5]);
      const p = pos(Pp, t), X = P.X(p[0]), Y = P.Y(p[1]), sc = (P.X(1) - P.X(0)) * 0.13, vy = Pp.vy - G * t;
      ball(ctx, P, p[0], p[1]);
      arrow(ctx, X, Y, X + Pp.vx * sc, Y - vy * sc, C.v, 4, 14); arrow(ctx, X, Y, X, Y + 60, C.g, 4, 14);
      label(ctx, 'gravity', X + 10, Y + 55, C.g, { align: 'left', size: 13 });
    },
  },
  {
    key: 'split', short: 'Split the arrow', title: 'Split the arrow into a triangle', figTitle: () => 'The release, close up', hint: () => 'Change the speed and angle. Watch the triangle.',
    tools: () => slider('sv', 'Speed', 3, 10, 0.1, 'm/s') + slider('sth', 'Angle', 5, 85, 1, '°'),
    body: () => big('<p>Every throw has a <b style="color:' + C.fwd + '">forwards part</b> and an <b style="color:' + C.up + '">upwards part</b>. Put them end to end and they make a <b>right-angled triangle</b>, with the ball&rsquo;s actual direction (<b style="color:' + C.v + '">blue</b>) as the long side.</p><p>Make the angle steeper: the upwards part grows and the forwards part shrinks. Throw harder: the whole triangle gets bigger.</p>')
      + '<div class="tiles"><div class="tile" style="border-color:' + C.v + '"><span>Speed</span><b id="tv"></b></div><div class="tile" style="border-color:' + C.fwd + '"><span>Forwards</span><b id="tf"></b></div><div class="tile" style="border-color:' + C.up + '"><span>Upwards</span><b id="tu"></b></div></div>'
      + maths('<p>The long side is the <b>hypotenuse</b>. From the release angle &theta;, the forwards side is the <b>adjacent</b> and the upwards side is the <b>opposite</b>.</p>'
        + '<p><b>Splitting it</b> (SOH CAH TOA):</p>' + eqn(sub('v', 'x') + ' = ' + v('v') + ' cos &theta; &nbsp;&nbsp; ' + sub('v', 'y') + ' = ' + v('v') + ' sin &theta;')
        + '<p><b>Putting it back together</b> (Pythagoras and tan):</p>' + eqn(v('v') + ' = &radic;(' + sub('v', 'x') + '<sup>2</sup> + ' + sub('v', 'y') + '<sup>2</sup>) &nbsp;&nbsp; &theta; = tan<sup>&minus;1</sup>(' + sub('v', 'y') + ' &divide; ' + sub('v', 'x') + ')')
        + key([[sub('v', 'x'), 'forwards speed (m/s)'], [sub('v', 'y'), 'upwards speed (m/s)'], ['v', 'release speed (m/s)'], ['&theta;', 'release angle from the ground (&deg;)']])
        + '<div id="mnums"></div><p class="small">Calculator in <b>degrees</b> (DEG), not radians. In Excel: <code>=DEGREES(ATAN2(vx, vy))</code>, horizontal first.</p>'),
    q: { q: 'A ball leaves the hand at 4 m/s forwards and 3 m/s upwards. How fast is it going?', o: ['7 m/s', '5 m/s', '1 m/s'], a: 1, why: '√(4² + 3²) = √25 = 5 m/s. You cannot just add them (7), because they point in different directions.' },
    draw(ctx, w, h) {
      const Pp = fromPolar(L.sv, L.sth, REL.y, REL.x), P = court(ctx, w, h, { x: [-0.5, 3.6], y: [1.0, 4.2] });
      const [xs, ys] = path(Pp, shotEnd(Pp)); line(ctx, P, xs, ys, C.ghost, 2, [6, 5]);
      const s = 0.3, O = [P.X(REL.x), P.Y(REL.y)], Hh = [P.X(REL.x + Pp.vx * s), O[1]], T = [Hh[0], P.Y(REL.y + Pp.vy * s)];
      ctx.save(); ctx.fillStyle = 'rgba(29,78,216,.08)'; ctx.beginPath(); ctx.moveTo(...O); ctx.lineTo(...Hh); ctx.lineTo(...T); ctx.closePath(); ctx.fill(); ctx.restore();
      arrow(ctx, O[0], O[1], Hh[0], Hh[1], C.fwd, 5, 15); arrow(ctx, Hh[0], Hh[1], T[0], T[1], C.up, 5, 15); arrow(ctx, O[0], O[1], T[0], T[1], C.v, 6, 18);
      rightMark(ctx, Hh[0], Hh[1], [-1, 0], [0, -1], 14);
      arc(ctx, O[0], O[1], 40, 0, -rad(L.sth), '#475569'); label(ctx, L.sth + '°', O[0] + 58 * Math.cos(-rad(L.sth) / 2), O[1] + 58 * Math.sin(-rad(L.sth) / 2), '#475569', { size: 15 });
      ball(ctx, P, REL.x, REL.y);
      label(ctx, 'forwards ' + fmt(Pp.vx, 1) + ' m/s', (O[0] + Hh[0]) / 2, O[1] + 20, C.fwd, { size: 15 });
      label(ctx, 'upwards ' + fmt(Pp.vy, 1) + ' m/s', Hh[0] + 10, (Hh[1] + T[1]) / 2, C.up, { align: 'left', size: 15 });
      label(ctx, fmt(L.sv, 1) + ' m/s', (O[0] + T[0]) / 2 - 12, (O[1] + T[1]) / 2 - 16, C.v, { align: 'right', size: 16 });
      setNums('tv', fmt(L.sv, 1) + ' m/s'); setNums('tf', fmt(Pp.vx, 1) + ' m/s'); setNums('tu', fmt(Pp.vy, 1) + ' m/s');
      setNums('mnums', '<div class="calc">' + sub('v', 'x') + ' = ' + fmt(L.sv, 1) + ' &times; cos ' + L.sth + '&deg; = <b>' + fmt(Pp.vx, 2) + ' m/s</b></div><div class="calc">' + sub('v', 'y') + ' = ' + fmt(L.sv, 1) + ' &times; sin ' + L.sth + '&deg; = <b>' + fmt(Pp.vy, 2) + ' m/s</b></div><div class="calc">v = &radic;(' + fmt(Pp.vx, 2) + '<sup>2</sup> + ' + fmt(Pp.vy, 2) + '<sup>2</sup>) = <b>' + fmt(L.sv, 2) + ' m/s</b></div><div class="calc">&theta; = tan<sup>&minus;1</sup>(' + fmt(Pp.vy, 2) + ' &divide; ' + fmt(Pp.vx, 2) + ') = <b>' + L.sth + '&deg;</b></div>');
    },
  },
  {
    key: 'strobe', short: 'Forwards and upwards', title: 'Forwards stays the same. Upwards changes.', figTitle: () => 'The ball every 0.1 s', hint: () => '',
    tools: () => '<button type="button" class="btn small" data-act="replay">Replay</button><span class="legend"><span><i style="border-color:' + C.fwd + '"></i>Forwards speed</span><span><i style="border-color:' + C.up + '"></i>Upwards speed</span></span>',
    body: () => big('<p>Here is the ball every tenth of a second.</p><p>The <b style="color:' + C.fwd + '">orange arrows</b> never change: nothing pushes the ball forwards or slows it down, so it covers the <b>same distance forwards</b> every tenth of a second.</p><p>The <b style="color:' + C.up + '">purple arrows</b> shrink as gravity slows the ball, vanish at the top, then grow pointing <b>down</b>.</p><p>Forwards and upwards don&rsquo;t affect each other, so we can work each one out on its own.</p>')
      + maths('<p><b>Forwards:</b> no force, so the forwards speed never changes.</p>' + eqn(v('x') + ' = ' + sub('x', '0') + ' + ' + sub('v', 'x') + v('t')) + '<p><b>Upwards:</b> gravity takes 9.81 m/s off the upwards speed every second.</p>' + eqn(sub('v', 'y') + '(' + v('t') + ') = ' + sub('v', 'y') + ' &minus; ' + v('g') + v('t') + ' &nbsp;&nbsp; ' + v('y') + ' = ' + sub('y', '0') + ' + ' + sub('v', 'y') + v('t') + ' &minus; &frac12;' + v('g') + v('t') + '<sup>2</sup>')
        + '<p><b>Time to the top</b> (upwards speed reaches zero) and how much higher it gets:</p>' + eqn(sub('t', 'peak') + ' = ' + sub('v', 'y') + ' &divide; ' + v('g') + ' &nbsp;&nbsp; rise = ' + sub('v', 'y') + '<sup>2</sup> &divide; 2' + v('g'))
        + '<div class="calc">t<sub>peak</sub> = 5.50 &divide; 9.81 = <b>0.56 s</b>; rise = 5.50<sup>2</sup> &divide; 19.62 = <b>1.54 m</b>, so the peak is 2.10 + 1.54 = <b>3.64 m</b> up.</div><p class="small">Distance travelled is just forwards speed &times; time in the air, because the forwards speed never changes.</p>'),
    q: { q: 'At the very top of the flight, what is the upwards speed?', o: ['Zero', 'The same as at release', 'As fast as the forwards speed'], a: 0, why: 'At the top the ball has stopped going up and not yet started coming down, so its upwards speed is zero. It is still moving forwards, at the same speed as ever.' },
    animate: () => L.play && L.tt < 1.2,
    draw(ctx, w, h, ts) {
      const Pp = fromPolar(6.98, 52, REL.y, REL.x), T = shotEnd(Pp), t = Math.min(clock(ts, 99), T), P = court(ctx, w, h);
      const sc = (P.X(1) - P.X(0)) * 0.085;
      for (let k = 0; k * 0.1 <= t + 1e-9; k++) {
        const tk = k * 0.1, p = pos(Pp, tk), X = P.X(p[0]), Y = P.Y(p[1]), vy = Pp.vy - G * tk;
        ball(ctx, P, p[0], p[1], 0.85);
        arrow(ctx, X, Y, X + Pp.vx * sc, Y, C.fwd, 3, 9);
        if (Math.abs(vy) > 0.15) arrow(ctx, X, Y, X, Y - vy * sc, C.up, 3, 9);
        else label(ctx, 'top: upwards = 0', X, Y - 24, C.up, { size: 12 });
      }
    },
  },
  {
    key: 'game', short: 'Make the basket', title: 'Make the basket', figTitle: () => 'Find a shot that goes in', hint: () => 'Your last few tries stay on screen in grey.',
    tools: () => slider('gv', 'Speed', 5, 9, 0.05, 'm/s') + slider('gth', 'Angle', 25, 75, 1, '°') + slider('gh', 'Release height', 1.6, 2.6, 0.05, 'm') + '<button type="button" class="btn small ghost" data-act="clearTries">Clear tries</button>',
    body: () => big('<p>Change the <b>speed</b>, <b>angle</b> and <b>height</b> until the ball drops in.</p><p>Then try this: find a shot that goes in, and nudge the <b>angle</b> by a few degrees. Then nudge the <b>speed</b> a little. Which one matters more?</p>')
      + '<div id="gameOut"></div>'
      + maths('<p>For a target above the release point, there is one angle that needs the <b>least speed</b>:</p>' + eqn('tan &theta; = (' + v('&Delta;y') + ' + &radic;(' + v('&Delta;x') + '<sup>2</sup> + ' + v('&Delta;y') + '<sup>2</sup>)) &divide; ' + v('&Delta;x')) + key([['&Delta;x', 'how far ahead the hoop is (m)'], ['&Delta;y', 'how far above the release the hoop is (m)']]) + '<div id="gameMaths"></div>'
        + '<p>Near that angle, a small angle error barely changes where the ball goes, but a small speed error does. So <b>consistent speed</b> makes a good free throw. Steeper shots also drop into the hoop more steeply, which gives more room for error.</p>'
        + '<p><b>Throwing for distance</b> is different. 45&deg; goes furthest only when release and landing are at the same height. Release from above the landing (a shot put, a jump) and the best angle drops below 45&deg;, and athletes produce less speed at steep angles anyway. So shot putters release at about 35 to 38&deg; and long jumpers take off at about 18 to 25&deg;.</p>'),
    q: { q: 'A shot putter releases 2 m above the ground. With the same speed, the best angle is...', o: ['Exactly 45°', 'A bit below 45°', 'A bit above 45°'], a: 1, why: 'Releasing above the landing height pulls the best angle below 45°, and real athletes lose speed at steeper angles, so in practice it is lower still.' },
    wire: () => { document.querySelectorAll('input[data-k]').forEach((el) => el.addEventListener('change', () => { L.tries.push([L.gv, L.gth, L.gh]); if (L.tries.length > 6) L.tries.shift(); app.redraw(); })); },
    draw(ctx, w, h) {
      const P = court(ctx, w, h);
      L.tries.forEach(([a, b, c]) => { const Q = fromPolar(a, b, c, REL.x), [xs, ys] = path(Q, shotEnd(Q)); line(ctx, P, xs, ys, '#cbd5e1', 2); });
      const Pp = fromPolar(L.gv, L.gth, L.gh, REL.x), V = verdict(Pp), [xs, ys] = path(Pp, shotEnd(Pp));
      line(ctx, P, xs, ys, V.cls === 'good' ? '#16a34a' : C.v, 3.5);
      ball(ctx, P, REL.x, L.gh);
      const m = minSpeedToTarget(HOOP.x - REL.x, HOOP.y - L.gh);
      label(ctx, V.txt, P.X(HOOP.x) - 10, P.Y(HOOP.y + 0.75), V.cls === 'good' ? '#16a34a' : COL.bad, { size: 22, align: 'right' });
      const tip = (dv, dth) => { const W = verdict(fromPolar(L.gv + dv, L.gth + dth, L.gh, REL.x)); return Number.isFinite(W.miss) && Number.isFinite(V.miss) ? Math.abs(W.miss - V.miss) * 100 : NaN; };
      setNums('gameOut', '<div class="tiles"><div class="tile"><span>Result</span><b style="color:' + (V.cls === 'good' ? '#16a34a' : 'var(--bad)') + '">' + V.txt + '</b></div><div class="tile"><span>Entry angle</span><b>' + (Number.isFinite(V.entry) ? fmt(V.entry, 0) + '&deg;' : '&ndash;') + '</b></div><div class="tile"><span>Room for error</span><b>' + (V.room > 0 ? '&plusmn;' + fmt(V.room * 100, 0) + ' cm' : 'none') + '</b></div></div>'
        + (Number.isFinite(tip(0.1, 0)) ? '<p class="small">From here, <b>+0.1 m/s</b> of speed moves the ball <b>' + fmt(tip(0.1, 0), 0) + ' cm</b>; <b>+1&deg;</b> of angle moves it <b>' + fmt(tip(0, 1), 1) + ' cm</b>.</p>' : ''));
      setNums('gameMaths', '<div class="calc">From ' + fmt(L.gh, 2) + ' m: &Delta;x = ' + fmt(HOOP.x - REL.x, 2) + ' m, &Delta;y = ' + fmt(HOOP.y - L.gh, 2) + ' m &rarr; least-speed angle <b>' + fmt(m.th, 1) + '&deg;</b> at <b>' + fmt(m.v, 2) + ' m/s</b></div>');
    },
  },
  {
    key: 'video', short: 'From video', title: 'From video to numbers', figTitle: () => 'Clicking the ball in each frame', hint: () => 'Each dot is one click. The curve is the tool’s best fit through all of them.',
    tools: () => '<button type="button" class="btn small" data-act="reseed">Click again</button>' + slider('noise', 'Clicking error', 0, 25, 1, 'mm'),
    body: () => big('<p>In the Analyse part you&rsquo;ll <b>click the ball</b> in each frame of a video. Every click is a little off, so the dots wobble.</p><p>The tool draws the <b>best curve through all the dots</b>, because it knows the flight must be that shape. Then it reads the <b>triangle at release</b> off the curve, giving you the speed, angle and height.</p><p>Turn up the clicking error and watch: the dots get messy, but the curve and the numbers barely move.</p>')
      + '<div id="vidOut"></div><p><button type="button" class="btn accent" data-act="analyse">Try it yourself &rarr;</button></p>'
      + maths('<p>The tool fits, by least squares, a straight line to the forwards position and a parabola to the height, using every flight frame at once, with time measured from release:</p>' + eqn(v('x') + ' = ' + sub('x', '0') + ' + ' + sub('v', 'x') + v('t') + ' &nbsp;&nbsp; ' + v('y') + ' = ' + sub('y', '0') + ' + ' + sub('v', 'y') + v('t') + ' &minus; &frac12;' + v('g') + v('t') + '<sup>2</sup>')
        + '<p>Working velocity out from just two frames (distance &divide; time) turns a few millimetres of clicking error into a big velocity error, because the time between frames is tiny. Fitting all the frames lets the errors cancel out.</p><p><b>Gravity check:</b> fit the curve again letting the data choose <em>g</em>. If the frame rate, scale and frames are right, it comes out close to 9.81 m/s&sup2;. If not, something is wrong. <span id="gchk"></span></p>'),
    q: { q: 'Why does the tool fit a curve rather than use just two frames?', o: ['It looks nicer', 'Clicking errors cancel out across many frames', 'Two frames are not allowed'], a: 1, why: 'Each click is a little off. Spread over every frame, the errors cancel; from just two frames close together, a tiny error becomes a large velocity error.' },
    animate: () => L.play && L.tt < 2.6,
    draw(ctx, w, h, ts) {
      const Pp = fromPolar(6.98, 52, REL.y, REL.x), T = tAtHeight(Pp, 2.65), dt = 1 / 30, P = court(ctx, w, h), r = rng(L.seed * 131 + 7), nz = L.noise / 1000;
      const t = [], x = [], y = []; for (let k = 0; k * dt <= T; k++) { const p = pos(Pp, k * dt); t.push(k * dt); x.push(p[0] + gss(r) * nz); y.push(p[1] + gss(r) * nz); }
      const tt = clock(ts, 99), shown = Math.min(t.length, Math.floor(tt / 1.6 * t.length) + 1);
      dots(ctx, P, x.slice(0, shown), y.slice(0, shown), '#0f172a', 4);
      if (shown < t.length) { ball(ctx, P, x[shown - 1], y[shown - 1]); return; }
      const F = fitFlight(t, x, y), Q = { x0: F.x0, y0: F.y0, vx: F.vx, vy: F.vy }, [xs, ys] = path(Q, T * 1.05);
      line(ctx, P, xs, ys, C.v, 3);
      const s = 0.22, O = [P.X(F.x0), P.Y(F.y0)], Hh = [P.X(F.x0 + F.vx * s), O[1]], Tt = [Hh[0], P.Y(F.y0 + F.vy * s)];
      arrow(ctx, O[0], O[1], Hh[0], Hh[1], C.fwd, 4); arrow(ctx, Hh[0], Hh[1], Tt[0], Tt[1], C.up, 4); arrow(ctx, O[0], O[1], Tt[0], Tt[1], C.v, 5);
      const sp = Math.hypot(F.vx, F.vy), an = deg(Math.atan2(F.vy, F.vx));
      label(ctx, fmt(sp, 2) + ' m/s at ' + fmt(an, 1) + '° from ' + fmt(F.y0, 2) + ' m', P.X(1.5), P.Y(4.05), C.v, { size: 16 });
      setNums('vidOut', '<div class="tiles"><div class="tile"><span>Speed</span><b>' + fmt(sp, 2) + ' m/s</b></div><div class="tile"><span>Angle</span><b>' + fmt(an, 1) + '&deg;</b></div><div class="tile"><span>Height</span><b>' + fmt(F.y0, 2) + ' m</b></div></div><p class="small">The true release was 6.98 m/s at 52.0&deg; from 2.10 m.</p>');
      setNums('gchk', 'Here: <b>' + fmt(F.gFree, 2) + ' m/s&sup2;</b>.');
    },
  },
];
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gss(r) { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }

export const LEARN = {
  init(a) {
    app = a;
    STEPS.forEach((s) => {
      const w = s.wire; s.wire = () => { wireCommon(); if (w) w(); };
      s.enter = () => { L.play = true; L.t0 = performance.now(); L.tt = 0; };
    });
  },
  steps: () => STEPS,
};
