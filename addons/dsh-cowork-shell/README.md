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
    tabs: '{"chat":{"newLabel":"New chat","pages":["model-arena"]},"cowork":{"newLabel":"New task","pages":["schedules","connectors","skills"]},"code":{"newLabel":"New code task","pages":["connectors","skills"]}}'
    maxTabs: 3        # 1 to 5; the first modes in order
```

Page ids: `schedules` (Automation tasks), `plugins`, `model-arena` (from the Model arena add-on), `connectors` and `skills`. Pages that no tab lists show under every tab. A page whose add-on is not installed is simply left out.

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
