# Tests: @local/dsh-automations

103 tests in 8 files: test/alerts.test.mjs, test/create.test.mjs, test/notes.test.mjs, test/plugin.test.mjs, test/preset.test.mjs, test/recur.test.mjs, test/runs.test.mjs, test/when.test.mjs.

Run with the app's own Node (stand-ins only; never against the real app data):

```
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test --test-timeout=60000 test/*.test.mjs
```

The installer leaves the test folder out of an installed copy: run them from the Plus folder.

### Ask about automations (item 4A, stage 3b, 22 November 2026)

`test/ask-button.test.mjs` (5 tests): the button sends dsh-cowork-shell:start for Chat, Automations mode, and shows a refusal as a note with Details; its (i), in English also when the app reports Chinese; with the mode switched off it says where to switch it on and sends nothing; no button without spaces, and a sidebar that does not take it is said in words; the page's tiles include Need you and the page never writes the "tab" setting. Checked in the lab (port 3396): the thread opened in Chat in the Automations mode and kept it after its first message.

`test/offer-row.test.mjs` (3 tests, item 4A fix round): Settings → Alerts shows 'Offer the Automations mode' with spaces (same field), the tab row without; the Ask button's off note names it (one English note); the filter names modes and says 'All modes' under spaces.

`test/offer-row.test.mjs` adds (item 4A round 2, 1 test): Settings → Alerts' "New threads use the automation's mode" (same setting `runsInTheirTab`), English also for a Chinese page, and the Runs in link finds the renamed row.

Item 4A, stage 6a (22 November 2026) added to test/plugin.test.mjs: created-in-recon-guest-sealed, clock-hidden-guarded and the Chinese sentence; the clock-button source check follows the new rule; the whole suite 115 tests, all passing.
