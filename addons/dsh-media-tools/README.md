# Media tools

Host plugin `@local/dsh-media-tools` (dsh 0.2.2-rc.1). It does two things and **nothing else**; both are off until you configure them:

1. **Image tools** `generate_image` and `edit_image` for an OpenAI-compatible images API. The result is saved as a file in the session's working folder and the model is told to hand it over with dsh's `present` tool, so it appears as a **deliverable**.
2. An **approval gate**: dsh asks you before the first (or every) call of the browser-use or computer-use tools you name.

Browser agent, computer use and voice are **dsh features**, not code in this plugin: the guide below says how to switch them on and what to watch for.

## Configuration

```yaml
- id: media-tools
  config:
    images:
      baseUrl: <IMAGES API BASE URL, ending in /v1>
      model: <IMAGE MODEL ID>
      apiKeyEnv: <NAME OF THE ENVIRONMENT VARIABLE THAT HOLDS THE KEY>   # a NAME, never the key; leave out for a keyless server
      label: <NAME SHOWN IN ERROR MESSAGES>                              # optional
      approval: first            # first | every | never : ask before an image call (default first)
      maxCallsPerSession: 20     # at most 200
      maxImages: 4               # images per generate call, at most 4
      outputDir: generated-images   # relative folder inside the working folder
      allowUrlResults: true      # accept an image URL from the API (public addresses only, see below)
      timeoutMs: 180000
      generateToolName: generate_image
      editToolName: edit_image
    gate:
      patterns: ['<REGEX OF A TOOL NAME>']   # the tools to ask about
      mode: first                             # first | every
      reason: '<TEXT SHOWN IN THE QUESTION>'  # optional
```

A bad config fails at load: `baseUrl` and `model` go together; `apiKeyEnv` must look like a variable **name** (a pasted key is refused); a key is not sent over plain `http` except to localhost; `outputDir` must be relative; a bad gate pattern is refused.

## Image tools

| Tool | Input | What it does |
| --- | --- | --- |
| `generate_image` | `prompt` (up to 4000 chars), optional `size` (`auto` or `WIDTHxHEIGHT`), optional `n` (1 to `maxImages`) | Calls `POST <baseUrl>/images/generations`. |
| `edit_image` | `prompt`, `image_path`, optional `size` | Calls `POST <baseUrl>/images/edits` (multipart) with one PNG, JPEG or WebP from the working folder. |

Files are written as `<outputDir>/image-<time>-<tag>-<n>.<ext>` (mode 0644, never over an existing file). The tool result lists the relative paths and tells the model to call `present` with them.

Safety, copied from the fork's image tool:
- The URL and key come from this config only, never from the model. The key is read from the named variable at call time and sent only to `baseUrl`. Redirects from the API are **not followed**.
- Error messages are fixed text; an upstream body or URL is never shown to the model.
- A result that is a URL is downloaded only if it resolves to **public addresses** (checked, then the connection is pinned to the checked address; every redirect hop is checked again; no credentials in the URL; image content types only; 25 MB cap). Set `allowUrlResults: false` to refuse URL results altogether.
- An edit input must be a regular image file **inside the working folder**: links, paths that leave the folder, GIFs and non-images are refused. The output folder is refused if it resolves outside the working folder.
- A per-session call cap (`maxCallsPerSession`); only real API calls count, not calls refused for bad input.
- Images arrive as bytes; the content is checked by magic bytes, not by file name.

## Approval gate

`approval` for the image tools and `gate.patterns` for anything else use dsh's `tools/pre-execute` **ask**: dsh shows the question and runs the call only if you allow it. `first` asks until one call has actually run in that session, `every` asks every time. If another plugin (for example Tier's `browser: false`) already denies the call, that denial stays. With `--approval-policy never` (headless), an `ask` is a denial.

The gate does not choose tool names for you, because they depend on the provider you pick. Playwright MCP tools are named `mcp__playwright-mcp__<tool>` (dsh docs); look at the real list in your session, then for example:

```yaml
gate:
  patterns: ['^mcp__playwright-mcp__browser_(click|type|press_key|select_option|drag|file_upload|fill_form)$']
```

## Guide: browser agent, computer use, voice (dsh features)

None of these is enabled or chosen by this plugin. All are **experimental** in dsh.

**Browser agent.** Mount `@deepseek-ai/dsh-browser-use` and **exactly one** provider (a second is rejected):

| Provider | Notes |
| --- | --- |
| Playwright MCP (`dsh-experimental-browser-use-playwright-mcp`) | `mode: launch` (own Chromium, `headless: true` default) or `attach` to a debugging endpoint. Tools `mcp__playwright-mcp__<tool>`. |
| Chrome DevTools MCP (`...-chrome-devtools-mcp`) | Same options; DevTools-style inspection. |
| Stagehand (`...-stagehand-native`) | Needs its **own cloud model** (`model.modelName` plus a key); DeepSeek endpoints and `baseURL` overrides are unsupported, and its model calls are not in dsh's usage accounting. |

A launched browser belongs to one session and is closed with it; login state is not restored. Screenshots need an attachment store and an image-capable model route. Leave browser tools under `<unlisted-tools>` if you set `toolOrder`. **Tier interplay:** Tier's `browser: false` denies tool names matching `browser|ego`, which includes `browser_*` tools; set the tier's browser switch on for tiers that should browse.

**Computer use (macOS).** In the app: **Plugins, More, Computer use** (experimental). It ships with dsh, downloads nothing, and needs Accessibility and Screen Recording permission. It is installed only in **PTC** sessions, and **asks separately before accessing each application** (decisions saved per profile), so it brings its own approval; this plugin's gate is mainly for browsers. The other provider is Cua Driver over MCP (`command: cua-driver`), only if you already run that.

**Voice input.** dsh ships an experimental **Voice Input** bundle (the spec said none existed): in `dsh web`, open Plugins, enable **Voice Input**, let it download and prepare its local speech model (SenseVoice on the CPU), then use the microphone button next to Send; Stop inserts the transcript. It runs on the Host, off by default, and recordings never go into model requests. It works in the web app; whether the desktop app shows it is untested here. **Read-aloud**: dsh has none; use macOS **System Settings, Accessibility, Spoken Content, Speak selection**. **Dictation**: macOS dictation (Fn twice by default) works in any composer.

## Checked

15 unit tests: image sniffing, public-address rules, config refusals, request shape, file saving, key handling (never echoed, sent only to the configured URL, no key no request), fixed-text errors, API redirects not followed, URL results (private address refused and never contacted; type, size, redirect-loop and scheme checks), multipart edit, edit-input refusals (link, outside folder, GIF, non-image, directory), per-session cap, output-folder link refused, gate ask-then-allow per session, `every`, deny passthrough, image approval levels. In a real dsh headless profile on mocks: `generate_image` called by the model saved a PNG in the working folder; with approval `first` and `--approval-policy never` the call was denied before any request; `present` accepted the returned relative path (with the Present plugin mounted). Not tested: a real images API (OpenAI, a local server), the approval prompt in the web/desktop app (only the headless denial), `edit_image` through dsh (unit-tested), Voice Input, browser and computer-use providers.
