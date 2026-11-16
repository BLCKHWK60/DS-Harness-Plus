# Mission

Plugin `@local/dsh-mission` (dsh 0.2.2-rc.2). Two things:

- **Permission modes and checkpoints** (since 0.36.0): three modes that keep the assistant inside a conversation's folder, and checkpoints of that folder that the user can go back to.
- **The run** (since 0.37.0): `/mission <goal>` hands the goal to several models in fixed roles, with real commands as the proof. It is described under "The run" below.

Nothing happens until the user types `/mission` in a conversation.

## The modes

| Mode | Inside the conversation's folder | Outside it |
|---|---|---|
| **Restricted** (`/mission restricted`) | New files are free. Changing or deleting an existing file is asked once per file. | Nothing is read or changed, and the user is never asked. |
| **Ask-Auto** (`/mission ask`) | As Restricted. | Reading is asked once per place. A change is asked for by the app's own sandbox. |
| **Full Auto** (`/mission auto`) | Free: no asking. | As Ask-Auto. |

`/mission on` switches on the mode chosen in Settings → Mission (default Restricted). `/mission off` lifts the mode. `/mission` alone shows what is on (and how a run stands) and lists the commands.

A file the assistant created itself in the conversation is its own: changing it later is not asked.

## How the modes hold

1. **Every tool call is decided before it runs** (`tools/pre-execute`; rules in `lib/guard.js`, a pure function). Paths are taken from the call's arguments (`file_path`, `path`, `files` and the like) and compared in their real spelling, so a link that points out of the folder counts as outside. A question goes to the user through the app's own approval card (`approval.request`); the answer is remembered per file (inside) or per place (outside) in `<home>/mission/conversations.json`.
2. **The app's sandbox does the fencing for changes.** Switching a mode on puts the conversation on the app's **Workspace Write** preset (sandbox `workspace-write`, approval `ask`). The app then refuses any write outside the folder at the operating-system level, for file tools and for terminal commands alike. To change something outside, the assistant has to retry the call with `sandbox_permissions`, and the app asks the user. In Restricted, Mission refuses such a retry before it gets that far.
3. **Terminal commands** cannot be asked about file by file, so they are checked afterwards. A checkpoint is taken before every command. After it, in Restricted and Ask-Auto, any file that existed before, was changed or deleted by the command, and is not approved, is put back from that checkpoint. The command's output is kept and a note is added telling the assistant what was put back and how to ask (`mission_request_files`, or the edit tool). New files and everything the project ignores are left alone.
4. **Reading outside from a command** is checked from the command's text only: words that are paths under the user's home (or `..` leading out of the folder) and are not system places (`/usr`, `/bin`, `/opt`, `/tmp` and so on). Restricted refuses the command; the other two ask.
5. **Helper agents** (sub-agents) of a guarded conversation are under the same mode and share its approvals. A helper's question is put to the user through the conversation it works for.
6. **The assistant is told the rules** (prompt section `mission:rules`), including that in Restricted it must not ask.

The tool `mission_request_files { files, why }` asks the user once for several existing files, for example before a formatter runs.

## Checkpoints

- Kept with git in a store of their own: `<folder>/.dsh-mission/checkpoints.git` (`GIT_DIR` there, `GIT_WORK_TREE` the folder). The project's own repository is never read or written, except that `/.dsh-mission/` is added once to its local, uncommitted ignore list (`.git/info/exclude`) so the store does not show up in `git status`.
- Taken when a mode is switched on, at the start of every turn, before every terminal command, and by `/mission checkpoint [name]`. When nothing changed since the last one, no new one is made.
- `/mission checkpoints` lists them, newest first, numbered. `/mission back 12` puts the whole folder back as it was at checkpoint 12. The state just before going back is kept as a checkpoint too, so going back can be undone, and the list never loses an entry.
- **Not kept:** what the project ignores in `.gitignore`, and always `node_modules/`, `.venv/`, `venv/`, `__pycache__/`, `.DS_Store`. Such files are neither protected from commands nor put back.
- Needs `git` (`/usr/bin/git`, or Homebrew's). Without it a mode still decides tool calls, but there are no checkpoints and a command's changes cannot be put back; the command says so when the mode is switched on.

The app shows a command's answer as one line that opens with a click; each answer therefore starts with the essential line.

## Limits

- A script can read a file elsewhere on the Mac without naming it in the command line. It cannot change one: the sandbox stops that.
- A change outside the folder is asked for by the app per call, not once per place.
- The app's approval button reads "Allow once"; for a file inside the folder, Mission remembers the yes for the rest of the conversation all the same.
- A command that runs in the background and changes files after it has returned is not caught by the check after the command; the files are still in the earlier checkpoint.
- A nested git repository inside the folder is recorded as a link, not copied.
- Changes the user makes by hand are never undone by the put-back, but `/mission back` returns the whole folder, the user's own later changes included (they are in the "before going back" checkpoint).
- Very large files that the project does not ignore are copied into the store at every change.

## Where Mission does not work (0.57.0)

The rules are in `lib/gate.js`, a pure function.

- **Isolated conversations (Recon).** Other add-ons leave an isolated conversation alone, and so does Mission. When the Modes add-on says a conversation is isolated (`modes.isolated(id)`; a Modes add-on that cannot answer counts as isolated), `/mission` answers "Mission is not available here: this is an isolated conversation (Recon), and other add-ons leave it alone." and changes nothing: no permission preset, no checkpoint of the folder, no run. `mission_step` answers the same. Only `/mission off`, `stop` and `end` still work, so a mode or a run an earlier version started there can be taken back. A mode left on from before is not applied any more (no checks of tool calls, no checkpoints at the start of a turn). A run left on there (one an earlier version started, or one in a conversation moved to the Recon tab with the Cowork sidebar) cannot move, because Modes refuses `mission_step` in an isolated conversation; so it is paused a moment after the next turn the app starts there, with the reason kept in the run, and does not use up the goal's rounds. `/mission end` closes it with a report.
- **A tier with Sub-agents off.** A run's planner, workers and reviewer are sub-agents. When the conversation's tier has Sub-agents switched off (Model Tiers: `modelTiers.resolveTier(id).subagents === false`), `/mission <goal>` and `/mission resume` are refused with the reason and what to do (switch Sub-agents on for the tier in Settings → Model Tiers, or give the conversation another tier). Nothing is switched on first. A run already under way is paused at its next step (`mission_step` pauses the app's goal and keeps the reason, which `/mission` shows), so it does not use up rounds; `/mission resume` carries on once the tier allows sub-agents again. The modes and checkpoints (`/mission restricted`, `ask`, `auto`, `checkpoints`, `back`) start no helpers and still work.
- **How the owner's decision is read.** The decision says to refuse `/mission` where the tier allows no sub-agents. Mission refuses there what needs helper models: starting a run and carrying one on. The permission modes still switch on such a tier (`/mission restricted`, `ask`, `auto`, `on`, which also set the app's permission preset and take a checkpoint), and checkpoints still work, because none of them starts a helper. In an isolated conversation everything but taking back is refused, as above.
- `mission_step` is not registered with Model Tiers' own sub-agent gate (`registerSubagentTool`): that gate also counts the step's own running helper, so on a tier capped at one sub-agent the conductor's next call (which only waits for that helper) would be refused and the run would stall. Mission reads the tier's switch itself instead.

## Settings

Settings → Mission: the switch (`enabled`, default on), the mode `/mission on` uses (`defaultMode`, default `restricted`), the models for a run (`roles`, `projects`), and a run's limits (`maxItems` 12, `maxTries` 3, `maxReviews` 2, `maxSteps` 60, `waitMinutes` 3).

## The run (since 0.37.0)

`/mission make every test pass and add a --json option` starts a run in the conversation's mode (or the Settings default). A mode named first applies to it: `/mission auto …`.

### What happens

The order of work is fixed and the add-on drives it (`lib/run.js`, a pure state machine). A model never decides that something passed.

| Step | Who | What |
|---|---|---|
| **Plan** | planner | Reads the folder and answers with a checklist: each item has a "done when" and, where possible, **a shell command that exits 0 only when it is done**. Also the overall commands (tests, build) that must pass at the end. A plan that cannot be read becomes one item, the goal itself. |
| **Work** | worker | One item at a time, so two models never change the same files. After the worker, the item's command is **run by the add-on** (`lib/shell.js`, in macOS's sandbox: it may write only in the folder and in temp). Pass: the item is PASSED. Fail: the item is tried again with what the command said. The last try goes to the planner's model ("senior worker"). After all tries: NOT FINISHED. |
| **Checks** | the add-on | Runs the overall commands. One that fails becomes a new item. |
| **Review** | reviewer | Gets the goal, the checklist, the command results and what changed since the start (from the checkpoint store). It judges the items no command could prove (they become REVIEWED) and may send items back or add up to four. It cannot overrule a failing command. |
| **Finish** | the add-on | The report: every item with its mark, the overall commands, what waits for the user, and the checkpoint to go back to. "Complete" only when every item is PASSED or REVIEWED and the overall commands pass. |

### How it keeps going

The app's own goal system is the clock. Starting a run creates an app goal (`goals.create`); the app's round driver then gives the conversation one turn after another. In each round the conversation's own model (the "conductor") calls the one tool `mission_step`, which does the next step and returns what happened; the conductor says it in a sentence. While a run is on, every other tool call by the conductor is refused, so a weak model cannot wander off and start doing the work itself. The helpers are ordinary sub-agents of the conversation and are under the conversation's permission mode.

- `/mission stop` pauses (the app's Stop button does the same), `/mission resume` carries on, `/mission end` closes the run with a report, `/mission report` shows how it stands.
- The run is on disk after every step, so it survives an app restart: `/mission resume`.
- A step that fails three times running closes the run with a report.

### PTC mode, long steps and stalled runs (0.37.1)

- **PTC.** In the app's PTC preset a conversation can call only `run_code` directly and reaches every other tool from inside that program. 0.37.0 refused `run_code` to the conductor ("call mission_step and nothing else"), so a run in PTC could never step: the owner's first run used all 70 rounds on that. Now the program is let through and what it calls is decided one by one, so only `tools.mission_step({})` gets through. The conductor's note gives the exact program in PTC conversations.
- **Long steps.** A step now runs on its own, apart from the tool call that started it. A call of `mission_step` only waits for it: 100 seconds in PTC (the app stops a program after two minutes unless the model asks for more, ten minutes at most), 70 minutes otherwise. When the wait ends first, the tool says the step is still under way and to call again; the next call finds the same step. A call that is cut off does not stop the step, unless the goal was paused (the user pressed Stop), in which case the step stops too.
- **The app's round cap** for the goal is set far above a run's own step limit (3000), because waiting rounds use rounds. A run's own limits are what end it.
- **Stalled runs.** Five rounds in a row without a call of `mission_step` pause the run, with the reason shown by `/mission`. Before, such a run used every round it had. Since 0.57.0 the count, and the pause, are made a moment after the turn starts: inside the app's turn-start event a goal cannot be paused (the app refuses to write to the conversation while it is handing out that event), so until then this brake did not work in the app, only in the tests. A pause that the app refuses is not reported as made.

### When the user is away

In Restricted and Ask-Auto a worker may need the user's yes for a file. The question appears as a card **in the main conversation** (the app answers a helper's own request with a no and no card, so the question is put through the conversation the helper works for). If no answer comes within `waitMinutes` (default 3), the item is marked NEEDS YOU and the run carries on with the rest. `/mission resume` after the run takes those items up again.

### Which model does what

**Since 0.40.0 the default is one model for everything:** every role runs on the conversation's own model, so nothing else has to be loaded. The roles' own models apply only when the conversation is set to "Different models" with the models chip in the chat box (the Modes add-on keeps that choice and answers `modes.helperModels(sessionId)`; without the Modes add-on it is one model). The first line of a run's start says which it is ("one model" or "3 models") and names them.

With "Different models", for each role (planner, workers, reviewer), in this order: the project's own choice, Mission's choice, the Model Tiers role model of the conversation's tier (`plan`, `implement`, `review`), the conversation's model. Settings → Mission has the pickers: "Models for a run" for every project, and "Per project" for one folder. They are stored as JSON in the settings `roles` and `projects` (keyed by the project's folder).

### What a run leaves behind

In `<folder>/.dsh-mission/runs/<id>/`: `run.json` (the run as it stands), `log.jsonl` (one line per step: kind, role, model, milliseconds, item, try, the command and whether it passed), `steps/` (every helper's answer in full) and `report.md`. `<home>/mission/runs.jsonl` gets one line per finished run with the path of its log. Nothing reads these yet: they are there for a later review by the self-improvement add-on.

### Limits of the run

- Its quality is the quality of the plan. A check command that proves little lets weak work pass; the reviewer is the only guard for that.
- "REVIEWED" is a model's judgement, not a proof. The report says which is which.
- One item at a time. No workers in parallel.
- No browser checks of its own. A worker can use whatever browser tool or command the conversation has, and a check command can be a browser script, but the add-on does not drive a browser.
- The conductor has to call `mission_step` and should relay the final report. A model that does neither stalls the run or leaves the report in the tool result; `/mission report` shows it either way.
- Proof commands run with the user's shell PATH and without network limits, like the assistant's own terminal.

## Long run (overnight 16 November 2026)

A long run is a Mission run of its own kind; `/mission` runs keep every rule they had.

- **Start** with the **Run** button next to Send (since 16 November 2026, the owner's choice): type what the run should do in the chat box and press Run. Mission is told the next message of yours is a run's goal (`POST /dsh-mission/long`, `action: arm`, forgotten after 30 seconds or with `action: disarm`), then the button presses the app's own Send, so the message shows in the chat as usual. When that message arrives (a `user/message` event of source `user`), the run starts with it as the goal; the conversation before it (your messages and the answers, at most 4000 characters, `long.context`) goes to the planner and the reviewer, so a plan made by chatting carries over. Between the press and the start the conversation's model is told a run is starting, `mission_step` waits for the start, and its other tools are refused once the run is on. A press is refused while the conversation is answering, in an isolated conversation (Recon), in a helper, and when the pre-flight fails; a start that fails says why on the button and to the model, and puts the tab back. **Send** stays an ordinary message at the conversation's Depth. The old card start (`action: start` with a goal) still works.
- **Settings per chat**: Depth → **Long run settings…** opens the chat's settings (time, laps, file changes, Files and commands, Web, full time, keep awake, battery, try again, think by role, token allowance) with the pre-flight list, saved with `action: save` in `mission/long-settings.json` (at most 500 chats). The Run button uses them; a chat with none saved uses Settings → Mission and the tab's Long run tools.
- **Messages during a run**: what you send while a Long run works is kept for it (`long.asks`, the last six, 500 characters each, logged as `ask`) and every helper reads it from its next step on, at the top of the run's notes.
- **Laps**: work on the open items, the overall commands, a review. The run stops at its time (read between steps, so it can go over by the step under way), its laps, an optional token allowance, or when two laps in a row find nothing more to do (unless "Use the full time" is on). "Finish this lap" ends it after the lap under way.
- **The gate**: once the overall commands have all passed, a lap whose commands then fail where they passed (still failing when run a second time) is undone: the folder goes back to the checkpoint taken at the lap's start, the undone work is kept as a checkpoint, and the report names both. Your own edits in that folder during the lap go back too; they are in the kept checkpoint.
- **Notes** about what passed, failed and should be avoided are kept by the add-on and given to every helper (at most 1,200 characters, replaced each lap).
- **Effort by role**: planner and reviewer High, workers Medium (the same model). Model Tiers leaves those helpers' effort alone (`mission.ownsEffort`).
- **The card** above the chat box shows the lap, items done, time left, tokens and the step under way, with Pause, Resume, Finish this lap and End; the checklist opens on request. The app's goal strip is hidden while a long run's card shows. A finished run's card shows its summary line and the report.
- **Watchdog**: when the app stops giving the run rounds while it runs (its goal still active but disarmed: a failed request, or a reply cut at its length limit), the run notes it and, if "Try again by itself" is on, re-arms the goal after 2, 5 and 10 minutes, never after your own pause. After a restart it waits for you (Resume on its card).
- **Keep awake**: macOS's `caffeinate -i -w <the app's pid>` while a long run that wants it is on and the Mac is on power (on battery only if every such run allows it).
- **Events for other add-ons**: `mission.onEvent(listener)` (started, step, needs-you, paused, stalled, stopped-by-itself, retried, finished), `mission.isRunning(id)`, `mission.view(id)`. Alerts send run alerts from them; Alerts and Notify keep a running run's rounds quiet.
- **Every tab but Recon, in place** (the owner's choice, 16 November 2026: a run never moves a conversation to another tab). While a Long run is on, its conversation and helpers get the tools it needs on top of the tab's own: the card's **Files and commands** (every tool, as in Cowork) and **Web** switches, whose starting choice per tab is on Settings → Modes → Long run tools. The tab keeps its own way of working (its instructions); the model is told the run's tools override what the tab says about tools. Modes asks Mission (`mission.longRun(id)`) and puts the tools on right before the first round (`modes.refreshTools`) and again when the run ends.
- **Read Only tabs** (Data, Research, Chat, Automations: Modes' `readOnly`) only warn: "This tab is Read Only, but a Long run can change files in this conversation's folder." The run selects the Workspace Write preset; when it ends, the earlier preset and access level come back (`long.restore`, a `sandbox/mode` event), and the Mission mode goes off again if the run switched it on. `/mission` modes and ordinary runs are still refused there; `/mission status`, `report`, `pause`, `resume` and `end` work on a Long run there.
- **Defaults** are on Settings → Mission, "Long runs".

## Tested (0.57.0, where Mission does not work)

- **Unit tests (7 more, 23 in all), `test/gate.test.mjs`, with Mission running on stand-in services (Modes, Model Tiers, the goal service, permission presets; like the app, the stand-in goal service refuses a pause while a session event is handed out):**
  - the gate's rules on their own;
  - an isolated conversation: `/mission restricted`, `on`, a goal, `/mission` alone, `checkpoints` and `resume` are refused with the reason, and nothing is switched, taken or started; `off` and `end` answer; `mission_step` refuses;
  - a mode switched on before the conversation became isolated: the guard no longer refuses a write outside the folder (Modes decides there), and `/mission off` puts the earlier preset back;
  - a tier with Sub-agents off: a goal and `resume` are refused before anything is switched on, `/mission restricted` works, `mission_step` starts no helper;
  - a run under way when the tier's Sub-agents go off: the next `mission_step` pauses the goal and starts no helper, `/mission` shows why, `resume` is refused until the tier allows sub-agents again and then carries on;
  - a run left on in a conversation that is isolated now: the next turn start pauses its goal a moment later (not inside the event), keeps the reason in the run and its log, later turns change nothing more, and `/mission end` closes it;
  - turns that start without a step: after five the run is paused, through the turn-start event.
- **Not tested:** the Mac app; real Model Tiers and Modes add-ons (stand-ins only).

## Tested (0.37.0, the run)

- **Unit tests (5 more, 14 in all):** the whole sequence with a failing command, a retry, a set-aside item, a failing overall command that becomes an item, a reviewer that accepts, objects and cannot overrule; "complete" only when everything is proved or reviewed; the step limit; taking an ended run up again; reading JSON out of talk; the order of model choices; the settings.
- **In the test setup**, with a stand-in model playing conductor, planner, worker and reviewer, on a throwaway folder:
  - Full Auto: plan (3 items, 1 overall command); item 1 written and its command passed; item 2's first worker **claimed it was done without doing it**, the command failed, the second worker did it and the command passed; item 3 (no command) went to the reviewer; the overall command passed; the reviewer approved; the run ended complete after 7 steps with its report, log and step files.
  - Restricted with a model per project: workers ran on the project's model, the reviewer on Mission's, the planner on the conversation's; the third try of an item ran on the planner's model.
  - Restricted, user "away" (wait set to 1 minute): the worker's edit of an existing file showed the card in the main conversation; unanswered, the item became NEEDS YOU after 61 seconds, the run finished the rest and the file was untouched. After an app restart, `/mission resume` took the item up again, the card was approved, and the run ended complete.
  - The command runner outside the app: finds `node`, `npm` and `git`; a write outside the folder is refused; a timeout stops a command; exit codes are reported.
  - The Settings page: role models, a project added, given a model and removed, limits saved and kept in range.
- **0.37.1, in the test setup, a conversation in the PTC preset:** the conductor's `run_code` program reached `mission_step`; a worker that took 126 seconds outlasted the 100-second wait, the conductor was told the step was still under way, called again and got the result; helpers worked through programs too; the run ended complete. Unit test with stand-in services for the wait, a cut-off call and the stall brake (15 tests in all).
- **Not tested:** any real model (planning quality, whether workers obey, whether the conductor relays the report); `/mission stop` in the middle of a step; a conductor that calls another tool (the refusal is in the code, the stand-in never tried); a long run; the reviewer sending items back in the app (unit tests only); the Mac app.

## Tested (0.36.0, modes and checkpoints)

- **Unit tests (9):** real-path comparison including a link that leaves the folder; reading commands for outside places without false alarms (`/usr/bin/git`, `/etc/hosts`, a URL, a search pattern); every mode's decision for file tools and commands; the checkpoint store (take, what changed, put files back, go back, undo going back, the ignore-list line written once); the record across a restart.
- **In the test setup, with a stand-in model that calls the tools it is told to**, on a throwaway folder:
  - Restricted: a new file was written with no question; editing an existing file showed the approval card once and not the second time; a command that changed one file, deleted another, made a new one, appended to the assistant's own file and wrote ignored build output had the first two put back and the rest kept; a read outside and a command naming `~/Documents` and `..` were refused, and the command did not run.
  - Ask-Auto: a read outside showed the card once, then not again; `mission_request_files` asked for three files in one card, after which a command could change them, while an unapproved `.gitignore` was put back; a write outside went through the app's own card once and was written.
  - Full Auto: a command changed existing files with no question; a read outside showed the card, and a "Reject" reached the model as a refusal.
  - `/mission checkpoints` listed them; `/mission back 1` returned every file to its first state, removed the files made since, and left ignored output alone. The mode survived an app restart.
  - The Settings page shows and saves both settings.
- **Not tested:** a real model (whether it follows the rules text and uses `mission_request_files`); a project that is a real git repository (unit test with a stand-in only); a large repository's speed; the Mac app; `/mission off` returning a conversation to Full access (the test conversation was on Workspace Write already).

**Helpers that fail** (16 November 2026). A helper whose model failed or refused counts as a failure with its reason, never as done. With Think by role on, a failed helper is asked again once without a thinking level and that model gets none for the rest of the run (DeepSeek flash refuses `medium`, a local model `high`; the app's result carries no detail). Three helpers in a row that cannot do their item pause the run with the reason. When a run ends (its last step, End, or failures), the conversation's model is told the run is over and not to carry on its work or start other research unless asked.

**Prose answers and checks** (16 November 2026). A planner that answers in prose twice, or a reviewer that answers in prose, gets one more short ask (`MISSION_FORMAT`) that turns its answer into the checklist or verdict, adding nothing. The plan and review prompts say how a check proves a removal: `! grep -q`, since grep and grep -c succeed when they find the text. A run's planner and reviewer (and their format asks) are refused file writes while they work (`readerOf`): their answer goes in their reply. The check rule also says a pipeline ending in wc, head, sort or echo always passes.

**Recon** (16 November 2026). Where Recon says so (`recon.runs()`), a Recon conversation may run a Long run: in Recon's room, in its own folder (`recon.runFolder`), Restricted, with no check commands (`noCommands`, `dropCommands`; the planner and workers are told) unless Recon's switch is on (`recon.longChecks()` → `long.offlineChecks`, `offlineChecks(run)`: the checks are kept and run in `offlineFence`, with no internet and only in the run's folder; the planner gets `OFFLINE_CHECKS_PLAN`; the card's `recon-checks` line says which), every helper on the conversation's own model, helpers moved into the run's folder before their turn (`workingDirectory.set` in `system-prompt/assemble`), and no line in `runs.jsonl` or `active-runs.json`. `/mission` modes stay refused there; `endRun(id)` lets Recon's End and wipe end it.

**Bench** (16 November 2026, the owner's choice: Long runs work as in every tab, with the device ports closed). When the Bench add-on says a conversation is a Bench one (`bench.longRunRules(id)`, read at the start of the run; undefined anywhere else and when Bench is off, so nothing changes for other tabs), the run keeps `long.bench = {checks, closedPorts}`: its checks run as usual but inside a sandbox rule that also closes the Mac's serial ports and disks (`fence(root, {closePorts})`, `DEVICE_PORTS`: `/dev/cu.*`, `/dev/tty.*`, `/dev/disk*`, `/dev/rdisk*`; `/dev/null` stays open), a check that hits one gets `PORTS_CLOSED_NOTE` in its output, and without the Mac's sandbox such a check is not run at all; its workers are told they have no commands (`workersWithoutCommands`; Bench's own rule refuses them anyway). With checks switched off in Settings → Bench (`checks: false`), the run has no check commands, as a Recon run (`noChecks`, `dropCommands`). Nothing else of Recon's rules applies: helpers keep the conversation's model choice, events carry the goal, the run is listed in `runs.jsonl`. The card's pre-flight says which applies (`BENCH_CHECKS_TEXT`, `BENCH_NO_CHECKS_TEXT`).

## The work loop (Content and Bench plan, steps S3 to S5; 16 November)

**Off unless switched on** (the owner's choice). It is on for a run only when Ultra Code is on for the conversation (Model Tiers' switch beside Effort, or its top effort step; asked of Modes' `ultraCode`), or when the owner switched it on for the conversation's tab on Settings → Mission (`loopTabs`). Decided once, when the run starts (`run.loop`). With it off a run is exactly as before (tested: same helpers, same prompts, no recipes folder made).

One engine: Mission's run (plan, items, commands, review) stays the loop; the loop adds (`lib/loop.js`):

- **Recipes** for five kinds of task (code change, research question, writing piece, data question, extraction): plain JSON files in `<home>/mission/recipes`, written once, the owner's edits kept, a removed one not put back, a broken one left out. The planner gets the closest recipe; with Ultra Code on it may adapt it.
- **A fixed shape** at the end of every worker's answer (`{"done", "summary", "sources", "answer"}`), which the checker reads.
- **A checker per kind**, never the run that made the work: research, every cited page was really opened in this run (the add-on notes what a run's helpers fetched); extraction, a fixed shape; one right answer, separate tries agree; writing and open questions, a separate checker helper that only reads (in the Content tab, Content's drift check decides writing); code and data, the commands, as always. The loop's no sends an item back with its words ("Checker: …"); its yes marks nothing done: commands and the reviewer still decide that. A checker that cannot run is no verdict.
- **Retry and pass up**: the retry gets the checker's words; a step that failed twice goes to the strongest model (the tier's team lead, else the planner's model).
- **Ultra Code**: for text work (research, extraction, one-answer and open questions; not in Recon or Bench runs) several attempts side by side, each locked to reading (Mission's guard refuses their file changes), then a vote (comparable answers) or a judge (picks or merges); the one worker after them writes. Code and file work keep one writer. At Thorough, checking questions: up to four, each answered by its own helper that never sees the draft, then a revision. Calls at once per model server: Settings → Mission (`callsAtOnce`, 4 unless set, between 1 and 16; set a server that runs one request at a time to 1, and side by side then queues there).
- **Teams** (Model Tiers, plan step S6): with the loop on and the models chip on "different models", roles take the tier's team (lead, helpers in turn, checker, judge). A Recon run keeps the conversation's own model and gets no extra helper at all, only the checks the app runs itself.
- **Budget**: the run's limits (steps, laps, time, token allowance) stop it with its report, which says how the loop's checks went.
- Service: `recipes()`, `saveRecipe(recipe)` (Skill architect, only on the owner's yes; the earlier version kept in `recipes/old/`). Settings → Mission → Work loop shows the tab switches, calls at once, and where Benchmark found the loop pays.
- Tests: `test/loop.test.mjs` (14, stand-ins only); each rule was undone once and a test failed.

**Review fixes (16 November, 10 findings):** a goal no recipe fits is code work (commands check it, one writer, no text-only steps); only the app's own checks may reopen an item whose command passed, a model checker never can; the loop's readers (attempts, judge, checkers) and anything they start may run no command, program or helper and change no file (Mission's guard walks the chain of helpers); a one-answer item's final answer must be the one the tries agreed on; a checker reply in the wrong format is no verdict; the checker sends an item back at most as often as the Depth allows (Quick never, Standard once, Thorough three times); calls at once are limited per model server of each helper; recipes are never written through a link (a linked folder or marker leaves the starters in memory; a replaced recipe goes through a new file and a rename); a Recon conversation writes no recipes (the starters from memory). A finished run's line in `runs.jsonl` now names its conversation, so a conversation that received a Recon export keeps its runs out of learning.

**The owner's answers (16 November, evening):** calls at once default to 4 per model server (1 to 16); in the Research tab a Long run uses the work loop only when Ultra Code is on in that conversation (it runs exactly as before without it; the tab switch is not offered there), and `/mission` in Read Only tabs stays as it was. Fixed on the way: reading the fixed shape at the end of an answer that starts with a brace and has none looped for ever.
