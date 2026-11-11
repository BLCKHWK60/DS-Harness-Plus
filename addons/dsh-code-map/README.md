# Code map

Add-on `@local/dsh-code-map` (dsh 0.2.2-rc.1). Two things:

1. **A code map.** A compact map of the project a conversation works in: its files, the functions, classes and types in them with line numbers, and what uses what. The assistant looks things up in the map and reads one function at a time, instead of reading whole files. On a large project that uses far fewer tokens.
2. **Four "reverse engineer" skills.** Step-by-step guides the assistant follows to take something apart and write it up: a code base, a website, an API or file format, an installed app.

Nothing is installed: it runs on the app's own engine, with no downloads and no network use. Nothing is written into your project: each map is one file in the app's data folder (`<dsh home>/code-map/<id>/index.json`). It works with nothing configured.

## What the assistant gets

Five tools, in conversations that have tools (Cowork and Code):

| Tool | What it answers |
| --- | --- |
| `code_map_overview` | The whole project on one screen: size, languages, folders, likely starting points, the most connected files. Takes a sub-folder and a size budget |
| `code_map_file` | One file's outline: its symbols with line numbers, what it uses, what uses it. No file body |
| `code_map_find` | Functions, classes, types and files by name, best match first |
| `code_map_related` | For a file: what it uses and what uses it, up to three steps. For a symbol: where it is defined and where its name is used |
| `code_map_read` | Just one symbol's lines, or the lines around a line number. A long file is never returned whole by accident |

Every answer is plain text, in a fixed order, and ends by saying how to go deeper.

In a folder that looks like a code project (or already has a map), three lines are added to the assistant's instructions telling it to use the map first. The switch for that is on the Settings page.

## How it works

- **Scanning.** The folder is walked once. Left out: `.git`, dependency and build folders (`node_modules`, `dist`, `build`, `target`, `vendor`, virtual environments and the like), binaries, lock files, minified files, files over the size limit, and everything your `.gitignore` files list (comments, `!` negation, folder rules, `*`, `**`, `?`). Links are never followed.
- **Outlining.** Each file is read line by line with plain pattern matching. Tested for JavaScript and TypeScript (including JSX and TSX, both import styles), Python, Go, Rust, Java, Kotlin, C, C++, Objective-C, Swift, Ruby, PHP, C#, shell scripts and Markdown headings. Any other text file is listed with its size and first comment.
- **Connecting.** Each import is matched to a local file where it can be: relative paths, a `.js` import of a `.ts` file, Python packages, the Go module path from `go.mod`, Rust `mod` and `crate::` paths, C includes, Java, Kotlin and PHP names by package, Ruby `require_relative`, shell `source`.
- **Refreshing.** The map is made the first time it is needed, and checked again when it is older than 20 seconds. Files whose size and time are unchanged are reused; a file whose content is unchanged keeps its outline. A tool never waits more than about four seconds: if mapping is still running it answers from what has been read so far and says so.

## Limits, said plainly

- **It is not a compiler.** Outlines and connections come from reading text. They are right for ordinary code and can miss unusual constructs, code built by macros, or names created at run time.
- **"Where is this used" is by name.** The name is searched in the files that import the defining file and the files beside it. Another thing with the same name will also match, and a use through a different name is missed. The tool says so in its answer.
- **Names and structure only.** The map does not hold file contents. For text inside files the assistant still uses search.
- **Size.** At most 5,000 files and 400 KB per file by default (both on the Settings page), 80 MB in total, two minutes per build. A bigger folder is mapped in part, and the page says so.
- **Folders that are too broad** (your home folder, the disk root, system folders) are refused.
- **The hint also shows in Chat mode** when the chat's folder is a code project. The add-on cannot see which tools a conversation has, so the hint is worded "if the tools are available" and is about 100 tokens.

## What it saves (measured)

Measured with `measure.mjs` (it reads a folder and writes nothing). "Look-up" is one realistic investigation: the overview, one file's outline, one name search, one "where is this used", and one function read.

| Folder | Mapped | Source | Overview | One look-up | Build time |
| --- | --- | --- | --- | --- | --- |
| `deepseek-harness-plus` (this repo) | 271 files, 2,216 symbols | 2,205,410 characters | 4,210 | 6,778 characters, 0.31% of the source | 0.12 s |
| same, following `tierPrompt` in `dsh-model-tiers/index.js` | | | | 18,342 characters, 0.8% (the function itself is 8,372; the file is 105,000) | |
| `deepseek-harness-master` (the app's source) | first 5,000 files (the default limit), 21,629 symbols | 25,960,556 characters | 3,274 | 12,662 characters, 0.05% of the source | 1.2 s |

What it costs on every request: the five tool definitions add **2,458 characters** (about 615 tokens; measured in the request the lab's model received, 6% of that request's tool definitions), and the hint adds about 400 characters when shown.

These are sizes of what the model reads through the map, compared with reading everything. A real task also reads some files in full, so the real saving is smaller than these figures and depends on the task.

## Reverse-engineer skills

Type `/` in the chat box and pick one, or just ask. Each ends in a written document, works read-only, points every claim at evidence, and closes with "What I could not determine".

| Skill | Result |
| --- | --- |
| `reverse-codebase` | An architecture document: purpose, how to run it, layout, main flows traced with `file:line`, data and state, outside services, where to change things, risks. Uses the code map |
| `reverse-website` | A rebuild specification: pages, layout, design values, components, behaviour, network calls, data shapes. Respects `robots.txt` and the site's terms; no login bypass, no personal data |
| `reverse-api-format` | Documentation of an API or file format from examples and observed traffic, with a minimal client or parser sketch. Placeholders, never real keys |
| `reverse-app-binary` | What an app is made of and what it does: bundle layout, frameworks, bundled code, permissions, servers it names, where it keeps data. Read-only tools only (`file`, `plutil`, `otool`, `strings`, `codesign -d`, `nm`) |

`reverse-app-binary` is for software you own or may analyse. It states that it does not remove or get around licence checks, DRM, copy protection, code signing or anti-tamper measures, does not extract other people's credentials or keys, and does not build cracks or key generators.

## Settings page and command

**Settings → Code map**: the two switches, every mapped folder with its numbers (**Map again**, **Delete map**), the limits, extra patterns to leave out, and the skills.

`/codemap` shows the numbers for the conversation's folder; `/codemap build` maps it again; `/codemap clear` deletes its map.

```yaml
- id: code-map
  config:
    enabled: true        # the tools and the hint
    promptHint: true     # the three-line hint in code projects
    maxFiles: 5000       # 100 to 50000
    maxFileKb: 400       # 16 to 4096
    extraIgnore: ''      # more patterns, one per line, as in a .gitignore
    dataDir: <ABSOLUTE_DIR>   # optional; default is <dsh home>/code-map
    commandName: codemap      # empty registers no command
    skills: true              # the four reverse-engineer skills
```

The first five are live (`.volatile()`), so the Settings page changes them without a restart.

## Safety

- Only the conversation's working folder is mapped. The tools take paths relative to it; absolute paths, `..`, `~` and anything outside are refused.
- A file can be read through these tools only if it is in the map. Before each read the file is checked again: it must still be a plain file inside the folder, so a file or folder swapped for a link after mapping is not read.
- The page's data comes from `GET /dsh-code-map/status` (numbers and folder paths, never file contents). **Map again** and **Delete map** go to `POST /dsh-code-map/action`. Both sit behind the app's own fence (login cookie, Host and Origin check) and are never cached. The POST also needs a JSON body under 2 KB and the header `x-dsh-code-map: 1`, and it only accepts the id of a folder that already has a map, or of the app's default folder. So the page cannot point the mapper at an arbitrary path. A POST was chosen because the app offers add-ons no ready-made channel for a page-to-host action, and a GET must not change anything.
- Service for other add-ons: `ctx.get('codeMap')` with `ensure(folder)` and `list()`.

## Files

| File | What it holds |
| --- | --- |
| `index.js` | The add-on: settings, the five tools, the hint, the command, the two routes, skill registration |
| `lib/scan.js` | Walking a folder: skip lists, `.gitignore` rules, limits |
| `lib/parse.js` | Outlines per language |
| `lib/store.js` | Building, refreshing, connecting, saving and loading a map |
| `lib/query.js` | The text of the five answers, and the path checks |
| `lib/manager.js` | One map per folder, built on first use, never a long wait |
| `skills.js` | The four skills |
| `client.js` | The Settings page |
| `measure.mjs` | `node measure.mjs <folder>` prints the figures above for any folder |

## Checked

- **Unit tests: 37** in `test/` (`parse` 12, `map` 16, `plugin` 9), run with the app's own Node. They cover each language's outline, ignore rules, the skip lists, links never followed, the limits, refresh by time and by content, import matching per language, each tool's answer and size caps, refusals of `..`, absolute and home paths, a mapped file or folder swapped for a link, the map staying outside the project, the routes (refused when the app refuses, wrong method, missing header, bad body, unknown folder, oversized body), the switched-off state, and the skills' wording.
- **In a throwaway web profile with the mock model:**
  - the installer picked the add-on up with no change to the scripts;
  - the request the model received listed the five tools (2,458 characters) and, once the folder had a map, the hint; before that, in a folder that is not a code project, no hint;
  - `/codemap` answered with the folder's state;
  - the Settings page showed the folders and numbers; **Map again** mapped a folder (219 files, 1,616 symbols); the hint switch and the file limit saved through the settings channel, and an out-of-range limit was clamped to 50,000;
  - a POST without the header got 400, and a GET to the action route got 405.

**Not checked:**

- A real model calling the tools in a conversation. The mock model cannot call tools; the tools were exercised through the unit tests against real folders and through `measure.mjs`.
- `/codemap build` and `/codemap clear` typed in the chat box (the command with no argument was; the same code is covered by a unit test).
- The skills being followed by a real model, and how they show in the `/` menu.
- The Mac desktop app, light mode, and colour schemes other than the default one.
- Very large folders beyond the app's own source (26 MB, 5,000 files mapped in 1.2 seconds).
- Windows paths.

One thing seen in the lab: the first mapping of a folder under `~/Documents` took over 40 seconds for 150 small files, then a tenth of a second on every later run. It looked like the Mac's first access to those files, not the mapper. The time limit cut that first build short, the page marked it as partial, and the next refresh completed it. `/codemap build` now answers after 8 seconds and lets mapping finish in the background.
