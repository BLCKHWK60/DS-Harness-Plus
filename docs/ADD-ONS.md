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

  The start page shows a greeting per tab, and on the Cowork and Code tabs, suggestion chips under the chat box (Create slides, Build website, …) that fill in a starter prompt.

  **Connectors** lists your MCP servers. Each shows whether it is connected and how many tools it brings, with an on/off switch. A short form writes out the settings lines for a new one. **Skills** lists the skills the assistant can use, with search.
- **Your projects and Settings**, as before.

The **More** menu in the sidebar ends with two switches: **Hide DeepSeek logos** (the logo and name at the top of the sidebar and the logo on the start page) and **Show the date as the title** (the start page shows today's date, like "11 November, 2026", instead of the greeting).

To get the normal sidebar back, switch **Cowork sidebar** off on the **Plugins** page. It takes effect at once. Use that main switch, not the switch for its inner row on the details page: that one would leave you with no sidebar at all. To choose which pages each tab shows, see `addons/dsh-cowork-shell/README.md`.

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

The chat box also gets three buttons for the open conversation:
- **Search** switches the web tools on or off. It starts off in Chat and on in Cowork and Code.
- **Tools** says whether the assistant has any tools ("Tools on" or "Tools off"). Click it for one switch that turns every tool off or back on for this conversation, and for the list of what the assistant can and cannot call. With tools off, the assistant is offered nothing, so it does not try and you see no failed attempts. In a conversation started in the app's PTC mode, the panel says so: there the assistant reaches tools from inside small programs it writes, and "Tools off" stops those programs too.
- **Deep research** has the assistant research questions thoroughly and answer with a cited report. With the Cowork sidebar on, the sidebar tabs choose instead, and the chat-box selector is hidden. A mode decides which tools the assistant may use, how its sandbox is set, a default tier, and a short instruction. The default mode, Cowork, allows every tool, so nothing is restricted until you choose otherwise. Edit or add modes on **Settings → Modes**.

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
- a switch, **Use only these**, that leaves out the instructions of the tier, the Chat / Cowork / Code mode and the role prompts while the version is in use. The app's own text about its tools always stays;
- **Instructions per app mode**: a text for each of the app's modes (Standard, PTC, Minimal, Creator, and any you add in Settings → Agent presets), either added to the version's instructions or used alone.

The app can only send temperature and max output tokens to a model. Top-p, top-k and similar settings stay on your model server.

If you used Tiers before 0.10, your tiers keep their names (Haiku, Sonnet, Opus, Fable, Code) and models.

## Privacy

By default the app reports to its maker in two ways, whichever model you use. This add-on switches both off:

- **Usage events:** on the desktop app, an event for each message you send, with the model name, your device and account ids and details of your Mac. No prompts or answers.
- **Conversation upload on feedback:** pressing thumbs-up or thumbs-down on an answer uploads the conversation up to that point.

Type `/privacy` in a chat to see that both are off. To switch reporting back on, switch the Privacy add-on off on the Plugins page and restart the app.

Still on, because they are features and not reporting: update checks, your DeepSeek sign-in while you are signed in, the plugin list, web search when a conversation uses it, and any cloud model you pick. With a local model, your prompts and answers go only to your model server. For certainty about every connection, use a firewall app.

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

Gives the assistant a `deep_research` tool: it splits a question into sub-questions, researches them in parallel and writes a report whose sources are checked. Ask for it in plain words ("do deep research on ..."). It uses your web search, so it costs tokens; nothing to set up. In PTC mode the app stops any one program after 10 minutes at most, so research there is shorter (it stops searching after about 7 minutes and writes up what it has). For long research, start the conversation in Standard mode.

## Activity indicator

A thin bar that shows what the model and its helpers are doing right now, so you can see at a glance that work is still going on. It works the moment it is installed.

- **What it shows:** prompt processing, thinking, writing, tool calls, web search, scripts, sub-agents, other conversations, waiting for your approval (everything pulses in one colour) and errors (everything pulses red). A short text beside it adds figures such as `TG 42 t/s · Tool read_file 2s · BG 2`.
- **Seven designs** in **Settings → Activity**: a line or a lane of threads above the chat box, lanes or a history tape on the lower window edge, small spinning rings beside the model button, or two of them together. The page has a preview.
- **You choose what is tracked:** each kind of work has its own switch and colour. You can also turn the text or its figures off, use words in place of short codes, hide the bar while nothing runs, or switch off all movement.
- **Sounds:** it can play a short sound when the app starts waiting for you and when a turn fails. Pick from nine sounds, set the volume, and choose whether the waiting sound repeats until you answer.
- It keeps no text of your conversations and sends nothing anywhere.

The speeds for thinking and writing are estimates from the live stream that correct themselves after each answer. The prompt-processing speed is known once the first token arrives, so while a prompt is being read you see the seconds so far and the last measured speed. Details: `addons/dsh-activity/README.md`.

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

## Media tools

Image generation and editing through any OpenAI-compatible images service, and an "ask me first" gate for the browser and computer-control tools. Needs the service's address and model; full example in `addons/dsh-media-tools/README.md`. Keys are never written in the file: you give the **name** of an environment variable that holds the key.

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

## Shared settings

Keeps the settings you change in the app's pages the same on two Macs, through one `settings.json` in a folder such as iCloud Drive. Those settings are Modes, Model Tiers, the Cowork tabs, Sampling presets and Colours. It holds no secrets. The installer asks about it, or you can choose the folder yourself with `bash scripts/install.sh --settings "<folder>"`. The README section **Same settings on both Macs** explains how to use it. The details are in `addons/dsh-shared-settings/README.md`.

## Context saver

Shortens very large tool results before the model reads them and keeps the full text so the assistant can look it up. Off until switched on, and it needs the optional Python tools in `extras/dsh-intel-mcp` installed first. Setup is in `addons/dsh-context-saver/README.md`.
