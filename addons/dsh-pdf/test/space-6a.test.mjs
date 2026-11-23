/**
 * Item 4A, stage 6a (STAGE6A-DESIGN.md I8): a thread in the Recon space (any mode) saves a PDF page picture only in
 * its own run folder in Recon's room, never in the shared pictures folder; none at all when Recon gives no such folder.
 * Stand-ins for Modes and Recon; the real PDFKit helper draws the page (Mac only).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOM_PAGES_FOLDER, SEALED_NO_PAGE_IMAGE, apply, sealedThread } from '../index.js';
import { makePdf } from './make-pdf.mjs';

const onMac = process.platform === 'darwin' && existsSync('/usr/bin/osascript');

function standIn({ modes, recon } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'dsh-pdf-6a-home-'));
  const tools = {};
  const services = { dshHomePath: (part) => join(home, part), ...(modes === undefined ? {} : { modes }), ...(recon === undefined ? {} : { recon }) };
  const ctx = {
    get: (name) => services[name],
    logger: { warn() {}, info() {} },
    effect: (make) => make(),
    tools: { register: (spec) => { tools[spec.name] = spec; return () => {}; } },
    provide: () => () => {},
    inject: () => {},
  };
  apply(ctx, { enabled: true, folders: [], anywhere: false, readChars: 30000, skills: false, commandName: '' });
  return { home, pages: join(home, 'pdf-reader', 'pages'), tools, done: () => rmSync(home, { recursive: true, force: true }) };
}

const guardFor = (spaces) => ({ guardOf: (id) => ({ top: id, space: spaces[id] ?? 'chat', sealed: spaces[id] === 'recon' }) });

test('sealedThread: no Modes is not sealed; a Modes that throws is sealed; guardOf decides', () => {
  assert.equal(sealedThread(() => undefined, 'a'), false);
  assert.equal(sealedThread(() => ({ guardOf: () => { throw new Error('x'); } }), 'a'), true);
  assert.equal(sealedThread(() => ({ guardOf: () => undefined }), 'a'), true);
  assert.equal(sealedThread(() => guardFor({ a: 'recon' }), 'a'), true);
  assert.equal(sealedThread(() => guardFor({ a: 'recon' }), 'b'), false);
  assert.match(SEALED_NO_PAGE_IMAGE, /Recon/);
});

test('pdf-page-room: a Recon thread\'s page picture lands inside its run folder, never in the shared folder', { skip: !onMac }, async () => {
  const room = mkdtempSync(join(tmpdir(), 'dsh-recon-room-pdf-'));
  const run = join(room, 'run-rr');
  mkdirSync(run);
  makePdf(join(room, 'doc.pdf'), [[{ x: 72, y: 720, text: 'Room page' }]]);
  const recon = { roomFolderOf: (id) => (id === 'rr' ? run : '') };
  const app = standIn({ modes: guardFor({ rr: 'recon' }), recon });
  try {
    const answer = (await app.tools.pdf_page_image.execute({ path: join(room, 'doc.pdf'), page: 1 }, { agent: { id: 'rr', header: { cwd: room } } })).text;
    const made = readdirSync(join(run, ROOM_PAGES_FOLDER));
    assert.equal(made.length, 1, 'the PNG is inside run-<id>');
    assert.ok(answer.includes(join(run, ROOM_PAGES_FOLDER, made[0])), answer);
    assert.match(answer, /End and wipe/);
    assert.deepEqual(existsSync(app.pages) ? readdirSync(app.pages) : [], [], 'nothing in the shared pictures folder');
    assert.deepEqual(readdirSync(room).sort(), ['doc.pdf', 'run-rr'], 'nothing in the shared room root');

    // A Chat thread: the shared pictures folder, as before.
    const chat = (await app.tools.pdf_page_image.execute({ path: join(room, 'doc.pdf'), page: 1 }, { agent: { id: 'ch', header: { cwd: room } } })).text;
    assert.match(chat, /removed after a day/);
    assert.equal(readdirSync(app.pages).length, 1);
  } finally {
    app.done();
    rmSync(room, { recursive: true, force: true });
  }
});

test('pdf-page-room: no run folder from Recon (absent, older, error) or a Modes error: refused, nothing written', async () => {
  const room = mkdtempSync(join(tmpdir(), 'dsh-recon-room-pdf-'));
  makePdf(join(room, 'doc.pdf'), [[{ x: 72, y: 720, text: 'Room page' }]]);
  const apps = [
    standIn({ modes: guardFor({ rr: 'recon' }) }),
    standIn({ modes: guardFor({ rr: 'recon' }), recon: { isRoom: () => true } }),
    standIn({ modes: guardFor({ rr: 'recon' }), recon: { roomFolderOf: () => { throw new Error('read error'); } } }),
    standIn({ modes: { guardOf: () => { throw new Error('read error'); } }, recon: { roomFolderOf: () => '' } }),
  ];
  try {
    for (const app of apps) {
      const answer = (await app.tools.pdf_page_image.execute({ path: join(room, 'doc.pdf'), page: 1 }, { agent: { id: 'rr', header: { cwd: room } } })).text;
      assert.equal(answer, SEALED_NO_PAGE_IMAGE);
      assert.deepEqual(existsSync(app.pages) ? readdirSync(app.pages) : [], []);
      assert.deepEqual(readdirSync(room), ['doc.pdf']);
    }
  } finally {
    for (const app of apps) app.done();
    rmSync(room, { recursive: true, force: true });
  }
});
