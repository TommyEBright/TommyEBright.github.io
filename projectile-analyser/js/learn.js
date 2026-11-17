// Learn: from scalars and vectors to the flight equations, one idea per step, every figure interactive.
// Colours stay the same all the way through: resultant (hypotenuse) blue, horizontal (adjacent) orange,
// vertical (opposite) purple, gravity red.
import { G, rad, deg, fromPolar, pos, tAtHeight, optimumAngle, range, minSpeedToTarget, speedForTarget, fitFlight } from './maths.js?v=1.0.0';
import { panel, line, dots, arrow, label, rightMark, arc, fmt, sgn, COL } from './plot.js?v=1.0.0';

const C = { hyp: '#1d4ed8', adj: '#d97706', opp: '#7c3aed', g: '#dc2626', ghost: '#cbd5e1' };
const L = { vec: [5.5, 4.3], tri: [4, 3], other: false, ang: 35, rv: [4.3, 5.5], v: 9, th: 40, h: 1.5, bv: 12, bh: 2.1, bmode: 'dist', tdx: 3.9, tdy: 0.95, noise: 6, fpsL: 60, seed: 1, play: true, showV: true, P: null, drag: null, t0: performance.now() };
let app;

// ---------- small HTML helpers ----------
const layer = (cls, title, html) => '<div class="layer ' + cls + '"><h3>' + title + '</h3>' + html + '</div>';
const eqn = (h) => '<p class="eqn">' + h + '</p>';
const keys = (rows) => '<dl class="key">' + rows.map(([a, b]) => '<dt>' + a + '</dt><dd>' + b + '</dd>').join('') + '</dl>';
const v = (s) => '<var>' + s + '</var>';
const sub = (a, b) => v(a) + '<sub>' + b + '</sub>';
const NUMS = (extra = '') => layer('nums', 'Your numbers', '<div id="nums"></div>' + extra);
function setNums(html) { const el = document.getElementById('nums'); if (el && el._h !== html) { el.innerHTML = html; el._h = html; } }
function slider(k, lab, min, max, step, unit) { return '<div class="slider"><label for="s_' + k + '">' + lab + '</label><input type="range" id="s_' + k + '" data-k="' + k + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + L[k] + '"><b id="o_' + k + '">' + (+L[k]).toFixed(String(step).includes('.') ? String(step).split('.')[1].length : 0) + ' ' + unit + '</b></div>'; }
function wireSliders() {
  document.querySelectorAll('input[data-k]').forEach((el) => el.addEventListener('input', () => {
    const k = el.dataset.k, st = el.step; L[k] = +el.value;
    const d = st.includes('.') ? st.split('.')[1].length : 0, o = document.getElementById('o_' + k); o.textContent = (+el.value).toFixed(d) + ' ' + o.textContent.split(' ').slice(1).join(' ');
    app.redraw();
  }));
  document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => { ACT[b.dataset.act](b); app.render(); }));
}
const ACT = {
  play: () => { L.play = !L.play; if (L.play) L.t0 = performance.now(); },
  other: () => { L.other = !L.other; },
  dist: () => { L.bmode = 'dist'; }, target: () => { L.bmode = 'target'; },
  reseed: () => { L.seed++; },
  showV: () => { L.showV = !L.showV; },
};
function near(px, py, wx, wy, r = 22) { return L.P && Math.hypot(L.P.X(wx) - px, L.P.Y(wy) - py) < r; }
function split(w, h, frac = 0.58) { return w >= 760 ? [{ x: 0, y: 0, w: w * frac, h }, { x: w * frac, y: 0, w: w * (1 - frac), h }] : [{ x: 0, y: 0, w, h: h * 0.6 }, { x: 0, y: h * 0.6, w, h: h * 0.4 }]; }
function ground(ctx, P, y = 0) { ctx.save(); ctx.fillStyle = '#e7dccb'; const a = P.Y(y); ctx.fillRect(P.r.L, a, P.r.R - P.r.L, P.r.B - a); ctx.strokeStyle = '#a8916f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(P.r.L, a); ctx.lineTo(P.r.R, a); ctx.stroke(); ctx.restore(); }
function pathXY(Pp, t1, n = 120) { const xs = [], ys = []; for (let i = 0; i <= n; i++) { const p = pos(Pp, t1 * i / n); xs.push(p[0]); ys.push(p[1]); } return [xs, ys]; }

// ---------- the steps ----------
const STEPS = [
  {
    key: 'what', short: 'Projectiles', title: 'What is a projectile?', figTitle: () => 'A shot in flight', hint: () => 'The arrows show what acts on the shot at each moment.',
    tools: () => '<button type="button" class="btn small" data-act="play">' + (L.play ? 'Pause' : 'Play') + '</button><label><input type="checkbox" id="cbV"' + (L.showV ? ' checked' : '') + '> Show velocity</label><span class="legend"><span><i style="border-color:' + C.hyp + '"></i>Velocity</span><span><i style="border-color:' + C.g + '"></i>Weight (gravity)</span></span>',
    body: () => layer('words', 'In plain words', '<p>A <strong>projectile</strong> is anything moving through the air with nothing pushing or pulling on it except <strong>gravity</strong>. Once a ball leaves the hand, the hand can no longer push it. There is no &ldquo;forward force&rdquo; carrying it along.</p><p>In sport that means balls and implements once released (e.g. a free throw, a shot put, a goal kick), and also <strong>the athlete&rsquo;s own centre of mass</strong> once their feet leave the ground (e.g. a broad jump, a long jump, a dive).</p>')
      + layer('why', 'Why it matters', '<p>Once it is in the air, the path is <strong>already decided</strong>. Only three things set it, all at the moment of release (or take-off):</p><ol><li>the <strong>speed</strong> of release,</li><li>the <strong>angle</strong> of release,</li><li>the <strong>height</strong> of release.</li></ol><p>So when we analyse a throw or a jump, those three numbers are what we are after. The rest of this part shows you how to get them, and the maths you need to do it.</p>')
      + layer('words', 'One assumption', '<p>We ignore <strong>air resistance</strong>. That is fine for heavy, fairly slow objects (a shot, a basketball over a few metres, a jumping body) but not for light or fast ones (e.g. a shuttlecock, a golf ball, a javelin).</p>'),
    q: { q: 'Halfway up its flight, which forces act on the shot (ignoring air resistance)?', o: ['Gravity only', 'Gravity and the throwing force', 'The throwing force only'], a: 0, why: 'The hand stopped pushing at release. From then on only gravity (its weight) acts, which is why the velocity arrow keeps turning downwards while the weight arrow never changes.' },
    animate: () => L.play,
    wire: () => { const cb = document.getElementById('cbV'); if (cb) cb.addEventListener('change', () => { L.showV = cb.checked; app.redraw(); }); },
    draw(ctx, w, h, ts) {
      const Pp = fromPolar(9, 40, 2.0, 0.6), T = tAtHeight(Pp, 0), loop = T + 0.8;
      if (L.play) L.tt = ((ts - L.t0) / 1000) % loop; else if (L.tt === undefined) L.tt = T * 0.45;
      const t = Math.min(L.tt || 0, T);
      const P = L.P = panel(ctx, { rect: { x: 0, y: 0, w, h }, x: [-0.2, 10.4], y: [-0.4, 5], equal: true, xl: 'Horizontal position (m)', yl: 'Height (m)' });
      ground(ctx, P);
      const [xs, ys] = pathXY(Pp, T); line(ctx, P, xs, ys, C.ghost, 2, [6, 5]);
      const tx = [], ty = []; for (let k = 0; k * 0.1 <= t; k++) { const p = pos(Pp, k * 0.1); tx.push(p[0]); ty.push(p[1]); } dots(ctx, P, tx, ty, '#94a3b8', 3);
      const p = pos(Pp, t), vy = Pp.vy - G * t, X = P.X(p[0]), Y = P.Y(p[1]), sc = (P.X(1) - P.X(0)) * 0.22;
      label(ctx, 'release', P.X(0.6), P.Y(2.0) + 18, COL.muted, { size: 12, bold: false });
      ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.arc(X, Y, 9, 0, 2 * Math.PI); ctx.fill();
      if (L.showV) { arrow(ctx, X, Y, X + Pp.vx * sc, Y - vy * sc, C.hyp, 3.5); label(ctx, 'velocity', X + Pp.vx * sc + 6, Y - vy * sc - 10, C.hyp, { align: 'left', size: 12 }); }
      arrow(ctx, X, Y, X, Y + 55, C.g, 3.5); label(ctx, 'weight', X + 8, Y + 50, C.g, { align: 'left', size: 12 });
      if (t >= T) label(ctx, 'landed', X, Y - 22, COL.muted, { size: 12, bold: false });
    },
  },
  {
    key: 'vec', short: 'Vectors', title: 'Scalars and vectors', figTitle: () => 'A velocity vector', hint: () => 'Drag the arrow head.',
    body: () => layer('words', 'In plain words', '<p>A <strong>scalar</strong> has a size only (e.g. a speed of 7 m/s, a mass of 70 kg, a time of 0.8 s).</p><p>A <strong>vector</strong> has a size <em>and</em> a direction (e.g. a velocity of 7 m/s at 52&deg; above horizontal, a force, a displacement). We draw a vector as an <strong>arrow</strong>: its length is the size and it points in the direction.</p><p><strong>Speed</strong> is the size of the velocity vector. Two throws can have the same speed but go to completely different places, because the direction is different.</p>')
      + layer('eq', 'Writing it down', eqn('velocity = (size, direction) = (' + v('v') + ', ' + v('&theta;') + ')') + keys([['v', 'speed: the length of the arrow, in m/s'], ['&theta;', 'theta, the angle of the arrow, measured anticlockwise from the horizontal, in degrees']]))
      + NUMS(),
    q: { q: 'Which of these is a vector?', o: ['Speed', 'Velocity', 'Mass'], a: 1, why: 'Velocity has a direction as well as a size. Speed and mass have a size only, so they are scalars.' },
    down(x, y) { if (!L.P) return false; const p = L.P.inv(x, y); if (p[0] < L.P.x[0] || p[1] < L.P.y[0]) return false; L.vec = snap(p); return true; },
    drag(x, y) { L.vec = snap(L.P.inv(x, y)); }, cursor: (x, y) => (near(x, y, L.vec[0], L.vec[1]) ? 'grab' : 'crosshair'),
    draw(ctx, w, h) {
      const P = L.P = panel(ctx, { rect: { x: 0, y: 0, w, h }, x: [-2, 10], y: [-2, 8], equal: true, xl: 'Horizontal velocity (m/s)', yl: 'Vertical velocity (m/s)' });
      const [a, b] = L.vec, ox = P.X(0), oy = P.Y(0), sp = Math.hypot(a, b), th = deg(Math.atan2(b, a));
      ctx.save(); ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(P.r.R, oy); ctx.stroke(); ctx.restore();
      arc(ctx, ox, oy, 38, 0, -rad(th), '#475569'); label(ctx, 'θ = ' + fmt(th, 1) + '°', ox + 46 * Math.cos(-rad(th) / 2) + 22, oy + 46 * Math.sin(-rad(th) / 2), '#475569', { size: 12 });
      arrow(ctx, ox, oy, P.X(a), P.Y(b), C.hyp, 4, 14);
      ctx.fillStyle = C.hyp; ctx.beginPath(); ctx.arc(P.X(a), P.Y(b), 7, 0, 2 * Math.PI); ctx.fill();
      label(ctx, 'v = ' + fmt(sp, 1) + ' m/s', (ox + P.X(a)) / 2 - 12, (oy + P.Y(b)) / 2 - 16, C.hyp, { align: 'right' });
      setNums('<p>Speed (a scalar): <b>' + fmt(sp, 1) + ' m/s</b>.</p><p>Velocity (a vector): <b>' + fmt(sp, 1) + ' m/s at ' + fmt(th, 1) + '&deg;</b> ' + (th > 90 || th < -90 ? '(pointing backwards)' : th < 0 ? '(below the horizontal: on the way down)' : 'above the horizontal') + '.</p>');
    },
  },
  {
    key: 'tri', short: 'Triangles', title: 'The right-angled triangle', figTitle: () => 'Naming the sides', hint: () => 'Drag the top corner. Use the button to switch angle.',
    tools: () => '<button type="button" class="btn small ghost" data-act="other">Use the ' + (L.other ? 'bottom' : 'top') + ' angle instead</button><span class="legend"><span><i style="border-color:' + C.hyp + '"></i>Hypotenuse</span><span><i style="border-color:' + C.opp + '"></i>Opposite</span><span><i style="border-color:' + C.adj + '"></i>Adjacent</span></span>',
    body: () => layer('words', 'In plain words', '<p>All of the maths in this tool uses one shape: a triangle with one <strong>right angle</strong> (exactly 90&deg;, marked with a small square).</p><ul><li>The <strong>hypotenuse</strong> is the longest side, the one opposite the right angle. It never changes name.</li><li>Pick one of the other two angles and call it &theta; (theta). The side touching &theta; (that is not the hypotenuse) is the <strong>adjacent</strong> (&ldquo;next to&rdquo;).</li><li>The side across from &theta; is the <strong>opposite</strong>.</li></ul><p>Switch the angle with the button and watch the opposite and adjacent swap over.</p>')
      + layer('why', 'Why it matters', '<p>In projectile motion, the release velocity is the hypotenuse, and &theta; is the release angle measured from the ground. So the <strong>horizontal</strong> velocity is the <strong>adjacent</strong> and the <strong>vertical</strong> velocity is the <strong>opposite</strong>. Keep that in your head for the rest of the steps.</p>')
      + layer('words', 'Also worth knowing', '<p>The three angles of any triangle add up to 180&deg;. With 90&deg; taken by the right angle, the other two always add up to 90&deg;.</p>') + NUMS(),
    q: { q: 'If you switch which angle you call θ, which side never changes its name?', o: ['Opposite', 'Adjacent', 'Hypotenuse'], a: 2, why: 'The hypotenuse is defined by the right angle (it is the side across from it), not by θ. The opposite and adjacent depend on which angle you choose.' },
    down(x, y) { const [a, b] = L.tri; if (near(x, y, a, b, 30)) return true; return false; },
    drag(x, y) { const p = L.P.inv(x, y); L.tri = [clamp(Math.round(p[0] * 10) / 10, 1, 7), clamp(Math.round(p[1] * 10) / 10, 0.8, 5)]; },
    cursor: (x, y) => (near(x, y, L.tri[0], L.tri[1], 30) ? 'grab' : 'default'),
    draw(ctx, w, h) {
      const P = L.P = panel(ctx, { rect: { x: 0, y: 0, w, h }, x: [-1, 8.2], y: [-1, 6], equal: true, xl: '', yl: '' });
      const [a, b] = L.tri; drawTri(ctx, P, a, b, L.other, true);
      const thA = deg(Math.atan2(b, a));
      setNums('<p>Bottom angle: <b>' + fmt(thA, 1) + '&deg;</b>, top angle: <b>' + fmt(90 - thA, 1) + '&deg;</b>, right angle: 90&deg;.</p><div class="calc">' + fmt(thA, 1) + ' + ' + fmt(90 - thA, 1) + ' + 90 = <b>180&deg;</b></div><p>Using the ' + (L.other ? 'top' : 'bottom') + ' angle, the opposite is the <b style="color:' + C.opp + '">' + (L.other ? 'bottom (horizontal)' : 'right-hand (vertical)') + '</b> side and the adjacent is the <b style="color:' + C.adj + '">' + (L.other ? 'right-hand (vertical)' : 'bottom (horizontal)') + '</b> side.</p>');
    },
  },
  {
    key: 'pyth', short: 'Pythagoras', title: 'Pythagoras: the length of the long side', figTitle: () => 'Squares on each side', hint: () => 'Drag the top corner. The two smaller squares always add up to the big one.',
    body: () => layer('words', 'In plain words', '<p>Draw a square on each side of a right-angled triangle. The two smaller squares, added together, have exactly the same area as the square on the hypotenuse. That is <strong>Pythagoras&rsquo; theorem</strong>. It only works for right-angled triangles.</p><p>It is about <strong>lengths only</strong>, no angles. So if you know the two short sides you can always get the long one.</p>')
      + layer('eq', 'The equation', eqn(v('a') + '<sup>2</sup> + ' + v('b') + '<sup>2</sup> = ' + v('c') + '<sup>2</sup> &nbsp;&nbsp;so&nbsp;&nbsp; ' + v('c') + ' = &radic;(' + v('a') + '<sup>2</sup> + ' + v('b') + '<sup>2</sup>)') + keys([['a', 'one short side (here the horizontal, the adjacent)'], ['b', 'the other short side (here the vertical, the opposite)'], ['c', 'the hypotenuse']]) + '<p class="small muted">Classic check: a 3, 4, 5 triangle, because 9 + 16 = 25 and &radic;25 = 5.</p>')
      + layer('why', 'In sport', '<p>Swap the sides for velocities. If a ball leaves the hand moving forwards at ' + sub('v', 'x') + ' and upwards at ' + sub('v', 'y') + ', its release speed is ' + v('v') + ' = &radic;(' + sub('v', 'x') + '<sup>2</sup> + ' + sub('v', 'y') + '<sup>2</sup>). A force platform or a video gives you the two parts separately; Pythagoras puts them back together.</p>') + NUMS(),
    q: { q: 'A ball leaves the hand at 4 m/s forwards and 3 m/s upwards. How fast is it moving?', o: ['7 m/s', '5 m/s', '1 m/s'], a: 1, why: '√(4² + 3²) = √(16 + 9) = √25 = 5 m/s. You cannot just add the two parts (7 m/s), because they point in different directions.' },
    down(x, y) { return near(x, y, L.tri[0], L.tri[1], 30); },
    drag(x, y) { const p = L.P.inv(x, y); L.tri = [clamp(Math.round(p[0] * 10) / 10, 1, 4.5), clamp(Math.round(p[1] * 10) / 10, 1, 4)]; },
    cursor: (x, y) => (near(x, y, L.tri[0], L.tri[1], 30) ? 'grab' : 'default'),
    draw(ctx, w, h) {
      L.tri = [clamp(L.tri[0], 1, 4.5), clamp(L.tri[1], 1, 4)];
      const P = L.P = panel(ctx, { rect: { x: 0, y: 0, w, h }, x: [-4.6, 9.4], y: [-4.8, 9], equal: true, xl: '', yl: '' });
      const [a, b] = L.tri, c = Math.hypot(a, b);
      const sq = (pts, col, txt) => { ctx.save(); ctx.fillStyle = col + '22'; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(P.X(p[0]), P.Y(p[1])) : ctx.moveTo(P.X(p[0]), P.Y(p[1])))); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); const cx = pts.reduce((s, p) => s + p[0], 0) / 4, cy = pts.reduce((s, p) => s + p[1], 0) / 4; label(ctx, txt, P.X(cx), P.Y(cy), col, { size: 14 }); };
      sq([[0, 0], [a, 0], [a, -a], [0, -a]], C.adj, 'a² = ' + fmt(a * a, 2));
      sq([[a, 0], [a + b, 0], [a + b, b], [a, b]], C.opp, 'b² = ' + fmt(b * b, 2));
      const n = [-b / c, a / c]; sq([[0, 0], [a, b], [a + n[0] * c, b + n[1] * c], [n[0] * c, n[1] * c]], C.hyp, 'c² = ' + fmt(c * c, 2));
      drawTri(ctx, P, a, b, false, false);
      setNums('<div class="calc">a<sup>2</sup> + b<sup>2</sup> = ' + fmt(a, 1) + '<sup>2</sup> + ' + fmt(b, 1) + '<sup>2</sup> = ' + fmt(a * a, 2) + ' + ' + fmt(b * b, 2) + ' = <b>' + fmt(a * a + b * b, 2) + '</b></div><div class="calc">c = &radic;' + fmt(a * a + b * b, 2) + ' = <b>' + fmt(c, 2) + '</b></div><p>Read as velocities: ' + fmt(a, 1) + ' m/s forwards and ' + fmt(b, 1) + ' m/s up is a release speed of <b>' + fmt(c, 2) + ' m/s</b>.</p>');
    },
  },
  {
    key: 'trig', short: 'SOH CAH TOA', title: 'Sine, cosine and tangent (SOH CAH TOA)', figTitle: () => 'The three ratios', hint: () => 'Drag the corner round the circle, or use the slider.',
    tools: () => slider('ang', 'Angle θ', 1, 89, 1, '°'),
    body: () => layer('words', 'In plain words', '<p>Pythagoras links the <em>sides</em>. To bring in the <em>angle</em>, we use three ratios. For a given angle the ratio of two sides is always the same, however big the triangle is. That is all sine, cosine and tangent are.</p>')
      + layer('eq', 'SOH CAH TOA', eqn('<b>S</b>in &theta; = <b>O</b>pposite &divide; <b>H</b>ypotenuse') + eqn('<b>C</b>os &theta; = <b>A</b>djacent &divide; <b>H</b>ypotenuse') + eqn('<b>T</b>an &theta; = <b>O</b>pposite &divide; <b>A</b>djacent') + '<p class="small">Here the hypotenuse is 1, so the opposite <em>is</em> sin &theta; and the adjacent <em>is</em> cos &theta;. With a hypotenuse of ' + v('v') + ', the opposite is ' + v('v') + ' sin &theta; and the adjacent is ' + v('v') + ' cos &theta;.</p>')
      + layer('eq', 'Going backwards: the angle from the sides', eqn('&theta; = tan<sup>&minus;1</sup>(opposite &divide; adjacent)') + '<p>tan<sup>&minus;1</sup> (also called arctan, or ATAN) undoes tan. Likewise sin<sup>&minus;1</sup> and cos<sup>&minus;1</sup>. Pick the one that uses the two sides you know.</p>')
      + layer('why', 'Practical tips', '<ul><li>Calculators must be in <strong>degrees</strong> (DEG on the screen), not radians (RAD), or every answer is wrong.</li><li>In Excel, angles come out in radians: use <code>=DEGREES(ATAN2(vx, vy))</code>. Note that Excel&rsquo;s ATAN2 takes horizontal first, then vertical. ATAN2 also gets the direction right when the ball is moving left or downwards.</li><li>To use an angle in Excel&rsquo;s SIN or COS, convert it first: <code>=COS(RADIANS(52))</code>.</li></ul>') + NUMS(),
    q: { q: 'You know the horizontal and vertical velocity at release. Which do you use to get the release angle?', o: ['sin⁻¹', 'cos⁻¹', 'tan⁻¹'], a: 2, why: 'Horizontal is the adjacent and vertical is the opposite. The only ratio that uses opposite and adjacent (and not the hypotenuse) is tan, so θ = tan⁻¹(v<sub>y</sub> ÷ v<sub>x</sub>).' },
    down(x, y) { if (!L.P) return false; const p = L.P.inv(x, y); if (p[0] > -0.2 && p[0] < 1.3 && p[1] > -0.2 && p[1] < 1.3) { setAng(p); return true; } return false; },
    drag(x, y) { setAng(L.P.inv(x, y)); }, up() {},
    draw(ctx, w, h) {
      const [r1, r2] = split(w, h, 0.5), th = rad(L.ang), s = Math.sin(th), c = Math.cos(th);
      const P = L.P = panel(ctx, { rect: r1, x: [-0.15, 1.2], y: [-0.15, 1.2], equal: true });
      const qx = [], qy = []; for (let k = 0; k <= 60; k++) { qx.push(Math.cos(k / 60 * Math.PI / 2)); qy.push(Math.sin(k / 60 * Math.PI / 2)); } line(ctx, P, qx, qy, '#cbd5e1', 1.5, [5, 4]);
      const O = [P.X(0), P.Y(0)], B = [P.X(c), P.Y(0)], T = [P.X(c), P.Y(s)];
      seg(ctx, O, B, C.adj, 4); seg(ctx, B, T, C.opp, 4); seg(ctx, O, T, C.hyp, 4);
      rightMark(ctx, B[0], B[1], [-1, 0], [0, -1]); arc(ctx, O[0], O[1], 30, 0, -th, '#475569');
      label(ctx, 'θ', O[0] + 42 * Math.cos(-th / 2), O[1] + 42 * Math.sin(-th / 2), '#475569');
      label(ctx, 'hyp = 1', (O[0] + T[0]) / 2 - 8, (O[1] + T[1]) / 2 - 12, C.hyp, { align: 'right' });
      label(ctx, 'adj = cos θ = ' + fmt(c, 3), (O[0] + B[0]) / 2, B[1] + 16, C.adj, { size: 12 });
      label(ctx, 'opp = sin θ = ' + fmt(s, 3), B[0] + 8, (B[1] + T[1]) / 2, C.opp, { align: 'left', size: 12 });
      ctx.fillStyle = C.hyp; ctx.beginPath(); ctx.arc(T[0], T[1], 7, 0, 2 * Math.PI); ctx.fill();
      const Q = panel(ctx, { rect: r2, x: [0, 90], y: [0, 1.05], xl: 'Angle θ (°)', yl: 'Ratio', title: 'sin θ and cos θ for every angle' });
      const ax = [], sy = [], cy = []; for (let k = 0; k <= 90; k++) { ax.push(k); sy.push(Math.sin(rad(k))); cy.push(Math.cos(rad(k))); }
      line(ctx, Q, ax, sy, C.opp, 2.5); line(ctx, Q, ax, cy, C.adj, 2.5); line(ctx, Q, [L.ang, L.ang], [0, 1.05], '#475569', 1.5, [4, 4]);
      dots(ctx, Q, [L.ang, L.ang], [s, c], '#0f172a', 4); label(ctx, 'sin', Q.X(80), Q.Y(Math.sin(rad(80))) - 12, C.opp, { size: 12 }); label(ctx, 'cos', Q.X(80), Q.Y(Math.cos(rad(80))) - 12, C.adj, { size: 12 });
      setNums('<div class="calc">sin ' + L.ang + '&deg; = opp &divide; hyp = ' + fmt(s, 3) + ' &divide; 1 = <b>' + fmt(s, 3) + '</b></div><div class="calc">cos ' + L.ang + '&deg; = adj &divide; hyp = ' + fmt(c, 3) + ' &divide; 1 = <b>' + fmt(c, 3) + '</b></div><div class="calc">tan ' + L.ang + '&deg; = opp &divide; adj = ' + fmt(s, 3) + ' &divide; ' + fmt(c, 3) + ' = <b>' + fmt(s / c, 3) + '</b></div><div class="calc">tan<sup>&minus;1</sup>(' + fmt(s / c, 3) + ') = <b>' + L.ang + '&deg;</b> (back where we started)</div><p class="small">Notice: at 45&deg; the opposite and adjacent are equal, so tan 45&deg; = 1. Above 45&deg; the vertical part is bigger than the horizontal.</p>');
    },
  },
  {
    key: 'resolve', short: 'Resolving', title: 'Resolving a release velocity', figTitle: () => 'Splitting a velocity into horizontal and vertical', hint: () => 'Drag the arrow head to change the release velocity.',
    body: () => layer('words', 'In plain words', '<p>Every release velocity can be split into two parts at right angles: how fast the ball moves <strong>forwards</strong> (horizontal, ' + sub('v', 'x') + ') and how fast it moves <strong>up</strong> (vertical, ' + sub('v', 'y') + '). This is called <strong>resolving</strong> the vector into its <strong>components</strong>. Putting them back together gives the <strong>resultant</strong>.</p><p>Look at the figure: the horizontal part, then the vertical part placed on the end of it (nose to tail), make a right-angled triangle with the release velocity as its hypotenuse.</p>')
      + layer('eq', 'Splitting it (you know the speed and angle)', eqn(sub('v', 'x') + ' = ' + v('v') + ' cos &theta; &nbsp;&nbsp;&nbsp; ' + sub('v', 'y') + ' = ' + v('v') + ' sin &theta;'))
      + layer('eq', 'Putting it back together (you know the two parts)', eqn(v('v') + ' = &radic;(' + sub('v', 'x') + '<sup>2</sup> + ' + sub('v', 'y') + '<sup>2</sup>) &nbsp;&nbsp;&nbsp; &theta; = tan<sup>&minus;1</sup>(' + sub('v', 'y') + ' &divide; ' + sub('v', 'x') + ')') + keys([['v', 'release speed (m/s), the resultant'], ['&theta;', 'release angle, from the horizontal (&deg;)'], [sub('v', 'x'), 'horizontal component (m/s)'], [sub('v', 'y'), 'vertical component (m/s): positive up, negative down']]))
      + layer('why', 'This is the analysis', '<p>Video (or a force platform) gives you the components. Pythagoras and tan<sup>&minus;1</sup> turn them into the release speed and angle. That is exactly what the Analyse part does with your own data.</p>') + NUMS(),
    q: { q: 'A ball is thrown straight up (θ = 90°). What is its horizontal velocity?', o: ['Zero', 'The same as its speed', 'Half its speed'], a: 0, why: 'cos 90° = 0, so v<sub>x</sub> = v × 0 = 0. All of the speed is vertical.' },
    down(x, y) { if (!L.P) return false; L.rv = snap(L.P.inv(x, y), [-2, 10], [-5, 9]); return true; },
    drag(x, y) { L.rv = snap(L.P.inv(x, y), [-2, 10], [-5, 9]); },
    cursor: (x, y) => (near(x, y, L.rv[0], L.rv[1]) ? 'grab' : 'crosshair'),
    draw(ctx, w, h) {
      const P = L.P = panel(ctx, { rect: { x: 0, y: 0, w, h }, x: [-3, 11], y: [-5.5, 9.5], equal: true, xl: 'Horizontal velocity (m/s)', yl: 'Vertical velocity (m/s)' });
      const [a, b] = L.rv, sp = Math.hypot(a, b), th = deg(Math.atan2(b, a)), O = [P.X(0), P.Y(0)], H = [P.X(a), P.Y(0)], T = [P.X(a), P.Y(b)];
      arrow(ctx, O[0], O[1], H[0], H[1], C.adj, 4); arrow(ctx, H[0], H[1], T[0], T[1], C.opp, 4);
      if (Math.abs(a) > 0.4 && Math.abs(b) > 0.4) rightMark(ctx, H[0], H[1], [-Math.sign(a), 0], [0, b > 0 ? -1 : 1]);
      arrow(ctx, O[0], O[1], T[0], T[1], C.hyp, 4.5, 15);
      if (sp > 0.5) { arc(ctx, O[0], O[1], 34, 0, -rad(th), '#475569'); }
      label(ctx, 'v_x = ' + sgn(a, 2), (O[0] + H[0]) / 2, O[1] + (b >= 0 ? 16 : -16), C.adj, { size: 12 });
      label(ctx, 'v_y = ' + sgn(b, 2), H[0] + (a >= 0 ? 8 : -8), (H[1] + T[1]) / 2, C.opp, { align: a >= 0 ? 'left' : 'right', size: 12 });
      label(ctx, 'v = ' + fmt(sp, 2) + ' at ' + sgn(th, 1) + '°', (O[0] + T[0]) / 2 + (a >= 0 ? -10 : 10), (O[1] + T[1]) / 2 - 14, C.hyp, { align: a >= 0 ? 'right' : 'left', size: 12 });
      ctx.fillStyle = C.hyp; ctx.beginPath(); ctx.arc(T[0], T[1], 7, 0, 2 * Math.PI); ctx.fill();
      let note = '';
      if (a < 0) note = '<p class="small">The ball is moving <b>backwards</b> (v<sub>x</sub> is negative). A plain tan<sup>&minus;1</sup>(v<sub>y</sub> &divide; v<sub>x</sub>) would give the wrong angle here; ATAN2 handles it. In the Analyse part the tool flips the picture so the throw always goes left to right.</p>';
      else if (b < 0) note = '<p class="small">v<sub>y</sub> is negative, so the angle is <b>below</b> the horizontal: the ball is on its way down (e.g. the angle it enters the hoop at).</p>';
      setNums('<div class="calc">v = &radic;(' + sgn(a, 2) + '<sup>2</sup> + ' + sgn(b, 2) + '<sup>2</sup>) = &radic;' + fmt(a * a + b * b, 2) + ' = <b>' + fmt(sp, 2) + ' m/s</b></div><div class="calc">&theta; = tan<sup>&minus;1</sup>(' + sgn(b, 2) + ' &divide; ' + sgn(a, 2) + ') = <b>' + sgn(th, 1) + '&deg;</b></div><div class="calc">check: v<sub>x</sub> = ' + fmt(sp, 2) + ' &times; cos ' + sgn(th, 1) + '&deg; = <b>' + sgn(sp * Math.cos(rad(th)), 2) + '</b>, v<sub>y</sub> = ' + fmt(sp, 2) + ' &times; sin ' + sgn(th, 1) + '&deg; = <b>' + sgn(sp * Math.sin(rad(th)), 2) + '</b></div>' + note);
    },
  },
  {
    key: 'indep', short: 'Two directions', title: 'Horizontal and vertical do not affect each other', figTitle: () => 'Dropped and thrown, side by side', hint: () => 'Each dot is 0.1 s apart. Both balls are released at the same moment.',
    tools: () => '<button type="button" class="btn small" data-act="play">' + (L.play ? 'Pause' : 'Play') + '</button><span class="legend"><span><i class="o" style="background:#64748b"></i>Dropped</span><span><i class="o" style="background:' + C.hyp + '"></i>Thrown horizontally (2.5 m/s)</span></span>',
    body: () => layer('words', 'In plain words', '<p>Here is the key idea of projectile motion. One ball is <strong>dropped</strong>; the other is <strong>thrown sideways</strong> from the same height at the same moment. They hit the ground <strong>together</strong>.</p><p>That is because the horizontal and vertical motions are <strong>independent</strong>: you can work each one out on its own.</p><ul><li><strong>Horizontally</strong> nothing acts (no force), so the horizontal velocity <strong>stays the same</strong> the whole flight. The dots are evenly spaced sideways.</li><li><strong>Vertically</strong> gravity acts, so the vertical velocity <strong>falls by 9.81 m/s every second</strong>: up and slowing, zero at the top, then down and speeding up. The dots get further apart going down.</li></ul>')
      + layer('eq', 'The two equations of the flight', eqn(v('x') + ' = ' + sub('x', '0') + ' + ' + sub('v', 'x') + v('t') + ' &nbsp;&nbsp;(straight line)') + eqn(v('y') + ' = ' + sub('y', '0') + ' + ' + sub('v', 'y') + v('t') + ' &minus; &frac12;' + v('g') + v('t') + '<sup>2</sup> &nbsp;&nbsp;(a curve: a parabola)') + keys([[sub('x', '0') + ', ' + sub('y', '0'), 'where it was released (m)'], [sub('v', 'x') + ', ' + sub('v', 'y'), 'the release velocity components (m/s)'], ['t', 'time since release (s)'], ['g', 'acceleration due to gravity, 9.81 m/s&sup2;']]) + '<p class="small">Put together, a straight line sideways and a parabola up and down make the curved path you see.</p>')
      + layer('why', 'Why it matters', '<p>Because horizontal velocity never changes, the <strong>distance</strong> a projectile travels is just horizontal velocity &times; time in the air. And the time in the air is decided only by the <strong>vertical</strong> velocity and the release height. Next step.</p>'),
    q: { q: 'A ball is dropped and another thrown sideways from the same height at the same time. Which lands first?', o: ['The dropped ball', 'The thrown ball', 'They land together'], a: 2, why: 'Both start with no vertical velocity and gravity changes it in the same way for both, so they fall the same distance in the same time. Sideways speed makes no difference to the fall.' },
    animate: () => L.play,
    draw(ctx, w, h, ts) {
      const h0 = 2.0, ux = 2.5, Tf = Math.sqrt(2 * h0 / G), loop = Tf + 1.0;
      if (L.play) L.tt = ((ts - L.t0) / 1000) % loop; else if (L.tt === undefined) L.tt = Tf;
      const t = Math.min(L.tt, Tf), [r1, r2] = split(w, h, 0.58);
      const P = panel(ctx, { rect: r1, x: [-0.4, 2.4], y: [-0.1, 2.3], equal: true, xl: 'Horizontal position (m)', yl: 'Height (m)' }); ground(ctx, P);
      const ks = []; for (let k = 0; k * 0.1 <= t + 1e-9; k++) ks.push(k * 0.1);
      ks.forEach((tk) => { const y = h0 - 0.5 * G * tk * tk; line(ctx, P, [0, 0.25 + ux * tk], [y, y], '#e2e8f0', 1, [3, 3]); });
      dots(ctx, P, ks.map(() => 0), ks.map((tk) => h0 - 0.5 * G * tk * tk), '#64748b', 6);
      dots(ctx, P, ks.map((tk) => 0.25 + ux * tk), ks.map((tk) => h0 - 0.5 * G * tk * tk), C.hyp, 6);
      label(ctx, 't = ' + fmt(t, 2) + ' s', P.r.R - 8, P.r.T + 14, COL.ink, { align: 'right' });
      const hgt = r2.h / 2;
      const A = panel(ctx, { rect: { x: r2.x, y: r2.y, w: r2.w, h: hgt }, x: [0, 0.7], y: [-0.5, 3], xl: '', yl: 'v_x (m/s)', title: 'Horizontal velocity: stays the same' });
      line(ctx, A, [0, t], [0, 0], '#64748b', 3); line(ctx, A, [0, t], [ux, ux], C.hyp, 3);
      const B = panel(ctx, { rect: { x: r2.x, y: r2.y + hgt, w: r2.w, h: hgt }, x: [0, 0.7], y: [-7, 0.5], xl: 'Time (s)', yl: 'v_y (m/s)', title: 'Vertical velocity: falls 9.81 m/s every second' });
      line(ctx, B, [0, t], [0, -G * t], '#64748b', 6); line(ctx, B, [0, t], [0, -G * t], C.hyp, 2.5, [7, 5]);
    },
  },
  {
    key: 'eqs', short: 'Flight equations', title: 'Peak height, flight time and distance', figTitle: () => 'One flight, worked out', hint: () => 'Change the release with the sliders.',
    tools: () => slider('v', 'Speed', 1, 20, 0.1, 'm/s') + slider('th', 'Angle', 0, 85, 1, '°') + slider('h', 'Release height', -1, 3, 0.05, 'm'),
    body: () => layer('words', 'In plain words', '<p>Work out the <strong>vertical</strong> motion first, because it decides how long the projectile is in the air. Then the <strong>horizontal</strong> distance is just horizontal velocity &times; that time. Here &ldquo;release height&rdquo; means how far <strong>above the landing level</strong> it was released (e.g. about 2 m for a shot put landing on the ground; negative if it lands higher up, like a basketball on its way to the hoop).</p>')
      + layer('eq', 'The equations', '<p><b>1. Split the release velocity</b></p>' + eqn(sub('v', 'x') + ' = ' + v('v') + ' cos &theta; &nbsp;&nbsp; ' + sub('v', 'y') + ' = ' + v('v') + ' sin &theta;')
        + '<p><b>2. Time to the top</b> (vertical velocity has fallen to zero)</p>' + eqn(sub('t', 'peak') + ' = ' + sub('v', 'y') + ' &divide; ' + v('g'))
        + '<p><b>3. Peak height</b> above release</p>' + eqn('rise = ' + sub('v', 'y') + '<sup>2</sup> &divide; 2' + v('g'))
        + '<p><b>4. Flight time</b> (from the vertical equation, solved for when ' + v('y') + ' reaches the landing level)</p>' + eqn(sub('t', 'flight') + ' = [' + sub('v', 'y') + ' + &radic;(' + sub('v', 'y') + '<sup>2</sup> + 2' + v('g') + v('h') + ')] &divide; ' + v('g'))
        + '<p><b>5. Horizontal distance</b></p>' + eqn(v('R') + ' = ' + sub('v', 'x') + ' &times; ' + sub('t', 'flight'))
        + keys([['h', 'release height above the landing level (m)'], ['g', '9.81 m/s&sup2;'], ['R', 'range: horizontal distance from release to landing (m)']])
        + '<details class="more"><summary>Where does the flight time equation come from?</summary><p>Landing is when the height has dropped by ' + v('h') + ': ' + v('h') + ' + ' + sub('v', 'y') + v('t') + ' &minus; &frac12;' + v('g') + v('t') + '<sup>2</sup> = 0. That is a quadratic in ' + v('t') + '. The quadratic formula gives the equation above (taking the positive answer). When release and landing are at the same height (' + v('h') + ' = 0) it simplifies to ' + sub('t', 'flight') + ' = 2' + sub('v', 'y') + '/' + v('g') + ', and the range to the textbook ' + v('R') + ' = ' + v('v') + '<sup>2</sup> sin 2&theta; &divide; ' + v('g') + '.</p></details>')
      + NUMS(),
    q: { q: 'Same speed and angle, but released from higher up. What happens to the flight time?', o: ['It gets longer', 'It stays the same', 'It gets shorter'], a: 0, why: 'It has further to fall after the peak, so it spends longer in the air, and with the same horizontal velocity it also goes further.' },
    draw(ctx, w, h) {
      const Pp = fromPolar(L.v, L.th, L.h, 0), tf = tAtHeight(Pp, 0), tp = Math.max(0, Pp.vy / G), rise = Pp.vy > 0 ? Pp.vy ** 2 / (2 * G) : 0, R = Pp.vx * tf;
      const xmax = Math.max(2, Number.isFinite(R) ? R : Pp.vx * 2) * 1.12, ymax = Math.max(L.h + rise, L.h, 0.5) * 1.18 + 0.2;
      const P = panel(ctx, { rect: { x: 0, y: 0, w, h }, x: [-0.06 * xmax, xmax], y: [Math.min(-0.25, L.h - 0.3), ymax], equal: true, xl: 'Horizontal distance (m)', yl: 'Height above landing level (m)' });
      ground(ctx, P);
      if (!Number.isFinite(tf)) { const [xs, ys] = pathXY(Pp, Math.max(0.3, 2 * tp + 0.2)); line(ctx, P, xs, ys, C.hyp, 3); label(ctx, 'Never reaches the landing level: too slow or too flat', (P.r.L + P.r.R) / 2, P.r.T + 20, COL.bad); setNums('<p>With this release the projectile never gets back up to the landing level. Increase the speed or the angle.</p>'); return; }
      const [xs, ys] = pathXY(Pp, tf); line(ctx, P, xs, ys, C.hyp, 3);
      const tk = []; for (let k = 0; k * 0.1 < tf; k++) tk.push(k * 0.1); dots(ctx, P, tk.map((t) => pos(Pp, t)[0]), tk.map((t) => pos(Pp, t)[1]), C.hyp, 3);
      const sc = Math.min(0.12 * xmax / Math.max(L.v, 1), 0.6), O = [P.X(0), P.Y(L.h)];
      arrow(ctx, O[0], O[1], P.X(Pp.vx * sc), O[1], C.adj, 3); arrow(ctx, P.X(Pp.vx * sc), O[1], P.X(Pp.vx * sc), P.Y(L.h + Pp.vy * sc), C.opp, 3); arrow(ctx, O[0], O[1], P.X(Pp.vx * sc), P.Y(L.h + Pp.vy * sc), C.hyp, 3.5);
      line(ctx, P, [0, 0], [0, L.h], '#475569', 1.5, [4, 3]); label(ctx, 'h = ' + fmt(L.h, 2) + ' m', O[0] - 6, (O[1] + P.Y(0)) / 2, '#475569', { align: 'right', size: 12 });
      if (tp > 0) { const pk = pos(Pp, tp); line(ctx, P, [pk[0], pk[0]], [L.h, pk[1]], C.opp, 1.5, [4, 3]); dots(ctx, P, [pk[0]], [pk[1]], C.opp, 5); label(ctx, 'peak: ' + fmt(pk[1], 2) + ' m at ' + fmt(tp, 2) + ' s', P.X(pk[0]), P.Y(pk[1]) - 16, C.opp, { size: 12 }); }
      const gy = P.Y(0) + 14; ctx.save(); ctx.strokeStyle = C.adj; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(P.X(0), gy); ctx.lineTo(P.X(R), gy); ctx.stroke(); ctx.restore();
      label(ctx, 'R = ' + fmt(R, 2) + ' m, in ' + fmt(tf, 2) + ' s', (P.X(0) + P.X(R)) / 2, gy + 14, C.adj, { size: 12 });
      setNums('<div class="calc">v<sub>x</sub> = ' + fmt(L.v, 1) + ' &times; cos ' + L.th + '&deg; = <b>' + fmt(Pp.vx, 2) + ' m/s</b>, &nbsp; v<sub>y</sub> = ' + fmt(L.v, 1) + ' &times; sin ' + L.th + '&deg; = <b>' + fmt(Pp.vy, 2) + ' m/s</b></div>'
        + '<div class="calc">t<sub>peak</sub> = ' + fmt(Pp.vy, 2) + ' &divide; 9.81 = <b>' + fmt(tp, 3) + ' s</b></div>'
        + '<div class="calc">rise = ' + fmt(Pp.vy, 2) + '<sup>2</sup> &divide; (2 &times; 9.81) = <b>' + fmt(rise, 3) + ' m</b> (peak ' + fmt(L.h + rise, 2) + ' m above landing)</div>'
        + '<div class="calc">t<sub>flight</sub> = [' + fmt(Pp.vy, 2) + ' + &radic;(' + fmt(Pp.vy, 2) + '<sup>2</sup> + 2 &times; 9.81 &times; ' + fmt(L.h, 2) + ')] &divide; 9.81 = <b>' + fmt(tf, 3) + ' s</b></div>'
        + '<div class="calc">R = ' + fmt(Pp.vx, 2) + ' &times; ' + fmt(tf, 3) + ' = <b>' + fmt(R, 2) + ' m</b></div>');
    },
  },
  {
    key: 'best', short: 'Best angle', title: 'Which release angle is best?', figTitle: () => (L.bmode === 'dist' ? 'Range for every angle, same speed' : 'The speed needed to hit a target, for every angle'), hint: () => '',
    tools: () => '<button type="button" class="btn small ' + (L.bmode === 'dist' ? '' : 'ghost') + '" data-act="dist">Throw for distance</button><button type="button" class="btn small ' + (L.bmode === 'target' ? '' : 'ghost') + '" data-act="target">Hit a target</button>' + (L.bmode === 'dist' ? slider('bv', 'Speed', 2, 15, 0.1, 'm/s') + slider('bh', 'Release height', 0, 3, 0.05, 'm') : slider('tdx', 'Target ahead', 1, 8, 0.05, 'm') + slider('tdy', 'Target above', -1, 2, 0.05, 'm')),
    body: () => (L.bmode === 'dist'
      ? layer('words', 'Throwing for distance', '<p>You will have heard that 45&deg; goes furthest. That is only true when the projectile is released and lands <strong>at the same height</strong>. Slide the release height above zero and the best angle drops below 45&deg;, because the projectile already has extra time to fall after the peak, so it pays to send more of the speed forwards.</p><p>Real athletes release even lower than this. In real bodies, speed is not fixed: people cannot produce as much speed at steep angles (e.g. shot putters generate more speed pushing forwards than upwards, and long jumpers cannot spend long enough on the board to get a steep take-off without losing speed). So shot putters release at about 35 to 38&deg; and long jumpers take off at about 18 to 25&deg;.</p>')
        + layer('eq', 'The best angle for a given speed and height', eqn('sin ' + sub('&theta;', 'best') + ' = ' + v('v') + ' &divide; &radic;(2' + v('v') + '<sup>2</sup> + 2' + v('g') + v('h') + ')') + '<p class="small">With ' + v('h') + ' = 0 this gives sin &theta; = 1/&radic;2, so &theta; = 45&deg;.</p>')
      : layer('words', 'Hitting a target (e.g. a free throw)', '<p>Now the target is <strong>above</strong> the release point, as in a basketball shot. Every angle can reach it if the speed is right. The graph shows the speed needed for each angle. The bottom of the curve is the angle that needs the <strong>least speed</strong>.</p><p>Look at how flat the curve is near its bottom. Near that angle a small error in angle hardly changes the speed needed, so the shot is <strong>forgiving</strong>. A flat shot sits on the steep part of the curve, where a small change in angle changes the outcome a lot. Steeper shots also drop into the hoop at a steeper angle, so the hoop &ldquo;looks bigger&rdquo; to the ball. Players usually shoot free throws a little above the minimum-speed angle, at about 50 to 55&deg;.</p>')
        + layer('eq', 'Minimum-speed angle to a target', eqn('tan &theta; = (' + v('&Delta;y') + ' + &radic;(' + v('&Delta;x') + '<sup>2</sup> + ' + v('&Delta;y') + '<sup>2</sup>)) &divide; ' + v('&Delta;x')) + eqn(sub('v', 'min') + '<sup>2</sup> = ' + v('g') + '(' + v('&Delta;y') + ' + &radic;(' + v('&Delta;x') + '<sup>2</sup> + ' + v('&Delta;y') + '<sup>2</sup>))') + keys([['&Delta;x', 'target distance ahead of release (m)'], ['&Delta;y', 'target height above release (m)']]) + '<p class="small">This is always halfway between 45&deg; and the angle of a straight line from the ball to the target.</p>'))
      + NUMS(),
    q: { q: 'A shot is released 2.1 m above the ground. With the same release speed, the best angle is...', o: ['Exactly 45°', 'A little below 45°', 'A little above 45°'], a: 1, why: 'Release above landing height pulls the best angle below 45° (about 42° for a good shot putter). In practice it is lower still, because athletes produce less speed at steeper angles.' },
    draw(ctx, w, h) {
      const [r1, r2] = split(w, h, 0.58);
      if (L.bmode === 'dist') {
        const opt = optimumAngle(L.bv, L.bh), Rmax = range(fromPolar(L.bv, opt, L.bh), 0);
        const P = panel(ctx, { rect: r1, x: [-0.3, Rmax * 1.08 + 0.3], y: [-0.2, Math.max(L.bh + L.bv * L.bv / (2 * G), 1) * 1.1], equal: true, xl: 'Distance (m)', yl: 'Height (m)' }); ground(ctx, P);
        for (let a = 15; a <= 75; a += 5) { const Pp = fromPolar(L.bv, a, L.bh), [xs, ys] = pathXY(Pp, tAtHeight(Pp, 0)); line(ctx, P, xs, ys, a === 45 ? '#64748b' : '#d6dde5', a === 45 ? 2 : 1.5, a === 45 ? [6, 4] : null); }
        const Po = fromPolar(L.bv, opt, L.bh), [ox, oy] = pathXY(Po, tAtHeight(Po, 0)); line(ctx, P, ox, oy, C.hyp, 3.5);
        label(ctx, 'best: ' + fmt(opt, 1) + '°', P.X(ox[60]), P.Y(oy[60]) - 14, C.hyp, { size: 12 });
        const Q = panel(ctx, { rect: r2, x: [0, 90], y: [0, Rmax * 1.1], xl: 'Release angle (°)', yl: 'Range (m)', title: 'Range against angle' });
        const ax = [], ry = []; for (let a = 0; a <= 90; a += 0.5) { ax.push(a); ry.push(range(fromPolar(L.bv, a, L.bh), 0)); }
        line(ctx, Q, ax, ry, C.hyp, 2.5); line(ctx, Q, [45, 45], [0, Rmax * 1.1], '#64748b', 1.5, [5, 4]); dots(ctx, Q, [opt], [Rmax], C.hyp, 5);
        const R45 = range(fromPolar(L.bv, 45, L.bh), 0);
        setNums('<p>Best angle: <b>' + fmt(opt, 1) + '&deg;</b>, range <b>' + fmt(Rmax, 2) + ' m</b>.</p><p>At 45&deg;: ' + fmt(R45, 2) + ' m (' + fmt(Rmax - R45, 2) + ' m shorter).</p><div class="calc">sin &theta; = ' + fmt(L.bv, 1) + ' &divide; &radic;(2 &times; ' + fmt(L.bv, 1) + '<sup>2</sup> + 2 &times; 9.81 &times; ' + fmt(L.bh, 2) + ') = ' + fmt(Math.sin(rad(opt)), 4) + ' &nbsp;&rarr;&nbsp; <b>' + fmt(opt, 1) + '&deg;</b></div><p class="small">Notice how flat the range curve is near the top: a few degrees either side of the best angle costs very little distance.</p>');
      } else {
        const m = minSpeedToTarget(L.tdx, L.tdy);
        const ys0 = Math.min(0, L.tdy) - 0.4;
        const P = panel(ctx, { rect: r1, x: [-0.4, L.tdx + 0.8], y: [ys0, Math.max(L.tdy, 0) + L.tdx * 0.9], equal: true, xl: 'Distance ahead of release (m)', yl: 'Height above release (m)' });
        for (let a = 20; a <= 80; a += 5) { const sp = speedForTarget(L.tdx, L.tdy, a); if (!Number.isFinite(sp)) continue; const Pp = fromPolar(sp, a, 0), [xs, ys] = pathXY(Pp, L.tdx / Pp.vx * 1.06); line(ctx, P, xs, ys, '#d6dde5', 1.5); }
        const Po = fromPolar(m.v, m.th, 0), [ox, oy] = pathXY(Po, L.tdx / Po.vx * 1.06); line(ctx, P, ox, oy, C.hyp, 3.5);
        line(ctx, P, [L.tdx - 0.23, L.tdx + 0.23], [L.tdy, L.tdy], '#dc6a1d', 4); dots(ctx, P, [0], [0], '#0f172a', 5); label(ctx, 'target', P.X(L.tdx), P.Y(L.tdy) + 16, '#dc6a1d', { size: 12 });
        line(ctx, P, [0, L.tdx], [0, L.tdy], '#94a3b8', 1, [3, 3]);
        const Q = panel(ctx, { rect: r2, x: [15, 85], y: [m.v * 0.9, m.v * 1.6], xl: 'Release angle (°)', yl: 'Speed needed (m/s)', title: 'Speed needed against angle' });
        const ax = [], sy = []; for (let a = 15; a <= 85; a += 0.5) { ax.push(a); sy.push(speedForTarget(L.tdx, L.tdy, a)); }
        line(ctx, Q, ax, sy, C.hyp, 2.5); dots(ctx, Q, [m.th], [m.v], C.hyp, 5);
        const s1 = speedForTarget(L.tdx, L.tdy, m.th + 5), s2 = speedForTarget(L.tdx, L.tdy, m.th - 15);
        setNums('<p>Minimum-speed angle: <b>' + fmt(m.th, 1) + '&deg;</b>, needing <b>' + fmt(m.v, 2) + ' m/s</b>.</p><p>5&deg; steeper needs ' + fmt(s1, 2) + ' m/s (only ' + fmt(s1 - m.v, 2) + ' more). 15&deg; flatter needs ' + fmt(s2, 2) + ' m/s (' + fmt(s2 - m.v, 2) + ' more).</p><div class="calc">tan &theta; = (' + fmt(L.tdy, 2) + ' + &radic;(' + fmt(L.tdx, 2) + '<sup>2</sup> + ' + fmt(L.tdy, 2) + '<sup>2</sup>)) &divide; ' + fmt(L.tdx, 2) + ' &nbsp;&rarr;&nbsp; <b>' + fmt(m.th, 1) + '&deg;</b></div><p class="small">The default target (3.9 m ahead, 0.95 m up) is a free throw from a 2.1 m release.</p>');
      }
    },
  },
  {
    key: 'fit', short: 'From video', title: 'From video to numbers: fit the flight, don’t just difference it', figTitle: () => 'Digitised ball: height and vertical velocity', hint: () => 'Each dot is one digitised frame, with a little clicking error.',
    tools: () => slider('noise', 'Clicking error', 0, 20, 1, 'mm') + '<label>Frame rate <select id="fpsSel">' + [30, 60, 120, 240].map((f) => '<option' + (f === L.fpsL ? ' selected' : '') + '>' + f + '</option>').join('') + '</select> fps</label><button type="button" class="btn small ghost" data-act="reseed">Digitise again</button>',
    body: () => layer('words', 'In plain words', '<p>From video we get the ball&rsquo;s <strong>position</strong> in every frame, each with a small clicking error (a few millimetres). We need the <strong>velocity</strong> at release.</p><p>The obvious way is to <strong>difference</strong>: change in position &divide; time between frames. But the time between frames is tiny (1/60 s), so a few millimetres of clicking error become a large velocity error. The purple dots in the lower graph jump all over the place.</p><p>The better way uses what we know: in flight the horizontal position is a <strong>straight line</strong> and the height is a <strong>parabola</strong>. So we <strong>fit</strong> those shapes to <em>all</em> the flight frames at once (least squares). The errors in individual clicks largely cancel out, and the velocity comes from the fitted line and curve.</p>')
      + layer('eq', 'The fit', eqn(v('x') + ' = ' + sub('x', '0') + ' + ' + sub('v', 'x') + v('t')) + eqn(v('y') + ' = ' + sub('y', '0') + ' + ' + sub('v', 'y') + v('t') + ' &minus; &frac12;' + v('g') + v('t') + '<sup>2</sup>') + '<p>with ' + v('t') + ' = 0 at release, so ' + sub('v', 'x') + ' and ' + sub('v', 'y') + ' are the release velocity components directly.</p>')
      + layer('why', 'A built-in check', '<p>Fit the parabola once more but let the data choose <em>g</em>. If your frame rate, scale and frames are right, it should come out close to <strong>9.81 m/s&sup2;</strong>. If it does not, something is wrong (e.g. the wrong frame rate for a slow-motion clip, a bad calibration, or frames included where the ball was still in the hand).</p>') + NUMS(),
    q: { q: 'You film at a higher frame rate. What happens to velocities worked out by differencing?', o: ['They get less noisy', 'They get noisier', 'No change'], a: 1, why: 'The same clicking error is divided by an even smaller time between frames, so differenced velocities get noisier. Fitting uses more frames, so it gets better instead. (Higher frame rates still help: more frames, and you see the release more exactly.)' },
    wire: () => { const s = document.getElementById('fpsSel'); if (s) s.addEventListener('change', () => { L.fpsL = +s.value; app.redraw(); }); },
    draw(ctx, w, h) {
      const Pp = fromPolar(6.98, 52, 2.10, 0), dt = 1 / L.fpsL, T = tAtHeight(Pp, 2.6), r = rngL(L.seed * 977 + L.fpsL), nz = L.noise / 1000;
      const t = [], x = [], y = []; for (let k = 0; k * dt <= T; k++) { const p = pos(Pp, k * dt); t.push(k * dt); x.push(p[0] + gss(r) * nz); y.push(p[1] + gss(r) * nz); }
      const F = fitFlight(t, x, y), n = t.length;
      const vd = [], td = []; for (let i = 1; i < n - 1; i++) { vd.push((y[i + 1] - y[i - 1]) / (2 * dt)); td.push(t[i]); }
      const top = { x: 0, y: 0, w, h: h * 0.5 }, bot = { x: 0, y: h * 0.5, w, h: h * 0.5 };
      const A = panel(ctx, { rect: top, x: [-0.02, T + 0.02], y: [2.0, 3.8], xl: '', yl: 'Height (m)', title: 'Height: clicks and the fitted parabola' });
      const fx = [], fy = []; for (let k = 0; k <= 100; k++) { const tt = T * k / 100; fx.push(tt); fy.push(F.y0 + F.vy * tt - 0.5 * G * tt * tt); }
      line(ctx, A, fx, fy, C.hyp, 2.5); dots(ctx, A, t, y, '#0f172a', 2.6);
      const vlo = Math.min(-5, ...vd.filter(Number.isFinite)) - 0.5, vhi = Math.max(6.5, ...vd.filter(Number.isFinite)) + 0.5;
      const B = panel(ctx, { rect: bot, x: [-0.02, T + 0.02], y: [vlo, vhi], xl: 'Time since release (s)', yl: 'v_y (m/s)', title: 'Vertical velocity: differencing (dots) vs the fit (line)' });
      line(ctx, B, [0, T], [Pp.vy, Pp.vy - G * T], '#94a3b8', 6); line(ctx, B, [0, T], [F.vy, F.vy - G * T], C.hyp, 2.5); dots(ctx, B, td, vd, C.opp, 3);
      const vdErr = Math.sqrt(vd.reduce((s, q, i) => s + (q - (Pp.vy - G * td[i])) ** 2, 0) / vd.length);
      setNums('<p>' + n + ' frames in flight at ' + L.fpsL + ' fps.</p><p>True release v<sub>y</sub>: <b>' + fmt(Pp.vy, 2) + ' m/s</b>. From the fit: <b>' + fmt(F.vy, 2) + ' &plusmn; ' + fmt(F.sevy, 2) + ' m/s</b>. From the first difference: <b>' + fmt(vd[0], 2) + ' m/s</b>.</p><p>Typical differencing error: <b>' + fmt(vdErr, 2) + ' m/s</b>.</p><p>Gravity check (parabola with <em>g</em> free): <b>' + fmt(F.gFree, 2) + ' m/s&sup2;</b> (should be 9.81).</p><p class="small">Set the clicking error to 0 and the two methods agree, which shows the problem is the noise, not the maths.</p>');
    },
  },
];

// ---------- step helpers ----------
function clamp(a, lo, hi) { return Math.max(lo, Math.min(hi, a)); }
function snap(p, xr = [-1.5, 9.5], yr = [-1.5, 7.5]) { return [clamp(Math.round(p[0] * 10) / 10, xr[0], xr[1]), clamp(Math.round(p[1] * 10) / 10, yr[0], yr[1])]; }
function setAng(p) { L.ang = clamp(Math.round(deg(Math.atan2(p[1], p[0]))), 1, 89); const s = document.getElementById('s_ang'); if (s) { s.value = L.ang; document.getElementById('o_ang').textContent = L.ang + ' °'; } }
function seg(ctx, a, b, col, w) { ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.restore(); }
function drawTri(ctx, P, a, b, other, labels) {
  const A = [P.X(0), P.Y(0)], B = [P.X(a), P.Y(0)], T = [P.X(a), P.Y(b)];
  const opp = other ? [A, B] : [B, T], adj = other ? [B, T] : [A, B];
  seg(ctx, ...adj, C.adj, 4); seg(ctx, ...opp, C.opp, 4); seg(ctx, A, T, C.hyp, 4);
  rightMark(ctx, B[0], B[1], [-1, 0], [0, -1], 14);
  const thA = Math.atan2(b, a);
  if (!other) { arc(ctx, A[0], A[1], 34, 0, -thA, '#475569'); label(ctx, 'θ', A[0] + 48 * Math.cos(-thA / 2), A[1] + 48 * Math.sin(-thA / 2), '#475569'); }
  else { arc(ctx, T[0], T[1], 34, Math.PI / 2, Math.PI / 2 + (Math.PI / 2 - thA), '#475569'); label(ctx, 'θ', T[0] - 18, T[1] + 44, '#475569'); }
  ctx.fillStyle = C.hyp; ctx.beginPath(); ctx.arc(T[0], T[1], 8, 0, 2 * Math.PI); ctx.fill();
  const c = Math.hypot(a, b);
  label(ctx, (labels ? 'hypotenuse ' : 'c = ') + fmt(c, 2), (A[0] + T[0]) / 2 - 10, (A[1] + T[1]) / 2 - 14, C.hyp, { align: 'right' });
  label(ctx, (labels ? (other ? 'opposite ' : 'adjacent ') : 'a = ') + fmt(a, 2), (A[0] + B[0]) / 2, A[1] + (labels ? 16 : -14), other ? C.opp : C.adj);
  label(ctx, (labels ? (other ? 'adjacent ' : 'opposite ') : 'b = ') + fmt(b, 2), B[0] + (labels ? 10 : -10), (B[1] + T[1]) / 2 + (labels ? 0 : 14), other ? C.adj : C.opp, { align: labels ? 'left' : 'right' });
}
function rngL(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gss(r) { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }

export const LEARN = {
  init(a) { app = a; STEPS.forEach((s) => { const w = s.wire; s.wire = () => { wireSliders(); if (w) w(); }; s.leave = () => { L.P = null; }; }); },
  steps: () => STEPS,
};
