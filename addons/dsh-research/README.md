# Research

Plugin `@local/dsh-research` (dsh 0.2.2-rc.2). A mode and tab, beside Chat, Cowork and Code, for researching a question in depth. It is built on the **Deep research** add-on's engine and adds the experience around it.

Off until you switch it on in **Settings → Research**. Needs the Modes add-on, the Cowork sidebar and the Deep research add-on.

## What you get

- **The Research tab.** Its method: for any question that needs outside facts, run `deep_research`; ask one short question first only when it would change the research; present the report with every citation, the follow-up questions, the sources and the checks; keep facts, claims and opinions apart.
- **Depth and Focus** are dropdowns in the chat box of a Research conversation (since 0.55.0), each choice with a short description: Depth Quick (about 10 min, one round, up to 4 helpers), Standard (about 25 min, two rounds, up to 6), Thorough (about 45 min, three rounds, up to 8); Focus Web, News, Academic. Depth is one setting for all (Modes' `researchDepth`); Focus is kept per conversation and is where new conversations start. The start page has only the starter buttons. The helpers' model is in Settings → Research and in the One model button.
- **Live progress** above the message box while a run works, in any tab: the stage (plan, search, review, write), the round, searches run, pages read, sources found, helpers at work, the latest searches and sites, and the time.
- **Follow-up questions:** a report from the Research tab ends with three; once the run is done they show as buttons above the message box, and a click asks the question.
- **Saved reports:** each report from the Research tab is saved as Markdown in `research/reports` in the app's home (setting `folder`), named by local time and question. Settings → Research lists the latest and has **Show in Finder**.

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

2 Research tests and 1 new Deep research test (focus, follow-ups). In the lab with a stand-in model that plays the planner, searchers and writer: the tab, start page and Settings page; a Quick run with focus News (the planner got the News instruction), the progress strip, the saved report with follow-up questions, and a follow-up button sending its question. Not yet run with a real model and real web search.
