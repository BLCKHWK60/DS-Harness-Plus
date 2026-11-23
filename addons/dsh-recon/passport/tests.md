# Tests: @local/dsh-recon

162 tests in 24 files: test/accounts.test.mjs, test/boards.test.mjs, test/clearnet.test.mjs, test/cloud-models.test.mjs, test/connection.test.mjs, test/door.test.mjs, test/export.test.mjs, test/isolation.test.mjs, test/move-route.test.mjs, test/move.test.mjs, test/offer-words.test.mjs, test/onion.test.mjs, test/page.test.mjs, test/recon.test.mjs, test/restore.test.mjs, test/room.test.mjs, test/settings.test.mjs, test/space-guest.test.mjs, test/tabs.test.mjs, test/ultra.test.mjs, test/usenet.test.mjs, test/vpn.test.mjs, test/web.test.mjs, test/websources.test.mjs.

Run with the app's own Node (stand-ins only; never against the real app data):

```
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test --test-timeout=60000 test/*.test.mjs
```

The installer leaves the test folder out of an installed copy: run them from the Plus folder.

`test/offer-words.test.mjs` (2 tests, item 4A fix round): the Offer switch's words from the locale dictionary, English only since stage 7 (no Chinese dictionary), no tab wording. `test/move-route.test.mjs` adds: with spaces the moved thread is claimed through Modes' `startDraft` with the target space (asked again while the thread is not there yet), never set to the tab id; `recon.isRoom` answers for the room and inside it only.

`test/move.test.mjs` (9 tests): Move out of Recon: the preview, what leaves, the files ticked, a refused cloud model, the new thread outside the room (changed in the item 4A fix rounds).

`test/offer-words.test.mjs` adds (item 4A, stage 6a fix): an export door target reads '(Space · Mode name)' in English, never with ids; an unknown space is left out. `test/space-guest.test.mjs`: each door target carries its mode's name from the Modes list.

`test/offer-words.test.mjs` and `test/space-guest.test.mjs` add (item 4A, stage 6a fix, door-names-from-modes): door targets and tabs carry `names` in English from Modes (`modeName`, `list`, `spaces.names`; English only since stage 7, a `zh` half is never used); the page falls back to Recon's own space names and the Modes list's mode name with an older or failing Modes, never showing an id.
