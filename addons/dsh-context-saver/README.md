# Context Saver

Host plugin `@local/dsh-context-saver` (dsh 0.2.2-rc.1). It shortens large **text** tool results before the model sees them and keeps the original in a local store; the shortened text ends with a marker `[Context Saver: N→M tokens. Full text: context_retrieve("key")]`. The model can fetch the original, or a slice (`start_line`/`end_line`, `grep`), with the `context_retrieve` tool of the `context` MCP server (`plugins/dsh-intel-mcp`).

**Off until enabled**: installing changes nothing.

## How it works

- Hook: `tools/post-execute`. For a successful call whose result has text blocks of at least `minChars`, a long-lived Python helper (`python -m dsh_intel_mcp.context_saver`, your tested transforms) detects JSON, logs, search output, diffs, HTML or code, shortens it deterministically and stores the original (72 h, 1 GB cap). Errors, first/last items and outliers are kept.
- **Model-visible equals logged**: the shortened text replaces the result content, so it is what the session log records and what every later request contains. The original lives only in the store.
- Same input gives byte-identical output (memoised), so provider prompt caches stay valid.
- **Fail open**: if the helper cannot start, crashes or times out, the result is left unchanged and one warning is logged; after 3 failed starts in a minute the helper pauses for 5 minutes.
- A system-prompt section (`context-saver`, order 75) tells the model what a marker means (`promptSection: false` removes it).
- Surface follows the Modes plugin (`chat`, `cowork`, `code`); without it, `cowork`.

## Configuration

```yaml
- id: context-saver
  config:
    enabled: true
    python: <PYTHON>          # interpreter with dsh-intel-mcp installed; required when enabled
    dataDir: <DATA_DIR>       # absolute; must equal DSH_INTEL_HOME of the `context` MCP server; required when enabled
    minChars: 4000
    minGainPercent: 15        # keep the result only if it is at least this much smaller
    perTier: {}               # {tierId: true}; when non-empty only those tiers are compressed (needs Tier)
    skipTools: [read, read_image, write, edit, apply_patch, str_replace_editor, present, ask_user_question]
    retrieveToolName: mcp__context__context_retrieve   # named in the prompt; never compressed itself
    helperTimeoutMs: 10000
    promptSection: true
    commandName: saved
```

No path or address is defaulted. `skipTools` keeps file reads and edits verbatim; the default list is dsh's own tool names, replace it if you want otherwise. Attach the retrieval server with the `context` row from `plugins/dsh-intel-mcp/examples/mcp-rows.example.yml`.

## Use

- `/saved`: tokens saved today and over 30 days, and how many originals are stored.
- Service `contextSaver`: `savings(days)`, `storeStats()`.

## Not done

- **Chat-history compression** (spec: for the no-tool Chat preset). It would change older history in each request, which breaks "model-visible equals logged"; dsh's own compaction owns that.
- Structured (`value`) tool results and non-text blocks are never touched.
- Coexistence with `compaction-tool-result-pruner` is not tested.

## Verified (rc.1, mock model, throwaway home)

- A `bash` call printing a 1,000-item JSON array (43,389 characters, one error item): off, the model saw 43,389; on, 504 characters (98.8% smaller) with the marker and the `BOOM` error item kept; the second run gave identical output; the savings ledger and store were written.
- The retrieval server returned the exact original for the key.
- A dsh-side truncation matters: `bash` output over about 50,000 characters is cut by dsh itself before this plugin sees it, so a cut JSON is no longer valid JSON and compresses less (68% in the 2,000-item case).
- Bad interpreter path: result unchanged, call succeeded. Missing `python`/`dataDir`: a load error is logged and the plugin stays inactive.
- 34 ported Python tests (store, transforms, corpus) pass.

## Not verified

The log-with-3-errors and grep/diff acceptance cases through dsh (covered by the Python corpus tests only), many concurrent calls, and long-running helper behaviour over days.
