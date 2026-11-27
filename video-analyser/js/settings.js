// Settings (top bar): tracking settings and what every variable means. Citation (top bar): copies a reference to the tool.
import { A, $, persist, VERSION } from './state.js?v=2.5.0';

function sync() {
  const S = A.S;
  $('lostMode').value = S.lostMode === 'pause' ? 'pause' : 'gap';
  $('pickup').value = S.pickup || 0.3;
  $('trkChecks').checked = S.checks !== false;
}
function setAll(key, val) {
  A.S[key] = val;
  (A.session.trials || []).forEach((t) => { if (t.S) t.S[key] = val; else if (t.state) t.state[key] = val; });
  persist();
}
export function initSettings() {
  const dlg = $('setDlg');
  const open = (where) => { sync(); dlg.showModal(); if (where) { const el = $(where); if (el) el.scrollIntoView({ block: 'start' }); } };
  $('setBtn').addEventListener('click', () => open());
  $('trkSetOpen') && $('trkSetOpen').addEventListener('click', () => open('setTrack'));
  $('setClose').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  $('lostMode').addEventListener('change', function () { setAll('lostMode', this.value); });
  $('pickup').addEventListener('change', function () { const v = parseFloat(this.value); if (v > 0) setAll('pickup', v); else sync(); });

  // citation
  const cd = $('citeDlg');
  const url = 'https://tommyebright.github.io/video-analyser/';
  const yr = '2026', v = VERSION.split('.').slice(0, 2).join('.');
  const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const refs = () => ({
    apa: 'Bright, T. E. (' + yr + '). Kinematic Analysis (Version ' + v + ') [Computer software]. Plymouth Marjon University. ' + url,
    harvard: 'Bright, T.E. (' + yr + ') Kinematic Analysis (Version ' + v + ') [Computer program]. Plymouth Marjon University. Available at: ' + url + ' (Accessed: ' + today() + ').',
    bib: '@software{bright_kinematic_analysis_' + yr + ',\n  author = {Bright, Thomas E.},\n  title = {Kinematic Analysis},\n  version = {' + v + '},\n  year = {' + yr + '},\n  publisher = {Plymouth Marjon University},\n  url = {' + url + '}\n}'
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
  $('verFoot').textContent = VERSION;
}
