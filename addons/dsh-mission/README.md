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
- **Stalled runs.** Five rounds in a row without a call of `mission_step` pause the run, with the reason shown by `/mission`. Before, such a run used every round it had.

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
