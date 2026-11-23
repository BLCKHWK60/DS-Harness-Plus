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

