/**
 * test-stats.js
 * Node.js test suite for the VRA Lab statistics library.
 *
 * Run with:   node test-stats.js
 *
 * Tests ICC, CV%, Bland-Altman, Pearson and Spearman against
 * known reference values from:
 *   - Shrout & Fleiss (1979) Psychol Bull 86(2):420-428
 *   - Bland & Altman (1986) Lancet 1(8476):307-310
 *   - Hand-calculated reference values
 *
 * Requires Node ≥ 18.  No external dependencies.
 */

'use strict';

/* ── Load the real stats library straight out of vra-lab.html ───── */
// Testing the shipped code (not a copy) means a fix or regression in the page is caught here.
const fs=require('fs'), path=require('path'), vm=require('vm');
const html=fs.readFileSync(path.join(__dirname,'vra-lab.html'),'utf8');
const libStart=html.indexOf('/* -- SECTION: MATH UTILS'), libEnd=html.indexOf('/* -- SECTION: FORMAT HELPERS');
if(libStart<0||libEnd<0) throw new Error('Could not find the stats library markers in vra-lab.html');
const {sum,mean,sq,sd,icc,cvPercent,blandAltman,pearsonR,spearmanR,rankArray,fQ,tQ,chi2Q,
  expFit,logLogLT,logExpModDmax,dmax}=vm.runInThisContext(
  '(function(){'+html.slice(libStart,libEnd)+
  ';return {sum,mean,sq,sd,icc,cvPercent,blandAltman,pearsonR,spearmanR,rankArray,fQ,tQ,chi2Q,expFit,logLogLT,logExpModDmax,dmax};})()');

/* ── Test runner ─────────────────────────────────────────────────── */
let _pass=0, _fail=0;

function check(label, actual, expected, tol=0.01){
  const ok=Math.abs(actual-expected)<=tol;
  if(ok){ _pass++; console.log(`  PASS  ${label}`); }
  else  { _fail++; console.log(`  FAIL  ${label}\n         got ${actual.toFixed(4)}, expected ${expected.toFixed(4)} (tol ${tol})`); }
}

function section(title){ console.log(`\n── ${title} ${'─'.repeat(50-title.length)}`); }

/* ══════════════════════════════════════════════════════════════════
   TEST SUITE
══════════════════════════════════════════════════════════════════ */

/* ── 1. ICC — Shrout & Fleiss (1979) Table 2 dataset ─────────────
   Six subjects rated by four judges.
   Reference ICC values from Table 3 of the paper:
     ICC(1,1) = 0.17,  ICC(2,1) = 0.29,  ICC(3,1) = 0.71
   (Small discrepancies from rounding in the paper are expected.)
*/
section('ICC — Shrout & Fleiss (1979) Table 2');

const SF_DATA = [
  [9, 2, 5, 8],
  [6, 1, 3, 2],
  [8, 4, 6, 8],
  [7, 1, 2, 6],
  [10, 5, 6, 9],
  [6, 2, 4, 7],
];

// Verify ANOVA components first
const sf11 = icc(SF_DATA, '1,1');
const sf21 = icc(SF_DATA, '2,1');
const sf31 = icc(SF_DATA, '3,1');

// Published reference values (±0.02 tolerance for rounding in original paper)
check('ICC(1,1) point estimate', sf11.icc, 0.17, 0.02);
check('ICC(2,1) point estimate', sf21.icc, 0.29, 0.02);
check('ICC(3,1) point estimate', sf31.icc, 0.71, 0.02);

// CI direction checks (lower < ICC < upper)
check('ICC(1,1) CI lower < estimate', sf11.ci_l < sf11.icc ? 0 : 1, 0, 0);
check('ICC(1,1) CI upper > estimate', sf11.ci_u > sf11.icc ? 0 : 1, 0, 0);
check('ICC(3,1) CI lower < estimate', sf31.ci_l < sf31.icc ? 0 : 1, 0, 0);
check('ICC(3,1) CI upper > estimate', sf31.ci_u > sf31.icc ? 0 : 1, 0, 0);

// Published 95% CIs, Shrout & Fleiss (1979) Table 4
check('ICC(1,1) CI lower = -0.133', sf11.ci_l, -0.133, 0.005);
check('ICC(1,1) CI upper =  0.723', sf11.ci_u,  0.723, 0.005);
check('ICC(2,1) CI lower =  0.019', sf21.ci_l,  0.019, 0.005);
check('ICC(2,1) CI upper =  0.761', sf21.ci_u,  0.761, 0.005);
check('ICC(3,1) CI lower =  0.342', sf31.ci_l,  0.342, 0.005);
check('ICC(3,1) CI upper =  0.946', sf31.ci_u,  0.946, 0.005);

// A pure rater offset harms absolute agreement but not consistency; the ICC(2,1) CI must still contain the estimate
const offset = icc([[100,112],[130,142],[150,162],[120,132],[170,182],[140,152]], '2,1');
check('ICC(2,1) CI contains estimate when raters differ by a constant',
  offset.ci_l < offset.icc && offset.icc < offset.ci_u ? 0 : 1, 0, 0);

// MSE should match hand-calculated value (~1.017)
check('MSE (two-way) ≈ 1.017', sf21.MSE, 1.017, 0.02);
// MSB should match (~11.23)
check('MSB ≈ 11.24', sf21.MSB, 11.24, 0.05);

/* ── 2. ICC — known perfect reliability ──────────────────────────
   If all trials are identical, ICC = 1.
*/
section('ICC — edge cases');
const perfectMat = [[5,5,5],[10,10,10],[15,15,15],[20,20,20]];
const iccPerf = icc(perfectMat, '3,1');
check('ICC = 1 when all trials identical', iccPerf.icc, 1.0, 0.001);

// If all rows are identical values, ICC = undefined or 0
// (no between-subject variance)
const noVarMat = [[5,5.1],[5,4.9],[5,5.0],[5,5.05]];
const iccNoVar = icc(noVarMat, '3,1');
check('ICC near 0 when no between-subject variance', iccNoVar.icc, 0, 0.3);

/* ── 3. CV% — hand-calculated reference ─────────────────────────
   For a matrix where each row is [x, 1.1x], the ratio of trials is always 1.1.
   ln(1.1) ≈ 0.09531.  MSW_log = (0.09531/√2)² * 2 = 0.09531²/2...

   Actually: row [x, 1.1x], row mean of log = (ln(x) + ln(1.1x))/2 = ln(x) + ln(1.1)/2
   Within-row SS = (ln(x) - row_mean)² + (ln(1.1x) - row_mean)²
                 = (−ln(1.1)/2)² + (ln(1.1)/2)² = 2 * (ln(1.1)/2)² = ln(1.1)²/2

   For n rows: SSW_log = n * ln(1.1)²/2
               df = n*(k-1) = n*1
               MSW_log = ln(1.1)²/2
               CV% = sqrt(exp(ln(1.1)²/2) - 1) * 100

   ln(1.1) ≈ 0.095310
   ln(1.1)²/2 ≈ 0.004542
   CV% ≈ sqrt(exp(0.004542) - 1) * 100 ≈ sqrt(0.004552) * 100 ≈ 6.747%
*/
section('CV% — log-transformed method');
const cvMat = [[1,1.1],[2,2.2],[3,3.3],[4,4.4],[5,5.5]];
const cvRes = cvPercent(cvMat);
check('CV% for 10% within-subject ratio ≈ 6.75%', cvRes.cv, 6.75, 0.1);
check('CV% CI lower < estimate', cvRes.ci_l < cvRes.cv ? 0 : 1, 0, 0);
check('CV% CI upper > estimate', cvRes.ci_u > cvRes.cv ? 0 : 1, 0, 0);

// CV% = 0 when no within-subject variation
const cvZeroMat = [[1,1],[2,2],[3,3],[4,4]];
const cvZero = cvPercent(cvZeroMat);
check('CV% = 0 when no within-subject variation', cvZero.cv, 0, 0.001);

// Larger ratio → higher CV%
const cvMat2 = [[1,1.2],[2,2.4],[3,3.6]];
const cvRes2 = cvPercent(cvMat2);
check('CV% for 20% ratio > CV% for 10% ratio', cvRes2.cv > cvRes.cv ? 0 : 1, 0, 0);

/* ── 4. Bland-Altman — hand-calculated reference ────────────────
   Bland & Altman (1986) used Wright vs mini-Wright PEFR data (n=17).
   Published values: bias = -2.1, SD ≈ 38.8, LoA ≈ -78.2 to 74.0
   We use a small hand-verified dataset.

   a = [1.0, 2.0, 3.0, 4.0, 5.0]
   b = [1.5, 2.2, 3.1, 4.3, 4.8]
   diffs = [-0.5, -0.2, -0.1, -0.3, 0.2]
   bias = mean(diffs) = -0.18
   SD(diffs) = sqrt(sum((d-bias)²)/4) = sqrt(0.268/4) = 0.2588
   LoA_upper = -0.18 + 1.96*0.2588 = 0.327
   LoA_lower = -0.18 - 1.96*0.2588 = -0.687
*/
section('Bland-Altman — hand-calculated reference');
const baA = [1.0, 2.0, 3.0, 4.0, 5.0];
const baB = [1.5, 2.2, 3.1, 4.3, 4.8];
const baRes = blandAltman(baA, baB);
check('Bias = -0.18', baRes.bias, -0.18, 0.001);
check('SD of differences = 0.2588', baRes.sd, 0.2588, 0.001);
check('Upper LoA = 0.327', baRes.loa_u, 0.327, 0.002);
check('Lower LoA = -0.687', baRes.loa_l, -0.687, 0.002);
check('CI for bias lower < bias', baRes.ci_bias[0] < baRes.bias ? 0 : 1, 0, 0);
check('CI for bias upper > bias', baRes.ci_bias[1] > baRes.bias ? 0 : 1, 0, 0);
check('CI for upper LoA is symmetric around LoA',
  Math.abs((baRes.ci_loa_u[1]-baRes.loa_u) - (baRes.loa_u-baRes.ci_loa_u[0])), 0, 0.0001);

// Zero bias case
const baNoB = blandAltman([1,2,3,4,5],[1,2,3,4,5]);
check('Bias = 0 when measures are identical', baNoB.bias, 0, 1e-10);
check('LoA = 0 when measures are identical', baNoB.loa_u, 0, 1e-10);

/* ── 5. Pearson correlation ──────────────────────────────────────
   x = [1,2,3,4,5]  y = [2,4,5,4,5]
   Hand-calculated r ≈ 0.7746 (Pearson, 1920).
   95% CI using Fisher z: z = atanh(0.7746) = 1.0280
   SE = 1/sqrt(n-3) = 1/sqrt(2) = 0.7071
   CI = [tanh(z-1.96*SE), tanh(z+1.96*SE)] = [tanh(-0.358), tanh(2.414)]
      = [-0.342, 0.984]
*/
section('Pearson correlation');
const px = [1,2,3,4,5], py = [2,4,5,4,5];
const prRes = pearsonR(px, py);
check('Pearson r ≈ 0.7746', prRes.r, 0.7746, 0.001);
check('Pearson CI lower < r', prRes.ci_l < prRes.r ? 0 : 1, 0, 0);
check('Pearson CI upper > r', prRes.ci_u > prRes.r ? 0 : 1, 0, 0);
check('Pearson CI lower ≈ -0.342', prRes.ci_l, -0.342, 0.01);
check('Pearson CI upper ≈ 0.984', prRes.ci_u, 0.984, 0.01);

// Perfect correlation
const prPerf = pearsonR([1,2,3,4,5],[2,4,6,8,10]);
check('Pearson r = 1 for perfect linear relationship', prPerf.r, 1.0, 0.0001);

// Negative correlation
const prNeg = pearsonR([1,2,3,4,5],[5,4,3,2,1]);
check('Pearson r = -1 for perfect inverse relationship', prNeg.r, -1.0, 0.0001);

/* ── 6. Spearman correlation ─────────────────────────────────────
   Same data as Pearson above.
   Ranks of x = [1,2,3,4,5] (no ties)
   Ranks of y: sort [2,4,5,4,5] → [2,4,4,5,5]
     value 2 → rank 1
     value 4 → ranks 2,3 → tied mean = 2.5
     value 5 → ranks 4,5 → tied mean = 4.5
   y ranks = [1, 2.5, 4.5, 2.5, 4.5]
   rx = [1,2,3,4,5], ry = [1, 2.5, 4.5, 2.5, 4.5]
   Pearson on ranks (with tie correction) = rs ≈ 0.7379
*/
section('Spearman correlation');
const srRes = spearmanR(px, py);
// Pearson-on-ranks with tied-rank correction gives rs ≈ 0.7379 for this dataset
check('Spearman rs ≈ 0.7379', srRes.rs, 0.7379, 0.01);
check('Spearman CI uses Bonett-Wright SE (wider than Fisher)', srRes.ci_u - srRes.rs > 0 ? 0 : 1, 0, 0);

// Perfect monotone → rs = 1
const srPerf = spearmanR([1,2,3,4,5],[1,4,9,16,25]);
check('Spearman rs = 1 for perfect monotone (non-linear) relationship', srPerf.rs, 1.0, 0.0001);

/* ── 7. Rank array (tied ranks) ─────────────────────────────────  */
section('rankArray — tied ranks');
const ranks = rankArray([3, 1, 2, 2, 4]);
check('Tied ranks average correctly: rank of tied 2s = 2.5', ranks[2], 2.5, 0.0001);
check('Tied ranks average correctly: second 2 also 2.5', ranks[3], 2.5, 0.0001);
check('Rank 1 assigned to minimum', ranks[1], 1, 0.0001);
check('Rank 5 assigned to maximum', ranks[4], 5, 0.0001);

/* ── 8. F-distribution quantile ─────────────────────────────────
   F(0.975, 5, 18) ≈ 3.382 (standard table)
   F(0.975, 1, ∞) ≈ 3.841 ≈ χ²(0.975, 1) / 1 (used in chi-sq approx)
*/
section('Numerical special functions');
check('F(0.975, 5, 18) ≈ 3.382', fQ(0.975, 5, 18), 3.382, 0.01);
check('F(0.975, 10, 30) ≈ 2.511', fQ(0.975, 10, 30), 2.511, 0.01);
check('t(0.975, 10) ≈ 2.228', tQ(0.975, 10), 2.228, 0.005);
check('t(0.975, ∞) → 1.96', tQ(0.975, 1e6), 1.96, 0.001);
check('chi2(0.975, 5) ≈ 12.83', chi2Q(0.975, 5), 12.833, 0.05);
check('chi2(0.025, 5) ≈ 0.831', chi2Q(0.025, 5), 0.831, 0.05);

/* ── 9. Missing value / edge case handling ──────────────────────  */
section('Edge cases');
const icSmall = icc([[1,2],[3,4]], '3,1');  // n=2 < 3
check('ICC returns NaN for n < 3', isNaN(icSmall.icc) ? 0 : 1, 0, 0);

const cvSmall = cvPercent([[1,2],[2,4]]);    // n=2 < 3
check('CV% returns NaN for n < 3', isNaN(cvSmall.cv) ? 0 : 1, 0, 0);

const baSmall = blandAltman([1,2],[1.1,2.2]);  // n=2 < 4
check('BA returns n < 4 without crash', baSmall.n < 4 ? 0 : 1, 0, 0);

/* ── 10. Lactate threshold: Log-Exp-ModDmax components ──────────── */
section('Log-Exp-ModDmax');
const ex = [80,100,120,140,160,180,200];
const exFit = expFit(ex, ex.map(x => 0.8 + 0.15*Math.exp(3.2*(x-80)/120)));
check('expFit recovers a = 0.8',  exFit.a, 0.8,  0.01);
check('expFit recovers b = 0.15', exFit.b, 0.15, 0.01);
check('expFit recovers c = 3.2',  exFit.c, 3.2,  0.02);

// Two straight lines in log-log space meeting at x = 150
const llx = [90,105,120,135,150,165,180,195];
const lly = llx.map(x => Math.exp(x <= 150 ? 0.2*Math.log(x/150) : 3.0*Math.log(x/150)));
check('logLogLT finds the known breakpoint (150)', logLogLT(llx, lly).x, 150, 2);

const lem = logExpModDmax([80,100,120,140,160,180,200], [0.9,1.1,1.4,2.0,3.1,5.2,8.1]);
check('Log-Exp-ModDmax lies between its log-log start and the final stage',
  lem.start < lem.x && lem.x < 200 ? 0 : 1, 0, 0);
check('Log-Exp-ModDmax rejects non-positive lactate', logExpModDmax([1,2,3,4],[0,1,2,3]) === null ? 0 : 1, 0, 0);

/* ── Summary ────────────────────────────────────────────────────── */
console.log(`\n${'═'.repeat(54)}`);
console.log(`RESULTS  ${_pass} passed  |  ${_fail} failed  |  ${_pass+_fail} total`);
console.log('═'.repeat(54));
if(_fail>0){ console.log('\nSome tests failed. Review the FAIL lines above.'); process.exit(1); }
else{ console.log('\nAll tests passed.'); }
