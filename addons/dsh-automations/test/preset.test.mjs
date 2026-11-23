/**
 * Each automation's preset (item 7, point 22): what the page shows, and the destination a change sends to the
 * app's scheduler. Plain functions; nothing here touches the real app.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CHOICE, PRESET_WORDS, choiceNote, defaultChoice, presetChoices, presetInfo, presetKind, presetName, presetOfTask, targetWithPreset } from '../lib/preset.js';

const LIST = [
  { id: 'standard', order: 1 },
  { id: 'ptc', order: 2 },
  { id: 'minimal', order: 3 },
  { id: 'cordis', order: 4 },
  { id: 'my-own', name: 'Night work' },
  { id: 'broken-one', broken: 'a plugin is missing' },
];

test('names and kinds: Standard, PTC, Creator, and your own by its name', () => {
  assert.equal(presetName('standard'), 'Standard');
  assert.equal(presetName('ptc'), 'PTC');
  assert.equal(presetName('cordis'), 'Creator');
  assert.equal(presetName('my-own', LIST), 'Night work');
  assert.equal(presetName('unlisted', LIST), 'unlisted');
  assert.equal(presetKind('ptc'), 'ptc');
  assert.equal(presetKind('cordis'), 'creator');
  assert.equal(presetKind('my-own'), 'other');
});

test('the choices leave out broken presets and keep the app order', () => {
  const choices = presetChoices(LIST);
  assert.deepEqual(choices.map((choice) => choice.id), ['standard', 'ptc', 'minimal', 'cordis', 'my-own']);
  assert.equal(choices[4].name, 'Night work');
  assert.deepEqual(presetChoices(undefined), []);
});

test('an automation that opens its own conversation: the stored preset, else the app default', () => {
  const stored = presetOfTask({ target: { kind: 'new', create: { agentPreset: 'ptc' } } }, { defaultId: 'standard', list: LIST });
  assert.deepEqual(stored, { id: 'ptc', name: 'PTC', kind: 'ptc', from: 'own', changeable: true, newConversation: false });
  const none = presetOfTask({ target: { kind: 'new_once', sessionId: 's1', create: {} } }, { defaultId: 'standard' });
  assert.equal(none.id, 'standard');
  assert.equal(none.from, 'default');
  assert.equal(none.changeable, true);
  assert.equal(none.newConversation, false, 'not run yet: no conversation exists');
});

test('a one-conversation automation that ran: its conversation\'s real preset, and a change opens a new conversation', () => {
  const task = { target: { kind: 'new_once', sessionId: 's1', create: { agentPreset: 'ptc' } }, lastDelivery: { deliveredAt: '2026-11-20T08:00:00Z' } };
  const same = presetOfTask(task, { sessionPreset: () => 'ptc' });
  assert.equal(same.from, 'own');
  assert.equal(same.newConversation, true);
  const other = presetOfTask(task, { sessionPreset: () => 'standard' });
  assert.equal(other.id, 'standard');
  assert.equal(other.from, 'conversation');
  // The conversation cannot be read: the stored one is shown.
  const unread = presetOfTask(task, { sessionPreset: () => { throw new Error('gone'); } });
  assert.equal(unread.id, 'ptc');
  assert.equal(unread.newConversation, true);
});

test('an automation that writes into one conversation follows it and cannot be changed here', () => {
  const known = presetOfTask({ target: { kind: 'session', sessionId: 'c1' } }, { sessionPreset: (id) => (id === 'c1' ? 'cordis' : undefined) });
  assert.deepEqual(known, { id: 'cordis', name: 'Creator', kind: 'creator', from: 'conversation', changeable: false, newConversation: false });
  const unknown = presetOfTask({ target: { kind: 'session', sessionId: 'c2' } }, {});
  assert.equal(unknown.from, 'unknown');
  assert.equal(unknown.changeable, false);
  assert.throws(() => targetWithPreset({ kind: 'session', sessionId: 'c1' }, 'standard'), /keeps the preset it started with/);
});

test('a change keeps the destination kind and folder, and only sets the preset', () => {
  assert.deepEqual(targetWithPreset({ kind: 'new', create: { cwd: '/w', agentPreset: 'ptc' } }, 'standard'), { kind: 'new', create: { cwd: '/w', agentPreset: 'standard' } });
  // The reserved conversation id is never sent back: the app reserves a new one.
  assert.deepEqual(targetWithPreset({ kind: 'new_once', sessionId: 's1', create: {} }, 'ptc'), { kind: 'new_once', create: { agentPreset: 'ptc' } });
  assert.throws(() => targetWithPreset({ kind: 'new', create: {} }, ''), /Pick a preset/);
  assert.throws(() => targetWithPreset({ kind: 'new', create: {} }, '../x'), /Pick a preset/);
  assert.throws(() => targetWithPreset(undefined, 'standard'), /not known/);
});

test('the (i): PTC says it runs as a program each time, with nothing alarming', () => {
  const ptc = presetInfo({ id: 'ptc', name: 'PTC', kind: 'ptc', from: 'own', changeable: true, newConversation: false });
  assert.equal(ptc.title, 'Preset: PTC');
  assert.match(ptc.what, /runs as a program each time/);
  assert.doesNotMatch(`${ptc.what} ${ptc.when} ${ptc.change}`, /danger|unsafe|warning|risk/i);
  assert.match(ptc.change, /Nothing changes until you click/);
  const byDefault = presetInfo({ id: 'standard', name: 'Standard', kind: 'standard', from: 'default', changeable: true }, 'Standard');
  assert.match(byDefault.when, /default preset .*now Standard/);
  const fresh = presetInfo({ id: 'ptc', name: 'PTC', kind: 'ptc', from: 'own', changeable: true, newConversation: true });
  assert.match(fresh.change, /new thread/);
  const fixed = presetInfo({ id: 'cordis', name: 'Creator', kind: 'creator', from: 'conversation', changeable: false });
  assert.match(fixed.change, /make the automation again/);
  const own = presetInfo({ id: 'my-own', name: 'Night work', kind: 'other', from: 'own', changeable: true });
  assert.match(own.what, /Your own preset "Night work"/);
  assert.match(presetInfo({ id: '', from: 'unknown' }).what, /does not say/);
});

test('the line under the picker', () => {
  assert.equal(choiceNote({ kind: 'ptc' }), 'Runs as a program each time.');
  assert.equal(choiceNote({ kind: 'standard' }, { newConversation: true }), 'Uses its tools step by step. The next run opens a new thread.');
  assert.equal(choiceNote({ kind: 'other' }), '');
});

test('Minimal has its line, and App default can be picked again (lab, item 7)', () => {
  assert.equal(presetKind('minimal'), 'minimal');
  assert.match(choiceNote({ kind: 'minimal' }), /terminal and image reading/);
  assert.match(presetInfo({ id: 'minimal', name: 'Minimal', kind: 'minimal', from: 'own', changeable: true }).what, /testing and comparing/);
  const back = defaultChoice('standard', []);
  assert.deepEqual(back, { id: DEFAULT_CHOICE, name: 'App default (now Standard)', kind: 'default', description: '' });
  assert.match(choiceNote(back), /app's default preset/);
  assert.deepEqual(targetWithPreset({ kind: 'new', create: { cwd: '/w', agentPreset: 'ptc' } }, DEFAULT_CHOICE), { kind: 'new', create: { cwd: '/w' } }, 'nothing stored');
  assert.deepEqual(targetWithPreset({ kind: 'new_once', sessionId: 's1', create: { agentPreset: 'ptc' } }, DEFAULT_CHOICE), { kind: 'new_once', create: {} });
  assert.throws(() => targetWithPreset({ kind: 'session', sessionId: 'c1' }, DEFAULT_CHOICE), /keeps the preset it started with/);
});

test('a page that reports Chinese gets the English preset words and the app\'s English names (decision 28)', () => {
  assert.deepEqual(Object.keys(PRESET_WORDS), ['en'], 'no Chinese table');
  assert.equal(presetName('cordis', [], 'zh'), 'Creator');
  assert.equal(presetName('standard', [], 'zh-CN'), 'Standard');
  const info = presetInfo({ id: 'ptc', name: 'PTC', kind: 'ptc', from: 'default', changeable: true }, 'Standard', 'zh');
  assert.equal(info.title, 'Preset: PTC');
  assert.equal(info.lang, 'en', 'the (i) gets its English heads');
  assert.match(info.when, /now Standard/);
  assert.equal(defaultChoice('standard', [], 'zh').name, 'App default (now Standard)');
  assert.equal(choiceNote({ kind: 'ptc' }, { newConversation: true }, 'zh'), choiceNote({ kind: 'ptc' }, { newConversation: true }));
  assert.equal(presetInfo({ id: 'ptc', name: 'PTC', kind: 'ptc', from: 'own', changeable: true }).lang, 'en');
});
