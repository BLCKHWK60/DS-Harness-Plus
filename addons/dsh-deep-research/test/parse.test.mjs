// Small readers every run leans on: URLs compared for repeats, and JSON pulled from model answers.
import assert from 'node:assert/strict';
import test from 'node:test';
import { extractJson, normalizeUrl } from '../index.js';

test('URLs: host in lower case, no fragment, no bare trailing slash; only http and https', () => {
  assert.equal(normalizeUrl(' https://Example.COM/#top '), 'https://example.com');
  assert.equal(normalizeUrl('https://example.com/a/'), 'https://example.com/a/', 'a path keeps its slash');
  assert.equal(normalizeUrl('http://example.com/a?b=1#c'), 'http://example.com/a?b=1');
  assert.equal(normalizeUrl('ftp://example.com/x'), null);
  assert.equal(normalizeUrl('mailto:someone@example.com'), null);
  assert.equal(normalizeUrl('not a url'), null);
  assert.equal(normalizeUrl(undefined), null);
});

test('JSON from a model answer: fenced, wrapped in prose, or not there', () => {
  assert.deepEqual(extractJson('Here it is:\n```json\n{"a": 1}\n```\nDone.'), { a: 1 });
  assert.deepEqual(extractJson('The plan is {"questions": ["x", "y"]} as asked.'), { questions: ['x', 'y'] });
  assert.deepEqual(extractJson('{"a": {"b": 2}} and a stray } later'), { a: { b: 2 } }, 'a shorter slice is tried when the longest does not parse');
  assert.equal(extractJson('no json here'), null);
  assert.equal(extractJson('{broken'), null);
  assert.equal(extractJson(undefined), null);
});
