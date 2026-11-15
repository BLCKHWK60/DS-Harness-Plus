import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate as tick } from 'node:timers/promises';
import { apply } from '../index.js';
import { briefPrompt } from '../lib/briefs.js';
import { MODE_ID } from '../lib/finance.js';

/**
 * The add-on running in a stand-in app: only the services these tests need.
 * @param {object} options - the settings, each conversation's mode, and the scheduler's tasks.
 * @returns {object} a way to send app events, the calls to the Modes add-on, and a way to stop.
 */
function running({ config, modeOf = {}, catalog = [] }) {
  const handlers = new Map();
  const disposers = [];
  const moves = [];
  const modes = {
    get: (id) => modeOf[id] ?? 'cowork',
    set: async (id, mode, options) => {
      moves.push([id, mode, options]);
      modeOf[id] = mode;
    },
    isolated: () => false,
  };
  const services = { modes, schedule: { create: async () => ({}), catalog: async () => catalog, edit: async () => ({}) }, agents: { list: () => [] } };
  const ctx = {
    logger: { warn: () => {} },
    get: (name) => services[name],
    on: (name, handler) => handlers.set(name, [...(handlers.get(name) ?? []), handler]),
    effect: (start) => {
      const stop = start();
      if (typeof stop === 'function') disposers.push(stop);
      return stop;
    },
    inject: () => {},
  };
  apply(ctx, { enabled: true, ...config });
  const emit = (name, ...args) => {
    for (const handler of handlers.get(name) ?? []) handler(...args);
  };
  /** A conversation or helper agent; returns its Finance prompt section's text. */
  const agent = (id, header = {}) => {
    let section;
    emit('agent/created', { agent: { id, header, ctx: { systemPrompt: { section: (options) => ((section = options), () => {}) }, effect: (start) => start() } } });
    return () => section.text();
  };
  return { emit, agent, moves, stop: () => disposers.forEach((stop) => stop()) };
}

const reminder = (id, prompt) => ({
  type: 'agent/inbox/spliced',
  data: { inserted: [{ source: { kind: 'schedule' }, content: [{ type: 'text', text: `[SCHEDULE REMINDER]\nschedule_id_json: ${JSON.stringify(id)}\noccurrence_at: x\nreminder_prompt_json: ${JSON.stringify(prompt)}` }] }] },
});

test('a brief is moved to Finance at once, before its first turn can start', async () => {
  const app = running({ config: {} });
  try {
    const note = app.agent('s1');
    app.emit('session/event', { id: 's1', header: {} }, reminder('task-a', briefPrompt('NVIDIA', 'United States', 'weekly')));
    // Nothing is awaited before the move: it is asked for while the event is still being handled.
    assert.deepEqual(app.moves, [['s1', MODE_ID, { claim: true }]]);
    assert.match(note(), /Subject: "NVIDIA" \(this conversation was opened by a scheduled task/);
    assert.match(note(), /Market: United States only/);
    // A task that is neither a brief nor marked for Finance stays where it is.
    app.agent('s2');
    app.emit('session/event', { id: 's2', header: {} }, reminder('task-b', 'Summarise my inbox'));
    assert.deepEqual(app.moves, [['s1', MODE_ID, { claim: true }]]);
  } finally {
    app.stop();
  }
});

test('a task of your own marked for Finance is moved at once and named once looked up', async () => {
  const app = running({ config: { financeTasks: ['own-1'], subject: 'Drop-down pick' }, catalog: [{ id: 'own-1', title: 'Morning markets', status: 'active' }] });
  try {
    const note = app.agent('s3');
    app.emit('session/event', { id: 's3', header: {} }, reminder('own-1', 'Tell me what moved overnight'));
    assert.deepEqual(app.moves, [['s3', MODE_ID, { claim: true }]]);
    // Its first turn starts before the name is known; the drop-down selection must not take its place.
    app.emit('session/event', { id: 's3', header: {} }, { type: 'turn/start' });
    await tick();
    assert.match(note(), /Subject: "Morning markets"/);
  } finally {
    app.stop();
  }
});

test('the adviser note and the profile go to the conversation, not to its helpers', () => {
  const app = running({ config: { adviser: true }, modeOf: { s4: MODE_ID, h1: MODE_ID, h2: MODE_ID } });
  try {
    assert.match(app.agent('s4')(), /You are the user's financial adviser/);
    const helper = app.agent('h1', { parentSession: 's4' })();
    assert.ok(!/financial adviser|client's profile/.test(helper), helper);
    // The selection still reaches a helper.
    assert.match(helper, /Subject|subject/);
    assert.ok(!/financial adviser/.test(app.agent('h2', { origin: 'subagent' })()));
  } finally {
    app.stop();
  }
});

test('a brief whose instruction was edited is still known by its title, and moved once looked up', async () => {
  const app = running({ config: {}, catalog: [{ id: 'task-e', title: 'Finance brief: ASML', status: 'active' }] });
  try {
    const note = app.agent('s5');
    app.emit('session/event', { id: 's5', header: {} }, reminder('task-e', 'My own words for this brief'));
    await tick();
    await tick();
    assert.deepEqual(app.moves, [['s5', MODE_ID, { claim: true }]]);
    assert.match(note(), /Subject: "ASML"/);
  } finally {
    app.stop();
  }
});

test('a brief is claimed even when Modes already reports Finance (the Finance tab is the selected one)', async () => {
  const app = running({ config: {}, modeOf: { s6: MODE_ID } });
  try {
    app.agent('s6');
    app.emit('session/event', { id: 's6', header: {} }, reminder('task-f', briefPrompt('ASML', 'Europe', 'weekly')));
    assert.deepEqual(app.moves, [['s6', MODE_ID, { claim: true }]]);
  } finally {
    app.stop();
  }
});
