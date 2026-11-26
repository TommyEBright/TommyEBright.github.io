/* Pulse Lab unit tests for dsp.js. Open tests.html in any browser. */
(function () {
  'use strict';
  var D = window.PulseDSP, results = [];
  function test(name, fn) {
    try { var note = fn(); results.push({ name: name, ok: true, note: note || '' }); }
    catch (e) { results.push({ name: name, ok: false, note: e.message }); }
  }
  function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
  function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' expected ' + b + ' +/- ' + tol + ', got ' + a); }
  function sine(f, fs, n, amp) { var x = new Float64Array(n); for (var i = 0; i < n; i++) x[i] = (amp || 1) * Math.sin(2 * Math.PI * f * i / fs); return x; }
  function rms(x, from, to) { var s = 0; for (var i = from; i < to; i++) s += x[i] * x[i]; return Math.sqrt(s / (to - from)); }
  var FS = D.FS;

  /* basic stats */
  test('mean, sd (n - 1) and median', function () {
    near(D.mean([1, 2, 3, 4]), 2.5, 1e-12); near(D.sd([2, 4, 4, 4, 5, 5, 7, 9]), 2.13809, 1e-5); near(D.median([5, 1, 3]), 3, 0); near(D.median([4, 1, 3, 2]), 2.5, 0);
  });

  /* 1. frame sampling */
  test('meanRGB averages RGBA pixels', function () {
    var d = new Uint8ClampedArray([200, 10, 20, 255, 100, 30, 40, 255]);
    var m = D.meanRGB(d); near(m.r, 150, 0); near(m.g, 20, 0); near(m.b, 30, 0);
  });
  test('centreCrop is a centred square', function () {
    var c = D.centreCrop(640, 480, 0.5); near(c.sw, 240, 0); near(c.sx, 200, 0); near(c.sy, 120, 0);
  });

  /* 2. finger detection */
  test('detectFinger: red fingertip, dark and normal scene', function () {
    ok(D.detectFinger({ r: 210, g: 40, b: 20 }).present, 'finger with torch');
    ok(D.detectFinger({ r: 90, g: 25, b: 15 }).present, 'finger by window light');
    near(D.detectFinger({ r: 12, g: 5, b: 5 }).present ? 1 : 0, 0, 0);
    ok(D.detectFinger({ r: 12, g: 5, b: 5 }).reason === 'dark', 'dark reason');
    ok(D.detectFinger({ r: 150, g: 140, b: 130 }).reason === 'notRed', 'room scene');
    ok(D.detectFinger({ r: 32, g: 10, b: 8 }).present, 'dim lens (telephoto, no flash)');
    ok(D.detectFinger({ r: 255, g: 215, b: 190 }).present, 'flash clipping red');
    ok(D.detectFinger({ r: 255, g: 250, b: 245 }).reason === 'bright', 'washed out by the flash');
  });

  /* resampling */
  test('resampleUniform reproduces a linear ramp from irregular samples', function () {
    var t = [0, 31, 70, 99, 140, 165, 200], v = t.map(function (x) { return 2 * x + 5; });
    var r = D.resampleUniform(t, v, 30);
    near(r.values.length, 7, 0);
    for (var k = 0; k < r.values.length; k++) near(r.values[k], 2 * (k * 1000 / 30) + 5, 1e-9, 'sample ' + k);
  });
  test('stream resampler matches batch resampler', function () {
    var t = [0, 35, 66, 101, 130, 170, 199, 240], v = t.map(function (x) { return Math.sin(x / 50); });
    var out = [], s = D.createStreamResampler(30, function (tu, vals) { out.push(vals[0]); });
    t.forEach(function (ti, i) { s.push(ti, [v[i]]); });
    var b = D.resampleUniform(t, v, 30).values;
    near(out.length, b.length, 0);
    for (var i = 0; i < b.length; i++) near(out[i], b[i], 1e-9);
  });

  /* 3. filtering */
  test('detrendLinear removes a straight line exactly', function () {
    var x = []; for (var i = 0; i < 100; i++) x.push(3 + 0.5 * i);
    var y = D.detrendLinear(x); for (var j = 0; j < 100; j++) near(y[j], 0, 1e-9);
  });
  test('band-pass keeps 1.5 Hz and rejects 0.1 Hz and 10 Hz', function () {
    var sec = D.designBandpass(FS, 0.7, 3.5), n = FS * 40;
    var pass = D.filtfilt(sec, sine(1.5, FS, n)), lowF = D.filtfilt(sec, sine(0.1, FS, n)), highF = D.filtfilt(sec, sine(10, FS, n));
    var g = rms(pass, FS * 5, n - FS * 5) / Math.SQRT1_2, gl = rms(lowF, FS * 5, n - FS * 5) / Math.SQRT1_2, gh = rms(highF, FS * 5, n - FS * 5) / Math.SQRT1_2;
    ok(g > 0.85, '1.5 Hz gain ' + g.toFixed(3)); ok(gl < 0.02, '0.1 Hz gain ' + gl.toFixed(4)); ok(gh < 0.05, '10 Hz gain ' + gh.toFixed(4));
    return 'gains: 1.5 Hz ' + g.toFixed(3) + ', 0.1 Hz ' + gl.toFixed(4) + ', 10 Hz ' + gh.toFixed(4);
  });
  test('filtfilt is zero-phase (peaks stay in place)', function () {
    var n = FS * 30, x = sine(1.2, FS, n), y = D.filtfilt(D.designBandpass(FS), x);
    // compare zero crossings in the middle of the signal
    var shiftSum = 0, cnt = 0;
    for (var i = FS * 8; i < n - FS * 8; i++) {
      if (x[i - 1] < 0 && x[i] >= 0) {
        for (var j = i - 5; j < i + 5; j++) if (y[j - 1] < 0 && y[j] >= 0) {
          var fx = (i - 1) + (-x[i - 1]) / (x[i] - x[i - 1]), fy = (j - 1) + (-y[j - 1]) / (y[j] - y[j - 1]);
          shiftSum += Math.abs(fx - fy); cnt++;
        }
      }
    }
    ok(cnt > 10, 'crossings found'); near(shiftSum / cnt / FS * 1000, 0, 1, 'mean phase shift (ms)');
  });
  test('streaming filter matches causal sosfilt', function () {
    var sec = D.designBandpass(FS), x = sine(1.3, FS, 300), f = D.createStreamFilter(sec);
    var y1 = D.sosfilt(sec, Array.from(x));
    for (var i = 0; i < x.length; i++) near(f.process(x[i]), y1[i], 1e-9); // first sample is 0 so offsets agree
  });

  /* 4. beat detection */
  test('parabolicOffset finds the exact vertex of a parabola', function () {
    var vx = 0.3, f = function (i) { return 5 - 2 * Math.pow(i - vx, 2); };
    near(D.parabolicOffset(f(-1), f(0), f(1)), vx, 1e-12);
  });
  test('detectPeaks finds Gaussian pulses to within 3 ms', function () {
    var truth = [], t = 0.6, n = FS * 20, x = new Float64Array(n);
    while (t < 19.4) { truth.push(t); t += 0.7 + 0.15 * Math.sin(truth.length); }
    for (var i = 0; i < n; i++) truth.forEach(function (tb) { x[i] += Math.exp(-0.5 * Math.pow((i / FS - tb) / 0.09, 2)); });
    var p = D.detectPeaks(x, FS);
    near(p.length, truth.length, 0, 'count');
    var worst = 0; p.forEach(function (pk, k) { worst = Math.max(worst, Math.abs(pk.time - truth[k]) * 1000); });
    ok(worst < 3, 'worst error ' + worst.toFixed(2) + ' ms');
    return 'worst timing error ' + worst.toFixed(2) + ' ms';
  });
  test('detectPeaks refractory period ignores a close secondary peak', function () {
    var n = FS * 6, x = new Float64Array(n);
    [1, 2, 3, 4, 5].forEach(function (tb) { for (var i = 0; i < n; i++) x[i] += Math.exp(-0.5 * Math.pow((i / FS - tb) / 0.06, 2)) + 0.7 * Math.exp(-0.5 * Math.pow((i / FS - tb - 0.22) / 0.05, 2)); });
    near(D.detectPeaks(x, FS).length, 5, 0);
  });

  /* 5. artefact correction */
  test('correctArtefacts removes out-of-range and >20% outliers', function () {
    var rr = [800, 810, 790, 805, 250, 800, 1200, 795, 810, 800, 2100, 805];
    var iv = rr.map(function (v) { return { rr: v, seg: 0, t: 0 }; });
    var a = D.correctArtefacts(iv);
    ok(!a.kept[4] && !a.kept[6] && !a.kept[10], 'outliers removed');
    near(a.removed, 3, 0); near(a.removedPct, 25, 1e-9); ok(a.unreliable, '> 20% flagged');
  });
  test('correctArtefacts keeps a steady series', function () {
    var iv = []; for (var i = 0; i < 60; i++) iv.push({ rr: 850 + 40 * Math.sin(i / 2), seg: 0, t: i });
    var a = D.correctArtefacts(iv); near(a.removed, 0, 0); ok(!a.unreliable);
  });

  /* 7. metrics */
  test('computeMetrics: RMSSD, SDNN, HR on a hand-worked example', function () {
    var iv = [800, 820, 780, 800].map(function (v) { return { rr: v, seg: 0 }; });
    var m = D.computeMetrics(iv);
    near(m.rmssd, Math.sqrt(800), 1e-9, 'RMSSD'); near(m.meanRR, 800, 1e-9); near(m.hr, 75, 1e-9);
    near(m.sdnn, Math.sqrt(800 / 3), 1e-9, 'SDNN'); near(m.lnRmssd, Math.log(Math.sqrt(800)), 1e-12);
  });
  test('Poincare identity: SD1^2 + SD2^2 = 2 SDNN^2, and SD1 ~ RMSSD / sqrt 2', function () {
    var iv = []; for (var i = 0; i < 200; i++) iv.push({ rr: 900 + 50 * Math.sin(i / 3) + 10 * Math.cos(i * 1.7), seg: 0 });
    var m = D.computeMetrics(iv);
    near(m.sd1 * m.sd1 + m.sd2 * m.sd2, 2 * m.sdnn * m.sdnn, 1e-6);
    near(m.sd1, m.rmssd / Math.SQRT2, 0.5);
  });
  test('RMSSD skips differences across a removed beat and across segments', function () {
    var iv = [{ rr: 800, seg: 0 }, { rr: 820, seg: 0 }, { rr: 400, seg: 0 }, { rr: 810, seg: 0 }, { rr: 830, seg: 0 }, { rr: 900, seg: 1 }, { rr: 910, seg: 1 }];
    var m = D.computeMetrics(iv, [true, true, false, true, true, true, true]);
    near(m.nDiffs, 3, 0); near(m.rmssd, Math.sqrt((400 + 400 + 100) / 3), 1e-9);
  });

  /* 6. signal quality */
  test('autocorrPeriodicity: high for a pulse, low for noise', function () {
    var rng = D.mulberry32(3), n = FS * 8, noise = new Float64Array(n);
    for (var i = 0; i < n; i++) noise[i] = D.gauss(rng);
    var a = D.autocorrPeriodicity(sine(1.2, FS, n), FS), b = D.autocorrPeriodicity(noise, FS);
    ok(a.value > 0.9, 'sine ' + a.value.toFixed(2)); near(a.lag, 1 / 1.2, 0.04, 'lag'); ok(b.value < 0.35, 'noise ' + b.value.toFixed(2));
  });
  test('signalQuality bounds and levels', function () {
    var hi = D.signalQuality({ perfusion: 1, periodicity: 0.95, stability: 1 }), lo = D.signalQuality({ perfusion: 0, periodicity: 0, stability: 0 });
    near(hi.score, 100, 0); near(lo.score, 0, 0); ok(hi.level === 'good' && lo.level === 'poor');
    ok(D.qualityLevel(55) === 'fair');
  });
  test('quality is higher for a clean synthetic signal than a noisy one', function () {
    var clean = D.synthPPG({ duration: 20, seed: 4, noise: 0.1 }), noisy = D.synthPPG({ duration: 20, seed: 4, noise: 6 });
    var qc = D.analyseWindow(D.resampleUniform(clean.times, clean.red, FS).values.subarray(FS * 5, FS * 13), FS).quality.score;
    var qn = D.analyseWindow(D.resampleUniform(noisy.times, noisy.red, FS).values.subarray(FS * 5, FS * 13), FS).quality.score;
    ok(qc > qn + 20, 'clean ' + qc + ' vs noisy ' + qn); ok(qc >= 70, 'clean is good');
    return 'clean ' + qc + ', noisy ' + qn;
  });

  /* HRV score */
  test('hrvScore mapping (ln RMSSD 1 -> 0, 3 -> 50, 5 -> 100, clamped)', function () {
    near(D.hrvScore(1), 0, 0); near(D.hrvScore(3), 50, 0); near(D.hrvScore(4), 75, 0); near(D.hrvScore(5), 100, 0);
    near(D.hrvScore(7), 100, 0); near(D.hrvScore(0.2), 0, 0); near(D.hrvScore(NaN), 0, 0);
  });

  test('hrvScoreBand boundaries', function () {
    ok(D.hrvScoreBand(0).key === 'low' && D.hrvScoreBand(44).key === 'low', 'low');
    ok(D.hrvScoreBand(45).key === 'moderate' && D.hrvScoreBand(64).key === 'moderate', 'moderate');
    ok(D.hrvScoreBand(65).key === 'good' && D.hrvScoreBand(79).key === 'good', 'good');
    ok(D.hrvScoreBand(80).key === 'high' && D.hrvScoreBand(100).key === 'high', 'high');
    D.SCORE_BANDS.forEach(function (b) { ok(b.text.indexOf('\u2014') < 0 && b.title.indexOf('\u2014') < 0, 'no em dashes'); });
  });

  /* trends */
  test('trendSummary: baseline, SWC band and status', function () {
    var day = 864e5, now = new Date(2026, 10, 24, 8, 0).getTime(), r = [];
    var ln = [4.0, 4.2, 3.9, 4.1, 4.0, 4.1, 3.9];
    ln.forEach(function (v, i) { r.push({ ts: now - (7 - i) * day, lnRmssd: v, hr: 60 + i }); });
    var base = D.mean(ln), swc = 0.5 * D.sd(ln);
    var s = D.trendSummary(r.concat([{ ts: now, lnRmssd: 3.5, hr: 70 }]), now);
    ok(s.status === 'below', 'below'); near(s.baseline.swc, swc, 1e-9); near(s.baseline.lnMean, base, 1e-9); near(s.hrDelta, 70 - 63, 1e-9);
    ok(D.trendSummary(r.concat([{ ts: now, lnRmssd: base, hr: 62 }]), now).status === 'within', 'within');
    ok(D.trendSummary(r.concat([{ ts: now, lnRmssd: 4.6, hr: 55 }]), now).status === 'above', 'above');
    ok(D.trendSummary(r.slice(5).concat([{ ts: now, lnRmssd: 4, hr: 60 }]), now).status === 'building', 'building');
    ok(D.trendSummary(r, now).status === 'none', 'none today');
  });
  test('dailySeries averages several readings on the same day', function () {
    var t = new Date(2026, 10, 20, 7).getTime();
    var d = D.dailySeries([{ ts: t, lnRmssd: 4, hr: 60 }, { ts: t + 3600e3, lnRmssd: 3, hr: 70 }]);
    near(d.length, 1, 0); near(d[0].ln, 3.5, 1e-12); near(d[0].hr, 65, 1e-12);
  });

  /* CSV */
  test('CSV exports have headers and one row per beat', function () {
    var s = D.synthPPG({ duration: 20, seed: 2 });
    var seg = [{ t0: 0, red: D.resampleUniform(s.times, s.red, FS).values, green: D.resampleUniform(s.times, s.green, FS).values }];
    var res = D.analyseRecording(seg, FS);
    var lines = D.beatsCSV(res, Date.UTC(2026, 10, 24, 9)).trim().split('\n');
    ok(lines[0] === 'beat,time_s,clock_iso,rr_ms,kept,segment', 'header');
    near(lines.length - 1, res.beats.length, 0);
    ok(/2026-11-24T09:00:/.test(lines[1]), 'clock time');
    ok(D.summaryCSV(res).indexOf('rmssd,') > 0, 'summary');
    ok(D.ppgCSV(res, FS).trim().split('\n').length - 1 === seg[0].red.length, 'ppg rows');
  });

  /* 8. full pipeline against synthetic signals with known RR */
  [1, 7, 42, 99, 2026].forEach(function (seed) {
    test('full pipeline RMSSD within 2 ms of the known value (seed ' + seed + ')', function () {
      var s = D.synthPPG({ duration: 75, seed: seed });
      var from = 15, to = 75, idx = [];
      for (var i = 0; i < s.times.length; i++) if (s.times[i] >= from * 1000) idx.push(i);
      var times = idx.map(function (i) { return s.times[i]; }), red = idx.map(function (i) { return s.red[i]; }), green = idx.map(function (i) { return s.green[i]; });
      var seg = [{ t0: 0, red: D.resampleUniform(times, red, FS).values, green: D.resampleUniform(times, green, FS).values }];
      var res = D.analyseRecording(seg, FS);
      var known = D.rmssdOf(D.knownIntervals(s, times[0] / 1000, times[times.length - 1] / 1000));
      near(res.metrics.rmssd, known, 2, 'RMSSD');
      ok(res.reliable, 'reliable');
      return 'known ' + known.toFixed(2) + ' ms, computed ' + res.metrics.rmssd.toFixed(2) + ' ms (diff ' + (res.metrics.rmssd - known).toFixed(2) + '), HR ' + res.metrics.hr.toFixed(1) + ', SQI ' + res.quality.score + ', artefacts ' + res.artefacts.removedPct.toFixed(1) + '%';
    });
  });
  test('pipeline flags a reading with heavy motion artefacts as unreliable', function () {
    var s = D.synthPPG({ duration: 60, seed: 5 }), rng = D.mulberry32(9);
    // add large random spikes (motion)
    for (var i = 0; i < s.red.length; i++) if (rng() < 0.04) { var a = 40 * D.gauss(rng); for (var k = 0; k < 6 && i + k < s.red.length; k++) { s.red[i + k] += a; s.green[i + k] += a; } }
    var seg = [{ t0: 0, red: D.resampleUniform(s.times, s.red, FS).values, green: D.resampleUniform(s.times, s.green, FS).values }];
    var res = D.analyseRecording(seg, FS);
    ok(!res.reliable, 'should be unreliable (artefacts ' + res.artefacts.removedPct.toFixed(1) + '%, SQI ' + res.quality.score + ')');
    return 'artefacts ' + res.artefacts.removedPct.toFixed(1) + '%, SQI ' + res.quality.score;
  });
  test('two segments (finger lifted and replaced) analyse without cross-gap intervals', function () {
    var s = D.synthPPG({ duration: 70, seed: 11 });
    function cut(a, b) {
      var idx = []; for (var i = 0; i < s.times.length; i++) if (s.times[i] >= a * 1000 && s.times[i] < b * 1000) idx.push(i);
      var t = idx.map(function (i) { return s.times[i]; });
      return { t0: a, red: D.resampleUniform(t, idx.map(function (i) { return s.red[i]; }), FS).values, green: D.resampleUniform(t, idx.map(function (i) { return s.green[i]; }), FS).values };
    }
    var res = D.analyseRecording([cut(5, 35), cut(40, 70)], FS);
    ok(res.intervals.every(function (iv) { return iv.rr < 2000; }), 'no gap-spanning interval');
    var known = D.rmssdOf(D.knownIntervals(s, 5, 35).concat(D.knownIntervals(s, 40, 70)));
    near(res.metrics.rmssd, known, 3, 'RMSSD');
  });

  /* render */
  var pass = results.filter(function (r) { return r.ok; }).length;
  var out = document.getElementById('out'), sum = document.getElementById('summary');
  sum.textContent = pass + ' of ' + results.length + ' tests passed';
  sum.className = pass === results.length ? 'pass' : 'fail';
  results.forEach(function (r) {
    var li = document.createElement('li');
    li.className = r.ok ? 'pass' : 'fail';
    li.innerHTML = '<b>' + (r.ok ? 'PASS' : 'FAIL') + '</b> <span></span><div class="note"></div>';
    li.querySelector('span').textContent = r.name;
    li.querySelector('.note').textContent = r.note;
    out.appendChild(li);
  });
  window.__testResults = { passed: pass, total: results.length, results: results };
})();
