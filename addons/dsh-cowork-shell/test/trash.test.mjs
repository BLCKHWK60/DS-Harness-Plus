import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { KEEP_MS, openTrash, safeId, safeTab, tidyPending } from '../lib/trash.js';

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
    assert.throws(() => trash.add({ id: 'session-x', parts: [{ id: 'session-x', folder: notOne }] }), /not a stored thread/);
    assert.throws(() => trash.add({ id: '../x', parts: [{ id: '../x', folder: main.folder }] }), /not a thread id/);
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

test('a Recon conversation ended with End and wipe never goes to the trash, and is not listed or put back', () => {
  const { root, make } = home();
  try {
    let wipingIds = new Set(['session-wiped']);
    const trash = openTrash(join(root, 'trash'), { wiping: (id) => wipingIds.has(id) });
    const wiped = make('session-wiped');
    const kept = make('session-kept');
    assert.throws(() => trash.add({ id: wiped.id, title: 'ended', parts: [wiped] }), /End and wipe/);
    assert.equal(existsSync(wiped.folder), true, 'its files stay where Recon deletes them');
    assert.throws(() => trash.addPending({ id: wiped.id, title: 'ended' }), /End and wipe/);
    trash.add({ id: kept.id, title: 'kept', parts: [kept], deletedAt: 5 });
    assert.deepEqual(trash.list().map((item) => item.id), [kept.id], 'an ordinary conversation still goes to the trash');
    // One that reached the trash before End and wipe (or was waiting to move) is no longer offered.
    wipingIds = new Set(['session-wiped', kept.id]);
    assert.deepEqual(trash.list(), []);
    assert.deepEqual(trash.pending(), []);
    assert.throws(() => trash.restore(kept.id), /End and wipe/);
    // A wiping list that throws counts as "not being wiped": today's behaviour.
    const plain = openTrash(join(root, 'trash2'), { wiping: () => { throw new Error('Recon is not running'); } });
    const other = make('session-other');
    plain.add({ id: other.id, title: 'other', parts: [other], deletedAt: 6 });
    assert.equal(plain.list().length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a waiting conversation whose files are gone leaves the list; one only briefly unlisted, or still open, stays', async () => {
  const { tidyPending } = await import('../lib/trash.js');
  const { root, make, trash } = home();
  try {
    const moving = make('session-moving');
    trash.addPending({ id: 'session-gone', title: 'gone', deletedAt: 1 });
    trash.addPending({ id: 'session-open', title: 'open', deletedAt: 2 });
    trash.addPending({ id: 'session-blink', title: 'blink', deletedAt: 3 });
    trash.addPending({ id: moving.id, title: 'moving', deletedAt: 4 });
    trash.addPending({ id: 'session-unarchived', title: 'back', deletedAt: 5 });
    let blinkChecks = 0;
    const waits = [];
    const moved = [];
    const done = await tidyPending(trash, {
      isArchived: (id) => id !== 'session-unarchived',
      inMemory: (id) => id === 'session-open',
      // "blink" is missing at the first look only; "moving" is stored.
      isStored: async (id) => (id === 'session-blink' ? (blinkChecks += 1) > 1 : id === moving.id),
      move: async (item) => { moved.push(item.id); trash.add({ id: item.id, title: item.title, parts: [moving], deletedAt: item.deletedAt }); },
      wait: async (ms) => { waits.push(ms); },
    });
    assert.deepEqual(done.dropped, ['session-gone']);
    assert.deepEqual(done.restored, ['session-unarchived']);
    assert.deepEqual(moved.sort(), ['session-blink', moving.id, 'session-open'].sort(), 'the briefly unlisted one and the open one are not dropped: the usual move is tried (it keeps an open one waiting)');
    assert.ok(done.failed.some((f) => f.id === 'session-blink'), 'its move fails here (the stand-in has no files for it) and it stays waiting');
    assert.equal(waits.length, 2, 'each missing conversation is checked twice');
    const left = trash.list().map((item) => item.id);
    assert.equal(left.includes('session-gone'), false, 'gone from the Trash list');
    assert.equal(left.includes('session-open'), true, 'an open conversation keeps waiting');
    assert.equal(left.includes(moving.id), true);
    assert.equal(trash.dropPending('session-gone'), false, 'nothing left to drop');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('delete permanently erases one moved conversation now, only inside the trash', () => {
  const { root, make, trash } = home();
  try {
    const main = make('session-main');
    const helper = make('session-helper');
    const other = make('session-other');
    trash.add({ id: main.id, title: 'gone', parts: [main, helper], deletedAt: 1 });
    trash.add({ id: other.id, title: 'kept', parts: [other], deletedAt: 2 });
    assert.equal(trash.erase(main.id), 'erased');
    assert.equal(existsSync(join(root, 'trash', main.id)), false, 'its folder in the trash is gone');
    assert.equal(existsSync(main.folder), false, 'and nothing came back to the store');
    assert.equal(existsSync(helper.folder), false);
    assert.deepEqual(trash.list().map((item) => item.id), [other.id], 'the other one stays');
    assert.equal(trash.restore(main.id), false, 'nothing left to put back');
    assert.equal(trash.erase(main.id), 'absent');
    assert.equal(trash.erase('session-never'), 'absent');
    for (const bad of ['..', '../sessions', 'a/b', '.hidden', '']) assert.throws(() => trash.erase(bad), /not a thread id/);
    assert.equal(existsSync(join(root, 'sessions')), true);

    // A link in the trash that points elsewhere: only the link goes, never what it points to.
    const outside = join(root, 'documents');
    mkdirSync(outside);
    writeFileSync(join(outside, 'thesis.txt'), 'keep');
    symlinkSync(outside, join(root, 'trash', 'session-link'));
    assert.equal(trash.erase('session-link'), 'erased');
    assert.equal(readFileSync(join(outside, 'thesis.txt'), 'utf8'), 'keep');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('delete permanently while it is still open: marked, not put back, erased once it moves', async () => {
  const { root, make, trash } = home();
  try {
    const busy = make('session-busy');
    trash.addPending({ id: busy.id, title: 'Busy', deletedAt: 5 });
    assert.equal(trash.erase(busy.id), 'marked');
    assert.equal(existsSync(busy.folder), true, 'the app still holds it: nothing is erased yet');
    assert.deepEqual(trash.list(), [{ id: busy.id, title: 'Busy', deletedAt: 5, pending: true, erasing: true }]);
    assert.throws(() => trash.restore(busy.id), /being deleted permanently/);

    // Still open at the next tidy: it keeps waiting, still marked.
    let open = true;
    const host = {
      isArchived: () => true,
      inMemory: () => open,
      isStored: async () => true,
      move: async (item) => { if (!open) trash.add({ id: item.id, title: item.title, parts: [busy], deletedAt: item.deletedAt }); },
      wait: async () => {},
    };
    let done = await tidyPending(trash, host);
    assert.deepEqual(done.erased, []);
    assert.equal(trash.list()[0].erasing, true);

    // Let go: it moves and is erased at once, from the store and from the trash.
    open = false;
    done = await tidyPending(trash, host);
    assert.deepEqual(done.erased, [busy.id]);
    assert.deepEqual(done.moved, []);
    assert.equal(existsSync(busy.folder), false);
    assert.equal(existsSync(join(root, 'trash', busy.id)), false);
    assert.deepEqual(trash.list(), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('one marked to be deleted permanently but taken out of the archive by hand is kept', async () => {
  const { root, make, trash } = home();
  try {
    const busy = make('session-busy');
    trash.addPending({ id: busy.id, title: 'Busy', deletedAt: 5 });
    trash.erase(busy.id);
    const done = await tidyPending(trash, {
      isArchived: () => false,
      inMemory: () => false,
      isStored: async () => true,
      move: async () => { throw new Error('must not move'); },
      wait: async () => {},
    });
    assert.deepEqual(done.restored, [busy.id]);
    assert.deepEqual(done.failed, []);
    assert.deepEqual(trash.list(), []);
    assert.equal(existsSync(busy.folder), true, 'its files stay where they are');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('each deleted conversation keeps the tab it was deleted from; a bad tab name is not kept', () => {
  const { root, make, trash } = home();
  try {
    assert.equal(safeTab('recon'), true);
    assert.equal(safeTab('my-mode_2'), true);
    for (const bad of ['', '../x', 'a b', 'a/b', '-x', 'x'.repeat(129), 7, undefined, null]) assert.equal(safeTab(bad), false, String(bad));
    assert.equal(safeTab('x'.repeat(60)), true, 'a long mode id is kept');

    const recon = make('session-recon');
    const chat = make('session-chat');
    const odd = make('session-odd');
    trash.add({ id: recon.id, title: 'r', parts: [recon], deletedAt: 3, tab: 'recon' });
    trash.add({ id: chat.id, title: 'c', parts: [chat], deletedAt: 2, tab: 'chat' });
    trash.add({ id: odd.id, title: 'o', parts: [odd], deletedAt: 1, tab: '../../x' });
    assert.equal(JSON.parse(readFileSync(join(root, 'trash', recon.id, 'info.json'), 'utf8')).tab, 'recon', 'written with the record');
    assert.deepEqual(trash.list().map((item) => [item.id, item.tab]), [[recon.id, 'recon'], [chat.id, 'chat'], [odd.id, undefined]]);
    assert.equal('tab' in trash.list()[2], false, 'no tab key at all for a bad name');
    assert.equal(trash.restore(recon.id), true, 'put back as before');

    // One waiting to move keeps its tab, also when the tidy-up asks again without one, and keeps its
    // "delete permanently" mark; the move then hands the tab on.
    const busy = make('session-busy');
    trash.addPending({ id: busy.id, title: 'b', deletedAt: 9, tab: 'code' });
    trash.erase(busy.id);
    trash.addPending({ id: busy.id, title: 'b', deletedAt: 9 });
    assert.deepEqual(trash.pending().find((item) => item.id === busy.id), { id: busy.id, title: 'b', deletedAt: 9, tab: 'code', erase: true });
    assert.deepEqual(trash.list().find((item) => item.id === busy.id), { id: busy.id, title: 'b', deletedAt: 9, pending: true, tab: 'code', erasing: true });
    const item = trash.pending().find((entry) => entry.id === busy.id);
    trash.add({ id: item.id, title: item.title, parts: [busy], deletedAt: item.deletedAt, tab: item.tab });
    assert.equal(JSON.parse(readFileSync(join(root, 'trash', busy.id, 'info.json'), 'utf8')).tab, 'code');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a "delete permanently" clicked while the tidy-up is busy still counts; one put back meanwhile is skipped', async () => {
  const { root, make, trash } = home();
  try {
    const x = make('session-x');
    const y = make('session-y');
    trash.addPending({ id: x.id, title: 'x', deletedAt: 1 });
    trash.addPending({ id: y.id, title: 'y', deletedAt: 2 });
    const moved = [];
    const done = await tidyPending(trash, {
      isArchived: () => true,
      inMemory: () => false,
      // While the tidy-up looks at x, the user marks x and puts y back.
      isStored: async (id) => {
        if (id === x.id) { assert.equal(trash.erase(x.id), 'marked'); trash.restore(y.id); }
        return true;
      },
      move: async (item) => { moved.push(item.id); trash.add({ id: item.id, title: item.title, parts: [item.id === x.id ? x : y], deletedAt: item.deletedAt }); },
      wait: async () => {},
    });
    assert.deepEqual(done.erased, [x.id], 'the mark read when the files moved');
    assert.deepEqual(moved, [x.id], 'y was put back: not moved after all');
    assert.equal(existsSync(join(root, 'trash', x.id)), false);
    assert.equal(existsSync(y.folder), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('marked, moved, but not erased yet (the app stopped in between): shown as being deleted, erased at the next tidy-up', async () => {
  const { root, make, trash } = home();
  try {
    const x = make('session-x');
    trash.addPending({ id: x.id, title: 'x', deletedAt: 1, tab: 'code' });
    trash.erase(x.id);
    trash.add({ id: x.id, title: 'x', parts: [x], deletedAt: 1, tab: 'code' });
    assert.equal(JSON.parse(readFileSync(join(root, 'trash', x.id, 'info.json'), 'utf8')).erase, true, 'the mark went into the record');
    assert.deepEqual(trash.list(), [{ id: x.id, title: 'x', deletedAt: 1, pending: false, tab: 'code', erasing: true }]);
    assert.throws(() => trash.restore(x.id), /being deleted permanently/);
    const done = await tidyPending(trash, { isArchived: () => true, inMemory: () => false, isStored: async () => true, move: async () => {}, wait: async () => {} });
    assert.deepEqual(done.erased, [x.id]);
    assert.equal(existsSync(join(root, 'trash', x.id)), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a marked conversation that cannot be moved is not stuck: the mark comes off and Put back works again', async () => {
  const { root, make, trash } = home();
  try {
    const x = make('session-x');
    trash.addPending({ id: x.id, title: 'x', deletedAt: 1 });
    trash.erase(x.id);
    const done = await tidyPending(trash, {
      isArchived: () => true,
      inMemory: () => false,
      isStored: async () => true,
      move: async () => { throw new Error('this conversation is not stored as files'); },
      wait: async () => {},
    });
    assert.deepEqual(done.unmarked, [x.id]);
    assert.equal(trash.list()[0].erasing, undefined, 'no longer "Being deleted"');
    assert.equal(trash.restore(x.id), true, 'Put back works');
    assert.equal(existsSync(x.folder), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a move that broke off half-way cannot be erased (its files are still in the store); Put back cleans it up', () => {
  const { root, make, trash } = home();
  try {
    const x = make('session-x');
    // The record is written first; here the move itself never happened.
    mkdirSync(join(root, 'trash', x.id), { recursive: true });
    writeFileSync(join(root, 'trash', x.id, 'info.json'), JSON.stringify({ id: x.id, title: 'x', deletedAt: 1, parts: [{ id: x.id, from: x.folder, cacheFrom: null }] }));
    assert.equal(trash.list().length, 1);
    assert.throws(() => trash.erase(x.id), /did not all reach the trash/);
    assert.equal(existsSync(x.folder), true);
    assert.equal(existsSync(join(root, 'trash', x.id, 'info.json')), true, 'nothing removed');
    assert.equal(trash.restore(x.id), true);
    assert.deepEqual(trash.list(), []);
    assert.equal(existsSync(x.folder), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('only a conversation\'s folder can be erased, never the trash\'s own waiting list', () => {
  const { root, make, trash } = home();
  try {
    const x = make('session-x');
    trash.addPending({ id: x.id, title: 'x', deletedAt: 1 });
    trash.erase(x.id);
    assert.throws(() => trash.erase('pending.json'), /not a thread id/);
    assert.deepEqual(trash.pending().map((item) => [item.id, item.erase]), [[x.id, true]], 'the waiting list and its mark are intact');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the tidy-up never stops on a file it cannot write: it reports the problem and goes on', async () => {
  const { root, make, trash } = home();
  const folder = join(root, 'trash');
  try {
    const x = make('session-x');
    const y = make('session-y');
    trash.addPending({ id: x.id, title: 'x', deletedAt: 1 });
    trash.addPending({ id: y.id, title: 'y', deletedAt: 2 });
    trash.erase(x.id);
    // The trash folder read-only: no record can be written (writes go through a temp file there).
    chmodSync(folder, 0o555);
    const seen = [];
    const done = await tidyPending(trash, {
      isArchived: () => true,
      inMemory: () => false,
      isStored: async () => true,
      move: async (item) => { seen.push(item.id); throw new Error('the move failed'); },
      wait: async () => {},
    });
    assert.deepEqual(seen, [x.id, y.id], 'the next one is still handled');
    assert.ok(done.failed.some((f) => f.id === x.id && /EACCES|permission/i.test(f.error)), 'the failed unmark is reported');
  } finally {
    chmodSync(folder, 0o755);
    rmSync(root, { recursive: true, force: true });
  }
});

test('marked, but its file changed since (taken back at some point): it goes to the trash with Put back, not erased', async () => {
  const { root, make, trash } = home();
  try {
    const x = make('session-x');
    const y = make('session-y');
    trash.addPending({ id: x.id, title: 'x', deletedAt: 1 });
    trash.addPending({ id: y.id, title: 'y', deletedAt: 2 });
    trash.erase(x.id, { stamp: 'token-1' });
    trash.erase(y.id, { stamp: 'token-1' });
    assert.equal(trash.markStamp(x.id), 'token-1');
    const done = await tidyPending(trash, {
      isArchived: () => true,
      inMemory: () => false,
      isStored: async () => true,
      stampOf: async (id) => (id === x.id ? 'token-2' : 'token-1'),
      move: async (item) => trash.add({ id: item.id, title: item.title, parts: [item.id === x.id ? x : y], deletedAt: item.deletedAt }),
      wait: async () => {},
    });
    assert.deepEqual(done.kept, [x.id]);
    assert.deepEqual(done.erased, [y.id], 'unchanged: erased as asked');
    assert.deepEqual(trash.list().map((item) => [item.id, item.erasing]), [[x.id, undefined]]);
    assert.equal(trash.restore(x.id), true, 'Put back works');
    assert.equal(existsSync(x.folder), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a marked record whose move broke off half-way gets its mark taken off, so Put back works', async () => {
  const { root, make, trash } = home();
  try {
    const a = make('session-a');
    const b = make('session-b');
    const entry = join(root, 'trash', a.id);
    mkdirSync(join(entry, a.id), { recursive: true });
    renameSync(a.folder, join(entry, a.id, 'session'));
    writeFileSync(join(entry, 'info.json'), JSON.stringify({ id: a.id, title: 'a', deletedAt: 1, erase: true, parts: [{ id: a.id, from: a.folder, cacheFrom: null }, { id: b.id, from: b.folder, cacheFrom: null }] }));
    assert.equal(trash.list()[0].erasing, true);
    const done = await tidyPending(trash, { isArchived: () => true, inMemory: () => false, isStored: async () => true, move: async () => {}, wait: async () => {} });
    assert.deepEqual(done.unmarked, [a.id]);
    assert.equal('erase' in JSON.parse(readFileSync(join(entry, 'info.json'), 'utf8')), false, 'the mark is off the record');
    assert.equal(trash.list()[0].erasing, undefined);
    assert.equal(trash.restore(a.id), true);
    assert.equal(existsSync(a.folder), true);
    assert.equal(existsSync(b.folder), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('taken out of the archive and marked while the tidy-up was busy: kept, not reported as a failure', async () => {
  const { root, make, trash } = home();
  try {
    const a = make('session-a');
    const b = make('session-b');
    trash.addPending({ id: a.id, title: 'a', deletedAt: 1 });
    trash.addPending({ id: b.id, title: 'b', deletedAt: 2 });
    const done = await tidyPending(trash, {
      isArchived: (id) => id !== b.id,
      inMemory: () => false,
      isStored: async () => true,
      move: async (item) => { if (item.id === a.id) trash.erase(b.id); trash.add({ id: item.id, title: item.title, parts: [a], deletedAt: item.deletedAt }); },
      wait: async () => {},
    });
    assert.deepEqual(done.failed, []);
    assert.deepEqual(done.restored, [b.id]);
    assert.equal(trash.isWaiting(b.id), false);
    assert.equal(existsSync(b.folder), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('marked again (Empty trash after Delete permanently): the first change token stays', () => {
  const { root, make, trash } = home();
  try {
    const x = make('session-x');
    trash.addPending({ id: x.id, title: 'x', deletedAt: 1 });
    assert.equal(trash.erase(x.id, { stamp: 'first' }), 'marked');
    assert.equal(trash.erase(x.id, { stamp: 'second' }), 'marked');
    assert.equal(trash.markStamp(x.id), 'first');
    const y = make('session-y');
    trash.addPending({ id: y.id, title: 'y', deletedAt: 2 });
    trash.erase(y.id);
    trash.erase(y.id, { stamp: 'later' });
    assert.equal(trash.markStamp(y.id), 'later', 'no token at the first mark: the later one is kept');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the change token stays with the mark through every tidy-up while the conversation is still open', async () => {
  const { root, make, trash } = home();
  try {
    const x = make('session-x');
    trash.addPending({ id: x.id, title: 'x', deletedAt: 1 });
    trash.erase(x.id, { stamp: 'first' });
    let open = true;
    let token = 'first';
    const host = {
      isArchived: () => true,
      inMemory: () => open,
      isStored: async () => true,
      stampOf: async () => token,
      // As the add-on's remove(): still open, so it is asked to wait again.
      move: async (item) => (open ? trash.addPending({ id: item.id, title: item.title, deletedAt: item.deletedAt }) : trash.add({ id: item.id, title: item.title, parts: [x], deletedAt: item.deletedAt })),
      wait: async () => {},
    };
    await tidyPending(trash, host);
    assert.equal(trash.markStamp(x.id), 'first', 'kept through the tidy-up');
    // Then taken back and used while the add-on was off: the token no longer matches.
    open = false;
    token = 'changed';
    const done = await tidyPending(trash, host);
    assert.deepEqual(done.kept, [x.id]);
    assert.deepEqual(done.erased, []);
    assert.equal(trash.restore(x.id), true, 'Put back works');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


// ---- Scratch (step 34) -----------------------------------------------------------------------

test('a Scratch thread\'s folder moves with it, comes back with Put back, and is erased with it', () => {
  const { root, make, trash } = home();
  try {
    const thread = make('session-s1');
    const files = join(root, 'scratch', 'session-s1');
    mkdirSync(join(files, 'sub'), { recursive: true });
    writeFileSync(join(files, 'sub', 'a.txt'), 'A');
    trash.add({ id: thread.id, title: 'S', parts: [thread], folders: [files] });
    assert.equal(existsSync(files), false);
    assert.equal(trash.list()[0].files, true);
    assert.equal(trash.restore(thread.id), true);
    assert.equal(readFileSync(join(files, 'sub', 'a.txt'), 'utf8'), 'A');
    // Erased for good: the files go too (only inside the trash).
    trash.add({ id: thread.id, title: 'S', parts: [thread], folders: [files] });
    assert.equal(trash.erase(thread.id), 'erased');
    assert.equal(existsSync(files), false);
    assert.equal(existsSync(join(root, 'trash', thread.id)), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Put back: an empty folder made meanwhile gives way; one with files in it stops everything', () => {
  const { root, make, trash } = home();
  try {
    const thread = make('session-s1');
    const files = join(root, 'scratch', 'session-s1');
    mkdirSync(files, { recursive: true });
    writeFileSync(join(files, 'a.txt'), 'A');
    trash.add({ id: thread.id, title: 'S', parts: [thread], folders: [files] });
    mkdirSync(files);
    assert.equal(trash.restore(thread.id), true, 'an empty folder gives way');
    assert.equal(readFileSync(join(files, 'a.txt'), 'utf8'), 'A');
    trash.add({ id: thread.id, title: 'S', parts: [thread], folders: [files] });
    mkdirSync(files);
    writeFileSync(join(files, 'new.txt'), 'someone else');
    assert.throws(() => trash.restore(thread.id), /holds other files now/);
    assert.equal(existsSync(thread.folder), false, 'nothing moved: the messages stay in the trash too');
    assert.equal(readFileSync(join(files, 'new.txt'), 'utf8'), 'someone else', 'nothing overwritten');
    assert.equal(trash.list().length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a link or a missing folder is never moved; a folder move cut off half-way cannot be erased', () => {
  const { root, make, trash } = home();
  try {
    const thread = make('session-s1');
    const real = join(root, 'elsewhere');
    mkdirSync(real);
    writeFileSync(join(real, 'mine.txt'), 'keep');
    const link = join(root, 'scratch-link');
    symlinkSync(real, link);
    trash.add({ id: thread.id, title: 'S', parts: [thread], folders: [link, join(root, 'gone'), 'relative/x'] });
    assert.equal(existsSync(join(real, 'mine.txt')), true, 'a link is left alone');
    assert.equal(trash.list()[0].files, undefined);
    trash.restore(thread.id);
    // Cut off: the record names a folder that is still in place and not in the trash.
    const files = join(root, 'scratch', 'session-s1');
    mkdirSync(files, { recursive: true });
    trash.add({ id: thread.id, title: 'S', parts: [thread], folders: [files] });
    renameSync(join(root, 'trash', thread.id, 'files-0'), files);
    assert.throws(() => trash.erase(thread.id), /cannot be deleted permanently/);
    assert.equal(existsSync(files), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Item 4A, final fix round (lab: low): Delete archives a thread only to move it; Put back then took it back to Archived,
// so a second step (Archived → Restore) was needed. The record now says when Delete archived it itself, and Put back
// takes it out of Archived too; a thread you had archived yourself before deleting goes back to Archived as before.
test('Put back knows whether Delete archived the thread itself (back to the list) or you had (back to Archived)', () => {
  const { root, make, trash } = home();
  try {
    const mine = make('session-mine');
    const old = make('session-old');
    trash.add({ id: mine.id, title: 'x', parts: [mine], back: 'list' });
    trash.add({ id: old.id, title: 'y', parts: [old] });
    assert.equal(trash.backToList(mine.id), true);
    assert.equal(trash.backToList(old.id), false);
    // One that waited (open in the app) keeps the mark when it moves later.
    trash.addPending({ id: 'session-wait', title: 'z', back: 'list' });
    assert.equal(trash.backToList('session-wait'), true);
    const wait = make('session-wait');
    trash.add({ id: wait.id, title: 'z', parts: [wait] });
    assert.equal(trash.backToList(wait.id), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the route and the page carry the mark: the page says "back to the list" only when it archived the thread itself', () => {
  const host = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  assert.match(page, /const where = wasArchived \? tabOf\(id\) : \{ \.\.\.tabOf\(id\), back: 'list' \};/);
  assert.match(host, /const toList = trash\.backToList\(id\);[\s\S]{0,900}unarchiveSession\?\.\(id\)/);
  assert.match(host, /body\.back === 'list' \? 'list' : undefined/);
});
