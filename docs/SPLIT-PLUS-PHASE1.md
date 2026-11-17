# Split Plus, Phase 1: what exists and what I propose

2026-11-17. Nothing was changed, installed or run in your app for this report. The outside plugins were downloaded only to read their code, into a temporary folder; none was installed or started.

## In short

- **The split-screen plugin does not fit your desktop app.** `dsh-split-view` makes each pane a frame that loads a full copy of the app. In the desktop app those frames do not get the app's startup bridge, so the panes almost certainly come up broken. A desktop user reported exactly that on its page on Nov 6; the one maintainer has not answered. It works only in the browser version of the app.
- **The app already has the parts to build panes ourselves.** It can show a second, full, live conversation inside its window (it does this today for a helper's chat in the right-hand sidebar). It can create a conversation in a given folder with a given mode, read a running conversation without touching it, and hand a message to a running job (queue or steer). It has a clean way for an add-on to add a viewer for a new kind of file.
- **My proposal:** our own tiling, built from the app's own pieces, in two add-ons: **Split Plus** (panes, one directory safely, Send to, the watcher, saved pane sets, linked logs) and **Artifacts** (cards in every thread, the panel to the right of each chat, the Artifacts list, versions). Artifacts works with one pane too, and works beside the app's right-hand sidebar rather than replacing it.
- **Three things need your yes because they touch other add-ons** (details under "What it would change"): a "sent from a pane" mark that Bench, Content and Creator Plus must skip when they read your decisions; a new entry in Content to receive Research claims; and an Open-in-the-pane-beside button for Content's "Continue in Research".
- **Creator Plus cannot build this one.** Its own fixed rules block what Split Plus needs (hooking tool calls, per-conversation modes, a page that runs). I would build it myself with the handbook and leave a passport, and list where Creator Plus fell short.

## 1. The split-screen plugin

| Your question | Answer |
| --- | --- |
| Does it work in my desktop app? | **Almost certainly not.** Each pane is a frame that loads the app's start page. The desktop app hands its startup bridge only to the main window, never to frames inside it (the window has no setting for frames), so each pane stops with a "bootstrap missing" error. A macOS desktop user wrote on Nov 6 that switching it on broke the screen, even after a restart, and that they had to remove it by command. No reply. The README shows only the browser version, and the maintainer tested only that. |
| Do my modes and add-ons appear in every pane? | In the browser version, yes: every pane is a full copy of the app with every add-on. |
| Memory per pane | Each pane is a full copy of the app, plus one hidden copy on top: 4 panes = 5 copies, roughly 0.5 to 1 GB or more (estimate, not measured). At most 4 panes are live; extra ones are put to sleep. |
| Panes back after a restart? | Yes, kept in the browser's storage. The folder of each pane is not kept, only its conversation. |
| Its service API | List panes; split a pane (with a mode, model, folder or conversation); close, focus, maximize; open a conversation in a pane; **send a message to a pane as a full turn** (queue or steer); switch its mode or model; one "panes changed" event. |
| Missing for this prompt | It cannot put a card into a pane's chat box (only send a whole message). No busy/waiting/done state. Add-ons inside a pane cannot reach it. No named layouts. No control of each pane's right-hand panel. |
| How actively kept up | One person, 20 commits, 2 stars, 8 releases between Aug 25 and Oct 19, nothing since. The desktop crash report is unanswered. |
| Risk in its code | Small and readable (140 KB of plain code; the 9.3 MB download is mostly a demo picture). No hidden code, no telemetry. It checks npm for a newer version when its settings page opens. Its messages between panes are loosely checked. |

**dsh-better-sidebar** (5,000+ stars, very active, works in the desktop app) is not a fit: its "split panes" split files, terminal and browser tabs inside the sidebar, and its "side chat" is a side thread of the same conversation, not a second conversation with its own mode.

**The app's own docking kit** (the engine behind the right-hand sidebar) can tile up to 4 panes in one copy of the app, but the app marks it as internal and liable to change in any release.

**Proposal:** our own tiling. Panes are the app's own embedded conversation view, the same piece the app uses today for a helper's chat, one per pane, all in one copy of the app. That costs far less memory than one full app per pane and works in the desktop app. The tiling sits in one small part of Split Plus, apart from sending, watching and the directory rules, so it can be swapped for the app's docking kit or a future plugin.

**Not proven yet, to prove first in step 1:** whether our add-ons' three chat-box controls (mode, tier, web) appear in an embedded pane the way they do in the main chat. If they do not, I come back to you before going further.

## 2. What you already have

- **The Code tab split for comparing engines:** built, but it is **not a split of chats**. The Engines page is one page with two columns (decided on Nov 14: "one panel with two columns, not two chat panes"). So there would be one split system, Split Plus. One clash to avoid: Engines changes the app-wide default mode when it opens its Code side. Split Plus will set each pane's mode on its own conversation instead.
- **The doors:**

| Door | State |
| --- | --- |
| Continue in Content (from Research) | **Built.** Opens a new Content conversation in Scratch and brings the report in through Content's own tool. |
| Continue in Research (from Content) | **Not a door.** Content only gives you a starting text to paste into a new conversation. |
| Continue in Recon | **Not a door.** Same: a starting text only. |
| Recon's export | **Built.** Your button only; a new conversation, an existing one (never Recon) or a folder; marked "material, not instructions"; sources as citations only. |
| Research packets | **Built.** A folder beside each report with the claims, who says them, the source, the grade (Primary, Confirmed, Single) and the date. |

- **The per-mode contract:** not built under that name. Each mode has a definition (name, tools, access level, tier, prompt, sealed or not) and the Modes service, but nothing says what a mode may receive, which doors it has, or what cards it shows. Split Plus would need a small one: what each mode accepts from a send and how.

## 3. Two conversations in one folder today

- **Same file:** a write through the app's file tools is never half-written, and two writes to the same file are done one after another. But nothing stops the second conversation from overwriting the first one's change with an older version of the file. The app has a "read before write" check that would catch this, **but it ships switched off**. Writes by shell commands go around all of it.
- **Permission modes:** held separately for each conversation, both the app's own access level and Mission's Restricted / Ask-Auto / Full Auto. Changing one conversation does not change another.
- **Git at the same time:** nothing coordinates it. Two git commands in the same folder at once usually make one of them fail with "index.lock exists". The app's own change tracking keeps out of the way (it uses a private copy). Whether two Mission checkpoints in one folder can collide is not checked yet; I would test it in step 2.

## 4. The model server

You told me it can serve up to 8 requests at once and that 4 is a safe margin. I could not ask it more: it wants its access key even to list its models, and I did not use your key. Inside the app nothing limits requests across separate conversations; Mission's "calls at once" (default 4) covers only its own work loop, and Model Tiers' limit covers helpers only. Two panes on two **different** large local models: whether both fit depends on the memory of the machine the server runs on. If they do not both fit, the server has to unload one to load the other, so each switch is slow, or a request fails. Split Plus's "panes that may use a local model at once" setting would make the second pane wait and say so.

## 5. The preview you already have

- **Renders today:** Markdown, code with colours (JSON and CSV show as coloured text), plain text, pictures (SVG safely, as a picture), PDF page by page, spreadsheets (xlsx, xls, csv, tsv) as a grid, and HTML.
- **HTML** has two modes. With Coding Tools off it shows a cleaned page with no scripts, no internet and no outside pictures. With Coding Tools on it runs the page's scripts in a closed box (it cannot reach the app, your files or other panes) **but it may load things from the internet**.
- **Word and PowerPoint** render only when LibreOffice is installed (the app converts them on your Mac). **It is not installed on this Mac**, so today they would not render.
- **Only listed:** audio, video, archives, fonts, programs, databases and a few picture kinds (tiff, heic, avif, psd). JSON is not shown as a foldable tree, and the preview shows no differences between versions (those show in the file rows and the changes review).
- **Cards in the thread:** every mode that changes files through the app's file tools shows a file row (name, size, what changed; a click opens the preview), and at the end of a turn a changed-files card (with Coding Tools on). Of ours, Diagram, Data and Finance charts show as cards. Research and Deep research reports, Content, PDF pages, Creator Plus and Bench write through their own tools, so **they show no card**.
- **In a split pane:** no. There is one right-hand sidebar, and it belongs to the one main chat. A conversation shown elsewhere cannot open files there. This is why each pane needs its own panel.
- **A plugin can add a viewer:** yes, cleanly, through the app's own preview registry. Its own viewers can also be taken over, but that would change them everywhere, so I would ask first.
- **One list of everything made:** no. Only partial lists (Diagrams, Content's final pieces, Research's reports, Creator Plus's build records).

## 6. What I propose

**Two add-ons**, both off until you switch them on:

1. **Split Plus** (`addons/dsh-split-plus`): a Split page with 2 to 4 panes, each an ordinary conversation in any mode with its own controls and permission mode, all in the same folder unless you point one elsewhere; one writer per file and a notice when a file you read has changed; Send to (selection, message, error, file, result) as a card with its source, waiting in the pane's tray when the pane is busy; the watcher (read only, never a Recon pane); saved pane sets; linked logs for Creator Plus and Tuning Plus.
2. **Artifacts** (`addons/dsh-artifacts`): a card in every thread for every file a conversation makes, a panel to the right of each chat (in a normal chat it opens in the app's own right-hand sidebar; in a pane, in that pane's own panel), viewers for the kinds the app does not render yet, safe rendering, the Artifacts list with filters, and versions kept in the app's data folder, not in your directory.

**Your right-hand sidebar:** I recommend Artifacts **works beside it**, not instead of it. Replacing it is possible, but it would take away its files, terminal, browser, changes review and plan tabs. An "Artifacts" tab would be added to it.

**Recon** stays sealed everywhere: it is checked through Modes' "is this conversation sealed" answer (which says yes when unsure), never by name.

## What it would change in other add-ons (needs your yes)

1. **Bench, Content and Creator Plus** read your newest message as your decision ("unlock this phone", "yes, build it"). A send, once you press Send, becomes part of your message, so text inside it could be read as your decision. Each of the three already skips Recon exports by their mark; they would also skip anything inside a Split Plus send mark. Small, additive, but it is a change inside three add-ons.
2. **Content** has no way to receive claims from outside except through its own model. Research to Content as a packet needs a new entry in Content that records the claims "added from Research" so the ledger and the sources page keep working. Or, with no change to Content, the send asks Content's model to bring the packet in with its own tool.
3. **Content's "Continue in Research"** would get a button that opens it in the pane beside, instead of giving you text to paste.

Nothing in the app's own code and nothing in the outside plugin is edited.

## Limits I want you to know now

- **Shell commands:** Split Plus can hold a file for one pane when a model writes it with the file tools. It cannot know in advance which files a shell command will write. Those are caught after the fact and the other pane is told; in Mission's Restricted and Ask-Auto they are already put back.
- **The app's viewers in our own panel:** the app's viewers are built for its right-hand sidebar. Using them inside a pane's panel is likely but not proven; if it fails, I come back to you rather than building a second viewer.
- **Tests with real models** need your yes to use your models in the trial copy.

## Your answers

| # | Question | Your answer |
| --- | --- | --- |
| 1 | How the panes are made | Our own Split page, built from the app's own parts |
| 2 | Artifacts | Its own add-on, beside Split Plus |
| 3 | "Sent from a pane" mark | Yes: Bench, Content and Creator Plus also skip text inside a Split Plus send mark, as they already do for Recon exports |
| 4 | Research claims into Content | A new entry in Content that does what its own "bring" does, marked "added from Research"; Content's existing paths unchanged |
| 5 | Content's "Continue in Research" | A button opens it in the pane beside; without a pane it stays the text to paste, as today |
| 6 | Stale copies | Split Plus's own notice between panes only; the app's "read before write" check stays off |
| 7 | Shell-command writes | Caught right after the command, and the other pane is told; file-tool writes are held one pane at a time |
| 8 | A send that starts the pane | Plain Send waits for you; a second button, "Send and start", starts the receiving pane at once. Both are your click |
| 9 | A send into a busy pane | Waits in the tray and is held until the run ends; "Hand over now" is one click away |
| 10 | The watcher's model | A "Watcher model" setting under Split Plus is the default and shows first in a watching pane's model menu; the usual drop-down changes it for that pane |
| 11 | Panes on a local model at once | Starting value 4 (setting, 1 to 4); online models never count |
| 12 | Name for saved sets of panes | "Pane sets" |
| 13 | Web page artifacts | Open as the safe cleaned page; "Run page" runs scripts with the internet blocked (a small runner of our own); "Allow internet for this file" only on your click |
| 13b | Where those web page rules apply | Only where Artifacts shows a page; the app's own preview stays as it is |
| 14 | Word and PowerPoint | You install LibreOffice yourself; the app's own viewer renders them; until then a card with "Open in its own app" |
| 15 | Editing in the panel | View only; changes are made by asking the pane's model |
| 16 | Versions | Keep everything, no limit. A clean-up view filters by size, type and age in days, and deletes what matches, so an important old one can stay while newer unimportant ones go, or the other way round |
| 16b | What clean-up deletes | The kept versions and the list entry, and, with a tick box per clean-up, the current file in your folder too. Everything goes to the app's trash first (30 days, Put back). A "Keep" star protects an artifact from any bulk delete |
| R2 | Rule 2: sends are material, not instructions | Kept as written. Code enforces the mark, never a decision, never an approval, never a permission change; the model is told; the pane's permission mode is the fence that always holds |
| R3 | Rule 3: Recon sealed | Sealed **while a run is going** (fear of planted instructions). After a run, its results (reports, and the files it made) must be easy to push to another mode: a new chat or an existing one. See R3a and R3b |
| R3a | Recon's Export during a run | Greyed during a run ("Recon is running; export when it is done"); after it, Export goes to an open pane, a new chat or an existing chat. On the Split page a Recon pane never gets a watcher or the shared folder. A change inside Recon that only makes it stricter during a run |
| R3b | Files Recon made | After a run, the Export window lists every text file Recon's own model wrote, quick to export. Files Recon downloaded (PDFs above all) can also be ticked, one by one, with a warning, for when you know they are safe. My addition, yours to undo: programs and scripts get a stronger warning, and Artifacts never runs them. A change inside Recon that loosens its seal after a run, at your request |
| R4 | Rule 4: never two writers on one file | Kept as written: one pane at a time per file (file tools), the waiting pane says so; shell writes caught right after; a held file is let go when the step ends, or after 2 minutes if a pane stops answering |
| R5 | Rule 5: a send never raises permissions or answers for you | Kept as written: permissions change only by your hand; a send never clicks an approval or an ask screen; pane sets open at the starting permission |
| R6 | Rule 6, reworded | "The app's own code and any outside plugin are never edited." Our own add-ons change only as you approved above |
| R7 | Rule 7, reworded | "A rendered artifact cannot reach the app's tools, my files or another pane, and reaches the internet only when I press 'Allow internet for this file'." Closed box always |
| DZ | **Danger zone** (applies to every rule and guard above) | Every rule, block and guard decided here starts as decided, but each one can be switched off by you in a Danger zone in Settings (a small warning icon), when you need it. Scope as I read it: the rules and guards of Split Plus and Artifacts, and the Recon changes made for them; existing add-ons' own guards are not included unless you say so |
| DZ2 | How long a Danger zone switch stays on | Until you switch it back; a red mark on every pane it affects; noted in that conversation's log |
| B | Who builds it | I build both now, myself, with the handbook and passports; Creator Plus's shortfalls are written down. You are changing and testing Creator Plus in your app right now, so your installed copy of it must be merged, never overwritten, before any install |
| RS | Your right-hand sidebar | You said either is fine. I chose **beside it**: Artifacts adds a tab to it and opens files there in a normal chat; on the Split page each pane has its own panel. Yours to undo |
| S | Send to, across the board | Send to works between any two conversations in any modes, not only open panes: an open pane, a new chat in a mode you pick, or an existing chat |
| R1 | Rule 1: no send without your click | Holds as written for now. **Later, a feature of its own:** automations that send between panes, and an orchestration layer where one pane (say Code) writes a prompt for another mode (say Research), Research reports back when done, and Code pulls what it needs |

## Open questions, to ask one at a time

1. Tiling: our own Split page from the app's own parts, the split-screen plugin in the browser version only, or extra conversations inside the right-hand sidebar?
2. Artifacts as its own add-on beside Split Plus?
3. The "sent from a pane" mark in Bench, Content and Creator Plus.
4. Research to Content: a new entry in Content, or ask Content's model to bring the packet in?
5. "Continue in Research" from Content opening in the pane beside.
6. Stale copies: switch on the app's own "read before write" check for every conversation, or a Split Plus notice between panes only?
7. Shell-command writes caught after the fact: acceptable?
8. Should a send be able to start the receiving pane at once? (Starting value: it waits for you.)
9. Busy pane: the app already supports both "hand it to the running job now" and "hold it until the run ends". Which is the default?
10. The watcher's model.
11. How many panes may use a local model at once (starting value).
12. A name for saved sets of panes, since "saved layout" already means Cowork shell's per-tab layouts.
13. HTML: safe page by default, a button to run its scripts with no internet, and a second button for the internet? And does this apply only in Artifacts panels, or also to the app's own preview?
14. Word and PowerPoint: you install LibreOffice yourself, or Artifacts converts them on your Mac with a small built-in reader?
15. Editing in the panel: view only, with changes made by asking?
16. Each of the seven fixed rules, one by one.
17. Building through Creator Plus is not possible as it stands: build Split Plus myself with the handbook?
18. Tests with your real models in the trial copy.
