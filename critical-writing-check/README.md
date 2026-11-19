# Critical Writing Check (sport and exercise science)

A single-file, browser-only checker that looks for the absence of critical writing, levelled from Level 4 to Level 7, with an optional assessment brief.

## Privacy
Everything runs in the browser. There is no AI, no server and no API calls, and no text is stored or sent anywhere. Text, brief and settings are kept in the browser's localStorage, and "Clear my data" removes them. Opening a .docx loads mammoth.js, and opening a PDF loads pdf.js, both from cdnjs with integrity hashes. The file itself never leaves the device.

## Levels
Each level runs every rule up to and including it.

| Level | Question | Adds |
|---|---|---|
| 4 | Is it supported and explained? | Vague attribution, unsupported claims, evidence not explained, study-by-study description, overclaiming, over-hedging, secondary citing, "valid and reliable" without evidence |
| 5 | Is it applied? | Evidence not applied to athletes, sport or practice; missing population context; unmatched comparison data; tests without reliability evidence or purpose; energy-system certainty; no prioritisation |
| 6 | Is it critical? | Description without evaluation, sources not compared, cause claimed from association, generic limitations, "significant" without size |
| 7 | Is it rigorous? | Methods not evaluated; stricter synthesis thresholds |

If the brief's learning outcomes ask students to evaluate, analyse, appraise or justify, the "description without evaluation" check also runs at Levels 4 and 5. Feedback marks these items "From your brief".

## The brief
Students paste the brief or open a PDF, .docx or .txt file. The tool extracts the word limit (with ±%), the learning outcomes (LO lines), the marking criteria (short lines after a criteria heading) and key terms (repeated words and adjacent word pairs). Every field is shown for the student to correct. The brief drives:
- the word-limit check (full drafts only)
- a reminder of the outcome verbs
- an estimate of criterion coverage, which also counts headings
- a gentle "possibly off the brief" flag for paragraphs of 30 or more words that share no word with the key terms, criteria or outcomes

## Editing
All levels, rules, word lists, thresholds and messages are in the `CONFIG` object at the top of `index.html`. Each rule has a `minLevel`, and each level can override `thresholds`.

## Testing
```bash
/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc tools/run-tests.js -- test-samples/brief-SESH54.txt test-samples/S*.txt
```
This prints the item count per sample at each level. Current results with the SESH54 brief:

| Draft | Items (L4 / L5 / L6 / L7) |
|---|---|
| Strong drafts | 1 / 1 / 1 / 2 to 4 (the 1 is the word count, because the samples are excerpts) |
| Mixed drafts | 2 to 4 / 6 to 7 / 7 / 8 to 9 |
| Weak drafts | 14 to 15 / 23 to 24 / 26 to 29 / 27 to 30 |

## Known limits
- These are pattern matches. Expect false positives and misses.
- Brief extraction depends on layout. PDF tables can come out in an odd order, which is why students check the fields.
- Criterion coverage is a keyword estimate.
