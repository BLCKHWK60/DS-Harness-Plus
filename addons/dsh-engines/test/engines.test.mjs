import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyProject, difference } from '../lib/copy.js';
import * as opencode from '../lib/engines/opencode.js';
import { lockProfile } from '../lib/lock.js';
import { emptyPane, runEngine } from '../lib/runner.js';
import { ended, openRuns } from '../lib/runs.js';

const mac = process.platform === 'darwin' && existsSync('/usr/bin/sandbox-exec');
const room = () => realpathSync(mkdtempSync(join(tmpdir(), 'dsh-engines-')));

test('OpenCode: one task, in one process, read from its machine-readable output', () => {
  assert.deepEqual(opencode.args({ task: 'fix it', model: '' }), ['run', '--standalone', '--auto', '--format', 'json', 'fix it']);
  assert.deepEqual(opencode.args({ task: 'fix it', model: 'local/test-model' }).slice(5), ['--model', 'local/test-model', 'fix it']);
  assert.deepEqual(opencode.parse(JSON.stringify({ type: 'step_finish', part: { cost: 0.01, tokens: { input: 100, output: 20, reasoning: 5, cache: { read: 30, write: 2 } } } })), { kind: 'step', input: 132, output: 25, cost: 0.01 });
  assert.deepEqual(opencode.parse(JSON.stringify({ type: 'step_finish', part: {} })), { kind: 'step', input: 0, output: 0, cost: 0 });
  assert.deepEqual(opencode.parse(JSON.stringify({ type: 'text', part: { text: 'hello' } })), { kind: 'text', text: 'hello' });
  assert.deepEqual(opencode.parse(JSON.stringify({ type: 'tool', part: { tool: 'bash' } })), { kind: 'tool', name: 'bash' });
  assert.equal(opencode.parse(JSON.stringify({ type: 'reasoning', part: { text: 'hm' } })), undefined);
  assert.equal(opencode.parse('not json'), undefined);
  assert.equal(opencode.find('/no/such/opencode'), '');
  assert.ok(opencode.ownFolders('/Users/x').every((path) => path.startsWith('/Users/x/') && /opencode/.test(path)));
});

test('the lock: writes only in the copy and the engine\'s own folders, no reading of the home', () => {
  const profile = lockProfile({ work: '/w/copy', own: ['/h/.opencode'], readable: ['/h/.opencode/bin'], home: '/h' });
  assert.match(profile, /\(deny file-read-data \(subpath "\/h"\) \(subpath "\/Volumes"\)\)/);
  assert.match(profile, /\(allow file-read-data \(subpath "\/w\/copy"\) \(subpath "\/h\/\.opencode"\) \(subpath "\/h\/\.opencode\/bin"\)\)/);
  assert.match(profile, /\(deny file-write\*\)\n\(allow file-write\* \(subpath "\/w\/copy"\) \(subpath "\/h\/\.opencode"\) \(subpath "\/private\/tmp"\)/);
  assert.equal(profile.includes('deny network'), false, 'the engine has to reach its model');
});

test('a project is copied, and the difference is what an engine changed', async () => {
  const dir = room();
  try {
    const project = join(dir, 'project');
    mkdirSync(join(project, 'src'), { recursive: true });
    mkdirSync(join(project, 'node_modules', 'x'), { recursive: true });
    writeFileSync(join(project, 'app.js'), 'one\ntwo\n');
    writeFileSync(join(project, 'src', 'keep.js'), 'keep\n');
    writeFileSync(join(project, 'node_modules', 'x', 'i.js'), 'lib\n');
    await copyProject(project, join(dir, 'base'));
    await copyProject(project, join(dir, 'work'));
    await assert.rejects(copyProject(project, join(dir, 'work')), /already taken/);
    await assert.rejects(copyProject(join(dir, 'nope'), join(dir, 'x')), /not there/);
    assert.equal(readFileSync(join(dir, 'work', 'src', 'keep.js'), 'utf8'), 'keep\n');
    const none = await difference(join(dir, 'base'), join(dir, 'work'));
    assert.deepEqual([none.files, none.added, none.removed, none.patch], [0, 0, 0, '']);
    writeFileSync(join(dir, 'work', 'app.js'), 'one\nTWO\nthree\n');
    writeFileSync(join(dir, 'work', 'new.md'), 'hello\n');
    writeFileSync(join(dir, 'work', 'node_modules', 'x', 'i.js'), 'changed\n');
    const diff = await difference(join(dir, 'base'), join(dir, 'work'));
    assert.deepEqual([diff.files, diff.added, diff.removed], [2, 3, 1]);
    assert.match(diff.patch, /--- a\/app\.js/);
    assert.match(diff.patch, /\+\+\+ b\/new\.md/);
    assert.equal(diff.patch.includes('node_modules') || diff.patch.includes(dir), false, 'no library folders, no paths of the copies');
    assert.equal(readFileSync(join(project, 'app.js'), 'utf8'), 'one\ntwo\n', 'the project itself is untouched');
    assert.equal((await difference(join(dir, 'base'), join(dir, 'work'), 40)).cut, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('comparisons are kept, and one that was running when the app closed is marked stopped', () => {
  const dir = room();
  try {
    const file = join(dir, 'runs.json');
    const runs = openRuns(file);
    const pane = { ...emptyPane('opencode', 'OpenCode'), status: 'running', startedAt: 5 };
    runs.add({ id: 'r1', at: 1, project: '/p', task: 't', panes: [emptyPane('dsh', 'dsh'), pane] });
    assert.equal(ended(runs.get('r1')), false);
    const again = openRuns(file);
    assert.equal(again.get('r1').panes[1].status, 'stopped');
    assert.equal(ended(again.get('r1')), true);
    for (let n = 0; n < 25; n += 1) again.add({ id: `x${n}`, at: n, project: '/p', task: 't', panes: [] });
    assert.equal(again.list().length, 20);
    assert.equal(again.get('r1'), undefined, 'the oldest make room');
    assert.equal(again.remove('x24'), true);
    assert.equal(openRuns(file).list().length, 19);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an engine runs in its copy inside the lock, and its figures are counted', { skip: !mac }, async () => {
  const dir = room();
  // A file in the home that the engine must not be able to read, and a place outside the copy it must not write.
  const secretDir = mkdtempSync(join(homedir(), '.dsh-engines-test-'));
  try {
    const work = join(dir, 'work');
    mkdirSync(work);
    writeFileSync(join(work, 'app.js'), 'function hello() {}\n');
    writeFileSync(join(secretDir, 'secret.txt'), 'private');
    const program = join(dir, 'engine');
    // The stand-in sits next to its starter: an engine may read the folder its program is in, not this repository.
    writeFileSync(join(dir, 'fake-engine.mjs'), readFileSync(fileURLToPath(new URL('./fixtures/fake-engine.mjs', import.meta.url))));
    writeFileSync(program, `#!/bin/sh\nexec env ELECTRON_RUN_AS_NODE=1 "${process.execPath}" "${join(dir, 'fake-engine.mjs')}" "$@"\n`);
    chmodSync(program, 0o755);
    const adapter = { ...opencode, ownFolders: () => [], args: (input) => opencode.args(input) };
    const env = { PATH: '/usr/bin:/bin', FAKE_OUTSIDE: join(secretDir, 'written.txt'), FAKE_SECRET: join(secretDir, 'secret.txt') };

    const pane = emptyPane('opencode', 'OpenCode');
    await runEngine({ adapter, program, task: 'add reverse', model: 'local/test-model', work, pane, env }).done;
    assert.equal(pane.status, 'finished', pane.error);
    assert.deepEqual([pane.steps, pane.input, pane.output, pane.tools], [2, 2500, 100, 1]);
    assert.ok(Math.abs(pane.cost - 0.003) < 1e-9);
    assert.match(pane.text, /Done: add reverse\. outside=EPERM secret=EPERM model=local\/test-model/);
    assert.equal(existsSync(join(secretDir, 'written.txt')), false, 'nothing was written outside the copy');
    assert.match(readFileSync(join(work, 'app.js'), 'utf8'), /function reverse/);
    assert.ok(pane.endedAt >= pane.startedAt && pane.startedAt > 0);

    const failed = emptyPane('opencode', 'OpenCode');
    await runEngine({ adapter, program, task: 'FAIL please', model: '', work, pane: failed, env }).done;
    assert.equal(failed.status, 'failed');
    assert.match(failed.error, /ended with code 3\. It said: model not found/);

    const slow = emptyPane('opencode', 'OpenCode');
    const handle = runEngine({ adapter, program, task: 'SLOW task', model: '', work, pane: slow, env });
    setTimeout(() => handle.stop(), 1500);
    await handle.done;
    assert.equal(slow.status, 'stopped');
    assert.equal(slow.steps, 1, 'what it used before it was stopped is still counted');

    const missing = emptyPane('opencode', 'OpenCode');
    await runEngine({ adapter, program: join(dir, 'no-such-program'), task: 'x', model: '', work, pane: missing, env }).done;
    assert.equal(missing.status, 'failed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(secretDir, { recursive: true, force: true });
  }
});
