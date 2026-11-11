# Model Tiers

Two lists that work together, plus the one model control of the chat box:

- **Tiers** are ways of working. A tier sets how hard the model thinks (effort), what it may reach (web search, web fetch, browser, sub-agents), how many sub-agents it runs, its own instructions, the skills it loads and the connectors it may use. Five **starter tiers** ship: Fast, Balanced, Deep, Creative and Code review. You can add your own.
- **Model versions** are named copies of a model with their own effort, temperature and max output tokens, for example "Qwen – Writing" and "Qwen – Coding". The plain model always stays available with default settings.
- A tier can point at a model version, at a plain model, or at no model at all. A tier with no model applies its rules to whatever model the conversation is on.

**No models are preconfigured.** A fresh install has five starter tiers with no model.

## The chat box control

One button beside the send button shows the model (or version) and the effort. It opens one panel:

- **Search and list:** saved versions first, then every model by provider. Picking a plain model always gives default settings.
- **Effort slider:** Off, Low, Medium, High, Extra high, Ultra Code. It applies when you let go.
- **Tier:** one chip per tier. "Reset" forgets this conversation's tier and settings; the model stays.
- **Sampling:** temperature and max output tokens for this conversation. **Save as new version…** keeps the settings in use under a name; **Update "name"** writes changes back into the version in use.

The panel fits the window: it opens above the button when there is room, otherwise beside it on the left, centred on the button, and the model list shrinks before anything else scrolls. A click anywhere outside closes it, including on the part of the Mac window that drags the window (a clear sheet behind the panel catches the click).

The app's own model menu is hidden while this add-on is on (it comes back when the add-on is switched off). The control uses the app's own model directory, so `/model` and the button always agree.

## Starter tiers and your tiers

**Settings → Model Tiers → Starter tiers** has one card per starter:

| Field | What it does |
|---|---|
| Name | Your own name for the starter. Empty uses the built-in name |
| Instructions | Given to the model whenever the tier is active. Empty uses the starter's built-in guidance |
| Model | Optional. One list; its first entry is "No model: keep the model the conversation is on". A search box shows only when there are more than 12 models. "Type a model by hand" opens two fields for a provider and model id that are not in the list |
| Effort, Access | As before: effort level, web search, web fetch, browser, sub-agents |
| Model version | A saved version that supplies the tier's model and sampling |
| Sub-agents | "Ask for at least" (an instruction to the model) and "allow at most" (enforced; empty uses the app-wide cap) |
| Skills loaded with this tier | Up to 6 skills whose text is added to the model's instructions while the tier is active (8,000 characters each; longer text is cut with a note) |
| Connectors | All, or only the MCP servers you tick. Tools of the others are hidden from the model, and refused if called anyway |

**Your tiers** adds tiers without changing the starters: **New tier**, **Copy** on a starter, **Duplicate**, **Move up/down** and **Delete**. They have the same fields, plus a two-character badge, a role line and model variants. Ids are stable (`custom-…`). A conversation on a deleted tier falls back to normal matching.

A model that belongs to a tier (its own model, a variant, a fallback or a role model) gets that tier's rules even when you only picked the model.

## Model versions

**Settings → Model Tiers → Model versions**: "New version of…" a model, then set a name, effort, temperature (0–2) and max output tokens. Empty fields mean "default". Each row says which tiers use it. Versions can also be saved from the chat box.

What applies, strongest first: a value set in the chat box for this conversation → the saved version in use → the adapter default. The **Sampling presets** add-on never overrides the first two.

The app sends only `temperature` and `maxTokens`. `top_p`, `top_k`, `min_p` and the penalties cannot be sent by this app version: they stay on the model server (verified in the installed app's `llm-pi-ai` adapter).

### Instructions on a version (0.13)

A version can carry its own instructions, so one model can be set up for different jobs:

- **Instructions for this version** are given to the model whenever the version is in use, in any mode.
- **Use only these** leaves out the other *added* instructions while the version is in use: the tier's own instructions and effort wording, the Chat / Cowork / Code mode's prompt, and the role prompts. The app's own text about its tools always stays, and so do the tier's limits (internet access, sub-agent cap), because they describe what will actually work.
- **Instructions per app mode**: the app's modes are its agent presets, picked above the chat box of a new conversation (Standard, PTC, Minimal, Creator), plus any you add in Settings → Agent presets. Each can have its own text for this version, either **added** to the version's instructions or **used alone** (which replaces the version's instructions and the other added instructions for that mode).

How it is decided, for the mode a conversation is in: a mode text marked "use only this" stands alone; otherwise the version's text and the mode's text are both used, and "Use only these" on the version decides whether the tier, mode and role instructions are left out. A switch with no text replaces nothing.

Stored on the version as `instructions`, `replace` and `presets: { <preset id>: { text, replace } }` (at most 4,000 characters per text). The service gains `sessionVersion(sessionId)` and `instructionsReplaced(sessionId)`; Modes, Role prompts and Self-improvement ask the second one before adding their own text.

Checked live with the mock model, read from the requests it received: the version's text and the Standard-mode text both arrived; with "Use only these" off, the tier's instructions were there too; with it on, they were gone while the version's text stayed. The preset of a conversation is read with `agentPresets.presetForSession`. Not checked: the PTC, Minimal and Creator modes, a mode of your own, and the mode prompt and role prompts being left out (both add-ons call the same switch; neither had text set in the lab).

## Carry-over from before 0.10

On the first start after an update, once:

- a starter tier that already has a model keeps the name it had (Haiku, Sonnet, Opus, Fable, Code), stored as its Name;
- old per-model defaults ("model profiles") that set something become model versions named "… (saved settings)", and the tiers on that model point at the new version. Empty profiles are left alone and no longer shown.

The marker is `startersMigrated`. Old per-model defaults that remain still apply to conversations that use no version.

## Project profiles

**Settings → Model Tiers → Project profiles** defines named tier decks and assigns them to DSH Workspaces:

- Each profile selects a subset of built-in/custom tiers and a default tier.
- A project assignment makes that profile the project default.
- The composer profile selector can override the project default for one Session.
- New Sessions in a profiled project inherit the profile's default tier once.
- Existing pinned Sessions keep their tier; changing profile does not rewrite tier definitions.
- Deleting a profile clears its project assignments and falls back to all tiers.

Profiles only filter the selector and supply defaults. They do not change Host routing, tier definitions, or model profiles.

## Fallback chains

Each built-in or custom tier can have an ordered fallback chain in **Settings → Model Tiers**. Fallbacks are attempted only after normal request recovery (including `llm-retry`) declines:

- Primary/variant route first.
- Fallback routes in order on request failure.
- Each fallback uses its own model-profile sampling where available.
- The tier's access, sub-agent, effort, and prompt rules stay in force.
- The cursor resets on the next step or turn.

Fallbacks are stored separately in `fallbackChains`; an empty chain preserves the previous single-route behavior.

## Role models

Each tier can bind optional **Plan**, **Implement**, **Review**, and **Fast** role routes in Settings. The `delegate_role` tool starts one child Agent on the selected role model:

- The child keeps the parent tier's access, sub-agent cap, effort, and prompt rules.
- Role routes are matched back to their owning tier, so a child on the Review route still gets the tier's review policy.
- The tool returns the child's final text, stop reason, and child id.
- No automatic role routing happens; the model chooses `delegate_role` when it fits the task.
- Empty role slots do not change primary/variant or fallback behavior.

Role routes are stored separately in `roleModels`. Configured roles also appear as one-click **Role lanes** in the composer, applying that role route to the current Session while keeping the tier policy.

## Multi-lane review

When the active tier has a **Review** role configured, `review_lanes` starts up to three independent review children in parallel:

- Angles: correctness/regressions, security, tests/edge cases, performance.
- Defaults to correctness, security, and tests.
- Each child runs on the tier's Review role model and keeps the tier's access policy.
- Availability respects the current sub-agent cap and already-running children.
- The tool returns one consolidated report with per-lane findings, child ids, and failures.
- The parent still owns synthesis and verification.

Empty Review role routes leave `review_lanes` unavailable; no existing tier behavior changes.

## Pipeline orchestration

`run_pipeline` sequences three role children on the active tier:

1. **Plan** — investigate and return an implementation plan without edits.
2. **Implement** — make scoped changes in the current workspace and report checks.
3. **Review** — inspect the result and report findings; skipped when review is disabled or no Review role exists.

It requires Plan and Implement role routes. Stages run sequentially, respect the tier's sub-agent policy and cap, and return each stage's text plus child ids. The parent still owns final synthesis, verification, and any fixes.

## Health diagnostics

**Settings → Model Tiers → Health** is a read-only view of:

- tier, role-route, fallback, project-profile, and active-session counts;
- primary/variant/fallback/role routes missing from the current model catalog;
- fallback chains that repeat the primary route;
- active sessions pinned to deleted tiers;
- project assignments pointing at missing profiles;
- profile defaults pointing at missing tiers.

It can copy a plain-text report and never mutates configuration.

## Backup & restore

**Settings → Model Tiers → Backup** exports and imports the portable configuration:

- Built-in tier models, effort, and access flags.
- Custom tiers.
- Model profiles and sampling.
- Project profiles and assignments.
- Fallback chains.
- Role routes.
- Sub-agent cap and Ultra auto-delegation.

Exports exclude session pins and per-session profile overrides. Imports are **merge-only**: choose the sections to apply, matching entries are updated, and entries absent from the file are preserved. A live preview validates the JSON and shows how many setting updates will be written.

## Where things are stored

Tier settings are saved through the app's settings service into the active profile. Starters are `tiers.<id>` (ids `haiku, sonnet, opus, fable, code` are kept for existing installs; people see the names). Your tiers are the JSON list `customTiers`, versions the JSON list `modelVersions`. What each conversation picked is `activeTiers`: `{ tier, version?, provider, model, effort, temperature?, maxTokens? }`.

## Effort mapping

The slider has six plugin levels: **Off, Low, Medium, High, Extra high, Ultra Code**.

DSH only accepts reasoning efforts an adapter advertises. The plugin maps each level onto the nearest advertised effort (`off`/`none`/`minimal`, `low`, `medium`, `high`, `xhigh`/`max`, `ultra`). When the model advertises no reasoning metadata, the level still controls the injected behavior prompt but no `reasoningEffort` is sent.

**Ultra Code** additionally tells the model to decompose the task, start independent sub-agents in one message, keep working while they run, avoid busywork, own the final synthesis, run the narrowest proving checks, review the final diff, and state which checks it ran. The sub-agent cap is enforced in flight; the delegation push itself is prompt-driven, because DSH cannot force a model to call a tool.

Each tier also carries a short behavior prompt: Haiku favors fast, narrow changes; Sonnet balances planning and implementation; Opus takes the harder reasoning path; Fable explores and synthesizes broadly; Code restricts itself to review, check, and fix.

## Code tier

The Code tier's prompt restricts it to review, check, and fix work: start from the diff or named files, run the narrowest checks that prove the change, report findings by severity with `file:line`, then fix and re-run. It does not plan new product scope.

## Access gating

Enforced on the Host before dispatch:

- `web_search` requires the tier's Web search toggle.
- `web_fetch` requires the tier's Web fetch toggle.
- Browser tool names and `bash` commands that invoke `ego-browser` require the tier's Browser toggle.
- `subagent`, `subagent_fork`, `workflow`, and `spawn_teammate` require the tier's Sub-agents toggle; direct child starts also enforce the global concurrent cap (default 4, range 1–8).

## How routing works

The selected model is applied through the existing `session.selectModel` Remote. The Host derives the effective selection from the requested provider/model plus the Session's recorded override. An override records `{ tier, provider, model, effort, temperature?, maxTokens? }`: the tier supplies internet/sub-agent defaults, while the route and request controls can differ from that tier's defaults. If the Session's actual route no longer matches the override, the Host falls back to a configured tier that matches the route, or applies no tier rules. When two tiers share the same provider/model, the recorded tier wins; otherwise the first matching tier in Haiku → Code order wins.

## Install

From this profile:

```text
plugin_manager install_bundle target=/absolute/path/to/model-tiers
```

The bundle vendors its two runtime schema packages under `node_modules/` so the Host half can load from a workspace directory without network access.

## dsh 0.2.2-rc.1 compatibility (T1)

This copy differs from the linked original in how it applies routes:

- Reasoning effort is recorded with `agent.model.select()` when an Agent is created or resumed and before each step. It takes effect at the next step prepared; the first step of a new Session is covered by the `agent/created` call.
- The deprecated `agent/request` hook no longer changes provider, model or effort (rc.1 throws if it does). It only sets `temperature` and `maxTokens` from model profiles and per-Session overrides.
- Fallback chains (T2) work at the next message: rc.1 fixes the route for a step and its retries, so a failed step cannot retry on another route. When a step fails terminally on a tier's route, Tier records the next route of the tier's chain with `agent.model.select()`; the failed step ends with the provider error and your next message uses the fallback. A route listed only in a tier's fallback chain keeps that tier (prompt, access gates, effort). There is no automatic return to the primary route and no user-visible banner yet (route-health, spec 4.3). Headless `--session-id` resume re-records the configured route, so it discards the switch; the web app keeps it.

## `modelTiers` service (T3)

Other plugins read tiers and change a session's tier through the service `modelTiers`, provided with `ctx.provide('modelTiers', ...)`. Get it lazily with `ctx.get('modelTiers')`; it is absent when Tier is not loaded. All returned objects are frozen. The existing remotes are unchanged.

| Member | Behaviour |
|---|---|
| `apiVersion` | `1` |
| `listTiers()` | `TierInfo[]` in deck order: `id, label, provider, model, effort, webSearch, webFetch, browser, subagents, maxSubagents, minSubagents, version, skills, connectors, custom`. `provider` and `model` are empty for a tier with no model |
| `listVersions()` | the saved model versions: `id, name, provider, model` and the settings each one sets |
| `resolveTier(sessionId)` | the tier the Agent is on (session choice, current route, or a fallback route of a tier), or `null` |
| `setSessionTier(sessionId, tierId)` | the single write path: records the per-session choice (same entry the composer writes), selects the tier's route and effort with `agent.model.select()` for the next step, emits `tier/changed`. A tier with no model keeps the session's current model. The tier's version sampling applies. Throws for an unknown tier or session. If Settings refuses the write (for example the Tier row comes from a `--patch` overlay) the choice is kept in memory for this run and a warning is logged |
| `roleRoute(tierId, role)` | `{provider, model}` for `plan`, `implement`, `review` or `fast`, or `null`; throws for another role |
| `fallbackChain(tierId)` | `{provider, model}[]` in order, empty when none |
| `sessionSampling(sessionId)` | the `temperature` and `maxTokens` the user chose for this Session: values set in the chat box, and those of the saved version the Session is on (never the old per-model defaults), so other plugins do not override a choice |
| `advanceFallback(sessionId, {skip?})` | moves a Session to the next usable route of its tier's fallback chain for the next step; `skip(route)` passes over routes (route health uses it for routes known to be down); returns `{tierId, from, to}` or `null` |
| `restorePrimary(sessionId, tierId)` | moves a Session back to the tier's primary route (its composer choice when it selected that tier); returns `{from, to}` or `null` when already there |
| `registerSubagentTool(name)` | subjects a tool that starts child Agents to the tier's sub-agent switch and concurrency cap; returns a disposer |
| `on('tier/changed', (sessionId, from, to) => void)` | fires for service calls and for changes made in the composer (detected at the next step); returns a disposer; throws for another event name |

Listener errors are logged and do not reach the caller. The per-session override held in memory is cleared when the Agent is disposed.

## Housekeeping (T4, part 1)

- `engines.dsh` is `>=0.2.2-rc.1 <0.3.0`. dsh refuses an incompatible bundle at profile start and skips it, so on a dsh bump Tier stays off until this range is updated after re-reading the upgrade guides.
- `pruneStaleSessions` (default on): when the first Agent exists after start, Tier removes `activeTiers` and `sessionProfiles` entries whose Session is no longer stored (`sessionPersistence.stat` returns nothing). Live Agents and Sessions whose existence cannot be confirmed are kept. It writes once through Settings.
- `registerSubagentTool` (the tool-gate registration API) shipped with the T3 service.
- Decision (owner): per-session state (`activeTiers`, `sessionProfiles`) stays in Settings, written through the revision-checked Settings API. It is not moved to `dsh-storage`; pruning bounds its growth. Revisit only if write races are observed.

## Per-tier sub-agent cap (T5)

A tier may set `maxSubagents` (1 to 8) to override the global `maxSubagents` for that tier; leave it unset to use the global value. In `cordis.patch.yml` it is a field of `tiers.<id>`; custom tiers take it in their `customTiers` JSON entry. The effective cap is used by the tier prompt text, the concurrency gate (`subagent`, `subagent_fork`, `delegate_role`, `review_lanes`, `run_pipeline` and tools added with `registerSubagentTool`), and `TierInfo.maxSubagents` in the `modelTiers` service. The tier cards have a field for it ("allow at most").

A new Session's tier prompt section is now resolved from the Agent's current route, so the first step carries it. Before, it appeared only from the second step.

A composer-selected tier is now matched to its fallback and role routes by its tier id (before, `selection.tierId` was read where only `selection.id` exists, so those matches never succeeded for composer-selected tiers).

## Checked (0.10, throwaway web profile, mock model)

- **Unit tests:** 12 in `test/tiers.test.mjs` (starters without a model, versions, the plain model keeping defaults, tier rules on any model, prompt text, no model names in the bundle patch).
- **Chat box:** the panel opens above the button inside the window; the slider set High and the button showed it; picking a tier with a version switched model, effort and temperature; a failed switch shows its error and puts the earlier choice back.
- **Save as new version:** created a version from a temperature set in the chat box; the plain model stayed in the list with default settings.
- **End to end**, read from the exact request the model received: model and temperature (0.9) of the tier's version, effort Low, the tier's instructions, the text of the chosen skill, "Connectors are switched off", and the "at least 2 sub-agents" line. A Sampling preset (0.1) did not override the version's temperature.
- **Carry-over:** a profile that already had tier models kept the names Haiku … Code.
- **Settings:** every tab renders; version create, rename, effort and temperature edits were saved; the skills list came from the app.

The Settings page follows `docs/UI-STYLE.md` (the app's own fonts, fields, cards, switches and tabs; colours only from the app's variables). Checked in the Forest scheme, dark and light.

**Not checked:** hiding the tools of a real connector (the lab has no MCP server running; only the "none allowed" prompt line and the code path were exercised); project profiles and role lanes in the new panel beyond rendering; the Chinese strings; the Mac desktop app; a model with real thinking levels beyond the mock's.
