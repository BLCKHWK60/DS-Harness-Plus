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
- A helper agent's events are counted under the conversation that started it (it follows the helper's `parentSession`).
- At a limit it refuses the task's next step through the app's `agent/pre-step` hook. The app then ends the turn as "blocked". A step already running is not interrupted.
- The loop check is a tool guard (`ctx.tools.guard`): the repeated call itself is refused, and the task stops at its next step.
- The record (today's total, recent task sizes, recent stops) is in `<app data folder>/budget/budget.json`. It holds numbers only, never what was said.

## Settings

```yaml
- id: budget
  config:
    enabled: true
    maxSteps: 300
    maxTokens: 20000000
    maxMinutes: 0
    maxRepeats: 8
    dayTokens: 0
```

## Good to know

- It counts tokens, not money. Prices differ per model.
- Tokens are input plus output as the provider reports them. A provider that reports no usage is counted by steps only.
- Counting starts when the add-on starts. A task that was already running is counted from then.
- A task stopped by the daily limit stops again on the next message until the day ends or the limit is raised.

## Code

`lib/meter.js` (counting, limits, the record; tested in `test/meter.test.mjs`), `index.js` (events, the stop, the loop check, the `GET /dsh-budget/data` route), `client.js` (the page and the card).

## Tested

In the lab (web version, stand-in model): the page saved a limit; with the step limit at 1, a two-step task ended after its first step with the card under it, and the next message was answered. Not tested in the running app: the token, minute, daily and loop limits (unit tests only), helper agents counted under their conversation (unit test only), a real model, the Mac app, scheduled runs.
