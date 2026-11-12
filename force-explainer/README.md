# Force to Motion

A step-by-step explanation of how force platform data become net force, acceleration, velocity and displacement, for first-year students. Countermovement jump, squat jump and drop jump, with a short page on other movements (IMTP, walking, running, landing, standing long jump). Companion to Force Analysis (`../force-analyser/`).

Runs in the browser, works offline once loaded, nothing is uploaded.

## The steps
1. What the plate measures
2. Weigh the person (W = mean force while still; m = W ÷ g)
3. Net force (F_net = F − W)
4. Acceleration (a = F_net ÷ m)
5. Velocity (trapezoid rule, with one strip zoomed in and an animation of the strips adding up; the drop jump integrates backwards from the still standing after landing)
6. Displacement (the same again)
7. Reading the phases
8. Jump height (take-off velocity and flight time)
9. What if bodyweight is wrong (a ±2% slider)
10. Do it yourself (8 samples to work through, checked in the page, and an Excel file with a blank sheet and an answers sheet with formulas)
11. Other movements

Each step has plain words, the equation with every symbol named, the jump's own numbers (following the cursor), and a quick check question.

Links to a jump and step work, e.g. `index.html#dj-5` opens the drop jump at step 5.

## Data
`data/*.json` are the Force Analysis demo jumps (CMJ: BioWare sample, 250 Hz; squat jump: computer-generated, 1000 Hz; drop jump: real, two plates, 1000 Hz), analysed with Force Analysis v2.2.0 (bodyweight, events, contact threshold from the empty plate). Acceleration, velocity and displacement are recalculated in the page with the trapezoid rule, giving the same take-off velocity as Force Analysis.

## Putting it online
Upload the `force-explainer` folder next to `force-analyser` in the GitHub Pages repository. The "try your own jump" link points to `../force-analyser/`.
