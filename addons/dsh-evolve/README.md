# Self-improvement

Plugin `@local/dsh-evolve` (dsh 0.2.2-rc.1). It makes a model better at your kind of work by improving the **instructions it is given**, never the model itself.

- You supply **test tasks** and how to tell a good result.
- A **reviewer model** studies what goes wrong and proposes small changes.
- Each change is tested on tasks the reviewer never saw. It only reaches you if it measurably helps and breaks nothing.
- **You approve every change.** Every version is kept and can be put back with one click.

Nothing is preconfigured: it does nothing until you pick a model and add tasks on **Settings → Self-improvement**.

## How to use it

1. **Setup.** Pick the model to improve (usually a local one) and a stronger model as reviewer. Both come from your model list in Settings → Models.
2. **Tasks.** Add tasks from your real work, or press **Add example tasks** to try it. Each task has a prompt, a "kind of work" name, one or more checks, and a group:

   | Group | What it is for | Does the reviewer see it? |
   | --- | --- | --- |
   | Learn | The reviewer studies what fails here | Yes: the prompt, an answer and why it failed |
   | Check | Proves that a change helps | Never |
   | Guard | Things that work today and must keep working | Never |

3. **Measure** runs every task several times and shows the score.
4. **Run a cycle** measures, asks the reviewer, and tests each proposed change. Changes that clear every gate appear under **Changes waiting for you** with the reason and each gate's result. **Approve and use** makes a new version; **Decline** drops it.

`/evolve` in a chat shows the state; `/evolve measure`, `/evolve improve` and `/evolve stop` do the same as the buttons.

### Checks

Every check of a task must pass. A check that cannot be decided never counts as a pass.

| Check | Passes when |
| --- | --- |
| `contains` / `notContains` | the answer contains / does not contain a text |
| `equals` | the answer is exactly a text |
| `regex` | the answer matches a pattern |
| `json` | the answer is valid JSON, optionally with the listed keys |
| `fileExists`, `fileContains` | a file exists / contains a text in the task's folder (tasks with tools) |
| `judge` | the judge model gives 4 or 5 out of 5 against your description |

### Two ways a task can run

- **Answer only:** the model answers in one go, without tools. Fast, and enough for most checks.
- **With tools:** a fresh helper agent does the task with the app's tools. It needs an open Cowork or Code conversation, because helpers belong to a conversation. The app's sandbox only lets a helper write inside that conversation's folder, so each run gets an empty temporary folder there (`.dsh-evolve-test/…`), removed when the run ends. Runs are one at a time, with a five-minute limit each.

## What it can and cannot change

It can change one thing: the **policy**, which is
- a **playbook** of short lessons (at most 600 characters each, at most 60), each for one kind of work or for all;
- up to six **sections** of standing instructions (at most 2,000 characters each).

A change is one bounded edit: add, reword or remove one lesson, or replace one section. The whole text is never rewritten. A change that says almost the same as what is already there is refused.

It cannot change the model, the tasks, the checks, the gates or its own settings. The reviewer's answer is only ever read as a list of edits; nothing in it is run.

## The gates

A proposed change is tested on the Check and Guard tasks, the same number of runs as before, and compared task by task (`lib/gates.js`):

1. **Does not carry a test answer.** It may not name a task or contain an expected answer of any task.
2. **Helps on the Check tasks.** More runs pass than before.
3. **Breaks nothing on the Guard tasks.** No task that passed in at least two thirds of its runs now passes in one third or fewer.
4. **Does not make answers much longer.** Typical answer length stays under 150% of before (`costCeiling`).
5. **You approve it.**

Without at least one Check task and one Guard task, a cycle does not start: an improvement could not be proven.

## Where the approved instructions are used

With "Use approved instructions in real conversations" on (the default), every conversation gets the lessons for `all` and `general` work, plus those whose kind of work is named like its mode (`chat`, `cowork`, `code`), as one prompt section (`evolve:notes`, order 72). The text is in a fixed order, so it stays the same between requests and a model server can keep it cached. Switch it off to try the loop without changing how the app behaves.

## What leaves this Mac

Only what the reviewer needs: for up to 12 Learn tasks that do not pass reliably, the prompt, one answer the model gave and why it failed, plus the current policy and the outcome of earlier proposals. API keys, bearer tokens, private keys, e-mail addresses and home-folder paths are replaced before sending. If the reviewer is a cloud model, that text goes to its provider through the app's own model service; this add-on holds no keys. Conversations, Check tasks and Guard tasks are never sent.

## What changed from the research spec

The spec ("DSH Self-Improvement Loop Plugin — Research & Spec") was checked against the installed app. What holds: the harness is the right place to improve; a strong model must own the reviewing; the evaluation must be out of the loop's reach; `agent/turn-stopping` can keep a turn open (a listener steers the agent); helper agents accept their own folder and model.

| Spec | This build | Why |
| --- | --- | --- |
| Separate Anthropic client, Batch API, prompt caching | The reviewer is any model from the app's model list | No keys to handle, nothing to install; works with a local or cloud reviewer. Batch and cache discounts are not available through the app |
| Python SDK / headless eval runner on another Mac | Test runs inside the app: direct model calls, or helper agents | Nothing to install. The cost: runs share the app with you |
| Train / held-in / held-out / canary | Learn / Check / Guard | Same idea in plain words. No public canary set |
| Seven gates | Four automatic gates plus your approval, always | Sandbox and plugin-test gates belong to levels that are not built. No live canary with automatic rollback yet |
| Every candidate is a git-tracked folder | Every version is a JSON file that is never overwritten | No git dependency; same guarantee |
| Nightly outer loop, monthly meta loop | You press Run a cycle | Keeps it predictable. A schedule can call `/evolve improve` later |
| Levels 0–6 | Levels 1 and 2: instruction sections and the playbook | See below |

**Not built, on purpose:** reviewer-written tools, skills and plugins (levels 3–4), the loop improving its own reviewer prompt (level 5), and weight training (level 6). They run or train on model-written output, which needs a real sandbox and, for training, a licence answer. They also only make sense once this measuring loop has proven itself on your tasks. Also not built: mining your real conversations for failures (only test tasks are used), verify-before-stop in live conversations, best-of-N, helpful/harmful counters per lesson, and a Pareto archive.

**Its honest limit:** it cannot make a small model reason like a large one on work it has never seen. Gains show on kinds of work you repeat and can check. With few tasks, a lucky run can pass the gates; ten or more tasks per kind of work and three runs each make that unlikely.

## Configuration

```yaml
- id: evolve
  config:
    enabled: true
    studentProvider: <ROUTE>        # the model to improve; set on the page
    studentModel: <MODEL ID>
    reviewerProvider: <ROUTE>       # the reviewer; set on the page
    reviewerModel: <MODEL ID>
    judgeProvider: <ROUTE>          # optional, for "judge" checks
    judgeModel: <MODEL ID>
    repeats: 3                      # runs per task, 1 to 5
    maxEdits: 3                     # changes tried per cycle, 1 to 5
    tokenBudget: 400000             # tokens per run, all models; 0 = no limit. A run that reaches it stops and changes nothing
    costCeiling: 1.5                # how much longer answers may get
    applyLive: true                 # use approved instructions in real conversations
    dataDir: <ABSOLUTE_DIR>         # optional; default is `evolve` in the dsh home
    commandName: evolve
```

All but `dataDir` and `commandName` are edited on the page and apply at once.

## Files

`index.js` wires the app: the prompt section, model calls, helper agents, jobs, the `evolve` service (`active()`, `notes(family)`, `status()`), the command and two fenced routes (`GET /dsh-evolve/status`, `POST /dsh-evolve/action`; login and Host/Origin check, a required header, a 64 KB JSON body, listed actions only). The logic is in `lib/` and has no app dependency: `verify.js` (checks), `policy.js` (the policy and its edits), `gates.js`, `review.js` (what the reviewer is sent and how its answer is read), `store.js` (files), `engine.js` (measure, improve, approve).

Data folder (`$DSH_HOME/evolve`): `tasks.json`, `policies/v0001.json …`, `active.json`, `results/<version>.json`, `candidates.json`, `history.json`.

## Checked

- **Unit tests:** 24 (`test/`): every check type, path escapes in file checks, the policy and its limits, leak detection, each gate, redaction, the reviewer packet (it contains no Check or Guard task), strict reading of the reviewer's answer, storage, a full simulated cycle with approval and going back, budget stop, refusals.
- **Live, in the throwaway web profile with a scripted mock model:**
  - Set up entirely on the page: both models picked, the six example tasks added.
  - A cycle from a 33% score: the reviewer proposed two lessons; the useful one cleared all four gates and waited; the useless one was stopped by "helps on the check tasks"; nothing changed until Approve.
  - After Approve: version v0002 in use, measured 100%; both versions listed with their scores; going back to v0001 and forward again worked.
  - The approved lesson was in the request of a normal Code conversation (read from the request the mock received).
  - A task with tools: the helper agent wrote a file in its temporary folder, the file check passed 3 of 3, and the folder was gone afterwards. The first attempt, with a folder outside the conversation's folder, was refused by the app's sandbox; that is why the folder is where it is.
  - The action route answered 400 without its header, 405 to GET, 400 to an unknown action and to a task id with `../`.
  - No page errors; the page follows `docs/UI-STYLE.md` (seen in the Forest scheme, light and dark).
  - `/evolve` typed in a chat printed the version in use and the last score.

**Not checked:** a real local model and a real reviewer (the gains shown are from a scripted mock, so they prove the machinery, not an improvement); `judge` checks with a real judge; the token allowance stopping a real run (unit-tested); `/evolve measure` and `/evolve improve` typed in a chat; the page in other colour schemes; the Mac desktop app.
