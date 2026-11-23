import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { KEEP_MS, groupFields, groupLabel, openTrash, safeOwner } from '../lib/trash.js';
import * as old from './fixtures/trash-0.58.0.js';
import { trashedIds as modesTrashed } from '../../dsh-modes/lib/trashed.js';
import { trashedIds as tiersTrashed } from '../../dsh-model-tiers/lib/trashed.js';
import { wipeTrashed } from '../../dsh-recon/lib/wipe.js';

/** A pretend app home with stored conversations, in a throwaway folder. */
function home() {
  const root = mkdtempSync(join(tmpdir(), 'cws-shared-'));
  const make = (id) => {
    const folder = join(root, 'sessions', '--proj--', id);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'session.v4.jsonl.zstd'), `log of ${id}`);
    return { id, folder };
  };
  const dir = join(root, 'trash');
  return { root, dir, make, trash: openTrash(dir) };
}

const ROW = groupLabel('automations', 'task-1');
const group = (extra = {}) => ({ group: ROW, owner: 'automations', ownerLabel: 'Automations', groupTitle: 'Morning brief', ...extra });

test('a row label belongs to one owner and one key; a bad one makes an ordinary conversation', () => {
  assert.equal(ROW, 'group.automations.task-1');
  assert.equal(safeOwner('automations'), true);
  for (const bad of ['', 'A', 'x', '1abc', 'has space', 'a'.repeat(41)]) assert.equal(safeOwner(bad), false, bad);
  assert.equal(groupLabel('automations', '../x'), '');
  assert.equal(groupLabel('automations', 'k'.repeat(101)), '');
  assert.deepEqual(groupFields({ group: 'group.other.x', owner: 'automations' }), {}, 'a label of another owner');
  assert.deepEqual(groupFields({ group: ROW }), {}, 'no owner');
  assert.deepEqual(groupFields({ ...group(), ownerData: 'x'.repeat(5000) }), { group: ROW, owner: 'automations', ownerLabel: 'Automations', groupTitle: 'Morning brief' }, 'data over 4 KB is not kept');
});

test('old runs of one automation are one Trash row; each run is still its own record', () => {
  const { root, make, trash } = home();
  try {
    const runs = ['run-1', 'run-2', 'run-3'].map(make);
    runs.forEach((run, i) => trash.add({ id: run.id, title: `Run ${i + 1}`, parts: [run], deletedAt: (i + 1) * 10, tab: 'automations', ...group() }));
    trash.addPending({ id: 'run-4', title: 'Run 4', deletedAt: 40, tab: 'cowork', ...group({ groupTitle: 'Morning brief (new name)' }) });
    const odd = make('odd');
    trash.add({ id: odd.id, title: 'Odd', parts: [odd], deletedAt: 5, tab: 'chat', group: 'group.other.x', owner: 'automations' });
    const plain = make('plain');
    trash.add({ id: plain.id, title: 'Plain', parts: [plain], deletedAt: 50, tab: 'chat' });
    const rows = trash.list();
    assert.deepEqual(rows.map((row) => row.id), ['plain', ROW, 'odd'], 'newest first; a malformed group is an ordinary row');
    const row = rows[1];
    assert.equal(row.kind, 'group');
    assert.equal(row.count, 4);
    assert.deepEqual(row.ids.sort(), ['run-1', 'run-2', 'run-3', 'run-4']);
    assert.equal(row.firstAt, 10, 'days left count from the oldest run');
    assert.equal(row.deletedAt, 40);
    assert.equal(row.tab, 'cowork', 'tab from the newest record');
    assert.equal(row.title, 'Morning brief (new name)', 'the newest title');
    assert.equal(row.ownerLabel, 'Automations');
    assert.equal(row.pending, false, 'not every run waits');
    assert.equal('kind' in rows[0], false, 'an ordinary row is as before');
    // Each run is still its own record, with its group.
    assert.equal(JSON.parse(readFileSync(join(root, 'trash', 'run-2', 'info.json'), 'utf8')).group, ROW);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a waiting run keeps its group, its mark and its change token through the tidy-up, and when it moves', () => {
  const { root, make, trash } = home();
  try {
    const run = make('run-1');
    trash.addPending({ id: run.id, title: 'Run', deletedAt: 1, tab: 'automations', ...group({ ownerData: { line: 7 } }) });
    trash.erase(run.id, { stamp: 'token-1' });
    trash.addPending({ id: run.id, title: 'Run', deletedAt: 1 });
    const entry = trash.pending()[0];
    assert.equal(entry.group, ROW);
    assert.deepEqual(entry.ownerData, { line: 7 });
    assert.equal(entry.markedStamp, 'token-1');
    trash.add({ id: run.id, title: 'Run', parts: [run], deletedAt: 1 });
    const info = JSON.parse(readFileSync(join(root, 'trash', run.id, 'info.json'), 'utf8'));
    assert.equal(info.group, ROW, 'copied from the waiting entry when it moves');
    assert.equal(info.erase, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('each run leaves after its own 30 days; the row stays while one is left', () => {
  const { root, make, trash } = home();
  try {
    const now = 100 * KEEP_MS;
    const oldRun = make('run-old');
    const newRun = make('run-new');
    trash.add({ id: oldRun.id, title: 'Old', parts: [oldRun], deletedAt: now - KEEP_MS - 1, tab: 'automations', ...group({ ownerData: { line: 1 } }) });
    trash.add({ id: newRun.id, title: 'New', parts: [newRun], deletedAt: now - 1000, tab: 'automations', ...group() });
    const oldPiece = trash.addPiece({ ...group(), title: 'Recipe', deletedAt: now - KEEP_MS - 5, tab: 'automations', ownerData: { recipe: 1 } });
    const gone = [];
    assert.deepEqual(trash.purge(now, (what) => gone.push(what)), ['run-old'], 'the same answer as before: conversation ids');
    assert.deepEqual(gone, [
      { id: 'run-old', group: ROW, owner: 'automations', ownerData: { line: 1 } },
      { item: oldPiece, group: ROW, owner: 'automations', ownerData: { recipe: 1 } },
    ]);
    assert.deepEqual(trash.list().map((row) => [row.id, row.count]), [[ROW, 1]]);
    trash.purge(now + KEEP_MS);
    assert.deepEqual(trash.list(), [], 'gone with the last');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('kept data (a recipe) is a piece of its row: listed, never taken for a conversation, removed only inside the trash', () => {
  const { root, dir, make, trash } = home();
  try {
    const run = make('run-1');
    trash.add({ id: run.id, title: 'Run', parts: [run], deletedAt: 5, tab: 'automations', ...group() });
    const piece = trash.addPiece({ ...group(), title: 'Morning brief', deletedAt: 9, tab: 'automations', with: ['run-1', '../x'], ownerData: { cron: '0 9 * * *' } });
    assert.match(piece, /^piece-[0-9a-f-]{36}$/);
    const info = JSON.parse(readFileSync(join(dir, piece, 'info.json'), 'utf8'));
    assert.equal(info.format, 2);
    assert.equal('id' in info, false);
    assert.equal('parts' in info, false);
    assert.deepEqual(info.with, ['run-1'], 'only safe ids');
    let row = trash.list({ registered: () => true })[0];
    assert.deepEqual([row.id, row.count, row.data, row.deletedAt, row.firstAt], [ROW, 1, 1, 9, 5]);
    assert.equal(row.putBackNeeds, undefined);
    row = trash.list({ registered: () => false })[0];
    assert.equal(row.putBackNeeds, 'Automations', 'its owner is off: Put back needs it');
    assert.equal(trash.restore(piece), false, 'never put back as a conversation');
    assert.equal(existsSync(join(dir, piece)), true);
    trash.setPieceError(piece, 'Automations did not finish putting it back: busy');
    assert.equal(trash.list()[0].lastError, 'Automations did not finish putting it back: busy');
    assert.throws(() => trash.addPiece({ ...group(), title: 'Big', ownerData: 'x'.repeat(70000) }), /too large/);
    assert.throws(() => trash.addPiece({ group: 'group.x.y', owner: 'automations', title: 'Bad' }), /not a row key/);
    assert.equal(trash.removePiece(piece), true);
    assert.equal(existsSync(join(dir, piece)), false);
    assert.equal(existsSync(join(dir, 'run-1')), true, 'the run stays');
    // A link named like a piece is no piece: only the link goes, never what it points to.
    const outside = join(root, 'documents');
    mkdirSync(outside);
    writeFileSync(join(outside, 'keep.txt'), 'keep');
    symlinkSync(outside, join(dir, 'piece-link'));
    assert.equal(trash.isPiece('piece-link'), false);
    assert.equal(trash.erase('piece-link'), 'erased');
    assert.equal(readFileSync(join(outside, 'keep.txt'), 'utf8'), 'keep');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a folder piece written by a later version is listed but never moved, followed or put back', () => {
  const { root, dir, trash } = home();
  try {
    const mine = join(root, 'Scratch', 'thread-1');
    mkdirSync(mine, { recursive: true });
    writeFileSync(join(mine, 'notes.md'), 'mine');
    mkdirSync(join(dir, 'piece-later'), { recursive: true });
    writeFileSync(join(dir, 'piece-later', 'info.json'), JSON.stringify({ format: 2, item: 'piece-later', kind: 'folder', ...group(), title: 'Thread', deletedAt: 3, tab: 'cowork', from: mine, state: 'moved' }));
    const row = trash.list()[0];
    assert.equal(row.newer, true);
    assert.deepEqual([row.data, row.folders, row.pieces], [0, 1, ['piece-later']], 'a folder is counted apart from kept data');
    assert.equal(trash.erase('piece-later'), 'erased');
    assert.equal(readFileSync(join(mine, 'notes.md'), 'utf8'), 'mine', 'its `from` is never touched');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('records are written whole: no temp file is left, and old ones from a write cut off are swept', () => {
  const { root, dir, make, trash } = home();
  try {
    const run = make('run-1');
    trash.addPending({ id: 'run-2', title: 'Waiting', deletedAt: 2, ...group() });
    trash.add({ id: run.id, title: 'Run', parts: [run], deletedAt: 1, ...group() });
    const temps = (folder) => readdirSync(folder).filter((name) => name.endsWith('.tmp'));
    assert.deepEqual(temps(dir), []);
    assert.deepEqual(temps(join(dir, 'run-1')), []);
    const stale = join(dir, 'pending.json.123.4.tmp');
    const fresh = join(dir, 'run-1', 'info.json.123.5.tmp');
    writeFileSync(stale, '{"half');
    writeFileSync(fresh, '{"half');
    const hourAgo = (Date.now() - 2 * 60 * 60 * 1000) / 1000;
    utimesSync(stale, hourAgo, hourAgo);
    assert.equal(trash.list()[0].count, 2, 'a stray temp file changes nothing');
    assert.throws(() => trash.erase('pending.json.123.4.tmp'), /not a thread id/);
    trash.sweepTemp();
    assert.equal(existsSync(stale), false, 'an hour old: swept');
    assert.equal(existsSync(fresh), true, 'a write may still be going on');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Modes, Model Tiers and Recon read grouped runs as before, and never take a piece for a conversation', () => {
  const { root, dir, make, trash } = home();
  try {
    const run = make('run-1');
    const helper = make('helper-1');
    trash.add({ id: run.id, title: 'Run', parts: [run, helper], deletedAt: 1, ...group() });
    trash.addPending({ id: 'run-2', title: 'Waiting', deletedAt: 2, ...group() });
    const run3 = make('run-third');
    trash.add({ id: run3.id, title: 'Run 3', parts: [run3], deletedAt: 3, ...group() });
    const piece = trash.addPiece({ ...group(), title: 'Recipe', ownerData: {} });
    for (const read of [modesTrashed, tiersTrashed]) {
      const ids = read(dir);
      for (const id of ['run-1', 'helper-1', 'run-2', 'run-third']) assert.equal(ids.has(id), true, id);
      assert.equal(ids.has(piece), false);
      assert.equal(ids.has(ROW), false);
    }
    const modesFile = readFileSync(new URL('../../dsh-modes/lib/trashed.js', import.meta.url), 'utf8');
    const tiersFile = readFileSync(new URL('../../dsh-model-tiers/lib/trashed.js', import.meta.url), 'utf8');
    assert.equal(modesFile, tiersFile, 'the two readers stay the same file');
    // Recon's End and wipe removes one run from the trash: the row shrinks.
    assert.deepEqual(wipeTrashed(dir, 'run-third'), { removed: true, unlisted: false });
    assert.equal(trash.list()[0].count, 2);
    assert.deepEqual(trash.locate(['run-1', 'helper-1', 'run-2', 'nope']), {
      'run-1': { row: ROW, state: 'moved', erasing: false, owner: 'automations', key: 'task-1' },
      'helper-1': { row: ROW, state: 'moved', erasing: false, owner: 'automations', key: 'task-1' },
      'run-2': { row: ROW, state: 'waiting', erasing: false, owner: 'automations', key: 'task-1' },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the 0.58.0 trash code (installed today) reads the new trash safely', () => {
  const { root, dir, make, trash } = home();
  try {
    const run = make('run-1');
    trash.add({ id: run.id, title: 'Run', parts: [run], deletedAt: 1, ...group() });
    trash.addPending({ id: 'run-2', title: 'Waiting', deletedAt: 2, ...group() });
    const piece = trash.addPiece({ ...group(), title: 'Recipe', deletedAt: 1, ownerData: { x: 1 } });
    const before = old.openTrash(dir);
    assert.deepEqual(before.list().map((row) => row.id).sort(), ['run-1', 'run-2'], 'runs as single rows; the piece is not shown');
    assert.equal(before.restore(piece), false, 'nothing put back');
    assert.equal(existsSync(join(dir, piece, 'info.json')), true, 'and nothing removed');
    assert.deepEqual(before.purge(10 * KEEP_MS), ['run-1'], 'its purge removes conversations only');
    assert.equal(existsSync(join(dir, piece)), true, 'never a piece');
    before.addPending({ id: 'run-2', title: 'Waiting', deletedAt: 2 });
    assert.equal(before.pending()[0].id, 'run-2', 'the old code drops the group label but keeps the entry');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
