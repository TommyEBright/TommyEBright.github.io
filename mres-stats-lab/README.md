# MRes Stats Lab

Interactive companions to the MRes Canvas resource **"From p-values to posteriors"**.
They take students from basic principles to JASP analysis, model checking, visualisation, writing up, R and Bayesian modelling (MCMC, HMC, NUTS, LOO).

Live site: `https://tommyebright.github.io/mres-stats-lab/` (this folder lives inside the `TommyEBright.github.io` repository).

| Stage | Page | What it teaches |
|---|---|---|
| 1 & 3 | `bayes-rule.html` | Bayes' theorem with natural frequencies; beta-binomial updating, both lenses |
| 2 | `p-values.html` | p-value distributions, Type I error, power, Lindley's paradox |
| 4 | `ci-dance.html` | CI coverage, capture percentage, effect-size inflation under publication bias |
| 4 | `two-lenses.html` | confidence vs credible intervals, priors, shrinkage, interpretation quiz |
| 5 | `power.html` | exact a-priori power and sensitivity analysis |
| 5 | `equivalence.html` | TOST equivalence testing and Bayesian HDI + ROPE |
| 6 | `bayes-factor.html` | JZS Bayes factor, prior/posterior, robustness, posterior odds |
| 7 | `residuals.html` | regression diagnostics and influence (Cook's distance) |
| 7 | `priors.html` | prior predictive checks, prior–data conflict, sensitivity analysis |
| 8 | `show-the-data.html` | bar charts versus rainclouds; Anscombe's quartet |
| 9 | `fix-the-results.html` | spotting reporting errors in classical and Bayesian write-ups |
| 11 | `mcmc.html` | random-walk Metropolis, HMC and NUTS animated; R-hat, ESS, divergences |
| 11 | `loo.html` | PSIS-LOO, elpd differences and Pareto k |

`r/` holds the R scripts for Stages 10 and 11. Everything is static HTML/JS with no build step, tracking or external libraries.
Datasets come from the JASP Data Library and are read live from the JASP GitHub repository.
Text is based on Lakens, D. (2022). *Improving Your Statistical Inferences* (CC BY-NC-SA 4.0).

## Publish / update

Copy this whole folder into the root of the `TommyEBright.github.io` repository as `mres-stats-lab/`, commit and push to `main`.
GitHub Pages is already switched on for that repository, so the pages appear at the address above about a minute later.
Keep the folder name `mres-stats-lab`, because the Canvas page links to that exact path.
