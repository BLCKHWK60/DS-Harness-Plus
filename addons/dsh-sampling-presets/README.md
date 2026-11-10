# Sampling presets

Host plugin `@local/dsh-sampling-presets` (dsh 0.2.2-rc.1). Named sampling presets chosen per **task category**, per **mode** or per **session**. **Nothing is configured by default**: with no presets the plugin does nothing; a config that names something that does not exist fails at load.

## What dsh can and cannot send

dsh sends only `temperature` and `maxTokens` per request. There is no `top_p`, `top_k`, `min_p` or penalty field, and `stop` is refused by the pi-ai adapter (`UNSUPPORTED_OPTION`), so this plugin has no `stop`. Anything else lives in your inference server. Two delivery paths follow from that:

| Strategy | What it does |
|---|---|
| `in-dsh` | the deprecated `agent/request` hook (its only remaining job on rc.1; it keeps provider, model and effort exactly) sets `temperature` and `maxTokens` from the preset |
| `server-alias` | a preset can name a **model alias** (`perModel[<provider>/<model>].aliases[<preset>]`); at a turn boundary the plugin selects that model id with `agent.model.select()`, so your server applies its own sampling settings for that alias. It only moves between the base model and its own listed aliases; a route you choose yourself is never touched |
| `mixed` (default) | both |

Whether your server can hold several sampling profiles for one model (spec question 15) is yours to know: this plugin just switches between model ids you list, and each alias must also exist in your provider config.

## Which preset applies

1. the category: `/sampling <category>` for this session, else the Modes mode through `byMode`, else `defaultCategory`;
2. `categories[<category>]` names the preset;
3. `perModel[<provider>/<model>].allowedPresets`, when non-empty, can forbid it for that model (the model then runs with its normal sampling).

**Precedence with Tier**: a preset overrides Tier's model-profile defaults whichever plugin loads first (tested both orders), but never a temperature or max-token value you set for the Session in the Tier composer (`modelTiers.sessionSampling`). Tier's `modelTiers` service must be the copy with `sessionSampling` (`plugins/dsh-model-tiers`).

## Configuration

```yaml
- id: sampling-presets
  config:
    presets:
      <NAME>: { temperature: <0 to 2>, maxTokens: <TOKENS>, notes: '<WHY>' }
    categories: { <CATEGORY>: <PRESET NAME> }      # for example code, plan, chat, research, summarize
    byMode: { <MODE ID>: <CATEGORY> }              # with the Modes plugin
    defaultCategory: <CATEGORY>
    perModel:
      '<ROUTE>/<MODEL ID>': { allowedPresets: [<NAME>], aliases: { <NAME>: <ALIAS MODEL ID> } }
    strategy: mixed
    commandName: sampling
```

## Use

`/sampling` shows the category, preset, values, alias and strategy for this session; `/sampling <category>` forces a category; `/sampling auto` returns to the mode or default. Service `samplingPresets`: `list()`, `effective(sessionId)`, `setCategory(sessionId, category|null)`.

## Settings page

Settings > **Sampling** edits everything above without YAML: presets (name, temperature 0 to 2, max tokens, note), categories (preset per category), per-mode rules (mode id, category; mode ids suggested from the Modes plugin), the default category, the strategy (In dsh / Server alias / Both) and the optional per-model rules (allowed presets, alias per preset). Renaming a preset or category follows every reference to it. It will not save a name that is empty or duplicated, a temperature outside 0 to 2, max tokens that are not a whole number from 1 to 1,000,000, a reference to a preset or category that does not exist, or a model rule that is not `provider/model`. It writes through the settings channel in one save, so there is no half-saved state.

This needed one change in the host half: `presets`, `categories`, `byMode`, `defaultCategory`, `perModel` and `strategy` are now `.volatile()` (Settings forms only expose volatile fields), so a save applies at once without reloading the plugin. The YAML shape is unchanged and existing config files keep working. Needs a restart of the app once to load.

Tested: in a throwaway web profile (add, rename with cascade, validation message, save written to the profile patch as normal YAML, values still there after a restart, dark and light, 420 px wide) and end to end in a throwaway headless profile: the plugin was loaded with `presets: {}`, a settings edit added a preset, and the first model request carried that temperature and max tokens (0.33 / 1234) with no restart. Not tested in the desktop app.

## Limits

- An alias is a different model id, so Tier no longer recognises the route as its tier unless the alias is also a tier route or variant; the tier prompt and gates are lost while an alias is selected. Prefer `in-dsh` presets when you use tiers heavily.
- A model switch (alias on or off) happens at a turn boundary, never mid-turn, but it still triggers dsh's model-switch handling and may discard the server's KV cache for the session.
- Category changes through the Modes selector are noticed at the end of the next turn (the plugin reconciles when the Agent goes idle).
- Because the six editable fields are now volatile, the plugin no longer exits early when there are no presets (it installs its hooks and does nothing until a preset applies). `validateConfig` still runs at load: a config file that names something that does not exist fails at start. The Settings page checks the same references before it saves, so a save cannot create that state.

## Verified (rc.1, mock model, throwaway home)

Temperature and max tokens reach the request from the preset (0.1 / 1500). A Tier model profile (0.9 / 3000, shown to apply alone) is overridden in either load order. A composer temperature is respected while the preset still sets max tokens. The alias strategy moved the first step to the alias model (with the preset's temperature); `in-dsh` ignores aliases; a forbidden preset leaves normal sampling. Unit checks cover preset picking and the load-time validation.

## Not verified

oMLX behaviour with real aliases (the spec's own acceptance: the server's request log shows the changed sampling); mode-driven category changes in a running session; the `/sampling` command in the web app; multi-session behaviour; the spec's `stop` field (deliberately dropped).
