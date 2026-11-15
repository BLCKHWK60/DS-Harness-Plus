# The add-ons

Each add-on below says what it is for, whether it works the moment you install, and how to switch it on. For changing settings in general (where the settings file is, how to edit it safely), see **Changing an add-on's settings** in the [README](../README.md#changing-an-add-ons-settings).

**Two words used below:**
- **Provider**: a place your models come from (a company's API or your own server), as you set it up in **Settings → Models**. Where an example says `<PROVIDER>`, write that provider's id, and `<MODEL>` is a model id it serves.
- **Command**: something you type in the chat box starting with `/`, for example `/usage`.

Each settings block goes into `~/.dsh/profiles/desktop/cordis.patch.yml`, at the end of the file, starting at the left edge. The blocks here are the **smallest useful** setup. Every add-on has more options, listed in its own technical notes (`addons/<name>/README.md`).

| Add-on | Works right away? | Settings page | Command |
| --- | --- | --- | --- |
| [Cowork sidebar](#cowork-sidebar) | yes | the left sidebar itself | |
| [Colour schemes](#colour-schemes) | yes (stock colours until you pick) | Settings → Colours | |
| [Modes](#modes) | yes | Settings → Modes | `/mode` |
| [Model Tiers](#model-tiers) | yes | Settings → Model Tiers | |
| [Privacy](#privacy) | yes | | `/privacy` |
| [Memory](#memory) | yes (starts empty) | Settings → Memory | |
| [Budget guard](#budget-guard) | yes | Settings → Budget guard | |
| [Automations](#automations) | yes (phone alerts after setup) | Settings → Alerts, and the Automation runs page | |
| [Library](#library) | after you add a folder | Settings → Library | |
| [Mac bridge](#mac-bridge) | after you allow something | Settings → Mac | |
| [Finance](#finance) | after you switch it on | Settings → Finance, and the Finance tab | |
| [Balance](#balance) | yes | The foot of the sidebar | |
| [Data](#data) | after you switch it on | Settings → Data, and the Data tab | |
| [Research](#research) | after you switch it on | Settings → Research, and the Research tab | |
| [Scout](#scout) | after you switch it on | Settings → Scout, and the Scout tab | `/scout` |
| [Recon](#recon) | after you switch it on (needs the `tor` program) | Settings → Recon, and the Recon tab | `/recon` |
| [Mission](#mission) | yes | Settings → Mission | `/mission` |
| [Global Search](#global-search) | yes | Cmd-K, or the search icon at the top of the sidebar | |
| [Activity indicator](#activity-indicator) | yes | Settings → Activity | `/activity` |
| [PDF reader](#pdf-reader) | yes | Settings → PDF reader | `/pdf` |
| [Diagram builder](#diagram-builder) | yes | Settings → Diagrams | |
| [Learning](#learning) | yes | Settings → Learning | `/learn` |
| [Code map](#code-map) | yes | Settings → Code map | `/codemap` |
| [Self-improvement](#self-improvement) | after setup, in its page | Settings → Self-improve | `/evolve` |
| [Usage counter](#usage-counter) | yes | Settings → Usage | `/usage` |
| [Deep research](#deep-research) | yes | | |
| [Code power](#code-power) | yes | | `/review` |
| [Sampling presets](#sampling-presets) | after setup | Settings → Sampling | `/sampling` |
| [Model arena](#model-arena) | after setup, in its page | Settings → Arena | `/arena` |
| [Agent swarm](#agent-swarm) | after setup | Settings → Swarm | |
| [Benchmark](#benchmark) | after setup, in its page | Settings → Benchmark | `/bench` |
| [Route health](#route-health) | after setup | dot in the chat box | `/routes` |
| [Model router](#model-router) | after setup | | `/router` |
| [Role prompts](#role-prompts) | after setup | | |
| [Notify](#notify) | after setup | | `/notify` |
| [Media tools](#media-tools) | after setup | | |
| [Sync](#sync) | after setup | | `/sync` |
| [Shared settings](#shared-settings) | after setup (installer asks) | | `/shared-settings` |
| [Context saver](#context-saver) | after setup, needs Python | | `/saved` |
| [Settings helper](#settings-helper) | yes | the Settings window itself | |

---

## Cowork sidebar

Replaces the left sidebar with a MindsHub-style one:
- **Chat / Cowork / Code tabs** at the top. The tab decides the mode of **new** conversations, and the mode drop-down leaves the chat box. A conversation's mode is fixed at its first message; to change one later, type `/mode`.
- **A New button that follows the tab:** New chat, New task, New code task.
- **Each tab's own sections:**
  - **Chat:** Model Arena.
  - **Cowork:** Automation tasks, **Connectors** and **Skills**.
  - **Code:** Connectors and Skills.

  **Each tab lists only its own conversations.** Code shows your coding projects, Chat your chats, Cowork your tasks. Use the `⋯` on a conversation or a project to move it to another tab, or on a conversation to **Archive** it (the tab ends with an **Archived** list where each one has **Restore**), or to **Delete** it. Delete moves the conversation to a **Trash** list at the end of the tab; **Put back** returns it within 30 days, and after that it is removed for good. A conversation you used since the app started leaves the list at once and its files move at the next start; **Show all** gives the app's full list with search.

  **The Chat tab has no folders.** A chat lives on its own, so the Chat tab hides the workspace picker, always starts a new chat in the app's default workspace, and shows your chats as one flat list. The `⋯` on a chat can **Promote to Cowork** or **Promote to Code** (the same conversation, in the new mode) or **Continue in a project…** (a new conversation in a project you pick, with the chat attached for the assistant to read).

  The start page shows a greeting per tab, and on most tabs suggestion chips under the chat box (Create slides, Build website, …) that fill in a starter prompt.

  **Connectors** lists your MCP servers. Each shows whether it is connected and how many tools it brings, with an on/off switch. A short form writes out the settings lines for a new one. **Skills** lists the skills the assistant can use, with search.
- **Your projects and Settings**, as before.

When a conversation waits for you (an approval, a plan review or a question), a **Needs you** block appears at the top of the list on every tab; click it to open the conversation at the question.

The **More** menu in the sidebar ends with three switches: **Wide chat area** (the conversation and the message box use the width of the window instead of a centred column), **Hide DeepSeek logos** (the logo and name at the top of the sidebar and the logo on the start page) and **Show the date as the title** (the start page shows today's date, like "11 November, 2026", instead of the greeting).

To get the normal sidebar back, switch **Cowork sidebar** off on the **Plugins** page. It takes effect at once. Use that main switch, not the switch for its inner row on the details page: that one would leave you with no sidebar at all. To choose which pages each tab shows, see `addons/dsh-cowork-shell/README.md`.

### Since 0.33: rows of tabs, coming back to a tab, and projects

- **Tabs in rows of three.** With more than three tabs (Chat, Cowork, Code, Finance, Data) the tabs sit in two rows, each with its icon and full name.
- **How many tabs** (since 0.57.0): **Settings → Modes → Sidebar → Tabs in the sidebar** (1 to 5, 3 unless you change it) sets how many of your own modes get a tab, in their order. A tab an add-on adds (Finance, Data, Research, Scout, Recon) always shows while it is switched on. A mode without a tab says so on its card: it can then only be reached with `/mode`.
- **Each tab remembers where you were.** Clicking a tab opens the conversation you last had open in that tab. A tab you have not used yet opens its start page. This is kept in the app window, not in your settings.
- **Projects.** In every tab except Chat the list is headed by **+ New**. Pick a folder: it becomes a project in that tab. The small gear on a project's row opens its page:
  - **Name** and the tab it shows under.
  - **Instructions**: what the assistant should know and do in every conversation of the project. They are kept by Plus, not written into your folder. A file named AGENTS.md or CLAUDE.md in the folder is read by the app as before.
  - **Files**: what is in the folder. **Add files** (or dropping files onto the box) copies them into the folder. A file is never replaced: a name that is taken gets " (2)".
  - **Conversations** of the project, and **New conversation**.

### Since 0.38: project types

A Cowork project can have a type: ready-made instructions for a kind of work. Open a project's page (the gear on its row) to choose one. A new project shows the choice at the top, with **Blank** selected: Blank adds nothing, so Cowork works as before.

| Type | What it is for |
|---|---|
| **Research** | Deep research from many sources, written up as reports with every claim cited. |
| **Learn** | A tutor that teaches from your own materials: explanations, quizzes, flashcards, progress over time. |
| **Paperwork** | Letters, bills, contracts, deadlines and drafted replies. It is told to keep your papers private. |
| **Plan** | Plan and track any project: tasks, owners, dates, status and risks. |
| **Write** | Long-form writing: outline, style guide or story bible, and revision passes across the manuscript. |

- A type is a starting point. Its instructions are copied into the project, and you can change them as you like.
- If the project already has instructions of yours, picking a type shows the new ones first. You then choose: replace yours, keep yours and only change the type, or cancel.
- **Your own types:** under the instructions, **Save as my preset…** keeps the current text as a type of your own. It is then offered for every project. This is the way to add a method of your own.
- Types are for projects under the Cowork tab. Finance, Data and Code keep their own tabs because they have their own tools.

### Since 0.39: instructions written by a model

On a project's page, under the instructions, **Generate with a model…** lets a model write the instructions for you.

1. Pick any model you have.
2. Choose what it may see: file names and the start of text files, or file names only.
3. Read **what would be sent**: how many files, which ones text is taken from, and which were left out because they look like secrets.
4. Read **where the model runs**. On this computer: nothing leaves it. On the internet: a warning appears and you must tick a box before anything is sent.
5. The result is shown beside what you have now, with new lines marked + and removed lines marked −, plus a list of ideas for the project. **Use these instructions** puts them in the box. Nothing is saved until you press **Save**, and you can edit before and after.

- The model gets no tools. It cannot open, change or delete anything; it only sees the summary Plus builds.
- Keys, passwords and `.env` files are never included.
- If the folder has an AGENTS.md or CLAUDE.md, the new instructions are written to fit beside it.
- An empty folder works too: the instructions are then written from the project's type.
- **Earlier versions** keeps the last 10 saved versions of a project's instructions. "Put back" restores one.
- If the folder changes a lot after instructions were generated, the page says so and suggests generating again. It never does so by itself.

### Since 0.39: Data and Finance tools in Cowork projects

- A project of a type that uses them (Research, Paperwork, Plan) is pointed at the Data tools for tables and, for Research, the Finance tools. The Type card says whether they are available and where to switch them on.
- **Paperwork** conversations start with Web set to Off, so your papers do not turn into web queries. You can switch Web on in the chat box.

## Colour schemes

Pick the colours of the whole app in **Settings → Colours**:
- **DeepSeek Harness** (the stock colours, the default)
- **MindsHub Cowork** (navy and teal)
- **Graphite** (grey and amber)
- **Forest** (green and mint)
- **Custom**, your own colours

Each has a light and a dark version and follows **Settings → General → Appearance**. On the Mac, **Solid sidebar on the Mac** paints the sidebar in the scheme's colour instead of see-through. Details and the custom format are in `addons/dsh-color-schemes/README.md`.

## Modes

Chat, Cowork and Code modes, chosen per conversation with the selector in the chat box or `/mode`.

The chat box also gets four buttons for the open conversation:
- **Web** turns the internet **On** or **Off** for this conversation. It starts Off in Chat and On in Cowork and Code. (Before 0.59.0 it had five levels; how much the assistant searches is now Depth.) Off also stops shell commands and, since 0.57.0, programs that go online, and takes away the image tools of an outside image service. Connectors you added stay on and can still reach the internet; the Off hint says so. Research and Scout show a fixed **Web · Always on** label instead (Off only while Tools are off): they always have the web.
- **Depth** sets how much work the conversation gets: **Quick**, **Standard** or **Thorough**. With Web on it sets how much the assistant searches (Thorough: at least ten searches and ten pages read, key facts checked in two sources); it also sets planning, checks before finishing, and, at Thorough, one review by a helper in tabs that can start helpers (Cowork, Code and modes with all tools). At Thorough a turn also gets one check just before it ends (shown as a one-line row "Thorough: one check before finishing"); the model fixes only what is missing and cannot start a new research run then. It costs one more model reply per Thorough turn. The Depth you pick is also where new conversations start (Settings → Modes sets it too). It is the same in **every tab**, Recon, Research and Scout included: in Recon it also sets how hard Recon searches with its own tools, and in Research and Scout (and for a deep research run asked for anywhere) it sets the size of a research run: Quick about 10 minutes and up to 4 helpers, Standard about 25 and 6, Thorough about 45 and 8. Research's separate Depth is gone. **Effort** on the model button is how hard the model thinks. Updating to 0.59.0 moves each conversation's Web level into its Depth once (Deep becomes Thorough).
- **Tools** says whether the assistant has any tools ("Tools on" or "Tools off"). Click it for one switch that turns every tool off or back on for this conversation, and for the list of what the assistant can and cannot call. With tools off, the assistant is offered nothing, so it does not try and you see no failed attempts. In a conversation started in the app's PTC mode, the panel says so: there the assistant reaches tools from inside small programs it writes, and "Tools off" stops those programs too.
- **The models chip** says whether helper agents use this conversation's model (**One model for everything**) or the role models (**Different models**).
- Research with helper agents and a cited report is in the **Research** tab (see Deep research).

With the Cowork sidebar on, the sidebar tabs choose instead, and the chat-box selector is hidden. A mode decides which tools the assistant may use, how its sandbox (access level) is set, a default tier, and a short instruction. The default mode, Cowork, allows every tool, so nothing is restricted until you choose otherwise. Edit or add modes on **Settings → Modes**.

### Since 0.33: a working method for Code

While the Code mode has no instructions of its own (Settings → Modes), Plus gives it a working method: read before changing, keep a step list, make small exact changes, run the tests and read the output, ask before anything that cannot be undone, and report plainly what changed, what was run and what was not verified. Writing your own text into the Code mode's instructions replaces it; the switch **Code: Plus's working method** on Settings → Modes (since 0.57.0) turns it off.

What the app itself already shows for code work: each file change as a card (click it for a before-and-after view in the right panel), the step list above the message box, and each command with its output. They are folded away once a turn is done. To keep them open, set **Settings → General → Work details** to **Verbose**.

### Since 0.40: one model or several for helper agents

Some tools start helper agents: a `/mission` run, Deep research, Agent swarm, the Tier tools, Code power. Helpers can run on the conversation's own model or on other models. Each different model has to be loaded at the same time, which matters when your models are large and your memory is not.

- **The models chip** in the chat box, beside Tools, shows it at a glance: **One model** means everything runs on the conversation's model. An amber **3 models** means up to three may be loaded at once.
- Click it to switch between **One model for everything** and **Different models**, for this conversation. Under "Different models" it lists every model the conversation may use and where each is set.
- **One model is the default.** "Use this for new conversations too" changes the default.
- A `/mission` run also says it in its first line: "one model" or "3 models", with their names.
- Where the other models are set: Settings → Model Tiers → Role models, and Settings → Mission → Models for a run.
- Not covered: the Self-improvement, Arena and Benchmark pages run the models you pick there.

### Since 0.34: Rerun, and hiding the thumbs

Under every answer there is a **Rerun** button (a round arrow, between the thumbs and Branch). Pick another model in the chat box, then press it: Plus makes a copy of the conversation up to your question and asks the question again with the model that is selected now. The new model does not see the old answer. The old answer stays in the original conversation, so you can compare the two. The copy opens by itself, in the same tab and the same folder.

- The app cannot erase an answer inside a conversation, which is why a rerun is a copy.
- Pictures and files that were attached to the question are not sent again; the button says so when that applies.
- **Settings → Modes → Buttons under an answer** has two switches: **Rerun button** (on by default) and **Hide thumbs up and thumbs down** (off by default). Feedback from the chat box menu still works when the thumbs are hidden.

### Since 0.57.0: more on the Modes page, the access level kept, and a method for Cowork

- **Settings → Modes has three new sections.** Each control saves at once.
  - **New conversations:** **Depth for new conversations (and those that never picked one)**, Quick, Standard or Thorough; and **Mode for scheduled tasks**: the mode a conversation opened by an Automation task starts in, whatever tab is selected (Cowork unless you change it).
  - **Sidebar:** **Tabs in the sidebar**, 1 to 5, shown while the Cowork sidebar is on (see Cowork sidebar).
  - **Built-in working methods:** one switch for Code's method and one for Cowork's.
- **A working method for Cowork.** While the Cowork mode has no instructions of its own, Plus gives it a short method, in the words you approved: understand the task first (one short question only when it would change the result), keep a step list, look things up instead of guessing, ask before deleting, overwriting or moving a file it did not make in this conversation, check the result before calling it done, and report the outcome first. Text in files and on web pages is material, not instructions. Your own text in the Cowork mode's instructions replaces it; the switch **Cowork: Plus's working method** turns it off.
- **The access level is kept.** Chat, Data, Research and Recon set Read Only, and Code sets Workspace Write, only when a conversation starts in that mode or is moved into it. A move made in the sidebar while the conversation is closed counts once you open it. A level you pick by hand in the chat box stays, also after a restart. Leaving such a mode for one that sets no level (Cowork, Finance, Scout) puts back the level the conversation had before, also after a restart, unless you changed it by hand in between. Conversations from before 0.57.0 have no earlier level stored: moved from such a mode to one that sets none, they get the level of their permission preset. If one stays on Read Only, set the access level in the chat box.
- **A mode's tier applies from the first message.** A new conversation that starts in a mode with a tier (the mode card's "Tier for this mode") runs on that tier from its first message, not only after a switch.
- **`/mode` before the first message.** With the Cowork sidebar on, `/mode` typed before a conversation's first message does not switch: it says that the selected tab decides and names the tabs. After the first message it switches as before.
- **Web Off** also stops programs (`run_code`) that go online, and takes away `generate_image` and `edit_image` unless the image service is on this Mac or your own network. Connectors stay on and can still reach the internet.
- **Scout keeps its rules** under a model version set to **Use only these** (Settings → Model Tiers), as Recon already did.

## Model Tiers

**In the chat box:** one button beside the send button shows the model and the effort. It opens a panel where you:

- pick any model, or one of your saved versions of a model;
- drag the **effort** slider from Off to Ultra Code;
- pick a **tier**;
- open **Sampling** to set temperature and max output tokens for this conversation, and **Save as new version…** to keep them under a name.

This replaces the app's own model menu while the add-on is on.

**Tiers** are ways of working. Five starters ship: Fast, Balanced, Deep, Creative and Code review. None has a model: a tier applies its rules to whatever model you are on, until you give it one. On **Settings → Model Tiers** each tier has:

- a name and its own instructions for the model;
- a model, or a saved model version (optional);
- effort, and switches for web search, web fetch, browser and sub-agents;
- sub-agents: "ask for at least" and "allow at most". The most is enforced. The least is an instruction, because the app cannot force a model to delegate;
- skills to load whenever the tier is active (for example a skill written for a small, fast model);
- connectors (your MCP servers) the tier may use;
- a backup model for when one is unreachable, and role models (plan, implement, review, fast) that other add-ons use.

**Model versions** are named copies of one model with their own effort, temperature and max output tokens, for example one for writing and one for coding. The plain model always stays in the list with default settings. Make them on the **Model versions** tab or with **Save as new version…** in the chat box.

**Instructions per version.** A version can also carry its own instructions, so the same model can be set up for different jobs. On the **Model versions** tab each version has:

- **Instructions for this version**, given to the model whenever the version is in use;
- a switch, **Use only these**, that leaves out the instructions of the tier, the Chat / Cowork / Code mode and the role prompts while the version is in use. The app's own text about its tools always stays, and so do the Recon and Scout instructions, which hold their rules (Scout since 0.57.0);
- **Instructions per app mode**: a text for each of the app's modes (Standard, PTC, Minimal, Creator, and any you add in Settings → Agent presets), either added to the version's instructions or used alone.

The app can only send temperature and max output tokens to a model. Top-p, top-k and similar settings stay on your model server.

If you used Tiers before 0.10, your tiers keep their names (Haiku, Sonnet, Opus, Fable, Code) and models.

## Privacy

By default the app reports to its maker in two ways, whichever model you use. This add-on switches both off:

- **Usage events:** on the desktop app, an event for each message you send, with the model name, your device and account ids and details of your Mac. No prompts or answers.
- **Conversation upload on feedback:** pressing thumbs-up or thumbs-down on an answer uploads the conversation up to that point.

Type `/privacy` in a chat to see that both are off. To switch reporting back on, switch the Privacy add-on off on the Plugins page and restart the app.

Still on, because they are features and not reporting: update checks, your DeepSeek sign-in while you are signed in, the plugin list, web search when a conversation uses it, and any cloud model you pick. With a local model, your prompts and answers go only to your model server. For certainty about every connection, use a firewall app.

## Memory

A short list of lasting things the assistant should know about you: who you are, how you like answers, long projects. It is given to every new conversation.

- Open **Settings → Memory**, type an entry and press **Remember**. Every entry can be edited and deleted.
- When you tell the assistant to remember something, it **suggests** an entry. A card under the answer asks **Remember this?** with **Save** and **No**. Nothing is saved without your yes.
- The list is kept short on purpose (about a page). Entries older than four months are marked "Is this still true?".
- A change applies to conversations you start afterwards. Never put passwords here: the list is sent to the model.

Details: `addons/dsh-memory/README.md`.

## Budget guard

Stops a task that is running away. A task is everything the assistant does after one message of yours, with its helper agents counted in.

- It works as installed, with generous limits: 300 steps and 20,000,000 tokens per task, and a check for the same action repeated 8 times in a row.
- At a limit the task stops and a card under it says why. Your next message lets it go on with a fresh allowance.
- **Settings → Budget guard** changes the limits, adds a limit on minutes or on tokens per day, and shows your biggest recent task so you can set limits that fit.
- The limits are enforced by the app itself. It counts tokens, not money.

Details: `addons/dsh-budget/README.md`.

## Automations

Shows how every run of your scheduled tasks ended, and alerts you when one fails or needs you.

- **Automation runs**, in the Cowork sidebar under Automation tasks. It lists what needs you, each task with its next run and how its last run ended, and the last runs: finished, failed, stopped or cancelled, with the time it took and the end of the answer. A failed run has **Run again**.
- **Settings → Alerts** chooses what you are told about and where. As installed, you get a notification on this Mac when a scheduled task fails, is stopped or waits for you.
- **Phone alerts** go through the free ntfy app. The Alerts page has the four setup steps and a **Send a test alert** button.
- An alert is one short line with the task's name and what happened, for example "Morning brief failed". It never contains your instruction or the answer.
- You create and change tasks on the app's own Automation tasks page, as before. Runs are recorded from the moment this add-on is installed.
- Tasks run only while the app is running. Nothing runs while the Mac sleeps.

Details: `addons/dsh-automations/README.md`.

## Library

Lets the assistant search your own documents and quote them with the file and the page.

- **Settings → Library**: add folders of readings, papers, notes or slides. Their documents are read into an index on this Mac. New and changed files are picked up by themselves.
- It reads plain text, Markdown, PDF, Word and similar, and PowerPoint, using what macOS ships. Nothing is installed and nothing is sent anywhere to build the index.
- Ask in a tab where tools are on, for example "What did the week 4 reading say about elasticity?". The answer should name the file and the page.
- **Try a search** on the page shows what the assistant would find for a few words.
- Search goes by words, not meaning. A scanned PDF with no text layer cannot be searched.

Details: `addons/dsh-library/README.md`.

## Mac bridge

Lets the assistant find your files and run your Apple Shortcuts. Nothing is allowed until you allow it.

- **Settings → Mac → Finding files**: add the folders in which it may search. It uses Spotlight, and gets a file's place and date, not its contents.
- **Settings → Mac → Shortcuts**: switch on the Shortcuts it may run. It asks you each time with a card, unless you also switch on **Without asking** for that Shortcut.
- A Shortcut can do anything you built it to do, so keep **Without asking** for harmless ones. The assistant sees only the name: name your Shortcuts for what they do.
- Mail, Calendar and Reminders are not part of it, and are not planned.

Details: `addons/dsh-mac/README.md`.

## Balance

Shows your DeepSeek balance in one line at the foot of the sidebar, above More.

- It reads from the DeepSeek account you are signed in to and, if the app has a DeepSeek API key saved, from that key. The account is shown first.
- Press the line to read again. Point at it to see every balance and when it was read.
- A dash means there is nothing to show; point at it for the reason.
- It has no settings page. Switch it off under Plugins.

Details: `addons/dsh-balance/README.md`.

## Data

A tab for analysing the data files in a folder. Switch it on in **Settings → Data**, open the Data tab, and pick the folder that holds your files.

- **It reads** CSV, TSV, JSON and Excel files as tables, Word and text files as documents, and PDFs through the PDF reader.
- **It does not load your data into the conversation.** The assistant first looks at what each file holds (columns, types, gaps, ranges), then runs queries against the real files.
- **Every number has its query.** A mark like [Q7] after a number is the query that produced it; open that step in the conversation to see it.
- **Saved analyses.** Say "save this analysis as …". Later say "run … again" and it reports what moved since the last run. Settings → Data lists them.
- **Read Only** (since 0.57.0): a new Data conversation runs Read Only, so the app's file and command tools cannot change your files without asking you first. New files (cleaned tables, charts) go into a `data-output` folder inside your folder. Data's own tools read nothing outside the conversation's folder; the app's own read tool is only told to stay inside it.
- An AGENTS.md or CLAUDE.md file in the folder is read by the app, as in every tab: use it to explain your data.
- Reruns happen when you ask, not by themselves.

Details: `addons/dsh-data/README.md`.

### Since 0.33: charts and Python

- **Charts from the data.** Ask for a chart, or let the assistant decide: it draws a bar, line or scatter chart straight from a query (the tool `data_chart`), so no number is copied by hand. The chart shows under the answer and carries its query's id.
- **Python for statistics.** For what a query cannot do (tests, regression, correlation, forecasts, cleaning, combining files, special charts) the assistant writes a small Python program and runs it (`data_python`). Plus keeps its own private Python folder with pandas, numpy, scipy, matplotlib, openpyxl, statsmodels and scikit-learn. It is set up by itself the first time Data is on (a download of about 450 MB; Settings → Data shows how far it is, and has **Set up again** if it failed). It needs a Python 3 on the Mac (Homebrew's or python.org's).
- **What a program may do.** It runs inside macOS's own sandbox: no internet, it can read the conversation's folder and nothing else in your home folder, and it can write only into a folder named `data-output` inside the conversation's folder. So a program cannot change any of your files outside `data-output`. Charts it saves there are shown in the chat.
- **Web on or off.** A new Data conversation starts with Web on, so the assistant can search the web and run deep research. Set Web to Off in the chat box and it works from your files alone. What can go out with Web on is under "Since 0.57.0" below.

### Since 0.35: broken charts are caught

Sometimes a model writes a chart program that puts a label far outside the plot, and the picture comes out as a tall strip of empty space. Data now checks every chart a Python program saves. A chart with something far outside the plot is not shown to you; the assistant is told what is wrong and to fix it and run again. The assistant is also told to use the built-in chart tool for plain bar, line and scatter charts, where this mistake cannot happen. (Before 0.57.0 this list also named area and pie charts, which the chart tool cannot draw; those now go to Python.)

### Since 0.57.0: Read Only, chart files, and what can go out

- **Read Only.** A conversation that starts in Data, or is moved into it, runs Read Only: the app's file and command tools cannot change your files without asking you first. Python keeps its own sandbox and still writes into `data-output`. Data conversations started before 0.57.0 keep their permission. You can change it in the chat box, and a level you pick by hand is kept. Moving the conversation to a tab that sets no permission of its own, such as Cowork, gives back the one it had before, unless you changed it by hand.
- **Charts.** The chart tool draws bar, line and scatter charts; pie, area and other charts are drawn with Python. A bar chart over dates is now really a bar chart: one bar per date, up to 30. In a Data conversation every chart the chart tool draws is also saved as an SVG file in `data-output` (for example `revenue-by-region-q7.svg`), never over a file that is already there, and it shows again in the conversation after a restart. In other tabs that use the chart tool, no file is written.
- **Web stays on, and the privacy text says what can go out.** With Web on, the words the assistant searches for (also in deep research) go to the app's web search provider, and the pages it opens are fetched from the web. Data's own tools never send your files anywhere, and its Python programs have no internet. The assistant is told to keep private details from your files (names of people or customers, account numbers, rows, exact figures) out of searches; that is an instruction, not a check. Read Only stops writing, not going online. With Web Off there are no searches, pages or deep research, and commands and programs that look like they go online are stopped (a check on their text, which catches the usual ways, not every way). Connectors you added stay on and can still reach the internet, and your model always gets what the assistant reads. Settings → Data says the same under "Good to know".
- **Tools load as needed.** Data conversations start with the core tools plus the data and PDF tools; the others are added when the work needs them. The switch is **Settings → Modes → Load tools as needed → Data**, on by default.

## Finance

A fourth tab, beside Chat, Cowork and Code, for researching companies, markets and economies. It is research, not advice.

- **Settings → Finance → Show the Finance tab** switches it on. Off takes the tab and everything with it away again.
- On the tab's start page, choose the **kind** (company, sector, economy, whole market), type the **subject**, and choose the **market** (Global unless you change it), the **focus** and the **period**. Then ask, or press one of the buttons: Deep dive, Earnings review, News and mood, Compare, Sector scan, Economy brief, What changed.
- The assistant is given a method: figures only from sources it fetched, each with its date; facts, claims, opinions and its own reading kept apart; a look ahead; both sides; what it could not find; no buy or sell advice.
- **Built-in data, no key needed:** a company's reported figures and its filings from the US securities regulator (US-listed companies and many foreign ones), and yearly readings for economies from the World Bank. Each number comes with its period, source and date.
- **Your own data sources:** on **Settings → Finance → Data sources**, add a data service (Finnhub, Financial Modeling Prep, Alpha Vantage, EODHD, or any other with an `https` address) and paste its key. This is how share prices, estimates and forecasts come in. The key is kept in the app's secret store, not in the settings, and the assistant can only read from that service.
- **Scheduled briefs:** on the same page, schedule a short recurring update on something you follow. It runs as a task in the app's scheduler, its conversation appears under the Finance tab, and the run shows on the Automation runs page.
- Without a source of your own it has no share prices, estimates or forecasts. For those, and for companies listed only outside the US, it works with web search and Deep research, so figures can be delayed. Check them against the source it names.
- The watchlist and your own markets are on **Settings → Finance**.

Details: `addons/dsh-finance/README.md`.

### Since 0.33: prices, news, social media, your own files, and charts

- **Prices** (`finance_prices`): closing prices over time for up to five shares, indices, currencies or coins, with a chart. Several at once are drawn from a common start of 100. The source is Yahoo Finance's public chart data: closing prices, possibly delayed, not an official feed, and it can stop working.
- **News** (`finance_news`): recent articles on a company or topic, and how much was written per day and in what tone, with charts. The source is the GDELT project. It allows one request every five seconds and often answers "too many requests"; the assistant then uses web search.
- **Social media** (`finance_social`): public posts from Hacker News, Mastodon and Lemmy, with a chart of posts per day and a rough count of how many lean positive or negative. **X (Twitter), Reddit and StockTwits refuse readers without an account**; the assistant reaches them through web search only and says so.
- **Your own files.** A Finance conversation in a folder can use the Data tools on the files there (a portfolio, exported statements), when Data is switched on.
- **It follows the question.** Asked only for the financials, it gives figures and charts. Asked about sentiment, it brings in news and social media. Asked for the full picture, all of it.
- **Charts.** A full answer is expected to have several: prices, figures by year, coverage and mood over time, comparisons.

### Since 0.34: the adviser

**Settings → Finance → Adviser → Act as my financial adviser** (off by default). On, the assistant works the way an adviser would: it gets to know you from your profile, does the research, judges how an idea fits what you hold, and ends with one clear call (buy, add, hold, trim, sell, avoid or wait), with its reasons, the main risk and what would change its mind. It adds no disclaimer: no "I am not a licensed adviser", no "this is not financial advice", no "consult a professional". It applies from your next message, also in conversations that already exist.

- **Your profile** appears under the switch: goals, time frame, the loss you can bear, what you hold, limits. You write it, and the assistant adds a dated line when you tell it something lasting (tool `finance_profile_save`). It is one file on your Mac (`finance/profile.md` in the app's data folder) and is sent to your model with each Finance message. Leave out account numbers; the tool refuses them.
- It answers first. It does not reply with a question in place of the answer, and it does not put up a question card to learn about you. Where your profile is silent it says what it assumed. At most one short question comes at the very end, after its call (since 0.34.1).
- Figures still come only from sources fetched in the conversation, with dates. That rule does not change.
- The assistant does not claim a named licence, firm or registration. It is an AI model working from what it could fetch, and it can be wrong. Decisions are yours.
- Off, Finance is as before: research only, and it does not say buy, sell or hold.
- The Finance instructions cannot be edited in Settings → Modes: Plus writes them back within seconds. The switch is the way to change them.

### Since 0.57.0: the selection in the chat box, and Tools off

- **The selection in the chat box.** Once a Finance conversation has started, its chat box shows the selection in one pill: kind, subject, market, focus and period. Press a part to pick another value, or type a new subject and press Return (Escape leaves it as it was). The change is for that conversation only, and the assistant follows it from its next step. The start page's drop-downs, where new conversations start, stay as they were.
- **With Tools off** (the Tools button), the assistant has no data tools and cannot check a figure. It may still give figures from memory, but it is told to mark each one as from memory and possibly out of date, to say which period it is for when it knows, and never to give it a source or an "as of" date.

## Research

A tab for researching a question in depth, built on the [Deep research](#deep-research) engine. Switch it on in **Settings → Research**; it needs the Deep research add-on.

- **A question that needs outside facts gets a full run** (a quick fact that one or two pages settle is looked up directly). Helper agents plan sub-questions, search and read pages at the same time, review what is missing and search again. A writer then turns the findings into a report that cites its sources by number.
- **Depth** is the Depth button every tab has (since 0.59.0): here it sets the run's size, Quick about 10 minutes, Standard about 25, Thorough about 45. **Focus** (Web, News, Academic) is a drop-down in the chat box. The chat box's Web label reads **Always on** and cannot be changed (Off only while Tools are off): Research always has the web.
- **Live progress** shows above the message box: the stage, the round, searches, pages read, sources and helpers at work.
- The report ends with three **follow-up questions**, which become buttons once the run is done.
- **Saved reports:** each report is saved as Markdown. Settings → Research lists the latest and has **Show in Finder**.

Details: `addons/dsh-research/README.md`.

### Since 0.57.0: clearer labels, and Read Only

- **Sources no helper read stay in the report, with a clearer label.** Each source in the Sources list is marked **read**, **seen only in search results, not read**, or **not read, and not seen in search results**. A page counts as read only when a helper's fetch of it came back without an error; an error page such as 403 or 404 does not count. When a finding comes from a page its helper did not read, the report says so in the sentence, and the Checks count those sources.
- **What the check does.** It makes sure every citation is in the source list. It does not compare a claim with the text of its page, so check the important claims yourself.
- **Read Only.** A conversation that starts in Research, or is moved into it, runs Read Only, so the assistant cannot change your files without asking you first. Moving it to Cowork puts back the level it had before, also after a restart, unless you changed it by hand. Saved reports and diagrams are still written. A Research conversation from before 0.57.0 keeps its level.

## Scout

A tab for finding work: jobs, freelance projects, contracts and public tenders. It is research, not a tracker: nothing is sent, submitted or applied for. Switch it on in **Settings → Scout**.

- **The start page:** the work, the place, your pay target, the work type, and the markets as chips (USA, UK, Germany and Spain to begin with; add or remove any). **+ Files** puts a resume or notes into the Scout folder.
- **A run** says what it understood, researches the field first (the job's names in each language, how many postings each name has, pay), picks sources, searches, reads the promising postings and removes duplicates.
- **Sources** are a list you control on Settings → Scout: switch any on or off, or add your own. Each says how it may be reached: through its interface, one page at a time, or only through a search engine (its pages are then never fetched). Some interfaces need a free key, which is kept in the app's secret store.
- **Your files and profile** stay in the Scout folder. Scout is told to show you a profile draft and save it only after you agree.
- `/scout` shows the conversation's model and how many reports are saved.

Details: `addons/dsh-scout/README.md`.

### Since 0.57.0: scores, warning signs, drafts, earlier reports, and US and UK sources

- **Scores and warning signs** (step 3 of the plan). Each opportunity gets a score from 1 to 5 for fit, freshness, pay and legitimacy, each with a written reason. Likely ghost jobs and scams are flagged with the signs behind them: an old or reposted posting, no pay given, pay far above a typical pay from a source, asking the applicant for money or personal documents, contact only through a personal email address or a chat app. These are hints, not proof: check a posting on its own page.
- **Drafts only.** For the best ones Scout plans the approach (who to contact, which channel, when) and writes a short draft message based on a real trigger in the posting or the news. Nothing is sent.
- **Reports, and what is new.** The report is saved as Markdown and a table (CSV) with the scores, reasons, signs and drafts. Scout can list and read its earlier reports and says what is new since the last run. **Settings → Scout → Saved reports** lists them, with **Show reports in Finder**.
- **US and UK sources.** Public tenders from the UK's Contracts Finder and Find a Tender (open data, no key) and from SAM.gov in the US (a free key from your SAM.gov account). The freelance boards Upwork, PeoplePerHour, YunoJuno, Freelancer.com and Guru are found through search engines only and never signed in to. SAM.gov has not yet been tried with a real key.
- **No contact details in searches.** A search that holds an email address or a phone number is refused, also for the helpers Scout starts. Under the app's PTC preset, a program's own requests are not checked; the tools it calls are.
- **Its rules stay** under a model version set to **Use only these** (Settings → Model Tiers).

## Recon

An isolated tab for research on .onion sites and Usenet text newsgroups: journalism, finding and citing sources, threat intelligence. It is not a browser. It needs the `tor` program (`brew install tor`; Plus does not install it). Switch it on in **Settings → Recon**.

- **Start a Recon conversation with the New button in the Recon tab.** It runs in Recon's own empty folder, not in one of yours.
- **Only its own tools:** search and read .onion sites through Tor, search and read Usenet text newsgroups through your news server, and, once you switch them on, the Internet Archive and the GDELT news index. Text only, behind filters, and every source gets a number like [S3] and a citation.
- **Isolated:** nothing from other conversations comes in, and nothing of it goes to them. A model on this Mac or in your own network gets what Recon finds; a cloud model only after you type `/recon cloud` in that conversation.
- **Commands:** `/recon` (the state), `/recon log` (every search and source), `/recon export` (one text file), `/recon end` (ends the conversation and deletes it), `/recon stop` (stops Tor).

Details: `addons/dsh-recon/README.md`.

### Since 0.57.0: a start page, the Archive read directly, and links that survive a restart

- **The start page** asks "What should Recon look into?" and has five starter chips: Search .onion sites, Search Usenet, News coverage, Old web page, Check a claim. A status bar shows Tor, Usenet, the Internet Archive's route, the conversation's model and whether findings may go to it. Agreeing to a cloud model stays something you type (`/recon cloud`): there is no button for it.
- **Read Internet Archive copies directly (not through Tor)**, on **Settings → Recon → More sources**, is on by default. Copies are then read straight from the Archive, which sees this Mac's internet address. Off sends them through Tor again, where the Archive refuses most reads. GDELT and .onion sites always go through Tor. The Internet Archive and GDELT themselves stay off until you switch them on there. `/recon` and the status bar say which route is used.
- **After a restart**, earlier [S3] citations, links and `/recon export` keep working: Recon rebuilds a conversation's sources from the saved conversation. Nothing new is stored on disk.
- **Kept out elsewhere:** Global Search never shows a Recon conversation, Sync never pushes or pulls one, and Mission does not work in one.

## Mission

Gives a goal to several models at once, and keeps the work inside a conversation's folder. You use it by typing a command in the chat box of a conversation that has a folder. It works in Code, Cowork and Data.

### A run: several models on one goal (since 0.37)

Type `/mission` and the goal, for example `/mission make every test pass and add a --json option`. To choose the permission mode for the run, name it first: `/mission auto …`.

1. A **planner** model reads the project and writes a checklist. Each item says when it is done and, where it can, a command that proves it.
2. **Worker** models do the items one at a time. After each, Plus runs the item's command itself. Passed means the command really passed. Failed means the item is tried again, and the last try goes to the planner's model.
3. Plus runs the overall commands (tests, build). One that fails becomes a new item.
4. A **reviewer** model reads everything that changed against your goal. It judges what no command could prove, and may send items back.
5. You get a report: every item marked PASSED (a command proved it), REVIEWED (the reviewer judged it), or not done, and the checkpoint number that undoes the whole run.

| You type | What it does |
|---|---|
| `/mission <goal>` | Starts a run. It then goes on by itself. |
| `/mission stop` | Pauses the run. |
| `/mission resume` | Carries on. Also takes up items that waited for your yes. |
| `/mission end` | Closes the run now, with a report. |
| `/mission report` | How the run stands, or its final report. |

- **If you are away** and a worker needs your yes for a file (Restricted and Ask-Auto), the card waits 3 minutes. Then the item is set aside as NEEDS YOU and the run carries on. `/mission resume` takes it up again when you are back.
- **Which models:** Settings → Mission → **Models for a run**. Leave a role on "Follow Model Tiers" to use your plan, implement and review role models. Under **Per project** a project can have its own three models.
- **Limits:** Settings → Mission → **How far a run may go** (12 items, 3 tries per item, 2 reviews, 60 steps unless you change them).
- While a run is on, the conversation's own model only keeps it moving. Pause the run to work with it yourself.
- A run works in every permission preset of the app, PTC included (since 0.37.1).
- A long step shows as several rounds that say it is still working. That is normal.
- If the conversation's model does not keep the run moving for five rounds in a row, the run pauses itself and `/mission` says why.
- Each run keeps its log and every model's answer in `.dsh-mission/runs` inside the folder.

### Permission modes and checkpoints (since 0.36)

| You type | What it does |
|---|---|
| `/mission restricted` | Nothing outside the folder is read or changed, and you are never asked for it. Inside, new files are free; before changing or deleting an existing file it asks you, once per file. |
| `/mission ask` | The same inside the folder. For anything outside, it has to ask you first. |
| `/mission auto` | Inside the folder it works without asking. For anything outside, it has to ask you first. |
| `/mission on` | Switches on the mode chosen in Settings → Mission (Restricted unless you change it). |
| `/mission off` | Lifts the mode. |
| `/mission checkpoints` | Lists the checkpoints, numbered. |
| `/mission back 12` | Puts the folder back as it was at checkpoint 12. This can be undone: the state before going back is a checkpoint too. |
| `/mission` | Shows what is on and lists these commands. |

The app shows a command's answer as one line. Click the line to open the rest.

**How it keeps its word**

- A question appears as the app's approval card. A yes to a file holds for that file for the rest of the conversation.
- While a mode is on, the conversation uses the app's **Workspace Write** permission. The app's own sandbox then stops any change outside the folder, whatever a terminal command tries.
- A checkpoint is taken at the start of every turn and before every terminal command. In Restricted and Ask-Auto, if a command changes or deletes an existing file you have not approved, the file is put back at once and the assistant has to ask.

**Good to know**

- Checkpoints live in a hidden folder named `.dsh-mission` inside your folder and need git (it comes with Apple's command line tools). Your project's own git history is not touched.
- Files your project ignores (`.gitignore`), and `node_modules`, are not in a checkpoint: they are neither protected nor put back.
- Reading outside the folder is checked from the text of a command. A script could still read a file elsewhere without naming it. It cannot change one.
- The approval button says "Allow once". For a file inside the folder, the yes is remembered all the same.
- In a run, nothing counts as done on a worker's word alone. But a run is only as good as its plan: a command that proves little lets weak work pass.
- A run does one item at a time, and it has no browser checks of its own.

### Where it does not work (since 0.57.0)

- **Recon conversations.** `/mission` answers that it is not available there and changes nothing. Only `/mission off`, `stop` and `end` still answer, to take back what an earlier version started.
- **A tier with Sub-agents switched off.** A run's planner, workers and reviewer are helper agents, so `/mission <goal>` and `/mission resume` are refused with the reason and what to do: switch Sub-agents on for the tier in Settings → Model Tiers, or pick another tier. A run already under way pauses at its next step. The permission modes and checkpoints start no helpers and still work.

Details: `addons/dsh-mission/README.md`.

## Global Search

One box that finds your conversations by their titles and by the text of their messages, in every tab, and your projects by name.

- Press **Cmd-K** (Ctrl-K), or the search icon at the top of the sidebar. Results are grouped by tab; projects come last. Arrow keys move, **Enter** opens, **Esc** closes.
- Results are only shown to you. Nothing is given to a model.
- **Recon conversations are never shown** (since 0.57.0), neither by their title nor by the text of their messages. A conversation that began in another tab and was moved into Recon later holds nothing from Recon, so it stays findable.

Details: `addons/dsh-search/README.md`.

## Code map

Makes a compact map of the project a conversation works in: its files, the functions and classes in them, and what uses what. The assistant looks things up in the map and reads one function at a time instead of whole files, which uses far fewer tokens on a large project. Nothing is installed, and nothing is written into your project; the map is kept in the app's own data folder.

**Settings → Code map** shows each mapped folder with its numbers, lets you map it again or delete its map, and sets the limits and extra patterns to leave out. It will not map your whole home folder or whole personal folders such as Documents. `/codemap` shows the state in a chat.

It also adds four "reverse engineer" skills. Type `/` in the chat box and pick:

- `reverse-codebase`: how a project works, as an architecture document;
- `reverse-website`: a specification to rebuild a site from;
- `reverse-api-format`: documentation of an API or file format, from examples;
- `reverse-app-binary`: what an installed app is made of and what it does. This one is for software you own or may analyse, and it does not remove protections.

Connections in the map are found by reading the text, not by compiling, so they are right for ordinary code and can miss unusual constructs. Measured on this project: about 2.2 million characters of source, a 4,200-character overview, and under 7,000 characters for a five-step look-up. A real task also reads some files in full, so real savings are smaller.

## Self-improvement

Makes a model better at your kind of work by improving the instructions it is given, never the model itself.

Open **Settings → Self-improve**:

1. Under **Setup**, pick the model to improve (usually a local one) and a stronger model as reviewer.
2. Under **Tasks**, add tasks from your real work, each with a way to check the result (the answer contains a text, is valid JSON, matches a pattern, a file exists, or a judge model scores it). Put them in three groups: **Learn** (the reviewer studies these), **Check** (prove a change helps) and **Guard** (things that must keep working). Or press **Add example tasks**: tick the kinds of work you want (reasoning, reading code, structured output, exact instructions, general knowledge, writing, tool use, agentic coding; 10 to 16 hard tasks each) and add only those.
3. Press **Measure** to see today's score, then **Run a cycle**.

In a cycle the reviewer looks at what fails on the Learn tasks and proposes small changes: a new lesson, a reworded one, or a section of standing instructions. Each change is tested on the Check and Guard tasks, which the reviewer never saw. A change reaches you only if it raises the score, breaks nothing, does not make answers much longer and does not contain a test answer. You then **Approve** or **Decline** it. Every version is kept, and **Use this version** puts an earlier one back.

**Per model version.** Under Setup, **What to improve** can be a saved model version. Each version has its own tasks and lessons, tested with that version's settings and instructions, and its approved lessons are used only in conversations on that version. This is how you tune one model for one job: write starting instructions on the version, add tasks for the job, and let the loop improve on them.

Approved instructions are used in your real conversations too; a switch turns that off. Only the Learn tasks, the model's answers and why they failed are sent to the reviewer, with keys, addresses and home-folder paths removed. Your conversations are never sent.

What it cannot do: make a small model reason like a large one on work it has never seen. Expect gains on kinds of work you repeat and can check, and use ten or more tasks per kind of work.

## Usage counter

Counts requests and tokens per day, provider and model. It never stores what you wrote. See the totals on **Settings → Usage** or with `/usage`. To mark some models as free:

```yaml
- id: usage-ledger
  config:
    freeModels: ['<PROVIDER>/<MODEL>']
```

## Deep research

Gives the assistant a `deep_research` tool. Use the **Research** tab, where a question that needs outside facts gets a full run, or ask for it in plain words ("do deep research on ...") in a conversation whose Web button is not Off. (Depth **Thorough** is not deep research either: it only asks the assistant to search and read more itself.)

- **How it works:** it plans sub-questions with search queries, sends out helpers that search and read pages at the same time, then **reviews what was found**: what is still missing, where sources contradict each other, what needs the original document. It writes sharper queries from that and sends helpers out again. At the end it writes a report that cites its sources by number. It checks that every citation is in the source list, and marks each source **read**, **seen only in search results, not read**, or **not read, and not seen in search results** (these labels are new in 0.57.0; a page counts as read only when its fetch came back without an error). Findings from pages no helper read stay in the report with their label; `requireFetched: true` in the configuration file leaves them out instead. Claims are not compared with the text of the pages.
- **Three depths**: a run follows the Depth of the conversation that starts it (the Depth button, the same in every tab, since 0.59.0):

  | Depth | Rounds | Helpers at once | Time limit |
  | --- | --- | --- | --- |
  | Quick | 1 | up to 4 | 10 minutes |
  | Standard | 2 | up to 6 | 25 minutes |
  | Thorough | 3 | up to 8 | 45 minutes |

- **Which model the helpers use:** Settings → Research → **Model for the helpers** sets it for all conversations: **This conversation's model** (the default) or **Role models**, set in Settings → Model Tiers → Role models (the planner, reviewer and writer use "Plan", the searchers use "Fast"). One conversation can choose its own with the models chip in its chat box (**One model for everything** or **Different models**).
- **Helpers at once:** when the conversation is on a tier, that tier's sub-agent limit (Settings → Model Tiers) also applies, and the lower number wins.
- Deeper runs take longer and use many more tokens.
- Use Standard mode, not PTC mode, for research.
- **How good is it?** The method is the one the well-known research products use, but they have their own search engines and tuned models. Here the result depends on your model and on the app's web search. A small local model gives thin results at any depth. Quality has not been measured against those products.

Details: `addons/dsh-deep-research/README.md`.

## Activity indicator

A thin bar that shows what the model and its helpers are doing right now, so you can see at a glance that work is still going on. It works the moment it is installed.

- **What it shows:** prompt processing, thinking, writing, tool calls, web search, scripts, sub-agents, other conversations, waiting for your approval (everything pulses in one colour) and errors (everything pulses red). A short text beside it adds figures such as `TG 42 t/s · Tool read_file 2s · BG 2`.
- **It is part of the message box:** the line above the message box sits in the top of the box, in the same colour and width, with no space between. Switch **Fit the message box** off in **Settings → Activity** to let it span the whole chat area. For a wider chat and box, use **Wide chat area** in the sidebar's More menu; the line follows.
- **Seven designs** in **Settings → Activity**: a line or a lane of threads above the chat box, lanes or a history tape on the lower window edge, small spinning rings beside the model button, or two of them together. The page has a preview.
- **You choose what is tracked:** each kind of work has its own switch and colour. You can also turn the text or its figures off, use words in place of short codes, hide the bar while nothing runs, or switch off all movement.
- **Sounds:** it can play a short sound when the app starts waiting for you and when a turn fails. Pick from nine sounds, set the volume, and choose whether the waiting sound repeats until you answer.
- It keeps no text of your conversations and sends nothing anywhere.

The speeds for thinking and writing are estimates from the live stream that correct themselves after each answer. The prompt-processing speed is known once the first token arrives, so while a prompt is being read you see the seconds so far and the last measured speed. Details: `addons/dsh-activity/README.md`.

### Since 0.34: fold the message box away

The line above the message box has a small arrow at its right end. A click folds the message box down, so only the line and the row of figures under it are left and more of the conversation shows. The arrow then points up; another click brings the box back. It stays folded in every conversation and tab, and after a restart, until you click. While it is folded you cannot type or press Stop; unfold first. **Settings → Activity → Arrow to fold the message box away** takes the arrow out.

## PDF reader

Lets the model read PDF files properly. It uses what comes with macOS, so nothing is installed and nothing leaves your Mac.

- Put a PDF in the conversation's folder and ask about it by name, for example "Summarise report.pdf with page numbers". Type `/pdf report.pdf` to see its page count, contents list and which pages are scans.
- The model can read page ranges, search for a phrase, re-read a page with columns kept apart (for tables), turn a page into a picture, and recognise the text on a scanned page.
- A built-in skill makes it give a page for every claim, like `(p. 12)`, quote only what it has actually read, and list any pages it could not read.
- **Where it may read:** the conversation's folder, plus folders you add in **Settings → PDF reader**. "Allow any PDF on this Mac" is off unless you switch it on.

Complex tables and maths formulas can still come out wrong as text; for those the model can look at the page as a picture if it is a model that can see images. Password-protected PDFs cannot be read. Details: `addons/dsh-pdf/README.md`.

## Diagram builder

Lets the model draw accurate diagrams. The model only describes what is in the diagram; the layout, the drawing and a check for overlaps are done for it, so text fits its box and arrows land where they should. Nothing is installed and nothing leaves your Mac.

- **Ask in plain words:** "Draw a flowchart of how a bill becomes law", "Make a mind map of this chapter", "Plot sin(x) and cos(x) from 0 to 2 pi", "Chart these sales figures".
- **Kinds:** flowcharts and concept maps, trees and mind maps, sequences (who tells whom what, in order), timelines, charts (bars, lines, points) and plots of formulas.
- **Where it appears:** in the chat, under the answer, in the app's colours. Click it for full size. It is also saved as an SVG file in a `diagrams` folder inside the conversation's folder; change or switch that off in **Settings → Diagrams**.
- **The check:** if boxes overlap, a label does not fit, or too many arrows cross, the model is told and usually draws it again. A small note on the picture says if something was left unfixed.

The drawing is exact, but what goes into it is still the model's. Read a diagram with the same care as the answer it belongs to. Details: `addons/dsh-diagram/README.md`.

### Since 0.33: lines over time

A chart point's x may be a date (`["2026-03-31", 12.5]` or `["2026-03", 12.5]`). The bottom axis then shows dates, and a long line is drawn without a dot on every point. Other add-ons (Data, Finance) hand their charts to this add-on to show them under the answer.

## Learning

A tutor that makes you do the thinking, because trying first is what makes things stick. It asks a question before it teaches, helps in small steps, gives the answer last, asks you to explain it back, and brings each idea back days later.

- **Start:** in any conversation type `/learn` and a topic, a file or some code, for example `/learn chapter3.pdf`. A study bar appears above the chat box; press **Start**.
- **While studying:** try the question, even with a guess. **Hint** asks for a small step. **Show answer** unlocks when the level allows it. **End** stops and keeps what you finished.
- **Three levels,** switchable from the bar: Gentle (the answer whenever you ask), Firm (an attempt first; the answer after three hints or when you give up after trying), Strict (also say where you are stuck before each hint; no giving up early). Firm is the default.
- **Reviews:** each idea comes back after 1, 3, 7, 16 and 35 days, sooner if you needed the answer. `/learn review` goes through what is due. **Settings → Learning** shows what is due and how each topic is going.
- **What is kept:** the questions and how each try went, on your Mac. Not what you wrote.

Use a strong model as the tutor, and prefer studying from your own PDF or notes: a tutor that teaches something wrong is worse than none. The rules are enforced by the add-on's tools and buttons, but a weak model can still give an answer away in its text. Details: `addons/dsh-learn/README.md`.

## Code power

Adds skills for reviewing a pull request (`/review`), fixing failing tests in a loop, trying several solutions and keeping the best, and a blind judge that compares candidate changes. Nothing to set up. Uses your Model Tiers role models when they are set.

## Sampling presets

Named settings such as "precise" (low temperature) or "creative", picked automatically by kind of task or by mode, or by hand with `/sampling`. Set them up on **Settings → Sampling**.

## Model arena

Ask several models the same question at once, read the answers under neutral labels (A, B, C), pick a winner, then reveal which model was which.

Open **Settings → Arena** (or **Model Arena** in the sidebar). Under **Setup**, pick at least two models from the list; you can set an effort for each. Optionally pick a **judge model**, which compares the answers without knowing who wrote them. The other options each have a one-line explanation: answers per round, hiding names, the judge's criteria, the time limit, the longest answer, and how long rounds are kept. Changes save as you make them.

Then type a question and press **Ask the models**. The answers appear side by side as A, B, C, D. Press **Pick this answer** on the one you prefer, **Ask the judge** if you set one, and **Reveal the models** to see who wrote what, with speed and token counts. The `/arena` commands still work in a chat. The judge needs the Code power add-on, which is installed with Plus.

## Benchmark

Runs your own test questions over several models and settings, scores the answers and reports quality, speed and cost.

Open **Settings → Benchmark**. The page walks you through the first run in three steps. First, add the **models to test**. Second, create a **suite**: press **New suite** (or **Add an example suite**), write what to ask, and choose how each answer is graded: contains a text, is exactly a text, matches a pattern, or is scored by a judge model. Third, choose the suite and press **Run**; the page says how many model calls that makes.

Optional settings: temperatures and max output tokens to try on each model, how many times each prompt is repeated, limits on time and spend, and prices per model for the cost column. Results show score, speed, errors and cost per model and setting, plus a recommendation per category. The `/bench` commands still work in a chat.

## Route health

Checks that each provider answers, shows a coloured dot in the chat box, and moves conversations to a tier's backup model while a provider is down (for example a home server that is asleep).

```yaml
- id: route-health
  config:
    routes:
      <PROVIDER>:
        probeUrl: <THE PROVIDER'S ADDRESS>/models
```

`/routes` shows the state of each one.

## Model router

Lets a small, fast model choose, for each message, which of 2 to 5 models should answer. Needs the candidates and the small model; example in `addons/dsh-model-router/README.md`. Turn it on and off with `/router on` and `/router off`.

## Role prompts

Adds your own standing instructions to every conversation, or only for some tiers. Ready-made texts for planning, coding and routing are in `addons/dsh-role-prompts/examples/`.

```yaml
- id: role-prompts
  config:
    sections:
      my-rules:
        text: |
          <YOUR INSTRUCTIONS>
```

## Notify

Runs a command when the assistant finishes or is waiting for your approval, for example to show a Mac notification:

```yaml
- id: notify
  config:
    rules:
      - id: done
        on: turnEnd
        command: [osascript, -e, 'display notification "Finished" with title "DeepSeek Harness"']
```

For alerts without writing a command, on this Mac and on your phone, use [Automations](#automations) instead.

## Media tools

Image generation and editing through any OpenAI-compatible images service, and an "ask me first" gate for the browser and computer-control tools. Needs the service's address and model; full example in `addons/dsh-media-tools/README.md`. Keys are never written in the file: you give the **name** of an environment variable that holds the key.

Since 0.57.0, a conversation with Web set to Off has no image tools, unless the image service's address is on this Mac or your own network.

## Sync

Keeps your conversations (and, if you want, your project list) the same on several Macs, through a **private** git repository you create (on GitHub, for example). Neither Mac has to be on for the other to sync. Optional encryption with `age`.

```yaml
- id: sync
  config:
    remote: <ADDRESS OF YOUR PRIVATE GIT REPOSITORY>
    deviceLabel: <A NAME FOR THIS MAC>
```

For iCloud Drive instead of GitHub, make an empty repository in iCloud once (`git init --bare "$HOME/Library/Mobile Documents/com~apple~CloudDocs/DeepSeek Harness Plus/sessions.git"`) and use that full path as `remote`. Apple does not support git inside iCloud; if it ever misbehaves, a private GitHub repository works the same way.

Then `/sync push` on one Mac and `/sync pull` on the other. **Before the first pull, back up `~/.dsh/sessions`**, because pulling copies the other Mac's conversations in. A conversation tied to a project folder can only be continued on a Mac where that folder has the same path. The details, including automatic sync and encryption, are in `addons/dsh-sync/README.md`.

**Recon conversations are never synced** (since 0.57.0): they are never pushed or pulled, and one an earlier version pushed is taken off the remote's branch (its git history still holds it). Which conversations are Recon's is known from the Modes add-on, so while Modes is off or still starting, push and pull stop and say why.

## Shared settings

Keeps the settings you change in the app's pages the same on two Macs, through one `settings.json` in a folder such as iCloud Drive. Those settings are Modes, Model Tiers, the Cowork tabs, Sampling presets and Colours. It holds no secrets. The installer asks about it, or you can choose the folder yourself with `bash scripts/install.sh --settings "<folder>"`. The README section **Same settings on both Macs** explains how to use it. The details are in `addons/dsh-shared-settings/README.md`.

## Context saver

Shortens very large tool results before the model reads them and keeps the full text so the assistant can look it up. Off until switched on, and it needs the optional Python tools in `extras/dsh-intel-mcp` installed first. Setup is in `addons/dsh-context-saver/README.md`.

## Settings helper

Sorts the Plus pages of the Settings window into groups with headings (Tabs and modes, Models, Cost and limits, Agents and runs, Knowledge and files, Look and this Mac), gives every page an icon, and adds a **search field** at the top of the window.

- **Cmd-F** (Ctrl-F) jumps to the field. Type any word: a page, a setting, or what it does ("trim", "budget", "Tor"). **Enter** opens the result, scrolls to the setting and outlines it.
- It also finds settings that have no control on any page; those are marked **configuration file only**, and **Open configuration file** at the top of the window is where to change them.
- Works right away. To switch it off, use the Plugins panel. Details: `addons/dsh-settings-plus/README.md`.

