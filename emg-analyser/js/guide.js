// Help for students who have never used EMG:
//  - a one-minute walkthrough the first time the tool opens (and from "How EMG works")
//  - a plain line saying what 100% means here, with a check that the reference reads 100%
//  - checks that say what to do (a missed foot strike, too few reps, a cadence that missed its target)
//  - a plain-English summary of the results, revealed on request, with a fixed caution
import { A, $, esc, persist, status, uid, muscle, SET, W, isCyclic, trialLabel } from './state.js?v=1.5.0';
import { repWindows, trialFs, refPeaks } from './emg.js?v=1.5.0';

const f = (v, n) => (Number.isFinite(v) ? v.toFixed(n) : '–');
const mean = (a) => { const b = a.filter(Number.isFinite); return b.length ? b.reduce((s, v) => s + v, 0) / b.length : NaN; };

// ---------- what 100% means ----------
export function hundredLine(R, C) {
  const set = SET(), u = R.ni.unit, w = W(), t = A.S;
  if (u === '%MVIC') return '<div class="h100"><strong>100% = each muscle&rsquo;s MVIC</strong> (its maximal effort). 50% means the muscle was working at half its maximum. Values above 100% can happen in fast or eccentric work.</div>';
  if (u === '% peak') return '<div class="h100"><strong>100% = each muscle&rsquo;s highest value in this session</strong>. Compare conditions with each other, not with other studies.</div>';
  if (u === 'µV') return '<div class="h100 warnbox"><strong>Not normalised (µV).</strong> Fine for timing, but do not compare amounts between muscles or people.</div>';
  // reference trial
  const refs = refPeaks();
  const names = [...new Set(Object.values(refs).flatMap((r) => r.names || []))];
  const refName = names.length ? names.map((n) => esc(labelOf(n))).join(', ') : 'the reference trial';
  let h = '<div class="h100"><strong>100% = the ' + (set.refStat === 'peak' ? 'peak of the average ' + w.one : 'average activity across the ' + w.many) + ' in ' + refName + '</strong>. ';
  if (set.refStat !== 'peak') h += '120% means 20% more muscle activity than in the reference; 80% means 20% less.';
  else h += 'Averages across a ' + w.one + ' come out well below 100% here, because most of a ' + w.one + ' is quiet. <button type="button" class="btn small ghost" id="toMean">Use the mean instead</button>';
  // self-check on the reference trial itself
  if (t && t.role === 'ref' && C && C.st.length) {
    const vals = R.pr.ch.map((c, k) => mean(C.st.map((s) => s[k].mean)));
    const ok = set.refStat !== 'peak' && vals.every((v) => Math.abs(v - 100) < 1.5);
    h += '<br>' + (ok ? '<span class="okTxt">&#10003; This is the reference trial, and it reads 100% (' + R.pr.ch.map((c, k) => esc(muscle(c.key).short) + ' ' + f(vals[k], 1) + '%').join(', ') + ').</span>'
      : set.refStat === 'peak' ? '<span class="muted">This is the reference trial: its averages read ' + R.pr.ch.map((c, k) => esc(muscle(c.key).short) + ' ' + f(vals[k], 0) + '%').join(', ') + ' because 100% is its peak.</span>'
        : '<span class="warnTxt">This is the reference trial but it reads ' + R.pr.ch.map((c, k) => esc(muscle(c.key).short) + ' ' + f(vals[k], 1) + '%').join(', ') + ', not 100%. That happens when more than one trial is set as the reference (they are pooled) or its ' + w.many + ' have changed since. Check the Type column.</span>');
  }
  return h + '</div>';
}
function labelOf(fileName) {
  const t = A.session.trials.find((x) => x.name === fileName);
  return t ? trialLabel(t) : fileName;
}

// ---------- checks that say what to do ----------
export function checks(R) {
  const out = [], w = W(), t = A.S; if (!R || !R.ok || R.mvic) return out;
  const r0 = R.pts.filter((p) => p.type === 'rep0'), cyc = !R.pts.some((p) => p.type === 'rep1');
  // a missing foot strike (or rep start): a gap much longer than the usual one
  if (cyc && r0.length >= 4) {
    const d = r0.slice(1).map((p, j) => p.i - r0[j].i), med = d.slice().sort((a, b) => a - b)[Math.floor(d.length / 2)];
    d.forEach((g, j) => {
      if (g > 1.6 * med) {
        const n = Math.max(1, Math.round(g / med) - 1), a = r0[j].i / R.fs, b = r0[j + 1].i / R.fs;
        const at = Array.from({ length: n }, (_, q) => a + (b - a) * (q + 1) / (n + 1));
        out.push({ lv: 'bad', html: 'Between ' + f(a, 2) + ' s and ' + f(b, 2) + ' s the gap is ' + f(b - a, 2) + ' s, about ' + (n + 1) + '&times; the usual ' + f(med / R.fs, 2) + ' s. ' + (n > 1 ? n + ' ' + esc(w.start.toLowerCase()) + 's seem' : 'A ' + esc(w.start.toLowerCase()) + ' seems') + ' to be missing, so that part is left out of the results.',
          btn: { label: 'Add ' + (n > 1 ? 'them' : 'it') + ' at ' + at.map((x) => f(x, 2) + ' s').join(', '), act: () => addPts(at) } });
      }
    });
  }
  // too few reps or strides
  const want = isCyclic() ? 10 : 3;
  if (R.reps.length && R.reps.length < want) out.push({ lv: 'warn', html: 'Only ' + R.reps.length + ' ' + (R.reps.length > 1 ? w.many : w.one) + ' marked. Aim for ' + (isCyclic() ? 'about 10 (at least 5)' : 'at least 3') + ', so one odd ' + w.one + ' does not change the average much.' });
  // did the participant reach the target? (labels like "90%" against the reference trial)
  if (isCyclic() && t && t.role !== 'ref' && R.reps.length) {
    const lab = ((t.labels && t.labels.condition) || '').match(/(\d{2,3}(?:\.\d+)?)\s*%/);
    const ref = A.session.trials.find((x) => x.role === 'ref' && who(x) === who(t));
    if (lab && ref) {
      const rt = cycleTime(ref), tt = mean(R.reps.map((r) => (r.i1 - r.i0) / R.fs));
      if (rt > 0 && tt > 0) {
        const got = rt / tt * 100, target = +lab[1];
        const per = SET().activity === 'gait' ? 'cadence' : 'rate';
        if (Math.abs(got - target) >= 2) out.push({ lv: 'warn', html: 'Labelled <strong>' + esc(lab[0]) + '</strong>, but the ' + per + ' reached was <strong>' + f(got, 1) + '%</strong> of ' + esc(trialLabel(ref)) + ' (' + f(tt, 3) + ' s against ' + f(rt, 3) + ' s per ' + w.one + '). Report the ' + per + ' actually reached, not just the target.' });
        else out.push({ lv: 'ok', html: 'Target ' + per + ' reached: ' + f(got, 1) + '% of ' + esc(trialLabel(ref)) + ' (labelled ' + esc(lab[0]) + ').' });
      }
    }
  }
  return out;
}
const who = (t) => ((t.labels && t.labels.athlete) || '').trim().toLowerCase();
function cycleTime(t) {
  const fs = trialFs(t); if (!(fs > 0)) return NaN;
  const n = Math.max(...t.P.emg.map((e) => e.y.length));
  const wins = repWindows(t, fs, n);
  return wins.length ? mean(wins.map((w) => (w.i1 - w.i0) / fs)) : NaN;
}
function addPts(times) {
  const S = A.S; S.points = S.points || [];
  times.forEach((tm) => S.points.push({ id: uid(), type: 'rep0', t: tm }));
  S.points.sort((a, b) => a.t - b.t);
  persist(); A.fn.refresh({ keepView: true, keepStatus: true });
  status('Added at ' + times.map((x) => x.toFixed(2) + ' s').join(', ') + '. <strong>Check on the graph</strong> that ' + (times.length > 1 ? 'each sits' : 'it sits') + ' on the spike, and drag ' + (times.length > 1 ? 'them' : 'it') + ' if not.');
}
export function checksHtml(R) {
  const c = checks(R); if (!c.length) return '';
  return '<div class="checks">' + c.map((x, j) => '<p class="chk ' + x.lv + '"><span class="ci">' + (x.lv === 'ok' ? '&#10003;' : x.lv === 'bad' ? '!' : 'i') + '</span><span>' + x.html + (x.btn ? ' <button type="button" class="btn small" data-chk="' + j + '">' + x.btn.label + '</button>' : '') + '</span></p>').join('') + '</div>';
}
export function wireChecks(el, R) {
  const c = checks(R);
  el.querySelectorAll('[data-chk]').forEach((b) => b.addEventListener('click', () => { const x = c[+b.getAttribute('data-chk')]; if (x && x.btn) x.btn.act(); }));
  if ($('toMean')) $('toMean').addEventListener('click', () => { SET().refStat = 'mean'; persist(); A.fn.refresh({ keepView: true, keepStatus: true }); status('100% is now the average activity across the reference trial&rsquo;s ' + W().many + ', so the reference reads 100%.'); });
}

// ---------- the results in plain English ----------
export function summaryHtml(R, C, pr, sameGroup) {
  const w = W(), u = R.ni.unit, chs = R.pr.ch, t = A.S;
  if (!C || !C.st.length || !R.reps.length) return '';
  const nm = (k) => '<strong>' + esc(muscle(chs[k].key).short) + '</strong>';
  const lines = [];
  chs.forEach((c, k) => {
    if (!R.N[k]) return;
    const m = mean(C.st.map((s) => s[k].mean)), p = mean(C.st.map((s) => s[k].peak));
    if (u === '% of ref') {
      if (t.role === 'ref') lines.push(nm(k) + ': this is the reference trial, so it is the 100% the other trials are compared with.');
      else {
        const d = m - 100, size = Math.abs(d) < 5 ? 'about the same as' : Math.abs(d) < 15 ? (d > 0 ? 'a little more active than' : 'a little less active than') : (d > 0 ? 'clearly more active than' : 'clearly less active than');
        lines.push(nm(k) + ' was ' + size + ' in the reference trial across the ' + w.one + ' (' + f(m, 0) + '% of the reference' + (Math.abs(d) >= 5 ? ', ' + (d > 0 ? '+' : '') + f(d, 0) + '%' : '') + ').');
      }
    } else if (u === '%MVIC') lines.push(nm(k) + ' worked at about ' + f(m, 0) + '% of its MVIC on average through each ' + w.one + ', peaking at about ' + f(p, 0) + '%' + (p > 100 ? ' (above 100% is common in fast or eccentric work)' : '') + '.');
    else if (u === '% peak') lines.push(nm(k) + ' averaged ' + f(m, 0) + '% of its highest value in the session.');
  });
  if (C.avgOn && isCyclic()) C.avgOn.forEach((a, k) => { if (a && a.B && a.B.length) { const txt = (b) => (b.wrap ? b.on + '% to ' + b.off + '% (across foot strike)' : b.on + '% to ' + b.off + '%'); const B = a.B.slice().sort((x, y) => x.on - y.on); lines.push(nm(k) + ' was mainly active from about ' + B.map(txt).join(' and from ') + ' of the ' + w.one + ' (0% = foot strike).'); } });
  if (pr && pr.cA >= 0 && pr.cB >= 0 && pr.cA !== pr.cB && C.cc.length && !sameGroup(chs[pr.cA].key, chs[pr.cB].key)) {
    const ci = mean(C.cc.map((x) => x && x.ci));
    if (Number.isFinite(ci)) lines.push(nm(pr.cA) + ' and ' + nm(pr.cB) + ' overlapped with a co-contraction index of ' + f(ci, 0) + '% (0% = never together, 100% = identical).');
  }
  if (!lines.length) return '';
  return '<details class="plain-sum" id="plainSum"' + (A.sumOpen ? ' open' : '') + '><summary>What do these results say? <span class="muted">(try to answer yourself first)</span></summary>'
    + '<ul>' + lines.map((l) => '<li>' + l + '</li>').join('') + '</ul>'
    + '<p class="caution">These describe <strong>this participant&rsquo;s ' + w.many + ' only</strong>. With one person, treat a difference as a pattern to discuss, not proof. Differences smaller than the SD between ' + w.many + ' (in the tables) may just be ' + w.one + '-to-' + w.one + ' variation. EMG shows how active a muscle is, not how much force it makes.</p></details>';
}
export function wireSummary() { if ($('plainSum')) $('plainSum').addEventListener('toggle', function () { A.sumOpen = this.open; }); }

// ---------- one-minute walkthrough ----------
const SLIDES = [
  { t: 'What the sensor records', p: 'Each sensor picks up the tiny electrical signal a muscle makes when it is switched on (grey). The tool cleans it, flips it positive and smooths it into one line, the <strong>envelope</strong> (blue): how hard the muscle is working at each moment.',
    svg: '<svg viewBox="0 0 320 120" role="img" aria-label="Raw EMG and its envelope"><path d="M10 60 ' + Array.from({ length: 150 }, (_, i) => { const x = 10 + i * 2, a = Math.exp(-(((i - 75) / 25) ** 2)) * 45 + 3; return 'L' + x + ' ' + (60 + (i % 2 ? 1 : -1) * a * (0.5 + ((i * 37) % 10) / 20)).toFixed(1); }).join(' ') + '" fill="none" stroke="#94a3b8" stroke-width="1"/><path d="M10 60 ' + Array.from({ length: 150 }, (_, i) => 'L' + (10 + i * 2) + ' ' + (60 - Math.exp(-(((i - 75) / 25) ** 2)) * 40 - 2).toFixed(1)).join(' ') + '" fill="none" stroke="#1d4ed8" stroke-width="3"/><text x="12" y="112" font-size="11" fill="#475569">time</text></svg>' },
  { t: 'What 100% means', p: 'Raw EMG (µV) depends on the skin, fat and exact sensor spot, so on its own it cannot be compared between muscles or people. Each muscle is scaled to a reference = 100%: its <strong>MVIC</strong> (maximal effort), or a <strong>reference trial</strong> (e.g. preferred cadence). 120% = 20% more active than the reference.',
    svg: '<svg viewBox="0 0 320 120" role="img" aria-label="Bars at 100% and 120%"><line x1="20" y1="40" x2="300" y2="40" stroke="#94a3b8" stroke-dasharray="5 4"/><text x="250" y="34" font-size="11" fill="#475569">100%</text><rect x="60" y="40" width="60" height="70" fill="#0f766e"/><rect x="180" y="26" width="60" height="84" fill="#be185d"/><text x="58" y="118" font-size="11" fill="#1f2a33">Reference</text><text x="186" y="20" font-size="11" fill="#1f2a33">120%</text></svg>' },
  { t: 'One rep or stride at a time', p: 'Results are worked out for each rep (or each stride, from one foot strike to the next on the same leg), then averaged. Every one is stretched to <strong>0&ndash;100%</strong>, so quicker and slower ones line up, and the average shows the typical pattern &plusmn; SD.',
    svg: '<svg viewBox="0 0 320 120" role="img" aria-label="Strides between foot strikes"><path d="M10 95 ' + Array.from({ length: 150 }, (_, i) => { const x = 10 + i * 2, ph = (i % 50) / 50; return 'L' + x + ' ' + (95 - (Math.exp(-(((ph - 0.08) / 0.07) ** 2)) * 55 + Math.exp(-(((ph - 0.95) / 0.05) ** 2)) * 40)).toFixed(1); }).join(' ') + '" fill="none" stroke="#1d4ed8" stroke-width="2.5"/>' + [10, 110, 210, 310].map((x) => '<line x1="' + x + '" y1="10" x2="' + x + '" y2="100" stroke="#15803d" stroke-dasharray="4 3"/>').join('') + '<text x="40" y="114" font-size="11" fill="#15803d">stride 1</text><text x="140" y="114" font-size="11" fill="#15803d">stride 2</text><text x="240" y="114" font-size="11" fill="#15803d">stride 3</text></svg>' },
  { t: 'Words you will see', p: '<dl class="gloss"><dt>Envelope</dt><dd>the smoothed line: how active the muscle is.</dd><dt>Normalised</dt><dd>scaled to a reference, so 100% means &ldquo;the same as the reference&rdquo;.</dd><dt>%MVIC</dt><dd>% of the muscle&rsquo;s maximal voluntary isometric contraction.</dd><dt>Onset / offset</dt><dd>when the muscle switches on / off.</dd><dt>Co-contraction</dt><dd>two opposing muscles (e.g. quads and hamstrings) active at the same time.</dd><dt>Mean vs peak</dt><dd>mean uses every moment (best for effort); peak is one moment.</dd></dl>', svg: '' }
];
export function openIntro(k) {
  k = k || 0;
  let ov = $('introOv');
  if (!ov) { ov = document.createElement('div'); ov.id = 'introOv'; ov.className = 'introov'; document.body.appendChild(ov); }
  const s = SLIDES[k];
  ov.innerHTML = '<div class="introbox" role="dialog" aria-modal="true" aria-labelledby="introT"><div class="introdots">' + SLIDES.map((x, j) => '<span class="' + (j === k ? 'on' : '') + '"></span>').join('') + '</div>'
    + '<h2 id="introT">' + (k + 1) + '. ' + s.t + '</h2>' + (s.svg ? '<div class="introsvg">' + s.svg + '</div>' : '') + '<div class="introp">' + s.p + '</div>'
    + '<div class="row tight" style="justify-content:space-between;margin-top:.8rem"><button type="button" class="btn ghost small" id="introSkip">' + (k === SLIDES.length - 1 ? 'Close' : 'Skip') + '</button><span class="row tight">'
    + (k ? '<button type="button" class="btn ghost small" id="introBack">Back</button>' : '') + '<button type="button" class="btn accent" id="introNext">' + (k === SLIDES.length - 1 ? 'Got it: let&rsquo;s start' : 'Next') + '</button></span></div></div>';
  ov.classList.remove('hide');
  const close = () => { ov.classList.add('hide'); try { localStorage.setItem('emg-intro-seen', '1'); } catch (e) { /* ignore */ } };
  $('introSkip').onclick = close;
  $('introNext').onclick = () => (k === SLIDES.length - 1 ? close() : openIntro(k + 1));
  if ($('introBack')) $('introBack').onclick = () => openIntro(k - 1);
  ov.onclick = (e) => { if (e.target === ov) close(); };
  $('introNext').focus();
}
export function maybeIntro() { let seen = false; try { seen = localStorage.getItem('emg-intro-seen') === '1'; } catch (e) { /* ignore */ } if (!seen) openIntro(0); }
