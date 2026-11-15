# DeepSeek Harness Plus: the guide

Plus is a set of 41 add-ons for the DeepSeek Harness desktop app. This guide says what each part does, where to find it, how to use it, and what its settings are.

- **Part 1** is for using it: the tabs, the chat box, projects, and the main features, in the order you meet them.
- **Part 2** lists every slash command.
- **Part 3** is the reference: every add-on with every setting and its starting value. It is generated from the add-ons' own code by `scripts/dev-guide.mjs`, so it does not go out of date; run `node scripts/dev-guide.mjs` after changing an add-on.

Installing, updating and removing are in the [README](../README.md). The history of each feature is in [ADD-ONS.md](ADD-ONS.md).

## Part 1: using it

### 1. Where things are

| Place | What is there |
|---|---|
| **Top of the sidebar** | The tabs: Chat, Cowork, Code, and Finance, Data, Research, Scout and Recon once you switch them on. With more than three they sit in rows of three. How many of your own modes get a tab is set in Settings → Modes. |
| **Sidebar, under the tabs** | The tab's own pages (Automation tasks, Connectors, Skills, Plugins…), then its projects and conversations, then the Trash. |
| **Bottom of the sidebar** | Your DeepSeek balance, and **More** (Settings, look options). |
| **Chat box, left** | Web, Depth, the models chip, Tools (Depth is in every tab and hidden only while Tools are off; in Research and Scout there is no Web button, and Research adds Focus; in a Finance conversation: its selection too). |
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

- Change what a tab's mode allows in **Settings → Modes** (tools, file sandbox, tier, instructions). The same page sets the Depth new conversations start with, the mode for scheduled tasks, how many of your modes get a sidebar tab (1 to 5), and switches for the built-in working methods of Code and Cowork.
- A mode's tier applies to a new conversation from its first message.
- **The access level** (file sandbox): Chat, Data, Research and Recon set Read Only and Code sets Workspace Write, only when a conversation starts in the mode or is moved into it. A level you pick by hand in the chat box is kept, also after a restart. Moving to a tab that sets none (Cowork, Finance, Scout) puts back the earlier level, unless you changed it by hand.
- `/mode` shows or switches the mode of a conversation. With the sidebar on, before the first message the selected tab decides: `/mode` then only names the tabs.

### 3. The chat box

| Control | What it does | How to use it |
|---|---|---|
| **Web** | Whether the assistant may use the internet in this conversation. | Click and pick **On** or **Off**. Off takes away web search, page reading and other tools that go online (an outside image service too), and stops commands and programs that go online; connectors you added stay on and can still reach the internet. Not shown in Research and Scout, which always have the web. |
| **Depth** | How much work the conversation gets: how much it searches when Web is on, planning, checks and reviews. | Click and pick **Quick**, **Standard** or **Thorough** (at least ten searches and ten pages read, key facts checked in two sources, a short plan, and one review by a helper in tabs that can start helpers; just before the turn ends the model gets one check and fixes only what is missing, shown as a grey row). The Depth you pick is also where new conversations start (also set in Settings → Modes). It is the same in every tab: in Recon it also sets how hard Recon searches, and in Research and Scout (and any deep research run) it sets the size of a research run: about 10, 25 or 45 minutes. How hard the model thinks is the **Effort** on the model button. |
| **Focus** (Research tab) | Where a research run looks first: Web, News or Academic. | Pick in the chat box of a Research conversation. How long the run takes is the Depth button. A research run works in rounds with helper agents and ends in a cited report. |
| **Selection** (Finance tab) | What a Finance conversation is about: kind, subject, market, focus, period. | Shown once the conversation has started. Press a part to change it, for this conversation only. |
| **Models chip** | Shows whether helper agents use this conversation's model (**One model**) or others as well (an amber **3 models**). | Click to switch for this conversation. One model is the default and needs the least memory. |
| **Tools** | Shows what the assistant can and cannot call right now, with one switch for all tools. | Click to see the list. |
| **Model button** | Model, effort and tier for this conversation. | Click to pick. Saved model versions come first. |
| **Activity line** | What is running: prompt processing, generating, tools, helpers, with speeds. | The arrow at its right end folds the chat box down so more of the conversation shows. Click again to bring it back. |
| **Rerun** (under an answer) | Asks the same question again in a fresh copy of the conversation, with the model selected now. | Pick another model, then press the round arrow. The old answer stays in the original. |

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
- **Adviser** (Settings → Finance → Adviser, off by default): it then ends with a clear call and adds no disclaimer, and keeps a profile of you that you can edit there.
- **Watchlist**, **your own markets**, **your own data sources** (with keys kept in the app's secret store) and **scheduled briefs** are on the same page.
- With Tools off it has no data tools: it may give figures from memory, each marked as from memory and possibly out of date, never with a source.
- It is an AI model working from what it could fetch. It is not a licensed adviser and can be wrong.

### 8. Research

Switch it on in **Settings → Research** (it needs the Deep research add-on) and open the Research tab. A question that needs outside facts gets a full run; a quick fact that one or two pages settle is looked up directly.

- Pick **Depth** (Quick, about 10 minutes; Standard, about 25; Thorough, about 45) and **Focus** (Web, News, Academic) in the chat box.
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
- **Settings → Recon → More sources:** the Internet Archive and GDELT news, off until you switch them on. **Read Internet Archive copies directly (not through Tor)** is on by default: copies are then read straight from the Archive, which sees this Mac's internet address. Through Tor the Archive refuses most reads.
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
| **Library** | Lets the assistant search your own documents and quote them with the file and page. | Settings → Library |
| **PDF reader** | Reads, searches and, when needed, OCRs PDFs page by page. | Settings → PDF reader, `/pdf` |
| **Diagram builder** | Draws charts and diagrams and shows them under the answer. | Settings → Diagrams |
| **Code map** | A compact map of a code project, so the assistant looks things up instead of reading whole files. | Settings → Code map, `/codemap` |
| **Learning** | A tutor that makes you attempt first and gives hints step by step. | Settings → Learning, `/learn` |
| **Automations and alerts** | Shows how every scheduled task run ended on one page, lists conversations that need you, and alerts you on this Mac and on your phone. | Sidebar → Automation runs, Settings → Alerts |
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
| **Benchmark** | Runs prompt suites over a grid of models and sampling settings and recommends the best ones. | Settings → Benchmark, `/bench` |
| **Arena** | Ask several models the same question, compare the answers blind, and reveal who wrote what. | Settings → Arena, `/arena` |
| **Model router** | Routes each turn to one of 2 to 5 candidate models using a small routing model. Nothing is set after install. | configuration file, `/router` |
| **Route health** | Checks that your model servers are reachable and moves a conversation to its tier's fallback when one is not. | configuration file, `/routes` |
| **Sampling presets** | Named sampling settings chosen per kind of task, mode or conversation. | Settings → Sampling, `/sampling` |
| **Role prompts** | Adds your own instruction sections to what the assistant is told, optionally only for chosen tiers. | configuration file |

### 14. Housekeeping

| Feature | What it does | Where |
|---|---|---|
| **Privacy** | Switches off the app's two reporting channels to its maker. | `/privacy` shows the state |
| **Colours** | Colour schemes for the whole app. | Settings → Colours |
| **Look** | Hide the logos, show the date as the title, wide chat. | Sidebar → More |
| **Context saver** | Shortens large tool results before the model sees them and keeps the original for retrieval. Off until configured. | configuration file, `/saved` |
| **Notify** | Runs a command you choose when a turn ends or the app needs your approval. | configuration file, `/notify` |
| **Media tools** | Image generation and editing tools, and an approval gate for browser and computer-use tools. With Web Off the image tools go, unless the image service is on this Mac or your own network. | configuration file |
| **Sync, Shared settings** | Keep a second Mac in step. Recon conversations are never synced. | README, "Using it on a second Mac" |

Where a row says "configuration file": that add-on has no settings page. Open **Settings → Open configuration file** and change its values there.

