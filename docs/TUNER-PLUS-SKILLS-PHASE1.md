# Tuner Plus and skills: Phase 1 report (read only)

17 November 2026. This answers Phase 1 of your prompt "Tuner Plus: build prompt for adding skills". Nothing was changed: no code, settings, skills or stored data. The only new file is this report. Your Recon conversations and room were never opened.

## In short

- **Tuner Plus works today, and its own tests pass: 44 of 44.** That is the baseline every later step must match.
- **Tuner Plus has no skills part yet.** It touches skills in one place only: it lends its exam to Learned skills, which uses it before adding a skill.
- **Your harness has no skill maker in its settings.** The form you mean is Plus's **Settings → Learned skills**. It keeps its skills in its own list (one data file), not as skill files the harness reads by itself. So "one writer, one kind of file" cannot be met as written. Your first question below is about this.
- **The harness can see 36 skills today:** 5 Default, 20 Downloaded (17 of them come from your own Plus add-ons), 1 AI-made, 0 Mine, 10 Not sorted. No two share a name.
- **The harness cannot say which plugin a skill came from,** and it shows hidden skills (same name, losing place) nowhere. Tuner Plus can work both out itself.
- **A skill grants nothing,** in code, with two small exceptions found (below, under risks).
- Phase 2 can be built as a separate part of Tuner Plus with its own switch, keeping all its new data in a new folder, without changing the form of anything stored today.

## 1. The baseline

| What | Result |
| --- | --- |
| Tuner Plus's own tests (`addons/dsh-tuning`, 3 files) | **44 pass, 0 fail** (17 Nov, before any change). Output kept in the shared notes folder of this session group |
| Installed copy against the repository | The same, file for file (the installed copy has no test folder, as always) |
| Your settings for it (read only) | **Switched on.** Learning on from Code, Content, Research, Finance and Data, Bench, the work loop, corrections and other tabs; off from Creator Plus |
| Its stored data | **None yet.** Its folder (`~/.dsh/tuning`) does not exist: nothing has been gathered. Gathering runs when you press Gather now, or at night when the night shift is on (it is off) |

## 2. What exists, in short

### Tuner Plus as built

It is the add-on `addons/dsh-tuning`, version 0.1.0, a page in **Settings → Tuning Plus** (the page still says "Tuning Plus"). It has:

| Part | How it works today |
| --- | --- |
| The harvest | Cuts checked steps from your conversations and from Mission, Research, Content and Bench records into training rows. Each row carries its proof, the model that wrote it and a "may train" flag set by code. Secrets are masked first. It never reads Recon, a conversation that received a Recon export, their helpers, conversations marked "never learn from this", Self-improve's test runs or the trash. A conversation's newest turn waits 6 hours. Scratch conversations are read |
| The data sets | Rows grouped by job (harness tool calls, voice, standings, source grades, the router and others), each with counts and dates; any set can be written out as a file |
| The exam | 1 row in 5 goes to a private exam, chosen by code; exam rows never train. Plus 12 general "canary" tasks kept in Benchmark. A candidate must beat the exam by 5 points, lose no more than 2 points on the canaries, and get your yes |
| The ladder | Six rungs: fix the harness, instructions, example bank, tuned prompt, adapter, small specialist. It proposes the lowest rung that could help |
| The bar | On the page: Model, Goal, Data sets, Method, Budget, Look only (on by default), and the run in one sentence. Four chat tools do the same in plain words |
| The cards | Results under the bar, with Taste test, Promote, Not now and Do not suggest this again |
| The shelf | Adapters with their exam results; switch on and off in one action; a team role in Model Tiers can wear one |
| The night shift | Its own switch (off), only on power and after 15 idle minutes, stops when you use the Mac, never promotes anything |
| Lessons, questions, taste test | Worked examples of each plugin's tools; questions written from reference material and checked; a blind A/B test on your recent requests |

**Where it keeps things.** `~/.dsh/tuning/` (or a folder you set): `rows/<mode>.jsonl` and `exam/<mode>.jsonl` (one row per line, only added to), `sets.json`, `shelf.json` and `shelf/<id>/`, `cards.json`, `state.json`, and the folders `exports/`, `work/`, `lessons/`, `taste/`. Files are replaced only through a new file and a rename, never through a link. Its settings live in the `tuning` row of your profile's settings file.

**Does it touch skills today?** Only in three small ways:
1. Learned skills asks Tuner Plus's exam whether a new skill makes your work worse before adding it. The exam puts the skill's whole text in front of each exam task as instructions. It does **not** check whether the skill is loaded at the right moment.
2. It skips conversations you marked "never learn from this" on the Learned skills page.
3. Its ladder says rung 1 (instructions) lives in "Learned skills and Self-improve".

It has no skill list, no marks and no skill writer.

### Skills in your harness today

The public pages you quoted, checked against the app you run (0.2.2-rc.2):

| What public pages say | What your harness really does |
| --- | --- |
| Skills come from three folders | **Five folders**, in this order: the project's `.dsh/skills`, the project's `.agents/skills`, folders a preset adds (the standard preset, your default, adds the app's own `dsh-doc`), `~/.dsh/skills`, and the shared `~/.agents/skills`. "The project" is the nearest folder with `.git`, otherwise the conversation's folder. On your Mac `~/.dsh/skills` does not exist and no project has a `.dsh/skills`. **Four more kinds are not files:** the app's Office skills, skills that Plus add-ons register while they run, skills a plugin serves from its own package, and Learned skills' list |
| A plugin can bring its own skills | Yes. Of your plugins: six Plus add-ons (code map, code power, diagram, finance, PDF; learn is switched off) and one third-party plugin (`dsh-industry-research`, 2 skills). **The harness cannot say which plugin a skill came from.** Each skill carries a "provider" label that the plugin picks itself; all Plus skills say `runtime`. A file path, where there is one, is the only real clue |
| A folder with `SKILL.md`, or one `.md` file, with name and description at the top | Yes, placed directly in a folder above. Read: `name` and `description` (both needed), `whenToUse`, `metadata`, `disable-model-invocation`, `user-invocable`. Everything else is ignored. Names are lowercase words joined by hyphens. Older spellings of the two switches make the whole skill be dropped. A broken file is skipped with a log line only |
| When two skills share a name, one wins | Yes, but in two layers. Inside a layer the earlier folder wins. **A skill file always beats** an Office, Plus or Learned skill of the same name, whatever the order, silently. **Hidden skills are shown nowhere**, and there is no way to ask the harness for them |
| The model sees names and descriptions and loads the text when a job matches | Yes. One line per skill, `name: description`, sorted by name, each description cut at 500 characters, **no limit on how many**. It is re-sent when the set changes. The model loads a skill with the `skill` tool, by its own choice; you can force one by typing `/name`. Model Tiers can also put up to 6 skills' text into a tier's instructions |
| Skills are not fenced in | Right: nothing in the permission, sandbox or preset code reads a skill. Its text reaches the model as trusted text, but every action it leads to still meets the mode's tool list, the sandbox and the permission mode. A skill's scripts run only if the model runs them with the shell, under the same rules. Two exceptions, by skill name only, are under "What could go wrong" |

What the public pages do not say:

| Question | Answer |
| --- | --- |
| Every skill maker you have | **The harness has none.** Plus has one: **Learned skills** (`addons/dsh-skill-architect`). Its reading model (a model on this Mac by default) proposes skills from your conversations, and you accept them; or you add one by hand. It saves to `~/.dsh/skill-architect/library.json`, **not to skill files**, and serves them itself. The "skill creator" of your earlier feature plan *is* Learned skills, partly built (its README lists what was not built). Creator Plus neither writes nor checks skills. Any model in a chat can write a `SKILL.md` with the file tools where the sandbox allows; the app picks it up at once |
| What is recorded about a skill | Only Learned skills records anything: made by hand or learned, when, where it applies, up to 30 versions with the reason, deleted or not, and how often it was loaded. **Not** which model wrote it. Skill files have no record at all; the harness keeps no fingerprint |
| Switching skills on and off | Per skill: only the two switches inside the file. Per mode: all or nothing (a mode without the `skill` tool gets no list; Recon gets none). Per project: only Learned skills' "Start clean", for learned skills only. Per run: none. **No way to choose which skills a mode sees** |
| One-click "start clean" | **Not built as you asked.** Only the per-project switch on the Learned skills page exists; the one-click chat-box version is listed as "not built yet" in Learned skills' README |
| What an update does | A harness update replaces the Office skills and `dsh-doc`. A Plus install replaces the whole add-ons folder, so all Plus skills. A plugin update replaces that plugin's skills. Left alone: your own folders, project folders, the shared folder, and Learned skills' list. Other tools can write the shared `~/.agents/skills` at any time (one does: see the list) |
| Can an add-on add a tag and filter to the skills list in settings? | **There is no skills list in the harness's settings.** Plus's Cowork sidebar has a read-only Skills page with no seat for other add-ons. So Tuner Plus needs its own list (on its page), and the Cowork Skills page can show marks only if that add-on is changed |
| Does Recon load skills? | No. Recon's tab has no `skill` tool, and Modes drops the skill list there. One gap: see "What could go wrong" |

## 3. How Tuner Plus as built differs from its plan

**Built as planned:** the harvest for every mode the plan names, the exam (1 in 5, canaries, margin, your yes), the data sets, the bar with Look only and the run in one sentence, the exam gate on rungs 1 to 3, adapters trained only on this Mac, the shelf (switching, team roles, private, rebuild all), lessons, the voice, judge and fast goals, the night shift, the taste test, questions from reference material, rung 5.

**Built differently** (all written down on 17 November in `docs/TUNING-PLUS-T0.md` and `docs/OVERNIGHT-2026-11-17.md` for you to agree or undo):
- Not a tab: a Settings page, with the bar on the page and four chat tools.
- Your model server cannot load adapters, so an adapter is served as a fused copy or by mlx-lm's own small server.
- The taste test uses your recent past requests, not your next live ones.
- The night shift has its own schedule on the page, not in Automations. It proposes from the biggest set, not from the task the model fails most (the code for "weakest spot" exists but is not used).
- Your edits beside drafts are kept as preference pairs and can be written out, but are not trained yet.
- Only this Mac counts as "this Mac"; rows are never sent to a provider that did not already see them.

**Left out:**
- **Tuner Plus does not itself write instructions, an example bank or tuned prompts.** For rungs 0 to 3 it shows a card that points to Creator Plus, Learned skills, Self-improve or the Voice Library. Its shelf has room for "prompt" and "instructions" entries in its code, but nothing makes them. So "today it makes instructions, tuned prompts and adapters" is true only for adapters.
- A general example bank outside writing; retrieval for "Know a subject" (a card says to build it first); replaying whole sessions; an Automations entry.

**Added beyond the plan:** the "Count my own network's machines as this Mac" switch (off), the "teacher on the internet may read rows" switch (off), the 6-hour wait, limits (50,000 rows per file, 2 GB free to train, the newest 10 candidates, 30 days), the `tuning` service other add-ons call, the whole-folder check for Recon exports in Content, and Bench's and Recon's own tool turns never becoming rows.

## 4. Where each skill you have came from

Order of proof as you set it: the harness's own package, then a plugin's package or an install record, then a model seen writing it, then your own typing; otherwise Not sorted. A skill's own text never counts as proof.

### The 36 skills the harness can see

| Skill | Where it lives | Mark | How sure | Proof |
| --- | --- | --- | --- | --- |
| `office`, `office-docx`, `office-pptx`, `office-xlsx` | inside the app (`dsh-skill-office`) | Default | sure | inside the harness's own package |
| `dsh-doc` | inside the app (`dsh-agent-preset/skills`) | Default | sure | added by the harness's own standard preset (your default) |
| `company-research-method`, `industry-research-method` | the third-party plugin `dsh-industry-research` | Downloaded | sure | inside the plugin's package; the install lock file records it |
| `ego-browser` | `~/.agents/skills`, a link into the ego lite app | Downloaded | sure | the file lives inside another app; that app made the link on 17 Nov at 01:34 |
| `reverse-codebase`, `reverse-website`, `reverse-api-format`, `reverse-app-binary` | Plus: code map | Downloaded* | sure | inside a plugin package; the Plus installer's record lists the file |
| `finance-company-deep-dive`, `finance-earnings-review`, `finance-news-and-mood`, `finance-compare`, `finance-sector-scan`, `finance-economy-brief`, `finance-what-changed` | Plus: finance | Downloaded* | sure | same |
| `draw-diagram` | Plus: diagram | Downloaded* | sure | same |
| `read-pdf` | Plus: PDF reader | Downloaded* | sure | same |
| `pr-review`, `ci-fix-loop`, `best-of-n`, `hunk-review` | Plus: code power | Downloaded* | sure | same |
| `incremental-code-validation` | Learned skills' list (Code tab only) | AI-made | sure | its record says "learned": proposed by the reading model on 16 Nov, accepted by you the same night, never changed. Which model wrote it is not recorded |
| `copilot-fetch-x`, `copilot-read-pdf`, `copilot-web-fetch`, `copilot-web-search`, `copilot-youtube-transcript`, `json-canvas`, `obsidian-bases`, `obsidian-cli`, `obsidian-markdown`, `symposium-publish` | your NEXUS vault's `.agents/skills` (links to `NEXUS/copilot/skills`) | Not sorted | — | made on 29 Aug, before you used the harness. Hint only: they look like they came with the Obsidian Copilot plugin, but the only signs are the folder layout and their own text, which your rule does not count. They show only in conversations opened on the vault's top folder; five run scripts that need a paid Copilot licence |

\* These 17 are your own Plus add-ons, written for you by the coding chat. By your rule they count as Downloaded (they live inside a plugin package). You may want another mark for them; that is one of the questions.

**Mine: none.** "Add a skill by hand" on the Learned skills page has never been used, and there is no skill file of yours anywhere.

**Same name in two places: none today.** Near overlaps a loading check should cover: `read-pdf`, `copilot-read-pdf` and `office` (which also reads PDFs); the two Copilot web skills and the app's own web tools.

### On disk, but not seen by the harness today

| Skill | Mark | Why it is not seen |
| --- | --- | --- |
| `plugin-architect` | AI-made, sure | Written on 14 Nov by a model in one of your Code conversations (Ornith-1.5-122B, with the file tool) into an uninstalled plugin folder in the default workspace; no skills folder reaches it |
| `study-tutor` | Downloaded* | Plus Learn is switched off |
| `dsh-badge`, `personalized-pages`, `official-plugins` | Default | inside the app, in optional parts that are off |
| `diagnose-windows-sandbox-acl` | Default | Windows only |

`anatomy` and `find-skills` were installed on 10 Nov into `~/.claude/skills`, which belongs to Claude Code, not to the harness.

How the list was made: the harness's folders and providers were read; 553 conversation logs were searched only for file writes to a skills folder (time, tool, path and model printed, never message text); the 23 Recon conversations and Recon's room were skipped; 163 Scratch helper conversations whose parent could not be shown to be outside Recon were skipped too (none of them can be the source of a skill above).

## 5. How I propose to add skills

### Where the new part sits

A **skills part inside Tuner Plus, with its own switch, off by default**. Switched off, Tuner Plus runs exactly the code it runs today: the new part is not called, its tools are not offered, its page section is hidden, and it writes nothing.

New files only: `addons/dsh-tuning/lib/skills/` for the marks and records, the full list (with hidden skills worked out by Tuner Plus itself), the skill writer, the skill exam, health and proposals; and `test/skills.test.mjs`.

### What it reuses, as it is

| Existing part | Used for |
| --- | --- |
| The harvest's rules on what may be read | Skill ideas come from the same conversations, with the same switches and the same exclusions (Recon never, Scratch yes). No second set of rules |
| The masking | Every skill draft goes through it before it is stored |
| The exam (`examGate`, `runExam`, the canaries) | Check 2, "better with it than without it", is today's exam with the skill's text loaded. Check 1 (loads at the right moment) and check 3 (neighbours) are new |
| The cards and their buttons | Skill proposals are cards with the same buttons |
| The bar | One more goal ("build or improve a skill") and the new choices, shown only while the skills part is on |
| The night shift | Drafts and their exams at night, waiting as cards; it never switches a skill on |
| The "this Mac" rule | Your rows and requests go only to models allowed today |
| Learned skills' list (read only) | Its own record gives the mark of its skills: "learned" is AI-made, "by hand" is Mine, a learned skill you later edited on its page is Mine. Nothing in Learned skills is changed for this |

### Existing files it has to touch, and why

In Tuner Plus (all behind the new switch):

| File | Why |
| --- | --- |
| `addons/dsh-tuning/index.js` | One new switch and a setting for the two models of the loading check; start the skills part only when the switch is on; add the skills data and actions to the page's data route; offer the skill chat tools only when on; listen for a model's file writes to skill folders only when on |
| `addons/dsh-tuning/client.js` | A Skills section on the page (the list, marks, filter, counts, hidden skills, the "Not sorted" screen) and the new choices on the bar, drawn only when on |
| `addons/dsh-tuning/lib/ladder.js` | Add the "skill" goal and its place in the choice of homes. The six rungs and their numbers stay exactly as they are, because cards and the bar use those numbers |
| `addons/dsh-tuning/README.md`, `passport/` (brief, touches, tests, built-against, changelog), `package.json` (0.1.0 → 0.2.0), `locale/en.json` | The trail you asked for |

Not touched in Tuner Plus: `lib/store.js`, `lib/sets.js`, `lib/exam.js`, `lib/shelf.js`, `lib/harvest.js` and every stored file.

In other add-ons, **only if you say yes to each** (questions below): Learned skills (`addons/dsh-skill-architect`), the Cowork sidebar (`addons/dsh-cowork-shell`) and Modes (`addons/dsh-modes`). No harness file and no third-party add-on is ever edited.

### How the marks are set by code

| Mark | How code knows |
| --- | --- |
| Default | The skill comes from the app's Office provider or from a file inside the app |
| Downloaded | The file is inside a plugin's package or inside another app, or the skill is registered by plugin code while it runs (only plugin code can do that) |
| AI-made | Tuner Plus wrote it (it stamps the record at the moment of writing); or the harness reported that a model's file tool wrote it (the app announces each such write, and Tuner Plus stamps it with that conversation's model); or Learned skills' record says "learned" |
| Mine | Learned skills' record says "by hand", or a learned skill was later edited on its page |
| Not sorted | No record. Treated as Downloaded until you sort it; you are asked once |
| Changed (small mark) | Its text no longer matches the fingerprint taken when it arrived |

The record sits **beside** the skill, in Tuner Plus's own folder, tied to the skill's name, place and a fingerprint of its text. Nothing is written inside a skill file. The harness does allow a free `metadata` field in a skill, but a model can write that field too, so it can never prove an origin.

### Where new skills go

Tuner Plus writes ordinary skill files in the harness's own format (a folder with `SKILL.md`), so the harness reads them without Tuner Plus:
- "Everywhere": `~/.dsh/skills/<name>/SKILL.md` (the harness's own folder for you; it does not exist yet and would be created by the first skill).
- "This project": `<project>/.dsh/skills/<name>/SKILL.md`.
- Never the shared `~/.agents/skills` unless you ask, because other tools read and write it.

A name that already exists anywhere, including in Learned skills, the Office skills and the Plus skills, is refused unless you choose it, because a skill file silently hides all of those.

## 6. New data, and where

Everything new lives in one new folder, **`~/.dsh/tuning/skills/`**. Nothing is added to the files Tuner Plus keeps today.

| File | What it holds |
| --- | --- |
| `records.jsonl` | One line per event, only added to: a skill arrived (when, through which door, which model wrote it, what it was built from, what it is a copy of), changed, was re-sorted by you, was examined, retired |
| `marks.json` | The current mark of each skill, worked out from the records. If it or the records are lost, the skill shows Not sorted, never a wrong mark |
| `drafts/<id>/SKILL.md` | Skills waiting for your yes; outside every folder the harness reads, so a draft cannot load |
| `loadsets/<skill>.json` | The requests that should and should not load each skill (check 1) |
| `results/<id>.json` | Each exam's result |
| `health.json` | How often each skill was loaded and how the run ended, counted from the logs |
| `cards.json`, `shelf.json` | Skill cards and skill entries, kept apart from today's cards and shelf so that going back to today's Tuner Plus shows exactly what it shows now; the page shows both together |
| `retired/<name>/` | A retired skill, moved out of the harness's folders and kept |

Settings: two new fields in Tuner Plus's own settings (the switch, and the two models for the loading check). Today's fields are unchanged. Going back to today's version with these two fields still saved must be tested in Phase 2 step 1.

## 7. What cannot be done as asked, and the next best thing

| As asked | Why not | Next best |
| --- | --- | --- |
| "I can already create skills in the harness's settings; use the same writer and format" | The harness has no skill maker. Learned skills makes entries in its own list, not skill files | Your first question: pick the one kind (I recommend skill files) |
| "One list shows every skill, with the mark wherever skills are listed" | The harness's own lists (the `/` menu, the transcript row) have no place for a tag, and the harness has no skills list in settings | The full list with marks on Tuner Plus's page; also on the Cowork Skills page if you allow that change |
| "The harness can say which plugin a skill came from" | It cannot; each plugin picks its own label | Code still knows *that* a plugin brought it (Downloaded). Which plugin is known where a file path shows it; for Plus skills, Tuner Plus can match the name against the Plus add-ons' own files |
| "Show which same-name skills are hidden" | The harness hides them silently and offers no way to ask | Tuner Plus reads the folders and providers itself and applies the harness's own order |
| "Every door stamps", including a skill written by the shell or by another app | Only the app's own file tools announce a write. The shell, other apps (ego lite rewrites the shared folder on each of its updates) and the coding chat leave nothing | Those show as Not sorted, or as Changed, and you are asked once. Tuner Plus also looks at fingerprints when it starts and on each page visit |
| "An AI-made skill I edited by hand is Mine" | For a skill *file*, code sees that it changed, but not who changed it | Learned skills' page edits are known to be yours. For files, a change with no model write behind it shows as Changed and you are asked |
| "Limit which skills a mode sees" | The harness can only give a mode all skills or none | Measure the list per mode and show the cost. Choosing skills per mode would need a change to Modes, which Creator Plus guards as a safety add-on: a question below |
| "One-click start clean" | Not built; only Learned skills' per-project switch exists | Keep it; ask whether to build the one-click version as its own step |
| "Make this change through Creator Plus" | Creator Plus runs inside the app with a model; this coding chat cannot drive it | Build by hand following Creator Plus's handbook, run its own fit check on the change, and update the passport, version and changelog |
| "Retire means switch off and keep; deleting follows the harness's own trash" | The harness has no trash for skills | Retire moves the skill into `retired/` (kept); delete goes to the Cowork trash with Put back, as other Plus pages do |
| Tuner Plus "today makes instructions and tuned prompts" | It only points to Learned skills and Self-improve for those | Skills are the first thing other than adapters that Tuner Plus would write itself |

## 8. What could go wrong for what works today

| Risk | What protects against it |
| --- | --- |
| A change in `index.js` or `client.js` breaks the harvest, the exam, the shelf or the night shift | The skills part is called only when its switch is on; all 44 tests must pass the same way after every step; new tests for the off switch |
| The first skill file in `~/.dsh/skills` hides an existing skill of the same name in every conversation | Names that exist anywhere are refused; nothing goes live without the three checks and your yes |
| Watching file writes slows down every file write in every chat | Only while the switch is on, and only a path check, which can never stop a write or throw |
| A model forges its own mark | Records live in Tuner Plus's folder, outside the project folders where models normally write; a record that does not match its fingerprint counts as Not sorted, never as a better mark. In a mode with full disk access a determined model could still delete records, which only makes a skill Not sorted. A guard that refuses writes into Tuner Plus's folder is possible and will be shown to you before it is built |
| A longer skill list makes every request longer, and a small model picks worse | Every new skill's description is measured; the list per mode is shown |
| Going back to today's version | Today's installer keeps your settings backup but deletes the old add-on files after a good install. The way back for the code is the repository (commit `2743522` holds today's Tuner Plus) and a reinstall. Phase 2 step 1 makes it one action and tests it |
| Your own edits in the installed copy | None today (checked). Before any install, the installed copy is compared again, because an install replaces it |

Two findings about what works today (not caused by this work, not fixed in Phase 1):

1. **A skill can unlock Office tools by its name.** Loading a skill named `office`, `office-docx`, `office-xlsx` or `office-pptx` unlocks the app's Office tools, and Plus Modes adds the Office tool family when a skill whose name starts with `office` loads. Only tools the mode already allows, but a skill file with one of those names would hide the app's own and still unlock them. The name check above prevents Tuner Plus from ever writing such a name.
2. **Typing `/skill-name` in a Recon chat would probably insert that skill's text.** The harness inserts it without checking whether the tab offers the `skill` tool, and Modes' Recon filter drops the skill list but not that insert. Found by reading the code, not tested. It happens only by your own typing.

A third, smaller one: Learned skills checks that a new skill does not take an existing name, but it does not see skill files. A skill file of the same name in a project or the shared folder would silently hide the learned skill.

## 9. My questions for you, one at a time

I ask the first one now; each later one waits for the answer before it.

1. **The one kind of skill.** Today a skill from Settings → Learned skills is an entry in Learned skills' own list, not a file the harness reads by itself, and the harness has no skill maker of its own. Which kind should be the one kind?
   - **A. Skill files (recommended).** Tuner Plus writes ordinary skill files that the harness reads on its own, so they keep working without Tuner Plus or Learned skills. Learned skills stays exactly as it is for now, so there are two kinds until you choose, as a separate step, to let Learned skills save files too.
   - **B. Learned skills' list.** Tuner Plus hands each skill to Learned skills. One kind at once, but every such skill stops working if Learned skills is switched off or removed, and Learned skills has to be changed to accept them.
   - **C. Files for both, now.** Like A, and Learned skills is changed in the same step to save files and to move its current skill into a file. One kind at once, with the biggest change to something that works today.
2. Where Tuner Plus's skills go by default: `~/.dsh/skills` (everywhere) or the project's `.dsh/skills`, asked each time as you wrote; and never `~/.agents/skills` unless you ask.
3. The 17 skills from your own Plus add-ons, and plugin skills in general: Downloaded, or a mark of their own (for example "Plus" or "Plugin")?
4. May the Cowork sidebar's Skills page show the marks too (a change to that add-on)?
5. Where "skill" sits among the homes: right after Instructions (my recommendation), keeping the six rung numbers as they are.
6. Choosing skills per mode needs a change to Modes, which Creator Plus guards: leave it out for now, or plan it as a separate step?
7. The Recon `/skill-name` gap and the Office-name unlock: fix them in Modes as a safety fix, as a separate step?
8. Learned skills' name check that misses skill files: fix it, as a separate step?
9. Building by hand following Creator Plus's handbook and its fit check, since this chat cannot drive Creator Plus: is that all right?
10. The page still says "Tuning Plus": rename what you see to "Tuner Plus"? (Only words on the page; nothing stored changes.)
11. The seven fixed rules in your prompt, one at a time.
12. The way back: keep a saved copy of today's Tuner Plus (0.1.0) that one action reinstalls, with your data untouched?

### Your answers so far

Where an answer below differs from the proposal in sections 5 to 8 (for example the sixth mark, Plus), the answer wins.

| # | Question | Your answer | What it leads to |
| --- | --- | --- | --- |
| 1 | The one kind of skill | **A: skill files** (17 Nov) | Tuner Plus writes ordinary skill files (a folder with `SKILL.md`) that the harness reads by itself. Learned skills stays exactly as it is; letting it save files too is offered later as its own step |
| 2 | Where a new skill goes | **This project**, pre-picked (17 Nov) | Tuner Plus still asks for every skill. "This project" is pre-picked and writes to the project's `.dsh/skills`; the card warns when the project is a git repository (the file would show among its changes). In the default workspace only "everywhere" (`~/.dsh/skills`) is offered. Never `~/.agents/skills` unless asked |
| 3 | The mark for skills that come inside a plugin | **Their own mark, "Plus"**, for skills from the owner's Plus add-ons (17 Nov) | A sixth mark, Plus: code gives it when a skill's text matches a file in the Plus add-ons' folder exactly. Never edited in place (as Downloaded). An improvement is proposed as a change to the add-on itself through Creator Plus, otherwise as a copy he owns. Third-party plugin skills stay Downloaded |
| 4 | Marks on the Cowork sidebar's Skills page | **Yes, as a later step** (17 Nov) | After the list on Tuner Plus's page works: a mark beside each name and a filter by mark, asked from Tuner Plus's service; with the skills part off or Tuner Plus absent the page looks exactly as today. Only the Skills page's code in `addons/dsh-cowork-shell` is changed (it also draws the whole sidebar), tested in the lab copy first |
| 5 | Where "skill" sits on the ladder | **After Instructions, numbers kept** (17 Nov) | "Skill" is shown between rung 1 (instructions) and rung 2 (example bank); the six rung numbers, the cards and the bar's Method choice keep their meaning. A skill is proposed when failures belong to one kind of job needed only sometimes; instructions when the rule always applies |
| 6 | Choosing which skills each mode sees | **A separate later step** (17 Nov) | Tuner Plus measures the skill list per tab and shows its cost from the start. Choosing skills per tab is built at the end, once the measurements show it is worth it, as its own change to `addons/dsh-modes` (guarded by Creator Plus because it keeps Recon sealed): plan shown first, Recon's tests before and after, an independent review |
| 7 | The Recon `/skill-name` gap and the Office-name unlock | **Fix as their own step** (17 Nov), apart from the skills work and possibly before it | Recon: first confirmed in the lab copy (never in the owner's Recon); if real, Modes also blocks the skill insert in isolated conversations; Recon's tests before and after, an independent review. Office: Modes adds the Office tool family only when the loaded skill really comes from the app; Tuner Plus's list flags any non-app skill with an `office…` name, and Tuner Plus never writes one |
| 8 | Learned skills' name check misses skill files | **Fix it** (17 Nov) | In the step where Tuner Plus starts writing skill files: Learned skills (`addons/dsh-skill-architect`) also checks the skill files in every folder where the new skill would be offered and refuses a taken name, as it does for the others; its own tests before and after |
| 9 | How the change is built | **By hand, the Creator Plus way** (17 Nov). In the owner's words: "Built it just like you do and let Creator mode to deal with plugins I build directly with it." | The coding chat builds in the Plus folder following Creator Plus's handbook (tests first, its four checks, its fit check run on the change), updates Tuner Plus's passport and raises its version to 0.2.0. Creator Plus stays for the plugins the owner builds with it himself |
| 10 | The name he sees | **Rename everywhere** (17 Nov), as a small step of its own | Every visible "Tuning Plus" becomes "Tuner Plus": Tuner Plus's page, messages, cards, README and locale; Self-improve's exam gate lines (`dsh-evolve`); the adapter field in Model Tiers (`dsh-model-tiers/client.js`); Learned skills' texts (`dsh-skill-architect`). Inner names stay (`dsh-tuning`, settings `tuning`, `~/.dsh/tuning`, service `tuning`), so nothing stored or connected changes. Code comments are left. Each touched add-on's tests before and after |
| Rule 1 | "No skill is switched on, changed or retired without my yes" | **Fixed, and wider: "Yes, both"** (17 Nov) | Tuner Plus keeps drafts outside every folder the harness reads; only his click on the page or the app's approval card moves a skill in. Also, while the skills part is on, a model's file tools writing into any skills folder get the app's approval card first (every tab). Not catchable beforehand: shell writes and other apps; those show on the list as Not sorted or AI-made, with a card |
| Rule 2 | "Code sets the origin mark … only I can re-sort one by hand" | **Fixed as written** (17 Nov) | Marks come only from code, from how a skill arrived; a skill's own text never counts. Records sit in Tuner Plus's folder; the file-tool guard of rule 1 also keeps models out of it; re-sorting only by a page button, recorded. Limit written down: in Code a model can write only in the project folder, so it cannot reach the records; Cowork follows the app's own permission setting, and where a model's shell could change the records, Tuner Plus notices a change it did not make, shows the affected skills as Not sorted and tells him (a tampered record only loses a mark) |
| Rule 3 | "Default and Downloaded skills are never edited in place. A change is always a copy that I own" | **Fixed; the copy takes the same name** (17 Nov) | Covers Default, Downloaded, Plus and Not sorted skills. The copy is his, marked AI-made, its record names the original and its version; he is told when the original changes. The copy has the original's name and goes in a folder that wins, so the model sees only the copy; the list shows the original as "hidden behind your copy"; removing the copy brings the original back. The only case where Tuner Plus hides a skill on purpose, and only on his yes on the card |
| Rule 4 | "A skill I wrote or edited by hand is never changed without asking me, each time" | **Fixed as written** (17 Nov) | His skills: added by hand on the Learned skills page, a learned skill he edited there, and a skill file that changed with no model behind it once he confirms the edit was his. Every change (improve, merge, split, retire) is a card with before, after and the exam; nothing is written until his yes on that card; no standing permission. The night shift and chat tools never change one. Learned skills keeps its current behaviour (it never changes a skill by itself) |
| Rule 5 | "A skill cannot widen what a mode or a permission mode allows" | **Fixed as written** (17 Nov) | Already true in the harness and Modes (no permission, tool list or sandbox reads a skill), apart from the two gaps of answer 7, fixed in their own step. Tuner Plus never writes a skill whose name unlocks tools, and runs the "No wider" test in the lab copy; a hole found there stops the work and is reported as a finding about the harness |
| Rule 6 | "Recon is never read for skills. Nothing from signed-in sources or personal folders goes into one" | **Fixed, with one exception: "Yes, when I point"** (17 Nov) | Skill ideas follow Tuner Plus's harvest rules (never Recon, Recon exports or their helpers; connector tools are signed-in sources; Scratch is read). Exception: material he points at himself, even in his own folders, may be used for that one skill; it is masked first, the skill is marked "built from outside material" with its source, and he reads it in full before it can be used. Nothing else in his folders is read; Recon and signed-in sources have no exception |
| Rule 7 | "With the skills part switched off, Tuner Plus behaves as it did before. Its stored data is never converted without a backup and a way back" | **Fixed as written** (17 Nov) | The skills part has its own switch, off at first; while off, nothing new runs, no new tools, no approval card for skill writes, no marks on the Cowork Skills page, nothing new written; proven by today's 44 tests plus new off-switch tests. No stored data is converted: new data in one new folder; two new settings fields beside the existing ones. Any unavoidable conversion: asked first, backed up, convert and convert-back tested on a copy. Noted: three changes apply whether the part is on or off, each its own step with tests: the name "Tuner Plus", the Recon and Office fixes in Modes, Learned skills' fuller name check |
| 12 | The way back | **Tuner Plus alone** (17 Nov) | Before the first change, today's Tuner Plus (0.1.0) is saved. One double-click file in the Plus folder (like Install.command, asking him to quit the app first) puts it back in place of the new one. His data stays where it is; skill files Tuner Plus made keep working (the harness reads them by itself); the other steps (rename elsewhere, Recon and Office fixes, Learned skills' name check) stay. Proven in the lab copy as the first step of Phase 2 |

All questions are answered. Question 11 was the seven fixed rules, answered one at a time above.

## 10. Phase 2, in the order agreed

Each step works by itself; Tuner Plus's 44 tests must pass the same way after every step; nothing is installed, committed or pushed unless you ask.

| Step | What is built | Size |
| --- | --- | --- |
| 1 | The baseline recorded again, the lab copy, and the way back for Tuner Plus alone, shown to work | M |
| 2 | Its own safety step: the Recon `/skill-name` gap checked in the lab copy and, if real, fixed in Modes; the Office-name unlock tied to the app's own skills | M |
| 3 | The name "Tuner Plus" everywhere you see it | M |
| 4 | Records and marks (Default, Downloaded, Plus, AI-made, Mine, Not sorted, and Changed): fingerprints, the stamp at Tuner Plus's own door and at a model's file writes (with the approval card of rule 1), Learned skills' records read, the first sorting of your 36 skills, and the screen for Not sorted | L |
| 5 | The list on Tuner Plus's page: marks, filter, counts, and which skill wins a shared name | M |
| 6 | Tuner Plus writes skill files ("this project" pre-picked, or everywhere), with the name rule; Learned skills' name check fixed in the same step | M |
| 7 | The skill exam: loading, with and without, neighbours; the health report with Look only | L |
| 8 | Skill ideas from the harvest and from plain chat, as cards; "skill" on the ladder after Instructions | L |
| 9 | The bar: the new goal, the skills list, the run types, the selection enforced by code | M |
| 10 | Looking after skills: improve, merge, split, retire; copies under the same name; the list size per tab measured | L |
| 11 | The check after an update | M |
| 12 | Night-shift drafts | M |
| 13 | Marks on the Cowork sidebar's Skills page | M |
| 14 | Choosing skills per tab in Modes (plan shown to you first) | M |
| 15 | Skill first, adapter later (asked again before it is built) | M |
| 16 | All tests, the changelog, the passport, `docs/HANDOFF.md` and `docs/MODES-AND-SETTINGS.md` | M |

## 11. Phase 2 progress

You said go on 17 November.

### Step 1: the baseline, the lab copy and the way back (done)

**Baseline, before any change** (all pass):

| Add-on | Tests |
| --- | --- |
| Tuner Plus (`dsh-tuning`) | 44 |
| Learned skills (`dsh-skill-architect`) | 15 |
| Modes | 116 |
| Recon | 104 |
| Self-improve (`dsh-evolve`) | 32 |
| Model Tiers | 28 |
| Cowork sidebar (`dsh-cowork-shell`) | 133 |
| Creator Plus | 57 |

**The way back**, built and shown to work:
- `extras/way-back/dsh-tuning-0.1.0/` is today's Tuner Plus, taken from the project history (commit `2743522`). It is the same, file for file, as the copy installed in your app now. A fingerprint list sits beside it, and a short README says what it is.
- **Tuner Plus Way Back.command** in the Plus folder, with `scripts/tuner-way-back.sh` behind it, puts that copy back in one action. It asks you to quit the app first, backs up the newer Tuner Plus and the setup files, swaps the folder and checks the result. It puts the old one back on any failure.
- It never touches Tuner Plus's data, your settings or any other add-on. It also keeps the installer's record right, so the next install does not mistake Tuner Plus's files for your own edits.
- Today's Tuner Plus ignores settings it does not know, so the new switch can stay in your settings after going back. This was checked in code and in the lab.

**Proved in a throwaway lab copy** (a fresh app-data folder in `/tmp`, never `~/.dsh`):
1. Plus was installed there, then a pretend newer Tuner Plus was put in place. Made-up rows, exam, sets, shelf, cards and skill records were added, plus a skill file "made by Tuner Plus" and the new settings fields.
2. The way back passed 12 checks:
   - Tuner Plus is exactly 0.1.0, identical to the copy in your app.
   - Its data, the settings and the add-on list are unchanged.
   - The skill file is still there.
   - Another add-on, with a made-up edit of yours, is untouched, and the installer still reports only that edit.
   - The newer Tuner Plus and the setup files are in the backup, and no leftovers remain.
3. A hand edit inside the newer Tuner Plus is named and kept in the backup. A damaged saved copy is refused, and nothing changes.
4. The throwaway app was started with the way back in place:
   - Tuner Plus loaded with the unknown settings, and its page showed "On", the exam row and the shelf entry.
   - The app listed the skill file Tuner Plus "made", although today's Tuner Plus knows nothing of skills.
   - The throwaway app was then stopped by its exact process number.
5. The full check (`scripts/check.sh`) now rehearses the way back on every run. It passed in full on 17 November: 40 add-on test suites, every page, install, update, uninstall and the way back.
6. The check's very first question to the app (its version) is now asked inside a throwaway folder. Before, it was asked in your real app folder; it never created anything there, which was checked, but your rule is that every such call uses a throwaway folder.

Files changed or added in step 1:
- added: `Tuner Plus Way Back.command`, `scripts/tuner-way-back.sh`, `extras/way-back/`;
- changed: `scripts/check.sh` (the rehearsal and the throwaway version check), `scripts/build-dmg.sh` (the new file stays double-clickable in the download), `docs/HANDOFF.md` (one entry).

No add-on's code was changed in step 1.

**A mistake during step 1: your real Recon room was emptied.**
- When I started the throwaway app at 14:36:00, its copy of Recon emptied your real Recon room, `/private/tmp/dsh-recon-room`. The room folder's own timestamp changed at 14:36:01; only its times were looked at, never its contents.
- Recon empties its room whenever it loads, even while switched off. Without the setting `DSH_RECON_ROOM`, the room is your real one, whatever data folder the app uses.
- The handoff notes recorded this, but only inside a long entry, and I missed it.
- What it touched: only the working files in that folder, the folder Recon itself empties at every app start and on "End and wipe". Your Recon conversations, settings and research log are kept elsewhere and were not touched.
- What could be lost: working files of a Recon conversation that was running at 14:36, for example a Long run's files.
- Done since: the rule is now at the top of the lab instructions in `docs/HANDOFF.md` and in my notes for future sessions. A fix in Recon's code, so no lab can ever do this again, is proposed to you in step 2.

**Found while proving it** (not changed): today's Tuner Plus page goes blank if a shelf entry lacks its list of sets. Tuner Plus itself always writes that list, so this can only happen with a hand-made or damaged `shelf.json`. Noted for the step that touches the page.

### Step 2: the Recon and Office safety step, and the room guard

**Three fixes**, each with tests that fail without it (checked by undoing each fix once):

| Fix | Where | What changed |
| --- | --- | --- |
| A test copy never touches your real Recon room | `addons/dsh-recon/index.js` (`roomFrom`, `testCopyRoom`, `mayEmptyRoom`) | Recon uses your real room only when the app runs on your real data folder (`~/.dsh`). A copy started on another data folder gets a room of its own, `/private/tmp/dsh-recon-copy-<12 letters>`. If a data folder was set some other way, Recon still refuses to empty the real room. Your real app behaves exactly as before |
| Typing `/skill-name` in a Recon chat no longer brings the skill in | `addons/dsh-modes/lib/isolation.js` | The skill's text the app adds is now stripped from Recon conversations, like the skill list already was. Other tabs are unchanged |
| Only the app's own Office skills bring the Office tools | `addons/dsh-modes/lib/trim.js`, `index.js` | A skill named `office…` adds the Office tools only when the app itself served it from its own package. A file of the same name in a project or the shared folder adds nothing |

**Lab, before and after** (a throwaway app with its own Recon room and a stand-in model; your real room was checked by its time only and stayed at 14:36:01):

| Check | Before the fix | After the fix |
| --- | --- | --- |
| `/lab-probe` typed in a Recon chat | the skill's text reached the model | it did not |
| the same in Cowork | — | it did, as it should |
| made-up `AGENTS.md` instructions | — | reached Cowork, not Recon (this protection already worked) |
| the app's own `office` skill loaded in Cowork | — | the Office tools came (no harm to your Office skills) |
| a made-up skill file named `office` loaded in Cowork | — | its text loaded, and no Office tools came |

**Known and unchanged:** a short note describing the session still reaches Recon. It says the Recon room's folder, the file policy, where the app is installed and the app window's local address. The app adds it after Modes' filter runs, and this was already written down in `docs/MODES-AND-SETTINGS.md`.

**The independent review** (a separate reviewer who got the code and the rules, not my conclusions) found eight points. What became of each:

| # | Finding | Outcome |
| --- | --- | --- |
| 1 | The way back refused every time when double-clicked: lists were compared in an order that depends on the Terminal's language, and my tests had run without one | **Fixed.** Both lists are now sorted the same way at the moment they are compared, and the installer's record keeps the order the installer gave it (a first version of the fix re-sorted it; the full check caught that). Re-tested with your Terminal's setting (`en_US.UTF-8`): 10 checks pass, including a reinstall afterwards that reports no false hand edits. The installer's own hand-edit check had the same weakness and is fixed the same way |
| 2 | The skill's text might still reach Recon, if Modes' filter ran before the app adds it | **Not a problem in practice.** The lab showed the text before the fix and not after, with Cowork unchanged. The unit test alone cannot prove the order, so the lab result is the proof |
| 3 | A test copy started with a moved home folder (`HOME`) could still empty the real room | **Fixed:** the usual data folder is now the account's own home, whatever `HOME` says. Test added |
| 4 | Recon read `DSH_HOME` a little differently from the app (spaces, `~`); and when the second lock refused, conversations still ran in the real room | **Fixed:** Recon now reads it exactly as the app does. Once the app reports another data folder, Recon switches to a room of its own for good. A refused `DSH_RECON_ROOM` also gets a room of its own, never the real one. Tests added |
| 5 | Typing `/office-pptx` still brings the Office tools by its words; the folder line could be imitated by an unusual kind of skill | **Kept on purpose:** words in your own message add tool families (an existing, documented feature). **Fixed:** only the first line the app writes is read, and only when it names a folder. Test added |
| 6 | An interruption at the wrong moment could delete the installed Tuner Plus | **Fixed:** the installed folder is only removed when the old one is safely aside; the installer's record is backed up and put back too |
| 7 | The installer recognised your real data folder by its spelling only | **Fixed:** it now compares real paths |
| 8 | Learned skills knows only the real room's name | **Planned:** fixed in the Learned skills step (step 6) |

Every fix was checked by undoing it once: a test failed each time.

**Tests now:** Modes 119 (116 before), Recon 109 (104 before), all passing. The add-ons' passports, READMEs and `docs/MODES-AND-SETTINGS.md` are updated. Also changed by the review: `scripts/install.sh` and `scripts/common.sh` (fixes 1 and 7).

### Step 3: the name Tuner Plus (done)

Every place you see the name now says **Tuner Plus**:
- the Settings list and the page;
- its messages, cards and the descriptions of its chat tools;
- the Plugins list;
- its README;
- Self-improve's exam lines ("Not worse on your own exam (Tuner Plus)");
- the adapter field on a team member in Model Tiers;
- Learned skills' exam texts.

What stays the same:
- The inner names (`dsh-tuning`, the settings `tuning`, the folder `~/.dsh/tuning`, the service and the `tuning_…` tools), so your data and settings stay where they are.
- Code notes, and the plan's own title.

The README says it was called Tuning Plus until today.

- **Tests:** Tuner Plus 44, Self-improve 32, Model Tiers 28 and Learned skills 15, the same counts as before. One Learned skills test checked the exact old words and now checks the new ones.
- **Lab:** in a throwaway copy with its own Recon room, the Settings list, the page heading and the Plugins list say "Tuner Plus"; "Tuning Plus" appears nowhere.
- **Full check:** passes.
- **Changed:** 18 files in four add-ons, plus their changelogs. The way back still puts back 0.1.0, which keeps the old name.

### Step 4: records and marks (done)

**What you get** (Tuner Plus 0.2.0, in **Settings → Tuner Plus → Skills**, behind its own switch **Skills part**, which starts off):
- **Every skill the app can see, with its mark:** Default, Downloaded, Plus, AI-made, Mine or Not sorted, plus a small **Changed** mark, and a count for each.
  - Code sets each mark from where the skill lives, who serves it and the record of how it arrived. A skill's own words count for nothing.
- **The doors.** In every tab, a model that writes into a skills folder with its file tools makes the app show its own approval card first, and only after every other rule has allowed the write.
  - A helper is refused.
  - When the write happens, the skill is stamped AI-made with the model that wrote it.
  - A model may never write into Tuner Plus's own folder (the record) or into Learned skills' list.
- **The record**, beside the skills and never inside one, only ever added to and chained line by line.
  - If anyone else changes it, stamps and sortings stop counting (skills can only lose marks) until you start a new record on the page.
- **Sorting by hand:** tick several skills and choose their mark. Skills nobody can place are listed first, and a card asks you once.
- **Off:** while the switch is off, nothing of it runs, writes or asks.

**Lab** (a throwaway copy with its own Recon room; never your default workspace, which was checked):
1. A stand-in model asked to write a skill brought up the approval card. The card names the skill's folder.
2. After "Allow once", the skill was stamped AI-made by `mock-pro/mock-big`.
3. The page then listed 19 skills: Default 5, Downloaded 1 (`ego-browser`), Plus 11, AI-made 1, Not sorted 1, the stray folder.
4. Sorting it as Mine from the page worked.

The lab found two faults, both fixed: the card named the shared Scratch folder instead of the conversation's own one, and the list missed skills in a conversation's own folder.

**The independent review** found 13 points. All are fixed, each with a test that fails without the fix:
- **High:**
  - an indented patch header, or a `~/…` path, got past the doors;
  - a record changed from outside became trusted again after Tuner Plus's next write.
- **Medium:**
  - a Recon conversation could be stamped and its room listed;
  - a model could rewrite Learned skills' list;
  - your sorting always beat a newer stamp (now the newest wins);
  - following a skill by its fingerprint was too loose;
  - "Default" trusted a provider's name;
  - "Plus" counted any name in an add-on's code.
- **Low:**
  - how the final guard was registered;
  - "Not now" on the card did not stick;
  - which folders are listed first;
  - only `SKILL.md` was fingerprinted (now the whole folder);
  - the card could show for a write another rule then refused.

**Limits written down:**
- Writes through the shell or by other apps are not caught: those skills show Not sorted or Changed.
- In the Cowork tab, a model with full disk access could change the record. Its skills then lose their marks; they never gain better ones.
- The harness cannot say which plugin registered a skill. Plus is read from the add-ons' own skill objects.

**Tests:** Tuner Plus 61 (44 before, unchanged, plus 17 new). Its version, passport, README and changelog are updated.

### Step 5: the full list (done)

- **Filter by mark.** The Skills list on Tuner Plus's page now has buttons: All, Default, Downloaded, Plus, AI-made, Mine, Not sorted, and **Shared names**, each with its count.
- **Same name, two places.** The app gives the model one skill of a name, hides the others and shows them nowhere. Tuner Plus reads the skills folders itself, the way the app does, and compares with the one the app says wins:
  - the winner says "The model gets this one; it hides N other skills of the same name";
  - each hidden skill carries a small "Hidden" mark and says what it is hidden behind, and in which project.
- **Lab** (a throwaway copy, its own Recon room):
  - a made-up skill file named `read-pdf` was dropped in;
  - the list showed it as the one the model gets, with the Plus PDF reader's `read-pdf` hidden behind it in both places;
  - the app's own skill list confirmed the made-up file is the one it uses;
  - the lab found that a skill hidden in two places was counted twice; fixed, so each hidden skill counts once.
- **Tests:** Tuner Plus 63, all passing. Each rule of the finder was undone once, and a test failed each time.
- Step 5 only reads folders and adds no new door, so it had no separate independent review.

**What it shows on your Mac today:** no two of your skills share a name (the Phase 1 list), so "Shared names" will show 0 until one does.

### Step 6: Tuner Plus writes skill files, and Learned skills' name check (done)

- **A New skill form** on Tuner Plus's page (under Skills, once the skills part is on): a name, one line saying when it helps, the text, and where it goes.
  - **This project** is picked first (the projects offered are the folders your conversations work in; a warning shows when the project is a git repository, since a skill there can end up in it). **Everywhere** is the app's own `~/.dsh/skills`.
  - Never the shared `~/.agents/skills`, never your default workspace (there only "everywhere"), never a Recon room.
- **Drafts first.** Saving keeps the skill as a draft in Tuner Plus's own folder, where the app does not load it. A draft can be dropped. **No draft goes live yet:** going live waits for its exam, which is step 7. A model's draft never goes live without the exam.
- **Going live** writes one ordinary skill file in the app's own format (a folder with `SKILL.md`), which the app reads by itself, so it works without Tuner Plus. It is stamped in the record: Mine for one you typed, AI-made for one a model wrote.
- **Names.** The app's own rule (lowercase words joined by hyphens). Refused: a name any skill already has (the app's, Plus's, plugins', skill files, hidden ones, Learned skills' including deleted ones, other drafts), and names starting with `office` (loading one switches on the Office tools). Checked again when it goes live.
- **Secrets** are masked before anything is kept; a password or key the masking cannot judge stops the save.
- **Learned skills' name check** (your answer 8): a learned skill can no longer take a name a skill file has where it would be offered. The check asks the app afresh each time, covers Scratch conversations' own folders, and a deleted learned skill cannot be brought back over a name that is taken meanwhile. It also knows every Recon room (a test copy's too), which closes the last point of step 2's review.
- **Lab** (a throwaway copy, its own Recon room): a draft was saved with a made-up password masked; the names `read-pdf` and `office-notes` were refused; Put it live was refused (waiting for the exam); Drop worked; no skill file was written anywhere.
- **Independent review:** 12 findings, all fixed, each with a test: names written in quotes (so a name like "true" stays a name); only projects the page offered; no name counted as free when a skill list could not be read; the shared folder and default workspace checked both ways; something of that name in other capitals, or a file where a folder must be, stops the save at once; one draft at a time (a double click makes one); a save that fails keeps what you typed; longer texts fit.
- **Tests:** Tuner Plus 69, Learned skills 17, all passing. Each new rule was undone once, and a test failed each time (18 of 18).

**What changes on your Mac:** nothing until you install and switch the skills part on. Then the form makes drafts only; nothing goes into a skills folder before step 7.

### Step 7: the skill exam, and the health check (done)

- **Two models, picked under "The skill exam" on Tuner Plus's page.** The **floor model** must run on this Mac: your held-back tasks never leave it. The **strong model** may be any model. The pickers list the app's own models.
- **A draft goes live only when all of these hold:**
  - it passed its exam, for that very text;
  - you showed its whole text on its card ("Show its text"; the showing is recorded);
  - you clicked "Put it live".
  A failed exam always stops it.
- **Check 1, loading.**
  - The strong model writes six requests that should load the skill and six that should not, with near misses in both.
  - It reads the skill's text only when it runs on this Mac. Requests written from the text are never sent later to a strong model elsewhere: they are written again from the name and description.
  - Both models are asked which skills they would load, with the skill list written exactly as the app writes it (one line per skill, cut at 500 characters).
  - **To pass**, on each model it must load on at least four of the six right requests, and on at most one of the six wrong ones.
  - A request that names the skill is dropped. A skill name used in a sentence does not count as loading.
- **Check 2, with and without.**
  - The floor model answers your held-back tasks of this kind (the ones it would load the skill for) with the skill's text and without it, each marked by its own check. The general canaries are run too.
  - The rule is Tuner Plus's own: at least ten such tasks, better by a clear margin, and not worse on the canaries.
  - The card shows answers and tokens for both runs.
- **Check 3, neighbours.**
  - The three skills nearest it (shared words in name or description) are asked with it in the list and without. None may get worse.
  - The card names overlaps, and says when the model took the new skill on a neighbour's requests.
- **Health check (look only)**, on any skill the app has, from its own button. It is the same exam as a report, and it changes nothing. Only its result and test requests are kept, in Tuner Plus's folder. It uses the list the page showed, so it records nothing new either.
- **How it runs.**
  - Model answers are steady (temperature 0), are only read, and are never run.
  - A skill's text and the written requests are material, never instructions: they are fenced and masked.
  - One exam at a time, and never during a training run (a training run waits for an exam too).
  - Stop works at any point, and a stopped exam records nothing. Switched off part-way, it stops and writes nothing, not even a card.
- **Found in the lab and fixed:**
  - **A step 6 bug.** The "never in your default workspace" rule was checking the wrong folder. The app's "default folder" is where its host process starts (on your Mac `~/.dsh/profiles/desktop`), not `~/Documents/deepseek-harness/default-workspace`, so the lab offered "This project: default-workspace". Nothing was written. The rule now names the app's own default workspace folder, and your real default workspace has no skills folder.
  - In a fresh setup the model pickers were empty (Tuner Plus only knew Model Tiers' models). They now list the app's own models.
  - The card under-counted model calls.
- **Lab** (a throwaway copy, its own Recon room, a stand-in model, 29 made-up held-back tasks):
  - A changelog skill went from the form through its exam (6 of 6 right and 0 of 6 wrong on both models; 12 tasks right with it and 0 without), then Show its text, then live, marked Mine.
  - A second skill failed loading and was refused at "Put it live". Its neighbour check found the first skill and showed it was not made worse.
  - A third went live through the page's buttons, after going live had been refused before its text was shown.
  - The health check of a Plus skill changed no file.
  - No held-back task reached the strong model.
- **Independent review:** 11 findings, all fixed, each with a test. The main ones:
  - switching off mid-exam now stops it and keeps nothing;
  - the exam is held while the list is read;
  - a stop at the last moment is never a result;
  - requests written from a skill's text stay on this Mac;
  - the loading check can no longer be fooled by a skill's name;
  - a draft's exam re-reads the whole list;
  - a failed exam always stops a draft;
  - "shown" is checked on the server;
  - the model list never holds the page past about 3 seconds.
- **Tests:** Tuner Plus 99, all passing. Each new rule was undone once, and a test failed each time (30 exam rules, 4 default-workspace rules and 17 review fixes).

**Known limits:**
- The loading check asks in words which skills a model would load, with the app's own list and the `skill` tool's own words. It is not a full conversation.
- The list has every name the app can see once, including skills a model may not load by itself.
- Check 2 needs ten held-back tasks of the skill's kind, so a skill for a rare job cannot pass until your work holds ten such tasks.

### Step 8: skill ideas from the harvest and from plain chat, and "skill" on the ladder (done)

- **"Look for skill ideas"** (under Skills on Tuner Plus's page) reads only what Tuner Plus gathered, under the harvest's own switches and rules: never Recon, never a signed-in source, Scratch yes. It never reads the exam, so the exam stays a fair test of what an idea becomes. It finds five kinds of idea:
  - a job you did several times in checked work with the same tools, in more than one conversation;
  - a point you corrected more than once;
  - a job the first model failed and a stronger model, or a longer run, then got right;
  - a tool whose call failed and then worked, again and again;
  - a plugin with lessons (calls of its tools that worked in your use) and no skill of its own.
- **Each idea is a card.**
  - An idea a skill or draft already covers is left out.
  - "Do not suggest this again" keeps holding as more of the same work comes, and an idea you drafted once is not offered again.
  - Rows from a conversation you later marked "never learn from this", trashed, or that received a Recon export are no longer used.
- **"Draft it"** has a model on your Mac write a draft from the masked examples (the strong model when it runs on your Mac, else the floor model). The draft goes to the one project the examples came from when there is one, else everywhere, and then takes its exam like any draft.
- **A skill from plain words.** In a conversation, ask "make a skill for how I want changelogs written". The conversation's model saves it as a draft with the new chat tool `tuning_skill_draft`.
  - It is offered only while the skills part is on.
  - It is never offered in Recon or to a helper.
  - It is refused for a conversation the harvest leaves out, one that received an export from Recon, or one that used a signed-in source. The check includes the turns a fork copied in and the helpers' own conversations.
  - Material you pointed at is named on the draft ("Built from outside material: …; read it in full before it is used"). Once live, the skill keeps an "Outside material" mark.
- **The ladder.** "Skill" sits after Instructions, without a number; the six rungs keep theirs.
  - While the skills part is on, a run proposes a skill instead of instructions when the work is one kind of job that comes up only sometimes (under a quarter of what its tabs gathered).
  - Off, it behaves exactly as before.
  - The page shows the ladder with Skill in it.
- **A decision I made, which you can change.** The chat door follows the harvest's reading rules (Recon, never learn, exports, signed-in sources), but not the per-tab "learn from this tab" switches, because you are asking for the skill yourself. One word changes it.
- **Not built in this step:** turning a long instruction that is only needed sometimes into a skill, with the room it frees. That needs the list measured per tab (step 10).
- **Lab** (a fresh throwaway copy; its default workspace moved inside the lab, so no lab conversation ever opened your real one):
  - Two idea cards came from seeded work. "Draft it" wrote a draft by the lab's strong model on this Mac, marked "From a skill idea".
  - In a Cowork conversation the tool saved a draft "Built from outside material".
  - **Found:** in tabs that load tools as needed, a model must add the tool by its name. `tools_find` lists it under "other single tools", but a request containing the bare word "skill" goes to the app's core `skill` tool and stops there (Plus Modes' matching). Left as it is: Modes is its own step (14).
  - **Found and fixed:** the conversation's id on a draft was masked as if it were a key.
- **Independent review:** 4 bugs and 2 rule gaps, plus smaller items, all fixed with tests. The main ones:
  - an idea's key changed when differently worded work arrived;
  - a "rescue" could pair a failure with another job;
  - the chat door missed a fork's copied turns and the helpers' conversations;
  - ideas you had banned still counted toward the limit of 12;
  - rows were used from conversations later marked "never learn".
- **Also fixed:** an old harvest test that failed by chance about once in 250 runs; its allowed range was widened.
- **Tests:** Tuner Plus 117, all passing. Each new rule was undone once, and a test failed each time (33 rules and 14 review fixes).

### Step 9: the bar (done, as sketched)

Your prompt says: if the bar as built differs from what it describes, show a sketch first. It differs, so this is the sketch, shown as a picture in the conversation.

- **Today's bar stays exactly as it is** for every goal it has now: Model, Goal, Method, Budget, Look only, Data sets, the run in one sentence, Start.
- **One more goal, "Build or improve a skill"**, offered only while the skills part is on. When it is picked, the bar shows:
  - **Run type:** Check (a health report, changes nothing), New skill, Find gaps (jobs you do often that no skill covers; the skill ideas of step 8). Improve, Merge or split and Retire unused are shown greyed until step 10 builds them.
  - **Mark:** All, Default, Downloaded, Plus, AI-made, Mine, Not sorted. It filters the list below.
  - **Skills:** the list fills itself from the skills the app really has, each with its mark. You tick one, several or all.
  - **For New skill**, a line "What the skill is for", plus "Where it goes": this project, or everywhere.
  - **Look only**, as today (always on for Check and Find gaps).
  - **The run in one sentence**, for example "Check the 14 Downloaded skills for clashes and wrong loading. Change nothing."
- **Hidden for this goal:** Model, Method, Budget and Data sets. They are for adapters; the skill exam's floor and strong models do this work.
- **The selection is a boundary that code enforces.** When a run starts, its list of skills is fixed.
  - It reads the text of those skills only, and changes only those, or makes only the new draft.
  - Any other skill is seen only by its name and description, which every model sees anyway (the loading and neighbour checks need that).
  - Anything asked outside the list, from the page or from chat, is refused while the run lasts.
- **Plain chat does the same.** A chat tool runs Check, New skill or Find gaps with the same choices and the same boundary. A run that writes anything shows the run in one sentence on the app's own card first.
  - "Which of my skills never get used?" needs the health list of step 10. Until then the tool says so.
- **Results come as cards**, with the buttons Tuner Plus uses today.

You said "Yes, as sketched", and it is built that way:
- **The boundary also covers the page.** While a run lasts, putting another draft live, dropping one, sorting another skill, a new draft, drafting from an idea, and a model's file write into a skills folder for another skill are all refused. Showing a draft's text is still allowed.
- **Lab** (the step 8 copy):
  - The goal appears only with the skills part on, and the bar looks as sketched with the lab's 17 skills and their marks.
  - Check of the Downloaded skill gave one card with its health line. New skill with Look only showed the skill and kept nothing.
  - **Found:** the page kept saying "Running" for up to 30 seconds after the end. It now looks again every 5 seconds while a skills run or exam goes.
- **Independent review:** 4 bugs and 4 smaller items, all fixed, each with a test. The main ones:
  - Stop or unload during a New skill's save let its exam run anyway;
  - two runs could start while the list was read;
  - the boundary did not cover the page or a model's file writes;
  - a helper that was left out did not count against its conversation.
  - Also fixed: the night shift now waits for a skills run instead of losing the night.
- **Tests:** Tuner Plus 130, all passing. Each rule was undone once, and a test failed each time (16 rules and 10 review fixes).

### Step 10: looking after the skills (done)

- **The health list.** Each skill in the list now shows:
  - how often it was loaded: by a model, or by your typed /name;
  - how often that turn ended well, and when it was last used;
  - the room it takes in every request, what its last check found, and how it may change.

  Uses are counted from the conversations Tuner Plus may read: never Recon, never one holding a Recon export. "Count uses now" counts again, and the count also runs quietly at most once an hour.
- **What the list costs.** The whole list goes with every request, in every tab that uses skills: here 18 skills, about 954 tokens per request. For each tab, the card names the skills never loaded there. The app gives a tab all of the skills or none, so choosing per tab is step 14.
- **Improve, from the bar.** A model on your Mac writes a better version, using what the skill's last check found. It becomes a draft with its exam, showing before and after. "Use it" applies it only after the exam passed and you read it.
  - **Yours** (Mine or AI-made, in a project's `.dsh/skills` or your `~/.dsh/skills`) change where they are. The old text is kept in Tuner Plus's folder, every other line at the top stays, and the mark stays.
  - **Every other skill** (Default, Downloaded, Plus, Not sorted, Learned skills') is never touched. Improve makes a copy under the same name in a folder that wins. The copy is AI-made and names its original.
    - When the original changes later, you are told once, with what changed.
    - Retiring the copy brings the original back.
  - **A skill nothing can win over** says why.
  - **A change is checked again when used:** whether the skill changed since, or your sorting changed what may change.
- **Merge and Split.** Merge makes two of your skills one; the second is retired when you use it. Split makes one into two.
- **Retire and Put back.** Retire switches one of your skills off and keeps it; Put back returns it, never over something new in its place.
  - **Retire unused** counts uses first, then proposes the skills not used for 30 days, leaving out newer ones. You decide on the card.
  - Deleting for good waits until the app's trash can take folders (today it says "Folders cannot go to the trash yet").
- **Your earlier wish for a one-click "start clean" for new projects is not built.** Only Learned skills' per-project switch exists, as Phase 1 said. It can be its own step if you want it.
- **Lab** (the step 8 copy):
  - A made-up skill sorted as Mine changed in place, and the Plus `read-pdf` as a copy. Both drafts showed before and after, and both failed their exams honestly (no held-back tasks in the lab), so neither could be used.
  - Retire and Put back worked through the page, and the file came back byte for byte.
- **Independent review:** 12 points. 10 were fixed, each with a test, including Use it after a later re-sort, copies losing their link to the original, a description over two lines breaking a skill, uses counted in the wrong turn, and Retire unused running before uses were counted. Of the other 2:
  - **Point 2 did not hold.** The app's code says a skill file in the agent's layer beats a skill registered globally; ranks only order skills within one layer. The step 5 lab showed the same, so copies in `~/.dsh/skills` do win over Plus and Learned skills.
  - **Point 4 holds in part.** For the app's own Office skills, served from inside the app, the original may not show beside its copy. The row says so, and the check after an update (step 11) will cover it.
- **Found on the way, and fixed on your word ("Fix it now").** In this app version a turn starts first, and the message you sent is written inside that turn. Tuner Plus's harvest, built before this work, paired a message with the next turn, so a gathered row could carry the previous request.
  - The harvest now reads the app's real order and the older one: a message belongs to the turn that is open and has not worked yet.
  - A test in the real order checks that each request stays with its own turn, that a correction marks the right turn, and that a message sent while a turn already works waits for the next turn. The older tests still pass.
  - Nothing needed converting: Tuner Plus has not gathered anything on your Mac yet (its folder does not exist).
- **Tests:** Tuner Plus 144, all passing. Each rule was undone once, and a test failed each time (25 rules and 12 review fixes).

### Step 11: the check after an update (done)

- **What it keeps.** The first look notes, without a card, the app's version, each Plus add-on's version, and the print of every skill an update can bring: the app's own, Plus's, the providers', and those in the shared folders at home (`~/.dsh/skills`, `~/.agents/skills`). A project's own folders are never part of it: they come and go with its conversations.
- **After an update, one card.** It names the versions that moved and the skills that changed, went away, are new, or now share a name with another. It also names your copies now behind their original (each also has its own card), and, after an app update, your copies of app skills whose original cannot be seen, to compare by hand.
  - "Check them" runs the loading check again on the changed and new ones (look only, nothing changes).
  - A version change that touched no skill makes no card.
  - Your own skills are never news here. A Not sorted skill counts only beside a version change, since it may be one you made by hand. A skill hidden behind your own copy of it is not news either.
- **The marks hold.** They come from where each skill lives and from the records, so an update does not move them.
- **Careful about what is not an update.** A skill merely not listed this time stays as it was; it is "gone" only when its folder is gone or its provider no longer serves it. A skill the app could not hand over keeps its print. A damaged baseline or a failed check never stops the list.
- **Lab** (the step 8 copy, reinstalled): the baseline was edited to look like an older app (0.2.1) and an older PDF add-on. The next look showed one card: "The app went from 0.2.1 to 0.2.2-rc.2", "dsh-pdf 0.0.9 → 0.1.0", "Changed: dsh-doc", "New: ego-browser (Downloaded)". "Check them" ran a look-only check of exactly those two.

### Step 12: night-shift drafts (done)

- **Its own switch, off at first,** under the night shift on Tuner Plus's page ("Draft skills at night"). It needs the night shift and the skills part on.
- **What it does at night:** it looks for skill ideas and drafts at most two, in turn, with a model on this Mac, then runs their exams. An idea that cannot be drafted (its examples gone, its names taken) does not hold up the others.
- **What it never does:** put a skill live, or change one that exists. The drafts wait under Skills for your yes, and the morning card names them with their exam result.
- **It leaves alone** an idea you put aside ("Not now"), kept in a file of its own so it holds also once the card has left the page.
- **It stops** the moment the Mac is used: before each step, and within 15 seconds while a draft is being written or examined (the model call and the exam are both stopped).
- **It never spends on a model elsewhere.** When the exam's strong model is not on this Mac, the night writes the draft but leaves the exam for you to start with Exam.
- **Not tried in the lab:** it needs the Mac on power and unused for 15 minutes. The tests cover it with a stand-in clock, power and idle.

### Step 13: marks on the Cowork Skills page (done)

- **On the page:** a mark beside each skill's name and a filter by mark, with how many of each, in the page's language (English or Chinese).
- **Asked from Tuner Plus's service.** It tells names, files or providers, and marks, never a skill's text. It answers at once from its last look; a look older than a minute is made again in the background, one at a time.
- **Without Tuner Plus** (absent, off, its skills part off, failing or slow), the page and its answer are exactly as before. A test checks the answer field by field, and the lab showed the same answer with the part switched off.
- **Lab:** marks Default 5, Downloaded 1, Plus 11, Mine 1; "Mine" left only the made-up lab skill.
- **Cowork's tests:** 133 before, 136 after, all passing.

### Independent review of steps 11 to 13

7 points and 1 question; all 7 were fixed, each with a test:

1. The night could stall on two ideas that kept failing.
2. An idea set aside came back to the page each night, and could later be drafted.
3. A partial listing, the folder cap or a failed read made false "gone", "new" or "changed".
4. Your own edits and your own copies made update cards, and the card's title left some counts out.
5. Drafting at night did not stop when the Mac was used.
6. A damaged baseline could break the whole list.
7. The Cowork page could wait for Tuner Plus, and looks could pile up.

The question (point 8) was whether night exams may spend on a cloud model. I chose the careful way: never at night.

**Tests:** Tuner Plus 153, Cowork 136, all passing. Each new rule was undone once, and a test failed each time.

### Step 14: choosing skills per tab (done, on your "Yes, build 14")

- **What you see.** On Tuner Plus's page, the cost card names for each tab the skills never loaded there, and how many conversations were counted. From 10 counted conversations, a button "Switch these off in <tab>" appears. "Switch back on" returns them. Settings → Modes also shows the switched-off skills per tab, with its own "Switch back on", so the way back does not need Tuner Plus.
- **What it does (in Modes):**
  - In that tab the model no longer sees those skills in its list. An open conversation gets one shorter list at its next step.
  - A call for one is refused with a plain sentence, by a guard that holds whatever other add-ons answer.
  - Your own typed /name still works, because you asked for that skill yourself.
  - Every other tab is unchanged. Recon is unchanged (it gets no skill list at all), and an isolated tab cannot be given such a list.
  - With nothing switched off, every step is exactly as before.
- **The measurement first, in the lab copy.** The app re-sends its list whenever it differs from the one the model last saw, which could have meant the list going out again on every step. Modes now drops that repeat, because the model already has the shorter list.
  - In a 5-turn conversation (8 model requests), the model got the list exactly once.
  - When a skill was switched off in an open conversation, the model got one shorter list and nothing more after it.
  - A Code conversation still listed the skill switched off in Cowork.
  - So no tokens are wasted.
- **Recon's tests:** 109 before, 109 after. **Modes' tests:** 119 before, 126 after. All pass.
- **Independent review:** 6 points; 5 were fixed, each with a test, and checked again in the lab:
  1. An open conversation kept seeing a switched-off skill until its list changed. It now gets a shorter list at once.
  2. With every skill switched off, the old list stayed visible. The model is now told there are none, in the app's own words.
  3. "Switch back on" on Modes' page could undo a change made meanwhile in another tab. It now writes from the stored setting, and two quick changes in Tuner Plus no longer lose one.
  4. The filter depended on the order the add-ons loaded in. It now registers outermost (`prepend`); the test stand-in cannot show a reload, so this one rests on the app's own rule.
  5. The refusal could be overridden by another add-on. It is now a guard.

  Left as it is (point 6): a tab you remove keeps its list. Settings → Modes still shows it by its id, and it can be cleared there.

### Step 15: skill first, adapter later (done, on your "finish up all remaining steps")

- **The card.** A skill gets one card when four things hold:
  - it was loaded at least 20 times;
  - at least 8 in 10 of those turns ended well;
  - its last loading check found nothing wrong;
  - at least 10 checked runs loaded it.

  The card says your model on this Mac could learn its job. It is looked for after each count of uses.
- **Teach it.** The harness set's rows go to the trainer, and to the adapter's exam, without that skill's loading. The adapter learns to do the job without loading it.
  - The rows Tuner Plus keeps are not changed.
  - The usual "may train" rules apply: never Recon, the provider switches, the masking, no signed-in sources.
  - The skill's text never trains: a gathered row holds the model's calls, never the text a skill loaded.
  - The skill stays as it is for every other model.
  - Nothing trains until you start a training run, with its exam, as always.
- **Stop teaching** undoes it. With the skills part off, the sets go to the trainer exactly as before.
- **Independent review:** no blocking bug in the main flow; 4 points fixed, each with a test:
  1. A run where a first try failed and the next loaded the taught skill still trained that skill's call. So did a lesson. Both are now left out.
  2. The exam was kept apart from training before the skill's call was removed. It now compares them as the trainer sees them, and rows that became alike train once.
  3. The card now says that only runs which may train are used.
  4. "Not now" worked like "never". It now comes back a month later; "never" holds.

  Left as they are: a renamed skill counts as a new one, and a check made before an edit still counts.
- **Tests:** Tuner Plus 156, all passing. Each rule was undone once, and a test failed each time, except a second guard against a repeated card (the card list already prevents it).

### Step 16: tests, changelog, passports and documents (done)

- **Tests, all passing:** Tuner Plus 156, Modes 126, Recon 109, Cowork sidebar 136, Learned skills 17. The full check passed.
- **Changelogs and passports** for Tuner Plus, Modes and the Cowork sidebar now list the new settings: `tuning.skillExam`, `tuning.nightSkills` and `modes.skillsOff`. They also record the service Cowork now asks (`tuning`), and each change.
- **`docs/MODES-AND-SETTINGS.md`** gained "Skills per tab", "Tuner Plus's skills part" and the `modes.skillsOff` row in its settings table. The READMEs of Tuner Plus, Modes and the Cowork sidebar say the same. `docs/HANDOFF.md` is up to date.
- **Nothing is installed, committed or pushed.** Installing Plus brings all of it to your app, with every new switch off until you turn it on.

## Phase 2, done

All 16 steps are built, each with its tests, a lab in a throwaway copy, and an independent review whose points were fixed or answered.

## Evidence

Kept in the shared notes folder of this session group: the test output (`tuner-baseline-tests-2026-11-17.txt`), the harness findings with file and line references (`partA-harness-skills.md`), and the full skill table with fingerprints (`partB-skill-inventory.md`). The installed app was read from a fresh copy of its package in `/tmp`; the app itself was not changed.
