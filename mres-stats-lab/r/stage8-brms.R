# =====================================================================
#  MRes Stats Lab - Stage 8: Bayesian regression with brms
#  Priors -> MCMC (NUTS) -> diagnostics -> posterior -> PPC -> LOO
#  First time? brms needs a C++ toolchain: Rtools (Windows) or the
#  Xcode Command Line Tools (Mac). See https://paulbuerkner.com/brms/
# =====================================================================

# ---- 0. Packages ------------------------------------------------------
# install.packages(c("brms", "bayesplot", "loo", "posterior", "tidyverse"))
library(tidyverse)
library(brms)
library(bayesplot)
library(posterior)
library(loo)
options(mc.cores = parallel::detectCores())   # run the 4 chains in parallel

jasp_data <- function(folder, file) {
  url <- paste0("https://raw.githubusercontent.com/jasp-stats/jasp-desktop/stable/",
                "Resources/Data%20Sets/Data%20Library/",
                URLencode(folder), "/", URLencode(file))
  read.csv(url, check.names = FALSE)
}
activity <- jasp_data("4. Regression", "Physical Activity and BMI.csv")
heart    <- jasp_data("3. ANOVA", "Heart Rate.csv") |> rename(HR = `Heart Rate`)

# ---- 1. Priors: decide before you fit -------------------------------
get_prior(BMI ~ PA, data = activity)          # brms defaults
priors <- prior(normal(0, 2), class = "b")    # slope: within about +/-4 BMI units per 1,000 steps

# Prior predictive check: simulate data from the priors alone.
# Are the simulated BMIs at least plausible for humans?
m_prior <- brm(BMI ~ PA, data = activity, prior = priors,
               sample_prior = "only", seed = 2026, refresh = 0)
pp_check(m_prior, ndraws = 50)

# ---- 2. Fit the model (NUTS: 4 chains x 1,000 warm-up + 1,000 draws) -
m_pa <- brm(BMI ~ PA, data = activity, prior = priors,
            chains = 4, iter = 2000, seed = 2026)
summary(m_pa)
# Expect: b_PA = -0.65, 95% CrI [-0.97, -0.32], Rhat = 1.00, Bulk_ESS ~ 3,600.
# (Your last decimal may differ slightly: MCMC is random, and seeds behave
#  differently on different computers.)

# ---- 3. Did the sampler work? -------------------------------------
mcmc_plot(m_pa, type = "trace")          # fuzzy caterpillars that overlap
mcmc_plot(m_pa, type = "rank_overlay")   # flat, overlapping ranks = good mixing
rhat(m_pa)                               # all < 1.01
neff_ratio(m_pa)                         # ESS / number of draws
nuts_params(m_pa) |>
  filter(Parameter == "divergent__") |>
  summarise(divergences = sum(Value))    # should be 0

# ---- 4. Use the posterior -------------------------------------------
draws <- as_draws_df(m_pa)
mean(draws$b_PA < 0)          # P(slope < 0 | data) = 1.00
mean(draws$b_PA < -0.25)      # P(slope < -0.25 | data) = .99 (e.g. a SESOI)
mcmc_plot(m_pa, variable = "b_PA", type = "areas", prob = 0.95)
bayes_R2(m_pa)                # 0.15, 95% CrI [0.04, 0.27]
conditional_effects(m_pa)

# ---- 5. Posterior predictive checks: can the model reproduce the data?
pp_check(m_pa, ndraws = 100)                    # density overlay
pp_check(m_pa, type = "stat", stat = "sd")      # does it get the spread right?

# ---- 6. LOO cross-validation and model comparison -------------------
loo_pa <- loo(m_pa)
loo_pa                        # elpd_loo = -273.7 (SE 6.7); all Pareto k < 0.7
plot(loo_pa)                  # Pareto k for every participant

m_pa0 <- brm(BMI ~ 1, data = activity, chains = 4, iter = 2000, seed = 2026)
m_pa2 <- brm(BMI ~ PA + I(PA^2), data = activity, prior = priors,
             chains = 4, iter = 2000, seed = 2026)
loo_compare(loo(m_pa0), loo_pa, loo(m_pa2))
# The linear and quadratic models are within 1 elpd (SE ~ 1.6): the quadratic
# term adds nothing. Both clearly beat the intercept-only model (diff ~ -7.6).

# ---- 7. Heart Rate: should the residual SD differ between groups? ---
h1 <- brm(HR ~ Group,          data = heart, chains = 4, iter = 2000, seed = 2026)
h2 <- brm(HR ~ Group + Gender, data = heart, chains = 4, iter = 2000, seed = 2026)
h3 <- brm(HR ~ Group * Gender, data = heart, chains = 4, iter = 2000, seed = 2026)
# A distributional model: the mean AND the SD depend on group and gender
h4 <- brm(bf(HR ~ Group * Gender, sigma ~ Group * Gender),
          data = heart, chains = 4, iter = 2000, seed = 2026)
summary(h4)          # sigma_GroupRunners:GenderMale = -0.29 [-0.48, -0.10] (log scale)
loo_compare(loo(h1), loo(h2), loo(h3), loo(h4))
# h4 is best; h3 is 7.7 elpd worse (SE 4.4); h1 is 92.7 worse (SE 13.1).
# This is the Bayesian answer to the significant Levene's test in Stage 5.

# ---- 8. If something goes wrong ---------------------------------------
# Divergent transitions:  brm(..., control = list(adapt_delta = 0.99))
#                         or reparameterise (e.g. a non-centred multilevel model)
# Max treedepth warnings: brm(..., control = list(max_treedepth = 12))
# Pareto k > 0.7:         loo(fit, moment_match = TRUE) or loo(fit, reloo = TRUE)
# Low ESS / high Rhat:    run longer (iter = 4000); check priors; centre predictors
