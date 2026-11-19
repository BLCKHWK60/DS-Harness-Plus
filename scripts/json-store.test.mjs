// The master copy of the shared JSON-store helper (docs/shared/json-store.js): a damaged file is kept for good,
// even when it is damaged twice in one second, and is never written over when it cannot be kept.
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { clearDamagedNotes, damagedNotes, readJsonStore } from '../docs/shared/json-store.js';

const temp = () => mkdtempSync(join(tmpdir(), 'dsh-json-master-'));

test('a file damaged twice in the same second keeps both damaged copies', () => {
  const dir = temp();
  try {
    clearDamagedNotes();
    const file = join(dir, 'data.json');
    const now = () => Date.UTC(2026, 10, 18, 9, 30, 15);
    writeFileSync(file, 'first damage');
    readJsonStore(file, {}, { now });
    writeFileSync(file, 'second damage');
    readJsonStore(file, {}, { now });
    writeFileSync(file, 'third damage');
    readJsonStore(file, {}, { now });
    const kept = readdirSync(dir).filter((name) => name.startsWith('data.json.damaged-')).sort();
    assert.equal(kept.length, 3);
    assert.deepEqual(kept.map((name) => readFileSync(join(dir, name), 'utf8')).sort(), ['first damage', 'second damage', 'third damage']);
    assert.equal(damagedNotes().length, 3);
  } finally {
    clearDamagedNotes();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('when a damaged file can be neither moved nor copied, it is left untouched and the store refuses to start empty', { skip: process.getuid?.() === 0 }, () => {
  const dir = temp();
  try {
    clearDamagedNotes();
    const file = join(dir, 'data.json');
    writeFileSync(file, '{"important": ');
    chmodSync(dir, 0o500); // nothing can be created or renamed in the folder
    assert.throws(() => readJsonStore(file, {}, { label: 'your data' }), /could not be made, so it was left untouched/);
    chmodSync(dir, 0o700);
    assert.equal(readFileSync(file, 'utf8'), '{"important": ', 'the damaged file is exactly as it was');
    assert.equal(readdirSync(dir).length, 1);
    assert.equal(damagedNotes().length, 1);
    assert.equal(damagedNotes()[0].aside, '');
  } finally {
    chmodSync(dir, 0o700);
    clearDamagedNotes();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a good file and a missing file still behave as before', () => {
  const dir = temp();
  try {
    clearDamagedNotes();
    writeFileSync(join(dir, 'ok.json'), '{"x":2}');
    assert.deepEqual(readJsonStore(join(dir, 'ok.json'), {}), { x: 2 });
    assert.deepEqual(readJsonStore(join(dir, 'none.json'), () => ({ a: 1 })), { a: 1 });
    assert.equal(existsSync(join(dir, 'none.json')), false);
    assert.equal(damagedNotes().length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
