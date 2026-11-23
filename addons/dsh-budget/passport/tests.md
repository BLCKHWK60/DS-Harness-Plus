# Tests: @local/dsh-budget

39 tests in 3 files: test/index.test.mjs (14), test/json-store.test.mjs (1), test/meter.test.mjs (24). Stage C (20 November 2026): a continued Mission keeps its whole-run count (five cases in index, one in meter). Stage E (20 November 2026): which limit Mission is told, raiseMission, the Mission stop's hint and old "Long run" stops shown as Mission (four cases in index, three in meter).

Run with the app's own Node (stand-ins only; never against the real app data):

```
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test --test-timeout=60000 test/*.test.mjs
```

The installer leaves the test folder out of an installed copy: run them from the Plus folder.
