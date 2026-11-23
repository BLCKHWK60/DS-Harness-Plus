# Modes

Host and client add-on `@local/dsh-modes` (dsh 0.2.2-rc.1): Chat, Cowork and Code modes you can switch **per thread, at any time**. A dsh agent preset is fixed when a thread is created, so a mode is applied to the live Agent instead: it never needs a new thread.

A mode sets:

| Field | Values | Effect |
|---|---|---|
| `label` | text | name in the selector |
| `tools` | `"all"`, `"none"`, or a list of tool names | the tools the model sees (a restriction on that Agent; unknown names are ignored) |
| `sandbox` | `inherit`, `read-only`, `workspace-write` | the thread's access level (file sandbox mode), set when a thread starts in the mode or switches into it (also a move made in the left panel while the thread was closed, once it is opened), never on a plain reload. `inherit` restores what the thread had before a mode changed it, also after a restart. `danger-full-access` cannot be set by a mode |
| `defaultTier` | a Tier id or empty | a new thread that starts in this mode, and a switch to it (also a move made while the thread was closed), moves to that tier (needs the Tier add-on) |
| `prompt` | text | a prompt section `modes:mode` (order 58) while the mode is active |
| `keepPrompt` | `true` or absent | the prompt is kept even under a model version that stands alone (Scout sets it; isolated modes always keep theirs) |
| `startFamilies` | a list of family ids (or tool names) | where tools load as needed, these are there from the first step (Data: `data`, `pdf`) |

Built in (until you supply your own `modes`): **chat** (no tools, read-only, a short "no tools" prompt), **cowork** (all tools, sandbox unchanged), **code** (all tools, `workspace-write`).

## Configuration

```yaml
- id: modes
  config:
    modes: '{"<id>": {"label": "...", "tools": "all", "sandbox": "inherit", "defaultTier": "", "prompt": ""}}'   # JSON; replaces the built-in three
    defaultMode: cowork       # mode of a thread that has not chosen one
    scheduledMode: cowork     # mode of a thread an automation opens (unknown id: the first mode with all tools); Settings → Modes
    extraModes: '{}'          # modes other add-ons add (same JSON shape as modes); they come after yours and never replace one
    pruneStaleSessions: true  # drop choices of threads that no longer exist (a thread in the Left panel add-on's trash keeps them)
    pinOnFirstTurn: true      # record the mode a thread starts in, so a later defaultMode change (e.g. a Left panel add-on tab) only affects new threads
    sessionWeb: '{}'          # per-thread Search switch (the chat-box button writes it)
    sessionResearch: '{}'     # per-thread Deep research switch (the chat-box button writes it)
    sessionTools: '{}'        # per-thread Tools switch: { sessionId: false } means no tools at all
    searchDepth: standard     # the Depth for new threads, and for those that never picked one: quick | standard | thorough (a stored deep counts as thorough); Settings → Modes
    codeMethod: true          # Code's built-in working method while its prompt is empty; Settings → Modes
    coworkMethod: true        # Cowork's built-in working method while its prompt is empty; Settings → Modes
    trimModes: [cowork, code, data]   # modes that load their tools as needed
    sessionSandboxBase: '{}'  # per thread: the mode its level was last set for, and the level from before a mode changed it (written by the add-on)
    dataTrimAdded: false      # done once (0.57.0): data added to a stored trimModes list
    researchDepth: standard   # obsolete since 0.59.0: a research run follows its thread's Depth
    researchModel: same       # Deep research's helpers: same (the thread's model) | roles (Model tiers role models)
    # With the Left panel add-on on: a thread that has not sent a message follows defaultMode (the tab), its first
    # message fixes that mode (replacing any earlier choice), /mode <id> before it does not switch (it names the tabs),
    # and the chat-box selector is hidden.
    commandName: mode
```

`sessionModes` (`{sessionId: modeId}`) is written by the selector and the command; do not edit it by hand.

## Using it

- **Composer selector**: a drop-down left of Tier's control; it re-reads every 3 seconds so a `/mode` switch shows up.
- **Command**: `/mode` lists modes, `/mode <id>` switches. With the Left panel add-on on, `/mode <id>` before a thread's first message does not switch: it answers that the selected tab decides the mode of a new thread and names the tabs. After the first message it switches as always.
- **Service `modes`**: `list()`, `get(sessionId)`, `set(sessionId, modeId)`.
- A switch made during a running turn waits until the Agent is idle, so tools and sandbox never change mid-turn.

## Settings page

Settings > **Modes** edits the mode list without touching YAML: one card per mode (id, label, tools All / None / Only these with a list of tool names, file sandbox, default tier, prompt with a 4,000-character counter), the default mode, add / remove, and "Restore built-in modes". It reads and writes the add-on's own `modes` and `defaultMode` fields through the settings channel (the same one Tier and the composer selector use), in one save, and retries once on a revision conflict. It refuses ids that are not lower-case letters, digits and dashes, duplicate ids, an empty tool list under "Only these", and a default that is not one of the modes. A mode another add-on adds (Finance, Research, Scout, Recon, Data) is not edited here, but it is offered as the default too, marked "(add-on)", because selecting its tab in the left panel makes it the default. Fields the editor does not know about are kept on save. The default-tier box suggests tier ids when the Tier add-on is loaded. Since 0.57.0 the page also has, saved at once: **New threads** (since 0.59.0 the Depth for new threads and those that never picked one, `searchDepth`, before that the Web level; the mode for scheduled tasks, `scheduledMode`), **Left panel** (Tabs in the left panel, 1 to 5, written to the Left panel add-on's `cowork-shell.maxTabs`; shown only while the left panel is on and the space buttons do not show (item 4A stage 3b: with spaces there are no mode tabs, so neither the count nor the "no tab" note is shown), and a mode card beyond that count says it has no tab and can only be reached with /mode) and **Built-in working methods** (`codeMethod`, `coworkMethod`). Needs a restart of the app once to load (client half).

Tested in a throwaway web profile: add a mode, validation messages, save (written to the profile patch as the same JSON string), the composer selector picked the new mode within 3 seconds, dark and light. Not tested in the desktop app.

## Limits

- The lists in the Tools panel show what the app registered for the thread. A tool the app only offers under a condition can be listed as callable and still be left out of a request. The web tools are the exception: `web_search` is offered only while a search backend is ready for the model in use, so the panel asks the app and lists a web tool that is not ready under "Cannot call", with a line saying so. Where tools load as needed, the tools the model can still add are listed apart, under "Loaded when needed", not as "Cannot call".

- A thread opened by an automation starts in `scheduledMode` (Settings → Modes → Mode for automations), not in the tab last looked at (which, in Chat, gave it no tools). The app creates it in the selected tab's mode first; Modes moves it when the app's scheduler resolves it (`schedule/resolve-agent`, before the task's message is sent, so a tier change is finished before the first step), or else at its first inbox message (`agent/inbox/spliced` with `source.kind: 'schedule'`). A task delivering to an existing thread keeps that thread's mode.
- Threads from before 0.57.0 have no stored earlier level. Leaving Chat (or another mode that sets a level) for a mode that does not set one gives them the level of their permission preset (the one the app recorded for the thread, else your default preset), but only while the level in force is still the one the previous mode set; without the app's permission presets nothing is written and the thread stays Read only until the access level is set in the chat box. A move made in the left panel while such a thread is closed is seen only once it has been opened in 0.57.0 or later.
- A thread whose mode comes from an add-on that is switched off opens in the default mode; that counts as a move, so it gets the default mode's level (and its own back when the add-on returns).
- Sub-agents (children) start in `defaultMode`, not in the parent's mode. A chat thread cannot spawn them anyway (no tools).
- The earlier access level is kept for good only for threads; a helper agent keeps it while it lives.
- A thread's tier from its starting mode can be put back only to a tier the app knows (`resolveTier`); a thread on a model that belongs to no tier keeps the start tier after a move before its first message.
- Changing tools invalidates the model's prompt cache from the first changed tool schema.
- The mode list is edited on the Settings page below; the composer selector itself stays a plain `<select>`.
- Renaming a mode id in the editor leaves threads that had the old id on the default mode (their stored choice no longer matches).


## Search, Deep research and Tools buttons

Three buttons in the chat box switch tools for **this thread only**. They apply at the next turn.

- **Search** turns the web tools (`web_search`, `web_fetch`) on or off.
  - Default: on in modes with all tools (Cowork, Code), off in a no-tools mode (Chat).
  - In Chat mode with Search on, the model gets only the web tools, and a note that it may use them.
- **Deep research** makes `deep_research` available, and tells the model to use it for questions that need looking things up. The helper agents it starts do the searching and get the web tools for that, whether or not Search is on.
- **The small arrow beside Search and beside Deep research** opens a slider with three steps: Quick, Standard, Thorough. Unlike the buttons, the step is **one setting for all threads** (`searchDepth`, `researchDepth`), and the button shows it when it is not Standard ("Search · Thorough").
  - **Search depth** changes what the model is told about searching. Quick: one search and a short answer. Standard: nothing is added, the model decides, as before. Thorough: several searches with different wording, at least five pages opened and read, facts cross-checked between sources, disagreements named, each source cited with its date. It is an instruction, not a guarantee: a model may still do less.
  - **Model for the helpers** (in the Deep research panel) chooses what Deep research's helpers run on: **Same as this thread** (default) or **Role models** from Settings → Model tiers (`researchModel`: `same` | `roles`).
  - **Deep research depth** sets how a research run works: Quick is 1 round with up to 4 helpers at once, Standard 2 rounds with up to 6, Thorough 3 rounds with up to 8. See the Deep research add-on.
- **The buttons shrink to keep the chat box's bottom row on one line** (since 0.31.1). They measure the row, which also holds the app's own buttons and the model's name, and give way in steps: first the step's name and some padding, then "Tools" becomes an icon, then "Deep research", then "Search". If the row cannot fit on one line whatever they do, it takes two lines and the names come back as far as the first line holds them.
- **Tools** shows at a glance whether the model has any tools ("Tools on" / "Tools off") and opens a small panel with:
  - one switch for all tools of the thread. Off means the model is offered no tool at all, so it cannot try to call one and there are no failed attempts to look at; Search and Deep research are greyed out, and the model is told to answer from what it knows. On puts back what the mode allows (in Chat, where the mode has no tools of its own, On switches Search on);
  - the list of tools the model can call and the list it cannot, read from the app for that thread.

### Helper agents follow their thread

A helper agent (a sub-agent, a deep-research searcher) has no mode of its own. It takes the mode, the Search switch, the Deep research switch and the Tools switch of the thread that started it, and it does not get the mode's wording ("answer in one reply, no tools").

Before 0.20 a helper was treated as a new thread and got the default mode. With the Left panel add-on on, that is the tab you are on: in the Chat space, helpers got no tools at all, so Deep research always ended with "found no usable sources". Fixed.

Tool names are passed to the app's restriction as they are. In this dsh version most tools come from the thread's agent preset and are not listed to plugins, so a name is not checked against a visible list. A name the app refuses is left out, with a warning in the log.

Checked in the throwaway web profile by reading the exact request the model received:

| Case | Tools the model got |
| --- | --- |
| Chat with Search off | no tools |
| Chat with Search on | `web_fetch` only (that lab has no `web_search` backend), plus the note |
| Chat with Deep research on | `deep_research`, plus the research note |
| A deep-research helper of that Chat thread | `web_fetch` (and `web_search` where a search backend is ready), no Chat wording (0.20; before: no tools) |
| Any thread with Tools off | no tools, plus the note that tools are off (0.20) |
| Cowork with Search off | all 32 other tools, `web_fetch` removed |

Earlier versions filtered a mode's tool list against the tools visible to plugins. That silently dropped preset tools, for example `read` and `grep` in a custom "Review" mode. Now fixed.

## Since 0.33.0: a method for Code (and since 0.57.0 for Cowork)

`CODE_METHOD` in `lib/prompt.js` is used as the Code mode's instructions while that mode's own `prompt` is empty and the setting `codeMethod` (default on) is on. `COWORK_METHOD` does the same for Cowork (setting `coworkMethod`, default on); its words were approved by the owner and are not to be changed. Both switches are on Settings → Modes. It is applied when the prompt section is built, not stored in the mode table, so the Modes page still shows an empty box (with a line saying what is used). A model version that "stands alone" leaves it out like any mode text.

## Since 0.34.0: Rerun, and hiding the thumbs

- **Rerun** is an entry (id `modes-rerun`, order 20) in the app's slot `conversation.chat.assistant-actions`, so it sits after the app's thumbs and before Branch. A click reads the thread's events with `remote.session.page` (newest window first, further back as needed), finds the answer by its message id, takes the text of that turn's own `user/message` events (`source.kind === 'user'`), and the `turn/end` before that turn. It then calls `sessions.fork({ sessionId, atSeq, increaseTitle: true })` at that `turn/end` (the same cut the Branch button uses); for a first turn there is nothing to fork, so it calls `sessions.create({ cwd })` with the thread's folder. The copy gets the source's mode (`sessionModes`) and the source's selected model (`modelSelection.next` from `remote.session.projections`, applied with `remote.session.selectModel`), then the question is sent with `remote.session.prompt` and the copy is opened.
- The app has no way to erase or replace an answer inside a thread; that is why a rerun is a copy.
- Attachments are not sent again: only text parts are. The button shows a line saying so when the question had other parts.
- **Settings:** `rerunButton` (default on) and `hideFeedback` (default off), as two switches at the top of Settings → Modes that save at once (the colours switch, `spaceColours`, sits right under them; see Recon and Devices colours). Hiding is a style rule on the app's two feedback buttons (they are the only buttons with `aria-pressed` in that slot); the app's plugin list is read-only, so the feedback part itself cannot be switched off.
- **Same chat box in every mode:** `uniformBox` (default on; Settings → Modes → Chat box) makes the Web, Depth, Models and Tools buttons read the same in every mode: the shrink step is chosen with the other controls of the seat hidden, the model's name in full and the access button held at one width (`[data-dsh-pin]`), so it depends on the window's width alone. When the real row is then full, the route badge moves to a second line (`[data-dsh-below]`, CSS order only). The place (Scratch or the project) is a chip above the box (Cowork Shell), and a mode's own buttons (Creator Plus, Devices rules, Export for Recon, Focus, the Finance pill) are in the gear's popup (Settings helper, `extrasInGear`), so the box itself holds the same buttons in every mode; those add-ons are not edited. A window too narrow even for that, or the switch Off, uses the former shrinking.
- **Starting values per mode:** `modeStart` (JSON, empty at first; `lib/start.js`; Settings → Modes → Starting values for new threads) sets what Web, Depth, Models (One model / Different models) and Tools (Off) read in a thread that begins in a mode. The host writes them once, when the thread starts (`seedStart`, from `agent/created`), into `sessionWeb`/`sessionWebLevel`/`sessionDepth`/`sessionHelpers`/`sessionTools` where the thread has no value yet, so the page, the prompt and the tool lists read them like a pick made by hand, which replaces them later. "Usual" (nothing) changes nothing. An isolated mode (Recon) honours only Web Off; no value widens a mode's tools or sandbox. The page also sets `data-dsh-uniform` on the document for the Left panel add-on's place chip.
- **Tested (0.34.0)** in the test setup with a stand-in model: a rerun of the seventh answer made a copy with the six earlier turns and the question once, without the old answer; after choosing another model the copy ran on that model; a rerun of a thread's only answer opened a new thread in the same folder and mode; the thumbs switch hid the thumbs. Not tested: a question with attachments, a very long thread (more than one window of events), the Mac app.

## Since 0.40.0: one model or different models for helpers

The owner runs large local models and cannot hold several in memory at once. Each tool that starts helper agents used to decide for itself which models they run on. Now there is one choice, per thread, and it shows in the chat box.

- **The chip** sits beside the Tools button: "One model" (helpers run on the thread's model; nothing else is loaded) or, in an amber outline, "N models" (helpers may run on other models; N is the thread's model plus each different model named for a role). On a narrow row only its icon shows; the colour still tells the two apart.
- **Its panel** has the two choices, says in words what each means for memory, and under "Different models" lists every model the thread may use and where it is set (Model tiers role, Mission, Mission for this project). "Use this for new threads too" changes the default.
- **Stored** as `sessionHelpers` (JSON, thread id to `same` or `roles`); a thread without an entry follows `researchModel`, which is now the default for all helper tools, not only Deep research. Its default stays `same`.
- **Service:** `modes.helperModels(sessionId)` returns `same` or `roles`; a helper asking gets its thread's answer. `GET /dsh-modes/tools` carries `helpers { policy, explicit, usual, own, sources, count, names }`.
- **Who follows it:** Mission (`/mission` runs), Deep research, Agent swarm (also over a member's own model), the Tier tools (`delegate_role`, `review_lanes`, `run_pipeline`: with "one model" they work even when no role model is set) and Code power's judge. The app's own `subagent` tool lets the model name a model for a helper: with "one model", such a call is refused with a plain reason, and a call without a model named runs on the thread's model.
- **Not covered:** the Self-improvement, Arena and Benchmark pages, which run the models you pick on those pages; the Model router add-on, which can move the thread itself to another model between requests; and a model server that keeps an earlier model loaded after you switch.
- The "Model for the helpers" section that used to be in the Deep research panel is gone: the chip is the one place for it.
- **Tested (0.40.0):** unit test in Mission (one model by default and with Modes saying so; the roles' models with "Different models"). In the test setup: the chip showed "One model", its panel the reason; switching to "Different models" turned it to "2 models" and listed them with their sources; a `/mission` run then started with "2 models" and its log shows both; switched back, the next run started with "one model for everything" and every step ran on the thread's model. Not tested: Agent swarm, the Tier tools and Code power under either choice (same code path, not run); the refusal of a `subagent` call that names another model; the Mac app.


## Since 0.40.1: Stop also stops the helpers

Pressing Stop in a thread ends its turn. The app leaves the helpers that thread started
at work. Modes now stops them too, and their own helpers, the moment you press Stop. A Mission run
in that thread is paused; `/mission resume` carries on and takes the stopped step again.

A stopped helper tells its parent that it was stopped, and the app would start a new turn for that
note. Since 0.40.2 such a note, within two minutes of your Stop, starts nothing; the thread
stays stopped until you write again.

Since 0.40.3 this also holds when the thread itself is idle and only its helpers are at work.

- **Tested (0.40.3):** unit tests; lab runs with a stand-in model, with Mission's helpers and with the app's own helper tool.
- **Not verified:** with real models.

## Since 0.41.0: isolated modes

A mode can be marked `isolated: true` (the Recon add-on does this). Its threads then get
exactly the tools the mode lists and nothing else: no web search, no Deep research, no programs,
no helpers. The app's own notes (instruction files, the skill list, and since 17 November a skill's text when the user types `/skill-name`) are not handed to them, and
Plus's other add-ons leave them alone. A thread that begins in an isolated mode is isolated
for good; one that began elsewhere can never become isolated. Other add-ons ask
`modes.isolated(sessionId)`. The rules are in `lib/isolation.js` and tested there.

With Tools Off an isolated thread keeps its mode's own instructions (its rules on untrusted
text hold), and so does a model version that stands alone. Under the app's PTC preset an isolated
thread is told that its mode works only in the Standard preset: its guard refuses `run_code`
on purpose, so it could not reach its tools there.

- **Tested (0.41.0):** lab runs with a stand-in model, reading what the model was sent.
- **Not verified:** with real models.

## Since 0.52.0: load tools as needed

Every request carries the description of every tool the model may call. In a mode with all tools that was 82 tools, about 18,700 tokens, before the user's message was read. Local models are slow to read that much.

With **Load tools as needed** (Settings → Modes, one switch per mode with all tools; on for Cowork and Code), a thread starts with:

- **The core tools:** `read`, `write`, `edit`, `glob`, `grep`, `bash` and its jobs, `todo_write`, `ask_user_question`, `skill`, `read_image`, `working_directory`, `exit_plan_mode` (the app offers it only while /plan is on), and the web tools when Search is on.
- **`tools_find`:** lists the other families and adds the ones asked for, by family (`pdf`, `data`, `finance`, `visual`, `schedule`, `helpers`, `goals`, `library`, `memory`, `mac`, `code`, `learn`, `mission`, `connectors`, `app`, `office`), by tool name, or by what is to be done ("read a PDF"). Names and descriptions are matched against every tool the app has, not only those already offered, so a single tool outside the families (`generate_image`, for example) can be added too. A family or tool that brings nothing here (its add-on is off, or Web is Off) is not added, and the reply says so. Added tools are there from the model's next step on.

The user's message adds families too, before the first step: "read this PDF" brings the PDF tools, "make a chart from this spreadsheet" the data tools. Loading one of the app's Office skills (by the model, or by the user with /office-pptx and the like) brings the `office` family, whose tools the skill says appear next step. Added families stay for the rest of the thread (setting `sessionToolSets`), and helpers get their thread's tools.

Modes with their own tool list (Chat, Research, Recon, Scout, or a Code mode set to a list) keep that list. Isolated modes are never trimmed. A mode another add-on adds with all tools (Finance, Data) gets its own switch on the page while its tab is on: off until you switch it on for Finance, on by default for Data since 0.57.0 (with its data and PDF tools from the first step).

**Measured in the lab:** "hello" in Cowork went from 82 tools (about 18,700 tokens) to 16 (about 3,000); the whole request to about 6,400 tokens. A family added with `tools_find` was in the very next step. Switched off, the next message carried all 82 again.

**Costs:** the step after a family is added cannot reuse the model's cache of the thread. A model may now and then not think of `tools_find`; its note says to check there before telling the user a tool is missing.

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

The level is kept per thread (`sessionWeb`, `sessionSearchDepth`); picking a level also sets where new threads start (`searchDepth`). A thread that never had a level picked follows `searchDepth`, so changing it changes theirs too; the control on Settings → Modes says so ("Web level for new threads (and those that never picked one)"). Off applies only to the thread it is set in. The button is not shown in the Research mode (it researches with the web always; Depth and Focus are its own dropdowns in the chat box). Research-style tabs (those whose mode lists `deep_research`: Research, Scout) get no Web-level words and no web note in their instructions either, since they work by their own method and have no button to change the level with. Elsewhere the web note names only the web tools the step really offers, and a Web level is added only while `web_search` is offered. With Web Off in a mode that could go online, the model is told what went. `finance_profile_save` only writes a local line and stays with Web Off. In an isolated mode such as Recon (since 0.55.0) it sets how hard the mode searches with its own tools, in words that fit any search tool (`ISOLATED_LEVEL_PROMPTS`); Off there takes away the mode's tools that go online (Recon keeps only `recon_cite`) and says so (`ISOLATED_OFF_PROMPT`).

In-depth research with helpers lives in the Research mode. A thread is a research one when its mode lists `deep_research`; its helpers get the web tools. The old per-thread Deep research switch (`sessionResearch`) is no longer offered or read. In Cowork and Code `deep_research` stays available as a tool while the web is not Off.

**Since 0.55.1:** the Research mode always has the web, whatever a thread's stored Web setting says (it has no Web button). Old "Search off" marks from before 0.54.0 are cleared once (`webMarksCleared`) in threads of tabs with their own search tools (Scout, Recon, Research), where Off would now take those tools away; in Chat, Cowork, Code and Data they stay as Web · Off.

## Since 0.57.0: access level, start tier, /mode under the left panel, Web Off for programs and images

- **The access level is remembered across restarts.** A mode writes its sandbox (`sandbox/mode`) only when a thread starts in it or switches into it, never when a thread that already ran is reloaded (app restart or the add-on loading), so a level picked by hand survives a restart. Chat sets Read only only for threads that start in Chat or are moved into it. Per thread, `sessionSandboxBase` stores `{ mode, base, set }`: the mode its level was last applied for, the level from before a mode changed it, and the level that mode set. Leaving that mode puts `base` back also after a restart, unless the level was changed by hand since (then the hand-picked level stays). Between two modes that both set a level, `base` stays, unless the level was picked by hand in between: then that level is the one to go back to. A thread moved to another mode while it was closed (the Left panel add-on's Move writes only its mode) is seen when it is opened, because `mode` differs: its new mode's level and tier apply as on a switch (so a thread moved into Chat, Data or Research while closed is Read only once opened). A thread opened with nothing stored gets only its `mode` noted, and only if nothing was stored for it meanwhile (a Rerun copy's carried entry wins). The earlier level is dropped once restored (the entry keeps only `mode`); the entry is pruned with the other per-thread fields, carried into a Rerun copy that has earlier turns, and never shared between Macs (Shared settings' `ALWAYS_SKIP`). Threads from before 0.57.0: see Limits. Pure rule: `lib/sandbox.js`.
- **A mode's tier applies to a new thread from its first message**, not only on a switch: when the app creates the thread (`agent/created` with `source: 'startup'`), never on a plain reload, never for a helper (a move made while the thread was closed counts as a switch, see above). Before the first message, a move to a mode without a tier (another tab in the left panel, or the mode of an automation, which the app learns only after creating the thread) puts the earlier tier back, unless a tier was picked by hand meanwhile. For an automation this happens in the scheduler's `schedule/resolve-agent` hook, which the scheduler waits for (at most 10 seconds) before it sends the task's message: the model of a step is fixed before any step hook runs, so the task's first step would otherwise run on the tab's tier.
- **`/mode <id>` before the first message, with the Left panel add-on on**, does not switch; it says that the selected tab decides and names the tabs (the first `maxTabs` modes, then every add-on's mode; `lib/tabs.js`). After the first message, and without the left panel, it works as before.
- **Web Off also stops programs:** a guard on `run_code` refuses a program that fetches, opens a web socket, loads a network module (`http`, `https`, `net`, `tls`, `dgram`, `dns`, `undici` and the like) or starts curl, wget and similar (`programGoesOnline` in `lib/mask.js`). `terminal_send` is checked like the shell tools. Connectors stay on; the Off hint and the model's note say they can still reach the internet.
- **Web Off removes `generate_image` and `edit_image`** (or the names set in Media tools) unless Media tools' image service (`images.baseUrl`) is on this Mac or a private network: localhost, `*.local`, 127.0.0.0/8, ::1, 10/8, 172.16/12, 192.168/16, fc00::/7 (`privateAddress`, `imageToolsOffline` in `lib/mask.js`). The address is read from the app's loaded rows; unknown counts as outside.
- **Cowork's working method** (`COWORK_METHOD`, switch `coworkMethod`), see above.
- **`keepPrompt: true`** on a mode keeps its prompt under a model version that stands alone (Scout). **`startFamilies`** on a mode gives its threads those families from the first step where tools load as needed; the trimmed note names them. Data loads its tools as needed by default (`trimModes` default `['cowork', 'code', 'data']`), and once (`dataTrimAdded`) 'data' is added to a stored `trimModes` list that lacks it; switched off after that, it stays off.
- **Settings → Modes** gained the controls listed under "Settings page". `scheduledMode` is now a live setting (`.volatile()`).
- **Tested (0.57.0):** unit tests for the pure rules; `test/start.test.mjs` runs the add-on whole in a stand-in app (`test/app.mjs`) across a restart: a hand-picked level survives a reload; leaving Chat after a restart restores the earlier level and drops it; Chat does not write Read only over a hand pick; a move made while the thread was closed (with and without a restart: into Chat, Code, Cowork, and a Research-like add-on mode that is Read only), with its tier; a level picked by hand between two modes that set one; a Chat thread from before 0.57.0 promoted to Cowork (its own recorded preset's level, else the user's default preset; nothing without presets); pruning; the start tier (created, not reloaded, not a helper; put back on a tab change or for an automation, kept after a hand pick; an automation's tier change finished before its message, with a slow Model tiers); `/mode` with and without the left panel; the `run_code` guard; the image tools with an outside and a local service; `keepPrompt`; Cowork's method; Data's start families and the one-time `trimModes` change. **Not tested:** in the app itself (Settings page look, the left panel reading the new tab count, a real automation, the real sandbox).

## Changes in Plus 0.58.0

- **A thread in the trash keeps its choices.** The Left panel add-on's trash moves a deleted thread's files out of the app's store for 30 days, so the app no longer lists it. Until now the pruning at the next start then dropped its choices (tab, Web, Tools, helpers, added tools, access level) and, for a Recon thread, its isolation mark: put back after a restart, a Recon thread came back as an ordinary Cowork one. Pruning now reads the trash folder (`<home>/trash/conversations`, `lib/trashed.js`) and keeps every thread in it, moved or still waiting, with its helper threads; it drops them once the trash erases them. When the trash cannot be read, nothing is pruned. Threads already in the trash before this version may have lost their choices; those cannot be repaired. Tests: `test/start.test.mjs` (the trash reader; a trashed Recon thread keeps its isolation mark, tab, Web and Tools across a restart, an erased one does not).

## Since 0.59.0: Depth

The owner set the roles of the three buttons in the chat box, the same in every mode, and asked for **one Depth everywhere** ("the Depth Settings should not differ, so I don't have to remember which mode had which settings. All modes deserve the full set of options in Depth"):

- **Web** turns web access **On or Off**, nothing more (`sessionWeb`). Its former levels are gone from it.
- **Depth** (Quick, Standard, Thorough: the names Research already uses) says how much work the thread gets: how much it searches when Web is on, helpers, planning, checks and reviews, and how big a research run is. The same button in **every mode**: Chat, Cowork, Code, Finance, Data, Recon, Research, Scout and your own modes. It is kept per thread (`sessionDepth`), and every pick is also where new threads start in every mode (`searchDepth`, shown on Settings → Modes as "Depth for new threads"). A thread that never had a Depth picked follows that start. Its last stop, **Long run settings…**, opens Mission's Long run settings for the chat (the Run button next to Send starts a run with them; Send keeps the Depth) in every mode but Recon (also not in a Recon thread moved to another tab), while Mission is on. While a Long run is on (Mission's `longRun`), the thread and its helpers get `longRunMask`: the tab's own tools plus `mission_step`, and with Files and commands every tool; the web follows the run's Web switch (also for the shell's network guard and the `webOff` answer); a sealed mode's tools stay its own. Each tab's starting choice is **Settings → Modes → Long run tools** (`longTools`: `{ modeId: { files, web } }`; files on, the web on except in a sealed mode). The service also answers `readOnly(id)` and `longTools(id)`, and `refreshTools(id)` puts the mask on at once. Since 16 November 2026 the list is short: each stop has a few words ("Fast, light checks", "As usual", "Plan, 10+ searches, review"; in Research and Scout the run's size, "~25 min, 6 helpers"), the Lens is a row of chips, and every longer explanation (what each stop does, what Depth and a Lens are, the Web Off note) is a tooltip that shows after the pointer rests on it for 3 seconds (`TIP_MS`; screen readers get it at once as a description).
- **Effort** (Model tiers) is how hard the model thinks. While a Depth note is given (Quick or Thorough), its words say only that, and Depth asks for the planning and checks; at Standard, and wherever no Depth note is sent, the effort words are as before. See that add-on's README.

What the model is told. **Standard** adds nothing. **Quick** and **Thorough** add a note right after the working method, in words the owner approved so that they never contradict a method's own checks or the tier's helper rules:

- Quick: "How much care this thread wants: Quick. Keep the work short: one pass and only quick checks. Start helpers only when the tier asks for them. Everything in your working method still applies."
- Thorough: "How much care this thread wants: Thorough. Make a short plan before you act. Before you finish, check your work against the request and your working method's checks. If helpers are allowed, ask one helper to review the result once, and fix what it finds."

In a mode whose tools cannot start a helper (Chat, Research, Scout, Recon, a tool list without `subagent` or `subagent_fork`), Thorough ends after "…your working method's checks." (`DEPTH_PROMPTS_NO_HELPERS`, `helpersOffered`): there the last sentence could only be read as asking for a second research run, or for edits to a report Research's method says to present as it came. A Recon thread that can use none of its tools (locked, late, or under PTC) gets no Depth words at all.

While Web is on and `web_search` is offered, Depth also says how much to search, after the web note (`DEPTH_SEARCH_PROMPTS`): Quick is the former Web Quick (one search, answer from the results); Standard adds nothing (a few searches, open the pages that matter); **Thorough is the former Web Deep** (at least ten searches, at least ten pages read, every key fact in two independent sources, disagreements stated, each source cited with its date). The former Web Thorough (five pages) is gone, as the owner chose. Order in the instructions: the mode's own words, the Depth note, the web note, how much to search.

**Recon** (an isolated mode) gets the care note like every mode, and then how hard it searches with its own tools (`ISOLATED_DEPTH_PROMPTS`: Quick is its former Quick, Thorough its former Deep, named Thorough to the model too). Its Web button is On or Off like everywhere; Off still takes away the tools that go online (the care note stays, the search effort is replaced by the Off note). Its Depth list says what Depth does there (`depth.*.hint.isolated`, `depth.note.isolated`).

**Research and Scout** (the tabs whose mode lists `deep_research`) get the care note like every mode, but no web note and no searching note: they search by their own method. There Depth also sets the size of a research run, which Deep research reads from the thread that starts it (`depthOf`): Quick about 10 minutes and up to 4 helpers, Standard about 25 and 6, Thorough about 45 and 8. The same holds for a deep research run asked for in any other tab. Their Depth list gives those sizes (`depth.*.hint.research`, `depth.note.research`), and says a run stops sooner where tools run through programs (the app's PTC preset). Research's own Depth (Modes' `researchDepth`, one setting for all research, set in Settings → Research and in its chat box) is gone; its value was not carried over, as the owner agreed: research threads follow the shared Depth. The service's `researchDepth()` now returns the shared start, for older callers.

Where Depth is not: helpers, while the Tools switch is off, and while a Mission run is on (`ctx.get('goals')`: its goal is `active` and its objective starts with Mission's `Mission run <id>:`; the thread only conducts the run, and Mission refuses every other tool, also when the goal is disarmed after a restart or an error). A user's own /goal keeps its Depth (its rounds do the work), running or only stored. Under a model version that stands alone the notes stay, like the Web notes. The service tells other add-ons both: `depthOf(sessionId)` (the Depth as picked; a helper follows its thread) and `depthSpoken(agent)` (the Depth whose note the instructions carry, `standard` where none is). Model tiers keeps only its thinking words where `depthSpoken` is Quick or Thorough, so the checks it leaves out are always asked for by the Depth note.

**Moving from earlier versions.** Once, at the first start (`depthMoved`), each thread's former Web level (`sessionSearchDepth`) becomes its Depth: Deep becomes Thorough, a Depth already picked stays, and the old levels are cleared. A start of Deep becomes Thorough; until the move is written, a stored Deep already counts as Thorough. If the write fails, it is tried again with the next thread that opens; it also runs 2 seconds after loading when no thread opens. The start-up clean-up of gone threads waits for this move (and for the clearing of old Search-off marks) and writes only the fields that hold a gone thread, so it can never put the old levels back.

Depth is cleaned up with the other per-thread choices, carried into Rerun copies, and never shared between Macs.

Also in 0.59.0: the chat box's lists (Web, Depth, Helpers, Tools) are placed before they are drawn, so they no longer show for a moment in the bottom-left corner while the page is busy. And the chat box row shortens its names also when a button on its line is squeezed: with the Depth button now in Scout and Research too, the app's access-level button on a start page ran under the next label (found in the lab at 1060 and 1280 px).

**Tested:** the prompt words and their order, the same in every mode (Research, Scout and Recon included); Web On and Off; Recon's care note then search effort; Research's care note without a searching note; the Depth list's texts per kind of tab (`depthKind`); Deep research sizing a run by the starting thread's Depth; Research's selection note per thread; a Mission run gets none of it (also with its goal disarmed), a user's /goal keeps it; the one-time move (later picks are not overwritten; the start-up clean-up never undoes it; a failed write is tried again; it runs with no thread open); the chat box's pick (Web writes only On or Off; a Depth pick is kept and becomes the start; a stored Deep shows as Thorough, in the chat box and on Settings → Modes; the Web button's state; Recon's own list texts); Model tiers' thinking-only wording, also through its real prompt section with Modes' answer. **Lab** (fake model): the one-time move turned a stored Deep into Thorough (one thread and the start); the Web list shows only Off and On; the Depth list in Finance, Chat and Recon (Recon with its own hints); Thorough's care note reached the model in Cowork and Chat, before the web note; Recon at Thorough was told "Search effort is Thorough: at least ten searches…" (that lab ran before Recon got the care note too); Settings → Modes shows "Depth for new threads" and Settings search finds it; Effort Extra high with Depth Thorough sent only "Reason exhaustively: consider edge cases and failure paths.", and at Standard the older wording came back. The searching part could not be seen in the lab: the app offers `web_search` only when the thread's model has a ready search provider, which the fake model has not; the tests cover it. Not yet: a long-run Depth (later). A starting Depth per mode is dropped: the owner chose one Depth for every mode.

## Since 0.59.0: Thorough's check before finishing (step 17)

At **Thorough**, just before a turn would end, the thread gets one check and answers once more. The words are the owner's, with his rule that a check never starts the work over:

"Before you finish, check your answer against the request and your working method. Fix only what is missing, without starting the work over or starting a new research run, then finish. If nothing is missing, say so in one line." (`DEPTH_CHECK_PROMPT`)

- **How it works.** The app asks every add-on before a turn closes (`agent/turn-stopping`); Modes steers the check into the turn (`agent.steer`), the model takes one more step, and the next ask closes the turn. Once per turn, so it can never loop. The chat shows it as a one-line row, "Context injection · depth-check · Thorough: one check before finishing", not as a message from the user (source kind `depth-check`, form `notice`).
- **Where.** Every tab, as Depth is the same everywhere: Chat, Cowork, Code, Finance, Data, Recon and Research (the research-level modes), Scout and your own modes. Only in a turn with a message from the user (typed, a skill they started, an answer to a question): not in an automatic goal round, a turn opened by a helper's or a job's notice, or an automation's turn. Not for helpers, not while a Mission run is on, not with the Tools switch off, not in a Recon thread that can use none of its tools, not after a turn that was stopped or a reply cut off at the output limit, not on an engine (Engines would run its whole task again), not while Settings → General → "Replies after collapse" is "Final answer only" (the check's one line would show as the answer; the owner chose to skip it there), and not when the turn ends waiting on the user (a question with no answer yet, a plan review dismissed). A question answered or a plan approved during the turn does not stop the check for the work after it. Without the chat setting or any other add-on, it simply runs as described: nothing it reads is required.
- **No starting over.** During the check step, the tools that start a whole new run are refused with a reply saying so (`DEPTH_CHECK_REFUSAL`): `deep_research`, `run_swarm`, `run_pipeline`, `review_lanes`, `delegate_role`, `workflow`; also for a helper started during the check. Small fixes and single searches still run. The block lifts when the turn closes, the thread goes idle, or the user sends something during the check step (that is theirs, and is not refused).
- **Cost.** One more model reply per Thorough turn: in the lab a short turn used about twice the tokens. With nothing missing the extra reply is one line. The check is a real model step: if another add-on refuses it (Budget guard at its limit, Route health), the turn ends as blocked under the complete answer; if its request fails, the turn ends with that error after the answer.
- Other add-ons that read the user's own messages (Rerun, Recon, Engines) skip it, and so does Modes' "the message names tools" reading. Global search never shows the check's words as a match (`isCheck` in dsh-search).
- **Tested:** once per turn with the exact words and source (also with more asks in the turn); the block during the check, for helpers started then, its lifting (turn end, idle, the user's own message); every mode; turns without the user (goal, helper, job, Automation); the cases with no check (Quick, Standard, tools off, helper, Mission, locked Recon, cut off, engine, final answer only); questions and plans pending, answered, approved, dismissed, asked during the check, left open at a stop; a failing steer. Review of step 17: 24 findings confirmed (many the same), all fixed; each rule's test fails when the rule is undone. **Lab:** the row and the second reply (a lab-only spike before the build, then the build itself).

## Since 0.59.1: "Web · Always on" in Research and Scout (step 21)

Research and Scout always have the web (searching is their work), so they had no Web button. The owner chose to show one there too, so every mode has the same row: a fixed label **Web · Always on** with no list and nothing to change (`WebAlways`, `aria-disabled`). Its hint says why: "Always on in this mode: searching is its work. Only the Tools switch takes the web away. How much it searches is set by Depth." While the Tools switch is off it reads **Off**, with the Tools-off hint. Nothing is stored or sent: the instructions are unchanged (no web note, no searching note there; research-1, scout-9). Tested: the label replaces the hidden button in research modes, has no list, reads Off with tools off; the prompt is unchanged. Lab: a Research thread showed "Web access: Always on. Fixed in this mode.", and "Off" once Tools were switched off.

## Lens texts (step 24, not used yet)

`lib/lens.js` holds the seven Lenses of the owner's plan (Default, Blunt, Scientific, Journalistic, Data only, Skeptic, Encouraging): how an answer is worded. Nothing sends them yet; step 26 puts the picked one in a thread's instructions, step 28 adds the chat-box row. Default adds nothing. Each text is the plan's wording (Encouraging as an instruction: "Lead with what works and the next step"), plus only the lines the owner's answers call for: every Lens ends with "This Lens decides how the answer is worded, over general style preferences. The tab's own rules, labels and order of sections come first; the Lens changes tone and emphasis inside them. A required warning is not softening." (`LENS_GUARD`); Blunt uses a tab's own claim labels where it has them; the fact-heavy Lenses (Blunt, Scientific, Journalistic, Data only) never switch the web on and say "Anything you could not check is an inference or a guess, not a fact. A figure from memory is never a fact." (`LENS_UNCHECKED`). The owner approved the six texts word for word (15 November 2026); a test pins them. Tests: the names and order, Default empty, the plan's words first and the guard last, at most 900 characters each, none of Self-improve's AI-sounding phrases, and nothing sending them yet.

## The Lens in a thread's instructions (step 26, no button yet)

Each thread can have a Lens (`sessionLens`, JSON `{ sessionId: lensId }`; missing or unknown is Default). Its approved text goes into its **own section**, `modes:lens`, order 73: after the tiers (70) and Self-improve's lessons (72), so it wins on wording over standing texts, as the owner chose; the mode's rules still come first (the text says so). Default adds nothing, so a thread without a Lens gets exactly today's instructions. It applies in every mode, Recon included, with the Tools switch off, and under a model version set to "Use only these" (owner's answer: it is a choice made for this thread, like Web and Depth). Helpers get nothing (searchers and workers stay neutral), though `lens(id)` follows the thread. **During a /learn study thread the Lens pauses** (owner's answer), through Learn's new `learning.studying(sessionId)`; without Learn it simply stays. Kept per thread like Depth: cleaned up with gone threads, carried into Rerun copies, never shared between Macs (Shared settings' ALWAYS_SKIP, now ten fields), in the settings search. The button comes in step 28. Tested in the stand-in app (every case above); lab: a Blunt thread's request held the Lens text once, after the tier's words.

## The Lens in the chat box (step 28)

The owner chose to pick the Lens inside the Depth list, as his plan says: under Depth's three stops comes "Lens: how the answer is worded", seven small chips (Default first, then Blunt, Scientific, Journalistic, Data only, Skeptic, Encouraging), each one's use as its tooltip and the picked one's use below them, then "For this thread only. A Lens changes how the answer is worded, never which facts are gathered; the mode's own rules come first." The button reads "Depth · Thorough · Blunt" (with Default as before); its names drop first when the row is narrow (fit step 1). A pick is for this thread only (`sessionLens`; Default stores nothing) and never changes Web or Depth. Every new thread starts on Default, in every mode (the owner dropped a starting Lens per mode). With a fact Lens (Blunt, Scientific, Journalistic, Data only) and Web Off, the list says "Web is Off here: this Lens labels anything it could not check as an inference or a guess. Switch Web on to check facts." (never in Research or Scout, which always have the web). The list may now use all the room above the button, so Depth and the Lens show without scrolling. Tested: the client's Lens list is Modes' own, `lensNow`, `settingOps('lens')`, the label, the hint, the texts. Lab: at 1280×820 the whole list showed without scrolling; picking Skeptic then Default changed the button; no overlap and one line in Finance, Research, Recon and Cowork at 1280 and 1600 wide.

## Your own Lenses (step 30)

Settings → Modes has "Your own Lenses": add, edit and remove Lenses of your own, then Save your Lenses. At most 40, names up to 40 characters, texts up to 4,000, and a shipped Lens's name is refused (as are an empty name or text, and two with the same name); the page says which Lens is wrong and saves nothing until all are right. Each is told to the model as "Lens: <name>. <your text>" plus the same closing lines as every Lens (`LENS_GUARD`: the tab's own rules, labels and order come first; a required warning is not softening). They show in the chat box's Depth list after the six shipped ones. A thread whose Lens you remove goes back to Default. Kept in Modes' settings (`ownLenses`), so Shared settings carries them to your other Mac (the picks per thread stay on each Mac). The page uses the same rules as Modes (`ownLensProblem`, `ownLensesOf`; a test compares the two). Tested: the limits and refusals, the guard, the fallback after removal, the page and Modes agreeing, the instructions and Deep research's writer. Lab: a shipped name was refused ("Lens 1 has the name of a Lens that comes with Plus."), "Calm" saved, showed in the Depth list after the six, and picking it made the button "Depth: Standard, Lens: Calm".


## Web levels (Content and Bench plan, step S1; 16 November)

The owner's choice: **add the levels, keep the defaults.** The Web button keeps **Off** and **On**; On is exactly as before (no limit beyond the tab's own) and stays where every thread starts. Beside them a thread can pick a level (`sessionWebLevel`, per thread, carried into Rerun copies, pruned with the others):

| Level | A tool may open |
| --- | --- |
| Verified | Only sites on the verified list (`verifiedSources`: one host or `.ending` per line; it starts with kinds of source: official domains, international bodies, research publishers and indexes, wire services and public broadcasters, courts and registers, archives). Its own list; Settings → Modes → Web levels |
| Open web | Verified and ordinary sites; not forums and boards, public groups and channels, or the Reddit archives |
| Everything | Every kind, as On, named as a level |
| Custom | The lanes of one of the owner's own mixes (`webMixes`), made on Settings → Modes |

- Enforced by a `tools.guard` in the thread and its helpers (`lib/weblevel.js`): every argument value, at any depth and under any name, that is a whole web address is judged; so is every address written in a shell command or a program (`run_code`), and a command or program that goes online with no address to check is refused below Everything. Searching lists results as usual; a result of another kind is named as a lead. A copy is judged by the page it shows: the Internet Archive (`/web/…`, `/save/…`, any `*.archive.org`, a port or trailing dot, an encoded address), archive.today, reader proxies (r.jina.ai, 12ft.io) and Google's translation proxy; a copy whose page cannot be read out, and an address by number, open only at Everything. Reddit's own hosts and the Reddit and X front-ends count as forums and channels. A level kept while the button is on Off does not apply (not even in a Long run with the web on). A check that fails refuses the call. The thread is told its level in one line. Reviewed once; each fix has a test that fails without it.
- Not in Recon (isolated: its own rules and its own Web button) or Research (its web is fixed): there the levels are not offered and nothing changes.
- Service: `webLevel(id)` ('off', a level, or undefined for On as before), `webAllows(id, address)` for tools that fetch inside themselves, and `ultraCode(id)` (asked of Model tiers' new switch).
- Tests: `test/weblevel.test.mjs` (lanes, the archive, each level, the owner's list and mixes, a stand-in app with a helper, Recon and Research); `test/modes.test.mjs` (the button and what a pick writes).

## One Web selector in every mode (18 November 2026)

The owner's request: one Web selector that looks and works the same in every mode, Research, Scout and Recon included, with every level of web access in it, as sources you can combine.

**The chip** reads `Web · Off`, `Web · All`, one or two short names (`Web · Verified + Forums`), `Web · 4 sources`, or a saved selection's name. It keeps the shared row's markup (`span.pair[data-kind="search"]`, `.lbl`, `.lbl.lvl`); the uniform row caps the value at 6.5em and the full text is in the button's title. `WebSources` in `client.js` replaces the former `WebButton` and Research's fixed `WebAlways` label.

**The popup:** Off and All; the source ticks, any mix; in Recon only, a second group "Recon's networks" (Tor, Usenet, and I2P greyed as not set up yet); the saved selections, one click each; "Save as…"; "Use for new <tab> threads" (writes `modeStart[mode].sources`, lib/start.js); "Edit sources…" (Settings → Web sources). In Research and Scout, Off is greyed: searching is their work, and the Tools switch is what stops it.

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
3. Opening a page of an unticked kind is refused (`tools.guard`, the thread and its helpers), and so is a command or program that goes online with no address to check unless every kind of page is ticked.
4. Deep research's planner and searchers get the same note (`modes.webSourcesSaid`).

**Stored:** `sessionWebSources` (`{ id: [ticks] }`, missing = All; carried into Rerun copies with the other marks and pruned with them). All is the web as before: no limit and no words, so nothing changes until a box is unticked. A thread that picked one of the older levels outside Recon and the research modes reads it as ticks (Verified: verified; Open web: verified, academic, news, ordinary sites; Everything: every kind of page; a Custom mix: its lanes) and is never written over. The saved selections are the former Custom mixes (`webMixes`, now holding ticks; an older mix's "channels" is read as social media). Settings → Modes → Web levels moved to its own page.

**Settings → Web sources** (`settings.section` id `web-sources`): the three lists, the saved selections, each mode's starting ticks (with "Back to All"), and **Other sources**.

**Other sources** (`lib/other.js`): the owner's own sources others may not have, shared by every mode. Each has a name, a search address with `{query}` and/or a start address, a kind of login (none, user name and password, a key in a header, a browser cookie, or a secret address), where its secrets are kept, and "May be used in Recon" (off at first). The settings (`otherSources`) hold no secret. The secrets go into the app's secret store (`ctx.get('credentials')`, names `DSH_OTHER_SOURCE_<ID>_SECRET` / `_USER`, as Finance's keys) by default, or into the macOS Keychain (service `dsh-other-source-<id>`, written through `security -i` so the value never shows on a command line), the owner's choice per source. They are typed once on the page (route `POST /dsh-modes/other`: `secret`, `forget`, `test`; `GET` says only which are kept) and never shown again. Changing a source's login or store, or removing it, forgets what was kept for it in both places. Sites that sign in through their own web form are not supported; a copied cookie is the way round.
- Tools `other_search` (source name, words) and `other_read` (source name, a link on that source, a part), registered while at least one source exists, offered outside Recon while Other is ticked (All ticks it), and with the web like `web_search` (a list mode gets them while its web is on; Web Off takes them away). They read text only, on the source's own site (a redirect elsewhere is not followed), no login over plain http except on this Mac or a private network. The model gives a name, never an address or a login; every secret part (the password and user, the key, each cookie value, the secret address, its site and long path or query parts) is replaced by `[name]` in the page, its links (shown as paths), errors and test results.
- A guard refuses, in every mode, a call that reads the app's secret store file (`.credentials.yaml`), these sources' Keychain items through `security`, or the Keychain dump. Writing or editing a file that mentions them is not refused. A barrier, not a wall.
- Service, for Recon: `reconOtherNames()`, `reconOtherRequest(name)` (only sources allowed in Recon), `reconOtherStatus()` (each such source's name, kind of login and whether its login is kept, looked up on this Mac only; for Recon's status bar).

**Recon** keeps all its rules; the ticks only take tools away. Its tools ask `modes.webSources(id)` (networks included) and `modes.webKinds(address)`; see Recon's README. Modes gives a Recon thread one line naming its ticks.

**Service:** `webSources(id)`, `webKinds(address)`, `webSourcesSaid(id)`, `carryWebSources(id, ticks)` (Research's carry-over; never over a thread's own ticks), `webAllows(id, address)` (now by the ticks); `webLevel(id)` is kept for older callers.

**Client tidy-up (18 November, later):** the former Web button's code and Settings → Modes → Web levels (`WebLevels`, `webLevelOf`, `mixesOf`, the `web` pick and their texts) are removed from `client.js`; older picks are still read as ticks (`wsNow`, and the host's `sourcesNow`).

**Tests:** `test/sources.test.mjs` (kinds, combined ticks, older levels and mixes, labels, the results filter, the note, start values, the masks, Other sources' parsing, both secret stores, scrubbing, reading, and two stand-in apps), `test/weblevel.test.mjs` and `test/modes.test.mjs` (the chip and what a pick writes, kept in step with `lib/sources.js`).

## Skills switched off per mode (17 November, with Tuner Plus)

A mode can leave out skills it never uses. Tuner Plus proposes them; you switch them off with its button, and back on there or under Settings → Modes → Skills switched off per mode. The setting is `skillsOff` (`{ tabId: [names] }`, empty at first).
- In that mode, the model's skill list leaves them out. An open thread gets one shorter list at its next step, and the app's repeat of the whole list is dropped.
- A call for one is refused by a guard. Your typed `/name` still works.
- Sealed modes (Recon) are unchanged and cannot have such a list.
- With nothing switched off, every step is exactly as before.

## Tool access (19 November, Phase 5 core)

Each tool has a state in each mode: On, Ask, Off or Locked. The AI gets `tools_catalog` and `request_tool_access`; a request goes through a policy (`lib/access.js`), a card (the service `toolAccess`, `lib/toolaccess.js`) and a per-Mac store (`lib/grants.js`: `$DSH_HOME/tool-access/grants.json` and `tool-access.jsonl`). `lib/catalog.js` is the one list of tools with plain names, groups and risk tiers 0 to 4. `lib/wire.js` joins it to this add-on: `toolMask` in `index.js` now asks `access.withAccess` after the mode's own mask (`baseToolMask`); with nothing chosen and nothing granted the mask is the same object as before. Settings: `toolAccess` (JSON, per Mac), `toolAccessOn`. Full description and the card's contract: docs/MODES-AND-SETTINGS.md ("Tool access"). `lib/online.js` is the one list of tools that can go online and the one rule for what Recon may ask for (the policy and the guards that run a tool both use it). Tests of the second review: `test/access-round2.test.mjs`; "off is identical" compares with `test/off-baseline.json`, which `node test/make-off-baseline.mjs` rebuilds from the add-on as committed before Tool access. Tests: `test/access.test.mjs` (catalogue, states, fences with a grant present, policy wording, store) and `test/access-app.test.mjs` (the whole add-on on the stand-in app, including the page that tries to trick the AI into asking for bash). The review's fixes are tested in `test/access-fixes.test.mjs` (locked tabs, one-call "once", Recon's export limit against Recon's real door, Chat without programs, Recon opened, the grid, off-by-default compared with `test/off-baseline.json`, Stop, repeat limits, unattended runs, the web route handler `lib/route.js`, and the injection end to end).

## Depth's Mission (Mission stage B, 19 November 2026; changed in stage D)

Mission and Long run are one thing now, called **Mission**. Depth reads **Quick, Standard, Thorough, Mission**.
- **Mission**: since stage D (20 November, below) it only selects a Mission; Start Mission beside Send starts it. Stage B's row started one at once through the window event `dsh-mission:start`; Modes no longer fires that event.
- **Mission settings…** (was "Long run settings…"): opens Mission's settings form for this chat (`dsh-mission:long`, unchanged). Start Mission and a typed `/mission` use those settings.
- Both rows show only while Mission is on and the thread is not a locked Recon (`!lockedHere && missionHere`, as before).
- Settings → Modes → **Mission tools** (was "Long run tools"); the key `longTools` is unchanged.
- Chat box CSS: Mission's main button (`.dsh-ms-main`: Add note, Answer and continue, Resume) keeps one width with the same chat box in every mode (92 to 148 px), shows its short label (`data-short`: Note, Answer, Resume) in tiny rows, and while the row's step is chosen (`data-dsh-measure`) the whole Mission button group (`.dsh-ms-runbtn-wrap`) counts at 170 px, the widest label and its (i), so the row never overflows whichever Mission button shows, also in Split panes.
- Only words changed otherwise: no ids, settings keys or events were renamed.
- Stage B review (19 November): the words the model reads say Mission too: "A Mission is on in this thread" (the tools note and a sealed mode's note) and the step tool's answer after a Recon run, "The Mission in this thread has ended…" (`RUN_OVER_TEXT`), so the assistant does not say "Long run" in chat. Tested in `test/long.test.mjs`.
- Tests: `test/modes.test.mjs` (the words, the Mission row drawn with stand-ins: the event gets this chat box's Depth button, greyed while a Mission is on, "· Mission"; the state hook) and `test/narrow.test.mjs` (the new width, tiny and measure rules). Not checked in the running app: the row fit with the main button, and Depth → Mission in a Split pane.

## Depth → Mission only selects it (Mission stage D, 20 November 2026)

The owner's point 16, from using the installed build: choosing Mission in Depth asked to start or cancel a Mission from the Depth pop-up. Now Mission is one more choice, like Quick, Standard and Thorough.
- **Mission** is the fourth option of the Depth list (`role="option"`, inside the listbox; since the stage D review the listbox holds only its four options, and Mission's (i) sits in the row below, beside Mission settings…, where the keyboard reaches it). Choosing it writes only `sessionMission[sessionId] = true`, a new Modes setting (JSON per thread, volatile, pruned with the other per-thread fields and carried into Rerun copies like `sessionDepth`). Nothing starts and nothing asks; the thread's Depth (`sessionDepth`) and where new chats start (`searchDepth`) are not touched.
- **Send** keeps talking to the assistant normally, at the thread's own Depth (Standard unless you picked another; the server's `depthOf` is unchanged). The option's (i) and the Depth button's title name that Depth ("Send talks at Standard.").
- **Start Mission** beside Send is the only start, with its one confirmation (Mission's client). While Depth is on Mission it is drawn as the main button.
- Picking **Quick**, **Standard** or **Thorough** clears the choice. The option's small text says "Chosen · press Start Mission" while chosen.
- The Depth button reads "· Mission" while Mission is chosen or while a Mission is on. While one is on, the Mission option is selected and greyed with "A Mission is on in this thread." After the Mission ends, Depth stays on Mission while the choice is set (an owner question; pick another Depth to go back).
- Mission's client is told through `window.__dshDepthMission[sessionId]` (true or false) and the window event `dsh-modes:depth-mission` `{ sessionId, on, from?, picked? }`. `from` (the Depth button of this chat box) and `picked: true` come only right after a pick, so Start Mission in the same chat box (Split pane) shows its tip and focuses that chat box; the event without them only says the state (on load and when the thread changes). Modes never fires `dsh-mission:start` any more; Mission still listens to it and starts nothing from it.
- **Where no Mission can start** (Mission switched off, Recon keeping Missions out, no folder, Creator Plus, helpers off on the tier), the Mission option is greyed and says "Cannot start in this chat", with Mission's reason as its tooltip and in its (i). Mission says why per thread in `window.__dshMissionCannot[sessionId]` ('' when one can start) and the event `dsh-mission:cannot`; Modes reads it with `useMissionCannot`. A Mission already on still says "A Mission is on in this thread." first. (Stage D review: before, the option could be picked there and the tip said to press a greyed or hidden Start Mission.)
- Words: `depth.mission.short`, `depth.mission.hint` (with `{0}` = the Depth Send uses), `depth.mission.when`, `depth.mission.change`, `depth.mission.on`, `depth.long.hint`, `depth.long.short`, and the new `depth.mission.chosen`, `depth.mission.send` and `depth.mission.cannot`.
- `sessionMission` stays on each Mac (Shared settings' `ALWAYS_SKIP`, next to `sessionDepth`): shared, one Mac's prune would wipe the other's choices.
- Tests: `test/modes.test.mjs` ("Depth → Mission only selects it"): every key has its words; Mission is an option in the listbox, selected when chosen or on, greyed while on; a pick writes `sessionMission` through `settingOps` and never `sessionDepth` or `searchDepth`; Quick clears it; the label and title; no `dsh-mission:start` dispatch in client.js; `__dshDepthMission` and the event; CARRIED, the prune list and the setting. Not checked in the running app: the option in a Split pane and the tip on Start Mission.

### Tool access for a Mission's helpers (Mission stage D)

A Mission's helpers park their tool requests in the Mission's card instead of a card that waits (and timed out after 3 minutes while it held the helper). In `ask()`, a helper for which `mission.canPark(requester)` is true:
- is never refused as `unattended` (the Mission clause of `unattended` is gone: only Automations count; a Mission with `waitMinutes` 0 now means "wait until answered");
- when the policy says ask and offers "this thread" or wider, gets no card: `mission.parkApproval({sessionId, kind: 'tool', tool, plain, reason, wording, choices})` records it, and the answer is code `parked` (the Tool ledger's outcome `parked`), listed once per tool under "Waiting for you";
- when the policy offers only one call (a high-risk tool after outside material), gets code `once-only` and the Mission lists it as not possible (`cannot: true`); the ledger says refused;
- told no before in this Mission (`said: 'no'`) gets the no at once.

The choices in the Mission's card are **Allow for this item**, **Allow for this Mission** and **Deny** (the app's one-time permission belongs to the whole thread and lapses at each round of the Mission). Mission answers through the service: `grantParked({sessionId, tool})` decides again as a helper and stores a "this thread" permission (its id comes back for `revoke`), or refuses with the policy's plain reason; `denyParked({sessionId, tool})` starts the usual refusal time after a Deny. The add-on hands `canPark` and `parkApproval` to the service with `useParking` (index.js). A helper that is not a Mission's, and the thread itself, get the card as before.

Stage D review (20 November): a parked request is answered when the owner chooses, so the counters against pestering no longer apply to it. A Mission helper's request is never refused as "too many waiting" or "too many noes" (Mission keeps its own limit: 40 approvals waiting at once). `grantParked` and `denyParked` clear the request's line under "Waiting for you" (it is not waiting any more), and `denyParked` no longer counts as a "no" against the thread's other requests; the denied tool keeps its refusal time. The `wording` passed to `parkApproval` (risk word, Recon and outside-material warnings) is shown on Mission's card. Tests: `test/park.test.mjs` (six tools parked and answered, then a sixth still parks; three Denies, then a fourth tool still parks); `test/access-fixes.test.mjs` (a Mission with `waitMinutes` 0 is no longer unattended).

Mission "When it needs you" (owner's point 17, 20 November 2026): a Mission on **Full auto** never asks and never gives itself permission. Its `parkApproval` answers `{said: 'no', unasked: true, text}`; Tool access then answers code `not-asked` (the Tool ledger's `request:not-asked`, outcome refused) with Mission's text, instead of `denied`: you never said no, so no refusal time starts and no "no" is counted. Mission lists the request in its report and its Finish it card, where Allow goes through `grantParked` as before. Modes' own wait for a thread's own request during a Mission still reads Mission's hidden `waitMinutes`. No new on-screen words, so the locale files are unchanged. Test: `test/park.test.mjs`.

### Mission stage E (20 November 2026)

- **`toolKind(name)`** on the `modes` service → `{group, tier, sorted}` from Tool access's own list (`lib/catalog.js` `classify`), or undefined if it cannot be read. Mission uses it for "While a Mission runs, the assistant can: Talk and look things up": while a Mission is on (paused, working or waiting), the thread's own assistant may use sorted tools of tier 0 or 1 in the groups Read files, Browse the web, Accounts and connectors and Other Mac apps, and nothing that writes, runs commands or programs, or starts helpers (Mission also refuses the reading tools that save something, such as `scout_profile` and `data_chart`). Modes' own masks are unchanged; Mission's guard decides on top of them.
- **Depth stays "Mission on"** while a Mission waits for its model server (Mission's new strip state `down` joins `MISSION_ON`). No new on-screen words.
- Tests: `test/modes.test.mjs` (toolKind for a reading, a writing, a command and an unsorted tool; the Depth hook is on in `down`). Not checked in the running app.

## Recon and Devices colours (owner's point 20, 20 November 2026)

So you always know where you are:

- **Recon:** a red frame around the window, a red **New** button, a red selected **Recon** tab, and a faint red tint behind the thread.
- **Errors inside Recon** stay red but sit in a solid red box with a warning sign, so they stand out against the tint. Ordinary red words (a label, a switch) are not boxed: only the app's error lines and the messages Plus marks as errors.
- **Not boxed:** the note that a reply hit the output limit, and "Task stopped" when the app closed a turn (for example after it quit mid-reply). These are not failures. A real failure is a row with the red dot and an error code. "Task stopped" after you sign out of DeepSeek also shows a code, so it is boxed: you need to sign in again.
- **Devices:** violet (the app's own "done" colour) for its frame, its **New** button and its selected tab. No tint.

How it knows: the chat box of the open thread looks at the thread's mode (Recon is `recon`, Devices is `bench`). A thread that has no mode yet (a new one) follows the tab selected in the left panel. The page then carries `data-dsh-space="recon"` or `"devices"` on `<html>`; with any other thread the mark is gone. The mark is set before the screen is drawn, so a switch never shows the last thread's colour. The selected tab and the **New** button follow the left panel's selected tab (`html[data-cws-tab]`), because **New** starts a thread of that tab.

- **The frame** is a thin layer over the window's edges that lets every click through, so nothing moves or resizes. It sits above the app's layout and under its menus, dialogs and Settings, so it never covers them.
- **Split Plus:** each pane is a thread of its own, so a Recon or Devices pane gets its own frame (an outline a little inside the pane's edge) and, for Recon, its own tint and error boxes. The window frame is not used for panes. The frame stays clear of the pane's border, so the blue border that shows which pane you are typing in still shows; a coloured pane you are typing in also gets a blue ring around it.
- **Colours** come only from the app's variables (`--dsw-alias-state-error-primary`, `--dsw-alias-state-done-primary`), so light mode, dark mode and the colour schemes add-on all work. The words on the tinted tab and button are the space colour mixed with the text colour, which keeps them readable (WCAG AA, checked in the tests for light and dark). The tint is 5%.
- Orange is not used: it is kept for the overrides of item 4. Nothing animates.
- **On/off switch** (owner's point 21, 21 November 2026): Settings → Modes → Colours → "Recon and Devices colours" (setting `spaceColours`, on by default; saves at once). Off: none of the colours show anywhere (frame, tabs, **New** button, tint, error boxes, Split outlines), live, with no restart; on brings them back. Off empties the colours' style and hides the frame layer; the `data-dsh-space` marks stay, so switching back on shows the right colour at once.
- **A thread moved to another tab** takes that tab's colour: its recorded mode decides, so a thread moved out of Recon is no longer red, even while the Recon space is still selected.

Built in `client.js` (`spaceOfMode`, `spaceFor`, `markSpace`, `SPACE_CSS`, `showSpaceColours`, `setSpaceColours`). Tests: `test/space-colours.test.mjs`.

## Preset for each mode: Standard, PTC and Creator per mode (item 7, 21 November 2026)

The app has a preset menu next to the folder name on the new-chat page (Standard, PTC, Minimal, Creator). PTC (and Minimal) show in that menu only while the app's Coding Tools setting is on: **Settings → General → Show coding view**. Modes adds one choice per mode and explains the menu.

**Settings → Modes → Preset for each mode** (setting `presetLock`, JSON `{ tabId: 'any' | 'standard' | 'creator' }`; a mode without an entry has its default). One row per mode, each with an (i): **Any** (the menu is free), **Standard only**, or **Creator only** (the app's Creator preset, id `cordis`). Nothing is fixed: every mode, Recon included, can be changed. Defaults:

| Mode | Default | Why |
| --- | --- | --- |
| Recon | Standard only | Recon never runs code the AI writes; a PTC thread can only run programs, so it could do nothing. |
| Devices (`bench`) | Standard only | Devices refuses every program, a Mission included. |
| Automations | Standard only | An automation made from a PTC thread runs in PTC every time it runs. |
| Creator Plus | Creator only | Creator Plus refuses programs, and its inspection tools (`cordis_inspect_list`, `cordis_inspect_query`) come only with the Creator preset. |
| Every other mode (built-in, add-on, your own) | Any | |

Loosening a default lock to Any turns the row red with a plain warning and asks first (the question starts on Cancel). Recon's warning says that Recon's own no-programs rule is not changed by this setting and stays on. Changing a lock between Standard and Creator shows a short note instead. A change applies to new threads only; a started thread keeps its preset (the app fixes it at the first message).

**How a locked mode holds** (three parts, so neither a click nor the keyboard nor a pick made elsewhere gets past):
1. The Left panel add-on starts the mode's new threads with `{ agentPreset }` on the app's start (New, the left panel's +, Cmd-N when it follows the start place, the starter chips, Scratch, Recon's room, a project page, Continue and Keep in, Move to out of Recon). The thread is made in that preset before it exists.
2. The app's menu is greyed and taken out of the keyboard order (`aria-disabled`, `tabindex=-1`, its clicks and opening keys stopped) on a blank thread of a locked mode, through the slot `[data-slot='conversation.hero.agentPreset']`.
3. A backstop on the server: a still-blank thread of a locked mode that gets another preset (`agent-preset/selected`: a pick staged in another mode, the app's own Cmd-N, a thread made on the app's default) is switched to the locked preset after a short settle time. A started thread, a helper, one an automation opened and one another add-on moved on purpose are left alone; the app's `agent-preset/locked` refusal is ignored. The lock is read from the setting, never from a mode id, so your own modes can be locked too. The sealed fallback modes (`isolated-locked`, `isolated-late`) are never locked.

If the locked preset is not in the app's list (no Creator preset, or one that failed to load), nothing is forced: new threads start on the app's default, the menu stays free, and the (i) says so.

**The (i)** sits right after the app's menu on the new-chat page (portalled into the menu's own slot) and right after the read-only preset label of a started thread (`conversation.session.header.actions`, order -9; its pop-up goes to the page body, because the header's title row moves fixed children). It carries the owner's text (What it does: Standard and PTC; When to use it; If you change it: a thread keeps the setting it started with), the Coding Tools line, and where it applies: the mode's lock with its reason and **Settings → Modes → Preset for each mode**; a pick that the backstop switched back; a started thread that runs another preset than its mode's lock; and what a PTC program can still reach in this mode.

**PTC notes (inform, never block).** While a thread is in PTC in a mode where a program can reach more than the mode normally allows, one short line shows under the menu row, and the (i) has a mode line: Chat with Web on (files, commands and the web from inside a program), Scout (its privacy check sees only its own search tools), Data (a program is outside Data's no-network Python sandbox), Research (files, commands, the web; Deep research needs a long time limit), Content, and Automations when loosened. In a mode that refuses programs the line says a PTC thread cannot do anything there and to start a new thread on Standard (Creator for Creator Plus). Nothing is blocked.

**Honest words to the AI.** In a mode that refuses programs (Devices, Creator Plus, a mode marked `noPrograms: true`) the general "call every tool from inside run_code" note is no longer added under PTC; the AI is told the mode does not work in PTC and to tell you to start again with Standard (Creator for Creator Plus). Sealed modes (Recon, your own sealed modes) keep their own PTC words. The two sealed fallback modes no longer get them (the cause there is the mode, not the preset). The Tools panel's PTC hint is hidden in those modes. The slow-tool part of the PTC note now also names `judge_candidates`, `pdf_ocr`, `generate_image`, `edit_image` and `mac_run_shortcut`; `data_python` gets only "pass a higher timeoutMs", so Data keeps batching.

**Route** `GET /dsh-modes/preset` (header `x-dsh-session` for one thread; without it, each mode's choice for Settings; the answer is in English whatever `x-dsh-locale` says; the answer also names the app's default preset, `defaultPreset`). **Service** `modes.lockedPreset(tabId)`, `modes.presetView(sessionId, locale)`. Words: `lib/presetlock.js`. Tests: `test/preset-lock.test.mjs`, `test/preset-client.test.mjs`.

**Lab fixes (21 November 2026, later the same day).**
- A blank draft follows the tab it is shown in. A draft the app reuses from an earlier run (its turn state was not known when it loaded) now counts as a new chat, so the selected tab decides its mode, its lock and its (i). A draft a sealed mode (Recon) left behind and that never ran a turn loses its isolated mark when it starts in another tab; a chat that ran a turn keeps its mark for good.
- The backstop also runs when a new chat is moved into a locked tab by another add-on (a Split Plus pane, a Creator Plus, Content or Finance claim), and when the selected tab or a tab's lock changes while a blank chat is open. A started chat is still never touched.
- The menu is greyed only while the blank chat is really on the locked preset, and only when the app's preset list could be read; until the switch has landed the menu stays free.
- The "switched" line in the (i) keeps the tab it happened in and shows only while it still applies (same tab, still blank, still on that preset). A chat that opened on another preset (the app's default, a claim, a tab change) says "This new chat opened on PTC, but Devices is set to Standard only, so it was switched to Standard"; only a pick made elsewhere says "You had picked".
- A started chat's (i) speaks of its label, not a greyed menu: "Recon is set to Standard only: new chats here start on Standard (…). This chat keeps its preset." The Coding Tools line there names the menu on the new-chat page.
- Under the menu of a blank chat in a tab that runs no programs, the note now says to pick Standard (Creator for Creator Plus) in the menu before sending, not to start a new chat.
- Recon's row always shows one plain line, "Any is unsafe here: PTC runs code the AI writes. Keep Standard only."; its Any option reads "Any (unsafe)" and the question "Allow PTC in Recon? This is unsafe."
- Every word of the (i), the notes and the warnings is in English, also when the app is set to Chinese.
- The (i) and the lock read again at once when the Modes settings change (a tab switch, a lock change), not only every few seconds; an older answer never replaces a newer one. The app's preset list is kept for 5 seconds on the server, since every open (i) asks for it.
- Chat under PTC with Web on is told that it may call the web tools from inside a run_code program and nothing else, so its own "no tools" words, the Web line and the app's "run_code only" line no longer contradict each other.

**Not covered:** threads an automation starts take their preset from the automation itself (the Automations page shows and changes it); Plus never changes the app's default preset or the Coding Tools setting; an app update that renames the menu's slot leaves the menu free (the backstop still holds).

## Spaces underneath (item 4A, stage 0 and 1, 22 November 2026)

A space is where a thread lives (Chat, Code, Devices, Recon, Workshop); a mode is how it works. Stage 1 laid the groundwork (at the time nothing visible changed); stages 2 to 5 below build on it, and the left panel now shows spaces. Built in `lib/spaces.js` (pure); tests in `test/spaces.test.mjs`.

- **The map.** Chat, Cowork, Research, Scout, Finance, Data, Content, Automations and your own modes live in Chat; `code` in Code; `bench` in Devices (it keeps the id `bench`); `recon` in Recon; `creator-plus` in Workshop. Default ticks: Research and Data in Chat and Code, the others in their own space. In Devices, Recon and Workshop another mode's tick is kept but greyed ("Available once this space's rules are built") until stage 6a.
- **New Modes settings** (none shows on a page; the Settings search entries are internal):
  - `sessionSpaces` (JSON `{ threadId: spaceId }`): written at a thread's first message from the mode it starts in, also for a claimed thread (a Finance brief, Split Plus, Creator Plus) and also with "Pin the starting mode" off (then only the space is recorded, the mode as before is not). Carried with a Rerun copy and pruned with the other per-thread entries.
  - `spacesFilled`: the one-time fill. At the first start after the update every thread with a recorded mode and no recorded space gets the space of its mode, once, in the same queue as the first-message writes. It writes only `sessionSpaces`; an entry already stored stays exactly as it is, also a value that is not one of the five spaces.
  - `modeSpaces` (the owner's ticks per mode, set on Settings → Modes) and `spaceSettings` (per space: shown, start mode; set on Settings → Spaces): see stage 5 below.
- **Read, not rewritten.** `tabOrder`, `maxTabs`, `lastOpen`, the stored tab, the trash `tab`/`fallbackTab`, the projects `tab`, an automation's `runTab` and the preset-lock keys stay as they are. Helpers in `lib/spaces.js` read the space from them (`spaceOrderFrom`, `lastOpenBySpace`, `spaceOfTrashItem`, `spaceOfProject`, `locksBySpace`: Recon, Devices and Creator Plus locks become their spaces' locks, Automations keeps its own). The Left panel add-on and Settings → Spaces read them (stages 3a to 5); stage 6a adds the space rules.
- **Two switches** in `lib/spaces.js`: `SPACES_LIVE` (on since stage 3a, after one more fill with `refresh`; see below; before that it was off). While it is off a thread's mode decides where it shows, as its tab does today, so a thread moved to another tab is in that tab's space and `sessionSpaces` is written but not read to place it. `GUARDED_OPEN` (off; stage 6a): until then a guarded space offers its own mode only.
- **Service** `modes.spaces.{list, of, modesIn, ofMode}`: the spaces there now, a thread's space (a helper reports its thread's), the modes offered in a space, a mode's space. The route `/dsh-modes/mode` came with stage 2.
- **Shared settings:** `sessionSpaces` and `spacesFilled` always stay on each Mac; `modeSpaces` and `spaceSettings` are shared like the rest of Modes. **Mission's** repair helper refuses all four fields.
- **Stage 0 (Left panel add-on):** the Chat list now includes chats started in Scratch (see the Left panel add-on README).

## Mode list in the chat box (item 4A, stage 2, 22 November 2026: built and checked in the lab only)

Shown only while spaces are live. The one switch stages 2 to 5 read is `spacesLive()` in `lib/spaces.js`: `SPACES_LIVE` (on since stage 3a). In a lab or a test only, the environment variable `DSH_SPACES_LAB` says otherwise (`0` off, `1` on). Off, everything is as before (the former selector without the left panel, no list with it).

- **The list.** First in the row under the chat box, in Depth's look: the modes ticked for the thread's space, Plain chat first (once stage 4 adds it), greyed ones last with their reason ("Available once this space's rules are built", not pickable), each with one line (`MODE_BLURBS`; a mode's own `description` wins). Its (i): "A mode is a set of instructions and tools. You can change it at any time; it applies from your next message." The footer opens Settings → Modes.
- **A pick goes through Modes itself**: the route `/dsh-modes/mode` (GET the list, POST `pick` or `start`; `lib/route.js` `modeHandler`) calls `modes.spaces.pick`, which only allows a mode offered in the thread's space and then `modes.set` (with `claim` before the first message). A refusal comes back as a sentence that says what to do (`modePickRefusal`), shown in the list with Details for anything raw. A thread never changes space; a sealed (Recon) thread keeps its mode.
- **New drafts.** As soon as a draft opens, the chat box claims it with its space's start mode (`modes.spaces.startDraft`, `draftStartMode`: the mode it already has if offered, else the tab it was opened from while tabs are still on screen, else the space's start mode). The claimed mode stands at the first message (the tab no longer decides), and the thread is recorded in the space it was opened in (Research picked in Code stays in Code). Drafts another add-on claimed (Finance brief, Split Plus, Creator Plus) or an Automation opened are left alone.
- **After the first message**: a change applies from the next message; the preset, Web, Depth and Lens stay. `modes.set` records it in `sessionModeChanges` (one line per turn, the last change wins, a change back removes it; pruned with the thread, kept on each Mac, refused to Mission's repair helper) and a quiet line "Mode changed to Research" shows after that turn (`conversation.chat.turnTail`).
- **/mode** with spaces live works like the list: it lists the space's modes, is allowed before the first message, takes an id or a label, and refuses with the same sentences.
- Service: `modes.spaces.{live, view, pick, startDraft}` beside stage 1's `list, of, modesIn, ofMode`.

## Space buttons (item 4A, stage 3a, 22 November 2026: built and checked in the lab only)

The Left panel add-on's five space buttons replace the mode tabs (see its README). Modes' part:

- **Spaces are live.** `SPACES_LIVE` is on (the owner chose no "Spaces or Tabs" setting). A thread's recorded space decides where it is listed; changing its mode (Mode list, /mode) never moves it. `DSH_SPACES_LAB=0` turns spaces off in a lab or a test, to check the old tab paths.
- **The switch-over fill.** At the first start with spaces live, every thread is placed once more in the space of its mode (`fillSpaces` with `refresh`), so a thread the tabs moved (Move to, /mode) is where it was last put. It runs once, under its own flag `spacesRefreshed` (kept on each Mac, refused to Mission's repair helper); only `sessionSpaces` is written, and a stored value that is not one of the five spaces stays.
- **Moving a thread to another space** (the left panel's ⋯ → Move to): `modes.spaces.move(ids, space)`, route `/dsh-modes/mode` action `move`. The space is recorded; the thread keeps its mode where the new space offers it, else gets that space's start mode from its next message (with the quiet line "Mode changed to …" when it has run). A sealed (Recon) thread never moves (the left panel opens a new thread elsewhere, as before) and nothing moves into Recon: a sentence says so and nothing is written (`spaceMovePlan`).
- **The route's answer** carries the five spaces with `available` and `shown`; the left panel draws its buttons from it.
- **Preset in this space.** The lock is read by space while spaces are live (`lib/presetlock.js` `lockInSpace`): Recon, Devices and Workshop read today's keys `recon`, `bench`, `creator-plus` (Standard, Standard, Creator by default); Chat and Code had no space lock at stage 3a (stage 5 gives them the former Chat and Code space locks); the mode keeps its own (the Automations mode: Standard). The stricter holds: a lock beats Any; if space and mode lock to different presets, the space's wins and the chat box shows one line saying so (`lockConflictLine`). Nothing stored is rewritten. Until stage 6a only a guarded space's own mode runs there, so the two agree.
- **Colours** (Recon red, Devices violet) follow the thread's recorded space, else its mode's, else the window's space (`html[data-cws-space]`); the selected Devices button (`devices`, and the old tab id `bench`) and the New button follow the space. The colours switch is unchanged.
- Stages 2 to 5 go to the owner's app together.

## Plain chat and the Cowork switch (item 4A, stage 4, 22 November 2026: built and checked in the lab only)

- **Plain chat** (mode id `plain`) is a new built-in mode: every tool the space allows, the inherited sandbox, no instructions and no working method. A standalone thread reaches only its own folder, a project thread its project folder: since fix round 2 Modes fences it (see below; the app's own sandbox alone let a standalone thread read anywhere and write anywhere in the Scratch place). It is added to every mode list, also beside a `modes` list you saved yourself (yours wins on the same id), and never gets a tab of its own (`ADDED_MODES`, `added`). It is the **start mode of the Chat space**: new Chat threads start in it. The shown names of the two existing modes stay "Chat" and "Cowork".
- **Once on an existing install** (`plainAdded`, kept on each Mac, refused to Mission's repair helper): Plain chat gets the Cowork mode's "Load tools as needed", skills switched off and Tool access choices where Cowork has them and Plain chat has none (`lib/plain.js`). A choice made for Plain chat afterwards stays. A new install gets the same from `new-install-defaults.json`.
- **The Chat mode's words** no longer tell the user to switch to Cowork or Code mode; they point to the Mode list under the chat box. A stored list that still has the earlier built-in words is read as the new ones (`modePromptOf`); your own words are never changed.
- **The preset (i)** beside the app's preset menu starts with the owner's line while spaces are live: "Preset: how the model works with tools (Standard, PTC or Creator). It is fixed when a thread starts. It is not a Plus mode; Plus modes are the Mode list under the chat box." The menu itself is untouched.
- **A seat for the Cowork switch.** Right after the Mode list the chat box row has an empty seat (`[data-dsh-seat="place"]`); the Left panel add-on draws its switch or place label there (see its README). The row's pill style is kept out of the seat.


## Settings → Spaces and the space ticks (item 4A, stage 5, 22 November 2026: built and checked in the lab only)

- **Settings → Spaces** (new page, first in the "Spaces and modes" group). At the top: the order of the space buttons (the Left panel add-on's `spaceOrder`; ↑ ↓ and Reset order, or drag them in the left panel) and the **Recon and Devices colours** switch, moved here from Settings → Modes (the same `spaceColours` setting, shown in one place only). Then one card per space:
  - **Shown** (Chat is always shown). A hidden space's threads stay reachable through Show all and ⌘K. Stored in `spaceSettings` (`{ space: { shown: false } }`).
  - **New threads start in**: a mode the space offers (`spaceSettings.<space>.startMode`; the usual one is stored as no entry). If the chosen mode is no longer ticked for the space, the card says which mode is used instead.
  - **Where new threads start**: its own folder or a project folder (in Chat: Cowork off or on); Recon always in its room. This is the Left panel add-on's `startPlaces`, by the space's own tab id, so Settings → Start places (now listing the spaces) and the card always agree.
  - **Preset in this space**: today's "Preset for each mode" values with the same warnings and the same question before loosening a default. Recon, Devices and Workshop read the `recon`, `bench` and `creator-plus` keys as before; Chat and Code now read the former Chat and Code space keys (`chat`, `code`). Such a key is the space's lock only, never also a mode's. Under **Preset for one mode**: the Automations mode's own Standard lock, and any other mode with a saved lock.
- **Settings → Modes** with spaces: "New threads start in" points to Settings → Spaces; **Modes and their spaces** lists every mode (built in first, Plain chat first, then the add-ons' modes, then yours) with its one line and five ticks, each column with an (i). Devices, Recon and Workshop ticks are greyed ("Available once this space's rules are built") and a guarded mode's own tick is fixed. Ticks save at once into `modeSpaces` (never into an add-on's `extraModes`); a stored empty list means the mode is offered in no space; a space never loses its last mode (a sentence says what to tick first). The pencil changes a mode's one-line description (new setting `modeDescriptions`, for any mode; an add-on's instructions stay its own); your own mode cards get a Description field saved with them. "Preset for each mode" and the colours switch are replaced by a note pointing to Settings → Spaces. "Tabs in the left panel" stays retired (its value is kept).
- **The route** `/dsh-modes/mode`: GET with `x-dsh-page: settings` answers both pages (`modes.spaces.page`); POST `{action: 'tick' | 'space' | 'describe'}` changes one thing (`setTick`, `setSpace`, `describe`, lib/spaces.js `nextModeSpaces`, `nextSpaceSettings`, `nextDescriptions`); a refusal is a sentence and nothing is written.
- **A reused blank draft** the chat box only claimed by itself follows the space's start mode as it is now; a mode you picked in the Mode list stays.

## Fix round after review (item 4A, stages 2 to 5, 22 November 2026: built and checked in the lab only)

- **A draft nobody has claimed yet** (a first message sent quickly, a failed claim, a restart, a thread another add-on starts in the background) no longer takes `defaultMode`, which the space buttons stopped writing. With spaces it runs in its space's start mode, or in the mode it already has where that space offers it (`draftModeOf`). Its space: the one it was opened in, else its recorded one, else its folder's (Scratch and the default workspace: Chat; another project: Code). A scheduled first message keeps a thread's stored mode. A thread whose mode is gone (its add-on's Offer switch off) uses its space's start mode, never `defaultMode`.
- **Recon's room**: Recon answers `recon.isRoom(folder)`. A new thread whose folder is the room is only ever a sealed Recon thread: the space a window names is overridden, a pick of another mode is refused, Move to is refused (`spaceMovePlan` `room`), and `modes.set` refuses a mode that is not sealed for it (`ROOM_ONLY_RECON`). Recon is never given to a draft outside the room. Without Recon (or an older Recon) the window's space is trusted, as before.
- **Reused drafts follow the space.** `startDraft` claims a draft again when it shows in another space: a mode you picked comes back where that space offers it (`pickedModes`), else the space's start mode. `reset` (sent by the left panel's New) drops the pick, so New always starts in the space's start mode. With a space, the window's tab is no longer a hint (Settings → Spaces decides).
- **Moves out of Recon** are claimed through `startDraft` with the target space (Recon's door), so a thread moved to Chat starts in Chat's start mode (Plain chat), recorded in Chat.
- **The Mode list** names the current mode (`currentLabel`), also one its space no longer offers (shown first, marked); a guarded space whose own mode is off says which add-on to switch on, with a link. The mode's name is the last label the narrow row hides. Refusals in Recon, Devices and Workshop no longer suggest a tick that is greyed until stage 6a.
- **/mode on a new thread**: the app shows no command output on a thread with no message yet; since fix round 2 the chat box shows the reply beside the Mode button (see below).
- **Going back to the stage 0+1 tree** means installing it again; threads made in Plain chat then run as the app's default mode (Chat), because the older code does not know `plain`.

## Fix round 2 (item 4A, stages 2 to 5, 22 November 2026: built and checked in the lab only)

- **Plain chat stays inside its folder** (the owner's answer: "a standalone chat reaches only its own folder, a project chat its project folder"). The app's sandbox limits writes to the session folder, which for a standalone thread is the whole Scratch place (every standalone thread's folder), and does not limit reads; its file policy line also tells the model it may change files anywhere there. Modes now fences a Plain chat thread and its helpers (`lib/fence.js`, a tool guard, ledger rule `plain-fence`): every path a call names (file tools, an absolute glob, a patch's headers, the words of a command, a program's text) must be inside the thread's own Scratch folder (standalone) or its project folder (project); a link that points out counts as outside; programs and libraries under /usr, /bin, /System, /Library, /Applications, /opt, /etc and /dev may be read, never written; /tmp and /var are outside (other threads and Recon's room live there); Recon's room never; Spotlight search (`mac_find_files`) is refused; connectors (`mcp__…`) are not this Mac and are not checked. A command's text is read, not what a script does once it runs. The refusal says what happened, what to do (work in the folder; drop a file into the chat, which copies it into the folder; or start a project thread there) and where the switch is. The model is told its folder in its own line (`modes:fence`), so what it hears matches the fence. **Setting** `plainFence` ("Keep Plain chat inside its folder", Settings → Modes, on by default, with an (i)); switching it off asks first and the row then says what is open. Kept on each Mac (Shared settings), refused to Mission's repair helper, in the Settings search (English and Chinese). Only Plain chat is fenced: the owner's answer names Plain chat; the other modes of the Chat space keep their own rules (Scratch threads start at Workspace Write at most); fencing them too is a question for the owner.
- **Starting values on a draft.** A mode picked (or claimed) before a thread's first message now brings that mode's starting values (Settings → Modes → Starting values: Web, Web sources, Depth, Helpers, Tools). What the earlier mode's start wrote is taken back where it is unchanged; what you set by hand on the draft stays (`lib/start.js` `restartOps`). After the first message nothing changes: a mode change keeps Web, Depth and Lens (the owner's answer). Not for an Automation's thread (its task decides).
- **What Plain chat inherits from Cowork, decided per setting** (once, `plainCarried`, kept on each Mac, refused to Mission's repair helper; only where Cowork has an entry and Plain chat none; the Cowork keys stay as they are; `lib/plain.js` `plainCarryOps`). Plain chat works like Cowork without its working method, with tools on, so it inherits Cowork's choices, not the Chat mode's (which has no tools):
  - `trimModes` (Load tools as needed), `skillsOff`, `toolAccess`: from Cowork since stage 4 (`plainAdded`);
  - `modeStart` (Starting values): from Cowork;
  - `longTools` (Mission tools): from Cowork;
  - Mission `loopTabs` (the work loop without Ultra Code): `plain` added where `cowork` is listed;
  - Sampling presets `byMode` and Agent swarm `defaultSwarmByMode`: Cowork's entry copied;
  - Context saver: nothing to copy, it already treats every mode other than Chat and Code as Cowork;
  - `presetLock`: nothing; the Chat space's lock applies to every mode there;
  - `scheduledMode` and `defaultMode` stay `cowork` (an Automation's fallback and the old tab layout).
  A write into another add-on that fails is tried again at the next start; a second run changes nothing.
- **Recon's room picked from Chat or Code.** A thread whose folder is Recon's room is still made a sealed Recon thread; now the chat box also switches the window to Recon (the Left panel add-on's window event `dsh-cowork-shell:show-space`) and shows one line beside the Mode button, "This folder is Recon's room, so this thread is a Recon thread.", with an (i). It hides by itself. Same from Code's picker. The Mode route's view carries `room`.
- **A reused blank draft's access.** When the chat box claims a blank draft again for another space or mode, its access level is that mode's start access (its own level, or for a mode that inherits, the level from before a mode changed it), unless the level was changed by hand on the draft or Modes never set it (`lib/sandbox.js` `draftAccessStep`).
- **/mode on a draft** keeps its reply for the chat box (the view's `reply`, one minute), which shows it once beside the Mode button and hides it by itself; the chat box reads a draft again every few seconds while it shows.
- **Upgrade safety.** A blank draft whose space is recorded in another space (by the one-time fill from a mode another add-on claimed, or by Move to) is no longer claimed by a chat box of another space after a restart: a Creator Plus saved run's draft that an Automation sends to stays Creator Plus in Workshop. Before, a Chat window reopened after the update turned it into Chat's start mode (the lab thread thread-42ebe888 became Cowork in Chat under the pre-fix code; it was repaired by hand in the lab). Replayed in `test/fix-round2.test.mjs`.
- **Tool ledger:** each line now carries the thread's space next to its mode (`space`, from `modes.spaces.of`; see the Tool ledger's README).

**Stage 7 word pass (23 November 2026):** done; see "Stage 7: English only, thread, space and mode" at the end.

## Round 2, UI and text (item 4A, stages 2 to 5, 22 November 2026: built and checked in the lab only)

- **Mode names.** `lib/spaces.js` `modeName(mode, lang)` gave built-in and add-on modes a Chinese name on a Chinese page. Since stage 7 (Plus is English only) it returns the mode's name as it is; `SHIPPED_MODE_NAMES` keeps the names each mode ships with.
- **(usual) and (default).** On Settings → Spaces a space's built-in start mode reads "(usual)"; a preset choice's default reads "(default)".
- **An add-on mode read-only (mock-up f, part 2).** Its ✎ on Settings → Modes ("See what … brings and change its description") opens the description editor with a read-only block "From the add-on": its instructions in short (at most 280 characters, never the whole prompt), its tools (the space's, none, or its own list with Show the list), its file access, its model tier and the spaces it is ticked for, with an (i) that says where to change them (the add-on's own Settings page). `modeAbout(mode)` builds it; built-in and your own modes are edited in their cards as before.
- **Each window keeps its own space.** Settings → Spaces has an info row (no switch: this is how spaces work) with an (i).
- **The start page's chips follow the mode** (plan 2.5). While a new thread shows, the chat box puts its mode on the page (`html[data-dsh-draft-mode]`); the Left panel add-on draws the chips of that mode (its README).
- **1280 px with the left panel open.** Depth's name, the mode's name and the Cowork switch's name now hide last (step 5, with the tightest padding); Web, Tools, helpers and Deep research go to icons first. The mode's name is capped at 6.5em. When the right-hand group (Start Mission, model, Send) is on a line of its own anyway, the step is the first at which the core buttons share one line (`oneLine`), so the row keeps its words (lab: step 1 at 1280×860 instead of step 5).
- **Words.** Settings → Modes says thread and space: New threads, Starting values for new threads, the Depth hints ("every space"), Mode for automations ("whatever space the window shows", "New threads use the automation's mode"), Missions per mode, the Web ticks' starting ticks per mode, the colours hint.

### Wording left for stage 7

Done in stage 7 for this add-on (see the last section). Other add-ons' screens are their own READMEs' business.

## Final fix round (item 4A, stages 2 to 5, 22 November 2026: built and checked in the lab only)

- **Plain chat's fence, closed further** (`lib/fence.js`). A command's words are read harder: `/` alone is the whole disk and is refused (it is not a system place like /usr); every word with a `/` is resolved from the command's folder the way the system reads it (`physical`: `..` through a link goes to the parent of the link's target), so `cd /; cat Users/…`, `ln -s / r` and `door/../secret` are refused; `cd`, `pushd` and `chdir` to any folder outside the thread's folder are refused, system places included, so the shell never stays outside; `~name/…`, and a variable or a command's output used as a path (`$X/…`, `$(…)/…`, `` `…`/… ``) cannot be checked and are refused, while `$HOME`, `$PWD` and `$TMPDIR` are expanded first; `cd -` and `cd` alone (the home folder) are refused. Every shell tool name is read (`bash`, `terminal`, `terminal_open`, `terminal_send`, `shell`, `pwsh`, `powershell`, and `terminal_…`-like names), from `command`, `cmd`, `script`, `text`, `input` or `keys`. A command's own working folder (`workdir`, `cwd`, `directory`) must be inside, and its words are read from there. A glob pattern is resolved whole (`x/../../other/*` is refused). The working_directory tool's `cd` is checked. When the thread's working folder is outside its folder (moved earlier, or a move into its own Scratch folder that failed), relative paths, searches with no path, commands and programs are refused until it moves back; the refusal says to run working_directory with the folder. In a program, `'/'` is the whole disk and a bare `/` is division. The refusal also names the setting in Chinese.
- **Per-thread values are never dropped by another write** (lab: a started thread's own Web, Depth and Models went back to the usual when a new draft got its starting values). Each per-thread map is one setting, so a write replaces the whole map. The writes of starting values, the mode choice, the prune of gone threads and the one-time moves are now built from the settings service's current values and sent with its revision; when another write landed in between, the service answers "conflict" and the write is built again (`writeFresh`, one at a time).
- **Starting values on a reused draft after a restart.** What the earlier mode's start wrote is kept in memory only; after a restart it is taken to be that mode's starting values, so a pick takes them back where the draft still holds them unchanged (lab: a draft picked from Research to Plain chat kept Research's Depth and Models). A new draft claimed for the same mode it shows (the Cowork switch picks a folder and the app makes a new draft) gets the mode's starting values too.
- **Plain chat's carry per add-on** (`plainCarriedIn`, a JSON list, kept on each Mac, refused to Mission's repair helper). Mission, Sampling presets or Agent swarm installed or switched on after the first carry is still carried once; one carried before is not touched again.
- **An Automation's thread is in the space of its mode.** A task with no recorded tab or folder opens its thread in the app's working folder (a project: Code) but runs the task's mode (Cowork). When the folder's or window's space does not offer that mode, the thread goes to the mode's own space (Chat), so space and mode agree.
- **`spaces.startOf(space)`**: the mode a new thread in a space starts in, for other add-ons (Split Plus's Add pane).
- **Mode names everywhere.** The quiet line of a mid-thread switch, Settings → Spaces "Preset for one mode" rows and the preset texts (`lib/presetlock.js` uses `modeName`) name modes the same way the Mode list does; the (i) stays beside the label.
- **Not changed here, for the owner:** Research shows Web on whatever the thread's Web was (its README: Research always has the web), and a mode's own access level applies on a mid-thread switch; nothing in the thread says so (see the round's report).

## Spaces keep their rules (item 4A, stage 6a, 22 November 2026: built and tested with stand-ins only)

A mode other than a space's own (a "guest") may now be ticked for Devices, Recon and Workshop; it runs there under that
space's rules (`lib/spacerules.js`; design `STAGE6A-DESIGN.md`; the owner's answers, REVIEW-REQUIREMENTS-1.md 1.5 point 26).

- **Recon: sealed.** A guest gets the sealed copy of its mode (same id, `sealedBy: 'recon'`): isolated, Read only, no
  programs. It goes online only through Recon's own tools (`recon_*`, never `recon_ultra`); `web_search`, `web_fetch` and
  `deep_research` are left out. It keeps only `SEALED_KEEP` of its own tools; file tools read and write only inside the
  thread's room folder (`recon.roomRunFolder`; left out while the room is unknown), also a tool granted in the popup
  (the room path rule in the isolated guard, for Recon-mode threads too). Tools that write notes other threads read
  (`remember`, the Finance profile, saved analyses, Learn, Content, Scout's profile) are never offered or asked for.
  Sealed from the draft on, before its first message; a thread recorded in Recon stays sealed even when its mark was
  lost. With Recon off or older than its stage 6a version, a Recon thread that ran is held without tools. A sealed
  thread may switch to another mode Recon offers and stays sealed.
- **Devices and Workshop: guarded.** A guest keeps its own tools (plus the device tools `bench_*` in Devices) minus
  everything `spaces.guestRefuses` names: the Terminal, programs, background jobs, connectors, Mac app tools (except
  `mac_find_files`), Office files, schedules, engines, the app's own tools and every tool nobody has sorted. Modes refuses
  them itself (mask and the `space-guard` guard) whether Bench or Creator Plus is on; their own guards add the folder rules.
  Bench or Creator Plus on but too old (no `guestsGuarded`): guests are held without tools until it is updated.
- **Workshop needs Creator Plus for modes.** Without it, Workshop's other ticks are greyed with how to switch it on, and a
  new Workshop thread has no tools (never Plain chat).
- **The ticks** on Settings → Modes are open while the space's guard is ready; else greyed with "Needs …" or "Needs a
  newer …". A ticked Devices or Workshop box gets a warning line with what the mode loses there; Recon a sealed note.
- **Settings → Modes → Spaces' rules:** "Extra tools a mode keeps in Recon" (`sealedExtra`, only the Library tools,
  default none, with a warning line) and "Tool access Off also applies in Devices and Workshop" (`gridInGuarded`, default
  on). A grid On never adds a tool to a guest in Devices or Workshop.
- **A space's record is written at the claim** (`spaceOverlay` holds it until the write succeeds, failed writes are tried
  again; `spaces.pending()` lists those not yet written), and a spaced draft's first step waits (at most 2 s) for its claim.
- **No way into Devices or Workshop after programs.** A thread that ran the Terminal or a program in this app run cannot
  be moved there until the app restarts.
- **Service (apiVersion 2):** `guardOf(id)`, `topOf(id)`, `spaces.rules()`, `spaces.guestRefuses(name)`,
  `spaces.pending()`, `spaces.ready()`, `spaces.setRules(patch)`, `set(id, mode, {space})`, `lockedPreset(id, {space,
  sessionId})`. `spaces.of(id)` reads the same seam as the mode (`spaceOfTopRaw`, never asking for a mode).
- **Fails closed.** A space that cannot be read gives the `unknown` guard (the base rule); a helper no header names a
  parent for has no tools while a Devices, Recon or Workshop thread is open.

### Stage 6a fix round after review (22 November 2026: tested with stand-ins only)

- **Nested helpers keep the guard.** A closed helper's link to what started it is kept (`closedParents`), so a helper it
  started still reaches the thread (sealed in Recon, guarded in Devices and Workshop). A link that ends on a closed id
  with nothing recorded, or a chain deeper than the walk, is not a known thread: the unknown-helper rule holds (I5).
- **Guard off holds guests.** With Bench or Creator Plus switched off (not only too old), a guest in Devices or Workshop
  has no tools until it is back (the base rule has no folder rule; the owner's "never the Devices folder or /dev").
  This changes the design's R6c / I27 note. The copies follow a guard coming up or going away at once (its readiness is
  part of the memo key; Bench, Creator Plus and Recon coming or going reconcile every thread).
- **Room path rule.** Every file reader of the `read` group (`pdf_ocr`, `code_map_*`, `working_directory`, …) is
  path-checked in a Recon-space thread, also when granted in the popup; `scout_files` and the Library tools are refused
  there (they read outside the room), the Library tools not when kept in `sealedExtra`. Text bodies (`content`,
  `new_string`, …) and grep's `pattern` are no longer read as places; glob's `pattern` and a data `query` still are.
- **Moves.** A thread is noted as having run programs when a shell, program, engine or workflow call is let through
  (not only when it returns). A thread with a Mission that has not ended cannot move into Devices or Workshop. A move
  replaces any space still waiting to be written, and an unguarded waiting space is dropped once its retries run out.
- **Claims.** A claim waits for one already in flight on the same draft; a guarded window asking for a draft claimed in
  another space (another add-on's claim) gets `keptIn` and opens a fresh draft.
- **Tool access.** A sealed thread's request is logged and parked with a fixed reason (its own stays in the live card);
  a thread Recon wipes (`reconWipe`) loses its permissions, its note and its log lines (`dropLog`).
- **Words.** Settings → Modes shows "not ready" only from the server's `rules.notReady`. The Mode list says under each
  guest in Devices, Workshop or Recon what it loses there (or that it is sealed), and its (i) says modes follow the
  space's rules. The held line names the add-on in the page's language and says "new" only for a thread that has not
  run; a held thread shows its chosen mode (or "No tools for now"), never "Sealed". The tick warning names the tools
  nobody has sorted as one family; it is no longer repeated above the list, and refusals name the mode. SPACE_WAIT
  shows as a line in the chat box.
- **Speed (I29).** `readModes` and the `sessionModes` reads of `modeOf` are memoised by their raw strings.

### Stage 6a leftovers (22 November 2026: tested with stand-ins only)

- **A held thread says where it is.** A thread Devices or Workshop holds without tools (Bench or Creator Plus off or too
  old) no longer tells the model about an "sealed mode": its words name the space and the add-on to switch on or update
  in Settings. Its first turn no longer marks it isolated for good, so it gets its mode back once the add-on is ready.
- **Names in a language.** The Modes service has `modeName(id, lang)`, `list(lang)` (with a language, `label` is the
  shown name; each entry also has `name`) and `spaces.names(lang)`, so other add-ons (Recon) keep no copy of the names.
  Calls without a language answer as before.
- **Engines stay out of guarded spaces (second layer).** A step on an engine model is refused for a thread in Recon,
  Devices or Workshop (or a mode without programs), also when dsh-engines would let it through; the chat box says
  "Nothing was run: this thread's model is an engine, …".
- **Engines: home modes keep today's behaviour; the model check fails closed.** The home mode of Devices (Bench) and of
  Workshop (Creator Plus) is not refused by this layer (`guardRefusesEngine` in lib/spacerules.js): as before 6a, the
  step reaches dsh-engines, whose "Code space only" check (stage 6b; "Code mode only" before) answers it and runs nothing. Recon's home mode is sealed and
  stays refused; a home mode visiting the other space is a guest. A model that cannot be read is now refused when the
  thread's guard would refuse an engine (before, it went through).
- **Creator Plus home threads keep their schedules.** Modes does not refuse `schedule_*` for the Creator Plus mode in
  Workshop (as before 6a); other modes there stay refused. Covered by a test.

## Stage 6b, Part A: your message comes back when an engine is refused (item 4A, 23 November 2026: built and unit-tested only)

- **What happens.** In Recon, and for a guest mode in Devices or Workshop, a thread whose model is an engine is refused
  before anything runs (as in 6a). Now the message you typed goes back into the chat box, and the line under it says
  "Nothing was run: … Your message is back in the chat box: pick one of your models, then press Send."
- **When the chat box already has text** (or the app cannot set it), nothing is overwritten: the line says your message
  was kept and shows a **Put back** button. It asks "Replace what is in the chat box with your earlier message?" first.
- **What is kept.** Only the words you wrote in that message (never a scheduled run's instruction or a tool's output), at
  most 20 000 characters, for 10 minutes, in memory only: never saved, never logged. Only that thread's own chat box, in
  a window showing its space, is offered it. It is gone once put back, after 10 minutes, or when the thread is closed
  (Recon's End and wipe too). A refused run with no words of yours shows the line without the promise.
- **The page's language for dsh-engines.** Modes remembers the language each thread's page uses (memory only), so
  dsh-engines can ask for it (`spaces.pageLang`). Since stage 7 it is always `en`.
- **Mode label without a recorded mode.** With spaces on, it shows the space's start mode or Plain chat, never the old
  "mode new threads start with" setting (which may still name Recon).

## Stage 6b, Part B: schedules in Devices and Workshop (item 4A, 23 November 2026: built and unit-tested only)

- **Schedules in Devices and Workshop (owner, point 27).** A guest (another mode in Devices or Workshop) keeps the app's schedule tools; the Mode list and Settings → Modes no longer say a mode loses schedules there. A thread whose space could not be read (the `unknown` guard), and a Mission run in those spaces, still get none: an unattended run does not schedule more unattended runs. `guestRefuses(name, {space, mission})` decides it; a call that does not say the space counts as `unknown`, so a missed call site refuses (fail closed). Home modes keep their own lists (Devices and Creator Plus give no schedule tools at home).
- **New threads from a guest need Automations.** From Devices or Workshop, `schedule_create`/`schedule_edit` with a new-thread target (`new`, `new_once`) is refused with a sentence unless the Automations add-on is on and new enough to keep those runs in the space. Such an automation is remembered with its space in `guestRunSpaces` (per Mac, never shared, never changed by Mission's repair helper); a fresh thread of it that nobody placed in that space by its first step is held there, also when Automations is off or gone.
- **Held runs.** An automation's claim may ask to hold (`set(id, mode, {claim, space, hold})`): if the space cannot take the run now (its guard off or too old, the mode not offered there), the thread is recorded in that space and every step of it and its helpers is refused until you write in it; the chat box says "This automation's run was held: …". `spaces.holdRun` does the same for an existing thread's next scheduled turn. Held runs are memory only (24 hours at most) and go with the thread. `hold` and `anyTick` count only for a claim of a scheduled thread that has not run.
- **Run where set.** `set(…, {claim, space, anyTick})` lets an automation's stored Chat or Code place take a mode that is no longer ticked there (never a guarded space).
- **Guests changing automations.** From Devices or Workshop, `schedule_edit` is allowed only for an automation delivered to that thread, or made in that space and still running there (Automations' `placeOf` says which, with `createdSpace`); without Automations, never (fail closed). So a guest cannot rewrite a Chat or Code automation, whose runs get the Terminal, or pull a Recon automation's instruction in with `this_session`.
- **Engine refused: the message comes back.** The Devices mode and Creator Plus at home are still answered by Engines' soft refusal, but the message you typed is kept and put back into the chat box as in Recon and for guests (owner, point 27). "Your message is back in the chat box" shows only in a window that is given the text (its own space), else the line without that promise. Put back has an (i).
- **Scheduling from Recon.** From a sealed thread, `schedule_edit` is allowed only for an automation whose runs go into that thread (Automations says which); without Automations, never. This closes a gap where a Recon thread could rewrite another automation's instruction.
- **Display only.** `spaces.scheduledPlace(cwd)` tells where a scheduled thread opens in a folder, for "Runs in" of older automations; `spaces.held(id)` tells whether a thread's run is held.

## Stage 6b, Part D: your start-mode choice is kept (item 4A, 23 November 2026: built and unit-tested only)

When the add-on whose mode is a space's start mode is switched off, nothing is written to `spaceSettings`: the Spaces
page says the start mode is gone and which mode is used instead, new threads there start in that mode, and the choice
is back when the add-on is switched on. The gone mode is now named as it ships ("Research"), never by its raw id,
also when its add-on is off and the mode is not listed (`goneName`, lib/spaces.js). The nine mode add-ons keep their
one reset of `defaultMode` to Cowork (only when it named their mode; it matters only without the Left panel add-on).
The Mode label's fallback (`describeModes`, J21) was changed by Part A. Test: `test/start-mode-kept.test.mjs`.

## Stage 7: English only, thread, space and mode (item 4A, 23 November 2026: unit-tested only)

- **English only (owner's decision 28).** `locale/zh.json` and every Chinese text table are gone: the client's `zh`
  dictionary, `MODE_BLURBS.zh`, `SPACE_NAMES.zh`, `ADDON_NAMES.zh`, the Chinese refusals and lines in `lib/spaces.js`,
  `lib/spacerules.js` (`ROOM_PATH_ONLY`, `RECON_REFUSALS`), `lib/presetlock.js` (`TEXT.zh`, `NOT_A_MODE.zh`) and the
  Chinese errors in `index.js` and `lib/route.js`. When the app is set to Chinese, every page, (i), note and error of
  Modes is in English. The `lang` and `locale` parameters, the `?lang=` and `x-dsh-locale` inputs and
  `spaces.pageLang(id)` stay, so other add-ons that pass them keep working; they now always mean English.
- **Shipped mode names.** `MODE_NAMES_ZH` is now `SHIPPED_MODE_NAMES` (English names only, old names included, such as
  "Bench" and "Bench Lab" for Devices). It still tells a shipped mode from your own (`goneName`, `startModeGoneOff`).
- **Words.** Texts the owner and the model read say thread (not conversation or session), mode (not tab, where the
  old tab was a mode), space and left panel (not sidebar). The fallback modes read "Sealed (not available)" and "Sealed
  (locked)". Settings → Modes → "Preset in this tab" is now "Preset for each mode", and "Mode for scheduled tasks" is
  "Mode for automations". Tool access's first page is "Modes". Ids, setting keys, routes and stored values did not change.
