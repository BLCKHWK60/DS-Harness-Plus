// Item 4A, round 2 of fixes (UI and text): mode names (English only since stage 7), an add-on mode read-only on Settings → Modes, the
// "Each window keeps its own space" row on Settings → Spaces, the draft's mode on the page for the start page's chips,
// "(usual)" apart from "(default)", Depth and the mode's name readable at 1280 px, and "thread"/"space" on Settings → Modes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ABOUT_MAX, SHIPPED_MODE_NAMES, modeAbout, modeName, modeRowsForPage } from '../lib/spaces.js';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const { boot, makeWorld } = await import('./app.mjs');
const lines = (key) => source.split('\n').filter((line) => line.includes(`'${key}':`));

test('mode names stay as they are on a Chinese page (stage 7: English only)', () => {
  assert.equal(modeName({ id: 'plain', label: 'Plain chat' }, 'zh'), 'Plain chat');
  assert.equal(modeName({ id: 'finance', label: 'Finance' }, 'zh'), 'Finance');
  assert.equal(modeName({ id: 'bench', label: 'Devices' }, 'zh-CN'), 'Devices');
  assert.equal(modeName({ id: 'cowork', label: 'Cowork' }, 'zh'), 'Cowork');
  assert.equal(modeName({ id: 'finance', label: 'Finance' }, 'en'), 'Finance');
  assert.equal(modeName({ id: 'finance', label: 'My money' }, 'zh'), 'My money', 'a name changed by hand stays');
  assert.equal(modeName({ id: 'meetings', label: 'Meeting notes' }, 'zh'), 'Meeting notes', 'your own mode stays');
  for (const [id, entry] of Object.entries(SHIPPED_MODE_NAMES)) assert.ok(entry.en.length > 0, id);
});

test('the Mode list and Settings → Spaces and Modes name modes in English on a Chinese page', async () => {
  const world = makeWorld({ extraModes: JSON.stringify({ research: { label: 'Research', tools: 'all', sandbox: 'inherit', prompt: 'Research.' } }) });
  const run = boot(world, { tabs: true, known: ['read'] });
  await run.open('t1', { source: 'resume', lastTurn: 1 });
  const zh = run.service().spaces.view('t1', 'zh');
  assert.ok(zh.modes.some((mode) => mode.id === 'plain' && mode.label === 'Plain chat'), 'Mode list');
  assert.ok(zh.modes.some((mode) => mode.id === 'research' && mode.label === 'Research'));
  assert.ok(run.service().spaces.view('t1', 'en').modes.some((mode) => mode.id === 'plain' && mode.label === 'Plain chat'));
  const page = run.service().spaces.page('zh');
  assert.ok(page.cards.find((card) => card.id === 'chat').offered.some((mode) => mode.label === 'Plain chat'), 'Settings → Spaces');
  assert.ok(page.modes.some((mode) => mode.id === 'research' && mode.label === 'Research'), 'Settings → Modes');
  const research = page.modes.find((mode) => mode.id === 'research');
  assert.equal(research.kind, 'addon');
  assert.deepEqual(research.about, { instructions: 'Research.', tools: 'all', toolCount: 0, toolNames: [], access: 'inherit', tier: '' });
  assert.equal(page.modes.find((mode) => mode.id === 'plain').about, null, 'built-in modes are edited in their cards');
});

test('an add-on mode\'s read-only view: instructions in short, tools, file access, tier', () => {
  const long = 'Search widely. '.repeat(40);
  const about = modeAbout({ prompt: long, tools: ['a', 'b', 'c'], sandbox: 'read-only', defaultTier: 'pro' });
  assert.ok(about.instructions.length <= ABOUT_MAX && about.instructions.endsWith('…'));
  assert.deepEqual([about.tools, about.toolCount, about.access, about.tier], ['list', 3, 'read-only', 'pro']);
  assert.equal(modeAbout({ tools: 'none', sandbox: 'odd' }).access, 'inherit');
  assert.equal(modeAbout({ tools: 'none' }).tools, 'none');
  const rows = modeRowsForPage([{ id: 'x', label: 'X', extra: true, prompt: 'Do x.' }, { id: 'mine', label: 'Mine', prompt: 'Mine.' }]);
  assert.equal(rows.find((row) => row.id === 'x').about.instructions, 'Do x.');
  assert.equal(rows.find((row) => row.id === 'mine').about, null);
  // The page: the view inside the add-on mode's editor, each line once.
  assert.match(source, /mode\.about \? h\(ModeAbout, \{ t, ui, lang, mode, names \}\) : null,/);
  for (const key of ['mt.view', 'mt.ro.title', 'mt.ro.i.what', 'mt.ro.i.change', 'mt.ro.instructions', 'mt.ro.instructions.none', 'mt.ro.tools', 'mt.ro.tools.all', 'mt.ro.tools.none', 'mt.ro.tools.list', 'mt.ro.tools.show', 'mt.ro.tools.hide', 'mt.ro.access', 'mt.ro.access.inherit', 'mt.ro.access.read-only', 'mt.ro.access.workspace-write', 'mt.ro.access.danger-full-access', 'mt.ro.tier', 'mt.ro.tier.none', 'mt.ro.spaces', 'mt.ro.spaces.none']) {
    assert.equal(lines(key).length, 1, `${key}: once, English only`);
  }
});

test('Settings → Spaces says each window keeps its own space, with an (i)', () => {
  for (const key of ['sp.window', 'sp.window.hint', 'sp.window.what', 'sp.window.when', 'sp.window.change']) assert.equal(lines(key).length, 1, key);
  assert.match(source, /h\(ui\.Row, \{ title: t\('sp\.window'\), desc: t\('sp\.window\.hint'\), info: info\('sp\.window', \{\}\) \}/);
});

test('"(usual)" and "(default)" read differently', () => {
  assert.match(lines('sp.start.usual')[0], /\(usual\)/);
  assert.match(lines('plock.default')[0], /\(default\)/);
});

test('the new thread\'s mode is put on the page for the start page\'s chips', () => {
  assert.match(source, /if \(modeId\) root\.setAttribute\('data-dsh-draft-mode', modeId\);/);
  assert.match(source, /const draftMode = view\?\.shown && view\.fresh && typeof view\.current === 'string' \? view\.current : '';/);
});

test('Depth\'s name and the mode\'s name are the last labels to go (step 5)', () => {
  assert.match(source, /\.dsh-me-tools\[data-f5\] \.pair\[data-kind='depth'\] \.lbl\{display:none\}/);
  assert.match(source, /\.dsh-me-tools\[data-f5\] \.pair\[data-kind='mode'\] \.mname\{display:none\}/);
  assert.doesNotMatch(source, /\.dsh-me-tools\[data-f3\] \.pair\[data-kind='depth'\]/);
  assert.match(source, /\.dsh-me-tools\[data-f3\] \.pair\[data-kind='research'\] \.lbl\{display:none\}/, 'Deep research still goes at step 3');
  // A row on two lines anyway: the first step at which the core buttons share one line (lab: step 1 at 1280 px).
  assert.match(source, /if \(oneLine\(left\)\) \{ level = step; break; \}/);
  assert.match(source, /\.pair\[data-kind='mode'\] \.mname\{max-width:6\.5em;/);
});

test('Settings → Modes says thread and space, not conversation and tab', () => {
  for (const key of ['head.hint', 'new.group', 'new.scheduled.hint', 'start.group', 'long.hint', 'wsp.starts', 'space.colours.hint']) {
    const [en, other] = lines(key);
    assert.doesNotMatch(en, /\bconversations?\b|\btabs?\b|whatever tab/i, key);
    assert.equal(other, undefined, `${key}: English only`);
  }
  assert.match(lines('new.scheduled.hint')[0], /"New threads use the automation\\'s mode"/);
});
