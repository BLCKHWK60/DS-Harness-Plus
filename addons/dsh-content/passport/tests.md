# Tests: @local/dsh-content

49 tests in 3 files: test/content.test.mjs, test/library.test.mjs, test/piece.test.mjs.

Run with the app's own Node (stand-ins only; never against the real app data):

```
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test --test-timeout=60000 test/*.test.mjs
```

The installer leaves the test folder out of an installed copy: run them from the Plus folder.

`test/offer-words.test.mjs` (2 tests, item 4A fix round): the 'Offer the … mode' switch, its group, description and notes come from the locale dictionary, in English only (decision 28: no Chinese dictionary); the Settings nav name; no note or description speaks of a tab or of 'Preset in this tab'.
