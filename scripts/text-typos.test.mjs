// Wording slips that were found in text people read ("Devices's", "the that"): they must not come back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const SKIP_DIR = new Set(['node_modules', 'dist', '.git', 'test', 'way-back']);
const TEXT = /\.(js|mjs|json|md|yml|command|sh)$/;
const BAD = [
  { name: "Devices's (write \"the Devices tools\" or \"Devices\" without 's)", pattern: /Devices(?:\\'|'|’|&apos;)s\b/ },
  { name: '"the that"', pattern: /\bthe that\b/i },
];

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIR.has(entry.name)) yield* files(join(dir, entry.name));
    } else if (TEXT.test(entry.name) && entry.name !== 'changelog.md' && entry.name !== 'text-typos.test.mjs') yield join(dir, entry.name);
  }
}

test('no known wording slips in the shipped text', () => {
  const found = [];
  for (const file of files(root)) {
    const text = readFileSync(file, 'utf8');
    for (const { name, pattern } of BAD) if (pattern.test(text)) found.push(`${relative(root, file)}: ${name}`);
  }
  assert.deepEqual(found, []);
});
