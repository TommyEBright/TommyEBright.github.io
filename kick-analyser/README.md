# Kick Analysis

Support leg forces and centre of pressure (COP) in kicking, from a force platform under the standing foot. Compare kick types with tables and report-ready figures. A free teaching and analysis tool for sport and exercise biomechanics, in the same style as Force Analysis (`../force-analyser/`), Projectile Motion and EMG Analysis.

It runs entirely in the browser. Files are opened from the user's own device and are never uploaded. It can be installed as an app and works offline once loaded.

Built for the SESD52 lab report question "how does kick type influence Fz, Fy and centre of pressure?", but works for any kicking task with the standing foot on one plate.

## What it does

- **Load** BioWare text exports (Fz, Ax and Ay needed; Fx, Fy and Tz used when present). Name files after the kick (`Laces_1.txt`) and the kick type and trial are filled in. Demo: four kick types (instep, laces, curler, outside of the boot) by one player, 1000 Hz, Kistler 9286.
- **Main graph**: forces and COP from foot contact, with stance and the valid-COP stretch shaded, a COP-from-above panel with a moving dot, and a readout that says what the standing leg is doing (landing, braking, late stance, follow-through).
- **1. Setup**: standing foot and which way the plate's side-to-side axis points (so + can be reported as lateral), bodyweight from the file or a typed mass, which horizontal force is front–back, and whether results run to toe-off or ball contact.
- **2. Points**: foot contact and toe-off (automatic, movable), and ball contact (from video: set at the cursor or type ms).
- **3. Results**, each with how it was worked out: stance time, time to ball contact; peak vertical force, time to peak, average loading rate, vertical impulse; peak braking and propulsive force and impulses, net impulse; side-to-side force (if Fx exported); COP front–back and side-to-side excursion, path length, mean speed (total, front–back, side to side), COP at ball contact; peak free moment.
- **4. Figure**: one kick (stacked panels), kicks compared (one signal, each trial or mean ± SD), four panels (A–D: Fz, front–back force, COP AP, COP ML), COP path from above, or a bar chart of any result. Sizes, fonts, colours (incl. Okabe–Ito), line styles for black and white, axis limits, legend position. PNG at 3×, editable SVG, or copy to the clipboard. A suggested caption.
- **Compare kicks**: table by kick type (mean ± SD) or by kick, chosen results, copy as a Word table, CSV; curves by kick type; session CSVs (every result, time-normalised curves).
- **Export**: continuous stance data and results for one kick; project file to save and reopen a session.
- **Go deeper: Centre of pressure**: what COP is, how the plate works it out (COPy = Mx ÷ Fz, COPx = −My ÷ Fz), the raw BioWare COP blowing up at low load, and what the tool keeps.

## Method (defaults, all in Settings)

- Butterworth low-pass, 2nd order, zero lag (4th order overall), cut-off corrected for two passes, mirror padding: forces 50 Hz, COP 15 Hz (Winter, 2009).
- Stance = the contact (Fz > 20 N) containing the peak force; brief extra contacts ignored.
- Front–back force = the horizontal force with the bigger force in the first 30% of stance, signed so the first quarter (braking) is negative. COP partner signed so the heel-to-toe roll is positive. Side to side + = lateral when the standing foot and plate direction are given.
- COP used only while Fz > 20% of body weight (Bobbert and Schamhardt, 1990; Schmiedmayer and Kastner, 1999), longest stretch in stance, relative to its first point. On the demo, front–back excursion was 28–45 cm at 5% (longer than a foot) but 23–27 cm from 20% upwards.

## Files
`index.html`, `css/style.css` (Force Analysis stylesheet plus a few additions at the end), `js/app.js` (page, graphs, tabs), `js/analyse.js` (reading, filtering, results), `js/draw.js` (canvas and SVG drawing), `js/figure.js` (figure builder), `js/state.js`, `sw.js` (offline; bump `VERSION` after any change), `manifest.webmanifest`, `icons/`, `demo/`.
