# Left panel

Add-on `@local/dsh-cowork-shell` (dsh 0.2.2-rc.1). It replaces the app's left sidebar with the Plus left panel:

- **Five space buttons** at the top: **Chat**, **Code**, **Devices**, **Recon** and **Workshop**. A space is where a thread lives; each space has its own thread list, New button, Archived and Trash. Devices, Recon and Workshop show while their add-on is on.
- **One New button per space:** New chat, New code task, New device task, New Recon search, New workshop task.
- **Fixed rows** in every space (Projects, Artifacts, Automations, Plugins), then the rows of the space (for example Connectors and Skills in Chat and Code), then the **More** menu.
- **The thread list** of the space: in Chat, **Chats** (standalone threads) and **Projects** (your folders); in the other spaces, threads grouped under their project.
- **Settings** at the bottom, unchanged.

It keeps the app's colours, icons, brand, collapse-to-rail, the narrow-window drawer and, on the Mac desktop app, the strip beside the window buttons. The Mode list under the chat box (from the Modes add-on) sets how a thread works; changing the mode never moves a thread to another space.

How the space buttons, rows and lists work is in the item 4A sections near the end of this file ("Space buttons" onwards).

> **The old tab layout.** Before item 4A this add-on showed mode tabs (Chat / Cowork / Code and the modes other add-ons added) instead of spaces. That layout now shows only with `DSH_SPACES_LAB=0` (a lab or a test). The sections "What a tab does" to "Preset in this tab" describe it, and they also explain settings that are still read (`tabs`, `maxTabs`, `tabOrder`, the stored tab of a deleted thread).

## What a tab does (old tab layout)

The tab you pick decides the mode of every **new** thread, and the Chat / Cowork / Code drop-down disappears from the chat box while this left panel is on.

- A thread that has not sent a message yet follows the selected tab. This includes the empty thread the app re-opens for "New chat", even if it had a different mode chosen on it earlier.
- At its first message, its mode is fixed to that tab's mode.
- Threads that have already started keep their mode when you change tabs. To change one anyway, type `/mode <id>` in it.

This needs the Modes add-on. Without it, the tabs only switch which sections show. How it works: this add-on provides a small `coworkShell` service, and Modes checks for it. Modes reads a thread's internal turn counter to tell whether it has started. If a future app version hides that counter, Modes treats every thread as started, which is the old behaviour.

## Chat tab: no folders (old tab layout, only with `DSH_SPACES_LAB=0`)

Chat is for a thread that lives on its own, not for work in a project folder. So on the **Chat** tab:

- **No pickers on the start page.** The "Default workspace" and "Standard mode" buttons above the chat box are hidden. Cowork and Code still show them.
- **New chat always starts in the app's default workspace** (the folder named `default-workspace`), even if a project thread is open. The suggestion chips and the Mac's hidden-sidebar "new" button follow the same rule.
- **One flat list.** Recent chats show as a single list, pinned first, then newest first, with no project folders. The chats started in Scratch (Chat's default start place) are in this list with the others; Chat has no separate Scratch group. Like every tab, the list also shows the open blank draft as "New thread" until you send its first message. Cowork and Code keep their project groups.
- **Promote.** The `⋯` on a chat offers:
  - **Promote to Cowork / Promote to Code**: the same thread moves to that tab, and its mode switches from its next message. It stays in the default workspace, because this app version cannot move a thread to another folder.
  - **Continue in a project…**: pick Cowork or Code (Code by default) and one of your projects. A **new** thread opens in that project, on that tab, with the chat box filled in with a short line that mentions the chat the app's own way (`@[title](dsh-session:…)`). When you send it, the app attaches a read-only copy of the chat for the model, and the message shows "Referenced session". The original chat stays where it is.

Details:

- The pickers are hidden only while the Chat tab is open **and** the open thread is in the default workspace (or nothing is open). If you start a thread in another project while on the Chat tab (the app's own New Session shortcut can do this, or `+` under **Show all**), the pickers show, so you can see where you are.
- If the app has no `default-workspace` project, nothing is hidden and New chat behaves as before.
- The folder picker is hidden with CSS, by the app's seat name (`conversation.hero.workspace`). Switching the add-on off removes it.
- The preset picker (Standard, PTC, Minimal, Creator) is **not** hidden (since 0.20). It was hidden from 0.10 to 0.19, which left a new chat on the app's default preset with no way to see or change it. The preset decides how the model calls tools, and the app fixes it when a thread starts: the label at the top of a started thread is text, not a control.
- A thread now shows in its tab's list right after its first message. Before, it could drop out of the list for up to 10 seconds.

## Threads per tab

Each tab lists only its own threads: **Recent chats** under Chat, **Recent tasks** under Cowork, **Code projects** under Code.
- Threads are grouped under their project; a project appears in a tab when it has at least one thread of that tab.
- Threads outside any project come after, under "Other threads".
- Pinned threads come first, then newest first. Archived and helper (sub-agent) threads are hidden, as in the app's own list. An empty new thread shows only while it is open.

**Which tab a thread belongs to** is the mode it runs in (recorded by the Modes add-on at its first message). Threads from before that was recorded are placed by where they live:

| Where it lives | Tab |
| --- | --- |
| no project | Chat |
| the app's `default-workspace` | Cowork |
| any other project folder | Code |

**Moving:** the `⋯` button on a thread moves it to another tab (on the Chat tab the same entries read "Promote to …", see above). The `⋯` on a project moves all its threads. Moving also switches the thread's mode from its next message, so the tab and the mode always agree. The `+` on a project starts a new thread in it.

**Needs you:** when a thread waits for you (an approval, a plan review or a question), a **Needs you (n)** block appears at the top of the list, on every tab. It names the thread and what it waits for; clicking opens it at the question. The thread's row shows an amber dot instead of the running dot. It reads the app's own status (`uiSession.sessionStatus`), the same one the app's sidebar uses, and shows nothing when that is unavailable. Answering stays in the app's own dialog.

**Archiving:** the same `⋯` on a thread has **Archive**. It uses the app's own archive: the thread leaves the list and nothing is deleted. One that is still working asks before it is stopped and archived. Archiving the open thread starts a new one. Each tab ends with **Archived (n)**; open it to see that tab's archived threads, each with **Restore**.

**Deleting:** the app has no way to delete a thread, so this add-on adds one. **Delete** is in the same `⋯` menu and next to **Restore** in the Archived list. It asks first, archives the thread, then moves its files (and those of its helper threads) out of the app into `<app data folder>/trash/conversations`. Each tab ends with **Trash (n)**: the threads deleted from that tab (since 0.58.0; before, every tab listed all of them), the days each has left, and **Put back**, which returns it to the Archived list. The tab is kept with the thread when it is deleted (`tab` in `info.json` and `pending.json`), so a Recon thread's title stays under Recon. One deleted before 0.58.0 shows under its recorded tab when Modes still has it, otherwise under every tab, so nothing deleted is out of reach; one whose tab is not shown now (a mode removed, an add-on switched off) shows under the tab its folder gives (kept as `fallbackTab`), else the first tab, as the Archived list does (`trashTab` and `inTabTrash` in `client.js`). After 30 days a deleted thread is removed for good; the add-on checks at start and a few times a day. Since 0.58.0 a thread in the trash keeps its tab and its choices (and a Recon thread its isolation) when it is put back after a restart: Modes and Model tiers no longer prune them while it is in the trash. A Recon thread ended with `/recon end` never goes to the trash (since 0.58.0): the trash refuses it, the Archived list shows it as "Being deleted" without Restore or Delete (the right-click menu offers neither), and Recon deletes its files for good. A thread waiting to move whose files are gone (neither open nor stored, checked twice a moment apart) leaves the Trash list at the next tidy-up, with a line in the log, instead of staying there for good (since 0.58.0; `tidyPending` in `lib/trash.js`). When an automation delivers into the thread (one that reuses a single thread), the app refuses to archive it, and archiving it anyway deletes that automation and its past runs for good; since 0.58.0 the question names the automation and says so, instead of only "still working" (`stopQuestion`, from the refusal's `details.activity`). **The shared trash** (since 0.59.0, for later steps of the plan): other add-ons can put their own things in this trash through the `coworkTrash` service, for example all old runs of one automation as one row, or a deleted automation's recipe. Each thread stays its own record, so everything above holds for each of them; a row's title, count and date range come from its records, and its days left from the oldest. The service archives a thread itself only when that is safe (never one that is working, pinned, or that an automation delivers into) and undoes that archive if the move fails. A row with kept data is put back by the add-on that owns it, and cannot be put back while that add-on is off. Nothing outside the trash folder is ever removed; moving folders into the trash stays off until the Scratch questions are answered. Owners register inside `ctx.inject(['coworkTrash'], (c) => { const handle = c.coworkTrash.register({owner, label, putBack, onNotice}); c.effect(() => () => handle.dispose()); })`, so they register again whenever the Left panel restarts; then `handle.add({key, title, tab, threads: [{id, archive: 'plus'|'already'}], data})`, `handle.items()`, and `coworkTrash.find(id)` to learn whether a thread is in the trash and in which row. The 30 days always count from the moment something enters the trash. Delete permanently and Empty trash on a row erase only what the list showed; anything added to the row since stays.

Since 0.58.0 each Trash row has two lines: the title, then the days left, **Put back** and **Delete permanently** (on one line a 280-pixel left panel left one letter of the title). **Empty trash** (since 0.58.0) ends a tab's opened Trash list: after one question that names how many, it deletes permanently the threads deleted from that tab (not those already "Being deleted"); the Trash of other tabs is not touched. Older threads whose tab is not known (they show in every tab) are left, and the question says how many; delete them one at a time. Threads the app still holds open are marked and erased when it lets go of them; one that cannot be erased stays and the add-on says how many. While it runs, the rows' buttons wait (the route's `empty` action, `emptyTrash` in `index.js`, at most 2,000 per request; the left panel sends longer lists in parts, `runEmpty` in `client.js`). Put back of a thread that is no longer in the trash now says so. **Delete permanently** sits next to **Put back** on each Trash row. It asks first, and the question says it cannot be put back and that a copy may remain in a backup (such as Time Machine) or, with Sync, in the sync repository's history. Only that thread's folder inside the trash is erased, and the app's Archived list forgets it. A thread the app still holds (deleted while open, so still waiting to move) is marked instead: its row shows "Being deleted" without Put back, and it is erased as soon as it has moved, at the latest at the next start. A thread taken out of the archive while it waits to move (here or in the app's own list) is no longer deleted, at once, and its mark goes with it (the add-on listens to the app's `workspace/session-unarchiving`). The mark keeps the app's change token of the thread's file; if the file changed by the time it moves (it was taken back and used, for example while this add-on was off), it is not erased but goes to the trash with Put back. The mark is read when the files move, so a click made while the tidy-up runs still counts; if it cannot be moved or erased, the mark comes off and it is back with Put back (logged), rather than "Being deleted" for ever. A move that broke off half-way (some files still in the app's store) cannot be erased: put it back, then delete it again. After an erase the archived list forgets the id only once the app no longer stores it (`erase`, `marked`, `unmark` in `lib/trash.js`, the route's `erase` action).

- A thread the app still holds in memory (one you used since the app started) leaves the lists at once, but its files move only at the next start of the app. Until then **Put back** simply shows it again.
- Only a folder that holds a stored thread is ever moved, and only folders inside the trash are ever removed.
- Files the thread created in your project folders are not touched. The app's search index and its record of which project the thread belonged to are left to the app.
- Switching this add-on off, or uninstalling Plus, leaves the trash folder where it is; nothing in it is removed while the add-on is off.

Code: `lib/trash.js` (file moves, tested in `test/trash.test.mjs`), the `/dsh-cowork-shell/trash` route in `index.js` (GET lists, POST `{action: 'delete' | 'restore', sessionId, title}`).

**Show all** switches to the app's full list, with its search, rename, pin and archive menus. **<Tab> only** switches back. Each window remembers the choice.

The list reads the app's own project and thread data in the browser. If that data is not available (a different app version), the left panel falls back to the app's full list.

## Start page

- **Greeting per tab** instead of "Into the Unknown":
  - Chat and Cowork: "Let's knock something off your list"
  - Code: "What should we build?"

  The greeting sits in the start page's logo seat, and the stock title next to it is hidden only while a greeting shows. A tab with an empty greeting shows the stock title.
- **Suggestion chips** under the chat box, each with an icon: Create slides, Build website, Develop apps, Spreadsheet, Visualization, Wide research, Create games (Cowork and Code tabs). A chip fills the chat box with a starter prompt to finish and send. Chip icons: `slides`, `website`, `app`, `spreadsheet`, `chart`, `research`, `game`, `spark`.
- **New chat / task / code task** is drawn in the scheme's accent colour, with the app's own New Session shortcut as a badge (shown only when the app exposes one).
- In narrow windows the greeting wraps, and the chat-box buttons shrink to icons.
- The **Web**, models and **Tools** buttons in the chat box come from the Modes add-on.

**Logos, date, tab names and width.** The left panel's **More** menu ends with four switches, saved with your settings:

- **Hide DeepSeek logos / Show DeepSeek logos** (`hideLogos`): removes the logo and name at the top of the left panel and the logo on the start page.
- **Show the date as the title / Show the greeting as the title** (`dateTitle`): the start page title becomes today's date, written like "11 November, 2026" (always in English). It replaces the greeting on every tab.
- **Wide chat area / Normal chat area** (`wideChat`): the app keeps the thread and the message box in a centred column about 800 pixels wide. This lets both use the width of the window (with a margin). The start page keeps its own size. It works through two CSS rules on the app's own class names (`_scrollBody` › `_column`, `_composerStack` › `_card`), so a later app version may need them adjusted.
- **Icon alone when a tab name does not fit / Always show tab names** (`iconOnlyTabs`): off by default, every tab keeps its name and the tabs wrap onto more rows; on, tabs sit in rows of three and a name that does not fit shows its icon alone.

All four are off by default. They do not change the app's icon, its window title or logos drawn by other parts of the app.

Change greetings and chips per tab with `greeting` and `chips` in the tab layout:

```yaml
- id: cowork-shell
  config:
    tabs: '{"cowork":{"greeting":"Hi, what are we doing today?","chips":[{"label":"Plan my week","prompt":"Help me plan my week: "}]}}'
```

Fields you leave out keep their defaults.

## Pages

- **Connectors** lists your MCP servers. In this app version, each server is one `@deepseek-ai/dsh-mcp-client` row. For each server the page shows:
  - what it runs or the address it reaches (no keys, tokens or secret-looking arguments)
  - whether it is on
  - how many tools it has registered right now ("Connected · N tools", or "No tools yet" while it starts or if it failed)

  The switch uses the app's own plugin on/off (the same one the Plugins page uses) and applies live. **Add a connector** is a form that writes the connector for you ("Write it for me"):
  1. You fill in plain fields: a name, how it starts (a program on this Mac with its arguments, or a web address), and optionally a key it needs (what the connector calls it, and the key).
  2. **Show what will be added** checks the fields (plain problems, no guessing) and shows the exact lines and the file they go to (`<app home>/profiles/<profile>/cordis.patch.yml`; the running app's own profile folder).
  3. **Write it for me** then: refuses to go on if the file already cannot be read (it names the line and touches nothing); keeps a copy of the file in `<app home>/backups/connectors/`; tries the old file and the new text with the app's own `dsh --profile web --dump-config` in a throwaway app home (never the real one, with Recon's room pointed away); keeps a key in the app's secret store; writes the file in one step (temporary file, then rename) and reads it back. If the program for the app's own check is not found, nothing is written and the person is told to paste the lines by hand.
  4. It then says **Restart needed**: the app reads the file only when it starts. The app gives an add-on no way to restart it (checked in 0.2.2-rc.2: the "Restart App and Host" item exists only in development builds), so the page tells the person to quit with Cmd+Q and open it again. Until then the connector shows as "Added, starts after a restart".
  A key never goes into the file: the row says `expandTemplates: true` and `${credential:DSH_CONNECTOR_<NAME>_KEY}`, and the value is in the app's secret store (the same store as Settings → Web sources, "Other sources", when it keeps a secret in the app). A Keychain item cannot be named in a row, so connectors use the app's store only. Nothing a page sends is ever pasted into the file as it is: the lines are made from checked fields (a web address must be https, except a program on this Mac).
- **Skills** is a searchable, read-only list of the skills found for your default folder, read the way the app's own "/" menu reads them for a new thread ("Standard mode"). A project can add its own skills on top.
- **Model arena** is the arena's page as a full page. That page comes from the Model arena add-on.

Data comes from two read-only routes, `GET /dsh-cowork-shell/connectors` (it also names connectors written to the settings file but not started yet) and `GET /dsh-cowork-shell/skills`, plus the one writing route `POST /dsh-cowork-shell/connectors/write` (`preview` and `write`), all behind the app's login and Host/Origin check, GET only and never cached. They serve names, descriptions, file paths and tool counts, never skill bodies, keys or environment values.

## Switching it off

On the **Plugins** page, switch **Left panel** off. The normal sidebar comes back at once; no restart is needed. Switching it on again works the same way.

The app must never run both sidebars at once, because it would not load. So the add-on does two things:

1. Its patch switches the app's own sidebar row (`ui-sidebar`) off.
2. The Left panel row switches itself on **only while** `ui-sidebar` is off.

The app reads `ui-sidebar` before this row, so rule 2 always sees its current state. Turning the app's own "Sidebar" row back on therefore also brings the normal sidebar back, and the Left panel stays out of the way.

**Left panel guard (1.0, review H2).** Switching off only the Left panel's own row (on its details page) used to leave the app's sidebar off too: no sidebar at all. Now the Modes add-on (always on) looks at the two rows every 5 seconds through the app's plugin manager and, when it sees the same wrong state twice in a row, puts it right: both off → the app's own sidebar is switched on (about 10 seconds); both on (the Cowork row switched back on while the app's own sidebar is on, which the app cannot load) → the app's own sidebar is switched off, and the Left panel shows. So the inner row now works as a normal two-way switch and nobody is left without a sidebar. It writes an explicit `ui-sidebar` row into the profile's own settings file, the same row the Plugins page writes. The bundle's main switch still works as before. If the guard cannot run (Modes switched off too), run `Uninstall.command`, or remove the `cowork-shell` lines from `~/.dsh/profiles/desktop/cordis.patch.yml`. Tested in the lab (web profile) both ways; not tried in the desktop window of the real app.

## Configuration (optional)

```yaml
- id: cowork-shell
  config:
    # Which pages each tab lists, by page id, and the New button's label. JSON text.
    tabs: '{"chat":{"newLabel":"New chat","pages":["model-arena"]},"cowork":{"newLabel":"New task","pages":["schedules","automations","connectors","skills"]},"code":{"newLabel":"New code task","pages":["connectors","skills"]}}'
    maxTabs: 3        # 1 to 5; the first modes in order. A mode another add-on adds (Finance) gets a tab after these, whatever the limit
```

Page ids: `schedules` (Automation tasks), `automations` (Automation runs, from the Automations add-on), `plugins`, `model-arena` (from the Model arena add-on), `connectors` and `skills`. Pages that no tab lists show under every tab. A page whose add-on is not installed is simply left out.

## Scratch: threads with no folder of yours

**Scratch** is a private place for threads that should not land in a folder of yours: one hidden project at `<app data folder>/scratch`, where each thread works in its own sub-folder (`scratch/<thread id>`, open to you alone).

- **Where new threads start.** By default every space except Code starts in Scratch; Code starts in a folder (the open or last used project); Recon always starts in its own room. Change any space in **Settings → Start places** (the same setting as each space's card on Settings → Spaces). On every start page (except Recon's) a small **Scratch | Folder** switch starts the other way once, without changing the space's setting. Cmd-N follows the open space's start place (a switch on the same page turns that off). The suggestion chips stay in Scratch while you are in Scratch.
- **What you see.** Each space's list except Chat's has a **Scratch** group (with **Clean up…**) above "Other threads"; in Chat the Scratch threads are listed under **Chats** (since item 4A stage 0, 22 November 2026: before, they were left out of Chat's list); a dashed **Scratch** mark sits in the chat box; Show in Finder opens the thread's own folder. The Chat space hides the folder picker in Scratch too. Plus's own project lists never show the Scratch project; the app's own folder picker does.
- **Its folder.** The sub-folder is made at the first message, so a thread nobody wrote in leaves nothing behind; clicking Scratch twice reuses the same empty thread. The assistant cannot move the working folder out of it (the app's working-folder tool is refused with a short reason); helpers are kept to it too. A folder removed by hand is made again, empty, at the next message. Files you drop into the thread are copied into it (a different file with the same name becomes "name 2"), so Data and the PDF reader can open them; the app keeps its own copy of every dropped file in its attachment store, which deleting the thread cannot remove. The app's Fork of a Scratch thread gets its own folder, starting as a copy of the files (up to 200 MB).
- **Access level.** A Scratch thread starts at Workspace Write at most, also with a Full access preset, so nothing it does lands in a folder of yours. A mode that sets a lower level still sets it; Full access you pick by hand afterwards stays.
- **Delete.** Delete moves the thread and its folder into the trash together; Put back returns both; Delete permanently, Empty trash and the 30 days remove both. A folder a Rerun copy still works in stays until the last of them is deleted. Put back never overwrites: an empty folder made meanwhile gives way, one with other files stops the Put back. **Clean up…** beside the Scratch group (every tab but Chat, which has no Scratch group) moves every Scratch thread not used since a date you choose to the trash, after one question; ones still working, open or pinned are named and left alone.
- **Keep in a project.** In a Scratch thread's ⋯ menu: copies its files into a new folder of the project you pick, named after the thread, never over anything there, then continues in a new thread in that project with a mention of the Scratch one. The Scratch thread stays until you delete it.
- **What else goes with it.** When a Scratch thread is deleted for good, Research and Scout remove the reports it saved in their own report folders (never in a folder you picked yourself), Scout its postings and selection, Data its query log and the analyses saved for its folder. The trash tells add-ons through `coworkTrash.onErased(listener)`.
- **Sync** never pushes or pulls Scratch threads and never shares the Scratch project (see the Sync add-on's README).
- **For other add-ons:** the `coworkScratch` service (`isScratch(path)`, `place()`, `folderOf(agent)`). Scratch is told apart by its place, never by the app's store name for a folder, which another folder can share.
- **When something is missing,** Scratch gives way: without the Left panel's host side a thread works in the Scratch folder itself, New starts in a folder, and nothing fails.
- Not built: a warning about repeating tasks set up in a Scratch thread when it is deleted (planned with the Automations add-on).

## How it works

The left sidebar is one replaceable seat (`sidebar`) in the app's layout. This add-on's browser half fills it and declares the same inner seats the app's sidebar declares:

- `sidebar.workspaces`, `sidebar.settings` and `sidebar.footer.action`;
- the brand seats;
- `sidebar.panellist.actions` for the More menu, and the `sidebar.panel.icon` factory.

So the Projects list, Settings and every add-on's page row plug in as before. It uses the app's public services (`uiWorkspace.startSession`, `layout.toggleSidebar` and `layout.selectPanel`) and the app's UI library for icons and the menu. Each of these has a plain fallback. While the left panel is hidden on the Mac desktop app, it also fills `shell.leading` with "open left panel" and "new" buttons.

## Checked

In the throwaway web profile only, through the app's browser view:

| Check | Result |
| --- | --- |
| Fresh start | Left panel shown, app's own sidebar off, no errors |
| Tabs | Chat, Cowork and Code show their own New label and sections, with the app's icons and brand |
| A new chat started from the Chat tab | Ran in Chat mode (the model was offered no tools), and its mode was recorded (`sessionModes`) |
| The re-opened empty thread had Cowork recorded on it | Followed the Chat tab, and Chat replaced Cowork at its first message |
| Chat-box mode drop-down | Hidden while the left panel is on |
| Rapid tab clicks | The last click wins; a background refresh no longer undoes it |
| Pages per tab | Chat: Model Arena. Cowork: Automation tasks, Connectors, Skills. Code: Connectors, Skills. Plugins and More on every tab |
| Model Arena page | Rounds and blind columns shown, same as Settings → Arena |
| Skills page | Listed a test skill from the user skills folder plus a shared one; search filters. The route answers 401 without login and 405 to POST |
| Threads per tab | Each tab listed only its own threads, grouped by project. Moving a thread from Cowork to Code took it out of Cowork (11 → 10) and put it under the same project in Code, and the move was saved. **Show all** switched to the app's full list and back. Helper (sub-agent) threads stayed hidden |
| Start page | The greeting replaced the stock title, with the stock title hidden. The Code tab showed its own greeting. The chips sat under the chat box, and "Build website" filled it with "Build a website for:" |
| Connectors page | A local test MCP server (one `echo` tool) showed "Connected · 1 tool". The switch turned it off ("Off") and on again live, with the tool coming back and no restart. The add form produced exactly the row format that loaded the test server |
| Switching to Cowork afterwards | That chat stayed in Chat, and a new task started in Cowork |
| More menu | Showed the app's own items (Browse other plugins, Create your plugin) |
| Projects list, Settings | Plug in as before |
| Collapse | 56 px rail with icons and expand again |
| Narrow window | Drawer |
| Light and dark | Both checked |
| Plugins page switch, off and on live, each followed by a page reload | The right sidebar every time, never both, no "Failed to load plugins" |
| App's own sidebar row forced back on | Left panel stepped aside, app's own sidebar shown |

Chat tab changes (throwaway web profile, mock model):

| Check | Result |
| --- | --- |
| Chat tab start page | Both pickers hidden. Cowork and Code still show them |
| New chat while a Code project thread was open | Opened in the default workspace |
| Chat list | One flat list, no project folders. Code and Cowork still grouped by project |
| First message in a new chat | Ran in Chat mode, was recorded as chat, and showed in the list within about 2 seconds |
| Promote to Cowork | The chat left the Chat list and showed under `default-workspace` on the Cowork tab |
| Continue in a project… (as Code) | Switched to the Code tab and opened a new thread in the picked project with the mention filled in. After sending, it ran in Code mode (all tools, workspace-write), was recorded as code, showed "Referenced session", and its saved log held the chat's text as a read-only snapshot |
| Cowork tab `⋯` | Still reads "Move to Chat / Move to Code" |
| Browser console | No errors |

**Not checked:**

- "Continue in a project…" as Cowork (only Code was run), and with more than a handful of projects
- a chat title with unusual characters in the mention (brackets and backslashes are removed from the label)
- the app's own New Session keyboard shortcut on the Chat tab (it is the app's, so it still uses the current or most recent project)
- the Mac desktop app (window buttons, dragging the window by the left panel, the hidden-sidebar buttons)
- keyboard-only use beyond the tab arrow keys
- Windows

An earlier Connectors design targeted a newer app's live MCP manager. Your installed version (0.2.2-rc.1) does not have it, so the page was rebuilt on what this version has: one MCP client row per server, and the plugin on/off switch.

An earlier version of the on/off rule failed the live switch-on test: both sidebars ended up on and the app did not load. That rule was replaced by the one above, which passed every case.

## Since 0.33.0

- **Tabs in rows of three** (`data-many` on `.cws-tabs` now makes a three-column grid; icons stay).
- **Full name on hover** (since 0.58.0): every tab shows its full name half a second after you point at it, also in the wide left panel, where a long name is cut ("Resear…" at 264 pixels). In the wide left panel it opens above the tab, so it never covers the tabs below; in the folded rail it opens to the right, as before (the app's own tooltip, `side` and `portal` on the `Tooltip` helper).
- **Your own tab order** (since 0.58.0, the owner's choice: only the order): the pencil button beside search in the wide left panel ("Arrange tabs") turns arranging on. Drag a tab to its place, or select it and use the arrow keys (Home and End too); Escape or **Done** ends it, **Reset order** goes back to the usual order. While arranging, a click does not switch tabs and names do not pop up. Only the order changes: which tabs show stays as set by "Tabs in the left panel" on Settings → Modes. The order is kept as tab names in this add-on's settings (`tabOrder`), so Shared settings carries it to another Mac, where names it lacks are skipped; a tab not shown now (an add-on switched off) keeps its place and comes back there. `/mode` and Global search list the tabs in the same order. Which tab a thread or a Trash row belongs to is decided on the usual order, so arranging never moves them. Dragging uses pointer events on the window, not the page's drag and drop, so the app's "drop files" cover never appears; a drag ends unsaved when arranging ends or the release is not seen, and saves only a changed order (`readOrder`, `orderTabs`, `mergeOrder`, `moveId` in `client.js`; the same `orderTabs` in dsh-modes `lib/tabs.js` and dsh-search `client.js`).
- **Tab names (after 0.61.0): every tab shows its name by default.** In the wide left panel tabs are as wide as their icon and name and wrap onto more rows, so no tab is ever a nameless icon next to tabs with names (Research and Creator Plus were, below about 330 pixels). The **More** menu entry **Icon alone when a tab name does not fit** (`iconOnlyTabs`, off by default) brings back the 0.58.0 behaviour described next; **Always show tab names** switches back.
- **Icon alone when a name does not fit** (0.58.0, the owner's choice; now only with the switch above on): in the wide left panel a built-in or add-on tab whose name does not fit shows its icon alone, with the name on pointing (and as its label for screen readers). Your own modes have no icon (a small dot), so they keep their name, cut if needed. The fit is measured as if the tab were selected (bolder), so selecting a tab never changes its look; with eight tabs "Research" shows its icon alone below about 285 pixels. The exact width is used, with a small margin on the safe side, so a name is never shown cut (`nameFits`, `iconOnlyIds`, `iconOnly` in `client.js`).
- **Each tab remembers its thread.** `localStorage['dsh-cowork-shell.lastOpen']` is `{tabId: sessionId}`, written when the open thread changes. A tab click opens that thread, or the tab's start page when it is gone, archived or in the trash, or when it now belongs to another tab (`reopensIn`: its recorded mode is another shown tab; an empty draft and a thread with no recorded mode open as before). This also holds when that thread is the open one. The app shares one empty draft among tabs that start in the same place, so the draft one tab remembered could get its first message in another tab; before 18 November 2026 clicking the first tab then brought back the other tab's thread (a Scout research run showed in Chat, Finance and Devices). The memory is also written again once a draft's mode is recorded, so the tab it now belongs to remembers it. Recon's room is a place of its own (`placeFits`): the Recon tab opens only a remembered thread in its room, and no other tab opens one there. A Recon start (tab, New, chips) goes only to the room (`startRecon`, asked again twice); before 18 November 2026 a room that could not be reached fell back to the app's own choice, the open thread's folder, so a Recon start page could share a draft with Code, Data or Devices. The room is learnt up front (`learnRoom`), so a test copy's room is never used by another tab. A click's save (`defaultMode`) now runs one at a time and in order, and a background refresh that started before the save finished no longer sets the tab back.
- **Projects.** `lib/projects.js` keeps `{folder: {tab, instructions}}` in `<home>/cowork-shell/projects.json`. Route `GET/POST /dsh-cowork-shell/projects` (`?files=<folder>` lists files; `?upload=1&path=&name=` with the bytes as body copies a file in; JSON `{action: 'save' | 'forget'}`). Only folders the app lists as projects are accepted. The instructions reach a thread as the prompt section `cowork-shell:project` (order 58) when its folder is the project's folder; helper agents do not get it. The page is the main-area page `project`, opened from the gear on a project's row; it has no row in the page list. A project is made with the app's own `workspaces.create({path})`.
- **Tested in the lab (0.33.0):** five tabs in two rows; switching Chat, Cowork, Finance, Data and Code each came back to its own thread; a new project from a typed path (the web version has no folder chooser of its own: it opens the Mac's folder dialog, and a typed path is the fallback when that gives nothing); instructions saved and found in the next request; two files added, a taken name saved as "readme (2).txt". **Not verified:** the folder chooser in the desktop app, dropping files onto the page, renaming a project, the narrow rail, the Mac app.

## Since 0.38.0: project types (presets)

A Cowork project can have a **type**: ready-made instructions for a kind of work. The idea behind it: a use case gets a tab of its own only when it needs its own interface or tools (Finance, Data, Code). When it needs only different instructions, it is a project type in Cowork.

- **Shipped types:** Blank (nothing added; Cowork as before), Research, Learn, Paperwork, Plan, Write. Each is a text file in `presets/` with a small header (`id`, `name`, `description`, `tools`) and the instructions. They are written for anyone, in plain words, and tell the assistant which files to keep in the folder (for example `deadlines.md` in Paperwork, `progress.md` in Learn).
- **A type is a starting point.** Choosing one copies its instructions into the project's own instructions, which the user edits freely. The project remembers the type (`preset` in `projects.json`); the instructions that reach the assistant are still the project's own, through the same prompt section as before.
- **The project page** has a Type card for projects under the Cowork tab. For a project without a type and without instructions it is headed "What kind of project is this?", with Blank selected, so a new project behaves as before unless a type is picked. Picking a type when nothing of the user's would be lost applies it at once; otherwise the type's instructions are shown first, with "Replace mine with these", "Keep mine, only change the type" and "Cancel".
- **The user's own types:** "Save as my preset…" under the instructions keeps the current text as a type of their own (`<home>/cowork-shell/presets/my-<name>.md`, at most 40). They are listed after the shipped ones, marked "yours", and can be removed; a project that used one keeps its instructions. A file in the user's folder cannot replace a shipped type.
- `tools` names the shared tools a type can use (`data`, `finance`); `search: off` makes new threads start with Web set to Off. Both act since 0.39.0, see below.
- **Route:** `GET /dsh-cowork-shell/projects` also returns `presets`; POST actions `preset-save { name, description, tools, instructions }` and `preset-remove { id }`; `save` takes `preset`.
- Not planned in this build: interfaces of their own for Learn and Plan.
- **Tested (0.38.0):** 4 unit tests (13 in the add-on): the shipped files are complete, in order and free of anything personal; strict reading of a preset file; own presets saved, replaced, listed last, removed, and unable to shadow a shipped one; the project record keeps its type. In the test setup: a new project showed the card with Blank selected; Research and then Paperwork applied at once; after an edit, Plan showed the preview and "Keep mine" left the text; "Save as my preset" listed it as "yours" and set the project to it; removing it left the project's instructions; an older project with instructions showed the preview and Cancel changed nothing. Not tested: the folder chooser of "+ New" in the Mac app; a real model working under any of the five instructions.

## Since 0.39.0: instructions written by a model, versions, shared tools

### Generating instructions

On the project page, **Generate with a model…** opens a panel:

1. The user picks any model the app has.
2. They choose what the model may see: file names and the start of text files, or file names only.
3. The panel shows what would be sent before anything is sent: how many files, which files text is taken from, how many characters, which files were left out as secrets, and whether the folder has an `AGENTS.md` or `CLAUDE.md`.
4. It says where the model runs: on this computer, in the user's own network (with the host), or on the internet. For the internet, and when it cannot be told, a warning is shown and a box must be ticked; the server refuses the request without that tick.
5. The result is shown beside the current instructions, line by line (`+` new, `−` gone), with a separate list of ideas for the project. "Use these instructions" only puts the text into the box; nothing is saved until Save.

How it is kept safe:

- **The model gets no tools.** `lib/digest.js` reads the folder (reading only) and builds a text: the file list, then the start of text files, to fixed limits (36,000 characters in all, 2,500 per file, 40 files quoted). `ctx.get('llm').stream` is called with that one message and nothing else, so the model cannot open, change or delete anything. A test checks that building the digest changes no file.
- **Never included:** files whose names look like secrets (`.env*`, keys and certificates, names with "password", "secret", "token", "credential", database files), hidden folders, `node_modules` and build folders, and anything that is not text (by extension, and by a zero byte in the content).
- **`AGENTS.md` / `CLAUDE.md`** are sent even for "names only", marked as existing instruction files: the app already gives them to the assistant, and the model is told not to repeat or contradict them, and that the file wins where it disagrees with the type.
- The model is told that text inside the files is material to describe, not orders to follow.
- **Local or cloud** (`whereOf` in `lib/generate.js`) is read from the provider's address in the app's settings (`llm-pi-ai`, `providers[id].baseURL`): loopback is this computer; private ranges, `.local` and bare host names are the user's network; anything else is the internet. A provider without an address of its own, and the app's DeepSeek providers, count as the internet; an unknown provider as unknown, which is treated as the internet.
- Only folders the app lists as projects can be read through the route.

A model's answer is read by markers (`===INSTRUCTIONS===`, `===IDEAS===`, `===END===`); an answer that ignores them is taken whole. Thinking in `<think>` tags is dropped.

### Versions

Every saved change of a project's instructions is kept: the last 10 per project, in `<home>/cowork-shell/versions/` (one small file per project, mode 600), each with its time and where it came from (you, a type, a model with its name). **Earlier versions** lists them; "Put back" puts one into the box, and Save makes it current. The text from before versions existed is kept on the first change, so that change can be undone too.

When instructions written by a model are saved, a mark of the folder (file names and sizes) is kept. If the folder later differs by at least five files or a fifth of its files, the page says so and suggests generating again. Nothing regenerates by itself.

### Shared tools and Search

- A project whose type names `data` or `finance` gets a short pointer to those tools in its prompt section, while the Data or Finance add-on is switched on. The Type card says whether they are available and where to switch them on. The tools themselves are the same ones the Data and Finance tabs use; nothing is duplicated.
- A type with `search: off` (Paperwork) makes a **new** thread in the project start with Web set to Off: on `agent/created`, for a thread that has never run and whose Web choice was never set, `sessionWeb[id] = false` is written to the Modes settings. The user can switch Web on in the chat box.

### Route

`GET ?digest=<folder>&contents=0|1[&provider=<id>]` returns the digest's summary (never its text), the versions, the drift and where the provider runs. POST `generate { path, provider, model, contents, agreed, current }` returns `generated { instructions, ideas, model, where, sent, mark }` and saves nothing. `save` takes `by` (`you`, `type`, `model`), `note` and `mark`. Every answer carries `shared { data, finance }`.

### Tested (0.39.0)

- **Unit tests (8 more, 21 in the add-on):** the digest (quotes text, leaves secrets, hidden folders, dependencies and non-text out, changes nothing, empty folder, cut to its limit, names only); secret-looking names; how far a folder moved; the request text for a typed, an untyped and an empty project; reading tidy and untidy answers; local, network, cloud and unknown addresses; versions; the shared-tools note.
- **In the test setup**, with a stand-in model, on a folder with a README, an `AGENTS.md`, a CSV, a letter and a `.env`: the panel listed 4 files and named `.env` as left out; the request the model received held the type, the file list, the quoted files and the `AGENTS.md` rule, **no** line of `.env`, and it was offered no tools; the result showed as marked lines with three ideas; Use, Save, Earlier versions (Model, Type, You) and Put back worked; a request for an unknown provider without the tick was refused, as was one for a folder that is not a project; a new thread in the Paperwork project started with no web tools on offer and carried the Data pointer, while one in another project was untouched; the folder's files were unchanged.
- **Not tested:** a real model writing instructions (quality, and whether it keeps to the answer shape); the warning and tick with a real internet provider on the page (the server's refusal was tested, the lab has only local providers); a very large folder; the Mac app.


## Since 0.47.0: search in a tab, right-click, several at once

- **Search field** at the top of each tab's list: titles as you type, the text of messages after
  Enter, Esc to clear. A search opens every project that holds a match. With the Global search
  add-on there is a **⌘K** button beside it.
- **Right-click a thread** for Open, Rename, Show in Finder (its project's folder; since 0.51.1), Archive and Delete. **Right-click a project** for Show in Finder. Both use the app's own request for this, so nothing new runs on the Mac. On an archived one:
  Put back in the list, and Delete.
- **Several at once:** Cmd-click adds or removes one, Shift-click takes the range. Then right-click
  for "Archive 5 threads" or "Delete 5 threads". One question for the lot.
- Delete still moves threads to the trash for 30 days, as before.

- **Tested (0.47.0):** lab run in the app: filter by title, text search, pick two with Cmd-click
  and with Shift-click, archive two, rename one, delete two archived ones into the trash.
- **Not verified:** on a large real history.

## Since 17 November: marks on the Skills page

While Tuner Plus and its skills part are on, the Skills page shows each skill's mark (where it came from: Default, Downloaded, Plus, AI-made, Mine, Not sorted) and a filter by mark. Tuner Plus is asked for at most 3 seconds and answers from its last look. Without it (absent, off, failing or slow), the page and its answer are exactly as before.

## Preset in this tab (item 7, 21 November 2026)

Since item 4A this setting is **Settings → Spaces → Preset in this space**, read for the space a thread starts in; the stored values are the same. The text below describes the old tab layout.

A tab set to **Standard only** or **Creator only** in Settings → Modes → Preset in this tab (defaults: Standard only for Recon, Devices and Automations, Creator only for Creator Plus) starts its new threads in that preset: the left panel passes `{ agentPreset }` with the app's start, so the thread is made in it before it exists. This covers New, the + beside a tab and beside a project, Cmd-N when it follows the start place, the starter chips, the Scratch / folder switch, Recon's room, a project page's start, Continue in and Keep in, and Move to out of Recon (`sessions.create` with the preset). Which tab is locked and which presets the app has comes from the Modes add-on (`GET /dsh-modes/preset`), kept for a few seconds and read again when the setting changes. A start waits for it at most 1.5 seconds; a missing preset, or no answer, starts as usual and Modes' backstop takes over. The app's preset menu stays where it is; Modes greys it in a locked tab and puts the (i) beside it. Tests: `test/preset-lock.test.mjs`.

Lab fixes (21 November 2026): a tab set to **Any** now starts its new chats on the app's default preset (named by Modes' route as `defaultPreset`), so the app reuses only a blank on that preset and never one another tab left on Creator or PTC (a Devices chat set to Any no longer starts on Creator because Creator Plus left a draft). Without a name from Modes nothing is passed. Chat without a default workspace now chooses its folder as the other tabs do, so it never lands in Recon's room and reuses Recon's draft there.

## Space buttons (item 4A, stage 3a, 22 November 2026: built and checked in the lab only)

While the Modes add-on says spaces are live, five **space buttons** replace the mode tabs: **Chat · Code · Devices · Recon · Workshop**. Without Modes (or with an older one) the tabs stay as before.

- **Which show.** Chat always; Code (it can be hidden later on Settings → Spaces, stage 5); Devices while the Devices add-on is on; Recon while Recon is on; Workshop while Creator Plus or Tuner Plus is on. Shown only through Tuner Plus, Workshop has its list but no New button: the place says "Switch on Creator Plus to start Workshop threads." with a link to Creator Plus's Settings page.
- **Look and order.** Same look as the tabs (Recon red, Devices violet when selected); drag them with the pencil. Their order is a setting of its own, `spaceOrder`; empty, it follows the order your tabs had. `tabOrder` stays as it is.
- **New button**: "New chat", "New code task", "New device task", "New Recon search", "New workshop task". Each starts in its space's own place (Chat: Scratch; Code, Devices and Workshop: a folder; Recon: its room) with its preset lock, and the new thread is given its space's start mode at once.
- **Lists by space.** Each thread is listed under its space (Modes' `sessionSpaces`, else its mode's space, else its folder), never under its mode: picking another mode does not move it. Archived and Trash are per space (a deleted thread's stored tab and fallback are read through the map, never rewritten; new deletions store the space's own tab id: chat, code, bench, recon, creator-plus). A thread of a hidden or switched-off space is kept: Show all and ⌘K find it.
- **Opening a thread from elsewhere follows it** (owner's answer, 22 Nov). A thread opened from outside the list (⌘K, a card, a link) moves the window to its space, so the buttons, rows and Mode list match it. A blank draft never moves it, and neither does a thread of a hidden space (the window stays).
- **Tuner Plus row only while on** (owner's answer, 22 Nov). Workshop's Tuner Plus row shows only while Tuner Plus is switched on (Modes lists switched-off add-ons in each space's `addonsOff`); switching it on or off in its Settings page updates the left panel at once (window event `dsh-tuning:switched`). Workshop itself then needs Creator Plus or a switched-on Tuner Plus.
- **Each window keeps its own space** (this window's choice first, else the last one chosen; the old stored tab is read once, never rewritten). Choosing a space writes nothing to Modes (`defaultMode` is no longer set). Each space remembers its last thread under a new key; the old per-tab memory is only read.
- **Move to** in a thread's ⋯ menu moves it to another space through Modes, which keeps its mode where the space offers it (else gives the space's start mode) and refuses with a sentence where it must (never into Recon; a Recon thread still opens as a new thread elsewhere). "Promote to …" is gone with the tabs (approved); "Continue in a project…" and "Keep in a project…" stay.
- **For other add-ons**: `html[data-cws-space]` is the window's space; `html[data-cws-tab]` is the open thread's mode (a new thread's: the mode it was given; none yet: its space's start mode), so the Finance, Research, Recon and Devices bars keep working.
- An (i) beside the buttons at the top says what a space is.

### Rows and the Chat list (item 4A, stage 3b, 22 November 2026: built and checked in the lab only)

- **Fixed rows, the same in every space:** Projects · Artifacts · Automations · Plugins (a row whose add-on is off is left out), then a thin line.
- **Projects** is a new row. It opens the project page on a list of every project the app knows (not Scratch, not Recon's room), the default workspace among them, each with its thread count and Open. A project's page has **‹ All projects**. The card grid comes later (Part C).
- **Rows of each space:** Chat: Model arena, Connectors, Skills. Code: Connectors, Skills. Workshop: Model arena, Bench Lab (only if that add-on is installed; the add-on itself is not touched) and **Tuner Plus** and **Benchmark**, which open their Settings pages (shown while those pages exist). Devices and Recon have none of their own.
- **Every space:** pages no space lists, such as Split, Compare and other add-ons' own rows, then More.
- The layout sits beside the tab layout: `DEFAULT_SPACES` in `index.js`, changeable with the file-only setting `spaceLayout` (JSON `{ fixed: [pageId], <space>: { pages: [pageId], settings: [sectionId] } }`; fields you leave out keep theirs). `tabs` and `maxTabs` stay for the tabs; Settings → Modes no longer shows "Tabs in the left panel" while the space buttons show (shown or hidden per space comes with Settings → Spaces).
- **Chat's list:** **Chats** first (standalone threads: Scratch, threads outside any project, the default workspace's Chat-mode threads from before Scratch, and any thread listed in Recon's room), pinned first then newest; then **Projects** as folders, the default workspace always among them, with **+ New**. An (i) beside Chats says what each is. Code, Devices, Recon and Workshop keep their look (folders, Scratch, Other threads).
- **Mode tag:** a small grey tag on a thread's row names its mode when it is not the space's usual one (Research in Chat, for example).
- **Automations:** the Automations page has **Ask about automations**, which opens a new thread in Chat, in the Automations mode. Other add-ons can do the same with the window event `dsh-cowork-shell:start` (`detail: {space, mode, onError}`, cancelable: the left panel cancels it when it takes it, while spaces are live). The mode is picked through Modes' route, so a refusal comes back as its sentence. The Automations add-on's "tab" setting is never used for this (it would remove the mode).
- **Showing a thread's space (fix round 2):** the window event `dsh-cowork-shell:show-space` (`detail: {space}`, cancelable: the left panel cancels it when it takes it, while spaces are live) switches this window to a space without opening another thread. Modes' chat box sends it when a folder picked through the app's own picker from Chat or Code is Recon's room: the thread is a sealed Recon thread, so the window follows it to Recon, where it is listed, instead of the thread vanishing from the list it was opened in.
- "Promote to Cowork / Code" and "Move to Chat / Cowork" are gone with the tabs (stage 3a); Move to another space and "Continue in a project…" stay.

### Cowork switch and place label (item 4A, stage 4, 22 November 2026: built and checked in the lab only)

- **Cowork switch.** Under the chat box of a new Chat thread, right after the Mode list (in a seat Modes leaves there), a switch "Cowork" with an (i): "Off: this chat keeps its own files, and deleting it deletes everything. On: it works in a project folder you choose." Off (the default, the Chat space's start place): the thread is standalone, in its own Scratch folder. Switching it on opens a new draft in the default workspace, so the app's folder picker shows above the box with the default workspace chosen; another project can be picked there. Switching off opens a standalone draft again. The app cannot move a thread, so each switch opens a new draft; the mode picked and any text typed go with it.
- **Place label.** Once the thread has started, the switch becomes a small read-only label: "Standalone", or the project's name, with an (i) on where the thread works. "Move into a project…" comes with Part C.
- The start page's old Scratch / Folder switch and the place chip above the box are left out in the Chat space (the switch and the label replace them); the other spaces and the tab layout keep them. With spaces, the app's folder picker is hidden in Chat only for a standalone thread.
- **Start places per space** (as today, read through each space's own tab): Chat standalone; Code a project folder; Recon its room; Devices and Workshop a project folder. Content, a mode inside Chat, starts standalone like every new chat. Since stage 5, Settings → Start places lists the spaces (by each space's own tab id), and each space's card on Settings → Spaces sets the same value.
- **Deleting a standalone thread** moves its own folder to the trash with it (as Scratch threads always did); Put back brings both back within 30 days. A folder another thread or an automation still uses stays.
- An error (no project folder yet, or the new draft did not open) shows above the switch in plain words, with what to click and any raw text behind Details.

## Fix round after review (item 4A, stages 2 to 5, 22 November 2026: built and checked in the lab only)

- **New starts fresh.** With spaces, a New click (and Ask about automations) claims the thread it opens with `reset`, so a blank draft the app reuses (it keeps one per folder) starts in the space's start mode, not in a mode picked for it before.
- **New, then Send at once, in a thread that has run** (stage 7, owner point 29): with spaces, a send made while a New click's draft is still being opened waits for it (at most 9 seconds) and goes to that new draft, never into the thread that has run. While it waits, a line above the chat box says "Waiting for the new thread to open, then sending your message there."; it goes away once the message is sent or the wait ends. The typed text goes along: when the new chat box is empty it is put there, then sent. When the new draft does not open in time, or the new box already holds other text, nothing is sent, the text stays in the box, and a line says what to do. With no New click pending, a send in a thread that has run is never held; with spaces off nothing changes. The app keeps a draft per thread, so the old thread's box may still show the text afterwards. Tested with stand-ins: `test/space-6a.test.mjs` (point 29).
- **A shared blank draft follows the space it is shown in.** The left panel claims the open blank draft again when the window's space changes (after a short wait, so a draft only passed through is left alone). Coming back to a space reopens its last blank draft whatever mode it was given meanwhile; Modes gives it this space's mode again (a mode you picked comes back where the space offers it).
- **Move out of Recon** opens the new thread inside its project (Scratch or the space's project), so the chat box is not left waiting for a folder, and Modes claims it with the target space's start mode (Plain chat in Chat).
- **Move to another space** that fails for a network or reply reason says what to click; the raw text is behind Details. Modes' own refusals stay as they are.
- **Words:** the Chats and Cowork (i) say that deleting a standalone thread moves its files to the trash with it (30 days to put them back); the Chats (i) points to Settings → Spaces and the Cowork switch. The Projects (i) says how to add, open and remove a project. A project's ⋯ says "to another space".
- The thread ⋯ menu moves up when it would run off the bottom of the window.
- **Not filtered:** the app's own folder picker still lists Recon's room. Modes makes any new thread started there a sealed Recon thread, whatever space the window shows.

## Round 2, UI and text (item 4A, stages 2 to 5, 22 November 2026: built and checked in the lab only)

- **Starter chips follow the mode** (plan 2.5). With spaces the chips are the picked mode's: Modes puts a new thread's mode on the page (`html[data-dsh-draft-mode]`) and `heroChipsOf(state, selected, draftMode)` reads that mode's layout entry (Finance shows Finance's chips in Chat; an add-on mode's own chips in any space). Before Modes names it, Chat uses Plain chat's and every other space its own. The greeting and the New label stay per space. Without spaces nothing changed.
- **Plain chat's chips.** `DEFAULT_TABS.plain` (index.js and client.js, kept equal by a test): Create slides, Build website, Spreadsheet, Visualization, Write, Explain. Chips you set in the `tabs` setting win.
- **The ⋯ menu of a row** is drawn in the page body (fixed), so the list's scroll box no longer clips it. `menuPlace(button, menu, scrollBox, window)`: below the button when it fits above the lower edge of the scroll box and of the window, else above it, else on the side with more room, made shorter (it scrolls inside); right edges line up, kept inside the window. It closes when the list scrolls or the window resizes.
- **Notes are not errors.** A notice (a done Move out of Recon, say) is drawn as a normal note (`cws-notice`); only errors use the error red. The Move notes say thread.
- **Recon's first message keeps its paragraphs.** `putText(box, text)`: the text goes in as a paste (the app's editor keeps the line breaks; lab: one `insertText` lost them and joined the sentences), else line by line with a new paragraph between lines; a paste the editor took is never put in twice.
- **The Cowork switch's name** hides last (step 5, with Depth's and the mode's; Modes' README).
- **Words.** Start places say space and thread; the left panel's words say thread.

## Final fix round (item 4A, stages 2 to 5, 22 November 2026: built and checked in the lab only)

- **Put back in one step.** Delete archives a thread only to move it to the trash; the record now says so (`back: 'list'`, `lib/trash.js` `backToList`, also for one that waits because it is open), and Put back then takes it out of Archived too, so it is back in its list. A thread you had archived yourself before deleting goes back to Archived, as before.

## Stage 6a: the list keeps each thread in its space (item 4A, 22 November 2026: built and checked in the lab only)

- **Recon threads.** A thread Modes marked as Recon's but whose space was never written is listed under Recon, whatever its mode (an owner's own isolated mode keeps its own space).
- **Not written yet.** A thread Modes holds in Devices, Recon or Workshop but has not saved yet (a draft claimed a moment ago) is listed there at once: the left panel asks this add-on's route `GET /dsh-cowork-shell/pending-spaces` (Modes' `spaces.pending`) with every list refresh.
- **Preset of a space.** A space shown without its own mode (Workshop with Tuner Plus only) still starts new threads on the space's preset (Creator).
- **A draft kept elsewhere.** When Modes says the draft the app reused belongs to another space, a new draft opens here in the same project and a line says "That draft belongs to {space}, so a new draft was opened here." A Recon thread asked for outside Recon's room shows Modes' sentence.
- **First send waits.** Enter or Send in a new Devices, Recon or Workshop draft whose space is still being claimed waits for that (at most 2 seconds), so its first turn already has the space's rules.

## English only (stage 7, 23 November 2026)

Plus is English only (owner decision 28). The left panel shows English words even when the app is set to Chinese: the Chinese word list, the Chinese starter chips and the Chinese mode names are gone, and the date title is always English. One Chinese word stays in the code on purpose: the panel finds the app's own Send button by its label, which is the Chinese word for Send when the app is set to Chinese. That is input matching only; nothing Chinese is shown.
