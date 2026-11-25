/*
 * Pulse Lab: signal processing for camera photoplethysmography (PPG).
 *
 * Every function in this file is pure (no DOM, no globals, no side effects)
 * so it can be unit tested in the browser (tests.html) or in Node.
 * Exposed as window.PulseDSP (or module.exports in Node).
 *
 * Pipeline (see analyseRecording):
 *   frame RGB means -> finger check -> resample to 30 Hz -> linear detrend
 *   -> Butterworth band-pass 0.7 to 3.5 Hz (zero-phase, forward-backward)
 *   -> invert (blood volume up = less light) -> adaptive-threshold peaks
 *   with refractory period and parabolic interpolation -> RR intervals
 *   -> artefact correction -> HRV metrics + signal quality index.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PulseDSP = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FS = 30; // uniform analysis rate, Hz

  /* ---------------------------------------------------------------- utils */
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function clamp01(v) { return clamp(v, 0, 1); }
  function mean(a) {
    if (!a || !a.length) return NaN;
    var s = 0; for (var i = 0; i < a.length; i++) s += a[i];
    return s / a.length;
  }
  /** Sample standard deviation (n - 1). */
  function sd(a) {
    if (!a || a.length < 2) return NaN;
    var m = mean(a), s = 0;
    for (var i = 0; i < a.length; i++) { var d = a[i] - m; s += d * d; }
    return Math.sqrt(s / (a.length - 1));
  }
  function median(a) {
    if (!a || !a.length) return NaN;
    var b = Array.prototype.slice.call(a).sort(function (x, y) { return x - y; });
    var h = b.length >> 1;
    return b.length % 2 ? b[h] : (b[h - 1] + b[h]) / 2;
  }

  /* ------------------------------------------------ 1. frame sampling */
  /**
   * Centred square crop of a video frame, as a fraction of the short side.
   * Used to draw a small central region onto the offscreen canvas.
   */
  function centreCrop(videoW, videoH, frac) {
    frac = frac || 0.4;
    var side = Math.max(1, Math.round(Math.min(videoW, videoH) * frac));
    return { sx: Math.round((videoW - side) / 2), sy: Math.round((videoH - side) / 2), sw: side, sh: side };
  }

  /** Mean R, G, B of RGBA pixel data (e.g. ImageData.data). */
  function meanRGB(data) {
    var r = 0, g = 0, b = 0, n = data.length / 4;
    for (var i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
    return n ? { r: r / n, g: g / n, b: b / n } : { r: 0, g: 0, b: 0 };
  }

  /* ------------------------------------------------ 2. finger detection */
  var FINGER = { minRed: 25, dominance: 1.25, satRed: 225, satDominance: 1.12 };
  /**
   * A fingertip lit from behind (or by the flash) looks strongly red.
   * present: red bright enough AND red clearly dominates green and blue.
   * reason: 'ok' | 'dark' (too little light) | 'notRed' (camera sees a scene, not a finger)
   */
  function detectFinger(rgb, opts) {
    var o = opts || FINGER;
    var minRed = o.minRed != null ? o.minRed : FINGER.minRed;
    var dom = o.dominance != null ? o.dominance : FINGER.dominance;
    if (rgb.r < minRed) return { present: false, reason: 'dark' };
    var redDominant = rgb.r >= dom * Math.max(rgb.g, 1) && rgb.r >= dom * Math.max(rgb.b, 1);
    // A bright flash right next to the lens can clip the red channel at 255
    // while green and blue keep rising, so allow a smaller margin when red is saturated.
    if (!redDominant && rgb.r >= FINGER.satRed) {
      redDominant = rgb.r >= FINGER.satDominance * rgb.g && rgb.r >= FINGER.satDominance * rgb.b;
    }
    if (!redDominant) return { present: false, reason: 'notRed' };
    return { present: true, reason: 'ok' };
  }

  /* ------------------------------------------------ resampling */
  /**
   * Linear interpolation of irregular samples onto a uniform grid.
   * times: ms, ascending. values: numbers. Returns { t0 (ms), fs, values: Float64Array }.
   */
  function resampleUniform(times, values, fs) {
    fs = fs || FS;
    var n = times.length;
    if (n < 2) return { t0: n ? times[0] : 0, fs: fs, values: new Float64Array(n ? [values[0]] : []) };
    var dt = 1000 / fs, t0 = times[0];
    var m = Math.floor((times[n - 1] - t0) / dt) + 1;
    var out = new Float64Array(m), j = 0;
    for (var k = 0; k < m; k++) {
      var t = t0 + k * dt;
      while (j < n - 2 && times[j + 1] <= t) j++;
      var ta = times[j], tb = times[j + 1];
      var w = tb > ta ? (t - ta) / (tb - ta) : 0;
      out[k] = values[j] + clamp01(w) * (values[j + 1] - values[j]);
    }
    return { t0: t0, fs: fs, values: out };
  }

  /**
   * Streaming version for live use. push(tMs, [ch0, ch1, ...]) calls
   * onSample(tUniformMs, interpolatedValues) for every uniform tick passed.
   */
  function createStreamResampler(fs, onSample) {
    var dt = 1000 / (fs || FS), lastT = null, lastV = null, nextT = null;
    return {
      push: function (t, v) {
        if (lastT === null) { lastT = t; lastV = v.slice(); nextT = t; onSample(t, v.slice()); nextT += dt; return; }
        if (t <= lastT) return; // duplicate or out-of-order frame
        while (nextT <= t) {
          var w = (nextT - lastT) / (t - lastT), out = new Array(v.length);
          for (var c = 0; c < v.length; c++) out[c] = lastV[c] + w * (v[c] - lastV[c]);
          onSample(nextT, out);
          nextT += dt;
        }
        lastT = t; lastV = v.slice();
      },
      reset: function () { lastT = lastV = nextT = null; }
    };
  }

  /* ------------------------------------------------ 3. filtering */
  /** Remove the least-squares straight line. */
  function detrendLinear(x) {
    var n = x.length, out = new Float64Array(n);
    if (n < 2) { if (n) out[0] = 0; return out; }
    var sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (var i = 0; i < n; i++) { sx += i; sy += x[i]; sxx += i * i; sxy += i * x[i]; }
    var slope = (n * sxy - sx * sy) / (n * sxx - sx * sx), icpt = (sy - slope * sx) / n;
    for (var k = 0; k < n; k++) out[k] = x[k] - (icpt + slope * k);
    return out;
  }

  /*
   * Second-order Butterworth sections (Q = 1/sqrt 2) from the RBJ audio EQ
   * cookbook, bilinear transform. A 2nd-order high-pass at `lo` cascaded with
   * a 2nd-order low-pass at `hi` gives a 4th-order band-pass. Run forwards
   * then backwards (filtfilt) the response is zero-phase and the magnitude
   * is squared (effectively 8th order roll-off).
   */
  function biquad(type, fs, fc, Q) {
    Q = Q || Math.SQRT1_2;
    var w0 = 2 * Math.PI * fc / fs, c = Math.cos(w0), alpha = Math.sin(w0) / (2 * Q);
    var b0, b1, b2, a0 = 1 + alpha, a1 = -2 * c, a2 = 1 - alpha;
    if (type === 'lowpass') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
    else { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
  }
  function designBandpass(fs, lo, hi) {
    fs = fs || FS; lo = lo || 0.7; hi = hi || 3.5;
    return [biquad('highpass', fs, lo), biquad('lowpass', fs, hi)];
  }
  /** Causal filtering through cascaded biquads (direct form II transposed). */
  function sosfilt(sections, x) {
    var y = Float64Array.from(x);
    for (var s = 0; s < sections.length; s++) {
      var q = sections[s], z1 = 0, z2 = 0;
      for (var i = 0; i < y.length; i++) {
        var xi = y[i], yi = q.b0 * xi + z1;
        z1 = q.b1 * xi - q.a1 * yi + z2;
        z2 = q.b2 * xi - q.a2 * yi;
        y[i] = yi;
      }
    }
    return y;
  }
  /** Zero-phase forward-backward filter with odd-reflection padding (like scipy.signal.filtfilt). */
  function filtfilt(sections, x, padSamples) {
    var n = x.length;
    if (n < 4) return Float64Array.from(x);
    var pad = Math.min(n - 1, padSamples != null ? padSamples : 3 * FS);
    var ext = new Float64Array(n + 2 * pad), i;
    for (i = 0; i < pad; i++) ext[i] = 2 * x[0] - x[pad - i];
    for (i = 0; i < n; i++) ext[pad + i] = x[i];
    for (i = 0; i < pad; i++) ext[pad + n + i] = 2 * x[n - 1] - x[n - 2 - i];
    var y = sosfilt(sections, ext); y.reverse();
    y = sosfilt(sections, y); y.reverse();
    return y.subarray(pad, pad + n).slice();
  }
  /** Stateful filter for the live waveform: process(sample) -> filtered sample. */
  function createStreamFilter(sections) {
    var st = sections.map(function () { return [0, 0]; }), primed = false, first = 0;
    return {
      process: function (v) {
        if (!primed) { primed = true; first = v; }
        var x = v - first; // subtract first value so the high-pass starts near rest
        for (var s = 0; s < sections.length; s++) {
          var q = sections[s], z = st[s], y = q.b0 * x + z[0];
          z[0] = q.b1 * x - q.a1 * y + z[1];
          z[1] = q.b2 * x - q.a2 * y;
          x = y;
        }
        return x;
      },
      reset: function () { st = sections.map(function () { return [0, 0]; }); primed = false; }
    };
  }
  /** Detrend, band-pass (zero-phase) and invert so each heartbeat is a positive peak. */
  function preparePulse(raw, fs) {
    fs = fs || FS;
    var y = filtfilt(designBandpass(fs), detrendLinear(raw), 3 * fs);
    for (var i = 0; i < y.length; i++) y[i] = -y[i];
    return y;
  }

  /* ------------------------------------------------ 4. beat detection */
  /** Vertex offset (in samples, -0.5 to 0.5) of the parabola through three points. */
  function parabolicOffset(ym1, y0, yp1) {
    var d = ym1 - 2 * y0 + yp1;
    if (d >= 0) return 0;
    return clamp(0.5 * (ym1 - yp1) / d, -0.5, 0.5);
  }
  /**
   * Adaptive-threshold peak detection.
   * A local maximum counts if it is positive and at least `frac` of the
   * largest value within +/- `win` seconds. Candidates are accepted largest
   * first, rejecting any within `refractory` seconds of an accepted peak.
   * Times are refined below the frame interval by parabolic interpolation.
   * Returns [{ index, time (s), amp }] in time order.
   */
  function detectPeaks(x, fs, opts) {
    fs = fs || FS; opts = opts || {};
    var refr = Math.round((opts.refractory || 0.33) * fs);
    var half = Math.round((opts.win || 1.0) * fs), frac = opts.frac || 0.5;
    var n = x.length, cands = [], i, k;
    for (i = 1; i < n - 1; i++) {
      if (!(x[i] > x[i - 1] && x[i] >= x[i + 1] && x[i] > 0)) continue;
      var lo = Math.max(0, i - half), hi = Math.min(n - 1, i + half), mx = -Infinity;
      for (k = lo; k <= hi; k++) if (x[k] > mx) mx = x[k];
      if (x[i] >= frac * mx) cands.push(i);
    }
    cands.sort(function (a, b) { return x[b] - x[a]; });
    var taken = [];
    for (i = 0; i < cands.length; i++) {
      var c = cands[i], ok = true;
      for (k = 0; k < taken.length; k++) if (Math.abs(taken[k] - c) < refr) { ok = false; break; }
      if (ok) taken.push(c);
    }
    taken.sort(function (a, b) { return a - b; });
    return taken.map(function (idx) {
      var off = parabolicOffset(x[idx - 1], x[idx], x[idx + 1]);
      return { index: idx, time: (idx + off) / fs, amp: x[idx] };
    });
  }

  /** Live (causal) beat detector for the beating heart and haptics only. */
  function createLiveBeatDetector(fs, opts) {
    fs = fs || FS; opts = opts || {};
    var decay = Math.exp(-1 / (fs * 1.5)), refr = (opts.refractory || 0.33) * fs;
    var env = 0, p2 = 0, p1 = 0, idx = 0, last = -Infinity;
    return {
      process: function (y) {
        env = Math.max(env * decay, Math.abs(y));
        var beat = p1 > p2 && p1 >= y && p1 > 0.5 * env && (idx - 1 - last) >= refr;
        if (beat) last = idx - 1;
        p2 = p1; p1 = y; idx++;
        return beat;
      },
      reset: function () { env = p2 = p1 = idx = 0; last = -Infinity; }
    };
  }

  /** Beat times (s) -> intervals [{ t: time of the later beat (s), rr: ms, seg }]. */
  function intervalsFromPeaks(peaks, t0, seg) {
    t0 = t0 || 0; seg = seg || 0;
    var out = [];
    for (var i = 1; i < peaks.length; i++) {
      out.push({ t: t0 + peaks[i].time, rr: (peaks[i].time - peaks[i - 1].time) * 1000, seg: seg });
    }
    return out;
  }

  /* ------------------------------------------------ 5. artefact correction */
  /**
   * Reject intervals outside [min, max] ms, or differing by more than `tol`
   * (fraction) from the median of up to `half` in-range neighbours either
   * side within the same segment. Removed beats are not replaced; metrics
   * only use successive differences where both intervals were kept.
   */
  function correctArtefacts(intervals, opts) {
    opts = opts || {};
    var min = opts.min || 300, max = opts.max || 2000, tol = opts.tol != null ? opts.tol : 0.2, half = opts.half || 5;
    var n = intervals.length, inRange = [], kept = [], i, j;
    for (i = 0; i < n; i++) inRange.push(intervals[i].rr >= min && intervals[i].rr <= max);
    for (i = 0; i < n; i++) {
      if (!inRange[i]) { kept.push(false); continue; }
      var nb = [];
      for (j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) {
        if (j !== i && inRange[j] && intervals[j].seg === intervals[i].seg) nb.push(intervals[j].rr);
      }
      if (nb.length < 2) { kept.push(true); continue; }
      var med = median(nb);
      kept.push(Math.abs(intervals[i].rr - med) / med <= tol);
    }
    var removed = kept.filter(function (k) { return !k; }).length;
    var pct = n ? 100 * removed / n : 0;
    return { kept: kept, removed: removed, removedPct: pct, unreliable: pct > 20 };
  }

  /* ------------------------------------------------ 7. metrics */
  /**
   * Time-domain and Poincare HRV metrics from kept intervals.
   * RMSSD: root mean square of successive differences (only between two
   *   adjacent kept intervals in the same segment).
   * SDNN: sample SD of kept intervals.
   * SD1 = sqrt(0.5) x SD(successive differences); SD2 = sqrt(2 SDNN^2 - SD1^2).
   */
  function computeMetrics(intervals, kept) {
    kept = kept || intervals.map(function () { return true; });
    var rr = [], diffs = [], i;
    for (i = 0; i < intervals.length; i++) if (kept[i]) rr.push(intervals[i].rr);
    for (i = 1; i < intervals.length; i++) {
      if (kept[i] && kept[i - 1] && intervals[i].seg === intervals[i - 1].seg) diffs.push(intervals[i].rr - intervals[i - 1].rr);
    }
    var meanRR = mean(rr);
    var rmssd = diffs.length ? Math.sqrt(mean(diffs.map(function (d) { return d * d; }))) : NaN;
    var sdnn = sd(rr), sdsd = sd(diffs);
    var sd1 = Math.SQRT1_2 * sdsd;
    var sd2 = Math.sqrt(Math.max(0, 2 * sdnn * sdnn - sd1 * sd1));
    return {
      meanRR: meanRR, hr: 60000 / meanRR, rmssd: rmssd, lnRmssd: Math.log(rmssd),
      sdnn: sdnn, sd1: sd1, sd2: sd2, nIntervals: rr.length, nDiffs: diffs.length
    };
  }

  /* ------------------------------------------------ 6. signal quality */
  /**
   * Periodicity: highest normalised autocorrelation (Pearson r between the
   * signal and a lagged copy) at a local maximum for lags 0.33 to 1.5 s
   * (40 to 180 bpm). A clean pulse gives values near 1, noise near 0.
   */
  function autocorrPeriodicity(x, fs, minLag, maxLag) {
    fs = fs || FS;
    var lo = Math.round((minLag || 0.33) * fs), hi = Math.round((maxLag || 1.5) * fs), n = x.length;
    if (n < hi + 10) hi = n - 10;
    if (hi <= lo + 1) return { value: 0, lag: NaN };
    var r = [];
    for (var k = lo - 1; k <= hi + 1; k++) {
      var m = n - k, sa = 0, sb = 0, i;
      for (i = 0; i < m; i++) { sa += x[i]; sb += x[i + k]; }
      sa /= m; sb /= m;
      var num = 0, da = 0, db = 0;
      for (i = 0; i < m; i++) { var a = x[i] - sa, b = x[i + k] - sb; num += a * b; da += a * a; db += b * b; }
      r.push(da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0);
    }
    var best = 0, lag = NaN;
    for (var j = 1; j < r.length - 1; j++) {
      if (r[j] >= r[j - 1] && r[j] >= r[j + 1] && r[j] > best) { best = r[j]; lag = (lo - 1 + j) / fs; }
    }
    return { value: best, lag: lag };
  }
  /** Pulse amplitude as a perfusion-style index: SD of the pulse as a percentage of the raw mean. */
  function perfusionIndex(pulse, raw) {
    var m = mean(raw);
    return m > 0 ? 100 * sd(pulse) / m : 0;
  }
  /**
   * Signal quality index, 0 to 100:
   *   25% pulse amplitude (perfusion 0.02% -> 0, 0.25% or more -> full)
   *   45% periodicity (autocorrelation 0.2 -> 0, 0.8 or more -> full)
   *   30% interval stability (fraction of intervals kept by artefact correction)
   * level: 'poor' (< 40), 'fair' (40 to 69), 'good' (70+).
   */
  function signalQuality(parts) {
    var amp = clamp01((parts.perfusion - 0.02) / (0.25 - 0.02));
    var per = clamp01((parts.periodicity - 0.2) / (0.8 - 0.2));
    var stab = clamp01(parts.stability);
    var score = Math.round(100 * (0.25 * amp + 0.45 * per + 0.30 * stab));
    return { score: score, level: qualityLevel(score), amp: amp, per: per, stab: stab };
  }
  function qualityLevel(score) { return score >= 70 ? 'good' : score >= 40 ? 'fair' : 'poor'; }

  /** Quick analysis of a short window (about 8 s) for the live quality bar. */
  function analyseWindow(raw, fs) {
    fs = fs || FS;
    if (raw.length < fs * 3) return { quality: signalQuality({ perfusion: 0, periodicity: 0, stability: 0 }), pulse: new Float64Array(0) };
    var pulse = preparePulse(raw, fs);
    var peaks = detectPeaks(pulse, fs);
    var iv = intervalsFromPeaks(peaks);
    var art = correctArtefacts(iv);
    var stability = iv.length >= 3 ? 1 - art.removed / iv.length : 0;
    var per = autocorrPeriodicity(pulse, fs).value;
    var pi = perfusionIndex(pulse, raw);
    return { quality: signalQuality({ perfusion: pi, periodicity: per, stability: stability }), pulse: pulse, peaks: peaks };
  }

  /**
   * Full offline analysis of one colour channel.
   * segments: [{ t0 (s from start of recording), values: uniform samples at fs }]
   */
  function analyseChannel(segments, fs) {
    fs = fs || FS;
    var intervals = [], beats = [], pulses = [], perList = [], piList = [];
    segments.forEach(function (sg, si) {
      if (sg.values.length < fs * 4) return;
      var pulse = preparePulse(sg.values, fs);
      pulses.push({ t0: sg.t0, values: pulse });
      var pk = detectPeaks(pulse, fs);
      pk.forEach(function (p) { beats.push({ time: sg.t0 + p.time, amp: p.amp, seg: si }); });
      intervals = intervals.concat(intervalsFromPeaks(pk, sg.t0, si));
      piList.push(perfusionIndex(pulse, sg.values));
      var w = 8 * fs, hop = 4 * fs;
      for (var s = 0; s + w <= pulse.length; s += hop) perList.push(autocorrPeriodicity(pulse.subarray(s, s + w), fs).value);
      if (pulse.length < w) perList.push(autocorrPeriodicity(pulse, fs).value);
    });
    var art = correctArtefacts(intervals);
    var metrics = computeMetrics(intervals, art.kept);
    var stability = intervals.length >= 3 ? 1 - art.removed / intervals.length : 0;
    var quality = signalQuality({ perfusion: perList.length ? median(piList) : 0, periodicity: perList.length ? median(perList) : 0, stability: stability });
    return { beats: beats, intervals: intervals, kept: art.kept, artefacts: art, metrics: metrics, quality: quality, pulses: pulses };
  }

  /**
   * Analyse a recording made of one or more continuous segments (a new
   * segment starts whenever the finger was lifted and replaced).
   * segments: [{ t0 (s), red: number[], green: number[] }] at fs.
   * Uses red unless green gives a clearly better signal quality (red often
   * saturates when the flash is on).
   */
  function analyseRecording(segments, fs, opts) {
    fs = fs || FS; opts = opts || {};
    var red = analyseChannel(segments.map(function (s) { return { t0: s.t0, values: s.red }; }), fs);
    var green = analyseChannel(segments.map(function (s) { return { t0: s.t0, values: s.green }; }), fs);
    var useGreen = green.quality.score > red.quality.score + 5;
    var res = useGreen ? green : red;
    res.channel = useGreen ? 'green' : 'red';
    var duration = segments.reduce(function (a, s) { return a + s.red.length / fs; }, 0);
    res.duration = duration;
    var minIntervals = Math.max(10, Math.floor(duration / 3));
    res.reliable = !res.artefacts.unreliable && res.quality.score >= 40 && res.metrics.nIntervals >= minIntervals && isFinite(res.metrics.rmssd);
    res.reasons = [];
    if (res.artefacts.unreliable) res.reasons.push('artefacts');
    if (res.quality.score < 40) res.reasons.push('quality');
    if (res.metrics.nIntervals < minIntervals) res.reasons.push('beats');
    return res;
  }

  /* ------------------------------------------------ HRV score */
  /*
   * HRV score mapping (Open Day only, for an easy number):
   *   score = 100 x (ln RMSSD - 1.0) / (5.0 - 1.0), clamped to 0..100.
   *   ln RMSSD 1.0 (RMSSD about 3 ms)   -> 0
   *   ln RMSSD 3.0 (about 20 ms)        -> 50
   *   ln RMSSD 4.0 (about 55 ms)        -> 75
   *   ln RMSSD 5.0 (about 148 ms) or more -> 100
   * Linear in ln RMSSD because ln RMSSD is roughly normally distributed in
   * healthy young adults (typical seated values 3.0 to 4.5).
   */
  var HRV_SCORE = { lnMin: 1.0, lnMax: 5.0 };
  function hrvScore(lnRmssd) {
    if (!isFinite(lnRmssd)) return 0;
    return Math.round(100 * clamp01((lnRmssd - HRV_SCORE.lnMin) / (HRV_SCORE.lnMax - HRV_SCORE.lnMin)));
  }

  /*
   * Plain-English bands for the Open Day HRV score. Worded so no band reads
   * as "bad": a single resting minute reflects how someone is right now,
   * not how healthy they are.
   *   0-44   (RMSSD below about 22 ms)  steady rhythm right now
   *   45-64  (about 22 to 37 ms)        some variation
   *   65-79  (about 37 to 60 ms)        plenty of variation
   *   80-100 (about 60 ms or more)      lots of variation
   */
  var SCORE_BANDS = [
    { key: 'low', min: 0, label: 'Steady', title: 'A steady rhythm right now',
      text: "Your heartbeats were quite evenly spaced. That's common after exercise, a short night, a busy day or caffeine, or just from feeling a bit nervous about being measured." },
    { key: 'moderate', min: 45, label: 'Some', title: 'Some variation',
      text: 'Your heart is adjusting the gap between beats a moderate amount. Lots of healthy people score here, especially when they are a bit on the go.' },
    { key: 'good', min: 65, label: 'Plenty', title: 'Plenty of variation',
      text: 'Your heart is changing the gap between beats quite a lot, which usually goes with being rested and relaxed.' },
    { key: 'high', min: 80, label: 'Lots', title: 'Lots of variation',
      text: "Your heart is changing the gap between beats a lot. That's often seen in people who are well rested, relaxed or very aerobically fit." }
  ];
  function hrvScoreBand(score) {
    var b = SCORE_BANDS[0];
    for (var i = 0; i < SCORE_BANDS.length; i++) if (score >= SCORE_BANDS[i].min) b = SCORE_BANDS[i];
    return b;
  }

  /* ------------------------------------------------ trends (Tier 2) */
  function dayKey(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function dayIndex(key) { var p = key.split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5); }
  /** One entry per calendar day (mean of that day's readings), oldest first. */
  function dailySeries(readings) {
    var map = {};
    readings.forEach(function (r) {
      var k = dayKey(r.ts);
      (map[k] = map[k] || { day: k, ln: [], hr: [] });
      map[k].ln.push(r.lnRmssd); map[k].hr.push(r.hr);
    });
    return Object.keys(map).sort().map(function (k) {
      return { day: k, idx: dayIndex(k), ln: mean(map[k].ln), hr: mean(map[k].hr), n: map[k].ln.length };
    });
  }
  /**
   * Rolling 7-day baseline for a given day, from the 7 calendar days before
   * it (the day itself excluded). Needs at least `minDays` days with data.
   * Smallest worthwhile change (SWC) = 0.5 x SD of the baseline ln RMSSD.
   */
  function baselineFor(days, dayIdx, opts) {
    opts = opts || {};
    var span = opts.days || 7, minDays = opts.minDays || 3, f = opts.swcFactor != null ? opts.swcFactor : 0.5;
    var base = days.filter(function (d) { return d.idx < dayIdx && d.idx >= dayIdx - span; });
    if (base.length < minDays) return { ready: false, nDays: base.length, minDays: minDays };
    var ln = base.map(function (d) { return d.ln; }), hr = base.map(function (d) { return d.hr; });
    var m = mean(ln), s = sd(ln), swc = f * s;
    return { ready: true, nDays: base.length, lnMean: m, lnSd: s, swc: swc, lower: m - swc, upper: m + swc, hrMean: mean(hr), hrSd: sd(hr) };
  }
  /** Today's ln RMSSD and resting HR against the rolling baseline. status: above | within | below | building | none */
  function trendSummary(readings, nowTs, opts) {
    var days = dailySeries(readings), todayIdx = dayIndex(dayKey(nowTs));
    var today = days.filter(function (d) { return d.idx === todayIdx; })[0] || null;
    var base = baselineFor(days, todayIdx, opts);
    var status;
    if (!today) status = 'none';
    else if (!base.ready) status = 'building';
    else status = today.ln > base.upper ? 'above' : today.ln < base.lower ? 'below' : 'within';
    return { status: status, today: today, baseline: base, days: days, hrDelta: today && base.ready ? today.hr - base.hrMean : NaN };
  }

  /* ------------------------------------------------ CSV export (Tier 3) */
  function csv(rows) {
    return rows.map(function (r) {
      return r.map(function (v) {
        var s = v == null ? '' : String(v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\n') + '\n';
  }
  /** Beat timestamps and RR intervals. startWallMs: clock time of the recording start (for aligning with a Polar H10). */
  function beatsCSV(result, startWallMs) {
    var rows = [['beat', 'time_s', 'clock_iso', 'rr_ms', 'kept', 'segment']];
    var ivByT = {};
    result.intervals.forEach(function (iv, i) { ivByT[iv.t.toFixed(6)] = { rr: iv.rr, kept: result.kept[i] }; });
    result.beats.forEach(function (b, i) {
      var iv = ivByT[b.time.toFixed(6)];
      rows.push([i + 1, b.time.toFixed(4), startWallMs ? new Date(startWallMs + b.time * 1000).toISOString() : '',
        iv ? iv.rr.toFixed(1) : '', iv ? (iv.kept ? 1 : 0) : '', b.seg]);
    });
    return csv(rows);
  }
  function ppgCSV(result, fs) {
    fs = fs || FS;
    var rows = [['time_s', 'ppg_filtered']];
    result.pulses.forEach(function (p) {
      for (var i = 0; i < p.values.length; i++) rows.push([(p.t0 + i / fs).toFixed(4), p.values[i].toFixed(5)]);
    });
    return csv(rows);
  }
  function summaryCSV(result, extra) {
    var m = result.metrics, rows = [['measure', 'value', 'unit']];
    var add = function (k, v, u) { rows.push([k, v, u || '']); };
    if (extra && extra.startIso) add('recording_start', extra.startIso);
    add('heart_rate', m.hr.toFixed(1), 'bpm'); add('mean_rr', m.meanRR.toFixed(1), 'ms');
    add('rmssd', m.rmssd.toFixed(1), 'ms'); add('ln_rmssd', m.lnRmssd.toFixed(3));
    add('sdnn', m.sdnn.toFixed(1), 'ms'); add('sd1', m.sd1.toFixed(1), 'ms'); add('sd2', m.sd2.toFixed(1), 'ms');
    add('beats_detected', result.beats.length); add('intervals_kept', m.nIntervals);
    add('artefacts_removed', result.artefacts.removedPct.toFixed(1), '%');
    add('signal_quality', result.quality.score, '0-100'); add('recording_length', result.duration.toFixed(1), 's');
    add('channel', result.channel); add('reliable', result.reliable ? 'yes' : 'no');
    return csv(rows);
  }

  /* ------------------------------------------------ 8. synthetic PPG */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(rng) {
    var u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  /**
   * Generated camera-like PPG with known RR intervals.
   * RR = meanRR + respiratory sinus arrhythmia (sine, rsaAmp ms, period
   * rsaBeats beats) + Gaussian jitter (jitter ms). Frame times are
   * irregular (about 30 fps with frameJitter ms SD) to exercise resampling.
   * Red and green are DC levels minus a pulse (systolic + diastolic wave),
   * plus slow baseline drift and white noise (noise: SD per frame, default
   * 0.1, against a pulse amplitude of 3, which gives about 2 ms of beat
   * timing jitter, similar to a good camera recording).
   * Returns { times (ms), red, green, blue, beatTimes (s), rr (ms) }.
   */
  function synthPPG(o) {
    o = o || {};
    var duration = o.duration || 75, rng = mulberry32(o.seed || 1);
    var meanRR = o.meanRR || 850, rsaAmp = o.rsaAmp != null ? o.rsaAmp : 40, rsaBeats = o.rsaBeats || 4.5;
    var jitter = o.jitter != null ? o.jitter : 15, noise = o.noise != null ? o.noise : 0.1;
    var ac = o.ac || 3, dc = o.dc || 185, frameJitter = o.frameJitter != null ? o.frameJitter : 3;
    var beatTimes = [], rr = [], t = 0.4, b = 0;
    beatTimes.push(t);
    while (t < duration + 2) {
      var iv = meanRR + rsaAmp * Math.sin(2 * Math.PI * b / rsaBeats) + jitter * gauss(rng);
      rr.push(iv); t += iv / 1000; beatTimes.push(t); b++;
    }
    function pulseAt(ts) {
      var s = 0;
      for (var i = 0; i < beatTimes.length; i++) {
        var d = ts - beatTimes[i];
        if (d < -0.6) break;
        if (d > 1.2) continue;
        s += Math.exp(-0.5 * Math.pow((d - 0.12) / 0.07, 2)) + 0.35 * Math.exp(-0.5 * Math.pow((d - 0.38) / 0.11, 2));
      }
      return s;
    }
    var times = [], red = [], green = [], blue = [], tm = 0;
    while (tm / 1000 < duration) {
      var ts = tm / 1000, p = pulseAt(ts);
      var drift = 2 * Math.sin(2 * Math.PI * 0.25 * ts) + 3 * Math.sin(2 * Math.PI * 0.03 * ts + 1);
      times.push(tm);
      red.push(dc + drift - ac * p + noise * gauss(rng));
      green.push(dc * 0.3 + drift * 0.3 - ac * 0.4 * p + noise * 1.5 * gauss(rng));
      blue.push(dc * 0.15 + noise * gauss(rng));
      tm += Math.max(15, 1000 / 30 + frameJitter * gauss(rng));
    }
    return { times: times, red: red, green: green, blue: blue, beatTimes: beatTimes, rr: rr };
  }
  /** RMSSD of a plain list of RR intervals (ms). */
  function rmssdOf(rr) {
    var s = 0, n = 0;
    for (var i = 1; i < rr.length; i++) { var d = rr[i] - rr[i - 1]; s += d * d; n++; }
    return n ? Math.sqrt(s / n) : NaN;
  }
  /** RR intervals of a synthetic signal whose ending beat falls inside [fromS, toS]. */
  function knownIntervals(synth, fromS, toS) {
    var out = [];
    for (var i = 1; i < synth.beatTimes.length; i++) {
      var tb = synth.beatTimes[i], ta = synth.beatTimes[i - 1];
      if (ta >= fromS && tb <= toS) out.push(synth.rr[i - 1]);
    }
    return out;
  }

  return {
    FS: FS, FINGER: FINGER, HRV_SCORE: HRV_SCORE,
    mean: mean, sd: sd, median: median, clamp: clamp,
    centreCrop: centreCrop, meanRGB: meanRGB, detectFinger: detectFinger,
    resampleUniform: resampleUniform, createStreamResampler: createStreamResampler,
    detrendLinear: detrendLinear, biquad: biquad, designBandpass: designBandpass, sosfilt: sosfilt,
    filtfilt: filtfilt, createStreamFilter: createStreamFilter, preparePulse: preparePulse,
    parabolicOffset: parabolicOffset, detectPeaks: detectPeaks, createLiveBeatDetector: createLiveBeatDetector,
    intervalsFromPeaks: intervalsFromPeaks, correctArtefacts: correctArtefacts, computeMetrics: computeMetrics,
    autocorrPeriodicity: autocorrPeriodicity, perfusionIndex: perfusionIndex, signalQuality: signalQuality,
    qualityLevel: qualityLevel, analyseWindow: analyseWindow, analyseChannel: analyseChannel,
    analyseRecording: analyseRecording, hrvScore: hrvScore, hrvScoreBand: hrvScoreBand, SCORE_BANDS: SCORE_BANDS,
    dayKey: dayKey, dayIndex: dayIndex, dailySeries: dailySeries, baselineFor: baselineFor, trendSummary: trendSummary,
    beatsCSV: beatsCSV, ppgCSV: ppgCSV, summaryCSV: summaryCSV,
    mulberry32: mulberry32, gauss: gauss, synthPPG: synthPPG, rmssdOf: rmssdOf, knownIntervals: knownIntervals
  };
});
