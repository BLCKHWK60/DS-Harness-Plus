# Brief: @local/dsh-search

What it is for: Global search: one box, opened with Cmd-K, that finds threads by their titles and by the text of their messages across every space, and projects by name.

This brief was written by Creator Plus from the add-on's own files. Its README below is the full description, complete enough to rebuild the add-on from; improve this brief by hand, with the user's yes.

## What it must keep doing

- Its settings: shortcut.

## Its README

# Global search

One box that finds your threads by their titles and by the text of their messages, in every
space, and your projects by name.

## How to use it

- Press **Cmd-K** (Ctrl-K on other systems), or the **search icon** at the top of the left panel, or
  the **⌘K** button beside the search field in the list.
- Type. Titles are matched at once; the text of messages a moment later.
- Results are grouped by space (Chat, Code, Devices, Workshop), with the mode on each row (without spaces, by mode: Chat, Cowork, Code, Finance, Data, …), each with the piece of text
  that matched. Projects are listed last.
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
