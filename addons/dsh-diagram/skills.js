/**
 * The "draw a diagram" skill. It is loaded into the model's context only when
 * used, so it is kept short.
 */
export const SKILLS = [
  {
    name: 'draw-diagram',
    description: 'Draw an accurate diagram with diagram_draw: a flowchart or concept map, a tree or mind map, a sequence, a timeline, a chart, or the plot of a formula.',
    whenToUse: 'A picture would explain something better than words: a process, how parts relate, a hierarchy, who does what in which order, events over time, numbers to compare, or the shape of a formula. Also when the user asks for a diagram, chart, graph, map or plot.',
    content: `# Draw a diagram

You describe the diagram; \`diagram_draw\` does the layout and the drawing. Never write SVG, coordinates or sizes yourself. Boxes are sized to their text and arrows are routed for you.

## 1. Pick the kind that fits
- \`flow\`: steps, causes, decisions, how parts connect. Boxes and arrows.
- \`tree\`: one thing that divides into parts (outline, classification, mind map).
- \`sequence\`: two or more parties exchanging messages in order.
- \`timeline\`: events in time order.
- \`chart\`: numbers. Bars or lines over named categories; points or lines over numbers; \`functions\` to plot formulas in x.
If the content is really a list or a table, write a list or a table instead.

## 2. Keep it small and exact
- 5 to 15 boxes. Past that, draw two diagrams.
- Labels of 1 to 5 words. Detail goes in your answer, not in the box.
- Every box, arrow and number must come from what you know or have read. Do not add boxes to make it look complete, and do not invent numbers for a chart.
- One idea per diagram. Give it a \`title\` that says what it shows.
- Use colour to mean something (the same colour for the same kind of thing), not for decoration.

## 3. Describe it

Flowchart:
\`\`\`json
{"kind":"flow","title":"Water cycle","direction":"right",
 "nodes":[{"id":"sea","label":"Sea","color":"blue"},{"id":"vapour","label":"Water vapour"},{"id":"rain","label":"Rain","shape":"round"}],
 "edges":[{"from":"sea","to":"vapour","label":"evaporates"},{"from":"vapour","to":"rain","label":"condenses"},{"from":"rain","to":"sea","dashed":true}]}
\`\`\`
\`shape\`: box, round, pill (start or end), diamond (a decision), note. \`group\` on several nodes puts a frame around them. \`direction\`: down (default) or right.

Tree: \`{"kind":"tree","root":{"label":"Memory","children":[{"label":"Short-term"},{"label":"Long-term","children":[{"label":"Episodic"},{"label":"Semantic"}]}]}}\`. \`direction\`: right (default, like a mind map) or down.

Sequence: \`{"kind":"sequence","actors":[{"id":"b","label":"Browser"},{"id":"s","label":"Server"}],"steps":[{"from":"b","to":"s","label":"GET /page"},{"from":"s","to":"b","label":"200 OK","reply":true},{"note":"The page is cached","over":["b"]}]}\`

Timeline: \`{"kind":"timeline","events":[{"when":"1903","title":"First powered flight","text":"optional detail"},{"when":"1969","title":"Moon landing"}]}\`, earliest first.

Chart over categories: \`{"kind":"chart","chart":"bar","categories":["North","South"],"series":[{"name":"2024","values":[120,80]}],"yLabel":"units"}\` (\`chart\`: bar or line).
Chart over numbers: \`{"kind":"chart","chart":"scatter","series":[{"name":"measured","points":[[0,90],[2,78]]}]}\` (\`chart\`: scatter or line).
Formula: \`{"kind":"chart","functions":[{"formula":"x^2 - 3"},{"formula":"2sin(x)","name":"wave"}],"xMin":-4,"xMax":4}\`. Formulas use x, + - * / ^, brackets, pi, e, and sin cos tan sqrt abs exp ln log. Always give \`xMin\` and \`xMax\`.

## 4. Read the answer and fix
The tool answers with the saved file, a text outline of what it drew, and any problems.
- If it lists **problems**, fix the description and call it again with the same \`name\` (it replaces the file). Two rounds are usually enough; if a problem remains, tell the user.
- Read the **outline** and check it against what you meant: the right boxes, every arrow pointing the right way, the right numbers. The outline is how you see the picture.
- Then tell the user in one or two sentences what the diagram shows. The picture appears in the chat by itself; do not paste the file's contents.`,
  },
];
