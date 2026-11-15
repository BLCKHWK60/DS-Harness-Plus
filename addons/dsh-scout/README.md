# Scout

Plugin `@local/dsh-scout` (dsh 0.2.2-rc.2). A mode and tab, beside Chat, Cowork and Code, for finding work: jobs, freelance projects, contracts and public tenders. It is research, not a tracker: nothing is sent, submitted or applied for.

Off until you switch it on in **Settings → Scout**. Needs the Modes add-on and the Cowork sidebar. Reading PDFs needs the PDF reader add-on.

## What a run does

1. States its understanding: the work, seniority, skills, pay target, work types and markets, and every assumption.
2. Researches the field first: the occupation's names in each language and its skills (ESCO), how many live postings each title variant has in each market (so it searches with the words employers use), pay (from postings, Adzuna's statistics and official pages), and where each work type is found.
3. Plans: picks sources from the registry and writes the queries per source and language.
4. Searches, reads the promising postings, removes duplicates, scores fit, freshness, pay and legitimacy with reasons, and flags likely ghost jobs and scams.
5. Plans the approach for the best ones: who, which channel, when, and a short draft.
6. Writes the report and saves it in the Scout folder as Markdown and a table (CSV).

## The start page

Work, place, pay target, work type, and the markets as chips (USA, UK, Germany and Spain to begin with; add or remove any). **+ Files** puts a resume, LinkedIn export (PDF) or notes into the Scout folder. What was selected when a conversation started stays that conversation's selection.

## Your files and your profile

- **Files** stay in the Scout folder (`scout/files` in the app's home unless you set `folder`). Scout reads them with whichever model the conversation uses, local or cloud (since 0.51.2; only Recon keeps cloud models out).
- **The profile** is a short summary: titles, years, skills, languages, pay and what you want. Write it in Settings → Scout, or ask Scout to write it from your files; Scout is told to show you the draft and save it only after you agree (the tool itself does not ask). Each save keeps the profile before it as `profile.md.bak` next to it.
- `/scout` shows which model the conversation uses.

## Sources

A registry you control in Settings → Scout: switch any source on or off, hide a starting one, add your own. Each source records how it may be reached, and Scout holds to it:

| Access | Meaning |
|---|---|
| Interface | Searched directly with `scout_search`. |
| Single pages | Pages may be read one at a time with `web_fetch`. |
| Search engine only | Found through web search; its pages are never fetched. A guard refuses `web_fetch` on these sites in Scout conversations, including their country sites (uk.indeed.com, stepstone.at). |

Starting sources with an interface: Bundesagentur für Arbeit (Germany, no key), Arbeitnow (Germany and remote, no key), Hacker News hiring threads (no key), Greenhouse, Lever and Ashby company boards (no key; give the company's board name), Adzuna (13 markets, free key `APP_ID:APP_KEY`), USAJOBS (free key `EMAIL:KEY`), Reed (UK, free key). Keys are kept in the app's secret store.

Also listed: GOV.UK Find a job, EURES, TED, IT Jobs Watch, ESCO and O*NET (single pages); Indeed, LinkedIn, StepStone, freelancermap, GULP, Totaljobs, Jobserve, Dice, Wellfound, InfoJobs, Tecnoempleo and Malt (search engine only).

## What the assistant is given

- The method (under 4,000 characters) and the start-page selection.
- These tools, and no others: `scout_sources`, `scout_search`, `scout_posting`, `scout_titles`, `scout_demand`, `scout_pay`, `scout_files`, `scout_profile`, `scout_report`; `web_search` and `web_fetch`, `deep_research` (Scout always has the web: there is no Web button in its chat box), Finance's news, filings and figures tools when Finance is on, `diagram_draw`, `todo_write`, `ask_user_question`. No file, shell or program tools.
- Scout's own tools exist only in Scout conversations; other modes do not see them. Helpers a Scout conversation starts (Deep research) get the search and research tools, but never `scout_files`, `scout_profile` or `scout_report`: they read web pages that may carry hidden instructions.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `enabled` | `false` | The Scout tab, its tools and instructions. |
| `title`, `location`, `salary`, `workType` | empty, `any` | The start page's fields. |
| `markets` | USA, UK, Germany, Spain | Where to search. |
| `folder` | empty | The Scout folder; empty is `scout/files` in the app's home. |
| `sourceState`, `extraSources` | `{}`, `[]` | Your changes to the registry (set from the Settings page). |

## Research tools (step 2)

| Tool | What it gives | Source |
|---|---|---|
| `scout_titles` | The occupation's official and common names in each language of the selected markets, its ISCO group, its essential and optional skills. | ESCO, the EU's list of occupations and skills (public, no key). Its names are official ones; they are checked against live postings. |
| `scout_demand` | Live postings per title variant in one market (up to 8 titles). | Bundesagentur (Germany, no key); Adzuna, Reed and USAJOBS when their keys are set. |
| `scout_pay` | Pay given in postings found in the conversation (per currency and period, with the posting numbers); Adzuna's spread of advertised yearly pay across a market; where official figures can be read. | Postings; Adzuna (key); pages such as O*NET, IT Jobs Watch, the Entgeltatlas, INE. |

The Bundesagentur's pay statistics (Entgeltatlas) are not read directly: their interface refuses the public key, and the other way in uses a sign-in taken from the Bundesagentur's own website, which is not offered for outside use. The model is pointed to the Entgeltatlas pages instead.

## Limits

- Each conversation may make 400 requests to the sources, counted across restarts.
- Each conversation's postings, their numbers (P1, P2, ...) and its request count are kept in `scout/postings` in the app's home, so a conversation reopened after a restart goes on with the same numbers. The newest 200 conversations are kept; a deleted conversation's file stays until it falls out of those 200.
- Results depend on what each source lists and on the model. Check a posting on its own page before acting on it.
- Adzuna, USAJOBS and Reed were built from their documentation and tested with stand-in answers; they are untested against the real services until a key is added.

## Tested

Step 2: 2 more tests (ESCO from saved answers, demand, pay reading, Adzuna's spread); a live run against ESCO and the Bundesagentur ("Data Engineer" 851 postings in Germany, "Dateningenieur" 0, "Analytics Engineer" 233). Not run in the app with a real model yet.

Step 1: 11 tests (`test/scout.test.mjs`): the mode, the registry and its terms, every source reader (Bundesagentur, Arbeitnow, Greenhouse, Lever and Ashby from answers saved from the real services; Hacker News, Adzuna, USAJOBS and Reed from their documented shapes), the store, the private folder and profile, the report, and the tools with a local and a cloud model. In the lab app with a stand-in model: the tab, start page and Settings page; the tool list of a Scout conversation; a Cowork conversation getting none of Scout's tools; the `web_fetch` guard; and one real search of the Bundesagentur (123 postings).

Audit fixes: 3 more tests. `test/index.test.mjs` runs the add-on against a stand-in for the app: the mode added and taken out with the switch, which tools a Scout conversation, its helpers and a Cowork conversation get, the `web_fetch` guard, the selection a conversation started with, and the Settings page's actions. In `test/scout.test.mjs`: postings kept across a restart, and `scout_pay` with Adzuna's key.
