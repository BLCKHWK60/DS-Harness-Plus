import assert from 'node:assert/strict';
import test from 'node:test';
import { DEPTHS, analysisOf, analyzePrompt, capped, depthOf, planPrompt, roundLeft, searchAnswer, searchPrompt, tasksOf, writePrompt } from '../lib/rounds.js';

test('the three depths: rounds and runners grow, and an unknown depth is Standard', () => {
  assert.deepEqual([DEPTHS.quick.rounds, DEPTHS.standard.rounds, DEPTHS.thorough.rounds], [1, 2, 3]);
  assert.deepEqual([DEPTHS.quick.runners, DEPTHS.standard.runners, DEPTHS.thorough.runners], [4, 6, 8]);
  assert.equal(depthOf('THOROUGH').id, 'thorough');
  assert.equal(depthOf('nonsense').id, 'standard');
  assert.equal(depthOf(undefined).id, 'standard');
});

test('a depth is held to the settings and the model version\'s limits', () => {
  const held = capped(DEPTHS.thorough, { maxParallel: 8, tierCap: 3, maxSubquestions: 5, maxMinutes: 20, maxSources: 200, askedMinutes: 30 });
  assert.equal(held.runners, 3);
  assert.equal(held.subquestions, 5);
  assert.equal(held.followups, 5);
  assert.equal(held.minutes, 20);
  assert.equal(held.sources, 120);
  assert.equal(held.rounds, 3);
  assert.deepEqual(capped(DEPTHS.thorough), DEPTHS.thorough);
  assert.equal(capped(DEPTHS.quick, { maxSubquestions: 2 }).followups, 0);
  assert.equal(capped(DEPTHS.standard, { askedMinutes: 5, askedSources: 10 }).minutes, 5);
  assert.equal(capped(DEPTHS.standard, { askedMinutes: 5, askedSources: 10 }).sources, 10);
});

test('sub-questions are read from objects or plain strings, without repeats', () => {
  assert.deepEqual(tasksOf(['A?', { question: ' B? ', queries: ['q1', '', 'q2'], why: 'missing' }, { question: 'a?' }, {}, { question: 'C?' }], 3),
    [{ question: 'A?', queries: [], why: '' }, { question: 'B?', queries: ['q1', 'q2'], why: 'missing' }, { question: 'C?', queries: [], why: '' }]);
  assert.deepEqual(tasksOf(undefined, 5), []);
});

test('the plan asks for angles and queries', () => {
  const prompt = planPrompt('Is X safe?', DEPTHS.thorough, '2026-11-12');
  assert.match(prompt, /^RESEARCH_PLAN\n/);
  assert.match(prompt, /3 to 8 sub-questions/);
  assert.match(prompt, /Today is 2026-11-12/);
  assert.match(prompt, /"queries"/);
  assert.match(prompt, /Question: Is X safe\?$/);
});

test('a helper in a later round is told what is known and which queries were run', () => {
  const base = { question: 'Q', task: { question: 'Sub', queries: ['one', 'two'], why: 'no primary source yet' }, depth: DEPTHS.standard, searchTools: ['web_search'], fetchTools: ['web_fetch'], today: '2026-11-12' };
  const first = searchPrompt({ ...base, round: 1, tried: ['old'], known: ['fact'] });
  assert.match(first, /^RESEARCH_SEARCH\n/);
  assert.match(first, /at most 8 findings/);
  assert.match(first, /Suggested queries: "one", "two"/);
  assert.match(first, /Why it is asked: no primary source yet/);
  assert.doesNotMatch(first, /Queries already run/);
  const second = searchPrompt({ ...base, round: 2, tried: ['old query'], known: ['fact one'] });
  assert.match(second, /This is round 2/);
  assert.match(second, /Already established[^\n]*\n- fact one/);
  assert.match(second, /Queries already run[^\n]*\n- old query/);
});

test('a helper\'s answer: findings capped, queries and gaps cleaned', () => {
  const answer = searchAnswer({ findings: [1, 2, 3], queries: [' a ', '', 'b'], gaps: 'not a list' }, 2);
  assert.deepEqual(answer, { findings: [1, 2], queries: ['a', 'b'], gaps: [] });
  assert.deepEqual(searchAnswer(null, 5), { findings: [], queries: [], gaps: [] });
});

test('the analyst sees findings, gaps and queries, and its follow-ups never repeat a question', () => {
  const prompt = analyzePrompt({ question: 'Q', findings: [{ n: 1, claim: 'Revenue rose', host: 'sec.gov' }], gaps: ['no 2026 figure'], tried: ['x revenue'], asked: ['What is revenue?'], round: 1, depth: DEPTHS.standard, today: '2026-11-12' });
  assert.match(prompt, /^RESEARCH_ANALYZE\n/);
  assert.match(prompt, /up to 6 follow-up/);
  assert.match(prompt, /\[1\] sec\.gov: Revenue rose/);
  assert.match(prompt, /- no 2026 figure/);
  assert.match(prompt, /- x revenue/);
  const verdict = analysisOf({ enough: false, conflicts: ['A says 1, B says 2'], followups: [{ question: 'what is revenue?' }, { question: 'What did the regulator say?', queries: ['regulator ruling 2026'], why: 'only press so far' }] }, DEPTHS.standard, ['What is revenue?']);
  assert.equal(verdict.enough, false);
  assert.deepEqual(verdict.conflicts, ['A says 1, B says 2']);
  assert.deepEqual(verdict.followups, [{ question: 'What did the regulator say?', queries: ['regulator ruling 2026'], why: 'only press so far' }]);
  assert.equal(analysisOf({ enough: true, followups: [{ question: 'More?' }] }, DEPTHS.standard).enough, true);
  assert.equal(analysisOf(null, DEPTHS.standard).enough, true);
  assert.equal(analysisOf({ followups: Array.from({ length: 20 }, (_, i) => ({ question: `Q${i}` })) }, DEPTHS.thorough).followups.length, 8);
});

test('another round starts only when one is left and enough time remains', () => {
  const run = { depth: DEPTHS.standard, startedAt: 0, deadline: 100 };
  assert.equal(roundLeft({ ...run, round: 1, now: 50 }), true);
  assert.equal(roundLeft({ ...run, round: 1, now: 80 }), false);
  assert.equal(roundLeft({ ...run, round: 2, now: 10 }), false);
  assert.equal(roundLeft({ depth: DEPTHS.quick, startedAt: 0, deadline: 100, round: 1, now: 1 }), false);
});

test('the writer gets the findings, the contradictions and the gaps', () => {
  const prompt = writePrompt({ question: 'Q', findings: [{ n: 1, claim: 'A', quote: 'a quote', date: '2026-10-01' }, { n: 2, claim: 'B', quote: '', date: '' }], conflicts: ['1 against 2'], gaps: ['no figure'], today: '2026-11-12' });
  assert.match(prompt, /^RESEARCH_WRITE\n/);
  assert.match(prompt, /\[1\] A \(2026-10-01\) — "a quote"\n\[2\] B$/);
  assert.match(prompt, /Contradictions noted during the research:\n- 1 against 2/);
  assert.match(prompt, /Looked for and not found:\n- no figure/);
  assert.doesNotMatch(writePrompt({ question: 'Q', findings: [], conflicts: [], gaps: [], today: 't' }), /Contradictions/);
});
