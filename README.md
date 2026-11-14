# DeepSeek Harness Plus

Extra features for the **DeepSeek Harness** desktop app on the Mac: a MindsHub-style sidebar with Chat, Cowork and Code tabs, colour schemes (including MindsHub's navy and teal), work modes, model tiers, a blind model arena, agent swarms, deep research, a usage counter, benchmarks, syncing between Macs and more. Twenty-six add-ons in all, listed in [docs/ADD-ONS.md](docs/ADD-ONS.md).

The add-ons plug into the normal app. Nothing in the app itself is changed, so app updates do not wipe them, and you can remove them at any time.

You do not need to know how to code to install or use this.

---

## What you need

- A Mac with the **DeepSeek Harness** app in your Applications folder, version **0.2.2 or newer, below 0.3**.
- Open the app **once** before installing, so it creates its settings, then quit it.

## Install

1. Download the newest **`DS-Harness-Plus-<version>.dmg`** from the [Releases page](https://github.com/BLCKHWK60/DS-Harness-Plus/releases/latest) and double-click it. A window opens with everything in it: all the add-ons, the installer and this guide. (If you use git, clone the project instead; it is the same folder.)
2. In that window, double-click **`Install.command`**.
   - The first time, macOS may say it "cannot be opened because it is from an unidentified developer". If it does, **right-click** the file, choose **Open**, then **Open** again. You only do this once.
3. A Terminal window opens and walks you through it. If the app is open, it asks to quit it. When it says **Done**, open DeepSeek Harness.

Installing copies the add-ons into the app's own data folder (`~/.dsh/addons`), so you can eject the disk image and delete the download afterwards. To remove the add-ons later, open the disk image again and double-click **`Uninstall.command`**.

Before it changes anything, the installer saves your current setup under `~/.dsh/backups/deepseek-harness-plus/`. If any step fails, it puts everything back by itself.

**Terminal instead:** if you prefer, run this from the unpacked folder:

```bash
bash scripts/install.sh
```

## First steps

1. **Add your models.** Go to **Settings → Models** in the app. You can paste an API key for a provider there, or add your own server (for example a model server on another computer). No files to edit.
2. **Look at the new pages.** **Settings** now has **Colours, Model Tiers, Modes, Sampling, Usage, Benchmark, Arena** and **Swarm** pages. The chat box (where you type) gets one **model button** beside the send button, with the model list, an effort slider from Off to Ultra Code, tiers and sampling, and, once set up, a model-health dot.
3. **Switch on what you want.** Some add-ons work right away. The others do nothing until you give them a little setup, for example which models the arena should compare. [docs/ADD-ONS.md](docs/ADD-ONS.md) says which is which and how to set each one up.

### What works the moment you install

- **Cowork sidebar:** Chat, Cowork and Code tabs at the top of the left sidebar. Each tab lists only its own conversations and projects, and has its own sections: Model Arena under Chat, and Automation tasks, Connectors (your MCP servers, with on/off switches) and Skills under Cowork and Code. The start page gets a greeting and suggestion chips. A tab picks the mode of new conversations, so the chat box no longer needs a mode drop-down. To get the normal sidebar back, switch **Cowork sidebar** off on the **Plugins** page.
- **Colours:** pick a colour scheme in **Settings → Colours**: DeepSeek Harness (the stock colours, the default), MindsHub Cowork, Graphite or Forest, each in light and dark.
- **Modes:** Chat, Cowork and Code modes, switchable per conversation, plus **Search** and **Deep research** buttons in the chat box.
- **Model Tiers:** one model button in the chat box: pick any model and drag the effort slider. Five starter tiers (Fast, Balanced, Deep, Creative, Code review) work at once on whatever model you use. No model is preconfigured.
- **Code map:** a compact map of the project a conversation works in, so the assistant looks things up instead of reading whole files. Plus four "reverse engineer" skills. Nothing to install.
- **Privacy:** switches off the app's usage reporting and the upload of a conversation when you rate an answer. `/privacy` shows the state.
- **Usage counter:** counts requests and tokens per day and model (never your text).
- **Deep research** and **Code power:** new tools and skills the assistant can use.

Everything else stays switched off until you set it up.

## Changing an add-on's settings

Some add-ons have their own page in **Settings** (Tiers, Modes, Sampling). The rest are set up in the app's settings file. To edit it:

1. Quit DeepSeek Harness.
2. In Finder press **⌘ Shift G**, paste `~/.dsh/profiles/desktop/` and press Return.
3. Make a copy of **`cordis.patch.yml`** first, as your own backup. Then open the original with TextEdit.
4. Paste in the block for the add-on you want, from its section in [docs/ADD-ONS.md](docs/ADD-ONS.md). Fill in the parts in `<ANGLE BRACKETS>`, save, and open the app.

The file is indentation-sensitive: use spaces, never tabs, and keep the lines lined up as in the example. If the app will not start after an edit, put your copy back.

## Updating

Download the newer version and double-click **`Install.command`** again. It replaces the add-ons and keeps your settings.

## Removing

Double-click **`Uninstall.command`**. It removes all twenty-two add-ons and their files. Your conversations and your models are not touched. Any settings you wrote for the add-ons stay in the settings file and do nothing; if you install again, they come back into effect.

## Using it on a second Mac

1. Install the DeepSeek Harness app on the other Mac and open it once.
2. Run **`Install.command`** there too.
3. Add your models in **Settings → Models**.
4. Optional: to keep the same **settings** on both Macs, use iCloud Drive (below).
5. Optional: to see the same **conversations** on both Macs, set up the **Sync** add-on (see [docs/ADD-ONS.md](docs/ADD-ONS.md#sync)). It needs a private git repository that both Macs can reach. Neither Mac has to be switched on for the other to sync.

### Same settings on both Macs, through iCloud Drive

The **Shared settings** add-on keeps the settings you change in the app's own pages in one file, `settings.json`, in a folder in iCloud Drive. Those settings are Modes, Model Tiers, the Cowork tabs, Sampling presets and Colours. Change something on one Mac and the other Mac picks it up within about a minute. The file never holds secrets: API keys, tokens and passwords stay on each Mac.

1. On the first Mac, double-click **`Install.command`** and answer **y** when it asks *"Share settings through iCloud Drive?"*. It uses the folder **iCloud Drive → DeepSeek Harness Plus**.
2. On the second Mac, do the same. When the app opens there, it takes the settings from the file. Its own earlier settings are kept in `~/.dsh/shared-settings/backups`.

To use another folder, or from Terminal: `bash scripts/install.sh --settings "<folder>"`. To stop sharing on one Mac: `bash scripts/install.sh --no-settings`. Type `/shared-settings` in a conversation to see what is shared and when it last synced.

**Good to know:**
- Not shared:
  - which conversation sits in which tab;
  - the tier a conversation uses;
  - which add-ons are switched on;
  - settings written by hand into the settings file rather than in a Settings page.
- If you change the same setting on both Macs at once, the copy in iCloud wins. The other value is kept in the backups folder.
- iCloud sometimes makes a copy such as `settings 2.json` when both Macs write at the same moment. `/shared-settings` tells you if one appears; check it, then delete it.

## Giving it to someone else

Send them the link to this project, https://github.com/BLCKHWK60/DS-Harness-Plus. They follow **Install** above. Nothing in here contains your addresses, keys or personal settings; every add-on starts empty.

## If something goes wrong

- **"DeepSeek Harness is not installed"**: the app must be in `/Applications` or `~/Applications`.
- **"No 'desktop' setup found"**: open the app once, quit it, and run the installer again.
- **"version ... works with version 0.2.2 up to 0.3"**: your app is newer or older than this release supports. Look for a newer DeepSeek Harness Plus.
- **The installer stopped with a problem**: it has already put everything back. The message names a log file; send that file to whoever helps you.
- **The app misbehaves after installing**: run **`Uninstall.command`**. Every install and uninstall also leaves a dated copy of your setup files in `~/.dsh/backups/deepseek-harness-plus/`, in case someone helping you needs them.
- **The app will not start after you edited the settings file**: put back the copy you made before editing.

## What is in this folder

| Folder or file | What it is |
| --- | --- |
| `Install.command`, `Uninstall.command` | Double-click to install or remove. |
| `addons/` | The add-ons. Each has a `README.md` with its full technical notes. |
| `docs/ADD-ONS.md` | What each add-on does and how to set it up. |
| `docs/HOW-IT-WORKS.md` | For technical readers: how the install works, how to test, how to change an add-on. |
| `templates/` | Optional ready-to-fill examples: model servers, memory, MCP tool servers, backups. |
| `extras/dsh-intel-mcp/` | Optional Python tools (code map, reverse engineering, context store). Needs Python; not installed automatically. |
| `scripts/` | What the `.command` files run. |
| `VERSION` | This release's version number. |
| `LICENSE` | The MIT licence: anyone may use, change and share this. |

## Status

Release 0.40.4 (the version in `VERSION`). Tested so far:

- **Install, update and uninstall:** run on a fresh setup and on a copy of a real, long-used setup.
- **Live start:** the app starts with every add-on loaded.
- **Add-ons:** each has its own automated tests, and each settings page was checked in the app's web version.
- **Not yet tested on another person's Mac.** Each add-on's `README.md` lists what was and was not verified for it.
