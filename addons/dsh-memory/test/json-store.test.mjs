/**
 * Review H4: a damaged JSON file is kept aside and never read as empty and written over. The shared
 * helper (lib/json-store.js, the same file in every add-on that uses it) and Memory as the first store.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { clearDamagedNotes, damagedNotes, readJsonStore } from '../lib/json-store.js';
import { openMemory } from '../lib/store.js';

const temp = () => mkdtempSync(join(tmpdir(), 'dsh-json-store-'));

test('a missing file gives the default, silently; a good one is read as it is', () => {
  const dir = temp();
  try {
    clearDamagedNotes();
    assert.deepEqual(readJsonStore(join(dir, 'none.json'), () => ({ a: 1 })), { a: 1 });
    assert.deepEqual(readJsonStore('', []), []);
    writeFileSync(join(dir, 'ok.json'), '{"x":2}');
    assert.deepEqual(readJsonStore(join(dir, 'ok.json'), {}), { x: 2 });
    assert.equal(damagedNotes().length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a damaged file is renamed with a time stamp, kept, the default is used, and one plain note is queued', () => {
  const dir = temp();
  try {
    clearDamagedNotes();
    const file = join(dir, 'data.json');
    writeFileSync(file, '{"entries": [ truncated');
    const logged = [];
    const value = readJsonStore(file, () => ({ entries: [] }), { label: 'your Memory', warn: (text) => logged.push(text), now: () => Date.UTC(2026, 10, 18, 9, 30, 15) });
    assert.deepEqual(value, { entries: [] });
    assert.equal(existsSync(file), false, 'the damaged file is not left to be overwritten');
    const aside = readdirSync(dir).filter((name) => name.startsWith('data.json.damaged-'));
    assert.deepEqual(aside, ['data.json.damaged-20261118-093015']);
    assert.equal(readFileSync(join(dir, aside[0]), 'utf8'), '{"entries": [ truncated', 'its text is kept exactly');
    const notes = damagedNotes();
    assert.equal(notes.length, 1);
    assert.equal(notes[0].label, 'your Memory');
    assert.equal(notes[0].aside, join(dir, aside[0]));
    assert.match(logged.join('\n'), /it was kept as/);
    // A second read finds nothing there: no second note.
    readJsonStore(file, {}, { label: 'your Memory' });
    assert.equal(damagedNotes().length, 1);
    // The right JSON of the wrong shape counts as damaged too.
    writeFileSync(file, '[1,2]');
    assert.deepEqual(readJsonStore(file, {}, { valid: (found) => found && !Array.isArray(found) }), {});
    assert.equal(readdirSync(dir).filter((name) => name.includes('.damaged-')).length, 2);
  } finally {
    clearDamagedNotes();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Memory: a damaged file is kept aside, and the next save does not destroy it', () => {
  const dir = temp();
  try {
    clearDamagedNotes();
    const dataFile = join(dir, 'memory.json');
    writeFileSync(dataFile, '{"entries":[{"id":"a1","text":"I prefer short answers","addedAt":1,"checkedAt":1}], oops');
    const memory = openMemory({ dataFile, notesFile: join(dir, 'notes.md') });
    assert.equal(memory.list().entries.length, 0, 'starts empty');
    memory.add('I live in Lisbon', 'about me');
    assert.equal(memory.list().entries.length, 1);
    const aside = readdirSync(dir).filter((name) => name.startsWith('memory.json.damaged-'));
    assert.equal(aside.length, 1);
    assert.match(readFileSync(join(dir, aside[0]), 'utf8'), /I prefer short answers/, 'the old text can still be recovered by hand');
    assert.equal(damagedNotes().length, 1);
  } finally {
    clearDamagedNotes();
    rmSync(dir, { recursive: true, force: true });
  }
});
