# DeepSeek Harness Plus: the guide

Plus is a set of 49 add-ons for the DeepSeek Harness desktop app. This guide says what each part does, where to find it, how to use it, and what its settings are.

- **Part 1** is for using it: the spaces, the modes, the chat box, projects, and the main features, in the order you meet them.
- **Part 2** lists every slash command.
- **Part 3** is the reference: every add-on with every setting and its starting value. It is generated from the add-ons' own code by `scripts/dev-guide.mjs`, so it does not go out of date; run `node scripts/dev-guide.mjs` after changing an add-on.

Installing, updating and removing are in the [README](../README.md), which also explains the words used here (add-on, space, mode, thread, workspace, tier). How spaces and modes work in detail is in [MODES-AND-SETTINGS.md](MODES-AND-SETTINGS.md). The history of each feature is in [ADD-ONS.md](ADD-ONS.md).

## Part 1: using it

### 1. Where things are

| Place | What is there |
|---|---|
| **Top of the left panel** | The space buttons: Chat and Code, and Devices, Recon and Workshop once you switch them on. |
| **Under the space buttons** | The **New** button (its words follow the space: New chat, New code task, New device task, New Recon search, New workshop task), the fixed rows (Projects, Artifacts, Automations, Plugins), the space's own rows (for example Connectors and Skills in Chat and Code), then its threads, then Archived and Trash. |
| **Bottom of the left panel** | Your DeepSeek balance, and **More** (Settings, look options). |
| **Chat box, left** | The **Mode** list, then Web, Depth, the models chip and Tools. Web is one selector everywhere: Off, All or any mix of sources; in Research and Scout Off is greyed; in Recon it also has Tor, Usenet and I2P. In a Finance thread its selection shows too. |
| **Chat box, right** | The model button: model, effort, tier. |
| **Above the chat box** | The activity line, with the arrow that folds the chat box away. |
| **Under an answer** | Copy, Rerun, Branch, usage, and pictures the assistant drew. |
| **A project's page** | The gear on a project's row: name, type, instructions, files, threads. |
| **Settings** | More → Settings. Most add-ons have a page there. |

A slash command is typed in the chat box, for example `/mission`. The app shows a command's answer as one line; click the line to open the rest.

### 2. Spaces and modes

A **space** is where a thread lives. A **mode** is how it works. Clicking a space button shows that space's threads and returns you to the thread you last had open there. Each window shows one space.

| Space | For | What is special |
|---|---|---|
| **Chat** | Everyday threads. | Its list has two groups: **Chats** (standalone threads) and **Projects** (your folders). New threads start in Plain chat. The **Cowork** switch on a new thread picks where it works: off, it keeps its own files; on, it works in a project folder you pick. |
| **Code** | Programming in your project folders. | New threads start in Code mode, in a project folder. Engines (outside coding programs) run only here, in any mode. |
| **Devices** | Devices connected to your Mac. | Violet. Every mode here keeps the Devices rules: no Terminal or programs, device tools only through Devices' own checks. Shows once Devices is on (Settings → Devices). |
| **Recon** | Research on .onion sites and Usenet text newsgroups. | Red and sealed: every thread here, whatever its mode, keeps Recon's rules; nothing from other threads comes in or goes out. Needs the `tor` program. Shows once Recon is on (Settings → Recon; see 10). |
| **Workshop** | Building and improving add-ons, and the model lab. | Creator Plus threads, plus rows for Tuner Plus and Benchmark. Shows once Creator Plus or Tuner Plus is on. |

**The Mode list** under the chat box offers Plain chat first, then the modes ticked for this space, each with one line saying what it is for. A change applies from your next message, inside the same space; a quiet line in the thread records it.

| Mode | For | What is special |
|---|---|---|
| **Plain chat** | Talking, with nothing extra. | No instructions of its own; the tools the space allows. |
| **Chat** | Questions and answers in one reply. | No tools. Switch Web on and it may search the web and read pages. |
| **Cowork** | Any work in a folder. | All tools, and a working method: understand the job first, keep a step list, ask before changing your files, check the result, report plainly. Projects with types (see 4). |
| **Code** | Programming. | All tools, and a working method: read first, small changes, run the tests, report plainly. |
| **Finance** | Companies, markets, economies. | Its own data tools and drop-downs for subject, market, focus and period. Off until you switch it on in Settings → Finance. |
| **Data** | Analysing data files in a folder. | Its own table, chart and Python tools. Runs Read Only. Off until you switch it on in Settings → Data. |
| **Research** | A question that needs many sources. | Helper agents search and read in rounds and write a report with numbered sources. Runs Read Only. Off until you switch it on in Settings → Research (see 8). |
| **Scout** | Finding work: jobs, freelance projects, contracts, public tenders. | Its own job sources and checks; a scored report with draft messages, and nothing is sent. Off until you switch it on in Settings → Scout (see 9). |

Content, Automations, Devices, Recon and Creator Plus are modes too; the last three are the start modes of their spaces.

- **Which modes each space offers.** Settings → Modes gives every mode five ticks, one per space. Tick Research for Code, say, to pick it in a Code thread. In Devices, Recon and Workshop any ticked mode keeps that space's safety rules.
- **Where a new thread starts.** Settings → Spaces sets, per space, the mode new threads start in, where they start (a folder of their own, a project folder, or Recon's room) and the preset. A **Scratch** thread has a private folder of its own, never a folder of yours, with no project instructions; its files go with it when you delete it. Code starts in the open or last used project, Recon in its room. The **Scratch | Folder** switch on the start page starts the other way once. A Scratch thread shows a dashed Scratch mark in the chat box and sits in its space's **Scratch** group; its `⋯` has **Keep in a project…** (copies its files into a new folder of a project and continues there), and **Clean up…** beside the group moves old ones to the trash.
- Change what a mode allows in **Settings → Modes** (tools, file sandbox, tier, instructions). The same page sets the Depth new threads start with, the mode for automations, and switches for the built-in working methods of Code and Cowork.
- A mode's tier applies to a new thread from its first message.
- **The access level** (file sandbox): Chat, Data, Research and Recon set Read Only and Code sets Workspace Write, only when a thread starts in the mode or switches to it. A level you pick by hand in the chat box is kept, also after a restart. Switching to a mode that sets none (Cowork, Finance, Scout) puts back the earlier level, unless you changed it by hand.
- `/mode` shows or switches the mode of a thread, like the Mode list.

### 3. The chat box, button by button

The row under the text field is the same in every space, from left to right. On a narrow window the words shrink to icons, and the right-hand buttons may move to a second line; nothing is lost. What is described here is what the buttons do in a thread that is open. A button that cannot be used in a thread's space or mode is greyed, with the reason in its tooltip.

**Above the text field (start page of a new thread)**

| Control | What it does | How to use it |
|---|---|---|
| **Place chip** (**Scratch** or **Folder**, and the folder's name) | Where this thread works. **Scratch** is a private folder of its own, never one of yours; its files go away with the thread. **Folder** is one of your own projects: the assistant can see and (if the access level allows) change the files in it. | Click the name to pick a project, or add a folder. A thread cannot change its folder after it has started. Where new threads of each space start is set in Settings → Spaces (or Settings → Start places). In the Chat space the **Cowork** switch takes this place. |
| **Preset chip** (for example **Standard mode**) | The app's own preset: how the model works with tools (Standard, PTC or Creator). It is fixed when a thread starts. It is not a Plus mode; Plus modes are the Mode list under the chat box. | Click to change it before the first message. A space can lock it (Settings → Spaces → Preset in this space). |

**In the row**

| Control | What it does | How to use it |
|---|---|---|
| **+** (Add files or run commands) | The app's own: attach files, or run a command. | Click. |
| **Mode** (the mode's name) | How this thread works: a set of instructions and tools. Plain chat first, then the modes ticked for this space. | Click and pick. It applies from your next message; the thread stays in its space. **Manage modes…** at the bottom opens Settings → Modes. |
| **Access level** (**Read Only**, **Workspace Write** or **Full access**) | How much the assistant may do to your Mac. Read Only: it can look but not change your files without asking you first. Workspace Write: it may change files in this thread's folder. Full access: no limit from the app's sandbox. | Click to pick. A level you pick by hand is kept, also after a restart. A thread that starts in Chat, Data, Research or Recon mode starts at Read Only; Code starts at Workspace Write. |
| **Model health dot** | Whether the models you use answer. Green: all are up. Amber or red with a name: that model or connection is slow or down. | Click to list every model with its state and last error. It shows nothing until Route health has models to check. |
| **Web** (**Off**, **All**, or any mix of sources) | Which part of the internet the assistant may use in this thread. **Off**: no web search, no page reading, and no other tool or program that goes online (connectors you added stay on). **All**: every kind of source, as before. Or tick any mix of Verified sources, Academic papers, News, Ordinary sites, Forums, Social media, Archives and Other (your own sources). Recon also has Tor, Usenet and I2P. | Click and pick. Research and Scout always need the web, so Off is greyed there (it works only while Tools are off). Settings → Web sources holds the lists and your own sources. |
| **Depth** (**Quick**, **Standard**, **Thorough**, **Mission**) | How much work the thread gets: how much it searches when Web is on, planning, checks and reviews. In Research, Scout and Recon it also sets the size of a research run: about 10, 25 or 45 minutes. | Click and pick. It is the same in every space and mode, and where new threads start (also in Settings → Modes). It stays visible but greyed while Tools are off. How hard the model thinks is the Effort on the model button, not this. **Mission** only selects a Mission: Start Mission then starts it, and Send keeps talking at the Depth you had. Where no Mission can start (for example the thread has no folder, or Mission is switched off), Mission is greyed and says why. **Mission settings…** sets this thread's Mission limits. While Mission is chosen or a Mission is on, Depth reads Mission. |
| **Models chip** (**One model** or **3 models**) | Whether helper agents use this thread's model, or other models as well. | Click to switch for this thread. One model is the default and needs the least memory. |
| **Tools** (**Tools on** or **Tools off**) | What the assistant can use right now. With Tool access on the list has: can use now, can ask you for, allowed here (each with a Revoke button, and only the permissions that apply in this mode), loaded when needed, and cannot call. With Tool access off it is the list from before: can call, loaded when needed, cannot call. | Click to see the list and to switch all tools on or off for this thread. Off: the assistant is offered no tool at all, and the web is off too. A change applies from your next message. In Chat mode, tools mean searching and reading the web. The panel ends with a link to Settings → Tool access. |
| **Start Mission** | Starts a Mission: the assistant works by itself on what you typed, with this whole thread as its brief, until its checklist is done or a limit is reached, with up to 4 helpers at once (Mission settings). It is the only way to start one from the chat box: choosing **Mission** in Depth only selects it and makes this the main button. It may change files in the folder and use the web. | Talk the work through first, type what it should do (or nothing, after a talk), click **Start Mission**, read the one question and confirm. Its limits (time limit or no time limit, laps, steps, helpers at once, tools) are in Depth → **Mission settings…** for this thread; their starting values in Settings → Mission. Typing `/mission` and the goal starts one with the same settings; that works in every space and mode, inside the space's own rules (in Data and Research too; in Recon where Recon's settings allow it). A Mission can use many tokens. Greyed, with the reason in its tooltip, where a Mission cannot start (for example the thread has no folder); hidden while a Mission is on and while Mission is switched off. |
| **Status strip and main button** (above and in the chat box, while a Mission is on) | The strip says in words how the Mission stands and what the main button will do: Running (time left, step, item), waiting for your answers, Paused, Stopped by a problem (the cause, and the raw error behind **Details**), or Done. | The main button takes Send's place: **Add note** (gives the Mission what you typed; it keeps going), **Answer and continue** (answers its questions: number them 1., 2., … or write one answer for all), **Resume** (carries on; after a problem it checks first). On the strip: **Pause**, **Finish this lap** (only while it can still do something), **End**, **Checklist** and **Report**, each with an (i). Its questions show in a card under the strip: one field per question with the default it uses if you do not answer, **Skip, use your judgement** to let it decide, and **Send answers**; **Hide** folds the card. If the plan needs more time than it has, the card asks once: keep the limit, give it more, or no time limit. When it ends with questions left, answer them in the card and press **Answer and continue**: it asks how much more time to give (it suggests one) and the same Mission goes on. When your model server does not answer, the strip says **Waiting for your model server**: it tries again by itself for up to 2 hours (that time does not count against its limit), **Try now** tries at once, and after 2 hours it ends with its report. When helpers cannot do their work, a **repair helper** looks for the cause and fixes what it may after a save point; the strip says what it did (`/mission back` undoes it), and a Budget limit, Calls at once or another model waits for your yes in the card. After an app restart a working Mission carries on by itself (Mission settings: **Carry on by itself after a restart**). While a Mission is paused, the assistant only talks, or talks and looks things up, as Mission settings say (**While a Mission runs, the assistant can**). |
| **Export** (download arrow) | Saves this thread as a file. | Click, choose **Messages only**, **Messages and thinking** or **Full thread log**, and a file type (Markdown, plain text, HTML, JSON or PDF), then **Download**, **Copy to clipboard** or **Make PDF**. The full log holds everything the app stored, which can include keys and passwords; a tick hides them (it is on by default for the full log). In Recon, Export opens Recon's own export window. |
| **Settings gear** | The settings of this thread's mode, in a window over the thread, without leaving it. | Click. **Web sources…** and **Open in Settings** are in its top bar. A mode with its own extras (Recon's Export…, Devices rules) keeps them here. |
| **Activity line** | What is running right now: reading the prompt, writing, tools, helpers, other threads, with speeds. | Look. The arrow at its right end folds the chat box down so more of the thread shows; click again to bring it back. Settings → Activity changes its look. |
| **Model button** (the model's name) | Model, effort and tier for this thread. | Click to pick the model, drag the effort from Off to Ultra Code, choose a tier or a saved model version. A change applies from the next message. |
| **Send** (round arrow) | Sends the message. While a Mission is on, the main button takes its place: Add note, Answer and continue or Resume. The app's Stop stays, and pauses the Mission at once. | Click. While a Mission runs, Enter gives your text to it as a note or answers; while it is paused, Enter talks to the assistant, which only talks, or talks and looks things up, as the Mission settings say (While a Mission runs, the assistant can). Send comes back when the Mission ends. After it ends with questions left, answer them in the card to continue it. |

**Under the text field: the options of a mode**

Some modes show their own choices in one area under the chat box, in the same place for every mode; on the start page they sit under the box, and in a thread under its status line. Only the mode they belong to shows them.

| Mode | What is there | What it does |
|---|---|---|
| **Scout** | The kind of work (Any work type, Employee, Freelance, Contract, Internship, Public tender), the markets to search (for example USA, UK, Germany; click **+ Market** for more, or **Remote**), and **+ Files** (a resume, a LinkedIn export or notes). | Sets where Scout searches and what it looks for. A line under them says what will happen, for example "Nothing is sent or applied for." |
| **Finance** | A five-part selection: what it is about (Company, Sector, Economy, Whole market), the market, the focus (Full picture, Figures, News, Mood, Outlook and risks, Comparison), the period (Latest quarter, 1 year, 5 years), and the subject you type. | Press a part to change it, for this thread only, from the next answer on. The line under it says what the assistant will do and ends with "Research, not advice." |
| **Creator Plus** | What you want to do (New add-on, Improve, Find what went wrong, Rebuild, Combine or split, Find gaps, Check after an update, Explain) and which add-ons it may look at (**+ Add-on**, or **All add-ons** on purpose). | Picks the job and its target before you write the request. Locked entries are the app's own or from other makers and are only read. |
| **Plain chat**, **Code**, **Chat**, **Cowork**, **Data**, **Research**, **Recon** | Nothing extra here. | Their choices are the buttons in the row above (Research's Focus is the ticks of the Web button). |

**Under an answer**

| Control | What it does | How to use it |
|---|---|---|
| **Copy**, **Branch**, usage | The app's own. | Click. |
| **Rerun** | Asks the same question again in a fresh copy of the thread, with the model selected now. | Pick another model, then press the round arrow. The old answer stays in the original. |

### 4. Projects and project types

A project is a folder with a name, its own instructions, its files and its threads.

1. Click the **Projects** row in the left panel, press **+ New** and pick a folder.
2. The project's page opens. Under **What kind of project is this?** pick a type, or leave **Blank**.
3. Change the instructions as you like and press **Save**.
4. **New chat** (Cowork switch on) or **New code task** starts work in the project. The gear on the project's row brings you back to its page.

| Type | What it sets up |
|---|---|
| **Blank** | Nothing. Cowork as it has always been. |
| **Research** | Research from many sources, written up as cited reports kept in the folder. |
| **Learn** | A tutor that teaches from your materials and keeps `progress.md` and `flashcards.md`. |
| **Paperwork** | Letters, bills, contracts and deadlines. Keeps `deadlines.md`. Its threads start with Web set to Off. |
| **Plan** | To-dos, owners, dates, status and risks, kept in `plan.md`, `risks.md`, `decisions.md`. |
| **Write** | Long-form writing with an outline, a style guide and revision passes. |

- **Your own types:** under the instructions, **Save as my preset…** keeps the current text as a type of your own.
- **Generate with a model…** lets a model write the instructions from a summary of the folder. You see what would be sent first; keys and `.env` files are left out; a model on the internet needs your tick; the model gets no tools. The result is shown with changes marked, and nothing is saved until you press Save.
- **Earlier versions** keeps the last 10 saved versions, with "Put back".
- **Add files** on the page copies files into the folder and never replaces one.

### 5. Mission: several models on one goal

In a thread that has a folder, type `/mission` and the goal: `/mission make every test pass and add a --json option`.

1. A **planner** reads the project and writes a checklist. Each item says when it is done and, where it can, a command that proves it.
2. **Workers** do one item at a time. Plus then runs the item's command itself.
3. Plus runs the overall commands (tests, build). One that fails becomes a new item.
4. A **reviewer** reads everything that changed against the goal.
5. You get a report: each item PASSED (a command proved it), REVIEWED (the reviewer judged it) or not done, and the checkpoint that undoes the run.

| You type | What it does |
|---|---|
| `/mission <goal>` | Starts a Mission. Name a Mission access level first to choose it: `/mission auto <goal>`. |
| `/mission stop` / `resume` / `end` / `report` | Pause, carry on, close with a report, see how it stands. |
| `/mission restricted` | Mission access **Restricted**: nothing outside the folder, never asks for it; inside, asks once per existing file before changing it. |
| `/mission ask` | Mission access **Ask**: the same inside; for anything outside it must ask you. |
| `/mission auto` | Mission access **Auto**: free inside the folder; for anything outside it must ask you. |
| `/mission off` | Switches Mission access off. |
| `/mission checkpoints` / `back 12` | List the checkpoints; put the folder back as it was at one. Going back can be undone. |

- The first line of a run says whether it uses **one model** or several, and names them. Switch with the models chip before starting.
- If you are away when a helper needs your yes, the request waits in the Mission's card above the chat box while the other helpers carry on (**When it needs you** in Mission settings decides whether it asks at all, and how long it waits). Yeses that Devices, Recon, Tuner Plus or Creator Plus ask for a helper wait there too, and mean exactly that add-on's own yes.
- Checkpoints live in a hidden `.dsh-mission` folder in the project and need git.
- Models, limits and the default Mission access: **Settings → Mission**.
- It works in every space, inside that space's rules: in Data and Research mode it may change files in the folder while it runs (Read Only comes back at its end); in Recon only where Recon's settings allow it, in Recon's room; in Workshop its checks run without the internet and your real setup changes only with your yes; in Devices its helpers may read devices but never change them. Mission access (`/mission ask` and so on) stays refused in Data, Research and Recon. On a tier with Sub-agents switched off, a Mission cannot start or resume (its planner, workers and reviewer are helpers); Mission access and checkpoints still work.

### 6. Data

Switch it on in **Settings → Data**, pick **Data** in the Mode list of a Chat or Code thread, and pick the folder that holds your files.

- Ask in plain words. After a number, a mark like `[Q7]` names the query that produced it.
- Tables: CSV, TSV, JSON, Excel. Documents: Word and text. PDFs through the PDF reader.
- Bar, line and scatter charts are drawn from the data and shown under the answer, and each is also saved as an SVG file in a `data-output` folder in your folder. Pie and area charts are drawn with Python.
- For statistics, cleaning and combining files the assistant runs Python in a sandbox: no internet, it reads your folder and nothing else in your home folder, and it writes only into the `data-output` folder.
- Data threads run Read Only: the app's file and command tools cannot change your files without asking you first. (Those started before 0.57.0 keep their permission.)
- "Save this analysis as …" keeps it; "run … again" reports what moved.
- A new Data thread starts with Web on, so it can search the web and run deep research. The words it searches for then go to the app's web search provider. Data's own tools never send your files, and the assistant is told to keep private details from them out of searches (an instruction, not a check). With Web set to Off in the chat box it works from your files alone.
- It starts with the core tools plus the data and PDF tools; others are added when needed (Settings → Modes → Load tools as needed).

### 7. Finance

Switch it on in **Settings → Finance** and pick **Finance** in the Mode list of a Chat thread. Pick subject, market, focus and period on the start page, then ask. Once the thread has started, its chat box shows the same selection; change a part there for this thread only.

- It puts reported figures, news and what people say side by side, with sources and dates, and draws charts.
- **Adviser** (Settings → Finance → Adviser, off by default): you accept a warning once by typing "I understand"; it then ends with a clear call and the line "AI output, not regulated advice.", and keeps a profile of you that you can edit there.
- **Watchlist**, **your own markets**, **your own data sources** (with keys kept in the app's secret store) and **briefs on a schedule** are on the same page. A brief opens in a Chat · Finance thread.
- With Tools off it has no data tools: it may give figures from memory, each marked as from memory and possibly out of date, never with a source.
- It is an AI model working from what it could fetch. It is not a licensed adviser and can be wrong.

### 8. Research

Switch it on in **Settings → Research** (it needs the Deep research add-on) and pick **Research** in the Mode list of a Chat or Code thread. A question that needs outside facts gets a full run; a quick fact that one or two pages settle is looked up directly.

- Pick **Depth** (Quick, about 10 minutes; Standard, about 25; Thorough, about 45) and the **Web** sources (for example only Academic papers, or News) in the chat box.
- Helper agents plan, search and read in rounds; progress shows above the chat box. The report cites its sources by number and ends with three follow-up questions as buttons.
- Each source is marked **read**, **seen only in search results, not read**, or **not read, and not seen in search results**. Findings from pages no helper read stay in the report, labelled in the sentence. The check makes sure every citation is in the source list; it does not compare claims with the pages.
- A Research thread runs Read Only. Reports are saved; Settings → Research lists them, with **Show in Finder**.

### 9. Scout

Switch it on in **Settings → Scout** and pick **Scout** in the Mode list of a Chat thread. Fill in the work, place, pay target and work type, pick the markets, and ask. **+ Files** adds a resume or notes.

- A run researches the field, searches its sources, reads the promising postings, and scores each opportunity on fit, freshness, pay and legitimacy, each with a reason.
- Likely ghost jobs and scams are flagged with the signs behind them. These are hints, not proof.
- For the best ones it plans who to contact, how and when, with a short draft message. Drafts only: nothing is sent.
- The report is saved as Markdown and a table (CSV). A later run says what is new since the last report. **Settings → Scout → Saved reports** lists them.
- Sources include US and UK public tenders (Contracts Finder, Find a Tender, SAM.gov with a free key) and freelance boards found through search engines only. Switch sources on or off in Settings → Scout.
- A search that holds an email address or a phone number is refused.

### 10. Recon

Install the `tor` program (`brew install tor`), switch Recon on in **Settings → Recon**, and start with **New Recon search** in the Recon space.

- The start page has starter chips (Search .onion sites, Search Usenet, News coverage, Old web page, Check a claim) and a status bar: Tor, Usenet, the Internet Archive's route, the model, and whether findings may go to it.
- A model on this Mac or your own network gets what Recon finds. A cloud model gets it only after you type `/recon cloud`.
- **Settings → Recon → More sources:** the Internet Archive and GDELT news, off until you switch them on. **Read Internet Archive copies directly (not through Tor)** is on by default: copies are then read straight from the Archive, which sees this Mac's internet address (or your VPN's, when the page goes out through a WireGuard tunnel you set up in Recon). Through Tor the Archive refuses most reads.
- Every source gets a number like [S3]. Citations, links and `/recon export` still work after a restart.
- Recon threads never show in Global search and are never synced. `/recon end` ends one and deletes it.

### 11. Models and helpers

- **Settings → Model tiers:** tiers (ways of working: effort, web access, sub-agents, instructions), saved model versions (a model with its own effort and temperature), and role models (plan, implement, review, fast).
- **The models chip** decides per thread whether helpers use the thread's model or the role models.
- **Settings → Swarm:** named groups of helper agents that work side by side, in order, or in debate.
- **Settings → Mission → Models for a run:** models for planner, workers and reviewer, also per project.

### 12. Everyday helpers

| Feature | What it does | Where |
|---|---|---|
| **Memory** | A short list of lasting facts and preferences about you, given to every new thread. You add, edit and delete every entry; the assistant can only suggest one. | Settings → Memory |
| **Learned skills** | Reads where you corrected the assistant and proposes skills, Memory facts and project rules. Nothing is installed until you say yes; Recon threads are never read. | Settings → Learned skills, `/skills learn` |
| **Library** | Lets the assistant search your own documents and quote them with the file and page. | Settings → Library |
| **PDF reader** | Reads, searches and, when needed, OCRs PDFs page by page. | Settings → PDF reader, `/pdf` |
| **Diagram builder** | Draws charts and diagrams and shows them under the answer. | Settings → Diagrams |
| **Code guides** | The eight Code tools guides (four reverse-engineering, four for reviews and fixes) are offered only in Code mode on a new install; on an existing install nothing changes. | Settings → Code tools → "Where these guides are offered" |
| **Code map** | A compact map of a code project, so the assistant looks things up instead of reading whole files. | Settings → Code map, `/codemap` |
| **Learning** | A tutor that makes you attempt first and gives hints step by step. | Settings → Learning, `/learn` |
| **Automations and alerts** | Your automations on one page: where each runs (**Runs in: Space · Mode**), how each run ended, what needs you, what was missed while the app was closed, a timeline; pause, change or delete one (deleted ones stay in the trash for 30 days); alerts on this Mac and on your phone. Threads in Automations mode (a button on the Automations page) make and change them. | The Automations row in the left panel (every space), Settings → Alerts |
| **Mac bridge** | Lets the assistant find your files and run your Apple Shortcuts, only where and what you allow. | Settings → Mac |
| **Budget guard** | Hard limits that stop a run that is running away: steps, tokens and minutes per run, a loop check, and an optional daily limit. | Settings → Budget guard |
| **Balance** | Your DeepSeek balance at the bottom of the left panel. | Left panel |
| **Usage** | Counts model requests and tokens per day, provider and model. Stores no prompt text. | Settings → Usage, `/usage` |
| **Archive and Trash** | Archive a thread, or delete it into a 30-day trash. | The ⋯ menu on a thread |
| **Global search** | Finds threads by title and message text in every space, grouped by space, and projects by name. Never shows Recon threads. | Cmd-K, or the search icon at the top of the left panel |

### 13. The model lab

| Feature | What it does | Where |
|---|---|---|
| **Self-improvement** | Improves the instructions a model is given, tested on your own test tasks; you approve every change. | Settings → Self-improve, `/evolve` |
| **Benchmark** | Runs prompt suites over a grid of models and sampling settings and recommends the best ones. | Settings → Benchmark, `/benchmark` |
| **Arena** | Ask several models the same question, compare the answers blind, and reveal who wrote what. | Settings → Arena, `/arena` |
| **Model router** | Routes each turn to one of 2 to 5 candidate models using a small routing model. Nothing is set after install. | configuration file, `/router` |
| **Route health** | Checks that your model servers are reachable and moves a thread to its tier's fallback when one is not. | configuration file, `/routes` |
| **Sampling presets** | Named sampling settings chosen per kind of job, mode or thread. | Settings → Model tiers → Sampling, `/sampling` |
| **Role prompts** | Adds your own instruction sections to what the assistant is told, optionally only for chosen tiers. | Settings → Model tiers → Instructions for every thread |

### 14. Housekeeping

| Feature | What it does | Where |
|---|---|---|
| **Privacy** | Switches off the app's two reporting channels to its maker. | `/privacy` shows the state |
| **Colours** | Colour schemes for the whole app. | Settings → Colours |
| **Look** | Hide the logos, show the date as the title, wide chat. | Left panel → More |
| **Context saver** | Shortens large tool results before the model sees them and keeps the original for retrieval. Off until configured. | configuration file, `/saved` |
| **Notify** | Runs a command you choose when a turn ends or the app needs your approval. | Settings → Alerts, `/notify` |
| **Media tools** | Image generation and editing tools, and an approval gate for browser and computer-use tools. With Web Off the image tools go, unless the image service is on this Mac or your own network. | configuration file |
| **Sync, Shared settings** | Keep a second Mac in step. Recon threads are never synced. | README, "Using it on a second Mac" |

Where a row says "configuration file": that add-on has no settings page. Open **Settings → Open configuration file** and change its values there.

### 15. Tool access: which tools the assistant may use

Settings → Tool access (under Privacy and safety). Every change on it is saved the moment you make it, and it says "Saved." The page starts with the **Tool access** switch, which is always there, On or Off. Below it are three sections: Modes, Permissions given and History.

- **Off.** With the switch Off (the state of an existing setup until you switch it on), the assistant has exactly the tools each mode has always had, it cannot ask for more, you are never asked a question, and the chat box's Tools list looks as it did before (**Can call**, no **Can ask you for** part). Everything you set on this page, every permission you gave and the history are kept; they apply again when you switch it On. A new install starts with it On. Settings search for "tool access on" or "switch off" finds this page.
- **The question before On.** Anything that would end On asks first, with the tools it would switch on named: a click on a cell, and a tool switched On in the tool-by-tool list (the Terminal included). The question starts on **Cancel**, so pressing Enter by mistake changes nothing. The highest-risk tools (for example Git push) can only be switched on in the app's own settings; if one is already On in a mode, it shows as On and you can switch it Off.
- **Mixed and Default.** A cell says **Mixed** when you set some tools of that group one by one, so they differ. Clicking it sets every tool in the group to the same choice, says that your tool-by-tool choices were replaced, and offers **Undo**; Undo names any tool it could not put back. A cell says **Default** when nothing in it is your choice: the mode simply starts with some tools On and the rest on Ask. Clicking it asks first and names what changes.

- **Modes.** A grid of eleven kinds of tool (read files, change files, run commands, browse the web, accounts and connectors, other Mac apps, helpers and other models, make things, schedule and remember, devices, app and plugins) by mode. Each cell is **On** (the assistant has the tool from the start), **Ask** (it can see the tool exists and may ask you for it; you answer each time) or **Off** (it never gets the tool and is never told about it). Click a cell to go from On to Ask to Off. A padlock means that mode has its own safety rules (Recon, Devices, Creator Plus), so its tools are fixed; click it to see why. Under each mode, **Reset to defaults** puts it back to the tools it has by default. **Tool by tool** shows one row for each tool: its plain name, its real name, what it does, where it comes from, how risky it is, when you last allowed it, and its state. Tools nobody has sorted yet are listed first under **Not sorted** and start on Ask. **Show what the AI sees** shows the list the assistant is told about in a mode.
- **Permissions given.** What you allowed the assistant to use without asking again: for one thread, for a mode, or always, each with **Revoke**, and the tools you told it to stop asking for (**Allow asking again**). **Revoke everything** asks you to confirm first.
- **History.** Every request and your answer, newest first, with a filter and a search, and how often each thread asked. **Waiting for you** lists requests nobody answered, because an automation ran or you were away. The lowest-risk ones can be allowed for next time (**Allow**); any can be dismissed.

The question card above the chat box: Esc means Deny, nothing is bound to Enter, and the card does not take the keyboard from an empty chat box, so typing a space or Enter there never answers it. In Recon the card says plainly that Recon can only ask for tools that stay inside its own routes (never the Terminal, connectors, coding engines, helpers or anything online). A permission only adds a tool. It never lifts a space's or a mode's own safety rules. Settings → Start here has a row, **Tool permissions**, that opens this page, and the first-run card has a step that offers the grid (or keep the safe defaults and do nothing).

## Part 2: every slash command

| Command | Add-on |
|---|---|
| `/activity` | Activity indicator |
| `/arena` | Model arena |
| `/benchmark` | Benchmark |
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
| `/scout` | Scout |
| `/skills` | Learned skills |
| `/usage` | Usage ledger |

Type a command alone to see what it offers. The app's own commands (such as `/goal`, `/permission`, `/feedback`) are not listed here.

## Part 3: reference

Every add-on, in the order of Part 1, with what it adds and every setting. "Starts as" is the value after a fresh install. Settings are changed on the add-on's page in Settings where it has one, otherwise in the configuration file.

### Left panel

The five space buttons (Chat, Code, Devices, Recon, Workshop) at the top of the left panel, each with its own threads.

- **Where:** left panel; start page; start page of a new thread; chat box, left group; above the chat box
- **After install:** on
- **Details:** `addons/dsh-cowork-shell/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `tabs` | `JSON.stringify(DEFAULT_TABS)` | Tab layout as JSON: `{ modeId: { newLabel, pages: [pageId], greeting, chips: [{ label, prompt, icon }] } }`. Tabs follow the Modes add-on's modes; a mode not listed here gets a tab with no pages of its own. Pages that no tab lists (for example Plugins) show un |
| `maxTabs` | `3` | At most this many tabs (the first modes in order). Not used and not shown while the space buttons show (item 4A: shown or hidden per space replaces it, stage 5); kept for the tabs. |
| `spaceLayout` | `''` | Item 4A, stage 3b: the rows of each space as JSON, over the built-in layout (DEFAULT_SPACES): `{ fixed: [pageId], <spaceId>: { pages: [pageId], settings: [sectionId] } }`. Empty: the built-in layout. Fields you leave out keep theirs. |
| `tabOrder` | `[]` | Your own tab order (tab ids, set by arranging the tabs). Only the order: which tabs show is unchanged. |
| `spaceOrder` | `[]` | Item 4A, stage 3a: your own order of the space buttons (space ids, set by arranging them). Empty: the order your old tabs had (each space where its first tab was). Kept apart from `tabOrder`, which stays as it is. |
| `hideLogos` | `false` | Hide the DeepSeek logo and name at the top of the left panel and the logo on the start page. |
| `iconOnlyTabs` | `false` | Tab names in the wide left panel. Off (default): every tab shows its icon and its name; tabs take the width of their name and wrap onto more rows. On: tabs sit in rows of three and a name that does not fit shows the icon alone. |
| `dateTitle` | `false` | Show today's date as the start page title instead of the usual greeting. |
| `wideChat` | `false` | Let the thread and the message box use the whole width of the window instead of a centred column. |
| `startPlaces` | `''` | Start places (Scratch step 44) as JSON: `{ id: 'scratch' \| 'folder' }` per space, over the defaults (every space but Code starts in Scratch; Recon always in its room). Set on Settings → Start places. |
| `newKeyFollows` | `true` | Cmd-N (the app's New Session) starts in the open space's start place. Off: the app's own choice. |

### Modes

The Mode list under the chat box: how each thread works (Chat, Cowork, Code and more), and which modes each space offers.

- **Where:** Settings → Modes; chat box, left group; start page of a new thread; under an answer; action row under an answer; `/mode` in the chat box
- **After install:** on
- **Details:** `addons/dsh-modes/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `modes` | `JSON.stringify(BUILTIN_MODES)` | Mode definitions as a JSON object: `{ id: { label, tools, sandbox, defaultTier, prompt } }`. |
| `extraModes` | `'{}'` | Modes that other add-ons add, in the same JSON shape. They come after the modes above and never replace one of them. An add-on writes its own entry here and removes it when it is switched off. |
| `defaultMode` | `'cowork'` | Mode of a thread that has not chosen one. |
| `scheduledMode` | `'cowork'` | Mode of a thread that an automation opens. Nobody picked a mode for it, so the space last looked at must not decide. An unknown id falls back to the first mode with all tools. Chosen on Settings → Modes. |
| `sessionModes` | `'{}'` | Per-thread choice as JSON: `{ sessionId: modeId }`. Written by the composer selector. |
| `sessionIsolated` | `'{}'` | Threads that began in a sealed mode (id -> true). They stay sealed whatever happens to the mode. |
| `skillsOff` | `'{}'` | Skills switched off per mode, as JSON `{ modeId: [skill names] }`. In that mode the model does not see them in its skill list and cannot load them; your own /name still works. Empty: as before. |
| `pruneStaleSessions` | `true` | Drop per-thread entries whose thread is no longer stored, once per start. |
| `pinOnFirstTurn` | `true` | When a top-level thread starts its first turn without a chosen mode, record the mode it starts in. A later change of `defaultMode` then only affects new threads. |
| `sessionWeb` | `'{}'` | Per-thread web switch as JSON: `{ sessionId: true \| false }`. Missing = the mode's default (off in a no-tools mode). |
| `sessionWebLevel` | `'{}'` | Per-thread Web level as JSON: `{ sessionId: 'verified' \| 'open' \| 'everything' \| 'custom:<name>' }`. Missing = On as before: no limit beyond the mode's own. Only while the Web is on; lib/weblevel.js. |
| `verifiedSources` | `VERIFIED_START` | The verified list (Web level Verified): one host or address ending per line. Its own list; Settings → Modes. |
| `webMixes` | `'{}'` | Your saved Web selections as JSON: `{ name: ['verified', 'forums', …] }` (lib/sources.js KINDS, and in Recon its networks). Earlier Custom mixes keep working: their lanes are read as ticks ("channels" is social). Saved from the Web popup; edited on Settings →  |
| `sessionWebSources` | `'{}'` | Per-thread Web sources as JSON: `{ sessionId: ['verified', 'forums', …] }`. Missing = All: the web as before, or, for a thread that picked one of the older levels (`sessionWebLevel`), that level read as ticks. Only while the Web is on. lib/sources.js. |
| `academicSources` | `ACADEMIC_START` | The academic list (Web source Academic papers): one host or ending per line. Settings → Web sources. |
| `newsSources` | `NEWS_START` | The news list (Web source News): one host or ending per line. Settings → Web sources. |
| `otherSources` | `'[]'` | Your own other sources (Web source Other) as JSON: `[{ id, name, search, start, login, header, store, recon }]` (lib/other.js). No secret is ever kept here: logins, keys, cookies and secret addresses are in the app's secret store or the macOS Keychain, by each |
| `sessionResearch` | `'{}'` | Obsolete: the old per-thread Deep research switch, no longer offered or read (kept so older settings files still load). Old entries are pruned with the others. |
| `sessionSearchDepth` | `'{}'` | Obsolete since 0.59.0: each thread's former Web level, moved into `sessionDepth` once (`depthMoved`). Kept so older settings files still load. |
| `sessionDepth` | `'{}'` | Per-thread Depth as JSON: `{ sessionId: 'quick' \| 'standard' \| 'thorough' }` (missing = where new threads start, `searchDepth`). How much work the thread gets: how much it searches when Web is on, helpers, planning, checks and reviews. Set with the Depth butto |
| `sessionMission` | `'{}'` | Threads whose Depth is on Mission (chosen, not started) as JSON: Start Mission is the main-looking button there; Send keeps the thread's own Depth. |
| `sessionLens` | `'{}'` | Per-thread Lens as JSON: `{ sessionId: 'blunt' \| 'scientific' \| 'journalistic' \| 'data-only' \| 'skeptic' \| 'encouraging' }` (missing or unknown = Default, which adds nothing). How the answer is worded (lib/lens.js, texts approved word for word). Its own sectio |
| `ownLenses` | `[]` | Your own Lenses (Lens part, step 30): `[{ name, text }]`, at most 40, names up to 40 characters, texts up to 4,000, no name of a shipped Lens. Each gets the same guard as every Lens. Edited on Settings → Modes; kept in these settings, so Shared settings carrie |
| `depthMoved` | `false` | Each thread's former Web level has been moved into its Depth (once, since 0.59.0). |
| `longTools` | `'{}'` | Each mode's starting choice of tools for a Mission, as JSON: `{ modeId: { files: boolean, web: boolean } }` (missing: files and commands on; the web on, off in a sealed mode). A run's card can change it for that run. Set on Settings → Modes → Mission tools. |
| `sessionTools` | `'{}'` | Per-thread tools switch as JSON: `{ sessionId: false }`. While off, the model is offered no tool at all. |
| `searchDepth` | `'standard'` | The Depth new threads start with (quick, standard, thorough), and that a thread without its own pick follows. Set on Settings → Modes, and by every pick on the Depth button. (Named for the former Web level, which it replaced in 0.59.0.) |
| `codeMethod` | `true` | Give the Code mode a working method (read first, small changes, run the tests, report plainly) while it has no instructions of its own. |
| `coworkMethod` | `true` | Give the Cowork mode a working method (understand the task, a step list, care with the user's files, check the result, report plainly) while it has no instructions of its own. |
| `sessionSandboxBase` | `'{}'` | Per-thread access level from before a mode changed it, as JSON: `{ sessionId: { mode: 'chat', base: 'workspace-write', set: 'read-only' } }` (`mode`: the mode the level was last applied for; `set`: the level that mode set). Leaving the mode puts `base` back, a |
| `researchDepth` | `'standard'` | Obsolete since 0.59.0: the former separate Depth of Deep research runs. A run now follows the Depth of the thread that starts it (`sessionDepth`, else `searchDepth`), the same in every mode. Kept so older settings files still load. |
| `researchModel` | `'same'` | Which model Deep research's helpers run on: `same` (the model of the thread that started the research) or `roles` (the role models set in Settings → Model tiers). All threads. |
| `sessionHelpers` | `'{}'` | The same choice for one thread, as JSON: `{ sessionId: 'same' \| 'roles' }`. It decides for every tool that starts helper agents (Mission, Deep research, Agent swarm, the Tier tools, Code power). A thread without an entry follows `researchModel`, which is the d |
| `rerunButton` | `true` | A Rerun button under every answer: asks the same question again, with the model now selected, in a fresh copy of the thread. |
| `hideFeedback` | `false` | Hide the app's thumbs-up and thumbs-down buttons under answers. |
| `spaceColours` | `true` | Recon and Devices colours (on by default): a red frame, space button, New button, tint and error boxes in Recon, a violet frame, space button and New button in Devices, and the same outline on Split panes. Off: every space looks the same. |
| `uniformBox` | `true` | The chat box looks the same in every mode (on by default): the buttons' words (Web · On, Depth, One model, Tools on) shrink by the window's width alone, not by what else a mode puts in the row, and the buttons add-ons bring (Creator Plus, Bench rules, Export,  |
| `modeStart` | `'{}'` | Starting values per mode as JSON: `{ modeId: { web, depth, helpers, tools } }` (lib/start.js). What the Web, Depth, Models and Tools buttons read in a thread that begins in the mode; a missing or empty value is the usual one (the mode's own default, or the one |
| `commandName` | `'mode'` | Name of the slash command that switches modes. |
| `trimModes` | `['cowork', 'code', 'data', 'plain']` | Modes with all tools that load them as needed: a core set and `tools_find` at first, other families when the model asks for them or the user's message mentions them. |
| `sessionToolSets` | `'{}'` | Tool families a thread added, as JSON: `{ sessionId: ['pdf', 'data'] }`. |
| `webMarksCleared` | `false` | Done once (0.55.1): old "Search off" marks cleared where Web Off would now block a mode's own search tools. |
| `toolAccess` | `'{}'` | Tool access (lib/access.js): what each tool is set to in each mode, as JSON `{ modeId: { groups: { groupId: 'on'\|'ask'\|'off' }, tools: { toolName: 'on'\|'ask'\|'off' } } }`. Nothing chosen: every mode keeps exactly the tools it has. A tool the mode does not offe |
| `toolAccessOn` | `false` | Tool access on: the AI gets `tools_catalog` and `request_tool_access`, and your choices and permissions apply. |
| `dataTrimAdded` | `false` | Done once (0.57.0): 'data' added to a stored `trimModes` list that lacked it (Data loads its tools as needed). |
| `plainAdded` | `false` | Done once (item 4A, stage 4): Plain chat was given the Cowork mode's per-mode choices ("Load tools as needed", skills switched off, Tool access) where Cowork had them and Plain chat had none (lib/plain.js). Kept on each Mac. |
| `plainCarried` | `false` | Done once (item 4A, fix round 2): Plain chat was also given the Cowork mode's starting values (`modeStart`), its Mission tools (`longTools`), Mission's work loop choice and the other add-ons' per-mode choices where Cowork had them and Plain chat had none (lib/ |
| `plainCarriedIn` | `'[]'` | Final fix round: the other add-ons whose per-mode choices were already carried to Plain chat (JSON list of their namespaces: mission, sampling-presets, agent-swarm). An add-on installed or switched on later is still carried once. Kept on each Mac. |
| `plainFence` | `true` | Keep Plain chat inside its folder (item 4A, fix round 2; on by default): a standalone Plain chat thread reads, writes, searches and runs commands only inside its own Scratch folder, a project thread only inside its project folder (lib/fence.js). Off: the app's |
| `presetLock` | `'{}'` | Preset in this space (item 7), as JSON `{ modeId: 'any' \| 'standard' \| 'creator' }` (lib/presetlock.js). Which of the app's presets a new thread of the mode (or space) starts in: Any (the usual choice), Standard only, or Creator only (the app's Creator preset) |
| `sessionSpaces` | `'{}'` | Item 4A: each thread's space as JSON `{ sessionId: 'chat' \| 'code' \| 'devices' \| 'recon' \| 'workshop' }` (lib/spaces.js). Recorded at its first message (the space its draft was opened in), carried with a copy, pruned with the other per-thread entries. Since st |
| `modeSpaces` | `'{}'` | Item 4A: your own space ticks per mode as JSON `{ modeId: [{ space, adjust: {} }] }` (a mode without an entry has its default ticks; an empty list: offered in no space). Settings → Modes, "Modes and their spaces" (stage 5). |
| `spaceSettings` | `'{}'` | Item 4A: per-space settings as JSON `{ spaceId: { shown, startMode } }` (missing: shown, and the space's usual start mode). Settings → Spaces (stage 5). Where new threads start is the Left panel add-on's `startPlaces`, the preset is `presetLock`: each is kept  |
| `modeDescriptions` | `'{}'` | Item 4A, stage 5: your own one-line description per mode as JSON `{ modeId: 'text' }`, for every mode, an add-on's included (its instructions stay the add-on's). Shown under the mode's name in the chat box's Mode list. Settings → Modes. |
| `spacesFilled` | `false` | Item 4A: every existing thread was given the space of its mode, once (`sessionSpaces`). |
| `spacesRefreshed` | `false` | Item 4A, stage 3a: when spaces went live, every recorded space was made to match the thread's mode once more (where the old tabs last put it), once. Not shared: each Mac does its own. |
| `sessionModeChanges` | `'{}'` | Item 4A, stage 2: the mode changes made after a thread's first message, as JSON `{ sessionId: [{ turn, from, to, at }] }` (lib/spaces.js noteModeChange): the quiet line "Mode changed to Research" after that turn. Pruned with the thread. |
| `guestRunSpaces` | `'{}'` | Item 4A, stage 6b (Revision 2 L4): automations made from a guest thread in Devices or Workshop that open new threads, as JSON `{ taskId: space }`. A run of one that nobody placed in its space is held (nothing runs), also when the Automations add-on is off or g |
| `guestRunModes` | `'{}'` | Stage 7 (6b lab leftover): the mode each of those automations runs in, as JSON `{ taskId: modeId }`, so a run that nobody placed (Automations off) is recorded and named in its own mode, never the default mode for automations. Default `{}`; pruned with `guestRu |
| `sealedExtra` | `'[]'` | Item 4A, stage 6a: extra tools a mode keeps in Recon, as a JSON list (only `library_search`, `library_read`; lib/spacerules.js SEALED_EXTRA_CHOICES). Default empty: what these tools read can end up in Recon's web searches. Each is still checked by Recon's own  |
| `gridInGuarded` | `true` | Item 4A, stage 6a: Tool access Off also applies in Devices and Workshop (on by default: an you's Off is a removal and is kept there; a grid On never adds a tool to a guest there). Settings → Modes → Spaces. |

### Mission

Give a goal to several models: a planner, workers and a reviewer, with real commands as the proof. Three Mission access levels keep the work inside the thread's folder, with checkpoints you can go back to. Type /mission in a thread.

- **Where:** Settings → Mission; above the chat box; chat box, beside the send button; window edge; `/mission` in the chat box
- **After install:** on
- **Tools the assistant gets:** `mission`
- **Details:** `addons/dsh-mission/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `true` | Off takes the /mission command and every mode away. |
| `defaultMode` | `'restricted'` | The mode `/mission on` switches on: restricted, ask or auto. |
| `maxItems` | `LIMITS.maxItems` | Checklist limits (every Mission): most checklist items, tries per item. maxReviews and maxSteps are kept for settings files from before; Missions now use laps and steps. |
| `maxTries` | `LIMITS.maxTries` |  |
| `maxReviews` | `LIMITS.maxReviews` |  |
| `maxSteps` | `LIMITS.maxSteps` |  |
| `longMinutes` | `LONG.minutes` | Mission defaults (Start Mission and a typed /mission): minutes (0 = no time limit), laps (0 = no lap limit), use the full time. |
| `longLaps` | `LONG.laps` |  |
| `longFullTime` | `false` |  |
| `longHelpers` | `HELPERS_DEFAULT` | Helpers at once for a new Mission (Start Mission and a typed /mission): how many checklist items it works on at the same time, 1 to 8. 1 works one item at a time, as before. Never more than Calls at once allows for the workers' model server. |
| `longKeepAwake` | `true` | Keep the Mac awake while a Mission is on (on power; on battery only with longBattery). |
| `longBattery` | `false` |  |
| `longRetry` | `true` | When the app stops giving a Mission rounds by itself, try again up to 3 times, minutes apart. |
| `longEffort` | `true` | Mission helpers think by role: planner and reviewer High, workers Medium (Model tiers leaves them alone). |
| `longNeeds` | `'ask'` | When it needs you, for a new Mission (Start Mission and a typed /mission): decide (Full auto: it never asks, decides questions itself, never gives itself permission and lists what it decided and skipped), ask (Ask, keep working: questions with a safe default g |
| `longWaitAsk` | `-1` | Wait for me with Ask, keep working: minutes a Mission waits when only your answers can move it on, then it ends with its report (Finish it takes it up again); 0 waits until you answer. -1: not set yet, taken from waitMinutes (its old default 3 becomes 30). |
| `longWaitHold` | `0` | Wait for me with Ask and wait: the same; 0, until you answer, unless you change it. |
| `waitMinutes` | `LIMITS.waitMinutes` | From before: how long a Mission waited for you. Now only the starting value of Wait for me (Ask, keep working) when that was never set, the approval wait of runs from before stage B, and Tool access's wait for a thread's own request during a Mission. |
| `roles` | `'{}'` | The models for the roles, as JSON: `{ plan: {provider, model}, implement: {…}, review: {…} }`. Empty follows Model tiers. |
| `projects` | `'{}'` | The same per project, as JSON keyed by the project's folder. A project's choice wins over `roles`. |
| `loopTabs` | `'[]'` | The work loop without Ultra Code: the modes (Modes' mode ids) where you switched it on, as JSON `["code", "research"]`. Empty: only Ultra Code puts it on. |
| `callsAtOnce` | `'{}'` | How many calls Mission sends to one model server at the same time (its helpers and the work loop), per provider, as JSON { provider: 2 }. Missing: 4; each between 1 and 16. A server that runs one request at a time is set to 1. |
| `longAssistant` | `'look'` | While a Mission runs, the assistant can: look (talk and look things up: it may read and search, also the web, but changes no files, runs no commands and starts no helpers) or talk (only talk, no tools). It applies to the thread's own assistant while its Missio |
| `longCarryOn` | `true` | Carry on by itself after a restart: a Mission that was working when the app closed goes on by itself when the app starts again (the time it was closed does not count). Off: it comes back paused and says so. A Mission that was paused, waiting for you or ended s |

### Data

A Data mode for the Chat and Code spaces: the assistant profiles your data files, runs queries against the real files, ties every number to the query that produced it, and can rerun saved analyses to report what moved.

- **Where:** Settings → Data
- **After install:** off until you switch it on
- **Tools the assistant gets:** `data_files`, `data_profile`, `data_query`, `data_chart`, `data_python`, `data_text`, `data_save_analysis`, `data_rerun_analysis`, `data_analyses`
- **Details:** `addons/dsh-data/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `false` | The Data mode. Off leaves nothing of it in the app; saved analyses are kept. |
| `pythonSetup` | `true` | Python for statistics and charts: set up Plus's own private Python folder the first time Data is switched on (a download of about 450 MB). Off leaves the data_python tool saying it is not set up. |

### Finance

A Finance mode, in the Chat space, for researching companies, markets and economies. Research, not advice.

- **Where:** Settings → Finance; start page of a new thread; chat box, left group; above the chat box
- **After install:** off until you switch it on
- **Tools the assistant gets:** `finance_profile_save`, `finance_prices`, `finance_news`, `finance_social`, `finance_company_figures`, `finance_company_filings`, `finance_economy`, `finance_source_get`
- **Details:** `addons/dsh-finance/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `false` | The Finance mode. Off leaves nothing of it in the app. |
| `kind` | `'company'` | The drop-downs: what kind of subject (company, sector, economy, market). |
| `subject` | `''` | The drop-downs: the subject's name; may be empty. |
| `market` | `'Global'` | The drop-downs: the market. |
| `focus` | `'full'` | The drop-downs: what to concentrate on. |
| `period` | `'year'` | The drop-downs: how far back to look. |
| `watchlist` | `[]` | Subjects you follow; offered in the subject box. |
| `moreMarkets` | `[]` | Markets of your own, offered after the built-in ones. |
| `sources` | `'[]'` | Extra data sources as JSON: `[{ id, kind: 'api' \| 'connector', name, baseUrl, keyIn, keyName, about, docs, on }]`. Keys are never here: each is kept in the app's secret store. |
| `financeTasks` | `[]` | Ids of automations of your own that run in Finance instead of Cowork. |
| `adviser` | `false` | The assistant speaks as the user's financial adviser: it recommends and ends with "AI output, not regulated advice". Works only after `adviserAccepted`. |
| `adviserAccepted` | `false` | The user typed their acceptance of the adviser warning once. Without it the adviser stays off, whatever `adviser` says. |

### Deep research

A deep_research tool that plans, researches in parallel with child agents, and writes a cited report.

- **Where:** Settings → Research → Advanced
- **After install:** on
- **Details:** `addons/dsh-deep-research/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `true` |  |
| `toolName` | `'deep_research'` |  |
| `planner` | `'plan'` |  |
| `searcher` | `'fast'` |  |
| `writer` | `'plan'` |  |
| `helperModel` | `'same'` | Which model the helpers run on when the Modes add-on is not there to say: `same` (the model of the thread that started the research) or `roles` (the Tier add-on's role models). |
| `depth` | `'standard'` | Used when the Modes add-on is not there to give the thread's Depth. |
| `maxSubquestions` | `8` | Upper bounds. The chosen depth decides the actual numbers and is held to these. |
| `maxParallel` | `8` |  |
| `maxSources` | `120` |  |
| `maxMinutes` | `60` |  |
| `requireFetched` | `false` |  |

### Model tiers

Five Claude-Code-style model tiers (Haiku, Sonnet, Opus, Fable, Code) with per-tier effort, web and browser access, and sub-agent limits.

- **Where:** Settings → Model tiers; chat box, beside the send button
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
| `sessionProfiles` | `'{}'` | Optional per-thread profile override; project default applies otherwise. |
| `fallbackChains` | `'{}'` | Ordered fallback routes per tier: `{ tierId: [{provider, model}] }`. |
| `roleModels` | `'{}'` | Role routes per tier: `{ tierId: { plan\|implement\|review\|fast: {provider, model} } }`. |
| `sessionUltra` | `'{}'` | The Ultra Code switch beside Effort, per thread, as JSON: `{ sessionId: true }`. Off unless switched on. Ultra Code is a switch, not an effort level: on, the thread spreads its work over helpers at whatever effort is set. The top effort step "Ultra Code" keeps |
| `teams` | `'{}'` | Teams for the work loop, per tier, as JSON: `{ tierId: { lead, helpers: [..], checker, judge } }`, each a `{ provider, model }` or `{ version: id }`. The lead plans and takes a step that failed twice; helpers do the steps (several models make attempts differ m |
| `pruneStaleSessions` | `true` | Drop per-thread tier and profile entries whose stored thread no longer exists, once per start. |

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

- **Where:** Settings → Code tools → Reviews and fixes
- **After install:** on
- **Details:** `addons/dsh-code-power/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `true` | Needs the app to start again to take effect (the skills and the tool are set up at start). |
| `n` | `3` |  |
| `judgeRole` | `'review'` |  |
| `consistencyCheck` | `true` |  |
| `judgeToolName` | `'judge_candidates'` |  |

### Code map

A compact map of your project so the assistant looks things up instead of reading whole files, plus reverse-engineer skills. Nothing to install.

- **Where:** Settings → Code tools; `/codemap` in the chat box
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
| `folder` | `'diagrams'` | Name of the folder, inside the thread's folder, that pictures are saved in. |
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
| `folders` | `[]` | Extra folders whose PDFs may be read, besides the thread's own folder. |
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

A short list of lasting facts and preferences about you, given to every new thread. You add, edit and delete every entry; the assistant can only suggest.

- **Where:** Settings → Memory; under an answer
- **After install:** on
- **Tools the assistant gets:** `remember`
- **Details:** `addons/dsh-memory/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `true` | Master switch. Off takes the memory out of new threads; the list is kept. |
| `suggest` | `true` | Whether the assistant may suggest things to remember. Off leaves only what you type. |

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

Shows how every automation run ended on one page, and alerts you on this Mac and on your phone.

- **Where:** Settings → Alerts; start page of a new thread; left panel; chat box, beside the send button
- **After install:** on
- **Tools the assistant gets:** `automation_results`
- **Details:** `addons/dsh-automations/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `true` | Master switch: off records nothing and alerts nothing. |
| `alertFailed` | `true` | Alert when a task fails or is stopped. |
| `alertNeeds` | `true` | Alert when a task waits for your approval, your answer or a plan review. |
| `alertFinished` | `false` | Alert when a task finishes. |
| `alertOthers` | `false` | Also alert for threads you started yourself, not only automations. |
| `othersMinutes` | `2` | For those threads: only when the task has run at least this many minutes. |
| `alertRuns` | `true` | Missions (step 54): alert when a run ends, needs your yes, or stops by itself. Never per round. The alert names the project folder only, never the run's goal. |
| `mac` | `true` | Show alerts as notifications on this Mac. |
| `phone` | `false` | Send alerts to your phone through ntfy. Needs a topic. |
| `ntfyServer` | `'https://ntfy.sh'` | The ntfy server. |
| `ntfyTopic` | `''` | Your ntfy topic: the name your phone is subscribed to. Treat it like a password. |
| `deletedToTrash` | `true` | Automations part, step A10: an automation deleted anywhere (its page, the assistant, or archiving the thread it writes into) is kept in the trash for 30 days, with Put back. |
| `oldRunsToTrash` | `true` | Step A11: runs older than an automation's keep rule leave the run list; for an automation that opens a new thread at every run, that run's thread goes to the 30-day trash. A thread shared by several runs is never touched. |
| `tab` | `true` | Step A5: the Automations mode in Chat's Mode list (a mode of the Modes add-on), with its own thread. |
| `scheduleButton` | `true` | Item 6: the clock button "Schedule this…" next to Send in every chat box. |
| `runsInTheirTab` | `true` | Item 6: new threads of an automation made with the clock button or New open in the automation's mode. Off: in Settings → Modes → Mode for automations, as before. Automations the assistant or Finance made are not affected. |
| `scheduleFromRecon` | `true` | Item 6: scheduling from Recon, with the clock button and with the assistant's schedule tools there (Tool access can grant those). On by default, with a warning; off takes both away. |

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
| `context` | `true` | Add how many tokens the thread holds to the text. |
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

Hard limits that stop a run that is running away: steps, tokens and minutes per run, a loop check, and an optional daily limit.

- **Where:** Settings → Budget guard; under an answer
- **After install:** on
- **Details:** `addons/dsh-budget/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `true` | Master switch. |
| `maxSteps` | `300` | Most requests to a model in one run made by the thread itself. 0 = no limit (helpers are then not limited either). |
| `maxHelperSteps` | `1500` | Most requests in one run made by helper agents (Deep research, Mission, sub-agents), counted apart so a long run is not cut by the thread's own limit. 0 = helpers share `maxSteps`, as before. |
| `maxLongSteps` | `5000` | While a Mission is on (started with Start Mission or a typed /mission): most requests in one task, all of them (the Mission's own allowance; Mission has its own limits too). 0 = the ordinary limit. |
| `maxLongTokens` | `60000000` | While a Mission is on: most tokens in one task. 0 = the ordinary limit. |
| `startingTokens` | `false` | Set by a first install only: the token limit below is the installer's starting value, not one the person chose, so a Mission's allowance may replace it. Saving the token limit on the Budget page clears it. |
| `maxTokens` | `20000000` | Most tokens (sent plus received) in one task, helpers included. 0 = no limit. |
| `maxMinutes` | `0` | Longest one task may run, in minutes. Time spent waiting for you counts. 0 = no limit. |
| `maxRepeats` | `8` | The same tool call this many times in a row is treated as a loop. 0 = no check. |
| `dayTokens` | `0` | Most tokens in one day, over all threads. 0 = no limit. |

### Balance

Shows your DeepSeek balance at the bottom of the left panel, from your signed-in account or your DeepSeek API key.

- **Where:** bottom of the left panel
- **After install:** on
- **Details:** `addons/dsh-balance/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `true` | Off takes the balance out of the left panel and asks DeepSeek nothing. |

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
| `enabled` | `true` | Master switch: off stops jobs and adds nothing to any thread. |
| `target` | `''` | What is being improved: the id of a saved model version (from Model tiers), or empty for a plain model. Each version has its own tasks, lessons and versions. |
| `studentProvider` | `''` | The plain model being improved when no version is chosen. Empty until you pick one. |
| `studentModel` | `''` |  |
| `reviewerProvider` | `''` | The model that reviews failures and proposes changes. |
| `reviewerModel` | `''` |  |
| `judgeProvider` | `''` | Optional model for "judge" checks. |
| `judgeModel` | `''` |  |
| `repeats` | `3` | Runs per task: local models vary from run to run. |
| `maxEdits` | `3` | Most changes tried in one cycle. |
| `tokenBudget` | `400_000` | Token allowance for one job (input plus output, all models); 0 means none. |
| `costCeiling` | `1.5` | How much longer answers may get before a change is refused (1.5 = 50% more tokens). |
| `applyLive` | `true` | Use the approved instructions in real threads too (not only in tests). |
| `dataDir` |  | Where tasks, versions and results are kept; default is a folder in the dsh home. |
| `commandName` | `'evolve'` | Slash command; empty registers none. |

### Benchmark

Runs prompt suites over a grid of models and sampling settings and recommends the best ones.

- **Where:** Settings → Benchmark; `/benchmark` in the chat box
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
| `commandName` | `'benchmark'` |  |
| `acceptedMethods` | `'{}'` | Where the work loop pays, as you accepted it from a methods job, as JSON `{ category: wayId }`. Advice only: Benchmark switches nothing on by itself; Mission shows it. |

### Model arena

Ask several models the same question, compare the answers blind, and reveal who wrote what.

- **Where:** Settings → Arena; left panel; `/arena` in the chat box
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

Checks that your model routes are reachable and moves a thread to its tier's fallback route when one is not.

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

Named sampling presets chosen per task category, mode or thread.

- **Where:** Settings → Model tiers → Sampling; `/sampling` in the chat box
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

- **Where:** Settings → Model tiers → Instructions for every thread
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

- **Where:** Settings → Alerts; `/notify` in the chat box
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

Switches off the app's two reporting channels to its maker: usage events, and the upload of a thread when you rate an answer. /privacy shows the state.

- **Where:** `/privacy` in the chat box
- **After install:** on
- **Details:** `addons/dsh-privacy/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `commandName` | `'privacy'` | Slash command; empty registers none. |

### Colour schemes

Pick the app's colours: DeepSeek Harness stock, Harbor, Graphite or Forest, in light and dark.

- **Where:** Settings → Colours
- **After install:** on
- **Details:** `addons/dsh-color-schemes/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `scheme` | `'stock'` | Scheme id: `stock` (the app's own colours), `harbor`, `graphite`, `forest` or `custom`. |
| `custom` | `''` | Your own scheme as JSON, used when `scheme` is `custom`: `{ "label": "...", "dark": { "--dsw-alias-bg-base": "#101010",... }, "light": {... }, "opaqueMacSidebar": true }`. Tokens you leave out keep the app's own value. |
| `opaqueMacSidebar` | `true` | On the Mac desktop app, paint the left panel solid in the scheme's colour instead of see-through. |

### Sync

Syncs threads and the project list between machines through a git remote you choose.

- **Where:** no page of its own; it works in the background
- **After install:** on
- **Details:** `addons/dsh-sync/README.md`

### Shared settings (Experimental)

Experimental: tried only on one Mac so far. Keeps your Plus settings in one file in a folder you choose, such as iCloud Drive, so two Macs share one setup. Off until you choose a folder.

- **Where:** no page of its own; it works in the background
- **After install:** on
- **Details:** `addons/dsh-shared-settings/README.md`

### Artifacts

Every file a thread makes shows as a card in its thread, opens rendered beside the chat, keeps its versions and is listed on one Artifacts page. Off until you switch it on.

- **Where:** Settings → Artifacts; under an answer; left panel
- **After install:** off until you switch it on
- **Details:** `addons/dsh-artifacts/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `false` | Cards, the viewer and the Artifacts page. Off leaves nothing of it in the app; kept versions stay. |
| `dangerShowBackups` | `false` | Danger zone. |
| `dangerShowSealed` | `false` |  |
| `dangerPagesRun` | `false` |  |
| `dangerPagesInternet` | `false` |  |

### Devices

A Devices mode and space for the devices you connect to your Mac: identify what is plugged in by USB, find its documentation, and keep a card and a logbook for each device.

- **Where:** Settings → Devices; chat box, left group
- **After install:** off until you switch it on
- **Tools the assistant gets:** `bench_serial_watch`, `bench_esp32`, `bench_android`, `bench_undo`, `bench_bluetooth`, `bench_firmware`, `bench_network`, `bench_router`, `bench_server`, `bench_phone`, `bench_recipe`, `bench_usb`, `bench_devices`, `bench_card`, `bench_catalogue`, `bench_log`
- **Details:** `addons/dsh-bench/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `false` | The Devices mode and space. Off leaves nothing of it in the app; cards and logbooks stay. |
| `folder` | `''` | Where cards and logbooks are kept. Empty: `bench` in the app's home. |
| `longChecks` | `true` | A Mission in Devices checks its work with commands that Mission runs, with the Mac's device ports closed to them. Off: Missions in Devices run no checks (the reviewer judges by reading). |
| `allowRiskyWrites` | `false` | Your switch for writes that can damage a device (Danger zone, off by default). On: the device tools' flash, erase, program, reset and send actions run, and the backup, source and recovery conditions of the firmware writes, the short setting lists and the prote |

### Content

A Content mode, in the Chat space: books, articles, blog posts, scripts and outlines written from your material, with numbered drafts and other threads brought in as material.

- **Where:** Settings → Content
- **After install:** off until you switch it on
- **Tools the assistant gets:** `content_reports`, `content_ledger`, `content_rule`, `content_plan`, `content_formats`, `content_draft`, `content_check`, `content_approve`, `content_correct`, `content_library`, `content_continue`, `content_setup`, `content_conversations`, `content_bring_in`
- **Details:** `addons/dsh-content/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `false` | The Content mode. Off leaves nothing of it in the app; files it saved stay where they are. |
| `voiceLibrary` | `''` | The Voice Library's folder. Empty (or not a full path): `content/voice-library` in the app's home. |

### Creator Plus

Builds and improves add-ons so they fit everything already installed, tries them in a trial copy first, and keeps them working through updates. Nothing in your real setup changes without your yes.

- **Where:** Settings → Creator Plus; chat box, left group; start page of a new thread; above the chat box
- **After install:** off until you switch it on
- **Tools the assistant gets:** `creator_map`, `creator_passport`, `creator_recipe`, `creator_interview`, `creator_plan`, `creator_scaffold`, `creator_check`, `creator_change`, `creator_upkeep`, `creator_improve`, `creator_note`, `creator_handoff`, `creator_learn`, `creator_selftest`
- **Details:** `addons/dsh-creator-plus/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `false` | The Creator Plus mode, the Workshop space and their tools. Off leaves nothing of it in the app; its folder stays. |
| `logReaders` | `'this-mac'` | Which models may read the thread logs: this-mac (default), my-network, any. |
| `strongModels` | `''` | Models the user marked as strong, one "provider/model" per line: they may replace a recipe's default steps. |
| `plusFolder` | `''` | A Plus folder with its tests (the installed copy carries none), for upkeep and changes. Empty: tests are not run. |
| `savedRuns` | `'[]'` | Saved runs of the bar, as JSON: [{ name, state, sentence }]. |
| `sessionBars` | `'{}'` | Each thread's bar, as JSON: { sessionId: { selection, all, run, lookOnly, logsFrom } }. |

### Engines

Engines: use an outside coding engine (OpenCode first) in the Code space, in any mode, instead of dsh, picked like a model, working in a locked copy of the project; and compare an engine with dsh on the same task, side by side.

- **Where:** left panel; `/engine` in the chat box
- **After install:** on
- **Tools the assistant gets:** `engine`
- **Details:** `addons/dsh-engines/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `opencodePath` | `''` | Where the OpenCode program is. Empty looks in the usual places. Plus does not install it. |
| `maxMinutes` | `30` | The longest an outside engine may work on one task, in minutes. |
| `opencodeModels` | `[]` | Models of OpenCode to offer in the model menu, as OpenCode names them (provider/model). Its own default is always offered. |
| `applyWhen` | `'review'` | When an engine's changes are put into the project, in a thread where no Mission runs. `review`: nothing until you type /engine apply. `new`: new files at once; changed and deleted files wait for /engine apply. `auto`: everything at once, and /engine undo takes |

### Recon

A sealed Recon mode and space for research on .onion sites and Usenet text newsgroups.

- **Where:** Settings → Recon; start page of a new thread; chat box, left group; `/recon` in the chat box
- **After install:** off until you switch it on
- **Tools the assistant gets:** `recon`
- **Details:** `addons/dsh-recon/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `false` | The Recon mode and space. Off leaves nothing of it in the app. |
| `torPath` | `''` | Where the tor program is. Empty looks in the usual places (Homebrew, /usr/local). Plus does not install it. |
| `otherEngine` | `false` | Search with another.onion search engine than the built-in filtered index. Off uses the built-in one. The blocklist of banned sites and the word screen apply either way. |
| `engineHost` | `''` | That other engine's.onion name (the 56 characters and ".onion"). Used only while `otherEngine` is on. |
| `usenetRoute` | `'off'` | How Usenet is reached. `off`: not at all. `direct`: an encrypted connection straight to a news server, which sees your address and knows the account used. |
| `archiveOn` | `false` | The Internet Archive: dated copies of web pages, read as text. On lets recon_archive_find and recon_archive_read work. |
| `longChecks` | `false` | A Mission here may check its work with small commands that Mission runs with no internet, no name lookups, no other programs, nothing of the home folder and writing only in the run's folder. Off (your default): no commands at all; the reviewer judges each step |
| `archiveDirect` | `true` | Read the Internet Archive directly, not through Tor: its list of copies and the copies themselves, still GET only, text only, with the same filters and limits. The Archive then sees this Mac's internet address. Off: through Recon's Tor, where the Archive refus |
| `newsOn` | `false` | The GDELT Project's index of news coverage, asked through Recon's Tor. On lets recon_news_search work. |
| `webOn` | `true` | The ordinary web (recon_web_search, recon_web_read), through WireGuard only, or straight where a thread allowed it. |
| `usenetAccounts` | `''` | The Usenet accounts: a news server each, with its own login. No login is kept here: each is in the macOS Keychain, under an item named after the account's id (lib/accounts.js). |
| `id` | `''` |  |
| `label` | `''` |  |
| `host` | `''` |  |
| `port` | `563` |  |
| `usenetDefaultAccount` | `''` | The account used when a request names none. Empty uses the first. |
| `usenetHost` | `''` | The one news server of older versions. Read only, to turn it into the first account. |
| `exportFolder` | `''` | Where `/recon export` writes its files. Empty uses the folder `recon/exports` in the app's home. |
| `usenetPort` | `563` | That older server's port. Read only, for the same reason. |
| `vpnConfigs` | `''` | WireGuard: everything Recon sends outside Tor goes through a WireGuard tunnel. The configurations by name, in order: the first is the primary, the others are backups. Each one's file is in the macOS Keychain under an item named after its id, never here (lib/vp |
| `wireproxyPath` | `''` | Where the wireproxy program is. Empty looks in the usual places (Homebrew). Plus does not install it. |
| `cloudModels` | `'ask'` | Cloud models in a Recon thread: 'ask' (the default) hands what Recon finds to a cloud model only after /recon cloud in that thread; 'always' without asking; 'never' not at all. A model on this Mac or in your own network always gets it. |

### Research

A Research mode: in-depth research with live progress, cited reports, follow-up questions and saved reports.

- **Where:** Settings → Research; start page of a new thread; above the chat box
- **After install:** off until you switch it on
- **Details:** `addons/dsh-research/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `false` | The Research mode. Off leaves nothing of it in the app. |
| `focus` | `'web'` | Where a run looked first before the one Web selector: web, news or academic. Read once to carry it over into the Web selector's ticks (`focusMoved`); the chat box no longer sets it. |
| `focusMoved` | `false` | Each thread's Focus and this starting Focus have been carried over into the Web selector's ticks (once). |
| `folder` | `''` | Where reports are saved. Empty: `research/reports` in the app's home. |

### Scout

A Scout mode, in the Chat space, that searches for work across your markets and plans how to approach the best opportunities. Nothing is sent or applied for.

- **Where:** Settings → Scout; start page of a new thread; `/scout` in the chat box
- **After install:** off until you switch it on
- **Tools the assistant gets:** `scout`, `scout_sources`, `scout_search`, `scout_titles`, `scout_demand`, `scout_pay`, `scout_posting`, `scout_assess`, `scout_files`, `scout_profile`, `scout_report`, `scout_reports`
- **Details:** `addons/dsh-scout/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `false` | The Scout mode. Off leaves nothing of it in the app. |
| `title` | `''` | The start page: the work, in the user's words. |
| `location` | `''` | The start page: town, region or "remote". |
| `salary` | `''` | The start page: the pay target, as the user writes it. |
| `workType` | `'any'` | The start page: any, employee, freelance, contract, internship or tender. |
| `markets` | `[...DEFAULT_MARKETS]` | The markets searched. |
| `folder` | `''` | The folder for the user's files and the saved reports. Empty: `scout/files` in the app's home. |
| `sourceState` | `'{}'` | Changes to the starting sources: `{ [id]: { on?: boolean, hidden?: boolean } }` as JSON. |
| `extraSources` | `'[]'` | The user's own sources as JSON. Keys are never here: each is kept in the app's secret store. |

### Global search

Global search: one box, opened with Cmd-K, that finds threads by their titles and by the text of their messages across every space, and projects by name.

- **Where:** window edge
- **After install:** on
- **Details:** `addons/dsh-search/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `shortcut` | `true` | Cmd-K (Ctrl-K) opens Global search. Off leaves that shortcut to the app. |

### Settings helper

Groups the Plus pages in Settings under headings, gives each its own icon, and adds a search for every setting.

- **Where:** above the chat box; chat box, beside the send button
- **After install:** on
- **Details:** `addons/dsh-settings-plus/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `true` | Groups, icons and the search field in the Settings window. |
| `modeGear` | `true` | The small gear beside Send that opens the current mode's settings page in a popup. |
| `exportButton` | `true` | The Export button beside the gear: this thread as a file (Markdown, text, HTML, JSON), at three levels. |
| `extrasInGear` | `true` | A mode's own extra buttons (Devices rules, Creator Plus, Export for Recon, Focus, Finance pill, route badge) live in the gear's popup instead of the chat box. Only with the gear on and "Same chat box in every mode" on. |
| `view` | `'advanced'` | Which settings list the Settings window starts with: "simple" (about ten settings, in plain sentences) or "advanced" (every page). A first install starts on simple; an earlier install keeps advanced. |
| `setupPending` | `false` | True only after a first install, until the first-run setup card is finished or put away. An earlier install never has it. |

### Learned skills

Learns from your past corrections and proposes skills, Memory facts and project rules. Nothing is installed until you say yes.

- **Where:** Settings → Learned skills; `/skills` in the chat box
- **After install:** on
- **Tools the assistant gets:** `skills`
- **Details:** `addons/dsh-skill-architect/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `true` | Off: learned skills are not offered and nothing is read. |
| `readingModel` | `''` | The model that reads your threads, as JSON `{provider, model}`. Empty: the first model on this Mac or your network. |
| `allowInternet` | `false` | Allow a reading model on the internet. You still see what would be sent before anything is. |
| `nolearn` | `'[]'` | Threads never to learn from (ids, as JSON). Kept on each Mac. |
| `projectsOff` | `'[]'` | Project folders where learned skills are off ("Start clean"), as JSON. |
| `schedule` | `'off'` | Learn by itself (step 87): off, nightly or weekly. Only proposes, only while the app is open, and only with a reading model on this Mac or your own network. A time missed while the app was closed is shown, not caught up. |

### Split Plus

Two to four threads side by side in one window, each in any mode, sharing one folder. Off until you switch it on.

- **Where:** Settings → Split Plus; action row under an answer; above the chat box; left panel
- **After install:** off until you switch it on
- **Tools the assistant gets:** `split_watch_read`
- **Details:** `addons/dsh-split-plus/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `false` | The Split page. Off leaves nothing of it in the app. |
| `localAtOnce` | `4` | How many panes may use a model on this Mac (or your own server) at the same time; the rest wait and say so. |
| `watcherModel` | `''` | The model a watching pane starts with, as "provider/model"; empty: the app's usual model. |
| `dangerFileHolds` | `false` | Danger zone. |
| `dangerSealedSends` | `false` |  |
| `dangerWatchSealed` | `false` |  |
| `dangerWatcherTools` | `false` |  |
| `dangerUnmarked` | `false` |  |

### Tool ledger

Records every tool the assistant used, asked for or was refused. Names and counts only.

- **Where:** no page of its own; it works in the background
- **After install:** on
- **Details:** `addons/dsh-tool-ledger/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `true` | Record tool use. Off: nothing new is written; what was recorded stays. |
| `keepDays` | `365` | How many days records are kept (30 to 3650). Older months are removed at start and once a day. |

### Tuner Plus

Models that learn from your work: checked steps kept as training rows, a private exam, data sets, and adapters trained on this Mac, each tested before you are asked.

- **Where:** Settings → Tuner Plus
- **After install:** off until you switch it on
- **Tools the assistant gets:** `tuning_status`, `tuning_plan`, `tuning_start`, `tuning_export_set`, `tuning_skill_draft`, `tuning_skills_run`
- **Details:** `addons/dsh-tuning/README.md`

| Setting | Starts as | What it does |
|---|---|---|
| `enabled` | `false` | Tuner Plus as a whole. Off: nothing is harvested and its tools are not offered. |
| `harvest` | `'{}'` | Which modes are harvested, as JSON: `{ code: true }`. Every mode starts off. |
| `folder` | `''` | Tuner Plus's folder. Empty (or not a full path): `tuning` in the app's data. |
| `python` | `''` | The Python in which you installed mlx-lm (full path). Tuner Plus installs nothing. |
| `models` | `'{}'` | Where each base model's MLX files are on this Mac, as JSON: `{ "model name": "/full/path" }`. |
| `teacher` | `''` | The teacher model (question-and-answer rows), as JSON `{ provider, model }`. |
| `teacherCloud` | `false` | A teacher on the internet may read rows only when you ticked this. |
| `providers` | `'{}'` | "May train" per provider, as JSON `{ provider: false }`. Missing means yes. |
| `anthropicOpenEnded` | `false` | Text written by Anthropic's models may train adapters that write open-ended text. Starts off. |
| `nightShift` | `false` | The night shift on this Mac. |
| `idleMinutes` | `15` | Minutes of quiet before the night shift works. |
| `nightMinutes` | `120` | The night shift's time limit per night, in minutes. |
| `nightTrain` | `'[]'` | The sets the night shift may train, as JSON `["harness"]`, with the base model for each: `{ set, model }`. |
| `examLimit` | `40` | How many exam rows a check uses at most. |
| `ownNetworkLocal` | `false` | Count your own network's machines (192.168…,.local) as this Mac when deciding what may be sent to a model. Off: only this Mac itself counts. A local proxy that forwards to a cloud provider cannot be told apart from a model on your network. |
| `skills` | `false` | The skills part (marks and records of every skill; later: writing and examining skills). Off: Tuner Plus is what it was before; nothing of the part runs, writes or asks. |
| `skillExam` | `'{}'` | The two models of the skill exam, as JSON `{ floor: { provider, model }, strong: { provider, model } }`: the floor model must run on this Mac (your held-back tasks never leave it); the strong one may be any. |
| `nightSkills` | `false` | The night shift drafts skills too (off at first; needs the night shift and the skills part): at most two skill ideas a night, each drafted by a model on this Mac and examined. Nothing goes live, nothing is edited. |
