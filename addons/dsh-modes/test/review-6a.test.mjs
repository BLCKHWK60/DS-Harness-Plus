/**
 * Item 4A, stage 6a, fix round after review: one test (or more) per confirmed finding (dsh-modes).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { boot, makeWorld, maskNow, settle } from './app.mjs';
import { readModes, Config } from '../index.js';
import { heldIn, roomPathRefusal, spaceCopy, lostIn } from '../lib/spacerules.js';
import { LOCKED_MODE } from '../lib/isolation.js';
import { heldText, modeList, spaceMovePlan, spaceText, tickLines, UNSORTED_FAMILY } from '../lib/spaces.js';
import { SEALED_REASON } from '../lib/toolaccess.js';
import { MODE as RECON } from '../../dsh-recon/lib/mode.js';
import { MODE as RESEARCH } from '../../dsh-research/lib/mode.js';

const here = path.dirname(new URL(import.meta.url).pathname);
const ROOM = realpathSync(mkdtempSync(path.join(tmpdir(), 'dsh-6a-review-room-')));
const KNOWN = ['read', 'write', 'edit', 'glob', 'grep', 'bash', 'run_code', 'engine', 'web_search', 'web_fetch', 'subagent', 'todo_write', 'recon_web_search',
  'recon_web_read', 'recon_cite', 'bench_usb', 'tools_catalog', 'request_tool_access', 'pdf_ocr', 'code_map_read', 'scout_files', 'library_read', 'my_plugin_tool'];
const EXTRA = {
  recon: RECON,
  research: RESEARCH,
  bench: { label: 'Devices', tools: ['read', 'bench_usb'], sandbox: 'read-only' },
  'creator-plus': { label: 'Creator Plus', tools: 'all' },
};
const TICKS = { research: ['chat', 'code', 'recon', 'devices', 'workshop'], plain: ['chat', 'code', 'recon'], code: ['code', 'devices', 'workshop'] };
const json = (value) => {
  const raw = value && typeof value === 'object' && typeof value.get === 'function' ? value.get() : value;
  return typeof raw === 'string' ? JSON.parse(raw || '{}') : raw ?? {};
};
function reconService() {
  return {
    apiVersion: 3,
    inSpace: () => true,
    isRoom: (folder) => String(folder ?? '').startsWith(ROOM),
    roomRunFolder: (id) => {
      const folder = path.join(ROOM, `run-${id}`);
      mkdirSync(folder, { recursive: true });
      return folder;
    },
  };
}
function start(fields = {}, { bench = { guestsGuarded: true }, creatorPlus = { guestsGuarded: true }, services = {}, ...options } = {}) {
  const world = makeWorld({ pruneStaleSessions: false, extraModes: JSON.stringify(EXTRA), modeSpaces: JSON.stringify(TICKS), ...fields });
  const all = { recon: reconService(), bench: bench || null, creatorPlus: creatorPlus || null, ...services };
  const app = boot(world, { tabs: true, known: KNOWN, ...options, services: all });
  return { app, world, bench };
}
const call = (app, agent, name, args = {}) => app.guard({ name, agent, arguments: args });

// ---- Finding: a nested helper loses its guard once the helper that started it is closed (blocker + major) ----------

test('nested helper: closing the middle helper keeps the grandchild sealed in Recon', async () => {
  const { app } = start();
  const t = await app.open('rt', { header: { cwd: ROOM } });
  await app.service().spaces.startDraft('rt', { space: 'recon' });
  await app.service().spaces.pick('rt', 'research');
  await app.firstTurn(t.agent);
  await settle();
  const h1 = await app.open('rh1', { header: { cwd: ROOM, parentSession: 'rt' } });
  const h2 = await app.open('rh2', { header: { cwd: ROOM, parentSession: 'rh1' } });
  const before = app.service().guardOf('rh2');
  assert.equal(before.sealed, true);
  assert.equal(before.reconSpace, true);
  await app.close(h1.agent);
  const after = app.service().guardOf('rh2');
  assert.equal(after.top, 'rt', 'the chain still reaches the thread');
  assert.equal(after.space, 'recon');
  assert.equal(after.sealed, true);
  assert.equal(after.reconSpace, true);
  assert.notEqual(call(app, h2.agent, 'web_search', { query: 'x' }), undefined, 'web_search refused');
  assert.notEqual(call(app, h2.agent, 'bash', { command: 'ls' }), undefined, 'bash refused');
  app.stop();
});

test('nested helper: closing the middle helper keeps the grandchild under the Devices rules', async () => {
  const { app } = start({ sessionSpaces: JSON.stringify({ dt: 'devices' }), sessionModes: JSON.stringify({ dt: 'code' }) });
  await app.open('dt', { source: 'resume', lastTurn: 1 });
  const h1 = await app.open('dh1', { header: { parentSession: 'dt' } });
  const h2 = await app.open('dh2', { header: { parentSession: 'dh1' } });
  assert.equal(app.service().guardOf('dh2').guardedBy, 'devices');
  await app.close(h1.agent);
  const after = app.service().guardOf('dh2');
  assert.equal(after.top, 'dt');
  assert.equal(after.guardedBy, 'devices');
  assert.equal(after.noPrograms, true);
  assert.match(call(app, h2.agent, 'bash', { command: 'ls' }) ?? '', /refuses the Terminal/);
  app.stop();
});

test('nested helper: a parent link to a closed id with nothing recorded is not a known thread (fail closed, I5)', async () => {
  const { app } = start({ sessionSpaces: JSON.stringify({ dz: 'devices' }), sessionModes: JSON.stringify({ dz: 'code' }) });
  await app.open('dz', { source: 'resume', lastTurn: 1 });
  // A helper whose header names a parent that is neither loaded nor recorded (its link was never seen).
  const lost = await app.open('lostkid', { header: { parentSession: 'ghost-helper' } });
  const guard = app.service().guardOf('lostkid');
  assert.equal(guard.unknownTop, true);
  assert.equal(guard.guardedBy, 'unknown');
  assert.equal(app.service().get('lostkid'), LOCKED_MODE.id, 'held while a guarded thread is live');
  assert.notEqual(call(app, lost.agent, 'bash'), undefined);
  app.stop();
});

// ---- Finding: popup-granted file readers bypass the room path rule ----------------------------------------------

test('room path rule: pdf_ocr, code_map_*, working_directory are path-checked; Scout and the Library are refused in Recon', () => {
  const run = path.join(ROOM, 'run-pr');
  mkdirSync(run, { recursive: true });
  const want = (name, args, extra) => roomPathRefusal({ name, args, cwd: run, room: run, extra });
  for (const name of ['pdf_ocr', 'code_map_read', 'code_map_overview', 'code_map_file', 'working_directory']) {
    assert.match(want(name, { path: '/etc/hosts' }), /only in this thread's room folder/, name);
  }
  assert.equal(want('code_map_read', { path: path.join(run, 'a.js') }), '', 'inside the room: allowed');
  assert.match(want('scout_files', {}), /room folder/, 'Scout\'s folder is outside the room');
  assert.match(want('library_read', { id: 'doc1' }), /room folder/, 'the Library is outside the room');
  assert.equal(want('library_read', { id: 'doc1' }, ['library_read']), '', 'kept by the owner (sealedExtra)');
});

// ---- Finding: the room path rule read text bodies as paths ------------------------------------------------------

test('room path rule: text bodies and grep patterns are not places; paths still are', () => {
  const run = path.join(ROOM, 'run-body');
  mkdirSync(run, { recursive: true });
  writeFileSync(path.join(run, 'report.md'), 'x');
  const want = (name, args) => roomPathRefusal({ name, args, cwd: run, room: run });
  assert.equal(want('write', { file_path: path.join(run, 'report.md'), content: 'see /etc/passwd and ~/x' }), '');
  assert.equal(want('edit', { file_path: path.join(run, 'report.md'), old_string: 'x', new_string: 'see /dev/null' }), '');
  assert.equal(want('grep', { pattern: '/login', path: run }), '');
  assert.match(want('write', { file_path: '/etc/x', content: 'hello' }), /room folder/, 'a path key outside the room still refused');
  assert.match(want('glob', { pattern: '/etc/*' }), /room folder/, 'glob\'s pattern names where it looks');
  assert.match(want('data_query', { query: "SELECT * FROM '/etc/x.csv'" }), /room folder/, 'a query can name a file');
  assert.match(want('write', { content: 'no path at all' }), /room folder/, 'a changing tool naming no place is refused');
});

// ---- Finding: Recon request reasons kept in the shared tool-access log ------------------------------------------

test('tool access: a sealed thread\'s reason never reaches the log; a wiped thread\'s lines go', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'dsh-6a-ta-'));
  const listeners = new Set();
  const reconWipe = { has: () => false, list: () => [], onChange: (listener) => { listeners.add(listener); return () => listeners.delete(listener); } };
  const world = makeWorld({
    pruneStaleSessions: false,
    toolAccessOn: true,
    extraModes: JSON.stringify({ recon: { label: 'Recon', tools: ['recon_cite'], isolated: true }, safe: { label: 'Safe', tools: ['read'] } }),
    sessionModes: JSON.stringify({ r1: 'recon', s1: 'safe' }),
  });
  const app = boot(world, { known: KNOWN, home, services: { reconWipe } });
  try {
    const r1 = await app.open('r1');
    const s1 = await app.open('s1');
    await app.firstTurn(r1.agent);
    await app.firstTurn(s1.agent);
    const access = app.provided('toolAccess');
    access.registerCard(async () => ({ choice: 'deny' }));
    await app.tool('request_tool_access').definition.execute({ tool: 'write', reason: 'save the dossier on target found at secret.onion' }, { agent: r1.agent });
    await app.tool('request_tool_access').definition.execute({ tool: 'write', reason: 'save my notes' }, { agent: s1.agent });
    const file = path.join(home, 'tool-access', 'tool-access.jsonl');
    const text = readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /secret\.onion|dossier/, 'the sealed reason is not logged');
    assert.ok(text.includes(SEALED_REASON));
    assert.match(text, /save my notes/, 'an ordinary thread\'s reason still is');
    // Recon wipes r1 (End and wipe): its lines go; s1's stay.
    for (const listener of listeners) listener('r1');
    const after = readFileSync(file, 'utf8');
    assert.ok(!after.split('\n').filter(Boolean).some((line) => JSON.parse(line).sessionId === 'r1'), 'no line of r1 is left');
    assert.match(after, /save my notes/);
  } finally {
    app.stop();
  }
  assert.ok(existsSync(home));
});

// ---- Finding: a Mission started before a move keeps its old rules ------------------------------------------------

test('move: a thread with a Mission that has not ended cannot move into Devices or Workshop', async () => {
  const mission = { runOf: (id) => (id === 'mc' ? { runId: 'run1', kind: 'long' } : undefined), longRun: () => undefined };
  const { app } = start({ sessionSpaces: JSON.stringify({ mc: 'code', nc: 'code' }), sessionModes: JSON.stringify({ mc: 'code', nc: 'code' }) }, { mission });
  await app.open('mc', { source: 'resume', lastTurn: 1 });
  await app.open('nc', { source: 'resume', lastTurn: 1 });
  await assert.rejects(app.service().spaces.move(['mc'], 'devices'), /Mission that has not ended/);
  await assert.rejects(app.service().spaces.move(['mc'], 'workshop'), /Mission that has not ended/);
  assert.equal((await app.service().spaces.move(['nc'], 'devices')).moved, 1, 'without a Mission it moves');
  assert.match(spaceMovePlan({ to: 'devices', from: 'code', current: 'code', sealed: false, missionLive: true, shown: ['devices'], lang: 'zh' }).refusal, /has a Mission that has not ended/, 'English on a Chinese page');
  app.stop();
});

// ---- Finding: I26 counted a program only when it finished --------------------------------------------------------

test('move: a shell call still running (allowed, no result yet) keeps the thread out of Devices', async () => {
  const { app } = start({ sessionSpaces: JSON.stringify({ lp: 'code' }), sessionModes: JSON.stringify({ lp: 'code' }) });
  const lp = await app.open('lp', { source: 'resume', lastTurn: 1 });
  await app.waterfall('tools/pre-execute', { name: 'bash', agent: lp.agent, arguments: { command: 'screen /dev/cu.usbserial 115200' } }, async () => ({ kind: 'allow' }));
  await assert.rejects(app.service().spaces.move(['lp'], 'devices'), /ran the Terminal or a program/);
  app.stop();
});

// ---- Finding: with Bench or Creator Plus off, guests keep only the base rule --------------------------------------

test('spaceCopy: a guest in Devices or Workshop is held without tools while the guard add-on is off', () => {
  const code = { id: 'code', tools: ['read', 'write'] };
  // Stage 6a leftovers: the held copy of the locked mode (same id, no tools), with words naming the space.
  assert.equal(spaceCopy(code, 'devices', { ready: { devices: 'off', recon: true, workshop: true } }), heldIn('devices'));
  assert.equal(spaceCopy(code, 'workshop', { ready: { devices: true, recon: true, workshop: 'off' } }), heldIn('workshop'));
  assert.equal(spaceCopy(code, 'devices', { ready: { devices: true, recon: true, workshop: true } }).guardedBy, 'devices');
});

// ---- Finding: the copy memo ignored guard readiness -------------------------------------------------------------

test('copy memo: a guest follows its guard coming up and going away at once', async () => {
  const bench = {};
  const { app } = start({ sessionSpaces: JSON.stringify({ cg: 'devices' }), sessionModes: JSON.stringify({ cg: 'code' }) }, { bench });
  await app.open('cg', { source: 'resume', lastTurn: 1 });
  assert.equal(app.service().get('cg'), LOCKED_MODE.id, 'held while Bench cannot guard guests');
  bench.guestsGuarded = true;
  assert.equal(app.service().get('cg'), 'code', 'guarded copy once Bench is ready');
  assert.equal(app.service().guardOf('cg').guardedBy, 'devices');
  delete bench.guestsGuarded;
  assert.equal(app.service().get('cg'), LOCKED_MODE.id, 'held again when it is not');
  app.stop();
});

// ---- Finding: modeOf parsed the tables on every call -------------------------------------------------------------

test('readModes is memoised by its raw strings (frozen, the same object while they do not change)', () => {
  const config = Config({ extraModes: JSON.stringify({ x1: { label: 'X1', tools: ['read'] } }) });
  const one = readModes(config);
  assert.equal(readModes(config), one);
  assert.ok(Object.isFrozen(one));
  config.extraModes = JSON.stringify({ x2: { label: 'X2', tools: ['read'] } });
  const two = readModes(config);
  assert.notEqual(two, one);
  assert.ok(two.x2 && !two.x1);
});

// ---- Finding: a stale unwritten space beat a later move ----------------------------------------------------------

test('move: a space still waiting to be written does not win over a move into Devices, nor come back', async () => {
  let failing = true;
  const { app, world } = start({}, { failWrite: (ops) => failing && ops.some((op) => op.path?.[0] === 'sessionSpaces') });
  const x = await app.open('mx');
  await app.service().spaces.startDraft('mx', { space: 'chat' });
  await app.firstTurn(x.agent);
  await settle();
  assert.notEqual(json(world.config.sessionSpaces).mx, 'chat', 'the first write failed');
  failing = false;
  await app.service().spaces.move(['mx'], 'devices');
  assert.equal(json(world.config.sessionSpaces).mx, 'devices');
  assert.equal(app.service().guardOf('mx').space, 'devices', 'the move takes effect');
  assert.equal(app.service().guardOf('mx').guardedBy, 'devices');
  // Another thread's first message flushes the waiting pins: mx's stays Devices.
  const y = await app.open('my');
  await app.service().spaces.startDraft('my', { space: 'chat' });
  await app.firstTurn(y.agent);
  await settle();
  assert.equal(json(world.config.sessionSpaces).mx, 'devices', 'not written back to Chat');
  app.stop();
});

// ---- Finding: two claims racing on one draft -------------------------------------------------------------------

test('claims: a Devices claim racing a Chat claim on one draft ends guarded, never Chat in a Devices window', async () => {
  const { app } = start({}, { writeDelay: 30 });
  await app.open('rd', { header: { cwd: '/Users/me/src/app' } });
  const first = app.service().spaces.startDraft('rd', { space: 'chat' });
  const second = app.service().spaces.startDraft('rd', { space: 'devices' });
  const [, b] = await Promise.all([first, second]);
  const guard = app.service().guardOf('rd');
  // Either the Devices window got the draft (guarded), or it was told where the draft is (it opens a fresh one).
  assert.ok(guard.guardedBy === 'devices' || b.keptIn, JSON.stringify({ guard, b }));
  app.stop();
});

test('claims: a draft another add-on claimed is answered with keptIn for a guarded window', async () => {
  const { app } = start();
  await app.open('oc', { header: { cwd: '/Users/me/src/app' } });
  await app.service().set('oc', 'research', { claim: true });
  const answer = await app.service().spaces.startDraft('oc', { space: 'devices' });
  assert.equal(answer.claimed, false);
  assert.ok(answer.keptIn && answer.keptIn !== 'devices', JSON.stringify(answer));
  app.stop();
});

// ---- Finding: Settings → Modes showed false "not ready" lines ---------------------------------------------------

test('settings page: notReady is empty when every guard is ready, and names the one that is not', async () => {
  const ready = start();
  assert.deepEqual([...ready.app.service().spaces.page('en').rules.notReady], []);
  ready.app.stop();
  const old = start({}, { bench: {} });
  const rows = old.app.service().spaces.page('zh').rules.notReady;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].space, 'devices');
  assert.match(rows[0].text, /Needs a newer Devices/, 'English on a Chinese page');
  old.app.stop();
  const client = readFileSync(path.join(here, '..', 'client.js'), 'utf8');
  assert.match(client, /page\.rules\?\.notReady/, 'the client draws the server\'s list');
});

// ---- Finding: the Mode list never said what a mode loses --------------------------------------------------------

test('Mode list: in Devices a guest row says what it loses; in Recon that it is sealed', async () => {
  const { app } = start({ sessionSpaces: JSON.stringify({ ml: 'devices' }), sessionModes: JSON.stringify({ ml: 'code' }) });
  await app.open('ml', { source: 'resume', lastTurn: 1 });
  const code = app.service().spaces.view('ml').modes.find((row) => row.id === 'code');
  assert.match(code.loses, /^In Devices, Code loses: .*Terminal/);
  const bench = app.service().spaces.view('ml').modes.find((row) => row.id === 'bench');
  assert.equal(bench.loses, '', 'the home mode loses nothing');
  const zh = app.service().spaces.view('ml', 'zh').modes.find((row) => row.id === 'code');
  assert.match(zh.loses, /^In Devices, Code loses: /, 'English on a Chinese page');
  const recon = modeList('recon', [{ id: 'research', label: 'Research' }], TICKS, 'en', { ready: { devices: true, recon: true, workshop: true } });
  assert.match(recon.find((row) => row.id === 'research').loses, /In Recon, Research is sealed/);
  const client = readFileSync(path.join(here, '..', 'client.js'), 'utf8');
  assert.match(client, /data-mode-loses/);
  assert.match(client, /'mlist\.guarded'/);
  app.stop();
});

// ---- Finding: the held line named the add-on in English and said "new" for a thread that ran ----------------------

test('held line: the add-on by its name; "new" only for a thread that has not run; English on a Chinese page', () => {
  assert.equal(heldText('devices', 'off', { lang: 'zh' }), 'This new thread has no tools for now: the Devices add-on is off. Switch it on in Settings → Devices.');
  assert.equal(heldText('recon', 'off', { ran: true }), 'This thread has no tools for now: the Recon add-on is off. Switch it on in Settings → Recon.');
  assert.match(heldText('devices', 'old', { lang: 'en' }), /switch it off and on in Settings → Devices/);
  assert.equal(heldText('devices', 'old', { lang: 'zh' }), heldText('devices', 'old', { lang: 'en' }));
  assert.doesNotMatch(heldText('recon', 'off', { ran: true, lang: 'zh' }), /new thread/);
});

// ---- Finding: the tick warning listed raw ids -------------------------------------------------

test('tick warning: unsorted tools are one family, never raw ids; a long list ends "and more"', () => {
  const lost = lostIn({ id: 'mine', tools: ['bash', 'my_plugin_tool', 'another_unsorted_one'] }, 'devices');
  assert.ok(lost.includes(UNSORTED_FAMILY));
  assert.ok(!lost.includes('my_plugin_tool'));
  const en = tickLines({ id: 'mine', label: 'Mine' }, 'devices', { lost: () => lost, lang: 'en' }).warn;
  assert.match(en, /new tools not yet sorted in Tool access/);
  assert.doesNotMatch(en, /my_plugin_tool/);
  const many = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', UNSORTED_FAMILY];
  const zh = tickLines({ id: 'mine', label: 'Mine' }, 'devices', { lost: () => many, lang: 'zh' }).warn;
  assert.match(zh, /H, and more\. /);
});

// ---- Finding: SPACE_WAIT was only logged ------------------------------------------------------------------------

test('SPACE_WAIT: a first message that went on before its space was known says so in the chat box', async () => {
  const { app } = start({}, { writeDelay: 2300 });
  const d = await app.open('sw', { header: { cwd: '/Users/me/src/app' } });
  const claim = app.service().spaces.startDraft('sw', { space: 'devices' });
  await app.waterfall('agent/pre-step', { agent: d.agent, messages: [], step: 1 }, async () => ({ kind: 'enter' }));
  assert.equal(app.service().spaces.view('sw').spaceWait, spaceText('spaceWait', 'en'));
  assert.equal(app.service().spaces.view('sw', 'zh').spaceWait, spaceText('spaceWait', 'en'), 'English on a Chinese page');
  await claim;
  const client = readFileSync(path.join(here, '..', 'client.js'), 'utf8');
  assert.match(client, /data-space-wait/);
  app.stop();
});

// ---- Finding: Workshop had two names ---------------------------------------------------------------------

test('Workshop has one name in Modes, on a Chinese page too', () => {
  assert.match(spaceText('gridInGuarded', 'zh'), /Devices and Workshop/);
});

// ---- Finding: the tick warning used the English mode name and repeated the row's line ------------------------------

test('tick: no second warning above the list; refusals name the mode', async () => {
  const { app } = start({ modeSpaces: JSON.stringify({ ...TICKS, code: ['code', 'workshop'] }) });
  const page = await app.service().spaces.setTick('code', 'devices', true, { lang: 'zh' });
  assert.equal(page.warning, undefined, 'the row shows its own line');
  const row = page.modes.find((mode) => mode.id === 'code').ticks.find((tick) => tick.space === 'devices');
  assert.match(row.warn, /^In Devices, Code loses/, 'English on a Chinese page');
  const old = start({ modeSpaces: JSON.stringify({ ...TICKS, code: ['code', 'workshop'] }) }, { bench: {} });
  await assert.rejects(old.app.service().spaces.setTick('code', 'devices', true, { lang: 'zh' }), /^Error: Code cannot be ticked for Devices now/);
  old.app.stop();
  app.stop();
});

void maskNow;
