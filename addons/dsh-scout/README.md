# Scout

Plugin `@local/dsh-scout` (dsh 0.2.2-rc.2). A mode and tab, beside Chat, Cowork and Code, for finding work: jobs, freelance projects, contracts and public tenders. It is research, not a tracker: nothing is sent, submitted or applied for.

Off until you switch it on in **Settings → Scout**. Needs the Modes add-on and the Cowork sidebar. Reading PDFs needs the PDF reader add-on.

## What a run does

1. States its understanding: the work, seniority, skills, pay target, work types and markets, and every assumption.
2. Researches the field first: the titles in use in each market and its language, the most distinctive skills, pay and demand, and where each work type is found.
3. Plans: picks sources from the registry and writes the queries per source and language.
4. Searches, reads the promising postings, removes duplicates, scores fit, freshness, pay and legitimacy with reasons, and flags likely ghost jobs and scams.
5. Plans the approach for the best ones: who, which channel, when, and a short draft.
6. Writes the report and saves it in the Scout folder as Markdown and a table (CSV).

## The start page

Work, place, pay target, work type, and the markets as chips (USA, UK, Germany and Spain to begin with; add or remove any). **+ Files** puts a resume, LinkedIn export (PDF) or notes into the Scout folder. What was selected when a conversation started stays that conversation's selection.

## Your files and your profile

- **Files** stay in the Scout folder (`scout/files` in the app's home unless you set `folder`). They are read only when the conversation's model runs on your own machines (this computer or your own network). A cloud model gets neither their text nor their names.
- **The profile** is a short summary without your name, contact details or employer names. Write it in Settings → Scout, or ask Scout with a local model to write it from your files. It goes to a local model without asking; a cloud model gets it only after you type `/scout cloud` in that conversation (until the app is closed). A profile with an email address, a phone number or a LinkedIn profile address is refused.
- `/scout` shows which model the conversation uses and what it may read.

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
- These tools, and no others: `scout_sources`, `scout_search`, `scout_posting`, `scout_files`, `scout_profile`, `scout_report`; `web_search` and `web_fetch` (with the Search switch), `deep_research` (with its switch), Finance's news, filings and figures tools when Finance is on, `diagram_draw`, `todo_write`, `ask_user_question`. No file, shell or program tools.
- Scout's own tools exist only in Scout conversations (and helpers working for them); other modes do not see them.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `enabled` | `false` | The Scout tab, its tools and instructions. |
| `title`, `location`, `salary`, `workType` | empty, `any` | The start page's fields. |
| `markets` | USA, UK, Germany, Spain | Where to search. |
| `folder` | empty | The Scout folder; empty is `scout/files` in the app's home. |
| `sourceState`, `extraSources` | `{}`, `[]` | Your changes to the registry (set from the Settings page). |

## Limits

- Each conversation may make 400 requests to the sources.
- Results depend on what each source lists and on the model. Check a posting on its own page before acting on it.
- Adzuna, USAJOBS and Reed were built from their documentation and tested with stand-in answers; they are untested against the real services until a key is added.

## Tested

11 tests (`test/scout.test.mjs`): the mode, the registry and its terms, every source reader (Bundesagentur, Arbeitnow, Greenhouse, Lever and Ashby from answers saved from the real services; Hacker News, Adzuna, USAJOBS and Reed from their documented shapes), the store, the private folder and profile, the report, and the tools with a local and a cloud model. In the lab app with a stand-in model: the tab, start page and Settings page; the tool list of a Scout conversation; a Cowork conversation getting none of Scout's tools; the `web_fetch` guard; and one real search of the Bundesagentur (123 postings).
