# Budget guard

Plugin `@local/dsh-budget` (dsh 0.2.2-rc.1). Hard limits that stop a task that is running away. The limits are checked by the program before every step; the model is never asked to keep to them.

## What a "task" is

One turn of a conversation: everything the assistant does after one message of yours (or one scheduled run), with the work of its helper agents counted in. Your next message starts a fresh allowance, so there is no "continue" button: you just answer.

## The limits

| Limit | Default | Meaning |
| --- | --- | --- |
| Steps | 300 | Requests to a model in one task |
| Tokens | 20,000,000 | Everything sent and received in one task. Long tasks resend the conversation at each step, so this grows fast |
| Minutes | none | How long one task may run. Waiting for your answer counts, which is why it is off |
| Same tool call in a row | 8 | The same tool with exactly the same input, repeated with nothing else in between, is treated as a loop |
| Tokens per day | none | All conversations together |

An empty box (0) means no limit. The defaults are generous: a normal task does not come near them, a loop does.

## What you see

- **Settings → Budget guard.** The limits; today's token count; your biggest task in the last 30 days, with **Set to twice that** once five tasks have been seen; and the last stops.
- **A stop.** The task ends where it is. Under it a card says **Stopped by the budget guard** and which limit was reached. Nothing is undone and the conversation is kept.

## How it works

- It listens to the app's session events: `turn/start` begins a task, `step/start` counts a step, `assistant/message` carries the token usage, `turn/end` closes the task and records its size.
- A helper agent's events are counted under the conversation that started it (it follows the helper's `parentSession`), as helper steps, apart from the conversation's own steps.
- While `ctx.get('mission').longRunId(conversation)` is not empty (a Mission Long run that is working: not paused, not an ordinary /mission run), `maxLongSteps` and `maxLongTokens` replace the *starting* step and token limits. Steps and tokens are then counted across the whole run (all rounds, helpers included), not per round.
- A value the user saved is never overridden: the allowances (Long run 5,000 steps / 60 million tokens, helpers 1,500) replace only a limit that still has its starting value (300 steps, 20 million tokens, 1,500 helper steps). A saved lower step or token limit holds in a Long run too, and helpers share a lower saved step limit. (A value the user saved that equals the starting value cannot be told from not saving it.) A fresh install's starting token limit of 5,000,000 does NOT count as saved: the installer marks it (`startingTokens: true` in its row) and a Long run's allowance replaces it. Saving the token limit on this page clears the mark, so a value the person saved (even 5,000,000) wins.
- At a limit it refuses the task's next step through the app's `agent/pre-step` hook. The app then ends the turn as "blocked". A step already running is not interrupted.
- The loop check is a tool guard (`ctx.tools.guard`): the repeated call itself is refused, and the task stops at its next step.
- The record (today's total, recent task sizes, recent stops) is in `<app data folder>/budget/budget.json`. It holds numbers only, never what was said.

## Settings

```yaml
- id: budget
  config:
    enabled: true
    maxSteps: 300           # requests the conversation itself makes in one task
    maxHelperSteps: 1500    # requests its helpers make (Deep research, Mission); 0 = shared with maxSteps
    maxLongSteps: 5000      # while a Mission Long run is on: all requests (never below maxSteps)
    maxLongTokens: 60000000 # while a Mission Long run is on: tokens (never below maxTokens)
    maxTokens: 20000000     # tokens in one task, helpers included
    maxMinutes: 0
    maxRepeats: 8
    dayTokens: 0
```

A **first install** of Plus starts with `maxTokens: 5000000` (see `new-install-defaults.json` in the download); an update never changes a value.

### Measured (18 November 2026, review H13)

- A Thorough Deep research run, in the lab with a stand-in model that makes one request per helper: 31 requests in one task (about 30 helpers). Real helpers made 9 to 18 requests each in the owner's exported sessions, so a real Thorough run is about 300 to 500: past the old limit of 300 for helpers and the conversation together.
- A Mission Long run in the normal way: each round is its own task (3 to 4 requests each in the lab), so the old limit did not add rounds up. Run through a program (the PTC preset), the whole run is one task: three real runs counted 172 to 263 requests and about 0.5 to 1 million tokens in 15 to 21 minutes.
- So helpers now have their own allowance and a Long run has its own, and the ordinary limits only apply to ordinary tasks.

## Good to know

- It counts tokens, not money. Prices differ per model.
- Tokens are input plus output as the provider reports them. A provider that reports no usage is counted by steps only.
- Counting starts when the add-on starts. A task that was already running is counted from then.
- A task stopped by the daily limit stops again on the next message until the day ends or the limit is raised.

## Code

`lib/meter.js` (counting, limits, the record; tested in `test/meter.test.mjs`), `index.js` (events, the stop, the loop check, the `GET /dsh-budget/data` route), `client.js` (the page and the card).

## Tested

In the lab (web version, stand-in model): the page saved a limit; with the step limit at 1, a two-step task ended after its first step with the card under it, and the next message was answered. Not tested in the running app: the token, minute, daily and loop limits (unit tests only), helper agents counted under their conversation (unit test only), a real model, the Mac app, scheduled runs.
