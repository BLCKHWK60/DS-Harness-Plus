# Diagram builder

Lets a model draw accurate diagrams. The model says what is in the diagram; this add-on does the layout, the drawing and a check. It works the moment it is installed, with nothing to install and nothing leaving the Mac.

## Why it works this way

A model that writes a picture by hand gets positions wrong: text spills out of boxes, boxes overlap, arrows miss. Here the model never writes coordinates. It sends a description (boxes and arrows, branches, messages, events, numbers, formulas), and the add-on:

1. measures the text and sizes every box to fit it;
2. lays the diagram out (layers for flowcharts, with arrows routed around boxes; room per branch for trees; rows for sequences and timelines; axes with round steps for charts);
3. checks the result for anything a reader would stumble over, and tells the model, so it can fix the description and draw again;
4. shows the picture in the chat and saves it as an SVG file.

The drawing is exact. What goes into it is still the model's: a diagram is only as right as the description.

## What it draws

| Kind | For | In the description |
| --- | --- | --- |
| `flow` | processes, causes, decisions, how parts connect | `nodes` (id, label, shape, colour, group), `edges` (from, to, label, dashed), `direction` |
| `tree` | hierarchies, outlines, mind maps | `root` with nested `children`, `direction` |
| `sequence` | parties exchanging messages in order | `actors`, `steps` (messages, replies, notes) |
| `timeline` | events in time order | `events` (when, title, text) |
| `chart` | numbers and formulas | bars or lines over `categories`; points or lines over numbers; `functions` to plot formulas in x |

Shapes: box, round, pill, diamond, note. Colours: gray, purple, teal, coral, blue, amber, green.

Formulas are read by a small calculator that never runs code. It knows x, `+ - * / ^`, brackets, `pi`, `e`, and sin, cos, tan, asin, acos, atan, sinh, cosh, tanh, sqrt, cbrt, abs, exp, ln, log, log2, floor, ceil, round, sign. `2x` and `3(x+1)` mean multiplication. A curve is lifted where the formula has no value or leaps across the picture, so `1/x` is drawn as two branches, not joined by a line.

## What the model gets

- Tool `diagram_draw`. Its answer holds the saved file, a text outline of what was drawn (every box, arrow and number, so a model that cannot see pictures can still check its work), and any problems to fix.
- Skill `draw-diagram`, loaded only when used: which kind to pick, to keep diagrams small and labels short, never to invent boxes or numbers, one example per kind, and to read the outline and fix problems.

Mistakes in a description are answered in sentences, for example: `An arrow uses "c", which is not the id of any box. The ids are: a, b.`

## The check

After layout, the add-on looks for: boxes that overlap; text that does not fit its box; an arrow label sitting on a box or on another label; a group's frame covering a box that is not in the group; groups overlapping; many arrows crossing; a picture that is very large; anything outside the picture. It also warns about crowded diagrams, boxes with no arrow, and formulas drawn without a chosen range.

## Where the picture goes

- **In the chat:** as the row for the tool call while the model works, and again under the finished turn, because the app folds tool steps away once a turn is done. If the model drew a diagram, fixed it and drew it again under the same name, only the last version is shown there. The picture in the chat always uses the app's light or dark colours. Click it for full size.
- **As a file:** in a `diagrams` folder inside the conversation's folder, named after the title. A new title that is already taken gets a number; when the model names the file itself, it replaces its own earlier drawing. A file that this add-on did not write is never replaced.

**Settings → Diagrams:** the master switch, save as a file or not, the folder's name, and the colours of the saved file (automatic follows light or dark mode of whatever shows it).

## For developers

- `lib/spec.js` reads and checks a description. `lib/flow.js`, `tree.js`, `sequence.js` (sequences and timelines), `chart.js` lay out one kind each and return `{width, height, body, boxes, labels, crossings, outline}`. `lib/draw.js` ties them together and holds the check. `lib/svg.js` measures text and writes the document. `lib/expr.js` reads formulas.
- Service `diagrams` (apiVersion 1): `draw(description)` returns `{ok, errors}` or `{ok, kind, title, width, height, outline, problems, svg(options)}`. Meant for other add-ons.
- Routes: `GET /dsh-diagram/status`; `GET /dsh-diagram/svg` with header `x-dsh-diagram` (and `x-dsh-theme`); `GET /dsh-diagram/list` with headers `x-dsh-session`, `x-dsh-from`, `x-dsh-to` for the drawings of one turn.
- Client slots: `tool.call.toolview` keyed `diagram_draw`, `conversation.chat.turnTail`, `settings.section`. Pictures are shown as images from a blob, which cannot run scripts.
- A list of drawings (id, conversation, time, file) is kept under the dsh home in `diagrams/index.json`, capped at 600, so pictures still show after a restart if they were saved.

## Checked

- **Unit tests:** 10 (`test/`): formulas (and that names such as `constructor` are refused); text measuring and wrapping; error sentences; flowcharts in both directions with a loop, a decision, a group and a self-arrow; 250 random flowcharts in which no two boxes may overlap and every picture must be well-formed; trees, sequences, timelines; charts placed from the numbers (a bar for 210 on an axis to 250 is exactly 210/250 of the height); the check on a deliberately messy drawing; themes and escaping; file names and never replacing someone else's file; every example in the skill draws without problems.
- **By eye:** all five kinds rendered to pictures and looked at, in light and dark.
- **Live, in the throwaway web profile with a test model server:** the tool reached the model, a flowchart was drawn, and the picture appeared in the chat under the finished turn in the app's dark colours; the settings page saved a change.
- **Not checked:** a real model writing descriptions; saving into a conversation's folder from inside the app (the lab had saving off so as not to write into a real folder; the saving code itself is unit-tested); very large diagrams; right-to-left and non-Latin text (widths are estimated for Latin letters); the Mac desktop app.

## Limits

- Text widths are estimates, set a little wide. Unusual fonts or scripts can still differ.
- Flowchart layout aims for few crossings but does not guarantee the fewest. Dense graphs with many arrows will cross; the check says so.
- Labels on arrows that leave or reach the same box can sit close together.
- No pie charts, no stacked bars, no two vertical axes, no free-form drawings (anatomy, circuits, maps).

## Since 0.33.0

- **Dates along the bottom.** A point's x may be `"2026-03-31"` or `"2026-03"` (`dateDays` in `lib/spec.js`); every point of a chart must then be dated. `dateAxis` in `lib/chart.js` puts marks at days, Mondays, months, quarters or years. A line of more than 45 points has no dots, and its outline gives the start, the end, the lowest and the highest instead of every point.
- **Service `diagrams`, apiVersion 2:** `show(agent, {title, description})` draws a description and files it under the agent's turn; `show(agent, {title, file})` does the same for a PNG, JPEG or SVG file another add-on made (up to 12 MB; served as it is through the picture route, and shown as an image, so nothing in it can run).
