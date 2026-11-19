// Code power: the Config defaults, what is registered (and what is not when it is off), the skills' text,
// and the blind judge with its reversed-order check, all against a stand-in app.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Config, apply, buildSkills, parseVerdict } from '../index.js';

const DEFAULT = { enabled: true, prReview: { lanes: ['correctness', 'security', 'tests'] }, bestOfN: { n: 3, judgeRole: 'review', criteria: ['correctness', 'completeness', 'simplicity', 'test coverage'], consistencyCheck: true }, ciFix: { maxRounds: 5, command: '' }, judgeToolName: 'judge_candidates' };

/** A verdict block for labels, picking `winner`. */
const verdictText = (labels, winner, confidence = 'high') => '```json\n' + JSON.stringify({
  perAnswer: labels.map((slot) => ({ slot, scores: { correctness: slot === winner ? 5 : 2 }, strengths: 's', weaknesses: 'w' })),
  ranking: [winner, ...labels.filter((l) => l !== winner)],
  winner,
  confidence,
  summary: `${winner} is best`,
}) + '\n```';

/** The app, as far as Code power looks at it. `judge(prompt)` answers each judge child. */
function fakeApp({ config = DEFAULT, judge, modes, tiers } = {}) {
  const seen = { tools: [], skills: [], provided: {}, warnings: [], gated: [], prompts: [] };
  const subagents = {
    startActivation: async (spec) => {
      const prompt = spec.request?.prompt?.[0]?.text ?? spec.prompt?.[0]?.text ?? '';
      seen.prompts.push(prompt);
      const text = await judge(prompt);
      return { childId: `child-${seen.prompts.length}`, result: Promise.resolve({ output: [{ type: 'text', text }] }), dispose: async () => {} };
    },
  };
  const services = { skills: { register: (skill) => seen.skills.push(skill) }, subagents, ...(modes ? { modes } : {}), ...(tiers ? { modelTiers: tiers } : {}) };
  const ctx = {
    get: (name) => services[name],
    logger: { warn: (m) => seen.warnings.push(m), info: () => {} },
    tools: { register: (tool) => seen.tools.push(tool) },
    effect: (fn) => fn(),
    provide: (name, value) => { seen.provided[name] = value; },
    inject: (_names, callback) => callback({ effect: (fn) => fn(), modelTiers: { registerSubagentTool: (name) => seen.gated.push(name) } }),
  };
  apply(ctx, config);
  return seen;
}

/** Which of the shuffled labels in a judge prompt holds each candidate's text. */
const labelOf = (prompt, text) => [...prompt.matchAll(/<candidate label="(\w)">\n([\s\S]*?)\n<\/candidate>/g)].find((m) => m[2] === text)?.[1];

/** A value of the Config, whether it is plain or a live (volatile) reference. */
const plainOf = (value) => (value && typeof value === 'object' && typeof value.get === 'function' ? plainOf(value.get()) : Array.isArray(value) ? value.map(plainOf) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plainOf(v)])) : value);

test('the settings keep their keys and defaults', () => {
  assert.deepEqual(plainOf(Config({})), DEFAULT);
});

test('on: four skills, the judge tool, the judge service and the tier gate', () => {
  const seen = fakeApp();
  assert.deepEqual(seen.skills.map((s) => s.name), ['pr-review', 'ci-fix-loop', 'best-of-n', 'hunk-review']);
  for (const skill of seen.skills) assert.deepEqual(skill.invocation, { modelInvocable: true, userInvocable: true });
  assert.deepEqual(seen.tools.map((t) => t.name), ['judge_candidates']);
  assert.equal(typeof seen.provided.candidateJudge.compare, 'function');
  assert.deepEqual(seen.gated, ['judge_candidates']);
});

test('off: nothing is registered', () => {
  const seen = fakeApp({ config: { ...DEFAULT, enabled: false } });
  assert.deepEqual(seen.skills, []);
  assert.deepEqual(seen.tools, []);
  assert.deepEqual(seen.provided, {});
  assert.deepEqual(seen.gated, []);
});

test('the skills use the numbers and words from the settings', () => {
  const skills = buildSkills({ ...DEFAULT, prReview: { lanes: ['style', 'speed'] }, bestOfN: { n: 4, judgeRole: 'review', criteria: ['clarity', 'size'], consistencyCheck: false }, ciFix: { maxRounds: 7, command: 'make check' }, judgeToolName: 'pick_one' });
  const by = Object.fromEntries(skills.map((s) => [s.name, s]));
  assert.match(by['pr-review'].content, /`style`, `speed`/);
  assert.doesNotMatch(by['pr-review'].content, /`security`/);
  assert.match(by['ci-fix-loop'].content, /at most 7 rounds/);
  assert.match(by['ci-fix-loop'].content, /`make check`/);
  assert.match(by['best-of-n'].description, /4 independent/);
  assert.match(by['best-of-n'].content, /`pick_one`/);
  assert.match(by['best-of-n'].content, /clarity, size/);
  // Defaults: no command configured says to find it.
  const plain = buildSkills(DEFAULT).find((s) => s.name === 'ci-fix-loop');
  assert.match(plain.content, /not configured/);
  assert.match(plain.content, /at most 5 rounds/);
});

test('a verdict must name only the candidates', () => {
  assert.throws(() => parseVerdict('no block', ['A', 'B']), /no ```json/);
  assert.throws(() => parseVerdict(verdictText(['A', 'B'], 'C'), ['A', 'B']), /label|winner/);
  assert.equal(parseVerdict(verdictText(['A', 'B'], 'B'), ['A', 'B']).winner, 'B');
  assert.equal(parseVerdict('x ```json\n{"perAnswer":[],"ranking":[],"winner":"tie"}\n```', ['A']).winner, 'tie');
});

test('the judge: two rounds, the second in reversed order; agreement gives a winner', async () => {
  // The judge always prefers the candidate whose text is "good", whatever label it has.
  const seen = fakeApp({ judge: (prompt) => { const labels = [...prompt.matchAll(/label="(\w)"/g)].map((m) => m[1]); return verdictText(labels, labelOf(prompt, 'good')); } });
  const tool = seen.tools[0];
  const parent = { id: 'p1', model: { current: () => ({ provider: 'x', model: 'y' }) } };
  const answer = await tool.execute({ task: 'do the thing', candidates: [{ name: 'Zorro', diff: 'bad' }, { name: 'Quill', diff: 'good' }, { name: 'Mabel', diff: 'meh' }] }, { agent: parent });
  assert.equal(answer.winner, 1);
  assert.equal(answer.consistent, true);
  assert.match(answer.text, /Quill \(candidate 2\) wins, in both rounds/);
  assert.match(answer.text, /Round 2 \(reversed order\)/);
  assert.equal(seen.prompts.length, 2);
  const order = (prompt) => [...prompt.matchAll(/<candidate label="(\w)">\n([\s\S]*?)\n<\/candidate>/g)].map((m) => m[2]);
  assert.deepEqual(order(seen.prompts[1]), [...order(seen.prompts[0])].reverse());
  // Blind: the names never reach the judge.
  assert.ok(seen.prompts.every((p) => !/Zorro|Quill|Mabel/.test(p)));
});

test('the judge: a position-biased judge (always picks the first one shown) is a tie', async () => {
  const seen = fakeApp({ judge: (prompt) => verdictText([...prompt.matchAll(/label="(\w)"/g)].map((m) => m[1]), [...prompt.matchAll(/label="(\w)"/g)][0][1], 'low') });
  const answer = await seen.tools[0].execute({ task: 'do the thing', candidates: [{ diff: 'one' }, { diff: 'two' }] }, { agent: { id: 'p1' } });
  assert.equal(answer.consistent, false);
  assert.equal(answer.winner, null);
  assert.match(answer.text, /Result: tie \(the two rounds disagreed/);
});

test('the judge: the check can be switched off, and bad input is refused', async () => {
  const seen = fakeApp({ config: { ...DEFAULT, bestOfN: { ...DEFAULT.bestOfN, consistencyCheck: false } }, judge: (prompt) => verdictText([...prompt.matchAll(/label="(\w)"/g)].map((m) => m[1]), labelOf(prompt, 'two')) });
  const tool = seen.tools[0];
  const answer = await tool.execute({ task: 'do the thing', candidates: [{ diff: 'one' }, { diff: 'two' }] }, { agent: { id: 'p1' } });
  assert.equal(seen.prompts.length, 1);
  assert.equal(answer.winner, 1);
  await assert.rejects(() => tool.execute({ task: 'do the thing', candidates: [{ diff: 'one' }] }, { agent: { id: 'p1' } }), /between 2 and 5/);
  await assert.rejects(() => tool.execute({ task: 'x y z', candidates: [{ diff: 'a' }, { diff: 'b' }] }, {}), /live parent/);
});

test('a judge may not start judging itself, and the judge runs on the tier\'s role model unless helpers are "same"', async () => {
  const routes = [];
  const tiers = { resolveTier: () => ({ id: 't1' }), roleRoute: (tier, role) => { routes.push([tier, role]); return { provider: 'p', model: 'm' }; } };
  const seen = fakeApp({ tiers, modes: { helperModels: () => 'same' }, judge: (prompt) => verdictText([...prompt.matchAll(/label="(\w)"/g)].map((m) => m[1]), 'A') });
  await seen.tools[0].execute({ task: 'do the thing', candidates: [{ diff: 'one' }, { diff: 'two' }] }, { agent: { id: 'p1', model: { current: () => ({ provider: 'a', model: 'b' }) } } });
  assert.deepEqual(routes, [], 'same model for helpers: the tier role is not asked');
  const seen2 = fakeApp({ tiers, modes: { helperModels: () => 'tiers' }, judge: (prompt) => verdictText([...prompt.matchAll(/label="(\w)"/g)].map((m) => m[1]), 'A') });
  await seen2.tools[0].execute({ task: 'do the thing', candidates: [{ diff: 'one' }, { diff: 'two' }] }, { agent: { id: 'p2' } });
  assert.deepEqual(routes, [['t1', 'review'], ['t1', 'review']]);
});
