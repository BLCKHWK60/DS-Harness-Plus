// Checks that the user documents match the product: the add-on count, the add-on list and its tiers, and the
// plain-words parts the owner asked for (glossary, "not affiliated").
//   ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test scripts/docs.test.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const addons = readdirSync(join(ROOT, 'addons')).filter((d) => existsSync(join(ROOT, 'addons', d, 'package.json')));
const WORDS = { Forty: 40, 'Forty-one': 41, 'Forty-two': 42, 'Forty-eight': 48, 'Forty-nine': 49, Thirty: 30, 'Thirty-four': 34 };

test('every "N add-ons" claim in the user documents is the real number', () => {
  assert.equal(addons.length, 49, 'the product has 49 add-ons; change this test and the documents together');
  for (const file of ['README.md', 'docs/ADD-ONS.md', 'docs/GUIDE.md', 'docs/guide-part1.md', 'docs/HOW-IT-WORKS.md', 'docs/MODES-AND-SETTINGS.md']) {
    const text = read(file);
    for (const m of text.matchAll(/\b(\d+|Forty-eight|Forty-nine|Forty-two|Forty-one|Forty|Thirty-four|Thirty)\s+add-ons\b/g)) {
      const n = /^\d/.test(m[1]) ? Number(m[1]) : WORDS[m[1]];
      assert.equal(n, addons.length, `${file}: "${m[0]}"`);
    }
  }
});

test('ADD-ONS.md lists every add-on once, links to a heading that exists, and shows the right tier', () => {
  const text = read('docs/ADD-ONS.md');
  const rows = [...text.matchAll(/^\| \[([^\]]+)\]\(#([^)]+)\) \| ([^|]+) \|/gm)];
  assert.equal(rows.length, addons.length, 'one row per add-on');
  const anchors = new Set([...text.matchAll(/^#{2,3} (.+)$/gm)].map((m) => m[1].toLowerCase().replace(/[^a-z0-9 -]/g, '').trim().replace(/ /g, '-')));
  for (const [, name, anchor] of rows) assert.ok(anchors.has(anchor), `${name}: no heading for #${anchor}`);
  const tiers = JSON.parse(read('addon-tiers.json')).addons;
  const label = { core: 'Core', beta: 'Beta', experimental: 'Experimental', separate: 'Separate download' };
  const counts = {};
  for (const [, , , tier] of rows) counts[tier.trim()] = (counts[tier.trim()] ?? 0) + 1;
  const expected = {};
  for (const folder of addons) expected[label[tiers[folder].tier]] = (expected[label[tiers[folder].tier]] ?? 0) + 1;
  assert.deepEqual(counts, expected, 'the number of add-ons in each tier matches addon-tiers.json');
});

test('the README has the glossary and the not-affiliated line, and the guide has the chat box section', () => {
  const readme = read('README.md');
  assert.match(readme, /\*\*Not affiliated with DeepSeek\.\*\*/);
  assert.match(readme, /## Words used in this guide/);
  for (const word of ['Add-on', 'Space', 'Mode', 'Thread', 'Workspace', 'Tier']) assert.match(readme, new RegExp(`\\*\\*${word}[^*]*:\\*\\*`), word);
  const guide = read('docs/GUIDE.md');
  assert.match(guide, /### 3\. The chat box, button by button/);
  for (const button of ['Access level', 'Web', 'Depth', 'Models chip', 'Tools', 'Start Mission', 'Mode', 'Export', 'Settings gear', 'Send', 'Place chip', 'Scout', 'Finance', 'Creator Plus']) assert.ok(guide.includes(`**${button}`), `the guide describes ${button}`);
});

test('the guide is what the generator makes from guide-part1.md (run node scripts/dev-guide.mjs)', () => {
  const guide = read('docs/GUIDE.md');
  const part1 = read('docs/guide-part1.md').trimEnd();
  assert.ok(guide.startsWith(part1), 'GUIDE.md starts with guide-part1.md, so a hand edit in one was not copied to the other');
});

test('user documents carry no maintainer-only notes', () => {
  for (const file of ['README.md', 'docs/ADD-ONS.md', 'docs/GUIDE.md', 'docs/HOW-IT-WORKS.md', 'docs/MODES-AND-SETTINGS.md']) {
    const text = read(file);
    for (const maintainer of ['docs/HANDOFF.md', 'NEXT-FEATURES-STEPS', 'OVERNIGHT-', 'NEXT-SESSION-PROMPT', 'MODES-AND-SETTINGS-AUDIT']) assert.ok(!text.includes(maintainer), `${file} points at ${maintainer}, which is not in the download`);
  }
});
