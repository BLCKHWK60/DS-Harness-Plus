# MCP starter pack

`mcp-starter.example.yml` has eight MCP server rows for dsh's MCP client, taken from the fork's starter pack (`mcp_directory.py`). Nothing is preconfigured: **every row is disabled**, every path is a `<PLACEHOLDER>`, and nothing applies the file. The fork used `npx -y <package>` and `@latest` for two of them; here every version is **pinned** (decision D4).

| Row id | Server | Runs with | Pin | Notes |
|---|---|---|---|---|
| `mcp-filesystem` | `@modelcontextprotocol/server-filesystem` | npx, **Node >= 24** | 2.2.0 | read/write inside the one folder you give it |
| `mcp-git` | `mcp-server-git` | uvx (Python >= 3.10) | 2026.11.4 | local repos |
| `mcp-fetch` | `mcp-server-fetch` | uvx | 2026.11.4 | fetches any URL, including addresses on your own network |
| `mcp-playwright` | `@playwright/mcp` | npx (Node >= 18) | 0.0.85 | drives a real browser; may download browser binaries on first use |
| `mcp-chrome-devtools` | `chrome-devtools-mcp` | npx (Node 20.19+/22.12+) | 1.12.0 | controls Chrome pages |
| `mcp-context7` | `@upstash/context7-mcp` | npx (Node >= 20.18) | 4.6.0 | sends the library names you ask about to Upstash; an API key is optional and read from the environment |
| `memory-mcp-reference` | `@modelcontextprotocol/server-memory` | npx | 2026.7.4 | same row id as option 1 in `config/memory/` (the version dsh's own example is tested with); keep one copy |
| `mcp-sequential-thinking` | `@modelcontextprotocol/server-sequential-thinking` | npx, **Node >= 24** | 2.1.1 | scratch tool for step-by-step thinking |

Versions are the ones current on 2026-11-09 (npm and PyPI metadata read, no package downloaded). **None was source-reviewed or run here.** On this Mac `node` is 22.22, which does not meet the Node >= 24 requirement of three of the servers.

## Use

1. Copy the rows you want into your profile's `cordis.patch.yml` (an `- insert:` list), fill the placeholders, remove `disabled: true` from the ones you enable.
2. `templates/mcp-starter/check.sh <your-patch.yml>` composes the headless profile in a throwaway home and, for each enabled row, fails on an unfilled placeholder, an unpinned version, or a command that is not on your PATH.
3. After the harness starts, the tools appear as `mcp__<serverName>__<tool>` (for example `mcp__fetch__fetch`).

## Safety

MCP servers run as your user, **outside dsh's file sandbox**, and a server that can reach the network or a browser can read what you point it at. Enable the few you need, check what each one can do, and never put a key in the file: name an environment variable.

## Verified

The template composes on dsh 0.2.2-rc.1; `check.sh` reports disabled, enabled-ok and enabled-with-problems correctly. dsh's MCP client itself was already verified with the Intel MCP servers (stdio, tool discovery, calls).

## Not verified

Starting any of the eight servers: installing them means downloading and running third-party code, which was not part of what you approved (review-only for memory). So the spec's acceptance (enabling `fetch` makes `mcp__fetch__fetch` callable) is untested; do it after you accept a server.

## Not done

The fork's search of the official MCP registry. The spec suggests the community plugin `duhu2000/dsh-mcp-connector` as the UI for that; it has not been reviewed or installed.
