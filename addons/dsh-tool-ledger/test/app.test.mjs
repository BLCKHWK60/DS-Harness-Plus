// The whole add-on in a stand-in app: the tool pipeline (pre-execute and execute waterfalls, guards, the
// approval, tools/result) as the installed app 0.2.2-rc.2 runs it, the request/header session event, the
// services it reads (modes, toolAccess, agentPresets, mission, workspaceRegistry, coworkTrash) and its routes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply, Config } from '../index.js';

// The settings as the app gives them: Config values, the two volatile ones as live references.
function boot({ config = Config({}), before } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'tool-ledger-app-'));
  const handlers = new Map();
  const disposers = [];
  const provided = {};
  const routes = new Map();
  const erasedFns = [];
  const logs = [];
  const tabs = { s1: 'cowork', s2: 'chat', conductor: 'cowork' };
  const agents = new Map();
  const agent = (id, header = {}, defs = ['read', 'bash', 'tools_find']) => {
    const made = { id, defs, session: { id, header: { cwd: '/proj/sub', ...header }, preset: 'ptc' } };
    agents.set(id, made);
    return made;
  };
  const services = {
    modes: { get: (sid) => tabs[sid], list: () => [{ id: 'chat', label: 'Chat' }, { id: 'cowork', label: 'Cowork' }], spaces: { of: (sid) => (tabs[sid] ? 'chat' : undefined) } },
    toolAccess: { enabled: () => true, toolsOf: (tab) => [{ name: 'bash', plain: 'Run commands', state: tab === 'chat' ? 'off' : 'on' }, { name: 'read', plain: 'Read files', state: 'on' }] },
    agentPresets: { presetForSession: (session) => session?.preset },
    mission: {
      helperOf: (sid) => (sid === 'helper' ? { runId: 'run1', role: 'review', item: 3 } : undefined),
      runOf: (sid) => (sid === 'conductor' ? { runId: 'run1', kind: 'long' } : undefined),
    },
    agents: { get: (id) => agents.get(id) },
    workspaceRegistry: { list: () => [{ id: 'w1', path: '/proj' }, { id: 'w0', path: '/' }] },
    coworkTrash: { onErased: (fn) => { erasedFns.push(fn); return () => {}; } },
  };
  const inner = {
    effect: (make) => { const done = make(); if (typeof done === 'function') disposers.push(done); },
    webServer: { register: (route) => { routes.set(route.path, route.handler); return () => routes.delete(route.path); } },
    connection: { requestRejection: (req) => (req.cookie ? undefined : 401) },
    coworkTrash: services.coworkTrash,
  };
  const ctx = {
    logger: { warn: (text) => logs.push(text), info: (text) => logs.push(text) },
    get: (name) => (name === 'dshHomePath' ? (part) => join(home, part) : provided[name] ?? services[name]),
    on(name, fn, prepend) {
      const list = handlers.get(name) ?? [];
      if (prepend === true) list.unshift(fn);
      else list.push(fn);
      handlers.set(name, list);
    },
    effect: inner.effect,
    provide: (name, value) => { provided[name] = value; return () => delete provided[name]; },
    inject: (names, fn) => fn(inner),
    tools: { definitions: (who) => (who?.defs ?? []).map((name) => ({ name })) },
  };
  // Listeners of add-ons that loaded before this one (Modes, say) come first in the list.
  before?.(ctx, () => provided.toolLedger);
  apply(ctx, config);
  const waterfall = (name, args, last) => {
    const list = [...(handlers.get(name) ?? [])];
    const run = (i) => (i < list.length ? list[i](...args, () => run(i + 1)) : last());
    return run(0);
  };
  /**
   * One call through the pipeline, in the app's order: pre-execute, the approval for "ask", the guards,
   * execute around the body, then tools/result with the frozen call.
   */
  const call = async (exec, { body, guards = [], approval = 'rejected' } = {}) => {
    exec.signal ??= new AbortController().signal;
    let gate = await waterfall('tools/pre-execute', [exec], () => Promise.resolve({ kind: 'allow' }));
    if (gate.kind === 'ask') gate = approval === 'allowed-once' ? { kind: 'allow' } : { kind: 'deny', reason: 'no', info: { name: 'ApprovalError', code: 'APPROVAL_REJECTED' } };
    const denial = gate.kind === 'allow' ? guards.map((guard) => guard(exec)).find((one) => one !== undefined) : gate;
    let result;
    if (denial !== undefined) {
      const reason = typeof denial === 'string' ? denial : denial.reason;
      result = { isError: true, content: [{ type: 'text', text: `Error: ${reason}` }], error: { message: reason, ...(denial.info ? { info: denial.info } : {}) } };
    } else {
      result = await waterfall('tools/execute', [exec], () => Promise.resolve(body ? body() : { isError: false, content: [{ type: 'text', text: 'done' }] }));
    }
    Object.freeze(exec);
    for (const fn of handlers.get('tools/result') ?? []) fn(exec, result);
    return result;
  };
  const header = (session, names, time = Date.now()) => {
    for (const fn of handlers.get('session/event') ?? []) fn(session, { type: 'request/header', time, data: { header: { tools: names.map((name) => ({ name, description: 'secret description' })) } } });
  };
  const service = () => provided.toolLedger;
  const lines = () => {
    service().flush();
    const dir = join(home, 'tool-ledger');
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter((name) => name.endsWith('.jsonl')).flatMap((name) => readFileSync(join(dir, name), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)));
  };
  const raw = () => {
    service().flush();
    const dir = join(home, 'tool-ledger');
    return existsSync(dir) ? readdirSync(dir).map((name) => readFileSync(join(dir, name), 'utf8')).join('') : '';
  };
  const request = (path, { method = 'GET', cookie = true, body, type = 'application/json' } = {}) => new Promise((resolve) => {
    const [pathname] = path.split('?');
    const chunks = body === undefined ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))];
    const req = { method, url: path, cookie, headers: { 'content-type': type }, async *[Symbol.asyncIterator]() { yield* chunks; } };
    const res = { statusCode: 0, headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(text = '') { resolve({ status: this.statusCode, headers: this.headers, text: String(text) }); } };
    routes.get(pathname)(req, res);
  });
  const stop = () => {
    for (const done of disposers.splice(0)) done();
  };
  const close = () => {
    stop();
    rmSync(home, { recursive: true, force: true });
  };
  return { home, call, header, agent, service, lines, raw, request, erasedFns, ctx, config, logs, stop, close, handlers };
}

test('Config: on, one year, 30 to 3650 days', () => {
  const value = Config({});
  // Both are settings the page changes while the app runs (volatile): read through `get()`.
  assert.equal(value.enabled.get(), true);
  assert.equal(value.keepDays.get(), 365);
  assert.throws(() => Config({ keepDays: 10 }));
});

test('a call is recorded with its place, state and size, and never with what it was given or gave back', async () => {
  const app = boot();
  try {
    const s1 = app.agent('s1');
    await app.call({ callId: 'c1', name: 'bash', agent: s1, arguments: { command: 'echo SECRET-ARGUMENT' } }, { body: () => ({ isError: false, content: [{ type: 'text', text: 'RESULT-TEXT-12' }] }) });
    const [row] = app.lines();
    assert.equal(row.kind, 'call');
    assert.equal(row.sid, 's1');
    assert.equal(row.tab, 'cowork');
    assert.equal(row.space, 'chat', 'item 4A: the thread\'s space next to its mode');
    assert.equal(row.preset, 'ptc');
    assert.equal(row.ws, 'w1', 'the project whose folder holds the conversation\'s folder');
    assert.equal(row.tool, 'bash');
    assert.equal(row.family, 'core');
    assert.equal(row.state, 'on');
    assert.equal(row.via, 'direct');
    assert.equal(row.outcome, 'ran');
    assert.equal(row.size, 14);
    assert.ok(Number.isInteger(row.ms));
    assert.doesNotMatch(app.raw(), /SECRET-ARGUMENT|RESULT-TEXT|secret description/);
  } finally {
    app.close();
  }
});

test('loaded lines, and a tool fetched with tools_find counts as from the reserve', async () => {
  const app = boot();
  try {
    const s1 = app.agent('s1');
    app.header(s1.session, ['read', 'bash', 'tools_find']);
    app.header(s1.session, ['read', 'bash', 'tools_find']);
    await app.call({ callId: 'c1', name: 'tools_find', agent: s1, arguments: { query: 'pdf' } });
    app.header(s1.session, ['read', 'bash', 'tools_find', 'pdf_read']);
    await app.call({ callId: 'c2', name: 'pdf_read', agent: s1, arguments: {} });
    await app.call({ callId: 'c3', name: 'read', agent: s1, arguments: {} });
    const rows = app.lines();
    const loaded = rows.filter((row) => row.kind === 'loaded');
    assert.equal(loaded.length, 2, 'a repeated tool list writes nothing');
    assert.deepEqual(loaded[0].full, ['bash', 'read', 'tools_find']);
    assert.deepEqual(loaded[1].added, ['pdf_read']);
    const pdf = rows.find((row) => row.tool === 'pdf_read');
    assert.equal(pdf.loaded, false);
    assert.equal(pdf.via, 'tools_find');
    assert.equal(pdf.family, 'pdf');
    assert.equal(rows.find((row) => row.tool === 'read').loaded, true);
  } finally {
    app.close();
  }
});

test('an old tool list from history being loaded is not a change', async () => {
  const app = boot();
  try {
    const s1 = app.agent('s1');
    app.header(s1.session, ['read'], Date.now() - 60_000);
    assert.equal(app.lines().length, 0);
  } finally {
    app.close();
  }
});

test('calls inside a program are recorded under their own name, via "program"', async () => {
  const app = boot();
  try {
    const s1 = app.agent('s1', {}, ['run_code', 'read']);
    await app.call({ callId: 'p1', name: 'read', agent: s1, parent: { callId: 'run' }, rootCallId: 'run', arguments: {} });
    const [row] = app.lines();
    assert.equal(row.tool, 'read');
    assert.equal(row.via, 'program');
    assert.equal(row.loaded, true);
  } finally {
    app.close();
  }
});

test('a guard\'s refusal: "unknown" without a note, the rule when the guard\'s add-on notes it', async () => {
  const app = boot();
  try {
    const s1 = app.agent('s1');
    await app.call({ callId: 'c1', name: 'web_fetch', agent: s1, arguments: {} }, { guards: [() => 'someone said no'] });
    // As Modes does: the guard notes its rule, then returns its reason.
    const modesGuard = (exec) => {
      app.service().note({ sessionId: exec.agent.id, tool: exec.name, outcome: 'refused', rule: 'web-off', by: 'modes' });
      return 'Web is off';
    };
    await app.call({ callId: 'c2', name: 'bash', agent: s1, arguments: {} }, { guards: [modesGuard] });
    const rows = app.lines();
    assert.deepEqual([rows[0].outcome, rows[0].rule], ['refused', 'unknown']);
    assert.deepEqual([rows[1].outcome, rows[1].rule, rows[1].by], ['refused', 'web-off', 'modes']);
    assert.equal(rows.length, 2, 'the note joined its call; no second line');
  } finally {
    app.close();
  }
});

test('the ledger sees the final gate: a refusal by an add-on that loaded earlier is still caught', async () => {
  const app = boot({
    before: (ctx, ledger) => ctx.on('tools/pre-execute', async (exec, next) => {
      const decision = await next();
      if (exec.name !== 'subagent') return decision;
      ledger().note({ sessionId: exec.agent.id, tool: exec.name, rule: 'one-model', by: 'modes' });
      return { kind: 'deny', reason: 'one model for everything' };
    }),
  });
  try {
    const s1 = app.agent('s1');
    await app.call({ callId: 'c1', name: 'subagent', agent: s1, arguments: { model: 'x' } });
    const [row] = app.lines();
    assert.deepEqual([row.outcome, row.rule, row.family], ['refused', 'one-model', 'helpers']);
  } finally {
    app.close();
  }
});

test('asking (by an add-on that loaded earlier): allowed after a yes, denied after a no', async () => {
  const app = boot({
    before: (ctx) => ctx.on('tools/pre-execute', async (exec, next) => {
      const decision = await next();
      return exec.name === 'bash' ? { kind: 'ask', reason: 'risky' } : decision;
    }),
  });
  try {
    const s2 = app.agent('s2');
    await app.call({ callId: 'c1', name: 'bash', agent: s2, arguments: {} }, { approval: 'allowed-once' });
    await app.call({ callId: 'c2', name: 'bash', agent: s2, arguments: {} }, { approval: 'rejected' });
    const rows = app.lines();
    assert.deepEqual(rows.map((row) => [row.outcome, row.rule, row.state, row.tab]), [['allowed', undefined, 'off', 'chat'], ['denied', 'approval', 'off', 'chat']]);
  } finally {
    app.close();
  }
});

test('Mission helpers and the conductor carry their run and role; a helper gets its conversation\'s tab', async () => {
  const app = boot();
  try {
    const helper = app.agent('helper', { parentSession: { id: 's1' } });
    const conductor = app.agent('conductor');
    await app.call({ callId: 'c1', name: 'read', agent: helper, arguments: {} });
    await app.call({ callId: 'c2', name: 'read', agent: conductor, arguments: {} });
    const rows = app.lines();
    assert.deepEqual(rows[0].mission, { runId: 'run1', role: 'review' });
    assert.equal(rows[0].parent, 's1');
    assert.equal(rows[0].tab, 'cowork');
    assert.deepEqual(rows[1].mission, { runId: 'run1', role: 'conductor' });
  } finally {
    app.close();
  }
});

test('notes: an access request is written at once; a note no call claims is written after a long wait', async () => {
  const app = boot();
  try {
    app.agent('s2');
    assert.equal(app.service().note({ sessionId: 's2', tool: 'bash', outcome: 'denied', rule: 'denied', by: 'tool-access', via: 'access-request' }), true);
    app.service().note({ sessionId: 's2', tool: 'web_fetch', outcome: 'parked', rule: 'unattended', by: 'mission' });
    assert.equal(app.service().note(null), false, 'a bad note is ignored, never thrown');
    assert.equal(app.service().note({ tool: '' }), false);
    let rows = app.lines();
    assert.deepEqual(rows.map((row) => [row.tool, row.via, row.outcome, row.state]), [['bash', 'access-request', 'denied', 'off']]);
    const realNow = Date.now;
    Date.now = () => realNow() + 5 * 60_000;
    try {
      rows = app.lines();
    } finally {
      Date.now = realNow;
    }
    assert.equal(rows.length, 1, 'still waiting after 5 minutes: a slow call before it in the same step may hold its result back');
    Date.now = () => realNow() + 31 * 60_000;
    try {
      rows = app.lines();
    } finally {
      Date.now = realNow;
    }
    assert.deepEqual(rows.map((row) => [row.tool, row.outcome, row.rule, row.by]).at(-1), ['web_fetch', 'parked', 'unattended', 'mission']);
  } finally {
    app.close();
  }
});

test('switched off: nothing new is written', async () => {
  const app = boot({ config: Config({ enabled: false }) });
  try {
    const s1 = app.agent('s1');
    app.header(s1.session, ['read']);
    await app.call({ callId: 'c1', name: 'read', agent: s1, arguments: {} });
    assert.equal(app.service().note({ sessionId: 's1', tool: 'x', via: 'access-request' }), false);
    assert.equal(app.lines().length, 0);
  } finally {
    app.close();
  }
});

test('a conversation deleted for good: its lines and its helpers\' lose the link and keep counting', async () => {
  const app = boot();
  try {
    const s1 = app.agent('s1');
    const helper = app.agent('helper', { parentSession: 's1' });
    const s2 = app.agent('s2', { cwd: '/elsewhere' });
    app.header(s1.session, ['read']);
    await app.call({ callId: 'c1', name: 'read', agent: s1, arguments: {} });
    await app.call({ callId: 'c2', name: 'read', agent: helper, arguments: {} });
    await app.call({ callId: 'c3', name: 'read', agent: s2, arguments: {} });
    app.lines();
    for (const fn of app.erasedFns) await fn(['s1']);
    const rows = app.lines();
    assert.equal(rows.length, 4);
    assert.doesNotMatch(JSON.stringify(rows), /"s1"|"helper"|"w1"/);
    assert.equal(rows.filter((row) => row.g).length, 3);
    assert.equal(app.service().summary({ range: '30d' }).totals.calls, 3);
  } finally {
    app.close();
  }
});

test('routes: fenced, read-only summary and export; Start fresh only with its own POST', async () => {
  const app = boot();
  try {
    const s1 = app.agent('s1');
    await app.call({ callId: 'c1', name: 'bash', agent: s1, arguments: {} });
    assert.equal((await app.request('/dsh-tool-ledger/summary', { cookie: false })).status, 401);
    assert.equal((await app.request('/dsh-tool-ledger/summary', { method: 'POST' })).status, 405);
    const summary = await app.request('/dsh-tool-ledger/summary?range=6m');
    assert.equal(summary.status, 200);
    const data = JSON.parse(summary.text);
    assert.equal(data.range, '6m');
    assert.equal(data.totals.calls, 1);
    assert.deepEqual(data.tabs.map((tab) => tab.id), ['chat', 'cowork']);
    assert.equal(data.plain.bash, 'Run commands');
    assert.ok(Array.isArray(data.askedButOff) && Array.isArray(data.loadedNeverUsed) && Array.isArray(data.reserveAlwaysCalled) && Array.isArray(data.refusedMost));
    const csv = await app.request('/dsh-tool-ledger/export?range=all&format=csv');
    assert.match(csv.headers['content-type'], /text\/csv/);
    assert.match(csv.headers['content-disposition'], /attachment; filename="tool-use-all-/);
    assert.equal(csv.text.trim().split('\r\n').length, 2);
    const json = JSON.parse((await app.request('/dsh-tool-ledger/export?format=json')).text);
    assert.equal(json.range, '30d');
    assert.equal(json.rows[0].tool, 'bash');
    assert.equal((await app.request('/dsh-tool-ledger/clear')).status, 405, 'a GET never clears');
    assert.equal((await app.request('/dsh-tool-ledger/clear', { method: 'POST', body: {} })).status, 400);
    assert.equal((await app.request('/dsh-tool-ledger/clear', { method: 'POST', body: { confirm: 'start fresh' }, type: 'text/plain' })).status, 400, 'a plain form post cannot clear');
    assert.equal(app.lines().length, 1);
    const cleared = await app.request('/dsh-tool-ledger/clear', { method: 'POST', body: { confirm: 'start fresh' } });
    assert.equal(cleared.status, 200);
    assert.equal(app.lines().length, 0);
  } finally {
    app.close();
  }
});

test('service query: rows and summaries of a range, for Data mode and Tuner Plus', async () => {
  const app = boot();
  try {
    const s1 = app.agent('s1');
    await app.call({ callId: 'c1', name: 'read', agent: s1, arguments: {} });
    const { rows, summary } = app.service().query({ range: 'all' });
    assert.equal(rows.length, 1);
    assert.equal(summary.totals.calls, 1);
    assert.equal(app.service().query({ from: Date.now() + 60_000 }).rows.length, 0);
    assert.match(app.service().csv({ range: '30d' }), /^t,kind,sid/);
  } finally {
    app.close();
  }
});

test('the writer flushes when the add-on stops', async () => {
  const app = boot();
  try {
    const s1 = app.agent('s1');
    await app.call({ callId: 'c1', name: 'read', agent: s1, arguments: {} });
    const dir = join(app.home, 'tool-ledger');
    assert.equal(existsSync(dir), false, 'not written yet: lines wait for the timer');
    app.stop();
    const text = readdirSync(dir).map((name) => readFileSync(join(dir, name), 'utf8')).join('');
    assert.match(text, /"tool":"read"/);
  } finally {
    app.close();
  }
});

test('a refusal whose result comes long after the guard ran (a slower call before it in the same step) is one line with its rule', async () => {
  const app = boot();
  const realNow = Date.now;
  try {
    const s1 = app.agent('s1');
    const run = (fn) => { for (const one of app.handlers.get('tools/result') ?? []) fn(one); };
    // The app's order for a refused call: pre-execute, then the guards (Modes notes its rule and names the call),
    // then, only once the slower calls before it are done, tools/result.
    const exec = { callId: 'c1', name: 'web_fetch', agent: s1, arguments: {}, signal: new AbortController().signal };
    const pre = app.handlers.get('tools/pre-execute');
    await pre[0](exec, () => Promise.resolve({ kind: 'allow' }));
    app.service().note({ sessionId: 's1', tool: 'web_fetch', outcome: 'refused', rule: 'web-sources', by: 'modes', exec });
    // Six seconds, then ten minutes pass; the writer runs in between.
    Date.now = () => realNow() + 6000;
    app.service().flush();
    Date.now = () => realNow() + 10 * 60_000;
    app.service().flush();
    Object.freeze(exec);
    const result = { isError: true, content: [{ type: 'text', text: 'Error: not ticked' }], error: { message: 'not ticked' } };
    run((fn) => fn(exec, result));
    // A later call of the same tool, refused by another add-on with no note, must not take a leftover note.
    Date.now = realNow;
    await app.call({ callId: 'c2', name: 'web_fetch', agent: s1, arguments: {} }, { guards: [() => 'someone else said no'] });
    const rows = app.lines().filter((row) => row.kind === 'call');
    assert.deepEqual(rows.map((row) => [row.tool, row.outcome, row.rule ?? null, row.by ?? null]), [
      ['web_fetch', 'refused', 'web-sources', 'modes'],
      ['web_fetch', 'refused', 'unknown', null],
    ]);
  } finally {
    Date.now = realNow;
    app.close();
  }
});

test('a note that names its call is written on its own only if that call\'s result never comes, and then only once', async () => {
  const app = boot();
  const realNow = Date.now;
  try {
    const s1 = app.agent('s1');
    const exec = { callId: 'c1', name: 'bash', agent: s1, arguments: {} };
    app.service().note({ sessionId: 's1', tool: 'bash', outcome: 'refused', rule: 'secrets', by: 'modes', exec });
    Date.now = () => realNow() + 31 * 60_000;
    assert.equal(app.lines().length, 1);
    Object.freeze(exec);
    for (const fn of app.handlers.get('tools/result') ?? []) fn(exec, { isError: true, content: [], error: { message: 'no' } });
    assert.equal(app.lines().length, 1, 'the late result adds no second line');
  } finally {
    Date.now = realNow;
    app.close();
  }
});

test('a call of a tool the tab does not offer is "not offered", not a failure, and never a reserve suggestion', async () => {
  const app = boot();
  try {
    for (const sid of ['s1', 'c2', 'c3']) {
      const who = app.agent(sid);
      app.header(who.session, ['read', 'tools_find']);
      // The app runs the execute step, then the body throws ToolNotFoundError (code UNKNOWN_TOOL).
      await app.call({ callId: `${sid}-x`, name: 'bash', agent: who, arguments: {} }, { body: () => ({ isError: true, content: [{ type: 'text', text: 'Unknown tool' }], error: { message: 'Unknown tool: bash', info: { name: 'ToolNotFoundError', code: 'UNKNOWN_TOOL' } } }) });
    }
    const calls = app.lines().filter((row) => row.kind === 'call');
    assert.deepEqual(calls.map((row) => [row.outcome, row.rule, row.loaded]), [['refused', 'not-offered', false], ['refused', 'not-offered', false], ['refused', 'not-offered', false]]);
    const summary = app.service().summary({ range: '30d' });
    assert.deepEqual(summary.reserveAlwaysCalled, []);
    assert.ok(summary.refusedMost.some((row) => row.tool === 'bash' && row.rule === 'not-offered'));
  } finally {
    app.close();
  }
});
