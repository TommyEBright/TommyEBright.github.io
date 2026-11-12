# Force Analysis

Force–time analysis of jumps from your own force platform files. A free teaching and analysis tool for sport and exercise biomechanics, and the sibling of Kinematic Analysis.

It runs entirely in the web browser. Files are opened from the user's own device and are never uploaded. It can be installed as an app on laptops, tablets and phones, and works offline once loaded.

## What it does

- **Any force–time data.** Choose what the trial is: a countermovement, squat or drop jump, walking, running, landing, isometric (e.g. IMTP), or any force–time data. The tool guesses from the file and the student can change it.
- **Jumps** are analysed automatically as before (events, phases, integration to velocity and displacement, jump height, RSI and so on), with every event editable.
- **Everything else is worked out from points the student marks by hand** on the graph: click near the moment, zoom to the cursor to see every sample, step with the arrow keys, press the point button (e.g. Foot contact, Toe-off, Touchdown, Onset). Windows are made between the points, and students can add their own between any two points.
  - **Walking:** per contact and per plate, contact time, first and second peaks, mid-stance minimum, loading rate, vertical impulse, peak braking and propulsive force and impulse; double support.
  - **Running:** contact time, impact and active peaks, loading rate (20–80%), vertical, braking and propulsive impulses; flight and step time.
  - **Landing:** peak landing force, time to peak, loading rate, impulse in the first 100 ms, time to stabilise, net impulse.
  - **Isometric (IMTP):** found automatically, as in the Coventry IMTP template (Tallis): baseline = the latest steady 1 s of pre-tension before the pull; onset = first sample above its mean + 5 SD (population SD); end of pull = where force falls back below that level. All three are points that can be moved. Results: pre-tension (baseline − bodyweight; high if over 200 N), steadiness (5 SD; poor if over 40 N), peak force (absolute, net of bodyweight, relative N/kg), time to peak, length of pull, force at 50–250 ms (absolute, net, relative), RFD 0–50 to 0–250 ms, peak RFD (20 ms), impulse and net impulse 0–50 to 0–300 ms, and left vs right at peak force when both plates are loaded (after the Hawkin Dynamics metric list). Bodyweight comes from the typed mass, still standing marked on the plate, or the body weight stored in the file (with a warning if it is BioWare's default of 800 N). Checked against the template on three real trials: onset, pre-tension, peak and force at 100–250 ms match exactly.
  - **Any:** for each window and any force (total, each plate, Fx, Fy), duration, peak, time of peak, minimum, mean, impulse, net impulse and mean RFD.
- **Horizontal forces:** for walking and running the student says which force is front–back and which way is forwards (guessed from the data, then remembered).
- **Merged files:** a file with several sets of columns from the same plate (e.g. BioWare "several files merged into one") can be split into separate trials in one click, then compared.
- **One version for everyone:** the Year 1/2/3 levels are gone. Every result has a "how was this worked out" line with the trial's own numbers.
- **Simpler layout,** matching Kinematic Analysis: 1. Setup, 2. Points (or Events for jumps), 3. Results, Compare trials, Export, with Filter and Force to displacement under "Go deeper".
- **4. Figure:** a figure builder. Force over time (total, each plate, horizontal, bodyweight line, threshold, phase or window shading, event lines, phase names, net impulse shading); force, acceleration, velocity, displacement and power stacked (jumps); or several trials of the same jump on top of each other, lined up at take-off or the start of movement, with mean ± SD. Units, size, labels, line thickness, text size and colour-blind-safe colours can be changed. Saves a PNG (three times the size shown) or an editable SVG.
- **Take-off and landing threshold from each trial:** the trial is first analysed with the fixed 20 N threshold to find a period with nobody on the plate (flight, after take-off in a standing long jump, or before touchdown in a drop jump). Its mean (the plate's offset) is taken off every sample, and the threshold becomes 5 × its SD (3 to 50 N). If that fails, the fixed threshold is used. A fixed threshold can still be chosen in Setup.
- **Compare trials** compares trials of the same type: a table with group mean ± SD and overlaid curves (time-normalised or lined up).
- **Exports:** continuous CSV, results CSV, points CSV, time-normalised windows, PNG graph, Word report, whole-session CSVs and a project file.

## Standing long jump

Chosen automatically when the file name says SLJ (or SBJ, long jump, broad jump), or when a countermovement jump has a big forwards push and no landing on the plate. The vertical force is analysed exactly as a CMJ (weighing, start of movement, unweighting, braking, propulsion), except that the start of movement is found by working back from the lowest force of the countermovement, so a wobble while balancing on one leg is not taken as the start. For each loaded plate the forwards force is Fx or Fy, whichever has the biggest impulse before take-off, signed so forwards is positive, less its value while standing still. Horizontal velocity is integrated from rest at the end of the still standing (the lean and arm swing push forwards before the vertical countermovement starts).

Results: horizontal and vertical take-off velocity, resultant take-off velocity, take-off angle, rise of the centre of mass, time to take-off; horizontal net, propulsive and braking impulse, peak and mean horizontal force, peak horizontal power, peak and mean total power; peak resultant force, force angle at peak and mean force angle, ratio of forces, horizontal to vertical impulse ratio; all the CMJ phase results; left vs right (including horizontal impulse) when the plates are marked left and right. A single-leg jump (one plate loaded) is noted. Jump distance is not given: measure it with a tape. Centre of pressure needs moment channels, which BioWare files exported with forces only do not have.

## Results by jump

| | CMJ | Squat jump | Drop jump |
|---|---|---|---|
| Outcome | Jump height (take-off velocity and flight time), take-off velocity, flight time, time to take-off, RSImod, peak force, peak power | Jump height (both), take-off velocity, flight time, propulsion time, RSImod, peak force, peak power | Jump height (both), take-off velocity, flight time, contact time, RSI, peak force |
| Phases | Unweighting: duration, minimum force, peak downward velocity, impulse. Braking: duration, peak and mean force, impulse, RFD, force at zero velocity, depth, peak braking power. Propulsion: duration, peak and mean force, impulse, mean power, peak velocity, push-off distance | Propulsion: mean force, impulse, mean power, peak velocity, push-off distance, time to peak force, RFD 0–50, 0–100 and 0–200 ms, countermovement check | Touchdown velocity, effective drop height. Braking: peak impact force, duration, impulse, mean force, centre of mass displacement, vertical stiffness. Propulsion: duration, peak and mean force, impulse, peak power |
| Landing | Peak landing force, time to peak, loading rate, landing duration and depth, landing velocity | as CMJ | as CMJ |
| Left vs right | Braking and propulsive impulse, peak force, peak landing force | Propulsive impulse, peak force, peak landing force | Braking and propulsive impulse, peak force, peak landing force |

## Demo trials

- **Demo: CMJ** is the BioWare sample countermovement jump (one plate, 250 Hz). The Kinematic Analysis demo CMJ is built from this jump, so students can measure the same jump with both tools.
- **Demo: drop jump** is a real drop jump from two plates at 1000 Hz, with still standing after landing, so backward integration works.
- **Demo: squat jump** is computer-generated (one plate, 1000 Hz, body mass 72 kg). The push starts at 1.50 s from a still squat. Take-off velocity at the true take-off (1.80 s) is 2.29 m/s (26.7 cm), and the flight time is 0.475 s (27.7 cm by flight time, because it lands 2 cm lower than it took off). The tool gives about 1 cm more from take-off velocity (27.8 cm), because take-off is found where force drops below the contact threshold, slightly before the true take-off (the threshold from the empty plate, about 8 N here, gets closer than a fixed 20 N), when the body is still slightly faster. That makes a useful discussion point.
- **Demo: walking (two plates)** is the BioWare sample walking trial: two footsteps on two plates at 250 Hz, with Fx, Fy and Fz.
- **Demo: walking (four trials in one file)** is the BioWare sample with four right-foot trials merged into one file at 125 Hz, to practise splitting a file and comparing trials.

- **Demo: standing long jump** and **(single leg)** are real trials from two plates at 1000 Hz (both feet, one foot per plate; and left leg only).
- **Demo: IMTP** is a real isometric mid-thigh pull at 1000 Hz, with the body weight entered in BioWare.

Demos are chosen from **Try a demo** in the header. Personal details in the sample files were removed.

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
js/generic.js           analysis of any force–time data from points marked by hand (walking, running, landing, isometric, any)
js/gtrace.js            the graph for those trials (points, windows, cursor, zoom)
js/gpanel.js            the Points tab, windows and their exports
js/compare.js          comparing trials and whole-session exports
js/export.js           CSV, PNG, Word report, project files
js/zip.js              a tiny zip writer for the Word report
sw.js                  offline support
manifest.webmanifest   app install details
demo/                  demo trials
icons/                 app icons
```

Built by Dr Tommy Bright.
