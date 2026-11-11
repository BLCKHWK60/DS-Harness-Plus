import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { answerText, MARK, PARAMETERS, readSettings, savePath, slug, turnDrawings } from '../index.js';
import { layoutChart, niceAxis, numberText } from '../lib/chart.js';
import { draw, inspect } from '../lib/draw.js';
import { compile } from '../lib/expr.js';
import { layoutFlow } from '../lib/flow.js';
import { KINDS, readSpec } from '../lib/spec.js';
import { COLORS, document, textWidth, wrap } from '../lib/svg.js';
import { SKILLS } from '../skills.js';

const overlap = (a, b) => a.x + 0.5 < b.x + b.w && b.x + 0.5 < a.x + a.w && a.y + 0.5 < b.y + b.h && b.y + 0.5 < a.y + a.h;
const nodesOf = (drawing) => drawing.boxes.filter((box) => box.kind === 'node');

/** The file must be one well-formed picture with nothing broken inside. */
function assertSound(svg, what) {
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"') && svg.endsWith('</svg>'), what);
  assert.ok(svg.includes(MARK), what);
  assert.doesNotMatch(svg, /NaN|undefined|Infinity|\[object/, what);
  assert.doesNotMatch(svg, /<script|onload=|href=/i, what);
  const opened = (svg.match(/<(g|svg|text|defs|marker|style|title|desc|clipPath)\b/g) ?? []).length;
  const closed = (svg.match(/<\/(g|svg|text|defs|marker|style|title|desc|clipPath)>/g) ?? []).length;
  assert.equal(opened, closed, `${what}: every element is closed`);
}

test('formulas are read without running code', () => {
  const cases = [['x^2 - 3', 2, 1], ['2x', 3, 6], ['3(x+1)', 1, 6], ['2sin(x)', Math.PI / 2, 2], ['-x^2', 3, -9], ['2^-1', 0, 0.5], ['y = sqrt(x)', 9, 3], ['e^x', 0, 1], ['2e', 0, 2 * Math.E], ['1e3 + x', 1, 1001], ['x/2/2', 8, 2], ['2^3^2', 0, 512], ['(x+1)(x-1)', 3, 8], ['π·x', 1, Math.PI], ['x ** 2', 4, 16], ['abs(x) − 1', -5, 4], ['log(100) + ln(e) + log2(8)', 0, 6]];
  for (const [formula, x, want] of cases) assert.ok(Math.abs(compile(formula)(x) - want) < 1e-9, `${formula} at ${x}`);
  assert.ok(Number.isNaN(compile('1/x')(0)));
  assert.ok(Number.isNaN(compile('sqrt(x)')(-1)));
  for (const bad of ['x +', 'foo(x)', '(x', 'x)', 'alert(1)', '', 'x; process.exit()', 'constructor', 'x'.repeat(201)]) assert.throws(() => compile(bad), /formula|not a known|not understood/i, bad);
});

test('text is measured generously and wrapped to fit', () => {
  assert.ok(textWidth('mmmm') > textWidth('iiii') * 2);
  assert.ok(textWidth('Hello', 26) > textWidth('Hello', 13) * 1.9);
  const lines = wrap('A fairly long label that needs wrapping over several lines to fit', 120, 13, 5);
  assert.ok(lines.length >= 3);
  for (const line of lines) assert.ok(textWidth(line, 13) <= 120, line);
  assert.deepEqual(wrap('', 100), ['']);
  const cut = wrap('one two three four five six seven eight nine ten eleven twelve', 60, 13, 2);
  assert.equal(cut.length, 2);
  assert.ok(cut[1].endsWith('…'));
  for (const piece of wrap('Supercalifragilisticexpialidocious', 80, 13, 6)) assert.ok(textWidth(piece, 13) <= 80, piece);
});

test('a description with mistakes is answered in sentences the model can act on', () => {
  assert.match(readSpec(null).errors[0], /object with a "kind"/);
  assert.match(readSpec({ kind: 'pie' }).errors[0], /flow, tree, sequence, timeline, chart/);
  const unknown = readSpec({ kind: 'flow', nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', to: 'c' }] });
  assert.match(unknown.errors[0], /"c", which is not the id of any box\. The ids are: a, b\./);
  assert.match(readSpec({ kind: 'flow', nodes: [{ id: 'a' }, { id: 'a' }] }).errors[0], /Two boxes have the id "a"/);
  assert.match(readSpec({ kind: 'flow' }).errors[0], /needs "nodes"/);
  assert.match(readSpec({ kind: 'tree' }).errors[0], /needs "root"/);
  assert.match(readSpec({ kind: 'sequence', actors: [{ id: 'a' }], steps: [{ from: 'a', to: 'z', label: 'hi' }] }).errors[0], /"z", which is not the id of any party/);
  assert.match(readSpec({ kind: 'timeline', events: [{ title: 'no date' }] }).errors[0], /"when"/);
  assert.match(readSpec({ kind: 'chart', categories: ['a', 'b'], series: [{ name: 's', values: [1] }] }).errors[0], /1 values but there are 2 categories/);
  assert.match(readSpec({ kind: 'chart', functions: ['foo(x)'] }).errors[0], /"foo" is not a known function/);
  assert.match(readSpec({ kind: 'chart', chart: 'bar', series: [{ points: [[1, 2]] }] }).errors[0], /needs "categories"/);
  assert.match(readSpec({ kind: 'chart', functions: ['x'], xMin: 3, xMax: 1 }).errors[0], /"xMin" must be smaller/);
  assert.match(readSpec({ kind: 'chart' }).errors[0], /needs "series"/);

  const clean = readSpec({ kind: 'flow', nodes: [{ id: 'a', label: 'A', shape: 'star', color: 'pinkish', group: 'g' }, { id: 'b' }, { id: 'lonely' }], edges: [{ from: 'a', to: 'b' }] });
  assert.equal(clean.spec.nodes[0].shape, 'box');
  assert.equal(clean.spec.nodes[0].color, 'gray');
  assert.equal(clean.spec.nodes[1].label, 'b', 'a box without a label shows its id');
  assert.deepEqual(clean.spec.groups, [{ id: 'g', label: 'g' }]);
  assert.match(clean.warnings[0], /One box has no arrow: "lonely"/);
  assert.match(readSpec({ kind: 'flow', nodes: Array.from({ length: 30 }, (_, i) => ({ id: `n${i}` })), edges: Array.from({ length: 29 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}` })) }).warnings[0], /30 boxes make a crowded picture/);
  assert.match(readSpec({ kind: 'flow', nodes: Array.from({ length: 61 }, (_, i) => ({ id: `n${i}` })) }).errors[0], /too many/);
  assert.match(readSpec({ kind: 'chart', functions: ['x^2'] }).warnings[0], /from -10 to 10/);
  assert.equal(readSpec({ kind: 'chart', functions: ['x'], xMin: '0', xMax: 5 }).spec.xMin, 0);
});

test('flowcharts: boxes never overlap, labels fit, arrows go around boxes', () => {
  const spec = readSpec({
    kind: 'flow',
    nodes: [{ id: 'q', label: 'Question arrives', shape: 'pill' }, { id: 'try', label: 'Learner attempts it first', group: 'g' }, { id: 'ok', label: 'Attempt correct?', shape: 'diamond', group: 'g' }, { id: 'hint', label: 'Give the smallest useful hint', group: 'g' }, { id: 'explain', label: 'Learner explains it back in their own words' }, { id: 'teach', label: 'Teach the idea, using the attempt' }, { id: 'later', label: 'Ask again in three days' }],
    edges: [{ from: 'q', to: 'try' }, { from: 'try', to: 'ok' }, { from: 'ok', to: 'hint', label: 'no' }, { from: 'hint', to: 'try', label: 'try again', dashed: true }, { from: 'ok', to: 'explain', label: 'yes' }, { from: 'ok', to: 'teach', label: 'stuck' }, { from: 'teach', to: 'explain' }, { from: 'explain', to: 'later' }, { from: 'later', to: 'later', label: 'repeat' }],
    groups: [{ id: 'g', label: 'Productive struggle' }],
  }).spec;
  for (const direction of ['down', 'right']) {
    const drawing = layoutFlow({ ...spec, direction });
    const nodes = nodesOf(drawing);
    assert.equal(nodes.length, 7);
    for (let i = 0; i < nodes.length; i += 1) for (let j = i + 1; j < nodes.length; j += 1) assert.ok(!overlap(nodes[i], nodes[j]), `${direction}: ${nodes[i].id} and ${nodes[j].id}`);
    for (const node of nodes) assert.ok(node.textWidth <= node.inner, `${direction}: the label of ${node.id} fits`);
    // Reading left to right, this chain of seven steps is wide, and the check says so.
    assert.deepEqual(inspect(drawing, { ...spec, direction }), direction === 'down' ? [] : [`The picture is very large (${Math.round(drawing.width)} × ${Math.round(drawing.height)}). Split it into smaller diagrams.`], direction);
    // The loop back from "hint" to "try" does not turn the picture upside down: "try" stays before "ok".
    const at = (id) => nodes.find((node) => node.id === id);
    if (direction === 'down') assert.ok(at('q').y < at('try').y && at('try').y < at('ok').y && at('ok').y < at('hint').y);
    else assert.ok(at('q').x < at('try').x && at('try').x < at('ok').x && at('ok').x < at('hint').x);
    // The frame of the group holds its three members and nothing else.
    const frame = drawing.boxes.find((box) => box.kind === 'group');
    assert.deepEqual(nodes.filter((node) => overlap(frame, node)).map((node) => node.id).sort(), ['hint', 'ok', 'try']);
    assert.match(drawing.outline, /"Attempt correct\?" → "Give the smallest useful hint" \[no\]/);
  }
  assert.equal(nodesOf(layoutFlow(readSpec({ kind: 'flow', nodes: [{ id: 'only' }] }).spec)).length, 1);
});

test('random flowcharts stay sound', () => {
  let seed = 12345;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const words = ['Start', 'Check the input value', 'Save', 'A rather long label for a box that must wrap', 'Done?', 'Retry', 'Report', 'x'];
  for (let round = 0; round < 250; round += 1) {
    const count = 2 + Math.floor(random() * 14);
    const nodes = Array.from({ length: count }, (_, i) => ({ id: `n${i}`, label: words[Math.floor(random() * words.length)], shape: ['box', 'diamond', 'pill', 'round', 'note'][Math.floor(random() * 5)], group: random() < 0.3 ? `g${Math.floor(random() * 2)}` : undefined }));
    const edges = Array.from({ length: Math.floor(count * (0.8 + random())) }, () => ({ from: `n${Math.floor(random() * count)}`, to: `n${Math.floor(random() * count)}`, label: random() < 0.4 ? 'label' : '' }));
    const result = draw({ kind: 'flow', direction: random() < 0.5 ? 'right' : 'down', title: random() < 0.5 ? 'A title' : '', nodes, edges });
    assert.ok(result.ok, `round ${round}`);
    assertSound(result.svg(), `round ${round}`);
    const drawing = layoutFlow(readSpec({ kind: 'flow', nodes, edges }).spec);
    const boxes = nodesOf(drawing);
    for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) assert.ok(!overlap(boxes[i], boxes[j]), `round ${round}: ${boxes[i].id} and ${boxes[j].id} overlap`);
    for (const box of boxes) assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.w <= drawing.width && box.y + box.h <= drawing.height, `round ${round}: ${box.id} is inside the picture`);
  }
});

test('trees, sequences and timelines', () => {
  const tree = draw({ kind: 'tree', title: 'Kinds of memory', root: { label: 'Human memory', children: [{ label: 'Sensory memory' }, { label: 'Short-term memory', children: ['Working memory'] }, { label: 'Long-term memory', children: [{ label: 'Explicit', children: [{ label: 'Episodic' }, { label: 'Semantic' }] }, { label: 'Implicit' }] }] } });
  assert.ok(tree.ok);
  assert.deepEqual(tree.problems, []);
  assert.match(tree.outline, /Tree growing to the right: 9 boxes, 4 levels\.\n- Human memory\n {2}- Sensory memory/);
  assertSound(tree.svg(), 'tree');
  const down = draw({ kind: 'tree', direction: 'down', root: { label: 'A', children: [{ label: 'B', children: [{ label: 'D' }, { label: 'E' }] }, { label: 'C' }] } });
  assert.match(down.outline, /downwards: 5 boxes, 3 levels/);
  assert.deepEqual(down.problems, []);

  const sequence = draw({ kind: 'sequence', actors: [{ id: 'b', label: 'Browser' }, { id: 'd', label: 'DNS server' }, { id: 's', label: 'Web server' }], steps: [{ from: 'b', to: 'd', label: 'Where is example.com?' }, { from: 'd', to: 'b', label: '93.184.216.34', reply: true }, { from: 'b', to: 's', label: 'GET /index.html with a rather long label that has to be given room' }, { from: 's', to: 's', label: 'Build the page' }, { note: 'The server may read a database here.', over: ['s'] }, { from: 's', to: 'b', label: '200 OK', reply: true }] });
  assert.ok(sequence.ok);
  assert.deepEqual(sequence.problems, []);
  assert.match(sequence.outline, /3 parties \(Browser, DNS server, Web server\) and 6 steps/);
  assert.match(sequence.outline, /2\. DNS server → Browser \(reply\): 93\.184\.216\.34/);
  assert.match(sequence.outline, /5\. Note: The server may read a database here\./);
  assertSound(sequence.svg(), 'sequence');

  const timeline = draw({ kind: 'timeline', title: 'Flight', events: [{ when: '1903', title: 'First powered flight', text: 'The Wright brothers fly 37 metres.' }, { year: 1969, label: 'First crewed Moon landing' }] });
  assert.ok(timeline.ok);
  assert.deepEqual(timeline.problems, []);
  assert.match(timeline.outline, /- 1903: First powered flight \(The Wright brothers fly 37 metres\.\)\n- 1969: First crewed Moon landing/);
  assertSound(timeline.svg(), 'timeline');
});

test('charts place values from the numbers', () => {
  assert.deepEqual(niceAxis(0, 210).ticks, [0, 50, 100, 150, 200, 250]);
  assert.deepEqual(niceAxis(-7, 13).ticks, [-10, -5, 0, 5, 10, 15]);
  assert.deepEqual(niceAxis(0.02, 0.09).ticks, [0.02, 0.04, 0.06, 0.08, 0.1]);
  assert.equal(niceAxis(5, 5).ticks.includes(5), true, 'a single value still gets an axis around it');
  assert.equal(numberText(1200), '1,200');
  assert.equal(numberText(0.30000001), '0.3');
  assert.equal(numberText(-3), '-3');
  assert.equal(numberText(12345678901), '1.23e10');
  assert.equal(numberText(NaN), '–');

  const bars = draw({ kind: 'chart', title: 'Sales', categories: ['North', 'South West', 'East'], series: [{ name: 'Q1', values: [120, 80, 210] }, { name: 'Q2', values: [135, 95, 190] }], yLabel: 'thousand euros' });
  assert.ok(bars.ok);
  assert.deepEqual(bars.problems, []);
  assert.match(bars.outline, /Bar chart over 3 categories; vertical axis from 0 to 250 in steps of 50\./);
  assert.match(bars.outline, /Q1: North = 120, South West = 80, East = 210/);
  // The bar for 210 is exactly 210/250 of the plot's height.
  const svg = bars.svg();
  const heights = [...svg.matchAll(/<rect class="f1"[^>]*height="([\d.]+)" rx="2"/g)].map((match) => Number(match[1])).slice(0, 3);
  assert.deepEqual(heights, [(120 / 250) * 320, (80 / 250) * 320, (210 / 250) * 320].map((value) => Math.round(value * 10) / 10));
  assertSound(svg, 'bars');

  const plot = layoutChart(readSpec({ kind: 'chart', functions: [{ formula: 'x^2 - 3' }, { formula: '2x + 1', name: 'line' }], xMin: -4, xMax: 4 }).spec);
  assert.match(plot.outline, /Plot; horizontal axis from -4 to 4, vertical axis from -10 to 15\./);
  assert.match(plot.outline, /Curve y = x\^2 - 3 for x from -4 to 4\. Points on it: \(-4, 13\) \(-3, 6\) \(-2, 1\) \(-1, -2\) \(0, -3\) \(1, -2\) \(2, 1\) \(3, 6\) \(4, 13\)/);
  assert.match(plot.outline, /Curve line .*\(0, 1\) \(1, 3\)/);

  // A formula with a break is drawn in pieces and does not flatten the picture.
  const wild = draw({ kind: 'chart', functions: ['1/x'], xMin: -4, xMax: 4 });
  assert.ok(wild.ok);
  assert.match(wild.problems.join(' '), /far outside the picture/);
  assert.ok((wild.svg().match(/<path class="s1"[^>]*d="[^"]*"/)[0].match(/M/g) ?? []).length >= 2, 'the pen is lifted at the break');
  const chosen = draw({ kind: 'chart', functions: ['tan(x)'], xMin: -4, xMax: 4, yMin: -5, yMax: 5 });
  assert.deepEqual(chosen.problems, []);

  const points = draw({ kind: 'chart', chart: 'line', series: [{ name: 'measured', points: [[0, 90], [2, 78], [4, 69]] }], functions: [{ formula: '20 + 70exp(-0.08x)', name: 'model' }], xMin: 0, xMax: 12 });
  assert.ok(points.ok);
  assert.match(points.outline, /measured \(3\): \(0, 90\) \(2, 78\) \(4, 69\)/);
  assertSound(points.svg(), 'points');
  assert.ok(draw({ kind: 'chart', categories: ['a', 'b'], chart: 'line', series: [{ values: [1, -2] }] }).ok);
});

test('the check finds what a reader would stumble over', () => {
  const box = (id, x, y, extra = {}) => ({ kind: 'node', id, x, y, w: 100, h: 40, textWidth: 60, inner: 88, ...extra });
  const clean = { width: 400, height: 300, boxes: [box('a', 10, 10), box('b', 150, 10)], labels: [], crossings: 0 };
  assert.deepEqual(inspect(clean, { edges: [] }), []);
  const messy = {
    width: 400,
    height: 300,
    boxes: [box('a', 10, 10), box('b', 60, 20), box('c', 200, 200, { textWidth: 120 }), box('d', 350, 280), { kind: 'group', id: 'g', x: 0, y: 0, w: 180, h: 70 }],
    labels: [{ kind: 'label', text: 'yes', x: 20, y: 20, w: 30, h: 16 }, { kind: 'label', text: 'no', x: 30, y: 24, w: 30, h: 16 }],
    crossings: 9,
  };
  const found = inspect(messy, { edges: Array.from({ length: 6 }), direction: 'down' }).join('\n');
  assert.match(found, /The boxes "a" and "b" overlap/);
  assert.match(found, /The text of "c" does not fit its box/);
  assert.match(found, /The arrow label "yes" sits on top of the box "a"/);
  assert.match(found, /The arrow labels "yes" and "no" overlap/);
  assert.match(found, /The frame of the group "g" also covers "a", "b"/);
  assert.match(found, /9 arrows cross each other.*direction "right"/);
  assert.match(found, /falls outside the picture/);
  assert.match(inspect({ ...clean, width: 3000 }, {}).join(' '), /very large/);
});

test('drawing end to end: themes, titles, errors', () => {
  const good = draw({ kind: 'flow', title: 'Tea <with> "milk" & sugar', nodes: [{ id: 'a', label: 'Boil <water>' }, { id: 'b', label: 'Pour & wait' }], edges: [{ from: 'a', to: 'b', label: '100 °C' }] });
  assert.ok(good.ok);
  assert.equal(good.kind, 'flow');
  const auto = good.svg();
  assertSound(auto, 'auto');
  assert.ok(auto.includes('prefers-color-scheme: dark'));
  assert.ok(auto.includes('Boil &lt;water&gt;') && auto.includes('Pour &amp; wait') && auto.includes('Tea &lt;with&gt; &quot;milk&quot; &amp; sugar'));
  assert.ok(auto.includes('<rect class="bg"'));
  const dark = good.svg({ theme: 'dark', background: false });
  assert.ok(!dark.includes('prefers-color-scheme') && dark.includes('#ececea') && !dark.includes('<rect class="bg"'));
  assert.ok(good.svg({ theme: 'light' }).includes('#1f1f1d'));
  assert.ok(good.height > draw({ kind: 'flow', nodes: [{ id: 'a', label: 'Boil <water>' }, { id: 'b', label: 'Pour & wait' }], edges: [{ from: 'a', to: 'b' }] }).height, 'a title takes room');

  const bad = draw({ kind: 'flow', nodes: [{ id: 'a' }], edges: [{ from: 'a', to: 'nowhere' }] });
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0], /"nowhere"/);
  assert.equal(draw('a flowchart please').ok, false);
  for (const kind of KINDS) assert.equal(draw({ kind }).ok, false, `${kind} with nothing in it`);
  assertSound(document({ width: 10, height: 10, title: 't', body: '' }), 'empty');
  assert.equal(COLORS.length, 7);
});

test('saving, the answer to the model, settings and the skill', (t) => {
  assert.equal(slug('How a Bill Becomes Law!'), 'how-a-bill-becomes-law');
  assert.equal(slug('Écoulement d’eau.svg'), 'ecoulement-d-eau');
  assert.equal(slug('../../etc/passwd'), 'etc-passwd');
  assert.equal(slug(''), 'diagram');
  assert.equal(slug('x'.repeat(90)).length, 48);

  const dir = mkdtempSync(join(tmpdir(), 'dsh-diagram-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.equal(savePath(dir, 'water', false), join(dir, 'water.svg'));
  writeFileSync(join(dir, 'water.svg'), `<svg>${MARK}</svg>`);
  assert.equal(savePath(dir, 'water', false), join(dir, 'water-2.svg'), 'a title that is already used gets a number');
  assert.equal(savePath(dir, 'water', true), join(dir, 'water.svg'), 'a name the model chose replaces its own earlier drawing');
  writeFileSync(join(dir, 'mine.svg'), '<svg>drawn by the user</svg>');
  assert.equal(savePath(dir, 'mine', true), join(dir, 'mine-2.svg'), 'a file that is not ours is never replaced');
  assert.ok(existsSync(join(dir, 'mine.svg')) && readFileSync(join(dir, 'mine.svg'), 'utf8').includes('by the user'));

  const result = draw({ kind: 'flow', title: 'Tea', nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [{ from: 'a', to: 'b' }] });
  const text = answerText(result, { id: 'abcdef012345', file: '/work/diagrams/tea.svg' });
  assert.match(text, /^Drawn: Tea \(flow, \d+ × \d+\)\. It is shown to the user in the chat\.\nSaved as: \/work\/diagrams\/tea\.svg\nDiagram id: abcdef012345/);
  assert.match(text, /What was drawn:\nFlowchart reading top to bottom: 3 boxes, 1 arrows\./);
  assert.match(text, /Problems to fix \(1\):\n- One box has no arrow: "c"/);
  assert.match(text, /again with the same "name"/);
  assert.match(answerText(draw({ kind: 'tree', root: { label: 'a', children: ['b'] } }), { id: 'abcdef012345', note: 'It was not saved as a file, because this conversation has no folder.' }), /no folder\.\nDiagram id[\s\S]*No problems found/);

  // The chat shows, under a turn, the drawings made in it: the last version of each only.
  const rows = [
    { id: 'a1', session: 's', at: 1000, title: 'Tea', file: '/w/diagrams/tea.svg' },
    { id: 'b1', session: 's', at: 2000, title: 'Plot', file: '' },
    { id: 'a2', session: 's', at: 3000, title: 'Tea, fixed', file: '/w/diagrams/tea.svg' },
    { id: 'c1', session: 'other', at: 2500, title: 'Elsewhere', file: '' },
    { id: 'd1', session: 's', at: 90000, title: 'Next turn', file: '' },
  ];
  assert.deepEqual(turnDrawings(rows, 's', 500, 4000).map((row) => row.id), ['b1', 'a2']);
  assert.deepEqual(turnDrawings(rows, 's', 80000, 95000).map((row) => row.id), ['d1']);
  assert.deepEqual(turnDrawings(rows, '', 0, 1e9), []);
  assert.deepEqual(turnDrawings(rows, 's', NaN, 4000), []);

  assert.deepEqual(readSettings({}), { enabled: true, theme: 'auto', folder: 'diagrams', save: true });
  assert.deepEqual(readSettings({ enabled: false, theme: 'neon', folder: ' ../../Secret Stuff/ ', save: Object.freeze({ get: () => false }) }), { enabled: false, theme: 'auto', folder: 'Secret Stuff', save: false });
  assert.equal(readSettings({ folder: '...' }).folder, 'diagrams');

  assert.deepEqual(PARAMETERS.required, ['kind']);
  assert.deepEqual(PARAMETERS.properties.kind.enum, KINDS);
  const skill = SKILLS[0];
  assert.equal(skill.name, 'draw-diagram');
  assert.ok(skill.content.includes('diagram_draw') && skill.content.includes('Never write SVG'));
  // Every example in the skill is a description the tool accepts and draws without problems.
  const examples = [...skill.content.matchAll(/`{1,3}(?:json\n)?(\{"kind"[\s\S]*?\})\n?`{1,3}/g)].map((match) => JSON.parse(match[1]));
  assert.equal(examples.length, 7);
  for (const example of examples) {
    const drawn = draw(example);
    assert.ok(drawn.ok, JSON.stringify(example).slice(0, 60));
    assert.deepEqual(drawn.problems, [], JSON.stringify(example).slice(0, 60));
  }
  assert.ok(skill.content.length < 4200, 'the skill stays short');
});
