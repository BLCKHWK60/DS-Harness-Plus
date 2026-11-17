# Artifacts

Every file a conversation makes or changes, from every tab, shows as a card in its thread, opens rendered beside the chat, keeps its versions, and is listed on one **Artifacts** page. Built from part 7 of the owner's prompt "Split Plus" (17 November 2026); his decisions are in `docs/SPLIT-PLUS-PHASE1.md` and `docs/SPLIT-PLUS-BUILD.md`.

Off until you switch it on in **Settings → Artifacts**. It works with or without Split Plus.

## What it does

- **Cards.** Under each turn, a card for every file that turn made or changed: its kind, its name and its version. Every tab the same way.
- **Opening one.**
  - In a normal chat, a click opens the file in the app's own preview (its right-hand sidebar); the ◫ button opens the quick viewer beside the chat instead.
  - In a Split pane, the app's preview cannot open (its sidebar belongs to the one main chat), so a click opens the quick viewer to the right of that pane. **App preview** in the viewer shows that conversation on its own, with the file in the app's preview.
- **The quick viewer** shows Markdown (formatted, tables and lists; links are shown and copied, never opened; pictures from the internet are not loaded), web pages (see below), text and code with line numbers, CSV as a table, JSON as a tree that folds, pictures, audio, video and PDF. Word, Excel and PowerPoint open in the app's preview (with LibreOffice installed) or in their own app. **What changed** compares a text file's version with the one before, line by line.
  - **PDF:** the app's window may not show a PDF inside the viewer (it can stay blank). The viewer says so and offers **App preview**, which shows it in the app's own preview.
- **Web pages, safely** (fixed rule 7 as reworded by the owner):
  - A page opens **cleaned**: no scripts, no frames, no forms that send, no `on…` handlers, no outside pictures, and no link, refresh or base address that leads anywhere. The box's rules (nothing runs, nothing is fetched) come first in its head.
  - **Run page (it may reach the internet)** runs its scripts in a closed box that cannot fetch anything or reach the app, your files or another pane. A refresh, a base address and link targets are taken out first. **What it cannot stop:** a running page can still send itself to another address, and that first request may reach the internet. The viewer notices when the page leaves and closes it at once, but the request has already gone. Stopping it before it goes needs a guard in the app itself, which Artifacts may not add (rule 6). That is an open question for the owner.
  - **Allow internet for this file** lets that one file reach the internet, **and the machines on your local network** (your router, printers, other computers).
  - The box never reaches the app, your files or another pane: it has no origin of its own, and contents leave the server as plain data only, never as a page from the app's address.
- **What you can do with one:** open it in its own app, show it in Finder, save a copy to a folder (never over a file), copy it, send it to another pane or chat (Split Plus), keep it (★ protects it from clean-up).
  - **Open in its app** is only for documents, tables, pictures, audio, video and PDF. Never for a web page, an SVG, a script, a program, a link file (`.webloc`, `.url`, `.fileloc`), a `.command` or `.terminal` file, an Office file with macros, a file with no ending, or a file marked as a program. For those, **Show in Finder** shows it in its folder without opening it.
  - **Save to folder** looks at where the folder really is (through any link) before it makes anything, and never writes into Recon's room, whatever the capitals.
- **The Artifacts page** lists everything made, filtered by tab, kind, date and folder; each row opens its conversation.
- **Versions.** Every change of a file's content makes a version, kept in Artifacts' own folder (`<app data>/artifacts/versions`), never beside the file. Everything is kept, with no limit (the owner's answer).
- **Clean-up** picks artifacts by kind, size and age (never a kept one, never a Bench backup, never Recon's), shows how many match, then moves their kept versions and list entries, and with a tick box their files too, to the app's trash (30 days, Put back).
  - If anything goes wrong half-way, everything already moved goes back and nothing is removed.
  - **Put back** brings everything back. If the file was made again at the same place since, the new one is never overwritten. The one from the trash comes back beside it as `name (restored).ext`, and its older versions come back in front of the new ones.
- **Scratch threads:** an artifact made in a Scratch thread goes with the thread. Delete the thread and it leaves the list (it is in the trash with the thread); delete the thread for good and its versions go too.
- **Recon:** Recon's files show only inside Recon and are never listed. They are sealed when a Recon conversation makes them, and also when they lie in one of Recon's rooms (any folder named `dsh-recon…`, whatever the capitals and through links). From Artifacts they never leave Recon, even from inside Recon: no app, no Finder, no copy to a folder or the clipboard, no send. Recon's own **Export…** button does that once its run is done. With Modes off, nobody can tell a Recon conversation from another, so everything made is sealed until Modes is back.
- **Bench:** a Bench backup is listed and never shown or opened.

## How it is built

- `index.js`: after each tool call, what it made is found and recorded.
  - For the app's file tools (`write`, `edit`, `apply_patch`, `str_replace_editor`), from their arguments.
  - For other tools, from the paths in their answer that changed during the call. Only inside the conversation's folder or the app's own folders where tabs put what they make (Research, Content, Diagram, PDF pages, Creator Plus builds), by their real paths. Never a hidden file or folder, `~/.ssh` or `~/Library`. At most 500 paths are looked at. A tool whose name says it only reads (`read`, `list`, `get`, `search`, `fetch`, `find`, `query`, `view`, `show`, an MCP server's too) is never looked through.
  - For commands (`bash`, `terminal`, `shell`, `pwsh`), from a bounded look at the conversation's folder: 4 levels deep, at most 3,000 entries. Never `node_modules`, `.git`, a dot-folder, a link or Recon's room. Never your home folder, a folder above it or a system folder, by their real paths.
  - A file over 50 MB is told apart by its size and time instead of being read whole.
- Route `GET/POST /dsh-artifacts/data`:
  - `?session=` gives the cards for a turn's window of time.
  - `?item=`, `?content=` (plain data with `content-security-policy: sandbox`), `?diff=`, `?match=`, and the list.
  - POST actions `star`, `cleanup`, `openApp`, `reveal` (Show in Finder), `saveTo`.
  - A version is read from the file itself only while it is still a plain file there, never through a link put in its place.
- `lib/store.js`: the index (`index.json`) and versions. `lib/kinds.js`: kinds and the line-by-line comparison.
- `client.js`: the cards (`conversation.chat.turnTail`), the quick viewer, the Artifacts page (`main` slot `artifacts`), Settings → Artifacts.
- The app's trash: registered as the owner "Artifacts" with Put back.
  - The trash keeps only a clean-up's name. What it moved is written down in `<app data>/artifacts/trash/<name>/manifest.json`, so a clean-up of any size fits.
  - What the trash erases for good leaves Artifacts' trash folder too, checked every 15 minutes, and only while the trash is up (before then it lists nothing).
  - A clean-up on its way to the trash is never touched. One cut short before the trash took it (the app closed meanwhile) is put back. A folder without a manifest is left alone.

## Danger zone

Every rule above starts on. Each can be switched off in Settings → Artifacts → Danger zone; it stays off until switched back, the Artifacts page shows it in red, and each change is noted in `danger.jsonl`:

- Show Bench backups.
- Show Recon's files outside Recon.
- Open web pages running.
- Open web pages with the internet allowed.

## Not built yet

- A card for a file you attach, or for a file another pane sent.
- A viewer of a tab's own (Content's ledger, a research packet, a Bench device card), and Creator Plus's recipe for one.
- Editing in the panel (your answer: view only, changes by asking), "Ask the pane's model to change it" as a button, and dragging the panel out into a pane of its own.

## Known limit (the owner's answer: keep as is)

- **A running page can leave its box.** With **Run page**, a page's script can still send the box to another address, and that first request may reach the internet before the viewer closes it. Stopping it before it goes would need a change in the app itself, which Artifacts may not make (rule 6). The owner chose on 17 November 2026 to keep it this way; the button says "Run page (it may reach the internet)".
