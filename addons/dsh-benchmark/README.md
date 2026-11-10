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

Settings > **Benchmark** shows what the plugin has measured, read-only: the suites you can run, a list of jobs (state, progress, errors, start time), and for the job you pick a report table (category, target, temperature, max tokens, runs, seeds, score with a bar, spread across seeds, latency, errors, cost; click Score, Spread, Latency, Errors, Cost, Temp or Max tokens to sort), a **Recommended** or **Low confidence** tag on each pick, the total cost, the list of picks with their caveats, and the sampling-presets fragment the export would write, with a Copy button. A cell where every request failed shows dashes instead of a score. Distinct error messages (at most five, 200 characters each) are shown so you can see why runs were not scored. The page polls every 3 seconds while a job runs and every 15 seconds otherwise.

It reads two new fenced, GET-only routes of the host half: `GET /dsh-benchmark/jobs` and `GET /dsh-benchmark/report?job=<id>` (same login cookie and Host/Origin check as the other browser halves; the job id must look like `20261110090000-1`, so no file name can be built from other input). They return scores, timings, token counts and costs; never prompts, answers or keys. Nothing can be started, cancelled or changed from the page. Needs one app restart to load.

Tested in a throwaway web profile with three seeded job files (one with an unreachable target, one marked running): routes 401 without a cookie, 403 for a wrong Host, 405 for POST, 400 for a bad or missing id, 404 for an unknown job; the table, sort, the picks, the export text, dark and light. Not tested: a job that is actually running (progress and the 3-second refresh were not watched live), the Copy button on a normal browser (the embedded pane denied clipboard access, so only the select-the-text fallback ran), narrow widths, the desktop app.

## Not done

- **Starting or cancelling a job from the page**: the Settings page is read-only (see below); use `/bench run` and `/bench cancel`. **`ctx.jobs` integration** is also not done: jobs run in this plugin's own background task and do not survive a Host restart (finished jobs do, as files; a running job's partial runs are not saved).
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
