# SESD55 · Quantitative data analysis (interactive deck)

Live: https://tommyebright.github.io/sesd55-quant-deck/

58 slides: 35 of the 36 original slides kept in order (as images, with seven wording corrections laid over them; original slide 34 was replaced at the lecturer's request), plus 23 added slides for the descriptive statistics block, knowledge checks and interactives.

## Presenting

| Key | Action |
| --- | --- |
| → / Space / PgDn | Next (reveals the next step first) |
| ← / PgUp | Back |
| S | Presenter view (notes, timer, next slide) in a second window |
| O | Overview of all slides |
| F or F5 | Full screen |
| B or . | Black screen |
| number + Enter | Jump to a slide |
| ? | Help |

Handout with speaker notes: add `?handout` to the address, then use **Print or save as PDF**.

## Files

- `index.html`: every slide, with speaker notes in `<aside class="notes">`
- `presenter.html`: presenter view (syncs with the slides window)
- `slides/`: the original slides as images
- `assets/deck.js`: navigation, presenter sync and handout mode
- `assets/viz.js`: interactive widgets
- `assets/data.js`: hypothetical teaching data used by the widgets
- `assets/deck.css`: styles

When you change anything in `assets/`, bump the `?v=` number on the four asset links in `index.html` so browsers fetch the new version.
