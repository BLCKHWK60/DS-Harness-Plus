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
- Results from the app's Plugins panel in the sidebar (Subagent, Web search and fetch, Agent loop,
  Shell) close Settings and open that panel.

## Settings

| Setting | Starts as | What it does |
| --- | --- | --- |
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

## Tests

`test/settings-plus.test.mjs`: the index reader keeps good entries and drops broken ones; the
shipped list is well formed with few duplicates; the route answers with the list and refuses a
request the app does not let in.
