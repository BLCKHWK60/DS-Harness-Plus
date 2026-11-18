/**
 * The one Web selector (18 November 2026): the planner and the searchers are told which kinds of source
 * the conversation ticked; with All they are told nothing new.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { planPrompt, searchPrompt } from '../lib/rounds.js';

const depth = { subquestions: 4 };
const note = 'Web sources: only academic papers. Search results of other kinds are removed before you see them.';

test('the conversation\'s Web sources reach the planner and the searchers; All adds nothing', () => {
  assert.ok(planPrompt('Q?', depth, '2026-11-18', 'web', note).includes(note));
  assert.equal(planPrompt('Q?', depth, '2026-11-18', 'web', ''), planPrompt('Q?', depth, '2026-11-18', 'web'));
  const search = (sources) => searchPrompt({ question: 'Q?', task: { question: 'q', queries: ['a'] }, round: 1, depth: { rounds: 1 }, searchTools: ['web_search'], fetchTools: ['web_fetch'], today: '2026-11-18', sources });
  assert.ok(search(note).includes(note));
  assert.equal(search(''), search(undefined));
});
