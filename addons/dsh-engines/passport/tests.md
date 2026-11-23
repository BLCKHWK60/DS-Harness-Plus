# Tests: @local/dsh-engines

31 tests in 6 files: test/apply.test.mjs, test/engines.test.mjs, test/space-6a.test.mjs, test/space-6b.test.mjs, test/compare-claim.test.mjs, test/compare-page-6b.test.mjs.

Run with the app's own Node (stand-ins only; never against the real app data):

```
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test --test-timeout=60000 test/*.test.mjs
```

The installer leaves the test folder out of an installed copy: run them from the Plus folder.

### Stage 6a and 6b: engines and spaces (item 4A, 22-23 November 2026)

`test/space-6a.test.mjs` (3 tests): Recon, Devices and Workshop guests get GUARDED_ENGINE_TEXT; fail closed when Modes throws or gives no guard; home modes get the soft "Code space" sentence (6b words).
`test/space-6b.test.mjs` (12 tests, J1, J2, C1, C5, L9): any mode in the Code space reaches the engine; Code mode in Chat refused naming the space; Modes older than apiVersion 2, without guardOf, or absent refused (no fallback to the mode); an unreadable space refused; an owner's no-programs mode refused naming the mode; home modes soft; Recon, sealed and guests keep the 6a sentence; a pending Devices draft refused; the order of the checks; `/engine apply` refused in a sealed thread and when Modes cannot say; English sentences also on a Chinese page (owner decision 28).
`test/compare-claim.test.mjs` (4 tests, J4): the route's `claim` calls `set(id, 'code', {claim, space: 'code'})`; an older Modes without `space`; Modes' refusal passes through as the error, no Modes and bad ids refused; no settings write.

### Stage 6b, Part D: the Compare page (item 4A, 23 November 2026)

`test/compare-page-6b.test.mjs` (4 tests, J4, 7.1): the page's own functions cut out of client.js: the dsh side is made, claimed, then attached and sent, in that order; no settings write, and the page no longer names `defaultMode` or writes Modes' settings; a refused claim stops with CMP_CLAIM_FAILED (the reason, then "Nothing was sent. …"), nothing attached or sent; the Code-space words, English also on a Chinese page.
