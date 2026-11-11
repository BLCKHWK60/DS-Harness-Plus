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
| [Usage counter](#usage-counter) | yes | Settings → Usage | `/usage` |
| [Deep research](#deep-research) | yes | | |
| [Code power](#code-power) | yes | | `/review` |
| [Sampling presets](#sampling-presets) | after setup | Settings → Sampling | `/sampling` |
| [Model arena](#model-arena) | after setup | Settings → Arena | `/arena` |
| [Agent swarm](#agent-swarm) | after setup | Settings → Swarm | |
| [Benchmark](#benchmark) | after setup | Settings → Benchmark | `/bench` |
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

  The start page shows a greeting per tab, and on the Cowork tab, suggestion chips under the chat box (Create slides, Build website, …) that fill in a starter prompt.

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

Five ready-made tiers (from quick to most thorough), each with its own model, effort level, internet access and limit on helper agents. Switch tiers from the chat box. On **Settings → Model Tiers** you pick the model per tier, add your own tiers, set a backup model per tier for when one is unreachable, and set role models (plan, implement, review, fast) that other add-ons use.

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

Ask several models the same question at once, read the answers under neutral labels (A, B, C), pick a winner, then reveal which model was which. Smallest setup, two models:

```yaml
- id: model-arena
  config:
    candidates:
      - { id: first, provider: <PROVIDER>, model: <MODEL> }
      - { id: second, provider: <PROVIDER>, model: <MODEL> }
```

Then in a chat: `/arena ask <your question>`, then `/arena pick A` and `/arena reveal`. Rounds also appear on the **Model Arena** page in the sidebar (Chat tab) and on **Settings → Arena**. For `/arena judge` (an AI judge), add `judge: { provider: <PROVIDER>, model: <MODEL> }` under `config`.

## Agent swarm

A named team of helper agents that work on one task together: all at once, one after another, or as a debate. The assistant starts a swarm when you ask ("use the review swarm on this"). Watch runs on **Settings → Swarm**. A small three-reviewer team:

```yaml
- id: agent-swarm
  config:
    swarms:
      review-team:
        description: 'Three reviewers look at the same work'
        strategy: fanout
        maxActive: 3
        members:
          - { id: correctness, role: review, instructions: 'Look for mistakes.' }
          - { id: security, role: review, instructions: 'Look for security problems.' }
          - { id: simplicity, role: review, instructions: 'Look for needless complexity.' }
```

`role: review` uses the review model from Model Tiers. To use a specific model instead, write `provider: <PROVIDER>, model: <MODEL>` in place of `role: review`.

## Benchmark

Runs your own test questions over several models and settings, scores the answers and reports quality, speed and cost. It needs targets (models) and suites (questions); the full example is in `addons/dsh-benchmark/README.md`. Start a run with `/bench run`; results show on **Settings → Benchmark**.

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
