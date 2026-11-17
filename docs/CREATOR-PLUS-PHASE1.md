# Creator Plus: Phase 1 report

17 November 2026. The owner's build prompt is "Creator Plus.md" (16 November). Phase 1 changes nothing; it says what exists, what Creator Plus would build and where, and what is open. The owner asked for the whole build overnight ("do not stop and ask until you are unable to proceed"), so Phase 2 followed this report without his review; every decision taken for him is listed at the end, and in `docs/OVERNIGHT-2026-11-17.md`, so he can agree or have it undone.

## 1. How the built-in Creator mode works today

Read from the app's source (`deepseek-harness-master`, newer than the installed 0.2.2-rc.2; the parts below exist in both).

- **What it is.** An agent preset called `cordis`, shown as "Creator mode". The start page's "Create plugin" button and the empty-state suggestions start a conversation in it (`uiWorkspace.startSession(…, {agentPreset: 'cordis'})`).
- **Its tools.** The ordinary file and shell tools of the preset, `plugin_manager` (list plugins and bundles, enable or disable a row, install or remove a bundle; every action needs approval unless the conversation has full access), and two read-only inspection tools from `@deepseek-ai/dsh-tool-cordis`: `cordis_inspect_list` (the providers) and `cordis_inspect_query` (exact Service methods and Event modes, the live Loader entries with each one's Config as a JSON Schema and its package folder, the tools this agent can call, the live Client slots and theme tokens).
- **What it is told.** No system-prompt section of its own; four shipped skills carry the method: `cordis-plugin-development` (deliver a small working plugin first; discover only the APIs needed; copy a template; install with `plugin_manager install_bundle`; verify the live result), `editing-cordis-compositions`, `cordis-composition-reference` (the patch dialect and the list of installable packages), `agent-experience`. Templates: a UI decoration and an MCP bundle.
- **Where it saves and how it installs.** It writes a bundle in the conversation's workspace and installs it with `plugin_manager` (`pnpm` into the profile, then activation; with HMR the change is live at once, without it a restart is needed). A failed install restores `package.json` and the lock file.
- **How it tests.** By installing into the real profile and looking at the live result. There is no trial copy, no fit check, no test-first rule, and no record of what other plugins exist beyond what it inspects in the moment.

**What I can see or do that it cannot:** the history of why each Plus add-on is built the way it is (the handoff, the reviews, this conversation); the owner's standing rules (never touch `~/.dsh` in tests, additive only, fail safe, plain words); a throwaway copy of the setup to try things in (`spike-lab`, `scripts/check.sh`'s install rehearsal); each add-on's own tests; the lab with a stand-in model; and an independent reviewer for every change.

## 2. Stock-take

The map (part 1 of the build) lists this from the running app on demand; at the time of writing:

- **The app:** DeepSeek Harness 0.2.2-rc.2 (built-in plugins from `@deepseek-ai/*`, about 150 rows in the desktop profile).
- **DeepSeek Harness Plus 0.60.0:** 44 add-ons, all `@local/dsh-*`, made by the owner with Claude (`origin: owner+claude`). Seven of them add a tab through the Modes add-on (Finance, Data, Research, Scout, Recon, Automations, Content, Bench). Three are switched off by the owner (he chose this in the app's Plugins page).
- **Third-party plugins:** none found in the repository; the map finds any the profile installs.
- **Planned, not built:** Tuning Plus (built the same night by another helper), the topic watch (needed by Content's C16 link), Creator Plus itself.
- **Defaults the owner changed:** these live in his settings (`~/.dsh`), which Creator Plus reads at run time through the settings service; they are not copied into any file.

Each add-on now carries a passport (`addons/<name>/passport/`), written by code from its package, its patch, its README, its code and its git history (part 2).

## 3. The gap: three plugins

| Plugin | What Creator mode would have got wrong | Cause |
| --- | --- | --- |
| **Bench** (a mode with device tools) | It would have given the mode the shell (the template has it), registered tools for every tab instead of with `when`, and missed that a Long run with "Files and commands" hands every tab every tool; it would not have known the Modes add-on's `extraModes` pattern, the Cowork sidebar's icon list, or that a tool guard needs `export const inject = ['tools']` (the lab showed Bench not loading without it). | Missing knowledge (the setup and its history), missing check (a trial load, a fit check against Recon's and Bench's rules) |
| **Recon's export door** | It would have added an export tool for the model (the obvious design), letting Recon's model start an export; it could not see that the protection must follow the export text, not the conversation id (forks and pastes), nor that onion addresses can be disguised by encoding. | Missing knowledge (Recon's sealed rule), missing ability (an independent reviewer), missing check (safety rules in code) |
| **The Web levels** | It would have changed the Web button's On to a level (the plan said so), changing behaviour for every conversation; it would not have known the owner's rule "add, keep the defaults" or that shell commands and archive links bypass a host check. | Missing knowledge (the owner's rule), missing check (the fit check's "changes existing behaviour" finding, a review) |

## 4. Upstream

- **Version run:** 0.2.2-rc.2 (an rc of 0.2.2). Plus add-ons declare `engines.dsh >=0.2.2-rc.1 <0.3.0`.
- **Breaking changes:** the project keeps per-package READMEs with "Known Limitations and Deferred Work"; it marks a whole group of packages as `experimental` (`packages/experimental/*`). The source checkout is newer than the installed app, so APIs are checked against the installed app (handbook rule).
- **Experimental parts Plus leans on:** the `liveshare`/`session-search`/`computer-use` packages are not used by Plus; Plus uses stable services (settings, tools, agents, sessionQuery, schedule, webServer, slots). The Media tools add-on points to experimental browser and computer use rows but enables none.
- **Interface changes seen over recent releases:** `system_profiler` keys on macOS 27 (Bench); `tools.guard` needs the tools service injected; `sessionQuery` surfaces; the approval card's `displayReason`. Upkeep (part 9) records the map before and after every version change.

## 5. Logs and Depth

- **Session logs:** each conversation is `~/.dsh/sessions/<project>/session-<id>/session.v4.jsonl.zstd`, kept until the conversation is deleted for good; the app's `sessionQuery` service reads them (`listSessions`, `readSurface`, `readTitleSnapshots`). Already read by: Content (bringing in conversations), Skill architect (learning; skips Recon exports and Bench runs), Automations (run results), Recon's own restore after a restart. Mission keeps `runs.jsonl` per run folder; Evolve keeps its own task records; Benchmark its suites.
- **Depth today:** Modes' Depth button (Quick, Standard, Thorough; per conversation, also where new ones start) adds a short care note; Mission's Long run (time, laps, tools for files and the web, a card before it starts) is the last stop of the Depth list. Ultra Code (Model Tiers' switch, 16 November) widens the work loop.

**What each Depth means for Creator Plus** (decided for the owner, see the end):

| Depth | Build | Change | Keep (upkeep) | Improve |
| --- | --- | --- | --- | --- |
| Quick | The recipe's "must" steps, one check pass (load and fit) | Show the change and its risk only | Map diff only | The top three findings |
| Standard | Recipe, tests first, the four checks | Backup, change in the trial copy, that plugin's tests | Map diff and every plugin's load | Findings per plugin with evidence |
| Thorough | As Standard, plus a second checker read of the plan and the result | As Standard, plus the tests of every plugin it touches | As Standard, plus every plugin's tests where they exist | As Standard, plus the change drafted in the trial copy |
| Long run | Repeats until every check passes or a limit; never waits; questions only in the first minute, everything else at the end | Same | Same | Same |

## 6. What Creator Plus is, and where it lives

A new add-on, `addons/dsh-creator-plus`, a tab beside the others (off until switched on), never touching the built-in Creator mode's files. It reuses Creator mode's inspection tools where the app offers them, Mission's work loop and Model Tiers' Ultra Code through their services, and the Plus installer's trial-install approach. Everything code can do is code: the map, the fit check, the fixed rules, the trial copy, the backups, the tests. The full build is described in `addons/dsh-creator-plus/README.md`.

## 7. Open questions (decided for the owner overnight)

See "Decided for the owner" in `docs/OVERNIGHT-2026-11-17.md`.
