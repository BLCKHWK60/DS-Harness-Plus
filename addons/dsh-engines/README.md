# Engines

Outside coding engines in dsh's Code mode. The first engine is OpenCode. Plus does not install it.

Two things:

- **Use an engine instead of dsh** in a Code conversation, picked like a model.
- **Compare an engine with dsh** on the same task, side by side, on the **Engines** page.

Nothing runs until you pick an engine or start a comparison.

## Using an engine in Code mode

1. In a Code conversation, open the model menu in the chat box and pick the engine, for example
   **OpenCode (engine)**. That conversation is then answered by the engine.
2. Write your task as usual. The engine's answer appears as the reply, followed by what it changed.
3. To go back to dsh, pick one of your own models.

To make an engine your usual choice, pick it for a new Code conversation: dsh starts the next one
with the model you used last. More OpenCode models can be offered in the menu: list them on the
Engines page (`provider/model`, as OpenCode names them).

What happens behind it:

- **The engine works in a copy of your project, inside a lock** (the macOS sandbox). Whatever its
  own settings say, it can change files only in its copy, in its own settings folders and in the
  system's temporary folders, and it cannot read the rest of your home folder.
- **dsh decides what reaches your project**, not the engine:

| Permission mode | What happens when the engine finishes |
| --- | --- |
| Restricted (Mission), or "Wait" in settings | Nothing. You type `/engine apply`. |
| Ask-Auto (Mission), or "New files at once" | New files go in. Changed and deleted files wait for `/engine apply`. |
| Full Auto (Mission), or "Everything at once" | Everything goes in. `/engine undo` takes the last one back. |

  A Mission mode decides when one is on in the conversation; otherwise the setting on the Engines
  page does (it starts as "Wait").
- **A file you changed in the project in the meantime is never overwritten.** It is reported.
- **Follow-up messages carry on.** The engine continues its own session, in the same copy, while
  changes are waiting. Once nothing waits, its copy is made anew from your project.

Commands, in the conversation:

- `/engine` shows what waits and when changes go in.
- `/engine apply` puts everything waiting into the project; `/engine apply <file …>` only those.
- `/engine discard` drops what waits and starts the engine fresh next time.
- `/engine undo` takes the last apply back.

What an engine does not get: dsh's tools, skills, memory, Mission runs or instructions. It gets
your message as its task and keeps its own memory of the conversation. Engines work in Code mode
only, and not as helpers.

## Comparing with dsh

### How to use it

1. Choose the project.
2. Write the task, in the words you would type in Code mode.
3. Optionally name the engine's model (`provider/model`, as OpenCode names it). Empty uses its
   own default.
4. Press **Start the comparison**.

dsh uses the model a new Code conversation starts with. Pick it in the chat box of any Code
conversation before you start.

### What you get, per side

- Model, tokens (input and output, every request added up), steps, tool calls, time, cost where
  the engine reports one, and whether it finished.
- The end of what it answered.
- What it changed, as a diff against the starting point, with the number of files and lines.
- The path of its copy of the project. For dsh, a button that opens its conversation.

A figure is bold when it is the lower of the two and both sides finished.

### How the two sides are kept apart

- **Three copies of the project** are made: a starting point, one for dsh, one for the engine.
  On a Mac's own disk a copy is made at once and takes no space until a file changes. Your project
  is not touched, and nothing is put back into it.
- **dsh** runs as an ordinary Code conversation in its copy, with your Code mode settings.
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
- **The figures are each side's own.** dsh's come from its conversation's records, the engine's
  from what it prints. They count the same things, but they are not measured by one instrument.
- **One comparison at a time; the last 20 are kept.** Removing one deletes its copies. The dsh
  side's conversation stays in the app until you delete it.
- **A comparison never puts anything into your project.** Only using an engine in a conversation does.
- **One engine so far.** Codex, Pi and Claude Code are not built. Each is one file (see below).
- **Temperature and reasoning effort** cannot be set for an engine from dsh; it uses its own settings.
- **Library folders are never applied** (`node_modules`, `.venv`, `.git` and the like). If an engine
  installed packages in its copy, install them in your project yourself.
- **Asking per action is not possible** for an outside program: dsh cannot see inside it. The
  boundary is the lock and the copy, and the permission mode decides what goes into the project.

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
  filled; the engine appears in the model menu; a Code conversation is answered by it; `/engine
  apply`, apply at once, and `/engine undo` changed the project as they should; the lock refused a
  write outside the copy and a read in the home folder.
- **Not verified:** a real task with the real OpenCode and a real model, inside the lock. OpenCode's
  output format was read from its public source, not from a real run.
