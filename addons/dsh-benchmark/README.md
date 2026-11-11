# Benchmark

Host plugin `@local/dsh-benchmark` (dsh 0.2.2-rc.1). It runs **your prompt suites** over a grid of **targets** (model routes; a server alias id such as an oMLX profile `<model>:<name>` is just another target), **temperatures**, **output caps** and **seeds**, grades every answer, and reports score, spread across seeds, latency, tokens and cost per cell. It then recommends the best cell per category and target and exports it as a `dsh-sampling-presets` fragment. **Nothing is configured by default**: with no targets or suites it does nothing; a bad config fails at load.

It is a separate plugin and does not touch Bench Lab (a community plugin; its runner, registry and panel stay as they are; Bench Lab's profile ids can be used as targets). Model calls go through dsh (`ctx.llm.stream`), so provider keys stay in dsh: this plugin holds **no token or key** and its saved files contain none.

## Configuration

```yaml
- id: benchmark
  config:
    dataDir: <ABSOLUTE_DIR>            # optional; default is a folder in the dsh home
    targets:
      - { id: <ID>, provider: <ROUTE>, model: <MODEL ID>, reasoningEffort: <EFFORT> }
    suites:
      <SUITE>:
        category: <CATEGORY>           # becomes the category in the export
        prompts:
          - id: <ID>
            prompt: '<TEXT>'
            system: '<OPTIONAL TEXT>'
            grader: { type: contains, expect: '<TEXT>' }     # exact | contains | regex | judge
          - { id: <ID>, prompt: '<TEXT>', grader: { type: judge, rubric: '<WHAT A GOOD ANSWER IS>' } }
    grid: { temperature: [0.2, 0.7], maxTokens: [1024], seeds: 3 }   # empty lists = do not set that value
    judge: { provider: <ROUTE>, model: <MODEL ID> }                  # needed only for judge graders
    pricing: { '<ROUTE>/<MODEL ID>': { inputPerMTok: <USD>, outputPerMTok: <USD> } }   # unlisted models cost 0
    limits: { maxParallel: 1, timeoutMs: 120000, maxJobMinutes: 60, maxCloudUsdPerJob: 0 }   # 0 = no spend cap
    export: { minSeeds: 3, scoreTolerance: 0.02 }
    commandName: bench
```

`maxParallel` defaults to 1 because one large local model fits in memory at a time (your Bench Lab rule).

## Use

`/bench run <suite>` starts a background job and returns its id; `/bench status [job]`, `/bench report <job>`, `/bench export <job>`, `/bench cancel <job>`, `/bench list`. Each job is saved atomically as `bench-<id>.json` (config-free: runs only). Service `benchmark`: `start`, `status`, `cancel`, `report`, `exportPresets`, `list`.

## How results are judged

- **Errors are never scored**: a request that fails or times out is an error row, counted in `errors` and left out of the score, so an unreachable model cannot look like a bad one.
- **Score** is the mean grader score (0 to 1; judge scores 1 to 5 are scaled). **±seeds** is the standard deviation of each seed's mean score.
- **Recommendation** per category and target: the highest mean score; among cells within `scoreTolerance` of it the lowest mean latency, then the lowest cost. It is marked **low confidence** with the reasons when it has fewer than `minSeeds` seeds, a spread above 0.15, or any errored run.
- **Export** writes only confident picks, as `presets:` named `<category>-<target>` plus a `categories:` hint, for you to merge into the sampling-presets config. Nothing is applied automatically.

## Settings page

Settings > **Benchmark** now sets the add-on up and runs it; no file editing is needed.

**Your first run, in three steps** (shown at the top until there has been a run): pick the models to test, create a suite, press Run.

**Setup** (saved as you change it, applied at once, no restart):

| On the page | Setting | What it does |
| --- | --- | --- |
| Models to test | `targets` | Add models from the app's model list, set an effort for each, remove them |
| Suites | `suites` | **New suite** or **Add an example suite** (two simple prompts). A suite has a name, a category and prompts. Each prompt has what to ask and how to grade the answer |
| How to grade | `grader` | **Contains this text** (`contains`), **Is exactly this text** (`exact`), **Matches a pattern** (`regex`), **The judge scores it** (`judge`, 1 to 5 against your description of a good answer). Each has a one-line explanation under it |
| Temperatures, Max output tokens, Repeats | `grid` | Lists separated by commas; empty uses each model's default. Repeats is `seeds` |
| Judge model | `judge` | Only for prompts graded by the judge |
| At the same time, Time limit per answer, Longest run, Spend limit per run | `limits` | `maxParallel`, `timeoutMs` (shown in seconds), `maxJobMinutes`, `maxCloudUsdPerJob` |
| Prices | `pricing` | US dollars per million tokens in and out, per model; 0 removes the entry |

**Run and results:** choose a suite and press **Run**; the line beside it says how many model calls the run makes, or what the suite still needs ("prompt "p1" has no text"). A running job shows its progress and a **Cancel** button. The results table, the recommendations and the text for the Sampling page are as before.

**How it is wired:**

- The form reads and writes the add-on's own settings through the app's settings channel (namespace `benchmark`; on a `settings/conflict` it reloads and retries once). `targets`, `suites`, `grid`, `judge`, `pricing` and `limits` are `.volatile()`, and the host half reads them at every use (`readSetup`). The YAML shape is unchanged.
- The add-on now always loads. Before, it did nothing until targets and suites were set, and a mistake in a suite stopped it at start. Now a suite that cannot run is logged, shown on the page with the reason, and refused by `/bench run`. A job uses the limits and prices in force when it starts.
- Buttons go to one write route, `POST /dsh-benchmark/action`, body `{ action: run, suite }` or `{ action: cancel, id }`. Same fence as the read routes (login cookie and Host/Origin check), POST only, at most 16 KB of JSON, the suite name and job id are checked before use.
- The read routes are unchanged and GET-only. `GET /dsh-benchmark/jobs` now lists each suite with its prompt count, what it still needs, and how many calls a run makes. They still carry no prompts and no answers; the page reads the prompts you wrote from the settings channel, not from these routes.

## Not done

- **`ctx.jobs` integration** is also not done: jobs run in this plugin's own background task and do not survive a Host restart (finished jobs do, as files; a running job's partial runs are not saved).
- **Judge cost** is not added to the job cost or the spend cap.
- **Top-p, min-p and other server-side sampling** cannot be swept from dsh (it sends only temperature and max tokens); sweep them with server-side profile aliases as targets.
- Cost uses prices you supply; there is no live price lookup.
- The scored engines of Bench Lab's own plan (EvalScope, Harbor, item banks) are not part of this plugin.

## About Bench Lab's `runnerToken`

Spec hazard 4: the `benchlab` row in your live profile patch holds the runner token in plain text. This plugin does not use or change it, and I did not touch `~/.dsh`. Rotate that token and move it to dsh's credential store when you next edit that profile.

## Verified (rc.1, mock model, throwaway home)

54-run job (3 targets, one unreachable, 2 temperatures, 3 prompts including a judge grader, 3 seeds): the unreachable target's 18 runs were errors and unscored; the flaky high-temperature cell scored 0.667 against 1.0; cost followed the supplied prices; the recommendation and the exported presets were correct; the spend limit stopped a job after 2 runs; a duplicate target id fails at load; saved files hold no secrets. Unit checks cover graders, statistics, summary, recommendation and export.

## Not verified


Real models (every answer was scripted), long jobs, the `/bench` command in the web app, cancel mid-run, parallelism above 1, and whether the exported presets improve real work.

## Checked (0.10 setup page, throwaway web profile, mock models)

- **Unit tests:** 12 (the add-on had none): graders, statistics, what a prompt still needs, settings read live, loading with nothing or with a mistake in the file, a full job with one failing model (errors never scored), the read routes (fence, GET only, id check, no prompt or answer in them), the write route's refusals (no login, wrong method, unknown action, bad suite name, bad or unknown job id, broken JSON, oversize body, unknown suite), run and cancel through the route.
- **Live, starting from an empty config:** added two models, made a suite on the page (prompt, grading, name, category), added the example suite, set two temperatures and two repeats, ran the suite (8 calls, finished, results table and recommendations shown), set limits and a price and saw the cost appear in the next run. The settings landed in the profile's `cordis.patch.yml` in the documented shape.
- A name with a slash was refused with a plain message. Switching the way of grading to the judge and back kept the text (a bug found and fixed during the check).
- **`/bench list`** in a chat still works.
- **Look:** checked in the stock scheme (dark) and Forest (dark and light).

**Not checked:** Cancel on the page (the mock answers at once, so no job stays running; cancel is covered by a unit test); a judge-graded prompt with a real model; the spend limit stopping a real run; the Chinese strings (new texts fall back to English); a narrow window for this page specifically (it shares its layout rules with the Arena page, which was checked at 900 px); the Mac desktop app.
