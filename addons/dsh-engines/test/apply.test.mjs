import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply, listing, pending, undoLast } from '../lib/apply.js';
import * as opencode from '../lib/engines/opencode.js';
import { engineModels, taskOf } from '../lib/model.js';
import { clearRoom, prepareRoom } from '../lib/room.js';

const room = () => realpathSync(mkdtempSync(join(tmpdir(), 'dsh-engines-')));
const put = (root, rel, text) => { mkdirSync(join(root, rel, '..'), { recursive: true }); writeFileSync(join(root, rel), text); };
const read = (root, rel) => readFileSync(join(root, rel), 'utf8');

test('what an engine changed goes into the project only as allowed, and can be taken back', async () => {
  const dir = room();
  try {
    const project = join(dir, 'project');
    put(project, 'app.js', 'one\n');
    put(project, 'old.txt', 'old\n');
    put(project, 'mine.txt', 'mine\n');
    put(project, 'node_modules/x/i.js', 'lib\n');
    const made = await prepareRoom(join(dir, 'room'), project);
    assert.equal(made.fresh, true);
    assert.deepEqual(pending(made.base, made.work), []);
    // The engine's work, in its copy.
    put(made.work, 'app.js', 'one\ntwo\n');
    put(made.work, 'src/new.js', 'new\n');
    put(made.work, 'mine.txt', 'engine version\n');
    put(made.work, 'node_modules/x/i.js', 'changed lib\n');
    rmSync(join(made.work, 'old.txt'));
    symlinkSync('/etc/hosts', join(made.work, 'link'));
    const changes = pending(made.base, made.work);
    assert.deepEqual(changes, [{ path: 'app.js', kind: 'changed' }, { path: 'mine.txt', kind: 'changed' }, { path: 'old.txt', kind: 'removed' }, { path: 'src/new.js', kind: 'added' }]);
    assert.equal(listing(changes), '~ app.js\n~ mine.txt\n− old.txt\n+ src/new.js');
    assert.equal(read(project, 'app.js'), 'one\n', 'nothing is in the project yet');

    // A follow-up keeps the copy while changes wait.
    assert.equal((await prepareRoom(join(dir, 'room'), project)).fresh, false);

    // Ask-Auto: new files only.
    const first = apply({ project, base: made.base, work: made.work, undo: made.undo, kinds: ['added'] });
    assert.deepEqual(first.applied, [{ path: 'src/new.js', kind: 'added' }]);
    assert.equal(first.left.length, 3);
    assert.equal(read(project, 'src/new.js'), 'new\n');
    assert.equal(read(project, 'app.js'), 'one\n');

    // The user edits a file meanwhile: it is not overwritten.
    put(project, 'mine.txt', 'my own edit\n');
    const second = apply({ project, base: made.base, work: made.work, undo: made.undo });
    assert.deepEqual(second.applied.map((change) => change.path), ['app.js', 'old.txt']);
    assert.deepEqual(second.conflicts, ['mine.txt']);
    assert.equal(read(project, 'app.js'), 'one\ntwo\n');
    assert.equal(existsSync(join(project, 'old.txt')), false);
    assert.equal(read(project, 'mine.txt'), 'my own edit\n');
    assert.equal(read(project, 'node_modules/x/i.js'), 'lib\n', 'library folders are never applied');
    assert.equal(existsSync(join(project, 'link')), false, 'links are left alone');
    assert.deepEqual(second.left, [{ path: 'mine.txt', kind: 'changed' }]);

    // Take the last apply back.
    assert.deepEqual(undoLast(project, made.undo).sort(), ['app.js', 'old.txt']);
    assert.equal(read(project, 'app.js'), 'one\n');
    assert.equal(read(project, 'old.txt'), 'old\n');
    assert.deepEqual(undoLast(project, made.undo), [], 'only once');

    // One file by name, and names that are not waiting.
    const again = await prepareRoom(join(dir, 'room2'), project);
    put(again.work, 'a.txt', 'a\n');
    put(again.work, 'b.txt', 'b\n');
    const one = apply({ project, base: again.base, work: again.work, undo: again.undo, only: ['b.txt', '../outside', 'nope'] });
    assert.deepEqual(one.applied.map((change) => change.path), ['b.txt']);
    assert.equal(existsSync(join(project, 'a.txt')), false);

    clearRoom(join(dir, 'room2'));
    assert.equal((await prepareRoom(join(dir, 'room2'), project)).fresh, true);
    assert.equal(read(join(dir, 'room2', 'work'), 'b.txt'), 'b\n', 'a fresh copy picks up the project as it is now');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an engine offered as a model: the newest message is its task, its text is the answer', async () => {
  assert.equal(taskOf([{ role: 'user', content: [{ type: 'text', text: 'first' }], source: { kind: 'user' } }, { role: 'assistant', content: 'x' }, { role: 'user', content: 'do this', source: { kind: 'user' } }, { role: 'user', content: '<system-reminder>ctx</system-reminder>', source: { kind: 'runtime-context' } }]), 'do this');
  assert.equal(taskOf([{ role: 'user', content: 'plain' }]), 'plain');
  assert.equal(taskOf([]), '');

  const calls = [];
  const { providers, adapter } = engineModels({
    adapters: { opencode },
    models: () => ['local/test-model'],
    turn: async (input) => {
      calls.push({ engine: input.engine, model: input.model, task: input.task });
      if (input.task === 'boom') throw new Error('it broke');
      input.say('Hello ');
      input.say('there.');
      return { input: 1200, output: 34 };
    },
    aside: async () => 'A title',
  });
  assert.deepEqual(providers, ['engine-opencode']);
  assert.deepEqual(adapter.providerInfo('engine-opencode'), { id: 'engine-opencode', name: 'OpenCode (engine)' });
  assert.deepEqual((await adapter.listModels('engine-opencode')).map((model) => model.id), ['default', 'local/test-model']);
  const run = async (model, text) => {
    const chunks = [];
    const call = await adapter.prepareCall('engine-opencode', model);
    for await (const chunk of call.stream({ provider: 'engine-opencode', model, tools: text === 'title' ? undefined : [{ name: 'read' }], messages: [{ role: 'user', content: text }] })) chunks.push(chunk);
    return chunks;
  };
  const chunks = await run('default', 'add a test');
  assert.deepEqual(chunks.map((chunk) => chunk.type), ['block-start', 'text-delta', 'text-delta', 'block-end', 'usage', 'finish']);
  assert.equal(chunks[3].block.text, 'Hello there.');
  assert.deepEqual(chunks[4].usage, { inputTokens: 1200, outputTokens: 34, totalTokens: 1234 });
  assert.deepEqual(chunks[5].reason, { kind: 'stop' });
  assert.deepEqual(calls[0], { engine: 'opencode', model: '', task: 'add a test' });
  await run('local/test-model', 'x y z');
  assert.equal(calls[1].model, 'local/test-model');
  assert.equal(calls.length, 2);
  assert.equal((await run('default', 'title')).find((chunk) => chunk.type === 'block-end').block.text, 'A title');
  assert.equal(calls.length, 2, 'a request without tools (a title, a summary) never starts an engine');
  assert.match((await run('default', 'boom')).find((chunk) => chunk.type === 'block-end').block.text, /could not do this: it broke/);
});

test('OpenCode carries on from its own session', () => {
  assert.deepEqual(opencode.args({ task: 'more', model: '', session: 'ses_abc123' }), ['run', '--standalone', '--auto', '--format', 'json', '--session', 'ses_abc123', 'more']);
  assert.deepEqual(opencode.parse(JSON.stringify({ type: 'text', sessionID: 'ses_abc123', part: { text: 'hi' } })), { kind: 'text', text: 'hi', session: 'ses_abc123' });
  assert.equal(opencode.parse(JSON.stringify({ type: 'text', sessionID: 'bad id with spaces', part: { text: 'hi' } })).session, undefined);
});
