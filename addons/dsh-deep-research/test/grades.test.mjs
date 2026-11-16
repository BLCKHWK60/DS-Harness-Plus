// Source grades in research reports (Long run part, step 64).
import test from 'node:test';
import assert from 'node:assert/strict';
import { GRADES_NOTE, claimsOf, gradeSources, hostOf, primaryOf, singleBlock, withSingleBlock } from '../lib/grades.js';
import { sourceLines } from '../lib/sources.js';

const sources = [
  { n: 1, url: 'https://www.example.org/a', status: 'fetched' },
  { n: 2, url: 'https://example.org/b', status: 'fetched' },
  { n: 3, url: 'https://news.other.net/c', status: 'search result only' },
  { n: 4, url: 'https://gov.example/law', status: 'fetched' },
];

test('Confirmed needs two independent addresses; the same site twice is still one', () => {
  assert.equal(hostOf('https://www.example.org/a'), 'example.org');
  const text = 'The answer is yes [1][3]. Prices rose 4% in May [1][2]. The law applies from 2027 [4].\n\n## Details\n- A list line with a claim [3].';
  const { grades, single } = gradeSources({ text, sources, primary: new Set([4]) });
  assert.equal(grades.get(1), 'Single', 'its second claim rests on example.org alone ([1][2] are one address)');
  assert.equal(grades.get(2), 'Single');
  assert.equal(grades.get(3), 'Single', 'the list line cites it alone');
  assert.equal(grades.get(4), 'Primary', 'the writer\'s judgement');
  assert.deepEqual(single.map((claim) => claim.ns), [[1, 2], [3]], 'single-source claims, but not the one backed by a primary source');
  const confirmed = gradeSources({ text: 'Yes [1][3]. Again [2][3].', sources });
  assert.equal(confirmed.grades.get(1), 'Confirmed');
  assert.equal(confirmed.grades.get(3), 'Confirmed');
  assert.deepEqual(confirmed.single, []);
});

test('the writer\'s primary list is taken out of the report; follow-up questions are not claims', () => {
  const raw = 'Answer [1].\n\n## What could not be established\nNothing.\n\n## Primary sources\n[4][2]\n\n## Follow-up questions\n- Why [9]?';
  const { primary, text } = primaryOf(raw);
  assert.deepEqual([...primary], [4, 2]);
  assert.doesNotMatch(text, /Primary sources/);
  assert.match(text, /## Follow-up questions/);
  assert.deepEqual(claimsOf(text).map((claim) => claim.ns), [[1]], 'the follow-up questions cite nothing that counts');
  assert.deepEqual(primaryOf('No list here [1].').primary.size, 0);
});

test('grades sit beside the read label, which stays as it was (research-4); the single-source list follows the answer', () => {
  const lines = sourceLines(sources.slice(0, 3), new Map([[1, 'Confirmed'], [3, 'Single']]));
  assert.match(lines, /^\[1\] https:\/\/www\.example\.org\/a \(read · Confirmed\)$/m);
  assert.match(lines, /^\[2\] https:\/\/example\.org\/b \(read\)$/m, 'a source no claim cites gets no grade');
  assert.match(lines, /\[3\] .*\(seen only in search results, not read · Single\)/);
  const block = singleBlock([{ text: 'Prices rose 4% in May [1][2].', ns: [1, 2] }]);
  const report = withSingleBlock('The answer.\n\n## Details\nMore.', block);
  assert.match(report, /^The answer\.\n\n\*\*Resting on one source\*\*[\s\S]*- Prices rose 4% in May \[1\]\[2\]\.\n\n## Details/);
  assert.equal(withSingleBlock('Only one paragraph.', ''), 'Only one paragraph.');
  assert.match(GRADES_NOTE, /judgement/);
});
