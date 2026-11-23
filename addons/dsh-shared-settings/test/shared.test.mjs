import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOCAL_KEY, fieldDigests, localPaths, mergeSection, parseFieldList, resolveFolder, secretPaths, withoutPaths } from '../lib/core.mjs';
import { SharedSettingsEngine } from '../lib/engine.mjs';
import { ALWAYS_SKIP, DEFAULT_SKIP, pickFolder, shareRule, skipList } from '../index.mjs';

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
    skip: parseFieldList(extra.skip ?? DEFAULT_SKIP),
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

test('the README names every field that always stays on each Mac, and how many there are', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const line = readme.split('\n').find((text) => text.includes('`modes.sessionIsolated`')) ?? '';
  const fields = ALWAYS_SKIP.map((path) => path.replace(/^modes\./, ''));
  for (const field of fields) assert.ok(line.includes(`\`${field}\``) || line.includes(`\`modes.${field}\``), `${field} is listed`);
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'twenty-one', 'twenty-two', 'twenty-three'];
  assert.match(readme, new RegExp(`The ${words[ALWAYS_SKIP.filter((path) => path.startsWith('modes.')).length]} \`modes\` fields on the second line stay on each Mac`));
});

test('per-Mac Modes fields are never written to or taken from the file, even with your own skipFields', async () => {
  const own = skipList(['color-schemes.custom']);
  assert.ok(own.includes('color-schemes.custom') && own.includes('modes.sessionIsolated') && own.includes('modes.extraModes'));
  assert.ok(own.includes('modes.sessionSandboxBase'), 'each conversation\'s earlier access level stays on its Mac');
  assert.ok(!own.includes('modes.sessionModes'), 'your own list replaces the default for the other fields');
  assert.deepEqual(skipList(undefined), DEFAULT_SKIP);

  const perMac = (tag) => ({
    extraModes: `{"${tag}":{}}`,
    sessionIsolated: `{"${tag}":true}`,
    sessionSearchDepth: `{"${tag}":"deep"}`,
    sessionTools: `{"${tag}":false}`,
    sessionHelpers: `{"${tag}":"same"}`,
    sessionToolSets: `{"${tag}":["web"]}`,
    sessionSandboxBase: `{"${tag}":{"base":"workspace-write","set":"read-only"}}`,
  });
  const folder = tmp();
  const a = mac(folder, plusEntries(), { skip: own });
  a.app.rows.get('modes').user = { defaultMode: 'code', ...perMac('a1') };
  await a.engine.run();
  assert.deepEqual(readFile(folder).settings.modes, { defaultMode: 'code' });

  // A file that holds them anyway (an older copy, a hand edit) does not change this Mac's own.
  const data = readFile(folder);
  data.settings.modes = { defaultMode: 'chat', ...perMac('from-file') };
  writeFileSync(join(folder, 'settings.json'), JSON.stringify(data));
  const b = mac(folder, plusEntries(), { skip: own });
  b.app.rows.get('modes').user = { defaultMode: 'code', ...perMac('b1') };
  await b.engine.run();
  assert.deepEqual(b.app.rows.get('modes').user, { defaultMode: 'chat', ...perMac('b1') });
});

test('fields about this Mac (switches, folders, paths, servers, permissions, per-conversation) never leave it', async () => {
  const perMac = {
    enabled: true, folder: '/Users/me/x', folders: ['/a'], exportFolder: '/Users/me/out', plusFolder: '/p', torPath: '/usr/local/bin/tor',
    wireproxyPath: '/w', opencodePath: '/o', pythonSetup: 'x', engineHost: 'h', usenetHost: 'n', usenetPort: 563, ntfyTopic: 'secret-topic',
    ntfyServer: 'https://n', dangerPagesRun: true, dangerFileHolds: true, allowRiskyWrites: true, allowInternet: true, anywhere: true,
    trusted: ['x'], sessionWeb: '{}', sessionUltra: '{}', nolearn: '{}', phone: '1', logReaders: '[]', startPlaces: '[]',
  };
  const setup = { tiers: '[]', customTiers: '[]', modelProfiles: '{}', presets: '[]', byMode: '{}', scheme: 'x', custom: '{}', tabs: '[]', maxTabs: 8, defaultMode: 'code', modes: '[]', roleModels: '{}', fallbackChains: '[]', opaqueMacSidebar: true };
  for (const key of Object.keys(perMac)) assert.ok(LOCAL_KEY.test(key), `${key} must stay on this Mac`);
  for (const key of Object.keys(setup)) assert.ok(!LOCAL_KEY.test(key), `${key} is setup and may be shared`);
  assert.deepEqual(localPaths({ a: { torPath: 'x', ok: 1 }, enabled: true }).map((path) => path.join('.')).sort(), ['a.torPath', 'enabled']);

  const folder = tmp();
  // An entry the add-on knows nothing about, with a mix of both kinds, even in a nested object.
  const entries = () => ({ 'new-addon': { pkg: '@local/dsh-new-addon' } });
  const a = mac(folder, entries());
  a.app.rows.get('new-addon').user = { ...perMac, ...setup, nested: { torPath: '/x', keep: 1 } };
  await a.engine.run();
  const shared = readFile(folder).settings['new-addon'];
  assert.deepEqual(Object.keys(shared).sort(), [...Object.keys(setup), 'nested'].sort());
  assert.deepEqual(shared.nested, { keep: 1 });

  // A file that holds them anyway (hand edit, older version) changes nothing of this Mac's own.
  const data = readFile(folder);
  data.settings['new-addon'] = { ...setup, enabled: false, folder: '/Users/other/x', ntfyTopic: 'other', nested: { torPath: '/other', keep: 2 } };
  writeFileSync(join(folder, 'settings.json'), JSON.stringify(data));
  const b = mac(folder, entries());
  b.app.rows.get('new-addon').user = { enabled: true, folder: '/Users/me/x', ntfyTopic: 'mine', nested: { torPath: '/mine' } };
  await b.engine.run();
  const user = b.app.rows.get('new-addon').user;
  assert.equal(user.enabled, true);
  assert.equal(user.folder, '/Users/me/x');
  assert.equal(user.ntfyTopic, 'mine');
  assert.equal(user.nested.torPath, '/mine');
});

test('Recon and Notify are never shared, even when asked to be by default', () => {
  const rule = shareRule({});
  assert.equal(rule('recon', '@local/dsh-recon'), false);
  assert.equal(rule('notify', '@local/dsh-notify'), false);
  assert.equal(rule('modes', '@local/dsh-modes'), true);
});

test('a Mac updated to 1.0 leaves an older Mac\'s switches and paths in the file, so the older Mac keeps them', async () => {
  const folder = tmp();
  // What an older Mac wrote: its own switches and paths were shared.
  const oldSection = { enabled: false, torPath: '/old/tor', exportFolder: '/old/out', scheme: 'a' };
  writeFileSync(join(folder, 'settings.json'), JSON.stringify({ format: 1, settings: { 'new-addon': oldSection } }));
  const oldSynced = fieldDigests(oldSection);

  const b = mac(folder, { 'new-addon': { pkg: '@local/dsh-new-addon' } });
  b.app.rows.get('new-addon').user = { enabled: true, torPath: '/new/tor', scheme: 'a' };
  await b.engine.run();
  b.app.edit('new-addon', { scheme: 'b' });
  await b.engine.run();

  const inFile = readFile(folder).settings['new-addon'];
  assert.equal(inFile.scheme, 'b', 'the shared change travels');
  assert.equal(inFile.enabled, false, 'the older Mac\'s switch is not deleted from the file');
  assert.equal(inFile.torPath, '/old/tor');
  assert.equal(inFile.exportFolder, '/old/out');
  // The older Mac's own merge (it shares those fields) finds nothing changed for them.
  const olderLocal = { enabled: false, torPath: '/old/tor', exportFolder: '/old/out', scheme: 'a' };
  const merged = mergeSection(olderLocal, inFile, oldSynced);
  assert.equal(merged.merged.enabled, false);
  assert.equal(merged.merged.torPath, '/old/tor');
  assert.equal(merged.merged.exportFolder, '/old/out');
  assert.equal(merged.merged.scheme, 'b');
  // The 1.0 Mac itself never took them.
  assert.equal(b.app.rows.get('new-addon').user.enabled, true);
});

test('the first-run marker and the Simple/Advanced choice of Settings Plus stay on each Mac', async () => {
  assert.ok(ALWAYS_SKIP.includes('settings-plus.view') && ALWAYS_SKIP.includes('settings-plus.setupPending'));
  const folder = tmp();
  const entries = () => ({ 'settings-plus': { pkg: '@local/dsh-settings-plus' } });
  const a = mac(folder, entries(), { skip: skipList(undefined) });
  a.app.rows.get('settings-plus').user = { view: 'simple', setupPending: true, modeGear: false };
  await a.engine.run();
  assert.deepEqual(readFile(folder).settings['settings-plus'], { modeGear: false }, 'the choice and the marker are not written');

  const data = readFile(folder);
  data.settings['settings-plus'] = { view: 'advanced', setupPending: false, modeGear: true };
  writeFileSync(join(folder, 'settings.json'), JSON.stringify(data));
  const b = mac(folder, entries(), { skip: skipList(undefined) });
  b.app.rows.get('settings-plus').user = { view: 'simple', setupPending: true };
  await b.engine.run();
  assert.deepEqual(b.app.rows.get('settings-plus').user, { view: 'simple', setupPending: true, modeGear: true }, 'taken from the file: only the shared field');
});
