# Modes and settings

This page describes every mode of DeepSeek Harness Plus as the code stands now: what each is for, how much it may do to your Mac, which tools it has, and where its settings are. It also explains the features every mode shares, and the Settings window. The chat box buttons are described one by one in [GUIDE.md](GUIDE.md) (section 3), and each add-on in [ADD-ONS.md](ADD-ONS.md).

## 1. The modes at a glance

A **mode** is the way a conversation works. Each tab in the sidebar is one mode; a new conversation starts in the mode of the tab you are in. Chat, Cowork and Code are there right after installing. The others appear as a tab once their add-on is switched on (their tier is in [ADD-ONS.md](ADD-ONS.md)).

"Starts at" is the access level a new conversation begins with. You can change it in the chat box; a level you pick by hand is kept. A conversation in a Scratch folder never starts above Workspace Write.

| Mode | What it is for | Starts at | Tools |
|---|---|---|---|
| **Chat** | Questions and answers in one reply. | Read Only | None of its own. With Web on it can search and read the web. For files and commands, switch to Cowork or Code. |
| **Cowork** | Work on your files and tasks with the assistant. | the app's own choice | All tools. |
| **Code** | Writing and fixing code. | Workspace Write | All tools. |
| **Data** | Looking into data files: tables, charts, saved analyses. | Read Only | All tools; it starts with its data and PDF tools. |
| **Finance** | Company figures, filings, prices, news, in plain research. | the app's own choice | All tools. |
| **Research** | A researched question with a cited report. | Read Only | 8: deep research, web search, web page reading, Library search and reading, diagrams, questions, a step list. |
| **Scout** | Looking for work or contracts in markets you choose. | the app's own choice | 20: Scout's own tools, web search and reading, deep research, company figures, filings and news, diagrams, questions, a step list. |
| **Recon** | Sensitive searching kept apart from everything else. | Read Only | 16, all Recon's own. |
| **Content** | Writing from your own material. | Read Only | All tools; it starts with its data and PDF tools. |
| **Devices** | Devices you connect to your Mac (a fixed list of tools, no shell). | Read Only | 60 of its own, plus web, PDFs and the Library. |
| **Creator Plus** | Building and improving plugins. | Workspace Write | 29: its own tools and the tools to read and change files in its trial copy. |
| **Automations** | Planning scheduled tasks. | Read Only | 7: create, list, view and edit scheduled tasks, see their results, questions, a step list. |

How many tabs show in the sidebar is set in Settings → Modes (1 to 5; 3 unless you change it). A tab an add-on adds (Finance, Data and so on) is not counted.

## 2. What every mode shares

### Web

One selector, the same in every mode: **Off**, **All**, or any mix of sources (Verified sources, Academic papers, News, Ordinary sites, Forums, Social media, Archives, Other). **Off** takes away web search and page reading, and stops commands and programs that go online; connectors you added stay on. Research and Scout always need the web, so Off is greyed there. Recon has its own networks (Tor, Usenet, I2P) in the same selector. The source lists and your own sources are in Settings → Web sources.

### Depth

**Quick**, **Standard** or **Thorough**: how much searching, planning, checking and reviewing a conversation gets. It is one setting for every mode and is also where new conversations start (Settings → Modes). It sizes a deep research run (Research, Scout, Recon, or the deep research tool anywhere):

| Depth | Rounds of searching | Helpers at once | Sub-questions | Up to |
|---|---|---|---|---|
| Quick | 1 | 4 | 4 | about 10 minutes, 30 sources |
| Standard | 2 | 6 | 6 | about 25 minutes, 60 sources |
| Thorough | 3 | 8 | 8 | about 45 minutes, 120 sources |

How hard the model thinks is a different thing: the Effort on the model button.

### Tools, and tools loaded when needed

Every conversation can switch its tools off in the chat box (the web goes off too). In Cowork, Code and Data the assistant starts with a small set of 16 core tools (read, write and edit files, find files, run commands and watch background jobs, step list, questions, skills, read images, working folder, leave plan mode, and `tools_find`) and adds the rest when a task needs them: it asks `tools_find`, and naming a tool or a kind of work in your message adds it too. This keeps requests small. Which modes do this is `trimModes` in Settings → Modes.

### Tool access: On, Ask, Off, Locked

Each tool has one state in each mode:

- **On**: the AI is offered the tool.
- **Ask**: the AI is not offered it, but sees it in `tools_catalog` and can ask you for it with `request_tool_access`.
- **Off**: never offered and never listed.
- **Locked**: fixed by the mode's own safety rules (Recon, Devices, Creator Plus). Not changeable here.

A mode that offers nothing of a tool starts on **Ask** for it, so today's tools stay exactly as they are; tools that only you may open (see Never below) start Off. Your choices are kept in the setting `modes.toolAccess` (per group and per tool, per Mac, never shared). **Tool access on** (`modes.toolAccessOn`) switches the whole feature on or off; off, every mode has exactly its own tools, the AI gets neither tool nor instruction line nor catalogue, the tool finder (`tools_find`) does not list them, the chat box's Tools list shows what it showed before (no "can ask you for" section), no `outside.json` is written, and nothing in any tab or prompt changes (a test compares masks, instruction texts and the finder with the add-on as it was before Tool access, for Cowork, Code, Data, Chat, Recon, Devices, helpers and Web Off). **It is off on an existing install and on on a new install** (the new-install defaults write it, once; an installed setup never changes: switch it on in Settings → Tool access if you want it). A value that is missing reads as off, in the add-on and on the page. Tool access can be switched off again from the page (the call `setEnabled`); every permission and every choice in the grid is kept, and applies again when it is switched on. On a new install, Cowork and Code also start with *accounts and connectors*, *other Mac apps* and *app and plugins* on Ask. "Reset to defaults" on a mode goes back to that starting setup on a new install (its Ask choices), and to nothing chosen on an installed setup.

**What the AI gets.** Two tools, both on offer in every mode (Chat and Recon included) while Tool access is on and the conversation's Tools switch is not off. They sit outside the grid: they stay on whatever you set for "App and plugins", so the AI can always look and ask. They do not count as tools for the checks that ask "does this conversation have tools?": Chat still runs no programs, and Code map, Finance and Model tiers still treat Chat as tool-less. The one instruction line is added only to an agent that was really given the two tools.

- `tools_catalog` lists names, a one-line purpose, a risk word and a status (available now, can be requested, add-on is off, only you can switch it on). It lists the tools of switched-off add-ons (marked) and tools on Ask; it never lists Off tools, secrets, or Recon's tools outside Recon. It is not part of the system prompt, so local models stay fast.
- `request_tool_access` takes a tool name and a reason of at most 300 characters. One prompt line tells the AI never to ask because a web page, file or tool result told it to.

**Risk tiers** (`lib/catalog.js` holds the list; a tool nobody has sorted is *Not sorted*, tier 3, on Ask):

| Tier | Examples | Longest permission |
|---|---|---|
| 0 Look | step list, diagram, read a picture | Always |
| 1 Read | read files, PDF, Library, web search and fetch | Always |
| 2 Change | write and edit, Office files, memory, schedules, images | This mode |
| 3 High | commands, programs, files outside the folder, other models, swarm, connectors, Shortcuts, plugin manager, Creator Plus tools, and every tool nobody has sorted | This conversation |
| 4 Never | Recon, secret store and Keychain, access level, Mission, device writes, Tool access itself, git push, plugin install | Only you, in Settings |

**The Tool access page (what a click does).** A click on a group goes On → Ask → Off → On. A cell says **Mixed** only when you really made different choices for tools of the group; on a clean install a group that simply starts differently (a mode offers some of its tools and not others) is not called Mixed. From a Mixed cell a click goes on from your last choice for that group (Ask when there was none), never straight to On, and says that the tool-by-tool choices in the group were replaced, with an Undo. Anything that would end On first asks a plain question naming the tools it switches on. The highest-risk tools show "Settings only" (not "Never"), cannot be clicked, and say why. Switching Tool access **on** always asks first, in plain words, what it changes, and the question starts on Cancel. While Tool access is switched off the page is greyed with a plain line and a switch to turn it on. "Show what the AI sees" is the service's own list for the tab (`catalogueForMode`, the same rows and words as `catalogueFor`). Conversations show by their title and tabs by their label. The chat-box Tools panel lists each tool once: can use now, can ask you for, loaded when needed, or cannot call.

A tool's risk is never guessed from the start of its name: an add-on's own tools are rated by their exact names, so a third-party tool called `pdf_upload` is *Not sorted* (tier 3), not "Read a PDF". If outside material was read in the conversation (a web page or online service, a file, a PDF, a file the Terminal showed, mail or notes from another app, or what a helper brought back), "this mode" and "always" are not offered for anything, and tier 3 can only be allowed once. That warning is kept for the conversation, across turns, automatic restarts (Mission steps, queued messages) and an app restart, until the conversation is deleted. The headline of a request is written by Plus (never by the model); the AI's reason is shown as untrusted text.

**What happens to a request.**

1. Tier 4, secrets, tools that are On or Off already, Locked tabs, a switched-off add-on, a tool kept out by a fence, "Don't ask again", and a conversation with Tools off are refused with plain text. A conversation that holds material from Recon (an export or a move out of Recon reached it; asked of Recon's own list, `door.json`, and a damaged list counts for every conversation) may only ask for tier 0 and 1 tools, in every tab. A helper that has itself read a web page (or something from another app) may only ask for tier 0 and 1; a helper that read nothing may ask as its conversation may. After a Deny, the same tool in the same conversation is refused for 10 minutes; a request that nobody answered (no card, or a time-out) pauses the same tool for 5 or 10 minutes and shows once, not once per try, under Waiting for you. A conversation that was told no, or got no answer, three times in 10 minutes may not ask for anything more for the rest of those 10 minutes, whichever tool it names. At most 3 requests of one conversation wait for the user at once, one conversation holds at most 5 places on the waiting list, and the list keeps at most 50, so one looping AI cannot fill it for everybody. Devices and Creator Plus are not given the two tools or the instruction line, because every request there is refused; Chat under the programs-only preset (it cannot call anything) is not told to ask either.

   **What Recon may ask for.** Recon may ask only for tools that stay on this Mac: files, folders, documents, the Library, the step list and the like. It can never ask for, or be given, the Terminal or any program, a connector (mail, calendar, drives), an engine, a helper or another model, anything that can go online (the web tools, Deep research, image services, Finance and Scout searches, Shortcuts), a plugin or workflow tool, a tool nobody has sorted yet, the secret store, the Keychain or Recon's route rules. Those are refused at once with a plain sentence, with Web On or Off, and no card is shown. This is on purpose: such tools send data out along paths that Recon's own routes, its cloud-model rule and its export door cannot see, so Recon keeps the final say only if they stay closed. The list of "what can go online" is one list (`lib/online.js`); the same list decides when the AI asks and when a tool runs, so even a permission that is stored (or written into the file by hand) cannot run `curl` in Recon. In an ordinary tab with Web Off, the Web Off check of the shell still stops a command that goes online, whatever was allowed. For what Recon may ask, the card uses the highest-risk wording, and an answer works for that one Recon conversation only (once, or this conversation), never in another Recon conversation and never for a helper. A permission given in another tab ("this mode", "always") never reaches Recon, Devices or Creator Plus; these tabs accept only what their own popup gave. Recon's own checks (its model rules, its export rules) still run after this. Devices and Creator Plus stay closed.
2. In an unattended run (an Automation's conversation, also one an Automation runs in again after it was opened earlier, and any run whose newest message came from the scheduler, also after a restart; or a Mission run with no wait) nothing is shown: the request is refused at once and written to **Waiting for you** in the record; the AI carries on without the tool. **Allow** on a Waiting item keeps the popup's limits: a permission for the mode only for tiers 0 to 2 when nothing was read from outside and it is not Recon; otherwise for that conversation only; tier 3 and above, and Recon material above tier 1, cannot be allowed from the list.
3. Otherwise the choice card opens: once, this conversation, this mode, always, deny, don't ask again (only those the rules allow). Nothing is bound to Enter. Esc means deny (while the card has the keyboard focus); a click outside the card does nothing. An answer that arrives after the request ran out or was cancelled is refused, and the card says "This request is no longer waiting" instead of vanishing. The headline names how far the buttons reach (one use, this conversation, the whole mode, always). No answer in 10 minutes (a Mission run that waits keeps its own wait time, at most two hours) counts as "not answered" and is logged under Waiting for you. A Stop cancels the waiting request: the card goes away and a late Allow stores nothing. If the card of Settings Plus is not running, the answer is "not answered": the app's own approval card is never used (on it, Enter means Allow and the AI's words sit inside the warning). A request from a helper says so in its headline ("A helper of the AI asks…").
4. **Once is one call.** "Allow once" is used up by the first call of the tool (the tool is taken off the offer at once) and a second call is refused; an unused one lapses when the conversation's turn ends and when the app starts. The AI is told so: "exactly ONE call".
5. Helpers ask through their conversation. A permission for one conversation stays in that conversation (its Split pane); one for "this mode" applies to every conversation in that mode. Permissions of a conversation that is deleted are removed when the app starts (one in the trash stays).

**Fences.** A permission only ever adds a tool. It never lifts Recon's fence, the rules of Locked tabs, Web Off (the chat box's Web button on Off), the Tools switch, another tab's tools, or an add-on's own final check (Devices, Mission, Split Plus run when a tool is called, after this). Off beats a permission.

**Where things are kept (this Mac only, never synced):** `$DSH_HOME/tool-access/grants.json` (permissions and "don't ask again"), `$DSH_HOME/tool-access/outside.json` (which conversations read outside material; a warning only, never a permission), `$DSH_HOME/tool-access/tool-access.jsonl` (asked, allowed, denied, refused, waiting, revoked, expired; the reason cut to 300 characters; nothing else the AI wrote). A conversation's permission lapses after 30 days; a card may also give a time limit (`expiresAt`).

**For other add-ons and the pages: the service `toolAccess`** (`ctx.get('toolAccess')`, written in `lib/toolaccess.js`):

- Card: `registerCard(handler)` (handler returns a Promise of `{choice, expiresAt?}`), or `subscribe` / `pending` / `answer(requestId, decision)`. The request carries the Plus-written wording, the allowed `choices`, `defaultChoice: 'deny'`, and a 10-minute `signal`. Only offered choices are valid.
- Browser route `/dsh-modes/tool-access` (lib/route.js, same sign-in check as `/dsh-modes/tools`): `POST {call, args}` returns `{ok: true, value}` or `{ok: false, error}`; `GET ?call=grid` (also `toolsOf`, `catalogueFor`, `grants`, `history`, `waiting`, `record`, `pending`, `enabled`; args as `&args=<json>`) reads. Calls: grid, setCell, setTool, resetMode, toolsOf, catalogueFor, grants, revoke, revokeAll, revokeConversation, history, waiting, clearWaiting, record, pending, answer, enabled, setEnabled (`{on: true | false}`: the page's switch; Off keeps every permission and choice). The card of Settings Plus is registered only while a page has asked for it in the last 6 seconds (`ALIVE_MS` in its `lib/toolcard.js`); when no page has, a request is answered "not answered" at once (there is no fallback to the app's own card). A different card that only polls `pending` (about every second) counts as there for 30 seconds (`POLL_ALIVE_MS`), and the service waits for `answer`. With `DSH_TOOL_ACCESS_LAB=1` set when the app starts, `labRequest {sessionId, tool, reason, outsideMaterial?}` starts a request as the AI would (the answer shows in `history` and `grants`).
- Page: `grid()`, `setCell`, `setTool`, `resetMode`, `toolsOf(modeId)`, `catalogueFor(sessionId)`, `grants()`, `revoke(id)`, `revokeAll()`, `unblock(id)`, `history()`, `waiting()`, `clearWaiting(id)`, `record(sessionId)`; `kinds()` gives the one list of file-changing and command tools.

### Helpers and models

Some tools start helper agents: a Mission run, deep research, Agent swarm, the Tier tools, Code power. The models chip says whether helpers use the conversation's model (**One model**, the default and the lightest) or the models set for their roles in Settings → Model Tiers.

### Model Tiers

The model button holds the model, the effort (Off to Ultra Code), the tier and saved model versions. The five starter tiers are Fast, Balanced, Deep, Creative and Code review; no model is preset, so a tier applies to whatever model the conversation uses until you pick one. A tier can carry its own instructions, skills, connectors and fallback models.

### Long run (Mission)

A Long run keeps working on a goal by itself. By default it stops after 120 minutes or 10 laps (you can set 10 to 720 minutes and 1 to 50 laps in Settings → Mission). A lap is: work on the open items, run the overall commands, review. Two laps in a row that find nothing end it early. Its permission modes are **Restricted** (the default), **Ask-Auto** and **Full Auto**. Commands: `/mission` to start, `/mission stop` to pause, `/mission resume`, `/mission end` for the report, `/mission back <checkpoint>` to undo what it changed. Before a run changes files, Mission saves a checkpoint.

### Budget guard

Stops a task that is running away. A **task** is everything the assistant does after one message of yours, helper agents included. A **step** is one request to a model.

| Limit | Starts as | What it counts |
|---|---|---|
| Steps | 300 | requests the conversation itself makes in one task |
| Steps by helpers | 1,500 | requests its helpers (deep research, Mission) make in one task; 0 shares the Steps limit |
| Tokens | 20,000,000 (5,000,000 on a first install) | tokens sent and received, helpers included |
| Minutes | none | how long one task may run |
| Same tool call in a row | 8 | a repeated call is treated as a loop |
| Tokens per day | none | all conversations together |
| While a Long run is on: steps / tokens | 5,000 / 60,000,000 | a Long run's own allowance in place of the step and token limits above (never lower than they are) |

At a limit the task stops and says why; the conversation is kept and your next message starts a fresh allowance. 0 means no limit. The guard counts tokens, not money.

### Memory, skills and learning

**Code tools** (Code map and Code power) offer eight guides (skills): four to reverse-engineer a codebase, website, API or file format, or installed app, and four to review a pull request, fix failing tests in a loop, try several solutions, and review hunks. On a **new install** they are offered only in the Code tab (switched off in Chat and Cowork); on an install you already have, nothing changes. Choose where they are offered with the switches "Offer them in Chat / Cowork / Code" at the bottom of Settings → Code tools. A guide you type yourself with `/` always works.

Memory keeps facts for later conversations, per mode where you choose. Skills can be switched off per tab. Learning from your corrections is off until you switch it on, and nothing is installed without your yes.

### Keeping Recon apart

Recon is an **isolated** mode. It offers exactly its own tools, runs no programs, drops the app's instruction files and skills, and refuses a change of mode. Global Search never shows its conversations, Sync never copies them, Mission refuses to run in it, Learning never reads it, and Artifacts keeps nothing from it. Details: the Recon section of [ADD-ONS.md](ADD-ONS.md).

## 3. Each mode, a little closer

- **Chat, Cowork, Code.** Cowork and Code have working methods you can see and change in Settings → Modes: Code reads before changing, keeps a step list, makes small exact changes, runs the tests and reads the output, and asks before anything it cannot undo. Cowork has a method for working with files and tasks.
- **Data.** Reads CSV and modern Excel files (Excel's older .xls, Numbers and Parquet files are not read as tables); profiles them, queries them, draws charts (a chart is checked before it is shown) and runs Python in its own sandbox. New files go to a `data-output` folder.
- **Finance.** Figures, filings, prices, news and social mood for a company, sector, economy or market. The selection under the chat box (kind, market, focus, period) says what the conversation is about. It is research, not advice. An optional adviser mode, off by default, needs a one-time typed acceptance and ends answers with "AI output, not regulated advice."
- **Research.** Plans sub-questions, sends helpers to search and read, reviews what is missing, searches again, and writes a cited report. Its Depth sets the size of the run.
- **Scout.** Looks for postings, titles, demand and pay in the markets you choose. Nothing is sent or applied for.
- **Recon.** See above. Settings → Recon holds its networks and rules.
- **Content.** A method for writing: ask what to build, read before writing, keep sources apart from your words and the assistant's, mark what is unsourced, save every draft, publish nothing.
- **Devices.** Only for your own devices. The assistant never writes a device command itself.
- **Creator Plus.** Builds and improves plugins in a trial copy; nothing in your setup changes without your yes.
- **Automations.** Plans scheduled tasks; the Automations page and Settings → Alerts show their runs and how you are told.

## 4. The Settings window

Open it from **More → Settings**. The Plus pages are sorted into groups, each page with an icon:

| Group | Pages |
|---|---|
| Tabs and modes | Modes, Start places, Web sources, Research (with Deep research under Advanced), Finance, Data, Scout, Recon, Content, Devices, Creator Plus, Split Plus |
| Models | Model Tiers (tabs: Tiers and models, Instructions for every conversation, Sampling, Advanced), Arena, Benchmark, Tuner Plus |
| Cost and limits | Budget guard, Usage |
| Agents and runs | Mission, Swarm, Self-improve, Learned skills, Alerts (with the rules for when a turn ends or the app waits for you) |
| Knowledge and files | Memory, Library, PDF reader, Code tools (Code map, Reviews and fixes), Diagrams, Learning, Artifacts |
| Look and this Mac | Colours, Activity, Mac |

A page only shows when its add-on is installed and switched on.

**Search.** The field at the top of the window (Cmd-F) finds any page or setting by name or by what it does. Enter opens the result, scrolls to it and outlines it. The search index lists 1,018 entries; 183 of them are marked **configuration file only**: they have no control on any page, and are changed in the setup file (**Open configuration file** at the top of the window; quit the app first, and keep a copy).

**The gear beside Send** opens the page of the mode you are in as a window over the chat. Chat, Cowork and Code open the Modes page.

**Where the starting values come from.** A first install of Plus starts with three safer values: a 5,000,000-token limit per task, Activity showing words ("Writing", "Reading prompt") instead of codes ("TG", "PP"), and the Code review tier at High effort. The same first install switches the eight Code tools guides off in Chat and Cowork. An update to a newer version never changes a value; your setup stays as it is. Each value can be changed on its page.

## 5. When the app updates

The add-ons were written for DeepSeek Harness 0.2.2 up to, but not including, 0.3.0. If the app updates beyond that, the installer refuses to install into it and says why, and the app itself may switch the add-ons off with a warning until a newer Plus is out. See the README.
