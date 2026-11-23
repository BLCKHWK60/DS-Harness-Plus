/**
 * Item 4A, stage 6a: the space keeps its safety rules for any mode (STAGE6A-DESIGN.md 4.1, the pure half):
 * lib/spacerules.js and the stage 6a parts of lib/spaces.js, lib/isolation.js, lib/online.js, lib/presetlock.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  GUARDED_SPACES, NO_PROGRAM_SPACES, SEALED_KEEP, SEALED_PATH_TOOLS, SHARED_STORES, guardedCopy, guestRefuses, heldIn, isSharedStore,
  lostIn, modeKey, reconRefusal, refusesProgramsIn, restartPresetIn, roomPathRefusal, sealedCopy, sealedTools, spaceCopy, withoutGuestRefused,
  GUEST_REFUSED, UNKNOWN_EXTRA, spaceRefuser,
} from '../lib/spacerules.js';
import { canGoOnline, reconMayAsk } from '../lib/online.js';
import { LATE_MODE, LOCKED_MODE, modeChangeRefusal } from '../lib/isolation.js';
import { WRITE_TOOLS } from '../lib/catalog.js';
import { lockInSpace } from '../lib/presetlock.js';
import { SPACE_SETTINGS_TEXT, fillSpaces, modePickRefusal, modeRowsForPage, nextModeSpaces, spaceMovePlan, ticksOfMode } from '../lib/spaces.js';
import { movedSince } from '../lib/sandbox.js';
import { lockedMode } from '../lib/access.js';
import { MODE_TOOLS as RECON_TOOLS, MODE as RECON } from '../../dsh-recon/lib/mode.js';
import { MODE as RESEARCH_DEF } from '../../dsh-research/lib/mode.js';

const research = Object.freeze({ id: 'research', ...RESEARCH_DEF });
const recon = Object.freeze({ id: 'recon', ...RECON });
const plain = Object.freeze({ id: 'plain', label: 'Plain chat', tools: 'all', sandbox: 'inherit', prompt: '' });
const code = Object.freeze({ id: 'code', label: 'Code', tools: 'all', sandbox: 'workspace-write', prompt: '' });
const bench = Object.freeze({ id: 'bench', label: 'Devices', tools: ['read', 'bench_usb', 'bench_serial_read'] });
const creator = Object.freeze({ id: 'creator-plus', label: 'Creator Plus', tools: 'all' });
const dataList = Object.freeze({ id: 'data', label: 'Data', tools: ['data_query', 'data_python', 'read', 'data_files'] });
const READY = Object.freeze({ devices: true, recon: true, workshop: true });

test('sealed-tools-exact: Research in Recon keeps diagram, questions and steps, plus Recon\'s tools (never recon_ultra, never its own web)', () => {
  const sealed = sealedTools(research, RECON_TOOLS, { roomKnown: true });
  const net = RECON_TOOLS.filter((name) => name !== 'recon_ultra');
  assert.equal(net.length, 15);
  assert.deepEqual([...sealed].sort(), [...new Set(['diagram_draw', 'ask_user_question', 'todo_write', ...net])].sort());
  for (const name of ['web_search', 'web_fetch', 'deep_research', 'library_search', 'library_read', 'recon_ultra']) assert.ok(!sealed.includes(name), name);
  assert.ok(sealedTools(research, RECON_TOOLS, { roomKnown: true, extra: ['library_read'] }).includes('library_read'), 'the owner\'s sealedExtra');
  assert.ok(!sealedTools(research, RECON_TOOLS, { roomKnown: true, extra: ['web_search'] }).includes('web_search'), 'only the Library can be added');
});

test('sealed-plain-all: a mode with all tools keeps SEALED_KEEP (file tools only with a known room) plus the net', () => {
  const inRoom = sealedTools(plain, RECON_TOOLS, { roomKnown: true });
  const out = sealedTools(plain, RECON_TOOLS, { roomKnown: false });
  for (const name of SEALED_PATH_TOOLS) {
    assert.ok(inRoom.includes(name) || !SEALED_KEEP.includes(name), `${name} in the room`);
    assert.ok(!out.includes(name), `${name} not without a room`);
  }
  for (const list of [inRoom, out]) {
    assert.ok(!list.includes('working_directory'));
    for (const name of list) {
      if (!name.startsWith('recon_')) assert.equal(guestRefuses(name), false, name);
      assert.equal(isSharedStore(name), false, name);
      assert.equal(WRITE_TOOLS.has(name), false, name);
      if (!name.startsWith('recon_')) assert.equal(canGoOnline(name), false, name);
    }
  }
});

test('sealed-no-recon and sealed-none', () => {
  assert.ok(sealedTools(research, [], { roomKnown: true }).every((name) => !name.startsWith('recon_')));
  assert.deepEqual(sealedTools({ id: 'chat', tools: 'none' }, RECON_TOOLS), []);
  // A mode that never went online stays offline in Recon.
  assert.deepEqual(sealedTools({ id: 'notes', tools: ['todo_write', 'read'] }, RECON_TOOLS, { roomKnown: true }).sort(), ['read', 'todo_write']);
});

test('room-path-rule: only paths inside the thread\'s room folder', () => {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'dsh-room-')));
  const room = path.join(base, 'run-x');
  mkdirSync(room);
  writeFileSync(path.join(room, 'a.txt'), 'x');
  const outside = mkdtempSync(path.join(tmpdir(), 'dsh-out-'));
  symlinkSync(outside, path.join(room, 'door'));
  const refused = (name, args, cwd = room) => roomPathRefusal({ name, args, cwd, room });
  assert.match(refused('read', { file_path: '~/.ssh/id_rsa' }), /only in this thread's room folder, .*run-x, so read was not run\. Call it again with a full path inside that folder/);
  assert.equal(refused('read', { file_path: path.join(room, 'a.txt') }), '');
  assert.equal(refused('read', { file_path: 'a.txt' }), '', 'relative to a folder inside the room');
  assert.notEqual(refused('read', { file_path: '../../etc/passwd' }), '', '.. escape');
  assert.notEqual(refused('read', { file_path: path.join(room, 'door', 'x.txt') }), '', 'a link out of the room');
  assert.notEqual(refused('write', { file_path: '/tmp/x.txt', content: 'y' }), '');
  assert.equal(refused('write', { file_path: path.join(room, 'new.txt'), content: 'y' }), '');
  assert.notEqual(refused('move', { what: 1, how: true }), '', 'a change tool with no readable path');
  assert.notEqual(roomPathRefusal({ name: 'read', args: { file_path: path.join(room, 'a.txt') }, cwd: room, room: '' }), '', 'room unknown: refused');
  assert.notEqual(refused('data_query', { query: "select * from '/etc/x.csv'" }), '', 'a path inside text, at any key');
  assert.equal(refused('recon_web_search', { query: 'a/b' }), '', 'not a file tool');
  assert.equal(refused('diagram_draw', { spec: 'flow' }), '', 'a drawing with no save path');
  assert.notEqual(refused('diagram_draw', { save: '/Users/me/x.svg' }), '');
  assert.notEqual(refused('glob', { pattern: '*.md' }, '/Users/me'), '', 'no path: the thread\'s folder must be inside the room');
  assert.notEqual(refused('office_convert', { input: path.join(room, 'a.txt'), output: '/Users/me/a.docx' }), '');
});

test('lab fix: a recursive glob or grep with a path inside the room runs; a pattern that leaves the room does not', () => {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'dsh-room-')));
  const room = path.join(base, 'run-y');
  mkdirSync(path.join(room, 'notes'), { recursive: true });
  // The thread's folder is Recon's shared room (the run folder's parent), as in the lab.
  const refused = (name, args) => roomPathRefusal({ name, args, cwd: base, room });
  assert.equal(refused('glob', { pattern: '**/*', path: room }), '', 'recursive pattern, path = the run folder');
  assert.equal(refused('glob', { pattern: 'notes/**/*.txt', path: room }), '', 'pattern with a folder in it');
  assert.equal(refused('grep', { pattern: '/login', path: room, glob: '**/*.md' }), '', 'grep: its regex is no place; its glob stays under path');
  assert.notEqual(refused('glob', { pattern: '**/*' }), '', 'no path: Recon\'s shared room, refused');
  assert.notEqual(refused('glob', { pattern: '../**/*', path: room }), '', 'a pattern that climbs out');
  assert.notEqual(refused('glob', { pattern: '/etc/*', path: room }), '', 'an absolute pattern outside');
  assert.notEqual(refused('glob', { pattern: '~/.ssh/*', path: room }), '', 'a home pattern');
  assert.notEqual(refused('grep', { pattern: 'x', path: room, include: '../../*' }), '', 'grep include that climbs out');
  assert.match(refused('glob', { pattern: '*' }), new RegExp(`room folder, ${room.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}, so glob was not run`), 'the sentence names the folder');
});

test('lab fix: Recon refusals say why and what to use (SHARED_REFUSED, PROFILE_REFUSED, DEEP_REFUSED, web)', () => {
  assert.match(reconRefusal('remember'), /^Nothing was remembered: this thread is in Recon/);
  assert.match(reconRefusal('finance_profile_save'), /^The finance profile was not changed/);
  assert.match(reconRefusal('data_save_analysis'), /^Nothing was saved: .*so data_save_analysis was not run/);
  assert.match(reconRefusal('deep_research'), /^Deep research does not run in Recon/);
  assert.match(reconRefusal('web_search'), /only through Recon's routes, so web_search was not run\. Use recon_web_search and recon_web_read/);
  assert.match(reconRefusal('bash'), /^bash is not one of this Recon thread's tools/);
  assert.equal(reconRefusal('remember', 'zh'), reconRefusal('remember'), 'English on a Chinese page');
  for (const text of [reconRefusal('read'), reconRefusal('web_fetch')]) assert.doesNotMatch(text, /conversation/, 'thread, not conversation');
});

test('guest-refuses-by-group: Devices and Workshop refuse by catalog group, unsorted included', () => {
  for (const name of ['bash', 'run_code', 'job_list', 'engine', 'workflow', 'plugin_manager', 'mcp__desktop__start_process', 'mac_shortcuts', 'mac_mail_send', 'office_convert', 'creator_scaffold', 'schedule_create', 'zzz_tool', 'terminal_open', 'data_python']) assert.equal(guestRefuses(name), true, name);
  for (const name of ['bench_usb', 'read', 'write', 'web_search', 'subagent', 'deep_research', 'mac_find_files', 'data_query', 'todo_write', 'tools_catalog', 'mission_step']) assert.equal(guestRefuses(name), false, name);
  assert.deepEqual(GUARDED_SPACES, ['devices', 'recon', 'workshop']);
  assert.equal(NO_PROGRAM_SPACES, GUARDED_SPACES, 'one constant for the words and the guards');
});

test('owner-isolated-in-recon: an owner\'s isolated mode is sealed in Recon (intersected), unchanged in Chat', () => {
  const mine = Object.freeze({ id: 'osint', label: 'OSINT', tools: ['web_search', 'remember', 'finance_quote', 'todo_write'], isolated: true });
  const copy = spaceCopy(mine, 'recon', { ready: READY, reconNet: RECON_TOOLS });
  assert.equal(copy.sealedBy, 'recon');
  for (const name of ['web_search', 'remember', 'finance_quote']) assert.ok(!copy.tools.includes(name), name);
  assert.ok(copy.tools.includes('todo_write'));
  assert.equal(spaceCopy(mine, 'chat', { ready: READY }), mine);
});

test('copy-keeps-id: sealed and guarded copies keep the id; home and fallback modes are returned as they are', () => {
  const copy = spaceCopy(research, 'recon', { ready: READY, reconNet: RECON_TOOLS, roomKnown: true });
  assert.equal(copy.id, 'research');
  assert.equal(copy.sealedBy, 'recon');
  assert.equal(copy.sandbox, 'read-only');
  assert.equal(copy.isolated, true);
  assert.equal(copy.noPrograms, true);
  assert.deepEqual(copy.startFamilies, []);
  assert.ok(Object.isFrozen(copy));
  for (const mode of [recon, LOCKED_MODE, LATE_MODE]) assert.equal(spaceCopy(mode, 'recon', { ready: READY }), mode);
  assert.equal(spaceCopy(bench, 'devices', { ready: READY }), bench);
  assert.equal(spaceCopy(creator, 'workshop', { ready: READY }), creator);
  assert.equal(spaceCopy(research, 'chat', { ready: READY }), research);
  assert.notEqual(modeKey(copy), modeKey(research), 'reconcile sees the change (I20)');
});

test('guarded-copy: Devices and Workshop guests', () => {
  const codeIn = guardedCopy(code, 'devices', { deviceTools: bench.tools });
  assert.equal(codeIn.tools, 'all');
  assert.equal(codeIn.noPrograms, true);
  assert.equal(codeIn.guardedBy, 'devices');
  const dataIn = guardedCopy(dataList, 'devices', { deviceTools: bench.tools });
  assert.ok(!dataIn.tools.includes('data_python'));
  assert.ok(dataIn.tools.includes('bench_usb') && dataIn.tools.includes('data_query'));
  assert.ok(!dataIn.tools.includes('read') || dataList.tools.includes('read'), 'its own read stays; Bench\'s read is not added');
  const researchIn = guardedCopy(research, 'workshop', { deviceTools: bench.tools });
  assert.ok(researchIn.tools.every((name) => !name.startsWith('bench_')));
  assert.equal(guardedCopy(code, 'unknown').guardedBy, 'unknown');
  assert.equal(lockedMode(codeIn), true, 'grid choices never carry into a guarded copy (I17)');
});

test('recon-off-locked and old guards: held without tools once run; a draft still sealed', () => {
  assert.equal(spaceCopy(research, 'recon', { ready: { recon: 'off' }, ranBefore: true }), LOCKED_MODE);
  assert.equal(spaceCopy(research, 'recon', { ready: { recon: 'old' }, ranBefore: true }), LOCKED_MODE);
  assert.equal(spaceCopy(research, 'recon', { ready: { recon: 'off' }, ranBefore: false }).sealedBy, 'recon');
  assert.equal(spaceCopy(code, 'devices', { oldGuard: { devices: true } }), heldIn('devices'), 'Bench too old: held (I27)');
  assert.equal(spaceCopy(code, 'devices', { oldGuard: {} }).guardedBy, 'devices', 'Bench off: the base rule (I27)');
  assert.equal(spaceCopy(bench, 'devices', { oldGuard: { devices: true } }), bench, 'the home mode keeps today\'s behaviour');
});

test('shared-stores-never-sealed: Recon may never ask for a tool that writes notes other threads read', () => {
  for (const name of ['remember', 'finance_profile_save', 'learn_plan', 'content_draft', 'data_save_analysis', 'automation_results', 'scout_profile']) {
    assert.equal(reconMayAsk(name), false, name);
    assert.equal(isSharedStore(name), true, name);
  }
  assert.ok(SHARED_STORES.prefixes.includes('learn_'));
  assert.equal(reconMayAsk('read'), true, 'files in the room still can be asked for');
});

test('preset-by-space: programs and the restart preset follow the space', () => {
  assert.equal(refusesProgramsIn(research, 'devices'), true);
  assert.equal(refusesProgramsIn(research, 'chat'), false);
  assert.equal(refusesProgramsIn(LOCKED_MODE, 'devices'), false, 'a fallback mode has no tools in any preset');
  assert.equal(restartPresetIn({}, 'workshop', research), 'cordis');
  assert.equal(restartPresetIn({}, 'devices', code), 'standard');
  assert.equal(restartPresetIn({ bench: 'creator' }, 'devices', code), 'cordis', 'the space\'s own lock');
  assert.equal(lockInSpace({}, 'recon', 'research').lock, 'standard');
  assert.equal(lockInSpace({}, 'devices', 'plain').lock, 'standard');
  assert.equal(lockInSpace({}, 'workshop', 'research').lock, 'creator');
  const both = lockInSpace({}, 'workshop', 'automations');
  assert.equal(both.lock, 'creator');
  assert.equal(both.conflict, true, 'the space wins');
});

test('lost-in: what a mode loses in Devices and Workshop, as family names', () => {
  const allowed = ['read', 'write', 'edit', 'glob', 'grep', 'creator_'];
  const dataAll = { id: 'data', tools: 'all' };
  // Lab fix (6a): family keys, most important first; a mode with all tools always loses what the space closes for every mode.
  // Stage 6b (lost-in-no-schedules): schedules are no longer lost in Devices or Workshop (point 27).
  const always = ['terminal', 'programs', 'jobs', 'connectors', 'mac', 'office'].map((id) => `\u0000${id}`);
  const lostWorkshop = lostIn(dataAll, 'workshop', { known: ['data_query', 'data_files', 'read'], workshopAllowed: allowed });
  assert.deepEqual(lostWorkshop, [...always, '\u0000data']);
  const lostDevices = lostIn(code, 'devices', { known: ['read', 'job_list', 'mcp__mail__send', 'mission', 'run_code', 'bash'] });
  assert.deepEqual(lostDevices, always, 'Terminal first, whatever order the tools come in; never Mission');
  const listed = lostIn({ id: 'mine', tools: ['schedule_create', 'pdf_read', 'deep_research', 'bash'] }, 'devices');
  assert.deepEqual(listed, ['\u0000terminal'], 'a list mode: only what it has and loses (stage 6b: schedules stay)');
  assert.deepEqual(lostIn(code, 'recon', { known: ['bash'] }), []);
  assert.deepEqual(lostIn(bench, 'devices', { known: ['bash'] }), [], 'the home mode loses nothing');
});

test('ticks: Workshop needs Creator Plus; a ticked guarded space warns; Recon gives a note', () => {
  const off = ticksOfMode('code', { code: ['code', 'workshop'] }, { ready: { workshop: 'off' } });
  assert.deepEqual(off.find((tick) => tick.space === 'workshop'), { space: 'workshop', greyed: true, reason: 'Needs Creator Plus: switch it on in Settings → Creator Plus.' });
  assert.equal(ticksOfMode('code', { code: ['code', 'workshop'] }, { ready: READY }).find((tick) => tick.space === 'workshop').greyed, false);
  assert.deepEqual(ticksOfMode('bench', {}, { ready: {} }), [{ space: 'devices', greyed: false, reason: '' }], 'home pins unchanged');
  assert.deepEqual(ticksOfMode('creator-plus', {}, { ready: {} }), [{ space: 'workshop', greyed: false, reason: '' }]);
  const rows = modeRowsForPage([code], { modeSpaces: { code: ['code', 'devices'] }, ready: { devices: 'old', recon: true, workshop: true }, lang: 'zh' });
  assert.equal(rows[0].ticks.find((tick) => tick.space === 'devices').reason, 'Needs a newer Devices: update it, then switch it off and on in Settings → Devices.');
  const lost = (mode, space) => lostIn(mode, space, { known: ['bash', 'read'] });
  const modes = [code, research, dataList, plain];
  const toDevices = nextModeSpaces({ modeId: 'code', modeLabel: 'Code', space: 'devices', on: true, modes, ready: READY, lost });
  assert.equal(toDevices.refusal, '');
  assert.equal(toDevices.warning, 'In Devices, Code loses: the Terminal, programs, background jobs, connectors, other Mac apps, Office files. The rules of Devices refuse them.');
  const toWorkshop = nextModeSpaces({ modeId: 'data', modeLabel: 'Data', space: 'workshop', on: true, modes, ready: READY, lost });
  assert.match(toWorkshop.warning, /^In Workshop, Data loses: (the Terminal, )?programs/);
  const zhLine = nextModeSpaces({ modeId: 'code', modeLabel: 'Code', space: 'devices', on: true, modes, ready: READY, lost, lang: 'zh' });
  assert.equal(zhLine.warning, toDevices.warning, 'stage 7: a Chinese page gets the same English line');
  const toRecon = nextModeSpaces({ modeId: 'research', modeLabel: 'Research', space: 'recon', on: true, modes, ready: READY, lost });
  assert.equal(toRecon.note, 'In Recon, Research is sealed: it goes online only through Recon\'s routes and keeps its files in Recon\'s room.');
  assert.match(nextModeSpaces({ modeId: 'code', space: 'workshop', on: true, modes, ready: { workshop: 'off' }, lost }).refusal, /Needs Creator Plus/);
  const many = nextModeSpaces({ modeId: 'code', modeLabel: 'Code', space: 'devices', on: true, modes, ready: READY, lost: () => ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] });
  assert.match(many.warning, /h, and more\./, 'eight named, then "and more"');
});

test('refresh-keeps-guarded and fill-add-marked-recon (I21)', () => {
  for (const space of ['recon', 'devices', 'workshop']) assert.equal(fillSpaces({ a: 'research' }, { a: space }, { refresh: true }).next.a, space);
  assert.equal(fillSpaces({ a: 'research' }, { a: 'code' }, { refresh: true, keep: new Set(['a']) }).next.a, 'code', 'a kept id is untouched');
  assert.equal(fillSpaces({ a: 'research' }, { a: 'code' }, { refresh: true }).next.a, 'chat', 'others as before');
  assert.equal(fillSpaces({ a: 'research' }, {}, { keep: new Set(['a']) }).next.a, 'recon');
  assert.equal(fillSpaces({ a: 'osint' }, {}, { keep: new Set(['a']), isolatedModes: ['osint', 'recon'] }).next.a, 'chat', 'an owner\'s isolated mode keeps its own space');
});

test('move-into-guarded-after-programs (I26)', () => {
  const base = { from: 'code', current: 'code', sealed: false, shown: ['chat', 'code', 'devices', 'workshop'], offered: [{ id: 'code' }] };
  assert.equal(spaceMovePlan({ ...base, to: 'devices', ranPrograms: true }).refusal, 'This thread ran the Terminal or a program since the app started, and Devices allows neither. Start a new thread in Devices, or restart the app first.');
  assert.equal(spaceMovePlan({ ...base, to: 'workshop', ranPrograms: true, lang: 'zh' }).refusal, 'This thread ran the Terminal or a program since the app started, and Workshop allows neither. Start a new thread in Workshop, or restart the app first.');
  assert.equal(spaceMovePlan({ ...base, to: 'devices', ranPrograms: false }).refusal, '');
  assert.equal(spaceMovePlan({ ...base, to: 'chat', ranPrograms: true, offered: [{ id: 'code' }] }).refusal, '', 'Chat allows programs');
});

test('sealed-switch-within-recon (I11)', () => {
  assert.equal(modeChangeRefusal({ wasIsolated: true, current: 'research', target: 'plain', targetIsolated: true, fresh: false, withinSealed: true }), '');
  assert.match(modeChangeRefusal({ wasIsolated: true, current: 'research', target: 'plain', targetIsolated: true, fresh: false, withinSealed: false }), /cannot change its mode in place/);
});

test('pick-refusal-reason: a greyed row says why', () => {
  const said = modePickRefusal({ space: 'workshop', modeId: 'code', modeLabel: 'Code', offered: [{ id: 'code', greyed: true, reason: 'Needs Creator Plus: switch it on in Settings → Creator Plus.' }], known: true });
  assert.equal(said, 'Code cannot be used in Workshop now. Needs Creator Plus: switch it on in Settings → Creator Plus.');
});

test('mask: withoutGuestRefused takes the refused tools out of any mask', () => {
  const known = ['read', 'bash', 'zzz_tool', 'bench_usb'];
  assert.deepEqual(withoutGuestRefused({ allow: ['read', 'bash'] }, known), { allow: ['read'] });
  assert.deepEqual(withoutGuestRefused({ deny: ['read'] }, known), { deny: ['read', 'bash', 'zzz_tool'] });
  assert.deepEqual(withoutGuestRefused(null, known), { deny: ['bash', 'zzz_tool'] });
});

test('sandbox entries: a mode moved into a guarded space while closed counts as moved; plain entries compare ids', () => {
  assert.equal(movedSince({ mode: 'code' }, 'code', undefined), false);
  assert.equal(movedSince({ mode: 'code' }, 'code', 'code|||all'), true);
  assert.equal(movedSince({ mode: 'code', key: 'code|||all' }, 'code', 'code|||all'), false);
  assert.equal(movedSince({ mode: 'chat' }, 'code'), true);
});

test('English only: every new sentence is in the one English table (stage 7)', () => {
  assert.deepEqual(Object.keys(SPACE_SETTINGS_TEXT), ['en']);
  for (const key of ['greyedNow', 'tickNoPrograms', 'tickSealed', 'spaceFixed', 'reconRoomOnly', 'roomOnlySealed', 'guardHeld', 'needsAddonHeld', 'baseNoPrograms', 'spaceWait', 'engineHeld', 'sealedExtra', 'sealedExtraWarn', 'gridInGuarded']) {
    assert.equal(typeof SPACE_SETTINGS_TEXT.en[key], 'string', key);
  }
  for (const space of ['devices', 'recon', 'workshop']) {
    assert.ok(SPACE_SETTINGS_TEXT.en.needsAddon[space] && SPACE_SETTINGS_TEXT.en.needsUpdate[space], space);
  }
});

// ---- Item 4A, stage 6b (J14, Revision 2 L1, G13): schedules for guests, never for the unknown guard or a Mission run ----

test('guest-schedules-allowed: a guest in Devices or Workshop is not refused the app\'s schedule tools', () => {
  for (const space of ['devices', 'workshop']) {
    for (const name of ['schedule_create', 'schedule_edit', 'schedule_list', 'schedule_view']) assert.equal(guestRefuses(name, { space }), false, `${space} ${name}`);
    // What the space refused before still is.
    for (const name of ['bash', 'run_code', 'office_convert', 'mcp__x__y', 'zzz_tool']) assert.equal(guestRefuses(name, { space }), true, `${space} ${name}`);
  }
  assert.ok(!GUEST_REFUSED.prefixes.includes('schedule_'));
  assert.deepEqual([...UNKNOWN_EXTRA], ['schedule_']);
});

test('unknown-guard-schedules-refused and guest-refuses-no-opts-is-unknown (L1): a call site that does not say refuses', () => {
  assert.equal(guestRefuses('schedule_create', { space: 'unknown' }), true);
  assert.equal(guestRefuses('schedule_create'), true, 'no opts: the unknown guard');
  assert.equal(guestRefuses('schedule_create', {}), true);
  assert.equal(guestRefuses('schedule_create', { space: 'recon' }), true, 'anything but Devices or Workshop');
  assert.equal(guestRefuses('read'), false, 'other tools as before');
  const mask = withoutGuestRefused({ allow: ['read', 'schedule_create'] }, ['read', 'schedule_create']);
  assert.deepEqual(mask.allow, ['read'], 'withoutGuestRefused without opts: unknown');
  assert.deepEqual(withoutGuestRefused({ allow: ['read', 'schedule_create'] }, ['read', 'schedule_create'], { space: 'devices' }).allow, ['read', 'schedule_create']);
  const refuser = spaceRefuser({ guardedBy: 'unknown' }, ['read', 'schedule_']);
  assert.equal(refuser('schedule_create'), true, 'the unknown guard keeps refusing, whatever the Workshop list says');
  assert.equal(spaceRefuser({ guardedBy: 'workshop' }, ['read', 'schedule_'])('schedule_create'), false);
  assert.equal(spaceRefuser({ guardedBy: 'workshop' }, ['read'])('schedule_create'), true, 'Workshop: an older Creator Plus list without schedules');
});

test('mission-guest-no-schedules (G13): an unattended Mission run in Devices or Workshop schedules nothing more', () => {
  assert.equal(guestRefuses('schedule_create', { space: 'devices', mission: true }), true);
  assert.deepEqual(withoutGuestRefused({ allow: ['read', 'schedule_create'] }, [], { space: 'devices', mission: true }).allow, ['read']);
});

test('lost-in-no-schedules: the Mode list no longer says a mode loses schedules in Devices or Workshop', () => {
  const lost = lostIn({ id: 'mine', tools: ['schedule_create', 'schedule_list', 'bash'] }, 'devices');
  assert.ok(!lost.includes('\u0000schedules'));
  assert.ok(!lostIn({ id: 'all', tools: 'all' }, 'workshop', { known: ['schedule_create'] }).includes('\u0000schedules'));
});
