# Shared settings (Experimental)

> **Experimental: tried only on one Mac so far.** It is off until you choose a folder, and nothing turns it on for you. Try it with a copy of your settings in mind: before it replaces anything on a Mac, that Mac's own values are saved in `<dsh home>/shared-settings/backups`.

Host plugin `@local/dsh-shared-settings` (dsh 0.2.2-rc.1). It keeps the settings you change in the app's own pages in one file, `settings.json`, in a folder you choose. With the folder in iCloud Drive, two Macs share one setup.

## What is shared

The add-on reads and writes through the app's own settings service (`ctx.get('settings')`: `describe`, `replace` and the `settings/document-updated` event). It therefore sees exactly the settings a Settings page can change, which the app calls *volatile* fields. In Plus 0.9.0 those are:

| Entry | Fields |
| --- | --- |
| `modes` | `modes`, `defaultMode` |
| `model-tiers` | `tiers`, `customTiers`, `modelProfiles`, `projectProfiles`, `fallbackChains`, `roleModels`, `maxSubagents`, `ultraAutoDelegate` |
| `cowork-shell` | `tabs`, `maxTabs` |
| `sampling-presets` | `presets`, `categories`, `byMode`, `defaultCategory`, `perModel`, `strategy` |
| `color-schemes` | `scheme`, `custom`, `opaqueMacSidebar` |

Only values you set are shared, not defaults.

By default every Plus entry (package `@local/dsh-*`) is shared. Four are never shared:
- `dsh-sync`, because it holds paths and keys for one Mac;
- `dsh-recon` and `dsh-notify`, because they hold private setup and addresses;
- this add-on.

The `include` setting adds other entries, for example the app's own `ui-theme`. The `exclude` setting leaves entries out.

**Never in the file:**
- Fields the app's schema marks as secret.
- Any field whose name looks like a key, token, secret, password, passphrase or credential, at any depth.
- Anything about this Mac rather than your setup, whatever `skipFields` says and at any depth: on/off switches (`enabled`), folders and program paths (names ending in Folder, Dir or Path), servers, hosts and ports, notification topics, permission and "danger" switches (names starting with `danger` or `allow`, and `trusted`, `anywhere`), and anything per conversation (names starting with `session`).
- Recon and Notify are not shared at all: Recon's private setup (search engine, news accounts, VPN names, folders) and the alert addresses stay on each Mac.
- The fields in `skipFields`. By default these are the per-conversation choices:
  - `modes.sessionModes`, `sessionWeb` and `sessionResearch`;
  - `modes.sessionIsolated`, `sessionSearchDepth`, `sessionDepth` (each conversation's Depth), `sessionLens` (each conversation's Lens), `depthMoved` (whether this Mac's old Web levels were moved into Depth), `sessionTools`, `sessionHelpers`, `sessionToolSets`, `sessionSandboxBase` (each conversation's earlier access level), `toolAccess` and `toolAccessOn` (which tools each tab may use, and whether Tool access is on) and `extraModes` (the tabs this Mac's add-ons add); and the Skill architect's `skill-architect.nolearn` (the conversations you marked "never learn from this"); and Settings Plus's `settings-plus.view` (Simple or Advanced) and `settings-plus.setupPending` (this Mac's first-run card), so each Mac keeps its own;
  - `model-tiers.activeTiers`, `sessionProfiles` and `modelProfilesMigrated`.

  The twelve `modes` fields on the second line stay on each Mac even when you set your own `skipFields`.

All of these stay on each Mac and are kept as they are when the file is applied.

**Not shared at all:**
- Settings that no Settings page can change. These are written by hand in `cordis.patch.yml`, for example swarm budgets or notify targets.
- Which add-ons are switched on.

## How it syncs

A sync round compares three versions of each field (top-level key) of each entry:
- this Mac's value;
- the file's value;
- the value at the last sync, kept as digests in `<dsh home>/shared-settings/state.json`.

The outcome:
- **Changed on one side only:** that side wins.
- **Changed on both sides:** the file wins, and the warning lists the field.
- **No sync record yet:** the file wins. This is a new Mac joining.

Before a section is replaced, this Mac's values for it are saved in `<dsh home>/shared-settings/backups`, newest 30 kept. Sections for entries this Mac does not have stay in the file untouched.

A round runs:
- 1.5 s after any Settings change;
- 1 s after the folder changes, through a folder watcher (iCloud replaces files by renaming them);
- every `pollSeconds`;
- on `/shared-settings now`.

Rounds never overlap.

**Writing safely:**
- The file is written to a temporary file in the same folder, then renamed into place.
- Just before writing, the file is read again. If it changed since the round began, the round starts over, up to three times, instead of overwriting.
- A file that is not valid JSON, or was written by a newer format, is never overwritten. The round stops and reports it.

**iCloud:**
- If iCloud has only a placeholder (`.settings.json.icloud`), the add-on asks `brctl download` for the file and waits.
- iCloud conflict copies such as `settings 2.json` are reported. They are not used.

## Configuration

```yaml
- id: shared-settings
  config:
    folder: ''            # absolute path or ~/...; '' = the folder the installer recorded, or off
    include: []           # extra entry ids to share (e.g. ui-theme)
    exclude: []           # entry ids never to share
    skipFields: [...]     # '<entry id>.<field>'; default: the per-conversation fields above
    pollSeconds: 30
    commandName: shared-settings
```

The folder is chosen in one of two ways:
- `Install.command` asks, and uses `iCloud Drive/DeepSeek Harness Plus`.
- `bash scripts/install.sh --settings "<folder>"` uses the folder you name.

Either way, the installer writes it to `<dsh home>/shared-settings/folder.txt`. `--no-settings` removes that file and leaves the shared file alone. A `folder` setting overrides the file. A `folder` that is not absolute switches the add-on off and logs a warning; it does not fall back to the file.

## Use

- `/shared-settings` shows the file, the last round's result, what is shared, and any problem or conflict.
- `/shared-settings now` runs a round straight away.

## Verified

- 13 unit tests, with a stand-in for the app's settings service and two simulated Macs on one folder. They cover:
  - the first Mac writing the file;
  - a second Mac adopting it, keeping its secrets and per-conversation fields, with a backup;
  - edits both ways, including a reset to default;
  - a quiet round that changes nothing;
  - simultaneous edits to different fields and to the same field;
  - a hand edit of the file;
  - a broken file and a newer-format file;
  - a missing folder and an iCloud placeholder;
  - a write racing another Mac;
  - conflict copies;
  - an entry the app refuses;
  - folders with spaces;
  - secret scrubbing.
- In the app's web version, in a throwaway setup:
  - the first round wrote the five sections, with no secrets and no per-conversation fields;
  - a hand edit of `defaultMode` in the file reached the profile within seconds, with a backup, and the per-conversation fields were left alone;
  - choosing the Forest colour scheme in Settings reached the file within seconds;
  - `/shared-settings` answered.

## Not verified

- Two real Macs through real iCloud Drive. The lab used a local folder. iCloud's own timing, placeholders and conflict copies were simulated in the unit tests only.
- The `brctl download` request.
