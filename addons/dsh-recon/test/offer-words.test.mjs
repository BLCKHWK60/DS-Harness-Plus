// Item 4A, fix round (22 November 2026): the "Offer the Recon mode" switch on this add-on's Settings page speaks of the
// Mode list (and the space, where it adds one), never of a tab, through the add-on's locale dictionary; its notes after
// a flip say the same. Stage 7 (decision 28): the dictionary and the names on the page are English only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

test('the Offer switch, its group, its description and its notes come from the English locale dictionary', () => {
  for (const key of ['offer.group', 'offer.title', 'offer.desc', 'offer.on', 'offer.off']) {
    assert.equal((source.match(new RegExp(`'${key.replace('.', '\\.')}': '`, 'g')) ?? []).length, 1, `${key}: English only`);
  }
  assert.ok(source.includes("'offer.title': 'Offer the Recon mode'"));
  assert.ok(source.includes("'offer.on': 'Switched on. The Recon mode and the Recon space appear in a moment.'"));
  assert.ok(source.includes("'section.title': 'Recon'"), 'the Settings nav uses the space\'s name');
  assert.doesNotMatch(source, /\bzh:\s*\{/, 'no Chinese dictionary');
  assert.match(source, /const tw = appCtx\.locale\.bind\(NS\);/);
  assert.match(source, /tw\('offer\.title'\)/);
  assert.match(source, /tw\('offer\.on'\)/);
});

test('no note or description sends the owner to a tab that spaces removed, or to "Preset in this tab"', () => {
  assert.doesNotMatch(source, /tab appears in the sidebar|the tab appears in a few seconds|is taken away in a moment\. The \w+ tab|Settings → Modes → Preset in this tab/);
});

test('door-target-names: an export target reads "(Space · Mode name)" in English, never with ids', () => {
  const body = source.slice(source.indexOf('function pageLang'), source.indexOf('function ExportDoor'));
  const SPACE_IDS = ['chat', 'code', 'devices', 'recon', 'workshop'];
  const targetNote = new Function('SPACE_IDS', `${body}; return targetNote;`)(SPACE_IDS);
  const dict = (lang) => {
    const at = source.indexOf(`${lang}: { 'section.title'`);
    const line = source.slice(at, source.indexOf('\n', at));
    return (key) => line.match(new RegExp(`'${key.replace('.', '\\.')}': '([^']*)'`))?.[1] ?? key;
  };
  assert.equal(targetNote({ space: 'chat', tab: 'research', mode: 'Research' }, dict('en')), ' (Chat · Research)');
  assert.equal(targetNote({ space: 'devices', tab: 'bench', mode: 'Bench' }, dict('en')), ' (Devices · Bench)');
  assert.equal(targetNote({ space: 'odd-space', tab: 'own-x', mode: 'My lens' }, dict('en')), ' (My lens)', 'an unknown space is left out, not shown as an id');
  assert.equal(targetNote({ space: '', tab: '', mode: '' }, dict('en')), '');
  for (const key of ['space.chat', 'space.code', 'space.devices', 'space.recon', 'space.workshop']) {
    assert.equal((source.match(new RegExp(`'${key.replace('.', '\\.')}': '`, 'g')) ?? []).length, 1, `${key}: English only`);
  }
  assert.doesNotMatch(source, /one\.space\.charAt\(0\)|`, \$\{one\.tab\}`/);
});

test('door-names-from-modes: Modes\' English names come first; an older Modes falls back to Recon\'s own copy; Chinese names are never shown', () => {
  const body = source.slice(source.indexOf('function pageLang'), source.indexOf('function ExportDoor'));
  const SPACE_IDS = ['chat', 'code', 'devices', 'recon', 'workshop'];
  const { targetNote, tabLabel } = new Function('SPACE_IDS', `${body}; return { targetNote, tabLabel };`)(SPACE_IDS);
  const dict = (lang) => {
    const at = source.indexOf(`${lang}: { 'section.title'`);
    const line = source.slice(at, source.indexOf('\n', at));
    return (key) => line.match(new RegExp(`'${key.replace('.', '\\.')}': '([^']*)'`))?.[1] ?? key;
  };
  const names = { en: { mode: 'Research+', space: 'Workshop+' } };
  assert.equal(targetNote({ space: 'workshop', mode: 'Research', names }, dict('en')), ' (Workshop+ · Research+)');
  // An older Modes: no names, or empty ones.
  assert.equal(targetNote({ space: 'workshop', mode: 'Research' }, dict('en')), ' (Workshop · Research)');
  assert.equal(targetNote({ space: 'devices', mode: 'Bench', names: { en: { mode: '', space: '' } } }, dict('en')), ' (Devices · Bench)');
  // Stage 7: a `zh` half from an older Recon or Modes is never used.
  const withZh = { en: { mode: 'Research', space: 'Workshop' }, zh: { mode: 'x-zh', space: 'y-zh' } };
  assert.equal(targetNote({ space: 'workshop', mode: 'Research', names: withZh }, dict('en')), ' (Workshop · Research)');
  assert.equal(tabLabel({ id: 'content', label: 'Content', names: { zh: { mode: 'x-zh' } } }, dict('en')), 'Content');
  assert.equal(tabLabel({ id: 'content', label: 'Content', names: { en: { mode: 'Content+' } } }, dict('en')), 'Content+');
  assert.equal(tabLabel({ id: 'content', label: 'Content' }, () => { throw new Error('no locale'); }), 'Content');
  assert.match(source, /tabLabel\(one, tw\)/, 'the new-conversation list uses it');
});
