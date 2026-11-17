# Creator Plus handbook: how a plugin is built well here

17 November 2026. Written from `docs/HANDOFF.md`, the add-ons' READMEs, the commit history and the working sessions of 10–17 November. Creator Plus's recipes (`addons/dsh-creator-plus/recipes/`) follow this handbook; when the two disagree, this handbook is the reason and the recipe is fixed. Marked **(unsure)** where it rests on one observation.

## 1. The order of work

1. **Read before writing.** The owner's request, the plan if there is one, `docs/HANDOFF.md`, the README of every add-on the change touches, and the installed app's API (not the newer source checkout). What exists is kept; what would be replaced or removed is asked about first.
2. **Ask what the setup cannot answer,** one question at a time, in plain words, each with what he has today, what would change, what he would lose, the options and a recommendation with its reason.
3. **Write the brief and the plan:** what will be created, what it touches, what could collide. Build only after the owner's yes.
4. **Tests first,** from the brief, with stand-ins (never real devices, networks, accounts, models or `~/.dsh`).
5. **Build in small steps,** each working by itself.
6. **Check:** the add-on's tests, `node --check` on every page, the hook scan, a mutation check of every safety rule (undo it; a test must fail), the full check (`bash scripts/check.sh`), the lab (a throwaway copy with a stand-in model), and an independent reviewer who gets the code, not the conclusion.
7. **Report** in plain words: outcome first, what was verified and how, what was not, what changed for the user, and the open questions.
8. **Install, commit and push only when the owner asks.**

## 2. The shape of an add-on

| File | What it holds |
| --- | --- |
| `package.json` | `@local/dsh-<name>`, `"type": "module"`, `exports` (`.`, `./client`, locale, icon), `files`, `engines.dsh` (`>=0.2.2-rc.1 <0.3.0`), `dsh.bundle.patch`, `dsh.client` with `immediately` and the injected client packages |
| `cordis.patch.yml` | One `insert` row: `id`, `name`, `config` with the defaults and a comment per option. **No user-specific values** (no IPs, hosts, model ids, key names, paths); placeholders only |
| `index.js` | `export const name`, `export const Config` (schemastery `z.object`; every field the page or another add-on changes is `.volatile()`), `export const inject` (every service used as `ctx.<service>`), `export function apply(ctx, config, standIns = {})` |
| `client.js` | `window.__ModuleLoader__.load({ id, factory(require) { … return { inject, apply(ctx) { … } } } })`: the Settings page (`settings.section` slot) and any chat-box seat |
| `lib/*.js` | Pure functions, tested on their own |
| `test/*.test.mjs` | `node:test`, stand-ins only; one stand-in app per add-on where the wiring matters |
| `README.md` | What you get, the rules (and which are enforced in code), what is not built, how it was tested and what was not |
| `passport/` | The brief, what it touches, built against, tests, changelog, origin; `lessons/` for Tuning Plus |

`standIns` is the third argument of `apply`: tests pass stand-ins for programs, the web, the approval card and clocks; production passes nothing.

## 3. Conventions that hold everywhere

**Additive and non-destructive.** A new feature is off until switched on, or changes nothing until the user picks it ("add the levels, keep the defaults"). Anything that could change, damage or disable a built feature is asked first, with the reason in plain words.

**Fail safe when another add-on is off.** Read services with optional chaining inside `try`; an answer of `undefined` means "behave as before". Never crash because Modes, Mission or Recon is switched off.

**A new tab** goes through the Modes add-on's `extraModes` (as Finance, Data, Research, Scout, Recon, Content and Bench do): `{label, tools, sandbox, prompt, startFamilies, isolated?}`; switching off removes the entry and moves `defaultMode` back to `cowork` if it pointed at the tab. The mode's method stays **under 4,000 characters** (Modes' limit; small models pay for every line). Add the tab's icon to `dsh-cowork-shell` (`glyphFor`, `PATHS`) and `dsh-settings-plus` (`GROUPS`, `ICONS`).

**Tools** are registered with `when: ({agent}) => enabled() && inMyTab(agent)` so other tabs' tool lists do not change. Each returns `{text}` through a `safely` wrapper that turns an error into a plain sentence, has a `timeoutMs`, and says when it is not concurrency-safe.

**Rules that must hold are code, not words.** A `tools/pre-execute` listener decides **before** calling `next()` (so no approval card shows for a refused call), and the same rule runs again as a final `ctx.tools.guard` (monotonic: nothing after it can allow the call). A guard needs `export const inject = ['tools']`. Prefer an **allow-list** to a block-list: a tool nobody knew about is closed. When a check throws on a safety path, refuse.

**The user's yes** is the app's approval card (`ctx.get('approval').request({agent, toolName, callId, reason, displayReason: {en}, signal})`) or a page button (a route behind `connection.requestRejection`). A helper cannot ask; refuse instead. A decision from the user's words is read from his **newest own message** (never the model's, never a tool result, never an imported text): at least two words or a plain agreement, the whole phrase (not "board 1" inside "board 10"), and not after "not", "don't", "never", "no", "without".

**Text from outside is material, never instructions:** pages, devices, logs, other plugins' code, imported conversations, exports. Put it between markers with a random nonce per call, and strip look-alike markers until none are left.

**Files:** new files with `wx`; replacements through a temp file and `rename`; appends with `O_NOFOLLOW`; every path checked by its real path (`realpathSync.native`), case-insensitively on macOS; never through a link; never into Recon's rooms; never read or write the owner's default workspace (`~/Documents/deepseek-harness/default-workspace`); never call `uiWorkspace.pickDirectory()` from code or tests.

**Code a model wrote runs only in a sandbox.** A plugin's tests, its `index.js` and the trial copy loading it are code a model wrote: run them with macOS's `sandbox-exec`, denying by default what matters: no network, no `mach-lookup` (launchd, LaunchServices), no program but the ones it needs (`process-exec` allowed only for the app's Node and the shell), writing only in the folder being checked and the trial copy, nothing of the home folder read but those, signals only to its own processes, and an environment of a few named variables (never the app's, which holds keys). Start the program in a folder it may read. Mask its output and fence it as material. Where there is no sandbox, do not run the code. Creator Plus does this in `lib/sandbox.js`; a Long run's checks go through Mission, which runs them in its `offlineFence` for a Creator Plus conversation.

**What is applied is what was reviewed.** Keep the reviewed copy where neither the file tools nor the sandbox can write, hash every file at review time, refuse on mismatch, and show the change to the owner on the card. Tie each Undo to the backup its own Apply took.

**Check the code, not the plan.** A plan says what a model intends; the fit check also reads the built code (settings it writes, sealed tabs it names, hooks on every tool call, a setup file that does more than insert its own row) and blocks a name already on the map.

**Secrets** never go into a file, a log, a card, an argument list or a model's text. Passwords live in the macOS Keychain and reach a program through stdin or an askpass helper. Mask before storing (`password: x`, `"password": "x"`, `WIFI_PASS=x`, key blocks, long key-like runs outside web addresses).

**Settings pages** follow `docs/UI-STYLE.md` (measured from the app; colours only from the app's CSS variables). Write with `appCtx.remote.settings.mutate(ns, ops, revision)` and retry once on `settings/conflict`. Popovers are placed with `useLayoutEffect`, get `maxHeight` and scroll, and close on Escape and outside clicks. **No hook after an early return** (`scripts/dev-hook-scan.mjs`), and **`node --check client.js`** on every page.

**Words for the owner:** plain, short, outcome first, no jargon. He is not a programmer.

## 4. Testing

- Node is the app's own: `ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test --test-timeout=60000 test/*.test.mjs`.
- **Never `~/.dsh`.** Every `dsh` call, even `--help`, runs with `DSH_HOME=<throwaway>`.
- Stand-ins for everything outside: programs (`run`, `find`), the web (`fetch`), the approval card, the clock, the model. Tests never touch a real device, network, account, Keychain, Bluetooth or model.
- **Mutation checks:** undo each safety rule once; a test must fail. A rule no test catches gets a sharper test or is named as a second lock.
- **The lab:** a throwaway `DSH_HOME` with the web profile, Plus installed by `scripts/install.sh --profile web`, a stand-in model (`TOOLTEST <tool> <json>`), the built-in browser. It finds what tests miss (a service not injected, a button hidden after a restart, a model that loops).
- **The full check** (`bash scripts/check.sh`): every add-on's tests, every page parses, no hook after an early return, install, re-install and uninstall into a throwaway folder.
- **An independent reviewer** reads the change with a brief that states the intended rules and the ways to break them; every finding is fixed with a test.

## 5. Installing, committing, processes

- Install only when the owner asks: compare the installed copy with `.installed-files` (the owner edits installed add-ons with Creator mode; keep his edits first), check that no conversation changed in the last minutes, then `env -u DSH_HOME bash scripts/install.sh --yes`. Never force the app to quit.
- Commit only when asked; scan the change for private details first (no personal names, home paths, server names, real addresses; reserved example addresses `203.0.113.x` in tests); messages end with the Co-Authored-By line.
- Stop a process only by its exact PID (a loose `pgrep -f` pattern also matches the shell running it).

## 6. Mistakes made, and what fixed them

| What went wrong | Why | The fix, now a rule |
| --- | --- | --- |
| Bench did not load in the lab | `ctx.tools.guard` used without `inject = ['tools']` | Inject every service used as `ctx.<service>`; a test checks it |
| A page would not load | A stray bracket passed the hook scan | `node --check` on every page; the full check does it |
| A closed tool still showed an approval card | The guard ran after `next()` | Decide before `next()`, again as a final guard |
| An unknown terminal tool got through Bench | Block-list | Allow-list |
| One device's permissions worked on another | Permissions tied to a card's name | Bind a card to the device's identity (USB serial, MAC, phone serial) with the user's yes |
| Shell values could run as commands on a phone | Values passed unquoted | Single-quote every value, check every exit code, keep old values exactly |
| A firmware checksum came from the model | The tool took it as an argument | Read the maker's page itself |
| A safety mark disappeared when the card's text changed | Derived from editable text | Sticky marks only the user lifts |
| "board 1" matched "board 10" | Substring match | Whole phrase, word boundaries, negation check |
| A Web level was bypassed by `curl`, archive links, odd argument names | Only `url` arguments of web tools were judged | Judge every whole web address in any argument, addresses in commands and programs, the page an archive copy shows |
| A level applied while the button said Off | Stored level read without the switch | Apply only while the switch is on |
| A Recon export lost its protection in a fork | Guard keyed on the conversation id | Recognise the export by its marker in the text |
| The Export button hid after a restart | The conversation was not loaded | Read the saved history through `sessionQuery` |
| A writer helper was not recognised | The app puts a time note before the task | Match the marker at the start of any line |
| A Long run called its step tool 340 times after it ended | The step tool vanished and the model kept trying | A plain "the run has ended" answer and the turn ended after three calls |
| Code work was treated as an open question | Default classification | Default to code; only the app's own checks may reopen a passed item |
| "Read-only" helpers could write | Only write tools were refused, only for direct children | Refuse commands, programs, sub-agents and writes up the helper chain |
| A run could freeze | A JSON-block parser looped on `{` without an end | Bounded parsing, a test that would hang |
| A one-word "quote" counted as the owner's decision | Too lax a match | Two words or a plain agreement, from the newest message |
| Export addresses reached the Internet Archive | Sources from an export were not marked | Mark a source by its address and by the claims citing it |
| Tests created files in the owner's data | `dsh --help` without `DSH_HOME` | `DSH_HOME` for every call |
| The installer would have wiped the owner's edits | He edits installed add-ons in place | Compare with `.installed-files` before every install |
| A test used a real public address | Copied from a real case | Reserved example addresses |
| A model's builder could run any code it wrote | "No commands" was enforced, but the checks ran the plugin's own tests and code | Run that code in macOS's sandbox; no sandbox, no run |
| The trial copy's `dsh plugin add` failed in the sandbox | The program started in a folder the sandbox closes (`uv_cwd` EPERM) | Start every sandboxed program in the folder it checks or the trial copy |
| A link inside the build folder counted as the build folder | The path was checked as named | Check the real path for "inside", and both spellings for "never there" |
| Part of a sealed conversation's error text reached a finding | "Structure only" kept the first words of the error | The kind of an error from a fixed list, never a part of its text |
| `LIB/Gate.js` would have slipped past a guarded-file check | macOS ignores capitals | Compare guarded names case-insensitively; every file of Recon is guarded |
| A Long run in Creator Plus ran its planner's check commands for real | Mission's own shell runs checks; the add-on's guard never sees them | Mission asks the add-on (`longRunRules`) and runs the checks in its offline fence without keys |
| The sandbox let a program start launchd tools, write under /Applications and see API keys | It allowed by default and blocked only the home folder | Deny network, mach-lookup, exec and writes; allow only what is needed; pass a short environment |
| A pending change could be rewritten before Apply | The prepared copy lived where sandboxed code could write | Keep it out of reach, hash it, verify on Apply |
| A new plugin named like an existing one passed the fit check | Collisions with its own name were skipped | Block any name on the map; index every row, built-in too |
| A setup file could switch off another plugin | The scan matched only "- id:" lines | Read new plugins' setup files strictly; refuse what it does not know |
| Undo restored another card's backup | It took the newest backup of that plugin | Store the backup on the card |

## 7. Writing for a small model, open to a large one

- What code can do, code does: maps, checks, tests, backups, installs, rules.
- Small steps with one job each; each returns a fixed shape a check can read (a short JSON block at the end).
- Recipes mark **must** and **default**; a model marked strong by the user may replace a default with its reason written down, if every check still passes.
- Instructions short and concrete; every number and name the model needs is in the tool's answer, not in its memory.
