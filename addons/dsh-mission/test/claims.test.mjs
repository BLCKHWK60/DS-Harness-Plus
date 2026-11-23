/**
 * Mission stage D (20 November 2026): one writer per file. The claims and the folder lock (lib/claims.js), the files an
 * apply_patch names, and a helper's sandbox widening.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createClaims } from '../lib/claims.js';
import { widens } from '../lib/guard.js';
import { patchPaths } from '../lib/paths.js';

const tick = (ms = 2) => new Promise((resolve) => setTimeout(resolve, ms));

test('claims: a file another item claims is refused; a lane that settles lets go, except the holds of an item that parked', () => {
  const claims = createClaims();
  assert.deepEqual(claims.claim('c', ['/r/a.js', '/r/b.js'], { item: '1', lane: 'L1' }), { ok: true });
  assert.deepEqual(claims.claim('c', ['/r/a.js'], { item: '1', lane: 'L1' }), { ok: true }, 'the same item again');
  const refused = claims.claim('c', ['/r/c.js', '/r/b.js'], { item: '2', lane: 'L2' });
  assert.deepEqual([refused.ok, refused.path, refused.by.item], [false, '/r/b.js', '1']);
  assert.equal(claims.holder('c', '/r/c.js'), undefined, 'nothing claimed when one file is refused');
  claims.settle('c', 'L1', { keep: true });
  assert.deepEqual(claims.holder('c', '/r/a.js'), { item: '1', lane: '', hold: true }, 'kept as a hold while item 1 waits');
  assert.equal(claims.claim('c', ['/r/a.js'], { item: '2', lane: 'L2' }).ok, false, 'a hold keeps others out');
  assert.equal(claims.claim('c', ['/r/a.js'], { item: '1', lane: 'L3' }).ok, true, 'its item goes on and takes it again');
  claims.settle('c', 'L3');
  assert.equal(claims.holder('c', '/r/a.js'), undefined);
  claims.releaseItem('c', '1');
  assert.deepEqual(claims.list('c'), []);
  claims.rebuild('c', [{ item: '4', paths: ['/r/d.js'] }]);
  assert.equal(claims.holder('c', '/r/d.js').item, '4', 'holds come back after a restart');
  assert.equal(claims.holder('other', '/r/d.js'), undefined, 'per conversation');
});

test('the folder lock: a file-changing command waits for the writes of others, blocks new ones while it waits, and never starves', async () => {
  const claims = createClaims();
  assert.equal(await claims.enter('c', 'w1', { lane: 'L1', mode: 'shared' }), true);
  let ran = false;
  const command = claims.enter('c', 'x1', { lane: 'L2', mode: 'exclusive' }).then((ok) => { ran = ok; return ok; });
  await tick();
  assert.equal(ran, false, 'waits for L1\'s write');
  let wrote = false;
  const write = claims.enter('c', 'w2', { lane: 'L3', mode: 'shared' }).then((ok) => { wrote = ok; return ok; });
  const own = await claims.enter('c', 'w3', { lane: 'L2', mode: 'shared' });
  assert.equal(own, true, 'the waiting lane\'s own call is not held up by itself');
  claims.leave('c', 'w3');
  await tick();
  assert.equal(wrote, false, 'a new write waits behind the command');
  claims.leave('c', 'w1');
  assert.equal(await command, true);
  assert.equal(wrote, false, 'not while the command runs');
  claims.leave('c', 'x1');
  assert.equal(await write, true);
  claims.leave('c', 'w2');
  assert.deepEqual(claims.lockOf('c'), { shared: 0, exclusive: '', waiting: 0 });
});

test('the folder lock: a wait ends after its time or when its lane is stopped; a settled lane lets go of everything; old entries do not count', async () => {
  let now = 0;
  const claims = createClaims({ now: () => now, staleMs: 1000 });
  await claims.enter('c', 'x1', { lane: 'L1', mode: 'exclusive' });
  assert.equal(await claims.enter('c', 'w1', { lane: 'L2', mode: 'shared', maxMs: 10 }), false, 'FOLDER_BUSY after its wait');
  const stop = new AbortController();
  const waiting = claims.enter('c', 'w2', { lane: 'L2', mode: 'shared', signal: stop.signal });
  stop.abort();
  assert.equal(await waiting, false);
  const pending = claims.enter('c', 'w3', { lane: 'L3', mode: 'shared' });
  claims.settle('c', 'L1');
  assert.equal(await pending, true, 'L1 settled: its command\'s place is free');
  claims.settle('c', 'L3');
  assert.equal(claims.lockOf('c').shared, 0);
  await claims.enter('c', 'x9', { lane: 'L9', mode: 'exclusive' });
  now = 5000;
  assert.equal(await claims.enter('c', 'w9', { lane: 'L8', mode: 'shared', maxMs: 10 }), true, 'a left-behind entry no longer counts');
  claims.clear('c');
});

test('the folder lock: an entry kept past its lane (a background job) stays when the lane settles, until it is left', async () => {
  const claims = createClaims();
  assert.equal(await claims.enter('c', 'job', { lane: 'L1', mode: 'exclusive' }), true);
  claims.keep('c', 'job');
  claims.settle('c', 'L1');
  assert.equal(claims.lockOf('c').exclusive, 'job', 'kept after its helper stopped');
  let inside;
  const write = claims.enter('c', 'w', { lane: 'L2', mode: 'shared' }).then((ok) => { inside = ok; });
  await tick(5);
  assert.equal(inside, undefined, 'another helper waits');
  claims.leave('c', 'job');
  await write;
  assert.equal(inside, true);
});

test('apply_patch: the files its headers name are read (to keep helpers apart)', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'mission-claims-')));
  try {
    const input = ['*** Begin Patch', '*** Update File: src/a.js', '@@', '-x', '+y', '*** Add File: b.txt', '+hi', '*** Delete File: old.txt', '*** Update File: c.js', '*** Move to: d.js', '*** End Patch'].join('\n');
    assert.deepEqual(patchPaths({ input }, root), ['src/a.js', 'b.txt', 'old.txt', 'c.js', 'd.js'].map((file) => join(root, file)));
    assert.deepEqual(patchPaths({ path: 'x' }, root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a helper\'s wider sandbox for one command is read as a widening; the same or a narrower level is not', () => {
  assert.equal(widens('workspace-write', 'read-only'), true);
  assert.equal(widens('read-only', 'workspace-write'), false);
  assert.equal(widens({ mode: 'danger-full-access' }, 'workspace-write'), true);
  assert.equal(widens('something else', 'workspace-write'), true, 'anything Mission cannot read counts as wider');
  assert.equal(widens(undefined, 'read-only'), false);
});
