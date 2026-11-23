// delegate_role, review_lanes and run_pipeline inside a program (the app's PTC preset): each shortens
// itself to end before the program's time limit, keeps everything its helpers found, and says plainly
// why and how to get a full run. Outside a program nothing changes.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { apply } from '../index.js';
import { SAFETY_MS, SALVAGE_MS, MIN_RUN_MS } from '../lib/program-time.js';

const RUNTIME = { defaultMs: 120_000, maxMs: 600_000 };
const CONFIG = {
  activeTiers: { parent: { tier: 'sonnet', provider: 'p', model: 'm' } },
  roleModels: {
    sonnet: {
      plan: { provider: 'rp', model: 'plan-model' },
      implement: { provider: 'rp', model: 'impl-model' },
      review: { provider: 'rp', model: 'review-model' },
      fast: { provider: 'rp', model: 'fast-model' },
    },
  },
};

/**
 * A fake app: the tool pipeline's two events, a program runtime, and helpers that answer when the
 * test says. `onStop`: what a stopped helper hands back ('half': an unfinished answer, as the app's
 * does; 'empty': a stop with nothing written; 'silent': nothing at all).
 */
function harness({ onStop = 'half', runtime = RUNTIME } = {}) {
  const listeners = {};
  const tools = {};
  const children = [];
  const subagents = {
    async startActivation(spec) {
      let resolve;
      const result = new Promise((r) => { resolve = r; });
      const child = { childId: `child-${children.length + 1}`, label: spec.label, prompt: spec.prompt?.[0]?.text ?? '', model: spec.agentOptions?.model, resolve };
      children.push(child);
      return {
        childId: child.childId,
        result,
        dispose: async () => {
          child.disposed = true;
          if (onStop === 'half') resolve({ output: [{ type: 'text', text: `half of ${child.childId}` }], stopReason: 'cancelled' });
          if (onStop === 'empty') resolve({ output: [], stopReason: 'cancelled' });
        },
      };
    },
    async listDescendants() { return []; },
  };
  const ctx = {
    get: (key) => ({ subagents, ptcRuntime: runtime ? { timeout: runtime } : undefined })[key],
    on: (event, fn) => { (listeners[event] ??= []).push(fn); },
    effect: (fn) => fn(),
    tools: { register: (tool) => { tools[tool.name] = tool; } },
    inject: () => {},
    provide: () => {},
    logger: { info() {}, warn() {} },
  };
  apply(ctx, structuredClone(CONFIG));
  /** The app dispatches a program: the tool pipeline's around-dispatch hooks (tools/execute) see it. */
  const program = async (callId, timeoutMs) => {
    const exec = { name: 'run_code', callId, arguments: { code: 'await tools.x()', description: 'd', ...(timeoutMs ? { timeoutMs } : {}) } };
    for (const fn of listeners['tools/execute'] ?? []) await fn(exec, async () => ({ kind: 'allow' }));
    return exec;
  };
  const programEnded = (exec) => { for (const fn of listeners['tools/result'] ?? []) fn(exec, { isError: false }); };
  const controller = new AbortController();
  const execute = (name, args, callId = 'call-1') =>
    tools[name].execute(args, { agent: { id: 'parent', model: { current: () => ({ provider: 'p', model: 'm' }) } }, callId, signal: controller.signal });
  const finish = (index, text = `full answer ${index + 1}`) => children[index].resolve({ output: [{ type: 'text', text }], stopReason: 'completed' });
  return { listeners, tools, children, program, programEnded, execute, finish, cancel: () => controller.abort(new Error('Cancelled by the user.')) };
}

/** Let promises settle (setImmediate is left real while timers and Date are mocked). */
const settle = async (n = 10) => { for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r)); };

test.beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 }));
test.afterEach(() => mock.timers.reset());

// ---------- the shared helper ----------

test('the time helper is the same code as run_swarm\'s (a copy with a header naming its source)', () => {
  const own = readFileSync(new URL('../lib/program-time.js', import.meta.url), 'utf8');
  assert.match(own.split('\n')[0], /Copied from dsh-agent-swarm\/lib\/program-time\.js/);
  const source = new URL('../../dsh-agent-swarm/lib/program-time.js', import.meta.url);
  if (!existsSync(source)) return; // an installed copy ships alone
  assert.equal(own.split('\n').slice(3).join('\n'), readFileSync(source, 'utf8'), 'change both copies together');
});

test('every helper tool tells the model how it behaves inside a program', () => {
  const h = harness();
  for (const name of ['delegate_role', 'review_lanes', 'run_pipeline']) {
    assert.match(h.tools[name].description, /inside a program \(PTC\), it shortens itself/, name);
    assert.match(h.tools[name].description, /timeoutMs 600000, or use the Standard preset/, name);
  }
});

test('the program watch never breaks a tool call', async () => {
  const h = harness();
  for (const fn of h.listeners['tools/execute']) {
    assert.deepEqual(await fn({ name: 'run_code', callId: 'x', arguments: 'not an object' }, async () => ({ kind: 'deny' })), { kind: 'deny' });
  }
  for (const fn of h.listeners['tools/result']) assert.doesNotThrow(() => fn(undefined));
});

// ---------- delegate_role ----------

test('delegate_role outside a program: nothing changes, no PTC note', async () => {
  const h = harness();
  const run = h.execute('delegate_role', { role: 'plan', prompt: 'make a plan' });
  await settle();
  h.finish(0);
  const out = await run;
  assert.equal(out.text, 'full answer 1');
  assert.equal(out.ptc, undefined);
  assert.equal(h.children[0].model, 'plan-model');
});

test('delegate_role inside a program with time to spare keeps its own limit', async () => {
  const h = harness();
  await h.program('prog-1', 600_000);
  const run = h.execute('delegate_role', { role: 'plan', prompt: 'make a plan' }, 'prog-1:ptc:1');
  await settle();
  h.finish(0);
  const out = await run;
  assert.equal(out.text, 'full answer 1');
  assert.deepEqual({ ...out.ptc }, { limitMs: 600_000, budgetMs: 600_000 - SAFETY_MS, exact: true, shortened: true, cut: false, started: true });
});

test('delegate_role inside a 2-minute program stops in time and keeps the unfinished answer', async () => {
  const h = harness();
  await h.program('prog-1');
  mock.timers.tick(10_000); // the program already ran 10 s
  const run = h.execute('delegate_role', { role: 'plan', prompt: 'make a plan' }, 'prog-1:ptc:1');
  await settle();
  mock.timers.tick(90_000); // 120 s limit, 10 s gone, 20 s kept back
  await settle();
  const out = await run;
  assert.equal(h.children[0].disposed, true, 'the helper is stopped');
  assert.match(out.text, /^Shortened to fit PTC: delegate_role ran inside a program/);
  assert.match(out.text, /2 minutes for this program; 10 minutes at most\)\. So it had about 1\.5 minutes/);
  assert.match(out.text, /Standard preset/);
  assert.match(out.text, /timeoutMs set higher/);
  assert.match(out.text, /\(cut short by the program's time limit; unfinished answer\)\nhalf of child-1$/);
  assert.equal(out.childId, 'child-1');
  assert.deepEqual({ ...out.ptc }, { limitMs: 120_000, budgetMs: 90_000, exact: true, shortened: true, cut: true, started: true });
});

test('delegate_role implement stopped with nothing written: a plain note, no error, and a word about the workspace', async () => {
  const h = harness({ onStop: 'silent' });
  await h.program('prog-1');
  const run = h.execute('delegate_role', { role: 'implement', prompt: 'change it' }, 'prog-1:ptc:1');
  await settle();
  mock.timers.tick(100_000);
  await settle();
  mock.timers.tick(SALVAGE_MS); // the short wait for an unfinished answer runs out
  await settle();
  const out = await run;
  assert.match(out.text, /^Shortened to fit PTC: delegate_role/);
  assert.match(out.text, /\(not answered: the program's time limit came first\. The workspace may hold part of its changes\.\)$/);
  assert.equal(out.ptc.cut, true);
});

test('delegate_role with too little program time left does not start and says why', async () => {
  const h = harness();
  await h.program('prog-1');
  mock.timers.tick(90_000); // 30 s left
  const out = await h.execute('delegate_role', { role: 'plan', prompt: 'make a plan' }, 'prog-1:ptc:1');
  assert.equal(h.children.length, 0, 'nothing was started');
  assert.match(out.text, /^Not started: delegate_role was called inside a program \(PTC\), and only 30 seconds were left/);
  assert.match(out.text, /Nothing was spent\./);
  assert.equal(out.childId, '');
  assert.equal(out.ptc.started, false);
});

test('a cancel inside a program stays a cancel: no PTC note, nothing waited for', async () => {
  const silent = harness({ onStop: 'silent' });
  await silent.program('prog-1');
  const stopped = silent.execute('delegate_role', { role: 'plan', prompt: 'make a plan' }, 'prog-1:ptc:1');
  await settle();
  silent.cancel();
  await assert.rejects(stopped, /Cancelled by the user/);
  // A helper that hands text back as it is stopped: returned as before, without the PTC note.
  const h = harness();
  await h.program('prog-1');
  const run = h.execute('delegate_role', { role: 'plan', prompt: 'make a plan' }, 'prog-1:ptc:1');
  await settle();
  h.cancel();
  const out = await run;
  assert.doesNotMatch(out.text, /Shortened|time limit/);
  assert.equal(out.ptc.cut, false);
});

test('a program whose start was not seen is planned against the longest a program may run', async () => {
  const h = harness();
  const exec = await h.program('prog-1', 300_000);
  h.programEnded(exec); // forgotten
  const run = h.execute('delegate_role', { role: 'fast', prompt: 'check' }, 'prog-1:ptc:1');
  await settle();
  h.finish(0);
  const out = await run;
  assert.equal(out.ptc.exact, false);
  assert.equal(out.ptc.limitMs, 600_000);
  assert.equal(out.ptc.budgetMs, 600_000 - SAFETY_MS, 'under the tool\'s own 15 minutes');
  assert.equal(out.ptc.cut, false);
  assert.doesNotMatch(out.text, /Shortened/);
});

// ---------- review_lanes ----------

test('review_lanes outside a program: nothing changes', async () => {
  const h = harness();
  const run = h.execute('review_lanes', { target: 'the diff' });
  await settle();
  h.finish(0); h.finish(1); h.finish(2);
  const out = await run;
  assert.doesNotMatch(out.summary, /PTC|time limit/);
  assert.equal(out.ptc, undefined);
  assert.equal(out.lanes.length, 3);
});

test('review_lanes inside a 2-minute program keeps finished and unfinished lanes', async () => {
  const h = harness();
  await h.program('prog-1');
  const run = h.execute('review_lanes', { target: 'the diff' }, 'prog-1:ptc:1');
  await settle();
  assert.equal(h.children.length, 3);
  h.finish(0, 'no correctness issues');
  await settle();
  mock.timers.tick(100_000);
  await settle();
  const out = await run;
  assert.match(out.summary, /^### Review lanes \([^)]+\)\n\nShortened to fit PTC: review_lanes ran inside a program/);
  assert.match(out.summary, /1 of 3 lanes finished\./);
  assert.match(out.summary, /no correctness issues/, 'the finished lane is kept');
  assert.match(out.summary, /\(cut short by the program's time limit; unfinished answer\)\nhalf of child-2/);
  assert.match(out.summary, /\(cut short by the program's time limit; unfinished answer\)\nhalf of child-3/);
  assert.deepEqual(out.lanes.map((lane) => Boolean(lane.partial)), [false, true, true]);
  assert.equal(out.ptc.cut, true);
});

test('review_lanes: a lane stopped with nothing written is "not answered", the others are kept', async () => {
  const h = harness({ onStop: 'empty' });
  await h.program('prog-1');
  const run = h.execute('review_lanes', { target: 'the diff', angles: ['security', 'tests'] }, 'prog-1:ptc:1');
  await settle();
  h.finish(0, 'security is fine');
  await settle();
  mock.timers.tick(100_000);
  await settle();
  const out = await run;
  assert.match(out.summary, /security is fine/);
  assert.match(out.summary, /#### [^\n]+\n\(not answered: the program's time limit came first\)/);
  assert.match(out.summary, /1 of 2 lanes finished\./);
  assert.equal(out.lanes[1].cut, true);
  assert.equal(out.lanes[1].error, undefined, 'not reported as a failure');
});

test('review_lanes with too little program time left does not start', async () => {
  const h = harness();
  await h.program('prog-1');
  mock.timers.tick(100_000);
  const out = await h.execute('review_lanes', { target: 'the diff' }, 'prog-1:ptc:1');
  assert.equal(h.children.length, 0);
  assert.match(out.summary, /^Not started: review_lanes was called inside a program/);
  assert.deepEqual(out.lanes, []);
});

// ---------- run_pipeline ----------

test('run_pipeline outside a program: three steps, no PTC note', async () => {
  const h = harness();
  const run = h.execute('run_pipeline', { task: 'build it' });
  await settle();
  h.finish(0, 'the plan');
  await settle();
  h.finish(1, 'the change');
  await settle();
  h.finish(2, 'looks right');
  const out = await run;
  assert.doesNotMatch(out.summary, /PTC|time limit/);
  assert.equal(out.ptc, undefined);
  assert.deepEqual([out.plan, out.implementation, out.review], ['the plan', 'the change', 'looks right']);
  assert.deepEqual([out.planChildId, out.implementChildId, out.reviewChildId], ['child-1', 'child-2', 'child-3']);
});

test('run_pipeline cut during Implement keeps the plan and the unfinished report, and does not start Review', async () => {
  const h = harness();
  await h.program('prog-1');
  const run = h.execute('run_pipeline', { task: 'build it' }, 'prog-1:ptc:1');
  await settle();
  h.finish(0, 'the plan');
  await settle();
  mock.timers.tick(100_000);
  await settle();
  const out = await run;
  assert.equal(h.children.length, 2, 'Review was not started');
  assert.match(out.summary, /Shortened to fit PTC: run_pipeline ran inside a program/);
  assert.match(out.summary, /1 of 3 steps finished\./);
  assert.match(out.summary, /#### Plan\nthe plan/);
  assert.match(out.summary, /#### Implement\n\(cut short by the program's time limit; unfinished report\. The workspace may hold part of its changes\.\)\nhalf of child-2/);
  assert.match(out.summary, /#### Review\n\(not started: the program's time limit came first\)/);
  assert.equal(out.plan, 'the plan');
  assert.equal(out.implementation, 'half of child-2');
  assert.equal(out.ptc.cut, true);
});

test('run_pipeline does not start the next step with too little time left', async () => {
  const h = harness();
  await h.program('prog-1');
  const run = h.execute('run_pipeline', { task: 'build it', review: false }, 'prog-1:ptc:1');
  await settle();
  mock.timers.tick(100_000 - MIN_RUN_MS + 1000); // under 15 s of the 100 s left
  h.finish(0, 'the plan');
  await settle();
  const out = await run;
  assert.equal(h.children.length, 1, 'Implement was not started');
  assert.match(out.summary, /1 of 2 steps finished\./);
  assert.match(out.summary, /#### Implement\n\(not started: the program's time limit came first\)/);
  assert.match(out.summary, /#### Review\nSkipped: no Review role configured or review disabled\./);
  assert.equal(out.implementChildId, undefined);
});

test('run_pipeline with too little program time left does not start', async () => {
  const h = harness();
  await h.program('prog-1', 60_000);
  mock.timers.tick(30_000); // 30 s left of a 1-minute program: 10 s after the 20 s margin, too little
  const out = await h.execute('run_pipeline', { task: 'build it' }, 'prog-1:ptc:1');
  assert.equal(h.children.length, 0);
  assert.match(out.summary, /^Not started: run_pipeline was called inside a program \(PTC\), and only 30 seconds were left/);
  assert.equal(out.ptc.started, false);
});
