import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_TABS } from '../index.js';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

test('Content, Devices and Creator Plus start pages offer starter chips, in step in the page code and the setting default', () => {
  for (const id of ['content', 'bench', 'creator-plus']) {
    const chips = DEFAULT_TABS[id]?.chips ?? [];
    assert.ok(chips.length >= 3, `${id} has starter chips`);
    for (const chip of chips) {
      assert.ok(chip.label && chip.prompt && chip.icon, `${id}: ${chip.label}`);
      assert.doesNotMatch(`${chip.label} ${chip.prompt}`, /\b(session|composer|plugin|route|adapter)s?\b/i, `${id}: plain words`);
      assert.ok(source.includes(`"label": "${chip.label}"`) && source.includes(`"prompt": "${chip.prompt}"`), `${id}: the page code has the same chip "${chip.label}"`);
    }
  }
});

test('the chat box line before you type fits the tab; Code says threads, not sessions', () => {
  const block = source.slice(source.indexOf('const PLACEHOLDERS = {'), source.indexOf('const PLACEHOLDER_CSS'));
  assert.match(block, /chat: 'Ask anything'/);
  assert.match(block, /cowork: '/);
  assert.match(block, /\bcode: '[^']*@ files or threads'/, 'Code has its own line, with threads');
  for (const line of block.matchAll(/: '([^']+)'/g)) assert.doesNotMatch(line[1], /\b(session|composer|plugin|route|adapter)s?\b/i, line[1]);
  // CSS only: no script watches the box.
  assert.match(source, /\[class\*='_grow'\]:has\(\[data-composer-input\]\) > \[class\*='_placeholder'\]/);
});
