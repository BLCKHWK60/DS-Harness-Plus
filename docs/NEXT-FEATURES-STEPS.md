# Next features: the step-by-step build plan

Written 2026-11-15 from step 0 of "DeepSeek Harness Plus next features plan" (the plan you wrote). Step 0 built nothing: seven analysts checked each part of the plan against the code of version 0.57.0 and the app's own source, and an independent verifier checked each analyst.

**How this works.** One feature per step. Before a step that changes something already built, you are asked in plain words and nothing is changed until you answer. Each step is built, tested, tried in the lab and shown to you before the next one starts. Nothing is installed or committed unless you ask.

**At a glance.** 110 steps in seven parts. 76 places where the plan would change something built and needs your yes; each is asked just before its step. The plan's note that the 26 decisions of 15 November are "not built yet" is out of date: all 26 were built in 0.57.0, so several of the plan's "built today" rows have changed (listed per part under "Where the plan is out of date").

| Part | Steps | Questions for you |
|---|---|---|
| Trash and tabs | 15 | 6 |
| Depth and per-tab settings | 8 | 8 |
| Lens | 8 | 9 |
| Scratch | 13 | 10 |
| Long run | 24 | 21 |
| Skill architect | 19 | 13 |
| Automations tab | 23 | 9 |


---

## Trash and tabs

### What already does part of this job

- **30-day trash for conversations. Delete first archives a conversation (the app's own archive), then moves its folder, its list-entry cache file and its helper conversations into <home>/trash/conversations/<id>/ with an info.json. Put back moves them back; the conversation stays archived, so it returns to the Archived list. One the app still holds in memory is only written to pending.json; its files move at the next tidy once the app has let go of it (tidy runs at each start and every 6 hours; in practice the next start). Moved items older than 30 days are removed at each tidy.** (addons/dsh-cowork-shell/lib/trash.js (openTrash: list, add, addPending, restore, purge; KEEP_MS 30 days); addons/dsh-cowork-shell/index.js 648-758 (route /dsh-cowork-shell/trash: GET list, POST delete|restore; remove() refuses a conversation that is not archived; tidy at start + setInterval 6 h); addons/dsh-cowork-shell/test/trash.test.mjs (5 tests); README 'Deleting'). Plain file moves (renameSync, copy then remove on EXDEV) because the app has no way to delete a conversation (dsh-workspace only has archiveSession/unarchiveSession). Only folders that hold a session.*.jsonl file are moved; only folders inside the trash are removed. purge() looks only at moved items, so a waiting item is never removed by the 30-day rule; tidy() keeps a waiting item for ever (warning each time) when its conversation can no longer be found.
- **Delete and Trash in the sidebar: Delete in the ⋯ menu, in the right-click menu (several at once with Cmd-click or Shift-click, one confirmation), and next to Restore in each tab's Archived list. Every tab ends with 'Trash (n)', which lists every deleted conversation from every tab (not filtered by tab), with days left and Put back. There is no 'Delete permanently' and no 'Empty trash'.** (addons/dsh-cowork-shell/client.js createTrash 1671-1698, remove/putBack 1953-1971, archiveQuietly 1934-1945, removeMany 2019-2035, trashSection 2153-2168 (bin.items unfiltered), archivedSection 2169-2187, deleted set 1822-1823). The client polls the trash route every 60 s; ids in the trash are hidden from every list, the Needs you block and the tab's remembered conversation. A conversation that is busy, or that an active automation delivers into, makes the app refuse the archive; Plus then asks 'This conversation is still working. Stop it and delete it?' and archives with stopActivity.
- **Recon 'End and wipe': forgets sources, trail and cloud consent, stops Tor, archives the conversation (with stopActivity) and deletes its folder and cache file without the trash. Because the command is typed inside the open conversation, the files are normally deleted at the next start (Recon retries every minute and at start; whether the app lets go of an archived conversation before a restart is not verified). Until then the conversation sits in the Recon tab's Archived list with Restore and Delete.** (addons/dsh-recon/lib/wipe.js; addons/dsh-recon/index.js 491-566 (endAndWipe, sweep every 60 s), 602-604 (/recon end and /recon wipe); README 'End and wipe'; Settings → Recon text (client.js 421-426)). Typed command only; no button or menu item. wipe.json holds ids only. wipeFiles refuses a folder whose name is not the conversation id; its 'inside the conversations folder' test uses a root derived from the folder itself, so it adds little (the folder comes from the app's own session list, so the risk is low). Helpers are not wiped; an isolated conversation gets no helper tools.
- **Automation runs record (Plus): the last 200 runs of all automations together, newest first, each with task names, times, step and token counts and up to 400 characters of the answer's end; older lines are dropped for good** (addons/dsh-automations/lib/runs.js (RUNS_MAX 200, TEXT_MAX 400), addons/dsh-automations/index.js; the 'Automation runs' page is listed under the Cowork tab only (cowork-shell DEFAULT_TABS cowork.pages)). Listens to scheduler messages and turn events; each run keeps its conversation id; Open uses uiWorkspace.openSession
- **The app's own scheduler: delivery records per task, 30 days or 200 records, one setting for all tasks in the configuration file only. Only target kind 'new' creates one conversation per run; 'session' and 'new_once' deliver every run into one conversation. Archiving a conversation that an active task delivers into is refused; archiving it with 'stop' (what Plus does after 'Stop it and delete it?') makes the app delete those tasks and their records for good. A paused task survives and is later refused with schedule/target-archived. Deleting a task on the Automation tasks page removes it and its records for good, conversations kept.** (/tmp/dsh-asar/rc2/dsh-schedule/src/index.ts 79-102 (deliveryHistoryDays/Records), 155-159 (activeSessionTasks), 319-341 (archive admission and stop), 742-756 (stopSessionTasks); src/types.ts 353-373 (targets); src/runtime.ts 299-313, 424-430; dsh-client-ui-schedule/README.md (deletion, links to missing or archived conversations disabled)). The scheduler answers the registry's 'workspace/session-activity' and 'workspace/session-stop' hooks
- **Sidebar tabs: every tab is a mode. First the first maxTabs modes of the Modes table (object key order, so modes you added count too), then every add-on mode in extraModes order. With more than three tabs they sit in rows of three. Each tab shows icon and name in the wide sidebar; a long name is cut with an ellipsis; the hover name shows only in the collapsed rail. Your own modes have no icon of their own: they show a small dot. Clicking a tab writes modes.defaultMode.** (addons/dsh-cowork-shell/client.js tabsOf 475, glyphFor 977-979 ('dot' for other ids), refresh 1009-1046, select 1049-1080, Tooltip 1165-1168, tab bar 2476-2482, CSS 757-766; index.js Config maxTabs 299 (1-5, default 3); sidebar width 264-420 px (/tmp/dsh-asar/rc2/dsh-client-ui-layout/src/client/columns.ts 13-15)). Research, Finance, Recon, Scout and Data add themselves with {...table, [MODE_ID]: MODE} and delete their key when switched off, so switching one off and on moves its tab to the end. History: 0.27 hid icons with more than three tabs, 0.33 put them back in rows of three, 0.53.0 hid them above six tabs, 0.53.1 brought them back at the owner's request and he said 'Resear…' was fine (HANDOFF 0.53.0/0.54.0 entries).
- **Tab-count control (decision core-8, built in 0.57.0): Settings → Modes → Sidebar → 'Tabs in the sidebar' 1-5, saved into the Cowork sidebar's maxTabs; mode cards beyond the count warn 'No sidebar tab'; /mode before the first message names the tabs (core-10) in sidebar order** (addons/dsh-modes/client.js withoutTab 1209-1211, saveTabs 1419-1438, control 1495-1502, warning 1536; addons/dsh-modes/lib/tabs.js (tabCount, sidebarTabs, beforeFirstMessage)). Mode cards can be added or removed, not reordered; the order of the Modes table decides which own modes get a tab
- **Per-tab memory of the last open conversation and of the selected tab, keyed by tab id; arrow, Home and End keys move between tabs** (addons/dsh-cowork-shell/client.js LOCAL_KEY 23, LAST_KEY/readLast/writeLast 1700-1715, switchTab 2435-2447, onTabKey 2448-2459). localStorage, shared by all windows of the app on this Mac; keyed by mode id, so a new order would not disturb it
- **Global Search groups results by tab in its own fixed order (Modes table, then extraModes) and never shows isolated (Recon) conversations (x-6)** (addons/dsh-search/client.js 81; addons/dsh-search/lib/hidden.js). Reads modes.modes and modes.extraModes directly; would not follow a custom tab order unless changed
- **Needs you block: waiting conversations of every tab, Recon included, show at the top of every tab with their title** (addons/dsh-cowork-shell/client.js needsIds 2134-2152). Not filtered by tab or isolation; so Recon titles already show outside the Recon tab today
- **Per-conversation choices are forgotten once per start for conversations whose files are not found, which includes conversations in the Plus trash** (addons/dsh-modes/index.js pruneStale 1350-1387 (sessionModes, sessionWeb, sessionResearch, sessionSearchDepth, sessionTools, sessionHelpers, sessionIsolated, sessionToolSets, sessionSandboxBase), run from agent/created 983; addons/dsh-model-tiers/index.js pruneStale 2140-2189 (activeTiers, sessionProfiles)). persistence.stat(id) === undefined means gone; the jsonl store looks for <project>/<id> under its own root (/tmp/dsh-asar/rc2/dsh-session-persistence-jsonl/src/index.ts 483-498, findLog 1575-1590), and the trash is outside that root
- **Where a deleted conversation still exists elsewhere: the app's full-text search index drops its rows at the next search once the files are gone; Sync removes it from the remote at the next push and the other Mac deletes its own copy at its next pull (not into a trash), while the git history keeps it; Put back brings it back at the next push and pull. Some Plus records keyed to a conversation stay (for example an automation run's last 400 characters).** (/tmp/dsh-asar/rc2/dsh-session-query-sqlite/src/index.ts 407-481, 571-576; addons/dsh-sync/README.md 56-68; addons/dsh-automations/lib/runs.js). Search reconciles against the persistence list; Sync mirrors the session store and never rewrites git history
- **Shared settings copies the Cowork sidebar's settings (maxTabs and any new tab-order field) to the second Mac, but keeps modes.extraModes per Mac** (addons/dsh-shared-settings/index.mjs ALWAYS_SKIP 32-41, DEFAULT_SKIP 43-51, PLUS_SCOPE). So the two Macs can have different add-on tabs while sharing one tab count

### Where the plan changes something built (needs your yes)

- **Today:** Plan row 'Up to three built-in tabs plus one per switched-on add-on tab, in a fixed order' is stale: since 0.57.0 (core-8) Settings → Modes → Sidebar sets the count 1-5 and warns on modes without a tab; the count takes the first N modes of the Modes table (your own modes included); add-on tabs follow in the order their add-ons were switched on; nothing can be reordered
  **The plan:** An edit icon beside the tabs switches on drag and drop; the order is remembered
  **Conflicts with:** core-8 (the tab count counts the first N modes of the mode list, and the 'No sidebar tab' warning depends on that order); core-10 (/mode names the tabs in sidebar order)
  **Question:** Today the sidebar shows your first 3 modes (the number is 'Tabs in the sidebar' on Settings → Modes) and then every add-on tab such as Research or Finance, in the order you switched them on. The plan lets you drag the tabs into your own order. Should dragging only change the order you see, or also the order of the modes on Settings → Modes, which decides which of your modes get a tab at all?
  **Options:** A: Only the order you see. The tab count and the mode list stay as they are; Global Search and /mode list the tabs in your order too; an add-on tab you switch off and on comes back in its place; 'Reset order' puts it back (recommended) / B: Dragging also reorders the mode list on Settings → Modes, so dragging one of your modes past the tab count takes its tab away / C: Replace the tab count: the edit mode lets you show or hide each tab as well as move it (the 'Tabs in the sidebar' setting and its warning would go)
  **Recommendation:** A. Nothing built changes meaning, no tab can disappear by being dragged, the 'No sidebar tab' warning keeps working, and the order is stored as tab names, so a later Automations tab can be placed too.
- **Today:** Wide sidebar: each tab shows its icon and name, three per row once there are more than three tabs; a long name is cut ('Resear…'); the full name shows on hover only in the folded rail. Your own modes have no icon, only a small dot. The owner asked for the icons back in 0.53.1 and said 'Resear…' was fine
  **The plan:** A tab whose name does not fit shows its icon alone, with the full name on hover; no name is cut off
  **Conflicts with:** built behaviour chosen by the owner in 0.53.1 (icons with names, cut names accepted)
  **Question:** Today 'Research' shows as its icon plus 'Resear…'. The plan would show only the icon for a tab whose name does not fit (Research now, Automations later), and the full name when you point at it; the other tabs keep icon and name. Modes you made yourself have no icon of their own, only a small dot, so for them the icon alone would not say which mode it is. Which do you want?
  **Options:** Icon alone for built-in and add-on tabs whose name does not fit; your own modes keep their name, cut if needed; full name on hover for every tab (recommended) / Keep 'Resear…' as it is, and only add the full name on hover / Two tabs per row instead of three, so more names fit, at the cost of more rows
  **Recommendation:** The first. It is the plan's way without leaving blank dots. Note: the sidebar can be 264 to 420 pixels wide, so a tab may switch between icon only and icon with name when you resize it.
- **Today:** A Recon conversation deleted from the list (⋯, right-click, Archived list) goes to the common 30-day trash like any other, and its title then shows in the Trash list under every tab. Recon titles already show on every tab in the 'Needs you' block while they wait for you. x-6 only keeps Recon out of Global Search and Sync
  **The plan:** Everything goes to the trash; the one exception is Recon's End and wipe, which stays as built; 'Empty trash' deletes everything in it
  **Conflicts with:** none built; touches the spirit of x-6 and the 15 November answer 'nothing from Recon goes anywhere else in the harness'
  **Question:** When you delete a Recon conversation from the list (not with /recon end), it goes to the trash for 30 days, and its title shows in the Trash list of every tab, Chat and Cowork included. With 'Empty trash' added, emptying it from the Chat tab would also erase Recon's. Should that change?
  **Options:** Leave it as it is: one trash for all tabs / Each tab lists only its own deleted conversations, the way the Archived list already works; 'Empty trash' empties only that tab's (recommended) / Only Recon's deleted conversations are kept apart, under the Recon tab; all other tabs share one list / Make Delete on a Recon conversation do End and wipe: gone at the next start, no undo
  **Recommendation:** Each tab lists only its own, like Archived. You keep 30 days to undo a mistake, Recon titles stay in the Recon tab, and 'Empty trash' never reaches into another tab. It needs the tab of a deleted conversation to be kept, which the Put back fix below does.
- **Today:** Deleting an automation on the app's Automation tasks page removes it and its run records at once, for good (its conversations are kept); 'clear ended tasks' does the same for ended ones
  **The plan:** 'Everything you delete goes to the trash', but the list names only conversations, Scratch threads and old automation runs; the Automations tab can delete automations
  **Conflicts with:** built behaviour of the app (task delete is immediate); cross-part with the Automations tab
  **Question:** Today, deleting an automation removes it and its list of past runs at once, for good; its conversations stay. The plan says everything you delete goes to the trash but does not name automations. Should a deleted automation go to the trash too?
  **Options:** Yes, from the Automations tab: Plus keeps its instruction, timing and settings for 30 days, and Put back creates it again; the app's own list of its past runs cannot be brought back (recommended) / No: deleting an automation stays immediate, after a confirmation, as today
  **Recommendation:** Yes, built together with the Automations tab (plan step 16 or later), because an automation is more work to set up again than a conversation. Its old run records are the app's and cannot come back; say so in the trash.
- **Today:** Plus keeps the last 200 automation runs of all automations together, as list lines, and drops older ones for good; the app keeps its own records per task (30 days or 200, one setting for all, configuration file only); conversations made by runs are never removed; automations that reuse one conversation put every run into it
  **The plan:** Past runs kept per automation by time, by count or both (hourly one week, daily one month, weekly six months, monthly one year); older runs go to the 30-day trash
  **Conflicts with:** built behaviour (RUNS_MAX 200 in dsh-automations; the app's own record keeping)
  **Question:** When an automation's old runs 'go to the trash', what should go there? A run is a line in the runs list, and only automations that start a new conversation every time also have one conversation per run. For automations that reuse one conversation, every run is inside that one conversation, and deleting it would also delete the automation.
  **Options:** The conversation each run created, only for automations that start a new conversation every time; the line in the runs list simply drops off; shown in the trash as one row per automation (recommended) / Also put the run's line in the trash so it can be put back with its conversation / Nothing to the trash: old runs drop off as today, only now per automation
  **Recommendation:** The first. It is the only part that is worth putting back, it never touches a shared conversation (so it can never delete an automation), and one row per automation keeps the trash readable (an hourly automation would add about 24 a day).
- **Today:** A deleted conversation goes to the trash only as its stored messages; the trash moves only folders that hold a conversation's own files
  **The plan:** Scratch threads are deleted 'messages and files together' through the 30-day trash; the plan's open decision 7 asks whether they should instead be gone at once, as the owner asked earlier
  **Conflicts with:** the owner's earlier request (gone at once); cross-part with Scratch
  **Question:** Deleting a Scratch thread: should it go through the 30-day trash with its files, like other conversations, or be gone at once, as you asked earlier?
  **Options:** Through the trash, files included; 'Delete permanently' is one more click (recommended) / Gone at once, no trash
  **Recommendation:** Through the trash: a thread kept for months and deleted by mistake can be put back. The trash then needs a second kind of item, the thread's own hidden folder, removed only if no other conversation (a Rerun copy) still uses it.

### Changes that need no decision

- Today: Delete moves a conversation into a 30-day trash with Put back; removal after 30 days at start and every 6 h; no way to delete for good before then (route accepts delete and restore only) Plan: Add 'Delete permanently' per item and 'Empty trash' after one confirmation
- Today: Bug (code-checked, to confirm in the lab): after /recon end the conversation is archived and still listed in the Recon tab's Archived list with Restore and Delete. Delete puts it on the trash's waiting list; at the next start the trash's tidy and Recon's sweep race. If the trash runs first, the files move into the trash and Recon marks them done (kept 30 days, against End and wipe's promise). If Recon runs first, the files are deleted and the trash keeps an entry that can never move (warning every 6 hours, shown in Trash for ever). Restore brings it back to the list, but Recon still deletes its files at the next start Plan: End and wipe stays as built and never uses the trash
- Today: Bug (code-checked): a deleted conversation that waits to move (it was open) and whose files are then gone (wiped by Recon, removed by a Sync pull, or by hand) is never removed: tidy keeps it and purge skips waiting items, so it shows in Trash for ever with '0d left' Plan: After 30 days an item is removed for good, as today
- Today: Bug (code-checked, to confirm in the lab): Modes and Model Tiers forget per-conversation choices once per start for conversations whose files are not found, and a conversation in the trash counts as not found. 'Put back' after a restart then returns it without its tab record (it lands in Chat, Cowork or Code by its folder), Web level, Tools, helper and added-tool choices, tier and model, earlier access level and, for Recon, its isolation mark. For such a Recon conversation, tool and mention fencing, Mission's refusal (x-2), Global Search and Sync exclusion (x-6) and the rebuild after restart (recon-8) no longer apply; Recon's cloud-model guard still holds while Recon tool answers are in its history Plan: The trash keeps Put back for 30 days for conversations, Scratch threads and old automation runs, so Put back will be used more
- Today: Deleting or archiving a conversation that an active automation delivers into (one that reuses one conversation): the app refuses, Plus asks 'This conversation is still working. Stop it and delete it?', and on yes the app deletes the automation and its run records for good. Put back does not bring the automation back Plan: Everything you delete goes to the trash; old automation runs go to the trash
- Today: Every sidebar tab is a mode: tabs come only from the mode tables, and clicking one sets the mode new conversations start in (modes.defaultMode) Plan: An Automations tab that is a dashboard first and a chat second, placed among the tabs and covered by the tab order
- Today: Shared settings copies the Cowork sidebar's settings to the second Mac, while each Mac keeps its own add-on tabs Plan: The tab order is remembered

### Where the plan is out of date

- The plan says: Read this first, rule 2: part 11 of MODES-AND-SETTINGS.md holds 26 decisions 'that are not built yet'
  In fact: All 26 were built in 0.57.0 (section 13 and the HANDOFF 0.57.0 entry). For this part core-8 (tab count), core-10 (/mode names the tabs), x-2 and x-6 matter.
- The plan says: Built today: 'Up to three built-in tabs plus one per switched-on add-on tab, in a fixed order, with long names cut off'
  In fact: The count is 1 to 5 on Settings → Modes → Sidebar (core-8), it counts the first modes of your mode list (your own modes included), and add-on tabs follow in the order their add-ons were switched on. Long names are cut, as stated.
- The plan says: Trash: 'Everything you delete goes to the trash for 30 days'
  In fact: Only conversations deleted in the Cowork sidebar go to the trash. Deleting an automation is immediate and removes its run records (the app's own behaviour); deleting or archiving a conversation that an active automation delivers into deletes that automation for good after a 'still working' question. With Sync on, the other Mac deletes its copy directly at its next pull. Other deletes in Plus (own project types, Memory facts and so on) are immediate.
- The plan says: 'Delete permanently' and 'Empty trash' delete for good
  In fact: They can erase the trash folder only. Copies remain in Sync's git history (when Sync was on before the delete), in backups such as Time Machine, and in a few Plus records keyed to the conversation (for example an automation run's last 400 characters). The app's search index drops the text at its next search.
- The plan says: 'Older runs go to the 30-day trash'
  In fact: A run is a line in Plus's runs list (last 200 overall) plus, only for automations that start a new conversation each time, one conversation. The app's own delivery records cannot be kept per automation (one setting for all, configuration file only). For automations that reuse one conversation there is nothing that can go to the trash without deleting the automation.
- The plan says: 'Recon's End and wipe removes a Recon conversation at once and never uses the trash'
  In fact: It is the typed command /recon end, not a button. It is typed inside the open conversation, so the files are deleted when the app lets go of it, normally at the next start. Until then the conversation is archived and listed in the Recon tab's Archived list with Restore and Delete, and Delete there can put it into the trash (bug).
- The plan says: 'After 30 days an item is removed for good, as today'
  In fact: True for items whose files have moved. An item still waiting to move whose conversation has disappeared is never removed and stays in the Trash list (bug).
- The plan says: 'A tab whose name does not fit shows its icon alone'
  In fact: Modes you add yourself have no icon of their own (a small dot), so for them the icon alone would not identify the tab.

### What the app allows

| Needed | Available | Evidence |
|---|---|---|
| Delete a conversation through the app | no | dsh-workspace/src/index.ts has archiveSession and unarchiveSession only; no delete API anywhere in /tmp/dsh-asar/rc2 (only the search index's own _deleteSession). Plus moves files, as built. |
| Know whether the app holds a conversation in memory | yes | sessions.get(id) (dsh-session/src/index.ts 1455), used by the trash and by Recon's sweep |
| Make the app let go of an open conversation so it can be erased at once | unknown | Archiving does not detach it (dsh-workspace archiveSession); a detach exists inside dsh-session (detachEntered 1347-1356) but no public call for it was found. Plan for erase at the next start. |
| Remove a deleted conversation's text from the app's search | yes | dsh-session-query-sqlite reconciles deletes on the next search (src/index.ts 423-465, _deleteSession 571-576) |
| Tidy the app's archived list after an erase | yes | unarchiveSession runs no existence check (dsh-workspace/src/index.ts 413-433); purge does not do it today, which is harmless because the sidebar skips ids it cannot find |
| Name the automation that deleting a conversation would delete | partly | The scheduler reports {kind: 'schedule', items: [{id, label}]} to the archive check (dsh-schedule/src/index.ts 323-332); the refusal's message names only the kind, and whether the client receives the items is not verified |
| Confirmation dialogs in the desktop app | yes | Delete already uses window.confirm (client.js 1955, 2022) |
| Hover name on a tab in the wide sidebar | yes | The app's UI.Tooltip is already used for the rail (client.js 1165-1168) |
| Tell whether a tab name fits | yes | Plus already measures a row with a ResizeObserver and adapts (dsh-modes ToggleControl, 0.31.1); the sidebar is 264-420 px (dsh-client-ui-layout columns.ts) |
| Drag tabs to reorder them in the sidebar | partly | React and HTML drag events work in the page, but the app has a full-page drop overlay for files and a desktop drag bridge (dsh-client-ui-file-drag README); whether a tab drag meets them, and how it feels in the Mac app, is not verified. Pointer and keyboard reordering avoid both. |
| Remember the tab order | yes | Cowork sidebar Config fields marked volatile can be written with settings.mutate, as maxTabs is (dsh-modes client.js 1419-1438); Shared settings would copy it to the second Mac |
| Keep run records per automation by time or count | no | deliveryHistoryDays and deliveryHistoryRecords are one setting for all tasks, configuration file only (dsh-schedule/src/index.ts 79-102); Plus must keep its own |
| Know which conversation a run created | yes | dsh-automations runs keep sessionId; the app's delivery records link per-run conversations (dsh-client-ui-schedule README) |
| Know which conversations Recon is wiping | partly | recon/wipe.json holds the ids and Recon's data route reports only a count (waitingToWipe); no service exposes the list yet |
| Know a deleted conversation's tab and isolation | partly | sessionModes and sessionIsolated in the modes settings, but pruned at the next start for trashed conversations (dsh-modes pruneStale); info.json stores no tab |

### To try in the lab before building

- **Put back after a restart** Why: Confirms the bug that a conversation put back after a restart loses its tab, Web, Tools, tier and Recon isolation How: Throwaway DSH_HOME lab with the mock model: make a Code conversation with Web Thorough and Tools off, and a Recon conversation; delete both; restart the lab; Put back and Restore; check the tab each lands in, the chat-box buttons, /recon status, a Cmd-K search for the Recon title, and the modes settings entries
- **End and wipe against the trash** Why: Confirms the race and which side wins, and what Restore does How: Lab: /recon end in a Recon conversation, then Delete it in the Recon tab's Archived list; restart several times (fresh each time); look in the conversations folder and the trash folder, the Trash list and the log. Repeat with Restore instead of Delete
- **A waiting trash item whose files are gone** Why: Confirms that such an item stays in Trash for ever How: Lab: delete an open conversation, quit, remove its folder by hand in the throwaway home, start; check the Trash list and the log after start and after a forced tidy
- **Deleting a conversation an automation delivers into** Why: Confirms that the app deletes the automation and its records, and what Plus can read about it from the refusal How: Lab: create a task that reuses one conversation; Delete that conversation in the sidebar; answer the question; check the Automation tasks page and Put back; log the refusal the client receives
- **Dragging a tab** Why: The app has a file-drop overlay and the Mac app has window drag areas How: Lab web app at 1280×860: drag a tab with HTML drag events and with pointer events; watch for the drop overlay and for the order being kept after reload. The Mac app itself is for the owner to try
- **Which names fit** Why: Decides which tabs would show icon alone How: Lab: measure each tab label (Research, Finance, Automations, a long own mode name) at 264, 340 and 420 px with 4 to 9 tabs
- **Delete permanently with Sync** Why: The confirmation must say truthfully what stays How: Lab with Sync to a throwaway local bare repository: push a conversation, delete it, erase it, then check the git history and a Cmd-K search

### Steps

**Step 1. Fix: Put back keeps a conversation's tab and choices after a restart** (size M)

- What: Modes and Model Tiers no longer forget the choices of a conversation that is in the Plus trash; they forget them at the first start after it is erased. Recon's isolation mark is kept the same way. Say in the release note that conversations already in the trash may have lost theirs.
- Add-ons: dsh-modes, dsh-model-tiers, dsh-cowork-shell
- Tests: Prune keeps an id whose trash entry exists and drops it once erased; Recon's isolation mark survives a delete, restart and Put back; existing prune tests still pass
- What could break: Modes may prune before the Cowork sidebar is loaded; check the trash folder directly and keep entries when unsure
- Needs first: Lab trial 'Put back after a restart' confirms the bug
- Cannot be verified before you try it: The owner's existing trash; conversations whose choices were already lost cannot be repaired

**Step 2. Fix: a conversation ended with /recon end never lands in the trash** (size S)

- What: The trash refuses, and drops from its waiting list, any conversation on Recon's wipe list; the Archived list shows it as 'Being deleted' without Restore or Delete. Recon offers its wipe list through a small service.
- Add-ons: dsh-recon, dsh-cowork-shell
- Tests: Trash refuses a wiped id and removes it from pending; sidebar hides the buttons for it; Recon's wipe tests still pass
- What could break: If Recon is off, its list is not offered; then fall back to today's behaviour
- Needs first: Lab trial 'End and wipe against the trash'
- Cannot be verified before you try it: Load order of the two add-ons in the owner's Mac app

**Step 3. Fix: a waiting trash item whose files are gone leaves the list** (size S)

- What: At each tidy, a waiting item whose conversation is no longer stored is dropped with a log line, instead of staying in Trash for ever
- Add-ons: dsh-cowork-shell
- Tests: Unit test in trash.test.mjs: pending item with no stored conversation is dropped; one still in memory is kept
- What could break: Must not drop an item whose conversation is only temporarily unlisted; check twice or only at start
- Needs first: Lab trial 'A waiting trash item whose files are gone' (or the unit test alone)

**Step 4. Fix: the delete warning names the automation it would delete** (size S)

- What: When the app refuses to archive because an automation delivers into the conversation, the question says that this automation is deleted with it, for good, instead of 'still working'
- Add-ons: dsh-cowork-shell
- Tests: Client logic test for the wording chosen from the refusal; lab check
- What could break: If the name is not available, say 'an automation' without a name
- Needs first: Lab trial 'Deleting a conversation an automation delivers into'
- Cannot be verified before you try it: Whether the refusal carries the automation's name in every app version

**Step 5. Delete permanently, one item at a time** (size S)

- What: Each Trash row gets 'Delete permanently' with its own confirmation that says what cannot be reached (Sync's history, backups). A conversation still open is marked and erased at the next start. Only folders inside the trash are erased.
- Add-ons: dsh-cowork-shell
- Tests: trash.test.mjs: erase a moved item, mark a waiting one and erase it at tidy, refuse ids outside the trash; route accepts the new action
- What could break: Window.confirm text length; a Recon item is erased like any other
- Needs first: Steps 1 to 3
- Cannot be verified before you try it: Sync on a real second Mac; Time Machine

**Step 6. Each tab's own Trash list (or Recon's apart)** (size S)

- What: Following the owner's answer to the Recon question: the Trash list under each tab shows only that tab's deleted conversations (or only Recon's are kept under Recon). The tab is written into info.json at delete time.
- Add-ons: dsh-cowork-shell
- Tests: trash.test.mjs: info.json carries the tab; client filter by tab; an old item without a tab shows where its folder puts it
- What could break: Items deleted before this step have no tab stored
- Needs first: Owner's answer to the Recon question; step 1

**Step 7. Empty trash** (size S)

- What: 'Empty trash' at the end of the Trash list, after one confirmation that names how many items; it empties only what that tab's list shows
- Add-ons: dsh-cowork-shell
- Tests: trash.test.mjs: empty removes only the listed ids and marks open ones for the next start
- What could break: A large trash takes time to erase; run it in the background and refresh the list
- Needs first: Steps 5 and 6

**Step 8. Full name on hover for every tab** (size S)

- What: In the wide sidebar each tab shows its full name when you point at it, as the folded rail already does
- Add-ons: dsh-cowork-shell
- Tests: Lab check at 264 and 420 px
- What could break: The tooltip side must not cover the tabs below
- Needs first: None (adds only)
- Cannot be verified before you try it: The Mac app's hover delay

**Step 9. Icon alone when a name does not fit** (size S)

- What: Following the owner's answer: built-in and add-on tabs whose name does not fit show their icon alone; your own modes keep their name
- Add-ons: dsh-cowork-shell
- Tests: Lab measurement at several widths and tab counts
- What could break: A tab may flip between icon and name while the sidebar is resized
- Needs first: Owner's answer to the icon question; step 8; lab trial 'Which names fit'
- Cannot be verified before you try it: The Mac app's font rendering

**Step 10. Your own tab order** (size M)

- What: An edit icon beside the tabs; while on, tabs can be dragged (and moved with the keyboard); the order is saved as tab names in the Cowork sidebar's settings, with 'Reset order'; names a Mac lacks are skipped
- Add-ons: dsh-cowork-shell
- Tests: Unit test for applying a stored order to a tab list (missing, new and non-mode ids); lab drag test
- What could break: The app's file-drop overlay; the order reaching the second Mac
- Needs first: Owner's answer to the tab-order question; lab trial 'Dragging a tab'
- Cannot be verified before you try it: Dragging in the Mac app; Shared settings on a real second Mac

**Step 11. Global Search and /mode follow the tab order** (size S)

- What: Global Search groups and /mode's tab list use the saved order
- Add-ons: dsh-search, dsh-modes
- Tests: lib/tabs.js test with a stored order; Global Search grouping test
- What could break: Without the Cowork sidebar both keep today's order
- Needs first: Step 10

**Step 12. A trash other add-ons can use** (size M)

- What: The trash becomes a small service with a second kind of item (a folder or a group of run conversations), so Automations and Scratch can put things in it
- Add-ons: dsh-cowork-shell
- Tests: trash.test.mjs: add, list, put back and erase the new kind; only folders inside the trash are removed
- What could break: Keep the old info.json format readable
- Needs first: Step 5

**Step 13. Old automation runs to the trash** (size M)

- What: Per the owner's answer: conversations of old runs of automations that start a new conversation each time go to the trash, one row per automation; list lines drop off
- Add-ons: dsh-automations, dsh-cowork-shell
- Tests: Keep rules per automation; never a shared conversation; Put back
- What could break: Deleting a shared conversation would delete the automation; guard against it
- Needs first: Owner's answer on old runs; step 12; plan steps 16 and 17
- Cannot be verified before you try it: Real automations over weeks

**Step 14. Deleted automations to the trash** (size M)

- What: Per the owner's answer: deleting an automation from the Automations tab keeps its recipe for 30 days; Put back creates it again (its old app records do not come back)
- Add-ons: dsh-automations, dsh-cowork-shell
- Tests: Recipe saved and recreated; trash row shows it
- What could break: A recreated task gets a new id; links to old runs break
- Needs first: Owner's answer on deleted automations; step 12; plan step 16

**Step 15. Scratch threads to the trash with their folder** (size M)

- What: Per decision 7: deleting a Scratch thread moves its messages and its hidden folder to the trash; a folder still used by a Rerun copy stays
- Add-ons: dsh-cowork-shell
- Tests: Move and put back a thread with its folder; shared folder kept
- What could break: A thread whose folder is gone cannot answer; put back must restore both
- Needs first: Owner's answer to decision 7; step 12; plan step 7


---

## Depth and per-tab settings

### What already does part of this job

- **Web button with five levels per conversation (Off, Quick, Standard, Thorough, Deep): how much the model searches, with a note per level; Standard adds no words** (addons/dsh-modes/client.js (WebButton 898-941, pickLevel 850-875), addons/dsh-modes/lib/prompt.js (SEARCH_DEPTH_PROMPTS 84-89), addons/dsh-modes/index.js (levelOf 602-605, Config sessionSearchDepth/searchDepth 121-126)). Stored per conversation in modes.sessionSearchDepth. A conversation that never picked a level follows modes.searchDepth live. Picking a level also writes searchDepth (the start for every tab, Recon included). Off is stored apart, in sessionWeb, and is never a start value. This covers only the web part of 'how much work', not effort or checks.
- **Research's Depth: Quick, Standard, Thorough, as a chat-box dropdown labelled 'Depth' and on Settings → Research** (addons/dsh-research/client.js (ResearchControls 191-243, Settings row 348-350), addons/dsh-research/lib/mode.js (DEPTHS 15-19, selectionNote 69-73), addons/dsh-research/index.js (depthNow 56-59), addons/dsh-modes/index.js (researchDepth 139-140, service researchDepth() 1415-1418)). One global value, modes.researchDepth, not per conversation (Research's Focus, by contrast, is per conversation). Deep research reads it with no conversation id, so it also decides how deep deep_research goes when called in Cowork, Code, Finance, Data and Scout. Scout has no Depth control of its own.
- **Deep research engine: depth table and caps** (addons/dsh-deep-research/lib/rounds.js (DEPTHS 13-17, capped 39-49), addons/dsh-deep-research/lib/budget.js (researchMinutes 40-46), addons/dsh-deep-research/index.js (451-468), addons/dsh-model-tiers/index.js (maxSubagents default 4, line 253)). Quick: 1 round, 4 helpers, 10 min. Standard: 2 rounds, 6 helpers, 25 min. Thorough: 3 rounds, 8 helpers, 45 min. Helpers at once are also held to Model Tiers' sub-agent cap (default 4), so Standard and Thorough run 4 at once unless the cap is raised (a known gap in MODES-AND-SETTINGS.md). Minutes are min(config maxMinutes 60, depth minutes, what the model asks), so 45 is the longest run. Under the PTC preset it is about 7 minutes (10-minute program limit minus a 3-minute report reserve).
- **Recon's search effort per Web level, including cross-checking** (addons/dsh-modes/lib/prompt.js (ISOLATED_LEVEL_PROMPTS 67-72, ISOLATED_OFF_PROMPT 73)). Quick, Thorough and Deep notes in words that fit Recon's own tools. Thorough and Deep already ask for cross-checking between sources.
- **Model Tiers effort slider (Off, Low, Medium, High, Extra high, Ultra Code), and starter tiers Fast, Balanced, Deep whose wording matches the plan's Fast, Standard, Thorough** (addons/dsh-model-tiers/index.js (EFFORT_LEVELS 35, TIER_LABELS 38-45, starter effort 205-209, normalizeSelection effort 971-973, tierPrompt effort wording 1205-1225, chooseEffort 898, desiredEffort 2025-2034, reconcileEffort 2045-2058), addons/dsh-model-tiers/client.js (applySelection 4395-4462, pickModel 4480-4489, pickTier 4501-4520, commitEffort 4529-4533)). Effort is kept per conversation in model-tiers.activeTiers. The order is: the conversation's entry, then the model version's effort, then the tier's effort, then Medium. The wording: Low 'act on the first sound approach'; Medium 'plan briefly, implement, then verify the touched path'; High 'verify the result before finishing; run the narrowest checks'; Ultra adds a block that pushes delegation to helpers. The effort is sent on the wire only when the model lists reasoning efforts, but the wording changes whatever the model.
- **An answer self-check in Chat already, at Standard** (addons/dsh-model-tiers/index.js (tierPrompt, bare wording 1209-1214)). With no tools (Chat or Tools off), the tier section says at Medium 'Plan briefly, answer, then check the answer once', and at High 'check the result before finishing'. It is there whenever a tier or a model pick applies to the conversation (no section only when nothing was picked and no tier matches the model).
- **Tier rules about helpers that a Depth note would meet** (addons/dsh-model-tiers/index.js (minSubagents 230 and 1234-1240, ultraAutoDelegate 254 and 1243-1250, starter 'code' tier effort ultra 209)). A tier can require at least N helpers for independent work. At Ultra Code with auto-delegation on (the default), the model is told to start helpers proactively. The starter 'Code review' tier is Ultra.
- **A starting tier per tab for Chat, Cowork and Code (mode card 'Tier for this mode'), applied from the first message** (addons/dsh-modes/index.js (applyTier 755-780), addons/dsh-modes/client.js (mode cards from 1523)). core-7 (0.57.0): a mode's tier, with its effort, applies to a new conversation in the tab, and to an Automation task's conversation. This is already a per-tab 'how hard' start for the three built-in tabs, not for add-on tabs.
- **Check before saying done, as words only** (addons/dsh-modes/lib/prompt.js (CODE_METHOD rule 4 line 17, COWORK_METHOD rule 5 line 39), addons/dsh-data/lib/method.js (rule 4 line 15), addons/dsh-finance/lib/finance.js (METHOD 53-80)). Code: run the tests or build and read the output. Cowork (owner-approved word for word, core-14): check the result before saying it is done. Data: check the data and say how many rows a result rests on. Finance: every figure from a fetched source, primary sources first; it has no second-source rule. Nothing enforces a check at the end of a turn.
- **Review helpers that could serve as Thorough's 'one review pass'** (addons/dsh-model-tiers/README.md (Role models, review_lanes, run_pipeline 99-132), addons/dsh-model-tiers/index.js (roleModelsFor 1309-1321, review_lanes 1698), addons/dsh-modes/lib/trim.js (helpers family line 30), addons/dsh-code-power, addons/dsh-mission). review_lanes, delegate_role and run_pipeline are in the helpers family, which Cowork, Code and Data load as needed. They are held to the tier's sub-agent gate. With 'One model' on the models chip, every role runs on the conversation's own model, so review_lanes works without role models.
- **The models chip ('One model' / 'N models') in every chat box with tools** (addons/dsh-modes/client.js (HelpersButton 951+, labels 59-63), addons/dsh-modes/index.js (sessionHelpers 151, helperModels 1411-1415)). A per-conversation choice of which models helper agents run on. The words 'helpers' and 'Fast' (a role lane) already appear in the chat box.
- **One global 'Web level for new conversations (and those that never picked one)' on Settings → Modes** (addons/dsh-modes/client.js (New conversations section 1484-1494, saveNow 1395-1417, texts new.web/new.web.hint 113-114, web.note 146)). Built in 0.57.0 for core-16: the owner approved three controls on the Modes page, one of them the starting Web level. The hint and the Web button's note say a pick in the chat box sets it too.
- **A starting Web Off by project type (Paperwork, or any saved type with search off)** (addons/dsh-cowork-shell/index.js (startSearchOff 509-535), addons/dsh-cowork-shell/lib/presets.js). On agent/created, for a conversation that has never run in such a project, it writes sessionWeb false. A per-tab start must decide how it ranks against this.
- **Per-conversation field plumbing that a new Depth field must join** (addons/dsh-modes/index.js (pruneStale fields 1363), addons/dsh-modes/client.js (Rerun CARRIED 515), addons/dsh-shared-settings/index.mjs (ALWAYS_SKIP 32-40), addons/dsh-settings-plus/settings-index.json (researchDepth entry ~2959, searchDepth ~12030)). Per-conversation Modes fields are pruned, carried into Rerun copies and never shared between Macs (x-5). Every Settings control gets a search index entry.
- **The chat box's left row, already crowded** (addons/dsh-modes/client.js (slots 1644-1663: mode-select -22, mode-toggles -21), addons/dsh-route-health/client.js (148-150, -21), addons/dsh-research/client.js (374, -20), addons/dsh-finance/client.js (712, -19; width rules 98-102)). finance-10 (0.57.0): the lab found the row's buttons overlapping, so the Finance pill shows all five parts only from 1600 px, the subject and market from 1280 px, and nothing below that.
- **The app's goal service and goal round driver (continuation across rounds), used by Mission** (app dsh-goal/README.md, dsh-goal-round-driver/README.md; addons/dsh-mission/runner.js (goals.create 475, 621-629)). This belongs to Long run. It is shown here because the Depth button's last stop is Long run, and because each Mission round is one goal-round turn, which Thorough's end-of-turn check must not disturb.

### Where the plan changes something built (needs your yes)

- **Today:** One starting Web level for all tabs (modes.searchDepth, default Standard). Any level picked in any chat box, Recon's included, also becomes the start for new conversations in every tab (client.js 857-860). Since 0.57.0 the same value is a control on Settings → Modes → New conversations (core-16). A conversation that never picked a level follows it live (index.js 602-605). Off is never a start: it is per conversation. Chat starts Off because it has no tools; Data starts on (data-7); a Paperwork-type project starts Off (cowork-shell startSearchOff). The Web button's note and the Settings hint say a pick sets the start everywhere.
  **The plan:** Each tab gets its own starting Web level (plan's table row 1 and Per-tab settings).
  **Conflicts with:** built chat-box behaviour; 0.57.0 decision core-16 (one starting-Web-level control on the Modes page); data-7 must keep Data on by default
  **Question:** Today there is one Web level where every new conversation starts, in every tab. You set it on Settings → Modes, and it also changes every time you pick a level in any chat box. The plan gives each tab its own start. What would change: picking a level in Cowork would no longer change where Chat or Data start. Nothing is lost: the control you have would become the start for any tab that has none of its own. How should it work?
  **Options:** Each tab has its own start. A pick in the chat box changes only the start of the tab you are in. Tabs you never set follow the control you have now / Each tab has its own start, set only on Settings. A pick in the chat box changes only that conversation / Keep one start for all tabs, as today
  **Recommendation:** The first. It keeps your habit (a pick sets where you start), but only for the tab you are in, and nothing changes until you pick. Chat still starts Off and Data on, as now. If a tab may start Off, that applies only to new conversations, and a Paperwork project's Off wins over the tab's start. The Web button's note and the Settings hint get new words.
- **Today:** Depth exists only as Research's dropdown and its Settings row: Quick, Standard, Thorough, one global value (modes.researchDepth). Deep research reads it with no conversation (deep-research index.js 451-458), so it also sets the rounds and helpers of deep_research in Cowork, Code, Finance, Data and Scout. Research and Scout get no Web-level words (fixes research-1 and scout-9, 0.56.0), so a pick made elsewhere cannot change how they work.
  **The plan:** Depth in every tab, per conversation, with stops Fast, Standard, Thorough, Long run (plan row 2).
  **Conflicts with:** built behaviour: one global Research depth that applies to research in every tab; the research-1/scout-9 fixes if Depth notes reached Research or Scout
  **Question:** Today Research's Depth is one setting for all conversations. It also decides how long a research run takes when the assistant starts one from Cowork, Code, Finance, Data or Scout. The plan makes Depth a choice per conversation in every tab. What would change: each conversation keeps its own Depth, and a research run started from Cowork would follow that Cowork conversation's Depth instead of the Research tab's. Nothing is deleted. Should it?
  **Options:** Per conversation. Research and Scout start at today's Research value. A research run in any tab follows that conversation's Depth / Per conversation in Research only. Other tabs keep following Research's value for research runs / Keep one value for all, as today
  **Recommendation:** The first. On day one nothing changes for Research and Scout, because they start at the value you have now. In Research and Scout, Depth keeps meaning only rounds, helpers and minutes: no extra notes, no check before stopping, no change to effort. That way the 0.56.0 fixes still hold.
- **Today:** Names in use today. Web levels: Off, Quick, Standard, Thorough, Deep. Research's Depth: Quick, Standard, Thorough. Starter tiers: Fast, Balanced, Deep, Creative, Code review (model-tiers index.js 38-45). A helper role 'Fast', with one-click role lanes on the model button (ROLE_META 108-129, README 109). In the Chinese texts, Web 'Deep' is 深度 (the usual word for 'depth') and 'Quick' is 快速 ('fast'). The Web notes to the model already say 'Search depth is set to …'.
  **The plan:** Depth stops named Fast, Standard, Thorough, Long run. The plan flags only Web 'Thorough' against Depth 'Thorough' (row 4).
  **Conflicts with:** built names: starter tier 'Fast', role 'Fast', Web level 'Deep' against tier 'Deep', Research's 'Quick'; the Chinese Web labels
  **Question:** The chat box would show the Web button, the Depth button and the model button side by side. 'Fast' is already the name of a tier and of a helper role on the model button, and Research's Depth already says 'Quick'. Which names should Depth use?
  **Options:** Quick, Standard, Thorough, Long run (the words Research uses now) / Fast, Standard, Thorough, Long run (as in the plan) / Light, Standard, Thorough, Long run
  **Recommendation:** Quick, Standard, Thorough, Long run. People who use Research already know them, nothing on the model button is called Quick, and the stored values in Research stay the same. Inside the model's instructions, Depth's note should use other words than 'search depth' so the model does not mix it up with the Web level. The Chinese labels need their own words (not 深度) for the button.
- **Today:** Research and Scout have no Web button: it is hidden for any mode that lists deep_research (modes client.js 846-847, 880), and the web is forced on there (lib/mask.js webFor 52-57). Only the Tools switch takes it away. They get no Web-level note (research-1, scout-9).
  **The plan:** Show the Web button there, locked on (row 3).
  **Conflicts with:** built (display only); research-1/scout-9 if a level were shown or sent
  **Question:** In Research and Scout the web is always on, so there is no Web button. The plan shows it there too, locked on, so every tab has the same two buttons. Nothing changes in what the assistant does. Should it show?
  **Options:** Show 'Web · Always on', with no list of levels, and a one-line hint / Leave it hidden, as today
  **Recommendation:** Show 'Web · Always on' without levels. Every tab then looks the same, and no level is offered that would do nothing there. When the Tools switch is off, it must read Off.
- **Today:** Effort lives in Model Tiers, per conversation (activeTiers). Every pick of a model, tier or version on the model button stores an effort (client.js applySelection 4404-4414, pickModel 4484-4489, pickTier 4514-4520), so a slider moved by hand cannot be told apart from a tier's effort. A stored entry's effort outranks the version's and the tier's (index.js 971-973). A mode's tier sets effort from the first message (core-7). Effort goes on the wire only when the model lists thinking levels; the app refuses a level that is not listed (dsh-llm index.ts 944-952), and Model Tiers filters for that (chooseEffort 898). Effort also changes the tier's wording, whatever the model (index.js 1205-1225). Model Tiers adds no tier and no effort in Recon. No Model Tiers service lets another add-on set effort. Owner decision in 0.10: the chat box has one model control.
  **The plan:** Depth also sets effort: Fast low, Thorough and Long run high, with your own pick on the model button winning (row 5, open decision 3).
  **Conflicts with:** built Model Tiers order of precedence; the 0.10 decision (one model control); core-7 (a mode's tier sets effort at the start)
  **Question:** Today how hard the model thinks is set on the model button (the effort slider) or by the tier. The plan lets Depth set it too, with your own pick winning. The app cannot tell your own pick from a tier's today, and many local models ignore effort. If Depth changed effort quietly, the model button could show one effort while another is used. How should Depth and effort work together?
  **Options:** Picking Quick or Thorough moves the effort slider once, where you can see it (Quick to Low, Thorough to High). It never lowers Extra high or Ultra Code. A tab's starting Depth never touches effort. After that the slider is yours / As the plan: Depth sets effort behind the scenes, with a new mark for efforts you set by hand / Depth leaves effort alone; it only changes how the assistant works
  **Recommendation:** The first. The model button always shows the truth, your pick wins because it is the last move, and a Code tier set to Ultra is never weakened. To know: Quick moves a High slider down to Low, and the moved effort then stays on that conversation even if its tier changes later (until you pick a tier again).
- **Today:** Every tab's built instructions ask for a check before finishing. Code rule 4: run the tests or the build. Cowork rule 5 (core-14, approved word for word): check the result. Data rule 4: check the data. The tier's effort wording at Medium says 'verify the touched path' ('check the answer once' in Chat). A tier can require a minimum number of helpers, and Ultra Code pushes the model to use helpers (the starter 'Code review' tier is Ultra). Research's Quick uses 4 helpers.
  **The plan:** Fast: 'One pass, no helpers, no self-check'. Thorough: 'Plans first, checks its own work, one review pass'.
  **Conflicts with:** core-14 (Cowork method approved word for word); built Code and Data methods; Model Tiers' effort wording, helper minimum and Ultra delegation; the plan's own Research and Scout row
  **Question:** In the plan, Fast says 'no helpers, no self-check'. But the Cowork method you approved says 'check the result before saying it is done', Code's says 'run the tests', and a Code tier set to Ultra tells the model to use helpers. If Fast said the opposite, the model would get two orders that contradict each other. What should Fast tell the model?
  **Options:** 'Keep it short: one pass, quick checks only, no helpers unless the tier asks for them'. The working methods stay exactly as they are / Fast switches off the check rules of the working methods for that conversation (your approved Cowork words would change while Fast is on) / As the plan: 'no helpers, no self-check', added on top of the methods
  **Recommendation:** The first. Nothing you approved changes, the model never gets two opposite orders, and Fast still saves time. Thorough's words add to the methods (plan first, check, one review pass when helpers are allowed) and never replace them.
- **Today:** Long run would be Mission. Mission switches a conversation to Workspace Write (mission index.js 40, 595), while Data and Research run Read Only since 0.57.0 (data-1, research-6). /mission refuses to start in Recon and where the tier has Sub-agents off (x-2).
  **The plan:** Long run as the last Depth stop, with a Mission loop in Code, Cowork and Data. Open decision 5: Code and Cowork first.
  **Conflicts with:** data-1, research-6 (Read Only), x-2 (Mission refused without sub-agents)
  **Question:** Long run is Mission working round after round. Mission needs to write files, but since 0.57.0 Data and Research only read your files. Should Long run come first to Code and Cowork only?
  **Options:** Code and Cowork first. Data later, after a separate answer on letting it write (for example only into data-output) / Code, Cowork and Data together, with Data allowed to write during a Long run
  **Recommendation:** Code and Cowork first. Commands prove the work there, and no Read Only rule is undone. Where the tier has Sub-agents off, the Long run stop shows greyed out with the reason, as /mission refuses today.
- **Today:** Recon's Web levels already set how much it searches and cross-checks (ISOLATED_LEVEL_PROMPTS). Model Tiers adds no tier and no effort wording in Recon on purpose. Effort can still be set by hand on the model button.
  **The plan:** Recon gets Depth: effort and cross-checking.
  **Conflicts with:** built Recon isolation (Model Tiers leaves isolated conversations alone)
  **Question:** Recon's Web levels already tell it how hard to search and to cross-check sources, and you can set effort on the model button. The plan adds a Depth button in Recon too. Should Recon get it?
  **Options:** Not for now: Recon keeps its Web levels, which already do this / Yes, a Depth button in Recon that only moves the effort slider
  **Recommendation:** Not for now. It would repeat what the Web levels do, and Recon stays as sealed as it is.

### Changes that need no decision

- Today: Settings → Modes has a card only for Chat, Cowork, Code and modes you add (client.js toRows/fromRows 1127-1164, cards from 1523, saved with Save). Finance, Data, Research, Scout and Recon have no card. Their own add-ons rewrite their mode entries every 3 seconds (research index.js 85-115, lib/mode.js withResearch 50-66; the same timer in finance, data, scout and recon). The page already lists add-on tabs in its 'load tools as needed' section. core-16 kept the page small: three controls, and tab layouts stay in the configuration file. Plan: Each mode card gets a 'Web and Depth' section (Per-tab settings).
- Today: The chat box's left row already holds the mode control, Web, the models chip, Tools, the route-health badge, Research's Depth and Focus, and the Finance pill. In 0.57.0 the lab found the row's buttons overlapping, so the Finance pill now shows all five parts only from 1600 px wide, the subject and market from 1280 px, and nothing below that (finance-10). Plan: A Depth button in every chat box, later reading for example 'Depth · Thorough · Blunt' (Lens) or 'Depth · Long run 4 h'.
- Today: Nothing in Plus acts at the end of a turn. Mission runs as app goal rounds (runner.js 475, 621): each round is one turn in which the model calls mission_step once. Helpers are separate sessions with their own turns. Automation tasks run unattended (scheduledMode, schedule/resolve-agent). The app shows a message steered in at the end of a turn as a user bubble. Plan: Thorough: 'checks its own work before stopping' (build step 6).
- Today: Under a model version that 'stands alone' (0.13 decision: 'replace' means the added instructions only; new-2 keeps Scout's rules), Modes leaves out a mode's own wording but keeps the Web notes (prompt.js 166-169), and Model Tiers leaves out its effort wording (index.js 1204). Plan: Depth adds notes to the instructions.

### Where the plan is out of date

- The plan says: Part 11 of MODES-AND-SETTINGS.md holds 26 decisions 'that are not built yet'.
  In fact: All 26 were built in 0.57.0 (section 13 of that document; HANDOFF 0.57.0 entry). The plan's 'built today' rows must be read against 0.57.0: for example the Web start is also a control on Settings → Modes (core-16), and a mode's tier sets effort from the first message (core-7).
- The plan says: 'Depth exists only in the Research tab (Quick, Standard, Thorough), as one setting for all conversations.'
  In fact: The same value is also on Settings → Research. It decides how deep deep_research goes in every tab that calls it (Cowork, Code, Finance, Data, Scout), because deep research reads it with no conversation (deep-research index.js 451-458).
- The plan says: Research and Scout: 'What Depth already does there: rounds and helpers'.
  In fact: Scout has no Depth control; its research follows Research's global value. The 6 and 8 helpers of Standard and Thorough are held to Model Tiers' sub-agent cap (default 4), so by default 4 run at once.
- The plan says: Research and Scout Long run: 'More rounds until time is up (capped at 60 minutes today)'.
  In fact: The longest run today is 45 minutes (Thorough). The 60-minute setting and the model's own request can only lower that (deep-research index.js 465, rounds.js 13-17). Under the PTC preset a run gets about 7 minutes.
- The plan says: Stop table: Fast is 'One pass, no helpers, no self-check'.
  In fact: This contradicts the plan's own Research and Scout row (Quick there uses helpers), Cowork's approved method (core-14), Code's and Data's methods, and the tier's effort wording and helper rules that are already in the instructions.
- The plan says: 'Effort is set by hand on the model button and per tier.'
  In fact: It is also set by model versions, and by a mode's tier from a new conversation's first message (core-7). Every pick on the model button stores an effort, so a hand-set effort cannot be told apart from a tier's.
- The plan says: Chat: 'Effort and an answer self-check' (as something new).
  In fact: Chat already gets 'Plan briefly, answer, then check the answer once' at Medium effort, and 'check the result before finishing' at High, whenever a tier or a model pick applies (model-tiers index.js 1209-1214).
- The plan says: Per-tab settings: 'Each mode card on Settings → Modes gets a Web and Depth section'.
  In fact: Finance, Data, Research, Scout and Recon have no mode card, and their add-ons rewrite their mode entries every 3 seconds, so a field put there would be lost. Per-tab settings need a stored place of their own.
- The plan says: Per-tab settings: 'This changes one thing you have today: picking a Web level currently sets the start for all tabs.'
  In fact: It also changes the 0.57.0 control on Settings → Modes (core-16), and the rule that a conversation that never picked a level follows the start live. The Web button's note and the Settings hint say a pick sets the start everywhere.
- The plan says: Build order: step 4 'Lens row' comes before step 5 'Depth button'.
  In fact: The Lens is a row in the Depth panel ('Depth · Thorough · Blunt'), so it cannot be built before the Depth button. Either the Depth button comes first, or the Lens gets a panel of its own.
- The plan says: Data: 'Mission loop in the data folder'.
  In fact: Data runs Read Only since 0.57.0 (data-1), and Mission switches a conversation to Workspace Write (mission index.js 40, 595). A Data Long run would undo that, and so would a Research one built on Mission (research-6).

### What the app allows

| Needed | Available | Evidence |
|---|---|---|
| A Depth button in every chat box | yes | Chat-box slot conversation.input.left (HANDOFF section 3). Modes already renders Web, the models chip and Tools there (modes client.js 1644-1663). The row is crowded: finance-10 lab fix (finance client.js 98-102). |
| A Depth choice stored per conversation, and a start per tab | yes | Volatile Modes fields read and written through settings.mutate (modes index.js 113-151; sessionSearchDepth is the model). The start can be applied at creation with agent/created and phase.lastTurn 0, as cowork-shell startSearchOff and modes applyTier do. |
| A note per conversation in the model's instructions, not given to helpers | yes | Modes' system-prompt section modes:mode (promptText, prompt.js 145-170). Helpers get no mode wording (child). |
| One more step before a turn ends (Thorough's check) | yes | agent/turn-stopping, a serial event before the turn closes; a listener calls agent.steer(...) to keep it open (app dsh/docs/subsystems/core.md 1092-1114; dsh-agent-loop/src/agent.ts 401-405). The app's dsh-workspace-changes listens to it; no Plus add-on does yet (HANDOFF 0.12 entry). |
| Show the check message in the chat in a way that does not look like the owner typed it | partly | The app shows steered input with the user-message renderer, as a bubble. The slot conversation.chat.user.before lets an add-on put a label above it, matched by the message's source. The bubble itself cannot be hidden (dsh-client-ui-chat README lines 13, 52). |
| Skip goal and Mission rounds and helpers when checking | yes | ctx.goals.get(agent) gives the current goal and its phase (dsh-goal README 76-80). Helpers have header.origin 'subagent' or parentSession (modes index.js 1056). |
| Set effort per conversation | partly | Only for models that list reasoning efforts: agent.model.select or directory.select with reasoningEffort. An unlisted level is refused (UNSUPPORTED_REASONING_EFFORT, dsh-llm index.ts 944-952); Model Tiers maps to a listed one (chooseEffort 898). |
| Tell an effort set by hand from a tier's | no | The app has no such mark, and Model Tiers stores an effort on every pick (client.js 4404-4414). Plus could add its own mark in activeTiers. |
| Another add-on moving the Model Tiers effort slider | partly | Model Tiers' service has setSessionTier but no effort method (index.js 2521-2734). A new method in dsh-model-tiers is needed. |
| deep_research following the calling conversation's Depth | yes | The tool has exec.agent (parent.id) at the call (deep-research index.js 440). Today it calls modes.researchDepth() with no id (454). The service can take one. |
| Web button shown, locked on, in Research and Scout | yes | Interface only: modes client.js 846-847, 880 hides it today. mask.js webFor already forces the web on there. |

### To try in the lab before building

- **Thorough's check before stopping, on the mock model** Why: To see how the steered check message shows in the chat (a user bubble?), that it runs once per turn, and that it is skipped in helpers, Mission or goal rounds, Recon and Research How: spike-lab with MOCK_SCRIPT (the reply first, then a reply to the check) and MOCK_DUMP. Count requests per turn; start /mission and a helper; screenshot at 1280×860.
- **Chat-box row width with the Depth button** Why: The 0.57.0 lab found the row overlapping (finance-10). Depth, and later Lens text, adds width How: Lab viewport at 1280×860 and 1600 wide, in Finance (pill visible), Research (Depth and Focus), Cowork, Data and Chat. Check that no button overlaps or wraps.
- **Depth notes reach the request, and only where they should** Why: Standard must add nothing; helpers, Research, Scout and Recon must get no Depth words; no note may contradict the methods or the tier wording How: MOCK_DUMP the full request for each stop in Cowork, Code, Chat, Data and Finance, and for a helper and a Research conversation. Compare the system prompt text.
- **Effort moves visibly with a Depth pick** Why: The model button must show the effort in use; Ultra must not be lowered; a model with no effort list must get nothing on the wire How: Mock model with and without reasoning efforts in t0.providers.yml. Pick Quick and Thorough, read the slider and MOCK_DUMP's reasoningEffort; try with the Code review (Ultra) tier.
- **Starting Web level and Depth per tab** Why: Precedence with a Paperwork project's Off, Chat's Off, Data on (data-7), and scheduled tasks staying at Standard How: In the lab, set a different start per tab; open new conversations in each tab and in a Paperwork project; run an Automation task; read the stored Modes fields in the throwaway home.
- **Research depth per conversation** Why: deep_research from Cowork must follow that conversation's Depth, and Research must start at the old global value How: Lab with a mock search provider: run deep_research from Cowork at Quick and from Research at Thorough; read each report's Checks line (depth, rounds, helpers).

### Steps

> **Status after step 16 (0.59.0, owner's decisions in the session of 2026-11-15).** The owner redesigned Depth while step 16 was built: the Web button is only On or Off; Depth (Quick, Standard, Thorough) carries how much the model searches plus planning, checks and reviews; Effort is how hard the model thinks, nothing more; and there is **one Depth for every tab** ("the Depth Settings should not differ, so I don't have to remember which mode had which settings"). So:
> - **Step 16** is done in that form: the Depth button in every tab, Recon, Research and Scout included.
> - **Step 17** is done (0.59.0): the check in every tab, Recon and Research as research-level modes and Scout included, with the owner's words and his rule that a check never starts the work over (long-running tools refused during the check).
> - **Step 18** (per-tab starting Depth and per-tab stops) and **step 19** (per-tab Web level) are **dropped**: one Depth start for all tabs, and the Web button has no levels.
> - **Step 20** is done, differently: Research's own Depth is gone (its value not carried over); research runs follow the starting conversation's Depth, and Research and Scout get Depth's care note too.
> - **Step 21** is done (0.59.1): Research and Scout show a fixed 'Web · Always on' label (Off with tools off).
> - **Step 22** (Effort follows a Depth pick) is **dropped**: the owner chose "Effort = thinking only".
> - **Step 23** is done, differently: Recon has the full Depth (care note plus its search effort), not an effort-only button.

**Step 16. Depth button, per conversation, in Chat, Cowork, Code, Finance and Data (notes only)** (size M)

- What: A Depth button in the chat box with three stops (names as the owner answers), stored per conversation in a new Modes field. Standard adds no words. The other stops add a short note in Modes' section that adds to the working methods and never contradicts them. No effort change and no end-of-turn check yet. Not shown in Research, Scout or Recon.
- Add-ons: dsh-modes, dsh-shared-settings, dsh-settings-plus
- Tests: prompt.test: each stop's note; Standard adds nothing; helpers, Research, Scout, Recon and Tools Off get no Depth words; no 'search depth' wording. Field pruned (pruneStale), carried by Rerun, in ALWAYS_SKIP. Client: the button renders, the pick is stored, and nothing shows in Research or Scout.
- What could break: Chat-box row width in Finance (finance-10); prompt order against the tier section (order 70) and the mode section (58)
- Needs first: Owner answers on the names and on what Fast says (it must not contradict the approved Cowork method)
- Cannot be verified before you try it: Whether real local models follow the notes (mock model only)

**Step 17. Thorough's check before stopping** (size M)

- What: At Thorough, one extra step before the turn closes (agent/turn-stopping plus agent.steer), with a short check message the owner approves. It runs once per turn in the top conversation only. It is skipped for helpers, goal and Mission rounds, Recon, Research, Scout, Tools Off and scheduled tasks. A label above the message says where it comes from.
- Add-ons: dsh-modes
- Tests: Unit: listener steers once per turn; it skips each excluded case (origin subagent, ctx.goals active, isolated, research tab, tools off); a failing listener never throws. Lab trial with MOCK_SCRIPT.
- What could break: It shows as a user bubble in the chat; one more model call per Thorough turn counts toward Budget guard
- Needs first: Step 1; the lab trial on how the message shows; the owner's OK on the message wording
- Cannot be verified before you try it: Real models' answers to the check; cost on slow local models

**Step 18. Per-tab table on Settings → Modes: starting Depth and which stops each tab offers** (size M)

- What: A 'Web and Depth per tab' table, one row per tab including add-on tabs, stored in a new Modes field (not in the mode entries) and saved at once. Default: Standard everywhere, all stops offered, so nothing changes. New conversations start at their tab's Depth. Scheduled tasks start at Standard.
- Add-ons: dsh-modes, dsh-settings-plus
- Tests: Rows for built-in and add-on modes; the field survives the add-ons' 3-second rewrite; a new conversation gets its tab's start; a tab offering fewer stops hides the others; a search index entry exists.
- What could break: The page grows; Lens and Scratch columns must fit later
- Needs first: Step 1; show the owner the table layout (his plan said 'on each mode card'; core-16 kept the page small)
- Cannot be verified before you try it: The Mac desktop app's look (web lab only)

**Step 19. Starting Web level per tab** (size M)

- What: The Web start moves into the per-tab table. A pick in the chat box sets only the start of its own tab, if the owner chooses that. Tabs not set follow the control there today. Chat stays Off, Data on (data-7). A Paperwork project's Off wins. The Web note and the Settings hint are reworded.
- Add-ons: dsh-modes, dsh-cowork-shell, dsh-settings-plus
- Tests: levelOf per tab; a pick writes only its tab; never-picked conversations follow their tab; Paperwork Off still applies; Recon's pick sets only Recon's start; migration keeps today's searchDepth as the fallback.
- What could break: Changes a built habit; the texts must change in the same step
- Needs first: Step 3; owner answer on the per-tab Web start (core-16)
- Cannot be verified before you try it: Behaviour on the owner's real settings (never read)

**Step 20. Research's Depth becomes the conversation's Depth** (size M)

- What: Research's and Scout's Depth is stored per conversation and starts at today's global researchDepth. deep_research follows the calling conversation's Depth in every tab. In Research and Scout, Depth sets only rounds, helpers and minutes: no notes, no end check, no effort. Research's dropdown becomes the shared Depth button.
- Add-ons: dsh-modes, dsh-research, dsh-deep-research, dsh-scout
- Tests: researchDepth(sessionId) with fallback; deep_research reads the parent's Depth; the selection note shows the conversation's Depth; research-1/scout-9 tests still pass; Settings → Research row sets the start.
- What could break: Changes how long research runs started from other tabs take
- Needs first: Step 1 and step 3; owner answer on Depth per conversation (row 2)
- Cannot be verified before you try it: Real search providers (mock in the lab)

**Step 21. Web button 'Always on' in Research and Scout** (size S)

- What: Show 'Web · Always on' with no level list and a one-line hint. It reads Off when the Tools switch is off. No level is stored or sent.
- Add-ons: dsh-modes
- Tests: Client: shown in research tabs, no list, follows the Tools switch; prompt unchanged (research-1, scout-9).
- What could break: Row width (finance-10 lesson)
- Needs first: Owner answer on showing it (row 4)
- Cannot be verified before you try it: Mac desktop app look

**Step 22. Effort follows a Depth pick** (size M)

- What: A new Model Tiers service method moves the conversation's effort slider once, visibly, when the user picks Quick or Thorough (as the owner answers). It never lowers Extra high or Ultra. A tab's starting Depth never touches effort. The model button stays the one model control.
- Add-ons: dsh-model-tiers, dsh-modes
- Tests: Service sets effort with the same ops as commitEffort; never lowers extra-high or ultra; no wire effort for a model without an effort list; the start Depth does not call it; the core-7 tier start is unchanged.
- What could break: The stored entry then outranks the tier's effort for that conversation
- Needs first: Steps 1 and 3; owner answer on effort (open decision 3, row 5); the lab trial
- Cannot be verified before you try it: Real models' thinking levels

**Step 23. Depth in Recon (only if the owner wants it)** (size S)

- What: If he says yes: a Depth button in Recon that only moves the effort slider. Recon's Web levels keep doing the searching and cross-checking.
- Add-ons: dsh-modes
- Tests: Isolated mode: no Depth words in the prompt, no end check; Recon's tool mask unchanged.
- What could break: Weakening Recon's isolation if any note or helper leaked in
- Needs first: Owner answer on Recon (row 12); step 7
- Cannot be verified before you try it: Tor and Usenet paths (not used in the lab)


---

## Lens

### What already does part of this job

- **A note for each conversation, added to the model's instructions: the same kind of thing a Lens would be** (addons/dsh-modes/lib/prompt.js (promptText 144-170, SEARCH_DEPTH_PROMPTS, ISOLATED_LEVEL_PROMPTS, webOffPrompt); addons/dsh-modes/index.js installPrompt 911-954 (section 'modes:mode', order 58)). On every step, Modes rebuilds one section of each conversation's instructions from that conversation's own choices: Web level, Web Off, Tools off, and tools loaded as needed. The code takes a different path in several cases: it returns early for Tools off (line 148) and for Recon (153-156); it leaves out the Web notes in Research and Scout (158-166); and for a model version that stands alone it leaves out the mode's own words, unless the mode keeps them (Scout, 168-169). A Lens has to be added on purpose in each of these paths. The app drops an empty section, so Default can leave the instructions exactly as they are today.
- **Per-conversation choices: stored, copied and cleaned up** (addons/dsh-modes/index.js Config (sessionWeb, sessionSearchDepth, sessionTools, sessionHelpers, sessionToolSets, lines 107-164) and pruneStale (1355-1387); addons/dsh-modes/client.js Rerun CARRIED list (515) and pickLevel (849-875); addons/dsh-shared-settings/index.mjs ALWAYS_SKIP/DEFAULT_SKIP (32-51)). Each choice is a JSON map {conversationId: value} in a volatile Modes setting, changed from the chat box with settings.mutate. A Rerun copy carries them. Once per start, entries for conversations no longer stored are removed. Shared settings keeps these fields on each Mac. Only Rerun carries them: the app's own Branch and cowork-shell's Promote / Continue in a project start without them, and a conversation put back from the trash after a restart has probably lost them already (not checked). A sessionLens field would follow the same pattern and the same limits.
- **Helpers already get none of Modes' notes** (addons/dsh-modes/index.js line 921; addons/dsh-research/index.js 150 (research:selection only for the root conversation)). A helper started by a conversation gets no Modes wording, only the note about programs. So 'searchers and workers stay neutral' already holds for anything Modes adds, with no work needed. Other add-ons do give helpers notes of their own: Scout's and Finance's selection notes, and the tier and role-prompt texts. The other side of this: Deep research's report writer is also a helper, so it gets no Lens unless one is passed to it on purpose.
- **Deep research: its roles, and where it runs** (addons/dsh-deep-research/lib/rounds.js (planPrompt 74, searchPrompt 118, analyzePrompt 171-197, writePrompt 248-273); addons/dsh-deep-research/index.js 486-493 (tab options), 586-597 (review), 619 (writer), 258-292 (runChild); addons/dsh-research/index.js 175-180 (runOptions)). A run has four roles: a planner, the searchers, a 'Research review' between rounds that runs on the planner role and picks the next searches, and a writer. The add-on builds the writer's prompt and sends it as the helper's message. It tells the writer to start with the answer in a short paragraph, cite every claim, keep the 'not read' labels and add no facts of its own. deep_research runs in every tab that has the web (Cowork, Code, Finance, Data, Scout), not only in Research. Research's runOptions (focus, follow-ups, saving the report) covers Research conversations only. In Research the report is also saved as a file.
- **Research and Mission pass their reports on as they come** (addons/dsh-research/lib/mode.js METHOD rule 5; addons/dsh-mission/lib/run.js header (lines 1-13) and report() (268-288); addons/dsh-mission/lib/prompts.js reviewPrompt 112-131, conductorNote 133-151). Research tells the main model to show the Deep research report as it comes back, adding only a 'Bottom line' of two or three sentences. Mission's final report is put together by code, and the conductor must pass it on 'in full, as it is'. Mission's reviewer only judges items that no command can prove (these are marked REVIEWED). It may object to items marked PASSED and add up to four new items. Its 2-3 sentence note goes into the report as 'Reviewer's note'.
- **Standing texts that already set tone or the shape of an answer** (addons/dsh-cowork-shell/presets/*.md and index.js 492 (cowork-shell:project, order 58); addons/dsh-memory (group 'How I like answers', written into AGENTS.md); addons/dsh-model-tiers (tier and model-version instructions, order 70, 'Use only these'); addons/dsh-role-prompts (own sections, own orders); addons/dsh-evolve index.js 271 (lessons, evolve:notes order 72); addons/dsh-modes/lib/prompt.js COWORK_METHOD (approved word for word, core-14) and CODE_METHOD; addons/dsh-finance/lib/finance.js ADVISER_METHOD). Each of these is a standing instruction that can affect how answers are written. Examples:
- the Write project type: 'Feedback: start with what works';
- the Learn project type: 'say so kindly';
- Memory entries about how the owner likes answers;
- Cowork's approved method: 'lead with the outcome';
- Code's method: 'without praise for your own work';
- the Finance adviser: 'Never add a disclaimer'.
The model reads these sections in order of their number: Mission 57, Modes and project 58, the tab notes 59, tiers 70, Self-improve 72, Learn 74. None of them can be switched per conversation from the chat box, except by picking another tier or model version.
- **Each tab already fixes the order of its answers** (addons/dsh-finance/lib/finance.js METHOD ('Shape of a full answer': Snapshot, Figures, News, Mood, What is ahead, Risks, case for and against, What I could not find, Sources); addons/dsh-data/lib/method.js ('Shape of an answer': answer first, then detail, then a Queries list); addons/dsh-scout/lib/mode.js ('Report, in this order'); addons/dsh-research/lib/mode.js rule 5; COWORK_METHOD and CODE_METHOD 'How to report'). A Lens that changes what comes first (Encouraging: 'leads with what works'), what is allowed (Data only: 'no interpretation') or the balance (Skeptic: 'the strongest case against') would run into these fixed orders. The plan's rule says only that a Lens never overrides 'Recon's rules, Scout's guardrails, citations and source grades'.
- **Labels the tabs already put on claims** (addons/dsh-finance/lib/finance.js rule 2 (four kinds: reported facts, management's claims, others' views, own reading) and 177 (finance-4 'from memory, may be out of date'); addons/dsh-deep-research/lib/rounds.js writePrompt and lib/sources.js (research-4: read / seen only in search results / not read); addons/dsh-data/lib/method.js rule 2 ([Q7] after every number); addons/dsh-recon/lib/mode.js 'How to report'). Blunt's 'fact, inference or guess' labels would be a second set of labels in these tabs. A figure given from memory in Finance must never be labelled a fact.
- **Learn's tutor holds back the answer on purpose** (addons/dsh-learn/index.js 330 (learn:session, order 74); addons/dsh-learn/README.md). In any conversation, /learn starts a study session. The tutor asks first, gives hints step by step, and gives the full answer last, when the level allows it. Blunt's 'Answer first' and Data only's bare figures go against this.
- **Saving your own: the pattern for saved Lenses** (addons/dsh-cowork-shell/lib/presets.js (NAME_MAX 40, OWN_MAX 40, INSTRUCTIONS_MAX 12000, save 100-117, remove 119-127); README 'project types'). The shipped project types are files inside the add-on. Your own are my-*.md files in <home>/cowork-shell/presets: at most 40 of them, names up to 40 characters, texts up to 12,000 characters, and a shipped name is refused. A project keeps its own copy of the instructions, so removing a type changes no project. Because they are files on this Mac, neither Shared settings nor Sync carries them to a second Mac. A project type can also set how a conversation starts: 'search: off' writes sessionWeb=false when the conversation is created (cowork-shell index.js 511-533).
- **Tools for testing one text on several models** (addons/dsh-evolve/lib/verify.js (CHECK_TYPES incl. noneOf, line 11), lib/packs.js (AI_ISMS line 13; family = pack id), index.js 234-263 and 372-381; addons/dsh-benchmark/index.js (graders exact|contains|regex|judge, line 36; regex flag 'i' only, line 114; 'system' text put in front of the user message, line 456); addons/dsh-model-arena). - Self-improve can check that an answer contains none of a list of phrases, but each run works on one model or one model version.
- Benchmark runs the same prompt on a grid of models, with one grader per prompt. It has no 'none of' grader. A regex with a negative lookahead can stand in, but it must use [\s\S] to cover several lines.
- Model arena puts one prompt to 2 to 4 models side by side. It has no field for instructions.
- None of the three sends a text the way a conversation receives a Lens. Benchmark puts its 'system' text in front of the message; Self-improve does the same for plain tasks.
- **Research Focus, which overlaps in idea with the Journalistic and Scientific Lenses** (addons/dsh-deep-research/lib/rounds.js FOCUS (66-72); addons/dsh-research/index.js 61-80 (focus pinned per conversation in research/conversations.json; a chat-box pick also sets the start, 239-244)). Focus News and Focus Academic change what the planner and the searchers look for: the gathering side. A Lens would change only the writing side. Focus is also a precedent for the plan's 'starting Lens': it is fixed for a conversation at its first message.
- **The app has no answer-style switch of its own** (/tmp/dsh-asar/rc2/dsh-persona/README.md; dsh-agent-preset-registry/README.md; dsh-official-bundles/src/bundles.ts). The app's persona row (dsh-persona) belongs to an agent preset, chosen while a conversation is still blank and then kept. No shipped preset uses it. A preset with a 'complete' persona would replace the whole system prompt and drop every add-on section, a Lens included.

### Where the plan changes something built (needs your yes)

- **Today:** The left side of the chat-box row today holds:
- Modes' mode picker, plus Web, Helpers and Tools (orders -22 and -21);
- Route health's badge (-21);
- in the Research tab, Research's Depth and Focus (-20);
- in Finance, Finance's selection pill (-19).
The model button is on the right. When the row would wrap, Modes shrinks its own buttons in five measured steps (client.js 729-783). In 0.57.0 the Finance pill was squeezed to 71 px and the buttons overlapped. Now it shows all five parts from 1600 px, subject and market from 1280 px, and nothing below that. There is no Depth button and no Lens.
  **The plan:** Lens is a second row in a new Depth panel ('Depth · Thorough · Blunt'). But build step 4 (Lens) comes before step 5 (the Depth button).
  **Conflicts with:** the plan's own build order; the chat-box room fixed in 0.57.0 (finance-10 pill)
  **Question:** Today the row under your message box holds the mode picker, Web, Helpers and Tools, Route health's badge, and, in their own tabs, Research's Depth and Focus and Finance's pill. In 0.57.0 that row already ran out of room once. The plan puts the Lens inside a new Depth button, but builds the Lens one step before that button exists. Nothing you have now would be lost. Shall we build the Lens's hidden parts first and show it only when the Depth button arrives, or give the Lens a button of its own now and move it into Depth later?
  **Options:** Build the hidden parts of the Lens first (texts, storage, report writer). Show the Lens row together with the Depth button, so the visible Lens comes after the Depth button / Give the Lens its own chat-box button now, and move it into the Depth panel later (you would see it move) / Put the Lens list inside the Web button's list
  **Recommendation:** The first option. Nothing moves twice, and the crowded row gets one new button, not two.
- **Today:** Helpers get no Modes notes (dsh-modes index.js 921).
- Deep research: its 'Research review' runs on the planner role and picks the next round's searches (rounds.js 171-197, index.js 586-597). The writer writes the report (index.js 619). deep_research runs in every tab that has the web.
- Mission: its reviewer judges the items no command can prove, may object to PASSED items and adds items (prompts.js 112-131). Its note goes into the report. The final report is built by code (run.js 268-288) and passed on as it is (prompts.js 148). Mission's rule: 'A model never decides that something passed: commands decide, and the reviewer decides only what no command covers' (run.js 11-12).
  **The plan:** 'Searchers and workers stay neutral; the Lens goes to the writer and the reviewer.' Long run, built on Mission, adds a keep-or-roll-back gate that depends on the review.
  **Conflicts with:** the plan's own rule that a Lens never changes which facts are gathered; Mission's built pass/fail rule; Long run's keep-or-roll-back gate
  **Question:** When several models work on one answer, which of them should hear the Lens? Today the helpers hear none of your chat-box choices. The plan says 'the writer and the reviewer'. But:
- in Research, the reviewer decides what to search next;
- in Mission, and so in Long run, the reviewer decides on work no command can prove, and can reopen items.
A Skeptic or Encouraging reviewer would change what is searched or what passes. Nothing is lost today. The question is only what changes.
  **Options:** Only the conversation's own model, and the writer of Deep research reports in any tab / The writer and the reviewers, as the plan says / Only the conversation's own model. Research reports keep their neutral wording, and only the short 'Bottom line' follows the Lens
  **Recommendation:** The first option. A Lens changes wording, never what is found or what passes. In Mission and Long run it then shapes only the conductor's short status lines, because code builds the report.
- **Today:** Several standing texts already set tone:
- project instructions (cowork-shell:project, order 58), for example Write's 'start with what works' and Learn's 'say so kindly';
- Memory's 'How I like answers' (in AGENTS.md, sent with each new conversation);
- model-version and tier instructions (order 70);
- role prompts (their own orders);
- Self-improve lessons (order 72);
- Cowork's method, approved word for word (core-14): 'lead with the outcome';
- Code's method: 'without praise for your own work'.
The app joins sections in order of their number, so a Lens placed inside Modes' own section (58) would come before the tier text, the lessons and Learn.
  **The plan:** 'A Lens never overrides a tab's own rules.' The plan says nothing about project types, Memory, model versions, role prompts or Self-improve lessons.
  **Conflicts with:** core-14 (Cowork's method wording stays untouched, so the Lens must be a separate note); built project types and Memory
  **Question:** Suppose a Lens says one thing about tone and one of your standing texts says another: a project type (such as Write's 'start with what works'), a Memory entry under 'How I like answers', a model version's or tier's instructions, a role prompt, or a Self-improve lesson. Which should win in that conversation? None of these texts would be changed or deleted. The only question is which one the model is told to follow.
  **Options:** The Lens wins on how the answer is worded. The standing texts still decide everything else (what to do, which files, which rules) / The standing texts win; the Lens only adds where they say nothing / Leave it to the model (not recommended: it would be unpredictable, because the model tends to follow whichever text comes last)
  **Recommendation:** The first option. You pick a Lens for this conversation on purpose, so it should beat a general preference. To make that reliable, the Lens gets its own section placed after the others, and says so. The tab's rules still win, as the plan says.
- **Today:** A model version set to 'Use only these' leaves out the mode's own words, the tier's instructions and effort wording, the role prompts and the shared Self-improve lessons (model-tiers README 56-60; prompt.js 169; evolve index.js 252-262). Recon's and Scout's rules stay (recon-5, new-2, keepPrompt). The Web and tool notes stay.
  **The plan:** Silent
  **Conflicts with:** new-2 and Model Tiers' 'Use only these' behaviour
  **Question:** Some of your model versions can be set to use only their own instructions. That leaves out the added texts: the mode's words, the tier's words, role prompts and shared lessons. Should a Lens you picked in the chat box still apply in a conversation on such a version? Nothing that exists today changes either way.
  **Options:** Yes, the Lens stays (as the Web notes do) / No, 'Use only these' leaves the Lens out too
  **Recommendation:** Yes. It is a choice you made in this conversation, like Web, not a standing text.
- **Today:** - Self-improve works on one model or one model version per run. For plain test tasks it puts the text under test in front of the message; for tool tasks, and in real conversations, it puts it in the instructions (evolve index.js 372-381, 271). Real conversations use lessons for 'general', for every example set and for the conversation's mode (234-246), so lessons from a 'Lens' example set would reach every conversation. It has a 'none of these phrases' check (noneOf).
- Benchmark runs a prompt on several models. Its 'system' text is put in front of the message (index.js 456). It has one grader per prompt (exact, contains, regex, judge) and no 'none of' grader.
- Model arena compares 2 to 4 models on one prompt.
- The gap plan's D4 proposes, but has not built, a short real-model check the owner runs once per release.
  **The plan:** 'Each Lens is tested per model with Self-improve before it ships, using checks for banned phrases.' In the build table, the Lens row (step 4) comes first and testing is part of it.
  **Conflicts with:** built Self-improve lesson matching
  **Question:** The plan tests each Lens on each of your models with Self-improve. But Self-improve works on one model at a time, and anything it learns from a Lens test would be added to every conversation, not only those with that Lens. Benchmark already runs the same question on several models side by side and changes nothing in your conversations. Only you can run these tests, on your Mac with your models; the builder's lab has only a stand-in model. Which shall we use?
  **Options:** Benchmark measures each Lens on your models (with a new 'none of these phrases' check). Self-improve stays as it is / Self-improve, extended so that a Lens lesson is used only where that Lens is on (this changes how Self-improve picks lessons) / Both: Benchmark first, and extend Self-improve only for a model that keeps ignoring a Lens
  **Recommendation:** The third option, Benchmark first. Measuring changes nothing in your app, and Self-improve is touched only if a model really ignores a Lens. The measurement comes before the Lens appears in your chat box, as the plan asks. Benchmark puts the text in the message, not in the instructions, so its results are a guide, not proof.
- **Today:** Web is chosen per conversation (sessionWeb, sessionSearchDepth). Chat starts with Web Off (mask.js webDefault). A Paperwork project starts with Web Off for privacy (cowork-shell index.js 511-533). Data keeps Web on (data-7). Research and Scout have no Web button and no Web level: the web is always on there, and they follow their own method (research-1, scout-9).
  **The plan:** Rule for Blunt: 'facts still need Web at Thorough or above'. Thorough here is a Web level, but the button the Lens sits in shows Depth's stops, so 'Depth · Thorough · Blunt' can show while Web is Off.
  **Conflicts with:** built Web choices; Paperwork's Web Off; the plan's own name clash between Depth's and Web's 'Thorough'
  **Question:** The plan says that, under a Blunt Lens, facts still need Web at Thorough or higher. In Chat and in Paperwork projects your Web starts Off on purpose. Research and Scout have no Web level at all. Should picking Blunt (or Scientific, Journalistic or Data only) ever change your Web setting, or only warn you?
  **Options:** Never change Web. The Lens tells the model to label anything it could not check as inference or guess, and the Lens list shows a one-line hint when Web is below Thorough (never in Research or Scout) / Picking such a Lens raises Web to Thorough, except where Web is Off on purpose / These Lenses refuse factual answers unless Web is at Thorough
  **Recommendation:** The first option. Web Off is often a privacy choice (Chat, Paperwork), and a choice about wording should not switch the internet on.
- **Today:** The Lens texts do not exist yet. Rules a Lens must leave alone:
- Finance gives figures from memory only with a 'from memory, may be out of date' mark (finance-4).
- Finance never says buy, sell or hold unless the adviser is on; with the adviser on it never adds a disclaimer (finance.js 52-91).
- Research keeps its read / not-read labels (research-4) and shows the report as returned.
- Recon and Scout keep their rules under any model version (new-2).
- Cowork's method stays word for word (core-14).
Each tab also fixes the order of its answers: Finance's 'Shape of a full answer', Data's answer first with a Queries list, Scout's report order, Cowork's 'lead with the outcome'.
  **The plan:** Seven Lenses with the wording in the plan's table. 'A Lens never overrides a tab's own rules: Recon's rules, Scout's guardrails, citations and source grades all stay.' Nothing is said about each tab's answer order or about required warnings.
  **Conflicts with:** core-14, finance-4, research-4, new-2; built answer orders of Finance, Data, Scout and Research
  **Question:** You approved Cowork's method word for word. Do you want to approve each Lens text the same way? And when a Lens is on, should each tab keep its own order of sections (Finance's Snapshot first, Data's answer and query list, Scout's report order)? For example, Encouraging 'leads with what works' and Data only gives 'no interpretation'. A Lens would change no tab's texts. The question is what the model does when the two point different ways.
  **Options:** Approve each text word for word. The tab's rules, labels and order of sections stay; the Lens changes tone and emphasis inside them. Each text gets two extra sentences: 'the tab's rules and labels come first' and 'a required warning is not softening' / The Lens may change the order of an answer, but not the tab's rules / Offer only some Lenses in some tabs (for example no Data only in Finance, no Encouraging in Recon)
  **Recommendation:** The first option. The tab orders were built for a reason and you have approved some of them, so they should not shift with a Lens.
- **Today:** Finance labels four kinds of claim (reported facts, management's claims, others' views, its own reading) and marks figures from memory. Research's report labels claims from pages that were not read. Data ties every number to its query id ([Q7]). Recon keeps apart what one source says, what several agree on, and what it concludes.
  **The plan:** Blunt: 'Mark each key claim as fact, inference or guess.'
  **Conflicts with:** finance-4, research-4, built Data rule 2
  **Question:** Blunt marks each key claim as fact, inference or guess. Finance, Research, Data and Recon already label claims in their own way. In those tabs, should Blunt add its three labels on top, or use the labels the tab already has?
  **Options:** Use the tab's own labels where it has them; add fact / inference / guess only in Chat, Cowork and Code. A figure from memory is never labelled a fact / Always add Blunt's three labels as well
  **Recommendation:** The first option. Two sets of labels on one sentence are hard to read, and the tab's labels already say how far a claim can be trusted.
- **Today:** /learn in any conversation starts a study session. The tutor (learn:session, order 74, after Modes' notes) asks first, gives hints step by step, and gives the full answer last, when the level allows it.
  **The plan:** Blunt: 'Answer first'. Data only: figures without interpretation. The plan does not mention Learn.
  **Conflicts with:** built Learn tutor
  **Question:** During a /learn study session, the tutor holds back the answer on purpose so that you do the thinking. Blunt says 'answer first'. While a study session is on in a conversation, should its Lens pause?
  **Options:** The Lens pauses during a study session, and the chat box says so; it comes back when the session ends / The Lens stays on, but changes only the tone, never when the answer is given
  **Recommendation:** The first option. The tutor works because it withholds answers; a Lens that hands them out would undo what you set it up for.

### Changes that need no decision

- Today: There is one starting Web level for all tabs. Any pick in a chat box also changes it, and conversations that never picked one follow it. Research's Focus, and Finance's and Scout's selections, are fixed for a conversation at its first message. Finance, Data, Research, Scout and Recon have no mode card on Settings → Modes, and their mode entries are rewritten every 3 seconds (for example dsh-research index.js 85-113). You decided on 15 November: Default is the start in every tab, and a tab starts on another Lens only where you set that. Plan: A starting Lens per tab, on each mode card (build step 3).
- Today: Your own project types are files on this Mac: at most 40, and a shipped name is refused. A project keeps its own copy of the instructions, so removing a type changes nothing. Plan: 'You can also save a Lens of your own, the way project types can be saved.'
- Today: The scheduler opens a conversation in the mode set for scheduled tasks. Its mode and tier are applied in the 'schedule/resolve-agent' step, before the task's message is sent (Modes index.js 1003; HANDOFF 0.57.0). Plan: The Automations detail panel holds Web, Depth and Lens for each automation (build step 17, which needs step 4).
- Today: Memory keeps lasting preferences ('How I like answers'), which go to every new conversation. Plan: Skill architect: 'A fact or preference about you → Memory'. If you often pick Blunt, it could propose 'prefers blunt answers' for Memory, which would then reach every conversation, including those on Default.
- Today: Only Rerun copies a conversation's Modes choices. The app's Branch, cowork-shell's Promote / Continue in a project and, probably, Put back after a restart (Modes clears entries of conversations not in the store) start without them. Today that already happens to Web, Tools and helper choices. Plan: Silent about the Lens. The Trash part adds Put back for more kinds of items, and Scratch adds 'Keep in a project'.

### Where the plan is out of date

- The plan says: Part 11 of MODES-AND-SETTINGS.md holds 26 decisions answered on 15 November that are not built yet.
  In fact: All 26 were built in 0.57.0 (section 11's header, section 13, and HANDOFF's 0.57.0 entry). For the Lens, the ones that matter are: core-14 (Cowork's method word for word), new-2 (Scout's rules under any model version), finance-4 (figures from memory are marked), research-4 (read / not read labels), data-7 (Data keeps Web on) and finance-10 (the Finance pill, and the room in the chat box).
- The plan says: 'A Lens is a note added to the instructions, like the Web level notes.'
  In fact: Research and Scout get no Web notes (research-1, scout-9), and no helper gets any Modes note. A Lens built exactly like the Web notes would therefore not reach Research, Scout or the Deep research report writer. Modes' section also takes separate paths for Tools off, Recon and model versions that stand alone, and the Lens has to be added to each on purpose.
- The plan says: 'Searchers and workers stay neutral.' (presented as something to build)
  In fact: This is already true: helpers get no Modes notes (dsh-modes index.js 921). There is nothing to build.
- The plan says: 'The Lens goes to the writer and the reviewer.'
  In fact: Research's reviewer ('Research review') picks the next round's searches, so a Lens there would change which facts are gathered, against the plan's own first rule. Mission's reviewer judges work that no command can prove and can reopen items. Mission's final report is built by code, so the Lens cannot shape it.
- The plan says: 'A Lens never overrides a tab's own rules: Recon's rules, Scout's guardrails, citations and source grades all stay.'
  In fact: Source grades do not exist yet: they come in build step 10, after the Lens (step 4). Today Research has three read / not-read labels, Data has [Qn] ids, Finance has four kinds of claim and the 'from memory' mark, and Recon has [S#] numbers. The list also leaves out each tab's fixed order of answer sections and Learn's tutor, which holds back answers.
- The plan says: 'Each Lens is tested per model with Self-improve before it ships.'
  In fact: Self-improve works on one model or model version per run, and its lessons for kinds of work reach every conversation. For plain tasks it puts the text in the message, not in the instructions. Benchmark is the tool that runs one prompt on several models, but it has no 'none of' grader and also puts its text in the message. Either way, only the owner can run the tests, on his Mac.
- The plan says: Blunt: 'facts still need Web at Thorough or above.'
  In fact: Chat and Paperwork projects start with Web Off on purpose, and Research and Scout have no Web level. 'Thorough' here is a Web level, but the button the Lens sits in shows Depth's stops ('Depth · Thorough · Blunt'), which can show while Web is Off.
- The plan says: Lens 'Size: small' (Lens section).
  In fact: The build table says M. Counting the report writer, the measuring step, the per-tab start and your own Lenses, it is several S and M steps.
- The plan says: Build order: step 4 (Lens row) comes before step 5 (Depth button).
  In fact: The Lens row sits inside the Depth panel, so the visible Lens needs the Depth button first. Only its hidden parts can come earlier.
- The plan says: 'Where this plan touches what is built' lists nothing for the Lens.
  In fact: The Lens touches built things: project-type instructions, Memory's 'How I like answers', model versions' instructions and 'Use only these', role prompts, Self-improve lessons, Cowork's approved method (core-14), Code's method, each tab's fixed answer order (Finance, Data, Scout, Research), Learn's tutor, Deep research's writer, and the chat-box room fixed in 0.57.0.
- The plan says: The starting Lens is set on 'each mode card on Settings → Modes'.
  In fact: Finance, Data, Research, Scout and Recon have no mode card, and their mode entries are rewritten every 3 seconds, so a starting Lens cannot be kept in them. It needs a table of its own: the per-tab table from the Depth part.
- The plan says: 'You can also save a Lens of your own, the way project types can be saved.'
  In fact: Project types are files on one Mac: Shared settings and Sync do not carry them, and a project keeps its own copy of the text. A saved Lens kept in Modes' settings would travel to a second Mac. It looks the same in use but behaves differently.

### What the app allows

| Needed | Available | Evidence |
|---|---|---|
| Add a note for each conversation to the model's instructions, worked out again at every step | yes | /tmp/dsh-asar/rc2/dsh-system-prompt/README.md (sections whose text is resolved at each assembly); used today by Modes' 'modes:mode' section (dsh-modes index.js 911-954) |
| Place the Lens before or after other add-ons' texts, so the right one wins | yes | dsh-system-prompt README line 56: sections are joined in ascending order (equal orders by name), and any finite order is allowed. Today: Mission 57; Modes and project 58; Research, Finance, Scout and Data 59; tiers 70; Self-improve and Code map 72; Learn 74; Context saver 75; Swarm 76. The app's Web surface (10100) and persona suffix (10200) come last. |
| Default leaves the request exactly as it is today | yes | dsh-system-prompt README line 112: empty sections are dropped when the prompt is rendered |
| Store a choice per conversation and change it from the chat box | yes | Volatile Config fields plus settings.mutate (HANDOFF section 3); Modes' sessionWeb and the other per-conversation fields |
| A control in every tab's chat box, Research, Scout and Recon included | partly | The slot 'conversation.input.left' is used by Modes (-22, -21), Route health (-21), Research (-20) and Finance (-19). Modes' toggles appear in every tab (only Web is hidden in Research and Scout). Room is short: in 0.57.0 the Finance pill overlapped the row, and Modes' fit steps are in client.js 729-783. |
| Pass a Lens to Deep research's report writer | yes | Add-on code only: writePrompt in dsh-deep-research/lib/rounds.js 248-273, sent as the helper's message by runChild (index.js 258-292). The parent conversation's id is known there, so Modes can be asked for its Lens. |
| Apply a Lens to a conversation an Automation task opens | yes | The 'schedule/resolve-agent' step runs before the task's message is sent (HANDOFF 0.57.0 entry; dsh-modes index.js 1003) |
| Keep the Lens when a conversation is copied | partly | Rerun carries Modes' choices (dsh-modes client.js 515). The app's Branch and cowork-shell's Promote copy no add-on choices. |
| Test the same Lens text on several models | partly | Benchmark: a grid of models, with the text put in front of the message (index.js 456) and one grader per prompt (exact/contains/regex/judge). Self-improve: has noneOf, but one model or version per run. Model arena: 2 to 4 models, no field for instructions. None of them sends the text the way a conversation receives it. |
| See exactly what a model received, in the lab | yes | MOCK_DUMP on the mock model server (HANDOFF section 4) |
| Your own Lenses on a second Mac | partly | Shared settings shares the Modes fields that are not on its skip lists (dsh-shared-settings index.mjs 32-51), but only once it is set up. Project-type files are not shared. |
| An answer-style switch in the app itself | no | There is no such setting in the app source. dsh-persona belongs to an agent preset chosen while a conversation is blank, and no shipped preset uses it (dsh-official-bundles). A 'complete' persona would drop every add-on section. |
| Switch the Lens in the middle of a conversation without a long wait on a local model | partly | dsh-system-prompt README line 156: a changed prompt is either added into the history or rewritten at the head, and in the second case the model re-reads from the first changed token. A Web-level change works the same way today. |

### To try in the lab before building

- **What each conversation receives, with Default and with a Lens** Why: Default must give exactly today's request. A Lens must appear once, in the planned place, in every path (Chat, Cowork, Code, Finance, Data, Research, Scout, Recon, Tools off, a model version set to 'Use only these'). Helpers must get nothing, and the report writer only what the owner chose. How: Use the mock model with MOCK_DUMP. Send the same message in each tab, before and after the change. Compare the saved requests byte for byte for Default, and look for the Lens text for a Lens.
- **Room in the chat-box row** Why: 0.57.0 had the Finance pill squeezed and the row's buttons overlapping. The Lens or Depth button adds width. How: Use the lab at 1280×860 and at 1600 wide, in Finance (pill), Research (Depth and Focus), Recon and Cowork, with a long Lens name. Check there is no overlap and no second line, and that the Lens name is the first thing to drop.
- **The Lens is carried and cleaned up** Why: Rerun must keep it. A deleted conversation's entry must go. Shared settings must not share the per-conversation field. How: In the lab: Rerun an answer and read the copy's Modes settings; delete a conversation, restart, and check the entry is gone; turn on Shared settings with a throwaway folder and read the shared file.
- **Changing the Lens partway through a conversation** Why: To see whether the app adds the new instructions after the history or rewrites the start, which forces a local model to re-read the whole conversation. How: Use the mock model with MOCK_DUMP. Send three messages, change the Lens, send one more, and look at where the system text sits in the last request.
- **Benchmark's new 'none of these phrases' grader** Why: It must pass and fail correctly, also across several lines and regardless of upper and lower case, and must leave the other graders unchanged. How: Unit tests, plus one Benchmark run on the mock model with a suite that should pass and one that should fail.
- **What Put back from the trash keeps (for the Trash part)** Why: Modes clears entries for conversations that are no longer stored, so a conversation put back after a restart may come back without its Web, Tools, Lens and isolation marks. How: In the lab: set Web Off on a conversation, delete it, restart, Put back, and read its Modes entries.

### Steps

> **Status (15 November 2026):** step 24 done (texts approved word for word), step 25 done (Benchmark's 'Contains none of these' grader and the Lenses suite; the owner runs it on his models). Step 26 done: the Lens in its own section (order 73), kept under 'Use only these', paused during a study session. Step 27 done: Deep research's report writer follows the Lens (planner, searchers, review neutral). Step 28 done: the Lens chips inside the Depth list (button 'Depth · Thorough · Blunt'), the Web Off hint for fact Lenses. Step 29 dropped (owner, 15 November, after the one-Depth rule): every new conversation starts on Default; no starting Lens per tab. Step 30 done: your own Lenses on Settings → Modes (40, 40 characters, 4,000 characters, shipped names refused, the same guard).

**Step 24. Lens texts, hidden** (size S)

- What: Write the six Lens texts as one file in Modes (Default adds nothing), in the plan's words plus the lines your answers call for:
- 'the tab's rules, labels and order of sections come first';
- 'a required warning is not softening';
- 'a figure from memory is never a fact'.
Nothing uses them yet. Bring them to you for word-for-word approval.
- Add-ons: dsh-modes
- Tests: Default is empty. Each text stays under a length limit and contains the guard lines. No text contains a phrase from Self-improve's AI_ISMS list. The names match your list.
- What could break: The wording drifts from what you approved. Texts that are too long for small local models.
- Needs first: Your answers on wording approval, on labels, on which text wins, and on the Web rule
- Cannot be verified before you try it: How real models follow each text

**Step 25. Measure each Lens on your models with Benchmark** (size M)

- What: Add a 'none of these phrases' grader to Benchmark (a new choice; nothing else changes) and an example suite 'Lenses': each Lens on three or four questions, checked for banned phrases and by a judge's description. You run it on your Mac; nothing reaches your conversations.
- Add-ons: dsh-benchmark
- Tests: The new grader passes and fails correctly, across lines and regardless of case. The existing graders give the same results. The example suite loads and passes validation. One run on the mock model.
- What could break: A judge model has to be available. A cloud judge costs money, within the existing spending limit.
- Needs first: Step 1; your answer on how to test
- Cannot be verified before you try it: Results on your models (only you can run them). Benchmark puts the Lens in the message, not in the instructions, so its scores are a guide.

**Step 26. Lens per conversation in the instructions, hidden** (size M)

- What: Add a per-conversation field, sessionLens. Its text goes in every path of Modes' notes (normal, Tools off, Recon, Research and Scout, and model versions that stand alone, per your answer), either as its own section after the standing texts or inside Modes' section, per your answer on which wins. Helpers get nothing. Rerun carries the field, the clean-up of deleted conversations covers it, and Shared settings keeps it on each Mac. Modes offers lens(id) to other add-ons. There is no button yet.
- Add-ons: dsh-modes, dsh-shared-settings
- Tests: With Default, promptText gives exactly today's text in every path. With a Lens: each path, and a helper (nothing). Rerun's carried list. The clean-up list. ALWAYS_SKIP. The whole add-on in the stand-in app (claim.test style).
- What could break: Missing one path. A Lens placed too early in the instructions is outweighed by later texts.
- Needs first: Step 1; your answers on which text wins and on 'Use only these'
- Cannot be verified before you try it: Real model behaviour

**Step 27. Lens for the Deep research report writer** (size S)

- What: writePrompt gets an optional Lens line after its own rules (citations, read / not-read labels, no new facts). The planner, the searchers and the review are unchanged. It works in every tab where deep_research runs. Skip this step if you choose 'only the conversation's own model'.
- Add-ons: dsh-deep-research, dsh-modes
- Tests: With no Lens, writePrompt gives exactly today's text. With a Lens, the line comes after the rules. The plan, search and review prompts are unchanged. The existing parse tests pass.
- What could break: A Blunt line weakening the rule 'never present it as confirmed'.
- Needs first: Step 3; your answer on who hears the Lens
- Cannot be verified before you try it: How a real writer model applies it

**Step 28. The Lens row in the chat box** (size M)

- What: A Lens row in the Depth button's panel (or wherever you choose), with Default first and your names. When a fact-heavy Lens is on and Web is below Thorough, a one-line hint shows (never in Research or Scout). It never changes Web or the tab's start. The Lens name is the first thing to drop when the row is narrow. It is not installed in your app before you have seen step 2's results.
- Add-ons: dsh-modes
- Tests: Unit tests for the label and hint helpers. Lab screenshots at 1280 and 1600 wide in Finance, Research, Recon and Cowork: no overlap, one line.
- What could break: The chat-box row overflows again next to the Finance pill.
- Needs first: Step 3; the Depth button step from the Depth part; your answers on placement and on the Web rule; step 2's results
- Cannot be verified before you try it: Only the lab's stand-in model and screens

**Step 29. Starting Lens per tab** (size M)

- What: A 'Starting Lens' column in the per-tab table that the Depth part adds to Settings → Modes, covering the add-on tabs too. It is stored apart from the mode entries and set to Default everywhere unless you set one. A new conversation takes it at its first message; older ones keep theirs.
- Add-ons: dsh-modes
- Tests: A new conversation in each tab gets its tab's start. Changing the start leaves older conversations alone. The value survives the 3-second rewrite of the add-on tabs' entries. A scheduled conversation gets its tab's start.
- What could break: Pinned conversations behave differently from Web, where conversations that never picked follow the start.
- Needs first: Step 3; the per-tab table step from the Depth part
- Cannot be verified before you try it: Nothing beyond the lab

**Step 30. Your own Lenses** (size M)

- What: Save, edit and remove your own Lenses on Settings → Modes: at most 40, each up to 4,000 characters, and a shipped name is refused. Each gets the same guard lines. They are kept in Modes' settings, so Shared settings carries them. A conversation whose Lens was removed goes back to Default, and the button says so.
- Add-ons: dsh-modes
- Tests: The limits, the refused name, the fallback after removal. Shared settings carries the list but not the per-conversation picks.
- What could break: A text of your own that asks for something a tab's rules forbid (the guard lines come first).
- Needs first: Step 5
- Cannot be verified before you try it: How real models follow your own texts

**Step 31. Per-Lens lessons in Self-improve (only if needed)** (size M)

- What: Only if step 2 shows a model keeps ignoring a Lens, and only with your yes: a lesson filed under a Lens is used only in conversations where that Lens is on. This changes how Self-improve picks lessons.
- Add-ons: dsh-evolve, dsh-modes
- Tests: A Lens lesson appears only where that Lens is on. General, example-set and mode lessons are unchanged. The x-1 test still passes.
- What could break: A Lens lesson learned on one model is used on another.
- Needs first: Step 2's results; step 3; your yes
- Cannot be verified before you try it: Improvement on your real models


---

## Scratch

### What already does part of this job

- **Chat starts every new chat in the app's default workspace, a real folder: ~/Documents/deepseek-harness/default-workspace** (addons/dsh-cowork-shell/client.js defaultWorkspace (1743-1746), homeFor (2299-2321), startNew (2337-2346), switchTab (2435-2447); app dsh-api-workspace-controller/src/default-directory.ts and default-workspace.ts). homeFor returns the default workspace for the Chat tab; startNew and switchTab call uiWorkspace.startSession(home.workspaceId). The app makes that folder only at first use, when nothing else exists. Tested in test/start-home.test.mjs.
- **The Chat tab hides the app's folder picker while the open chat lives in the default workspace** (addons/dsh-cowork-shell/client.js plainChat (2395-2406), CSS rule at line 919). Sets data-cws-plain-chat on the page; CSS hides the workspace chip and the conversation.hero.workspace seat. The preset picker stays visible (since 0.20).
- **Promote and Continue in a project (Chat tab only)** (addons/dsh-cowork-shell/client.js MoveMenu (1764-1811), continueIn (1923-1931), row onContinue only when flat (2202-2210); README 'Chat tab: no folders'). Promote lists every other tab (not only Cowork and Code) and changes the tab and mode; the conversation stays in its folder. Continue opens a new conversation in a picked project, as a picked tab (Code first), with an @[title](dsh-session:...) mention; the app attaches a read-only copy of the chat's messages when it is sent. No files are copied.
- **Other tabs start in the open conversation's project, else the last used one, never the Recon room; the project's instructions and type then apply** (addons/dsh-cowork-shell/client.js homeFor, rooms/roomKey (2290-2291), chips (2790-2813); index.js projectNote (473-486), startSearchOff (512-535); docs/MODES-AND-SETTINGS.md lines 118 and 1055). Same choice as the app's navigation.ts startSession (current project, else recentWorkspace), skipping isolated rooms (recon-3). Any non-Recon conversation whose folder is a project gets that project's instructions, its type's tool pointers, and Web Off for a Paperwork project. This applies to every tab, not only Cowork.
- **Plus already creates conversations by folder alone, with no project** (addons/dsh-modes/client.js startRerun (491-538: Rerun of a first question calls sessions.create({cwd})); addons/dsh-engines/client.js (206: compare page calls sessions.create({cwd: work}))). Both send the first message themselves (remote.session.prompt) and then open the conversation. Such conversations appear under 'Other conversations' (lib.loose) in non-Chat tabs and in the Chat list; Show in Finder is hidden for them because they have no project (client.js 1866, 2087).
- **Recon's own throwaway place (closest thing to Scratch today)** (addons/dsh-recon/index.js (DEFAULT_ROOM /private/tmp/dsh-recon-room line 56, prepareRoom empties it 217-231, inRoom 241); lib/wipe.js; cowork-shell startInRoom (2269-2283)). One room shared by all Recon conversations, registered as the project 'Recon room', emptied whenever Recon starts; Recon tools are off in any other folder. '/recon end' (End and wipe) archives and deletes the conversation's stored files at once, never the trash.
- **30-day trash with Put back (messages only)** (addons/dsh-cowork-shell/lib/trash.js; index.js 648-758 (route, tidy every 6 h); client.js remove/putBack (1953-1971), Trash (n) list (2153-2168)). Delete archives, then moves the stored conversation folder and its projcache entry (and its helpers') into <app home>/trash/conversations/<id>; one still open is moved at the next tidy or start; removed after 30 days. Files the conversation made in folders are never touched. No Delete permanently, no Empty trash. Known bug (found by the Trash part): Put back after a restart loses the conversation's tab and choices, because Modes prunes per-conversation fields of conversations it cannot find (dsh-modes/index.js 1355-1387).
- **Many-at-once archive and delete** (addons/dsh-cowork-shell/client.js archiveMany (2006-2018), removeMany (2019-2035), since 0.47.0). Cmd/Shift-click selection, one confirmation, each goes to the trash. A clean-up button can reuse this path.
- **Sync leaves Recon conversations out and never carries folder files** (addons/dsh-sync/lib/isolation.mjs, lib/mirror.mjs, README 'How it works'). Mirrors $DSH_HOME/sessions byte for byte except conversations Modes marks isolated (x-6, 0.57.0); push and pull stop when Modes cannot be asked. The store is laid out as <encoded project folder>/<conversation id>/..., so leaving out a place is possible.
- **Reports and per-conversation records kept by add-ons in their own folders** (addons/dsh-research/index.js 46-48, lib/mode.js saveReport/listReports; addons/dsh-scout/index.js 92-97, lib/report.js, lib/tools.js 331-338, lib/store.js; addons/dsh-data/index.js 67-69, lib/store.js). Research: <app home>/research/reports unless a folder is set; Settings -> Research lists the latest 20 with Show in Finder; reports do not record which conversation made them. Scout: reports in the Scout folder's 'reports' (the Scout folder is <app home>/scout/files unless you picked your own), with a .seen.json each; since 0.57.0 (scout-10) a run marks each posting with the oldest of up to 50 earlier reports from other conversations that had it. Scout also keeps postings per conversation in <app home>/scout/postings and each conversation's selection in scout/conversations.json. Data: <app home>/data/queries.json (SQL text, file names per conversation) and analyses.json (up to 200 result rows), saved-analysis names shared by all folders (data-5).
- **Files made by add-ons land in the conversation's folder, written by the add-on itself** (addons/dsh-diagram/index.js 253-310 (folderOfAgent, diagrams/ in the working folder); addons/dsh-media-tools/index.js 516, 597 (working folder); addons/dsh-data/index.js 113-116 and lib/method.js (data-output in the original folder, charts as SVG since data-6)). Diagram and image tools use the conversation's working folder, which the assistant can move with the app's working_directory tool (a core tool, dsh-modes lib/trim.js 17). They write with plain file calls, so neither Read Only nor Workspace Write stops them. Data's charts and Python output go into data-output of the conversation's original folder.
- **Data and the PDF reader read only inside allowed folders** (addons/dsh-data/lib/files.js inside() (21-34); addons/dsh-pdf/index.js folderOfAgent (246-258), README 'Where it may read'). Data refuses any path outside the conversation's original folder and runs Read Only since 0.57.0 (data-1). The PDF reader allows the working folder, folders listed on its settings page, and anywhere if 'Allow any PDF on this Mac' is on. The assistant can still read a file's text with the app's own read tool.
- **Mission keeps checkpoints in its own git store inside any folder** (addons/dsh-mission/lib/checkpoints.js (store .dsh-mission/checkpoints.git, git init line 56), lib/gate.js). Works in any folder; refuses only in isolated (Recon) conversations or where the tier allows no sub-agents (x-2). Needs git on the Mac.

### Where the plan changes something built (needs your yes)

- **Today:** The app's start page disables its chat box ('Choose a workspace to start') for a never-sent conversation that belongs to no project (dsh-client-ui-conversation ConversationContent.tsx: inert = hero && chipTitle === undefined, chip title is undefined once the project list is ready and no project owns the conversation). A project needs the conversation's folder to be exactly the project's folder (dsh-workspace entity.ts attachSession). Plus's existing folder-only starts (Rerun of a first question, Engines' compare) avoid this by sending the first message themselves.
  **The plan:** Each Scratch thread gets its own hidden folder from the start and is not listed as a project.
  **Conflicts with:** built behaviour: the app's start page (not changeable by Plus) and its project rules
  **Question:** The app does not let you type the first message of a new conversation unless it belongs to a project: its chat box then reads 'Choose a workspace to start'. So a Scratch thread cannot simply have its own unlisted hidden folder, as the plan says. If the lab confirms this, there are two ways. One: a single hidden place called 'Scratch' that the app counts as one project, like the Recon room today; each thread gets its own sub-folder in it, and deleting a thread removes its sub-folder. 'Scratch' then shows as one entry in the app's folder list. The catch: the assistant in one Scratch thread could in principle change files of another Scratch thread, never files in your own folders. Two: each thread its own unlisted folder, and Plus shows its own box for the first message; that first message could not carry attached files, slash commands or @-mentions. Which do you want?
  **Options:** One hidden 'Scratch' project with a sub-folder per thread (like the Recon room) / One unlisted folder per thread, with Plus's own box for the first message
  **Recommendation:** The first, once lab trial 1 confirms the disabled chat box: the app's own chat box, attachments, chips and its New shortcut keep working, and Plus already runs the Recon room this way. Plus keeps each thread's working folder inside its own sub-folder.
- **Today:** Chat starts every new chat in the default workspace (~/Documents/deepseek-harness/default-workspace) with the folder picker hidden. Cowork, Code, Finance, Data, Research and Scout start in the open conversation's project, else the last used one (homeFor, start-home tests). Any non-Recon conversation started in a project gets that project's instructions and type (Paperwork starts with Web Off), in every tab. 0.57.0 did not change start places.
  **The plan:** Every tab except Code starts in Scratch (decided 15 November). Recon keeps its room. This replaces homeFor's choice for six tabs and Chat's default-workspace rule; new conversations no longer pick up the last project's instructions unless a project is picked.
  **Conflicts with:** built behaviour: dsh-cowork-shell homeFor/startNew/switchTab/chips, Chat plainChat, test/start-home.test.mjs; recon-3 (its 'never the room' rule must also skip the Scratch place)
  **Question:** Today a new chat starts in a real folder in your Documents, and a new Cowork, Data, Finance, Research or Scout conversation starts in the project you used last, with that project's instructions (and Web Off in a Paperwork project). The plan makes all of them start in Scratch; only Code keeps the last folder. Your old conversations stay where they are and nothing is moved. What you would lose by default: a new Data conversation would no longer open in the folder that holds your data, and no new conversation outside Code would get a project's instructions unless you pick the project. Go ahead as you decided on 15 November?
  **Options:** As decided: every tab but Code starts in Scratch, with a switch per tab on Settings -> Modes / Only Chat, Research, Scout, Finance and Recon start in Scratch; Cowork and Data keep the last project / Keep today's start places and offer Scratch only as a choice on the start page
  **Recommendation:** As decided, but switch the new start places on only in the last Scratch step, after delete, dropped files, reports and Keep in a project work, and show each tab's start place on Settings -> Modes so it can be changed back in one click.
- **Today:** Research saves each report in <app home>/research/reports (or a folder set in Settings); Settings -> Research lists the latest 20, Show in Finder. Scout saves reports in the Scout folder's 'reports' (the Scout folder is in the app's home unless you picked your own), and since 0.57.0 (scout-10) marks what is new against up to 50 earlier reports of other conversations. Neither records which conversation made a report.
  **The plan:** In Scratch, saved reports stay with the thread only. Since Research and Scout start in Scratch by decision, almost every report would leave the report folders.
  **Conflicts with:** scout-10; Research's Saved reports list
  **Question:** Research and Scout save their reports in their own folders today, and Scout uses earlier reports to tell you what is new. If Scratch keeps reports only inside each thread, Settings -> Research would stop listing them and Scout could no longer say what is new since your last search, because each search would be its own thread. Which do you want?
  **Options:** As the plan says: reports only inside the thread's hidden folder / Reports stay in the report folders as today, remember which thread made them, and are deleted together with the thread / Reports inside the thread, but still listed and compared across Scratch threads
  **Recommendation:** The second: it keeps Scout's 'what is new' and the Research list working, and deleting the thread still removes its reports. If you picked your own Research or Scout folder, reports still go there and a delete leaves them; Plus would say so.
- **Today:** Delete moves a conversation's messages to the 30-day trash with Put back (cowork-shell, since 0.22.0); files in folders are never touched; no Delete permanently or Empty trash. Recon's '/recon end' deletes at once.
  **The plan:** Deleting a Scratch thread moves its messages and its files into the same 30-day trash; Put back returns both; Recon's End and wipe stays. Decision 7 is open: the owner earlier asked for Scratch to be gone at once.
  **Conflicts with:** plan decision 7 (open); built trash (extended: files are moved for the first time). Same question as the Trash part's question 5: ask once.
  **Question:** When you delete a Scratch thread, should it go to the trash for 30 days like every other conversation (messages and its files together, with Put back), or be gone at once like Recon's End and wipe? Earlier you asked for gone at once.
  **Options:** Through the 30-day trash, with Delete permanently and Empty trash for when you want it gone now / Gone at once, no trash
  **Recommendation:** Through the trash: a thread deleted by mistake months later can still be put back, and Delete permanently (plan step 1) is one more click.
- **Today:** Files dropped into the chat are stored by the app in <app home>/attachments/v1/files/<hash>/... (shared between conversations, never deleted automatically); the model gets a read-only path. Data's tools read only inside the conversation's folder and Data runs Read Only (data-1); the PDF reader refuses files outside its folders unless 'Allow any PDF' is on. So Data's tools cannot analyse a dropped file today; the assistant can only read its text.
  **The plan:** Data starts in Scratch 'because a quick analysis is often one file dropped in'; the plan only lists 'how Data picks up a file added in the chat' as a check.
  **Conflicts with:** data-1 (Read Only: the assistant cannot copy the file in itself)
  **Question:** So that a file you drop into a Scratch chat can be opened by Data and the PDF reader, may Plus copy it into that thread's hidden folder? The app also keeps its own copy in its attachment store, and deleting the thread cannot remove that copy.
  **Options:** Plus copies each dropped file into the thread's folder (the add-on writes, not the assistant, so Read Only stays) / Data and the PDF reader may also read the app's attachment store for files of this conversation / Nothing changes: to analyse a file, pick its folder
  **Recommendation:** Copy into the thread's folder, and add 'the app keeps its own copy of files you drop into a chat' to the plan's 'Limits to know'.
- **Today:** The folder picker on the start page is the app's own single seat (conversation.hero.workspace, kind 'single'); it lists projects and 'Add folder'. Plus only hides it on the Chat tab with CSS. A list slot conversation.hero.options sits in the same row.
  **The plan:** The folder picker gets 'Scratch' as its first entry.
  **Conflicts with:** built behaviour: the app's picker (Plus cannot add or order entries, only hide or replace the whole picker)
  **Question:** Plus cannot put 'Scratch' first inside the app's folder picker. If you choose one Scratch project, 'Scratch' appears in that list by itself, in the order the app picks. Otherwise Plus can add a small 'Scratch / Folder' switch right beside the picker. Is that fine instead of 'first entry'?
  **Options:** Accept where the app or the switch puts it / Replace the app's picker with Plus's own, with Scratch first
  **Recommendation:** Accept it: the app's picker keeps working as built, and an app update cannot break a copy of it.
- **Today:** Access levels (core-6, 0.57.0): a mode sets its level only when a conversation starts in it or moves into it. Chat, Research, Data and Recon run Read Only; Code Workspace Write; Cowork, Finance and Scout keep the permission preset's level (Workspace Write unless you chose Full access). Workspace Write lets the assistant write in the conversation's original folder plus /tmp and the temp folder; Full access anywhere.
  **The plan:** Scratch promises 'nothing lands in a folder of yours'. That holds under Read Only and Workspace Write, not under Full access.
  **Conflicts with:** core-6 (only if Scratch caps the level at start)
  **Question:** If a Scratch thread runs with Full access, the assistant can still write anywhere on your Mac. Should Scratch threads in Cowork, Finance, Scout and Code start at Workspace Write at most? Chat, Research and Data are Read Only anyway. You could still raise a thread by hand, and Plus would keep that choice as it does today.
  **Options:** Scratch threads start at Workspace Write at most / Leave access levels exactly as today and say in Scratch's help that Full access can write anywhere
  **Recommendation:** Start at Workspace Write at most: it is what makes the Scratch promise true, and a hand choice still wins as decided in core-6.
- **Today:** 'Continue in a project' (Chat tab only) opens a new conversation in a picked project with a mention; the app attaches a read-only copy of the chat's messages. No files are copied; the original chat stays.
  **The plan:** 'Keep in a project' continues a Scratch thread in a real folder and copies its files, 'like today's Continue in a project'.
  **Conflicts with:** none with built code, but copying writes into a folder of yours (Cowork's approved method: never overwrite without asking)
  **Question:** 'Keep in a project' would copy the files a Scratch thread made into one of your project folders. Today's 'Continue in a project' copies no files. Where should the copies go, and what happens to the Scratch thread afterwards?
  **Options:** Into a new sub-folder named after the thread inside the project, never over an existing file; the Scratch thread stays until you delete it / Straight into the project folder, asking before any file with the same name is replaced; the Scratch thread stays / As either above, but the Scratch thread goes to the trash once the copy worked
  **Recommendation:** The first: nothing of yours can be overwritten, and the Scratch thread stays so you can check the copy before deleting it.
- **Today:** The app's schedule tool gives a task created from a conversation that conversation's original folder (dsh-tool-schedule targetFor); each run starts a new conversation there and the app re-creates the folder if it is missing. Plus's Automation runs page and the Automations part of this plan do not know about Scratch.
  **The plan:** Scratch threads keep their files until deleted; the Automations tab later offers 'folder or Scratch' per automation (plan step 17).
  **Conflicts with:** none built; a gap between Scratch and the Automations part
  **Question:** If you ask the assistant in a Scratch thread to repeat something on a schedule (for example every morning), each run starts a new conversation in that thread's hidden place. When you delete the thread, what should happen to the repeating task?
  **Options:** Plus warns you on delete, lists the tasks, and pauses them until you decide / The task keeps running; each run becomes its own Scratch thread / Repeating tasks cannot be set up from a Scratch thread
  **Recommendation:** Warn and pause: nothing keeps running unseen, and nothing is lost. This can wait until the Automations tab steps (16 and 17).
- **Today:** After a delete, add-ons keep their own notes about the conversation: Data's query log (SQL text, file names) and saved analyses (up to 200 result rows), Scout's postings and selection; plus the app's copy of dropped files, Memory facts and Self-improve lessons, and Usage counts (numbers only).
  **The plan:** Deleting the thread removes its messages and files together; 'Usage counts stay, numbers only'.
  **Conflicts with:** built Data and Scout stores (unchanged today for any delete)
  **Question:** Some add-ons keep their own notes about a conversation: Data keeps the questions it ran on your data and up to 200 rows of results; Scout keeps the postings it found. Today these stay after you delete a conversation. For Scratch threads, should they go too when the thread is deleted for good?
  **Options:** Yes, for Scratch threads, when the thread is deleted for good (Delete permanently, Empty trash or after 30 days) / No, keep them as today and list them under 'Limits to know'
  **Recommendation:** Yes, for Scratch threads only: it is what 'deleting removes everything' means to you, and other conversations keep today's behaviour. Memory facts and lessons stay, since you saved them on purpose.

### Changes that need no decision

- Today: The app's working_directory tool (a core tool in every trimmed mode) lets the assistant move a conversation's working folder to any existing folder. Plus's diagram and image tools save into that working folder with plain file calls, so neither Read Only nor Workspace Write stops them. The app offers a 'working-directory/access' hook that can refuse a move. Plan: Files the assistant makes go into the thread's hidden folder.
- Today: Copies share the folder: the app's Fork and Plus's Rerun (with earlier turns) copy the original folder; Rerun of a first question starts a new conversation in the working folder. A conversation whose folder is gone fails every turn (dsh-working-directory ensure). Plan: Each Scratch thread has a folder of its own; delete removes it.
- Today: Modes prunes per-conversation fields (sessionModes, sessionWeb, sessionIsolated and others) for conversations whose files it cannot find, including ones in the trash; Shared settings shares some per-conversation fields between Macs unless listed in ALWAYS_SKIP. Plan: A Scratch thread carries a mark and sits in its own list.
- Today: Put back after a restart brings a conversation back without its tab and choices (Modes pruned them while it was in the trash); a conversation with no project then lands in Chat by guess. Found by the Trash part. Plan: Put back returns a Scratch thread with its files.
- Today: The app's own New command (Cmd-N) and its start-up open the current project, else the most recent one (navigation.ts startSession). Plus does not wrap it; Global Search already wraps the app's Cmd-K the same way Plus would need. Plan: Tabs start in Scratch.
- Today: Show in Finder (0.51.1) appears only for conversations that belong to a project. Plan: Files go into a hidden folder of the thread.
- Today: Sync mirrors every conversation except Recon ones (x-6); it carries messages only; the project list optionally. Plan: Scratch threads are never synced.
- Today: Recon: one room for all Recon conversations, emptied at every start, listed as the project 'Recon room'; tools off elsewhere; '/recon end'. Plan: For Recon, Scratch means that room; End and wipe stays.
- Today: Data's saved analyses are named across all folders: saving a name another folder uses is refused with that folder's path (data-5); a saved analysis reruns against its folder's files. Plan: Data starts in Scratch.

### Where the plan is out of date

- The plan says: Rule 2: part 11 of MODES-AND-SETTINGS.md holds 26 decisions that are not built yet.
  In fact: All 26 were built in 0.57.0 (section 13 of that document, HANDOFF 0.57.0 entry). For Scratch, core-6, data-1, scout-10 and x-6 matter.
- The plan says: A conversation cannot change its folder.
  In fact: Its working folder can change: the app's working_directory tool is a core tool. Its original folder cannot: that decides its project, where its messages are filed and where Workspace Write lets it write. Plus's diagram and image tools follow the working folder. (HANDOFF section 3 says the same as the plan.)
- The plan says: Whether the app accepts a hidden folder per thread without listing each one as a project has to be tried in the lab.
  In fact: The source answers most of it: the app makes the folder and lists the conversation under no project (session.create with cwd), and Plus already does this for Rerun and Engines. But the start page then disables the chat box ('Choose a workspace to start') until the conversation belongs to a project, and a project needs the conversation's folder to be exactly its own. The lab must confirm this; it decides the design.
- The plan says: 'Keep in a project' copies its files, like today's 'Continue in a project'.
  In fact: Today's 'Continue in a project' copies no files: it opens a new conversation in a project with a mention, and the app attaches a read-only copy of the messages. It exists only on the Chat tab.
- The plan says: Data starts in Scratch because a quick analysis is often one file dropped in.
  In fact: Data's tools cannot open a dropped file today: the app keeps it in its own attachment store, Data reads only inside the conversation's folder, and Data runs Read Only, so the assistant cannot copy it in. The assistant can only read its text.
- The plan says: Long run in Scratch: not offered, it needs a folder and git.
  In fact: A Scratch thread has a folder, and Mission keeps its own git store inside any folder. Not offering Long run there is a choice, not a limit.
- The plan says: Limits to know: usage counts stay; they hold numbers only.
  In fact: Also left after a delete: Data's query log (SQL text) and saved analyses (up to 200 result rows), Scout's postings and selection, the app's copy of every dropped file, Memory facts and Self-improve lessons saved there, and the copy of the messages in a project conversation made by Keep in a project.
- The plan says: Sync to a second Mac: yes, when Sync is on (for a conversation in a folder).
  In fact: Sync carries conversations' messages only, never folder files, and leaves Recon conversations out since 0.57.0.
- The plan says: The folder picker gets 'Scratch' as its first entry.
  In fact: The picker is the app's own single seat; Plus can hide or replace it, not add or order entries. A Scratch project would appear there in the app's order; otherwise a switch can sit beside it.
- The plan says: Saved reports (Research, Scout) are kept in the app's report folders.
  In fact: Research's are in <app home>/research/reports unless a folder is set. Scout's are in the Scout folder's 'reports', which is a folder of yours if you picked your own Scout folder.
- The plan says: For Recon, Scratch means that room (and Scratch threads never delete themselves).
  In fact: The room is one folder shared by all Recon conversations and emptied at every start, so 'files kept with the thread for months' does not apply there.
- The plan says: Built today: Chat always starts in the default workspace; other tabs start in the open or last used project.
  In fact: Correct, and it has a consequence the plan does not name: a conversation started in a project gets that project's instructions and type in every tab, so starting in Scratch drops them.

### What the app allows

| Needed | Available | Evidence |
|---|---|---|
| A conversation with its own folder that is not a project | yes | dsh-api-session-controller commands.ts create (workspaceId or cwd), agent.ts createAgent mkdir -p; no attach without a workspace; dsh-workspace bootstrap runs once. Plus already uses sessions.create({cwd}) (dsh-modes startRerun, dsh-engines compare). |
| Typing the first message of such a conversation in the app's chat box | no | dsh-client-ui-conversation ConversationContent.tsx: a blank conversation with no owning project gets an inert chat box ('Choose a workspace to start'). Works if the Scratch place is a registered project (as the Recon room is). |
| Sub-folders of one project as members of that project | no | dsh-workspace entity.ts attachSession and candidateMatches: the conversation's folder must equal the project folder. A per-thread sub-folder must be the working folder, not the original folder. |
| Naming the folder before the conversation exists | yes | types.ts SessionCreateRequest.sessionId: 'the identity of a new Session when none is stored under it'; agent.ts claim -> createAgent(sessionId, cwd). |
| Reusing an unsent Scratch thread instead of making a new one per click | yes | session.create reuses a named blank that is not archived, never started, same folder (agent.ts claim); in a project the app's navigation does this itself (createInWorkspace). |
| Starting a thread with a chip's text in the chat box | partly | uiWorkspace.startSession(workspaceId, {prompt}) works only with a project; for a folder-only conversation the app's conversation.input.requestDraftInitialization is internal to its navigation and not used by Plus yet (and the box is inert anyway). |
| 'Scratch' as an entry in the app's folder picker, or a control beside it | partly | conversation.hero.workspace is kind 'single' (slots.ts 292); WorkspacePicker lists projects + Add folder. conversation.hero.options is a list slot in the same row, rendered when a conversation exists (ConversationContent.tsx 133); Plus add-ons already use it. |
| Keeping a thread's working folder inside its own folder | yes | dsh-working-directory README: 'working-directory/access' waterfall, a rejection fails the access; dsh-modes CORE lists working_directory, so it can also be left out for Scratch threads. Not yet tried from a Plus add-on. |
| Writes limited to the thread's place | partly | dsh-sandbox-policy sessionWorkspaceRoot = original folder; dsh-sandbox roots.ts adds /tmp and the temp folder; Read Only writes nothing; Full access anywhere; Plus add-ons write with plain file calls outside the sandbox. |
| Telling a Scratch thread apart without a stored mark | yes | Session list rows carry cwd; the session store folder is projectKey(cwd) (dsh-session-persistence-jsonl format.ts 225-245, lossy: separators become '-'). |
| Moving a thread's files to the trash and back | partly | Plus moves files itself (cowork-shell lib/trash.js); the app has no delete; a turn fails while the folder is missing (dsh-working-directory ensure throws WORKING_DIRECTORY_UNAVAILABLE); copies share the folder (commands.ts fork copies cwd). |
| Leaving Scratch out of Sync | yes | dsh-sync lib/isolation.mjs exclude(rel) answer used by mirror.mjs; store layout <encoded folder>/<id>. |
| Reaching a file dropped into the chat | unknown | dsh-attachment-local: <app home>/attachments/v1/files/<hash>/<name>, never deleted, model sees a read-only path; whether Plus can read the reference from the message and copy the file needs lab trial 7. No call to delete the app's copy. |
| Cmd-N and start-up following the tab's start place | partly | dsh-client-ui-workspace navigation.ts startSession: current project, else recentWorkspace. Plus can wrap the command's resolve as dsh-search does for session.search (client.js 219-226). |
| Show in Finder for a hidden folder | yes | dsh-api-session-controller index.ts openWorkspacePath/verifyDesktopPath accepts any existing path on this Mac. |
| Listing folder-only conversations in the sidebar | yes | App tree 'Ungrouped' (tree.ts); Plus TabLibrary loose 'Other conversations' and the Chat flat list (client.js 1868-1892). |
| Setting an access level when a Scratch thread starts | yes | Modes already sets levels at start or move and stores sessionSandboxBase (0.57.0, core-6); a Scratch cap is new Plus code there. |
| What happens to scheduled tasks made inside a Scratch thread | yes | dsh-tool-schedule targetFor uses the conversation's original folder; dsh-schedule runtime joins a project at that folder if there is one; a new run re-creates a missing folder. |

### To try in the lab before building

- **A conversation made with sessions.create({cwd, sessionId}) in a throwaway DSH_HOME: before its first message, is the chat box disabled with 'Choose a workspace to start'? Then the same with one registered 'Scratch' project and a sub-folder set as the working folder before the first message.** Why: The source says the app's start page disables the chat box for a conversation with no project; this decides the whole Scratch design. How: Lab web profile, mock model, viewport 1280x860; create through page JavaScript; screenshot the start page; try typing and sending; restart and reopen; check the sidebar lists, what the picker and conversation.hero.options show.
- **Reuse an unsent Scratch thread; fill the chat box from a chip.** Why: Each New click must not leave an empty folder behind; chips must work in Scratch. How: Click New in Scratch twice, count folders; click a Cowork chip in Scratch and check the text arrives.
- **Keep the working folder inside the thread.** Why: Diagrams and images follow the working folder, which the assistant can move. How: MOCK_SCRIPT making the mock call working_directory cd to another lab folder, then diagram_draw; see where the file lands; repeat with a working-directory/access guard.
- **Delete and put back a Scratch thread with its files; restart; send a message. Remove the folder by hand and check the turn fails, then that re-creating an empty folder at open lets it answer.** Why: The app refuses every turn when the folder is gone; Put back after restart must keep the tab (after the Trash fix). How: Lab, mock model; check the trash folder, the sidebar tab of the restored thread, and the session log.
- **Rerun and Fork a Scratch thread; delete one; the other still answers.** Why: Copies share the folder. How: Rerun button and the app's fork; delete one; send to the other.
- **Sync to a throwaway local bare repository: Scratch threads stay out on push and on pull, also with a Scratch thread on the remote.** Why: 'Never synced' must hold both ways. How: dsh-sync with remote = absolute path to a bare repo under /tmp/audit lab; inspect the repo tree.
- **Drop a CSV and a PDF into a Scratch Data thread.** Why: Data's tools cannot open them today; need the path the model gets and whether Plus can find and copy the file. How: Lab with MOCK_DUMP to read the request; read the session events for the attachment reference.
- **The app's Cmd-N from a Scratch thread on the Chat tab.** Why: The app picks the current project, else the most recent one. How: Lab keyboard shortcut (desktop key path cannot be tested in the web lab; check the command's resolve instead).
- **A repeating task set up by the assistant in a Scratch thread; delete the thread; let the task fire.** Why: Runs use the thread's folder and may re-create it. How: Mock calling the schedule tool with a one-minute rule; delete; wait one run; inspect folders and the sidebar.

### Steps

**Step 32. Scratch place and helpers (no visible change)** (size M)

- What: After lab trial 1 and the owner's answer on the place: make the hidden Scratch place in the app's home (one 'Scratch' project kept out of Plus's project lists and out of 'last used', like the Recon room, or folder-only threads), a sub-folder per thread, a shared isScratch(path) helper that decides by place, creating or reusing a Scratch thread behind no button, and the working-folder guard so a thread's working folder stays in its own sub-folder.
- Add-ons: dsh-cowork-shell, dsh-modes
- Tests: Unit: isScratch (with /private, symlinks, store-name collisions), sub-folder naming, reuse of an unsent thread, guard refusals; homeFor never returns the Scratch place. Lab trials 1 and 3.
- What could break: Choosing a place name that collides with a project after the store's lossy encoding; a working-folder move by the assistant before the guard exists.
- Needs first: Owner's answer on the Scratch place; lab trial 1
- Cannot be verified before you try it: The Mac desktop app; the owner's real projects.

**Step 33. Never sync Scratch** (size S)

- What: Leave Scratch threads out of push and pull by place, beside the Recon exclusion.
- Add-ons: dsh-sync
- Tests: Unit for the exclusion; lab trial 6 with a throwaway bare repository.
- What could break: A thread already on the remote from an earlier test must be taken off the branch, as for Recon.
- Needs first: Step 1
- Cannot be verified before you try it: Sync to a real second Mac.

**Step 34. Delete and put back with the thread's files** (size M)

- What: Delete moves the thread's messages and its sub-folder into the trash together; Put back returns both; Delete permanently and Empty trash remove both; files shared with a copy (Rerun, Fork) move only with the last thread using them.
- Add-ons: dsh-cowork-shell
- Tests: lib/trash.js unit tests for the new item kind, shared folders, interrupted moves; lab trials 4 and 5.
- What could break: A thread put back while a copy re-created the folder; a turn fails if a thread is opened while its files are in the trash.
- Needs first: Owner's answer on decision 7 (asked once with the Trash part); plan step 1 (Delete permanently, Empty trash); the Trash part's fix 'Put back keeps the tab and choices'; step 1
- Cannot be verified before you try it: The owner's real trash.

**Step 35. Access level for Scratch threads** (size S)

- What: If the owner says yes: Scratch threads start at Workspace Write at most; a level picked by hand still wins (core-6). If no: only a help line.
- Add-ons: dsh-modes
- Tests: Unit in Modes' sandbox step: start in Scratch with a Full access preset gives Workspace Write; a hand choice survives restart and moves.
- What could break: Interplay with sessionSandboxBase when a Scratch thread moves between tabs.
- Needs first: Owner's answer on Full access; step 1
- Cannot be verified before you try it: The owner's own permission presets.

**Step 36. Start a Scratch thread by hand** (size M)

- What: A way to start in Scratch from any tab without changing any tab's default: the Scratch entry or a 'Scratch / Folder' switch beside the picker; chips and New work there; the Chat tab hides the picker in Scratch too.
- Add-ons: dsh-cowork-shell
- Tests: start-home tests extended; lab trial 2; screenshots of each tab's start page.
- What could break: Hiding or relabelling the app's chip for the Scratch project; the app's own sidebar (when the Cowork sidebar is off) shows Scratch as a project.
- Needs first: Steps 1 to 4; owner's answer on the picker
- Cannot be verified before you try it: Look on the Mac desktop app at its window widths.

**Step 37. Scratch mark and list** (size S)

- What: A Scratch mark in the chat box, a 'Scratch' group in each tab's list in place of 'Other conversations', and Show in Finder for the thread's own folder.
- Add-ons: dsh-cowork-shell
- Tests: Unit for grouping by place; lab screenshot of each tab's list.
- What could break: Rerun copies of project conversations already show under 'Other conversations' and must not be called Scratch.
- Needs first: Step 5
- Cannot be verified before you try it: Finder showing a folder inside the hidden app home on the owner's Mac.

**Step 38. Keep in a project** (size M)

- What: From any tab, continue a Scratch thread in a project the way the owner chose: copy its files without overwriting anything, then open the new conversation with the mention.
- Add-ons: dsh-cowork-shell
- Tests: Unit for the copy (name clashes, nothing overwritten, large folders); lab run with a mock.
- What could break: Writing into a folder of the owner's; the copied messages then sync with the project.
- Needs first: Owner's answer on where copies go; step 5
- Cannot be verified before you try it: Copying very large folders on the owner's disk.

**Step 39. Dropped files reach Data and the PDF reader** (size M)

- What: If the owner says yes: a file dropped into a Scratch thread is copied into its folder by the add-on; Data's wording names the thread, not the hidden path, and its saved-analysis note says reruns end with the thread.
- Add-ons: dsh-cowork-shell, dsh-data, dsh-pdf
- Tests: Unit for the copy and Data's wording; lab trial 7.
- What could break: The attachment reference may not be readable from Plus; the app's own copy stays.
- Needs first: Owner's answer on dropped files; lab trial 7; step 5
- Cannot be verified before you try it: Very large files; the app's attachment store on the owner's Mac.

**Step 40. Reports in Scratch** (size M)

- What: Research and Scout reports from Scratch threads handled as the owner chose (recommended: in the report folders, recording the thread, removed with it), keeping scout-10's 'what is new' and the Research list.
- Add-ons: dsh-research, dsh-scout
- Tests: Unit for recording the thread and removal with it; scout-10 comparison still finds earlier reports; lab run with a mock.
- What could break: Reports in a folder the owner picked himself cannot be removed with the thread; must be said.
- Needs first: Owner's answer on reports; step 3
- Cannot be verified before you try it: A real Research or Scout run.

**Step 41. Add-on notes removed with a Scratch thread** (size S)

- What: If the owner says yes: Data's query log and saved analyses and Scout's postings and selection for a Scratch thread are removed when it is deleted for good.
- Add-ons: dsh-data, dsh-scout, dsh-cowork-shell
- Tests: Unit per store; lab: delete permanently and check the files.
- What could break: Removing notes of a thread that was put back; only on delete for good.
- Needs first: Owner's answer on add-on notes; step 3

**Step 42. Repeating tasks set up from a Scratch thread** (size S)

- What: As the owner chose (recommended: warn on delete, list and pause the tasks).
- Add-ons: dsh-cowork-shell
- Tests: Lab trial 9.
- What could break: Overlaps the Automations part; decide there which part owns it.
- Needs first: Owner's answer on repeating tasks; step 3; may wait for the Automations tab steps 16 and 17
- Cannot be verified before you try it: Runs while the app is closed.

**Step 43. Clean-up button** (size S)

- What: A button you start yourself: move all Scratch threads older than a number of days you set to the trash, with one confirmation.
- Add-ons: dsh-cowork-shell
- Tests: Unit for the age rule (threads in use, copies, pinned); lab run.
- What could break: A thread still running or open must be skipped and named.
- Needs first: Step 3

**Step 44. Starting place per tab** (size M)

- What: As decided on 15 November, once the owner confirms: every tab but Code starts in Scratch, Recon keeps its room, each tab's start place on Settings -> Modes, Cmd-N follows it (with a switch). Changes homeFor, startNew, switchTab, chips and Chat's picker rule.
- Add-ons: dsh-cowork-shell, dsh-modes
- Tests: test/start-home.test.mjs rewritten for each tab and each setting; lab trial 8; lab per tab.
- What could break: Changes built behaviour for six tabs; new conversations stop getting a project's instructions unless one is picked.
- Needs first: Owner's answer on start places; plan step 3 (per-tab settings); steps 1 to 12
- Cannot be verified before you try it: The desktop Cmd-N key path (web lab only checks the command).


---

## Long run

### What already does part of this job

- **Mission's run engine: plan, one item at a time, proof by real commands, overall commands, review, report** (addons/dsh-mission/lib/run.js, addons/dsh-mission/runner.js, addons/dsh-mission/lib/prompts.js, addons/dsh-mission/lib/shell.js). A fixed state machine driven by the add-on, not by a model. An item is PASSED only when its own shell command exits 0. The add-on runs that command in macOS sandbox-exec, where it may write only in the folder and temp, for at most 10 minutes. Any kind of work can have such a command, not only code. An item with no command is marked NOT VERIFIED until the reviewer judges it REVIEWED. The marks are per checklist item; there is no mark per round or lap. The planner, workers and reviewer are fresh helper agents. Their instructions are built from run.json (goal, approach, checklist, each item's note, the reviewer's note), never from the chat.
- **Permission modes Restricted, Ask-Auto, Full Auto** (addons/dsh-mission/index.js, addons/dsh-mission/lib/guard.js, addons/dsh-mission/lib/state.js). Every tool call is decided in tools/pre-execute. Switching a mode on moves the conversation to the app's Workspace Write preset. After each command, in Restricted and Ask-Auto, changes to existing files you have not approved are put back. Helpers share the conversation's mode and approvals. The mode stays on after a run ends, until /mission off.
- **Checkpoints and going back by hand** (addons/dsh-mission/lib/checkpoints.js, addons/dsh-mission/index.js (turn/start listener, /mission back)). Checkpoints are kept in a git store of Mission's own, inside any folder (<folder>/.dsh-mission/checkpoints.git). They need Apple's git program, not a git repository. One is taken at run start, at the start of every turn while a mode is on (every round of a run is a turn, so every Mission step), before every command and on request. /mission back N puts the whole folder back, your own later edits included; the state before is kept as a checkpoint. putBack(point, files) restores single files. Mission's own .dsh-mission folder is never put back. Nothing decides by itself to keep or roll back.
- **Run limits** (addons/dsh-mission/lib/run.js (LIMITS, LIMIT_RANGE), addons/dsh-mission/client.js (Settings → Mission)). maxItems 12 (1–30), maxTries 3 (1–8), maxReviews 2 (0–5), maxSteps 60 (5–300, labelled 'Steps in all'), waitMinutes 3 (0–60). One step is the plan, one try of one item, the overall commands or one review. There is no time limit. Each helper is stopped after 30 minutes and each command after 10.
- **A few extra laps already** (addons/dsh-mission/lib/run.js (applyReview, applyChecks)). The reviewer may reopen items and add up to four new items per review, within the review limit (at most 5). A failing overall command becomes a new item to fix it (fix forward, never rolled back), up to maxTries fix items per command. In all, a run has at most twice maxItems items. Once everything is PASSED or REVIEWED and the checks pass, the run stops; it never goes looking for more work.
- **Unattended rounds through the app's goal system; stall brake; Stop pauses** (addons/dsh-mission/runner.js (start, step, round, hold), addons/dsh-mission/index.js; app /tmp/dsh-asar/rc2/dsh-goal, dsh-goal-round-driver/src/index.ts, dsh-agent-loop/src/agent.ts). Starting a run creates an app goal with a cap of 3000 rounds. The app's round driver waits until the conversation is idle and its helpers have settled, then queues one follow-up message (agent.followup → next turn), so every round is a new turn. The conductor model may only call mission_step. Five rounds in a row without a step pause the run. The app's Stop pauses the run and stops its helpers. A step runs detached from the tool call: a call waits 100 s under PTC and 70 minutes otherwise.
- **Runs that stop silently (app behaviour)** (app /tmp/dsh-asar/rc2/dsh-goal-round-driver/src/index.ts (agent/error and max-tokens → disarm), dsh-llm-retry (README), dsh-base/cordis.patch.yml). The round driver stops giving rounds, without any message, in three cases: the model request fails after the app's own retries (by default five more tries for timeouts, server and connection errors, waiting at most about 15 to 20 seconds in all), a reply hits its length limit, or the app restarts. The goal stays 'active' but disarmed; the strip reads 'Inactive Goal' with Resume. Mission does not watch the goal's activation, so nothing is written in the run and nobody is told. The app does this on purpose ('no abnormal auto-retry'). A provider can be set to retry without end ('always' mode), but that lives in your own model provider settings.
- **Run saved to disk, resumed by hand** (addons/dsh-mission/runner.js (save, active-runs.json, runs.jsonl), README 'How it keeps going' and 'Tested (0.37.0)'). run.json is written after every step, and <home>/mission/active-runs.json maps each conversation to its run. After a restart the app keeps the goal inactive until a person resumes it. /mission resume carries on, or the strip's 'Resume goal' button (that one was not tested). The lab test of 0.37.0 resumed an ended run with an item waiting for your yes; a restart in the middle of a running step was never tested. That step is done again from the start, and a worker's half-finished edits stay in the folder. Until you resume, by the code, a message you type in that conversation lets the assistant take one step: Mission ignores the 'inactive' state. Nothing resumes on its own.
- **Where Mission refuses (0.57.0, decision x-2)** (addons/dsh-mission/lib/gate.js, addons/dsh-mission/index.js). A run is refused in isolated (Recon) conversations and where the tier has Sub-agents off; a run already on there is paused. The permission modes still switch on such a tier. Mission is not refused in Data or Research. There, switching a mode on moves the conversation from Read Only to Workspace Write (by the code; data-1 and research-6 made those tabs Read Only). In Research a run then cannot step, because mission_step is not in Research's tool list.
- **Tools loaded as needed, and how the conductor finds mission_step** (addons/dsh-modes/index.js (trimModes default ['cowork','code','data'], wordsAddTools), addons/dsh-modes/lib/trim.js (family 'mission')). Cowork, Code and Data start with core tools only. The 'mission' family is added when a waiting user message mentions 'mission'. The goal's round message says 'Mission run …', so the step tool should arrive from the first round. Not tried in the lab since trimming was built.
- **The app's goal strip above the chat box during a run** (app /tmp/dsh-asar/rc2/dsh-client-ui-goal (README, src/client/locales.ts)). Shows the goal's state (Ongoing, Inactive, Paused or Blocked Goal) and its text, which is Mission's internal 'Mission run <id>: … call mission_step …', with Edit, Clear and Pause or Resume. It shows no checklist, time or round. Clear leaves the run on in Mission without any rounds; Edit changes what the assistant is told.
- **Mission service for other add-ons** (addons/dsh-mission/index.js line 196 (ctx.provide('mission')), used by addons/dsh-engines/index.js line 235). It offers only mode(agentId). There is no run state and no events, so no other add-on knows that a run started, needs you or ended (gap A1). The app's server events 'goal/changed' and 'goal/activation-changed' exist and could be watched.
- **Run report and run list (base for a 'morning report')** (addons/dsh-mission/runner.js (end, report), lib/run.js (report)). Each run writes report.md, log.jsonl and every helper's answer in <folder>/.dsh-mission/runs/<id>/. <home>/mission/runs.jsonl gets one line per finished run. The conductor is told to give the report in full. Nothing reads these files (gap A4).
- **Budget guard** (addons/dsh-budget/index.js, addons/dsh-budget/lib/meter.js). A task is one turn of the top-level conversation, its helpers counted in. Limits: 300 steps, 20,000,000 tokens, minutes 0 (off), the same call 8 times in a row, tokens per day 0 (off). At a limit the next step is refused, the turn ends 'blocked' and a card says so. The count starts again at every turn/start, so in a Mission run it starts again every round. A 'blocked' round does not stop the app's goal, so the run goes on. Budget guard offers no service, but its settings are readable through the settings service.
- **Alerts on this Mac and on the phone** (addons/dsh-automations/index.js, addons/dsh-automations/lib/alerts.js). A Mac notification through osascript, the phone through ntfy (a topic you set; none by default). Defaults: failed on, needs you on, finished off. Scheduled tasks always alert. Your own conversations alert only with alertOthers on (off by default), and only when the turn ran at least othersMinutes (2). At most 10 alerts a minute. With the defaults a /mission run sends no alert at all, not even when it needs you. With alertOthers on, a run would alert for every failed or blocked round, every finished round if 'finished' is also on, and at most one 'needs you' per round.
- **Notify (your own command at turn end or on an approval)** (addons/dsh-notify/index.js). Rules live in the configuration file only, and none are set by default. A turnEnd rule fires at every top-level turn end, so once per round of a run (gap A2).
- **Activity line's sounds** (addons/dsh-activity/client.js). A sound in the app and a line above the chat box while you are at the Mac. It does not reach you when you are away.
- **Keep-awake** (nowhere (addons/dsh-mac has Spotlight and Shortcuts only; app main /tmp/dsh-asar/full/lib/main.js uses powerMonitor only for update checks and shutdown)). Nothing keeps the Mac awake. The Automations README says: 'Nothing runs while the Mac sleeps, and this add-on does not change that.' A Mac that sleeps in the middle of a request breaks that request, which stops the run (see 'Runs that stop silently'). On waking, the app runs once each scheduled task it missed.
- **Deep research rounds, depth and source labels** (addons/dsh-deep-research/lib/rounds.js (DEPTHS), lib/sources.js, lib/budget.js, index.js). Quick, Standard and Thorough run 1, 2 or 3 rounds of 10, 25 or 45 minutes. The maxMinutes setting (60, at most 240) and the model's own request can only lower that; under PTC it is about 7 minutes. Each source and claim carries 'read', 'seen only in search results' or 'not read' (research-4, built in 0.57.0, which keeps findings from unread pages, labelled). The check does not compare a claim with its page. One run is one tool call in one turn, so Budget guard's 300 steps can stop it. Scout has no Depth or rounds of its own; it can call deep_research.
- **Progress strip above the chat box (a model for a run card)** (addons/dsh-research/client.js line 375 (slot conversation.input.dock), addons/dsh-deep-research/index.js (/dsh-deep-research/progress, service deepResearch)). Shows a research run's progress while it runs. Activity (dsh-activity/client.js 1119) and Learn (dsh-learn/client.js 389) use the same slot. Gap B1 in GAPS-AND-PLAN already plans a Mission run card there and a permission chip.
- **Recon citations** (addons/dsh-recon/lib/sources.js, lib/restore.js). Each source has an [S#] number, its source, its route (Tor, Usenet or direct from the Internet Archive), the retrieval time in UTC and the SHA-256 of its text. A source rebuilt after a restart may carry only the first 16 characters of its fingerprint. Recon writes nothing to disk and rebuilds its sources from the saved conversation (recon-8). Sources have no grade.
- **Data and Finance proof today** (addons/dsh-data/lib/method.js rule 2, lib/tools.js; addons/dsh-finance/lib/finance.js METHOD rule 1). Data tells the model to tie every number to a query id ([Q7]) and to do arithmetic in the query or program; it has run Read Only since 0.57.0. Finance tells the model that every figure must come from a source it fetched, with that source's date. This is an instruction, not checked, and nothing asks for scripts. With Tools off (finance-4) Finance may give figures from memory, marked as such. Neither add-on offers a service Mission could call.
- **Model reachable check (partial pre-flight)** (addons/dsh-route-health/index.js (service routeHealth)). Probes only routes that have a probeUrl set in the configuration file; none are set by default. With blockWhenDown it refuses a step on a route that is down.
- **Effort settings** (addons/dsh-model-tiers/index.js (desiredEffort, reconcileEffort, lines 2025–2077); app /tmp/dsh-asar/rc2/dsh-subagent/src/manager.ts). Model Tiers applies the effort of the tier or model version to every agent whose model belongs to a tier, helpers included: once at creation and again before every step. The app can start a helper with its own effort (agentOptions.reasoningEffort), but Mission does not use that, and Model Tiers would set it back. Mission's helpers use the conversation's model by default ('one model', your 0.40.0 choice).
- **Automations scheduler beside a run** (app dsh-schedule (see /tmp/audit/next/automations.md)). Scheduled tasks start on time, side by side with anything else, with no queue. After the app opens or the Mac wakes, each missed task runs once. A /mission run holds nothing back, so both share the one local model.
- **App's Ralph tool** (app /tmp/dsh-asar/rc2/dsh-tool-ralph, dsh-experimental-ralph-bundle). Runs fresh agents round after round, each with the previous report. It is off by default and hidden, Plus does not use it, and it overlaps the run-notes idea.

### Where the plan changes something built (needs your yes)

- **Today:** You start a run by typing /mission and a goal. It ends when its checklist is done and the overall commands pass, or at its limits (12 items, 3 tries, 2 reviews, 60 steps by default; Settings → Mission). It is refused in Recon and where the tier has Sub-agents off (x-2). A failing check becomes a new item to fix.
  **The plan:** Long run starts Mission from a card in the Depth panel and adds a clock, rounds, extra rounds and a keep-or-roll-back gate.
  **Conflicts with:** built Mission behaviour; x-2 must stay
  **Question:** Today you start a Mission run by typing /mission and your goal, and it stops as soon as its list is done and the checks pass. The plan adds a Long run, started from a card, with a clock, rounds and automatic undo. If every /mission run got these too, runs you start the way you do now would behave differently: they could keep going after the list is done, or undo work. Should a Long run be its own kind of run, so that /mission stays exactly as it is?
  **Options:** Separate: a Long run is a Mission run started from the card, with the extra settings; /mission stays as it is / Both: every /mission run gets the clock, rounds and undo too
  **Recommendation:** Separate. /mission works and you use it. Leaving it untouched means nothing you rely on can break, and both use the same engine, so a fix to one helps both.
- **Today:** Budget guard counts one turn of the conversation as a task, its helpers counted in: 300 model requests or 20 million tokens per turn. Minutes and tokens per day are off by default. Every round of a Mission run is a new turn, so by the code the count starts again every round. It can cut one round short (a busy worker's requests count toward that round's 300), but it cannot end the run. A whole run is limited only by tokens per day and minutes, both off. One Research call is one turn, so 300 steps can stop it.
  **The plan:** 'A Long run needs an allowance of its own' (gap A3), and a 'budget fits' pre-flight tick.
  **Conflicts with:** built Budget guard behaviour (per turn)
  **Question:** Budget guard stops a single piece of work that runs away. In a Mission run every round counts as a new piece of work, so the guard starts counting again each round. It stops a round that runs away, but nothing limits how much a whole 10-hour run uses. (The code says so; a lab test still has to confirm it.) What should limit a Long run's total use?
  **Options:** Rounds and time on the card only; Budget guard stays the safety net for each round; the run card shows the tokens used / Also an optional token allowance per Long run on the card, off unless you set it / Use Budget guard's tokens-per-day limit
  **Recommendation:** The first, with the second offered but off unless you set it. With a model on your own server, tokens cost no money and the per-round guard still catches a loop. An allowance only matters when a run uses a paid cloud model.
- **Today:** Three different 'steps' exist. Mission's 'Steps in all' (Settings → Mission, 60 by default, at most 300) counts the plan, each try of an item, the overall checks and each review. The app's goal rounds (3000) count one per Mission step plus waiting rounds. Budget guard's 'Steps' count model requests within one round (300).
  **The plan:** Decision 1: the card's limit counts rounds (one full lap of build, check, review and fix). Single requests stay a hidden safety limit in Budget guard.
  **Conflicts with:** built Mission limit 'Steps in all' (at most 300); open decision 1
  **Question:** Decision 1. The Long run card would limit rounds, where one round is a full lap: build, check, review, fix. Mission already has a limit called 'Steps in all' (60 by default, 300 at most) that counts each piece of work. 30 rounds of 12 items would pass 300, so the run would stop early. Budget guard's own step limit only holds one round, not the whole run. What should happen to 'Steps in all' in a Long run?
  **Options:** Rounds on the card; for a Long run, 'Steps in all' is worked out from rounds and items and may go past 300; /mission keeps its 60 / Rounds on the card, and 'Steps in all' stays as a second cap
  **Recommendation:** The first: you deal with one number (rounds) plus the clock, and /mission keeps its own limit unchanged.
- **Today:** Mission stops as soon as every item is PASSED or REVIEWED and the overall commands pass. Only the reviewer may add work: up to four items per review, at most 5 reviews.
  **The plan:** Decision 2: when the work is done early, stop once two rounds in a row find nothing to fix, or use the full time. Extra rounds hunt for weak spots and re-check.
  **Conflicts with:** none for /mission if Long run is separate; open decision 2
  **Question:** Decision 2. When the work is done and every check passes before the time is up, should a Long run stop once two rounds in a row find nothing left to fix, or keep going until the time is up?
  **Options:** Stop after two empty rounds, with a 'Use the full time' switch on the card / Always use the full time / Stop at once, as /mission does
  **Recommendation:** Stop after two empty rounds, with the switch. It saves time and power, and the switch covers runs where more work is always better.
- **Today:** Checkpoints are taken at the start of every round and before every command. Going back is by hand: /mission back N puts the whole folder back, your own later edits included, and the state before is kept as a checkpoint. When a check fails, Mission adds an item to fix it and carries on (fix forward).
  **The plan:** Safety gate: a round is kept only if every check still passes; otherwise it is rolled back.
  **Conflicts with:** built fix-forward behaviour of Mission
  **Question:** Today, when a check fails, Mission adds an item to fix it and carries on; nothing is undone unless you type /mission back. The plan says a Long run round that breaks a check that passed before is undone at once. Undoing puts the whole folder back, so anything you change in that folder by hand during the run would be undone too. It is kept as a checkpoint, so nothing is lost for good. Which rule do you want for Long runs?
  **Options:** Undo the round at once, but only after the checks have passed once; the undone work is kept as a checkpoint you can look at / One try to fix it, then undo / Never undo: fix forward as /mission does
  **Recommendation:** Undo at once, only for rounds after the checks first passed. In the first rounds failing checks are normal because the work is not done yet; undoing then would undo everything. Later, a round that breaks working code is better undone than patched.
- **Today:** While a run is on, the conversation's own model (the conductor) may call only mission_step. Every other tool, writing a file included, is refused, so a weak model cannot wander off. The planner, workers and reviewer are fresh helpers whose instructions the add-on builds from run.json, so nothing depends on the chat history today.
  **The plan:** A run notes file that the conductor rewrites every round and rereads at the start of the next.
  **Conflicts with:** built conductor rule (only mission_step)
  **Question:** The plan says the assistant in the chat rewrites a short notes file every round. Today, during a run, that assistant may only press the 'next step' tool. It may not write files, so it cannot start doing the work itself. The helpers already start fresh every time from what the add-on saved. May the notes be kept by the add-on instead? They would be written from each round's results and given to the planner, workers and reviewer, and the assistant would stay locked to its one job.
  **Options:** Notes kept by the add-on, shown on the run card; the lock stays / Let the assistant write the notes file, which loosens the lock
  **Recommendation:** The first. It gives the same memory between rounds and keeps the lock that stops a weak model from wandering.
- **Today:** Model Tiers sets the effort of every agent whose model belongs to a tier, helpers included, at creation and again before every step. Mission's helpers use the conversation's model by default and have no effort of their own. The app can start a helper with its own effort, but Model Tiers would set it back.
  **The plan:** Effort per role: planner and reviewer at high effort, workers lower.
  **Conflicts with:** built Model Tiers behaviour; Depth's decision 3
  **Question:** Today every helper thinks as hard as the tier of its model says, and that is set again before each step. The plan wants the planner and reviewer to think harder than the workers. That needs Model Tiers to leave a Long run helper's effort alone. The model stays the same, so nothing more is loaded into memory. Should a Long run set its helpers' effort by role?
  **Options:** Yes, for Long runs only: planner and reviewer High, workers Medium, shown on the card and changeable there / No: helpers keep the tier's effort, as today
  **Recommendation:** Yes, for Long runs only, after a lab test. It is the same model, so it costs no memory, and Model Tiers stays as it is everywhere else.
- **Today:** During a /mission run the app shows its own goal strip above the chat box: 'Ongoing Goal' with Mission's internal text, and Edit, Clear and Pause buttons. It shows no checklist, time or round. Clear leaves the run on but without rounds; Edit changes what the assistant is told. You see progress with /mission report. Research's progress strip, Activity and Learn already use the place above the chat box. The app's documents allow an add-on tab in the right-hand panel, but Plus has never tried one. Gap B1 plans a run card above the chat box.
  **The plan:** Decision 4: a run card above the chat box (checklist, round, time used, Pause, End, Finish this round) or in the right-hand panel.
  **Conflicts with:** the app's goal strip shown today; open decision 4
  **Question:** Decision 4, with one more point. The run card would sit above the chat box, where Research's progress strip is. The app already shows its own 'goal' strip there during a run, and its Edit and Clear buttons can confuse a run (Clear leaves it without rounds). Should the run card take that strip's place during Long runs?
  **Options:** Card above the chat box; the app's strip hidden during Long runs if the lab shows that is safe; Pause and End on the card / Card above the chat box, and the app's strip stays too / Card in the right-hand panel (the app allows it; Plus has never tried it)
  **Recommendation:** The first: one place shows the run and has the buttons that are safe to press. If hiding the strip turns out to be fragile, fall back to the second.
- **Today:** Automations can alert on this Mac and on your phone. For your own conversations it alerts only when 'alert others' is on, and 'finished' alerts are off; both are off by default. So with your current defaults a /mission run sends no alert at all, not even when it needs you. Notify runs your own command at every turn end, which is once per round, but it has no rules unless you wrote some. Neither knows that a run exists (gaps A1, A2).
  **The plan:** 'Tell me': when it ends, when it needs me, every round; quiet in between.
  **Conflicts with:** built Notify and Automations behaviour
  **Question:** When you leave a Long run alone, it should tell you when it ends, when it needs you, or when it stopped by itself, and stay quiet otherwise. Today nothing tells you about a run with your current settings. If you switch on alerts for your own conversations, or write a Notify rule, they fire on every round. Should Plus send run alerts, and should Notify and the 'own conversations' alerts skip the rounds of a run?
  **Options:** Yes: run alerts for Long runs and /mission runs (end, needs you, stopped by itself; every round only if ticked on the card); Notify and Automations skip a run's rounds and fire once at the end / Run alerts for Long runs only; /mission runs stay silent as today / Leave Notify and Automations as they are
  **Recommendation:** The first. /mission runs gain the same alerts you want for Long runs, and the per-round noise goes away for both.
- **Today:** The app stops giving a run new rounds, without telling anyone, in three cases: your model server fails for longer than the app's own retries (by default about 15 to 20 seconds), a reply hits its length limit, or the app restarts or the Mac sleeps in the middle of a request. The goal strip then reads 'Inactive Goal' with a Resume button. Mission does not notice: nothing is written in the run, and nothing tells you. The app does this on purpose; it never restarts work by itself.
  **The plan:** Not mentioned. The plan assumes a run can be left alone for hours.
  **Conflicts with:** the app's design (a stopped goal is never restarted without a person)
  **Question:** If your model server is busy or restarts for more than about half a minute during a Long run, the app quietly stops giving the run new rounds. The run then waits until you come back, and nothing tells you. Should a Long run notice this, and try again by itself?
  **Options:** Tell you at once and try again by itself, up to 3 times a few minutes apart, then stop and tell you / Only tell you; you resume it / Do nothing new
  **Recommendation:** The first. An overnight run should not lose eight hours to a one-minute hiccup of your own server. The tries are capped, and each one is written in the run's log.
- **Today:** Nothing keeps the Mac awake, neither the app nor Plus. A Mac that sleeps in the middle of a model request breaks the run. When the Mac wakes, the app runs once each scheduled task it missed.
  **The plan:** Keep the Mac awake during a Long run (new).
  **Conflicts with:** none built; side effect: automations also run on time while the Mac is kept awake
  **Question:** Today your Mac may go to sleep during a long run, and that stops the run. Plus can keep the Mac awake while a Long run is on, the way macOS's own 'caffeinate' does, and let it sleep again as soon as the run ends or the app quits. The screen can still turn off. Closing a laptop's lid still puts it to sleep. On battery it drains the battery. Should a Long run keep the Mac awake?
  **Options:** On for Long runs while the Mac is on power; a tick on the card to allow it on battery / On for Long runs, on battery too / Off unless you tick it on the card
  **Recommendation:** The first. A run left overnight needs it, and on power it costs nothing worth noticing.
- **Today:** After an app restart a run waits, because the app keeps its goal inactive until a person resumes it. /mission resume or the strip's Resume carries on. A restart in the middle of a step was never tested; that step is done again from the start, and a half-finished worker's edits stay in the folder.
  **The plan:** Resume after a restart (listed as new).
  **Conflicts with:** the app's design: a goal is never restarted without a person
  **Question:** After the app restarts, a run waits until you type /mission resume. The plan wants a Long run to carry on after a restart. The app is built on purpose never to restart work by itself. Should a Long run resume by itself, or wait for one click from you?
  **Options:** One click: when the app opens, a card says the long run was interrupted (round 5 of 12) and offers Resume and End, and an alert tells you / Automatic: it carries on by itself when the app opens, if it was running when the app closed
  **Recommendation:** One click. A restart often means something went wrong. One click lets you look first, and the alert means you do not lose the night.
- **Today:** Since 0.57.0 Data and Research run Read Only (your decisions data-1 and research-6). Switching a Mission mode on moves any conversation to Workspace Write, so typing /mission in a Data or Research conversation already lifts Read Only for that conversation (by the code; not tested). In Research a run then cannot move, because its step tool is not offered there. Mission is not refused in either tab.
  **The plan:** Data: a Mission loop in the data folder (Long run in Data).
  **Conflicts with:** data-1, research-6
  **Question:** You decided that Data and Research run Read Only, so the assistant cannot change your files there. A Mission run must be able to write, so it switches the conversation to Workspace Write. Today that already happens if you type /mission in a Data or Research tab, and you would lose the Read Only protection for that conversation. The plan adds Long runs in Data. Should Mission and Long runs be allowed there?
  **Options:** Not in Research; in Data only later, writing only into Data's own output folder; until then /mission refuses in both tabs and says why / Allow them in Data as in Cowork, lifting Read Only for that conversation only / Leave /mission as it is in those tabs and decide Data Long runs later
  **Recommendation:** The first. It keeps both of your decisions, and Data's output folder is already where its work goes.
- **Today:** Mission marks an item PASSED only when its command exits 0. Deep research labels each source read, seen only in search results, or not read. You decided (research-4) to keep findings from pages that no helper opened, labelled, rather than leave them out. The check does not compare a claim with its page.
  **The plan:** Proof for research and writing: 'every claim maps to a saved source', and a round counts as PASSED only when its proof passes.
  **Conflicts with:** research-4
  **Question:** In Research you chose to keep findings from pages that no helper actually opened, marked 'not read'. The plan's proof for a research round says every claim must map to a saved source, which would fail those findings. In a Long run, should a claim from a page that was not read make the round fail, or keep its label?
  **Options:** Keep its label, as you decided; spare rounds try to read the page / Fail the round
  **Recommendation:** Keep the label, as you decided, and use spare rounds to read the page. That way the run fixes the gap instead of hiding the finding.
- **Today:** Research labels how each source was reached (read, search only, not read). Recon gives each source a number, time, route and fingerprint. Nothing grades sources.
  **The plan:** Each source gets a grade beside its number: Primary, Confirmed or Single. Decision 6: should a claim resting only on Single sources fail the round or pass with a label?
  **Conflicts with:** none built (additive in Research); open decision 6
  **Question:** Each source in a Research report would get a grade beside its read label: Primary (the original document), Confirmed (reported by two or more independent sources) or Single (only one). A model decides the grade, so it is a judgement, not a check. Decision 6: in a Long run, should a claim backed only by one unconfirmed source fail the round, or pass with a label?
  **Options:** Pass with a label; such claims are listed at the top of the report; spare rounds look for a second source / Fail the round
  **Recommendation:** Pass with a label. Failing would throw away true findings that only one good source reports, and the list at the top shows you exactly which claims to treat with care.
- **Today:** Recon citations are exact records: number, retrieval time in UTC, route and SHA-256 fingerprint. Recon writes nothing to disk; after a restart it rebuilds its sources from the saved conversation only (recon-8). Recon is isolated, and Mission and Long runs are refused there (x-2).
  **The plan:** Recon citations get the grade too.
  **Conflicts with:** recon-8 (nothing stored outside the conversation); Recon's isolation
  **Question:** Recon's citations are exact records: number, time, route and fingerprint. A grade would add a model's judgement beside them. Since Recon stores nothing outside the conversation, the grade would have to be written into the conversation to survive a restart. Do you want grades in Recon?
  **Options:** Later, as a step of its own, written into the conversation and marked as the model's judgement / No grades in Recon
  **Recommendation:** Later, as a step of its own, and only if Research's grades prove useful first. Recon's exact records stay as they are.
- **Today:** Mission's reviewer is a neutral judge. It decides REVIEWED for the items no command proves, can send items back and cannot overrule a failing command. Mission's final report is put together by the add-on's code, not written by a model.
  **The plan:** Lens part: 'the Lens goes to the writer and the reviewer'.
  **Conflicts with:** built Mission reviewer; the keep-or-roll-back gate
  **Question:** A Lens changes how answers are written, for example Encouraging or Skeptic. In a Long run the reviewer decides whether work counts as done. If the Lens reached that reviewer, Encouraging could make it pass weaker work and Skeptic could reject good work. Should a Lens stay out of a Long run's checks?
  **Options:** Yes: no Lens for the reviewer or the gate; the Lens only shapes the assistant's short messages and summaries / Let the Lens reach the reviewer too
  **Recommendation:** Yes. Whether work passes should not depend on the tone you chose.
- **Today:** The app starts each automation on time, side by side with anything else, with no queue, and after the Mac wakes it runs once each task it missed. A /mission run does not hold automations back, so both share your one local model.
  **The plan:** Automations part: runs go through a queue, one at a time. Long runs are not mentioned in the queue.
  **Conflicts with:** the Automations part (queue); the app's scheduler
  **Question:** An overnight Long run keeps your model busy for hours. Your automations still start on time, and then both share one model, which slows both and can make the run's steps time out. When a Long run is on, what should happen to an automation that falls due?
  **Options:** It waits until the current round of the Long run ends, runs, and then the run goes on / It waits until the Long run ends / It runs alongside, as today
  **Recommendation:** The first. Daily tasks are late by at most one round instead of a whole night, and the run never has to share the model. It needs the Automations queue to know about runs.
- **Today:** Settings → Mission holds the mode that /mission on uses (Restricted by default), the run limits and the models per role and per project. Settings → Modes (0.57.0, core-16) has sections for the Web level, the mode for scheduled tasks, the tabs and the working methods. The add-on tabs (Finance, Data, Research, Scout, Recon) have no mode card there.
  **The plan:** Each mode card gets Long run defaults: time, rounds, file changes, alerts and saved presets.
  **Conflicts with:** core-16 layout; Settings → Mission
  **Question:** The plan puts Long run defaults on each tab's card on Settings → Modes. Mission's own settings (its file-change mode, limits and models) stay on Settings → Mission, so you would have two places to look. Where should Long run defaults live?
  **Options:** Settings → Mission gets a 'Long run' section with one set of defaults; a tab may change only time and rounds / One full set per tab on Settings → Modes, as the plan says
  **Recommendation:** The first: one place to look. Gap A8 already notes that run settings are spread over three screens.
- **Today:** Mission runs in any conversation that has a folder and whose tier allows helpers, except Recon.
  **The plan:** Decision 5: Long run comes first to Code and Cowork.
  **Conflicts with:** none; open decision 5
  **Question:** Decision 5. Should Long run come first to the Code and Cowork tabs, and to the other tabs later?
  **Options:** Yes, Code and Cowork first / All tabs with a folder at once
  **Recommendation:** Yes. Mission already works there, commands prove the work, and Data and Research need their Read Only answer first.
- **Today:** Every run writes report.md (the result, every item with its mark, the commands, what waits for you, the checkpoint to go back to), and runs.jsonl lists finished runs.
  **The plan:** Build step 12: 'Presets and the morning report'. The morning report is not described anywhere.
  **Question:** The plan names a 'morning report' without saying what it is. Each run already writes a report when it ends. What should the morning report be?
  **Options:** The run's own report, opened for you when you come back, with a short summary at the top / One summary of everything that ran overnight, Long runs and automations together
  **Recommendation:** The first now: it already exists and needs only a summary and a way to open it. The second fits the Automations tab later.

### Changes that need no decision

- Today: When a /mission run ends, its permission mode (for example Restricted) stays on in that conversation, together with Workspace Write, until you type /mission off. Plan: The card's 'File changes' picks Restricted, Ask-Auto or Full Auto. The plan says nothing about what happens after the run.
- Today: /mission refuses a run in Recon and where the tier has Sub-agents off (x-2); a run on such a tier is paused. Mission's checkpoints need Apple's git program, not a git repository. Plan: Pre-flight ticks: folder, git for checkpoints, model reachable, budget fits. There is no tick for helpers.

### Where the plan is out of date

- The plan says: Part 11 of MODES-AND-SETTINGS.md holds 26 decisions that are not built yet.
  In fact: All 26 were built in 0.57.0 (section 13 and the HANDOFF entry for 0.57.0). Relevant here: x-2 (Mission refused in Recon and where the tier has no helpers), data-1 and research-6 (Data and Research run Read Only), research-4 (read, search-only and not-read labels; unread findings kept, labelled), recon-8 (Recon rebuilds from the conversation and writes nothing to disk), finance-4 (figures from memory allowed with a warning when Tools are off).
- The plan says: Keep the Mac awake and resume after a restart. Both are new.
  In fact: Keep-awake is new. Resuming by hand exists: /mission resume, and the app's goal strip offers 'Resume goal'. Only automatic resume, or a resume card, would be new. A restart in the middle of a step was never tested; the 0.37.0 test resumed an ended run.
- The plan says: Budget guard stops a task at 300 steps or 20 million tokens; a Long run needs an allowance of its own (A3). Single requests stay a hidden safety limit in Budget guard.
  In fact: By the code, a task is one turn, and every round of a Mission run is a new turn, so the allowance starts again each round. The guard can cut one round short but cannot end a run, and as a 'hidden safety limit' it holds only a round. It can stop one long Research call (one turn). A lab check is still needed.
- The plan says: The conductor rewrites a short notes file each round and rereads it, so nothing depends on the chat history surviving.
  In fact: While a run is on, the conductor may only call mission_step; writing a file is refused on purpose. The helpers already start fresh from run.json, so the chat history is not relied on today. Notes would have to be kept by the add-on.
- The plan says: A safety gate: each round starts with a checkpoint.
  In fact: That exists: a checkpoint at the start of every round (turn) and before every command. Only the keep-or-roll-back decision is new.
- The plan says: Today only code has proof, so other work can only be REVIEWED; a round counts as PASSED only when its proof passes.
  In fact: Mission marks each checklist item, not a round, and PASSED means any shell command exited 0. That works for data or writing too (a script, a check), not only code. A round or lap has no mark today.
- The plan says: Run card: whether an add-on can use the right-hand panel is not verified.
  In fact: The app's documents describe a public way for any plugin to add a right-panel tab type (ctx.sidebarRightTabs.register and the slot sidebar.right.pane.tab). Plus has never tried it.
- The plan says: Research, Scout: what Depth already does there, rounds and helpers; more rounds until time is up, capped at 60 minutes today.
  In fact: Research's Depth caps a run at 1, 2 or 3 rounds and 10, 25 or 45 minutes. The 60-minute setting can only lower that, and under PTC it is about 7 minutes. Scout has no Depth or rounds of its own; it can call Deep research.
- The plan says: Research: partly, Research's citation check is weak (research-4).
  In fact: research-4 is decided and built: three labels per source and claim, unread findings kept with a label. The plan's proof 'every claim maps to a saved source' goes against that decision.
- The plan says: Long run is not offered in Scratch because it needs a folder and git; the pre-flight checks 'git for checkpoints'.
  In fact: Mission keeps its own git store inside any folder and needs only Apple's git program, not a git repository. Leaving Long run out of Scratch is a choice, not a limit.
- The plan says: Pre-flight ticks: folder, git, model reachable, budget fits.
  In fact: Incomplete. x-2 refuses a run where the tier has Sub-agents off, and in isolated conversations, so a helpers tick is needed. 'Model reachable' can use Route health only where you set a probe address; none is set by default.
- The plan says: Alerts when it ends or needs you, and quiet in between (gaps A1 and A2).
  In fact: With the default settings no alert fires for your own conversations ('alert others' off, 'finished' off), so a /mission run is silent today, even when it needs you. A2 applies only to Notify rules you wrote (none by default) or after 'alert others' is switched on.
- The plan says: Effort per role: planner and reviewer at high effort, workers lower.
  In fact: Model Tiers sets the tier's effort again before every step of every agent whose model belongs to a tier, helpers included. The app can give a helper its own effort, but Model Tiers would set it back unless it is changed.
- The plan says: Finance: every computed figure comes from a logged script; to check against Finance's current method.
  In fact: Finance's rule 1 says figures come from fetched sources, with their date. It is an instruction, not a check, and nothing asks for scripts. finance-4 (built) allows figures from memory, marked as such, when Tools are off, so a Finance proof needs Tools on.
- The plan says: Recon already records each source's number, retrieval time and SHA-256; the grade is added beside them.
  In fact: Recon also records the route. A source rebuilt after a restart may carry only the first 16 characters of its fingerprint. Recon writes nothing to disk (recon-8), so a grade would have to live in the conversation.
- The plan says: Data: Long run is a Mission loop in the data folder.
  In fact: Data has run Read Only since 0.57.0 (data-1). Switching a Mission mode on moves the conversation to Workspace Write, which would lift that protection; it already does today for /mission in Data or Research.
- The plan says: Build order: run card, alerts, Budget guard fit, keep-awake and resume (step 11) come after time, rounds and the gate (step 9).
  In fact: Alerts, noticing a run that stopped by itself, and resume do not depend on step 9, and they are what makes any run safe to leave alone, so they can come first. The plan also never defines the 'morning report' of step 12.

### What the app allows

| Needed | Available | Evidence |
|---|---|---|
| Rounds that go on without a person, each a new turn | yes | dsh-goal-round-driver/src/index.ts: at idle, after helpers settle (subagents.waitForTreeWork), it queues agent.followup(message), and dsh-agent-loop/src/agent.ts appends turn/start for each turn |
| Notice that a run stopped by itself (server failure, length limit, restart) | partly | The driver disarms on agent/error and a max-tokens turn end. goals.get gives the goal's activation, and the server event goal/activation-changed exists (dsh-goal/src/index.ts). Mission watches neither. |
| Retry model-server failures | partly | dsh-llm-retry is mounted in dsh-base; by default 5 retries with waits from 0.5 to 10 s. 'always' mode is a setting of each model provider in your own configuration, which Plus may not preset. |
| Restart a stopped goal from an add-on | yes | goals.resume works on an active goal that is not armed (dsh-goal/src/index.ts resume); Mission already calls it on /mission resume. The app itself never does this without a person, by design. |
| A run card above the chat box | yes | slot conversation.input.dock, used by dsh-research/client.js:375, dsh-activity/client.js:1119 and dsh-learn/client.js:389 |
| A run card in the right-hand panel | yes | dsh-client-ui-sidebar-right README 'Extension seats': ctx.sidebarRightTabs.register and the slot sidebar.right.pane.tab are for any package. Never tried by Plus. |
| Hide or replace the app's goal strip during a run | unknown | dsh-client-ui-goal has no option to hide it; only CSS on its data-slot wrapper could, which needs a lab trial |
| Run state and events for other add-ons | no | The mission service offers only mode(agentId) (dsh-mission/index.js:196); must be built |
| Alerts on this Mac and the phone | yes | dsh-automations/lib/alerts.js (osascript, ntfy). The app's own Electron Notification is used only for update reminders (main.js 17672). |
| Keep the Mac awake | partly | Nothing in the app (no powerSaveBlocker in main.js) or Plus. The add-on's server process could start macOS's /usr/bin/caffeinate tied to its own process id; needs a lab trial. |
| Effort per helper role | partly | dsh-subagent/src/manager.ts accepts agentOptions.reasoningEffort for a helper, but dsh-model-tiers reconcileEffort sets the tier's effort again before every step |
| Undo one lap of work | yes | dsh-mission/lib/checkpoints.js back() and putBack(); turn-start and per-command checkpoints already exist |
| A clock for a run | partly | Neither the app's goal ('Round cap, not resource budget', round driver README) nor Mission has one; Mission already keeps startedAt, so only the stopping rule is new |
| Tokens used per run | partly | assistant/message events carry usage (Budget guard and Automations count them per turn); nothing adds them up per run |
| Model reachable before start | partly | dsh-route-health probes only routes with a probeUrl you configure; none by default |
| Budget guard as a service for a run allowance | no | dsh-budget has no ctx.provide; its settings are volatile and readable through the settings service, and GET /dsh-budget/data |
| The step tool where tools load as needed | unknown | trimModes default ['cowork','code','data'] (dsh-modes/index.js:162); the 'mission' family is added when a waiting user message mentions 'mission' (lib/trim.js:37, wordsAddTools). Not tried in the lab since trimming came. |
| Source grade per source | no | dsh-deep-research/lib/sources.js labels only how a source was reached; dsh-recon/lib/sources.js has no grade |

### To try in the lab before building

- **Budget guard against a Mission run and a Thorough research run** Why: The plan's step 0 asks for it; the code says the count starts again every round, but a busy worker may cut a round short, and a long research call may hit 300 How: In spike-lab with the mock server: set the step limit to 5, start /mission with a scripted planner and a worker that makes 6 requests; check the run log for a failed try and that the run goes on. Then a Thorough deep_research with the limit at 20.
- **Model server down in the middle of a run** Why: The app stops giving rounds after its retries, with no message; the plan's runs are meant to be left alone How: Start a run on the mock, stop the mock for 60 seconds by its PID, start it again; check whether the goal reads 'Inactive Goal', whether Mission noticed, and what /mission resume and the strip's Resume do. Repeat with a reply that ends on the length limit (mock finish reason 'length').
- **A restart in the middle of a running step** Why: Only an ended run was resumed after a restart in 0.37.0 How: Start a run with a slow scripted worker, quit the lab server by PID during the worker, start again; check the goal state, what typing a plain message does, /mission resume, the strip's Resume, and what stays in the folder.
- **The step tool in tabs that load tools as needed** Why: Cowork, Code and Data load tools as needed by default; the conductor may only call mission_step How: With MOCK_DUMP, start /mission in a Cowork and a Code conversation; read the first round's request and check that mission_step is in its tool list.
- **Mission in a Data and a Research conversation** Why: data-1 and research-6 make them Read Only; Mission switches to Workspace Write How: Open a Data and a Research conversation, type /mission restricted; read the access level before, after, after /mission off, and after moving the conversation to Cowork. In Research, start a goal and see whether it can step.
- **Effort per role against Model Tiers** Why: Model Tiers sets effort again before every step How: Start a helper with agentOptions.reasoningEffort different from the tier's; with MOCK_DUMP read the effort in each of its requests.
- **Keep-awake from the add-on** Why: Nothing in the app does it; the add-on runs in the app's server process How: From a throwaway add-on build, start /usr/bin/caffeinate -i -w <server pid>; check pmset -g assertions, then end the run and quit the lab server and check that the assertion is gone.
- **Alerts per round with Notify and Automations** Why: Gap A2, and to measure the noise before quieting it How: Lab profile: a Notify turnEnd rule that writes a line to a file, and Automations with 'alert others' and 'finished' on; run a 6-step mission; count the lines and alerts.
- **The app's goal strip during a run** Why: Decision 4 and whether it can be hidden safely How: Start a run; press Edit, Clear and Pause in turn on fresh runs and record what Mission does; try hiding it with CSS on its data-slot and check that nothing else in the dock moves.
- **Roll-back in a folder that is a git repository itself** Why: Only tested with a stand-in; the gate would roll back often How: Throwaway git repo with a commit; start a mode, change files, /mission back N; check that the project's own .git, branch and status are untouched.
- **The repeat check under PTC across rounds** Why: The conductor sends the same program every round How: PTC lab conversation, a run of 10 steps with maxRepeats at 3; check that no round is stopped as a loop.
- **An automation falling due during a run** Why: There is no queue; both share one model How: Schedule a one-minute task during a mock run; record whether both run at once and whether the run's step times out.
- **A right-panel tab from Plus (only if decision 4 picks it)** Why: The app documents it; Plus has never tried it How: Throwaway client plugin registering ctx.sidebarRightTabs and a body slot; open it during a run.

### Steps

**Step 45. Run events and noticing a run that stopped by itself** (size M)

- What: Mission's service gains run events: started, step done, needs you, paused, stalled, finished, and 'stopped by itself' (the app's goal turned inactive while the run is on, watched through goal/activation-changed). Nothing is shown and no behaviour changes.
- Add-ons: dsh-mission
- Tests: Unit tests with the stand-in goal service: each event fires once; a goal made inactive (error, restart) gives 'stopped by itself'; a pause by you does not.
- What could break: The event must not fire inside the app's session event handler (the 'cannot reenter' rule); same pattern as afterEvent.
- Needs first: Nothing
- Cannot be verified before you try it: A real model server failing in the Mac app.

**Step 46. Run status route** (size S)

- What: A fenced GET route returns a conversation's run: checklist with marks, step under way, time used, tokens used (added up from usage events), and whether the goal is ongoing, paused or inactive.
- Add-ons: dsh-mission
- Tests: Unit test of the view; route answers 403 without the app's connection check.
- What could break: None; read-only.
- Needs first: Step 1
- Cannot be verified before you try it: Token counts from a real model.

**Step 47. Pre-flight checks** (size S)

- What: One function, reachable through the route, that says for a conversation: folder present, git program present, not isolated, tier allows helpers (x-2), model reachable (Route health where set, otherwise 'not checked'), step tool offered, Budget guard limits, alert channel set.
- Add-ons: dsh-mission
- Tests: Unit tests for each tick with stand-in services, including x-2 and isolated.
- What could break: None; it changes nothing.
- Needs first: Nothing
- Cannot be verified before you try it: Route health against a real server.

**Step 48. Long run as its own kind of run, started from a route** (size M)

- What: The same engine with its own settings (time, laps, file mode, alerts), started through a fenced POST route so that it can be tested before the card exists. /mission and its words stay exactly as they are.
- Add-ons: dsh-mission
- Tests: Unit tests: a Long run and a /mission run side by side keep their own settings; /mission tests unchanged.
- What could break: Two kinds of run must never share state; same run.json shape with a kind field.
- Needs first: Owner's answer: Long run separate from /mission
- Cannot be verified before you try it: The Mac app.

**Step 49. Clock and 'Finish this round'** (size M)

- What: A Long run stops at its time and writes its report. 'Finish this round' lets the current lap end, then reports. The time used goes into the report.
- Add-ons: dsh-mission
- Tests: Unit tests with a fake clock: stops at time, the step under way finishes first, the report says why it stopped.
- What could break: A step can take up to 70 minutes; the clock decides only between steps, so a run can overrun by one step. Say so on the card.
- Needs first: Step 4
- Cannot be verified before you try it: A real 10-hour run.

**Step 50. Laps as the limit (decision 1)** (size M)

- What: A lap is work on the open items, the overall checks and a review. The Long run counts and limits laps; its 'Steps in all' is worked out from laps and items.
- Add-ons: dsh-mission
- Tests: Unit tests: lap counting, the limit, /mission's 60-step limit unchanged.
- What could break: The word 'round' already means a goal round in the app; the card should say 'lap' or define 'round'.
- Needs first: Step 4; owner's answer to decision 1

**Step 51. Early stop or full time, and extra laps (decision 2)** (size M)

- What: After the checklist is done, extra laps ask the reviewer for weak spots and add them as items. The run stops after two laps in a row find nothing, unless 'Use the full time' is on.
- Add-ons: dsh-mission
- Tests: Unit tests: two empty laps stop; the switch keeps going until the clock; item cap respected.
- What could break: A weak reviewer may invent work; the item cap and the gate limit the damage.
- Needs first: Step 6; owner's answer to decision 2
- Cannot be verified before you try it: Whether a real reviewer finds useful weak spots.

**Step 52. Keep-or-roll-back gate** (size L)

- What: Once the overall checks have passed once, a checkpoint marks each lap's start; a lap that makes a passing check fail is undone, and its work is kept as a checkpoint that the report names.
- Add-ons: dsh-mission
- Tests: Unit tests on a throwaway git folder: a lap that breaks a check is undone, a good lap kept, your own edit during the lap shown in the report; the folder's own .git untouched.
- What could break: Undo returns the whole folder, your own edits during that lap included (kept as a checkpoint). A flaky check would undo good work: the gate runs a failing check twice before undoing.
- Needs first: Step 6; owner's answer on the gate
- Cannot be verified before you try it: Large repositories' speed; real projects with many ignored files.

**Step 53. Run notes kept by the add-on** (size M)

- What: After each lap the add-on writes a short notes block into the run (what passed, what failed and why, what to avoid), and gives it to the planner, workers and reviewer. The conductor stays locked to mission_step.
- Add-ons: dsh-mission
- Tests: Unit tests: notes built from lap results, length capped, present in each helper's instructions.
- What could break: Notes that grow too long crowd a small model; keep them short and replace them each lap.
- Needs first: Step 6; owner's OK that the add-on, not the assistant, writes them
- Cannot be verified before you try it: Whether notes improve a real model's work.

**Step 54. Run alerts** (size M)

- What: Automations alerts on Mission's events: run ended, needs you, stopped by itself, and every lap only if ticked. It has its own switch on Settings → Alerts and uses the existing Mac and phone channels.
- Add-ons: dsh-automations, dsh-mission
- Tests: Unit tests with stand-in events: one alert per event, the per-minute cap, nothing when the switch is off.
- What could break: Alerts must never carry the goal's text to the phone service beyond a short name.
- Needs first: Step 1; owner's answer on alerts (whether /mission runs alert too)
- Cannot be verified before you try it: Real phone delivery (needs your ntfy topic).

**Step 55. Quiet rounds** (size S)

- What: Notify and Automations' 'own conversations' alerts skip the turns that are rounds of a running run, and fire once when it ends (gap A2).
- Add-ons: dsh-notify, dsh-automations
- Tests: Unit tests: rounds of a run skipped, a normal turn still fires, the end of a run fires once.
- What could break: Changes built behaviour; only after the owner's yes.
- Needs first: Step 1; owner's yes (it changes how Notify behaves)
- Cannot be verified before you try it: Your own Notify rules.

**Step 56. Watchdog and resume after a restart** (size M)

- What: When the goal turns inactive during a run, the run notes why and alerts you. If you chose it, it tries again by itself a few times, minutes apart. On opening the app, a card offers Resume and End for an interrupted run.
- Add-ons: dsh-mission
- Tests: Unit tests with the stand-in goal service: retries capped and logged, no retry after your own pause, the resume card's data after a restart.
- What could break: Goes against the app's design of never restarting work by itself; only as chosen, capped, and never after your own Pause or Stop.
- Needs first: Steps 1 and 10; owner's answers on silent stops and on resume
- Cannot be verified before you try it: A real server outage and a real Mac restart.

**Step 57. Keep-awake** (size S)

- What: While a Long run is on (on power, or on battery if ticked), the add-on starts macOS's caffeinate tied to the app's server process and stops it when the run ends, pauses or the app quits.
- Add-ons: dsh-mission
- Tests: Unit test with a stand-in process starter: started once, stopped on end, pause and unload; never two at once.
- What could break: A leftover caffeinate keeps the Mac awake; tie it to the server's process id so it ends with the app. While the Mac is awake, scheduled automations also run on time.
- Needs first: Step 4; owner's answer on keep-awake; the lab trial
- Cannot be verified before you try it: Lid-closed behaviour on a laptop.

**Step 58. Budget fit** (size M)

- What: The run card shows tokens used. If you chose it, an optional token allowance per Long run is kept by Budget guard through a small new service, off unless set.
- Add-ons: dsh-budget, dsh-mission
- Tests: Unit tests: the allowance stops the run with a report, not one round; per-round limits unchanged.
- What could break: Budget guard's per-round rule must stay exactly as built.
- Needs first: Step 2; owner's answer on budget; the lab trial
- Cannot be verified before you try it: Real token counts.

**Step 59. Effort per role** (size M)

- What: A Long run starts its planner and reviewer at High and its workers at Medium (changeable), and Model Tiers leaves the effort of a helper that Mission set alone.
- Add-ons: dsh-mission, dsh-model-tiers
- Tests: Unit tests in both add-ons: Mission passes effort per role; Model Tiers keeps it for those helpers only; all other agents unchanged.
- What could break: Changes Model Tiers; only for helpers that Mission marks.
- Needs first: Step 4; owner's answer on effort; the lab trial; Depth's decision 3 for consistency
- Cannot be verified before you try it: Models that offer no thinking levels get nothing on the wire.

**Step 60. Run card above the chat box** (size M)

- What: The card shows the checklist, lap, time used, tokens and the goal's state, with Pause, End and Finish this round. If chosen and safe, the app's goal strip is hidden during Long runs.
- Add-ons: dsh-mission
- Tests: Client unit test of the view; lab: card appears, buttons work, the dock's other strips still show.
- What could break: Hiding the app's strip by CSS can break with an app update; fall back to showing both.
- Needs first: Steps 2 and 5; owner's answer to decision 4 and on the goal strip
- Cannot be verified before you try it: The Mac desktop app's window sizes.

**Step 61. The Long run card** (size L)

- What: The last stop of the Depth panel opens the setup card: goal from the message, Start long run, pre-flight ticks, time and lap sliders, presets, proof chips (commands found in the project), file changes, Tell me, keep-awake. First in Code and Cowork; shown as unavailable with the reason where x-2 refuses, and not offered in Chat, Recon or Scratch.
- Add-ons: dsh-mission, dsh-modes
- Tests: Client and server unit tests: the card starts the route of step 4; refused on a tier without helpers; not shown in Chat, Recon or Scratch.
- What could break: The chat-box row is already crowded; check the width in every tab.
- Needs first: Steps 3 to 16; the Depth button from the Depth part; owner's answer to decision 5
- Cannot be verified before you try it: Room in narrow windows (the Finance pill lesson of 0.57.0) until tried in the Mac app.

**Step 62. Long run defaults and saved presets** (size S)

- What: Defaults for time, laps, file changes and alerts, and your saved presets, kept where you chose (Settings → Mission or per tab).
- Add-ons: dsh-mission
- Tests: Unit tests: defaults applied to a new card; a saved preset fills the card.
- What could break: None if kept in one place.
- Needs first: Step 17; owner's answer on where defaults live

**Step 63. Morning report** (size S)

- What: When you come back, the finished run's report opens with a short summary at the top (or the summary you chose).
- Add-ons: dsh-mission
- Tests: Unit test of the summary from a finished run.
- What could break: None.
- Needs first: Step 17; owner's answer on what the morning report is

**Step 64. Source grade in Research reports** (size M)

- What: Each source gets Primary, Confirmed or Single beside its read label, decided by the analyst model and marked as its judgement. Single-source claims follow decision 6 and are listed at the top.
- Add-ons: dsh-deep-research, dsh-research
- Tests: Unit tests: grade rules for 'Confirmed' (two independent addresses), the list at the top; research-4 labels unchanged.
- What could break: A grade looks like a fact; label it as a judgement.
- Needs first: Owner's answers on research-4 and decision 6
- Cannot be verified before you try it: Grade quality with a real model.

**Step 65. Research long runs** (size L)

- What: A Research Long run sends more research rounds until its time is up, each building on the last report. Scout uses it through Deep research.
- Add-ons: dsh-deep-research, dsh-research, dsh-budget
- Tests: Unit tests: rounds until time, each saved; Budget guard does not stop it, or stops it with a report, as you chose.
- What could break: One research call is one turn, so Budget guard's 300 steps apply; must be settled first.
- Needs first: Steps 14 and 20; owner's answers on budget
- Cannot be verified before you try it: Real web search over hours.

**Step 66. Data proof and Data long runs** (size M)

- What: Key numbers recomputed a second way and row counts checked around joins, as proof commands. A Data Long run writes only into Data's output folder, as you chose.
- Add-ons: dsh-data, dsh-mission
- Tests: Unit tests: proof scripts pass and fail; files outside the output folder untouched.
- What could break: Must keep data-1's protection.
- Needs first: Step 17; owner's answer on Data and Read Only
- Cannot be verified before you try it: Real spreadsheets.

**Step 67. Finance proof (later)** (size M)

- What: In a Finance Long run, computed figures come from a logged script; refused with Tools off (finance-4).
- Add-ons: dsh-finance, dsh-mission
- Tests: Unit tests: a figure without a script is flagged; Tools off refuses a Long run.
- What could break: Finance's method today is an instruction; a check needs care not to block sourced figures.
- Needs first: Owner's decision on Finance Long runs
- Cannot be verified before you try it: Real market data.

**Step 68. Recon grade (later)** (size M)

- What: If wanted, a grade written into the Recon conversation beside each citation, marked as the model's judgement, rebuilt from the conversation after a restart.
- Add-ons: dsh-recon
- Tests: Recon's script suites plus the rebuild test with grades; nothing written to disk.
- What could break: Must keep recon-8 (nothing on disk) and Recon's isolation.
- Needs first: Step 20; owner's answer on Recon grades
- Cannot be verified before you try it: Real Tor sources.


---

## Skill architect

### What already does part of this job

- **Self-improve: a reviewer model, your approval, every version kept with Put back** (addons/dsh-evolve/index.js (notesFor 234-263, the evolve:notes section 266-291, ask() 341, the addLesson action 635-646, the read-only evolve service 654-668: active, notes, status), lib/policy.js (LIMITS: 60 lessons of 600 characters, 6 sections of 2,000; EDIT_OPS), lib/engine.js (approve 230-258, decline), lib/store.js (policies/vNNNN.json never overwritten; activate is Put back), client.js 550 and 664, README.md). It improves only its own policy (a playbook of lessons plus a few sections), only from test tasks, and only after four automatic gates on Check and Guard tasks. Real conversations get the lessons as the evolve:notes section (order 72), by family: all, general, the example-set ids and the conversation's mode id (fixed in 0.57.0, x-1). Helpers get their conversation's mode lessons. Recon gets none. The switch 'Use approved instructions in real conversations' turns this off. There is one store for the plain model, whose lessons reach every conversation on any model, and one per Model Tiers version. A version set to 'Use only these' drops the plain model's lessons. 'Your own lesson' (addLesson) skips the gates, but it goes into the version picked on the page, not the conversation's, and it is refused while a run is going. Approving a change, or adding any new version, marks every other waiting change 'Out of date'. The page and README promise that the reviewer 'never sees your conversations' and that 'Conversations ... are never sent' (also docs/ADD-ONS.md 541). The reviewer is meant to be 'a stronger model', often a cloud one. The README calls reviewer-written tools, skills and plugins 'not built, on purpose'. Reading real conversations and helpful/harmful counters are 'also not built'. HANDOFF 0.12 lists reading real conversations as a possible next step, with a 'never send' mark per conversation.
- **Memory: lasting facts and preferences about you** (addons/dsh-memory/index.js, lib/store.js (ENTRY_MAX 300, TOTAL_MAX 4000, SUGGESTIONS_MAX 20, STALE_MS 120 days, GROUPS about/style/projects/other, suggest() keeps sessionId), README.md). Entries are written into a marked section of $DSH_HOME/AGENTS.md, which the app adds to every conversation in every tab. Recon is the exception: Modes drops it there through ISOLATED_DROPS 'agent-instructions'. The remember tool only suggests. Suggestions wait for your yes (at most 20; older ones drop), and each keeps the id of the conversation it came from. A switch, 'Let the assistant suggest entries', can turn suggestions off. Memory is full at 4,000 characters and refuses more. Entries older than 120 days are marked for checking. There are no versions and no service for other add-ons, only the /dsh-memory/data route.
- **Project instructions, their versions and model-written instructions** (addons/dsh-cowork-shell/lib/projects.js (INSTRUCTIONS_MAX 12000; clean()/save() keep only tab, instructions, preset), lib/generate.js (VERSIONS_MAX 10, by: you/type/model; whereOf), index.js (the cowork-shell:project section, order 58, 473-508; whereIs 437-446; askModel 451-462; projects route 594-639), client.js 1550-1640). A project's rules reach every conversation whose folder is the project's folder. Helpers and Recon never get them. Every saved change is kept as a version, but only the last 10, with Put back. The versions list shows on every project page. 'Generate with a model' is offered only for Cowork projects that have a type. It shows what would be sent first. It sends without asking only to a model on this Mac or on your own network; an internet or unknown model needs a tick. There is no service for other add-ons, only the HTTP route. Any new field on a project would be dropped by save() unless projects.js is changed.
- **Project types (reusable sets of instructions), including 'Save as my preset'** (addons/dsh-cowork-shell/lib/presets.js, presets/, client.js ('type.keepas')). A way of doing one kind of work, kept as a Cowork project type. It overlaps with what a learned skill would be.
- **Skills page (a read-only list of every skill)** (addons/dsh-cowork-shell/index.js (SKILLS_PATH /dsh-cowork-shell/skills, 375-416), client.js). Lists the skills of the default folder through the default preset's scope, the way the app's '/' menu does for a new conversation. It shows names, descriptions, paths and the two invocation flags. There is no editing, no on/off switch and no marking of learned skills.
- **Tier skills** (addons/dsh-model-tiers/index.js (SKILL_LIMIT 6, SKILL_TEXT_LIMIT 8000, loadTierSkills 1431-1472, tierPrompt 1189-1197, the model-tiers section, order 70, 1539-1572)). A tier can name up to 6 skills. Their full text, up to 8,000 characters each, is pasted into the model-tiers section, Chat included: in bare mode, text that is already loaded is kept. Recon gets none. The text is read through the default preset's scope lease, not through the conversation, so a per-conversation skill filter cannot see these reads. Since 0.57.0 (core-7), a mode's tier, and so its skills, applies from a conversation's first message.
- **Model version instructions and role prompts: two more homes for instructions** (addons/dsh-model-tiers/index.js (versions: instructions, replace), addons/dsh-role-prompts/README.md). A model version can carry its own instructions, which can 'stand alone'. Role prompts are your own instruction sections, per tier, set in the configuration file only. The plan's list of homes names neither.
- **Skills that ship with Plus (registered while the app runs)** (addons/dsh-pdf, dsh-diagram, dsh-code-map (4), dsh-code-power (4: pr-review, ci-fix-loop, best-of-n, hunk-review), dsh-finance/skills.js (7, while Finance is on), dsh-learn (1): each calls ctx.get('skills').register({... source:'custom'})). These are global skills at the app's runtime rank 250. The model can load them in every conversation that has the skill tool, and you can start them from the '/' menu in any tab. Learned-skill switches must leave them alone. The Office skills belong to the app (dsh-skill-office, bundled rank 600), not to Plus.
- **The app's skill system** (/tmp/dsh-asar/rc2/dsh-skill/src/index.ts (registerProvider 390-428, register 439-460, list/snapshot/get 470-517, invalidate and skills/change 621-660, ranks 25-28), dsh-skill-filesystem/src/index.ts (roots 256-268: project .dsh/skills 100, project .agents/skills 200, custom 300, $DSH_HOME/skills 400, ~/.agents/skills 500, bundled 600; frontmatter 1015-1019), dsh-tool-skill/src/index.ts, dsh-api-session-controller/src/skill-catalog.ts, dsh-client-ui-skill). There is one merged catalog per folder and viewing scope (the agent). The scope chain starts with the agent itself, so the cache is per conversation. The model sees the list, and can load a skill, only where the skill tool is visible. Separately, you can type /name in any conversation: the app pastes in any skill that may be started by hand, with or without the skill tool. The '/' menu lists those skills for every conversation, through the live agent or, for a closed one, its preset. The only built-in switches are per skill (disable-model-invocation, user-invocable). There is no switch per conversation or per project. An add-on can register a provider and call invalidate(). The catalog then sends a replacement list at the next step, but text already loaded stays in the conversation. A provider receives the same options object, which includes the asking agent as scope, although the documented contract covers only cwd and signal.
- **Tools panel and the pattern for per-conversation settings** (addons/dsh-modes/client.js (ToolsButton 1020-1088, shown for every conversation at 888; startRerun CARRIED list 515), index.js (volatile per-conversation fields: sessionTools, sessionToolSets, sessionHelpers, sessionSandboxBase and others), lib/trim.js ('skill' is a CORE tool), lib/isolation.js (ISOLATED_DROPS: agent-instructions, skill-catalog, runtime-context); addons/dsh-shared-settings/index.mjs (ALWAYS_SKIP)). Per-conversation switches live in the Tools panel of the Modes add-on. A new per-conversation field must be carried by Rerun and kept on each Mac (x-5). Another add-on can add only its own button to the chat box (slot conversation.input.left), not a row inside Modes' panel.
- **The rule for leaving Recon conversations out** (addons/dsh-sync/lib/isolation.mjs (readIsolation; fails closed; follows helpers through parentSession), addons/dsh-search/lib/hidden.js (isolatedCheck)). Built for x-6 in 0.57.0. A conversation is isolated if it has the sessionIsolated mark, or if it is open and modes.isolated says so. 'isolated-late' conversations have no tools and are not hidden. Sync's rule is the strict one: it stops completely when Modes cannot answer, and it also leaves out the helpers of isolated conversations. Global Search treats nothing as isolated when Modes is off. The architect should use Sync's rule.
- **Signals already in stored conversations and on disk** (addons/dsh-modes/lib/stop.js (stoppedByUser); app dsh-command-feedback (feedback/record: category and text); app dsh-message-feedback/src/types.ts (feedback/message-put: thumbs up or down per answer, with optional note and category); app dsh-session/src/index.ts 1483-1500 (fork: isSeeded and inheritedEventCount, no link to the original); addons/dsh-mission/runner.js and lib/run.js (<folder>/.dsh-mission/runs/<id>/run.json, items[].tries and status 'stuck'; $DSH_HOME/mission/runs.jsonl)). Stop, /feedback remarks and the thumbs under each answer can all be read from stored events. Calls to the skill tool and /name uses ('skill-invocation') are logged too, which is enough to count how often each skill is used. Mission's tries are on disk and nothing reads them (gap A4, still open). A Rerun of a later question is a copy marked as one, with the length of the copied part, but it does not say which conversation it came from. A Rerun of the first question starts a brand-new conversation with no mark at all.
- **Reading stored conversations without opening them** (app dsh-session-query/src/index.ts (readSession, listEvents, filterSessions, readTitle, traceSession by parentSession); addons/dsh-search/index.js 103 (uses ctx.get('sessionQuery'))). The app's search index reads stored conversations, which is what Global Search already does. Helpers can be found through parentSession.
- **Trash** (addons/dsh-cowork-shell/lib/trash.js). A deleted conversation's files, its helpers' included, move out of the app's session store for 30 days, so a reader of the store no longer sees them. The exception is conversations listed in pending.json, which were in use when deleted.
- **Direct model calls, and telling local from internet models** (addons/dsh-evolve/index.js ask(); addons/dsh-cowork-shell/index.js askModel() and whereIs(); lib/generate.js whereOf()). A model can be asked for text without tools through ctx.get('llm').stream. A provider's address says whether it runs on this Mac, on your own network or on the internet. Unknown counts as internet.
- **The app's scheduler** (app dsh-schedule/src/types.ts (every task carries a prompt), dsh-commands/README.md (commands run from interactive chat boxes only)). A scheduled task sends text into a conversation. It cannot run a '/' command, so a scheduled '/skills learn' would only reach the model as plain text.
- **Other places that keep facts about you** (addons/dsh-finance (adviser profile, finance_profile_save), addons/dsh-scout (scout_profile, profile.md and profile.md.bak), docs/GAPS-AND-PLAN.md A6). Besides Memory and project instructions, the Finance adviser and Scout each keep a profile of you. Gap A6 ('three places remember things about you') is an open question for you.

### Where the plan changes something built (needs your yes)

- **Today:** Self-improve improves its own lessons only from test tasks. Its page says the reviewer 'never sees your conversations' and 'Conversations ... are never sent' (client.js 550 and 664, README 'What leaves this Mac', docs/ADD-ONS.md 541). Its reviewer is meant to be 'a stronger model', often a cloud one. The README calls reviewer-written skills 'not built, on purpose'. Still true after 0.57.0: x-1 only made mode lessons apply.
  **The plan:** The plan's 'touches what is built' row for Self-improve, Memory and project instructions: the Skill architect is 'built into Self-improve', reads real conversations, writes skills, and may send conversation text to a cloud model if you tick that.
  **Conflicts with:** Built behaviour: Self-improve's privacy promise and its chosen scope (README 'Not built, on purpose')
  **Question:** Today Self-improve learns only from test tasks, and its page promises that your conversations are never sent anywhere. Its reviewer is usually a strong internet model. The plan puts the skill learner inside Self-improve and has it read your past conversations. Should the learner live inside Self-improve, which means rewording that promise, or be an add-on of its own that files what it learns into Self-improve, Memory and your projects?
  **Options:** An add-on of its own, with its own page and its own reading model (private by default). Self-improve stays as it is and only receives lessons. / Inside Self-improve, with a separate 'reading model' setting and reworded privacy text on its page.
  **Recommendation:** An add-on of its own. Self-improve's promise stays true, and you can switch learning off without losing Self-improve. The Recon and Scratch rules then sit in one place. It can still reuse Self-improve's approval and version code. Learned skills stay plain text, with no scripts, so nothing a model writes is ever run.
- **Today:** The instructions generator sends a project's folder without asking only to a model on this Mac or on your own network. An internet or unknown model needs a tick, after you see what would be sent (cowork-shell index.js 612-614, lib/generate.js whereOf). Decision new-1, built in 0.57.0, also treats 'this Mac or your own network' as private.
  **The plan:** 'Old conversations are read by a model on this Mac unless you tick otherwise'.
  **Conflicts with:** new-1 and the generator's rule for local and internet models
  **Question:** Your own model server may run on another computer in your home. Should a model on your own network count as 'on this Mac' for reading your old conversations, with no tick needed?
  **Options:** This Mac or your own network: no tick. Internet or unknown: a tick, and you see what would be sent first. / This Mac only: everything else needs the tick.
  **Recommendation:** The first, the same rule as the image tools (new-1) and the instructions generator, so one rule holds everywhere.
- **Today:** Nothing. HANDOFF 0.12 listed 'mining real conversations for failing cases (with a per-conversation "never send" tag)' as a possible next step for Self-improve.
  **The plan:** Only Recon conversations are never read. Scratch conversations are read like any other.
  **Conflicts with:** none built (an earlier proposal)
  **Question:** Apart from Recon, every conversation you keep could be read. Do you want a way to mark one conversation 'never learn from this'?
  **Options:** Yes: a switch in the Skills entry of the Tools panel, 'Don't learn from this conversation'. / No: only Recon is left out.
  **Recommendation:** Yes. It costs little, and it protects private conversations that are not in Recon.
- **Today:** A tier can name up to 6 skills, and their full text is pasted into the model-tiers section, Chat included. The text is read through the default preset, not the conversation, so Model Tiers cannot see a per-conversation switch. Since 0.57.0 (core-7), a mode's tier applies from the first message.
  **The plan:** The plan's 'touches what is built' row 'A tier can carry its own skills': learned skills get off switches per conversation, project and Long run.
  **Conflicts with:** Built behaviour of dsh-model-tiers (loadTierSkills, tierPrompt); core-7
  **Question:** A tier can carry skills whose text is always added to the instructions. Suppose a tier names a skill the learner wrote, and you switched learned skills off for a conversation or a project. Which one wins?
  **Options:** The off switch wins: Model Tiers leaves that learned skill's text out. / The tier wins: a skill you put on a tier always comes with it. / Learned skills cannot be put on a tier at all.
  **Recommendation:** The off switch wins. 'Start clean' should mean clean. Your own skills and Plus's skills on tiers are not affected.
- **Today:** Self-improve keeps one set of lessons per saved model version (your decision at 0.13). The plain model's lessons reach every conversation, whatever its model (notesFor; README 'One set of lessons per model version'). 'Your own lesson' goes into the version picked on the Self-improve page, not into the conversation's version.
  **The plan:** 'A habit of one model → a Self-improve lesson for that model'.
  **Conflicts with:** Built behaviour: Self-improve's per-version stores (owner decision 0.13)
  **Question:** Self-improve keeps lessons per saved model version. A model used without a saved version has no lessons of its own: its lessons reach every conversation, whatever the model. Where should a lesson about one model's habit go?
  **Options:** On the model version the conversation used. When there is none, you are asked to save one first. / On the version if there is one, otherwise as a lesson for every model. / Only on model versions; habits seen on plain models are not proposed.
  **Recommendation:** The first. A habit of one model should never change how other models are instructed.
- **Today:** Self-improve's promise is that a change 'only reaches you if it measurably helps and breaks nothing' (four gates on Check and Guard tasks). Only 'Your own lesson' skips the gates. Any new version marks the tested changes still waiting as 'Out of date', and you would have to run a new cycle to test them again. The playbook holds at most 60 lessons.
  **The plan:** Lessons for a model are sent to Self-improve after your yes, without tests.
  **Conflicts with:** Built behaviour: Self-improve's gates (lib/gates.js) and approve() in lib/engine.js
  **Question:** Changes in Self-improve are normally tested before you see them. Lessons found in your conversations have no test. Adding one also makes any tested change still waiting for you out of date. Should they go in untested, or become test tasks first?
  **Options:** They go in after your yes, marked 'from your conversations, not tested', like 'Your own lesson', with a button to turn one into a test task. You are told first if tested changes are waiting. / They become test tasks first and go in only when a cycle passes them.
  **Recommendation:** The first. It is quick and clearly marked, and the button gives you the stricter way when you want it.
- **Today:** The model can find and load skills on its own only where it has the skill tool. In the shipped settings that is Cowork, Code, Data and Finance; Research's 8 tools and Scout's 20 do not include it, and Chat has none. Those short lists were chosen when the tabs were built (0.53.0, 0.50.0). In every tab you can still start a skill yourself from the '/' menu or by typing /name. Recon drops the skill list. HANDOFF 0.54.1 says your own Chat mode was set to all tools (not checked).
  **The plan:** Each skill has a reach (all tabs, one tab, one project) and starts as the tab it was learned in.
  **Conflicts with:** Built behaviour: the tool lists of Chat, Research and Scout
  **Question:** The assistant can pick up a skill by itself only in Cowork, Code, Data and Finance. In Chat, Research and Scout only you can start one, by typing / and its name. What should happen to something learned in one of those three tabs?
  **Options:** File it as a Self-improve lesson for that tab. Those lessons do reach Chat, Research and Scout (and Research's helpers). / Keep it as a skill that you start yourself with / in that tab. / Add the skill tool to Research and Scout. This lengthens their short tool lists; Chat would still have none.
  **Recommendation:** The first. It works today and leaves the deliberately short tool lists alone.
- **Today:** The existing skills are your own files in skill folders, project skills (.dsh/skills, .agents/skills, often in git), the skills Plus registers in code, and the app's own skills. None of them has versions.
  **The plan:** 'A way of doing a task → a skill: added to an existing one where it fits'. A skill is corrected or retired when a later lesson shows it is wrong.
  **Conflicts with:** Built behaviour: skill content owned by you, by projects and by add-ons
  **Question:** Sometimes a lesson fits a skill the learner did not write: one of your own skill files, a project's skill that may be in git, or a skill that comes with Plus or the app. May the learner change that skill?
  **Options:** No. It proposes a separate learned skill that adds to it, and never edits files it did not create. / Yes, for your own skill files only, after your yes and with a backup copy; never Plus's or the app's skills.
  **Recommendation:** No. Your files and project files stay exactly as you left them, and nothing changes in a git folder behind your back. A learned skill can say 'use together with X'.
- **Today:** Nothing yet. The plan is inconsistent: its rules say 'Start clean when you create a project', but its decisions say 'New projects start with learned skills on. One click in the chat box, on the Skills entry of the Tools panel, starts clean'.
  **The plan:** A project switch, a pick list on the project page, and 'Start clean'.
  **Conflicts with:** none (the plan disagrees with itself)
  **Question:** Where should 'Start clean' (no learned skills) be: when you create a project, in the chat box, or both?
  **Options:** In the chat box, as you decided, plus a switch on the project page. No extra step when you create a project. / Also a question when you create a project.
  **Recommendation:** The first. It matches your decision of 15 November and adds no step to making a project.
- **Today:** Project instructions keep only their last 10 versions (VERSIONS_MAX 10), with Put back.
  **The plan:** Project rules learned from conversations are written into the project's instructions, and 'every version is kept, with Put back'.
  **Conflicts with:** Built behaviour: dsh-cowork-shell lib/generate.js VERSIONS_MAX
  **Question:** A project keeps only its last 10 versions of instructions. Changes made by the learner would push your older versions out sooner. Keep 10, or keep all?
  **Options:** Keep 10 there. The learner keeps its own full record of every change it made, with Put back. / Keep every version of project instructions.
  **Recommendation:** The first. Nothing changes for your projects, and nothing the learner did is lost.
- **Today:** Besides Memory, the Finance adviser and Scout each keep a profile of you. Gap A6 ('three places remember things about you') is still an open question for you.
  **The plan:** 'A fact or preference about you → Memory'.
  **Conflicts with:** GAPS-AND-PLAN A6 (open)
  **Question:** Facts about you could also go into the Finance adviser's profile or Scout's profile. Should the learner touch those, or only Memory?
  **Options:** Only Memory for now; the two profiles stay as they are until you answer A6. / Also propose changes to the Finance and Scout profiles.
  **Recommendation:** Only Memory for now. Those profiles carry private details, and A6 is a decision of its own.
- **Today:** Today nothing quotes your conversations anywhere else. You decided that Scratch conversations are read like any other, and that a skill learned from one stays after it is deleted.
  **The plan:** Each proposal shows the turns it came from.
  **Conflicts with:** The Scratch decision ('deleting the thread removes its messages and files together')
  **Question:** A proposal quotes the turns it came from. When you delete that conversation, should those quotes go with it?
  **Options:** Yes. A quote stays only until you decide on the proposal; accepted skills keep no quotes. / No. Quotes stay with the proposal's history.
  **Recommendation:** Yes. Deleting a conversation, Scratch included, then really removes its words.
- **Today:** The app's scheduler only sends text into a conversation and cannot run a '/' command. The plan's Automations tab is meant to be 'the one place to see ... every automation', and nothing runs while the app is closed.
  **The plan:** 'On demand by default, with a setting to run nightly, weekly or monthly. A scheduled run only proposes.'
  **Conflicts with:** Another part of the plan (Automations tab); app scheduler behaviour
  **Question:** The learner can run on a timer of its own, which works only while the app is open, or as an automation on the new Automations tab. Where should its nightly or weekly run live?
  **Options:** Its own setting on its page, which also shows as a card on the Automations tab once that tab exists. / Only as an automation on the Automations tab, so it waits for that tab.
  **Recommendation:** The first. It does not have to wait for the Automations tab, and you still see it in one place later.

### Changes that need no decision

- Today: Global Search and Sync leave Recon out (x-6). Sync's rule stops completely when Modes cannot answer and also leaves out helpers. Search treats nothing as isolated when Modes is off. Plan: 'Recon threads are never read.'
- Today: Self-improve's 'with tools' test runs are helpers whose stored conversations hold Check and Guard tasks, which the reviewer must never see. Plan: Read 'the conversations you still have'.
- Today: The app picks up any SKILL.md in ~/.dsh/skills, ~/.agents/skills or a project's .dsh/skills or .agents/skills. No switch can hide those per conversation or project. Plan: Learned skills with off switches and reach.
- Today: Per-conversation choices live in Modes' settings. Rerun carries them (CARRIED), and Shared settings keeps them on each Mac (ALWAYS_SKIP, x-5). Plan: A Skills entry in the Tools panel: All, This tab's, None.
- Today: Cowork's working method was approved by you word for word (core-14, COWORK_METHOD), and Code has its own method. Plan: Lessons for a tab.
- Today: Gap A4 proposes a 'Lessons from runs' action inside Self-improve. The plan's Automations tab has 'Improve', where a model rewrites an automation's instruction from its failed runs. The Lens part notes that your Lens picks must not become Memory entries. Lens tests and learned lessons would share Self-improve's 60 places. Plan: Mission logs and research runs as sources (step 15).
- Today: A Rerun of a later question is a copy marked as one (isSeeded and the length of the copied part). A Rerun of the first question is an unmarked new conversation. Neither records which conversation it came from. Plan: A Rerun is a signal.

### Where the plan is out of date

- The plan says: The 26 decisions in docs/MODES-AND-SETTINGS.md part 11 'are not built yet'.
  In fact: All 26 were built in 0.57.0. Section 13 of that document and the 0.57.0 entry in docs/HANDOFF.md list what each one does now.
- The plan says: The Skill architect 'is built into Self-improve, which already has a reviewer model, your approval of every change, and kept versions'.
  In fact: Self-improve's approval and versions cover only its own lessons. Memory keeps no versions, project instructions keep their last 10, and skills keep none. Its reviewer is meant to be 'a stronger model', often in the cloud, while the plan wants old conversations read on this Mac. Its page promises that conversations are never sent.
- The plan says: 'A habit of one model → a Self-improve lesson for that model.'
  In fact: Self-improve keeps lessons per saved model version. A plain model's lessons reach every conversation, whatever its model. The page's 'Your own lesson' goes into the version picked on the page.
- The plan says: Each skill 'starts as the tab it was learned in' (all tabs can use skills).
  In fact: The model can find and load a skill on its own only where it has the skill tool: Cowork, Code, Data and Finance in the shipped settings. In Chat, Research and Scout only you can start a skill, by typing /name. Recon drops the skill list.
- The plan says: 'The skills that come with Plus and tell the model how to use its tools (PDF reader, diagrams, Office)'.
  In fact: The Office skills come with the app (dsh-skill-office), not with Plus. Plus ships the PDF, diagram, code map (4), code power (4), Finance (7) and Learning (1) skills.
- The plan says: Build step 13 (off switches, including 'Per Long run: a row on the Long run card') needs only step 0.
  In fact: The Long run row needs the Long run card (plan step 8). Switches also cannot be tried before some learned skills exist, so a small library has to come first.
- The plan says: 'A run item that needed several tries' is one of the first signals.
  In fact: Mission logs become a source only in build step 15. Until then this signal is not read (gap A4).
- The plan says: 'A Rerun' is a signal the reader can find.
  In fact: A Rerun of the first question is a brand-new conversation with no link to the original. A later Rerun is a copy marked as one, but it does not say which conversation it came from.
- The plan says: 'Start clean when you create a project' (rules) and 'One click in the chat box, on the Skills entry of the Tools panel, starts clean' (decisions).
  In fact: The plan contradicts itself. Nothing is built either way.
- The plan says: 'Old conversations are read by a model on this Mac unless you tick otherwise.'
  In fact: The built rule (the instructions generator and decision new-1) treats this Mac and your own network as private, and internet or unknown models as needing your yes. The plan's wording is narrower and needs your call.
- The plan says: Signals listed: 'a correction you later confirmed, the same request made several times, a run item that needed several tries, a Rerun or a Stop'.
  In fact: Two signals you already give are left out: the thumbs up and down under each answer (with an optional note) and /feedback remarks. Both are stored in the conversation.
- The plan says: Nothing in the plan says where learned skills are kept.
  In fact: If they were written as skill files into a skill folder or a project, the app would load them in every conversation and no off switch could hide them. They must be served by the add-on itself.

### What the app allows

| Needed | Available | Evidence |
|---|---|---|
| An add-on supplies its own skills and can change the list while the app runs | yes | dsh-skill/src/index.ts registerProvider 390-428 with control.invalidate(); invalidateCache emits skills/change 621-660; dsh-tool-skill sends a replacement catalog at the next step (217-255) |
| Hide learned skills for one conversation (the provider knows which conversation asks) | partly | The provider gets the same options object, with scope set to the agent, from the skill tool (dsh-tool-skill 137, 190, 226) and from the '/' menu for an open conversation (skill-catalog.ts). The documented contract covers only cwd and signal (dsh-skill index.ts 102-119). Tier skills and the Skills page ask with a preset lease, not a conversation (model-tiers 1445-1453; cowork-shell 387-396). Lab trial needed. |
| Hide learned skills for one project | yes | Providers receive cwd in the documented contract (dsh-skill SkillLookupOptions); the cache key includes cwd (643-645) |
| A hidden skill is refused by name, by the model and by a typed /name | yes | dsh-tool-skill execute: a name missing from list() fails with 'unknown or no longer available' (138-141); the /name path leaves an unknown name as plain text (193-199) |
| A built-in switch per conversation or per project for skills | no | Only per-skill frontmatter (disable-model-invocation, user-invocable) in dsh-skill-filesystem 1015-1019, or invocation flags on runtime registrations |
| Read stored conversations without opening them | yes | ctx.get('sessionQuery') readSession, listEvents, filterSessions (dsh-session-query/src/index.ts 196-322), already used by Global Search (addons/dsh-search/index.js 103) |
| Tell a Rerun copy from its original | partly | A fork has isSeeded and inheritedEventCount but no id of its original (dsh-session/src/index.ts 1483-1500); a first-question Rerun is a new conversation (docs/MODES-AND-SETTINGS.md 589) |
| Signals: Stop, /feedback, thumbs, skill use | yes | turn/end aborted by the user (dsh-modes lib/stop.js); feedback/record (dsh-command-feedback); feedback/message-put with rating, note and category (dsh-message-feedback types.ts 37-58); skill tool calls and 'skill-invocation' messages in the log |
| Leave Recon conversations, their helpers and copies out, and fail closed | yes | addons/dsh-sync/lib/isolation.mjs (sessionIsolated, open-conversation check, parentSession, stops when Modes cannot answer) |
| Ask a model for text with no tools | yes | ctx.get('llm').stream in dsh-evolve ask() 341-362 and dsh-cowork-shell askModel() 451-462 |
| Tell whether a model runs on this Mac, the home network or the internet | partly | whereOf() in dsh-cowork-shell lib/generate.js 92-111 by base address; DeepSeek counts as internet; unknown providers count as internet |
| Write into Memory, project instructions and Self-improve from another add-on | no | Memory has only the /dsh-memory/data route (index.js 122-174); the Cowork sidebar has only the /dsh-cowork-shell/projects route; Self-improve's service is read-only (active, notes, status, index.js 654-668), and its addLesson action uses the version picked on the page |
| Run '/skills learn' on a schedule | partly | The app's scheduler sends a prompt (dsh-schedule/src/types.ts); commands run only from interactive chat boxes (dsh-commands README). An add-on timer works, but only while the app is open. |
| Store a per-conversation choice, carried by Rerun and kept on each Mac | yes | Modes' volatile session fields (dsh-modes index.js 107-164), the CARRIED list (client.js 515), ALWAYS_SKIP (dsh-shared-settings/index.mjs 32-40) |
| A Skills entry inside the Tools panel | partly | The panel is Modes' own component (client.js 1020-1088). Another add-on can only add its own button to slot conversation.input.left (HANDOFF section 3, chat box seats). A row inside the panel means changing Modes. |
| Model Tiers leaves out a learned skill when the switch is off | no | loadTierSkills reads through the default preset lease, with no conversation (model-tiers index.js 1441-1453); tierPrompt pastes every named skill (1189-1197) |
| Count how often a learned skill was used | yes | tool/call events with name 'skill' and the skill's name, and 'skill-invocation' message sources (dsh-tool-skill 200-204), readable through sessionQuery |

### To try in the lab before building

- **A test provider that hides one skill for one conversation and for one folder** Why: Per-conversation hiding depends on options.scope, which is outside the documented contract. Helpers and the '/' menu must follow too. How: In the throwaway lab, a stand-in add-on registers a provider that reads options.scope and cwd. Check four things. 1) The skill tool's catalog in an open conversation, before and after invalidate(). 2) The '/' menu and a typed /name, for an open and a closed conversation. 3) A helper started by that conversation. 4) A request for the hidden skill by name. Read the requests the mock received (MOCK_DUMP).
- **Reading stored conversations with sessionQuery** Why: The reader must not slow or disturb an open conversation, and must handle copies, helpers, trash and pending deletes. How: In the lab, make 30 conversations, including a Rerun copy, a helper run, one in the trash, one in pending.json and a Recon one. Time readSession and listEvents while a chat is running. Check that the copied part (inheritedEventCount) can be skipped, and that thumbs (feedback/message-put) and Stop events can be read.
- **How long a local reading model takes for 20 candidate conversations** Why: On-demand runs share your one local model; your chat may have to wait. How: Point the reading model at the mock with delays, then at a real local server if you allow it. Measure the time per conversation and whether a chat sent meanwhile is held.
- **Tier skill text when learned skills are switched off** Why: Model Tiers reads skill text through the default preset, so it may paste a hidden learned skill. How: Put a test learned skill on a tier, switch learned skills off in one conversation, and read the model-tiers section in the mock's request.
- **A learned skill with the same name as yours, Plus's or a project's** Why: Within one layer the lower rank wins, so a learned skill could replace one of yours, or be replaced. How: Register provider candidates with ranks 100, 250 and 700 under names that exist in ~/.agents/skills (lab home) and in Plus. Check which one wins in skills.list and in the skill tool.
- **The reader skips Self-improve's test runs and Recon** Why: Check and Guard tasks and Recon findings must never reach the reading model or a proposal. How: Run one Self-improve 'with tools' task and one Recon conversation in the lab. Run the reader's list without a model, and assert that neither appears. Switch Modes off and confirm the reader refuses to run.

### Steps

**Step 69. Owner's answers before building** (size S)

- What: Put to the owner, one at a time: where the architect lives; private reading model (this Mac or own network); the 'never learn from this' mark; existing skills; Chat, Research and Scout. The other questions come before the step that needs them.
- Add-ons: 
- Tests: None: questions only.
- What could break: Building step 1 before 'where it lives' is answered could mean changing Self-improve without his yes.
- Needs first: Step 0 of the plan

**Step 70. Learned-skill library and its own skill provider** (size M)

- What: A new add-on (or Self-improve, if the owner chooses that) keeps learned skills as plain text in its own data folder and serves them through its own provider. Names never match an existing skill. A page lists them, with 'Add a learned skill' by hand for testing, versions with Put back, and Delete. Nothing is learned yet.
- Add-ons: new add-on (e.g. dsh-skill-architect)
- Tests: Provider list and get; a name clash is refused; versions are never overwritten; Put back; invalidate() after each change; nothing is written into any skill folder.
- What could break: Rank choice: a wrong rank could replace one of the owner's skills.
- Needs first: Owner's answers on where it lives and on existing skills; lab trial on same names
- Cannot be verified before you try it: Whether a real model picks a learned skill at the right moment.

**Step 71. Reach: all tabs, one tab, one project; never Recon** (size S)

- What: Each learned skill has a reach. The provider filters by the conversation's mode (modes.get), by folder (cwd), and follows helpers to their conversation. Recon conversations get no learned skills, not even in the '/' menu.
- Add-ons: new add-on
- Tests: Filtering by mode, by folder and for helpers; Recon gets none; the cache refreshes after a change of reach.
- What could break: Relies on options.scope, which the app does not document for providers.
- Needs first: Step 1; lab trial on hiding per conversation
- Cannot be verified before you try it: Closed conversations: the '/' menu uses the preset, not the conversation, until it is opened.

**Step 72. Skills entry in the Tools panel: All, This tab's, None** (size M)

- What: A per-conversation choice, plus 'Don't learn from this conversation' if the owner said yes. It is carried by Rerun and kept on each Mac.
- Add-ons: dsh-modes (Tools panel row, CARRIED list), new add-on (stores and applies the choice), dsh-shared-settings (only if the choice is a settings field: ALWAYS_SKIP)
- Tests: None hides learned skills from the skill tool, the '/' menu and /name; Plus's and the app's skills stay; a Rerun copy keeps the choice; the field is never shared between Macs.
- What could break: Skill text loaded before the switch stays in that conversation; the panel should say so.
- Needs first: Step 2; owner's answer on the 'never learn' mark

**Step 73. Project switch and pick list on the project page** (size M)

- What: A card on the project page: learned skills on or off for this project, and which ones. New projects start with them on. 'Start clean' goes where the owner chooses. Stored in the new add-on, keyed by folder, not in projects.js, whose save() drops unknown fields.
- Add-ons: dsh-cowork-shell (client card), new add-on (store and route)
- Tests: A project switched off hides learned skills in its conversations only; a project's instructions and type are untouched.
- What could break: Chat and Scratch conversations have no project, so this switch does not apply to them.
- Needs first: Step 2; owner's answer on Start clean

**Step 74. Tier skills follow the learned-skill switches** (size S)

- What: Model Tiers asks the new add-on whether a learned skill it names is allowed for this conversation, and leaves the text out if not. Only learned skills; your own and Plus's skills on tiers are unchanged.
- Add-ons: dsh-model-tiers
- Tests: Tier text present with the switch on, absent with it off; non-learned tier skills always present; isolated conversations unchanged.
- What could break: Changes built Model Tiers behaviour: only with the owner's yes.
- Needs first: Steps 3 and 4; owner's answer on tier versus switch; lab trial on tier text

**Step 75. Long run row for learned skills** (size S)

- What: A row on the Long run card: All, This tab's or None for the run.
- Add-ons: the Long run add-on (from plan step 8), new add-on
- Tests: The run's conversation and its helpers follow the row.
- Needs first: Plan step 8 (Long run card); step 3

**Step 76. Conversation reader without a model** (size M)

- What: A read-only list of the conversations it would read and why, with their signals: a correction you confirmed, repeats, Stop, thumbs down with a note, /feedback, a Rerun copy. It uses Sync's Recon rule (reads nothing when Modes cannot answer) and skips helpers, Self-improve test runs, the trash, pending deletes and 'never learn' conversations. In a copy it reads only the part after the copied turns.
- Add-ons: new add-on (reads through sessionQuery)
- Tests: Recon, its helpers and its copies are never listed; Modes off means nothing is read; trash and pending are excluded; the copied part is skipped; Self-improve test helpers are skipped.
- What could break: The search index may still hold conversations that are in the trash.
- Needs first: Step 1; lab trials on reading stored conversations and on skipping test runs

**Step 77. Record where a Rerun came from (only if needed)** (size S)

- What: If the lab shows that copy marks are not enough, Modes records the original's id on each Rerun copy, kept on each Mac. Records only, no change in behaviour.
- Add-ons: dsh-modes, dsh-shared-settings (ALWAYS_SKIP)
- Tests: A copy records its origin; the field is never shared; Rerun works as before.
- Needs first: Step 7 and its lab result; owner told before Modes is changed

**Step 78. /skills learn: proposals for skills from corrections** (size L)

- What: Reads the candidate conversations with the reading model chosen on its page, private by default. For an internet model there is a tick, and you see what would be sent first (the generator's pattern). It proposes new learned skills, each with the turns it came from. It installs nothing.
- Add-ons: new add-on
- Tests: What is sent comes only from listed candidates; no Recon text is ever in it; secrets and home paths are removed (Self-improve's redaction); an internet model is refused without the tick.
- What could break: Long runs on one local model may hold the owner's chat (lab trial).
- Needs first: Step 7; owner's answers on the reading model and the 'never learn' mark
- Cannot be verified before you try it: How good the proposals are with a real local model.

**Step 79. Review screen for proposals** (size M)

- What: Additions can be accepted together. Anything that removes or contradicts existing text is asked one by one. Every accepted change becomes a version with Put back. Quotes are dropped as the owner decided.
- Add-ons: new add-on
- Tests: Accepting all applies only additions; removals ask one by one; Put back restores; quotes are gone after a decision or after the conversation is deleted.
- Needs first: Steps 1 and 9; owner's answer on quotes

**Step 80. Facts to Memory** (size S)

- What: After your yes on the architect's review screen, a fact is added to Memory through a small new Memory service. Memory's limits apply (300 characters each, 4,000 in all), and a full Memory is reported plainly. Lens, Depth and Web choices are never turned into facts.
- Add-ons: dsh-memory (small service), new add-on
- Tests: Entry added only after yes; full Memory refused with a message; Recon still gets no Memory; the remember tool is unchanged.
- What could break: Memory's 4,000 characters fill quickly.
- Needs first: Step 10

**Step 81. Project rules to project instructions** (size S)

- What: After your yes, a rule is appended to the project's instructions through a small Cowork sidebar service and saved as a version marked as the architect's. The architect also keeps its own full record of the change.
- Add-ons: dsh-cowork-shell (service; lib/generate.js 'by' list), new add-on
- Tests: Appended text appears as a new version; Put back works; 12,000-character limit respected; the type and tab are unchanged.
- What could break: Pushes the owner's older versions out of the 10 kept.
- Needs first: Step 10; owner's answer on keeping 10 versions

**Step 82. Model habits and tab lessons to Self-improve** (size M)

- What: A small Self-improve service adds a lesson to the conversation's model version (or as the owner chose), marked 'from your conversations, not tested', with a button to make a test task from it. It warns when tested changes are waiting, is refused while a cycle runs, and warns when the playbook is near 60. Lessons from Chat, Research and Scout go here too, if the owner chose that.
- Add-ons: dsh-evolve (service), new add-on
- Tests: Lesson filed in the right store and family; marked as untested; refused during a run; waiting changes reported before; nothing reaches Recon.
- What could break: Research lessons also reach Research's helpers; with 'Use approved instructions in real conversations' off, they reach nothing.
- Needs first: Step 10; owner's answers on model habits, untested lessons and Chat/Research/Scout

**Step 83. Use counters** (size M)

- What: For each learned skill: how often it was loaded or started, and how often a correction, Stop or thumbs down followed. Read from stored conversations.
- Add-ons: new add-on
- Tests: Counts from skill tool calls and /name uses in sample logs; Recon is never counted.
- Needs first: Steps 7 and 10
- Cannot be verified before you try it: Whether 'a correction followed' really means the skill was wrong.

**Step 84. Retirement proposals** (size S)

- What: Unused or harmful learned skills are proposed for retirement, one by one, with Put back.
- Add-ons: new add-on
- Tests: Threshold rules; retirement is a version; Put back restores.
- Needs first: Step 14

**Step 85. Mission runs as a source (gap A4)** (size M)

- What: Reads finished runs (run.json items with several tries or 'stuck') as candidates. This closes A4 in the architect instead of a separate Self-improve action.
- Add-ons: new add-on (reads dsh-mission files)
- Tests: Runs in Recon folders are never read; a stuck item becomes a candidate.
- Needs first: Step 9

**Step 86. Research runs as a source** (size M)

- What: Reads saved Research reports, with their Checks and 'not read' labels, as candidates.
- Add-ons: new add-on (reads dsh-research reports)
- Tests: Reports are read; Scout reports and Recon never are, unless the owner says otherwise.
- Needs first: Step 9

**Step 87. Optional schedule (proposes only)** (size S)

- What: Nightly, weekly or monthly, as the owner chose: its own timer while the app is open, shown as missed when the app was closed, and shown on the Automations tab once it exists. It never installs.
- Add-ons: new add-on, dsh-automations or the Automations tab (only a read-only card)
- Tests: A scheduled run makes proposals only; a missed run is shown, with no catch-up.
- What could break: The app's scheduler cannot run '/skills learn' itself.
- Needs first: Step 9; owner's answer on schedule versus Automations tab


---

## Automations tab

### What already does part of this job

- **Automation runs page (Plus): follows every scheduled run to its end and shows what needs you** (addons/dsh-automations/index.js, addons/dsh-automations/lib/runs.js (RUNS_MAX = 200, TEXT_MAX = 400), addons/dsh-automations/client.js (RunsPage; main slot key 'automations'; sidebar.panellist id 'automations', order 21)). A user/message whose source.kind is 'schedule' and whose text starts with '[SCHEDULE REMINDER' starts a run. The task ids come from schedule_id_json, or from reminders_json for a batch. Each run is followed to turn/end and shown as Finished, Failed, Stopped, Cancelled, Running or Needs you (approval, question, plan review). The page has Needs you cards with Open, and 'Your tasks' with next run and Run now. Run now is disabled for ended tasks, and ended tasks with no recorded run are hidden. 'Last runs' shows 20, with 'Show all'; Open; and Run again, only on failed or stopped runs of a single task. 200 runs are kept for all tasks together in <home>/automations/runs.json. Runs left Running by a closed app become Failed at the next start (closeLeftovers). The message's occurrence_at is ignored, so a late catch-up run looks like any other run. The README never says the app runs the latest missed time when it reopens. It also says the app 'keeps running in the menu bar'; on macOS it stays in the Dock, and the tray icon is Windows only (window-all-closed and DesktopTray in the app's main.js).
- **Alerts on this Mac and on the phone (ntfy) for failed, needs-you and finished scheduled runs, and optionally for your own conversations** (addons/dsh-automations/lib/alerts.js, addons/dsh-automations/client.js AlertsPage (Settings > Alerts, section id 'alerts', order 430)). One global set of settings: alertFailed, alertNeeds, alertFinished, alertOthers with othersMinutes, mac, phone, ntfyServer, ntfyTopic. There are no per-task alert settings. At most 10 alerts a minute. The text holds only the task name and what happened.
- **The app's own Automation tasks page: create by hand or by conversation, repeat editor, destination, folder, pause and resume, Run now, delete, clear ended tasks, filters, delivery records. Also a header clock, a right-sidebar task tab and row marks** (/tmp/dsh-asar/rc2/dsh-client-ui-schedule (README; src/client/TaskManagerPage.tsx, TaskDetail.tsx, DeliveryHistory.tsx; index.ts PANEL_ID 'schedules'; right-sidebar kind 'scheduleTask')). Uses the host schedule service: create, edit, run, history, deleteInactive. New and 'Create in a session' open a new conversation with a draft prompt. Manual creation defaults to one new conversation that later runs reuse; the other choice is a new conversation at every run, and a task already linked to a conversation keeps it. The repeat editor offers once, minute, hour, day, week, month, or Custom (RRULE or 5-field Cron). The folder is the 'Linked workspace'. Records come 20 per page and only say that the instruction reached a conversation. Delete asks once, then removes the task and its records for good.
- **The app's scheduler: timing kinds, destinations, latest-only catch-up, slots, batches** (/tmp/dsh-asar/rc2/dsh-schedule/src/index.ts, runtime.ts, domain.ts, update.ts, README.md; /tmp/dsh-asar/rc2/dsh/docs/subsystems/schedule.md). Seven timing kinds: after, at, every (60 s or more), daily, weekly, cron, rrule. 'First Monday' (BYDAY=1MO), 'the 10th' (BYMONTHDAY) and 'every N hours' (HOURLY;INTERVAL=n, every_seconds, or Cron) already work. Hourly RRULEs take no BY parts. Destinations are session, new_once (the default) and new, with optional cwd and agentPreset. drive() delivers every active task that is due. A recurring task gets one message for its latest due occurrence and then jumps to the first future one. A missed one-time task (at, after) is also delivered late. Nothing records the misses. The scheduler has no wake handler: its README names wake, but delivery after sleep depends on its timer. Due recurring tasks that write into the same conversation arrive as one '[SCHEDULE REMINDER BATCH]' message. Each message carries occurrence_at; for Run now it is the current time. A reused conversation holds one execution slot per task, while new-per-run conversations can overlap without limit. There is a 60 s delivery floor. Delivery history keeps 30 days or 200 per task, one host-wide setting. Other facts: schedule/changed is emitted on every change. The schedule/resolve-agent waterfall runs inside the scheduler's single FIFO, which it shares with every edit, Run now and archive stop. runNow() does not check paused or ended. An edit with active: true (resume) moves an overdue task to its next future time. catalog() does not expose pendingDelivery.
- **Creating automations by asking the assistant (schedule_create, schedule_list, schedule_view, schedule_edit, with a turn card)** (/tmp/dsh-asar/rc2/dsh-tool-schedule/src/index.ts; addons/dsh-modes/lib/trim.js (family 'schedule'); docs/MODES-AND-SETTINGS.md sections 3-5). Available in Cowork, Code and Data (trimmed tabs load the family with tools_find or family words) and in Finance (on by default). Not in Chat (no tools), Research (6 tools), Scout (its own list of 17) or Recon (isolated). The model must choose the destination: this_session, new_once or new. The new ones copy the calling conversation's folder and preset. The model writes RRULE only. The calling conversation is recorded in involvedSessionIds.
- **Mode for scheduled tasks (one setting for all automations), with that mode's tier from the first step** (addons/dsh-modes/index.js (Config scheduledMode; schedule/resolve-agent handler with a 10 s wait; agent/inbox/spliced fallback; claim API), addons/dsh-modes/lib/scheduled.js, client.js (Settings > Modes > New conversations); docs/MODES-AND-SETTINGS.md section 13 (core-7, core-16)). A fresh conversation that a task opens is moved to scheduledMode (default cowork) in the scheduler's resolve-agent hook, before the message is sent, so its tier is in place for the first step. The picker leaves isolated modes out. A task that writes into an existing conversation keeps that conversation's mode. modes.set(id, mode, {claim: true}) lets another add-on override this.
- **Finance scheduled briefs and 'Your own scheduled tasks' switches** (addons/dsh-finance/lib/briefs.js (BRIEF_PREFIX 'Finance brief: ', BRIEF_OPENING), addons/dsh-finance/index.js (addBrief, rewordBriefs, adopt, financeTasks)). A brief is an app task titled 'Finance brief: <subject>', with an RRULE and target new. Briefs, and task ids listed in financeTasks, are claimed into Finance at agent/inbox/spliced. That is after the scheduler's resolve-agent hook, so the Finance tier may land after the first step has started. Briefs are recognised by the title prefix and the opening sentence of the instruction. An edited instruction falls back to a slower title lookup.
- **Notify: runs the owner's own command when a top-level turn ends (scheduled runs included) or when an approval is asked** (addons/dsh-notify/index.js, README.md). Rules live in the config file only. Nothing is set up by default.
- **Cowork sidebar: tab pages, Needs you on every tab, tab grid** (addons/dsh-cowork-shell/index.js (DEFAULT_TABS: cowork pages ['schedules','automations','connectors','skills']; maxTabs 1-5), client.js (claimed or shared pages; .cws-tabs[data-many] 3-column grid with more than 3 tabs; labels cut with an ellipsis); addons/dsh-modes/lib/tabs.js (sidebarTabs)). A page that a tab lists shows only under that tab. A page no tab lists shows under every tab. Both automation pages therefore show under Cowork only. Tabs are the Modes add-on's modes: the first maxTabs built-in modes, plus every add-on mode, always. Plus never writes the 'tabs' layout; it changes only if edited by hand in the config file. The cowork-shell row ships with config: {}.
- **Trash, and the archive rule that deletes automations** (addons/dsh-cowork-shell/index.js (trash route /dsh-cowork-shell/trash, remove() requires an archived conversation), lib/trash.js (KEEP_MS 30 days, purge), client.js (archiveQuietly, remove, 'archive.running' and 'delete.running' texts); /tmp/dsh-asar/rc2/dsh-schedule/src/index.ts (workspace/session-activity, stopSessionTasks); dsh-workspace README). Delete archives the conversation itself, then moves its files to <home>/trash/conversations, with Put back and removal after 30 days. The trash is reachable only through that browser route; there is no service for other add-ons. The app refuses a plain archive while an active automation writes into the conversation (new_once or session). The sidebar then asks only 'This conversation is still working. Stop it and archive it?' (or '…delete it?'). It does not name the automation. Yes deletes that automation and its delivery list for good; Put back does not restore it. Paused automations are kept. Nothing is moved to the trash automatically.
- **Patterns to reuse for Improve and the tab's chat** (addons/dsh-cowork-shell/lib/generate.js (no-tools model call, whereOf local/network/cloud, versions), addons/dsh-evolve (reviewer model, approval, kept versions)). Both already exist for project instructions and Self-improve: a no-tools model call with a 'what would be sent' preview, and versions with Put back.
- **Budget guard limits that end a run as 'Stopped'** (addons/dsh-budget/index.js and README (maxSteps 300, maxTokens 20,000,000, maxMinutes 0, maxRepeats 8, dayTokens 0)). Global limits only, per turn. At a limit it refuses the next step through agent/pre-step and the app ends the turn as 'blocked' with no model request. Plus could use the same mechanism to stop or hold a run before the model is asked. There is no budget per conversation or per automation.

### Where the plan changes something built (needs your yes)

- **Today:** The Cowork tab lists two rows: 'Automation tasks' (the app's editor, panel 'schedules') and 'Automation runs' (Plus, page 'automations'). They show under Cowork only, because DEFAULT_TABS in addons/dsh-cowork-shell/index.js lists them there. A page that no tab lists shows under every tab. Plus never saves the layout.
  **The plan:** Both become links to the new Automations tab, and every tab gets an Automations entry.
  **Conflicts with:** built behaviour: the cowork-shell tab layout (DEFAULT_TABS pages) and the app's Automation tasks row
  **Question:** Today the Cowork tab has two rows. 'Automation tasks' is the app's own editor, where you set custom repeat rules and the folder a task runs in, and see its delivery list. 'Automation runs' is Plus's list of how each run ended. The plan replaces both with one 'Automations' row on every tab, which opens the new Automations tab. If the app's editor loses its row, you can no longer reach it from the sidebar in one click. Which do you want?
  **Options:** One 'Automations' row on every tab. The app's own editor stays one click away inside the Automations tab ('Open in the app's editor'). / One 'Automations' row on every tab, and keep the two old rows under Cowork as well. / As the plan says: links only. The app's editor is not reachable from the sidebar.
  **Recommendation:** The first option. Everything is in one place, as you decided, and nothing is lost, because the app's editor is still one click away. Technical note: Plus never saves the sidebar layout, so the new default reaches you directly, unless you once edited the layout by hand in the configuration file. In that case a one-time carry-over is needed.
- **Today:** One setting decides the tab of every automation's conversation: Settings > Modes > 'Mode for scheduled tasks' (scheduledMode, default Cowork; decision core-16). That mode's tier is applied before the first step, in the scheduler's resolve-agent hook (core-7). Finance claims its briefs and the tasks switched on under Settings > Finance > 'Your own scheduled tasks' (financeTasks), but only when the message arrives, after that hook. A task that writes into an existing conversation stays in that conversation's tab. For automations that open a new conversation at each run, the scheduler's public task list does not say which conversation it is opening, so Plus cannot tell which automation it is in that hook.
  **The plan:** Each automation carries its own tab and settings, shows the tab it was created in, and the list can be filtered by tab.
  **Conflicts with:** core-16 and core-7 (as built in addons/dsh-modes); Finance financeTasks (0.29.2)
  **Question:** Today every automation's conversation opens in one tab: the one you pick on Settings > Modes > 'Mode for scheduled tasks' (Cowork). The exceptions are Finance briefs, and the tasks you switched on under Settings > Finance > 'Your own scheduled tasks', which open in Finance. The plan gives each automation its own tab, shows it on the automation's card, and lets you filter the list by tab. What should happen to the two settings you have now?
  **Options:** Each automation gets its own tab. The Modes setting stays as the starting choice for new automations and for those made elsewhere, for example by asking the assistant. Finance's switches become the same setting, shown on both pages. / Each automation's own tab replaces both settings. What you set there now is carried over, and the two settings are removed. / Keep one tab for all automations, as today.
  **Recommendation:** The first option: nothing you set is lost, automations made by asking the assistant still land in a sensible tab, and Finance keeps working as now. Limits: an automation that writes into an existing conversation keeps that conversation's tab, and Recon is never offered. For an automation that opens a new conversation at every run, the lab must first show that its tab's model can be in place for the very first step. An automation made inside the Automations tab shows the tab you came from as 'created in'. Older ones show 'not known'.
- **Today:** The app's scheduler catches up by itself. When the app opens, each recurring automation runs once for the latest time it missed; earlier misses are folded into that run and recorded nowhere. Missed one-time automations also run then. After sleep, the run comes when the scheduler's timer fires (no wake handler). There is no setting to switch this off. Plus records that run as an ordinary run. The app's code also has a clean way to skip: an edit with active: true moves an automation to its next future time with no run.
  **The plan:** App closed: nothing runs. A run that was due shows as Missed, with Run now. No automatic catch-up.
  **Conflicts with:** built behaviour of the app's scheduler (not Plus)
  **Question:** You decided that nothing should run by itself after the app was closed. But when the app opens again, it runs each automation once for the latest time it missed, and quietly skips the earlier ones. A one-time automation ('once, at 9:00') that was missed also runs then. After the Mac wakes from sleep it may do the same. The app has no setting for this. How should Plus handle it?
  **Options:** When the app opens, Plus moves each missed automation on to its next time before the app can run it. Nothing runs and nothing is created, and every missed time is listed as Missed with Run now. A one-time automation cannot be moved on, so Plus pauses it instead. This must be proven in the lab first. / Let that one late run happen and mark it 'Ran late, when the app opened'. List the other missed times as Missed, with Run now. / Let the app start the late run, but Plus stops it before the model is asked. A conversation holding only the instruction is left behind, and the app's own list says it was delivered.
  **Recommendation:** The first option, if the lab shows Plus is always quicker than the app, because that is exactly what you decided. Otherwise the second. Not the third: in an automation that reuses one conversation, the stopped instruction stays there, and the next run's model may carry it out twice. Note: Run now on a missed time runs the instruction now, so an instruction like 'since yesterday' would cover the same period twice. Sleep follows the same rule only if the lab shows Plus can notice it in time.
- **Today:** Plus keeps the last 200 runs for all automations together (addons/dsh-automations/lib/runs.js RUNS_MAX). The app keeps its own delivery list: 30 days or 200 per automation, one setting for all. Nothing is moved to the trash automatically. The trash takes only archived conversations, has no service other add-ons can call, and archiving a conversation that an active automation writes into deletes that automation (dsh-schedule stopSessionTasks).
  **The plan:** Past runs are kept per automation by time, by count or both (hourly one week, daily one month, weekly six months, monthly one year). Older runs go to the 30-day trash.
  **Conflicts with:** built behaviour: Plus's run record (200 for all), the Cowork sidebar trash (by hand only, no service), the app's archive rule
  **Question:** Plus would move old runs to the trash by itself. That works for automations that open a new conversation at every run. But most automations put every run into one shared conversation: the app's default, and those made 'in this conversation'. One old run cannot be taken out of that conversation, and archiving the conversation would delete the automation itself. What should happen for those?
  **Options:** Drop only Plus's record of old runs, and never touch the shared conversation. / Move the shared conversation to the trash once the automation itself is deleted. / Do nothing for those automations.
  **Recommendation:** The first option: nothing you still use can disappear by accident. The app's own delivery list keeps its 30 days or 200 per automation, and Plus leaves it alone. Note: keeping runs per automation means Plus's own 200-run limit for everything together goes, and the page's line 'The last 200 runs are kept' changes.
- **Today:** The app runs automations side by side when they use different conversations, or open a new conversation at every run, with no limit (dsh-schedule README). One automation never overlaps itself in a reused conversation. Run now uses the same rule. Plus holds nothing back. The only hook before delivery (schedule/resolve-agent) runs inside the scheduler's single queue, so holding a run there would also freeze every task edit, Run now and archive in the app.
  **The plan:** Runs go through a queue, one at a time, because one local model cannot serve two jobs at once. This is a rule in the plan, not one of the answers of 15 November.
  **Conflicts with:** built behaviour: when runs start (today side by side)
  **Question:** The plan puts automations in a queue, so only one runs at a time, because one model on this Mac cannot do two jobs at once. Today the app runs them side by side when they use different conversations. With a queue, what should happen when the running automation stops to wait for your approval or your answer, perhaps for hours?
  **Options:** A queue, and a run that waits for you steps aside: the next one starts, and the waiting one carries on after you answer. / A queue, and everything waits behind it until you answer. / No queue: runs stay side by side, as today.
  **Recommendation:** The first option: one forgotten question does not stop a whole night of automations. Limits: only automations queue, not your own conversations. Plus cannot hold a run back before the app hands over its instruction without freezing the app's own task page. So a queued run is held at its first step, and its conversation already exists and shows 'waiting in the queue'. This must be tried in the lab first.
- **Today:** The app has no file trigger and no chain trigger. It starts only its own timed tasks, and Run now sends only the stored instruction. In the app's code, Run now does not check whether a task is paused.
  **The plan:** File trigger (a file appears in a chosen folder) and chain trigger (another automation finishes and hands over its result). A chain never starts after a failure and refuses a loop. A file trigger waits until the file stops changing and ignores files the automation wrote itself. Files that arrived while the app was closed are listed at start with 'Run for these'.
  **Conflicts with:** none (new), but the app's own task list and page are affected
  **Question:** File and chain automations ('when a file appears', 'when automation A finishes') are new. The app cannot start them, so Plus would. Where should they live?
  **Options:** In the app's own list, as paused tasks that Plus starts itself. They also show on the app's Automation tasks page as Paused, with a time far in the future, so pressing Resume there does no harm. / Only in Plus's Automations tab, not in the app's list.
  **Recommendation:** The first option, if the lab confirms that the app lets Plus run a paused task (its code allows it). Then every automation, its instruction and its delivery list stay in one place. Otherwise the second. Either way, a file name or the previous automation's result has to reach the run some other way, and that must be tried in the lab.
- **Today:** Deleting an automation is final: the app removes it and its delivery list at once. It is also deleted for good when you archive or delete the conversation it writes into. In that case the Cowork sidebar only asks 'This conversation is still working. Stop it and archive it?' without naming the automation, and Put back from the trash does not bring it back.
  **The plan:** 'Everything you delete goes to the trash for 30 days' lists conversations, Scratch threads and old automation runs. Automations themselves are not mentioned.
  **Conflicts with:** built behaviour of the app (deletion is final) and of the Cowork sidebar (its archive and delete question)
  **Question:** Today deleting an automation is final: it and its list of past deliveries are gone at once. It is also deleted for good when you archive or delete the conversation it writes into. The sidebar then only says 'This conversation is still working', and Put back does not bring the automation back. Should deleted automations go to the trash too?
  **Options:** Yes. Plus keeps a copy of each deleted automation for 30 days, and Put back makes it again. Its old delivery list cannot come back; Plus's own list of its runs stays. / No. Deleting stays final, but every delete names the automation and says it is final.
  **Recommendation:** The first option, as everything else you delete can be put back. Separately, the sidebar's question should name the automation that will be deleted. That is a clear bug and can be fixed now (step A1).
- **Today:** An automation made 'in this conversation' writes into a conversation you also use, and that conversation keeps its own model, Web level and file permission. Since 0.57.0 (core-6) a file permission you picked by hand is never overwritten. Data and Research always run read-only (data-1, research-6). An app task stores only a folder and a preset.
  **The plan:** Each automation has its own settings in the detail panel: model, Web, Depth, Lens, folder or Scratch, file permission, budget, alerts.
  **Conflicts with:** core-6, data-1, research-6
  **Question:** The plan gives each automation its own settings: model, web level, Depth, Lens and file permission. Some automations write into a conversation you also use; they were made 'in this conversation'. Today that conversation keeps its own settings, and a file permission you picked by hand is never changed behind your back. If an automation's settings applied there, they would also change that conversation for your own next message. What should happen?
  **Options:** Own settings only for automations that open their own conversation. For one that writes into an existing conversation, its card shows that conversation's settings and links to it. / Apply them anyway. / Apply them for the run only, and put the conversation's settings back afterwards (to be tried in the lab).
  **Recommendation:** The first option: your own conversations never change behind your back. In every case an automation's file permission never goes above what its tab allows (Data and Research read-only, Recon never offered).
- **Today:** Nothing yet: Scratch is plan step 7. Today an automation made by asking the assistant copies the conversation's folder, and archiving a conversation deletes the active automations that write into it.
  **The plan:** Scratch threads in every tab except Code, a clean-up that moves old Scratch threads to the trash, and 'folder or Scratch' as an automation setting.
  **Conflicts with:** the app's archive rule (dsh-schedule stopSessionTasks) and the Scratch part of this plan
  **Question:** Once Scratch exists, an automation made by asking the assistant inside a Scratch thread uses that thread. Either it writes into the thread, or each run opens a new conversation in the thread's hidden folder. Deleting the thread, or the clean-up that moves old Scratch threads to the trash, would delete the first kind and leave the second kind pointing at a folder in the trash. What should happen?
  **Options:** Delete and the clean-up skip Scratch threads that an automation still uses, and say which. You can still delete such a thread by hand, after a question that names the automation. / Automations cannot be made in a Scratch thread: you are asked to use 'Keep in a project' first. / Deleting the thread also deletes its automations, and they go to the trash with it.
  **Recommendation:** The first option: nothing that still runs disappears by accident. Design note: 'Scratch' as an automation's place means one hidden folder per automation, shared by all its runs, because the app stores one folder per automation.

### Changes that need no decision

- Today: In this app a sidebar tab is a mode of the Modes add-on. Add-on modes always get a tab, whatever the 1-5 tab count (core-8 as built, lib/tabs.js). 'Mode for scheduled tasks' offers every add-on mode that is not isolated. Plan: A new Automations tab: a dashboard first, and a chat that manages automations and answers questions about their results.
- Today: Automations that write into the same conversation and fall due together are delivered as one message and run as one turn. Plus records that as one run naming all of them. Plan: Every card, timeline mark, chain link and queue slot assumes one run per automation.
- Today: Alerts are one global set in dsh-automations, and Budget guard has global limits per turn. Gap A1 (alerts for Mission runs) and Long run (plan step 11) need alerts and a budget of their own. The Skill architect's optional nightly, weekly or monthly run (plan step 15) has no home yet. Plan: Per-automation alerts and budget in the detail panel; Long run alerts and allowance; a scheduled Skill architect run.

### Where the plan is out of date

- The plan says: Part 11 holds 26 decisions answered on 15 November 2026 that are not built yet.
  In fact: All 26 were built in 0.57.0. MODES-AND-SETTINGS.md section 13 lists what each does now, and HANDOFF.md has a 0.57.0 entry.
- The plan says: Automation tasks and Automation runs are pages under Cowork; a scheduled conversation starts in Cowork unless Finance claims it.
  In fact: Since 0.57.0 (core-16, core-7), the conversation starts in the mode picked on Settings > Modes > 'Mode for scheduled tasks' (Cowork by default), on that mode's tier from the first step. Finance claims its briefs and the tasks switched on under 'Your own scheduled tasks', at the arriving message, after the scheduler's hook, so the tier may come late. A task that writes into an existing conversation stays in that conversation's tab.
- The plan says: The Automation tasks and Automation runs pages under Cowork and the other tabs become links to this tab.
  In fact: They show under Cowork only (DEFAULT_TABS in addons/dsh-cowork-shell/index.js).
- The plan says: App closed: nothing runs; a run that was due shows as Missed; no automatic catch-up (written as if the app simply skips missed runs).
  In fact: When the app opens, its scheduler runs each recurring automation once for its latest missed time and folds the earlier misses into that run, with no record of them. Missed one-time automations also run then. There is no setting to switch this off. Plus must either skip the run itself, which needs the lab, or label it.
- The plan says: Step 18 builds 'Triggers: interval, file and chain'; the clock triggers are described as new.
  In fact: Clock and interval triggers already exist in the app: daily, weekly, cron, RRULE (BYDAY=1MO, BYMONTHDAY), every_seconds (60 s or more) and RRULE HOURLY;INTERVAL=n. Only the file and chain triggers are new.
- The plan says: Past runs: older runs go to the 30-day trash, like everything else that is deleted.
  In fact: Only runs that opened a conversation of their own (target 'new') have something that can go to the trash. The app's default and 'in this conversation' automations share one conversation, and archiving it deletes the automation. The app's delivery list has one setting for all automations (30 days or 200 each), not one per automation. The trash takes only archived conversations, and other add-ons cannot call it.
- The plan says: Step 16 (the tab, links from the other tabs, the 'created in' mark, Missed with Run now) needs only step 2.
  In fact: The links replace two built sidebar rows, and 'Missed' contradicts the app's catch-up, so both need the owner's answers first. Missed also needs a recurrence engine, which Plus does not have, and a record of when the app was last running. The tab itself is a new add-on mode.
- The plan says: Each tab has an Automations entry; creating works from any tab.
  In fact: Only Cowork, Code, Data and Finance have the assistant's schedule tools. Chat, Research, Scout and Recon do not. 'From any tab' therefore means the link to the Automations tab, which the plan does say.
- The plan says: Everything you delete goes to the trash for 30 days (conversations, Scratch threads, old automation runs).
  In fact: Automations themselves are deleted for good by the app: on its page, through the assistant, and when the conversation they write into is archived or deleted from the Cowork sidebar. The sidebar's question does not even name them. The plan does not cover this.
- The plan says: Step 0: try in the lab 'what the app's scheduler reports about runs it missed'.
  In fact: The code already answers most of this. The scheduler reports nothing about misses. It delivers the latest missed time once, with occurrence_at set to that time, and stores a receipt for it alone. The lab trial is still worth doing to confirm the timing at start and after sleep.

### What the app allows

| Needed | Available | Evidence |
|---|---|---|
| Know which automation a new conversation belongs to before its first step (per-automation tab and tier) | partly | For 'session' and 'new_once', the target sessionId is in catalog(). For 'new', the scheduler stores pendingDelivery before creating the conversation, but entry() in dsh-schedule/src/index.ts leaves it out of catalog(). The schedule_id_json text arrives only at the inbox splice, after the schedule/resolve-agent hook. |
| Switch off the app's catch-up | no | The Config has only deliveryHistoryDays, deliveryHistoryRecords and newSessionIntervalSeconds. drive() and resolveRecurringOccurrence in runtime.ts and domain.ts always deliver the latest due occurrence. |
| Skip a missed run without creating anything | partly | An edit with patch {active: true} recomputes the next future occurrence (update.ts updateScheduleRecord with resume; README: 'resume computes its next future occurrence'). It does not work for one-time tasks (not_future). Whether Plus can make the edit before the first delivery at start is unknown. |
| Stop a run before any model request | yes | Budget guard refuses a step through agent/pre-step, and the app ends the turn as 'blocked' (dsh-budget README). The delivered message and the app's receipt remain. |
| Tell that a run is late, and for which time | yes | Every reminder carries occurrence_at (domain.ts renderReminderFraming and the batch payload). For Run now it is the current time. lastDelivery and history() give scheduledAt per receipt. |
| List missed times and future runs (Missed list, tiles, timeline) | no | catalog() gives only the next scheduledAt. Plus has no RRULE or Cron engine, and no Plus add-on imports an app package (the app's is dsh-util-time with rrule 2.8.1). |
| Know when the app was last running | no | The app keeps no such record. Plus would write its own heartbeat. |
| Start an automation on demand (chain and file triggers, Missed with Run now) | yes | schedule.run({id}), already used by dsh-automations. runNow() in runtime.ts has no status check, so a paused task runs too. It is refused inside the 60 s floor, while the task's slot is busy, or when the target is archived. |
| Pass extra text into a run (file name, previous result) | no | run() sends only the stored prompt. The alternatives are editing the prompt before running, which changes the stored instruction and the app's saved prompt, or adding a follow-up message after delivery, which is untested. |
| Hold a run in a queue | partly | Waiting in schedule/resolve-agent holds the scheduler's single FIFO (runtime.ts drive inside transact; index.ts serialize), freezing edits, Run now and archive stops. agent/pre-step is the other hold point; whether holding there is safe is untested. |
| Watch a folder for new files | partly | Node fs in the host process; no app API is needed. Telling 'a file the automation wrote itself' apart needs Plus to track write and edit tool calls, and shell writes cannot be seen. |
| Read a run's full final answer (chain hand-off, the tab's chat) | partly | The assistant/message session event carries the text, but Plus keeps only the last 400 characters. sessionPersistence.list() and reads are used by cowork-shell. The app's session-query tools are experimental and limited to the same folder. |
| A new sidebar tab with a dashboard start page | partly | Tabs are Modes' modes, and add-on modes always get a tab (dsh-modes lib/tabs.js sidebarTabs). Add-ons show start-page parts by data-cws-tab (cowork-shell client.js). A full dashboard on the start page is untested. |
| An Automations row on every tab | yes | Pages no tab lists show under every tab (cowork-shell client.js: claimed and shared). |
| Open the app's own task editor from Plus | partly | layout.selectPanel('schedules') works (dsh-automations client openPanel). Opening one specific task is unknown: the right-sidebar 'scheduleTask' tab needs a session id. |
| Create, edit, pause, resume and delete tasks from an add-on | yes | schedule.create, edit, catalog, history and deleteInactive. Finance uses create and edit (HANDOFF 0.29 facts). |
| Notice every change, to keep a copy of deleted automations | yes | schedule/changed is emitted after every write, including archive stops (removeRows). A catalog diff shows what went. Making one again gives a new id, and the old delivery history is lost. |
| Know the tab an automation was created in | partly | Tasks made by the model record the calling conversation in involvedSessionIds (create with actorSessionId), and Modes knows its mode. Tasks made on the app's page record none. Older tasks are unknown. |
| Per-automation model, tier and access level | partly | Modes applies a mode and tier in schedule/resolve-agent (core-7) and keeps the access level per conversation (core-6, sessionSandboxBase). There is no per-task field in the app. |
| Per-automation budget | no | dsh-budget has global per-turn limits only. |
| Per-automation alerts | no | dsh-automations Config is one global set. |
| Move an old run's conversation to the trash from another add-on | no | The trash is internal to cowork-shell (TRASH_PATH browser route, connection guard). It needs the conversation archived, and it provides no service. |
| Notice that the Mac woke from sleep | unknown | The scheduler has no wake handler. powerMonitor 'resume' is used only by the Electron main process for update checks (main.js), and add-ons cannot reach it. |

### To try in the lab before building

- **What the app does when it reopens: a recurring automation missed several times, a missed one-time automation, and one that writes into an existing conversation** Why: The plan's Missed list and 'no catch-up' rest on it. Plus may also miss a run delivered before it loads. How: Lab web version, throwaway DSH_HOME, mock model. Make an every-60-s task, a minutely RRULE task and an 'at' task. Stop the lab server by PID for 5 minutes, then restart it. Read catalog() and history() (receipt scheduledAt and deliveredAt), runs.json and the mock's request log.
- **Skipping missed runs at start with an edit {active: true} before the app delivers** Why: The clean way to honour 'nothing runs after the app was closed' (question 3, option 1). How: A test add-on in the lab profile makes the edit as soon as the schedule service appears. Repeat trial 1 five times. Expect no receipt, no new conversation, the next time in the future, and no mock request. Note any [SCHEDULE CHANGE] notices.
- **Stopping a late run at its first step (agent/pre-step)** Why: The fallback for 'no catch-up', and a candidate hold point for the queue. How: A test add-on refuses the first step of a run whose occurrence_at is late. Check for turn/end 'blocked' and no mock request, and see what stays: the message, the receipt, Plus's record. Then let the next run of a reused conversation happen, and read its request with MOCK_DUMP to see whether the old instruction is repeated.
- **When the scheduler delivers a task that fell due during Mac sleep** Why: Decides whether the 'Missed' rule can also cover sleep. How: Only with the owner present and his OK, in the lab profile, never his app. Set a task due in 5 minutes, run pmset sleepnow, wake after 10 minutes, and compare the receipt times.
- **The right tab and tier on the first step, for each destination kind (new, new_once, session)** Why: Question 2 and core-7. For 'new', the catalog hides which conversation is being opened. How: Use MOCK_DUMP on the first request. Try to identify the automation in schedule/resolve-agent from the due 'new' tasks at that moment, or through a per-task agentPreset. Use a Finance brief as the control, since its claim lands at the inbox splice.
- **Where a queue can hold a run** Why: Holding inside the scheduler's hook freezes its single queue (code). Confirm this, and test holding at the first step. How: A test add-on holds for 2 minutes, first in resolve-agent, then at agent/pre-step. Meanwhile edit a task on the app's page, press Run now on another, and archive a conversation. Record what hangs, Budget guard's minutes, the app's 'running' state and the task's slot.
- **Run now on a paused task** Why: File and chain automations could be stored as paused app tasks that Plus starts. How: Pause a task on the app's page, then call schedule.run from a test add-on. Check that it is delivered, stays paused, gets a receipt, and how the app's page shows it.
- **Passing extra text into a run** Why: Chains hand over a result, and file triggers name a file. How: Compare editing the prompt and then running against adding a follow-up message right after delivery. Read what the model receives (MOCK_DUMP) and what the app's record saves.
- **Watching a folder on macOS** Why: For the file trigger rules: wait until stable, never fire on its own files, list files that came while the app was closed. How: fs.watch on a temp folder. Write a file slowly, rename one, copy one in from Finder, let the run write one, and add one while the lab is stopped. Compare with a saved listing at start.
- **The Automations tab's dashboard on an add-on tab's start page, and the tab name** Why: Plan steps 2 and 16: space and scrolling, and 'Automations' in the 3-column grid with nine tabs. How: A stub add-on mode with tiles and cards at 1280x860 and narrower. Screenshot the sidebar with every add-on on.
- **An old run's conversation to the trash, from a server-side service** Why: For keeping runs by time or count (question 4). How: Archive a 'new' run conversation, move it with a trash service, then Put back. The automation and its other runs must stay untouched. Check what the app's receipt link shows.
- **Opening one specific task in the app's editor from Plus** Why: For 'Open in the app's editor' (question 1). How: Try layout.selectPanel('schedules') with a task selection, and the right-sidebar 'scheduleTask' tab.
- **A recurrence engine for Plus** Why: The Missed list, the tiles and the timeline need past and future times. Plus has none, and no add-on loads app packages today. How: Check whether an add-on can load the app's dsh-util-time or rrule at run time. If not, ship a small engine. Compare its next time with the app's scheduledAt for all seven kinds, including a daylight-saving change.

### Steps

**Step 88. A1. Name the automations that an archive or delete would remove (bug fix)** (size S)

- What: When the app refuses an archive because an automation still writes into the conversation, the Cowork sidebar's question names those automations and says they will be deleted for good and cannot be put back. It no longer says only 'still working'. Plus reads the names from the refusal's activity list (kind 'schedule').
- Add-ons: dsh-cowork-shell
- Tests: Unit test for the question text with turn, job and schedule activity. Lab: a this_session automation, then archive and delete, and the question names it; with Cancel, nothing changes.
- What could break: The refusal's activity shape is read from the app's docs; confirm it in the lab.
- Needs first: None: wording only, a clear bug. Tell the owner.
- Cannot be verified before you try it: The Mac app's native confirm dialog look.

**Step 89. A2. Mark late runs on the existing Automation runs page** (size S)

- What: Read occurrence_at from the scheduler's message. Mark a run 'Ran late: due 09:00, ran 10:42', and say 'when the app opened' when Plus's own heartbeat shows the app was closed. Fix the README: describe catch-up, and say 'in the Dock' instead of 'in the menu bar'.
- Add-ons: dsh-automations
- Tests: Unit tests: scheduledTasks returns occurrence_at for single and batch messages; the late threshold; Run now is never late. Lab trial 1.
- What could break: A run that waited for a busy reused conversation also shows as late, so the wording must not blame a closed app unless the heartbeat proves it.
- Needs first: Lab trial 1
- Cannot be verified before you try it: Behaviour after Mac sleep, without lab trial 4.

**Step 90. A3. List missed times, with Run now** (size M)

- What: A heartbeat file and a recurrence engine (lab trial 13) list the times between the last delivered occurrence and the late one as 'Missed', each with Run now. Additive: the app's catch-up is not touched.
- Add-ons: dsh-automations
- Tests: Unit tests: occurrences for all seven kinds, the fold, a daylight-saving change. Lab: trial 1 shows the right missed times.
- What could break: Run now runs the instruction now, not for the missed time. Say so beside the button.
- Needs first: A2, lab trial 13
- Cannot be verified before you try it: Sleep gaps, without lab trial 4.

**Step 91. A4. Record the tab each automation was created in** (size S)

- What: On schedule/changed, new task ids get a 'created in' tab. Model-created tasks take it from the mode of their first involved conversation. Tasks made in Plus's own screens take it from the tab you came from. Others show 'not known'. Nothing is shown yet.
- Add-ons: dsh-automations, dsh-modes (read only: modes.get)
- Tests: Unit tests for the diff and the source rules. Lab: schedule_create in Finance and in Cowork.
- What could break: None to built behaviour.
- Needs first: None (additive)
- Cannot be verified before you try it: Tasks made on the app's own page get 'not known'.

**Step 92. A5. The Automations tab, with tiles** (size M)

- What: An add-on mode 'automations' with its own tab. It is left out of 'Mode for scheduled tasks', and its chat has only the schedule tools for now. Its start page shows tiles: switched on, ran today, missed, failed, next run. The existing pages and rows stay as they are.
- Add-ons: dsh-automations, dsh-modes (mode list and scheduledChoices exclusion), dsh-cowork-shell (default greeting and New label for the tab)
- Tests: Unit tests for the tile counts, the scheduledChoices exclusion and the tab order. Lab trial 10.
- What could break: A ninth tab with every add-on on. A mode id 'automations' must not clash with the add-on's settings namespace.
- Needs first: Plan step 2 (tab icons), or the owner accepts the cut label until then; lab trial 10
- Cannot be verified before you try it: The look in the Mac app.

**Step 93. A6. Automation cards** (size M)

- What: One card per automation: its trigger in plain words (RRULE, Cron, daily, weekly, every, at, after), its tab (from A4, or the scheduled mode), its last result, its next run, and an on/off switch (pause and resume through the app). Runs shared by several automations are marked 'together with'.
- Add-ons: dsh-automations
- Tests: Unit tests for the plain-words texts of each kind and the batch marks. Lab: pause and resume from a card shows on the app's page.
- What could break: Resuming jumps to the next future time; the card must say so.
- Needs first: A5
- Cannot be verified before you try it: Complex RRULEs fall back to the rule text.

**Step 94. A7. Detail panel for what the app stores** (size M)

- What: Instruction, trigger, destination, folder, past runs (Plus's record plus the app's receipts), Delete with a question that says it is final, and 'Open in the app's editor'.
- Add-ons: dsh-automations
- Tests: Unit tests for the edit patch with expectedUpdatedAt and the conflict text. Lab trial 12.
- What could break: Edits race with the app's page; the conflict case must be shown.
- Needs first: A6
- Cannot be verified before you try it: Opening one specific task in the app's editor, if lab trial 12 fails.

**Step 95. A8. Automations row on every tab, retire the two Cowork rows** (size S)

- What: Do as the owner chose in question 1. Remove 'schedules' and 'automations' from the Cowork default pages, add an unclaimed 'Automations' row that opens the tab, and add a one-time carry-over only if a hand-edited layout lists them.
- Add-ons: dsh-cowork-shell, dsh-automations
- Tests: Unit test of the layout default and the carry-over. Lab: the row shows on every tab and the app's editor opens from the tab.
- What could break: Shared Settings may sync the layout to a second Mac.
- Needs first: Owner answer to question 1 (sidebar rows)
- Cannot be verified before you try it: A hand-edited layout in the owner's config, which must not be read.

**Step 96. A9. A tab per automation, and a filter by tab** (size M)

- What: A per-automation tab stored by Plus. Applied in schedule/resolve-agent for new_once, and for 'new' if lab trial 5 finds a way. Finance's switches show and set the same value. scheduledMode stays the default. Recon is never offered. Filter the cards by tab.
- Add-ons: dsh-modes, dsh-automations, dsh-finance
- Tests: Unit tests for the precedence: the automation's tab, then Finance's claim, then scheduledMode. Lab trial 5 with MOCK_DUMP on the first request.
- What could break: Changes how core-7 and core-16 work. Finance's claim timing.
- Needs first: Owner answer to question 2, lab trial 5, A4
- Cannot be verified before you try it: The tier on the first step for 'new' automations, if lab trial 5 finds no way.

**Step 97. A10. Deleted automations to the trash** (size M)

- What: Keep a copy of each automation that disappears from the catalog (deleted on any page, by the assistant, or by an archive) for 30 days, with Put back (which makes it again) and Delete permanently.
- Add-ons: dsh-automations, dsh-cowork-shell (trash list)
- Tests: Unit tests for the snapshot, re-creating and expiry. Lab: delete on the app's page, Put back, and it runs again.
- What could break: An automation re-created into an archived conversation is refused; offer a new conversation instead.
- Needs first: Owner answer to question 7 (deleting automations); plan step 1 (trash with a server-side service)
- Cannot be verified before you try it: The old delivery list cannot be restored.

**Step 98. A11. Keep runs by time or count** (size M)

- What: A per-automation keep rule with starting values from how often it runs. Plus's record drops old runs. For 'new' runs, the run's conversation is archived and moved to the trash through the trash service. Shared conversations are never touched. Plus's global 200-run limit and its line on the page change.
- Add-ons: dsh-automations, dsh-cowork-shell (trash service)
- Tests: Unit tests for the keep rules and for shared conversations being skipped. Lab trial 11.
- What could break: Archive refusals while a run is still working; skip and retry.
- Needs first: Owner answer to question 4; plan step 1 with a trash service; lab trial 11
- Cannot be verified before you try it: Large records over months (write cost of runs.json).

**Step 99. A12. No automatic catch-up (as the owner chose)** (size M)

- What: Option 1: at start, an edit {active: true} on each overdue recurring automation, and one-time ones paused, all listed as Missed. Option 2: keep the A2 label only.
- Add-ons: dsh-automations
- Tests: Lab trials 2 and 3 repeated after the build. Unit tests for which automations are skipped.
- What could break: Change notices to involved conversations. Paused one-time automations must be visible as such.
- Needs first: Owner answer to question 3; lab trials 2 and 3 (and 4 for sleep)
- Cannot be verified before you try it: Timing races on a slow start in the Mac app.

**Step 100. A13. The queue** (size M)

- What: Automations run one at a time, held at their first step (not inside the scheduler). A run waiting for you steps aside if the owner chooses that. A 'Waiting in the queue' mark shows on cards and runs.
- Add-ons: dsh-automations, dsh-budget (held time must not count as minutes)
- Tests: Unit tests for the queue order and the step-aside rule. Lab trial 6, with two 'new' automations due together.
- What could break: Changes when runs start (built behaviour). A held turn counts as running for the app.
- Needs first: Owner answer to question 5 (queue); lab trial 6
- Cannot be verified before you try it: Behaviour with a real local model under load.

**Step 101. A14. Chain trigger** (size M)

- What: 'When automation A finishes' starts B with A's result. It never starts after a failure, refuses loops, and shows what it is waiting on. Stored as the owner chose in question 6.
- Add-ons: dsh-automations
- Tests: Unit tests for loop refusal, waiting on failure and batch runs. Lab trials 7 and 8.
- What could break: The result hand-off changes the stored instruction if edit-then-run is used.
- Needs first: Owner answer to question 6; A13; lab trials 7 and 8
- Cannot be verified before you try it: Long chains overnight.

**Step 102. A15. File trigger** (size M)

- What: Watch a chosen folder. Wait until a file is stable, ignore files the automation wrote, list files that came while the app was closed with 'Run for these'.
- Add-ons: dsh-automations
- Tests: Unit tests for the stability timer, the own-writes list and the snapshot comparison. Lab trial 9.
- What could break: Many files at once means many runs; rate-limit through the queue.
- Needs first: Owner answer to question 6; A13; lab trial 9
- Cannot be verified before you try it: Files written by shell commands inside a run cannot be told apart.

**Step 103. A16. Timeline with Day, Week and Month** (size M)

- What: One lane per chain. Runs marked done, missed, failed or upcoming, a 'now' line, arrows between chained automations, and 'Watching' lanes for file triggers.
- Add-ons: dsh-automations
- Tests: Unit tests for lane layout and future times from the engine (A3). Lab screenshot at 1280x860.
- What could break: Future times for complex RRULEs depend on the engine matching the app.
- Needs first: A3, A14, A15
- Cannot be verified before you try it: Readability with many automations.

**Step 104. A17. Alerts per automation** (size S)

- What: Per-automation alert choices on top of the global Settings > Alerts, which stay the default.
- Add-ons: dsh-automations
- Tests: Unit tests for the precedence. Lab test alert per automation.
- What could break: Must fit with Long run alerts (gap A1, plan step 11): one place for both.
- Needs first: A7
- Cannot be verified before you try it: A real phone.

**Step 105. A18. Model, Web level and file permission per automation** (size M)

- What: Applied when the automation's own conversation opens, as the owner chose in question 8. Never above what the tab allows (Data and Research read-only).
- Add-ons: dsh-automations, dsh-modes, dsh-model-tiers
- Tests: Unit tests for the precedence and the caps. Lab: first request (MOCK_DUMP) carries the chosen model; the access level is right.
- What could break: core-6: never overwrite a level picked by hand.
- Needs first: Owner answer to question 8; A9
- Cannot be verified before you try it: 'new' automations, if lab trial 5 failed.

**Step 106. A19. Depth, Lens and Scratch per automation** (size M)

- What: Depth (Fast, Standard, Thorough; not Long run unless asked), Lens, and the place: a folder or one hidden Scratch folder per automation.
- Add-ons: dsh-automations, dsh-modes, dsh-cowork-shell
- Tests: Unit tests for the stored recipe. Lab: the Lens and Depth notes in the run's request.
- What could break: The Scratch clean-up must skip folders that automations use.
- Needs first: Plan steps 4, 5 and 7; owner answer to question 9 (Scratch)
- Cannot be verified before you try it: Long run as an automation, which is left out until the owner asks.

**Step 107. A20. Budget per automation** (size M)

- What: A per-automation allowance using the same per-conversation allowance Budget guard gets for Long run.
- Add-ons: dsh-budget, dsh-automations
- Tests: Unit tests for the allowance precedence. Lab: a run stops at its own limit with the Stopped card.
- What could break: Two allowances must not double-count helpers.
- Needs first: Plan step 11 (Budget guard fit for Long run)
- Cannot be verified before you try it: Token counts of providers that report no usage.

**Step 108. A21. The tab's chat manages automations** (size M)

- What: The Automations mode's chat creates and changes automations. A change to several automations first shows a card listing what will change, and nothing is written before you confirm.
- Add-ons: dsh-automations, dsh-modes
- Tests: Unit tests for building the card and refusing without confirmation. Lab with the mock model calling schedule_edit on two tasks.
- What could break: Edits race with the app's page; use expectedUpdatedAt.
- Needs first: A7, A17-A19 for the full recipe
- Cannot be verified before you try it: Real model wording.

**Step 109. A22. The tab's chat answers questions about results** (size M)

- What: A Plus tool that reads run records and the run conversations' final answers. It never reads isolated (Recon) conversations.
- Add-ons: dsh-automations
- Tests: Unit test for refusing isolated conversations. Lab: 'what did the morning brief say on Monday?'
- What could break: Privacy: read only conversations created by automations, unless the owner widens this.
- Needs first: A21
- Cannot be verified before you try it: Answers over months of runs.

**Step 110. A23. Improve** (size M)

- What: A model rewrites an automation's instruction from its failed runs. The change is shown with what would be sent, written only after your approval, and earlier versions are kept with Put back.
- Add-ons: dsh-automations
- Tests: Unit tests for the version store and for keeping the opening sentence and title prefix of Finance briefs. Lab with the mock model.
- What could break: Rewriting a Finance brief's opening sentence slows Finance's recognition; keep it.
- Needs first: A21
- Cannot be verified before you try it: The quality of the rewrites with a real model.

