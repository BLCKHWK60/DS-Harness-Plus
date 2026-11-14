# Gaps and plan

Written 2026-11-13, at version 0.40.0, for review with the owner. Nothing here is built. It lists where the add-ons do not yet fit together, what is missing in the interface, and a proposed order of work.

**How each gap was found.** "Checked" means a script or a lab run showed it: a search of the code for who knows about what, a count of settings pages, tests and translated texts, or behaviour seen in the test setup. "To check" means it follows from how the parts are built but was not run; the first step of that item is to confirm it.

**Sizes.** S: under an hour of building. M: a session. L: several sessions, to be done in steps.

## A. Parts that do not know about each other

These are the "one add-on does 48%, another 50%" cases.

| # | Gap | How it shows | Found | Proposed fix | Size |
|---|---|---|---|---|---|
| A1 | **A mission run ending sends no alert.** Alerts only fire when a *scheduled* task ends. No other add-on knows a mission run exists. | You leave a run going, it finishes or pauses itself, and your phone stays silent. | Checked: a search of Automations, Activity, Budget guard, Notify and Self-improvement finds no mention of Mission. | Mission offers its events (started, needs you, paused, finished) as a small service; Automations alerts on finished, paused and needs-you. | M |
| A2 | **Notify fires on every round of a run.** It runs your command at each turn end, and a run is many turns. | A sound or notice per step, up to 60 times. | Checked in the code; not run. | Notify skips turns that belong to a running mission and fires once when the run ends. Comes with A1. | S |
| A3 | **Budget guard may stop a long run.** Its limits are per task (300 steps, 20 million tokens), and helpers count toward their conversation. | A long run could be stopped in the middle with no word in the run's report. | To check: how a "task" is counted across a run's rounds. | If it bites: Mission states the budget in its start line, and a budget stop ends the run with a proper report. | S–M |
| A4 | **Mission's logs are written and never read.** The owner asked for "a run log the self-improvement loop can review later". | Runs leave `log.jsonl` and every model's answer; nothing learns from them. | Checked: nothing reads `runs.jsonl`. | A "Lessons from runs" action in Self-improvement: it reads finished runs, lists what failed and why (a check that proved nothing, an item that needed three tries), and proposes instruction changes for your approval, as it does for test tasks. | L |
| A5 | **Data and Finance tools exist only while their tab is shown.** A Cowork project that could use them is told "switched off: go to Settings". | A Paperwork project cannot total a bank statement unless you also show a Data tab you do not want. | Checked: the tools are registered by the same switch that shows the tab. | Split the switch in two: "Show the tab" and "Tools available". The tools become available to typed projects on their own. | M |
| A6 | **Three places remember things about you.** Memory (facts for every conversation), the Finance adviser's profile, and a project's instructions. They do not see each other. | You tell Finance your goals and Cowork does not know them; you edit Memory and the adviser's profile is unchanged. | Checked: three separate stores, no links. | Keep the three (they have different reach) but connect them: the adviser's profile page offers "also in Memory", Memory's page lists where else facts are kept, and one guide section explains which is for what. | M |
| A7 | **Learn type and Learning add-on overlap.** The type is instructions only; the add-on has the plans, reviews and marks, and is switched off in the owner's app. | Two half-tutors: one without progress tools, one without a project. | Checked. | Decide one home. Proposal: the Learn type switches the Learning tools on for its project only, and the add-on's "works in every conversation" becomes optional. | M |
| A8 | **Per-project settings are in three places.** A project's instructions and type are on its page; its mission models are in Settings → Mission; its tab is on its page. | To see how one project is set up you visit two screens. | Checked. | The project page gets a "Runs" card: mission models and default permission mode for this project, linked both ways with Settings → Mission. | M |
| A9 | **The models chip does not cover everything that loads a model.** Self-improvement, Benchmark and Arena run the models picked on their pages; the Model router can move the conversation itself to another model. | The chip says "One model" while a benchmark loads three. | Checked: none of them asks the chip's setting. | The chip's panel lists these as "also uses models" when they are active, and the router is shown as a second model when it is set up. No behaviour change. | S |
| A10 | **Project types stop at the Cowork tab.** A Code or Data project has instructions but no types, no generator, no versions. | "Generate with a model…" would suit a code project best, and is not offered there. | Checked: the card is shown for Cowork only. | Offer the generator and versions on every project page; keep the five types for Cowork, and add one or two for Code (for example "Library", "App") later. | S–M |

## B. Missing in the interface

| # | Gap | How it shows | Found | Proposed fix | Size |
|---|---|---|---|---|---|
| B1 | **Mission is commands only.** No button starts a run, nothing shows the checklist while it runs, and the permission mode in force is invisible. | You must remember `/mission auto …`; to see progress you type `/mission report`; you cannot tell at a glance that Restricted is on. | Checked: Mission adds no control to the chat box or sidebar. | (1) A permission chip beside the models chip: off, Restricted, Ask-Auto, Full Auto. (2) A run card above the chat box while a run is on: the checklist with marks, the step under way, Pause and End. (3) A "Start a mission" entry on the Code start page. | L, in three steps |
| B2 | **Eight add-ons have settings and no settings page.** Deep research, Code power, Model router, Route health, Context saver, Media tools, Notify, and part of the Cowork sidebar. | Their settings can only be changed in the configuration file. | Checked by count: 67 settings without a page. | One "More settings" page in Settings that shows these add-ons' settings as simple rows (switches, numbers, text), built from the same data the guide's reference uses. Not eight new pages. | M |
| B3 | **Twenty-six settings pages and no overview.** Nothing says what is on or off, or what needs setting up. | A new user cannot tell which pages matter. | Checked by count. | A "Plus" page at the top of Settings: every add-on in one list with on/off, a one-line "needs setting up" where true (Python, git, role models, a phone for alerts), and a link to its page. See also D1. | M |
| B4 | **The folded chat box has no way back by keyboard, and hides Stop.** | With the box folded you must reach for the mouse, and a running turn cannot be stopped without unfolding. | Checked (told to the owner at 0.34). | A keyboard shortcut registered with the app's own shortcut list, and a small Stop on the folded line while something runs. | S |
| B5 | **Rerun copies look identical in the list, and drop attachments.** | After two reruns you have three conversations with the same title; a question with a picture is re-asked without it. | Checked in the lab (titles); attachments by reading the code. | Name the copy after the model ("… · mock-small"), and re-send attachments from the stored references. | M |
| B6 | **Data: a Python run cannot be saved as an analysis.** Only SQL queries can be rerun. | "Save this analysis" refuses the statistical part. | Checked: the tool says so. | Save the program with the analysis and rerun it in the same sandbox. | M |
| B7 | **Generated instructions: no way to say what you want.** The generator gets the folder and the type, not a word from you. | To steer it you must edit the result by hand. | Checked. | One optional line in the panel: "Anything it should know or aim for". | S |
| B8 | **The approval card says "Allow once" where the answer is remembered.** | In a Mission mode the button's wording contradicts what happens. | Checked in the lab. The button belongs to the app. | The question text already says "asked once per file". If the app allows a second button, add "Allow for this file"; otherwise leave it and say so in the guide. To check. | S |

## C. Not the same everywhere

| # | Gap | Found | Proposed fix | Size |
|---|---|---|---|---|
| C1 | **Fourteen settings pages are English only; eleven are translated.** Finance, Data, Mission, Model Tiers, Automations, Mac, Budget guard, Library, Memory, Activity, Diagrams, Self-improvement, Learning and PDF reader have their texts written into the page. | Checked by count of fixed texts against translated ones. | Decide once: English only (then drop the half-done Chinese texts) or both (then move the fixed texts into the translation tables). Proposal: both, done by script, one add-on per pass. | M |
| C2 | **Two families of page styling.** Each page carries its own copy of the same rows, switches and buttons under its own prefix. | Checked: the same switch is defined in at least eight files. | A small shared style and three shared pieces (row, switch, button) that pages import. Do it when a page is touched anyway, not as a project of its own. | M, spread out |
| C3 | **"Off by default" means different things.** Finance and Data are off until switched on; the adviser and hiding the thumbs are single switches; Learning is on in the download and off in the owner's app; Privacy looks off to a reader of its file but is on. | Checked. | The overview page (B3) shows the real state of each; the guide's reference now states it per add-on. | with B3 |
| C4 | **Slash commands are uneven.** Fifteen add-ons have one, twenty do not; Finance, Data and the project features have none. | Checked. | No new commands for their own sake. Add `/project` (open this conversation's project page) and `/models` (the chip's choice, for when the row is narrow). | S |

## D. Robustness

| # | Gap | Found | Proposed fix | Size |
|---|---|---|---|---|
| D1 | **Nothing checks that the install can do what it offers.** Python missing, git missing, no role models, an unreachable model server, an add-on that failed to load: each shows up only when a feature fails. | Checked: three failures this week (blank Data page, a run that could not step in PTC, a refused helper question) were found by the owner, not by a check. | A `/plus check` command and the same list on the overview page: it tries each dependency for real and says in one line what is fine and what is not. | M |
| D2 | **Eight add-ons have no tests.** Code power, Colour schemes, Context saver, Model router, Role prompts, Route health, Sampling presets, Usage. | Checked. | A small test file for each, covering its settings reader and its one main function. | M |
| D3 | **Pages are only tested by hand.** The blank Data page shipped because nobody opened it. The hook scan now catches that one mistake only. | Checked. | A lab script that opens every settings page and every project page, waits for its data, and fails if a page is empty or the app reports an error. Run it in the release check when the lab is available. | M |
| D4 | **Much is untested with a real model.** Plans, generated instructions, the adviser's tone, the chart check's message, the one-line PTC program. | Checked: each README lists it. | A short "real model" script the owner runs once per release on his own server: five fixed prompts, one per feature, with what to look for. Results go into the handoff notes. | S to write |
| D5 | **Removing Plus leaves data behind.** The private Python folder (about 450 MB), `.dsh-mission` folders in projects, presets, versions, the adviser's profile. | Checked: the uninstaller does not mention them. | The uninstaller lists what is left and where, with the sizes, and offers to remove the Python folder. It never touches project folders. | S |
| D6 | **A second Mac.** Whether Sync carries the newer data (presets, versions, mission settings, the adviser's profile) is not known. | To check. | Read what Sync includes, add what should travel, and say plainly what should not (the profile, by default). | S–M |
| D7 | **Mission: one item at a time, no browser checks.** Both were said at 0.37. | Checked. | Parallel workers only for items the planner marks as independent, in separate checkpoints. Browser checks as a kind of proof command once a browser tool is reachable from a command. Each needs its own design round. | L each |

## E. Documents

| # | Gap | Found | Proposed fix | Size |
|---|---|---|---|---|
| E1 | **`docs/ADD-ONS.md` is a history, not a description.** 619 lines of "Since 0.33", "Since 0.34" layers; a reader cannot see what a feature is today. | Checked. | The new guide (`docs/GUIDE.md`) is the description. Shorten ADD-ONS.md to one current section per add-on, or retire it in favour of the guide plus each add-on's README. | M |
| E2 | **Twenty-three READMEs still name app version rc.1.** | Checked. | One pass by script to the version they were last tested with. | S |
| E3 | **Some setting comments are out of date or missing.** For example `researchModel` still says it is for Deep research only; 113 nested settings have no comment, so the reference shows them without a description. | Checked by the guide's generator. | Fix as part of B2, since that page needs the same descriptions. | with B2 |
| E4 | **The README's first steps predate Finance, Data, Mission and project types.** | To check against the current text. | Rewrite "First steps" around the guide's Part 1. | S |

## Proposed order

Each step is small enough to build, test in the lab, and try in one sitting.

1. **Trust first:** D1 (`/plus check`) and D3 (the page-opening test). They would have caught this week's three failures before you did.
2. **Runs you can leave alone:** A1, A2, A3 (alerts, quiet Notify, budget), then B1 step 1 and 2 (permission chip, run card).
3. **One place per thing:** B3 with C3 (overview page), B2 with E3 (More settings), A8 (project "Runs" card).
4. **Shared tools for real:** A5 (tools without the tab), A10 (generator on every project), B7 (a line for the generator).
5. **Loose ends:** B4, B5, B6, C4, D5, D2.
6. **Bigger questions, each needs a decision from you first:** A4 (lessons from runs), A6 (the three memories), A7 (one tutor), C1 (languages), D7 (parallel workers, browser checks), E1 (retire ADD-ONS.md).

## Questions for the review

1. A7: should the Learning add-on stay a separate thing, or become the engine behind the Learn type?
2. C1: English only, or English and Chinese throughout?
3. A6: should what you tell the Finance adviser about yourself be available to other tabs, or stay in Finance?
4. B1: is a run card above the chat box the right home for a run's progress, or would you rather have it in the right-hand panel?
5. E1: may ADD-ONS.md be replaced by the guide?
