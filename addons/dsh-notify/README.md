# Notify

Host plugin `@local/dsh-notify` (dsh 0.2.2-rc.1). dsh has no desktop notifications; this runs a command **you list** when something happens. **Nothing is configured by default**: with no rules it does not even listen.

## Configuration

```yaml
- id: notify
  config:
    rules:
      - id: <ID>
        on: turnEnd                       # turnEnd | approval
        reasons: [completed, error]       # turnEnd only: completed | error | aborted | blocked | interrupted
        minSeconds: 0                     # turnEnd only: skip turns shorter than this
        topLevelOnly: true                # ignore sub-agent turns
        minIntervalSeconds: 5             # at least this long between two runs of this rule
        timeoutMs: 5000                   # the command is killed after this
        command: [<PROGRAM>, <ARG>, ...]
    maxPerMinute: 20                      # across all rules
    commandName: notify
```

- `turnEnd` fires when a top-level turn ends. A scheduled run is an ordinary turn, so it is covered. `approval` fires when dsh asks you to approve a tool call (for example one asked by the media-tools gate).
- A rule with a bad or empty `command`, an unknown reason or a duplicate id fails at load.

## The command

It runs **without a shell** (`execFile`): `command[0]` is the program, the rest are its arguments. The message is fixed generic text, for example `Finished in <project folder name>`, `Stopped with an error in <project>`, `Waiting for your approval (<tool name>) in <project>`; **it never contains your prompt, the model's words or the approval reason**.

The command gets these environment variables, which is the safe way to use them (for example in AppleScript through `system attribute`): `DSH_NOTIFY_MESSAGE`, `DSH_NOTIFY_EVENT`, `DSH_NOTIFY_REASON`, `DSH_NOTIFY_TOOL`, `DSH_NOTIFY_PROJECT` (control characters removed, at most 200 characters). Arguments may also contain `{message}`, `{event}`, `{reason}`, `{tool}`, `{project}`; those values are cut to 120 characters of letters, digits and `space . _ : / - ( ) ,` (anything else becomes `?`), so a project folder named with quotes cannot inject into a script. Prefer the environment variables.

macOS example:

```yaml
command: [osascript, -e, 'display notification (system attribute "DSH_NOTIFY_MESSAGE") with title "dsh"']
```

## Safety and behaviour

- Never blocks a turn: the command runs in the background; a failure or timeout is counted and logged, not raised.
- Flood control: `minIntervalSeconds` per rule and `maxPerMinute` overall.
- Events replayed from history (resuming a session) do not notify.
- `/notify` shows rules and counts (started, failed and the last error code, skipped by the rate limit); `/notify test [rule]` runs a rule with a sample event and ignores the rate limits. Service `notify`: `rules`, `test`, `stats`.

## Checked

13 unit tests (helpers, config refusals, no listener without rules, args and environment, reasons, `minSeconds`, sub-agents ignored, approval without the reason text, injection attempt in the project folder and tool name, rate limits, failure and slow command not blocking, replay ignored, `/notify`). Live in a real dsh headless profile with a recording script: a plain turn gave `Finished in <folder>` and the project name came from the session's working folder; an approval asked by the media-tools gate gave `Waiting for your approval (bash) in <folder>` and then the turn end. Not tested: a real macOS banner (the recording script stood in for `osascript`), the app UI, phone notifications.
