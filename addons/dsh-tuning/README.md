# Tuner Plus

Plugin `@local/dsh-tuning` (dsh 0.2.2-rc.2). Models that learn from your work. Called Tuning Plus in its plan and until 17 November 2026; only the name you see changed (its inner name, settings, folder and service are still `tuning`). It is the plan "Tuning Plus plan for models that learn from your work" (see `docs/TUNING-PLUS-T0.md` for what already existed and the nine places where this build differs from the plan, each decided for you and easy to undo).

Off until you switch it on in **Settings → Tuner Plus**, and then each mode is read only when you switch that mode on there. Training runs only on this Mac, from a Python with Apple's mlx-lm that you install yourself; Tuner Plus installs nothing and downloads no model.

## What it does

Every checked step of your work (a tool call whose tests passed, a claim you ruled on, a draft you edited and approved, a device that read back, a query that answered a saved analysis) is kept as a **training row** with its **proof**. One row in five goes to a private **exam** made from your own work; code chooses which (a salted hash of the row's text, not its tab, so the same work seen from two tabs is one row on one side), and an exam row never trains anything. A row made from another row (a plugin lesson) stays on that row's side, and an exam row that repeats a training row (the same text, or 90% of it) is left out of the exam. The rest builds named **data sets**. From them Tuner Plus proposes the cheapest fix that could help, and only then trains:

| Rung | What | Where it lives |
| --- | --- | --- |
| 0 | Fix the harness (a tool, a plugin, a setting) | Creator Plus |
| 1 | Instructions | Learned skills and Self-improve |
| 2 | Example bank | the Voice Library for writing |
| 3 | Tuned prompt | Self-improve |
| 4 | Adapter: a small add-on trained on a set, on this Mac | Tuner Plus |
| 5 | Small specialist: a much smaller model for one role | Tuner Plus |

Nothing is used until it beats the exam by a clear margin (5 points), is not worse on the general canaries (the Benchmark add-on's 12 small tasks, 2 points of slack), and you say yes.

## What it learns from

Each mode has its own switch, and each starts off.

| Mode | Rows |
| --- | --- |
| Code | tool calls whose tests passed, finished runs, a failed call beside its fix, Mission items whose check passed |
| Content | your rulings on claims (never a claim brought in from Recon), and your edits beside the writer's drafts from the Voice Library |
| Research | a passage and the claim it supports, only from a source that was opened; source grades |
| Finance and Data | a question and the query that answered it, when the analysis was saved or run again with nothing moved |
| Bench | what a device reports and the recipe that fitted, for devices whose read was checked; never a write command |
| The work loop | each step and the cheapest model that passed it (for the router) |
| Corrections | in any mode: the answer before you corrected it beside the answer after |
| Creator Plus | a brief and the plugin that passed its checks; an error, its cause and its fix (from `<app data>/creator-plus/builds/*.json` when Creator Plus writes them) |
| Other tabs | tool calls of turns that finished with no failed call and no correction |

Never read: Recon; a conversation that received an export from Recon, by message or as a folder export it read (it fails closed: a conversation whose log cannot be read for the mark is left out); the helpers of either; a conversation marked "never learn from this" on Learned skills; Self-improve's own test runs; the trash; a turn that called Bench's or Recon's own tools (`bench_…`, `recon_…`), whatever the tab says now; and when the Modes add-on is off, nothing at all (it cannot tell Recon apart). A Content folder's ledger is read only when every conversation in that folder may be read and none holds an export from Recon, and only claims whose origin is known and safe (a Research report, the conversation itself, your own words) that cite no source of another origin. Your own folders are never read for rows.

The newest turn of a conversation waits until a later turn shows you did not correct it, or the conversation was quiet for six hours; a turn kept after a quiet spell and corrected later is taken out again.

Passwords, keys and tokens are masked before a row is stored, in every spelling a harness meets: labelled (`password: x`, `"token": "x"`, also inside JSON whose quotes are escaped), environment names (`DB_PASSWORD=x`), camelCase names (`"accessToken": x`), `--password x`, `mysql -p…`, `sshpass -p`, Basic, Bearer and Token headers, secret query parameters (`?access_token=…`), a user and password in a web address, private keys and e-mail addresses; your home folder becomes `~`. Tool arguments are masked string by string before they are written as JSON, and a value under a secret's name (`pass`, `apiKey`, `client_secret`…) is masked whatever it holds. A row in which a web address carried a password, or a secret could not be judged, never trains.

## May it train?

Set by code for each row, from who really wrote its text, and shown per set on the page:

- never a row from Recon, never one from a signed-in source (a connector), never one whose secrets could not all be masked;
- each provider has a switch (starts yes); text written by Anthropic's models does not train adapters that write open-ended text unless you switch that on (narrow tools such as judges and routers are allowed). The planner is not a lawyer: read each provider's own terms;
- the writer is the model that wrote the text: the teacher model for questions from reference material, the model in use or the candidate for a taste test (you only picked), and nobody known for a research packet's findings or a Mission step that names no provider. A row whose writer nobody can say trains only narrow tools, never an adapter that writes open-ended text. A preference pair also needs the switch of whoever wrote its rejected answer.

## The page and its bar

**Settings → Tuner Plus**: the switches, then the **bar**: Model, Goal (Harness, Voice, Judge, Know a subject, Fast, Find what helps), Data sets, Method (Auto picks the lowest rung that passes), Budget, and **Look only** (on by default: it reports and trains nothing). Under the bar, the run in one sentence. Results come as **cards** (Taste test, Promote, Not now, Do not suggest this again). Then the data sets (each can be written out for the trainer), the exam, **the shelf** (adapters and tuned prompts with their exam results; Switch on/off in one action), the trainer's Python and the base models' folders, the teacher model, the "may train" switches, and the night shift.

A run of rung 4 or 5: checks the Python and the base model folder (a full path with `config.json`; a name to download is refused), needs at least 20 rows that may train and 10 exam rows, writes `train.jsonl` and `valid.jsonl` (one row in ten) into its own work folder, takes the exam with the model as it is, trains with `mlx_lm lora` (offline: no download), takes the exam again with the adapter, runs the canaries, and checks that the base model's files did not change (a fingerprint before and after). The result is a card; promotion is your click.

## Serving an adapter

Your model server may not load adapters (the common MLX model servers skip adapter folders). Two ways, both by your click, nothing starts by itself:

- **Make a fused copy**: `mlx_lm fuse` folds the adapter into a new model folder beside it (the base model is never changed); add it in Settings → Models like any model. It is refused when the disk has not the room for a copy of the base model.
- **Serve with mlx-lm**: mlx-lm's own server with the adapter beside the base model, on 127.0.0.1 only, on a free port between 18080 and 18099; never twice for one entry; stopped by its own process. A team role uses it only while that server really runs (after the app restarts, until you serve it again, the role keeps its own model).

Python always runs isolated (`-I`) in a new empty working folder, so nothing planted in a folder Tuner Plus writes to can be imported.

Then save its address (provider and model as in Settings → Models). A team in Settings → Model Tiers can name a shelf entry for a role (`adapter: "<shelf id>"`); it is used only while the entry is switched on and has an address, and the role falls back to its own model otherwise.

## Taste test

Your recent requests (from the logs, never Recon's or an export's) are answered by the model in use and by the candidate, with names hidden; you pick A, B or the same. Your picks decide promotion together with the exam, and each pick is kept as a preference pair.

## The night shift

Off until you switch it on. It works only while this Mac is on power and has been unused for 15 minutes (it reads `pmset` and the idle time). It looks again before every step (gathering, questions, lessons, each set) and, inside a run, before each exam, the canaries and the training, and every 30 seconds while one runs: the moment you use the Mac it stops and leaves the rest for another night. It gathers, sorts, builds lessons and questions, finds the weakest spot, proposes the lowest rung, and trains only the sets you allowed on the page, within its time limit (120 minutes). It never promotes anything: you find cards in the morning.

## Lessons and questions

- **Plugin lessons**: worked examples of each plugin's tools (calls that worked, fewest calls first, arguments checked against the tool's own schema), written to `lessons/<plugin>/` in Tuner Plus's folder and into Creator Plus's passport for a third-party plugin when that passport exists. Never into an installed add-on's folder. When a plugin's tools change, the harness adapter is marked due for a rebuild.
- **Questions from reference material**: a teacher model writes questions and answers from the passages of read sources; a second call checks each one, and only checked ones are kept. A teacher on the internet reads rows only when you ticked that.

## Tools in the chat

| Tool | What it does |
| --- | --- |
| `tuning_status` | the sets, the exam's size, the shelf, what is running. Read only |
| `tuning_plan` | look only: a plain-words request as one sentence, the sets it would use, what the exam says today, the lowest rung that could help. Trains nothing |
| `tuning_start` | a run you asked for, after the app's own approval card with the run in one sentence. Refused in helpers |
| `tuning_export_set` | writes one set out for the trainer, in Tuner Plus's own folder |

They are offered only while Tuner Plus is on, and not in an isolated conversation. While Tuner Plus is off, its page only switches it on, changes settings, stops a run, stops a server and switches entries off.

## What may be sent to a model

Only this Mac itself counts as this Mac (switch **Count my own network's machines as this Mac** on to count 192.168…/.local machines too; a proxy on your network that forwards to a cloud provider cannot be told apart). A model elsewhere is examined only on rows written in conversations with that same provider, and asked again in a taste test only requests made to it; a teacher elsewhere reads rows only when you ticked that.

## For other add-ons

Service `tuning` (`apiVersion` 1): `examGate({ route, before, after, signal, budget })` takes the owner's exam (its model calls are counted in `budget` when the caller keeps one, and a used-up budget stops it) with two versions of instructions and says whether the new one is not worse (2 points of slack). It answers undefined when Tuner Plus is off or has fewer than 10 exam rows that fit, and then the caller does what it did before. A model on the internet is examined only on rows written in conversations with that same provider: rows that never left this Mac are not sent out. `adapterRoute(entryId)` gives the provider and model of a shelf entry only while it is on and served; `adapters()` lists the shelf's entries with their state.

## Skills (the skills part, off until you switch it on)

Built from the owner's prompt "Tuner Plus: build prompt for adding skills" (see `docs/TUNER-PLUS-SKILLS-PHASE1.md` for the report, his answers and the steps). It has its own switch, **Skills part** on the page, and starts off. While it is off, nothing of it runs, writes or asks: Tuner Plus is what it was before.

**Every skill the app can see gets a mark that says where it came from**, set by code from the way it arrived, never from what a model or the skill's own text says:

| Mark | How code knows |
| --- | --- |
| Default | served by the app itself (its Office skills) or inside the app's own package |
| Downloaded | inside a plugin's package or another app, registered by a plugin's code, or served by a plugin's own provider |
| Plus | registered by one of the Plus add-ons, which names it in its own files |
| AI-made | a model wrote it: stamped when a model's file tools wrote it (with that model), or learned by Learned skills |
| Mine | added by hand on the Learned skills page, or learned there and then edited by you |
| Not sorted | nobody can show where it came from (a folder dropped in by hand, the shell, another program). Treated as Downloaded until you sort it; you are asked once |

A small **Changed** mark shows when a skill's text is no longer what it was when it arrived. Only you re-sort a mark, on the page, several at a time; that is recorded too.

**The doors.** While the part is on, a model's file tools (`write`, `edit`, `apply_patch`) writing into a skills folder (a project's `.dsh/skills` or `.agents/skills`, your `~/.dsh/skills` or `~/.agents/skills`, or the real folder of a linked skill) make the app show its own approval card first, in every tab, once every other rule has allowed the call; a helper is refused. Paths are read exactly as the app's file tools read them (`~` is your home folder, `..` goes through links as the disk does, patch headers are trimmed). When the write happens, the skill is stamped AI-made with the conversation's model. Writing into Tuner Plus's own folder (the record) or into Learned skills' data (its list says who made each skill) is refused, before the call and once more after every other rule. A Recon conversation is never stamped, and Recon's rooms are never listed. Writes through the shell or by other programs raise no event: those skills show as Not sorted or Changed.

**The record** sits beside the skills, never inside a skill file: `skills/records.jsonl` in Tuner Plus's folder, one line per event (first seen, stamped, sorted by you), only added to. Each line carries the fingerprint of the line before it, and the last one's is kept in `state.json`; a line changed, removed or added by anyone else breaks the chain (the seal also holds the number of lines and the first line's fingerprint), and then stamps and sortings are not trusted (those skills show Not sorted, never a better mark). A broken record stays broken, and Tuner Plus writes nothing more on top of it, until you start a new record on the page (the old one is kept beside it). A skill that moved or was renamed keeps its record by its fingerprint, only when its old place is really gone and only one place matches. The fingerprint covers the whole skill folder, scripts too. Who made a Learned skill is taken as first seen; the newest of a door's stamp and your sorting wins.

**Same name, two places.** When two skills share a name, the app gives the model one and hides the rest, and shows the hidden ones nowhere. Tuner Plus reads the skills folders itself, the way the app does (the project is the nearest folder with `.git`; a skill is a folder with SKILL.md or one .md file directly in a skills folder, with a name and a description at the top), adds the skills the app serves from elsewhere, and compares with the one the app says wins: on the list, the winner says what it hides, and each hidden skill says what hides it and in which project. A filter on the page shows one mark at a time, or only the shared names.

**New skills: drafts first.** A new skill (from the page's **New skill** form for now; from your conversations and plain words in later steps) is kept as a draft in Tuner Plus's own folder (`skills/drafts/`), where the app does not load it. It goes live only after its exam, with your click; a model's draft never without its exam. Going live writes one ordinary skill file in the app's own format, which the app reads by itself, so it keeps working without Tuner Plus: in **this project** (`.dsh/skills/<name>` of the project, found by `.git`; picked first, with a warning when the project is a git repository) or **everywhere** (`~/.dsh/skills`). Never the shared `~/.agents/skills`, never your default workspace (the app's `Documents/deepseek-harness/default-workspace`; only "everywhere" there), never a Recon room, never over a skill that is there, never through a link. The name rule is the app's own, and a name a skill already has anywhere (the app's, Plus's, plugins', skill files, hidden ones, Learned skills', other drafts) or an `office…` name is refused, also when it goes live. Secrets are masked before anything is kept. The file is stamped in the record: Mine for one you typed, AI-made for one a model wrote. A new skill goes only to a project the page offers (the folders the skills were listed from); if any skill list could not be read, no name is taken as free until it can; a password or key the masking cannot judge stops the save; something of that name already in the folder, in any capitals, or a file where a folder must be, stops it when you save the draft; a double click makes one draft; a save that fails keeps what you typed. The name is written in quotes, so a name like "true" stays a name.

**The skill exam.** A draft goes live only after it passed its exam, for that very text, and after you have shown its whole text on its card. Pick two models under **The skill exam**: the **floor model**, which must run on this Mac (your held-back tasks never leave it), and one **strong model**. The pickers list the app's own models. Three checks:
1. **Loading.** The strong model writes six requests that should load the skill and six that should not, with near misses in both (it reads the skill's text only when it runs on this Mac; otherwise its name and description). Both models are asked which skills they would load, with the skill list written exactly as the app writes it. On each model it must load on at least four of the six right requests and on at most one of the six wrong ones.
2. **With and without.** Your held-back tasks (Tuner Plus's exam) that are this skill's kind of job, the ones for which the floor model would load it, are answered by the floor model with the skill's text and without it, each marked by its own check, and the canaries too. The rule is Tuner Plus's own: at least ten such tasks, better by a clear margin, not worse on the canaries. Answers and tokens are reported for both.
3. **Neighbours.** The request sets of the three skills nearest it (shared words in name or description) are asked with it in the list and without. None may get worse; the card names overlaps, and when the model takes the new skill on a neighbour's requests.

Model answers are steady (temperature 0) and are only read, never run. A skill's text and the written requests are material, never instructions. One exam at a time, never during a training run; it can be stopped, and a stopped exam records nothing. The result comes as a card, and on the draft.

**Health check (look only).** The same exam on any skill the app has, from the Health check button beside it: a report that changes nothing (only its result and test requests are kept, in Tuner Plus's folder).

**Skill ideas.** "Look for skill ideas" (under Skills) reads what Tuner Plus gathered, under the harvest's own switches and rules (never Recon, never a signed-in source; Scratch yes), and never the exam. It finds: a job you did several times in checked work with the same tools, in more than one conversation; a point you corrected more than once; a job the first model failed and a stronger run then got right; a tool that failed and then worked, again and again; a plugin with lessons (calls of its tools that worked in your use) and no skill of its own. Only rows from conversations Tuner Plus may still read are used (one you later marked "never learn from this", trashed or that received a Recon export is left out). Each idea is a card; one a skill or draft already covers is left out, "Do not suggest this again" holds for it as more of the same work comes, and an idea drafted once is not offered again. **Draft it** has a model on this Mac (the strong one when it runs here, else the floor one) write a draft from the masked examples, for the one project they came from when there is one, else everywhere; it then takes its exam like any draft.

**A skill from plain words.** In a conversation, ask for one ("make a skill for how I want changelogs written"): the conversation's model saves it as a draft with the chat tool `tuning_skill_draft`, offered only while the skills part is on. Never in Recon or a helper, never from a conversation the harvest leaves out, one that received an export from Recon, or one that used a signed-in source. It reads this conversation with the turns a fork copied in, and its helpers' conversations; it is never offered to a helper. Material you pointed at (a page, a document, a repository) is named on the draft: "Built from outside material", which you read in full before it is used; once live, the skill keeps an "Outside material" mark. In tabs that load tools as needed, the model adds the tool by its name (it is listed under "other single tools" in tools_find).

**The ladder.** "Skill" sits after Instructions, without a number (the six rungs keep theirs): a rule that always applies belongs in instructions, know-how for one kind of job needed only sometimes in a skill. While the skills part is on, a run proposes a skill instead of instructions when the work is one kind of job that comes up only sometimes (under a quarter of what its tabs gathered).

**The bar, goal "Build or improve a skill"** (only while the skills part is on; the other goals keep the bar as it was). Run type: **Check** (a health check of each skill you tick, one card for the run, changes nothing), **Improve**, **Merge or split**, **Retire unused** (below), **New skill** (a model on this Mac writes a draft from your one line "what the skill is for", for this project or everywhere, and its exam runs; with Look only it shows what it would write and keeps nothing), **Find gaps** (the skill ideas). Mark filters the list of your skills, each with its mark; tick one, several or all. The run in one sentence comes first. Model, Method, Budget and Data sets are not used for this goal. **The selection is a boundary that code enforces:** while a run lasts it reads the text of its own skills only and changes only those (or its own new draft); anything about another skill, from the page or from chat, is refused; one run at a time, never beside an exam or a training run; Stop works. The chat tool `tuning_skills_run` does the same; a run that writes asks you first on the app's card.

**Looking after the skills.** Each skill in the list shows how often it was loaded (by a model, or by your /name) in the conversations Tuner Plus may read (never Recon, never one holding a Recon export), how often that turn ended well, when it was last used, the room it takes in every request, what its last check found, and how it may change. **What the list costs** shows the whole list's size with every request, in every tab that uses skills (the app gives a tab all of them or none), and the skills never loaded in each tab; **Count uses now** counts again (it also happens quietly, at most once an hour). **Improve** (on the bar): a model on this Mac writes a better version, with what the skill's check found; it is a draft with its exam, showing before and after, and **Use it** (after the exam passed and you read it) applies it. Yours (Mine or AI-made, in a project's .dsh/skills or your ~/.dsh/skills) change where they are: the old text is kept, every other line at the top too, and the mark stays. Every other skill (Default, Downloaded, Plus, Not sorted, Learned skills') is never touched: Improve makes a copy under the same name in a folder that wins (your ~/.dsh/skills, or the project's .dsh/skills for a project's .agents skill), AI-made and naming its original; when the original changes later you are told, once, with what changed; retiring the copy brings the original back. A skill nothing can win over says why. A change is never used if the skill changed since it was written. **Merge** two of yours into one (the second is retired when you use it) or **Split** one into two. **Retire** switches one of yours off and keeps it (Put back under Retired); **Retire unused** proposes the ones not used for 30 days (not newer ones) and you decide on the card. Deleting for good waits until the app's trash can take folders.

**After an update.** Tuner Plus keeps the app's and Plus's versions and the fingerprints of the skills an update can bring (the app's own, Plus's, the providers', and those in `~/.dsh/skills` and `~/.agents/skills`; never a project's own folders). After an update, one card lists the skills that changed, went away, are new or now share a name, and your copies now behind their original. **Check them** runs the loading check again on those (look only). Your own skills are never news here, and the marks hold.

**Night-shift drafts** (their own switch, off at first; they need the night shift and the skills part). At night, at most two skill ideas are drafted by a model on this Mac and examined. The exam never uses a model elsewhere at night: then the draft waits for you to press Exam. Nothing goes live, no skill is changed, and ideas you set aside are left alone. It stops as soon as the Mac is used.

**Marks on the Cowork Skills page.** While the skills part is on, the Cowork sidebar's Skills page shows each skill's mark and a filter by mark. Without Tuner Plus, the page is exactly as before.

**Skills per tab.** On the cost card, each tab names the skills never loaded there. From 10 counted conversations, **Switch these off in <tab>** asks Modes to leave them out there: the model in that tab no longer sees them and cannot load them, though your /name still works. **Switch back on** undoes it, here or in Settings → Modes.

**Skill first, adapter later.** A skill loaded at least 20 times, mostly ending well, whose last check found nothing, and with at least 10 checked runs, gets a card. **Teach it** lets those runs train the harness adapter without the skill's loading, so your model on this Mac learns the job without it. The stored rows are not changed, the usual "may train" rules apply, and the skill's text never trains. The skill stays as it is for the other models, and **Stop teaching** undoes it. Nothing trains until you start a training run, with its exam.

**Limits.** In the Code tab a model can write only in the project folder, so it cannot reach the record. Cowork follows the app's own permission setting; where a model's shell could change the record, Tuner Plus notices it and the affected skills lose their marks. The harness cannot say which plugin registered a skill; for Plus that is read from the add-ons' own files.

## Where it keeps things

`tuning` in the app's data (or the folder you set): `rows/<mode>.jsonl`, `exam/<mode>.jsonl`, `sets.json`, `shelf.json` and `shelf/<id>/`, `cards.json`, `state.json`, `exports/`, `work/`, `lessons/`, `taste/`. Rows are appended; other files are replaced through a new file and a rename, only when their folder really is inside Tuner Plus's folder, and never through a link. A rows file keeps at most 50,000 rows (the newest). Training checkpoints are removed once the adapter is there, and old candidates and failed entries (beyond the newest ten, or older than 30 days) go with their files; an entry you promoted, switched on or off stays. A training run needs 2 GB free. Near repeats are found by prefix filtering (no pass over every pair), and unchanged row files are not read again.

## Limits

It is a ratchet, not infinity. One person's use makes few rows: a narrow skill needs hundreds, so some sets take months. Training does not teach facts well: facts are looked up (Know a subject builds retrieval first). What a model is trained on can come back out of it: adapters stay private. Training takes the Mac. A new base model empties the shelf; the sets stay, and everything is rebuilt from them (each through its exam again). An exam can be gamed: exam rows never train, the exam keeps growing, and the taste test asks you.

## Tests

```
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test --test-timeout=60000 test/*.test.mjs
```

Stand-ins and made-up rows only; never against the real app data. The installer leaves the test folder out of an installed copy: run them from the Plus folder.
