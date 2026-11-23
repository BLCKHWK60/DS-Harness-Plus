# Research

Add-on `@local/dsh-research` (dsh 0.2.2-rc.2). A mode, offered in the Mode list under the chat box in the Chat and Code spaces (item 4A: spaces replace tabs), for researching a question in depth. It is built on the **Deep research** add-on's engine and adds the experience around it.

**One Research page (Plus 1.0).** Settings → Research is the only Research page. When the Deep research add-on is installed, its engine settings (most minutes, most sources, which model each helper uses, helper limits, tool names) appear on this page under **Advanced: research engine**. Nothing was renamed or moved in your saved settings: both add-ons keep their own settings keys, and each works alone (without Deep research there is simply no Advanced group).

Off until you switch it on in **Settings → Research**. Needs the Modes, Left panel and Deep research add-ons.

## What you get

- **The Research mode.** Its method: for any question that needs outside facts, run `deep_research`; ask one short question first only when it would change the research; present the report with every citation, every "not read" label, the follow-up questions, the sources and the checks; keep facts, claims and opinions apart.
- **Depth** is, since Plus 0.59.0, the Modes add-on's Depth button, the same in every mode and space (the owner's rule: one Depth everywhere). In a Research thread it sets the run's size: Quick (about 10 min, one round, up to 4 helpers), Standard (about 25 min, two rounds, up to 6), Thorough (about 45 min, three rounds, up to 8). It is kept per thread, and a pick is where new threads start in every tab. Research's own Depth dropdown and its row in Settings → Research (Modes' `researchDepth`) are gone; Settings → Research says where Depth is set. The selection note gives the thread's own Depth. **Focus** is, since 18 November 2026, the Modes add-on's Web selector, the same in every tab (see Focus below); Research has nothing of its own in the chat box any more. The start page has only the starter buttons. The helpers' model is in Settings → Research and in the One model button.
- **Live progress** above the message box while a run works, in any thread: the stage (plan, search, review, write), the round, searches run, pages read (fetches that came back without an error), sources found, helpers at work, the latest searches and sites, and the time.
- **Follow-up questions:** a report from a Research thread ends with three; once the run is done they show as buttons above the message box, and a click asks the question.
- **Sources no helper read** (since 0.57.0) stay in the report, labelled: each source in the Sources list is marked `read`, `seen only in search results, not read`, or `not read, and not seen in search results`. A page counts as read only when a helper's fetch of it came back without an error (an error page such as 403 or 404 does not count; a paywall page that loads still does), and a source cited by several helpers keeps the most certain of what they did. The writer is told which findings come from pages their own helper did not read (even when another helper read the page) and is told to say so in the sentence, with that finding's label, the Checks count the cited sources that were not read, and the Research method tells the assistant to keep every "not read" label. The check makes sure every citation is in the source list; it does not compare a claim with the text of its page. To leave out every finding whose own helper did not read the page instead, even when another helper read it, set Deep research's `requireFetched: true` (configuration file only).
- **Read Only** (since 0.57.0): the Research mode's file sandbox is `read-only`. A thread that starts in Research, or is moved into it, gets the access level Read Only, so the assistant cannot change your files without asking you first. Moving it out of Research to a mode that sets no level of its own (Cowork) puts back the level it had before, also after a restart: the Modes add-on keeps that earlier level per thread. Code sets its own level as usual. A level you pick by hand in the chat box afterwards is kept, also across restarts. A Research thread that already ran before 0.57.0 keeps the level it has; pick Read Only in the chat box, or start a new one.
- **PTC preset:** under the app's PTC preset `run_code` is offered whatever the mode's tool list says (every tool, `deep_research` included, is called through it, so it cannot be taken away). Read Only stops a program from writing files; a program that wants to write must ask for a wider access level, which needs your approval. A program can still read files, run commands and go online. Saved reports and diagram pictures are written by the add-ons themselves, not by the thread, so Read Only does not stop them.
- **Time in PTC threads:** in a run started from a program, searching stops after about 7 minutes (with the app's default program limit of 10 minutes) and the report is written in the 3 minutes left, so a longer depth may do fewer rounds there. The Depth row on Settings → Research says so when the PTC runtime is there, and the Depth list in the chat box says a run stops sooner where tools run through programs.
- **Saved reports:** each Research report is saved as Markdown in `research/reports` in the app's home (setting `folder`), named by local time and question. Settings → Research lists the latest and has **Show in Finder**. Its "Good to know" list says how sources are labelled and that Research threads run Read Only.
- **The packet** (plan step C2, the owner's answer of 16 November: "both"): beside each saved report, a folder `<report>.md.packet/` with `claims.md` (each finding: the claim, who says it (the site), the passage, the source number, its grade, the date, and whether its helper read the page), `contradictions.md` (what the review between rounds found disagreeing), `timeline.md` (the findings with a date, oldest first), `leads.md` (what was still missing) and `packet.json`. Made by code from the run's own findings (`lib/packet.js`): no model is asked, so it costs no time. Bounded (400 claims, 100 contradictions, 100 leads); written new (`wx`, never through a link); `packet.json` names the report's SHA-256, so Content takes a packet only with its very report; a packet that cannot be written never costs the report. The report list is unchanged (it lists `.md` files). A Scratch report's packet goes with it.
- **Ultra Code** (the switch beside Effort): a Research run is the same loop, wider: more sub-questions and helpers (held to the caps), a counter-search on the key claims, two drafts and a judge with no tools. Off: exactly as before. See Deep research's README.
- **Continue in Content:** with the Content mode on, the progress box after a run that saved a report, and each report on Settings → Research, have a "Continue in Content" button. It opens a new thread in Scratch (never a folder of yours, never Recon's room), Content makes it a Content thread (Modes' own move), and it is sent one message that brings the report and its packet in. With Content off the button is not shown and the progress box behaves as before; whether Content is on is asked once per view, not per report.

## Focus

| Focus | What the planner and searchers are told |
|---|---|
| Web | Nothing extra: the whole web, primary sources first. |
| News | Recent reporting from established news organisations and wire services, each with its date; the newest and original reports. |
| Academic | Peer-reviewed papers, preprints (arXiv, SSRN, bioRxiv, medRxiv), reviews, research institutes and official statistics, with authors and year, peer-reviewed or not. |

A focus on your own documents (the Library) and dedicated academic and news sources (OpenAlex, arXiv, GDELT) are step 2.

**Since 18 November 2026 Focus is the Web selector's ticks** (the owner's one Web selector; Modes' README, the section on the Web selector). The Focus dropdown (`research-controls`) is gone from the chat box and from the gear; a Research thread picks its sources on the Web button like every mode (Off is greyed there: the Tools switch stops the web). A run's focus words come from the ticks (`focusFromTicks`): only Academic papers (with or without verified sources) is Academic, only News is News, anything else is Web; and the planner and searchers are also told the ticks themselves, while results and pages of other kinds are left out. The owner's choice: News and Academic are now "only", like every tick, not "prefer".
- **Carried over once** (`focusMoved`): each thread's pinned News focus became the ticks News and verified sources, Academic became Academic papers and verified sources (Modes' `carryWebSources`, never over ticks a thread already has); a starting focus other than Web (`research.focus`) became Research mode's starting ticks (Modes' `modeStart.research.sources`). Nothing is removed: the pins file and the old setting stay; after the move no new pins are written.
- Settings → Research: the Focus row is now "Sources (formerly Focus)" with a button to Settings → Web sources.
- Tests: `test/websources.test.mjs` (the focus from the ticks; the carry-over on a stand-in app, once, keeping the old record).

## Changed in Deep research (for this)

- `focus` (web, news, academic) as a tool argument; a Research thread's own focus wins.
- The writer adds "## Follow-up questions" when Research mode asks for it.
- Each run's progress is kept per thread (stage, round, helpers, searches, pages, sources, recent searches and sites, follow-ups, saved file) and served at `/dsh-deep-research/progress?session=…` and as the `deepResearch` service.

## Scratch

A report made in a Scratch thread (a private folder with no link to your own files) is saved and listed as usual, and removed when that thread is deleted for good (Delete permanently, Empty trash, or after 30 days in the trash). Only in Research's own report folder: a folder you picked yourself in Settings is never touched.

## Tested

0.57.0: `test/research.test.mjs` (the mode is Read Only, an older stored Research mode with `inherit` is replaced, the method keeps the "not read" labels, Settings → Research's description and its search entry say what the check does and name all three labels, and its Good to know list says claims are not compared with the pages, with no "word for word") and `test/apply.test.mjs` (the add-on on a stand-in app: Research is handed to Modes as a Read Only mode, an older stored mode is rewritten, Deep research gets the focus, follow-ups and saving only in a Research thread). The labels themselves are tested in Deep research (`test/sources.test.mjs`, `test/report.test.mjs`). That Modes sets Read Only and puts the earlier level back is tested in the Modes add-on.

Before: 2 Research tests and 1 new Deep research test (focus, follow-ups). In the lab with a stand-in model that plays the planner, searchers and writer: the mode, start page and Settings page; a Quick run with focus News (the planner got the News instruction), the progress strip, the saved report with follow-up questions, and a follow-up button sending its question. Not yet run with a real model and real web search.

## Stage 6a: a space keeps its rules for any mode (item 4A, 22 November 2026)

A sealed thread (any mode in Recon, or a Modes read error) saves no report, packet or pin and gets no selection note.
Deep research does not run in Recon, so nothing is lost there; this is a second fence. Without the Modes add-on Research
saves as before.

## Stage 6b: your start-mode choice is kept (item 4A, 23 November 2026: built and unit-tested only)

If Research is a space's start mode (Settings → Spaces) and you switch this add-on off, your choice is kept. The Spaces page
says the start mode is gone and which mode is used instead, and new threads in that space start in that mode. Switch
the add-on on again and your choice is back; there is nothing to set again.

Unchanged: switching off still moves the old "selected tab" setting (`defaultMode`, used only without the Left panel
add-on) back to Cowork when it named Research. Only the code comment at that line changed. Test: dsh-modes
`test/start-mode-kept.test.mjs`.
