# dsh-intel-mcp

Python package `dsh-intel-mcp`: three stdio MCP servers originally written for MindsHub Cowork and kept as an external Python package. dsh attaches them through its MCP client; no dsh plugin code is needed.

| Server | Start with | Tools |
|---|---|---|
| Code Map | `python -m dsh_intel_mcp.codemap --root <repo>` | `code_overview`, `code_map`, `code_outline`, `code_symbol`, `code_refs`, `code_search`, `code_pack` |
| Reverse Engineer | `python -m dsh_intel_mcp.reverse --target-kind workspace\|path --target <t> --root <cwd> [--max-target-mb N]` | `re_survey`, `re_inspect`, `re_evidence`, `re_files`, `re_read`, `re_strings`, `re_disassemble`, `re_xrefs`, `re_fetch` (website targets only, not available in this build) |
| Context retrieval | `python -m dsh_intel_mcp.context` | `context_retrieve` (reads the store written by the Context Saver plugin) |
| Context Saver helper | `python -m dsh_intel_mcp.context_saver` | not an MCP server: a newline-delimited JSON helper (`compress`, `savings`, `reset_savings`, `store_stats`, `ping`) started by `plugins/dsh-context-saver` |

dsh names the tools `mcp__codemap__code_overview` and so on. `examples/mcp-rows.example.yml` has the three rows with placeholders; nothing is configured by default.

## Data directory

There is no default: set `DSH_INTEL_HOME` to an absolute directory (in the MCP row's `env`). The servers keep their SQLite caches and stores there (`code-map/`, `reverse/`, `context-saver/`). A missing or relative value fails at startup.

## Install

Python 3.12 or 3.13. `pip install` of this directory pulls tree-sitter with 14 per-language grammar wheels (not `tree-sitter-language-pack`, which downloads grammars at runtime), `lief`, `capstone` and `dnfile`. No Node, no network use at run time, no API keys.

## What changed from the fork

- Imports and names only: `cowork.coding.*` became `dsh_intel_mcp.*`; `cowork_home()` became `data_home()` (from `DSH_INTEL_HOME`); the redaction and untrusted-data helpers were copied in; the MindsHub data-cleaner hooks were removed.
- **Not ported:** the website analyzer and URL targets (they use the fork's SSRF-pinned HTTP client, `cowork.research.http`, which depends on MindsHub's egress policy). `re_fetch` reports it is unavailable and `--allow-websites` defaults to 0. Porting it needs a decision on how to do safe fetching.
- The fork's Reverse Engineer task type (`coding_reverse_task` tests) is MindsHub-specific and was not ported.

## Tests

160 tests ported from the fork (Code Map, Reverse Engineer analyzers/evidence/targets/extract/MCP, context retrieval, and the Context Saver store, transforms and corpus; a small helper writes the context store for the retrieval test). Run from this directory with an interpreter that has the dependencies:

```sh
PYTHONPATH=src:. python -m pytest tests -q
```

## Verified through dsh (rc.1, mock model, throwaway home)

All 17 tools are offered through dsh's MCP client; a real call to each of `code_overview`, `context_retrieve` (with `grep`), `re_survey` and `re_inspect` (app_bundle) returned the tool's result, including the size limit on a 1.3 GB target and the evidence id.

## Not verified

Cold/warm timing on a 1,500-file repo (spec acceptance); a read-only "reverse-engineer" session denying writes (use a Modes entry with `sandbox: read-only`); Windows or Intel Macs; installing the package into a fresh virtualenv (tests ran with the fork's interpreter and `PYTHONPATH`).
