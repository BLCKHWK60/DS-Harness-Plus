# Memory options

dsh has no first-party long-term memory. **All five options are built as generic templates and every one is disabled; enable at most one**. `memory-options.example.yml` has the rows (placeholders for every path; no secret, address or location is preset), and `check.sh <patch.yml>` composes your profile in a throwaway home and fails if more than one memory option is enabled.

| # | Option | Kind | Pin | Source reviewed here | Notes |
|---|---|---|---|---|---|
| 1 | MCP reference memory | MCP server (Node) | `@modelcontextprotocol/server-memory@2026.7.4` | **Yes**, full (3 files) | Knowledge graph in one JSONL file, substring search, no embeddings. Smallest surface. |
| 2 | Memorix | MCP server (Node >= 22.18) | `memorix@1.3.0` | No (69 MB unpacked, 22 deps) | dsh's own tested reference config; Apache-2.0. |
| 3 | Engram (Go) | MCP server | `v1.20.0` | No (39 MB repo) | dsh's own tested reference config; MIT. |
| 4 | dsh-mnemon | dsh plugin | `dsh-mnemon@0.5.42` | Yes, pattern audit | Large application, see findings. |
| 5 | @kenz1117/dsh-engram | dsh plugin | `@kenz1117/dsh-engram@0.13.9` | Yes, pattern audit | Local SQLite, see findings. |

Options 1-3 are the third-party memory servers that dsh ships default-off example rows for (`docs/user/guide/mcp-memory.md`); dsh does not install them for you, so you install the pinned executable yourself.

## Review findings (downloaded for review only, nothing installed or run; npm integrity hashes verified)


**1. `@modelcontextprotocol/server-memory@2026.7.4`**: no network, no process spawning, no eval; its only environment read is `MEMORY_FILE_PATH`, and its only file write is that file. One dependency (the official MCP SDK). `license` says "SEE LICENSE IN LICENSE" but the tarball contains no LICENSE file. The `prepare` script only matters for git installs.

**4. `dsh-mnemon@0.5.42`** (MIT): the compatibility caveat in the spec is resolved: dsh 0.2.2-rc.1 accepts its `engines.dsh` range (tested with a throwaway package carrying that range). It is a large product, not a small memory store:
- 20 npm sub-dependencies (nine memory providers such as mem0, honcho, supermemory, retaindb, openviking; sources; strategies), all fetched on install and not reviewed here.
- It contacts `registry.npmjs.org` (version checks and plugin discovery, honouring `npm_config_registry`) and `api.github.com` (GitHub sign-in and repository listing for sync), and can run child processes without a shell.
- Its bundle patch turns on `routingGuidance`, `lifecycleEnabled`, `recallMode: guided` and `writebackMode: guided` by default, so it adds prompt guidance and writes memory automatically unless overridden.
- No `eval`; no unexplained hosts beyond the above.

**5. `@kenz1117/dsh-engram@0.13.9`** (MIT): zero npm dependencies, local SQLite (user store plus one store per git origin), default location `~/.dsh/engram`.
- **Its bundle patch ships `ingest: 'light'`** (automatic capture of your messages) although its README says capture is off by default. The template's override sets `ingest: 'off'`; override it before first use.
- The default local embedder downloads a ~50 MB model once from huggingface.co (a mirror host is configurable); a remote embedder is used only if you configure one.
- An optional adjudication feature is off by default and uses a configured dsh provider and its credentials; it posts to that provider's endpoint.
- `child_process` is used once, to read the macOS locale (`defaults read -g AppleLocale`). It opens a loopback-only `/api/engram` panel route. The `prepare` install script only symlinks peers if a sibling `deepseek-harness` folder exists, and builds only if `lib/` is missing (the tarball has it).
- Odd renamed identifiers appear in comments (a "Jev"/"Noul" provider protocol). I found no unexplained outbound host, but the adjudication code path deserves a closer read before enabling it.

Not reviewed: options 2 and 3 (too large to review here; run only after you accept dsh's own pinning), and the npm sub-packages of dsh-mnemon.

## Verified

Templates compose on dsh 0.2.2-rc.1 in a throwaway home; `check.sh` reports none / one enabled correctly and fails on two. dsh accepts mnemon's `engines.dsh` range.

## Not verified

No option was installed or run (review-only permission), so remember/recall across sessions is untested: follow the three-step check in dsh's `mcp-memory.md` after you install one. The fork's `ANTON_MEMORY_MODE=autopilot` has no exact equivalent; the closest are Engram's `ingest: light|eager` (automatic capture) and mnemon's `recallMode` / `writebackMode`.
