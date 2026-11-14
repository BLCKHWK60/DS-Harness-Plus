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

## Part 2: every slash command

| Command | Add-on |
|---|---|
| `/activity` | Activity indicator |
| `/arena` | Model arena |
| `/bench` | Benchmark |
| `/codemap` | Code map |
| `/engine` | Engines |
| `/evolve` | Self-improvement |
| `/learn` | Learning |
| `/mission` | Mission |
| `/mode` | Modes |
| `/notify` | Notify |
| `/pdf` | PDF reader |
| `/privacy` | Privacy |
| `/recon` | Recon |
| `/router` | Model router |
| `/routes` | Route health |
| `/sampling` | Sampling presets |
| `/saved` | Context Saver |
| `/usage` | Usage ledger |

Type a command alone to see what it offers. The app's own commands (such as `/goal`, `/permission`, `/feedback`) are not listed here.

## Part 3: reference

Every add-on, in the order of Part 1, with what it adds and every setting. "Starts as" is the value after a fresh install. Settings are changed on the add-on's page in Settings where it has one, otherwise in the configuration file.

### Cowork sidebar

Chat, Cowork and Code tabs at the top of the left sidebar, each with its own sections.

- **Where:** sidebar; start page; start page of a new conversation
- **After install:** on
- **Details:** `addons/dsh-cowork-shell/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `tabs` | `JSON.stringify(DEFAULT_TABS)` | Tab layout as JSON: `{ modeId: { newLabel, pages: [pageId], greeting, chips: [{ label, prompt, icon }] } }`. Tabs follow the Modes add-on's modes; a mode not listed here gets a tab with no pages of its own. Pages that no tab lists (for example Plugins) show un |
| `maxTabs` | `3` | At most this many tabs (the first modes in order). |
| `hideLogos` | `false` | Hide the DeepSeek logo and name at the top of the sidebar and the logo on the start page. |
| `dateTitle` | `false` | Show today's date as the start page title instead of the tab's greeting. |
| `wideChat` | `false` | Let the conversation and the message box use the whole width of the window instead of a centred column. |

### Modes

Chat, Cowork and Code modes you can switch for each session.

- **Where:** Settings → Modes; chat box, left group; action row under an answer; `/mode` in the chat box
- **After install:** on
- **Details:** `addons/dsh-modes/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `modes` | `JSON.stringify(BUILTIN_MODES)` | Mode definitions as a JSON object: `{ id: { label, tools, sandbox, defaultTier, prompt } }`. |
| `extraModes` | `'{}'` | Modes that other add-ons add, in the same JSON shape. They come after the modes above and never replace one of them. An add-on writes its own entry here and removes it when it is switched off. |
| `defaultMode` | `'cowork'` | Mode of a session that has not chosen one. |
| `scheduledMode` | `'cowork'` | Mode of a conversation that an Automation task opens. Nobody picked a tab for it, so the tab last looked at must not decide. An unknown id falls back to the first mode with all tools. |
| `sessionModes` | `'{}'` | Per-session choice as JSON: `{ sessionId: modeId }`. Written by the composer selector. |
| `sessionIsolated` | `'{}'` | Conversations that began in an isolated mode (id -> true). They stay isolated whatever happens to the mode. |
| `pruneStaleSessions` | `true` | Drop per-session entries whose Session is no longer stored, once per start. |
| `pinOnFirstTurn` | `true` | When a top-level Session starts its first turn without a chosen mode, record the mode it starts in. A later change of `defaultMode` (for example from a sidebar tab) then only affects new Sessions. |
| `sessionWeb` | `'{}'` | Per-session web switch as JSON: `{ sessionId: true \| false }`. Missing = the mode's default (off in a no-tools mode). |
| `sessionResearch` | `'{}'` | Per-session deep-research switch as JSON: `{ sessionId: true }`. While on, the model is told to use `deep_research`. |
| `sessionTools` | `'{}'` | Per-session tools switch as JSON: `{ sessionId: false }`. While off, the model is offered no tool at all. |
| `searchDepth` | `'standard'` | The slider beside the Search button: how hard the model searches. One setting for all conversations. |
| `codeMethod` | `true` | Give the Code mode a working method (read first, small changes, run the tests, report plainly) while it has no instructions of its own. |
| `researchDepth` | `'standard'` | The slider beside the Deep research button: how many rounds and helpers a research run uses. |
| `researchModel` | `'same'` | Which model Deep research's helpers run on: `same` (the model of the conversation that started the research) or `roles` (the role models set in Settings → Model Tiers). All conversations. |
| `sessionHelpers` | `'{}'` | The same choice for one conversation, as JSON: `{ sessionId: 'same' \| 'roles' }`. It decides for every tool that starts helper agents (Mission, Deep research, Agent swarm, the Tier tools, Code power). A conversation without an entry follows `researchModel`, wh |
| `rerunButton` | `true` | A Rerun button under every answer: asks the same question again, with the model now selected, in a fresh copy of the conversation. |
| `hideFeedback` | `false` | Hide the app's thumbs-up and thumbs-down buttons under answers. |
| `commandName` | `'mode'` | Name of the slash command that switches modes. |

### Mission

Give a goal to several models: a planner, workers and a reviewer, with real commands as the proof. Three permission modes keep the work inside the conversation's folder, with checkpoints you can go back to. Type /mission in a conversation.

- **Where:** Settings → Mission; `/mission` in the chat box
- **After install:** on
- **Tools the assistant gets:** `mission`
- **Details:** `addons/dsh-mission/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `true` | Off takes the /mission command and every mode away. |
| `defaultMode` | `'restricted'` | The mode `/mission on` switches on: restricted, ask or auto. |
| `maxItems` | `LIMITS.maxItems` | A run's limits: most checklist items, tries per item, review passes, steps in all. |
| `maxTries` | `LIMITS.maxTries` |  |
| `maxReviews` | `LIMITS.maxReviews` |  |
| `maxSteps` | `LIMITS.maxSteps` |  |
| `waitMinutes` | `LIMITS.waitMinutes` | Minutes a helper waits for the user's yes before the item is set aside. 0 waits without end. |
| `roles` | `'{}'` | The models for the roles, as JSON: `{ plan: {provider, model}, implement: {…}, review: {…} }`. Empty follows Model Tiers. |
| `projects` | `'{}'` | The same per project, as JSON keyed by the project's folder. A project's choice wins over `roles`. |

### Data

A Data mode and tab: the assistant profiles your data files, runs queries against the real files, ties every number to the query that produced it, and can rerun saved analyses to report what moved.

- **Where:** Settings → Data
- **After install:** off until you switch it on
- **Tools the assistant gets:** `data_files`, `data_profile`, `data_query`, `data_chart`, `data_python`, `data_text`, `data_save_analysis`, `data_rerun_analysis`, `data_analyses`
- **Details:** `addons/dsh-data/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `false` | The Data mode and tab. Off leaves nothing of it in the app; saved analyses are kept. |
| `pythonSetup` | `true` | Python for statistics and charts: set up Plus's own private Python folder the first time Data is switched on (a download of about 450 MB). Off leaves the data_python tool saying it is not set up. |

### Finance

A Finance mode and tab for researching companies, markets and economies. Research, not advice.

- **Where:** Settings → Finance; start page of a new conversation
- **After install:** off until you switch it on
- **Tools the assistant gets:** `finance_profile_save`, `finance_prices`, `finance_news`, `finance_social`, `finance_company_figures`, `finance_company_filings`, `finance_economy`, `finance_source_get`
- **Details:** `addons/dsh-finance/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `false` | The Finance mode and tab. Off leaves nothing of it in the app. |
| `kind` | `'company'` | The drop-downs: what kind of subject (company, sector, economy, market). |
| `subject` | `''` | The drop-downs: the subject's name; may be empty. |
| `market` | `'Global'` | The drop-downs: the market. |
| `focus` | `'full'` | The drop-downs: what to concentrate on. |
| `period` | `'year'` | The drop-downs: how far back to look. |
| `watchlist` | `[]` | Subjects you follow; offered in the subject box. |
| `moreMarkets` | `[]` | Markets of your own, offered after the built-in ones. |
| `sources` | `'[]'` | Extra data sources as JSON: `[{ id, kind: 'api' \| 'connector', name, baseUrl, keyIn, keyName, about, docs, on }]`. Keys are never here: each is kept in the app's secret store. |
| `financeTasks` | `[]` | Ids of scheduled tasks of your own that run in Finance instead of Cowork. |
| `adviser` | `false` | The assistant speaks as the user's financial adviser: it recommends and adds no disclaimer. |

### Deep research

A deep_research tool that plans, researches in parallel with child agents, and writes a cited report.

- **Where:** no page of its own; it works in the background
- **After install:** on
- **Details:** `addons/dsh-deep-research/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `true` |  |
| `toolName` | `'deep_research'` |  |
| `planner` | `'plan'` |  |
| `searcher` | `'fast'` |  |
| `writer` | `'plan'` |  |
| `helperModel` | `'same'` | Which model the helpers run on when the Modes add-on is not there to say: `same` (the model of the conversation that started the research) or `roles` (the Tier add-on's role models). |
| `depth` | `'standard'` | Used when the Modes add-on is not there to say which depth the slider is on. |
| `maxSubquestions` | `8` | Upper bounds. The chosen depth decides the actual numbers and is held to these. |
| `maxParallel` | `8` |  |
| `maxSources` | `120` |  |
| `maxMinutes` | `60` |  |
| `requireFetched` | `false` |  |

### Model Tiers

Five Claude-Code-style model tiers (Haiku, Sonnet, Opus, Fable, Code) with per-tier effort, web and browser access, and sub-agent limits.

- **Where:** Settings → Model Tiers; chat box, beside the send button
- **After install:** on
- **Tools the assistant gets:** `delegate_role`, `review_lanes`, `run_pipeline`
- **Details:** `addons/dsh-model-tiers/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `maxSubagents` | `4` |  |
| `ultraAutoDelegate` | `true` |  |
| `activeTiers` | `'{}'` |  |
| `modelProfiles` | `'{}'` | Per-model sampling defaults, keyed by provider and exact model id: `{ provider: { model: { label, wireEffort, temperature, maxTokens, enabled } } }`. Route-keyed so one model profile is shared by every tier using that route. |
| `modelProfilesMigrated` | `false` | One-time client migration marker for the route-keyed model registry. |
| `modelVersions` | `'[]'` | Saved model versions as a JSON array: `[{ id, name, provider, model, effort?, wireEffort?, temperature?, maxTokens?, note?, instructions?, replace?, presets?: { <agent preset id>: { text, replace? } } }]`. A version is a named copy of a model with its own sett |
| `startersMigrated` | `false` | One-time marker: installs from before 0.10 keep their starter names and model defaults. |
| `customTiers` | `'[]'` | User-created tiers as a JSON array. Built-in tiers stay in `tiers`; custom entries are additive and can never shadow a built-in id. |
| `projectProfiles` | `'{"profiles":[],"projects":{}}'` | Named tier decks scoped to Workspaces, plus each project's default profile. |
| `sessionProfiles` | `'{}'` | Optional per-Session profile override; project default applies otherwise. |
| `fallbackChains` | `'{}'` | Ordered fallback routes per tier: `{ tierId: [{provider, model}] }`. |
| `roleModels` | `'{}'` | Role routes per tier: `{ tierId: { plan\|implement\|review\|fast: {provider, model} } }`. |
| `pruneStaleSessions` | `true` | Drop per-Session tier and profile entries whose stored Session no longer exists, once per start. |

### Agent swarm

Runs named swarms of child agents on Tier role routes with caps and a budget.

- **Where:** Settings → Swarm
- **After install:** on
- **Details:** `addons/dsh-agent-swarm/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `true` |  |
| `toolName` | `'run_swarm'` |  |
| `swarms` | `{}` |  |
| `pricing` | `0` |  |
| `defaultSwarmByMode` | `{}` |  |
| `onRouteDown` | `'rebind'` |  |

### Code power

Skills for PR review, a CI fix loop, best-of-N and hunk review, and a blind judge tool for comparing candidate diffs.

- **Where:** no page of its own; it works in the background
- **After install:** on
- **Details:** `addons/dsh-code-power/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `true` |  |
| `n` | `3` |  |
| `judgeRole` | `'review'` |  |
| `consistencyCheck` | `true` |  |
| `judgeToolName` | `'judge_candidates'` |  |

### Code map

A compact map of your project so the assistant looks things up instead of reading whole files, plus reverse-engineer skills. Nothing to install.

- **Where:** Settings → Code map; `/codemap` in the chat box
- **After install:** on
- **Tools the assistant gets:** `code_map_overview`, `code_map_find`, `code_map_related`, `code_map_read`
- **Details:** `addons/dsh-code-map/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `true` | Offer the code map tools and the short hint. |
| `promptHint` | `true` | Add a three-line hint to the model's instructions in code projects. |
| `maxFiles` | `5000` | Most files mapped in one folder. |
| `maxFileKb` | `400` | Files larger than this many kilobytes are skipped. |
| `extraIgnore` | `''` | More ignore patterns, one per line, written like lines of a `.gitignore`. |
| `dataDir` | `''` | Where maps are kept; empty uses a folder in the app's data folder. |
| `commandName` | `'codemap'` | Name of the slash command; empty registers none. |
| `skills` | `true` | Register the four reverse-engineer skills. |

### Diagram builder

Accurate diagrams from a description: flowcharts, trees, sequences, timelines, charts and formula plots. The model says what is in the diagram; layout, drawing and checking are done for it. Nothing to install.

- **Where:** Settings → Diagrams; under an answer
- **After install:** on
- **Tools the assistant gets:** `diagram_draw`
- **Details:** `addons/dsh-diagram/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `true` | Master switch. |
| `theme` | `'auto'` | Colours of the saved file: `auto` follows light or dark mode of whatever shows it. |
| `folder` | `'diagrams'` | Name of the folder, inside the conversation's folder, that pictures are saved in. |
| `save` | `true` | Save the picture as a file. Off shows it in the chat only. |
| `skills` | `true` | Register the draw-diagram skill. |

### PDF reader

Lets a model read PDFs properly: page-numbered text, search, tables kept in columns, page pictures and text recognition for scans, using what comes with macOS. Nothing to install.

- **Where:** Settings → PDF reader; `/pdf` in the chat box
- **After install:** on
- **Tools the assistant gets:** `pdf_info`, `pdf_read`, `pdf_search`, `pdf_page_image`, `pdf_ocr`
- **Details:** `addons/dsh-pdf/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `true` | Master switch. Off makes every tool say so. |
| `folders` | `[]` | Extra folders whose PDFs may be read, besides the conversation's own folder. |
| `anywhere` | `false` | Allow any PDF on this Mac. Off keeps the tools to the folders above. |
| `readChars` | `30000` | Most characters of text one pdf_read answer holds (about four per token). |
| `skills` | `true` | Register the read-pdf skill. |
| `commandName` | `'pdf'` | Slash command; empty registers none. |

### Library

Lets the assistant search your own documents and quote them with the file and page.

- **Where:** Settings → Library
- **After install:** on
- **Tools the assistant gets:** `library_search`, `library_read`
- **Details:** `addons/dsh-library/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `true` | Master switch: off takes the tools away and stops the indexing. The index is kept. |
| `rescanMinutes` | `10` | How often the folders are checked for new and changed files, in minutes. 0 = only when asked. |

### Memory

A short list of lasting facts and preferences about you, given to every new conversation. You add, edit and delete every entry; the assistant can only suggest.

- **Where:** Settings → Memory; under an answer
- **After install:** on
- **Tools the assistant gets:** `remember`
- **Details:** `addons/dsh-memory/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `true` | Master switch. Off takes the memory out of new conversations; the list is kept. |
| `suggest` | `true` | Whether the assistant may suggest things to remember. Off leaves only what the owner types. |

### Learning

A tutor that makes you do the thinking: a question before any teaching, hints in small steps, the answer last, an explanation in your own words, and reviews days later. Three levels of strictness.

- **Where:** Settings → Learning; above the chat box; `/learn` in the chat box
- **After install:** on
- **Tools the assistant gets:** `learn_plan`, `learn_mark`
- **Details:** `addons/dsh-learn/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `true` | Master switch. |
| `level` | `'firm'` | How firmly answers are held back in a new session: gentle, firm or strict. |
| `reviewSize` | `10` | Most ideas in one review session. |
| `dataDir` |  | Where the record is kept; default is a folder in the dsh home. |
| `skills` | `true` | Register the study-tutor skill. |
| `commandName` | `'learn'` | Slash command; empty registers none. |

### Automations

Shows how every scheduled task run ended on one page, and alerts you on this Mac and on your phone.

- **Where:** Settings → Alerts; sidebar
- **After install:** on
- **Details:** `addons/dsh-automations/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `true` | Master switch: off records nothing and alerts nothing. |
| `alertFailed` | `true` | Alert when a task fails or is stopped. |
| `alertNeeds` | `true` | Alert when a task waits for your approval, your answer or a plan review. |
| `alertFinished` | `false` | Alert when a task finishes. |
| `alertOthers` | `false` | Also alert for conversations you started yourself, not only scheduled tasks. |
| `othersMinutes` | `2` | For those conversations: only when the task has run at least this many minutes. |
| `mac` | `true` | Show alerts as notifications on this Mac. |
| `phone` | `false` | Send alerts to your phone through ntfy. Needs a topic. |
| `ntfyServer` | `'https://ntfy.sh'` | The ntfy server. |
| `ntfyTopic` | `''` | Your ntfy topic: the name your phone is subscribed to. Treat it like a password. |

### Mac bridge

Lets the assistant find your files and run your Apple Shortcuts, only where and what you allow.

- **Where:** Settings → Mac
- **After install:** on
- **Tools the assistant gets:** `mac_find_files`, `mac_shortcuts`
- **Details:** `addons/dsh-mac/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `true` | Master switch: off takes every tool away. |
| `folders` | `[]` | Folders in which the assistant may search for files. |
| `shortcuts` | `[]` | Names of the Shortcuts the assistant may run. |
| `trusted` | `[]` | Names of the Shortcuts it may run without asking you each time. |

### Activity indicator

A thin activity indicator by the chat box or on the window edge: prompt processing, thinking, writing, tool calls, web search, sub-agents and more, with tokens per second. Stores nothing.

- **Where:** Settings → Activity; above the chat box; chat box, beside the send button; window edge; `/activity` in the chat box
- **After install:** on
- **Details:** `addons/dsh-activity/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `true` | Master switch. |
| `design` | `'pulse'` | Which look to use. |
| `hidden` | `[]` | Kinds of work that are switched off. Everything else is shown. |
| `text` | `true` | Show the row of text. |
| `figures` | `true` | Add figures to the text: tokens per second, seconds, counts. |
| `words` | `false` | Write words ("Writing") in place of short codes ("TG"). |
| `promptSpeed` | `true` | Add the last prompt-processing speed to the text while the model thinks or writes. |
| `context` | `true` | Add how many tokens the conversation holds to the text. |
| `hideIdle` | `false` | Show nothing at all while nothing is running. |
| `still` | `false` | Colour only, no movement. |
| `fit` | `true` | Keep the line above the message box as wide as the box. Off lets it span the whole chat area. |
| `collapse` | `true` | An arrow on the line that folds the message box away, leaving only the line. |
| `weight` | `2` | Thickness: 1 thin, 2 normal, 3 bold. |
| `tapeMinutes` | `1` | Ticker tape: how many minutes it holds. |
| `tapeBlocks` | `true` | Ticker tape: solid blocks (true) or separate ticks. |
| `tapeFade` | `true` | Ticker tape: older work fades. |
| `tapeMarks` | `true` | Ticker tape: a mark every 10 seconds. |
| `sound` | `true` | Play a sound when the app starts waiting for you or a turn fails. |
| `soundVolume` | `30` | Loudness of the sounds, 0 to 100. |
| `waitSound` | `'chime'` | The sound for "waiting for you"; `none` plays nothing. |
| `errorSound` | `'low'` | The sound for an error; `none` plays nothing. |
| `soundRepeat` | `0` | Play the waiting sound again every this many seconds while it still waits; 0 plays it once. |
| `colors` | `{}` | Your own colour per kind of work, as `#rrggbb`. Empty uses the built-in colours. |
| `webTools` | `[]` | Tool names that count as web work (a tool matches when its name contains one of these). |
| `scriptTools` | `[]` | Tool names that count as scripts. |
| `commandName` | `'activity'` | Slash command; empty registers none. |

### Budget guard

Hard limits that stop a task that is running away: steps, tokens and minutes per task, a loop check, and an optional daily limit.

- **Where:** Settings → Budget guard; under an answer
- **After install:** on
- **Details:** `addons/dsh-budget/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `true` | Master switch. |
| `maxSteps` | `300` | Most requests to a model in one task, helpers included. 0 = no limit. |
| `maxTokens` | `20000000` | Most tokens (sent plus received) in one task, helpers included. 0 = no limit. |
| `maxMinutes` | `0` | Longest one task may run, in minutes. Time spent waiting for you counts. 0 = no limit. |
| `maxRepeats` | `8` | The same tool call this many times in a row is treated as a loop. 0 = no check. |
| `dayTokens` | `0` | Most tokens in one day, over all conversations. 0 = no limit. |

### Balance

Shows your DeepSeek balance at the bottom of the sidebar, from your signed-in account or your DeepSeek API key.

- **Where:** bottom of the sidebar
- **After install:** on
- **Details:** `addons/dsh-balance/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `true` | Off takes the balance out of the sidebar and asks DeepSeek nothing. |

### Usage ledger

Counts model requests and tokens per day, provider and model. Stores no prompt text.

- **Where:** Settings → Usage; `/usage` in the chat box
- **After install:** on
- **Details:** `addons/dsh-usage-ledger/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `true` |  |
| `retentionDays` | `365` |  |
| `modelAliases` | `{}` |  |
| `dataDir` | `'usage'` |  |
| `commandName` | `'usage'` |  |

### Self-improvement

Improves the instructions around a model: test tasks with checks, a reviewer model that proposes small changes, and gates that only let through what measurably helps. You approve every change.

- **Where:** Settings → Self-improve; `/evolve` in the chat box
- **After install:** on
- **Details:** `addons/dsh-evolve/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `true` | Master switch: off stops jobs and adds nothing to any conversation. |
| `target` | `''` | What is being improved: the id of a saved model version (from Model Tiers), or empty for a plain model. Each version has its own tasks, lessons and versions. |
| `studentProvider` | `''` | The plain model being improved when no version is chosen. Empty until the owner picks one. |
| `studentModel` | `''` |  |
| `reviewerProvider` | `''` | The model that reviews failures and proposes changes. |
| `reviewerModel` | `''` |  |
| `judgeProvider` | `''` | Optional model for "judge" checks. |
| `judgeModel` | `''` |  |
| `repeats` | `3` | Runs per task: local models vary from run to run. |
| `maxEdits` | `3` | Most changes tried in one cycle. |
| `tokenBudget` | `400_000` | Token allowance for one job (input plus output, all models); 0 means none. |
| `costCeiling` | `1.5` | How much longer answers may get before a change is refused (1.5 = 50% more tokens). |
| `applyLive` | `true` | Use the approved instructions in real conversations too (not only in tests). |
| `dataDir` |  | Where tasks, versions and results are kept; default is a folder in the dsh home. |
| `commandName` | `'evolve'` | Slash command; empty registers none. |

### Benchmark

Runs prompt suites over a grid of models and sampling settings and recommends the best ones.

- **Where:** Settings → Benchmark; `/bench` in the chat box
- **After install:** on
- **Details:** `addons/dsh-benchmark/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `true` |  |
| `dataDir` | `[]` |  |
| `suites` | `'general'` |  |
| `seeds` | `3` |  |
| `pricing` | `0` |  |
| `maxParallel` | `1` |  |
| `timeoutMs` | `120000` |  |
| `maxJobMinutes` | `60` |  |
| `maxCloudUsdPerJob` | `0` |  |
| `commandName` | `'bench'` |  |

### Model arena

Ask several models the same question, compare the answers blind, and reveal who wrote what.

- **Where:** Settings → Arena; sidebar; `/arena` in the chat box
- **After install:** on
- **Details:** `addons/dsh-model-arena/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `true` |  |
| `dataDir` | `[]` |  |
| `maxContestants` | `4` |  |
| `blindByDefault` | `true` |  |
| `redactNames` | `true` |  |
| `consistencyCheck` | `true` |  |
| `timeoutMs` | `120000` |  |
| `maxTokens` | `0` |  |
| `storeDays` | `30` |  |
| `commandName` | `'arena'` |  |

### Model router

Routes each turn to one of 2 to 5 candidate models using a small routing model.

- **Where:** `/router` in the chat box
- **After install:** on
- **Details:** `addons/dsh-model-router/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `true` |  |
| `provider` | `4000` |  |
| `model` | `4000` |  |
| `timeoutMs` | `4000` |  |
| `maxTokens` | `200` |  |
| `stickyTurns` | `2` |  |
| `minConfidence` | `0.6` |  |
| `defaultCandidate` | `''` |  |
| `respectHealth` | `true` |  |
| `commandName` | `'router'` |  |

### Route health

Checks that your model routes are reachable and moves a Session to its tier's fallback route when one is not.

- **Where:** chat box, left group; `/routes` in the chat box
- **After install:** on
- **Details:** `addons/dsh-route-health/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `routes` | `{}` |  |
| `preemptiveFallback` | `true` |  |
| `autoReturn` | `true` |  |
| `onlyWhenTierUsesRoute` | `true` |  |
| `blockWhenDown` | `true` |  |
| `commandName` | `'routes'` |  |

### Sampling presets

Named sampling presets chosen per task category, mode or session.

- **Where:** Settings → Sampling; `/sampling` in the chat box
- **After install:** on
- **Details:** `addons/dsh-sampling-presets/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `true` |  |
| `presets` | `{}` |  |
| `categories` | `{}` |  |
| `byMode` | `{}` |  |
| `defaultCategory` | `''` |  |
| `perModel` | `[]` |  |
| `strategy` | `'mixed'` |  |
| `commandName` | `'sampling'` |  |

### Role prompts

Adds your own instruction sections to the system prompt, optionally only for chosen tiers.

- **Where:** no page of its own; it works in the background
- **After install:** on
- **Details:** `addons/dsh-role-prompts/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `sections` | `{}` |  |

### Context Saver

Shortens large tool results before the model sees them and keeps the original for retrieval.

- **Where:** `/saved` in the chat box
- **After install:** off until you switch it on
- **Details:** `addons/dsh-context-saver/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `false` |  |
| `python` | `4000` |  |
| `dataDir` | `4000` |  |
| `minChars` | `4000` |  |
| `minGainPercent` | `15` |  |
| `perTier` | `{}` |  |
| `retrieveToolName` | `'mcp__context__context_retrieve'` |  |
| `helperTimeoutMs` | `10000` |  |
| `promptSection` | `true` |  |
| `commandName` | `'saved'` |  |

### Media tools

Image generation and editing tools, and an approval gate for browser and computer-use tools.

- **Where:** no page of its own; it works in the background
- **After install:** on
- **Details:** `addons/dsh-media-tools/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `true` |  |
| `baseUrl` | `'first'` |  |
| `model` | `'first'` |  |
| `apiKeyEnv` | `'first'` |  |
| `label` | `'first'` |  |
| `approval` | `'first'` |  |
| `maxCallsPerSession` | `20` |  |
| `maxImages` | `4` |  |
| `outputDir` | `'generated-images'` |  |
| `allowUrlResults` | `true` |  |
| `timeoutMs` | `180000` |  |
| `generateToolName` | `'generate_image'` |  |
| `editToolName` | `'edit_image'` |  |
| `mode` | `'first'` |  |
| `reason` | `{}` |  |

### Notify

Runs a command you choose when a turn ends or dsh needs your approval.

- **Where:** `/notify` in the chat box
- **After install:** on
- **Details:** `addons/dsh-notify/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `true` |  |
| `id` | `['completed', 'error']` |  |
| `on` | `['completed', 'error']` |  |
| `minSeconds` | `0` |  |
| `topLevelOnly` | `true` |  |
| `minIntervalSeconds` | `5` |  |
| `timeoutMs` | `5000` |  |
| `maxPerMinute` | `20` |  |
| `commandName` | `'notify'` |  |

### Privacy

Switches off the app's two reporting channels to its maker: usage events, and the upload of a conversation when you rate an answer. /privacy shows the state.

- **Where:** `/privacy` in the chat box
- **After install:** on
- **Details:** `addons/dsh-privacy/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `commandName` | `'privacy'` | Slash command; empty registers none. |

### Colour schemes

Pick the app's colours: DeepSeek Harness stock, MindsHub Cowork, Graphite or Forest, in light and dark.

- **Where:** Settings → Colours
- **After install:** on
- **Details:** `addons/dsh-color-schemes/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `scheme` | `'stock'` | Scheme id: `stock` (the app's own colours), `mindshub`, `graphite`, `forest` or `custom`. |
| `custom` | `''` | Your own scheme as JSON, used when `scheme` is `custom`: `{ "label": "...", "dark": { "--dsw-alias-bg-base": "#101010", ... }, "light": { ... }, "opaqueMacSidebar": true }`. Tokens you leave out keep the app's own value. |
| `opaqueMacSidebar` | `true` | On the Mac desktop app, paint the sidebar solid in the scheme's colour instead of see-through. |

### Sync

Syncs sessions and the project list between machines through a git remote you choose.

- **Where:** no page of its own; it works in the background
- **After install:** on
- **Details:** `addons/dsh-sync/README.md`

### Shared settings

Keeps your Plus settings in one file in a folder you choose, such as iCloud Drive, so two Macs share one setup.

- **Where:** no page of its own; it works in the background
- **After install:** on
- **Details:** `addons/dsh-shared-settings/README.md`

### Engines

Engines: use an outside coding engine (OpenCode first) in Code mode instead of dsh, picked like a model, working in a locked copy of the project; and compare an engine with dsh on the same task, side by side.

- **Where:** sidebar; `/engine` in the chat box
- **After install:** on
- **Tools the assistant gets:** `engine`
- **Details:** `addons/dsh-engines/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `opencodePath` | `''` | Where the OpenCode program is. Empty looks in the usual places. Plus does not install it. |
| `maxMinutes` | `30` | The longest an outside engine may work on one task, in minutes. |
| `opencodeModels` | `[]` | Models of OpenCode to offer in the model menu, as OpenCode names them (provider/model). Its own default is always offered. |
| `applyWhen` | `'review'` | When an engine's changes are put into the project, in a conversation where no Mission mode is on. `review`: nothing until you type /engine apply. `new`: new files at once; changed and deleted files wait for /engine apply. `auto`: everything at once, and /engin |

### Recon

An isolated Recon mode and tab for research on .onion sites and Usenet text newsgroups. This version is the isolation frame; it has no network access yet.

- **Where:** Settings → Recon; `/recon` in the chat box
- **After install:** off until you switch it on
- **Tools the assistant gets:** `recon`
- **Details:** `addons/dsh-recon/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `false` | The Recon mode and tab. Off leaves nothing of it in the app. |
| `torPath` | `''` | Where the tor program is. Empty looks in the usual places (Homebrew, /usr/local). Plus does not install it. |
| `otherEngine` | `false` | Search with another .onion search engine than the built-in filtered index. Off uses the built-in one. The blocklist of banned sites and the word screen apply either way. |
| `engineHost` | `''` | That other engine's .onion name (the 56 characters and ".onion"). Used only while `otherEngine` is on. |
| `usenetRoute` | `'off'` | How Usenet is reached. `off`: not at all. `direct`: an encrypted connection straight to the news server, which sees your address and knows your account. |
| `usenetHost` | `''` | The news server's name, as your Usenet provider gives it. The login is not kept here: it is in the macOS Keychain. |
| `exportFolder` | `''` | Where `/recon export` writes its files. Empty uses the folder `recon/exports` in the app's home. |
| `usenetPort` | `563` | The news server's port for encrypted connections. |
