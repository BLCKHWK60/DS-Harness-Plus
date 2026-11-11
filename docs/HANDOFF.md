# Handoff: DeepSeek Harness Plus

Written 2026-11-11, updated the same day after the 0.10.0 and 0.11.0 work. For the next working session. Read this first. Then read only the files the task touches.

## 1. What this is

**DeepSeek Harness Plus** is 20 add-ons for the **DeepSeek Harness** desktop app (Electron, Cordis plugin framework), version **0.2.2-rc.1**, on macOS. The add-ons install into the app's data folder (`~/.dsh/addons/deepseek-harness-plus`) and register with the app's own `dsh plugin add`. The app itself is never modified.

- **Repo:** `deepseek-harness-plus/`. It is a git repository, local only, with no remote. The latest commit is Release 0.11.0 (the one after `c790464`, Release 0.10.0). `VERSION` reads `0.11.0`.
- **Installed in the owner's real app:** 0.11.0, 20 add-ons. The backup is `~/.dsh/backups/deepseek-harness-plus/20261111-165636-install`.
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
6. **Licence:** "Decide later". Do not add one.
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
  - Suites exist for swarm (13), benchmark (12), code-map (37), media (15), arena (31), model-tiers (12), notify (13), shared-settings (13) and sync (25).
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
