# Tests: @local/dsh-research

24 tests in 7 files: test/apply.test.mjs, test/engine-off.test.mjs, test/offer-words.test.mjs, test/packet.test.mjs, test/research.test.mjs, test/sealed-save.test.mjs, test/websources.test.mjs.

Run with the app's own Node (stand-ins only; never against the real app data):

```
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test --test-timeout=60000 test/*.test.mjs
```

The installer leaves the test folder out of an installed copy: run them from the Plus folder.

`test/offer-words.test.mjs` (2 tests, item 4A fix round): the 'Offer the … mode' switch, its group, description and notes come from the locale dictionary (English only since stage 7, decision 28); the Settings nav name; no note or description speaks of a tab or of 'Preset in this tab'. Not checked on screen in Chinese.

`test/research.test.mjs` changed (item 4A round 2): the page description now starts "A mode, in the Mode list under the chat box (Chat and Code)".
