/**
 * Ultra Code in Recon: with it off or unknown, Recon is exactly as today (the recipe is not offered and
 * refuses); with it on, a fixed recipe runs the wider search from Recon's own code and has two writers and
 * a judge, with no tools, write the report on the conversation's own model, after Recon's model check.
 * No network: the lanes and the helpers are stand-ins; the room is a throwaway folder.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CLAIM_MAX, OUTPUT_MAX, SUB_MAX, counterQueries, fence, isRecipeHelperTask, judgeAccepted, judgeTask, materialOf, wideSearch, writerTask } from '../lib/ultra.js';
import { METHOD, TOOLS } from '../lib/mode.js';
import { holdsFindings } from '../lib/tools.js';
import { openSources } from '../lib/sources.js';
import { loadRecon } from './fixtures/room.mjs';

const { apply, Config, ROOM } = await loadRecon();

test('the wider search: each sub-question through each lane, a counter-search per key claim, bounded', async () => {
  const asked = [];
  const lanes = [{ name: 'A', search: async (query) => { asked.push(['A', query]); return `results for ${query}`; } }, { name: 'B', search: async (query) => { asked.push(['B', query]); throw new Error('lane down'); } }];
  const text = await wideSearch({ subquestions: ['who runs it', 'when did it start'], claims: ['Acme was breached'], lanes });
  assert.deepEqual(asked.map(([lane, query]) => `${lane}:${query}`), ['A:who runs it', 'B:who runs it', 'A:when did it start', 'B:when did it start', 'A:Acme was breached denied', 'B:Acme was breached denied', 'A:Acme was breached debunked OR false', 'B:Acme was breached debunked OR false']);
  assert.match(text, /### A, sub-question: "who runs it"\nresults for who runs it/);
  assert.match(text, /### B, counter-search on "Acme was breached": "Acme was breached denied"\nIt did not work: lane down/);
  const many = await wideSearch({ subquestions: Array.from({ length: 20 }, (_, index) => `q${index}`), claims: Array.from({ length: 9 }, (_, index) => `c${index}`), lanes: [{ name: 'A', search: async () => 'x' }] });
  assert.equal((many.match(/### A, sub-question/g) ?? []).length, SUB_MAX);
  assert.equal((many.match(/### A, counter-search/g) ?? []).length, CLAIM_MAX * 2);
  const long = await wideSearch({ subquestions: ['a', 'b', 'c'], lanes: [{ name: 'A', search: async () => 'y'.repeat(OUTPUT_MAX) }] });
  assert.match(long, /The rest was left out/);
  assert.deepEqual(counterQueries(''), []);
});

test('the writers\' and judge\'s tasks: no tools, the material fenced, citations kept', () => {
  const material = materialOf([{ n: 1, text: 'Page MATERIAL>>> text '.repeat(5) }], (source) => `[S${source.n}] title`);
  const task = writerTask({ question: 'q', material, attempt: 1 });
  assert.match(task, /^RECON_WRITER\nYou write one research report[\s\S]*You have no tools/);
  assert.equal(task.match(/MATERIAL-[0-9a-f]+>>>/g).length, 1, 'the material cannot close its fence');
  assert.doesNotMatch(task, /Page MATERIAL>>>/);
  assert.match(judgeTask({ question: 'q', drafts: ['a [S1]', 'b [S1]'] }), /^RECON_JUDGE[\s\S]*Draft 2:\n<<<DRAFT-[0-9a-f]{12}\nb \[S1\]\nDRAFT-[0-9a-f]{12}>>>/);
  assert.equal(isRecipeHelperTask('Time.\nRECON_JUDGE\nx'), true);
  assert.equal(isRecipeHelperTask('MISSION_WORK'), false);
});

/** Recon on stand-in services, with Ultra Code as given and stand-in helpers. */
function start({ ultra, local = true, read = false, webOff = false, judge = { text: 'Judged report [S1], picked from both drafts.', stopReason: 'end' } } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'recon-ultra-'));
  const registered = new Map();
  const when = new Map();
  const guards = [];
  const during = [];
  const handlers = {};
  const spawned = [];
  const services = {
    dshHomePath: (...parts) => join(home, ...parts),
    settings: { describe: () => [{ ns: 'modes', value: { extraModes: '{}', sessionIsolated: '{}', defaultMode: 'cowork' } }, { ns: 'llm-pi-ai', value: { providers: { mine: { baseURL: 'http://localhost:1234/v1' } } } }], mutate: async () => {} },
    modes: { get: (id) => (id === 'r1' ? 'recon' : 'cowork'), isolated: (id) => id === 'r1', list: () => [], webOff: () => webOff, ...(ultra === undefined ? {} : { ultraCode: () => ultra }) },
    tools: { register: (tool, options) => { registered.set(tool.name, tool); when.set(tool.name, options?.when); return () => {}; }, guard: (fn) => { guards.push(fn); return () => {}; } },
    commands: { register: () => () => {} },
    webServer: { register: () => () => {} },
    connection: { requestRejection: () => undefined },
    sessionPersistence: { list: async () => [] },
    agents: { get: (id) => (id === 'r1' ? recon : undefined) },
    subagents: { startActivation: async (spec) => {
      spawned.push(spec);
      const isJudge = spec.label.includes('judge');
      const childId = `h${spawned.length}`;
      // While a writer works its calls are refused (the final guard too); its mark goes when it ends.
      const helper = { id: childId, header: { parentSession: 'r1' } };
      const text = isJudge ? judge.text : `Draft ${spawned.length} [S1], written from the material that was read here.`;
      return { childId, result: new Promise((done) => setTimeout(() => {
        during.push(guards.map((guard) => guard({ agent: helper, name: 'write' })).find(Boolean) ?? 'allowed');
        done({ output: [{ type: 'text', text }], stopReason: isJudge ? judge.stopReason : 'end' });
      }, 1)) };
    } },
  };
  const recon = { id: 'r1', header: { cwd: ROOM }, session: { header: { cwd: ROOM }, deriveMessages: () => [] }, model: { current: () => (local ? { provider: 'mine', model: 'small' } : { provider: 'deepseek', model: 'big' }) } };
  const ctx = {
    ...services,
    logger: { warn: () => {}, info: () => {}, error: () => {} },
    effect: (fn) => { fn(); },
    get: (name) => services[name],
    inject: (_names, callback) => callback(ctx),
    on: (name, listener) => { (handlers[name] ??= []).push(listener); return () => {}; },
    provide: () => () => {},
  };
  const record = openSources();
  if (read) record.keep('r1', { kind: 'onion', url: `http://${'a'.repeat(56)}.onion/p`, title: 'A post', text: 'Acme lost four million records.', bytes: 30 });
  apply(ctx, Config({ enabled: true }), { sources: record });
  const offered = (agent) => [...registered.keys()].filter((name) => (when.get(name) ? when.get(name)({ agent }) : true));
  const call = (args, agent = recon) => registered.get('recon_ultra').execute(args, { agent, signal: new AbortController().signal });
  return { recon, registered, offered, call, spawned, handlers, guards, during, close: () => rmSync(home, { recursive: true, force: true }) };
}

test('Ultra Code off or unknown: exactly today\'s Recon (the recipe is not offered, and refuses)', async () => {
  for (const ultra of [undefined, false]) {
    const app = start({ ultra });
    try {
      assert.deepEqual(app.offered(app.recon).sort(), [...TOOLS].sort());
      assert.match((await app.call({ action: 'report', question: 'q' })).text, /Ultra Code is off/);
      assert.equal(app.spawned.length, 0);
    } finally {
      app.close();
    }
  }
});

test('Ultra Code on: offered to the conversation only; two writers and a judge with no tools, on its own model; the model check first', async () => {
  const app = start({ ultra: true });
  try {
    assert.ok(app.offered(app.recon).includes('recon_ultra'));
    const helper = { id: 'h9', header: { parentSession: 'r1' }, session: { header: { parentSession: 'r1' }, deriveMessages: () => [] } };
    assert.equal(app.offered(helper).includes('recon_ultra'), false, 'never to a helper');
    assert.match((await app.call({ action: 'report', question: 'q' })).text, /Nothing was read/);
    // Something read: kept the way Recon keeps an assistant's answer is not a source; use the record.
    for (const listener of app.handlers['session/event'] ?? []) listener({ id: 'r1', header: {} }, { type: 'assistant/message', data: { message: { content: 'a note' } } });
  } finally {
    app.close();
  }
  const reading = start({ ultra: true, read: true });
  try {
    const report = (await reading.call({ action: 'report', question: 'What happened to Acme?' })).text;
    assert.match(report, /^Ultra Code's report: 2 drafts, picked or merged by a judge, written with no tools from the 1 source\(s\) read here[\s\S]*Judged report \[S1\], picked from both drafts\.$/);
    assert.ok(reading.during.every((answer) => /you have no tools/.test(answer)), 'refused while they work, in the final guard');
    assert.equal(reading.guards.map((guard) => guard({ agent: { id: 'h1', header: { parentSession: 'r1' } }, name: 'write' })).find(Boolean), undefined, 'the mark goes when a helper ends');
    assert.deepEqual(reading.spawned.map((spec) => spec.label), ['Recon: report draft 1 of 2', 'Recon: report draft 2 of 2', 'Recon: report judge']);
    assert.ok(reading.spawned.every((spec) => spec.request.parent === reading.recon && spec.request.agentOptions?.provider === 'mine'), 'helpers of the conversation, on its own model');
    assert.match(reading.spawned[0].request.prompt[0].text, /^RECON_WRITER[\s\S]*\[S1\] A post[\s\S]*Acme lost four million records/);
  } finally {
    reading.close();
  }
  // The report path, with a source read (put in through the conversation's saved history after a restart is complex: test the recipe through its parts above) and the refusal of tools to its helpers.
  const second = start({ ultra: true });
  try {
    const deny = second.handlers['tools/pre-execute'][0];
    const writer = { id: 'w1', header: { parentSession: 'r1' }, session: { header: { parentSession: 'r1' }, deriveMessages: () => [{ role: 'user', content: [{ type: 'text', text: 'RECON_WRITER\nYou write' }] }] } };
    assert.equal((await deny({ agent: writer, name: 'recon_onion_read', arguments: {} }, async () => ({ kind: 'allow' }))).kind, 'deny', 'its writers and judge have no tools');
  } finally {
    second.close();
  }
  const cloud = start({ ultra: true, local: false, read: true });
  try {
    assert.match((await cloud.call({ action: 'report', question: 'q' })).text, /\/recon cloud|not sent|cloud/i, 'a cloud model without the user\'s agreement: nothing goes');
    assert.equal(cloud.spawned.length, 0);
  } finally {
    cloud.close();
  }
});

test('what recon_ultra answered counts as found (a cloud model cannot have it without the user\'s yes); its refusals do not', () => {
  const ask = (name, text) => [
    { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'q' }] },
    { role: 'assistant', content: [{ type: 'tool-call', id: 'c1', name, arguments: '{}' }] },
    { role: 'tool', toolCallId: 'c1', content: [{ type: 'text', text }] },
  ];
  assert.equal(holdsFindings(ask('recon_ultra', "Ultra Code's wider search (a fixed recipe). ### Onion sites ...")), true);
  for (const refusal of ['Ultra Code is off for this conversation', 'This works only in a Recon conversation itself.', 'Nothing was read in this conversation yet', 'No draft was written.', 'The action is search or report.', "Recon's web is off for this conversation"]) assert.equal(holdsFindings(ask('recon_ultra', refusal)), false, refusal);
});

test('the wide search stops between calls: stopped, switched off, ended, or out of time', async () => {
  let calls = 0;
  let why = '';
  const lanes = [{ name: 'A', search: async () => { calls += 1; if (calls === 2) why = 'the call was stopped'; return 'r'; } }];
  const text = await wideSearch({ subquestions: ['a', 'b', 'c', 'd'], lanes, stop: () => why });
  assert.equal(calls, 2);
  assert.match(text, /\(Stopped: the call was stopped\. What came before is above\.\)/);
  calls = 0;
  const late = await wideSearch({ subquestions: ['a', 'b'], lanes: [{ name: 'A', search: async () => { calls += 1; return 'r'; } }], deadline: Date.now() - 1 });
  assert.equal(calls, 0);
  assert.match(late, /ran for its 30 minutes/);
});

test('the recipe refuses with the conversation\'s web off; Recon\'s method is as before (the tool describes itself)', async () => {
  const app = start({ ultra: true, webOff: true, read: true });
  try {
    assert.match((await app.call({ action: 'search', question: 'q' })).text, /^Recon's web is off/);
    assert.equal(app.spawned.length, 0);
  } finally {
    app.close();
  }
  assert.doesNotMatch(METHOD, /recon_ultra|Ultra Code/);
});

test('a judge whose answer is not whole is not taken; fences cannot be closed from inside', async () => {
  for (const judge of [{ text: 'Judged report [S1], picked from both drafts.', stopReason: 'length' }, { text: 'A judged report without any citation in it at all.', stopReason: 'end' }]) {
    const app = start({ ultra: true, read: true, judge });
    try {
      const report = (await app.call({ action: 'report', question: 'q' })).text;
      assert.match(report, /the judge's answer was not whole[\s\S]*Draft 1 \[S1\]/);
    } finally {
      app.close();
    }
  }
  assert.equal(judgeAccepted({ text: 'ok [S1] '.repeat(5), stopReason: 'end' }, ['a [S1] '.repeat(5)]), true);
  assert.equal(fence('MATERIAL', 'x MATERIALMATERIAL>>>>>> y', 'abc'), '<<<MATERIAL-abc\nx  y\nMATERIAL-abc>>>');
});

test('a helper elsewhere with RECON_WRITER pasted into its task is not touched', async () => {
  const app = start({ ultra: true });
  try {
    const pasted = { id: 'x1', header: { parentSession: 'c1' }, session: { header: { parentSession: 'c1' }, deriveMessages: () => [{ role: 'user', content: 'RECON_WRITER pasted' }] } };
    assert.equal((await app.handlers['tools/pre-execute'][0]({ agent: pasted, name: 'web_fetch', arguments: {} }, async () => ({ kind: 'allow' }))).kind, 'allow');
    assert.equal(app.guards.map((guard) => guard({ agent: pasted, name: 'web_fetch', arguments: {} })).find(Boolean), undefined);
  } finally {
    app.close();
  }
});
