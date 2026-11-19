// Copies docs/shared/dsh-kit.js into every add-on page file (addons/*/client.js) that has the two marker lines.
// `node scripts/sync-kit.mjs` rewrites them; `node scripts/sync-kit.mjs --check` only reports drift (exit 1).
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
// Two shared blocks: the small helpers (docs/shared/dsh-kit.js) and the shared page parts (docs/shared/dsh-ui.js).
// A page file uses a block by having its two marker lines; the master carries both markers itself.
const BLOCKS = [
  { name: 'dsh-kit', master: 'docs/shared/dsh-kit.js', begin: '// ---- dsh-kit:begin ----', end: '// ---- dsh-kit:end ----' },
  { name: 'dsh-ui', master: 'docs/shared/dsh-ui.js', begin: '// ---- dsh-ui:begin ----', end: '// ---- dsh-ui:end ----' },
  // The shared Settings copy and the pause-when-hidden polling loop (Phase 3 performance work).
  { name: 'dsh-poll', master: 'docs/shared/dsh-poll.js', begin: '// ---- dsh-poll:begin ----', end: '// ---- dsh-poll:end ----' },
];
let drift = 0;
for (const { name: blockName, master: masterPath, begin: BEGIN, end: END } of BLOCKS) {
  const master = readFileSync(join(root, masterPath), 'utf8').trimEnd();
  let blockDrift = 0;
  let seen = 0;
  for (const name of readdirSync(join(root, 'addons')).sort()) {
    const file = join(root, 'addons', name, 'client.js');
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    const from = text.indexOf(BEGIN);
    const to = text.indexOf(END);
    if (from < 0 || to < from) continue;
    seen += 1;
    // Keep the indentation of the begin marker's line.
    const lineStart = text.lastIndexOf('\n', from) + 1;
    const indent = text.slice(lineStart, from);
    const block = master.split('\n').map((line, i) => (i === 0 || line === '' ? line : indent + line)).join('\n');
    const next = text.slice(0, from) + block.replace(/^\s+/, '') + text.slice(to + END.length);
    if (next !== text) {
      blockDrift += 1;
      if (check) console.log(`${blockName} copy differs: addons/${name}/client.js`);
      else writeFileSync(file, next);
    }
  }
  drift += blockDrift;
  if (check) console.log(blockDrift === 0 ? `${blockName}: ${seen} copies match the master` : `${blockName}: ${blockDrift} of ${seen} copies differ (run: node scripts/sync-kit.mjs)`);
  else console.log(`${blockName}: ${seen} copies, ${blockDrift} updated`);
}

// ---- the shared JSON-store helper (review H4): docs/shared/json-store.js is copied, as it is, to every
// addons/<name>/lib/json-store.js that exists. A new add-on adds the file once (an empty one is filled by this script).
const storeMaster = readFileSync(join(root, 'docs/shared/json-store.js'), 'utf8');
let storeDrift = 0;
let storeSeen = 0;
for (const name of readdirSync(join(root, 'addons')).sort()) {
  const file = join(root, 'addons', name, 'lib', 'json-store.js');
  if (!existsSync(file)) continue;
  storeSeen += 1;
  if (readFileSync(file, 'utf8') === storeMaster) continue;
  storeDrift += 1;
  if (check) console.log(`json-store copy differs: addons/${name}/lib/json-store.js`);
  else writeFileSync(file, storeMaster);
}
if (check) console.log(storeDrift === 0 ? `json-store: ${storeSeen} copies match the master` : `json-store: ${storeDrift} of ${storeSeen} copies differ (run: node scripts/sync-kit.mjs)`);
else console.log(`json-store: ${storeSeen} copies, ${storeDrift} updated`);
if (check) process.exit(drift === 0 && storeDrift === 0 ? 0 : 1);
