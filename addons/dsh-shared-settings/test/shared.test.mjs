import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fieldDigests, mergeSection, parseFieldList, resolveFolder, secretPaths, withoutPaths } from '../lib/core.mjs';
import { SharedSettingsEngine } from '../lib/engine.mjs';
import { DEFAULT_SKIP, pickFolder, shareRule } from '../index.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'dsh-shared-'));

/** A stand-in for the app's settings service: one user layer per entry, with revisions and schema secrets. */
function fakeApp(entries) {
  const rows = new Map(Object.entries(entries).map(([ns, row]) => [ns, { revision: 0, user: {}, secrets: [], ...row }]));
  return {
    rows,
    names: () => new Map([...rows].map(([ns, row]) => [ns, row.pkg])),
    describe(options) {
      return [...rows].map(([ns, row]) => {
        const user = structuredClone(row.user);
        if (options?.redactSecrets) for (const path of row.secrets) delete user[path[0]];
        return { ns, revision: row.revision, user, ...(options?.redactSecrets ? { secrets: row.secrets.map((path) => ({ path, set: true })) } : {}) };
      });
    },
    async replace(ns, section, revision) {
      const row = rows.get(ns);
      if (revision !== undefined && revision !== row.revision) throw new Error('settings/conflict');
      if (row.reject) throw new Error(row.reject);
      row.user = structuredClone(section);
      row.revision += 1;
    },
    /** A local edit, as a Settings page would make. */
    edit(ns, patch) {
      const row = rows.get(ns);
      row.user = { ...row.user, ...patch };
      for (const [key, value] of Object.entries(patch)) if (value === undefined) delete row.user[key];
      row.revision += 1;
    },
  };
}

/** One Mac: its own app state and data folder, the shared folder in common. */
function mac(folder, entries, extra = {}) {
  const app = fakeApp(entries);
  const engine = new SharedSettingsEngine({
    settings: app,
    entryNames: app.names,
    folder,
    dataDir: tmp(),
    share: shareRule(extra),
    skip: parseFieldList(DEFAULT_SKIP),
  });
  return { app, engine };
}

const plusEntries = () => ({
  modes: { pkg: '@local/dsh-modes' },
  'color-schemes': { pkg: '@local/dsh-color-schemes' },
  sync: { pkg: '@local/dsh-sync', user: { remote: '/Users/me/repo.git' } },
  'ui-theme': { pkg: '@deepseek-ai/dsh-client-ui-theme', user: { theme: 'dark' } },
});

const readFile = (folder) => JSON.parse(readFileSync(join(folder, 'settings.json'), 'utf8'));

test('three-way merge takes each side\'s own change and lets the file win a true conflict', () => {
  const record = fieldDigests({ a: 1, b: 1, c: 1, d: 1 });
  const result = mergeSection({ a: 2, b: 1, c: 5, d: 1 }, { a: 1, b: 3, c: 6 }, record);
  assert.deepEqual(result.merged, { a: 2, b: 3, c: 6 }); // d was removed in the file
  assert.deepEqual(result.conflicts, ['c']);
  assert.equal(result.toLocal, true);
  assert.equal(result.toFile, true);
  assert.deepEqual(mergeSection({ a: 1 }, undefined, record), { merged: { a: 1 }, toLocal: false, toFile: true, conflicts: [] });
});

test('secret-looking fields are found at any depth and removed', () => {
  const value = { tiers: { fast: { model: 'm', apiKey: 'k' } }, githubToken: 't', plain: 1 };
  assert.deepEqual(secretPaths(value), [['tiers', 'fast', 'apiKey'], ['githubToken']]);
  assert.deepEqual(withoutPaths(value, secretPaths(value)), { tiers: { fast: { model: 'm' } }, plain: 1 });
});

test('folders: ~ expands, relative paths are refused, iCloud-style paths with spaces work', () => {
  assert.equal(resolveFolder('~/Library/Mobile Documents/com~apple~CloudDocs/Plus', '/Users/a'), '/Users/a/Library/Mobile Documents/com~apple~CloudDocs/Plus');
  assert.equal(resolveFolder('relative/dir', '/Users/a'), '');
  assert.equal(resolveFolder('', '/Users/a'), '');
  const data = tmp();
  writeFileSync(join(data, 'folder.txt'), '/Volumes/x/Shared Plus\n');
  assert.equal(pickFolder('', data), '/Volumes/x/Shared Plus');
  assert.equal(pickFolder('/own/place', data), '/own/place');
  assert.equal(pickFolder('not-absolute', data), '', 'a bad setting turns it off rather than falling back');
});

test('only Plus add-ons are shared by default, never sync or this add-on; include and exclude work', () => {
  const rule = shareRule({ include: ['ui-theme'], exclude: ['modes'] });
  assert.equal(rule('color-schemes', '@local/dsh-color-schemes'), true);
  assert.equal(rule('modes', '@local/dsh-modes'), false);
  assert.equal(rule('sync', '@local/dsh-sync'), false);
  assert.equal(rule('shared-settings', '@local/dsh-shared-settings'), false);
  assert.equal(rule('ui-theme', '@deepseek-ai/dsh-client-ui-theme'), true);
  assert.equal(rule('benchlab', 'dsh-plugin-benchlab'), false);
});

test('first Mac writes the file; it holds Plus settings only, and no secrets or per-conversation fields', async () => {
  const folder = tmp();
  const a = mac(folder, plusEntries());
  a.app.rows.get('modes').user = { defaultMode: 'code', sessionModes: '{"s1":"chat"}', apiKey: 'SECRET-VALUE' };
  a.app.rows.get('color-schemes').user = { scheme: 'nord', token: 'x' };
  a.app.rows.get('color-schemes').secrets = [['custom']];
  a.app.rows.get('color-schemes').user.custom = 'SCHEMA-SECRET';
  const status = await a.engine.run();
  assert.equal(status.state, 'ok');
  const text = readFileSync(join(folder, 'settings.json'), 'utf8');
  assert.doesNotMatch(text, /SECRET|sessionModes|remote|theme"/);
  assert.deepEqual(readFile(folder).settings, { 'color-schemes': { scheme: 'nord' }, modes: { defaultMode: 'code' } });
});

test('second Mac adopts the file on first contact, keeps its own secrets and per-conversation fields, and backs up', async () => {
  const folder = tmp();
  const a = mac(folder, plusEntries());
  a.app.rows.get('modes').user = { defaultMode: 'code', modes: '{"x":1}' };
  await a.engine.run();

  const b = mac(folder, plusEntries());
  b.app.rows.get('modes').user = { defaultMode: 'chat', sessionModes: '{"s9":"code"}', apiKey: 'MINE' };
  const status = await b.engine.run();
  assert.deepEqual(status.applied, ['modes']);
  assert.deepEqual(b.app.rows.get('modes').user, { defaultMode: 'code', modes: '{"x":1}', sessionModes: '{"s9":"code"}', apiKey: 'MINE' });
  const backups = readdirSync(join(b.engine.dataDir, 'backups'));
  assert.equal(backups.length, 1);
  assert.match(readFileSync(join(b.engine.dataDir, 'backups', backups[0]), 'utf8'), /"chat"/);
});

test('edits travel both ways, and a quiet round changes nothing', async () => {
  const folder = tmp();
  const a = mac(folder, plusEntries());
  const b = mac(folder, plusEntries());
  await a.engine.run();
  await b.engine.run();

  a.app.edit('color-schemes', { scheme: 'solarized' });
  assert.deepEqual((await a.engine.run()).exported, ['color-schemes']);
  assert.deepEqual((await b.engine.run()).applied, ['color-schemes']);
  assert.equal(b.app.rows.get('color-schemes').user.scheme, 'solarized');

  b.app.edit('modes', { defaultMode: 'chat' });
  await b.engine.run();
  await a.engine.run();
  assert.equal(a.app.rows.get('modes').user.defaultMode, 'chat');

  // Resetting a field to its default on one Mac resets it on the other.
  a.app.edit('color-schemes', { scheme: undefined });
  await a.engine.run();
  await b.engine.run();
  assert.equal('scheme' in b.app.rows.get('color-schemes').user, false);

  const before = readFileSync(join(folder, 'settings.json'), 'utf8');
  const quietA = await a.engine.run();
  const quietB = await b.engine.run();
  assert.deepEqual([quietA.applied, quietA.exported, quietB.applied, quietB.exported], [[], [], [], []]);
  assert.equal(readFileSync(join(folder, 'settings.json'), 'utf8'), before, 'no rewrite when nothing changed');
});

test('different fields changed on each Mac at once are both kept; the same field is a conflict the file wins', async () => {
  const folder = tmp();
  const a = mac(folder, plusEntries());
  const b = mac(folder, plusEntries());
  await a.engine.run();
  await b.engine.run();

  a.app.edit('modes', { defaultMode: 'chat', modes: '{"a":1}' });
  b.app.edit('modes', { defaultMode: 'code' });
  await b.engine.run(); // b reaches the file first
  const status = await a.engine.run();
  assert.deepEqual(status.conflicts, ['modes.defaultMode']);
  assert.match(status.warnings.join(' '), /both Macs/);
  assert.deepEqual(a.app.rows.get('modes').user, { defaultMode: 'code', modes: '{"a":1}' });
  await b.engine.run();
  assert.deepEqual(b.app.rows.get('modes').user, { defaultMode: 'code', modes: '{"a":1}' });
});

test('a hand edit of the file is applied', async () => {
  const folder = tmp();
  const a = mac(folder, plusEntries());
  await a.engine.run();
  const data = readFile(folder);
  data.settings['color-schemes'] = { scheme: 'paper' };
  writeFileSync(join(folder, 'settings.json'), JSON.stringify(data));
  assert.deepEqual((await a.engine.run()).applied, ['color-schemes']);
  assert.equal(a.app.rows.get('color-schemes').user.scheme, 'paper');
});

test('a broken file is never overwritten; sections for add-ons this Mac lacks are kept', async () => {
  const folder = tmp();
  writeFileSync(join(folder, 'settings.json'), '{ not json');
  const a = mac(folder, plusEntries());
  a.app.edit('modes', { defaultMode: 'code' });
  const status = await a.engine.run();
  assert.equal(status.state, 'blocked');
  assert.equal(readFileSync(join(folder, 'settings.json'), 'utf8'), '{ not json');

  writeFileSync(join(folder, 'settings.json'), JSON.stringify({ format: 1, settings: { 'model-tiers': { maxSubagents: 3 } } }));
  await a.engine.run();
  assert.deepEqual(Object.keys(readFile(folder).settings).sort(), ['color-schemes', 'model-tiers', 'modes']);

  writeFileSync(join(folder, 'settings.json'), JSON.stringify({ format: 99, settings: {} }));
  assert.match((await a.engine.run()).problems[0], /newer/);
});

test('missing folder and an iCloud placeholder wait instead of writing', async () => {
  const gone = join(tmp(), 'not-there');
  const a = mac(gone, plusEntries());
  assert.equal((await a.engine.run()).state, 'waiting');
  assert.equal(existsSync(gone), false);

  const folder = tmp();
  writeFileSync(join(folder, '.settings.json.icloud'), 'placeholder');
  const asked = [];
  const b = mac(folder, plusEntries());
  b.engine.onPlaceholder = (file) => asked.push(file);
  const status = await b.engine.run();
  assert.equal(status.state, 'waiting');
  assert.deepEqual(asked, [join(folder, 'settings.json')]);
  assert.equal(existsSync(join(folder, 'settings.json')), false);
});

test('a write that would overwrite a change made meanwhile is retried, and conflict copies are reported', async () => {
  const folder = tmp();
  const a = mac(folder, plusEntries());
  await a.engine.run();
  a.app.edit('modes', { defaultMode: 'chat' });
  // The other Mac writes between our read and our write.
  const original = a.app.describe.bind(a.app);
  let once = true;
  a.app.describe = (options) => {
    if (once && options?.redactSecrets) {
      once = false;
      const data = readFile(folder);
      data.settings['color-schemes'] = { scheme: 'from-b' };
      writeFileSync(join(folder, 'settings.json'), JSON.stringify(data));
    }
    return original(options);
  };
  const first = await a.engine.run();
  assert.equal(first.retry, true);
  assert.equal(readFile(folder).settings['color-schemes'].scheme, 'from-b');
  const second = await a.engine.run();
  assert.equal(second.state, 'ok');
  assert.equal(readFile(folder).settings.modes.defaultMode, 'chat');
  assert.equal(a.app.rows.get('color-schemes').user.scheme, 'from-b');

  writeFileSync(join(folder, 'settings 2.json'), '{}');
  assert.match((await a.engine.run()).warnings.join(' '), /conflict copies/);
});

test('an entry the app refuses is reported and left out of the sync record', async () => {
  const folder = tmp();
  const a = mac(folder, plusEntries());
  a.app.edit('modes', { defaultMode: 'code' });
  await a.engine.run();
  const b = mac(folder, plusEntries());
  b.app.rows.get('modes').reject = 'Config field "x" is not volatile';
  const status = await b.engine.run();
  assert.equal(status.state, 'partly');
  assert.match(status.problems[0], /not volatile/);
  assert.equal(JSON.parse(readFileSync(b.engine.stateFile, 'utf8')).sections.modes, undefined);
  assert.equal(readFile(folder).settings.modes.defaultMode, 'code', 'the file keeps the shared value');
});
