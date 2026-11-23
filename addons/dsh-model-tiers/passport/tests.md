# Tests: @local/dsh-model-tiers

49 tests in 2 files: test/tiers.test.mjs (31) and test/ptc.test.mjs (18, the three helper tools called from inside a program under PTC).

Run with the app's own Node (stand-ins only; never against the real app data):

```
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test --test-timeout=60000 test/*.test.mjs
```

The installer leaves the test folder out of an installed copy: run them from the Plus folder.
