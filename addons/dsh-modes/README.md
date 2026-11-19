# Modes

Host and client plugin `@local/dsh-modes` (dsh 0.2.2-rc.1): Chat, Cowork and Code modes you can switch **per session, at any time**. A dsh agent preset is fixed when a session is created, so a mode is applied to the live Agent instead: it never needs a new session.

A mode sets:

| Field | Values | Effect |
|---|---|---|
| `label` | text | name in the selector |
| `tools` | `"all"`, `"none"`, or a list of tool names | the tools the model sees (a restriction on that Agent; unknown names are ignored) |
| `sandbox` | `inherit`, `read-only`, `workspace-write` | the conversation's access level (file sandbox mode), set when a conversation starts in the mode or switches into it (also a move made in the sidebar while the conversation was closed, once it is opened), never on a plain reload. `inherit` restores what the conversation had before a mode changed it, also after a restart. `danger-full-access` cannot be set by a mode |
| `defaultTier` | a Tier id or empty | a new conversation that starts in this mode, and a switch to it (also a move made while the conversation was closed), moves to that tier (needs the Tier plugin) |
| `prompt` | text | a prompt section `modes:mode` (order 58) while the mode is active |
| `keepPrompt` | `true` or absent | the prompt is kept even under a model version that stands alone (Scout sets it; isolated modes always keep theirs) |
| `startFamilies` | a list of family ids (or tool names) | where tools load as needed, these are there from the first step (Data: `data`, `pdf`) |

Built in (until you supply your own `modes`): **chat** (no tools, read-only, a short "no tools" prompt), **cowork** (all tools, sandbox unchanged), **code** (all tools, `workspace-write`).

## Configuration

```yaml
- id: modes
  config:
    modes: '{"<id>": {"label": "...", "tools": "all", "sandbox": "inherit", "defaultTier": "", "prompt": ""}}'   # JSON; replaces the built-in three
    defaultMode: cowork       # mode of a session that has not chosen one
    scheduledMode: cowork     # mode of a conversation an Automation task opens (unknown id: the first mode with all tools); Settings → Modes
    extraModes: '{}'          # modes other add-ons add (same JSON shape as modes); they come after yours and never replace one
    pruneStaleSessions: true  # drop choices of Sessions that no longer exist (a conversation in the Cowork sidebar's trash keeps them)
    pinOnFirstTurn: true      # record the mode a Session starts in, so a later defaultMode change (e.g. a Cowork sidebar tab) only affects new Sessions
    sessionWeb: '{}'          # per-Session Search switch (the chat-box button writes it)
    sessionResearch: '{}'     # per-Session Deep research switch (the chat-box button writes it)
    sessionTools: '{}'        # per-Session Tools switch: { sessionId: false } means no tools at all
    searchDepth: standard     # the Depth for new conversations, and for those that never picked one: quick | standard | thorough (a stored deep counts as thorough); Settings → Modes
    codeMethod: true          # Code's built-in working method while its prompt is empty; Settings → Modes
    coworkMethod: true        # Cowork's built-in working method while its prompt is empty; Settings → Modes
    trimModes: [cowork, code, data]   # modes that load their tools as needed
    sessionSandboxBase: '{}'  # per conversation: the mode its level was last set for, and the level from before a mode changed it (written by the add-on)
    dataTrimAdded: false      # done once (0.57.0): data added to a stored trimModes list
    researchDepth: standard   # obsolete since 0.59.0: a research run follows its conversation's Depth
    researchModel: same       # Deep research's helpers: same (the conversation's model) | roles (Model Tiers role models)
    # With the Cowork sidebar on: a Session that has not sent a message follows defaultMode (the tab), its first
    # message fixes that mode (replacing any earlier choice), /mode <id> before it does not switch (it names the tabs),
    # and the chat-box selector is hidden.
    commandName: mode
```

`sessionModes` (`{sessionId: modeId}`) is written by the selector and the command; do not edit it by hand.

## Using it

- **Composer selector**: a drop-down left of Tier's control; it re-reads every 3 seconds so a `/mode` switch shows up.
- **Command**: `/mode` lists modes, `/mode <id>` switches. With the Cowork sidebar on, `/mode <id>` before a conversation's first message does not switch: it answers that the selected tab decides the mode of a new conversation and names the tabs. After the first message it switches as always.
- **Service `modes`**: `list()`, `get(sessionId)`, `set(sessionId, modeId)`.
- A switch made during a running turn waits until the Agent is idle, so tools and sandbox never change mid-turn.

## Settings page

Settings > **Modes** edits the mode list without touching YAML: one card per mode (id, label, tools All / None / Only these with a list of tool names, file sandbox, default tier, prompt with a 4,000-character counter), the default mode, add / remove, and "Restore built-in modes". It reads and writes the plugin's own `modes` and `defaultMode` fields through the settings channel (the same one Tier and the composer selector use), in one save, and retries once on a revision conflict. It refuses ids that are not lower-case letters, digits and dashes, duplicate ids, an empty tool list under "Only these", and a default that is not one of the modes. A mode another add-on adds (Finance, Research, Scout, Recon, Data) is not edited here, but it is offered as the default too, marked "(add-on)", because selecting its sidebar tab makes it the default. Fields the editor does not know about are kept on save. The default-tier box suggests tier ids when the Tier plugin is loaded. Since 0.57.0 the page also has, saved at once: **New conversations** (since 0.59.0 the Depth for new conversations and those that never picked one, `searchDepth`, before that the Web level; the mode for scheduled tasks, `scheduledMode`), **Sidebar** (Tabs in the sidebar, 1 to 5, written to the Cowork sidebar's `cowork-shell.maxTabs`; shown only while the sidebar is on, and a mode card beyond that count says it has no tab and can only be reached with /mode) and **Built-in working methods** (`codeMethod`, `coworkMethod`). Needs a restart of the app once to load (client half).

Tested in a throwaway web profile: add a mode, validation messages, save (written to the profile patch as the same JSON string), the composer selector picked the new mode within 3 seconds, dark and light. Not tested in the desktop app.

## Limits

- The lists in the Tools panel show what the app registered for the conversation. A tool the app only offers under a condition can be listed as callable and still be left out of a request. The web tools are the exception: `web_search` is offered only while a search backend is ready for the model in use, so the panel asks the app and lists a web tool that is not ready under "Cannot call", with a line saying so. Where tools load as needed, the tools the model can still add are listed apart, under "Loaded when needed", not as "Cannot call".

- A conversation opened by an Automation task starts in `scheduledMode` (Settings → Modes → Mode for scheduled tasks), not in the tab last looked at (which, in Chat, gave it no tools). The app creates it in the selected tab's mode first; Modes moves it when the app's scheduler resolves it (`schedule/resolve-agent`, before the task's message is sent, so a tier change is finished before the first step), or else at its first inbox message (`agent/inbox/spliced` with `source.kind: 'schedule'`). A task delivering to an existing conversation keeps that conversation's mode.
- Conversations from before 0.57.0 have no stored earlier level. Leaving Chat (or another mode that sets a level) for a mode that does not set one gives them the level of their permission preset (the one the app recorded for the conversation, else your default preset), but only while the level in force is still the one the previous mode set; without the app's permission presets nothing is written and the conversation stays Read only until the access level is set in the chat box. A move made in the sidebar while such a conversation is closed is seen only once it has been opened in 0.57.0 or later.
- A conversation whose mode comes from an add-on that is switched off opens in the default mode; that counts as a move, so it gets the default mode's level (and its own back when the add-on returns).
- Sub-agents (children) start in `defaultMode`, not in the parent's mode. A chat session cannot spawn them anyway (no tools).
- The earlier access level is kept for good only for conversations; a helper agent keeps it while it lives.
- A conversation's tier from its starting mode can be put back only to a tier the app knows (`resolveTier`); a conversation on a model that belongs to no tier keeps the start tier after a move before its first message.
- Changing tools invalidates the model's prompt cache from the first changed tool schema.
- The mode list is edited on the Settings page below; the composer selector itself stays a plain `<select>`.
- Renaming a mode id in the editor leaves sessions that had the old id on the default mode (their stored choice no longer matches).


## Search, Deep research and Tools buttons

Three buttons in the chat box switch tools for **this conversation only**. They apply at the next turn.

- **Search** turns the web tools (`web_search`, `web_fetch`) on or off.
  - Default: on in modes with all tools (Cowork, Code), off in a no-tools mode (Chat).
  - In Chat mode with Search on, the model gets only the web tools, and a note that it may use them.
- **Deep research** makes `deep_research` available, and tells the model to use it for questions that need looking things up. The helper agents it starts do the searching and get the web tools for that, whether or not Search is on.
- **The small arrow beside Search and beside Deep research** opens a slider with three steps: Quick, Standard, Thorough. Unlike the buttons, the step is **one setting for all conversations** (`searchDepth`, `researchDepth`), and the button shows it when it is not Standard ("Search · Thorough").
  - **Search depth** changes what the model is told about searching. Quick: one search and a short answer. Standard: nothing is added, the model decides, as before. Thorough: several searches with different wording, at least five pages opened and read, facts cross-checked between sources, disagreements named, each source cited with its date. It is an instruction, not a guarantee: a model may still do less.
  - **Model for the helpers** (in the Deep research panel) chooses what Deep research's helpers run on: **Same as this conversation** (default) or **Role models** from Settings → Model Tiers (`researchModel`: `same` | `roles`).
  - **Deep research depth** sets how a research run works: Quick is 1 round with up to 4 helpers at once, Standard 2 rounds with up to 6, Thorough 3 rounds with up to 8. See the Deep research add-on.
- **The buttons shrink to keep the chat box's bottom row on one line** (since 0.31.1). They measure the row, which also holds the app's own buttons and the model's name, and give way in steps: first the step's name and some padding, then "Tools" becomes an icon, then "Deep research", then "Search". If the row cannot fit on one line whatever they do, it takes two lines and the names come back as far as the first line holds them.
- **Tools** shows at a glance whether the model has any tools ("Tools on" / "Tools off") and opens a small panel with:
  - one switch for all tools of the conversation. Off means the model is offered no tool at all, so it cannot try to call one and there are no failed attempts to look at; Search and Deep research are greyed out, and the model is told to answer from what it knows. On puts back what the mode allows (in Chat, where the mode has no tools of its own, On switches Search on);
  - the list of tools the model can call and the list it cannot, read from the app for that conversation.

### Helper agents follow their conversation

A helper agent (a sub-agent, a deep-research searcher) has no mode of its own. It takes the mode, the Search switch, the Deep research switch and the Tools switch of the conversation that started it, and it does not get the mode's wording ("answer in one reply, no tools").

Before 0.20 a helper was treated as a new conversation and got the default mode. With the Cowork sidebar on, that is the tab you are on: in the Chat tab, helpers got no tools at all, so Deep research always ended with "found no usable sources". Fixed.

Tool names are passed to the app's restriction as they are. In this dsh version most tools come from the conversation's agent preset and are not listed to plugins, so a name is not checked against a visible list. A name the app refuses is left out, with a warning in the log.

Checked in the throwaway web profile by reading the exact request the model received:

| Case | Tools the model got |
| --- | --- |
| Chat with Search off | no tools |
| Chat with Search on | `web_fetch` only (that lab has no `web_search` backend), plus the note |
| Chat with Deep research on | `deep_research`, plus the research note |
| A deep-research helper of that Chat conversation | `web_fetch` (and `web_search` where a search backend is ready), no Chat wording (0.20; before: no tools) |
| Any conversation with Tools off | no tools, plus the note that tools are off (0.20) |
| Cowork with Search off | all 32 other tools, `web_fetch` removed |

Earlier versions filtered a mode's tool list against the tools visible to plugins. That silently dropped preset tools, for example `read` and `grep` in a custom "Review" mode. Now fixed.

## Since 0.33.0: a method for Code (and since 0.57.0 for Cowork)

`CODE_METHOD` in `lib/prompt.js` is used as the Code mode's instructions while that mode's own `prompt` is empty and the setting `codeMethod` (default on) is on. `COWORK_METHOD` does the same for Cowork (setting `coworkMethod`, default on); its words were approved by the owner and are not to be changed. Both switches are on Settings → Modes. It is applied when the prompt section is built, not stored in the mode table, so the Modes page still shows an empty box (with a line saying what is used). A model version that "stands alone" leaves it out like any mode text.

## Since 0.34.0: Rerun, and hiding the thumbs

- **Rerun** is an entry (id `modes-rerun`, order 20) in the app's slot `conversation.chat.assistant-actions`, so it sits after the app's thumbs and before Branch. A click reads the conversation's events with `remote.session.page` (newest window first, further back as needed), finds the answer by its message id, takes the text of that turn's own `user/message` events (`source.kind === 'user'`), and the `turn/end` before that turn. It then calls `sessions.fork({ sessionId, atSeq, increaseTitle: true })` at that `turn/end` (the same cut the Branch button uses); for a first turn there is nothing to fork, so it calls `sessions.create({ cwd })` with the conversation's folder. The copy gets the source's mode (`sessionModes`) and the source's selected model (`modelSelection.next` from `remote.session.projections`, applied with `remote.session.selectModel`), then the question is sent with `remote.session.prompt` and the copy is opened.
- The app has no way to erase or replace an answer inside a conversation; that is why a rerun is a copy.
- Attachments are not sent again: only text parts are. The button shows a line saying so when the question had other parts.
- **Settings:** `rerunButton` (default on) and `hideFeedback` (default off), as two switches at the top of Settings → Modes that save at once. Hiding is a style rule on the app's two feedback buttons (they are the only buttons with `aria-pressed` in that slot); the app's plugin list is read-only, so the feedback part itself cannot be switched off.
- **Same chat box in every mode:** `uniformBox` (default on; Settings → Modes → Chat box) makes the Web, Depth, Models and Tools buttons read the same in every mode: the shrink step is chosen with the other controls of the seat hidden, the model's name in full and the access button held at one width (`[data-dsh-pin]`), so it depends on the window's width alone. When the real row is then full, the route badge moves to a second line (`[data-dsh-below]`, CSS order only). The place (Scratch or the project) is a chip above the box (Cowork Shell), and a mode's own buttons (Creator Plus, Devices rules, Export for Recon, Focus, the Finance pill) are in the gear's popup (Settings helper, `extrasInGear`), so the box itself holds the same buttons in every mode; those add-ons are not edited. A window too narrow even for that, or the switch Off, uses the former shrinking.
- **Starting values per mode:** `modeStart` (JSON, empty at first; `lib/start.js`; Settings → Modes → Starting values for new conversations) sets what Web, Depth, Models (One model / Different models) and Tools (Off) read in a conversation that begins in a mode. The host writes them once, when the conversation starts (`seedStart`, from `agent/created`), into `sessionWeb`/`sessionWebLevel`/`sessionDepth`/`sessionHelpers`/`sessionTools` where the conversation has no value yet, so the page, the prompt and the tool lists read them like a pick made by hand, which replaces them later. "Usual" (nothing) changes nothing. An isolated mode (Recon) honours only Web Off; no value widens a mode's tools or sandbox. The page also sets `data-dsh-uniform` on the document for the Cowork sidebar's place chip.
- **Tested (0.34.0)** in the test setup with a stand-in model: a rerun of the seventh answer made a copy with the six earlier turns and the question once, without the old answer; after choosing another model the copy ran on that model; a rerun of a conversation's only answer opened a new conversation in the same folder and mode; the thumbs switch hid the thumbs. Not tested: a question with attachments, a very long conversation (more than one window of events), the Mac app.

## Since 0.40.0: one model or different models for helpers

The owner runs large local models and cannot hold several in memory at once. Each tool that starts helper agents used to decide for itself which models they run on. Now there is one choice, per conversation, and it shows in the chat box.

- **The chip** sits beside the Tools button: "One model" (helpers run on the conversation's model; nothing else is loaded) or, in an amber outline, "N models" (helpers may run on other models; N is the conversation's model plus each different model named for a role). On a narrow row only its icon shows; the colour still tells the two apart.
- **Its panel** has the two choices, says in words what each means for memory, and under "Different models" lists every model the conversation may use and where it is set (Model Tiers role, Mission, Mission for this project). "Use this for new conversations too" changes the default.
- **Stored** as `sessionHelpers` (JSON, conversation id to `same` or `roles`); a conversation without an entry follows `researchModel`, which is now the default for all helper tools, not only Deep research. Its default stays `same`.
- **Service:** `modes.helperModels(sessionId)` returns `same` or `roles`; a helper asking gets its conversation's answer. `GET /dsh-modes/tools` carries `helpers { policy, explicit, usual, own, sources, count, names }`.
- **Who follows it:** Mission (`/mission` runs), Deep research, Agent swarm (also over a member's own model), the Tier tools (`delegate_role`, `review_lanes`, `run_pipeline`: with "one model" they work even when no role model is set) and Code power's judge. The app's own `subagent` tool lets the model name a model for a helper: with "one model", such a call is refused with a plain reason, and a call without a model named runs on the conversation's model.
- **Not covered:** the Self-improvement, Arena and Benchmark pages, which run the models you pick on those pages; the Model router add-on, which can move the conversation itself to another model between requests; and a model server that keeps an earlier model loaded after you switch.
- The "Model for the helpers" section that used to be in the Deep research panel is gone: the chip is the one place for it.
- **Tested (0.40.0):** unit test in Mission (one model by default and with Modes saying so; the roles' models with "Different models"). In the test setup: the chip showed "One model", its panel the reason; switching to "Different models" turned it to "2 models" and listed them with their sources; a `/mission` run then started with "2 models" and its log shows both; switched back, the next run started with "one model for everything" and every step ran on the conversation's model. Not tested: Agent swarm, the Tier tools and Code power under either choice (same code path, not run); the refusal of a `subagent` call that names another model; the Mac app.


## Since 0.40.1: Stop also stops the helpers

Pressing Stop in a conversation ends its turn. The app leaves the helpers that conversation started
at work. Modes now stops them too, and their own helpers, the moment you press Stop. A Mission run
in that conversation is paused; `/mission resume` carries on and takes the stopped step again.

A stopped helper tells its parent that it was stopped, and the app would start a new turn for that
note. Since 0.40.2 such a note, within two minutes of your Stop, starts nothing; the conversation
stays stopped until you write again.

Since 0.40.3 this also holds when the conversation itself is idle and only its helpers are at work.

- **Tested (0.40.3):** unit tests; lab runs with a stand-in model, with Mission's helpers and with the app's own helper tool.
- **Not verified:** with real models.

## Since 0.41.0: isolated modes

A mode can be marked `isolated: true` (the Recon add-on does this). Its conversations then get
exactly the tools the mode lists and nothing else: no web search, no Deep research, no programs,
no helpers. The app's own notes (instruction files, the skill list, and since 17 November a skill's text when the user types `/skill-name`) are not handed to them, and
Plus's other add-ons leave them alone. A conversation that begins in an isolated mode is isolated
for good; one that began elsewhere can never become isolated. Other add-ons ask
`modes.isolated(sessionId)`. The rules are in `lib/isolation.js` and tested there.

With Tools Off an isolated conversation keeps its mode's own instructions (its rules on untrusted
text hold), and so does a model version that stands alone. Under the app's PTC preset an isolated
conversation is told that its tab works only in the Standard preset: its guard refuses `run_code`
on purpose, so it could not reach its tools there.

- **Tested (0.41.0):** lab runs with a stand-in model, reading what the model was sent.
- **Not verified:** with real models.

## Since 0.52.0: load tools as needed

Every request carries the description of every tool the model may call. In a mode with all tools that was 82 tools, about 18,700 tokens, before the user's message was read. Local models are slow to read that much.

With **Load tools as needed** (Settings → Modes, one switch per mode with all tools; on for Cowork and Code), a conversation starts with:

- **The core tools:** `read`, `write`, `edit`, `glob`, `grep`, `bash` and its jobs, `todo_write`, `ask_user_question`, `skill`, `read_image`, `working_directory`, `exit_plan_mode` (the app offers it only while /plan is on), and the web tools when Search is on.
- **`tools_find`:** lists the other families and adds the ones asked for, by family (`pdf`, `data`, `finance`, `visual`, `schedule`, `helpers`, `goals`, `library`, `memory`, `mac`, `code`, `learn`, `mission`, `connectors`, `app`, `office`), by tool name, or by what is to be done ("read a PDF"). Names and descriptions are matched against every tool the app has, not only those already offered, so a single tool outside the families (`generate_image`, for example) can be added too. A family or tool that brings nothing here (its add-on is off, or Web is Off) is not added, and the reply says so. Added tools are there from the model's next step on.

The user's message adds families too, before the first step: "read this PDF" brings the PDF tools, "make a chart from this spreadsheet" the data tools. Loading one of the app's Office skills (by the model, or by the user with /office-pptx and the like) brings the `office` family, whose tools the skill says appear next step. Added families stay for the rest of the conversation (setting `sessionToolSets`), and helpers get their conversation's tools.

Modes with their own tool list (Chat, Research, Recon, Scout, or a Code mode set to a list) keep that list. Isolated modes are never trimmed. A mode another add-on adds with all tools (Finance, Data) gets its own switch on the page while its tab is on: off until you switch it on for Finance, on by default for Data since 0.57.0 (with its data and PDF tools from the first step).

**Measured in the lab:** "hello" in Cowork went from 82 tools (about 18,700 tokens) to 16 (about 3,000); the whole request to about 6,400 tokens. A family added with `tools_find` was in the very next step. Switched off, the next message carried all 82 again.

**Costs:** the step after a family is added cannot reuse the model's cache of the conversation. A model may now and then not think of `tools_find`; its note says to check there before telling the user a tool is missing.

## Since 0.54.0: one Web button

*Since 0.59.0 the Web button is only On or Off, and how much the model searches is the Depth button's (see "Since 0.59.0: Depth" below). This section tells how it was built.*

The **Search** and **Deep research** buttons in the chat box are replaced by one **Web** button with five levels:

| Level | What the model is told |
|---|---|
| Off | No web access: no `web_search`, no `web_fetch`, no `deep_research`, and none of the other tools known to reach the internet (since 0.54.1: the Free Search plugin's own tools such as `weather` and `multi_search`, the Finance data tools, Scout's search tools; list in `lib/mask.js`, `WEB_REACHING`; since 0.57.0 the image tools of an outside image service). Since 0.54.2 a shell command that goes online is stopped too (`goesOnline` in `lib/mask.js`: curl, wget, ssh and similar programs, web addresses, code that fetches, installs, git remotes), because the app's shell sandbox limits file writing only, not the network; since 0.57.0 so is a program (`run_code`) that goes online (`programGoesOnline`). That is a barrier, not a wall: a command written to hide its purpose could get past it. Connectors (MCP) stay on and can still reach the internet; the Off hint and the note to the model say so. |
| Quick | One search; answer from the results. |
| Standard | A few searches; open the pages that matter (no extra words). |
| Thorough | Several searches, at least five pages from different sites, cross-checked and cited. |
| Deep | At least ten searches, at least ten pages read, every key fact checked in two independent sources, disagreements stated, each source cited with its date. |

The level is kept per conversation (`sessionWeb`, `sessionSearchDepth`); picking a level also sets where new conversations start (`searchDepth`). A conversation that never had a level picked follows `searchDepth`, so changing it changes theirs too; the control on Settings → Modes says so ("Web level for new conversations (and those that never picked one)"). Off applies only to the conversation it is set in. The button is not shown in the Research tab (it researches with the web always; Depth and Focus are its own dropdowns in the chat box). Research-style tabs (those whose mode lists `deep_research`: Research, Scout) get no Web-level words and no web note in their instructions either, since they work by their own method and have no button to change the level with. Elsewhere the web note names only the web tools the step really offers, and a Web level is added only while `web_search` is offered. With Web Off in a mode that could go online, the model is told what went. `finance_profile_save` only writes a local line and stays with Web Off. In an isolated mode such as Recon (since 0.55.0) it sets how hard the mode searches with its own tools, in words that fit any search tool (`ISOLATED_LEVEL_PROMPTS`); Off there takes away the mode's tools that go online (Recon keeps only `recon_cite`) and says so (`ISOLATED_OFF_PROMPT`).

In-depth research with helpers lives in the Research tab. A conversation is a research one when its mode lists `deep_research`; its helpers get the web tools. The old per-conversation Deep research switch (`sessionResearch`) is no longer offered or read. In Cowork and Code `deep_research` stays available as a tool while the web is not Off.

**Since 0.55.1:** the Research tab always has the web, whatever a conversation's stored Web setting says (it has no Web button). Old "Search off" marks from before 0.54.0 are cleared once (`webMarksCleared`) in conversations of tabs with their own search tools (Scout, Recon, Research), where Off would now take those tools away; in Chat, Cowork, Code and Data they stay as Web · Off.

## Since 0.57.0: access level, start tier, /mode under the sidebar, Web Off for programs and images

- **The access level is remembered across restarts.** A mode writes its sandbox (`sandbox/mode`) only when a conversation starts in it or switches into it, never when a conversation that already ran is reloaded (app restart or the add-on loading), so a level picked by hand survives a restart. Chat sets Read only only for conversations that start in Chat or are moved into it. Per conversation, `sessionSandboxBase` stores `{ mode, base, set }`: the mode its level was last applied for, the level from before a mode changed it, and the level that mode set. Leaving that mode puts `base` back also after a restart, unless the level was changed by hand since (then the hand-picked level stays). Between two modes that both set a level, `base` stays, unless the level was picked by hand in between: then that level is the one to go back to. A conversation moved to another mode while it was closed (the Cowork sidebar's Move writes only its mode) is seen when it is opened, because `mode` differs: its new mode's level and tier apply as on a switch (so a conversation moved into Chat, Data or Research while closed is Read only once opened). A conversation opened with nothing stored gets only its `mode` noted, and only if nothing was stored for it meanwhile (a Rerun copy's carried entry wins). The earlier level is dropped once restored (the entry keeps only `mode`); the entry is pruned with the other per-conversation fields, carried into a Rerun copy that has earlier turns, and never shared between Macs (Shared settings' `ALWAYS_SKIP`). Conversations from before 0.57.0: see Limits. Pure rule: `lib/sandbox.js`.
- **A mode's tier applies to a new conversation from its first message**, not only on a switch: when the app creates the conversation (`agent/created` with `source: 'startup'`), never on a plain reload, never for a helper (a move made while the conversation was closed counts as a switch, see above). Before the first message, a move to a mode without a tier (another sidebar tab, or the mode of an Automation task, which the app learns only after creating the conversation) puts the earlier tier back, unless a tier was picked by hand meanwhile. For an Automation task this happens in the scheduler's `schedule/resolve-agent` hook, which the scheduler waits for (at most 10 seconds) before it sends the task's message: the model of a step is fixed before any step hook runs, so the task's first step would otherwise run on the tab's tier.
- **`/mode <id>` before the first message, with the Cowork sidebar on**, does not switch; it says that the selected tab decides and names the tabs (the first `maxTabs` modes, then every add-on's mode; `lib/tabs.js`). After the first message, and without the sidebar, it works as before.
- **Web Off also stops programs:** a guard on `run_code` refuses a program that fetches, opens a web socket, loads a network module (`http`, `https`, `net`, `tls`, `dgram`, `dns`, `undici` and the like) or starts curl, wget and similar (`programGoesOnline` in `lib/mask.js`). `terminal_send` is checked like the shell tools. Connectors stay on; the Off hint and the model's note say they can still reach the internet.
- **Web Off removes `generate_image` and `edit_image`** (or the names set in Media tools) unless Media tools' image service (`images.baseUrl`) is on this Mac or a private network: localhost, `*.local`, 127.0.0.0/8, ::1, 10/8, 172.16/12, 192.168/16, fc00::/7 (`privateAddress`, `imageToolsOffline` in `lib/mask.js`). The address is read from the app's loaded rows; unknown counts as outside.
- **Cowork's working method** (`COWORK_METHOD`, switch `coworkMethod`), see above.
- **`keepPrompt: true`** on a mode keeps its prompt under a model version that stands alone (Scout). **`startFamilies`** on a mode gives its conversations those families from the first step where tools load as needed; the trimmed note names them. Data loads its tools as needed by default (`trimModes` default `['cowork', 'code', 'data']`), and once (`dataTrimAdded`) 'data' is added to a stored `trimModes` list that lacks it; switched off after that, it stays off.
- **Settings → Modes** gained the controls listed under "Settings page". `scheduledMode` is now a live setting (`.volatile()`).
- **Tested (0.57.0):** unit tests for the pure rules; `test/start.test.mjs` runs the add-on whole in a stand-in app (`test/app.mjs`) across a restart: a hand-picked level survives a reload; leaving Chat after a restart restores the earlier level and drops it; Chat does not write Read only over a hand pick; a move made while the conversation was closed (with and without a restart: into Chat, Code, Cowork, and a Research-like add-on mode that is Read only), with its tier; a level picked by hand between two modes that set one; a Chat conversation from before 0.57.0 promoted to Cowork (its own recorded preset's level, else the user's default preset; nothing without presets); pruning; the start tier (created, not reloaded, not a helper; put back on a tab change or for an Automation task, kept after a hand pick; an Automation task's tier change finished before its message, with a slow Model Tiers); `/mode` with and without the sidebar; the `run_code` guard; the image tools with an outside and a local service; `keepPrompt`; Cowork's method; Data's start families and the one-time `trimModes` change. **Not tested:** in the app itself (Settings page look, the sidebar reading the new tab count, a real Automation task, the real sandbox).

## Changes in Plus 0.58.0

- **A conversation in the trash keeps its choices.** The Cowork sidebar's trash moves a deleted conversation's files out of the app's store for 30 days, so the app no longer lists it. Until now the pruning at the next start then dropped its choices (tab, Web, Tools, helpers, added tools, access level) and, for a Recon conversation, its isolation mark: put back after a restart, a Recon conversation came back as an ordinary Cowork one. Pruning now reads the trash folder (`<home>/trash/conversations`, `lib/trashed.js`) and keeps every conversation in it, moved or still waiting, with its helper conversations; it drops them once the trash erases them. When the trash cannot be read, nothing is pruned. Conversations already in the trash before this version may have lost their choices; those cannot be repaired. Tests: `test/start.test.mjs` (the trash reader; a trashed Recon conversation keeps its isolation mark, tab, Web and Tools across a restart, an erased one does not).

## Since 0.59.0: Depth

The owner set the roles of the three buttons in the chat box, the same in every mode, and asked for **one Depth everywhere** ("the Depth Settings should not differ, so I don't have to remember which mode had which settings. All modes deserve the full set of options in Depth"):

- **Web** turns web access **On or Off**, nothing more (`sessionWeb`). Its former levels are gone from it.
- **Depth** (Quick, Standard, Thorough: the names Research already uses) says how much work the conversation gets: how much it searches when Web is on, helpers, planning, checks and reviews, and how big a research run is. The same button in **every tab**: Chat, Cowork, Code, Finance, Data, Recon, Research, Scout and your own modes. It is kept per conversation (`sessionDepth`), and every pick is also where new conversations start in every tab (`searchDepth`, shown on Settings → Modes as "Depth for new conversations"). A conversation that never had a Depth picked follows that start. Its last stop, **Long run settings…**, opens Mission's Long run settings for the chat (the Run button next to Send starts a run with them; Send keeps the Depth) in every tab but Recon (also not in a Recon conversation moved to another tab), while Mission is on. While a Long run is on (Mission's `longRun`), the conversation and its helpers get `longRunMask`: the tab's own tools plus `mission_step`, and with Files and commands every tool; the web follows the run's Web switch (also for the shell's network guard and the `webOff` answer); an isolated tab's tools stay its own. Each tab's starting choice is **Settings → Modes → Long run tools** (`longTools`: `{ modeId: { files, web } }`; files on, the web on except in an isolated tab). The service also answers `readOnly(id)` and `longTools(id)`, and `refreshTools(id)` puts the mask on at once. Since 16 November 2026 the list is short: each stop has a few words ("Fast, light checks", "As usual", "Plan, 10+ searches, review"; in Research and Scout the run's size, "~25 min, 6 helpers"), the Lens is a row of chips, and every longer explanation (what each stop does, what Depth and a Lens are, the Web Off note) is a tooltip that shows after the pointer rests on it for 3 seconds (`TIP_MS`; screen readers get it at once as a description).
- **Effort** (Model Tiers) is how hard the model thinks. While a Depth note is given (Quick or Thorough), its words say only that, and Depth asks for the planning and checks; at Standard, and wherever no Depth note is sent, the effort words are as before. See that add-on's README.

What the model is told. **Standard** adds nothing. **Quick** and **Thorough** add a note right after the working method, in words the owner approved so that they never contradict a method's own checks or the tier's helper rules:

- Quick: "How much care this conversation wants: Quick. Keep the work short: one pass and only quick checks. Start helpers only when the tier asks for them. Everything in your working method still applies."
- Thorough: "How much care this conversation wants: Thorough. Make a short plan before you act. Before you finish, check your work against the request and your working method's checks. If helpers are allowed, ask one helper to review the result once, and fix what it finds."

In a tab whose tools cannot start a helper (Chat, Research, Scout, Recon, a tool list without `subagent` or `subagent_fork`), Thorough ends after "…your working method's checks." (`DEPTH_PROMPTS_NO_HELPERS`, `helpersOffered`): there the last sentence could only be read as asking for a second research run, or for edits to a report Research's method says to present as it came. A Recon conversation that can use none of its tools (locked, late, or under PTC) gets no Depth words at all.

While Web is on and `web_search` is offered, Depth also says how much to search, after the web note (`DEPTH_SEARCH_PROMPTS`): Quick is the former Web Quick (one search, answer from the results); Standard adds nothing (a few searches, open the pages that matter); **Thorough is the former Web Deep** (at least ten searches, at least ten pages read, every key fact in two independent sources, disagreements stated, each source cited with its date). The former Web Thorough (five pages) is gone, as the owner chose. Order in the instructions: the mode's own words, the Depth note, the web note, how much to search.

**Recon** (an isolated mode) gets the care note like every tab, and then how hard it searches with its own tools (`ISOLATED_DEPTH_PROMPTS`: Quick is its former Quick, Thorough its former Deep, named Thorough to the model too). Its Web button is On or Off like everywhere; Off still takes away the tools that go online (the care note stays, the search effort is replaced by the Off note). Its Depth list says what Depth does there (`depth.*.hint.isolated`, `depth.note.isolated`).

**Research and Scout** (the tabs whose mode lists `deep_research`) get the care note like every tab, but no web note and no searching note: they search by their own method. There Depth also sets the size of a research run, which Deep research reads from the conversation that starts it (`depthOf`): Quick about 10 minutes and up to 4 helpers, Standard about 25 and 6, Thorough about 45 and 8. The same holds for a deep research run asked for in any other tab. Their Depth list gives those sizes (`depth.*.hint.research`, `depth.note.research`), and says a run stops sooner where tools run through programs (the app's PTC preset). Research's own Depth (Modes' `researchDepth`, one setting for all research, set in Settings → Research and in its chat box) is gone; its value was not carried over, as the owner agreed: research conversations follow the shared Depth. The service's `researchDepth()` now returns the shared start, for older callers.

Where Depth is not: helpers, while the Tools switch is off, and while a Mission run is on (`ctx.get('goals')`: its goal is `active` and its objective starts with Mission's `Mission run <id>:`; the conversation only conducts the run, and Mission refuses every other tool, also when the goal is disarmed after a restart or an error). A user's own /goal keeps its Depth (its rounds do the work), running or only stored. Under a model version that stands alone the notes stay, like the Web notes. The service tells other add-ons both: `depthOf(sessionId)` (the Depth as picked; a helper follows its conversation) and `depthSpoken(agent)` (the Depth whose note the instructions carry, `standard` where none is). Model Tiers keeps only its thinking words where `depthSpoken` is Quick or Thorough, so the checks it leaves out are always asked for by the Depth note.

**Moving from earlier versions.** Once, at the first start (`depthMoved`), each conversation's former Web level (`sessionSearchDepth`) becomes its Depth: Deep becomes Thorough, a Depth already picked stays, and the old levels are cleared. A start of Deep becomes Thorough; until the move is written, a stored Deep already counts as Thorough. If the write fails, it is tried again with the next conversation that opens; it also runs 2 seconds after loading when no conversation opens. The start-up clean-up of gone conversations waits for this move (and for the clearing of old Search-off marks) and writes only the fields that hold a gone conversation, so it can never put the old levels back.

Depth is cleaned up with the other per-conversation choices, carried into Rerun copies, and never shared between Macs. The Chinese button reads 细致度 (快速 / 标准 / 深入).

Also in 0.59.0: the chat box's lists (Web, Depth, Helpers, Tools) are placed before they are drawn, so they no longer show for a moment in the bottom-left corner while the page is busy. And the chat box row shortens its names also when a button on its line is squeezed: with the Depth button now in Scout and Research too, the app's access-level button on a start page ran under the next label (found in the lab at 1060 and 1280 px).

**Tested:** the prompt words and their order, the same in every tab (Research, Scout and Recon included); Web On and Off; Recon's care note then search effort; Research's care note without a searching note; the Depth list's texts per kind of tab (`depthKind`); Deep research sizing a run by the starting conversation's Depth; Research's selection note per conversation; a Mission run gets none of it (also with its goal disarmed), a user's /goal keeps it; the one-time move (later picks are not overwritten; the start-up clean-up never undoes it; a failed write is tried again; it runs with no conversation open); the chat box's pick (Web writes only On or Off; a Depth pick is kept and becomes the start; a stored Deep shows as Thorough, in the chat box and on Settings → Modes; the Web button's state; Recon's own list texts); Model Tiers' thinking-only wording, also through its real prompt section with Modes' answer. **Lab** (fake model): the one-time move turned a stored Deep into Thorough (one conversation and the start); the Web list shows only Off and On; the Depth list in Finance, Chat and Recon (Recon with its own hints); Thorough's care note reached the model in Cowork and Chat, before the web note; Recon at Thorough was told "Search effort is Thorough: at least ten searches…" (that lab ran before Recon got the care note too); Settings → Modes shows "Depth for new conversations" and Settings search finds it; Effort Extra high with Depth Thorough sent only "Reason exhaustively: consider edge cases and failure paths.", and at Standard the older wording came back. The searching part could not be seen in the lab: the app offers `web_search` only when the conversation's model has a ready search provider, which the fake model has not; the tests cover it. Not yet: a long-run Depth (later). A starting Depth per tab is dropped: the owner chose one Depth for every tab.

## Since 0.59.0: Thorough's check before finishing (step 17)

At **Thorough**, just before a turn would end, the conversation gets one check and answers once more. The words are the owner's, with his rule that a check never starts the work over:

"Before you finish, check your answer against the request and your working method. Fix only what is missing, without starting the work over or starting a new research run, then finish. If nothing is missing, say so in one line." (`DEPTH_CHECK_PROMPT`)

- **How it works.** The app asks every add-on before a turn closes (`agent/turn-stopping`); Modes steers the check into the turn (`agent.steer`), the model takes one more step, and the next ask closes the turn. Once per turn, so it can never loop. The chat shows it as a one-line row, "Context injection · depth-check · Thorough: one check before finishing", not as a message from the user (source kind `depth-check`, form `notice`).
- **Where.** Every tab, as Depth is the same everywhere: Chat, Cowork, Code, Finance, Data, Recon and Research (the research-level modes), Scout and your own modes. Only in a turn with a message from the user (typed, a skill they started, an answer to a question): not in an automatic goal round, a turn opened by a helper's or a job's notice, or an Automation task's turn. Not for helpers, not while a Mission run is on, not with the Tools switch off, not in a Recon conversation that can use none of its tools, not after a turn that was stopped or a reply cut off at the output limit, not on an engine (Engines would run its whole task again), not while Settings → General → "Replies after collapse" is "Final answer only" (the check's one line would show as the answer; the owner chose to skip it there), and not when the turn ends waiting on the user (a question with no answer yet, a plan review dismissed). A question answered or a plan approved during the turn does not stop the check for the work after it. Without the chat setting or any other add-on, it simply runs as described: nothing it reads is required.
- **No starting over.** During the check step, the tools that start a whole new run are refused with a reply saying so (`DEPTH_CHECK_REFUSAL`): `deep_research`, `run_swarm`, `run_pipeline`, `review_lanes`, `delegate_role`, `workflow`; also for a helper started during the check. Small fixes and single searches still run. The block lifts when the turn closes, the conversation goes idle, or the user sends something during the check step (that is theirs, and is not refused).
- **Cost.** One more model reply per Thorough turn: in the lab a short turn used about twice the tokens. With nothing missing the extra reply is one line. The check is a real model step: if another add-on refuses it (Budget guard at its limit, Route health), the turn ends as blocked under the complete answer; if its request fails, the turn ends with that error after the answer.
- Other add-ons that read the user's own messages (Rerun, Recon, Engines) skip it, and so does Modes' "the message names tools" reading. Global Search never shows the check's words as a match (`isCheck` in dsh-search).
- **Tested:** once per turn with the exact words and source (also with more asks in the turn); the block during the check, for helpers started then, its lifting (turn end, idle, the user's own message); every tab; turns without the user (goal, helper, job, Automation); the cases with no check (Quick, Standard, tools off, helper, Mission, locked Recon, cut off, engine, final answer only); questions and plans pending, answered, approved, dismissed, asked during the check, left open at a stop; a failing steer. Review of step 17: 24 findings confirmed (many the same), all fixed; each rule's test fails when the rule is undone. **Lab:** the row and the second reply (a lab-only spike before the build, then the build itself).

## Since 0.59.1: "Web · Always on" in Research and Scout (step 21)

Research and Scout always have the web (searching is their work), so they had no Web button. The owner chose to show one there too, so every tab has the same row: a fixed label **Web · Always on** (Chinese 始终开启) with no list and nothing to change (`WebAlways`, `aria-disabled`). Its hint says why: "Always on in this tab: searching is its work. Only the Tools switch takes the web away. How much it searches is set by Depth." While the Tools switch is off it reads **Off**, with the Tools-off hint. Nothing is stored or sent: the instructions are unchanged (no web note, no searching note there; research-1, scout-9). Tested: the label replaces the hidden button in research tabs, has no list, reads Off with tools off, both languages; the prompt is unchanged. Lab: a Research conversation showed "Web access: Always on. Fixed in this tab.", and "Off" once Tools were switched off.

## Lens texts (step 24, not used yet)

`lib/lens.js` holds the seven Lenses of the owner's plan (Default, Blunt, Scientific, Journalistic, Data only, Skeptic, Encouraging): how an answer is worded. Nothing sends them yet; step 26 puts the picked one in a conversation's instructions, step 28 adds the chat-box row. Default adds nothing. Each text is the plan's wording (Encouraging as an instruction: "Lead with what works and the next step"), plus only the lines the owner's answers call for: every Lens ends with "This Lens decides how the answer is worded, over general style preferences. The tab's own rules, labels and order of sections come first; the Lens changes tone and emphasis inside them. A required warning is not softening." (`LENS_GUARD`); Blunt uses a tab's own claim labels where it has them; the fact-heavy Lenses (Blunt, Scientific, Journalistic, Data only) never switch the web on and say "Anything you could not check is an inference or a guess, not a fact. A figure from memory is never a fact." (`LENS_UNCHECKED`). The owner approved the six texts word for word (15 November 2026); a test pins them. Tests: the names and order, Default empty, the plan's words first and the guard last, at most 900 characters each, none of Self-improve's AI-sounding phrases, and nothing sending them yet.

## The Lens in a conversation's instructions (step 26, no button yet)

Each conversation can have a Lens (`sessionLens`, JSON `{ sessionId: lensId }`; missing or unknown is Default). Its approved text goes into its **own section**, `modes:lens`, order 73: after the tiers (70) and Self-improve's lessons (72), so it wins on wording over standing texts, as the owner chose; the tab's rules still come first (the text says so). Default adds nothing, so a conversation without a Lens gets exactly today's instructions. It applies in every tab, Recon included, with the Tools switch off, and under a model version set to "Use only these" (owner's answer: it is a choice made for this conversation, like Web and Depth). Helpers get nothing (searchers and workers stay neutral), though `lens(id)` follows the conversation. **During a /learn study session the Lens pauses** (owner's answer), through Learn's new `learning.studying(sessionId)`; without Learn it simply stays. Kept per conversation like Depth: cleaned up with gone conversations, carried into Rerun copies, never shared between Macs (Shared settings' ALWAYS_SKIP, now ten fields), in the settings search. The button comes in step 28. Tested in the stand-in app (every case above); lab: a Blunt conversation's request held the Lens text once, after the tier's words.

## The Lens in the chat box (step 28)

The owner chose to pick the Lens inside the Depth list, as his plan says: under Depth's three stops comes "Lens: how the answer is worded", seven small chips (Default first, then Blunt, Scientific, Journalistic, Data only, Skeptic, Encouraging; Chinese 默认, 直言, 科学, 新闻, 只给数据, 质疑, 鼓励), each one's use as its tooltip and the picked one's use below them, then "For this conversation only. A Lens changes how the answer is worded, never which facts are gathered; the tab's own rules come first." The button reads "Depth · Thorough · Blunt" (with Default as before); its names drop first when the row is narrow (fit step 1). A pick is for this conversation only (`sessionLens`; Default stores nothing) and never changes Web or Depth. Every new conversation starts on Default, in every tab (the owner dropped a starting Lens per tab). With a fact Lens (Blunt, Scientific, Journalistic, Data only) and Web Off, the list says "Web is Off here: this Lens labels anything it could not check as an inference or a guess. Switch Web on to check facts." (never in Research or Scout, which always have the web). The list may now use all the room above the button, so Depth and the Lens show without scrolling. Tested: the client's Lens list is Modes' own, `lensNow`, `settingOps('lens')`, the label, the hint, the texts in both languages. Lab: at 1280×820 the whole list showed without scrolling; picking Skeptic then Default changed the button; no overlap and one line in Finance, Research, Recon and Cowork at 1280 and 1600 wide.

## Your own Lenses (step 30)

Settings → Modes has "Your own Lenses": add, edit and remove Lenses of your own, then Save your Lenses. At most 40, names up to 40 characters, texts up to 4,000, and a shipped Lens's name is refused (as are an empty name or text, and two with the same name); the page says which Lens is wrong and saves nothing until all are right. Each is told to the model as "Lens: <name>. <your text>" plus the same closing lines as every Lens (`LENS_GUARD`: the tab's own rules, labels and order come first; a required warning is not softening). They show in the chat box's Depth list after the six shipped ones. A conversation whose Lens you remove goes back to Default. Kept in Modes' settings (`ownLenses`), so Shared settings carries them to your other Mac (the picks per conversation stay on each Mac). The page uses the same rules as Modes (`ownLensProblem`, `ownLensesOf`; a test compares the two). Tested: the limits and refusals, the guard, the fallback after removal, the page and Modes agreeing, the instructions and Deep research's writer. Lab: a shipped name was refused ("Lens 1 has the name of a Lens that comes with Plus."), "Calm" saved, showed in the Depth list after the six, and picking it made the button "Depth: Standard, Lens: Calm".


## Web levels (Content and Bench plan, step S1; 16 November)

The owner's choice: **add the levels, keep the defaults.** The Web button keeps **Off** and **On**; On is exactly as before (no limit beyond the tab's own) and stays where every conversation starts. Beside them a conversation can pick a level (`sessionWebLevel`, per conversation, carried into Rerun copies, pruned with the others):

| Level | A tool may open |
| --- | --- |
| Verified | Only sites on the verified list (`verifiedSources`: one host or `.ending` per line; it starts with kinds of source: official domains, international bodies, research publishers and indexes, wire services and public broadcasters, courts and registers, archives). Its own list; Settings → Modes → Web levels |
| Open web | Verified and ordinary sites; not forums and boards, public groups and channels, or the Reddit archives |
| Everything | Every kind, as On, named as a level |
| Custom | The lanes of one of the owner's own mixes (`webMixes`), made on Settings → Modes |

- Enforced by a `tools.guard` in the conversation and its helpers (`lib/weblevel.js`): every argument value, at any depth and under any name, that is a whole web address is judged; so is every address written in a shell command or a program (`run_code`), and a command or program that goes online with no address to check is refused below Everything. Searching lists results as usual; a result of another kind is named as a lead. A copy is judged by the page it shows: the Internet Archive (`/web/…`, `/save/…`, any `*.archive.org`, a port or trailing dot, an encoded address), archive.today, reader proxies (r.jina.ai, 12ft.io) and Google's translation proxy; a copy whose page cannot be read out, and an address by number, open only at Everything. Reddit's own hosts and the Reddit and X front-ends count as forums and channels. A level kept while the button is on Off does not apply (not even in a Long run with the web on). A check that fails refuses the call. The conversation is told its level in one line. Reviewed once; each fix has a test that fails without it.
- Not in Recon (isolated: its own rules and its own Web button) or Research (its web is fixed): there the levels are not offered and nothing changes.
- Service: `webLevel(id)` ('off', a level, or undefined for On as before), `webAllows(id, address)` for tools that fetch inside themselves, and `ultraCode(id)` (asked of Model Tiers' new switch).
- Tests: `test/weblevel.test.mjs` (lanes, the archive, each level, the owner's list and mixes, a stand-in app with a helper, Recon and Research); `test/modes.test.mjs` (the button and what a pick writes).

## One Web selector in every tab (18 November 2026)

The owner's request: one Web selector that looks and works the same in every tab, Research, Scout and Recon included, with every level of web access in it, as sources you can combine.

**The chip** reads `Web · Off`, `Web · All`, one or two short names (`Web · Verified + Forums`), `Web · 4 sources`, or a saved selection's name. It keeps the shared row's markup (`span.pair[data-kind="search"]`, `.lbl`, `.lbl.lvl`); the uniform row caps the value at 6.5em and the full text is in the button's title. `WebSources` in `client.js` replaces the former `WebButton` and Research's fixed `WebAlways` label.

**The popup:** Off and All; the source ticks, any mix; in Recon only, a second group "Recon's networks" (Tor, Usenet, and I2P greyed as not set up yet); the saved selections, one click each; "Save as…"; "Use for new <tab> conversations" (writes `modeStart[mode].sources`, lib/start.js); "Edit sources…" (Settings → Web sources). In Research and Scout, Off is greyed: searching is their work, and the Tools switch is what stops it.

| Tick | What counts |
| --- | --- |
| Verified sources | sites on the verified list (`verifiedSources`) |
| Academic papers | sites on the academic list (`academicSources`, new; journals, preprints, PubMed, universities) |
| News | sites on the news list (`newsSources`, new; wire services, broadcasters, newspapers) |
| Ordinary sites | anything on no list and of no other kind |
| Forums and boards | Reddit, Stack Exchange, Hacker News, forum.* and the like |
| Social media and channels | X, YouTube, Telegram, Mastodon, Facebook, Bluesky and the like (the former "groups and channels") |
| Archives | the Reddit archives of removed posts |
| Other | the owner's own sources (below) |

One site can be two kinds (a wire service is verified and news); a page passes when any of its kinds is ticked. A copy (the Internet Archive, archive.today, readers) is judged by the page it shows, as before. A page that cannot be told apart opens only when every kind of page is ticked.

**How a selection changes the search** (`lib/sources.js`, wired in `index.js`):
1. The model is told the ticks and how to word its searches for them (`sourcesSaid`; Research's former News and Academic words live here now).
2. `web_search` results of unticked kinds are taken out before the model sees them (a `tools/post-execute` listener; the search service's own summary goes too when anything was taken out), with one line saying how many. The result card you see keeps them all.
3. Opening a page of an unticked kind is refused (`tools.guard`, the conversation and its helpers), and so is a command or program that goes online with no address to check unless every kind of page is ticked.
4. Deep research's planner and searchers get the same note (`modes.webSourcesSaid`).

**Stored:** `sessionWebSources` (`{ id: [ticks] }`, missing = All; carried into Rerun copies with the other marks and pruned with them). All is the web as before: no limit and no words, so nothing changes until a box is unticked. A conversation that picked one of the older levels outside Recon and the research tabs reads it as ticks (Verified: verified; Open web: verified, academic, news, ordinary sites; Everything: every kind of page; a Custom mix: its lanes) and is never written over. The saved selections are the former Custom mixes (`webMixes`, now holding ticks; an older mix's "channels" is read as social media). Settings → Modes → Web levels moved to its own page.

**Settings → Web sources** (`settings.section` id `web-sources`): the three lists, the saved selections, each tab's starting ticks (with "Back to All"), and **Other sources**.

**Other sources** (`lib/other.js`): the owner's own sources others may not have, shared by every tab. Each has a name, a search address with `{query}` and/or a start address, a kind of login (none, user name and password, a key in a header, a browser cookie, or a secret address), where its secrets are kept, and "May be used in Recon" (off at first). The settings (`otherSources`) hold no secret. The secrets go into the app's secret store (`ctx.get('credentials')`, names `DSH_OTHER_SOURCE_<ID>_SECRET` / `_USER`, as Finance's keys) by default, or into the macOS Keychain (service `dsh-other-source-<id>`, written through `security -i` so the value never shows on a command line), the owner's choice per source. They are typed once on the page (route `POST /dsh-modes/other`: `secret`, `forget`, `test`; `GET` says only which are kept) and never shown again. Changing a source's login or store, or removing it, forgets what was kept for it in both places. Sites that sign in through their own web form are not supported; a copied cookie is the way round.
- Tools `other_search` (source name, words) and `other_read` (source name, a link on that source, a part), registered while at least one source exists, offered outside Recon while Other is ticked (All ticks it), and with the web like `web_search` (a list mode gets them while its web is on; Web Off takes them away). They read text only, on the source's own site (a redirect elsewhere is not followed), no login over plain http except on this Mac or a private network. The model gives a name, never an address or a login; every secret part (the password and user, the key, each cookie value, the secret address, its site and long path or query parts) is replaced by `[name]` in the page, its links (shown as paths), errors and test results.
- A guard refuses, in every tab, a call that reads the app's secret store file (`.credentials.yaml`), these sources' Keychain items through `security`, or the Keychain dump. Writing or editing a file that mentions them is not refused. A barrier, not a wall.
- Service, for Recon: `reconOtherNames()`, `reconOtherRequest(name)` (only sources allowed in Recon), `reconOtherStatus()` (each such source's name, kind of login and whether its login is kept, looked up on this Mac only; for Recon's status bar).

**Recon** keeps all its rules; the ticks only take tools away. Its tools ask `modes.webSources(id)` (networks included) and `modes.webKinds(address)`; see Recon's README. Modes gives a Recon conversation one line naming its ticks.

**Service:** `webSources(id)`, `webKinds(address)`, `webSourcesSaid(id)`, `carryWebSources(id, ticks)` (Research's carry-over; never over a conversation's own ticks), `webAllows(id, address)` (now by the ticks); `webLevel(id)` is kept for older callers.

**Client tidy-up (18 November, later):** the former Web button's code and Settings → Modes → Web levels (`WebLevels`, `webLevelOf`, `mixesOf`, the `web` pick and their texts) are removed from `client.js`; older picks are still read as ticks (`wsNow`, and the host's `sourcesNow`).

**Tests:** `test/sources.test.mjs` (kinds, combined ticks, older levels and mixes, labels, the results filter, the note, start values, the masks, Other sources' parsing, both secret stores, scrubbing, reading, and two stand-in apps), `test/weblevel.test.mjs` and `test/modes.test.mjs` (the chip and what a pick writes, kept in step with `lib/sources.js`).

## Skills switched off per tab (17 November, with Tuner Plus)

A tab can leave out skills it never uses. Tuner Plus proposes them; you switch them off with its button, and back on there or under Settings → Modes → Skills switched off per tab. The setting is `skillsOff` (`{ tabId: [names] }`, empty at first).
- In that tab, the model's skill list leaves them out. An open conversation gets one shorter list at its next step, and the app's repeat of the whole list is dropped.
- A call for one is refused by a guard. Your typed `/name` still works.
- Isolated tabs (Recon) are unchanged and cannot have such a list.
- With nothing switched off, every step is exactly as before.
