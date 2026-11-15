# Research

Plugin `@local/dsh-research` (dsh 0.2.2-rc.2). A mode and tab, beside Chat, Cowork and Code, for researching a question in depth. It is built on the **Deep research** add-on's engine and adds the experience around it.

Off until you switch it on in **Settings → Research**. Needs the Modes add-on, the Cowork sidebar and the Deep research add-on.

## What you get

- **The Research tab.** Its method: for any question that needs outside facts, run `deep_research`; ask one short question first only when it would change the research; present the report with every citation, every "not read" label, the follow-up questions, the sources and the checks; keep facts, claims and opinions apart.
- **Depth and Focus** are dropdowns in the chat box of a Research conversation (since 0.55.0), each choice with a short description: Depth Quick (about 10 min, one round, up to 4 helpers), Standard (about 25 min, two rounds, up to 6), Thorough (about 45 min, three rounds, up to 8); Focus Web, News, Academic. Depth is one setting for all (Modes' `researchDepth`); Focus is kept per conversation and is where new conversations start. The start page has only the starter buttons. The helpers' model is in Settings → Research and in the One model button.
- **Live progress** above the message box while a run works, in any tab: the stage (plan, search, review, write), the round, searches run, pages read (fetches that came back without an error), sources found, helpers at work, the latest searches and sites, and the time.
- **Follow-up questions:** a report from the Research tab ends with three; once the run is done they show as buttons above the message box, and a click asks the question.
- **Sources no helper read** (since 0.57.0) stay in the report, labelled: each source in the Sources list is marked `read`, `seen only in search results, not read`, or `not read, and not seen in search results`. A page counts as read only when a helper's fetch of it came back without an error (an error page such as 403 or 404 does not count; a paywall page that loads still does), and a source cited by several helpers keeps the most certain of what they did. The writer is told which findings come from pages their own helper did not read (even when another helper read the page) and is told to say so in the sentence, with that finding's label, the Checks count the cited sources that were not read, and the Research method tells the assistant to keep every "not read" label. The check makes sure every citation is in the source list; it does not compare a claim with the text of its page. To leave out every finding whose own helper did not read the page instead, even when another helper read it, set Deep research's `requireFetched: true` (configuration file only).
- **Read Only** (since 0.57.0): the Research mode's file sandbox is `read-only`. A conversation that starts in Research, or is moved into it, gets the access level Read Only, so the assistant cannot change your files without asking you first. Moving it out of Research to a mode that sets no level of its own (Cowork) puts back the level it had before, also after a restart: the Modes add-on keeps that earlier level per conversation. Code sets its own level as usual. A level you pick by hand in the chat box afterwards is kept, also across restarts. A Research conversation that already ran before 0.57.0 keeps the level it has; pick Read Only in the chat box, or start a new one.
- **PTC preset:** under the app's PTC preset `run_code` is offered whatever the mode's tool list says (every tool, `deep_research` included, is called through it, so it cannot be taken away). Read Only stops a program from writing files; a program that wants to write must ask for a wider access level, which needs your approval. A program can still read files, run commands and go online. Saved reports and diagram pictures are written by the add-ons themselves, not by the conversation, so Read Only does not stop them.
- **Time in PTC conversations:** in a run started from a program, searching stops after about 7 minutes (with the app's default program limit of 10 minutes) and the report is written in the 3 minutes left, so a longer depth may do fewer rounds there. The Depth dropdown and Settings → Research say so when the PTC runtime is there.
- **Saved reports:** each report from the Research tab is saved as Markdown in `research/reports` in the app's home (setting `folder`), named by local time and question. Settings → Research lists the latest and has **Show in Finder**. Its "Good to know" list says how sources are labelled and that Research conversations run Read Only.

## Focus

| Focus | What the planner and searchers are told |
|---|---|
| Web | Nothing extra: the whole web, primary sources first. |
| News | Recent reporting from established news organisations and wire services, each with its date; the newest and original reports. |
| Academic | Peer-reviewed papers, preprints (arXiv, SSRN, bioRxiv, medRxiv), reviews, research institutes and official statistics, with authors and year, peer-reviewed or not. |

A focus on your own documents (the Library) and dedicated academic and news sources (OpenAlex, arXiv, GDELT) are step 2.

## Changed in Deep research (for this)

- `focus` (web, news, academic) as a tool argument; a Research conversation's own focus wins.
- The writer adds "## Follow-up questions" when the Research tab asks for it.
- Each run's progress is kept per conversation (stage, round, helpers, searches, pages, sources, recent searches and sites, follow-ups, saved file) and served at `/dsh-deep-research/progress?session=…` and as the `deepResearch` service.

## Tested

0.57.0: `test/research.test.mjs` (the mode is Read Only, an older stored Research mode with `inherit` is replaced, the method keeps the "not read" labels, Settings → Research's description and its search entry say what the check does and name all three labels, and its Good to know list says claims are not compared with the pages, with no "word for word") and `test/apply.test.mjs` (the add-on on a stand-in app: Research is handed to Modes as a Read Only mode, an older stored mode is rewritten, Deep research gets the focus, follow-ups and saving only in a Research conversation). The labels themselves are tested in Deep research (`test/sources.test.mjs`, `test/report.test.mjs`). That Modes sets Read Only and puts the earlier level back is tested in the Modes add-on.

Before: 2 Research tests and 1 new Deep research test (focus, follow-ups). In the lab with a stand-in model that plays the planner, searchers and writer: the tab, start page and Settings page; a Quick run with focus News (the planner got the News instruction), the progress strip, the saved report with follow-up questions, and a follow-up button sending its question. Not yet run with a real model and real web search.
