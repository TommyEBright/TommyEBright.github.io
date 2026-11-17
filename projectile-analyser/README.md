# Projectile Motion

Projectile motion for sport and exercise biomechanics students, from the basics to a full analysis. Companion to Kinematic Analysis (`../video-analyser/`) and Force Analysis (`../force-analyser/`), in the same style.

Runs in the browser, works offline once loaded, nothing is uploaded.

## 1. Learn (10 steps)
Each step has plain words, the equation with every symbol named, an interactive figure, live numbers and a quick check question.

1. What is a projectile (only gravity acts after release; release speed, angle and height decide the path)
2. Scalars and vectors (drag a velocity arrow)
3. The right-angled triangle (hypotenuse, opposite, adjacent; switch the angle)
4. Pythagoras (squares on each side)
5. Sine, cosine and tangent, SOH CAH TOA, and the inverse functions (with calculator and Excel tips)
6. Resolving a release velocity into components and back (drag it; ATAN2 for backwards and downwards)
7. Horizontal and vertical are independent (dropped vs thrown ball)
8. Peak height, flight time and range, with release height (sliders, every number worked through)
9. Which angle is best: for distance (optimum below 45° when release is above landing) and for a target (minimum-speed angle, e.g. a free throw)
10. From video to numbers: why fitting beats differencing, and the gravity check

Colours stay the same throughout: resultant (hypotenuse) blue, horizontal (adjacent) orange, vertical (opposite) purple, gravity red.

## 2. Analyse (9 steps)
1. **Load**: a demo, a video, or position data (CSV). A Kinematic Analysis *marker coordinates* export works as it is (choose the marker). Otherwise `time_s, x_m, y_m` (y up, metres), or a frame column plus the frame rate.
2. **Scale** (video): file and filmed frame rates (slow motion), scale from a known length, origin on the floor, and the hoop centre for shots.
3. **Digitise** (video): click the ball centre frame by frame, auto-advance, loupe, arrow keys.
4. **Release and landing**: choose the flight frames, with a live gravity check. *Suggest* finds the longest clean projectile section (straight line horizontally, parabola vertically, residuals at the noise level estimated from second differences), then moves about 15 ms in from each end to be safe.
5. **Fit and check**: least-squares fit with time from the release frame: x = x0 + vx t; y = y0 + vy t - g t^2/2. First with g free (the check: should be 9.81 m/s^2), then with g fixed at 9.81 for the release values. Residuals and differencing vs fitting shown.
6. **Release**: speed, angle and height with standard errors (from the fit covariance, propagated to speed and angle), the velocity triangle drawn on the flight, and the limits (release timing, 2D, air resistance).
7. **What it predicts** (by task):
   - basketball shot: position at rim height on the way down (long/short), entry angle, room for error (R - r/sin(entry), rim radius 22.9 cm, ball radius 11.9 cm), minimum-speed angle, speed needed at the release angle;
   - broad jump (centre of mass): flight distance plus take-off and landing distances (Hay, 1986);
   - shot put: distance from the stop board and the textbook optimum angle (with the caveat that speed falls at higher angles; Linthorne, 2001);
   - any projectile: peak, flight time and range to a chosen landing height.
8. **What if**: speed, angle and height sliders against the measured path, and the effect of +0.1 m/s, +1° and +5 cm.
9. **Save**: results and frame-by-frame data (CSV), the figure (PNG), and a method sentence for lab reports.

Deep links: `index.html#learn-5`, `index.html#analyse-1`.

## Demos
- `demo/demo-free-throw-60fps.mp4`: a drawn, side-on free throw at 60 fps (1280 × 720, 150 px per metre), 1 m stick at the left, origin at the free-throw line, release at frame 29: 6.98 m/s at 52° from 2.10 m, hoop centre 4.225 m ahead and 3.05 m up. All-intra H.264 so frame seeking is exact. *Use the demo values* sets the calibration; *Fill in the demo for me* digitises every second frame with a 1.5 px clicking error.
- Data demos are generated in `js/maths.js` (seeded, so always the same): free throw (60 Hz, 4 mm noise), broad jump centre of mass (100 Hz, 3 mm noise; 3.20 m/s at 36° from 0.88 m, take-off 0.42 m, landing 0.48 m), shot put (50 Hz, 15 mm noise; 12.5 m/s at 37° from 2.15 m). Each includes the motion before release and (broad jump) after landing, which is not a projectile. The release step compares the result with the true values at the chosen release frame.

Replace the drawn video with real footage when there is some: keep the `VIDEO_DEMO` values in `js/maths.js` in step (frame rate, stick and origin pixels, release frame).

## Files
`index.html`, `css/style.css` (same theme as the other tools), `js/app.js` (page shell), `js/learn.js`, `js/analyse.js`, `js/maths.js` (fits, projectile equations, demos), `js/plot.js` (canvas figures), `sw.js` (offline; bump `VERSION` after any change), `manifest.webmanifest`, `icons/`.
