/**
 * Item 4A, stage 6b, Part D (STAGE6B-DESIGN.md J20, D14): a space's start mode is kept when its add-on is switched off.
 * Switching off an add-on whose mode is a space's start mode writes nothing to `spaceSettings`; Settings → Spaces says
 * "start mode gone, X used instead"; a new thread there starts in the space's usual mode meanwhile; switched on again,
 * the choice is back. The nine mode add-ons (and Creator Plus's template for new ones) keep their one reset: they move
 * `defaultMode` back to `cowork` only when it named their own mode, and never write `spaceSettings` or a start mode.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boot, makeWorld, settle } from './app.mjs';

const RESEARCH = { label: 'Research', tools: 'all', sandbox: 'inherit', prompt: 'Research method.' };
const json = (value) => JSON.parse((typeof value === 'string' ? value : value?.get?.()) || '{}');
/** A stored setting as text (the stand-in keeps Config's volatile values until something writes a plain one). */
const plain = (value) => (typeof value?.get === 'function' ? value.get() : value);

/** What the Research add-on's own sync writes when it is switched off or on (dsh-research/index.js syncMode). */
async function researchSwitch(run, on) {
  const table = json(run.config.extraModes);
  if (on) table.research = RESEARCH;
  else delete table.research;
  const ops = [{ op: 'set', path: ['extraModes'], value: JSON.stringify(table) }];
  if (!on && plain(run.config.defaultMode) === 'research') ops.push({ op: 'set', path: ['defaultMode'], value: 'cowork' });
  await run.service().settings.mutate('modes', ops);
}

test('startmode-kept-when-addon-off: nothing is written to spaceSettings, the card says which mode is used, the choice comes back', async () => {
  const world = makeWorld({ defaultMode: 'cowork', extraModes: JSON.stringify({ research: RESEARCH }) });
  const run = boot(world, { tabs: true, maxTabs: 5 });
  await settle();
  const writes = [];
  // The stored settings: Modes' own writes and the add-on's land here, so comparing them covers every writer.
  const config = run.config;
  const seen = () => ({ spaceSettings: plain(config.spaceSettings), defaultMode: plain(config.defaultMode) });
  const spaces = run.service().spaces;
  await spaces.setSpace('chat', { startMode: 'research' });
  await settle();
  const before = seen();
  assert.deepEqual(json(before.spaceSettings), { chat: { startMode: 'research' } });
  const chatCard = () => spaces.page('en').cards.find((card) => card.id === 'chat');
  assert.equal(chatCard().startMode, 'research');
  assert.equal(chatCard().startModeGone, '');
  await run.open('d1');
  assert.deepEqual(await spaces.startDraft('d1', { space: 'chat' }), { claimed: true, mode: 'research', space: 'chat' });

  // Research is switched off: its add-on takes its mode out of extraModes (and resets defaultMode only if it named it).
  const mutate = plain(config.spaceSettings);
  const addon = { config, service: () => ({ settings: { mutate: async (ns, ops) => { writes.push(...ops); for (const op of ops) config[op.path[0]] = op.value; } } }) };
  await researchSwitch(addon, false);
  for (let i = 0; i < 4; i += 1) await settle();
  assert.equal(plain(config.spaceSettings), mutate, 'spaceSettings is not written');
  assert.deepEqual(json(config.spaceSettings), { chat: { startMode: 'research' } }, 'the owner\'s choice is kept');
  assert.ok(writes.every((op) => op.path[0] !== 'spaceSettings'), 'the add-on writes no spaceSettings');
  assert.equal(plain(config.defaultMode), 'cowork', 'defaultMode did not name Research: untouched');
  const gone = chatCard();
  assert.equal(gone.startMode, 'plain', 'Chat\'s usual start mode is used instead');
  assert.equal(gone.startModeGone, 'research');
  assert.equal(gone.startModeGoneLabel, 'Research', 'by its name, never the raw id');
  assert.equal(gone.startModeGoneOff, true, 'lab fix: the card knows the add-on is off (switch it on, ticking cannot help)');
  assert.equal(spaces.page('zh').cards.find((card) => card.id === 'chat').startModeGoneLabel, 'Research', 'and in English on a Chinese page');
  await run.open('d2');
  assert.deepEqual(await spaces.startDraft('d2', { space: 'chat' }), { claimed: true, mode: 'plain', space: 'chat' });

  // Switched on again: the choice is back, with nothing to do for the owner.
  await researchSwitch(addon, true);
  for (let i = 0; i < 4; i += 1) await settle();
  assert.equal(chatCard().startMode, 'research');
  assert.equal(chatCard().startModeGone, '');
  assert.equal(chatCard().startModeGoneOff, false);
  await run.open('d3');
  assert.deepEqual(await spaces.startDraft('d3', { space: 'chat' }), { claimed: true, mode: 'research', space: 'chat' });
  assert.equal(plain(config.spaceSettings), mutate, 'still never written');
  run.stop();
});

test('defaultmode-reset-unchanged: the reset moves defaultMode to cowork only when it named the mode', async () => {
  const config = { extraModes: JSON.stringify({ research: RESEARCH }), defaultMode: 'research', spaceSettings: '{"chat":{"startMode":"research"}}' };
  const writes = [];
  const run = { config, service: () => ({ settings: { mutate: async (ns, ops) => { writes.push(...ops); for (const op of ops) config[op.path[0]] = op.value; } } }) };
  await researchSwitch(run, false);
  assert.equal(config.defaultMode, 'cowork');
  assert.equal(config.spaceSettings, '{"chat":{"startMode":"research"}}');
  writes.length = 0;
  config.defaultMode = 'recon';
  await researchSwitch(run, false);
  assert.equal(config.defaultMode, 'recon', 'another mode\'s defaultMode is not this add-on\'s to change');
  assert.ok(writes.every((op) => op.path[0] !== 'defaultMode'));
});

/** The add-ons with a mode, and the line that resets `defaultMode` in each (Part B wrote three of the comments). */
const RESETS = ['dsh-research', 'dsh-finance', 'dsh-recon', 'dsh-content', 'dsh-scout', 'dsh-data', 'dsh-automations', 'dsh-bench', 'dsh-creator-plus'];
const sourceOf = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('defaultmode-reset-unchanged: each of the nine mode add-ons keeps one guarded reset to cowork and never writes spaceSettings', () => {
  for (const addon of RESETS) {
    const source = sourceOf(`${addon}/index.js`);
    // A comment read as one line (its wrapping differs from add-on to add-on).
    const said = source.replace(/\n\s*\/\/ /g, ' ');
    const writes = source.match(/path: \['defaultMode'\][^)]*\)/g) ?? [];
    assert.equal(writes.length, 1, `${addon}: one defaultMode write`);
    assert.match(writes[0], /value: 'cowork' \}\)$/, `${addon}: back to cowork`);
    const line = source.split('\n').find((one) => one.includes("path: ['defaultMode']"));
    assert.match(line, /\(!(on|enabled\(\)) && row\.value\.defaultMode === MODE_ID\)/, `${addon}: only when off and only when it named its own mode`);
    assert.doesNotMatch(source, /path: \['(spaceSettings|startMode)'\]/, `${addon}: never writes a space's start mode`);
    assert.match(said, /Item 4A, stage 6b \(D14\): without the Cowork sidebar/, `${addon}: says what the reset is for now`);
    assert.match(said, /keeps the owner's choice \(lib\/spaces\.js draftStartMode, startModeGone\)/, `${addon}: and who keeps the start mode`);
  }
});

test('defaultmode-reset-unchanged: Creator Plus\'s template and recipe for new mode add-ons say the same', () => {
  const scaffold = sourceOf('dsh-creator-plus/lib/scaffold.js');
  assert.match(scaffold, /if \(row\.value\.defaultMode === MODE_ID\) ops\.push\(\{ op: 'set', path: \['defaultMode'\], value: 'cowork' \}\);/);
  assert.match(scaffold, /this add-on never writes spaceSettings/);
  assert.doesNotMatch(scaffold, /path: \['(spaceSettings|startMode)'\]/);
  const recipe = JSON.parse(sourceOf('dsh-creator-plus/recipes/mode.json'));
  const step = recipe.steps.find((one) => one.id === 'extra-modes');
  assert.match(step.text, /move defaultMode back to cowork if it pointed at the (?:tab|mode)/, 'stage 7 may say mode');
  assert.match(step.text, /Do not write spaceSettings: Modes keeps the space's start mode\.$/);
});

test('startmode-gone-off-words: the Spaces card tells to switch the add-on on, and the list shows the kept choice (lab fix)', () => {
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  assert.match(client, /'sp\.start\.goneOff': '\{mode\} is switched off, so new threads in \{space\} start in \{now\} for now\./);
  // Recheck: a mode leaves the list when its add-on's Offer switch (on its Settings page) is off; switched off on the
  // Plugins page it stays listed (6a's held case), so the words point at the Offer switch, never at the Plugins page.
  const goneOff = [...client.matchAll(/'sp\.start\.goneOff': '([^\n]*)',\n/g)].map((m) => m[1]);
  assert.equal(goneOff.length, 1, 'English only');
  assert.match(goneOff[0], /switch "Offer the \{mode\} mode" back on \(Settings, \{mode\}\\'s page\)/);
  for (const words of goneOff) assert.doesNotMatch(words, /Plugins page/);
  assert.match(client, /one\.startModeGoneOff \? t\('sp\.start\.goneOff'/);
  assert.match(client, /value: one\.startModeGone \|\| one\.startMode/, 'the kept choice is what the list shows');
});
