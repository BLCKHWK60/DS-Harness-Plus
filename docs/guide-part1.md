# DeepSeek Harness Plus: the guide

Plus is a set of 48 add-ons for the DeepSeek Harness desktop app. This guide says what each part does, where to find it, how to use it, and what its settings are.

- **Part 1** is for using it: the tabs, the chat box, projects, and the main features, in the order you meet them.
- **Part 2** lists every slash command.
- **Part 3** is the reference: every add-on with every setting and its starting value. It is generated from the add-ons' own code by `scripts/dev-guide.mjs`, so it does not go out of date; run `node scripts/dev-guide.mjs` after changing an add-on.

Installing, updating and removing are in the [README](../README.md), which also explains the words used here (add-on, mode, tab, conversation, workspace, tier). The history of each feature is in [ADD-ONS.md](ADD-ONS.md).

## Part 1: using it

### 1. Where things are

| Place | What is there |
|---|---|
| **Top of the sidebar** | The tabs: Chat, Cowork, Code, and Finance, Data, Research, Scout and Recon once you switch them on. With more than three they sit in rows of three. How many of your own modes get a tab is set in Settings → Modes. |
| **Sidebar, under the tabs** | The tab's own pages (Automations, Connectors, Skills, Plugins…), then its projects and conversations, then the Trash. |
| **Bottom of the sidebar** | Your DeepSeek balance, and **More** (Settings, look options). |
| **Chat box, left** | Web, Depth, the models chip, Tools (the same in every tab. Web is one selector everywhere: Off, All or any mix of sources; in Research and Scout Off is greyed; in Recon it also has Tor, Usenet and I2P. In a Finance conversation: its selection too). |
| **Chat box, right** | The model button: model, effort, tier. |
| **Above the chat box** | The activity line, with the arrow that folds the chat box away. |
| **Under an answer** | Copy, Rerun, Branch, usage, and pictures the assistant drew. |
| **A project's page** | The gear on a project's row: name, type, instructions, files, conversations. |
| **Settings** | More → Settings. Most add-ons have a page there. |

A slash command is typed in the chat box, for example `/mission`. The app shows a command's answer as one line; click the line to open the rest.

### 2. The tabs

A tab is a way of working. Clicking a tab returns you to the conversation you last had open there.

| Tab | For | What is special |
|---|---|---|
| **Chat** | Plain conversation. | No tools. Switch Web on and it may search the web and read pages. No projects. |
| **Cowork** | Any work in a folder. | All tools, and a working method: understand the task first, keep a step list, ask before changing your files, check the result, report plainly. Projects with types (see 4). |
| **Code** | Programming. | All tools, and a working method: read first, small changes, run the tests, report plainly. |
| **Finance** | Companies, markets, economies. | Its own data tools and drop-downs for subject, market, focus and period. Off until you switch it on in Settings → Finance. |
| **Data** | Analysing data files in a folder. | Its own table, chart and Python tools. Runs Read Only. Off until you switch it on in Settings → Data. |
| **Research** | A question that needs many sources. | Helper agents search and read in rounds and write a report with numbered sources. Runs Read Only. Off until you switch it on in Settings → Research (see 8). |
| **Scout** | Finding work: jobs, freelance projects, contracts, public tenders. | Its own job sources and checks; a scored report with draft messages, and nothing is sent. Off until you switch it on in Settings → Scout (see 9). |
| **Recon** | Research on .onion sites and Usenet text newsgroups. | Isolated: only its own tools (.onion sites through Tor); nothing from other conversations comes in or goes out. Needs the `tor` program. Off until you switch it on in Settings → Recon (see 10). |

- **Where a new conversation starts.** Every tab except Code starts a new conversation in **Scratch**: a private folder of its own, never a folder of yours, with no project instructions; its files go with it when you delete it. Code starts in the open or last used project, Recon in its room. Change a tab in **Settings → Start places**. The **Scratch | Folder** switch on the start page starts the other way once. A Scratch conversation shows a dashed Scratch mark in the chat box and sits in its tab's **Scratch** group; its `⋯` has **Keep in a project…** (copies its files into a new folder of a project and continues there), and **Clean up…** beside the group moves old ones to the trash.
- Change what a tab's mode allows in **Settings → Modes** (tools, file sandbox, tier, instructions). The same page sets the Depth new conversations start with, the mode for scheduled tasks, how many of your modes get a sidebar tab (1 to 5), and switches for the built-in working methods of Code and Cowork.
- A mode's tier applies to a new conversation from its first message.
- **The access level** (file sandbox): Chat, Data, Research and Recon set Read Only and Code sets Workspace Write, only when a conversation starts in the mode or is moved into it. A level you pick by hand in the chat box is kept, also after a restart. Moving to a tab that sets none (Cowork, Finance, Scout) puts back the earlier level, unless you changed it by hand.
- `/mode` shows or switches the mode of a conversation. With the sidebar on, before the first message the selected tab decides: `/mode` then only names the tabs.

### 3. The chat box, button by button

The row under the text field is the same in every tab, from left to right. On a narrow window the words shrink to icons, and the right-hand buttons may move to a second line; nothing is lost. What is described here is what the buttons do in a conversation that is open. A button that cannot be used in a tab is greyed, with the reason in its tooltip.

**Above the text field (start page of a new conversation)**

| Control | What it does | How to use it |
|---|---|---|
| **Place chip** (**Scratch** or **Folder**, and the folder's name) | Where this conversation works. **Scratch** is a private folder of its own, never one of yours; its files go away with the conversation. **Folder** is one of your own projects: the assistant can see and (if the access level allows) change the files in it. | Click the name to pick a project, or add a folder. A conversation cannot change its folder after it has started. Where new conversations of each tab start is set in Settings → Start places. |
| **Working-style chip** (for example **Standard mode**) | The app's own choice of how the assistant works (its agent preset). Not the same as the Chat, Cowork or Code mode, which the tab sets. | Click to change it before the first message. |

**In the row**

| Control | What it does | How to use it |
|---|---|---|
| **+** (Add files or run commands) | The app's own: attach files, or run a command. | Click. |
| **Access level** (**Read Only**, **Workspace Write** or **Full access**) | How much the assistant may do to your Mac. Read Only: it can look but not change your files without asking you first. Workspace Write: it may change files in this conversation's folder. Full access: no limit from the app's sandbox. | Click to pick. A level you pick by hand is kept, also after a restart. A conversation that starts in Chat, Data, Research or Recon starts at Read Only; Code starts at Workspace Write. |
| **Model health dot** | Whether the models you use answer. Green: all are up. Amber or red with a name: that model or connection is slow or down. | Click to list every model with its state and last error. It shows nothing until Route health has models to check. |
| **Web** (**Off**, **All**, or any mix of sources) | Which part of the internet the assistant may use in this conversation. **Off**: no web search, no page reading, and no other tool or program that goes online (connectors you added stay on). **All**: every kind of source, as before. Or tick any mix of Verified sources, Academic papers, News, Ordinary sites, Forums, Social media, Archives and Other (your own sources). Recon also has Tor, Usenet and I2P. | Click and pick. Research and Scout always need the web, so Off is greyed there (it works only while Tools are off). Settings → Web sources holds the lists and your own sources. |
| **Depth** (**Quick**, **Standard**, **Thorough**) | How much work the conversation gets: how much it searches when Web is on, planning, checks and reviews. In Research, Scout and Recon it also sets the size of a research run: about 10, 25 or 45 minutes. | Click and pick. It is the same in every tab, and where new conversations start (also in Settings → Modes). It stays visible but greyed while Tools are off. How hard the model thinks is the Effort on the model button, not this. |
| **Models chip** (**One model** or **3 models**) | Whether helper agents use this conversation's model, or other models as well. | Click to switch for this conversation. One model is the default and needs the least memory. |
| **Tools** (**Tools on** or **Tools off**) | What the assistant can call right now. The list has three parts: can call, cannot call, and loaded when needed. | Click to see the list and to switch all tools on or off for this conversation. Off: the assistant is offered no tool at all, and the web is off too. A change applies from your next message. In Chat, tools mean searching and reading the web. |
| **Long run** | Starts a Long run (Mission) from what you typed in the text field: the assistant keeps working on that goal by itself, for up to 10 laps and 2 hours unless you change this. It may change files in the folder and use the web. | Type the goal, click **Long run**, read the question and confirm. While it runs the button shows **Running**, with **Pause**, **Finish this lap** and **End** beside the chat box. A Long run can use many tokens. Its settings are in Settings → Mission. Greyed, with the reason in its tooltip, where a run cannot start (for example the conversation has no folder); hidden only while Mission is switched off. |
| **Export** (download arrow) | Saves this conversation as a file. | Click, choose **Conversation only**, **Conversation and thinking** or **Full session log**, and a file type (Markdown, plain text, HTML, JSON or PDF), then **Download**, **Copy to clipboard** or **Make PDF**. The full log holds everything the app stored, which can include keys and passwords; a tick hides them (it is on by default for the full log). In Recon, Export opens Recon's own export window. |
| **Settings gear** | The settings of this tab's mode, in a window over the chat, without leaving the conversation. | Click. **Web sources…** and **Open in Settings** are in its top bar. A mode with its own extras (Recon's Export…, Bench rules) keeps them here. |
| **Activity line** | What is running right now: reading the prompt, writing, tools, helpers, other conversations, with speeds. | Look. The arrow at its right end folds the chat box down so more of the conversation shows; click again to bring it back. Settings → Activity changes its look. |
| **Model button** (the model's name) | Model, effort and tier for this conversation. | Click to pick the model, drag the effort from Off to Ultra Code, choose a tier or a saved model version. A change applies from the next message. |
| **Send** (round arrow) | Sends the message. | Click. |

**Under the text field: the options of a tab**

Some tabs show their own choices in one area under the chat box, in the same place for every tab; on the start page they sit under the box, and in a conversation under its status line. Only the tab they belong to shows them.

| Tab | What is there | What it does |
|---|---|---|
| **Scout** | The kind of work (Any work type, Employee, Freelance, Contract, Internship, Public tender), the markets to search (for example USA, UK, Germany; click **+ Market** for more, or **Remote**), and **+ Files** (a resume, a LinkedIn export or notes). | Sets where Scout searches and what it looks for. A line under them says what will happen, for example "Nothing is sent or applied for." |
| **Finance** | A five-part selection: what it is about (Company, Sector, Economy, Whole market), the market, the focus (Full picture, Figures, News, Mood, Outlook and risks, Comparison), the period (Latest quarter, 1 year, 5 years), and the subject you type. | Press a part to change it, for this conversation only, from the next answer on. The line under it says what the assistant will do and ends with "Research, not advice." |
| **Creator Plus** | What you want to do (New plugin, Improve, Find what went wrong, Rebuild, Combine or split, Find gaps, Check after an update, Explain) and which add-ons or plugins it may look at (**+ Plugin**, or **All plugins** on purpose). | Picks the job and its target before you write the request. Locked entries are the app's own and are only read. |
| **Code**, **Chat**, **Cowork**, **Data**, **Research**, **Recon** | Nothing extra here. | Their choices are the buttons in the row above (Research's Focus is the ticks of the Web button). |

**Under an answer**

| Control | What it does | How to use it |
|---|---|---|
| **Copy**, **Branch**, usage | The app's own. | Click. |
| **Rerun** | Asks the same question again in a fresh copy of the conversation, with the model selected now. | Pick another model, then press the round arrow. The old answer stays in the original. |

### 4. Projects and project types (Cowork)

A project is a folder with a name, its own instructions, its files and its conversations.

1. In the sidebar list press **+ New** and pick a folder.
2. The project's page opens. Under **What kind of project is this?** pick a type, or leave **Blank**.
3. Change the instructions as you like and press **Save**.
4. **New conversation** starts work in the project. The gear on the project's row brings you back to its page.

| Type | What it sets up |
|---|---|
| **Blank** | Nothing. Cowork as it has always been. |
| **Research** | Research from many sources, written up as cited reports kept in the folder. |
| **Learn** | A tutor that teaches from your materials and keeps `progress.md` and `flashcards.md`. |
| **Paperwork** | Letters, bills, contracts and deadlines. Keeps `deadlines.md`. Conversations start with Web set to Off. |
| **Plan** | Tasks, owners, dates, status and risks, kept in `plan.md`, `risks.md`, `decisions.md`. |
| **Write** | Long-form writing with an outline, a style guide and revision passes. |

- **Your own types:** under the instructions, **Save as my preset…** keeps the current text as a type of your own.
- **Generate with a model…** lets a model write the instructions from a summary of the folder. You see what would be sent first; keys and `.env` files are left out; a model on the internet needs your tick; the model gets no tools. The result is shown with changes marked, and nothing is saved until you press Save.
- **Earlier versions** keeps the last 10 saved versions, with "Put back".
- **Add files** on the page copies files into the folder and never replaces one.

### 5. Mission: several models on one goal

In a conversation that has a folder, type `/mission` and the goal: `/mission make every test pass and add a --json option`.

1. A **planner** reads the project and writes a checklist. Each item says when it is done and, where it can, a command that proves it.
2. **Workers** do one item at a time. Plus then runs the item's command itself.
3. Plus runs the overall commands (tests, build). One that fails becomes a new item.
4. A **reviewer** reads everything that changed against the goal.
5. You get a report: each item PASSED (a command proved it), REVIEWED (the reviewer judged it) or not done, and the checkpoint that undoes the run.

| You type | What it does |
|---|---|
| `/mission <goal>` | Starts a run. Name a mode first to choose it: `/mission auto <goal>`. |
| `/mission stop` / `resume` / `end` / `report` | Pause, carry on, close with a report, see how it stands. |
| `/mission restricted` | Permission mode: nothing outside the folder, never asks for it; inside, asks once per existing file before changing it. |
| `/mission ask` | The same inside; for anything outside it must ask you. |
| `/mission auto` | Free inside the folder; for anything outside it must ask you. |
| `/mission off` | Lifts the permission mode. |
| `/mission checkpoints` / `back 12` | List the checkpoints; put the folder back as it was at one. Going back can be undone. |

- The first line of a run says whether it uses **one model** or several, and names them. Switch with the models chip before starting.
- If you are away when a worker needs your yes, the item is set aside after 3 minutes and the run carries on. `/mission resume` takes it up again.
- Checkpoints live in a hidden `.dsh-mission` folder in the project and need git.
- Models, limits and the default mode: **Settings → Mission**.
- Not in Recon conversations. On a tier with Sub-agents switched off, a run cannot start or resume (its planner, workers and reviewer are helpers); the permission modes and checkpoints still work.

### 6. Data

Switch it on in **Settings → Data**, open the Data tab, and pick the folder that holds your files.

- Ask in plain words. After a number, a mark like `[Q7]` names the query that produced it.
- Tables: CSV, TSV, JSON, Excel. Documents: Word and text. PDFs through the PDF reader.
- Bar, line and scatter charts are drawn from the data and shown under the answer, and each is also saved as an SVG file in a `data-output` folder in your folder. Pie and area charts are drawn with Python.
- For statistics, cleaning and combining files the assistant runs Python in a sandbox: no internet, it reads your folder and nothing else in your home folder, and it writes only into the `data-output` folder.
- Data conversations run Read Only: the app's file and command tools cannot change your files without asking you first. (Those started before 0.57.0 keep their permission.)
- "Save this analysis as …" keeps it; "run … again" reports what moved.
- A new Data conversation starts with Web on, so it can search the web and run deep research. The words it searches for then go to the app's web search provider. Data's own tools never send your files, and the assistant is told to keep private details from them out of searches (an instruction, not a check). With Web set to Off in the chat box it works from your files alone.
- It starts with the core tools plus the data and PDF tools; others are added when needed (Settings → Modes → Load tools as needed).

### 7. Finance

Switch it on in **Settings → Finance** and open the Finance tab. Pick subject, market, focus and period on the start page, then ask. Once the conversation has started, its chat box shows the same selection; change a part there for this conversation only.

- It puts reported figures, news and what people say side by side, with sources and dates, and draws charts.
- **Adviser** (Settings → Finance → Adviser, off by default): you accept a warning once by typing "I understand"; it then ends with a clear call and the line "AI output, not regulated advice.", and keeps a profile of you that you can edit there.
- **Watchlist**, **your own markets**, **your own data sources** (with keys kept in the app's secret store) and **scheduled briefs** are on the same page.
- With Tools off it has no data tools: it may give figures from memory, each marked as from memory and possibly out of date, never with a source.
- It is an AI model working from what it could fetch. It is not a licensed adviser and can be wrong.

### 8. Research

Switch it on in **Settings → Research** (it needs the Deep research add-on) and open the Research tab. A question that needs outside facts gets a full run; a quick fact that one or two pages settle is looked up directly.

- Pick **Depth** (Quick, about 10 minutes; Standard, about 25; Thorough, about 45) and the **Web** sources (for example only Academic papers, or News) in the chat box.
- Helper agents plan, search and read in rounds; progress shows above the chat box. The report cites its sources by number and ends with three follow-up questions as buttons.
- Each source is marked **read**, **seen only in search results, not read**, or **not read, and not seen in search results**. Findings from pages no helper read stay in the report, labelled in the sentence. The check makes sure every citation is in the source list; it does not compare claims with the pages.
- A Research conversation runs Read Only. Reports are saved; Settings → Research lists them, with **Show in Finder**.

### 9. Scout

Switch it on in **Settings → Scout** and open the Scout tab. Fill in the work, place, pay target and work type, pick the markets, and ask. **+ Files** adds a resume or notes.

- A run researches the field, searches its sources, reads the promising postings, and scores each opportunity on fit, freshness, pay and legitimacy, each with a reason.
- Likely ghost jobs and scams are flagged with the signs behind them. These are hints, not proof.
- For the best ones it plans who to contact, how and when, with a short draft message. Drafts only: nothing is sent.
- The report is saved as Markdown and a table (CSV). A later run says what is new since the last report. **Settings → Scout → Saved reports** lists them.
- Sources include US and UK public tenders (Contracts Finder, Find a Tender, SAM.gov with a free key) and freelance boards found through search engines only. Switch sources on or off in Settings → Scout.
- A search that holds an email address or a phone number is refused.

### 10. Recon

Install the `tor` program (`brew install tor`), switch Recon on in **Settings → Recon**, and start with the **New** button in the Recon tab.

- The start page has starter chips (Search .onion sites, Search Usenet, News coverage, Old web page, Check a claim) and a status bar: Tor, Usenet, the Internet Archive's route, the model, and whether findings may go to it.
- A model on this Mac or your own network gets what Recon finds. A cloud model gets it only after you type `/recon cloud`.
- **Settings → Recon → More sources:** the Internet Archive and GDELT news, off until you switch them on. **Read Internet Archive copies directly (not through Tor)** is on by default: copies are then read straight from the Archive, which sees this Mac's internet address (or your VPN's, when the page goes out through a WireGuard tunnel you set up in Recon). Through Tor the Archive refuses most reads.
- Every source gets a number like [S3]. Citations, links and `/recon export` still work after a restart.
- Recon conversations never show in Global Search and are never synced. `/recon end` ends one and deletes it.

### 11. Models and helpers

- **Settings → Model Tiers:** tiers (ways of working: effort, web access, sub-agents, instructions), saved model versions (a model with its own effort and temperature), and role models (plan, implement, review, fast).
- **The models chip** decides per conversation whether helpers use the conversation's model or the role models.
- **Settings → Swarm:** named groups of helper agents that work side by side, in order, or in debate.
- **Settings → Mission → Models for a run:** models for planner, workers and reviewer, also per project.

### 12. Everyday helpers

| Feature | What it does | Where |
|---|---|---|
| **Memory** | A short list of lasting facts and preferences about you, given to every new conversation. You add, edit and delete every entry; the assistant can only suggest one. | Settings → Memory |
| **Learned skills** | Reads where you corrected the assistant and proposes skills, Memory facts and project rules. Nothing is installed until you say yes; Recon conversations are never read. | Settings → Learned skills, `/skills learn` |
| **Library** | Lets the assistant search your own documents and quote them with the file and page. | Settings → Library |
| **PDF reader** | Reads, searches and, when needed, OCRs PDFs page by page. | Settings → PDF reader, `/pdf` |
| **Diagram builder** | Draws charts and diagrams and shows them under the answer. | Settings → Diagrams |
| **Code guides** | The eight Code tools guides (four reverse-engineering, four for reviews and fixes) are offered only in the Code tab on a new install; on an existing install nothing changes. | Settings → Code tools → "Where these guides are offered" |
| **Code map** | A compact map of a code project, so the assistant looks things up instead of reading whole files. | Settings → Code map, `/codemap` |
| **Learning** | A tutor that makes you attempt first and gives hints step by step. | Settings → Learning, `/learn` |
| **Automations and alerts** | Your scheduled tasks on one page: how each run ended, what needs you, what was missed while the app was closed, a timeline; pause, change or delete one (deleted ones stay in the trash for 30 days); alerts on this Mac and on your phone. The Automations tab's chat makes and changes them. | Sidebar → Automations (every tab), the Automations tab, Settings → Alerts |
| **Mac bridge** | Lets the assistant find your files and run your Apple Shortcuts, only where and what you allow. | Settings → Mac |
| **Budget guard** | Hard limits that stop a task that is running away: steps, tokens and minutes per task, a loop check, and an optional daily limit. | Settings → Budget guard |
| **Balance** | Your DeepSeek balance at the bottom of the sidebar. | Sidebar |
| **Usage** | Counts model requests and tokens per day, provider and model. Stores no prompt text. | Settings → Usage, `/usage` |
| **Archive and Trash** | Archive a conversation, or delete it into a 30-day trash. | The ⋯ menu on a conversation |
| **Global Search** | Finds conversations by title and message text in every tab, and projects by name. Never shows Recon conversations. | Cmd-K, or the search icon at the top of the sidebar |

### 13. The model lab

| Feature | What it does | Where |
|---|---|---|
| **Self-improvement** | Improves the instructions a model is given, tested on your own tasks; you approve every change. | Settings → Self-improve, `/evolve` |
| **Benchmark** | Runs prompt suites over a grid of models and sampling settings and recommends the best ones. | Settings → Benchmark, `/benchmark` |
| **Arena** | Ask several models the same question, compare the answers blind, and reveal who wrote what. | Settings → Arena, `/arena` |
| **Model router** | Routes each turn to one of 2 to 5 candidate models using a small routing model. Nothing is set after install. | configuration file, `/router` |
| **Route health** | Checks that your model servers are reachable and moves a conversation to its tier's fallback when one is not. | configuration file, `/routes` |
| **Sampling presets** | Named sampling settings chosen per kind of task, mode or conversation. | Settings → Model Tiers → Sampling, `/sampling` |
| **Role prompts** | Adds your own instruction sections to what the assistant is told, optionally only for chosen tiers. | Settings → Model Tiers → Instructions for every conversation file |

### 14. Housekeeping

| Feature | What it does | Where |
|---|---|---|
| **Privacy** | Switches off the app's two reporting channels to its maker. | `/privacy` shows the state |
| **Colours** | Colour schemes for the whole app. | Settings → Colours |
| **Look** | Hide the logos, show the date as the title, wide chat. | Sidebar → More |
| **Context saver** | Shortens large tool results before the model sees them and keeps the original for retrieval. Off until configured. | configuration file, `/saved` |
| **Notify** | Runs a command you choose when a turn ends or the app needs your approval. | Settings → Alerts, `/notify` |
| **Media tools** | Image generation and editing tools, and an approval gate for browser and computer-use tools. With Web Off the image tools go, unless the image service is on this Mac or your own network. | configuration file |
| **Sync, Shared settings** | Keep a second Mac in step. Recon conversations are never synced. | README, "Using it on a second Mac" |

Where a row says "configuration file": that add-on has no settings page. Open **Settings → Open configuration file** and change its values there.

