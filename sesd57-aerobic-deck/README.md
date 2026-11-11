# SESD57 · Nutrition for aerobic performance (interactive deck)

Live: https://tommyebright.github.io/sesd57-aerobic-deck/

50 slides built from the original 43-slide Canva deck. Figure slides are kept as images of the originals, three of them with corrected wording laid over the image ("CHO fueling" to "CHO fuelling" on two slides; "Implementaton", "reponse" and "Davidson" on the mouth rinse slide). Text slides were rebuilt as HTML with updated content (learning outcomes, why fat contributes less, ATP yield, CHO fuelling guidelines). Added slides: session plan, the four in-class tasks (pathway card build, fuel use prediction, fuelling calculator, running club leaflet), the ATP table follow-up, a knowledge check and a Harvard reference list.

The original mind map recap (slide 3) was replaced by the Task 1 card build, and the original task slide (slide 43) by the fuller Task 4 brief. The pathway slide now appears first as the Task 1 reveal, then in its original places.

## Presenting

| Key | Action |
| --- | --- |
| → / Space / PgDn | Next (reveals the next step first) |
| ← / PgUp | Back |
| S | Presenter view (notes, timer, next slide) in a second window |
| O | Overview of all slides |
| F | Full screen |
| B or . | Black screen |
| number + Enter | Jump to a slide |
| ? | Help |

Handout with speaker notes: add `?handout` to the address, then use **Print or save as PDF**.

## Files

- `index.html`: every slide, with speaker notes in `<aside class="notes">`
- `presenter.html`: presenter view (syncs with the slides window)
- `fuelling-calculator.html`: Task 3 calculator. The food list is the `PRODUCTS` array at the top of its script.
- `handouts/`: student worksheets for Tasks 1, 2 and 4 (tutor copies are not published here)
- `slides/`: the original Canva slides as images, named by their original slide number
- `assets/deck.js`: navigation, presenter sync and handout mode (from the SESD55 deck)
- `assets/widgets.js`: countdown timer and knowledge check
- `assets/deck.css`: styles

When you change anything in `assets/`, bump the `?v=` number on the asset links in `index.html` so browsers fetch the new version.

## Embedding in Canvas

```html
<div style="position: relative; width: 100%; padding-top: 56.25%; overflow: hidden;">
  <iframe style="position: absolute; inset: 0; width: 100%; height: 100%; border: 0;"
          src="https://tommyebright.github.io/sesd57-aerobic-deck/"
          title="SESD57 Nutrition for aerobic performance slides" loading="lazy" allowfullscreen="allowfullscreen" allow="fullscreen"></iframe>
</div>
```
