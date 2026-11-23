# Tests: @local/dsh-search

19 tests in 2 files: test/search.test.mjs, test/space-groups.test.mjs.

Run with the app's own Node (stand-ins only; never against the real app data):

```
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test --test-timeout=60000 test/*.test.mjs
```

The installer leaves the test folder out of an installed copy: run them from the Plus folder.

Item 4A, stage 6a (22 November 2026) added hidden-by-space and hidden-by-room-folder (lib and route) to test/search.test.mjs; the whole suite 10 tests, all passing.

Item 4A, stage 6b, Part C (23 November 2026) added test/space-groups.test.mjs (9 tests: groups-by-space, mode-tag, recon-never-heading, space-read-throws-hidden, plain-under-chat, hidden-space-listed, old-modes-tab-groups, more-line, hitids-not-rendered); the whole suite 19 tests, all passing.
