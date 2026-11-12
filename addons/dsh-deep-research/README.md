# Deep research

Host plugin `@local/dsh-deep-research` (dsh 0.2.2-rc.2). It adds one tool, `deep_research`, that the model can call for questions that need several sources. It wraps what dsh already has (child agents, the `web_search` / `web_fetch` tools and whichever search backend `dsh-web` uses); the new code is the orchestration and the citation check.

## How a run works

1. **Plan**: a planner helper splits the question into sub-questions that cover different angles (the facts, the numbers, recent developments, primary sources, the strongest criticism), each with two or three search queries.
2. **Research**: one searcher helper per sub-question, several at once. Each is told to run several searches, open every page it cites, prefer primary and recent sources, and return findings `{claim, url, quote, date}`, the queries it ran, and what it could not find.
3. **Review** (between rounds): an analyst helper reads everything found so far and names what is still unanswered, where sources contradict each other, and which claims need the original document. It then writes follow-up sub-questions with **sharper queries**, built from the names, terms and dates the findings revealed. If the question is already answered well, it says so and the run goes straight to the report.
4. **Next round**: new searchers take the follow-ups. Each is told what is already established and which queries were already run, so it digs deeper and does not repeat.
5. **Merge**: URLs are normalized (host lower-cased, fragment removed) and de-duplicated into numbered sources; the same claim from the same page is kept once.
6. **Write**: a writer helper writes the report from the numbered findings only: the answer first, then the detail, contradictions set out side by side, and what could not be established.
7. **Check**: the host verifies every `[n]` exists, and marks each source `fetched` (the searcher really called `web_fetch` on it), `search result only`, or `not fetched`. The result ends with a `## Sources` list and a `## Checks` list that starts with the depth, the rounds run, the helpers used at once and the number of sources.

## Depth: Quick, Standard, Thorough

Chosen with the slider behind the small arrow beside the **Deep research** button in the chat box. It is one setting for all conversations (kept by the Modes add-on as `researchDepth`).

| Depth | Rounds | Helpers at once | Sub-questions | Follow-ups per later round | Findings per helper | Time limit | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Quick | 1 | up to 4 | up to 4 | none | 6 | 10 min | 30 |
| Standard | 2 | up to 6 | up to 6 | up to 6 | 8 | 25 min | 60 |
| Thorough | 3 | up to 8 | up to 8 | up to 8 | 10 | 45 min | 120 |

- **Helpers at once are also held to the Tier add-on's sub-agent limit** (Settings → Model Tiers, 4 unless changed). To really get 8, raise that limit to 8.
- A new round starts only while at least 30% of the time is left, so the report always gets written.
- The numbers are upper bounds in the settings too (`maxParallel`, `maxSubquestions`, `maxSources`, `maxMinutes`); the depth is held to them.
- More rounds mean more model calls: Thorough can make over 25 helper runs for one question.

`requireFetched: true` drops any finding whose page the searcher did not fetch. If every searcher fails the tool errors; if time runs out the report covers what finished and says so.

**Wide mode** (`mode: "wide"`, with `items` and `columns`): one searcher per item returns one row; the tool returns CSV text (RFC 4180) with `Sources` (only pages that were fetched) and `Notes` columns. It does not write a file: save the text with your own file tool (so the sandbox applies) and use `present`. Wide mode has no rounds; the depth only sets how many helpers work at once.

## Models

Which model the helpers run on is chosen in the same panel as the depth (the small arrow beside the **Deep research** button), under **Model for the helpers**. It is one setting for all conversations (kept by the Modes add-on as `researchModel`).

- **Same as this conversation** (the default since 0.31.2): every helper runs on the model the conversation is on when the research starts.
- **Role models**: helpers run on the Tier add-on's role models for the conversation's tier (Settings → Model Tiers → Role models): the planner, the reviewer and the writer on `plan`, the searchers on `fast` (configurable `roles`). A role that has no model set uses the conversation's model. This lets a strong model plan and write while a fast one searches.

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
    requireFetched: false
    wide: { maxRows: 500 }
```

Nothing user-specific is preset. Choose the search backend where it already lives (`dsh-web` settings); this plugin only names the tools whose use it audits.

## Not done

- **A money cap** (`maxCloudUsd`): dsh gives no prices to a plugin; use `maxMinutes`, `maxSources` and your provider's own limits.
- **A Settings page for backends** (the fork's Research settings cards): needs a typed Remote, like the other UI items skipped so far.
- **Quality was not measured.** The method is now the one the well-known research products describe (plan, search in parallel, review, search again with better queries, write, check), but how good a report is still depends on the model, on the search service the app uses, and on how many pages can be opened. It has not been compared against any of them.
- **No own search engine or page reader.** It uses the app's `web_search` and `web_fetch`. Pages behind a login, a paywall or heavy scripts are not read.
- **A small local model is the weak point.** Helpers must write queries, read pages and return clean JSON. Models that are weak at tool use give thin results at any depth.

## Verified (rc.1, scripted mock model, throwaway home)

Plan, two parallel searchers that really called `web_fetch`, merge, writer, and checks: duplicate URLs merged (a URL with another host case and a fragment), a claimed-but-unfetched source marked `not fetched`, an unknown citation `[99]` flagged. `requireFetched` dropped unfetched findings. One junk searcher still gave a report; all junk gave a clear error. Wide mode produced a correct CSV (comma quoting, only fetched sources kept). With Tier: planner and writer ran on the `plan` route, searchers on `fast`; a tier with sub-agents disabled refused the tool. Note: a first run showed a runaway loop caused by my test mock, which led to the recursion guard.

## Not verified

Real web search and real model quality (every model call was scripted); the time budget actually expiring; the recursion guard against a real model calling the tool from a research agent; very large wide runs; Windows paths and proxies.

## 0.31.0: rounds, depths, and a repair

**Repair.** App 0.2.2-rc.2 changed how a helper agent is started: the task's fields (`prompt`, `parent`, `agentOptions`) moved from under `request` to the top level of `startActivation`'s argument. With the old form every start failed with "Cannot read properties of undefined (reading 'id')", so on rc.2 Deep research could not run at all. The same call is used by Agent swarm, the Tier add-on's delegate and review tools, Evolve and Code power, and was repaired in all five (both forms are now sent, so rc.1 still works).

**Verified in the lab (rc.2, scripted stand-in model) on 2026-11-12:** with the slider on Thorough and the Tier limit at 8, one call ran the plan, 8 searchers at once, a review, 8 more searchers, a second review, 8 more searchers, and the writer. Round 2 and 3 searchers were given what was already established, the queries already run (16, then 32) and the sharper queries the review wrote. The writer was shown all 48 findings. The Checks list reported "Depth: Thorough. 3 rounds", flagged an unknown citation, and marked unfetched sources.

**Not verified:** a real model and real web search at any depth; the review deciding "enough" on its own; the time limit ending a run between rounds; Quick and Standard runs end to end (their numbers are unit-tested); the Mac desktop app.
