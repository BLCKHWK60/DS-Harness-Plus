// Phase 3 settings: the grouped list, the Simple view, the "More settings" form, and the first-run setup card.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Config, readSetup, readIndex } from '../index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ADDONS = path.resolve(HERE, '..', '..');
const SOURCE = readFileSync(path.join(HERE, '..', 'client.js'), 'utf8');
const INDEX = readIndex(readFileSync(path.join(HERE, '..', 'settings-index.json'), 'utf8'));
const RAW = JSON.parse(readFileSync(path.join(HERE, '..', 'settings-index.json'), 'utf8'));
const TIERS = JSON.parse(readFileSync(path.join(ADDONS, '..', 'addon-tiers.json'), 'utf8'));

function client() {
  let loaded;
  const window = { __ModuleLoader__: { load: (module) => { loaded = module; } } };
  new Function('window', SOURCE)(window); // eslint-disable-line no-new-func
  const React = { createElement: () => null, Fragment: 'fragment', Component: class {}, useCallback: (fn) => fn, useEffect() {}, useMemo: (fn) => fn(), useRef: () => ({}), useState: (value) => [value, () => {}] };
  return loaded.factory((name) => (name === 'react' ? React : { createPortal: () => null }));
}
const plugin = client();

/** A settings description the way the app reports it, for one add-on. */
function view(ns, fields, { value = {}, base = {}, user = {} } = {}) {
  const refs = {};
  let n = 1;
  const dict = {};
  for (const [key, node] of Object.entries(fields)) {
    const copy = { ...node };
    if (copy.list) copy.list = copy.list.map((one) => { refs[++n] = one; return n; });
    if (copy.inner) { refs[++n] = copy.inner; copy.inner = n; }
    refs[++n] = copy;
    dict[key] = n;
  }
  refs[1] = { type: 'object', meta: {}, dict };
  return { ns, schema: { uid: 1, refs }, value, base, user, revision: 0 };
}
const entry = (field, label, extra = {}) => ({ page: 'none', pageLabel: 'Some add-on', label, description: 'What it does.', field, configOnly: true, where: '', ...extra });

test('the left list has the plain headings, every page once, and the Core / Beta / Experimental label of its add-on', () => {
  const labels = plugin.GROUPS.map((group) => group.label);
  for (const wanted of ['Everyday', 'Models and spending', 'Modes and tabs', 'Research and sources', 'Privacy and safety', 'Learning', 'Add-ons and updates', 'Advanced']) assert.ok(labels.includes(wanted), wanted);
  const all = plugin.GROUPS.flatMap((group) => group.pages);
  assert.equal(new Set(all).size, all.length, 'a page is in one group only');
  for (const id of all) {
    const folder = plugin.PAGE_ADDON[id];
    assert.ok(folder && existsSync(path.join(ADDONS, folder, 'package.json')), `${id}: its add-on folder`);
    assert.ok(TIERS.addons[folder]?.tier, `${folder} has a tier in addon-tiers.json`);
  }
  assert.ok(plugin.GROUPS.find((group) => group.label === 'Advanced').pages.includes('more-settings'));
  assert.equal(plugin.GROUPS[0].pages[0], 'start-here', 'Start here is the first Plus page');
});

test('the Simple view keeps only Start here and About Plus in the list; everything else is still reachable', () => {
  assert.deepEqual([...plugin.SIMPLE_PAGES].sort(), ['about-plus', 'start-here']);
  assert.match(SOURCE, /html\[data-dsh-sp-view="simple"\][^{]*nav button:has\(\[data-sp-page\]:not\(\[data-sp-simple\]\)\):not\(\[aria-current="true"\]\) \{ display: none; \}/, 'hidden, not removed; the page you are on stays');
  // Search on a hidden page switches to Advanced first.
  assert.match(SOURCE, /const reveal = \(id\) => \{ if \(viewState\.value === 'simple' && !SIMPLE_PAGES\.includes\(id\)\) void saveView\(appCtx, 'advanced'\)/);
  // The saved choice: an earlier install keeps the full list; only a first install starts on Simple.
  assert.equal(Config.dict.view.meta.default, 'advanced');
  assert.equal(Config.dict.setupPending.meta.default, false);
});

test('the Simple list: the model, web, access, spending, notifications, add-ons, colours and export, saved through Settings', () => {
  for (const text of ['Which model answers', 'The web in each tab', 'What the assistant may change', 'Daily spending limit', 'Stop a runaway task', 'A task needs me', 'Light or dark', 'Colour scheme', 'Export button', 'Which add-ons are on', 'Show me everything']) assert.ok(SOURCE.includes(`'${text}'`), text);
  assert.match(SOURCE, /writeSettings\(appCtx, 'permission', \[\{ op: 'set', path: \['defaultPreset'\]/);
  // Full access is never offered in Simple: it stays on the General page, which asks first.
  assert.ok(!/\['danger-full-access'/.test(SOURCE));
  assert.ok(SOURCE.includes('window.__dshSettingsPlus.addSimpleRow'), 'other add-ons can add a row (Tool permissions later)');
});

test('the first-run card: writes the daily limit through Budget, never asks for a key, can be run again', () => {
  assert.match(SOURCE, /writeSettings\(appCtx, 'budget', \[\{ op: 'set', path: \['dayTokens'\], value \}\]\)/);
  assert.match(SOURCE, /No limit/);
  assert.match(SOURCE, /This card never asks for your key and never keeps it/);
  const setup = SOURCE.slice(SOURCE.indexOf('// ---- the first-run setup card'), SOURCE.indexOf('// ---- Start here: the Simple list'));
  assert.ok(!/password|apiKey|api key input|type: 'password'/i.test(setup.replace(/never asks for your key/i, '')), 'no key field');
  assert.match(SOURCE, /'Run setup again'/);
  // Shown only after a first install (the marker is written by the installer); finishing it clears the marker.
  assert.match(SOURCE, /data\?\.setupPending !== true/);
  assert.match(SOURCE, /path: \['setupPending'\], value: false/);
  // It floats; it never blocks: not a full-screen cover.
  assert.match(SOURCE, /\.dsh-sr-card \{ position: fixed; right: 16px; top: 56px;/);
  assert.ok(!/window\.(prompt|confirm|alert)\(/.test(SOURCE));
});

test('the suggested limit comes from new-install-defaults.json', () => {
  assert.equal(readSetup(path.join(ADDONS, '..', 'addons')).suggested, 2000000);
  assert.equal(readSetup('/nonexistent/folder').suggested, 2000000, 'a missing file falls back');
  const prepared = JSON.parse(readFileSync(path.join(ADDONS, '..', 'new-install-defaults.json'), 'utf8')).prepared.budget;
  assert.equal(readSetup(path.join(ADDONS, '..', 'addons')).suggested, prepared.suggested);
});

test('the index knows the new pages, and bookkeeping stays out of search', () => {
  for (const page of ['start-here', 'more-settings']) assert.ok(INDEX.some((one) => one.page === page), page);
  const marker = RAW.find((one) => one.field === 'settings-plus.setupPending');
  assert.equal(marker.internal, true);
  assert.ok(!INDEX.some((one) => one.field === 'settings-plus.setupPending'));
  assert.ok(INDEX.some((one) => one.field === 'settings-plus.view'));
});

test('More settings: a row per file-only setting, with the right control, grouped by add-on', () => {
  const nodes = {
    on: { type: 'boolean', meta: { default: true } },
    count: { type: 'number', meta: { min: 1, max: 9, step: 1, default: 3 } },
    name: { type: 'string', meta: { default: 'x' } },
    mode: { type: 'union', meta: {}, list: [{ type: 'const', value: 'same' }, { type: 'const', value: 'roles' }] },
    skip: { type: 'array', meta: { default: [] }, inner: { type: 'string', meta: {} } },
    table: { type: 'dict', meta: { default: {} }, inner: { type: 'boolean', meta: {} } },
    sub: { type: 'object', meta: {}, dict: {} },
  };
  const v = view('thing', nodes, { value: { on: true }, base: { on: true }, user: {} });
  const entries = [
    entry('thing.on', 'Turn it on'), entry('thing.count', 'How many'), entry('thing.name', 'A name'), entry('thing.mode', 'Who helps'), entry('thing.skip', 'Skip these'), entry('thing.table', 'A table'),
    entry('thing.missing', 'Not in the schema'), entry('gone.x', 'Add-on is off'), entry('thing.on', 'Duplicate'), { ...entry('thing.name', 'Has a page'), configOnly: false },
    entry('thing.sub', 'A group, not a setting'),
  ];
  const { rows, off } = plugin.moreRows([v], entries);
  assert.deepEqual(rows.map((row) => `${row.field}:${row.control.t}`).sort(), ['thing.count:number', 'thing.mode:choice', 'thing.name:text', 'thing.on:boolean', 'thing.skip:lines', 'thing.table:json']);
  assert.equal(off, 1, 'one setting belongs to an add-on that is switched off');
  assert.deepEqual(rows.find((row) => row.field === 'thing.mode').control.options, ['same', 'roles']);
  assert.deepEqual([rows.find((row) => row.field === 'thing.count').control.min, rows.find((row) => row.field === 'thing.count').control.max], [1, 9]);
  assert.equal(rows.find((row) => row.field === 'thing.on').about, 'What it does.');
});

test('More settings: a nested setting is saved at its own path', () => {
  const v = view('media', { images: { type: 'object', meta: {}, dict: {} } });
  // A leaf below an object is found by walking the path.
  const refs = { 1: { type: 'object', dict: { images: 2 } }, 2: { type: 'object', dict: { allowUrlResults: 3 } }, 3: { type: 'boolean', meta: { default: true } } };
  const nested = { ns: 'media-tools', schema: { uid: 1, refs }, value: { images: { allowUrlResults: true } }, base: {}, user: {} };
  const { rows } = plugin.moreRows([nested], [entry('media-tools.images.allowUrlResults', 'Accept image links')]);
  assert.deepEqual(rows[0].path, ['images', 'allowUrlResults']);
  assert.equal(rows[0].risky, true, 'allowUrlResults can weaken a safety rule');
  assert.ok(v);
});

test('settings that can weaken safety are marked: danger*, allow*, anywhere, trusted', () => {
  for (const field of ['artifacts.dangerShowBackups', 'bench.allowRiskyWrites', 'pdf.anywhere', 'mac.trusted', 'skill-architect.allowInternet', 'media-tools.images.allowUrlResults']) assert.equal(plugin.isRisky(field), true, field);
  for (const field of ['budget.dayTokens', 'activity.words', 'research.folder', 'modes.defaultMode']) assert.equal(plugin.isRisky(field), false, field);
  // The form warns and asks before changing one.
  assert.match(SOURCE, /This setting can make the assistant less safe/);
  assert.match(SOURCE, /can weaken a safety rule\. Do you want to change it\?/);
});

test('More settings: what is typed is checked before it is saved, in plain words', () => {
  const number = { t: 'number', min: 1, max: 9, step: 1 };
  assert.deepEqual(plugin.parseEdit(number, '4'), { value: 4 });
  assert.match(plugin.parseEdit(number, '0').error, /smallest value is 1/);
  assert.match(plugin.parseEdit(number, '10').error, /largest value is 9/);
  assert.match(plugin.parseEdit(number, 'abc').error, /Type a number/);
  assert.deepEqual(plugin.parseEdit({ t: 'number' }, '1,500'), { value: 1500 });
  assert.deepEqual(plugin.parseEdit({ t: 'lines' }, 'a\n\n b \n'), { value: ['a', 'b'] });
  assert.deepEqual(plugin.parseEdit({ t: 'json' }, '{"a":1}'), { value: { a: 1 } });
  assert.match(plugin.parseEdit({ t: 'json' }, '{"a":').error, /not written correctly/);
  assert.deepEqual(plugin.parseEdit({ t: 'text' }, ' keep spaces '), { value: ' keep spaces ' });
});

test('Reset to default removes the saved value instead of writing the default', () => {
  assert.match(SOURCE, /\[\{ op: 'unset', path: row\.path \}\]/);
  assert.match(SOURCE, /disabled: !saved \|\| SAME\(current, base\)/);
});

test('search finds a file-only setting on the More settings page and switches to Advanced', () => {
  assert.match(SOURCE, /reveal\('more-settings'\)/);
  assert.match(SOURCE, /jumpTo\(entry\.field\)/);
});

test('every file-only entry names its setting, so the More settings form can find it', () => {
  for (const one of INDEX.filter((e) => e.configOnly && e.where !== 'plugins-panel')) assert.ok(one.field, `${one.page} › ${one.label} names its setting`);
});

test('Start here and More settings use the shared kit; errors are plain sentences with a Details button', () => {
  assert.match(SOURCE, /dsh-kit:begin/);
  assert.match(SOURCE, /dsh-ui:begin/);
  for (const part of ['ui.Page', 'ui.Row', 'ui.Switch', 'ui.Button', 'ui.Group', 'ui.Side']) assert.ok(SOURCE.includes(part), part);
  assert.match(SOURCE, /throw dshKit\.fail\(result\.error\)/);
  assert.ok(!/throw new Error\('(The settings|That setting|This setting)/.test(SOURCE), 'no hand-written raw error');
  assert.match(SOURCE, /h\(PlainNote, \{ error: note\.error \}\)/);
});

test('a Beta or Experimental page is marked by a dot, never by text that cuts its name', () => {
  assert.ok(!/content: "Exp\."/.test(SOURCE));
  assert.match(SOURCE, /nav button:has\(\[data-sp-tier\]\)::after \{ content: ""/);
  assert.match(SOURCE, /button\.setAttribute\('title'/);
});

// ---- review #2: internal records never reach the More settings page ----

const APPROVED = JSON.parse(readFileSync(path.join(HERE, 'more-settings-approved.json'), 'utf8')).fields;

test('#2: the More settings page lists exactly the approved settings, and no internal record', () => {
  // The index the page reads (internal entries are dropped by readIndex), turned into rows against a schema that has every field.
  const fields = [...new Set(INDEX.filter((one) => one.configOnly && one.where !== 'plugins-panel' && one.field).map((one) => one.field))];
  const listed = [];
  for (const field of fields) {
    const [ns, ...rest] = field.split('.');
    const nodes = { x: { type: 'string', meta: { default: '' } } };
    let refs = { 1: { type: 'object', dict: {} } };
    // A schema where this one path is a plain text setting.
    let id = 2;
    let at = refs[1];
    rest.forEach((part, i) => {
      const last = i === rest.length - 1;
      refs[id] = last ? { type: 'string', meta: { default: '' } } : { type: 'object', dict: {} };
      at.dict[part] = id;
      at = refs[id];
      id += 1;
    });
    void nodes;
    const shown = plugin.moreRows([{ ns, schema: { uid: 1, refs }, value: {}, base: {}, user: {} }], INDEX.filter((one) => one.field === field));
    if (shown.rows.length > 0) listed.push(field);
  }
  assert.deepEqual(listed.sort(), [...APPROVED].sort(), 'the page would list something that is not on the approved list (or lost something that is). Review it: an internal record belongs in settings-index.json with "internal": true.');
});

test('#2: the records the review named are internal in the index and are refused by name even if the mark is missing', () => {
  for (const field of ['modes.sessionIsolated', 'modes.sessionModes', 'modes.sessionWebSources', 'modes.sessionWeb', 'model-tiers.sessionProfiles', 'model-tiers.startersMigrated', 'model-tiers.modelProfilesMigrated', 'modes.webMarksCleared', 'modes.dataTrimAdded', 'modes.depthMoved', 'research.focusMoved']) {
    assert.ok(RAW.some((one) => one.field === field && one.internal === true), `${field} is marked internal`);
    assert.equal(plugin.isInternalField(field), true, `${field} is refused by its name`);
    assert.ok(!APPROVED.includes(field), `${field} is not approved`);
    // Even an entry with no mark at all does not become a row.
    const refs = { 1: { type: 'object', dict: { [field.split('.')[1]]: 2 } }, 2: { type: 'string', meta: { default: '{}' } } };
    const { rows } = plugin.moreRows([{ ns: field.split('.')[0], schema: { uid: 1, refs }, value: {}, base: {}, user: {} }], [entry(field, 'unmarked')]);
    assert.equal(rows.length, 0, `${field} (unmarked) is not drawn`);
  }
  assert.equal(plugin.isInternalField('budget.dayTokens'), false);
  assert.equal(plugin.isInternalField('settings-plus.view'), false);
});

test('#2: every add-on setting whose name says "internal record" is marked internal in the index', async () => {
  const { readdirSync } = await import('node:fs');
  const { pathToFileURL } = await import('node:url');
  const missing = [];
  const leaves = (schema) => {
    const out = [];
    const walk = (node, trail) => {
      if (node?.type === 'object' && node.dict) for (const [key, value] of Object.entries(node.dict)) walk(value, [...trail, key]);
      else out.push(trail.join('.'));
    };
    walk(schema, []);
    return out;
  };
  for (const dir of readdirSync(ADDONS)) {
    if (!existsSync(path.join(ADDONS, dir, 'index.js')) || !existsSync(path.join(ADDONS, dir, 'cordis.patch.yml'))) continue;
    const mod = await import(pathToFileURL(path.join(ADDONS, dir, 'index.js')).href);
    if (!mod.Config) continue;
    const text = readFileSync(path.join(ADDONS, dir, 'cordis.patch.yml'), 'utf8');
    const ns = new RegExp(`id:\\s*(\\S+)\\s*\\n\\s*name:\\s*'?@local/${dir}'?\\s*\\n`).exec(text)?.[1] ?? /^\s*-?\s*id:\s*(\S+)/m.exec(text)?.[1];
    for (const leaf of leaves(mod.Config)) {
      if (!plugin.isInternalField(`${ns}.${leaf}`)) continue;
      const mine = RAW.filter((one) => one.field === `${ns}.${leaf}`);
      if (mine.length === 0 || mine.some((one) => one.configOnly && one.internal !== true)) missing.push(`${ns}.${leaf}`);
    }
  }
  assert.deepEqual(missing, [], 'these look like internal records but would be listed: mark them "internal": true in settings-index.json');
});

test('#2: Recon\'s program paths and engine address ask before saving and before resetting', () => {
  for (const field of ['recon.torPath', 'recon.wireproxyPath', 'recon.engineHost', 'recon.otherEngine']) {
    assert.equal(plugin.isRisky(field), true, field);
    assert.ok(plugin.PROGRAM_FIELDS.includes(field));
  }
  // The warning and the question are shown through the same path for saving and for "Reset to default".
  const row = SOURCE.slice(SOURCE.indexOf('function MoreRow('), SOURCE.indexOf('function MorePage('));
  const write = row.slice(row.indexOf('const write = async'), row.indexOf('const commit'));
  assert.match(write, /if \(row\.risky && !\(await confirm\(/);
  assert.match(row, /on: current === true, label: row\.label, onChange: \(next\) => void write\(/);
  assert.match(row, /void write\(\[\{ op: 'unset', path: row\.path \}\]/, 'Reset goes through write(), so it asks too');
});

// ---- review: runaway switch, colour name, More settings wording, MindsHub ----

test('"Stop a runaway task" changes only the per-task limits: the daily limit and Budget\'s master switch stay as they are', () => {
  const budget = (value, user = {}) => ({ ns: 'budget', value, user, base: {} });
  const full = { enabled: true, maxSteps: 300, maxHelperSteps: 1500, maxTokens: 20000000, maxRepeats: 8, maxLongSteps: 5000, maxLongTokens: 60000000, maxMinutes: 0, dayTokens: 2000000 };
  assert.equal(plugin.runawayOn(budget(full)), true);
  const off = plugin.runawayOps(budget(full), false);
  assert.deepEqual(off.map((op) => op.path[0]).sort(), ['maxHelperSteps', 'maxLongSteps', 'maxLongTokens', 'maxRepeats', 'maxSteps', 'maxTokens']);
  assert.ok(off.every((op) => op.op === 'set' && op.value === 0));
  for (const op of off) assert.ok(!['enabled', 'dayTokens', 'maxMinutes'].includes(op.path[0]), `${op.path[0]} is not touched`);
  // After those changes the protection reads as off and the daily limit is still there.
  const after = { ...full, ...Object.fromEntries(off.map((op) => [op.path[0], op.value])) };
  assert.equal(plugin.runawayOn(budget(after)), false);
  assert.equal(after.enabled, true);
  assert.equal(after.dayTokens, 2000000);
  // Switching back on puts the limits back to their defaults (unset) and never writes the daily limit.
  const on = plugin.runawayOps(budget(after, { maxSteps: 0 }), true);
  assert.ok(on.every((op) => op.op === 'unset') && on.length === 6);
  assert.ok(!on.some((op) => op.path[0] === 'dayTokens'));
  // An older Mac where the old switch had turned Budget off as a whole: the switch reads off, and turning it on turns Budget back on.
  const old = budget({ ...full, enabled: false }, { enabled: false });
  assert.equal(plugin.runawayOn(old), false);
  assert.ok(plugin.runawayOps(old, true).some((op) => op.op === 'unset' && op.path[0] === 'enabled'));
  // The Start page uses it, not the master switch.
  assert.match(SOURCE, /h\(RunawaySwitch, \{ \.\.\.common \}\)/);
  assert.ok(!/ns: 'budget', path: \['enabled'\]/.test(SOURCE));
});

test('the Simple view shows the colour scheme by its real name, also for the old stored id', () => {
  assert.equal(plugin.schemeLabel('mindshub'), 'Harbor');
  assert.equal(plugin.schemeLabel('harbor'), 'Harbor');
  assert.equal(plugin.schemeLabel('stock'), 'the app\'s own');
  assert.equal(plugin.schemeLabel('graphite'), 'Graphite');
  assert.equal(plugin.schemeLabel('forest'), 'Forest');
  assert.equal(plugin.schemeLabel('something-new'), 'Something-new');
});

test('More settings does not claim that nothing is missing, and says how many cannot be drawn', () => {
  assert.ok(!/Every setting of the add-ons that are on has a control/.test(SOURCE));
  assert.match(SOURCE, /This list is not complete/);
  const v = view('thing', { on: { type: 'boolean', meta: { default: true } } });
  const { rows, skipped } = plugin.moreRows([v], [entry('thing.on', 'On'), entry('thing.gone', 'Not in schema')]);
  assert.equal(rows.length, 1);
  assert.equal(skipped, 1);
});

test('no document of the colour schemes add-on carries the old name MindsHub', () => {
  for (const file of ['README.md', 'passport/brief.md']) assert.ok(!/mindshub/i.test(readFileSync(path.join(ADDONS, 'dsh-color-schemes', file), 'utf8')), file);
});
