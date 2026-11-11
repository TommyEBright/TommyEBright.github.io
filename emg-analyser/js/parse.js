// Reads EMG files. Delsys EMGworks text exports are read fully (muscle names, sample rates, accelerometers);
// any other text or CSV file with a time column (or a sample rate you type) and EMG columns works too.
//
// EMGworks text export: one "Label: <name> Sampling frequency: <fs> Number of points: <n> ... Unit: <unit>"
// line per channel, gain blocks, then a header row starting "X [samples]," where every channel has its own
// sample-number column (so the columns come in pairs, and channels at lower rates stop early).

const KNOWN = [
  ['SEMIMEMBRANOSUS', 'SM'], ['SEMITENDINOSUS', 'ST'], ['BICEPS FEMORIS', 'BF'], ['VASTUS LATERALIS', 'VL'], ['VASTUS MEDIALIS', 'VM'],
  ['RECTUS FEMORIS', 'RF'], ['GLUTEUS MAXIMUS', 'GMax'], ['GLUTEUS MEDIUS', 'GMed'], ['TIBIALIS ANTERIOR', 'TA'], ['MEDIAL GASTROCNEMIUS', 'MG'],
  ['GASTROCNEMIUS MEDIAL', 'MG'], ['LATERAL GASTROCNEMIUS', 'LG'], ['GASTROCNEMIUS LATERAL', 'LG'], ['GASTROCNEMIUS', 'GAS'], ['SOLEUS', 'SOL'],
  ['ERECTOR SPINAE', 'ES'], ['RECTUS ABDOMINIS', 'RA'], ['EXTERNAL OBLIQUE', 'EO'], ['BICEPS BRACHII', 'BB'], ['TRICEPS BRACHII', 'TB'],
  ['ANTERIOR DELTOID', 'AD'], ['POSTERIOR DELTOID', 'PD'], ['MIDDLE DELTOID', 'MD'], ['DELTOID', 'DEL'], ['PECTORALIS MAJOR', 'PM'],
  ['LATISSIMUS DORSI', 'LD'], ['UPPER TRAPEZIUS', 'UT'], ['TRAPEZIUS', 'TRAP'], ['ADDUCTOR', 'ADD'], ['TENSOR FASCIAE LATAE', 'TFL'],
  ['FLEXOR CARPI', 'FC'], ['EXTENSOR CARPI', 'EC'], ['BRACHIORADIALIS', 'BR']
];

// "R SEMIMEMBRANOSUS" -> "R SM"; anything unknown -> its own words (shortened)
export function shortName(m) {
  const u = m.toUpperCase().replace(/\s+/g, ' ').trim();
  const side = (u.match(/^(L|R|LEFT|RIGHT)\b\.?\s*/) || [])[0] || '';
  const rest = u.slice(side.length).trim();
  for (const [k, v] of KNOWN) if (rest.includes(k)) return (side ? side.trim()[0] + ' ' : '') + v;
  const words = m.trim();
  return words.length > 14 ? words.slice(0, 13) + '…' : words;
}
const titleCase = (s) => s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());

function num(s) { if (s === undefined) return NaN; s = s.trim(); if (s === '') return NaN; return +s; }

export function parseText(txt, name) {
  const lines = txt.split(/\r?\n/);
  const hi = lines.findIndex((l) => /^\s*"?X \[/.test(l));
  if (hi >= 0) return parseDelsys(lines, hi, name);
  return parseGeneric(lines, name);
}

function parseDelsys(lines, hi, name) {
  const warnings = [];
  const labels = {};
  for (let i = 0; i < hi; i++) {
    const m = lines[i].match(/^Label:\s*(.*?)\s+Sampling frequency:\s*([\d.eE+\-]+)\s+Number of points:\s*(\d+).*?Unit:\s*(\S+)/);
    if (m) labels[m[1].trim()] = { fs: +m[2], n: +m[3], unit: m[4] };
  }
  const hdr = lines[hi].split(',').map((s) => s.replace(/^"|"$/g, '').trim());
  const cols = [];
  hdr.forEach((h, c) => {
    if (/^X \[/.test(h)) return;
    const m = h.match(/^(.*?)\s*\[([^\]]*)\]\s*$/);
    const lab = (m ? m[1] : h).trim(), unit = m ? m[2] : '';
    if (/->|filter|RMS|Envelope|Rectif/i.test(lab)) return; // processed in EMGworks: ignore, we start from raw
    const info = labels[lab] || {};
    const mm = lab.match(/^(.*?):\s*(EMG|Acc|Gyro|Mag|IMU|Analog|FSR|Goniometer)\s*([\w.]*)/i);
    const kind = mm ? (/^emg$/i.test(mm[2]) ? 'emg' : /^acc$/i.test(mm[2]) ? 'acc' : 'other') : (/emg/i.test(lab) ? 'emg' : 'other');
    const mus = mm ? mm[1].trim() : lab;
    const axis = kind === 'acc' ? ((mm[3] || '').split('.').pop() || '').toUpperCase() : '';
    cols.push({ c, label: lab, kind, muscle: mus, axis, unit: info.unit || unit, fs: info.fs || 0, n: info.n || 0 });
  });
  // EMG, accelerometers, and anything else (e.g. a dynamometer's angle or torque) as an extra movement signal.
  // Gyroscope and magnetometer channels are left out: the accelerometer already describes the movement.
  const keep = cols.filter((k) => k.kind !== 'other' || !/:\s*(Gyro|Mag|IMU)\b/i.test(k.label));
  const data = keep.map(() => []);
  for (let i = hi + 1; i < lines.length; i++) {
    const L = lines[i]; if (!L) continue;
    const parts = L.split(',');
    for (let j = 0; j < keep.length; j++) {
      const v = num(parts[keep[j].c]);
      if (Number.isFinite(v)) data[j].push(v);
    }
  }
  const emg = [], acc = [], aux = [];
  keep.forEach((k, j) => {
    let y = data[j]; if (k.n && y.length > k.n) y = y.slice(0, k.n);
    let scale = 1;
    if (k.kind === 'emg') { if (/^mV$/i.test(k.unit)) scale = 1e-3; else if (/^(uV|µV)$/i.test(k.unit)) scale = 1e-6; }
    const arr = new Float32Array(y.length); for (let i = 0; i < y.length; i++) arr[i] = y[i] * scale;
    if (k.kind === 'emg') emg.push({ key: k.muscle.toUpperCase(), name: titleCase(k.muscle), short: shortName(k.muscle), label: k.label, fs: k.fs, unit: 'V', y: arr });
    else if (k.kind === 'acc') acc.push({ sensor: k.muscle.toUpperCase(), axis: k.axis, fs: k.fs, unit: k.unit || 'g', y: arr });
    else if (arr.length > 10) aux.push({ name: k.label, fs: k.fs, unit: k.unit || '', y: arr });
  });
  if (!emg.length) warnings.push('No EMG columns found in this file.');
  if (emg.some((e) => !(e.fs > 0))) warnings.push('The sample rate was not in the file. Type it in Setup.');
  return { kind: 'delsys', emg, acc, aux, warnings, fs: emg.length ? emg[0].fs : 0 };
}

// Any text/CSV: a header row, then numbers. A first column that rises steadily is time.
function parseGeneric(lines, name) {
  const warnings = [];
  const rows = [];
  let hdr = null;
  const sep = (l) => (l.includes('\t') ? '\t' : l.includes(';') && !l.includes(',') ? ';' : ',');
  for (const L of lines) {
    if (!L.trim()) continue;
    const s = sep(L), parts = L.split(s).map((p) => p.trim().replace(/^"|"$/g, ''));
    const nums = parts.map(num);
    if (nums.filter(Number.isFinite).length >= Math.max(1, parts.length - 1) && parts.length > 1) rows.push(nums);
    else if (!rows.length) hdr = parts;
  }
  if (!rows.length) return { kind: 'generic', emg: [], acc: [], aux: [], warnings: ['No numbers found. Export the data from EMGworks as a text file.'], fs: 0 };
  const nc = Math.max(...rows.slice(0, 20).map((r) => r.length));
  hdr = (hdr && hdr.length >= nc) ? hdr : Array.from({ length: nc }, (_, c) => 'Channel ' + (c + 1));
  const col = (c) => rows.map((r) => r[c]);
  let fs = 0, start = 0;
  const c0 = col(0);
  const isTime = /time|^t$|sec|\(s\)|\[s\]/i.test(hdr[0]) || (c0.length > 10 && c0.every((v, i) => i === 0 || v > c0[i - 1]));
  if (isTime) {
    const d = []; for (let i = 1; i < Math.min(c0.length, 2000); i++) d.push(c0[i] - c0[i - 1]);
    d.sort((a, b) => a - b); let dt = d[Math.floor(d.length / 2)];
    if (/ms/i.test(hdr[0])) dt /= 1000;
    if (/sample/i.test(hdr[0])) dt = 0;
    fs = dt > 0 ? 1 / dt : 0; start = 1;
  }
  // Columns that are not EMG: accelerometer axes (grouped by sensor) and other signals that describe the
  // movement (a joint angle, torque, force, a trigger...), which can be used to find the reps.
  const emg = [], acc = [], aux = [];
  const AUX = /angle|torque|force|moment|position|displacement|velocity|speed|power|cadence|crank|gonio|trigger|sync|analog|fsr|switch|load|gyro|\bmag\b|\bgrf\b/i;
  for (let c = start; c < nc; c++) {
    const h = hdr[c] || 'Channel ' + c;
    const y = col(c); if (!y.some(Number.isFinite)) continue;
    const am = !/emg/i.test(h) && h.match(/^(.*?)[\s_:.\-]*acc(?:el(?:eration|erometer)?)?[\s_:.\-]*\d*[\s_:.\-]*([XYZ])\b/i);
    if (am) { acc.push({ sensor: (am[1].trim() || 'Sensor').toUpperCase(), axis: am[2].toUpperCase(), fs, unit: 'g', y: Float32Array.from(y, (v) => (Number.isFinite(v) ? v : 0)) }); continue; }
    if (!/emg/i.test(h) && (AUX.test(h) || /acc/i.test(h))) { const um = h.match(/[[(]([^\])]*)[\])]\s*$/); aux.push({ name: h.replace(/\s*[[(].*?[\])]\s*$/, '').trim() || h, fs, unit: um ? um[1] : '', y: Float32Array.from(y, (v) => (Number.isFinite(v) ? v : 0)) }); continue; }
    let scale = 1; if (/\bmV\b/.test(h)) scale = 1e-3; else if (/(uV|µV)/.test(h)) scale = 1e-6;
    const lab = h.replace(/\s*[[(].*?[\])]\s*$/, '').trim();
    const arr = Float32Array.from(y, (v) => (Number.isFinite(v) ? v * scale : 0));
    emg.push({ key: lab.toUpperCase(), name: lab, short: shortName(lab), label: h, fs, unit: 'V', y: arr });
  }
  if (!emg.length && aux.length) warnings.push('No EMG columns found: every column looks like a movement signal (' + aux.map((a) => a.name).slice(0, 4).join(', ') + ').');
  if (!(fs > 0)) warnings.push('No time column, so the sample rate is unknown. Type it in Setup.');
  // values far bigger than any EMG in volts are probably mV or µV
  const mx = Math.max(0, ...emg.map((e) => e.y.reduce((m, v) => Math.max(m, Math.abs(v)), 0)));
  if (mx > 0.5) warnings.push('These values look too big to be volts (largest ' + mx.toPrecision(3) + '). If they are mV or µV, set the units in Setup.');
  return { kind: 'generic', emg, acc, aux, warnings, fs };
}
