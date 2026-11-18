# Settings helper

Makes the Settings window easier to find your way in: the Plus pages are sorted into groups with
headings, every page has an icon, and a search field finds any page or setting, including the ones
that live only in the configuration file. On from the start.

## How to use it

- Open Settings. The app's own pages come first (**App**); the Plus pages follow in six groups:
  **Tabs and modes**, **Models**, **Cost and limits**, **Agents and runs**, **Knowledge and
  files**, **Look and this Mac**.
- Press **Cmd-F** (Ctrl-F), or click the search field at the top of the window, and type. Every
  word you type must appear in the result. **Up** and **Down** move, **Enter** opens, **Esc**
  clears the field (a second Esc closes Settings).
- Picking a result opens its page, scrolls to the setting and outlines it for a moment.
- A result marked **configuration file only** has no control on a page: use **Open configuration
  file** at the top of the window.
- **The gear beside Send** (not yet in a release): a small button in the chat box, right of Run, in every tab and on the start page. It opens the settings of the mode you are in as a popup over the chat. Chat, Cowork, Code and your own modes show the **Modes** page; Data, Recon, Scout, Finance, Content, Bench, Creator Plus and Research show their own page; Automations shows **Alerts**. A mode whose add-on is off falls back to Modes. The page is the real Settings page, so every change is saved the same way as in Settings. **Open in Settings** (header) opens the Settings window on that page; Esc, **Close** and a click outside close the popup. A conversation with no message yet follows the selected tab, as everywhere else.
- **The Export button** (not yet in a release): a download icon left of the gear, in every tab. **Export this conversation** offers three levels and five file types. *Conversation only*: your messages and the assistant's replies. *Conversation and thinking*: the same with the thinking blocks. *Full session log*: everything the app stored, in order: the model and its settings, the instructions (system prompt), your messages, thinking, every tool call and its result, the other log events, and the raw log as stored, one JSON event per line. In JSON the full level is the stored log untouched. File types: Markdown, Plain text, HTML, JSON, and PDF (opens the print window: choose Save as PDF). **Download** saves the file, **Copy to clipboard** copies it. The dialog also offers the app's own complete archive (a ZIP of the log with its sub-conversations and attachments). The file is made from the log the app stored for that conversation, read-only; nothing is changed or removed. A conversation another add-on keeps apart (Recon's) is not exported here: its own **Export…**, in its gear, is the one way out.
- **Web sources… in the gear** (18 November 2026): the gear's popup has a "Web sources…" button beside "Open in Settings", in every mode. It opens Settings → Web sources (Modes' page for the one Web selector: the lists, saved selections, each tab's starting ticks and your own other sources). Research's Focus left the gear and the chat box: it is the Web selector's ticks now. The settings index lists the new page (group Tabs and modes, after Modes) and its settings, and Recon's Hidden networks section.
- **A mode's own buttons in the gear**: Bench rules, Creator Plus · New plugin, the Finance selection and Recon's Export are the first thing in the gear's popup, under **In this conversation**, so the chat box has the same buttons in every mode. They are the add-ons' own buttons given this conversation, so they work as they did in the box. The route badge ("Slow box", "Closed port") stays in the box: it is a warning. Needs the gear, `extrasInGear`, and Modes' Same chat box on; with Same chat box off the buttons are back in the box (and in the popup too).
- Results from the app's Plugins panel in the sidebar (Subagent, Web search and fetch, Agent loop,
  Shell) close Settings and open that panel.

## Settings

| Setting | Starts as | What it does |
| --- | --- | --- |
| `exportButton` | on | The Export button beside the gear. Off hides it (and the export route answers 404). Only in the configuration file or the Plugins panel; read when the page loads. |
| `extrasInGear` | on | A mode's own buttons (Bench rules, Creator Plus, the Finance selection, Recon's Export) are in the gear's popup instead of the chat box. Needs the gear on and Modes' Same chat box on. Only in the configuration file or the Plugins panel. |
| `modeGear` | on | The gear beside Send. Off hides it. Only in the configuration file or the Plugins panel; read when the page loads. |
| `enabled` | on | Groups, icons and the search field. Off leaves the Settings window as the app draws it. Only in the configuration file or the Plugins panel. |

## How it works

- `client.js` registers an icon for each Plus page (slot `settings.section.icon`), draws the group
  headings with a small style sheet, and adds the search field to the window's header (slot
  `settings.action`). It opens a page through the Settings store (`select`), and falls back to
  clicking the page's button.
- The groups come from the pages' order numbers, which each add-on sets: Tabs and modes 100–114,
  Models 200–230, Cost and limits 300–310, Agents and runs 400–430, Knowledge and files 500–550,
  Look and this Mac 600–620. The list `GROUPS` in `client.js` names them.
- `index.js` serves `settings-index.json` at `GET /dsh-settings-plus/index` (behind the app's
  connection check). The file is read once at start.
- `settings-index.json` holds one entry per page, section and setting: page, page label, heading,
  label, description, extra search words, kind, whether it is configuration-file only, the field
  name, and where it is. It was made from the pages' own code. **When a page gets a new setting,
  add an entry here**. Results for a page that is not shown (its add-on is off) are left out, except configuration-file-only settings, which are always listed. Entries with `where: "plugins-panel"` belong to the app's Plugins panel in the sidebar.

- The gear (`ModeGear` in `client.js`, slot `conversation.input.right`, order 880) asks the Modes settings for the conversation's mode, then asks the Modes route `GET /dsh-modes/tools` (header `x-dsh-session`) for the mode's name, because that is how Modes decides a conversation with no message yet. It mounts the page's own component from the `settings.section` list inside a portal on the page body (`dsh-mg-` styles), with a boundary so a page that fails shows a line instead of breaking the chat box. No Modes file is touched.

## Tests

`test/settings-plus.test.mjs`: the index reader keeps good entries and drops broken ones; the
shipped list is well formed with few duplicates; the route answers with the list and refuses a
request the app does not let in; the gear is registered beside Send, finds the conversation's mode and the page that holds its settings, has its own switch (on by default, answered by the route), and the code holds no personal value.
