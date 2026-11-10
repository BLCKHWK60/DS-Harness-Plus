# Modes

Host and client plugin `@local/dsh-modes` (dsh 0.2.2-rc.1): Chat, Cowork and Code modes you can switch **per session, at any time**. A dsh agent preset is fixed when a session is created, so a mode is applied to the live Agent instead: it never needs a new session.

A mode sets:

| Field | Values | Effect |
|---|---|---|
| `label` | text | name in the selector |
| `tools` | `"all"`, `"none"`, or a list of tool names | the tools the model sees (a restriction on that Agent; unknown names are ignored) |
| `sandbox` | `inherit`, `read-only`, `workspace-write` | the session's file sandbox mode. `inherit` restores what the session had before a mode changed it. `danger-full-access` cannot be set by a mode |
| `defaultTier` | a Tier id or empty | on a switch to this mode, the session moves to that tier (needs the Tier plugin) |
| `prompt` | text | a prompt section `modes:mode` (order 58) while the mode is active |

Built in (until you supply your own `modes`): **chat** (no tools, read-only, a short "no tools" prompt), **cowork** (all tools, sandbox unchanged), **code** (all tools, `workspace-write`).

## Configuration

```yaml
- id: modes
  config:
    modes: '{"<id>": {"label": "...", "tools": "all", "sandbox": "inherit", "defaultTier": "", "prompt": ""}}'   # JSON; replaces the built-in three
    defaultMode: cowork       # mode of a session that has not chosen one
    pruneStaleSessions: true  # drop choices of Sessions that no longer exist
    pinOnFirstTurn: true      # record the mode a Session starts in, so a later defaultMode change (e.g. a Cowork sidebar tab) only affects new Sessions
    sessionWeb: '{}'          # per-Session Search switch (the chat-box button writes it)
    sessionResearch: '{}'     # per-Session Deep research switch (the chat-box button writes it)
    # With the Cowork sidebar on: a Session that has not sent a message follows defaultMode (the tab), its first
    # message fixes that mode (replacing any earlier choice), and the chat-box selector is hidden.
    commandName: mode
```

`sessionModes` (`{sessionId: modeId}`) is written by the selector and the command; do not edit it by hand.

## Using it

- **Composer selector**: a drop-down left of Tier's control; it re-reads every 3 seconds so a `/mode` switch shows up.
- **Command**: `/mode` lists modes, `/mode <id>` switches.
- **Service `modes`**: `list()`, `get(sessionId)`, `set(sessionId, modeId)`.
- A switch made during a running turn waits until the Agent is idle, so tools and sandbox never change mid-turn.

## Settings page

Settings > **Modes** edits the mode list without touching YAML: one card per mode (id, label, tools All / None / Only these with a list of tool names, file sandbox, default tier, prompt with a 4,000-character counter), the default mode, add / remove, and "Restore built-in modes". It reads and writes the plugin's own `modes` and `defaultMode` fields through the settings channel (the same one Tier and the composer selector use), in one save, and retries once on a revision conflict. It refuses ids that are not lower-case letters, digits and dashes, duplicate ids, an empty tool list under "Only these", and a default that is not one of the modes. Fields the editor does not know about are kept on save. The default-tier box suggests tier ids when the Tier plugin is loaded. Needs a restart of the app once to load (client half).

Tested in a throwaway web profile: add a mode, validation messages, save (written to the profile patch as the same JSON string), the composer selector picked the new mode within 3 seconds, dark and light. Not tested in the desktop app.

## Limits

- The default tier applies when you switch modes, not when a session is first created (a new session keeps whatever tier it has).
- Sub-agents (children) start in `defaultMode`, not in the parent's mode. A chat session cannot spawn them anyway (no tools).
- After a restart, leaving a mode that set the sandbox (for example Chat) does not restore the earlier sandbox mode, because that earlier value is kept in memory only; set the access mode in the composer if needed.
- Changing tools invalidates the model's prompt cache from the first changed tool schema.
- The mode list is edited on the Settings page below; the composer selector itself stays a plain `<select>`.
- Renaming a mode id in the editor leaves sessions that had the old id on the default mode (their stored choice no longer matches).


## Search and Deep research buttons

Two buttons in the chat box switch tools for **this conversation only**. They apply at the next turn.

- **Search** turns the web tools (`web_search`, `web_fetch`) on or off.
  - Default: on in modes with all tools (Cowork, Code), off in a no-tools mode (Chat).
  - In Chat mode with Search on, the model gets only the web tools, and a note that it may use them.
- **Deep research** makes `deep_research` (and the web tools) available, and tells the model to use it for questions that need looking things up.

Tool names are passed to the app's restriction as they are. In this dsh version most tools come from the conversation's agent preset and are not listed to plugins, so a name is not checked against a visible list. A name the app refuses is left out, with a warning in the log.

Checked in the throwaway web profile by reading the exact request the model received:

| Case | Tools the model got |
| --- | --- |
| Chat with Search off | no tools |
| Chat with Search on | `web_fetch` only (that lab has no `web_search` backend), plus the note |
| Chat with Deep research on | `deep_research` and `web_fetch`, plus the research note |
| Cowork with Search off | all 32 other tools, `web_fetch` removed |

Earlier versions filtered a mode's tool list against the tools visible to plugins. That silently dropped preset tools, for example `read` and `grep` in a custom "Review" mode. Now fixed.
