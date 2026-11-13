import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { BLANK, ORDER, openPresets, parsePreset, presetText } from '../lib/presets.js';
import { openProjects } from '../lib/projects.js';

const shipped = fileURLToPath(new URL('../presets', import.meta.url));

test('the shipped presets are all there, in order, readable and general', () => {
  const list = openPresets(shipped, '').list();
  assert.deepEqual(list.map((preset) => preset.id), ORDER);
  assert.deepEqual(list[0], BLANK);
  for (const preset of list.slice(1)) {
    assert.equal(preset.own, false);
    assert.ok(preset.name && preset.description, preset.id);
    // Long enough to be useful, short enough to leave room for the user's own lines.
    assert.ok(preset.instructions.length > 800 && preset.instructions.length < 4000, `${preset.id}: ${preset.instructions.length}`);
    // Nothing of one person's: no names of people, servers, models or methods.
    assert.ok(!/qwen|deepseek-v|victor|localhost|\d+\.\d+\.\d+\.\d+/i.test(preset.instructions), preset.id);
  }
  assert.deepEqual(list.find((preset) => preset.id === 'paperwork').tools, ['data']);
  // Only Paperwork starts its conversations with Search off.
  assert.deepEqual(list.filter((preset) => preset.searchOff).map((preset) => preset.id), ['paperwork']);
  assert.deepEqual(list.find((preset) => preset.id === 'research').tools, ['finance', 'data']);
  assert.match(list.find((preset) => preset.id === 'paperwork').instructions, /Never repeat a full account number/);
  assert.match(list.find((preset) => preset.id === 'plan').instructions, /method of their own/);
});

test('a preset file is read strictly', () => {
  assert.deepEqual(parsePreset('---\nid: x1\nname:  My  Type \ndescription: d\ntools: data, nonsense, Finance, data\n---\n\nDo this.\r\nAnd that.\n'), { id: 'x1', name: 'My Type', description: 'd', tools: ['data', 'finance'], searchOff: false, instructions: 'Do this.\nAnd that.' });
  assert.equal(parsePreset('---\nid: p\nname: P\nsearch: OFF\n---\ntext').searchOff, true);
  assert.equal(parsePreset('no front matter'), undefined);
  assert.equal(parsePreset('---\nid: Bad Id\nname: n\n---\ntext'), undefined);
  assert.equal(parsePreset('---\nid: ok\nname: n\n---\n   '), undefined);
  assert.equal(parsePreset('---\nid: ok\n---\ntext'), undefined);
  const round = { id: 'my-a', name: 'A', description: 'about', tools: ['data'], searchOff: true, instructions: 'Line one.\nLine two.' };
  assert.deepEqual(parsePreset(presetText(round)), round);
});

test('the user\'s own presets: saved, replaced, listed last, removed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-presets-'));
  try {
    const own = join(dir, 'presets');
    const presets = openPresets(shipped, own);
    const saved = presets.save({ name: ' House  Method ', description: 'My method', tools: ['data', 'x'], instructions: 'Step 1.\nStep 2.' });
    assert.deepEqual(saved, { id: 'my-house-method', name: 'House Method', description: 'My method', tools: ['data'], searchOff: false, instructions: 'Step 1.\nStep 2.', own: true });
    assert.ok(existsSync(join(own, 'my-house-method.md')));
    presets.save({ name: 'Alpha notes', instructions: 'A.' });
    // Saving under the same name replaces; nothing is listed twice.
    presets.save({ name: 'house method', instructions: 'New text.' });
    const list = presets.list();
    assert.deepEqual(list.map((preset) => preset.id), [...ORDER, 'my-alpha-notes', 'my-house-method']);
    assert.equal(presets.get('my-house-method').instructions, 'New text.');
    assert.throws(() => presets.save({ name: 'Research', instructions: 'x' }), /comes with the app/);
    assert.throws(() => presets.save({ name: '', instructions: 'x' }), /Give the preset a name/);
    assert.throws(() => presets.save({ name: 'Empty', instructions: '  ' }), /no instructions/);
    // A file in the user's folder cannot stand in for a shipped preset.
    writeFileSync(join(own, 'research.md'), presetText({ id: 'research', name: 'Fake', description: '', instructions: 'Evil.' }));
    assert.equal(presets.get('research').name, 'Research');
    assert.equal(presets.remove('my-alpha-notes'), true);
    assert.equal(presets.remove('my-alpha-notes'), false);
    assert.throws(() => presets.remove('research'), /Only a preset of your own/);
    assert.throws(() => presets.remove('my-../../x'), /Only a preset of your own/);
    assert.equal(presets.get('my-alpha-notes'), undefined);
    assert.throws(() => openPresets(shipped, '').save({ name: 'x', instructions: 'y' }), /no data folder/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a project remembers its type beside its instructions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-projtype-'));
  try {
    const file = join(dir, 'projects.json');
    const projects = openProjects(file);
    projects.save(dir, { tab: 'cowork', instructions: 'Mine.' });
    assert.equal(projects.get(dir).preset, '');
    projects.save(dir, { preset: 'paperwork' });
    assert.deepEqual(projects.get(dir), { tab: 'cowork', instructions: 'Mine.', preset: 'paperwork' });
    // Changing the instructions leaves the type; a nonsense type is dropped.
    projects.save(dir, { instructions: 'Changed.' });
    assert.equal(openProjects(file).get(dir).preset, 'paperwork');
    projects.save(dir, { preset: 'Not A Type!' });
    assert.equal(projects.get(dir).preset, '');
    assert.ok(readFileSync(file, 'utf8').includes('Changed.'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a project is pointed at the shared tools its type uses', async () => {
  const { noteOf, sharedNote } = await import('../lib/projects.js');
  assert.equal(noteOf('P', '', []), '');
  assert.equal(sharedNote([]), '');
  const both = noteOf('Taxes', 'Be brief.', ['data', 'finance']);
  assert.match(both, /^This conversation belongs to the project "Taxes"[\s\S]*Be brief\.\n\nFor tables in this folder[\s\S]*data_query[\s\S]*\nFor figures about companies[\s\S]*finance_prices/);
  // A typed project without instructions of its own still gets the pointer.
  assert.match(noteOf('Taxes', '  ', ['data']), /^For tables in this folder/);
  assert.ok(!noteOf('Taxes', 'Be brief.', ['data']).includes('finance_'));
  assert.equal(noteOf('Taxes', 'Be brief.'), 'This conversation belongs to the project "Taxes". The user wrote these instructions for every conversation in this project. Follow them:\n\nBe brief.');
});
