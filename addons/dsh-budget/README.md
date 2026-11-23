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
- A helper agent's events are counted under the thread that started it (it follows the helper's `parentSession`), as helper steps, apart from the thread's own steps.
- While `ctx.get('mission').longRunId(conversation)` is not empty (a Mission that is working: not paused, not an ordinary /mission run saved before stage B), `maxLongSteps` and `maxLongTokens` replace the *starting* step and token limits. Steps and tokens are then counted across the whole run (all rounds, helpers included), not per round.
- A value the user saved is never overridden: the allowances (Mission 5,000 steps / 60 million tokens, helpers 1,500) replace only a limit that still has its starting value (300 steps, 20 million tokens, 1,500 helper steps). A saved lower token limit holds in a Mission too, and helpers share a lower saved step limit. (A value the user saved that equals the starting value cannot be told from not saving it.) A fresh install's starting token limit of 5,000,000 does NOT count as saved: the installer marks it (`startingTokens: true` in its row) and a Mission's allowance replaces it. Saving the token limit on this page clears the mark, so a value the person saved (even 5,000,000) wins.
- At a limit it refuses the run's next step through the app's `agent/pre-step` hook. The app then ends the turn as "blocked". A step already running is not interrupted.
- The loop check is a tool guard (`ctx.tools.guard`): the repeated call itself is refused, and the run stops at its next step.
- The record (today's total, recent run sizes, recent stops) is in `<app data folder>/budget/budget.json`. It holds numbers only, never what was said.

## Settings

```yaml
- id: budget
  config:
    enabled: true
    maxSteps: 300           # requests the thread itself makes in one run
    maxHelperSteps: 1500    # requests its helpers make (Deep research, Mission); 0 = shared with maxSteps
    maxLongSteps: 5000      # while a Mission is on: all requests over the whole run, whatever maxSteps is saved (never below it)
    maxLongTokens: 60000000 # while a Mission is on: tokens (never below maxTokens)
    maxTokens: 20000000     # tokens in one run, helpers included
    maxMinutes: 0
    maxRepeats: 8
    dayTokens: 0
```

A **first install** of Plus starts with `maxTokens: 5000000` (see `new-install-defaults.json` in the download); an update never changes a value.

### Measured (18 November 2026, review H13)

- A Thorough Deep research run, in the lab with a stand-in model that makes one request per helper: 31 requests in one run (about 30 helpers). Real helpers made 9 to 18 requests each in the owner's exported threads, so a real Thorough run is about 300 to 500: past the old limit of 300 for helpers and the thread together.
- A Mission (then called Long run) in the normal way: each round is its own run (3 to 4 requests each in the lab), so the old limit did not add rounds up. Run through a program (the PTC preset), the whole Mission is one run: three real runs counted 172 to 263 requests and about 0.5 to 1 million tokens in 15 to 21 minutes.
- So helpers now have their own allowance and a Mission has its own, and the ordinary limits only apply to ordinary runs.

### A Mission's own allowance (19 November 2026, the owner's decision; called Long run before 19 November)

- **Steps:** a working Mission gets `maxLongSteps` (5,000) over the whole run, **whatever step limit is saved** for ordinary runs. Before, a saved per-run limit (the owner's 538) also capped whole Missions (run 6j85 was cut twice). It is never below the ordinary limit; 0 means the ordinary limit; no ordinary step limit stays no limit. Ordinary chats keep their saved limit.
- **Tokens:** unchanged. The allowance replaces only the starting token value; a token limit the user saved wins.
- **When it is reached:** the stop says "This Mission reached its own limit of …", and Budget guard tells Mission (`mission.budgetStopped`), which pauses the run with that limit in plain words. Since stage E Mission also offers to raise it in its card (see below).
- **A fresh allowance** when Mission says a run `finished` (`meter.endRun`). A `resumed` run keeps its count over the whole run (a pause by you, an idle stall, step errors, a restart all resume the same run), so the whole-run limit really limits the run. The one exception: a run that Budget guard itself stopped by its Mission steps or tokens, resumed after that limit was raised (or Budget guard was switched off), starts a fresh allowance. Resumed without raising it, it stops again at once, as its pause text says ("Raise it in Settings → Budget, then press Resume"). Fixed 19 November 2026 after review: before, every Resume gave a new full allowance. Tested in `test/index.test.mjs` (both new cases fail on the code before); not tested in the running app.
- **Service `budgetGuard`:** `longAllowance()` → `{enabled, steps, tokens, dayTokens}`, what a Mission gets now; Mission's pre-flight prints it.
- Tested: `test/index.test.mjs` (a saved 538 holds for a thread, a Mission goes to 5,000; a Budget stop tells Mission, and a run resumed after the limit was raised starts afresh) and `test/meter.test.mjs`; both fail on the code before. Not tested in the running app.

### Mission and Long run are one (Mission stage B, 19 November 2026)

- Mission's Long run is now simply called **Mission**, and every new Mission works as a Long run inside, also one started by typing `/mission <goal>`. So the allowance above now covers typed Missions too; before, an ordinary /mission run got only the ordinary limits. Only Missions saved before this version (kind 'mission') still get the ordinary limits.
- Words only in this add-on: the Budget page group reads "While a Mission is on", the rows "Steps in a Mission" and "Tokens in a Mission", and the stop says "This Mission reached its own limit of …". Settings keys (`maxLongSteps`, `maxLongTokens`), the service `budgetGuard.longAllowance()` and what Budget listens to (`mission.longRunId`, `budgetStopped`, the `finished` and `resumed` events) are unchanged.
- Tested: `test/meter.test.mjs` and `test/index.test.mjs` assert the new stop sentence. Not tested in the running app.

### A continued Mission (Mission stage C, 20 November 2026)

- A Mission that ended with questions left can now be **continued**: you answer them in its questions card, and the same run goes on (Mission sends `resumed` with `continued: true` and the same `runId`). Its whole-run allowance counts across the continue, as across a Resume: the count it had at its end is kept and put back (`meter.endRun` now returns it, `meter.restoreRun` puts it back and adds steps already counted since the continue).
- The exceptions are the same as for Resume: a run that Budget guard itself stopped, continued after that limit was raised (or Budget guard was switched off), starts a fresh allowance; continued without raising it, it stops again. A `continued` event for another run starts fresh.
- The kept count lives in memory only (the last ended run per thread, at most 200). After an app restart, a continue starts a fresh allowance.
- Tested: five new cases in `test/index.test.mjs` and one in `test/meter.test.mjs`. Not tested in the running app.

## Good to know

- It counts tokens, not money. Prices differ per model.
- Tokens are input plus output as the provider reports them. A provider that reports no usage is counted by steps only.
- Counting starts when the add-on starts. A run that was already running is counted from then.
- A run stopped by the daily limit stops again on the next message until the day ends or the limit is raised.

## Code

`lib/meter.js` (counting, limits, the record; tested in `test/meter.test.mjs`), `index.js` (events, the stop, the loop check, the `GET /dsh-budget/data` route), `client.js` (the page and the card).

## Tested

In the lab (web version, stand-in model): the page saved a limit; with the step limit at 1, a two-step run ended after its first step with the card under it, and the next message was answered. Not tested in the running app: the token, minute, daily and loop limits (unit tests only), helper agents counted under their thread (unit test only), a real model, the Mac app, scheduled runs.

### Mission stage E (20 November 2026)

- **Which limit.** At a stop by a Mission's own allowance, Budget now tells Mission which limit and its value: `mission.budgetStopped(conversation, text, {limit, max})` (the third argument is new; an older Mission ignores it). Mission pauses as before and offers, in its card above the chat box, to raise that limit by half (Ask modes; Full auto lists it in the report instead of asking).
- **Raising it, only after your Allow.** New service method `budgetGuard.raiseMission({limit: 'steps' | 'tokens', to})` → `{ok: true, from, to}` or `{ok: false, text}`. Budget checks the request itself: Budget guard on, the new value higher than now, at most 50,000 steps or 500,000,000 tokens. It writes `maxLongSteps` or `maxLongTokens` through the app's settings (the same keys as the Budget page), so you see the new value on Settings → Budget guard and can change it back there. A Mission stopped by that limit and then resumed starts a fresh allowance, as after a raise on the page. Budget never raises anything by itself.
- **The card under the answer.** A stop by a Mission's allowance is marked (`mission: true` in the record), and its card now says: "The Mission is paused. Allow the higher limit in the Mission's card above the chat box, or raise "Steps in a Mission" in Settings → Budget guard, then press Resume." Before, it said to send a message, which does not give a Mission a fresh allowance.
- **The old name.** Stops saved before stage B read "This Long run reached …". They are kept as stored and shown as "This Mission reached …" on the page and under the answer. The effect label and the comments say Mission too. Settings keys, the record format and `longAllowance()` are unchanged.
- Tested: `test/index.test.mjs` (the third argument and the mark; `raiseMission` writes and refuses; a failing save changes nothing; an old stop shown with Mission) and `test/meter.test.mjs` (`missionWords`, `checkRaise`, the card's hint). Not tested in the running app.
