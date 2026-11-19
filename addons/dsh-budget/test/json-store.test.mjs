import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { clearDamagedNotes } from '../lib/json-store.js';
import { openRecord } from '../lib/meter.js';

test('Budget (review H4): a damaged record is kept aside, not overwritten by the next save', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-budget-damaged-'));
  try {
    clearDamagedNotes();
    const file = join(dir, 'record.json');
    writeFileSync(file, '{"day":"2026-11-18","dayTokens": 9000');
    const record = openRecord(file);
    record.addTokens(10, Date.now());
    record.flush();
    const aside = readdirSync(dir).filter((name) => name.startsWith('record.json.damaged-'));
    assert.equal(aside.length, 1);
    assert.match(readFileSync(join(dir, aside[0]), 'utf8'), /9000/);
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).dayTokens, 10);
  } finally {
    clearDamagedNotes();
    rmSync(dir, { recursive: true, force: true });
  }
});
