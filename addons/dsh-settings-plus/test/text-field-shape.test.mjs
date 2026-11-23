// Stage 7 (lab): a text field keeps its shape while you type (it turned into a text box at the 61st letter, losing the
// cursor and asking "Yes, change it" mid-typing), and Enter saves a one-line text box.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

test('text-field-shape-from-saved-value: the text box is chosen from the saved value, not the draft', () => {
  const line = source.split('\n').find((text) => text.includes('const wideText = '));
  const wideText = new Function(`${line.trim()}\nreturn wideText;`)();
  assert.equal(wideText('/usr/local/bin/opencode'), false);
  assert.equal(wideText('x'.repeat(61)), true);
  assert.equal(wideText('{"a":1}'), true);
  assert.equal(wideText('a\nb'), true);
  assert.match(source, /control\.t === 'text' && \(wideText\(showValue\(control, current\)\) \|\| draft\.includes\('\\n'\)\)/);
  assert.doesNotMatch(source, /control\.t === 'text' && \(draft\.length > 60/, 'never from the length of the text being typed');
});

test('text-box-enter-saves: Enter in a one-line text box saves (blur), Shift+Enter does not', () => {
  assert.match(source, /if \(event\.key === 'Enter' && !event\.shiftKey && !event\.isComposing && !draft\.includes\('\\n'\)\) \{ event\.preventDefault\(\); event\.target\.blur\(\); \}/);
});
