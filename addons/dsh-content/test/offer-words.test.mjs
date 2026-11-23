// Item 4A, fix round (22 November 2026): the "Offer the Content mode" switch on this add-on's Settings page speaks of the
// Mode list (and the space, where it adds one), never of a tab, through the add-on's locale dictionary (English only,
// decision 28); its notes after a flip say the same.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

test('the Offer switch, its group, its description and its notes come from the English locale dictionary', () => {
  for (const key of ['offer.group', 'offer.title', 'offer.desc', 'offer.on', 'offer.off']) {
    assert.equal((source.match(new RegExp(`'${key.replace('.', '\\.')}': '`, 'g')) ?? []).length, 1, `${key}: English only`);
  }
  assert.ok(source.includes("'offer.title': 'Offer the Content mode'"));
  assert.doesNotMatch(source, /\bzh: \{ 'section\.title'/, 'no Chinese dictionary');
  assert.ok(source.includes("'offer.on': 'Switched on. Content appears in the Mode list in a moment.'"));
  assert.ok(source.includes("'section.title': 'Content'"), 'the Settings nav uses the add-on\'s English name');
  assert.match(source, /const tw = appCtx\.locale\.bind\(NS\);/);
  assert.match(source, /tw\('offer\.title'\)/);
  assert.match(source, /tw\('offer\.on'\)/);
});

test('no note or description sends the owner to a tab that spaces removed, or to "Preset in this tab"', () => {
  assert.doesNotMatch(source, /tab appears in the sidebar|the tab appears in a few seconds|is taken away in a moment\. The \w+ tab|Settings → Modes → Preset in this tab/);
});
