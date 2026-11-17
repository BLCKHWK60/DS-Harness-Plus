# Tests: @local/dsh-cowork-shell

133 tests in 8 files: test/generate.test.mjs, test/presets.test.mjs, test/projects.test.mjs, test/scratch.test.mjs, test/shared-trash.test.mjs, test/start-home.test.mjs, test/trash-route.test.mjs, test/trash.test.mjs.

Run with the app's own Node (stand-ins only; never against the real app data):

```
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test --test-timeout=60000 test/*.test.mjs
```

The installer leaves the test folder out of an installed copy: run them from the Plus folder.
