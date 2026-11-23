# Tests: @local/dsh-sync

42 tests in 1 file: test/sync.test.mjs.

Run with the app's own Node (stand-ins only; never against the real app data):

```
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test --test-timeout=60000 test/*.test.mjs
```

The installer leaves the test folder out of an installed copy: run them from the Plus folder.

Item 4A, stage 6a (22 November 2026) added sync-skip-by-space and hidden-by-room-folder to test/sync.test.mjs; the whole suite 48 tests, all passing.
