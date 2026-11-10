# Model Tiers

Five built-in Claude-Code-style model tiers for DSH, plus additive custom tiers. Each tier has a model, effort level, internet policy, and sub-agent policy. Sampling defaults are defined once per model route and shared by every tier using that model.

## Custom tiers

**Settings → Model Tiers → Custom tiers** adds tiers without modifying the five built-ins:

- **Copy** on any built-in tier to fork its model, effort, and access flags into an editable custom tier.
- **New tier**, **Duplicate**, **Move up/down**, and **Delete**.
- Name and two-character badge.
- Role summary and free-form tier instructions injected while the tier is active.
- Primary model plus optional model variants.
- Effort, web search, web fetch, browser, and sub-agent policy.

Custom tier IDs are stable (`custom-…`), and deleting a custom tier leaves the built-ins and model profiles intact. Sessions pinned to a deleted custom tier fall back to normal route matching.

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

## Model profiles

**Settings → Model Tiers → Model profiles** defines sampling defaults for a `provider/model` pair:

- **Wire effort** — a specific adapter-advertised reasoning effort, or Auto to let the tier behavior choose the nearest one.
- **Temperature** — 0–2, or Auto for the adapter/model default.
- **Max tokens** — positive integer, or Auto.
- **Enabled** — disable a profile without deleting it.

Profiles are keyed by route, so the same local or cloud model gets the same defaults in Haiku, Sonnet, Code, custom tiers, or any later tier. The first visit to Settings, or opening the composer selector, imports the built-in and custom tier routes into the registry. The tier cards show which model defaults apply.

Precedence: session override → model profile default → adapter default. Selector fields marked Auto inherit the model profile; unchecking Auto writes a session-specific override.

| Tier | Default model | Default effort | Intended use |
|---|---|---|---|
| Haiku | `omlx-max/claude-haiku` | Low | Fast search, small edits, quick checks |
| Sonnet | `omlx-max/claude-sonnet` | Medium | Balanced planning and everyday coding |
| Opus | `omlx-max/claude-opus` | High | Hard reasoning |
| Fable | `omlx-max/Qwen3.8-27B-TURBO-Fable-…` | Medium | Long-context, exploratory work |
| Code | `omlx-max/claude-opus` | Ultra Code | Review, check, and fix code only |

## Use it

- **Composer:** a **Tier** control sits at the left of the composer tool row. It shows the project profile, a searchable model picker, an effort slider, temperature, and max-output-tokens for the current Session. Pick a tier preset, or choose any catalog model and then slide effort from **Off** through **Ultra Code**; the effort commits when you release it.
- **Settings → Model Tiers:** change every built-in tier's defaults, create custom tiers, and manage model profiles and project profiles. The page also sets the global concurrent sub-agent cap and the Ultra Code auto-delegation policy. Settings holds defaults only; a per-Session slider move does not rewrite them.

Tier definitions persist in the active profile patch through the normal settings service. Per-Session choices are stored as objects in `activeTiers`, so a custom model or custom effort does not rewrite the tier defaults.

## Sampling

The selector controls the model route, reasoning effort, **temperature**, and **max output tokens**. Temperature and max tokens default to **Auto**, which inherits the model profile for that route; with no profile they fall back to the adapter default. Unchecking Auto writes a session-specific override. A model profile may also pin **wire effort**, in which case that advertised effort wins over the tier behavior mapping; otherwise the tier behavior chooses the nearest effort.

The OMLX/OpenAI-compatible and DeepSeek adapters serialize temperature, max tokens, and effort. The plugin does not expose `top_p`, `top_k`, `min_p`, `presence_penalty`, `frequency_penalty`, or repetition penalties: DSH's call config has no fields for them, so they are owned by the inference server (OMLX model configuration) or by the cloud provider.

Reasoning effort is protocol-dependent: the adapters send an effort only for models that advertise one. Local OMLX models with no reasoning metadata still get the behavior prompt, but no provider-side thinking budget. Temperature and max output tokens are independent of that and are forwarded for any model whose adapter accepts them.

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
| `listTiers()` | `TierInfo[]` in deck order: `id, label, provider, model, effort, webSearch, webFetch, browser, subagents, custom` |
| `resolveTier(sessionId)` | the tier the Agent is on (session choice, current route, or a fallback route of a tier), or `null` |
| `setSessionTier(sessionId, tierId)` | the single write path: records the per-session choice (same entry the composer writes), selects the tier's route and effort with `agent.model.select()` for the next step, emits `tier/changed`. Throws for an unknown tier or session. If Settings refuses the write (for example the Tier row comes from a `--patch` overlay) the choice is kept in memory for this run and a warning is logged |
| `roleRoute(tierId, role)` | `{provider, model}` for `plan`, `implement`, `review` or `fast`, or `null`; throws for another role |
| `fallbackChain(tierId)` | `{provider, model}[]` in order, empty when none |
| `sessionSampling(sessionId)` | the `temperature` and `maxTokens` the user set for this Session in the composer (never model-profile defaults), so other plugins do not override an explicit choice |
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

A tier may set `maxSubagents` (1 to 8) to override the global `maxSubagents` for that tier; leave it unset to use the global value. In `cordis.patch.yml` it is a field of `tiers.<id>`; custom tiers take it in their `customTiers` JSON entry. The effective cap is used by the tier prompt text, the concurrency gate (`subagent`, `subagent_fork`, `delegate_role`, `review_lanes`, `run_pipeline` and tools added with `registerSubagentTool`), and `TierInfo.maxSubagents` in the `modelTiers` service. The Settings page has no field for it yet.

A new Session's tier prompt section is now resolved from the Agent's current route, so the first step carries it. Before, it appeared only from the second step.

A composer-selected tier is now matched to its fallback and role routes by its tier id (before, `selection.tierId` was read where only `selection.id` exists, so those matches never succeeded for composer-selected tiers).
