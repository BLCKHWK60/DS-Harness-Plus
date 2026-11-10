# Provider routes: template, not defaults

`providers.example.yml` is a template for `llm-pi-ai` provider routes. It carries **no connection settings and nothing that varies between users**: no addresses, route names, key names or model ids. Every `<PLACEHOLDER>` is filled by whoever uses it, and nothing applies it automatically.

How to use it:
1. Copy the file, fill every `<PLACEHOLDER>`, repeat the route block for each server or gateway.
2. Check it without touching `~/.dsh`: `templates/providers/check.sh <your-file.yml>` (refuses unfilled placeholders, composes the headless profile in a throwaway home).
3. Merge the entries into the profile's `cordis.patch.yml`. A patch replaces a row's whole `config`, so merge by hand into an existing `llm-pi-ai` row.

Secrets: `apiKeyEnv` is the name of an environment variable or credential reference, never the key.

Defaults in the template: `defaultContextWindow: 65536`, `defaultMaxTokens: 8192` (raise them to what your server serves).

**Known interaction (verified on 0.2.2-rc.1 with mock servers):** with a window of 65,536 tokens or smaller, switching to that route fails with `MODEL_SWITCH_COMPACTION_FAILED`, because dsh keeps 65,536 tokens of compaction headroom by default. The template therefore includes a `compaction-basic` row with `headroomTokens: 8192`; with it the same switch succeeds. Remove that row only if all your routes have larger windows.

Not covered here: reasoning-effort settings per model (they depend on the server; see the commented `reasoningEfforts` line), the OpenCode Zen route (skipped by decision), and per-machine route layouts.
