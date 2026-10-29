// Reading force platform text files.
// BioWare (Kistler) ASCII exports are read with their header (device names, sample rate, body weight).
// Any other delimited text or CSV file with a time column and force columns also works; the columns
// can be changed by hand in Setup.

const num = (s) => {
  if (s === undefined || s === null) return NaN;
  const t = String(s).trim();
  if (!t) return NaN;
  return Number(t);
};

function splitter(line) {
  if (line.indexOf('\t') >= 0) return (l) => l.split('\t');
  if (line.indexOf(';') >= 0) return (l) => l.split(';');
  if (line.indexOf(',') >= 0) return (l) => l.split(',');
  return (l) => l.trim().split(/\s+/);
}

function isNumericRow(cells) {
  let k = 0, m = 0;
  for (const c of cells) { if (String(c).trim() === '') continue; m++; if (!Number.isNaN(num(c))) k++; }
  return m >= 2 && k === m;
}

// Works out which columns belong to which plate. cols: [{name, device}], returns plates [{name, fz, fx, fy}] (column indices).
function groupPlates(cols) {
  const plates = [];
  const byDevice = new Map();
  const hasDevices = cols.some((c) => c.device);
  cols.forEach((c, j) => {
    const nm = c.name.replace(/\s+/g, '').toLowerCase();
    let comp = null;
    if (/^fz\d*$|^f_?z|forcez|force_z|^fz[\W_]|vertical/.test(nm)) comp = 'fz';
    else if (/^fx\d*$|^f_?x|forcex|force_x|^fx[\W_]/.test(nm)) comp = 'fx';
    else if (/^fy\d*$|^f_?y|forcey|force_y|^fy[\W_]/.test(nm)) comp = 'fy';
    if (!comp) return;
    let key;
    if (hasDevices) key = c.device || 'Plate';
    else {
      const suf = nm.replace(/^(f_?[xyz]|force_?[xyz]|vertical)/, '');
      key = suf || '1';
    }
    if (!byDevice.has(key)) { byDevice.set(key, { name: hasDevices ? key : null, fz: -1, fx: -1, fy: -1, key }); plates.push(byDevice.get(key)); }
    const p = byDevice.get(key);
    if (p[comp] >= 0) {
      // a second Fz with the same device name: treat as another plate
      const p2 = { name: p.name, fz: -1, fx: -1, fy: -1, key: key + '#' + plates.length }; p2[comp] = j; plates.push(p2); byDevice.set(key, p2);
    } else p[comp] = j;
  });
  let k = 0;
  plates.forEach((p) => { k++; if (!p.name) p.name = 'Plate ' + k; });
  return plates.filter((p) => p.fz >= 0);
}

export function parseText(text, fileName) {
  const lines = text.replace(/\r/g, '').split('\n');
  const out = { format: 'generic', fileName: fileName || '', fs: 0, headerBW: 0, meta: {}, columns: [], plates: [], warnings: [] };
  let headerIdx = -1, firstData = -1, split = null;
  const head = {};
  const isBio = /bioware/i.test(lines[0] || '');
  if (isBio) out.format = 'bioware';

  // Header block (BioWare: "Key:\tvalue\tvalue..."). Collected for any file.
  for (let i = 0; i < Math.min(lines.length, 80); i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    const sp = splitter(l), cells = sp(l);
    if (isNumericRow(cells)) {
      // first numeric row: check the next row is numeric too
      const nx = lines[i + 1] ? sp(lines[i + 1]) : [];
      if (isNumericRow(nx) || !lines[i + 1]) { firstData = i; split = sp; break; }
    }
    const key = String(cells[0]).trim().replace(/:$/, '');
    if (key) head[key.toLowerCase()] = cells.slice(1);
  }
  if (firstData < 0) throw new Error('No rows of numbers were found in this file.');

  // The column-name row is the last non-numeric row above the data that has as many cells as the data
  // (BioWare has a units row in between).
  const nData = split(lines[firstData]).length;
  for (let i = firstData - 1; i >= 0 && i >= firstData - 4; i--) {
    const cells = split(lines[i]);
    if (cells.filter((c) => /[a-z]/i.test(c)).length >= 2 && cells.length >= nData - 1) {
      const isUnits = cells.every((c) => /^\s*(n|nm|m|s|mm|m\/s(\/s)?|m\/s\^2|deg|v|mv|)\s*$/i.test(c));
      if (!isUnits) { headerIdx = i; break; }
    }
  }
  const names = headerIdx >= 0 ? split(lines[headerIdx]).map((s) => s.trim()) : [];
  // decimal commas (e.g. "742,5" with ";" separators)
  const decComma = split === null ? false : (lines[firstData].indexOf(';') >= 0 && /\d,\d/.test(lines[firstData]));

  const rows = [];
  for (let i = firstData; i < lines.length; i++) {
    const l = lines[i]; if (!l.trim()) continue;
    const cells = split(decComma ? l.replace(/,/g, '.') : l);
    const r = cells.map(num);
    if (r.every((v) => Number.isNaN(v))) continue;
    rows.push(r);
  }
  const nCol = Math.max(...rows.slice(0, 20).map((r) => r.length));
  const n = rows.length;
  if (n < 20) throw new Error('This file has too few rows of data (' + n + ').');

  // Column details
  const dev = head['device'] || [];
  // in BioWare the device row has one cell per force column (time column excluded)
  const cols = [];
  for (let j = 0; j < nCol; j++) {
    const nm = names[j] !== undefined && names[j] !== '' ? names[j] : 'Column ' + (j + 1);
    cols.push({ name: nm, device: '' });
  }
  if (dev.length) {
    const off = nCol - dev.length; // usually 1 (time)
    dev.forEach((d, k) => { if (cols[k + off]) cols[k + off].device = String(d).trim(); });
  }

  // Time column
  let tCol = cols.findIndex((c) => /time|^t$|^t\s*\(s\)|^sec/i.test(c.name));
  const getCol = (j) => { const a = new Float64Array(n); for (let i = 0; i < n; i++) { const v = rows[i][j]; a[i] = Number.isNaN(v) || v === undefined ? NaN : v; } return a; };
  out.data = [];
  for (let j = 0; j < nCol; j++) out.data.push(getCol(j));

  let fs = 0;
  const rate = head['rate (hz)'] || head['rate'] || head['sampling rate'] || head['sample rate'] || head['frequency'];
  if (rate) { const r = num(rate.find((x) => String(x).trim() !== '')); if (r > 0) fs = r; }
  if (tCol < 0) {
    // a first column that rises in equal steps is time
    const c0 = out.data[0];
    const d1 = c0[1] - c0[0], d2 = c0[Math.min(n - 1, 10)] - c0[Math.min(n - 2, 9)];
    if (d1 > 0 && Math.abs(d1 - d2) < 1e-6 * Math.max(1, Math.abs(d1)) && d1 < 0.1) tCol = 0;
  }
  if (tCol >= 0) {
    const t = out.data[tCol];
    const dt = (t[n - 1] - t[0]) / (n - 1);
    if (dt > 0) { const f = 1 / dt; if (!fs || Math.abs(f - fs) / fs > 0.02) fs = Math.round(f * 1000) / 1000; }
  }
  out.tCol = tCol;
  out.fs = fs; // 0 means "ask the user"
  out.n = n;
  const nb = head['normalized force (n)'] || head['normalised force (n)'] || head['body weight (n)'];
  if (nb) { const v = num(nb.find((x) => String(x).trim() !== '')); if (v > 50) out.headerBW = v; }
  ['date', 'name', 'id', 'description', 'classification'].forEach((k) => { if (head[k] && String(head[k][0] || '').trim()) out.meta[k] = String(head[k][0]).trim(); });

  out.columns = cols.map((c, j) => ({ name: c.name, device: c.device, label: (c.device ? c.device + ': ' : '') + c.name, isTime: j === tCol }));
  out.plates = groupPlates(cols.map((c, j) => (j === tCol ? { name: '', device: '' } : c)));
  if (!out.plates.length) {
    // no named force columns: every non-time numeric column could be a plate's vertical force
    const cand = cols.map((c, j) => j).filter((j) => j !== tCol);
    cand.slice(0, 3).forEach((j, k) => out.plates.push({ name: 'Plate ' + (k + 1), fz: j, fx: -1, fy: -1 }));
    out.warnings.push('No columns called Fz were found, so the tool has guessed which columns are force. Check them in Setup &rarr; Plates and columns.');
  }
  if (out.plates.length > 3) { out.warnings.push('This file has ' + out.plates.length + ' plates. The first three are used; change them in Setup &rarr; Plates and columns.'); out.plates = out.plates.slice(0, 3); }
  // Tidy plate names (e.g. "Force Plate 2 9286BA" -> "Force Plate 2")
  out.plates.forEach((p, k) => { p.name = String(p.name || 'Plate ' + (k + 1)).replace(/\s+\d{4}[A-Z]{1,3}$/, '').trim() || 'Plate ' + (k + 1); });
  // BioWare also exports its own centre of mass columns (COM az, vz, sz); these are not used.
  if (cols.some((c) => /^com/i.test(c.name))) out.hasBiowareCOM = true;
  return out;
}

// Builds the arrays the analysis needs from the parsed file and the chosen columns.
export function buildData(P, map, fsOverride) {
  const fs = fsOverride || P.fs;
  const n = P.n;
  const t = new Float64Array(n);
  if (P.tCol >= 0) { const tt = P.data[P.tCol]; const t0 = tt[0]; for (let i = 0; i < n; i++) t[i] = tt[i] - t0; }
  else for (let i = 0; i < n; i++) t[i] = i / fs;
  // use an evenly spaced time base (the analysis assumes a constant sample interval)
  for (let i = 0; i < n; i++) t[i] = i / fs;
  const plates = map.map((m) => {
    const g = (j) => (j >= 0 && P.data[j] ? Float64Array.from(P.data[j], (v) => (Number.isNaN(v) ? 0 : v)) : null);
    return { name: m.name, fz: g(m.fz), fx: g(m.fx), fy: g(m.fy) };
  }).filter((p) => p.fz);
  return { fs, n, t, plates, headerBW: P.headerBW || 0 };
}
