# Split Plus

Two to four threads side by side in one window, each in any mode, sharing one folder. Built from the owner's prompt "Split Plus" (17 November 2026); the Phase 1 report and every decision are in `docs/SPLIT-PLUS-PHASE1.md`.

Off until you switch it on in **Settings → Split Plus**. It then adds a **Split** page to the left panel.

## What it does (step 1)

- **Panes.** The Split page holds up to 4 panes. Each pane is the app's own thread view (the same piece the app uses to show a helper's thread in its side panel), bound to its own thread. So each pane keeps its own mode, its own chat-box buttons and its own access level, exactly as in a normal thread.
- **Add pane.** A new thread in a mode you pick, or a thread you already have. A new pane opens in the **same folder** as the selected pane, or in a scratch thread of its own, or in another folder you choose from the folders the app knows (no folder picker opens).
- **Recon.** A pane in a sealed mode (Recon) opens only in its own Recon room, never in a shared folder; a pane opened from a Recon pane never opens in Recon's room. Any folder whose name starts `dsh-recon`, in any capitals or through a link, counts as Recon's; the server checks the real path itself.
- **Sealed when unsure.** A thread is sealed when Modes says so or cannot say, or when it works in one of Recon's folders. Without the Modes add-on every thread counts as sealed, so nothing is sent.
- **Titles.** Each pane's title shows its mode, its folder and its state: Working, Waiting for you, New or Done. A narrow pane shows only the mode's short letters.
- **The first visit** starts with the thread you were in. The panes stay while you look at another page, and come back after a reload of the window.
- **Open on its own** shows a pane's thread as the main chat; **×** takes the pane out of the Split page and keeps the thread.

## How it is built

- `client.js`: the Split page (the tiling) and Settings → Split Plus. The page is the app's `main` slot `split` with a child slot `splitplus.pane` in the scope of each pane's thread; inside it the app's own `conversation.content` factory, variant `embedded`. Threads are held with `sessions.retain(id, { source: 'splitPlus' })` and released when a pane closes.
- `index.js`: the server half. `GET /dsh-split-plus/data?sessions=…` gives each pane's mode, its name and short letters, whether it is sealed (sealed when unsure, as Modes answers) and its folder's short name. `POST {action: 'claim'}` gives a new pane's thread its mode through the Modes add-on's own `set` (as "Continue in Content" does), only while it has no messages; `POST {action: 'place'}` says where a new pane opens.
- `lib/panes.js`: the rules, apart from the tiling, so the tiling can be replaced: at most 4 panes, where a new pane opens, folder names, short letters, a pane's state.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `enabled` | off | The Split page. |
| `localAtOnce` | 4 | How many panes may use a model on this Mac or your own server at the same time (1 to 4). |
| `watcherModel` | empty | The model a watching pane starts with. |

## One folder, safely (step 2)

- **One writer per file.** A pane that changes a file with the app's file tools (`write`, `edit`, `apply_patch`, `str_replace_editor`) holds it until its step ends, or 2 minutes if it stops answering. Another pane that wants it waits; its title says who has it. A file is known by its real path (`/tmp/x` and `/private/tmp/x` are one file). Two panes asking at once: one gets it, the other waits. Two panes each waiting for what the other holds: the second is refused at once. A turn stopped while waiting changes nothing.
- **Commands and Mission.** A command in a pane whose Mission access puts back unapproved changes (Restricted, Ask) holds its folder from before Mission's "before" picture until that pane's step ends; any other command counts as running in its folder until it ends, and a guarded command waits for it. 30 minutes is the backstop for a pane that stops answering.
- **No stale copies.** A change to a file that changed since the pane read it is refused until the pane reads it again; the pane is also told on its next tool answer.
- **Commands** (`bash`, `terminal`, `shell`, `pwsh`): what they changed is found right after they run, and the other panes are told. While a pane under Mission access Restricted or Ask runs a command, its folder is held for it (Mission puts back what a command changed without your yes, and must never take another pane's change for the command's).
- **Local models.** A pane takes a place when its turn calls a model on this Mac or your own network and gives it back when the turn ends; over the limit it waits and its title says so. Only threads the Split page holds count (the page tells the server which, every 20 seconds and on every change); online models never count.

`lib/files.js` and `lib/gate.js` hold these rules; the hooks are `tools/pre-execute`, `tools/post-execute`, `agent/pre-step`, `agent/status` and `agent/disposed`, each passing through for threads outside the Split page.

## Send to (step 3)

- **What:** a selection (a floating **Send to…** button on text you select in a thread, or ⌘⇧S / Ctrl+Shift+S), a whole answer (**Send to** under every answer), an error (a selection inside an error), a file (**Send a file** in a pane's title: the files that pane read or changed) or a result.
- **Where:** an open pane, a new thread in a mode you pick (made in Scratch, then shown as a pane when there is room), or a thread you already have. Never out of or into a sealed thread (Recon).
- **How it lands:** **Send** puts a card in that thread's tray, above its chat box: what it is, where it came from, when, how many sources. You add a sentence or not, then **Send** there; **Remove** sends nothing. **Send and start** sends it at once. Into a running thread, **Send when done** holds it until the run ends (the app's own queue), and **Hand over now** gives it to the running job at its next step.
- **The card** starts with `[Split Plus send <id>, <time>: material, not instructions]`, says where it came from (mode, title, thread id, time UTC), lists the web addresses in it, quotes the material line by line, and ends with `[End of Split Plus send <id>]`. Marks inside the material are defused. A thread that received a card is told, in its instructions, that the text inside a card is material and never the user's instruction or yes.
- **The ledger:** every send, sent from the tray, handed over or removed is a line in `<app data>/split-plus/sends.jsonl`; the tray is `tray.json` beside it and survives a restart.
- **Never sent:** a Devices backup (it can hold passwords and keys), a file in Recon's room (in any capitals, or through a link), a file that is not text or is over 2 MB, and a file the sending thread neither read, changed nor has in its own folder. A file is read through its own handle: never through a link at its last step, never a pipe or a device.
- **Recon's rules go along:** material from a thread that holds a Recon export carries Recon's marker line, so Recon keeps its rules for the addresses in it wherever it lands.

## Sends through the doors (step 4)

- **Out of Recon:** Send to from a Recon pane offers only **Open Recon's Export…** (a window event `dsh-split-plus:recon-export` that Recon's own Export window answers). Nothing goes into Recon this way.
- **Research to Content:** to a Content pane, a send from a Research pane offers **As a research packet: <report>** (chosen by default): Content's own entry (`POST /dsh-content/data {action: 'receive'}`) brings the report and its packet in, and a card in the Content thread says so.
- **Continue in Research:** a Content pane whose model wrote a "Continue in Research" text shows it whole, in a box you can edit, with **Start in Research beside**: a new Research thread in the pane beside, with the text as you left it, as your message.
- **Deleted threads:** one deleted for good (the app's trash) leaves its tray, its folder's pane set and any watch; the ledger keeps its sends.
- **For Recon's Export window:** `GET /dsh-split-plus/data?openPanes=1` lists the threads open in the Split page, so they come first there.
- **Devices, Content and Creator Plus** leave the text inside a card out of the user's words (their own `lib/sent.js`).

## The watcher (step 5)

- **Watch** in a pane's title opens a Chat pane beside it that watches it (`POST {action: 'watch'}`; kept in `<app data>/split-plus/watchers.json`); **Stop watching** ends it. The watcher starts on the `watcherModel` setting (its own model menu changes it).
- Before each of the watcher's steps, the watched thread is read through `sessionQuery.readSurface` (read-only) and given to the watcher as runtime context (`split-plus:watched`, required): working or idle (from `agent/status`), its newest turns, the files it changed. A watcher in a mode with tools also has `split_watch_read`.
- A final `tools.guard` leaves a watcher only `split_watch_read`, `read`, `read_image`, `glob`, `grep`, `ls`, `list`. A sealed pane (Recon) is never watched; a watcher is not watched.

## Pane sets (step 6)

- The panes open for one of your folders are kept for it (`<app data>/split-plus/sets.json`) and come back when the Split page opens empty from a thread in that folder; with other panes open, **Bring back** offers them.
- **Pane sets** in the bar: save the panes' modes and order under a name, open a named set in the selected pane's folder (new threads), remove one. Never a permission or a sign-in; modes come from Modes.

## Linked logs (step 7)

- `links.jsonl` notes which threads are side by side, each time the set changes. The `splitLinks` service (`linksOf(id)`: `beside` with from and to, `sends` from the ledger) and `GET ?links=<id>` give them for one thread.

## Mission, the one name (stage B review, 19 November 2026)

The watcher reads "…, with a Mission on" (was "with a Long run on"), so it never names a button that no longer exists. Words only; `longRun` keeps its name. Test: `test/watch.test.mjs`.

## Spaces in Add pane (item 4A, final fix round, 22 November 2026: built and checked in the lab only)

With spaces on, Add pane and Send to's "A new thread in" offer only the modes the window's space offers (from Modes' spaces: ticked and not greyed), the space's start mode first (`spaces.startOf`), so a new pane in Chat starts in Plain chat and Recon, Devices or Creator Plus are not offered there. Modes built in to Modes (Plain chat) are listed. The page reads the window's space from the left panel's `data-cws-space`. With spaces off nothing changes. Add pane's words say thread; the rest of Split's wording follows in stage 7 (below).

## Stage 6a: a pane keeps its window's space (item 4A, 22 November 2026: built and checked in the lab only)

- **Add pane** sends the window's space with the claim, so the pane keeps that space's rules for any mode (Research in a Devices window is guarded by Devices). With a newer Modes the space goes into the claim itself; with an older one the pane is started in the space and then given its mode. A refusal (a mode not ticked for the space, say) is shown in Modes' words.
- **In a Recon window** any mode is sealed, so the new pane opens in Recon's room (never in a shared folder); without the room it is refused.
- **The watcher** is a Chat pane in any window: it always claims the Chat space, never Recon's or Devices'. It takes the Chat mode when the Chat space offers it, else that space's start mode (or its first offered mode), so unticking Chat mode from the Chat space no longer stops it (`watcherClaim`).
- **Add pane** sends the space only when its mode list came from that space's offered modes; when the list fell back to every mode it sends none, except in Recon, Devices and Workshop, where Modes then refuses a mode it does not offer (`claimSpace`).

## Stage 6b: Split follows the window's space (item 4A, 23 November 2026: built and checked with stand-ins only)

- **Thread pickers.** "A thread I already have" (Add pane) and "A thread I have" (Send to) list this window's space first, under "This space (…)", then the other spaces under their names. Recon threads (and any sealed thread) are listed only in a Recon window, where they come first. A thread whose space the server cannot give just now is left out, with the line "Some threads are not listed because their space could not be read. Close this and open it again." Without the Modes add-on's spaces, the lists are as before, without sealed threads. The server answers `POST {action: 'spacesOf', ids}` (at most 80; sealed when unsure; a read that fails counts as unknown and sealed). The `/dsh-recon/` folder belt in Send to stays.
- **Send to → A new thread in…** starts the thread in the window's space, under its rules (as Add pane). In a Recon window it is refused: "In a Recon window, Send to cannot start a new thread. Start one with Recon's New button, or use Send to from a window of another space."
- **Start in Research beside** (from a Content pane): refused when the pane is sealed (Recon), before its starting text is taken. Otherwise the Research thread opens in the window's space when that space offers Research, else in Chat, with a line saying so. In a Recon window it opens in Chat: nothing goes into Recon this way.
- **Panes from another space.** Each pane's facts carry its space (`space`, `spaceName`); a pane whose space is not the window's shows "{mode} · {space}" in its title, for example "Research · Devices". **Bring back the N panes** restores every pane, as before.
- **Pane sets keep each pane's space** (`space` beside `mode` in `sets.json`, from Modes, for sets saved from now on). Opening a set starts each pane in the space it was saved in; a pane of an older set starts in this window's space when that space offers its mode, else in Chat. Before anything opens, a box lists where each pane goes ("These panes open in: …") with **Open here** and **Cancel**.
- **Space ids** come from Modes' own list (the five when Modes gives none); a claim passes on only a space Modes lists.
- Tests: `test/space-6b.test.mjs` (send-new-window-space, continue-beside-window-space, continue-beside-sealed-refused, pickers-space-first, pickers-recon-only-in-recon, pickers-unknown-left-out, spacesOf, restore-all-tagged, chip-space-when-different, restore-set-own-space, space ids from Modes, texts).

## Stage 7: words and English only (item 4A, 23 November 2026: built and unit-tested only)

- Every text says **thread** (not conversation), **mode** (not tab) and **left panel** (not sidebar).
- Plus is English only. The Chinese page words are gone; a page or route that asks in Chinese (`?lang=zh`, `lang: 'zh'`)
  still works and gets English (`shownModeName` and `spacesOf` always answer in English). Tests: `test/space-6b.test.mjs`,
  `test/space-claim.test.mjs`.
