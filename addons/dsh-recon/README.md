# Recon

An isolated mode and tab for research on .onion sites and Usenet text newsgroups: journalism,
finding and citing sources, open-source intelligence, threat intelligence, and Usenet's text
archives. It is not a browser.

**This version is steps 1 to 4 and 6 of 7.** It searches and reads .onion sites through Tor and
Usenet text newsgroups through your news server, as text only, behind the filters, with citations,
a research log, an export, and "End and wipe". WireGuard and saved searches are later steps.

You need the `tor` program: `brew install tor`. Plus does not install it.

Off until you switch it on at **Settings → Recon**. Needs the Modes add-on and the Cowork sidebar.

## What a Recon conversation has

- **Only its own tools:** `recon_onion_search`, `recon_onion_read`, `recon_usenet_groups`,
  `recon_usenet_search`, `recon_usenet_read`, `recon_cite`.
- **Nothing else of the app:** no programs, no shell, no files, no memory, no skills, no helpers,
  no web search, no Deep research. A call to any other tool is refused, also in the PTC preset.
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
- No tier, no router and no fallback moves an isolated conversation to another model.
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
  source's number, address, retrieval time and a fingerprint of the text.
- **Citations:** every source read gets a number like `[S3]`. `recon_cite` gives its full citation.
- **Research log:** `/recon log` lists every search and every source, in order, with times.
- **Limits:** 400 requests per conversation; a page's first 1.5 MB; 12,000 characters per part.
- **`/recon stop`** stops Tor and deletes its temporary folder.

## Recon's own folder

Every Recon conversation runs in one empty folder, `/private/tmp/dsh-recon-room`, not in a folder
of yours. The app tells a model the path of its conversation's folder; this one is outside your
home and says nothing about you. It is emptied whenever Recon starts.

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
- **Export before you close the app.** What Recon reads is kept in memory only.
- The marks protect only as long as they stay in. Another tab or tool that is given the file
  still has to respect them; Recon cannot make it.

## End and wipe

`/recon end` ends a conversation for good:

- what it read (sources, notes, shown addresses, a cloud agreement) is forgotten;
- Tor is stopped and its temporary folder deleted;
- the conversation is closed and taken off the list;
- its files are deleted. They do not go to the trash.

The app holds an open conversation in memory, so its files are deleted as soon as the app lets go
of it, at the latest when the app next starts. Until then only its id is kept on a list
(`recon/wipe.json`). An export made earlier is yours to delete.

## Usenet

Off until you choose a route at **Settings → Recon → Usenet**. You need an account with a Usenet
provider.

- **Route:** a direct encrypted connection to your news server. The server sees your internet
  address and knows your account, as with any newsreader. Tor is not used for Usenet.
- **Login:** kept in the macOS Keychain and nowhere else. You store it yourself in the Terminal;
  the page shows the command, and the password is typed at a hidden prompt:
  `security add-generic-password -U -s dsh-recon-usenet -a YOUR_USERNAME -w`.
  Recon reads it only at the moment it signs in. It is in no file, setting, log or conversation,
  and no tool or command shows it.
- **Text groups only.** A group whose name says it holds files (binaries, pictures, multimedia,
  sounds, movies and the like) is never listed or opened. The rule errs on the safe side, so a few
  text groups about such subjects are left out too.
- **`recon_usenet_groups`** finds text groups by name. **`recon_usenet_search`** matches subject,
  author and date in the newest 3,000 articles of one group; Usenet has no full-text search.
  File postings (yEnc, "(3/41)" part counts, oversized articles) are skipped.
  **`recon_usenet_read`** reads one article by its Message-ID.
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
- **One locked process per page** (the macOS sandbox). It can open one local port, the proxy's,
  and nothing else; it cannot read your folders or other disks, write anywhere, or start a
  program. It gets none of the app's environment.
- **Text only, by never asking.** One GET for the page itself: no pictures, scripts, styles or
  frames are requested, no cookies are kept, nothing is posted. An address that is not text is
  refused before its content is read. A redirect is reported, not followed.
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
| Connect to Usenet (`usenetRoute`) | off | `direct`: an encrypted connection straight to the news server. |
| News server (`usenetHost`) | empty | The server name your provider gives you. |
| `usenetPort` | 563 | The server's port for encrypted connections. Only in the configuration file. |
| `exportFolder` | empty | Where `/recon export` writes. Empty uses `recon/exports` in the app's home. Only in the configuration file. |

## What it does not do yet

- **No WireGuard or saved searches:** later steps.
- **What was read stays in memory** until the app is closed or the conversation is ended, and in
  the conversation on disk until it is ended.
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
  the tool list is the six tools; project `AGENTS.md` and Memory do not arrive; a shell call is
  refused; a Cowork conversation is not offered the tools; a conversation moved in or out is locked.
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
- **Run by the owner against a real news server (2026-11-14):** the Keychain login, the sign-in,
  listing text groups, header search, and reading and citing an article work. The builder has no
  account and never touches the owner's.
- **Not verified:** the cloud agreement in the running app (unit test only); other engines than
  Ahmia. The builder has never run the real tor program or opened an .onion site. Ahmia's page formats were read once on the normal web on 2026-11-14 and can change;
  if its result page changes, a search falls back to the page's plain .onion links.
