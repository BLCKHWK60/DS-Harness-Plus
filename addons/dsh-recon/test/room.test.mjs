// Recon's own folder (the room) in tests: moved to a throwaway folder through DSH_RECON_ROOM, which
// takes only a "dsh-recon-" folder directly in a temporary folder and never the real room under
// another spelling; and a room that turned into a link is never emptied. No network; the app's
// services are stand-ins.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRecon, sameRoom } from './fixtures/room.mjs';

const { apply, Config, DEFAULT_ROOM, ROOM, roomFrom } = await loadRecon();

/** Start Recon on stand-in services; it prepares (empties) its room at once. */
function start() {
  const disposers = [];
  const services = {
    settings: { describe: () => [{ ns: 'modes', value: { extraModes: '{}', sessionIsolated: '{}', defaultMode: 'cowork' } }], mutate: async () => {} },
    modes: { get: () => undefined, isolated: () => false },
    tools: { register: () => () => {} },
    commands: { register: () => () => {} },
    webServer: { register: () => () => {} },
    connection: { requestRejection: () => undefined },
    sessionPersistence: { list: async () => [] },
    sessions: { get: () => undefined },
    workspaceRegistry: { archiveSession: async () => {} },
  };
  const ctx = {
    ...services,
    logger: { warn: () => {}, info: () => {}, error: () => {} },
    effect: (fn) => { const done = fn(); if (typeof done === 'function') disposers.push(done); },
    get: (name) => services[name],
    inject: (_names, callback) => callback(ctx),
    on: () => () => {},
  };
  apply(ctx, Config({ enabled: false }));
  return () => { for (const done of disposers) done(); };
}

test('the room a test asks for is taken only when it is a throwaway folder', () => {
  assert.notEqual(ROOM, DEFAULT_ROOM, 'this test runs in its own room');
  assert.equal(roomFrom(undefined), DEFAULT_ROOM);
  assert.equal(roomFrom(''), DEFAULT_ROOM);
  assert.equal(roomFrom('/tmp/dsh-recon-a'), '/tmp/dsh-recon-a');
  assert.equal(roomFrom('/private/tmp/dsh-recon-a/'), '/private/tmp/dsh-recon-a');
  assert.equal(roomFrom(join(tmpdir(), 'dsh-recon-room-x')), join(tmpdir(), 'dsh-recon-room-x'));
  for (const bad of ['dsh-recon-a', '/tmp/other', '/tmp/a/dsh-recon-b', '/tmp/dsh-recon-a/../x', '/tmp/./dsh-recon-a', '/tmp/dsh-recon-', '/tmp', homedir(), join(homedir(), 'dsh-recon-a'), '/Users']) {
    assert.equal(roomFrom(bad), DEFAULT_ROOM, bad);
  }
  // The real room under another spelling: /tmp is a link to /private/tmp, and the disk does not
  // tell capitals from small letters. Only read here: nothing is started in these folders.
  for (const real of ['/tmp/dsh-recon-room', '/private/tmp/dsh-recon-room', '/private/tmp/dsh-recon-ROOM', '/tmp/dsh-recon-Room/', join(tmpdir(), 'DSH-RECON-ROOM')]) {
    assert.equal(roomFrom(real), DEFAULT_ROOM, real);
  }
});

test('the loader refuses the real room by what the disk says, not by the spelling', () => {
  assert.equal(sameRoom(ROOM, DEFAULT_ROOM), false, 'the throwaway room is another folder');
  assert.equal(sameRoom(DEFAULT_ROOM, DEFAULT_ROOM), true);
  assert.equal(sameRoom('/tmp/dsh-recon-room', DEFAULT_ROOM), true);
  assert.equal(sameRoom('/private/tmp/dsh-recon-ROOM', DEFAULT_ROOM), true);
  // A link with another name to the same folder is the same folder. Shown with throwaway folders.
  const one = mkdtempSync(join(tmpdir(), 'dsh-recon-same-'));
  const other = mkdtempSync(join(tmpdir(), 'dsh-recon-other-'));
  const link = join(tmpdir(), `dsh-recon-alias-${process.pid}`);
  try {
    symlinkSync(one, link);
    assert.equal(sameRoom(link, one), true);
    assert.equal(sameRoom(other, one), false);
    assert.equal(sameRoom(join(tmpdir(), `dsh-recon-missing-${process.pid}`), one), false);
  } finally {
    rmSync(link, { force: true });
    rmSync(one, { recursive: true, force: true });
    rmSync(other, { recursive: true, force: true });
  }
});

test('Recon empties its own room, and never a room that is a link to another folder', () => {
  // Its own room is emptied when it starts.
  writeFileSync(join(ROOM, 'left-over.txt'), 'x');
  mkdirSync(join(ROOM, 'sub'));
  start()();
  assert.equal(existsSync(join(ROOM, 'left-over.txt')), false);
  assert.equal(existsSync(join(ROOM, 'sub')), false);
  assert.equal(existsSync(ROOM), true);

  // A link in /tmp named like a room is not taken.
  const elsewhere = mkdtempSync(join(tmpdir(), 'dsh-recon-elsewhere-'));
  const link = join(tmpdir(), `dsh-recon-link-${process.pid}`);
  try {
    writeFileSync(join(elsewhere, 'keep.txt'), 'mine');
    symlinkSync(elsewhere, link);
    assert.equal(roomFrom(link), DEFAULT_ROOM);
    // The room itself turns into a link after Recon took it: it is left alone, not emptied.
    const moved = `${ROOM}-moved`;
    renameSync(ROOM, moved);
    symlinkSync(elsewhere, ROOM);
    try {
      start()();
      assert.equal(existsSync(join(elsewhere, 'keep.txt')), true, 'the folder the link points to keeps its files');
    } finally {
      rmSync(ROOM, { force: true });
      renameSync(moved, ROOM);
    }
  } finally {
    rmSync(link, { force: true });
    rmSync(elsewhere, { recursive: true, force: true });
  }
});
