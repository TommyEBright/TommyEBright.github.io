// Settings (top bar): how the start of movement, bodyweight, take-off/landing and integration are defined.
// The same settings apply to every trial in the session and are remembered in this browser.
// Citation (top bar): copies a reference to the tool.
import { A, $, persist, status, VERSION, METHOD_KEYS, saveMethodSettings, clearMethodSettings } from './state.js?v=2.3.0';
import { defaultSettings } from './analyse.js?v=2.3.0';

const NUM = ['onsetK', 'onsetPct', 'onsetN', 'onsetBack', 'weighLen', 'sjTolPct', 'thr', 'hold'];
const cur = () => (A.S ? A.S.set : Object.assign(defaultSettings(), JSON.parse(localStorage.getItem('fa-method') || '{}')));

function sync() {
  const set = cur();
  METHOD_KEYS.forEach((k) => { const el = $('s_' + k); if (el) el.value = set[k] === undefined ? defaultSettings()[k] : set[k]; });
  const m = set.onsetMethod || 'sd';
  $('s_kWrap').classList.toggle('hide', m !== 'sd');
  $('s_pctWrap').classList.toggle('hide', m !== 'pct');
  $('s_nWrap').classList.toggle('hide', m !== 'abs');
  $('s_thrWrap').classList.toggle('hide', set.thrMode !== 'fixed');
  const d = defaultSettings(), same = METHOD_KEYS.every((k) => set[k] === d[k]);
  $('s_state').innerHTML = same ? '<strong>Recommended settings in use.</strong>' : '<span class="bad"><strong>Changed from the recommended settings.</strong></span> Report the settings you used (they are written into the Word export).';
}
function apply(key, val) {
  const set = cur(); set[key] = val;
  A.session.trials.forEach((t) => { t.set[key] = val; });
  saveMethodSettings(set);
  persist(); sync();
  if (A.S) A.fn.refresh({ keepView: true });
}
export function initSettings() {
  const dlg = $('setDlg');
  $('setBtn').addEventListener('click', () => { sync(); dlg.showModal(); });
  $('setClose').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  METHOD_KEYS.forEach((k) => {
    const el = $('s_' + k); if (!el) return;
    el.addEventListener('change', function () {
      let v = this.value;
      if (NUM.includes(k)) { v = parseFloat(v); if (!(v >= 0)) { sync(); return; } }
      if (k === 'onsetMethod') apply('onsetBack', v === 'sd' ? 30 : 0); // 30 ms goes with the SD method (Owen et al., 2014)
      apply(k, v);
    });
  });
  $('setReset').addEventListener('click', () => {
    const d = defaultSettings();
    METHOD_KEYS.forEach((k) => { const set = cur(); set[k] = d[k]; A.session.trials.forEach((t) => { t.set[k] = d[k]; }); });
    clearMethodSettings(); persist(); sync();
    if (A.S) A.fn.refresh({ keepView: true });
    status('Recommended settings restored for every trial.');
  });
  $('setOpen2') && $('setOpen2').addEventListener('click', () => { sync(); dlg.showModal(); });

  // citation
  const cd = $('citeDlg');
  const url = 'https://tommyebright.github.io/force-analyser/';
  const yr = '2026', v = VERSION.split('.').slice(0, 2).join('.');
  const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const refs = () => ({
    apa: 'Bright, T. E. (' + yr + '). Force Analysis (Version ' + v + ') [Computer software]. Plymouth Marjon University. ' + url,
    harvard: 'Bright, T.E. (' + yr + ') Force Analysis (Version ' + v + ') [Computer program]. Plymouth Marjon University. Available at: ' + url + ' (Accessed: ' + today() + ').',
    bib: '@software{bright_force_analysis_' + yr + ',\n  author = {Bright, Thomas E.},\n  title = {Force Analysis},\n  version = {' + v + '},\n  year = {' + yr + '},\n  publisher = {Plymouth Marjon University},\n  url = {' + url + '}\n}'
  });
  $('citeBtn').addEventListener('click', () => { const r = refs(); $('citeApa').textContent = r.apa; $('citeHarvard').textContent = r.harvard; $('citeBib').textContent = r.bib; cd.showModal(); });
  $('citeClose').addEventListener('click', () => cd.close());
  cd.addEventListener('click', (e) => { if (e.target === cd) cd.close(); });
  cd.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async function () {
    const txt = $(this.getAttribute('data-copy')).textContent;
    let ok = false;
    try { await navigator.clipboard.writeText(txt); ok = true; } catch (e) {
      const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } ta.remove();
    }
    const old = this.textContent; this.textContent = ok ? 'Copied' : 'Select and copy it by hand'; setTimeout(() => { this.textContent = old; }, 1600);
  }));
}
