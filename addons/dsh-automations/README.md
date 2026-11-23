# Automations

Add-on `@local/dsh-automations` (dsh 0.2.2-rc.2). Answers "did my automations work, and does anything need me?" in one place, and tells you on this Mac and on your phone.

The app's own scheduler (the **Automation tasks** page) records only that an automation's instruction reached a thread. To learn how it went you open the thread. This add-on follows each run to its end and records the result.

It never answers for you. It changes an automation only when you press a button on its page (pause, switch on, save, change preset, delete, Run now), and moves threads only as described under "Keep past runs".

## Schedule this… (the clock button) and New

Since item 6 (the owner's decisions of 21 November 2026, point 23). Make an automation from any thread, or on this page.

- **The clock button.** A small clock next to Send in every chat box: every space, drafts (once a folder is picked) and started threads, both Split Plus panes. Its tooltip is "Schedule this…". It opens a small window: Instruction (prefilled with what you typed, except in Recon), Name (the first words), When (Once, Every day, Every weekday, On chosen days, Every few hours; your time zone), and Where it runs (In this thread, In one new thread reused, In a new thread each time). Each has an (i). A grey line says the rule and its next run, or what is wrong. **Schedule** makes it through the app's scheduler; the window then says "Scheduled: <name>. Next run: …" with **Open in Automations**. The chat box is cleared only after a confirmed success, and only when its text was what you scheduled. The setting **Clock button in the chat box** hides it. In a very narrow chat box (under 300 px, such as two Split panes beside the sidebar in a small window) the clock steps aside so Send stays in view. The window keeps Cancel and Schedule in view, and opens below the clock when there is more room there. If the time cannot be checked (the app not answering), it says so in plain words, with the raw error behind Details.
- **New** on this page (also in the empty list and on the Automations mode's start page): the same form in a card, for new threads in a mode you pick (never Recon or the Automations mode) and a folder (Scratch, or another folder).
- **Where new threads open.** In the mode the automation was made in (or the one picked on New), with that mode's tools and rules: a Chat automation stays in Chat, Research in Research. Made in the Automations mode, they open in the mode for automations. Details shows **Runs in** (with an (i)) and **Change**; Runs in always names the place the next thread really opens in. Change is not offered, and a grey line says why, for a Finance brief (Finance opens it in Finance), and while the setting is off. "In one new thread, reused" becomes a thread target at its first run (the app does that): from then on Details shows its thread instead of Runs in, and the guard below still watches the mode its thread was opened in. The setting **New threads use the automation's mode** (before item 4A round 2: "New chats open in the automation's tab"; same setting `runsInTheirTab`, with an (i)) off goes back to Settings → Modes → Mode for automations. Automations the assistant or Finance made keep working as before (only the clock button and New write a run mode). "In one new thread, reused" reserves its thread's id when it is made, so that thread moves into its mode as soon as the scheduler opens it, and its first step waits (at most 10 s) for that mode's tools and model. "In a new thread each time" is known only when its message arrives; it moves then, so its tools are right from the start, but its very first step may still use the model of the mode for automations. The New form and Runs in offer only modes that have a place in the Mode list (a mode reached only with /mode, such as Review, is left out).
- **A locked mode always uses its lock.** New threads that open in a mode with a preset lock (item 7) get that preset: when the automation is made, when Runs in changes to that mode, and when the lock is set later (the next look of the guard below writes it). Details → Preset → Change then says where to change the lock instead.
- **Preset of new threads.** The same as the thread it was made from, unless you pick another (collapsed under "Change"). A mode with a preset lock (Settings → Spaces, "Preset in this space") always uses its lock. Written into the automation when it is made.
- **Warnings.** "In this thread" while a Mission runs there: each run's message joins the Mission. Also: after each run, requests that need your yes wait in "Waiting for you" until you write in that chat.
- **Recon.** Allowed like any space, with a warning in the window: the name and instruction can be seen outside Recon (the Automations list, and the assistant's schedule tools in other spaces). The instruction is never prefilled from a Recon box. In Recon only **In this thread** is offered, and the window says why. The reason: a thread the scheduler makes is created outside the Recon room, in the mode for automations, and other add-ons treat it as a normal thread when it is made. For "In a new thread each time" it is known to belong to the automation only when its message arrives. "In one new thread, reused" reserves its thread's id up front, so it could be found earlier, but it would still be created outside Recon and moved in afterwards, which is not the same as a Recon thread made by hand. The server refuses a new-thread target from Recon. The assistant's schedule tools in Recon are held to the same rule whatever the setting: `schedule_create` and `schedule_edit` with target `new` or `new_once` are refused there (Modes). The setting **Scheduling from Recon** (on by default) takes away both the clock button in Recon threads and the assistant's schedule tools in Recon (Tool access could grant those; off, they are fenced and refused, also a permission given earlier).
- **Recon automations are sealed** (new and older ones: written into a Recon thread, or made in Recon): alerts and phone pushes say "A Recon automation"; `automation_results` leaves out their name (and cannot find them by it); deleting one skips the shared trash; Put back never turns one into a new thread outside Recon.
- **A mode switched off.** An automation whose run mode (or, for one made with the clock button into its own thread, that thread's mode) is switched off is paused once, with the note "Paused: its mode <X> is switched off. Switch it on, or change Runs in." Switched on again by you, it is left alone. When the mode comes back, the automation stays paused and its note says "Paused while its mode <X> was off. <X> is on again: switch this automation on when you want." until you switch it on or change it. A mode must be missing on two looks about a minute apart (add-on modes can register late when the app starts), and a pause the scheduler does not confirm in 15 s is tried again at the next look (lab finding: one stuck pause stopped the guard for good). With "New threads use the automation's mode" off, new-thread automations are not watched (their threads open in the mode for automations).
- Helper threads cannot receive automations; a Live Share guest cannot make one (the route refuses guests). The Chat mode keeps no tools: the window posts to this add-on's route, which calls the app's scheduler.
- **Creator Plus saved runs** go through the same path; their times are now sent as HH:mm:ss (before, the app refused them).

## The Automations page

**Automations** is a row in every space of the left panel (since the Automations part, 16 November 2026; before, "Automation runs" and "Automation tasks" were two rows under Cowork only). The app's own editor (custom repeat rules, the folder, its delivery list) is one click away: **App's editor** at the top, or **Open in the app's editor** in an automation's details. The page has these parts:

- **Tiles:** switched on, ran today, missed in the last 7 days, failed in the last 7 days, the next run.
- **Needs you.** Runs that wait for your approval, your answer to a question, or your review of a plan. **Open** takes you to the thread.
- **Missed while the app was closed.** When the app opens after being closed, its scheduler runs each automation once for the latest time it missed, and skips the earlier ones without a record. Plus keeps a heartbeat (one line a minute in `alive.json`), so it can list those earlier times here, each with **Run now** (which runs the instruction now, not for the missed time). A one-time automation that was missed runs late by itself.
- **Your automations.** One card each: an on/off switch (pause, switch on; switching on moves it to its next time, missed times do not run), its rule in plain words ("Every weekday at 08:30", "The first Monday of every month at 09:00"), its mode, its preset (a small label with an (i), see "Presets" below), its next run and last result, **Run now** and **Details**. With automations in more than one mode, chips filter the list by mode.
- **A one-time automation that did not start** (stage 7, owner point 29): one that runs once (a time, a delay, or a rule that repeats once), has ended and has no recorded run (it was due while the Automations add-on was off, or while its space could not take it) stays in the list, marked **Did not start**, with the reason when it is known and what to do next, until you delete it (Details → Delete…; an ended automation is deleted for good, never kept in the trash). A recorded run marks its automation in `tasks.json` (`ran`), so the mark outlives the run in Last runs; for times before that mark existed (`ranSince`), an old one past its keep time stays hidden as before. Other ended automations keep today's behaviour. Tested with stand-ins: `test/plugin.test.mjs` (point 29).
- **Details:** name and instruction (Save refuses when the automation was changed on another page meanwhile), when and where it runs, its mode and where it was created, its **Preset** with **Change**, **Alerts for this automation** (Default, Alert, No alert for fails, needs you and finishes), **Keep past runs**, its last runs, **Open in the app's editor** and **Delete…**.
- **Creator Plus saved runs** (only when Creator Plus is installed, switched on and has saved runs): each run saved on the Creator Plus bar, with its sentence, a day choice (every day, every weekday, or one day of the week), a time and **Schedule**. Schedule makes a thread in Scratch, makes it a Creator Plus thread, and adds an automation ("Creator Plus: <name>", in your time zone) that sends the saved run there. The server refuses a thread that is not a Creator Plus one. The run works as a Long run would and changes nothing in your setup without your yes: Creator Plus's own rules hold in that thread.
- **Timeline:** Day, Week or Month; one lane per automation with finished, failed, missed and coming times, and a line for now.
- **Last runs.** Newest first: how it ended, when it started, how long it took, steps and tokens, and the end of the answer (click it to see more). A run that came more than 3 minutes after its due time says **Ran late: due …**, and **ran when the app opened** when the heartbeat shows the app was closed then (a run held back by a busy thread is late too, without that part). **Open** shows the thread. A run that failed or was stopped has **Run again**.

### Presets

Each automation runs in one of the app's agent presets: **Standard** (the assistant uses its tools step by step), **PTC** (it runs as a program each time: the assistant writes a short program that calls its tools), **Creator** (the app's preset for building add-ons), or one of your own. The page shows it as a small label on each automation, with an (i) that says what the preset does, where it comes from and how to change it. Since item 7 (owner's decision of 21 November 2026, point 22).

- **A thread that is not open.** For an automation that writes into one thread, the page reads that thread's preset from its stored record (the app's list cache of its log, else its header), without opening it. Only when that also fails does it say "Preset not known", and the (i) then says to open the thread once and come back.
- **Where it comes from.** An automation made by the assistant takes the preset of the thread it was made in (the app's schedule tool copies it), so one made earlier from a PTC thread runs in PTC every time. With no preset stored, it uses the app's default preset when it opens a thread; the (i) says which one that is now.
- **Change** (Details → Preset): pick a preset and click **Use it**. Nothing changes until you click; nothing changes by itself, ever. The change goes through the app's own scheduler and is refused, in plain words, when the automation was changed on another page meanwhile. The next run uses the new preset.
- An automation that opened **one thread at its first run** and has run already: that thread keeps its preset, so after a change the next run opens a new thread in the new preset, and later runs go on there. The line under the picker says so.
- An automation that **writes into one existing thread** (for example a Creator Plus saved run) runs in that thread's preset, which the app fixes at its first message. It shows the label but no Change; to use another preset, make the automation again from a thread in that preset.
- Picking PTC shows only "Runs as a program each time." No warning: PTC is a normal choice.
- New automations made from the Automations mode's thread follow that mode's preset rule (Settings → Spaces, "Preset in this space"); this page does not enforce it.

## The Automations mode

A mode of the Modes add-on (Read Only; switch: `tab`). Its start page shows the tiles and **Open Automations**. Its thread has the app's schedule tools and `automation_results`, and is told to list the changes and ask before it changes or deletes more than one automation. It is never offered as the mode automations open in (Settings → Modes leaves it out).

**With spaces (item 4A, stage 3b, built and checked in the lab only):** there is no Automations button in the left panel. The mode stays (the `tab` switch still adds or removes it, and is never used to hide anything). The Automations page gets **Ask about automations** (with an (i)), which asks the left panel to open a new thread in Chat in the Automations mode; the mode can also be picked from the Mode list in Chat. With the mode switched off, the button says to switch on "Offer the Automations mode" on Settings → Alerts: with spaces that is the name of the same switch (field `tab`; "The Automations mode" without spaces). The page's filter names modes ("All modes" under spaces; never a raw id such as creator-plus). The page's tiles now include **Need you**, as the mode's start page had; that start page still shows its tiles on a new thread in the Automations mode.

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

**One Alerts story with Notify (Phase 2).** **Settings → Alerts** is the one place for everything that tells you something happened. Below the automation alerts it shows a group, "When a turn ends or the app waits for you", which is the Notify add-on's settings: your own program to run when a turn ends or the app waits for your approval. It appears only when Notify is installed (the Notify add-on gives the page that group through a small shared hand-over, `dshMerge`, copied identically into both `client.js` files); Alerts works alone without it, and Notify works alone with its own **Settings → Notify** page when Alerts is missing or switched off. Nothing stored moved: both add-ons keep their own setting names and files.

**Settings → Alerts.** A short line when an automation, a Mission or a thread fails, needs you or finishes.

- **Alert me when:** a run failed or was stopped (on), a run needs me (on), a run finished (off).
- **For which runs:** automations always. Threads you start yourself only if you switch that on, and then only when the thread has run at least the minutes you set (2 unless changed), so quick answers at your desk stay quiet.
- **Where:** on this Mac (on) and on your phone (off until set up).
- **For one automation:** its Details can say Alert or No alert for each of the three, over these switches. A run of several automations together follows these switches.
- **Send a test alert** sends one sample to every place that is on and says what happened.

What the line says: fixed words plus one name. For an automation the name is its own, for example `Morning brief failed` or `Weekly review has a question for you`. For a thread you started it is the project folder, for example `A thread in my-site finished`. It never contains your instruction or the answer.

- **Missions (When it needs you, 20 November 2026):** when a Mission starts waiting for you the line says when it ends with no answer, for example `A Mission in my-app is waiting for you (with no answer it ends at 14:05)`, or `(until you answer)`; one such alert per wait. A Mission that finished with something left for you reads `A Mission in my-app finished; some things are left for you (Finish it, above the chat box)`. The add-on passes Mission's `until`, `left` and `canContinue` event fields on; older events read as before.
- **Missions (stage E, 20 November 2026):** a Mission waiting for its model server reads `A Mission in my-app is waiting for your model server (it tries again by itself for up to 2 hours)` (Mission's `stopped-by-itself` with `why: 'down'`, once per outage); one that ended because the server did not answer for 2 hours reads `A Mission in my-app ended: your model server did not answer for 2 hours` (`finished` with `endKind: 'down'`). The restart words are unchanged. Tested: `test/alerts.test.mjs`.

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
    scheduleButton: true   # the clock button "Schedule this…" in every chat box
    runsInTheirTab: true   # new threads of a clock-button or New automation open in its mode
    scheduleFromRecon: true # the clock button and the assistant's schedule tools in Recon (with a warning)
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

`lib/runs.js` (the record, late marks, keep rules; tested in `test/runs.test.mjs` and `test/notes.test.mjs`), `lib/alerts.js` (the line, the settings, the two senders, the rate limit, an automation's own choice; `test/alerts.test.mjs`), `lib/notes.js` (heartbeat, created-in modes, recipes for Put back; `test/notes.test.mjs`), `lib/recur.js` (times and plain words for the app's seven kinds of rule; `test/recur.test.mjs`), `lib/mode.js` (the mode and `automation_results`), `lib/preset.js` (each automation's preset, its (i) words and the destination a change sends; `test/preset.test.mjs`), `index.js` (events, the scheduler, the trash, the mode, the tool, the `GET/POST /dsh-automations/data` route: actions run, test, pause, resume, delete, edit, preset, alerts, keep, timeline, creatorRun, and since item 6 context, preview, create and runTab; the claim of new threads into their mode, the mode-gone guard, Recon sealing), `lib/when.js` (the form's When choices -> the app's timing, the preview line; `test/when.test.mjs`), `lib/create.js` (where an automation may be made and runs, the preset of new threads, the app's refusals in plain words; `test/create.test.mjs`), `client.js` (the Automations page, the mode's start page, Settings → Alerts).

## Tested

In the lab (web version, stand-in model, a stand-in for the ntfy server): the page listed the automations; **Run now** started a run that showed Running and then Finished with its time, steps, tokens and words; a run whose model returned an error showed Failed with the reason, and **Run again** started a new run; a run that asked a question showed under Needs you, **Open** opened it, and after the answer it went on and finished. Each of these sent the right alert. The Alerts page saved every setting and kept them over a restart; a bad topic and a refusing server were reported in plain words; with alerts for my own threads on, a finished and a failed one each sent an alert. A test alert through `osascript` ran without error on macOS.

Presets (item 7, 21 November 2026): tested with stand-ins only (`test/preset.test.mjs` and four tests in `test/plugin.test.mjs`, one with a thread that is not open and one with an unexpected refusal, whose code shows only behind Details); the label, its (i) and Change have not been tried in the lab or the real app yet.

Not tested: the real ntfy service and a real phone; whether the Mac notification is visible (only that the command succeeded); the waiting kinds "approval" and "plan review" (unit tests only); an automation run by its schedule instead of Run now; helper agents; the app closing mid-run (unit test only). In the Mac desktop app the owner confirmed that the page and the alerts work; nothing more detailed was checked there.

## Stage 6a: the space keeps its rules for any mode (item 4A, 22 November 2026: built and checked in the lab only)

- **Made in Recon, any mode.** An automation made from a thread in the Recon space (Research in Recon, say) records Recon as where it was made, so it is sealed like Recon's own: no name in alerts, results or the shared trash.
- **Devices and Workshop.** No clock button there, whatever "Scheduling from Recon" says, and the server refuses an automation from there: "Automations cannot be made from Devices yet: the rules of Devices hold for every mode there. Make it from a Chat or Code thread." "Runs in" by space comes in stage 6b.
- **Creator Plus keeps its clock (owner, after review).** A Creator Plus thread in Workshop (its home) keeps the clock button and makes automations exactly as before 6a, recorded under Creator Plus. Other modes in Workshop, and every mode in Devices (Devices mode never had the clock), still get no clock and the refusal until 6b. Anything Modes cannot plainly say (an unread space, home not stated) refuses; the page hides the clock unless the server answers a plain "not guarded".

## Stage 6b: "Runs in: space · mode" (item 4A, 23 November 2026: built and tested in the lab only)

Stage 6b replaces the Devices and Workshop part of 6a above.

- **Runs in.** Details shows where an automation's runs happen as a pair, for example "Runs in: Code · Research" or "Runs in: this thread (Recon · Research)". An automation made in a Chat thread in Finance runs in Chat · Finance; one made in Code · Research runs in Code · Research. Change offers the pairs the space list offers now (never Recon, never a sealed mode, never the Automations mode), grouped by space, and shows the preset the new place will use before you save.
- **Existing automations do not move.** Nothing is rewritten when you update: an automation made before 6b is shown with the place it already runs in (its mode's own space, or the place the mode for automations gives), its runs are placed exactly as before, it keeps its mode's preset lock, and nothing pauses because of the update. Only when you change "Runs in" does it store a place, and from then on its preset follows that space's lock.
- **Chat and Code: run where set.** A stored Chat or Code place whose mode is no longer ticked there, or whose space is hidden, still runs there, with a line on the page saying so. A mode whose add-on is switched off pauses its automations, as before.
- **Devices and Workshop are never left.** A run set to Devices or Workshop always opens there (also with "New threads use the automation's mode" off). If the space cannot take it now (Devices or Creator Plus off or out of date, the mode no longer ticked there), the automation is paused after two looks a minute apart with a note that names the space and what to switch on ("It was not moved anywhere else"); a run that fires before that is held: its thread opens in that space, nothing runs, and the chat box says why. Nothing pauses in the first two minutes after the app starts (the guard add-ons register late).
- **Guests in Devices and Workshop (owner, point 27).** The clock button shows for another mode in Devices or Workshop while that space's guard is ready. It offers this thread, a new thread in this space · this mode (in the thread's folder), or a new thread in Chat or Code in a mode offered there and a folder you pick. That folder starts empty and is never the Devices folder, /dev, Recon's room, or a folder that holds or lies in them (Devices checks it; if Devices cannot check, it is refused). The Devices mode at home still has no clock; Creator Plus at home keeps its clock as before.
- **The assistant in Devices and Workshop.** A guest's assistant may schedule too. A new-thread automation it makes gets this space · this mode before its answer returns; if that cannot be recorded, the automation is paused at once (deleted if pausing fails). From Devices or Workshop it can change only automations made in that space that still run there (one you moved to Chat or Code is yours from then on) or delivered to its thread; Modes checks the same, and without Automations it refuses every such change; from a sealed thread (Recon, your own sealed modes) only automations that run in that thread.
- **Recon.** Unchanged: this thread only; a New-form folder in Recon's room is refused. "Scheduling from Recon" off covers Recon and your own sealed modes.
- **Automations switched off.** Automations that run in Devices or Workshop are paused with a note while Automations is off (it is what keeps those runs in their space); switched on again, they stay paused until you switch them on. Modes also remembers which automations must stay in Devices or Workshop and holds their runs if nobody places them.
- **Modes off, missing or out of date.** A run set to Devices or Workshop is then never opened as a plain thread: Automations holds it itself (nothing runs until you write in that thread), and two minutes after start those automations are paused once with a note naming Modes; switched on again by you, they are left alone.
- **Creator Plus at home.** Its clock works as before 6b: an automation made there records no guarded space, so it is never watched or paused as a guest's (also not when Automations is switched off).
- **Downgrade.** An older Automations ignores the stored place: pause your Devices and Workshop automations before going back to an older Plus.
