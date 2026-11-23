/**
 * Item 4A, stage 6a (STAGE6A-DESIGN.md I8, P4 Diagram): a sealed thread (Recon, any mode) never puts a drawing's title
 * into the shared list (diagrams/index.json) and saves its SVG only inside Recon's room. Stand-ins only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SEALED_NOT_SAVED, apply } from '../index.js';

const spec = { kind: 'flow', title: 'Leak trail', nodes: [{ id: 'a', label: 'Forum post' }, { id: 'b', label: 'Paste site' }], edges: [{ from: 'a', to: 'b' }] };

function standIn({ modes, room = '', recon } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'dsh-diagram-6a-home-'));
  const tools = {};
  const routes = {};
  const cwdOf = {};
  let service;
  const services = {
    dshHomePath: (part) => join(home, part),
    ...(modes === undefined ? {} : { modes }),
    recon: recon ?? {
      isRoom: (folder) => Boolean(room) && String(folder).startsWith(room),
      // Like Recon: a thread working in the room gets its own run-<id> folder; anything else ''.
      roomFolderOf: (id) => (room && cwdOf[id] && String(cwdOf[id]).startsWith(room) ? join(room, `run-${id}`) : ''),
    },
  };
  const ctx = {
    get: (name) => services[name],
    logger: { warn() {}, info() {} },
    effect: (make) => make(),
    tools: { register: (spec_) => { tools[spec_.name] = spec_; return () => {}; } },
    provide: (name, value) => { if (name === 'diagrams') service = value; return () => {}; },
    inject: (_names, use) => use({ webServer: { register: ({ path, handler }) => { routes[path] = handler; return () => {}; } }, connection: { requestRejection: () => undefined }, effect: (make) => make() }),
  };
  apply(ctx, { enabled: true, theme: 'auto', folder: 'diagrams', save: true, skills: false });
  const index = () => (existsSync(join(home, 'diagrams', 'index.json')) ? readFileSync(join(home, 'diagrams', 'index.json'), 'utf8') : '');
  const drawIn = (id, cwd) => {
    cwdOf[id] = cwd;
    return tools.diagram_draw.execute(spec, { agent: { id, header: { cwd } } });
  };
  const list = (session) => {
    const res = { statusCode: 200, headers: {}, body: '', setHeader() {}, end(body) { this.body = String(body ?? ''); } };
    const path = Object.keys(routes).find((one) => one.endsWith('/list'));
    routes[path]({ method: 'GET', headers: { 'x-dsh-session': session, 'x-dsh-from': '0', 'x-dsh-to': String(Date.now() + 1000) } }, res);
    return JSON.parse(res.body).items;
  };
  return { home, index, drawIn, list, show: (...args) => service.show(...args), done: () => rmSync(home, { recursive: true, force: true }) };
}

const guardFor = (spaces) => ({ guardOf: (id) => ({ top: id, space: spaces[id] ?? 'chat', sealed: spaces[id] === 'recon', reconSpace: spaces[id] === 'recon', guardedBy: '' }), isolated: (id) => spaces[id] === 'recon' });

test('diagram-sealed-no-index: Research in Recon outside the room: drawn, not saved, no title in the shared list', async () => {
  const work = mkdtempSync(join(tmpdir(), 'dsh-diagram-6a-work-'));
  const app = standIn({ modes: guardFor({ rr: 'recon', ch: 'chat' }) });
  try {
    const answer = await app.drawIn('rr', work);
    assert.match(answer.text, new RegExp(SEALED_NOT_SAVED.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(existsSync(join(work, 'diagrams')), false, 'no file outside the room');
    assert.doesNotMatch(app.index(), /Leak trail/, 'no title in diagrams/index.json');
    assert.equal(app.list('rr').length, 1, 'still shown in the chat (memory only)');
    // A Chat thread: as before.
    await app.drawIn('ch', work);
    assert.match(app.index(), /Leak trail/);
    assert.equal(readdirSync(join(work, 'diagrams')).length, 1);
    assert.match(SEALED_NOT_SAVED, /Recon/);
  } finally {
    app.done();
    rmSync(work, { recursive: true, force: true });
  }
});

test('diagram-sealed-no-index: in Recon\'s room the file is saved there, and the list still stays memory-only', async () => {
  const room = mkdtempSync(join(tmpdir(), 'dsh-recon-room-6a-'));
  const run = join(room, 'run-rr');
  mkdirSync(run);
  const app = standIn({ modes: guardFor({ rr: 'recon' }), room });
  try {
    // A Recon thread's folder is the room itself; the file goes under its own run-<id> (End and wipe deletes it).
    const answer = await app.drawIn('rr', room);
    assert.doesNotMatch(answer.text, /Not saved/);
    assert.equal(readdirSync(join(run, 'diagrams')).length, 1, 'saved in the thread\'s run folder');
    assert.equal(existsSync(join(room, 'diagrams')), false, 'never in the shared room root');
    assert.doesNotMatch(app.index(), /Leak trail/);
    // The service other add-ons use (Data's charts): memory only for a sealed thread too.
    assert.equal(app.show({ id: 'rr' }, { title: 'Sealed chart', description: { ...spec, title: 'Sealed chart' } }).ok, true);
    assert.doesNotMatch(app.index(), /Sealed chart/);
  } finally {
    app.done();
    rmSync(room, { recursive: true, force: true });
  }
});

test('a Modes that throws counts as sealed; no Modes at all saves as today', async () => {
  const work = mkdtempSync(join(tmpdir(), 'dsh-diagram-6a-work-'));
  const broken = standIn({ modes: { guardOf: () => { throw new Error('read error'); } } });
  const none = standIn();
  try {
    assert.match((await broken.drawIn('x', work)).text, /Not saved as a file/);
    assert.doesNotMatch(broken.index(), /Leak trail/);
    await none.drawIn('x', work);
    assert.match(none.index(), /Leak trail/);
  } finally {
    broken.done();
    none.done();
    rmSync(work, { recursive: true, force: true });
  }
});

test('diagram-run-folder: a sealed thread in the room whose run folder Recon cannot give saves nothing', async () => {
  const room = mkdtempSync(join(tmpdir(), 'dsh-recon-room-6a-'));
  // An older Recon (isRoom only, no roomFolderOf), and a Recon that throws: not saved, nothing in the room root.
  const older = standIn({ modes: guardFor({ rr: 'recon' }), room, recon: { isRoom: () => true } });
  const broken = standIn({ modes: guardFor({ rr: 'recon' }), room, recon: { isRoom: () => true, roomFolderOf: () => { throw new Error('read error'); } } });
  try {
    for (const app of [older, broken]) {
      const answer = await app.drawIn('rr', room);
      assert.match(answer.text, /Not saved as a file/);
      assert.deepEqual(readdirSync(room), [], 'the room stays empty');
    }
  } finally {
    older.done();
    broken.done();
    rmSync(room, { recursive: true, force: true });
  }
});
