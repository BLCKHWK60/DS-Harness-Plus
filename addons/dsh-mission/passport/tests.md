# Tests: @local/dsh-mission

95 tests in 5 files: test/awake.test.mjs, test/gate.test.mjs, test/long.test.mjs, test/loop.test.mjs, test/mission.test.mjs.

Run with the app's own Node (stand-ins only; never against the real app data):

```
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test --test-timeout=60000 test/*.test.mjs
```

The installer leaves the test folder out of an installed copy: run them from the Plus folder.
