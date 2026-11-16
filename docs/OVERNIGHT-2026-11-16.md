# Overnight work, 15–16 November 2026

You asked me to finish the remaining steps on my own while you slept, without installing or committing anything. Where a step needed your answer, I used my recommendation and built it so it is easy to change. Every such choice is listed here, with the question to confirm in the morning.

Nothing here is installed or committed. Steps 32 and 33 were built earlier in the evening (also not installed or committed).

## In short

- **Scratch** (steps 34 to 44), **Long run** (45 to 64), **Learned skills** (a new add-on, 69 to 87) and the **Automations tab** (88 to 110, with 13, 14 and 42) are built, tested and tried in the lab.
- The full check passes: 42 add-ons, every test suite green. An independent review was done for Scratch and for Automations; every confirmed finding is fixed.
- Some steps are not built, each named below with the reason. Most need a lab trial of how the app's scheduler behaves, or your answer first.
- 17 questions are at the end. The most important ones: 14 (keep the new Automations tab?), 15 (skip the app's late catch-up run?) and 12 (which model reads your conversations for Learned skills?).
- Nothing is installed in your app and nothing is committed. The lab copy (a throwaway test folder) and its fake model are still running; they can be stopped any time.

## Done

### Scratch, step 34: delete and put back with the thread's files

- Delete moves a Scratch thread's own sub-folder into the trash with its messages; Put back returns both; Delete permanently, Empty trash and the 30 days remove both.
- A folder another conversation still works in (a Rerun copy started in the thread's folder) stays until the last of them is deleted; that one takes it.
- Put back never mixes or overwrites: an empty folder made meanwhile gives way; a folder with other files in it stops the Put back, and nothing moves.
- If a thread's folder goes missing (removed by hand), the next turn makes it again, empty, so the thread keeps answering in its own folder.
- New (not in the plan): the app's **Fork** of a Scratch thread gets its own folder that starts as a copy of the thread's files (up to 200 MB; above that it starts empty and the log says why). Without this, a fork would not find files the conversation mentions.
- The delete question for a Scratch thread says the files go too.
- Lab trials 4 and 5 passed (delete, restart, put back, send; folder removed by hand; Rerun copy shares the folder; Fork gets a copy).

**Choice made for you (decision 7):** Scratch threads go through the 30-day trash with Put back, like every other conversation (my recommendation), not "gone at once". Delete permanently is one more click.

### Scratch, step 35: access level

- A Scratch conversation starts (and switches tabs) at Workspace Write at most, so with a Full access preset nothing it does lands in a folder of yours. A tab that sets a lower level (Chat, Research, Data: Read Only) still sets it.
- Full access you pick by hand afterwards stays, through restarts and tab moves.
- Without the Cowork sidebar nothing is capped.

**Choice made for you:** "Scratch threads start at Workspace Write at most" (my recommendation).

### Scratch, step 36: start a Scratch conversation by hand

- A small **Scratch | Folder** switch on the start page of every tab except Recon (Recon keeps its room). Scratch starts a new conversation in Scratch; Folder goes back to the usual project. No tab's start place changes.
- The suggestion chips stay in Scratch while you are in Scratch. The Chat tab hides the folder picker in Scratch too.
- Clicking Scratch twice without writing reuses the same empty conversation.

**Choice made for you (the picker question):** keep the app's own folder picker as it is ("Scratch" appears in it in the app's order) and add the switch beside it (my recommendation).

### Scratch, step 37: mark and list

- Each tab's list has a **Scratch** group (above "Other conversations"). Rerun copies of project conversations stay under "Other conversations".
- A small dashed **Scratch** mark sits in the chat box of a Scratch conversation.
- Show in Finder (right-click) opens the conversation's own Scratch folder.

### Scratch, step 38: Keep in a project

- In a Scratch conversation's ⋯ menu (every tab): **Keep in a project…** Pick the project (and the tab to continue as). Its files are copied into a new folder in that project, named after the conversation ("Plan 2" when "Plan" exists); nothing there is ever replaced. Then a new conversation opens in the project with a mention of the Scratch one. The Scratch conversation stays until you delete it. Copies over 1 GB are refused (copy by hand with Show in Finder).

**Choice made for you:** "Into a new sub-folder named after the thread inside the project, never over an existing file; the Scratch thread stays" (my recommendation).

### Scratch, step 39: dropped files

- A file you drop into a Scratch conversation is copied into its folder under its own name (a different file with the same name becomes "name 2"), before the turn starts, so Data and the PDF reader can open it.
- Found and fixed on the way: **Data used the shared Scratch place as a Scratch conversation's data folder**, so it could have read other Scratch conversations' files and written output into a shared folder. Data now uses the conversation's own folder, and its note says "this Scratch conversation's own folder" instead of a hidden path, and that saved analyses end with the conversation.
- Every Scratch conversation is told it works in its own private folder and that dropped files are copied there.
- Limit: the app keeps its own copy of every dropped file in its attachment store; deleting the conversation cannot remove that copy.

**Choice made for you:** "Plus copies each dropped file into the thread's folder" (my recommendation).

### Scratch, steps 40 and 41: reports and add-on notes

- The trash now tells other add-ons when a conversation is deleted for good (Delete permanently, Empty trash, after 30 days).
- Research and Scout keep saving reports in their usual folders (still listed, still compared for "what is new"). A report made in a Scratch conversation is removed when that conversation is deleted for good. A Research or Scout folder you picked yourself is never touched.
- Scout also removes a deleted Scratch conversation's postings and saved selection; Data its query log and the analyses saved for its folder. Conversations outside Scratch keep everything, as before. Memory facts and Self-improve lessons always stay.

**Choices made for you:** reports "stay in the report folders, remember which thread made them, and are deleted together with the thread"; add-on notes "yes, for Scratch threads, when deleted for good" (both my recommendations).

### Scratch, steps 42 to 44

- **Step 42 (repeating tasks set up in a Scratch conversation): moved to the Automations part.** The app does not record which conversation set up a repeating task, so "warn and pause on delete" needs the record that the Automations tab's step A4 adds. The plan already says to decide there which part owns it.
- **Step 43: Clean up…** beside each tab's Scratch group: asks how many days, then moves every Scratch conversation (all tabs) last used before that date to the trash, after one question. Ones still working, open or pinned are named and left alone.
- **Step 44: start places.** As you decided on 15 November: every tab except Code starts in Scratch; Code in a folder (the open or last used project); Recon in its room. **Settings → Start places** (new page, right under Modes) changes any tab in one click, with a switch for Cmd-N. If Scratch cannot be reached, New starts in a folder as before.
- Found and fixed in the lab: the project list of Keep in a project (and of Chat's Continue in a project) offered the Recon room, which is emptied every time Recon starts. Rooms are now left out.

**Choice made for you:** start places "as decided, switched on in the last Scratch step, each tab changeable" (my recommendation). This is the biggest visible change of the night: a new chat, task, analysis, research or search no longer starts in your last project, and so no longer gets that project's instructions unless you pick the project (the Folder switch, or Settings → Start places).

### Review of the Scratch work (one independent reviewer)

Seven real problems found, all fixed and tested:
1. The working-folder guard let the assistant move to `~` (your home folder): the app expands `~`, the guard did not. Fixed.
2. The guard could be passed with a link inside the thread folder followed by `..`. Fixed: paths are now read the way the system reads them.
3. A dropped file could be written through a link planted under its name. Fixed: never through a link, never over anything.
4. A re-dropped file of the same name and size but different contents was treated as the same file. Fixed: contents are compared.
5. A Fork whose first message carried a dropped file never got the original's files. Fixed.
6. A Fork that had not run yet lost the files if the original was deleted first. Fixed: a Fork gets its copy as soon as it exists.
7. Data could remove saved analyses of a folder a Rerun copy still uses. Fixed.
Also a Scout test that claimed to check report removal did not; it now does.

### Long run (steps 45 to 64)

A **Long run** is a Mission run of its own kind (your `/mission` runs are unchanged): it works on a goal in **laps** (work on the open items, the overall commands, a review) until its **time** or its laps are up.

- **Start it** from the Depth list in the chat box: the last stop, "Beyond Thorough: Long run…", in Code and Cowork only (decision 5), opens a card: the goal, a pre-flight list (folder, git, not isolated, tab, helpers allowed, no run on, model reachable where Route health checks it, Budget guard, alert channel), time, laps, file changes (Restricted, Ask-Auto, Full Auto), and switches: use the full time, keep the Mac awake, also on battery, try again by itself, think by role, and an optional token allowance (off unless set).
- **While it runs**, a one-line card above the chat box shows the lap, items done, time left, tokens and the step under way, with Pause / Resume, Finish this lap, End, and the checklist on request. The app's own goal strip is hidden then (its Edit and Clear would confuse a run).
- **Laps as the limit** (decision 1): steps and reviews are worked out from laps, past /mission's 300 if need be.
- **Early stop** (decision 2): once the list is done, extra laps look for weak spots; it stops after two laps in a row find nothing, unless "Use the full time" is on.
- **The gate**: once the overall commands have passed, a lap that makes a passing command fail (still failing when run a second time) is **undone**: the folder goes back to the lap's start, the undone work is kept as a checkpoint the report names, and the lap's items are open again. Tested for real on a throwaway folder.
- **Notes between laps** are kept by the add-on and given to the planner, workers and reviewer; the conversation's own model stays locked to the step tool.
- **Think by role**: planner and reviewer High, workers Medium (same model); Model Tiers leaves those helpers alone, every other agent is unchanged.
- **Watchdog**: if the app stops giving the run rounds while it runs (your server did not answer), the run notes it, tells you, and tries again up to 3 times (2, 5, 10 minutes later), never after your own pause. After the app restarted it waits for one click (Resume on its card).
- **Keep the Mac awake** with macOS's caffeinate while a Long run is on and the Mac is on power (battery only if ticked); it ends with the run or the app.
- **Alerts**: a new switch on Settings → Alerts, "Mission and long runs" (on): when a run ends, needs your yes, or stops by itself, for /mission runs too. Never per round; the alert names the project folder, never the goal. The rounds of a running run no longer fire "own conversation" alerts or Notify rules one by one; Notify fires once at the run's end.
- **The morning report**: a finished run's card shows its summary line, with the full report on request.
- **Settings → Mission** has a "Long runs" section with the defaults (one place, as you chose).
- **Data and Research**: `/mission` and Long runs are refused there and say why (your Read Only decisions stay; a Data long run is "later").
- **Source grades in research reports (step 64)**: each source gets Primary (the writer model's judgement), Confirmed (every claim citing it also cites another address) or Single beside its read label; claims resting on one source are listed after the answer; the read labels are unchanged.
- Lab: a Long run in Code started from the Depth list's card, ran its laps with the fake model, hid the app's goal strip, showed the card, and ended by itself after two empty laps with "Long run complete" and the reason in its report. Found in the lab and fixed: the card's checklist ran under the chat box (now folded until asked), and the git line read like a problem when git was there.

**Choices made for you** (all my recommendations): Long run separate from /mission; laps on the card, steps worked out; stop after two empty laps with a full-time switch; undo at once only after the checks first passed; notes kept by the add-on; effort by role for Long runs only; card above the chat box with the app's strip hidden; alerts for Long and /mission runs with quiet rounds; retry up to 3 times; keep awake on power; one click after a restart; Data and Research refuse for now; grades pass with a label; no Lens for the reviewer (already true: helpers never get the Lens); Long run defaults on Settings → Mission; Code and Cowork first; the morning report is the run's own report with its summary.

**Not built, on purpose:** step 62's saved presets (defaults only); step 65 (Research long runs: your chosen answer was "Not in Research"); step 66 (Data long runs: "later"); steps 67 and 68 ("later" in the plan); the Automations queue during a run (needs the Automations tab's queue, A13).

### Skill architect (steps 69 to 87)

A new add-on, **Learned skills** (Settings → Learned skills), so Self-improve stays as it is.

- **What it does:** reads past conversations for corrections you typed, Stops, thumbs down with a note and feedback; asks a reading model you pick for proposals; you accept or reject each one. A skill goes into the add-on's own library; a fact into Memory; a rule into the project's instructions (as a new version you can put back).
- **Kept safe:** Recon conversations, helpers, Self-improve's test runs, the trash and conversations marked Never learn from this are never read. If the Modes add-on is off, it reads nothing. Secrets, e-mail addresses and your home folder are removed. A model on the internet needs a tick, and you must look at what it would send first. Engines cannot be the reading model.
- **Tests:** 11 for this add-on. Lab: the page shows; a skill added by hand appears in the app's skill list; a name clash with an existing skill was refused; the reader left out 133 helpers and 11 Recon conversations; a learning run with the fake local model sent no Recon text.

**Choices made for you** (all my recommendations): its own add-on, not inside Self-improve; reading model on this Mac or your network by default, internet only with a tick plus a preview; a Never learn from this mark per conversation; quotes kept until you decide or the conversation is deleted for good; learned skills reach every tab by default; Start clean as a list on the add-on's page; learning by itself off.

**Not built:** the per-conversation Skills row in the Tools panel and the Long run row (72, 75: the app does not tell a skill provider which conversation is asking); the card on the project page (73, a list on the add-on's page instead); filing model habits and tab lessons into Self-improve (82: shown for you to add by hand); retirement proposals (84); Research reports as a source (86). Use counts count loads only (83).

### Automations tab (steps 88 to 110, with 13, 14 and 42)

- **One Automations page, a row on every tab** (A8): tiles (on, ran today, missed, failed, next run), Needs you, Missed while the app was closed, one card per automation with an on/off switch, its rule in plain words and its tab, a Details panel, a Day/Week/Month timeline, and the runs. The two old Cowork rows are gone; the app's own editor is one click away on the page.
- **Late runs and missed times** (A2, A3): a run that came more than 3 minutes late says so, and "when the app opened" when Plus's heartbeat shows the app was closed then. The earlier times the app skipped are listed as Missed with Run now. A small engine (`lib/recur.js`) computes times for all seven kinds of rule the app has, following the app's own code.
- **Created-in tab** (A4) and **filter by tab**: from the conversation that asked the assistant to make it; "not known" for ones made on the app's page.
- **The Automations tab** (A5): a tab of its own whose start page shows the tiles, and whose chat has the schedule tools and a new tool, `automation_results`, that answers questions about past runs (A22). It is never offered as the tab scheduled tasks run in.
- **Details** (A7): change the name and instruction (refused if changed elsewhere meanwhile), own alerts (A17), keep rule (A11), Delete, Open in the app's editor.
- **Deleted automations to the trash** (A10, step 14): deleted anywhere, even by archiving its conversation, a copy stays in the trash for 30 days; Put back makes it again.
- **Old runs** (A11, step 13): kept per automation by days or count; for automations that open a new conversation at every run, the old runs' conversations go to the trash through the Cowork sidebar's trash (never a shared, pinned or working one).
- **Step 42** (Scratch): Clean up leaves alone a Scratch thread an automation still writes into, and names it; deleting a thread keeps its folder when an automation opens its conversations there.
- A1 (step 88) was already done on 15 November (step 4).

**Lab** (web lab, fake model): the page, tiles, cards, Details, pause and switch on (a stale change was refused), own alerts, name change; delete → the tab's Trash list → Put back made it again; the lab app closed 00:32 to 00:36 with a once-a-minute automation: exactly the three skipped times were listed as Missed; the Automations tab with a clock icon, tiles under the chat box, and its chat got exactly its 7 tools and `automation_results` answered from the record. Found and fixed in the lab: a new automation was labelled with the tab of the conversation the app had only reserved for it; the tab's tiles sat beside the folder picker.

**Review** (one independent reviewer; 12 findings, all fixed or answered): (1) a Recon conversation's last words could be kept and quoted by `automation_results`, and without Modes the tool read conversations: now nothing of an isolated conversation is kept, and unknown counts as isolated; (2) a deleted automation lost its tab before reaching the trash (also caught by a new test); (3) one deleted while the trash was off was lost: now held and filed later; (4) old runs were dropped while the trash was not ready: now only when it is; (5) Put back could make a second copy if pausing failed; (6) Save in Details could undo a change made elsewhere: it now sends the version it started from; (7) Run now could show "Ran late"; (8) a run's conversation you went on with could go to the trash by age: now never; (9) Clean up did not spare threads of a paused automation; (10) an unreadable mode table could be written over; (11) Missed counted times outside the 7 days, and the minute before the app closed; (12) a timer after each run was not cleared. Not changed: switching the add-on off leaves the tab until its switch is off (as Research does). Tests: Automations 50; two fixes reverted on purpose each made a test fail.

**Choices made for you** (all my recommendations): one Automations row on every tab with the app's editor inside the page (question 1); deleted automations go to the trash (question 7); old runs: Plus drops only its own record of shared conversations (question 4); the app's catch-up run is labelled, not skipped (question 3, option 2, because option 1 needs a lab proof that Plus is always quicker than the app); Scratch threads an automation uses are left alone (question 9); an automation that writes into a conversation you use keeps that conversation's settings (question 8, nothing built that changes them).

**Not built, on purpose or for lack of a lab proof:** A9 (each automation's own tab applied before its first step: needs lab trial 5), A12 option 1 (skipping the catch-up run), A13 queue, A14 chain trigger, A15 file trigger (each needs lab trials 6 to 9 on how the app's scheduler can be held or fed text), A18 to A20 (own model, Web, Depth, Lens, place and budget per automation: need A9), the hard check in A21 (the tab's chat is told to ask before changing several; the app has no hook to stop a tool call), A23 Improve.

## Questions for the morning

1. Decision 7: through the 30-day trash (built) or gone at once?
2. Fork copies the thread's files (built, 200 MB cap). Keep it?
3. Scratch starts at Workspace Write at most (built). Keep it?
4. The Scratch | Folder switch beside the app's picker (built). Fine?
5. Keep in a project copies into a new sub-folder named after the conversation (built). Fine?
6. Dropped files are copied into the Scratch folder (built). Fine?
7. Reports and add-on notes of a Scratch conversation go when it is deleted for good (built). Fine?
8. Start places: every tab but Code starts in Scratch (built, as you decided on 15 November). Still what you want, now that you can try it?
9. Long run: try one in the Mac app (Code tab, Depth list, last stop). Are the card's defaults (120 minutes, 10 laps, Restricted) right for you?
10. Run alerts are on by default for /mission runs too. Keep that?
11. Learned skills is its own add-on (Settings → Learned skills), not part of Self-improve. Fine?
12. Learned skills: which model should read your conversations? It needs one on this Mac or your network, or your tick for an internet one.
13. Automations: the page is now one row on every tab, and the two old Cowork rows are gone. Fine?
14. Automations: a tab of its own was added to the sidebar (that makes one more tab). Keep it, or only the page?
15. Automations: when the app opens after being closed, it still runs each automation once, late (labelled "Ran late"). Should Plus try to skip that run instead (needs a lab trial first)?
16. Automations: old runs' conversations of automations that open a new conversation each time go to the trash by themselves (on). Keep that on?
17. Which of the not-built Automations steps do you want next: queue, chain trigger, file trigger, own settings per automation, or Improve?

## Answers (16 November, morning)

- **Kept as built:** 1, 2, 3, 4, 5, 6, 7, 10, 11, 13, 14 (the Automations tab stays), 15 (the late run stays labelled, not skipped), 16.
- **8, start places:** kept as built for now; the owner tries it and changes single tabs in Settings → Start places if needed.
- **9, Long run defaults:** open until the owner has tried a run.
- **12, Learned skills reading model:** an internet model, with the owner's tick (and the preview of what it would send). Nothing preset in the repo; the owner picks it on the Learned skills page.
- **17, next Automations parts:** all four, starting with own settings per automation (A9, A18 to A20), then the queue (A13), chain and file triggers (A14, A15) and Improve (A23). Each starts with its lab trials.
