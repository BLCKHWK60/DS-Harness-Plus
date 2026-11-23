# Tool ledger

Host and page add-on `@local/dsh-tool-ledger` (dsh 0.2.2-rc.2). Settings page **Tool use**. Tier **Core** (on when installed): it only writes names and counts, and the owner wants the record complete from the first day of the test period (REVIEW-REQUIREMENTS-1 section 1.6), which an add-on that starts switched off would not give.

It writes one line per tool event, in every thread, mode (Recon too, by the owner's choice) and helper, in Mission runs, and for the calls made inside programs (the PTC preset's `run_code`). It never stores what a tool was given or what it gave back.

## What a line holds

Monthly files `$DSH_HOME/tool-ledger/YYYY-MM.jsonl` (local month), one JSON object per line.

**`kind: "call"`**, one per tool call:

| Field | What |
| --- | --- |
| `t` | time (ISO) |
| `sid`, `parent` | the thread (or helper) and, for a helper, its thread |
| `ws` | the project (workspace id) whose folder holds the thread's folder |
| `tab` | the thread's mode id (Modes' `modes.get`; the name is from before spaces) |
| `space` | the thread's space next to its mode (item 4A: `chat`, `code`, `devices`, `recon`, `workshop`; Modes' `modes.spaces.of`, a helper reports its thread's). Lines written before spaces have none and stay valid |
| `preset` | the app's preset (Standard, PTC, Minimal, Creator, or your own), from `agentPresets.presetForSession` |
| `mission` | `{runId, role}` for a Mission helper (`plan`, `implement`, `review`, `senior`, `questions`, `check`) or `role: "conductor"` for the run's own thread, from dsh-mission's `helperOf` / `runOf` (optional) |
| `tool`, `family` | the tool, and its family the way Modes loads tools as needed (`core`, `pdf`, `data`, …, or `other`) |
| `state` | the tool's setting in that mode at that moment: `on`, `ask`, `off`, `locked`; `unknown` while Tool access is off |
| `loaded` | true when the tool was on offer from the start of the thread, false when it came in later (from the reserve) |
| `via` | `direct`, `tools_find` (fetched with the finder), `access-request` (a request to you), `program` (called inside a program) |
| `outcome` | `ran`, `error`, `refused`, `allowed` (after you said yes), `denied` (you said no), `parked` (nobody answered), `asked` |
| `rule`, `by` | which rule refused it and which add-on, when known (`unknown` otherwise) |
| `ms`, `size` | how long the tool ran, and how many characters of text came back |

**`kind: "loaded"`**: the tools on offer in a thread changed. `full` the first time per thread, then `added` and `removed`. Same place fields.

Lines of a thread you delete for good (the Cowork trash) lose `sid`, `parent` and `ws`; a random group id `g` takes their place, so they still count but no longer point at the thread. The monthly files are rewritten safely (new file, then moved over the old one).

## How it reads the app (checked in the installed 0.2.2-rc.2, `dsh-tools/lib/types/pipeline.js`)

- `tools/pre-execute` (a waterfall): the ledger's listener is put **first** (`prepend`), so `next()` returns the gate every other add-on agreed on: allow, deny, ask or cancel.
- `tools/execute` (a waterfall around the tool's body): reached only when the call really runs; the time starts there.
- `tools/result`: the final result of every call. PTC sends each call a program makes through the same pipeline under its own name, with `exec.parent` set: that is `via: "program"`.
- The app's approval outcome is in the result's `error.info.code` (`APPROVAL_REJECTED`, `APPROVAL_CANCELLED`, `APPROVAL_UNAVAILABLE`); `UNKNOWN_TOOL` means the mode does not offer the tool. Such a call still goes through `tools/execute`: the app only finds out inside the tool body (`ToolNotFoundError`), so `UNKNOWN_TOOL` is read first, as `refused`, rule `not-offered`, never as a failed run.
- `request/header` session events carry the tools the model is offered (`data.header.tools`); the app writes one whenever that list changes. Only live ones count (older ones are history being loaded).
- Guards (`tools.guard`) give only a reason text, so a guard's refusal is `refused` with rule `unknown`, unless its add-on says why (below).

## Service `toolLedger`

- `note({sessionId, tool, outcome, rule?, by?, via?, exec?})`: for add-ons that refuse, park or ask about a tool and want the reason recorded. `outcome` is `refused`, `parked`, `asked`, `allowed` or `denied`. Pass `exec` (the app's call, the argument a guard or a pre-execute listener gets): the note then joins exactly that call, whenever its result comes, and never another call. A note without `exec` joins the next result of the same thread and tool that names no call of its own. A note no call claims is written on its own after 30 minutes. That wait is long on purpose: the app sends a refused call's result only after the slower calls the model made before it in the same step have finished (`dsh-tools` batch scheduler, results in the model's order). `via: "access-request"` is written at once. Never throws; returns false when it was not taken. Callers keep it optional (`ctx.get('toolLedger')?.note?.(…)` in a try/catch). Modes and Mission pass `exec`.
- `query({from?, to?, range?})` → `{rows, summary}`: the lines of a range (ms ends, or `range` `30d`, `6m`, `all`) and what they add up to. For Data mode and Tuner Plus.
- `summary({range})`: what the page shows. `csv({range})`: the lines as a CSV table. `flush()`: write what waits now.

**Modes notes its rules** (the one change made in dsh-modes for this): its guards are wrapped with `ledgered(rule, guard)` and note `web-sources`, `secrets`, `no-programs`, `web-off`, `isolated`, `depth-check`, `skill-off`; its two pre-execute refusals note `skill-off` and `one-model`; `request_tool_access` notes the tool asked for and the answer's code (`allowed`, `denied`, `timeout`/`unavailable`/`unattended` as `parked`, and since Mission stage D `parked` (a Mission helper's request waiting in the Mission's card) as `parked`, anything else, `once-only` included, `refused`), never the reason given. Each note is in a try/catch: without the ledger, Modes refuses exactly as before (`dsh-modes/test/ledger-notes.test.mjs`).

## Routes (behind the app's connection fence: login cookie and Host/Origin check)

- `GET /dsh-tool-ledger/summary?range=30d|6m|all` → totals, the four views, the table per tool, the modes (field `tabs`) and their names, the settings.
- `GET /dsh-tool-ledger/export?range=30d|6m|all&format=csv|json` → the lines as a download (`tool-use-<range>-<date>.csv` or `.json`). CSV columns: `t, kind, sid, parent, g, ws, tab, space, preset, mission_run, mission_role, tool, family, state, loaded, via, outcome, rule, by, ms, size, full, added, removed`. A cell a spreadsheet would read as a formula starts with `'`.
- `POST /dsh-tool-ledger/clear` with the JSON body `{"confirm":"start fresh"}`: Start fresh. Any other method, body or content type changes nothing.

## The page (Settings → Tool use)

**Record tool use** (switch), **Keep records for** (30 days to 10 years; default 1 year), a time range (Last 30 days, Last 6 months, All) and a mode filter, then four lists and a table.

The line above the lists counts threads and helpers apart ("54 tool calls in 5 threads and 20 helpers"): a line with a `parent` is a helper's (`totals.helpers`), the rest are threads (`totals.conversations`). The lists count both, since a helper has its own set of tools on offer, and say so ("in 3 threads and helpers"). Found in the lab on 19 November, where helpers made 20 of the 25 counted "threads".

- **Asked for often but off**: requests for a tool, and calls refused while the tool was Off or Locked or not on offer, at least twice. A request answered "it is already on", a request for the request tool itself, and a request for a tool that does not exist are left out. A tool that is only on offer in a certain state is left out when the mode did not offer it (rule `not-offered`): `mission_step`, which Modes offers only while a Mission runs (the (i) texts say so in those words since stage B); the list is `STATE_ONLY_TOOLS` in `lib/families.js`. `mission_request_files` is not on that list: Mission always registers it and tells the model to call it while a Mission mode is on, so a mode that does not offer it then shows here. Button: Tool access.
- **Loaded but never used**: tools on offer in at least 3 threads of a mode that the assistant never got to use there: never called, or every call was refused or turned down (only a call that ran, failed while running, or was allowed counts as a use). Button: Tool access.
- **Held in reserve but always called**: tools fetched from the reserve in at least half of a mode's threads (and at least 3). Button: Modes (where "Load tools as needed" is).
- **Refused most**: refusals, no answers and denials by rule. The button opens the page that holds the rule (Web sources, Modes or Tool access). The same state-only tool is left out here when the rule is `not-offered` (a refusal by another rule still counts). Both stay in the records and in the Every tool table. An answer to a request for a tool has its own key (`request:<code>`), so its words never mix with the pipeline's rules; every code Tool access can give has plain words ("you said no a moment before", "it was already on", "you chose not to be asked again", …). A request answered `off` while Tool access itself was off reads "Tool access was switched off".
- **Every tool**: calls, ran, failed, refused and asked you, per tool (for one mode with the filter).

Every control and each list heading has an (i) (the shared `ui.Info`, or `info` on a `ui.Row`) saying what it does, when to use it and what happens if you change it; `test/client.test.mjs` checks each one. Each button only opens the page; nothing changes until you change it there. The page reads the records again when its window is shown again after being hidden or gets the focus back (`visibilitychange` and window `focus`); **Refresh** does it by hand. **Save a copy** downloads the records; **Start fresh** asks first (danger style) and removes every record.

## Settings

```yaml
- id: tool-ledger
  config:
    enabled: true     # Settings → Tool use → Record tool use
    keepDays: 365     # 30 to 3650; months that ended longer ago are removed at start and once a day
```

A request for a tool (a `request_tool_access` line, `via: "access-request"`) is not a call of that tool. It never counts as using the tool (so it never makes "Loaded but never used" drop a tool, and never counts as a fetch from the reserve), it is not in the call count or the Every tool table, and the page counts it apart ("and N requests for a tool"; `totals.requests`). The lines on disk are unchanged, so older files read the same way.

## Limits

- Writes are buffered and appended every 2 seconds and when the add-on stops; a listener never throws and never holds up a call. At most 5000 lines wait in memory if the disk cannot be written; past that the oldest are dropped (logged).
- At most 1000 threads' loaded sets and 500 waiting notes are kept in memory.
- `loaded` for a thread that was already open when the add-on started (or after a restart) counts the first tool list seen as the start.
- Keep days removes whole months, so up to one extra month stays on disk; the page and the export never show lines older than the range asked for.

## Tests

`test/ledger.test.mjs` (line shape, no arguments or results stored, outcomes, loaded-set difference, monthly files, bounded memory, prune, erase, clear, ranges, the four views, CSV), `test/families.test.mjs` (the family copy matches Modes' table), `test/app.test.mjs` (the whole add-on in a stand-in app with the pipeline in the app's order: place, preset, project, state, size; loaded lines and tools_find; programs; guard refusals with and without a note; a gate set by an add-on that loaded earlier; asking; Mission helpers and the conductor; notes; switched off; deleted threads; the routes; the service; flushing at stop; the review fixes above). 38 tests, all passing. Modes: `dsh-modes/test/ledger-notes.test.mjs` (3).

```
cd addons/dsh-tool-ledger && ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test test/*.test.mjs
```

## Review fixes (19 November 2026)

- A refusal whose result came late (a slower call before it in the same step) was written twice, once as "another add-on refused it". Notes now name their call (`exec`), and a note without one waits 30 minutes, not 3 seconds. A later call of the same tool never takes a note left over from another call.
- Calls of a tool the mode does not offer (`UNKNOWN_TOOL`) were "Failed" and could show up as "Held in reserve but always called". They are now refused, rule `not-offered`.
- Requests for a tool counted as using it and as calls; "already on" and "the request tool itself" counted as "asked for but off". Fixed as described under the page.
- Request answer codes showed raw (`rule "denied-recently"`) or with wrong words (`unknown`, `off`). Every code now has plain words, under its own key.
- Deleting a thread for good reads and rewrites only the months whose text holds its id; notes still waiting for it are dropped, so no line with its link is written later. (Still synchronous: reading the All range, the export and the erase of a month that holds the id still use synchronous file reads. Not changed: small files in practice, and the store's callers are synchronous.)
- Tests added, each failing on the code before: `test/ledger.test.mjs` (not offered after the execute step; requests are not uses; request rule keys; words for every request code, checked against Modes' `access.js`), `test/app.test.mjs` (a refused result 10 minutes after its guard; a named note written once if its result never comes; not-offered calls through the pipeline and the summary). Modes' and Mission's notes now pass `exec` (`dsh-modes/index.js` `ledgerNote`, `dsh-mission/index.js` conductor guard); their tests check it.

## Verified and not verified

Verified: everything in the tests above, against the pipeline order, event names and result codes read from the installed app's code (0.2.2-rc.2).

**Not verified in a running app** (no lab run was made for this build): the page drawn in the app (light, dark, narrow), the download links in the desktop app, live `request/header` events and the PTC nested calls in a real thread, dsh-mission's `helperOf`/`runOf` (built at the same time by another builder; read as optional), and the Cowork trash erase in a real deletion.

## Mission, the one name (stage B review, 19 November 2026)

The (i) texts of "Asked for often but off" and "Stopped most" now end "…because it is only offered while a Mission runs." Test: `test/client.test.mjs`.

## Mission stage D rules (20 November 2026)

Words only; no change to how lines are kept. Mission's helpers now work several at once, park what needs your yes in the Mission's card, and never change the same file at once. Mission notes these rules, each with plain words on the page:
- `mission-approval`: it waits for your yes in the Mission's card;
- `mission-file-held`: another helper of the Mission was changing that file;
- `mission-folder-busy`: another helper's command was changing files;
- `mission-said-no`: you said no to it earlier in the Mission;
- `mission-outside-change`: a Mission's helpers cannot change anything outside the folder;
- `mission-item-tool`: it was allowed for another item of the Mission only;
- `mission-background`: several helpers work at once, so a command that may change files must run in the foreground (stage D review).

Tool access answers a Mission helper's request with two new codes: `request:parked` (it waits for your yes in the Mission's card; outcome `parked`) and `request:once-only` (it can only be allowed one call at a time, which a Mission's helper cannot wait for; outcome `refused`). `REQUEST_RULES` lists both. Tests: `test/ledger.test.mjs` (plain words for every request code, and for the Mission rules).

Mission "When it needs you" (owner's point 17, 20 November 2026): a Mission on Full auto never asks and never gives itself permission, so a helper's request for your yes is not asked. Mission notes such a refusal with the rule `mission-not-asked` (it needed your yes, and this Mission runs on Full auto, which never asks), and Tool access answers a request with the code `request:not-asked` (a Mission on Full auto never asks for your yes; outcome `refused`), not `denied`, since you never said no. `REQUEST_RULES` lists it; `test/ledger.test.mjs` checks both have words.
