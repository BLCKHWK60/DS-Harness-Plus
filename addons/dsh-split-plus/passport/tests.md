# Tests: @local/dsh-split-plus

56 tests in 8 files: test/danger.test.mjs, test/files.test.mjs, test/gate.test.mjs, test/hardening.test.mjs, test/panes.test.mjs, test/sends.test.mjs, test/sets.test.mjs, test/watch.test.mjs.

Run with the app's own Node (stand-ins only; never against the real app data):

```
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test --test-timeout=60000 test/*.test.mjs
```

The installer leaves the test folder out of an installed copy: run them from the Plus folder.
