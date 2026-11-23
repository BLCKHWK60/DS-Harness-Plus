// A run whose searchers cannot search stops at once, before any helper starts.
import assert from 'node:assert/strict';
import test from 'node:test';
import { apply } from '../index.js';
import { searchProblem } from '../lib/ready.js';

const ready = (answer) => ({ searchReady: async () => answer });

test('the reason names the searchers\' model, and offers the conversation\'s model only when it differs', async () => {
  assert.equal(await searchProblem(ready(true), { provider: 'a', model: 'm' }, { provider: 'a' }), '');
  assert.equal(await searchProblem(undefined, { provider: 'a' }, { provider: 'a' }), '', 'no web service: go ahead');
  assert.equal(await searchProblem({ searchReady: async () => { throw new Error('x'); } }, { provider: 'a' }), '', 'a failing check never stops a run');
  assert.equal(await searchProblem(ready(false), undefined), '', 'no route known: go ahead');
  const same = await searchProblem(ready(false), { provider: 'a', model: 'm' }, { provider: 'a' });
  assert.match(same, /not set up .*\(a \/ m\)/);
  assert.doesNotMatch(same, /One model for everything/);
  const byProvider = (answers) => ({ searchReady: async (provider) => answers[provider] });
  assert.match(await searchProblem(byProvider({ b: false, a: true }), { provider: 'b' }, { provider: 'a' }), /One model for everything.*"Same as the thread"/);
  assert.doesNotMatch(await searchProblem(ready(false), { provider: 'b' }, { provider: 'a' }), /One model for everything/, 'not offered when the conversation\'s own model cannot search either');
});

/** The plugin with a stand-in app; `started` counts helpers. */
function plugin(web, { config = {}, services = {} } = {}) {
  let tool;
  const counts = { started: 0 };
  const ctx = {
    on() {},
    effect(fn) { fn(); },
    provide() {},
    inject() {},
    tools: { register(definition) { tool = definition; } },
    get(key) {
      if (key === 'web') return web;
      if (key in services) return services[key];
      if (key === 'subagents') return { startActivation: async () => { counts.started += 1; throw new Error('no helpers in this test'); } };
      return undefined;
    },
  };
  apply(ctx, { enabled: true, toolName: 'deep_research', roles: { planner: 'plan', searcher: 'fast', writer: 'plan' }, helperModel: 'same', depth: 'quick', maxSubquestions: 8, maxParallel: 8, maxSources: 120, maxMinutes: 60, searchToolNames: ['web_search'], fetchToolNames: ['web_fetch'], requireFetched: false, wide: { maxRows: 500 }, ...config });
  const parent = { id: 'conv-1', model: { current: () => ({ provider: 'p', model: 'm' }) } };
  const run = (args) => tool.execute(args, { agent: parent, callId: 'call_1', signal: new AbortController().signal });
  return { run, counts };
}

test('no web search: the run stops before the planner or any searcher starts', async () => {
  const { run, counts } = plugin(ready(false));
  await assert.rejects(run({ question: 'What changed?' }), /web search is not set up/);
  await assert.rejects(run({ question: 'Rows', mode: 'wide', items: ['a'], columns: ['b'] }), /web search is not set up/);
  assert.equal(counts.started, 0);
});

test('web search ready: the run goes on to the planner', async () => {
  const { run, counts } = plugin(ready(true));
  await assert.rejects(run({ question: 'What changed?' }), /no helpers in this test/);
  assert.equal(counts.started, 1);
});

test('helpers set to another search tool: the app\'s web search is not asked, and the run goes on', async () => {
  let asked = 0;
  const web = { searchReady: async () => { asked += 1; return false; } };
  const { run, counts } = plugin(web, { config: { searchToolNames: ['other_search'] } });
  await assert.rejects(run({ question: 'What changed?' }), /no helpers in this test/);
  assert.equal(asked, 0);
  assert.equal(counts.started, 1);
});

test('helpers on role models: the searchers\' route is the one checked, not the planner\'s or the conversation\'s', async () => {
  const providers = [];
  const web = { searchReady: async (provider) => { providers.push(provider); return provider !== 'search-cloud'; } };
  const routes = { plan: { provider: 'p', model: 'm' }, fast: { provider: 'search-cloud', model: 'small' } };
  const modelTiers = { resolveTier: () => ({ id: 't1' }), roleRoute: (tier, role) => routes[role] ?? null };
  const { run, counts } = plugin(web, { config: { helperModel: 'roles' }, services: { modelTiers } });
  await assert.rejects(run({ question: 'What changed?' }), /\(search-cloud \/ small\).*One model for everything/s);
  assert.deepEqual(providers, ['search-cloud', 'p'], 'the searchers\' route first, then the conversation\'s own for the advice');
  assert.equal(counts.started, 0);
});

test('a run is as big as the Depth of the conversation that started it (Modes, the same in every tab)', async () => {
  /** The planner's instructions for a run started under these Modes answers. */
  const planned = async (modes) => {
    const specs = [];
    const asked = [];
    const subagents = { startActivation: async (spec) => { specs.push(spec); throw new Error('no helpers in this test'); } };
    const wrapped = modes && { ...modes, ...(modes.depthOf ? { depthOf: (id) => { asked.push(id); return modes.depthOf(id); } } : {}) };
    const { run } = plugin(ready(true), { config: { depth: 'standard' }, services: { subagents, ...(wrapped ? { modes: wrapped } : {}) } });
    await assert.rejects(run({ question: 'What changed?' }), /no helpers in this test/);
    return { text: JSON.stringify(specs[0] ?? {}), asked };
  };
  const thorough = await planned({ depthOf: () => 'thorough', researchDepth: () => 'quick' });
  assert.match(thorough.text, /3 to 8 sub-questions/);
  assert.deepEqual(thorough.asked, ['conv-1'], 'asked for the conversation that started the run');
  assert.match((await planned({ depthOf: () => 'quick', researchDepth: () => 'thorough' })).text, /3 to 4 sub-questions/);
  // An older Modes without depthOf: its one setting; no Modes: this add-on's own setting.
  assert.match((await planned({ researchDepth: () => 'quick' })).text, /3 to 4 sub-questions/);
  assert.match((await planned(undefined)).text, /3 to 6 sub-questions/);
});
