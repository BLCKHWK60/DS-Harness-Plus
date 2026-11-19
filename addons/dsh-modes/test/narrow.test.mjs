import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const modes = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const activity = readFileSync(new URL('../../dsh-activity/client.js', import.meta.url), 'utf8');

test('narrow chat box (review H7): the rings give way below 560 px, the model button and Long run shrink below 400 px', () => {
  assert.match(modes, /if \(width < 560\) row\.setAttribute\('data-dsh-narrow', ''\)/);
  assert.match(modes, /if \(width < 400\) row\.setAttribute\('data-dsh-tiny', ''\)/);
  assert.match(modes, /\[data-dsh-narrow\] \.dsh-ac-inline\{display:none !important\}/);
  assert.match(modes, /\[data-dsh-tiny\] \.dsh-mc-trigger\{width:96px !important/);
  // The marks are measured on every refit and taken off when the row goes.
  assert.match(modes, /const fitAndMark = \(\) => \{ markNarrow\(\); fit\(\); \};/);
  assert.match(modes, /requestAnimationFrame\(fitAndMark\)/);
  assert.match(modes, /row\.removeAttribute\('data-dsh-narrow'\);\s*row\.removeAttribute\('data-dsh-tiny'\);/);
});

test('Activity hides its rings on narrow windows by itself, so Send stays even without Modes', () => {
  assert.match(activity, /@media \(max-width: 640px\) \{ \.dsh-ac-inline \{ display: none; \} \}/);
});

test('Long run is as wide as "Running" at the usual width (the row does not move between the two)', () => {
  assert.match(modes, /\.dsh-ms-runbtn\{min-width:92px;/);
});
