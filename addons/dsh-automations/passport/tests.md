# Tests: @local/dsh-automations

52 tests in 5 files: test/alerts.test.mjs, test/notes.test.mjs, test/plugin.test.mjs, test/recur.test.mjs, test/runs.test.mjs.

Run with the app's own Node (stand-ins only; never against the real app data):

```
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test --test-timeout=60000 test/*.test.mjs
```

The installer leaves the test folder out of an installed copy: run them from the Plus folder.
