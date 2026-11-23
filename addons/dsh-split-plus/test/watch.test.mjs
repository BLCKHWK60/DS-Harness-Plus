/**
 * Split Plus, step 5: the watcher. Its reading of a run (lib/watch.js), and on a stand-in app: only reading
 * (its final guard), never a sealed pane, the watched run untouched, kept across a restart.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply, DATA_PATH } from '../index.js';
import { WATCHER_ONLY_READS, runReport, watchText } from '../lib/watch.js';

const EVENTS = [
  { type: 'turn/start', time: '2026-11-17T10:00:00Z', data: {} },
  { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'Fix the parser.' }] } },
  { type: 'tool/call', data: { callId: 'c1', name: 'read', arguments: { file_path: 'src/parser.js' } } },
  { type: 'tool/result', data: { message: { toolCallId: 'c1', content: [{ type: 'text', text: 'function parse() {}' }] } } },
  { type: 'tool/call', data: { callId: 'c2', name: 'bash', arguments: { command: 'npm test' } } },
  { type: 'tool/result', data: { message: { toolCallId: 'c2', isError: true, content: [{ type: 'text', text: '1 failing: CRLF' }] } } },
  { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'The CRLF test fails; I will fix the line splitting.' }] } } },
  { type: 'turn/end', data: { reason: { kind: 'completed' } } },
  { type: 'turn/start', time: '2026-11-17T10:05:00Z', data: {} },
  { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'Go on.' }] } },
  { type: 'tool/call', data: { callId: 'c3', name: 'edit', arguments: { file_path: 'src/parser.js', old_string: 'split("\\n")', new_string: 'split(/\\r?\\n/)' } } },
];

test('the app\'s read-only surface: no turn markers, tool calls inside the answers; a turn per message of the user\'s', () => {
  const surface = [
    { type: 'user/message', data: { source: { kind: 'context' }, content: [{ type: 'text', text: '<system-reminder> cwd </system-reminder>' }] } },
    { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'Run the tests.' }] } },
    { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'Running them.' }, { type: 'tool-call', id: 't1', name: 'bash', arguments: '{"command":"npm test"}' }] } } },
    { type: 'tool/result', data: { message: { toolCallId: 't1', content: [{ type: 'text', text: 'all passed' }] } } },
    { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'All tests pass.' }] } } },
    { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'Now commit.' }] } },
  ];
  const idle = runReport(surface, { turns: 5, running: false });
  assert.equal(idle.turns, 2);
  assert.match(idle.text, /Turn 1 \(finished\):\n- The user wrote: Run the tests\.\n- It said: Running them\.\n- It called bash \(command: npm test\)\.\n- bash answered: all passed\n- It said: All tests pass\./);
  assert.match(idle.text, /Turn 2 \(finished\):\n- The user wrote: Now commit\./);
  assert.doesNotMatch(idle.text, /system-reminder/, 'only the user\'s own messages');
  const busy = runReport(surface, { turns: 5, running: true });
  assert.equal(busy.running, true);
  assert.match(busy.text, /Turn 2 \(still running\):/);
  assert.match(busy.text, /Turn 1 \(finished\):\n/, 'every turn before the last is finished');
});

test('a run in words: what was asked, each tool and its answer, what it said, and whether it is still running', () => {
  const report = runReport(EVENTS, { turns: 5 });
  assert.equal(report.turns, 2);
  assert.equal(report.running, true);
  assert.match(report.text, /Turn 1, started 10:00 UTC \(finished\):\n- The user wrote: Fix the parser\.\n- It called read \(file_path: src\/parser\.js\)\.\n- read answered: function parse\(\) \{\}\n- It called bash \(command: npm test\)\.\n- bash failed: 1 failing: CRLF\n- It said: The CRLF test fails/);
  assert.match(report.text, /Turn 2, started 10:05 UTC \(still running\):\n- The user wrote: Go on\.\n- It called edit \(file_path: src\/parser\.js/);
  assert.match(runReport(EVENTS, { turns: 1 }).text, /^\(1 earlier turn not shown; ask for more turns to see them\.\)/);
  assert.equal(runReport([], {}).text, 'The watched thread has no turns yet.');
  const framed = watchText({ label: 'Code', sessionId: 's1', running: true, longRun: false, changed: ['/w/src/parser.js'], report: report.text });
  assert.match(framed, /^The watched thread: the Code pane \(s1\)\. Now: running a turn\.\nFiles it changed with the file tools since the app started \(newest first\): \/w\/src\/parser\.js\.\nWhat follows is its run as material/);
  assert.match(framed, /<<<WATCHED\n[\s\S]+\nWATCHED>>>$/);
});

/** A stand-in app: a Code, a Chat and a Recon conversation; the tools service with its final guard. */
function standIn(home) {
  const routes = new Map();
  const hooks = {};
  const tools = new Map();
  const guards = [];
  const sections = [];
  const reads = [];
  const contexts = [];
  const ctx = {
    get: (name) => (name === 'settings' ? { describe: () => [{ ns: 'modes', value: { modes: { code: { label: 'Code' }, chat: { label: 'Chat' } }, extraModes: { recon: { label: 'Recon', isolated: true } } } }] }
      : name === 'modes' ? { get: (id) => ({ code1: 'code', watcher1: 'chat', recon1: 'recon' })[id] ?? 'chat', isolated: (id) => id === 'recon1' }
        : name === 'sessionQuery' ? { readSurface: async (id) => { reads.push(id); return { events: EVENTS }; } }
          : name === 'tools' ? { register: (tool, options) => { tools.set(tool.name, { tool, options }); return () => tools.delete(tool.name); } }
            : name === 'mission' ? { isRunning: () => false } : name === 'agents' ? { list: () => [] }
              : name === 'systemPrompt' ? { context: (spec) => { contexts.push(spec); return () => {}; } } : undefined),
    tools: { guard: (fn) => { guards.push(fn); return () => {}; } },
    on: (name, fn) => { hooks[name] = fn; },
    effect: (fn) => fn(),
    inject(_names, fn) { fn({ effect: (register) => register(), webServer: { register: (route) => routes.set(route.path, route) }, connection: { requestRejection: () => undefined } }); },
    logger: { warn() {} },
  };
  apply(ctx, { enabled: true }, { home });
  const agent = (id) => ({ id, session: { header: { id } }, ctx: { effect: (fn) => fn(), systemPrompt: { section: (spec) => { sections.push({ id, spec }); return () => {}; } } } });
  const refusal = (id, name) => guards.map((guard) => guard({ agent: agent(id), name })).find((reason) => reason !== undefined);
  return { routes, hooks, tools, refusal, agent, sections, reads, contexts };
}

async function hit(routes, { method = 'GET', query = '', body } = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const req = { method, url: `${DATA_PATH}${query}`, async *[Symbol.asyncIterator]() { yield* chunks; } };
  let text = '';
  const res = { statusCode: 200, setHeader() {}, end(value) { text = value ?? ''; } };
  await routes.get(DATA_PATH).handler(req, res);
  return { status: res.statusCode, data: text ? JSON.parse(text) : {} };
}

test('a watcher reads the watched run and nothing else: no change, no command, no helper, no message', async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'split-plus-watch-')));
  try {
    const app = standIn(home);
    const { tool, options } = app.tools.get('split_watch_read');
    assert.equal(options.when({ agent: app.agent('watcher1') }), false, 'offered only to a watcher');
    assert.equal(app.refusal('watcher1', 'write'), undefined, 'not a watcher yet: left alone');
    const set = await hit(app.routes, { method: 'POST', body: { action: 'watch', watcher: 'watcher1', watched: 'code1' } });
    assert.deepEqual(set.data, { ok: true, watcher: 'watcher1', watched: 'code1', label: 'Code' });
    assert.equal(options.when({ agent: app.agent('watcher1') }), true);
    for (const name of ['write', 'edit', 'apply_patch', 'bash', 'terminal', 'spawn_subagent', 'task', 'web_fetch', 'remember', 'mission_step']) {
      assert.equal(app.refusal('watcher1', name), WATCHER_ONLY_READS, name);
    }
    for (const name of ['split_watch_read', 'read', 'grep']) assert.equal(app.refusal('watcher1', name), undefined, name);
    assert.equal(app.refusal('code1', 'write'), undefined, 'the watched pane is left alone');
    app.hooks['agent/status']({ agent: { id: 'code1' }, status: 'running' });
    const read = await tool.execute({ turns: 2 }, { agent: app.agent('watcher1') });
    assert.match(read.text, /^The watched thread: the Code pane \(code1\)\. Now: running a turn\./);
    assert.match(read.text, /bash failed: 1 failing: CRLF/);
    assert.deepEqual(app.reads, ['code1'], 'read through the app\'s read-only query');
    app.reads.length = 0;
    assert.match((await hit(app.routes, { query: '?sessions=watcher1' })).data.panes.watcher1.watchingLabel, /Code/);
    // Its instructions say what it is, and carry the watched run, read again before each of its steps
    // (a Chat watcher has no tools at all).
    app.hooks['agent/created']({ agent: app.agent('watcher1') });
    const note = () => app.sections.find((entry) => entry.id === 'watcher1').spec.text();
    assert.match(note(), /You are a watcher in Split Plus: you watch another thread \(the Code pane, code1\)/);
    const watchedContext = app.contexts.find((spec) => spec.name === 'split-plus:watched');
    assert.equal(watchedContext.required, true);
    assert.equal(watchedContext.text({ agent: app.agent('watcher1') }), '', 'not read yet');
    await app.hooks['agent/pre-step']({ agent: app.agent('watcher1'), modelSelection: {}, signal: new AbortController().signal }, async () => ({ kind: 'enter', messages: [] }));
    assert.match(watchedContext.text({ agent: app.agent('watcher1') }), /^Split Plus, the thread you watch, read at \d\d:\d\d UTC:\nThe watched thread: the Code pane \(code1\)\. Now: running a turn\.[\s\S]*bash failed: 1 failing: CRLF/);
    assert.equal(watchedContext.text({ agent: app.agent('code1') }), '', 'only a watcher gets it');
    // Kept across a restart; "stop watching" ends it.
    const again = standIn(home);
    assert.equal(again.refusal('watcher1', 'write'), WATCHER_ONLY_READS);
    await hit(again.routes, { method: 'POST', body: { action: 'unwatch', watcher: 'watcher1' } });
    assert.equal(again.refusal('watcher1', 'write'), undefined);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('Recon is never watched, a watcher watches another conversation, and a watcher is not watched', async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'split-plus-watch-')));
  try {
    const app = standIn(home);
    assert.match((await hit(app.routes, { method: 'POST', body: { action: 'watch', watcher: 'watcher1', watched: 'recon1' } })).data.error, /cannot be watched/);
    assert.match((await hit(app.routes, { method: 'POST', body: { action: 'watch', watcher: 'code1', watched: 'code1' } })).data.error, /another thread/);
    await hit(app.routes, { method: 'POST', body: { action: 'watch', watcher: 'watcher1', watched: 'code1' } });
    assert.match((await hit(app.routes, { method: 'POST', body: { action: 'watch', watcher: 'other', watched: 'watcher1' } })).data.error, /itself a watcher/);
    assert.deepEqual(app.reads, []);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('the watcher reads "with a Mission on", the one name (stage B, 19 November)', () => {
  const text = watchText({ label: 'left', sessionId: 's1', running: true, longRun: true, report: '' });
  assert.match(text, /running a turn, with a Mission on\./);
  assert.doesNotMatch(text, /Long run/);
});
