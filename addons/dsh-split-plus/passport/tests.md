# Tests: @local/dsh-split-plus

77 tests in 10 files: test/danger.test.mjs, test/files.test.mjs, test/gate.test.mjs, test/hardening.test.mjs, test/panes.test.mjs, test/sends.test.mjs, test/sets.test.mjs, test/space-6b.test.mjs, test/space-claim.test.mjs, test/watch.test.mjs.

Run with the app's own Node (stand-ins only; never against the real app data):

```
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test --test-timeout=60000 test/*.test.mjs
```

The installer leaves the test folder out of an installed copy: run them from the Plus folder.

Item 4A, final fix round (22 November 2026): `test/panes.test.mjs` adds one test: with spaces on, the page gets each space's modes and start mode from Modes (greyed left out), Plain chat is listed, off gives none; the page reads the window's space and starts Add pane on the space's start mode.

Item 4A, stage 6a (22 November 2026) added test/space-claim.test.mjs (claim-with-space, the refusal sentence, place-recon-space, watcher-claims-chat); the whole suite 62 tests, all passing.

Item 4A, stage 6b, Part C (23 November 2026) added test/space-6b.test.mjs (12 tests: send-new-window-space, continue-beside-window-space, continue-beside-sealed-refused, pickers-space-first, pickers-recon-only-in-recon, pickers-unknown-left-out, spacesOf, restore-all-tagged, chip-space-when-different, restore-set-own-space, space ids from Modes, texts); the whole suite 77 tests, all passing.
