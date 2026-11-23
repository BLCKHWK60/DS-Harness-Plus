import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const modes = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const activity = readFileSync(new URL('../../dsh-activity/client.js', import.meta.url), 'utf8');

test('narrow chat box (review H7): the rings give way below 560 px, the model button and Start Mission shrink below 400 px', () => {
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

test('Start Mission keeps one width at the usual width (the row does not move)', () => {
  assert.match(modes, /\.dsh-ms-runbtn\{min-width:92px;/);
});

test('Start Mission and the Mission\'s main button (stage B): one width, short labels in tiny rows, counted at one width', () => {
  assert.match(modes, /html\[data-dsh-uniform="true"\] \.dsh-ms-main\{min-width:92px;max-width:148px;/);
  assert.match(modes, /\[data-dsh-tiny\] \.dsh-ms-main\{min-width:0 !important;max-width:none !important;padding:0 10px !important\}/);
  assert.match(modes, /\[data-dsh-tiny\] \.dsh-ms-main\[data-short\]\{font-size:0 !important\}/);
  assert.match(modes, /\[data-dsh-tiny\] \.dsh-ms-main\[data-short\]::after\{content:attr\(data-short\);font-size:12px\}/);
  // While the step is chosen the Mission button counts at the width of its widest label ("Answer and continue" and its (i)),
  // so the row fits whichever Mission button shows (also in Split panes).
  const measured = Number(modes.match(/\[data-dsh-measure\] \.dsh-ms-runbtn-wrap\{display:inline-flex !important;box-sizing:border-box;min-width:(\d+)px\}/)?.[1]);
  const cap = Number(modes.match(/\.dsh-ms-main\{min-width:92px;max-width:(\d+)px/)?.[1]);
  assert.ok(measured >= cap + 20, 'counted at least as wide as the widest main button plus its (i)');
  assert.match(modes.split('\n').find((text) => text.includes("'box.uniform.hint':")), /Start Mission stays \(greyed\) where a Mission cannot start\./);
});
