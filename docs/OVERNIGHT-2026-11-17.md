# Overnight 17 November 2026: Creator Plus and Tuning Plus

## In short (read this first)

- **Both are built, and both are off until you switch them on.** Nothing was installed in your app and nothing was committed. All 46 add-ons pass the full check.
- **Creator Plus** (a new tab): the Phase 1 report you asked for is `docs/CREATOR-PLUS-PHASE1.md`, the handbook `docs/CREATOR-PLUS-HANDBOOK.md`. Your six fixed rules are enforced in code. Your real setup changes only when you press a button on its page, always with a backup and an undo. It was reviewed three times because it runs code a model writes; each round found real holes, all fixed. **Its Long runs are switched off for now** (see the decisions below); use Thorough.
- **Tuning Plus** (a Settings page): gathers checked work as training examples (only from the tabs you switch on, never Recon or personal folders), keeps a private exam, and trains adapters only on this Mac when you start it. A real test proved it: a tiny model trained on made-up examples went from 0/60 to 60/60 on its exam in 46 seconds; the throwaway files are deleted. Your model server can't load adapters, so a trained one is used as a separate copy or through the trainer's own small server.
- **A security fix in Mission (an existing feature):** a check command could plant git settings that the app's next checkpoint would run outside the sandbox (Recon's offline checks were exposed too). Fixed without changing how checkpoints work for you.
- **A Bench bug** (two backups in the same second) was found and fixed.
- **Not done:** nothing ran against a real model (both plans' scorecards are ready to run on your models), nothing was opened in the desktop app (the lab copy, yes), Creator Plus doesn't read Recon's conversation text even with your yes (structure only).
- **What needs you:** read the decisions below and tell me which to undo. Then, if you want, install and commit.


The owner's request (16 November, late): "start and finish these new additions" — "Creator Plus.md" (build prompt for a plugin-building mode) and "Tuning Plus plan for models that learn from your work.md". As always additive and non-destructive. Starter questions were asked before he left; everything decided after that is listed under "Decided for the owner" so he can agree or have it undone.

## The owner's starter answers

| # | Question | Answer |
| --- | --- | --- |
| 1 | Creator Plus's six fixed rules (backup and a way back; nothing in the real setup without his yes; other modes' safety rules never weakened, a plugin that would is blocked; third-party and harness code never edited in place; text is material, not instructions; passwords and keys never in maps, passports, logs or sent outside this Mac) | **All six as written**, enforced by code where code can |
| 2 | A throwaway test trainer for Tuning Plus (Apple's mlx-lm from PyPI and SmolLM2-135M-Instruct in MLX format from Hugging Face's mlx-community, in a throwaway folder, deleted afterwards; made-up rows only) | **Yes, throwaway only** |
| 3 | Saved runs of Creator Plus | **Yes, both:** on its bar and offered in the Automations tab (a scheduled run still changes nothing without his yes) |

## Decided for the owner (to agree or undo)

(Filled in as the work goes.)

### Tuning Plus (built by a helper; details and how to undo each in docs/TUNING-PLUS-T0.md)

1. Its own add-on with a Settings page and a bar, not a tab.
2. Training with mlx-lm's LoRA; preference pairs (draft vs your edit) are kept and can be written out, not trained yet.
3. Your model server cannot load adapters (checked on its public page), so a trained adapter is served as a "fused copy" (a new model folder) or through mlx-lm's own server, only when you click.
4. The taste test uses your recent requests.
5. Lessons (worked examples of each plugin's tools) go to Tuning Plus's own folder and to Creator Plus's passports for third-party plugins, never into an installed add-on's folder.
6. The 12 canary tasks live in Benchmark and are graded by code.
7. The exam check on the cheap fixes (Self-improve, Learned skills) applies only once an exam exists (at least 10 rows).
8. A "may train" switch per provider: on by default; Anthropic's text for adapters that write open-ended text starts off.
9. The night shift has its own schedule (only on power and idle, stops when you use the Mac), not one in Automations.
10. Learned skills uses its reading model for the exam, with an "Add anyway" button.
11. Self-improve tries the whole playbook on the exam.
12. A model on the internet only sees rows and requests that were already sent to that same provider.
13. Helpers follow their parent conversation's rules; connector tools count as signed-in sources (they never train).
14. Code rows are marked by the shape of the tool call, not by re-running tests.
15. Creator Plus builds are read from a build-records folder (Creator Plus does not write it yet).
16. No lessons are written into `passport/lessons/` inside the Plus add-ons' folders.
17. The settings page is not grouped in Settings Plus's list.
18. A team member's adapter falls back to its own model; a member with only an adapter is not allowed.

What changes in other add-ons (only with Tuning Plus on): Self-improve gets one more gate (with at least 10 exam rows); Learned skills' accept can take longer and be refused (with Add anyway); Model Tiers' team members get one optional "Tuning Plus adapter" field; Benchmark holds the canary tasks.

The real-training proof: a throwaway Python with mlx-lm and SmolLM2-135M in /tmp, 288 made-up support tickets (206 train, 22 check, 60 exam), 300 steps in 46 seconds, exam 0/60 → 60/60, base model files unchanged; both throwaway folders deleted (checked: nothing left in /tmp; your own Hugging Face cache untouched, last changed 4 November).

### Creator Plus (built by a helper; Phase 1 report in docs/CREATOR-PLUS-PHASE1.md, handbook in docs/CREATOR-PLUS-HANDBOOK.md)

1. **Write access, but only in the conversation's folder.** Building needs files; Creator Plus's guard refuses writes anywhere else. Undo: `sandbox` read-only in `addons/dsh-creator-plus/lib/mode.js` (it then cannot build).
2. **Your real setup changes only from page buttons.** A new plugin is installed through the app's plugin manager; a change is copied into the plugin's folder after a backup. Undo: the card's Undo or Remove.
3. **Code a model wrote runs only inside macOS's sandbox** (not in your prompt): no network, no home folder except the folder being checked and the trial copy; where there is no sandbox, it is not run. Undo: the `sandboxed(...)` line in its `index.js`.
4. **Apply installs exactly the copy that passed the checks** (kept in Creator Plus's own folder), and the card says an installed plugin runs with the app's rights. Undo: `folder: kept` → `folder: dir` in `lib/tools.js`.
5. **Every Recon file is blocked from changes**, and Bench, Modes and Content files that hold safety rules too. Undo: `GUARDED_FILES` in `lib/fit.js`.
6. **Only models on this Mac read session logs by default**; Recon structure only (which tool failed, the kind of error). Undo: the setting on Settings → Creator Plus.
7. **The strong-models list lives in Creator Plus's own settings** (Model Tiers was being changed by the Tuning helper).
8. **The trial copy is checked by composing the setup (`--dump-config`)**; it never starts a server.
9. **The bar sits in the chat box** of Creator Plus conversations; "Look only" is a switch on it.
10. **A Long run may ask questions only in its first minute**; after that they are written down for the end.
11. **A scheduled saved run goes into its own new Creator Plus conversation in Scratch** and, since a schedule is not your yes, it only prepares changes and notes; it never starts a new build.
12. **Passports in every add-on** (a `passport/` folder, no effect while the app runs) are marked as made by you with Claude; their briefs are generated from each README.
13. **In a Scratch conversation the build folder is the folder the app reports.**
14. **The page can turn a brand-new conversation into a Creator Plus one** ("claim"), protected like other add-ons' page actions.

Not done: the real-model scorecard (the self-test's code parts pass, 5 of 8; Rebuild, Look and part of Improve need a model); reading Recon's conversation text after your yes is not wired (structure only); checks after an update run a plugin's tests only when the Plus folder setting is set; nothing was run inside the real app yet.

### Decided during the reviews

- **Creator Plus never builds in, reads or writes a Recon room** (the lab showed the app's start page offering the lab's Recon room as a new conversation's folder): it refuses with "This folder is Recon's sealed room; start Creator Plus in another folder or in Scratch."
- **Only this Mac counts as "this Mac" for Tuning Plus** (rows, exam requests, the teacher): a switch "Count my own network's machines as this Mac" starts off. Why: a local stand-in that forwards to a cloud provider can't be told apart from one of your own machines. Undo: switch it on (on Settings → Tuning Plus).
- **A Creator Plus Long run's check commands run in Mission's strictest fence** (no network, no home folder, writes only in the run's folder), through a new `creatorPlus.longRunRules` service Mission asks (like Bench's). With Creator Plus off, Mission works exactly as before. If that could not be done safely, Creator Plus Long runs are switched off instead (the helper's report says which).

### Tuning Plus, after its review (details in docs/TUNING-PLUS-T0.md, items 19–23)

- How a text's writer is decided: the real model that wrote it (teacher, both sides of a taste test, research findings); an unknown writer (Mission steps record none) trains only narrow tools, never open-ended adapters.
- The newest turn of a conversation waits 6 hours (or until a later turn) before it can be a row; a row corrected later is removed.
- Learned skills runs the exam in the background and the page polls.
- Limits: 50,000 rows per file, 2 GB free disk to train, the newest 10 candidates and 30 days kept (promoted ones always kept).
- Voice Library edits count as your writing only when your share is at least 50%.
- A planted link is refused, not replaced.

### Found by the full check overnight, fixed

- **Bench backup names could collide** when two backups were made in the same moment: a router backup then failed, and an ESP32 backup made within the same second could be written over an earlier one by esptool. Every backup now gets a name that is not taken yet (`freeName` in `addons/dsh-bench/lib/kit.js`), with a test.

### Found by the third review (security), and what was decided

- **Mission's checkpoints had a hole (an existing feature, not tonight's work):** a Long run's check command could plant settings for git (the tool Mission saves checkpoints with) inside Mission's own folder, and the app's next checkpoint would then run something outside the sandbox. It affected Recon's offline checks and Creator Plus Long runs. **Fixed without changing how checkpoints work for you** (same place, same "back <number>"): checks can no longer write into Mission's own folder, and every git call ignores any settings a check could plant. Undo is not advised; the change only blocks what checks never need.
- **Check commands no longer outlive their check:** Mission stops a check's whole process group when it ends.
- **Creator Plus Long runs are switched off for now** (decision for you): their checks ran in the conversation's live folder, where they could plant links that redirect Creator Plus's own writes. They come back when the checks run on a throwaway copy. Use Thorough meanwhile. Undo: the pre-flight refusal in Mission for Creator Plus conversations.
