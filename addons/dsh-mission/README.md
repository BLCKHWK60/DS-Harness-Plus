# Mission

Plugin `@local/dsh-mission` (dsh 0.2.2-rc.2). Three permission modes that keep the assistant inside a conversation's folder, and checkpoints of that folder that the user can go back to. It is the base for a later step: a `/mission <goal>` run with several models. That run is **not built yet**.

Nothing happens until the user types `/mission` in a conversation.

## The modes

| Mode | Inside the conversation's folder | Outside it |
|---|---|---|
| **Restricted** (`/mission restricted`) | New files are free. Changing or deleting an existing file is asked once per file. | Nothing is read or changed, and the user is never asked. |
| **Ask-Auto** (`/mission ask`) | As Restricted. | Reading is asked once per place. A change is asked for by the app's own sandbox. |
| **Full Auto** (`/mission auto`) | Free: no asking. | As Ask-Auto. |

`/mission on` switches on the mode chosen in Settings → Mission (default Restricted). `/mission off` lifts the mode. `/mission` alone shows what is on and lists the commands.

A file the assistant created itself in the conversation is its own: changing it later is not asked.

## How the modes hold

1. **Every tool call is decided before it runs** (`tools/pre-execute`; rules in `lib/guard.js`, a pure function). Paths are taken from the call's arguments (`file_path`, `path`, `files` and the like) and compared in their real spelling, so a link that points out of the folder counts as outside. A question goes to the user through the app's own approval card (`approval.request`); the answer is remembered per file (inside) or per place (outside) in `<home>/mission/conversations.json`.
2. **The app's sandbox does the fencing for changes.** Switching a mode on puts the conversation on the app's **Workspace Write** preset (sandbox `workspace-write`, approval `ask`). The app then refuses any write outside the folder at the operating-system level, for file tools and for terminal commands alike. To change something outside, the assistant has to retry the call with `sandbox_permissions`, and the app asks the user. In Restricted, Mission refuses such a retry before it gets that far.
3. **Terminal commands** cannot be asked about file by file, so they are checked afterwards. A checkpoint is taken before every command. After it, in Restricted and Ask-Auto, any file that existed before, was changed or deleted by the command, and is not approved, is put back from that checkpoint. The command's output is kept and a note is added telling the assistant what was put back and how to ask (`mission_request_files`, or the edit tool). New files and everything the project ignores are left alone.
4. **Reading outside from a command** is checked from the command's text only: words that are paths under the user's home (or `..` leading out of the folder) and are not system places (`/usr`, `/bin`, `/opt`, `/tmp` and so on). Restricted refuses the command; the other two ask.
5. **Helper agents** (sub-agents) of a guarded conversation are under the same mode and share its approvals.
6. **The assistant is told the rules** (prompt section `mission:rules`), including that in Restricted it must not ask.

The tool `mission_request_files { files, why }` asks the user once for several existing files, for example before a formatter runs.

## Checkpoints

- Kept with git in a store of their own: `<folder>/.dsh-mission/checkpoints.git` (`GIT_DIR` there, `GIT_WORK_TREE` the folder). The project's own repository is never read or written, except that `/.dsh-mission/` is added once to its local, uncommitted ignore list (`.git/info/exclude`) so the store does not show up in `git status`.
- Taken when a mode is switched on, at the start of every turn, before every terminal command, and by `/mission checkpoint [name]`. When nothing changed since the last one, no new one is made.
- `/mission checkpoints` lists them, newest first, numbered. `/mission back 12` puts the whole folder back as it was at checkpoint 12. The state just before going back is kept as a checkpoint too, so going back can be undone, and the list never loses an entry.
- **Not kept:** what the project ignores in `.gitignore`, and always `node_modules/`, `.venv/`, `venv/`, `__pycache__/`, `.DS_Store`. Such files are neither protected from commands nor put back.
- Needs `git` (`/usr/bin/git`, or Homebrew's). Without it a mode still decides tool calls, but there are no checkpoints and a command's changes cannot be put back; the command says so when the mode is switched on.

The app shows a command's answer as one line that opens with a click; each answer therefore starts with the essential line.

## Limits

- A script can read a file elsewhere on the Mac without naming it in the command line. It cannot change one: the sandbox stops that.
- A change outside the folder is asked for by the app per call, not once per place.
- The app's approval button reads "Allow once"; for a file inside the folder, Mission remembers the yes for the rest of the conversation all the same.
- A command that runs in the background and changes files after it has returned is not caught by the check after the command; the files are still in the earlier checkpoint.
- A nested git repository inside the folder is recorded as a link, not copied.
- Changes the user makes by hand are never undone by the put-back, but `/mission back` returns the whole folder, the user's own later changes included (they are in the "before going back" checkpoint).
- Very large files that the project does not ignore are copied into the store at every change.

## Settings

Settings → Mission: the switch (`enabled`, default on) and the mode `/mission on` uses (`defaultMode`, default `restricted`).

## Tested (0.36.0)

- **Unit tests (9):** real-path comparison including a link that leaves the folder; reading commands for outside places without false alarms (`/usr/bin/git`, `/etc/hosts`, a URL, a search pattern); every mode's decision for file tools and commands; the checkpoint store (take, what changed, put files back, go back, undo going back, the ignore-list line written once); the record across a restart.
- **In the test setup, with a stand-in model that calls the tools it is told to**, on a throwaway folder:
  - Restricted: a new file was written with no question; editing an existing file showed the approval card once and not the second time; a command that changed one file, deleted another, made a new one, appended to the assistant's own file and wrote ignored build output had the first two put back and the rest kept; a read outside and a command naming `~/Documents` and `..` were refused, and the command did not run.
  - Ask-Auto: a read outside showed the card once, then not again; `mission_request_files` asked for three files in one card, after which a command could change them, while an unapproved `.gitignore` was put back; a write outside went through the app's own card once and was written.
  - Full Auto: a command changed existing files with no question; a read outside showed the card, and a "Reject" reached the model as a refusal.
  - `/mission checkpoints` listed them; `/mission back 1` returned every file to its first state, removed the files made since, and left ignored output alone. The mode survived an app restart.
  - The Settings page shows and saves both settings.
- **Not tested:** a real model (whether it follows the rules text and uses `mission_request_files`); a helper agent in a guarded conversation (the code path is there, it was not run); a project that is a real git repository (unit test with a stand-in only); a large repository's speed; the Mac app; `/mission off` returning a conversation to Full access (the test conversation was on Workspace Write already).
