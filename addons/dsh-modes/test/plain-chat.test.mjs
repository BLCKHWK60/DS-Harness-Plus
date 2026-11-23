// Item 4A, stage 4: Plain chat, the Chat mode's new words and the preset (i) line.
//   ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" --test test/plain-chat.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ADDED_MODES } from '../index.js';
import { CHAT_PROMPT, CHAT_PROMPT_BEFORE, modePromptOf, promptText } from '../lib/prompt.js';
import { NOT_A_MODE, presetInfo } from '../lib/presetlock.js';
import { SPACES, modeList } from '../lib/spaces.js';
import { plainAddOps } from '../lib/plain.js';

test('Plain chat: label "Plain chat", every tool, the inherited sandbox, no instructions; the start mode of the Chat space', () => {
  assert.deepEqual({ ...ADDED_MODES.plain }, { label: 'Plain chat', tools: 'all', sandbox: 'inherit', defaultTier: '', prompt: '' });
  assert.equal(SPACES.find((space) => space.id === 'chat').startMode, 'plain');
  assert.equal(SPACES.find((space) => space.id === 'code').startMode, 'code', 'Code keeps its own start mode');
  // No working method: Cowork's and Code's methods are for those modes only.
  assert.equal(promptText({ mode: { id: 'plain', ...ADDED_MODES.plain }, web: true, stepWeb: [] }), '');
  assert.doesNotMatch(promptText({ mode: { id: 'plain', ...ADDED_MODES.plain } }), /You are in/);
  // First in the Mode list of Chat and of Code; the shown names of the two existing modes stay "Chat" and "Cowork".
  const modes = [{ id: 'chat', label: 'Chat' }, { id: 'cowork', label: 'Cowork' }, { id: 'code', label: 'Code' }, { id: 'plain', label: 'Plain chat' }];
  assert.deepEqual(modeList('chat', modes).map((row) => row.label), ['Plain chat', 'Chat', 'Cowork']);
  assert.deepEqual(modeList('code', modes).map((row) => row.id), ['plain', 'code']);
});

test('the Chat mode no longer tells the user to switch to Cowork or Code mode: it points to the Mode list; your own words stay', () => {
  assert.doesNotMatch(CHAT_PROMPT, /Cowork|Code mode/);
  assert.match(CHAT_PROMPT, /Mode list under the chat box/);
  assert.equal(modePromptOf({ prompt: CHAT_PROMPT_BEFORE }), CHAT_PROMPT, 'the earlier built-in words, still stored, are read as the new ones');
  assert.equal(modePromptOf({ prompt: 'My own words. Switch to Cowork mode.' }), 'My own words. Switch to Cowork mode.');
  assert.equal(promptText({ mode: { id: 'chat', tools: 'none', prompt: CHAT_PROMPT_BEFORE } }), CHAT_PROMPT);
  assert.match(promptText({ mode: { id: 'chat', tools: 'none', prompt: CHAT_PROMPT_BEFORE }, off: true }), new RegExp(`^${CHAT_PROMPT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  for (const file of ['../index.js', '../client.js']) assert.ok(!readFileSync(new URL(file, import.meta.url), 'utf8').includes(`'${CHAT_PROMPT_BEFORE}'`), `${file}: the old words are not a default any more`);
});

test('the preset (i): with spaces live its first line says a preset is not a Plus mode (English, also on a Chinese page)', () => {
  assert.equal(NOT_A_MODE.en, 'Preset: how the model works with tools (Standard, PTC or Creator). It is fixed when a thread starts. It is not a Plus mode; Plus modes are the Mode list under the chat box.');
  assert.deepEqual(Object.keys(NOT_A_MODE), ['en'], 'English only');
  assert.equal(presetInfo({ label: 'Chat', modeId: 'plain', lock: 'any', spaces: true }).more[0], NOT_A_MODE.en);
  assert.equal(presetInfo({ label: 'Chat', modeId: 'plain', lock: 'any', spaces: true, lang: 'zh' }).more[0], NOT_A_MODE.en);
  assert.ok(!presetInfo({ label: 'Chat', modeId: 'chat', lock: 'any' }).more.includes(NOT_A_MODE.en), 'without spaces: as before');
  assert.match(readFileSync(new URL('../index.js', import.meta.url), 'utf8'), /lang, spaces: spacesLive\(\) \}\),/);
});

test('once on an existing install: Plain chat gets what Cowork has and it lacks; nothing else; then the flag', () => {
  assert.deepEqual(plainAddOps({}), [{ op: 'set', path: ['plainAdded'], value: true }]);
  assert.deepEqual(plainAddOps({ trimModes: ['code'] }).length, 1, 'Cowork does not load tools as needed: neither does Plain chat');
  const ops = plainAddOps({ trimModes: ['cowork'], skillsOff: '{"cowork":["a"],"chat":["b"]}', toolAccess: '{"cowork":{"groups":{"app":"ask"},"tools":{}}}' });
  assert.deepEqual(ops.map((op) => op.path[0]), ['trimModes', 'skillsOff', 'toolAccess', 'plainAdded']);
  assert.deepEqual(JSON.parse(ops[1].value), { cowork: ['a'], chat: ['b'], plain: ['a'] });
  assert.deepEqual(JSON.parse(ops[2].value).plain, { groups: { app: 'ask' }, tools: {} });
  // Plain chat already has its own: left alone. A broken value is never rewritten.
  assert.deepEqual(plainAddOps({ trimModes: ['cowork', 'plain'], skillsOff: '{"cowork":["a"],"plain":[]}', toolAccess: 'not json' }), [{ op: 'set', path: ['plainAdded'], value: true }]);
});

test('Plain chat in the page files: the chat box knows it (mode lookups), Load tools as needed starts with it', () => {
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  assert.match(client, /const ADDED_MODES = \{ plain: \{ label: 'Plain chat'/);
  assert.match(client, /BUILTIN\[current\] \?\? ADDED_MODES\[current\]/);
  assert.match(readFileSync(new URL('../index.js', import.meta.url), 'utf8'), /trimModes: z\.array\(z\.string\(\)\)\.default\(\['cowork', 'code', 'data', 'plain'\]\)/);
  // The seat for the Cowork sidebar's switch, right after the Mode list; the row's pill style stays out of it.
  assert.match(client, /modeShown \? h\('span', \{ className: 'dsh-me-seat', 'data-dsh-seat': 'place'/);
  assert.match(client, /\.dsh-me-tools button:where\(:not\(\.dsh-me-seat \*\)\)\{display:inline-flex/);
});
