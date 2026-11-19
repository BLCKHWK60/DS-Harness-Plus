import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { clearDamagedNotes, damagedNotes } from '../lib/json-store.js';
import { openProjects } from '../lib/projects.js';

test('project instructions (review H4): a damaged file is kept aside, then a save starts a new one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-projects-damaged-'));
  try {
    clearDamagedNotes();
    const file = join(dir, 'projects.json');
    writeFileSync(file, '{"/Users/x/proj":{"tab":"code","instructions":"Always use tabs"},');
    const projects = openProjects(file);
    assert.deepEqual(projects.all(), {});
    projects.save(dir, { instructions: 'new' });
    const aside = readdirSync(dir).filter((name) => name.startsWith('projects.json.damaged-'));
    assert.equal(aside.length, 1);
    assert.match(readFileSync(join(dir, aside[0]), 'utf8'), /Always use tabs/);
    assert.equal(damagedNotes().length, 1);
    assert.match(damagedNotes()[0].label, /project instructions/);
  } finally {
    clearDamagedNotes();
    rmSync(dir, { recursive: true, force: true });
  }
});
