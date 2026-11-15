/**
 * The Modes add-on in a stand-in app, for what only shows when it runs whole: a scheduled Finance
 * brief that Finance moves on purpose stays in Finance through its first turn, with the Cowork
 * sidebar on; `/mode` before the first message keeps today's rule (the tab decides); and the
 * service says when a conversation has no tools to work with.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate as tick } from 'node:timers/promises';
import { apply, Config } from '../index.js';

const FINANCE = { label: 'Finance', tools: 'all', sandbox: 'inherit', defaultTier: '', prompt: 'Finance method.' };

/** Modes on stand-in services. `tabs` turns the Cowork sidebar on. */
function running({ tabs = true, extra = { finance: FINANCE }, defaultMode = 'cowork' } = {}) {
  const config = Config({ extraModes: JSON.stringify(extra), defaultMode });
  const handlers = new Map();
  const agents = new Map();
  const disposers = [];
  const settings = {
    describe: () => [{ ns: 'modes', value: config }],
    mutate: async (ns, ops) => {
      for (const op of ops) if (op.op === 'set') config[op.path[0]] = op.value;
    },
  };
  const services = {
    settings,
    agents: { get: (id) => agents.get(id), list: () => [...agents.values()] },
    ...(tabs ? { coworkShell: {} } : {}),
  };
  let service;
  const ctx = {
    logger: { warn: () => {}, info: () => {}, error: () => {} },
    get: (name) => (name === 'modes' ? service : services[name]),
    on: (name, handler) => {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
      return () => {};
    },
    effect: (start) => {
      const stop = start();
      if (typeof stop === 'function') disposers.push(stop);
      return stop;
    },
    provide: (name, value) => {
      if (name === 'modes') service = value;
      return () => {};
    },
    inject: () => {},
    tools: { definitions: () => [], view: () => new Map(), guard: () => () => {}, register: () => () => {}, restrict: () => () => {} },
  };
  apply(ctx, config);
  const emit = async (name, ...args) => {
    for (const handler of handlers.get(name) ?? []) await handler(...args);
  };
  /** A conversation that has not run a turn yet; `masks` records the tool masks put on it. */
  const open = async (id) => {
    const masks = [];
    const agent = {
      id,
      status: 'idle',
      phase: { kind: 'idle', lastTurn: 0 },
      header: {},
      session: { header: {} },
      ctx: {
        effect: (start) => start(),
        tools: { restrict: (mask) => { const entry = { mask, undone: false }; masks.push(entry); return () => { entry.undone = true; }; } },
      },
      model: { current: () => ({ provider: 'p', model: 'm' }) },
    };
    agents.set(id, agent);
    await emit('agent/created', { agent });
    return { agent, masks };
  };
  const reminder = { type: 'agent/inbox/spliced', data: { inserted: [{ source: { kind: 'schedule' }, content: [{ type: 'text', text: '[SCHEDULE REMINDER]' }] }] } };
  /** The first turn starts: the app reports the agent running. */
  const firstTurn = async (agent) => {
    agent.status = 'running';
    agent.phase = { kind: 'running', lastTurn: 0 };
    await emit('agent/status', { agent, status: 'running' });
  };
  return { config, service: () => service, open, emit, reminder, firstTurn, stop: () => disposers.forEach((stop) => stop()) };
}

const sessionModes = (config) => JSON.parse(config.sessionModes || '{}');

test('a scheduled brief that Finance claims stays in Finance through its first turn, with the sidebar on', async () => {
  const app = running();
  try {
    const { agent, masks } = await app.open('brief-1');
    await app.emit('session/event', { id: 'brief-1' }, app.reminder);
    // Finance moves it while it is still idle, before the first turn.
    await app.service().set('brief-1', 'finance', { claim: true });
    assert.equal(app.service().get('brief-1'), 'finance');
    await app.firstTurn(agent);
    await tick();
    assert.equal(app.service().get('brief-1'), 'finance', 'the first turn did not pin the tab\'s mode over it');
    assert.equal(sessionModes(app.config)['brief-1'], 'finance');
    // Finance has all tools: Cowork's trimmed list, put on at the start, was taken off again.
    assert.ok(masks.length > 0, 'Cowork was applied first');
    assert.ok(masks.every((entry) => entry.undone), 'no restriction left from Cowork');
  } finally {
    app.stop();
  }
});

test('without a claim the tab still decides before the first message (the /mode rule is unchanged)', async () => {
  const app = running();
  try {
    const { agent } = await app.open('plain-1');
    await app.service().set('plain-1', 'finance');
    await app.firstTurn(agent);
    await tick();
    assert.equal(app.service().get('plain-1'), 'cowork', 'the selected tab wins, as before');
    assert.equal(sessionModes(app.config)['plain-1'], 'cowork');
  } finally {
    app.stop();
  }
});

test('a claim made after the first turn is an ordinary switch', async () => {
  const app = running();
  try {
    const { agent } = await app.open('later-1');
    await app.firstTurn(agent);
    agent.status = 'idle';
    await app.service().set('later-1', 'finance', { claim: true });
    assert.equal(app.service().get('later-1'), 'finance');
  } finally {
    app.stop();
  }
});

test('noTools: true for Chat and for tools switched off, false for Cowork', async () => {
  const app = running({ tabs: false });
  try {
    await app.open('chat-1');
    await app.service().set('chat-1', 'chat');
    assert.equal(app.service().noTools('chat-1'), true);
    await app.open('cowork-1');
    await app.service().set('cowork-1', 'cowork');
    assert.equal(app.service().noTools('cowork-1'), false);
    app.config.sessionTools = JSON.stringify({ 'cowork-1': false });
    assert.equal(app.service().noTools('cowork-1'), true);
  } finally {
    app.stop();
  }
});

test('webOff: Chat starts with Web Off, Cowork with Web on, and the Web button decides after that', async () => {
  const app = running({ tabs: false });
  try {
    await app.open('chat-2');
    await app.service().set('chat-2', 'chat');
    assert.equal(app.service().webOff('chat-2'), true);
    await app.open('cowork-2');
    await app.service().set('cowork-2', 'cowork');
    assert.equal(app.service().webOff('cowork-2'), false);
    app.config.sessionWeb = JSON.stringify({ 'cowork-2': false, 'chat-2': true });
    assert.equal(app.service().webOff('cowork-2'), true);
    assert.equal(app.service().webOff('chat-2'), false);
  } finally {
    app.stop();
  }
});

test('with the Finance tab selected and Finance moving the brief before Modes has seen the reminder, it stays in Finance', async () => {
  const app = running({ defaultMode: 'finance' });
  try {
    const { agent } = await app.open('brief-2');
    // Finance's listener runs first: Modes still reports the tab's mode, Finance claims anyway.
    await app.service().set('brief-2', 'finance', { claim: true });
    await app.emit('session/event', { id: 'brief-2' }, app.reminder);
    await app.firstTurn(agent);
    await tick();
    assert.equal(app.service().get('brief-2'), 'finance', 'the scheduled starting mode (Cowork) did not take it back');
    assert.equal(sessionModes(app.config)['brief-2'], 'finance');
  } finally {
    app.stop();
  }
});

test('real timing: the move is not awaited and the first turn starts at once; Cowork\'s trimmed tools are gone before it runs', async () => {
  const app = running();
  try {
    const { agent, masks } = await app.open('brief-3');
    await app.emit('session/event', { id: 'brief-3' }, app.reminder);
    const before = masks.length;
    assert.ok(before > 0, 'Cowork (trimmed) put its tool list on at the start');
    void app.service().set('brief-3', 'finance', { claim: true });
    // The restriction is lifted synchronously, before the first turn's tools are put together.
    assert.ok(masks.slice(0, before).every((entry) => entry.undone), 'Cowork\'s restriction was undone before the turn');
    await app.firstTurn(agent);
    await tick();
    assert.equal(app.service().get('brief-3'), 'finance');
    assert.equal(sessionModes(app.config)['brief-3'], 'finance');
  } finally {
    app.stop();
  }
});
