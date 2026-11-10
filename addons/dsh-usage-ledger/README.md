# Usage ledger

Host plugin `@local/dsh-usage-ledger` (dsh 0.2.2-rc.1). It counts model **requests and tokens per day, provider and model**, with a free-model flag. It stores numbers only: no prompt, response or tool text, and no session id.

## How it counts

One `assistant/message` session event is one request (an interrupted message counts as a request too). Token fields come from the event's `usage`: input (uncached), output, cache read, cache write, reasoning. Only live events count; resuming a session does not recount its history (checked). Auxiliary model calls that dsh makes outside a session step (for example the session title) do not produce an `assistant/message` and are not counted.

Data is one JSON file, `usage-ledger.json`, written atomically (every few seconds when there is news, and when the plugin stops). Days older than `retentionDays` are dropped when the plugin starts.

## Configuration

```yaml
- id: usage-ledger
  config:
    enabled: true            # counting is on by default; it only observes and stores numbers
    retentionDays: 365
    freeModels: []           # patterns on "provider/model"; `*` matches any characters, e.g. 'myroute/free-*'
    modelAliases: {}         # { '<model id>': '<name to record>' }: rows are recorded under the alias target
    dataDir: <ABSOLUTE_DIR>  # optional; default is a folder in the dsh home
    commandName: usage
```

`freeModels` has no default and is evaluated when you read the ledger, so changing it re-labels history. The spec's `countAliases` flag is replaced by `modelAliases`, because only you know which model id is an alias of which.

## Use

- `/usage` prints requests and tokens per model for the last 30 days (`/usage 7` for 7 days), with `(free)` on free models.
- `/usage reset` clears every count.
- Service `usageLedger`: `summary({days})` returns `{days, models, totals}`; `reset()`.

## Usage card (browser half, `client.js`)

A **Usage** page in Settings (between Models and the other sections): period buttons (7, 30, 90 days, year), totals (requests, input, output, cache read, reasoning, free-model requests), a requests-per-day bar chart with empty days filled in, and a per-model table with the free flag and a share bar. It reads the host half's read-only route `GET /dsh-usage-ledger/summary?days=N` (N from 1 to 365, else 30) behind dsh's connection fence (login cookie plus Host/Origin check; 401 without the cookie, 405 for any method but GET), and refreshes every 15 s while the tab is visible. The route returns numbers only. A client change needs the host restarted.

Verified in a throwaway web profile with a seeded 45-day ledger: the route (401, 405, `days` handling and totals matching the card), the card in dark and light, and the 7-day switch. **Not verified:** the desktop app itself, narrow widths, and live counting shown in the card while a real session runs (counting itself was verified earlier).

## Not done

- The Usage card is read-only: it cannot reset the ledger (use `/usage reset`) and shows requests and tokens only (no money; see below).
- Cost in money is not computed (the spec's ledger counts tokens and the free flag only).
- The ledger lives in a JSON file, not in `dsh-storage` (the domain API needs typed domain declarations that a plain-JS plugin does not have).

## Verified (rc.1, mock model, throwaway home)

Requests and tokens counted per `provider/model`; the `freeModels` pattern flagged the right row; a tool-call run added two requests; resuming a session added only its new request; an old day was pruned; the file contained none of the prompt text; the service `summary()` worked from another plugin.

## Not verified

The `/usage` command output in the web app (same registration pattern as `/routes`), several processes writing at once, and real provider usage fields (cache and reasoning tokens) from a live provider.
