# Tests: @local/dsh-data

42 tests in 3 files: test/data.test.mjs, test/offer-words.test.mjs, test/space.test.mjs.

Run with the app's own Node (stand-ins only; never against the real app data):

```
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test --test-timeout=60000 test/*.test.mjs
```

The installer leaves the test folder out of an installed copy: run them from the Plus folder.

`test/offer-words.test.mjs` (2 tests, item 4A fix round): the 'Offer the … mode' switch, its group, description and notes come from the locale dictionary, English only (stage 7); the Settings nav name; no note or description speaks of a tab or of 'Preset in this tab'.

`test/space.test.mjs` adds (item 4A, stage 6a fix): a sealed `data_query` and `data_chart` leave queries.json byte-identical while the Q id still resolves in the thread; End and wipe (`reconWipe` list at start and each change) forgets a conversation's queries in memory and on disk.

`test/space.test.mjs` adds (item 4A, stage 6a fix, data-python-room-only): a sealed `data_python` gets `OUT_DIR` in its run folder (`run-<id>/data-output`), never the room root; no run folder or a failing Recon refuses with the "Not saved" sentence without starting the program; a thread that is not sealed writes to data-output as before.
