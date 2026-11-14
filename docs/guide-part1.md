# DeepSeek Harness Plus: the guide

Plus is a set of 35 add-ons for the DeepSeek Harness desktop app. This guide says what each part does, where to find it, how to use it, and what its settings are.

- **Part 1** is for using it: the tabs, the chat box, projects, and the main features, in the order you meet them.
- **Part 2** lists every slash command.
- **Part 3** is the reference: every add-on with every setting and its starting value. It is generated from the add-ons' own code by `scripts/dev-guide.mjs`, so it does not go out of date; run `node scripts/dev-guide.mjs` after changing an add-on.

Installing, updating and removing are in the [README](../README.md). The history of each feature is in [ADD-ONS.md](ADD-ONS.md).

## Part 1: using it

### 1. Where things are

| Place | What is there |
|---|---|
| **Top of the sidebar** | The tabs: Chat, Cowork, Code, and Finance and Data once you switch them on. With more than three they sit in rows of three. |
| **Sidebar, under the tabs** | The tab's own pages (Automation tasks, Connectors, Skills, Plugins…), then its projects and conversations, then the Trash. |
| **Bottom of the sidebar** | Your DeepSeek balance, and **More** (Settings, look options). |
| **Chat box, left** | Search, Deep research, the models chip, Tools. |
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
| **Chat** | Plain conversation. | No tools unless you switch Search or Deep research on. No projects. |
| **Cowork** | Any work in a folder. | All tools. Projects with types (see 4). |
| **Code** | Programming. | All tools, and a working method: read first, small changes, run the tests, report plainly. |
| **Finance** | Companies, markets, economies. | Its own data tools and drop-downs for subject, market, focus and period. Off until you switch it on in Settings → Finance. |
| **Data** | Analysing data files in a folder. | Its own table, chart and Python tools. Off until you switch it on in Settings → Data. |

- Change what a tab's mode allows in **Settings → Modes** (tools, file sandbox, tier, instructions).
- `/mode` shows or switches the mode of a conversation.

### 3. The chat box

| Control | What it does | How to use it |
|---|---|---|
| **Search** | Lets the assistant search the web. | Click to switch on or off for this conversation. The small arrow sets how hard it searches: Quick, Standard, Thorough. |
| **Deep research** | A research run in rounds with helper agents, ending in a cited report. | Switch on, then ask. The arrow sets the depth (1, 2 or 3 rounds). |
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
| **Paperwork** | Letters, bills, contracts and deadlines. Keeps `deadlines.md`. Conversations start with Search off. |
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

### 6. Data

Switch it on in **Settings → Data**, open the Data tab, and pick the folder that holds your files.

- Ask in plain words. After a number, a mark like `[Q7]` names the query that produced it.
- Tables: CSV, TSV, JSON, Excel. Documents: Word and text. PDFs through the PDF reader.
- Charts are drawn from the data and shown under the answer.
- For statistics, cleaning and combining files the assistant runs Python in a sandbox: no internet, it reads only your folder, and it writes only into a `data-output` folder there. Your files are never changed.
- "Save this analysis as …" keeps it; "run … again" reports what moved.
- With Search and Deep research off it works from your files alone.

### 7. Finance

Switch it on in **Settings → Finance** and open the Finance tab. Pick subject, market, focus and period on the start page, then ask.

- It puts reported figures, news and what people say side by side, with sources and dates, and draws charts.
- **Adviser** (Settings → Finance → Adviser, off by default): it then ends with a clear call and adds no disclaimer, and keeps a profile of you that you can edit there.
- **Watchlist**, **your own markets**, **your own data sources** (with keys kept in the app's secret store) and **scheduled briefs** are on the same page.
- It is an AI model working from what it could fetch. It is not a licensed adviser and can be wrong.

### 8. Models and helpers

- **Settings → Model Tiers:** tiers (ways of working: effort, web access, sub-agents, instructions), saved model versions (a model with its own effort and temperature), and role models (plan, implement, review, fast).
- **The models chip** decides per conversation whether helpers use the conversation's model or the role models.
- **Settings → Swarm:** named groups of helper agents that work side by side, in order, or in debate.
- **Settings → Mission → Models for a run:** models for planner, workers and reviewer, also per project.

### 9. Everyday helpers

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

### 10. The model lab

| Feature | What it does | Where |
|---|---|---|
| **Self-improvement** | Improves the instructions a model is given, tested on your own tasks; you approve every change. | Settings → Self-improve, `/evolve` |
| **Benchmark** | Runs prompt suites over a grid of models and sampling settings and recommends the best ones. | Settings → Benchmark, `/bench` |
| **Arena** | Ask several models the same question, compare the answers blind, and reveal who wrote what. | Settings → Arena, `/arena` |
| **Model router** | Routes each turn to one of 2 to 5 candidate models using a small routing model. Nothing is set after install. | configuration file, `/router` |
| **Route health** | Checks that your model servers are reachable and moves a conversation to its tier's fallback when one is not. | configuration file, `/routes` |
| **Sampling presets** | Named sampling settings chosen per kind of task, mode or conversation. | Settings → Sampling, `/sampling` |
| **Role prompts** | Adds your own instruction sections to what the assistant is told, optionally only for chosen tiers. | configuration file |

### 11. Housekeeping

| Feature | What it does | Where |
|---|---|---|
| **Privacy** | Switches off the app's two reporting channels to its maker. | `/privacy` shows the state |
| **Colours** | Colour schemes for the whole app. | Settings → Colours |
| **Look** | Hide the logos, show the date as the title, wide chat. | Sidebar → More |
| **Context saver** | Shortens large tool results before the model sees them and keeps the original for retrieval. Off until configured. | configuration file, `/saved` |
| **Notify** | Runs a command you choose when a turn ends or the app needs your approval. | configuration file, `/notify` |
| **Media tools** | Image generation and editing tools, and an approval gate for browser and computer-use tools. | configuration file |
| **Sync, Shared settings** | Keep a second Mac in step. | README, "Using it on a second Mac" |

Where a row says "configuration file": that add-on has no settings page. Open **Settings → Open configuration file** and change its values there.

