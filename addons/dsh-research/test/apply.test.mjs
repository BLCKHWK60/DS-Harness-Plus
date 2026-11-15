// The Research add-on with a stand-in app: the mode it hands to Modes, and what it asks of Deep research.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply } from '../index.js';
import { MODE, MODE_ID } from '../lib/mode.js';

/** The add-on on a stand-in app whose Modes settings hold `extraModes`. */
function plugin(extraModes, { modeOf = () => 'cowork', depthOf, agents = [] } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'research-apply-'));
  const writes = [];
  const provided = {};
  const disposers = [];
  let stored = extraModes;
  const settings = {
    describe: () => [{ ns: 'modes', value: { extraModes: stored, defaultMode: 'cowork' } }],
    mutate: async (ns, ops) => {
      writes.push({ ns, ops });
      for (const op of ops) if (ns === 'modes' && op.path[0] === 'extraModes') stored = op.value;
    },
  };
  const services = { dshHomePath: (name) => join(home, name), settings, deepResearch: {}, modes: { get: modeOf, ...(depthOf ? { depthOf } : {}) }, agents: { list: () => agents } };
  const ctx = {
    get: (key) => services[key],
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
  apply(ctx, { enabled: true, focus: 'news', folder: '' });
  return {
    writes,
    provided,
    stored: () => stored,
    close() {
      for (const dispose of disposers) dispose();
      rmSync(home, { recursive: true, force: true });
    },
  };
}

const settle = () => new Promise((done) => setTimeout(done, 20));

test('switched on, Research is added to Modes as a Read Only mode', async () => {
  const app = plugin('{}');
  try {
    await settle();
    const research = JSON.parse(app.stored())[MODE_ID];
    assert.equal(research.sandbox, 'read-only');
    assert.deepEqual(research, MODE);
  } finally {
    app.close();
  }
});

test('a Research mode stored by an older version (sandbox inherit) is rewritten as Read Only', async () => {
  const app = plugin(JSON.stringify({ [MODE_ID]: { ...MODE, sandbox: 'inherit' } }));
  try {
    await settle();
    assert.equal(app.writes.length, 1);
    assert.equal(JSON.parse(app.stored())[MODE_ID].sandbox, 'read-only');
  } finally {
    app.close();
  }
});

test('Deep research gets the focus, follow-ups and saving only in a Research conversation', async () => {
  const app = plugin('{}', { modeOf: (id) => (id === 'conv-r' ? MODE_ID : 'cowork') });
  try {
    await settle();
    assert.deepEqual(app.provided.research.runOptions('conv-r'), { focus: 'news', followups: true, save: true });
    assert.deepEqual(app.provided.research.runOptions('conv-c'), {});
  } finally {
    app.close();
  }
});

test('the selection note gives the Depth of the conversation itself (the same Depth as every tab)', async () => {
  const sections = new Map();
  const agentOf = (id) => ({ id, ctx: { effect: (fn) => fn(), systemPrompt: { section: (spec) => { sections.set(id, spec); return () => {}; } } } });
  const depths = { 'conv-a': 'thorough', 'conv-b': 'quick' };
  const app = plugin('{}', { modeOf: () => MODE_ID, depthOf: (id) => depths[id], agents: [agentOf('conv-a'), agentOf('conv-b'), agentOf('conv-c')] });
  try {
    await settle();
    assert.match(sections.get('conv-a').text(), /depth Thorough \(about 45 minutes\)/);
    assert.match(sections.get('conv-b').text(), /depth Quick \(about 10 minutes\)/);
    assert.match(sections.get('conv-c').text(), /depth Standard \(about 25 minutes\)/, 'unknown: Standard');
  } finally {
    app.close();
  }
});
