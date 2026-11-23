/**
 * Stage 6b lab fix (engines-reset problem 1): the Compare page copied Recon's room (and could copy Scratch, the app's
 * data folder) as a "project" and gave one copy to the outside engine. The server's `start` now refuses Recon's room, a
 * folder that holds it, the app's data folder and Devices folders, and the `projects` action tells the page which of
 * its folders it may offer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply } from '../index.js';
import { projectRefusal } from '../lib/projects.js';

function standIn({ room, devices = '' } = {}) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-engines-proj-')));
  let route;
  const isRoom = (path) => Boolean(room) && (path === room || path.startsWith(`${room}/`));
  const services = {
    dshHomePath: (part) => join(home, part),
    agents: { currentInitiator: () => undefined, get: () => undefined },
    recon: room ? { isRoom } : undefined,
    bench: { folderTouchesDevices: (path) => (devices && (path === devices || path.startsWith(`${devices}/`)) ? 'devices' : '') },
    settings: { get: () => ({}) },
  };
  const ctx = {
    get: (name) => services[name],
    logger: { warn() {}, info() {} },
    effect: (make) => make(),
    on: () => () => {},
    inject: (names, use) => {
      if (names.includes('webServer')) use({ webServer: { register: (spec) => { route = spec; return () => {}; } }, connection: { requestRejection: () => undefined }, effect: (make) => make() });
    },
  };
  // Any file that exists stands in for the engine's program: start() is refused before anything runs.
  apply(ctx, { opencodePath: process.execPath, maxMinutes: 1, opencodeModels: [], applyWhen: 'review' });
  const post = async (body) => {
    const req = { method: 'POST', headers: {}, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)); } };
    const res = { statusCode: 200, headers: {}, body: '', setHeader(key, value) { this.headers[key] = value; }, end(text = '') { this.body = String(text); } };
    await route.handler(req, res);
    return { status: res.statusCode, data: JSON.parse(res.body || '{}') };
  };
  return { post, home, done: () => rmSync(home, { recursive: true, force: true }) };
}

test('compare-room-refused: start refuses Recon\'s room, a folder in it, and the temporary folder that holds it', async () => {
  const room = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-recon-test-')));
  mkdirSync(join(room, 'run-1'));
  const app = standIn({ room });
  try {
    for (const project of [room, join(room, 'run-1'), realpathSync(tmpdir())]) {
      const answer = await app.post({ action: 'start', project, task: 'add a file' });
      assert.equal(answer.status, 400, project);
      assert.match(answer.data.error, /Recon's room cannot be compared/);
    }
    const zh = await app.post({ action: 'start', project: room, task: 'add a file', lang: 'zh-CN' });
    assert.match(zh.data.error, /Recon's room cannot be compared/, 'a Chinese page gets the English sentence');
  } finally {
    app.done();
    rmSync(room, { recursive: true, force: true });
  }
});

test('compare-room-refused-recon-off: a room-named folder in the temporary folder is refused without Recon', () => {
  const room = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-recon-off-')));
  try {
    assert.equal(projectRefusal(room, {}), 'room');
    assert.equal(projectRefusal(room, { isRoom: () => { throw new Error('no'); } }), 'room');
  } finally {
    rmSync(room, { recursive: true, force: true });
  }
});

test('compare-home-and-devices-refused: the app data folder (Scratch) and a Devices folder are refused; a project is allowed', async () => {
  const outside = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-engines-outside-')));
  const devices = join(outside, 'bench');
  const project = join(outside, 'project');
  mkdirSync(devices);
  mkdirSync(project);
  const app = standIn({ devices });
  try {
    mkdirSync(join(app.home, 'scratch'), { recursive: true });
    const scratch = await app.post({ action: 'start', project: join(app.home, 'scratch'), task: 'add a file' });
    assert.match(scratch.data.error, /data folder/);
    const dev = await app.post({ action: 'start', project: devices, task: 'add a file' });
    assert.match(dev.data.error, /Devices folder/);
    const listed = await app.post({ action: 'projects', paths: [project, devices, join(app.home, 'scratch'), app.home, '/dev', 'relative', 42] });
    assert.deepEqual(listed.data.allowed, [project]);
  } finally {
    app.done();
    rmSync(outside, { recursive: true, force: true });
  }
});

test('compare-devices-unknown-refused: a Devices answer that is not "" refuses (fail closed)', () => {
  const outside = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-engines-unk-')));
  try {
    assert.equal(projectRefusal(outside, { touchesDevices: () => 'unknown' }), 'unknown');
    assert.equal(projectRefusal(outside, { touchesDevices: () => { throw new Error('x'); } }), 'unknown');
    assert.equal(projectRefusal(outside, { touchesDevices: () => '' }), '');
    assert.equal(projectRefusal('/dev', {}), 'devices');
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});
