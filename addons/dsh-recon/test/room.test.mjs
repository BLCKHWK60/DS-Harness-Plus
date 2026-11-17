// Recon's own folder (the room) in tests: moved to a throwaway folder through DSH_RECON_ROOM, which
// takes only a "dsh-recon-" folder directly in a temporary folder and never the real room under
// another spelling; and a room that turned into a link is never emptied. No network; the app's
// services are stand-ins.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadRecon, sameRoom } from './fixtures/room.mjs';

const { apply, Config, DEFAULT_ROOM, ROOM, dataFolderOf, mayEmptyRoom, roomFor, roomFrom } = await loadRecon();
/** A throwaway room of a copy: never the real room. */
const COPY_ROOM = /^\/private\/tmp\/dsh-recon-copy-[0-9a-f]{12}$/;

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
  // A room asked for that is refused gets a throwaway room of its own, never the real room (17 November 2026).
  for (const bad of ['dsh-recon-a', '/tmp/other', '/tmp/a/dsh-recon-b', '/tmp/dsh-recon-a/../x', '/tmp/./dsh-recon-a', '/tmp/dsh-recon-', '/tmp', homedir(), join(homedir(), 'dsh-recon-a'), '/Users']) {
    assert.match(roomFrom(bad), COPY_ROOM, bad);
  }
  // The real room under another spelling: /tmp is a link to /private/tmp, and the disk does not
  // tell capitals from small letters. Only read here: nothing is started in these folders.
  for (const real of ['/tmp/dsh-recon-room', '/private/tmp/dsh-recon-room', '/private/tmp/dsh-recon-ROOM', '/tmp/dsh-recon-Room/', join(tmpdir(), 'DSH-RECON-ROOM')]) {
    assert.match(roomFrom(real), COPY_ROOM, real);
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
    assert.match(roomFrom(link), COPY_ROOM);
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

test('an app on another data folder gets a room of its own; the real room only for the usual data folder (17 November 2026)', () => {
  const usual = join(homedir(), '.dsh');
  const copy = mkdtempSync(join(tmpdir(), 'dsh-home-copy-'));
  const other = mkdtempSync(join(tmpdir(), 'dsh-home-other-'));
  try {
    assert.equal(roomFrom(undefined, usual), DEFAULT_ROOM);
    assert.equal(roomFrom(undefined, '~/.dsh'), DEFAULT_ROOM);
    assert.equal(roomFrom(undefined, `${usual}/`), DEFAULT_ROOM);
    assert.equal(roomFrom(undefined, ''), DEFAULT_ROOM);
    const room = roomFrom(undefined, copy);
    assert.match(room, /^\/private\/tmp\/dsh-recon-copy-[0-9a-f]{12}$/);
    assert.equal(sameRoom(room, DEFAULT_ROOM), false, 'not the real room');
    assert.equal(roomFrom(undefined, copy), room, 'the same copy keeps its room');
    assert.notEqual(roomFrom(undefined, other), room, 'each copy has its own');
    // A room the copy asks for that is refused, even the real one by name, never falls back to the real room.
    assert.equal(roomFrom('', copy), room);
    for (const refused of ['/tmp/other', '/private/tmp/dsh-recon-room', '/tmp/dsh-recon-Room']) assert.match(roomFrom(refused, copy), COPY_ROOM, refused);
    assert.equal(roomFrom('/tmp/dsh-recon-a', copy), '/tmp/dsh-recon-a', 'a throwaway room asked for still wins');
    // The other add-ons know a Recon room by its name.
    assert.match(room, /^\/private\/tmp\/dsh-recon-[^/]+$/);
  } finally {
    rmSync(copy, { recursive: true, force: true });
    rmSync(other, { recursive: true, force: true });
  }
});

test('the room is chosen from the app\'s data folder when the add-on loads (only loaded here, never started)', () => {
  const copy = mkdtempSync(join(tmpdir(), 'dsh-home-copy-'));
  try {
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', DSH_HOME: copy };
    delete env.DSH_RECON_ROOM;
    const url = new URL('../index.js', import.meta.url).href;
    const room = execFileSync(process.execPath, ['--input-type=module', '-e', `const m = await import(${JSON.stringify(url)}); process.stdout.write(m.ROOM);`], { env, encoding: 'utf8' }).trim();
    assert.equal(room, roomFrom(undefined, copy));
    assert.notEqual(room, DEFAULT_ROOM, 'a copy on its own data folder never takes the real room');
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
});

test('the real room is never emptied while the app runs on another data folder (a second lock)', () => {
  const copy = mkdtempSync(join(tmpdir(), 'dsh-home-copy-'));
  try {
    assert.equal(mayEmptyRoom({ room: DEFAULT_ROOM, dataFolder: copy }), false);
    assert.equal(mayEmptyRoom({ room: DEFAULT_ROOM, dataFolder: join(homedir(), '.dsh') }), true, 'the real app empties its room as before');
    assert.equal(mayEmptyRoom({ room: DEFAULT_ROOM, dataFolder: '' }), true, 'no data folder known: as before');
    assert.equal(mayEmptyRoom({ room: ROOM, dataFolder: copy }), true, 'a room of its own is emptied as before');
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
});

test('the data folder is read as the app reads it, and against the account\'s own home (the independent review, 17 November 2026)', () => {
  const usual = join(homedir(), '.dsh');
  // HOME moved, no DSH_HOME: the app runs on <moved home>/.dsh, so this is a copy.
  const moved = mkdtempSync(join(tmpdir(), 'dsh-moved-home-'));
  const home = process.env.HOME;
  try {
    process.env.HOME = moved;
    assert.equal(dataFolderOf(undefined), join(moved, '.dsh'));
    assert.match(roomFrom(undefined, undefined), COPY_ROOM, 'a moved home folder is a copy');
    assert.match(roomFrom(undefined, '~/.dsh'), COPY_ROOM, '~ is the home the app sees');
  } finally {
    process.env.HOME = home;
    rmSync(moved, { recursive: true, force: true });
  }
  assert.equal(roomFrom(undefined, undefined), DEFAULT_ROOM, 'the usual home again');
  // DSH_HOME is taken as given, as the app takes it: a trailing space is another folder.
  assert.match(roomFrom(undefined, `${usual} `), COPY_ROOM);
  assert.equal(roomFrom(undefined, '   '), DEFAULT_ROOM, 'a blank DSH_HOME counts as not set');
  // A folder that does not exist yet has one room, however /tmp is spelled.
  const later = `dsh-home-later-${process.pid}`;
  assert.equal(roomFrom(undefined, join('/tmp', later, 'home')), roomFrom(undefined, join('/private/tmp', later, 'home')));
});

test('once the app says its data folder, a copy switches to a room of its own (a data folder set another way than DSH_HOME)', () => {
  const copy = mkdtempSync(join(tmpdir(), 'dsh-home-copy-'));
  try {
    assert.match(roomFor({ room: DEFAULT_ROOM, dataFolder: copy }), COPY_ROOM);
    assert.equal(roomFor({ room: DEFAULT_ROOM, dataFolder: copy }), roomFrom(undefined, copy), 'the same room as through DSH_HOME');
    assert.equal(roomFor({ room: DEFAULT_ROOM, dataFolder: join(homedir(), '.dsh') }), DEFAULT_ROOM, 'the real app keeps the real room');
    assert.equal(roomFor({ room: DEFAULT_ROOM, dataFolder: '' }), DEFAULT_ROOM, 'no data folder known: as before');
    assert.equal(roomFor({ room: ROOM, dataFolder: copy }), ROOM, 'a room asked for is kept');
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
});
