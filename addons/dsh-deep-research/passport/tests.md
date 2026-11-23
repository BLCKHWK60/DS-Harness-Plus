# Tests: @local/dsh-deep-research

67 tests in 11 files: test/budget.test.mjs, test/client.test.mjs, test/grades.test.mjs, test/parse.test.mjs, test/ready.test.mjs, test/report.test.mjs, test/rounds.test.mjs, test/sources.test.mjs, test/space.test.mjs, test/ultra.test.mjs, test/websources.test.mjs.

Run with the app's own Node (stand-ins only; never against the real app data):

```
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test --test-timeout=60000 test/*.test.mjs
```

The installer leaves the test folder out of an installed copy: run them from the Plus folder.
