# Tests: @local/dsh-scout

35 tests in 5 files: test/index.test.mjs, test/offer-words.test.mjs, test/scout.test.mjs, test/space.test.mjs, test/step3.test.mjs.

Run with the app's own Node (stand-ins only; never against the real app data):

```
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test --test-timeout=60000 test/*.test.mjs
```

The installer leaves the test folder out of an installed copy: run them from the Plus folder.

`test/offer-words.test.mjs` (2 tests, item 4A fix round): the 'Offer the … mode' switch, its group, description and notes come from the locale dictionary, in English only (decision 28: no Chinese dictionary); the Settings nav name; no note or description speaks of a tab or of 'Preset in this tab'.
