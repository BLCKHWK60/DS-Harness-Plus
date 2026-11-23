// Item 4A, stage 1: the new Modes fields are classed from day one (ITEM4A-PLAN.md A2). Each thread's space is pruned per
// Mac like the other per-conversation entries, and this Mac's one-time fill must not stop the other Mac's own; the owner's
// space ticks and per-space settings are about the setup and are shared like the rest of Modes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ALWAYS_SKIP, DEFAULT_SKIP, skipList } from '../index.mjs';

test('each thread\'s space and the one-time fill stay on each Mac, whatever skipFields says', () => {
  for (const field of ['modes.sessionSpaces', 'modes.spacesFilled']) {
    assert.ok(ALWAYS_SKIP.includes(field), field);
    assert.ok(DEFAULT_SKIP.includes(field), field);
    assert.ok(skipList([]).includes(field), `${field} stays even with an empty list`);
  }
});

test('the space ticks per mode and the per-space settings are shared like the rest of Modes', () => {
  // Stage 5: your own one-line descriptions per mode are about the setup too.
  for (const field of ['modes.modeSpaces', 'modes.spaceSettings', 'modes.modeDescriptions']) {
    assert.ok(!ALWAYS_SKIP.includes(field), field);
    assert.ok(!DEFAULT_SKIP.includes(field), field);
  }
});

test('fix round 2: the Plain chat carry marker and "Keep Plain chat inside its folder" stay on each Mac', () => {
  for (const field of ['modes.plainCarried', 'modes.plainCarriedIn', 'modes.plainFence', 'modes.plainAdded']) {
    assert.ok(ALWAYS_SKIP.includes(field), field);
    assert.ok(skipList([]).includes(field), `${field} stays even with an empty list`);
  }
});

test('stage 6b (Revision 2 L4): Modes\' guestRunSpaces stays on each Mac, also with your own skipFields', () => {
  assert.ok(ALWAYS_SKIP.includes('modes.guestRunSpaces'));
  // Stage 7 (6b lab leftover): and the mode each of them runs in.
  assert.ok(ALWAYS_SKIP.includes('modes.guestRunModes'));
  assert.ok(skipList(['color-schemes.custom']).includes('modes.guestRunModes'));
  assert.ok(skipList(['color-schemes.custom']).includes('modes.guestRunSpaces'));
});
