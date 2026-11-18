/**
 * The one Web selector (18 November 2026): Research's Focus is the Web selector's ticks. Each conversation's
 * News or Academic focus and a starting focus other than Web are carried over once; nothing is removed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FOCUS_TICKS, apply, focusFromTicks } from '../index.js';

test('a run\'s focus follows the ticks: Academic or News only (with verified sources) is that focus, anything else is Web', () => {
  assert.equal(focusFromTicks(undefined), 'web');
  assert.equal(focusFromTicks(['verified', 'academic']), 'academic');
  assert.equal(focusFromTicks(['academic']), 'academic');
  assert.equal(focusFromTicks(['verified', 'news', 'other']), 'news');
  assert.equal(focusFromTicks(['academic', 'news']), 'web');
  assert.equal(focusFromTicks(['verified', 'forums']), 'web');
  assert.deepEqual(FOCUS_TICKS, { news: ['verified', 'news'], academic: ['verified', 'academic'] });
});

test('on a stand-in app: each conversation\'s News or Academic focus and the starting focus are carried over once; then the focus comes from the ticks', async () => {
  const home = mkdtempSync(join(tmpdir(), 'research-ws-'));
  mkdirSync(join(home, 'research'), { recursive: true });
  writeFileSync(join(home, 'research', 'conversations.json'), JSON.stringify({ c1: 'news', c2: 'web', c3: 'academic' }));
  const carried = [];
  const ticks = { c1: ['verified', 'news'] };
  let modeStart = '{"research":{"depth":"quick"}}';
  const config = { enabled: true, focus: 'academic', folder: '', focusMoved: false };
  const writes = [];
  const settings = {
    describe: () => [{ ns: 'modes', value: { extraModes: '{}', defaultMode: 'cowork', modeStart } }],
    mutate: async (ns, ops) => {
      writes.push({ ns, ops });
      for (const op of ops) {
        if (ns === 'modes' && op.path[0] === 'modeStart') modeStart = op.value;
        if (ns === 'research' && op.path[0] === 'focusMoved') config.focusMoved = op.value;
      }
    },
  };
  const modes = {
    get: () => 'research',
    webSources: (id) => ticks[id],
    carryWebSources: async (id, list) => {
      carried.push([id, list]);
      return true;
    },
  };
  const provided = {};
  const disposers = [];
  const ctx = {
    get: (key) => ({ dshHomePath: (name) => join(home, name), settings, deepResearch: {}, modes, agents: { list: () => [] } })[key],
    on() {},
    effect(fn) {
      const dispose = fn();
      if (typeof dispose === 'function') disposers.push(dispose);
    },
    provide(name, value) {
      provided[name] = value;
    },
    inject() {},
    logger: { warn() {} },
  };
  try {
    apply(ctx, config);
    await new Promise((done) => setTimeout(done, 30));
    assert.deepEqual(carried, [['c1', ['verified', 'news']], ['c3', ['verified', 'academic']]], 'Web needs nothing; News and Academic become their ticks');
    assert.deepEqual(JSON.parse(modeStart).research, { depth: 'quick', sources: ['verified', 'academic'] }, 'the starting focus becomes the tab\'s starting ticks, beside what was there');
    assert.equal(config.focusMoved, true);
    assert.equal(JSON.parse(readFileSync(join(home, 'research', 'conversations.json'), 'utf8')).c1, 'news', 'the old record stays');
    assert.equal(provided.research.runOptions('c1').focus, 'news');
    assert.equal(provided.research.runOptions('c3').focus, 'web', 'from its ticks now (none stored here: All)');
    const before = writes.length;
    await new Promise((done) => setTimeout(done, 10));
    assert.equal(writes.length, before, 'once');
  } finally {
    for (const dispose of disposers) dispose();
    rmSync(home, { recursive: true, force: true });
  }
});
