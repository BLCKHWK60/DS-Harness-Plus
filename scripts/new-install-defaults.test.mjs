// Tests for the safer starting values of a first install (decision 6 of PLAN-1.0).
//   ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test scripts/new-install-defaults.test.mjs
// The last test makes a throwaway app home and asks the app itself which values are in force.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { idsIn, withDefaults } from './new-install-defaults.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const defaults = JSON.parse(readFileSync(join(ROOT, 'new-install-defaults.json'), 'utf8'));
const row = (id) => defaults.rows.find((r) => r.id === id);

test('the three safer values are the ones the owner chose', () => {
  assert.equal(row('budget').config.maxTokens, 5000000, 'a lower per-task token limit (the app default is 20 million)');
  assert.equal(row('activity').config.words, true, 'Activity shows words, not codes');
  assert.equal(row('model-tiers').config.tiers.code.effort, 'high', 'Code review starts at High, not Ultra');
  assert.ok(!('dayTokens' in row('budget').config), 'the daily limit is asked in the first-run card, never preset');
  assert.equal(defaults.prepared.budget.dayTokens, 0, 'the prepared daily limit is still "no limit" until the card asks');
});

test('a default is a normal value: no user-specific text, and nothing the add-on itself would not accept', () => {
  const text = JSON.stringify(defaults);
  assert.ok(!/\/Users\/|@[a-z0-9-]+\.(com|org)|https?:|\d+\.\d+\.\d+\.\d+/i.test(text), 'no paths, e-mail addresses, URLs or IPs');
  for (const r of defaults.rows) {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'addons', `dsh-${r.name.split('dsh-')[1]}`, 'package.json'), 'utf8'));
    assert.equal(pkg.name, r.name, `${r.id}: the row names a real add-on`);
  }
});

test('a row here replaces the add-on\'s own row, so it repeats every key that row has', () => {
  for (const r of defaults.rows) {
    const own = readFileSync(join(ROOT, 'addons', `dsh-${r.name.split('dsh-')[1]}`, 'cordis.patch.yml'), 'utf8');
    // Active (not commented) "key: value" lines at the first level of the add-on's config.
    const keys = [...own.matchAll(/^ {8}([A-Za-z][A-Za-z0-9]*):/gm)].map((m) => m[1]);
    for (const key of keys) assert.ok(key in r.config, `${r.id}: ${key} is in the add-on's own row, so it must be here too`);
  }
});

test('rows are added to an empty setup file, after the comment, and to a file that has rows', () => {
  const header = '# Your patch layer\n# more\n[]\n';
  const a = withDefaults(header, defaults);
  assert.deepEqual(a.wrote, ['budget', 'activity', 'model-tiers', 'modes', 'settings-plus']);
  assert.ok(a.text.startsWith('# Your patch layer\n# more\n'));
  assert.ok(!/^\[\]$/m.test(a.text), 'the empty list is gone');
  assert.match(a.text, /- id: budget\n {2}name: "@local\/dsh-budget"\n {2}config:\n {4}enabled: true\n {4}maxTokens: 5000000\n/);
  assert.match(a.text, /tiers:\n {6}code:\n {8}effort: "high"/);
  assert.deepEqual(withDefaults('', defaults).wrote.length, 5);
  const b = withDefaults('- id: modes\n  name: "@local/dsh-modes"\n  config:\n    x: 1\n', defaults);
  assert.ok(b.text.startsWith('- id: modes\n'), 'what was there stays first and untouched');
  assert.equal(b.wrote.length, 4);
});

test('an id that already has a row is never touched: a saved value is never overwritten', () => {
  const saved = '- id: budget\n  name: "@local/dsh-budget"\n  config:\n    maxTokens: 30000000\n- id: activity\n  name: "@local/dsh-activity"\n  config:\n    words: false\n';
  const r = withDefaults(saved, defaults);
  assert.deepEqual(r.wrote, ['model-tiers', 'modes', 'settings-plus']);
  assert.ok(r.text.startsWith(saved), 'the saved rows are byte for byte the same');
  assert.deepEqual([...idsIn(r.text)].sort(), ['activity', 'budget', 'model-tiers', 'modes', 'settings-plus']);
  assert.equal(withDefaults(r.text, defaults).text, r.text, 'running it twice changes nothing');
});

const app = '/Applications/DeepSeek Harness.app';
const dsh = join(app, 'Contents/Resources/runtime/cli/bin/dsh');
test('the app itself reads the values from the setup file after a real install', { skip: !existsSync(dsh), timeout: 400000 }, () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-newdefaults-'));
  const env = { ...process.env, DSH_HOME: home, DSH_RECON_ROOM: join(home, 'recon-room-unused') };
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    const made = spawnSync(dsh, ['--profile', 'check', '--from-default-profile', 'web', '--dump-config'], { env, encoding: 'utf8' });
    assert.equal(made.status, 0, made.stderr);
    // Install Plus into the throwaway setup, then write the values the way the installer does on a first install.
    const installed = spawnSync('bash', [join(ROOT, 'scripts/install.sh'), '--profile', 'check', '--yes'], { env, encoding: 'utf8', input: '' });
    assert.equal(installed.status, 0, installed.stdout + installed.stderr);
    const file = join(home, 'profiles/check/cordis.patch.yml');
    assert.ok(existsSync(file));
    writeFileSync(file, withDefaults(readFileSync(file, 'utf8'), defaults).text);
    const dump = spawnSync(dsh, ['--profile', 'check', '--dump-config'], { env, encoding: 'utf8' }).stdout;
    const block = (id) => (dump.split(/^- id: /m).find((b) => b.startsWith(`${id}\n`)) ?? '');
    assert.match(block('budget'), /maxTokens: 5000000/);
    assert.match(block('activity'), /words: true/);
    assert.match(block('model-tiers'), /effort: high/);
    assert.match(block('modes'), /skillsOff:[\s\S]*"chat":\[[^\]]*reverse-codebase/); // the app folds a long value onto the next line
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('code guides: a new install offers them only in the Code tab, and any tab can switch them on', async () => {
  const table = JSON.parse(row('modes').config.skillsOff);
  assert.deepEqual(Object.keys(table).sort(), ['chat', 'cowork'], 'off in Chat and Cowork only; Code is not listed');
  assert.equal(table.chat.length, 8);
  // Modes' own reader accepts the table, and its writer can empty a tab's list (the Settings → Code tools switch does that).
  const { offIn, withOff } = await import('../addons/dsh-modes/lib/skilloff.js');
  assert.equal(offIn(table, 'chat').size, 8);
  assert.equal(offIn(table, 'code').size, 0);
  assert.equal(offIn(withOff(table, 'chat', []), 'chat').size, 0, 'a person can switch them on in Chat');
  assert.equal(offIn(withOff(table, 'cowork', []), 'cowork').size, 0, 'and in Cowork');
  // The names are the real ones.
  const code = readFileSync(join(ROOT, 'addons', 'dsh-code-power', 'index.js'), 'utf8') + readFileSync(join(ROOT, 'addons', 'dsh-code-map', 'skills.js'), 'utf8');
  for (const name of table.chat) assert.ok(code.includes(`name: '${name}'`), name);
});

test('only a first install is marked for the first-run card and starts on the Simple list', () => {
  const plus = row('settings-plus').config;
  assert.equal(plus.setupPending, true);
  assert.equal(plus.view, 'simple');
  const own = readFileSync(join(ROOT, 'addons', 'dsh-settings-plus', 'cordis.patch.yml'), 'utf8');
  assert.match(own, /setupPending: false/, 'the add-on itself never marks an install as fresh');
  assert.match(own, /view: advanced/, 'an earlier install keeps the full list');
  // An earlier setup (a settings-plus row of its own, or none) is never given the marker.
  const earlier = '- id: settings-plus\n  name: "@local/dsh-settings-plus"\n  config:\n    view: advanced\n';
  assert.ok(!withDefaults(earlier, defaults).wrote.includes('settings-plus'));
  assert.equal(defaults.prepared.budget.suggested, 2000000);
});
