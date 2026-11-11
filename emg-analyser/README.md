# EMG Analysis

The third tool in the suite, after Kinematic Analysis and Force Analysis. It runs in the browser on surface EMG from Delsys EMGworks text exports, or from any text or CSV file with EMG columns. Nothing is uploaded. It works offline once loaded and can be installed as an app.

## What students do
1. **Add files.** Add the MVIC files and the task trials together. In the Session table, set each file's **Type** (MVIC or Task), its participant, and the exercise for task trials.
2. **1. Setup.** For each MVIC file, tick the muscle it is for. Choose how to normalise: %MVIC (the default), % of the session peak, or µV.
3. **2. Reps and phases.** A box at the top says in plain words how reps and phases are defined in the open file. **Find reps** finds them from a movement signal (see below); every point can be dragged, deleted or marked by hand instead. Onsets and offsets are automatic unless marked.
4. **3. Results.** Seven outputs: (1) peak and mean, (2) onset, offset and burst duration, (3) order of activation, (4) co-contraction, (5) ratios between muscles, (6) average waveform (mean ± SD, VR), (7) iEMG. Quality checks are underneath.
5. **4. Figure.** A figure builder: over time, average rep (0–100%) or bars; layers, muscles, labels and size can be switched; saves PNG or SVG.
6. **5. Export.** Discrete data (one row per rep, phase and muscle) and continuous data (0–100% curves, or every sample with its rep and phase).
7. **Compare trials.** Results by exercise or participant, a bar chart, overlaid average waveforms, and session CSVs.
8. **Go deeper.** Processing steps, median frequency (fatigue) and rate of rise.

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
