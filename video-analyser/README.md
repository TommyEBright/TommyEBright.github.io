# Kinematic Video Analyser

A free 2D video analysis tool for sport and exercise biomechanics. It runs entirely in the web browser: videos are opened from the student's own device and are never uploaded anywhere. It can be installed as an app (PWA) on laptops, tablets and phones and works offline once loaded.

It does the core jobs of packages like Quintic or Kinovea, and it explains how every number is calculated so students can write about their method.

## What it does

- **Setup:** frame rate detection, a "slowed down by" setting for slow-motion clips saved at 30 fps, direction of travel, rotate and mirror the picture.
- **Calibrate:** scale from a known length, custom origin, camera tilt correction and a calibrated grid to check the scale.
- **Points:** built-in point sets, or your own points and segments. An angle builder for joint angles (180° = straight, or flexion with 0° = straight) and segment angles from vertical or horizontal.
- **Digitise:**
  - Click by hand with a magnifier and snap-to-marker.
  - Automatic marker tracking.
  - AI pose estimation (MediaPipe), which zooms in on small or distant athletes and follows them.
  - A list of frames the tool is unsure about, so students can check them.
- **Events:**
  - Named event buttons, including your own.
  - Nudge events a frame at a time.
  - Suggested events (take-off, landing, touchdown, toe-off).
  - A stopwatch for the time between any two events.
  - Loop playback of a phase.
- **Measure:** distance, joint angle, segment vs vertical, segment vs horizontal and the angle between two lines on any single frame.
- **Results:**
  - Key numbers.
  - An angle summary table.
  - Values at each event.
  - Graphs of position, velocity (or resultant speed, in m/s or km/h), acceleration, angles and angular velocity. They can show several points, use time from an event, mark the max and min, and be clicked to jump the video.
  - A filter check: raw vs filtered, the residual analysis curve and what was removed over time.
  - Quality checks: segment length consistency and a gravity check for jumps.
  - Markers vs AI comparison.
  - A live data panel under the video.
- **Export:**
  - **Analysis CSV:** the filtered data behind the graphs.
  - **Coordinates CSV:** chosen points as raw pixels, metres and filtered values, with how each point was placed and the tool's confidence. Wide or long layout.
  - **Summary CSV:** settings, key numbers, events, stopwatch times and measurements.
  - Frame image and graph images (PNG).
  - Photo sequence.
  - Project file (save and carry on later).

## Demo clips

- **Demo: jump** is a computer-generated countermovement jump at 120 fps with a 1 m pole for calibration. The true take-off is frame 162 and landing is frame 226 (flight 0.533 s, jump height about 34.9 cm), so students can check their answers.
- **Demo: sprint** is a real sprint filmed at 240 fps but saved as a 30 fps file (slowed 8×). It shows why the slow-down setting matters. There is no calibration object in the picture, so it is for times, angles and pixel-based work only.

## Putting it on GitHub Pages

1. Create a new public repository (e.g. `kinematic-video-analyser`).
2. Upload everything in this folder, keeping the folder structure (`index.html` at the top level, with `css`, `js`, `icons` and `demo` folders).
3. Go to **Settings → Pages**, set the source to **Deploy from a branch**, then choose `main` and `/ (root)`. Save.
4. After a minute or two the tool is live at `https://<your-username>.github.io/kinematic-video-analyser/`.
5. To install it as an app, open that address in Chrome or Edge and use **Install**. On an iPhone or iPad, use Safari's **Share → Add to Home Screen**.

When you change any file, also bump `VERSION` in `sw.js` (e.g. `kva-1.0.1`) so installed copies pick up the update.

It can also be embedded in a VLE page with an iframe, for example:

```html
<iframe src="https://<your-username>.github.io/kinematic-video-analyser/" style="width:100%;height:1400px;border:0" allow="fullscreen"></iframe>
```

## Privacy

Videos are read by the browser on the student's own device and are not uploaded. Work is saved in the browser's local storage for that video and can be saved as a project file. The only network requests are for the app files and, if the AI pose option is used, a one-off download of Google's MediaPipe library (jsDelivr) and model (Google Cloud Storage). The video itself is never sent.

## Methods in brief

- **Filtering:** a 4th-order zero-lag Butterworth low-pass filter (2nd order, run forwards and backwards), with the cut-off corrected for the two passes (Winter, 2009). The ends are padded with an odd reflection. Residual analysis is used to suggest a cut-off.
- **Derivatives:** first and second central differences.
- **Gap filling:** natural cubic spline.
- **Joint angles:** from the dot product of segment vectors. Segment angles are taken from vertical or horizontal in a forwards-positive, up-positive frame.
- **Marker tracking:** colour zero-mean normalised cross-correlation with sub-pixel refinement, constant-velocity prediction and two templates.
- **AI pose:** MediaPipe Pose Landmarker (BlazePose), run in image mode on an enlarged crop that follows the athlete, with left/right leg swap correction.

The full explanation, written for students, is in the tool under **How everything is calculated**.

## References

- Bartlett, R. (2007) *Introduction to Sports Biomechanics*, 2nd edn. Routledge.
- Bazarevsky, V. et al. (2020) BlazePose: on-device real-time body pose tracking. arXiv:2006.10204.
- Hamill, J., Knutzen, K.M. and Derrick, T.R. (2015) *Biomechanical Basis of Human Movement*, 4th edn. Wolters Kluwer.
- Payton, C.J. and Bartlett, R.M. (eds) (2008) *Biomechanical Evaluation of Movement in Sport and Exercise*. Routledge.
- Winter, D.A. (2009) *Biomechanics and Motor Control of Human Movement*, 4th edn. Wiley.

## Files

```
index.html             the page
css/style.css          styles
js/app.js              start-up and wiring (setup, calibration, points, angle builder, demos, install)
js/state.js            saved state, point sets, helpers
js/maths.js            calibration, filter, residual analysis, derivatives, angles, gap filling
js/video.js            video loading, frame rendering, rotate/flip, seeking, frame-rate detection
js/overlay.js          drawing, magnifier, clicking, snap-to-marker, measurements
js/tracking.js         marker tracking, AI pose, quality flags
js/events.js           events, stopwatch, loop, suggested events, event-based values
js/results.js          results, graphs, filter check, quality checks, live data
js/charts.js           SVG charts
js/export.js           CSV exports, images, photo sequence, project files
sw.js                  offline support
manifest.webmanifest   app install details
demo/                  demo clips (MP4 and WebM)
icons/                 app icons
```

Built by Dr Tommy Bright.
