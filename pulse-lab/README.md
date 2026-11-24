# Pulse Lab

A mobile-first web app that turns a smartphone into a heart rate variability (HRV) tool using camera photoplethysmography (PPG): a fingertip over the rear camera and flash. Built for Plymouth Marjon University Sport Science open days and teaching practicals.

Plain HTML, CSS and JavaScript. No framework, no build step, no libraries, no analytics, no cookies. All processing happens on the phone.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole app: markup, styles and app logic |
| `dsp.js` | Signal processing as pure functions (`window.PulseDSP`). It is a separate file so the tests and the app share the same code. |
| `manifest.json`, `sw.js` | Home-screen install and offline support |
| `icon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` | App icons |
| `tests.html`, `tests.js` | Unit tests for every processing function, run in the browser |
| `_headers`, `netlify.toml` | Netlify config (camera permission policy, no build) |

## Deploy to Netlify

The camera only works over HTTPS, and Netlify gives you that automatically.

**Drag and drop (quickest)**
1. Log in at app.netlify.com and choose **Add new site → Deploy manually**.
2. Drag the `pulse-lab` folder onto the page.
3. Netlify gives you a URL such as `https://something.netlify.app`. Open it on a phone.

**From GitHub (updates automatically on every push)**
1. **Add new site → Import an existing project**, pick this repository.
2. Set **Base directory** to `pulse-lab`, leave **Build command** empty and **Publish directory** as `pulse-lab` (or `.` relative to the base).
3. Deploy. Optionally set a custom domain under **Domain management**.

**After changing any file**, bump `VERSION` in `sw.js` (for example `pulse-lab-v2`) so installed copies pick up the new version. The service worker serves the cached copy first and refreshes it in the background, so phones may need the app opened twice to see a change.

## Using it

| URL | What you get |
| --- | --- |
| `/` | Open Day mode (the default) |
| `/?mode=lab` | Lab mode (remembered on that phone) |
| `/?mode=trends` | My Trends mode (remembered on that phone) |
| `/?mode=openday` | Back to Open Day |
| `/?test=1` | Synthetic test mode (see below) |
| `/tests.html` | Unit tests |

**Settings:** press and hold the Pulse Lab logo for about a second (or focus it and hold Enter or Space). The settings sheet lets you switch mode and, in Lab mode, choose the recording length (60, 120 or 300 s) and the settle time (5, 10, 15 or 30 s). In My Trends and Lab modes a gear button also appears. Open Day mode never shows a gear, so visitors don't stumble into the advanced views.

**Open day tip:** set each demo phone to Open Day mode, add it to the home screen and turn on Guided Access (iPhone) or screen pinning (Android) so visitors stay in the app.

**Brand colours:** change `--accent` (and `--accent-soft`, `--accent-ink`) at the top of the `<style>` block in `index.html`, once for light mode and once inside the dark-mode block. The "Learn more" link is `LEARN_MORE_URL` near the top of the script (currently a placeholder, `https://www.marjon.ac.uk/`).

## Testing on phones

**iPhone (Safari, iOS 15.4 or later)**
1. Open the Netlify URL in Safari (not inside Instagram, WhatsApp or another app's browser).
2. Tap **Measure my heart** and allow the camera.
3. iOS Safari can't switch the torch on from a web page, so the app shows "Your flash can't be switched on here. Sit near a bright light or a window." Hold the phone so a lamp or window shines through your fingertip. It works, the signal is just a bit weaker.
4. To install: Share → **Add to Home Screen**.
5. If you denied the camera: tap **aA** in the address bar → Website Settings → Camera → Allow.

**Android (Chrome)**
1. Open the URL in Chrome. Tap **Measure my heart** and allow the camera.
2. The flash should switch on. If it doesn't (some phones use a different rear camera), use a bright light as above.
3. You should feel a light tap with each heartbeat.
4. To install: menu → **Install app** or **Add to Home screen**.

**What a good reading looks like:** the signal bar goes green within a few seconds of the settle period, the waveform shows a regular train of peaks, and the heart beats in time with your pulse. If it stays red, press more lightly (pressing hard squeezes the blood out), cover the flash and camera fully, and rest your hand on something.

**Testing on a laptop:** the app needs a rear camera to work properly, but `?test=1` runs everywhere. To test locally, serve the folder over HTTP (for example `python3 -m http.server` inside `pulse-lab`) and open `http://localhost:8000/`. `localhost` counts as secure, so the camera and service worker work.

## Synthetic test mode and unit tests

`?test=1` replaces the camera with a generated PPG signal with known RR intervals (mean 850 ms, 40 ms respiratory sinus arrhythmia, 15 ms random jitter), irregular frame timing (about 30 fps with 3 ms jitter), baseline drift and white noise. The signal goes through the full live pipeline (finger detection, settle period, recording, resampling, filtering, peak detection, artefact correction). The result screen then shows the known RMSSD, the computed RMSSD and the difference, with PASS if they agree within 2 ms. Extra options:

- `&speed=10` plays the signal 10 times faster
- `&seed=42` uses a different random signal
- `&noise=0.3` changes the noise (SD per frame against a pulse amplitude of 3; default 0.1)
- `&mode=lab` shows the full Lab result

`tests.html` runs 32 unit tests covering every function in `dsp.js`: resampling, detrending, filter gain and zero phase, peak timing, parabolic interpolation, the refractory period, artefact rules, hand-worked RMSSD, SDNN and Poincaré values, quality index, the HRV score mapping, the trends baseline and band, CSV export, five full-pipeline RMSSD checks, a motion-artefact check and a two-segment (finger lifted) check.

**Results from the last run (Chrome, 24 Nov 2026):**

- Unit tests: 32 of 32 passed.
- In-app synthetic test, seed 7: known RMSSD 44.01 ms, computed 42.54 ms, difference −1.46 ms (PASS). Seed 42: 43.23 ms vs 42.50 ms, −0.74 ms (PASS).
- Sweep across 100 random seeds:

| Noise SD per frame | Mean error | SD of error | Worst error | Within 2 ms |
| --- | --- | --- | --- | --- |
| 0 | −0.66 ms | 0.22 | 1.02 ms | 100 / 100 |
| 0.05 | −0.57 ms | 0.30 | 1.34 ms | 100 / 100 |
| 0.1 (default) | −0.35 ms | 0.50 | 1.77 ms | 100 / 100 |
| 0.2 | +0.48 ms | 0.95 | 2.33 ms | 94 / 100 |
| 0.3 | +1.78 ms | 1.41 | 4.50 ms | 57 / 100 |

As noise rises, random errors in beat timing add to the successive differences, so RMSSD is pushed upwards. This is the same reason PPG tends to read HRV slightly higher than ECG. At a noise SD of 0.25 the per-beat timing error is about 5 ms. That is close to the theoretical limit for that signal-to-noise ratio at 30 frames per second, so a better peak-timing method can't remove it. The fix is a cleaner signal.

## Signal processing

All in `dsp.js`, each step a separate pure function:

1. **Sampling:** each video frame's central square (half the short side) is drawn to a 24 × 24 canvas and the mean R, G and B are taken. Frame times come from `requestVideoFrameCallback` (`mediaTime`), falling back to `requestAnimationFrame` with repeated frames skipped. Samples are linearly resampled to a uniform 30 Hz.
2. **Finger detection:** red ≥ 40 and red ≥ 1.3 × green and blue. If the finger is missing the app waits and prompts. If it's lifted for more than 0.7 s during recording, the countdown pauses. After a 3 s re-settle a new segment starts, and no interval is ever formed across the gap.
3. **Filtering:** linear detrend, then a 2nd-order Butterworth high-pass (0.7 Hz) and low-pass (3.5 Hz) run forwards and backwards (zero phase, with odd-reflection padding). The signal is inverted because more blood means less light. The live waveform uses the same filter run causally.
4. **Beat detection:** local maxima that are positive and at least 50% of the largest value within ±1 s. Candidates are accepted largest first, with a 330 ms refractory period. Peak times are refined by parabolic interpolation through the three samples around each maximum.
5. **Artefact correction:** intervals outside 300 to 2000 ms, or more than 20% from the median of up to 5 in-range neighbours either side, are removed. RMSSD only uses differences between two adjacent kept intervals. More than 20% removed means the reading is unreliable.
6. **Signal quality index (0 to 100):** 25% pulse amplitude (SD of the pulse as a percentage of the raw level), 45% periodicity (best autocorrelation at 0.33 to 1.5 s lags), 30% interval stability (fraction of intervals kept). Red below 40, amber 40 to 69, green 70 and above. Live, it is recomputed every second on the last 8 s, for both red and green. Whichever channel scores better is shown, because red often saturates with the flash on.
7. **Metrics:** mean RR, HR = 60000 / mean RR, RMSSD, ln RMSSD, SDNN (n − 1), SD1 = √0.5 × SD(ΔRR), SD2 = √(2 SDNN² − SD1²).

A reading is marked unreliable if more than 20% of beats were removed, the quality index is below 40, or there are too few intervals (fewer than 10, or fewer than one per 3 s).

## HRV score mapping (Open Day)

```
HRV score = 100 × (ln RMSSD − 1.0) / (5.0 − 1.0), limited to 0..100
```

| RMSSD | ln RMSSD | Score |
| --- | --- | --- |
| 3 ms | 1.0 | 0 |
| 20 ms | 3.0 | 50 |
| 33 ms | 3.5 | 62 |
| 55 ms | 4.0 | 75 |
| 90 ms | 4.5 | 88 |
| 148 ms or more | 5.0 | 100 |

It is linear in ln RMSSD because ln RMSSD is roughly normally distributed. Most healthy young adults sitting at rest score between about 50 and 90. The mapping is in `hrvScore()` in `dsp.js`. The score is only for engagement. It is not a norm-referenced or clinical scale.

## My Trends

- Each reliable reading (HR, RMSSD, ln RMSSD, quality) is saved to `localStorage` on that phone only. Unreliable readings are not saved. All reads and writes are wrapped in try/catch, so private browsing, where storage may be blocked, still works without saving.
- Today's value is the mean of today's readings. The baseline is the mean of daily values over the 7 calendar days before today, with at least 3 days needed. The smallest worthwhile change (SWC) is 0.5 × the SD of those daily ln RMSSD values.
- Status: higher than, within, or lower than the usual range (mean ± SWC). The wording is neutral. There is no "readiness score".
- History chart: daily ln RMSSD with the rolling usual-range band, plus resting HR. You can delete readings one at a time or all at once.

## Lab mode

Tachogram (removed beats marked with a red cross), Poincaré plot with the SD1/SD2 ellipse, the full metrics table and three CSV downloads:

- `pulselab-beats-*.csv`: `beat, time_s, clock_iso, rr_ms, kept, segment`. `clock_iso` is the phone's clock time for each beat, so it can be lined up against a Polar H10 export for Bland–Altman or Bayesian agreement analysis. Each RR value belongs to the interval that ends at that beat.
- `pulselab-summary-*.csv`: every metric, one per row.
- `pulselab-ppg-*.csv`: the filtered PPG signal at 30 Hz.

The phone and Polar clocks will differ by up to a second or so. Align them by cross-correlating the two RR series, not by trusting the clock times.

## Privacy

There are no accounts, cookies or analytics, and no network requests apart from loading the app itself. Camera frames are reduced to three average colour values and never stored or sent. In Open Day mode nothing is saved at all, which makes it suitable for under-18 visitors. Trends data stays in that browser on that phone.

## Known limitations

- **At rest only.** Any movement of the finger or phone ruins the signal. Use it seated or lying down, with the hand supported.
- **PRV, not ECG HRV.** The camera measures the pulse arriving at the finger. Pulse transit time varies a little from beat to beat, so PPG may read SDNN and RMSSD slightly higher than ECG, especially when HRV is low.
- **Timing precision.** At about 30 frames per second, timing relies on interpolation. With a clean signal, per-beat error is around 1 to 2 ms. With a noisy one it is 5 ms or more, which biases RMSSD upwards (see the table above).
- **Camera auto-exposure and white balance** can't be locked from the web on most phones. The settle period lets them stabilise, but a sudden exposure change mid-recording shows up as an artefact.
- **iOS torch:** Safari doesn't let web pages switch the flash on. Use ambient light, and expect lower signal quality than on Android.
- **Variable frame rates:** some Android phones drop to 15 fps in low light. Resampling handles this, but timing is less precise.
- **Cold hands, pressing too hard, nail varnish and very dark or very bright conditions** all reduce signal quality.
- **Background:** if the app goes into the background, the measurement stops, because browsers pause the camera.
- **Not validated** against ECG on a population. Treat it as a teaching tool, and use the CSV export to run that validation as a practical.
- For education only. Not a medical device.
