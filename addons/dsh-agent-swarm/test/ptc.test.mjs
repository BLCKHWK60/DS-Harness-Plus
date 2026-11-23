// run_swarm inside a program (the app's PTC preset): it shortens itself to end before the program's
// time limit, keeps every answer it has, and says plainly why and how to get a full run.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { apply, STATE_PATH } from '../index.js';
import {
  insideProgram,
  programCallId,
  programLimitMs,
  createProgramClock,
  timeBudget,
  shortenedNote,
  plainDuration,
  SAFETY_MS,
  SALVAGE_MS,
  MIN_RUN_MS,
  APP_DEFAULT_MS,
  APP_MAX_MS,
} from '../lib/program-time.js';

// ---------- the time helpers on their own ----------

test('a call from a program is told by its :ptc: call id, and names its program', () => {
  assert.equal(insideProgram('call_1:ptc:3'), true);
  assert.equal(insideProgram('call_1'), false);
  assert.equal(insideProgram(undefined), false);
  assert.equal(programCallId('call_1:ptc:3'), 'call_1');
  assert.equal(programCallId('a:ptc:1:ptc:2'), 'a:ptc:1', 'the nearest program');
  assert.equal(programCallId('call_1'), '');
});

test('a program\'s limit is what it asked for, or the default, never above the maximum', () => {
  const runtime = { defaultMs: 120_000, maxMs: 600_000 };
  assert.equal(programLimitMs(undefined, runtime), 120_000);
  assert.equal(programLimitMs(300_000, runtime), 300_000);
  assert.equal(programLimitMs(9_000_000, runtime), 600_000);
  assert.equal(programLimitMs(0, runtime), 120_000, 'zero does not switch the limit off');
  assert.equal(programLimitMs(undefined, undefined), APP_DEFAULT_MS, 'the app\'s own default when the runtime does not say');
  assert.equal(programLimitMs(9_000_000, undefined), APP_MAX_MS);
});

test('the clock knows how much of a seen program is left, and falls back to the maximum otherwise', () => {
  let now = 1_000;
  const clock = createProgramClock({ now: () => now });
  const runtime = { defaultMs: 120_000, maxMs: 600_000 };
  clock.seen({ name: 'run_code', callId: 'p1', arguments: { code: 'x', timeoutMs: 300_000 } }, runtime);
  clock.seen({ name: 'read_file', callId: 'r1', arguments: {} }, runtime);
  assert.equal(clock.size(), 1, 'only programs are noted');
  now += 100_000;
  assert.deepEqual(clock.windowFor('p1:ptc:1', runtime), { limitMs: 300_000, remainingMs: 200_000, exact: true });
  assert.equal(clock.windowFor('p1', runtime), null, 'the program itself is no call from a program');
  // Not seen: Deep research's way, the longest a program may run.
  assert.deepEqual(clock.windowFor('other:ptc:1', runtime), { limitMs: 600_000, remainingMs: 600_000, exact: false });
  assert.deepEqual(clock.windowFor('other:ptc:1', undefined), { limitMs: APP_MAX_MS, remainingMs: APP_MAX_MS, exact: false });
  now += 999_999;
  assert.equal(clock.windowFor('p1:ptc:2', runtime).remainingMs, 0, 'never below zero');
  clock.done({ name: 'run_code', callId: 'p1' });
  assert.equal(clock.size(), 0);
  assert.equal(clock.windowFor('p1:ptc:3', runtime).exact, false, 'a finished program is forgotten');
});

test('the clock never grows without end', () => {
  const clock = createProgramClock();
  for (let i = 0; i < 250; i += 1) clock.seen({ name: 'run_code', callId: `p${i}`, arguments: {} });
  assert.equal(clock.size(), 200);
  assert.equal(clock.windowFor('p0:ptc:1').exact, false, 'the oldest went first');
  assert.equal(clock.windowFor('p249:ptc:1').exact, true);
});

test('the budget is shortened only when the program has less time than the tool would take', () => {
  assert.deepEqual(timeBudget({ ownMs: 300_000, window: null }), { ms: 300_000, shortened: false, tooShort: false });
  assert.deepEqual(timeBudget({ ownMs: 300_000, window: { remainingMs: 600_000 } }), { ms: 300_000, shortened: false, tooShort: false });
  assert.deepEqual(timeBudget({ ownMs: 300_000, window: { remainingMs: 120_000 } }), { ms: 120_000 - SAFETY_MS, shortened: true, tooShort: false });
  const tight = timeBudget({ ownMs: 300_000, window: { remainingMs: SAFETY_MS + MIN_RUN_MS - 1 } });
  assert.equal(tight.shortened, true);
  assert.equal(tight.tooShort, true);
  assert.equal(timeBudget({ ownMs: 300_000, window: { remainingMs: 0 } }).ms, 0);
  assert.ok(SALVAGE_MS < SAFETY_MS, 'waiting for an unfinished answer fits inside the safety margin');
});

test('the notes are plain and say how to get a full run', () => {
  assert.equal(plainDuration(1000), '1 second');
  assert.equal(plainDuration(45_000), '45 seconds');
  assert.equal(plainDuration(120_000), '2 minutes');
  assert.equal(plainDuration(210_000), 'about 3.5 minutes');
  const cut = shortenedNote({ tool: 'run_swarm', limitMs: 120_000, budgetMs: 100_000, finished: 1, total: 3, unit: 'members answered in full' });
  assert.match(cut, /^Shortened to fit PTC: run_swarm ran inside a program/);
  assert.match(cut, /2 minutes for this program; 10 minutes at most/);
  assert.match(cut, /1 of 3 members answered in full\./);
  assert.match(cut, /Everything found so far is below\./);
  assert.match(cut, /Standard preset/);
  assert.match(cut, /timeoutMs set higher \(600000, which is 10 minutes, at most\)/);
  const none = shortenedNote({ tool: 'delegate_role', limitMs: 120_000, budgetMs: 0, tooShort: true, leftMs: 30_000 });
  assert.match(none, /^Not started: delegate_role was called inside a program \(PTC\), and only 30 seconds were left/);
  assert.match(none, /Nothing was spent\./);
  assert.match(none, /Standard preset/);
});

// ---------- run_swarm inside a program ----------

const swarm = (over = {}) => ({
  description: '',
  strategy: 'fanout',
  rounds: 2,
  maxActive: 2,
  maxMinutes: 5,
  budget: { tokens: 0, usd: 0 },
  members: [
    { id: 'a', provider: 'prov-a', model: 'model-a', instructions: '' },
    { id: 'b', provider: 'prov-b', model: 'model-b', instructions: '' },
  ],
  ...over,
});
const cfg = (swarms) => ({ enabled: true, toolName: 'run_swarm', swarms, pricing: {}, defaultSwarmByMode: {}, onRouteDown: 'rebind' });
const RUNTIME = { defaultMs: 120_000, maxMs: 600_000 };

/**
 * A fake app: the tool pipeline's two events, a program runtime, and children that answer when the
 * test says. `partialOnStop`: a stopped child hands back an unfinished answer, as the app's does.
 */
function harness(config, { partialOnStop = true, emptyOnStop = false, runtime = RUNTIME } = {}) {
  const listeners = {};
  const tools = {};
  const routes = {};
  const children = [];
  const subagents = {
    async startActivation(spec) {
      let resolve;
      const result = new Promise((r) => { resolve = r; });
      const child = { childId: `child-${children.length + 1}`, label: spec.label, prompt: spec.prompt?.[0]?.text ?? '', resolve };
      children.push(child);
      return {
        childId: child.childId,
        result,
        dispose: async () => {
          child.disposed = true;
          if (emptyOnStop) resolve({ output: [], stopReason: 'cancelled' });
          else if (partialOnStop) resolve({ output: [{ type: 'text', text: `half of ${child.childId}` }], stopReason: 'cancelled' });
        },
      };
    },
  };
  const ctx = {
    get: (key) => ({ subagents, ptcRuntime: runtime ? { timeout: runtime } : undefined })[key],
    on: (event, fn) => { (listeners[event] ??= []).push(fn); },
    effect: (fn) => fn(),
    tools: { register: (tool) => { tools[tool.name] = tool; } },
    inject: (_keys, fn) => fn({
      effect: (f) => f(),
      modelTiers: { registerSubagentTool: () => {} },
      webServer: { register: (spec) => { routes[spec.path] = spec.handler; } },
      connection: { requestRejection: () => undefined },
    }),
  };
  apply(ctx, config);
  /** The app dispatches a program: the tool pipeline's around-dispatch hook (tools/execute) sees it. */
  const program = async (callId, timeoutMs) => {
    const exec = { name: 'run_code', callId, arguments: { code: 'await tools.run_swarm(...)', description: 'd', ...(timeoutMs ? { timeoutMs } : {}) } };
    let reached = false;
    for (const fn of listeners['tools/execute'] ?? []) await fn(exec, async () => { reached = true; return { kind: 'allow' }; });
    assert.equal(reached, true, 'the hook always passes the call on');
    return exec;
  };
  const programEnded = (exec) => { for (const fn of listeners['tools/result'] ?? []) fn(exec, { isError: false }); };
  const controller = new AbortController();
  const execute = (args, callId = 'call-1') =>
    tools.run_swarm.execute(args, { agent: { id: 'parent', model: { current: () => ({ provider: 'p', model: 'm' }) } }, callId, signal: controller.signal });
  const finish = (index, text = `full answer ${index + 1}`) => children[index].resolve({ output: [{ type: 'text', text }], stopReason: 'completed' });
  const state = () => {
    const res = { statusCode: 0, setHeader() {}, end(body) { this.body = body; } };
    routes[STATE_PATH]({ method: 'GET', url: STATE_PATH }, res);
    return JSON.parse(res.body);
  };
  return { listeners, tools, children, program, programEnded, execute, finish, state, cancel: () => controller.abort(new Error('Cancelled by the user.')) };
}

/** Let promises settle (setImmediate is left real while timers and Date are mocked). */
const settle = async (n = 8) => { for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r)); };

test.beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 }));
test.afterEach(() => mock.timers.reset());

test('outside a program nothing changes: no PTC note, no PTC record', async () => {
  const h = harness(cfg({ duo: swarm() }));
  const run = h.execute({ swarm: 'duo', task: 'a task' }, 'call-1');
  await settle();
  h.finish(0); h.finish(1);
  const out = await run;
  assert.doesNotMatch(out.text, /PTC/);
  assert.equal(out.stats.ptc, undefined);
  assert.equal(h.state().runs[0].ptc, null);
  assert.equal(h.state().runs[0].status, 'done');
});

test('inside a program with time to spare: the swarm keeps its own limit', async () => {
  const h = harness(cfg({ duo: swarm({ maxMinutes: 5 }) }));
  await h.program('prog-1', 600_000);
  const run = h.execute({ swarm: 'duo', task: 'a task' }, 'prog-1:ptc:1');
  await settle();
  h.finish(0); h.finish(1);
  const out = await run;
  assert.equal(out.stats.ptc.shortened, false);
  assert.equal(out.stats.ptc.cut, false);
  assert.equal(out.stats.ptc.budgetMs, 300_000);
  assert.doesNotMatch(out.text, /Shortened/);
});

test('inside a 2-minute program the swarm ends in time and keeps finished and unfinished answers', async () => {
  const h = harness(cfg({ duo: swarm({ maxMinutes: 5 }) }));
  await h.program('prog-1');
  mock.timers.tick(10_000); // the program already ran 10 s before it called the tool
  const run = h.execute({ swarm: 'duo', task: 'a task' }, 'prog-1:ptc:1');
  await settle();
  assert.equal(h.children.length, 2);
  h.finish(0);
  await settle();
  // 120 s limit, 10 s gone, 20 s kept back: 90 s for the swarm.
  mock.timers.tick(90_000);
  await settle();
  const out = await run;
  assert.equal(h.children[1].disposed, true, 'the unfinished member is stopped');
  assert.match(out.text, /^Shortened to fit PTC: run_swarm ran inside a program/m);
  assert.match(out.text, /2 minutes for this program/);
  assert.match(out.text, /1 of 2 members answered in full/);
  assert.match(out.text, /Standard preset/);
  assert.match(out.text, /full answer 1/, 'the finished answer is kept');
  assert.match(out.text, /cut short by the program's time limit; unfinished answer\)\nhalf of child-2/, 'the unfinished answer is kept too');
  assert.deepEqual({ ...out.stats.ptc }, { limitMs: 120_000, budgetMs: 90_000, exact: true, shortened: true, cut: true, started: true });
  const rec = h.state().runs[0];
  assert.equal(rec.status, 'shortened');
  assert.deepEqual(rec.members.map((m) => m.state), ['done', 'partial']);
  assert.equal(rec.ptc.cut, true);
});

test('time spent waiting for the owner\'s approval before a program is dispatched is not counted as program time', async () => {
  const h = harness(cfg({ duo: swarm({ maxMinutes: 5 }) }));
  const exec = { name: 'run_code', callId: 'prog-ask', arguments: { code: 'await tools.run_swarm(...)', description: 'd' } };
  // The tool pipeline's pre-execute stage and its "ask" approval: 90 s of waiting for the owner.
  for (const fn of h.listeners['tools/pre-execute'] ?? []) await fn(exec, async () => ({ kind: 'allow' }));
  mock.timers.tick(90_000);
  // Then the app dispatches the program, and its own 120 s limit starts.
  for (const fn of h.listeners['tools/execute'] ?? []) await fn(exec, async () => ({ kind: 'allow' }));
  const run = h.execute({ swarm: 'duo', task: 'a task' }, 'prog-ask:ptc:1');
  await settle();
  assert.equal(h.children.length, 2, 'both members start: the program still has nearly all its time');
  h.finish(0); h.finish(1);
  const out = await run;
  assert.equal(out.stats.ptc.budgetMs, 100_000, '120 s limit counted from dispatch, 20 s kept back');
});

test('a member stopped with nothing written is reported as not answered; the others are kept', async () => {
  const h = harness(cfg({ duo: swarm({ maxMinutes: 5 }) }), { partialOnStop: false });
  await h.program('prog-1');
  const run = h.execute({ swarm: 'duo', task: 'a task' }, 'prog-1:ptc:1');
  await settle();
  h.finish(0);
  await settle();
  mock.timers.tick(100_000);
  await settle();
  mock.timers.tick(SALVAGE_MS); // the short wait for an unfinished answer runs out
  await settle();
  const out = await run;
  assert.match(out.text, /full answer 1/);
  assert.match(out.text, /## b [^\n]*\n\(not answered: the program's time limit came first\)/);
  assert.match(out.text, /Shortened to fit PTC/);
  const rec = h.state().runs[0];
  assert.equal(rec.status, 'shortened');
  assert.deepEqual(rec.members.map((m) => [m.state, m.error]), [['done', ''], ['cancelled', '']]);
});

test('members that started but were stopped with nothing written are "not answered"; only one that never ran is "not started" (lab, item 7)', async () => {
  const trio = swarm({ maxMinutes: 5, maxActive: 2, members: [
    { id: 'planner', provider: 'prov-a', model: 'model-a', instructions: '' },
    { id: 'coder', provider: 'prov-b', model: 'model-b', instructions: '' },
    { id: 'reviewer', provider: 'prov-c', model: 'model-c', instructions: '' },
  ] });
  const h = harness(cfg({ trio }), { emptyOnStop: true });
  await h.program('prog-1');
  const run = h.execute({ swarm: 'trio', task: 'a task' }, 'prog-1:ptc:1');
  await settle();
  assert.equal(h.children.length, 2, 'cap 2: planner and coder run, reviewer waits');
  mock.timers.tick(100_000);
  await settle();
  mock.timers.tick(SALVAGE_MS);
  await settle();
  const out = await run;
  assert.match(out.text, /## planner [^\n]*\n\(not answered: the program's time limit came first\)/);
  assert.match(out.text, /## coder [^\n]*\n\(not answered: the program's time limit came first\)/);
  assert.match(out.text, /## reviewer [^\n]*\n\(not started: the program's time limit came first\)/);
  assert.match(out.text, /0 of 3 member\(s\) answered/);
  assert.deepEqual(h.state().runs[0].members.map((m) => m.state), ['cancelled', 'cancelled', 'cancelled']);
});

test('a pipeline does not start the next member with too little time left', async () => {
  const h = harness(cfg({ line: swarm({ strategy: 'pipeline', maxMinutes: 5 }) }));
  await h.program('prog-1');
  const run = h.execute({ swarm: 'line', task: 'a task' }, 'prog-1:ptc:1');
  await settle();
  mock.timers.tick(100_000 - MIN_RUN_MS + 1000); // under 15 s of the 100 s left
  h.finish(0);
  await settle();
  const out = await run;
  assert.equal(h.children.length, 1, 'the second member was not started');
  assert.match(out.text, /## b [^\n]*\n\(not started: the program's time limit came first\)/);
  assert.match(out.text, /1 of 2 members answered in full/);
  assert.equal(h.state().runs[0].status, 'shortened');
});

test('a debate member cut short in a later round keeps its full answer and adds the unfinished revision', async () => {
  const h = harness(cfg({ talk: swarm({ strategy: 'debate', rounds: 2, maxMinutes: 5 }) }));
  await h.program('prog-1');
  const run = h.execute({ swarm: 'talk', task: 'a task' }, 'prog-1:ptc:1');
  await settle();
  h.finish(0, 'round one a'); h.finish(1, 'round one b');
  await settle();
  mock.timers.tick(100_000);
  await settle();
  const out = await run;
  assert.match(out.text, /last full answer, then the unfinished revision\)\nround one a\n\nUnfinished revision:\nhalf of child-3/);
  assert.deepEqual(h.state().runs[0].members.map((m) => m.state), ['partial', 'partial']);
});

test('a debate member stopped in a later round keeps its last full answer', async () => {
  const h = harness(cfg({ talk: swarm({ strategy: 'debate', rounds: 2, maxMinutes: 5 }) }), { partialOnStop: false });
  await h.program('prog-1');
  const run = h.execute({ swarm: 'talk', task: 'a task' }, 'prog-1:ptc:1');
  await settle();
  h.finish(0, 'round one a'); h.finish(1, 'round one b');
  await settle();
  assert.equal(h.children.length, 4, 'round two started');
  mock.timers.tick(100_000);
  await settle();
  mock.timers.tick(SALVAGE_MS);
  await settle();
  const out = await run;
  assert.match(out.text, /last full answer\)\nround one a/);
  assert.match(out.text, /last full answer\)\nround one b/);
  assert.equal(h.state().runs[0].status, 'shortened');
});

test('with too little program time left it does not start, spends nothing and says why', async () => {
  const h = harness(cfg({ duo: swarm() }));
  await h.program('prog-1');
  mock.timers.tick(90_000); // 30 s left of 120 s
  const out = await h.execute({ swarm: 'duo', task: 'a task' }, 'prog-1:ptc:1');
  assert.equal(h.children.length, 0);
  assert.match(out.text, /^Not started: run_swarm was called inside a program \(PTC\), and only 30 seconds were left/);
  assert.match(out.text, /Standard preset/);
  assert.equal(out.stats.ptc.started, false);
});

test('a program whose start was not seen is planned against the longest a program may run', async () => {
  const h = harness(cfg({ duo: swarm({ maxMinutes: 20 }) }));
  const run = h.execute({ swarm: 'duo', task: 'a task' }, 'unseen:ptc:1');
  await settle();
  h.finish(0); h.finish(1);
  const out = await run;
  assert.equal(out.stats.ptc.exact, false);
  assert.equal(out.stats.ptc.limitMs, 600_000);
  assert.equal(out.stats.ptc.budgetMs, 600_000 - SAFETY_MS);
  assert.equal(out.stats.ptc.shortened, true);
  assert.equal(out.stats.ptc.cut, false, 'it finished in time: no note');
  assert.doesNotMatch(out.text, /Shortened/);
});

test('a program that ended is forgotten', async () => {
  const h = harness(cfg({ duo: swarm() }));
  const exec = await h.program('prog-1', 300_000);
  h.programEnded(exec);
  const run = h.execute({ swarm: 'duo', task: 'a task' }, 'prog-1:ptc:1');
  await settle();
  h.finish(0); h.finish(1);
  assert.equal((await run).stats.ptc.exact, false);
});

test('a cancel inside a program stays a cancel: no PTC note, nothing waited for', async () => {
  const h = harness(cfg({ duo: swarm() }));
  await h.program('prog-1');
  const run = h.execute({ swarm: 'duo', task: 'a task' }, 'prog-1:ptc:1');
  await settle();
  h.cancel();
  await settle();
  const out = await run;
  assert.doesNotMatch(out.text, /Shortened/);
  assert.match(out.text, /cancelled or ran out of time/);
  assert.equal(h.state().runs[0].status, 'cancelled');
});

test('the program watch never breaks a tool call', async () => {
  const h = harness(cfg({ duo: swarm() }));
  for (const fn of h.listeners['tools/execute']) {
    assert.deepEqual(await fn(null, async () => ({ kind: 'allow' })), { kind: 'allow' });
    assert.deepEqual(await fn({ name: 'run_code', callId: 'x', arguments: 'not an object' }, async () => ({ kind: 'deny' })), { kind: 'deny' });
  }
  for (const fn of h.listeners['tools/result']) assert.doesNotThrow(() => fn(undefined));
});

test('the tool tells the model how it behaves inside a program', () => {
  const h = harness(cfg({ duo: swarm() }));
  assert.match(h.tools.run_swarm.description, /inside a program \(PTC\), it shortens itself/);
  assert.match(h.tools.run_swarm.description, /timeoutMs 600000, or use the Standard preset/);
});

// ---------- the Settings page ----------

const CLIENT = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

/** Load the page with a stand-in React; state hooks start as the test says. */
function page(data) {
  let loaded;
  const win = { __ModuleLoader__: { load: (module) => { loaded = module; } } };
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
    Fragment: 'fragment',
    useState: (value) => [value && typeof value === 'object' && value.status === 'loading' ? { status: 'ready', data, at: 1 } : typeof value === 'string' ? data.runs[0]?.id ?? '' : value, () => {}],
    useEffect() {},
    useCallback: (fn) => fn,
    useRef: () => ({ current: null }),
  };
  new Function('window', 'document', CLIENT)(win, { baseURI: 'http://localhost/', hidden: false }); // eslint-disable-line no-new-func
  const plugin = loaded.factory((name) => (name === 'react' ? React : {}));
  let dict;
  let render;
  plugin.apply({
    locale: { register: (_ns, d) => { dict = d; return () => {}; }, bind: () => (key) => dict.en[key] ?? key },
    slots: { inject: (_n, fn) => fn(), register: (_entry, r) => { render = r; return () => {}; } },
    effect: (fn) => fn(),
  });
  /** Expand function components and collect the text. */
  const text = (node) => {
    if (node === null || node === undefined || node === false) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(text).join(' ');
    if (typeof node.type === 'function') return text(node.type({ ...node.props, children: node.children }));
    return (node.children ?? []).map(text).join(' ');
  };
  return { dict, text: text(render({})) };
}

const runRecord = (over) => ({
  id: 'r1', swarm: 'duo', strategy: 'fanout', rounds: 1, round: 1, status: 'shortened', stopped: null,
  startedAt: 1, endedAt: 2, maxActive: 2, maxObservedActive: 2, budget: { tokens: 0, usd: 0 }, tokens: 0, usd: 0,
  ptc: { limitMs: 120_000, budgetMs: 90_000, exact: true, shortened: true, cut: true },
  members: [
    { id: 'a', role: null, route: 'p/a', note: '', state: 'done', round: 1, startedAt: 1, endedAt: 2, tokens: 0, usd: 0, error: '' },
    { id: 'b', role: null, route: 'p/b', note: '', state: 'partial', round: 1, startedAt: 1, endedAt: 2, tokens: 0, usd: 0, error: '' },
  ],
  ...over,
});
const pageData = (run) => ({ at: 3, toolName: 'run_swarm', onRouteDown: 'rebind', pricing: false, swarms: [], runs: [run] });

test('the page has every new word in English, and no Chinese twin', () => {
  const { dict } = page(pageData(runRecord()));
  for (const key of ['status.shortened', 'state.partial', 'run.ptc.cut', 'run.ptc.fit']) {
    assert.ok(dict.en[key], `en ${key}`);
  }
  assert.equal(dict.zh, undefined);
});

test('a shortened run says why, keeps its answers and says how to get a full run', () => {
  const { text } = page(pageData(runRecord()));
  assert.match(text, /shortened \(PTC\)/);
  assert.match(text, /cut short/);
  assert.match(text, /Shortened to fit PTC: this run was called inside a program[^]*\(2 min; 10 minutes at most\)\. It had 90 s/);
  assert.match(text, /Every answer it had is kept/);
  assert.match(text, /Standard preset/);
});

test('a run that fit in time says so briefly; a run outside a program says nothing about PTC', () => {
  assert.match(page(pageData(runRecord({ status: 'done', ptc: { limitMs: 600_000, budgetMs: 580_000, exact: false, shortened: true, cut: false } }))).text, /finished in time/);
  assert.doesNotMatch(page(pageData(runRecord({ status: 'done', ptc: null }))).text, /PTC/);
});
