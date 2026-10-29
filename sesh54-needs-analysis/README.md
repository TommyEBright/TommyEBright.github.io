# Needs Analysis Studio (SESH54)

A single-file web app that supports the SESH54 Exercise Physiology needs analysis assessment (35%, 1750 words ±10%). It has three tabs.

1. **Needs analysis planner.** A guided builder that follows the five marking criteria, with applicability checks, test-to-demand links, a timeline for re-tests, a coverage view, and export to copy, .txt or .docx.
2. **Critical writing check.** Students paste a draft or upload a .docx or .txt file. Transparent rules highlight sentences and group feedback by category, with word count, structure, criterion coverage, a paragraph heat map and three priority actions. There is no mark.
3. **Spot the weakness.** Ten short paragraphs across the three scenarios for self-assessed practice.

## Privacy statement

Everything runs in the student's browser. There is no AI model, no server and no API calls, and no student text is stored or transmitted. Planner notes, drafts and practice answers are saved only in the browser's localStorage on that device, and the "Clear my data" button removes them. If localStorage is blocked, the app still works but does not remember anything.

The only network request is optional. When a student uploads a .docx file, the app downloads mammoth.js (v1.6.0) from cdnjs, pinned with a Subresource Integrity hash, to read the file locally. The file itself never leaves the device.

## Use locally

Open `index.html` in any modern browser. No build step or server is needed.

## Deploy on GitHub Pages

The app is designed to live in the `sesh54-needs-analysis/` folder of the `TommyEBright.github.io` repository.

```bash
rsync -a --delete --exclude tools/ ~/Desktop/Luna/sesh54-needs-analysis/ ~/Documents/GitHub/TommyEBright.github.io/sesh54-needs-analysis/
cd ~/Documents/GitHub/TommyEBright.github.io && git add sesh54-needs-analysis && git commit -m "Add SESH54 Needs Analysis Studio" && git push
```

It is live at `https://tommyebright.github.io/sesh54-needs-analysis/` about a minute after the push.

## Embed in Canvas

Use an iframe in the Canvas Rich Content Editor (HTML view):

```html
<iframe src="https://tommyebright.github.io/sesh54-needs-analysis/" title="Needs Analysis Studio, SESH54 planner and writing check" width="100%" height="1100" style="width: 100%; min-height: 1100px; border: 2px solid #abd6d9; border-radius: 0.75rem;" allow="clipboard-write" loading="lazy"></iframe>
```

- Canvas admins can restrict which domains may be embedded. If the iframe appears blank, ask your Canvas or learning technology team to allow `tommyebright.github.io` for iframes.
- Some browsers block storage in third-party iframes. The app copes, but students lose saved progress between visits, so the Canvas page also links to the app in a new tab. Inside an iframe the app shows its own "Open in a new tab" button.
- Downloads (.txt, .docx) and copying may be blocked inside an iframe on some browsers. The new-tab route always works.

## Edit the rules (CONFIG)

Everything editable is in the `CONFIG` object at the top of the first `<script>` block in `index.html`, between `CONFIG START` and `CONFIG END`.

| Key | What it controls |
|---|---|
| `wordLimit`, `wordBudget` | Word range and the suggested planning budget |
| `criteria`, `sections`, `structureRequired` | Marking criteria and how sections are detected (heading and body keywords) |
| `thresholds` | Heading length, demand-to-test ratio, hedge density, synthesis marker rate, citation chain length, test evidence window, heat map bands |
| `citationPattern`, `numberPattern` | What counts as a citation (author-date, `[REF: ...]`, numeric) and a number (including `[X]` placeholders) |
| `categories` | Feedback category labels and order |
| `lists` | Shared word lists (synthesis markers, reasoning markers, evidence statistics, priority words, qualities, generic test names) |
| `rules` | Each rule's type, category, criterion, severity, word lists and three messages (`detected`, `why`, `ask`). Set `enabled: false` to switch a rule off. Scenario rules have `scenarios: ["S2"]` etc. |
| `spot` | The Spot the weakness paragraphs, answers and explanations |
| `scenarios` | Brief facts, athlete descriptors, timeline and events, traps, constraint prompts, and scenario word lists |
| `planner` | Step titles and "so what" prompts |

Term syntax: a plain word matches whole words, case-insensitive. A trailing `*` matches a stem (`reliab*`). A term written as `/pattern/` is a regular expression.

The detection logic sits between `ENGINE START` and `ENGINE END`. It has no DOM access, so it can be tested on its own.

## Test the rules

`test-samples/` holds weak, mixed and strong drafts for S2 and S3, plus weak and strong drafts for S1. All references are `[REF: ...]` placeholders.

```bash
node tools/run-samples.js --verbose
```

On a Mac without Node, the built-in JavaScriptCore runtime works:

```bash
/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc tools/run-samples.js -- --verbose test-samples/*.txt
```

Current results: the strong samples produce only the word-count note (they are short excerpts). The weak samples produce 20 to 33 items across most categories. On the Spot the weakness paragraphs, the engine detects 24 of 25 weak sentences, 22 in the intended category.

`tools/iframe-test.html` places the app in a Canvas-width iframe. Serve the folder over HTTP to use it.

## Known limits of the heuristics

The checks are pattern matches, not understanding. Expect false positives and misses. In particular:

- Section and criterion estimates depend on headings and keywords. Clear headings make them far more accurate.
- "Unsupported claim" and "Missing population context" only run in demand and test sections, and can miss claims phrased without the trigger words.
- "Missing reasoning" accepts any athlete reference or reasoning marker in the paragraph, so a token "for this athlete" will satisfy it.
- Negation handling is simple (a few words before the match).
- Citation detection recognises author-date, numeric and `[REF: ...]` styles only.
- The tool cannot judge whether a source is primary, peer-reviewed or accurately reported.
