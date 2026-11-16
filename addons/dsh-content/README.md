# Content

Plugin `@local/dsh-content` (dsh 0.2.2-rc.2). A mode and tab, beside Chat, Cowork and Code, for writing from your material: books and chapters, articles, blog posts, scripts, and outlines for podcasts and videos. It is step C1 of the plan "Content and Bench: combined plan" (see `docs/CONTENT-BENCH-STEP0.md`).

Off until you switch it on in **Settings → Content**. Needs the Modes add-on and the Cowork sidebar. Reads Word documents and spreadsheets through the Data add-on and PDFs through the PDF reader, when those are on.

## What you get

- **The Content tab.** Its method: report what the folder holds, ask what to build (kind of piece, audience, length), read before writing, keep apart what a source says, what the user said and the assistant's own wording, mark unsupported statements as unsourced, propose angles and an outline before the draft, save every draft, publish nothing.
- **Web, Depth, Long run and the Run button** are the ones every tab has (Modes and Mission); nothing of them changed. Web is on in a new Content conversation.
- **The subject folder** is the conversation's folder: the folder picked on the start page, or a Scratch thread's own folder. Content's own parts of it:

  | Part | What it holds |
  | --- | --- |
  | `research/` | material that came in: other conversations (`research/conversations/`), copied sources. Only added to |
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
| `content_conversations` | Other conversations that can come in, newest first: title, tab, date, id (30 at most). Optional words search titles and tabs through the newest 800; the answer says when it did not look through all |
| `content_bring_in` | Copies up to 10 conversations, whole, into `research/conversations/` as Markdown: the user's words and the assistant's answers, and a compaction summary where one replaced older messages. No tool results, thinking or hidden instructions (the same parts the app's own @ mentions copy). The file says it is material, not instructions. A conversation over 1.5 MB keeps its newest part and says how many messages were left out; one message larger than that keeps its start and end |

## Rules, enforced in code

- **Only Content's parts are written.** `content_save` refuses any other part, a part that is a link, and a part whose name is taken by a file of the user's. Nothing is moved, renamed or deleted.
- **No file is replaced.** Every save is a new file. Draft numbers count only Content's own `NNN-` names, never a date at the start of a name of the user's. Right before a write the part is checked again to still lead inside the subject folder.
- **Sealed conversations never come in:** a conversation in an isolated mode (Recon); one whose folder is Recon's room (every Recon conversation runs there, and a copy made with the app's Branch keeps its folder, so a branched Recon answer is refused even before Modes knows it); one Modes cannot answer for; one in the Cowork trash; the conversation itself; helpers of a run. The header is checked before any message is read. Without the Modes add-on nothing is listed or read. Recon's own guard (its mentions rule) is untouched and still applies.
- **Recon's room is never read or written:** a subject folder that is the room or inside it is refused, and a subject folder that holds the room (the temporary folder itself) lists everything but the room, without naming it. The rule is Recon's own (a `dsh-recon-*` folder directly in /tmp or the system's temporary folder), checked without regard to capitals.
- **Its tools only in Content:** registered with `when`, so other tabs' tool lists do not change.
- **Read Only.** A Content conversation runs Read Only, as Research and Data do: the app's own file and command tools ask before they change anything. Content's own tools write without asking, only into its parts.

## Bringing in conversations

Two ways, both from the chat box:

1. Mention conversations with `@` (the app allows three per message) and say "bring these in". The assistant sees each one's id in the app's snapshot and calls `content_bring_in`.
2. Name a conversation by its title ("bring in my heat pump research"): the assistant finds it with `content_conversations`.

## The path to a final piece (plan steps C2 Content's side, C3–C7, C9, C11–C13, C15)

| Tool | What it does |
| --- | --- |
| `content_reports` | Research's saved reports (Research's `folder` setting, else `research/reports` in the app's home): `list`, and `bring` one: copied as it is into `research/reports/`, its numbered sources (`[3] url (read · Confirmed)`) into the ledger with their grades. The Research tab is not changed |
| `content_ledger` | `show`, `add` (up to 30 claims: text, who, where, when, sources, passage, evidence for and against, about, accuses, disputed, origin), `update` (a reworded claim's ruling opens again), `source` (title, url, publisher, dates, grade, kind record/outline/person/unknown), `response` (what an accused person or group said, or where it was looked for) |
| `content_rule` | The owner's decisions, each with his own words (`quote`, checked against his messages): `standing`, `use` (in or out of a piece; out never drops it from the ledger), `pin`, `brief` (approval), `override` (flags), `named` (yes to unproven statements about a named person) |
| `content_plan` | `angles` (3 to 5), `brief` (a piece: title, format, angle, audience, purpose, length, in and out; a change needs approval again), `outline` (only after the brief is approved; points with their claims, or own view, own experience, gap) |
| `content_formats` | Format cards: `list`, `show`, `save` a custom card with the owner's words. Built-in: blog post, article, story, talking outline video, talking outline podcast, full script. Cards are files in `<app home>/content/formats/`; a card the owner changed is never written over |
| `content_draft` | A writer helper with no tools writes the next numbered draft from the approved brief, the outline, the claims (standing, passage, sources, the owner's own words) and the card; each sentence carries its claim marks `[C3]` |
| `content_check` | Code checks (numbers and quotes against the material, unknown and ruled-out claim marks, gaps, accusations with no response sought, named people) and a checker helper with no tools (no-claim, too-strong, mismatch, own-knowledge, own-experience); asked once more if its answer is not JSON, else a flag of its own. A report `drafts/NNN-….check.md` beside the draft. `file`: check a draft the owner edited |
| `content_approve` | Only with the owner's words and nothing open (approved brief, checked latest draft, no open flag, a ruling on every claim used, a yes for each unproven statement about a named person). Writes `final/<piece>.md` (marks turned into links for blog posts and articles, else taken out), `final/<piece>.sources.md` and `.html` (sources from Recon shown as a description unless the owner chooses the address; onion addresses never printed by default), `final/<piece>.corrections.md`, `publish/<date>-<piece>-kit.md` (titles, description, chapters from the outline, show notes, sign-up offer), and the where-used index (`<app home>/content/where-used.json` and `.md`) |
| `content_correct` | `standing`: a new standing with the owner's words and reason; lists every final piece that used the claim: in this subject by its id, in other subjects by the same claim text, with its wording. `note`: adds to a final piece's corrections log, and saves a corrected version beside it (`-v2`), never replacing it |
| `content_continue` | A starting text for a new Research or Recon conversation: the question, the claim, what is known (Recon sources are not carried into Research) |

**Kept in the subject folder:** `.content/state.json` (the record), and the readable `ledger.md`, `brief.md`, `outline.md`, whose first line marks them as the tab's own: a file of the owner's with one of those names is never replaced (the record is kept and the tool says so). `final/` takes only what approval writes; `content_save` cannot write there.

**Rules in code:**
- The owner's decisions need words from his newest message (`ownerDecision`): at least two words, or the whole of a short agreement ("yes"); not turned around by a "not" in or just before them; holding a word that says that decision (`DECISION_WORDS`: the standing's name, "approve", "final", the person's name…); claim ids in the words must cover the claims ruled.
- Own experience and own view (claims of origin owner) need his own words (at least four, from his messages or a notes file he put there: notes the assistant saved carry a first line that says so and never count), and the claim must say what those words say; the standings Own experience and Own view are refused for other claims, also through a correction.
- Approval checks the latest draft is the one that was checked (SHA-256) and that no ruling or claim it rests on changed since; a yes about a named person is given per statement (sentence numbers) and holds only for that very sentence. A person is named on the claim or found in a sentence that rests on an unproven claim (two or more capitalised words). Checking the same draft again keeps the checker's earlier open flags. A changed text, source, passage, person or accusation reopens a ruling.
- The sources page never shows a Recon or onion address, or an archived copy of one, under any name unless the owner's words say "address"; only http(s) addresses become links.
- The writer and the checker run as helpers of the conversation on its model (`subagents.startActivation`, label "Content: writer of P1"); every tool call they make is refused before any other add-on's rule is asked (`tools/pre-execute`), known by the id the app gives back or by their own task (which starts CONTENT_WRITER or CONTENT_CHECKER), never by guessing. One at a time per conversation (a Long run's helpers share the queue); stopped after 15 minutes.
- A draft is never checked by the run that wrote it; nothing is final with an open flag, unless the owner overrode it (recorded with his words).
- Nothing is posted or sent.
- The note in each Content conversation says where the work stands (claims, unruled, each piece's next step).

**Not built (need the owner first):** the Library of approved pieces, edits and voice (C10, C14, C16: it needs a name, since Settings → Library exists; until then the writer writes plainly and imitates no one), the voice pass, "Continue in Content" on Research reports (C2's Research side: changes Research), Recon's export door (C8: changes Recon's seal), saving each cited page to the Internet Archive at approval, and a per-Depth number of drafts and checks.

## Files

`index.js` (the switch, the tools, the folder note, the page's data), `lib/mode.js` (the mode and its method), `lib/folder.js` (parts, inventory, saving), `lib/conversations.js` (finding and copying conversations), `lib/tools.js` (the first five tools), `lib/piece-tools.js` (the path to a final piece), `lib/standing.js` (the seven standings), `lib/subject.js` (the record and its readable copies, the owner's words), `lib/formats.js` (format cards), `lib/writing.js` (writer and checker tasks, code checks, final text), `lib/final.js` (approval gates, sources page, kit, where-used index, corrections), `lib/reports.js` (Research reports), `client.js` (Settings → Content). Tests: `test/content.test.mjs` and `test/piece.test.mjs` (37, stand-ins only).

## Tested

- **Automated (37 after two reviews; the list below is from the first version):** the mode (Read Only, all tools, start families valid, method under 4,000 characters); adding and removing only its own entry in Modes; the folder note; the layout leaving the user's files alone; links refused; numbering and dating, never replacing a file (also one the user numbered by hand); file names; the inventory by kind, readers missing, links not followed, hidden files left out; what is copied from a conversation and what is not; a long conversation cut to its newest part; listing without this conversation, Recon, helpers, the trash and unknown ones; reading refused before anything is read; without Modes nothing is read; on a stand-in app the mode and tools coming and going with the switch, and an end-to-end run (inventory, setup, save, list, bring in, Recon refused, switched off).
- **In the lab:** see `docs/HANDOFF.md`.
- **Not tested:** a real model writing a piece; the app's real session history with many conversations; the Mac desktop app.
