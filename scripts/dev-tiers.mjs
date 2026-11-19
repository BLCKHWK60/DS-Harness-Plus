// Maintainer tool: keeps the add-on table in README.md the same as addon-tiers.json.
//   node scripts/dev-tiers.mjs            rewrite the table between the markers in README.md
//   node scripts/dev-tiers.mjs --check    exit 1 if README.md is out of date
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tiers = JSON.parse(readFileSync(join(root, 'addon-tiers.json'), 'utf8'));
const readme = join(root, 'README.md');
const START = '<!-- tiers:start (made from addon-tiers.json by scripts/dev-tiers.mjs; do not edit by hand) -->';
const END = '<!-- tiers:end -->';

const order = ['core', 'beta', 'experimental', 'separate'];
const names = { core: 'Core: finished, on by default', beta: 'Beta: installed but off until you switch it on', experimental: 'Experimental: only with "Everything", off until you switch it on', separate: 'Separate download' };
const lines = [START];
for (const tier of order) {
  const rows = Object.entries(tiers.addons).filter(([, a]) => a.tier === tier).sort((a, b) => a[1].label.localeCompare(b[1].label));
  lines.push('', `**${names[tier]} (${rows.length})**`, '', '| Add-on | Why |', '| --- | --- |');
  for (const [, a] of rows) lines.push(`| ${a.label} | ${a.reason} |`);
}
lines.push('', END);
const block = lines.join('\n');

const text = readFileSync(readme, 'utf8');
const a = text.indexOf('<!-- tiers:start'), b = text.indexOf(END);
if (a < 0 || b < 0) { console.error('README.md has no tiers markers'); process.exit(1); }
const next = text.slice(0, a) + block + text.slice(b + END.length);
if (process.argv.includes('--check')) process.exit(next === text ? 0 : 1);
writeFileSync(readme, next);
