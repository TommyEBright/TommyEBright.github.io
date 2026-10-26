# =====================================================================
#  MRes Stats Lab - Stage 7: from JASP to R
#  Reproduces the JASP Data Library analyses from the Canvas page.
#  Run it line by line (Ctrl/Cmd + Enter) and check each result
#  against the JASP output you produced in Stages 4-6.
# =====================================================================

# ---- 0. Packages (install once, then comment out) -------------------
# install.packages(c("tidyverse", "effectsize", "TOSTER", "BayesFactor",
#                    "car", "emmeans", "performance", "see", "ggdist"))
library(tidyverse)
library(effectsize)
library(TOSTER)
library(BayesFactor)
library(car)
library(emmeans)
library(performance)

# ---- 1. Read JASP Data Library files straight from JASP's GitHub ----
jasp_data <- function(folder, file) {
  url <- paste0("https://raw.githubusercontent.com/jasp-stats/jasp-desktop/stable/",
                "Resources/Data%20Sets/Data%20Library/",
                URLencode(folder), "/", URLencode(file))
  read.csv(url, check.names = FALSE)
}
# Offline? Open the file in JASP, choose File > Export > Export Data,
# then use read.csv("the-file-you-saved.csv") instead.

reading  <- jasp_data("2. T-Tests", "Directed Reading Activities.csv")
rolls    <- jasp_data("2. T-Tests", "Kitchen Rolls.csv")
weight   <- jasp_data("2. T-Tests", "Weight Gain.csv")
heart    <- jasp_data("3. ANOVA", "Heart Rate.csv") |> rename(HR = `Heart Rate`)
activity <- jasp_data("4. Regression", "Physical Activity and BMI.csv")

# ---- 2. Independent t-test: Directed Reading Activities -------------
reading$group <- factor(reading$group, levels = c("Treat", "Control"))

reading |>
  group_by(group) |>
  summarise(n = n(), M = mean(drp), SD = sd(drp))

t.test(drp ~ group, data = reading)                    # Welch (R's default; recommended)
t.test(drp ~ group, data = reading, var.equal = TRUE)  # Student (JASP's default)
cohens_d(drp ~ group, data = reading)                  # d = 0.68, 95% CI [0.07, 1.29]

# Bayesian t-test with JASP's default Cauchy prior (r = 0.707)
ttestBF(formula = drp ~ group, data = reading, rscale = "medium")              # BF10 = 2.22
ttestBF(formula = drp ~ group, data = reading, rscale = "medium",
        nullInterval = c(0, Inf))                                              # BF+0 = 4.33

# ---- 3. Equivalence test (TOST): Kitchen Rolls -----------------------
rolls |>
  group_by(Rotation) |>
  summarise(n = n(), M = mean(mean_NEO), SD = sd(mean_NEO))

t.test(mean_NEO ~ Rotation, data = rolls, var.equal = TRUE)   # p = .45: absence of evidence...
# ...but is it evidence of absence? That depends on your SESOI:
t_TOST(mean_NEO ~ Rotation, data = rolls, var.equal = TRUE,
       eqb = 0.5, eqbound_type = "SMD")   # bounds of d = +/-0.5: equivalent, p = .040
t_TOST(mean_NEO ~ Rotation, data = rolls, var.equal = TRUE,
       eqb = 0.2)                         # raw bounds of +/-0.2 points: not equivalent, p = .093
# (TOSTER warns that SMD bounds are approximate. Raw-unit bounds based on theory are better.)

ttestBF(formula = mean_NEO ~ Rotation, data = rolls)          # BF10 = 0.27, so BF01 = 3.71

# ---- 4. Paired t-test: Weight Gain (8 weeks of +1000 kcal/day) ------
t.test(weight$`Weight After`, weight$`Weight Before`, paired = TRUE)   # +10.41 lb
# Two different "Cohen's d" values for the same data (Lakens, ch. 6):
repeated_measures_d(weight$`Weight After`, weight$`Weight Before`, method = "z")   # d_z: standardised by the SD of the differences
repeated_measures_d(weight$`Weight After`, weight$`Weight Before`, method = "av")  # d_av: standardised by the average SD of the two measurements
# Always say which d you report!

# ---- 5. 2 x 2 factorial ANOVA: Heart Rate ----------------------------
heart |>
  group_by(Gender, Group) |>
  summarise(n = n(), M = mean(HR), SD = sd(HR), .groups = "drop")

options(contrasts = c("contr.sum", "contr.poly"))  # needed for Type III sums of squares (as in JASP/SPSS)
m_hr <- lm(HR ~ Gender * Group, data = heart)
Anova(m_hr, type = 3)
eta_squared(Anova(m_hr, type = 3), partial = TRUE, alternative = "two.sided")
emmeans(m_hr, pairwise ~ Group | Gender)            # simple effects: 32.0 bpm (women), 26.0 bpm (men)
leveneTest(HR ~ Gender * Group, data = heart, center = mean)   # p < .001: unequal variances
options(contrasts = c("contr.treatment", "contr.poly"))        # back to R's default

# ---- 6. Linear regression and model checks: Physical Activity & BMI -
m_pa <- lm(BMI ~ PA, data = activity)
summary(m_pa)                         # b = -0.65, R2 = .15
confint(m_pa)                         # 95% CI [-0.97, -0.34]
standardize_parameters(m_pa)          # beta = -0.39

check_model(m_pa)                     # the full set of diagnostic plots (needs the 'see' package)
check_heteroscedasticity(m_pa)
check_normality(m_pa)
max(cooks.distance(m_pa))             # 0.17
anova(m_pa, lm(BMI ~ PA + I(PA^2), data = activity))   # quadratic term: p = .070

# ---- 7. Visualisation with ggplot2 -----------------------------------
# Raincloud-style plot: distribution + boxplot + raw data
ggplot(heart, aes(x = Group, y = HR, fill = Gender, colour = Gender)) +
  ggdist::stat_halfeye(adjust = 0.8, width = 0.5, justification = -0.25,
                       .width = 0, point_colour = NA, alpha = 0.5,
                       position = position_dodge(width = 0.8)) +
  geom_boxplot(width = 0.12, outlier.shape = NA, alpha = 0.3, colour = "grey20",
               position = position_dodge(width = 0.8)) +
  geom_point(position = position_jitterdodge(jitter.width = 0.08, dodge.width = 0.8),
             size = 0.8, alpha = 0.35) +
  labs(x = NULL, y = "Heart rate after 6 min exercise (bpm)") +
  theme_minimal(base_size = 13)

# Scatterplot with regression line and 95% CI band
ggplot(activity, aes(x = PA, y = BMI)) +
  geom_point(alpha = 0.6, size = 2) +
  geom_smooth(method = "lm", formula = y ~ x) +
  labs(x = "Average steps per day (thousands)", y = expression(BMI~(kg/m^2))) +
  theme_minimal(base_size = 13)

# ---- 8. Write the result straight from the model (no copy-paste errors)
ci <- confint(m_pa)["PA", ]
s  <- summary(m_pa)
sprintf("b = %.2f, 95%% CI [%.2f, %.2f], t(%d) = %.2f, p %s, R2 = %.2f",
        coef(m_pa)["PA"], ci[1], ci[2], s$df[2],
        s$coefficients["PA", "t value"],
        ifelse(s$coefficients["PA", "Pr(>|t|)"] < .001, "< .001",
               sprintf("= %.3f", s$coefficients["PA", "Pr(>|t|)"])),
        s$r.squared)
