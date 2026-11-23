// Item 4A, stage 7 (owner decision 28): Plus is English only. The page shows English even when the app is set to
// Chinese. The one Chinese word left outside the shared dsh-ui copy is input matching: the app's Send button label.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const CJK = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/;

test('no Chinese word list, chips, mode names or language check; no zh locale file', () => {
  assert.equal(existsSync(new URL('../locale/zh.json', import.meta.url)), false);
  // The shared dsh-ui block is copied from docs/shared/dsh-ui.js and changed only there.
  const own = source.slice(0, source.indexOf('// ---- dsh-ui:begin')) + source.slice(source.indexOf('// ---- dsh-ui:end'));
  assert.doesNotMatch(own, /\bzh: \{|CHIP_ZH|MODE_NAMES_ZH|chipInLanguage|isZh\(/);
  const lines = own.split('\n').filter((line) => CJK.test(line));
  assert.equal(lines.length, 1, lines.join('\n'));
  assert.ok(lines[0].includes('if (!/send|\u53d1\u9001/i.test('), 'only the Send button match (input matching)');
});

test('the date title is English whatever the app reports', () => {
  const start = source.indexOf('function todayTitle(');
  const body = source.slice(start, source.indexOf('\n    }\n', start) + 6);
  const todayTitle = new Function(`return ${body};`)();
  const now = new Date(2026, 10, 11);
  assert.equal(todayTitle({ locale: { current: 'zh-CN' } }, now), '11 November, 2026');
  assert.equal(todayTitle({ locale: { current: 'en' } }, now), '11 November, 2026');
});

test('the page asks Modes in English', () => {
  assert.match(source, /readSpaces\('en'\)/);
  assert.doesNotMatch(source, /'x-dsh-locale': isZh/);
});
