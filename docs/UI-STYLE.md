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
