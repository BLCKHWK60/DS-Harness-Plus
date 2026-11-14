# Cowork sidebar

Plugin `@local/dsh-cowork-shell` (dsh 0.2.2-rc.1). It replaces the app's left sidebar with a MindsHub-style one:

- **Chat / Cowork / Code tabs** at the top. The tabs are the modes of the Modes add-on, in their order, three by default.
- **One New button per tab:** New chat, New task, New code task.
- **Per-tab sections:**
  - **Chat:** Model Arena.
  - **Cowork:** Automation tasks, Connectors, Skills.
  - **Code:** Connectors, Skills.

  Pages no tab claims, such as Plugins, show under every tab, and the **More** menu stays.
- **Your projects and conversations**: the app's own Projects list, unchanged.
- **Settings** at the bottom, unchanged.

It keeps the app's colours, icons, brand, collapse-to-rail, the narrow-window drawer and, on the Mac desktop app, the strip beside the window buttons.

## What a tab does

The tab you pick decides the mode of every **new** conversation, and the Chat / Cowork / Code drop-down disappears from the chat box while this sidebar is on.

- A conversation that has not sent a message yet follows the selected tab. This includes the empty conversation the app re-opens for "New chat", even if it had a different mode chosen on it earlier.
- At its first message, its mode is fixed to that tab's mode.
- Conversations that have already started keep their mode when you change tabs. To change one anyway, type `/mode <id>` in it.

This needs the Modes add-on. Without it, the tabs only switch which sections show. How it works: this add-on provides a small `coworkShell` service, and Modes checks for it. Modes reads a conversation's internal turn counter to tell whether it has started. If a future app version hides that counter, Modes treats every conversation as started, which is the old behaviour.

## Chat tab: no folders

Chat is for a conversation that lives on its own, not for work in a project folder. So on the **Chat** tab:

- **No pickers on the start page.** The "Default workspace" and "Standard mode" buttons above the chat box are hidden. Cowork and Code still show them.
- **New chat always starts in the app's default workspace** (the folder named `default-workspace`), even if a project conversation is open. The suggestion chips and the Mac's hidden-sidebar "new" button follow the same rule.
- **One flat list.** Recent chats show as a single list, pinned first, then newest first, with no project folders. Cowork and Code keep their project groups.
- **Promote.** The `⋯` on a chat offers:
  - **Promote to Cowork / Promote to Code**: the same conversation moves to that tab, and its mode switches from its next message. It stays in the default workspace, because this app version cannot move a conversation to another folder.
  - **Continue in a project…**: pick Cowork or Code (Code by default) and one of your projects. A **new** conversation opens in that project, on that tab, with the chat box filled in with a short line that mentions the chat the app's own way (`@[title](dsh-session:…)`). When you send it, the app attaches a read-only copy of the chat for the model, and the message shows "Referenced session". The original chat stays where it is.

Details:

- The pickers are hidden only while the Chat tab is open **and** the open conversation is in the default workspace (or nothing is open). If you start a conversation in another project while on the Chat tab (the app's own New Session shortcut can do this, or `+` under **Show all**), the pickers show, so you can see where you are.
- If the app has no `default-workspace` project, nothing is hidden and New chat behaves as before.
- The folder picker is hidden with CSS, by the app's seat name (`conversation.hero.workspace`). Switching the add-on off removes it.
- The preset picker (Standard, PTC, Minimal, Creator) is **not** hidden (since 0.20). It was hidden from 0.10 to 0.19, which left a new chat on the app's default preset with no way to see or change it. The preset decides how the model calls tools, and the app fixes it when a conversation starts: the label at the top of a started conversation is text, not a control.
- A conversation now shows in its tab's list right after its first message. Before, it could drop out of the list for up to 10 seconds.

## Conversations per tab

Each tab lists only its own conversations: **Recent chats** under Chat, **Recent tasks** under Cowork, **Code projects** under Code.
- Conversations are grouped under their project; a project appears in a tab when it has at least one conversation of that tab.
- Conversations outside any project come after, under "Other conversations".
- Pinned conversations come first, then newest first. Archived and helper (sub-agent) conversations are hidden, as in the app's own list. An empty new conversation shows only while it is open.

**Which tab a conversation belongs to** is the mode it runs in (recorded by the Modes add-on at its first message). Conversations from before that was recorded are placed by where they live:

| Where it lives | Tab |
| --- | --- |
| no project | Chat |
| the app's `default-workspace` | Cowork |
| any other project folder | Code |

**Moving:** the `⋯` button on a conversation moves it to another tab (on the Chat tab the same entries read "Promote to …", see above). The `⋯` on a project moves all its conversations. Moving also switches the conversation's mode from its next message, so the tab and the mode always agree. The `+` on a project starts a new conversation in it.

**Needs you:** when a conversation waits for you (an approval, a plan review or a question), a **Needs you (n)** block appears at the top of the list, on every tab. It names the conversation and what it waits for; clicking opens it at the question. The conversation's row shows an amber dot instead of the running dot. It reads the app's own status (`uiSession.sessionStatus`), the same one the app's sidebar uses, and shows nothing when that is unavailable. Answering stays in the app's own dialog.

**Archiving:** the same `⋯` on a conversation has **Archive**. It uses the app's own archive: the conversation leaves the list and nothing is deleted. One that is still working asks before it is stopped and archived. Archiving the open conversation starts a new one. Each tab ends with **Archived (n)**; open it to see that tab's archived conversations, each with **Restore**.

**Deleting:** the app has no way to delete a conversation, so this add-on adds one. **Delete** is in the same `⋯` menu and next to **Restore** in the Archived list. It asks first, archives the conversation, then moves its files (and those of its helper conversations) out of the app into `<app data folder>/trash/conversations`. Each tab ends with **Trash (n)**: every deleted conversation, the days it has left, and **Put back**, which returns it to the Archived list. After 30 days a deleted conversation is removed for good; the add-on checks at start and a few times a day.

- A conversation the app still holds in memory (one you used since the app started) leaves the lists at once, but its files move only at the next start of the app. Until then **Put back** simply shows it again.
- Only a folder that holds a stored conversation is ever moved, and only folders inside the trash are ever removed.
- Files the conversation created in your project folders are not touched. The app's search index and its record of which project the conversation belonged to are left to the app.
- Switching this add-on off, or uninstalling Plus, leaves the trash folder where it is; nothing in it is removed while the add-on is off.

Code: `lib/trash.js` (file moves, tested in `test/trash.test.mjs`), the `/dsh-cowork-shell/trash` route in `index.js` (GET lists, POST `{action: 'delete' | 'restore', sessionId, title}`).

**Show all** switches to the app's full list, with its search, rename, pin and archive menus. **<Tab> only** switches back. Each window remembers the choice.

The list reads the app's own project and conversation data in the browser. If that data is not available (a different app version), the sidebar falls back to the app's full list.

## Start page

- **Greeting per tab** instead of "Into the Unknown":
  - Chat and Cowork: "Let's knock something off your list"
  - Code: "What should we build?"

  The greeting sits in the start page's logo seat, and the stock title next to it is hidden only while a greeting shows. A tab with an empty greeting shows the stock title.
- **Suggestion chips** under the chat box, each with an icon: Create slides, Build website, Develop apps, Spreadsheet, Visualization, Wide research, Create games (Cowork and Code tabs). A chip fills the chat box with a starter prompt to finish and send. Chip icons: `slides`, `website`, `app`, `spreadsheet`, `chart`, `research`, `game`, `spark`.
- **New chat / task / code task** is drawn in the scheme's accent colour, with the app's own New Session shortcut as a badge (shown only when the app exposes one).
- In narrow windows the greeting wraps, and the chat-box Search and Deep research buttons shrink to icons.
- The **Search** and **Deep research** buttons in the chat box come from the Modes add-on.

**Logos, date and width.** The sidebar's **More** menu ends with three switches, saved with your settings:

- **Hide DeepSeek logos / Show DeepSeek logos** (`hideLogos`): removes the logo and name at the top of the sidebar and the logo on the start page.
- **Show the date as the title / Show the greeting as the title** (`dateTitle`): the start page title becomes today's date, written like "11 November, 2026" in English and as the language's own long date otherwise. It replaces the greeting on every tab.
- **Wide chat area / Normal chat area** (`wideChat`): the app keeps the conversation and the message box in a centred column about 800 pixels wide. This lets both use the width of the window (with a margin). The start page keeps its own size. It works through two CSS rules on the app's own class names (`_scrollBody` › `_column`, `_composerStack` › `_card`), so a later app version may need them adjusted.

All three are off by default. They do not change the app's icon, its window title or logos drawn by other parts of the app.

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

  The switch uses the app's own plugin on/off (the same one the Plugins page uses) and applies live. **Add a connector** is a short form that writes out the settings lines for a new server. You paste them at the end of `~/.dsh/profiles/desktop/cordis.patch.yml` and restart; the page does not edit that file itself. Keys never go in the form. Use `${credential:NAME}` in the lines.
- **Skills** is a searchable, read-only list of the skills found for your default folder, read the way the app's own "/" menu reads them for a new conversation ("Standard mode"). A project can add its own skills on top.
- **Model Arena** is the arena's page as a full page. That page comes from the Model arena add-on.

Data comes from two read-only routes, `GET /dsh-cowork-shell/connectors` and `GET /dsh-cowork-shell/skills`, behind the app's login and Host/Origin check, GET only and never cached. They serve names, descriptions, file paths and tool counts, never skill bodies, keys or environment values.

## Switching it off

On the **Plugins** page, switch **Cowork sidebar** off. The normal sidebar comes back at once; no restart is needed. Switching it on again works the same way.

The app must never run both sidebars at once, because it would not load. So the add-on does two things:

1. Its patch switches the app's own sidebar row (`ui-sidebar`) off.
2. The Cowork sidebar row switches itself on **only while** `ui-sidebar` is off.

The app reads `ui-sidebar` before this row, so rule 2 always sees its current state. Turning the app's own "Sidebar" row back on therefore also brings the normal sidebar back, and the Cowork sidebar stays out of the way.

**Do not switch off only the Cowork sidebar's inner row** (on its details page) while leaving the bundle on. The app's sidebar stays off, and you would have no sidebar at all. Use the bundle's main switch. If it happens anyway, run `Uninstall.command`, or remove the `cowork-shell` lines from `~/.dsh/profiles/desktop/cordis.patch.yml`.

## Configuration (optional)

```yaml
- id: cowork-shell
  config:
    # Which pages each tab lists, by page id, and the New button's label. JSON text.
    tabs: '{"chat":{"newLabel":"New chat","pages":["model-arena"]},"cowork":{"newLabel":"New task","pages":["schedules","automations","connectors","skills"]},"code":{"newLabel":"New code task","pages":["connectors","skills"]}}'
    maxTabs: 3        # 1 to 5; the first modes in order. A mode another add-on adds (Finance) gets a tab after these, whatever the limit
```

Page ids: `schedules` (Automation tasks), `automations` (Automation runs, from the Automations add-on), `plugins`, `model-arena` (from the Model arena add-on), `connectors` and `skills`. Pages that no tab lists show under every tab. A page whose add-on is not installed is simply left out.

## How it works

The left sidebar is one replaceable seat (`sidebar`) in the app's layout. This add-on's browser half fills it and declares the same inner seats the app's sidebar declares:

- `sidebar.workspaces`, `sidebar.settings` and `sidebar.footer.action`;
- the brand seats;
- `sidebar.panellist.actions` for the More menu, and the `sidebar.panel.icon` factory.

So the Projects list, Settings and every plugin's page row plug in as before. It uses the app's public services (`uiWorkspace.startSession`, `layout.toggleSidebar` and `layout.selectPanel`) and the app's UI library for icons and the menu. Each of these has a plain fallback. While the sidebar is hidden on the Mac desktop app, it also fills `shell.leading` with "open sidebar" and "new" buttons.

## Checked

In the throwaway web profile only, through the app's browser view:

| Check | Result |
| --- | --- |
| Fresh start | Cowork sidebar shown, app's own sidebar off, no errors |
| Tabs | Chat, Cowork and Code show their own New label and sections, with the app's icons and brand |
| A new chat started from the Chat tab | Ran in Chat mode (the model was offered no tools), and its mode was recorded (`sessionModes`) |
| The re-opened empty conversation had Cowork recorded on it | Followed the Chat tab, and Chat replaced Cowork at its first message |
| Chat-box mode drop-down | Hidden while the sidebar is on |
| Rapid tab clicks | The last click wins; a background refresh no longer undoes it |
| Pages per tab | Chat: Model Arena. Cowork: Automation tasks, Connectors, Skills. Code: Connectors, Skills. Plugins and More on every tab |
| Model Arena page | Rounds and blind columns shown, same as Settings → Arena |
| Skills page | Listed a test skill from the user skills folder plus a shared one; search filters. The route answers 401 without login and 405 to POST |
| Conversations per tab | Each tab listed only its own conversations, grouped by project. Moving a conversation from Cowork to Code took it out of Cowork (11 → 10) and put it under the same project in Code, and the move was saved. **Show all** switched to the app's full list and back. Helper (sub-agent) sessions stayed hidden |
| Start page | The greeting replaced the stock title, with the stock title hidden. The Code tab showed its own greeting. The chips sat under the chat box, and "Build website" filled it with "Build a website for:" |
| Connectors page | A local test MCP server (one `echo` tool) showed "Connected · 1 tool". The switch turned it off ("Off") and on again live, with the tool coming back and no restart. The add form produced exactly the row format that loaded the test server |
| Switching to Cowork afterwards | That chat stayed in Chat, and a new task started in Cowork |
| More menu | Showed the app's own items (Browse other plugins, Create your plugin) |
| Projects list, Settings | Plug in as before |
| Collapse | 56 px rail with icons and expand again |
| Narrow window | Drawer |
| Light and dark | Both checked |
| Plugins page switch, off and on live, each followed by a page reload | The right sidebar every time, never both, no "Failed to load plugins" |
| App's own sidebar row forced back on | Cowork sidebar stepped aside, app sidebar shown |

Chat tab changes (throwaway web profile, mock model):

| Check | Result |
| --- | --- |
| Chat tab start page | Both pickers hidden. Cowork and Code still show them |
| New chat while a Code project conversation was open | Opened in the default workspace |
| Chat list | One flat list, no project folders. Code and Cowork still grouped by project |
| First message in a new chat | Ran in Chat mode, was recorded as chat, and showed in the list within about 2 seconds |
| Promote to Cowork | The chat left the Chat list and showed under `default-workspace` on the Cowork tab |
| Continue in a project… (as Code) | Switched to the Code tab and opened a new conversation in the picked project with the mention filled in. After sending, it ran in Code mode (all tools, workspace-write), was recorded as code, showed "Referenced session", and its saved log held the chat's text as a read-only snapshot |
| Cowork tab `⋯` | Still reads "Move to Chat / Move to Code" |
| Browser console | No errors |

**Not checked:**

- "Continue in a project…" as Cowork (only Code was run), and with more than a handful of projects
- a chat title with unusual characters in the mention (brackets and backslashes are removed from the label)
- the Chinese wording on screen
- the app's own New Session keyboard shortcut on the Chat tab (it is the app's, so it still uses the current or most recent project)
- the Mac desktop app (window buttons, dragging the window by the sidebar, the hidden-sidebar buttons)
- keyboard-only use beyond the tab arrow keys
- Windows

An earlier Connectors design targeted a newer app's live MCP manager. Your installed version (0.2.2-rc.1) does not have it, so the page was rebuilt on what this version has: one MCP client row per server, and the plugin on/off switch.

An earlier version of the on/off rule failed the live switch-on test: both sidebars ended up on and the app did not load. That rule was replaced by the one above, which passed every case.

## Since 0.33.0

- **Tabs in rows of three** (`data-many` on `.cws-tabs` now makes a three-column grid; icons stay).
- **Each tab remembers its conversation.** `localStorage['dsh-cowork-shell.lastOpen']` is `{tabId: sessionId}`, written when the open conversation changes. A tab click opens that conversation, or the tab's start page when it is gone, archived or in the trash. A click's save (`defaultMode`) now runs one at a time and in order, and a background refresh that started before the save finished no longer sets the tab back.
- **Projects.** `lib/projects.js` keeps `{folder: {tab, instructions}}` in `<home>/cowork-shell/projects.json`. Route `GET/POST /dsh-cowork-shell/projects` (`?files=<folder>` lists files; `?upload=1&path=&name=` with the bytes as body copies a file in; JSON `{action: 'save' | 'forget'}`). Only folders the app lists as projects are accepted. The instructions reach a conversation as the prompt section `cowork-shell:project` (order 58) when its folder is the project's folder; helper agents do not get it. The page is the main-area page `project`, opened from the gear on a project's row; it has no row in the page list. A project is made with the app's own `workspaces.create({path})`.
- **Tested in the lab (0.33.0):** five tabs in two rows; switching Chat, Cowork, Finance, Data and Code each came back to its own conversation; a new project from a typed path (the web version has no folder chooser of its own: it opens the Mac's folder dialog, and a typed path is the fallback when that gives nothing); instructions saved and found in the next request; two files added, a taken name saved as "readme (2).txt". **Not verified:** the folder chooser in the desktop app, dropping files onto the page, renaming a project, the narrow rail, the Mac app.

## Since 0.38.0: project types (presets)

A Cowork project can have a **type**: ready-made instructions for a kind of work. The idea behind it: a use case gets a tab of its own only when it needs its own interface or tools (Finance, Data, Code). When it needs only different instructions, it is a project type in Cowork.

- **Shipped types:** Blank (nothing added; Cowork as before), Research, Learn, Paperwork, Plan, Write. Each is a text file in `presets/` with a small header (`id`, `name`, `description`, `tools`) and the instructions. They are written for anyone, in plain words, and tell the assistant which files to keep in the folder (for example `deadlines.md` in Paperwork, `progress.md` in Learn).
- **A type is a starting point.** Choosing one copies its instructions into the project's own instructions, which the user edits freely. The project remembers the type (`preset` in `projects.json`); the instructions that reach the assistant are still the project's own, through the same prompt section as before.
- **The project page** has a Type card for projects under the Cowork tab. For a project without a type and without instructions it is headed "What kind of project is this?", with Blank selected, so a new project behaves as before unless a type is picked. Picking a type when nothing of the user's would be lost applies it at once; otherwise the type's instructions are shown first, with "Replace mine with these", "Keep mine, only change the type" and "Cancel".
- **The user's own types:** "Save as my preset…" under the instructions keeps the current text as a type of their own (`<home>/cowork-shell/presets/my-<name>.md`, at most 40). They are listed after the shipped ones, marked "yours", and can be removed; a project that used one keeps its instructions. A file in the user's folder cannot replace a shipped type.
- `tools` names the shared tools a type can use (`data`, `finance`); `search: off` makes new conversations start with Search off. Both act since 0.39.0, see below.
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
- A type with `search: off` (Paperwork) makes a **new** conversation in the project start with Search off: on `agent/created`, for a conversation that has never run and whose switch was never set, `sessionWeb[id] = false` is written to the Modes settings. Deep research is off unless switched on, as everywhere. The user can switch both on in the chat box.

### Route

`GET ?digest=<folder>&contents=0|1[&provider=<id>]` returns the digest's summary (never its text), the versions, the drift and where the provider runs. POST `generate { path, provider, model, contents, agreed, current }` returns `generated { instructions, ideas, model, where, sent, mark }` and saves nothing. `save` takes `by` (`you`, `type`, `model`), `note` and `mark`. Every answer carries `shared { data, finance }`.

### Tested (0.39.0)

- **Unit tests (8 more, 21 in the add-on):** the digest (quotes text, leaves secrets, hidden folders, dependencies and non-text out, changes nothing, empty folder, cut to its limit, names only); secret-looking names; how far a folder moved; the request text for a typed, an untyped and an empty project; reading tidy and untidy answers; local, network, cloud and unknown addresses; versions; the shared-tools note.
- **In the test setup**, with a stand-in model, on a folder with a README, an `AGENTS.md`, a CSV, a letter and a `.env`: the panel listed 4 files and named `.env` as left out; the request the model received held the type, the file list, the quoted files and the `AGENTS.md` rule, **no** line of `.env`, and it was offered no tools; the result showed as marked lines with three ideas; Use, Save, Earlier versions (Model, Type, You) and Put back worked; a request for an unknown provider without the tick was refused, as was one for a folder that is not a project; a new conversation in the Paperwork project started with no web tools on offer and carried the Data pointer, while one in another project was untouched; the folder's files were unchanged.
- **Not tested:** a real model writing instructions (quality, and whether it keeps to the answer shape); the warning and tick with a real internet provider on the page (the server's refusal was tested, the lab has only local providers); a very large folder; the Mac app.


## Since 0.47.0: search in a tab, right-click, several at once

- **Search field** at the top of each tab's list: titles as you type, the text of messages after
  Enter, Esc to clear. A search opens every project that holds a match. With the Global Search
  add-on there is a **⌘K** button beside it.
- **Right-click a conversation** for Open, Rename, Archive and Delete. On an archived one:
  Put back in the list, and Delete.
- **Several at once:** Cmd-click adds or removes one, Shift-click takes the range. Then right-click
  for "Archive 5 conversations" or "Delete 5 conversations". One question for the lot.
- Delete still moves conversations to the trash for 30 days, as before.

- **Tested (0.47.0):** lab run in the app: filter by title, text search, pick two with Cmd-click
  and with Shift-click, archive two, rename one, delete two archived ones into the trash.
- **Not verified:** on a large real history.
