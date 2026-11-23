// Tests for the installer helpers: the supported-version range and the Core set / Everything plan.
//   ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test scripts/plus-lib.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { inRange, plan, readTiers, returning, UNINSTALL_MARKER } from './plus-lib.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const tiers = readTiers(join(ROOT, 'addon-tiers.json'));

test('the supported app range: 0.2.2 up to, not including, 0.3.0', () => {
  const range = tiers.supportedApp;
  for (const v of ['0.2.2', '0.2.2-rc.1', '0.2.3', '0.2.10', '0.2.99']) assert.equal(inRange(v, range), true, v);
  for (const v of ['0.2.1', '0.2.0', '0.1.9', '0.3.0', '0.3.0-rc.1', '0.3.1', '0.10.0', '1.0.0', '', 'unknown', undefined]) assert.equal(inRange(v, range), false, String(v));
});

test('every add-on says the same supported range as the list', () => {
  for (const folder of readdirSync(join(ROOT, 'addons'))) {
    let pkg;
    try { pkg = JSON.parse(readFileSync(join(ROOT, 'addons', folder, 'package.json'), 'utf8')); } catch { continue; }
    if (!pkg.dsh?.bundle) continue;
    assert.equal(pkg.engines?.dsh, tiers.supportedApp.engines, `${folder} engines.dsh`);
  }
});

test('every add-on has a tier, a one-line reason, and nothing extra is listed', () => {
  const folders = readdirSync(join(ROOT, 'addons')).filter((f) => f.startsWith('dsh-'));
  assert.deepEqual(Object.keys(tiers.addons).sort(), folders.sort());
  for (const [folder, info] of Object.entries(tiers.addons)) {
    assert.ok(tiers.tiers[info.tier], `${folder} has a known tier`);
    assert.ok(info.label && info.reason && !info.reason.includes('\n'), `${folder} has a label and a reason`);
  }
  assert.equal(tiers.addons['dsh-recon'].tier, 'separate');
});

test('every non-core add-on says so at the start of its description (what the Plugins page shows)', () => {
  for (const [folder, info] of Object.entries(tiers.addons)) {
    if (info.tier !== 'beta' && info.tier !== 'experimental') continue;
    const pkg = JSON.parse(readFileSync(join(ROOT, 'addons', folder, 'package.json'), 'utf8'));
    assert.ok(String(pkg.description).startsWith(`${tiers.tiers[info.tier].label}: `), `${folder} description starts with "${tiers.tiers[info.tier].label}: "`);
  }
});

function download() {
  const dir = mkdtempSync(join(tmpdir(), 'plus-lib-'));
  const addons = join(dir, 'addons');
  for (const [folder] of Object.entries(tiers.addons)) {
    mkdirSync(join(addons, folder), { recursive: true });
    writeFileSync(join(addons, folder, 'package.json'), JSON.stringify({ name: `@local/${folder}`, dsh: { bundle: {} } }));
  }
  const profile = join(dir, 'package.json');
  writeFileSync(profile, JSON.stringify({ dependencies: {} }));
  return { addons, profile, dir };
}
const included = (rows) => rows.filter((r) => r.include).map((r) => r.folder);

test('first install, Core set: core and beta copied, experimental and Recon left out, only core on', () => {
  const { addons, profile } = download();
  const rows = plan(addons, tiers, profile, 'core');
  assert.equal(included(rows).length, 30 + 5);
  assert.ok(!included(rows).includes('dsh-bench') && !included(rows).includes('dsh-recon'));
  for (const r of rows.filter((x) => x.include)) assert.equal(r.offAfter, r.tier !== 'core', r.folder);
});

test('first install, Everything: experimental copied too but off; Recon is never part of it', () => {
  const { addons, profile } = download();
  const rows = plan(addons, tiers, profile, 'everything');
  assert.equal(included(rows).length, 30 + 5 + 13);
  assert.ok(!included(rows).includes('dsh-recon'));
  assert.equal(rows.find((r) => r.folder === 'dsh-bench').offAfter, true);
  assert.equal(rows.find((r) => r.folder === 'dsh-modes').offAfter, false);
});

test('an update keeps what is there: installed add-ons are included and never switched, an installed Recon-less install gets no experimental ones', () => {
  const { addons, profile } = download();
  writeFileSync(profile, JSON.stringify({ dependencies: { '@local/dsh-bench': 'link:x', '@local/dsh-modes': 'link:x', '@local/dsh-recon': 'link:x' } }));
  const rows = plan(addons, tiers, profile, 'keep');
  const bench = rows.find((r) => r.folder === 'dsh-bench');
  assert.deepEqual([bench.include, bench.offAfter, bench.isNew], [true, false, false]);
  assert.equal(rows.find((r) => r.folder === 'dsh-modes').offAfter, false);
  assert.equal(rows.find((r) => r.folder === 'dsh-split-plus').include, false);
  assert.equal(rows.find((r) => r.folder === 'dsh-recon').include, true, 'an installed Recon stays in the update');
  assert.equal(rows.find((r) => r.folder === 'dsh-recon').offAfter, false);
});

test('choosing Everything on an existing install only adds the missing ones, off', () => {
  const { addons, profile } = download();
  writeFileSync(profile, JSON.stringify({ dependencies: { '@local/dsh-modes': 'link:x' } }));
  const rows = plan(addons, tiers, profile, 'everything');
  assert.equal(rows.find((r) => r.folder === 'dsh-modes').offAfter, false);
  assert.equal(rows.find((r) => r.folder === 'dsh-split-plus').offAfter, true);
});

test('a returning person is found by the uninstall marker or by a Plus data folder, a stranger is not', () => {
  const home = mkdtempSync(join(tmpdir(), 'plus-returning-'));
  mkdirSync(join(home, 'profiles', 'x'), { recursive: true });
  mkdirSync(join(home, 'sessions'));
  assert.equal(returning(tiers, home), false, 'the app\'s own folders alone: a first install');
  mkdirSync(join(home, 'backups', 'deepseek-harness-plus'), { recursive: true });
  assert.equal(returning(tiers, home), false, 'backups alone (a first install that was rolled back) are not a past install');
  writeFileSync(join(home, UNINSTALL_MARKER), 'x');
  assert.equal(returning(tiers, home), true, 'the marker an uninstall leaves');
  const other = mkdtempSync(join(tmpdir(), 'plus-returning-'));
  mkdirSync(join(other, 'memory'));
  assert.equal(returning(tiers, other), true, 'a Plus data folder (an older uninstaller leaves no marker)');
});

test('the data list: the real Cowork trash, arena and benchmarks are Plus\'s; devices, plugins and learned skills are not removable', () => {
  const removable = tiers.dataFolders.map((r) => r.folder);
  for (const f of ['trash', 'arena', 'benchmarks']) assert.ok(removable.includes(f), f);
  for (const f of ['devices', 'plugins', 'skill-architect']) assert.ok(!removable.includes(f), `${f} must never be offered for removal`);
  const kept = tiers.dataNeverRemoved.map((r) => r.folder);
  for (const f of ['sessions', 'skills', 'profiles', 'backups', 'skill-architect', 'plugins']) assert.ok(kept.includes(f), f);
  for (const row of tiers.dataFolders) assert.match(row.folder, /^[a-z0-9-]+$/, 'only plain folder names are ever removed');
});
