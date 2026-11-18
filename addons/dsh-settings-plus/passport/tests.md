# Tests: @local/dsh-settings-plus

16 tests in 3 files: test/settings-plus.test.mjs, test/export.test.mjs, and test/uniform-row.test.mjs (18 November 2026: every button in the chat box row is the same in every mode, a status sign, or lives in the gear; the parts that differ per conversation are measured at one width; Depth and Run stay greyed instead of disappearing).

Run with the app's own Node (stand-ins only; never against the real app data):

```
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test --test-timeout=60000 test/*.test.mjs
```

The installer leaves the test folder out of an installed copy: run them from the Plus folder.
