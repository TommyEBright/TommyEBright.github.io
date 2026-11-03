# Introduction to Energy Systems (interactive deck)

Live: https://tommyebright.github.io/energy-systems-deck/

48 slides for Level 4 students: energy and ATP, the three energy systems, aerobic metabolism (Krebs cycle and electron transport chain), fat metabolism, and RER. It's a rebuild of the lecturer's Canva deck "Introduction to Energy Systems", with the same running order, tasks and notes and corrected content. Figures are redrawn from the published data (Gastin, 2001; Spencer & Gastin, 2001; Romijn et al., 1993).

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

Handout with speaker notes: add `?handout` to the address, then use **Print or save as PDF**.

## Files

- `index.html`: every slide, with speaker notes in `<aside class="notes">`
- `presenter.html`: presenter view (syncs with the slides window)
- `assets/deck.js`: navigation, presenter sync and handout mode
- `assets/viz-core.js`: shared helpers, timer and quiz
- `assets/w-part1.js`, `w-part2.js`, `w-part3.js`: the interactive widgets
- `assets/deck.css`: styles

When you change anything in `assets/`, bump the `?v=` number on the asset links in `index.html` so browsers fetch the new version.
