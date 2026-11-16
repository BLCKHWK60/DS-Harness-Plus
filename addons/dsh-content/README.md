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

## Not built yet (later steps of the plan)

The claims ledger and its standings (C3), angles, brief and tagged outline as files (C4), format cards and the writer with no tools (C5), the drift check, approval and `final/` (C6), the sources page and publish kit (C7), Recon's export door (C8, a decision for the owner), a typed subject with its own research and "Continue in Research" (C9), the Library of approved pieces (C10, C14, C16; it needs a name of its own, since Settings → Library already exists), the where-used index (C11), own-words interviews (C12), and "Continue in Content" from a Research report (C2, which needs Research to write a fuller packet).

## Files

`index.js` (the switch, the tools, the folder note, the page's data), `lib/mode.js` (the mode and its method), `lib/folder.js` (parts, inventory, saving), `lib/conversations.js` (finding and copying conversations), `lib/tools.js` (the five tools), `client.js` (Settings → Content). Tests: `test/content.test.mjs` (21, stand-ins only).

## Tested

- **Automated (21, after the review):** the mode (Read Only, all tools, start families valid, method under 4,000 characters); adding and removing only its own entry in Modes; the folder note; the layout leaving the user's files alone; links refused; numbering and dating, never replacing a file (also one the user numbered by hand); file names; the inventory by kind, readers missing, links not followed, hidden files left out; what is copied from a conversation and what is not; a long conversation cut to its newest part; listing without this conversation, Recon, helpers, the trash and unknown ones; reading refused before anything is read; without Modes nothing is read; on a stand-in app the mode and tools coming and going with the switch, and an end-to-end run (inventory, setup, save, list, bring in, Recon refused, switched off).
- **In the lab:** see `docs/HANDOFF.md`.
- **Not tested:** a real model writing a piece; the app's real session history with many conversations; the Mac desktop app.
