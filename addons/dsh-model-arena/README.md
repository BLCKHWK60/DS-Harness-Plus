# Model arena

Host plugin `@local/dsh-model-arena` (dsh 0.2.2-rc.1). Ask **one prompt to several models at once**, read the answers under **shuffled labels** (A, B, C, D) with no model name anywhere, let a **blind judge** and **you** pick, then **reveal** who wrote what, with latency and token counts. **Nothing is configured by default**: until you pick at least two models (Settings > Arena, or `candidates` in the config) the arena only shows its setup page.

Everything can be done on the page: **Settings > Arena** (or **Model Arena** in the sidebar) has the setup form, an Ask box, and Judge, Pick and Reveal buttons. The `/arena` commands and the `modelArena` service work as before. Live streaming columns are deliberately not built.

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

**Setup** (saved as you change it, applied at once, no restart):

| On the page | Setting | What it does |
| --- | --- | --- |
| Models to compare | `candidates` | Add models from the app's model list, set an effort for each, remove them. At least two are needed. The id is made from the model's name |
| Judge model | `judge` | Optional. A model that compares the answers blind |
| Judge twice | `consistencyCheck` | A second reading in reverse order; a different result is a tie |
| What the judge looks at | `criteria` | Words separated by commas; empty uses accuracy, completeness, clarity, relevance |
| Answers per round | `maxContestants` | 2 to 4; with more models, each round draws that many at random |
| Hide the names until I reveal | `blindByDefault` | Off shows names at once for `/arena ask` in a chat. Rounds asked on the page are always blind until you press Reveal |
| Remove model names from answers | `redactNames` | Replaces a model's own name by `[model]` |
| Time limit per answer, Longest answer | `limits` | Seconds (stored as `timeoutMs`), and max output tokens (0 = no limit) |
| Keep rounds for | `storeDays` | Days |

Until two models are picked, Setup sits at the top of the page; after that, Ask and the rounds come first and Setup moves below.

**Ask and the rounds:** type a question, press **Ask the models**; the round shows "N of M answers in" while it runs, then one column per label. **Pick this answer** on a column records your choice, **Ask the judge** runs the judge, **Reveal the models** shows who wrote what with speed and tokens, **Delete round** asks once more first. A refused action says why in plain words (no judge set, the judge gave no usable verdict, and so on).

**How it is wired:**

- The form reads and writes the add-on's own settings through the app's settings channel (`remote.settings.describe` / `mutate`, namespace `model-arena`; on a `settings/conflict` it reloads and retries once). The fields above are `.volatile()` in the Config schema, and the host half reads them at every use (`readSettings`), so nothing is captured at load. The YAML shape is unchanged; existing config files keep working.
- A config with one contestant, or none, now loads (it used to stop the add-on at start): it is a setup in progress. A repeated id in a hand-written file still stops it.
- Buttons go to one write route, `POST /dsh-model-arena/action`, body `{ action: ask | judge | pick | reveal | delete, id?, prompt?, label? }`. It sits behind the same fence as the read routes (login cookie and Host/Origin check), accepts POST only, reads at most 64 KB of JSON, accepts only those five actions, and checks the round id (`20261110120000-a1b`) and label (A to D). `ask` answers with the round id as soon as the models are being asked; the page then follows the round through the read routes. Its answers never name a model: names come only from the read route, and only after reveal.
- The read routes are unchanged and GET-only: `GET /dsh-model-arena/rounds` (now also says whether a judge is set and whether the judge service is loaded) and `GET /dsh-model-arena/round?id=<id>`. Before reveal they carry no model, provider, candidate id, latency or token count.
- The Setup area shows which models are in the arena, because you chose them. It never shows which model wrote which answer.

## Data

One file per round, `arena-<id>.json`, written atomically with mode 0600, holding the prompt, the answers, the label order, timings, tokens, the judge result and your pick. It holds **no key and no setting**. Old rounds are deleted at startup and after each round.

## Routes and failures

A route that Route health reports as down is skipped (shown as `route unavailable`) instead of waiting for a timeout. One contestant failing never stops the others. A round with fewer than two answers cannot be judged.

## Checked

21 unit tests (shuffle, redaction, no leak of names in output, failure and timeout isolation, parallelism, sampling, route-down skip, judge wiring and same-family note, pick/reveal, persistence, pruning, file mode) and a mock run in a real dsh headless profile (3 contestants with one unreachable, judge consistent and split, reveal, command registered). Not tested: real models (do they reveal themselves in ways the redaction misses), long answers, the cost of many rounds.

## Checked (0.10 setup page, throwaway web profile, mock models)

- **Unit tests:** 31 (7 new): settings read live, unusable entries dropped, the write route's refusals (no login, wrong method, unknown action, bad or missing id, unknown round, broken JSON, oversize body, empty prompt, fewer than two models), ask / pick / reveal / delete through the route with no name in any answer, the judge through the route with a stand-in judge service.
- **Live, starting from an empty config:** picked two models and a judge on the page; asked a round; picked an answer; revealed; the settings landed in the profile's `cordis.patch.yml` in the shape documented above and were still there after a restart. Every option (effort, answers per round, both switches, criteria, time limit, longest answer, days) was changed on the page and checked in the file.
- **`/arena list`** in a chat and the sidebar **Model Arena** page still work.
- **Look:** checked in the stock scheme (dark) and Forest (dark and light), and at a 900 px wide window; no sideways scrolling.

**Not checked:** a judge verdict with a real model (the mock model does not answer the judge's question in the needed form, so the page showed the plain "could not give a verdict" message; the success path is covered by a unit test with a stand-in judge); a long-running round on the page (the mock answers at once); the Chinese strings (new texts fall back to English); the Mac desktop app.
