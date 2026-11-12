import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { KEEP_MS, openTrash, safeId } from '../lib/trash.js';

/** A pretend app home with stored conversations, in a throwaway folder. */
function home() {
  const root = mkdtempSync(join(tmpdir(), 'cws-trash-'));
  const make = (id) => {
    const folder = join(root, 'sessions', '--proj--', id);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'session.v4.jsonl.zstd'), `log of ${id}`);
    const cache = join(root, 'cache', `${id}.json`);
    mkdirSync(join(root, 'cache'), { recursive: true });
    writeFileSync(cache, `{"id":"${id}"}`);
    return { id, folder, cache };
  };
  return { root, make, trash: openTrash(join(root, 'trash')) };
}

test('ids that could leave the trash folder are refused', () => {
  assert.equal(safeId('session-1a2b'), true);
  for (const bad of ['', '..', '../x', 'a/b', '.hidden', 'a..b', 7, undefined]) assert.equal(safeId(bad), false);
});

test('delete moves the conversation and its helpers out; put back returns them', () => {
  const { root, make, trash } = home();
  try {
    const main = make('session-main');
    const helper = make('session-helper');
    const other = make('session-other');
    trash.add({ id: main.id, title: '  My\n chat ', parts: [main, helper], deletedAt: 1000 });
    assert.equal(existsSync(main.folder), false);
    assert.equal(existsSync(helper.folder), false);
    assert.equal(existsSync(main.cache), false);
    assert.equal(existsSync(other.folder), true);
    assert.deepEqual(trash.list(), [{ id: main.id, title: 'My chat', deletedAt: 1000, pending: false }]);

    assert.equal(trash.restore(main.id), true);
    assert.equal(readFileSync(join(main.folder, 'session.v4.jsonl.zstd'), 'utf8'), 'log of session-main');
    assert.equal(readFileSync(helper.cache, 'utf8'), '{"id":"session-helper"}');
    assert.deepEqual(trash.list(), []);
    assert.equal(trash.restore(main.id), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('only a stored conversation can be deleted, and never twice', () => {
  const { root, make, trash } = home();
  try {
    const main = make('session-main');
    const notOne = join(root, 'documents');
    mkdirSync(notOne);
    writeFileSync(join(notOne, 'thesis.txt'), 'keep');
    assert.throws(() => trash.add({ id: 'session-x', parts: [{ id: 'session-x', folder: notOne }] }), /not a stored conversation/);
    assert.throws(() => trash.add({ id: '../x', parts: [{ id: '../x', folder: main.folder }] }), /not a conversation id/);
    assert.equal(existsSync(join(notOne, 'thesis.txt')), true);
    trash.add({ id: main.id, parts: [main] });
    const again = make('session-main');
    assert.throws(() => trash.add({ id: again.id, parts: [again] }), /already in the trash/);
    assert.throws(() => trash.restore(main.id), /already in its place/);
    assert.equal(existsSync(again.folder), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('one that is in use waits, is listed, and can be put back before it moves', () => {
  const { root, make, trash } = home();
  try {
    const main = make('session-main');
    trash.addPending({ id: main.id, title: 'Busy', deletedAt: 5 });
    assert.deepEqual(trash.list(), [{ id: main.id, title: 'Busy', deletedAt: 5, pending: true }]);
    assert.equal(existsSync(main.folder), true);
    assert.equal(trash.restore(main.id), true);
    assert.deepEqual(trash.list(), []);

    trash.addPending({ id: main.id, title: 'Busy', deletedAt: 5 });
    trash.add({ id: main.id, title: 'Busy', parts: [main], deletedAt: 5 });
    assert.deepEqual(trash.pending(), []);
    assert.equal(trash.list()[0].pending, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('after 30 days it is removed for good; younger ones stay', () => {
  const { root, make, trash } = home();
  try {
    const old = make('session-old');
    const young = make('session-young');
    const now = 100 * KEEP_MS;
    trash.add({ id: old.id, parts: [old], deletedAt: now - KEEP_MS - 1 });
    trash.add({ id: young.id, parts: [young], deletedAt: now - KEEP_MS + 60000 });
    assert.deepEqual(trash.purge(now), [old.id]);
    assert.deepEqual(trash.list().map((item) => item.id), [young.id]);
    assert.equal(existsSync(join(root, 'trash', old.id)), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
