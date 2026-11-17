# Tests: @local/dsh-finance

64 tests in 7 files: test/adviser.test.mjs, test/apply.test.mjs, test/chat.test.mjs, test/data.test.mjs, test/finance.test.mjs, test/market.test.mjs, test/sources.test.mjs.

Run with the app's own Node (stand-ins only; never against the real app data):

```
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test --test-timeout=60000 test/*.test.mjs
```

The installer leaves the test folder out of an installed copy: run them from the Plus folder.
