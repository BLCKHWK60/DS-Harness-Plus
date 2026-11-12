# Handoff: DeepSeek Harness Plus

Written 2026-11-11, updated 2026-11-12 after the 0.10.0 to 0.20.2 work. For the next working session. Read this first. Then read only the files the task touches.

## 1. What this is

**DeepSeek Harness Plus** is 26 add-ons for the **DeepSeek Harness** desktop app (Electron, Cordis plugin framework), version **0.2.2-rc.1**, on macOS. The add-ons install into the app's data folder (`~/.dsh/addons/deepseek-harness-plus`) and register with the app's own `dsh plugin add`. The app itself is never modified.

- **Repo:** `deepseek-harness-plus/`. It is a git repository, published since 2026-11-11 at `https://github.com/BLCKHWK60/DS-Harness-Plus` (public, remote `origin`, branch `main`). Push only when the owner asks. Before the first push every commit was rewritten to the owner's GitHub no-reply address, so hashes written down before that day no longer exist; the repo's `user.email` is set to that address. The download is a DMG attached to a GitHub release, built with `bash scripts/build-dmg.sh` (needs a clean tree; writes `dist/`, which git ignores). The DMG holds the committed files only: add-ons, installer, docs. It does not hold the app, and it is not signed or notarised, so macOS asks for right-click → Open on `Install.command`. The latest commit is Release 0.15.0 (the one after `cc1cd77`, Release 0.14.0). `VERSION` reads `0.15.0`.
- **Installed in the owner's real app:** 0.20.1, 26 add-ons, of which `dsh-learn` is switched off by the owner (he is not using it at the moment; leave it off). The backup is `~/.dsh/backups/deepseek-harness-plus/20261112-000800-install`.
- **Parent folder `DeepSeek_Harness_Custom/`:**
  - `deepseek-harness-master/`: the app's source. It is **newer than the installed app**; read it for docs only.
  - `spike-lab/`: the throwaway lab.
  - `t0-lab/`: the mock model server.
  - `dsh-migration-spec.md`: the original spec.
  - Planning notes.

| Add-on (`addons/…`) | What it does |
| --- | --- |
| `dsh-cowork-shell` | MindsHub-style left sidebar with Chat, Cowork and Code tabs, each with its own conversations (tab = the conversation's Modes entry). Replaces the app's sidebar. Has a client UI. In 0.10 the Chat tab has no folders: no pickers, one flat list, always the default workspace, and Promote / Continue in a project. |
| `dsh-color-schemes` | Stock, MindsHub Cowork, Graphite and Forest schemes, plus a custom one. Settings → Colours. |
| `dsh-modes` | Chat, Cowork and Code modes per conversation: tools, sandbox, default tier and prompt. `/mode`. Settings → Modes. |
| `dsh-model-tiers` | Reworked in 0.10. **Tiers** (five generic starters with no model, plus your own): effort, access, sub-agent floor and cap, own instructions, skills, connectors, fallback chains, role models. **Model versions**: named copies of a model with their own effort, temperature and max tokens. **The one model control of the chat box** (model list, effort slider, tier chips, sampling, Save as new version); it hides the app's own model menu. Settings → Model Tiers. The largest add-on: `index.js` about 2650 lines, `client.js` about 4850. |
| `dsh-code-map` | New in 0.11. A compact map of a project (files, symbols, imports, what uses what) built with Node only, kept under `$DSH_HOME/code-map/`, never in the project. Five look-up tools for the model, a short hint, `/codemap`, Settings → Code map. Also ships four "reverse engineer" skills (code base, website, API or file format, installed app; the last is analysis only and excludes removing protections). 37 tests. |
| `dsh-evolve` | New in 0.12. A self-improvement loop for the instructions around a model: test tasks with checks in three groups (Learn, Check, Guard), a reviewer model that proposes bounded edits to a playbook and a few instruction sections, four automatic gates, the owner's approval for every change, versions kept for good. Settings → Self-improve, `/evolve`. Built from the owner's research spec; its README lists what was changed and what was left out (reviewer-written tools and plugins, the meta loop, weight training). 24 tests. |
| `dsh-activity` | New in 0.16. A thin activity indicator: seven designs (pulse line, lanes, threads, ticker tape, rings, two mixes) above the chat box, beside the model button or on the lower window edge. Ten kinds of work with a switch and colour each, a text row with tokens per second, alert sounds for waiting and errors (made with Web Audio, no files), a settings page with preview. Keeps nothing. `/activity`. Settings → Activity. |
| `dsh-learn` | New in 0.19. A tutor that withholds answers: question before teaching, three hints in small steps, answer last, explain back, spaced reviews (1, 3, 7, 16, 35 days). Levels gentle, firm (default), strict, enforced by the tools (`learn_plan`, `learn_mark`, `learn_review`, `learn_status`, `learn_end`) and by the study bar's buttons. Skill `study-tutor`. Record under `learn/` in the dsh home, without the learner's text. `/learn`. Settings → Learning. |
| `dsh-diagram` | New in 0.18. Diagram builder: the model sends a description, the add-on lays out, draws (SVG), checks and saves. Kinds `flow`, `tree`, `sequence`, `timeline`, `chart` (bars, lines, points, formula plots with a safe formula reader). Tool `diagram_draw`, skill `draw-diagram`, picture shown in the chat. Nothing to install. Settings → Diagrams. |
| `dsh-pdf` | New in 0.17. PDF reader on macOS's own PDFKit and Vision, run through `osascript -l JavaScript`: tools `pdf_info`, `pdf_read` (page-numbered, layout mode for tables), `pdf_search`, `pdf_page_image`, `pdf_ocr`; skill `read-pdf`; its own folder fence. Nothing to install. `/pdf`. Settings → PDF reader. |
| `dsh-privacy` | New in 0.14. Its bundle patch disables the app's `session-telemetry-otel` row (conversation upload on feedback) and sets `product-analytics.enabled` to false (desktop usage events). `/privacy` and a start-up log line report the live state. 3 tests. |
| `dsh-sampling-presets` | Temperature and max-token presets per category, mode or conversation. |
| `dsh-model-router` | Routes each turn to one of 2–5 models, chosen by a small routing model. |
| `dsh-route-health` | Probes routes and moves a conversation to its fallback route when its route is down. Shows a dot in the composer. |
| `dsh-agent-swarm` | `run_swarm` tool: fan-out, pipeline or debate across child agents, with budgets. Settings → Swarm. |
| `dsh-deep-research` | `deep_research` tool: parallel child agents and a report with checked citations. |
| `dsh-code-power` | PR review and CI-fix skills, plus a blind `judge_candidates` tool. |
| `dsh-model-arena` | Blind arena between models, with a judge and a reveal. `/arena`. |
| `dsh-benchmark` | Prompt suites run over a grid of models and settings, with graders. `/bench`. |
| `dsh-usage-ledger` | Token and request counts per day and model. `/usage`. |
| `dsh-notify` | Runs a command when a turn ends or the app needs approval. |
| `dsh-role-prompts` | Your own system-prompt sections, optionally per tier. |
| `dsh-media-tools` | Image tools for an OpenAI-compatible API, plus an approval gate for browser and computer use. |
| `dsh-context-saver` | Shortens large tool results. It needs the Python tools in `extras/dsh-intel-mcp`. |
| `dsh-sync` | Syncs conversations between Macs through a git remote, with optional `age` encryption. Apache-2.0 fork of dsh-session-sync. |
| `dsh-shared-settings` | New in 0.9.0. Keeps the Settings-page values in one `settings.json` in a folder such as iCloud Drive, with a field-level three-way merge. It is off until a folder is set; it is **not yet set** on the owner's Mac. |

Each add-on has a `README.md` with technical notes, plus what was and was not verified. Other docs:
- `docs/ADD-ONS.md`: user guide.
- `docs/UI-STYLE.md`: **how every add-on page must look** (measured from the app's own Settings pages; colours only from the app's variables). Read it before touching any page.
- `docs/HOW-IT-WORKS.md`: technical guide.
- `docs/REVIEW-2026-11-11.md`: the last review, including **12 open decisions** the owner has not answered yet.

## 2. Owner's standing rules (never break these)

1. **Never test against `~/.dsh`.** Every `dsh` call, even `--help` or `--dump-config`, runs with `DSH_HOME=<throwaway>`. The only exception is installing into the real app, which runs as `env -u DSH_HOME bash scripts/install.sh --yes`, and only when the owner asks.
2. **No user-specific defaults.** No IPs, hosts, route names, model ids or key names may be preconfigured. Ship `<PLACEHOLDERS>`. The tier table followed this rule from 0.10 (a unit test checks the bundle patch).
3. **No secret values in any file.** Refer to keys by name only.
4. **Stop processes only by verified PID or task id**, never by a broad name such as `pkill node`.
5. **Commit only when the owner asks; never push** without explicit confirmation. Commit messages end with the Co-Authored-By line from the session's instructions.
6. **Licence:** MIT, chosen by the owner on 2026-11-11 when the project went public (`LICENSE`).
7. **Behaviour changes need the owner's OK.** Fix clear bugs freely. Propose anything that changes how a feature behaves.
8. **Writing for the owner:** plain words, short sentences, no jargon. The owner is not a programmer.

## 3. Facts about the app (learned the hard way)

- **Check APIs against the installed app**, not `deepseek-harness-master`. The installed code is in `/Applications/DeepSeek Harness.app/Contents/Resources/app.asar`.
  - To read files from it, use the app's Node with `ELECTRON_NO_ASAR=1 ELECTRON_RUN_AS_NODE=1` and a small header parser. Examples are in `/tmp/dsh-asar/`, if it still exists.
  - Example: rc.1 has no `mcp-manager`.
- **Run Node with the app's own copy:** `ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" …`. There is no system Node.
- **Logging:** use `ctx.logger.warn(...)` or `.info(...)`. Calling `ctx.logger('x')` is wrong.
- **Reading the installed app's code:** `node scripts/dev-extract-app.mjs "/Applications/DeepSeek Harness.app/Contents/Resources/app.asar" /tmp/dsh-asar/full` unpacks the text files (read-only on the app; about 180 MB). The app's packages are then under `<out>/dsh/node_modules/@deepseek-ai/dsh-*`, each with a long README.
- **Sampling:** the app's `llm-pi-ai` adapter passes only `temperature` and `maxTokens` to a request (`stop` throws). There is no `top_p`, `top_k`, `min_p` or penalty field and no hook that edits the request body. A plugin can add request **headers** (`prepareHeaders`), which is the only opening for a local relay that would add such fields.
- **Chat box seats** (browser side, `ctx.slots`): `conversation.input.left` (tool row), `conversation.input.right` (beside send), `conversation.input.model` (the app's own model menu, package `dsh-client-ui-model-selection`). Start page: `conversation.hero.workspace`, `conversation.hero.agentPreset`. Each seat renders a wrapper with `data-slot="<name>"`, which is a stable CSS hook.
- **A conversation's model in the browser:** `ctx.get('modelDirectories').directoryFor(sessionId)` has `store` (snapshot `{current, pending, groups, …}`), `load()` and `select({provider, model, reasoningEffort?})`. Using `select` keeps `/model` and the app in step.
- **A conversation cannot change folder.** A session belongs to the project of its `cwd`; fork copies the `cwd`. `uiWorkspace.startSession(workspaceId, {prompt, whenDraftExists:'replace'})` starts a new one elsewhere; with no id it uses the current or most recent project. A mention `@[title](dsh-session:<base64url of the JSON id>)` in the prompt attaches a read-only copy of another conversation when sent.
- **Skills (server):** `ctx.get('skills').list({cwd, scope})` and `.get(name, {cwd, scope})` (the text is `content`). The scope comes from `ctx.get('agentPresets').acquireScope(undefined)` (`lease.key`, dispose the lease).
- **Connectors:** each MCP server is one `@deepseek-ai/dsh-mcp-client` row; its tools are named `mcp__<serverName>__<tool>`. `agent.ctx.tools.restrict({deny: [...]})` hides tools from one Agent; change it only while the Agent is idle.
- **The installer copies each add-on's `cordis.patch.yml` row into the profile only when the row is new.** An update keeps the row the user already has. So changing shipped defaults never changes an existing install; a one-time carry-over in the add-on (see `carryOver` in `dsh-model-tiers`) is the way to adjust one.
- **Browser automation in the lab:** read the console with a `pattern` and a small limit, or collect errors in the page yourself; an unfiltered read returns tens of thousands of tokens. Click add-on controls by selector through page JavaScript; coordinates shift when the layout changes.
- **Child agents:**
  - Starting one returns `{childId, result, dispose()}`.
  - The `signal` covers start-up only. To stop a running child, call `dispose()`. The `awaitChild(started, signal)` helper in swarm, deep-research, code-power and model-tiers does this.
- **Session events:**
  - `'tool/result'` carries `data.message.toolCallId` and `data.message.content`.
  - `'tool/call'` carries `{callId, name, arguments}`.
- **Listeners and prompt sections:**
  - An `agent/created` listener must never throw.
  - Prompt sections an add-on installs are tracked and disposed, and wrapped in try/catch.
- **Settings service (server side) is `ctx.get('settings')`:**
  - `describe({redactSecrets})` returns `{ns, revision, value, base, user, secrets}`.
  - The write calls are `update`, `replace` and `mutate(ns, ops[{op:'set'|'unset', path, value}], revision)`.
  - Event: `'settings/document-updated'(ns, revision)`.
  - Only fields marked `.volatile()` in a Config schema are reachable this way. Five add-ons have such fields: modes, model-tiers, cowork-shell, sampling-presets, color-schemes.
  - The client side is `appCtx.remote.settings.mutate(ns, ops, revision)`. On `settings/conflict`, reload and retry.
- **Config editor:** `ctx.get('configEditor').entries()` returns rows with `options.id` and `options.name` (the package).
- **User config file:** `~/.dsh/profiles/desktop/cordis.patch.yml`. The Electron app manages it, so `--dump-config` on `desktop` refuses; that is expected.
- **Folders:** `ctx.get('dshHomePath')('x')` gives `$DSH_HOME/x`.
- **dsh-sync git rules:**
  - Its git allowlist only permits `merge --no-commit` or `merge --abort`.
  - `age` output differs on every run, which is why an encryption cache exists.
  - `session.lock` exists only while a conversation is open.

## 4. How to test

- **Unit tests** for one add-on: `cd addons/<name> && ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test test/*.test.mjs`.
  - Suites exist for swarm (13), benchmark (12), code-map (37), activity (7), diagram (10), evolve (29), learn (9), modes (4), pdf (8), media (15), arena (31), model-tiers (14), notify (13), privacy (3), shared-settings (13) and sync (25).
  - Other add-ons have none yet; adding them is a reasonable improvement.
- **Release check:** `bash scripts/check.sh` runs all tests, then install, re-install, `--settings`/`--no-settings` and uninstall in a throwaway `DSH_HOME`. It must end with "All checks passed".
- **Live lab (app web version, throwaway data):**
  ```bash
  cd spike-lab
  node ../t0-lab/mock-server.mjs 18801 pro mock-pro.log        # mock model server (run in background)
  DSH_HOME=$PWD/home T0_MOCK_KEY=dummy "/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
    --profile web --patch ../t0-lab/t0.providers.yml --no-open --port 3391   # background
  ```
  - `node` here means a Node on PATH, if there is one. Otherwise use the app's Node as above.
  - The sign-in URL with its token is printed in `spike-lab/lab.out`.
  - Open it in the built-in browser and set the viewport to 1280×860. The sidebar is hidden when the window is narrow.
  - Settings is in the bottom-left **More** menu. `/settings` returns 404.
  - Update the lab first: `DSH_HOME=$PWD/home bash ../deepseek-harness-plus/scripts/install.sh --profile web --yes`.
  - When done, stop both processes by PID: `lsof -nP -iTCP:3391 -iTCP:18801 -sTCP:LISTEN`.
  - `MOCK_SCRIPT=<file.json>` makes the mock answer by rule: a list of `{match, reply}` (a regular expression on the last user text) and optionally `tool: {name, args}` to make it call a tool first. `spike-lab/evolve-script.json` is an example that plays a student, a reviewer and a helper that writes a file.
  - `MOCK_DUMP=<folder>` before the mock server command saves every full request as JSON, so you can read the exact prompt and settings a model received.
  - `spike-lab/home` already has tier models set, so it shows the **update** case. For the **fresh install** case make a new profile: `DSH_HOME=$PWD/home-fresh dsh --profile fresh --from-default-profile web --dump-config`, then install with `--profile fresh` and start with `--profile fresh --port 3392`. `home-fresh` and `home-chat` were left in place; both are throwaway.
- **Installing into the real app** quits and reopens it. Do it only when the owner asks.

## 5. Where things stand and what is open

- **0.10.0 is committed (local only) and installed in the owner's app.** Its screens were not yet looked at on the Mac desktop app. `bash scripts/check.sh` passes (7 suites, 115 tests, install, re-install, shared settings, uninstall). What changed:
  - `dsh-model-tiers`: the rework above. Decisions made by the owner: tiers and model versions are **two lists**; sampling is **temperature and max tokens only** for now; the chat box has **one** model control; a fresh install ships **generic starters with no model**. Existing installs keep their tier names and models (one-time carry-over, marker `startersMigrated`).
  - `dsh-cowork-shell`: the Chat tab without folders, and Promote.
  - `dsh-route-health`: its chat-box chip no longer wraps onto two lines.
  - Precedence change: a saved model version's temperature and max tokens are no longer overridden by a Sampling preset.
- **0.11.0 is committed (local only) and installed in the owner's app.** Its screens were not yet looked at on the Mac desktop app. `bash scripts/check.sh` passes (9 suites, 171 tests, 20 add-ons). What changed, from the owner's feedback on 0.10 in the desktop app:
  - **Model panel:** fits the window, opens beside the button when short on room, closes on any outside click (a clear backdrop catches clicks on the Mac window's drag area).
  - **Look:** every Plus settings page restyled to `docs/UI-STYLE.md`; fixed colours removed.
  - **Code tab:** has the same suggestion chips as Cowork.
  - **Arena and Benchmark:** set up and run from their Settings pages. Their settings fields are now volatile and read at use; each has a fenced `POST /dsh-<name>/action` route. Both add-ons now load with incomplete setup.
  - **New add-on `dsh-code-map`.**
  - Facts learned: the app's warning colour variable is `--dsw-alias-state-warn-primary` (`…-warning-…` is empty); the app has two accents (`--dsw-alias-brand-primary` for settings and switches, `--dsw-alias-state-business-primary` for the sidebar and chat-box buttons); Mac window areas marked as drag regions do not deliver clicks, so "click outside to close" needs a backdrop with `-webkit-app-region: no-drag`.
  - Not verified in 0.11: a real model calling the code-map tools or following the skills; a real judge verdict and Cancel in the Arena and Benchmark pages (unit-tested only); the route-health chip on screen; everything on the Mac desktop app.
  - Open from this round: the Swarm page still tells people to edit the settings file (no setup form); native drop-downs keep the browser's own arrow; the first mapping of a folder under `~/Documents` was slow once (over 40 s, then 0.1 s) for an unknown reason; `extras/dsh-intel-mcp` has an older Python code map that overlaps with `dsh-code-map`.
- **0.12.0 is committed (local only) and installed in the owner's app.** It adds `dsh-evolve` only. Not yet tried with a real model or seen on the Mac desktop app. Facts learned while building it:
  - `agent/turn-stopping` is a serial event with `{turn, signal}`; a listener keeps the turn open by steering the agent (`agent.steer(input)`). Not used yet.
  - A helper agent started with `subagents.startActivation({provider: 'spawn', request: {prompt, parent, cwd, agentOptions: {provider, model}}, delivery: 'caller'})` runs fresh (no parent transcript) in its own `cwd`, and `delivery: 'caller'` posts nothing into the parent conversation. **It may only write inside the parent conversation's folder**: a `cwd` elsewhere is refused by the sandbox ("file access denied under workspace-write mode").
  - To give one helper its own prompt text, set a pending value before `startActivation` and claim it in `agent/created` (the next child created); this needs helpers to be started one at a time.
  - **The lab's default workspace is the real folder `~/Documents/deepseek-harness/default-workspace`**, not a folder inside the lab. Anything a lab conversation writes lands there. The evolve test made and removed a temporary `.dsh-evolve-test` folder in it.
  - Not verified in 0.12: a real student and reviewer model (only a scripted mock), judge checks with a real judge, dark mode and other schemes for its page, the Mac desktop app.
  - Next steps the owner may want: mining real conversations for failing cases (with a per-conversation "never send" tag), a schedule that runs a cycle at night, verify-before-stop through `agent/turn-stopping`, helpful/harmful counters per lesson, then the spec's levels 3–4 behind a real sandbox.
- **0.13.0 is committed (local only) and installed in the owner's app.** Not yet seen on the Mac desktop app. Decisions by the owner: a model's instructions live **on the model version**; "replace" means **only the added instructions** (tier, mode, role prompts, shared lessons), never the app's own text; per-mode instructions follow **the app's agent presets**; self-improvement keeps **one set of lessons per version**.
  - `dsh-model-tiers`: versions gain `instructions`, `replace` and `presets`; service methods `sessionVersion` and `instructionsReplaced`.
  - `dsh-modes`, `dsh-role-prompts`: leave out their own text when `instructionsReplaced` is true.
  - `dsh-evolve`: setting `target` (a version id); one store per version under `versions/<id>/`.
  - Facts learned: `ctx.get('agentPresets').presetForSession(session)` gives a conversation's preset (ids `standard`, `ptc`, `minimal`, `cordis` = Creator; the shipped ones have no name of their own). In the browser the list is `remote.agentPresets.list()` → `{presets: [{id, name?, isDefault}]}`, and it is only reachable after injecting `remote.agentPresets` (done optionally with `ctx.inject` inside `apply`).
  - Not verified: PTC, Minimal, Creator and custom presets; the mode prompt and role prompts being left out (same switch, but neither had text in the lab); two versions improved side by side.
- **0.20.0 is committed, pushed and released on GitHub (tag `v0.20.0`, with its DMG), and installed in the owner's app.** It changes `dsh-modes` only, after the owner hit "deep_research found no usable sources" in the Chat tab:
  - **Bug fixed:** a helper agent was treated as a new conversation and got the default mode (with the Cowork sidebar, the tab in use). In Chat that meant no tools, so deep-research searchers could not search. Now `modeOf`, `webOn`, `researchOn` and the new `toolsOff` resolve a helper to its top conversation (`parentSession` in the header, kept in a map), helpers of a conversation with Deep research on get the web tools, and helpers get no mode wording. The mask logic moved to `lib/mask.js` with the add-on's first tests.
  - **New:** `sessionTools` (`{sessionId: false}` = no tools at all) and a Tools button in the chat box with a panel: one switch, plus "can call / cannot call" from `GET /dsh-modes/tools`. The owner asked to be asked at every new conversation; we agreed on the always-visible button instead of a pop-up.
  - **Fact:** `ctx.tools.definitions(agent)` gives the tools an agent can see after restrictions, and `ctx.tools.view(agent).knownNames` everything before them. `web_search` is registered with a condition: a step only gets it while `ctx.web.searchReady()` is true for the model route, so the lab (mock model) never has it.
  - **Also in 0.20:** `dsh-cowork-shell` no longer hides the app's preset picker on a new chat in the Chat tab (it had since 0.10). The owner had a Chat conversation in PTC without knowing: under PTC only `run_code` is callable directly, and the model's first direct calls to `deep_research` failed. The app fixes the preset when a conversation starts; the "Standard mode" label on a started conversation is not a control.
- **0.20.2 is installed in the owner's app (2026-11-12, backup `20261112-130404-install`), committed and released as `v0.20.2` with its DMG; tested in the lab only.** One fix in `dsh-modes`, found while writing the plan below: a conversation opened by the app's scheduler (Automation tasks, target "new" or "new once") was a fresh conversation, so with the Cowork sidebar it took the mode of the tab last selected; in Chat that is no tools. Now `lib/scheduled.js` recognises it from its first inbox message (session event `agent/inbox/spliced`, `data.inserted[].source.kind === 'schedule'`, which arrives before the first turn) and `modeOf` gives it the new setting `scheduledMode` (default `cowork`; unknown id → first mode with all tools). Lab: task made with `schedule_create` (args `title`, `prompt`, `rrule`, `target`), Chat tab selected (`defaultMode: chat`), the run got all 57 tools and no Chat wording, and was recorded as `cowork`. The failing "before" was read in the code, not reproduced. No Settings control yet.
- **Plan for what comes next:** `../PLAN-one-place-for-AI-work.md` (parent folder, not in the repo), written 2026-11-12 at the owner's request: the app already has a scheduler; proposed are an Automations add-on (results list, "needs you", unattended rules, alerts, spending cap) and a Mac add-on (Mail, Calendar, Spotlight; drafts only). The owner has not answered its four questions yet.
- **0.20.1 is committed, pushed and released on GitHub (tag `v0.20.1`, with its DMG), and installed in the owner's app (2026-11-12, `dsh-learn` still off). Tested in the lab only.** The owner asked for the add-ons to be made PTC-aware and tested under PTC. What the lab showed (Cowork conversation, PTC preset, mock model sending `run_code` programs):
  - **Works as it was:** under PTC every add-on tool is in the program SDK and runs from inside a program (`diagram_draw`, `pdf_info`, `learn_status`, `code_map_overview`, `deep_research` and its helpers were tried). A tool's value arrives in the program as `{text: ...}`. Diagrams show during and after the turn. The app's own prompt already says only `run_code` is callable directly, and itself says "use the read tool" under PTC, so the add-ons' wording was not rewritten.
  - **Added in `dsh-modes`:** one note for any agent whose tools are reachable only through programs (`lib/ptc.js`: `programOnly` asks `ctx.tools.selectExecutor(agent).describe([]).knownNames`, which is `['run_code']` under PTC, so custom presets and helpers are covered too). It says to call tools from inside a program and, when a slow add-on tool is reachable, to call it alone with `timeoutMs` at the most allowed. Helpers get the note too. The Tools panel shows a line when the conversation is in PTC (`viaCode` from `GET /dsh-modes/tools`).
  - **Fact:** the app stops a program after 120 s by default and 600 s at most, nested tool calls included (`ctx.get('ptcRuntime').timeout` → `{defaultMs, maxMs}`). A blocking tool that runs for minutes (`deep_research`, the swarm tools) is killed with everything it found. `dsh-deep-research` now ends its searching 3 minutes before that limit when called from inside a program (`lib/budget.js`; a nested call id contains `:ptc:`), so it can still write its report. The swarm tools are not capped. For long research, Standard suits better; the Tools panel says so.
  - **Bug fixed:** under PTC the app keeps offering `run_code` whatever the tool mask says, so with Tools off (or Chat with Search and Deep research off) a program still ran, with an empty SDK. `dsh-modes` now registers `ctx.tools.guard`: when its own mask for the agent is an empty allow list, a `run_code` call is refused with a plain message. Seen in the lab: refused while off, running again after switching on. The model is still *offered* `run_code` (the executor adds it; add-ons cannot remove it).
  - **Not verified:** a real model following the note; a real Deep research run under PTC reaching the time cap; Python-language PTC runtimes; the Mac desktop app.
  - **Lab trap:** the Bash tool's folder can fall back to the repo between calls. Start the lab with absolute paths for `DSH_HOME`, or a new empty home appears inside the repo (it happened once; removed).
  - **Installer:** an add-on the owner switched off in the app is linked in the profile's `package.json` `dependencies` but missing from `dsh.profile.bundles`; `dsh plugin add` leaves it that way. The installer used to treat that as "did not register" and roll back. It now notes which add-ons were off before it starts, accepts them as long as they are linked, prints `off <name>`, and says how many are off. `scripts/check.sh` rehearses this. The owner also has two plugins of his own in that state (`dsh-llm-viz`, `dsh-weightlattice`); they are not part of Plus.
  - Not verified: a real deep-research run finding sources (the lab's mock helpers do not search); the Mac desktop app.
- **0.19.0 is committed, pushed and released on GitHub (tag `v0.19.0`, with its DMG), and installed in the owner's app.** It adds `dsh-learn`, the last of the three pieces the owner asked for (PDF reader 0.17, diagrams 0.18, learning 0.19). The owner chose: adjustable strictness with Firm as default; material from own PDFs and notes, any topic, and code; reviews with a due list and no reminders; studying in any conversation, not a tab of its own. Facts learned:
  - **A slash command cannot start a model turn.** Its handler can only answer `{kind: 'success' | 'error', text}`. `/learn` therefore stores the wish, and the study bar's Start button sends a chat message.
  - **Sending a chat message from an add-on's client:** the study bar (in `conversation.input.dock`) first tries `props.inputActions.setDraft(text)` then `inputActions.submit()` (the `conversation.chat.turnTail` props do carry `inputActions`; whether the dock's do was not checked), and otherwise types into the chat box and presses Enter. Sending worked in the lab; which of the two paths ran was not checked.
  - **Telling the model something before each turn:** `agent.ctx.systemPrompt.section({name, order, interpolate: false, text: () => ...})`; the text function is called for each request, so it can follow a state that changes.
  - The app has a setting "When to collapse work details: On completion" (Settings → General), which is why tool rows fold away after a turn.
  - Not verified: a real model tutoring. The lab played the tutor by hand through the test model server.
- **0.18.0 is committed, pushed and released on GitHub (tag `v0.18.0`, with its DMG), and installed in the owner's app.** It adds `dsh-diagram` only: the second of the three pieces (PDF reader, diagrams, learning plugin). **Next is the learning plugin**, which should use the services `pdfReader` and `diagrams`. Facts learned:
  - **A tool's row in the chat can be replaced:** `ctx.slots.register({name: 'tool.call.toolview', key: '<tool name>'}, Component)`. The component gets `block` (the call and its result) and `phase`. But once a turn is done the app folds tool steps into a closed "Completed in Ns" section (the rows are still in the page, at height 0), so anything that must stay visible also has to be shown through `conversation.chat.turnTail`.
  - **`conversation.chat.turnTail`** components get `sessionId` and `turn` = `{turn, start: {seq, time}, end: {seq, time}, status, steps}`. The tool results are not in those props; the add-on matches drawings to a turn by conversation id and time on the server.
  - Inside a tool, the conversation id is `exec.agent.session.id`.
  - The app may add its own user message (the time, for one) after the person's message; a mock that reads "the last user message" misses the person's text. `/tmp/dsh-asar-tools/slow-mock.mjs` handles this and logs tool names and results to `/tmp/dsh-mock-tools.log` (both in `/tmp`; rewrite if gone).
  - `qlmanage -t` crops SVG previews to a square; `sips -s format png file.svg --out file.png` renders the whole picture (without arrowheads).
- **0.17.0 is committed, pushed and released on GitHub (tag `v0.17.0`, with its DMG), and installed in the owner's app.** It adds `dsh-pdf` only. It is the first of three pieces the owner asked for; the other two are a diagram builder (skill plus render-and-check add-on) and a learning plugin that makes the user attempt first ("do not skip the struggle"), which should use `pdfReader` and the diagram builder. The research behind them is in the session of 2026-11-11 (Bastani et al. PNAS 2025, Kestin et al. Sci Rep 2025, Sinha and Kapur 2021). Facts learned:
  - **macOS can read PDFs with nothing installed:** `/usr/bin/osascript -l JavaScript` with `ObjC.import('Quartz')` gives PDFKit (`PDFDocument`, `page.string`, `outlineRoot`, `thumbnailOfSizeForBox`), and `ObjC.import('Vision')` gives `VNRecognizeTextRequest`, which works without a completion block: perform the request, then read `request.results`. The first recognition after a restart can take about 30 s; later ones well under a second.
  - `page.characterBoundsAtIndex` does not line up with the indexes of `page.string`; do not use it. `selectionForRect(...).selectionsByLine` gives lines, and `page.selectionForRange(NSMakeRange(at, length))` gives one word's place.
  - Add-on tools return text only. An image for the model needs the app's attachment service; the reader instead saves a PNG and the model opens it with the app's `read_image` tool (parameter `file_path`), which refuses when the model has no image input. `read_image` could reach a file under the dsh home.
  - The owner's Mac has no `pdftotext`, no PyMuPDF and no pypdf; `cupsfilter` cannot turn HTML into PDF. `test/make-pdf.mjs` writes a real PDF by hand for tests, and `sips -s format pdf` turns a PNG into a scan-like PDF.
- **0.16.0 is committed, pushed and released on GitHub (tag `v0.16.0`, with its DMG), and installed in the owner's app.** It adds `dsh-activity` only, designed with the owner over four rounds of mock-ups. Facts learned from the installed app (0.2.2-rc.1):
  - **Live model stream:** the agent loop emits `agent/assistant-stream` with `{agent, frame}`; a plain `ctx.on('agent/assistant-stream', ...)` in an add-on receives it. Frames: `start` (request sent), `chunk` (`{time, chunk}`; chunk types `reasoning-delta` and `text-delta` with `text`, `tool-call-delta` with `name` and `argumentsDelta`, `usage`, `finish`), `end`. The session id is `agent.session.id`.
  - **Session events** seen by `session/event`: `turn/start`, `turn/end` (`reason.kind`), `step/start`, `step/end`, `assistant/message` (`usage.inputTokens/outputTokens/cacheReadTokens/reasoningTokens`), `tool/call` (`callId`, `name`), `tool/result` (`message.toolCallId`), `approval/asked` (`id`, `toolName`), `approval/decided`, `llm/retry-started`, `compaction/end`.
  - **Sub-agents:** the tool is called `subagent` (`description`, `prompt`). It returns at once and the helper runs beside the parent, whose next request starts meanwhile. The child's session header carries `parentSession`.
  - **Client slots:** `conversation.input.dock` (a row above the chat box, session-scoped, gets `sessionId`), `conversation.input.left` / `.right` (inside the chat box), `conversation.input.overlay`, `conversation.input.activity`, `shell.overlay` (whole window). The app root is `#root`; giving it `height: calc(100vh - Npx)` makes room at the bottom without breaking the layout.
  - **Lab helper:** `/tmp/dsh-asar-tools/slow-mock.mjs <port>` is a slow model server (2.5 s wait, 3 s of reasoning, 4 s of text, usage). A user text `TOOLTEST <tool> <json args>` makes it call that tool first. It is in `/tmp` and will not survive; rewrite it if needed.
  - Not verified: see the add-on's README ("Not checked").
- **0.15.0 is committed (local only) and installed in the owner's app.** Only `dsh-evolve` changed, at the owner's request (the six example tasks were too easy for a local 35B model):
  - `lib/packs.js`: eight example sets, 104 tasks (reasoning 16, coding 16, structured 12, instructions 12, knowledge 14, writing 14, tools 10, agentic 10). Task ids are `<set>-NN`, family = set id. `test/packs.test.mjs` works out every expected answer and file again.
  - New checks in `lib/verify.js`: `noneOf` (list separated by `|`), `wordCount`, `lineCount` (a number or a range; empty lines are not counted).
  - Page: **Add example tasks** opens a tick-box list (Select all, Add ticked, Remove ticked). Actions `addPacks` / `removePacks` with `{packs: [ids]}`; `status().packs`. The old `EXAMPLE_TASKS` / `exampleTasks` are gone.
  - Behaviour change: real conversations now also get lessons whose family is a set id (before: only `all`, `general` and the mode).
  - Not verified: the sets against a real model (difficulty is a design aim, not a measurement); the tool and agentic sets run end to end; the writing set with a real judge.
- **0.14.0 is committed (local only) and installed in the owner's app.** The owner was asked to confirm with `/privacy`; no answer recorded yet. The installer stops if the app does not quit when asked: have the owner quit it first, never force it. It adds `dsh-privacy` after a privacy audit the owner asked for. What the audit found in the installed app (0.2.2-rc.1):
  - **Usage events** (desktop only, on by default, no control in Settings): row `product-analytics` (`@deepseek-ai/dsh-client-product-analytics`, in the `dsh-web-app` bundle), exported by row `desktop-product-telemetry`. Per message: model name, effort, mode, session id, device and account ids, app version, hardware. Off value: `enabled: false` (volatile).
  - **Conversation upload on feedback**: row `session-telemetry-otel` in `dsh-base`, mode `FEEDBACK_ONLY`, endpoint `dsh-otel-collector.deepseeksvc.com/v1/logs`, no redaction rules mounted. Off: disable the row (what `DSH_TELEMETRY_DISABLED` does) or mode `DISABLED`.
  - **Also contacts the internet, by design:** the updater (`download.deepseek.com`), the DeepSeek account and balance while signed in, the plugin-market index (the owner's points at `dshopen.org`), web search and fetch providers. Conversation titles use the conversation's own model.
  - The CLI has no `desktop` default profile, so the desktop composition cannot be dumped; the two rows were checked in a web-based throwaway profile (`--dump-config` before and after).
  - Not verified: the traffic itself (no capture); the usage-events switch on a running desktop app. Re-audit after any app update.
- **Proposed, waiting for the owner's pick** (listed in the session report of 2026-11-11):
  - a small local relay so top-p, top-k, min-p and repeat penalty can be set per model version (local models only);
  - the Modes page's "default tier" box as a drop-down of tier names (it suggests the internal ids `haiku … code`);
  - one vocabulary across pages ("conversation" and "chat box", not "session" and "composer"; "add-on", not "plugin");
  - readable `/usage`, `/mode` and `/sampling` output (they print one dense line);
  - a "Promote" button in the chat's own header, not only in the sidebar `⋯` menu;
  - a chip, not raw text, for the chat mention that "Continue in a project…" fills in;
  - tests for the add-ons that still have none.
- **Longer-term ideas the owner raised (not started, keep the app light):** a terminal multiplexer pane (like Herdr or Rex), an always-on background agent mode with automations and bots (Hermes-style), and a Kanban board of agent work (Paperclip-style). Existing ground to build on: the app's own Automation tasks (schedules), `dsh-agent-swarm`, `dsh-notify`, tiers with role models.
- **Open decisions:** `docs/REVIEW-2026-11-11.md`, under "Your decisions" items 2 and 4–10 and the shared-settings items 11–12. Items 1 and 3 were settled by 0.10.
- **Not verified:**
  - real `age` encryption, because it is not installed;
  - two real Macs through iCloud;
  - cancelling a real running child agent in the app;
  - 0.10: hiding the tools of a real connector per tier (the lab had no MCP server running), project profiles and role lanes in the new chat-box panel beyond rendering, "Continue in a project" as Cowork, the Chinese strings, and everything on the Mac desktop app (only the web version was used).
- **Shared settings on the owner's Macs:** not switched on yet. To switch on: `bash scripts/install.sh --settings "$HOME/Library/Mobile Documents/com~apple~CloudDocs/DeepSeek Harness Plus"`, or run `Install.command` and answer y.
- **Packaging (later, not started).** The recommended shape is a DMG with a signed "Install DeepSeek Harness Plus" app, not a rebuilt DeepSeek Harness. Blockers:
  - an Apple Developer ID, which the owner must get;
  - a licence choice;
  - a test on another Mac.
- **Supported app versions:** the installer accepts DeepSeek Harness 0.2.2 up to, but not including, 0.3. A 0.3 release needs a compatibility pass.
