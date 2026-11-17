/**
 * Split Plus, step 2: one folder, safely. Real files in a throwaway folder; a stand-in app for the hooks.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply, DATA_PATH } from '../index.js';
import { LEASE_MS, openFileWatch, readsOf, writesOf } from '../lib/files.js';

const tick = (ms = 5) => new Promise((done) => setTimeout(done, ms));
const folder = () => realpathSync(mkdtempSync(join(tmpdir(), 'split-plus-files-')));
/** Change a file so its time moves on too (two writes in the same millisecond look the same otherwise). */
let clock = Date.now() / 1000;
function change(path, text) {
  writeFileSync(path, text);
  clock += 5;
  utimesSync(path, clock, clock);
}

test('the files a tool changes or reads, made absolute against the pane\'s folder', () => {
  assert.deepEqual(writesOf('write', { file_path: 'notes.md' }, '/w'), ['/w/notes.md']);
  assert.deepEqual(writesOf('edit', { file_path: '/x/a.js' }, '/w'), ['/x/a.js']);
  assert.deepEqual(writesOf('str_replace_editor', { command: 'view', path: 'a' }, '/w'), []);
  assert.deepEqual(writesOf('str_replace_editor', { command: 'str_replace', path: 'a' }, '/w'), ['/w/a']);
  const patch = '*** Begin Patch\n*** Update File: src/a.js\n@@\n-x\n+y\n*** Add File: b.md\n+hi\n*** Delete File: c.txt\n*** Update File: d.js\n*** Move to: e.js\n*** End Patch';
  assert.deepEqual(writesOf('apply_patch', { input: patch }, '/w'), ['/w/src/a.js', '/w/b.md', '/w/c.txt', '/w/d.js', '/w/e.js']);
  assert.deepEqual(writesOf('bash', { command: 'echo > a' }, '/w'), []);
  assert.deepEqual(writesOf('write', { file_path: '~/secret' }, '/w'), []);
  assert.deepEqual(readsOf('read', { file_path: 'notes.md' }, '/w'), ['/w/notes.md']);
  assert.deepEqual(readsOf('str_replace_editor', { command: 'view', path: 'a' }, '/w'), ['/w/a']);
});

test('two panes, one file: the second waits until the first pane\'s step ends', async () => {
  const dir = folder();
  try {
    const file = join(dir, 'app.js');
    change(file, 'one');
    const watch = openFileWatch({ labelOf: (pane) => ({ A: 'Code', B: 'Research' })[pane] });
    assert.equal(await watch.acquire('A', [file]), true);
    let second = false;
    const waiting = watch.acquire('B', [file]).then((got) => { second = got; });
    await tick();
    assert.equal(second, false, 'B waits');
    assert.deepEqual(watch.waitingOf('B'), { what: 'app.js', holder: 'A', kind: 'file' });
    assert.equal(await watch.acquire('A', [file]), true, 'a pane never waits for itself');
    watch.releaseAll('A');
    await waiting;
    assert.equal(second, true);
    assert.equal(watch.waitingOf('B'), null);
    assert.equal(watch.holderOf(file, 'A'), 'B');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a pane that stops answering lets go after two minutes; a stopped turn stops waiting', async () => {
  let now = 1_000_000;
  const watch = openFileWatch({ now: () => now, stat: () => ({ mtimeMs: 1, size: 1 }) });
  await watch.acquire('A', ['/f']);
  assert.equal(watch.holderOf('/f', 'B'), 'A');
  now += LEASE_MS + 1;
  assert.equal(watch.holderOf('/f', 'B'), '');
  now = 2_000_000;
  await watch.acquire('A', ['/g']);
  const controller = new AbortController();
  const stopped = watch.acquire('B', ['/g'], controller.signal);
  await tick();
  controller.abort();
  assert.equal(await stopped, false);
  assert.equal(watch.waitingOf('B'), null);
});

test('no stale copies: a change to a file another pane changed since you read it is refused, and you are told', () => {
  const dir = folder();
  try {
    const file = join(dir, 'notes.md');
    change(file, 'first');
    const watch = openFileWatch({ labelOf: (pane) => ({ A: 'Code', B: 'Research' })[pane] });
    watch.noteRead('A', file);
    watch.noteRead('B', file);
    assert.equal(watch.staleWhy('A', [file]), '');
    change(file, 'B changed it');
    watch.noteWrite('B', [file]);
    assert.match(watch.staleWhy('A', [file]), /notes\.md was changed by the Research pane after you read it/);
    assert.equal(watch.staleWhy('B', [file]), '', 'the pane that changed it has the current copy');
    const notes = watch.takeNotices('A');
    assert.equal(notes.length, 1);
    assert.match(notes[0], /changed by the Research pane after you read it\. Read it again/);
    assert.deepEqual(watch.takeNotices('A'), [], 'told once');
    watch.noteRead('A', file);
    assert.equal(watch.staleWhy('A', [file]), '', 'reading it again clears it');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a command\'s changes are caught right after it runs; the pane that ran it keeps its own copy', () => {
  const dir = folder();
  try {
    const file = join(dir, 'data.csv');
    change(file, 'a,b');
    const watch = openFileWatch({ labelOf: (pane) => ({ A: 'Code', B: 'Research' })[pane] });
    watch.noteRead('A', file);
    watch.noteRead('B', file);
    change(file, 'a,b,c');
    watch.sweep('A');
    assert.equal(watch.staleWhy('A', [file]), '');
    assert.match(watch.takeNotices('B')[0], /changed by a command or tool in the Code pane/);
    change(file, 'edited outside');
    watch.sweep('');
    assert.match(watch.takeNotices('A')[0], /changed by a command or a program outside this pane/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a guarded command holds its folder: other panes\' changes and commands there wait, and it waits for theirs', async () => {
  const watch = openFileWatch({ stat: () => ({ mtimeMs: 1, size: 1 }) });
  // B is changing a file in the folder: A's guarded command waits for it first.
  await watch.acquire('B', ['/w/app/a.js']);
  let commandOn = false;
  const command = watch.holdFolder('A', '/w/app').then((got) => { commandOn = got; });
  await tick();
  assert.equal(commandOn, false);
  assert.deepEqual(watch.waitingOf('A'), { what: 'a.js', holder: 'B', kind: 'file' });
  watch.releaseAll('B');
  await command;
  assert.equal(commandOn, true);
  // While A's command runs, B's change and B's command in that folder wait; a file elsewhere does not.
  let wrote = false;
  const write = watch.acquire('B', ['/w/app/src/b.js']).then((got) => { wrote = got; });
  let ran = false;
  const other = watch.beginCommand('C', '/w').then((got) => { ran = got; });
  assert.equal(await watch.acquire('B', ['/w/other/c.js']), true);
  await tick();
  assert.deepEqual([wrote, ran], [false, false]);
  assert.deepEqual(watch.waitingOf('C'), { what: 'app', holder: 'A', kind: 'command' });
  watch.endCommands('A');
  await Promise.all([write, other]);
  assert.deepEqual([wrote, ran], [true, true]);
  // C's command now counts as running in /w: a guarded command there waits for it to end.
  watch.releaseAll('B');
  let guarded = false;
  const next = watch.holdFolder('D', '/w/app').then((got) => { guarded = got; });
  await tick();
  assert.equal(guarded, false);
  assert.deepEqual(watch.waitingOf('D'), { what: 'w', holder: 'C', kind: 'command' });
  watch.endCommands('C');
  await next;
  assert.equal(guarded, true);
});

test('two panes asking for one free file in the same instant: only one gets it', async () => {
  const watch = openFileWatch({ stat: () => ({ mtimeMs: 1, size: 1 }) });
  const got = [];
  const a = watch.acquire('A', ['/w/f.md']).then(() => got.push('A'));
  const b = watch.acquire('B', ['/w/f.md']).then(() => got.push('B'));
  await tick();
  assert.deepEqual(got, ['A'], 'B waits; it did not take the file A took');
  assert.equal(watch.holderOf('/w/f.md', 'B'), 'A');
  watch.releaseAll('A');
  await Promise.all([a, b]);
  assert.equal(watch.holderOf('/w/f.md', 'A'), 'B');
  // The same for two guarded commands over one folder.
  const held = [];
  const c = watch.holdFolder('C', '/x').then(() => held.push('C'));
  const d = watch.holdFolder('D', '/x/sub').then(() => held.push('D'));
  await tick();
  assert.deepEqual(held, ['C']);
  watch.endCommands('C');
  await Promise.all([c, d]);
  assert.deepEqual(held, ['C', 'D']);
});

test('two panes each waiting for what the other holds: the second is refused at once, the first goes on', async () => {
  const watch = openFileWatch({ stat: () => ({ mtimeMs: 1, size: 1 }) });
  await watch.acquire('A', ['/w/one.md']);
  await watch.acquire('B', ['/w/two.md']);
  let first;
  const waitingA = watch.acquire('A', ['/w/two.md']).then((got) => { first = got; });
  await tick();
  assert.equal(first, undefined, 'A waits for B');
  assert.deepEqual(await watch.acquire('B', ['/w/one.md']), { deadlock: true, holder: 'A' });
  assert.equal(watch.waitingOf('B'), null);
  watch.releaseAll('B');
  await waitingA;
  assert.equal(first, true);
});

test('one file under two spellings (a linked folder, /tmp and /private/tmp) is one file', () => {
  const dir = folder();
  try {
    mkdirSync(join(dir, 'real'));
    symlinkSync(join(dir, 'real'), join(dir, 'link'));
    assert.deepEqual(writesOf('write', { file_path: join(dir, 'link', 'a.md') }, '/'), [join(dir, 'real', 'a.md')]);
    assert.deepEqual(writesOf('write', { file_path: 'link/new/b.md' }, dir), [join(dir, 'real', 'new', 'b.md')], 'a folder not made yet keeps its name');
    assert.deepEqual(readsOf('read', { file_path: 'a.md' }, join(dir, 'link')), [join(dir, 'real', 'a.md')]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A stand-in app: two panes in one folder, the hooks Split Plus listens to, and real files. */
function standIn(dir, missionMode = '') {
  const routes = new Map();
  const hooks = {};
  const ctx = {
    get: (name) => (name === 'settings' ? { describe: () => [{ ns: 'modes', value: { modes: { code: { label: 'Code' }, research: { label: 'Research' } } } }] }
      : name === 'modes' ? { get: (id) => (id === 'A' ? 'code' : 'research'), isolated: () => false }
        : name === 'workingDirectory' ? { get: () => dir }
          : name === 'mission' ? { mode: (id) => (typeof missionMode === 'object' ? missionMode[id] ?? '' : id === 'A' ? missionMode : '') } : undefined),
    on: (name, fn) => { hooks[name] = fn; },
    effect: (fn) => fn(),
    inject(_names, fn) { fn({ effect: (register) => register(), webServer: { register: (route) => routes.set(route.path, route) }, connection: { requestRejection: () => undefined } }); },
    logger: { warn() {} },
  };
  apply(ctx, { enabled: true });
  const agent = (id) => ({ id, session: { header: { id } } });
  const run = async (who, name, args, effect = () => {}) => {
    const exec = { agent: agent(who), name, arguments: args, callId: `${who}-${Math.random()}`, signal: new AbortController().signal };
    const allowed = await hooks['tools/pre-execute'](exec, async () => ({ kind: 'allow' }));
    if (allowed?.kind === 'deny') return { denied: allowed.reason };
    effect();
    const result = { content: [{ type: 'text', text: 'ok' }] };
    const after = await hooks['tools/post-execute'](exec, result, async () => ({ kind: 'accept' }));
    return { text: (after?.content ?? result.content).map((block) => block.text).join('') };
  };
  return { routes, hooks, agent, run };
}

async function hit(routes, { method = 'GET', query = '', body } = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const req = { method, url: `${DATA_PATH}${query}`, async *[Symbol.asyncIterator]() { yield* chunks; } };
  let text = '';
  const res = { statusCode: 200, setHeader() {}, end(value) { text = value ?? ''; } };
  await routes.get(DATA_PATH).handler(req, res);
  return text ? JSON.parse(text) : {};
}

test('the two-writers test on the stand-in app: one waits, the file is whole, the other is told', async () => {
  const dir = folder();
  try {
    const { routes, hooks, agent, run } = standIn(dir);
    await hit(routes, { method: 'POST', body: { action: 'panes', panes: [{ id: 'p1', sessionId: 'A' }, { id: 'p2', sessionId: 'B' }] } });
    const file = join(dir, 'shared.md');
    change(file, 'start');
    await run('A', 'read', { file_path: 'shared.md' });
    await run('B', 'read', { file_path: 'shared.md' });
    // A starts changing the file; it holds it until its step ends.
    const first = await run('A', 'write', { file_path: 'shared.md', content: 'A wrote this' }, () => change(file, 'A wrote this'));
    assert.equal(first.denied, undefined);
    // B wants the same file at the same moment: it waits, and its title says who has it.
    let second;
    const pending = run('B', 'write', { file_path: 'shared.md', content: 'B wrote this' }, () => change(file, 'B wrote this')).then((value) => { second = value; });
    await tick(20);
    assert.equal(second, undefined, 'B waits');
    assert.deepEqual((await hit(routes, { query: '?sessions=A,B' })).waitingFile.B, { file: 'shared.md', kind: 'file', holder: 'Code' });
    // A's step ends: B goes on, but the file changed since B read it, so B's change is refused.
    await hooks['agent/pre-step']({ agent: agent('A'), modelSelection: {}, signal: new AbortController().signal }, async () => ({ kind: 'enter', messages: [] }));
    await pending;
    assert.match(second.denied, /shared\.md was changed by the Code pane after you read it\. Read it again/);
    assert.equal(readFileSync(file, 'utf8'), 'A wrote this', 'the file is whole: A\'s change, not a mix');
    // B is also told on its next tool answer, reads the file again, and then may change it.
    const told = await run('B', 'read', { file_path: 'shared.md' });
    assert.doesNotMatch(told.text, /Split Plus/, 'a fresh read clears the note for that file');
    const third = await run('B', 'write', { file_path: 'shared.md', content: 'B again' }, () => change(file, 'B again'));
    assert.equal(third.denied, undefined);
    const toldA = await run('A', 'bash', { command: 'ls' });
    assert.match(toldA.text, /\[Split Plus \(another pane works in this folder\): .*shared\.md was changed by the Research pane/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('on the stand-in app: a command in Mission\'s Ask-Auto holds the folder from before Mission\'s picture until its step ends', async () => {
  const dir = folder();
  try {
    const { routes, run, hooks, agent } = standIn(dir, 'ask');
    await hit(routes, { method: 'POST', body: { action: 'panes', panes: [{ id: 'p1', sessionId: 'A' }, { id: 'p2', sessionId: 'B' }] } });
    const execA = { agent: agent('A'), name: 'bash', arguments: { command: 'npm test' }, callId: 'a1', signal: new AbortController().signal };
    let second;
    let pending;
    // The guards after Split Plus (Mission among them) decide, and Mission takes its "before" picture:
    // B's change must already wait, whichever order the add-ons run in.
    await hooks['tools/pre-execute'](execA, async () => {
      pending = run('B', 'write', { file_path: 'new.md', content: 'B' }).then((value) => { second = value; });
      await tick(20);
      assert.equal(second, undefined, 'B waits while Mission takes its picture');
      return { kind: 'allow' };
    });
    await tick(20);
    assert.equal(second, undefined, 'B waits while A\'s command runs');
    assert.deepEqual((await hit(routes, { query: '?sessions=A,B' })).waitingFile.B, { file: dir.split('/').pop(), kind: 'command', holder: 'Code' });
    // The command ended; Mission may still be putting files back: B still waits.
    await hooks['tools/post-execute'](execA, { content: [{ type: 'text', text: 'ok' }] }, async () => ({ kind: 'accept' }));
    await tick(20);
    assert.equal(second, undefined, 'B waits until A\'s step is over');
    await hooks['agent/pre-step']({ agent: agent('A'), modelSelection: {}, signal: new AbortController().signal }, async () => ({ kind: 'enter', messages: [] }));
    await pending;
    assert.equal(second.denied, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('on the stand-in app: a guarded command waits for another pane\'s running command; a refused command lets go at once', async () => {
  const dir = folder();
  try {
    const { routes, run, hooks, agent } = standIn(dir, { A: '', B: 'restricted' });
    await hit(routes, { method: 'POST', body: { action: 'panes', panes: [{ id: 'p1', sessionId: 'A' }, { id: 'p2', sessionId: 'B' }] } });
    const execA = { agent: agent('A'), name: 'bash', arguments: { command: 'npm run build' }, callId: 'a1', signal: new AbortController().signal };
    assert.equal((await hooks['tools/pre-execute'](execA, async () => ({ kind: 'allow' }))).kind, 'allow');
    let guarded;
    const pending = run('B', 'bash', { command: 'git status' }).then((value) => { guarded = value; });
    await tick(20);
    assert.equal(guarded, undefined, 'B\'s guarded command waits for A\'s command (Full Auto) to end');
    await hooks['tools/post-execute'](execA, { content: [{ type: 'text', text: 'ok' }] }, async () => ({ kind: 'accept' }));
    await pending;
    assert.equal(guarded.denied, undefined);
    await hooks['agent/pre-step']({ agent: agent('B'), modelSelection: {}, signal: new AbortController().signal }, async () => ({ kind: 'enter', messages: [] }));
    // A guarded command another guard refuses never runs: its folder is free at once.
    const execB = { agent: agent('B'), name: 'bash', arguments: { command: 'rm -rf x' }, callId: 'b2', signal: new AbortController().signal };
    assert.equal((await hooks['tools/pre-execute'](execB, async () => ({ kind: 'deny', reason: 'no' }))).kind, 'deny');
    const write = await Promise.race([run('A', 'write', { file_path: 'free.md', content: 'x' }), tick(50).then(() => 'still waiting')]);
    assert.notEqual(write, 'still waiting');
    await hooks['agent/pre-step']({ agent: agent('A'), modelSelection: {}, signal: new AbortController().signal }, async () => ({ kind: 'enter', messages: [] }));
    // A turn stopped while it waits: nothing runs.
    const execB3 = { agent: agent('B'), name: 'bash', arguments: { command: 'ls' }, callId: 'b3', signal: new AbortController().signal };
    await hooks['tools/pre-execute'](execB3, async () => ({ kind: 'allow' }));
    const stop = new AbortController();
    const execA2 = { agent: agent('A'), name: 'bash', arguments: { command: 'ls' }, callId: 'a2', signal: stop.signal };
    const stopped = hooks['tools/pre-execute'](execA2, async () => ({ kind: 'allow' }));
    await tick(10);
    stop.abort();
    assert.match((await stopped).reason, /stopped while this pane waited/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('conversations outside the Split page, and Split Plus switched off, are left alone', async () => {
  const dir = folder();
  try {
    const { run } = standIn(dir);
    const file = join(dir, 'x.md');
    change(file, '1');
    await run('A', 'read', { file_path: 'x.md' });
    change(file, '2');
    const result = await run('A', 'write', { file_path: 'x.md', content: '3' });
    assert.equal(result.denied, undefined, 'A is not in a pane: nothing is held or refused');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
