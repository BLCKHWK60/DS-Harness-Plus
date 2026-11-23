# Brief: @local/dsh-engines

What it is for: Engines: use an outside coding engine (OpenCode first) in the Code space, in any mode, instead of dsh, picked like a model, working in a locked copy of the project; and compare an engine with dsh on the same task, side by side.

This brief was written by Creator Plus from the add-on's own files. Its README below is the full description, complete enough to rebuild the add-on from; improve this brief by hand, with the user's yes.

## What it must keep doing

- Its commands: /engine.
- Its settings: opencodePath, maxMinutes, opencodeModels, applyWhen.

## Its README

# Engines

Outside coding engines in dsh's Code space, in any mode. The first engine is OpenCode. Plus does not install it.

Two things:

- **Use an engine instead of dsh** in a thread in the Code space, picked like a model.
- **Compare an engine with dsh** on the same task, side by side, on the **Engines** page.

Nothing runs until you pick an engine or start a comparison.

## Using an engine in the Code space

1. In a thread in the Code space (any mode: Code, Research, Plain chat, your own), open the model menu in the chat box and pick the engine, for example
   **OpenCode (engine)**. That thread is then answered by the engine.
2. Write your task as usual. The engine's answer appears as the reply, followed by what it changed.
3. To go back to dsh, pick one of your own models.

To make an engine your usual choice, pick it for a new thread in the Code space: dsh starts the next one
with the model you used last. More OpenCode models can be offered in the menu: list them on the
Engines page (`provider/model`, as OpenCode names them).

What happens behind it:

- **The engine works in a copy of your project, inside a lock** (the macOS sandbox). Whatever its
  own settings say, it can change files only in its copy, in its own settings folders and in the
  system's temporary folders, and it cannot read the rest of your home folder.
- **dsh decides what reaches your project**, not the engine:

| Mission access, or the Engines setting | What happens when the engine finishes |
| --- | --- |
| Restricted (Mission), or "Wait" in settings | Nothing. You type `/engine apply`. |
| Ask (Mission), or "New files at once" | New files go in. Changed and deleted files wait for `/engine apply`. |
| Auto (Mission), or "Everything at once" | Everything goes in. `/engine undo` takes the last one back. |

  While a Mission runs in the thread, its Mission access decides; otherwise the setting on the Engines
  page does (it starts as "Wait").
- **A file you changed in the project in the meantime is never overwritten.** It is reported.
- **Follow-up messages carry on.** The engine continues its own memory of the thread, in the same copy, while
  changes are waiting. Once nothing waits, its copy is made anew from your project.

Commands, in the thread:

- `/engine` shows what waits and when changes go in.
- `/engine apply` puts everything waiting into the project; `/engine apply <file …>` only those.
- `/engine discard` drops what waits and starts the engine fresh next time.
- `/engine undo` takes the last apply back.

What an engine does not get: dsh's tools, skills, memory, Mission runs or instructions. It gets
your message as its task and keeps its own memory of the thread. Engines work in the Code
space only (in any mode), and not as helpers.

## Comparing with dsh

### How to use it

1. Choose the project.
2. Write the task, in the words you would type in a Code thread.
3. Optionally name the engine's model (`provider/model`, as OpenCode names it). Empty uses its
   own default.
4. Press **Start the comparison**.

dsh uses the model a new thread in the Code space starts with. Pick it in the chat box of any
Code-space thread before you start. The page starts dsh's side in the Code space with Code mode; it
never changes your own settings (Settings → Modes keeps the mode new threads start with).

### What you get, per side

- Model, tokens (input and output, every request added up), steps, tool calls, time, cost where
  the engine reports one, and whether it finished.
- The end of what it answered.
- What it changed, as a diff against the starting point, with the number of files and lines.
- The path of its copy of the project. For dsh, a button that opens its thread.

A figure is bold when it is the lower of the two and both sides finished.

### How the two sides are kept apart

- **Three copies of the project** are made: a starting point, one for dsh, one for the engine.
  On a Mac's own disk a copy is made at once and takes no space until a file changes. Your project
  is not touched, and nothing is put back into it.
- **dsh** runs as an ordinary thread in the Code space, in Code mode, in its copy.
- **The engine** is started for one task in its machine-readable mode, in one process, inside a
  lock (the macOS sandbox). Whatever its own settings say, it can change files only in its copy,
  in its own settings folders and in the system's temporary folders, and it cannot read the rest
  of your home folder. It does not stop to ask; the lock and the copy are the boundary.

## Settings

| Setting | Starts as | What it does |
| --- | --- | --- |
| `opencodePath` | empty | Where the OpenCode program is. Empty looks in the usual places. Only in the configuration file. |
| `maxMinutes` | 30 | The longest an outside engine may work on one task. Only in the configuration file. |
| Its changes (`applyWhen`) | review | `review`: wait for `/engine apply`. `new`: new files at once. `auto`: everything at once. |
| Models to offer (`opencodeModels`) | none | OpenCode models shown in the model menu, besides its own default. Shown after the app is started again. |

## Good to know

- **The engine can use the network.** It has to reach its model, and the lock cannot tell one
  site from another.
- **The engine reads its own settings and sign-ins**, in its own folders. dsh never reads them.
- **Programs the engine starts** (git, package managers, compilers) run under the same lock, so
  one that needs a settings file from your home folder will not find it.
- **The figures are each side's own.** dsh's come from its thread's records, the engine's
  from what it prints. They count the same things, but they are not measured by one instrument.
- **One comparison at a time; the last 20 are kept.** Removing one deletes its copies. The dsh
  side's thread stays in the app until you delete it.
- **A comparison never puts anything into your project.** Only using an engine in a thread does.
- **Some folders are never compared** (stage 6b lab fix): Recon's room (or a folder that holds it), the app's own data
  folder (Scratch and the threads' folders are in it), `/dev` and Devices folders. The Project list leaves them out and
  Start refuses them, because the outside engine gets a shell and the open network in its copy.
- **One run per message.** When the app asks again after its own note (a Scratch thread's folder moved on its first
  turn), the engine does not run the same task twice; it says "Answered above".
- **One engine so far.** Codex, Pi and Claude Code are not built. Each is one file (see below).
- **Temperature and reasoning effort** cannot be set for an engine from dsh; it uses its own settings.
- **Library folders are never applied** (`node_modules`, `.venv`, `.git` and the like). If an engine
  installed packages in its copy, install them in your project yourself.
- **Asking per action is not possible** for an outside program: dsh cannot see inside it. The
  boundary is the lock and the copy, and Mission access (or the Engines setting) decides what goes into the project.

## Adding an engine

One file in `lib/engines`, shaped like `opencode.js`: `find` (where the program is), `ownFolders`
(its settings folders), `args` (the command for one task) and `parse` (one line of its output as a
step with tokens, text, a tool call or an error). Then name it in `ENGINES` in `index.js`.

## Tested

- **Unit tests (8):** applying changes (new files only, a file the user edited is left alone, undo,
  one file by name, links and library folders left alone); an engine offered as a model (its text
  is the answer, a title request never starts it); carrying on from the engine's session; OpenCode's arguments and output; the lock's rules; copying a project and
  working out the difference; keeping comparisons; a stand-in engine run inside the lock, where a
  write outside the copy and a read of a file in the home folder were both refused.
- **The real OpenCode program (2.2.5) starts inside the lock** (`--version`, `run --help`).
- **Lab run in the app** with a stand-in engine and a stand-in model: both columns of a comparison
  filled; the engine appears in the model menu; a Code thread is answered by it; `/engine
  apply`, apply at once, and `/engine undo` changed the project as they should; the lock refused a
  write outside the copy and a read in the home folder.
- **Not verified:** a real task with the real OpenCode and a real model, inside the lock. OpenCode's
  output format was read from its public source, not from a real run.

## Stage 6a: no engine in a guarded space (item 4A, 22 November 2026: built and unit-tested only)

An engine is an outside program with its own shell and network, so no tool rule of Modes, Devices or Creator Plus sees its work. A Code thread in Recon, Devices or Workshop keeps the id `code`, so it would pass the Code check: it now gets "Engines do not run in this thread: it is in Recon, Devices or Workshop …" (`GUARDED_ENGINE_TEXT`) and nothing runs. The test asks Modes' `guardOf` (sealed, guardedBy or noPrograms) and `isolated`; an older Modes is asked for the space; a Modes that fails counts as guarded. Owner point 26, "Home modes keep today's behaviour": the home mode of Devices (Bench) or Workshop (Creator Plus) is not counted as guarded here; it is not Code, so it gets "Engines work in Code mode only" as before 6a. Recon's home mode is sealed and stays guarded. Tests: `test/space-6a.test.mjs`.

## Stage 6b: engines follow the space, not the mode (item 4A, 23 November 2026: built and unit-tested only)

Engines now work in **the Code space, in any mode** (Code, Research, Plain chat, Data, your own). What changed:

- **Any mode in the Code space runs an engine.** Before, only Code mode did, in any space.
- **Elsewhere nothing runs, and the thread says why.** A thread in Chat (also Code mode ticked into Chat) gets "Engines
  work only in the Code space. This thread is in Chat, so nothing was run. …". Bench at home in Devices and Creator Plus
  at home in Workshop get the same soft sentence (home modes keep today's behaviour; only the words changed); Modes
  also puts the message you typed back into the chat box there (owner, point 27).
- **A mode that does not allow programs** (your own mode marked "no programs" or "isolated") refuses an engine also in
  the Code space: "its mode (…) does not allow programs".
- **Recon, and guests in Devices and Workshop,** keep the stage 6a refusal. Modes also refuses there, before anything
  runs, and puts your message back into the chat box (see the Modes README).
- **Modes is needed.** Without it, or with one too old to say a thread's space, nothing runs and the sentence says to
  switch it on or update it in Settings → Modes. When Modes cannot read the space for a moment, the sentence asks you
  to send again.
- **English only** (owner decision 28, 23 November 2026): the sentences are English also when the app is set to
  Chinese. The Compare page still sends its language with `claim`; the route accepts it and ignores it, and Modes is
  no longer asked in that language.
- **`/engine apply`** is refused in a sealed thread ("Nothing to apply here: this thread is sealed.").
- **The Compare page** starts its dsh side in the Code space with Code mode (route action `claim`), and never changes
  the mode your new threads start with. If that start is refused, nothing is sent and the page says: "The dsh side
  could not start in the Code space: (why) Nothing was sent. Check that the Code space is shown in Settings → Spaces,
  then press Start the comparison again." The page's words say "the Code space". Part D.
- **Unchanged:** when an engine's changes go into your project (the setting, or Mission access); an engine still has
  its own shell and network whatever the mode's Web, Depth or Tool access say.

Tests: `test/space-6b.test.mjs`, `test/compare-claim.test.mjs`, `test/compare-page-6b.test.mjs`; `test/space-6a.test.mjs` updated for the new words.
