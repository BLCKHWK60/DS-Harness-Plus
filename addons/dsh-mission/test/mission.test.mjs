import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { OWN_FOLDER, isInside, outsideInCommand, pathsOf, real } from '../lib/paths.js';
import { decide, modeOf, rulesNote } from '../lib/guard.js';
import { GIT_CANDIDATES, openCheckpoints } from '../lib/checkpoints.js';

const fresh = () => realpathSync(mkdtempSync(join(tmpdir(), 'dsh-mission-')));
const none = () => false;

test('a path is inside only when its real spelling is', () => {
  const root = fresh();
  const other = fresh();
  try {
    mkdirSync(join(root, 'src'));
    writeFileSync(join(other, 'secret.txt'), 'x');
    symlinkSync(other, join(root, 'link'));
    assert.ok(isInside(root, real(join(root, 'src', 'new.js'))));
    assert.ok(isInside(root, real(root)));
    assert.ok(!isInside(root, real(join(root, '..', 'elsewhere'))));
    // A link that points out of the folder is outside, whatever its name says.
    assert.ok(!isInside(root, real(join(root, 'link', 'secret.txt'))));
    assert.ok(!isInside(root, `${root}-twin`));
    assert.deepEqual(pathsOf({ file_path: 'src/a.js', files: ['b.js', '../x'], other: 'src/zzz' }, root), [join(root, 'src/a.js'), join(root, 'b.js'), real(join(root, '..', 'x'))]);
    assert.deepEqual(pathsOf({ command: 'ls' }, root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(other, { recursive: true, force: true });
  }
});

test('a command is read for places outside the folder, not for look-alikes', () => {
  const root = fresh();
  const home = homedir();
  try {
    assert.deepEqual(outsideInCommand('npm test && node build.js > out.txt', root), []);
    assert.deepEqual(outsideInCommand('/usr/bin/git status; cat /etc/hosts 2>/dev/null', root), []);
    assert.deepEqual(outsideInCommand('grep -r "/api/users" . && curl https://example.com/a/../b', root), []);
    assert.deepEqual(outsideInCommand(`cat ${join(root, 'a.txt')}`, root), []);
    assert.deepEqual(outsideInCommand('cat ~/Documents/notes.txt', root), [real(join(home, 'Documents/notes.txt'))]);
    assert.deepEqual(outsideInCommand('ls $HOME && ls "${HOME}/Desktop"', root), [real(home), real(join(home, 'Desktop'))]);
    assert.deepEqual(outsideInCommand('cd .. && ls', root), [real(join(root, '..'))].filter((path) => !path.startsWith('/private/var') && !path.startsWith('/var') && !path.startsWith('/tmp') && !path.startsWith('/private/tmp')));
    assert.deepEqual(outsideInCommand(`cp x ${home}/y; cp x ${home}/y`, root), [real(join(home, 'y'))]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the three modes decide file calls as the owner asked', () => {
  const root = fresh();
  const outside = real(join(homedir(), 'Documents', 'plan.md'));
  try {
    writeFileSync(join(root, 'old.js'), '1');
    const call = (mode, tool, args, approved = none, outsideOk = none) => decide({ mode, tool, args, root, approved, outsideOk });
    for (const mode of ['restricted', 'ask']) {
      // New files are free; an existing one is asked for once.
      assert.deepEqual(call(mode, 'write', { file_path: 'new.js' }), { kind: 'allow' });
      const ask = call(mode, 'edit', { file_path: 'old.js' });
      assert.equal(ask.kind, 'ask');
      assert.deepEqual(ask.files, [join(root, 'old.js')]);
      assert.match(ask.question, /change old\.js\? You are asked once per file/);
      assert.deepEqual(call(mode, 'edit', { file_path: 'old.js' }, (path) => path === join(root, 'old.js')), { kind: 'allow' });
      assert.deepEqual(call(mode, 'read', { file_path: 'old.js' }), { kind: 'allow' });
    }
    assert.deepEqual(call('auto', 'edit', { file_path: 'old.js' }), { kind: 'allow' });

    // Outside: Restricted refuses and says not to ask; the other two ask once per place.
    for (const tool of ['read', 'write', 'glob']) {
      const no = call('restricted', tool, { file_path: outside, path: outside });
      assert.equal(no.kind, 'deny');
      assert.match(no.reason, /the user is not to be asked/);
    }
    for (const mode of ['ask', 'auto']) {
      const ask = call(mode, 'read', { file_path: outside });
      assert.equal(ask.kind, 'ask');
      assert.deepEqual(ask.outside, [outside]);
      assert.match(ask.question, /read outside the conversation's folder/);
      // A change outside is left to the app's sandbox, which refuses it and asks on the retry.
      assert.deepEqual(call(mode, 'write', { file_path: outside }), { kind: 'allow' });
      assert.deepEqual(call(mode, 'read', { file_path: outside }, none, (path) => path === outside), { kind: 'allow' });
    }

    // The checkpoint folder is not for the assistant.
    assert.equal(call('auto', 'write', { file_path: `${OWN_FOLDER}/x` }).kind, 'deny');
    assert.equal(call('auto', 'bash', { command: `rm -rf ${OWN_FOLDER}` }).kind, 'deny');
    assert.equal(call('auto', 'bash', { command: `rm -rf ./${OWN_FOLDER}/checkpoints.git` }).kind, 'deny');

    // No mode, no folder, no paths: nothing to decide.
    assert.deepEqual(decide({ mode: '', tool: 'write', args: { file_path: outside }, root, approved: none, outsideOk: none }), { kind: 'allow' });
    assert.deepEqual(call('restricted', 'todo_write', { todos: [] }), { kind: 'allow' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('commands: free inside, outside by mode, and no wider sandbox in Restricted', () => {
  const root = fresh();
  try {
    const call = (mode, args, outsideOk = none) => decide({ mode, tool: 'bash', args, root, approved: none, outsideOk });
    for (const mode of ['restricted', 'ask', 'auto']) assert.deepEqual(call(mode, { command: 'npm test' }), { kind: 'allow' });
    assert.equal(call('restricted', { command: 'cat ~/Documents/x' }).kind, 'deny');
    assert.equal(call('restricted', { command: 'npm test', sandbox_permissions: 'danger-full-access', justification: 'x' }).kind, 'deny');
    assert.equal(call('ask', { command: 'npm test', sandbox_permissions: 'danger-full-access', justification: 'x' }).kind, 'allow');
    const ask = call('auto', { command: 'cat ~/Documents/x' });
    assert.equal(ask.kind, 'ask');
    assert.deepEqual(call('auto', { command: 'cat ~/Documents/x' }, () => true), { kind: 'allow' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('mode names and the note for the assistant', () => {
  assert.equal(modeOf('Restricted'), 'restricted');
  assert.equal(modeOf(' ask-auto '), 'ask');
  assert.equal(modeOf('Full Auto'), 'auto');
  assert.equal(modeOf('2'), 'ask');
  assert.equal(modeOf('make the tests pass'), undefined);
  const root = fresh();
  try {
    assert.match(rulesNote('restricted', root), /Do not ask the user for it/);
    assert.match(rulesNote('restricted', root), /asked once per file/);
    assert.match(rulesNote('ask', root), /needs the user's yes/);
    assert.match(rulesNote('auto', root), /retry that exact call once with sandbox_permissions/);
    assert.match(rulesNote('auto', root), /without asking\.\n/);
    assert.ok(!/asked once per file/.test(rulesNote('auto', root)));
    assert.equal(rulesNote('nonsense', root), '');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('checkpoints: take, see what changed, put files back, go back and undo that', { skip: !GIT_CANDIDATES.some((path) => existsSync(path)) }, async () => {
  const root = fresh();
  try {
    writeFileSync(join(root, 'a.txt'), 'one');
    writeFileSync(join(root, 'b.txt'), 'bee');
    writeFileSync(join(root, '.gitignore'), 'build/\n');
    mkdirSync(join(root, 'build'));
    writeFileSync(join(root, 'build', 'out.bin'), 'x');
    const points = openCheckpoints(root);
    const first = await points.take('Start');
    assert.equal(first.number, 1);
    assert.equal(first.fresh, true);
    // Nothing changed: no new checkpoint.
    assert.deepEqual(await points.take('Again'), { id: first.id, number: 1, fresh: false });

    writeFileSync(join(root, 'a.txt'), 'two');
    rmSync(join(root, 'b.txt'));
    writeFileSync(join(root, 'c.txt'), 'new');
    writeFileSync(join(root, 'build', 'out.bin'), 'changed');
    assert.deepEqual(await points.since(first.id), { changed: ['a.txt'], deleted: ['b.txt'], added: ['c.txt'] });

    // Single files go back; the new file and ignored output stay.
    await points.putBack(first.id, ['a.txt', 'b.txt']);
    assert.equal(readFileSync(join(root, 'a.txt'), 'utf8'), 'one');
    assert.equal(readFileSync(join(root, 'b.txt'), 'utf8'), 'bee');
    assert.equal(readFileSync(join(root, 'c.txt'), 'utf8'), 'new');
    assert.equal(readFileSync(join(root, 'build', 'out.bin'), 'utf8'), 'changed');

    const second = await points.take('After work');
    assert.equal(second.number, 2);
    writeFileSync(join(root, 'a.txt'), 'three');
    const went = await points.back(1);
    assert.deepEqual({ number: went.number, label: went.label, saved: went.saved, now: went.now }, { number: 1, label: 'Start', saved: 3, now: 4 });
    assert.equal(readFileSync(join(root, 'a.txt'), 'utf8'), 'one');
    assert.ok(!existsSync(join(root, 'c.txt')));
    assert.equal(readFileSync(join(root, 'build', 'out.bin'), 'utf8'), 'changed');

    // Going back is itself a checkpoint, so it can be undone.
    await points.back(3);
    assert.equal(readFileSync(join(root, 'a.txt'), 'utf8'), 'three');
    assert.equal(readFileSync(join(root, 'c.txt'), 'utf8'), 'new');
    const list = await points.list();
    // Nothing had changed since the last checkpoint, so "before going back" needed no new one.
    assert.deepEqual(list.map((point) => point.number), [5, 4, 3, 2, 1]);
    assert.equal(list.at(-1).label, 'Start');
    assert.match(list[1].label, /^Went back to checkpoint 1: Start$/);
    assert.match(list[0].label, /^Went back to checkpoint 3: Before going back to checkpoint 1$/);
    await assert.rejects(points.back(99), /There is no checkpoint 99/);

    // The store never holds itself, and the project's own git is not there to be touched.
    assert.ok(existsSync(join(root, OWN_FOLDER, 'checkpoints.git', 'HEAD')));
    assert.ok(!existsSync(join(root, '.git')));
    assert.deepEqual((await points.since(list[0].id)), { changed: [], deleted: [], added: [] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the store stays out of the project\'s own git status, and is written once', { skip: !GIT_CANDIDATES.some((path) => existsSync(path)) }, async () => {
  const root = fresh();
  try {
    // A stand-in for a project that is a git repository.
    mkdirSync(join(root, '.git', 'info'), { recursive: true });
    writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    writeFileSync(join(root, '.git', 'info', 'exclude'), '# local\n*.log');
    writeFileSync(join(root, 'a.txt'), 'one');
    await openCheckpoints(root).take('First');
    await openCheckpoints(root).take('Second');
    assert.equal(readFileSync(join(root, '.git', 'info', 'exclude'), 'utf8'), `# local\n*.log\n/${OWN_FOLDER}/\n`);
    // The project's own .git is not copied into a checkpoint.
    const points = openCheckpoints(root);
    writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/other\n');
    assert.deepEqual(await points.since((await points.list())[0].id), { changed: [], deleted: [], added: [] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the record keeps approvals across a restart and a mode change', async () => {
  const { openState, covered } = await import('../lib/state.js');
  const dir = fresh();
  try {
    const file = join(dir, 'mission', 'conversations.json');
    const state = openState(file);
    state.set('s1', { mode: 'restricted', root: '/w', preset: 'danger-full-access' });
    state.approve('s1', ['/w/a.js']);
    state.allowOutside('s1', ['/elsewhere/docs']);
    state.set('s1', { mode: 'auto', root: '/w', preset: 'workspace-write' });
    state.flush();
    const again = openState(file).get('s1');
    assert.equal(again.mode, 'auto');
    // The preset to return to is the one from before Mission, not Mission's own.
    assert.equal(again.preset, 'danger-full-access');
    assert.deepEqual([...again.approved], ['/w/a.js']);
    assert.ok(covered(again.outside, '/elsewhere/docs/deep/file.md'));
    assert.ok(!covered(again.outside, '/elsewhere/docs-other'));
    // Another folder under the same conversation starts clean.
    assert.equal(state.set('s1', { mode: 'ask', root: '/other' }).approved.size, 0);
    assert.throws(() => state.set('s2', { mode: 'wild', root: '/w' }), /unknown mode/);
    assert.equal(state.clear('s1').mode, 'ask');
    assert.equal(state.get('s1'), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('settings fall back to Restricted', async () => {
  const { readSettings, HELP } = await import('../index.js');
  assert.deepEqual(readSettings({}), { enabled: true, defaultMode: 'restricted' });
  assert.deepEqual(readSettings({ enabled: false, defaultMode: 'auto' }), { enabled: false, defaultMode: 'auto' });
  assert.equal(readSettings({ defaultMode: 'anything' }).defaultMode, 'restricted');
  for (const word of ['/mission restricted', '/mission ask', '/mission auto', '/mission off', '/mission back 12']) assert.ok(HELP.includes(word), word);
});
