# Global search

One box that finds your threads by their titles and by the text of their messages, in every
space, and your projects by name.

## How to use it

- Press **Cmd-K** (Ctrl-K on other systems), or the **search icon** at the top of the left panel, or
  the **⌘K** button beside the search field in the list.
- Type. Titles are matched at once; the text of messages a moment later.
- Results are grouped by space (Chat, Code, Devices, Workshop), with the mode on each row and the
  piece of text that matched. Projects are listed last. (Without spaces, or with an older Modes
  add-on, they are grouped by mode, as before.)
- Sealed threads (Recon) are never shown here, neither by their title nor by the text of
  their messages.
- Arrow keys move, **Enter** opens, **Esc** closes. A project opens a new thread in it.

Several words find threads that hold every word, not only the exact phrase.

## Search inside one space

The left panel has a search field at the top of each space's list (this part is in the Left panel
add-on, and works without this one):

- It filters that space's threads by title as you type, archived ones included.
- **Enter** also searches the text of messages and keeps the threads of that space that match.
- **Esc** clears it.

## Settings

| Setting | Starts as | What it does |
| --- | --- | --- |
| `shortcut` | on | Cmd-K (Ctrl-K) opens Global search. Off leaves that shortcut to the app. Only in the configuration file. |

## How it works, and what it changes

- **It switches on the app's own search of message text.** The app ships that search switched
  off. This add-on turns it on with one line in its patch. The index is built in memory at your
  first search and is gone when the app closes: nothing extra is written to disk. With this
  add-on switched off, the app's search is off again.
- **It leaves out the app's own notes.** The app adds notes to every thread by itself (the
  list of skills, instruction files), and its search finds them too. A piece of text that turns up
  word for word in three or more threads is taken to be such a note and left out.
- **Nothing is given to a model.** Results are only shown to you.
- **Sealed threads stay out (0.57.0).** Recon threads are sealed: other add-ons
  leave them alone. Global search drops them before it matches anything (`lib/hidden.js`), so
  they are found neither by title nor by message text. A thread counts as sealed when the
  Modes add-on's settings list it in `sessionIsolated` (the threads that began in an
  isolated mode, written at their first turn; Rerun's copies carry it too), or, for a thread
  open in the app, when Modes answers that it is (`modes.isolated`, which also covers a new Recon
  thread before its mark is stored). A thread moved into the Recon space after it ran
  (the left panel's "Move to" menu) stays findable, open or closed: Modes only locked it
  (its mode `isolated-late`), it holds nothing from Recon, and its stored mode alone
  (`sessionModes`) does not hide it. The check runs on the server side of the add-on, at every
  search. With the Modes add-on off, nothing is known to be isolated, and nothing is left out.
- The search field inside a space (left panel) still searches that space's own threads, the
  Recon space's included: it gets the ids of every text match (`hitIds`) and keeps only those of the
  space it is in, whose list it shows anyway.

## The shortcut

The app has its own Cmd-K, "search sessions", which focuses the search field of the app's own
sidebar. With the Left panel add-on that field is not there, so the key did nothing, and in the
desktop app the key never reaches the page at all. Global search therefore points that app
command at itself (and puts it back when it is switched off). The key can be changed in the app
at **Settings → Shortcuts**, under "search sessions". In the browser version the app's key for it
is Cmd-Alt-K; plain Cmd-K works there too.

## Good to know

- The first search after starting the app takes longer, because the index is built then.
- At most a few hundred threads are looked through per word; the box says when there are
  more matches than it shows.
- One piece of matching text is shown per thread, the one the app ranks best.
- Helper threads and empty new ones are not listed.
- Not searched yet: settings pages, Memory, the Library.

## Tested

- **Unit tests (6):** matching and grouping; the text search with a stand-in index (several pages,
  every word, repeated notes left out); which threads count as sealed (a thread
  moved into the Recon space, open or closed, does not); results that never show a sealed
  thread; the route in a stand-in app (settings, Modes, open threads, the index): an
  sealed thread is found neither by title nor by text, threads moved into the Recon
  space are found by both, and the space search still gets every text match.
- **Lab run in the app (before 0.57.0):** Cmd-K and the left panel button open the box; titles,
  message text and projects are found and grouped by mode; Esc and a click outside close it.
- **Confirmed by the owner in the desktop app (2026-11-14):** Cmd-K, the left panel icon, the search
  field in a space, and the right-click menu.
- **Not verified:** how well the repeated-notes rule works on a large real history; leaving out
  Recon threads in the desktop app (stand-ins only).

## Stage 6a (item 4A, 22 November 2026: built and checked in the lab only)

Belt for the Recon space: a thread Modes recorded in Recon (any mode) is never shown, and neither is one whose folder Recon says is its room (a closed thread whose space and mark were both lost). Devices and Workshop threads are found as before.

## Stage 6b: grouped by space (item 4A, 23 November 2026: built and checked with stand-ins only)

- **Headings are spaces.** With spaces on, ⌘K groups what it finds under Chat, Code, Devices and Workshop, in the order of the space buttons (your own order from Settings → Spaces, else the first place each space shows in the tab order). A hidden or unavailable space still gets its heading: its threads are reachable only here. Opening a row opens the thread as before (Global search does not change the window's space itself; lab check 22 confirms what the sidebar does). Each row shows its mode's name as a small tag (Research, Code, Plain chat, …), in the page's language.
- **Which space.** The Modes add-on says each thread's space (`modes.spaces.of`); a thread with no recorded space goes where its mode lives (Plain chat and Automations under Chat).
- **Recon never.** There is no Recon heading, not even an empty one. A thread whose space is Recon, or whose space could not be read just now, is not shown (on top of the stage 6a belt). When such an unread thread would have matched, the line at the bottom says: "Some threads could not be sorted by space just now and are not shown. Try again in a moment."
- **At most 60 per space**, newest title matches first; a longer list ends with "and N more: type more of the name".
- **Empty:** "Nothing found in any space." Every line is in English, also when the app is set to Chinese (Plus is English only).
- **Unchanged:** without the Modes add-on, with an older one, or with spaces off, the grouping by mode exactly as before. The ids of text matches (`hitIds`) still go to the left panel's own search; the box never shows them.
- Tests: `test/space-groups.test.mjs` (groups-by-space, mode-tag, recon-never-heading, space-read-throws-hidden, plain-under-chat, hidden-space-listed, old-modes-tab-groups, more-line, hitids-not-rendered).
