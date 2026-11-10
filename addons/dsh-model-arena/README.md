# Model arena

Host plugin `@local/dsh-model-arena` (dsh 0.2.2-rc.1). Ask **one prompt to several models at once**, read the answers under **shuffled labels** (A, B, C, D) with no model name anywhere, let a **blind judge** and **you** pick, then **reveal** who wrote what, with latency and token counts. **Nothing is configured by default**: with no candidates the plugin does nothing; a bad config fails at load.

The commands and the service are the way to ask, judge, pick and reveal. Settings > **Arena** (below) shows the rounds side by side, read-only. Live streaming columns and a vote button are deliberately not built.

## Configuration

```yaml
- id: model-arena
  config:
    candidates:                       # list at least two, or none to leave the arena off
      - { id: <ID>, provider: <ROUTE>, model: <MODEL ID>, reasoningEffort: <EFFORT> }
    maxContestants: 4                 # 2 to 4 answers per round; a longer list is sampled at random
    blindByDefault: true              # false = show names at once (same as always using --open)
    redactNames: true                 # hide candidate ids and model names if an answer says them
    judge: { provider: <ROUTE>, model: <MODEL ID> }   # only needed for `/arena judge`
    criteria: []                      # empty = accuracy, completeness, clarity, relevance
    consistencyCheck: true            # judge twice, second time in reversed order
    limits: { timeoutMs: 120000, maxTokens: 0 }       # per contestant; maxTokens 0 = not set
    storeDays: 30                     # rounds older than this are deleted
    dataDir: <ABSOLUTE_DIR>           # optional; default is a folder in the dsh home
    commandName: arena
```

## Use

| Command | What it does |
| --- | --- |
| `/arena ask [--with id,id] [--open] [--blind] <prompt>` | Asks the contestants in parallel and prints the answers under labels only. `--with` picks exact candidates (2 to `maxContestants`). |
| `/arena judge [round]` | A blind judge compares the answers and names a winner by label, with average scores. |
| `/arena pick <label> [round]` | Records your own choice. |
| `/arena reveal [round]` | Shows label to candidate (provider/model), latency, tokens, the judge's and your pick, and whether you agree. |
| `/arena show [round]`, `list`, `delete <round>` | Re-read a round (blind until revealed), list rounds, delete one. |

Without a round id, a command uses the latest round. Service `modelArena`: `candidates`, `run`, `view`, `judge`, `pick`, `reveal`, `list`, `delete`.

## How blindness is kept

- Labels are assigned by a **fair random shuffle** (`crypto.randomInt`) per round; the order is saved and shown only on reveal.
- Output before reveal has **no model, provider, candidate id, latency or token count**.
- A contestant failing shows `(no answer: timed out | route unavailable | request failed)`, a generic word, never the error text.
- If an answer names a candidate id or model (for example "I am ..."), the name is replaced by `[model]` in what you and the judge see (`redactNames`).
- The judge shuffles again on its own labels, so it never sees your labels either. Its own reasoning is not shown, because it would use its own letters.
- **Same-family note**: if the judge's provider or model equals a contestant's, the result carries a warning, without saying which contestant.

## Judge

The judge is the **same one as in Code power** (`candidateJudge` service: shuffled labels, reversed-order consistency check, the owner's Arena judge prompt), so the project has one judge. Load `dsh-code-power` to use `/arena judge`. The judge is called through `ctx.llm.stream` on `judge.provider/model` at temperature 0, with no sub-agent and no tools. If the two rounds disagree the result is a tie flagged as split.

## Settings page

The same page also opens as a full page from the sidebar (**Model Arena**). The Cowork sidebar lists it under the Chat tab.

Settings > **Arena** lists your rounds (newest first, with blind / judged / picked / revealed chips) and lays the selected round out in **one column per label**: the redacted answer text, a generic failure word if a contestant failed, the judge's average score for that label, a marker on the judge's pick and on yours. After `/arena reveal` the column header also shows candidate id, provider/model, latency and tokens, and whether you and the judge agree.

The page keeps the test blind exactly as the commands do: before reveal, the route that feeds it carries no model, provider, candidate id, latency or token count (a unit test and a check against the running route search the JSON for them). The candidates' names are never sent to the page at all, only how many there are. **No live streaming**: while a round is being asked the page shows only "N of M answers in", not which ones, because text arriving live or the order of finishing would show which model is fastest, which is the bias a blind test removes. A finished round appears as soon as it is saved. Rounds poll every 10 seconds (2 seconds while one is running).

It reads two fenced, GET-only routes of the host half: `GET /dsh-model-arena/rounds` and `GET /dsh-model-arena/round?id=<id>` (login cookie and Host/Origin check; the id must look like `20261110120000-a1b`). The page cannot ask, judge, pick or reveal: use `/arena`. It does show your own prompt and the model answers, to a fenced caller only. Needs one app restart to load.

Host change: `run()` now also keeps a per-round counter of answered contestants while a round runs (no names, no text). 24 unit tests pass (3 new: the fence and GET-only checks, blindness before and after reveal, and the running counter that names no one).

Tested in a throwaway web profile with three seeded rounds (a failed contestant, a revealed round with a disagreeing judge, an unjudged round): route statuses (401, 405, 400, 404), the blind JSON checked for names, the page text for blind, revealed and failed rounds, and column layout numbers. **Not tested:** looking at the page by eye (the browser pane was hidden, so no screenshot; layout was checked by measuring), light theme, narrow widths, a round that is really running, real models, the desktop app.

## Data

One file per round, `arena-<id>.json`, written atomically with mode 0600, holding the prompt, the answers, the label order, timings, tokens, the judge result and your pick. It holds **no key and no setting**. Old rounds are deleted at startup and after each round.

## Routes and failures

A route that Route health reports as down is skipped (shown as `route unavailable`) instead of waiting for a timeout. One contestant failing never stops the others. A round with fewer than two answers cannot be judged.

## Checked

21 unit tests (shuffle, redaction, no leak of names in output, failure and timeout isolation, parallelism, sampling, route-down skip, judge wiring and same-family note, pick/reveal, persistence, pruning, file mode) and a mock run in a real dsh headless profile (3 contestants with one unreachable, judge consistent and split, reveal, command registered). Not tested: real models (do they reveal themselves in ways the redaction misses), long answers, the cost of many rounds.
