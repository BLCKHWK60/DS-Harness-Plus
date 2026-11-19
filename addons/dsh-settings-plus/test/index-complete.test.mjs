// The settings search must know every setting and every page (review SET-01, SET-05, SP-2).
// It reads each add-on's own schema (`Config` in index.js), its patch id (cordis.patch.yml) and every
// settings page its client registers, and fails when the shipped settings-index.json is missing one,
// lists one twice, points at a setting that no longer exists, or uses a developer word on screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ADDONS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const INDEX = JSON.parse(readFileSync(path.join(ADDONS, 'dsh-settings-plus', 'settings-index.json'), 'utf8'));
const FIELDS = [...new Set(INDEX.map((entry) => entry.field).filter(Boolean))];
const ADDON_DIRS = readdirSync(ADDONS).filter((dir) => existsSync(path.join(ADDONS, dir, 'index.js')) && existsSync(path.join(ADDONS, dir, 'cordis.patch.yml'))).sort();

// The namespace is the patch row whose package is this add-on (the first `id:` in the file is not always it).
const patchId = (dir) => {
  const text = readFileSync(path.join(ADDONS, dir, 'cordis.patch.yml'), 'utf8');
  return new RegExp(`id:\\s*(\\S+)\\s*\\n\\s*name:\\s*'?@local/${dir}'?\\s*\\n`).exec(text)?.[1] ?? /^\s*-?\s*id:\s*(\S+)/m.exec(text)?.[1];
};

/** Every setting of an add-on as a dotted path (objects are walked; anything else is one setting). */
function leaves(schema) {
  const out = [];
  const walk = (node, trail) => {
    if (node?.type === 'object' && node.dict) for (const [key, value] of Object.entries(node.dict)) walk(value, [...trail, key]);
    else out.push(trail.join('.'));
  };
  walk(schema, []);
  return out;
}

/** An index field covers a setting when it is the same path, a parent of it or a child of it. */
const covered = (key) => FIELDS.some((field) => field === key || key.startsWith(`${field}.`) || field.startsWith(`${key}.`));

const schemas = new Map();
for (const dir of ADDON_DIRS) {
  const mod = await import(pathToFileURL(path.join(ADDONS, dir, 'index.js')).href);
  if (mod.Config) schemas.set(dir, { id: patchId(dir), settings: leaves(mod.Config) });
}

test('every setting in every add-on schema has an entry in the search index', () => {
  const missing = [];
  for (const [dir, { id, settings }] of schemas) for (const setting of settings) if (!covered(`${id}.${setting}`)) missing.push(`${dir}: ${id}.${setting}`);
  assert.deepEqual(missing, [], `settings with no index entry (add one to dsh-settings-plus/settings-index.json; mark pure bookkeeping "internal": true):\n${missing.join('\n')}`);
});

test('no index entry points at a setting that is not in the add-on any more', () => {
  const byId = new Map([...schemas.values()].map((one) => [one.id, one.settings]));
  const stale = [];
  for (const entry of INDEX) {
    if (!entry.field) continue;
    const [ns, ...rest] = entry.field.split('.');
    const settings = byId.get(ns);
    if (!settings) continue; // the app's own settings (permission, general, ...) are not in an add-on schema
    const key = rest.join('.').split('.*')[0]; // `tiers.*.label` is a field of each item in `tiers`
    if (!settings.some((one) => one === key || one.startsWith(`${key}.`) || key.startsWith(`${one}.`))) stale.push(`${entry.page} › ${entry.label}: ${entry.field}`);
  }
  assert.deepEqual(stale, [], `index entries for settings that do not exist:\n${stale.join('\n')}`);
});

/** The settings pages each client registers: `id: 'x'` next to `name: 'settings.section'`. */
function pagesOf(dir) {
  const file = path.join(ADDONS, dir, 'client.js');
  if (!existsSync(file)) return [];
  const text = readFileSync(file, 'utf8');
  return [...text.matchAll(/name:\s*'settings\.section',\s*id:\s*'([^']+)'/g)].map((match) => match[1]);
}

test('every settings page has index entries and a place in the Settings Plus groups', () => {
  const indexed = new Set(INDEX.flatMap((entry) => [entry.page, entry.host].filter(Boolean)));
  const grouped = readFileSync(path.join(ADDONS, 'dsh-settings-plus', 'client.js'), 'utf8').match(/const GROUPS = \[([\s\S]*?)\n    \];/)?.[1] ?? '';
  const noIndex = [];
  const noGroup = [];
  for (const dir of readdirSync(ADDONS)) {
    for (const id of pagesOf(dir)) {
      if (!indexed.has(id)) noIndex.push(`${dir}: ${id}`);
      if (!grouped.includes(`'${id}'`)) noGroup.push(`${dir}: ${id}`);
    }
  }
  assert.deepEqual(noIndex, [], `pages missing from the search index:\n${noIndex.join('\n')}`);
  assert.deepEqual(noGroup, [], `pages missing from the groups in dsh-settings-plus/client.js:\n${noGroup.join('\n')}`);
});

test('the index has no duplicates and no developer words on screen', () => {
  const seen = new Map();
  const dupes = [];
  for (const entry of INDEX) {
    const key = [entry.page, entry.heading, entry.label, entry.field, entry.tab ?? ''].join('|');
    if (seen.has(key)) dupes.push(key);
    seen.set(key, true);
  }
  assert.deepEqual(dupes, [], `duplicate entries:\n${dupes.join('\n')}`);
  // Only the Plus pages: the app's own pages (General, Models, Plugins) keep the app's own words. "Tier" is the add-on's name for a
  // saved model setup and stays until the owner picks another word.
  const ours = new Set(readdirSync(ADDONS).flatMap((dir) => pagesOf(dir)));
  const words = /\b(composer|adapter|plugins?|sessions?|routes?)\b/i;
  const jargon = INDEX.filter((entry) => ours.has(entry.page) && entry.where !== 'plugins-panel' && entry.internal !== true && words.test(`${entry.label} ${entry.description}`)).map((entry) => `${entry.page} › ${entry.label}`);
  assert.deepEqual(jargon, [], `labels or descriptions with developer words (UI-STYLE rule 4):\n${jargon.join('\n')}`);
});

test('every copy of the shared merge block (dsh-merge) is identical', () => {
  const blocks = new Map();
  for (const dir of readdirSync(ADDONS)) {
    const file = path.join(ADDONS, dir, 'client.js');
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    const start = text.indexOf('/* dsh-merge:begin */');
    if (start < 0) continue;
    const end = text.indexOf('/* dsh-merge:end */', start);
    assert.ok(end > start, `${dir}: dsh-merge block has no end`);
    // Every copy is indented to sit inside its file's factory; compare without the indentation.
    blocks.set(dir, text.slice(start, end).split('\n').map((line) => line.trim()).join('\n'));
  }
  assert.ok(blocks.size >= 8, `expected the merge block in the host and partner pages, found ${blocks.size}`);
  const [first, ...rest] = [...blocks.values()];
  for (const [dir, block] of blocks) assert.equal(block, first, `${dir}: dsh-merge block differs from the others`);
});
