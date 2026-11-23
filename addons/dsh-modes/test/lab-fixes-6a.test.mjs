/**
 * Item 4A, stage 6a: the lab testers' findings (23 November 2026), each fixed and checked on the stand-in app.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { boot, makeWorld, maskNow, settle } from './app.mjs';
import { SEALED_SPACE_NOTE } from '../index.js';
import { MODE as RECON } from '../../dsh-recon/lib/mode.js';
import { MODE as RESEARCH } from '../../dsh-research/lib/mode.js';

const ROOM = realpathSync(mkdtempSync(path.join(tmpdir(), 'dsh-lab6a-room-')));
const KNOWN = ['read', 'write', 'edit', 'glob', 'grep', 'bash', 'run_code', 'job_list', 'web_search', 'web_fetch', 'deep_research', 'remember', 'todo_write',
  'ask_user_question', 'diagram_draw', 'recon_web_search', 'recon_web_read', 'recon_cite', 'bench_usb', 'bench_devices', 'mcp__x__start_process', 'mac_shortcuts',
  'office_convert', 'schedule_create', 'schedule_list', 'tools_find', 'working_directory', 'pdf_read', 'mission_step'];
const EXTRA = {
  recon: RECON,
  research: RESEARCH,
  bench: { label: 'Devices', tools: ['read', 'bench_usb', 'bench_devices'], sandbox: 'read-only' },
  'creator-plus': { label: 'Creator Plus', tools: ['read', 'write', 'edit', 'glob', 'grep'] },
};
const TICKS = { research: ['chat', 'code', 'recon', 'devices', 'workshop'], plain: ['chat', 'code', 'recon'], code: ['code', 'devices', 'workshop'], cowork: ['chat', 'devices'] };

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
function start(fields = {}, { recon = reconService(), bench = { guestsGuarded: true }, creatorPlus = { guestsGuarded: true }, extra = EXTRA, ...options } = {}) {
  const world = makeWorld({ pruneStaleSessions: false, extraModes: JSON.stringify(extra), modeSpaces: JSON.stringify(TICKS), ...fields });
  const services = { recon: recon || null, bench: bench || null, creatorPlus: creatorPlus || null, ...(options.services ?? {}) };
  const app = boot(world, { tabs: true, known: KNOWN, ...options, services });
  return { app, world };
}
const allowOf = (one) => maskNow(one.masks)?.allow ?? null;

test('lab fix: Code, Cowork and Plain in Devices have the device tools (bench_…) from the first step (I15)', async () => {
  const { app } = start({ sessionSpaces: JSON.stringify({ cd: 'devices', cw: 'devices', cc: 'code' }), sessionModes: JSON.stringify({ cd: 'code', cw: 'cowork', cc: 'code' }) });
  const cd = await app.open('cd', { source: 'resume', lastTurn: 1 });
  const cw = await app.open('cw', { source: 'resume', lastTurn: 1 });
  const cc = await app.open('cc', { source: 'resume', lastTurn: 1 });
  for (const one of [cd, cw]) {
    const allow = allowOf(one);
    assert.ok(Array.isArray(allow), `${one.agent.id}: tools load as needed`);
    assert.ok(allow.includes('bench_usb') && allow.includes('bench_devices'), `${one.agent.id}: device tools offered`);
    assert.ok(!allow.includes('bash'), `${one.agent.id}: never the Terminal`);
  }
  assert.ok(!allowOf(cc).includes('bench_usb'), 'Code in the Code space: no device tools');
  app.stop();
});

// Stage 6b (7.6): updated on purpose: schedules are open to guests in Devices now (point 27); Office files stay closed.
test('lab fix: tools_find in Devices lists only what the space allows and says what it refuses, once', async () => {
  const { app } = start({ sessionSpaces: JSON.stringify({ cd: 'devices' }), sessionModes: JSON.stringify({ cd: 'code' }), sessionToolSets: JSON.stringify({ cd: ['schedule'] }) });
  const cd = await app.open('cd', { source: 'resume', lastTurn: 1 });
  const find = app.tool('tools_find').definition;
  assert.doesNotMatch(find.description, /\(files, shell,/, 'the description does not promise the shell');
  const list = (await find.execute({}, { agent: cd.agent })).text;
  assert.doesNotMatch(list, /- office|- mac|- connectors|start_process|mac_shortcuts/, list);
  assert.match(list, /- pdf/);
  assert.match(list, /- schedule/, 'stage 6b: schedules are offered to a guest in Devices');
  const asked = (await find.execute({ need: 'office' }, { agent: cd.agent })).text;
  assert.match(asked, /^office is refused here: Devices closes it for every mode\./);
  assert.doesNotMatch(asked, /not available here|office \(added\)/, 'never both "not available" and "added"');
  app.stop();
});

test('lab fix (blocker): an add-on off on the Plugins page leaves its mode listed but unguarded: held, and the reason says Plugins', async () => {
  // Creator Plus off on the Plugins page: its service is gone, its mode is still listed.
  const off = start({ sessionSpaces: JSON.stringify({ cp: 'workshop' }), sessionModes: JSON.stringify({ cp: 'creator-plus' }) }, { creatorPlus: null, services: { tuning: { isOn: () => true } } });
  const cp = await off.app.open('cp', { source: 'resume', lastTurn: 1 });
  assert.equal(off.app.service().get('cp'), 'isolated-locked', 'Creator Plus thread held: nothing guards its tools');
  assert.deepEqual(allowOf(cp), [], 'no tools');
  assert.notEqual(off.app.guard({ name: 'write', agent: cp.agent, arguments: { file_path: '/tmp/x.txt', content: 'x' } }), undefined, 'write refused');
  const w1 = await off.app.open('w1', { header: { cwd: '/Users/me/src/app' } });
  await off.app.service().spaces.startDraft('w1', { space: 'workshop' });
  assert.equal(off.app.service().get('w1'), 'isolated-locked', 'Workshop → New: no tools');
  assert.deepEqual(allowOf(w1), []);
  const view = off.app.service().spaces.view('w1');
  assert.equal(view.effective.held.reason, 'plugin');
  assert.equal(view.effective.held.text, 'This new thread has no tools for now: the Creator Plus add-on is off. Switch it on on the Plugins page.');
  const zh = off.app.service().spaces.view('w1', 'zh');
  assert.equal(zh.effective.held.text, view.effective.held.text, 'a Chinese page gets English');
  const tick = off.app.service().spaces.page('en').modes.find((mode) => mode.id === 'code').ticks.find((one) => one.space === 'workshop');
  assert.equal(tick.reason, 'Needs Creator Plus: switch it on on the Plugins page.', 'never "needs a newer"');
  off.app.stop();
  // Devices and Recon off on the Plugins page: the same.
  const both = start({ sessionSpaces: JSON.stringify({ cd: 'devices', bt: 'devices', rc: 'recon' }), sessionModes: JSON.stringify({ cd: 'code', bt: 'bench', rc: 'recon' }), sessionIsolated: JSON.stringify({ rc: true }) }, { bench: null, recon: null });
  await both.app.open('cd', { source: 'resume', lastTurn: 1 });
  await both.app.open('bt', { source: 'resume', lastTurn: 1 });
  await both.app.open('rc', { source: 'resume', lastTurn: 1, header: { cwd: ROOM } });
  assert.equal(both.app.service().get('cd'), 'isolated-locked');
  assert.equal(both.app.service().get('bt'), 'isolated-locked', 'the Devices mode itself is held too');
  assert.equal(both.app.service().get('rc'), 'isolated-locked', 'Recon mode without the Recon add-on: no tools, still isolated');
  assert.equal(both.app.service().isolated('rc'), true);
  assert.equal(both.app.service().spaces.view('cd').effective.held.text, 'This thread has no tools for now: the Devices add-on is off. Switch it on on the Plugins page.');
  const page = both.app.service().spaces.page('zh');
  assert.equal(page.modes.find((mode) => mode.id === 'code').ticks.find((one) => one.space === 'devices').reason, 'Needs Devices: switch it on on the Plugins page.', 'English on a Chinese page');
  both.app.stop();
  // Running but its mode not offered ("Offer the … mode" off): the Settings page is there, so that is where to go.
  const { bench: _bench, ...noBench } = EXTRA;
  void _bench;
  const offer = start({}, { extra: noBench });
  const reason = offer.app.service().spaces.page('en').modes.find((mode) => mode.id === 'code').ticks.find((one) => one.space === 'devices').reason;
  assert.equal(reason, 'Needs Devices: switch it on in Settings → Devices.');
  offer.app.stop();
});

test('lab fix: the sealed note names the thread\'s room folder and redirects the mode\'s own web words', async () => {
  const { app } = start();
  const r1 = await app.open('r1', { header: { cwd: ROOM } });
  await app.service().spaces.startDraft('r1', { space: 'recon' });
  await app.service().spaces.pick('r1', 'research');
  await settle();
  const prompt = app.prompt('r1');
  assert.equal(prompt.split(SEALED_SPACE_NOTE).length - 1, 1, 'the note once');
  assert.match(prompt, new RegExp(`This thread's room folder is ${path.join(ROOM, 'run-r1').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: give every file tool a full path inside it`));
  assert.match(prompt, /call web_search, web_fetch or deep_research, call recon_web_search and recon_web_read instead/);
  app.stop();
});

test('lab fix: a greyed home-mode tick names its mode and space', () => {
  const { app } = start();
  const tick = (lang) => app.service().spaces.page(lang).modes.find((mode) => mode.id === 'bench').ticks.find((one) => one.space === 'chat');
  assert.equal(tick('en').reason, 'Devices stays in its own space, Devices: it carries that space\'s safety rules.');
  assert.equal(tick('zh').reason, tick('en').reason, 'a Chinese page gets English');
  app.stop();
});

test('lab fix: the Mode list names what a mode loses, most important first, never Mission, in the page\'s language', async () => {
  const { app } = start({ sessionSpaces: JSON.stringify({ ml: 'devices' }), sessionModes: JSON.stringify({ ml: 'code' }) });
  await app.open('ml', { source: 'resume', lastTurn: 1 });
  const en = app.service().spaces.view('ml').modes.find((row) => row.id === 'code').loses;
  // Stage 6b (J14, lost-in-no-schedules): schedules are no longer named.
  assert.match(en, /^In Devices, Code loses: the Terminal, programs, background jobs, connectors, other Mac apps, Office files/);
  assert.doesNotMatch(en, /schedules/);
  assert.doesNotMatch(en, /Mission|nobody has sorted/);
  const zh = app.service().spaces.view('ml', 'zh').modes.find((row) => row.id === 'code').loses;
  assert.equal(zh, en, 'a Chinese page gets the same English line');
  app.stop();
});

test('lab fix: the held line wraps (the "what to click" part is readable); the Recon extra-tool switches show their names', async () => {
  const { readFileSync } = await import('node:fs');
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  const held = client.match(/\.dsh-me-held \{[^}]*\}/)?.[0] ?? '';
  assert.match(held, /white-space: normal/);
  assert.doesNotMatch(held, /text-overflow: ellipsis|nowrap/);
  assert.match(client, /h\('span', \{ className: 'dsh-me-sprules-name' \}, t\(`mt\.rules\.extra\.\$\{name\}`\)\)/);
});
