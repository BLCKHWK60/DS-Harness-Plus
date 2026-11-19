// The "merge" block (how a partner add-on's settings part joins its host's page) is copied into ten client files.
// Nothing else keeps those copies alike, so this compares them: a change made in one copy and not the others fails here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../addons/', import.meta.url).pathname;
const BEGIN = '/* dsh-merge:begin */';
const END = '/* dsh-merge:end */';

/** The block of one file, without indentation (the copies sit at different depths). */
const blockOf = (text) => {
  const from = text.indexOf(BEGIN);
  const to = text.indexOf(END);
  if (from < 0 || to < from) return null;
  return text.slice(from + BEGIN.length, to).split('\n').map((line) => line.trim()).filter(Boolean).join('\n');
};

const copies = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith('dsh-'))
  .map((entry) => ({ addon: entry.name, file: join(root, entry.name, 'client.js') }))
  .flatMap((one) => {
    try {
      const block = blockOf(readFileSync(one.file, 'utf8'));
      return block === null ? [] : [{ addon: one.addon, block }];
    } catch {
      return [];
    }
  });

test('the merge block is found in ten add-ons', () => {
  assert.equal(copies.length, 10, `found in: ${copies.map((one) => one.addon).join(', ')}`);
  for (const one of copies) assert.ok(one.block.length > 500, `${one.addon}'s copy is not empty`);
});

test('all copies of the merge block are the same', () => {
  const [first, ...rest] = copies;
  for (const one of rest) {
    if (one.block === first.block) continue;
    const a = first.block.split('\n');
    const b = one.block.split('\n');
    const at = a.findIndex((line, i) => line !== b[i]);
    assert.fail(`${one.addon}'s merge block differs from ${first.addon}'s at line ${at + 1}:\n  ${first.addon}: ${a[at]}\n  ${one.addon}: ${b[at]}\nChange every copy the same way.`);
  }
});
