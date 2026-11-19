import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { setImmediate as tick } from 'node:timers/promises';
import { apply } from '../index.js';
import { briefPrompt } from '../lib/briefs.js';
import { MODE_ID } from '../lib/finance.js';

/**
 * The add-on running in a stand-in app: only the services these tests need.
 * @param {object} options - the settings, each conversation's mode, the scheduler's tasks, the
 *   conversations whose Tools are off (a Set; leave it out for a Modes add-on without `noTools`),
 *   whether the app's tool registry is there, and each live conversation's session (header and turns).
 * @returns {object} a way to send app events, the calls to the Modes add-on, the data route, and a way to stop.
 */
function running({ config, modeOf = {}, catalog = [], noTools, tools = false, sessions = {} }) {
  const handlers = new Map();
  const disposers = [];
  const moves = [];
  const routes = new Map();
  const modes = {
    get: (id) => modeOf[id] ?? 'cowork',
    set: async (id, mode, options) => {
      moves.push([id, mode, options]);
      modeOf[id] = mode;
    },
    isolated: () => false,
    ...(noTools ? { noTools: (id) => noTools.has(id) } : {}),
  };
  const agents = {
    list: () => [],
    get: (id) => (sessions[id] ? { id, session: sessions[id] } : undefined),
    // The app's record of a conversation's turns: lastTurn is 0 until the first message.
    turnBoundaryOf: (session) => ({ openTurnStartSeq: null, lastTurn: session.turns ?? 0 }),
  };
  const services = {
    modes,
    agents,
    schedule: { create: async () => ({}), catalog: async () => catalog, edit: async () => ({}) },
    ...(tools ? { tools: { register: () => () => {} } } : {}),
  };
  const ctx = {
    logger: { warn: () => {} },
    get: (name) => services[name],
    on: (name, handler) => handlers.set(name, [...(handlers.get(name) ?? []), handler]),
    effect: (start) => {
      const stop = start();
      if (typeof stop === 'function') disposers.push(stop);
      return stop;
    },
    inject: (_names, use) => use({
      effect: (start) => start(),
      webServer: { register: (route) => (routes.set(route.path, route.handler), () => {}) },
      connection: { requestRejection: () => undefined },
    }),
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
  /** A request to the add-on's data route, as the page or the chat box sends it. */
  const call = async (method, url, body) => {
    const raw = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
    const req = { method, url, async *[Symbol.asyncIterator]() { yield* raw; } };
    let text = '';
    const res = { statusCode: 200, setHeader: () => {}, end: (data = '') => { text = String(data); } };
    await routes.get('/dsh-finance/data')(req, res);
    return { status: res.statusCode, data: text ? JSON.parse(text) : undefined };
  };
  return { emit, agent, call, moves, stop: () => disposers.forEach((stop) => stop()) };
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

test('the adviser switch alone does nothing until the warning was accepted', () => {
  const app = running({ config: { adviser: true }, modeOf: { s4: MODE_ID } });
  try {
    assert.ok(!/financial adviser/.test(app.agent('s4')()));
  } finally {
    app.stop();
  }
});

test('the adviser note and the profile go to the conversation, not to its helpers', () => {
  const app = running({ config: { adviser: true, adviserAccepted: true }, modeOf: { s4: MODE_ID, h1: MODE_ID, h2: MODE_ID } });
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

// ---- Tools off (finance-4) --------------------------------------------------------------------

const CONNECTOR = JSON.stringify([{ id: 'feed', kind: 'connector', name: 'My feed', about: 'prices', on: true }]);

test('with Tools off, a Finance conversation is told it has no data tools and that any figure is from memory', () => {
  const off = new Set(['s7']);
  const app = running({ config: { sources: CONNECTOR }, modeOf: { s7: MODE_ID, s8: MODE_ID }, noTools: off, tools: true });
  try {
    // Tools on: the sources are named, and nothing is said about memory.
    const on = app.agent('s8')();
    assert.match(on, /Extra data sources/);
    assert.ok(!/Tools are off/.test(on), on);
    const note = app.agent('s7');
    const text = note();
    assert.match(text, /Tools are off in this Finance conversation, so you have no data tools now/);
    assert.match(text, /\(from memory, may be out of date\)/);
    assert.match(text, /Say which period a remembered figure is for/);
    assert.match(text, /never give it a source or an "as of" date you did not check/);
    // The Modes add-on drops the Finance method with Tools off, so the line on advice comes from here.
    assert.match(text, /This is research, not advice: do not tell the user to buy, sell or hold\./);
    // Nothing points at a tool it does not have.
    assert.ok(!/Extra data sources|finance_source_get|finance_profile_save/.test(text), text);
    // The selection still stands.
    assert.match(text, /- Subject:/);
    // Tools on again: the note follows at the next step.
    off.delete('s7');
    assert.match(note(), /Extra data sources/);
    assert.ok(!/Tools are off/.test(note()));
  } finally {
    app.stop();
  }
});

test('with Tools off and the adviser on, the adviser keeps its voice but saves nothing and marks figures as from memory', () => {
  const app = running({ config: { adviser: true, adviserAccepted: true }, modeOf: { s9: MODE_ID, s10: MODE_ID }, noTools: new Set(['s9']), tools: true });
  try {
    const text = app.agent('s9')();
    assert.match(text, /You are the user's financial adviser/);
    assert.match(text, /Tools are off in this Finance conversation/);
    assert.match(text, /every figure is from memory and is marked as such/);
    assert.ok(!/Figures still come only from sources you fetched/.test(text), text);
    assert.ok(!/finance_profile_save/.test(text), text);
    // The adviser's note sets the voice: no research-only line beside it.
    assert.ok(!/This is research, not advice/.test(text), text);
    // With Tools on, the profile tool exists and is named.
    const on = app.agent('s10')();
    assert.match(on, /finance_profile_save/);
    assert.match(on, /Figures still come only from sources you fetched/);
  } finally {
    app.stop();
  }
});

test('a Modes add-on that cannot say whether Tools are off counts as Tools on', () => {
  const app = running({ config: { sources: CONNECTOR }, modeOf: { s11: MODE_ID } });
  try {
    const text = app.agent('s11')();
    assert.match(text, /Extra data sources/);
    assert.ok(!/Tools are off/.test(text));
  } finally {
    app.stop();
  }
});

// ---- the selection in the chat box (finance-10) -----------------------------------------------

const chatOf = async (app, id) => (await app.call('GET', `/dsh-finance/data?session=${encodeURIComponent(id)}`)).data;

test('the chat box shows a Finance conversation\'s selection once it has started, and only there', async () => {
  const sessions = { s20: { id: 's20', header: {} }, s22: { id: 's22', header: {}, turns: 2 }, h3: { id: 'h3', header: { origin: 'subagent', parentSession: 's22' }, turns: 1 } };
  const app = running({ config: { subject: 'NVIDIA', market: 'United States' }, modeOf: { s20: MODE_ID, s22: MODE_ID, h3: MODE_ID }, sessions });
  try {
    // A new conversation on the Finance tab: the start page's drop-downs are its selection.
    let chat = await chatOf(app, 's20');
    // Only what the chat box reads (the adviser flag is for the standing "not regulated advice" label).
    assert.deepEqual(Object.keys(chat).sort(), ['adviser', 'enabled', 'focuses', 'kinds', 'markets', 'periods', 'session', 'watchlist']);
    assert.equal(chat.adviser, false);
    assert.equal(chat.enabled, true);
    assert.equal(chat.session.id, 's20');
    assert.equal(chat.session.shown, false);
    assert.equal(chat.session.selection.subject, 'NVIDIA');
    // The lists the drop-downs need come along, with a line on each focus and period.
    assert.deepEqual(chat.kinds.map((kind) => kind.id), ['company', 'sector', 'economy', 'market']);
    assert.ok(chat.markets.includes('Global'));
    assert.ok(chat.focuses.every((focus) => focus.about));
    assert.ok(chat.periods.every((period) => period.about));
    // Its first message pins the selection, and the chat box shows it.
    app.emit('session/event', sessions.s20, { type: 'turn/start' });
    chat = await chatOf(app, 's20');
    assert.equal(chat.session.shown, true);
    assert.equal(chat.session.pinned, true);
    assert.deepEqual(chat.session.selection, { kind: 'company', subject: 'NVIDIA', market: 'United States', focus: 'full', period: 'year' });
    // A conversation moved into Finance after it started is shown at once, with what its note says now.
    chat = await chatOf(app, 's22');
    assert.equal(chat.session.shown, true);
    assert.equal(chat.session.pinned, false);
    // Not in another mode's conversation, and not for a helper.
    assert.equal((await chatOf(app, 's21')).session.shown, false);
    assert.equal((await chatOf(app, 'h3')).session.shown, false);
    // The page's own answer is unchanged when no conversation is named.
    const page = await app.call('GET', '/dsh-finance/data');
    assert.equal(page.status, 200);
    assert.ok(Array.isArray(page.data.briefs));
    assert.equal(page.data.session, undefined);
  } finally {
    app.stop();
  }
  const off = running({ config: { enabled: false }, modeOf: { s30: MODE_ID }, sessions: { s30: { id: 's30', header: {}, turns: 3 } } });
  try {
    const chat = await chatOf(off, 's30');
    assert.equal(chat.enabled, false);
    assert.equal(chat.session.shown, false);
  } finally {
    off.stop();
  }
});

test('a change in the chat box is that conversation\'s own selection, and its note follows at once', async () => {
  const sessions = { s23: { id: 's23', header: {}, turns: 1 }, s24: { id: 's24', header: {}, turns: 1 } };
  const app = running({ config: { subject: 'NVIDIA', market: 'United States', focus: 'news' }, modeOf: { s23: MODE_ID, s24: MODE_ID, h4: MODE_ID }, sessions });
  try {
    const note = app.agent('s23');
    app.emit('session/event', sessions.s23, { type: 'turn/start' });
    assert.match(note(), /- Subject: company "NVIDIA"/);
    const reply = await app.call('POST', '/dsh-finance/data', { action: 'pin', sessionId: 's23', values: { subject: ' ASML ', market: 'Europe' } });
    assert.equal(reply.status, 200);
    // The answer is the chat box's view, with the new selection to show at once.
    assert.equal(reply.data.session.id, 's23');
    assert.deepEqual(reply.data.session.selection, { kind: 'company', subject: 'ASML', market: 'Europe', focus: 'news', period: 'year' });
    assert.match(note(), /- Subject: company "ASML"/);
    assert.match(note(), /- Market: Europe only/);
    assert.match(note(), /in its chat box/);
    // A helper of that conversation follows it.
    assert.match(app.agent('h4', { parentSession: 's23' })(), /company "ASML"/);
    // Only that conversation: the start page's selection, and so the next conversation, stay as they were.
    app.emit('session/event', sessions.s24, { type: 'turn/start' });
    assert.equal((await chatOf(app, 's24')).session.selection.subject, 'NVIDIA');
    assert.equal((await app.call('GET', '/dsh-finance/data')).data.selection.subject, 'NVIDIA');
    // A choice that is not on its list changes nothing; a scheduled brief's mark cannot be chosen.
    const odd = await app.call('POST', '/dsh-finance/data', { action: 'pin', sessionId: 's23', values: { focus: 'gossip', kind: 'brief', period: 'five' } });
    assert.deepEqual(odd.data.session.selection, { kind: 'company', subject: 'ASML', market: 'Europe', focus: 'news', period: 'five' });
    // A later first-turn event does not put the start page's selection back.
    app.emit('session/event', sessions.s23, { type: 'turn/start' });
    assert.equal((await chatOf(app, 's23')).session.selection.subject, 'ASML');
  } finally {
    app.stop();
  }
});

test('a conversation moved into Finance after it started gets its own selection from the chat box', async () => {
  const sessions = { s25: { id: 's25', header: {}, turns: 4 } };
  const app = running({ config: { subject: 'NVIDIA', kind: 'company' }, modeOf: { s25: MODE_ID }, sessions });
  try {
    const reply = await app.call('POST', '/dsh-finance/data', { action: 'pin', sessionId: 's25', values: { kind: 'economy', subject: 'Japan' } });
    assert.equal(reply.status, 200);
    assert.equal(reply.data.session.pinned, true);
    assert.deepEqual(reply.data.session.selection, { kind: 'economy', subject: 'Japan', market: 'Global', focus: 'full', period: 'year' });
    assert.match(app.agent('s25')(), /- Subject: economy "Japan"/);
  } finally {
    app.stop();
  }
});

test('a market from the chat box must be on the Market list, one of your own, or the conversation\'s market now', async () => {
  const sessions = { s28: { id: 's28', header: {}, turns: 1 } };
  const app = running({ config: { subject: 'NVIDIA', market: 'Peru', moreMarkets: ['Mexico'] }, modeOf: { s28: MODE_ID }, sessions });
  try {
    const note = app.agent('s28');
    app.emit('session/event', sessions.s28, { type: 'turn/start' });
    const pick = async (market) => (await app.call('POST', '/dsh-finance/data', { action: 'pin', sessionId: 's28', values: { market } })).data.session.selection.market;
    // Not on any list: the market stays as it was, and so does the note.
    assert.equal(await pick('Atlantis'), 'Peru');
    assert.match(note(), /- Market: Peru only/);
    // Its market now is a valid choice although it is on no list.
    assert.equal(await pick('peru'), 'Peru');
    // One of your own markets, typed in another case: stored as listed.
    assert.equal(await pick('mexico'), 'Mexico');
    assert.equal(await pick('Japan'), 'Japan');
    assert.match(note(), /- Market: Japan only/);
    // The start page's free-text market is no longer the conversation's, so it is not on offer now.
    assert.equal(await pick('Peru'), 'Japan');
  } finally {
    app.stop();
  }
});

test('the chat box cannot change a conversation that is not a started Finance one', async () => {
  const sessions = { s26: { id: 's26', header: {} }, s27: { id: 's27', header: {}, turns: 1 } };
  const app = running({ config: {}, modeOf: { s26: MODE_ID }, sessions });
  try {
    const fresh = await app.call('POST', '/dsh-finance/data', { action: 'pin', sessionId: 's26', values: { subject: 'ASML' } });
    assert.equal(fresh.status, 400);
    assert.match(fresh.data.error, /Before the first message, the drop-downs under the message box set the selection/);
    assert.equal((await chatOf(app, 's26')).session.pinned, false);
    const other = await app.call('POST', '/dsh-finance/data', { action: 'pin', sessionId: 's27', values: { subject: 'ASML' } });
    assert.equal(other.status, 400);
    assert.match(other.data.error, /not a Finance conversation/);
    const nobody = await app.call('POST', '/dsh-finance/data', { action: 'pin', values: { subject: 'ASML' } });
    assert.equal(nobody.status, 400);
  } finally {
    app.stop();
  }
});

test('the app gives no way to add text to an answer, so the "not regulated advice" label is always in the chat box while the adviser is on', async () => {
  const sessions = { a1: { id: 'a1', header: {}, turns: 1 } };
  const on = running({ config: { adviser: true, adviserAccepted: true }, modeOf: { a1: MODE_ID }, sessions });
  const notYet = running({ config: { adviser: true }, modeOf: { a1: MODE_ID }, sessions });
  const off = running({ config: {}, modeOf: { a1: MODE_ID }, sessions });
  try {
    assert.equal((await chatOf(on, 'a1')).adviser, true);
    assert.equal((await chatOf(notYet, 'a1')).adviser, false, 'switched on without the typed acceptance: no adviser, no label');
    assert.equal((await chatOf(off, 'a1')).adviser, false);
    // The chat box draws the label from that flag, in the words the adviser is told to end with.
    const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
    assert.match(client, /view\.adviser === true \? h\('div', \{ className: 'dsh-opt-hint', 'data-dsh-adviser-label': 'true' \}, 'Adviser on\. AI output, not regulated advice\.'\)/);
    // And the model is still told to end every answer with the line (the strict rule stays).
    assert.match(on.agent('a1')(), /AI output, not regulated advice\./);
  } finally {
    on.stop();
    notYet.stop();
    off.stop();
  }
});
