# Privacy

Plugin `@local/dsh-privacy` (dsh 0.2.2-rc.1). It switches off the app's two reporting channels to its maker, and `/privacy` shows whether they are off. It works at once; there is nothing to set up.

## What it switches off

| Channel | What the app sends by default | How it is switched off |
| --- | --- | --- |
| **Conversation upload on feedback** | When you rate an answer (thumbs up or down) or use `/feedback`, the conversation up to that point is uploaded, unredacted, for any model including local ones, with an anonymous install id | The app's `session-telemetry-otel` row is disabled. This is exactly what the app's own `DSH_TELEMETRY_DISABLED` switch does |
| **Usage events** (desktop app only) | An event for each message sent, with the model name, effort, mode, a conversation id, device and account ids, app version, and the Mac's processor, memory and macOS version; also model, mode and plugin changes. No prompts or answers | The app's `product-analytics` setting `enabled` is set to `false`, the app's own off value. With it off the app collects no environment data, reads no identity and accepts no events |

Both are done by this add-on's `cordis.patch.yml`, so they are part of the Plus install and are undone by switching the add-on off on the Plugins page (and restarting the app) or by uninstalling Plus. You can still rate answers; the rating then stays on your Mac.

## What stays on

These are not reporting, and this add-on leaves them alone:

- **Update checks** to the app's download server (app version and platform).
- **Your DeepSeek sign-in** and the balance in the sidebar, while you are signed in. Sign out if you use no DeepSeek cloud models.
- **The plugin list**, fetched from the addresses in your plugin-market setting.
- **Web search and fetch**, when a conversation uses them: the search words and page addresses go to the search service you chose.
- **Any cloud model you pick**: its provider receives the conversation, as with any cloud model.

With a local model, prompts and answers go only to your model server. Conversation titles are written by the conversation's own model.

For certainty about every connection, use a firewall app such as Little Snitch or LuLu.

## `/privacy`

Prints the live state of both channels, read from the app's loaded rows, and lists what stays on. The same check runs three seconds after the app starts and writes one line to the log: information when both are off, a warning otherwise. Service `privacy`: `state()` returns `{feedbackUpload, usageEvents, lines}`.

## Checked

- Unit tests (3): each "off" value is recognised, rows that are on are reported as on, and the bundle patch contains both switches.
- In a throwaway profile, the app's composed setup (`--dump-config`) before and after installing: `session-telemetry-otel` gained `disabled: true` ("patched by @local/dsh-privacy"), and `product-analytics` went from `enabled: true` to `enabled: false`.
- `/privacy` typed in a chat in the web lab reported both channels off.

**Not checked:** the network traffic itself was not captured, so "off" rests on the app's own switches doing what its code says. The usage-events row only runs in the desktop app, and the lab is the web version, so that switch was verified in the composed setup, not on a running desktop app. This was read from app version 0.2.2-rc.1; a later version could add or rename a channel, and `/privacy` would then still say "off" for a row it does not know. Re-check after an app update.
