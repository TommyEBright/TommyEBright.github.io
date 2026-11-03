/* Output and testing widgets: Frank–Starling, Fick principle, training adaptations, BP waveform, Korotkoff simulator, BP classifier. */
(function () {
  'use strict';
  var D = window.DV, C = D.C, sv = D.sv, txt = D.txt, hx = D.hx, btn = D.btn;
  var W = window.DeckWidgets;

  function axes(s, x0, y0, w, h, xr, yr, xl, yl, xt, yt) {
    var X = D.lin(xr[0], xr[1], x0, x0 + w), Y = D.lin(yr[0], yr[1], y0 + h, y0);
    sv('line', { x1: x0, y1: y0 + h, x2: x0 + w, y2: y0 + h, stroke: C.ink, 'stroke-width': 2 }, s);
    sv('line', { x1: x0, y1: y0, x2: x0, y2: y0 + h, stroke: C.ink, 'stroke-width': 2 }, s);
    xt.forEach(function (v) { sv('line', { x1: X(v), y1: y0 + h, x2: X(v), y2: y0 + h + 6, stroke: C.ink }, s); txt(s, X(v), y0 + h + 26, v, { 'text-anchor': 'middle', 'font-size': 17, fill: C.muted }); });
    yt.forEach(function (v) { sv('line', { x1: x0 - 6, y1: Y(v), x2: x0, y2: Y(v), stroke: C.ink }, s); sv('line', { x1: x0, y1: Y(v), x2: x0 + w, y2: Y(v), stroke: C.line }, s); txt(s, x0 - 10, Y(v) + 6, v, { 'text-anchor': 'end', 'font-size': 17, fill: C.muted }); });
    txt(s, x0 + w / 2, y0 + h + 54, xl, { 'text-anchor': 'middle', 'font-size': 19, 'font-weight': 700, fill: C.ink });
    txt(s, x0 - 58, y0 + h / 2, yl, { 'text-anchor': 'middle', 'font-size': 19, 'font-weight': 700, fill: C.ink, transform: 'rotate(-90 ' + (x0 - 58) + ' ' + (y0 + h / 2) + ')' });
    return { X: X, Y: Y };
  }

  /* ---------- stroke volume, ejection fraction, cardiac output and the Frank–Starling curve ---------- */
  W.starling = function (el) {
    function SV(edv, c) { return c * 150 * (1 - Math.exp(-(edv - 50) / 110)); }
    var edv = 120, hr = 70, c = 1;
    var row = hx('div', 'row', null, el); row.style.gap = '30px';
    var left = hx('div', null, null, row); left.style.flex = '0 0 700px';
    var right = hx('div', 'col', null, row);
    var s = D.svgRoot(left, 700, 520, 'Frank–Starling curve: stroke volume rises with end-diastolic volume, and sympathetic drive moves the curve up');
    var A = axes(s, 90, 20, 580, 420, [50, 230], [0, 170], 'End-diastolic volume, EDV (mL): how full the ventricle is', 'Stroke volume (mL)', [60, 100, 140, 180, 220], [0, 40, 80, 120, 160]);
    function curve(cc, col, dash) {
      var d = ''; for (var e = 55; e <= 230; e += 2) d += (d ? 'L' : 'M') + A.X(e).toFixed(1) + ',' + A.Y(SV(e, cc)).toFixed(1);
      return sv('path', { d: d, fill: 'none', stroke: col, 'stroke-width': 4, 'stroke-dasharray': dash || null }, s);
    }
    curve(1, C.teal);
    var symC = curve(1.35, C.fat, '10 6'); symC.style.opacity = .25;
    txt(s, A.X(225), A.Y(SV(225, 1)) + 28, 'normal', { 'text-anchor': 'end', 'font-size': 17, 'font-weight': 700, fill: C.teal });
    var symL = txt(s, A.X(225), A.Y(SV(225, 1.35)) - 12, 'sympathetic drive', { 'text-anchor': 'end', 'font-size': 17, 'font-weight': 700, fill: C.fat });
    var guideX = sv('line', { stroke: C.faint, 'stroke-dasharray': '4 4' }, s), guideY = sv('line', { stroke: C.faint, 'stroke-dasharray': '4 4' }, s);
    var dot = sv('circle', { r: 11, fill: C.amber, stroke: C.ink, 'stroke-width': 3 }, s);

    // small ventricle showing EDV and ESV
    var vs = D.svgRoot(right, 150, 230, 'Ventricle filling level');
    sv('path', { d: 'M15,10 H135 V160 Q135,220 75,220 Q15,220 15,160 Z', fill: '#fff', stroke: C.oxy, 'stroke-width': 6 }, vs);
    var clip = D.id('vc'); var cp = sv('clipPath', { id: clip }, sv('defs', {}, vs));
    sv('path', { d: 'M18,12 H132 V160 Q132,217 75,217 Q18,217 18,160 Z' }, cp);
    var fillEDV = sv('rect', { x: 0, width: 150, fill: '#f3b2b2', 'clip-path': 'url(#' + clip + ')' }, vs);
    var fillESV = sv('rect', { x: 0, width: 150, fill: C.oxy, 'clip-path': 'url(#' + clip + ')' }, vs);
    vs.style.cssText = 'float:right;margin-left:12px';
    var cap = hx('div', 'tiny', '<b style="color:#d23c3c">■</b> left after the beat (ESV)<br><b style="color:#f3b2b2">■</b> pumped out (SV)', right); cap.style.cssText = 'float:right;clear:right;text-align:right;margin:-4px 0 6px';
    var eS = D.slider(right, 'Filling (EDV)', 60, 220, 1, edv, 240);
    var hS = D.slider(right, 'Heart rate', 40, 200, 1, hr, 240); hS.parentNode.style.marginTop = '8px';
    var bg = hx('div', 'btngroup', null, right); bg.style.margin = '12px 0';
    var symB = btn('Sympathetic drive: off', bg, 'sm'); symB.setAttribute('aria-pressed', 'false');
    var ro = hx('div', 'readouts', null, right); ro.style.clear = 'both';
    var rSV = D.readout(ro, 'SV', C.teal), rEF = D.readout(ro, 'Ejection fraction', C.navy), rQ = D.readout(ro, 'Q = SV × HR', C.red);
    var note = hx('div', 'note-box', '', right); note.style.marginTop = '10px';
    function upd() {
      edv = +eS.value; hr = +hS.value;
      var sv1 = SV(edv, c), esv = edv - sv1, ef = sv1 / edv * 100, q = sv1 * hr / 1000;
      dot.setAttribute('cx', A.X(edv)); dot.setAttribute('cy', A.Y(sv1));
      guideX.setAttribute('x1', A.X(edv)); guideX.setAttribute('x2', A.X(edv)); guideX.setAttribute('y1', A.Y(0)); guideX.setAttribute('y2', A.Y(sv1));
      guideY.setAttribute('x1', A.X(50)); guideY.setAttribute('x2', A.X(edv)); guideY.setAttribute('y1', A.Y(sv1)); guideY.setAttribute('y2', A.Y(sv1));
      var top = 220 - 205 * (edv / 230), mid = 220 - 205 * (esv / 230);
      fillEDV.setAttribute('y', top); fillEDV.setAttribute('height', 230 - top); fillESV.setAttribute('y', mid); fillESV.setAttribute('height', 230 - mid);
      rSV.textContent = Math.round(sv1) + ' mL'; rEF.textContent = Math.round(ef) + ' %'; rQ.textContent = D.fx(q, 1) + ' L/min';
      note.innerHTML = 'ESV = EDV − SV = ' + edv + ' − ' + Math.round(sv1) + ' = <b>' + Math.round(esv) + ' mL</b>. ' +
        (edv >= 170 ? 'More venous return (as in exercise) stretches the muscle more, so it contracts harder: <b>Frank–Starling</b>.' :
         edv <= 85 ? 'Low filling, for example when standing up quickly or when dehydrated, gives a small stroke volume.' :
         'Typical resting values: EDV about 120 mL, SV about 70 mL, EF about 55–70 %, Q about 5 L/min.');
    }
    eS.addEventListener('input', upd); hS.addEventListener('input', upd);
    symB.addEventListener('click', function () {
      c = c === 1 ? 1.35 : 1; var on = c > 1;
      symB.setAttribute('aria-pressed', on); symB.textContent = 'Sympathetic drive: ' + (on ? 'on' : 'off');
      symC.style.opacity = on ? 1 : .25; symL.style.opacity = on ? 1 : .4; upd();
    });
    upd();
  };

  /* ---------- Fick principle ---------- */
  W.fick = function (el) {
    var row = hx('div', 'row', null, el); row.style.gap = '30px';
    var left = hx('div', null, null, row); left.style.flex = '0 0 760px';
    var right = hx('div', 'col', null, row);
    var s = D.svgRoot(left, 760, 500, 'Blood leaves the heart full of oxygen, passes through muscle, and returns with less oxygen. The difference is the a–v O₂ difference.');
    // heart → artery → muscle → vein → heart
    sv('path', { d: 'M150,120 H560 Q640,120 640,200 V300 Q640,380 560,380 H150', fill: 'none', stroke: '#e9eef0', 'stroke-width': 60, 'stroke-linecap': 'round' }, s);
    var art = sv('path', { d: 'M150,120 H560', stroke: C.oxy, 'stroke-width': 30, 'stroke-linecap': 'round' }, s);
    var ven = sv('path', { d: 'M560,380 H150', stroke: C.deoxy, 'stroke-width': 30, 'stroke-linecap': 'round' }, s);
    sv('rect', { x: 560, y: 160, width: 170, height: 180, rx: 24, fill: '#f5d9c9', stroke: '#b86b45', 'stroke-width': 3 }, s);
    txt(s, 645, 240, 'Muscle', { 'text-anchor': 'middle', 'font-size': 24, 'font-weight': 800, fill: '#7a3d1f' });
    txt(s, 645, 298, 'per 100 mL of blood', { 'text-anchor': 'middle', 'font-size': 15, fill: '#7a3d1f' });
    var takeT = txt(s, 645, 274, '', { 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700, fill: '#7a3d1f' });
    sv('path', { d: 'M270,500 C120,400 70,320 90,260 C110,200 200,185 270,250 C340,185 430,200 450,260 C470,320 420,400 270,500 Z', fill: '#e05959', stroke: '#a62b2b', 'stroke-width': 8, transform: 'translate(24 148) scale(0.3)' }, s);
    txt(s, 105, 326, 'Heart', { 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 800, fill: '#a62b2b' });
    var qT = txt(s, 360, 80, '', { 'text-anchor': 'middle', 'font-size': 24, 'font-weight': 800, fill: C.ink });
    // O₂ content bars per 100 mL of blood
    function bar(x, y, lab) {
      sv('rect', { x: x, y: y, width: 200, height: 26, rx: 6, fill: '#fff', stroke: C.line, 'stroke-width': 2 }, s);
      var f = sv('rect', { x: x + 2, y: y + 2, height: 22, rx: 5 }, s);
      var t = txt(s, x, y - 8, lab, { 'font-size': 17, 'font-weight': 700, fill: C.muted });
      return { f: f, t: t };
    }
    var bA = bar(270, 190, ''), bV = bar(270, 290, '');
    bA.f.setAttribute('fill', C.oxy); bV.f.setAttribute('fill', C.deoxy);

    var qS = D.slider(right, 'Cardiac output (L/min)', 3, 40, 0.5, 5, 230);
    var aS = D.slider(right, 'a–v O₂ diff (mL/100 mL)', 3, 18, 0.5, 5, 230); aS.parentNode.style.marginTop = '8px';
    var mL = hx('label', null, '<span class="ctrl-label">Body mass (kg)</span>', right); mL.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:8px';
    var m = hx('input', null, null, mL); m.type = 'number'; m.min = 30; m.max = 150; m.value = 70;
    var bg = hx('div', 'btngroup', null, right); bg.style.margin = '12px 0';
    [['Rest', 5, 5], ['Untrained, max', 20, 15], ['Trained, max', 30, 16], ['Elite endurance, max', 36, 17]].forEach(function (p) {
      btn(p[0], bg, 'sm').addEventListener('click', function () { qS.value = p[1]; aS.value = p[2]; upd(); });
    });
    var f = hx('div', 'formula', '', right); f.style.cssText += ';font-size:26px;display:block';
    var ro = hx('div', 'readouts', null, right); ro.style.marginTop = '10px';
    var rV = D.readout(ro, 'VO₂ (L/min)', C.teal), rR = D.readout(ro, 'VO₂ (mL/kg/min)', C.navy);
    function upd() {
      var q = +qS.value, avd = +aS.value, ca = 20, cv = ca - avd, vo2 = q * avd * 10, mass = D.clamp(+m.value || 70, 30, 150);
      art.setAttribute('stroke-width', 10 + q * 0.8); ven.setAttribute('stroke-width', 10 + q * 0.8);
      qT.textContent = 'Q = ' + D.fx(q, 1) + ' L of blood per minute';
      bA.f.setAttribute('width', 196 * ca / 20); bV.f.setAttribute('width', Math.max(0, 196 * cv / 20));
      bA.t.textContent = 'Arterial: ' + ca + ' mL O₂ per 100 mL'; bV.t.textContent = 'Venous: ' + D.fx(cv, 1) + ' mL O₂ per 100 mL';
      takeT.textContent = 'takes ' + D.fx(avd, 1) + ' mL';
      f.innerHTML = 'VO₂ = Q × (a−v)O₂ diff<br><span style="font-size:22px">= ' + D.fx(q, 1) + ' L/min × ' + D.fx(avd * 10, 0) + ' mL/L = <b>' + Math.round(vo2) + ' mL/min</b></span>';
      rV.textContent = D.fx(vo2 / 1000, 2); rR.textContent = D.fx(vo2 / mass, 1);
    }
    qS.addEventListener('input', upd); aS.addEventListener('input', upd); m.addEventListener('input', upd);
    upd();
  };

  /* ---------- training adaptations ---------- */
  W.adapt = function (el) {
    var R = [
      ['Resting heart rate', 'bpm', 72, 50, 100, 'Bigger stroke volume, same resting cardiac output, so fewer beats are needed (training bradycardia).'],
      ['Resting stroke volume', 'mL', 70, 100, 200, 'Larger, more compliant left ventricle and more blood volume, so it fills more.'],
      ['Resting cardiac output', 'L/min', 5.0, 5.0, 40, 'Barely changes: the body\'s oxygen needs at rest are the same.'],
      ['Maximum heart rate', 'bpm', 195, 193, 220, 'Does not rise with training; it mainly falls with age.'],
      ['Maximum stroke volume', 'mL', 110, 170, 200, 'The main reason VO₂max improves.'],
      ['Maximum cardiac output', 'L/min', 21, 33, 40, 'Max SV × max HR.'],
      ['Max a–v O₂ difference', 'mL/100 mL', 15, 17, 20, 'More capillaries and mitochondria let muscle extract more oxygen.'],
      ['Blood volume', 'L', 5.0, 6.0, 7, 'Plasma rises within weeks; red cells more slowly.'],
      ['Resting blood pressure', 'mmHg (systolic)', 122, 118, 200, 'Falls by about 3–5 / 2–3 mmHg, more in people with hypertension.']
    ];
    var trained = false;
    var bg = hx('div', 'btngroup', null, el); bg.style.marginBottom = '12px';
    var bU = btn('Untrained', bg), bT = btn('Trained endurance athlete', bg);
    var grid = hx('div', null, null, el); grid.style.cssText = 'display:grid;grid-template-columns:330px 1fr 250px;gap:8px 18px;align-items:center;font-size:20px';
    var rows = R.map(function (r) {
      hx('div', null, '<b>' + r[0] + '</b>', grid);
      var track = hx('div', null, null, grid); track.style.cssText = 'position:relative;height:28px;background:#eef3f4;border-radius:8px;cursor:help';
      var ghost = hx('div', null, null, track); ghost.style.cssText = 'position:absolute;left:0;top:0;bottom:0;border-right:3px dashed #7a8a91;border-radius:8px';
      var fill = hx('div', null, null, track); fill.style.cssText = 'position:absolute;left:0;top:5px;bottom:5px;background:#0f8b8d;border-radius:6px;transition:width .5s ease';
      var val = hx('div', null, '', grid); val.style.cssText = 'font-weight:800;font-size:20px';
      track.title = r[5];
      track.addEventListener('click', function () { note.innerHTML = '<b>' + r[0] + ':</b> ' + r[5]; });
      return { r: r, ghost: ghost, fill: fill, val: val };
    });
    var note = hx('div', 'note-box', 'Click a bar to see why it changes. The dashed line marks the untrained value.', el); note.style.marginTop = '12px';
    function upd() {
      bU.setAttribute('aria-pressed', !trained); bT.setAttribute('aria-pressed', trained);
      rows.forEach(function (o) {
        var r = o.r, v = trained ? r[3] : r[2], ch = Math.round((r[3] - r[2]) / r[2] * 100);
        o.ghost.style.width = (r[2] / r[4] * 100) + '%'; o.fill.style.width = (v / r[4] * 100) + '%';
        o.fill.style.background = trained && ch ? (r[0].indexOf('heart rate') > -1 || r[0].indexOf('pressure') > -1 ? C.green : C.teal) : C.teal;
        o.val.innerHTML = v + ' <span style="font-size:15px;color:#4f626b">' + r[1] + '</span>' + (trained && ch ? ' <span style="font-size:16px;color:' + (ch > 0 ? C.tealD : C.green) + '">(' + (ch > 0 ? '+' : '') + ch + '%)</span>' : '');
      });
    }
    bU.addEventListener('click', function () { trained = false; upd(); });
    bT.addEventListener('click', function () { trained = true; upd(); });
    upd();
  };

  // arterial pressure wave shape over one beat, phase 0–1, value 0 (diastolic) to 1 (systolic)
  var E35 = Math.exp(-3.52);
  function wave(p) {
    if (p < 0.12) return Math.sin(Math.PI / 2 * p / 0.12);
    var v = (Math.exp(-(p - 0.12) / 0.25) - E35) / (1 - E35);
    return v + 0.06 * Math.exp(-Math.pow((p - 0.38) / 0.03, 2));   // dicrotic notch bump as the aortic valve closes
  }

  /* ---------- blood pressure waveform, systolic, diastolic and MAP ---------- */
  W.bpwave = function (el) {
    var row = hx('div', 'row', null, el); row.style.gap = '30px';
    var left = hx('div', null, null, row); left.style.flex = '0 0 820px';
    var right = hx('div', 'col', null, row);
    var s = D.svgRoot(left, 820, 400, 'Arterial blood pressure over three beats, with systolic, diastolic and mean arterial pressure marked');
    var A = axes(s, 80, 10, 720, 320, [0, 3], [40, 200], 'Time (heartbeats)', 'Pressure (mmHg)', [0, 1, 2, 3], [40, 80, 120, 160, 200]);
    var path = sv('path', { fill: 'none', stroke: C.oxy, 'stroke-width': 4 }, s);
    function hl(col, dash) { return { l: sv('line', { x1: A.X(0), x2: A.X(3), stroke: col, 'stroke-width': 2.5, 'stroke-dasharray': dash || null }, s), t: txt(s, A.X(3) - 6, 0, '', { 'text-anchor': 'end', 'font-size': 18, 'font-weight': 800, fill: col }) }; }
    var lS = hl(C.red), lD = hl(C.deoxy), lM = hl(C.ink, '8 6');
    var sS = D.slider(right, 'Systolic', 90, 200, 1, 118, 240);
    var dS = D.slider(right, 'Diastolic', 50, 120, 1, 76, 240); dS.parentNode.style.marginTop = '8px';
    var ro = hx('div', 'readouts', null, right); ro.style.marginTop = '12px';
    var rBP = D.readout(ro, 'Blood pressure', C.oxy), rPP = D.readout(ro, 'Pulse pressure', C.muted), rM = D.readout(ro, 'MAP', C.ink);
    var f = hx('div', 'formula', '', right); f.style.cssText += ';font-size:22px;display:block;margin-top:12px';
    var cards = hx('div', 'row', null, el); cards.style.cssText = 'gap:18px;margin-top:4px';
    hx('div', 'card t-teal col step', '<h3 style="font-size:22px">Manual (sphygmomanometer + stethoscope)</h3><p style="font-size:18px"><b>+</b> reference method; works with an irregular pulse; no batteries. <b>−</b> needs skill and good hearing; observer error; slower.</p>', cards);
    hx('div', 'card t-amber col step', '<h3 style="font-size:22px">Automatic (Omron)</h3><p style="font-size:18px"><b>+</b> quick, consistent, no listening skill needed. <b>−</b> thrown by movement, talking or an irregular pulse; must be a validated device and serviced.</p>', cards);
    function upd() {
      var sb = +sS.value, db = +dS.value;
      if (db > sb - 15) { db = sb - 15; dS.value = db; }
      var d = ''; for (var x = 0; x <= 3; x += 0.005) d += (d ? 'L' : 'M') + A.X(x).toFixed(1) + ',' + A.Y(db + (sb - db) * wave(x % 1)).toFixed(1);
      path.setAttribute('d', d);
      var map = db + (sb - db) / 3;
      [[lS, sb, 'Systolic ' + sb], [lD, db, 'Diastolic ' + db], [lM, map, 'MAP ' + Math.round(map)]].forEach(function (a) {
        a[0].l.setAttribute('y1', A.Y(a[1])); a[0].l.setAttribute('y2', A.Y(a[1])); a[0].t.setAttribute('y', A.Y(a[1]) - 8); a[0].t.textContent = a[2];
      });
      lD.t.setAttribute('y', A.Y(db) + 24);
      rBP.textContent = sb + '/' + db; rPP.textContent = (sb - db) + ' mmHg'; rM.textContent = Math.round(map) + ' mmHg';
      f.innerHTML = 'MAP ≈ DBP + ⅓(SBP − DBP)<br>= ' + db + ' + ⅓(' + (sb - db) + ') = <b>' + Math.round(map) + ' mmHg</b>';
    }
    sS.addEventListener('input', upd); dS.addEventListener('input', upd);
    upd();
  };

  /* ---------- Korotkoff sound simulator ---------- */
  W.korot = function (el) {
    var P = null, cuff = 0, rate = 2.5, mode = 'idle', t = 0, nextBeat = 0, raf = null, last = 0;
    var you = { s: null, d: null }, beats = [], visual = true, sound = true, actx = null;
    var row = hx('div', 'row', null, el); row.style.gap = '24px';
    var left = hx('div', null, null, row); left.style.flex = '0 0 820px';
    var right = hx('div', 'col', null, row);
    var s = D.svgRoot(left, 820, 290, 'Aneroid pressure gauge and an arm with a blood pressure cuff and stethoscope');
    // gauge
    var GX = 140, GY = 145, GR = 128;
    sv('circle', { cx: GX, cy: GY, r: GR + 8, fill: '#33444c' }, s);
    sv('circle', { cx: GX, cy: GY, r: GR, fill: '#fff' }, s);
    function ang(p) { return (-225 + 270 * p / 300) * Math.PI / 180; }
    for (var p = 0; p <= 300; p += 10) {
      var a = ang(p), r1 = GR - (p % 50 ? 10 : 20);
      sv('line', { x1: GX + Math.cos(a) * r1, y1: GY + Math.sin(a) * r1, x2: GX + Math.cos(a) * (GR - 3), y2: GY + Math.sin(a) * (GR - 3), stroke: C.ink, 'stroke-width': p % 50 ? 1.5 : 3 }, s);
      if (!(p % 50)) txt(s, GX + Math.cos(a) * (GR - 38), GY + Math.sin(a) * (GR - 38) + 7, p, { 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700 });
    }
    for (p = 0; p <= 300; p += 2) { var a2 = ang(p); sv('line', { x1: GX + Math.cos(a2) * (GR - 6), y1: GY + Math.sin(a2) * (GR - 6), x2: GX + Math.cos(a2) * (GR - 2), y2: GY + Math.sin(a2) * (GR - 2), stroke: '#9aa', 'stroke-width': 1 }, s); }
    txt(s, GX, GY + 52, 'mmHg', { 'text-anchor': 'middle', 'font-size': 16, fill: C.muted });
    var needle = sv('line', { x1: GX, y1: GY, stroke: C.red, 'stroke-width': 4, 'stroke-linecap': 'round' }, s);
    sv('circle', { cx: GX, cy: GY, r: 9, fill: C.ink }, s);
    var dig = txt(s, GX, GY + 90, '0', { 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 800, fill: C.ink });
    // arm, cuff and stethoscope
    sv('path', { d: 'M320,120 H790 Q805,120 805,150 Q805,180 790,180 H320 Z', fill: '#f2d2b6', stroke: '#c79a74', 'stroke-width': 3 }, s);
    var cuffR = sv('rect', { x: 380, y: 104, width: 220, height: 92, rx: 14, fill: '#2f5d74', stroke: '#173a4a', 'stroke-width': 3 }, s);
    txt(s, 490, 158, 'cuff', { 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 800, fill: '#fff' });
    sv('path', { d: 'M430,104 C420,50 320,60 274,120', fill: 'none', stroke: '#333', 'stroke-width': 4 }, s);
    var art = sv('line', { x1: 320, y1: 150, x2: 790, y2: 150, stroke: C.oxy, 'stroke-width': 7, 'stroke-linecap': 'round' }, s);
    sv('path', { d: 'M650,150 C650,240 720,250 760,270', fill: 'none', stroke: '#333', 'stroke-width': 4 }, s);
    sv('circle', { cx: 650, cy: 150, r: 20, fill: '#b9c2c6', stroke: '#333', 'stroke-width': 3 }, s);
    var waves = sv('g', { opacity: 0 }, s);
    [26, 38, 50].forEach(function (r) { sv('path', { d: 'M' + (650 + r * .7) + ',' + (150 - r * .7) + ' A' + r + ',' + r + ' 0 0 1 ' + (650 + r * .7) + ',' + (150 + r * .7), fill: 'none', stroke: C.amber, 'stroke-width': 4, 'stroke-linecap': 'round' }, waves); });
    var tapT = txt(s, 730, 240, '', { 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 800, fill: '#a27100' });
    txt(s, 660, 98, 'stethoscope over', { 'text-anchor': 'middle', 'font-size': 15, fill: C.muted });
    txt(s, 660, 114, 'brachial artery', { 'text-anchor': 'middle', 'font-size': 15, fill: C.muted });
    // pressure chart, revealed at the end
    var cs = D.svgRoot(left, 820, 250, 'Cuff pressure over time, with each heartbeat and the participant\'s true systolic and diastolic pressures');
    var A = axes(cs, 70, 10, 730, 180, [0, 60], [40, 200], 'Time (s)', 'mmHg', [0, 10, 20, 30, 40, 50, 60], [40, 80, 120, 160, 200]);
    var cuffLine = sv('path', { fill: 'none', stroke: '#2f5d74', 'stroke-width': 3 }, cs);
    var beatG = sv('g', {}, cs), trueG = sv('g', { opacity: 0 }, cs);
    var tS = sv('line', { stroke: C.red, 'stroke-width': 2, 'stroke-dasharray': '6 4' }, trueG), tD = sv('line', { stroke: C.deoxy, 'stroke-width': 2, 'stroke-dasharray': '6 4' }, trueG);
    var tSL = txt(cs, 0, 0, '', { 'font-size': 15, 'font-weight': 800, fill: C.red }), tDL = txt(cs, 0, 0, '', { 'font-size': 15, 'font-weight': 800, fill: C.deoxy });
    trueG.appendChild(tSL); trueG.appendChild(tDL);
    var pts = [];

    // controls
    var b1 = hx('div', 'btngroup', null, right);
    var newB = btn('New participant', b1, 'sm'), inf = btn('Inflate to 180', b1, 'sm');
    hx('div', 'ctrl-label', 'Deflation rate', right).style.marginTop = '12px';
    var b2 = hx('div', 'btngroup', null, right); b2.style.marginTop = '4px';
    var rb = [[2.5, '2–3 mmHg/s (correct)'], [10, '10 mmHg/s (too fast)']].map(function (r, i) {
      var b = btn(r[1], b2, 'sm'); b.setAttribute('aria-pressed', i === 0);
      b.addEventListener('click', function () { rate = r[0]; rb.forEach(function (x, j) { x.setAttribute('aria-pressed', j === i); }); });
      return b;
    });
    var b3 = hx('div', 'btngroup', null, right); b3.style.marginTop = '14px';
    var sysB = btn('🔊 Tapping started', b3), diaB = btn('🔇 Tapping gone', b3);
    sysB.style.cssText += ';border-color:#d23c3c'; diaB.style.cssText += ';border-color:#3d6fd1';
    var b4 = hx('div', 'btngroup', null, right); b4.style.marginTop = '10px';
    var sndB = btn('Sound: on', b4, 'ghost sm'), visB = btn('Show taps: on', b4, 'ghost sm');
    var ro = hx('div', 'readouts', null, right); ro.style.marginTop = '12px';
    var rY = D.readout(ro, 'Your reading', C.ink), rT = D.readout(ro, 'True value', C.teal);
    var note = hx('div', 'note-box', '', right); note.style.marginTop = '10px';

    function beep(loud, muffled) {
      if (!sound) return;
      try {
        actx = actx || new (window.AudioContext || window.webkitAudioContext)();
        if (actx.state === 'suspended') actx.resume();
        var now = actx.currentTime, o = actx.createOscillator(), gN = actx.createGain(), f = actx.createBiquadFilter();
        o.type = 'sine'; o.frequency.setValueAtTime(muffled ? 55 : 80, now); o.frequency.exponentialRampToValueAtTime(40, now + 0.09);
        f.type = 'lowpass'; f.frequency.value = muffled ? 160 : 420;
        gN.gain.setValueAtTime(0.0001, now); gN.gain.exponentialRampToValueAtTime(0.9 * loud + 0.05, now + 0.008); gN.gain.exponentialRampToValueAtTime(0.0001, now + (muffled ? 0.16 : 0.1));
        o.connect(f); f.connect(gN); gN.connect(actx.destination); o.start(now); o.stop(now + 0.2);
      } catch (e) { /* audio not available: the visual taps still work */ }
    }
    function newP() {
      var sb = 104 + Math.round(Math.random() * 46), db = 62 + Math.round(Math.random() * Math.min(30, sb - 80));
      P = { s: sb, d: Math.min(db, sb - 30), hr: 58 + Math.round(Math.random() * 26) };
      reset();
    }
    function reset() {
      stop(); mode = 'idle'; cuff = 0; t = 0; you = { s: null, d: null }; beats = []; pts = [];
      cuffLine.setAttribute('d', ''); D.clear(beatG); trueG.setAttribute('opacity', 0);
      rY.textContent = '–'; rT.textContent = '?'; sysB.disabled = diaB.disabled = true; inf.disabled = false;
      note.innerHTML = 'Press <b>Inflate to 180</b>. The cuff squeezes the artery shut, so there is no sound yet.';
      gauge();
    }
    function gauge(j) {
      var a = ang(D.clamp(cuff + (j || 0), 0, 300));
      needle.setAttribute('x2', GX + Math.cos(a) * (GR - 18)); needle.setAttribute('y2', GY + Math.sin(a) * (GR - 18));
      dig.textContent = visual ? Math.round(cuff) : '';
      cuffR.setAttribute('height', 92 + Math.min(14, cuff / 14)); cuffR.setAttribute('y', 104 - Math.min(7, cuff / 28));
    }
    function stop() { cancelAnimationFrame(raf); raf = null; }
    function run() { last = 0; stop(); raf = requestAnimationFrame(tick); }
    function finish() {
      mode = 'done'; sysB.disabled = diaB.disabled = true;
      trueG.setAttribute('opacity', 1);
      [[tS, tSL, P.s, 'true systolic ' + P.s], [tD, tDL, P.d, 'true diastolic ' + P.d]].forEach(function (a) {
        a[0].setAttribute('x1', A.X(0)); a[0].setAttribute('x2', A.X(60)); a[0].setAttribute('y1', A.Y(a[2])); a[0].setAttribute('y2', A.Y(a[2]));
        a[1].setAttribute('x', A.X(60) - 4); a[1].setAttribute('y', A.Y(a[2]) - 6); a[1].setAttribute('text-anchor', 'end'); a[1].textContent = a[3];
      });
      rT.textContent = P.s + '/' + P.d;
      var es = you.s == null ? null : you.s - P.s, ed = you.d == null ? null : you.d - P.d;
      function w(e) { return e == null ? 'not recorded' : (e === 0 ? 'spot on' : (e > 0 ? '+' : '') + e + ' mmHg'); }
      var worst = Math.max(Math.abs(es || 99), Math.abs(ed || 99));
      note.innerHTML = '<b>' + (worst <= 4 ? 'Excellent.' : worst <= 8 ? 'Close.' : 'Some way off.') + '</b> Systolic ' + w(es) + ', diastolic ' + w(ed) + '. ' +
        (rate > 5 ? 'At 10 mmHg/s the cuff drops ' + Math.round(600 / P.hr) + ' mmHg or more between beats, so you cannot land on the true value. Try the correct rate.' :
         'The chart shows each beat: <b>amber</b> beats made a sound. Systolic is the first one; diastolic is where they stop.');
    }
    function tick(ts) {
      var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
      if (!D.isCur(el)) { raf = requestAnimationFrame(tick); return; }
      var jig = 0;
      if (mode === 'inflate') {
        cuff = Math.min(180, cuff + 90 * dt);
        if (cuff >= 180) { mode = 'deflate'; t = 0; nextBeat = 0.3; sysB.disabled = false; note.innerHTML = 'Deflating… listen and watch the gauge. Press <b>Tapping started</b> at the first tap.'; }
      } else if (mode === 'deflate') {
        t += dt; cuff = Math.max(0, cuff - rate * dt);
        pts.push(A.X(Math.min(60, t)).toFixed(1) + ',' + A.Y(D.clamp(cuff, 40, 200)).toFixed(1));
        cuffLine.setAttribute('d', 'M' + pts.join('L'));
        if (t >= nextBeat) {
          nextBeat += 60 / P.hr;
          var tap = cuff < P.s && cuff > P.d, muff = tap && cuff < P.d + 8;
          beats.push(tap);
          sv('circle', { cx: A.X(Math.min(60, t)), cy: A.Y(D.clamp(cuff, 40, 200)), r: tap ? 6 : 3, fill: tap ? C.amber : '#b9c2c6', stroke: tap ? '#8a6200' : 'none' }, beatG);
          if (tap) {
            var loud = muff ? 0.35 : (cuff > P.s - 8 ? 0.55 : 1);
            beep(loud, muff);
            if (visual) { waves.setAttribute('opacity', loud); tapT.textContent = muff ? 'thud (muffled)' : 'tap!'; setTimeout(function () { waves.setAttribute('opacity', 0); tapT.textContent = ''; }, 160); }
          }
          // the needle flickers with each beat while blood pushes against the cuff
          if (cuff < P.s + 15 && cuff > P.d - 15) jig = 2.5;
        }
        if (cuff <= 30 || t >= 60) { mode = 'done'; cuff = 0; finish(); }
      } else if (mode === 'dump') {
        cuff = Math.max(0, cuff - 80 * dt); if (cuff <= 0) { finish(); }
      }
      gauge(jig);
      if (mode === 'inflate' || mode === 'deflate' || mode === 'dump') raf = requestAnimationFrame(tick); else raf = null;
    }
    inf.addEventListener('click', function () {
      if (!P) newP();
      if (mode !== 'idle') reset();
      try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch (e) { /* no audio */ }
      mode = 'inflate'; inf.disabled = true; note.innerHTML = 'Inflating…'; run();
    });
    newB.addEventListener('click', newP);
    sysB.addEventListener('click', function () {
      if (mode !== 'deflate' || you.s != null) return;
      you.s = Math.round(cuff / 2) * 2; rY.textContent = you.s + '/–'; sysB.disabled = true; diaB.disabled = false;
      note.innerHTML = 'Systolic recorded to the nearest 2 mmHg. Keep listening and press <b>Tapping gone</b> when the taps disappear.';
    });
    diaB.addEventListener('click', function () {
      if (mode !== 'deflate' || you.s == null) return;
      you.d = Math.round(cuff / 2) * 2; rY.textContent = you.s + '/' + you.d; mode = 'dump'; diaB.disabled = true;
    });
    sndB.addEventListener('click', function () { sound = !sound; sndB.textContent = 'Sound: ' + (sound ? 'on' : 'off'); });
    visB.addEventListener('click', function () { visual = !visual; visB.textContent = 'Show taps: ' + (visual ? 'on' : 'off'); gauge(); });
    newP();
  };

  /* ---------- classify BP and resting HR, and draft the feedback ---------- */
  var CAT = [
    { n: 'Optimal', s: 120, d: 80, col: '#2e9e5b' },
    { n: 'Normal', s: 130, d: 85, col: '#7cbf4a' },
    { n: 'High normal', s: 140, d: 90, col: '#e2c341' },
    { n: 'Grade 1 hypertension', s: 160, d: 100, col: '#f2a24a' },
    { n: 'Grade 2 hypertension', s: 180, d: 110, col: '#e2683c' },
    { n: 'Grade 3 hypertension', s: 999, d: 999, col: '#c23b3b' }
  ];
  function grade(sb, db) {
    var i = 0; while (i < CAT.length - 1 && (sb >= CAT[i].s || db >= CAT[i].d)) i++;
    return i;
  }
  W.classify = function (el) {
    var row = hx('div', 'row', null, el); row.style.gap = '28px';
    var left = hx('div', null, null, row); left.style.flex = '0 0 640px';
    var right = hx('div', 'col', null, row);
    var s = D.svgRoot(left, 640, 520, 'Blood pressure classification chart: systolic on the horizontal axis, diastolic on the vertical axis, with the participant\'s reading plotted');
    var X = D.lin(80, 200, 80, 620), Y = D.lin(40, 120, 450, 20);
    for (var i = CAT.length - 1; i >= 0; i--) {
      var c = CAT[i], xs = Math.min(200, c.s), ds = Math.min(120, c.d);
      sv('rect', { x: X(80), y: Y(ds), width: X(xs) - X(80), height: Y(40) - Y(ds), fill: c.col, opacity: .8 }, s);
    }
    // isolated systolic hypertension: systolic ≥140 with diastolic <90
    var hatch = D.id('h'), pat = sv('pattern', { id: hatch, width: 10, height: 10, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, sv('defs', {}, s));
    sv('line', { x1: 0, y1: 0, x2: 0, y2: 10, stroke: '#fff', 'stroke-width': 3, opacity: .7 }, pat);
    sv('rect', { x: X(140), y: Y(90), width: X(200) - X(140), height: Y(40) - Y(90), fill: 'url(#' + hatch + ')' }, s);
    txt(s, X(170), Y(52), 'Isolated systolic', { 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 800, fill: '#fff' });
    txt(s, X(170), Y(52) + 18, 'hypertension', { 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 800, fill: '#fff' });
    [['Optimal', 100, 60], ['Normal', 125, 82], ['High normal', 135, 87], ['Grade 1', 150, 95], ['Grade 2', 170, 105], ['Grade 3', 190, 115]].forEach(function (l) {
      txt(s, X(l[1]), Y(l[2]) + 6, l[0], { 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 800, fill: '#1d2b33' });
    });
    [80, 100, 120, 140, 160, 180, 200].forEach(function (v) { txt(s, X(v), 474, v, { 'text-anchor': 'middle', 'font-size': 16, fill: C.muted }); });
    [40, 60, 80, 100, 120].forEach(function (v) { txt(s, 72, Y(v) + 6, v, { 'text-anchor': 'end', 'font-size': 16, fill: C.muted }); });
    txt(s, 350, 504, 'Systolic (mmHg)', { 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700 });
    txt(s, 22, 235, 'Diastolic (mmHg)', { 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700, transform: 'rotate(-90 22 235)' });
    var dot = sv('circle', { r: 12, fill: '#fff', stroke: C.ink, 'stroke-width': 4 }, s);

    var inp = hx('div', 'row', null, right); inp.style.cssText = 'gap:14px;flex-wrap:wrap;align-items:center';
    function num(lab, v) { var l = hx('label', null, '<span class="ctrl-label">' + lab + '</span>', inp); l.style.cssText = 'display:flex;align-items:center;gap:6px'; var n = hx('input', null, null, l); n.type = 'number'; n.value = v; n.style.width = '96px'; return n; }
    var iS = num('SBP', 124), iD = num('DBP', 78), iH = num('Resting HR', 64);
    var bg = hx('div', 'btngroup', null, right); bg.style.margin = '10px 0';
    [[112, 72, 58], [134, 86, 74], [148, 92, 81], [152, 82, 70], [88, 58, 52], [184, 112, 96]].forEach(function (p) {
      btn(p[0] + '/' + p[1], bg, 'sm').addEventListener('click', function () { iS.value = p[0]; iD.value = p[1]; iH.value = p[2]; upd(); });
    });
    var ro = hx('div', 'readouts', null, right);
    var rC = D.readout(ro, 'Blood pressure', C.ink), rM = D.readout(ro, 'MAP', C.muted), rH = D.readout(ro, 'Resting HR', C.red);
    rC.parentNode.style.minWidth = '300px';
    var script = hx('div', 'note-box', '', right); script.style.cssText += ';margin-top:10px;font-size:18.5px;line-height:1.45';
    function upd() {
      var sb = D.clamp(+iS.value || 0, 60, 260), db = D.clamp(+iD.value || 0, 30, 160), hr = D.clamp(+iH.value || 0, 25, 220);
      var gi = grade(sb, db), cat = CAT[gi].n, isolated = sb >= 140 && db < 90, low = gi === 0 && (sb < 90 || db < 60);
      if (isolated) cat = 'Isolated systolic hypertension (' + CAT[gi].n.replace(' hypertension', '') + ')';
      if (low) cat = 'Low';
      dot.setAttribute('cx', X(D.clamp(sb, 80, 200))); dot.setAttribute('cy', Y(D.clamp(db, 40, 120)));
      rC.textContent = cat; rC.style.color = low ? C.deoxy : CAT[gi].col; rC.style.fontSize = '24px';
      rM.textContent = Math.round(db + (sb - db) / 3);
      var hc = hr < 60 ? 'Low' : hr > 100 ? 'High' : 'Normal'; rH.textContent = hr + ' · ' + hc;
      var msg = '<b>Feedback script.</b> "Your blood pressure today was <b>' + sb + ' over ' + db + '</b>. The first number is the pressure as your heart pumps, the second as it relaxes. ';
      if (low) msg += 'That is on the low side. It is usually fine, but if you often feel dizzy or faint, it is worth mentioning to your GP. ';
      else if (gi <= 1) msg += 'That is in the healthy range, which is great. Keeping active, eating well and keeping salt and alcohol down will help keep it there. ';
      else if (gi === 2) msg += 'That is in the high-normal range: not high, but at the upper end. Being active for 150 minutes a week, eating less than 6 g of salt a day and keeping alcohol under 14 units a week can help bring it down. ';
      else if (gi <= 4) msg += 'That is higher than the healthy range today. One reading is not a diagnosis, so we will repeat it after a rest. If it stays high, I would recommend you see your GP to have it checked properly. ';
      else msg += 'That is very high. I would like to check it again now; if it stays at this level, you should contact your GP or NHS 111 today, and get urgent help if you have symptoms such as chest pain, headache or changes in vision. ';
      msg += 'Your resting heart rate was <b>' + hr + ' beats per minute</b>' + (hr < 60 ? ', which is lower than average. That is common in people who do a lot of aerobic exercise.' : hr > 100 ? ', which is higher than normal. Stress, caffeine or recent activity can raise it, so we will check it again after you have rested.' : ', which is in the normal range.') + '"';
      msg += '<br><span class="tiny">Remind them: this is a screening test, not a diagnosis.</span>';
      script.innerHTML = msg;
    }
    [iS, iD, iH].forEach(function (n) { n.addEventListener('input', upd); });
    upd();
  };
})();
