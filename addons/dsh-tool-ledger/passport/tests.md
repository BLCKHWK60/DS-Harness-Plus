# Tests: @local/dsh-tool-ledger

Suites: test/ledger.test.mjs, test/families.test.mjs, test/app.test.mjs.

Run with the app's own Node (stand-ins only; never against the real app data):

```
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test --test-timeout=60000 test/*.test.mjs
```

The installer leaves the test folder out of an installed copy: run them from the Plus folder.

Item 4A, fix round 2: `test/ledger.test.mjs` checks a line keeps `space` next to `tab` (call and loaded lines), the CSV column after `tab`, and that an old line without it stays valid (empty cell, summaries read both); `test/app.test.mjs` checks a recorded call carries the thread's space from Modes.
