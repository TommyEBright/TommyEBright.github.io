# CASES School Poster Competition 2026-27 slides

HTML version of the CASES hub slide template, updated for the Plymouth Marjon University poster day. Live at https://tommyebright.github.io/cases-poster-deck/ once pushed.

- `index.html` holds all 12 slides. Each slide is a `<section class="slide">` with speaker notes in `<aside class="notes">`.
- `assets/deck.css` is the CASES theme on top of the deck engine copied from `sesd57-aerobic-deck`.
- `presenter.html` is the presenter view (press S on the slides).
- `img/` holds the images taken from the original PowerPoint.

To add a presenter name, edit the `t-host` line on slide 1. To change the poster topic ideas, edit slide 9.

Embed in Canvas with a 16:9 wrapper:

```html
<div style="position: relative; width: 100%; height: 0px; padding-top: 56.25%; overflow: hidden;"><iframe style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" src="https://tommyebright.github.io/cases-poster-deck/" title="CASES School Poster Competition 2026-27 slides" loading="lazy" allowfullscreen="allowfullscreen" allow="fullscreen"></iframe></div>
```
