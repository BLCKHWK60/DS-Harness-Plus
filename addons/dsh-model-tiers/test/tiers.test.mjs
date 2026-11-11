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
