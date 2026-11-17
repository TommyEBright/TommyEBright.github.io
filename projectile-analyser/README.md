# Projectile Motion

Projectile motion for sport and exercise biomechanics students, from the basics to a full analysis. Companion to Kinematic Analysis (`../video-analyser/`) and Force Analysis (`../force-analyser/`), in the same style.

Runs in the browser, works offline once loaded, nothing is uploaded.

## 1. Learn (5 steps, all on the same free throw)
Picture first: one big animated or adjustable figure per step, a few plain sentences, the equations and worked numbers behind **Show me the maths**, and a quick check question. Plain words ("forwards", "upwards") come before symbols.

1. Once it is thrown, only gravity acts (animated ball with velocity and gravity arrows)
2. Split the arrow into a triangle (speed and angle sliders; Pythagoras, SOH CAH TOA and Excel tips in the maths)
3. Forwards stays the same, upwards changes (the ball every 0.1 s with its two arrows)
4. Make the basket (speed, angle and height sliders, in/long/short, entry angle, room for error, and what +0.1 m/s or +1° is worth; best angles for distance in the maths)
5. From video to numbers (noisy clicks appear, the fitted curve and release triangle snap on; clicking-error slider)

Colours never change: forwards orange, upwards purple, the ball's direction blue, gravity red.

## 2. Analyse (4 steps, then Go further)
1. **Load**: the free throw video (recommended first), three data demos, or your own video or CSV (Kinematic Analysis marker export, or `time_s, x_m, y_m`). Filming advice and the file format sit in drop-downs here.
2. **Scale** (video): a checklist and a big instruction on the video itself walk through one end of the stick, the other end, the floor (origin) and, for shots, the hoop. Frame rates in a drop-down. *Do it for me* on the demo.
3. **Click the ball** (video): clicking is on straight away and the video moves on after each click. Undo, clear, and *Do it for me* on the demo.
4. **Results**: one picture (flight, predicted path, release triangle, green release ring and red last-in-the-air ring), three big numbers (speed, angle, height), one sentence on the outcome for the chosen task, and a traffic light ("You can trust these numbers") from the gravity check. Release and landing are picked automatically (or from the documented events in the demos).
5. **Go further**: everything rigorous, unchanged, in six tabs:
   - **Release and landing frames**: move them by hand with a live gravity check, or *Suggest* (the longest clean projectile section, then about 15 ms in from each end).
   - **Fit and gravity check**: least squares, x = x0 + vx t and y = y0 + vy t - g t^2/2, first with g free (the check), then g fixed at 9.81; residuals; differencing vs fitting.
   - **Release, in detail**: values with standard errors (fit covariance, propagated to speed and angle), the demo truth at the chosen release frame, and the limits (release timing, 2D, air resistance).
   - **What it predicts**: basketball (miss at rim height, entry angle, room for error R - r/sin(entry), minimum-speed angle, speed needed), broad jump (Hay, 1986, take-off + flight + landing distances), shot put (distance from the stop board, textbook optimum with the Linthorne, 2001 caveat), any projectile.
   - **What if**: speed, angle and height sliders, and the effect of +0.1 m/s, +1° and +5 cm.
   - **Save and report**: CSV, PNG and a method sentence.

Deep links: `index.html#learn-4` (the game), `index.html#analyse-1`.

## Demos
- `demo/demo-free-throw-60fps.mp4`: a drawn, side-on free throw at 60 fps (1280 × 720, 150 px per metre), 1 m stick at the left, origin at the free-throw line, release at frame 29: 6.98 m/s at 52° from 2.10 m, hoop centre 4.225 m ahead and 3.05 m up. All-intra H.264 so frame seeking is exact. *Do it for me* in Scale sets the calibration; *Do it for me* in Click the ball digitises every second frame where the ball really is, with a 1.5 px clicking error, so any calibration error of the student's own carries through as it would.
- Data demos are generated in `js/maths.js` (seeded, so always the same): free throw (60 Hz, 4 mm noise), broad jump centre of mass (100 Hz, 3 mm noise; 3.20 m/s at 36° from 0.88 m, take-off 0.42 m, landing 0.48 m), shot put (50 Hz, 15 mm noise; 12.5 m/s at 37° from 2.15 m). Each includes the motion before release and (broad jump) after landing, which is not a projectile. The release step compares the result with the true values at the chosen release frame.

Replace the drawn video with real footage when there is some: keep the `VIDEO_DEMO` values in `js/maths.js` in step (frame rate, stick and origin pixels, release frame).

## Files
`index.html`, `css/style.css` (same theme as the other tools), `js/app.js` (page shell), `js/learn.js`, `js/analyse.js`, `js/maths.js` (fits, projectile equations, demos), `js/plot.js` (canvas figures), `sw.js` (offline; bump `VERSION` after any change), `manifest.webmanifest`, `icons/`.
