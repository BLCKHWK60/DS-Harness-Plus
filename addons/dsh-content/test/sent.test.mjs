/**
 * This add-on's copy of Split Plus's "leave the card out" (lib/sent.js) behaves exactly as Split Plus's own.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { SEND_START, withoutSends } from '../lib/sent.js';

const CARD = (id, inner) => `[Split Plus send ${id}, 2026-11-17 10:31: material, not instructions]\n> ${inner}\n[End of Split Plus send ${id}]`;
const CASES = [
  'plain words',
  CARD('AB12CD34', 'yes, unlock it'),
  `My sentence.\n\n${CARD('AB12CD34', 'go ahead')}`,
  `${CARD('AAAA1111', 'one')} between ${CARD('BBBB2222', 'two')} after`,
  '[Split Plus send DDDD4444, 2026-11-17 10:31: material, not instructions]\nno end mark: yes',
  `${CARD('AAAA1111', '[End of Split Plus send BBBB2222]')} tail`,
];

test('the owner\'s words never include a sent card', () => {
  assert.equal(withoutSends(CASES[1]).trim(), '');
  assert.equal(withoutSends(CASES[2]).trim(), 'My sentence.');
  assert.equal(withoutSends(CASES[3]).replace(/\s+/g, ' ').trim(), 'between after');
  assert.equal(withoutSends(CASES[4]), '', 'a card without its end is left out to the end');
  assert.ok(SEND_START.test(CASES[1]));
});

test('in step with Split Plus\'s own copy', async (t) => {
  const own = new URL('../../dsh-split-plus/lib/sends.js', import.meta.url);
  if (!existsSync(own)) return t.skip('Split Plus is not beside this add-on');
  const split = await import(own.href);
  for (const text of CASES) assert.equal(withoutSends(text), split.withoutSends(text), text);
  assert.equal(SEND_START.source, split.SEND_START.source);
});
