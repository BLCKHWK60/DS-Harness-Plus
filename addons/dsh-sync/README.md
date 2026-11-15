# Sync

Host plugin `@local/dsh-sync` (dsh 0.2.2-rc.1). It shares **sessions** (and, optionally, the **project list**) between any number of machines through a **git remote you name**. The remote is the only thing that has to be reachable, and only at the moment you sync: **no machine has to be on**, each machine keeps working on its own copy, and nothing in the plugin names a machine. It runs in the desktop app (it is an ordinary host plugin).

It is a **reviewed and changed fork** of `dsh-session-sync` 0.2.32 (PerryLink, Apache-2.0); see `NOTICE`. **Nothing is configured by default**: with no `remote` it only reports status.

## How it works

`$DSH_HOME/sessions` (except isolated Recon conversations, see below) is mirrored byte for byte into a private git worktree (`$DSH_HOME/sync/repo`), committed and pushed to your remote; `pull` fetches, merges and copies the result into the live session store. Session files are opaque bytes, never parsed. Only `git` (and `age`, if you use encryption) is run, as plain child processes with no shell, `GIT_TERMINAL_PROMPT=0`, and only the `file`, `git`, `http(s)` and `ssh` transports allowed. Git never force-pushes, resets or rebases.

## Configuration

```yaml
- id: sync
  config:
    remote: <GIT REMOTE>              # a URL or an absolute path to a bare repository (a path may contain spaces); NO credentials in it
    backend: git                      # git = plaintext | encrypted = age
    encryption: optional              # optional | required
    ageRecipient: <AGE PUBLIC KEY>    # backend: encrypted
    ageIdentity: <ABSOLUTE PATH OF THE AGE KEY FILE>   # a PATH, never the key itself
    ageBin: age
    deviceLabel: <A NAME FOR THIS MACHINE>             # optional, shown in project manifests
    autoPullOnStart: false
    autoPushOnTurnEnd: false          # push after a top-level turn ends, at most once per minPushIntervalSeconds (default 60)
    pullIntervalMinutes: 0            # 0 = off
    projects:
      sync: false
      autoCreate: false               # false = only report; `/sync projects apply` adds them
      folderMap: [ { from: <FOLDER ON ANOTHER MACHINE>, to: <FOLDER ON THIS ONE> } ]
    sessionRoot: ''                   # default $DSH_HOME/sessions
    dataDir: ''                       # default $DSH_HOME/sync ; repoDir defaults to <dataDir>/repo
```

A bad config fails at load: a remote with credentials in it, an `ext::`-style transport, a key pasted where a path belongs, `encryption: required` without `backend: encrypted` and both age settings, and a `repoDir` inside `sessionRoot` (or the reverse).

### Encryption: both ways, your choice

- **`encryption: optional`** (default): plaintext is allowed, but it is **never silent**: every `status`, `push` and `pull` prints a `PLAINTEXT` warning, and `backend: encrypted` that cannot encrypt (age missing, recipient or identity empty) carries on in plaintext **with the reason in the warning**.
- **`encryption: required`**: with `backend: encrypted`, if age and both keys are not fully set up, **nothing is sent and nothing is received**; the command says why. This is the setting to use when session text must not leave the machine in the clear.

Session logs hold everything said in a conversation, including anything pasted into it. With the encrypted backend the remote holds only `encrypted/**/*.age` files plus a `.gitignore`. **age keys:** create one key pair yourself (`age-keygen -o key.txt`, run by you; `brew install age` is also yours to run), put the **same key file** on every machine and point `ageIdentity` at it, and use its public key as `ageRecipient`. The key file never goes into the sync repository, and this plugin never reads or stores its content.

## Use

| Command | What it does |
| --- | --- |
| `/sync status` | Branch, remote (credentials redacted), ahead/behind, uncommitted files, fork files, transport (encrypted or PLAINTEXT), last pull and push. Local only: no network. |
| `/sync push` | Mirror sessions (and this machine's project list), commit, push. A rejected push pulls and retries once. |
| `/sync pull` | Fetch and merge, copy new and changed sessions into the live store, report other machines' projects. |
| `/sync projects` / `projects apply` | Show, or add, the projects other machines have (see below). |

Service `sync`: `status`, `statusText`, `push`, `pull`, `projects`, `applyProjects`, `settings`. There are no model-visible tools.

## What happens on a conflict (nothing is lost, but it is not merged)

Session logs only grow. Per file, three-way by bytes against the last common version: only one side changed means the other adopts it; **both sides appended** (or either rewrote it) means **your copy stays where it is and the other side is kept as a `...remote-fork-<time>-<device>` file** in the sync worktree (`<dataDir>/repo/sessions/...`). Fork files are never deleted, never written into the live session store, and not visible in dsh. So one session continued on two machines at the same time ends up as two lineages; continue a session on one machine at a time and push before you switch.

A live file that changed after it was mirrored (a session being written while you pull) is **left alone**; pull again when it is idle.

## Isolated conversations (Recon) are never synced (0.57.0)

Recon conversations are isolated: other add-ons leave them alone, and Sync never pushes or pulls them.

- **Which ones.** The Modes add-on decides. A conversation is isolated when Modes' settings list it in `sessionIsolated` (every conversation that began in an isolated mode, for good; Modes writes it at the first turn, and Rerun's copies carry it), or, for a conversation open in the app, when `modes.isolated(id)` says so. Not counted: a conversation Modes only locked because an isolated tab was chosen after it began elsewhere (its mode `isolated-late`, for example after the Cowork sidebar's "Move to Recon"): it holds nothing from that tab, so it is synced like any other, open or closed, and its stored mode in `sessionModes` does not change that. A helper (sub-agent) of an isolated conversation is isolated too: its stored header names its conversation as `parentSession` (read with the app's `sessionPersistence.list()`). In this app version only helpers carry that field (only copies made by older versions may still have it), so a copy of an isolated conversation is left out only when Modes has marked it, as Rerun's copies are. Files stay opaque bytes: a file belongs to a conversation by its place in the session store, `<project folder>/<conversation id>/…`, or `<conversation id>/<file>` in the old flat layout (`lib/isolation.mjs`).
- **Asked at the last moment.** Sync runs one operation at a time, so a push can wait behind a pull that is still fetching. Which conversations are isolated is asked inside that turn, right after the session store is listed and before anything is copied: a Recon conversation that begins while another operation runs is never sent with an old answer, and a file created after the listing waits for the next push. `/sync status` asks the same way.
- **Push and pull.** Their files are never copied into the sync worktree, so they are in no commit. Whatever the worktree holds of them (pushed by an earlier version, or brought in by a pull) is taken out, fork files included, and the next commit takes it off the remote's branch; the git history still holds it, because Sync never rewrites history. A pull never writes into an isolated conversation's files on this machine and never deletes them.
- **Another machine** that got such a conversation from an earlier version loses its copy at its next pull, like any session the remote deleted, if nobody changed it there; a copy that was changed there stays.
- **When nobody can say which conversations are isolated** (the Modes add-on is off, has not started yet, or the conversations cannot be listed), push and pull stop before anything is copied, removed or sent, and say why; `/sync status` copies nothing into the worktree and says "unknown, so push and pull wait". An automatic pull or push that meets this is skipped and logged. Turn Modes on, or try again a moment after the app starts.
- **Project manifest.** With `projects.sync`, this machine's manifest is written inside the same turn, after the isolated conversations are known (before, it was written before the push waited for its turn).
- `/sync status` shows how many isolated conversations are never synced; `/sync push` and `/sync pull` say how many of their files were left out or taken out.

## Projects (best effort)

With `projects.sync: true`, each machine writes one manifest of its projects (title and folder) into the sync repository (inside the encrypted tree when encryption is on), and never writes another machine's manifest, so manifests cannot conflict. After a pull, `/sync projects` lists the other machines' projects and what applying would do on this machine: **already here**, **can be added** (the folder exists here), **mapped folder does not exist here**, or **no mapping and no such folder here**. `/sync projects apply` (or `autoCreate: true`) adds the addable ones through dsh's project registry. `folderMap` translates one machine's folder prefix to this machine's. Nothing is ever deleted or renamed, and sessions are never touched.

**Important limit, found in the rehearsal:** dsh resumes a session only from the folder it was recorded in (`session ... was recorded in "<folder>", not "<folder>"`). So a session started on one machine can be continued on another **only if the same absolute folder path exists there**. `folderMap` registers a project but cannot change where a session was recorded (the log is opaque bytes and is not rewritten). Keep project folders at the same absolute path on every machine you sync, or accept that other machines can read but not resume those sessions.

## Changes from the original (all listed in `NOTICE`)

1. Encryption policy `optional` / `required`; plaintext never silent.
2. **Bug fixed:** the original's encrypted backend merged on pull but never copied the result into the live session store, so sessions from other machines never appeared.
3. **Bug fixed:** the age probe ran in a working folder that did not exist yet on a fresh machine, so age looked missing and the backend fell back to plaintext. The folder is now created first.
4. **Bug fixed:** every machine wrote its own id to one shared `device.txt`, so every pull reported a false conflict and made a fork file. The file is no longer written (the device id is already in fork file names).
5. Writes into the live session store are atomic, and a live file that changed after it was mirrored is skipped.
6. Project list sync with per-machine folder mapping (new).
7. Isolated conversations (Recon) are never pushed or pulled; push and pull wait while the Modes add-on cannot say which they are (new in Plus 0.57.0).
8. Removed: model tools (`sync_pull`, `sync_push`, `sync_status`), session-level forks, the confirmation gate (you typed the command), the storage-domain record (a small JSON state file instead), and every import of a dsh package (git and age run as plain child processes). Remote addresses with credentials or transport helpers are refused.

## Not tested, and risks

- **Real `age`** was not installed on the test Mac, so the encrypted paths were run with a **stand-in `age`** (a reversible script that marks and base64-encodes, not encryption). They prove the plugin's flow (nothing plaintext on the remote, policy blocks, restore); they do not test age itself or your keys.
- Only **local bare repositories** were used as the remote (no network, no hosting service, no ssh).
- Real models, the desktop app UI (sessions arriving while the app is open), and more than two machines were not tried.
- The first pull on a new machine copies sessions into its session store. Back that folder up first if it matters; installing this plugin is your step (see the main README).

## Checked

36 unit tests (25 before Plus 0.57.0; the isolation tests are listed under "Changes in Plus 0.57.0") with real git on temporary "machines" and a bare remote: config refusals, no remote, sessions both ways byte-identical and no false conflicts, the plaintext warning everywhere, append-both conflict kept as a fork file never written into the live store, push rejection recovery without forcing, restore skipping a live file that grew, restore leaving a conversation open in the app (its `session.lock`) for the next pull, an encrypted machine that pulled pushing again (two-parent merge commit), no re-encryption of unchanged files, a remote folder whose path has spaces, reserved folder never restored, `required` with age missing (the remote receives nothing), encrypted round trip (remote holds only ciphertext, secret text not found in it, pulled sessions arrive), `optional` degraded with a loud reason, project manifests (mapping, plan states, nothing created until asked, `autoCreate`, ciphertext only on the remote), auto push debounce (sub-agents and replayed history ignored), state file private and stable, no key text in saved files. **Live in real dsh headless (two throwaway homes sharing a bare remote):** a real session pushed from one home, pulled into the other (byte-identical zstd log), continued there with `--session-id`, pushed back, pulled and resumed on the first (byte-identical again); when both sides had continued the same session, the pull kept the local copy and made a fork file, as designed.

## Changes in Plus 0.57.0

- **Isolated conversations stay out** (see above). New file `lib/isolation.mjs`; `lib/mirror.mjs`, `lib/engine.mjs`, `lib/encrypted.mjs`, `lib/policy.mjs` and `lib/render.mjs` take the isolated conversations through mirror, merge, restore and prune. The policy hands the engine a getter (`isolation`), which the mirror asks inside the engine's lock right after it lists the session store (`fence`); an unknown answer stops the operation there. The project manifest is written inside the lock too (`beforeCommit`).
- **Tested (11 more, 36 in all), with real git on temporary machines and a stand-in Modes add-on:** which file belongs to which conversation (also the old flat layout) and which conversations are isolated (marked, open and isolated, helpers; a stored isolated mode alone does not count; a conversation moved into the Recon tab, open or closed, is not isolated; Modes missing; conversations that cannot be listed; marks made while the headers are listed count); asking never throws and anything unusable means "not known"; the mirror asks after it lists the store, and an unknown answer copies and removes nothing; an isolated conversation never reaches the remote (in no commit) or the other machine; one pushed by an earlier version leaves the remote's branch once it is known to be isolated, and the other machine's untouched copy goes; a pull never writes into an isolated conversation and does not keep it in the merge (the fast-forward case is handled in the code but not covered by a test); a helper is left out through its header and a Rerun copy through its mark; a conversation moved into the Recon tab after it ran stays on the remote and on the other machine; a Recon conversation that begins while a pull is fetching (a slow stand-in git) is not in the queued push, nor in any commit; without Modes nothing is pushed or pulled and status copies nothing; the same with the encrypted backend (no ciphertext of it on the remote, an earlier one taken off, nothing sent without Modes).
- **Not tested:** the desktop app with the real Modes and Recon add-ons (stand-ins only).

## Changes in Plus 0.8.0

- **Encrypted backend, push after pull:** a pull now records the remote head as a second parent. Before, the pull commit was not a descendant of the remote, so every later push from that machine was rejected as "remote moved".
- **Encrypted backend, no churn:** age output differs on every run, so each push re-encrypted (and re-committed) every session. A cache inside `.git` now skips files whose content did not change.
- **Open conversations:** a pull no longer replaces the files of a conversation that is open in the app (it holds a `session.lock`); they are listed as left alone and arrive on the next pull.
- **Paths with spaces:** an absolute folder path may now contain spaces, so a bare repository in iCloud Drive (`~/Library/Mobile Documents/com~apple~CloudDocs/...`) works as the remote. URLs still may not.
