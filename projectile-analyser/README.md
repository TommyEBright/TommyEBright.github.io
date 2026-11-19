# Projectile Motion

Projectile motion for sport and exercise biomechanics students, from the basics to a full analysis. Companion to Kinematic Analysis (`../video-analyser/`) and Force Analysis (`../force-analyser/`), in the same style.

Runs in the browser, works offline once loaded, nothing is uploaded.

## 1. Learn (6 steps, all on the same free throw)
Picture first: one big animated or adjustable figure per step, a few plain sentences, the equations and worked numbers behind **Show me the maths**, and a quick check question. Plain words ("forwards", "upwards") come before symbols.

1. Once it is thrown, only gravity acts (animated ball with velocity and gravity arrows)
2. Split the arrow into a triangle (speed and angle sliders; Pythagoras, SOH CAH TOA and Excel tips in the maths)
3. Forwards stays the same, upwards changes (the ball every 0.1 s with its two arrows)
4. Make the basket (speed, angle and height sliders, in/long/short, entry angle, room for error, and what +0.1 m/s or +1° is worth)
5. From video to numbers (noisy clicks appear, the fitted curve and release triangle snap on; clicking-error slider)
6. **Film it right**: the perfect set-up, as the camera sees it (top) and from above (bottom): side-on, level, 8 to 10 m back, 1 m stick in the plane of the shot, 100 fps or more, tripod. Buttons show what each mistake does (too close, not side-on, stick too near the camera, low frame rate), with a count of frames of flight in shot and what it does to the numbers. Ends with *Try it yourself*.

Colours never change: forwards orange, upwards purple, the ball's direction blue, gravity red.

## 2. Analyse (6 steps, then Compare)
1. **Load**: a demo (free throw video, recommended first; netball shot; line-out throw; standing long jump centre of mass; standing long jump on force platforms; shot put) or your own video (MP4, or Motion JPEG AVI straight from the lab cameras), CSV (Kinematic Analysis marker export, or `time_s, x_m, y_m`) or force platform file (BioWare text export, or CSV with time, Fx, Fz). Choose the task (basketball free throw, netball shot, line-out throw, jump, shot put, any projectile).
2. **Scale** (video): the two ends of anything of known length in the plane of the shot (a 1 m stick is easiest; a measured floor line or floor to rim, 3.05 m, also work; type in the length), the floor (origin) and, for shots, the hoop or ring. *No stick? Use the ball* as a fallback. *Do it for me* on the demo.
3. **Track the ball** (video): first **mark the events** (release, end of the flight, and your own if you want them), so only the frames that matter are digitised. Tick *Only show the marked part of the video* and the frame slider and step buttons are limited to the first to last marked event (add an event such as *start of the shot* to widen it). Then either:
   - **Click it myself** (the default): a red ring the size of the ball follows the mouse, so students line the ring up with the ball outline rather than guessing its centre (resize with the − / + buttons or the scroll wheel). From the third point, a yellow dashed circle shows where the ball should be in the next frame (a parabola through the nearest points, with gravity in pixels from the scale and frame rate). *Auto-centre* nudges each click to the middle of the ball, and the video moves on by itself.
   - **Automatic (clear video only)**: click the ball once at release and the tool finds it in every frame to the end of the flight (blob, edge and circle fit, with template matching and a gravity-based guess). It stops if it loses the ball. Best on clean, well-lit footage; on real lab video, clicking is more reliable.
   Switch between the two at any time, and fix any frame by clicking it again.
4. **Results**: the flight, the predicted path and the release triangle; three big numbers (speed, angle, height) with 95% ranges when the flight is short; one sentence on the outcome for the task; a traffic light from the gravity check. *See it on the video* draws the predicted path over the footage. *Add to comparison* saves the trial. *What do my numbers mean?* opens the next step.
5. **What it means**: one card per number (release speed, angle and height, forwards and upwards velocity, peak height, the outcome, the gravity check). Each says what the number is, what this trial shows compared with projectile theory (e.g. least speed and angle to reach the hoop, how far 0.1 m/s or 1° moves the ball, the best angle for this speed and height), and a sentence for the report. Tapping a card highlights that quantity on the figure (the triangle, the angle, the constant forwards arrows, the shrinking upwards arrows, the peak, 0.1 s dots to the target). Ends with an editable results paragraph (with a method sentence) to copy. Comparisons are with theory, not with norms from the literature.
6. **Go further**: release and landing frames with a live gravity check, the fit and residuals, release values with standard errors, what it predicts (basketball and netball: miss at rim/ring height, entry angle, room for error; line-out: time to the catcher and height at the catcher; jumps: Hay, 1986, distance parts; shot put: distance and the Linthorne, 2001, caveat), what if, and save (CSV, PNG, method sentence). For force platform data: the force and velocity traces instead of the frame steps.
7. **Compare**: every saved trial in a table with groups (e.g. made/missed, cue A/B), group means and SDs, all paths drawn from a common release point, and a report-ready figure and CSV. Trials are kept in this browser only.

Deep links: `index.html#learn-6` (filming), `index.html#analyse-1`.

## Demos
- `demo/demo-free-throw-100fps.mp4`: a drawn, side-on stick-person free throw filmed exactly as Learn step 6 recommends (100 fps, 1920 × 1080, 225 px per metre, drawn at twice the size and scaled down so every edge is sharp, 1 m stick at the left, origin at the free-throw line). Release at frame 95: 6.98 m/s at 52° from 2.10 m; hoop centre 4.225 m ahead and 3.05 m up. All-intra H.264 so frame seeking is exact. Events are set for the demo; *Do it for me* tracks it automatically (mean error under 1 px).
- **Standing long jump on force platforms** (`demo/demo-slj-force.txt`): the same file as the Force Analysis demo (1000 Hz, BioWare export), worked out by the same method: about 2.80 m/s forwards and 1.55 m/s upwards (3.20 m/s at 28.9°). Bodyweight from the steadiest 1 s, take-off when Fz drops below 20 N, velocity by integrating net force ÷ mass from rest. Force platforms do not give the height of the centre of mass at take-off, so the student enters it (demo: 0.90 m, with typical take-off and landing distances), and the predicted distance is shown with that caveat.
- Data demos are generated in `js/maths.js` (seeded): free throw, netball shot, line-out throw, broad jump centre of mass and shot put, each including movement before release that is not a projectile. The release step compares the result with the true values at the chosen release frame.

Replace the drawn video with real footage when there is some: keep the `VIDEO_DEMO` values in `js/maths.js` in step (frame rate, stick and origin pixels, release and end frames).

## Files
`index.html`, `css/style.css` (same theme as the other tools), `js/app.js` (page shell), `js/learn.js`, `js/analyse.js`, `js/maths.js` (fits, projectile equations, demos), `js/ball.js` (automatic ball finding and tracking), `js/forceplate.js` (force platform reader and take-off velocity), `js/plot.js` (canvas figures), `sw.js` (offline; bump `VERSION` after any change), `manifest.webmanifest`, `icons/`.

## Lab camera AVI files
Browsers cannot play AVI, so Motion JPEG AVIs (e.g. the lab's high-speed cameras: greyscale, 100 or 200 fps) are read directly in the browser: each frame is decoded from the file and the frame rate is taken from the file header, so it is exact and no conversion is needed. Frames without JPEG Huffman tables (allowed in Motion JPEG) get the standard tables added before decoding. Dark footage is brightened automatically for display; the Brightness slider under the video changes it and never affects the clicks. Other AVI codecs still need converting to MP4 (H.264).

## Short flights and no calibration stick
- **From 3 frames.** With g fixed there are only two unknowns each way, so the release values can be fitted from 3 frames in the air. The gravity check (g free) needs 5. Below 10 frames, Results shows a 95% range (2 standard errors) under each number and marks the outcome as rough. Standard errors use the larger of the fit's own scatter and a floor of 1.5 pixels of clicking (3 mm for imported data), because with 3 or 4 frames the scatter alone can look misleadingly small. Checked on the free throw demo: 3 frames gave 7.14 ± 0.48 m/s and 52.6 ± 3.8° (true 6.98 m/s, 52.0°); 4 frames 7.04 ± 0.24 m/s and 52.4 ± 1.9°.
- **The ball as the scale.** In Scale, *No stick? Use the ball* asks for the left and right edges of the ball in a sharp frame, with the ball size (size 7: 23.9 cm; size 6: 23.2 cm; size 5: 22.0 cm). It is less precise than a 1 m stick, because a pixel is a larger share of a small ball.
