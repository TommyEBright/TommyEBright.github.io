# Force Analysis

Force–time analysis of jumps from your own force platform files. A free teaching and analysis tool for sport and exercise biomechanics, and the sibling of Kinematic Analysis.

It runs entirely in the web browser. Files are opened from the user's own device and are never uploaded. It can be installed as an app on laptops, tablets and phones, and works offline once loaded.

## What it does

- **Jumps:** countermovement jump (CMJ), squat jump (SJ) and drop jump (DJ). The tool guesses which one a file is, and the user can change it.
- **Files:** BioWare (Kistler) text exports are read with their header (sample rate, device names, stored body weight). Any other text or CSV file with a time column and force columns also works. Up to three plates, with Fx, Fy and Fz for each. The vertical forces of every plate that is switched on are added together. Plates can be marked left and right for asymmetry results, or switched off (e.g. a plate under the box).
- **Levels:** Foundation (Year 1), Intermediate (Year 2) and Advanced (Year 3 and MSc). The level sets how many results are shown and how much of the maths is visible. The analysis is the same at every level.
- **The force–time curve:**
  - shaded phases (weighing, unweighting, braking, propulsion, flight, landing; falling from the box for a drop jump);
  - net impulse shaded above (green) and below (blue) the bodyweight line;
  - hover anywhere for time, force, net force, acceleration, velocity, displacement and power, plus a plain-English sentence about what is happening;
  - a jumper beside the curve whose centre of mass moves with the integrated displacement, with velocity and net force arrows;
  - **Play the jump** (0.1× to real time), click to pin the cursor, arrow keys to step one sample;
  - drag across the graph to zoom, an overview strip to move along the trial;
  - total Fz, each plate's Fz, Fx and Fy can be shown or hidden; force in N, N/kg or bodyweights.
- **Events:** found automatically. Editable events (start of movement, touchdown, take-off, landing, weighing period) can be dragged on the graph or nudged one sample at a time. Events that come from velocity (peak downward velocity, lowest point, lowest point after landing) follow automatically.
- **Filter:** the same Butterworth filter as Kinematic Analysis, with residual analysis, raw vs filtered, and what was removed over time. Off by default for jumps.
- **Force to displacement:** four linked graphs (net force, acceleration, velocity, displacement) with a shared cursor and the trial's own numbers at every step, "things to notice" links (e.g. force crosses bodyweight → acceleration is zero → peak downward velocity), thin integration strips when zoomed right in, and an optional build-up as the jump plays. Advanced: trapezoid vs rectangle integration, and a slider showing what a small bodyweight error does to velocity, displacement and jump height.
- **Results:** every variable grouped by phase, each with a "how was this worked out" line using the trial's own numbers, plus quality checks.
- **Compare trials:** a table of chosen results with group mean ± SD (by participant, condition or both), and overlaid curves (force, velocity, displacement or power) lined up at take-off or time-normalised, with group mean ± SD.
- **Exports:** continuous CSV (every sample), discrete CSV (results), time-normalised CSV, PNG graphs, a Word report (.docx with the graphs and results table), whole-session CSVs, and a project file that saves the whole session.

## Results by jump

| | CMJ | Squat jump | Drop jump |
|---|---|---|---|
| Outcome | Jump height (take-off velocity and flight time), take-off velocity, flight time, time to take-off, RSImod, peak force, peak power | Jump height (both), take-off velocity, flight time, propulsion time, RSImod, peak force, peak power | Jump height (both), take-off velocity, flight time, contact time, RSI, peak force |
| Phases | Unweighting: duration, minimum force, peak downward velocity, impulse. Braking: duration, peak and mean force, impulse, RFD, force at zero velocity, depth, peak braking power. Propulsion: duration, peak and mean force, impulse, mean power, peak velocity, push-off distance | Propulsion: mean force, impulse, mean power, peak velocity, push-off distance, time to peak force, RFD 0–50, 0–100 and 0–200 ms, countermovement check | Touchdown velocity, effective drop height. Braking: peak impact force, duration, impulse, mean force, centre of mass displacement, vertical stiffness. Propulsion: duration, peak and mean force, impulse, peak power |
| Landing | Peak landing force, time to peak, loading rate, landing duration and depth, landing velocity | as CMJ | as CMJ |
| Left vs right | Braking and propulsive impulse, peak force, peak landing force | Propulsive impulse, peak force, peak landing force | Braking and propulsive impulse, peak force, peak landing force |

## Demo trials

- **Demo: CMJ** is the BioWare sample countermovement jump (one plate, 250 Hz).
- **Demo: drop jump** is a real drop jump from two plates at 1000 Hz, with still standing after landing, so backward integration works.
- **Demo: squat jump** is computer-generated (one plate, 1000 Hz, body mass 72 kg). The push starts at 1.50 s from a still squat. Take-off velocity at the true take-off (1.80 s) is 2.29 m/s (26.7 cm), and the flight time is 0.475 s (27.7 cm by flight time, because it lands 2 cm lower than it took off). The tool gives about 1 cm more from take-off velocity (27.8 cm), because take-off is found where force drops below the 20 N threshold, a few milliseconds before the true take-off, when the body is still slightly faster. That makes a useful discussion point.

## Putting it online (GitHub Pages)

The simplest option is a folder in the existing GitHub Pages site, next to `video-analyser` (e.g. `force-analyser`):

1. Unzip the download.
2. In the repository, create the folder. Choose **Add file → Upload files**.
3. Drag in everything from the unzipped folder, keeping the subfolders (`css`, `js`, `icons`, `demo`).
4. Commit. It is live a minute or two later (e.g. `https://<username>.github.io/force-analyser/`).

To update it, upload the new files over the old ones. Bumping `VERSION` in `sw.js` also clears old offline copies.

It can be embedded in a VLE page with an iframe:

```html
<iframe src="https://<username>.github.io/force-analyser/" style="width:100%;height:1600px;border:0" allow="fullscreen"></iframe>
```

## Privacy

Files are read by the browser on the user's own device and are never uploaded. The session (files, labels, settings and events) is kept in the browser's own storage (IndexedDB) and can be saved as a project file. The tool makes no network requests apart from loading its own files.

## Methods in brief

- **Bodyweight:** the mean of the last still period before a CMJ or squat jump (up to 1 s), or the first still period after landing in a drop jump. It can also come from the body weight stored in the file, or a typed-in mass.
- **Contact:** force above a threshold (20 N) for at least 10 ms. Take-off is the first sample below it and landing the first sample back above it.
- **Start of movement:** bodyweight ± 5 SD of the weighing period, moved back 30 ms (Owen et al., 2014).
- **Integration:** a = (F − W) / m, then velocity and displacement by the trapezoid rule (or rectangles), as in Robertson et al. (2014, ch. 4). CMJ and squat jump start from rest at the start of movement. Drop jump: touchdown velocity from backward integration (from the still standing after landing, where velocity is zero) or from the box height (forward integration, v = −√(2gh)).
- **Phases:** McMahon et al. (2018). Unweighting ends at peak downward velocity (force back to bodyweight); braking ends at zero velocity; propulsion ends at take-off.
- **Jump height:** v² / 2g from take-off velocity, and g t² / 8 from flight time (Linthorne, 2001; Moir, 2008).
- **Filtering:** 2nd-order Butterworth run forwards and backwards (4th order, zero lag), cut-off corrected for the two passes (Winter, 2009), with longer end padding than the video tool because force data are sampled faster.

The full explanation, written for students, is in the tool under **How everything is calculated**.

## References

- Ebben, W.P. and Petushek, E.J. (2010) Using the reactive strength index modified to evaluate plyometric performance. *Journal of Strength and Conditioning Research*, 24(8), 1983–1987.
- Flanagan, E.P. and Comyns, T.M. (2008) The use of contact time and the reactive strength index to optimize fast stretch-shortening cycle training. *Strength and Conditioning Journal*, 30(5), 32–38.
- Linthorne, N.P. (2001) Analysis of standing vertical jumps using a force platform. *American Journal of Physics*, 69(11), 1198–1204.
- McMahon, J.J., Suchomel, T.J., Lake, J.P. and Comfort, P. (2018) Understanding the key phases of the countermovement jump force-time curve. *Strength and Conditioning Journal*, 40(4), 96–106.
- Moir, G.L. (2008) Three different methods of calculating vertical jump height from force platform data in men and women. *Measurement in Physical Education and Exercise Science*, 12(4), 207–218.
- Owen, N.J., Watkins, J., Kilduff, L.P., Bevan, H.R. and Bennett, M.A. (2014) Development of a criterion method to determine peak mechanical power output in a countermovement jump. *Journal of Strength and Conditioning Research*, 28(6), 1552–1558.
- Robertson, D.G.E., Caldwell, G.E., Hamill, J., Kamen, G. and Whittlesey, S.N. (2014) *Research Methods in Biomechanics*, 2nd edn. Human Kinetics.
- Street, G., McMillan, S., Board, W., Rasmussen, M. and Heneghan, J.M. (2001) Sources of error in determining countermovement jump height with the impulse method. *Journal of Applied Biomechanics*, 17(1), 43–54.
- Winter, D.A. (2009) *Biomechanics and Motor Control of Human Movement*, 4th edn. Wiley.

## Files

```
index.html             the page
css/style.css          styles (shared look with Kinematic Analysis)
js/app.js              start-up and wiring
js/state.js            shared state, saving, helpers
js/parse.js            reading BioWare and other text/CSV files
js/analyse.js          bodyweight, events, integration, phases (no page code, so it can be tested on its own)
js/vars.js             every result: name, level, units and how it is worked out
js/maths.js            filter, residual analysis, integration, statistics
js/plot.js             canvas charts
js/trace.js            the main force-time graph, overview strip, read-out and play
js/figure.js           the jumper
js/integ.js            the force-to-displacement tab
js/filterview.js       the filter tab
js/results.js          key numbers, results table, quality checks
js/events.js           the events tab
js/setup.js            the setup tab (jump type, bodyweight, plates and columns)
js/session.js          sessions: adding files, labels
js/compare.js          comparing trials and whole-session exports
js/export.js           CSV, PNG, Word report, project files
js/zip.js              a tiny zip writer for the Word report
sw.js                  offline support
manifest.webmanifest   app install details
demo/                  demo trials
icons/                 app icons
```

Built by Dr Tommy Bright.
