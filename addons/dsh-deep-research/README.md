# Deep research

Host plugin `@local/dsh-deep-research` (dsh 0.2.2-rc.1). It adds one tool, `deep_research`, that the model can call for questions that need several sources. It wraps what dsh already has (child agents, the `web_search` / `web_fetch` tools and whichever search backend `dsh-web` uses); the new code is the orchestration and the citation check.

## How a run works

1. **Plan**: a planner child splits the question into 2 to `maxSubquestions` sub-questions (JSON).
2. **Research**: one searcher child per sub-question, in parallel (at most `maxParallel`, and never above the tier's sub-agent cap), each told to fetch every page it cites and to return findings `{claim, url, quote}` as JSON.
3. **Merge**: URLs are normalized (host lower-cased, fragment removed) and de-duplicated into numbered sources, up to `maxSources`.
4. **Write**: a writer child writes the report using only the numbered findings and cites `[n]`.
5. **Check**: the host verifies every `[n]` exists, and marks each source `fetched` (the searcher really called `web_fetch` on it), `search result only`, or `not fetched`. The result ends with a `## Sources` list and a `## Checks` list (unknown citations, unfetched sources, dropped findings, partial run, failures).

`requireFetched: true` drops any finding whose page the searcher did not fetch. If every searcher fails the tool errors; if time runs out the report covers what finished and says so.

**Wide mode** (`mode: "wide"`, with `items` and `columns`): one searcher per item returns one row; the tool returns CSV text (RFC 4180) with `Sources` (only pages that were fetched) and `Notes` columns. It does not write a file: save the text with your own file tool (so the sandbox applies) and use `present`.

## Models

With the Tier plugin, children use the role routes of the parent's tier: planner and writer `plan`, searchers `fast` (configurable `roles`). Without Tier, or when a role has no route, children use the parent's own route. The tool is registered with Tier's sub-agent gate (`registerSubagentTool`), so a tier with sub-agents disabled, or at its cap, refuses it. A research agent cannot call `deep_research` itself.

## Configuration

```yaml
- id: deep-research
  config:
    enabled: true
    toolName: deep_research
    roles: { planner: plan, searcher: fast, writer: plan }
    maxSubquestions: 6
    maxParallel: 4
    maxSources: 40
    maxMinutes: 20          # overall budget; the call may ask for less
    searchToolNames: [web_search]   # use other names for another search backend (for example an MCP one)
    fetchToolNames: [web_fetch]
    requireFetched: false
    wide: { maxRows: 500 }
```

Nothing user-specific is preset. Choose the search backend where it already lives (`dsh-web` settings); this plugin only names the tools whose use it audits.

## Not done

- **A money cap** (`maxCloudUsd`): dsh gives no prices to a plugin; use `maxMinutes`, `maxSources` and your provider's own limits.
- **A Settings page for backends** (the fork's Research settings cards): needs a typed Remote, like the other UI items skipped so far.
- **Quality**: the prompts are short and generic; research quality was not measured.

## Verified (rc.1, scripted mock model, throwaway home)

Plan, two parallel searchers that really called `web_fetch`, merge, writer, and checks: duplicate URLs merged (a URL with another host case and a fragment), a claimed-but-unfetched source marked `not fetched`, an unknown citation `[99]` flagged. `requireFetched` dropped unfetched findings. One junk searcher still gave a report; all junk gave a clear error. Wide mode produced a correct CSV (comma quoting, only fetched sources kept). With Tier: planner and writer ran on the `plan` route, searchers on `fast`; a tier with sub-agents disabled refused the tool. Note: a first run showed a runaway loop caused by my test mock, which led to the recursion guard.

## Not verified

Real web search and real model quality (every model call was scripted); the time budget actually expiring; the recursion guard against a real model calling the tool from a research agent; very large wide runs; Windows paths and proxies.
