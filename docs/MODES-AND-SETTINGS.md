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
