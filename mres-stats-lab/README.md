# MRes Stats Lab

Interactive companions to the MRes Canvas resource **"From p-values to posteriors"**.
They take students from basic principles to JASP analysis, model checking, visualisation, writing up, R and Bayesian modelling (MCMC, HMC, NUTS, LOO).

Live site: `https://tommyebright.github.io/mres-stats-lab/` (this folder lives inside the `TommyEBright.github.io` repository).

| Stage | Page | What it teaches |
|---|---|---|
| 1 | `p-values.html` | p-value distributions, Type I error, power, Lindley's paradox |
| 2 | `ci-dance.html` | CI coverage, capture percentage, effect-size inflation under publication bias |
| 3 | `power.html` | exact a-priori power and sensitivity analysis |
| 3 | `equivalence.html` | TOST equivalence testing and the four possible conclusions |
| 4 | `bayes-factor.html` | JZS Bayes factor, prior/posterior, robustness, posterior odds |
| 5 | `residuals.html` | regression diagnostics and influence (Cook's distance) |
| 6 | `show-the-data.html` | bar charts versus rainclouds; Anscombe's quartet |
| 7 | `fix-the-results.html` | spotting reporting errors in real JASP analyses |
| 8 | `mcmc.html` | random-walk Metropolis, HMC and NUTS animated; R-hat, ESS, divergences |
| 8 | `loo.html` | PSIS-LOO, elpd differences and Pareto k |

`r/` holds the R scripts for Stages 7 and 8. Everything is static HTML/JS with no build step, tracking or external libraries.
Datasets come from the JASP Data Library and are read live from the JASP GitHub repository.
Text is based on Lakens, D. (2022). *Improving Your Statistical Inferences* (CC BY-NC-SA 4.0).

## Publish / update

Copy this whole folder into the root of the `TommyEBright.github.io` repository as `mres-stats-lab/`, commit and push to `main`.
GitHub Pages is already switched on for that repository, so the pages appear at the address above about a minute later.
Keep the folder name `mres-stats-lab`, because the Canvas page links to that exact path.
