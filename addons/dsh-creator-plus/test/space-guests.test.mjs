/**
 * Item 4A, stage 6a (STAGE6A-DESIGN.md 4.3, P3): the Workshop space keeps Creator Plus's guard for any mode. A guest
 * (another mode in the Workshop space, or a thread whose space Modes cannot read) writes only into creator-plus-builds,
 * runs no command and gets no creator_ tool; Mission gets Creator Plus's rules for it; the bar shows for it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply } from '../index.js';
import { MODE_ID } from '../lib/mode.js';
import { ALLOWED, BUILD_FOLDER, NOT_ALLOWED, NOT_THERE, NO_COMMANDS, NO_FOLDER, NO_SECRETS, RECON_ROOM, UNSAFE_FOLDER, WORKSHOP_GUEST_CREATOR_TOOLS, WORKSHOP_GUEST_LONG_RUN, WORKSHOP_GUEST_NOT_ALLOWED, WORKSHOP_GUEST_NOT_THERE, WORKSHOP_GUEST_NO_COMMANDS, WORKSHOP_GUEST_NO_FOLDER, WORKSHOP_GUEST_NO_SECRETS, WORKSHOP_GUEST_NOTE, WORKSHOP_GUEST_PLUGINS, WORKSHOP_GUEST_RECON_ROOM, WORKSHOP_GUEST_UNSAFE_FOLDER, guestRefusal, guestText } from '../lib/rules.js';
import { LONG_RUN_NO_QUESTIONS } from '../lib/depth.js';
import { ERROR_GUARD, makeGuardOf } from '../lib/space-guard.js';

const scratch = () => realpathSync(mkdtempSync(join(tmpdir(), 'creator-plus-space-')));
const settle = () => new Promise((done) => setTimeout(done, 30));

/** A Modes service of apiVersion 2: `spaceOf` gives each thread's space, `modeOf` its mode. */
function newModes({ modeOf = (id) => (String(id).startsWith('cp') ? MODE_ID : 'research'), spaceOf = (id) => (String(id).startsWith('c1') ? 'chat' : 'workshop'), topOf = (id) => id, unknown = () => false } = {}) {
  return {
    apiVersion: 2,
    get: (id) => modeOf(topOf(id) || id),
    isolated: () => false,
    topOf,
    depthSpoken: () => 'standard',
    guardOf: (id) => {
      if (unknown(id)) return { ...ERROR_GUARD, sealed: false, legacy: false };
      const top = topOf(id) || id;
      const space = spaceOf(top);
      return { top, space, mode: modeOf(top), sealed: false, sealedBy: '', reconSpace: false, guardedBy: space === 'devices' || space === 'workshop' ? space : '', noPrograms: space === 'workshop', homeMode: modeOf(top) === MODE_ID, fresh: false, unknownTop: false };
    },
    spaces: { of: (id) => spaceOf(topOf(id) || id) },
  };
}

function plugin({ modes, enabled = true } = {}) {
  const root = scratch();
  const realHome = join(root, 'dsh');
  const home = join(realHome, 'creator-plus');
  const plus = join(realHome, 'addons', 'plus');
  mkdirSync(plus, { recursive: true });
  const build = join(root, 'work', 'conversation');
  mkdirSync(build, { recursive: true });
  const config = { enabled, logReaders: 'this-mac', strongModels: '', plusFolder: '', savedRuns: '[]', sessionBars: '{}' };
  const settings = { describe: () => [{ ns: 'modes', value: { extraModes: '{}', defaultMode: 'cowork' } }, { ns: 'creator-plus', value: { ...config } }], mutate: async () => {} };
  const registered = new Map();
  const when = new Map();
  const tools = { register(tool, options) { registered.set(tool.name, tool); when.set(tool.name, options?.when); return () => registered.delete(tool.name); }, definitions: () => [] };
  const agents = new Map();
  const services = { dshHomePath: (name) => join(realHome, name), settings, tools, agents: { list: () => [...agents.values()], get: (id) => agents.get(id) }, mission: { longRun: () => false }, loader: { entries: () => [] }, ...(modes ? { modes } : {}) };
  const guards = [];
  const handlers = {};
  const provided = {};
  let route;
  const effect = (fn) => fn();
  const ctx = {
    get: (key) => services[key],
    tools: { guard(fn) { guards.push(fn); return () => {}; } },
    on(name, fn) { handlers[name] = fn; },
    effect,
    provide(name, value) { provided[name] = value; },
    inject(_names, fn) { fn({ effect, on() {}, schedule: { catalog: async () => [] }, webServer: { register: (entry) => { route = entry; return () => {}; } }, connection: { requestRejection: () => undefined } }); },
    logger: { warn() {}, info() {} },
  };
  apply(ctx, config, { home, realHome, plusDir: plus, userHome: join(root, 'me'), programs: { bundle: join(root, 'App.app'), node: '/app/node', dsh: '/app/dsh' }, run: async () => ({ code: 0, stdout: '', stderr: '' }), sandboxExists: () => true, appVersion: '0.2.2' });
  const agent = (id, { cwd = build, parent } = {}) => {
    const made = { id, header: { cwd, ...(parent ? { parentSession: parent } : {}) }, session: { deriveMessages: () => [] } };
    agents.set(id, made);
    return made;
  };
  return {
    root, build, config, registered, when, guards, handlers, provided, agent,
    builds: join(build, BUILD_FOLDER),
    decide: async (who, name, args) => {
      let passed = false;
      const out = await handlers['tools/pre-execute']({ agent: who, name, arguments: args }, async () => { passed = true; return { kind: 'run' }; });
      return passed ? '' : out.reason;
    },
    async view(session) {
      let out = '';
      await route.handler({ method: 'GET', url: `/dsh-creator-plus/data?session=${session}`, async *[Symbol.asyncIterator]() {} }, { setHeader() {}, end(text) { out = text; } });
      return JSON.parse(out);
    },
    close() { rmSync(root, { recursive: true, force: true }); },
  };
}

test('creator-guards-guest: Research in Workshop writes only into creator-plus-builds and runs no command; Chat as before', async () => {
  const app = plugin({ modes: newModes() });
  try {
    await settle();
    const guest = app.agent('r1');
    const chat = app.agent('c1');
    // Lab re-check fix (6a, problem 4): the build-folder refusal in the guest's own words too.
    assert.equal(await app.decide(guest, 'write', { file_path: join(app.build, 'notes.md'), content: 'x' }), guestText(WORKSHOP_GUEST_NOT_THERE, { mode: 'Research' }));
    assert.equal(await app.decide(guest, 'write', { file_path: join(app.builds, 'dsh-x', 'index.js'), content: 'x' }), '');
    // Lab fix (6a): a guest is answered in its own mode's words, never pointed to creator_ tools it does not have.
    const noCommands = guestText(WORKSHOP_GUEST_NO_COMMANDS, { mode: 'Research' });
    assert.equal(await app.decide(guest, 'bash', { command: 'ls' }), noCommands);
    assert.equal(await app.decide(guest, 'data_query', { query: 'x' }), guestText(WORKSHOP_GUEST_NOT_ALLOWED, { mode: 'Research', tool: 'data_query' }), 'the Workshop allow-list holds for every mode');
    assert.equal(await app.decide(guest, 'creator_scaffold', {}), guestText(WORKSHOP_GUEST_CREATOR_TOOLS, { mode: 'Research' }), 'never Creator Plus\'s own tools');
    assert.equal(app.guards[0]({ agent: guest, name: 'bash', arguments: {} }), noCommands, 'the final guard too');
    for (const text of [noCommands, await app.decide(guest, 'data_query', {}), await app.decide(guest, 'creator_scaffold', {})]) {
      assert.match(text, /^(In Workshop, Research|Creator Plus's own tools)/);
      assert.doesNotMatch(text, /creator_check|creator_change|creator_upkeep|its own creator_ tools/, 'no creator_ tools offered to a guest');
    }
    for (const entry of [WORKSHOP_GUEST_NO_COMMANDS, WORKSHOP_GUEST_NOT_ALLOWED, WORKSHOP_GUEST_CREATOR_TOOLS]) assert.ok(entry.en.includes('{mode}') && !('zh' in entry), 'English only');
    assert.equal(await app.decide(chat, 'bash', { command: 'ls' }), '');
    assert.equal(await app.decide(chat, 'write', { file_path: join(app.build, 'notes.md') }), '');
    // A helper of the guest, two levels down through Modes' topOf.
    const deep = plugin({ modes: newModes({ topOf: (id) => (id === 'h2' ? 'r1' : id) }) });
    try {
      await settle();
      const h = deep.agent('h2', { parent: 'h1-closed' });
      assert.equal(await deep.decide(h, 'bash', {}), guestText(WORKSHOP_GUEST_NO_COMMANDS, { mode: 'Research' }));
    } finally {
      deep.close();
    }
  } finally {
    app.close();
  }
});

test('creator tools are not offered to guests; the note, longRunRules and the bar view follow the space', async () => {
  const app = plugin({ modes: newModes() });
  try {
    await settle();
    const guest = app.agent('r1');
    const creator = app.agent('cp1');
    assert.equal(app.when.get('creator_map')({ agent: guest }), false);
    assert.equal(app.when.get('creator_map')({ agent: creator }), true);
    const sections = new Map();
    const agentFor = (id, header = {}) => ({ id, header, ctx: { effect: (fn) => fn(), systemPrompt: { section: (spec) => sections.set(id, spec) } } });
    for (const [id, header] of [['r1', {}], ['c1', {}], ['h1', { parentSession: 'r1' }]]) app.handlers['agent/created']({ agent: agentFor(id, header) });
    assert.equal(sections.get('r1').text(), WORKSHOP_GUEST_NOTE);
    assert.equal(sections.get('c1').text(), '');
    assert.equal(sections.get('h1').text(), '', 'top-level only');
    const rules = app.provided.creatorPlus.longRunRules('r1');
    assert.equal(rules.offlineChecks, true, 'Creator Plus\'s rules for a guest');
    assert.equal(rules.cleanEnv, true);
    assert.equal(app.provided.creatorPlus.longRunRules('c1'), undefined);
    assert.equal(app.provided.creatorPlus.guestsGuarded, true);
    // Stage 6b (3.4): what a guest may run in Workshop: the allow-list plus the schedule tools (prefix form).
    assert.deepEqual([...app.provided.creatorPlus.allowed()], [...ALLOWED, 'schedule_'].sort());
    assert.ok(Object.isFrozen(app.provided.creatorPlus.allowed()));
    const view = await app.view('r1');
    assert.equal(view.session.inCreator, true);
    assert.equal(view.session.guest, true);
    assert.equal((await app.view('c1')).session.inCreator, false);
    assert.equal((await app.view('cp1')).session.guest, false);
    app.config.enabled = false;
    assert.equal(await app.decide(guest, 'bash', {}), '', 'Creator Plus off: guests keep Modes\' base rule only');
  } finally {
    app.close();
  }
});

test('unknown-guard: a thread whose space Modes cannot read is guarded as Workshop', async () => {
  const app = plugin({ modes: newModes({ unknown: () => true }) });
  try {
    await settle();
    const who = app.agent('x1');
    assert.equal(await app.decide(who, 'bash', {}), guestText(WORKSHOP_GUEST_NO_COMMANDS, { mode: 'Research' }));
    assert.equal(app.when.get('creator_map')({ agent: who }), false);
    assert.ok(app.provided.creatorPlus.longRunRules('x1'));
  } finally {
    app.close();
  }
});

test('older Modes and no Modes: a recorded Workshop space still guards (object parentSession followed); no Modes means no space', async () => {
  const older = { get: () => 'research', isolated: () => false, spaces: { of: (id) => (id === 'P' ? 'workshop' : '') }, depthSpoken: () => 'standard' };
  const app = plugin({ modes: older });
  const absent = plugin();
  try {
    await settle();
    const helper = app.agent('h1', { parent: { id: 'P' } });
    assert.equal(await app.decide(helper, 'bash', {}), guestText(WORKSHOP_GUEST_NO_COMMANDS, { mode: 'Research' }), 'the thread is closed but recorded in Workshop');
    const plain = absent.agent('p1');
    assert.equal(await absent.decide(plain, 'bash', {}), '');
    assert.equal(absent.provided.creatorPlus.longRunRules('p1'), undefined);
  } finally {
    app.close();
    absent.close();
  }
  assert.equal(makeGuardOf(() => undefined)('x').guardedBy, '');
});

test('recheck 4: every Creator Plus refusal a guest reaches names its mode and never points to creator_ tools', async () => {
  const home = [NO_COMMANDS, NOT_ALLOWED, NOT_THERE, UNSAFE_FOLDER, NO_FOLDER, RECON_ROOM, NO_SECRETS, LONG_RUN_NO_QUESTIONS];
  for (const why of home) {
    const said = guestRefusal(why, { mode: 'Research', tool: 'x' });
    assert.notEqual(said, why, why);
    if (why !== LONG_RUN_NO_QUESTIONS) assert.match(said, /Research/, said);
    assert.doesNotMatch(said, /creator_|Creator Plus conversation|start Creator Plus/i, said);
    // Plus is English only: an app set to Chinese still gets the English sentence.
    assert.equal(guestRefusal(why, { mode: 'Research', tool: 'x', lang: 'zh' }), said);
  }
  assert.equal(guestRefusal('pkg is outside this run\'s selection: Creator Plus sees only its place on the map (creator_map).', { mode: 'Research' }), guestText(WORKSHOP_GUEST_PLUGINS, { mode: 'Research' }), 'the bar\'s sentences: the guest\'s own');
  assert.equal(guestRefusal('', { mode: 'Research' }), '');
  for (const entry of [WORKSHOP_GUEST_NOT_THERE, WORKSHOP_GUEST_UNSAFE_FOLDER, WORKSHOP_GUEST_NO_FOLDER, WORKSHOP_GUEST_RECON_ROOM, WORKSHOP_GUEST_NO_SECRETS, WORKSHOP_GUEST_PLUGINS, WORKSHOP_GUEST_LONG_RUN]) {
    assert.ok(!('zh' in entry), 'English only');
  }
  const app = plugin({ modes: newModes() });
  try {
    await settle();
    const guest = app.agent('r1');
    const creator = app.agent('cp1');
    // The lab's case: Research in Workshop writes /private/tmp/x.
    const out = await app.decide(guest, 'write', { file_path: '/private/tmp/ws6a.txt', content: 'x' });
    assert.equal(out, guestText(WORKSHOP_GUEST_NOT_THERE, { mode: 'Research' }));
    assert.match(out, /^In Workshop, Research writes only inside creator-plus-builds/);
    assert.doesNotMatch(out, /creator_change/);
    // A folder that is no place to build: the home folder.
    const atHome = app.agent('r2', { cwd: join(app.root, 'me') });
    assert.equal(await app.decide(atHome, 'write', { file_path: join(app.root, 'me', BUILD_FOLDER, 'a.md'), content: 'x' }), guestText(WORKSHOP_GUEST_UNSAFE_FOLDER, { mode: 'Research' }));
    // The app's data folder.
    assert.equal(await app.decide(guest, 'read', { file_path: join(app.root, 'dsh', 'profiles', 'web', 'cordis.yml') }), guestText(WORKSHOP_GUEST_NO_SECRETS, { mode: 'Research' }));
    // Recon's room.
    assert.equal(await app.decide(guest, 'read', { file_path: '/private/tmp/dsh-recon-lab-x/run/a.txt' }), guestText(WORKSHOP_GUEST_RECON_ROOM, { mode: 'Research' }));
    // The final guard says the same.
    assert.equal(app.guards[0]({ agent: guest, name: 'write', arguments: { file_path: '/private/tmp/ws6a.txt' } }), guestText(WORKSHOP_GUEST_NOT_THERE, { mode: 'Research' }));
    // The Creator Plus mode keeps its own sentences (home modes keep today's behaviour).
    assert.equal(await app.decide(creator, 'write', { file_path: '/private/tmp/ws6a.txt', content: 'x' }), NOT_THERE);
    assert.equal(await app.decide(creator, 'bash', {}), NO_COMMANDS);
    assert.equal(await app.decide(guest, 'creator_map', {}), guestText(WORKSHOP_GUEST_CREATOR_TOOLS, { mode: 'Research' }));
  } finally {
    app.close();
  }
});
