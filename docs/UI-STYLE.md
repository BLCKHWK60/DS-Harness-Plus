# How add-on pages should look

Every Plus settings page and panel must look like the app's own Settings pages (General, Models, Agent presets) and follow the colour scheme in use. These values were measured from the installed app (0.2.2-rc.1).

## Rules

1. **Colours come only from the app's variables.** Never write a fixed colour (`#fff`, `rgb(...)`, a named colour) except pure black in a shadow mixed with `color-mix`. The colour schemes add-on changes these variables, so a page that uses them follows every scheme, light and dark.
2. **No page background.** A settings page sits on the Settings dialog's own background. Do not paint one.
3. **Same sizes as the app.** Use the table below; do not invent in-between sizes.
4. **Plain words.** "conversation", "chat box", "add-on", "model". Not "session", "composer", "plugin", "route".

## Variables

| Use | Variable |
| --- | --- |
| Main text | `--dsw-alias-label-primary` |
| Descriptions, hints, group heads | `--dsw-alias-label-secondary` |
| Accent on settings pages (active, selected, switches) | `--dsw-alias-brand-primary` |
| Accent in the sidebar and chat box (New button, tabs, links, Search buttons) | `--dsw-alias-state-business-primary`, so those match each other |
| Row dividers, quiet borders | `--dsw-alias-border-l1` |
| Card and button borders | `--dsw-alias-border-l2` |
| Field and control fill | `color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent)`. A tint of the text colour stays visible on the dialog and inside a card in every scheme; `--dsw-alias-bg-layer-2` alone can match the card fill and make fields vanish |
| Card fill | `--dsw-alias-settings-card-fill`, falling back to `--dsw-alias-bg-layer-1` |
| Hover fill | `--dsw-alias-interactive-bg-hover`, falling back to `--dsw-alias-bg-layer-2` |
| Menus and pop-ups | `--dsw-alias-bg-overlay` |
| Errors, warnings, success | `--dsw-alias-state-error-primary`, `--dsw-alias-state-warn-primary` (not `…-warning-…`, which is empty), `--dsw-alias-state-success-primary` |

## Sizes

| Part | Look |
| --- | --- |
| Page title | 16px / 24px line, weight 500, main text |
| Page description | 12px / 18px line, secondary text, under the title |
| Group head | 12px, weight 600, upper case, secondary text |
| Row | title 14px / 22px line, weight 400; description 12px / 18px line, secondary; the control on the right; `padding: 16px 0`; divider `0.5px solid var(--dsw-alias-border-l1)` between rows |
| Card | `border-radius: 20px`; `border: 0.5px solid var(--dsw-alias-border-l2)`; `padding: 12px 14px` (16px for a card with a form in it); card fill |
| Field (text, number, select, textarea) | height 36px (textarea free); `border-radius: 12px`; no border; field fill; 14px text; `padding: 0 14px`; on focus an accent outline of 1px |
| Button (secondary) | height 28px; `border-radius: 8px`; 12px text; `border: 0.5px solid var(--dsw-alias-border-l2)`; transparent; `padding: 0 10px`; hover fill |
| Button (main action) | same shape, accent border and accent text, or accent fill with `--dsw-alias-label-primary-inverted` text |
| Switch | 36×20px pill, 2px padding. Off: fill `--dsw-alias-border-l3`, knob `--dsw-alias-switch-thumb`. On: fill `--dsw-alias-brand-primary`, knob `--dsw-alias-bg-base`. Never a fixed white knob: it vanishes in the stock dark scheme |
| Label above a field inside a card | 12px / 18px line, secondary text |
| Segmented control | a tinted track (the field fill) with 28px buttons; the chosen one filled with the card fill, main text |
| Chip, tag | height 24px; `border-radius: 12px`; 11–12px text |
| Tabs inside a page | text buttons, 13px; the active one in main text with a 2px accent underline; the others in secondary text. No filled pill bar |
| Pop-up panel | `border-radius: 12px`; `border: 0.5px solid var(--dsw-alias-border-l2)`; overlay fill; shadow `0 14px 36px color-mix(in srgb, #000 28%, transparent)` |

## Layout

- One column, the full width of the Settings dialog's content area. No inner scroll areas except long lists.
- Simple on/off or single-choice settings are **rows** (text left, control right). Things with several fields (a tier, a preset, a suite) are **cards**, with the fields in a two-column grid that drops to one column when narrow.
- A page that needs setup before it works says so at the top in one sentence, with the first step as a button.
- Saving: save on change, and show "Saved" quietly; or one Save button at the bottom right. Never both on one page.

## Checking a page

Open it in the lab under at least two schemes (Settings → Colours), in light and dark (Settings → General → Appearance), and at a narrow width. Nothing should keep a colour from another scheme, and it should sit next to the General page without looking like a different app.

## Questions and error messages

- **Never use `window.prompt`, `window.confirm` or `window.alert`.** `prompt` does nothing in the desktop app, and the other two cannot be styled or checked there. Use the shared question box, `dshKit.ask({ text, ok, danger, field, notice })` (a small pop-up in the page's own style; it resolves true/false, the typed text when it has a `field`, or just closes with `notice`). A question that can destroy something sets `danger: true`: it then starts on Cancel. `scripts/check.sh` fails when a page calls one of the three.
- **Never show raw error text** such as "error 404" or "settings/conflict". Throw `dshKit.fail(raw)` (an Error with a plain sentence; the raw text stays in `error.details`) and, where a page has room, draw `PlainNote` (`const PlainNote = dshKit.makeNote(React)`), which shows the sentence and a **Details** button.
- Both come from one block, `docs/shared/dsh-kit.js`, copied into each page between the `dsh-kit:begin` and `dsh-kit:end` lines. Change the master, then run `node scripts/sync-kit.mjs`; `scripts/check.sh` fails when a copy has drifted.

## The shared page parts and CSS names

Pages used to draw the same switch, button, row and heading again and again, each add-on with its own copy, and some class names met on one screen (the Sampling page was crushed by Split Plus's CSS). Two rules now prevent that.

**1. Use the shared parts.** `docs/shared/dsh-ui.js` holds the parts every page needs, copied into each page file between the `dsh-ui:begin` and `dsh-ui:end` lines (change the master, then run `node scripts/sync-kit.mjs`; `scripts/check.sh` fails when a copy has drifted, as it does for the error helper). Use them with `const ui = dshUi.makeParts(React)`:

| Part | What it is |
| --- | --- |
| `ui.Page({ title, desc })` | The page frame: title (16px), one sentence, then the page |
| `ui.Group` | A group head (12px, upper case) |
| `ui.Desc({ error })` | A short line in the description style |
| `ui.Row({ title, desc }, control)` | One setting: text left, control right, 16px padding, divider |
| `ui.Switch({ on, label, onChange, danger })` | The 36×20 switch; `danger` draws it red while on (a safety rule that is off) |
| `ui.Button({ main, danger })` | 28px secondary button; `main` for the accent one |
| `ui.Field` | 36px field |
| `ui.CopyButton({ text })` | Copies, then says "Copied" for a moment |
| `ui.Chips({ items, onPick })` | Starter chips |
| `ui.Empty({ title, text, chips })` | What a list shows when it has nothing yet: what it is for and what to do first |
| `ui.Wait` | A loading line |

Every shared class starts with `dshu-`. They carry the keyboard focus ring (2px, accent) and the hover state. An add-on never defines or restyles a `dshu-` class; it adds its own class beside it when it needs something extra.

**2. One prefix per add-on.** Every class an add-on creates starts with its own prefix, `dsh-` plus two or three letters that no other add-on uses (`dsh-mc-` is Modes' model chip, so Mac uses `dsh-mac-`). A class is created by one add-on only. A CSS rule always names at least one of the add-on's prefixed classes (`.dsh-xx-card .title`, never `.title`), unless it deliberately hooks onto `html`, `body` or a `[data-…]` attribute. `node scripts/check-css-classes.mjs` (run by `scripts/check.sh`) fails on a class made by two add-ons, two add-ons sharing a prefix, and a bare rule. The few deliberate exceptions, each with its reason, are in `scripts/css-class-allowlist.json`; do not add to it, rename instead.

When you convert a page, take its rows, switches, buttons and headings from the shared parts and keep only what is special to the page in its own CSS.
