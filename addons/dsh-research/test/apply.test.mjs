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
  const helper = { id: 'helper-r', session: { header: { parentSession: 'conv-r' } } };
  const app = plugin('{}', { modeOf: (id) => (id === 'conv-r' || id === 'helper-r' ? MODE_ID : 'cowork'), agents: [helper] });
  try {
    await settle();
    assert.deepEqual(app.provided.research.runOptions('conv-r'), { focus: 'news', followups: true, save: true });
    assert.deepEqual(app.provided.research.runOptions('conv-c'), {});
    // A Long run's helper doing research: no follow-up questions (nobody to click them).
    assert.equal(app.provided.research.runOptions('helper-r').followups, false);
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

test('Scratch: a report made in a Scratch conversation stays listed, and goes when that conversation is deleted for good', async () => {
  const { existsSync, mkdtempSync: temp } = await import('node:fs');
  const home = temp(join(tmpdir(), 'research-scratch-'));
  const provided = {};
  const listeners = [];
  const services = {
    dshHomePath: (name) => join(home, name),
    settings: { describe: () => [{ ns: 'modes', value: { extraModes: '{}', defaultMode: 'cowork' } }], mutate: async () => {} },
    modes: { get: () => 'research' },
    agents: { get: (id) => ({ id }), list: () => [] },
    coworkScratch: { folderOf: (agent) => (agent.id === 'session-scratch1' ? '/x/scratch/session-scratch1' : '') },
  };
  const trash = { onErased: (fn) => { listeners.push(fn); return () => {}; } };
  const ctx = {
    get: (key) => services[key],
    on() {},
    effect(fn) { fn(); },
    provide(name, value) { provided[name] = value; },
    inject(deps, fn) { if (deps.includes('coworkTrash')) fn({ coworkTrash: trash, effect: (make) => make() }); },
    logger: { warn() {}, info() {} },
  };
  try {
    apply(ctx, { enabled: true, focus: 'web', folder: '' });
    const scratchFile = provided.research.saveReport('session-scratch1', { question: 'Scratch question', text: 'Body.' });
    const plainFile = provided.research.saveReport('session-plain01', { question: 'Plain question', text: 'Body.' });
    assert.equal(existsSync(scratchFile), true);
    assert.equal(listeners.length, 1);
    await listeners[0](['session-plain01']);
    assert.equal(existsSync(plainFile), true, 'a conversation outside Scratch keeps its reports');
    await listeners[0](['session-scratch1']);
    assert.equal(existsSync(scratchFile), false, 'gone with its Scratch conversation');
    assert.equal(existsSync(plainFile), true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('Scratch: reports in a folder you picked yourself are never removed', async () => {
  const { existsSync, mkdtempSync: temp } = await import('node:fs');
  const home = temp(join(tmpdir(), 'research-scratch-'));
  const own = temp(join(tmpdir(), 'research-own-'));
  const provided = {};
  const listeners = [];
  const services = {
    dshHomePath: (name) => join(home, name),
    settings: { describe: () => [{ ns: 'modes', value: { extraModes: '{}', defaultMode: 'cowork' } }], mutate: async () => {} },
    modes: { get: () => 'research' },
    agents: { get: (id) => ({ id }), list: () => [] },
    coworkScratch: { folderOf: () => '/x/scratch/thread' },
  };
  const ctx = {
    get: (key) => services[key], on() {}, effect(fn) { fn(); }, provide(name, value) { provided[name] = value; },
    inject(deps, fn) { if (deps.includes('coworkTrash')) fn({ coworkTrash: { onErased: (fn2) => { listeners.push(fn2); return () => {}; } }, effect: (make) => make() }); },
    logger: { warn() {}, info() {} },
  };
  try {
    apply(ctx, { enabled: true, focus: 'web', folder: own });
    const file = provided.research.saveReport('session-scratch1', { question: 'Q', text: 'Body.' });
    await listeners[0](['session-scratch1']);
    assert.equal(existsSync(file), true);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(own, { recursive: true, force: true });
  }
});
