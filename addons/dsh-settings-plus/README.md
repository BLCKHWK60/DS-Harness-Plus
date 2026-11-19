# Settings helper

Makes the Settings window easier to find your way in: the Plus pages are sorted into groups with
headings, every page has an icon, and a search field finds any page or setting, including the ones
that live only in the configuration file. On from the start.

## How to use it

- Open Settings. The app's own pages come first (**App**); the Plus pages follow in nine groups:
  **Everyday**, **Models and spending**, **Modes and tabs**, **Agents and code**, **Research and
  sources**, **Privacy and safety**, **Learning**, **Add-ons and updates**, **Advanced**. A page whose
  add-on is Beta or Experimental (see `addon-tiers.json`) carries that word as a small tag in the list.
- **Simple / Advanced** (a switch at the top of Settings, saved as `view`): **Simple** shows only
  **Start here** (about ten settings in plain sentences: the model, the web, what the assistant may
  change, the daily spending limit, a runaway task, when to tell you, light or dark, the colour scheme,
  the Export button, which add-ons are on) and **About Plus**; the other Plus pages are hidden, not
  removed, and the page you are on stays in the list. **Advanced** is the full list. Search works in
  both and switches to Advanced when its result is on a hidden page. A fresh install starts on Simple;
  an earlier install keeps Advanced. Another add-on can add a row to Start here with
  `window.__dshSettingsPlus.addSimpleRow({ id, order, render })` (the Tool permissions row, later).
- **More settings** (group Advanced): every setting that has no control on any page, drawn from the
  add-on's own schema (the type decides the control), grouped by add-on, saved at once through Settings,
  with **Reset to default** (removes the saved value) per setting. Settings that can weaken a safety rule
  (a name starting danger, allow, anywhere or trusted) show a warning line and ask first. Search finds them
  and jumps to the row. Settings of an add-on that is switched off show when it is on.
- **Set up in 2 minutes** (first-run card): after a first install only, a small card (top right, never covering
  the chat box) offers three steps: add a model (a button to Settings → Models; no key is asked for or kept
  here), a daily spending limit (the value from `new-install-defaults.json` `prepared.budget.suggested` is
  suggested; "No limit" is allowed; saved through the same `budget.dayTokens` setting the Budget page uses),
  and keep the safe defaults (Simple) or show everything (Advanced). **Not now** or **Done** clears the marker
  `setupPending`; it can be run again from Start here (**Run setup again**).
- Press **Cmd-F** (Ctrl-F), or click the search field at the top of the window, and type. Every
  word you type must appear in the result. **Up** and **Down** move, **Enter** opens, **Esc**
  clears the field (a second Esc closes Settings).
- Picking a result opens its page, scrolls to the setting and outlines it for a moment.
- A result marked **More settings** has no control on its own page: picking it opens More settings. (If its
  add-on is off, the result says to use **Open configuration file**.)
- **The gear beside Send** (not yet in a release): a small button in the chat box, right of Run, in every tab and on the start page. It opens the settings of the mode you are in as a popup over the chat. Chat, Cowork, Code and your own modes show the **Modes** page; Data, Recon, Scout, Finance, Content, Devices, Creator Plus and Research show their own page; Automations shows **Alerts**. A mode whose add-on is off falls back to Modes. The page is the real Settings page, so every change is saved the same way as in Settings. **Open in Settings** (header) opens the Settings window on that page; Esc, **Close** and a click outside close the popup. A conversation with no message yet follows the selected tab, as everywhere else.
- **The Export button** (not yet in a release): a download icon left of the gear, in every tab. **Export this conversation** offers three levels and five file types. *Conversation only*: your messages and the assistant's replies. *Conversation and thinking*: the same with the thinking blocks. *Full session log*: everything the app stored, in order: the model and its settings, the instructions (system prompt), your messages, thinking, every tool call and its result, the other log events, and the raw log as stored, one JSON event per line. In JSON the full level is the stored log untouched. File types: Markdown, Plain text, HTML, JSON, and PDF (opens the print window: choose Save as PDF). **Download** saves the file, **Copy to clipboard** copies it. The dialog also offers the app's own complete archive (a ZIP of the log with its sub-conversations and attachments). The file is made from the log the app stored for that conversation, read-only; nothing is changed or removed. A conversation another add-on keeps apart (Recon's) is not exported here: its own **Export…**, in its gear, is the one way out.
- **Web sources… in the gear** (18 November 2026): the gear's popup has a "Web sources…" button beside "Open in Settings", in every mode. It opens Settings → Web sources (Modes' page for the one Web selector: the lists, saved selections, each tab's starting ticks and your own other sources). Research's Focus left the gear and the chat box: it is the Web selector's ticks now. The settings index lists the new page (group Tabs and modes, after Modes) and its settings, and Recon's Hidden networks section.
- **A mode's own buttons in the gear**: Devices rules, Creator Plus · New plugin, the Finance selection and Recon's Export are the first thing in the gear's popup, under **In this conversation**, so the chat box has the same buttons in every mode. They are the add-ons' own buttons given this conversation, so they work as they did in the box. The route badge ("Slow box", "Closed port") stays in the box: it is a warning. Needs the gear, `extrasInGear`, and Modes' Same chat box on; with Same chat box off the buttons are back in the box (and in the popup too).
- Results from the app's Plugins panel in the sidebar (Subagent, Web search and fetch, Agent loop,
  Shell) close Settings and open that panel.

## Settings

| Setting | Starts as | What it does |
| --- | --- | --- |
| `exportButton` | on | The Export button beside the gear. Off hides it (and the export route answers 404). Only in the configuration file or the Plugins panel; read when the page loads. |
| `extrasInGear` | on | A mode's own buttons (Devices rules, Creator Plus, the Finance selection, Recon's Export) are in the gear's popup instead of the chat box. Needs the gear on and Modes' Same chat box on. Only in the configuration file or the Plugins panel. |
| `modeGear` | on | The gear beside Send. Off hides it. Only in the configuration file or the Plugins panel; read when the page loads. |
| `view` | advanced (simple on a first install) | Which list Settings starts with: `simple` or `advanced`. The switch at the top of Settings writes it. |
| `setupPending` | off (on only after a first install) | Whether the first-run card is still to be shown. Written by the installer through `new-install-defaults.json`; cleared when the card is finished or put away. |
| `enabled` | on | Groups, icons and the search field. Off leaves the Settings window as the app draws it. Only in the configuration file or the Plugins panel. |

## How it works

- `client.js` registers an icon for each Plus page (slot `settings.section.icon`), draws the group
  headings with a small style sheet, and adds the search field to the window's header (slot
  `settings.action`). It opens a page through the Settings store (`select`), and falls back to
  clicking the page's button.
- The list `GROUPS` in `client.js` names the groups and their pages; the order and the headings follow it
  (a generated CSS `order` on each button), whatever order number an add-on gave its page. `PAGE_ADDON` says
  which add-on each page belongs to (for the tag). Simple hides pages with a CSS rule on the same markers.
- The Simple page, More settings and the first-run card read and write through the app's Settings
  (`remote.settings.describe()` / `mutate()`: `set`, or `unset` for Reset to default), never a file. The
  More settings form reads each add-on's schema from `describe()`, so it cannot drift from the add-ons.
- `index.js` serves `settings-index.json` at `GET /dsh-settings-plus/index` (behind the app's
  connection check). The file is read once at start.
- `settings-index.json` holds one entry per page, section and setting: page, page label, heading,
  label, description, extra search words, kind, whether it is configuration-file only, the field
  name, and where it is. It was made from the pages' own code. **When a page gets a new setting,
  add an entry here**. Results for a page that is not shown (its add-on is off) are left out, except configuration-file-only settings, which are always listed. Entries with `where: "plugins-panel"` belong to the app's Plugins panel in the sidebar.

- The gear (`ModeGear` in `client.js`, slot `conversation.input.right`, order 880) asks the Modes settings for the conversation's mode, then asks the Modes route `GET /dsh-modes/tools` (header `x-dsh-session`) for the mode's name, because that is how Modes decides a conversation with no message yet. It mounts the page's own component from the `settings.section` list inside a portal on the page body (`dsh-mg-` styles), with a boundary so a page that fails shows a line instead of breaking the chat box. No Modes file is touched.

## Tests

`test/simple-more.test.mjs`: the nine headings and every page once with its add-on's tier; the Simple list and its rules; the first-run card (no key field, writes `budget.dayTokens`, shown only with the marker); the More settings rows (control per type, grouped, switched-off add-ons counted, nested paths, danger/allow/anywhere/trusted marked, typed values checked, Reset removes the saved value); search jumps to More settings.

`test/settings-plus.test.mjs`: the index reader keeps good entries and drops broken ones; the
shipped list is well formed with few duplicates; the route answers with the list and refuses a
request the app does not let in; the gear is registered beside Send, finds the conversation's mode and the page that holds its settings, has its own switch (on by default, answered by the route), and the code holds no personal value.

## Permission card (Tool access)

The card the AI's request for a tool is answered on. Added for Tool access (Phase 5, review section 8 step 10); Modes owns the policy and the service `ctx.get('toolAccess')`, this add-on draws and carries the answer.

- **Host half, `lib/toolcard.js`, route `GET/POST /dsh-settings-plus/tool-card`.** A page that looks (about once a second) makes the bridge register a card with the service (`registerCard`), so a request waits for the user here. When no page has looked for 6 seconds the card is withdrawn; a request is then refused (nobody can answer) and listed under Waiting for you on the Tool access page. There is no fallback to the app's own two-button card. `GET` lists the open requests as plain text (no signal or function), with the time left counted on the host clock. `POST {id, choice}` answers through `answer`; a choice the request did not offer becomes Deny.
- **Browser half, `client.js`, the `toolcard` block and the "Permission card" part (styles `dsh-tc-`).** One poller for the page; each conversation draws only its own oldest request in the `conversation.input.dock` seat (in Split view that is inside the asking pane); `2 more waiting` counts the rest. Headline, risk line and both warnings are Plus's words; the AI's reason is cleaned (one line, 300 characters), quoted, marked "(not checked)", and only ever given to the page as a text child. Deny has the focus (unless a message is half written), Esc is Deny, nothing is bound to Enter, and the 10-minute wait is shown as a countdown. The page door `window.__dshToolCard` (`waiting`, `ids`, `count`, `subscribe`) feeds the Cowork Shell's "Needs you" list (a conversation not on screen) and the Split pane header (dot and "Waiting for you").
- Tests: `test/toolcard.test.mjs` (wording, hostile text, countdown, queue, choice trimming, the bridge on a stand-in service) and `test/toolcard-live.test.mjs` (the bridge on the real service, run in Modes' stand-in app).
