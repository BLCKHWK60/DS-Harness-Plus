/**
 * The four "reverse engineer" skills. Each is a procedure that ends in a written
 * document. They are loaded into the model's context only when used, so each is kept short.
 */

const COMMON_END = `## Rules for every finding
- Work read-only. Do not change, move or delete anything you are studying. Write only the report.
- Every claim points at evidence: \`path:line\`, a URL, a command and its output, or a captured example.
- Mark each statement as **seen** (you read or ran it), **inferred** (it follows from what you saw) or **unknown**.
- End the document with "What I could not determine", listing each gap and what would settle it.
- Save the document as a Markdown file in the working folder and tell the user its path.`;

export const SKILLS = [
  {
    name: 'reverse-codebase',
    description: 'Work out how an unfamiliar code base works and write its architecture document, using the code map instead of reading every file.',
    whenToUse: 'The user asks how a project works, wants an architecture overview, onboarding notes, or to know where to change something in code they do not know.',
    content: `# Reverse engineer a code base

Goal: an architecture document a new developer could work from, without reading the whole project.

## 1. Map before reading
1. Call \`code_map_overview\`. Note languages, size, starting points and the most connected files.
2. For a large project, call \`code_map_overview\` again with \`path=<folder>\` for the two or three biggest folders.
3. Read the project's own words first: README, then the manifest (\`package.json\`, \`pyproject.toml\`, \`go.mod\`, \`Cargo.toml\`, a Makefile). Use \`code_map_read\` or the read tool for these; they are short.
Do not open source files yet.

## 2. Find how it starts and runs
- From the manifest: the commands to install, build, test and run; the entry file each one starts.
- Call \`code_map_file\` on each entry file. Follow its "Uses" list one step with \`code_map_related\`.
- If the session allows running commands and the user agrees, run the documented test or help command, read-only, to confirm.

## 3. Trace the main flows
Pick the three to five things the software exists to do (a request served, a command run, a job processed, a screen shown). For each:
1. Find where it begins: \`code_map_find\` for the route, command name, handler or event.
2. Follow it call by call with \`code_map_read path=<file> symbol=<name>\`, reading one function at a time.
3. Record each hop as \`file:line  what happens\`. Stop a branch when it leaves the project (a library, the network, a database).
Use \`code_map_related target=<symbol>\` to see who else calls a function before stating what it is for.

## 4. Data, state and the outside world
- Data: models, schemas, migrations, config files, environment variable names (never copy secret values).
- State: what is kept in memory, on disk, in a database, in a cache; who writes and who reads it.
- Outside: services, APIs, queues and files it talks to, each with the file that owns the connection.

## 5. Write the document
\`\`\`
# <Project>: how it works
1. Purpose (two or three sentences, from the README and the code)
2. How to run it (install, build, test, start: exact commands)
3. Layout (folders and what each holds; the 10 files that matter most, each with one line)
4. Main flows (one section each, as numbered hops with file:line)
5. Data and state
6. Outside services and configuration (names only, no secrets)
7. Where to change things ("to add X, edit A and B"), for the five most likely changes
8. Risks and oddities (dead code, duplicated logic, missing tests, fragile spots), each with evidence
9. What I could not determine
\`\`\`

## Keep it cheap
Read whole files only when they are short or when an outline is not enough. The map lists names and signatures, not contents: use grep for text inside files. Matches from \`code_map_related\` are by name, so open the line before relying on one.

${COMMON_END}`,
  },
  {
    name: 'reverse-website',
    description: 'Study a website or web app and write a specification detailed enough to rebuild it: pages, layout, design values, components, behaviour, network calls and data shapes.',
    whenToUse: 'The user wants to understand, document or rebuild the look and behaviour of a website or web app.',
    content: `# Reverse engineer a website or web app

Goal: a rebuild specification. You describe what the site does and how it looks; you do not copy its text, images, code or brand.

## Before you start
- Use whatever browser or web tools this conversation has. If it has none, say so and work from pages or files the user provides.
- Stay inside what any visitor may do. Read \`/robots.txt\` and the terms link; do not fetch paths they disallow.
- No login bypass, no guessing passwords, no hidden or admin paths, no bulk downloading. Sign-in areas only if the user signs in themself and asks you to continue.
- Do not collect personal data about people shown on the site. Describe the shape of such data, not the values.
- Go gently: one page at a time, no parallel crawling.

## 1. Inventory
List the pages and routes reachable from the navigation, footer and sitemap. For each: URL pattern, purpose, and the template it seems to share with others. Stop at about 30 distinct templates; note what you skipped.

## 2. Layout and design values
For each template, at desktop and phone width:
- the regions (header, navigation, content, sidebar, footer) and how they reflow;
- design values read from computed styles, not guessed: colours, type families and sizes, spacing steps, radii, shadows, breakpoints. Present them as a small table of tokens.

## 3. Components
Name each reusable part (button, card, form field, menu, dialog, table, tabs). For each: its variants and states (hover, focus, disabled, error, loading, empty) and the content it takes.

## 4. Behaviour
Walk the main tasks a visitor performs. Record each as steps: what the user does, what changes on screen, what is validated, what errors look like, what is remembered between pages (cookies and storage keys by name and purpose, never their values).

## 5. Network and data
With the browser's network view, for each task list the calls the page itself makes: method, path pattern, the fields sent, the shape of the answer, status codes seen. Replace real values with placeholders. Note third-party services loaded (analytics, payments, maps, fonts) by name.

## 6. Technology (as observed)
Frameworks and libraries visible from markup, script names and headers. Mark each as seen or inferred.

## 7. Write the document
\`\`\`
# <Site>: rebuild specification
1. Purpose and audience
2. Page inventory (table: route, purpose, template)
3. Design tokens (colours, type, spacing, radii, breakpoints)
4. Templates (regions and responsive behaviour)
5. Components (variants and states)
6. User flows (numbered steps)
7. Network calls and data shapes (placeholders only)
8. Third-party services and observed technology
9. Accessibility notes (landmarks, focus order, contrast problems seen)
10. What I could not determine
\`\`\`
Tell the user plainly: a rebuild must use their own text, images, name and code. This document describes structure and behaviour only.

${COMMON_END}`,
  },
  {
    name: 'reverse-api-format',
    description: 'Work out an undocumented API or data file format from examples and observed traffic, and write its documentation with a minimal client or parser sketch.',
    whenToUse: 'The user has examples of requests and responses, captured traffic, or sample files of an undocumented API or file format they are allowed to study, and wants it documented.',
    content: `# Reverse engineer an API or a file format

Goal: documentation someone could build a client or parser from.

## Before you start
Confirm in one line what you are studying and that the user may study it: their own system, one they have an account and permission for, an open format, or files they own. Work only from examples the user supplies and from traffic of their own account. Do not probe for hidden endpoints, do not try credentials, do not get around rate limits or access controls, and never write real tokens, keys, passwords or personal data into the document: use placeholders such as \`<TOKEN>\`.

## A. An API
1. **Collect.** Gather the examples: captured requests and responses, a HAR file, logs, client code. If client code is in the folder, use \`code_map_find\` for the base URL and for words like \`fetch\`, \`request\`, \`endpoint\`, then \`code_map_read\` on the functions that build requests.
2. **Group** calls by method and path. Turn varying path parts into parameters (\`/items/{id}\`).
3. **For each endpoint** record: purpose; path and query parameters with type and whether required (seen in every example, or only some); request headers that matter; request body shape; response shape per status code; error format; paging, sorting and filtering; limits mentioned in headers.
4. **Authentication, as observed:** where the credential travels (header, cookie, query), its apparent kind (bearer token, signed request, session cookie), how it is obtained and refreshed in the examples. Describe; do not reproduce a credential.
5. **Types.** For each field: name, type, example placeholder, meaning (seen, inferred or unknown), and the values observed for enumerations.
6. **Check.** If the user agrees and the API is theirs to call, make a few read-only calls to confirm inferred points. Never call anything that writes, deletes, pays or sends.
7. **Minimal client.** A short example in the user's language: set the base URL, authenticate with a placeholder, one read call, error handling.

## B. A file format
1. **Collect** several sample files, ideally small ones and ones that differ in one known way.
2. **Identify.** \`file <path>\`; the first bytes (\`xxd -l 64 <path>\`); whether it is text, a known container (zip, gzip, SQLite, plist, protobuf, RIFF) or custom binary. If it is a container, list what is inside before going further.
3. **Lay it out.** Header, sections, records, trailer. For binary: offsets, sizes, byte order, how lengths and counts are stored, checksums, padding and alignment. Compare two samples to find what changes with content.
4. **Field table:** offset or key, size or type, meaning, values seen, confidence.
5. **Parser sketch:** a short reader in the user's language that walks the structure and prints the fields, refusing files that do not match the magic bytes or declared sizes.
6. **Check** the sketch against every sample; record which samples parse fully.

## Write the document
\`\`\`
# <Name>: API reference | file format
1. What it is and where the examples came from
2. Overview (base URL and conventions | container and overall layout)
3. Authentication as observed (placeholders only) | Identification (magic bytes, versions)
4. Endpoints | Structures (one section each, with a field table)
5. Errors and limits | Integrity (checksums, sizes)
6. Minimal client | Parser sketch
7. Coverage: which examples the documentation explains fully
8. What I could not determine
\`\`\`

${COMMON_END}`,
  },
  {
    name: 'reverse-app-binary',
    description: 'Look inside an installed app or program file and explain what it is made of and what it does, using standard read-only tools. Analysis only: no cracking or bypassing protections.',
    whenToUse: 'The user wants to understand an app or binary they own or are permitted to analyse: its parts, frameworks, bundled code, resources, permissions and the servers it names.',
    content: `# Reverse engineer an installed app or binary

Goal: a report on what the software is made of and what it does, for software the user owns or is permitted to analyse.

## What this skill does not do
It is for understanding, compatibility and security review. It does **not** remove or get around licence checks, activation, trials, DRM, copy protection, code signing or anti-tamper measures; it does not extract other people's credentials, keys or tokens; and it does not produce cracks, patches that unlock features, or key generators. If asked for any of those, say so in one sentence and offer what is possible instead: documenting how the app is built, what it stores and where, what it sends and to whom, and how to integrate with it through its supported interfaces.

## Before you start
- Ask what the user wants to learn; it decides how deep to go.
- Work on the app where it is, read-only. Never modify, re-sign, patch or run an unknown binary. If something must be unpacked, copy it to a scratch folder in the working directory and unpack the copy.
- If the bundle holds a folder of source code (for example an unpacked Electron app), use the code map on that folder: \`code_map_overview\`, then \`code_map_file\` and \`code_map_read\`.

## 1. Identify
- \`file <path>\`: kind and architectures.
- macOS app: \`ls -la <App>.app/Contents\`, \`plutil -p <App>.app/Contents/Info.plist\` (name, bundle id, version, minimum system, URL schemes, document types, usage descriptions).
- Size by part: \`du -sh <App>.app/Contents/*\`.

## 2. What it is built from
- Linked libraries: \`otool -L <binary>\` (Linux: \`ldd\` or \`readelf -d\`).
- Frameworks and helpers: list \`Contents/Frameworks\`, \`Contents/Helpers\`, \`Contents/PlugIns\`, \`Contents/XPCServices\`, \`Contents/Library\`.
- Technology, from what is there: Electron (\`Electron Framework\`, \`app.asar\`), a web view app, Qt, Java, Python, .NET, Flutter, native Swift or Objective-C.
- Symbols, when present: \`nm -gU <binary> | head -200\`; Objective-C and Swift names often read as a class list.

## 3. Bundled code and resources
- \`Contents/Resources\`: list it; note data files, databases, models, localisations, scripts.
- Electron: list the archive without running it (\`npx asar list app.asar\` if available, or read its header); note \`package.json\` (name, version, entry file, dependencies). Unpack only a copy, then use the code map on it.
- Archives inside (zip, jar): list contents (\`unzip -l\`) before unpacking a copy.

## 4. Permissions and signing (read only)
- \`codesign -dv --verbose=2 <App>.app\`: who signed it, team id, hardened runtime.
- \`codesign -d --entitlements - <App>.app\`: what it may access (network, files, camera, microphone, automation, keychain groups).
- Report these as facts. Do not alter or remove signatures.

## 5. What it talks to and where it keeps things
- Named servers and paths: \`strings -n 6 <binary> | grep -Ei 'https?://|wss?://|\\.(com|net|org|io|dev|app)\\b' | sort -u | head -200\`, and the same in bundled scripts. List hosts and their apparent purpose (API, updates, telemetry, licensing). Do not list secrets; if a string looks like a key or token, say that one exists and where, without printing it.
- Data locations named in strings or the plist: folders under \`~/Library\`, preferences domain, databases, log files.
- Update mechanism (Sparkle, Squirrel, an update feed URL), crash reporting and analytics libraries, by name.

## 6. Write the report
\`\`\`
# <App> <version>: what it is made of
1. Identity (name, bundle id, version, developer, architectures, size)
2. How it is built (technology, frameworks, notable libraries)
3. Layout of the bundle (tree to two levels, with what each part is)
4. Bundled code and data (what is there, how it is packed, entry points)
5. Permissions and signing (entitlements in plain words)
6. Network (hosts and purpose) and data on disk (paths and purpose)
7. Updates, telemetry and crash reporting
8. Supported ways to integrate or automate (URL schemes, command-line options, documented APIs, AppleScript)
9. What I could not determine
\`\`\`

${COMMON_END}`,
  },
];
