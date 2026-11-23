// Item 4A, stage 7 (owner's decision 28: Plus is English only). lib/spaces.js SHIPPED_MODE_NAMES lists the names each
// built-in and add-on mode ships with (old names included); goneName and startModeGoneOff use its keys to tell a shipped
// mode from the owner's own. A Chinese page gets the same English names as any other page.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SHIPPED_MODE_NAMES, modeName, spaceCards } from '../lib/spaces.js';
import * as spaces from '../lib/spaces.js';
import { loosenWarning, presetInfo } from '../lib/presetlock.js';

const modesClient = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

test('the shipped names: every built-in and add-on mode, English only, old names kept', () => {
  assert.deepEqual(Object.keys(SHIPPED_MODE_NAMES), ['plain', 'chat', 'cowork', 'code', 'research', 'data', 'finance', 'scout', 'content', 'automations', 'bench', 'recon', 'creator-plus']);
  assert.deepEqual([...SHIPPED_MODE_NAMES.bench.en], ['Devices', 'Bench', 'Bench Lab']);
  assert.deepEqual([...SHIPPED_MODE_NAMES.research.en], ['Research', 'Deep research']);
  for (const entry of Object.values(SHIPPED_MODE_NAMES)) assert.deepEqual(Object.keys(entry), ['en']);
  assert.equal(spaces.MODE_NAMES_ZH, undefined, 'the Chinese table is gone');
});

test('a Chinese page gets the English names: modeName, the browser copy, the preset texts', () => {
  for (const lang of ['zh', 'zh-CN', 'en', undefined]) {
    assert.equal(modeName({ id: 'finance', label: 'Finance' }, lang), 'Finance');
    assert.equal(modeName({ id: 'mine', label: 'My mode' }, lang), 'My mode');
  }
  assert.match(modesClient, /function modeNameIn\(mode, lang\) \{\n\s+return String\(mode\?\.label \?\? mode\?\.id \?\? ''\);/);
  assert.match(modesClient, /const presetLang = \(\) => 'en';/);
  const info = presetInfo({ label: 'Recon', modeId: 'recon', lock: 'standard', lang: 'zh', spaces: true });
  assert.equal(info.lang, 'en');
  assert.ok(info.more.some((line) => line.startsWith('Recon is set to Standard only') && line.includes('Other modes keep their own choice')), JSON.stringify(info.more));
  assert.match(loosenWarning('research', 'any', 'Research', 'zh'), /^$|Research/);
});

test('a start mode whose add-on is off is named as it ships, in English on a Chinese page too', () => {
  const cards = spaceCards({ spaces: [{ id: 'chat', shown: true }], spaceSettings: { chat: { startMode: 'research' } }, modes: [{ id: 'plain', label: 'Plain chat' }, { id: 'chat', label: 'Chat' }], lang: 'zh', ready: {} });
  const chat = cards.find((card) => card.id === 'chat');
  assert.equal(chat.startModeGoneLabel, 'Research');
  assert.equal(chat.startModeGoneOff, true);
});

test('no Chinese is left in the browser half outside the shared copies', () => {
  const own = modesClient.replace(/\/\/ ---- dsh-(kit|poll|ui):begin ----[\s\S]*?\/\/ ---- dsh-\1:end ----/g, '');
  assert.doesNotMatch(own, /[\u3000-\u303f\u3400-\u9fff\uff00-\uffef]/);
});
