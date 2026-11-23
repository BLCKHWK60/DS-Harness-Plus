# Tests: @local/dsh-bench

85 tests in 5 files: test/bench.test.mjs, test/devices.test.mjs, test/network.test.mjs, test/phone.test.mjs, test/tools-devices.test.mjs.

Run with the app's own Node (stand-ins only; never against the real app data):

```
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test --test-timeout=60000 test/*.test.mjs
```

The installer leaves the test folder out of an installed copy: run them from the Plus folder.

`test/offer-words.test.mjs` (2 tests, item 4A fix round): the 'Offer the … mode' switch, its group, description and notes come from the locale dictionary, in English only since stage 7 (no Chinese dictionary, the page sends no language); the Settings nav name; no note or description speaks of a tab or of 'Preset in this tab'.

`test/space-guests.test.mjs` (13 tests, item 4A stage 6a): guests in the Devices space: refused commands, programs, jobs, connectors, Mac apps, Office, schedules and unsorted tools; device tools offered; writes only in the thread's own folder; wide folders; paths at any key; helpers write in their thread's folder; the unknown guard; older Modes, no Modes, a throwing Modes; Mission rules, note and chat box route; since stage 7 each sentence is English only, and a Chinese page or caller still gets English.
