# Tests: @local/dsh-shared-settings

15 tests in 1 file: test/shared.test.mjs.

Run with the app's own Node (stand-ins only; never against the real app data):

```
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test --test-timeout=60000 test/*.test.mjs
```

The installer leaves the test folder out of an installed copy: run them from the Plus folder.

### Spaces (item 4A, stage 1, 22 November 2026)

`test/spaces-class.test.mjs` (2 tests): each thread's space (`modes.sessionSpaces`) and the one-time fill flag (`modes.spacesFilled`) stay on each Mac whatever skipFields says; the space ticks per mode (`modes.modeSpaces`) and the per-space settings (`modes.spaceSettings`) are shared like the rest of Modes. Not checked between two Macs.

Item 4A, fix round 2: `test/spaces-class.test.mjs` checks modes.plainCarried, modes.plainFence and modes.plainAdded always stay on each Mac.

Item 4A, final fix round: `test/spaces-class.test.mjs` also checks modes.plainCarriedIn always stays on each Mac.
Item 4A, final fix round: `test/shared.test.mjs` counts up to twenty-three `modes` fields in the README line (twenty-one now).
