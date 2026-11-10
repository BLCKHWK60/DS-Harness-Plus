# Code power

Host plugin `@local/dsh-code-power` (dsh 0.2.2-rc.1). Mostly prompt assets, as the spec says, plus one small tool where code is more reliable than a prompt.

## Skills (model- and user-invocable)

They are registered with dsh's skill service; the model loads one with the `skill` tool when a task matches. The numbers and lane names in them come from the Config below.

| Skill | What it tells the model |
|---|---|
| `pr-review` | Find the change (`gh pr diff` or `git diff <base>...HEAD`), run the configured review lanes (Tier's `review_lanes` tool when available, otherwise one lane at a time), merge and rank concrete findings with `file:line`, change nothing. |
| `ci-fix-loop` | Create a goal (`create_goal` with `max_goal_rounds` = `ciFix.maxRounds`), then run the check command, fix the cause of the first failure, repeat; never weaken a test; stop and report after the round limit or when one failure survives two fixes. |
| `best-of-n` | Run `bestOfN.n` attempts in separate git worktrees with `workflow` `parallel()`, drop the ones that fail the check, compare the rest with `judge_candidates`, apply the winner and say why. |
| `hunk-review` | Walk the changes hunk by hunk, recommend keep / revert / change, revert only what the user rejects with `git apply -R` (no interactive git). |

## Tool `judge_candidates`

Compares 2 to 5 candidate solutions (usually diffs) to one task, blind: the candidates get **deterministically shuffled opaque labels** (A, B, ...), a judge child scores each on the criteria (1 to 5) and picks a winner or a tie; with `consistencyCheck` (default on) the judgement is **repeated with the order reversed**, and if the two rounds name different winners the result is a **tie flagged as split** (position bias). The judge prompt is the owner's Model Arena judge, worded for solutions. Candidate text is treated as untrusted (tags escaped, the judge is told to ignore instructions inside it). The judge child runs on Tier's `judgeRole` route when Tier is loaded, otherwise on the parent's route; the tool is registered with Tier's sub-agent gate, and a judge agent cannot call it again.

The plugin itself runs no git command and writes no file: all changes go through the model's own tools, so dsh's sandbox and approvals apply.

## Service `candidateJudge`

The same judge is offered to other plugins: `candidateJudge.compare({task, texts, criteria, consistencyCheck, signal, parent | ask})` returns `{winner (index or 'tie'), consistent, average, verdicts}`. Pass `parent` to run the judge as a child agent, or `ask(prompt, signal)` to send it yourself (the model arena does this). Model arena uses it, so there is one judge in the project.

## Configuration

```yaml
- id: code-power
  config:
    enabled: true
    prReview: { lanes: [correctness, security, tests] }       # Tier review angles: correctness, security, tests, performance
    bestOfN:
      n: 3
      judgeRole: review                                      # Tier role of the judge
      criteria: [correctness, completeness, simplicity, test coverage]
      consistencyCheck: true
    ciFix: { maxRounds: 5, command: '' }                     # empty: the skill tells the model to find or ask for the command
    judgeToolName: judge_candidates
```

No check command, tier, path or address is preset.

## What the spec listed that is not here

- **Checkpoints / rewind**: I found no user-facing rewind in dsh 0.2.2-rc.1's documentation (session fork and resume exist). Nothing was built.
- **Per-hunk review UI**: dsh's own workspace-changes feature already shows each turn's changes per file; `hunk-review` adds the procedure for choosing hunks.
- **Slash commands** (`/review`, ...): not built. dsh's command registry runs without creating a model message, so a command cannot start a normal model turn from plain JS without constructing a message object. Whether the composer lists user-invocable skills was not checked in the web UI.
- **A CI fix loop engine**: the loop is the model following the skill with a goal; no job runner was written.

## Verified (rc.1, scripted mock model, throwaway home)

- Skills register and load through the `skill` tool, with the configured lanes, round limit and command filled in (`ci-fix-loop`: 4 rounds and `make check`; `pr-review`: the two configured lanes).
- `judge_candidates`: a judge that prefers the good candidate in either order gives that winner "in both rounds" with averaged scores; a judge that always picks the first label shown gives a tie flagged as split.
- Verdict parser unit checks (no block, wrong shape, unknown label are rejected).
- The skill registration needs a `source` string (found by the first run failing).

## Not verified

Real model behaviour: whether a model follows these skills well, whether judges are good, and the acceptance cases that need real work (`/review` on a real branch with two real lanes, a CI loop converging, best-of-3 on a real repo). The tier gate on `judge_candidates` (same code as Deep research, which was tested).
