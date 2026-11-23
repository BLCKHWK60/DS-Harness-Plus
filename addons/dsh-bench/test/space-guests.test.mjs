/**
 * Item 4A, stage 6a (STAGE6A-DESIGN.md 4.3, P3): the Devices space keeps its rules for any mode. A guest (another mode
 * in the Devices space, or a thread whose space Modes cannot read) is guarded by Bench: no commands, programs, jobs,
 * connectors, other Mac apps, Office files, schedules or unsorted tools; never the Devices folder or /dev at any key;
 * writes only in the thread's own folder; no file tool at all from a folder that holds the Devices folder.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply } from '../index.js';
import { MODE_ID } from '../lib/mode.js';
import { DEVICES_GUEST_FOLDER, DEVICES_GUEST_HOLDS, DEVICES_GUEST_NO_COMMANDS, DEVICES_GUEST_NOTE, holdsText, DEVICES_GUEST_REFUSED, DEVICES_GUEST_WRITE, NO_BACKUPS, NO_COMMANDS, NO_DEVICE_FILES, NOT_THERE, benchRefusal, guestFolderRefusal, guestRefusedText, pathsOfAny, withMode } from '../lib/guard.js';
import { ERROR_GUARD, localGuestRefuses, makeGuardOf } from '../lib/space-guard.js';

const scratch = () => mkdtempSync(join(tmpdir(), 'bench-space-'));
const settle = () => new Promise((done) => setTimeout(done, 20));

/** A Modes service of apiVersion 2 (as STAGE6A-DESIGN.md 2.1): `spaceOf` gives each thread's space, `modeOf` its mode. */
function newModes({ modeOf = () => 'code', spaceOf = () => 'devices', topOf = (id) => id, guestRefuses = localGuestRefuses, unknown = () => false } = {}) {
  return {
    apiVersion: 2,
    get: (id) => modeOf(topOf(id) || id),
    isolated: () => false,
    topOf,
    guardOf: (id) => {
      if (unknown(id)) return { ...ERROR_GUARD, sealed: false, legacy: false };
      const top = topOf(id) || id;
      const space = spaceOf(top);
      const mode = modeOf(top);
      const home = (space === 'devices' && mode === MODE_ID) || (space === 'workshop' && mode === 'creator-plus');
      return { top, space, mode, sealed: false, sealedBy: '', reconSpace: false, guardedBy: space === 'devices' || space === 'workshop' ? space : '', noPrograms: space === 'devices', homeMode: home, fresh: false, unknownTop: false };
    },
    spaces: { of: (id) => spaceOf(topOf(id) || id), guestRefuses },
  };
}

/** The add-on on a stand-in app, with the web route, the agents that are loaded and a home folder of its own. */
function plugin({ modes, agents = {}, enabled = true, scratchOf, workdirOf } = {}) {
  const provided = {};
  const home = scratch();
  const userHome = scratch();
  const registered = new Map();
  const when = new Map();
  const handlers = {};
  const guards = [];
  const routes = {};
  const settings = { describe: () => [{ ns: 'modes', value: { extraModes: '{}', defaultMode: 'cowork' } }], mutate: async () => {} };
  const tools = { register(tool, options) { registered.set(tool.name, tool); when.set(tool.name, options?.when); return () => registered.delete(tool.name); } };
  const services = { dshHomePath: (name) => join(home, name), settings, tools, agents: { list: () => Object.values(agents), get: (id) => agents[id] }, ...(modes === undefined ? {} : { modes }), ...(scratchOf ? { coworkScratch: { folderOf: scratchOf } } : {}), ...(workdirOf ? { workingDirectory: { get: workdirOf } } : {}) };
  const config = { enabled };
  const ctx = {
    get: (key) => (typeof services[key] === 'function' && key === 'modes' ? services[key]() : services[key]),
    tools: { guard(fn) { guards.push(fn); return () => {}; } },
    on(name, fn) { handlers[name] = fn; },
    effect(fn) { fn(); },
    provide(name, value) { provided[name] = value; },
    inject(_names, fn) {
      fn({ webServer: { register: (spec) => { routes[spec.path] = spec.handler; return () => {}; } }, connection: { requestRejection: () => undefined }, effect: (inner) => inner() });
    },
    logger: { warn() {}, info() {} },
  };
  apply(ctx, config, { userHome, identify: async () => 'no devices' });
  const devicesFolder = join(home, 'bench');
  mkdirSync(join(devicesFolder, 'devices', 'board'), { recursive: true });
  const allow = async () => ({ kind: 'allow' });
  return {
    home, userHome, devicesFolder, config, registered, when, handlers, guards, provided, routes,
    decide: (agent, name, args = {}) => handlers['tools/pre-execute']({ agent, name, arguments: args }, allow),
    final: (agent, name, args = {}) => guards[0]({ agent, name, arguments: args }),
    async get(path) {
      let body = '';
      await routes['/dsh-bench/data']({ method: 'GET', url: path }, { setHeader() {}, end(text) { body = text; } });
      return JSON.parse(body);
    },
    close() { rmSync(home, { recursive: true, force: true }); rmSync(userHome, { recursive: true, force: true }); },
  };
}

// Stage 6b (7.6): updated on purpose: schedules are open to a guest in Devices (point 27); the rest stays refused.
test('bench-guards-guest: Code in Devices is refused the Terminal, programs, jobs, connectors, Mac apps, Office, plugins and unsorted tools; schedules are open (6b)', async () => {
  const project = scratch();
  const top = { id: 'g1', header: { cwd: project } };
  const app = plugin({ modes: newModes(), agents: { g1: top } });
  try {
    await settle();
    assert.equal((await app.decide(top, 'schedule_create', { title: 't', prompt: 'p', rrule: 'FREQ=DAILY', target: 'new' })).kind, 'allow', 'guest-schedule-allowed');
    for (const name of ['bash', 'run_code', 'job_list', 'mcp__desktop__start_process', 'mac_shortcuts', 'office_convert', 'plugin_manager', 'zzz_unsorted_tool', 'terminal_send', 'engine', 'workflow']) {
      const answer = await app.decide(top, name, { command: 'ls' });
      assert.equal(answer.kind, 'deny', name);
      assert.equal(answer.reason, guestRefusedText(name), name);
      assert.equal(app.final(top, name, { command: 'ls' }), guestRefusedText(name), `${name}: the final guard too`);
    }
    assert.equal((await app.decide(top, 'bench_usb')).kind, 'allow');
    assert.equal(app.provided.bench.guestsGuarded, true, 'the flag Modes reads before it opens Devices to other modes');
  } finally {
    app.close();
    rmSync(project, { recursive: true, force: true });
  }
});

test('devices-guest-tools: a guest keeps its own tools and is offered Devices\' tools; a Chat thread is not', async () => {
  const project = scratch();
  const top = { id: 'g1', header: { cwd: project } };
  const chat = { id: 'c1', header: { cwd: project } };
  const app = plugin({ modes: newModes({ spaceOf: (id) => (id === 'c1' ? 'chat' : 'devices') }), agents: { g1: top, c1: chat } });
  try {
    await settle();
    assert.equal((await app.decide(top, 'data_query', { query: 'select * from \'sales.csv\'' })).kind, 'allow');
    assert.equal((await app.decide(top, 'web_search', { query: 'ESP32 / pinout' })).kind, 'allow');
    assert.equal((await app.decide(top, 'read', { file_path: join(project, 'notes.md') })).kind, 'allow');
    assert.equal((await app.decide(top, 'subagent', { prompt: 'look' })).kind, 'allow', 'helpers inherit the thread\'s guard');
    assert.equal(app.when.get('bench_usb')({ agent: top }), true, 'device tools offered to a guest in Devices');
    assert.equal(app.when.get('bench_usb')({ agent: chat }), false);
    assert.equal((await app.decide(chat, 'bash', { command: 'ls' })).kind, 'allow', 'Chat as before');
  } finally {
    app.close();
    rmSync(project, { recursive: true, force: true });
  }
});

test('devices-guest-writes-own-folder: writes only in the thread\'s folder; never the Devices folder, /dev, hidden files, Git hooks or start-up items', async () => {
  const project = scratch();
  const elsewhere = scratch();
  const top = { id: 'g1', header: { cwd: project } };
  const app = plugin({ modes: newModes(), agents: { g1: top } });
  const writeRefused = `${withMode(DEVICES_GUEST_WRITE.en, 'Code')} This thread's folder is ${project}.`;
  try {
    await settle();
    assert.equal((await app.decide(top, 'write', { file_path: join(project, 'src', 'main.c'), content: '/* x */ int main(){} // > /dev/null' })).kind, 'allow');
    assert.equal((await app.decide(top, 'edit', { file_path: 'src/main.c', old_string: '/usr/a', new_string: '/usr/b' })).kind, 'allow', 'a relative path in the folder; the text is not a path');
    assert.equal((await app.decide(top, 'write', { file_path: join(elsewhere, 'x.txt'), content: 'x' })).reason, writeRefused);
    assert.equal((await app.decide(top, 'write', { file_path: join(app.devicesFolder, 'devices', 'board', 'card.json'), content: '{}' })).reason, NOT_THERE);
    assert.equal((await app.decide(top, 'write', { file_path: '/dev/cu.usbserial', content: 'x' })).reason, NOT_THERE);
    for (const file of ['.git/hooks/pre-commit', '.zshrc', 'Library/LaunchAgents/x.plist', 'a/.secret/b']) {
      assert.equal((await app.decide(top, 'write', { file_path: join(project, file), content: 'x' })).reason, writeRefused, file);
    }
    assert.equal((await app.decide(top, 'move', { source: join(project, 'a'), destination: join(elsewhere, 'a') })).reason, writeRefused);
    assert.equal((await app.decide(top, 'apply_patch', { input: `*** Begin Patch\n*** Update File: ${join(elsewhere, 'y.js')}\n@@\n-a\n+b\n*** End Patch` })).reason, writeRefused);
    assert.equal((await app.decide(top, 'apply_patch', { input: '*** Begin Patch\n*** Add File: src/new.js\n+x\n*** End Patch' })).kind, 'allow');
    assert.equal((await app.decide(top, 'delete', {})).reason, writeRefused, 'a change tool whose path cannot be read');
    assert.equal((await app.decide(top, 'read', { file_path: join(app.devicesFolder, 'devices', 'board', 'backup.bin') })).reason, NO_BACKUPS);
    assert.equal((await app.decide(top, 'read', { file_path: '/dev/cu.usbserial' })).reason, NO_DEVICE_FILES);
  } finally {
    app.close();
    rmSync(project, { recursive: true, force: true });
    rmSync(elsewhere, { recursive: true, force: true });
  }
});

test('devices-guest-wide-folder: home folder, the app\'s data, a folder holding the Devices folder or the Devices folder itself: no files', async () => {
  const project = scratch();
  const cases = {};
  const app = plugin({ modes: newModes(), agents: cases });
  const folderRefused = withMode(DEVICES_GUEST_FOLDER.en, 'Code');
  try {
    await settle();
    cases.home = { id: 'home', header: { cwd: app.userHome } };
    cases.data = { id: 'data', header: { cwd: app.home } };
    cases.devices = { id: 'devices', header: { cwd: app.devicesFolder } };
    // The home folder (it does not hold this test's Devices folder): reading is allowed, writing is not.
    assert.equal((await app.decide(cases.home, 'read', { file_path: join(app.userHome, 'a.txt') })).kind, 'allow');
    assert.equal((await app.decide(cases.home, 'write', { file_path: join(app.userHome, 'a.txt'), content: 'x' })).reason, folderRefused);
    // The app's data folder holds the Devices folder: no file tool at all, the web still works.
    for (const name of ['read', 'glob', 'write', 'data_query']) assert.equal((await app.decide(cases.data, name, { file_path: join(app.home, 'notes.md'), pattern: '*.md' })).reason, folderRefused, name);
    assert.equal((await app.decide(cases.data, 'web_search', { query: 'x' })).kind, 'allow');
    assert.equal((await app.decide(cases.data, 'bench_usb')).kind, 'allow');
    assert.equal((await app.decide(cases.devices, 'read', { file_path: 'devices/board/card.json' })).reason, folderRefused);
    assert.equal(guestFolderRefusal({ folder: project, userHome: app.userHome, dshHome: app.home, benchFolders: [app.devicesFolder] }), '');
    assert.equal(guestFolderRefusal({ folder: app.userHome, userHome: app.userHome }), 'home folder');
    assert.notEqual(guestFolderRefusal({ folder: join(app.home, 'other'), userHome: app.userHome, dshHome: app.home, scratch: join(app.home, 'scratch') }), '');
    assert.equal(guestFolderRefusal({ folder: join(app.home, 'scratch', 't1'), userHome: app.userHome, dshHome: app.home, scratch: join(app.home, 'scratch') }), '', 'a Scratch thread writes in its own folder');
  } finally {
    app.close();
    rmSync(project, { recursive: true, force: true });
  }
});

test('devices-guest-any-path-key: a path to the Devices folder at any key, or inside a query, is refused', async () => {
  const project = scratch();
  const top = { id: 'g1', header: { cwd: project } };
  const app = plugin({ modes: newModes(), agents: { g1: top } });
  try {
    await settle();
    assert.equal((await app.decide(top, 'code_map_overview', { root: app.devicesFolder })).reason, NO_BACKUPS);
    assert.equal((await app.decide(top, 'data_query', { query: `select * from '${join(app.devicesFolder, 'b.json')}'` })).reason, NO_BACKUPS);
    assert.equal((await app.decide(top, 'data_query', { options: { nested: { input: join(app.devicesFolder, 'devices') } } })).reason, NO_BACKUPS, 'depth 3');
    // Lab re-check fix (6a, problem 8): a folder that holds the Devices folder further down gets its own sentence.
    assert.equal((await app.decide(top, 'code_map_overview', { root: app.home })).reason, holdsText({ mode: 'Code', tool: 'code_map_overview', path: app.home }), 'a folder that holds the Devices folder');
    assert.ok(pathsOfAny({ query: "select * from '/a/b.csv' join '~/c.csv'" }, '/w').includes('/a/b.csv'));
  } finally {
    app.close();
    rmSync(project, { recursive: true, force: true });
  }
});

test('helper-uses-top-folder: a helper with another folder writes only in its thread\'s folder; two levels deep through modes.topOf', async () => {
  const project = scratch();
  const own = scratch();
  const top = { id: 'g1', header: { cwd: project } };
  const helper = { id: 'h1', header: { cwd: own, parentSession: 'g1' } };
  const deep = { id: 'h2', header: { cwd: own, parentSession: 'h1-closed' } };
  const modes = newModes({ topOf: (id) => (id === 'h1' || id === 'h2' ? 'g1' : id) });
  const app = plugin({ modes, agents: { g1: top, h1: helper, h2: deep } });
  try {
    await settle();
    assert.equal((await app.decide(helper, 'write', { file_path: join(own, 'x.txt'), content: 'x' })).reason, `${withMode(DEVICES_GUEST_WRITE.en, 'Code')} This thread's folder is ${project}.`);
    assert.equal((await app.decide(helper, 'write', { file_path: join(project, 'x.txt'), content: 'x' })).kind, 'allow');
    assert.equal((await app.decide(deep, 'write', { file_path: join(project, 'y.txt'), content: 'x' })).kind, 'allow', 'Modes found the thread two levels up');
    assert.equal((await app.decide(deep, 'bash', {})).reason, DEVICES_GUEST_NO_COMMANDS.en);
  } finally {
    app.close();
    rmSync(project, { recursive: true, force: true });
    rmSync(own, { recursive: true, force: true });
  }
});

test('scratch-thread: a Scratch thread writes in its own Scratch folder', async () => {
  const project = scratch();
  const own = join(project, 'scratch-t1');
  mkdirSync(own);
  const top = { id: 'g1', header: { cwd: project } };
  const app = plugin({ modes: newModes(), agents: { g1: top }, scratchOf: (agent) => (agent?.id === 'g1' ? own : '') });
  try {
    await settle();
    assert.equal((await app.decide(top, 'write', { file_path: join(own, 'a.txt'), content: 'x' })).kind, 'allow');
    assert.equal((await app.decide(top, 'write', { file_path: join(project, 'a.txt'), content: 'x' })).reason, `${withMode(DEVICES_GUEST_WRITE.en, 'Code')} This thread's folder is ${own}.`);
  } finally {
    app.close();
    rmSync(project, { recursive: true, force: true });
  }
});

test('unknown-guard: a thread whose space Modes cannot read is guarded, but gets no device tools', async () => {
  const project = scratch();
  const top = { id: 'u1', header: { cwd: project } };
  const app = plugin({ modes: newModes({ unknown: () => true }), agents: { u1: top } });
  try {
    await settle();
    assert.equal((await app.decide(top, 'bash', { command: 'ls' })).reason, DEVICES_GUEST_NO_COMMANDS.en);
    assert.equal(app.when.get('bench_usb')({ agent: top }), false);
    assert.deepEqual(app.provided.bench.longRunRules('u1'), { checks: true, closePorts: true });
  } finally {
    app.close();
    rmSync(project, { recursive: true, force: true });
  }
});

test('parent-not-loaded and object parentSession: an older Modes, a helper whose thread is closed but recorded in Devices', async () => {
  const project = scratch();
  const older = { get: () => 'research', isolated: () => false, spaces: { of: (id) => (id === 'P' ? 'devices' : '') } };
  const helper = { id: 'h1', header: { cwd: project, parentSession: 'P' } };
  const objectHelper = { id: 'h2', header: { cwd: project, parentSession: { id: 'P' } } };
  const app = plugin({ modes: older, agents: { h1: helper, h2: objectHelper } });
  try {
    await settle();
    assert.equal((await app.decide(helper, 'bash', { command: 'ls' })).reason, DEVICES_GUEST_NO_COMMANDS.en);
    assert.equal((await app.decide(objectHelper, 'run_code', {})).reason, DEVICES_GUEST_NO_COMMANDS.en);
    assert.equal((await app.decide(helper, 'zzz_new_tool', {})).reason, guestRefusedText('zzz_new_tool'), 'Bench\'s own copy of the guest test refuses an unsorted tool');
    assert.equal((await app.decide(helper, 'write', { file_path: join(project, 'x'), content: 'x' })).reason, withMode(DEVICES_GUEST_WRITE.en, 'Research'), 'the thread is not loaded: no folder to write in');
  } finally {
    app.close();
    rmSync(project, { recursive: true, force: true });
  }
});

test('longRunRules, the note and the chat box route for a guest; the Devices mode as before', async () => {
  const project = scratch();
  const top = { id: 'g1', header: { cwd: project } };
  const modes = newModes({ modeOf: (id) => (id === 'b1' ? MODE_ID : id === 'c1' ? 'cowork' : 'code'), spaceOf: (id) => (id === 'c1' ? 'chat' : 'devices'), topOf: (id) => (id === 'h1' ? 'g1' : id) });
  const app = plugin({ modes, agents: { g1: top } });
  try {
    await settle();
    assert.deepEqual(app.provided.bench.longRunRules('g1'), { checks: true, closePorts: true });
    assert.deepEqual(app.provided.bench.longRunRules('b1'), { checks: true, closePorts: true });
    assert.equal(app.provided.bench.longRunRules('c1'), undefined);
    const sections = new Map();
    const agentFor = (id, header = {}) => ({ id, header, ctx: { effect: (fn) => fn(), systemPrompt: { section: (spec) => sections.set(id, spec) } } });
    for (const [id, header] of [['g1', {}], ['b1', {}], ['c1', {}], ['h1', { parentSession: 'g1' }]]) app.handlers['agent/created']({ agent: agentFor(id, header) });
    assert.ok(sections.get('g1').text().startsWith(DEVICES_GUEST_NOTE));
    assert.match(sections.get('g1').text(), /Writing files: open\. Only inside this thread's own folder/);
    assert.doesNotMatch(sections.get('b1').text(), /Devices space: Devices' rules hold/);
    assert.match(sections.get('b1').text(), /The Devices folder is/);
    assert.equal(sections.get('c1').text(), '');
    assert.equal(sections.get('h1').text(), '', 'a guest\'s helper: no note (as for the Devices mode\'s helpers before)');
    const guest = await app.get('/dsh-bench/data?session=g1');
    assert.equal(guest.session.inBench, true);
    assert.equal(guest.session.guest, true);
    assert.match(guest.closed[0].what, /connectors, other Mac apps/);
    // Stage 6b (7.2): the first line no longer names schedules; a line says they are open.
    assert.doesNotMatch(guest.closed[0].what, /schedules/i);
    const schedules = guest.closed.find((line) => line.what === 'Automations');
    assert.equal(schedules?.open, true);
    assert.match(schedules.why, /An automation made here runs in Devices under these rules, unless you pick another space and a folder with the clock button\./);
    // Stage 7 (decision 28): a page that says it is Chinese still gets the English lines.
    const zh = await app.get('/dsh-bench/data?session=g1&lang=zh-CN');
    assert.deepEqual(zh.closed, guest.closed);
    assert.deepEqual((await app.get('/dsh-bench/data?session=b1')).session, { inBench: true, guest: false });
    assert.equal((await app.get('/dsh-bench/data?session=c1')).session.inBench, false);
    // The Devices mode keeps its own allow-list and sentences.
    assert.equal((await app.decide({ id: 'b1', header: { cwd: project } }, 'bash', {})).reason, NO_COMMANDS);
    assert.equal((await app.decide({ id: 'b1', header: { cwd: project } }, 'data_query', {})).kind, 'deny');
    app.config.enabled = false;
    assert.equal((await app.decide(top, 'bash', {})).kind, 'allow', 'Bench off: guests keep Modes\' base rule only');
    assert.equal(app.provided.bench.longRunRules('g1'), undefined);
  } finally {
    app.close();
    rmSync(project, { recursive: true, force: true });
  }
});

test('bench-modes-absent and a Modes that throws: no Modes is "no space"; a throwing one guards every thread', async () => {
  const project = scratch();
  const top = { id: 'c1', header: { cwd: project } };
  const absent = plugin({ agents: { c1: top } });
  const throwing = plugin({ modes: () => { throw new Error('modes broke'); }, agents: { c1: top } });
  try {
    await settle();
    assert.equal((await absent.decide(top, 'bash', { command: 'ls' })).kind, 'allow');
    assert.equal(absent.when.get('bench_usb')({ agent: top }), false);
    assert.equal(absent.provided.bench.longRunRules('c1'), undefined);
    // ctx.get itself throws: as no Modes (2.6). A service that is there and throws: fail closed.
    assert.equal((await throwing.decide(top, 'bash', { command: 'ls' })).kind, 'allow');
    const broken = plugin({ modes: { get: () => { throw new Error('x'); }, isolated: () => { throw new Error('x'); }, guardOf: () => { throw new Error('x'); } }, agents: { c1: top } });
    try {
      await settle();
      assert.equal((await broken.decide(top, 'bash', { command: 'ls' })).reason, DEVICES_GUEST_NO_COMMANDS.en);
      assert.equal(broken.when.get('bench_usb')({ agent: top }), false, 'no device tools on a read error');
    } finally {
      broken.close();
    }
  } finally {
    absent.close();
    throwing.close();
    rmSync(project, { recursive: true, force: true });
  }
});

test('the guest test: Bench\'s copy agrees with the contract list (2.3), and Modes\' own test is used when there', async () => {
  for (const name of ['bash', 'run_code', 'data_python', 'job_list', 'engine', 'workflow', 'plugin_manager', 'mcp__desktop__start_process', 'mac_shortcuts', 'mac_mail_send', 'office_convert', 'creator_scaffold', 'schedule_create', 'zzz_tool', 'recon_web_search', 'tuning_start']) {
    assert.equal(localGuestRefuses(name), true, name);
  }
  // Stage 6b: with the guest's space, the app's schedule tools are open; no space (or 'unknown') keeps them refused.
  for (const name of ['schedule_create', 'schedule_edit', 'schedule_list', 'schedule_view']) {
    assert.equal(localGuestRefuses(name, { space: 'devices' }), false, name);
    assert.equal(localGuestRefuses(name, { space: 'unknown' }), true, name);
  }
  assert.equal(localGuestRefuses('schedule_delete', { space: 'devices' }), true, 'not one of the app\'s tools: unsorted, refused');
  for (const name of ['bench_usb', 'read', 'write', 'web_search', 'subagent', 'deep_research', 'mac_find_files', 'data_query', 'todo_write', 'tools_catalog', 'request_tool_access', 'diagram_draw', 'pdf_read', 'mission_step', 'mission_request']) {
    assert.equal(localGuestRefuses(name), false, name);
  }
  // Modes' own test decides when Modes has it: here it refuses web_search too.
  const project = scratch();
  const top = { id: 'g1', header: { cwd: project } };
  const app = plugin({ modes: newModes({ guestRefuses: (name) => name === 'web_search' }), agents: { g1: top } });
  try {
    await settle();
    assert.equal((await app.decide(top, 'web_search', {})).reason, guestRefusedText('web_search'));
    assert.equal((await app.decide(top, 'read', { file_path: join(project, 'a') })).kind, 'allow');
  } finally {
    app.close();
    rmSync(project, { recursive: true, force: true });
  }
  assert.equal(benchRefusal({ name: 'zzz', args: {}, cwd: '/w', guest: true, isRefused: () => { throw new Error('x'); } }), guestRefusedText('zzz'), 'a test that fails refuses');
});

test('every new sentence is English only (stage 7); the guard reader without Modes is "no space"', () => {
  for (const text of [DEVICES_GUEST_NO_COMMANDS, DEVICES_GUEST_WRITE, DEVICES_GUEST_FOLDER, DEVICES_GUEST_REFUSED]) {
    assert.deepEqual(Object.keys(text), ['en']);
    assert.doesNotMatch(text.en, /[\u4e00-\u9fff]/);
  }
  assert.equal(makeGuardOf(() => undefined)('x').sealed, false);
  assert.equal(makeGuardOf(() => ({ guardOf: () => { throw new Error('x'); } }))('x').guardedBy, 'unknown');
});

test('longRunRules folderUnsafe (stage 6a integration): a guest whose folder is too wide gets folderUnsafe; a safe folder and the Devices mode do not', async () => {
  const { homedir } = await import('node:os');
  const project = scratch();
  const wide = { id: 'w1', header: { cwd: homedir() } };
  const safe = { id: 's1', header: { cwd: project } };
  const modes = newModes({ modeOf: (id) => (id === 'b1' ? MODE_ID : 'code'), spaceOf: () => 'devices' });
  const app = plugin({ modes, agents: { w1: wide, s1: safe, b1: { id: 'b1', header: { cwd: homedir() } } } });
  try {
    await settle();
    const rules = app.provided.bench.longRunRules('w1');
    assert.equal(typeof rules.folderUnsafe, 'string');
    assert.ok(rules.folderUnsafe.length > 0, 'the home folder (which also holds the Plus folder) is too wide');
    assert.deepEqual(app.provided.bench.longRunRules('s1'), { checks: true, closePorts: true });
    assert.deepEqual(app.provided.bench.longRunRules('b1'), { checks: true, closePorts: true }, 'the Devices mode itself: as before');
  } finally {
    app.close();
    rmSync(project, { recursive: true, force: true });
  }
});

test('lab fix: a Scratch guest writes with a relative path in its own folder (the app\'s working folder, not the header\'s)', async () => {
  const scratchRoot = scratch();
  const own = join(scratchRoot, 'session-9f45');
  mkdirSync(own);
  // As in the lab: the header names the Scratch folder above; the app works in the thread's own sub-folder.
  const session = { id: 'g1' };
  const top = { id: 'g1', header: { cwd: scratchRoot }, session };
  const app = plugin({ modes: newModes({ modeOf: () => 'cowork' }), agents: { g1: top }, scratchOf: (agent) => (agent?.id === 'g1' ? own : ''), workdirOf: (one) => (one === session ? own : '') });
  try {
    await settle();
    for (const file_path of ['ok.txt', './ok3.txt', join(own, 'ok2.txt'), 'sub/x.txt']) {
      assert.equal((await app.decide(top, 'write', { file_path, content: 'x' })).kind, 'allow', file_path);
      assert.equal(app.final(top, 'write', { file_path, content: 'x' }), undefined, `${file_path}: the final guard too`);
    }
    const out = await app.decide(top, 'write', { file_path: '../elsewhere.txt', content: 'x' });
    assert.equal(out.kind, 'deny');
    assert.match(out.reason, new RegExp(`This thread's folder is ${own.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.$`), 'the sentence names the folder');
    assert.equal((await app.decide(top, 'write', { file_path: '.zshrc', content: 'x' })).kind, 'deny', 'still no dot-files');
  } finally {
    app.close();
    rmSync(scratchRoot, { recursive: true, force: true });
  }
});

test('lab fix: each refused group gets its own sentence (schedules, Mac apps, connectors, Office), the Terminal one only for commands', () => {
  assert.equal(guestRefusedText('bash'), DEVICES_GUEST_NO_COMMANDS.en);
  assert.equal(guestRefusedText('run_code'), DEVICES_GUEST_NO_COMMANDS.en);
  assert.equal(guestRefusedText('schedule_create'), 'Devices refuses automations (they start work later) for every mode, so schedule_create was not run. Use the device tools (bench_…) or the file tools.');
  assert.match(guestRefusedText('mac_shortcuts'), /^Devices refuses tools that drive other Mac apps for every mode, so mac_shortcuts was not run/);
  assert.match(guestRefusedText('mcp__desktop__start_process'), /^Devices refuses connectors for every mode, so mcp__desktop__start_process was not run/);
  assert.match(guestRefusedText('office_convert'), /^Devices refuses Office file tools/);
  assert.match(guestRefusedText('zzz_tool'), /tools no one has sorted yet in Tool access/);
  assert.equal(guestRefusedText('schedule_create', 'zh'), guestRefusedText('schedule_create'), 'a Chinese app still gets English');
  for (const name of ['schedule_create', 'mac_shortcuts', 'office_convert']) assert.doesNotMatch(guestRefusedText(name), /Terminal/);
});

test('recheck 8: working_directory to a folder that only holds the Devices folder gets a sentence that fits', async () => {
  const project = scratch();
  const top = { id: 'g1', header: { cwd: project } };
  const app = plugin({ modes: newModes(), agents: { g1: top } });
  try {
    await settle();
    const said = (await app.decide(top, 'working_directory', { cd: app.home })).reason;
    assert.equal(said, holdsText({ mode: 'Code', tool: 'working_directory', path: app.home }));
    assert.match(said, /^In Devices, Code cannot use working_directory on .*: that folder holds the Devices folder \(cards, logbooks, backups\) further down/);
    assert.notEqual(said, NO_BACKUPS, 'not the sentence for the Devices folder itself');
    assert.equal((await app.decide(top, 'grep', { pattern: 'x', path: app.home })).reason, holdsText({ mode: 'Code', tool: 'grep', path: app.home }));
    // The Devices folder itself still gets its own sentence.
    assert.equal((await app.decide(top, 'working_directory', { cd: app.devicesFolder })).reason, NO_BACKUPS);
    assert.ok(!(await app.decide(top, 'read', { file_path: join(project, 'a.txt') })).reason, 'the thread\'s own folder');
    // Stage 7 (decision 28): a Chinese caller still gets the English sentence; an empty mode reads "this mode".
    assert.equal(holdsText({ mode: 'Code', tool: 'grep', path: '/Users/x', lang: 'zh' }), holdsText({ mode: 'Code', tool: 'grep', path: '/Users/x' }));
    assert.match(holdsText({ tool: 'grep', path: '/Users/x', lang: 'zh' }), /^In Devices, this mode cannot use grep on \/Users\/x:/);
    assert.deepEqual(Object.keys(DEVICES_GUEST_HOLDS), ['en']);
  } finally {
    app.close();
    rmSync(project, { recursive: true, force: true });
  }
});

// ---- Item 4A, stage 6b (J14, 3.3): schedules for guests; the unknown guard and the Devices mode keep refusing them ----

test('fallback-guest-schedule-allowed: with an older Modes (no spaces.guestRefuses) Bench\'s own copy opens schedules to a Devices guest', async () => {
  const project = scratch();
  const top = { id: 'g1', header: { cwd: project } };
  const modes = newModes();
  delete modes.spaces.guestRefuses;
  const app = plugin({ modes, agents: { g1: top } });
  try {
    await settle();
    // Its instruction may name /dev: the run stays under Devices' rules, so no path check applies to a schedule tool.
    assert.equal((await app.decide(top, 'schedule_create', { title: 't', prompt: 'list /dev/tty.usb* every hour', rrule: 'FREQ=HOURLY', target: 'new' })).kind, 'allow');
    assert.equal(app.final(top, 'schedule_list', {}), undefined);
    assert.equal((await app.decide(top, 'bash', { command: 'ls' })).kind, 'deny', 'the rest as before');
  } finally {
    app.close();
    rmSync(project, { recursive: true, force: true });
  }
});

test('unknown-guard-schedule-refused: a thread whose space Modes cannot read gets no schedule tools (fail closed)', async () => {
  const project = scratch();
  const top = { id: 'u1', header: { cwd: project } };
  for (const modes of [newModes({ unknown: () => true }), (() => { const older = newModes({ unknown: () => true }); delete older.spaces.guestRefuses; return older; })()]) {
    const app = plugin({ modes, agents: { u1: top } });
    try {
      await settle();
      const answer = await app.decide(top, 'schedule_create', { target: 'this_session' });
      assert.equal(answer.kind, 'deny');
      assert.equal(answer.reason, guestRefusedText('schedule_create'));
    } finally {
      app.close();
    }
  }
  rmSync(project, { recursive: true, force: true });
});

test('home-bench-schedule-refused: the Devices mode keeps its own allow-list, without schedules (point 26)', async () => {
  const project = scratch();
  const top = { id: 'b1', header: { cwd: project } };
  const app = plugin({ modes: newModes({ modeOf: () => MODE_ID }), agents: { b1: top } });
  try {
    await settle();
    for (const name of ['schedule_create', 'schedule_list']) assert.equal((await app.decide(top, name, { target: 'this_session' })).kind, 'deny', name);
  } finally {
    app.close();
    rmSync(project, { recursive: true, force: true });
  }
});

test('folder-touches-devices: the Devices folder (in, at, or holding it) and /dev are named; a project folder is fine; unreadable is unknown', async () => {
  const project = scratch();
  const app = plugin({ modes: newModes(), agents: {} });
  try {
    await settle();
    const touches = app.provided.bench.folderTouchesDevices;
    assert.equal(touches(app.devicesFolder), 'devices');
    assert.equal(touches(join(app.devicesFolder, 'devices', 'board')), 'devices', 'inside it');
    assert.equal(touches(app.home), 'devices', 'a folder that holds it');
    assert.equal(touches('/dev'), 'dev');
    assert.equal(touches('/dev/tty.usbserial'), 'dev');
    assert.equal(touches('/private/dev'), 'dev');
    assert.equal(touches('/'), 'dev', 'the whole disk holds /dev');
    assert.equal(touches(project), '');
    for (const bad of ['', 'relative/path', 42, null, `/x${'\0'}y`]) assert.equal(touches(bad), 'unknown', String(bad));
  } finally {
    app.close();
    rmSync(project, { recursive: true, force: true });
  }
});
