# Tests: @local/dsh-modes

126 tests in 8 files: test/claim.test.mjs, test/isolation.test.mjs, test/lens.test.mjs, test/long.test.mjs, test/modes.test.mjs, test/skilloff.test.mjs, test/start.test.mjs, test/weblevel.test.mjs.

Run with the app's own Node (stand-ins only; never against the real app data):

```
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test --test-timeout=60000 test/*.test.mjs
```

The installer leaves the test folder out of an installed copy: run them from the Plus folder.
