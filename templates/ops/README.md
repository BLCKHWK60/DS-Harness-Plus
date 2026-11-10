# Ops: schedules, notifications, backups

Three parts. The first is documentation of a dsh feature, the second is a plugin (`addons/dsh-notify`), the third is a script. **Nothing is preset**: no folder, time or command is chosen for you.

## 1. Scheduled operations (built into dsh; nothing added here)

dsh's `schedule` service stores tasks on the Host. In the web app, the **Automation tasks** page lists, creates, edits, pauses and resumes them and has **Run now**; the model can do the same with `schedule_create`, `schedule_list`, `schedule_view` and `schedule_edit`. Example: ask "Every weekday at 09:00, run <instruction>" and check the returned task (name, repeat rule, destination).

What to design around:
- **The Host must be running.** The Host is the machine whose dsh app or `dsh web` is open. Pick the always-on Mac for tasks you rely on.
- **After a restart only the latest missed run fires**, not every one you missed.
- A task delivers its instruction to a conversation: an existing one, one conversation reused for every run, or a new conversation per run. The record only confirms the instruction **reached the conversation**; read the conversation for the result.
- A scheduled run is an ordinary turn, so **turn-end notifications (part 2) cover it**, and so does the usage ledger.

Not tested here: creating a real task and waiting for it to fire (needs the app and real time). Check once: create a task for a minute ahead, with the Host running, and look at the conversation.

## 2. Notifications (`addons/dsh-notify`)

dsh has no desktop notifications. `@local/dsh-notify` runs a command **you list** when a top-level turn ends (optionally only if it took at least N seconds) or when dsh asks you to approve a tool call. See that plugin's README. A macOS example, to paste and adjust (the message arrives in an environment variable, never inside the script text):

```yaml
- id: notify
  config:
    rules:
      - id: done
        on: turnEnd
        reasons: [completed, error]
        minSeconds: 20
        command: [osascript, -e, 'display notification (system attribute "DSH_NOTIFY_MESSAGE") with title "dsh"']
      - id: ask
        on: approval
        command: [osascript, -e, 'display notification (system attribute "DSH_NOTIFY_MESSAGE") with title "dsh" sound name "Ping"']
```

Run `/notify test` to see one. For a phone or another machine, point `command` at `curl` to an ntfy-style service **you** choose; this plugin does not pick one.

## 3. Backups (`dsh-backup.sh`)

A dated copy of a dsh home folder, with pruning. It **only reads the source** and writes only inside `--dest`.

```sh
sh dsh-backup.sh --dest <ABSOLUTE_FOLDER> [--keep 14] [--max-attachment-mb 25] [--source <DSH_HOME>] [--include-profile-config] [--dry-run]
```

- Result: `<DEST>/dsh-YYYY-MM-DD`, built as a `.partial` folder and renamed when complete; a same-day rerun replaces that day's folder; then all but the newest `--keep` folders named exactly `dsh-YYYY-MM-DD` are removed. Other files and folders in `--dest` are never touched.
- Default source is `$DSH_HOME`, else `~/.dsh`. `--dest` is required and must be absolute; it must not be inside the source, and the source must not be inside it. A lock folder stops two backups from overlapping.
- **Left out:** `dsh-runtimes/`, every `node_modules/` (this alone is most of a profile: 342 MB of 342 MB in one live profile), attachments larger than `--max-attachment-mb`, and the **profile config files** (`profiles/*/cordis.patch.yml`, `cordis.yml`, `package.json`).
- **Why the profile config is left out:** it can hold plaintext keys or tokens, and a backup in a cloud-synced folder would copy them there. `--include-profile-config` copies them anyway and prints a warning; keep such a backup out of synced and shared folders. Keep the profile config safe another way (it is small).
- **Session logs are copied as they are** and hold whatever was said in your conversations, including anything pasted into them. Treat the backup folder as private.
- Restoring is a manual copy of what you need back into the dsh home; runtimes and `node_modules` are rebuilt by dsh.

### Nightly with a LaunchAgent

`dsh-backup.plist.template` has `__PLACEHOLDERS__` for the label, script path, backup folder, keep count, time and log file. Fill them in, save the result as `~/Library/LaunchAgents/<LABEL>.plist`, then load it yourself:

```sh
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/<LABEL>.plist
```

Test it first with `--dry-run` and then once by hand. A Mac that is asleep at the set time runs the job when it wakes. Remove it with `launchctl bootout gui/$(id -u)/<LABEL>`.

### Checked

`sh check.sh` builds a made-up dsh home in a temp folder and runs 26 checks: dated folder, exclusions (runtimes, nested `node_modules`, an attachment over the limit whose name has brackets, profile config with a fake secret that must appear nowhere in the backup), the source unchanged, pruning to N with unrelated folders untouched, same-day rerun, `--include-profile-config` and its warning, `--dry-run` writing nothing, and refusals (no `--dest`, dest inside source, source inside dest, relative dest, `--keep 0`, missing source, held lock). It never touches `~/.dsh`. A real read-only copy of the live `~/.dsh` into a temp folder (31 MB, no profile config, source untouched, temp copy deleted) also worked. Not tested: a real LaunchAgent run, restoring.
