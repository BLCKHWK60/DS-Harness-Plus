/**
 * Item 4A, stage 6a: the lab re-check's problems (23 November 2026, result.check 2-10 and the fixer's open item 25),
 * each fixed and checked here: the room path rule reads only real path arguments, tools_find leaves out what the space
 * closes, the tools offered in Workshop are what Creator Plus lets run, a reused draft keeps no mode from elsewhere,
 * Settings → Spaces names a gone start mode, the lost list and the Chinese tick reason read right.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, makeWorld, maskNow, settle } from './app.mjs';
import { ROOM_TOOL_ARGS, lostIn, lostKey, roomPathRefusal, spaceRefuser, workshopAllows } from '../lib/spacerules.js';
import { closedHere, catalog } from '../lib/trim.js';
import { spaceCards, tickLines } from '../lib/spaces.js';
import { MODE as RESEARCH } from '../../dsh-research/lib/mode.js';
import { PARAMETERS as DIAGRAM_PARAMETERS } from '../../dsh-diagram/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOM = realpathSync(mkdtempSync(path.join(tmpdir(), 'dsh-recheck6a-room-')));
const RUN = path.join(ROOM, 'run-session-x');
mkdirSync(RUN, { recursive: true });
/** Creator Plus's allow-list as its service gives it (dsh-creator-plus lib/rules.js ALLOWED). */
const CREATOR_ALLOWED = Object.freeze(['ask_user_question', 'cordis_inspect_list', 'cordis_inspect_query', 'diagram_draw', 'edit', 'glob', 'grep', 'mission_step', 'multi_edit',
  'pdf_info', 'pdf_read', 'pdf_search', 'read', 'read_image', 'remember', 'skill', 'todo_write', 'tools_find', 'web_fetch', 'web_search', 'write']);
const KNOWN = ['read', 'write', 'edit', 'glob', 'grep', 'bash', 'run_code', 'web_search', 'web_fetch', 'deep_research', 'subagent', 'remember', 'todo_write', 'ask_user_question',
  'diagram_draw', 'present', 'load_workspace_dependencies', 'office_convert', 'office_render', 'mac_find_files', 'mac_shortcuts', 'bench_usb', 'tools_find', 'skill',
  'library_search', 'library_read', 'pdf_read', 'data_query', 'tools_catalog', 'request_tool_access'];
const EXTRA = {
  research: RESEARCH,
  bench: { label: 'Devices', tools: ['read', 'bench_usb'], sandbox: 'read-only' },
  'creator-plus': { label: 'Creator Plus', tools: 'all' },
};
const TICKS = { research: ['chat', 'code', 'devices', 'workshop'], plain: ['chat', 'code'], code: ['code', 'devices', 'workshop'] };

function start(fields = {}, { bench = { guestsGuarded: true }, creatorPlus = { guestsGuarded: true, allowed: () => CREATOR_ALLOWED }, extra = EXTRA, world: given, ...options } = {}) {
  const world = given ?? makeWorld({ pruneStaleSessions: false, extraModes: JSON.stringify(extra), modeSpaces: JSON.stringify(TICKS), ...fields });
  const services = { recon: null, bench: bench || null, creatorPlus: creatorPlus || null, ...(options.services ?? {}) };
  const app = boot(world, { tabs: true, known: KNOWN, ...options, services });
  return { app, world };
}
const allowOf = (one) => maskNow(one.masks)?.allow ?? null;
const json = (value) => (typeof value === 'string' ? JSON.parse(value || '{}') : value ?? {});

// ---- problem 2: the room path rule reads only real path arguments ------------------------------------------------

test('recheck 2: diagram_draw in Recon is never refused for its node ids, labels or formulas; real paths still are', () => {
  const want = (name, args) => roomPathRefusal({ name, args, cwd: ROOM, room: RUN });
  assert.equal(want('diagram_draw', { kind: 'flow', nodes: [{ id: 'a', label: 'In/out' }, { id: 'b' }], edges: [{ from: 'a', to: 'b', label: 'yes/no' }] }), '', 'flow: from/to are node ids');
  assert.equal(want('diagram_draw', { kind: 'sequence', actors: [{ id: 'app' }, { id: 'api' }], steps: [{ from: 'app', to: 'api', label: 'GET /etc/passwd' }, { note: 'see ~/x', over: ['app'] }] }), '', 'sequence: steps and notes');
  assert.equal(want('diagram_draw', { kind: 'chart', chart: 'plot', functions: [{ formula: 'x/2 + 1' }], xLabel: 'km/h', title: 'a/b' }), '', 'formulas and labels with "/"');
  assert.equal(want('diagram_draw', { kind: 'tree', root: { label: '/', children: [{ label: '/usr' }] }, name: '../../escape' }), '', 'name is made safe by dsh-diagram');
  // Every key of diagram_draw's real schema is known as "not a place".
  const spec = ROOM_TOOL_ARGS.diagram_draw;
  for (const key of Object.keys(DIAGRAM_PARAMETERS.properties)) assert.ok(spec.ignore.includes(key), `diagram_draw.${key} is no place`);
  assert.deepEqual(spec.path, []);
  // A key the schema does not have is read the general way (fail closed).
  assert.match(want('diagram_draw', { kind: 'flow', file: '/etc/hosts' }), /room folder/);
  // Other tools: only their real path arguments.
  assert.equal(want('pdf_read', { path: path.join(RUN, 'a.pdf'), from: '3', to: '5' }), '', 'a page range is no place');
  assert.equal(want('pdf_search', { path: path.join(RUN, 'a.pdf'), query: 'TCP/IP' }), '');
  assert.match(want('pdf_read', { path: '/etc/a.pdf' }), /room folder/);
  assert.equal(want('data_chart', { files: [path.join(RUN, 'a.csv')], sql: 'select a/b from t', y: ['km/h'], title: 'speed/time' }), '');
  assert.match(want('data_query', { files: [path.join(RUN, 'a.csv')], sql: "select * from '/etc/x.csv'" }), /room folder/, 'a query naming a file outside');
  assert.match(want('data_query', { files: ['/etc/x.csv'], sql: 'select 1' }), /room folder/);
  assert.equal(want('data_query', { files: [path.join(RUN, 'a.csv')], sql: 'select a/b, c / d from t' }), '', 'a query\'s division is no place');
  assert.match(want('data_query', { files: [path.join(RUN, 'a.csv')], sql: "select * from 'other-run/x.csv'" }), /room folder/, 'a quoted relative file outside the thread\'s folder');
  assert.match(want('data_query', { sql: 'select * from read_csv("~/x.csv")' }), /room folder/);
  assert.match(want('data_query', { sql: 'select * from ../x.csv' }), /room folder/, 'climbing');
  assert.match(want('data_profile', { files: [path.join(RUN, 'a.csv'), { bad: 1 }] }), /room folder/, 'a list item that is not text: refused');
  assert.equal(want('read', { file_path: path.join(RUN, 'a.txt'), offset: 1 }), '');
  assert.match(want('read', { file_path: '~/.ssh/known_hosts' }), /room folder/);
  assert.match(want('write', { file_path: path.join(ROOM, 'shared.txt'), content: 'x' }), /room folder/, 'the room root is not the thread\'s folder');
  assert.equal(want('write', { file_path: path.join(RUN, 'r.md'), content: 'see /etc/passwd' }), '');
  assert.equal(want('grep', { pattern: '/login', path: RUN, include: '*.md' }), '');
  assert.match(want('grep', { pattern: 'x', path: RUN, include: '/etc/*.conf' }), /room folder/, 'an absolute include names a place');
  assert.match(want('working_directory', { cd: '~' }), /room folder/);
  assert.match(want('code_map_related', { target: '/etc/hosts', depth: 2 }), /room folder/);
  assert.match(want('data_save_analysis', { name: 'a/b', queries: ['q1'] }), /room folder/, 'a change tool naming no place: refused as before');
  // A tool the rule has no schema for is read the general way: `to` may be a destination there.
  assert.match(want('move', { from: path.join(RUN, 'a'), to: '/tmp/out' }), /room folder/);
  assert.match(want('office_convert', { input: path.join(RUN, 'a.docx'), output: '~/Desktop/a.pdf' }), /room folder/);
});

test('recheck 2: each listed tool names only keys its real schema has', () => {
  // The app's own tools and the add-ons' tools as the lab's request dumps show them (23 November 2026).
  const schemas = {
    read: ['file_path', 'offset', 'limit'], read_image: ['file_path'], write: ['file_path', 'content', 'sandbox_permissions', 'justification'],
    edit: ['file_path', 'old_string', 'new_string', 'replace_all', 'sandbox_permissions', 'justification'], glob: ['pattern', 'path'], grep: ['pattern', 'path', 'include'],
    working_directory: ['cd'], pdf_info: ['path'], pdf_ocr: ['path', 'page'], pdf_page_image: ['path', 'page', 'scale'], pdf_read: ['path', 'from', 'to', 'layout'],
    pdf_search: ['path', 'query', 'limit'], data_files: ['folder'], data_profile: ['files'], data_query: ['files', 'sql', 'limit'],
    data_chart: ['files', 'sql', 'title', 'chart', 'x', 'y', 'xLabel', 'yLabel'], data_text: ['file', 'from'], data_analyses: [], data_save_analysis: ['name', 'queries', 'labels'],
    data_rerun_analysis: ['name'], code_map_file: ['path'], code_map_find: ['query', 'kind', 'path', 'limit'], code_map_overview: ['path', 'budget'],
    code_map_read: ['path', 'symbol', 'line', 'context'], code_map_related: ['target', 'depth'],
  };
  for (const [tool, keys] of Object.entries(schemas)) {
    const spec = ROOM_TOOL_ARGS[tool];
    assert.ok(spec, tool);
    const named = [...spec.path, ...spec.ignore, ...spec.pattern, ...spec.text];
    for (const key of keys) assert.ok(named.includes(key), `${tool}.${key} is sorted`);
    for (const key of [...spec.path, ...spec.pattern, ...spec.text]) assert.ok(keys.includes(key), `${tool}.${key} is a real argument`);
  }
});

// ---- problem 3: tools_find leaves out what the space closes --------------------------------------------------------

test('recheck 3: a family the space closes is left out of the list and answered "refused here", never "already added"', async () => {
  const refused = (name) => name.startsWith('office_') || name === 'load_workspace_dependencies';
  assert.equal(closedHere('office', KNOWN, refused), true, 'present (shared with visual) does not keep Office open');
  assert.equal(closedHere('visual', KNOWN, refused), false);
  assert.equal(closedHere('mac', KNOWN, (name) => name === 'mac_shortcuts'), false, 'mac_find_files stays');
  assert.doesNotMatch(catalog(KNOWN, ['office'], ['office']), /- office/);
  const { app } = start({ sessionSpaces: JSON.stringify({ cd: 'devices' }), sessionModes: JSON.stringify({ cd: 'code' }), sessionToolSets: JSON.stringify({ cd: ['office'] }) });
  const cd = await app.open('cd', { source: 'resume', lastTurn: 1 });
  const find = app.tool('tools_find').definition;
  const list = (await find.execute({}, { agent: cd.agent })).text;
  assert.doesNotMatch(list, /- office/, list);
  assert.match(list, /- visual/);
  const asked = (await find.execute({ need: 'office' }, { agent: cd.agent })).text;
  assert.match(asked, /^office is refused here: Devices closes it for every mode\./, asked);
  assert.doesNotMatch(asked, /already added|can be called now|\(added\)/);
  app.stop();
});

// ---- problem 5: what Workshop offers a guest is what Creator Plus lets run ---------------------------------------

test('recheck 5: Research in Workshop is not offered Deep research; the list and the guard agree in every guarded space', async () => {
  assert.equal(workshopAllows('deep_research', CREATOR_ALLOWED), false);
  assert.equal(workshopAllows('creator_map', ['creator_']), true, 'prefixes');
  assert.equal(workshopAllows('anything', undefined), true, 'no list: the guest rule alone');
  const workshop = spaceRefuser({ guardedBy: 'workshop' }, CREATOR_ALLOWED);
  for (const name of ['deep_research', 'subagent', 'bench_usb', 'library_read', 'data_query', 'tools_catalog', 'bash', 'office_convert']) assert.equal(workshop(name), true, name);
  for (const name of ['read', 'write', 'web_search', 'diagram_draw', 'tools_find', 'pdf_read']) assert.equal(workshop(name), false, name);
  assert.equal(spaceRefuser({ guardedBy: 'unknown' }, CREATOR_ALLOWED)('deep_research'), true, 'the unknown guard: Creator Plus guards it too');
  assert.equal(spaceRefuser({ guardedBy: 'devices' }, CREATOR_ALLOWED)('deep_research'), false, 'Devices keeps a guest\'s helpers (Bench asks the guest rule)');
  assert.equal(spaceRefuser({}, CREATOR_ALLOWED)('bash'), false, 'not a guest');
  const { app } = start({ sessionSpaces: JSON.stringify({ rw: 'workshop', rd: 'devices', rc: 'chat' }), sessionModes: JSON.stringify({ rw: 'research', rd: 'research', rc: 'research' }) });
  const rw = await app.open('rw', { source: 'resume', lastTurn: 1 });
  const rd = await app.open('rd', { source: 'resume', lastTurn: 1 });
  const rc = await app.open('rc', { source: 'resume', lastTurn: 1 });
  const offered = allowOf(rw);
  assert.ok(Array.isArray(offered));
  assert.ok(!offered.includes('deep_research'), `Workshop: ${offered}`);
  assert.ok(!offered.includes('library_read') && !offered.includes('library_search'), 'nor the Library, which Creator Plus refuses');
  assert.ok(offered.includes('web_search') && offered.includes('diagram_draw'));
  for (const name of offered) assert.ok(workshopAllows(name, CREATOR_ALLOWED), `${name} is let through by Creator Plus`);
  assert.ok(allowOf(rd).includes('deep_research'), 'Devices: Research keeps Deep research');
  assert.ok(allowOf(rc).includes('deep_research'), 'Chat: as before');
  // The Mode list says the same: Research loses Deep research in Workshop.
  assert.ok(lostIn({ id: 'research', tools: RESEARCH.tools }, 'workshop', { workshopAllowed: CREATOR_ALLOWED }).includes(lostKey('deep')));
  app.stop();
});

// ---- problem 6 (and open item 25): a reused draft keeps no mode from elsewhere ------------------------------------

test('recheck 6: a draft claimed in Chat, then held in Workshop while Creator Plus is off, follows Creator Plus once it is back', async () => {
  const { 'creator-plus': _cp, ...noCreator } = EXTRA;
  void _cp;
  const world = makeWorld({ pruneStaleSessions: false, extraModes: JSON.stringify(noCreator), modeSpaces: JSON.stringify(TICKS) });
  const off = start({}, { world, extra: noCreator, creatorPlus: null, services: { tuning: { isOn: () => true } } });
  const w1 = await off.app.open('w1', { header: { cwd: '/Users/me/src/app' } });
  assert.equal((await off.app.service().spaces.startDraft('w1', { space: 'chat' })).mode, 'plain');
  assert.deepEqual(await off.app.service().spaces.startDraft('w1', { space: 'workshop' }), { claimed: false });
  await settle();
  assert.equal(json(world.config.sessionModes).w1, undefined, 'Plain chat from Chat is not kept');
  assert.equal(off.app.service().get('w1'), 'isolated-locked', 'held, no tools');
  await off.app.firstTurn(w1.agent);
  await settle();
  assert.equal(json(world.config.sessionModes).w1, 'isolated-locked', 'recorded as held, not as Plain chat');
  assert.equal(json(world.config.sessionSpaces).w1, 'workshop');
  off.app.stop();
  world.config.extraModes = JSON.stringify(EXTRA);
  const on = start({}, { world });
  await on.app.open('w1', { source: 'resume', lastTurn: 1, header: { cwd: '/Users/me/src/app' } });
  assert.equal(on.app.service().get('w1'), 'creator-plus', 'the space\'s home mode once Creator Plus is back');
  on.app.stop();
});

test('recheck 6: a mode offered in the space stays as it was picked (the owner\'s pick is never changed)', async () => {
  const world = makeWorld({ pruneStaleSessions: false, extraModes: JSON.stringify(EXTRA), modeSpaces: JSON.stringify(TICKS) });
  const { app } = start({}, { world });
  await app.open('w2', { header: { cwd: '/Users/me/src/app' } });
  assert.equal((await app.service().spaces.startDraft('w2', { space: 'workshop' })).mode, 'creator-plus');
  await app.service().spaces.pick('w2', 'research');
  await settle();
  assert.equal(json(world.config.sessionModes).w2, 'research');
  assert.equal(app.service().get('w2'), 'research');
  app.stop();
  // A thread that has run keeps the mode it has, also one its space does not tick (moved or unticked later).
  const ran = start({ sessionSpaces: JSON.stringify({ old: 'workshop' }), sessionModes: JSON.stringify({ old: 'plain' }) });
  await ran.app.open('old', { source: 'resume', lastTurn: 2 });
  assert.equal(ran.app.service().get('old'), 'plain');
  ran.app.stop();
});

test('recheck 25: the chat box claims a reused draft again for the window\'s space at once (source)', () => {
  const source = readFileSync(path.join(here, '..', 'client.js'), 'utf8');
  assert.match(source, /const elsewhere = Boolean\(windowSpace\) && typeof value\?\.space === 'string' && value\.space !== '' && value\.space !== windowSpace;/);
  assert.match(source, /\(!value\.claimed \|\| elsewhere\) && !started\.current\.has\(startKey\)/);
});

test('recheck 25: a draft claimed in Chat is claimed again in Devices with the Devices mode', async () => {
  const { app } = start();
  await app.open('d1', { header: { cwd: '/Users/me/src/app' } });
  assert.equal((await app.service().spaces.startDraft('d1', { space: 'chat' })).mode, 'plain');
  const again = await app.service().spaces.startDraft('d1', { space: 'devices' });
  assert.equal(again.mode, 'bench');
  assert.equal(app.service().get('d1'), 'bench');
  assert.equal(app.service().spaces.view('d1').space, 'devices');
  app.stop();
});

// ---- problem 7: Settings → Spaces with Creator Plus off ---------------------------------------------------------

test('recheck 7: Settings → Spaces names the gone start mode and says to switch Creator Plus on', () => {
  const spaces = [{ id: 'workshop', available: true, shown: true }];
  const modes = [{ id: 'plain', label: 'Plain chat' }];
  const card = (lang) => spaceCards({ spaces, modes, modeSpaces: {}, lang, ready: { devices: true, recon: true, workshop: 'plugin' } }).find((one) => one.id === 'workshop');
  const en = card('en');
  assert.equal(en.startMode, '');
  assert.equal(en.startModeGone, 'creator-plus');
  assert.equal(en.startModeGoneLabel, 'Creator Plus', 'never the raw id');
  assert.equal(en.startModeGoneReason, 'Needs Creator Plus: switch it on on the Plugins page.');
  assert.equal(card('zh').startModeGoneReason, en.startModeGoneReason, 'English on a Chinese page');
  const running = spaceCards({ spaces, modes, modeSpaces: {}, ready: { workshop: 'off' } }).find((one) => one.id === 'workshop');
  assert.match(running.startModeGoneReason, /Creator Plus/, 'running but its mode not offered: where to switch it on');
  const source = readFileSync(path.join(here, '..', 'client.js'), 'utf8');
  assert.match(source, /'sp\.start\.goneNone': '\{mode\} is not offered in \{space\} now, and no other mode is/);
  assert.match(source, /const goneText = one\.startModeGoneReason \? one\.startModeGoneReason/);
});

// ---- problem 9: the lost list says what really goes ---------------------------------------------------------------

test('recheck 9: Code in Devices keeps the skill tool, and the lost list says so', () => {
  const lost = lostIn({ id: 'code', tools: 'all' }, 'devices', { known: ['skill', 'skills', 'tuning_plan', 'read'] });
  assert.ok(lost.includes(lostKey('tuning')));
  const en = tickLines({ id: 'code', label: 'Code' }, 'devices', { lost: () => [lostKey('tuning')], lang: 'en' }).warn;
  assert.match(en, /writing skills and Tuner Plus \(using skills stays\)/);
  assert.doesNotMatch(en, /skills and tuning/);
  const zh = tickLines({ id: 'code', label: 'Code' }, 'devices', { lost: () => [lostKey('tuning')], lang: 'zh' }).warn;
  assert.equal(zh, en, 'English on a Chinese page');
});

// ---- problem 10: the Chinese tick reason ------------------------------------------------------------------------

test('recheck 10: the tick reason is English on a Chinese page, joined with a full stop and a space', async () => {
  const { app } = start();
  const tick = app.service().spaces.page('zh').modes.find((mode) => mode.id === 'bench').ticks.find((one) => one.space === 'chat');
  assert.equal(tick.reason, "Devices stays in its own space, Devices: it carries that space's safety rules.");
  app.stop();
  const source = readFileSync(path.join(here, '..', 'client.js'), 'utf8');
  assert.match(source, /\$\{tick\.greyed && tick\.reason \? `\. \$\{tick\.reason\}` : ''\}/);
});

// ---- lab re-check 2, problem 5: Chinese spacing on Settings → Modes -----------------------------------------------

test('recheck2 5: tick lines are English on every page; a name keeps its space', () => {
  const lost = () => [lostKey('terminal')];
  assert.equal(tickLines({ id: 'code', label: 'Code' }, 'devices', { lost, lang: 'zh' }).warn, 'In Devices, Code loses: the Terminal. The rules of Devices refuse them.');
  assert.match(tickLines({ id: 'plain', label: 'Plain chat' }, 'recon', { lang: 'zh' }).note, /^In Recon, Plain chat is sealed: /);
  assert.match(tickLines({ id: 'x', label: 'Creator Plus' }, 'devices', { lost }).warn, /Creator Plus loses/);
  assert.match(tickLines({ id: 'code', label: 'Code' }, 'devices', { lost }).warn, /^In Devices, Code loses: /, 'English as before');
  const source = readFileSync(path.join(here, '..', 'client.js'), 'utf8');
  assert.match(source, /\$\{names\.get\(row\.space\) \?\? row\.space\}: \$\{row\.reason\}/, 'the not-ready header joins with a colon');
});
