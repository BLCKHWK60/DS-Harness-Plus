import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, hooks, strict, light, messageFor, checkRules, fill } from '../index.js';

/** Fake ctx; `runs` collects what would have been executed. */
function harness(config, { fail = false, delay = 0 } = {}) {
  const runs = [];
  hooks.run = async (file, args, options) => {
    runs.push({ file, args, env: options.env, timeout: options.timeout });
    if (delay) await new Promise((r) => setTimeout(r, delay));
    if (fail) throw Object.assign(new Error('spawn failed'), { code: 'ENOENT' });
  };
  let handler;
  const commands = {};
  const provided = {};
  const ctx = {
    on: (event, fn) => { if (event === 'session/event') handler = fn; },
    effect: (fn) => fn(),
    provide: (k, v) => { provided[k] = v; },
    inject: (_keys, fn) => fn({ effect: (f) => f(), commands: { register: (spec) => { commands[spec.name] = spec; } } }),
  };
  apply(ctx, config);
  const emit = (session, type, data) => handler?.(session, { type, data, time: new Date().toISOString() });
  const settle = () => new Promise((r) => setTimeout(r, 15));
  return { runs, emit, settle, commands, provided, hasListener: () => Boolean(handler) };
}
const top = { id: 's1', header: { cwd: '/Users/me/projects/my-app' } };
const child = { id: 's2', header: { cwd: '/x/y', origin: 'subagent', parentSession: 's1', delegationDepth: 1 } };
const rule = (extra = {}) => ({ id: 'r1', on: 'turnEnd', command: ['notifier', '--text', '{message}'], minIntervalSeconds: 0, ...extra });

test('helpers: strict, light, messageFor, fill', () => {
  assert.equal(strict('my "app"; rm -rf ~ $(x) `y`'), 'my ?app?? rm -rf ? ?(x) ?y?');
  assert.equal(strict('a'.repeat(500)).length, 120);
  assert.equal(light('a\nb\u0007c').includes('\n'), false);
  assert.equal(messageFor({ event: 'turnEnd', reason: 'completed', project: 'p' }), 'Finished in p');
  assert.equal(messageFor({ event: 'turnEnd', reason: 'error' }), 'Stopped with an error');
  assert.equal(messageFor({ event: 'approval', tool: 'bash', project: 'p' }), 'Waiting for your approval (bash) in p');
  assert.equal(fill('{event}:{tool}:{nope}', { event: 'e', tool: 't' }), 'e:t:{nope}');
});

test('config checks', () => {
  assert.throws(() => checkRules([{ id: 'a', on: 'turnEnd', command: [] }]), /non-empty/);
  assert.throws(() => checkRules([{ id: 'a', on: 'turnEnd', command: [' '] }]), /non-empty/);
  assert.throws(() => checkRules([{ id: 'a', on: 'turnEnd', command: ['x'], reasons: ['done'] }]), /unknown reason/);
  assert.throws(() => checkRules([{ id: 'a', on: 'turnEnd', command: ['x'] }, { id: 'a', on: 'approval', command: ['x'] }]), /duplicate/);
});

test('inert with no rules: no listener at all', () => {
  const h = harness({});
  assert.equal(h.hasListener(), false);
});

test('turn end: runs the command without a shell, message in args and env', async () => {
  const h = harness({ rules: [rule()] });
  h.emit(top, 'turn/start', { turn: 1 });
  h.emit(top, 'turn/end', { turn: 1, reason: { kind: 'completed' } });
  await h.settle();
  assert.equal(h.runs.length, 1);
  assert.equal(h.runs[0].file, 'notifier');
  assert.deepEqual(h.runs[0].args, ['--text', 'Finished in my-app']);
  assert.equal(h.runs[0].env.DSH_NOTIFY_MESSAGE, 'Finished in my-app');
  assert.equal(h.runs[0].env.DSH_NOTIFY_PROJECT, 'my-app');
});

test('reasons filter; default is completed and error', async () => {
  const h = harness({ rules: [rule()] });
  for (const kind of ['aborted', 'blocked', 'interrupted', 'completed', 'error']) h.emit(top, 'turn/end', { reason: { kind } });
  await h.settle();
  assert.deepEqual(h.runs.map((r) => r.env.DSH_NOTIFY_REASON), ['completed', 'error']);
  const h2 = harness({ rules: [rule({ reasons: ['aborted'] })] });
  h2.emit(top, 'turn/end', { reason: { kind: 'completed' } });
  h2.emit(top, 'turn/end', { reason: { kind: 'aborted' } });
  await h2.settle();
  assert.equal(h2.runs.length, 1);
});

test('minSeconds skips short turns', async () => {
  const h = harness({ rules: [rule({ minSeconds: 30 })] });
  h.emit(top, 'turn/start', { turn: 1 });
  h.emit(top, 'turn/end', { reason: { kind: 'completed' } });
  await h.settle();
  assert.equal(h.runs.length, 0);
});

test('sub-agent sessions are ignored unless topLevelOnly is false', async () => {
  const h = harness({ rules: [rule()] });
  h.emit(child, 'turn/end', { reason: { kind: 'completed' } });
  await h.settle();
  assert.equal(h.runs.length, 0);
  const h2 = harness({ rules: [rule({ topLevelOnly: false })] });
  h2.emit(child, 'turn/end', { reason: { kind: 'completed' } });
  await h2.settle();
  assert.equal(h2.runs.length, 1);
});

test('approval: fires on approval/asked with the tool name', async () => {
  const h = harness({ rules: [rule({ id: 'a', on: 'approval' })] });
  h.emit(top, 'approval/asked', { id: 'x', toolName: 'bash', reason: 'secret reason text' });
  h.emit(top, 'turn/end', { reason: { kind: 'completed' } });
  await h.settle();
  assert.equal(h.runs.length, 1);
  assert.equal(h.runs[0].env.DSH_NOTIFY_TOOL, 'bash');
  assert.ok(!JSON.stringify(h.runs[0]).includes('secret reason text'), 'the approval reason is not passed on');
});

test('hostile values cannot inject into arguments', async () => {
  const h = harness({ rules: [{ id: 'a', on: 'approval', command: ['osascript', '-e', 'display notification "{message}" with title "{tool}"'], minIntervalSeconds: 0 }] });
  h.emit({ id: 's1', header: { cwd: '/tmp/x" & do shell script "evil' } }, 'approval/asked', { toolName: 'a"; do shell script "evil' });
  await h.settle();
  const script = h.runs[0].args[1];
  assert.ok(!/["]\s*&|do shell script "evil/.test(script.replace(/^display notification "|" with title "|"$/g, '')) || !script.includes('"evil'), script);
  assert.equal((script.match(/"/g) ?? []).length, 4, 'only the four quotes of the template remain');
});

test('rate limits: per-rule interval and per-minute cap; failures never throw', async () => {
  const h = harness({ rules: [rule({ minIntervalSeconds: 60 })] });
  h.emit(top, 'turn/end', { reason: { kind: 'completed' } });
  h.emit(top, 'turn/end', { reason: { kind: 'completed' } });
  await h.settle();
  assert.equal(h.runs.length, 1);
  const h2 = harness({ rules: [rule()], maxPerMinute: 3 });
  for (let i = 0; i < 6; i += 1) h2.emit(top, 'turn/end', { reason: { kind: 'completed' } });
  await h2.settle();
  assert.equal(h2.runs.length, 3);
  assert.equal(h2.provided.notify.stats().skippedRate, 3);
});

test('a failing or slow command never blocks the event handler', async () => {
  const failing = harness({ rules: [rule()] }, { fail: true });
  failing.emit(top, 'turn/end', { reason: { kind: 'completed' } });
  await failing.settle();
  assert.equal(failing.provided.notify.stats().failed, 1);
  assert.equal(failing.provided.notify.stats().lastError, 'ENOENT');
  const slow = harness({ rules: [rule()] }, { delay: 300 });
  const t0 = Date.now();
  slow.emit(top, 'turn/end', { reason: { kind: 'completed' } });
  assert.ok(Date.now() - t0 < 50);
});

test('replayed history is ignored', async () => {
  const h = harness({ rules: [rule()] });
  const old = new Date(Date.now() - 3600000).toISOString();
  // emit with an old timestamp
  let handlerCalls = 0;
  void handlerCalls;
  const ctx2 = { on: (e, fn) => fn({ id: 's' }, { type: 'turn/end', data: { reason: { kind: 'completed' } }, time: old }), effect: (f) => f(), provide() {}, inject() {} };
  const runs = [];
  hooks.run = async (...a) => { runs.push(a); };
  apply(ctx2, { rules: [rule()] });
  await h.settle();
  assert.equal(runs.length, 0);
});

test('/notify test fires ignoring limits; /notify shows status', async () => {
  const h = harness({ rules: [rule({ minIntervalSeconds: 3600 }), { id: 'r2', on: 'approval', command: ['x'] }] });
  const run = (text) => h.commands.notify.handler({ rawInput: text });
  assert.match((await run('')).text, /r1: on turnEnd \(completed\/error\)[\s\S]*r2: on approval/);
  assert.match((await run('test r1')).text, /Started 1/);
  assert.match((await run('test r1')).text, /Started 1/);
  assert.match((await run('test')).text, /Started 2/);
  await h.settle();
  assert.equal(h.runs.length, 4);
  assert.equal((await run('test nope')).kind, 'error');
  assert.equal((await run('wat')).kind, 'error');
  assert.match((await harness({}).commands.notify.handler({ rawInput: '' })).text, /No notification rules/);
});
