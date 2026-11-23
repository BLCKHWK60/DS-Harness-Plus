// Item 4A, fix round 2 (review: high): Plain chat stays inside its folder. A standalone Plain chat thread reaches only
// its own Scratch folder, a project thread only its project folder (the owner's answer of 22 November 2026). Reads,
// writes, searches, commands and programs are checked; "Keep Plain chat inside its folder" (`plainFence`, on by default)
// switches it off; what the model is told matches the fence.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fenceCheck, fencePrompt, fenceRefusal } from '../lib/fence.js';

process.env.DSH_MODES_PRESET_SETTLE_MS = '0';
const { boot, makeWorld, settle } = await import('./app.mjs');

const base = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-fence-')));
const SCRATCH = join(base, 'scratch');
const MINE = join(SCRATCH, 'session-mine');
const OTHER = join(SCRATCH, 'session-other');
const PROJECT = join(base, 'project');
for (const dir of [MINE, OTHER, PROJECT, join(base, 'elsewhere')]) mkdirSync(dir, { recursive: true });
writeFileSync(join(OTHER, 'secret.txt'), 'other thread');
writeFileSync(join(MINE, 'notes.txt'), 'mine');
symlinkSync(OTHER, join(MINE, 'link-out'));

test('fenceCheck: inside passes; another thread\'s folder, a parent, home and a link out are refused', () => {
  const ok = (name, args) => fenceCheck({ root: MINE, name, args, home: base });
  assert.deepEqual(ok('read', { file_path: 'notes.txt' }), { ok: true });
  assert.deepEqual(ok('read', { file_path: join(MINE, 'notes.txt') }), { ok: true });
  assert.deepEqual(ok('write', { file_path: 'new/deep/file.md' }), { ok: true }, 'a file not made yet, inside');
  assert.equal(ok('read', { file_path: join(OTHER, 'secret.txt') }).ok, false);
  assert.equal(ok('read', { file_path: '../session-other/secret.txt' }).ok, false);
  assert.equal(ok('grep', { pattern: 'x', path: SCRATCH }).ok, false, 'the whole Scratch place');
  assert.equal(ok('read', { file_path: 'link-out/secret.txt' }).ok, false, 'a link that points out counts as outside');
  assert.equal(ok('glob', { pattern: `${OTHER}/**/*.txt` }).ok, false);
  assert.equal(ok('glob', { pattern: '**/*.txt' }).ok, true);
  assert.equal(ok('apply_patch', { input: `*** Begin Patch\n*** Update File: ${join(OTHER, 'secret.txt')}\n*** End Patch` }).ok, false);
  assert.equal(ok('read', { file_path: '~/elsewhere/x' }).ok, false, 'home');
});

test('fenceCheck: commands and programs are read for paths; system places may be read, never written', () => {
  const ok = (name, args) => fenceCheck({ root: MINE, name, args, home: base });
  assert.equal(ok('bash', { command: 'ls -la && cat notes.txt' }).ok, true);
  assert.equal(ok('bash', { command: `cat ${join(OTHER, 'secret.txt')}` }).ok, false);
  assert.equal(ok('bash', { command: 'cat ../session-other/secret.txt' }).ok, false);
  assert.equal(ok('bash', { command: 'cd .. && ls' }).ok, false);
  assert.equal(ok('bash', { command: '/usr/bin/python3 -c "print(1)" > /dev/null' }).ok, true, 'programs and /dev/null');
  assert.equal(ok('bash', { command: 'curl https://example.com/api/x' }).ok, true, 'a web address is not a place');
  assert.equal(ok('run_code', { code: `open("${join(OTHER, 'secret.txt')}").read()` }).ok, false);
  assert.equal(ok('read', { file_path: '/etc/hosts' }).ok, true, 'a system file may be read');
  assert.equal(ok('write', { file_path: '/etc/hosts' }).ok, false, 'never written');
  assert.equal(ok('read', { file_path: '/private/tmp/x' }).ok, false, 'not /tmp: other threads and Recon\'s room live there');
  assert.equal(ok('mac_find_files', { query: 'x' }).kind, 'anywhere');
  assert.equal(ok('mcp__drive__read', { path: '/My Drive/x' }).ok, true, 'a connector is not this Mac');
  assert.equal(fenceCheck({ root: MINE, name: 'read', args: { file_path: '/etc/hosts' }, isRoom: () => true }).ok, false, 'Recon\'s room never, even as a system place');
});

// Final fix round (review: high/medium): the whole disk, other users' homes, variables, the shell tools' other names,
// a command's own working folder, `cd` elsewhere, glob patterns that climb, a moved working folder and `link/..`.
const DOOR_OUT = join(base, 'elsewhere', 'deep');
mkdirSync(DOOR_OUT, { recursive: true });
writeFileSync(join(base, 'elsewhere', 'secret'), 'outside');
symlinkSync(DOOR_OUT, join(PROJECT, 'door'));

test('fenceCheck: "/" is the whole disk; ~name, $VAR/… and $(…)/… cannot be read, so they are refused', () => {
  const ok = (name, args) => fenceCheck({ root: MINE, name, args, home: base, tmp: join(base, 'tmp') });
  const rel = OTHER.slice(1);
  assert.equal(ok('bash', { command: `cd / && cat ${rel}/secret.txt` }).ok, false, 'cd / then a relative path');
  assert.equal(ok('bash', { command: 'grep -r secret /' }).ok, false);
  assert.equal(ok('bash', { command: "find / -name '*.key'" }).ok, false);
  assert.equal(ok('bash', { command: 'find / -name "*.json" -exec cat {} +' }).ok, false);
  assert.equal(ok('bash', { command: 'ls /*' }).ok, false, 'a pattern on the whole disk');
  assert.equal(ok('bash', { command: 'ln -s / r && cat r/Users/x' }).ok, false);
  assert.equal(ok('bash', { command: 'cat $PWD/../session-other/secret.txt' }).ok, false, '$PWD is the working folder');
  assert.equal(ok('bash', { command: 'cat $PWD/notes.txt' }).ok, true);
  assert.equal(ok('bash', { command: 'cat ~victor/.zshrc' }).kind, 'unreadable');
  assert.equal(ok('bash', { command: 'ls $TMPDIR/x' }).ok, false, '$TMPDIR is outside');
  assert.equal(ok('bash', { command: 'cat $OLDPWD/secret' }).kind, 'unreadable');
  assert.equal(ok('bash', { command: 'cat "$(dirname x)/../secret"' }).ok, false);
  assert.equal(ok('bash', { command: 'cd -' }).ok, false);
  assert.equal(ok('bash', { command: 'cd' }).ok, false, 'cd alone is the home folder');
  assert.equal(ok('bash', { command: 'cd /usr && ls' }).ok, false, 'a cd to a system place: the shell would stay there');
  assert.equal(ok('bash', { command: 'mkdir -p sub/a && cd sub && ls a/' }).ok, true, 'inside is fine');
  assert.equal(ok('bash', { command: 'for f in *.txt; do wc -l "$f"; done' }).ok, true, 'a variable on its own is not a path');
  assert.equal(ok('run_code', { code: "import os\nprint(os.listdir('/'))" }).ok, false);
  assert.equal(ok('run_code', { code: 'x = 6 / 3\nprint(x // 2)' }).ok, true, 'division is not a place');
});

test('fenceCheck: every shell tool name is read, and a command\'s own working folder must be inside', () => {
  const ok = (name, args) => fenceCheck({ root: MINE, name, args, home: base });
  const secret = join(OTHER, 'secret.txt');
  assert.equal(ok('terminal_send', { text: `cat ${secret}` }).ok, false);
  assert.equal(ok('terminal_send', { keys: `cat ${secret}\n` }).ok, false);
  assert.equal(ok('powershell', { command: `cat ${secret}` }).ok, false);
  assert.equal(ok('terminal_open', { command: `cat ${secret}` }).ok, false);
  assert.equal(ok('bash', { command: 'cat secret.txt', workdir: OTHER }).ok, false, 'workdir outside');
  assert.equal(ok('bash', { command: 'cat secret.txt', workdir: '/Users' }).ok, false);
  assert.equal(ok('bash', { command: 'cat notes.txt', workdir: MINE }).ok, true);
  assert.equal(ok('bash', { command: 'cat ../notes.txt', workdir: 'sub' }).ok, true, 'words are read from the workdir (sub/.. is the thread folder)');
  assert.equal(ok('bash', { command: 'cat ../../session-other/secret.txt', workdir: 'sub' }).ok, false);
});

test('fenceCheck: glob patterns that climb, the working_directory tool, a moved working folder, link/..', () => {
  const ok = (name, args, cwd) => fenceCheck({ root: MINE, name, args, home: base, cwd });
  assert.equal(ok('glob', { pattern: 'x/../../session-other/*' }).ok, false);
  assert.equal(ok('glob', { pattern: '*/../../session-other/*' }).ok, false);
  assert.equal(ok('glob', { pattern: 'src/**/*.md' }).ok, true);
  assert.equal(ok('working_directory', { cd: '/Users' }).ok, false, 'the app\'s working_directory tool');
  assert.equal(ok('working_directory', { cd: MINE }).ok, true);
  // The working folder was moved out (or the move into the thread's folder failed): nothing relative, no commands.
  const moved = ok('read', { file_path: 'secret.txt' }, OTHER);
  assert.equal(moved.kind, 'cwd');
  assert.match(fenceRefusal(moved, MINE), /working_directory tool to /);
  assert.equal(ok('bash', { command: 'ls' }, OTHER).kind, 'cwd');
  assert.equal(ok('grep', { pattern: 'x' }, SCRATCH).kind, 'cwd', 'a search with no path reads the working folder');
  assert.equal(ok('read', { file_path: join(MINE, 'notes.txt') }, OTHER).ok, true, 'a full path inside still works');
  assert.equal(ok('working_directory', { cd: MINE }, OTHER).ok, true, 'moving back is allowed');
  // A link inside the project, then "..": the system goes to the parent of the link's target.
  const proj = (name, args) => fenceCheck({ root: PROJECT, name, args, home: base });
  assert.equal(proj('read', { file_path: 'door/../secret' }).ok, false);
  assert.equal(proj('bash', { command: 'cat door/../secret' }).ok, false);
  assert.equal(proj('read', { file_path: 'door/x' }).ok, false, 'the link itself points out');
});

test('the refusal and the prompt line say what happened and what to do', () => {
  const said = fenceRefusal({ ok: false, path: join(OTHER, 'secret.txt'), kind: 'outside' }, MINE);
  assert.match(said, /outside this thread's folder/);
  assert.match(said, /nothing was read, changed or run/);
  assert.match(said, /drop it into the chat/);
  assert.match(said, /Keep Plain chat inside its folder/);
  assert.match(fencePrompt(MINE, true), new RegExp(`only inside ${MINE.replace(/[/.]/g, '\\$&')} \\(its own folder`));
  assert.match(fencePrompt(PROJECT, false), /its project folder/);
});

const EXTRA = { research: { label: 'Research', tools: 'all', sandbox: 'inherit', prompt: 'Research.' } };
function app(fields = {}) {
  const world = makeWorld({ extraModes: JSON.stringify(EXTRA), ...fields });
  const run = boot(world, { tabs: true, known: ['read', 'write', 'bash'], services: { coworkScratch: { folderOf: (agent) => (agent?.header?.cwd === SCRATCH ? join(SCRATCH, agent.id) : '') } } });
  return run;
}

test('a standalone Plain chat thread: only its own Scratch folder; the model is told so', async () => {
  const run = app();
  const { agent } = await run.open('session-mine', { header: { cwd: SCRATCH } });
  await run.service().spaces.startDraft('session-mine', { space: 'chat' });
  assert.equal(run.service().get('session-mine'), 'plain');
  assert.equal(run.guard({ agent, name: 'read', arguments: { file_path: join(MINE, 'notes.txt') } }), undefined);
  assert.match(run.guard({ agent, name: 'read', arguments: { file_path: join(OTHER, 'secret.txt') } }), /kept inside its own folder/);
  assert.match(run.guard({ agent, name: 'bash', arguments: { command: `ls ${SCRATCH}` } }), /outside this thread's folder/);
  assert.match(run.section('session-mine', 'modes:fence').text, /only inside .*session-mine \(its own folder/);
  // A helper of the thread is held to the same folder.
  const { agent: helper } = await run.open('helper-1', { header: { cwd: SCRATCH, parentSession: 'session-mine' } });
  assert.match(run.guard({ agent: helper, name: 'read', arguments: { file_path: join(OTHER, 'secret.txt') } }) ?? '', /kept inside its own folder/);
});

test('a project Plain chat thread: its project folder; other modes are not fenced', async () => {
  const run = app();
  const { agent } = await run.open('p1', { header: { cwd: PROJECT } });
  await run.service().spaces.startDraft('p1', { space: 'chat' });
  assert.equal(run.service().get('p1'), 'plain');
  assert.equal(run.guard({ agent, name: 'write', arguments: { file_path: join(PROJECT, 'a.md') } }), undefined);
  assert.match(run.guard({ agent, name: 'read', arguments: { file_path: join(base, 'elsewhere', 'x') } }), /outside/);
  assert.match(run.section('p1', 'modes:fence').text, /its project folder/);
  await run.service().spaces.pick('p1', 'research');
  await settle();
  assert.equal(run.guard({ agent, name: 'read', arguments: { file_path: join(base, 'elsewhere', 'x') } }), undefined, 'Research keeps its own rules');
  assert.equal(run.section('p1', 'modes:fence').text, '');
});

test('"Keep Plain chat inside its folder" off: no fence, no prompt line (a setting with a default, on)', async () => {
  assert.equal(makeWorld().config.plainFence.get(), true);
  const run = app({ plainFence: false });
  const { agent } = await run.open('session-mine', { header: { cwd: SCRATCH } });
  await run.service().spaces.startDraft('session-mine', { space: 'chat' });
  assert.equal(run.guard({ agent, name: 'read', arguments: { file_path: join(OTHER, 'secret.txt') } }), undefined);
  assert.equal(run.section('session-mine', 'modes:fence').text, '');
});
