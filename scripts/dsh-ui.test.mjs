import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'docs/shared/dsh-ui.js'), 'utf8');
// The master is a script block that declares `dshUi`; run it with no document, as the pages do before they draw.
const dshUi = new Function(`${source}\nreturn dshUi;`)();
const React = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }), useState: (v) => [v, () => {}], useRef: () => ({ current: 0 }), useEffect: () => {} };
const ui = dshUi.makeParts(React);
const text = (node) => (node == null || node === false ? '' : typeof node === 'string' ? node : [].concat(node.children ?? []).map(text).join(''));

test('the shared parts draw the classes the style guide describes', () => {
  const row = ui.Row({ title: 'Use it', desc: 'Why' }, ui.Switch({ on: true, label: 'Use it', onChange() {} }));
  assert.equal(row.props.className, 'dshu-row');
  assert.equal(text(row), 'Use itWhy');
  const sw = ui.Switch({ on: true, label: 'Use it', onChange() {}, danger: true });
  assert.equal(sw.props.role, 'switch');
  assert.equal(sw.props['aria-checked'], true);
  assert.equal(sw.props['aria-label'], 'Use it', 'a switch always has a name');
  assert.equal(sw.props['data-danger'], 'true');
  let seen = null;
  ui.Switch({ on: false, label: 'x', onChange: (v) => { seen = v; } }).props.onClick();
  assert.equal(seen, true);
  assert.equal(ui.Button({ main: true, children: 'Go' }).props['data-main'], 'true');
  assert.equal(ui.Page({ title: 'T', desc: 'D' }).children[0].type, 'h2');
});

test('an empty state says what the list is for and offers starter chips', () => {
  const picked = [];
  const empty = ui.Empty({ title: 'Nothing yet', text: 'Do this first', chips: ['One', { label: 'Two', value: '2' }], onPick: (v) => picked.push(v) });
  assert.equal(empty.props.role, 'status');
  const part = empty.children.find((c) => c && typeof c.type === 'function');
  const chips = part.type(part.props);
  assert.equal(chips.props.className, 'dshu-chips');
  assert.equal(chips.children.length, 2);
  chips.children[1].props.onClick();
  chips.children[0].props.onClick();
  assert.deepEqual(picked, ['2', 'One']);
});

test('the shared CSS uses the app\'s colour variables only and keeps a keyboard focus ring', () => {
  const css = /const CSS = `([\s\S]*?)`;/.exec(source)[1];
  const withoutShadows = css.replace(/color-mix\(in srgb, #000[^)]*\)/g, '');
  assert.doesNotMatch(withoutShadows, /#[0-9a-f]{3,8}\b|\brgba?\(|:\s*(?:white|black)\b/i, 'no fixed colours');
  for (const cls of ['dshu-btn', 'dshu-switch', 'dshu-chip']) assert.match(css, new RegExp(`\\.${cls}:focus-visible`), `${cls} has a focus ring`);
  assert.match(css, /prefers-reduced-motion/, 'the switch only animates when motion is allowed');
  for (const name of css.matchAll(/\.([a-z][\w-]*)/g)) assert.match(name[1], /^dshu-/, `${name[1]} starts with dshu-`);
});

test('copying text works without a document (and reports it)', async () => {
  assert.equal(await dshUi.copyText('x'), false);
});

test('every page that uses the parts carries an up to date copy', () => {
  let users = 0;
  for (const name of readdirSync(join(root, 'addons'))) {
    const file = join(root, 'addons', name, 'client.js');
    if (!existsSync(file)) continue;
    const page = readFileSync(file, 'utf8');
    if (!page.includes('// ---- dsh-ui:begin')) { assert.doesNotMatch(page, /\bdshUi\./, `${name} calls dshUi without the block`); continue; }
    users += 1;
    assert.ok(page.includes(source.trimEnd()) || page.replace(/^ +/gm, '').includes(source.trimEnd().replace(/^ +/gm, '')), `${name} copy matches the master`);
  }
  assert.ok(users >= 10, `${users} pages use the shared parts`);
});
