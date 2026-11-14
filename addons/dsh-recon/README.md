# Recon

An isolated mode and tab for research on .onion sites and Usenet text newsgroups: journalism,
finding and citing sources, open-source intelligence, threat intelligence, and Usenet's text
archives. It is not a browser.

**This version is steps 1 to 3 of 7.** It searches and reads .onion sites through Tor, as text
only, behind the filters, with citations and a research log. Usenet, WireGuard, the export, saved
searches and "End and wipe" are later steps.

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

## What it does not do yet

- **No Usenet, WireGuard, export, saved searches or "End and wipe":** later steps.
- **What was read stays in memory** until the app is closed, and in the conversation on disk.
- **The blocklist file** (`recon/blocklist.json` in the app's home, fingerprints only) is the one
  thing Recon writes to disk.
- **The app still tells the model three things:** the conversation's folder path, the app's own
  install path and its local address. Use a folder whose name says nothing.
- **The app's base text** still names tools the conversation does not have (workflows, MCP
  servers). They cannot be called.
- **The conversation is kept on disk** like any other, and its title is written by the model set
  for titles.
- **Plugins from other makers** are not covered by the isolation.

## Tested

- **Unit tests (7):** the mode, where a model runs, the agreement for cloud models, the tool gate.
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
- **Lab run in the app with a stand-in model:** search, read, `/recon log`, `/recon`.
- **Run by the owner on the real Tor network (2026-11-14, tor 0.4.9.17, a local model):** Tor
  connected, the blocklist was fetched, a search on Ahmia returned 20 results, and a page was
  read and cited with its source number.
- **Not verified:** the cloud agreement in the running app (unit test only); other engines than
  Ahmia. The builder has never run the real tor program or opened an .onion site. Ahmia's page formats were read once on the normal web on 2026-11-14 and can change;
  if its result page changes, a search falls back to the page's plain .onion links.
