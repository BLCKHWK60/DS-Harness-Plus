import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { testing } from '../index.js';

const { readDeck, readModelVersions, readConnectors, readNameList, normalizeSelection, tierForRoute, tierPrompt, DEFAULTS, TIER_IDS } = testing;

const VERSIONS = JSON.stringify([
  { id: 'writing', name: 'Writing', provider: 'prov-a', model: 'model-x', effort: 'low', temperature: 0.9 },
  { id: 'coding', name: 'Coding', provider: 'prov-a', model: 'model-x', temperature: 0.2, maxTokens: 6000 },
  { id: 'Bad Id', name: 'Broken', provider: 'prov-a', model: 'model-x' },
  { id: 'nomodel', name: 'No model' },
]);

test('starter tiers ship with no model and generic names', () => {
  const deck = readDeck({});
  assert.deepEqual(deck.ids, TIER_IDS);
  assert.deepEqual(deck.ids.map((id) => deck.tiers[id].name), ['Fast', 'Balanced', 'Deep', 'Creative', 'Code review']);
  for (const id of TIER_IDS) {
    assert.equal(deck.tiers[id].provider, '');
    assert.equal(deck.tiers[id].model, '');
    assert.equal(DEFAULTS[id].provider, '');
  }
});

test('no user-specific values are shipped in the bundle patch', () => {
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(patch, /provider:|model:/);
});

test('a starter takes its own name, instructions, skills and connectors', () => {
  const deck = readDeck({
    tiers: { haiku: { label: 'Quick', instructions: 'Be brief.', skills: '["a","b","a"]', connectors: '["files"]', minSubagents: 2, maxSubagents: 3 } },
  });
  const tier = deck.tiers.haiku;
  assert.equal(tier.name, 'Quick');
  assert.equal(tier.prompt, 'Be brief.');
  assert.deepEqual(tier.skills, ['a', 'b']);
  assert.deepEqual(tier.connectors, ['files']);
  assert.equal(tier.minSubagents, 2);
  assert.equal(tier.maxSubagents, 3);
  assert.equal(deck.tiers.sonnet.connectors, null);
});

test('connector and name lists are read safely', () => {
  assert.equal(readConnectors(''), null);
  assert.equal(readConnectors(undefined), null);
  assert.equal(readConnectors('not json'), null);
  assert.deepEqual(readConnectors('[]'), []);
  assert.deepEqual(readConnectors(['x', 'x', 7]), ['x']);
  assert.deepEqual(readNameList('{"a":1}'), []);
});

test('saved model versions are validated', () => {
  const versions = readModelVersions({ modelVersions: VERSIONS });
  assert.deepEqual(Object.keys(versions), ['writing', 'coding']);
  assert.equal(versions.writing.temperature, 0.9);
  assert.equal(versions.coding.maxTokens, 6000);
  assert.deepEqual(readModelVersions({ modelVersions: 'oops' }), {});
});

test('a tier pointing at a version runs on that version', () => {
  const deck = readDeck({ modelVersions: VERSIONS, tiers: { opus: { provider: 'prov-b', model: 'model-y', version: 'coding' } } });
  const tier = deck.tiers.opus;
  assert.equal(tier.provider, 'prov-a');
  assert.equal(tier.model, 'model-x');
  assert.equal(tier.temperature, 0.2);
  assert.equal(tier.versionId, 'coding');
  // A version that no longer exists leaves the tier on its own model.
  const lost = readDeck({ tiers: { opus: { provider: 'prov-b', model: 'model-y', version: 'gone' } } }).tiers.opus;
  assert.equal(lost.model, 'model-y');
  assert.equal(lost.versionId, undefined);
});

test('the plain model keeps default settings beside its saved versions', () => {
  const config = { modelVersions: VERSIONS };
  const tiers = readDeck(config).tiers;
  const versions = readModelVersions(config);
  const plain = normalizeSelection({ tier: null, provider: 'prov-a', model: 'model-x', effort: 'high' }, tiers, {}, versions);
  assert.equal(plain.temperature, undefined);
  assert.equal(plain.versionId, undefined);
  const picked = normalizeSelection({ tier: null, version: 'writing', provider: 'prov-a', model: 'model-x' }, tiers, {}, versions);
  assert.equal(picked.temperature, 0.9);
  assert.equal(picked.effort, 'low');
  assert.equal(picked.versionId, 'writing');
  // A value set in the chat box wins over the version.
  const tuned = normalizeSelection({ version: 'writing', provider: 'prov-a', model: 'model-x', temperature: 0.4, effort: 'ultra' }, tiers, {}, versions);
  assert.equal(tuned.temperature, 0.4);
  assert.equal(tuned.effort, 'ultra');
});

test('a tier with no model applies its rules to the model in use', () => {
  const config = { tiers: { haiku: { webSearch: false } } };
  const tiers = readDeck(config).tiers;
  // The old tier-only form cannot name a route for a tier without a model.
  assert.equal(normalizeSelection('haiku', tiers, {}, {}), undefined);
  const chosen = normalizeSelection({ tier: 'haiku', provider: 'prov-z', model: 'any-model', effort: 'low' }, tiers, {}, {});
  assert.equal(chosen.id, 'haiku');
  assert.equal(chosen.model, 'any-model');
  assert.equal(chosen.webSearch, false);
  // With no choice recorded, a model no tier owns gets no tier.
  assert.equal(tierForRoute('s1', 'prov-z', 'any-model', { ...config, activeTiers: '{}' }), undefined);
});

test("a tier's version settings follow the tier's own model only", () => {
  const config = { modelVersions: VERSIONS, tiers: { opus: { version: 'coding' } } };
  const tiers = readDeck(config).tiers;
  const versions = readModelVersions(config);
  const onTierModel = normalizeSelection({ tier: 'opus', provider: 'prov-a', model: 'model-x', effort: 'high' }, tiers, {}, versions);
  assert.equal(onTierModel.temperature, 0.2);
  const onOtherModel = normalizeSelection({ tier: 'opus', provider: 'prov-b', model: 'other', effort: 'high' }, tiers, {}, versions);
  assert.equal(onOtherModel.temperature, undefined);
  assert.equal(onOtherModel.versionId, undefined);
  assert.equal(onOtherModel.id, 'opus');
});

test('old per-model defaults still apply when no version is involved', () => {
  const profiles = { 'prov-a': { 'model-x': { temperature: 0.5, enabled: true } } };
  const tiers = readDeck({}).tiers;
  const legacy = normalizeSelection({ provider: 'prov-a', model: 'model-x' }, tiers, profiles, {});
  assert.equal(legacy.temperature, 0.5);
  const versions = readModelVersions({ modelVersions: VERSIONS });
  const picked = normalizeSelection({ version: 'coding', provider: 'prov-a', model: 'model-x' }, tiers, profiles, versions);
  assert.equal(picked.temperature, 0.2);
});

test('the prompt carries instructions, skills, connectors and the sub-agent floor', () => {
  const tier = {
    ...readDeck({ tiers: { haiku: { instructions: 'OWN-TEXT', skills: '["alpha","beta"]', connectors: '["files"]', minSubagents: 3 } } }).tiers.haiku,
    provider: 'p',
    model: 'm',
  };
  const text = tierPrompt(tier, 2, true, {}, { skillText: (name) => (name === 'alpha' ? 'ALPHA-BODY' : undefined) });
  assert.match(text, /Active model tier: Fast/);
  assert.match(text, /OWN-TEXT/);
  assert.doesNotMatch(text, /prefer fast, narrow actions/);
  assert.match(text, /Skill loaded for this tier: alpha\nALPHA-BODY/);
  assert.match(text, /uses the skill `beta`/);
  assert.match(text, /Connectors available in this tier: files/);
  // The floor never exceeds the cap.
  assert.match(text, /at least 2 sub-agents/);
  const builtIn = tierPrompt({ ...readDeck({}).tiers.haiku, provider: 'p', model: 'm' }, 4, true);
  assert.match(builtIn, /Fast behavior: prefer fast, narrow actions/);
  assert.doesNotMatch(builtIn, /at least/);
  assert.doesNotMatch(builtIn, /Connectors/);
});

test('sub-agents off means no floor is asked for', () => {
  const tier = { ...readDeck({ tiers: { sonnet: { subagents: false, minSubagents: 4 } } }).tiers.sonnet, provider: 'p', model: 'm' };
  const text = tierPrompt(tier, 4, true);
  assert.match(text, /delegation is disabled/);
  assert.doesNotMatch(text, /at least/);
});

// ---- instructions on model versions ---------------------------------------

const INSTRUCTED = JSON.stringify([
  {
    id: 'writer', name: 'Writer', provider: 'prov-a', model: 'model-x',
    instructions: 'BASE-TEXT', replace: false,
    presets: { standard: { text: 'STANDARD-EXTRA' }, minimal: { text: 'MINIMAL-ONLY', replace: true }, empty: { text: '  ' } },
  },
  { id: 'solo', name: 'Solo', provider: 'prov-a', model: 'model-x', instructions: 'SOLO-TEXT', replace: true },
  { id: 'bare', name: 'Bare', provider: 'prov-a', model: 'model-x', replace: true },
]);

test('a version carries instructions, and per-preset text that adds or replaces', () => {
  const versions = testing.readModelVersions({ modelVersions: INSTRUCTED });
  assert.deepEqual(Object.keys(versions.writer.presets), ['standard', 'minimal']);
  const { versionInstructions } = testing;
  assert.deepEqual(versionInstructions(versions.writer, undefined), { texts: ['BASE-TEXT'], replace: false });
  assert.deepEqual(versionInstructions(versions.writer, 'standard'), { texts: ['BASE-TEXT', 'STANDARD-EXTRA'], replace: false });
  assert.deepEqual(versionInstructions(versions.writer, 'minimal'), { texts: ['MINIMAL-ONLY'], replace: true });
  assert.deepEqual(versionInstructions(versions.writer, 'unknown'), { texts: ['BASE-TEXT'], replace: false });
  assert.deepEqual(versionInstructions(versions.solo, 'standard'), { texts: ['SOLO-TEXT'], replace: true });
  // "Replace" with nothing to say replaces nothing.
  assert.deepEqual(versionInstructions(versions.bare, 'standard'), { texts: [], replace: false });
  assert.deepEqual(versionInstructions(undefined, 'standard'), { texts: [], replace: false });
});

test('a version that stands alone leaves out the tier wording but keeps the rules', () => {
  const tier = { ...readDeck({ tiers: { haiku: { instructions: 'TIER-TEXT', webSearch: false } } }).tiers.haiku, provider: 'p', model: 'm', effort: 'ultra' };
  const added = tierPrompt(tier, 3, true, {}, { version: { name: 'Writer', texts: ['BASE-TEXT'], replace: false } });
  assert.match(added, /TIER-TEXT/);
  assert.match(added, /Instructions for Writer:\nBASE-TEXT/);
  assert.match(added, /Decompose the task/);
  const alone = tierPrompt(tier, 3, true, {}, { version: { name: 'Writer', texts: ['ONLY-THIS'], replace: true } });
  assert.match(alone, /Instructions for Writer:\nONLY-THIS/);
  assert.doesNotMatch(alone, /TIER-TEXT|Decompose the task|prefer fast, narrow actions/);
  // Access and sub-agent rules are facts about what works, so they stay.
  assert.match(alone, /Internet access for this tier: web fetch, browser/);
  assert.match(alone, /at most 3 concurrent children/);
});

// ---- isolated conversations and conversations without tools ---------------------------------

/** Run the add-on on a stand-in host and give back its service, with one conversation on `prov-a/model-x`. */
async function running(config, { isolated = false, noTools = false, depth, prompt = false, parent } = {}) {
  const { apply } = await import('../index.js');
  let current = { provider: 'prov-a', model: 'model-x' };
  let section;
  const effect = (make) => { const undo = make(); return typeof undo === 'function' ? undo : () => {}; };
  const agent = {
    id: 's1', session: {}, ...(parent ? { header: { parentSession: parent } } : {}),
    model: { current: () => current, select: (route) => { current = { provider: route.provider, model: route.model }; } },
    // With `prompt`, the conversation is open when the add-on loads and its tier section is captured.
    ...(prompt ? { ctx: { effect, systemPrompt: { section: (spec) => { section = spec; return () => {}; } } } } : {}),
  };
  const services = {
    agents: { get: (id) => (id === agent.id ? agent : undefined), list: () => (prompt ? [agent] : []) },
    modes: {
      isolated: () => isolated,
      noTools: () => noTools,
      // Modes' answer to "which Depth note does this conversation's instructions carry" (an Error: it throws).
      ...(depth === undefined ? {} : { depthSpoken: () => { if (depth instanceof Error) throw depth; return depth; } }),
    },
  };
  let service;
  const ctx = {
    on: () => () => {},
    effect: (make) => { const undo = make(); return typeof undo === 'function' ? undo : () => {}; },
    provide: (_name, value) => { service = value; },
    get: (name) => services[name],
    inject: () => {},
    logger: { warn: () => {}, info: () => {}, debug: () => {} },
    loader: {},
    tools: { register: () => () => {} },
  };
  apply(ctx, config);
  return { service, now: () => current, text: () => section?.text?.() ?? '' };
}

const STANDING_ALONE = { modelVersions: INSTRUCTED, tiers: { opus: { version: 'solo' } } };

test('a version that stands alone never removes an isolated conversation\'s own rules', async () => {
  assert.equal((await running(STANDING_ALONE)).service.instructionsReplaced('s1'), true);
  assert.equal((await running(STANDING_ALONE, { isolated: true })).service.instructionsReplaced('s1'), false);
});

test('an isolated conversation is never moved to another model', async () => {
  const config = { ...STANDING_ALONE, fallbackChains: JSON.stringify({ opus: [{ provider: 'prov-a', model: 'model-x' }, { provider: 'prov-far', model: 'model-far' }] }) };
  const open = await running(config);
  assert.equal((await open.service.advanceFallback('s1'))?.to.provider, 'prov-far');
  assert.equal(open.now().provider, 'prov-far');
  const kept = await running(config, { isolated: true });
  assert.equal(await kept.service.advanceFallback('s1'), null);
  assert.equal(kept.now().provider, 'prov-a');
  assert.equal(await kept.service.restorePrimary('s1', 'opus'), null);
});

test('with no tools the prompt says nothing of the web, sub-agents, workflows or checks', () => {
  const tier = { ...readDeck({ tiers: { haiku: { instructions: 'TIER-TEXT', skills: '["alpha","beta"]', connectors: '["files"]', minSubagents: 2 } } }).tiers.haiku, provider: 'p', model: 'm', effort: 'ultra' };
  const roles = { haiku: { review: { provider: 'p', model: 'r' } } };
  const full = tierPrompt(tier, 3, true, roles, { skillText: (name) => (name === 'alpha' ? 'ALPHA-BODY' : undefined) });
  assert.match(full, /Internet access|sub-agents|workflow|review_lanes|typecheck/);
  const bare = tierPrompt(tier, 3, true, roles, { skillText: (name) => (name === 'alpha' ? 'ALPHA-BODY' : undefined), version: { name: 'Writer', texts: ['VERSION-TEXT'], replace: false }, bare: true });
  assert.doesNotMatch(bare, /Internet access|Connectors|sub-agent|workflow|delegate_role|review_lanes|run_pipeline|typecheck|skill tool|`beta`/);
  // The tier's own behaviour, a skill already loaded and the version's text stay.
  assert.match(bare, /Active model tier: Fast/);
  assert.match(bare, /TIER-TEXT/);
  assert.match(bare, /ALPHA-BODY/);
  assert.match(bare, /Instructions for Writer:\nVERSION-TEXT/);
});

test('with no tools no tier, effort level or Code tier asks to change code or run checks', () => {
  const deck = readDeck({});
  for (const id of TIER_IDS) {
    for (const effort of ['off', 'low', 'medium', 'high', 'extra-high', 'ultra']) {
      const tier = { ...deck.tiers[id], provider: 'p', model: 'm', effort };
      const text = tierPrompt(tier, 3, true, {}, { bare: true });
      assert.doesNotMatch(text, /typecheck|tests\b|Run the|implement|diff|edit|smallest correct change|re-run/i, `${id} at ${effort}`);
    }
  }
  for (const effort of ['medium', 'high', 'extra-high']) {
    const tier = { ...deck.tiers.haiku, provider: 'p', model: 'm', effort };
    assert.match(tierPrompt(tier, 3, true, {}, {}), /verify|Run/, `${effort} keeps its checks with tools`);
  }
  const ultra = tierPrompt({ ...deck.tiers.code, provider: 'p', model: 'm', effort: 'ultra' }, 3, true, {}, { bare: true });
  assert.match(ultra, /Reason exhaustively/, 'Ultra without tools still asks for the deepest reasoning');
  const code = { ...deck.tiers.code, provider: 'p', model: 'm', effort: 'extra-high' };
  const bare = tierPrompt(code, 3, true, {}, { bare: true });
  assert.doesNotMatch(bare, /typecheck|re-run|run the narrowest|lint/i);
  assert.match(bare, /review, check, and fix code/);
  assert.match(tierPrompt(code, 3, true, {}, {}), /typecheck/);
});

test('with Web Off the tier does not claim internet access; the rest stays', () => {
  const deck = readDeck({});
  const tier = { ...deck.tiers.haiku, provider: 'p', model: 'm', effort: 'high' };
  const on = tierPrompt(tier, 3, true, {}, {});
  assert.match(on, /Internet access for this tier/);
  const off = tierPrompt(tier, 3, true, {}, { webOff: true });
  assert.doesNotMatch(off, /Internet access/);
  assert.match(off, /Run the narrowest relevant checks/, 'the tools are still there, only the web is off');
});

test('a conversation in the Cowork sidebar\'s trash keeps its tier across a restart; one erased for good does not', async () => {
  const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { apply } = await import('../index.js');
  const home = mkdtempSync(join(tmpdir(), 'tiers-trash-'));
  try {
    const dir = join(home, 'trash', 'conversations');
    mkdirSync(join(dir, 'trashed-1'), { recursive: true });
    writeFileSync(join(dir, 'trashed-1', 'info.json'), JSON.stringify({ id: 'trashed-1', parts: [{ id: 'trashed-1' }] }));
    const listeners = {};
    const writes = [];
    const config = { activeTiers: JSON.stringify({ 'trashed-1': { tier: 'opus' }, 'erased-2': { tier: 'opus' } }), sessionProfiles: '{}' };
    const services = {
      agents: { get: () => undefined, list: () => [] },
      settings: { mutate: async (ns, ops) => { writes.push(...ops); for (const op of ops) config[op.path[0]] = op.value; } },
      sessionPersistence: { stat: async () => undefined },
      dshHomePath: (...parts) => join(home, ...parts),
    };
    const ctx = {
      on: (name, handler) => { (listeners[name] ??= []).push(handler); return () => {}; },
      effect: (make) => { const undo = make(); return typeof undo === 'function' ? undo : () => {}; },
      provide: () => {},
      get: (name) => services[name],
      inject: () => {},
      logger: { warn: () => {}, info: () => {}, debug: () => {} },
      loader: {},
      tools: { register: () => () => {} },
    };
    apply(ctx, config);
    for (const handler of listeners['agent/created'] ?? []) { try { handler({ agent: { id: 'new-9', session: {}, model: { current: () => undefined } } }); } catch { /* other listeners need more of a real agent */ } }
    await new Promise((resolve) => setTimeout(resolve, 20));
    const kept = JSON.parse(String(config.activeTiers));
    assert.ok(kept['trashed-1'], 'in the trash: its tier stays');
    assert.equal(kept['erased-2'], undefined, 'erased for good: its tier goes');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('with Depth at Quick or Thorough the effort says only how hard to think; planning and checks are Depth\'s', () => {
  const deck = readDeck({});
  const CHECKS = /verify|Run the narrowest|typecheck|self-review loop|act on the first sound approach|Plan briefly|check the result|Before finishing/i;
  const think = {
    off: 'Answer directly with no extended reasoning preamble.',
    low: 'Keep reasoning brief.',
    medium: 'Reason as much as the task needs.',
    high: 'Reason carefully and state your assumptions.',
    'extra-high': 'Reason exhaustively: consider edge cases and failure paths.',
  };
  for (const id of TIER_IDS) {
    for (const [effort, line] of Object.entries(think)) {
      const tier = { ...deck.tiers[id], provider: 'p', model: 'm', effort };
      const only = tierPrompt(tier, 3, true, {}, { thinkingOnly: true });
      assert.ok(only.includes(line), `${id} at ${effort}`);
      const standard = tierPrompt(tier, 3, true, {}, {});
      assert.ok(!standard.includes(line), `${id} at ${effort}: at Standard the wording is as before`);
      // Only the effort's line differs, and it asks for no planning or checks (a tier's own words may).
      const added = only.split('\n').filter((text) => !standard.split('\n').includes(text));
      assert.deepEqual(added, [line], `${id} at ${effort}`);
      assert.doesNotMatch(line, CHECKS);
    }
  }
  // Ultra keeps its planning and sub-agents (as in Claude Code) but not the checks before finishing.
  const ultra = { ...deck.tiers.sonnet, provider: 'p', model: 'm', effort: 'ultra', subagents: true };
  const auto = tierPrompt(ultra, 3, true, {}, { thinkingOnly: true });
  assert.match(auto, /\*\*Ultra Code\.\*\* Decompose the task before acting/);
  assert.doesNotMatch(auto, /Before finishing, run the narrowest checks/);
  assert.match(tierPrompt(ultra, 3, true, {}, {}), /Before finishing, run the narrowest checks/, 'at Standard Ultra keeps them');
  const manual = tierPrompt(ultra, 3, false, {}, { thinkingOnly: true });
  assert.match(manual, /\*\*Ultra Code\.\*\* Reason exhaustively\. Do not proactively delegate/);
  assert.doesNotMatch(manual, /and verify the result/);
  const solo = tierPrompt({ ...ultra, subagents: false }, 3, true, {}, { thinkingOnly: true });
  assert.match(solo, /\*\*Ultra Code\.\*\* Reason exhaustively\. Sub-agent delegation is disabled/);
  // Wired to where the Depth note is really given (Modes' depthSpoken), never to the bare pick.
  const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(source, /depth = modes\?\.depthSpoken\?\.\(agent\);/);
  assert.doesNotMatch(source, /modes\?\.depthOf\?\./);
  // Ultra with no tools: the deepest thinking line.
  assert.ok(tierPrompt(ultra, 3, true, {}, { thinkingOnly: true, bare: true }).includes(think['extra-high']));
});

test('in a running app the tier section keeps only the thinking words exactly where Modes gives the Depth note', async () => {
  const config = { tiers: { haiku: { provider: 'prov-a', model: 'model-x', effort: 'high' } } };
  const section = async (depth) => (await running(config, { depth, prompt: true })).text();
  for (const depth of ['quick', 'thorough']) {
    const text = await section(depth);
    assert.ok(text.includes('Reason carefully and state your assumptions.'), depth);
    assert.doesNotMatch(text, /verify the result|Run the narrowest/, depth);
  }
  const OLD = /verify the result before finishing\. Run the narrowest relevant checks/;
  assert.match(await section('standard'), OLD);
  assert.match(await section(new Error('Modes failed')), OLD, 'a failing Modes leaves the usual words');
  assert.match(await section(undefined), OLD, 'an older Modes without depthSpoken leaves the usual words');
});

test('a Long run\'s helpers keep the effort Mission set by role; every other agent gets the tier\'s', async () => {
  const { apply } = await import('../index.js');
  const selected = [];
  const make = (id, parent) => ({
    id, session: { header: { id, ...(parent ? { parentSession: parent, origin: 'subagent' } : {}) } }, header: { id, ...(parent ? { parentSession: parent } : {}) },
    model: { current: () => ({ provider: 'prov-a', model: 'model-x', reasoningEffort: 'medium' }), select: (route) => selected.push([id, route.reasoningEffort]) },
  });
  const helper = make('h1', 'c1');
  const other = make('h2', 'c2');
  const services = {
    agents: { get: () => undefined, list: () => [helper, other] },
    modes: { isolated: () => false, noTools: () => false },
    mission: { ownsEffort: (agent) => agent?.header?.parentSession === 'c1' },
    llm: { resolveModelInfo: async () => ({ reasoning: { efforts: [{ id: 'low' }, { id: 'medium' }, { id: 'high' }] } }) },
  };
  const ctx = {
    on: () => () => {}, effect: (fn) => { const undo = fn(); return typeof undo === 'function' ? undo : () => {}; }, provide: () => {}, get: (name) => services[name], inject: () => {},
    logger: { warn: () => {}, info: () => {}, debug: () => {} }, loader: {}, tools: { register: () => () => {} },
  };
  apply(ctx, { tiers: { haiku: { provider: 'prov-a', model: 'model-x', effort: 'high' } } });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(selected.some(([id]) => id === 'h1'), false, 'the Long run helper keeps Mission\'s effort');
  assert.ok(selected.some(([id]) => id === 'h2'), `the other agent gets the tier's effort (${JSON.stringify(selected)})`);
});

test('Ultra Code is a switch beside Effort (plan step S1): off unless switched on; on, the conversation and its helpers get the Ultra Code words at the effort set; the top effort step keeps working', async () => {
  const { apply, testing } = await import('../index.js');
  const { tierPrompt, readDeck } = testing;
  const base = { ...readDeck({}).tiers.sonnet, provider: 'p', model: 'm', effort: 'medium', subagents: true };
  const off = tierPrompt(base, 3, true, {}, {});
  assert.doesNotMatch(off, /Ultra Code/, 'off: as before');
  const on = tierPrompt(base, 3, true, {}, { ultra: true });
  assert.match(on, /Effort: Medium, with Ultra Code switched on\./);
  assert.match(on, /\*\*Ultra Code\.\*\* Decompose the task before acting/);
  assert.match(on, /You own the final synthesis and verification/);
  // The switch alone never brings the top step's exhaustive reasoning or its checks (review finding 7).
  for (const effort of ['off', 'low', 'medium', 'high', 'extra-high']) {
    const without = tierPrompt({ ...base, effort }, 3, true, {}, {}).split('\n');
    const added = tierPrompt({ ...base, effort }, 3, true, {}, { ultra: true }).split('\n').filter((line) => !without.includes(line));
    // Only the Effort line's mention and the three lines on spreading the work; nothing about thinking or checks.
    assert.equal(added.length, 4, `${effort}: ${JSON.stringify(added)}`);
    assert.match(added[0], /with Ultra Code switched on/, effort);
    assert.match(added.slice(1).join('\n'), /^\*\*Ultra Code\.\*\* Decompose the task before acting[\s\S]*Cap concurrent children at 3[\s\S]*You own the final synthesis/, effort);
    for (const line of added) assert.doesNotMatch(line, /Reason exhaustively|Before finishing, run the narrowest checks/, effort);
  }
  // A tier without sub-agents runs no helpers: nothing is said, and the Effort line does not claim the switch.
  const solo = tierPrompt({ ...base, subagents: false }, 3, true, {}, { ultra: true });
  assert.equal(solo, tierPrompt({ ...base, subagents: false }, 3, true, {}, {}), 'the same words as with the switch off');
  assert.doesNotMatch(solo, /Ultra Code/);
  assert.match(tierPrompt({ ...base, effort: 'ultra' }, 3, true, {}, {}), /\*\*Ultra Code\.\*\* Decompose the task before acting/, 'the top step as before');
  assert.doesNotMatch(tierPrompt({ ...base, effort: 'ultra' }, 3, true, {}, { ultra: true }), /with Ultra Code switched on/);
  // The service: the switch, or the top effort step.
  let provided;
  const make = (id, parent) => ({ id, session: { header: { id, ...(parent ? { parentSession: parent } : {}) } }, header: { id, ...(parent ? { parentSession: parent } : {}) }, model: { current: () => ({ provider: 'p', model: 'm' }), select: () => {} } });
  const agents = new Map([['c1', make('c1')], ['h1', make('h1', 'c1')], ['h2', make('h2', 'h1')], ['c2', make('c2')]]);
  const services = { agents: { get: (id) => agents.get(id), list: () => [...agents.values()] }, modes: { isolated: () => false, noTools: () => false } };
  const ctx = {
    on: () => () => {}, effect: (fn) => { const undo = fn(); return typeof undo === 'function' ? undo : () => {}; }, provide: (name, value) => { if (name === 'modelTiers') provided = value; }, get: (name) => services[name], inject: () => {},
    logger: { warn: () => {}, info: () => {}, debug: () => {} }, loader: {}, tools: { register: () => () => {} },
  };
  apply(ctx, { sessionUltra: JSON.stringify({ c1: true, c2: 'yes' }) });
  assert.equal(provided.ultraCode('c1'), true);
  assert.equal(provided.ultraCode('h1'), true, 'a helper follows its conversation');
  assert.equal(provided.ultraCode('h2'), true, 'a helper\'s helper too (review finding 8)');
  assert.equal(provided.ultraCode('c2'), false, 'only true counts');
  assert.equal(provided.ultraCode('nobody'), false);
  // The panel's switch is beside Effort, and writes this conversation only.
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  assert.match(client, /h\(Switch, \{ checked: ultraOn \|\| effort === 'ultra', label: 'Ultra Code'/);
  assert.match(client, /activeTier && activeTier\.subagents === false\s*\? 'This tier runs no helpers/);
  assert.match(client, /if \(ultraOn\) delete next\[sessionId\];\s*else next\[sessionId\] = true;\s*return \[\{ op: 'set', path: \['sessionUltra'\], value: JSON\.stringify\(next\) \}\];/);
});

test('teams per tier for the work loop (plan step S6): lead, helpers, checker, judge; a saved version brings its model and output limit; a team for a tier only', async () => {
  const { apply, testing } = await import('../index.js');
  const config = {
    modelVersions: JSON.stringify([{ id: 'precise', name: 'Precise', provider: 'local', model: 'small', temperature: 0.1, maxTokens: 2000 }]),
    teams: JSON.stringify({
      sonnet: { lead: { provider: 'cloud', model: 'big' }, helpers: [{ provider: 'local', model: 'small' }, { provider: 'local', model: 'other' }, { provider: '', model: 'x' }], checker: { version: 'precise' }, judge: { version: 'gone' } },
      broken: 'nonsense',
    }),
  };
  const teams = testing.readTeams(config);
  assert.deepEqual(Object.keys(teams), ['sonnet']);
  assert.equal(teams.sonnet.helpers.length, 2, 'a member without a model is left out');
  assert.deepEqual(teams.sonnet.checker, { provider: 'local', model: 'small', version: 'precise', maxTokens: 2000 });
  assert.equal(teams.sonnet.judge, undefined, 'a version that does not exist is no member');
  let provided;
  const agents = new Map([['c1', { id: 'c1', header: { id: 'c1' }, model: { current: () => ({ provider: 'p', model: 'm' }), select: () => {} } }]]);
  const services = { agents: { get: (id) => agents.get(id), list: () => [...agents.values()] }, modes: { isolated: () => false, noTools: () => false } };
  const ctx = {
    on: () => () => {}, effect: (fn) => { const undo = fn(); return typeof undo === 'function' ? undo : () => {}; }, provide: (name, value) => { if (name === 'modelTiers') provided = value; }, get: (name) => services[name], inject: () => {},
    logger: { warn: () => {}, info: () => {}, debug: () => {} }, loader: {}, tools: { register: () => () => {} },
  };
  apply(ctx, { ...config, activeTiers: JSON.stringify({ c1: { tier: 'sonnet', provider: 'p', model: 'm', effort: 'medium' } }) });
  assert.deepEqual({ ...provided.teamRoute('c1', 'lead') }, { provider: 'cloud', model: 'big' });
  assert.deepEqual({ ...provided.teamRoute('c1', 'helper', 0) }, { provider: 'local', model: 'small' });
  assert.deepEqual({ ...provided.teamRoute('c1', 'helper', 3) }, { provider: 'local', model: 'other' }, 'attempts take turns');
  assert.deepEqual({ ...provided.teamRoute('c1', 'checker') }, { provider: 'local', model: 'small', maxTokens: 2000 });
  assert.equal(provided.teamRoute('c1', 'judge'), null);
  assert.equal(provided.teamRoute('nobody', 'lead'), null);
});

test('review fixes: the switch\'s words go to the conversation only, never to a helper (which would start helpers again); off with Ultra auto-delegation off; ultraCode still follows the chain', async () => {
  const tiers = { sonnet: { provider: 'prov-a', model: 'model-x', effort: 'medium' } };
  const top = await running({ tiers, sessionUltra: JSON.stringify({ s1: true }) }, { prompt: true });
  assert.match(top.text(), /\*\*Ultra Code\.\*\* Decompose the task before acting/);
  const helper = await running({ tiers, sessionUltra: JSON.stringify({ c0: true }) }, { prompt: true, parent: 'c0' });
  assert.doesNotMatch(helper.text(), /Ultra Code/, 'a helper is not told to start helpers');
  assert.equal(helper.service.ultraCode('s1'), true, 'it still counts as Ultra Code for the run');
  const manual = await running({ tiers, sessionUltra: JSON.stringify({ s1: true }), ultraAutoDelegate: false }, { prompt: true });
  assert.doesNotMatch(manual.text(), /Ultra Code/, 'auto-delegation off: the switch adds no delegation words');
});

test('the owner\'s answer: your own tiers get a team too, edited on their card', async () => {
  const { apply } = await import('../index.js');
  let provided;
  const agents = new Map([['c1', { id: 'c1', header: { id: 'c1' }, model: { current: () => ({ provider: 'p', model: 'm' }), select: () => {} } }]]);
  const services = { agents: { get: (id) => agents.get(id), list: () => [...agents.values()] }, modes: { isolated: () => false, noTools: () => false } };
  const ctx = {
    on: () => () => {}, effect: (fn) => { const undo = fn(); return typeof undo === 'function' ? undo : () => {}; }, provide: (name, value) => { if (name === 'modelTiers') provided = value; }, get: (name) => services[name], inject: () => {},
    logger: { warn: () => {}, info: () => {}, debug: () => {} }, loader: {}, tools: { register: () => () => {} },
  };
  apply(ctx, {
    customTiers: JSON.stringify([{ id: 'my-writer', name: 'My writer', short: 'MW', role: 'Writing', provider: 'p', model: 'm', effort: 'medium', order: 10 }]),
    activeTiers: JSON.stringify({ c1: { tier: 'my-writer', provider: 'p', model: 'm', effort: 'medium' } }),
    teams: JSON.stringify({ 'my-writer': { lead: { provider: 'cloud', model: 'big' } } }),
  });
  assert.equal(provided.resolveTier('c1')?.id, 'my-writer');
  assert.deepEqual({ ...provided.teamRoute('c1', 'lead') }, { provider: 'cloud', model: 'big' });
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  const card = client.slice(client.indexOf('function CustomTierCard('), client.indexOf('function CustomTiersEditor('));
  assert.match(card, /h\(TeamEditor, \{ tierId: tier\.id, teams, versions, onChange: onTeams \}\)/);
  assert.match(client, /onTeams: saveTeams,\n\s*\}\),/);
});

test('a team member may name a Tuning Plus adapter: used only while Tuning Plus says it is on and served, else the member\'s own model', async () => {
  const { apply, testing } = await import('../index.js');
  const config = {
    modelVersions: JSON.stringify([{ id: 'precise', name: 'Precise', provider: 'local', model: 'small', maxTokens: 2000 }]),
    teams: JSON.stringify({ sonnet: { lead: { provider: 'cloud', model: 'big' }, helpers: [{ provider: 'local', model: 'small', adapter: 'A1' }], checker: { version: 'precise', adapter: 'A2' }, judge: { provider: 'local', model: 'small', adapter: '../bad id' } } }),
  };
  const teams = testing.readTeams(config);
  assert.deepEqual(teams.sonnet.helpers[0], { provider: 'local', model: 'small', adapter: 'A1' });
  assert.deepEqual(teams.sonnet.checker, { provider: 'local', model: 'small', version: 'precise', maxTokens: 2000, adapter: 'A2' });
  assert.deepEqual(teams.sonnet.judge, { provider: 'local', model: 'small' }, 'an adapter id that is not a plain id is dropped; the member stays');
  const start = (tuning) => {
    let provided;
    const agents = new Map([['c1', { id: 'c1', header: { id: 'c1' }, model: { current: () => ({ provider: 'p', model: 'm' }), select: () => {} } }]]);
    const services = { agents: { get: (id) => agents.get(id), list: () => [...agents.values()] }, modes: { isolated: () => false, noTools: () => false }, ...(tuning ? { tuning } : {}) };
    const ctx = {
      on: () => () => {}, effect: (fn) => { const undo = fn(); return typeof undo === 'function' ? undo : () => {}; }, provide: (name, value) => { if (name === 'modelTiers') provided = value; }, get: (name) => services[name], inject: () => {},
      logger: { warn: () => {}, info: () => {}, debug: () => {} }, loader: {}, tools: { register: () => () => {} },
    };
    apply(ctx, { ...config, activeTiers: JSON.stringify({ c1: { tier: 'sonnet', provider: 'p', model: 'm', effort: 'medium' } }) });
    return provided;
  };
  // Tuning Plus not there: the member's own model, exactly as before.
  const without = start(undefined);
  assert.deepEqual({ ...without.teamRoute('c1', 'helper', 0) }, { provider: 'local', model: 'small' });
  assert.deepEqual({ ...without.teamRoute('c1', 'checker') }, { provider: 'local', model: 'small', maxTokens: 2000 });
  // On and served: the adapter's address.
  const served = start({ apiVersion: 1, adapterRoute: (id) => (id === 'A1' ? { provider: 'mlx', model: 'small-tuned' } : undefined) });
  assert.deepEqual({ ...served.teamRoute('c1', 'helper', 0) }, { provider: 'mlx', model: 'small-tuned', adapter: 'A1' });
  assert.deepEqual({ ...served.teamRoute('c1', 'checker') }, { provider: 'local', model: 'small', maxTokens: 2000 }, 'A2 is off: own model');
  assert.deepEqual({ ...served.teamRoute('c1', 'lead') }, { provider: 'cloud', model: 'big' });
  // Anything odd: the member's own model.
  const broken = start({ apiVersion: 1, adapterRoute: () => { throw new Error('down'); } });
  assert.deepEqual({ ...broken.teamRoute('c1', 'helper', 0) }, { provider: 'local', model: 'small' });
  const older = start({ apiVersion: 2, adapterRoute: () => ({ provider: 'mlx', model: 'x' }) });
  assert.deepEqual({ ...older.teamRoute('c1', 'helper', 0) }, { provider: 'local', model: 'small' });
  // The page keeps an adapter when the member's model is changed, and offers the field only for a member that is set.
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  assert.match(client, /value \? h\(AdapterField, \{ label, value, onSet \}\) : null/);
  assert.match(client, /onSet\(route \? \{ \.\.\.route, \.\.\.\(value\?\.adapter \? \{ adapter: value\.adapter \} : \{\}\) \} : null\)/);
});
