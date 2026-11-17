# Brief: @local/dsh-tuning

What it is for: Tuning Plus: keeps every checked step of your work as a training row with its proof, builds named data sets and a private exam from them, and turns them into better instructions, adapters and small tuned models on this Mac, each tested on the exam before you are asked. Off until you switch it on.

This brief was written by Creator Plus from the plugin's own files. Its README below is the full description, complete enough to rebuild the plugin from; improve this brief by hand, with the user's yes.

## What it must keep doing

- Its tools: tuning_status, tuning_plan, tuning_start, tuning_export_set.
- Its settings: enabled, harvest, folder, python, models, teacher, teacherCloud, providers, anthropicOpenEnded, nightShift, idleMinutes, nightMinutes, nightTrain, examLimit.

## Its README

# Tuning Plus

Plugin `@local/dsh-tuning` (dsh 0.2.2-rc.2). Models that learn from your work. It is the plan "Tuning Plus plan for models that learn from your work" (see `docs/TUNING-PLUS-T0.md` for what already existed and the nine places where this build differs from the plan, each decided for you and easy to undo).

Off until you switch it on in **Settings → Tuning Plus**, and then each mode is read only when you switch that mode on there. Training runs only on this Mac, from a Python with Apple's mlx-lm that you install yourself; Tuning Plus installs nothing and downloads no model.

## What it does

Every checked step of your work (a tool call whose tests passed, a claim you ruled on, a draft you edited and approved, a device that read back, a query that answered a saved analysis) is kept as a **training row** with its **proof**. One row in five goes to a private **exam** made from your own work; code chooses which (a salted hash of the row), and an exam row never trains anything. The rest builds named **data sets**. From them Tuning Plus proposes the cheapest fix that could help, and only then trains:

| Rung | What | Where it lives |
| --- | --- | --- |
| 0 | Fix the harness (a tool, a plugin, a setting) | Creator Plus |
| 1 | Instructions | Learned skills and Self-improve |
| 2 | Example bank | the Voice Library for writing |
| 3 | Tuned prompt | Self-improve |
| 4 | Adapter: a small add-on trained on a set, on this Mac | Tuning Plus |
| 5 | Small specialist: a much smaller model for one role | Tuning Plus |

Nothing is used until it beats the exam by a clear margin (5 points), is not worse on the general canaries (the Benchmark add-on's 12 small tasks, 2 points of slack), and you say yes.

## What it learns from

Each mode has its own switch, and each starts off.

| Mode | Rows |
| --- | --- |
| Code | tool calls whose tests passed, finished runs, a failed call beside its fix, Mission items whose check passed |
| Content | your rulings on claims (never a claim brought in from Recon), and your edits beside the writer's drafts from the Voice Library |
| Research | a passage and the claim it supports, only from a source that was opened; source grades |
| Finance and Data | a question and the query that answered it, when the analysis was saved or run again with nothing moved |
| Bench | what a device reports and the recipe that fitted, for devices whose read was checked; never a write command |
| The work loop | each step and the cheapest model that passed it (for the router) |
| Corrections | in any mode: the answer before you corrected it beside the answer after |
| Creator Plus | a brief and the plugin that passed its checks; an error, its cause and its fix (from `<app data>/creator-plus/builds/*.json` when Creator Plus writes them) |
| Other tabs | tool calls of turns that finished with no failed call and no correction |

Never read: Recon; a conversation that received an export from Recon (it fails closed: a conversation whose log cannot be read for the mark is left out); the helpers of either; a conversation marked "never learn from this" on Learned skills; Self-improve's own test runs; the trash; and when the Modes add-on is off, nothing at all (it cannot tell Recon apart). Your own folders are never read for rows.

Passwords, keys, tokens, Bearer headers, private keys and e-mail addresses are masked before a row is stored; your home folder becomes `~`.

## May it train?

Set by code for each row, and shown per set on the page:

- never a row from Recon, never one from a signed-in source (a connector), never one whose secrets could not all be masked;
- each provider has a switch (starts yes); text written by Anthropic's models does not train adapters that write open-ended text unless you switch that on (narrow tools such as judges and routers are allowed). The planner is not a lawyer: read each provider's own terms.

## The page and its bar

**Settings → Tuning Plus**: the switches, then the **bar**: Model, Goal (Harness, Voice, Judge, Know a subject, Fast, Find what helps), Data sets, Method (Auto picks the lowest rung that passes), Budget, and **Look only** (on by default: it reports and trains nothing). Under the bar, the run in one sentence. Results come as **cards** (Taste test, Promote, Not now, Do not suggest this again). Then the data sets (each can be written out for the trainer), the exam, **the shelf** (adapters and tuned prompts with their exam results; Switch on/off in one action), the trainer's Python and the base models' folders, the teacher model, the "may train" switches, and the night shift.

A run of rung 4 or 5: checks the Python and the base model folder (a full path with `config.json`; a name to download is refused), needs at least 20 rows that may train and 10 exam rows, writes `train.jsonl` and `valid.jsonl` (one row in ten) into its own work folder, takes the exam with the model as it is, trains with `mlx_lm lora` (offline: no download), takes the exam again with the adapter, runs the canaries, and checks that the base model's files did not change (a fingerprint before and after). The result is a card; promotion is your click.

## Serving an adapter

Your model server may not load adapters (the common MLX model servers skip adapter folders). Two ways, both by your click, nothing starts by itself:

- **Make a fused copy**: `mlx_lm fuse` folds the adapter into a new model folder beside it (the base model is never changed); add it in Settings → Models like any model.
- **Serve with mlx-lm**: mlx-lm's own server with the adapter beside the base model, on 127.0.0.1 only; stopped by its own process number.

Then save its address (provider and model as in Settings → Models). A team in Settings → Model Tiers can name a shelf entry for a role (`adapter: "<shelf id>"`); it is used only while the entry is switched on and has an address, and the role falls back to its own model otherwise.

## Taste test

Your recent requests (from the logs, never Recon's or an export's) are answered by the model in use and by the candidate, with names hidden; you pick A, B or the same. Your picks decide promotion together with the exam, and each pick is kept as a preference pair.

## The night shift

Off until you switch it on. It works only while this Mac is on power and has been unused for 15 minutes (it reads `pmset` and the idle time), and stops the moment you use it. It gathers, sorts, builds lessons and questions, finds the weakest spot, proposes the lowest rung, and trains only the sets you allowed on the page, within its time limit (120 minutes). It never promotes anything: you find cards in the morning.

## Lessons and questions

- **Plugin lessons**: worked examples of each plugin's tools (calls that worked, fewest calls first, arguments checked against the tool's own schema), written to `lessons/<plugin>/` in Tuning Plus's folder and into Creator Plus's passport for a third-party plugin when that passport exists. Never into an installed add-on's folder. When a plugin's tools change, the harness adapter is marked due for a rebuild.
- **Questions from reference material**: a teacher model writes questions and answers from the passages of read sources; a second call checks each one, and only checked ones are kept. A teacher on the internet reads rows only when you ticked that.

## Tools in the chat

| Tool | What it does |
| --- | --- |
| `tuning_status` | the sets, the exam's size, the shelf, what is running. Read only |
| `tuning_plan` | look only: a plain-words request as one sentence, the sets it would use, what the exam says today, the lowest rung that could help. Trains nothing |
| `tuning_start` | a run you asked for, after the app's own approval card with the run in one sentence. Refused in helpers |
| `tuning_export_set` | writes one set out for the trainer, in Tuning Plus's own folder |

They are offered only while Tuning Plus is on, and not in an isolated conversation.

## For other add-ons

Service `tuning` (`apiVersion` 1): `examGate({ route, before, after, signal })` takes the owner's exam with two versions of instructions and says whether the new one is not worse (2 points of slack). It answers undefined when Tuning Plus is off or has fewer than 10 exam rows that fit, and then the caller does what it did before. A model on the internet is examined only on rows written in conversations with that same provider: rows that never left this Mac are not sent out. `adapterRoute(entryId)` gives the provider and model of a shelf entry only while it is on and served; `adapters()` lists the shelf's entries with their state.

## Where it keeps things

`tuning` in the app's data (or the folder you set): `rows/<mode>.jsonl`, `exam/<mode>.jsonl`, `sets.json`, `shelf.json` and `shelf/<id>/`, `cards.json`, `state.json`, `exports/`, `work/`, `lessons/`, `taste/`. Rows are appended; nothing is written through a link.

## Limits

It is a ratchet, not infinity. One person's use makes few rows: a narrow skill needs hundreds, so some sets take months. Training does not teach facts well: facts are looked up (Know a subject builds retrieval first). What a model is trained on can come back out of it: adapters stay private. Training takes the Mac. A new base model empties the shelf; the sets stay, and everything is rebuilt from them (each through its exam again). An exam can be gamed: exam rows never train, the exam keeps growing, and the taste test asks you.

## Tests

```
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test --test-timeout=60000 test/*.test.mjs
```

Stand-ins and made-up rows only; never against the real app data. The installer leaves the test folder out of an installed copy: run them from the Plus folder.
