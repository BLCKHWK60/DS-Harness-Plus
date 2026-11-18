# Deep research

Host plugin `@local/dsh-deep-research` (dsh 0.2.2-rc.2). It adds one tool, `deep_research`, that the model can call for questions that need several sources. It wraps what dsh already has (child agents, the `web_search` / `web_fetch` tools and whichever search backend `dsh-web` uses); the new code is the orchestration, the citation check and the labels that say which sources a helper read.

## How a run works

1. **Plan**: a planner helper splits the question into sub-questions that cover different angles (the facts, the numbers, recent developments, primary sources, the strongest criticism), each with two or three search queries.
2. **Research**: one searcher helper per sub-question, several at once. Each is told to run several searches, open every page it cites, prefer primary and recent sources, and return findings `{claim, url, quote, date}`, the queries it ran, and what it could not find.
3. **Review** (between rounds): an analyst helper reads everything found so far and names what is still unanswered, where sources contradict each other, and which claims need the original document. It then writes follow-up sub-questions with **sharper queries**, built from the names, terms and dates the findings revealed. If the question is already answered well, it says so and the run goes straight to the report.
4. **Next round**: new searchers take the follow-ups. Each is told what is already established and which queries were already run, so it digs deeper and does not repeat.
5. **Merge**: URLs are normalized (host lower-cased, fragment removed) and de-duplicated into numbered sources; the same claim from the same page is kept once.
6. **Write**: a writer helper writes the report from the numbered findings only: the answer first, then the detail, contradictions set out side by side, and what could not be established. A finding whose own helper did not read the page is labelled in what the writer gets (with what that helper did, not the source's label, so another helper having read the page does not hide it), and the writer is told to say so in the sentence with that finding's own label ("(seen only in search results, not read)" or "(not read, and not seen in search results)") and never to present it as confirmed.
7. **Check**: the host verifies that every `[n]` is in the source list and labels each source by how the helpers came to it (`lib/sources.js`). It does not compare a claim or its quote with the text of the page. The result ends with a `## Sources` list and a `## Checks` list that starts with the depth, the rounds run, the helpers used at once and the number of sources.

## Sources no helper read

Findings from pages no helper read stay in the report (the owner's choice in 0.57.0, research-4), with a label in the Sources list. A source's label comes from what the helpers that cited it did; the other helpers are not counted (each helper's record is its own). A finding the writer gets carries the label of what its own helper did, which can be less certain than its source's label (see **Two helpers, one page**).

| Label | What it means |
| --- | --- |
| `read` | A helper that cited it read the page: its `web_fetch` (one of `fetchToolNames`) came back without an error. |
| `seen only in search results, not read` | The address was in the search results of a helper that cited it, but none of the helpers that cited it read the page: what the report takes from it rests at most on the search result's short summary. |
| `not read, and not seen in search results` | None of the helpers that cited it read the page, and it was not in the search results of the helpers that cited it (a link from another page, or the helper's own memory). |

- **Read means the fetch came back.** A page counts as read when its fetch's result arrives without an error, not when the helper asks for it. A result marked as an error (a timeout, a refused or too large page, a blocked redirect, a page type the app cannot read) does not count, and neither does an error page from the site: `web_fetch` gives the page's HTTP status, and 400 or above (403, 404, 500 …) does not count. Other fetch tools give no status, so only the error mark applies to them. A page that answers normally with only a teaser (a paywall) still counts as read. After a redirect the page it ended on counts as read too. The progress strip's "pages read" counts the same way.
- **Two helpers, one page.** When several helpers cite the same address, the source keeps the most certain of what they did: read, then seen in search results, then neither (`moreCertain` in `lib/sources.js`). So a page one helper named from memory and another saw in its search results is `seen only in search results, not read`. That merged label is the Sources list's. Each finding keeps its own helper's label for the writer: when one helper read a page and another only saw it in its search results, the second helper's finding reaches the writer labelled `seen only in search results, not read`, since that helper wrote its claim from the search result, not from the page. The same claim from the same page, reported by two helpers, is kept once with the more certain of their two labels.

The `## Checks` list counts the cited sources of the last two kinds, one line each. When a source is listed as read but a claim about it came from a helper that did not read the page (that claim is labelled in the text), one more line says so, so the two do not look like a contradiction. Before 0.57.0 the labels were `fetched`, `search result only` and `not fetched`, and the tool's description said every citation was checked "against the pages the children fetched", which promised a comparison with the page text that is not made.

`requireFetched: true` (configuration file only) drops every finding whose own helper did not read the page instead. It decides per finding, from that helper's record: a finding is dropped even when another helper read the same page. The Checks then say how many were dropped and why ("or its helper did not read the page").

## Depth: Quick, Standard, Thorough

Since Plus 0.59.0 a run is as big as the **Depth of the conversation that starts it**: the Modes add-on's Depth button, the same in every tab (`modes.depthOf(sessionId)`; a helper follows its conversation). An older Modes without `depthOf`: its `researchDepth()`; without Modes: this add-on's `depth`. (Before 0.59.0 it was one setting for all conversations, Modes' `researchDepth`, chosen with a Depth dropdown in a Research conversation's chat box or in Settings → Research.)

| Depth | Rounds | Helpers at once | Sub-questions | Follow-ups per later round | Findings per helper | Time limit | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Quick | 1 | up to 4 | up to 4 | none | 6 | 10 min | 30 |
| Standard | 2 | up to 6 | up to 6 | up to 6 | 8 | 25 min | 60 |
| Thorough | 3 | up to 8 | up to 8 | up to 8 | 10 | 45 min | 120 |

- **Helpers at once are also held to the Tier add-on's sub-agent limit** (Settings → Model Tiers, 4 unless changed). To really get 8, raise that limit to 8.
- A new round starts only while at least 30% of the time is left, so the report always gets written.
- The numbers are upper bounds in the settings too (`maxParallel`, `maxSubquestions`, `maxSources`, `maxMinutes`); the depth is held to them.
- More rounds mean more model calls: Thorough can make over 25 helper runs for one question.

`requireFetched: true` drops any finding whose own helper did not read the page (see above). If every searcher fails the tool errors; if time runs out the report covers what finished and says so.

Before any helper starts, the tool asks the app whether web search works on the model the searchers run on (`searchReady`, no network call). It asks only when the app's own `web_search` is the searchers' only search tool (`searchToolNames`); another search tool, such as a connector's, is not checked. If it does not, for example because the search provider has no API key for that model's provider, the tool stops at once with a reason that names the model, instead of failing minutes later with "found no usable sources".

Inside a program (the app's PTC preset) a run ends early enough to finish before the app's program time limit, keeping 3 minutes for the report: with the app's default limit of 10 minutes that is about 7 minutes at any depth. The Research tab shows this number (`deepResearch.programMinutes()`).

**Wide mode** (`mode: "wide"`, with `items` and `columns`): one searcher per item returns one row; the tool returns CSV text (RFC 4180) with `Sources` (only pages a helper read, by the same rule as above) and `Notes` columns. It does not write a file: save the text with your own file tool (so the sandbox applies) and use `present`. Wide mode has no rounds; the depth only sets how many helpers work at once. A row's Notes column says "sources no helper read were left out" when a helper named pages it did not read (never fetched, or the fetch failed).

## Models

Which model the helpers run on is chosen in Settings → Research (**Model for the helpers**), kept by the Modes add-on as `researchModel` for all conversations; one conversation can choose its own with the models chip in its chat box ("One model for everything" or "Different models", kept as `sessionHelpers`).

- **This conversation's model** ("One model for everything" on the chip; the default since 0.31.2): every helper runs on the model the conversation is on when the research starts.
- **Role models** ("Different models" on the chip): helpers run on the Tier add-on's role models for the conversation's tier (Settings → Model Tiers → Role models): the planner, the reviewer and the writer on `plan`, the searchers on `fast` (configurable `roles`). A role that has no model set uses the conversation's model. This lets a strong model plan and write while a fast one searches.

Before 0.31.2 the role models were always used when they were set, which is why helpers could run on a model other than the one picked in the chat box.

The tool is registered with Tier's sub-agent gate (`registerSubagentTool`), so a tier with sub-agents disabled, or at its cap, refuses it. A research agent cannot call `deep_research` itself.

## Configuration

```yaml
- id: deep-research
  config:
    enabled: true
    toolName: deep_research
    depth: standard         # used only when the Modes add-on is not installed
    helperModel: same       # same | roles; used only when the Modes add-on is not installed
    roles: { planner: plan, searcher: fast, writer: plan }   # the analyst uses the planner's role
    maxSubquestions: 8      # upper bounds; the chosen depth is held to them
    maxParallel: 8
    maxSources: 120
    maxMinutes: 60
    searchToolNames: [web_search]   # use other names for another search backend (for example an MCP one)
    fetchToolNames: [web_fetch]
    requireFetched: false   # true: drop a finding when its own helper did not read the page, even if another helper did; false: keep it, labelled
    wide: { maxRows: 500 }
```

Nothing user-specific is preset. Choose the search backend where it already lives (`dsh-web` settings); this plugin only names the tools whose use it audits.

## Not done

- **A money cap** (`maxCloudUsd`): dsh gives no prices to a plugin; use `maxMinutes`, `maxSources` and your provider's own limits.
- **A Settings page for backends** (the fork's Research settings cards): needs a typed Remote, like the other UI items skipped so far.
- **Quality was not measured.** The method is now the one the well-known research products describe (plan, search in parallel, review, search again with better queries, write, check), but how good a report is still depends on the model, on the search service the app uses, and on how many pages can be opened. It has not been compared against any of them.
- **No own search engine or page reader.** It uses the app's `web_search` and `web_fetch`. Pages behind a login, a paywall or heavy scripts are not read.
- **A small local model is the weak point.** Helpers must write queries, read pages and return clean JSON. Models that are weak at tool use give thin results at any depth.

## Tested in 0.57.0

`test/sources.test.mjs`: a source's status from what its helper read and was shown, the more certain of two statuses (every pair, and an unknown status), when a fetch's result counts as read (no error mark, a status below 400), the three labels, the Sources lines, the Checks notes (singular and plural, one per kind) and the dropped note ("or its helper did not read the page" only with `requireFetched`). `test/rounds.test.mjs`: the writer's findings carry the label when the page was not read, with the rule to say so, which names both labels; no label and no rule when every page was read. `test/report.test.mjs`: a whole Quick run on a stand-in app (planner, a searcher that reads one page, is shown a second by a search and names a third it never met, and a writer): all three stay in the report, labelled in the writer's findings, the Sources list and the Checks; with `requireFetched: true` two are dropped and the Checks say why; the tool's description promises only what the check does. Also: two helpers cite one page, one from memory and one from its search results, in both orders, and the source is `seen only in search results, not read` while each finding reaches the writer with its own helper's label; a page one helper read stays read, in both orders, and the finding of the helper that only saw it in its search results reaches the writer labelled `seen only in search results, not read`; the same claim from both helpers is kept once, as read; with `requireFetched: true` the finding of the helper that did not read the page is dropped although the other helper read it; a fetch that ended in an error result, in an HTTP 403 page or in no result at all does not make the page read (Sources, Checks and the writer's findings), and with `requireFetched: true` its finding is dropped; the progress strip counts only pages whose fetch came back; a redirect's end page counts as read; wide mode keeps only sources whose fetch came back.

## Verified (rc.1, scripted mock model, throwaway home)

Plan, two parallel searchers that really called `web_fetch`, merge, writer, and checks: duplicate URLs merged (a URL with another host case and a fragment), a claimed-but-unfetched source marked `not fetched`, an unknown citation `[99]` flagged. `requireFetched` dropped unfetched findings. One junk searcher still gave a report; all junk gave a clear error. Wide mode produced a correct CSV (comma quoting, only fetched sources kept). With Tier: planner and writer ran on the `plan` route, searchers on `fast`; a tier with sub-agents disabled refused the tool. Note: a first run showed a runaway loop caused by my test mock, which led to the recursion guard.

## Not verified

Real web search and real model quality (every model call was scripted); the time budget actually expiring; the recursion guard against a real model calling the tool from a research agent; very large wide runs; Windows paths and proxies.

## 0.31.0: rounds, depths, and a repair

**Repair.** App 0.2.2-rc.2 changed how a helper agent is started: the task's fields (`prompt`, `parent`, `agentOptions`) moved from under `request` to the top level of `startActivation`'s argument. With the old form every start failed with "Cannot read properties of undefined (reading 'id')", so on rc.2 Deep research could not run at all. The same call is used by Agent swarm, the Tier add-on's delegate and review tools, Evolve and Code power, and was repaired in all five (both forms are now sent, so rc.1 still works).

**Verified in the lab (rc.2, scripted stand-in model) on 2026-11-12:** with the slider on Thorough and the Tier limit at 8, one call ran the plan, 8 searchers at once, a review, 8 more searchers, a second review, 8 more searchers, and the writer. Round 2 and 3 searchers were given what was already established, the queries already run (16, then 32) and the sharper queries the review wrote. The writer was shown all 48 findings. The Checks list reported "Depth: Thorough. 3 rounds", flagged an unknown citation, and marked unfetched sources.

**Not verified:** a real model and real web search at any depth; the review deciding "enough" on its own; the time limit ending a run between rounds; Quick and Standard runs end to end (their numbers are unit-tested); the Mac desktop app.

## The conversation's Lens reaches the writer (Lens part, step 27)

The owner chose that the conversation's own model and the report writer follow the conversation's Lens; the planner, the searchers and the review stay neutral, so what is found never changes. The writer's prompt gets one line after all its own rules (citations, read / not-read labels, no new facts, source text is data): "How to word the report (it changes only the wording, never the rules above or the facts): <Lens text>". The text comes from Modes (`lensWords(sessionId)`: '' for Default and during a study session); without Modes, or with Default, the prompt is exactly as before. Tested: no Lens gives today's text, the line's place, the other prompts never mention a Lens.

**Helpers that answer in prose** (16 November 2026). Small local models often ignore "Answer with ONLY JSON": the planner or a searcher writes a report instead, and the run found "no usable sources" although pages were read. Now such an answer gets one more short ask (`RESEARCH_FORMAT`, `formatPrompt`, `jsonOrAsk`): a model turns it into the expected JSON using only what the answer says and only links in it. A finding still keeps its own searcher's read/unread status.

## The packet for the Research tab (step C2, 16 November)

When a run is saved by the Research tab, its findings (claim, site, passage, date, read status; at most 400), the review's contradictions, the gaps and the source list with their grades go with the report to `research.saveReport`, which writes the packet beside it. Nothing else changed: no model is asked for it, and a run outside the Research tab is as before. Deep research opens no page itself (its helpers use the web tools, where the Modes add-on's web levels apply).

## Ultra Code (16 November, the owner's answer)

"Research and Recon keep the loops as is today, but Ultra Code expands it." With Ultra Code on for the conversation (`modes.ultraCode(id) === true`, from Model Tiers' switch; off or unknown: exactly today's run, helper for helper, which a test checks), the same loop runs wider (`lib/ultra.js`): twice the sub-questions per round (at most 12, and never past the `maxSubquestions` setting) and twice the helpers at once, still held to the settings, Model Tiers' sub-agent cap, Mission's calls at once for the searchers' provider and 8; a counter-search on up to three key claims (from pages that were read first, one per source), by searchers of the same kind, whose findings the writers see as possible contradictions; two drafts of the report side by side and a judge with no tools (`RESEARCH_JUDGE`; every tool call it makes is refused, by its id and by its task) that picks or merges them; its answer is taken only when it ended normally, kept the citations and is of a sane length, else draft 1 is the report and the Checks say so. Drafts are cut at 60,000 characters and sit between markers with a random part. The judge's refusal is scoped to its own id (cleared when it ends) or a helper of a conversation whose run has a judge at work, and holds again as a final `tools.guard`. Depth still sets the rounds and the time. The report's Checks say what Ultra Code did.


## The conversation's Web sources reach the helpers (18 November 2026)

With the one Web selector (Modes' README), a run's planner and searchers are told which kinds of source the conversation ticked and how to word searches for them (`modes.webSourcesSaid`, passed as `sources` to `planPrompt` and `searchPrompt` in `lib/rounds.js`); with All they are told nothing new. Results and pages of unticked kinds are left out and refused by Modes for every helper, as for the conversation. In a Research conversation the `focus` now comes from the ticks (Research's README). Test: `test/websources.test.mjs`.
