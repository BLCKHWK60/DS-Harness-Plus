# Recon

A sealed space and mode for research on .onion sites and Usenet text newsgroups: journalism,
finding and citing sources, open-source intelligence, threat intelligence, and Usenet's text
archives. It is not a browser.

**This version is steps 1 to 4 and 6 of 7.** It searches and reads .onion sites through Tor and
Usenet text newsgroups through your news server, as text only, behind the filters, with citations,
a research log, an export, and "End and wipe". WireGuard, the ordinary web and back channels came on 16 November 2026; saved searches are a later step.

You need the `tor` program: `brew install tor`. Plus does not install it.

Off until you switch it on at **Settings → Recon**. Needs the Modes add-on and the Left panel add-on (dsh-cowork-shell).

## The Recon space's start page

- **A greeting and starter chips** ("What should Recon look into?": search .onion sites, search
  Usenet, news coverage, an old web page, check a claim). They live in the left panel's space
  layout (`DEFAULT_TABS`, entry `recon`), so you can change them like any space's. A chip starts the
  thread in Recon's own folder, like the New button.
- **A status bar** under the chat box, only in the Recon space: whether Tor is installed, connecting
  or connected; Usenet on or off and how many accounts; the Internet Archive's route while it is on
  (read directly or through Tor); the thread's model, where it runs, and whether what Recon
  finds may go to it. With a cloud model it says that findings are held back until you type
  `/recon cloud`. Agreeing stays something you type on purpose: there is no button for it.
  A thread outside Recon's folder is told to start a new one with the New button. While the
  app has not loaded the thread yet, the model shows as "Model not known yet"; "No model
  picked" means the thread has none. Its hint says what sealed means: nothing from other
  threads comes in, and nothing of it goes to them. (Searches and reads still go out, through
  Tor, Usenet or the Archive, and findings go to the model as described below.)

## What a Recon thread has

- **Only its own tools:** `recon_onion_search`, `recon_onion_read`, `recon_usenet_groups`,
  `recon_usenet_search`, `recon_usenet_read`, `recon_news_search`, `recon_archive_find`,
  `recon_archive_read`, `recon_cite`.
- **Nothing else of the app:** no programs, no shell, no files, no memory, no skills, no helpers,
  no web search, no Deep research. A call to any other tool is refused, also in the PTC preset.
- **Standard preset only:** in the PTC preset the app offers tools only through programs
  (`run_code`), which Recon refuses, so a Recon thread there can do nothing. The model is
  told to ask you to start it again in the Standard preset. Since 21 November 2026 (item 7) a new
  Recon thread starts in Standard by itself and the app's preset menu is greyed in Recon,
  with an (i) that says why: the setting **Settings → Spaces → Recon → Preset in this space** is "Standard
  only" for Recon by default (the left panel starts it with `agentPreset: 'standard'`, and
  Modes switches a blank Recon thread back if PTC is picked elsewhere). You can change it to
  Any there; the row then turns red and asks first, because PTC runs code the AI writes, which
  breaks Recon's rule. That setting does not switch off Recon's own no-programs rule: Recon still
  refuses every program, so a PTC Recon thread still cannot do anything.
- **No notes from elsewhere:** no project instructions, no `AGENTS.md` (of the folder or of the
  app's home, where Memory writes), no skill list, no notes from other Plus add-ons.
- **No way in, no way out:** a thread that began in the Recon space stays sealed for good.
  Given another mode, or with Recon switched off, it is locked and has no tools. A thread
  that already ran in another space never gets the Recon tools.
- **Its tools belong to it alone:** no thread in another space is offered them.

## Models

- A model on this Mac or in your own network gets what Recon finds without a question.
- Any other model counts as cloud, and so does one whose place cannot be told. The tools then hand
  over nothing until you type `/recon cloud` in that thread. That holds for that
  thread and that model, and is forgotten when the app is closed.
- Since 18 November 2026 that is your choice: Settings → Recon → Models → Cloud models
  (`cloudModels`): Ask each time (the default, as above), Always (no question, in every Recon
  thread) or Never (not even after `/recon cloud`). Local and own-network models always
  get it. `mayReceive` in `lib/model.js` takes the choice as `policy`; tests in
  `test/cloud-models.test.mjs`.
- What Recon already found is in the thread's history, and every step sends the history
  to the model picked at that moment. So a thread that holds Recon findings takes no step
  on a cloud model you did not agree to: switched to another model, copied with Rerun, or with
  its history condensed. The step stops with a message that says why; nothing is sent.
  One exception: condensing a long thread sends its history to the model the app uses
  for condensing, and Recon does not check that model. Use a model on this Mac or your own
  network for it, or keep Recon threads short.
- No tier, no router, no fallback and no route-health switch moves a sealed thread to
  another model.
- `/recon` shows how a thread is sealed, its model and what is allowed.

## Searching and reading

- **Search** goes to a filtered index (Ahmia) at its own .onion address, through Tor. Up to 20
  results come back, each with its address. Another engine can be set in the configuration file
  (`otherEngine`, `engineHost`); the blocklist and the word screen apply either way.
- **Reading** an address needs it to have been shown in the thread: by a search, by a page
  already read, or in your own message, exactly as written. Since 0.43.1 the bare front page of a
  site that was shown is allowed too (models tend to shorten an address to the site's name). An
  address with anything added is not. Long pages come in parts.
- **Filters, in layers.** The index filters abuse material. Its blocklist of banned sites (about
  60,000, kept as fingerprints, fetched through Tor, renewed daily) is checked before any address
  is opened; without a list nothing is searched or read. A word screen runs on searches, result
  titles and descriptions, addresses, and page titles and text. A match is left out: not shown,
  not kept, not tried again; only the count is reported. A search the screen refuses is never sent.
  **No filter is perfect.** What makes pictures and video impossible to fetch is that Recon never
  asks for anything but a page's own text.
- **What the model is handed** sits between marks that say it is untrusted source text, with the
  source's number, address, retrieval time and a fingerprint of the text. A page's title and each
  link's label are shown on one line, with any marks taken out (since 0.57.0), so they cannot pass
  for Recon's own lines.
- **Citations:** every source read gets a number like `[S3]`. `recon_cite` gives its full citation.
- **Research log:** `/recon log` lists every search and every source, in order, with times.
- **After a restart** (since 0.57.0), the first Recon tool call or `/recon` command in a
  thread rebuilds its record from the saved thread: the numbered sources with their
  addresses, titles, authors and dates as shown and the time each was retrieved, the addresses it
  was shown, and what the assistant wrote. So earlier `[S3]` citations, links and `/recon export`
  keep working, and a new source is numbered above every number the thread already used (also
  one only the assistant or a condensed summary still mentions, if it is at most 500 above Recon's
  own numbers and not above 9,000: a page can make the assistant write any number). Only what Recon
  itself showed counts as shown: search results, links on pages it read, a redirect it reported, and
  addresses in your own messages; never an address the assistant wrote or one in a page's text. A
  page cannot pass its own words off as Recon's: a redirect counts only when Recon's sentence is the
  whole answer, and a page's links only when the list after the page's text is surely Recon's (the
  page's text checked against its fingerprint or its length, the list exactly as long as its heading
  says). In doubt an address is left out; it can be found again by reading the page again. A source
  whose every part is still in the thread gets its text back, checked against its fingerprint;
  one read only in part is marked so in its citation and the export, and is read again when more of
  it is needed. Nothing new is stored on disk, and a condensed thread gives back only what is
  still in it. The research log says "restored" only when something was put back. A thread
  ended with `/recon end` is not rebuilt (see "End and wipe").
- **Limits:** 400 requests per thread; a page's first 1.5 MB; 12,000 characters per part.
- **`/recon stop`** stops Tor and deletes its temporary folder.

## Recon's own folder

Every Recon thread runs in one empty folder, `/private/tmp/dsh-recon-room`, not in a folder
of yours. The app tells a model the path of its thread's folder; this one is outside your
home and says nothing about you. It is emptied whenever Recon starts. A room that has turned into a
link, is not a folder or is not yours is left alone, not emptied.
With Recon switched off the room is emptied at start too, but only if Plus prepared that very room
before (Recon notes the room's path in `recon/room-owner.json` in the app's home each time it prepares it)
and it already exists; it is never created while Recon is off, and a room the note does not name is left
alone. The lab protection above (`DSH_RECON_ROOM`, the real room never emptied on another data folder) is
unchanged.

An app started on another data folder than the usual one (a test copy: `DSH_HOME` set to a
throwaway folder, or `HOME` moved) gets a room of its own, `/private/tmp/dsh-recon-copy-<12 letters>`,
named after that folder; the data folder is read exactly as the app reads it and compared with the
account's own home. A data folder set some other way is caught when the app reports it, and the copy
switches to its own room then (`roomFrom`, `dataFolderOf`, `testCopyRoom`, `roomFor`,
`mayEmptyRoom`). A `DSH_RECON_ROOM` that is refused also gets a throwaway room of its own, never the
real one. 17 November 2026, after a test copy emptied the real room; tightened after an independent
review the same day.

Tests move the room with the environment variable `DSH_RECON_ROOM`, so they never empty the room
the running app uses. Only a folder whose name starts with `dsh-recon-`, directly in `/tmp` or the
system's temporary folder, and not a link, is taken; anything else is ignored. The real room's own
name is never taken, in any spelling: `/tmp/dsh-recon-room` and `/private/tmp/dsh-recon-ROOM` are
the same folder on a Mac. The tests' loader also refuses to start Recon when its room is the real
one by what the disk says (the same folder, not the same spelling).

- **Start a Recon thread with the New button in the Recon space.** It opens in that folder,
  shown as the project "Recon room".
- A Recon thread in any other folder has its tools switched off, and says why.

## Export

**Moving a thread out of Recon (18 November 2026, the owner's choice).** "Move to" in the
left panel on a Recon thread opens a NEW, ordinary thread in the picked mode, in that mode's
usual place (Scratch, or its project; never a room). The app cannot change a thread's folder,
and the room is shared and emptied at every start, so the thread is not moved in place. The
door's `move` action (`doorMove`, `lib/move.js`) works like the export door, since 1.0 (review B1, 18
November 2026): the left panel first opens the same preview window (what leaves, what never leaves, the
warnings, the room's files with none ticked, and for Settings → Recon → Models = Ask a tick to agree to a
cloud model). Only after the user's yes does a new thread open. A cloud model is refused (nothing is
made) when Models says Never. What goes is the newest report and the sources it cites as citations
(`summary.md`), only the files the user ticked, and, if ticked, the whole thread as
`conversation.md`, all in `<new folder>/from-recon-<id>`. The first message is a short DRAFT put in the
chat box (it names the folder, holds no page text) and is never sent automatically. The move is recorded
as an export into the new thread (the export rules hold there; Recon's cloud check treats it as
holding Recon's findings; Shared sync leaves it out through the `reconMoved` service). A whole project of
Recon threads is never moved at once. The new one is named "From Recon: <title>". The original
stays in Recon, unchanged; its room files go at the next start as always, the copies stay. Locked threads move the same way. `/mode` still refuses in place and points to Move to.


`/recon export` writes one text file: the research log, every source with its citation and its
text, and what the assistant wrote.

- **Made so that it cannot act as instructions.** A notice at the top says what the file is.
  Everything from a source, and everything the assistant wrote from it, is quoted (each line
  begins with `> `) between marks, and marks inside the material are taken out so nothing can
  close a block early. Only the citations and the log, which Recon writes itself, stand outside.
- **Where:** the folder `recon/exports` in the app's home, or the folder set as `exportFolder`.
  The command shows the file's path. Files are readable by you alone.
- **After a restart** the export holds what was rebuilt from the saved thread (see
  "Searching and reading"): a note from before the restart has no time of its own, and a source read
  only in part says which parts are missing.
- The marks protect only as long as they stay in. Another thread or tool that is given the file
  still has to respect them; Recon cannot make it.

## The export door (step C8, 16 November)

The owner's answer: build it. Recon stays sealed; this is its one way out, and only the owner opens it.

- **Who:** the **Export…** button in the chat box of a Recon thread of its own (not a helper's,
  not one ended and wiped). Recon's model and its helpers get no new tool and cannot start an export.
  The app's own code copies plain text; Recon's lock is not loosened.
- **What goes** (`lib/door.js`): the report packet (the default: the newest report the thread's
  own model wrote that cites a source, else its newest answer, and only the sources it cites: none
  when it cites none) or the whole thread (every report of its own model, the owner's own
  messages, every source). A Mission helper's answer (often a page extract) never goes. Sources go as
  citations only: title, address (an Archive copy with its original), author and date as shown, when
  read, the route, the text fingerprint, and on each **origin: Recon**, its lane and the export date.
  Reports, messages and the source list (titles and authors are written by the pages) are quoted so
  they cannot act as instructions.
  Recon keeps no claims table, contradictions, timeline, lead list or coverage map of its own, and
  the export says so: Content builds its ledger from the report.
- **After a run only, and only its own files** (the owner's answers of 17 November): Export is greyed
  while the thread runs (a turn or a Mission), and the server refuses it then too. The window
  lists the thread's own files in Recon's room (`lib/roomfiles.js`): everything in its run folder
  (`run-<its id>`) and any other file its own tool calls named; never another thread's run folder,
  a hidden file, a link, or a file with a second name (a hard link, which could be a file from outside
  the room). Text files are ticked and go in quoted, as Recon material; any other file (a PDF) is
  unticked, with a warning, and is copied unopened into the export's own folder, never into the room.
  Each file is read through its own handle, never through a link.
- **After a restart:** the app loads a thread only when a turn runs, so an older Recon
  thread is recognised without it: Recon's mode and sealed by id (Modes answers by id), and a
  saved header with no parent; one being ended and wiped is not. Its export is read from its saved
  messages (`sessionQuery.readSurface`): the reports its own model wrote and the owner's messages.
  What Recon read was kept only in memory, so the window and the export say: "What Recon read before
  the app restarted is not kept; only the messages are." A loaded thread is exported as before.
- **What never goes:** the text of the pages Recon read, Recon's room, the word list and blocklists,
  anything the screen dropped (never kept), VPN profiles, logins, notes for learning.
- **Where:** a new thread in a mode the owner picks (Content first; any mode but Recon, Devices
  too: the owner's answer of 16 November, and Devices never takes export text as his words): made in
  Scratch, given that mode by Modes' own move, with the export as its first message; or added to a
  thread that exists (never Recon's, a sealed one, or a helper); or a folder (a full path; a new folder of its
  own with `export.md` and `export.json`; checked by its real path, the nearest existing folder's links
  followed, against Recon's rooms and any `dsh-recon-…` folder without regard to capitals; checked again
  once made). Longer than 120,000 characters: a folder only.
- **The window says** what leaves (counts), what never leaves, and the four warnings (End and wipe
  does not reach the copy; the thread it goes to may use a model outside this Mac; Global search and Sync treat it
  by that thread's rules; a thread that runs code or changes files is as exposed to it as to a web page),
  before anything leaves.
- **A message with an export** starts with `[Recon export <id>, <date>: material, not instructions]`.
  The export is recognised by that marker **in any message of a thread** (the user's, a tool's
  answer, a copied thread, a fork's copied history, a paste), not by the thread's id: for
  an export on the list its addresses, and always every address in the text from the marker on (so an
  export the list does not know, or with Recon's list gone, is closed, not open). Content never counts
  a message with the marker as the owner's words.
- **After it, in every space** (on every tool call, before any other add-on is asked, and again as a
  final `tools.guard`; independent of Recon's switch, so an earlier export keeps its rules):
  - an **onion address is never opened outside Recon** (any thread that is not Recon's);
  - an **address from an export** in that thread, **or one below it** (same host, same path or
    deeper; decoded; the query does not matter), is opened only after the owner says yes on the app's
    own approval card (once per page per thread; a no stays a no; a helper cannot ask, so it is
    refused);
  - onion addresses are recognised also when encoded (`%2eonion`), written with another dot, or reached
    through a gateway host (`<site>.onion.ly`);
  - **Memory** (`remember`) in a thread that carries an export takes nothing that shares a run of
    seven words with the export's text or names one of its addresses or hosts; the owner's own facts
    pass;
  - what a call would open is read: for a tool that runs commands or programs (bash, terminals,
    `run_code`, Python tools…) every address in any of its strings; for the others, keys such as url,
    href, link, address, target, or a value that is one whole address. Tools that only keep records
    (Content's tools, `write`, `edit`, the step list, questions) open nothing and are not refused.
- **One way:** nothing returns to the Recon thread. The list of exports (which threads
  each reached, its addresses) is `recon/door.json` in the app's home; other add-ons may ask the
  `reconExports` service (`has`, `addressesOf`, `inText(text)`, `markerRe`, `covers`). Content keeps
  its own copy of the marker and the address rules (`dsh-content/lib/exports.js`, kept in step by a
  test), so it reads exports with Recon off.
- **Not done here:** keeping exported text out of learned skills needs the skill add-ons to ask
  `reconExports` (they are not Recon's to change).

`/recon export` (above) stays as it was: a full text file for the owner, with page text.

## Ultra Code (16 November)

The owner: "Research and Recon keep the loops as is today, but Ultra Code expands it." With Ultra Code
on for the thread (`modes.ultraCode(id) === true`; off or unknown: Recon exactly as today, the
recipe not offered and refusing), the thread itself (never a helper) gets `recon_ultra`, a fixed
recipe in Recon's own code (`lib/ultra.js`), never a workflow a model writes:

- **search:** each sub-question its model names (at most 6) goes through every lane that is on (onion
  sites, the ordinary web, news), and a counter-search on each key claim (at most 3), through the same
  functions as Recon's tools (the same screen, blocklists, routes and research log), one call at a
  time (Tor takes one), at most 60,000 characters back.
- **report:** two writers and a judge, helpers of the thread on its own model, write the report
  from the sources it read (citations and the start of each text, at most 80,000 characters). They
  have no tools: Modes gives a Recon thread's helpers none, and Recon refuses any call they make
  (by their id and their task). Recon's model check comes first: with a cloud model the user has not
  agreed to, nothing goes. Nothing is written anywhere, no model runs anything, and nothing leaves
  Recon's room.

- **Bounded and stoppable:** before every lane call the search checks that the call was not stopped,
  Recon is still on (so Tor is never started again after Recon is switched off), the thread was
  not ended, and its 30 minutes are not up; an ended thread's log is not written to again. With
  the thread's Web off (`modes.webOff`) the recipe does nothing.
- **What it answered counts as found:** a `recon_ultra` answer in a history keeps that history from a
  model the user did not agree to, as every Recon tool's does (its refusals do not count).
- **The judge** is taken only when it ended normally, kept the citations and is of a sane length;
  otherwise draft 1 is the report and it says so. Drafts are cut at 40,000 characters. Material and
  drafts sit between markers with a random part, so no text inside can close them.
- **Their refusal** is scoped to the recipe's own helpers (by their id, cleared when they end, or a
  helper of a Recon thread whose task says so), and holds again as a final `tools.guard` (in a
  Mission Modes offers Recon's helpers file tools).
- Recon's method is unchanged; the tool describes itself, and is offered only while Ultra Code is on.

Helpers outside a Mission get no tools (Modes' rule for sealed modes), so the wider searching is done
by Recon's code, not by more helpers. Missions in Recon are Mission's and are unchanged.

## End and wipe

`/recon end` ends a thread for good. Typed alone it deletes nothing and says so; `/recon end confirm` does it:

- what it read (sources, notes, shown addresses, a cloud agreement) is forgotten;
- Tor is stopped and its temporary folder deleted;
- the thread is closed and taken off the list;
- its files are deleted. They do not go to the trash.

The app holds an open thread in memory, so its files are deleted as soon as the app lets go
of it, at the latest when the app next starts. Until then only its id is kept on a list
(`recon/wipe.json`). An export made earlier is yours to delete.

Until then the left panel's Archived list shows it as "Being deleted", without Restore or
Delete, and its trash refuses it: Recon offers its list as the `reconWipe` service (`has`, `list`).
If it reached the trash some other way (deleted from the Archived list before 0.58.0), the wipe takes
it out of the trash and the trash's waiting list too (`wipeTrashed` in `lib/wipe.js`), so an ended
thread can never be put back.

Until its files are gone, an ended thread is not rebuilt from its history (see "After a
restart" under "Searching and reading"): `/recon log`, `/recon export` and the tools find nothing
it read. Only its numbering is
kept, so a source read in it afterwards never takes an earlier number. If the app cannot delete it
(it says so), its saved history still holds what it read until you delete it yourself; after a
restart, such a thread is rebuilt like any other.

End and wipe deletes the thread's own `run-<id>` folder in the room, not files it may have
written straight into the room's root. Nothing records reliably which root files a thread
made: the Export window's list (files its tool calls named) also matches files it only read, files
you put there and same-named files of another Recon thread, so deleting by it could remove
something that is not its. Since stage 6a no Recon-space tool writes into the root (file tools,
`data_chart`, `data_python`, diagrams and Scout write only into the run folder), and the whole room
is emptied at every start of the app.

## More sources: Internet Archive and GDELT

Two services on the normal web, each off until you switch it on at **Settings → Recon → More
sources**. Recon reaches them only at their own addresses (`web.archive.org`,
`api.gdeltproject.org`), with their certificates checked, and as text. GDELT always goes through
Recon's own Tor.

- **Read Internet Archive copies directly (not through Tor)**, on by default (since 0.57.0, the
  owner's choice: through Tor the Archive refused every read in two real runs). The Archive's list of
  copies and the copies themselves are fetched straight from the Archive: still one GET, text only,
  with the same filters, pace and limits. The locked process reaches one local port, which the app
  opens for one request and passes on to `web.archive.org:443` and nowhere else; the encryption runs
  from the locked process to the Archive. **The Archive then sees this Mac's internet address** and
  which pages were asked for. Off: through Recon's Tor, as before. A refused request is never
  retried the other way. `/recon`, the start page's status bar, the tool answers, the research log
  and each citation say which route was used.

- **Internet Archive.** `recon_archive_find` lists the dated copies of a web page;
  `recon_archive_read` reads one copy as text. This is the only way a page from the normal web is
  read in Recon. A citation names the page's own address, the date of the copy and the Archive's
  address for it.
- **GDELT news index.** `recon_news_search` lists where a topic was reported in the last days
  (title, address, publisher, country, language, date). GDELT holds no articles; an article is
  read as an Internet Archive copy.
- **Both limit automated use, and more so through Tor,** whose exit addresses are shared by many.
  GDELT allows one request every five seconds; the Archive blocks what it takes for bots. A
  refusal is reported as what it is ("asked to slow down", "refused the request"). Recon paces its
  requests and never tries another route. After a refusal, that kind of request (list of copies,
  reading a copy, news search) is held back for a while, whatever the model asks. After a second
  refusal in one thread it is off for the rest of that thread, so the model finishes
  with what it has instead of waiting and asking again. In practice, reading Archive copies
  through Tor is mostly refused; the list of copies and GDELT usually answer. When a copy cannot
  be read, the model is told to give GDELT's titles and links as leads and say it did not read them.
- The word screen applies to searches, addresses, titles and pages, as everywhere. There is no
  blocklist for the normal web.
- GDELT sees a request come from Tor, and what was asked for. The Archive sees the same through
  Tor, or this Mac's internet address when it is read directly.

Not built: Nostr, IPFS, I2P. Left out on purpose: Hyphanet (Freenet) and ZeroNet, which would
store or re-share other people's content on this Mac.

## Usenet

Off until you choose a route at **Settings → Recon → Usenet**. You need at least one account with a
Usenet provider; you can have up to eight.

- **Route:** a direct encrypted connection to the news server of the account a request names. That
  server sees your internet address and knows that account, as with any newsreader. Tor is not used
  for Usenet.
- **Accounts:** each one is a news server with its own login. You add one on the page: a name (which
  is optional), the server, and a port (563 unless you say otherwise). A tool call may name the
  account to use, by its name, its server or its id; when it names none, the account marked as the
  default is used, and with no default the first one is. A single server set in an older version of
  Plus shows up as the first account and goes on working.
- **Logins:** kept in the macOS Keychain and nowhere else, one item per account. You store each one
  yourself in the Terminal; the page shows the command for that account, and the password is typed
  at a hidden prompt. The first account uses the original item:
  `security add-generic-password -U -s dsh-recon-usenet -a YOUR_USERNAME -w`; any later account adds
  its id to the item's name: `-s dsh-recon-usenet-<id>`. Recon reads a login only at the moment it
  signs in with that account. A login is in no file, setting, log or thread, and no tool or
  command shows it.
- **Text groups only.** A group whose name says it holds files (binaries, pictures, multimedia,
  sounds, movies and the like) is never listed or opened. The rule errs on the safe side, so a few
  text groups about such subjects are left out too.
- **`recon_usenet_groups`** finds text groups by name. **`recon_usenet_search`** matches subject,
  author and date in the newest 3,000 articles of one group; Usenet has no full-text search.
  File postings (yEnc, "(3/41)" part counts, oversized articles) are skipped.
  **`recon_usenet_read`** reads one article by its Message-ID. All three take an optional `account`
  (a name or a server): it decides which news server is visited and which login signs in.
- **An article that carries a file is refused.** Its headers decide first, before its body is
  asked for (not plain text, too large, posted only to file groups). A body that turns out to
  hold yEnc, uuencode or a long run of base64 is refused and not kept. Parts of an article that
  are not plain text are dropped.
- **Citations** name the group, the Message-ID, the author and date as shown, and when it was
  retrieved.
- **The same locked process** does the reading. It reaches one local port, which the app opens
  for the length of one request and which only passes ciphertext on to the news server.

## The connection layer

- **Recon's own Tor.** Started when needed, stopped with the app or with Recon. It keeps its state
  in a throwaway folder that is deleted when it stops, listens only on this Mac, and refuses any
  request that looked a name up outside Tor. The `tor` program is not part of Plus:
  `brew install tor`. If Tor stops, nothing is sent and nothing falls back to another way.
- **One locked process per page** (the macOS sandbox). It can open one local port, the proxy's
  (or, for Usenet and the Internet Archive read directly, the forwarder's to that one server), and
  nothing else; it cannot read your folders or other disks, write anywhere, or start a program. It
  gets none of the app's environment. Outside Tor it connects only to an https address whose
  certificate it checks.
- **Text only, by never asking.** One GET for the page itself: no pictures, scripts, styles or
  frames are requested, no cookies are kept, nothing is posted. An address that is not text is
  refused before its content is read. A redirect to another site is reported, not followed; one
  inside the same site is followed, at most three times.
- **What comes back is plain text:** scripts, styles, frames, comments and hidden characters are
  gone; only links to .onion addresses are kept.
- **Addresses:** only current .onion addresses, and only ones the thread was shown (by a
  search, by a page it read, or by you).
- **Settings → Recon → Test Tor** connects this Mac to the Tor network, opens no site, and stops.

## Settings

| Setting | Starts as | What it does |
| --- | --- | --- |
| Offer the Recon mode (`enabled`) | off | Adds the Recon mode, the Recon space and its tools. |
| `torPath` | empty | Where the tor program is. Empty looks in the usual places. Only in the configuration file. |
| `otherEngine` | off | Search with another .onion engine than the built-in filtered index. Only in the configuration file. |
| `engineHost` | empty | That engine's .onion name. Used only while `otherEngine` is on. |
| Connect to Usenet (`usenetRoute`) | off | `direct`: an encrypted connection straight to the news server of the account used. |
| Usenet accounts (`usenetAccounts`) | empty | The servers, each with its own login. Added on the page. |
| `usenetDefaultAccount` | empty | The account used when a tool call names none. Empty uses the first. |
| `usenetHost`, `usenetPort` | empty, 563 | The one server of older versions. Read only, to become the first account. |
| Internet Archive (`archiveOn`) | off | Lets the assistant list and read archived copies of web pages. |
| Read Internet Archive copies directly (`archiveDirect`) | on | The Archive is read straight, not through Tor, and sees this Mac's internet address. Off: through Tor. Changes take effect at once. |
| GDELT news index (`newsOn`) | off | Lets the assistant search news coverage, through Tor. |
| `exportFolder` | empty | Where `/recon export` writes. Empty uses `recon/exports` in the app's home. Only in the configuration file. |

## What it does not do yet

- **No saved searches:** a later step.
- **What was read stays in memory** until the app is closed or the thread is ended, and in
  the thread on disk until it is ended. After a restart it is rebuilt from the thread
  on disk (see "Searching and reading"); Recon keeps no copy of its own.
- **What Recon writes to disk:** the blocklist (`recon/blocklist.json`, fingerprints only), the
  list of ended threads waiting to be deleted (`recon/wipe.json`, ids only), and the exports
  you ask for.
- **The app still tells the model two things:** the app's own install path and its local address.
  The folder path it is told is Recon's own.
- **The app's base text** still names tools the thread does not have (workflows, MCP
  servers). They cannot be called.
- **Until it is ended, the thread is kept on disk** like any other, and its title is written
  by the model set for titles.
- **Plugins from other makers** are not covered by these rules.

## Tested

- **Unit tests (9, plus the 3 below):** the mode, where a model runs, the agreement for cloud models, the tool gate.
- **Lab run with a stand-in model**, reading exactly what the model was sent:
  the tool list was the six tools of that version (nine now); project `AGENTS.md` and Memory do not arrive; a shell call is
  refused; a Cowork thread is not offered the tools; a thread moved in or out is locked.
- **Connection tests (6), against stand-ins on this Mac only** (a local web server as the .onion
  site, a script as the tor program): text arrives; the site is asked for the page and nothing it
  points to; no cookie is sent; an image is refused; a redirect is not followed; the locked
  process cannot connect around the proxy, look a name up, or read a file of yours; with Tor
  stopped nothing goes out and its folder is gone.
- **Search and reading tests (4), same stand-ins:** a refused search is not sent and Tor is not
  started for it; the blocklist is fetched first; banned and screened results are left out; only
  shown addresses are opened; a page's picture is not requested; a screened page is not kept;
  redirects inside a site are followed, to another site reported, off .onion refused; the refused
  words are not in the log.
- **Usenet tests (4), against a stand-in news server on this Mac** (NNTP over TLS with a test
  certificate): only text groups are listed; file postings and screened subjects are skipped; an
  article is read, fenced and cited; a zip is refused from its headers with no body asked for; a
  yEnc body is refused; the login reaches the server and appears in no message or log; without a
  route, a server or a login nothing is sent.
- **Account tests, run with `node test/*.test.mjs`** (74 checks, no network): a saved list of
  accounts is read back as saved, and the one server of older versions becomes the first account on
  the original Keychain item while a later account gets an item of its own; a request reaches the
  account it names by name, server or id, with that account's login, and the research log says which
  server was used; an unknown account, a server that is not set and a missing login are refused with
  nothing sent; the page's data lists every account with its own commands and carries no login; and
  the page renders, showing a row per account and writing the list, the cleared older server and the
  default account when accounts are added, removed or marked default.
- **Export and wipe tests (3):** nothing from a source or the model stands outside a quoted block,
  and material cannot close its own block; an export is a new file readable by the user alone; a
  wipe deletes a thread's own folder and refuses any other folder.
- **Lab run in the app with a stand-in model:** search, read, `/recon log`, `/recon`; the Usenet
  settings and page; the New button opens a thread in Recon's folder and the model is told
  that path and none of the user's; `/recon export`; `/recon end`, after which a restart left no
  file of the thread, in the threads folder or in the trash.
- **Run by the owner on the real Tor network (2026-11-14, tor 0.4.9.17, a local model):** Tor
  connected, the blocklist was fetched, a search on Ahmia returned 20 results, and a page was
  read and cited with its source number.
- **Archive and GDELT tests (3), against stand-ins only:** switched off, refused by the filter or
  told to slow down, nothing is read; only the two services' addresses are ever asked; through the
  stand-in Tor with certificates checked: a news list, a list of copies, a copy read, fenced and
  cited, a redirect out of the Archive not followed, and a stranger's certificate refused.
  **Never run against the real services through Tor.** In a first look from the normal web, the
  Archive's list of copies answered as documented, while GDELT and the Archive's page copies
  refused the requests; GDELT's answer format is from its documentation only.
- **Run by the owner against a real news server (2026-11-14):** the Keychain login, the sign-in,
  listing text groups, header search, and reading and citing an article work. The builder has no
  account and never touches the owner's.
- **0.57.0 tests (all against stand-ins, no network):** the room moved to a throwaway folder in
  every test that starts the add-on, a refused `DSH_RECON_ROOM` (home, nested, `..`, a link, the
  real room under another spelling or case), the loader refusing the real room by what the disk
  says, and a room turned into a link left alone (3); the record rebuilt after a restart from
  answers made by Recon's own code: numbers, addresses, titles, dates, routes and notes back, a
  partly read source marked and read again, a whole one served from memory with its fingerprint
  checked, an address only the assistant wrote or only in a page's text not opened (also Recon's
  redirect sentence written in a page, a link label over several lines, and a title in an older
  answer that writes marks and a links heading of its own), a number a page makes the assistant
  write not pushing new numbers out of reach, a citation's fingerprint read from Recon's own line,
  new numbers above every number used, and in the running add-on the history read once at the
  first tool call, "restored" in the log only when something was put back and in the right number,
  and nothing rebuilt after `/recon end` (13); the Archive read
  directly: no Tor, the way out only to `web.archive.org:443` and shut after each request, the
  route named in answers, log and citation, GDELT still through Tor, a refusal not retried through
  Tor, and end to end through the real locked process and forwarder to a stand-in Archive with its
  certificate checked (3); the setting, the page's switch, `/recon` naming the route, and the status
  bar's data and drawing for a local, a cloud and an agreed model, a model not known yet, no model
  picked, and a thread outside the room, with no button and a hint that says what isolation
  means (Settings and page checks); the space's greeting and chips the same
  on both halves of the left panel (2).
- **Not verified in the running app:** the status bar's place on the start page and its look, the
  greeting and chips, the rebuild after a real restart, and the Archive read directly against the
  real service (never run by the builder).
- **Not verified:** the cloud agreement in the running app (unit test only); other engines than
  Ahmia. The builder has never run the real tor program or opened an .onion site. Ahmia's page formats were read once on the normal web on 2026-11-14 and can change;
  if its result page changes, a search falls back to the page's plain .onion links.

## Long run in Recon (16 November 2026)

(Since Mission stage B, 19 November 2026, the Long run is simply called **Mission**; see the section below. This section is its history and still holds.)

A Recon thread can run a Long run (the Run button next to Send, with Mission on). Recon keeps it inside its rules:

- **Helpers belong to the thread.** A run's planner, workers and reviewer are helpers of the Recon thread. Everything Recon keeps per thread goes by that thread (`topIdOf`): the numbered sources and the research log, the .onion addresses it may open, your `/recon cloud` agreement, the notes for the export, and the check before every step that findings go only to a model they may go to.
- **One model.** Helpers use the thread's own model, never another role model.
- **No programs or commands.** The thread gets Recon's tools and `mission_step`; helpers get Recon's tools and, with Files on, the file tools (read, write, edit, multi_edit, glob, grep). By default Mission runs no check commands in such a run: the reviewer judges each item.
- **Checks without the internet (a switch, off by default; the owner's choice, 16 November 2026).** Settings → Recon → Long runs → "Let a Long run check its work, without the internet" (`longChecks`; service `recon.longChecks()`, read when a run starts). On: the planner may give checks on the run's files (it is told they have no internet, see only the folder and start no other program), and Mission runs each inside a macOS sandbox (`offlineFence` in dsh-mission `lib/shell.js`): no network and no name lookups, no Mac services (`deny mach-lookup`, so nothing can ask another program to go online), no `open`, `osascript`, `shortcuts` or `automator`, nothing of the home folder or other disks read, writing only in the run's folder (its temporary files too), device ports closed. Without the Mac's sandbox such a check is not run. Tried on this Mac: a local server reachable from outside was refused inside ("Operation not permitted"), a name lookup failed, reading the home folder and writing outside were refused, and test, grep, wc, sort, sed, awk, ls, cat, find and python worked. Helpers still never get commands; the run still uses one model and keeps no record outside the room. The Long run card says which applies.
- **Its own folder.** The run works in `<room>/run-<conversation id>` (`recon.runFolder`), with Mission access Restricted there; helpers are moved into it before their turn. Mission writes nothing about the run outside the room.
- **End and wipe** ends the run (`mission.endRun`), deletes its folder, and deletes the helpers' saved threads with the thread's.

Mission asks `ctx.get('recon').runs()`: without it a sealed thread is left alone, as before.

### Called Mission now (Mission stage B, 19 November 2026)

Mission and Long run are one thing, called **Mission**. In Recon a Mission starts with **Start Mission** beside Send (choosing Mission in Depth only selects it; Mission stage D, 20 November 2026), with Mission on and Recon's `runs` allowed, and keeps every rule above. Since stage D a Recon Mission also runs several helpers at once (Helpers at once), all inside Recon's fence, with no question pass at the start. A typed `/mission <goal>` was refused in Recon until stage E; since stage E (20 November 2026) it works wherever Start Mission does (see below). Only words changed in this add-on: Settings → Recon → **Missions** → "Let a Mission check its work, without the internet" (the key `longChecks` and the service `recon.longChecks()` are unchanged), the save notes, and the "Helpers only in a Mission" line on the Recon page. Not tested in the running app.

## WireGuard, the ordinary web and back channels (16 November 2026)

- **WireGuard** (`lib/vpn.js`): everything Recon sends outside Tor (Internet Archive copies read directly, Usenet, the ordinary web, the back channels) goes through a WireGuard tunnel run by `wireproxy` for Recon alone (the Mac's own network is not changed). Settings → Recon → WireGuard lists the configurations: the first is the primary, the others backups, tried in order; a running tunnel is checked again after a minute and the configurations are tried again when it stops passing traffic or the order changed. Each configuration's file is in the macOS Keychain (`dsh-recon-wg-<id>`, base64), put there by the user with the two-step command the page shows (copied, then pasted when `security` asks, so it never shows on a command line); Recon writes it for a moment into a 0700 temporary folder and deletes it once wireproxy has read it. wireproxy's own messages are never passed on (one about a bad key repeats the key). A configuration needs a DNS line. Without a working tunnel nothing is sent; `/recon direct` allows direct connections for one thread (memory only), `/recon block` takes it back.
- **The ordinary web** (`lib/clearnet.js`): `recon_web_search` (DuckDuckGo's HTML page, then Mojeek, then Marginalia) and `recon_web_read`. Only addresses the thread was shown (search results, links on pages it read, the user's messages; oldest dropped past 8,000), never a bare number address, the site's own port kept. Settings → Recon → More sources → The ordinary web.
- **Back channels** (`lib/boards.js`): `recon_board_search` / `recon_board_read` for 4chan (a board's live catalog and threads), 4chan archives (desuarchive, b4k, palanq; FoolFuuka's search and thread reader), Reddit (PullPush for words, Arctic Shift by subreddit or author; posts read with their comments, by an id a search showed), public Telegram channels (`t.me/s/<name>`, with its own search, only a channel the thread was shown), Hacker News (Algolia), Lemmy (lemmy.world), Mastodon hashtags (mastodon.social), GitHub issue search, and Have I Been Pwned's list of known breaches. Checked on 16 November 2026; not usable without a login, a key or a "prove you are human" page (which Recon does not get past): Discord, Bluesky, reddit.com itself, 4plebs, archived.moe, thebarchive, Disboard, and every paste search tried.
- **The map**: Recon's method looks at the ground around a subject (other names, people, groups, places, events, the topic) and ends with a map of connections.
- **Known limit**: the trail stops a page from making the model build an address; a page can still offer many links and ask the model to open them in an order. The word screen and the fence (everything from a source is marked as material, not instructions) are what stand against that.

## The one Web selector, and your own sources in Recon (18 November 2026)

Recon's Web button is now the same selector as every space's (Modes' README, "One Web selector in every tab"): Off, All, and the same source ticks, plus a group only Recon has, **Recon's networks**: Tor (.onion), Usenet, and I2P (greyed: not set up yet; a later step builds it). Settings → Recon has a **Hidden networks: Tor, Usenet, I2P** section at the top that says so; Tor, Usenet and WireGuard are set up as before in the groups below it. Only Recon ever reaches these networks.

**What a tick does here** (`lib/ticks.js`). The ticks are stored by Modes with the thread's other marks (`sessionWebSources`); Recon's tools ask `modes.webSources(id)` and refuse, before anything is sent, a call whose source is not ticked (the answer begins "Not among this thread's Recon sources", so it counts as one that did not run):
- `recon_onion_*`: Tor. `recon_usenet_*`: Usenet. `recon_news_search` (GDELT): News.
- `recon_web_search`: any kind of page except the archives; its results of unticked kinds are left out, and the answer says how many.
- `recon_web_read`, `recon_archive_find`, `recon_archive_read`: the kinds of the page's address (Modes' lists; an archived copy is judged by the page it copies).
- `recon_board_*`: Forums and boards, or Social media and channels for Telegram and Mastodon.
- `recon_other_*`: Other. `recon_cite` and Ultra Code need nothing.
All (nothing ticked away) is Recon exactly as before. The ticks only take tools away: Recon still has only its own tools, its folder, its filters, its model rules and its Web Off. Examples the owner gave: "only Usenet and Tor" and "only Tor and verified sources".

**Your own sources in Recon** (`lib/other.js`, tools `recon_other_search`, `recon_other_read`). Only the sources on Settings → Web sources → Other sources whose "May be used in Recon" switch is on (off at first). Modes keeps them and hands Recon one source's request (`reconOtherRequest`: addresses, login headers, the parts to hide); Recon reads it through the locked process **only through the WireGuard tunnel**: never straight, not even after `/recon direct`, and never through Tor (`tunnelOnly` in `lib/clearnet.js`; the locked process sends a login only on an encrypted connection through the forwarder, `loginLines` in `lib/fetch-child.mjs`). Text only, the same word screen and page filters, links only on the source's own site (shown as paths), a redirect to another site not followed. The model sees the source's name: the login, key, cookie and a secret address (its site too) are replaced by the name in brackets in everything it reads and in the research log. The method's rule 5 now says only these sources use a stored login. Tools: 15 (13 before).

Tests: `test/websources.test.mjs` (each tool's tick, the examples, a refusal counted as not run, results left out, your own sources through WireGuard only with the login hidden, the locked process's login lines).

**Status dots (18 November 2026, the owner's request).** The start page's status bar has a dot for every service Recon can use, with the reason when you hover over it: Tor (as before), Usenet (as before), **WireGuard** (grey: not set up; green: connected, or set up and started when needed; amber: connecting; red: did not connect, with what was tried), **I2P** (grey: not set up yet), and **each of your own sources allowed in Recon** (green: its login is kept and WireGuard is set up; red: its last read failed, with why; grey: no login kept yet, or no working tunnel). It uses only what Recon already knows: WireGuard's own status, the last read of each source (in memory, with the login taken out) and Modes' `reconOtherStatus()` (whether a login is kept, looked up on this Mac). No request is sent to draw it. Choosing which of these a thread uses stays on the Web button.


## Damaged privacy files (1.0 review fix)

`recon/door.json` (exports and moves) and `recon/wipe.json` (ended threads waiting for deletion) are no longer
overwritten when damaged. A copy is kept beside the file (`…damaged-<date-time>`, never over an earlier copy).
- **door.json damaged:** the file stays where it is; nothing is exported or moved; every thread counts as holding
  what Recon found (no cloud model Recon does not allow); Sync is told (`reconMoved.damaged()`) and waits. The Recon page
  says so in plain words. Fix the file from the copy, or delete it, and everything works again.
- **wipe.json damaged:** the ids still plainly at the start of a cut-off list are kept and still deleted; the page says
  how many were recovered. If no copy can be made, nothing is saved over it and ending a thread is refused.
- **Move order:** the new thread is claimed by its mode first, then the cloud check is made against its real
  model, then files are written; a move that fails after that removes its own new folder.
Tests: `test/move-route.test.mjs` (runs the route on stand-in services), `test/room.test.mjs`.

## Mission, the one name (stage B review, 19 November 2026)

`/recon` status now says "a Mission (Start Mission beside Send) adds helpers…" instead of "a Long run (the Run button)", which no longer exists. Words only. Test: `test/isolation.test.mjs`.

## Mission stage E (20 November 2026)

- **Typed /mission.** A typed `/mission <goal>` now starts a Mission in a Recon thread wherever Start Mission does (Mission on, Recon's `runs` allowed), with every rule above: Recon's room, the thread's model, no commands, checks only without the internet. The `/mission` modes alone (`/mission thorough` and so on) stay refused in Recon. Mission decides this (its gate); nothing changed in Recon for it.
- **The export rule and a Mission's helpers.** A helper cannot ask the app's approval card, so before, an address from a Recon export was refused to it at once ("a helper cannot ask"). Now a helper of a Mission outside Recon tells its Mission (`mission.askYes`, addon `recon`) with Recon's own question. On an Ask mode it waits in the Mission's card above the chat box; on Full auto it is listed as not asked. **Allow** there is the same as the thread's yes on Recon's own card: those addresses may be opened in that thread until the app restarts (in memory, as before), and the final guard lets them through. **Deny**, or no answer, keeps them refused. An onion address and Memory taking an export's text are **never** allowable: for a Mission's helper they are listed in the Mission's report as not possible, and refused as before. A helper that is not a Mission's, and the thread itself, behave as before.
- **The key of a helper's question (review, 20 November 2026).** Mission matches an Allow on the question's key. A long list of addresses is no longer cut at 300 characters: it ends in a fingerprint of all its addresses, so an Allow for one list never covers a longer list that starts the same way.
- **After a restart.** A Recon Mission does not come back after the app restarts: it is not in Mission's list of working runs, and Recon empties its room when it loads. So Mission's new "Carry on by itself after a restart" never applies to it.
- Tested: `test/door.test.mjs` (parked with Recon's question, Full auto, not a Mission's helper, Allow opens and the final guard passes, onion and Memory listed as not possible, Recon's own thread left alone, a long list's key). Not tested in the running app.

## Spaces (item 4A fix round, 22 November 2026: built and checked in the lab only)

- The `recon` service also answers `isRoom(folder)`: whether a folder is the room or inside it (real paths; false when unreadable). Modes asks it, so a new thread whose folder is the room is only ever a sealed Recon thread, whatever space the window shows.
- With spaces, a Move out of Recon is claimed through Modes' `spaces.startDraft` with the target space, so the new thread starts in that space's start mode (Plain chat in Chat, Settings → Spaces decides), not in the tab id read as a mode.
- "Offer the Recon mode" and its notes come from the add-on's locale dictionary (English only since stage 7).

## Stage 6a: a space keeps its rules for any mode (item 4A, 22 November 2026)

Any mode the owner ticks for Recon is a Recon thread here. Recon's own tools, `runs`, `/recon` (status, cloud, log,
export, end, direct, block), the export door and the move work for it as for the Recon mode, but only when Modes really
read the thread's space as Recon (never on Modes' error value). Every other mode in the Recon space, and its helpers, is
held by the cloud-model gate from its first step; the Recon mode keeps its own rule. Those threads also get Recon's
rules on hostile text, text only, minors, read only and addresses (prompt section `recon:space`); Modes adds the
sentences about tools, routes and the room. The `recon` service is `apiVersion: 3`: `inSpace(id)`, `roomRunFolder(id)`
(the thread's `run-<id>` folder in the room, never asking Modes) and `roomFolderOf(id)` (for add-ons that save into the
room). Export targets never include a thread in the Recon space and show each target's space. When Modes offers
names (`modeName(id, 'en')` or `list('en')`, `spaces.names('en')`), the door shows the mode's and space's
English names (Plus is English only since stage 7); with an older Modes it uses Recon's own space names and the Modes list's mode name. Built and tested in the
lab only.

## Stage 6b: your start-mode choice is kept (item 4A, 23 November 2026: built and unit-tested only)

If Recon is a space's start mode (Settings → Spaces) and you switch this add-on off, your choice is kept. The Spaces page
says the start mode is gone and which mode is used instead, and new threads in that space start in that mode. Switch
the add-on on again and your choice is back; there is nothing to set again. Recon threads are held while Recon is off, as before (stage 6a); nothing outside Recon changes.

Unchanged: switching off still moves the old "selected tab" setting (`defaultMode`, used only without the Cowork
sidebar) back to Cowork when it named Recon. Only the code comment at that line changed. Test: dsh-modes
`test/start-mode-kept.test.mjs`.
