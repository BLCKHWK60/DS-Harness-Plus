# Tests: @local/dsh-settings-plus

16 tests in 3 files: test/settings-plus.test.mjs, test/export.test.mjs, and test/uniform-row.test.mjs (18 November 2026: every button in the chat box row is the same in every mode, a status sign, or lives in the gear; the parts that differ per conversation are measured at one width; Depth and Run stay greyed instead of disappearing).

Run with the app's own Node (stand-ins only; never against the real app data):

```
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test --test-timeout=60000 test/*.test.mjs
```

The installer leaves the test folder out of an installed copy: run them from the Plus folder.

`test/settings-plus.test.mjs` adds (item 4A fix round): Plain chat known to the gear by id and name; the gear asks the Mode route first; a Plain chat thread opens Settings → Modes; the search entries for the Automations switch and the space map (Chinese keywords).

Item 4A, fix round 2: the index-complete test covers the new entries modes.plainFence (Keep Plain chat inside its folder) and modes.plainCarried (internal).

`test/round2-nav.test.mjs` (3 tests, item 4A round 2): a Workshop group (Creator Plus, Tuner Plus, Benchmark) right after Spaces and modes; every group heading and Settings Plus's own page names are English, also when the app reports Chinese (since stage 7); the settings search's "Offer the … mode" switches describe the mode, with Chinese words, and the old "… tab" names are still found; "New threads use the automation's mode".
`test/simple-more.test.mjs` (25 tests): the left list's headings, every page once with its add-on's tier; the Simple list and its rules; the first-run card; the More settings rows; search jumps to More settings (round 2: the headings now include Workshop).

Item 4A, final fix round (22 November 2026): `test/final-round.test.mjs` (2 tests): search headings match the Modes page; modes.plainCarriedIn is listed as internal.

### Stage 6b, Part D: the gear's mode fallback (item 4A, 23 November 2026)

`test/mode-fallback-6b.test.mjs` (3 tests, J21): with spaces live (route `live`, or `sessionSpaces` in Modes' settings) a thread without a stored mode shows the space's start mode, else Plain chat, never `defaultMode` (here "recon"); a stored mode first; without spaces, as before; the gear asks the Mode route first, hands it `live` and `current`, sends the page's language, and never reads `defaultMode` itself.

Item 4A, stage 7 (23 November 2026, English only): `test/round2-nav.test.mjs` now checks that the group headings and Settings Plus's own page names stay English even when the app's locale service answers in Chinese, and keeps the check that the search index has Chinese keywords (input matching); the export, Start here and permission card tests read the new words.
