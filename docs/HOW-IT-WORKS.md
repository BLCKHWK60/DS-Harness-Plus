# How it works (for technical readers)

## The pieces

DeepSeek Harness (dsh) is built on the Cordis plugin framework. The desktop app boots a **profile**, `~/.dsh/profiles/desktop`, made of:

- `package.json`: the profile's plugin dependencies, plus `dsh.profile.bundles`, the ordered list of **bundles** (packages that contribute a patch layer).
- `cordis.patch.yml`: the user's own layer, applied after every bundle. A row here with the same `id` as a bundle's row replaces that row's `config`.

Each add-on in `addons/` is a bundle: a package with `dsh.bundle.patch` pointing at its own `cordis.patch.yml`, which inserts one row with safe defaults (mostly "do nothing until configured"). Eight add-ons also have a browser half (`client.js`, declared under `dsh.client`) that adds a Settings page or a chat-box control. Live data reaches those pages through small read-only `GET` routes registered on the app's web server behind its login and Host/Origin checks (`/dsh-<add-on>/...`). They never serve keys or prompt text.

The add-ons are plain JavaScript (ES modules for the host half, the lazy-CJS client format for the browser half). Nothing needs building. Each add-on carries its own copy of two small MIT libraries (`schemastery`, `cosmokit`) in `node_modules/@deepseek-ai/`; those folders are part of the source and are committed on purpose.

## What the installer does

`scripts/install.sh`:

1. Finds the app and checks `dsh --version` is within `>=0.2.2-rc.1 <0.3.0`, the `engines.dsh` range every add-on declares.
2. Asks to quit the app (only when the target is the real `~/.dsh`).
3. Copies `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `cordis.patch.yml` and `cordis.yml` to `~/.dsh/backups/deepseek-harness-plus/<time>-install/` (mode 700, because the patch file may hold credentials).
4. Copies `addons/` (minus tests) to `~/.dsh/addons/deepseek-harness-plus/`, swapping the previous copy aside.
5. Runs `dsh plugin --profile desktop add <every add-on folder>`. That is pnpm in the profile directory: it links each folder (`link:`) and appends each package to `dsh.profile.bundles`. It works offline.
6. Checks that every package is linked to the new folder and listed as a bundle. On any failure it restores `package.json` and the lockfile, runs `dsh plugin install` to re-sync, and puts the previous add-on copy back.

It never edits `cordis.patch.yml`. Re-running it is the update path: the same package names point at the same folder, which now holds the new files.

`scripts/uninstall.sh` runs `dsh plugin --profile desktop remove <names>` for whichever Plus packages the profile lists, then deletes the add-on folder. User rows for removed add-ons stay in `cordis.patch.yml`. dsh treats a patch row whose target is missing as a warning (`patch: entry "<id>" not found`), not an error, so the app still starts, and a reinstall picks the rows up again.

Both scripts take `--profile <name>` and honour `DSH_HOME`, which is how `scripts/check.sh` rehearses everything in a throwaway folder.

## Checking a change

```bash
bash scripts/check.sh
```

This runs every add-on's tests with the Node.js inside the app, then installs, re-installs and uninstalls in a throwaway `DSH_HOME` and composes the profile (`dsh --profile check --dump-config`). It never touches `~/.dsh`.

To try a change in the real app, edit the files in `addons/`, run `Install.command` again and restart the app. The browser halves are only re-read when the app starts.

Rules worth keeping:

- **Never test against `~/.dsh`.** Set `DSH_HOME` to a temporary folder for every `dsh` command, even `--help`, because the launcher creates profile files on first use.
- **No user-specific defaults.** Add-ons ship with empty or placeholder configuration: no addresses, model ids, key names or paths.
- **Secrets by name only.** Configuration refers to an environment variable or credential reference, never a key value.
- Settings pages can only write `.volatile()` config fields (dsh's settings forms expose nothing else), and a write is refused for a row supplied by a `--patch` overlay instead of the profile.

## Known limits

- Most add-ons are configured by editing YAML. Only Model Tiers, Modes and Sampling presets have editable Settings pages. The app's Plugins page can host a per-add-on configuration page (`plugins.row.config` slot); none of the add-ons uses it yet.
- Plugins outside the dsh repository cannot add events to a conversation, so progress views (swarm, arena, benchmark) live in Settings, not in the chat.
- Tested on dsh 0.2.2-rc.1 on Apple Silicon macOS. Each add-on's README lists what was and was not verified.
