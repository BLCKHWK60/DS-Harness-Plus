# Automations

Plugin `@local/dsh-automations` (dsh 0.2.2-rc.2). Answers "did my scheduled tasks work, and does anything need me?" in one place, and tells you on this Mac and on your phone.

The app's own scheduler (the **Automation tasks** page) records only that a task's instruction reached a conversation. To learn how it went you open the conversation. This add-on follows each run to its end and records the result.

It only watches. It never answers for you, changes a task or touches a conversation. The one thing it starts is a task you ask it to run.

## The Automation runs page

In the Cowork sidebar, under **Automation tasks**. It has three parts.

- **Needs you.** Runs that wait for your approval, your answer to a question, or your review of a plan. **Open** takes you to the conversation.
- **Your tasks.** Each scheduled task with its next run and how its last run ended. **Run now** starts it. Tasks that have ended and have no recorded run are left out.
- **Last runs.** Newest first: how it ended, when it started, how long it took, steps and tokens, and the end of the answer (click it to see more). **Open** shows the conversation. A run that failed or was stopped has **Run again**.

How a run can end:

| Shown as | Meaning |
| --- | --- |
| Finished | The turn completed |
| Failed | The model or a tool gave an error (the reason is shown), the answer was cut off at the model's output limit, or the app closed before the run finished |
| Stopped | A limit or a rule ended it before it finished, for example the Budget guard |
| Cancelled | You stopped it |
| Running, Needs you | Still going |

Runs are recorded from the moment the add-on is installed. Earlier ones are not listed. The last 200 are kept.

## Alerts

**Settings → Alerts.** A short line when a task fails, needs you or finishes.

- **Alert me when:** a task failed or was stopped (on), a task needs me (on), a task finished (off).
- **For which tasks:** scheduled tasks always. Conversations you start yourself only if you switch that on, and then only when the task has run at least the minutes you set (2 unless changed), so quick answers at your desk stay quiet.
- **Where:** on this Mac (on) and on your phone (off until set up).
- **Send a test alert** sends one sample to every place that is on and says what happened.

What the line says: fixed words plus one name. For a scheduled task the name is the task's own, for example `Morning brief failed` or `Weekly review has a question for you`. For a conversation you started it is the project folder, for example `A task in my-site finished`. It never contains your instruction or the answer.

### On this Mac

A normal notification, shown through macOS's own `osascript`. The first time, macOS may ask whether "Script Editor" may show notifications.

### On your phone

Through [ntfy](https://ntfy.sh), a free service with a free app. No account is needed.

1. Install the app "ntfy" on your phone.
2. On the Alerts page, press **Make one up** next to Topic.
3. In the phone app, tap +, type the same topic, and subscribe.
4. Switch on **On my phone** and press **Send a test alert**.

The topic is the name your phone listens to. Anyone who knows it can read your alerts, which is why it should be long and odd, and why the alerts carry only a name and what happened. A topic may have letters, digits, `-` and `_`, up to 64 characters.

## Settings

```yaml
- id: automations
  config:
    enabled: true          # off records nothing and alerts nothing
    alertFailed: true
    alertNeeds: true
    alertFinished: false
    alertOthers: false     # also conversations you start yourself
    othersMinutes: 2       # ...only when the task has run at least this long
    mac: true
    phone: false
    ntfyServer: https://ntfy.sh
    ntfyTopic: ''
```

## How it works

- It listens to the app's session events. A user message whose source is the scheduler and whose text starts with `[SCHEDULE REMINDER` starts a run; the task ids are read from that text. A change notice from the scheduler starts no run.
- `step/start` counts steps and `assistant/message` carries the token usage and the answer's words. A helper agent's work is counted under the conversation that started it.
- Waiting: `approval/asked` (until `approval/decided`), and a call to `ask_user_question` or `exit_plan_mode` (until that call's result).
- `turn/end` closes the run with the app's own reason: `completed`, `error`, `aborted`, `blocked` or `max-tokens`.
- Task names, the task list and Run now come from the app's `schedule` service (`catalog`, `run`).
- The record is `<app data folder>/automations/runs.json`. It holds task names, times, counts and up to 400 characters from the end of each answer.
- Phone alerts are one JSON `POST` to the ntfy server's root, with an 8-second limit. At most 10 alerts go out in a minute.

## Good to know

- Tasks run only while the app is running. It keeps running in the menu bar when the window is closed. Nothing runs while the Mac sleeps, and this add-on does not change that.
- Phone alerts pass through the ntfy service, which can read them. The free service allows 250 messages a day.
- The topic is saved with the app's other settings on this Mac, as plain text.
- You cannot answer from the phone. Open the app to approve or reply.
- The older **Notify** add-on still works beside this one. It runs a command you write; this needs no command.

## Not built yet

- Per-task settings: its own mode, what it may do without asking, its own limits.
- Ending a run that has waited too long for an answer.
- An alert when a task has not succeeded for a set number of hours.

## Code

`lib/runs.js` (the record; tested in `test/runs.test.mjs`), `lib/alerts.js` (the line, the settings, the two senders, the rate limit; tested in `test/alerts.test.mjs`), `index.js` (events, the scheduler, the `GET/POST /dsh-automations/data` route), `client.js` (the two pages).

## Tested

In the lab (web version, stand-in model, a stand-in for the ntfy server): the page listed the tasks; **Run now** started a run that showed Running and then Finished with its time, steps, tokens and words; a run whose model returned an error showed Failed with the reason, and **Run again** started a new run; a run that asked a question showed under Needs you, **Open** opened it, and after the answer it went on and finished. Each of these sent the right alert. The Alerts page saved every setting and kept them over a restart; a bad topic and a refusing server were reported in plain words; with alerts for my own conversations on, a finished and a failed one each sent an alert. A test alert through `osascript` ran without error on macOS.

Not tested: the real ntfy service and a real phone; whether the Mac notification is visible (only that the command succeeded); the waiting kinds "approval" and "plan review" (unit tests only); a task run by its schedule instead of Run now; helper agents; the app closing mid-run (unit test only). In the Mac desktop app the owner confirmed that the page and the alerts work; nothing more detailed was checked there.
