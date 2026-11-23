/**
 * Item 4A, stage 1: spaces underneath, nothing visible (ITEM4A-PLAN.md A1 and A4; the owner's answers of 22 November
 * 2026). The mode -> space map, the default ticks (guarded spaces greyed until stage 6a), the one-time fill of every
 * existing thread, the read-through helpers for what is already stored, and the add-on recording a thread's space at
 * its first message without changing anything that shows.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { setImmediate as tick, setTimeout as wait } from 'node:timers/promises';
import { apply, Config } from '../index.js';
import {
  DEFAULT_TICKS, GUARDED_REASON, MODE_SPACE, SPACES, SPACES_LIVE, SPACE_IDS, fillSpaces, guessSpace, lastOpenBySpace, locksBySpace, modesInSpace,
  spaceOfMode, spaceOfProject, spaceOfTab, spaceOfThread, spaceOfTrashItem, spaceOrderFrom, spacesNow, spacesOfMode, ticksOfMode,
} from '../lib/spaces.js';

/** Run with spaces switched off (the lab switch DSH_SPACES_LAB=0): the old tab paths, as before item 4A stage 3a. */
async function tabsOnly(run) {
  const before = process.env.DSH_SPACES_LAB;
  process.env.DSH_SPACES_LAB = '0';
  try {
    return await run();
  } finally {
    if (before === undefined) delete process.env.DSH_SPACES_LAB;
    else process.env.DSH_SPACES_LAB = before;
  }
}


const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

test('the five spaces, in their first order, with Recon red and Devices violet', () => {
  assert.deepEqual(SPACE_IDS, ['chat', 'code', 'devices', 'recon', 'workshop']);
  assert.deepEqual(SPACES.map((space) => space.id), SPACE_IDS);
  assert.equal(SPACES.find((space) => space.id === 'recon').colour, 'red');
  assert.equal(SPACES.find((space) => space.id === 'devices').colour, 'violet');
  // Devices keeps its inner mode id `bench`.
  assert.equal(SPACES.find((space) => space.id === 'devices').startMode, 'bench');
  assert.equal(SPACES_LIVE, true, 'stage 3a: spaces are live');
});

test('every stored mode id has its space (2.2): Chat for the chat-like modes and your own, Code, Devices, Recon, Workshop', () => {
  for (const id of ['chat', 'cowork', 'research', 'scout', 'finance', 'data', 'content', 'automations', 'plain']) assert.equal(spaceOfMode(id), 'chat', id);
  assert.equal(spaceOfMode('code'), 'code');
  assert.equal(spaceOfMode('bench'), 'devices');
  assert.equal(spaceOfMode('recon'), 'recon');
  assert.equal(spaceOfMode('creator-plus'), 'workshop');
  // Your own modes and add-on modes without an entry live in Chat.
  for (const id of ['review', 'my-own-mode', 'lab', '']) assert.equal(spaceOfMode(id), 'chat', id);
  assert.equal(spaceOfMode(undefined), 'chat');
  // Inherited names are not spaces.
  assert.equal(spaceOfMode('toString'), 'chat');
  assert.equal(spaceOfMode('__proto__'), 'chat');
  for (const space of Object.values(MODE_SPACE)) assert.ok(SPACE_IDS.includes(space));
});

test('default ticks (A1): Research and Data in Chat and Code, the others in Chat, each guarded mode in its own space', () => {
  assert.deepEqual(spacesOfMode('research'), ['chat', 'code']);
  assert.deepEqual(spacesOfMode('data'), ['chat', 'code']);
  assert.deepEqual(spacesOfMode('plain'), ['chat', 'code']);
  for (const id of ['chat', 'cowork', 'scout', 'finance', 'content', 'automations']) assert.deepEqual(spacesOfMode(id), ['chat'], id);
  assert.deepEqual(spacesOfMode('code'), ['code']);
  assert.deepEqual(spacesOfMode('bench'), ['devices']);
  assert.deepEqual(spacesOfMode('recon'), ['recon']);
  assert.deepEqual(spacesOfMode('creator-plus'), ['workshop']);
  assert.deepEqual(spacesOfMode('my-own-mode'), ['chat']);
  // Every default tick is a space, and every mode's own space is among its ticks.
  for (const [id, ticks] of Object.entries(DEFAULT_TICKS)) {
    assert.ok(ticks.every((space) => SPACE_IDS.includes(space)), id);
    assert.ok(ticks.includes(spaceOfMode(id)), id);
  }
});

test('other modes in Devices, Recon and Workshop are greyed while the space\'s guard is not ready, with what to switch on (stage 6a)', () => {
  const owner = { research: [{ space: 'recon', adjust: {} }, { space: 'chat' }], finance: ['devices', 'workshop'], 'creator-plus': ['chat', 'workshop'] };
  assert.deepEqual(ticksOfMode('research', owner), [{ space: 'recon', greyed: true, reason: 'Needs Recon: switch it on in Settings → Recon.' }, { space: 'chat', greyed: false, reason: '' }]);
  const ready = { devices: true, recon: true, workshop: true };
  assert.deepEqual(ticksOfMode('research', owner, { ready }), [{ space: 'recon', greyed: false, reason: '' }, { space: 'chat', greyed: false, reason: '' }]);
  assert.deepEqual(spacesOfMode('research', owner, { ready }), ['recon', 'chat']);
  assert.deepEqual(spacesOfMode('research', owner), ['chat']);
  assert.deepEqual(spacesOfMode('finance', owner), [], 'both its ticks wait for their spaces\' guards');
  assert.deepEqual(spacesOfMode('finance', owner, { ready: { devices: 'old', workshop: true } }), ['workshop']);
  assert.equal(ticksOfMode('finance', owner, { ready: { devices: 'old' } })[0].reason, 'Needs a newer Devices: update it, then switch it off and on in Settings → Devices.');
  // Creator Plus is not offered in other spaces' lists (item 8), whatever is stored.
  assert.deepEqual(spacesOfMode('creator-plus', owner), ['workshop']);
  const modes = [{ id: 'recon', label: 'Recon' }, { id: 'research', label: 'Research' }, { id: 'finance', label: 'Finance' }];
  assert.deepEqual(modesInSpace('recon', modes, owner), [
    { id: 'recon', label: 'Recon', greyed: false, reason: '' },
    { id: 'research', label: 'Research', greyed: true, reason: 'Needs Recon: switch it on in Settings → Recon.' },
  ]);
  assert.equal(GUARDED_REASON, "Available once this space's rules are built");
  assert.deepEqual(modesInSpace('chat', modes, {}).map((mode) => mode.id), ['research', 'finance']);
  assert.deepEqual(modesInSpace('nowhere', modes, {}), []);
  // A stored tick that is not a space is ignored; nothing left means the defaults.
  assert.deepEqual(spacesOfMode('scout', { scout: ['mars', { space: 7 }] }), ['chat']);
});

test('a thread with no recorded mode is placed as today: no folder or the default workspace is Chat, another folder Code', () => {
  assert.equal(guessSpace(null), 'chat');
  assert.equal(guessSpace({ path: '/Users/x/.dsh/default-workspace' }), 'chat');
  assert.equal(guessSpace({ path: '/x', title: 'default-workspace' }), 'chat');
  assert.equal(guessSpace({ path: '/Users/x/Projects/app' }), 'code');
});

test('a thread\'s space: its mode decides while tabs decide (stage 1); its recorded space once spaces are live', () => {
  const stored = { sessionSpaces: { a: 'chat', b: 'recon' }, sessionModes: { a: 'code', c: 'bench' } };
  // Tabs deciding (stage 1, or spaces switched off in a lab): a thread moved to the Code tab shows in Code.
  const tabs = { ...stored, live: false };
  assert.equal(spaceOfThread('a', tabs), 'code');
  assert.equal(spaceOfThread('b', tabs), 'recon');
  assert.equal(spaceOfThread('c', tabs), 'devices');
  assert.equal(spaceOfThread('d', { ...tabs, workspace: { path: '/p/app' } }), 'code');
  assert.equal(spaceOfThread('d', tabs), 'chat');
  // Stage 3a (live, the default now): a thread never changes space.
  assert.equal(spaceOfThread('a', stored), 'chat');
  assert.equal(spaceOfThread('a', { ...stored, live: true }), 'chat');
  assert.equal(spaceOfThread('c', { ...stored, live: true }), 'devices');
});

test('migration: every existing thread gets the space of its mode, and nothing else changes', () => {
  // Chats in Scratch and in projects, Cowork, Recon, Devices, Creator Plus, automation-made threads (Finance brief,
  // the scheduled mode, the Automations chat), your own mode, and one already filled.
  const sessionModes = {
    scratchChat: 'chat', projectChat: 'chat', cowork1: 'cowork', code1: 'code', recon1: 'recon', devices1: 'bench', creator1: 'creator-plus',
    briefRun: 'finance', scheduledRun: 'cowork', automationsChat: 'automations', research1: 'research', own1: 'review', done: 'code', odd: 7,
  };
  const sessionSpaces = { done: 'code', stray: 'mars', trashed: 'recon' };
  const modesBefore = JSON.stringify(sessionModes);
  const spacesBefore = JSON.stringify(sessionSpaces);
  const { next, added, changed } = fillSpaces(sessionModes, sessionSpaces);
  assert.deepEqual(next, {
    done: 'code', stray: 'mars', trashed: 'recon',
    scratchChat: 'chat', projectChat: 'chat', cowork1: 'chat', code1: 'code', recon1: 'recon', devices1: 'devices', creator1: 'workshop',
    briefRun: 'chat', scheduledRun: 'chat', automationsChat: 'chat', research1: 'chat', own1: 'chat',
  });
  assert.equal(added, 12);
  assert.equal(changed, 0);
  assert.equal(JSON.stringify(sessionModes), modesBefore, 'modes untouched');
  assert.equal(JSON.stringify(sessionSpaces), spacesBefore, 'input untouched');
  // Run twice: nothing more to do.
  assert.deepEqual(fillSpaces(sessionModes, next), { next, added: 0, changed: 0 });
});

test('migration refresh (for the switch-over at stage 3a): a space recorded before a move between tabs is corrected', () => {
  const { next, added, changed } = fillSpaces({ moved: 'code', same: 'chat' }, { moved: 'chat', same: 'chat' }, { refresh: true });
  assert.deepEqual(next, { moved: 'code', same: 'chat' });
  assert.equal(added, 0);
  assert.equal(changed, 1);
  assert.deepEqual(fillSpaces({ moved: 'code' }, { moved: 'chat' }).next, { moved: 'chat' }, 'without refresh a recorded space stays');
});

test('migration keeps every stored entry as it is, also one that is not a space (A4: nothing stored is rewritten)', () => {
  // A hand edit, or a later version's space after a downgrade: kept, never replaced or dropped, refresh included.
  const stored = Object.freeze({ a: 'chat', b: 'lab', c: 7 });
  assert.deepEqual(fillSpaces({ a: 'chat', b: 'code', d: 'recon' }, stored), { next: { a: 'chat', b: 'lab', c: 7, d: 'recon' }, added: 1, changed: 0 });
  assert.deepEqual(fillSpaces({ b: 'code', c: 'chat' }, stored, { refresh: true }), { next: { a: 'chat', b: 'lab', c: 7 }, added: 0, changed: 0 });
  // An empty entry counts as none.
  assert.deepEqual(fillSpaces({ e: 'bench' }, { e: '' }).next, { e: 'devices' });
  assert.deepEqual(fillSpaces({ x: 'chat' }, null).next, { x: 'chat' });
  // The thread still has a space: an unknown value is passed over.
  assert.equal(spaceOfThread('b', { sessionSpaces: stored, sessionModes: { b: 'code' }, live: true }), 'code');
});

test('stored tab order, last open, trash, projects and automations are read through the map, never rewritten', () => {
  const tabOrder = ['finance', 'recon', 'chat', 'code', 'bench', 'creator-plus'];
  const frozenOrder = Object.freeze([...tabOrder]);
  assert.deepEqual(spaceOrderFrom(frozenOrder), ['chat', 'recon', 'code', 'devices', 'workshop']);
  assert.deepEqual(spaceOrderFrom([]), SPACE_IDS);
  assert.deepEqual(spaceOrderFrom('nonsense'), SPACE_IDS);
  // The space's own tab wins (Chat over Finance and Cowork), then the tab order.
  const lastOpen = Object.freeze({ finance: 'f1', cowork: 'w1', chat: 'c1', bench: 'b1', research: 'r1', code: 'k1' });
  assert.deepEqual(lastOpenBySpace(lastOpen, tabOrder), { chat: 'c1', code: 'k1', devices: 'b1' });
  assert.deepEqual(lastOpenBySpace({ finance: 'f1', cowork: 'w1' }, ['cowork', 'finance']), { chat: 'w1' });
  assert.deepEqual(lastOpenBySpace(null), {});
  // Trash: its tab, else the tab its folder gave.
  assert.equal(spaceOfTrashItem({ tab: 'bench', fallbackTab: 'code' }), 'devices');
  assert.equal(spaceOfTrashItem({ tab: '', fallbackTab: 'code' }), 'code');
  assert.equal(spaceOfTrashItem({}), undefined);
  // Projects: a saved space first, else its tab.
  assert.equal(spaceOfProject({ tab: 'cowork' }), 'chat');
  assert.equal(spaceOfProject({ tab: 'cowork', space: 'code' }), 'code');
  assert.equal(spaceOfProject({}), undefined);
  // Automations keep mode ids (createdIn, runTab); the space is read from them.
  for (const [runTab, space] of [['finance', 'chat'], ['recon', 'recon'], ['cowork', 'chat'], ['code', 'code']]) assert.equal(spaceOfTab(runTab), space);
  assert.equal(spaceOfTab(undefined), undefined);
});

test('preset locks: Recon, Devices and Creator Plus become their spaces\' locks; Automations and the rest stay per mode', () => {
  assert.deepEqual(locksBySpace({ recon: 'standard', bench: 'any', 'creator-plus': 'creator', automations: 'standard', code: 'any', bad: 3 }), {
    spaces: { recon: 'standard', devices: 'any', workshop: 'creator' },
    modes: { automations: 'standard', code: 'any' },
  });
  assert.deepEqual(locksBySpace(null), { spaces: {}, modes: {} });
});

test('which spaces are there: Chat always, Code unless hidden, the others only with what they need', () => {
  const shown = (now) => spacesNow(now).filter((space) => space.shown).map((space) => space.id);
  assert.deepEqual(shown({ modeIds: ['chat', 'cowork', 'code'] }), ['chat', 'code']);
  assert.deepEqual(shown({ modeIds: ['chat', 'code', 'bench', 'recon', 'creator-plus'] }), SPACE_IDS);
  assert.deepEqual(shown({ modeIds: ['chat', 'code'], addons: ['tuning'] }), ['chat', 'code', 'workshop'], 'Tuner Plus alone shows Workshop');
  assert.deepEqual(shown({ modeIds: ['code'], spaceSettings: { chat: { shown: false }, code: { shown: false } } }), ['chat'], 'Chat cannot be hidden');

  // Owner's answer (22 Nov): Tuner Plus counts only while it is on; its Settings row then leaves Workshop (`addonsOff`).
  const workshop = (now) => spacesNow(now).find((space) => space.id === 'workshop');
  assert.deepEqual(workshop({ modeIds: ['creator-plus'], addons: [] }).addonsOff, ['tuning'], 'Tuner Plus off: its row is left out');
  assert.deepEqual(workshop({ modeIds: ['creator-plus'], addons: ['tuning'] }).addonsOff, [], 'Tuner Plus on: its row shows');
  assert.equal(workshop({ modeIds: ['chat'], addons: [] }).shown, false, 'neither Creator Plus nor Tuner Plus on: no Workshop');
});

// ---- The add-on in a stand-in app ----------------------------------------------------------------------------------

const EXTRA = {
  finance: { label: 'Finance', tools: 'all', sandbox: 'inherit', defaultTier: '', prompt: 'Finance method.' },
  recon: { label: 'Recon', tools: ['recon_cite'], isolated: true },
  bench: { label: 'Devices', tools: ['read'] },
  'creator-plus': { label: 'Creator Plus', tools: ['read'] },
};

/** Modes on stand-in services, with the Cowork sidebar on (tabs decide). */
function running({ defaultMode = 'cowork', fields = {}, shell = true } = {}) {
  const config = Config({ extraModes: JSON.stringify(EXTRA), defaultMode, pruneStaleSessions: false, ...fields });
  const handlers = new Map();
  const agents = new Map();
  const disposers = [];
  const writes = [];
  const settings = {
    describe: () => [{ ns: 'modes', value: config }],
    mutate: async (ns, ops) => {
      writes.push(ops.map((op) => op.path[0]));
      for (const op of ops) if (op.op === 'set') config[op.path[0]] = op.value;
    },
  };
  // Lab fix (6a): the guard add-ons running as before stage 6a (their modes are in the world).
  const services = { settings, agents: { get: (id) => agents.get(id), list: () => [...agents.values()] }, recon: { apiVersion: 2 }, bench: {}, creatorPlus: {}, ...(shell ? { coworkShell: {} } : {}) };
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
  const open = async (id, header = {}) => {
    const agent = {
      id,
      status: 'idle',
      phase: { kind: 'idle', lastTurn: 0 },
      header,
      session: { header },
      ctx: { effect: (start) => start(), tools: { restrict: () => () => {} } },
      model: { current: () => ({ provider: 'p', model: 'm' }) },
    };
    agents.set(id, agent);
    await emit('agent/created', { agent });
    return agent;
  };
  const firstTurn = async (agent) => {
    agent.status = 'running';
    agent.phase = { kind: 'running', lastTurn: 0 };
    await emit('agent/status', { agent, status: 'running' });
    await tick();
    await tick();
  };
  return { config, writes, service: () => service, open, firstTurn, setDefault: (id) => { config.defaultMode = id; }, stop: () => disposers.forEach((stop) => stop()) };
}

/** A setting's value (a volatile one is a reference until something writes it). */
const val = (value) => (value && typeof value === 'object' && typeof value.get === 'function' ? value.get() : value);
const parsed = (config, field) => JSON.parse(val(config[field]) || '{}');

test('a new thread\'s space is recorded at its first message, from the mode it starts in (each tab)', () => tabsOnly(async () => {
  const app = running();
  try {
    for (const [id, tab, space] of [['t-chat', 'chat', 'chat'], ['t-cowork', 'cowork', 'chat'], ['t-code', 'code', 'code'], ['t-recon', 'recon', 'recon'], ['t-dev', 'bench', 'devices'], ['t-cp', 'creator-plus', 'workshop'], ['t-fin', 'finance', 'chat']]) {
      app.setDefault(tab);
      const agent = await app.open(id);
      await app.firstTurn(agent);
      assert.equal(parsed(app.config, 'sessionModes')[id], tab, `${id}: the mode is pinned as before`);
      assert.equal(parsed(app.config, 'sessionSpaces')[id], space, `${id}: its space`);
      assert.equal(app.service().spaces.of(id), space);
    }
    // A Recon thread stays sealed exactly as before.
    assert.equal(app.service().isolated('t-recon'), true);
    assert.equal(app.service().isolated('t-chat'), false);
  } finally {
    app.stop();
  }
}));

test('a claimed thread (a Finance brief from an automation) gets the space of the claimed mode; a helper asks for its thread', async () => {
  const app = running();
  try {
    const agent = await app.open('brief');
    await app.service().set('brief', 'finance', { claim: true });
    await app.firstTurn(agent);
    assert.equal(parsed(app.config, 'sessionModes').brief, 'finance');
    assert.equal(parsed(app.config, 'sessionSpaces').brief, 'chat');
    // A helper agent is never recorded; it reports its thread's space.
    app.setDefault('code');
    const helper = await app.open('helper-1', { origin: 'subagent', parentSession: 'brief' });
    await app.firstTurn(helper);
    assert.equal(parsed(app.config, 'sessionSpaces')['helper-1'], undefined);
    assert.equal(parsed(app.config, 'sessionModes')['helper-1'], undefined);
  } finally {
    app.stop();
  }
});

test('with "Pin the starting mode" off, the mode is not recorded but the space still is (claimed threads too)', async () => {
  // Without the Cowork sidebar (no tabs): an ordinary thread.
  const bare = running({ defaultMode: 'chat', fields: { pinOnFirstTurn: false }, shell: false });
  try {
    const plainOne = await bare.open('unpinned');
    await bare.firstTurn(plainOne);
    assert.equal(parsed(bare.config, 'sessionModes').unpinned, undefined, 'the mode is not pinned, as before');
    assert.equal(parsed(bare.config, 'sessionSpaces').unpinned, 'chat');
  } finally {
    bare.stop();
  }
  // Under tabs: a claim (a Finance brief, Split Plus, Creator Plus) records its mode itself; the first message adds the space.
  const app = running({ defaultMode: 'chat', fields: { pinOnFirstTurn: false } });
  try {
    const claimedOne = await app.open('claimed');
    await app.service().set('claimed', 'creator-plus', { claim: true });
    await app.firstTurn(claimedOne);
    assert.equal(parsed(app.config, 'sessionModes').claimed, 'creator-plus');
    assert.equal(parsed(app.config, 'sessionSpaces').claimed, 'workshop');
  } finally {
    app.stop();
  }
});

test('under tabs a thread moved to another tab shows in that tab\'s space; its recorded space waits for the switch-over', async () => {
  const before = process.env.DSH_SPACES_LAB;
  process.env.DSH_SPACES_LAB = '0';
  const app = running({ defaultMode: 'chat' });
  try {
    const agent = await app.open('mover');
    await app.firstTurn(agent);
    agent.status = 'idle';
    await app.service().set('mover', 'code');
    assert.equal(app.service().get('mover'), 'code');
    assert.equal(app.service().spaces.of('mover'), 'code', 'its mode decides, as its tab does today');
    assert.equal(parsed(app.config, 'sessionSpaces').mover, 'chat', 'recorded at the first message, not rewritten');
  } finally {
    app.stop();
    if (before === undefined) delete process.env.DSH_SPACES_LAB;
    else process.env.DSH_SPACES_LAB = before;
  }
});

test('with spaces live a mode change never moves a thread: it stays in the space it was recorded in', async () => {
  const app = running({ defaultMode: 'chat' });
  try {
    const agent = await app.open('stay');
    await app.firstTurn(agent);
    agent.status = 'idle';
    await app.service().set('stay', 'cowork');
    assert.equal(app.service().get('stay'), 'cowork');
    assert.equal(app.service().spaces.of('stay'), 'chat');
    await app.service().set('stay', 'code');
    assert.equal(app.service().spaces.of('stay'), 'chat', 'Code mode in a Chat thread: the thread stays in Chat');
    assert.equal(parsed(app.config, 'sessionSpaces').stay, 'chat');
  } finally {
    app.stop();
  }
});

test('the one-time fill gives every existing thread its space, once, and changes nothing else', async () => {
  const sessionModes = { old1: 'chat', old2: 'recon', old3: 'bench', old4: 'creator-plus', old5: 'finance', old6: 'code' };
  const app = running({ fields: { sessionModes: JSON.stringify(sessionModes), sessionIsolated: JSON.stringify({ old2: true }), presetLock: JSON.stringify({ recon: 'standard' }), webMarksCleared: true, depthMoved: true, dataTrimAdded: true, plainAdded: true } });
  try {
    const listBefore = JSON.stringify(app.service().list());
    await wait(2300);
    assert.deepEqual(parsed(app.config, 'sessionSpaces'), { old1: 'chat', old2: 'recon', old3: 'devices', old4: 'workshop', old5: 'chat', old6: 'code' });
    assert.equal(val(app.config.spacesFilled), true);
    assert.equal(val(app.config.spacesRefreshed), true, 'spaces are live: the switch-over fill is done in the same write');
    assert.deepEqual(parsed(app.config, 'sessionModes'), sessionModes, 'modes untouched');
    assert.equal(val(app.config.presetLock), JSON.stringify({ recon: 'standard' }), 'preset locks untouched');
    assert.equal(val(app.config.defaultMode), 'cowork');
    // One write, of the fill alone.
    assert.deepEqual(app.writes.filter((paths) => paths.includes('sessionSpaces') || paths.includes('spacesFilled')), [['spacesFilled', 'spacesRefreshed', 'sessionSpaces']]);
    // Nothing that shows changed: same modes, same tab flags (automations look for their mode ids here), same modes per thread.
    assert.equal(JSON.stringify(app.service().list()), listBefore);
    for (const [id, mode] of Object.entries(sessionModes)) assert.equal(app.service().get(id), mode);
    assert.equal(app.service().lockedPreset('recon'), 'standard');
  } finally {
    app.stop();
  }
  // Once done, a later start writes nothing.
  const again = running({ fields: { sessionModes: JSON.stringify({ x: 'chat' }), spacesFilled: true, spacesRefreshed: true, webMarksCleared: true, depthMoved: true, dataTrimAdded: true, plainAdded: true } });
  try {
    await wait(2300);
    assert.deepEqual(again.writes, []);
    assert.equal(val(again.config.sessionSpaces), '{}');
  } finally {
    again.stop();
  }
});

test('the service: the spaces there now and the modes offered in each', async () => {
  const app = running();
  try {
    assert.deepEqual(app.service().spaces.list().filter((space) => space.shown).map((space) => space.id), SPACE_IDS);
    assert.deepEqual(app.service().spaces.modesIn('recon').map((mode) => [mode.id, mode.greyed]), [['recon', false]]);
    assert.deepEqual(app.service().spaces.modesIn('workshop').map((mode) => mode.id), ['creator-plus']);
    assert.ok(app.service().spaces.modesIn('chat').some((mode) => mode.id === 'finance'));
    assert.equal(app.service().spaces.ofMode('bench'), 'devices');
  } finally {
    app.stop();
  }
});

test('carried with a Rerun copy and pruned with the other per-conversation entries', () => {
  assert.match(client, /const CARRIED = \[[^\]]*'sessionSpaces'/);
  assert.match(source, /const fields = \[[^\]]*'sessionSpaces'[^\]]*\];/);
  // Every new field is volatile (Settings writes it) and has its default.
  const config = Config({});
  assert.equal(val(config.sessionSpaces), '{}');
  assert.equal(val(config.modeSpaces), '{}');
  assert.equal(val(config.spaceSettings), '{}');
  assert.equal(val(config.spacesFilled), false);
  assert.equal(val(config.spacesRefreshed), false);
});

test('stage 3a, on upgrade: one more fill with refresh puts every thread where the tabs last put it, once, under a new flag', async () => {
  // Filled at stage 1 (spacesFilled), then moved between tabs: old1 to Code, old2 (no space yet) is new, odd keeps its value.
  const sessionModes = { old1: 'code', old2: 'bench', old3: 'chat' };
  const sessionSpaces = { old1: 'chat', old3: 'chat', odd: 'later-space' };
  const app = running({ fields: { sessionModes: JSON.stringify(sessionModes), sessionSpaces: JSON.stringify(sessionSpaces), spacesFilled: true, webMarksCleared: true, depthMoved: true, dataTrimAdded: true, plainAdded: true } });
  try {
    await wait(2300);
    assert.deepEqual(parsed(app.config, 'sessionSpaces'), { old1: 'code', old2: 'devices', old3: 'chat', odd: 'later-space' });
    assert.equal(val(app.config.spacesRefreshed), true);
    assert.deepEqual(parsed(app.config, 'sessionModes'), sessionModes, 'modes untouched');
    assert.deepEqual(app.writes.filter((paths) => paths.includes('spacesRefreshed')), [['spacesFilled', 'spacesRefreshed', 'sessionSpaces']]);
  } finally {
    app.stop();
  }
  // The flag is set: a later start (a thread recorded in Code with the Research mode, say) is never corrected again.
  const later = running({ fields: { sessionModes: JSON.stringify({ r: 'research' }), sessionSpaces: JSON.stringify({ r: 'code' }), spacesFilled: true, spacesRefreshed: true, webMarksCleared: true, depthMoved: true, dataTrimAdded: true, plainAdded: true } });
  try {
    await wait(2300);
    assert.deepEqual(later.writes, []);
    assert.equal(later.service().spaces.of('r'), 'code');
  } finally {
    later.stop();
  }
  // Each Mac does its own: the flag is kept on each Mac (not shared) and refused to Mission's repair helper.
  const shared = readFileSync(new URL('../../dsh-shared-settings/index.mjs', import.meta.url), 'utf8');
  assert.match(shared, /'modes\.spacesRefreshed'/);
  const fix = readFileSync(new URL('../../dsh-mission/lib/settings-fix.js', import.meta.url), 'utf8');
  assert.match(fix, /'modes\.spacesRefreshed'/);
});
