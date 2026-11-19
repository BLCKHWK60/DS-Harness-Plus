# DeepSeek Harness Plus

Extra features for the **DeepSeek Harness** desktop app on the Mac: a tabbed sidebar with Chat, Cowork and Code tabs, colour schemes (including Harbor's navy and teal), work modes, model tiers, a blind model arena, agent swarms, deep research, a usage counter, benchmarks, syncing between Macs, a searchable Settings window and more. Forty-eight add-ons in all, described in [docs/ADD-ONS.md](docs/ADD-ONS.md). Every mode, its tools, its instructions and its settings are described in [docs/MODES-AND-SETTINGS.md](docs/MODES-AND-SETTINGS.md).

The add-ons plug into the normal app. Nothing in the app itself is changed, so app updates do not wipe them, and you can remove them at any time.

You do not need to know how to code to install or use this.

**Not affiliated with DeepSeek.** DeepSeek Harness Plus is an independent project by a private person. It is not made, checked or endorsed by DeepSeek or the makers of the DeepSeek Harness app. "DeepSeek" is the name of their products and is used here only to say which app these add-ons are for. You use the add-ons and any model service you connect at your own risk, and a model service charges you for what you use.

---

## Quick start

1. **Install the DeepSeek Harness app** (version 0.2.2 or newer, below 0.3), open it once, then quit it.
2. **Install Plus.** Download the newest `DS-Harness-Plus-<version>.dmg` from the [Releases page](https://github.com/BLCKHWK60/DS-Harness-Plus/releases/latest), open it, and double-click **`Install.command`**. If macOS blocks it, follow [Install](#install) below: it takes one extra minute, once.
3. **Get a DeepSeek key.** Sign in at [platform.deepseek.com](https://platform.deepseek.com), open **API keys**, create a key and copy it. Keep it private: it is like a password, and using it costs money.
4. **Paste it in the app.** Open DeepSeek Harness, go to **Settings → Models**, add DeepSeek and paste the key.
5. **Ask something.** Start a new conversation and type a question. That is all: the extra tabs and settings can wait.

<!-- Screenshot to add: docs/images/quick-start-models.png (Settings → Models with the key box) -->

---

## Words used in this guide

- **Add-on:** one extra feature that Plus puts into the app. Plus is a set of 48 of them. Some work as soon as they are installed; the others stay off until you switch them on.
- **Mode:** the way a conversation works. Chat answers in one reply. Cowork and Code can use tools, read and change files and run commands. Finance, Data, Research, Scout and Recon are more modes, each for one kind of job.
- **Tab:** a button at the top of the left sidebar, one for each mode. A tab shows only its own conversations. A new conversation starts in the mode of the tab you are in.
- **Conversation:** one thread with the assistant, from your first message on. It keeps its own mode, model and settings.
- **Workspace (project):** a folder of yours that a conversation may work in. **Scratch** is the exception: a private folder with no link to your own files.
- **Model:** the AI service that answers. You add models yourself in Settings → Models.
- **Tier:** a saved choice of model, effort and rules, such as Fast or Deep. You pick it from the model button in the chat box.
- **Depth:** how much work a conversation gets: Quick, Standard or Thorough.
- **Tool:** something the assistant can do besides writing text, such as searching the web or reading a file.
- **Helper:** a second assistant that the first one starts for a part of the job.
- **Tier of an add-on (Core, Beta, Experimental):** how well tested it is. Core is the polished set; Experimental is for people who like to try things and may change or fail.

---

## What you need

- A Mac with the **DeepSeek Harness** app in your Applications folder, version **0.2.2 or newer, below 0.3**.
- Open the app **once** before installing, so it creates its settings, then quit it.

## Install

1. Download the newest **`DS-Harness-Plus-<version>.dmg`** from the [Releases page](https://github.com/BLCKHWK60/DS-Harness-Plus/releases/latest) and double-click it. A window opens with everything in it: all the add-ons, the installer and this guide. (If you use git, clone the project instead: `bash scripts/install.sh` works from the clone. The Recon add-on has its own installer there too: `bash recon-kit/scripts/recon-install.sh`.)
2. In that window, double-click **`Install.command`**.
3. **If macOS blocks it.** The disk image is not signed with an Apple developer certificate yet, so macOS 15 (Sequoia) and later stop `Install.command` with a message such as "Apple could not verify it". Right-click → Open no longer gets past this. Do this instead, once:
   1. Click **Done** (not "Move to Trash") on the message.
   2. Open **System Settings → Privacy & Security** and scroll down to the **Security** section. It says "`Install.command` was blocked to protect your Mac".
   3. Click **Open Anyway**, then enter your Mac password or use Touch ID.
   4. Double-click **`Install.command`** again and choose **Open** in the window that follows.

   <!-- Screenshot to add: docs/images/install-blocked.png (the macOS message) -->
   <!-- Screenshot to add: docs/images/open-anyway.png (System Settings → Privacy & Security → Open Anyway) -->

   You only do this once. Older macOS versions still let you right-click the file and choose **Open**.
4. A Terminal window opens and walks you through it. If the app is open, it asks to quit it. **The first time, it asks which add-ons you want** (see [Which add-ons you get](#which-add-ons-you-get)). When it says **Done**, open DeepSeek Harness.

Installing copies the add-ons into the app's own data folder (`~/.dsh/addons`), so you can eject the disk image and delete the download afterwards. To remove the add-ons later, open the disk image again and double-click **`Uninstall.command`**.

Before it changes anything, the installer saves your current setup under `~/.dsh/backups/deepseek-harness-plus/`. If any step fails, it puts everything back by itself.

**Terminal instead:** if you prefer, run this from the unpacked folder:

```bash
bash scripts/install.sh
```

Add `--core` or `--everything` to answer the question in advance, and `--yes` to answer every question with yes (without `--core` or `--everything`, `--yes` means the Core set).

### Which add-ons you get

The first time you install, the installer asks:

1. **Core set (recommended).** The finished add-ons, switched on. The Beta add-ons are copied too, but stay off.
2. **Everything.** The Core set and the Beta add-ons, plus the **Experimental** add-ons. Experimental means little tested: it may change, be slow, or fail. Each one is labelled *Experimental* and **stays off until you switch it on** in the app, on the **Plugins** page.

Beta add-ons work, but are new. They are labelled *Beta* and also stay off until you switch them on. **Recon** is not in either choice: it is a separate download (below).

**If you already have Plus installed, the choice does not change anything you have.** An update never switches an add-on on or off, and never removes one. Running the installer again with `--everything` only adds the Experimental add-ons you are missing, switched off. To take one away, switch it off on the Plugins page.

<!-- tiers:start (made from addon-tiers.json by scripts/dev-tiers.mjs; do not edit by hand) -->

**Core: finished, on by default (29)**

| Add-on | Why |
| --- | --- |
| Activity | Finished and tested: a small indicator of what the assistant is doing. |
| Alerts | Finished and tested: shows how scheduled tasks ended. |
| Balance | Finished and tested: shows your DeepSeek balance. |
| Benchmark | Finished and tested: compares models on your own questions. |
| Budget | Finished and tested: limits that stop a runaway task. |
| Code map | Finished and tested: a compact map of your project. |
| Code power | Finished and tested: code review and fix skills. |
| Colours | Finished and tested: colour schemes for the whole app. |
| Cowork sidebar | Finished and tested: the Chat, Cowork and Code tabs. |
| Deep research | Finished and tested: parallel research with checked sources. |
| Diagrams | Finished and tested: drawn diagrams from a description. |
| Learned skills | Finished and tested; nothing is installed without your approval. |
| Learning | Finished and tested: a tutor that makes you do the thinking. |
| Library | Finished and tested: search your own documents. |
| Mac tools | Finished and tested: Spotlight and Shortcuts, only in folders you allow. |
| Memory | Finished and tested: lasting facts about you. |
| Mission | Finished and tested: a goal worked on by several models. |
| Model arena | Finished and tested: a blind comparison of models. |
| Model Tiers | Finished and tested: the model button and tiers. |
| Modes | Finished and tested: Chat, Cowork and Code modes. |
| PDF reader | Finished and tested: reads PDFs with the Mac's own tools. |
| Privacy | Finished and tested: switches off the app's reporting. |
| Role prompts | Finished and tested: your own instruction sections. |
| Sampling | Finished and tested: temperature and length presets. |
| Search | Finished and tested: find conversations with Cmd-K. |
| Self-improvement | Finished and tested; every change needs your approval. |
| Settings Plus | Finished and tested: groups and searches the Settings window. |
| Sync | Finished and tested: conversations between Macs through your own git repository. |
| Usage | Finished and tested: counts requests and tokens. |

**Beta: installed but off until you switch it on (5)**

| Add-on | Why |
| --- | --- |
| Artifacts | Works, but its privacy rules for private conversations were fixed only recently. |
| Content | Works, but is new and has had little use by people other than its maker. |
| Data | Works, but is new and has had little use by people other than its maker. |
| Finance | Works, but gives market views, so it starts off and shows a warning first. |
| Research | Works, but is new and has had little use by people other than its maker. |

**Experimental: only with "Everything", off until you switch it on (13)**

| Add-on | Why |
| --- | --- |
| Agent swarm | Many helpers at once can spend a lot quickly and has had little real-world testing. |
| Context saver | Needs separate Python tools and changes what the assistant sees; not yet proven. |
| Creator Plus | Builds and changes add-ons itself, so a mistake can break other add-ons. |
| Devices | Controls boards, phones and routers; only tested with stand-ins, not with real devices. |
| Engines | Has never been run with a real outside engine. |
| Media tools | Image tools for an outside service; little tested and it can cost money. |
| Model router | Picks the model for you each turn; costs and results are hard to predict. |
| Notify | Runs a command you write when a turn ends; being merged into Alerts. |
| Route health | Moves a conversation to another model by itself when one is down; not proven. |
| Scout | Searches for work on outside sites; little tested. |
| Shared settings | Tried on one Mac only; a wrong merge could overwrite settings on another Mac. |
| Split Plus | Several conversations in one window; not yet tried in the desktop app. |
| Tuner Plus | Collects training rows from your work; new and not yet proven. |

**Separate download (1)**

| Add-on | Why |
| --- | --- |
| Recon | Reaches Tor and Usenet, so it is a separate download with its own warning. |

<!-- tiers:end -->

### Recon: a separate download

Recon can search `.onion` sites through Tor and read Usenet newsgroups. Because of that it is **not in the main download**. It is a second disk image, `DS-Harness-Plus-Recon-<version>.dmg`, with its own installer, a warning you must agree to, and its own uninstaller. Install the main Plus download first, then open the Recon image and double-click **`Install Recon.command`**. Recon is added switched off. You are responsible for what you do with it; read the warning in that download before you agree.

If you already have Recon installed, updating Plus keeps it exactly as it is, which means **the old Recon stays old**: it does not get the privacy fixes of the newer release. When that is the case the installer ends with a clear warning that names the Recon download. To update Recon, use the Recon download of the same version (`Install Recon.command`); its on or off switch stays as you had it. In Settings, Recon's page is listed under **Advanced**.
## First steps

1. **Add your models.** Go to **Settings → Models** in the app. You can paste an API key for a provider there, or add your own server (for example a model server on another computer). No files to edit.
2. **Look at the new pages.** A new install opens **Settings** in a **Simple** view with a few pages: **Start here, Models, Built-in plugins, Agent presets** and **About Plus** (plus Account and General). To get the other pages, click **Advanced** at the top of Settings (you can click Simple again later). Settings is under your name at the bottom-left of the sidebar. In Advanced, **Settings** has **Colours, Model Tiers, Modes, Sampling, Usage, Benchmark, Arena** and **Swarm** pages, and the pages the sections below name. The chat box (where you type) gets one **model button** beside the send button, with the model list, an effort slider from Off to Ultra Code, tiers and sampling, and, once set up, a model-health dot.
3. **Switch on what you want.** Some add-ons work right away. The others do nothing until you give them a little setup, for example which models the arena should compare. [docs/ADD-ONS.md](docs/ADD-ONS.md) says which is which and how to set each one up.

### What works the moment you install

- **Cowork sidebar:** Chat, Cowork and Code tabs at the top of the left sidebar. Each tab lists only its own conversations and projects, and has its own sections: Model Arena under Chat, and Automation tasks, Connectors (your MCP servers, with on/off switches) and Skills under Cowork and Code. The start page gets a greeting and suggestion chips. A tab picks the mode of new conversations, so the chat box no longer needs a mode drop-down. To get the normal sidebar back, switch **Cowork sidebar** off on the **Plugins** page.
- **Colours:** pick a colour scheme in **Settings → Colours**: DeepSeek Harness (the stock colours, the default), Harbor, Graphite or Forest, each in light and dark.
- **Modes:** Chat, Cowork and Code modes, switchable per conversation, plus a **Web** button in the chat box (On or Off), a **Depth** button (Quick, Standard, Thorough: how much it searches, plans, checks and reviews) and a **Tools** button that lists what the assistant can call. **Settings → Modes** also sets the Depth new conversations start with, the mode for scheduled tasks, how many of your modes get a sidebar tab, and the built-in working methods for Code and Cowork. An access level you pick by hand in the chat box is kept, also after a restart.
- **Model Tiers:** one model button in the chat box: pick any model and drag the effort slider. Five starter tiers (Fast, Balanced, Deep, Creative, Code review) work at once on whatever model you use. No model is preconfigured.
- **Code map:** a compact map of the project a conversation works in, so the assistant looks things up instead of reading whole files. Plus four "reverse engineer" skills. Nothing to install.
- **Privacy:** switches off the app's usage reporting and the upload of a conversation when you rate an answer. `/privacy` shows the state.
- **Usage counter:** counts requests and tokens per day and model (never your text).
- **Deep research** and **Code power:** new tools and skills the assistant can use.

Everything else stays switched off until you set it up.

## Changing an add-on's settings

Many add-ons have their own page in **Settings**, sorted into groups; the search field at the top of the Settings window (Cmd-F) finds any page or setting. The rest are set up in the app's settings file. To edit it:

1. Quit DeepSeek Harness.
2. In Finder press **⌘ Shift G**, paste `~/.dsh/profiles/desktop/` and press Return.
3. Make a copy of **`cordis.patch.yml`** first, as your own backup. Then open the original with TextEdit.
4. Paste in the block for the add-on you want, from its section in [docs/ADD-ONS.md](docs/ADD-ONS.md). Fill in the parts in `<ANGLE BRACKETS>`, save, and open the app.

The file is indentation-sensitive: use spaces, never tabs, and keep the lines lined up as in the example. If the app will not start after an edit, put your copy back.

## Updating

Download the newer version and double-click **`Install.command`** again. It replaces the add-ons and keeps your settings. It does not ask which add-ons you want again, and it never switches an add-on you already have on or off. If you have Recon, it is kept as it is (the installer warns you when that Recon is older than this release).

Installing again after an uninstall counts as an update too: the uninstaller leaves a small marker (and your Plus data folders tell the same story), so the safer starting values, the first-run card and the Simple settings view are **not** applied to someone who has used Plus before.

## When the app updates

The add-ons are written for **DeepSeek Harness 0.2.2 up to, but not including, 0.3.0**. That range is the only one they have been tested with. The installer prints it, together with the version of your app, every time you run it.

**What happens when the app is newer than that.** When the app moves to 0.3.0 or later, it is expected to **switch all the Plus add-ons off** and show a warning that they may crash or lose data. We have not seen this happen (it is read from how the app checks versions), so treat it as likely rather than certain. Your conversations, models and settings are not deleted by it.

**What to do.**
1. If you have not updated the app yet, wait: do not update to a version above the range until a new Plus release says it supports it.
2. If the app has updated already and the add-ons are off, leave them off. Do not switch them on, and do not run `Install.command` from an older Plus: the installer refuses an app version it does not know and changes nothing.
3. Look for a newer DeepSeek Harness Plus release made for your app version.
4. If you need Plus now, install the DeepSeek Harness version inside the range, then run the installer. Your conversations stay either way; the saved setup copies in `~/.dsh/backups/deepseek-harness-plus/` can undo a Plus change.

Plus does not widen the range by itself, and neither should you edit it: each new app version has to be tried with the add-ons first.

## Removing

Double-click **`Uninstall.command`**. It removes the add-ons (including Recon, if you installed it) and their files. It does **not** remove everything. At the end it prints what stays on your Mac and why:

- your conversations, your models and your skills (the app's own, not Plus's), the **learned skills you approved** (`~/.dsh/skill-architect`) and the add-ons you or Creator Plus made (`~/.dsh/plugins`): Plus never removes these, not even with "also remove my Plus data";
- settings you wrote into the settings file: they do nothing now, and come back into effect if you install again;
- **Plus's own data folders** in `~/.dsh` (for example Mission records, Artifacts, Library index, Memory, the Cowork trash). **Conversations you deleted in the Cowork sidebar are kept in `~/.dsh/trash/conversations`** for 30 days, and the app cannot show them without Plus. "Also remove my Plus data" deletes that trash for good;
- **passwords in the macOS Keychain** (for example Recon's logins). Plus never deletes Keychain items; the output says how to remove them yourself;
- **the settings file you share between Macs** (the iCloud Drive file, if you set that up). It is outside the app's folder and other Macs may use it;
- the dated copies of your setup in `~/.dsh/backups/deepseek-harness-plus/`;
- files add-ons made in your own project folders.

**Optional: also remove my Plus data.** When it is done, the uninstaller offers to remove Plus's data folders as well. It lists every folder with its size first, asks twice (you must type `DELETE`), and the default is No. Answering with `--yes` never removes data. This cannot be undone. You can also run it later: `bash scripts/uninstall.sh --remove-data`.

## Using it on a second Mac

1. Install the DeepSeek Harness app on the other Mac and open it once.
2. Run **`Install.command`** there too.
3. Add your models in **Settings → Models**.
4. Optional: to keep the same **settings** on both Macs, use iCloud Drive (below).
5. Optional: to see the same **conversations** on both Macs, set up the **Sync** add-on (see [docs/ADD-ONS.md](docs/ADD-ONS.md#sync)). It needs a private git repository that both Macs can reach. Neither Mac has to be switched on for the other to sync. Recon conversations are never synced.

### Same settings on both Macs, through iCloud Drive

The **Shared settings** add-on keeps the settings you change in the app's own pages in one file, `settings.json`, in a folder in iCloud Drive. Those settings are Modes, Model Tiers, the Cowork tabs, Sampling presets and Colours. Change something on one Mac and the other Mac picks it up within about a minute. The file never holds secrets: API keys, tokens and passwords stay on each Mac.

Shared settings is **Experimental**, so it is copied switched **off** and only with **Everything**. The question below is asked only when it is part of the install, and it works only after you switch **Shared settings** on in the app under **Plugins**. When it is not part of the install, nothing is asked and no folder is saved.

1. On the first Mac, run **`Install.command`**, choose **Everything**, and answer **y** when it asks *"Share settings through iCloud Drive?"*. It uses the folder **iCloud Drive → DeepSeek Harness Plus**. Then switch **Shared settings** on under Plugins.
2. On the second Mac, do the same (choose Everything, answer y, switch it on). When the app opens there, it takes the settings from the file. Its own earlier settings are kept in `~/.dsh/shared-settings/backups`.

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
- **"The app version is not supported"**: your app is newer or older than this release supports (0.2.2 up to, but not including, 0.3.0). Nothing was changed. See [When the app updates](#when-the-app-updates).
- **The installer stopped with a problem**: it has already put everything back. The message names a log file; send that file to whoever helps you.
- **The app misbehaves after installing**: run **`Uninstall.command`**. Every install and uninstall also leaves a dated copy of your setup files in `~/.dsh/backups/deepseek-harness-plus/`, in case someone helping you needs them.
- **The app will not start after you edited the settings file**: put back the copy you made before editing.

## What is in this folder

| Folder or file | What it is |
| --- | --- |
| `Install.command`, `Uninstall.command` | Double-click to install or remove. |
| `addons/` | The add-ons. Each has a `README.md` with its full technical notes. |
| `docs/ADD-ONS.md` | What each add-on does and how to set it up. |
| `docs/MODES-AND-SETTINGS.md` | Every mode (tab): what it is for, its instructions, its tools, its settings; the Settings window's groups and search; the gaps found, fixed and still open. |
| `docs/HOW-IT-WORKS.md` | For technical readers: how the install works, how to test, how to change an add-on. |
| `templates/` | Optional ready-to-fill examples: model servers, memory, MCP tool servers, backups. |
| `extras/dsh-intel-mcp/` | Optional Python tools (code map, reverse engineering, context store). Needs Python; not installed automatically. |
| `scripts/` | What the `.command` files run. |
| `VERSION` | This release's version number. |
| `LICENSE` | The MIT licence: anyone may use, change and share this. |

## Status

Release 0.57.0 (the version in `VERSION`). Tested so far:

- **Install, update and uninstall:** run on a fresh setup and on a copy of a real, long-used setup.
- **Live start:** the app starts with every add-on loaded.
- **Add-ons:** each has its own automated tests, and each settings page was checked in the app's web version.
- **The 0.57.0 changes** (the 26 decisions from the audit) were checked with automated tests and stand-ins for the app only. They have not yet been tried in the desktop app.
- **Not yet tested on another person's Mac.** Each add-on's `README.md` lists what was and was not verified for it.
