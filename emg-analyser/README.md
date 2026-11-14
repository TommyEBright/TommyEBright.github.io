# EMG Analysis

The third tool in the suite, after Kinematic Analysis and Force Analysis. It runs in the browser on surface EMG from Delsys EMGworks text exports, or from any text or CSV file with EMG columns. Nothing is uploaded. It works offline once loaded and can be installed as an app.

## What students do
One row of steps stays at the top of the page, with **Back** and **Next** buttons and a message saying what just happened. Each step opens with a short box: what is happening, what to do, and a **Why?** for more.

1. **Add files** (or try a demo). The **Your files** checklist (what you are analysing, what sets 100%, naming each exercise, finding the reps) ticks itself off. The file list folds away once you move on, and can be opened again at any time.
2. **Step 1 · Set up.** For each MVIC file, tick the muscle it is for. Choose how to normalise: %MVIC (the default), % of a reference trial, % of the session peak, or µV.
3. **Step 2 · Reps and phases.** Press **Find reps** (also in the box above the graph), then check each shaded box covers one rep. Every point can be dragged, deleted or marked by hand. Onsets and offsets are automatic unless marked.
4. **Step 3 · Results.** A strip shows what happened to the data (raw → filtered → rectified → smoothed → normalised), with a link to see each step on the file. Then the three results most lab reports need: (1) peak and mean, (2) onset, offset and burst duration, (3) average waveform (mean ± SD, VR). **More results** holds (4) order of activation, (5) co-contraction, (6) ratios between muscles and (7) iEMG. A **methods paragraph** is written from the settings actually used, ready to copy. Quality checks are underneath.
5. **Step 4 · Figure.** A figure builder: over time, average rep (0–100%) or bars; layers, muscles, labels and size can be switched; saves PNG or SVG.
6. **Step 5 · Export.** Discrete data (one row per rep, phase and muscle) and continuous data (0–100% curves, or every sample with its rep and phase).
7. **Compare trials.** Results by exercise or participant, a bar chart, overlaid average waveforms, and session CSVs.
8. **Go deeper** (opens from the step bar). Processing steps, median frequency (fatigue), on/off settings and rate of rise.

The graph is shown while setting up and finding reps, and folds away for results, figures and exports (**Show the graph** brings it back).

## Processing (matches the lab MATLAB script)
- Band-pass 20–450 Hz, 4th-order Butterworth, zero lag (`butter(4,[20 450]/nyq,'bandpass')` + `filtfilt`)
- Full-wave rectify
- Low-pass 6 Hz, 4th order, zero lag
- Clip values below zero
- %MVIC = envelope ÷ the highest MVIC envelope for that muscle (per participant) × 100

The JavaScript filters match SciPy to about 1e-13. Whole-trial values reproduce `hamstring_EMG_amplitude_results.xlsx` to every decimal place shown (e.g. RDL SM 158.87% peak and 33.98% mean; NHE SM 191.09% and 62.13%).

## Finding reps (js/events.js)
Three choices: which signal, what to look for, and the limits. Each activity has a preset.
- **Running or walking:** impacts (accelerometer high-passed at 15 Hz), one foot strike per stride, stride time from the autocorrelation.
- **Gym exercise:** tilt angle (accelerometer low-passed at 1.5 Hz = gravity; angle from the starting position); a rep is out and back, with the phase change at the furthest point.
- **Cycling:** the most-moving axis, one peak per cycle.
- **Jumping:** flight is where the acceleration is near 0 g. **Not yet checked against real jump data.**
- **Isometric holds:** EMG above a level.
- **Something else:** any signal in the file (including extra channels such as a dynamometer angle) with any of the four methods.

Checked on four treadmill running trials (BF and VL) and the two demo files. The cycling, jump and isometric presets have only been checked on made-up signals, so test them on real trials before students rely on them.

## Demo
A hamstring session (one participant): 7 MVIC files, a Romanian deadlift and a Nordic hamstring exercise. In "reps already marked", the RDL has 6 reps. The NHE has 4 reps, catch phases, a rest period, and onsets and offsets for reps 1 and 2. **These are real participant data: confirm consent covers public use before publishing.**

## Hosting
Upload the folder to GitHub Pages, as for the other tools. When you change any file, bump `VERSION` in `sw.js` and the `?v=` numbers.
