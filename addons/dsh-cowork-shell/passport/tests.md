# Tests: @local/dsh-cowork-shell

136 tests in 9 files: test/generate.test.mjs, test/presets.test.mjs, test/projects.test.mjs, test/scratch.test.mjs, test/shared-trash.test.mjs, test/skill-marks.test.mjs, test/start-home.test.mjs, test/trash-route.test.mjs, test/trash.test.mjs.

Run with the app's own Node (stand-ins only; never against the real app data):

```
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test --test-timeout=60000 test/*.test.mjs
```

The installer leaves the test folder out of an installed copy: run them from the Plus folder.

### Preset in this tab (item 7, 21 November 2026)

`test/preset-lock.test.mjs` (6 tests): which tab names which preset (Creator is cordis; your own locked mode; Any none), a missing or unknown preset is not passed, the start carries { agentPreset } with its other options and one answer is kept, a slow or missing Modes route never holds a start, every start goes through the lock (only three direct calls of the app's start remain), and Move to out of Recon creates the conversation in the locked preset. Not checked in the running app.


### Chat list with Scratch chats (item 4A, stage 0, 22 November 2026)

`test/chat-list.test.mjs` (4 tests): Scratch chats are in the Chat list, sorted with the others (pinned first, then newest); a Chat tab with only Scratch chats lists all of them; with nothing in Scratch the list is as before; the Chat tab builds its flat list with the Scratch rows. Checked in the lab too (a new Scratch chat shows at the top as "now").

### Space buttons and lists by space (item 4A, stage 3a, 22 November 2026)

`test/space-buttons.test.mjs` (11 tests): the page's copies of Modes' maps match lib/spaces.js (spaces, mode -> space, each space's own tab, tab order, last open, trash); a thread is listed under its recorded space, never its mode, a new one in the window's space, an old one by its folder; Trash per space read through the stored tab and fallback (an untold row shows everywhere; Empty trash erases this space's rows only); the buttons (shown spaces, Chat always, your order else the tabs' order); Workshop without Creator Plus; each window keeps its own space and the old stored tab is not rewritten; each space's last thread over the old per-tab memory (not rewritten); a start reads the space's own tab; data-cws-space and data-cws-tab; select() writes nothing to Modes; Move to another space through Modes (never into Recon, no "Promote to"); the New button's words and every new word in English and Chinese. `test/start-home.test.mjs` and `test/tab-memory.test.mjs` read the new forms (Reset order of either order, Cmd-N with spaces, the space recorded after the first message). Checked in the lab (port 3395): the five buttons, Recon red and Devices violet, a thread moved from Chat to Code, the (i).

### Rows and the Chat list (item 4A, stage 3b, 22 November 2026)

`test/space-rows.test.mjs` (13 tests): the page's copy of the space layout is index.js DEFAULT_SPACES; every space shows Projects, Artifacts, Automations and Plugins first (a fixed row whose add-on is off is left out); rows per space (Model Arena in Chat and Workshop, Connectors and Skills in Chat and Code, Bench Lab in Workshop only); Workshop's Tuner Plus and Benchmark rows only while their Settings pages exist; Split, Compare and other plugins' rows in every space, never the app's task editor; a saved layout changes only what it names; Chat's Chats first, then Projects with the default workspace (Recon's room is no project, Chat-mode threads of the default workspace stay with the Chats); the grey mode tag; waiting for a new thread after a start; the Projects row, All projects and Settings rows; "Ask about automations" through the start event, never the Automations "tab" setting; every new text in English and Chinese. Checked in the lab (port 3396).

`test/cowork-switch.test.mjs` (8 tests, item 4A stage 4): the switch on a new Chat thread (off standalone, on in a project; none without a known standalone place); the read-only label ("Standalone" or the project's name); only in Chat with spaces (the old switch and chip stay elsewhere); start places per space; the seat after the Mode list, the (i) texts and the error note; what a switch does (default workspace, Scratch, mode and text carried, the folder picker); every new text in English and Chinese; deleting a standalone thread takes its folder to the trash. `test/space-rows.test.mjs` adds Plain chat to the mode tag test.

`test/fix-round.test.mjs` (7 tests, item 4A fix round): New claims the thread it opens with `reset` for the right space (run on stand-ins), on every start path, and Ask about automations picks only after it; the open blank draft is claimed again when the window's space changes, after a short wait; coming back to a space reopens its blank draft whatever its mode; at start a started thread of another shown space switches the window once; the thread menu stays on screen; a project's Move to says space; the Projects (i). Updated: `cowork-switch` (the trash wording, the Chats (i)), `preset-lock` and `tab-memory` (Move out of Recon made inside its project), `space-buttons` (Move to errors with Details), `space-rows` (no tag for Chat and Cowork threads in Chat).

`test/space-rows.test.mjs` also checks (fix round 2) the `dsh-cowork-shell:show-space` event: only while spaces are live, only a known space, cancelled when taken, selects the space without opening a thread.

`test/round2-ui.test.mjs` (7 tests, item 4A round 2, UI and text): the start page's chips follow the mode picked for the new thread (Finance's in Chat, Data's in Code, an add-on mode's own; Plain chat has its own six, also before Modes names the mode; without spaces the tab's chips as before; the page code and the setting default hold the same list); built-in chips read in Chinese, a chip you changed stays; a row's ⋯ menu is drawn in the page body, flips up near the bottom and stays inside the window (`menuPlace`); a done move is a normal note (`cws-notice`), not the error red, and says thread in both languages; Recon's first message keeps its paragraphs (a paste first, else line by line; never put in twice); the Cowork switch's name goes last (step 5); the sidebar's English words say thread. Changed: `test/tab-memory.test.mjs` (move.recon says thread).

Item 4A, final fix round (22 November 2026): `test/trash.test.mjs` adds two tests (Put back knows whether Delete archived the thread itself, also for one that waited; the route and the page carry the mark); `test/space-rows.test.mjs` checks the Chinese row tag; `test/start-home.test.mjs`, `test/cowork-switch.test.mjs` follow the new Delete call and trash record.

Item 4A, stage 6a (22 November 2026) added test/space-6a.test.mjs (list-isolated-unrecorded, list-devices-pending, the pending-spaces route, start-preset-space-lock, startdraft-kept-opens-fresh (two), send-waits-start (two)) and updated test/fix-round.test.mjs, test/preset-lock.test.mjs and test/space-buttons.test.mjs; the whole suite 243 tests, all passing.

Item 4A, stage 7 (23 November 2026, English only): new `test/english-only.test.mjs` (3 tests: no zh locale file, no Chinese word list, chips, mode names or language check, the only Chinese left outside the shared dsh-ui copy is the Send button match; the date title is English for a Chinese app; Modes is asked in English). Tests that counted an English and a Chinese line now count one English line; Chinese assertions were dropped or turned into English ones (`modeTagOf` with the old Chinese flag still gives the English name); the error and model-note texts say thread.
