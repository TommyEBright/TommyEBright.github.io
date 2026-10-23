# Kinematic Analysis

Linear and angular kinematics from your own video files. A free 2D video analysis tool for sport and exercise biomechanics.

It runs entirely in the web browser. Videos are opened from the user's own device and are never uploaded. It can be installed as an app on laptops, tablets and phones, and works offline once loaded.

## What it does

- **Session:** add one video or several (e.g. one athlete's trials, or one trial from each athlete) and label each with athlete, condition and trial number. Work through them one at a time with **Next trial**. Markers, angles and settings carry over, and calibration can carry over after the user confirms the camera has not moved.
- **Setup:**
  - frame-rate detection;
  - a "slowed down by" setting for slow-motion clips saved at 30 fps;
  - which way the athlete faces (left, right, or no fixed direction);
  - rotate and mirror the picture.
- **Calibrate:** scale from a known length, custom origin, camera tilt correction, and a calibrated grid to check the scale.
- **Markers:**
  - starts blank; users name their own markers, optional segments between them, and their own angles (joint angles, or segment angles from vertical or horizontal);
  - marker sets can be saved as a file and loaded again.
- **Digitise:** click by hand (magnifier, snap-to-marker), or automatic marker tracking. When tracking loses a marker it pauses and asks the user to click it, then carries on by itself. A "Marker hidden" button leaves a gap when a marker cannot be seen. Uncertain frames are listed for checking.
- **Events:** named event buttons (including your own), nudging a frame at a time, suggested events from a chosen foot marker, a stopwatch for the time between any two events, and looping a phase.
- **Video formats:** MP4 and MOV open directly. Files the browser cannot play (e.g. AVI from Quintic or lab high-speed cameras) can be converted to MP4 inside the tool with **Convert to MP4**. Every frame is kept, the frame rate is read from the original file, and the result can be saved.
- **Measure:** distance, joint angle, segment vs vertical or horizontal, and the angle between two lines on a single frame.
- **Results (per trial):**
  - key numbers, an angle table and values at each event;
  - graphs of position, velocity or speed, acceleration, angles and angular velocity, with max and min marked and time measured from an event if wanted;
  - a filter check with residual analysis;
  - quality checks: segment lengths, and a gravity check for jumps;
  - a live data panel under the video.
- **Time normalisation:** any phase between two events (e.g. touchdown to toe-off) is resampled to 0–100% (101 points by default), with mean ± SD across repeats.
- **Compare trials (whole session):**
  - a table of chosen measures for every trial, with group mean ± SD by athlete, condition or both;
  - overlaid time-normalised curves by group.
- **Exports:**
  - **Per trial:** analysis CSV, summary CSV, time-normalised CSV, marker coordinates CSV (raw pixels, metres and filtered, clicked or tracked, wide or long layout), frame and graph images, and a photo sequence.
  - **Whole session:** summary CSV (one row per trial, or long format) and time-normalised CSV in long format, both with athlete, condition and trial columns.
  - **Project file:** saves the whole session (not the videos).

## Demo clips

- **Demo: jump** is a computer-generated countermovement jump at 120 fps, with a 1 m pole for calibration and five markers (shoulder, hip, knee, ankle, toe). The true take-off is frame 162 and landing is frame 226 (flight 0.533 s, jump height about 34.9 cm), so students can check their answers.
- **Demo: sprint** is a real sprint filmed at 240 fps but saved as a 30 fps file (slowed 8×). It shows why the slow-down setting matters. There are no markers or calibration object, so it is for event timing and clicking joints by hand.

## Putting it online (GitHub Pages)

The simplest option is a folder in an existing GitHub Pages site (e.g. `video-analyser`):

1. Unzip the download.
2. In the repository, open the folder (or create it). Choose **Add file → Upload files**.
3. Drag in everything from the unzipped folder, keeping the subfolders (`css`, `js`, `icons`, `demo`).
4. Commit. It is live a minute or two later (e.g. `https://<username>.github.io/video-analyser/`).

To update it, upload the new files over the old ones the same way. The app checks for new files whenever it is online. Bumping `VERSION` in `sw.js` also clears old offline copies.

To install it as an app, open the address in Chrome or Edge and use **Install**. On an iPhone or iPad, use Safari's **Share → Add to Home Screen**.

It can be embedded in a VLE page with an iframe:

```html
<iframe src="https://<username>.github.io/video-analyser/" style="width:100%;height:1400px;border:0" allow="fullscreen"></iframe>
```

## Privacy

Videos are read by the browser on the user's own device and are never uploaded. The session (markers, events, labels and settings, but not the videos) is kept in the browser's local storage and can be saved as a project file. The tool makes no network requests apart from loading its own files. The one exception is the first time someone presses **Convert to MP4**, when it downloads the converter (ffmpeg.wasm core, about 31 MB) from jsDelivr. The conversion itself runs on the user's computer and the video is not uploaded.

## Methods in brief

- **Filtering:** a 4th-order zero-lag Butterworth low-pass filter (2nd order, run forwards and backwards). The cut-off is corrected for the two passes (Winter, 2009), and the ends are padded with an odd reflection. Residual analysis suggests a cut-off.
- **Derivatives:** first and second central differences.
- **Gap filling:** natural cubic spline.
- **Angles:**
  - joint angles from the dot product of segment vectors (180° = straight, or flexion with 0° = straight);
  - segment angles from vertical or horizontal, in a frame where forwards and up are positive.
- **Time normalisation:** a natural cubic spline through the filtered data within each phase, read at n evenly spaced times; mean and SD are taken point by point.
- **Marker tracking:** colour zero-mean normalised cross-correlation with sub-pixel refinement, constant-velocity prediction and two templates. It pauses for a click when the match drops below the strictness level.

The full explanation, written for students, is in the tool under **How everything is calculated**.

## References

- Bartlett, R. (2007) *Introduction to Sports Biomechanics*, 2nd edn. Routledge.
- Hamill, J., Knutzen, K.M. and Derrick, T.R. (2015) *Biomechanical Basis of Human Movement*, 4th edn. Wolters Kluwer.
- Payton, C.J. and Bartlett, R.M. (eds) (2008) *Biomechanical Evaluation of Movement in Sport and Exercise*. Routledge.
- Winter, D.A. (2009) *Biomechanics and Motor Control of Human Movement*, 4th edn. Wiley.

## Files

```
index.html             the page
css/style.css          styles
js/app.js              start-up and wiring (setup, calibration, markers, angle builder, demos, install)
js/state.js            shared state, saving, helpers
js/session.js          sessions: adding videos, labels, next trial, carrying settings over
js/maths.js            calibration, filter, residual analysis, derivatives, angles, gap filling
js/video.js            video loading, frame rendering, rotate/flip, seeking, frame-rate detection
js/overlay.js          drawing, magnifier, clicking, snap-to-marker, measurements
js/tracking.js         marker tracking, the pause-and-click flow, quality flags
js/events.js           events, stopwatch, loop, suggested events, event-based values
js/results.js          results, graphs, time normalisation view, filter check, quality checks, live data
js/normalise.js        time normalisation maths
js/compare.js          comparing trials and whole-session exports
js/charts.js           SVG charts
js/convert.js          converting unplayable videos (e.g. AVI) to MP4 with ffmpeg.wasm
js/ffmpeg/             ffmpeg.wasm loader (MIT licence); the converter core is downloaded only when needed
js/export.js           per-trial CSV exports, images, photo sequence, project files
sw.js                  offline support
manifest.webmanifest   app install details
demo/                  demo clips (MP4 and WebM)
icons/                 app icons
```

Built by Dr Tommy Bright.
