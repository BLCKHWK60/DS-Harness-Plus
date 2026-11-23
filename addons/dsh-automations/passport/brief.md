# Brief: @local/dsh-automations

What it is for: Shows how every automation run ended (finished, failed, stopped or waiting for you) on one page, and alerts you on this Mac and, when set up, on your phone.

This brief was written by Creator Plus from the add-on's own files. Its README below is the full description, complete enough to rebuild the add-on from; improve this brief by hand, with the user's yes.

## What it must keep doing

- Its tools: automation_results.
- Its modes: automations.
- Its settings: enabled, alertFailed, alertNeeds, alertFinished, alertOthers, othersMinutes, alertRuns, mac, phone, ntfyServer, ntfyTopic, deletedToTrash, oldRunsToTrash, tab.

## Its README

# Automations

Add-on `@local/dsh-automations` (dsh 0.2.2-rc.2). Answers "did my automations work, and does anything need me?" in one place, and tells you on this Mac and on your phone.

The app's own scheduler (the **Automation tasks** page) records only that an automation's instruction reached a thread. To learn how it went you open the thread. This add-on follows each run to its end and records the result.

It never answers for you. It changes an automation only when you press a button on its page (pause, switch on, save, change preset, delete, Run now), and moves threads only as described under "Keep past runs".

## The Automations page

**Automations** is a row in every space of the left panel (since the Automations part, 16 November 2026; before, "Automation runs" and "Automation tasks" were two rows under Cowork only). The app's own editor (custom repeat rules, the folder, its delivery list) is one click away: **App's editor** at the top, or **Open in the app's editor** in an automation's details. The page has these parts:

- **Tiles:** switched on, ran today, missed in the last 7 days, failed in the last 7 days, the next run.
- **Needs you.** Runs that wait for your approval, your answer to a question, or your review of a plan. **Open** takes you to the thread.
- **Missed while the app was closed.** When the app opens after being closed, its scheduler runs each automation once for the latest time it missed, and skips the earlier ones without a record. Plus keeps a heartbeat (one line a minute in `alive.json`), so it can list those earlier times here, each with **Run now** (which runs the instruction now, not for the missed time). A one-time automation that was missed runs late by itself.
- **Your automations.** One card each: an on/off switch (pause, switch on; switching on moves it to its next time, missed times do not run), its rule in plain words ("Every weekday at 08:30", "The first Monday of every month at 09:00"), its mode, its preset (a small label with an (i), see "Presets" below), its next run and last result, **Run now** and **Details**. With automations in more than one mode, chips filter the list by mode.
- **Details:** name and instruction (Save refuses when the automation was changed on another page meanwhile), when and where it runs, its mode and where it was created, its **Preset** with **Change**, **Alerts for this automation** (Default, Alert, No alert for fails, needs you and finishes), **Keep past runs**, its last runs, **Open in the app's editor** and **Delete…**.
- **Timeline:** Day, Week or Month; one lane per automation with finished, failed, missed and coming times, and a line for now.
- **Last runs.** Newest first: how it ended, when it started, how long it took, steps and tokens, and the end of the answer (click it to see more). A run that came more than 3 minutes after its due time says **Ran late: due …**, and **ran when the app opened** when the heartbeat shows the app was closed then (a run held back by a busy thread is late too, without that part). **Open** shows the thread. A run that failed or was stopped has **Run again**.

### Presets

Each automation runs in one of the app's agent presets: **Standard** (the assistant uses its tools step by step), **PTC** (it runs as a program each time: the assistant writes a short program that calls its tools), **Creator** (the app's preset for building add-ons), or one of your own. The page shows it as a small label on each automation, with an (i) that says what the preset does, where it comes from and how to change it. Since item 7 (owner's decision of 21 November 2026, point 22).

- **Where it comes from.** An automation made by the assistant takes the preset of the thread it was made in (the app's schedule tool copies it), so one made earlier from a PTC thread runs in PTC every time. With no preset stored, it uses the app's default preset when it opens a thread; the (i) says which one that is now.
- **Change** (Details → Preset): pick a preset and click **Use it**. Nothing changes until you click; nothing changes by itself, ever. The change goes through the app's own scheduler and is refused, in plain words, when the automation was changed on another page meanwhile. The next run uses the new preset.
- An automation that opened **one thread at its first run** and has run already: that thread keeps its preset, so after a change the next run opens a new thread in the new preset, and later runs go on there. The line under the picker says so.
- An automation that **writes into one existing thread** (for example a Creator Plus saved run) runs in that thread's preset, which the app fixes at its first message. It shows the label but no Change; to use another preset, make the automation again from a thread in that preset.
- Picking PTC shows only "Runs as a program each time." No warning: PTC is a normal choice.
- New automations made from the Automations mode's thread follow that mode's preset rule (Settings → Spaces, "Preset in this space"); this page does not enforce it.

## The Automations mode

A mode of the Modes add-on (Read Only; switch: `tab`). Its start page shows the tiles and **Open Automations**. Its thread has the app's schedule tools and `automation_results`, and is told to list the changes and ask before it changes or deletes more than one automation. It is never offered as the mode automations open in (Settings → Modes leaves it out).

`automation_results` never quotes or reads a Recon (sealed) thread, and reads nothing when the Modes add-on cannot say which are sealed; a Recon thread's words are never kept in the run record. It answers questions about past runs ("what did the morning brief say on Monday?"): by name or id, date and outcome, with each run's last words, and with `full` the whole final answer read from its thread (never a Recon thread).

## Deleted automations and old runs

- **Deleted automations go to the trash** (`deletedToTrash`, on). Deleting one anywhere (this page, the app's editor, the assistant, or archiving the thread it writes into) puts a copy of it in the Trash list for 30 days. **Put back** makes it again, paused if it was paused; one that wrote into a thread that is now archived or gone opens a thread of its own instead. Its old delivery list in the app cannot come back, and it gets a new id. A one-time automation whose time has passed cannot be put back. Ended automations are not kept. One deleted while the trash is off (the left panel off or still starting) is held and filed once the trash is there.
- **Keep past runs** (per automation; starting values from how often it runs: hourly or more often 7 days, daily 31 days, weekly 183 days, rarer 365 days). Older runs leave the list. For an automation that opens a new thread at every run, those runs' threads go to the trash (`oldRunsToTrash`, on), one Trash row per automation, through the left panel's trash, which never takes a pinned thread, one still working, or one an automation writes into. A thread shared by several runs is never touched, nor a run's own thread you went on writing in. Runs are dropped only while the trash can take their threads (or the switch is off). At most 1,000 runs are kept for all automations together.

How a run can end:

| Shown as | Meaning |
| --- | --- |
| Finished | The turn completed |
| Failed | The model or a tool gave an error (the reason is shown), the answer was cut off at the model's output limit, or the app closed before the run finished |
| Stopped | A limit or a rule ended it before it finished, for example the Budget guard |
| Cancelled | You stopped it |
| Running, Needs you | Still going |

Runs are recorded from the moment the add-on is installed. Earlier ones are not listed.

## Alerts

**Settings → Alerts.** A short line when an automation, a Mission or a thread fails, needs you or finishes.

- **Alert me when:** a run failed or was stopped (on), a run needs me (on), a run finished (off).
- **For which runs:** automations always. Threads you start yourself only if you switch that on, and then only when the thread has run at least the minutes you set (2 unless changed), so quick answers at your desk stay quiet.
- **Where:** on this Mac (on) and on your phone (off until set up).
- **For one automation:** its Details can say Alert or No alert for each of the three, over these switches. A run of several automations together follows these switches.
- **Send a test alert** sends one sample to every place that is on and says what happened.

What the line says: fixed words plus one name. For an automation the name is its own, for example `Morning brief failed` or `Weekly review has a question for you`. For a thread you started it is the project folder, for example `A thread in my-site finished`. It never contains your instruction or the answer.

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
    alertOthers: false     # also threads you start yourself
    othersMinutes: 2       # ...only when the thread has run at least this long
    mac: true
    phone: false
    ntfyServer: https://ntfy.sh
    ntfyTopic: ''
    deletedToTrash: true   # a deleted automation is kept in the trash for 30 days
    oldRunsToTrash: true   # old runs' own threads go to the trash (shared ones never)
    tab: true              # the Automations mode
```

## How it works

- It listens to the app's session events. A user message whose source is the scheduler and whose text starts with `[SCHEDULE REMINDER` starts a run; the automation ids are read from that text. A change notice from the scheduler starts no run.
- `step/start` counts steps and `assistant/message` carries the token usage and the answer's words. A helper agent's work is counted under the thread that started it.
- Waiting: `approval/asked` (until `approval/decided`), and a call to `ask_user_question` or `exit_plan_mode` (until that call's result).
- `turn/end` closes the run with the app's own reason: `completed`, `error`, `aborted`, `blocked` or `max-tokens`.
- Automation names, the list and Run now come from the app's `schedule` service (`catalog`, `run`).
- Presets (`lib/preset.js`): read from the app's `agentPresets` service (`list()` once a minute with a 3-second limit, `defaultId`, and `presetForSession` for a thread's own preset; read only). A change is one `schedule.edit` with `patch.target` = the same kind and folder with `create.agentPreset` set, sent with `expectedUpdatedAt`. Only presets the app lists and that are not broken can be picked.
- The record is `<app data folder>/automations/runs.json`. It holds automation names, times, counts and up to 400 characters from the end of each answer, and for a late run its due time. `alive.json` holds the heartbeat and the times the app was closed (31 days). `tasks.json` holds each automation's mode, own alerts and keep rule, and a copy of every automation (title, instruction, rule, destination) for Put back.
- Late: the scheduler's message carries `occurrence_at`; Run now sends the current time, so it is never late.
- Rules in plain words, missed times and the timeline come from `lib/recur.js`, which follows the app's own rules (checked against its source): a daily time that falls in the spring clock change is skipped, as the app skips it; cron day fields starting with `*` combine with AND; RRULE parts the engine cannot compute (BYWEEKNO, BYYEARDAY) show as "Custom rule" and list no times.
- Phone alerts are one JSON `POST` to the ntfy server's root, with an 8-second limit. At most 10 alerts go out in a minute.

## Good to know

- Tasks run only while the app is running. When the window is closed, the app stays in the Dock (the menu-bar icon is Windows only). Nothing runs while the Mac sleeps, and this add-on does not change that. A Mac that slept looks like a closed app to the heartbeat.
- Phone alerts pass through the ntfy service, which can read them. The free service allows 250 messages a day.
- The topic is saved with the app's other settings on this Mac, as plain text.
- You cannot answer from the phone. Open the app to approve or reply.
- The older **Notify** add-on still works beside this one. It runs a command you write; this needs no command.

## Not built yet

- Per-automation mode, model, Web, Depth, Lens, place and budget (steps A9, A18 to A20): they need lab trials of the app's scheduler first.
- Skipping the app's catch-up run when it opens (A12): Plus labels it instead.
- A queue (one automation at a time), chain and file triggers (A13 to A15).
- A hard check that the mode's thread asked before changing several automations (A21: the chat is told to; nothing enforces it).
- Improve: rewriting an automation's instruction from its failed runs (A23).
- Ending a run that has waited too long for an answer.
- An alert when an automation has not succeeded for a set number of hours.

## Code

`lib/runs.js` (the record, late marks, keep rules; tested in `test/runs.test.mjs` and `test/notes.test.mjs`), `lib/alerts.js` (the line, the settings, the two senders, the rate limit, an automation's own choice; `test/alerts.test.mjs`), `lib/notes.js` (heartbeat, created-in modes, recipes for Put back; `test/notes.test.mjs`), `lib/recur.js` (times and plain words for the app's seven kinds of rule; `test/recur.test.mjs`), `lib/mode.js` (the mode and `automation_results`), `lib/preset.js` (each automation's preset, its (i) words and the destination a change sends; `test/preset.test.mjs`), `index.js` (events, the scheduler, the trash, the mode, the tool, the `GET/POST /dsh-automations/data` route: actions run, test, pause, resume, delete, edit, preset, alerts, keep, timeline), `client.js` (the Automations page, the mode's start page, Settings → Alerts).

## Tested

In the lab (web version, stand-in model, a stand-in for the ntfy server): the page listed the automations; **Run now** started a run that showed Running and then Finished with its time, steps, tokens and words; a run whose model returned an error showed Failed with the reason, and **Run again** started a new run; a run that asked a question showed under Needs you, **Open** opened it, and after the answer it went on and finished. Each of these sent the right alert. The Alerts page saved every setting and kept them over a restart; a bad topic and a refusing server were reported in plain words; with alerts for my own threads on, a finished and a failed one each sent an alert. A test alert through `osascript` ran without error on macOS.

Presets (item 7, 21 November 2026): tested with stand-ins only (`test/preset.test.mjs` and four tests in `test/plugin.test.mjs`); the label, its (i) and Change have not been tried in the lab or the real app yet.

Not tested: the real ntfy service and a real phone; whether the Mac notification is visible (only that the command succeeded); the waiting kinds "approval" and "plan review" (unit tests only); an automation run by its schedule instead of Run now; helper agents; the app closing mid-run (unit test only). In the Mac desktop app the owner confirmed that the page and the alerts work; nothing more detailed was checked there.

Lab fixes (21 Nov): `readStoredPresets` before each page answer reads the preset of every 'session' (and reserved 'new_once') thread that is not open: `sessionPersistence.stat(id).header`, then `sessionProjectionCache.cachedSnapshot(header, sessionProjections.summaryKeys()).values.agentPreset`, else `header.agentPreset`; cached 60 s per id. An unexpected scheduler code is a plain sentence with the code in `details` (route answer `{ error, details }`; the page shows it behind Details). Shared dsh-ui block re-synced from the master (portal, multi-line `more`).
