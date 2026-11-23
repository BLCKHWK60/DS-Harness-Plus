# Tests: @local/dsh-creator-plus

55 tests in 3 files: test/client.test.mjs, test/parts.test.mjs, test/plugin.test.mjs.

Run with the app's own Node (stand-ins only; never against the real app data):

```
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test --test-timeout=60000 test/*.test.mjs
```

The installer leaves the test folder out of an installed copy: run them from the Plus folder.

`test/offer-words.test.mjs` (2 tests, item 4A fix round): the 'Offer the … mode' switch, its group, description and notes come from the locale dictionary, in English only (decision 28: no Chinese dictionary); the Settings nav name; no note or description speaks of a tab or of 'Preset in this tab'.

`test/space-guests.test.mjs` (4 tests, item 4A stage 6a): a guest in the Workshop space is guarded (builds folder only, no commands, no creator_ tools), gets the note, Mission rules and the bar; the unknown guard; older Modes and no Modes; `guestsGuarded` and `allowed()`.

### Stage 6b, Part D: new mode add-ons keep the start mode (item 4A, 23 November 2026)

`test/start-mode-6b.test.mjs` (2 tests, D14): a mode add-on made from the template keeps its guarded `defaultMode` reset, says why, writes no spaceSettings and still loads; the mode recipe says "Do not write spaceSettings: Modes keeps the space's start mode."
