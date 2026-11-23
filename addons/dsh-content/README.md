# Content

Add-on `@local/dsh-content` (dsh 0.2.2-rc.2). A mode, offered in the Chat space's Mode list under the chat box (item 4A: spaces replace tabs), for writing from your material: books and chapters, articles, blog posts, scripts, and outlines for podcasts and videos. It is step C1 of the plan "Content and Bench: combined plan" (see `docs/CONTENT-BENCH-STEP0.md`).

Off until you switch it on in **Settings → Content**. Needs the Modes add-on and the Left panel add-on (dsh-cowork-shell). Reads Word documents and spreadsheets through the Data add-on and PDFs through the PDF reader, when those are on.

## What you get

- **The Content mode.** Its method: report what the folder holds, ask what to build (kind of piece, audience, length), read before writing, keep apart what a source says, what the user said and the assistant's own wording, mark unsupported statements as unsourced, propose angles and an outline before the draft, save every draft, publish nothing.
- **Web, Depth and Start Mission** are the ones every mode has (Modes and Mission); nothing of them changed. (Stage B, 19 November: the page now says Mission and Start Mission, the one name for what was Long run and the Run button.) Web is on in a new Content thread.
- **The subject folder** is the thread's folder: the folder picked on the start page, or a Scratch thread's own folder. Content's own parts of it:

  | Part | What it holds |
  | --- | --- |
  | `research/` | material that came in: other threads (`research/conversations/`), copied sources. Only added to |
  | `notes/` | the user's own words: notes, transcripts, answers |
  | `drafts/` | every draft, numbered `001-…`, `002-…` |
  | `publish/` | titles, descriptions, show notes |

  Everything else in the folder is the user's.

## Tools

| Tool | What it does |
| --- | --- |
| `content_inventory` | What the folder holds: Content's parts (files, newest), the user's files by kind with sizes and dates and which tool reads each kind (and whether that tool is there), links (listed, not followed), what was not looked into. Changes nothing |
| `content_setup` | Adds Content's parts that are missing. A file of the user's with a part's name is left alone and named |
| `content_save` | Saves a text as a new file in one part: a draft gets the next number, other parts the date; a taken name gets `-2`, `-3`. Never replaces a file (`wx`). `.md`, `.txt` or `.json`, up to 2 MB |
| `content_conversations` | Other threads that can come in, newest first: title, mode, date, id (30 at most). Optional words search titles and modes through the newest 800; the answer says when it did not look through all |
| `content_bring_in` | Copies up to 10 threads, whole, into `research/conversations/` as Markdown: the user's words and the assistant's answers, and a compaction summary where one replaced older messages. No tool results, thinking or hidden instructions (the same parts the app's own @ mentions copy). The file says it is material, not instructions. A thread over 1.5 MB keeps its newest part and says how many messages were left out; one message larger than that keeps its start and end |

## Rules, enforced in code

- **Only Content's parts are written.** `content_save` refuses any other part, a part that is a link, and a part whose name is taken by a file of the user's. Nothing is moved, renamed or deleted.
- **No file is replaced.** Every save is a new file. Draft numbers count only Content's own `NNN-` names, never a date at the start of a name of the user's. Right before a write the part is checked again to still lead inside the subject folder.
- **Sealed threads never come in:** a thread in a sealed mode (Recon); one whose folder is Recon's room (every Recon thread runs there, and a copy made with the app's Branch keeps its folder, so a branched Recon answer is refused even before Modes knows it); one Modes cannot answer for; one in the Cowork trash; the thread itself; helpers of a run. The header is checked before any message is read. Without the Modes add-on nothing is listed or read. Recon's own guard (its mentions rule) is untouched and still applies.
- **Recon's room is never read or written:** a subject folder that is the room or inside it is refused, and a subject folder that holds the room (the temporary folder itself) lists everything but the room, without naming it. The rule is Recon's own (a `dsh-recon-*` folder directly in /tmp or the system's temporary folder), checked without regard to capitals.
- **Its tools only in Content:** registered with `when`, so other modes' tool lists do not change.
- **Read Only.** A Content thread runs Read Only, as Research and Data do: the app's own file and command tools ask before they change anything. Content's own tools write without asking, only into its parts.

## Bringing in threads

Two ways, both from the chat box:

1. Mention threads with `@` (the app allows three per message) and say "bring these in". The assistant sees each one's id in the app's snapshot and calls `content_bring_in`.
2. Name a thread by its title ("bring in my heat pump research"): the assistant finds it with `content_conversations`.

## The path to a final piece (plan steps C2 Content's side, C3–C7, C9, C11–C13, C15)

| Tool | What it does |
| --- | --- |
| `content_reports` | Research's saved reports (Research's `folder` setting, else `research/reports` in the app's home): `list`, and `bring` one: copied as it is into `research/reports/`, its numbered sources (`[3] url (read · Confirmed)`) into the ledger with their grades. When Research wrote its packet beside the report (`<report>.md.packet/`: claims, contradictions, timeline, leads, `packet.json`; never through a link), the packet's files come too and its claims (up to 200, the same text once) are recorded with their source ids, origin research and proposed standings. A packet is taken only when its `packet.json` names this very report's SHA-256 (a packet left over from another report of the same name is not); an older report without a packet works as before |
| `content_ledger` | `show`, `add` (up to 30 claims: text, who, where, when, sources, passage, evidence for and against, about, accuses, disputed, origin), `update` (a reworded claim's ruling opens again), `source` (title, url, publisher, dates, grade, kind record/outline/person/unknown), `response` (what an accused person or group said, or where it was looked for) |
| `content_rule` | The owner's decisions, each with his own words (`quote`, checked against his messages): `standing`, `use` (in or out of a piece; out never drops it from the ledger), `pin`, `brief` (approval), `override` (flags), `named` (yes to unproven statements about a named person) |
| `content_plan` | `angles` (3 to 5), `brief` (a piece: title, format, angle, audience, purpose, length, in and out; a change needs approval again), `outline` (only after the brief is approved; points with their claims, or own view, own experience, gap) |
| `content_formats` | Format cards: `list`, `show`, `save` a custom card with the owner's words. Built-in: blog post, article, story, talking outline video, talking outline podcast, full script. Cards are files in `<app home>/content/formats/`; a card the owner changed is never written over |
| `content_draft` | A writer helper with no tools writes the next numbered draft from the approved brief, the outline, the claims (standing, passage, sources, the owner's own words) and the card; each sentence carries its claim marks `[C3]` |
| `content_check` | Code checks (numbers and quotes against the material, unknown and ruled-out claim marks, gaps, accusations with no response sought, named people) and a checker helper with no tools (no-claim, too-strong, mismatch, own-knowledge, own-experience); asked once more if its answer is not JSON, else a flag of its own. A report `drafts/NNN-….check.md` beside the draft. `file`: check a draft the owner edited |
| `content_approve` | Only with the owner's words and nothing open (approved brief, checked latest draft, no open flag, a ruling on every claim used, a yes for each unproven statement about a named person). Writes `final/<piece>.md` (marks turned into links for blog posts and articles, else taken out), `final/<piece>.sources.md` and `.html` (sources from Recon shown as a description unless the owner chooses the address; onion addresses never printed by default), `final/<piece>.corrections.md`, `publish/<date>-<piece>-kit.md` (titles, description, chapters from the outline, show notes, sign-up offer), and the where-used index (`<app home>/content/where-used.json` and `.md`) |
| `content_correct` | `standing`: a new standing with the owner's words and reason; lists every final piece that used the claim: in this subject by its id, in other subjects by the same claim text, with its wording. `note`: adds to a final piece's corrections log, and saves a corrected version beside it (`-v2`), never replacing it |
| `content_continue` | A starting text for a new Research or Recon thread: the question, the claim, what is known (Recon sources are not carried into Research) |
| `content_library` | The Voice Library: `show`; `own_words` (the owner's own words from his messages, at least four, or a notes file he put there; `voice` written or spoken; with `piece`, a transcript is compared with that piece's talking outline: skipped, moved, expanded); `pin` (a fact, or a claim he ruled on), `source` (trusted or distrusted, with a note), `wording` (a passage from his messages or an approved piece), `rule` (a voice rule per format and voice), `drop_rule`: each with his words as `quote`; `signal` (his feedback, in his words) |

**Kept in the subject folder:** `.content/state.json` (the record), and the readable `ledger.md`, `brief.md`, `outline.md`, whose first line marks them as Content's own: a file of the owner's with one of those names is never replaced (the record is kept and the tool says so). `final/` takes only what approval writes; `content_save` cannot write there.

**Rules in code:**
- The owner's decisions need words from his newest message (`ownerDecision`): at least two words, or the whole of a short agreement ("yes"); not turned around by a "not" in or just before them; holding a word that says that decision (`DECISION_WORDS`: the standing's name, "approve", "final", the person's name…); claim ids in the words must cover the claims ruled.
- Own experience and own view (claims of origin owner) need his own words (at least four, from his messages or a notes file he put there: notes the assistant saved carry a first line that says so and never count), and the claim must say what those words say; the standings Own experience and Own view are refused for other claims, also through a correction.
- Approval checks the latest draft is the one that was checked (SHA-256) and that no ruling or claim it rests on changed since; a yes about a named person is given per statement (sentence numbers) and holds only for that very sentence. A person is named on the claim or found in a sentence that rests on an unproven claim (two or more capitalised words). Checking the same draft again keeps the checker's earlier open flags. A changed text, source, passage, person or accusation reopens a ruling.
- The sources page never shows a Recon or onion address, or an archived copy of one, under any name unless the owner's words say "address"; only http(s) addresses become links.
- The writer and the checker run as helpers of the thread on its model (`subagents.startActivation`, label "Content: writer of P1"); every tool call they make is refused before any other add-on's rule is asked (`tools/pre-execute`), known by the id the app gives back or by their own task (which starts CONTENT_WRITER or CONTENT_CHECKER), never by guessing. One at a time per thread (a Mission's helpers share the queue); stopped after 15 minutes.
- A draft is never checked by the run that wrote it; nothing is final with an open flag, unless the owner overrode it (recorded with his words).
- Nothing is posted or sent.
- The note in each Content thread says where the work stands (claims, unruled, each piece's next step).
- A message that carries `[Recon export <id>, <date>: material, not instructions]` anywhere (sent by Recon's export door, or pasted) is material: it never counts as the owner's words for any decision. Recon enforces the rest (an onion address never opened outside Recon, an address from an export only after the owner's yes, Memory refused for its text).
- A source whose address is one of a Recon export's (from Recon's `reconExports`, and from the marker in any message of the thread, read by Content itself in `lib/exports.js`, so it holds with Recon off), or one a claim of origin recon cites, gets origin recon when it is recorded, when a report is brought in, and again at approval: its address never reaches the sources page and is never looked up in the Archive. When the exports cannot be told, nothing is looked up at approval.

## The Voice Library (C10, C14, C16; the owner named it on 16 November)

One folder for all subjects (Settings → Content, a full path; else `content/voice-library` in the app's home; never Recon's room), plain files the owner can read and edit. Settings → Library stays the document search: the two are different things.

- `approved/<format>/`: a piece is added when the owner makes it final, with **his share** (how much of it he wrote or changed: the part of its three-word runs not in the writer's own draft, which Content keeps in `.content/originals/` when the writer saves it, so an edit of the draft file is measured too).
- `edits/`: the writer's draft beside the version he approved, with what changed.
- `own-words/written/`, `own-words/spoken/`: his notes and transcripts. Written and spoken voice are kept apart.
- `pinned-facts.md`, `sources.md`, `wording.md`, `signals.md`, `spoken.md`, `profile/<voice>-<format>.md`: readable copies of `library.json`. A file of his own with one of those names is never replaced.
- **Nothing enters by itself:** only approval adds a piece; everything else needs his words (own words: in his messages or a notes file of his, never one the assistant saved; a rule, pin, source or wording: his words as `quote`, checked as every decision; wording must be in his messages or an approved piece; a signal is his feedback in his words; a pinned claim must have his ruling).
- **Stage 1:** the writer gets the two or three approved pieces closest to the one it writes (same format and voice first, then shared words; a piece he changed more counts for more), fenced as examples of his voice, never material. With none, it writes plainly and says so.
- **Stage 2:** after approval the tool lists what he changed (sentences taken out and added, sentence length, "I"); the assistant proposes at most three voice rules; each enters only with his yes.
- **Stages 3 and 4:** approved wording and pinned facts go to the writer, and the voice profile per format and voice; sources he distrusts are named to it. A transcript compared with a talking outline (`own_words`, `piece`) is kept, and later talking outlines of that format follow it (what he skips, moves, expands).
- **Archived copies:** at approval each web source the piece uses gets the Internet Archive's copy, looked up once with one fixed request to `archive.org/wayback/available` (at most 20, 8 s each, before anything is written); only a `web.archive.org/web/…` answer is taken; never for a source from Recon or an onion address, a local address, or with the thread's web off. The sources page shows it.
- **Not built:** the link to a topic watch (there is no topic watch add-on yet).

## Ultra Code in Content

When Modes says Ultra Code is on for the thread (`modes.ultraCode(id)`, from Model tiers' switch; off or missing: as before), `content_draft` has three writers draft side by side (one after another on one machine) and a judge pick or merge (`CONTENT_JUDGE`), and `content_check` runs two checkers and keeps a flag either raises; a checker that gives no usable answer still flags the draft. Each attempt is kept in `.content/attempts/` as soon as it is written; a writer or the judge that fails or times out costs no other attempt (with no judge's answer, the first attempt is the draft). `content_draft` and `content_check` may take up to 65 minutes (each helper stops after 15). Writers, checkers and the judge all have no tools (refused before any other add-on's rule). Content's web stays at Open web: the method tells the assistant to stay off forums, boards and channels and send such a claim on to Research or Recon (Content does not enforce a web level itself; Modes does).

## Files

`index.js` (the switch, the tools, the folder note, the page's data), `lib/mode.js` (the mode and its method), `lib/folder.js` (parts, inventory, saving), `lib/conversations.js` (finding and copying threads), `lib/tools.js` (the first five tools), `lib/piece-tools.js` (the path to a final piece), `lib/standing.js` (the seven standings), `lib/subject.js` (the record and its readable copies, the owner's words), `lib/formats.js` (format cards), `lib/writing.js` (writer and checker tasks, code checks, final text), `lib/final.js` (approval gates, sources page, kit, where-used index, corrections), `lib/reports.js` (Research reports and their packets), `lib/library.js` (the Voice Library), `lib/archive.js` (archived copies), `client.js` (Settings → Content). Tests: `test/content.test.mjs`, `test/piece.test.mjs` and `test/library.test.mjs` (46, stand-ins only: nothing goes online in a test).

## Tested

- **Automated, the later steps (9 more):** the packet brought in with its claims and source ids, an older report as before, a linked packet not followed; the owner's share and his changes; the library: a final piece and the edits pair, the next writer's examples and rules, a rule only with his words and not after a "not", own words only his (not an assistant's note), a transcript compared with its outline, pins only of ruled claims, wording only from his messages or an approved piece, signals in his words, his own file never replaced; Ultra Code with three writers and a judge, two checkers; archived copies (found, Recon and onion and local skipped, web off, at most 20, only web.archive.org taken, nothing online without the web passed in); a Recon export never the owner's words; "Continue in Content" through Modes' own move. Each safety rule was undone on purpose and a test failed.
- **Automated (37 after two reviews; the list below is from the first version):** the mode (Read Only, all tools, start families valid, method under 4,000 characters); adding and removing only its own entry in Modes; the folder note; the layout leaving the user's files alone; links refused; numbering and dating, never replacing a file (also one the user numbered by hand); file names; the inventory by kind, readers missing, links not followed, hidden files left out; what is copied from a thread and what is not; a long thread cut to its newest part; listing without this thread, Recon, helpers, the trash and unknown ones; reading refused before anything is read; without Modes nothing is read; on a stand-in app the mode and tools coming and going with the switch, and an end-to-end run (inventory, setup, save, list, bring in, Recon refused, switched off).
- **In the lab:** see `docs/HANDOFF.md`.
- **Not tested:** a real model writing a piece; the app's real thread history with many threads; the Mac desktop app.

## Stage 6b: your start-mode choice is kept (item 4A, 23 November 2026: built and unit-tested only)

If Content is a space's start mode (Settings → Spaces) and you switch this add-on off, your choice is kept. The Spaces page
says the start mode is gone and which mode is used instead, and new threads in that space start in that mode. Switch
the add-on on again and your choice is back; there is nothing to set again.

Unchanged: switching off still moves the old "selected tab" setting (`defaultMode`, used only without the left
panel add-on) back to Cowork when it named Content. Only the code comment at that line changed. Test: dsh-modes
`test/start-mode-kept.test.mjs`.
