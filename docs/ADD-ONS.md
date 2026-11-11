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

  **Each tab lists only its own conversations.** Code shows your coding projects, Chat your chats, Cowork your tasks. Use the `⋯` on a conversation or a project to move it to another tab; **Show all** gives the app's full list with search.

  **The Chat tab has no folders.** A chat lives on its own, so the Chat tab hides the workspace and preset pickers, always starts a new chat in the app's default workspace, and shows your chats as one flat list. The `⋯` on a chat can **Promote to Cowork** or **Promote to Code** (the same conversation, in the new mode) or **Continue in a project…** (a new conversation in a project you pick, with the chat attached for the assistant to read).

  The start page shows a greeting per tab, and on the Cowork and Code tabs, suggestion chips under the chat box (Create slides, Build website, …) that fill in a starter prompt.

  **Connectors** lists your MCP servers. Each shows whether it is connected and how many tools it brings, with an on/off switch. A short form writes out the settings lines for a new one. **Skills** lists the skills the assistant can use, with search.
- **Your projects and Settings**, as before.

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

The chat box also gets two buttons for the open conversation:
- **Search** switches the web tools on or off. It starts off in Chat and on in Cowork and Code.
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
2. Under **Tasks**, add tasks from your real work, each with a way to check the result (the answer contains a text, is valid JSON, matches a pattern, a file exists, or a judge model scores it). Put them in three groups: **Learn** (the reviewer studies these), **Check** (prove a change helps) and **Guard** (things that must keep working). Or press **Add example tasks** to try it first.
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

Gives the assistant a `deep_research` tool: it splits a question into sub-questions, researches them in parallel and writes a report whose sources are checked. Ask for it in plain words ("do deep research on ..."). It uses your web search, so it costs tokens; nothing to set up.

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
