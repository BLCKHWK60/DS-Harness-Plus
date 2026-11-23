// Item 4A, stage 1: a Mission's repair helper never changes the new space fields (ITEM4A-PLAN.md A2). Where a thread lives
// will decide its rules, so moving a thread or opening a space is never a repair. Refused even if one day they are shown
// on a page (not config-only), and listed as refused, never asked.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readSettingsIndex, refusedSetting, resolveSettingAsk } from '../lib/settings-fix.js';

// Stage 5 adds your own mode descriptions (Settings → Modes).
const FIELDS = ['modes.sessionSpaces', 'modes.modeSpaces', 'modes.spaceSettings', 'modes.spacesFilled', 'modes.modeDescriptions',
  // Fix round 2: the Plain chat carry marker and "Keep Plain chat inside its folder".
  'modes.plainCarried', 'modes.plainFence',
  // Final fix round: the per-add-on carry marker.
  'modes.plainCarriedIn'];

test('the space fields are refused, as shipped and as an ordinary page setting', () => {
  const index = readSettingsIndex();
  for (const field of FIELDS) {
    const shipped = index.find((entry) => entry.field === field);
    assert.ok(shipped, `${field} is in the settings list`);
    assert.notEqual(refusedSetting(shipped), '', field);
    const onPage = { page: 'modes', label: 'Spaces', field, kind: 'text', configOnly: false };
    assert.match(refusedSetting(onPage), /decides what a Mission or a thread may do/, field);
  }
});

test('an ask to change one is not turned into a change', () => {
  const index = readSettingsIndex();
  for (const field of FIELDS) {
    const result = resolveSettingAsk({ setting: field, to: '{}' }, { index, namespaces: [] });
    assert.equal(result.how, 'refused', `${field}: ${JSON.stringify(result)}`);
  }
});
