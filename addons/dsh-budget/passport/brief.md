# Brief: @local/dsh-budget

What it is for: Hard limits that stop a run that is running away: steps, tokens and minutes per run (helpers included), a loop check, and an optional daily limit. Enforced by the program, not by asking the model.

This brief was written by Creator Plus from the add-on's own files. Its README below is the full description, complete enough to rebuild the add-on from; improve this brief by hand, with the user's yes.

## What it must keep doing

- Its settings: enabled, maxSteps, maxHelperSteps, maxLongSteps, maxLongTokens, maxTokens, maxMinutes, maxRepeats, dayTokens.

## Its README

# Budget guard

Add-on `@local/dsh-budget` (dsh 0.2.2-rc.1). Hard limits that stop a run that is running away. The limits are checked by the program before every step; the model is never asked to keep to them.

## What a "run" is

One turn of a thread: everything the assistant does after one message of yours (or one automation run), with the work of its helper agents counted in. Your next message starts a fresh allowance, so there is no "continue" button: you just answer.

## The limits

| Limit | Default | Meaning |
| --- | --- | --- |
| Steps | 300 | Requests to a model in one run |
| Tokens | 20,000,000 | Everything sent and received in one run. Runs with many steps resend the thread at each step, so this grows fast |
| Minutes | none | How long one run may run. Waiting for your answer counts, which is why it is off |
| Same tool call in a row | 8 | The same tool with exactly the same input, repeated with nothing else in between, is treated as a loop |
| Tokens per day | none | All threads together |

An empty box (0) means no limit. The defaults are generous: a normal run does not come near them, a loop does.

## What you see

- **Settings → Budget guard.** The limits; today's token count; your biggest run in the last 30 days, with **Set to twice that** once five runs have been seen; and the last stops.
- **A stop.** The run ends where it is. Under it a card says **Stopped by the budget guard** and which limit was reached. Nothing is undone and the thread is kept.

## How it works

- It listens to the app's thread events: `turn/start` begins a run, `step/start` counts a step, `assistant/message` carries the token usage, `turn/end` closes the run and records its size.
- A helper agent's events are counted under the thread that started it (it follows the helper's `parentSession`).
- At a limit it refuses the run's next step through the app's `agent/pre-step` hook. The app then ends the turn as "blocked". A step already running is not interrupted.
- The loop check is a tool guard (`ctx.tools.guard`): the repeated call itself is refused, and the run stops at its next step.
- The record (today's total, recent run sizes, recent stops) is in `<app data folder>/budget/budget.json`. It holds numbers only, never what was said.

## Settings

```yaml
- id: budget
  config:
    enabled: true
    maxSteps: 300
    maxHelperSteps: 1500
    maxLongSteps: 5000
    maxLongTokens: 60000000
    maxTokens: 20000000
    maxMinutes: 0
    maxRepeats: 8
    dayTokens: 0
```

## Good to know

- It counts tokens, not money. Prices differ per model.
- Tokens are input plus output as the provider reports them. A provider that reports no usage is counted by steps only.
- Counting starts when the add-on starts. A run that was already running is counted from then.
- A run stopped by the daily limit stops again on the next message until the day ends or the limit is raised.

## Code

`lib/meter.js` (counting, limits, the record; tested in `test/meter.test.mjs`), `index.js` (events, the stop, the loop check, the `GET /dsh-budget/data` route), `client.js` (the page and the card).

## Tested

In the lab (web version, stand-in model): the page saved a limit; with the step limit at 1, a two-step run ended after its first step with the card under it, and the next message was answered. Not tested in the running app: the token, minute, daily and loop limits (unit tests only), helper agents counted under their thread (unit test only), a real model, the Mac app, scheduled runs.
