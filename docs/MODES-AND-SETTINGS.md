# Modes and settings

This page describes the spaces and modes of DeepSeek Harness Plus as the code stands now: where a thread lives, how each mode works, how much it may do to your Mac, which tools it has, and where its settings are. It also explains the features every mode shares, and the Settings window. The chat box buttons are described one by one in [GUIDE.md](GUIDE.md) (section 3), and each add-on in [ADD-ONS.md](ADD-ONS.md).

## 1. Spaces and modes

### Spaces: where a thread lives

A **thread** is one exchange with the assistant, from your first message on. Every thread lives in one **space**. There are five, and they are the buttons at the top of the left panel:

| Space | Shows when | New threads start in (start mode) | Where new threads start | Preset in this space |
|---|---|---|---|---|
| **Chat** | Always (something has to be there) | Plain chat | Standalone (the Cowork switch is off) | Any |
| **Code** | Unless you hide it | Code | A project folder | Any |
| **Devices** | Devices is switched on on the Plugins page and **Offer the Devices mode** is on (Settings → Devices) | Devices | A project folder | Standard only |
| **Recon** | Recon is switched on and **Offer the Recon mode** is on (Settings → Recon) | Recon | Recon's room (always) | Standard only |
| **Workshop** | Creator Plus or Tuner Plus is on. Without Creator Plus it has its rows but no New button | Creator Plus | A project folder | Creator only |

- A space lists only its own threads, with its own **Archived** and **Trash**. The **New** button follows the space: **New chat**, **New code task**, **New device task**, **New Recon search**, **New workshop task**.
- The Chat space has two groups: **Chats** (standalone threads) and **Projects** (your folders). The other spaces list folders, **Scratch** and **Other**.
- A thread stays in its space. A move into or out of Recon is always refused.
- Each window shows one space and remembers it. Switching space in one window does not move the others.
- A hidden space keeps its threads. They stay reachable through **Show all** and ⌘K search, and come back when you show the space again.
- Recon is red and Devices is violet (the button, the window frame and the New button). One switch, **Recon and Devices colours**, turns both off.

**Settings → Spaces** has, for all spaces, the order of the space buttons and the colours switch. Then one card per space:

- **Shown** or **Hidden** (Chat is always shown).
- **New threads start in**: the space's **start mode**. The list offers only the modes ticked for that space. Threads you already have keep their mode. If the start mode's add-on is switched off, new threads start in the space's usual mode for now, and your choice comes back when the add-on is on again.
- **Where new threads start**: a folder of its own (it goes to the trash with the thread) or a project folder. In Chat this is where the Cowork switch starts. Recon threads always start in Recon's room. It is the same setting as Settings → Start places.
- **Preset in this space**: which of the app's presets (Standard, PTC, Creator) a new thread starts in: **Any**, **Standard only** or **Creator only**. A locked space greys the preset menu on a new thread. Loosening a default asks first. Under it, **Preset for one mode** lets one mode keep its own lock in any space; when the two differ, the space wins and the chat box says so.

### Modes: how a thread works

A **mode** is a set of instructions and tools. Pick it in the **Mode list** under the chat box. Plain chat comes first, then only the modes ticked for this space, each with a one-line description. A change applies from your next message. The thread stays in its space and keeps its preset, and a quiet line in the thread records the change.

**Ticks.** On **Settings → Modes**, each mode has five ticks, one per space. A tick offers the mode in that space's Mode list. Ticks save at once; threads that already use a mode keep it. You can change the ticks and the one-line description of every mode, including the add-on modes (their instructions and tools stay as their add-on sets them). These are the ticks after a new install:

| Mode | Ticked for |
|---|---|
| Plain chat, Research, Data | Chat and Code |
| Chat, Cowork, Scout, Finance, Content, Automations | Chat |
| Code | Code |
| Devices | Devices |
| Recon | Recon |
| Creator Plus | Workshop |

Your own modes start ticked for Chat.

**Guarded spaces.** Devices, Recon and Workshop are guarded: the space keeps its own safety rules whatever mode a thread there uses.

- **Recon** seals every thread in it. Another mode used there gets a sealed copy: no programs, nothing online except Recon's own networks, file tools only inside the thread's Recon room, and no shared notes (Memory, Finance profile, Learning and the like). A sealed thread may switch to another mode Recon offers and stays sealed.
- **Devices** and **Workshop** refuse the Terminal, programs, background jobs, connectors and tools that drive other apps for every mode. A mode used in Devices also gets the device tools, and its file changes stay inside its own folder. Workshop needs Creator Plus for any mode other than its own.
- A tick for a guarded space is greyed while the add-on that keeps its rules is off or out of date; the line above the list says what to switch on. A thread in a guarded space waits, with no tools, until that add-on is on and up to date.
- The line under a mode in the Mode list says what it loses in a guarded space.

**Plain chat, Chat and Cowork.** New threads in the Chat space start in **Plain chat** (no extra instructions). The **Chat** mode answers in one reply without tools. **Cowork** works with your files. In the Chat space, the **Cowork switch** on a new thread chooses where it works: off, the thread keeps its own files, and deleting it deletes them; on, it works in a project folder you pick. Once the thread has started, the switch becomes a place label ("Standalone" or the project's name).

**Preset is not a mode.** The app's own preset menu (Standard, PTC, Creator) says how the model works with tools. It is fixed when a thread starts. Plus modes are only the Mode list under the chat box.

### Automations: Runs in

An automation opens or continues a thread on a clock. Its page shows where its threads open as **Runs in: Space · Mode**, for example "Runs in: Chat · Finance". A Recon automation runs only in the thread it was made in ("Runs in: this thread (Recon · mode)").

- Chat and Code automations still run where you set them when their mode is no longer ticked there or the space is hidden, and the page says so.
- Devices, Workshop and Recon automations pause, with a note, when their space cannot run them (for example Devices is off or out of date). They are never moved anywhere else. When the space can run them again, the note says so: switch the automation back on.
- A run that nothing could start yet waits; nothing was run, and the automation is paused.
- From a thread in Devices or Workshop, the clock button can also send runs to a new thread in another space, in a folder you pick. That thread then follows the other space's rules.
- **Mode for automations** (Settings → Modes) is the mode a thread opens in when an automation has no mode of its own.

### Engines run only in the Code space

An engine (an outside coding program such as OpenCode) works only in threads in the Code space, in any mode. If you pick an engine in Recon, Devices or Workshop, nothing is run and your message goes back into the chat box (or the thread says it was kept and shows **Put back**).

### The modes at a glance

"Starts at" is the access level a new thread begins with. You can change it in the chat box; a level you pick by hand is kept. A thread in a Scratch folder never starts above Workspace Write.

| Mode | What it is for | Starts at | Tools |
|---|---|---|---|
| **Plain chat** | Talking with no extra instructions. | the app's own choice | The tools the space allows. |
| **Chat** | Questions and answers in one reply. | Read Only | None of its own. With Web on it can search and read the web. For files and commands, switch to Cowork or Code. |
| **Cowork** | Work on your files and jobs with the assistant. | the app's own choice | All tools. |
| **Code** | Writing and fixing code. | Workspace Write | All tools. |
| **Data** | Looking into data files: tables, charts, saved analyses. | Read Only | All tools; it starts with its data and PDF tools. |
| **Finance** | Company figures, filings, prices, news, in plain research. | the app's own choice | All tools. |
| **Research** | A researched question with a cited report. | Read Only | 8: deep research, web search, web page reading, Library search and reading, diagrams, questions, a step list. |
| **Scout** | Looking for work or contracts in markets you choose. | the app's own choice | 20: Scout's own tools, web search and reading, deep research, company figures, filings and news, diagrams, questions, a step list. |
| **Recon** | Sensitive searching kept apart from everything else. | Read Only | 16, all Recon's own. |
| **Content** | Writing from your own material. | Read Only | All tools; it starts with its data and PDF tools. |
| **Devices** | Devices you connect to your Mac (a fixed list of tools, no shell). | Read Only | 60 of its own, plus web, PDFs and the Library. |
| **Creator Plus** | Building and improving add-ons. | Workspace Write | 29: its own tools and the tools to read and change files in its trial copy. |
| **Automations** | Planning automations. | Read Only | 7: create, list, view and change automations, see their results, questions, a step list. |

Chat, Cowork, Code and Plain chat are there right after installing. The other modes appear in the Mode list once their add-on is switched on (their tier is in [ADD-ONS.md](ADD-ONS.md)). In a guarded space every mode keeps that space's rules (above), so its tools there can be fewer than this table shows.

## 2. What every mode shares

### Web

One selector, the same in every mode: **Off**, **All**, or any mix of sources (Verified sources, Academic papers, News, Ordinary sites, Forums, Social media, Archives, Other). **Off** takes away web search and page reading, and stops commands and programs that go online; connectors you added stay on. Research and Scout always need the web, so Off is greyed there. Recon has its own networks (Tor, Usenet, I2P) in the same selector. The source lists and your own sources are in Settings → Web sources.

### Depth

**Quick**, **Standard** or **Thorough**: how much searching, planning, checking and reviewing a thread gets. The highest step, **Mission**, only selects a Mission for the thread: **Start Mission** beside Send then starts it, and Send keeps talking at the thread's own Depth. It is one setting for every mode and is also where new threads start (Settings → Modes). It sizes a deep research run (Research, Scout, Recon, or the deep research tool anywhere):

| Depth | Rounds of searching | Helpers at once | Sub-questions | Up to |
|---|---|---|---|---|
| Quick | 1 | 4 | 4 | about 10 minutes, 30 sources |
| Standard | 2 | 6 | 6 | about 25 minutes, 60 sources |
| Thorough | 3 | 8 | 8 | about 45 minutes, 120 sources |

How hard the model thinks is a different thing: the Effort on the model button.

### Tools, and tools loaded when needed

Every thread can switch its tools off in the chat box (the web goes off too). In Cowork, Code and Data the assistant starts with a small set of 16 core tools (read, write and edit files, find files, run commands and watch background jobs, step list, questions, skills, read images, working folder, leave plan mode, and `tools_find`) and adds the rest when the work needs them: it asks `tools_find`, and naming a tool or a kind of work in your message adds it too. This keeps requests small. Which modes do this is `trimModes` in Settings → Modes.

### Tool access: On, Ask, Off, Locked

Each tool has one state in each mode:

- **On**: the AI is offered the tool.
- **Ask**: the AI is not offered it, but sees it in `tools_catalog` and can ask you for it with `request_tool_access`.
- **Off**: never offered and never listed.
- **Locked**: fixed by the safety rules of Recon, Devices or Workshop (for their own modes, and for any mode used in those spaces). Not changeable here.

A mode that offers nothing of a tool starts on **Ask** for it, so today's tools stay exactly as they are; tools that only you may open (see Never below) start Off. Your choices are kept in the setting `modes.toolAccess` (per group and per tool, per Mac, never shared). **Tool access on** (`modes.toolAccessOn`) switches the whole feature on or off; off, every mode has exactly its own tools, the AI gets neither tool nor instruction line nor catalogue, the tool finder (`tools_find`) does not list them, the chat box's Tools list shows what it showed before (no "can ask you for" section), no `outside.json` is written, and nothing in any mode or prompt changes (a test compares masks, instruction texts and the finder with the add-on as it was before Tool access, for Cowork, Code, Data, Chat, Recon, Devices, helpers and Web Off). **It is off on an existing install and on on a new install** (the new-install defaults write it, once; an installed setup never changes: switch it on in Settings → Tool access if you want it). A value that is missing reads as off, in the add-on and on the page. Tool access can be switched off again from the page (the call `setEnabled`); every permission and every choice in the grid is kept, and applies again when it is switched on. On a new install, Cowork and Code also start with *accounts and connectors*, *other Mac apps* and *app and plugins* on Ask. "Reset to defaults" on a mode goes back to that starting setup on a new install (its Ask choices), and to nothing chosen on an installed setup.

**What the AI gets.** Two tools, both on offer in every mode (Chat and Recon included) while Tool access is on and the thread's Tools switch is not off. They sit outside the grid: they stay on whatever you set for "App and plugins", so the AI can always look and ask. They do not count as tools for the checks that ask "does this thread have tools?": Chat still runs no programs, and Code map, Finance and Model tiers still treat Chat as tool-less. The one instruction line is added only to an agent that was really given the two tools.

- `tools_catalog` lists names, a one-line purpose, a risk word and a status (available now, can be requested, add-on is off, only you can switch it on). It lists the tools of switched-off add-ons (marked) and tools on Ask; it never lists Off tools, secrets, or Recon's tools outside Recon. It is not part of the system prompt, so local models stay fast.
- `request_tool_access` takes a tool name and a reason of at most 300 characters. One prompt line tells the AI never to ask because a web page, file or tool result told it to.

**Risk tiers** (`lib/catalog.js` holds the list; a tool nobody has sorted is *Not sorted*, tier 3, on Ask):

| Tier | Examples | Longest permission |
|---|---|---|
| 0 Look | step list, diagram, read a picture | Always |
| 1 Read | read files, PDF, Library, web search and fetch | Always |
| 2 Change | write and edit, Office files, memory, schedules, images | This mode |
| 3 High | commands, programs, files outside the folder, other models, swarm, connectors, Shortcuts, plugin manager, Creator Plus tools, and every tool nobody has sorted | This thread |
| 4 Never | Recon, secret store and Keychain, access level, Mission, device writes, Tool access itself, git push, plugin install | Only you, in Settings |

**The Tool access page (what a click does).** A click on a group goes On → Ask → Off → On. A cell says **Mixed** only when you really made different choices for tools of the group; on a clean install a group that simply starts differently (a mode offers some of its tools and not others) is not called Mixed. From a Mixed cell a click goes on from your last choice for that group (Ask when there was none), never straight to On, and says that the tool-by-tool choices in the group were replaced, with an Undo. Anything that would end On first asks a plain question naming the tools it switches on. The highest-risk tools show "Settings only" (not "Never"), cannot be clicked, and say why. Switching Tool access **on** always asks first, in plain words, what it changes, and the question starts on Cancel. While Tool access is switched off the page is greyed with a plain line and a switch to turn it on. "Show what the AI sees" is the service's own list for the mode (`catalogueForMode`, the same rows and words as `catalogueFor`). Threads show by their title and modes by their label. The chat-box Tools panel lists each tool once: can use now, can ask you for, loaded when needed, or cannot call.

A tool's risk is never guessed from the start of its name: an add-on's own tools are rated by their exact names, so a third-party tool called `pdf_upload` is *Not sorted* (tier 3), not "Read a PDF". If outside material was read in the thread (a web page or online service, a file, a PDF, a file the Terminal showed, mail or notes from another app, or what a helper brought back), "this mode" and "always" are not offered for anything, and tier 3 can only be allowed once. That warning is kept for the thread, across turns, automatic restarts (Mission steps, queued messages) and an app restart, until the thread is deleted. The headline of a request is written by Plus (never by the model); the AI's reason is shown as untrusted text.

**What happens to a request.**

1. Tier 4, secrets, tools that are On or Off already, Locked modes, a switched-off add-on, a tool kept out by a fence, "Don't ask again", and a thread with Tools off are refused with plain text. A thread that holds material from Recon (an export or a move out of Recon reached it; asked of Recon's own list, `door.json`, and a damaged list counts for every thread) may only ask for tier 0 and 1 tools, in every space. A helper that has itself read a web page (or something from another app) may only ask for tier 0 and 1; a helper that read nothing may ask as its thread may. After a Deny, the same tool in the same thread is refused for 10 minutes; a request that nobody answered (no card, or a time-out) pauses the same tool for 5 or 10 minutes and shows once, not once per try, under Waiting for you. A thread that was told no, or got no answer, three times in 10 minutes may not ask for anything more for the rest of those 10 minutes, whichever tool it names. At most 3 requests of one thread wait for the user at once, one thread holds at most 5 places on the waiting list, and the list keeps at most 50, so one looping AI cannot fill it for everybody. Devices and Creator Plus are not given the two tools or the instruction line, because every request there is refused; Chat under the programs-only preset (it cannot call anything) is not told to ask either.

   **What Recon may ask for.** Recon may ask only for tools that stay on this Mac: files, folders, documents, the Library, the step list and the like. It can never ask for, or be given, the Terminal or any program, a connector (mail, calendar, drives), an engine, a helper or another model, anything that can go online (the web tools, Deep research, image services, Finance and Scout searches, Shortcuts), a plugin or workflow tool, a tool nobody has sorted yet, the secret store, the Keychain or Recon's route rules. Those are refused at once with a plain sentence, with Web On or Off, and no card is shown. This is on purpose: such tools send data out along paths that Recon's own routes, its cloud-model rule and its export door cannot see, so Recon keeps the final say only if they stay closed. The list of "what can go online" is one list (`lib/online.js`); the same list decides when the AI asks and when a tool runs, so even a permission that is stored (or written into the file by hand) cannot run `curl` in Recon. In any other space with Web Off, the Web Off check of the shell still stops a command that goes online, whatever was allowed. For what Recon may ask, the card uses the highest-risk wording, and an answer works for that one Recon thread only (once, or this thread), never in another Recon thread and never for a helper. A permission given elsewhere ("this mode", "always") never reaches Recon, Devices or Workshop; these spaces accept only what their own popup gave. Recon's own checks (its model rules, its export rules) still run after this. Devices and Creator Plus stay closed.
2. In an unattended run (an automation's thread, also one an Automation runs in again after it was opened earlier, and any run whose newest message came from the scheduler, also after a restart) nothing is shown: the request is refused at once and written to **Waiting for you** in the record; the AI carries on without the tool. A Mission is not unattended: a Mission's helpers park their requests in the Mission's card instead (below), and the thread itself has you there. **Allow** on a Waiting item keeps the popup's limits: a permission for the mode only for tiers 0 to 2 when nothing was read from outside and it is not Recon; otherwise for that thread only; tier 3 and above, and Recon material above tier 1, cannot be allowed from the list.
3. Otherwise the choice card opens: Allow once, Allow in this thread, Allow in this mode, Always allow, Deny, Don't ask again (only those the rules allow). Nothing is bound to Enter. Esc means deny (while the card has the keyboard focus); a click outside the card does nothing. An answer that arrives after the request ran out or was cancelled is refused, and the card says "This request is no longer waiting" instead of vanishing. The headline names how far the buttons reach (one use, this thread, the whole mode, always). No answer in 10 minutes (a Mission run that waits keeps its own wait time, at most two hours) counts as "not answered" and is logged under Waiting for you. A Stop cancels the waiting request: the card goes away and a late Allow stores nothing. If the card of Settings Plus is not running, the answer is "not answered": the app's own approval card is never used (on it, Enter means Allow and the AI's words sit inside the warning). A request from a helper says so in its headline ("A helper of the AI asks…").
4. **Once is one call.** "Allow once" is used up by the first call of the tool (the tool is taken off the offer at once) and a second call is refused; an unused one lapses when the thread's turn ends and when the app starts. The AI is told so: "exactly ONE call".
5. Helpers ask through their thread. A permission for one thread stays in that thread (its Split pane); one for "this mode" applies to every thread in that mode. Permissions of a thread that is deleted are removed when the app starts (one in the trash stays).

**Fences.** A permission only ever adds a tool. It never lifts Recon's fence, the rules of Locked modes, Web Off (the chat box's Web button on Off), the Tools switch, another mode's tools, or an add-on's own final check (Devices, Mission, Split Plus run when a tool is called, after this). Off beats a permission.

**Where things are kept (this Mac only, never synced):** `$DSH_HOME/tool-access/grants.json` (permissions and "don't ask again"), `$DSH_HOME/tool-access/outside.json` (which threads read outside material; a warning only, never a permission), `$DSH_HOME/tool-access/tool-access.jsonl` (asked, allowed, denied, refused, waiting, revoked, expired; the reason cut to 300 characters; nothing else the AI wrote). A thread's permission lapses after 30 days; a card may also give a time limit (`expiresAt`).

**For other add-ons and the pages: the service `toolAccess`** (`ctx.get('toolAccess')`, written in `lib/toolaccess.js`):

- Card: `registerCard(handler)` (handler returns a Promise of `{choice, expiresAt?}`), or `subscribe` / `pending` / `answer(requestId, decision)`. The request carries the Plus-written wording, the allowed `choices`, `defaultChoice: 'deny'`, and a 10-minute `signal`. Only offered choices are valid.
- Browser route `/dsh-modes/tool-access` (lib/route.js, same sign-in check as `/dsh-modes/tools`): `POST {call, args}` returns `{ok: true, value}` or `{ok: false, error}`; `GET ?call=grid` (also `toolsOf`, `catalogueFor`, `grants`, `history`, `waiting`, `record`, `pending`, `enabled`; args as `&args=<json>`) reads. Calls: grid, setCell, setTool, resetMode, toolsOf, catalogueFor, grants, revoke, revokeAll, revokeConversation, history, waiting, clearWaiting, record, pending, answer, enabled, setEnabled (`{on: true | false}`: the page's switch; Off keeps every permission and choice). The card of Settings Plus is registered only while a page has asked for it in the last 6 seconds (`ALIVE_MS` in its `lib/toolcard.js`); when no page has, a request is answered "not answered" at once (there is no fallback to the app's own card). A different card that only polls `pending` (about every second) counts as there for 30 seconds (`POLL_ALIVE_MS`), and the service waits for `answer`. With `DSH_TOOL_ACCESS_LAB=1` set when the app starts, `labRequest {sessionId, tool, reason, outsideMaterial?}` starts a request as the AI would (the answer shows in `history` and `grants`).
- A Mission's helpers: when `mission.canPark(helper)` is true, `ask()` shows no card. A request the policy would offer for this thread or longer is parked in the Mission's card (`mission.parkApproval`) and answered with code `parked`; one the policy offers only for one call (a high-risk tool after outside material) gets code `once-only` and the Mission lists it as not possible. The Mission's card offers **Allow for this item**, **Allow for this Mission** and **Deny**, and answers through `grantParked({sessionId, tool})` (decides again as a helper and stores a "this thread" permission, returning `{ok: true, id}` for `revoke(id)`, or `{ok: false, text}`) and `denyParked({sessionId, tool})` (the usual refusal time after a Deny). The plugin hands Mission's two calls to the service with `useParking({parkable, park})`.
- Page: `grid()`, `setCell`, `setTool`, `resetMode`, `toolsOf(modeId)`, `catalogueFor(sessionId)`, `grants()`, `revoke(id)`, `revokeAll()`, `unblock(id)`, `history()`, `waiting()`, `clearWaiting(id)`, `record(sessionId)`; `kinds()` gives the one list of file-changing and command tools.

### Helpers and models

Some tools start helper agents: a Mission, deep research, Agent swarm, the Tier tools, Code power. The models chip says whether helpers use the thread's model (**One model**, the default and the lightest) or the models set for their roles in Settings → Model tiers.

### Model tiers

The model button holds the model, the effort (Off to Ultra Code), the tier and saved model versions. The five starter tiers are Fast, Balanced, Deep, Creative and Code review; no model is preset, so a tier applies to whatever model the thread uses until you pick one. A tier can carry its own instructions, skills, connectors and fallback models.

### Mission

A Mission keeps working on a goal by itself. Start it with **Start Mission** beside Send, or by typing `/mission` and the goal: what you typed and the thread so far become its brief (choosing **Mission** in Depth only selects it; Send keeps talking at the thread's own Depth). Both use this thread's Mission settings (Depth → **Mission settings…**; starting values in Settings → Mission): a **time limit** (2 hours unless you change it; **No time limit** runs until its checklist is done), **laps** (10; 0 means no lap limit) and **steps** (0: worked out from the laps). A lap is: work on the open items, run the overall commands, review. Two laps in a row that find nothing end it early. While it works, a strip above the chat box says how it stands, and the main button takes Send's place: **Add note**, **Answer and continue** or **Resume**. Its questions show in a card above the chat box; after it ends with questions left, answering them there continues the same Mission. How freely it may change files in the thread's folder is its **Mission access**: **Restricted** (the default), **Ask** or **Auto**. Commands: `/mission <goal>` to start, `/mission stop` to pause, `/mission resume`, `/mission end` for the report, `/mission back <checkpoint>` to undo what it changed. Before a Mission changes files, it saves a checkpoint.

### Budget guard

Stops a run that is running away. A **run** is everything the assistant does after one message of yours, helper agents included. A **step** is one request to a model.

| Limit | Starts as | What it counts |
|---|---|---|
| Steps | 300 | requests the thread itself makes in one run |
| Steps by helpers | 1,500 | requests its helpers (deep research, Mission) make in one run; 0 shares the Steps limit |
| Tokens | 20,000,000 (5,000,000 on a first install) | tokens sent and received, helpers included |
| Minutes | none | how long one run may last |
| Same tool call in a row | 8 | a repeated call is treated as a loop |
| Tokens per day | none | all threads together |
| While a Mission is on: steps / tokens | 5,000 / 60,000,000 | a Mission's own allowance in place of the step and token limits above (never lower than they are) |

At a limit the run stops and says why; the thread is kept and your next message starts a fresh allowance. 0 means no limit. The guard counts tokens, not money.

### Memory, skills and learning

**Code tools** (Code map and Code power) offer eight guides (skills): four to reverse-engineer a codebase, website, API or file format, or installed app, and four to review a pull request, fix failing tests in a loop, try several solutions, and review hunks. On a **new install** they are offered only in Code mode (switched off in Chat and Cowork mode); on an install you already have, nothing changes. Choose where they are offered with the switches "Offer them in Chat / Cowork / Code" at the bottom of Settings → Code tools. A guide you type yourself with `/` always works.

Memory keeps facts for later threads, per mode where you choose. Skills can be switched off per mode. Learning from your corrections is off until you switch it on, and nothing is installed without your yes.

### Keeping Recon apart

Recon is a **sealed** space. Every thread in it, whatever its mode, keeps Recon's rules: no programs, nothing online except Recon's own networks, files only in its Recon room, no app instruction files or skills, and no move out of Recon. Global search never shows its threads, Sync never copies them, Mission refuses to run in it, Learning never reads it, and Artifacts keeps nothing from it. Details: the Recon section of [ADD-ONS.md](ADD-ONS.md).

## 3. Each mode, a little closer

- **Chat, Cowork, Code.** Cowork and Code have working methods you can see and change in Settings → Modes: Code reads before changing, keeps a step list, makes small exact changes, runs the tests and reads the output, and asks before anything it cannot undo. Cowork has a method for working with files and everyday jobs.
- **Data.** Reads CSV and modern Excel files (Excel's older .xls, Numbers and Parquet files are not read as tables); profiles them, queries them, draws charts (a chart is checked before it is shown) and runs Python in its own sandbox. New files go to a `data-output` folder.
- **Finance.** Figures, filings, prices, news and social mood for a company, sector, economy or market. The selection under the chat box (kind, market, focus, period) says what the thread is about. It is research, not advice. An optional adviser mode, off by default, needs a one-time typed acceptance and ends answers with "AI output, not regulated advice."
- **Research.** Plans sub-questions, sends helpers to search and read, reviews what is missing, searches again, and writes a cited report. Its Depth sets the size of the run.
- **Scout.** Looks for postings, titles, demand and pay in the markets you choose. Nothing is sent or applied for.
- **Recon.** See above. Settings → Recon holds its networks and rules.
- **Content.** A method for writing: ask what to build, read before writing, keep sources apart from your words and the assistant's, mark what is unsourced, save every draft, publish nothing.
- **Devices.** Only for your own devices. The assistant never writes a device command itself.
- **Creator Plus.** Builds and improves add-ons in a trial copy; nothing in your setup changes without your yes.
- **Automations.** Plans automations; the Automations page and Settings → Alerts show their runs and how you are told.

## 4. The Settings window

Open it from **More → Settings**. The Plus pages are sorted into groups, each page with an icon:

| Group | Pages |
|---|---|
| Everyday | Start here, Colours, Activity, Alerts, Notify, Diagrams, Artifacts |
| Models and spending | Model tiers (with Instructions for every thread, Sampling and Advanced), Role prompts, Sampling, Budget guard, Usage, Arena |
| Spaces and modes | Spaces, Modes, Start places, Finance, Data, Scout, Content, Devices, Split Plus |
| Workshop | Creator Plus, Tuner Plus, Benchmark |
| Agents and code | Mission, Swarm, Code tools (Code map, Reviews and fixes) |
| Research and sources | Web sources, Research, Deep research, Library, PDF reader |
| Privacy and safety | Tool access, Tool ledger, Mac, Recon |
| Learning | Memory, Learning, Self-improve, Learned skills |
| Add-ons and updates | About Plus |
| Advanced | More settings |

A page only shows when its add-on is installed and switched on.

**Search.** The field at the top of the window (Cmd-F) finds any page or setting by name or by what it does. Enter opens the result, scrolls to it and outlines it. The search index lists 1,018 entries; 183 of them are marked **configuration file only**: they have no control on any page, and are changed in the setup file (**Open configuration file** at the top of the window; quit the app first, and keep a copy).

**The gear beside Send** opens the page of the thread's mode as a window over the thread. Plain chat, Chat, Cowork and Code open the Modes page.

**Where the starting values come from.** A first install of Plus starts with three safer values: a 5,000,000-token limit per run, Activity showing words ("Writing", "Reading prompt") instead of codes ("TG", "PP"), and the Code review tier at High effort. The same first install switches the eight Code tools guides off in Chat and Cowork. An update to a newer version never changes a value; your setup stays as it is. Each value can be changed on its page.

## 5. When the app updates

The add-ons were written for DeepSeek Harness 0.2.2 up to, but not including, 0.3.0. If the app updates beyond that, the installer refuses to install into it and says why, and the app itself may switch the add-ons off with a warning until a newer Plus is out. See the README.
