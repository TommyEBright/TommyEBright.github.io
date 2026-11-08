# EMG Analysis

The third tool in the suite, after Kinematic Analysis and Force Analysis. It runs in the browser on surface EMG from Delsys EMGworks text exports, or from any text or CSV file with EMG columns. Nothing is uploaded. It works offline once loaded and can be installed as an app.

## What students do
1. **Add files.** Add the MVIC files and the task trials together. In the Session table, set each file's **Type** (MVIC or Task), its participant, and the exercise for task trials.
2. **1. Setup.** For each MVIC file, tick the muscle it is for. Choose how to normalise: %MVIC (the default), % of the session peak, or µV.
3. **2. Points.** Mark by hand each Rep start and Rep end, any phase changes, and each muscle's onset and offset. A rest period is optional; it gives an onset guide line and a noise check.
4. **3. Results.** Seven outputs: (1) peak and mean %MVIC, (2) onset, offset and burst duration, (3) order of activation, (4) co-contraction, (5) ratios between muscles, (6) average waveform (mean ± SD, VR), (7) iEMG. Quality checks are underneath.
5. **Compare trials.** Results by exercise or participant, a bar chart, overlaid average waveforms, and session CSVs.
6. **Go deeper.** Processing steps, median frequency (fatigue) and rate of rise.

## Processing (matches the lab MATLAB script)
- Band-pass 20–450 Hz, 4th-order Butterworth, zero lag (`butter(4,[20 450]/nyq,'bandpass')` + `filtfilt`)
- Full-wave rectify
- Low-pass 6 Hz, 4th order, zero lag
- Clip values below zero
- %MVIC = envelope ÷ the highest MVIC envelope for that muscle (per participant) × 100

The JavaScript filters match SciPy to about 1e-13. Whole-trial values reproduce `hamstring_EMG_amplitude_results.xlsx` to every decimal place shown (e.g. RDL SM 158.87% peak and 33.98% mean; NHE SM 191.09% and 62.13%).

## Demo
A hamstring session (one participant): 7 MVIC files, a Romanian deadlift and a Nordic hamstring exercise. In "reps already marked", the RDL has 6 reps. The NHE has 4 reps, catch phases, a rest period, and onsets and offsets for reps 1 and 2. **These are real participant data: confirm consent covers public use before publishing.**

## Hosting
Upload the folder to GitHub Pages, as for the other tools. When you change any file, bump `VERSION` in `sw.js` and the `?v=` numbers.
