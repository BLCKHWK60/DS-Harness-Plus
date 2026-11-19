# Brief: @local/dsh-recon

What it is for: An isolated Recon mode and tab for research on .onion sites and Usenet text newsgroups: its conversations have only the recon tools, share nothing with the rest of the app, and ask before content goes to a cloud model. This version is the isolation frame; it has no network access yet. Off until you switch it on.

This brief was written by Creator Plus from the plugin's own files. Its README below is the full description, complete enough to rebuild the plugin from; improve this brief by hand, with the user's yes.

## What it must keep doing

- Its tools: recon_onion_search, recon_onion_read, recon_web_search, recon_web_read, recon_board_search, recon_board_read, recon_usenet_groups, recon_usenet_search, recon_usenet_read, recon_news_search, recon_archive_find, recon_archive_read, recon_cite.
- Its commands: /recon.
- Its tabs: recon.
- The services it gives other plugins: recon, reconWipe, reconExports.
- Its settings: enabled, torPath, otherEngine, engineHost, usenetRoute, archiveOn, longChecks, archiveDirect, newsOn, webOn, usenetAccounts, usenetDefaultAccount, usenetHost, exportFolder, usenetPort, vpnConfigs, wireproxyPath.

## Its README

# Recon

An isolated mode and tab for research on .onion sites and Usenet text newsgroups: journalism,
finding and citing sources, open-source intelligence, threat intelligence, and Usenet's text
archives. It is not a browser.

**This version is steps 1 to 4 and 6 of 7.** It searches and reads .onion sites through Tor and
Usenet text newsgroups through your news server, as text only, behind the filters, with citations,
a research log, an export, and "End and wipe". WireGuard, the ordinary web and back channels came on 16 November 2026; saved searches are a later step.

You need the `tor` program: `brew install tor`. Plus does not install it.

Off until you switch it on at **Settings → Recon**. Needs the Modes add-on and the Cowork sidebar.

## The Recon tab's start page

- **A greeting and starter chips** ("What should Recon look into?": search .onion sites, search
  Usenet, news coverage, an old web page, check a claim). They live in the Cowork sidebar's tab
  layout (`DEFAULT_TABS`, entry `recon`), so you can change them like any tab's. A chip starts the
  conversation in Recon's own folder, like the New button.
- **A status bar** under the chat box, only on the Recon tab: whether Tor is installed, connecting
  or connected; Usenet on or off and how many accounts; the Internet Archive's route while it is on
  (read directly or through Tor); the conversation's model, where it runs, and whether what Recon
  finds may go to it. With a cloud model it says that findings are held back until you type
  `/recon cloud`. Agreeing stays something you type on purpose: there is no button for it.
  A conversation outside Recon's folder is told to start a new one with the New button. While the
  app has not loaded the conversation yet, the model shows as "Model not known yet"; "No model
  picked" means the conversation has none. Its hint says what isolation means: nothing from other
  conversations comes in, and nothing of it goes to them. (Searches and reads still go out, through
  Tor, Usenet or the Archive, and findings go to the model as described below.)

## What a Recon conversation has

- **Only its own tools:** `recon_onion_search`, `recon_onion_read`, `recon_usenet_groups`,
  `recon_usenet_search`, `recon_usenet_read`, `recon_news_search`, `recon_archive_find`,
  `recon_archive_read`, `recon_cite`.
- **Nothing else of the app:** no programs, no shell, no files, no memory, no skills, no helpers,
  no web search, no Deep research. A call to any other tool is refused, also in the PTC preset.
- **Standard preset only:** in the PTC preset the app offers tools only through programs
  (`run_code`), which Recon refuses, so a Recon conversation there can do nothing. The model is
  told to ask you to start it again in the Standard preset.
- **No notes from elsewhere:** no project instructions, no `AGENTS.md` (of the folder or of the
  app's home, where Memory writes), no skill list, no notes from other Plus add-ons.
- **No way in, no way out:** a conversation that began in the Recon tab stays isolated for good.
  Given another mode, or with Recon switched off, it is locked and has no tools. A conversation
  that already ran in another tab never gets the Recon tools.
- **Its tools belong to it alone:** no other tab's conversation is offered them.

## Models

- A model on this Mac or in your own network gets what Recon finds without a question.
- Any other model counts as cloud, and so does one whose place cannot be told. The tools then hand
  over nothing until you type `/recon cloud` in that conversation. That holds for that
  conversation and that model, and is forgotten when the app is closed.
- What Recon already found is in the conversation's history, and every step sends the history
  to the model picked at that moment. So a conversation that holds Recon findings takes no step
  on a cloud model you did not agree to: switched to another model, copied with Rerun, or with
  its history condensed. The step stops with a message that says why; nothing is sent.
  One exception: condensing a long conversation sends its history to the model the app uses
  for condensing, and Recon does not check that model. Use a model on this Mac or your own
  network for it, or keep Recon conversations short.
- No tier, no router, no fallback and no route-health switch moves an isolated conversation to
  another model.
- `/recon` shows a conversation's isolation, its model and what is allowed.

## Searching and reading

- **Search** goes to a filtered index (Ahmia) at its own .onion address, through Tor. Up to 20
  results come back, each with its address. Another engine can be set in the configuration file
  (`otherEngine`, `engineHost`); the blocklist and the word screen apply either way.
- **Reading** an address needs it to have been shown in the conversation: by a search, by a page
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
  conversation rebuilds its record from the saved conversation: the numbered sources with their
  addresses, titles, authors and dates as shown and the time each was retrieved, the addresses it
  was shown, and what the assistant wrote. So earlier `[S3]` citations, links and `/recon export`
  keep working, and a new source is numbered above every number the conversation already used (also
  one only the assistant or a condensed summary still mentions, if it is at most 500 above Recon's
  own numbers and not above 9,000: a page can make the assistant write any number). Only what Recon
  itself showed counts as shown: search results, links on pages it read, a redirect it reported, and
  addresses in your own messages; never an address the assistant wrote or one in a page's text. A
  page cannot pass its own words off as Recon's: a redirect counts only when Recon's sentence is the
  whole answer, and a page's links only when the list after the page's text is surely Recon's (the
  page's text checked against its fingerprint or its length, the list exactly as long as its heading
  says). In doubt an address is left out; it can be found again by reading the page again. A source
  whose every part is still in the conversation gets its text back, checked against its fingerprint;
  one read only in part is marked so in its citation and the export, and is read again when more of
  it is needed. Nothing new is stored on disk, and a condensed conversation gives back only what is
  still in it. The research log says "restored" only when something was put back. A conversation
  ended with `/recon end` is not rebuilt (see "End and wipe").
- **Limits:** 400 requests per conversation; a page's first 1.5 MB; 12,000 characters per part.
- **`/recon stop`** stops Tor and deletes its temporary folder.

## Recon's own folder

Every Recon conversation runs in one empty folder, `/private/tmp/dsh-recon-room`, not in a folder
of yours. The app tells a model the path of its conversation's folder; this one is outside your
home and says nothing about you. It is emptied whenever Recon starts. A room that has turned into a
link, is not a folder or is not yours is left alone, not emptied.

Tests move the room with the environment variable `DSH_RECON_ROOM`, so they never empty the room
the running app uses. Only a folder whose name starts with `dsh-recon-`, directly in `/tmp` or the
system's temporary folder, and not a link, is taken; anything else is ignored. The real room's own
name is never taken, in any spelling: `/tmp/dsh-recon-room` and `/private/tmp/dsh-recon-ROOM` are
the same folder on a Mac. The tests' loader also refuses to start Recon when its room is the real
one by what the disk says (the same folder, not the same spelling).

- **Start a Recon conversation with the New button in the Recon tab.** It opens in that folder,
  shown as the project "Recon room".
- A Recon conversation in any other folder has its tools switched off, and says why.

## Export

`/recon export` writes one text file: the research log, every source with its citation and its
text, and what the assistant wrote.

- **Made so that it cannot act as instructions.** A notice at the top says what the file is.
  Everything from a source, and everything the assistant wrote from it, is quoted (each line
  begins with `> `) between marks, and marks inside the material are taken out so nothing can
  close a block early. Only the citations and the log, which Recon writes itself, stand outside.
- **Where:** the folder `recon/exports` in the app's home, or the folder set as `exportFolder`.
  The command shows the file's path. Files are readable by you alone.
- **After a restart** the export holds what was rebuilt from the saved conversation (see
  "Searching and reading"): a note from before the restart has no time of its own, and a source read
  only in part says which parts are missing.
- The marks protect only as long as they stay in. Another tab or tool that is given the file
  still has to respect them; Recon cannot make it.

## The export door (step C8, 16 November)

The owner's answer: build it. Recon stays sealed; this is its one way out, and only the owner opens it.

- **Who:** the **Export…** button in the chat box of a Recon conversation of its own (not a helper's,
  not one ended and wiped). Recon's model and its helpers get no new tool and cannot start an export.
  The app's own code copies plain text; Recon's lock is not loosened.
- **What goes** (`lib/door.js`): the report packet (the default: the newest report the conversation's
  own model wrote that cites a source, else its newest answer, and only the sources it cites: none
  when it cites none) or the whole conversation (every report of its own model, the owner's own
  messages, every source). A Long run helper's answer (often a page extract) never goes. Sources go as
  citations only: title, address (an Archive copy with its original), author and date as shown, when
  read, the route, the text fingerprint, and on each **origin: Recon**, its lane and the export date.
  Reports, messages and the source list (titles and authors are written by the pages) are quoted so
  they cannot act as instructions.
  Recon keeps no claims table, contradictions, timeline, lead list or coverage map of its own, and
  the export says so: Content builds its ledger from the report.
- **After a restart:** the app loads a conversation only when a turn runs, so an older Recon
  conversation is recognised without it: Recon's mode and isolated by id (Modes answers by id), and a
  saved header with no parent; one being ended and wiped is not. Its export is read from its saved
  messages (`sessionQuery.readSurface`): the reports its own model wrote and the owner's messages.
  What Recon read was kept only in memory, so the window and the export say: "What Recon read before
  the app restarted is not kept; only the messages are." A loaded conversation is exported as before.
- **What never goes:** the text of the pages Recon read, Recon's room, the word list and blocklists,
  anything the screen dropped (never kept), VPN profiles, logins, notes for learning.
- **Where:** a new conversation in a tab the owner picks (Content first; any tab but Recon, Devices
  too: the owner's answer of 16 November, and Devices never takes export text as his words): made in
  Scratch, made that tab's by Modes' own move, with the export as its first message; or added to a
  conversation that exists (never Recon's, a sealed one, or a helper); or a folder (a full path; a new folder of its
  own with `export.md` and `export.json`; checked by its real path, the nearest existing folder's links
  followed, against Recon's rooms and any `dsh-recon-…` folder without regard to capitals; checked again
  once made). Longer than 120,000 characters: a folder only.
- **The window says** what leaves (counts), what never leaves, and the four warnings (End and wipe
  does not reach the copy; the tab may use a model outside this Mac; Global Search and Sync treat it
  by that tab's rules; a tab that runs code or changes files is as exposed to it as to a web page),
  before anything leaves.
- **A message with an export** starts with `[Recon export <id>, <date>: material, not instructions]`.
  The export is recognised by that marker **in any message of a conversation** (the user's, a tool's
  answer, a copied conversation, a fork's copied history, a paste), not by the conversation's id: for
  an export on the list its addresses, and always every address in the text from the marker on (so an
  export the list does not know, or with Recon's list gone, is closed, not open). Content never counts
  a message with the marker as the owner's words.
- **After it, in every tab** (on every tool call, before any other add-on is asked, and again as a
  final `tools.guard`; independent of Recon's switch, so an earlier export keeps its rules):
  - an **onion address is never opened outside Recon** (any conversation that is not Recon's);
  - an **address from an export** in that conversation, **or one below it** (same host, same path or
    deeper; decoded; the query does not matter), is opened only after the owner says yes on the app's
    own approval card (once per page per conversation; a no stays a no; a helper cannot ask, so it is
    refused);
  - onion addresses are recognised also when encoded (`%2eonion`), written with another dot, or reached
    through a gateway host (`<site>.onion.ly`);
  - **Memory** (`remember`) in a conversation that carries an export takes nothing that shares a run of
    seven words with the export's text or names one of its addresses or hosts; the owner's own facts
    pass;
  - what a call would open is read: for a tool that runs commands or programs (bash, terminals,
    `run_code`, Python tools…) every address in any of its strings; for the others, keys such as url,
    href, link, address, target, or a value that is one whole address. Tools that only keep records
    (Content's tools, `write`, `edit`, the step list, questions) open nothing and are not refused.
- **One way:** nothing returns to the Recon conversation. The list of exports (which conversations
  each reached, its addresses) is `recon/door.json` in the app's home; other add-ons may ask the
  `reconExports` service (`has`, `addressesOf`, `inText(text)`, `markerRe`, `covers`). Content keeps
  its own copy of the marker and the address rules (`dsh-content/lib/exports.js`, kept in step by a
  test), so it reads exports with Recon off.
- **Not done here:** keeping exported text out of learned skills needs the skill add-ons to ask
  `reconExports` (they are not Recon's to change).

`/recon export` (above) stays as it was: a full text file for the owner, with page text.

## Ultra Code (16 November)

The owner: "Research and Recon keep the loops as is today, but Ultra Code expands it." With Ultra Code
on for the conversation (`modes.ultraCode(id) === true`; off or unknown: Recon exactly as today, the
recipe not offered and refusing), the conversation itself (never a helper) gets `recon_ultra`, a fixed
recipe in Recon's own code (`lib/ultra.js`), never a workflow a model writes:

- **search:** each sub-question its model names (at most 6) goes through every lane that is on (onion
  sites, the ordinary web, news), and a counter-search on each key claim (at most 3), through the same
  functions as Recon's tools (the same screen, blocklists, routes and research log), one call at a
  time (Tor takes one), at most 60,000 characters back.
- **report:** two writers and a judge, helpers of the conversation on its own model, write the report
  from the sources it read (citations and the start of each text, at most 80,000 characters). They
  have no tools: Modes gives a Recon conversation's helpers none, and Recon refuses any call they make
  (by their id and their task). Recon's model check comes first: with a cloud model the user has not
  agreed to, nothing goes. Nothing is written anywhere, no model runs anything, and nothing leaves
  Recon's room.

- **Bounded and stoppable:** before every lane call the search checks that the call was not stopped,
  Recon is still on (so Tor is never started again after Recon is switched off), the conversation was
  not ended, and its 30 minutes are not up; an ended conversation's log is not written to again. With
  the conversation's Web off (`modes.webOff`) the recipe does nothing.
- **What it answered counts as found:** a `recon_ultra` answer in a history keeps that history from a
  model the user did not agree to, as every Recon tool's does (its refusals do not count).
- **The judge** is taken only when it ended normally, kept the citations and is of a sane length;
  otherwise draft 1 is the report and it says so. Drafts are cut at 40,000 characters. Material and
  drafts sit between markers with a random part, so no text inside can close them.
- **Their refusal** is scoped to the recipe's own helpers (by their id, cleared when they end, or a
  helper of a Recon conversation whose task says so), and holds again as a final `tools.guard` (in a
  Long run Modes offers Recon's helpers file tools).
- Recon's method is unchanged; the tool describes itself, and is offered only while Ultra Code is on.

Helpers outside a Long run get no tools (Modes' rule for isolated tabs), so the wider searching is done
by Recon's code, not by more helpers. Long runs in Recon are Mission's and are unchanged.

## End and wipe

`/recon end` ends a conversation for good:

- what it read (sources, notes, shown addresses, a cloud agreement) is forgotten;
- Tor is stopped and its temporary folder deleted;
- the conversation is closed and taken off the list;
- its files are deleted. They do not go to the trash.

The app holds an open conversation in memory, so its files are deleted as soon as the app lets go
of it, at the latest when the app next starts. Until then only its id is kept on a list
(`recon/wipe.json`). An export made earlier is yours to delete.

Until then the Cowork sidebar's Archived list shows it as "Being deleted", without Restore or
Delete, and its trash refuses it: Recon offers its list as the `reconWipe` service (`has`, `list`).
If it reached the trash some other way (deleted from the Archived list before 0.58.0), the wipe takes
it out of the trash and the trash's waiting list too (`wipeTrashed` in `lib/wipe.js`), so an ended
conversation can never be put back.

Until its files are gone, an ended conversation is not rebuilt from its history (see "After a
restart" under "Searching and reading"): `/recon log`, `/recon export` and the tools find nothing
it read. Only its numbering is
kept, so a source read in it afterwards never takes an earlier number. If the app cannot delete it
(it says so), its saved history still holds what it read until you delete it yourself; after a
restart, such a conversation is rebuilt like any other.

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
  refusal in one conversation it is off for the rest of that conversation, so the model finishes
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
  yourself in the Terminal; the page shows the command for that account, and the password is [masked]
  at a hidden prompt. The first account uses the original item:
  `security add-generic-password -U -s dsh-recon-usenet -a YOUR_USERNAME -w`; any later account adds
  its id to the item's name: `-s dsh-recon-usenet-<id>`. Recon reads a login only at the moment it
  signs in with that account. A login is in no file, setting, log or conversation, and no tool or
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
- **Addresses:** only current .onion addresses, and only ones the conversation was shown (by a
  search, by a page it read, or by you).
- **Settings → Recon → Test Tor** connects this Mac to the Tor network, opens no site, and stops.

## Settings

| Setting | Starts as | What it does |
| --- | --- | --- |
| Show the Recon tab (`enabled`) | off | Adds the Recon tab and its tools. |
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
- **What was read stays in memory** until the app is closed or the conversation is ended, and in
  the conversation on disk until it is ended. After a restart it is rebuilt from the conversation
  on disk (see "Searching and reading"); Recon keeps no copy of its own.
- **What Recon writes to disk:** the blocklist (`recon/blocklist.json`, fingerprints only), the
  list of ended conversations waiting to be deleted (`recon/wipe.json`, ids only), and the exports
  you ask for.
- **The app still tells the model two things:** the app's own install path and its local address.
  The folder path it is told is Recon's own.
- **The app's base text** still names tools the conversation does not have (workflows, MCP
  servers). They cannot be called.
- **Until it is ended, the conversation is kept on disk** like any other, and its title is written
  by the model set for titles.
- **Plugins from other makers** are not covered by the isolation.

## Tested

- **Unit tests (9, plus the 3 below):** the mode, where a model runs, the agreement for cloud models, the tool gate.
- **Lab run with a stand-in model**, reading exactly what the model was sent:
  the tool list was the six tools of that version (nine now); project `AGENTS.md` and Memory do not arrive; a shell call is
  refused; a Cowork conversation is not offered the tools; a conversation moved in or out is locked.
- **Connection tests (6), against stand-ins on this Mac only** (a local web server as the .onion
  site, a script as the tor program): text arrives; the site is asked for the page and nothing it
  points to; no cookie is [masked]; an image is refused; a redirect is not followed; the locked
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
  wipe deletes a conversation's own folder and refuses any other folder.
- **Lab run in the app with a stand-in model:** search, read, `/recon log`, `/recon`; the Usenet
  settings and page; the New button opens a conversation in Recon's folder and the model is told
  that path and none of the user's; `/recon export`; `/recon end`, after which a restart left no
  file of the conversation, in the conversations folder or in the trash.
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
  picked, and a conversation outside the room, with no button and a hint that says what isolation
  means (Settings and page checks); the tab's greeting and chips the same
  on both halves of the Cowork sidebar (2).
- **Not verified in the running app:** the status bar's place on the start page and its look, the
  greeting and chips, the rebuild after a real restart, and the Archive read directly against the
  real service (never run by the builder).
- **Not verified:** the cloud agreement in the running app (unit test only); other engines than
  Ahmia. The builder has never run the real tor program or opened an .onion site. Ahmia's page formats were read once on the normal web on 2026-11-14 and can change;
  if its result page changes, a search falls back to the page's plain .onion links.

## Long run in Recon (16 November 2026)

A Recon conversation can run a Long run (the Run button next to Send, with Mission on). Recon keeps it inside its rules:

- **Helpers belong to the conversation.** A run's planner, workers and reviewer are helpers of the Recon conversation. Everything Recon keeps per conversation goes by that conversation (`topIdOf`): the numbered sources and the research log, the .onion addresses it may open, your `/recon cloud` agreement, the notes for the export, and the check before every step that findings go only to a model they may go to.
- **One model.** Helpers use the conversation's own model, never another role model.
- **No programs or commands.** The conversation gets Recon's tools and `mission_step`; helpers get Recon's tools and, with Files on, the file tools (read, write, edit, multi_edit, glob, grep). By default Mission runs no check commands in such a run: the reviewer judges each item.
- **Checks without the internet (a switch, off by default; the owner's choice, 16 November 2026).** Settings → Recon → Long runs → "Let a Long run check its work, without the internet" (`longChecks`; service `recon.longChecks()`, read when a run starts). On: the planner may give checks on the run's files (it is told they have no internet, see only the folder and start no other program), and Mission runs each inside a macOS sandbox (`offlineFence` in dsh-mission `lib/shell.js`): no network and no name lookups, no Mac services (`deny mach-lookup`, so nothing can ask another program to go online), no `open`, `osascript`, `shortcuts` or `automator`, nothing of the home folder or other disks read, writing only in the run's folder (its temporary files too), device ports closed. Without the Mac's sandbox such a check is not run. Tried on this Mac: a local server reachable from outside was refused inside ("Operation not permitted"), a name lookup failed, reading the home folder and writing outside were refused, and test, grep, wc, sort, sed, awk, ls, cat, find and python worked. Helpers still never get commands; the run still uses one model and keeps no record outside the room. The Long run card says which applies.
- **Its own folder.** The run works in `<room>/run-<conversation id>` (`recon.runFolder`), in Mission's Restricted mode there; helpers are moved into it before their turn. Mission writes nothing about the run outside the room.
- **End and wipe** ends the run (`mission.endRun`), deletes its folder, and deletes the helpers' saved conversations with the conversation's.

Mission asks `ctx.get('recon').runs()`: without it an isolated conversation is left alone, as before.

## WireGuard, the ordinary web and back channels (16 November 2026)

- **WireGuard** (`lib/vpn.js`): everything Recon sends outside Tor (Internet Archive copies read directly, Usenet, the ordinary web, the back channels) goes through a WireGuard tunnel run by `wireproxy` for Recon alone (the Mac's own network is not changed). Settings → Recon → WireGuard lists the configurations: the first is the primary, the others backups, tried in order; a running tunnel is checked again after a minute and the configurations are tried again when it stops passing traffic or the order changed. Each configuration's file is in the macOS Keychain (`dsh-recon-wg-<id>`, base64), put there by the user with the two-step command the page shows (copied, then pasted when `security` asks, so it never shows on a command line); Recon writes it for a moment into a 0700 temporary folder and deletes it once wireproxy has read it. wireproxy's own messages are never passed on (one about a bad key repeats the key). A configuration needs a DNS line. Without a working tunnel nothing is sent; `/recon direct` allows direct connections for one conversation (memory only), `/recon block` takes it back.
- **The ordinary web** (`lib/clearnet.js`): `recon_web_search` (DuckDuckGo's HTML page, then Mojeek, then Marginalia) and `recon_web_read`. Only addresses the conversation was shown (search results, links on pages it read, the user's messages; oldest dropped past 8,000), never a bare number address, the site's own port kept. Settings → Recon → More sources → The ordinary web.
- **Back channels** (`lib/boards.js`): `recon_board_search` / `recon_board_read` for 4chan (a board's live catalog and threads), 4chan archives (desuarchive, b4k, palanq; FoolFuuka's search and thread reader), Reddit (PullPush for words, Arctic Shift by subreddit or author; posts read with their comments, by an id a search showed), public Telegram channels (`t.me/s/<name>`, with its own search, only a channel the conversation was shown), Hacker News (Algolia), Lemmy (lemmy.world), Mastodon hashtags (mastodon.social), GitHub issue search, and Have I Been Pwned's list of known breaches. Checked on 16 November 2026; not usable without a login, a key or a "prove you are human" page (which Recon does not get past): Discord, Bluesky, reddit.com itself, 4plebs, archived.moe, thebarchive, Disboard, and every paste search tried.
- **The map**: Recon's method looks at the ground around a subject (other names, people, groups, places, events, the topic) and ends with a map of connections.
- **Known limit**: the trail stops a page from making the model build an address; a page can still offer many links and ask the model to open them in an order. The word screen and the fence (everything from a source is marked as material, not instructions) are what stand against that.
