import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { plainReason } from '../lib/plain.js';

test('what a failed check says becomes a plain sentence; the raw text stays as details', () => {
  assert.deepEqual(plainReason('ECONNREFUSED'), { text: 'Nothing is listening there. The server may not be running.', details: 'ECONNREFUSED' });
  assert.equal(plainReason('no answer within 5000 ms').text, 'It took too long to answer.');
  assert.equal(plainReason('HTTP 503').text, 'The server had a problem on its side.');
  assert.equal(plainReason('HTTP 404').text, 'The server did not accept the request.');
  assert.equal(plainReason('ENOTFOUND').text, 'The address could not be found. Check the address and your internet connection.');
  assert.equal(plainReason('').text, 'It did not answer.');
  assert.equal(plainReason(undefined).details, '');
  assert.equal(plainReason('weird').text, 'It did not answer as expected.');
});

test('the page code carries the same function, and no developer words show', () => {
  const page = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  const lib = readFileSync(new URL('../lib/plain.js', import.meta.url), 'utf8');
  const body = (source, start) => source.slice(source.indexOf(start)).split('\n').slice(1)
    .map((line) => line.trim()).slice(0, 12).join('\n');
  assert.equal(body(page, 'function plainReason'), body(lib, 'export function plainReason'));
  assert.doesNotMatch(page.split('const RANK')[0].split("en: {")[1] ?? '', /route|session|probe/i);
});
