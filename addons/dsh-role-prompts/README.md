# Role prompts

Host plugin `@local/dsh-role-prompts` (dsh 0.2.2-rc.1). It adds instruction sections you write to the system prompt of every Agent, in an order you choose, optionally only on chosen tiers.

**Nothing is configured by default**: `sections` is empty, so installing the plugin changes no prompt. Ready-made texts are in `examples/` (`planning.txt`, `coding.txt`, `routing.txt`); they are examples to copy, not defaults.

## Configuration

```yaml
- id: role-prompts
  config:
    sections:
      <NAME>:
        enabled: true          # false removes the section from the next step on
        order: 60              # ascending; Tier's own section is 70
        appliesToTiers: []     # tier ids; empty = every tier, otherwise only those tiers
        text: |
          <YOUR INSTRUCTIONS>
```

- Each section is a separate prompt section named `role-prompts:<NAME>`. Suggested orders so tier text follows role text: planning 60, coding 65, routing 72 (after Tier at 70).
- `appliesToTiers` needs the Tier plugin (`modelTiers` service); without it a section restricted to tiers is not added.
- The text is inserted literally: `{{...}}` in it is not treated as a prompt variable.
- Prompt text is model-visible and logged with the rest of the system prompt.

## Not implemented

- The spec's `mode: replace` (replacing the whole system prompt). dsh allows only one "complete" section and fails prompt assembly if two exist, so it was left out.
- Measuring the prompt against a token budget (use `token-meter`).
- A Settings page; edit the profile patch.

## Verified (mock setup, rc.1)

Sections appear in the model request in `order` relative to Tier's section; a section restricted to `opus` appears only on that tier; `enabled: false` hides it; `{{not_a_variable}}` stays literal; the three example texts load.
