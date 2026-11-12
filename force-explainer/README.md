# Force to Motion

A step-by-step explanation of how force platform data become net force, acceleration, velocity and displacement, for first-year students. Countermovement jump, squat jump and drop jump, with a short page on other movements (IMTP, walking, running, landing, standing long jump). Companion to Force Analysis (`../force-analyser/`).

Runs in the browser, works offline once loaded, nothing is uploaded.

## The steps
1. What the plate measures (total force; each platform optional)
2. Check the data (plate zeroed, still periods, noise; residual analysis and the optional filter)
3. Weigh the person (W = mean force while still: before the jump for the CMJ, after landing for the SJ and DJ; m = W ÷ g)
4. Net force (F_net = F − W)
5. Acceleration (a = F_net ÷ m)
6. Velocity (trapezoid rule, forwards for the CMJ, backwards for the SJ and DJ, with one strip zoomed in, an animation, and a check where velocity should be zero)
7. Displacement (the same again)
8. Reading the phases
9. Jump height (take-off velocity and flight time)
10. What if bodyweight is wrong (a ±2% slider; the drift changes direction with backward integration)
11. Do it yourself (8 samples to work through, checked in the page, and an Excel file with a blank sheet and an answers sheet with formulas)
12. Other movements

Each step has plain words, the equation with every symbol named, the jump's own numbers (following the cursor), and a quick check question.

Links to a jump and step work, e.g. `index.html#dj-5` opens the drop jump at step 5.

## Data
`data/*.json`: real jumps on two force platforms (one under each foot), 1000 Hz, made with Force Analysis v2.2.1 (take-off, landing, start of movement). `F` is the total force, `P` each platform (*Show each platform*). The countermovement jump (725 N) and drop jump (726 N) are the same participant; the squat jump (759 N) is a different participant, chosen because it has a clean flight and a long still period after landing.

Integration: countermovement jump forwards from standing still before the jump; squat jump and drop jump **backwards** from standing still after landing (bodyweight is also taken there; for the squat jump the squat window is shown for comparison). Step 6 checks the integration where velocity should be zero at the other end (or, for the drop jump, the fall height at touchdown).

Filter (step 2 and the tick box above the graph): 4th-order zero-lag Butterworth low-pass (as Force Analysis), cut-off from residual analysis (Winter, 2009) over the movement (start of movement or touchdown to just after take-off). Events always come from the unfiltered force. Off by default.

## Putting it online
Upload the `force-explainer` folder next to `force-analyser` in the GitHub Pages repository. The "try your own jump" link points to `../force-analyser/`.
