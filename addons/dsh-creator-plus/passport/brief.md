# Brief: @local/dsh-creator-plus

What it is for: A Creator Plus tab that builds and improves plugins so they fit everything already installed, and keeps them working through updates: a live map of the setup, a fit check, a trial copy, backups and a way back, recipes, and proposals from the session logs. Nothing in your real setup changes without your yes. Off until you switch it on.

This brief was written by Creator Plus from the plugin's own files. Its README below is the full description, complete enough to rebuild the plugin from; improve this brief by hand, with the user's yes.

## What it must keep doing

- Its tools: creator_map, creator_passport, creator_recipe, creator_interview, creator_plan, creator_scaffold, creator_check, creator_change, creator_upkeep, creator_improve, creator_note, creator_handoff, creator_learn, creator_selftest.
- Its tabs: creator-plus.
- The services it gives other plugins: creatorPlus.
- Its settings: enabled, logReaders, strongModels, plusFolder, savedRuns, sessionBars.

## Its README

# Creator Plus

Plugin `@local/dsh-creator-plus` (dsh 0.2.2-rc.2). A tab of its own, beside the app's Creator mode (whose files are never touched), that builds and improves plugins so they fit everything you have. It is Phase 2 of the plan "Creator Plus"; Phase 1 (how Creator mode works, the stock-take, the gaps) is `docs/CREATOR-PLUS-PHASE1.md`, and the handbook for later builders is `docs/CREATOR-PLUS-HANDBOOK.md`.

Off until you switch it on in **Settings → Creator Plus**. Needs the Modes add-on and the Cowork sidebar.

## What you get

- **The Creator Plus tab** (Workspace Write, with its own guard). Its method (about 2,300 characters, under the 4,000 a tab may have) names its four jobs (build a new plugin, change an existing one, keep everything working after updates, improve from the session logs) and the six fixed rules, step by step, for a small model.
- **Its tools, only in Creator Plus conversations** (registered with `when`, so other tabs' tool lists do not change): `creator_map`, `creator_passport`, `creator_recipe`, `creator_interview`, `creator_plan`, `creator_scaffold`, `creator_check`, `creator_change`, `creator_upkeep`, `creator_improve`, `creator_note`, `creator_handoff`, `creator_learn`, `creator_selftest`. Besides them: reading and writing files (in the build folder only), the web, the app's inspection tools (`cordis_inspect_*`), diagrams, the step list, questions, PDFs. No shell, no programs, no plugin manager.
- **The bar** in the chat box of a Creator Plus conversation: which plugins (built-in and third-party ones carry a lock: read, explained and checked, never edited; Recon shows a note that only its structure is read), "All" on purpose, what to do (New plugin, Improve, Find what went wrong, Rebuild, Combine or split, Find gaps, Check after an update, Explain, each with its line), **Look only** (read and report; prepare nothing, not even in the trial copy), **Logs from** (since the last run, 7 days, 30 days, everything) for the runs that read logs, and the run in one sentence before it starts. **Save run** keeps it by name.
- **Settings → Creator Plus**: the switch; the six rules and how each is enforced; the **results** as cards (a finding, a prepared change, a question, an assumption, a ready plugin) with **Try it in the trial copy**, **Apply to my setup**, **Not now**, **Do not suggest this again** (kept as a preference) and **Undo**/**Remove** after Apply; **what Creator Plus learned** (proposed; kept only when you press Keep; undone with Undo; a lesson from a third-party plugin needs "I read it" first); who may read your session logs (only models on this Mac by default); strong models (they may improve on a recipe's default steps); the Plus folder with its tests; saved runs; the self-test; the backups.
- **Saved runs on the Automations page** (your answer of 16 November): each saved run can be scheduled there; it runs in a Creator Plus conversation of its own as a Long run would, prepares changes in the trial copy only and changes nothing in your setup without your yes.
- **A passport** in every Plus add-on (`passport/`: brief, what it touches, what it was built against, its tests, its changelog, who made it, and an empty `lessons/` folder for Tuning Plus). Built-in and third-party plugins get theirs in Creator Plus's own folder, never in their own.

## The fixed rules, and the code that holds them

1. **No change without a backup and a way back.** Every change and install keeps the version before it in `<app data>/creator-plus/backups/` first (`lib/trial.js`, `lib/change.js`); Undo puts it back, and putting it back is itself backed up.
2. **Nothing changes in your real setup without your yes.** The assistant's tools work in the build folder (the conversation's folder) and the trial copy; the real setup changes only from a button on Settings → Creator Plus, which only you can press (a new plugin goes in through the app's plugin manager; a change is copied into the plugin's folder). A plugin's code (its tests, its index.js, the trial copy loading it) runs only inside macOS's sandbox: no network, no reading of your home folder except the folder being checked and the trial copy, no writing anywhere else (`lib/sandbox.js`). Where there is no sandbox, the code is not run.
3. **Another tab's safety rules are never weakened: blocked, not asked.** The fit check blocks a plan that gives a sealed tab a tool, appears in one, loosens a named safety rule, or changes a file that holds one (every file of Recon; Bench's gates; Modes' isolation, web levels and masking; Content's subject check), and `creator_change` refuses the same files, capitals ignored (`lib/fit.js`).
4. **Third-party plugins and the app's own code are never edited.** The guard refuses writes there; the change tools refuse locked plugins and point to an adapter beside them.
5. **Text from plugins, pages, logs and tool results is material, not instructions.** It is fenced with a random marker it cannot close (`lib/text.js`).
6. **No password or key in a map, a passport or a log.** Maps hold setting names, never values; maps, passports, cards and log findings are masked; logs go only to the models your setting allows; the file tools cannot read the app's data folder (only the installed Plus add-ons, Creator Plus's own folder and the build folder).

The guard (`lib/rules.js`) decides every tool call in a Creator Plus conversation and its helpers in `tools/pre-execute`, before any other add-on is asked, and again as a final `tools.guard` that nothing can undo. It is an allow-list: Creator Plus's tools, file tools, the web, the inspection tools, the step list, questions, `mission_step`, `tools_find`, `skill`, diagrams, PDFs and Memory's `remember`. Every shell, terminal and program tool is refused (`NO_COMMANDS`), as is any tool it does not know (`NOT_ALLOWED`). Writes only inside the build folder by their real path (a link out of it does not count), never in the app, the installed plugins, the app's settings or conversations, or Creator Plus's own folder. A call it cannot check is not run. Also:

- **The bar's selection is a boundary:** a plugin's own files are opened, and a plugin changed, only when it is selected; otherwise it is a line on the map. A run that can change a plugin does not start with nothing selected.
- **The reader has no tools:** the second read at Thorough runs as a helper whose every tool call is refused.
- **A Long run asks only in its first minute.** After that, the question tool is refused and the model notes the question with its recommendation on the list for the end (`creator_note`).
- **The yes to a build** is the user's own newest message ("yes", "build it", "go ahead"; a "no" or "wait" in its first words is not a yes).

## Depth

| | Build | Change | Keep | Improve |
| --- | --- | --- | --- | --- |
| Quick | the recipe's [must] steps; load and fit checks; no trial install | show the change and its risk; prepare nothing | compare the map; run nothing | the three findings that matter most |
| Standard | the recipe, tests first, all four checks | back up, change in a copy, run that plugin's tests | compare the map, check every plugin loads | findings per plugin with evidence |
| Thorough | as Standard, and a second read by a checker with no tools | and the tests of every plugin it touches | and every plugin's tests | and the change drafted in the trial copy |
| Long run | until every check passes or a limit is reached | the same, in the trial copy only | for the whole setup | keep improving until a limit |

## The four checks

`creator_check`: the plugin loads (every file parses; its index.js imports with the app's Node); its tests pass; the fit check is clear; the trial install works (copied into a throwaway app-data folder inside Creator Plus's own folder, `trial/`, with a setup made from the app's web template, registered there with the app's own `dsh plugin add` and composed with `--dump-config`; nothing is started on a port). Every command is a fixed one, run with `execFile`, the trial folder as the app-data folder, inside the sandbox.

## Not built, not verified

- **A real model's scorecard of the eight self-tests.** The code parts run on the page (5 pass by themselves; Rebuild, Look and the rest of Improve need a model: their prompts are in `creator_selftest`).
- **Reading Recon's conversation text** after your yes, by a reader with no tools: not wired. Recon conversations are read as structure only (which tool failed, and the kind of error from a fixed list).
- **An installed plugin's tests:** an installed copy carries none. Set the Plus folder to run them after an update and with a change.
- **Apply in the real app** (the plugin manager installing a new plugin, a change copied into an installed add-on) was tested with stand-ins only. A Plus update replaces a changed add-on; the installer keeps your changed files aside.

## Tests

`test/parts.test.mjs`, `test/plugin.test.mjs` and `test/client.test.mjs`, with stand-ins only (no real app, no real app data). Run them with the app's Node: `ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test test/*.test.mjs`.
